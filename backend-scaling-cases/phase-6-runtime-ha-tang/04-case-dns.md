# Case 4: DNS — 5 phút gián đoạn kéo dài thành 5 giờ

DNS là thứ ít ai nghĩ tới cho tới khi nó gây sự cố. Và khi nó gây sự cố, triệu chứng luôn khó hiểu:

```text
   ├─ Một pod gọi được service, pod khác không gọi được
   ├─ Database failover xong 5 phút mà ứng dụng vẫn nối tới node cũ
   ├─ Latency thỉnh thoảng tăng thêm đúng 5 giây, không rõ vì sao
   ├─ Thêm instance mới nhưng traffic không tự chia sang
   └─ "It's always DNS" — câu đùa kinh điển của giới vận hành
```

Bài này giải thích ba vấn đề DNS phổ biến nhất trong ứng dụng Java trên Kubernetes.

## Vấn đề 1: JVM cache DNS vĩnh viễn

Đây là cạm bẫy nghiêm trọng nhất, và rất ít người biết.

```text
   JVM có cache DNS riêng, ĐỘC LẬP với hệ điều hành.

   networkaddress.cache.ttl
   ├─ Nếu có Security Manager  : mặc định -1  = CACHE VĨNH VIỄN
   └─ Nếu không                : mặc định 30 giây

   networkaddress.cache.negative.ttl
   └─ Mặc định 10 giây (cache kết quả THẤT BẠI)
```

Giá trị `-1` nghĩa là: một khi JVM phân giải được `db.example.com → 10.0.1.5`, nó **không bao giờ hỏi lại** cho tới khi tiến trình khởi động lại.

```text
   Kịch bản thảm hoạ:

   10:00  Ứng dụng khởi động, phân giải db.example.com → 10.0.1.5
   14:00  Database chính hỏng, hệ thống tự failover
   14:01  DNS được cập nhật: db.example.com → 10.0.1.9
   14:01  Mọi client khác chuyển sang node mới bình thường
   14:01  ỨNG DỤNG JAVA VẪN KẾT NỐI TỚI 10.0.1.5 (node đã chết)
   14:01  Toàn bộ query thất bại

   Sự cố database: 5 phút.
   Sự cố ứng dụng: cho tới khi ai đó nghĩ ra việc restart — thường là hàng giờ.
```

### Cách sửa

```java
// Đặt SỚM NHẤT có thể — trước khi bất kỳ kết nối mạng nào được tạo
public static void main(String[] args) {
    java.security.Security.setProperty("networkaddress.cache.ttl", "30");
    java.security.Security.setProperty("networkaddress.cache.negative.ttl", "5");
    SpringApplication.run(Application.class, args);
}
```

Hoặc qua file cấu hình:

```properties
# $JAVA_HOME/conf/security/java.security
networkaddress.cache.ttl=30
networkaddress.cache.negative.ttl=5
```

Hoặc biến môi trường (cách tiện nhất trong container):

```yaml
env:
  - name: JAVA_TOOL_OPTIONS
    value: "-Dsun.net.inetaddr.ttl=30 -Dsun.net.inetaddr.negative.ttl=5"
```

> Lưu ý: `sun.net.inetaddr.ttl` là thuộc tính hệ thống không chính thức nhưng hoạt động. Cách chính thức là `networkaddress.cache.ttl` trong `java.security`. Nếu cả hai cùng có, `networkaddress.cache.ttl` thắng.

**Vì sao 30 giây?** Đủ ngắn để phản ứng với failover, đủ dài để không tạo tải DNS quá lớn. Với hệ thống có failover thường xuyên, giảm xuống 5-10 giây.

### Đừng quên negative TTL

```text
   negative.ttl mặc định 10 giây: nếu phân giải THẤT BẠI, JVM nhớ
   kết quả thất bại đó 10 giây.

   Kịch bản: service mới vừa được tạo, DNS chưa kịp lan truyền.
   Ứng dụng thử gọi → thất bại → cache "không tồn tại" 10 giây
   → thử lại trong 10 giây đó vẫn thất bại ngay, dù DNS đã sẵn sàng.
```

Với môi trường động (Kubernetes, autoscaling), đặt `negative.ttl` xuống 0-5 giây.

## Vấn đề 2: `ndots:5` trong Kubernetes

Đây là nguyên nhân của rất nhiều "latency tăng bí ẩn 5 giây".

Kubernetes tự động cấu hình `/etc/resolv.conf` trong pod:

```text
search default.svc.cluster.local svc.cluster.local cluster.local
nameserver 10.96.0.10
options ndots:5
```

**`ndots:5`** nghĩa là: nếu tên miền có **ít hơn 5 dấu chấm**, hãy thử ghép nó với từng hậu tố trong danh sách `search` trước, rồi mới thử như tên tuyệt đối.

```text
   Gọi tới "api.github.com" (2 dấu chấm < 5):

   1. api.github.com.default.svc.cluster.local  → NXDOMAIN
   2. api.github.com.svc.cluster.local          → NXDOMAIN
   3. api.github.com.cluster.local              → NXDOMAIN
   4. api.github.com                            → ✓ thành công

   ⇒ 4 lượt truy vấn thay vì 1.
   ⇒ Và mỗi lượt thường là 2 truy vấn (A và AAAA) → 8 truy vấn!
```

Với dịch vụ gọi ra ngoài nhiều, đây là tải khổng lồ lên CoreDNS, và mỗi lời gọi thêm vài mili-giây.

Tệ hơn: nếu CoreDNS quá tải và một truy vấn UDP bị mất, client chờ **5 giây** (timeout DNS mặc định) trước khi thử lại. Đây chính là nguồn của những đỉnh latency đúng 5 giây.

### Cách sửa

**Cách 1 — Dùng FQDN có dấu chấm cuối** (tốt nhất cho tên ngoài):

```yaml
# Dấu chấm ở cuối = tên tuyệt đối, bỏ qua toàn bộ search domain
payment:
  url: https://api.partner.com./v1/charge
                             ↑ dấu chấm này
```

Một ký tự, loại bỏ 3 truy vấn thừa.

**Cách 2 — Giảm `ndots` cho pod**:

```yaml
spec:
  dnsConfig:
    options:
      - name: ndots
        value: "2"
```

Cẩn thận: nếu code của bạn gọi service nội bộ bằng tên ngắn (`payment-service`, 0 dấu chấm), giảm `ndots` quá thấp sẽ làm tên ngắn không phân giải được. Với `ndots:2`, tên `payment-service` (0 chấm) vẫn dùng search domain — vẫn hoạt động.

**Cách 3 — Dùng tên đầy đủ cho service nội bộ**:

```text
   Thay vì: payment-service
   Dùng:    payment-service.default.svc.cluster.local.
```

Rườm rà nhưng chính xác nhất — không có truy vấn thừa nào.

**Cách 4 — NodeLocal DNSCache**:

Triển khai một DNS cache chạy trên mỗi node. Pod hỏi cache cục bộ (qua giao diện loopback, cực nhanh) thay vì hỏi CoreDNS qua mạng.

```text
   Trước: Pod → (mạng) → CoreDNS → upstream
   Sau:   Pod → (loopback) → NodeLocal DNS → CoreDNS → upstream

   ⇒ Giảm mạnh tải CoreDNS, loại bỏ vấn đề mất gói UDP,
     và dùng TCP cho truy vấn upstream (đáng tin hơn UDP).
```

Đây là giải pháp được khuyến nghị cho mọi cụm Kubernetes có tải cao.

## Vấn đề 3: DNS round-robin và tải không đều

```text
   api.internal.com phân giải ra 3 IP: 10.0.1.1, 10.0.1.2, 10.0.1.3

   JVM: InetAddress.getByName() trả về IP ĐẦU TIÊN trong danh sách
   ⇒ Mọi kết nối đi tới 10.0.1.1
   ⇒ Hai IP kia rảnh rỗi
```

Thêm vào đó: nếu client dùng keep-alive (như mọi connection pool), kết nối **dính chặt** vào IP đầu tiên và không bao giờ chuyển — kể cả khi bạn thêm instance mới.

```text
   Bạn thêm 3 instance mới → DNS có 6 IP
   → Traffic hiện tại VẪN đi vào 3 instance cũ
   → Instance mới rảnh rỗi cho tới khi có kết nối mới được tạo
```

### Cách sửa

| Cách | Mô tả | Phù hợp |
|---|---|---|
| **Load balancer** thay DNS round-robin | LB phân phối thật sự | Cách đúng nhất |
| Đặt `max-lifetime` cho connection pool | Kết nối định kỳ được tạo lại → phân bố lại | Bổ sung tốt |
| Client-side load balancing | Client tự lấy danh sách IP và chia | Spring Cloud LoadBalancer, gRPC |
| Service mesh | Sidecar lo việc phân phối | Istio, Linkerd |

Trong Kubernetes, `Service` kiểu ClusterIP đã lo việc phân phối ở tầng iptables/IPVS — không có vấn đề này. Nhưng `headless Service` (`clusterIP: None`) trả về danh sách IP trực tiếp và **có** vấn đề này.

```yaml
# Nhớ đặt max-lifetime để kết nối được phân bố lại định kỳ
spring:
  datasource:
    hikari:
      max-lifetime: 1200000        # 20 phút
```

## Vấn đề 4: CoreDNS quá tải

```text
   Triệu chứng:
   ├─ Latency tăng đột biến đúng 5 giây (timeout DNS)
   ├─ Lỗi UnknownHostException ngẫu nhiên
   ├─ Chỉ xảy ra lúc traffic cao
   └─ Restart pod thì hết... một lúc
```

```promql
# Số truy vấn DNS
rate(coredns_dns_requests_total[5m])

# Latency của CoreDNS
histogram_quantile(0.99, rate(coredns_dns_request_duration_seconds_bucket[5m]))

# Lỗi
rate(coredns_dns_responses_total{rcode="SERVFAIL"}[5m])
```

Giải pháp theo thứ tự:

1. **Giảm số truy vấn**: sửa `ndots`, dùng FQDN, tăng `networkaddress.cache.ttl` (nhưng đừng đặt -1!).
2. **NodeLocal DNSCache** — giảm tải lớn nhất.
3. **Tăng replica CoreDNS** và cấu hình `cache` plugin.
4. **Autoscale CoreDNS** theo số node/pod.

```text
# Corefile của CoreDNS — bật cache
.:53 {
    cache 30              # cache 30 giây
    forward . /etc/resolv.conf {
        max_concurrent 1000
    }
}
```

## Chẩn đoán DNS

```bash
# Kiểm tra phân giải từ trong pod
kubectl exec -it <pod> -- nslookup payment-service
kubectl exec -it <pod> -- cat /etc/resolv.conf

# Đo thời gian phân giải
kubectl exec -it <pod> -- sh -c 'time nslookup api.partner.com'

# Xem JVM đang cache gì (cần bật JMX hoặc dùng debugger)
# Đơn giản hơn: bật log
-Djava.security.debug=all
```

Kiểm tra nhanh JVM có cache vĩnh viễn không:

```java
@RestController
public class DiagnosticController {
    @GetMapping("/diag/dns")
    public Map<String, String> dnsConfig() {
        return Map.of(
            "cache.ttl", java.security.Security.getProperty("networkaddress.cache.ttl"),
            "negative.ttl", java.security.Security.getProperty("networkaddress.cache.negative.ttl")
        );
    }
}
```

Nếu kết quả là `-1`, bạn có một quả bom hẹn giờ.

## Trường hợp thực tế: failover RDS mất 3 giờ

Bối cảnh: ứng dụng Spring Boot trên EC2, database AWS RDS Multi-AZ.

**Diễn biến**:

```text
   02:14  AWS thực hiện bảo trì, RDS failover sang standby.
   02:14  Endpoint DNS được cập nhật trỏ sang IP mới. TTL của RDS là 5 giây.
   02:15  Failover hoàn tất. Mọi client khác kết nối bình thường.
   02:15  Ứng dụng Java: 100% query thất bại.
          "Connection refused" tới IP cũ.
   02:20  Cảnh báo nổ. Kỹ sư trực vào xem.
   03:40  Kiểm tra RDS: khoẻ. Kiểm tra mạng: thông. Không hiểu vì sao.
   05:10  Ai đó thử restart ứng dụng → HOẠT ĐỘNG NGAY.
   05:30  Điều tra sâu, phát hiện Security Manager đang bật
          → networkaddress.cache.ttl = -1 → cache vĩnh viễn.
```

**Sự cố database: 1 phút. Sự cố ứng dụng: 3 giờ.**

**Sửa**:

```yaml
env:
  - name: JAVA_TOOL_OPTIONS
    value: "-Dsun.net.inetaddr.ttl=15 -Dsun.net.inetaddr.negative.ttl=0"
```

```yaml
# Và giảm max-lifetime để kết nối cũ được thay thế nhanh
spring:
  datasource:
    hikari:
      max-lifetime: 600000       # 10 phút
      keepalive-time: 120000     # kiểm tra kết nối còn sống mỗi 2 phút
```

**Diễn tập lại sau khi sửa**: failover thủ công lúc 14:00, ứng dụng tự phục hồi sau **22 giây** mà không cần can thiệp.

Bài học rộng hơn: **hãy diễn tập failover**. Nếu chưa từng thử, bạn không biết ứng dụng của mình phản ứng thế nào — và 3 giờ sáng không phải lúc để tìm hiểu.

## Checklist DNS

```text
□ networkaddress.cache.ttl đã đặt (KHÔNG phải -1)?
□ networkaddress.cache.negative.ttl ngắn (0-5 giây)?
□ Đã kiểm tra giá trị THỰC TẾ trong runtime chưa?
□ Tên miền ngoài có dùng FQNS (dấu chấm cuối) không?
□ ndots đã xem xét chưa?
□ Có NodeLocal DNSCache không?
□ connection pool có max-lifetime không?
□ Đã diễn tập failover database chưa?
□ Có giám sát latency và lỗi DNS không?
```

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| `networkaddress.cache.ttl = -1` | Không bao giờ thấy IP mới sau failover |
| Đặt thuộc tính DNS quá muộn (sau khi đã kết nối) | Không có tác dụng |
| Không đặt `negative.ttl` | Service mới không gọi được trong 10 giây đầu |
| Bỏ qua `ndots:5` | Tải DNS gấp 4-8 lần, latency thêm |
| Không có `max-lifetime` cho pool | Kết nối dính vào IP cũ mãi mãi |
| Dựa vào DNS round-robin để cân tải | Tải không đều, instance mới không nhận traffic |
| Không giám sát CoreDNS | Đỉnh latency 5 giây không giải thích được |
| Chưa từng diễn tập failover | Phát hiện vấn đề lúc 3 giờ sáng |

## Tóm tắt case 4

- **JVM có cache DNS riêng**, và với Security Manager bật thì mặc định là **vĩnh viễn (-1)**.
- Hậu quả: database failover xong mà ứng dụng vẫn nối tới IP cũ **cho tới khi restart**.
- Đặt `networkaddress.cache.ttl = 30` và `negative.ttl = 0-5`, **kiểm tra giá trị thực tế trong runtime**.
- **`ndots:5`** của Kubernetes làm mỗi tên miền ngoài tốn 4-8 truy vấn — dùng **FQDN có dấu chấm cuối**.
- Mất gói UDP trong truy vấn DNS gây **đỉnh latency đúng 5 giây**.
- **NodeLocal DNSCache** là giải pháp hiệu quả nhất cho cụm tải cao.
- Đặt **`max-lifetime`** cho connection pool để kết nối được phân bố lại sau khi topology đổi.
- **Diễn tập failover** — đó là cách duy nhất biết ứng dụng phản ứng ra sao.

**Bài kế tiếp** → [Case 5: Logging chặn thread — khi việc ghi log giết hệ thống](05-case-logging-chan-thread.md)

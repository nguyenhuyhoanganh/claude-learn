# Case 3: Cạn port và file descriptor — giới hạn không ai nghĩ tới

```text
java.net.BindException: Cannot assign requested address
java.net.SocketException: Too many open files
```

Hai lỗi này xuất hiện đột ngột trên hệ thống đã chạy ổn định nhiều tháng, thường vào lúc traffic cao nhất. Chúng không phải lỗi code — chúng là giới hạn của hệ điều hành mà không ai để ý cho tới khi chạm phải.

## Phần 1: Cạn ephemeral port

### Cơ chế

Mỗi kết nối TCP được xác định duy nhất bởi bốn thành phần:

```text
   (IP nguồn, port nguồn, IP đích, port đích)
```

Khi ứng dụng của bạn **gọi ra ngoài**, hệ điều hành tự chọn một port nguồn từ dải **ephemeral port** (port tạm thời):

```bash
sysctl net.ipv4.ip_local_port_range
# 32768 60999   → chỉ có 28.232 port khả dụng
```

```text
   Gọi tới CÙNG một đích (IP + port):
   ⇒ IP nguồn cố định, IP đích cố định, port đích cố định
   ⇒ CHỈ port nguồn thay đổi
   ⇒ Tối đa 28.232 kết nối đồng thời tới đích đó
```

Nghe có vẻ nhiều. Nhưng vấn đề nằm ở trạng thái `TIME_WAIT`.

### TIME_WAIT — thủ phạm thật sự

```text
   Khi đóng kết nối TCP, bên ĐÓNG TRƯỚC phải giữ port ở trạng thái
   TIME_WAIT trong 2×MSL (Maximum Segment Lifetime) = 60 giây trên Linux.

   Vì sao? Để nuốt các gói tin đến muộn của kết nối cũ,
   tránh chúng lẫn vào một kết nối mới dùng lại cùng port.
```

```text
   Ứng dụng gọi 1.000 request/giây tới payment-service,
   mỗi request mở và đóng một kết nối mới:

   1.000 kết nối/giây × 60 giây TIME_WAIT = 60.000 port bị giữ
   Chỉ có 28.232 port khả dụng
   ⇒ CẠN PORT sau ~28 giây
   ⇒ BindException: Cannot assign requested address
```

Đây là lý do vì sao lỗi này xuất hiện "đột ngột": nó phụ thuộc vào **tốc độ mở kết nối mới**, không phụ thuộc số kết nối đồng thời.

### Chẩn đoán

```bash
# Đếm kết nối theo trạng thái
ss -ant | awk '{print $1}' | sort | uniq -c | sort -rn
```

```text
  48213 TIME-WAIT       ← rất cao = có vấn đề
   1204 ESTAB
     87 SYN-SENT
```

```bash
# Xem TIME_WAIT tập trung vào đích nào
ss -ant state time-wait | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head

# Đếm số port đang dùng
cat /proc/net/sockstat
```

```bash
# Kiểm tra dải port và thời gian TIME_WAIT
sysctl net.ipv4.ip_local_port_range
sysctl net.ipv4.tcp_fin_timeout
```

### Giải pháp

**1. Dùng connection pool với keep-alive — giải pháp gốc rễ**

```java
PoolingHttpClientConnectionManager cm = PoolingHttpClientConnectionManagerBuilder
    .create()
    .setMaxConnTotal(200)
    .setMaxConnPerRoute(50)
    .build();

CloseableHttpClient client = HttpClients.custom()
    .setConnectionManager(cm)
    .evictIdleConnections(TimeValue.ofSeconds(30))
    .setKeepAliveStrategy((response, context) -> TimeValue.ofSeconds(30))
    .build();
```

```text
   Không pool: 1.000 kết nối mới/giây → 60.000 TIME_WAIT
   Có pool 50: 50 kết nối được TÁI SỬ DỤNG → ~0 TIME_WAIT

   ⇒ Giảm 100%. Đây là giải pháp đúng, các cách khác chỉ là vá.
```

Đây cũng là lý do phase-2 case 3 nhấn mạnh việc cấu hình connection pool cho HTTP client. Không có pool, bạn vừa chậm (bắt tay TCP mỗi lần) vừa cạn port.

**2. Mở rộng dải port**

```bash
sysctl -w net.ipv4.ip_local_port_range="10000 65535"    # 55.535 port
```

Chỉ nới trần lên gấp đôi — không giải quyết gốc rễ, nhưng mua thêm thời gian.

**3. Bật `tcp_tw_reuse`**

```bash
sysctl -w net.ipv4.tcp_tw_reuse=1
```

Cho phép **tái sử dụng** port ở trạng thái TIME_WAIT cho kết nối **đi ra** mới, nếu timestamp cho thấy an toàn. Đây là cách được khuyến nghị.

> **Cảnh báo**: `net.ipv4.tcp_tw_recycle` (khác một chữ) đã bị **xoá khỏi Linux 4.12** vì gây lỗi nghiêm trọng với client sau NAT. Nếu bạn thấy nó trong tài liệu cũ, **đừng dùng**. Chỉ dùng `tcp_tw_reuse`.

**4. Kết nối tới nhiều đích khác nhau**

Nếu đích có nhiều IP (qua DNS round-robin hoặc nhiều instance sau load balancer), mỗi IP đích cho bạn một dải port riêng — vì bộ bốn thành phần khác nhau.

**5. Dùng Unix domain socket** khi giao tiếp trong cùng máy (ví dụ tới sidecar) — không tốn port nào.

## Phần 2: Cạn file descriptor

### Cơ chế

**File descriptor (fd)** — số nguyên hệ điều hành cấp cho mỗi thứ tiến trình mở: file, socket, pipe, epoll instance.

```bash
ulimit -n
# 1024        ← mặc định trên nhiều hệ thống — QUÁ THẤP
```

```text
   Tomcat max-connections = 8192  → cần 8192 fd chỉ cho kết nối vào
   + connection pool DB (20)
   + connection pool HTTP (200)
   + file log đang mở
   + JAR files
   + epoll, eventfd nội bộ

   Với ulimit 1024: cạn từ rất sớm
   ⇒ java.net.SocketException: Too many open files
```

Điều nguy hiểm: khi cạn fd, **mọi thứ** đều hỏng — không mở được file log, không nhận được kết nối mới, không kết nối được database. Ứng dụng vào trạng thái không thể phục hồi.

### Chẩn đoán

```bash
# Số fd đang dùng của tiến trình
ls /proc/<pid>/fd | wc -l

# Giới hạn hiện tại
cat /proc/<pid>/limits | grep "open files"

# Phân loại fd đang mở
ls -l /proc/<pid>/fd | awk '{print $11}' | sort | uniq -c | sort -rn | head
```

```text
   7823 socket:[...]        ← chủ yếu là socket
    142 /app/logs/app.log
     87 /app/lib/*.jar
```

```bash
# Toàn hệ thống
sysctl fs.file-nr
# 25632  0  6553600
#   ↑ đang dùng   ↑ trần
```

Metric để giám sát:

```promql
process_open_fds / process_max_fds > 0.8
```

Đây là cảnh báo nên có ở mọi service — nó phát hiện rò rỉ fd trước khi ứng dụng chết.

### Giải pháp

**1. Tăng giới hạn**

```yaml
# Kubernetes — thường phải đặt ở tầng node hoặc dùng initContainer
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      initContainers:
        - name: set-limits
          image: busybox
          command: ["sh", "-c", "ulimit -n 65535"]
          securityContext:
            privileged: true
```

```ini
# systemd service
[Service]
LimitNOFILE=65535
```

```ini
# /etc/security/limits.conf
appuser soft nofile 65535
appuser hard nofile 65535
```

Trong container hiện đại, giới hạn thường được kế thừa từ container runtime. Kiểm tra thực tế bằng `cat /proc/1/limits` bên trong container thay vì giả định.

**2. Tìm và sửa rò rỉ fd**

Rò rỉ fd gần như luôn do **quên đóng tài nguyên**:

```java
// SAI — nếu có exception, stream không bao giờ đóng
InputStream is = new FileInputStream(file);
process(is);
is.close();

// ĐÚNG
try (InputStream is = new FileInputStream(file)) {
    process(is);
}
```

Nguồn rò rỉ hay gặp trong ứng dụng Java:

| Nguồn | Cách sửa |
|---|---|
| `InputStream`/`OutputStream` không đóng | try-with-resources |
| `HttpURLConnection` không `disconnect()` | Dùng client có pool |
| Response HTTP không đọc hết body | Luôn đóng response, kể cả khi không cần body |
| `Files.list()`, `Files.walk()` (trả về Stream) | try-with-resources — **rất hay bị quên** |
| Connection JDBC lấy thủ công | try-with-resources, hoặc để pool quản lý |
| `Socket` tự tạo | try-with-resources |

`Files.list()` đáng nhấn mạnh: nó trả về `Stream` giữ một fd mở. Nếu không đóng, mỗi lần gọi rò một fd — và trong một vòng lặp, bạn cạn fd trong vài phút.

```java
// SAI — rò fd
Files.list(dir).forEach(this::process);

// ĐÚNG
try (Stream<Path> paths = Files.list(dir)) {
    paths.forEach(this::process);
}
```

## Phần 3: Các giới hạn ẩn khác

Cùng họ — những trần cứng ở tầng hệ điều hành mà ứng dụng không nhìn thấy:

### Conntrack table

Linux theo dõi mỗi kết nối trong bảng `conntrack` (dùng bởi iptables/NAT — nghĩa là **mọi cụm Kubernetes**).

```bash
sysctl net.netfilter.nf_conntrack_count
sysctl net.netfilter.nf_conntrack_max
```

```text
   Bảng đầy → kết nối mới bị DROP ÂM THẦM
   → Không có lỗi, không có log, chỉ là timeout bí ẩn
   → dmesg: "nf_conntrack: table full, dropping packet"
```

Đây là một trong những lỗi khó chẩn đoán nhất, vì triệu chứng duy nhất là timeout ngẫu nhiên.

```bash
sysctl -w net.netfilter.nf_conntrack_max=1048576
sysctl -w net.netfilter.nf_conntrack_tcp_timeout_established=3600   # mặc định 5 ngày!
```

Tham số thứ hai đáng chú ý: mặc định Linux giữ mục conntrack cho kết nối đã thiết lập trong **5 ngày**. Với hệ thống nhiều kết nối ngắn, giảm xuống 1 giờ giải phóng rất nhiều chỗ.

### Số thread tối đa

```bash
cat /proc/sys/kernel/threads-max
ulimit -u                                # số tiến trình/thread mỗi user
cat /proc/<pid>/limits | grep processes
```

```text
   java.lang.OutOfMemoryError: unable to create new native thread
```

Lỗi này **không phải** hết heap — nó là hết khả năng tạo thread ở tầng hệ điều hành. Nguyên nhân: quá nhiều thread (`newCachedThreadPool` không giới hạn — phase-2 case 7) hoặc `ulimit -u` quá thấp.

Trong container, còn có `pids.max` của cgroup:

```bash
cat /sys/fs/cgroup/pids.max
```

### Backlog của socket

```bash
sysctl net.core.somaxconn        # mặc định 4096 trên Linux hiện đại
```

Đây là trần cứng cho `accept-count` của Tomcat (phase-1 bài 2). Đặt `accept-count: 10000` mà `somaxconn` là 4096 thì giá trị thật là 4096.

```bash
# Xem hàng đợi accept có bị tràn không
netstat -s | grep -i "listen"
# 1523 times the listen queue of a socket overflowed   ← có tràn!
```

### Bộ nhớ đệm mạng

```bash
sysctl net.core.rmem_max
sysctl net.core.wmem_max
sysctl net.ipv4.tcp_rmem
```

Với kết nối băng thông cao độ trễ lớn (truyền dữ liệu giữa các vùng địa lý), bộ đệm mặc định có thể là nút thắt.

## Cấu hình hệ thống khuyến nghị

```bash
# /etc/sysctl.d/99-tuning.conf

# Ephemeral port
net.ipv4.ip_local_port_range = 10000 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 30

# File descriptor
fs.file-max = 2097152

# Backlog
net.core.somaxconn = 32768
net.ipv4.tcp_max_syn_backlog = 8192

# Conntrack
net.netfilter.nf_conntrack_max = 1048576
net.netfilter.nf_conntrack_tcp_timeout_established = 3600

# Keepalive — phát hiện kết nối chết nhanh hơn (mặc định 2 giờ!)
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 5
```

Nhóm cuối cùng liên quan trực tiếp tới phase-2 case 3: mặc định Linux mất **2 giờ 11 phút** để phát hiện kết nối chết. Với cấu hình trên, còn **7,5 phút**. Vẫn dài, nên timeout ở tầng ứng dụng vẫn bắt buộc — nhưng đây là lưới an toàn tốt hơn nhiều.

## Trường hợp thực tế: lỗi mỗi thứ Sáu lúc 14 giờ

Bối cảnh: hệ thống báo cáo, lỗi `BindException` mỗi thứ Sáu khoảng 14 giờ, kéo dài 20 phút rồi tự khỏi.

**Điều tra**:

```text
   14:00 thứ Sáu: job đối soát tuần chạy
   → Gọi API đối tác 45.000 lần trong 15 phút
   → Mỗi lần dùng: new RestTemplate()   ← tạo mới mỗi lần!
   → Mỗi RestTemplate mở kết nối mới, không tái sử dụng

   45.000 kết nối / 900 giây = 50 kết nối/giây
   × 60 giây TIME_WAIT = 3.000 port... nghe không nhiều?
```

Nhưng đo thực tế cho thấy `TIME_WAIT` lên tới 51.000. Nguyên nhân bổ sung: mỗi lần gọi API đối tác, ứng dụng còn gọi 3 dịch vụ nội bộ khác, cũng bằng `RestTemplate` mới. Tổng cộng 180.000 kết nối trong 15 phút.

**Sửa**:

```java
// Trước: tạo mới trong method
public Report fetch(String id) {
    RestTemplate rt = new RestTemplate();      // SAI
    return rt.getForObject(url, Report.class);
}

// Sau: một bean dùng chung, có connection pool
@Bean
public RestTemplate partnerRestTemplate() {
    var cm = PoolingHttpClientConnectionManagerBuilder.create()
        .setMaxConnTotal(100)
        .setMaxConnPerRoute(50)
        .build();
    var client = HttpClients.custom()
        .setConnectionManager(cm)
        .evictIdleConnections(TimeValue.ofSeconds(30))
        .build();
    return new RestTemplate(new HttpComponentsClientHttpRequestFactory(client));
}
```

**Kết quả**:

| Chỉ số | Trước | Sau |
|---|---|---|
| TIME_WAIT lúc cao điểm | 51.000 | **340** |
| Thời gian chạy job | 15 phút | **4 phút** |
| Lỗi BindException | Mỗi tuần | **0** |

Thời gian job giảm 4 lần chỉ nhờ không phải bắt tay TCP 180.000 lần. Đây là lợi ích kép của connection pool mà nhiều người không tính tới.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| `new RestTemplate()` trong method | Cạn port, chậm |
| Không đặt `ulimit -n` trong container | `Too many open files` ở tải cao |
| Dùng `tcp_tw_recycle` | Đã bị xoá khỏi kernel; gây lỗi với NAT |
| Không đóng `Files.list()` / `Files.walk()` | Rò rỉ fd âm thầm |
| Không đọc/đóng HTTP response body | Kết nối không trả về pool |
| Không giám sát `process_open_fds` | Không thấy rò rỉ cho tới khi sập |
| Bỏ qua conntrack | Timeout ngẫu nhiên không giải thích được |
| Đặt `accept-count` lớn hơn `somaxconn` | Giá trị thật bị cắt xuống |

## Tóm tắt case 3

- Ephemeral port chỉ có **~28.000** mặc định; `TIME_WAIT` giữ port **60 giây** sau khi đóng.
- **Connection pool + keep-alive là giải pháp gốc rễ** — giảm gần 100% và còn nhanh hơn nhiều.
- `tcp_tw_reuse` an toàn; **`tcp_tw_recycle` đã bị xoá khỏi kernel, đừng dùng**.
- `ulimit -n` mặc định **1024** là quá thấp — đặt 65535 cho ứng dụng có nhiều kết nối.
- Cạn fd làm **mọi thứ** hỏng cùng lúc, kể cả ghi log — không phục hồi được.
- Rò rỉ fd hay gặp nhất: **`Files.list()` không đóng** và response HTTP không đóng.
- **Conntrack đầy làm gói tin bị drop âm thầm** — timeout không có lỗi, rất khó chẩn đoán.
- Giám sát bắt buộc: `process_open_fds / process_max_fds`, số `TIME_WAIT`, `nf_conntrack_count`.

**Bài kế tiếp** → [Case 4: DNS — 5 phút gián đoạn kéo dài thành 5 giờ](04-case-dns.md)

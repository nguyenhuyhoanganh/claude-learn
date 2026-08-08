# Bài 2: Ba loại probe — và vì sao livenessProbe nguy hiểm

Kubernetes có ba loại kiểm tra sức khoẻ. Chúng nghe rất giống nhau, nhưng trả lời ba câu hỏi khác hẳn nhau — và dùng nhầm loại là nguyên nhân của một trong những kiểu sự cố tệ nhất trong Kubernetes: **cụm tự giết chính mình đúng lúc đang quá tải**.

---

## Ba câu hỏi, ba probe

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  startupProbe    "Ứng dụng KHỞI ĐỘNG XONG chưa?"             │
   │                  Chạy MỘT GIAI ĐOẠN rồi thôi.                │
   │                  Thất bại → giết container.                  │
   ├──────────────────────────────────────────────────────────────┤
   │  readinessProbe  "Có SẴN SÀNG nhận request không?"           │
   │                  Chạy SUỐT ĐỜI container.                    │
   │                  Thất bại → GỠ khỏi Service (không giết).    │
   ├──────────────────────────────────────────────────────────────┤
   │  livenessProbe   "Còn SỐNG hay đã TREO?"                     │
   │                  Chạy SUỐT ĐỜI container.                    │
   │                  Thất bại → GIẾT VÀ KHỞI ĐỘNG LẠI.           │
   └──────────────────────────────────────────────────────────────┘
```

Khác biệt cốt lõi nằm ở **hậu quả khi thất bại**:

| Probe | Thất bại thì | Có mất traffic không | Có mất trạng thái không |
|---|---|---|---|
| `startupProbe` | Giết container | — (chưa nhận traffic) | Có |
| `readinessProbe` | **Gỡ khỏi endpoint của Service** | Không (traffic đi Pod khác) | **Không** |
| `livenessProbe` | **Giết và khởi động lại** | Có, trong lúc khởi động lại | **Có** |

> **Nguyên tắc quan trọng nhất bài này**: `readinessProbe` là **an toàn** — nó chỉ ngừng gửi traffic. `livenessProbe` là **nguy hiểm** — nó giết tiến trình. Cấu hình sai `readinessProbe` gây bất tiện; cấu hình sai `livenessProbe` gây sự cố dây chuyền.

---

## readinessProbe — dùng nhiều nhất, an toàn nhất

```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
  timeoutSeconds: 3
  successThreshold: 1
  failureThreshold: 3
```

```text
   Pod Ready  ──► có tên trong Endpoints của Service ──► nhận traffic
   Pod chưa Ready ──► BỊ GỠ khỏi Endpoints ──► KHÔNG nhận traffic
                      (Pod vẫn chạy, vẫn giữ trạng thái)
```

Ba tình huống `readinessProbe` cứu bạn:

**Một — lúc khởi động.** Spring Boot mất 40 giây để nạp context. Không có readiness, Service gửi request vào ngay giây đầu → hàng loạt lỗi 502.

**Two — lúc quá tải tạm thời.** Pod đang xử lý 500 request đồng thời, thêm nữa là sập. `readinessProbe` báo chưa sẵn sàng → traffic chuyển sang Pod khác → Pod này thở được rồi quay lại.

**Ba — lúc phụ thuộc bên ngoài chết.** Database mất kết nối → Pod báo chưa sẵn sàng → traffic ngừng vào cho tới khi kết nối lại. Không mất Pod, không mất kết nối đang mở.

### Điểm quan trọng: readiness KHÔNG chỉ dùng lúc khởi động

Nhiều người tưởng `readinessProbe` chỉ chạy lúc khởi động. Sai — nó chạy **suốt đời container**, mỗi `periodSeconds` một lần. Chính vì vậy nó xử lý được hai tình huống sau.

---

## startupProbe — giải bài toán ứng dụng khởi động lâu

Trước Kubernetes 1.16, có một mâu thuẫn không giải được:

```text
   Ứng dụng Java khởi động mất 3 phút (trường hợp xấu nhất).

   Muốn livenessProbe phát hiện treo NHANH  → periodSeconds nhỏ
   Muốn cho ứng dụng đủ 3 phút để khởi động → initialDelaySeconds lớn

   Đặt initialDelaySeconds: 180
   → Ứng dụng treo ở phút thứ 5 thì phải chờ tới phút thứ 8 mới phát hiện?
     KHÔNG — initialDelay chỉ áp dụng lần đầu.
   → Nhưng nếu ứng dụng khởi động lâu hơn 180 giây một chút,
     livenessProbe GIẾT NÓ GIỮA CHỪNG → khởi động lại → lại bị giết
     → VÒNG LẶP CHẾT
```

`startupProbe` tách hẳn hai giai đoạn:

```yaml
startupProbe:
  httpGet:
    path: /health/started
    port: 8080
  failureThreshold: 30        # cho phép thất bại 30 lần
  periodSeconds: 10           # → tối đa 300 giây để khởi động
  timeoutSeconds: 3

livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
  periodSeconds: 10           # phát hiện treo trong ~30 giây
  failureThreshold: 3
```

```text
   ┌──────── GIAI ĐOẠN KHỞI ĐỘNG ────────┐┌─── GIAI ĐOẠN CHẠY ───┐
   │  CHỈ startupProbe chạy               ││ liveness + readiness │
   │  liveness và readiness BỊ TẠM DỪNG   ││ startupProbe DỪNG    │
   │  Cho tối đa 300 giây                 ││ hẳn, không chạy nữa  │
   └──────────────────────────────────────┘└──────────────────────┘
              startupProbe thành công lần đầu ▲
```

> **Đây là cách đúng duy nhất** cho ứng dụng khởi động lâu (Java, .NET, ứng dụng nạp mô hình học máy, ứng dụng khôi phục trạng thái). Đừng dùng `initialDelaySeconds` lớn cho `livenessProbe`.

---

## livenessProbe — và vì sao nó nguy hiểm

`livenessProbe` giải đúng một bài toán: **tiến trình còn sống nhưng không làm việc được nữa** — deadlock, vòng lặp vô hạn, thread pool cạn kiệt. Trong những trường hợp đó, khởi động lại là cách duy nhất.

Nhưng nó tạo ra một loại sự cố rất tệ.

### Kịch bản sập dây chuyền

```text
   t=0    Lưu lượng tăng đột biến. 10 Pod đều xử lý chậm lại.
          /health kiểm tra cả kết nối database → giờ mất 4 giây

   t=10s  livenessProbe timeoutSeconds=1 → THẤT BẠI
          Ba lần liên tiếp thất bại → Kubernetes GIẾT Pod

   t=15s  Pod 1, 2, 3 bị giết CÙNG LÚC
          → 7 Pod còn lại gánh 100% lưu lượng
          → CHẬM HƠN NỮA

   t=25s  Pod 4, 5, 6, 7 cũng thất bại liveness → bị giết
          → 3 Pod gánh toàn bộ → sập ngay

   t=40s  Pod khởi động lại, nhưng phải nạp cache, mở kết nối
          → càng chậm → lại thất bại liveness → LẠI BỊ GIẾT

   → CỤM TỰ GIẾT CHÍNH MÌNH. Không có Pod nào phục vụ được.
```

Điều trớ trêu: **nếu không có `livenessProbe`, hệ thống chỉ chậm rồi tự hồi phục khi lưu lượng giảm.** Chính `livenessProbe` biến "chậm" thành "sập hoàn toàn".

### Bốn nguyên tắc viết livenessProbe an toàn

**1. KHÔNG kiểm tra phụ thuộc bên ngoài**

```java
// SAI — database chết thì MỌI Pod bị giết, dù bản thân chúng khoẻ
@GetMapping("/health/live")
public ResponseEntity<?> live() {
    jdbcTemplate.queryForObject("SELECT 1", Integer.class);   // ✗
    redisTemplate.hasKey("ping");                             // ✗
    return ResponseEntity.ok().build();
}

// ĐÚNG — chỉ kiểm tra CHÍNH tiến trình này
@GetMapping("/health/live")
public ResponseEntity<?> live() {
    return ResponseEntity.ok("alive");
}
```

Khởi động lại Pod **không sửa được** database chết. Nó chỉ làm mọi thứ tệ hơn.

Ngược lại, `readinessProbe` **nên** kiểm tra phụ thuộc — vì hậu quả chỉ là ngừng nhận traffic, hoàn toàn hợp lý.

```text
   ┌──────────────────────────────────────────────────────────┐
   │  livenessProbe   → chỉ hỏi "TIẾN TRÌNH NÀY còn chạy?"    │
   │  readinessProbe  → hỏi "tôi có PHỤC VỤ ĐƯỢC lúc này?"    │
   │                     (được phép kiểm tra database, cache) │
   └──────────────────────────────────────────────────────────┘
```

**2. Đặt `timeoutSeconds` và `failureThreshold` rộng rãi**

```yaml
livenessProbe:
  timeoutSeconds: 5        # KHÔNG phải 1
  periodSeconds: 10
  failureThreshold: 5      # 5 × 10 = 50 giây mới giết
```

Mặc định `timeoutSeconds: 1` là **quá chặt** cho hầu hết ứng dụng thật.

**3. Endpoint liveness phải cực nhẹ**

Không truy vấn database, không gọi API, không tính toán. Chỉ trả về `200 OK`. Nếu tiến trình treo hoàn toàn thì ngay cả endpoint rỗng cũng không trả lời được — và đó chính là thứ ta muốn phát hiện.

**4. Cân nhắc KHÔNG dùng livenessProbe**

Câu hỏi thật: *"ứng dụng của tôi có thật sự treo mà không tự chết không?"*

```text
   Ứng dụng CÓ deadlock / cạn thread pool / vòng lặp vô hạn
        → CÓ, cần livenessProbe

   Ứng dụng gặp lỗi thì crash và tự thoát
        → KHÔNG cần. Kubernetes đã tự khởi động lại container thoát.
        → Thêm livenessProbe chỉ thêm rủi ro.
```

Nhiều đội vận hành có kinh nghiệm **cố ý không dùng `livenessProbe`** và chỉ dùng `readinessProbe` + `startupProbe`. Đó là lựa chọn hợp lý, không phải cẩu thả.

---

## Bốn kiểu kiểm tra

```yaml
# 1. HTTP — phổ biến nhất
livenessProbe:
  httpGet:
    path: /health/live
    port: 8080
    httpHeaders:
      - name: Custom-Header
        value: probe
# Thành công khi mã trả về 200-399

# 2. TCP — cho dịch vụ không nói HTTP
readinessProbe:
  tcpSocket:
    port: 5432
# Thành công khi mở được kết nối TCP

# 3. Lệnh trong container — linh hoạt nhất
livenessProbe:
  exec:
    command: ["sh", "-c", "pg_isready -U postgres"]
# Thành công khi mã thoát = 0

# 4. gRPC — Kubernetes 1.24+
readinessProbe:
  grpc:
    port: 9090
    service: readiness
```

| Kiểu | Ưu | Nhược |
|---|---|---|
| `httpGet` | Nhẹ, chuẩn, dễ debug bằng `curl` | Ứng dụng phải nói HTTP |
| `tcpSocket` | Đơn giản nhất | Chỉ biết cổng mở, **không biết ứng dụng có làm việc không** |
| `exec` | Kiểm tra được mọi thứ | **Tốn tài nguyên** — mỗi lần chạy là fork một tiến trình |
| `grpc` | Chuẩn cho dịch vụ gRPC | Cần Kubernetes 1.24+ |

> **Cảnh báo về `exec`**: chạy mỗi 5 giây × 100 Pod = 20 tiến trình mới mỗi giây trên cụm. Với `exec` nặng (script Python chẳng hạn), chi phí này lớn hơn cả ứng dụng. Ưu tiên `httpGet`.
>
> **Cảnh báo về `tcpSocket`**: cổng mở không có nghĩa là ứng dụng hoạt động. Một tiến trình Java bị deadlock vẫn giữ cổng 8080 mở. `tcpSocket` sẽ báo khoẻ mãi mãi.

---

## Probe và việc tắt Pod — chỗ hay mất request

Khi Pod bị xoá (deploy, scale xuống, drain node), có một cuộc đua ít người biết:

```text
   t=0    kubectl delete pod
          │
          ├──► kubelet gửi SIGTERM cho container
          └──► API server cập nhật Endpoints để gỡ Pod
                    │
                    ├──► kube-proxy trên MỖI node cập nhật iptables
                    ├──► Ingress controller cập nhật danh sách backend
                    └──► CoreDNS cập nhật
                         (BA việc này KHÔNG tức thời — mất 1-5 giây)

   t=0.1s Ứng dụng nhận SIGTERM, đóng server ngay
   t=0.5s Nhưng iptables trên node khác VẪN gửi request tới Pod này
          → CONNECTION REFUSED → người dùng thấy lỗi 502
```

Cách chữa chuẩn — `preStop` hook:

```yaml
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: app
          lifecycle:
            preStop:
              exec:
                # Chờ để việc gỡ khỏi Endpoints lan ra toàn cụm
                # TRƯỚC KHI ứng dụng bắt đầu đóng
                command: ["sh", "-c", "sleep 10"]
```

```text
   t=0     SIGTERM bị HOÃN, preStop chạy trước
   t=0-10s Pod đã bị gỡ khỏi Endpoints và lan khắp cụm,
           nhưng ứng dụng VẪN PHỤC VỤ request đang tới
   t=10s   preStop xong → SIGTERM được gửi → ứng dụng đóng sạch
   t=60s   Nếu chưa xong thì SIGKILL

   → KHÔNG MẤT REQUEST NÀO
```

Đây là chi tiết tạo ra khác biệt giữa "deploy có gián đoạn nhẹ" và "deploy hoàn toàn êm".

---

## Bộ cấu hình mẫu cho ba loại ứng dụng

### Ứng dụng Java / Spring Boot

```yaml
startupProbe:
  httpGet: {path: /actuator/health/readiness, port: 8080}
  failureThreshold: 30
  periodSeconds: 10           # cho tối đa 300 giây khởi động

readinessProbe:
  httpGet: {path: /actuator/health/readiness, port: 8080}
  periodSeconds: 5
  timeoutSeconds: 3
  failureThreshold: 3

livenessProbe:
  httpGet: {path: /actuator/health/liveness, port: 8080}
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 5
```

Spring Boot 2.3+ có sẵn hai endpoint tách biệt, chỉ cần bật:

```yaml
management:
  endpoint.health.probes.enabled: true
  health.livenessState.enabled: true
  health.readinessState.enabled: true
```

Và điểm hay: Spring tự đặt readiness thành `DOWN` khi nhận `SIGTERM`, phối hợp đúng với `preStop`.

### Ứng dụng Node.js

```yaml
readinessProbe:
  httpGet: {path: /ready, port: 3000}
  initialDelaySeconds: 3
  periodSeconds: 5

livenessProbe:
  httpGet: {path: /live, port: 3000}
  periodSeconds: 15
  failureThreshold: 3
```

Node.js khởi động nhanh nên thường không cần `startupProbe`.

### Database trong StatefulSet

```yaml
readinessProbe:
  exec:
    command: ["sh", "-c", "pg_isready -U postgres -h 127.0.0.1"]
  periodSeconds: 10
  failureThreshold: 3

# KHÔNG dùng livenessProbe cho database.
# Giết một database đang chạy recovery = kéo dài sự cố.
```

Với database, `livenessProbe` gần như luôn là ý tồi: khi database chậm (đang recovery, đang checkpoint, đang vacuum), giết nó đi làm mọi thứ tệ hơn nhiều.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| `livenessProbe` kiểm tra database | Database chết → **mọi Pod bị giết** dù chúng khoẻ | Chỉ kiểm tra tiến trình. Phụ thuộc để `readinessProbe` |
| Dùng chung một endpoint cho liveness và readiness | Mất luôn khả năng phân biệt "chậm" và "chết" | Hai endpoint riêng |
| `timeoutSeconds: 1` (mặc định) | Giết Pod oan khi tải cao → **sập dây chuyền** | 3–5 giây |
| `initialDelaySeconds` lớn thay vì `startupProbe` | Treo giữa chừng phát hiện chậm, hoặc **vòng lặp chết** lúc khởi động | Dùng `startupProbe` |
| Không có `readinessProbe` | Traffic vào Pod chưa sẵn sàng → **502 mỗi lần deploy** | Luôn có |
| Không có `preStop` hook | **Mất request** mỗi lần deploy do cuộc đua cập nhật Endpoints | `sleep 5-15` trong `preStop` |
| `exec` probe nặng chạy mỗi 5 giây | Tốn CPU đáng kể trên cụm lớn | Ưu tiên `httpGet` |
| `tcpSocket` cho ứng dụng HTTP | Cổng mở nhưng ứng dụng deadlock → **báo khoẻ mãi mãi** | `httpGet` |
| `livenessProbe` cho database | Giết database đang recovery → kéo dài sự cố | Bỏ hẳn |
| Quên rằng StatefulSet chờ Ready mới tạo Pod tiếp | Kẹt vĩnh viễn ở Pod 0 | Xem [Phase 17 bài 1](../phase-17/01-statefulset.md) |

---

## Tóm tắt bài 2

- Ba probe trả lời ba câu khác nhau: **`startupProbe`** ("khởi động xong chưa"), **`readinessProbe`** ("sẵn sàng nhận request chưa"), **`livenessProbe`** ("còn sống hay đã treo").
- Khác biệt cốt lõi là **hậu quả**: readiness chỉ **gỡ khỏi Service** (an toàn, không mất trạng thái); liveness **giết và khởi động lại** (nguy hiểm).
- **`readinessProbe` chạy suốt đời container**, không chỉ lúc khởi động — nhờ vậy nó xử lý được quá tải tạm thời và phụ thuộc bên ngoài chết.
- **`startupProbe` là cách đúng duy nhất** cho ứng dụng khởi động lâu. Nó tạm dừng hai probe kia cho tới khi thành công lần đầu, tránh **vòng lặp chết lúc khởi động**.
- **`livenessProbe` có thể làm cụm tự giết chính mình**: tải tăng → probe timeout → Pod bị giết → Pod còn lại gánh nhiều hơn → cũng bị giết → sập hoàn toàn. Không có liveness thì hệ thống chỉ **chậm rồi tự hồi phục**.
- Bốn nguyên tắc liveness an toàn: **không kiểm tra phụ thuộc bên ngoài**, `timeoutSeconds` 3–5 giây, endpoint cực nhẹ, và **cân nhắc bỏ hẳn** nếu ứng dụng gặp lỗi thì tự crash.
- Bốn kiểu kiểm tra: `httpGet` (ưu tiên), `tcpSocket` (**cổng mở không có nghĩa là hoạt động**), `exec` (**tốn tài nguyên**), `grpc` (1.24+).
- **`preStop` hook với `sleep 5-15`** là thứ chặn mất request khi deploy — vì việc gỡ Pod khỏi Endpoints cần vài giây để lan khắp cụm, trong lúc ứng dụng đã đóng server rồi.
- **Đừng dùng `livenessProbe` cho database.** Giết một database đang recovery chỉ kéo dài sự cố.

**Bài kế tiếp** → [Bài 3: HorizontalPodAutoscaler — tự động scale theo tải](03-hpa-tu-dong-scale.md)

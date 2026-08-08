# Bài 1: Log và Event — hai nguồn thông tin đầu tiên khi có sự cố

Pod báo lỗi. Bạn gõ gì đầu tiên?

Hầu hết mọi người gõ `kubectl logs`. Đúng khoảng một nửa thời gian — vì có cả một lớp sự cố mà **log hoàn toàn rỗng**, và thông tin nằm ở chỗ khác: **Event**.

Bài này phân biệt hai nguồn đó, chỉ ra khi nào dùng cái nào, và cảnh báo một chi tiết khiến rất nhiều đội mất dữ liệu điều tra đúng lúc cần nhất.

---

## Log — ứng dụng nói gì

```bash
kubectl logs myapp-7d4b9c8f6d-x7k2p
```

Kubernetes lấy log bằng cách rất đơn giản:

```text
   Ứng dụng ghi ra stdout / stderr
        │
        ▼
   Container runtime ghi vào file trên NODE
   /var/log/pods/<namespace>_<pod>_<uid>/<container>/0.log
        │
        ▼
   kubelet đọc file đó khi bạn gọi kubectl logs
```

> **Hệ quả quan trọng**: Kubernetes **chỉ thấy stdout/stderr**. Ứng dụng ghi log vào `/var/log/app.log` bên trong container thì `kubectl logs` **không thấy gì cả** — và file đó biến mất cùng container. Mọi ứng dụng chạy trong container phải ghi log ra **stdout**.

### Các cờ cần thuộc

```bash
# Container trước khi khởi động lại — QUAN TRỌNG NHẤT khi debug crash
kubectl logs myapp-xxx --previous

# Theo dõi thời gian thực
kubectl logs myapp-xxx -f

# Pod nhiều container
kubectl logs myapp-xxx -c sidecar
kubectl logs myapp-xxx --all-containers=true

# Theo nhãn — gộp log của MỌI Pod cùng ứng dụng
kubectl logs -l app=myapp --all-containers=true --tail=100 -f

# Giới hạn thời gian
kubectl logs myapp-xxx --since=15m
kubectl logs myapp-xxx --since-time=2025-08-08T10:00:00Z

# Kèm dấu thời gian (nhiều ứng dụng không tự in)
kubectl logs myapp-xxx --timestamps
```

**`--previous`** là cờ quan trọng nhất và hay bị quên nhất. Khi Pod ở trạng thái `CrashLoopBackOff`, `kubectl logs` cho bạn log của container **đang khởi động** (thường rỗng), trong khi nguyên nhân nằm ở container **vừa chết**.

---

## Chi tiết làm mất dữ liệu điều tra

```text
   Pod bị XOÁ (deploy mới, scale xuống, node bị drain, Pod bị đuổi)
        │
        ▼
   File log trên node BỊ XOÁ THEO
        │
        ▼
   kubectl logs → "Error from server (NotFound): pods "myapp-xxx" not found"
        │
        ▼
   Log của sự cố ĐÃ BIẾN MẤT VĨNH VIỄN
```

Và ngay cả khi Pod còn sống, log cũng bị xoay vòng:

```text
   Mặc định kubelet:
     containerLogMaxSize  = 10Mi
     containerLogMaxFiles = 5

   → Ứng dụng ghi nhiều log thì chỉ giữ được 50 MB gần nhất.
   → Với dịch vụ tải cao, đó có thể chỉ là vài phút.
```

> **Kết luận**: `kubectl logs` là công cụ **gỡ lỗi tức thời**, **không phải hệ thống lưu trữ log**. Mọi cụm production bắt buộc phải có hệ thống thu thập log tập trung — nếu không, sự cố nghiêm trọng nhất (Pod bị giết) cũng chính là sự cố bạn **không có log để điều tra**.

---

## Event — Kubernetes nói gì

Log cho bạn biết **ứng dụng** nghĩ gì. Event cho bạn biết **Kubernetes** đang làm gì với Pod.

```bash
kubectl describe pod myapp-xxx
```

```text
Events:
  Type     Reason            Age    From               Message
  ----     ------            ----   ----               -------
  Normal   Scheduled         2m     default-scheduler  Successfully assigned production/myapp-xxx to worker-2
  Normal   Pulling           2m     kubelet            Pulling image "myapp:v1.2.3"
  Warning  Failed            1m     kubelet            Failed to pull image "myapp:v1.2.3": rpc error: code = NotFound
  Warning  Failed            1m     kubelet            Error: ErrImagePull
  Normal   BackOff           45s    kubelet            Back-off pulling image "myapp:v1.2.3"
  Warning  Failed            45s    kubelet            Error: ImagePullBackOff
```

Ở đây `kubectl logs` **hoàn toàn rỗng** — container chưa bao giờ chạy. Toàn bộ thông tin nằm ở Event.

### Bảng tra Event thường gặp

| Reason | Nghĩa | Xử lý |
|---|---|---|
| `FailedScheduling` | Không node nào nhận Pod | Đọc message: thiếu CPU/RAM? taint? affinity? |
| `ImagePullBackOff` / `ErrImagePull` | Không kéo được image | Sai tên/tag, hoặc thiếu `imagePullSecrets` |
| `CrashLoopBackOff` | Container liên tục chết | `kubectl logs --previous` |
| `OOMKilled` | Vượt `limits.memory` | Xem [Phase 18 bài 1](../phase-18/01-requests-limits-va-qos.md) |
| `Unhealthy` | Probe thất bại | Xem [Phase 18 bài 2](../phase-18/02-probes-va-bay-liveness.md) |
| `FailedMount` | Không gắn được volume | PVC chưa Bound? sai tên Secret/ConfigMap? |
| `Evicted` | Bị đuổi do node thiếu tài nguyên | Node hết đĩa/RAM; xem QoS class |
| `NodeNotReady` | Node chết | Kiểm tra node |
| `FailedCreatePodSandBox` | Lỗi mạng/CNI | Kiểm tra CNI plugin trên node đó |

### Bẫy lớn nhất của Event: chúng biến mất sau 1 giờ

```bash
kubectl get events --sort-by='.lastTimestamp' -A | tail -20
```

```text
   Mặc định API server:  --event-ttl=1h
```

**Event chỉ sống một giờ.** Sự cố xảy ra lúc 2 giờ sáng, bạn điều tra lúc 9 giờ sáng — **không còn Event nào**. Đây là lý do rất nhiều cuộc điều tra sự cố kết thúc bằng "không rõ nguyên nhân".

Hai cách chữa:

```bash
# Cách 1 — tăng TTL (sửa API server, chỉ làm được với cụm tự quản)
--event-ttl=24h

# Cách 2 — xuất Event sang hệ thống log (LÀM ĐƯỢC Ở MỌI CỤM)
# Cài kubernetes-event-exporter hoặc dùng Fluent Bit với plugin kubernetes-events
```

Cách 2 là cách chuẩn: coi Event như một luồng log, đẩy vào Loki/Elasticsearch cùng với log ứng dụng. Khi đó bạn tra được Event của tháng trước.

---

## Kiến trúc thu thập log tập trung

```text
   ┌──────────── Node 1 ────────────┐
   │  Pod A ──► stdout ──┐          │
   │  Pod B ──► stdout ──┼──► /var/log/pods/...
   │  Pod C ──► stdout ──┘          │
   │                      │          │
   │              ┌───────▼───────┐  │
   │              │ Fluent Bit    │  │  ← DaemonSet (Phase 17 bài 2)
   │              │ (đọc file,    │  │
   │              │  thêm nhãn K8s)│ │
   │              └───────┬───────┘  │
   └──────────────────────┼──────────┘
                          │
                ┌─────────▼──────────┐
                │  Loki / Elastic /  │
                │  CloudWatch        │
                └─────────┬──────────┘
                          ▼
                    Grafana / Kibana
```

Cấu hình Fluent Bit tối thiểu:

```yaml
[INPUT]
    Name              tail
    Path              /var/log/containers/*.log
    Parser            cri
    Tag               kube.*
    Mem_Buf_Limit     10MB
    Skip_Long_Lines   On

[FILTER]
    Name                kubernetes
    Match               kube.*
    Merge_Log           On
    Keep_Log            Off
    K8S-Logging.Parser  On
    K8S-Logging.Exclude On

[OUTPUT]
    Name   loki
    Match  kube.*
    Host   loki.logging.svc.cluster.local
    Labels job=fluentbit, $kubernetes['namespace_name'], $kubernetes['labels']['app']
```

Bộ lọc `kubernetes` là phần giá trị nhất: nó **tự gắn thêm** namespace, tên Pod, tên container, và **mọi nhãn của Pod** vào từng dòng log. Nhờ vậy bạn tra được *"mọi log của app=backend trong namespace production 30 phút qua"* mà không cần biết tên Pod.

### Ba lựa chọn phổ biến

| | Loki | Elasticsearch (ELK) | CloudWatch / cloud |
|---|---|---|---|
| Cách đánh chỉ mục | **Chỉ nhãn**, không đánh chỉ mục nội dung | Đánh chỉ mục **toàn văn** | Tuỳ dịch vụ |
| Chi phí lưu trữ | **Rất thấp** | Cao (chỉ mục lớn hơn dữ liệu) | Trung bình, tính theo GB |
| Tìm kiếm toàn văn | Chậm hơn | **Rất nhanh** | Trung bình |
| Vận hành | **Đơn giản** | Phức tạp (cần tuning JVM, shard) | **Không phải vận hành** |
| Hợp với | Đa số trường hợp | Cần phân tích log sâu | Đã ở trên cloud đó |

Loki là lựa chọn mặc định hợp lý cho hầu hết đội: rẻ, dễ vận hành, và tích hợp sẵn với Grafana.

---

## Log có cấu trúc — thay đổi lớn nhất bạn có thể làm

```text
   LOG DẠNG CHỮ (khó tra)
   2025-08-08 10:23:45 ERROR Failed to process order 12345 for customer KH-042: timeout

   LOG CÓ CẤU TRÚC (tra được)
   {"ts":"2025-08-08T10:23:45Z","level":"error","msg":"xu ly don hang that bai",
    "order_id":"12345","customer_id":"KH-042","error":"timeout","duration_ms":5023,
    "trace_id":"a1b2c3d4"}
```

```text
   Với log dạng chữ:  grep "12345" → tìm được, nhưng không lọc/gộp được
   Với log cấu trúc:  {app="orders"} | json | order_id="12345"
                      {app="orders"} | json | duration_ms > 5000
                      sum by (customer_id) (count_over_time(...))
```

Ba trường nên có trong mọi dòng log:

| Trường | Vì sao |
|---|---|
| `trace_id` | **Nối các dòng log của cùng một request** qua nhiều dịch vụ — thứ giá trị nhất |
| `level` | Lọc nhanh theo mức nghiêm trọng |
| Định danh nghiệp vụ (`order_id`, `user_id`) | Trả lời được câu hỏi của bộ phận kinh doanh |

```java
// Spring Boot với logstash-logback-encoder
log.atError()
   .setMessage("xu ly don hang that bai")
   .addKeyValue("order_id", orderId)
   .addKeyValue("customer_id", customerId)
   .addKeyValue("duration_ms", duration)
   .setCause(ex)
   .log();
```

---

## Bốn nguyên tắc ghi log trong container

**1. Chỉ ghi ra stdout/stderr.** Không ghi file, không tự xoay vòng log — đó là việc của hạ tầng.

**2. Không ghi bí mật.** Rất nhiều framework in toàn bộ biến môi trường khi khởi động lỗi — và biến môi trường thường chứa mật khẩu ([Phase 19 bài 3](../phase-19/03-secret-that-su-an-toan.md)).

```java
// SAI
log.info("Ket noi database: {}", connectionString);   // chứa mật khẩu

// ĐÚNG
log.info("Ket noi database: host={} db={}", host, dbName);
```

**3. Cẩn thận với khối lượng.** Log ở mức DEBUG cho dịch vụ 10.000 request/giây có thể sinh **hàng trăm GB mỗi ngày** — và hoá đơn lưu trữ lớn hơn hoá đơn chạy chính dịch vụ đó.

```yaml
# Cho phép đổi mức log khi đang chạy, không cần deploy lại
env:
  - name: LOG_LEVEL
    valueFrom:
      configMapKeyRef: {name: app-config, key: log_level}
```

**4. Đừng log ở đường nóng.** Một dòng `log.debug` trong vòng lặp xử lý từng bản ghi có thể chiếm phần lớn thời gian CPU.

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Ứng dụng ghi log vào file trong container | `kubectl logs` **rỗng hoàn toàn**, log mất cùng container |
| Quên `--previous` khi debug `CrashLoopBackOff` | Thấy log rỗng của container đang khởi động, bỏ lỡ nguyên nhân thật |
| Dựa vào `kubectl logs` làm nơi lưu trữ | Pod bị xoá → **log biến mất vĩnh viễn** đúng lúc cần nhất |
| Không xuất Event ra ngoài | Event **sống 1 giờ** → điều tra sự cố đêm qua thì không còn gì |
| Chỉ xem log, quên xem Event | Không bao giờ chẩn đoán được `ImagePullBackOff`, `FailedScheduling` |
| Log dạng chữ không cấu trúc | Không lọc, không gộp, không thống kê được |
| Không có `trace_id` | Không nối được các dòng log của cùng một request qua nhiều dịch vụ |
| Log mức DEBUG ở production | Hoá đơn lưu trữ vượt hoá đơn tính toán |
| In biến môi trường khi khởi động lỗi | **Mật khẩu vào hệ thống log tập trung** |
| Không đặt `Mem_Buf_Limit` cho Fluent Bit | Agent ngốn bộ nhớ khi đích lưu trữ chậm → **OOM cả node** |

---

## Tóm tắt bài 1

- Kubernetes **chỉ thấy stdout/stderr**. Ứng dụng ghi log vào file trong container thì `kubectl logs` rỗng và log mất cùng container.
- **`--previous` là cờ quan trọng nhất** khi debug `CrashLoopBackOff` — nó cho log của container **vừa chết**, không phải container đang khởi động.
- **`kubectl logs` không phải hệ thống lưu trữ.** Pod bị xoá là log mất; log còn bị xoay vòng ở mức 50 MB mặc định. Production **bắt buộc** có thu thập log tập trung.
- **Log cho biết ứng dụng nghĩ gì; Event cho biết Kubernetes đang làm gì.** Với `ImagePullBackOff`, `FailedScheduling`, `FailedMount` thì log **hoàn toàn rỗng** — thông tin chỉ có ở Event.
- **Event mặc định chỉ sống 1 giờ.** Đây là lý do nhiều cuộc điều tra sự cố đêm kết thúc bằng "không rõ nguyên nhân". Xuất Event sang hệ thống log là cách chữa dùng được ở mọi cụm.
- Kiến trúc chuẩn: **DaemonSet Fluent Bit** đọc `/var/log/containers/`, bộ lọc `kubernetes` **tự gắn namespace/pod/nhãn**, đẩy vào **Loki** (rẻ, dễ vận hành) hoặc Elasticsearch (tìm kiếm mạnh hơn).
- **Log có cấu trúc (JSON) là thay đổi lớn nhất bạn có thể làm** — nó biến log từ "đọc được" thành "truy vấn được". Ba trường bắt buộc: **`trace_id`**, `level`, và định danh nghiệp vụ.
- Bốn nguyên tắc: chỉ stdout, **không ghi bí mật**, kiểm soát khối lượng (đổi mức log qua ConfigMap), và đừng log ở đường nóng.

**Bài kế tiếp** → [Bài 2: Bộ công cụ gỡ lỗi — kubectl debug và các trạng thái hỏng](02-bo-cong-cu-go-loi.md)

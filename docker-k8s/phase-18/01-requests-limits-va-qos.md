# Bài 1: Requests, Limits và QoS — vì sao Pod bị OOMKilled

Hai dòng YAML này quyết định nhiều thứ hơn bạn tưởng: Pod được xếp lên node nào, có bị giết khi node hết bộ nhớ không, có bị làm chậm khi CPU căng không, và tốn bao nhiêu tiền hạ tầng.

```yaml
resources:
  requests: {cpu: 250m, memory: 256Mi}
  limits:   {cpu: 500m, memory: 512Mi}
```

Và đây cũng là hai dòng bị đặt sai nhiều nhất trong mọi manifest Kubernetes.

---

## Requests và Limits khác nhau hoàn toàn

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  REQUESTS = "tôi CẦN ít nhất bằng này"                      │
   │                                                              │
   │  → Dùng cho SCHEDULER: chọn node còn đủ chỗ                 │
   │  → Là phần được ĐẢM BẢO, không ai lấy mất                   │
   │  → Là con số dùng để TÍNH TIỀN năng lực cụm                 │
   ├─────────────────────────────────────────────────────────────┤
   │  LIMITS = "tôi KHÔNG được dùng quá bằng này"                │
   │                                                              │
   │  → Dùng cho KERNEL (cgroups): cưỡng chế trần                │
   │  → Scheduler KHÔNG quan tâm tới limits                      │
   └─────────────────────────────────────────────────────────────┘
```

Điểm quan trọng nhất và hay bị bỏ qua: **scheduler chỉ nhìn `requests`, không nhìn `limits`.**

```text
   Node có 4 CPU.
   10 Pod, mỗi Pod requests=200m, limits=2000m

   Scheduler tính: 10 × 200m = 2000m = 2 CPU  →  còn chỗ, xếp hết lên
   Thực tế:        10 Pod đều có QUYỀN dùng tới 2 CPU mỗi Pod = 20 CPU
                   trên một node chỉ có 4 CPU

   → Hiện tượng OVERCOMMIT. Bình thường không sao (Pod hiếm khi
     cùng lúc dùng hết limits), nhưng lúc cao điểm thì tranh nhau.
```

---

## CPU và bộ nhớ bị cưỡng chế theo hai cách hoàn toàn khác nhau

Đây là khác biệt cốt lõi, và không hiểu nó thì không giải thích được `OOMKilled`.

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  CPU — tài nguyên NÉN ĐƯỢC (compressible)                    │
   │                                                              │
   │  Vượt limits → bị ĐIỀU TIẾT (throttle), chạy chậm lại        │
   │  Container KHÔNG bị giết. Chỉ chậm.                          │
   ├──────────────────────────────────────────────────────────────┤
   │  BỘ NHỚ — tài nguyên KHÔNG NÉN ĐƯỢC (incompressible)         │
   │                                                              │
   │  Vượt limits → bị GIẾT NGAY LẬP TỨC (OOMKilled)              │
   │  Không có cảnh báo, không có ân hạn.                         │
   │  Không thể "dùng chậm hơn" 200 MB bộ nhớ.                    │
   └──────────────────────────────────────────────────────────────┘
```

### Đơn vị — chỗ hay nhầm

```text
   CPU
   1      = 1 lõi (1000 milicore)
   500m   = 0,5 lõi
   100m   = 0,1 lõi

   BỘ NHỚ — chú ý hậu tố
   128Mi  = 128 × 1024 × 1024 = 134.217.728 byte   ← NÊN DÙNG
   128M   = 128 × 1000 × 1000 = 128.000.000 byte
                                 ▲ ít hơn 6 MB!
```

Viết `memory: 512M` thay vì `512Mi` cho ít hơn khoảng 5% bộ nhớ — đủ để một ứng dụng Java sát trần bị OOMKilled.

---

## Ba lớp QoS — Kubernetes giết Pod nào trước

Khi node thật sự hết bộ nhớ, kubelet phải **đuổi (evict)** bớt Pod. Thứ tự đuổi do lớp **QoS** quyết định, và lớp này được suy ra tự động từ cách bạn đặt requests/limits.

```yaml
# 1. GUARANTEED — requests BẰNG limits, cho MỌI container
resources:
  requests: {cpu: 500m, memory: 512Mi}
  limits:   {cpu: 500m, memory: 512Mi}

# 2. BURSTABLE — có requests, nhưng khác limits (hoặc thiếu một bên)
resources:
  requests: {cpu: 250m, memory: 256Mi}
  limits:   {cpu: 500m, memory: 512Mi}

# 3. BESTEFFORT — KHÔNG khai gì cả
# (không có khối resources)
```

```text
   THỨ TỰ BỊ ĐUỔI KHI NODE HẾT BỘ NHỚ
   ══════════════════════════════════

   1. BestEffort   ◄── bị giết ĐẦU TIÊN, không thương tiếc
   2. Burstable    ◄── giết những Pod dùng VƯỢT XA requests trước
   3. Guaranteed   ◄── giết CUỐI CÙNG, gần như chỉ khi cùng đường
```

```bash
kubectl get pod myapp-xxx -o jsonpath='{.status.qosClass}'
```

| Lớp | Điều kiện | Bị đuổi | Dùng cho |
|---|---|---|---|
| **Guaranteed** | `requests == limits` ở **mọi** container | Cuối cùng | Database, dịch vụ quan trọng |
| **Burstable** | Có requests, khác limits | Giữa | **Phần lớn ứng dụng** |
| **BestEffort** | Không khai gì | **Đầu tiên** | Gần như **không nên dùng** |

> **Bẫy tinh vi**: chỉ cần **một** container trong Pod (kể cả sidecar hay initContainer) không đặt `requests == limits` là **cả Pod** tụt xuống Burstable. Rất nhiều người đặt Guaranteed cho container chính rồi quên sidecar Istio, và không hiểu vì sao Pod vẫn bị đuổi.

---

## OOMKilled — chẩn đoán và chữa

### Nhận biết

```bash
kubectl describe pod myapp-xxx
```

```text
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
      Started:      Fri, 08 Aug 2025 14:22:01 +0700
      Finished:     Fri, 08 Aug 2025 14:47:33 +0700
    Restart Count:  5
```

**Mã thoát 137** = 128 + 9 = bị `SIGKILL`. Đây là dấu hiệu đặc trưng của OOM.

### Ba nguyên nhân, ba cách chữa khác nhau

**Nguyên nhân 1 — `limits.memory` đặt quá thấp**

Đo thực tế rồi đặt lại:

```bash
kubectl top pod myapp-xxx --containers
```

```text
POD          NAME    CPU(cores)   MEMORY(bytes)
myapp-xxx    app     143m         478Mi
```

Đặt `limits.memory` khoảng **1,5 lần đỉnh thật**, không phải trung bình.

**Nguyên nhân 2 — rò rỉ bộ nhớ**

Dấu hiệu: bộ nhớ tăng đều theo thời gian rồi OOM, khởi động lại, lại tăng đều. Tăng limits chỉ **kéo dài chu kỳ** chứ không chữa. Phải sửa code.

**Nguyên nhân 3 — JVM không biết mình đang ở trong container**

Đây là trường hợp cực kỳ phổ biến với Java và đáng nói riêng:

```text
   Container limits.memory = 512Mi
   JVM cũ nhìn thấy RAM của CẢ NODE (16 GB)
   → tự đặt heap tối đa = 1/4 × 16 GB = 4 GB
   → JVM cố cấp phát vượt 512Mi → OOMKilled
```

```yaml
# Cách đúng (Java 10+, đã bật mặc định từ Java 11)
env:
  - name: JAVA_OPTS
    value: "-XX:MaxRAMPercentage=75.0"
resources:
  limits:
    memory: 1Gi          # JVM sẽ dùng tối đa 768Mi cho heap
```

Dùng `MaxRAMPercentage` thay vì `-Xmx` cố định, để khi đổi `limits` thì heap tự điều chỉnh theo.

Vấn đề tương tự với Node.js (`--max-old-space-size`), Python (thư viện đọc `/proc/meminfo`), và Go (`GOMEMLIMIT`).

> **Nhớ chừa khoảng đệm**: `limits.memory` phải lớn hơn heap, vì tiến trình còn cần metaspace, thread stack, bộ đệm mạng, và với ứng dụng dùng RocksDB hay thư viện native thì còn cả bộ nhớ ngoài heap. Quy tắc: **heap ≈ 70–75% của `limits.memory`**.

---

## CPU throttling — vấn đề âm thầm hơn OOM

OOMKilled thì rõ ràng. Điều tiết CPU thì **không hề báo gì**, chỉ làm ứng dụng chậm.

```text
   Kernel chia thời gian thành các CHU KỲ 100ms.
   limits.cpu = 500m nghĩa là: mỗi chu kỳ 100ms, được dùng tối đa 50ms CPU.

   Ứng dụng cần 80ms trong một chu kỳ:
   ├─ 50ms đầu: chạy
   └─ 50ms sau: BỊ ĐÓNG BĂNG tới hết chu kỳ

   → Độ trễ tăng vọt, nhưng KHÔNG CÓ LỖI NÀO
```

Kiểm tra:

```bash
kubectl exec myapp-xxx -- cat /sys/fs/cgroup/cpu.stat
```

```text
nr_periods 128420
nr_throttled 31205        ← số chu kỳ bị điều tiết
throttled_usec 4820000    ← tổng thời gian bị đóng băng
```

`nr_throttled / nr_periods` vượt khoảng **5%** là dấu hiệu cần tăng `limits.cpu` hoặc bỏ hẳn nó.

### Có nên đặt `limits.cpu` không — câu hỏi gây tranh cãi

```text
   PHE ĐẶT limits.cpu
   ├─ Dễ dự đoán hiệu năng, một Pod không ăn hết CPU node
   └─ Cần cho lớp QoS Guaranteed

   PHE KHÔNG ĐẶT limits.cpu
   ├─ Pod tận dụng được CPU rảnh → phản hồi nhanh hơn nhiều
   ├─ Tránh throttling oan ở lúc khởi động (JVM khởi tạo rất ngốn CPU)
   └─ requests đã đảm bảo phần tối thiểu rồi
```

Khuyến nghị thực dụng hiện nay:

| Loại workload | `requests.cpu` | `limits.cpu` |
|---|---|---|
| Dịch vụ nhạy độ trễ (API, web) | **Đặt** | **Không đặt** |
| Batch, worker nền | Đặt | Đặt (tránh ăn hết CPU) |
| Agent giám sát (DaemonSet) | Đặt | **Không đặt** — xem [Phase 17 bài 2](../phase-17/02-daemonset.md) |
| Môi trường nhiều tenant | Đặt | **Đặt** (bắt buộc để cách ly) |

**`limits.memory` thì luôn phải đặt** — không có nó, một Pod rò rỉ bộ nhớ sẽ làm OOM cả node và giết luôn Pod của người khác.

---

## Đặt con số bao nhiêu — quy trình đo

Đừng đoán. Quy trình bốn bước:

```text
   1. Chạy KHÔNG limits ở staging, tải thật, ít nhất 24 giờ
   2. Đo p50, p95, p99 của CPU và bộ nhớ
   3. Đặt:  requests = p50 (hoặc p90 cho dịch vụ quan trọng)
            limits   = p99 × 1,5
   4. Theo dõi throttling và OOM, điều chỉnh lại
```

```bash
# Đo nhanh nếu có metrics-server
kubectl top pods --containers --sort-by=memory

# Chính xác hơn nếu có Prometheus
# quantile_over_time(0.99, container_memory_working_set_bytes{pod=~"myapp.*"}[7d])
```

Ví dụ thật cho một API Spring Boot:

```text
   Đo được: CPU p50=180m, p99=650m | RAM p50=420Mi, p99=680Mi

   resources:
     requests: {cpu: 200m, memory: 512Mi}
     limits:   {memory: 1Gi}          # không đặt limits.cpu
```

---

## LimitRange và ResourceQuota — chặn ở cấp namespace

Đừng tin mọi người sẽ nhớ đặt resources. Ép ở cấp namespace:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: mac-dinh
  namespace: production
spec:
  limits:
    - type: Container
      default:                       # limits mặc định nếu không khai
        cpu: 500m
        memory: 512Mi
      defaultRequest:                # requests mặc định nếu không khai
        cpu: 100m
        memory: 128Mi
      max:                           # trần, vượt là bị TỪ CHỐI
        cpu: "4"
        memory: 8Gi
      min:
        cpu: 10m
        memory: 16Mi
```

`LimitRange` tự động **loại bỏ hoàn toàn lớp BestEffort** trong namespace đó — mọi Pod đều có ít nhất giá trị mặc định.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: han-muc
  namespace: production
spec:
  hard:
    requests.cpu: "50"
    requests.memory: 100Gi
    limits.cpu: "100"
    limits.memory: 200Gi
    persistentvolumeclaims: "20"
    count/deployments.apps: "50"
```

> **Bẫy của ResourceQuota**: một khi namespace có quota về CPU/bộ nhớ, **mọi Pod bắt buộc phải khai `requests` và `limits`**, nếu không sẽ bị từ chối với lỗi khó hiểu:
> ```text
> Error: pods "myapp-xxx" is forbidden: failed quota: han-muc:
>   must specify limits.cpu for: app; limits.memory for: app
> ```
> Cách chữa: luôn tạo `LimitRange` **cùng lúc** với `ResourceQuota`.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Không đặt gì cả | Pod **BestEffort**, bị giết đầu tiên khi node căng | Luôn đặt ít nhất `requests` |
| Viết `512M` thay `512Mi` | Ít hơn ~5% bộ nhớ → OOM bất ngờ | Luôn dùng hậu tố `Mi`, `Gi` |
| Không đặt `limits.memory` | Một Pod rò rỉ làm **OOM cả node**, giết Pod người khác | Luôn đặt |
| Đặt `limits.cpu` cho dịch vụ nhạy độ trễ | **Throttling âm thầm**, p99 tăng vọt, không có lỗi | Cân nhắc bỏ `limits.cpu` |
| Quên sidecar khi muốn Guaranteed | **Cả Pod** tụt xuống Burstable | Đặt `requests==limits` cho **mọi** container |
| JVM không biết giới hạn container | OOMKilled dù `-Xmx` trông hợp lý | `-XX:MaxRAMPercentage=75` |
| Đặt heap bằng đúng `limits.memory` | Không còn chỗ cho metaspace, thread stack | Heap ≈ **70–75%** của limits |
| `requests` bằng `limits` cho mọi thứ | Lãng phí lớn — cụm chỉ dùng 30% mà không xếp thêm Pod được | Chỉ Guaranteed cho dịch vụ quan trọng |
| Đặt `requests` quá cao "cho chắc" | Scheduler không xếp được Pod, `Pending`, tốn tiền node thừa | Đo rồi đặt |
| `ResourceQuota` mà không `LimitRange` | Pod bị từ chối với lỗi khó hiểu | Tạo cả hai cùng lúc |
| Không theo dõi `nr_throttled` | Ứng dụng chậm mà không ai biết vì sao | Đưa vào bộ chỉ số giám sát |

---

## Tóm tắt bài 1

- **`requests` là thứ scheduler nhìn** để chọn node và là phần được đảm bảo. **`limits` là trần do kernel cưỡng chế** — scheduler **không quan tâm tới limits**, nên cụm luôn ở trạng thái **overcommit**.
- **CPU nén được** → vượt limits thì bị **điều tiết**, chạy chậm. **Bộ nhớ không nén được** → vượt limits thì bị **giết ngay (OOMKilled, mã thoát 137)**.
- Luôn dùng hậu tố nhị phân **`Mi`/`Gi`**. `512M` ít hơn `512Mi` khoảng 5% — đủ gây OOM.
- **Ba lớp QoS** quyết định thứ tự bị đuổi: **BestEffort** (giết đầu tiên) → **Burstable** → **Guaranteed** (giết cuối). Chỉ cần **một container** (kể cả sidecar) lệch `requests`/`limits` là **cả Pod** tụt xuống Burstable.
- Ba nguyên nhân OOMKilled: limits quá thấp, **rò rỉ bộ nhớ** (tăng limits chỉ kéo dài chu kỳ), và **runtime không biết giới hạn container** — với JVM thì dùng **`-XX:MaxRAMPercentage=75`**, không dùng `-Xmx` cố định.
- **Throttling CPU âm thầm hơn OOM** — không có lỗi nào, chỉ là chậm. Kiểm tra bằng `/sys/fs/cgroup/cpu.stat`; tỉ lệ `nr_throttled/nr_periods` vượt ~5% là đáng lo.
- Khuyến nghị hiện nay: **luôn đặt `limits.memory`**, nhưng **cân nhắc KHÔNG đặt `limits.cpu`** cho dịch vụ nhạy độ trễ và agent giám sát.
- Đừng đoán con số: chạy không limits ở staging 24 giờ, đo p50/p99, đặt **`requests` = p50**, **`limits` = p99 × 1,5**, rồi theo dõi và điều chỉnh.
- **`LimitRange`** áp giá trị mặc định (xoá sổ lớp BestEffort trong namespace); **`ResourceQuota`** chặn tổng mức. Phải tạo **cả hai cùng lúc**, nếu không Pod bị từ chối với lỗi khó hiểu.

**Bài kế tiếp** → [Bài 2: Ba loại probe — và vì sao livenessProbe nguy hiểm](02-probes-va-bay-liveness.md)

# Case 2: CPU throttling trên Kubernetes — bị bóp cổ mà không biết

Đây là case gây bối rối nhất trong toàn bộ khoá học, vì mọi chỉ số đều nói "ổn":

```text
   CPU usage:     35%     ← còn dư nhiều
   Memory:        40%     ← thoải mái
   Thread pool:   20%     ← không cạn
   Database:      khoẻ
   Downstream:    khoẻ

   Nhưng: p99 latency = 2.400 ms (bình thường 80 ms)
```

Bạn tăng số pod. Không cải thiện. Bạn tăng thread. Tệ hơn. Bạn tăng CPU limit... và đột nhiên mọi thứ tốt lên.

Vì sao? Vì "CPU usage 35%" là một con số **gây hiểu lầm nghiêm trọng**.

## Cơ chế: CFS quota

Kubernetes giới hạn CPU bằng cơ chế **CFS (Completely Fair Scheduler)** của nhân Linux. Nó hoạt động theo **chu kỳ**, không phải theo tốc độ:

```text
   resources:
     limits:
       cpu: "1"          ← nghĩa là gì?

   Dịch sang cgroup:
   cpu.cfs_period_us = 100000    (chu kỳ 100 ms)
   cpu.cfs_quota_us  = 100000    (được dùng 100 ms CPU mỗi chu kỳ)

   Nghĩa là: mỗi 100 ms, container được dùng tổng cộng 100 ms CPU-time.
```

Điểm mấu chốt: **quota được tính trên tổng của MỌI thread**.

```text
   Container có limit = 1 CPU, nhưng chạy trên máy 8 core
   Ứng dụng có 4 thread cùng chạy:

   ├─ 4 thread × 25 ms = 100 ms CPU-time  → hết quota sau 25 ms thực!
   └─ 75 ms còn lại của chu kỳ: TẤT CẢ THREAD BỊ ĐÓNG BĂNG

   Thời gian
   0ms ────25ms──────────────────────100ms
   │███████│░░░░░░░░░░░░░░░░░░░░░░░░░│  chu kỳ 1
     chạy      BỊ THROTTLE (đóng băng)
```

**Container bị đóng băng 75% thời gian, nhưng "CPU usage" báo cáo là 100% × 25% = 25%.**

Đây chính là lý do chỉ số CPU nói "còn dư" trong khi ứng dụng đang bị bóp nghẹt.

## Vì sao Java đặc biệt dễ dính

JVM tạo rất nhiều thread ngay cả khi ứng dụng đơn giản:

```text
   ├─ 200 Tomcat worker thread
   ├─ N thread GC (theo số core JVM nhìn thấy)
   ├─ Thread JIT compiler (C1, C2)
   ├─ Thread cho các pool khác (@Async, Kafka consumer, scheduler)
   └─ Thread nội bộ của JVM

   Với limit = 1 CPU và 30 thread cùng muốn chạy:
   → Quota cạn trong vài mili-giây
   → Đóng băng phần còn lại của chu kỳ
```

Tệ hơn: **GC cũng bị throttle**. GC pause 50 ms có thể kéo dài thành 500 ms vì bị đóng băng giữa chừng. Case 1 và case 2 nhân nhau lên.

## Chẩn đoán

### Metric quyết định

```promql
# Tỉ lệ chu kỳ bị throttle — CHỈ SỐ QUAN TRỌNG NHẤT
rate(container_cpu_cfs_throttled_periods_total[5m])
  / rate(container_cpu_cfs_periods_total[5m])

# Tổng thời gian bị đóng băng
rate(container_cpu_cfs_throttled_seconds_total[5m])
```

Ngưỡng đánh giá:

| Tỉ lệ throttle | Đánh giá |
|---|---|
| 0-1% | Bình thường |
| 1-5% | Chấp nhận được, nhưng nên xem lại |
| 5-25% | **Có vấn đề rõ ràng** |
| > 25% | **Nghiêm trọng** — đây là nguyên nhân chính |

**Nếu bạn chỉ thêm được một cảnh báo mới sau khi đọc khoá này, hãy chọn cảnh báo này.** Nó phát hiện được một loại sự cố mà không chỉ số nào khác nhìn thấy.

### Kiểm tra trực tiếp trong container

```bash
kubectl exec -it <pod> -- cat /sys/fs/cgroup/cpu.stat
```

```text
nr_periods 145821          # tổng số chu kỳ
nr_throttled 89234         # số chu kỳ bị throttle  → 61%!
throttled_usec 412839221   # tổng thời gian bị đóng băng: 412 giây
```

```bash
# cgroup v1 (cụm cũ)
kubectl exec -it <pod> -- cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us
kubectl exec -it <pod> -- cat /sys/fs/cgroup/cpu/cpu.cfs_period_us
```

## Requests và Limits — hiểu cho đúng

```yaml
resources:
  requests:
    cpu: "500m"        # ĐẢM BẢO tối thiểu; dùng để lập lịch pod
    memory: "1Gi"
  limits:
    cpu: "2"           # TRẦN CỨNG; vượt là bị throttle
    memory: "2Gi"      # vượt là bị GIẾT (OOMKilled)
```

Khác biệt sống còn giữa CPU và bộ nhớ:

| Tài nguyên | Vượt limit thì |
|---|---|
| **CPU** | Bị **throttle** (chậm lại, vẫn sống) |
| **Bộ nhớ** | Bị **giết** (OOMKilled, không cảnh báo) |

Vì vậy chiến lược cho hai loại phải khác nhau:

- **Bộ nhớ**: `requests = limits`. Đặt đúng và chặt, vì vượt là chết.
- **CPU**: `requests` đủ dùng, `limits` **rộng rãi hoặc không đặt**.

### Ba lớp QoS của Kubernetes

| Lớp | Điều kiện | Bị giết khi node thiếu tài nguyên |
|---|---|---|
| **Guaranteed** | `requests == limits` cho cả CPU và RAM | Cuối cùng (an toàn nhất) |
| **Burstable** | `requests < limits` | Ở giữa |
| **BestEffort** | Không đặt gì | **Đầu tiên** |

Với dịch vụ quan trọng, nên ở lớp Guaranteed cho **bộ nhớ**. Nhưng với CPU, việc đặt `limits = requests` thường gây throttle không cần thiết.

## Bốn cách xử lý CPU throttling

### 1. Bỏ CPU limit (gây tranh cãi nhưng thường đúng)

```yaml
resources:
  requests:
    cpu: "1"           # đảm bảo được 1 CPU
    memory: "2Gi"
  limits:
    memory: "2Gi"      # CHỈ giới hạn bộ nhớ, KHÔNG giới hạn CPU
```

Logic đằng sau:

```text
   Với CPU request = 1, pod ĐƯỢC ĐẢM BẢO ít nhất 1 CPU
   (CFS shares đảm bảo điều này khi có tranh chấp).

   Không có limit ⇒ khi node còn CPU rảnh, pod dùng thêm được
   ⇒ Xử lý được đỉnh tải, khởi động nhanh hơn, GC không bị throttle
```

Nhiều tổ chức lớn khuyến nghị hướng này cho workload nhạy latency. Lập luận: CPU là tài nguyên **có thể nén được** (compressible) — thiếu thì chậm chứ không chết, nên việc giới hạn cứng ít mang lại lợi ích.

Đánh đổi phải cân nhắc:

| Được | Mất |
|---|---|
| Không bị throttle | Một pod có thể "ăn" CPU của pod khác (noisy neighbor) |
| Khởi động nhanh (JIT không bị bóp) | Khó dự đoán chi phí |
| GC hoạt động tốt | Không phù hợp với môi trường nhiều tenant không tin nhau |

**Khi nào nên bỏ limit**: workload nội bộ, đội tự quản lý cluster, dịch vụ nhạy latency.
**Khi nào phải giữ limit**: môi trường nhiều khách hàng, cần tính chi phí chính xác, hoặc có workload hay chạy loạn.

### 2. Đặt limit rộng rãi

Nếu chính sách bắt buộc phải có limit:

```yaml
resources:
  requests:
    cpu: "1"
  limits:
    cpu: "4"           # gấp 4 lần request, đủ chỗ cho đỉnh
```

Nguyên tắc: `limit ≥ 2-4 × request` cho ứng dụng Java, vì các đợt bùng phát (GC, JIT, khởi động) rất nhọn.

### 3. Giảm số thread cho khớp với quota

Nếu buộc phải giữ limit thấp, hãy giảm số thread:

```yaml
env:
  - name: JAVA_TOOL_OPTIONS
    value: >-
      -XX:ActiveProcessorCount=2
      -XX:ParallelGCThreads=2
      -XX:CICompilerCount=2
server:
  tomcat:
    threads:
      max: 50            # thay vì 200
```

`-XX:ActiveProcessorCount` quan trọng: nó bảo JVM "coi như có 2 CPU", ảnh hưởng tới số thread GC, kích thước `ForkJoinPool.commonPool`, và nhiều heuristic khác.

> JVM hiện đại (JDK 10+) có nhận biết container và tự đọc CFS quota. Nhưng nó làm tròn **lên**: quota 1,5 CPU → JVM báo 2 processor. Với quota nhỏ hơn 1 (ví dụ `500m`), JVM báo 1 processor — và `ForkJoinPool.commonPool` chỉ có **0 thread song song** (`n-1`), khiến `parallelStream()` chạy hoàn toàn trên thread gọi (phase-2 case 4).

### 4. Tăng chu kỳ CFS (cấp cluster)

```bash
# Chu kỳ ngắn hơn → throttle mượt hơn, ít giật cục
--cpu-cfs-quota-period=10ms      # thay vì 100ms mặc định
```

Với chu kỳ 10 ms, việc bị throttle chia thành nhiều lát nhỏ thay vì một cú đóng băng 75 ms — độ trễ mượt hơn nhiều dù tổng lượng CPU không đổi.

Đây là cấu hình ở mức kubelet, cần quyền quản trị cluster.

## Vấn đề liên quan: bộ nhớ và OOMKilled

```text
   Container limit: 2 GB
   JVM -Xmx: 2 GB          ← SAI

   JVM dùng 2 GB heap + 300 MB metaspace + 200 MB thread stack
                        + 150 MB code cache + 100 MB native buffer
   = 2,75 GB > 2 GB limit
   ⇒ OOMKilled — và KHÔNG có heap dump, KHÔNG có log lỗi.
```

Bộ nhớ ngoài heap mà nhiều người quên:

| Thành phần | Kích thước điển hình |
|---|---|
| Metaspace (class metadata) | 100-500 MB |
| Thread stack | 1 MB × số thread |
| Code cache (JIT) | 100-250 MB |
| GC structures | 5-10% heap |
| Direct ByteBuffer (Netty, NIO) | Tuỳ ứng dụng |
| Native memory (nén, mã hoá, JNI) | Tuỳ thư viện |

```yaml
env:
  - name: JAVA_TOOL_OPTIONS
    value: >-
      -XX:MaxRAMPercentage=70.0
      -XX:MaxMetaspaceSize=256m
      -XX:MaxDirectMemorySize=256m
      -XX:+HeapDumpOnOutOfMemoryError
      -XX:HeapDumpPath=/dumps/
```

Chẩn đoán OOMKilled:

```bash
kubectl describe pod <pod> | grep -A5 "Last State"
```

```text
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137          ← 128 + 9 (SIGKILL)
```

**Exit code 137 = bị hệ điều hành giết vì hết bộ nhớ.** Đây là dấu hiệu khác hẳn với `OutOfMemoryError` của Java (mã 1 hoặc 3): nếu là 137, JVM không hề biết chuyện gì xảy ra, và bạn không có heap dump.

Để phân tích bộ nhớ ngoài heap:

```bash
java -XX:NativeMemoryTracking=summary -jar app.jar
jcmd <pid> VM.native_memory summary
```

## Trường hợp thực tế: 30 pod chậm bí ẩn

Bối cảnh: dịch vụ API trên Kubernetes, 30 pod, latency p99 dao động 200-3.000 ms không theo quy luật nào.

**Cấu hình ban đầu**:

```yaml
resources:
  requests: { cpu: "200m", memory: "1Gi" }
  limits:   { cpu: "500m", memory: "1Gi" }
```

**Chẩn đoán**:

```promql
rate(container_cpu_cfs_throttled_periods_total[5m])
  / rate(container_cpu_cfs_periods_total[5m])
→ 0.73        # 73% chu kỳ bị throttle!
```

Nguyên nhân: `limit 500m` nghĩa là 50 ms CPU mỗi chu kỳ 100 ms. Nhưng JVM có 200 Tomcat thread + 4 GC thread + 2 JIT thread. Chỉ cần 3 request đồng thời là quota cạn.

**Các bước sửa và kết quả**:

| Bước | Thay đổi | Throttle | p99 |
|---|---|---|---|
| 0 | Ban đầu | 73% | 2.400 ms |
| 1 | `limits.cpu: "2"` | 12% | 380 ms |
| 2 | `+ ActiveProcessorCount=2`, `threads.max: 60` | 3% | 145 ms |
| 3 | Bỏ hẳn `limits.cpu`, `requests.cpu: "1"` | **0%** | **85 ms** |
| 4 | Giảm từ 30 pod xuống **18 pod** | 0% | 82 ms |

Bước 4 là kết quả bất ngờ nhất: **ít pod hơn nhưng nhanh hơn và rẻ hơn**. Vì mỗi pod trước đây bị bóp nghẹt tới mức gần như vô dụng; sau khi mở giới hạn, 18 pod làm được nhiều hơn 30 pod cũ.

Chi phí hạ tầng giảm 40% trong khi hiệu năng tăng 29 lần.

Đây cũng là một minh hoạ cho Universal Scalability Law (phase-1 bài 5) từ một góc khác: thêm instance không giúp gì khi mỗi instance đang bị giới hạn nhân tạo.

## Các vấn đề hạ tầng anh em

Cùng họ với CPU throttling — những giới hạn ẩn ở tầng hạ tầng:

| Vấn đề | Dấu hiệu | Kiểm tra |
|---|---|---|
| **Disk I/O throttle** (EBS gp2 burst hết) | I/O chậm đột ngột sau vài giờ | CloudWatch `BurstBalance` |
| **Network throttle** (instance nhỏ) | Băng thông giảm sau một thời gian | `ethtool -S` |
| **Conntrack đầy** | Kết nối mới bị drop | `nf_conntrack_count` vs `_max` |
| **Node quá tải** | Mọi pod trên node đó chậm | `node_load5` / số core |
| **Pod bị đuổi (eviction)** | Pod biến mất không rõ lý do | `kubectl get events` |

Vấn đề conntrack đáng chú ý: Linux theo dõi mỗi kết nối trong bảng `conntrack`. Bảng đầy thì kết nối mới bị **âm thầm loại bỏ** — không có lỗi, chỉ là timeout.

```bash
sysctl net.netfilter.nf_conntrack_count
sysctl net.netfilter.nf_conntrack_max
# Nếu count gần max → tăng max hoặc giảm timeout
```

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Chỉ nhìn "CPU usage" | Bỏ sót hoàn toàn throttling |
| Đặt `limits.cpu` sát `requests` | Throttle liên tục |
| Đặt CPU limit nhỏ hơn 1 cho ứng dụng Java | Thảm hoạ — quota cạn tức thì |
| `-Xmx` = memory limit | OOMKilled, không có heap dump |
| Quên bộ nhớ ngoài heap | OOMKilled dù heap còn trống |
| Không đặt `ActiveProcessorCount` khi limit thấp | JVM tạo quá nhiều thread |
| Thêm pod khi đang bị throttle | Tốn tiền, không cải thiện |
| Không phân biệt exit code 137 và OOM của Java | Chẩn đoán sai hướng |

## Tóm tắt case 2

- CFS quota tính trên **tổng CPU-time của mọi thread** trong chu kỳ 100 ms — hết quota thì **đóng băng toàn bộ**.
- **"CPU usage 35%" có thể đi kèm 70% thời gian bị đóng băng.** Chỉ số CPU thông thường không phát hiện được.
- Metric quyết định: **`container_cpu_cfs_throttled_periods_total / cfs_periods_total`**. Trên 5% là có vấn đề.
- Java đặc biệt dễ dính vì có rất nhiều thread; **GC cũng bị throttle** làm pause dài ra.
- Chiến lược: **bộ nhớ `requests = limits`** (vượt là chết), **CPU limit rộng rãi hoặc bỏ hẳn** (vượt chỉ chậm).
- Nếu phải giữ limit: `-XX:ActiveProcessorCount` + giảm `threads.max` cho khớp.
- `-Xmx` phải nhỏ hơn nhiều so với memory limit — nhớ metaspace, stack, code cache, direct buffer.
- **Exit code 137 = OOMKilled bởi hệ điều hành**, khác hẳn `OutOfMemoryError` của Java.

**Bài kế tiếp** → [Case 3: Cạn port và file descriptor — giới hạn không ai nghĩ tới](03-case-can-port-fd.md)

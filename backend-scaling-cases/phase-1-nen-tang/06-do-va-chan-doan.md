# Bài 6: Đo và chẩn đoán — bắt quả tang nút thắt trong 15 phút

3 giờ sáng, cảnh báo nổ: API chậm. Bạn có 15 phút trước khi khách hàng lớn gọi điện. Làm gì?

Người mới sẽ mở log, cuộn lên cuộn xuống, đoán mò, restart service. Người có kinh nghiệm chạy đúng một chuỗi lệnh và biết chính xác thread nào đang kẹt ở dòng code nào. Bài này dạy chuỗi lệnh đó.

## Quy trình chẩn đoán 5 bước

```text
  1. Còn sống không?        → health check, tỉ lệ 5xx
  2. Chậm ở tầng nào?       → so latency ở LB vs ở app
  3. Tài nguyên nào cạn?    → 4 metric bão hoà (saturation)
  4. Thread đang làm gì?    → thread dump
  5. Chờ ai?                → DB active query / downstream latency
```

Đi tuần tự, đừng nhảy cóc. Mỗi bước loại bỏ một nửa khả năng.

## Bước 1-2: Chậm ở tầng nào?

Câu hỏi đầu tiên luôn là: **thời gian mất ở đâu?**

```text
   [Client] ──?ms──→ [LB] ──?ms──→ [App] ──?ms──→ [DB]

   Nếu:  LB đo 3000 ms,  App đo 50 ms
   ⇒ 2950 ms là thời gian XẾP HÀNG chờ thread. Nút thắt = thread pool.

   Nếu:  LB đo 3000 ms,  App đo 2900 ms,  DB đo 20 ms
   ⇒ Thời gian nằm trong code hoặc gọi service ngoài. Không phải DB.

   Nếu:  App đo 2900 ms,  DB đo 2800 ms
   ⇒ Query chậm hoặc chờ lock. Đi thẳng phase-3.
```

Đây là kỹ thuật đơn giản nhưng loại được 70% khả năng chỉ trong 2 phút. Điều kiện: bạn phải có sẵn metric ở cả ba tầng — chuẩn bị trước, không phải lúc sự cố mới dựng.

## Bước 3: Bốn metric bão hoà cần nhìn đầu tiên

Với Spring Boot, thêm dependency:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,metrics,prometheus,threaddump,heapdump
  metrics:
    distribution:
      percentiles-histogram:
        http.server.requests: true    # BẮT BUỘC nếu muốn p99 chính xác
      slo:
        http.server.requests: 100ms,300ms,1s,3s
```

Bốn metric quan trọng nhất, theo thứ tự nhìn:

| # | Metric | Ý nghĩa | Ngưỡng báo động |
|---|---|---|---|
| 1 | `tomcat.threads.busy / tomcat.threads.config.max` | Thread pool đầy chưa | > 80% |
| 2 | `hikaricp.connections.pending` | Số thread đang **chờ** mượn connection DB | > 0 kéo dài |
| 3 | `hikaricp.connections.acquire` (p99) | Chờ bao lâu mới mượn được connection | > 50 ms |
| 4 | `jvm.threads.states{state="blocked"}` | Thread bị chặn bởi lock trong JVM | > 5% tổng số |

Truy vấn PromQL sẵn dùng:

```promql
# 1. Thread pool đã đầy bao nhiêu phần trăm
tomcat_threads_busy_threads / tomcat_threads_config_max_threads

# 2. Có ai đang xếp hàng chờ connection DB không (số > 0 là nguy hiểm)
hikaricp_connections_pending

# 3. p99 thời gian chờ mượn connection
histogram_quantile(0.99, rate(hikaricp_connections_acquire_seconds_bucket[5m]))

# 4. p99 latency HTTP theo từng endpoint
histogram_quantile(0.99,
  sum by (uri, le) (rate(http_server_requests_seconds_bucket[5m])))
```

### Cách đọc tổ hợp — bảng chẩn đoán nhanh

| `threads.busy` | `connections.pending` | CPU | Kết luận | Đi tới |
|---|---|---|---|---|
| Cao (>80%) | 0 | Cao (>80%) | Thật sự thiếu CPU | Scale ngang |
| Cao | 0 | **Thấp** | Thread bị giam bởi I/O bên ngoài | phase-2 bài 1, 3 |
| Cao | **Cao** | Thấp | Pool DB quá nhỏ hoặc query giữ connection lâu | phase-2 bài 2 |
| Thấp | Thấp | Thấp | Nút thắt **không ở app** — xem LB, DNS, mạng | phase-6 |
| Cao | 0 | Thấp, `blocked` cao | Lock trong Java (`synchronized`) | phase-2 bài 6 |
| Dao động mạnh | — | Răng cưa | GC pause | phase-6 bài 1 |

Dòng thứ hai là tình huống phổ biến nhất trong đời thực: **thread đầy nhưng CPU thấp**. Nó luôn có nghĩa là "đang chờ ai đó", và bước 4 sẽ cho biết chờ ai.

## Bước 4: Thread dump — công cụ mạnh nhất và bị dùng ít nhất

**Thread dump** là ảnh chụp tức thời trạng thái của **mọi** thread trong JVM: đang chạy hàm nào, đang chờ gì. Nó trả lời chính xác câu hỏi "200 thread của tôi đang làm gì?".

### Cách lấy

```bash
# Cách 1: jstack (có sẵn trong JDK)
jstack <pid> > dump1.txt

# Cách 2: kill -3 (không giết tiến trình, chỉ in dump ra stdout)
kill -3 <pid>

# Cách 3: qua Actuator (tiện nhất trong container)
curl localhost:8080/actuator/threaddump > dump1.json

# Trong Kubernetes
kubectl exec -it <pod> -- jstack 1 > dump1.txt
```

> **Nguyên tắc vàng**: lấy **3 dump cách nhau 5-10 giây**. Một dump chỉ là một khoảnh khắc — có thể bạn chụp đúng lúc thread đang chạy bình thường. Ba dump cho thấy cái gì **đứng yên** — và cái đứng yên chính là thủ phạm.

### Cách đọc — 6 trạng thái thread

| Trạng thái | Nghĩa là | Đáng lo không |
|---|---|---|
| `RUNNABLE` | Đang chạy **hoặc đang chờ I/O mạng** | Tuỳ — xem stack trace |
| `BLOCKED` | Đang chờ vào `synchronized` mà thread khác giữ | **Rất đáng lo** |
| `WAITING` | Chờ vô thời hạn (`wait()`, `park()`) | Thường là bình thường (thread nhàn rỗi) |
| `TIMED_WAITING` | Chờ có hạn (`sleep()`, `poll(timeout)`) | Tuỳ ngữ cảnh |
| `NEW` / `TERMINATED` | Chưa chạy / đã xong | Không |

**Cạm bẫy lớn nhất cho người mới**: `RUNNABLE` **không** có nghĩa là đang dùng CPU. Java đánh dấu thread đang chờ đọc socket là `RUNNABLE` (vì JVM không biết OS đang chặn nó). Một thread đứng chờ HTTP response 30 giây vẫn hiện `RUNNABLE`. Phải nhìn **stack trace** mới biết.

### Ba mẫu stack trace cần thuộc lòng

**Mẫu 1 — Thread bị giam vì gọi HTTP chậm** (case phổ biến nhất của phase-2):

```text
"http-nio-8080-exec-42" #142 daemon prio=5 os_prio=0 tid=0x... nid=0x1f2 runnable
   java.lang.Thread.State: RUNNABLE
        at java.net.SocketInputStream.socketRead0(Native Method)     ← ĐANG CHỜ MẠNG
        at java.net.SocketInputStream.read(SocketInputStream.java:168)
        at org.apache.http.impl.io.SessionInputBufferImpl.fillBuffer(...)
        at org.springframework.web.client.RestTemplate.doExecute(...)
        at com.shop.order.PaymentClient.charge(PaymentClient.java:45)  ← CODE CỦA BẠN
        at com.shop.order.OrderService.placeOrder(OrderService.java:88)
```

Dấu hiệu nhận biết: `socketRead0` + tên class client HTTP. Nếu **nhiều chục thread** cùng nằm ở đây → downstream đang chậm, thread pool sắp cạn.

**Mẫu 2 — Thread chờ mượn connection từ HikariCP**:

```text
"http-nio-8080-exec-88" #188 daemon waiting on condition
   java.lang.Thread.State: TIMED_WAITING (parking)
        at jdk.internal.misc.Unsafe.park(Native Method)
        - parking to wait for <0x000000076b2f1a30> (a java.util.concurrent...)
        at com.zaxxer.hikari.util.ConcurrentBag.borrow(ConcurrentBag.java:151)  ← MẤU CHỐT
        at com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:158)
        at com.shop.order.OrderRepository.findById(OrderRepository.java:23)
```

Dấu hiệu: `ConcurrentBag.borrow`. Nghĩa là pool DB đã cạn. Câu hỏi tiếp theo **không phải** "tăng pool lên bao nhiêu" mà là **"ai đang giữ connection và giữ lâu thế để làm gì?"** — xem bước 5.

**Mẫu 3 — Deadlock trong Java** (jstack tự phát hiện và in ra cuối file):

```text
Found one Java-level deadlock:
=============================
"thread-A":
  waiting to lock monitor 0x00007f..., which is held by "thread-B"
"thread-B":
  waiting to lock monitor 0x00007f..., which is held by "thread-A"
```

Nếu thấy dòng `Found one Java-level deadlock` thì bạn không cần đoán gì nữa — jstack đã chỉ tận nơi.

### Đọc nhanh 200 thread bằng một dòng lệnh

Không ai đọc thủ công 200 stack trace. Đếm theo nhóm:

```bash
# Đếm thread theo trạng thái
grep "java.lang.Thread.State" dump1.txt | sort | uniq -c | sort -rn

# Kết quả điển hình khi có sự cố:
#  187 java.lang.Thread.State: RUNNABLE          ← bất thường!
#   12 java.lang.Thread.State: WAITING
#    8 java.lang.Thread.State: TIMED_WAITING

# Xem 187 thread RUNNABLE đó đang ở dòng code nào (dòng đầu của stack)
grep -A1 "java.lang.Thread.State: RUNNABLE" dump1.txt \
  | grep "^\s*at" | sort | uniq -c | sort -rn | head

# Kết quả:
#  184     at java.net.SocketInputStream.socketRead0(Native Method)
#            ⇒ 184/200 thread đang chờ mạng. Nút thắt là downstream, xong.
```

Ba lệnh này giải quyết phần lớn sự cố production. Đáng để lưu lại ở đâu đó dễ tìm.

Công cụ trực quan nếu có thời gian: **fastthread.io** (dán file dump vào, nó vẽ biểu đồ), hoặc **VisualVM**, **JDK Mission Control**.

## Bước 5: Nhìn sang phía database

Nếu bước 4 cho thấy thread đang chờ DB, sang phía DB xem chuyện gì:

### PostgreSQL

```sql
-- Query nào đang chạy, chạy bao lâu rồi, đang chờ gì
SELECT pid,
       now() - query_start AS duration,
       state,
       wait_event_type,
       wait_event,
       left(query, 80) AS query
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY duration DESC
LIMIT 20;
```

Cột cần nhìn:

| Giá trị | Nghĩa | Xử lý |
|---|---|---|
| `state = 'active'`, duration lớn | Query thật sự chậm | Thêm index, sửa query (phase-3 bài 9) |
| `wait_event_type = 'Lock'` | Đang chờ lock của transaction khác | phase-3 bài 1-3 |
| `state = 'idle in transaction'` | **Đã mở transaction rồi ngồi không** | Rất xấu — phase-3 bài 2 |
| Rất nhiều dòng `idle` | Connection pool để dư | Giảm pool |

`idle in transaction` là kẻ thù số một. Nó nghĩa là ứng dụng mở transaction, giữ lock, rồi đi làm việc khác (gọi HTTP, chờ thread). Mọi người khác chờ nó.

```sql
-- Xem ai đang chặn ai (PostgreSQL 9.6+)
SELECT blocked.pid     AS blocked_pid,
       blocked.query   AS blocked_query,
       blocking.pid    AS blocking_pid,
       blocking.query  AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE cardinality(pg_blocking_pids(blocked.pid)) > 0;
```

### MySQL

```sql
SHOW FULL PROCESSLIST;

-- Xem transaction đang chạy và lock
SELECT * FROM information_schema.INNODB_TRX\G

-- MySQL 8: ai chặn ai
SELECT * FROM performance_schema.data_lock_waits;
```

## Công cụ nâng cao: flame graph

Khi CPU **thật sự** cao và bạn cần biết code nào ăn CPU, dùng **async-profiler** để vẽ **flame graph** (biểu đồ ngọn lửa):

```bash
# Lấy mẫu CPU trong 30 giây, xuất ra HTML
./profiler.sh -d 30 -f /tmp/flame.html <pid>

# Lấy mẫu theo thời gian chờ (wall clock) — dùng khi CPU thấp mà chậm
./profiler.sh -e wall -d 30 -f /tmp/wall.html <pid>

# Lấy mẫu theo cấp phát bộ nhớ — dùng khi GC nhiều
./profiler.sh -e alloc -d 30 -f /tmp/alloc.html <pid>
```

Cách đọc: trục ngang là **tỉ lệ thời gian** (càng rộng càng tốn), trục dọc là **độ sâu ngăn xếp gọi hàm**. Tìm khối rộng nhất ở gần đỉnh — đó là hàm tiêu tốn nhiều nhất.

```text
   ┌──────────────────────────────────────────────────┐
   │ main                                             │  100%
   ├──────────────────────────────┬───────────────────┤
   │ OrderService.place           │ other             │
   ├──────────────┬───────────────┤                   │
   │ toJson       │ saveToDb      │                   │
   ├──────────────┤               │                   │
   │ ██████████   │               │                   │  ← 40% thời gian ở đây!
   └──────────────┴───────────────┴───────────────────┘
```

Mẹo quan trọng: chế độ `-e wall` (wall clock) là thứ hiếm ai dùng nhưng cực hữu ích — nó lấy mẫu **cả thời gian chờ**, không chỉ thời gian tính. Đúng cho tình huống "CPU thấp mà chậm".

## Checklist sự cố — dán lên tường

```text
┌─ 15 PHÚT ĐẦU KHI API CHẬM ────────────────────────────────────┐
│                                                                │
│  □ 1. Có deploy/thay đổi cấu hình gì trong 2 giờ qua không?   │
│       → Nếu có: rollback trước, điều tra sau.                  │
│                                                                │
│  □ 2. So latency ở LB vs ở app                                │
│       → Chênh lớn = đang xếp hàng chờ thread                   │
│                                                                │
│  □ 3. tomcat.threads.busy / max  = ?                          │
│  □ 4. hikaricp.connections.pending = ?                        │
│  □ 5. CPU = ?  (nhìn ở độ phân giải 15 giây, xem cả max)       │
│                                                                │
│  □ 6. Lấy 3 thread dump cách nhau 10 giây                     │
│       → grep đếm trạng thái, xem 3 stack trace phổ biến nhất   │
│                                                                │
│  □ 7. pg_stat_activity: có 'idle in transaction' không?       │
│       → có = thủ phạm gần như chắc chắn                        │
│                                                                │
│  □ 8. Downstream nào chậm? (metric client HTTP)               │
│                                                                │
│  Xử lý tạm: bật circuit breaker / tăng timeout xuống /         │
│             load shedding — CHƯA sửa gốc, chỉ cầm máu.         │
└────────────────────────────────────────────────────────────────┘
```

Mục 1 đáng giá nhất: **thống kê ngành cho thấy đa số sự cố production đến từ một thay đổi vừa được đưa lên**. Trước khi làm bất cứ điều gì thông minh, hãy hỏi "vừa có gì đổi?".

## Chuẩn bị trước sự cố — thứ phải làm hôm nay

Lúc sự cố không phải lúc dựng công cụ. Cần có sẵn:

| Việc | Vì sao |
|---|---|
| Bật Actuator + Prometheus, có `percentiles-histogram` | Không có histogram thì không có p99 chính xác |
| Metric ở cả LB và app | Để so được thời gian xếp hàng |
| Bật slow query log của DB (`log_min_duration_statement = 1000`) | Biết query nào chậm mà không cần bắt tại trận |
| `log_lock_waits = on` (PostgreSQL) | Ghi lại mọi lần chờ lock quá lâu |
| Cho phép `kubectl exec` + có sẵn `jstack` trong image | Nhiều image slim không có JDK tool |
| Distributed tracing (OpenTelemetry/Jaeger) | Thấy request đi qua service nào, mất bao lâu ở đâu |
| Runbook viết sẵn cho 5 sự cố hay gặp nhất | 3 giờ sáng não không nghĩ được |

**Distributed tracing** (truy vết phân tán) đáng đầu tư nhất trong danh sách này với hệ nhiều service: mỗi request được gắn một **trace ID** đi xuyên suốt mọi service, cho bạn một biểu đồ thác nước thấy rõ 2 giây bị mất ở đâu — thay vì phải ghép thủ công log của 6 service.

## Bẫy thường gặp khi chẩn đoán

| Bẫy | Hậu quả | Làm đúng |
|---|---|---|
| Restart ngay khi thấy chậm | Mất hiện trường, sự cố tái diễn sau 1 giờ | Lấy thread dump + heap dump **trước** khi restart |
| Chỉ lấy 1 thread dump | Không phân biệt được "đang chạy" và "đang kẹt" | Lấy 3 dump cách 10 giây |
| Tin `RUNNABLE` = đang dùng CPU | Chẩn đoán sai hoàn toàn | Đọc stack trace, `socketRead0` = đang chờ |
| Nhìn CPU trung bình 1 phút | Che mất các đợt bão 100% | Độ phân giải 15 giây + xem max |
| Đọc log ứng dụng đầu tiên | Hai hàng đợi đầu **không sinh log nào** | Xem metric trước, log sau |
| Sửa nhiều thứ cùng lúc | Không biết cái nào có tác dụng | Mỗi lần một thay đổi, đo lại |
| Không ghi lại gì | Lần sau lặp lại từ đầu | Viết postmortem, cập nhật runbook |

## Tóm tắt bài 6

- Quy trình 5 bước: **còn sống → chậm ở tầng nào → tài nguyên nào cạn → thread làm gì → chờ ai**.
- Bốn metric bão hoà: `threads.busy`, `connections.pending`, `connections.acquire` p99, `threads.blocked`.
- Tổ hợp vàng: **thread đầy + CPU thấp = đang chờ I/O**, không phải thiếu máy.
- **Thread dump** trả lời chính xác nhất. Lấy **3 cái cách 10 giây**, `grep` đếm theo nhóm.
- `RUNNABLE` **không** đồng nghĩa với dùng CPU — `socketRead0` là đang chờ mạng.
- Phía DB: `idle in transaction` là thủ phạm số một cần tìm.
- Chuẩn bị công cụ **trước** sự cố; và luôn hỏi đầu tiên: **"vừa có gì thay đổi?"**

**Bài kế tiếp** → [Phase 2 - Bài 1: Case kinh điển — một service chậm làm chết cả hệ thống](../phase-2-thread-connection-pool/01-case-downstream-cham-giam-thread.md)

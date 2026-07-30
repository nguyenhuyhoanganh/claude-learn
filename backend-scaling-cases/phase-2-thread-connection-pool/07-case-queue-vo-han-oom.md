# Case 7: Hàng đợi vô hạn — con đường êm ái tới OutOfMemoryError

`Executors.newFixedThreadPool(10)` — dòng code này xuất hiện trong hầu như mọi dự án Java. Nó cũng là một quả bom hẹn giờ, vì hàng đợi bên trong nó **không có giới hạn**.

Bài này giải thích vì sao "cứ nhận hết rồi xử lý dần" là một trong những ý tưởng tệ nhất trong thiết kế hệ thống, và cách thiết kế hàng đợi cho đúng.

## Hiện tượng

```text
   02:00  Job đồng bộ dữ liệu ban đêm bắt đầu, đẩy 2 triệu message vào executor.
   02:05  Heap từ 400 MB lên 1,2 GB.
   02:11  GC bắt đầu chạy liên tục. Mỗi lần dừng 3-8 giây.
   02:14  Ứng dụng gần như đứng im: 95% thời gian dành cho GC.
   02:16  java.lang.OutOfMemoryError: Java heap space
   02:16  Pod bị Kubernetes giết (OOMKilled), khởi động lại.
   02:17  Job chạy lại từ đầu. Vòng lặp lặp lại.
```

Điều đặc biệt: **không có gì "hỏng"**. Không có service nào chết, không có network error. Ứng dụng chỉ đơn giản là nhận việc nhanh hơn khả năng làm việc, và bộ nhớ hết.

## Cơ chế: hàng đợi phình vô hạn

```text
   Tốc độ nhận việc: 5.000 việc/giây
   Tốc độ xử lý:       500 việc/giây
   Chênh lệch:       4.500 việc/giây tích luỹ

   Mỗi việc chiếm ~2 KB trong bộ nhớ (object + tham chiếu tới dữ liệu)

   Sau 1 phút:  4.500 × 60 × 2 KB  = 540 MB
   Sau 2 phút:  1,08 GB
   Sau 3 phút:  1,62 GB  →  OutOfMemoryError
```

Hệ thống có **3 phút** trước khi chết. Và nó chết một cách hoàn toàn có thể dự đoán được — chỉ cần biết trước hai con số tốc độ.

### Đường đi tới cái chết, chi tiết hơn

```text
   Heap
    │                                             ╱│ OOM
 2G │                                          ╱   │
    │                                      ╱       │
 1G │                            ╱─────                Full GC liên tục
    │              ╱──────                             (mỗi lần 5 giây)
500M│─────────                                          │
    └──────────────────────────────────────────────────→ thời gian
       0      1p      2p      3p

   Latency
    │                                          ████████
    │                                    ██████
    │                        ████████████
    │──────────────────────
    └──────────────────────────────────────────────────→
                    ↑ GC bắt đầu ăn CPU
```

Chú ý giai đoạn trước OOM: **GC thrashing** (GC quay cuồng). JVM dành gần hết CPU để dọn rác nhưng dọn được rất ít, vì mọi object trong hàng đợi đều đang "sống" (còn được tham chiếu). Ứng dụng vẫn chạy nhưng chậm gấp 50 lần.

JVM có cơ chế phát hiện tình trạng này:

```text
java.lang.OutOfMemoryError: GC overhead limit exceeded
```

Nghĩa là: JVM dành hơn 98% thời gian cho GC mà thu hồi được dưới 2% heap. Nó bỏ cuộc và ném lỗi thay vì tiếp tục ngắc ngoải.

## Những chỗ hàng đợi vô hạn ẩn nấp

### 1. `Executors.newFixedThreadPool` — thủ phạm phổ biến nhất

```java
ExecutorService pool = Executors.newFixedThreadPool(10);
```

Nhìn vào mã nguồn JDK:

```java
public static ExecutorService newFixedThreadPool(int nThreads) {
    return new ThreadPoolExecutor(nThreads, nThreads,
                                  0L, TimeUnit.MILLISECONDS,
                                  new LinkedBlockingQueue<Runnable>());
                                  //  ↑ KHÔNG THAM SỐ = Integer.MAX_VALUE
}
```

`LinkedBlockingQueue` không tham số có sức chứa **2.147.483.647** phần tử. Thực tế nghĩa là: nhận cho tới khi hết RAM.

Tương tự: `newSingleThreadExecutor()` (hàng đợi vô hạn), `newCachedThreadPool()` (hàng đợi 0 nhưng **tạo thread không giới hạn** — hết RAM theo cách khác).

```java
// ĐÚNG — luôn tự tạo ThreadPoolExecutor với hàng đợi có giới hạn
ExecutorService pool = new ThreadPoolExecutor(
    10, 10,                                  // core, max
    60L, TimeUnit.SECONDS,
    new ArrayBlockingQueue<>(500),           // GIỚI HẠN 500
    new ThreadFactoryBuilder().setNameFormat("worker-%d").build(),
    new ThreadPoolExecutor.CallerRunsPolicy()  // hàng đầy thì làm gì
);
```

### 2. `ThreadPoolTaskExecutor` của Spring

```java
ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
ex.setCorePoolSize(10);
ex.setMaxPoolSize(50);
// KHÔNG gọi setQueueCapacity → mặc định Integer.MAX_VALUE
```

Còn một bẫy nữa, tinh vi hơn: `ThreadPoolExecutor` chỉ tạo thread mới **khi hàng đợi đã đầy**. Với hàng đợi vô hạn, hàng không bao giờ đầy, nên:

```text
   corePoolSize = 10, maxPoolSize = 50, queue = vô hạn

   ⇒ Số thread KHÔNG BAO GIỜ vượt quá 10.
   ⇒ maxPoolSize = 50 hoàn toàn vô nghĩa.
```

Rất nhiều người cấu hình `maxPoolSize` rồi thắc mắc vì sao nó không có tác dụng. Đây là lý do.

### 3. `@Async` không cấu hình

Nếu bạn dùng `@Async` mà không định nghĩa bean executor nào, Spring Boot dùng `SimpleAsyncTaskExecutor` — nó **tạo một thread mới cho mỗi tác vụ**, không giới hạn, không tái sử dụng.

```text
   10.000 tác vụ @Async trong 1 phút → 10.000 OS thread
   Mỗi thread 1 MB stack → 10 GB bộ nhớ ngoài heap
   ⇒ OutOfMemoryError: unable to create new native thread
```

Từ Spring Boot 3.2, nếu bật virtual thread thì `SimpleAsyncTaskExecutor` dùng virtual thread — nhẹ hơn nhiều nhưng vẫn không có giới hạn. Luôn định nghĩa executor tường minh.

### 4. Đọc kết quả query không phân trang

```java
List<Order> all = orderRepository.findAll();     // 5 triệu dòng
```

Không phải hàng đợi, nhưng cùng bản chất: nạp toàn bộ vào bộ nhớ. Với 5 triệu entity Hibernate (mỗi cái ~500 byte kèm persistence context), đó là 2,5 GB.

```java
// ĐÚNG — dùng Stream + phân lô, và xoá persistence context định kỳ
@Transactional(readOnly = true)
public void processAll() {
    try (Stream<Order> stream = orderRepository.streamAll()) {
        AtomicInteger count = new AtomicInteger();
        stream.forEach(order -> {
            process(order);
            if (count.incrementAndGet() % 500 == 0) {
                entityManager.flush();
                entityManager.clear();       // giải phóng entity đã xử lý
            }
        });
    }
}
```

Không gọi `clear()` thì persistence context giữ mọi entity đã đọc — bạn stream nhưng vẫn hết RAM.

### 5. Kafka consumer nhận quá nhiều

```yaml
spring:
  kafka:
    consumer:
      max-poll-records: 500          # mỗi lần poll lấy 500 bản ghi
      fetch-max-bytes: 52428800      # 50 MB mỗi lần fetch
```

Nếu xử lý mỗi bản ghi mất 100 ms, 500 bản ghi = 50 giây — vượt `max.poll.interval.ms` (mặc định 5 phút, nhưng vẫn rủi ro). Consumer bị coi là chết, group **rebalance**, message được xử lý lại. Vòng lặp vô tận.

Giảm `max-poll-records` xuống mức xử lý xong trong vài giây là cách đơn giản nhất.

### 6. Buffer trong code reactive

```java
Flux.fromIterable(hugeList)
    .flatMap(this::callService)      // mặc định concurrency = 256
    .subscribe();
```

`flatMap` mặc định cho phép **256 lời gọi đồng thời** và buffer không giới hạn ở tầng dưới. Với dữ liệu lớn, đây là nguồn OOM. Luôn đặt tham số:

```java
Flux.fromIterable(hugeList)
    .flatMap(this::callService, 16)              // giới hạn 16 đồng thời
    .onBackpressureBuffer(1000,                  // buffer có trần
        dropped -> log.warn("Bỏ: {}", dropped),
        BufferOverflowStrategy.DROP_OLDEST)
    .subscribe();
```

## Bốn chính sách khi hàng đợi đầy

Khi đã đặt giới hạn, phải quyết định: đầy thì làm gì? `ThreadPoolExecutor` có 4 lựa chọn sẵn:

| Chính sách | Hành vi | Khi nào dùng |
|---|---|---|
| `AbortPolicy` (mặc định) | Ném `RejectedExecutionException` | Khi bên gọi biết cách xử lý lỗi (trả 503 cho client) |
| `CallerRunsPolicy` | **Thread gọi tự chạy tác vụ** | Tạo backpressure tự nhiên — lựa chọn tốt nhất cho hầu hết trường hợp |
| `DiscardPolicy` | Bỏ lặng lẽ | Chỉ khi mất việc là chấp nhận được (metric, log) |
| `DiscardOldestPolicy` | Bỏ việc cũ nhất, nhận việc mới | Dữ liệu mới có giá trị hơn cũ (giá cả, vị trí GPS) |

`CallerRunsPolicy` đáng giải thích kỹ vì nó thông minh hơn vẻ ngoài:

```text
   Bình thường:
   [Producer] ──submit──→ [Queue] ──→ [Worker pool]
       │ tiếp tục ngay

   Khi hàng đầy với CallerRunsPolicy:
   [Producer] ──submit──→ ✗ đầy
       │
       └─ TỰ CHẠY tác vụ (mất 100 ms)
          ⇒ Producer bị chậm lại 100 ms
          ⇒ Trong 100 ms đó, worker xử lý bớt hàng đợi
          ⇒ Hệ thống TỰ ĐIỀU CHỈNH về cân bằng
```

Đây là **backpressure** (áp lực ngược) ở dạng đơn giản nhất: bên nhận không kịp thì bên gửi tự động chậm lại. Không cần cấu hình phức tạp, không mất dữ liệu.

Điểm cần lưu ý: nếu producer là Tomcat thread, `CallerRunsPolicy` sẽ giam thread đó. Đó là **có chủ ý** — nó chính là cách hệ thống báo cho tầng trên biết rằng đang quá tải.

## Backpressure — nguyên lý tổng quát

Backpressure là khả năng của bên nhận nói với bên gửi: "chậm lại".

```text
   KHÔNG CÓ BACKPRESSURE (đẩy - push)
   [Producer] ──→──→──→──→ [Buffer phình] ──→ [Consumer chậm]
        cứ gửi                 nổ tung

   CÓ BACKPRESSURE (kéo - pull)
   [Producer] ←── "cho tôi 10 cái" ── [Consumer]
        gửi đúng 10             xử lý xong xin tiếp
```

Cơ chế backpressure trong các công nghệ thường gặp:

| Công nghệ | Cơ chế backpressure |
|---|---|
| TCP | Cửa sổ nhận (receive window) — bên nhận báo còn chỗ bao nhiêu |
| Reactive Streams (Reactor, RxJava) | `request(n)` — subscriber xin đúng n phần tử |
| Kafka | Consumer **kéo** (pull), tự quyết tốc độ; `max.poll.records` |
| RabbitMQ | `prefetch count` — chỉ gửi trước n message chưa ack |
| gRPC streaming | Dựa trên cửa sổ HTTP/2 |
| Thread pool | `CallerRunsPolicy` hoặc hàng đợi có giới hạn + từ chối |
| HTTP | Trả `429 Too Many Requests` + header `Retry-After` |

Kafka đáng chú ý: nó là **pull-based** nên có backpressure sẵn theo thiết kế — consumer chậm thì đơn giản là poll ít hơn, message nằm yên trên broker (đĩa, rẻ) chứ không phình trong RAM của consumer. Đây là một lý do lớn khiến Kafka phù hợp cho hệ thống tải cao.

## Đo đúng ngưỡng hàng đợi

Đặt bao nhiêu? Dùng lại định luật Little và một câu hỏi nghiệp vụ:

```text
   Câu hỏi: "Chờ bao lâu thì việc này không còn giá trị nữa?"

   Ví dụ: gửi email xác nhận đơn hàng — chờ tối đa 30 giây là hợp lý.
   Tốc độ xử lý: 100 email/giây
   ⇒ Hàng đợi tối đa = 100 × 30 = 3.000 phần tử

   Kiểm tra bộ nhớ: 3.000 × 2 KB = 6 MB  ✓ chấp nhận được
```

Nếu con số bộ nhớ quá lớn, giảm thời gian chờ chấp nhận được hoặc tăng tốc độ xử lý — đừng giữ hàng đợi lớn chỉ vì "sợ mất việc".

Với việc thật sự không được mất (đơn hàng, thanh toán), **đừng dùng hàng đợi trong bộ nhớ**. Dùng hàng đợi bền vững: Kafka, RabbitMQ, hoặc bảng outbox trong database. Bộ nhớ mất khi pod restart; đĩa thì không.

## Chẩn đoán

### Metric cần theo dõi

```promql
executor_queued_tasks{name="ioExecutor"}          # tăng đều = sắp chết
executor_queue_remaining{name="ioExecutor"}       # giảm về 0 = đầy
jvm_memory_used_bytes{area="heap"}                # tăng đơn điệu = rò rỉ hoặc queue
rate(jvm_gc_pause_seconds_sum[1m])                # > 0.2 = GC ăn 20% thời gian
```

Cảnh báo hữu ích nhất: **hàng đợi tăng đơn điệu trong 5 phút liền**. Nó báo trước OOM khoảng 10-30 phút — đủ thời gian can thiệp.

```promql
# Cảnh báo: hàng đợi chỉ tăng, không giảm
deriv(executor_queued_tasks[5m]) > 0
  and executor_queued_tasks > 100
```

### Phân tích heap dump

Khi đã OOM, cần biết cái gì chiếm bộ nhớ:

```bash
# Tự động dump khi OOM — CẤU HÌNH NÀY NÊN CÓ Ở MỌI SERVICE
java -XX:+HeapDumpOnOutOfMemoryError \
     -XX:HeapDumpPath=/dumps/ \
     -XX:+ExitOnOutOfMemoryError \
     -jar app.jar

# Dump thủ công khi đang chạy
jcmd <pid> GC.heap_dump /tmp/heap.hprof

# Xem nhanh phân bố object mà không cần dump
jcmd <pid> GC.class_histogram | head -20
```

```text
 num     #instances         #bytes  class name
----------------------------------------------
   1:       4823910      231547680  com.shop.SyncTask          ← 4,8 triệu tác vụ!
   2:       4823910      154365120  java.util.concurrent.LinkedBlockingQueue$Node
   3:       9647820      231547680  java.lang.String
```

Nhìn phát ra ngay: 4,8 triệu `SyncTask` đang nằm trong `LinkedBlockingQueue`. Không cần công cụ gì phức tạp.

Phân tích sâu hơn dùng **Eclipse MAT** (Memory Analyzer Tool) — nó có tính năng "Leak Suspects" tự động chỉ ra object nào giữ nhiều bộ nhớ nhất và **chuỗi tham chiếu** giữ chúng sống.

> Lưu ý về `-XX:+ExitOnOutOfMemoryError`: khi OOM, JVM thường ở trạng thái không đáng tin (một số thread chết, một số còn sống). Thoát hẳn và để orchestrator khởi động lại thường an toàn hơn là cố sống tiếp.

## Case biến thể: rò rỉ bộ nhớ chậm

Không phải OOM nào cũng do hàng đợi. Phân biệt:

| Đặc điểm | Hàng đợi phình | Rò rỉ bộ nhớ (memory leak) |
|---|---|---|
| Tốc độ | Nhanh (phút) | Chậm (ngày, tuần) |
| Liên hệ với tải | Rõ rệt | Ít liên quan |
| Sau khi tải giảm | Heap **giảm lại** | Heap **không giảm** |
| Object chiếm chỗ | Tác vụ, message | Cache tự viết, listener, `ThreadLocal` |

Ba nguồn rò rỉ hay gặp nhất trong ứng dụng web:

1. **`static Map` dùng làm cache** không bao giờ xoá — kinh điển.
2. **`ThreadLocal` không `remove()`** — với thread pool, thread sống mãi nên `ThreadLocal` cũng sống mãi. Đây là nguồn rò rỉ khét tiếng, Tomcat còn in cảnh báo riêng về nó.
3. **Listener/callback đăng ký mà không huỷ đăng ký.**

```java
// ThreadLocal đúng cách — LUÔN dùng try/finally
private static final ThreadLocal<Context> CTX = new ThreadLocal<>();

public void handle(Request req) {
    CTX.set(new Context(req));
    try {
        process();
    } finally {
        CTX.remove();          // BẮT BUỘC với thread pool
    }
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| `Executors.newFixedThreadPool()` | Hàng đợi vô hạn → OOM |
| `newCachedThreadPool()` | Thread vô hạn → OOM kiểu khác |
| Quên `setQueueCapacity` ở Spring | Như trên, và `maxPoolSize` trở nên vô nghĩa |
| Hàng đợi lớn "cho an toàn" | Việc nằm trong hàng lâu quá đã hết giá trị; và tốn RAM |
| `AbortPolicy` mà không bắt exception | Tác vụ mất lặng lẽ |
| Không có metric hàng đợi | Không thấy trước OOM |
| Dùng hàng đợi bộ nhớ cho việc quan trọng | Restart pod là mất sạch |
| Không bật `HeapDumpOnOutOfMemoryError` | OOM rồi mà không biết vì sao |
| `ThreadLocal` không `remove()` | Rò rỉ chậm, rất khó tìm |

## Cấu hình mẫu an toàn

```java
@Bean("ioExecutor")
public ThreadPoolTaskExecutor ioExecutor(MeterRegistry registry) {
    ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
    ex.setCorePoolSize(20);
    ex.setMaxPoolSize(20);
    ex.setQueueCapacity(1000);                     // BẮT BUỘC
    ex.setThreadNamePrefix("io-");
    ex.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
    ex.setWaitForTasksToCompleteOnShutdown(true);  // tắt êm khi deploy
    ex.setAwaitTerminationSeconds(30);
    ex.initialize();

    ExecutorServiceMetrics.monitor(registry, ex.getThreadPoolExecutor(), "ioExecutor");
    return ex;
}
```

```bash
# Tham số JVM nên có ở mọi service
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/dumps/
-XX:+ExitOnOutOfMemoryError
-XX:MaxRAMPercentage=75.0        # dùng 75% RAM container, chừa cho metaspace/stack
```

`MaxRAMPercentage` quan trọng trong container: nếu không đặt, JVM có thể tính heap dựa trên RAM của **máy chủ** thay vì giới hạn của container, dẫn tới bị OOMKilled bởi Kubernetes trước cả khi JVM kịp ném `OutOfMemoryError`. (JVM hiện đại nhận biết cgroup, nhưng đặt tường minh vẫn an toàn hơn.)

## Tóm tắt case 7

- `Executors.newFixedThreadPool()` và `ThreadPoolTaskExecutor` mặc định có **hàng đợi vô hạn**.
- Với hàng đợi vô hạn, **`maxPoolSize` trở nên vô nghĩa** — thread không bao giờ vượt `corePoolSize`.
- Trước OOM luôn có giai đoạn **GC thrashing**: ứng dụng chậm gấp 50 lần nhưng chưa chết.
- Bốn chính sách từ chối; **`CallerRunsPolicy` tạo backpressure tự nhiên** và thường là lựa chọn tốt nhất.
- Kích thước hàng đợi = `tốc_độ_xử_lý × thời_gian_chờ_còn_có_giá_trị`, không phải "càng lớn càng tốt".
- Việc quan trọng thì dùng **hàng đợi bền vững** (Kafka/RabbitMQ/outbox), không dùng bộ nhớ.
- Cảnh báo hiệu quả nhất: **hàng đợi tăng đơn điệu** — báo trước OOM 10-30 phút.
- Luôn bật `-XX:+HeapDumpOnOutOfMemoryError` và đặt `MaxRAMPercentage` trong container.

**Bài kế tiếp** → [Case 8: Async, WebFlux và virtual thread — giải pháp hiện đại và những cái bẫy mới](08-case-async-webflux-virtual-thread.md)

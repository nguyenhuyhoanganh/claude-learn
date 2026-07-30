# Case 8: Async, WebFlux và virtual thread — giải pháp hiện đại và những cái bẫy mới

Bảy case trước đều xoay quanh một hạn chế: **mỗi request chiếm một OS thread, và OS thread thì đắt**. Câu hỏi tự nhiên là: sao không bỏ luôn mô hình đó?

Có ba câu trả lời, ra đời cách nhau nhiều năm, với ba mức độ phức tạp khác nhau. Bài này so sánh cả ba một cách trung thực — bao gồm cả những cái bẫy mà tài liệu quảng cáo không nói.

## Vì sao OS thread đắt

```text
   Một OS thread (Java platform thread):
   ├─ Stack: 1 MB bộ nhớ được đặt trước (mặc định -Xss1m)
   ├─ Tạo mới: ~50-100 micro-giây (gọi xuống kernel)
   ├─ Context switch: 1-10 micro-giây mỗi lần đổi
   └─ Kernel phải quản lý, lập lịch

   10.000 thread = 10 GB chỉ riêng stack.
   Không khả thi.
```

Nhưng đây mới là điều phi lý: trong một request web điển hình, thread **dành 95% thời gian đứng chờ** database và HTTP. Ta đang trả 1 MB RAM cho một thứ hầu như chỉ ngồi không.

```text
   Vòng đời một request 200 ms:
   ├──  5 ms : parse request, chạy logic          (CPU thật sự làm việc)
   ├── 120 ms: CHỜ database
   ├──  60 ms: CHỜ payment service
   └── 15 ms : serialize JSON, ghi response

   Chỉ 20/200 ms = 10% là tính toán thật.
   90% thời gian, thread chỉ chiếm chỗ.
```

## Ba hướng giải quyết

```text
   ┌─ 1. ASYNC/CALLBACK (Servlet 3.0, 2009) ──────────────────┐
   │ Thread trả lại pool trong lúc chờ, callback đánh thức     │
   │ Độ phức tạp: trung bình                                   │
   └───────────────────────────────────────────────────────────┘

   ┌─ 2. REACTIVE (WebFlux, 2017) ────────────────────────────┐
   │ Event loop + non-blocking từ đầu tới cuối                 │
   │ Độ phức tạp: CAO — phải viết lại toàn bộ theo kiểu khác   │
   └───────────────────────────────────────────────────────────┘

   ┌─ 3. VIRTUAL THREAD (Java 21, 2023) ──────────────────────┐
   │ Thread ảo do JVM quản lý, rẻ như object                   │
   │ Độ phức tạp: RẤT THẤP — code cũ gần như giữ nguyên        │
   └───────────────────────────────────────────────────────────┘
```

## Hướng 1: Async servlet

```java
@GetMapping("/orders/{id}")
public CompletableFuture<Order> getOrder(@PathVariable Long id) {
    return CompletableFuture.supplyAsync(() -> orderService.find(id), ioExecutor);
}
```

Tomcat thread được **trả lại pool ngay** sau khi trả về `CompletableFuture`. Khi future hoàn thành, một thread khác lấy kết quả và ghi response.

**Nhưng cái bẫy lớn**: công việc chặn vẫn phải chạy ở đâu đó. Bạn chỉ **chuyển vấn đề** từ Tomcat pool sang `ioExecutor`. Nếu `ioExecutor` cạn, bạn quay lại vạch xuất phát.

Lợi ích thật sự chỉ có khi:
- Bạn muốn **cô lập** (bulkhead) — đúng, hữu ích.
- Công việc bên dưới **thật sự non-blocking** (WebClient, driver reactive) — lúc đó không cần thread nào chờ cả.

Nếu bên dưới vẫn là JDBC chặn, async servlet cho bạn rất ít lợi ích thực chất.

## Hướng 2: Reactive (WebFlux)

```java
@GetMapping("/orders/{id}")
public Mono<OrderView> getOrder(@PathVariable Long id) {
    return orderRepository.findById(id)                    // R2DBC, non-blocking
        .flatMap(order -> paymentClient.getStatus(order.getPaymentId())   // WebClient
            .map(status -> new OrderView(order, status)))
        .switchIfEmpty(Mono.error(new NotFoundException()));
}
```

Mô hình hoàn toàn khác: một số ít **event loop thread** (thường bằng số CPU core) xử lý hàng chục nghìn kết nối.

```text
   Netty event loop (4 thread trên máy 4 core)

   Thread 1: [req A: gửi query DB] → [req B: xử lý kết quả] → [req C: ghi response]
             không bao giờ chờ — luôn có việc để làm

   ⇒ 4 thread phục vụ 50.000 kết nối đồng thời.
```

### Ưu điểm thật

- Bộ nhớ rất thấp: một request tốn vài trăm byte thay vì 1 MB.
- Chịu được số kết nối đồng thời cực lớn (WebSocket, SSE, streaming).
- Backpressure là **một phần của mô hình**, không phải thứ gắn thêm.

### Cái giá phải trả — nói thẳng

**1. Chặn một event loop là chặn hàng nghìn request.**

```java
// THẢM HOẠ trong WebFlux
@GetMapping("/report")
public Mono<Report> report() {
    Report r = jdbcTemplate.query(...);      // JDBC CHẶN trên event loop!
    return Mono.just(r);
}
```

Chỉ cần một lời gọi chặn lọt vào event loop, toàn bộ throughput sụp. Trong mô hình thread-per-request, một request chậm ảnh hưởng một thread; ở đây nó ảnh hưởng **mọi request đang được thread đó phục vụ**.

Có công cụ phát hiện: **BlockHound** — nó ném exception ngay khi phát hiện lời gọi chặn trên thread non-blocking.

```java
// Chỉ dùng ở môi trường test
BlockHound.install();
```

**2. Debug rất khó.** Stack trace của reactive gần như vô dụng:

```text
reactor.core.publisher.MonoFlatMap$FlatMapMain.onNext(MonoFlatMap.java:158)
reactor.core.publisher.FluxMapFuseable$MapFuseableSubscriber.onNext(...)
reactor.core.publisher.MonoPeekTerminal$MonoTerminalPeekSubscriber.onNext(...)
... 40 dòng nữa của Reactor, KHÔNG có dòng nào của code bạn
```

Phải bật `Hooks.onOperatorDebug()` (rất tốn hiệu năng) hoặc dùng `checkpoint()` thủ công ở từng bước.

**3. `ThreadLocal` không dùng được.** MDC cho log, `SecurityContextHolder`, transaction context — tất cả đều dựa trên `ThreadLocal` và đều gãy. Phải chuyển sang `Context` của Reactor, và mọi thư viện bạn dùng cũng phải hỗ trợ.

**4. Hệ sinh thái hạn chế.** R2DBC không có JPA/Hibernate. Không có `@Transactional` quen thuộc (có `TransactionalOperator` nhưng khác). Nhiều thư viện phổ biến chưa có bản reactive.

**5. Đường cong học tập dốc.** Cả đội phải hiểu `Mono`, `Flux`, `flatMap` vs `concatMap` vs `switchMap`, backpressure, hot/cold publisher. Một người viết sai là cả hệ thống chậm.

### Khi nào WebFlux thật sự đáng

| Nên dùng | Không nên dùng |
|---|---|
| API gateway, proxy (chủ yếu chuyển tiếp) | CRUD thông thường |
| Streaming, SSE, WebSocket | Ứng dụng nghiệp vụ phức tạp |
| Số kết nối đồng thời rất lớn (> 10.000) | Đội chưa quen reactive |
| Toàn bộ downstream đều non-blocking | Còn dùng JDBC/JPA |
| Cần bộ nhớ rất thấp | Cần debug dễ, phát triển nhanh |

**Đánh giá thẳng thắn**: với đa số ứng dụng nghiệp vụ, WebFlux mang lại lợi ích không tương xứng với chi phí. Và từ khi có virtual thread, phần lớn lý do chọn WebFlux đã biến mất.

## Hướng 3: Virtual thread (Java 21+)

Đây là thay đổi lớn nhất của Java trong một thập kỷ, và điều tuyệt vời là **bạn gần như không phải đổi code**.

```java
// Code Y HỆT như trước
@GetMapping("/orders/{id}")
public Order getOrder(@PathVariable Long id) {
    Order order = orderRepository.findById(id).orElseThrow();   // chặn — không sao
    PaymentStatus st = paymentClient.getStatus(order.getPaymentId());  // chặn — không sao
    return order.withStatus(st);
}
```

```yaml
# Bật virtual thread trong Spring Boot 3.2+
spring:
  threads:
    virtual:
      enabled: true
```

Một dòng cấu hình. Không đổi code.

### Cơ chế

```text
   Virtual thread = thread do JVM quản lý, không phải OS quản lý.

   ┌─ Platform thread (carrier) 1 ─┐   ┌─ carrier 2 ─┐
   │  VT#1 đang chạy               │   │  VT#5       │
   └───────────────────────────────┘   └─────────────┘
      ↑ khi VT#1 gặp lời gọi chặn (đọc socket):
        JVM "tháo" VT#1 ra khỏi carrier, cất stack của nó vào heap,
        rồi gắn VT#2 vào carrier để chạy tiếp.
        Carrier thread KHÔNG BAO GIỜ ngồi chờ.

   ⇒ 1 triệu virtual thread trên 8 carrier thread là chuyện bình thường.
```

Chi phí một virtual thread: **vài trăm byte đến vài KB** (stack lớn dần theo nhu cầu, nằm trong heap), tạo mới mất **dưới 1 micro-giây**.

```text
   Platform thread : 1 MB stack,  ~50 µs để tạo,  tối đa ~10.000
   Virtual thread  : ~1 KB,       <1 µs để tạo,   tối đa hàng triệu
```

Với virtual thread, Tomcat không còn dùng pool 200 thread nữa — mỗi request được **một virtual thread mới**, và số request đồng thời chỉ còn bị giới hạn bởi bộ nhớ.

### Cái bẫy 1: Pinning (ghim carrier)

Đây là bẫy quan trọng nhất cần biết.

Khi virtual thread gặp lời gọi chặn, JVM **tháo** nó ra để carrier làm việc khác. Nhưng có trường hợp không tháo được — virtual thread bị **ghim (pinned)** vào carrier:

```java
// Ở JDK 21-23: synchronized GHIM carrier thread
public synchronized Order process(Order o) {
    return externalClient.call(o);      // chặn 2 giây → carrier bị giam 2 giây!
}
```

Với chỉ 8 carrier thread, 8 lần ghim đồng thời là **toàn bộ ứng dụng đứng im**. Nguy hiểm hơn cả mô hình cũ, vì cũ ít nhất có 200 thread.

```java
// Cách sửa ở JDK 21-23: dùng ReentrantLock, nó KHÔNG ghim
private final ReentrantLock lock = new ReentrantLock();

public Order process(Order o) {
    lock.lock();
    try {
        return externalClient.call(o);
    } finally {
        lock.unlock();
    }
}
```

Phát hiện pinning:

```bash
java -Djdk.tracePinnedThreads=full -jar app.jar
# In stack trace mỗi khi có virtual thread bị ghim khi chặn
```

Hoặc qua JFR: sự kiện `jdk.VirtualThreadPinned`.

> **Tin tốt**: từ **JDK 24 (JEP 491)**, `synchronized` không còn ghim carrier thread nữa — virtual thread tháo được bình thường ngay cả trong khối `synchronized`. Nếu bạn chạy JDK 24+, vấn đề này về cơ bản đã được giải quyết. Nhưng vẫn còn hai trường hợp ghim: **native method (JNI)** và **`Object.wait()`** trong một số tình huống. Kiểm tra phiên bản JDK trước khi yên tâm.

### Cái bẫy 2: Không dùng pool cho virtual thread

```java
// SAI — đánh mất toàn bộ ý nghĩa của virtual thread
ExecutorService ex = Executors.newFixedThreadPool(200, virtualThreadFactory);

// ĐÚNG — mỗi tác vụ một virtual thread mới
ExecutorService ex = Executors.newVirtualThreadPerTaskExecutor();
```

Virtual thread rẻ tới mức **pool trở nên vô nghĩa**. Pool tồn tại để tái sử dụng thứ đắt tiền; virtual thread không đắt.

### Cái bẫy 3: Nút thắt chỉ dời chỗ, không biến mất

Đây là hiểu lầm nguy hiểm nhất về virtual thread:

```text
   TRƯỚC (200 platform thread):
   10.000 request → 200 chạy song song → DB nhận tối đa 200 query

   SAU (virtual thread):
   10.000 request → 10.000 chạy song song → DB nhận 10.000 query?!
```

**Thread pool cũ vô tình đóng vai trò giới hạn tải (rate limiter) cho database.** Bỏ nó đi mà không thay thế thì bạn chỉ chuyển vụ sập từ app xuống database.

```text
   Với virtual thread, connection pool trở thành TUYẾN PHÒNG THỦ CHÍNH.
   Phải cấu hình nó cẩn thận hơn bao giờ hết.
```

```yaml
spring:
  threads:
    virtual:
      enabled: true
  datasource:
    hikari:
      maximum-pool-size: 20        # ĐÂY là giới hạn thật sự bây giờ
      connection-timeout: 2000     # fail nhanh khi quá tải
```

Và phải bổ sung:
- **Rate limiter** ở tầng vào (`resilience4j-ratelimiter` hoặc ở gateway).
- **Semaphore/bulkhead** cho từng downstream — vẫn cần, thậm chí cần hơn.
- **Load shedding** khi quá tải (phase-4).

Nói cách khác: virtual thread **không** loại bỏ nhu cầu quản lý tải, nó chỉ chuyển trách nhiệm đó từ "vô tình nhờ thread pool" sang "cố ý bằng thiết kế".

### Cái bẫy 4: `ThreadLocal` với hàng triệu thread

`ThreadLocal` vẫn hoạt động với virtual thread, nhưng nếu mỗi thread giữ một object 10 KB và có 100.000 thread, đó là 1 GB. Java 21 giới thiệu **scoped values** (`ScopedValue`) làm bản thay thế nhẹ và an toàn hơn.

## So sánh ba hướng — bảng quyết định

| Tiêu chí | Thread-per-request (cũ) | Reactive (WebFlux) | Virtual thread |
|---|---|---|---|
| Đổi code | — | **Viết lại toàn bộ** | Gần như không |
| Độ khó học | Thấp | **Cao** | Thấp |
| Debug | Dễ | **Rất khó** | Dễ (stack trace bình thường) |
| Kết nối đồng thời tối đa | ~10.000 | Rất lớn | Rất lớn |
| Bộ nhớ mỗi request | 1 MB | ~vài trăm byte | ~1-10 KB |
| `ThreadLocal`/MDC | Hoạt động | **Gãy** | Hoạt động |
| Hệ sinh thái | Đầy đủ | Hạn chế | Đầy đủ (JDBC vẫn dùng được) |
| Backpressure | Thủ công | **Có sẵn** | Thủ công |
| Yêu cầu | Bất kỳ | Spring 5+ | **Java 21+**, tốt nhất là 24+ |
| Nút thắt mới | thread pool | chặn event loop | **connection pool, DB** |

### Khuyến nghị thực dụng

```text
   Đang dùng Java 21+ và ứng dụng nghiệp vụ thông thường?
     → BẬT VIRTUAL THREAD. Rẻ, dễ, ít rủi ro.
       Nhớ siết connection pool và thêm rate limiter.

   Cần streaming/SSE/WebSocket quy mô lớn, hoặc làm gateway?
     → WebFlux vẫn là lựa chọn đúng.

   Đang chạy Java 8/11/17, không nâng cấp được?
     → Giữ thread-per-request, áp dụng case 1-7 cho tử tế.
       Đó đã đủ để đi rất xa.

   Đang định viết lại toàn bộ sang WebFlux vì "nghe nói nhanh hơn"?
     → Dừng lại. Đo trước. Nâng Java 21 và bật virtual thread trước đã.
```

## Kiểm chứng bằng số

Cùng một ứng dụng, endpoint gọi database (50 ms) + service ngoài (100 ms), thử nghiệm với 5.000 người dùng đồng thời:

| Mô hình | Throughput | p99 | RAM | Ghi chú |
|---|---|---|---|---|
| Platform thread (200) | ~1.300 RPS | 3,8 giây | 1,1 GB | Hàng đợi dài, thread pool cạn |
| Platform thread (800) | ~1.500 RPS | 3,2 giây | 2,4 GB | RAM tăng vọt, cải thiện ít |
| WebFlux + R2DBC | ~4.900 RPS | 210 ms | 480 MB | Nhanh nhất, khó viết nhất |
| Virtual thread + JDBC | ~4.600 RPS | 260 ms | 620 MB | Gần bằng WebFlux, code không đổi |

Hai điều rút ra:

1. **Tăng số platform thread cho hiệu quả rất kém** — RAM gấp đôi, throughput tăng 15%. Đúng như USL đã dự đoán.
2. **Virtual thread đạt ~94% hiệu năng của WebFlux với 0% chi phí viết lại.** Đây là lý do virtual thread thay đổi cuộc chơi.

(Con số phụ thuộc rất nhiều vào workload cụ thể — hãy tự đo trên hệ thống của bạn, đừng tin bảng này một cách máy móc.)

## Checklist chuyển sang virtual thread

```text
□ Java 21+ (tốt nhất 24+ để tránh vấn đề pinning với synchronized)
□ Spring Boot 3.2+
□ spring.threads.virtual.enabled=true
□ Tìm và thay synchronized bọc quanh I/O → ReentrantLock (nếu JDK < 24)
□ Chạy với -Djdk.tracePinnedThreads=full ở staging, kiểm tra log
□ SIẾT LẠI connection pool — giờ nó là tuyến phòng thủ chính
□ Thêm rate limiter ở tầng vào
□ Giữ nguyên bulkhead/circuit breaker cho downstream
□ Kiểm tra thư viện dùng ThreadLocal nặng
□ Đo lại toàn bộ trước/sau, đừng tin lý thuyết
```

## Tóm tắt case 8

- Vấn đề gốc: OS thread tốn **1 MB** nhưng dành **90% thời gian ngồi chờ**.
- **Async servlet** chỉ chuyển vấn đề sang pool khác, trừ khi bên dưới thật sự non-blocking.
- **WebFlux** mạnh nhưng đắt: debug khó, `ThreadLocal` gãy, hệ sinh thái hạn chế, một lời gọi chặn giết cả event loop.
- **Virtual thread (Java 21+)** đạt gần hiệu năng reactive mà **không phải đổi code**.
- Bẫy virtual thread: **pinning** (`synchronized` ở JDK < 24), đừng dùng pool, và **`ThreadLocal` với hàng triệu thread**.
- Bẫy lớn nhất: virtual thread **dời nút thắt xuống database**. Thread pool cũ vô tình là rate limiter — bỏ nó thì phải thay thế bằng connection pool chặt + rate limiter tường minh.
- Khuyến nghị: Java 21+ và ứng dụng nghiệp vụ → **bật virtual thread**; gateway/streaming quy mô lớn → WebFlux.

**Bài kế tiếp** → [Phase 3 - Case 1: Row lock, table lock và câu UPDATE làm sập cả hệ thống](../phase-3-database-lock/01-case-row-lock-table-lock.md)

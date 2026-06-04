# Bài 4: Tóm tắt Phase 11 — 3 layer concurrency

Phase 11 đã đi qua 3 cách xử lý song song message trong Kafka consumer. Bài này tổng kết để bạn biết khi nào dùng cái nào.

## Mặc định: chỉ 1 thread

```java
@Bean
public Consumer<OrderEvent> consumer() {
    return order -> processOne(order);
}
```

Spring Cloud Stream mặc định tạo 1 thread duy nhất:
- Thread poll Kafka.
- Thread gọi hàm xử lý.
- Xong message này mới sang message tiếp.

→ Throughput = 1 / (thời gian xử lý 1 message).

Vd: xử lý 1 message mất 200ms → 5 message/giây. Producer gửi 100/giây → consumer không theo kịp, lag tăng vô hạn.

## Layer 1: Framework Concurrency

```yaml
spring:
  cloud:
    stream:
      bindings:
        consumer-in-0:
          consumer:
            concurrency: 3
```

Spring tạo 3 thread, mỗi thread:
- Là 1 KafkaConsumer độc lập.
- Cùng tham gia 1 consumer group.
- Kafka chia partition cho từng thread.

→ 3 partition = 3 thread = 3× throughput.

### Cách hoạt động

```text
Trong 1 JVM:
  Thread T1 → KafkaConsumer #1 → partition 0
  Thread T2 → KafkaConsumer #2 → partition 1
  Thread T3 → KafkaConsumer #3 → partition 2

Kafka view: thấy 3 consumer trong group (không phân biệt cùng JVM).
```

Mỗi thread xử lý partition của nó **tuần tự** → trong partition vẫn giữ thứ tự (vì Kafka guarantee per-partition ordering).

### Ưu điểm

- Đổi 1 dòng YAML, không cần sửa code.
- Giữ thứ tự per partition (per key).
- Phù hợp khi cần ordering theo key.

### Giới hạn

- **Concurrency ≤ số partition**. 5 thread + 3 partition → 2 thread idle.
- Throughput per thread vẫn limit bởi tốc độ xử lý.
- Nếu xử lý 200ms/msg + 3 partition → max 15 msg/giây. Producer 100/giây vẫn không theo kịp.

## Layer 2: Application Unordered Concurrency

Khi framework concurrency không đủ và **không cần giữ thứ tự**:

```java
@Bean
public Function<List<OrderEvent>, List<Message<?>>> processor(DeliveryService service) {
    return orders -> orders.stream()
        .gather(Gatherers.mapConcurrent(500, service::buildDelivery))   // virtual thread
        .map(this::toMessage)
        .toList();
}
```

```yaml
consumer:
  batch-mode: true                          # nhận batch List<T>
```

### Cách hoạt động

```text
Consumer nhận batch 500 order.
   ↓
Gatherers.mapConcurrent(500, fn) tạo 500 virtual thread song song.
   ↓
Mỗi virtual thread gọi DeliveryService.buildDelivery() (blocking 200ms).
   ↓
Tất cả block đồng thời → wall clock ~200ms cho cả batch.
   ↓
Return List<Message<?>> cho Spring forward đi.
```

500 virtual thread cùng làm 200ms blocking I/O = 200ms tổng (không phải 500 × 200ms).

### Ưu điểm

- Throughput cực cao, không bị giới hạn bởi số partition.
- Virtual thread rẻ, JVM tạo hàng ngàn không lo tốn RAM.
- Phù hợp blocking I/O (DB call, HTTP call).

### Giới hạn

- **Mất thứ tự**: output có thể đảo so với input.
- Cần Java 21+ (virtual thread).
- Lỗi 1 message trong batch xử lý phức tạp hơn (Phase 13).
- Phải đổi signature bean: `Function<List<T>, List<...>>` thay vì `Consumer<T>`.

### Vì sao không dùng `Stream.parallel()`?

```java
orders.stream().parallel()      // ← KHÔNG dùng cho I/O
    .map(deliveryService::buildDelivery)
```

`Stream.parallel()` dùng **ForkJoinPool.commonPool**:
- Số platform thread ≈ số CPU core (vd 8).
- Block 8 thread = block toàn bộ JVM.
- Designed cho CPU-bound, không phải I/O.

→ Phải dùng **virtual thread** (Gatherers.mapConcurrent dùng virtual thread internally).

## Layer 3: Application Ordered Concurrency

Khi cần **vừa parallel vừa giữ thứ tự** theo key:

```java
@Bean
public Function<List<OrderEvent>, List<Message<?>>> processor(DeliveryService service) {
    return orders -> orders.stream()
        .collect(Collectors.groupingBy(OrderEvent::customerId))   // gom bucket theo customer
        .values()
        .stream()
        .gather(Gatherers.mapConcurrent(500, bucket ->            // bucket chạy song song
            bucket.stream()                                        // trong bucket tuần tự
                .map(service::buildDelivery)
                .toList()
        ))
        .flatMap(List::stream)
        .map(this::toMessage)
        .toList();
}
```

### Cách hoạt động

```text
Batch 500 order, mỗi order có customerId.
   ↓
groupingBy(customerId) → Map<CustomerId, List<Order>>.
   ↓
Bucket C1: [order#1, order#3, order#6, ...]
Bucket C2: [order#2, order#5, ...]
... 250 bucket
   ↓
Gatherers.mapConcurrent(500, ...) chạy mỗi bucket trên virtual thread riêng.
   ↓
Trong bucket: stream().map() — tuần tự, giữ thứ tự.
   ↓
flatMap gộp kết quả về 1 stream.
   ↓
Return cho Spring.
```

### Quy tắc ordering

- **Trong cùng bucket** (cùng customer): tuần tự.
- **Giữa các bucket khác**: song song, có thể đảo.

→ Order của customer C1 không bao giờ đảo với chính nó. Order của C1 vs C2 có thể đảo (chấp nhận được).

### Cardinality của key quyết định throughput

Số bucket = số giá trị unique của key. Nhiều bucket → nhiều song song.

```text
Batch 500 order, 250 customer khác nhau:
  → 250 bucket × ~2 order/bucket → 250 virtual thread song song.
  → Wall clock ~400ms (2 order tuần tự × 200ms).

Batch 500 order, 2 customer (C1, C2):
  → 2 bucket × 250 order/bucket → 2 virtual thread.
  → Wall clock 250 × 200ms = 50 giây.
  → Không theo kịp producer.
```

→ Chọn key có nhiều giá trị unique. Tránh key cardinality thấp.

### Ưu điểm

- Vừa parallel vừa giữ ordering theo entity.
- Throughput gần bằng unordered nếu cardinality cao.

### Giới hạn

- Phức tạp hơn unordered.
- Bottleneck nếu chọn key sai (cardinality thấp).
- Cùng yêu cầu Java 21+.

## Bảng quyết định

| Tình huống | Phương pháp |
|---|---|
| Load thấp (< 5 msg/giây), latency thấp | Default 1 thread |
| Load vừa, cần ordering theo partition | Framework concurrency |
| Load cao, không cần ordering | Unordered (Layer 2) |
| Load cao, cần ordering theo key | Ordered với bucket (Layer 3) |
| Load rất cao, ordering theo key | Layer 3 + nhiều JVM instance |

## Kết hợp nhiều layer

Production lớn có thể stack:

```text
Stack đầy đủ:
   N JVM instance (Kubernetes scale)
       × M framework thread per instance (concurrency: M)
           × K virtual thread per batch (Gatherers.mapConcurrent(K, ...))
   = N × M × K total parallel processing units

Ví dụ: 5 instance × 3 thread × 500 virtual thread = 7500 song song.
```

Trade-off: complexity tăng, debug khó hơn. Tune từ thấp lên cao theo nhu cầu thật.

## Quy trình tune concurrency cho 1 service

Step 1: đo throughput producer (msg/giây).
Step 2: đo thời gian xử lý 1 msg ở consumer (ms).
Step 3: tính throughput consumer cần = bước 1.
Step 4: chọn approach:

- Throughput cần thấp → default 1 thread.
- Throughput cần = partition count × (1000/processing_ms) → framework concurrency.
- Throughput cần cao hơn:
  - Cần ordering → Layer 3.
  - Không cần ordering → Layer 2.

Step 5: deploy → monitor consumer lag → tăng dần concurrency nếu lag vẫn growing.

## Pitfalls

| Pitfall | Vấn đề | Sửa |
|---|---|---|
| Tăng `concurrency` mà topic chỉ 1 partition | Chỉ 1 thread active | Tăng partition trước, rồi tăng concurrency |
| Dùng `Stream.parallel()` cho I/O | Block JVM | Virtual thread (Gatherers) |
| Quên `batch-mode: true` khi dùng `List<T>` | Spring confused | Thêm YAML config |
| Chọn key cardinality thấp cho ordered | Bottleneck | Chọn key nhiều unique value |
| Stateful processor (mutable field) | Race condition | Stateless logic, hoặc synchronized |
| `max.poll.interval.ms` ngắn + xử lý dài | Consumer bị kick | Tăng interval hoặc giảm batch |
| Không monitor consumer lag | Không biết khi nào cần scale | Dashboard Grafana/Datadog |

## Production checklist Phase 11

- [ ] Đo throughput producer + processing time mỗi message.
- [ ] Chọn approach (1 thread / framework / unordered / ordered).
- [ ] Tune `max.poll.records` phù hợp memory + processing time.
- [ ] Set `max.poll.interval.ms` đủ lớn cho batch processing time.
- [ ] Monitor consumer lag (Prometheus + Grafana).
- [ ] Alert khi lag > threshold.
- [ ] Test failover: stop 1 instance → rebalance OK?
- [ ] Idempotent processing (Phase 12-13) — quan trọng khi rebalance redeliver.

## Tóm tắt Phase 11

- **Default**: 1 thread, throughput thấp.
- **Layer 1 — Framework concurrency**: tăng `consumer.concurrency` trong YAML. Tăng tới = số partition. Giữ ordering per partition.
- **Layer 2 — Unordered concurrency**: batch mode + `Gatherers.mapConcurrent` + virtual thread. Throughput cực cao, mất ordering.
- **Layer 3 — Ordered concurrency**: gom bucket theo key + bucket song song + trong bucket tuần tự. Vừa parallel vừa giữ ordering. Phụ thuộc cardinality key.
- **Đừng dùng** `Stream.parallel()` cho blocking I/O — dùng virtual thread.
- Có thể stack: nhiều JVM × framework concurrency × app concurrency.
- Pitfalls: cardinality key thấp, quên batch-mode, processing time dài kick consumer.

**Bài kế tiếp** → [Phase 12 - Reliability & Message Acknowledgement](../phase-12-reliability/01-acknowledgement-modes.md)

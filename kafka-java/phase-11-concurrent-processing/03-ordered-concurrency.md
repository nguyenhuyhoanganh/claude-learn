# Bài 3: Ordered Concurrency — vừa song song vừa giữ thứ tự theo key

Bài 2 đã xử lý xong scenario "không cần thứ tự" — gom batch + virtual thread xử lý 500 message cùng lúc, throughput cực cao.

Nhưng nhiều use case **bắt buộc giữ thứ tự** theo 1 key nào đó. Ví dụ:
- Banking: mọi event của account A1 phải xử lý đúng thứ tự (deposit trước, withdraw sau — không được đảo).
- User session: login → click → logout, không thể đảo.
- Order lifecycle: created → paid → shipped.

Câu hỏi: làm sao **vừa parallel** (để throughput cao) **vừa giữ thứ tự** (để không sai logic)?

Trả lời: **chia batch thành nhiều bucket nhỏ theo key**, mỗi bucket xử lý tuần tự bên trong, nhưng các bucket khác nhau **chạy song song**.

## Ý tưởng cốt lõi: bucket theo key

Hình dung 500 order trong 1 batch. Nếu chúng thuộc về 250 customer khác nhau, ta tạo **250 bucket** — mỗi bucket chứa các order của 1 customer.

```text
Batch nhận về (500 orders):
  [Order(cust=C1), Order(cust=C2), Order(cust=C1), Order(cust=C3), 
   Order(cust=C2), Order(cust=C1), ..., Order(cust=C250)]

Sau khi gom theo customer ID:
  Bucket C1: [Order#1, Order#3, Order#6, ...]    ← các order cùng customer C1
  Bucket C2: [Order#2, Order#5, ...]              ← các order cùng customer C2
  Bucket C3: [Order#4, ...]
  ...
  Bucket C250: [Order#500, ...]
```

Quy tắc xử lý:

| Trục | Cách xử lý |
|---|---|
| **Trong cùng 1 bucket** (cùng key) | Tuần tự — order#1 xong rồi mới đến order#3, order#3 xong rồi mới đến order#6 |
| **Giữa các bucket khác nhau** | Song song — bucket C1, C2, C3, ... chạy đồng thời bằng virtual thread |

Kết quả:
- Order của cùng 1 customer **giữ đúng thứ tự** trong DB.
- Order của các customer khác nhau **xử lý song song** → throughput cao.

## Code implementation

### Bước 1: gom batch thành map theo customer ID

Java `Collectors.groupingBy` cho phép gom List thành Map:

```java
List<OrderEvent> orders = ...;  // 500 orders nhận về

Map<Integer, List<OrderEvent>> buckets = orders.stream()
    .collect(Collectors.groupingBy(OrderEvent::customerId));

// buckets giờ là:
// { C1 -> [order#1, order#3, order#6, ...],
//   C2 -> [order#2, order#5, ...],
//   ... }
```

Khoá map = `customerId` (có thể đổi thành key khác — orderId, message key, region, etc. tuỳ logic).

### Bước 2: xử lý các bucket song song

```java
buckets.values().stream()                                    // Stream<List<OrderEvent>>
    .gather(Gatherers.mapConcurrent(500, this::processBucket))  // chạy song song
    .flatMap(List::stream)                                      // gộp kết quả về 1 stream
    .toList();
```

`Gatherers.mapConcurrent(500, ...)` — giống bài 2 — chạy hàm trên mỗi phần tử (mỗi bucket) bằng **virtual thread**, tối đa 500 song song.

### Bước 3: trong mỗi bucket, xử lý tuần tự

```java
private List<Object> processBucket(List<OrderEvent> bucket) {
    return bucket.stream()                       // KHÔNG dùng parallel ở đây!
        .map(deliveryService::buildDelivery)     // tuần tự từng order
        .toList();
}
```

`bucket.stream()` không có `.parallel()`, không có `Gatherers.mapConcurrent` → mặc định tuần tự.

→ Trong 1 bucket: order#1 (200ms) → order#3 (200ms) → order#6 (200ms) → ...

Nhưng nhiều bucket cùng làm vậy song song → tổng thời gian = (số order trong bucket lớn nhất) × 200ms, không phải 500 × 200ms.

### Code đầy đủ

```java
@Configuration
public class OrderedMessageProcessorConfig {

    public static final String SEND_TO = "spring.cloud.stream.sendTo.destination";
    public static final String DIGITAL_OUT = "digital-delivery-out";
    public static final String PHYSICAL_OUT = "physical-delivery-out";

    @Bean
    @ConditionalOnProperty(name = "processing.mode", havingValue = "ordered")
    public Function<List<OrderEvent>, List<Message<?>>> deliveryProcessor(
            DeliveryService service) {
        
        return orders -> orders.stream()
            .collect(Collectors.groupingBy(OrderEvent::customerId))   // bước 1: gom bucket
            .values()
            .stream()
            .gather(Gatherers.mapConcurrent(500, bucket ->            // bước 2: bucket song song
                bucket.stream()                                        // bước 3: trong bucket tuần tự
                    .map(service::buildDelivery)
                    .toList()
            ))
            .flatMap(List::stream)                                     // gộp tất cả delivery về 1 stream
            .map(this::toMessage)                                      // chuyển thành Message<?>
            .toList();
    }

    private Message<?> toMessage(Object delivery) {
        String destination = delivery instanceof DigitalDelivery 
            ? DIGITAL_OUT : PHYSICAL_OUT;
        return MessageBuilder
            .withPayload(delivery)
            .setHeader(SEND_TO, destination)
            .build();
    }
}
```

`@ConditionalOnProperty(name="processing.mode", havingValue="ordered")` — bean này chỉ active khi YAML có `processing.mode: ordered`. Bean unordered ở bài 2 dùng `havingValue="unordered"`. Hai bean không bao giờ active cùng lúc → tránh xung đột.

## Vai trò của customer ID — cẩn thận với cardinality

`customerId` được chọn làm khoá phân nhóm. **Số lượng customer khác nhau quyết định độ song song**.

### Trường hợp tốt: nhiều customer → nhiều bucket

```text
Batch 500 order, mỗi order khác customer:
  → 500 bucket, mỗi bucket 1 order.
  → 500 virtual thread chạy song song.
  → Mỗi thread xử lý 200ms.
  → Tổng thời gian batch: ~200ms.
  → Throughput tối đa, giống unordered.
```

### Trường hợp xấu: ít customer → ít bucket

```text
Batch 500 order nhưng chỉ 2 customer (C1, C2):
  Bucket C1: 250 order.
  Bucket C2: 250 order.
  
  → 2 virtual thread chạy song song.
  → Mỗi thread phải làm 250 order tuần tự.
  → Mỗi order 200ms.
  → Tổng thời gian: 250 × 200ms = 50 giây.
  → Throughput thấp tới mức không theo kịp producer.
```

→ **Bài học**: khoá phân nhóm phải có **cardinality cao** (nhiều giá trị khác nhau) để tạo nhiều bucket. Nếu khoá ít giá trị, song song bị bottleneck.

### Demo simulate kịch bản xấu

Trong producer, đổi `customerId` thành:
```java
int customerId = id % 2;   // chỉ có customer 0 và 1
```

→ Mọi order về 2 bucket. Processor không bao giờ theo kịp.

So với `customerId = id % 50` → 50 customer khác nhau → 50 bucket → song song đủ để theo kịp.

## Demo

### Setup

```bash
docker compose down && docker compose up -d
docker exec -it kafka bash
cd /opt/kafka/bin
./kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic order-events --partitions 1
```

### Producer config — 100 order/giây, customer ID mod 50

```java
@Bean
public Supplier<Message<OrderEvent>> producer() {
    return () -> {
        int id = counter.incrementAndGet();
        int customerId = id % 50;        // 50 customer khác nhau
        ProductType type = (id % 2 == 0) ? ProductType.PHYSICAL : ProductType.DIGITAL;
        OrderEvent order = new OrderEvent(id, customerId, random.nextInt(1, 1000), type);
        return MessageBuilder
            .withPayload(order)
            .setHeader(KafkaHeaders.KEY, id)
            .build();
    };
}
```

```yaml
poller:
  fixed-delay: 10                       # 100 orders/giây
```

### YAML processor

```yaml
# section14/03-processor.yaml
spring:
  cloud:
    function:
      definition: deliveryProcessor
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          deliveryProcessor-in-0:
            consumer:
              configuration:
                key.deserializer: org.apache.kafka.common.serialization.IntegerDeserializer
                max.poll.records: 500
                auto.offset.reset: earliest
      bindings:
        deliveryProcessor-in-0:
          destination: order-events
          group: delivery-service
          consumer:
            batch-mode: true
        digital-delivery-out:
          destination: digital-delivery-events
        physical-delivery-out:
          destination: physical-delivery-events

processing:
  mode: ordered                          # bật bean ordered
```

### Chạy 4 process

1. DigitalConsumer.
2. PhysicalConsumer.
3. Processor (mode=ordered).
4. Producer (100 order/giây).

### Quan sát log

Log processor:
```text
[Consumer] Adding newly assigned partitions: order-events-0
batch received: 500 messages
... processing in 50 buckets (50 customers) concurrently ...
batch received: 500 messages
...
```

Log DigitalConsumer:
```text
digital delivery: orderId=1, customerId=1
digital delivery: orderId=3, customerId=3
digital delivery: orderId=5, customerId=5
...
digital delivery: orderId=51, customerId=1     ← cùng customer 1 với order#1
digital delivery: orderId=53, customerId=3     ← cùng customer 3 với order#3
```

Quan sát:
- Order **giữa các customer** có thể đảo thứ tự (orderId 5 ra trước orderId 3 nếu thuộc khác bucket).
- Order **cùng customer** ra **đúng thứ tự** (customer 1 luôn order#1 trước order#51, customer 3 luôn order#3 trước order#53).

✅ Vừa parallel vừa giữ thứ tự theo customer. Processor theo kịp producer 100 order/giây.

## So sánh 3 phương pháp

| Phương pháp | Throughput | Ordering | Khi nào dùng |
|---|---|---|---|
| **Framework concurrency** (bài 1) | Trung bình, giới hạn theo số partition | Theo partition (key) | Cần thứ tự + load vừa phải |
| **Unordered concurrency** (bài 2) | Cực cao | Không có thứ tự | Analytics, notification, không cần thứ tự |
| **Ordered concurrency** (bài 3) | Cao (nếu key cardinality cao) | Theo key được chọn | Cần thứ tự + load cao |

## Kết hợp nhiều layer concurrency

Production có thể stack:

```text
Layer 1: Multiple JVM instances (deploy nhiều container)
   ↓ mỗi instance:
Layer 2: Framework concurrency (N consumer thread)
   ↓ mỗi thread:
Layer 3: Batch mode + app-level virtual thread concurrency
```

Tổng throughput = (số instance) × (framework concurrency) × (app concurrency per batch).

Trade-off: complexity tăng, debug khó hơn. Tune từ đơn giản đến phức tạp khi cần.

## Tips chọn partition key trong code

Cùng câu hỏi: chọn `customerId`? `orderId`? `region`? `productCategory`?

Quy tắc:
1. **Cardinality cao** → đủ bucket để song song.
2. **Liên quan logic ordering** → cùng entity cần xử lý đúng thứ tự.
3. **Không thay đổi** giữa các event của 1 entity (nếu customerId của order thay đổi → broken ordering).

Ví dụ chọn cho từng use case:

| Use case | Khoá phân nhóm |
|---|---|
| Banking transactions | `accountId` |
| Order lifecycle (created → paid → shipped) | `orderId` |
| User session events | `sessionId` |
| IoT device telemetry | `deviceId` |
| Stock price ticks | `symbol` (ticker) |
| Multi-tenant SaaS events | `tenantId` |

## Anti-pattern

| Anti-pattern | Vấn đề | Sửa |
|---|---|---|
| Phân nhóm theo timestamp | Hash mỗi event 1 bucket → không tận dụng được bucketing | Chọn entity ID |
| Phân nhóm theo `random()` | Không đảm bảo ordering | Chọn key business-meaningful |
| Cardinality thấp (2-3 bucket) | Bottleneck, không theo kịp producer | Chọn key với nhiều giá trị |
| Quên `@ConditionalOnProperty` | Cả 2 bean (ordered + unordered) active → conflict | Thêm annotation |
| Dùng `bucket.parallel().stream()` | Phá vỡ thứ tự trong bucket | Không dùng parallel trong bucket |
| Mutable state trong `processBucket` | Race condition giữa các bucket | Stateless logic |

## Tóm tắt bài 3

- Khi cần **vừa parallel vừa giữ thứ tự**, dùng pattern bucket.
- Bước 1: `Collectors.groupingBy` chia batch theo key.
- Bước 2: `Gatherers.mapConcurrent` chạy các bucket song song bằng virtual thread.
- Bước 3: trong mỗi bucket, dùng stream **tuần tự** (không parallel).
- Throughput phụ thuộc **cardinality của khoá phân nhóm** — nhiều key khác nhau → nhiều bucket → song song hiệu quả.
- Demo với 50 customer + 100 order/giây: theo kịp dễ dàng. Nếu chỉ 2 customer → bottleneck.
- Chọn khoá: liên quan business ordering, cardinality cao, không thay đổi giữa các event cùng entity.

**Bài kế tiếp** → [Bài 4: Tóm tắt Phase 11 — 3 layer concurrency](04-summary.md)

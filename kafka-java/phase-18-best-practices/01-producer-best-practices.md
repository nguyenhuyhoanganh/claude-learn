# Bài 1: Producer best practices — acks, min.insync.replicas, idempotent producer, compression

Phase 18 tổng kết các best practices + câu hỏi thường gặp. Mostly lý thuyết + visual, không hands-on. Bài này: 4 chủ đề về producer.

## Producer Acknowledgement (`acks`)

Phase 12 đã học consumer acknowledgement. Producer cũng có ack — nhưng **ngược lại**: producer chờ **broker ack** xác nhận message đã được ghi thành công.

```text
Producer App ───records───► Kafka Broker
                                  │ (broker writes)
            ◄──ack──            │
                                  
Nếu producer KHÔNG nhận ack → client library tự động RETRY.
```

### Property `acks` — 3 giá trị

```yaml
spring.kafka.producer.acks: all          # default in modern Kafka (= -1)
spring.kafka.producer.acks: 1
spring.kafka.producer.acks: 0
```

#### `acks=0` — fire and forget

- Producer **không chờ ack**.
- Throughput **cao nhất** (no waiting).
- Risk: **data loss** nếu network fail hoặc broker crash trước khi ghi.
- Use case: log shipping, metrics — OK mất vài message.

#### `acks=1`

- Producer chờ **leader broker** ack (đã ghi vào disk leader).
- Balance giữa throughput + reliability.
- Risk: leader crash sau khi ack nhưng trước khi replicate sang followers → mất data.

#### `acks=all` (= `-1`) — default modern Kafka

- Producer chờ leader **+ tất cả in-sync replicas** ack.
- Reliability cao nhất.
- Throughput thấp hơn 1 chút (đợi replication).
- Recommend cho hầu hết production use case.

### Scenario: replication factor 3, acks=all, 1 follower down

```text
Trước: 1 leader + 2 followers (all in-sync)
After: 1 follower xuống → ISR = leader + 1 follower

Producer publish → leader ghi → replicate sang 1 follower còn lại → ack.

Khi follower down recover → leader replicate backlog → ISR full again.
```

→ `acks=all` không bị stuck khi vài node down, vẫn ack với in-sync set hiện tại.

## `min.insync.replicas` — combo với `acks=all`

Câu hỏi: `acks=all` với 3 replicas, 2 follower đều down → còn 1 leader. Leader vẫn ghi data + ack (vì ISR chỉ có leader). Vậy `acks=all` lúc này khác gì `acks=1`?

→ **Không khác**. Data chỉ ở 1 node = unsafe.

Solution: **`min.insync.replicas`** — config ở **topic level** (không producer side).

```bash
./kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic our-events \
  --partitions 3 --replication-factor 3 \
  --config min.insync.replicas=2
```

Behavior:
- Topic yêu cầu **minimum 2 in-sync replicas** để accept write.
- Nếu ISR < 2 → broker **reject write** với `NotEnoughReplicasException`.
- Producer phải retry.

### Combo `acks=all` + `min.insync.replicas=2`

Đảm bảo data **luôn ở ít nhất 2 node** trước khi acknowledged.

| Replication factor | `min.insync.replicas` | Tolerate brokers down | Comment |
|---|---|---|---|
| 3 | 2 | 1 | Production standard |
| 3 | 1 | 2 | Risk data only on 1 node |
| 5 | 3 | 2 | Higher safety, can lose 2 |
| 1 | 1 | 0 | NO HA — dev only |

**Production recommendation**: replication factor 3 + min.insync.replicas 2 + acks=all.

## Idempotent Producer

Scenario:
```text
T+0:   Producer send message-100
T+10:  Broker write message-100 to disk
T+15:  Broker send ack
T+20:  Network issue → ack lost
T+30:  Client timeout → RETRY: resend message-100
T+40:  Broker received message-100 AGAIN

Without idempotent: broker writes message-100 again → DUPLICATE.
```

### Solution: enable idempotence

```yaml
spring.kafka.producer.properties:
  enable.idempotence: true       # default in modern Kafka
```

How it works internally:
- Client library generate **internal sequence ID** cho mỗi message.
- Attach ID vào message (hidden from app code).
- Broker track sequence ID đã thấy.
- Retry → broker thấy duplicate ID → **silently skip** write, send ack ngay.

Default trong Kafka modern: **`true`**. Old Kafka (< 2.0): false.

### Trade-off

- ✓ Tránh duplicate ở **library retry** layer.
- ✗ Slight overhead (sequence ID tracking, broker memory).

Default modern = **enable**. Chỉ disable nếu có lý do specific (vd ultra-high throughput không cần guarantee).

## ⚠️ Idempotent producer KHÔNG fix duplicate ở application layer

Quan trọng cần hiểu:

```text
Idempotent producer ENABLE chỉ giúp:
  - Library retry không gây duplicate ở broker.

Idempotent producer KHÔNG giúp:
  - Application code bug → emit cùng message 2 lần (vd: loop bug, gọi save() 2 lần).
  - Application restart → re-process input → re-emit.
```

```java
// Bug application — idempotent producer KHÔNG cứu
@PostMapping("/orders")
public Order placeOrder(@RequestBody OrderRequest req) {
    Order order = repo.save(...);
    streamBridge.send("order-events", order);    // emit lần 1
    streamBridge.send("order-events", order);    // bug: emit lần 2
    return order;
}
```

Broker thấy 2 sequence ID **khác nhau** (library tạo) → ghi cả 2.

→ Application logic phải tự bảo vệ idempotency. **Outbox pattern**, **idempotency key per request**, etc. (Phase 12-13).

## Idempotent Consumer

Câu hỏi: có property `enable.idempotent.consumer` không?

**Không**. Idempotent consumer hoàn toàn là **app-level pattern**.

### 5-step process cho idempotent consumer

```text
1. Producer set unique message ID (UUID) cho mỗi event.
   - Có thể trong payload hoặc header.
   - Đây là responsibility của producer.

2. Consumer nhận message.

3. Consumer check DB: messageId đã processed chưa?
   - SELECT 1 FROM processed_messages WHERE id = ?

4a. Already processed → ack ngay, KHÔNG re-process.
4b. Not processed → process + INSERT processed_messages (id) → ack.

5. Cả "process business logic + INSERT processed_messages" phải trong CÙNG DB transaction.
```

### Code pattern

```java
@Service
public class OrderEventHandler {

    @Autowired private OrderRepository orderRepo;
    @Autowired private ProcessedMessageRepository processedRepo;
    
    @Transactional
    public void handle(Message<OrderEvent> message) {
        String messageId = message.getHeaders().get("messageId", String.class);
        
        // Step 3: check
        if (processedRepo.existsById(messageId)) {
            // Step 4a: already processed
            log.info("Message {} already processed, skipping", messageId);
            return;
        }
        
        // Step 4b: process
        OrderEvent event = message.getPayload();
        orderRepo.save(new Order(event));
        processedRepo.save(new ProcessedMessage(messageId));   // Step 5: atomic
    }
}
```

### Khi producer KHÔNG có messageId?

Workaround: dùng combo `(topic, partition, offset)` làm "natural ID":

```java
String naturalId = String.format("%s-%d-%d", 
    record.topic(), record.partition(), record.offset());
```

Topic + partition + offset là **unique per message** trong Kafka. Treat như UUID.

→ Pattern này phổ biến khi không control producer side.

## Compression

Network call + disk write là bottleneck. **Compress message** → giảm bandwidth + storage.

### Property

```yaml
spring.kafka.producer.compression-type: snappy        # default = none
```

Values:

| Compression | Ratio | CPU | Speed |
|---|---|---|---|
| `none` | 1x | 0 | Fastest |
| `gzip` | High (3-5x) | High | Slow |
| `snappy` | Medium (2-3x) | Low | Fast |
| `lz4` | Medium | Low | Very fast |
| `zstd` | High | Medium | Medium |

### Production recommendation

- **Snappy** — balanced, default Confluent.
- **LZ4** — slightly faster than snappy.
- **Gzip** — high ratio if network is bottleneck + CPU spare.
- **Zstd** — modern, good ratio + speed (Kafka 2.1+).

### Behavior

- Producer compress trước khi send.
- Broker **lưu compressed** trên disk (không decompress, lợi disk space).
- Consumer **auto decompress** (không cần config consumer side).

```yaml
# Consumer side: KHÔNG cần property compression
```

### "Always enable compression"?

Internet often says "always enable". Reality: **test trước**.

- Network bottleneck → compression giảm latency → win.
- CPU bottleneck → compression làm worse → lose.
- Small messages → compression overhead > benefit.
- Already-compressed payload (gzipped JSON) → no benefit.

→ **Benchmark với real workload** thay vì follow blindly.

## Tóm tắt bài 1

- **`acks`**: 0 (fire-forget), 1 (leader only), all (leader + ISR). Default modern = all.
- **`min.insync.replicas`**: topic property, combo với `acks=all` để guarantee data ở minimum N nodes. Production: replication 3 + min.insync 2 + acks=all.
- **Idempotent producer** (`enable.idempotence=true`, default modern):
  - Library auto sequence ID + retry → broker dedup.
  - CHỈ giúp library retry. KHÔNG giúp application bug emit duplicate.
- **Idempotent consumer**: app-level 5-step pattern.
  - Producer attach unique messageId.
  - Consumer check DB processed_messages → skip nếu đã có, else process + insert atomic.
  - Workaround không có messageId: dùng (topic, partition, offset) combo.
- **Compression**: snappy/lz4 phổ biến. Gzip cao ratio nhưng tốn CPU. Test với workload thật, không follow advice mù.
- Compressed message lưu compressed trên disk, consumer auto decompress.

**Bài kế tiếp** → [Bài 2: Topic + Partition + Replication factor decisions](02-topic-partition-replication.md)

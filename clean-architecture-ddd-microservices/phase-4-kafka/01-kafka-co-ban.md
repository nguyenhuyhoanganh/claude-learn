# Bài 15: Apache Kafka — kiến trúc, topic, partition, consumer group

> Phase-3 đã có domain event nguyên thuỷ trong Java. Phase-4 mang event ra ngoài — qua Kafka. Bài này dạy **Kafka từ đầu**: tại sao chọn nó, broker/topic/partition/consumer hoạt động ra sao, và **3 đặc tính** quan trọng cho khoá học: persistent log, ordering theo key, exactly-once semantics. Cuối bài bạn có nền để code Kafka producer/consumer sạch ở bài 16+.

## Vấn đề Kafka giải — message broker quy mô lớn

Tình huống: Order service publish "OrderCreated" → Payment service nhận. Yêu cầu:
1. **Loose coupling**: Order không gọi Payment trực tiếp (Payment down → Order vẫn chạy).
2. **Persistent**: Payment down 1 giờ → khi up lại vẫn nhận được message từ 1 giờ trước.
3. **Throughput cao**: 10k+ event/s.
4. **Scale ngang**: thêm Payment instance để chia tải.
5. **Replay**: muốn xem lại lịch sử event vài ngày → playback từ đầu.

Kafka đáp ứng cả 5. Cùng class với Kafka: RabbitMQ, NATS, AWS SQS — nhưng Kafka mạnh nhất ở **persistent log + replay**.

## Kafka cluster — bộ phận

```text
┌────────────────────────────────────────────────────────────────┐
│                          Kafka cluster                          │
│                                                                  │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│   │   Broker 1   │      │   Broker 2   │      │   Broker 3   │  │
│   │              │      │              │      │              │  │
│   │  Topic A      │      │  Topic A      │      │  Topic A      │  │
│   │  partition 0  │      │  partition 1  │      │  partition 2  │  │
│   │  (leader)     │      │  (leader)     │      │  (leader)     │  │
│   │               │      │               │      │               │  │
│   │  Topic A      │      │  Topic A      │      │  Topic A      │  │
│   │  partition 1  │      │  partition 2  │      │  partition 0  │  │
│   │  (replica)    │      │  (replica)    │      │  (replica)    │  │
│   └──────────────┘      └──────────────┘      └──────────────┘  │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
              ▲                                          ▲
              │ produce                                  │ consume
              │                                          │
   ┌──────────────────┐                       ┌──────────────────┐
   │  Producer (app)   │                       │  Consumer (app)   │
   └──────────────────┘                       └──────────────────┘
```

### Broker
**Broker** = một Kafka server. Cluster có nhiều broker (3 là tối thiểu production để tolerate 1 broker down).

### Topic
**Topic** = "kênh" message, đặt tên (`payment-request-topic`). Topic là **logical** — physically chia thành **partition** nằm trên nhiều broker.

### Partition
**Partition** = log file append-only. Mỗi message ghi tuần tự, có **offset** (số thứ tự 0, 1, 2, ...).

```text
Topic "payment-request-topic" với 3 partition:

partition-0  [msg-A1, msg-A2, msg-A3, msg-A4, ...]   offset: 0, 1, 2, 3, ...
partition-1  [msg-B1, msg-B2, msg-B3, ...]
partition-2  [msg-C1, msg-C2, msg-C3, msg-C4, msg-C5]
```

**Số partition** đặt khi tạo topic — chia càng nhiều → song song càng cao nhưng overhead lớn. Khoá học dùng 3 partition cho mỗi topic.

### Replica + leader
Mỗi partition có 1 **leader** (broker chịu đọc/ghi) + n **replica** (broker giữ bản sao). Leader die → 1 replica được elect làm leader mới. Replication factor = 3 là tiêu chuẩn (1 leader + 2 replica).

### Zookeeper (cũ) / KRaft (mới)
**Zookeeper** từng là tủ điều phối broker (Kafka < 3.3). Từ Kafka 3.3+, **KRaft** mode (Kafka Raft) loại bỏ Zookeeper. Khoá học bắt đầu với Zookeeper (mainstream), phase-14 migrate KRaft.

## Producer — gửi message

Producer code (sẽ học chi tiết bài 18):

```java
ProducerRecord<String, PaymentRequestAvroModel> record = new ProducerRecord<>(
    "payment-request-topic",        // topic
    "order-id-123",                  // key (xác định partition)
    paymentRequestAvroModel);        // value
kafkaProducer.send(record);
```

Producer chọn partition theo công thức:

```text
partition = hash(key) % numberOfPartitions
```

- Cùng `key` → cùng partition → **đảm bảo thứ tự** message của key đó.
- `key = null` → round-robin → không đảm bảo thứ tự.

Khoá học **luôn** dùng `orderId` làm key cho mọi message liên quan order → mọi message của 1 order đến cùng 1 partition theo đúng thứ tự.

## Consumer + Consumer Group

```text
┌────────────────────────────────────────────────────────────────┐
│                        Kafka topic (3 partitions)               │
│                                                                  │
│   partition-0      partition-1      partition-2                 │
│   ─────────────   ─────────────   ─────────────                │
└────────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
        ▼                   ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Consumer A   │    │ Consumer B   │    │ Consumer C   │
│ (group X)    │    │ (group X)    │    │ (group X)    │
│ partition 0  │    │ partition 1  │    │ partition 2  │
└──────────────┘    └──────────────┘    └──────────────┘
```

### Consumer Group
Tập hợp consumer cùng `group.id`. Mỗi partition được **chỉ 1 consumer trong group** đọc tại một thời điểm. Nếu có 3 partition + 3 consumer trong group → mỗi consumer đọc 1 partition. Nếu 5 consumer + 3 partition → 2 consumer idle.

**Quan trọng**: số consumer ≤ số partition. Vượt là phí.

```text
3 consumer in group, 3 partition:    3 consumer in group, 6 partition:
┌─P0─┐  ┌─P1─┐  ┌─P2─┐               P0,P3 ─► C1
  ▼      ▼      ▼                     P1,P4 ─► C2
 C1     C2     C3                     P2,P5 ─► C3
```

### 2 group khác nhau — đọc cùng topic độc lập

Order service có thể có group `order-payment-response-consumer-group` đọc `payment-response-topic`. Một group khác `audit-consumer-group` cũng đọc cùng topic — không xung đột. Mỗi group có offset riêng.

```text
Topic payment-response-topic
       │
       ├──► Group "order-payment-response-consumer-group" (đọc xử lý)
       ├──► Group "audit-consumer-group" (đọc log)
       └──► Group "analytics-consumer-group" (đọc warehouse)
```

Đây là pattern "**publish-subscribe**" của Kafka — n consumer group đều đọc full data, chia tải trong cùng group.

## Offset — vị trí đọc

Mỗi consumer trong group **commit offset** sau khi xử lý message. Khi restart, đọc tiếp từ offset đã commit.

```text
partition-0:   [msg-0, msg-1, msg-2, msg-3, msg-4, msg-5, ...]
                        ↑                  ↑
                    last committed         current
                    offset = 1            position
```

Khi consumer crash giữa lúc xử lý msg-4:
- Offset committed = 1.
- Restart → đọc lại từ offset 2 → msg-2, 3, 4 lại.
- **At-least-once delivery**: có thể xử lý lặp. Code phải **idempotent**.

> Quan trọng: idempotent design là pillar của microservices event-driven. Khoá học sẽ thấy idempotent ở phase-9 (Outbox) và phase-5 (Payment dedupe).

## 3 đặc tính then chốt cho khoá học

### 1. Persistent log
Message ghi xuống disk (mặc định retention 7 ngày, configurable). Consumer down 1 giờ, lên lại vẫn đọc được message 1 giờ trước. **RabbitMQ thì không** (mặc định in-memory + ack-based).

### 2. Ordering theo key
Cùng key → cùng partition → đảm bảo FIFO trong partition. Áp vào khoá: `orderId` là key → mọi event cho order X đi qua đúng partition theo thứ tự. Order's pay, approve, cancel events không đến lệch thứ tự.

### 3. Exactly-once semantics (idempotent producer + transaction)
Kafka 0.11+ hỗ trợ:
- **Idempotent producer**: retry không tạo duplicate (broker dedupe theo `producerId + sequence`).
- **Transaction**: producer ghi nhiều partition atomic (tất cả hoặc không gì).

Khoá học dùng **at-least-once** đơn giản + idempotent ở consumer side — cách thực dụng cho production.

## Tại sao Kafka, không RabbitMQ?

| Yếu tố | Kafka | RabbitMQ |
|---|---|---|
| Persistent log | ✅ tích hợp, retention dài | Có queue persistent nhưng mất sau khi ack |
| Replay | ✅ rewind offset | ❌ phải dùng workaround |
| Throughput | 100k+ msg/s/broker | 20k+ msg/s |
| Latency | ~ms | ~µs (nhanh hơn cho 1 msg) |
| Routing phức tạp | ❌ (chỉ topic + partition) | ✅ exchange + binding mạnh |
| Quản lý | Phức tạp hơn | Đơn giản hơn |
| Phù hợp | Event streaming, log aggregation, microservice event-driven | Task queue, RPC, routing rule phức tạp |

Cho **Outbox + SAGA + CQRS** (mục tiêu khoá học), Kafka thắng vì replay + retention dài. Outbox cần broker giữ message lâu để retry → Kafka tự nhiên hơn.

## Schema Registry — kết bạn với Avro

Vấn đề: Producer schema thay đổi (thêm field, đổi type) — consumer cũ chạy với code cũ → crash khi gặp schema mới.

**Schema Registry** (Confluent) lưu schema, dán `schema_id` vào mỗi message. Consumer đọc:
1. Lấy `schema_id` từ message.
2. Query Schema Registry lấy schema.
3. Deserialize message theo schema chính xác.

Khoá học dùng **Avro** + Schema Registry. Avro:
- Schema định nghĩa file `.avsc` (JSON).
- Build-time generate Java class — type safety.
- Backward/Forward compatibility check tự động.

```text
order-event.avsc → maven build → PaymentRequestAvroModel.java (auto-generated)
                                  ↑
                       producer/consumer dùng class này
```

## Vai trò 4 module Kafka khoá học sẽ tạo

```text
food-ordering-system/
└── infrastructure/
    └── kafka/
        ├── kafka-config-data/     ← @ConfigurationProperties cho config
        ├── kafka-model/            ← Avro schema + generated class
        ├── kafka-producer/         ← KafkaProducer wrapper generic
        └── kafka-consumer/         ← KafkaConsumer interface generic
```

Vì sao tách 4 module? — **Reuse xuyên service**. Order, Payment, Restaurant đều cần config (broker URL), model (Avro classes), producer (gửi message), consumer (nhận). Code 1 lần, dùng nhiều nơi.

Bài tiếp (16, 17, 18, 19) sẽ code từng module.

## Tóm tắt bài 15

- Kafka = cluster nhiều broker, mỗi topic chia partition, mỗi partition log append-only có offset.
- Producer gửi với key → partition cố định → đảm bảo thứ tự per-key.
- Consumer thuộc consumer group → mỗi partition 1 consumer đọc, scale ngang.
- 3 đặc tính cho khoá: persistent log + ordering theo key + at-least-once + replay.
- Schema Registry + Avro = type safety xuyên producer/consumer + backward compatibility.
- 4 module shared: `kafka-config-data`, `kafka-model`, `kafka-producer`, `kafka-consumer`.

**Bài kế tiếp** → [Bài 16: Chạy Kafka cluster local với Docker Compose](02-chay-kafka-docker.md)

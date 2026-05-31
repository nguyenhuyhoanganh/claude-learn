# Bài 3: Tuning producer + consumer — linger.ms, batch.size, max.poll.records

Bài trước bạn gửi message qua console producer. Đã thử gõ nhanh nhiều ký tự? Nếu chú ý: **message không đến consumer ngay**, mà gom batch rồi gửi cả nhóm.

Bài này: hiểu **producer driver** behaviour (linger.ms, batch.size, timeout option), **consumer pull model** (max.poll.records), và vì sao Kafka chọn pull thay vì push.

## Quan sát: console producer gom batch

Test: 2 terminal side-by-side. Producer + consumer cùng topic `demo-topic`. **KHÔNG** dùng `--from-beginning` (chỉ thấy message mới).

```bash
# Producer terminal
./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic demo-topic
> hello

# Consumer terminal (1 giây sau)
hello
```

Có vẻ ổn. Bây giờ gõ nhanh nhiều ký tự:

```bash
# Producer (gõ rất nhanh)
> a
> b
> c
> d
> e

# Consumer (thấy nhóm 2-3 lúc, không liên tục)
a
b c d
e
```

Consumer không chậm. Broker không chậm. Là **console producer cố ý gom batch**.

## Producer.properties — file ai dùng?

Recap files trong `config/`:

| File | Ai dùng? |
|---|---|
| `broker.properties` / `controller.properties` / `server.properties` | Kafka **server** node config |
| `producer.properties` | Reference cho **producer app** (CLI hoặc Java app) |
| `consumer.properties` | Reference cho **consumer app** |

`producer.properties` KHÔNG ảnh hưởng broker. Nó là **template config cho producer apps** dùng Kafka client library.

### Kafka client library (driver)

```text
+──────────────────+
│ Producer App     │
│ (Console / Java) │
└────────┬─────────+
         │ Java method calls (KafkaProducer.send(...))
         ▼
+──────────────────+
│ Kafka client lib │  ← driver: buffer + batch + retry + serialize + network
│   (Java JAR)     │
└────────┬─────────+
         │ TCP, Kafka binary protocol
         ▼
+──────────────────+
│ Kafka Broker     │
+──────────────────+
```

`kafka-console-producer.sh` không gửi message trực tiếp. Nó **giao message cho driver**. Driver mới gửi qua TCP. Java/Spring Boot app cũng dùng **cùng driver** này.

## `linger.ms` + `batch.size` — 2 property quan trọng

Driver **không gửi ngay từng message**. Nó **gom buffer**:

> **linger.ms** = thời gian tối đa driver wait trước khi flush.
> **batch.size** = byte tối đa trong 1 batch.

**Whichever comes first** = flush.

```text
Case 1: producer chậm
  linger.ms = 1000ms, batch.size = 16KB
  
  T=0:    1 byte arrived.
  T=1000: 1 byte still alone → linger hit → flush (1 byte).

Case 2: producer rất nhanh
  linger.ms = 1000ms, batch.size = 16KB
  
  T=0:   start collecting.
  T=10:  16KB collected → batch.size hit → flush (16KB).

Case 3: balanced
  linger.ms = 100ms, batch.size = 16KB
  
  T=0:   collecting.
  T=100: 8KB collected → linger hit → flush (8KB).
```

### Tại sao batch tốt?

- **Throughput**: 1000 messages × 100 bytes mỗi network call = overhead lớn. 1 batch 100KB = 1 call, ít overhead.
- **Compression**: nén batch hiệu quả hơn từng message.
- **Disk write**: broker append batch hiệu quả hơn append từng record.

Trade-off: **latency** — message phải đợi tới đủ hoặc tới linger expire.

### Default values

```text
linger.ms = 0       (in Kafka client default)
batch.size = 16384  (16 KB)
```

`linger.ms = 0` → driver gửi ngay khi có thể. Nhưng **console producer override** default thành **timeout = 1 second** (= linger.ms = 1000ms).

Vì thế gõ nhanh thấy gom batch.

### Console producer `--timeout-ms` option

Override `linger.ms` cho console:

```bash
# Default: timeout 1000ms (1 second)
./kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic demo-topic \
  --timeout-ms 0
```

`timeout-ms 0` → flush immediately mỗi message. Gõ — Enter — consumer thấy ngay.

```bash
# Producer (with --timeout-ms 0)
> 1
> 2
> 3

# Consumer (mỗi line xuất hiện ngay lập tức)
1
2
3
```

### Production tune

Real Java app sẽ set:

```yaml
spring.kafka.producer.properties.linger.ms: 5     # wait 5ms để batch tốt hơn
spring.kafka.producer.batch.size: 32768           # 32 KB batch
```

Balance latency vs throughput:
- Latency-sensitive (chat, gaming): `linger.ms = 0`.
- High throughput (log aggregation, metrics): `linger.ms = 50-100`, `batch.size = 64KB+`.

Detail benchmark ở Phase 10 (High-Throughput Batch Processing).

## Consumer model: PULL, không PUSH

Câu hỏi: Kafka broker push message tới consumer hay consumer pull?

**Consumer PULL**.

### Tại sao không PUSH?

Push attractive: TCP connection sẵn, broker forward immediately.

Vấn đề:

```text
Producer: 100,000 msg/sec.
Broker:   forward all to consumer.
Consumer: chỉ process được 1 msg/sec.

→ Consumer overwhelmed. Messages drop / lost.
```

Kafka guarantee: **mọi message phải được processed**. Cần consumer acknowledge.

Push → mismatched producer/consumer speed → message loss.

### Pull = backpressure tự nhiên

```text
Consumer code:
  while (true) {
      List<Record> records = consumer.poll(Duration.ofMillis(1000));  // pull
      for (Record r : records) {
          process(r);
      }
      consumer.commitSync();  // acknowledge
  }
```

Consumer kiểm soát rate. Chậm? Pull ít hơn. Nhanh? Pull liên tục.

Broker giữ data đến khi consumer pull. **Backpressure tự nhiên**.

### Persistent TCP connection vẫn dùng

Pull không nghĩa là HTTP polling overhead. Kafka client giữ **persistent TCP**, dùng **long-polling**:

```text
Consumer: poll() → broker giữ connection open.
Broker: nếu có message, return ngay. Nếu chưa, wait đến fetch.max.wait.ms (default 500ms), rồi return empty.
```

Hiệu quả như push nhưng consumer dictate flow.

## `max.poll.records` — bao nhiêu record mỗi pull?

```text
Topic order-events có 1,000,000 message backlog.
Consumer poll() → broker gửi bao nhiêu?
```

Nếu broker gửi 1M record cùng lúc:
- Consumer memory explode.
- Processing 1M record trước khi ack → nếu crash, redo từ đầu.

Default: `max.poll.records = 500`.

```text
Consumer driver asks broker: "max 500 messages plz".
Broker: returns up to 500.
Consumer processes 500, commit, poll lại next 500.
```

Properties tương quan:

| Property | Default | Meaning |
|---|---|---|
| `max.poll.records` | 500 | Max records per poll() |
| `max.partition.fetch.bytes` | 1 MB | Max bytes per partition per fetch |
| `fetch.max.bytes` | ~50 MB | Max bytes across all partitions |
| `fetch.min.bytes` | 1 | Broker waits to accumulate at least this much before returning |
| `fetch.max.wait.ms` | 500 | Max wait for fetch.min.bytes |
| `max.poll.interval.ms` | 5 min | Max time between poll() calls — exceed → consumer kicked |

### Tune theo workload

```text
LOW LATENCY (1 record processed in 10ms):
  max.poll.records = 100
  → poll nhỏ, ack thường xuyên.

HIGH THROUGHPUT (batch processing):
  max.poll.records = 5000
  → giảm overhead, process bulk.

LONG PROCESSING (5s per record):
  max.poll.records = 10
  max.poll.interval.ms = 600000 (10 min)
  → tránh kicked vì process chậm.
```

Detail ở Phase 11 (Concurrent Message Processing).

## Producer + Consumer side-by-side

```text
+──────────────────+                            +──────────────────+
│  Producer App    │                            │  Consumer App    │
+──────────────────+                            +──────────────────+
        │                                                  ▲
        │ send(record)                                     │ poll()
        ▼                                                  │
+──────────────────+                            +──────────────────+
│ Producer client  │                            │ Consumer client  │
│  - buffer        │                            │  - subscribe     │
│  - linger.ms     │                            │  - max.poll.records │
│  - batch.size    │                            │  - long-polling  │
+──────────────────+                            +──────────────────+
        │                                                  │
        │ TCP (batched)                                    │ TCP (pull)
        ▼                                                  │
+─────────────────────────────────────────────────────────────────+
│                       Kafka Broker                              │
│  Topic: demo-topic                                              │
│  +─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+         │
│  │1│2│3│4│5│6│7│8│9│...                                    │  │
│  +─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+─+         │
+─────────────────────────────────────────────────────────────────+
```

## Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| `linger.ms = 0` cho high-throughput log | Mỗi msg = 1 network call, lãng phí | linger.ms 50-100ms |
| `linger.ms = 5s` cho real-time alert | UX delay không chấp nhận được | Giảm về 0-10ms |
| `max.poll.records = 1M` | Memory OOM, long processing | Giữ default 500, batch internal |
| Consumer xử lý dài + không tăng `max.poll.interval.ms` | Bị kick + rebalance loop | Tăng interval hoặc tách thành worker thread |

## Tóm tắt bài 3

- `kafka-console-producer.sh` không gửi trực tiếp — qua **Kafka client library (driver)**.
- Driver dùng **linger.ms** (time threshold) + **batch.size** (byte threshold) → flush khi whichever hit first.
- Console default `--timeout-ms 1000` = `linger.ms = 1000`. Set `--timeout-ms 0` để send ngay.
- Production tune: low-latency → 0-5ms, high-throughput → 50-100ms + 32-64KB batch.
- Consumer dùng **PULL model**, không push — để có backpressure tự nhiên, tránh overwhelm consumer.
- Pull dùng **persistent TCP + long-polling** — không phải HTTP polling overhead.
- `max.poll.records` (default 500) controls batch size per poll. Tune theo processing time.

**Bài kế tiếp** → [Bài 4: Serialization + retention policies](04-serialization-retention.md)

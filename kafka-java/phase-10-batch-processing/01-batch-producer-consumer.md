# Bài 1: High-Throughput Batch Processing — producer + consumer

Default Spring Cloud Stream: producer gửi từng message, consumer xử lý từng message. Cho 100 req/sec OK. Cho **100,000 req/sec**, network call per-message giết throughput.

Solution: **batching**. Producer gom 100 message thành 1 request. Consumer nhận 100 message 1 lúc. Bài này: tune producer batching, enable consumer **true end-to-end batching** (gotcha quan trọng), và access metadata (keys, headers) trong batch.

## Producer-side batching (đã quen)

Phase 3 + 5 đã giới thiệu. Recap properties chính:

| Property | Default | Purpose |
|---|---|---|
| `linger.ms` | 0 | Max wait time để gom batch |
| `batch.size` | 16384 (16 KB) | Max byte size of batch |
| `compression.type` | none | Compress batch (lz4, snappy, gzip, zstd) |

**Whichever first**: time OR size hit → flush batch.

### Production tuning

```yaml
spring:
  cloud:
    stream:
      kafka:
        bindings:
          demo-out:
            producer:
              configuration:
                linger.ms: 10               # wait 10ms để batch hơn
                batch.size: 32768           # 32 KB
                compression.type: lz4       # fast + decent ratio
```

`linger.ms: 10` cân bằng:
- ≤5ms: batch nhỏ, latency tốt.
- 10-50ms: throughput tốt, latency vẫn OK.
- 1000ms+: significant lag (as seen in console producer default 1s).

`compression.type: lz4` recommended:
- LZ4: fast compress, good ratio.
- Snappy: slightly faster, lower ratio.
- Gzip: high ratio, slow CPU.
- Zstd: best balance modern, default in newer Kafka versions.

### App code — không đổi

```java
@Component
public class HighThroughputProducer implements CommandLineRunner {

    private final StreamBridge streamBridge;

    public HighThroughputProducer(StreamBridge streamBridge) {
        this.streamBridge = streamBridge;
    }

    @Override
    public void run(String... args) throws Exception {
        for (int i = 1; i <= 1_000_000; i++) {
            streamBridge.send("demo-out", "message-" + i);
            
            if (i % 1000 == 0) {
                log.info("Produced {} messages", i);
                Thread.sleep(10);    // demo throttle
            }
        }
    }
}
```

Kafka client buffers messages → flush in batches. App code blind.

## Consumer-side batching

Default consumer:
```java
@Bean
public Consumer<String> consumer() {
    return msg -> processOne(msg);
}
```

SCS deliver **1 message at a time**. Even if Kafka client internally pulls 500 messages per poll.

→ **Not true batching**. End-to-end still 1-by-1 (with DB writes).

### Properties for consumer batching

| Property | Default | Purpose |
|---|---|---|
| `max.poll.records` | 500 | Max records per poll |
| `fetch.min.bytes` | 1 | Min bytes broker waits to accumulate before responding |
| `fetch.max.wait.ms` | 500 | Max wait time broker accumulates |
| `fetch.max.bytes` | ~50MB | Max bytes per fetch |

Tuning:
```yaml
consumer:
  configuration:
    max.poll.records: 2000              # bigger batches
    fetch.min.bytes: 1024               # 1KB minimum (avoid tiny fetches)
```

`fetch.min.bytes`:
- Broker waits until ≥ this much data before returning.
- If `fetch.max.wait.ms` hits first → returns whatever available.
- Reduces unnecessary network round trips.

Note: `fetch.min.bytes` includes **headers + key + value + metadata**, not just payload.

### Critical: enable `consumer.batch-mode`

Tune broker → consumer client effective. But **app receives messages 1 by 1** still.

To get **true end-to-end batching**, bean signature changes:

```java
@Bean
public Consumer<List<String>> consumer() {       // ← List<T>!
    return batch -> {
        log.info("Batch received: {} messages", batch.size());
        // insert all to DB in one round trip
        repo.saveAll(batch.stream()
            .map(msg -> new MessageEntity(msg))
            .toList());
    };
}
```

YAML:

```yaml
spring:
  cloud:
    function:
      definition: consumer
    stream:
      kafka:
        bindings:
          consumer-in-0:
            consumer:
              configuration:
                fetch.min.bytes: 1024
                max.poll.records: 2000
      bindings:
        consumer-in-0:
          destination: demo-topic
          group: demo-group
          consumer:
            batch-mode: true                  # ← KEY!
```

`batch-mode: true` tells SCS: "deliver **List of messages** to bean."

**Without** `batch-mode: true`:
- Spring confused: "is `List<String>` one event of list type, or list of events?"
- Default: treat as 1 event of list → wrong.

`batch-mode: true` clarifies.

### Demo flow

```text
Producer: 1M messages, super fast.
↓ batches of ~32KB each
Kafka broker: stores batches.
↓ consumer poll
Consumer batch size: up to 2000 records per call.
↓ delivered to consumer bean as List<String>
@Bean Consumer<List<String>>:
  - process all 2000 in 1 call
  - 1 DB insert (saveAll)
```

End-to-end batched. 100-1000× throughput improvement vs per-message.

## Demo (5-lesson scope)

### Setup

Stop cluster (Phase 9). Use single-broker Kafka:

```bash
docker compose down
cd /path/to/01-kafka-setup
docker compose up -d
```

Create topic:
```bash
docker exec -it kafka bash
cd /opt/kafka/bin
./kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic demo-topic --partitions 1
```

### Producer

```java
@Component
public class BatchProducer implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(BatchProducer.class);
    
    private final StreamBridge streamBridge;

    public BatchProducer(StreamBridge streamBridge) {
        this.streamBridge = streamBridge;
    }

    @Override
    public void run(String... args) throws Exception {
        for (int i = 1; i <= 1_000_000; i++) {
            streamBridge.send("demo-out", "message-" + i);
            if (i % 1000 == 0) {
                log.info("Total messages produced: {}", i);
                Thread.sleep(10);
            }
        }
    }
}
```

### Producer YAML

```yaml
# section10/02-producer.yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          demo-out:
            producer:
              configuration:
                linger.ms: 10
                batch.size: 32768
                compression.type: lz4
      bindings:
        demo-out:
          destination: demo-topic
```

### Consumer

```java
@Configuration
public class BatchConsumerConfig {

    private static final Logger log = LoggerFactory.getLogger(BatchConsumerConfig.class);
    private final AtomicInteger totalProcessed = new AtomicInteger();

    @Bean
    public Consumer<List<String>> consumer() {
        return batch -> {
            int batchSize = batch.size();
            int total = totalProcessed.addAndGet(batchSize);
            log.info("Batch received: {} messages. Total processed: {}", batchSize, total);
        };
    }
}
```

### Consumer YAML

```yaml
# section10/01-consumer.yaml
spring:
  cloud:
    function:
      definition: consumer
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          consumer-in-0:
            consumer:
              configuration:
                fetch.min.bytes: 1024
                max.poll.records: 2000
                auto.offset.reset: earliest
      bindings:
        consumer-in-0:
          destination: demo-topic
          group: demo-group
          consumer:
            batch-mode: true
```

### Run

Start consumer → start producer.

Consumer log:
```text
Batch received: 91 messages. Total processed: 91
Batch received: 1000 messages. Total processed: 1091
Batch received: 1000 messages. Total processed: 2091
Batch received: 600 messages. Total processed: 2691
...
Batch received: 850 messages. Total processed: 999321
Batch received: 679 messages. Total processed: 1000000
```

Batch sizes vary (91, 1000, 600, ...) based on:
- Available data when polled.
- `max.poll.records` cap (2000).
- `fetch.min.bytes` threshold.

End: 1M messages processed.

## Performance numbers

| Approach | Throughput | Latency |
|---|---|---|
| Per-message produce + per-message consume | 1k-5k msg/sec | Lowest (per-msg overhead high) |
| Batched produce + per-message consume | 10k-50k msg/sec | Low |
| Batched produce + batched consume + batched DB | 100k-1M+ msg/sec | Higher (wait for batch) |

True batching = 100-1000× throughput improvement.

## Accessing metadata in batch mode — gotcha

What if you need keys / headers per message in a batch?

### Naive (WRONG)

```java
@Bean
public Consumer<List<Message<String>>> consumer() {     // ← NOT supported in batch mode
    return batch -> {
        for (Message<String> msg : batch) {
            String key = msg.getHeaders().get(KafkaHeaders.RECEIVED_KEY, String.class);
            String payload = msg.getPayload();
        }
    };
}
```

Spring docs explicitly: **`List<Message<T>>` not supported with batch mode**.

### Correct: `Message<List<T>>`

```java
@Bean
public Consumer<Message<List<String>>> consumer() {       // ← Message<List<T>>!
    return msg -> {
        List<String> payloads = msg.getPayload();
        
        // Headers are LISTS of all keys/headers
        List<String> keys = (List<String>) msg.getHeaders().get(KafkaHeaders.RECEIVED_KEY);
        List<String> sources = (List<String>) msg.getHeaders().get("source");
        
        for (int i = 0; i < payloads.size(); i++) {
            String payload = payloads.get(i);
            String key = keys != null ? keys.get(i) : null;
            String source = sources != null ? sources.get(i) : null;
            // process individual record
        }
    };
}
```

API ugly. Spring rationale:
- Avoid creating N `Message<T>` objects (allocation cost).
- Provide raw arrays for performance.

Index-aligned: `payloads[i]` corresponds to `keys[i]`, `sources[i]`.

### Reality check

Most consumers don't need per-message keys. If you do, app pattern:

```java
record EnrichedMessage(String key, String payload, String source) {}

@Bean
public Consumer<Message<List<String>>> consumer() {
    return msg -> {
        List<EnrichedMessage> enriched = extractMessages(msg);
        // process List<EnrichedMessage> uniformly
    };
}

private List<EnrichedMessage> extractMessages(Message<List<String>> msg) {
    List<String> payloads = msg.getPayload();
    List<String> keys = headerOrEmpty(msg, KafkaHeaders.RECEIVED_KEY);
    List<String> sources = headerOrEmpty(msg, "source");
    
    return IntStream.range(0, payloads.size())
        .mapToObj(i -> new EnrichedMessage(
            getOrNull(keys, i),
            payloads.get(i),
            getOrNull(sources, i)
        ))
        .toList();
}
```

Encapsulate ugliness. Rest of code uniform.

## Trade-offs of batching

| Pro | Con |
|---|---|
| Higher throughput | Higher latency (wait to batch) |
| Lower network overhead | Memory usage (buffer) |
| Compression efficient | Batch failure = many messages affected |
| Reduce DB round trips | Need different code path (consumer batch-mode) |
| Better resource utilization | Harder to debug individual messages |

### When NOT batch

| Scenario | Reason |
|---|---|
| Low traffic (< 100 msg/sec) | Overhead unjustified |
| Latency-critical (real-time alerts) | Batching adds wait |
| Per-message complex logic | Batch processing simplifies less |
| Different per-message error handling | Failure isolation harder |

### When YES batch

| Scenario | Reason |
|---|---|
| High throughput (10k+ msg/sec) | Network overhead per msg dominates |
| Bulk DB writes | One transaction for batch |
| Stream processing aggregation | Natural fit |
| Log shipping / metrics | Latency tolerant |
| Heavy compression benefit | Large batches compress well |

## Anti-patterns

| Anti-pattern | Problem | Fix |
|---|---|---|
| `batch.size` but no `linger.ms` increase | Small batches due to time | Tune both |
| `linger.ms` very high (1000ms) | UX delay noticeable | Keep 5-50ms |
| Fetch `Consumer<String>` but expect batch | 1-by-1 only | `Consumer<List<T>>` |
| Forget `batch-mode: true` | Treats list as 1 event | YAML config |
| Catch + swallow exception in batch | Whole batch fails together | Error handling Phase 13 |
| `max.poll.records` super high (50k) | OOM | Bound to realistic batch |

## Tóm tắt bài 1 + Phase 10

- **Producer batching**: `linger.ms` + `batch.size` (whichever first). Compression (lz4). Production: 10ms linger, 32KB batch, lz4.
- **Consumer batching**: `fetch.min.bytes`, `max.poll.records`. App-level: change bean signature.
- **True end-to-end batching** requires:
  - `Consumer<List<T>>` bean type.
  - `consumer.batch-mode: true` in YAML.
  - Process records in bulk (saveAll, batch insert).
- Throughput 100-1000× improvement potential.
- **Metadata in batch**: `Message<List<T>>` + headers as `List<...>` (NOT `List<Message<T>>`).
- Trade-off: latency for throughput. Skip for low-traffic or latency-critical.
- Phase 11 sẽ cover **concurrent processing** (multi-thread per consumer) — complementary to batching.

**Bài kế tiếp** → [Phase 11 - Concurrent Message Processing](../phase-11-concurrent-processing/01-concurrency-models.md)

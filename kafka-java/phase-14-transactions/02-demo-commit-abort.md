# Bài 2: Setup + Demo transaction commit, abort, retry

Bài 1 lý thuyết transaction. Bài này: setup processor app dùng transaction, demo 3 scenario:
- **Success**: tx commit, message visible cho read-committed consumer.
- **Always fail**: tx luôn abort, retry + DLQ.
- **Random fail**: 30% fail, observe behavior.

## Project setup

```text
Section 18:
  dto/
    TransferRequest.java         — input: from, to, amount
    TransactionRequest.java      — output: account, amount, type (credit/debit)
  processor/
    ProcessorConfig.java         — bean processor + helper methods
```

### DTOs

```java
public record TransferRequest(String from, String to, double amount) {}

public record TransactionRequest(String account, double amount, String type) {}
```

Input: `TransferRequest` (transfer Mike → Sam, $10).
Output: 2 `TransactionRequest` (credit Sam $10, debit Mike $10).

### Processor bean

```java
@Configuration
public class ProcessorConfig {

    private static final Logger log = LoggerFactory.getLogger(ProcessorConfig.class);
    private static final String OUTPUT_BINDING = "transaction-request-out";

    private final StreamBridge streamBridge;

    public ProcessorConfig(StreamBridge streamBridge) {
        this.streamBridge = streamBridge;
    }

    @Bean
    public Consumer<Message<TransferRequest>> processor() {
        return msg -> {
            String key = (String) msg.getHeaders().get(KafkaHeaders.RECEIVED_KEY);
            TransferRequest req = msg.getPayload();
            
            switch (key) {
                case "1":
                    // Success case — both runnables = no-op
                    handleTransferRequest(req, noOp(), noOp());
                    break;
                case "2":
                    // Always fail — runnable 2 throws 100% chance
                    handleTransferRequest(req, noOp(), throwException(100));
                    break;
                case "3":
                    // Random fail 30%
                    handleTransferRequest(req, throwException(30), throwException(30));
                    break;
                default:
                    throw new InvalidKeyException("Unknown key: " + key);
            }
        };
    }

    private void handleTransferRequest(TransferRequest req, 
                                        Runnable beforeDebit, 
                                        Runnable afterDebit) {
        // Build 2 transaction requests
        TransactionRequest credit = new TransactionRequest(req.to(), req.amount(), "CREDIT");
        TransactionRequest debit = new TransactionRequest(req.from(), req.amount(), "DEBIT");
        
        // Emit credit
        streamBridge.send(OUTPUT_BINDING, credit);
        runWithDelay(beforeDebit);    // simulate processing time + possible failure
        
        // Emit debit
        streamBridge.send(OUTPUT_BINDING, debit);
        runWithDelay(afterDebit);     // simulate processing time + possible failure
    }

    private void runWithDelay(Runnable r) {
        try {
            Thread.sleep(3000);       // 3s delay để observe ở demo
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        r.run();
    }

    private Runnable noOp() {
        return () -> {};
    }

    private Runnable throwException(int percentChance) {
        return () -> {
            int random = ThreadLocalRandom.current().nextInt(1, 101);  // 1-100
            if (random <= percentChance) {
                throw new RuntimeException("Simulated failure (random " + random + ")");
            }
        };
    }
}
```

### YAML config — transaction enabled

```yaml
# section18/01-processor.yaml
spring:
  cloud:
    function:
      definition: processor
    stream:
      kafka:
        binder:
          brokers: localhost:9092
          transaction:
            transaction-id-prefix: tx-                  # ← KEY 1
            producer:
              configuration:
                acks: all                               # ← KEY 2
        bindings:
          processor-in-0:
            consumer:
              enable-dlq: true
              dlq-name: transfer-request-dlq
              configuration:
                key.deserializer: org.apache.kafka.common.serialization.StringDeserializer
                isolation.level: read_committed         # ← KEY 3
          transaction-request-out:
            producer:
              configuration:
                key.serializer: org.apache.kafka.common.serialization.StringSerializer
      bindings:
        processor-in-0:
          destination: transfer-request
          group: processor-service
          consumer:
            max-attempts: 3
            back-off-initial-interval: 2000
        transaction-request-out:
          destination: transaction-request
```

3 property quan trọng nhất:

#### `transaction-id-prefix: tx-`

Báo Spring rằng processor này dùng transaction. Spring tự build `transactional.id` cho từng instance bằng cách concat prefix + ID instance.

```text
Instance 1: transactional.id = "tx-..." (Spring tự đặt suffix unique)
Instance 2: transactional.id = "tx-..." (khác)
```

Production: nên include application name + random ID:
```yaml
transaction-id-prefix: payment-processor-${random.uuid}-
```

→ Đảm bảo unique giữa các deploy + multi-instance.

#### `acks: all`

Producer chờ **mọi in-sync replica** ack trước khi xem là gửi thành công.

```text
acks=0: gửi đi rồi quên (fastest, có thể mất data).
acks=1: leader ack đủ (default, ổn).
acks=all: leader + follower in-sync đều ack (slowest, an toàn nhất).
```

Transaction **yêu cầu acks=all**. Nếu chỉ leader ack rồi crash trước khi replicate → data mất → break transaction guarantee.

#### `isolation.level: read_committed`

Consumer chỉ thấy message của tx đã commit. Bắt buộc khi có producer transactional.

## Demo flow

### Setup 3 terminal

```bash
# Terminal 1: producer cho transfer-request (input topic)
./kafka-console-producer.sh \
  --bootstrap-server localhost:9092 \
  --topic transfer-request \
  --property parse.key=true --property key.separator=:

# Terminal 2: consumer read_committed cho transaction-request (output topic)
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic transaction-request \
  --from-beginning \
  --consumer-property isolation.level=read_committed

# Terminal 3: consumer read_uncommitted cho cùng topic
./kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic transaction-request \
  --from-beginning \
  --consumer-property isolation.level=read_uncommitted
```

Start Spring app section 18.

## Demo 1: Key "1" — success commit

T1 producer:
```
1:{"from":"Mike","to":"Sam","amount":10}
```

Processor xử lý:
- Begin transaction.
- Emit credit (CREDIT, Sam, 10) → ghi vào topic (chưa commit).
- Sleep 3s.
- Emit debit (DEBIT, Mike, 10) → ghi vào topic.
- Sleep 3s.
- Commit transaction.

Quan sát:

**T3 (read_uncommitted)**: thấy 2 message **NGAY KHI emit**:
```text
T+0s: credit Sam 10
T+3s: debit Mike 10
(không đợi commit)
```

**T2 (read_committed)**: KHÔNG thấy gì cho đến **sau khi commit** (~T+6s):
```text
T+6s: credit Sam 10
T+6s: debit Mike 10
(đến cùng lúc, atomic batch)
```

✅ Atomic: T2 thấy cả 2 message cùng lúc, không có "credit Sam mà chưa debit Mike."

## Demo 2: Key "2" — always fail → retry → DLQ

T1:
```
2:{"from":"Mike","to":"Sam","amount":20}
```

Processor:
- Begin tx.
- Emit credit → topic (chưa commit).
- Sleep 3s.
- Emit debit → topic.
- Sleep 3s, **throw exception** (100% chance).
- → Spring abort tx + retry.

Retry attempt 2:
- Begin tx mới.
- Emit credit + debit lần 2 (vào topic).
- Throw exception.
- Abort + retry.

Retry attempt 3:
- Cùng cảnh.
- Abort.
- Exhausted → Spring publish original message vào DLQ.

Quan sát:

**T3 (read_uncommitted)**: thấy credit + debit **3 lần** (3 attempt):
```text
credit Sam 20
debit Mike 20
credit Sam 20      ← retry 1
debit Mike 20
credit Sam 20      ← retry 2
debit Mike 20
```

⚠️ T3 thấy duplicate vì đọc cả message bị abort. Nếu T3 là production consumer → bug.

**T2 (read_committed)**: **KHÔNG thấy gì**. Vì mọi tx đều abort.

✅ T2 chính xác — không xử lý duplicate.

### Log Spring app

```text
[Processor] Begin transaction
[Processor] Sent credit
[Processor] Sent debit
[Processor] EXCEPTION → abort transaction
[Spring] Transaction rolled back. Retrying...
[Processor] Begin transaction (attempt 2)
... (same flow)
[Spring] Max attempts reached. Publishing to DLQ.
```

T4 (DLQ consumer) — sẽ thấy original `TransferRequest` cho key 2 + exception headers.

### Quirk: delivery attempt header luôn = 1 khi dùng transaction

Phase 13 dùng `kafka_deliveryAttempt` header để biết là retry lần thứ mấy.

Với transaction: header **luôn = 1**. Vì Spring không retry in-memory như Phase 13. Mỗi tx abort = consume **fresh** từ broker → header reset.

→ Khi dùng transaction + cần tracking retry attempt: không dùng được header này. Phải custom logic.

## Demo 3: Key "3" — random 30% fail

T1:
```
3:{"from":"Mike","to":"Sam","amount":30}
```

Behavior random — có thể success ngay attempt 1, hoặc fail vài lần rồi success, hoặc fail hết → DLQ.

Quan sát:
- T3 (read_uncommitted): thấy mọi attempt, bao gồm các attempt fail.
- T2 (read_committed): chỉ thấy cuối cùng (nếu eventually success), hoặc không gì (nếu exhaust → DLQ).

## So sánh với non-transactional

Phase 13 non-transactional:
- Retry 3 lần → cả 3 lần emit message → consumer xử lý 3 lần → **duplicate**.
- Cần consumer idempotent để safe.

Phase 14 transactional + read_committed:
- Retry 3 lần → 2 lần đầu abort → consumer KHÔNG thấy.
- Lần 3 commit (nếu success) → consumer thấy 1 lần.
- **KHÔNG duplicate** → consumer không cần idempotent cho phần này.

→ Đây là **exactly-once semantic** trong scope Kafka.

## Verify trong DLQ

```bash
./kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic transfer-request-dlq \
  --from-beginning \
  --property print.headers=true \
  --property print.key=true
```

Sẽ thấy:
```text
key=2
value={"from":"Mike","to":"Sam","amount":20}

Headers:
  x-exception-fqcn: java.lang.RuntimeException
  x-exception-message: Simulated failure (random 23)
  x-original-topic: transfer-request
  ...
```

Original message preserved + exception detail. Ops review và quyết định reprocess.

## Tóm tắt bài 2

- Project setup: processor consume `TransferRequest`, emit 2 `TransactionRequest` (credit + debit).
- Key trong message dùng để simulate behavior: 1 = success, 2 = always fail, 3 = random 30%.
- YAML cần 3 setting cốt lõi cho transaction:
  - `transaction-id-prefix` — bật transaction mode.
  - `acks: all` — đảm bảo replication trước khi commit.
  - `isolation.level: read_committed` — consumer chỉ thấy committed messages.
- Demo 1 (success): read_committed thấy cả 2 message cùng lúc (atomic). read_uncommitted thấy ngay khi emit.
- Demo 2 (always fail): read_uncommitted thấy duplicate (3 attempt). read_committed không thấy gì. DLQ nhận message gốc.
- Demo 3 (random): mix outcome.
- Transaction + read_committed = **exactly-once** trong Kafka scope. Không cần idempotent consumer cho phần đọc/ghi Kafka.
- Quirk: `kafka_deliveryAttempt` header luôn = 1 trong transaction mode (Spring không retry in-memory).

**Bài kế tiếp** → [Bài 3: Exactly-Once myth vs reality + Phase 14 summary](03-eos-myth-summary.md)

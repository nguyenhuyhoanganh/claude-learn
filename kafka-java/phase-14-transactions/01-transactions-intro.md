# Bài 1: Business case + cách Kafka transaction hoạt động

Phase 12 dạy at-least-once delivery (có thể duplicate, không mất). Phase 13 dạy retry + DLQ. Đủ cho 95% case.

5% còn lại = **financial transactions, billing, inventory critical**. Cần guarantee mạnh hơn: **exactly-once semantic (EOS)** — không duplicate, không mất.

Bài này: business case cho transaction, cách Kafka transaction hoạt động internal, consumer isolation level.

## Business case — money transfer

Mike chuyển $10 cho Sam. App nhận request.

```text
Single request từ ngoài:
  POST /transfer { from: "Mike", to: "Sam", amount: 10 }

Internal operations (KHÔNG phải 1 operation):
  1. Trừ $10 từ Mike's account.
  2. Cộng $10 vào Sam's account.
```

2 operation phải behave như **1 atomic unit**: hoặc **cả 2** succeed, hoặc **không cái nào** succeed. Không chấp nhận intermediate state.

### Bad scenarios

Intermediate states phải tránh:

```text
Scenario A: 
  $10 cộng vào Sam ✓
  Sau đó crash trước khi trừ Mike ✗
  → Sam có thêm $10 "miễn phí". Mike vẫn nguyên balance.
  → Tổng tiền trong hệ thống TĂNG → bank lỗ.

Scenario B:
  $10 trừ Mike ✓
  Crash trước khi cộng Sam ✗
  → Mike mất $10, Sam không nhận.
  → Tổng tiền GIẢM → customer mất tiền.
```

Database transaction giải: `BEGIN → operation 1 → operation 2 → COMMIT`. Hoặc `ROLLBACK` nếu fail.

## Translation vào Kafka

Scenario tương tự nhưng với processor app (consume + produce):

```text
Producer publish "transfer-request: Mike → Sam, $10" vào topic A.

Processor consume topic A, làm:
  1. Validate transfer request.
  2. Split thành 2 transaction request: credit Sam, debit Mike.
  3. Publish 2 message vào topic B.
  4. Ack message gốc trong topic A.
```

3 step liên quan đến Kafka (publish 2 message + ack input) phải atomic:

```text
Tình huống 1: Processor crash sau khi publish credit Sam, trước khi publish debit Mike.
  Input message KHÔNG được ack (vì chưa xong).
  Processor restart → consume lại input → publish lại credit Sam → publish debit Mike.
  → Sam được credit 2 LẦN!

Tình huống 2: Processor publish cả 2 thành công, nhưng crash trước khi ack input.
  Restart → consume lại input → publish lại credit + debit.
  → Sam credit 2 lần, Mike debit 2 lần.
```

Đây chính xác là **at-least-once duplicate problem** từ Phase 12. Không acceptable cho money.

### Mong muốn

```text
Atomic guarantee:
  - Consume input + Produce N output + Ack input = 1 unit
  - Hoặc cả 4 đều thành công.
  - Hoặc cả 4 đều rollback (như chưa xảy ra).
```

Đây là cái **Kafka transactions** giải quyết.

## Kafka transaction internal — high level

### Components

```text
+──────────────────────────────────────────────+
│ Kafka Cluster                                 │
│                                               │
│  +────────────────────────────────────────+ │
│  │ Transaction Coordinator                  │ │
│  │ (component nội bộ, không phải service   │ │
│  │  riêng)                                  │ │
│  │ - Track transaction đang open / committed│ │
│  │   / aborted                              │ │
│  │ - Lưu state trong internal topic         │ │
│  │   __transaction_state                    │ │
│  +────────────────────────────────────────+ │
│                                               │
│  +────────────────────────────────────────+ │
│  │ Topic order-events                       │ │
│  │ messages...                              │ │
│  +────────────────────────────────────────+ │
+──────────────────────────────────────────────+

           ▲                       ▲
           │ tx control            │ produce
           │                       │
+───────────────────────+
│ Processor App         │
│ transactional.id = ?  │
+───────────────────────+
```

### Bước hoạt động

```text
1. Processor App khởi tạo với property:
   transactional.id = "payment-processor-instance-1"
   
   → Đây là KEY. Không có cái này = không dùng transaction được.

2. App gọi producer.initTransactions()
   → Producer connect với Transaction Coordinator.
   → Coordinator track: instance này có thể bắt đầu transaction.

3. App gọi producer.beginTransaction()
   → Báo coordinator: "Tao bắt đầu transaction T1."

4. App publish messages: M1, M2, M3, ...
   → Messages được ghi vào topic NGAY LẬP TỨC (lưu xuống disk).
   → Coordinator track: M1, M2, M3 thuộc T1.
   → Messages CHƯA commit — consumer với isolation level read_committed
     sẽ KHÔNG thấy chúng.

5a. App gọi producer.commitTransaction()
    → Coordinator ghi COMMIT MARKER vào topic.
    → Marker = "transaction T1 done".
    → Read-committed consumer giờ có thể đọc M1, M2, M3.

5b. App gọi producer.abortTransaction() (case lỗi)
    → Coordinator ghi ABORT MARKER vào topic.
    → KHÔNG xoá M1, M2, M3 (Kafka topic immutable — chỉ append).
    → Read-committed consumer SKIP M1, M2, M3.
```

### Quan trọng: abort KHÔNG xoá message

Khác với database rollback (xoá row), Kafka transaction **không xoá message**. Lý do: **partition là append-only immutable** (Phase 3 đã học).

Cơ chế thay thế: **abort marker** = một message đặc biệt nói "mọi message thuộc tx này phải bị ignore."

Consumer phải tự **filter** dựa vào marker. Đó là vai trò của **isolation level** (sẽ học dưới).

### Trường hợp processor crash giữa chừng

```text
Processor begin transaction T1, publish M1, M2.
💥 Process crash trước khi commit hoặc abort.

Coordinator đợi 60 giây (default `transaction.timeout.ms`).
Hết 60s, coordinator tự ABORT transaction → ghi abort marker.

M1, M2 đã ghi vào topic nhưng bị mark abort → consumer skip.
```

→ Không có "transaction zombie" treo mãi.

### Multi-instance — unique transactional.id

Production thường chạy multiple processor instance để scale.

```text
Instance 1: transactional.id = "payment-processor-instance-1"
Instance 2: transactional.id = "payment-processor-instance-2"
Instance 3: transactional.id = "payment-processor-instance-3"
```

Mỗi instance phải **unique** transactional.id. Coordinator cần track riêng từng instance.

Trong topic, messages từ các transaction có thể **interleave**:

```text
Topic order-events offset:
  100: M1 (Tx1, instance 1) — open
  101: M1 (Tx2, instance 2) — open
  102: M2 (Tx1, instance 1) — open
  103: COMMIT marker (Tx1)
  104: M2 (Tx2, instance 2) — open
  105: ABORT marker (Tx2)
  ...
```

Consumer phải tự hiểu marker để đọc đúng.

## Consumer Isolation Level

```yaml
spring.cloud.stream.kafka.bindings.consumer-in-0.consumer.configuration:
  isolation.level: read_committed         # hoặc read_uncommitted (default)
```

### `read_uncommitted` (default)

Consumer thấy **MỌI message** trong topic, bất kể transaction status.

```text
Topic:
  M1 (Tx1 committed)
  M2 (Tx2 aborted)        ← consumer vẫn thấy!
  M3 (Tx1 committed)
  M4 (Tx2 aborted)        ← consumer vẫn thấy!
  M5 (Tx3 in progress)    ← consumer vẫn thấy!

read_uncommitted consumer thấy: M1, M2, M3, M4, M5.
```

→ Backward compatibility với consumer cũ (trước khi Kafka có transactions).

### `read_committed`

Consumer chỉ thấy message của **transaction đã COMMIT**.

```text
Cùng topic ở trên.
read_committed consumer thấy: chỉ M1, M3.
  - M2, M4 bị abort → skip.
  - M5 chưa committed → BLOCK đợi commit/abort marker, không advance offset.
```

⚠️ Quan trọng: `read_committed` consumer **không thể đọc qua** một transaction in-progress. Nếu Tx3 stuck → consumer cũng stuck cho đến khi Tx3 commit hoặc abort.

→ Lý do `transaction.timeout.ms = 60s` default. Đảm bảo tx không treo mãi.

### Khi nào dùng cái nào?

| Producer phía gửi | Consumer nên dùng |
|---|---|
| Không dùng transaction | `read_uncommitted` OK (mọi message đều "committed" theo nghĩa thông thường) |
| Producer/processor dùng transaction | `read_committed` để filter abort markers |
| Mix (cùng topic có cả tx và non-tx) | `read_committed` (an toàn) |

Production rule: nếu có ANY producer transactional → consumer phải `read_committed`. Nếu không → consumer sẽ thấy aborted messages = bug.

## Trade-off của transaction

| Trade-off | Detail |
|---|---|
| Latency cao hơn | Mỗi tx có overhead init + commit/abort markers |
| Throughput thấp hơn | Producer phải đợi coordinator ack |
| Memory consumer | `read_committed` buffer message đợi commit marker |
| Storage | Markers + transaction state topic chiếm extra space |
| Configuration phức tạp | Nhiều property phải đúng đồng loạt |
| Đáng dùng khi | Critical data integrity (money, inventory, audit) |

→ Không dùng transaction cho mọi topic. Chỉ apply khi business requirement đòi.

## Tóm tắt bài 1

- Business case: cần atomic **consume input + produce N output + ack input** = 1 unit.
- At-least-once + retry không đủ — sẽ duplicate critical data.
- **Kafka transactions** giải bằng cách:
  - Producer đăng ký `transactional.id` (mỗi instance unique).
  - `beginTransaction()` → publish messages → `commitTransaction()` hoặc `abortTransaction()`.
  - **Transaction Coordinator** track state, lưu trong `__transaction_state` topic.
- Messages publish ngay vào topic, nhưng **chưa visible** với read_committed consumer cho đến khi có **commit marker**.
- Abort **không xoá** message (topic immutable) — chỉ ghi **abort marker** để consumer skip.
- Processor crash giữa chừng → coordinator auto abort sau `transaction.timeout.ms` (default 60s).
- **Consumer isolation level**:
  - `read_uncommitted` (default): thấy mọi message kể cả aborted.
  - `read_committed`: chỉ thấy message đã committed; block khi gặp tx in-progress.
- Nếu có producer transactional → consumer phải `read_committed` để đúng.
- Trade-off: latency + throughput thấp hơn. Dùng cho critical use cases only.

**Bài kế tiếp** → [Bài 2: Setup + Demo transaction commit + abort](02-demo-commit-abort.md)

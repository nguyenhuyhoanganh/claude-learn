# Bài 33: Outbox Pattern — vá lỗ hổng dual-write một lần và mãi mãi

> Phase-8 đã chỉ ra: Order service crash giữa "save DB" và "publish Kafka" làm SAGA stuck. Phase-9 giải triệt để bằng **Outbox Pattern**. Bài này dạy lý thuyết: vì sao dual-write nguy hiểm, Outbox hoạt động ra sao, và 2 cách implement (polling vs CDC).

## Vấn đề dual-write — chính thức gọi tên

Trong 1 use case, service phải làm **2 thao tác** ở **2 hệ thống**:
1. UPDATE DB local.
2. PUBLISH message Kafka.

Không có ACID transaction xuyên DB + Kafka. 4 kịch bản có thể xảy ra:

```text
┌───────────────────────────┬─────────────────┬─────────────────┐
│ Kịch bản                  │ DB              │ Kafka           │
├───────────────────────────┼─────────────────┼─────────────────┤
│ #1: cả 2 đều OK            │ ✓ commit         │ ✓ publish        │   ← happy
│ #2: cả 2 đều fail          │ ✗ rollback       │ ✗ no publish     │   ← OK
│ #3: DB OK, Kafka fail      │ ✓ commit         │ ✗ no publish     │   ← LỆCH
│ #4: DB fail, Kafka OK       │ ✗ rollback       │ ✓ published      │   ← LỆCH
└───────────────────────────┴─────────────────┴─────────────────┘
```

#3 và #4 là **lỗ hổng dual-write**. Hệ thống lệch — DB local nói "đã PAID" nhưng service khác không biết (#3); hoặc service khác nghĩ đã PAID nhưng DB chưa commit (#4).

Phase-8 publish **sau** save DB → thường rơi vào #3. Nếu publish trước save → rơi vào #4.

### Tại sao XA transaction không cứu được?

XA (2PC) coordinate được DB + Kafka. Nhưng:
- Kafka XA hỗ trợ kém + slow.
- 2PC block khi coordinator chết → SAGA stuck khác.
- Performance kém.

→ Industry **bỏ XA** và dùng Outbox.

## Outbox Pattern — ý tưởng

**Bí mật**: ghi message vào **một bảng đặc biệt** trong **cùng DB** với data business. Cùng 1 ACID transaction:

```text
BEGIN TRANSACTION
  INSERT INTO orders (...)            ← business data
  INSERT INTO payment_outbox (...)    ← message để gửi
COMMIT
```

Một ACID transaction → atomic. Save Order + INSERT outbox cùng commit hoặc cùng rollback. Không có #3 #4 dual-write nữa.

Sau đó:
```text
[Scheduler chạy mỗi 5s]
  SELECT * FROM payment_outbox WHERE status = 'STARTED'
  FOR EACH row:
    PUBLISH to Kafka
    UPDATE payment_outbox SET status = 'COMPLETED' WHERE id = row.id
```

Scheduler đọc outbox → publish → mark sent.

### Edge case: scheduler crash giữa publish và mark COMPLETED?

```text
Publish thành công                ✓ Kafka có message
↓ crash trước UPDATE                ✗ outbox status vẫn STARTED
Restart scheduler:
  SELECT WHERE STARTED → vẫn lấy row này
  PUBLISH lại → Kafka có message DUPLICATE.
```

Đây là **at-least-once** — message có thể duplicate. **Consumer phải idempotent**. Phase-8 đã có UNIQUE constraint mức DB cho Payment + Restaurant. Phase-9 sẽ làm chặt hơn với optimistic locking.

## Outbox table schema

Cấu trúc tổng quát:

```sql
CREATE TABLE service.outbox (
    id              uuid NOT NULL,                  -- PK outbox row
    saga_id         uuid NOT NULL,                  -- ID của SAGA instance
    created_at      timestamp WITH TIME ZONE NOT NULL,
    type            character varying NOT NULL,     -- loại message ("OrderPaymentRequest")
    payload         jsonb NOT NULL,                  -- message data
    outbox_status   varchar(50) NOT NULL,           -- STARTED, COMPLETED, FAILED
    saga_status     varchar(50) NOT NULL,           -- SAGA state khi insert
    order_status    varchar(50) NOT NULL,           -- Order state khi insert
    version         integer NOT NULL,               -- optimistic locking
    CONSTRAINT outbox_pkey PRIMARY KEY (id)
);

CREATE INDEX outbox_status_idx ON service.outbox (outbox_status);
```

3 trường status:
- **outbox_status**: STARTED (chưa publish) → COMPLETED (đã publish) → FAILED (publish lỗi nhiều lần).
- **saga_status**: track SAGA instance đang ở giai đoạn nào (STARTED, PROCESSING, COMPENSATING, SUCCEEDED, FAILED).
- **order_status**: snapshot trạng thái Order khi insert (cho debug/audit).

## Workflow của Outbox

```text
1. Use case: tạo Order
   BEGIN
     INSERT orders (id=X, status=PENDING)
     INSERT payment_outbox (saga_id=Y, payload={orderId=X, ...}, status=STARTED)
   COMMIT
   
   Atomic → cả 2 trong cùng transaction.

2. Scheduler poll mỗi 5s:
   SELECT * FROM payment_outbox WHERE outbox_status = 'STARTED' LIMIT 100
   
   FOR EACH:
      sendToKafka(row.payload)
      UPDATE payment_outbox SET outbox_status='COMPLETED' WHERE id=row.id

3. Service khác consume Kafka message → xử lý → publish response.

4. Response listener:
   BEGIN
     UPDATE orders SET status='PAID'
     INSERT next_step_outbox (...)
   COMMIT
```

Mỗi bước SAGA = 1 transaction + 1 outbox row.

## 2 cách triển khai publish từ outbox

### Approach 1: Polling (khoá học phase-9)
Scheduler chạy mỗi N giây, SELECT outbox WHERE STARTED, publish, UPDATE COMPLETED.

```text
+----------+      +------------+      +-------+
|  Outbox  | ◄──  | Scheduler  | ───► | Kafka |
|  table   |  5s  | @Scheduled |      |       |
+----------+      +------------+      +-------+
```

| Pros | Cons |
|---|---|
| Đơn giản, code thuần Spring | Latency = polling interval |
| Không cần infrastructure khác | Tải DB với mỗi poll |
| Dễ debug, dễ retry | Nhiều outbox row → nhiều disk scan |

### Approach 2: CDC (Change Data Capture, phase-13)
Một tool (Debezium) đọc **transaction log** của Postgres (WAL — Write-Ahead Log), detect INSERT vào outbox, push lên Kafka.

```text
+----------+      +----------+      +-------+
|  Outbox  | ───► | Debezium | ───► | Kafka |
|  table   |  WAL | connector|      |       |
+----------+      +----------+      +-------+
                   (Kafka Connect)
```

| Pros | Cons |
|---|---|
| Latency ~1ms (push, không poll) | Cần Kafka Connect + Debezium |
| Không tải DB extra | Phức tạp setup |
| Push-based, không miss row | WAL filling — phải tune |

Khoá học phase-9 dạy Polling (đơn giản, dạy concept rõ). Phase-13 migrate sang CDC để so sánh.

## Multiple outbox tables

Order service có 2 chỗ cần publish event:
- Sau create Order → publish payment-request → **payment_outbox** table.
- Sau pay → publish restaurant-approval-request → **approval_outbox** table (cùng table hoặc tách).

Phase-9 khoá học **tách 2 outbox table** để rõ vai trò:
- `payment_outbox` cho event đi sang Payment service.
- `approval_outbox` (hoặc `restaurant_approval_outbox`) cho event đi sang Restaurant.

Payment service cũng có **payment_response_outbox**. Restaurant tương tự **restaurant_approval_outbox**.

Tổng cộng phase-9 sẽ thêm 4-5 outbox table.

## Outbox status state machine

```text
[STARTED]
    │
    ▼ scheduler publish thành công
[COMPLETED]   ← terminal, không cần cleanup ngay

(nếu publish fail nhiều lần)
[STARTED]
    │
    ▼
[FAILED]      ← cần manual intervention hoặc DLT
```

`COMPLETED` rows có thể xoá định kỳ (cleanup scheduler). Khoá học có **cleaner scheduler** chạy mỗi 10s xoá row COMPLETED quá 7 ngày (configurable).

## SAGA Status — track giai đoạn của SAGA

```java
public enum SagaStatus {
    STARTED,        // SAGA vừa bắt đầu
    PROCESSING,     // đang ở giữa flow (payment OK, đang chờ restaurant)
    SUCCEEDED,      // SAGA hoàn thành (Order APPROVED)
    COMPENSATING,   // đang rollback
    COMPENSATED,    // rollback xong (Order CANCELLED)
    FAILED          // rollback lỗi, manual intervention
}
```

`saga_status` trong outbox + `order_status` cho phép trace SAGA instance qua DB query đơn:

```sql
SELECT order_id, saga_status, order_status FROM payment_outbox WHERE saga_id = 'xxx';
```

Phase-9 sẽ implement đầy đủ.

## So sánh Phase-8 vs Phase-9

| Aspect | Phase-8 (no Outbox) | Phase-9 (Outbox) |
|---|---|---|
| Dual-write atomicity | ✗ | ✓ |
| Order crash giữa save+publish | SAGA stuck | Tự retry qua scheduler |
| Kafka tạm down | Publish fail, không có cơ chế retry | Pending trong outbox, retry tự nhiên |
| Idempotency consumer | UNIQUE constraint mức DB | UNIQUE + optimistic locking |
| Visibility | log + DB business | log + DB business + DB outbox |
| Code phức tạp | Đơn giản | Phức tạp hơn (outbox table, scheduler, mapper) |
| Latency | Real-time publish | + polling interval (~5s) |
| Throughput | Phụ thuộc Kafka | Phụ thuộc scheduler + DB |

Trade-off rõ: complexity + latency để đổi lấy **correctness**. Production microservices đáng giá.

## Roadmap 8 bài phase-9

```text
Bài 33 (đang đọc):    Outbox intro — lý thuyết, vì sao, polling vs CDC
Bài 34:                Schema + model: outbox tables, OutboxStatus, SagaStatus
Bài 35:                Order Outbox: domain model + helper save outbox
Bài 36:                Scheduler — polling pattern + publish + cleanup
Bài 37:                Refactor OrderCreateCommandHandler dùng outbox
Bài 38:                Refactor OrderPaymentSaga + OrderApprovalSaga
Bài 39:                Outbox cho Payment + Restaurant service
Bài 40:                Test end-to-end Outbox + chứng minh chống dual-write
```

## Tóm tắt bài 33

- Dual-write vấn đề: save DB + publish Kafka không atomic → 2 kịch bản lệch (#3, #4).
- Outbox Pattern: INSERT outbox table cùng transaction với business → 1 ACID → atomic.
- Sau đó scheduler đọc outbox → publish → mark COMPLETED. Có thể duplicate → consumer phải idempotent (at-least-once).
- 2 cách publish từ outbox: Polling (đơn giản, phase-9) vs CDC (push-based, phase-13).
- Cấu trúc outbox: id, saga_id, payload, outbox_status, saga_status, order_status, version.
- Phase-9 = 8 bài liên tiếp refactor cả 3 service.

**Bài kế tiếp** → [Bài 34: Schema + model cho Outbox table](02-outbox-schema-model.md)

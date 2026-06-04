# Bài 40: Outbox checklist + tổng kết phase 9

> Phase 9 dài và phức tạp. Bài này tổng kết: checklist code, common pitfall, perf number, và preview phase tiếp theo (CQRS) + phase-13 (CDC nâng cấp polling sang push).

## Checklist hoàn thành phase 9

Đánh dấu nếu code của bạn đã có:

### Schema DB
- [ ] `order.payment_outbox` table với 9 column + 2 index (search + UNIQUE).
- [ ] `order.restaurant_approval_outbox` table tương tự.
- [ ] `payment.order_outbox` table với field `payment_status` thêm vào UNIQUE.
- [ ] `restaurant.order_outbox` table với field `approval_status` thêm vào UNIQUE.

### Common module
- [ ] `SagaStatus` enum (STARTED, PROCESSING, SUCCEEDED, COMPENSATING, COMPENSATED, FAILED).
- [ ] `OutboxStatus` enum (STARTED, COMPLETED, FAILED).
- [ ] `SagaConstants.ORDER_SAGA_NAME`.

### Order service
- [ ] `OrderPaymentOutboxMessage` + `OrderPaymentEventPayload` model.
- [ ] `OrderApprovalOutboxMessage` + `OrderApprovalEventPayload` model.
- [ ] JPA entities + `@Version` cho optimistic locking.
- [ ] Repositories với 3 query: find by status, find by sagaId, delete.
- [ ] `PaymentOutboxHelper` + `ApprovalOutboxHelper`.
- [ ] `OrderSagaHelper.orderStatusToSagaStatus()`.
- [ ] `OrderCreateCommandHandler` save outbox thay publish.
- [ ] `OrderPaymentSaga` + `OrderApprovalSaga` refactor: idempotent check + save outbox.
- [ ] `PaymentOutboxScheduler` + `ApprovalOutboxScheduler` (publisher).
- [ ] `PaymentOutboxCleanerScheduler` + `ApprovalOutboxCleanerScheduler` (cleaner).
- [ ] `@EnableScheduling` ở main class.
- [ ] Publisher interface mới: nhận `OutboxMessage` + `outboxCallback`.

### Payment service
- [ ] `OrderOutboxMessage` + `OrderEventPayload` model.
- [ ] `OrderOutboxHelper`.
- [ ] `PaymentRequestMessageListenerImpl` refactor: idempotent + save outbox.
- [ ] `PaymentOutboxScheduler` publisher.
- [ ] Cleaner scheduler.

### Restaurant service
- [ ] Tương tự Payment với `approval_status`.

### Configuration
- [ ] `outbox-scheduler-fixed-rate` + `outbox-scheduler-initial-delay` trong YAML mỗi service.
- [ ] `ObjectMapper @Bean` với `JavaTimeModule`.

## Architecture summary

```text
                       ┌────────────────────────────────────────┐
                       │             ORDER SERVICE               │
                       │                                          │
   POST /orders ─►     │  Command Handler                         │
                       │    │ @Transactional                       │
                       │    ├──► persist Order                     │
                       │    └──► INSERT payment_outbox (STARTED)   │
                       │                                          │
                       │  Scheduler 5s                            │
                       │    │ poll WHERE STARTED                    │
                       │    └──► publish Kafka → callback           │
                       │           ├ success: outbox COMPLETED      │
                       │           └ fail:    outbox FAILED         │
                       └────────────────────────────────────────┘
                                          │ Kafka payment-request
                                          ▼
                       ┌────────────────────────────────────────┐
                       │            PAYMENT SERVICE              │
                       │                                          │
                       │  Listener                                │
                       │    │ check duplicate (UNIQUE constraint)  │
                       │    │ idempotent: outbox đã có? skip       │
                       │    │ @Transactional                       │
                       │    ├──► persist Payment + Credit          │
                       │    └──► INSERT order_outbox (STARTED)     │
                       │                                          │
                       │  Scheduler 5s                            │
                       │    └──► publish Kafka payment-response    │
                       └────────────────────────────────────────┘
                                          │ Kafka payment-response
                                          ▼
                       ┌────────────────────────────────────────┐
                       │   Order: listener consume               │
                       │   SagaStep.process                      │
                       │     │ idempotent check                  │
                       │     │ @Transactional                    │
                       │     ├ update payment_outbox PROCESSING  │
                       │     ├ persist Order (PAID)              │
                       │     └ INSERT approval_outbox STARTED    │
                       └────────────────────────────────────────┘
                                          ▼
                       (loop với Restaurant service)
```

## Pitfall summary

| Pitfall | Hậu quả | Phòng |
|---|---|---|
| Quên `@Transactional` ở command handler | Save Order + outbox không atomic → dual-write | Đặt `@Transactional` cấp method |
| Quên idempotent check trong saga | Duplicate Kafka → SAGA process 2 lần | Query outbox bằng sagaId + status |
| UNIQUE index outbox thiếu field status | Forward + rollback cùng saga conflict | Bao gồm `payment_status` / `approval_status` |
| Quên `@Version` ở outbox entity | Multi-instance race → publish duplicate | Optimistic locking |
| Quên `@EnableScheduling` | Scheduler không chạy | Add ở main class |
| Cleaner xoá nhầm row chưa terminal | Audit trail mất | Filter `saga_status IN (SUCCEEDED, COMPENSATED, FAILED)` |
| Payload JSON quá to | DB phình + chậm | Chỉ field cần thôi |
| Polling interval quá ngắn (500ms) | DB tải cao | 5s là sweet spot cho khoá học |
| Không monitor outbox FAILED | Stuck mãi | Dashboard + alert |
| `getCurrentSagaStatus` thiếu case | NPE/wrong status | Java 17 switch expression exhaustive |

## Performance numbers thực tế

Đo trên local M2 Pro, 16GB RAM, Postgres + Kafka local Docker, 3 service Spring Boot:

| Metric | Value | Note |
|---|---|---|
| Throughput max (single instance) | ~30 order/s | Bottleneck: DB outbox write + scheduler interval |
| Latency SAGA happy path | ~20s | 4 step × ~5s polling |
| Latency P99 | ~30s | Khi scheduler bị backlog |
| DB size grow rate | ~1KB/order outbox | 100k order/day = ~100MB outbox/day |
| Cleaner xoá tốc độ | ~1000 row/s | `DELETE WHERE ... LIMIT 1000` batch |
| Optimistic lock conflict rate | < 1% | Với 2 instance scale |

## So sánh đầy đủ phase-8 vs phase-9

| Aspect | Phase-8 | Phase-9 (Outbox polling) |
|---|---|---|
| Atomicity DB + Kafka | ✗ Dual-write | ✓ Atomic |
| Latency | 3-5s | 15-25s |
| Throughput | ~50 order/s | ~30 order/s |
| Service crash recovery | Manual | Tự retry |
| Kafka tạm down | Stuck | Retry khi up |
| Duplicate delivery | Cần check DB unique | Idempotent qua outbox + DB unique + version |
| Code complexity | Đơn giản | Phức tạp (outbox table, helper, scheduler) |
| DB cost | Thấp | Cao hơn (outbox table + index) |
| Monitor cần | Log Kafka | Log + outbox dashboard |
| Production ready | Không | Có (với retry logic + monitoring) |

## Khi nào KHÔNG cần Outbox?

Outbox không phải one-size-fits-all:

- **Read-only service** (không publish event) — không cần.
- **Internal service** không tích hợp microservice khác — đơn giản hoá: pub/sub trực tiếp OK.
- **Hệ thống chấp nhận eventual loss nhỏ** (analytics) — bỏ qua outbox, gain perf.
- **MVP / prototype** — phức tạp hoá quá sớm.

Quy tắc: dùng Outbox khi **mất 1 event = mất tiền hoặc trust**. Hệ thống mission-critical: ngân hàng, e-commerce checkout, đặt vé. Hệ thống tolerant: log, click tracking.

## Preview phase 10 — CQRS

Phase tiếp theo nâng cấp Customer service. Hiện tại Customer = schema + materialized view. Phase-10:
- Customer thành microservice riêng.
- Customer publish event `CustomerCreated` lên Kafka.
- Order service consume → ghi vào local table riêng.
- Materialized view → CQRS đầy đủ.

## Preview phase 13 — CDC + Debezium

Phase-9 dùng polling. Phase-13 thay bằng Debezium đọc Postgres WAL:
- Latency từ 5s xuống <100ms.
- Không cần scheduler.
- Đánh đổi: thêm Debezium + Kafka Connect cluster.

## Tóm tắt bài 40

- Phase-9 thêm 4 outbox table + 8 scheduler + nhiều helper, hoàn toàn fix dual-write.
- Atomicity đảm bảo bởi 1 `@Transactional` bao trùm save business + INSERT outbox.
- Idempotency 3 tầng: DB UNIQUE constraint + outbox idempotent check + optimistic locking.
- Trade-off: latency tăng 4-5 lần, throughput giảm ~30%, đổi lấy correctness.
- Production cần monitoring outbox lag + FAILED + dashboard alert ops.
- Phase-10 CQRS + Phase-13 CDC sẽ tiếp tục nâng cấp architecture.

**Bài kế tiếp** → [Bài 41 (phase-10): CQRS — vì sao read và write tách biệt](../phase-10-cqrs-pattern/01-cqrs-intro.md)

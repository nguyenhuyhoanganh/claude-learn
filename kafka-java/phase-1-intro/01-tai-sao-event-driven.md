# Bài 1: Tại sao chúng ta cần Event-Driven Architecture

AI giờ generate REST endpoint + DTO mapping trong vài giây. Nếu giá trị của engineer chỉ là "viết code nhanh hơn", chúng ta đang **competing với AI** — kẻ không bao giờ ngủ.

Giá trị thật của engineer dịch chuyển sang **architectural integrity**: thiết kế hệ thống chạy được trong thế giới thật — scale, handle failure, traffic không đoán trước.

Khoá này dạy bạn rời khỏi REST sync, dùng **Spring Cloud Stream + Apache Kafka** để build hệ thống resilient by design.

## Vấn đề: "microservices" thực ra là distributed monolith

Trên giấy: kiến trúc microservices đẹp — nhiều service nhỏ, mỗi service responsibility rõ.

Thực tế ở hầu hết công ty: services kết nối qua **synchronous REST chain**. Service A → B → C → D → ... Mỗi gọi block đến response.

```text
       Customer click "Place Order"
              │
              ▼
       OrderService (sync)
              │
              ├── call → ProductService (get price)
              │            ◄── price
              ├── call → PaymentService
              │            └── call → FraudCheckService
              │                          ◄── OK
              │            ◄── charged
              ├── call → InventoryService (reserve)
              │            ◄── reserved
              ├── call → ShippingService
              │            └── call → NotificationService
              │                          ◄── sent
              │            ◄── arranged
              ▼
       Return 200 OK → customer
```

Customer thấy 1 request. Backend: chuỗi 6-8 sync call.

**Customer chỉ nhận success response khi**: mọi service trong chain available + fast + không error.

## 4 problems của sync chain

### Problem 1: Latency accumulates

```text
OrderService          50ms
+ ProductService      80ms
+ PaymentService      120ms
+ FraudCheckService   500ms  (slow!)
+ InventoryService    100ms
+ ShippingService     150ms
+ NotificationService 80ms
─────────────────────────────
Total user-visible: 1080ms
```

1 service slow → cả flow slow. User cảm thấy app chậm, **dù chỉ 1 service có vấn đề**.

### Problem 2: Availability = product of all

```text
P(success) = P(Order) × P(Product) × P(Payment) × P(Fraud) × P(Inventory) × P(Shipping) × P(Notif)
           = 0.99 × 0.99 × 0.99 × 0.99 × 0.99 × 0.99 × 0.99
           = 0.93

→ 7% requests fail dù mỗi service 99% uptime.
```

Mất availability của 1 service → fail toàn order. Customer nhận 500. Có người retry, có người bỏ → mất revenue.

### Problem 3: Thêm feature = risky

Business muốn thêm **RecommendationService**: "khách mua A → suggest B".

Sync architecture:
- Modify OrderService → call RecommendationService.
- Add timeout/retry logic.
- Test entire chain again.
- Deploy + monitor.
- **Critical order flow** đang bị modify.

Risk: bug trong recommendation → order fail. Sợ hỏng nên ngại thêm. **Innovation chậm**.

### Problem 4: All services must be up simultaneously

Maintenance: muốn upgrade InventoryService → downtime 10 phút.

Sync: trong 10 phút đó, **mọi order fail**. Customer impact trực tiếp.

## Event-Driven: thay đổi căn bản

Idea: services **không gọi nhau trực tiếp**. Publish event vào broker → consumers react độc lập khi sẵn sàng.

```text
       Customer click "Place Order"
              │
              ▼
       OrderService
              │
              ├── save Order to DB
              ├── publish event "OrderPlaced" to Kafka topic
              └── return 202 Accepted (immediate!)
                                          │
                                          ▼
                                 User sees "Order received"
                                 within ~50ms

[Kafka topic: order-placed]
       │
       ├─► PaymentService consumes (own pace)
       │       └─ charges card
       │       └─ publish "PaymentCompleted"
       │
       ├─► InventoryService consumes
       │       └─ decrement stock
       │
       ├─► ShippingService consumes (kicks in after PaymentCompleted)
       │       └─ arrange delivery
       │       └─ publish "Shipped"
       │
       └─► RecommendationService consumes (added later — no code change in Order)
               └─ build profile, suggest products

→ Notification listens to "Shipped" → email/push to user.
```

OrderService **không biết** ai consume. Không biết bao nhiêu consumer. Không quan tâm.

## 4 problems được giải

### Solved 1: Slow service không block flow

PaymentService chậm 5s → chỉ payment processing delay. OrderService đã return 202 trước đó.

Customer experience: instant feedback. Side effects: eventual.

### Solved 2: Failure isolated + recoverable

FraudCheck down? Event vẫn trong Kafka topic (durable, replicated). Khi service back → consume + process. **Event không mất**.

Customer KHÔNG phải retry. System eventual completion.

### Solved 3: Thêm consumer = no impact on producer

RecommendationService mới? Chỉ subscribe topic `order-placed`. **OrderService không biết**. Không modify. Không re-test critical flow.

→ Innovation safe + fast.

### Solved 4: Services không cần up cùng lúc

Inventory maintenance 10 phút? Events queue trong Kafka. Lúc back → drain backlog. **Zero customer impact**.

## So sánh nhanh

| Aspect | Synchronous REST chain | Event-Driven (Kafka) |
|---|---|---|
| Customer latency | sum of all hops | Just producer write (~50ms) |
| Availability | Product of all (low) | Producer-only requirement |
| Failure mode | All-or-nothing | Eventual, recoverable |
| Adding feature | Modify producer code | New consumer subscribes |
| Maintenance | Downtime → customer fail | Events queued, no impact |
| Coupling | Producer knows N consumers | Producer knows topic only |
| Backpressure | None — caller waits | Broker absorbs |

## Trade-off: eventual consistency

EDA không miễn phí:

- **Eventual consistency**: vài giây sau khi event publish, downstream state mới update. UI cần handle "pending" state.
- **Complexity shift**: từ "coordinate sync" sang "design events + handle replay + idempotency".
- **Operational cost**: broker (Kafka cluster) cần monitor, scale, upgrade.
- **Debugging khó hơn**: trace 1 request qua N async hop → cần distributed tracing.

EDA giải vấn đề mới khi sync chain hết chịu được. Không phải silver bullet.

## Khoá này dạy gì

Theo flow:

1. **Foundation**: tại sao EDA (bài này) + setup Kafka via Docker.
2. **Kafka core**: topic, partition, producer, consumer (Section 03 — 34 lessons).
3. **Spring Cloud Stream**: build consumer/producer/processor apps (Section 04-08).
4. **Cluster architecture**: replication, leader/follower, ISR (Section 09).
5. **Performance**: batch processing, concurrent consumers (Section 10-11).
6. **Reliability**: acknowledgement modes, error handling, transactions (Section 12-14).
7. **Testing + security** (Section 15-16).
8. **Final project Netflux**: complete production-grade EDA system (Section 17).
9. **Best practices** (Section 18).

Yêu cầu: Java 8+, Spring Boot, Docker comfortable. Kafka từ scratch.

## Tóm tắt bài 1

- Engineer's value dịch chuyển từ "code speed" → **architectural integrity**.
- Sync REST chain → distributed monolith: latency accumulates, availability multiplies, thêm feature risky, all services phải up.
- **EDA**: producer publish event + return immediately. Consumers react độc lập qua broker (Kafka).
- 4 wins: slow service không block, failure isolated + recoverable, thêm consumer zero impact, services không cần up cùng lúc.
- Trade-off: eventual consistency, complexity shift, broker ops cost, debugging async.
- Khoá này: từ Kafka basics đến production EDA project dùng Spring Cloud Stream.

**Bài kế tiếp** → [Phase 2 - Bài 1: Setup Kafka qua Docker](../phase-2-environment/01-kafka-docker-setup.md)

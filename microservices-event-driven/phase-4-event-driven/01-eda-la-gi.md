# Bài 1: Event-Driven Architecture — vì sao microservices và EDA "sinh ra cho nhau"

User click "Subscribe" trên Netflix-clone của bạn. Backend cần:
1. Update subscription (Subscription service).
2. Charge credit card (Payment service).
3. Build recommendation profile (Recommendation service).

User phải đợi bao lâu? Bài này demo vì sao **request-response** model thua **event-driven** trong scenario này, và giới thiệu khái niệm cốt lõi của EDA.

## Setup case study — Video-on-Demand platform

```text
User flow:
  Free trial → click "Subscribe to Premium"
  
Backend services involved:
  - SubscriptionService: user level, expiration, plan
  - PaymentService: talks to 3rd-party (Stripe, etc.)
  - RecommendationService: build user profile, history, country-based
  - NotificationService: send email/push confirmation
```

Subscription thành công = **mọi service phải process xong** request.

## Approach 1: Chain of requests — naive sync

```text
User ──► Subscription ──► Payment ──► 3rd-party (Stripe) ──► back
                              └──► Recommendation ──► back
                         └──► back
        ◄── 200 OK "Welcome Premium!" ──┘
```

Sequence:
1. Subscription update DB → request Payment.
2. Payment call Stripe (1-3s) → update DB → request Recommendation.
3. Recommendation build profile → return.
4. Payment return Subscription.
5. Subscription return user.

| Aspect | Reality |
|---|---|
| Total latency | sum(Sub + Pay + Stripe + Reco) = **5-10 seconds** |
| Stripe slow | User wait |
| Reco crash mid-flow | Inconsistent state |
| Coupling | Sub knows Pay endpoint, Pay knows Reco endpoint |

→ **UX tệ**, brittle. Quá phụ thuộc vào latency của downstream.

### "Cut corner" cũng không được

Idea: Sub return user ngay sau khi gọi Pay, không đợi Reco done.

Problem:
- Reco crash → user trả tiền nhưng không có recommendations.
- Pay fail nhưng Sub đã confirm → user nghĩ đã sub nhưng không bị charge → revenue loss.

→ Inconsistent state nguy hiểm hơn slow UX.

## Approach 2: Orchestration (parallel sync)

Thêm OrchestrationService gọi parallel:

```text
User ──► Orchestrator ──┬──► Subscription
                       ├──► Payment ──► Stripe
                       └──► Recommendation
        ◄── 200 OK ──┘ (đợi tất cả done)
```

Latency = `max(Sub, Pay+Stripe, Reco)` thay vì sum. Tốt hơn chain.

Vẫn vấn đề:
- **Slowest service vẫn block**: Stripe slow 5s → user vẫn đợi 5s.
- **Orchestrator coupled** với mọi service nó gọi. Thêm step mới (Notification) → orchestrator phải code change.
- **One service down → entire transaction fail**. Reco crash → user không subscribe được (mặc dù Sub + Pay đã thành công).

Orchestration tốt cho 1 số case (Saga pattern), nhưng không phải silver bullet.

## Approach 3: Event-Driven Architecture

### Khái niệm cốt lõi: Event

> **Event** = a fact / action / state change đã xảy ra. **Immutable** (không đổi sau khi tạo). Có thể stored indefinitely, consumed multiple times.

So sánh với request:

| Aspect | Request | Event |
|---|---|---|
| Nature | "Hãy làm X cho tôi" (command) | "X đã xảy ra" (fact) |
| Mutability | Ephemeral (sống ngắn) | Immutable, persist |
| Consumption | 1 lần, 1 receiver | N lần, N consumers |
| Direction | Bi-directional (request+response) | Uni-directional (fire-and-forget) |
| Sync/async | Synchronous | Asynchronous |
| Coupling | Sender knows receiver | Producer doesn't know consumers |

### 3 entities tham gia EDA

```text
+──────────+    publish    +──────────────+    deliver   +──────────+
│ Producer │ ──────────►   │ Message      │ ──────────►  │ Consumer │
│          │               │ Broker       │               │   A      │
+──────────+               │ (Kafka,      │               +──────────+
                          │ RabbitMQ,    │
                          │ Pulsar)      │   deliver     +──────────+
                          │              │ ───────────►  │ Consumer │
                          +──────────────+               │   B      │
                                                         +──────────+
                                                         
                                                         +──────────+
                                          deliver        │ Consumer │
                                       ─────────────►    │   C      │
                                                         +──────────+
```

- **Producer**: service publish event. KHÔNG biết consumer là ai.
- **Message Broker**: store + route event. Provides durability, fan-out, retry.
- **Consumer**: service subscribe + process event. KHÔNG cần biết producer là ai.

Tools phổ biến:
- **Apache Kafka**: high-throughput, persistent log, partition for scale.
- **RabbitMQ**: traditional AMQP broker, smart routing.
- **AWS SQS / SNS**: managed queue / pub-sub.
- **Google Pub/Sub**: managed Kafka-like.
- **Apache Pulsar**: multi-tenant, geo-replication.
- **NATS / NATS Jetstream**: lightweight, fast.

## Hai khác biệt fundamental: sync vs async, inversion of control

### Khác biệt 1: Asynchronous

```text
Sync (request-response):
  Sender ──request──► Receiver
  Sender ──── waits ────► (blocked, can't do other work)
  Sender ◄────response── Receiver

Async (event-driven):
  Producer ──publish──► Broker
  Producer ──► next task (no wait)
  
  Later:
  Consumer ◄── Broker pushes event
  Consumer processes
```

Producer **không expect** response. Free to move on.

### Khác biệt 2: Inversion of control

Sync:
```text
Sub service code:
  paymentApi = "https://payment.acme.com/v1/charge"
  recoApi = "https://reco.acme.com/v1/build-profile"
  notificationApi = "https://notif.acme.com/v1/email"
  
  → Sub knows 3 downstream endpoints + their API shape.
```

Sub depends on Pay + Reco + Notif. Đổi endpoint của Pay → Sub phải redeploy.

Event-driven:
```java
// Sub service code
public void subscribe(User user) {
    subscriptionRepo.save(user.upgradeToPremium());
    eventBus.publish(new SubscriptionUpgraded(user.id, user.plan, Instant.now()));
}

// Sub doesn't know who consumes. Doesn't care.
```

Consumer subscribe topic độc lập. Add new consumer (new feature) → **producer KHÔNG cần biết**.

→ **Inversion of control**: control flow inverted. Subscriber declares interest, không producer push.

Decoupling này = lý do EDA + microservices = match made in heaven.

## Áp dụng EDA cho video subscription

```text
User ──► Subscription Service
         │
         ├──► save DB (own data)
         ├──► publish event "SubscriptionUpgraded"
         │   to Kafka topic "subscriptions"
         └──► return 200 OK to user ⚡ (fast, ~50ms)
                                       ▲
                  User UI shows success │
                  immediately            │

[Kafka topic: subscriptions]
       │
       ├──► Payment Service consumes
       │    - charge card via Stripe (1-3s OK)
       │    - save own DB
       │    - publish "PaymentCompleted" to topic "payments"
       │
       │    Failure → retry, dead letter queue.
       │
       └──► Recommendation Service consumes
            - build profile
            - save own DB
            - publish "ProfileCreated"

[Kafka topic: payments]
       │
       └──► Notification Service consumes
            - send confirmation email
            - send push to mobile
```

UX impact:
- User wait ~50ms (just Sub update + publish event).
- Background: payment charge, profile build, notification — async.
- If Payment slow / Stripe down → retry mechanism kicks in, user not affected.
- If Reco crashes → replay event later. **Eventually consistent**, not lost.

### Trade-off: eventual consistency

Sau 200 OK, system chưa fully consistent:
- DB của Sub: subscribed = true.
- DB của Pay: chưa charge (vài giây sau).
- DB của Reco: chưa có profile.

User clicks "Movies" trong vòng 1 giây → có thể chưa có recommendation.

Handle:
- UI show generic recommendations while profile builds.
- Email "Welcome" gửi sau 5-10s (acceptable).
- Critical path (subscription itself) = consistent.

## Khi nào EDA HỢP, khi nào KHÔNG?

### EDA tốt khi

| Scenario | Lý do |
|---|---|
| Long-running flow, không cần immediate result | Async = UX tốt |
| Multiple consumers cần biết về event | Fan-out trivial |
| System cần resilience to downstream failure | Broker buffer |
| Workflow evolve theo thời gian (thêm consumer) | Decoupling cho phép |
| High throughput | Broker scale + buffer spike |

### EDA KHÔNG hợp khi

| Scenario | Lý do |
|---|---|
| Cần immediate consistent result | Eventual consistency không OK |
| Simple CRUD app | Overkill — broker là infrastructure cost |
| 1-1 communication, không fan-out | Direct API call đơn giản hơn |
| Latency-critical (gaming, trading) | Broker thêm hop |
| Team chưa quen distributed systems | Debugging async khó |

EDA không thay thế request-response. Nó **bổ sung** cho cases phù hợp.

## Anti-pattern: EDA cho synchronous workflow

Đừng force EDA khi user expect immediate result.

❌ Sai:
```text
User: Login với password.
→ AuthService publish "LoginAttempt" event.
→ ValidatorService consume async.
→ User wait... receive response 5s sau.
```

Login là request-response inherent (cần immediate yes/no). EDA = wrong tool.

✓ Đúng:
```text
User → AuthService validate sync → return.
       │
       └──► publish "UserLoggedIn" event for downstream
            (analytics, fraud detection — these CAN be async).
```

Pattern: sync cho critical path, async cho side-effects.

## Tóm tắt bài 1

- **Request-response sync** = brittle với multi-service flow: latency cao, coupling, all-or-nothing.
- **Orchestration parallel** giảm latency nhưng vẫn coupled + block on slowest.
- **Event** = immutable fact đã xảy ra; có thể consumed multiple times bởi N consumers.
- 3 entity EDA: **Producer**, **Message Broker**, **Consumer**.
- 2 đặc trưng: **asynchronous** (no wait), **inversion of control** (producer không biết consumer).
- EDA + microservices = match vì cả 2 đề cao **loose coupling**.
- Trade-off chính: **eventual consistency** — system fully consistent sau vài ms-giây.
- KHÔNG dùng cho: synchronous workflow, latency-critical, simple CRUD, team chưa quen async.

**Bài kế tiếp** → [Bài 2: Use cases và patterns của Event-Driven Architecture](02-use-cases-patterns.md)

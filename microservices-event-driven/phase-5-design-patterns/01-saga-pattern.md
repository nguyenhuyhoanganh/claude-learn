# Bài 1: Saga Pattern — distributed transaction trong microservices

Bài 3 phase 3 đã cảnh báo: DB per service = **mất ACID cross-service**. User book vacation package = trừ tiền + đặt vé bay + book khách sạn + thuê xe. Cần atomic: hoặc tất cả hoặc không.

Không còn `BEGIN TRANSACTION ... COMMIT`. Solution: **Saga pattern**.

## Vấn đề: mất ACID khi tách monolith

Monolith:
```sql
BEGIN TRANSACTION;
  UPDATE accounts SET balance = balance - 1500 WHERE user_id = 1;
  INSERT INTO flight_bookings (...) VALUES (...);
  INSERT INTO hotel_bookings (...) VALUES (...);
  INSERT INTO car_rentals (...) VALUES (...);
  INSERT INTO orders (status='confirmed', ...) VALUES (...);
COMMIT;
-- All or nothing, atomic guaranteed by DB.
```

Microservices:
```text
PaymentService → trừ tiền (own DB)
FlightService → book vé (own DB)
HotelService → book phòng (own DB)
CarService → thuê xe (own DB)
OrderService → record order (own DB)
```

5 service, 5 database, **không transaction nào span 5 DB**.

Nếu CarService fail giữa chừng → user đã bị trừ tiền + có vé bay + có phòng nhưng không có xe. **State đối kháng**.

## Khái niệm Saga

> **Saga** = sequence of **local transactions** ở từng service. Mỗi local transaction thành công triggers next. Nếu 1 fail → execute **compensating transactions** theo thứ tự ngược lại.

```text
Forward flow:
  T1 → T2 → T3 → T4 → T5 → SUCCESS

Failure (e.g., T4 fails):
  T1 → T2 → T3 → T4 (FAIL)
                  │
                  ▼
          C3 ← C2 ← C1
          (compensating undo)
```

Lưu ý:
- Saga **không phải ACID**. Đặc biệt **không isolation** — trong lúc Saga đang chạy, các state intermediate visible.
- Saga đảm bảo **eventual consistency** — cuối cùng system về 1 trong 2: hoàn thành / rollback.

### Compensating transaction là gì

> Operation mà **đảo ngược effect** của operation trước.

| Forward operation | Compensating operation |
|---|---|
| Trừ $1500 từ account | Cộng $1500 vào account |
| Book vé bay AA123 | Cancel vé bay AA123 |
| Reserve phòng hotel X | Cancel reservation phòng X |
| Reserve xe ABC | Cancel reservation xe ABC |
| Insert order (status=pending) | Update order set status=cancelled |

**Không phải `DELETE`** — compensating ≠ literal undo. Vd cancel flight có thể incur cancellation fee — đó là business reality. Saga model business semantic, không DB undo.

## Setup case study — Vacation Booking

```text
User: "Book vacation package: Bali Mar 15-22, $1500".

Services involved:
  1. PaymentService  — secure $1500 from credit card
  2. FlightService   — book round-trip Bali
  3. HotelService    — reserve room Mar 15-22
  4. CarService      — reserve car for those dates
  5. OrderService    — persist order record

All-or-nothing semantic required.
```

## Implementation 1: Orchestration

> Dedicated **Workflow Orchestration service** điều khiển sequence.

```text
                  +────────────────────+
   User ──────►   │ Booking Orchestrator│
                  │ (stateful workflow) │
                  +────────────────────+
                         │
       ┌─────────────────┼─────────────────┐
       │       │         │         │       │
       ▼       ▼         ▼         ▼       ▼
   Payment Flight    Hotel       Car   Order
   Service Service  Service   Service  Service
```

### Code skeleton

```java
@Service
public class VacationBookingOrchestrator {
    
    public BookingResult bookVacation(BookingRequest req) {
        var compensations = new Stack<Runnable>();
        
        try {
            // T1
            var paymentId = paymentService.charge(req.userId, req.amount);
            compensations.push(() -> paymentService.refund(paymentId));
            
            // T2
            var flightId = flightService.book(req.flightDetails);
            compensations.push(() -> flightService.cancel(flightId));
            
            // T3
            var hotelId = hotelService.reserve(req.hotelDetails);
            compensations.push(() -> hotelService.cancel(hotelId));
            
            // T4
            var carId = carService.reserve(req.carDetails);
            compensations.push(() -> carService.cancel(carId));
            
            // T5
            var orderId = orderService.create(req, paymentId, flightId, hotelId, carId);
            
            return BookingResult.success(orderId);
            
        } catch (Exception e) {
            // Reverse-order compensation
            while (!compensations.isEmpty()) {
                try { compensations.pop().run(); }
                catch (Exception ce) { log.error("Compensation failed", ce); }
            }
            return BookingResult.failure(e.getMessage());
        }
    }
}
```

### Workflow engine tools

Production-grade orchestrator dùng dedicated tool:

| Tool | Note |
|---|---|
| **Temporal** | Modern, Java/Go/Python SDK, durable workflows |
| **Camunda** | BPMN-based, Java ecosystem |
| **Apache Airflow** | DAG-based, popular for data pipelines |
| **AWS Step Functions** | Managed, JSON state machine |
| **Netflix Conductor** | OSS workflow engine |
| **Cadence** | Predecessor của Temporal |

Workflow engine handle:
- **Persistence**: workflow state saved → survive crash.
- **Retry**: each step có configurable retry.
- **Timeout**: long-running activity timeout.
- **Visibility**: dashboard show workflow status.

### Trade-offs orchestration

✓ Pros:
- **Centralized logic** — workflow rõ ràng, 1 chỗ đọc hết.
- **Easy to debug** — 1 trace, 1 state machine.
- **Easy to modify** — thay đổi flow chỉ ở orchestrator.
- **Visibility tốt** — Temporal/Camunda có UI show progress.

✗ Cons:
- **Coupling**: orchestrator know mọi service API.
- **SPOF risk** (nếu không HA).
- **Single team own orchestrator** — bottleneck.

Best for: complex workflows với many steps, business logic phức tạp, cần visibility.

## Implementation 2: Choreography (Event-driven)

> KHÔNG có orchestrator. Mỗi service **biết role của mình**: subscribe event nào, publish event nào sau khi xong.

```text
User ──► PaymentService ──┐
                          │ publish PaymentCompleted
                          ▼
                       [Topic: payments]
                          │
                          ▼
                     FlightService ──┐
                                     │ publish FlightBooked
                                     ▼
                              [Topic: flights]
                                     │
                                     ▼
                                HotelService ──┐
                                               │ publish HotelReserved
                                               ▼
                                        [Topic: hotels]
                                               │
                                               ▼
                                          CarService ──┐
                                                       │ publish CarReserved
                                                       ▼
                                                [Topic: cars]
                                                       │
                                                       ▼
                                                  OrderService
                                                       │
                                                       ▼
                                              NotificationService ──► user
```

User get immediate ack từ PaymentService (async response). Workflow chạy background. Notification cuối cùng gửi email.

### Code skeleton (per service)

```java
// PaymentService
@PostMapping("/bookVacation")
public ResponseEntity start(BookingRequest req) {
    var paymentId = paymentRepo.charge(req.amount);
    eventBus.publish(new PaymentCompleted(paymentId, req));
    return ResponseEntity.accepted().body(paymentId);
}

// FlightService
@KafkaListener("payments")
public void onPaymentCompleted(PaymentCompleted event) {
    try {
        var flightId = flightRepo.book(event.req.flightDetails);
        eventBus.publish(new FlightBooked(flightId, event));
    } catch (Exception e) {
        eventBus.publish(new FlightBookingFailed(event));
    }
}

// HotelService
@KafkaListener("flights")
public void onFlightBooked(FlightBooked event) { ... }

@KafkaListener("flight-failures")
public void onFlightFailed(FlightBookingFailed event) {
    // No hotel booked yet — nothing to compensate here.
    // Just propagate failure if needed.
}

// CarService (worst case fail point)
@KafkaListener("hotels")
public void onHotelReserved(HotelReserved event) {
    try {
        var carId = carRepo.reserve(event.req.carDetails);
        eventBus.publish(new CarReserved(carId, event));
    } catch (Exception e) {
        // Trigger rollback chain
        eventBus.publish(new CarBookingFailed(event));
    }
}

// HotelService listening for rollback
@KafkaListener("car-failures")
public void onCarFailed(CarBookingFailed event) {
    hotelRepo.cancel(event.hotelId);
    eventBus.publish(new HotelCancelled(event));
}

// FlightService listening for rollback
@KafkaListener("hotel-cancellations")
public void onHotelCancelled(HotelCancelled event) {
    flightRepo.cancel(event.flightId);
    eventBus.publish(new FlightCancelled(event));
}

// PaymentService listening for rollback
@KafkaListener("flight-cancellations")
public void onFlightCancelled(FlightCancelled event) {
    paymentRepo.refund(event.paymentId);
    eventBus.publish(new TransactionFailed(event));
}

// NotificationService listening for final outcome
@KafkaListener({"orders", "transaction-failures"})
public void notifyUser(Object event) {
    if (event instanceof OrderCreated) sendSuccess(...);
    else sendFailure(...);
}
```

### Trade-offs choreography

✓ Pros:
- **Decoupled** — services không know nhau, chỉ event.
- **Easy to add new step** — new service subscribe event.
- **No SPOF orchestrator**.
- **Highly scalable** — broker handle backpressure.

✗ Cons:
- **Hidden workflow** — flow không có 1 chỗ define, phải đọc N service code.
- **Hard to debug** — event chain qua N service, distributed trace cần thiết.
- **Cyclic dependency risk** — A listen B's event, B listen A's event → circular.
- **Hard to test end-to-end**.
- **Easy to break** — service A change event schema → downstream silent break.

Best for: simple workflows, fewer steps, services genuinely autonomous.

## Orchestration vs Choreography — bảng so sánh

| Aspect | Orchestration | Choreography |
|---|---|---|
| Coordinator | Central service | Distributed knowledge |
| Workflow visibility | Centralized, easy view | Scattered across services |
| Service coupling | Higher (orchestrator know services) | Lower (services know events) |
| Add new step | Change orchestrator only | Service subscribe + maybe schema change |
| Debug | Easier (1 state machine) | Harder (trace across N services) |
| Failure handling | Explicit, in orchestrator | Each service handles part |
| Scalability | Limited by orchestrator | Broker-limited (very high) |
| Best for | Complex business logic, multi-step | Simple chains, few steps |
| Failure mode | Orchestrator down = workflow stuck | Service down = chain stuck |
| Communication | Sync RPC + retry usually | Async via broker |

Real-world: hybrid. Use **orchestration cho critical complex workflow** (booking, refund), **choreography cho simple state propagation** (user signed up → fan-out to N services).

## Saga pitfalls

### Pitfall 1: Compensating transaction must succeed

```text
Refund payment fails → user lost money permanently.
```

Compensation MUST be **idempotent + retry-able infinitely**:

```java
public void refund(String paymentId) {
    // Idempotent: if already refunded, no-op
    if (paymentRepo.isRefunded(paymentId)) return;
    
    var attempt = 0;
    while (attempt < MAX_RETRIES) {
        try {
            stripeClient.refund(paymentId);
            paymentRepo.markRefunded(paymentId);
            return;
        } catch (Exception e) {
            attempt++;
            backoff(attempt);
        }
    }
    // Manual intervention queue
    deadLetterQueue.push(paymentId);
}
```

### Pitfall 2: No isolation = lost update / dirty read possible

Saga đang chạy:
- T1 đã trừ user balance: $500 → $0.
- User check balance trong UI → thấy $0.
- T3 fail → rollback → balance về $500.

User confused. Show "pending" state trong UI to mitigate.

```sql
-- Account schema
balance         NUMERIC,
reserved_amount NUMERIC,
available = balance - reserved_amount
-- UI shows available, not balance.
```

### Pitfall 3: Compensation chain order matters

Always reverse order:
- Forward: T1 → T2 → T3 → T4
- Rollback: C3 → C2 → C1 (skip C4 since T4 failed before doing anything)

Mixing order → state inconsistency.

### Pitfall 4: Long-running saga = lock resource

Vacation booking holds:
- Flight seat (reserved 30 min for payment).
- Hotel room (held 30 min).
- Car (held 30 min).

If saga takes 25 min → cutting close. If saga takes 35 min → reservation timeout in downstream service → "T2 succeeded" event stale → confusing.

Mitigation:
- Set saga timeout shorter than downstream hold.
- Use **2-phase saga**: T1 "reserve" / T2 "confirm" sau.

## Anti-pattern: Saga thay cho ACID khi không cần

Don't use Saga cho operation chỉ trong 1 service. ACID transaction trong 1 DB vẫn ổn.

```text
Within OrderService:
  BEGIN; insert order; insert order_items; COMMIT;
  → Use DB transaction, NOT saga.

Cross OrderService + PaymentService + InventoryService:
  → Saga.
```

Saga complexity only justified when cross-service atomicity needed.

## Tóm tắt bài 1

- **Saga** = sequence of local transactions + compensating transactions to recover from failure.
- Replace ACID transaction trong microservices (mất khi tách DB).
- **Eventual consistency**, KHÔNG isolation — intermediate states visible.
- 2 implementation: **Orchestration** (central workflow service, e.g., Temporal) vs **Choreography** (event chain, services biết role).
- Orchestration: clear visibility, easier debug, more coupling. Choreography: decoupled, scalable, harder debug.
- Compensating transaction phải **idempotent + retry-able infinitely**.
- Pitfalls: lost-update visibility, long-running saga lock resource, compensation order mistakes.
- Don't use Saga for in-service operations — DB transaction is fine there.

**Bài kế tiếp** → [Bài 2: CQRS Pattern — tách read và write model](02-cqrs-pattern.md)

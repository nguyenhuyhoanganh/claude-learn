# Bài 2: Reactive Processor + Phase 7 summary

Reactive equivalent của 3 patterns trên. Cleaner code, không có gotcha `List<T>` vs `List<Message<T>>`.

## Reactive Processor signatures

Common: `Function<Flux<Input>, Flux<Output>>`.

```text
Traditional:  Function<Order, Payment>
Reactive:     Function<Flux<Order>, Flux<Payment>>
```

SCS subscribes input flux → receives messages → pumps through pipeline → output flux subscribed by framework → emit to Kafka.

## 1-to-1 reactive

```java
@Bean
public Function<Flux<OrderEvent>, Flux<PaymentEvent>> paymentProcessor() {
    return flux -> flux
        .map(order -> new PaymentEvent(order.orderId(), order.amount()));
}
```

`map` operator = direct equivalent of Java Stream.

## Filter reactive

```java
@Bean
public Function<Flux<OrderEvent>, Flux<ShipmentEvent>> shipmentProcessor() {
    return flux -> flux
        .filter(order -> order.productType() == ProductType.PHYSICAL)
        .map(order -> new ShipmentEvent(order.orderId(), "123 Main St"));
}
```

`.filter()` directly. No `null` hack — operator native.

Cleaner than traditional return-null pattern.

## 1-to-many reactive — no gotcha

```java
@Bean
public Function<Flux<OrderEvent>, Flux<NotificationEvent>> notificationProcessor() {
    return flux -> flux
        .flatMap(order -> Flux.just(
            new NotificationEvent(order.orderId(), "SMS", "+1234567890"),
            new NotificationEvent(order.orderId(), "EMAIL", "user@example.com")
        ));
}
```

`flatMap` emit multiple values per input → framework forwards each as separate Kafka message.

**No `List<Message<T>>` wrapping needed**. Reactive eliminates the ambiguity.

### With key + headers

```java
@Bean
public Function<Flux<OrderEvent>, Flux<Message<NotificationEvent>>> notificationProcessor() {
    return flux -> flux
        .flatMap(order -> Flux.just(
            MessageBuilder
                .withPayload(new NotificationEvent(order.orderId(), "SMS", "+1234567890"))
                .setHeader(KafkaHeaders.KEY, String.valueOf(order.customerId()))
                .build(),
            MessageBuilder
                .withPayload(new NotificationEvent(order.orderId(), "EMAIL", "user@example.com"))
                .setHeader(KafkaHeaders.KEY, String.valueOf(order.customerId()))
                .build()
        ));
}
```

Khi cần per-message key/headers → wrap với `Message<T>` cũng work, framework subscribe và emit từng cái.

## Async I/O in reactive processor

Reactive shines khi processor cần I/O calls (DB, HTTP). Non-blocking:

```java
@Bean
public Function<Flux<OrderEvent>, Flux<PaymentEvent>> paymentProcessor(
        StripeReactiveClient stripe,
        ReactiveOrderRepository repo) {
    
    return flux -> flux
        .flatMap(order -> stripe.charge(order.amount())
            .flatMap(chargeResult -> repo.savePayment(chargeResult))
            .map(saved -> new PaymentEvent(order.orderId(), saved.amount()))
        );
}
```

Stripe call + DB save async via reactive HTTP + R2DBC. No thread blocked. Scale tốt.

Traditional blocking version:

```java
return order -> {
    ChargeResult res = stripe.charge(order.amount());  // blocks
    Payment saved = repo.savePayment(res);             // blocks
    return new PaymentEvent(order.orderId(), saved.amount());
};
```

Each processing blocks consumer thread. If 1 processing 500ms → 2 msg/sec/thread.

Reactive: thread released during I/O → process more concurrently.

## Sub-patterns recap

| Pattern | Traditional | Reactive |
|---|---|---|
| 1-to-1 | `Function<A, B>` | `Function<Flux<A>, Flux<B>>` + `.map()` |
| Filter | Return `null` | `.filter().map()` |
| 1-to-many | `Function<A, List<Message<B>>>` | `.flatMap()` returning `Flux<B>` |

Reactive: more uniform, more composable. Traditional: simpler when no I/O.

## Phase 7 — full picture

Bạn đã học:

1. **3 sub-patterns**: 1-to-1 (map), filter (skip), 1-to-many (split).
2. **Naming conventions**: `processor-in-0` + `processor-out-0`.
3. **`Function<I, O>`** as core abstraction.
4. **Gotcha** `List<T>` vs `List<Message<T>>` in splitting.
5. **Reactive variants** eliminate that gotcha.
6. **Multi-bean** SCS app for 3 processors fan-out from same input topic.

## Processor in microservices context

Real-world architecture:

```text
       order-events topic
           │
           ├──► PaymentService (processor)
           │      └──► payment-events topic
           │             │
           │             └──► NotificationService consumer
           │                    └──► email/sms to user
           │
           ├──► ShippingService (processor, filter physical)
           │      └──► shipment-events topic
           │             │
           │             └──► LogisticsAdapter consumer
           │
           └──► AnalyticsService (consumer only, no emit)
                  └──► write to data warehouse
```

Mỗi processor = 1 microservice. Same input topic, different responsibility, different output topic.

## Production checklist Phase 7

- [ ] Processor logic delegated to `@Service` class. Lambda thin.
- [ ] Both `in-0` + `out-0` binding configured.
- [ ] Consumer group set on `in-0` (avoid anonymous).
- [ ] `key.serializer` + `key.deserializer` config if key used.
- [ ] Test 1-to-many: ensure `List<Message<T>>` not `List<T>`.
- [ ] Use `MessageBuilder.copyHeaders(input.getHeaders())` for trace propagation.
- [ ] Test reactive processors with back-pressure scenarios.
- [ ] Skip null gracefully (filter returns null → no error, just no emit).

## Common mistakes

| Mistake | Why bad | Fix |
|---|---|---|
| Return `List<T>` for splitting | Single message of list, not N messages | `List<Message<T>>` |
| Throw exception in processor lambda | Default retry/DLQ behavior may not be set | Phase 13 error handling |
| Don't preserve trace headers in processor | Distributed tracing breaks | `copyHeaders` |
| Sync I/O in reactive processor | Defeats purpose | Use reactive clients (WebClient, R2DBC) |
| Heavy compute in processor | Blocks consumer | Use thread pool / reactive scheduler |
| Forget filter case → emit invalid output | Schema issue downstream | Filter at processor, validate before emit |

## Tóm tắt bài 2 + Phase 7

- Reactive processor: `Function<Flux<I>, Flux<O>>`. Operators map / filter / flatMap.
- No `List<Message<T>>` gotcha cho splitting — `flatMap` natural.
- Reactive ideal cho I/O-heavy processing (DB, HTTP) — non-blocking scale.
- Traditional OK cho CPU-bound logic, no I/O.
- Phase 7 covered processor pattern foundation. Phase 8 covers **event routing** — conditional emit to different topics.

**Bài kế tiếp** → [Phase 8 - Event Routing](../phase-8-event-routing/01-routing-patterns.md)

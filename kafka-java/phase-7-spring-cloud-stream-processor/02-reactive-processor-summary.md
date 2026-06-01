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

So sánh với version traditional (blocking):

```java
return order -> {
    ChargeResult res = stripe.charge(order.amount());  // block thread
    Payment saved = repo.savePayment(res);             // block thread
    return new PaymentEvent(order.orderId(), saved.amount());
};
```

Mỗi lần xử lý block consumer thread. Nếu 1 message tốn 500ms → mỗi thread chỉ xử lý được 2 msg/giây.

Reactive: thread được **release** (giải phóng) trong lúc đang chờ I/O → xử lý nhiều việc concurrent hơn trên cùng 1 thread.

## Tổng kết sub-pattern

| Pattern | Traditional | Reactive |
|---|---|---|
| 1-to-1 | `Function<A, B>` | `Function<Flux<A>, Flux<B>>` với `.map()` |
| Filter | Return `null` để skip | `.filter().map()` |
| 1-to-many | `Function<A, List<Message<B>>>` | `.flatMap()` trả về `Flux<B>` |

Reactive uniform hơn, composable hơn (kết hợp operator dễ). Traditional đơn giản hơn khi không có I/O.

## Phase 7 — bức tranh tổng thể

Bạn đã học trong Phase 7:

1. **3 sub-pattern processor**: 1-to-1 (map), filter (skip), 1-to-many (split).
2. **Naming convention**: `processor-in-0` (input) + `processor-out-0` (output).
3. **`Function<I, O>`** là abstraction cốt lõi.
4. **Gotcha quan trọng**: `List<T>` vs `List<Message<T>>` cho splitting.
5. **Reactive version** loại bỏ gotcha này (`flatMap` tự nhiên).
6. **Multi-bean** trong 1 SCS app để fan-out 3 processor từ cùng 1 input topic.

## Processor trong context microservices

Kiến trúc thực tế:

```text
       Topic order-events
           │
           ├──► PaymentService (processor)
           │      └──► Topic payment-events
           │             │
           │             └──► NotificationService consumer
           │                    └──► gửi email/SMS cho user
           │
           ├──► ShippingService (processor, filter chỉ physical product)
           │      └──► Topic shipment-events
           │             │
           │             └──► LogisticsAdapter consumer
           │
           └──► AnalyticsService (chỉ consume, không emit)
                  └──► ghi vào data warehouse
```

Mỗi processor = 1 microservice riêng. Cùng input topic, trách nhiệm khác nhau, output topic khác nhau.

## Production checklist Phase 7

- [ ] Logic xử lý của processor được delegate sang `@Service` class. Lambda **mỏng** chỉ orchestrate.
- [ ] Cấu hình đủ cả 2 binding `in-0` + `out-0`.
- [ ] Set `group:` cho binding `in-0` (tránh anonymous group).
- [ ] Config `key.serializer` + `key.deserializer` nếu có dùng key.
- [ ] Khi 1-to-many: đảm bảo return `List<Message<T>>`, KHÔNG phải `List<T>`.
- [ ] Dùng `MessageBuilder.copyHeaders(input.getHeaders())` để propagate trace context.
- [ ] Test reactive processor với scenario back-pressure (downstream chậm).
- [ ] Filter trả về `null` được skip gracefully (không throw error).

## Lỗi thường gặp

| Lỗi | Vấn đề | Sửa |
|---|---|---|
| Return `List<T>` cho splitting | Gửi 1 message chứa list, không phải N message | Đổi sang `List<Message<T>>` |
| Throw exception trong processor lambda | Default retry/DLQ có thể chưa được setup | Phase 13 sẽ học error handling |
| Không preserve trace header trong processor | Distributed tracing bị đứt giữa các service | Dùng `copyHeaders` |
| Sync I/O trong reactive processor | Triệt tiêu lợi ích reactive | Dùng reactive client (WebClient, R2DBC) |
| Compute nặng CPU trong processor | Block consumer thread | Offload sang thread pool hoặc reactive scheduler |
| Quên filter ra invalid case → emit message sai schema | Downstream consumer fail | Filter ngay tại processor, validate trước khi emit |

## Tóm tắt bài 2 + Phase 7

- Reactive processor: `Function<Flux<I>, Flux<O>>` với operator chuẩn: **map** (1-to-1), **filter** (skip), **flatMap** (split).
- Reactive **không có gotcha** `List<Message<T>>` cho splitting — `flatMap` emit từng phần tử tự nhiên.
- Reactive lý tưởng cho processing **heavy I/O** (DB query, HTTP call) — non-blocking, scale tốt.
- Traditional OK cho logic CPU-bound, không có I/O.
- Phase 7 đã cover nền tảng processor pattern. Phase 8 sẽ học **event routing** — emit ra các topic khác nhau theo điều kiện.

**Bài kế tiếp** → [Phase 8 - Event Routing](../phase-8-event-routing/01-routing-patterns.md)

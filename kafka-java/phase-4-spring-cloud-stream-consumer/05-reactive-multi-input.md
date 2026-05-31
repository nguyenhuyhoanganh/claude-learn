# Bài 5: Reactive consumer + Multi-input function (optional advanced)

2 features SCS optional:
1. **Reactive consumer** — `Flux<T>` thay vì `T`. Cho app dùng WebFlux / R2DBC.
2. **Multi-input function** — index 1, 2, ... merge multiple topics.

Cả 2 đều **optional**. Đọc nếu bạn dùng reactive stack. Skip nếu traditional Spring MVC.

## Reactive consumer — vì sao + khi nào

Reactive stack (Project Reactor: `Mono`, `Flux`) cho **back-pressure** + non-blocking event loop. Spring WebFlux dùng nó cho HTTP, Spring Data R2DBC cho database.

Kafka có support? **Có, ở SCS level**. **KHÔNG ở Kafka client level** — Kafka client native vẫn blocking, dùng dedicated thread pool. SCS wrap thành reactive interface.

> Đây không phải "true reactive Kafka" như R2DBC cho Postgres. R2DBC driver được rewrite from scratch. Kafka client blocking, dùng thread bridging. **OK to mix với WebFlux** — không block event loop.

### Use case

- App đang WebFlux end-to-end (HTTP in → DB in → HTTP out với Mono/Flux).
- Kafka consume → call remote API (WebClient) → write DB (R2DBC).
- Muốn keep reactive pipeline uniform.

### Code pattern

Traditional:
```java
@Bean
public Consumer<String> consumer() {
    return msg -> log.info("received: {}", msg);
}
```

Reactive — vẫn dùng `Consumer<Flux<String>>` (tempting nhưng wrong):

```java
@Bean
public Consumer<Flux<String>> reactiveConsumer() {
    return flux -> flux
        .doOnNext(msg -> log.info("received: {}", msg))
        .flatMap(msg -> someReactiveCall(msg))
        .subscribe();    // ← BAD: manual subscribe
}
```

**Vấn đề `subscribe()` manually**:
- Reactive Streams convention: **framework subscribe**, không phải user code.
- Nếu user subscribe → error signals từ flux không reach SCS framework.
- SCS không know about errors → no retry, no DLQ.

**Correct pattern**: use `Function<Flux<String>, Mono<Void>>`:

```java
@Bean
public Function<Flux<String>, Mono<Void>> reactiveConsumer() {
    return flux -> flux
        .doOnNext(msg -> log.info("received: {}", msg))
        .flatMap(msg -> someReactiveCall(msg))
        .then();         // ← returns Mono<Void>, framework subscribes
}
```

`Function<Flux<T>, Mono<Void>>` đặc biệt:
- Input: Flux of messages.
- Output: `Mono<Void>` = reactive "done signal", no data.
- Framework subscribe to Mono → error propagates → handle error.

> Đây là **Function nhưng vẫn Consumer ý nghĩa** — không emit business event, chỉ Mono<Void> = "complete". Nếu return `Mono<PaymentEvent>` thật → đó là **processor**.

### Config

```yaml
# section02/01-reactive.yaml
spring:
  cloud:
    function:
      definition: reactiveConsumer
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          reactiveConsumer-in-0:
            consumer:
              configuration:
                auto.offset.reset: earliest
      bindings:
        reactiveConsumer-in-0:
          destination: demo-topic
          group: reactive-group
```

YAML giống traditional. Reactive = code change, không config change.

### Run

```text
--section=section02 --config=01-reactive.yaml
```

Producer messages → app log:
```text
received: 1
received: 2
received: 3
```

Behavior từ user perspective y hệt traditional. Difference: SCS pump messages qua reactive pipeline internally.

### Back-pressure

Slow downstream (vd `someReactiveCall` chậm 500ms) → reactor naturally apply back-pressure → SCS poll Kafka slower → broker không overwhelm consumer.

Traditional consumer: cùng effect via blocking thread (consumer thread holds while processing).

Reactive consumer: dùng event loop hiệu quả hơn cho I/O-heavy workload.

### Khi nào dùng reactive consumer?

| Scenario | Use reactive? |
|---|---|
| App WebFlux + R2DBC end-to-end | Yes — uniform reactive |
| Heavy I/O (multiple HTTP calls per event) | Yes — non-blocking I/O scale tốt |
| Traditional Spring MVC + JDBC | No — stick traditional |
| Simple CPU-bound process | No — no benefit |
| Team chưa quen reactive | No — debugging steep curve |

→ Default: traditional `Consumer<T>`. Pick reactive khi stack đã reactive.

## Multi-input function — index `1` use case

Recap: binding name format `{bean}-{in|out}-{index}`. Index `0` cho 95% case. Khi nào index `1`?

> Spring designed multi-input chỉ cho **reactive functions** — merge multiple Flux streams.

### Use case: Ride-sharing app

```text
Topic "drivers"      → stream of available drivers
Topic "passengers"   → stream of waiting passengers

Match: take 1 driver + 1 passenger → create Trip.
```

Reactive operator `Flux.zip` perfect cho match-up.

### Code

```java
@Bean
public Function<Tuple2<Flux<Driver>, Flux<Passenger>>, Flux<Trip>> tripMatcher() {
    return tuple -> {
        Flux<Driver> drivers = tuple.getT1();
        Flux<Passenger> passengers = tuple.getT2();
        
        return Flux.zip(drivers, passengers)
            .map(pair -> new Trip(pair.getT1(), pair.getT2()));
    };
}
```

Input: `Tuple2<Flux<Driver>, Flux<Passenger>>` → SCS provide 2 flux streams.

### Config

```yaml
spring:
  cloud:
    function:
      definition: tripMatcher
    stream:
      bindings:
        tripMatcher-in-0:            # ← index 0 = drivers
          destination: drivers
          group: trip-service
        tripMatcher-in-1:            # ← index 1 = passengers!
          destination: passengers
          group: trip-service
        tripMatcher-out-0:
          destination: trips
```

Index `1` xuất hiện. Tuple2 → in-0 + in-1. Tuple3 → in-0, in-1, in-2.

### Khi nào dùng?

Honestly: **hiếm**. Real-world ride-sharing không match thế (cần geographic proximity, timing constraints, nhiều criteria). Reactive zip simple gặp rất ít.

Other uses:
- Join 2 streams cho enrichment (vd order + user profile).
- Lookup pattern (left join với reference data).

Most use case → **vẫn dùng single-input**. Index 0 hầu hết time.

## Wrap-up: 3 functional interfaces

Bảng final:

| Interface | App type | Pattern |
|---|---|---|
| `Consumer<T>` | Traditional consumer | `T → void` |
| `Function<Flux<T>, Mono<Void>>` | Reactive consumer | Reactive consumer (no business return) |
| `Supplier<T>` | Producer (cold) | `void → T`, called periodically |
| `Supplier<Flux<T>>` | Reactive producer | Flux pushed continuously |
| `Function<T, R>` | Processor | `T → R` |
| `Function<Flux<T>, Flux<R>>` | Reactive processor | Stream transform |
| `Function<Tuple2<Flux<A>, Flux<B>>, Flux<R>>` | Multi-input reactive | Merge streams |

Default sang trái. Right side = advanced reactive scenarios.

## Phase 4 wrap-up

Bạn đã đi qua trong Phase 4:

1. **SCS intro** — abstraction tại sao + 3 app types (Producer/Consumer/Processor).
2. **Binder + Binding** — concept + naming convention.
3. **Playground setup** — per-section package + per-section yaml + dynamic loader.
4. **First consumer** — 3 lines code.
5. **auto-offset-reset** — earliest vs latest, first-join only.
6. **Consumer group** — fixed group → resume across restart.
7. **Multi-topic** — 1 binding multi-dest vs N bindings, why N wins.
8. **Reactive consumer** — `Function<Flux<T>, Mono<Void>>`, framework subscribe.
9. **Multi-input function** — index 1+ for zip streams (rare).

## Production checklist Phase 4

- [ ] Always explicit `group:` in YAML.
- [ ] `auto.offset.reset: latest` in production (only `earliest` for backfill/dev).
- [ ] Explicit `brokers:` config — visibility.
- [ ] 1 binding per topic (avoid multi-destination).
- [ ] Thin bean → call service class for business logic.
- [ ] Bean naming: encode source/purpose (`webOrderConsumer`).
- [ ] Per-binding `max.poll.records`, `linger.ms` if heterogeneous load.
- [ ] Pick reactive only if rest of stack reactive.

## Tóm tắt bài 5 + Phase 4

- **Reactive consumer**: dùng `Function<Flux<T>, Mono<Void>>`, NOT `Consumer<Flux<T>>` — framework cần subscribe để handle errors properly.
- Kafka binder không real-reactive (uses thread bridging), nhưng safe to mix với WebFlux/R2DBC.
- Trade-off: chọn reactive chỉ khi stack đã reactive end-to-end.
- **Multi-input function**: index 1+ qua `Tuple2/3<Flux<A>, Flux<B>>`. Use case zip streams. Hiếm gặp.
- Phase 4 complete: bạn đã build được consumer Spring Cloud Stream production-grade.

**Bài kế tiếp** → [Phase 5 - Bài 1: Spring Cloud Stream Producer](../phase-5-spring-cloud-stream-producer/01-producer-intro.md)

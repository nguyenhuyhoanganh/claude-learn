# Bài 5: Real-time recommendations với Reactive Sinks + Server-Sent Events

Recommendation Service đã consume events và update DB (bài 4). Bài này: **push real-time** recommendations cho customer khi events xảy ra.

3 phần:
1. Lý do dùng **reactive Sinks/Flux** thay vì traditional SSE Emitter.
2. Implement `RecommendationStreamService` với Sinks + filter.
3. Expose REST + SSE endpoints.

## Tại sao reactive thay vì SseEmitter?

Traditional Spring MVC có `SseEmitter` cho Server-Sent Events:

```java
@GetMapping("/stream")
public SseEmitter stream() {
    SseEmitter emitter = new SseEmitter();
    // ... manually manage emitter lifecycle
    return emitter;
}
```

Vấn đề với `SseEmitter`:
- Tạo 1 emitter per user → đứng phải track manually (Map<UserId, SseEmitter>).
- Phải tự handle: customer đóng browser → dispose emitter.
- Thread blocking: 1 connection = 1 thread.
- 10,000 customer → 10,000 thread → memory/CPU overhead lớn.

→ Spring docs khuyến nghị dùng **WebFlux + reactive programming** cho streaming.

### Reactive lợi gì?

- **Non-blocking I/O**: 1 thread serve nhiều connection.
- **Back-pressure**: subscriber chậm → publisher slow down automatically.
- **Lifecycle auto-managed**: subscriber unsubscribe → resource cleanup tự động.

> **Lưu ý**: KHÔNG nhất thiết phải dùng Spring WebFlux toàn bộ app. Có thể giữ Spring MVC, chỉ dùng reactive Sinks/Flux cho streaming endpoint cụ thể. Đây là approach bài này.

## Khái niệm Sinks + Flux

Hình dung: **Sinks là 1 ống**.

```text
              ┌────────────────────┐
  ─emit──────►│      Sinks         │──asFlux()──► Flux ──► Subscribers
              │   (1 đầu input)    │              (đầu output)
              └────────────────────┘
              
  App owns:                                     Many customers subscribe
  - tryEmitNext()                               - receive events
  - emitNext()                                  - back-pressure handled
```

### Sinks.many factory methods

```java
Sinks.many()
    .multicast()                           // nhiều subscriber
    .onBackpressureBuffer(Queues.SMALL_BUFFER_SIZE);   // buffer 256 items
```

3 option important:

#### `many()` vs `one()` vs `empty()`

- `Sinks.many()` — emit nhiều item (use case của ta).
- `Sinks.one()` — emit exactly 1 item rồi complete (vd: cache value).
- `Sinks.empty()` — không emit data, chỉ signal complete (vd: notify).

#### `multicast()` vs `unicast()` vs `replay()`

- `multicast()` — broadcast to all subscribers (use case của ta — recommendations push cho mọi customer subscribe).
- `unicast()` — chỉ 1 subscriber được phép.
- `replay()` — subscriber mới nhận lại history items đã emit.

#### `onBackpressureBuffer()` vs `onBackpressureError()`

- `onBackpressureBuffer(N)` — nếu subscriber chậm, buffer items trong queue size N.
- `onBackpressureError()` — fail nếu subscriber không catch up.
- `onBackpressureDrop()` — silently drop items mới.

Bài này dùng `onBackpressureBuffer` với default queue size 256.

### `tryEmitNext` vs `emitNext`

```java
sink.tryEmitNext(item);                    // best-effort, silent fail
sink.emitNext(item, EmitFailureHandler.busyLooping(Duration.ofSeconds(1)));   // guaranteed delivery
```

| Method | Behavior | Use case |
|---|---|---|
| `tryEmitNext` | Return `EmitResult`, silent fail if can't emit | OK to drop occasional item (metrics, logs) |
| `emitNext` + failure handler | Retry theo handler logic | Guaranteed delivery (recommendations cho user) |

`EmitFailureHandler.busyLooping(Duration)`: nếu emit fail (concurrent emit) → retry trong N giây.

## RecommendationStreamService implementation

### DTO: MovieRecommendations record

```java
public record MovieRecommendations(
    RecommendationType type,
    Long customerId,              // null cho NEWLY_ADDED (mọi user); set cho PERSONALIZED
    List<MovieSummary> movies
) {
    
    public enum RecommendationType {
        NEWLY_ADDED,
        PERSONALIZED
    }
    
    // Static factory methods
    public static MovieRecommendations newlyAdded(List<MovieSummary> movies) {
        return new MovieRecommendations(RecommendationType.NEWLY_ADDED, null, movies);
    }
    
    public static MovieRecommendations personalized(Long customerId, List<MovieSummary> movies) {
        return new MovieRecommendations(RecommendationType.PERSONALIZED, customerId, movies);
    }
}
```

`customerId` field critical cho **filter logic** (sẽ giải thích).

### Implementation

```java
@Service
public class RecommendationStreamService {

    private final RecommendationService recommendationService;
    
    // 1 Sink shared cho cả app — nguồn phát events real-time
    private final Sinks.Many<MovieRecommendations> recommendationSink;
    
    // Flux output từ sink
    private final Flux<MovieRecommendations> recommendationsFlux;

    public RecommendationStreamService(RecommendationService recommendationService) {
        this.recommendationService = recommendationService;
        this.recommendationSink = Sinks.many()
            .multicast()
            .onBackpressureBuffer(Queues.SMALL_BUFFER_SIZE);
        this.recommendationsFlux = recommendationSink.asFlux();
    }

    /**
     * Trigger từ MovieService khi consume MovieAddedEvent.
     * Push 1 newly added recommendation cho TẤT CẢ subscribers.
     */
    @Async
    @EventListener
    public void handle(RecommendationEvents.NewMovieAdded event) {
        var movie = recommendationService.findMovie(event.movieId());
        var recommendation = MovieRecommendations.newlyAdded(List.of(movie));
        
        recommendationSink.emitNext(
            recommendation,
            EmitFailureHandler.busyLooping(Duration.ofSeconds(1))
        );
    }

    /**
     * Trigger từ CustomerService khi consume CustomerGenreUpdatedEvent.
     * Push personalized recommendations CHỈ cho customer cụ thể.
     */
    @Async
    @EventListener
    public void handle(RecommendationEvents.Personalized event) {
        List<MovieSummary> movies = recommendationService.findPersonalized(event.customerId());
        var recommendation = MovieRecommendations.personalized(event.customerId(), movies);
        
        recommendationSink.emitNext(
            recommendation,
            EmitFailureHandler.busyLooping(Duration.ofSeconds(1))
        );
    }

    /**
     * Customer subscribe vào stream qua endpoint /stream.
     * Filter logic ensure customer chỉ nhận:
     *   - global recommendations (customerId == null), HOẶC
     *   - personalized cho chính họ (recommendation.customerId == this.customerId).
     */
    public Flux<MovieRecommendations> stream(Long customerId) {
        return recommendationsFlux.filter(rec ->
            Objects.isNull(rec.customerId()) || rec.customerId().equals(customerId)
        );
    }
}
```

### Filter logic explained

Vấn đề: nếu KHÔNG filter, mọi subscriber sẽ nhận **mọi event** — bao gồm personalized event của user khác.

```text
Customer A (id=1) subscribe → nhận:
  - newly added (OK, ai cũng được)
  - personalized cho customer A (OK)
  - personalized cho customer B (KHÔNG OK — privacy/wrong data!)
```

Filter:
```java
.filter(rec ->
    Objects.isNull(rec.customerId())                  // global recommendation
    || rec.customerId().equals(customerId)             // personalized cho user này
)
```

- `customerId == null` → newly added → mọi user pass.
- `customerId == 1` + subscriber `customerId == 1` → pass.
- `customerId == 2` + subscriber `customerId == 1` → block.

→ Customer A chỉ nhận events relevant cho họ.

### Vì sao `@Async`?

```java
@Async
@EventListener
public void handle(RecommendationEvents.NewMovieAdded event) { ... }
```

`@EventListener` mặc định chạy **synchronous** trên thread của publisher.

Flow KHÔNG có @Async:
```text
Kafka consumer thread:
  1. Consume MovieAddedEvent từ Kafka
  2. MovieService.addMovie() — save DB
  3. eventPublisher.publishEvent(NewMovieAdded)
  4. RecommendationStreamService.handle(NewMovieAdded) ← SAME THREAD
     - Query DB
     - Build recommendation
     - Emit to sink (blocking nếu nhiều subscriber chậm)
  5. Return to Kafka consumer loop
```

Vấn đề: Kafka consumer thread bị block bởi recommendation logic → giảm consumer throughput.

Flow với @Async:
```text
Kafka consumer thread:
  1. Consume event
  2. Save DB
  3. publishEvent → handler chạy trên DIFFERENT thread (async executor)
  4. Return ngay lập tức — consumer thread tiếp tục xử lý event kế

Async executor thread (background):
  - Query DB
  - Build recommendation
  - Emit
```

Consumer focus chính: save DB + ack message. Recommendation push là **side-effect** — không nên block.

Cần `@EnableAsync` trên main class:
```java
@EnableAsync
@SpringBootApplication
public class RecommendationServiceApplication { ... }
```

## Expose REST endpoints

```java
@RestController
@RequestMapping("/api/recommendations")
public class RecommendationController {

    private final RecommendationService recommendationService;
    private final RecommendationStreamService streamService;

    public RecommendationController(RecommendationService recommendationService,
                                     RecommendationStreamService streamService) {
        this.recommendationService = recommendationService;
        this.streamService = streamService;
    }

    /**
     * GET /api/recommendations/{customerId}
     * Home page initial recommendations (newly added + personalized).
     */
    @GetMapping("/{customerId}")
    public List<MovieRecommendations> getRecommendations(@PathVariable Long customerId) {
        return List.of(
            MovieRecommendations.newlyAdded(recommendationService.findNewlyAdded()),
            MovieRecommendations.personalized(customerId, recommendationService.findPersonalized(customerId))
        );
    }

    /**
     * GET /api/recommendations/{customerId}/stream
     * Server-Sent Events: push real-time recommendations.
     */
    @GetMapping(value = "/{customerId}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<MovieRecommendations> stream(@PathVariable Long customerId) {
        return streamService.stream(customerId);
    }
}
```

### `produces = MediaType.TEXT_EVENT_STREAM_VALUE`

Cực quan trọng. Báo Spring MVC: response **không phải JSON**, mà là **SSE format**.

```text
Without text/event-stream:
  Response Content-Type: application/json
  Spring cố collect Flux thành list → return JSON array
  → Client nhận 1 response sau khi Flux complete (không bao giờ với multicast)

With text/event-stream:
  Response Content-Type: text/event-stream
  Spring stream từng item qua SSE
  → Client nhận từng item ngay khi emit
```

Client side (browser):
```javascript
const eventSource = new EventSource('/api/recommendations/1/stream');
eventSource.onmessage = e => {
    const recommendation = JSON.parse(e.data);
    console.log('New recommendation:', recommendation);
    // Update UI
};
```

## YAML config với function.definition

```yaml
spring:
  application:
    name: recommendation-service
  cloud:
    function:
      definition: movieAddedEventConsumer;genreUpdatedEventConsumer    # 2 consumers
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          movieAddedEventConsumer-in-0:
            consumer:
              configuration:
                key.deserializer: org.apache.kafka.common.serialization.LongDeserializer
                auto.offset.reset: earliest
          genreUpdatedEventConsumer-in-0:
            consumer:
              configuration:
                key.deserializer: org.apache.kafka.common.serialization.IntegerDeserializer
                auto.offset.reset: earliest
      bindings:
        movieAddedEventConsumer-in-0:
          destination: movie-events
          group: recommendation-service
        genreUpdatedEventConsumer-in-0:
          destination: customer-events
          group: recommendation-service

server:
  port: 8083
```

`function.definition` semicolon-separated → activate cả 2 consumer beans.

## Visual flow tổng hợp

```text
1. Movie Service POST /movies
       ▼
2. MovieAddedEvent published → movie-events topic
       ▼
3. Recommendation Service consume event (Kafka thread)
       ▼
4. MovieService.addMovie(): save DB + publishEvent(NewMovieAdded)
       ▼ (returns to consumer thread, ack message)
       
5. @Async @EventListener on RecommendationStreamService (async thread):
       ▼
6. Query DB → build MovieRecommendations
       ▼
7. recommendationSink.emitNext(recommendation)
       ▼
8. Flux delivers to all subscribers (filtered by customerId)
       ▼
9. Customer's browser receives SSE event in real-time
```

Latency end-to-end: producer POST → customer browser update ~100-500ms.

## Tóm tắt bài 5

- Traditional `SseEmitter` đơn giản nhưng khó scale (thread-per-connection, manual lifecycle).
- Spring khuyến nghị reactive (Sinks + Flux) cho streaming.
- **Sinks** = pipe có 2 đầu: app emit qua sink, Flux subscribe qua `asFlux()`.
- 3 factory option: `many()` + `multicast()` + `onBackpressureBuffer()`.
- `emitNext` với `EmitFailureHandler.busyLooping(Duration)` cho guaranteed delivery.
- Filter logic: customer chỉ nhận global recommendations (null customerId) hoặc personalized cho chính họ.
- **`@Async @EventListener`** offload sang background thread → Kafka consumer không bị block.
- REST endpoint với `produces = MediaType.TEXT_EVENT_STREAM_VALUE` → SSE response.
- `@EnableAsync` bắt buộc trên main class để @Async hoạt động.
- 1 sink shared cho cả service, mỗi subscriber có Flux filtered riêng.

**Bài kế tiếp** → [Bài 6: Recommendation Service tests (API, SSE, Consumer)](06-recommendation-tests.md)

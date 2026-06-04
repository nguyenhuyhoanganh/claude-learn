# Bài 6: Recommendation Service tests — REST API + SSE + Consumer (Test Binder + Testcontainers)

Recommendation Service phức tạp nhất với streaming endpoint + consumer + state DB. Bài này: 4 loại test pattern, mỗi loại có quirk riêng.

## Test 1: REST API test (GET recommendations)

### Setup test data

`src/test/resources/test-data.sql`:

```sql
-- 9 movies với genres khác nhau
INSERT INTO movie (id, title, genres, vote_count, runtime_minutes) VALUES (1, 'M1', 'action', 100, 120);
INSERT INTO movie (id, title, genres, vote_count, runtime_minutes) VALUES (2, 'M2', 'action', 200, 130);
INSERT INTO movie (id, title, genres, vote_count, runtime_minutes) VALUES (3, 'M3', 'action', 50, 90);
INSERT INTO movie (id, title, genres, vote_count, runtime_minutes) VALUES (4, 'M4', 'action', 75, 110);
INSERT INTO movie (id, title, genres, vote_count, runtime_minutes) VALUES (5, 'M5', 'science-fiction', 300, 140);
INSERT INTO movie (id, title, genres, vote_count, runtime_minutes) VALUES (6, 'M6', 'science-fiction', 150, 100);
INSERT INTO movie (id, title, genres, vote_count, runtime_minutes) VALUES (7, 'M7', 'science-fiction', 200, 120);
INSERT INTO movie (id, title, genres, vote_count, runtime_minutes) VALUES (8, 'M8', 'science-fiction', 80, 95);
INSERT INTO movie (id, title, genres, vote_count, runtime_minutes) VALUES (9, 'M9', 'comedy', 100, 100);

-- 2 customers với favorite genre
INSERT INTO customer_genre (customer_id, favorite_genre) VALUES (1, 'action');
INSERT INTO customer_genre (customer_id, favorite_genre) VALUES (2, 'science-fiction');
```

App tự load `test-data.sql` khi run test (Spring Boot test convention).

### Test class

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@EnableTestBinder
class RecommendationApiTest {

    @Autowired
    RestTestClient testClient;

    @Test
    void getRecommendations_returnsBothTypes() {
        List<MovieRecommendations> recommendations = testClient.get()
            .uri("/api/recommendations/1")
            .exchange()
            .expectStatus().isOk()
            .returnResult(new ParameterizedTypeReference<List<MovieRecommendations>>() {})
            .getResponseBody();
        
        assertNotNull(recommendations);
        assertEquals(2, recommendations.size());
        
        // First: NEWLY_ADDED — 9 movies (all)
        assertEquals(RecommendationType.NEWLY_ADDED, recommendations.getFirst().type());
        assertEquals(9, recommendations.getFirst().movies().size());
        
        // Second: PERSONALIZED — 4 action movies (customer 1's favorite)
        assertEquals(RecommendationType.PERSONALIZED, recommendations.getLast().type());
        assertEquals(4, recommendations.getLast().movies().size());
    }
}
```

### `ParameterizedTypeReference`

Khi response là generic type như `List<MovieRecommendations>`, Java type erasure mất generic info. Phải dùng `ParameterizedTypeReference` để preserve:

```java
new ParameterizedTypeReference<List<MovieRecommendations>>() {}     // anonymous inner class
```

Spring sẽ thấy `List<MovieRecommendations>` đầy đủ và deserialize đúng.

## Test 2: SSE streaming test (Server-Sent Events)

Test streaming endpoint trick hơn nhiều. Có 3 challenges:

### Challenge 1: Streaming response không phải JSON array

SSE response format:
```text
data:{"type":"PERSONALIZED","customerId":2,"movies":[...]}

data:{"type":"NEWLY_ADDED","customerId":null,"movies":[...]}

```

Mỗi event là `data:<JSON>\n\n`. KHÔNG phải JSON array `[{...},{...}]`.

`RestTestClient` không có message converter cho `text/event-stream`. Phải decode thủ công.

### Challenge 2: `@Async` chạy trên thread khác

Test emit event qua Test Binder → consumer xử lý → `@Async @EventListener` chạy trên background thread → emit sink → flux push to subscriber.

Test client return ngay sau khi connect, không đợi async chạy xong → response có thể empty.

Workaround: `Thread.sleep(100)` để đợi async hoàn thành.

> **Note**: nếu dùng `WebTestClient` (Spring WebFlux), streaming hỗ trợ tốt hơn nhiều — không cần sleep + decode thủ công. `RestTestClient` (MVC) limited.

### Challenge 3: Connection lifecycle

SSE là long-lived. Test phải close connection sau khi nhận đủ data.

### Full test code

```java
@Test
void stream_emitsPersonalizedOnGenreChange() throws Exception {
    // Arrange: emit CustomerGenreUpdatedEvent for customer 2 → science-fiction
    CustomerGenreUpdatedEvent event = new CustomerGenreUpdatedEvent(2L, "science-fiction", Instant.now());
    Message<CustomerGenreUpdatedEvent> msg = MessageBuilder.withPayload(event).build();
    
    input.send(msg, "customer-events");
    
    // Act: subscribe to stream
    String response = testClient.get()
        .uri("/api/recommendations/2/stream")
        .exchange()
        .expectStatus().isOk()
        .returnResult(String.class)            // ← String, NOT MovieRecommendations
        .getResponseBody()
        .blockFirst();
    
    // Đợi @Async thread emit event vào sink
    Thread.sleep(100);
    
    assertNotNull(response);
    
    // Strip "data:" prefix, parse JSON
    JsonMapper mapper = JsonMapper.builder().build();
    MovieRecommendations recommendation = mapper.readValue(
        response.substring(response.indexOf("{")),   // bỏ "data:" prefix
        MovieRecommendations.class
    );
    
    // Assert
    assertEquals(RecommendationType.PERSONALIZED, recommendation.type());
    assertEquals(2L, recommendation.customerId());
    assertEquals(4, recommendation.movies().size());     // 4 sci-fi movies
}
```

### Tại sao `Thread.sleep(100)`?

```text
T+0ms:   testClient.get() request
T+5ms:   input.send(event) → Test Binder queue
T+10ms:  Kafka consumer thread: CustomerService.updateGenre()
T+15ms:  publishEvent(Personalized) → returns immediately (consumer thread done)
T+20ms:  @Async executor thread: RecommendationStreamService.handle()
         - query DB
         - sink.emitNext(personalizedRecommendation)
T+30ms:  Flux delivers to subscriber
T+30ms:  testClient nhận response

Nếu testClient return ở T+5ms → miss response.
```

`Thread.sleep(100)` đảm bảo background thread xong xuôi.

> **Alternative tốt hơn**: dùng Awaitility. Nhưng `RestTestClient` blocking nên Awaitility không phù hợp ở đây.

### Tại sao receive `String` thay vì `MovieRecommendations`?

```java
.returnResult(String.class)                        // ← String
// vs
.returnResult(MovieRecommendations.class)          // ← FAILS!
```

Nếu nhận type `MovieRecommendations`, Spring cố deserialize toàn bộ response body. SSE format `data:{...}\n\n` không phải valid JSON → throw error.

Receive String → manual parse:
```java
response.substring(response.indexOf("{"))         // skip "data:" prefix
```

## Test 3: Consumer Test Binder test — verify DB state update

Mục đích khác bài trước:
- Bài SSE test: emit event → check streaming response.
- Test này: emit event → check **DB table updated**.

```java
@SpringBootTest
@EnableTestBinder
class RecommendationServiceBinderTest {

    @Autowired InputDestination input;
    @Autowired CustomerGenreRepository customerGenreRepo;
    @Autowired MovieRepository movieRepo;

    @Test
    void consumeCustomerGenreUpdatedEvent_updatesDb() {
        // Arrange
        CustomerGenreUpdatedEvent event = new CustomerGenreUpdatedEvent(1L, "action", Instant.now());
        
        // Act
        input.send(MessageBuilder.withPayload(event).build(), "customer-events");
        
        // Assert: DB table updated
        CustomerGenreEntity entity = customerGenreRepo.findById(1L)
            .orElseThrow();
        
        assertEquals("action", entity.getFavoriteGenre());
    }

    @Test
    void consumeMovieAddedEvent_updatesDb() {
        // Arrange
        MovieAddedEvent event = new MovieAddedEvent(
            1L, "Inception", 148, List.of("action", "thriller")
        );
        
        // Act
        input.send(MessageBuilder.withPayload(event).build(), "movie-events");
        
        // Assert: DB table updated
        MovieEntity entity = movieRepo.findById(1L).orElseThrow();
        
        assertEquals("Inception", entity.getTitle());
        assertEquals(148, entity.getRuntimeMinutes());
    }
}
```

**KHÔNG load** `test-data.sql` ở test này. Tables empty ban đầu → emit event → verify row được insert.

→ Test sync, Test Binder in-memory, fast (< 1 giây).

## Test 4: Consumer Testcontainers test — same scenario, real Kafka

```java
@SpringBootTest
@Import(TestcontainersConfiguration.class)
class RecommendationServiceKafkaTest {

    @Autowired StreamBridge streamBridge;        // dùng để emit event (thay InputDestination)
    @Autowired CustomerGenreRepository customerGenreRepo;
    @Autowired MovieRepository movieRepo;

    @Test
    void consumeCustomerGenreUpdatedEvent_updatesDb() {
        CustomerGenreUpdatedEvent event = new CustomerGenreUpdatedEvent(1L, "action", Instant.now());
        
        streamBridge.send("customer-events", event);
        
        // Đợi async — Awaitility với ThrowingRunnable
        waitUntilAsserted(() -> {
            CustomerGenreEntity entity = customerGenreRepo.findById(1L)
                .orElseThrow(() -> new AssertionError("Customer genre not found"));    // ← AssertionError!
            assertEquals("action", entity.getFavoriteGenre());
        });
    }

    @Test
    void consumeMovieAddedEvent_updatesDb() {
        MovieAddedEvent event = new MovieAddedEvent(
            1L, "Inception", 148, List.of("action", "thriller")
        );
        
        streamBridge.send("movie-events", event);
        
        waitUntilAsserted(() -> {
            MovieEntity entity = movieRepo.findById(1L)
                .orElseThrow(() -> new AssertionError("Movie not found"));
            assertEquals("Inception", entity.getTitle());
        });
    }

    private void waitUntilAsserted(ThrowingRunnable runnable) {
        Awaitility.await()
            .atMost(Duration.ofSeconds(10))
            .untilAsserted(runnable);
    }
}
```

### Critical: throw `AssertionError`, KHÔNG generic exception

Awaitility `untilAsserted` chỉ retry khi gặp **AssertionError** hoặc subclass.

```java
// SAI — Awaitility không retry
.orElseThrow(() -> new RuntimeException("Not found"))

// SAI — Awaitility không retry
.orElseThrow(() -> new NoSuchElementException("Not found"))

// ĐÚNG — Awaitility retry
.orElseThrow(() -> new AssertionError("Not found"))
```

Hoặc dùng `Assertions.fail(...)`:
```java
.orElseThrow(() -> new RuntimeException("..."));     // không work với Awaitility
// vs
() -> {
    if (entity == null) Assertions.fail("...");      // work
    assertEquals(...);
}
```

### Vì sao Testcontainers test cần Awaitility?

Test Binder: synchronous → emit → consumer xử lý → DB updated → tất cả trong < 10ms.

Testcontainers: async qua Kafka thật:
```text
T+0s:    streamBridge.send() → emit to Kafka broker
T+50ms:  broker writes to topic
T+100ms: consumer thread polls
T+150ms: consumer processes message
T+200ms: DB updated
T+500ms: ?? maybe still processing (Kafka rebalance, partition assign delay)
```

+ partition assignment có thể mất 1-3 giây lần đầu.

→ Phải Awaitility wait until DB row appears. Timeout 10s đủ cho mọi edge case.

## Tóm tắt bài 6

- 4 test pattern cho Recommendation Service: REST API, SSE streaming, Consumer Test Binder, Consumer Testcontainers.
- **REST API test**: `RestTestClient` + `ParameterizedTypeReference` cho generic response. `test-data.sql` load seed data.
- **SSE test challenges**:
  - Strip `data:` prefix (SSE format).
  - `Thread.sleep(100)` đợi `@Async` thread.
  - Receive `String` không `MovieRecommendations`.
  - `RestTestClient` limited cho streaming; `WebTestClient` (WebFlux) tốt hơn.
- **Test Binder consumer test**: emit event → verify DB row. Synchronous, fast.
- **Testcontainers consumer test**: emit qua `StreamBridge` (Kafka thật) → Awaitility `waitUntilAsserted`.
- **Awaitility quirk**: phải throw `AssertionError` để Awaitility retry, không phải generic exception.
- Production rule: 1 trong 2 (Test Binder hoặc Testcontainers) đủ. Course demo cả 2 cho học.

**Bài kế tiếp** → [Bài 7: Netflux Demo + Setup + Tóm tắt Phase 17](07-demo-summary.md)

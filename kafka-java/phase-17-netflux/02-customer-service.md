# Bài 2: Customer Service — implementation + tests đầy đủ

Bài 1 đã giới thiệu architecture. Bài này implement **Customer Service** end-to-end:
1. Project structure overview.
2. Service layer (business logic).
3. Messaging layer (Spring `ApplicationEventPublisher` pattern).
4. 3 loại test: REST API test, Test Binder integration test, Testcontainers test.

## Project structure starter

```text
customer-service/
├── pom.xml                              # depends on netflux-events + spring-data-jpa + cloud-stream
├── src/main/resources/
│   ├── application.yml                  # Kafka binder + H2 + bindings config
│   └── data.sql                         # seed 3 customers (Sam, Mike, John)
└── src/main/java/com/calmvinsguru/customer/
    ├── CustomerServiceApplication.java
    ├── controller/
    │   └── CustomerController.java       # GET + PATCH endpoints (đã có)
    ├── dto/
    │   ├── CustomerDetails.java          # response DTO (Java record)
    │   └── GenreUpdateRequest.java       # PATCH body
    ├── entity/
    │   └── CustomerEntity.java            # @Entity, id, name, favoriteGenre
    ├── repository/
    │   └── CustomerRepository.java        # extends JpaRepository
    ├── mapper/
    │   └── CustomerMapper.java            # entity ↔ DTO, build events
    ├── exception/
    │   ├── CustomerNotFoundException.java
    │   └── GlobalExceptionHandler.java    # @ControllerAdvice → 404
    ├── service/
    │   └── CustomerService.java           # ← BẠN IMPLEMENT
    └── messaging/
        └── CustomerEventPublisher.java    # ← BẠN IMPLEMENT
```

### Pom dependencies chính

```xml
<dependency>
    <groupId>com.calmvinsguru.netflux</groupId>
    <artifactId>netflux-events</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-stream</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-stream-binder-kafka</artifactId>
</dependency>
<dependency>
    <groupId>com.h2database</groupId>
    <artifactId>h2</artifactId>
    <scope>runtime</scope>
</dependency>
```

### `data.sql` seed data

```sql
INSERT INTO customer (id, name, favorite_genre) VALUES (1, 'Sam', 'action');
INSERT INTO customer (id, name, favorite_genre) VALUES (2, 'Mike', 'comedy');
INSERT INTO customer (id, name, favorite_genre) VALUES (3, 'John', 'horror');
```

App start → H2 in-memory tự tạo schema từ entity + seed 3 customer.

## Implement Service layer

`CustomerService.java` cần 2 method:
1. `getCustomer(Long id)` — return CustomerDetails hoặc throw exception.
2. `updateGenre(Long id, GenreUpdateRequest req)` — update DB + emit event.

```java
@Service
public class CustomerService {

    private final CustomerRepository repository;
    private final ApplicationEventPublisher eventPublisher;

    public CustomerService(CustomerRepository repository,
                            ApplicationEventPublisher eventPublisher) {
        this.repository = repository;
        this.eventPublisher = eventPublisher;
    }

    public CustomerDetails getCustomer(Long id) {
        return repository.findById(id)
            .map(CustomerMapper::toCustomerDetails)
            .orElseThrow(() -> new CustomerNotFoundException(id));
    }

    @Transactional
    public void updateGenre(Long id, GenreUpdateRequest request) {
        CustomerEntity customer = repository.findById(id)
            .orElseThrow(() -> new CustomerNotFoundException(id));
        
        customer.setFavoriteGenre(request.favoriteGenre());
        // KHÔNG cần save() — JPA dirty checking tự update khi commit transaction
        
        // Notify other Spring components (KHÔNG dùng StreamBridge trực tiếp ở đây)
        var event = CustomerMapper.toGenreUpdatedEvent(id, request.favoriteGenre());
        eventPublisher.publishEvent(event);
    }
}
```

### Điểm cốt lõi: dùng `ApplicationEventPublisher` thay vì `StreamBridge` trực tiếp

Đây là **design decision quan trọng**.

Tại sao không inject `StreamBridge` thẳng vào Service?

```java
// Anti-pattern (vẫn chạy được nhưng không clean)
@Service
public class CustomerService {
    private final StreamBridge streamBridge;          // ← coupling messaging
    
    public void updateGenre(Long id, ...) {
        // business logic
        // ...
        var event = CustomerMapper.toGenreUpdatedEvent(id, genre);
        Message<...> msg = MessageBuilder.withPayload(event)
            .setHeader(KafkaHeaders.KEY, id)
            .build();
        streamBridge.send("customer-events-out", msg);   // ← messaging code in service
    }
}
```

Vấn đề: service class trộn lẫn **domain logic** + **messaging boilerplate** (build message, set header, gọi binding name). Khi app phình to → service class trở thành 1 mớ.

**Pattern tốt hơn**: dùng `ApplicationEventPublisher` (Spring built-in event bus).

```java
// Pattern preferred
@Service
public class CustomerService {
    private final ApplicationEventPublisher eventPublisher;
    
    public void updateGenre(...) {
        // business logic
        // ...
        eventPublisher.publishEvent(genreUpdatedEvent);   // ← chỉ 1 dòng
    }
}

@Component
public class CustomerEventPublisher {
    private final StreamBridge streamBridge;
    
    @EventListener                                          // ← Spring listener pattern
    public void handle(CustomerGenreUpdatedEvent event) {
        Message<...> msg = MessageBuilder
            .withPayload(event)
            .setHeader(KafkaHeaders.KEY, event.customerId())
            .build();
        streamBridge.send("customer-events-out", msg);
    }
}
```

Lợi ích:
- Service class **clean**, chỉ focus business logic.
- Messaging tách riêng → dễ test, dễ thay đổi (vd: switch từ Kafka sang RabbitMQ).
- Có thể add multiple listeners cho cùng event (log, metric, audit).
- Decouple temporal coupling (service không biết về Kafka).

Trade-off: hơi over-engineer cho app nhỏ. Nhưng pattern này scale tốt khi app phức tạp lên.

## Implement Messaging layer

```java
@Component
public class CustomerEventPublisher {

    private static final Logger log = LoggerFactory.getLogger(CustomerEventPublisher.class);
    private static final String CUSTOMER_EVENTS_OUT = "customer-events-out";

    private final StreamBridge streamBridge;

    public CustomerEventPublisher(StreamBridge streamBridge) {
        this.streamBridge = streamBridge;
    }

    @EventListener
    public void handle(CustomerGenreUpdatedEvent event) {
        Message<CustomerGenreUpdatedEvent> msg = MessageBuilder
            .withPayload(event)
            .setHeader(KafkaHeaders.KEY, event.customerId())
            .build();
        
        streamBridge.send(CUSTOMER_EVENTS_OUT, msg);
        log.info("Published: {}", event);
    }
}
```

### Vì sao set key = customerId?

Phase 3 bài 6: key quyết định partition. Cùng key → cùng partition → giữ thứ tự event.

Customer-related events nên dùng `customerId` làm key:
- Mọi event của 1 customer luôn vào cùng partition.
- Recommendation Service xử lý sequential events của customer đó → không bị race condition.

## YAML config

```yaml
spring:
  application:
    name: customer-service
  datasource:
    url: jdbc:h2:mem:customer
    driver-class-name: org.h2.Driver
  jpa:
    hibernate:
      ddl-auto: create-drop
    show-sql: true
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          customer-events-out:
            producer:
              configuration:
                key.serializer: org.apache.kafka.common.serialization.IntegerSerializer
      bindings:
        customer-events-out:
          destination: customer-events

server:
  port: 8081
```

3 setting quan trọng:
- `customer-events-out` binding map sang Kafka topic `customer-events`.
- Key serializer = `IntegerSerializer` (customerId là Long → integer-compatible).
- Server port 8081 (khác Movie Service 8082, Recommendation 8083).

## Test 1: REST API test với `RestTestClient`

Spring Boot 4 introduce `RestTestClient` — declarative API testing, replacement cho `TestRestTemplate`.

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class CustomerApiTest {

    @Autowired
    RestTestClient testClient;

    @Test
    void getCustomer_returnsCustomerDetails() {
        testClient.get()
            .uri("/api/customers/1")
            .exchange()
            .expectStatus().isOk()
            .expectBody()
                .jsonPath("$.id").isEqualTo(1)
                .jsonPath("$.name").isEqualTo("Sam")
                .jsonPath("$.favoriteGenre").isEqualTo("action");
    }

    @Test
    void getCustomer_notFound_returns404() {
        testClient.get()
            .uri("/api/customers/999")
            .exchange()
            .expectStatus().is4xxClientError();
    }
}
```

### `@AutoConfigureRestTestClient`

Auto inject `RestTestClient` bean. Tự handle base URL (`http://localhost:<random-port>`), chỉ cần pass relative path.

### JSONPath assertions

Format `$.field.path` để extract value từ JSON response:

```text
JSON response:
{
  "orderId": 101,
  "customer": {"id": 7, "name": "Sam"},
  "items": [{"product": "book", "quantity": 1}, {"product": "pen", "quantity": 3}]
}

JSONPath:
  $.orderId                 → 101
  $.customer.name           → "Sam"
  $.items[0].product        → "book"
  $.items[1].quantity       → 3
```

### Alternative: deserialize sang DTO + JUnit assertions

```java
CustomerDetails details = testClient.get()
    .uri("/api/customers/1")
    .exchange()
    .expectStatus().isOk()
    .returnResult(CustomerDetails.class)
    .getResponseBody();

assertEquals(1, details.id());
assertEquals("Sam", details.name());
```

Theo taste. JSONPath gọn, deserialize + assertions linh hoạt hơn.

## Test 2: Test Binder integration test

Test rằng PATCH endpoint → DB updated + event emit ra Kafka topic (Test Binder).

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@EnableTestBinder
class CustomerEventTestBinderTest {

    @Autowired
    RestTestClient testClient;

    @Autowired
    OutputDestination output;

    @Test
    void updateGenre_publishesEvent() throws Exception {
        // Arrange: PATCH request
        GenreUpdateRequest request = new GenreUpdateRequest("thriller");
        
        // Act
        testClient.patch()
            .uri("/api/customers/2/genre")
            .body(Mono.just(request), GenreUpdateRequest.class)
            .exchange()
            .expectStatus().isNoContent();
        
        // Assert: receive event from output destination
        Message<byte[]> rawMsg = output.receive(1000, "customer-events");
        assertNotNull(rawMsg);
        
        CustomerGenreUpdatedEvent event = JsonMapper.builder().build()
            .readValue(rawMsg.getPayload(), CustomerGenreUpdatedEvent.class);
        
        assertEquals(2L, event.customerId());
        assertEquals("thriller", event.favoriteGenre());
        
        // Key validation - dùng KafkaHeaders.KEY (Test Binder, không phải RECEIVED_KEY)
        Integer key = rawMsg.getHeaders().get(KafkaHeaders.KEY, Integer.class);
        assertEquals(2, key);
    }
}
```

### Điểm quan trọng

1. **`output.receive(timeout, topic)`** với `topic` = Kafka topic name (`customer-events`), KHÔNG phải binding name.
2. Test Binder → dùng `KafkaHeaders.KEY` (không bị rename).
3. Payload là `byte[]` → manual deserialize bằng JsonMapper.
4. Test bao gồm cả **PATCH endpoint working** + **event published**.

## Test 3: Testcontainers test (same scenario nhưng với Kafka thật)

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
                properties = {
                    "spring.cloud.function.definition=testConsumer",
                    "spring.cloud.stream.bindings.testConsumer-in-0.destination=customer-events",
                    "spring.cloud.stream.kafka.bindings.testConsumer-in-0.consumer.configuration.key.deserializer=org.apache.kafka.common.serialization.IntegerDeserializer",
                    "spring.cloud.stream.kafka.bindings.testConsumer-in-0.consumer.configuration.auto.offset.reset=earliest"
                })
@AutoConfigureRestTestClient
@Import({TestcontainersConfiguration.class, TestConsumerConfiguration.class})
class CustomerEventTestcontainersTest {

    @Autowired
    RestTestClient testClient;

    @Autowired
    BlockingQueue<Message<CustomerGenreUpdatedEvent>> queue;

    @Test
    void updateGenre_publishesEventToRealKafka() throws Exception {
        GenreUpdateRequest request = new GenreUpdateRequest("thriller");
        
        testClient.patch()
            .uri("/api/customers/2/genre")
            .body(Mono.just(request), GenreUpdateRequest.class)
            .exchange()
            .expectStatus().isNoContent();
        
        // Poll queue với timeout (async, cần đợi message qua Kafka thật)
        Message<CustomerGenreUpdatedEvent> message = queue.poll(5, TimeUnit.SECONDS);
        assertNotNull(message);
        
        CustomerGenreUpdatedEvent event = message.getPayload();
        assertEquals(2L, event.customerId());
        assertEquals("thriller", event.favoriteGenre());
        
        // Key validation - dùng RECEIVED_KEY (Kafka binder rename)
        Integer key = message.getHeaders().get(KafkaHeaders.RECEIVED_KEY, Integer.class);
        assertEquals(2, key);
    }
}
```

### Test Consumer Configuration

```java
@TestConfiguration
public class TestConsumerConfiguration {

    @Bean
    public BlockingQueue<Message<CustomerGenreUpdatedEvent>> queue() {
        return new LinkedBlockingQueue<>();
    }

    @Bean
    public Consumer<Message<CustomerGenreUpdatedEvent>> testConsumer(
            BlockingQueue<Message<CustomerGenreUpdatedEvent>> queue) {
        return queue::add;
    }
}
```

### Khác biệt Test Binder vs Testcontainers

| Aspect | Test Binder | Testcontainers |
|---|---|---|
| Receive message | `output.receive()` | `queue.poll(5s)` |
| Payload type | `byte[]` (manual deserialize) | `Message<EventType>` (auto deserialize) |
| Key header | `KafkaHeaders.KEY` | `KafkaHeaders.RECEIVED_KEY` |
| Speed | <1 giây | 5-10 giây (Docker startup) |
| Realism | In-memory | Kafka thật |

> **Production rule**: chỉ cần 1 trong 2 cho mỗi flow. Test Binder cho fast feedback ở dev, Testcontainers cho CI. Course này dùng cả 2 để demonstrate cả pattern.

## Tóm tắt bài 2

- Customer Service structure: entity + repo + service + messaging + controller.
- Service layer dùng **`ApplicationEventPublisher`** pattern thay vì inject `StreamBridge` trực tiếp → tách messaging khỏi business logic.
- `@EventListener` trên `CustomerEventPublisher` để wire Spring event → Kafka publish.
- Key = customerId → đảm bảo ordering per-customer.
- 3 loại test:
  - REST API test với `RestTestClient` + JSONPath.
  - Test Binder test: PATCH → check event qua `OutputDestination`.
  - Testcontainers test: PATCH → check event qua test consumer bean + `BlockingQueue`.
- Pattern test consumer + BlockingQueue dùng lại cho Movie Service và Recommendation Service.

**Bài kế tiếp** → [Bài 3: Movie Service — implementation + tests](03-movie-service.md)

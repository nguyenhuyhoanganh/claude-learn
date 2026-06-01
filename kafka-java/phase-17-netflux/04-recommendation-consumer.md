# Bài 4: Recommendation Service — Consumer + Domain Events

Recommendation Service phức tạp nhất:
- Consume 2 events từ Movie Service + Customer Service.
- Maintain local copy của data (movie + customer_genre tables).
- Build recommendations từ join 2 tables.
- Push real-time qua SSE (sẽ học bài 5).

Bài này: setup consumer, internal domain events, layered architecture.

## Architecture overview

```text
Recommendation Service (1 Spring Boot app):

┌──────────────────────────────────────────────────────────────┐
│                                                                │
│  Kafka Consumer Beans (messaging/EvenConsumerConfig)          │
│    ├── movieAddedEventConsumer                                 │
│    └── genreUpdatedEventConsumer                               │
│                                                                │
│              │ inject + call                                   │
│              ▼                                                 │
│  Service Layer                                                 │
│    ├── MovieService                                            │
│    │     - addMovie(MovieAddedEvent)                          │
│    │     - publishes RecommendationEvents.NewMovieAdded        │
│    │                                                            │
│    ├── CustomerService                                         │
│    │     - updateGenre(CustomerGenreUpdatedEvent)              │
│    │     - publishes RecommendationEvents.Personalized         │
│    │                                                            │
│    ├── RecommendationService (READ query layer)                │
│    │     - newlyAdded()                                        │
│    │     - personalized(customerId)                            │
│    │                                                            │
│    └── RecommendationStreamService (real-time push)            │
│          - @EventListener for NewMovieAdded                    │
│          - @EventListener for Personalized                     │
│          - SSE push (bài 5)                                    │
│                                                                │
│              │ uses                                            │
│              ▼                                                 │
│  Data Layer (entity + repository)                             │
│    ├── MovieEntity / MovieRepository                           │
│    └── CustomerGenreEntity / CustomerGenreRepository           │
│                                                                │
│              │ persists to                                     │
│              ▼                                                 │
│  H2 In-memory DB                                               │
│    ├── movie (id, title, genres, vote_count, created_at, ...)  │
│    └── customer_genre (customer_id, favorite_genre)            │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

4 service classes có trách nhiệm khác nhau (Single Responsibility):

| Service | Vai trò |
|---|---|
| `MovieService` | Apply MovieAddedEvent vào movie table |
| `CustomerService` | Apply CustomerGenreUpdatedEvent vào customer_genre table |
| `RecommendationService` | READ-only: query DB build recommendation list |
| `RecommendationStreamService` | Real-time push qua SSE (bài 5) |

## Data layer

### Schema (data.sql)

```sql
CREATE TABLE movie (
    id BIGINT PRIMARY KEY,
    title VARCHAR(255),
    runtime_minutes INT,
    vote_count INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE movie_genre (
    movie_id BIGINT,
    genre VARCHAR(50),
    PRIMARY KEY (movie_id, genre),
    FOREIGN KEY (movie_id) REFERENCES movie(id)
);

CREATE TABLE customer_genre (
    customer_id BIGINT PRIMARY KEY,
    favorite_genre VARCHAR(50)
);
```

KHÔNG có `created_at` ở Movie Service DB, nhưng Recommendation Service **có**. Lý do: cần biết movie nào "vừa mới được add" để recommend "newly added" → Recommendation track timestamp riêng.

→ Demonstration: mỗi service có thể có **schema khác nhau** mặc dù domain data tương tự. Tùy use case.

### Entity + Repository

```java
@Entity
@Table(name = "movie")
public class MovieEntity {
    @Id
    private Long id;
    private String title;
    private Integer runtimeMinutes;
    private Integer voteCount;
    
    @CreationTimestamp
    private Instant createdAt;
    
    @ElementCollection
    private List<String> genres;
    
    // getters/setters
}

@Entity
@Table(name = "customer_genre")
public class CustomerGenreEntity {
    @Id
    private Long customerId;
    private String favoriteGenre;
    
    // getters/setters
}
```

Repository với **Spring Data JPA query methods**:

```java
public interface MovieRepository extends JpaRepository<MovieEntity, Long> {
    
    // Newly added — top 10 movies sort theo createdAt desc
    List<MovieEntity> findTop10ByOrderByCreatedAtDesc();
    
    // Personalized — top 10 movies match genre customer, sort theo voteCount
    @Query("""
        SELECT m FROM MovieEntity m
        JOIN m.genres g
        WHERE m.id IN (
            SELECT m2.id FROM MovieEntity m2
            JOIN m2.genres g2
            JOIN CustomerGenreEntity c ON c.customerId = :customerId
            WHERE g2 = c.favoriteGenre
        )
        ORDER BY m.voteCount DESC
        LIMIT 10
    """)
    List<MovieEntity> findPersonalized(@Param("customerId") Long customerId);
}

public interface CustomerGenreRepository extends JpaRepository<CustomerGenreEntity, Long> {
}
```

`findTop10ByOrderByCreatedAtDesc()` — Spring Data JPA auto-derive query từ method name.

`findPersonalized()` — custom JPQL join 2 tables.

## Service layer — implementation

### MovieService

```java
@Service
public class MovieService {

    private final MovieRepository repository;
    private final ApplicationEventPublisher eventPublisher;

    public MovieService(MovieRepository repository,
                         ApplicationEventPublisher eventPublisher) {
        this.repository = repository;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public void addMovie(MovieAddedEvent event) {
        MovieEntity entity = RecommendationMapper.toMovieEntity(event);
        repository.save(entity);
        
        // Notify internal: có movie mới
        eventPublisher.publishEvent(
            new RecommendationEvents.NewMovieAdded(event.movieId())
        );
    }
}
```

### CustomerService

```java
@Service
public class CustomerService {

    private final CustomerGenreRepository repository;
    private final ApplicationEventPublisher eventPublisher;

    public CustomerService(CustomerGenreRepository repository,
                            ApplicationEventPublisher eventPublisher) {
        this.repository = repository;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public void updateGenre(CustomerGenreUpdatedEvent event) {
        CustomerGenreEntity entity = RecommendationMapper.toCustomerGenre(event);
        repository.save(entity);
        
        // Notify internal: customer có preference mới
        eventPublisher.publishEvent(
            new RecommendationEvents.Personalized(event.customerId())
        );
    }
}
```

### Internal domain events: `RecommendationEvents`

```java
public class RecommendationEvents {

    public record NewMovieAdded(Long movieId) {}
    
    public record Personalized(Long customerId) {}
    
    // private constructor — class này chỉ là namespace
    private RecommendationEvents() {}
}
```

**Pattern**: 1 class file chứa multiple related records (namespace pattern). Tránh tạo nhiều file lẻ tẻ cho records nhỏ liên quan nhau.

→ Trong tương lai có thể thêm `WatchHistoryBased`, `TrendingNow`, etc. — tất cả trong cùng namespace class.

### RecommendationService (READ-only query)

```java
@Service
public class RecommendationService {

    private final MovieRepository movieRepository;

    public RecommendationService(MovieRepository movieRepository) {
        this.movieRepository = movieRepository;
    }

    public List<MovieSummary> findNewlyAdded() {
        return movieRepository.findTop10ByOrderByCreatedAtDesc()
            .stream()
            .map(RecommendationMapper::toMovieSummary)
            .toList();
    }

    public List<MovieSummary> findPersonalized(Long customerId) {
        return movieRepository.findPersonalized(customerId)
            .stream()
            .map(RecommendationMapper::toMovieSummary)
            .toList();
    }

    public MovieSummary findMovie(Long movieId) {
        return movieRepository.findById(movieId)
            .map(RecommendationMapper::toMovieSummary)
            .orElseThrow(() -> new RuntimeException("Movie not found: " + movieId));
    }
}
```

> **Note về exception**: `findMovie` throw generic RuntimeException, không tạo MovieNotFoundException riêng. Lý do: method này **chỉ gọi internal** (từ RecommendationStreamService), không expose qua REST → khả năng gặp invalid ID thấp. Production có thể strict hơn nếu muốn.

## Messaging layer — EventConsumerConfig

```java
@Configuration
public class EventConsumerConfig {

    private static final Logger log = LoggerFactory.getLogger(EventConsumerConfig.class);

    @Bean
    public Consumer<MovieAddedEvent> movieAddedEventConsumer(MovieService movieService) {
        return withLogging(movieService::addMovie);
    }

    @Bean
    public Consumer<CustomerGenreUpdatedEvent> genreUpdatedEventConsumer(CustomerService customerService) {
        return withLogging(customerService::updateGenre);
    }

    /**
     * Wrapper helper: log mọi event nhận được trước khi gọi consumer.
     */
    private <T> Consumer<T> withLogging(Consumer<T> consumer) {
        return event -> {
            log.info("Received: {}", event);
            consumer.accept(event);
        };
    }
}
```

### `withLogging` helper pattern

DRY: cùng logic log trước khi xử lý cho mọi consumer. Tránh lặp lại:

```java
// Without helper — duplicated log code:
return event -> {
    log.info("Received: {}", event);
    movieService.addMovie(event);
};

return event -> {
    log.info("Received: {}", event);
    customerService.updateGenre(event);
};

// With helper — clean:
return withLogging(movieService::addMovie);
return withLogging(customerService::updateGenre);
```

Pattern này có thể wrap thêm:
- Error handling.
- Metrics (count, latency).
- Tracing.

```java
private <T> Consumer<T> withInstrumentation(String eventType, Consumer<T> consumer) {
    return event -> {
        log.info("Received {}: {}", eventType, event);
        Timer.Sample sample = Timer.start();
        try {
            consumer.accept(event);
        } finally {
            sample.stop(metricRegistry.timer("event.processing", "type", eventType));
        }
    };
}
```

Aspect-Oriented Programming (AOP) thay thế approach này ở scale lớn.

## YAML config — bindings cho 2 consumer

```yaml
spring:
  cloud:
    function:
      definition: movieAddedEventConsumer;genreUpdatedEventConsumer
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
```

2 bean → 2 binding → 2 topic khác nhau. Cùng consumer group `recommendation-service`.

`auto.offset.reset: earliest` để khi service mới deploy đọc lại history events (build state).

## Pipeline visual

```text
Movie Service             Recommendation Service
┌──────────────┐          ┌────────────────────────────────────────┐
│ POST /movies │          │                                         │
│              │          │  movieAddedEventConsumer (Kafka thread) │
│ save DB      │          │              │ withLogging              │
│ emit event   │          │              ▼                          │
└──────┬───────┘          │  MovieService.addMovie()                │
       │                  │              │                          │
       │ MovieAddedEvent  │     ┌────────┴─────────┐                │
       ▼                  │     ▼                  ▼                │
   movie-events topic ────►  Save DB         Publish               │
                             (movie table)   NewMovieAdded         │
                                              (Spring event)        │
                          │                       │                 │
                          │ @EventListener        │                 │
                          │                       ▼                 │
                          │   RecommendationStreamService           │
                          │     (push SSE — bài 5)                  │
                          └────────────────────────────────────────┘
```

## Tóm tắt bài 4

- Recommendation Service architecture: 2 consumer + 4 service + 2 entity/repo.
- Consumer beans dùng pattern `withLogging` wrapper helper → DRY logging logic.
- MovieService + CustomerService update local DB + publish **internal domain events** (`RecommendationEvents.NewMovieAdded`, `Personalized`).
- Internal events khác **Kafka events**: chạy trong cùng JVM qua `ApplicationEventPublisher`, không qua Kafka.
- `RecommendationEvents` class là **namespace pattern**: nhiều related records trong 1 file.
- RecommendationService = READ-only query layer. `findTop10ByOrderByCreatedAtDesc()` cho newly added, custom JPQL join cho personalized.
- 2 binding consumer trong YAML, cùng group `recommendation-service`.
- `auto.offset.reset: earliest` → service mới deploy đọc lại history để build state.

**Bài kế tiếp** → [Bài 5: Reactive Sinks + SSE real-time streaming](05-recommendation-stream.md)

# Bài 3: Movie Service — implementation + tests + data initialization

Movie Service tương tự Customer Service về pattern (entity + repo + service + messaging + tests). Bài này tập trung **những điểm khác biệt**:
- Data nhiều hơn (~100,000 movies từ JSON file).
- **Data initializer** dùng virtual thread để publish liên tục cho demo.
- Test pattern giống Customer Service.

## Schema + endpoints

### Movie entity

```java
@Entity
public class MovieEntity {
    @Id
    @GeneratedValue
    private Long id;
    private String title;
    private Double voteAverage;
    private Integer voteCount;
    private LocalDate releaseDate;
    private Double revenue;
    private Integer runtime;
    private Double budget;
    private String overview;
    
    @ElementCollection
    private List<String> genres;        // action, comedy, horror, ...
    
    // getters/setters
}
```

Movie có nhiều field hơn Customer (IMDB rating, revenue, budget, overview).

### REST endpoints

| Method | Endpoint | Effect |
|---|---|---|
| GET | `/api/movies/{id}` | Return MovieDetails |
| POST | `/api/movies` | Insert + emit `MovieAddedEvent` |

### Event payload (slim)

```java
public record MovieAddedEvent(
    Long movieId,
    String title,
    Integer runtimeMinutes,
    List<String> genres
) {}
```

Chỉ basic info. KHÔNG include IMDB, revenue, budget, overview.

→ Recommendation Service muốn full detail → GET `/api/movies/{id}` từ Movie Service.

## Implement Service

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

    public MovieDetails getMovie(Long id) {
        return repository.findById(id)
            .map(MovieMapper::toMovieDetails)
            .orElseThrow(() -> new MovieNotFoundException(id));
    }

    @Transactional
    public MovieDetails saveMovie(MovieDetails details) {
        MovieEntity entity = MovieMapper.toMovie(details);
        MovieEntity saved = repository.save(entity);
        
        // Publish event sau khi save (entity giờ có ID)
        var event = MovieMapper.toMovieAddedEvent(saved);
        eventPublisher.publishEvent(event);
        
        return MovieMapper.toMovieDetails(saved);
    }
}
```

Pattern y hệt CustomerService: dùng `ApplicationEventPublisher` thay vì inject StreamBridge.

## Implement Messaging

```java
@Component
public class MovieEventPublisher {

    private static final String MOVIE_EVENTS_OUT = "movie-events-out";
    private static final Logger log = LoggerFactory.getLogger(MovieEventPublisher.class);
    
    private final StreamBridge streamBridge;
    
    public MovieEventPublisher(StreamBridge streamBridge) {
        this.streamBridge = streamBridge;
    }
    
    @EventListener
    public void handle(MovieAddedEvent event) {
        Message<MovieAddedEvent> msg = MessageBuilder
            .withPayload(event)
            .setHeader(KafkaHeaders.KEY, event.movieId())
            .build();
        
        streamBridge.send(MOVIE_EVENTS_OUT, msg);
        log.info("Published: {}", event);
    }
}
```

Key = movieId → events của cùng movie luôn vào cùng partition.

## YAML config

```yaml
spring:
  application:
    name: movie-service
  datasource:
    url: jdbc:h2:mem:movie
  jpa:
    hibernate:
      ddl-auto: create-drop
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:9092
        bindings:
          movie-events-out:
            producer:
              configuration:
                key.serializer: org.apache.kafka.common.serialization.LongSerializer
      bindings:
        movie-events-out:
          destination: movie-events

server:
  port: 8082

app:
  import-movies: false              # demo: true để auto import
```

`app.import-movies` toggle data initializer (sẽ giải thích ngay dưới).

## Data Initializer — auto publish events cho demo

**Vấn đề demo**: muốn observe Recommendation Service nhận events real-time. Manual POST 100 movies qua Postman = tốn thời gian.

**Solution**: `MovieDataInitializer` đọc 100,000 movies từ file JSONL → publish 1 movie mỗi 3 giây qua virtual thread.

### File `movies.jsonl`

Format **JSON Lines** — mỗi line = 1 JSON object:

```text
{"title":"The Matrix","voteAverage":8.7,"runtime":136,"genres":["action","sci-fi"], ...}
{"title":"Inception","voteAverage":8.8,"runtime":148,"genres":["action","thriller"], ...}
{"title":"Toy Story","voteAverage":8.3,"runtime":81,"genres":["animation","family"], ...}
...
```

~100,000 dòng = ~100k movies. Stream được, không load hết vào memory.

Đặt ở `src/main/resources/movies.jsonl`.

### MovieDataInitializer

```java
@Component
@ConditionalOnProperty(name = "app.import-movies", havingValue = "true")
public class MovieDataInitializer implements CommandLineRunner {

    private final MovieService movieService;
    private final Resource movieFile;

    public MovieDataInitializer(MovieService movieService,
                                  @Value("classpath:movies.jsonl") Resource movieFile) {
        this.movieService = movieService;
        this.movieFile = movieFile;
    }

    @Override
    public void run(String... args) {
        // KHÔNG block main thread → chạy trên virtual thread
        Thread.ofVirtual().start(this::loadMovies);
    }

    private void loadMovies() {
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(movieFile.getInputStream()))) {
            
            JsonMapper mapper = JsonMapper.builder().build();
            
            reader.lines()
                .map(line -> deserialize(line, mapper))
                .forEach(movie -> {
                    movieService.saveMovie(movie);
                    sleep(3000);   // 3 giây / movie
                });
                
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private MovieDetails deserialize(String line, JsonMapper mapper) {
        try {
            return mapper.readValue(line, MovieDetails.class);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
```

### Điểm kỹ thuật quan trọng

#### 1. `@ConditionalOnProperty`

Class chỉ active khi `app.import-movies=true`. Otherwise dormant.

→ Trong test hoặc khi chạy normal: không spam.
→ Demo cuối: bật lên để observe Recommendation Service real-time.

#### 2. Virtual Thread

`Thread.ofVirtual().start(...)` thay vì gọi `loadMovies()` trực tiếp trong `run()`.

Lý do: `CommandLineRunner.run()` chạy synchronous trong main thread Spring app. Nếu block → các component khác chậm khởi tạo, có thể request HTTP chưa serve được trong khi loading.

Virtual thread (Java 21+):
- Cheap (10000 virtual threads ≈ 1 platform thread tài nguyên).
- Phù hợp blocking I/O (file read, DB write, Kafka publish).
- Không impact main thread.

#### 3. Stream-based file reading

`reader.lines()` trả về `Stream<String>` lazy. Không load 100k movies vào memory cùng lúc.

```text
Memory profile:
  Naive (read all): ~500MB peak
  Stream (line-by-line): ~50MB
```

#### 4. JSON Lines format

Vì sao không dùng JSON array `[{...},{...},...]`?

- JSON array: parser phải load toàn bộ vào memory để parse.
- JSON Lines: mỗi line independent → stream parse dòng-by-dòng.

JSONL phù hợp cho big data export/import.

## Test pattern — same as Customer Service

3 loại test giống bài 2:

### Test 1: REST API test

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
class MovieApiTest {

    @Autowired
    RestTestClient testClient;

    @Test
    void saveMovie_returnsCreated() {
        MovieDetails request = new MovieDetails(
            null, "The Matrix", 8.7, 5000, 
            LocalDate.of(1999, 3, 31), 463000000.0,
            136, 63000000.0, "Hacker discovers reality is a simulation",
            List.of("action", "sci-fi")
        );
        
        testClient.post()
            .uri("/api/movies")
            .body(Mono.just(request), MovieDetails.class)
            .exchange()
            .expectStatus().isOk()
            .expectBody()
                .jsonPath("$.title").isEqualTo("The Matrix")
                .jsonPath("$.id").isNotEmpty();
    }

    @Test
    void getMovie_notFound() {
        testClient.get()
            .uri("/api/movies/999999")
            .exchange()
            .expectStatus().is4xxClientError();
    }
}
```

### Test 2: Test Binder — verify event publish

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureRestTestClient
@EnableTestBinder
class MovieEventTestBinderTest {

    @Autowired RestTestClient testClient;
    @Autowired OutputDestination output;

    @Test
    void saveMovie_publishesMovieAddedEvent() throws Exception {
        MovieDetails request = new MovieDetails(
            null, "Inception", 8.8, 10000,
            LocalDate.of(2010, 7, 16), 829000000.0, 148,
            160000000.0, "Dream within a dream", 
            List.of("action", "thriller")
        );
        
        testClient.post()
            .uri("/api/movies")
            .body(Mono.just(request), MovieDetails.class)
            .exchange()
            .expectStatus().isOk();
        
        Message<byte[]> rawMsg = output.receive(1000, "movie-events");
        assertNotNull(rawMsg);
        
        MovieAddedEvent event = JsonMapper.builder().build()
            .readValue(rawMsg.getPayload(), MovieAddedEvent.class);
        
        assertEquals("Inception", event.title());
        assertEquals(148, event.runtimeMinutes());
        assertTrue(event.genres().contains("action"));
        
        Long key = rawMsg.getHeaders().get(KafkaHeaders.KEY, Long.class);
        assertNotNull(key);
        assertTrue(key > 0);
    }
}
```

### Test 3: Testcontainers — same scenario với Kafka thật

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
                properties = {
                    "spring.cloud.function.definition=testConsumer",
                    "spring.cloud.stream.bindings.testConsumer-in-0.destination=movie-events",
                    "spring.cloud.stream.kafka.bindings.testConsumer-in-0.consumer.configuration.key.deserializer=org.apache.kafka.common.serialization.LongDeserializer",
                    "spring.cloud.stream.kafka.bindings.testConsumer-in-0.consumer.configuration.auto.offset.reset=earliest"
                })
@AutoConfigureRestTestClient
@Import({TestcontainersConfiguration.class, MovieTestConsumerConfiguration.class})
class MovieEventTestcontainersTest {

    @Autowired RestTestClient testClient;
    @Autowired BlockingQueue<Message<MovieAddedEvent>> queue;

    @Test
    void saveMovie_publishesViaRealKafka() throws Exception {
        MovieDetails request = new MovieDetails(
            null, "Interstellar", 8.6, 8000,
            LocalDate.of(2014, 11, 7), 700000000.0, 169,
            165000000.0, "Space adventure", 
            List.of("sci-fi", "drama")
        );
        
        testClient.post()
            .uri("/api/movies")
            .body(Mono.just(request), MovieDetails.class)
            .exchange()
            .expectStatus().isOk();
        
        Message<MovieAddedEvent> message = queue.poll(5, TimeUnit.SECONDS);
        assertNotNull(message);
        assertEquals("Interstellar", message.getPayload().title());
        
        Long key = message.getHeaders().get(KafkaHeaders.RECEIVED_KEY, Long.class);
        assertNotNull(key);
    }
}
```

### Test Consumer Configuration

```java
@TestConfiguration
public class MovieTestConsumerConfiguration {

    @Bean
    public BlockingQueue<Message<MovieAddedEvent>> queue() {
        return new LinkedBlockingQueue<>();
    }

    @Bean
    public Consumer<Message<MovieAddedEvent>> testConsumer(
            BlockingQueue<Message<MovieAddedEvent>> queue) {
        return queue::add;
    }
}
```

## Tóm tắt bài 3

- Movie Service structure giống Customer Service (entity, repo, service, messaging, controller).
- Movie có nhiều field hơn (IMDB, revenue, budget). Event payload SLIM, không carry mọi field.
- Recommendation Service muốn full detail → GET API Movie Service.
- **`MovieDataInitializer`**: CommandLineRunner đọc 100k movies từ JSONL, publish 1 movie / 3 giây.
- Pattern technical:
  - `@ConditionalOnProperty(app.import-movies=true)` để toggle on/off.
  - Virtual thread không block main thread.
  - Stream lazy reading (không load file vào memory).
  - JSONL format thay JSON array để stream parse được.
- Test pattern giống Customer Service: REST API + Test Binder + Testcontainers.
- Key publishing = movieId (Long, dùng `LongSerializer`).

**Bài kế tiếp** → [Bài 4: Recommendation Service — event-driven design + consuming](04-recommendation-consumer.md)

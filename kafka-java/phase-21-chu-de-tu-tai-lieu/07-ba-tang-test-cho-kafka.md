# Bài 7: Ba tầng test cho Kafka — Test Binder, EmbeddedKafka, Testcontainers

[Phase 15](../phase-15-testing/01-test-binder.md) đã dạy hai công cụ: **Test Binder** (nhanh, trong JVM) và **Testcontainers** (Kafka thật trong Docker). Còn một công cụ ở giữa mà rất nhiều dự án Spring dùng: **`@EmbeddedKafka`**.

Bài này đặt cả ba cạnh nhau, chỉ rõ cái nào bắt được loại lỗi nào, và — quan trọng hơn — **cái nào bỏ sót loại lỗi nào**. Vì tầng test sai làm bạn tin vào một bộ test xanh mà production vẫn vỡ.

## Ba tầng, ba mức trung thực

```text
   ┌────────────────────────────────────────────────────────────────┐
   │ TẦNG 1 — TEST BINDER                                           │
   │ Không có Kafka. Spring thay binder bằng bản giả trong bộ nhớ.  │
   │                                                                 │
   │  ┌──────────┐   ┌─────────────┐   ┌──────────┐                │
   │  │ Producer │──►│ InMemory    │──►│ Consumer │   cùng một JVM │
   │  │ bean     │   │ Destination │   │ bean     │                │
   │  └──────────┘   └─────────────┘   └──────────┘                │
   │                                                                 │
   │  Khởi động: ~1 giây      Kiểm được: LOGIC HÀM                  │
   ├────────────────────────────────────────────────────────────────┤
   │ TẦNG 2 — EMBEDDED KAFKA                                        │
   │ Broker Kafka THẬT, chạy nhúng trong chính JVM của test.        │
   │                                                                 │
   │  ┌──────────────────── JVM của test ─────────────────────┐    │
   │  │  ┌──────────┐   ┌──────────────┐   ┌──────────┐       │    │
   │  │  │ Producer │──►│ Kafka broker │──►│ Consumer │       │    │
   │  │  │ bean     │   │ NHÚNG        │   │ bean     │       │    │
   │  │  └──────────┘   └──────────────┘   └──────────┘       │    │
   │  └────────────────────────────────────────────────────────┘    │
   │                                                                 │
   │  Khởi động: ~5-10 giây   Kiểm được: GIAO THỨC KAFKA THẬT       │
   ├────────────────────────────────────────────────────────────────┤
   │ TẦNG 3 — TESTCONTAINERS                                        │
   │ Kafka thật, trong container Docker riêng, đúng phiên bản prod. │
   │                                                                 │
   │  ┌── JVM test ──┐        ┌──── Docker container ────┐          │
   │  │  Ứng dụng    │◄──────►│  apache/kafka:3.8.0      │          │
   │  └──────────────┘  mạng  └──────────────────────────┘          │
   │                                                                 │
   │  Khởi động: ~15-40 giây  Kiểm được: MÔI TRƯỜNG GIỐNG PROD      │
   └────────────────────────────────────────────────────────────────┘
```

## Tầng 2 — `@EmbeddedKafka` chi tiết

### Phụ thuộc

```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka-test</artifactId>
    <scope>test</scope>
</dependency>
```

### Test cơ bản

```java
@SpringBootTest
@EmbeddedKafka(
    partitions = 3,
    topics = { "orders", "orders-dlq" },
    brokerProperties = {
        "listeners=PLAINTEXT://localhost:9092",
        "port=9092"
    }
)
class OrderConsumerTest {

    @Autowired
    private KafkaTemplate<String, Order> kafkaTemplate;

    @MockBean
    private InventoryService inventoryService;

    @Test
    void consumer_phai_tru_kho_khi_nhan_don_hang() {
        Order order = new Order("OD-1", "KH-042", 2);

        kafkaTemplate.send("orders", order.getCustomerId(), order);

        // KHÔNG dùng Thread.sleep — dùng chờ có điều kiện
        await().atMost(Duration.ofSeconds(10))
               .untilAsserted(() ->
                   verify(inventoryService).truKho("OD-1", 2));
    }
}
```

### Cách cấu hình đúng — dùng cổng ngẫu nhiên

Cấu hình ở trên cắm cứng cổng 9092. Điều đó gây hai vấn đề: xung đột nếu máy đang chạy Kafka thật, và các test không chạy song song được.

```java
@SpringBootTest
@EmbeddedKafka(partitions = 3, topics = "orders")   // KHÔNG chỉ định cổng
@DirtiesContext
class OrderConsumerTest {

    // Spring tự đặt biến này, trỏ tới broker nhúng ở cổng ngẫu nhiên
    @DynamicPropertySource
    static void kafkaProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.kafka.bootstrap-servers",
                     () -> System.getProperty("spring.embedded.kafka.brokers"));
    }
}
```

Trong `application-test.yml` cách gọn hơn:

```yaml
spring:
  kafka:
    bootstrap-servers: ${spring.embedded.kafka.brokers}
```

`spring.embedded.kafka.brokers` là biến hệ thống mà `@EmbeddedKafka` tự đặt sau khi broker nhúng khởi động xong.

### Test producer — đọc bằng consumer thật

```java
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = "orders")
class OrderProducerTest {

    @Autowired private EmbeddedKafkaBroker embeddedKafka;
    @Autowired private OrderEventPublisher publisher;

    private Consumer<String, Order> testConsumer;

    @BeforeEach
    void setUp() {
        Map<String, Object> props =
            KafkaTestUtils.consumerProps("test-group", "true", embeddedKafka);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(JsonDeserializer.TRUSTED_PACKAGES, "*");

        testConsumer = new DefaultKafkaConsumerFactory<>(
                props, new StringDeserializer(),
                new JsonDeserializer<>(Order.class)).createConsumer();

        embeddedKafka.consumeFromAnEmbeddedTopic(testConsumer, "orders");
    }

    @AfterEach
    void tearDown() {
        testConsumer.close();
    }

    @Test
    void producer_phai_dat_customerId_lam_key() {
        publisher.publish(new Order("OD-1", "KH-042", 2));

        ConsumerRecord<String, Order> record =
            KafkaTestUtils.getSingleRecord(testConsumer, "orders", Duration.ofSeconds(10));

        assertThat(record.key()).isEqualTo("KH-042");
        assertThat(record.value().getOrderId()).isEqualTo("OD-1");
    }
}
```

`KafkaTestUtils` là lớp tiện ích rất đáng biết:

| Phương thức | Dùng để |
|---|---|
| `consumerProps(group, autoCommit, broker)` | Sinh sẵn cấu hình consumer trỏ vào broker nhúng |
| `producerProps(broker)` | Tương tự cho producer |
| `getSingleRecord(consumer, topic, timeout)` | Chờ và lấy **đúng một** bản ghi |
| `getRecords(consumer, timeout)` | Lấy mọi bản ghi có trong khoảng chờ |

### Test được điều mà Test Binder KHÔNG test được

Đây là lý do tồn tại của tầng 2:

```java
@Test
void message_cung_key_phai_vao_cung_partition() {
    for (int i = 0; i < 20; i++) {
        publisher.publish(new Order("OD-" + i, "KH-042", 1));   // CÙNG key
    }

    ConsumerRecords<String, Order> records =
        KafkaTestUtils.getRecords(testConsumer, Duration.ofSeconds(10));

    Set<Integer> partitions = new HashSet<>();
    records.forEach(r -> partitions.add(r.partition()));

    assertThat(partitions).hasSize(1);      // Test Binder KHÔNG bắt được lỗi này
}
```

Bảng những lỗi mà chỉ tầng 2 trở lên mới bắt được:

| Loại lỗi | Test Binder | EmbeddedKafka | Testcontainers |
|---|---|---|---|
| Logic hàm nghiệp vụ | **Bắt được** | Bắt được | Bắt được |
| Sai tên binding / destination | Bắt được | Bắt được | Bắt được |
| **Partitioner sai** (key vào sai partition) | Không | **Bắt được** | Bắt được |
| **Serializer / Deserializer không khớp** | Không | **Bắt được** | Bắt được |
| **Hành vi consumer group + rebalance** | Không | **Bắt được** | Bắt được |
| **Offset commit và xử lý lại** | Không | **Bắt được** | Bắt được |
| **Retry và DLQ thật** | Một phần | **Bắt được** | Bắt được |
| **Transaction Kafka** | Không | Bắt được (cần cấu hình) | **Bắt được** |
| **Khác biệt giữa các phiên bản Kafka** | Không | Không | **Bắt được** |
| **Cấu hình SSL/SASL** | Không | Khó | **Bắt được** |
| **Hành vi khi broker chết** | Không | Không | **Bắt được** |
| **Nén, kích thước message tối đa** | Không | Một phần | **Bắt được** |

Bốn dòng cuối là lý do vẫn cần tầng 3 dù đã có tầng 2.

## Ba nhược điểm thật của EmbeddedKafka

### 1. Không phải Kafka bạn chạy ở production

`@EmbeddedKafka` dùng phiên bản Kafka đi kèm `spring-kafka-test`, chứ **không phải** phiên bản trên cụm của bạn.

```text
   Production chạy:  Kafka 3.8 (KRaft)
   spring-kafka-test kéo về:  Kafka 3.6

   → Test xanh, production vỡ vì một hành vi đổi giữa hai phiên bản.
```

Kiểm tra bằng:

```bash
mvn dependency:tree | grep -i "kafka_2\|kafka-clients"
```

### 2. Trạng thái rò rỉ giữa các test

Đây là nguyên nhân số một của test "lúc xanh lúc đỏ":

```text
   Test A: gửi 5 message vào topic "orders"
   Test B: dùng LẠI broker nhúng đó, đọc topic "orders"
           → nhận cả 5 message của test A
           → đỏ, mà chỉ đỏ khi chạy cùng nhau
```

Ba cách chữa, theo mức độ:

```java
// Cách 1 — mỗi lớp test một context Spring mới (chậm nhưng chắc)
@DirtiesContext(classMode = ClassMode.AFTER_CLASS)

// Cách 2 — mỗi test một group.id riêng
props.put(ConsumerConfig.GROUP_ID_CONFIG, "test-" + UUID.randomUUID());

// Cách 3 — mỗi test một topic riêng (tốt nhất, không phải khởi động lại gì)
private final String topic = "orders-" + UUID.randomUUID();
```

**Cách 3 là tốt nhất** — cách ly hoàn toàn mà không phải trả giá bằng thời gian khởi động.

### 3. Khởi động chậm và chiếm bộ nhớ

Một broker Kafka nhúng tốn khoảng 5–10 giây khởi động và vài trăm MB heap. Với 50 lớp test mà mỗi lớp `@DirtiesContext` thì bộ test chạy hàng chục phút.

Cách chữa: **dùng chung một context Spring cho nhiều lớp test** bằng cách gom cấu hình vào một lớp cha, và **chỉ cách ly bằng topic riêng**.

```java
@SpringBootTest
@EmbeddedKafka(partitions = 3, topics = {})    // không khai báo topic sẵn
public abstract class AbstractKafkaTest {
    @Autowired protected EmbeddedKafkaBroker embeddedKafka;

    protected String topicRieng() {
        return "test-" + UUID.randomUUID();
    }
}
```

Spring **dùng lại** context giữa các lớp test có cùng cấu hình — nên broker nhúng chỉ khởi động **một lần** cho cả bộ test.

## Bảng chọn tầng

| Tiêu chí | Test Binder | EmbeddedKafka | Testcontainers |
|---|---|---|---|
| Thời gian khởi động | **~1 giây** | ~5–10 giây | ~15–40 giây |
| Cần Docker | Không | Không | **Có** |
| Chạy được trên CI hạn chế | **Có** | **Có** | Cần Docker-in-Docker |
| Đúng phiên bản production | Không liên quan | **Không** | **Có** |
| Test được giao thức Kafka thật | Không | **Có** | **Có** |
| Test được SSL/SASL | Không | Khó | **Có** |
| Test được broker chết | Không | Không | **Có** |
| Vị trí trong kim tự tháp test | Test đơn vị mở rộng | **Test tích hợp** | **Test đầu-cuối** |
| Nên chiếm bao nhiêu % bộ test | **~70%** | **~25%** | **~5%** |

Tỉ lệ 70/25/5 là điểm đáng nhớ nhất bài. Nó là hệ quả của một nguyên tắc chung: **test càng trung thực thì càng chậm và càng dễ vỡ vặt (flaky)**. Dồn hết vào Testcontainers cho "chắc" sẽ tạo ra một bộ test chạy 40 phút mà lập trình viên bỏ qua.

```text
   Nên viết ở tầng nào?
   ═══════════════════

   "Hàm xử lý có gọi đúng service không?"        → TEST BINDER
   "Filter có loại đúng event không?"            → TEST BINDER
   "Router có chọn đúng topic đích không?"       → TEST BINDER

   "Key có vào đúng partition không?"            → EMBEDDED KAFKA
   "Deserializer có parse đúng JSON không?"      → EMBEDDED KAFKA
   "Message lỗi có sang DLQ không?"              → EMBEDDED KAFKA
   "Rebalance có chia lại partition đúng không?" → EMBEDDED KAFKA

   "Cấu hình SASL_SSL có đúng không?"            → TESTCONTAINERS
   "Broker chết thì producer có tự phục hồi?"    → TESTCONTAINERS
   "Kafka 3.8 có đổi hành vi gì không?"          → TESTCONTAINERS
```

## Ba quy tắc chống test lúc xanh lúc đỏ

Test Kafka nổi tiếng là hay vỡ vặt vì bản chất bất đồng bộ. Ba quy tắc bắt buộc:

### Quy tắc 1 — không bao giờ `Thread.sleep`

```java
// SAI — đỏ trên CI chậm, mà lại lãng phí 5 giây trên máy nhanh
kafkaTemplate.send("orders", order);
Thread.sleep(5000);
verify(inventoryService).truKho(any());

// ĐÚNG — chờ tới khi điều kiện đúng, tối đa 10 giây
kafkaTemplate.send("orders", order);
await().atMost(Duration.ofSeconds(10))
       .untilAsserted(() -> verify(inventoryService).truKho(any()));
```

Dùng thư viện **Awaitility** (`org.awaitility:awaitility`).

### Quy tắc 2 — luôn `auto.offset.reset=earliest` trong test

```java
props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
```

Với mặc định `latest`, có một cuộc đua kinh điển:

```text
   Test gửi message   ← xảy ra trước
   Consumer đăng ký   ← xảy ra sau, và nhảy tới CUỐI
   → không nhận được gì → test đỏ, nhưng chỉ thỉnh thoảng
```

### Quy tắc 3 — chờ consumer được giao partition xong rồi mới gửi

```java
@BeforeEach
void doiConsumerSanSang() {
    // Chờ tới khi mọi listener container đã nhận được partition
    registry.getListenerContainers().forEach(container ->
        ContainerTestUtils.waitForAssignment(container,
                embeddedKafka.getPartitionsPerTopic()));
}
```

Không có bước này, message gửi trước khi consumer sẵn sàng sẽ bị bỏ lỡ (nếu `auto.offset.reset=latest`) hoặc gây chờ lâu bất thường.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| `Thread.sleep()` để chờ message | Test chậm **và** vẫn vỡ vặt trên CI chậm | Awaitility `await().untilAsserted()` |
| Quên `auto.offset.reset=earliest` | Cuộc đua giữa gửi và đăng ký → đỏ ngẫu nhiên | Luôn đặt `earliest` trong test |
| Cắm cứng cổng 9092 | Xung đột với Kafka thật, không chạy song song được | Để cổng ngẫu nhiên, dùng `spring.embedded.kafka.brokers` |
| Dùng chung topic giữa các test | Test A ảnh hưởng test B | Topic riêng mỗi test bằng `UUID` |
| `@DirtiesContext` mọi lớp test | Bộ test chạy hàng chục phút | Chỉ cách ly bằng topic riêng, dùng chung context |
| Tưởng EmbeddedKafka giống production | Khác phiên bản → hành vi khác | Kiểm tra `dependency:tree`, phủ phần rủi ro bằng Testcontainers |
| Không `close()` consumer trong test | Rò rỉ luồng, test sau bị ảnh hưởng | `@AfterEach` gọi `close()` |
| Dồn hết vào Testcontainers cho "chắc" | Bộ test 40 phút, lập trình viên bỏ qua | Giữ tỉ lệ **70/25/5** |
| Quên `JsonDeserializer.TRUSTED_PACKAGES` | `IllegalArgumentException` về package không tin cậy | Đặt `"*"` trong test |

## Tóm tắt bài 7

- Ba tầng test cho Kafka, theo mức trung thực tăng dần: **Test Binder** (không có Kafka, ~1 giây), **`@EmbeddedKafka`** (broker thật nhúng trong JVM test, ~5–10 giây), **Testcontainers** (Kafka thật trong Docker, đúng phiên bản production, ~15–40 giây).
- **`@EmbeddedKafka` là tầng giữa còn thiếu** trong Phase 15. Nó bắt được những lỗi Test Binder bỏ sót: **partitioner sai, serializer không khớp, hành vi consumer group, offset commit, DLQ thật**.
- Testcontainers vẫn cần cho bốn thứ mà EmbeddedKafka không làm được: **đúng phiên bản production, cấu hình SSL/SASL, hành vi khi broker chết, giới hạn nén và kích thước message**.
- Ba nhược điểm thật của EmbeddedKafka: **khác phiên bản với production**, **trạng thái rò rỉ giữa các test**, và **khởi động chậm**. Cách chữa tốt nhất cho hai cái sau là **topic riêng mỗi test bằng UUID** và **dùng chung một context Spring**.
- Tỉ lệ nên hướng tới: **~70% Test Binder, ~25% EmbeddedKafka, ~5% Testcontainers**. Dồn hết vào tầng trung thực nhất tạo ra bộ test 40 phút mà không ai chạy.
- Ba quy tắc chống test vỡ vặt: **không bao giờ `Thread.sleep`** (dùng Awaitility), **luôn `auto.offset.reset=earliest`**, và **chờ consumer được giao partition xong rồi mới gửi** (`ContainerTestUtils.waitForAssignment`).
- `KafkaTestUtils` là lớp tiện ích cần thuộc: `consumerProps`, `producerProps`, `getSingleRecord`, `getRecords`.

**Quay lại** → [Mục lục khoá Kafka Java](../README.md)

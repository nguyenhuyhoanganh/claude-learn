# Bài 1: Kafka Streams là gì — và vì sao nó không cần cụm xử lý riêng

Bạn đã biết viết producer và consumer. Vậy tại sao còn cần một thứ tên là Kafka Streams?

Câu trả lời ngắn: vì có một nhóm bài toán mà consumer thường **làm được nhưng làm rất tệ** — và bạn chỉ nhận ra nó tệ khi hệ thống đã chạy production được vài tháng.

Bài này chỉ ra nhóm bài toán đó, giải thích Kafka Streams giải nó thế nào, và đính chính một nhầm lẫn rất phổ biến: **`Function<Flux<T>, Flux<R>>` KHÔNG phải Kafka Streams.**

## Bài toán mà consumer thường làm rất tệ

### Ví dụ 1 — đếm theo cửa sổ thời gian

*"Đếm số đơn hàng của mỗi khách trong 5 phút gần nhất. Nếu quá 10 đơn thì cảnh báo gian lận."*

Viết bằng consumer thường:

```java
@KafkaListener(topics = "orders")
public void onOrder(Order order) {
    // Đếm ở đâu? Trong bộ nhớ?
    demTrongBoNho.merge(order.getCustomerId(), 1, Integer::sum);
    //  ✗ Ứng dụng khởi động lại → MẤT SẠCH bộ đếm
    //  ✗ Chạy 3 instance → mỗi instance đếm một phần, không ai có tổng đúng
    //  ✗ Rebalance → partition chuyển máy, bộ đếm ở lại máy cũ
    //  ✗ Làm sao "quên" các đơn cũ hơn 5 phút?
}
```

Đưa vào Redis thì chữa được ba vấn đề đầu, nhưng sinh ra bốn vấn đề mới: thêm một hệ thống phải vận hành, mỗi message tốn một vòng mạng, không có giao dịch nguyên tử giữa Kafka và Redis, và **cửa sổ thời gian vẫn phải tự viết**.

### Ví dụ 2 — làm giàu dữ liệu (enrichment)

*"Mỗi đơn hàng chỉ có `customerId`. Cần ghép thêm tên và hạng thành viên của khách."*

```java
@KafkaListener(topics = "orders")
public void onOrder(Order order) {
    Customer c = customerRepository.findById(order.getCustomerId());   // gọi database
    //  ✗ MỖI message một truy vấn → 50.000 msg/s = 50.000 truy vấn/s
    //  ✗ Database chết là luồng xử lý chết theo
    //  ✗ Độ trễ cộng thêm vòng mạng của mỗi truy vấn
}
```

### Ví dụ 3 — nối hai luồng

*"Ghép sự kiện `PaymentReceived` với `OrderPlaced` tương ứng, trong vòng 30 phút."*

Viết bằng consumer thường thì phải: giữ đệm cả hai luồng, đối chiếu theo khoá, xử lý sự kiện tới lệch thứ tự, dọn đệm khi quá hạn, và làm tất cả những việc đó **một cách bền vững qua khởi động lại**. Đây là vài trăm dòng code cực khó đúng.

### Điểm chung của cả ba

```text
   ┌────────────────────────────────────────────────────────────┐
   │  Cả ba đều cần GHI NHỚ điều gì đó GIỮA các message.        │
   │                                                             │
   │  Consumer thường được thiết kế để XỬ LÝ TỪNG MESSAGE ĐỘC LẬP│
   │  → mọi thứ cần trạng thái đều phải tự xây, và tự xây thì:  │
   │      • mất trạng thái khi khởi động lại                    │
   │      • sai khi chạy nhiều instance                         │
   │      • vỡ khi rebalance                                     │
   └────────────────────────────────────────────────────────────┘
```

**Kafka Streams sinh ra để giải đúng nhóm bài toán có trạng thái này.**

## Kafka Streams là gì

> **Kafka Streams** là một **thư viện Java** để xây dựng ứng dụng xử lý luồng, trong đó dữ liệu vào và ra đều là topic Kafka.

Chữ quan trọng nhất là **thư viện**. Không phải máy chủ, không phải cụm, không phải dịch vụ.

```text
   SPARK / FLINK — cần một CỤM XỬ LÝ RIÊNG
   ═══════════════════════════════════════

   ┌──────────────┐        ┌─────────────────────────────┐
   │ Kafka cluster│───────►│  Cụm Flink (JobManager +    │
   │              │◄───────│  nhiều TaskManager)         │
   └──────────────┘        └─────────────────────────────┘
                            + phải cài, giám sát, nâng cấp
                            + phải học mô hình triển khai riêng
                            + nộp job, theo dõi job, khôi phục job


   KAFKA STREAMS — CHỈ LÀ MỘT ỨNG DỤNG JAVA
   ════════════════════════════════════════

   ┌──────────────┐        ┌─────────────────────────────┐
   │ Kafka cluster│◄──────►│  Ứng dụng Spring Boot       │
   │              │        │  có thêm 1 dependency       │
   └──────────────┘        └─────────────────────────────┘
                            + triển khai như mọi microservice
                            + đóng gói Docker, chạy trên K8s
                            + scale bằng cách tăng số bản sao
                            + KHÔNG có cụm nào phải vận hành
```

Đây là điểm bán hàng lớn nhất của Kafka Streams, và cũng là lý do nó phù hợp với đội ngũ Java/Spring: **bạn không phải học một hệ sinh thái triển khai mới**. Nó là `java -jar` như mọi ứng dụng khác.

### Nó vẫn phân tán, chỉ là Kafka lo giúp

Câu hỏi tự nhiên: không có cụm thì làm sao chia việc và chịu lỗi?

```text
   Chạy 3 bản sao ứng dụng Kafka Streams cùng application.id
        │
        ▼
   Chúng tự tạo thành MỘT CONSUMER GROUP
        │
        ▼
   Kafka chia partition cho ba bản sao — đúng cơ chế consumer group đã học
        │
        ▼
   Một bản sao chết → REBALANCE → partition (và cả TRẠNG THÁI) chuyển sang máy khác
```

Kafka Streams **dùng lại toàn bộ cơ chế consumer group** đã có: chia việc, phát hiện chết, chuyển giao. Không phát minh gì mới ở tầng điều phối. Toàn bộ kiến thức ở [Phase 6](../phase-6-consumer-groups/01-scaling-rebalancing-demo.md) áp dụng nguyên vẹn.

## Đính chính quan trọng: `Flux` không phải Kafka Streams

Đây là nhầm lẫn phổ biến nhất khi dùng Spring Cloud Stream, và tài liệu nguồn của bài này cũng gộp hai thứ vào chung một chương.

```java
// (A) — KHÔNG phải Kafka Streams
@Bean
public Function<Flux<Long>, Flux<Long>> processor() {
    return flux -> flux.map(i -> i * i);
}

// (B) — LÀ Kafka Streams
@Bean
public Function<KStream<String, Long>, KStream<String, Long>> processor() {
    return kstream -> kstream.mapValues(v -> v * v);
}
```

Nhìn giống nhau, nhưng bên dưới là **hai thế giới hoàn toàn khác**:

| | (A) `Flux` — binder `kafka` | (B) `KStream` — binder `kstream` |
|---|---|---|
| Bên dưới thực chất là | Consumer + Producer thường, bọc bằng Reactor | **Kafka Streams thật** |
| Dependency | `spring-cloud-starter-stream-kafka` | `spring-cloud-starter-stream-kafka-streams` |
| Có trạng thái được không | **Không** | **Có** — state store |
| Có cửa sổ thời gian không | **Không** | **Có** |
| Join hai luồng | **Không** | **Có** |
| Exactly-once | Phải tự dựng transaction | **Một dòng cấu hình** |
| Tự tạo topic trung gian | Không | **Có** — changelog, repartition |
| `Flux` mang lại gì | Chỉ là cách viết bất đồng bộ | — |

Chữ `Flux` chỉ nói lên **phong cách lập trình phản ứng**, hoàn toàn không liên quan tới xử lý luồng có trạng thái. Dùng (A) rồi tưởng mình đang dùng Kafka Streams là hiểu nhầm tốn kém: tới khi cần đếm theo cửa sổ hay join thì phát hiện không làm được gì cả.

> **Cách kiểm tra nhanh dự án của bạn**: nếu `pom.xml` không có `spring-cloud-starter-stream-kafka-streams` (hoặc `kafka-streams`), thì **bạn không đang dùng Kafka Streams**, dù code có `Flux` hay không.

## Ba cách viết ứng dụng Kafka — chọn cái nào

```text
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. CONSUMER/PRODUCER THƯỜNG                                 │
   │    @KafkaListener, KafkaTemplate                            │
   │    → Xử lý từng message độc lập. Không trạng thái.          │
   │    → Dùng khi: gọi API, ghi database, gửi email             │
   ├─────────────────────────────────────────────────────────────┤
   │ 2. KAFKA STREAMS                                            │
   │    KStream, KTable, state store                             │
   │    → Kafka VÀO, Kafka RA, có trạng thái                     │
   │    → Dùng khi: đếm, gộp, join, cửa sổ thời gian, làm giàu   │
   ├─────────────────────────────────────────────────────────────┤
   │ 3. KAFKA CONNECT                                            │
   │    Cấu hình JSON, không viết code                           │
   │    → Chuyển dữ liệu giữa Kafka và hệ thống ngoài            │
   │    → Dùng khi: database ↔ Kafka, Kafka → Elasticsearch/S3   │
   └─────────────────────────────────────────────────────────────┘
```

Quy tắc chọn, gọn nhất:

| Câu hỏi | Trả lời |
|---|---|
| Đầu ra có phải là Kafka topic không? | Không → **consumer thường** hoặc **Connect** |
| Có cần nhớ gì giữa các message không? | Không → **consumer thường** |
| Chỉ là chép dữ liệu A sang B, không biến đổi? | **Kafka Connect** |
| Kafka vào, Kafka ra, có trạng thái | **Kafka Streams** |

Điểm cần nhấn: **Kafka Streams bắt buộc đầu ra là Kafka.** Nếu kết quả cuối cùng phải ghi vào database hay gọi API, bạn vẫn cần một consumer thường ở cuối chuỗi (hoặc một sink connector).

## Ví dụ đầu tiên — cấu trúc một ứng dụng Kafka Streams

Bài toán: đọc topic `numbers`, bỏ số lẻ, bình phương số chẵn, ghi vào `squared-numbers`.

### Phụ thuộc

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-stream-kafka-streams</artifactId>
</dependency>
```

### Bộ xử lý

```java
@Configuration
public class NumberProcessor {

    @Bean
    public Function<KStream<String, Long>, KStream<String, Long>> evenSquare() {
        return kstream -> kstream
                .filter((key, value) -> value % 2 == 0)
                .peek((key, value) -> log.debug("Bình phương số chẵn: {}", value))
                .mapValues(value -> value * value);
    }
}
```

### Cấu hình

```yaml
spring:
  cloud:
    stream:
      function:
        definition: evenSquare
      bindings:
        evenSquare-in-0:
          destination: numbers
        evenSquare-out-0:
          destination: squared-numbers
      kafka:
        streams:
          binder:
            brokers: localhost:9092
            configuration:
              application.id: number-processor          # BẮT BUỘC — xem bên dưới
              default.key.serde: org.apache.kafka.common.serialization.Serdes$StringSerde
              default.value.serde: org.apache.kafka.common.serialization.Serdes$LongSerde
```

### Ba khái niệm xuất hiện ngay ở ví dụ nhỏ này

**`application.id` — quan trọng nhất, và bắt buộc.** Nó vừa là `group.id` của consumer group, vừa là tiền tố cho mọi topic nội bộ mà Kafka Streams tự tạo, vừa là tên thư mục trạng thái trên đĩa.

```text
   application.id = "number-processor"
        │
        ├─► group.id = "number-processor"
        ├─► topic nội bộ: number-processor-<tên-store>-changelog
        ├─► topic nội bộ: number-processor-<tên>-repartition
        └─► thư mục trạng thái: /tmp/kafka-streams/number-processor/
```

Hai hệ quả phải nhớ:

| Tình huống | Hậu quả |
|---|---|
| **Đổi `application.id`** | Ứng dụng thành một group mới → **đọc lại từ đầu**, **mất toàn bộ trạng thái**, và **tạo bộ topic nội bộ mới** (rác lại) |
| **Hai ứng dụng khác nhau trùng `application.id`** | Chúng tranh nhau partition và ghi đè trạng thái của nhau — hỏng theo cách rất khó chẩn đoán |

**Serde** — viết tắt của **Ser**ializer + **De**serializer, gộp thành một đối tượng. Kafka Streams cần cả hai chiều vì nó vừa đọc vừa ghi, và còn phải đọc/ghi cả state store.

```java
Serde<String> stringSerde = Serdes.String();
Serde<Long>   longSerde   = Serdes.Long();
Serde<Order>  orderSerde  = new JsonSerde<>(Order.class);
```

**`peek` khác `map`.** `peek` không đổi dữ liệu, chỉ để ghi log hoặc đếm chỉ số — dùng nó thay vì nhét `System.out.println` vào giữa `mapValues`.

## Điều Kafka Streams làm ngầm cho bạn

Đoạn code ba dòng ở trên che giấu khá nhiều việc:

| Việc | Ai làm |
|---|---|
| Tạo consumer group, đăng ký, nhịp tim | **Kafka Streams** |
| Chia partition cho các bản sao ứng dụng | **Kafka Streams** (qua consumer group) |
| Tuần tự hoá / giải tuần tự hoá | **Kafka Streams** (qua Serde) |
| Commit offset | **Kafka Streams** (mặc định mỗi 30 giây, hoặc theo transaction nếu bật EOS) |
| Tạo topic nội bộ cho trạng thái | **Kafka Streams** |
| Khôi phục trạng thái sau khi chết | **Kafka Streams** |
| Xử lý nghiệp vụ | **Bạn** |

Đây vừa là sức mạnh vừa là rủi ro: rất nhiều thứ xảy ra mà bạn không thấy. Các bài sau sẽ mở từng cái ra.

## Khi nào KHÔNG dùng Kafka Streams

Phần này quan trọng ngang phần "khi nào dùng":

| Tình huống | Vì sao không hợp | Dùng gì |
|---|---|---|
| Đầu ra là database, API, email | Kafka Streams **bắt buộc ghi ra Kafka** | Consumer thường, hoặc Streams rồi sink connector |
| Chỉ lọc/biến đổi từng message, không trạng thái | Thêm độ phức tạp mà không được gì | Consumer thường |
| Cần join với dữ liệu **rất lớn** (hàng trăm GB) | State store nằm trên đĩa **của từng instance** | Flink với kho trạng thái ngoài, hoặc tra cứu database |
| Cần SQL tương tác, truy vấn tuỳ ý | Kafka Streams là code, không phải công cụ truy vấn | ksqlDB, hoặc kho dữ liệu |
| Xử lý theo lô trên dữ liệu lịch sử khổng lồ | Kafka Streams tối ưu cho luồng liên tục | Spark |
| Đội không dùng Java/Scala/Kotlin | Kafka Streams **chỉ có cho JVM** | ksqlDB, Flink (có Python), Faust (Python) |

Dòng cuối là giới hạn cứng ít người biết: **Kafka Streams không có bản chính thức cho Python, Go, hay .NET.** Nó là thư viện JVM, chấm hết.

## So sánh với Flink và Spark Streaming

| Tiêu chí | Kafka Streams | Flink | Spark Structured Streaming |
|---|---|---|---|
| Cần cụm riêng | **Không** | **Có** | **Có** |
| Mô hình triển khai | Ứng dụng thường (Docker, K8s) | Nộp job vào cụm | Nộp job vào cụm |
| Nguồn dữ liệu | **Chỉ Kafka** | Kafka, file, database, socket... | Rất nhiều |
| Đích dữ liệu | **Chỉ Kafka** | Rất nhiều | Rất nhiều |
| Ngôn ngữ | **Chỉ JVM** | Java, Scala, Python, SQL | Scala, Java, Python, R, SQL |
| Độ trễ | Rất thấp (từng bản ghi) | Rất thấp (từng bản ghi) | Cao hơn (vi lô — micro-batch) |
| Kho trạng thái | RocksDB cục bộ + changelog | RocksDB + điểm kiểm tra ngoài | Kho ngoài |
| Đường cong học | **Thấp nhất** | Cao | Trung bình |
| Hợp với | Đội Java làm microservice | Xử lý luồng chuyên sâu, nhiều nguồn | Đội đã có Spark, cần cả lô lẫn luồng |

Cách chọn thực dụng:

```text
   Kafka vào → Kafka ra, đội Java, muốn triển khai như microservice
        → KAFKA STREAMS

   Nhiều nguồn khác nhau, cần độ trễ cực thấp, xử lý phức tạp
        → FLINK

   Đã có sẵn hạ tầng Spark cho xử lý theo lô, muốn tái dùng
        → SPARK
```

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Tưởng `Function<Flux<T>,Flux<R>>` là Kafka Streams | Đến khi cần trạng thái mới phát hiện không làm được |
| Không đặt `application.id` | Ứng dụng không khởi động được |
| Đổi `application.id` để "làm mới" | **Mất toàn bộ trạng thái**, đọc lại từ đầu, để lại topic nội bộ rác |
| Hai ứng dụng trùng `application.id` | Tranh partition, ghi đè trạng thái của nhau |
| Dùng Kafka Streams để ghi vào database | Sai công cụ — Streams bắt buộc ghi ra Kafka |
| Dùng Kafka Streams cho việc không trạng thái | Thêm phức tạp mà không được gì |
| Quên khai báo Serde cho kiểu tuỳ chỉnh | `ClassCastException` hoặc `SerializationException` lúc chạy |
| Nhét `System.out.println` vào `mapValues` | Dùng `peek` — đúng mục đích và không đổi dữ liệu |

## Tóm tắt bài 1

- Kafka Streams sinh ra cho nhóm bài toán **cần ghi nhớ trạng thái giữa các message**: đếm theo cửa sổ, làm giàu dữ liệu, join hai luồng. Consumer thường làm được nhưng làm rất tệ — mất trạng thái khi khởi động lại, sai khi chạy nhiều instance, vỡ khi rebalance.
- Nó là **một thư viện Java**, không phải cụm. Triển khai như mọi microservice: `java -jar`, Docker, Kubernetes. Đây là khác biệt lớn nhất so với Flink và Spark.
- Vẫn phân tán và chịu lỗi, nhưng **dùng lại nguyên cơ chế consumer group** của Kafka — không phát minh gì mới ở tầng điều phối.
- **Đính chính**: `Function<Flux<T>, Flux<R>>` với binder `kafka` **KHÔNG phải Kafka Streams** — đó là consumer/producer thường bọc Reactor, **không có trạng thái, không có cửa sổ, không join được**. Kafka Streams thật dùng `KStream`/`KTable` với binder `kstream` và dependency `spring-cloud-starter-stream-kafka-streams`.
- **`application.id` là tham số quan trọng nhất**: nó vừa là `group.id`, vừa là tiền tố topic nội bộ, vừa là tên thư mục trạng thái. Đổi nó = mất toàn bộ trạng thái. Trùng nó giữa hai ứng dụng = hỏng khó chẩn đoán.
- **Serde** = Serializer + Deserializer gộp lại. Kafka Streams cần cả hai chiều vì vừa đọc vừa ghi, kể cả với state store.
- Ba lựa chọn: **consumer thường** (xử lý từng message, đầu ra ngoài Kafka), **Kafka Streams** (Kafka vào, Kafka ra, có trạng thái), **Kafka Connect** (chép dữ liệu, không viết code).
- Giới hạn cứng: **Kafka Streams chỉ chạy trên JVM**, và **đầu ra bắt buộc là Kafka**.

**Bài kế tiếp** → [Bài 2: KStream, KTable, GlobalKTable — ba trừu tượng cốt lõi](02-kstream-ktable-globalktable.md)

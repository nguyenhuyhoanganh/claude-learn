# Bài 8: ksqlDB và khi nào không nên dùng Kafka Streams

Bảy bài trước cho bạn một công cụ mạnh. Bài này làm hai việc: giới thiệu **ksqlDB** — cách viết cùng logic đó bằng SQL, và quan trọng hơn, chỉ ra **khi nào Kafka Streams là lựa chọn sai**.

Phần thứ hai đáng giá hơn. Biết công cụ nào không hợp việc gì là dấu hiệu rõ nhất của người đã dùng nó ở production.

## ksqlDB — Kafka Streams viết bằng SQL

> **ksqlDB** là một máy chủ chạy các câu truy vấn giống SQL trên luồng Kafka. Bên dưới, nó **biên dịch câu SQL thành một topology Kafka Streams** rồi chạy.

Nghĩa là ksqlDB **không** phải một công nghệ khác. Nó là **giao diện SQL đặt lên trên Kafka Streams**. Mọi khái niệm bảy bài trước — KStream, KTable, cửa sổ, join, state store, changelog — đều còn nguyên, chỉ đổi cách viết.

### Cùng một logic, hai cách viết

Đếm đơn hàng theo khách trong cửa sổ 5 phút:

```java
// KAFKA STREAMS
orders.selectKey((k, o) -> o.getCustomerId())
      .groupByKey()
      .windowedBy(TimeWindows.ofSizeAndGrace(Duration.ofMinutes(5), Duration.ofSeconds(30)))
      .count(Materialized.as("orders-per-customer"))
      .toStream()
      .filter((wk, count) -> count > 10)
      .to("high-volume-customers");
```

```sql
-- ksqlDB
CREATE STREAM orders (
    order_id    VARCHAR,
    customer_id VARCHAR,
    amount      DECIMAL(12,2)
) WITH (KAFKA_TOPIC='orders', VALUE_FORMAT='JSON');

CREATE TABLE high_volume_customers
  WITH (KAFKA_TOPIC='high-volume-customers', VALUE_FORMAT='JSON') AS
SELECT customer_id,
       COUNT(*) AS order_count,
       WINDOWSTART AS window_start
FROM   orders
WINDOW TUMBLING (SIZE 5 MINUTES, GRACE PERIOD 30 SECONDS)
GROUP  BY customer_id
HAVING COUNT(*) > 10
EMIT CHANGES;
```

### Hai loại truy vấn — phân biệt dứt điểm

```text
   PUSH QUERY (EMIT CHANGES)
   ═════════════════════════
   Chạy MÃI MÃI, đẩy kết quả mới ra liên tục.
   → Đây chính là một ứng dụng Kafka Streams.

   SELECT * FROM orders WHERE amount > 1000000 EMIT CHANGES;
   → kết quả chảy ra không ngừng, không bao giờ "xong"


   PULL QUERY (không EMIT CHANGES)
   ═══════════════════════════════
   Tra một giá trị TẠI THỜI ĐIỂM HIỆN TẠI rồi trả về ngay.
   → Đây chính là Interactive Query của Kafka Streams (bài 4).

   SELECT * FROM high_volume_customers WHERE customer_id = 'KH-042';
   → trả về một dòng, kết thúc
```

Pull query chỉ chạy được trên **bảng đã được materialize** (tạo bằng `CREATE TABLE ... AS SELECT`), vì nó cần state store để tra.

### Ba câu lệnh tạo

| Lệnh | Tạo ra | Tương đương Kafka Streams |
|---|---|---|
| `CREATE STREAM` | Đăng ký một topic là **luồng sự kiện** | `builder.stream(...)` |
| `CREATE TABLE` | Đăng ký một topic là **bảng trạng thái** | `builder.table(...)` |
| `CREATE ... AS SELECT` (CSAS/CTAS) | **Một job chạy liên tục**, ghi ra topic mới | Cả một topology |

Quyết định `STREAM` hay `TABLE` chính là quyết định `KStream` hay `KTable` ở [bài 2](02-kstream-ktable-globalktable.md) — cùng câu hỏi, cùng hệ quả.

### Join và cửa sổ trong ksqlDB

```sql
-- KStream ⋈ KTable — làm giàu
CREATE STREAM enriched_orders AS
SELECT o.order_id, o.amount, c.customer_name, c.tier
FROM   orders o
LEFT JOIN customers c ON o.customer_id = c.customer_id
EMIT CHANGES;

-- KStream ⋈ KStream — bắt buộc có WITHIN
CREATE STREAM order_payments AS
SELECT o.order_id, o.amount, p.payment_id
FROM   orders o
INNER JOIN payments p WITHIN 30 MINUTES ON o.order_id = p.order_id
EMIT CHANGES;
```

`WITHIN 30 MINUTES` chính là `JoinWindows.ofTimeDifference(...)`. **Yêu cầu đồng phân vùng vẫn còn nguyên** ([bài 6](06-join-trong-kafka-streams.md)) — ksqlDB không xoá được ràng buộc vật lý đó, chỉ giấu nó đi.

Bốn loại cửa sổ đều có:

```sql
WINDOW TUMBLING (SIZE 5 MINUTES)
WINDOW HOPPING  (SIZE 5 MINUTES, ADVANCE BY 1 MINUTE)
WINDOW SESSION  (30 MINUTES)
-- Sliding window có ở phiên bản mới
```

### So sánh ksqlDB và Kafka Streams

| Tiêu chí | Kafka Streams | ksqlDB |
|---|---|---|
| Ngôn ngữ | Java/Kotlin/Scala | **SQL** |
| Ai viết được | Lập trình viên JVM | **Cả người phân tích dữ liệu** |
| Triển khai | Ứng dụng của bạn | **Cụm ksqlDB riêng phải vận hành** |
| Kiểm soát chi tiết | **Toàn quyền** | Giới hạn trong cú pháp SQL |
| Logic nghiệp vụ phức tạp | **Được** | Phải viết UDF bằng Java |
| Kiểm thử | JUnit, TopologyTestDriver | Khó hơn nhiều |
| Quản lý phiên bản (git) | **Tự nhiên** | Phải tự tổ chức file SQL |
| Gỡ lỗi | Debugger, stack trace | **Khó** |
| Tốc độ thử nghiệm | Biên dịch, đóng gói, chạy | **Gõ câu SQL là chạy ngay** |
| Tích hợp Spring | **Rất tốt** | Qua REST API |

### Điểm cần cân nhắc nhất: ksqlDB cần một cụm riêng

Đây là điều làm mất đi lợi thế lớn nhất của Kafka Streams đã nói ở [bài 1](01-kafka-streams-la-gi.md):

```text
   KAFKA STREAMS
   Ứng dụng của bạn ─────► Kafka
   (không có gì thêm phải vận hành)

   ksqlDB
   Câu SQL ──► CỤM ksqlDB ──► Kafka
                 ▲
        phải cài, giám sát, nâng cấp, scale, backup
        → đúng thứ mà Kafka Streams sinh ra để tránh
```

Nên nếu lý do bạn chọn Kafka Streams là *"không muốn vận hành thêm cụm nào"*, thì ksqlDB **không** giữ được lợi thế đó.

### Khi nào chọn ksqlDB

```text
   CHỌN ksqlDB khi:
     • Đội có người phân tích dữ liệu biết SQL nhưng không viết Java
     • Cần thử nghiệm nhanh, khám phá dữ liệu
     • Logic đơn giản: lọc, gộp, join cơ bản
     • Đã chấp nhận vận hành cụm ksqlDB (hoặc dùng Confluent Cloud)

   CHỌN Kafka Streams khi:
     • Logic nghiệp vụ phức tạp, cần code thật
     • Muốn kiểm thử và quản lý phiên bản chuẩn mực
     • Muốn nhúng vào microservice Spring Boot đang có
     • KHÔNG muốn vận hành thêm cụm nào
```

Và lựa chọn thứ ba rất thực dụng: **dùng cả hai**. ksqlDB cho khám phá và các luồng đơn giản; Kafka Streams cho phần lõi nghiệp vụ.

## Khi nào KHÔNG nên dùng Kafka Streams

Phần này quan trọng hơn phần trên.

### 1. Đầu ra không phải Kafka

```text
   Kafka Streams:  Kafka VÀO  →  Kafka RA.  Bắt buộc.
```

Nếu kết quả cuối cùng phải ghi vào PostgreSQL, gọi API thanh toán, hay gửi email — **Kafka Streams không làm được**.

Người ta hay lách bằng cách gọi thẳng trong processor:

```java
// ĐỪNG LÀM THẾ NÀY
.foreach((key, order) -> {
    jdbcTemplate.update("INSERT INTO orders ...", order);
    emailService.send(order.getEmail());
});
```

Bốn vấn đề, và cả bốn đều nghiêm trọng:

| Vấn đề | Chi tiết |
|---|---|
| **Chặn luồng xử lý** | Lời gọi chậm chặn cả task → quá hạn poll → rebalance vô tận |
| **Không có transaction** | EOS của Kafka **không bao trùm** database ngoài |
| **Không thử lại được** | Lỗi trong processor không có cơ chế retry/DLQ như `@KafkaListener` |
| **Chạy lại khi khôi phục** | Khôi phục trạng thái phát lại dữ liệu → **gửi email hai lần** |

Cách đúng:

```text
   Kafka Streams (tính toán)  ──►  topic kết quả  ──►  @KafkaListener (ghi DB, gọi API)
                                                       hoặc Sink Connector
```

### 2. Không cần trạng thái

Nếu chỉ lọc và biến đổi từng message độc lập, `@KafkaListener` đơn giản hơn nhiều: dễ test, dễ debug, dễ xử lý lỗi, không có state store, không có topic nội bộ, không có rebalance dài.

Đừng dùng Kafka Streams chỉ vì nó "hiện đại hơn".

### 3. Trạng thái quá lớn

```text
   State store 200 GB, 12 partition → mỗi instance ~17 GB đĩa
        │
        ├─ Khôi phục sau sự cố: hàng chục phút tới hàng giờ
        ├─ Cần standby replica → gấp đôi đĩa
        └─ Mỗi lần rebalance là một sự kiện đau đớn
```

Trên khoảng vài chục GB mỗi instance, hãy cân nhắc **Flink với kho trạng thái ngoài** (điểm kiểm tra lên S3), hoặc tra cứu database thay vì giữ trạng thái cục bộ.

### 4. Cần truy vấn tuỳ ý

Interactive Query chỉ tra **theo key**. Không có `WHERE amount > X`, không có `ORDER BY`, không có join tuỳ biến lúc chạy.

Nếu người dùng cần lọc, sắp xếp, phân trang — hãy đẩy kết quả sang Elasticsearch hoặc một kho dữ liệu, rồi truy vấn ở đó.

### 5. Đội không dùng JVM

**Kafka Streams chỉ có cho JVM.** Không có bản chính thức cho Python, Go, .NET, Rust. Đội Python thì lựa chọn là ksqlDB, Flink (PyFlink), hoặc Faust.

### 6. Xử lý theo lô trên dữ liệu lịch sử lớn

Kafka Streams tối ưu cho **luồng liên tục**. Chạy lại 2 năm dữ liệu qua nó thì được, nhưng chậm hơn nhiều so với Spark đọc thẳng từ kho dữ liệu — và tốn retention Kafka rất lớn.

### 7. Cần join với dữ liệu đổi rất nhanh và không có ngữ nghĩa thời gian

GlobalKTable **không tôn trọng event time** ([bài 2](02-kstream-ktable-globalktable.md)). Nếu bảng tra cứu đổi nhiều lần mỗi giây và bạn cần "giá trị tại đúng thời điểm sự kiện", GlobalKTable cho kết quả sai. KTable thì đúng nhưng cần đồng phân vùng.

## Bảng quyết định tổng hợp

| Bài toán | Công cụ đúng |
|---|---|
| Lọc/biến đổi từng message, ghi vào DB | **`@KafkaListener`** |
| Chép dữ liệu DB ↔ Kafka, không biến đổi | **Kafka Connect** |
| Đếm, gộp, join, cửa sổ — Kafka vào Kafka ra | **Kafka Streams** |
| Như trên nhưng đội biết SQL, không biết Java | **ksqlDB** |
| Trạng thái hàng trăm GB | **Flink** với kho trạng thái ngoài |
| Nhiều nguồn không phải Kafka | **Flink** |
| Xử lý lô trên dữ liệu lịch sử lớn | **Spark** |
| Truy vấn tuỳ ý trên kết quả | **Streams/ksqlDB → Elasticsearch** |
| Đội Python | **ksqlDB, PyFlink, Faust** |

## Kiến trúc điển hình — ghép mọi thứ lại

Đây là hình dung cuối cùng, gom toàn bộ khoá học:

```text
   ┌──────────────┐
   │  PostgreSQL  │
   └──────┬───────┘
          │ Debezium (Kafka Connect Source, đọc WAL)
          ▼
   ┌──────────────────────────────────────────────────────────┐
   │                    KAFKA                                  │
   │  orders  customers  payments  ...                        │
   └───┬──────────────────────────────────────────┬───────────┘
       │                                           │
       │ Kafka Streams                             │ @KafkaListener
       │ (làm giàu, gộp, phát hiện gian lận)       │ (gửi email, gọi API)
       ▼                                           ▼
   ┌──────────────────────┐                  ┌──────────────┐
   │ topic kết quả        │                  │ Dịch vụ ngoài│
   │ enriched-orders      │                  └──────────────┘
   │ fraud-alerts         │
   │ customer-stats       │
   └───┬──────────────┬───┘
       │              │
       │ Connect Sink │ Interactive Query
       ▼              ▼
   ┌──────────────┐  ┌──────────────┐
   │Elasticsearch │  │  REST API    │
   │ (truy vấn    │  │  (tra theo   │
   │  tuỳ ý)      │  │   key)       │
   └──────────────┘  └──────────────┘
```

Mỗi công cụ làm đúng việc của nó:

| Thành phần | Việc |
|---|---|
| **Debezium / Connect Source** | Đưa dữ liệu vào Kafka, **không viết code** |
| **Kafka Streams** | Tính toán có trạng thái, Kafka vào Kafka ra |
| **`@KafkaListener`** | Tác dụng phụ ra thế giới ngoài, có retry và DLQ |
| **Connect Sink** | Đẩy kết quả sang hệ thống truy vấn |
| **Interactive Query** | API tra cứu nhanh theo key, không cần DB |

## Lộ trình học tiếp

| Chủ đề | Vì sao đáng học tiếp |
|---|---|
| **TopologyTestDriver** | Kiểm thử Kafka Streams **không cần broker** — nhanh và tất định |
| **Processor API** | Tầng thấp hơn DSL: kiểm soát trực tiếp state store, bộ đếm giờ (punctuator) |
| **Schema Registry + Avro** | Kiểm soát tiến hoá schema — bắt buộc khi có nhiều đội cùng dùng topic |
| **Cruise Control** | Tự cân bằng partition trong cụm |
| **Tiered Storage** (KIP-405) | Đẩy dữ liệu cũ sang S3, giữ retention rất dài với chi phí thấp |
| **Apache Flink** | Khi vượt giới hạn của Kafka Streams |

Trong đó **TopologyTestDriver** đáng học ngay:

```java
@Test
void tinh_dung_doanh_thu_theo_san_pham() {
    Topology topology = buildTopology();
    try (TopologyTestDriver driver = new TopologyTestDriver(topology, props)) {

        TestInputTopic<String, Order> input = driver.createInputTopic(
                "orders", Serdes.String().serializer(), orderSerde.serializer());
        TestOutputTopic<String, BigDecimal> output = driver.createOutputTopic(
                "product-revenue", Serdes.String().deserializer(), decimalSerde.deserializer());

        // Điều khiển được THỜI GIAN SỰ KIỆN — thứ không làm được với broker thật
        input.pipeInput("KH-042", donHang("SP-1", 100_000), Instant.parse("2025-08-08T10:00:00Z"));
        input.pipeInput("KH-042", donHang("SP-1", 200_000), Instant.parse("2025-08-08T10:00:30Z"));

        assertThat(output.readKeyValue())
                .isEqualTo(KeyValue.pair("SP-1", new BigDecimal("300000")));
    }
}
```

Không cần Kafka, không cần Docker, chạy trong mili giây, và **điều khiển được thời gian sự kiện** — điều gần như không làm được với broker thật. Đây là cách đúng để kiểm thử logic cửa sổ và join.

## Tóm tắt bài 8

- **ksqlDB không phải công nghệ khác** — nó **biên dịch câu SQL thành topology Kafka Streams**. Mọi khái niệm KStream/KTable/cửa sổ/join/đồng phân vùng đều còn nguyên, chỉ giấu đi.
- Hai loại truy vấn: **push query** (`EMIT CHANGES`, chạy mãi — chính là ứng dụng Streams) và **pull query** (tra một giá trị rồi trả về — chính là Interactive Query).
- Điểm cân nhắc lớn nhất: **ksqlDB cần một cụm riêng phải vận hành** — đúng thứ mà Kafka Streams sinh ra để tránh. Nếu lý do bạn chọn Streams là "không muốn thêm cụm", ksqlDB không giữ được lợi thế đó.
- **Bảy trường hợp KHÔNG nên dùng Kafka Streams**: đầu ra không phải Kafka; không cần trạng thái; trạng thái quá lớn (vài chục GB/instance); cần truy vấn tuỳ ý; đội không dùng JVM; xử lý lô trên dữ liệu lịch sử lớn; cần ngữ nghĩa thời gian với bảng tra cứu đổi nhanh.
- **Đừng gọi database hay API trong processor.** Bốn lý do: chặn luồng xử lý, không có transaction bao trùm, không có retry/DLQ, và **khôi phục trạng thái sẽ phát lại → gửi email hai lần**. Cách đúng là ghi ra topic rồi để `@KafkaListener` hoặc Sink Connector xử lý.
- Kiến trúc điển hình dùng **cả bốn công cụ**: Connect đưa dữ liệu vào, Streams tính toán, `@KafkaListener` gây tác dụng phụ ra ngoài, Connect Sink đẩy kết quả sang hệ thống truy vấn.
- **`TopologyTestDriver`** là công cụ đáng học ngay: kiểm thử không cần broker, chạy trong mili giây, và **điều khiển được thời gian sự kiện** — cách duy nhất kiểm thử logic cửa sổ một cách tất định.

**Quay lại** → [Mục lục khoá Kafka Java](../README.md)

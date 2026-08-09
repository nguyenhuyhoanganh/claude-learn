# Bài 8: Header, Interceptor và Quota — ba thứ ít dùng nhưng cứu bạn khi cần

Ba tính năng trong bài này có chung một đặc điểm: bạn có thể dùng Kafka nhiều năm mà không đụng tới chúng, rồi đến một ngày gặp đúng bài toán mà **không có chúng thì không có cách nào giải sạch sẽ**.

- **Header** — gắn metadata vào bản ghi mà không phải nhét vào payload nghiệp vụ.
- **Interceptor** — móc vào đường đi của mọi message mà không sửa code nghiệp vụ.
- **Quota** — chặn một client ngốn hết năng lực của cả cụm.

---

## Header — metadata tách khỏi payload

### Bài toán

Bạn cần gắn `traceId` vào mỗi message để truy vết một request đi qua năm dịch vụ. Cách hiển nhiên là nhét vào payload:

```java
// Cách hiển nhiên, và nó có ba vấn đề
public record OrderEvent(
    String orderId,
    BigDecimal amount,
    String traceId,        // ✗ không phải dữ liệu nghiệp vụ
    String sourceService,  // ✗
    Instant publishedAt    // ✗
) {}
```

| Vấn đề | Chi tiết |
|---|---|
| **Ô nhiễm mô hình nghiệp vụ** | `traceId` không phải thuộc tính của đơn hàng. Mọi consumer đều phải biết về nó |
| **Phải giải tuần tự hoá mới đọc được** | Muốn lọc theo `traceId` thì phải parse toàn bộ JSON/Avro |
| **Đổi schema** | Thêm một trường hạ tầng = đổi schema nghiệp vụ, ảnh hưởng mọi bên |

### Header giải quyết đúng chỗ đó

```text
   ┌──────────────── KAFKA RECORD ────────────────┐
   │  key       │  byte[]                          │
   │  value     │  byte[]   ← được nén, được serde │
   │  timestamp │  long                            │
   │  HEADERS   │  danh sách (String, byte[])      │
   │            │   ▲                              │
   │            │   KHÔNG đi qua serializer của    │
   │            │   value, đọc được mà KHÔNG cần   │
   │            │   giải tuần tự hoá payload       │
   └──────────────────────────────────────────────┘
```

```java
ProducerRecord<String, OrderEvent> record =
        new ProducerRecord<>("order-events", order.customerId(), order);

record.headers()
      .add("trace-id",       traceId.getBytes(UTF_8))
      .add("source-service", "order-service".getBytes(UTF_8))
      .add("schema-version", "2".getBytes(UTF_8))
      .add("content-type",   "application/json".getBytes(UTF_8));

producer.send(record);
```

Đọc ở consumer:

```java
@KafkaListener(topics = "order-events")
public void onOrder(@Payload OrderEvent order,
                    @Header(name = "trace-id", required = false) byte[] traceId) {

    MDC.put("traceId", traceId == null ? "unknown" : new String(traceId, UTF_8));
    try {
        orderService.xuLy(order);
    } finally {
        MDC.clear();
    }
}
```

Hoặc lấy toàn bộ khi cần linh hoạt:

```java
public void onOrder(ConsumerRecord<String, OrderEvent> record) {
    for (Header h : record.headers()) {
        log.debug("{} = {}", h.key(), new String(h.value(), UTF_8));
    }
}
```

### Bốn việc header làm tốt nhất

| Việc | Header dùng để |
|---|---|
| **Truy vết phân tán** | `traceId`, `spanId` — chuẩn W3C Trace Context dùng header `traceparent` |
| **Phiên bản schema** | `schema-version` để consumer biết cách parse trước khi parse |
| **Định tuyến và lọc** | Broker không lọc theo header, nhưng consumer bỏ qua được message **không cần giải tuần tự hoá value** |
| **Metadata Dead Letter Queue** | Lý do thất bại, số lần đã thử, topic gốc, offset gốc |

Việc cuối là chỗ Spring Kafka dùng header mạnh nhất — khi một message bị đẩy sang DLQ, nó tự gắn:

```bash
kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic order-events.DLT --property print.headers=true --max-messages 1
```

```text
kafka_dlt-original-topic:order-events
kafka_dlt-original-partition:2
kafka_dlt-original-offset:18437
kafka_dlt-exception-fqcn:org.springframework.messaging.converter.MessageConversionException
kafka_dlt-exception-message:Cannot convert from [String] to [OrderEvent]
```

Nhờ vậy bạn biết chính xác message hỏng đến từ đâu và vì sao — mà **không phải đọc payload**. Chi tiết ở [Phase 13 bài 2](../phase-13-error-handling/02-retryable-nonretryable-dlq.md).

### Ba giới hạn cần biết

```text
   1. Header KHÔNG được nén.
      → 20 header × 100 byte = 2 KB metadata cho một message 500 byte
      → tỉ lệ overhead rất xấu với message nhỏ

   2. Header KHÔNG được đánh chỉ mục.
      → broker không lọc theo header được
      → muốn lọc thì consumer phải đọc hết rồi tự bỏ

   3. Header là byte[] thuần.
      → không có kiểu dữ liệu, tự quy ước mã hoá
      → sai bảng mã là ra ký tự lạ, không có lỗi nào báo
```

> **Quy tắc**: header dành cho **metadata hạ tầng** (truy vết, phiên bản, chẩn đoán). Dữ liệu nghiệp vụ luôn thuộc về **value**. Nếu consumer cần một trường để **ra quyết định nghiệp vụ**, trường đó phải nằm trong value.

---

## Interceptor — móc vào mọi message mà không sửa code nghiệp vụ

### Bài toán

Bạn cần đo tỉ lệ gửi thất bại và độ trễ cho **mọi** producer trong 30 microservice. Sửa từng chỗ gọi `send()` là không khả thi.

### ProducerInterceptor có hai móc

```java
public class MetricsInterceptor implements ProducerInterceptor<String, Object> {

    private static final Logger log = LoggerFactory.getLogger(MetricsInterceptor.class);
    private MeterRegistry registry;

    @Override
    public ProducerRecord<String, Object> onSend(ProducerRecord<String, Object> record) {
        // Chạy TRƯỚC khi record vào bộ đệm, TRÊN LUỒNG GỌI send()
        // Trả về record — có thể là bản đã sửa
        record.headers().add("published-at",
                Long.toString(System.currentTimeMillis()).getBytes(UTF_8));
        registry.counter("kafka.producer.sent", "topic", record.topic()).increment();
        return record;
    }

    @Override
    public void onAcknowledgement(RecordMetadata metadata, Exception exception) {
        // Chạy KHI broker trả ACK (hoặc khi gửi thất bại)
        // CHẠY TRÊN LUỒNG I/O CỦA PRODUCER — xem cảnh báo bên dưới
        if (exception != null) {
            registry.counter("kafka.producer.failed",
                    "topic", metadata == null ? "unknown" : metadata.topic()).increment();
            log.error("Gửi thất bại", exception);
            return;
        }
        registry.counter("kafka.producer.acked", "topic", metadata.topic()).increment();
    }

    @Override public void close() { }

    @Override
    public void configure(Map<String, ?> configs) {
        this.registry = (MeterRegistry) configs.get("meter.registry");
    }
}
```

```yaml
spring:
  kafka:
    producer:
      properties:
        interceptor.classes: com.acme.MetricsInterceptor,com.acme.TracingInterceptor
```

Nhiều interceptor chạy **theo đúng thứ tự khai báo**, và output của cái trước là input của cái sau.

### Đường đi chính xác của hai móc

```text
   Luồng ứng dụng gọi producer.send(record)
        │
        ▼
   ┌─────────────────────────────────────────┐
   │  onSend()   ← CHẠY Ở ĐÂY                │  luồng ứng dụng
   │  (sửa được record, thêm header được)    │
   └────────────────┬────────────────────────┘
                    ▼
              Serializer → Partitioner → RecordAccumulator
                    │
   ─────────────────┼──── ranh giới luồng ──────────────────
                    ▼
              Sender thread gửi đi, chờ broker trả lời
                    │
                    ▼
   ┌─────────────────────────────────────────┐
   │  onAcknowledgement()  ← CHẠY Ở ĐÂY      │  LUỒNG I/O
   │  (chỉ đọc kết quả, không sửa được gì)   │  CỦA PRODUCER
   └─────────────────────────────────────────┘
```

> **Cảnh báo quan trọng nhất**: `onAcknowledgement` chạy trên **luồng I/O của producer** — chính luồng gửi mọi message. Một lời gọi database hay HTTP trong đó sẽ **chặn toàn bộ việc gửi của producer**. Chỉ làm việc rất nhẹ: tăng bộ đếm, ghi log. Cần xử lý nặng thì đẩy vào hàng đợi rồi để luồng khác lo.

### ConsumerInterceptor

```java
public class ConsumerMetricsInterceptor implements ConsumerInterceptor<String, Object> {

    @Override
    public ConsumerRecords<String, Object> onConsume(ConsumerRecords<String, Object> records) {
        for (ConsumerRecord<String, Object> r : records) {
            long tre = System.currentTimeMillis() - r.timestamp();
            registry.timer("kafka.consumer.lag.time", "topic", r.topic())
                    .record(tre, TimeUnit.MILLISECONDS);
        }
        return records;
    }

    @Override
    public void onCommit(Map<TopicPartition, OffsetAndMetadata> offsets) { }

    @Override public void close() { }
    @Override public void configure(Map<String, ?> configs) { }
}
```

`onConsume` đo được **độ trễ đầu-cuối thật** (từ lúc producer tạo record tới lúc consumer nhận), thứ mà chỉ số lag theo offset không cho biết.

### Khi nào dùng interceptor, khi nào không

| Nên dùng | Không nên dùng |
|---|---|
| Đo lường và chỉ số kỹ thuật | **Logic nghiệp vụ** — sẽ thành logic ẩn không ai tìm ra |
| Truyền ngữ cảnh truy vết (`traceId`) | **Biến đổi dữ liệu** — dùng `Processor`/`Transformer` |
| Kiểm toán: ai gửi cái gì lúc nào | Bất cứ việc gì **chậm** |
| Thêm header hạ tầng chung | Việc chỉ áp dụng cho **một** topic (dùng code thường) |

> Điểm mạnh của interceptor là **áp dụng cho mọi message mà code nghiệp vụ không biết gì**. Đó cũng chính là điểm yếu: khi có bug, người đọc code sẽ **không thấy** interceptor tồn tại. Chỉ đặt vào đó những thứ có thể tắt đi mà nghiệp vụ vẫn đúng.

---

## Quota — chặn một client làm nghẹt cả cụm

### Bài toán

Một dịch vụ chạy đợt nhập dữ liệu đẩy 500 MB/s vào cụm. Cụm chịu được, nhưng độ trễ của **mọi dịch vụ khác** tăng vọt vì tranh nhau băng thông và I/O đĩa.

Đây là bài toán "hàng xóm ồn ào", và không có quota thì không có cách nào giải ở tầng Kafka.

### Ba loại quota

| Loại | Giới hạn cái gì | Đơn vị |
|---|---|---|
| **`producer_byte_rate`** | Tốc độ **ghi** | byte/giây |
| **`consumer_byte_rate`** | Tốc độ **đọc** | byte/giây |
| **`request_percentage`** | Tỉ lệ **thời gian xử lý** của broker | phần trăm |

Loại thứ ba ít người biết nhưng rất hữu ích: nó chặn client gửi hàng triệu request nhỏ — thứ mà giới hạn theo byte không bắt được.

### Đặt quota

```bash
# Giới hạn theo client.id
kafka-configs.sh --bootstrap-server localhost:9092 --alter \
  --add-config 'producer_byte_rate=104857600,consumer_byte_rate=209715200,request_percentage=200' \
  --entity-type clients --entity-name etl-job

# Giới hạn theo user (khi đã bật xác thực)
kafka-configs.sh --bootstrap-server localhost:9092 --alter \
  --add-config 'producer_byte_rate=52428800' \
  --entity-type users --entity-name analytics-team

# Mặc định cho MỌI client chưa có quota riêng
kafka-configs.sh --bootstrap-server localhost:9092 --alter \
  --add-config 'producer_byte_rate=10485760' \
  --entity-type clients --entity-default

# Xem quota đang áp dụng
kafka-configs.sh --bootstrap-server localhost:9092 --describe --entity-type clients
```

```text
Quota configs for client-id 'etl-job' are
  consumer_byte_rate=209715200, producer_byte_rate=104857600, request_percentage=200
```

> **Lưu ý về `request_percentage`**: giá trị `200` nghĩa là **hai luồng xử lý đầy đủ** (mỗi luồng = 100%), không phải 200% của một luồng. Trần là `num.io.threads × 100`.

### Cơ chế cưỡng chế — điểm khác biệt so với tường lửa

Kafka **không từ chối** request khi vượt quota. Nó **làm chậm** lại:

```text
   Client gửi 150 MB trong 1 giây, quota là 100 MB/s
        │
        ▼
   Broker VẪN NHẬN và VẪN XỬ LÝ toàn bộ 150 MB
        │
        ▼
   Nhưng TRÌ HOÃN gửi phản hồi lại
        │
        ▼
   throttle_time_ms = 500     ← "tôi giữ anh lại nửa giây"
        │
        ▼
   Client thấy phản hồi chậm → tự giảm tốc độ gửi
```

Quota manager dùng **cửa sổ trượt** để tính:

```properties
quota.window.num=11              # số mẫu giữ lại
quota.window.size.seconds=1      # mỗi mẫu 1 giây
                                 # → tổng cửa sổ ~11 giây
```

Nhờ cửa sổ trượt, một đợt tăng vọt ngắn **không bị phạt ngay** — chỉ khi tốc độ trung bình vượt ngưỡng thì mới bắt đầu trì hoãn. Đây là lựa chọn cố ý: phạt cứng ngay lập tức sẽ làm hỏng những đợt gửi theo lô hợp lệ.

Ba hệ quả của cách cưỡng chế này:

| Hệ quả | Ý nghĩa |
|---|---|
| **Không mất message** | Khác hẳn tường lửa hay bộ giới hạn tốc độ HTTP — Kafka nhận hết rồi mới làm chậm |
| **Client không cần biết gì** | Không phải bắt lỗi, không phải thử lại. Nó chỉ thấy chậm hơn |
| **Client tồi vẫn có thể bỏ qua** | Client tự viết mà không đọc `throttle_time_ms` vẫn có thể gửi tiếp — quota bảo vệ **broker**, không phải một hợp đồng cứng |

### Theo dõi throttle

```text
   Chỉ số JMX:
   kafka.server:type=Produce,client-id=<id>    → produce-throttle-time-avg
   kafka.server:type=Fetch,client-id=<id>      → fetch-throttle-time-avg
   kafka.server:type=Request,client-id=<id>    → request-throttle-time-avg
```

Từ phía client, Java client cũng phơi ra:

```text
   produce-throttle-time-avg / produce-throttle-time-max
   fetch-throttle-time-avg   / fetch-throttle-time-max
```

> **Cách chẩn đoán rất hữu ích**: nếu ứng dụng của bạn "tự nhiên chậm" mà broker vẫn khoẻ, `UnderReplicatedPartitions` bằng 0, thì hãy kiểm tra `produce-throttle-time-avg`. Rất nhiều lần nguyên nhân là ai đó đã đặt quota mà đội ứng dụng không biết.

### Chiến lược đặt quota thực tế

```text
   BƯỚC 1  Đặt quota MẶC ĐỊNH rộng rãi cho mọi client
           → lưới an toàn, chặn client mới viết sai làm sập cụm

   BƯỚC 2  Đo thực tế 2 tuần, xem client nào dùng bao nhiêu
           → kafka.server:type=BrokerTopicMetrics, hoặc chỉ số client

   BƯỚC 3  Cấp quota RIÊNG cho client cần nhiều hơn mặc định
           → và ghi lại lý do, để 6 tháng sau còn biết vì sao

   BƯỚC 4  Cảnh báo khi throttle-time > 0 kéo dài
           → nghĩa là quota đang thật sự bó, cần xem lại
```

Điều kiện tiên quyết: **mọi client phải đặt `client.id` có ý nghĩa**. Không có nó thì quota không phân biệt được ai với ai.

```yaml
spring:
  kafka:
    producer:
      client-id: order-service-producer
    consumer:
      client-id: inventory-service-consumer
```

Đây là thói quen nên có từ đầu, vì `client.id` còn giúp đọc log broker và chỉ số dễ hơn rất nhiều.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Nhét metadata hạ tầng vào payload nghiệp vụ | Ô nhiễm mô hình, đổi schema ảnh hưởng mọi bên | Dùng **header** |
| Đặt dữ liệu **nghiệp vụ** vào header | Consumer phải đọc hai chỗ; header không được nén, không đánh chỉ mục | Dữ liệu nghiệp vụ luôn ở **value** |
| Nhiều header trên message nhỏ | 2 KB header cho message 500 byte — tỉ lệ overhead rất xấu | Chỉ giữ header thật sự cần |
| Gọi database/HTTP trong `onAcknowledgement` | **Chặn luồng I/O của producer** → mọi message chậm theo | Chỉ tăng bộ đếm, ghi log |
| Đặt logic nghiệp vụ vào interceptor | Logic ẩn, người đọc code không thấy | Chỉ đặt thứ tắt đi mà nghiệp vụ vẫn đúng |
| Quên đặt `client.id` | **Quota không phân biệt được client nào** | Đặt `client.id` có ý nghĩa cho mọi producer và consumer |
| Tưởng vượt quota là bị từ chối | Không — Kafka **nhận hết rồi làm chậm** phản hồi | Đọc `throttle_time_ms` |
| Đặt quota rồi không cảnh báo throttle | Ứng dụng chậm bí ẩn, không ai biết vì sao | Theo dõi `produce-throttle-time-avg` |
| Đặt quota quá chặt ngay từ đầu | Ứng dụng hợp lệ bị bó, đội ứng dụng mất thời gian tìm nguyên nhân | Bắt đầu rộng, đo rồi siết dần |
| Chỉ đặt `producer_byte_rate`, quên `request_percentage` | Client gửi hàng triệu request nhỏ vẫn làm nghẹt broker | Đặt cả ba loại |

---

## Tóm tắt bài 8

- **Header** là metadata gắn vào bản ghi, **không đi qua serializer của value và không được nén** — nên đọc được mà không phải giải tuần tự hoá payload.
- Bốn việc header làm tốt: **truy vết phân tán**, **phiên bản schema**, **lọc rẻ ở consumer**, và **metadata DLQ** (Spring Kafka tự gắn `kafka_dlt-*`).
- Giới hạn của header: **không được nén**, **không được đánh chỉ mục** (broker không lọc theo header), và là **`byte[]` thuần** không có kiểu.
- Quy tắc: header cho **metadata hạ tầng**; dữ liệu để **ra quyết định nghiệp vụ** luôn thuộc về value.
- **`ProducerInterceptor` có hai móc**: `onSend` (luồng ứng dụng, **sửa được record**) và `onAcknowledgement` (**luồng I/O của producer**, chỉ đọc).
- **Đừng gọi database hay HTTP trong `onAcknowledgement`** — nó chặn luồng gửi của toàn bộ producer.
- Interceptor mạnh vì **code nghiệp vụ không biết nó tồn tại** — và đó cũng là điểm yếu. Chỉ đặt vào đó thứ tắt đi mà nghiệp vụ vẫn đúng.
- **Quota** có ba loại: `producer_byte_rate`, `consumer_byte_rate`, và **`request_percentage`** (chặn client gửi hàng triệu request nhỏ — thứ giới hạn theo byte không bắt được).
- **Kafka không từ chối request vượt quota — nó trì hoãn phản hồi** (`throttle_time_ms`), dùng **cửa sổ trượt ~11 giây** nên đợt tăng vọt ngắn không bị phạt. Hệ quả: **không mất message**, và client không cần xử lý lỗi gì.
- **Quota chỉ hoạt động khi client có `client.id`** — đặt thói quen này từ đầu.
- Chẩn đoán đáng nhớ: ứng dụng chậm mà broker khoẻ và `UnderReplicatedPartitions` bằng 0 → kiểm tra **`produce-throttle-time-avg`**.

**Quay lại** → [Mục lục khoá Kafka Java](../README.md)

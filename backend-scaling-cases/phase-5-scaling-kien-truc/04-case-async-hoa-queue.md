# Case 4: Async hoá bằng hàng đợi — đổi tính tức thời lấy khả năng chịu tải

Đây là kỹ thuật có tác động lớn nhất trong toàn bộ khoá học. Nó không tối ưu vài chục phần trăm — nó thay đổi bậc độ lớn của những gì hệ thống chịu được.

Cũng vì thế, nó là kỹ thuật có đánh đổi lớn nhất.

## Vấn đề: mọi thứ đều đồng bộ

```java
@PostMapping("/orders")
public OrderResponse placeOrder(@RequestBody OrderRequest req) {
    Order order = orderService.create(req);              //   20 ms
    inventoryClient.reserve(req.getItems());             //  150 ms
    PaymentResult pay = paymentClient.charge(req);       //  800 ms
    emailService.sendConfirmation(order);                //  400 ms
    smsService.sendNotification(order);                  //  300 ms
    analyticsClient.track(order);                        //  100 ms
    warehouseClient.notify(order);                       //  200 ms
    loyaltyClient.addPoints(order);                      //  120 ms
    return OrderResponse.of(order);
}                                                        // TỔNG: 2.090 ms
```

Ba vấn đề cùng lúc:

```text
   1. Người dùng chờ 2 giây.
   2. Định luật Little: 500 RPS × 2,09 giây = 1.045 thread cần thiết.
      Có 200 → chỉ phục vụ được 95 RPS.
   3. BẤT KỲ service nào trong 7 cái hỏng đều làm hỏng cả đơn hàng.
      Khả dụng = 0,999^7 = 99,3% → 5 giờ mất dịch vụ mỗi tháng.
```

Và điều phi lý nhất: **gửi email chậm làm khách hàng không đặt được hàng.**

## Câu hỏi phân loại

Với mỗi bước, hỏi một câu duy nhất:

> **"Nếu bước này thất bại, đơn hàng có được coi là thất bại không?"**

```text
   ĐỒNG BỘ — bắt buộc, nếu hỏng thì đơn hàng hỏng:
   ├─ Tạo đơn hàng            (phải có ID trả về cho khách)
   ├─ Giữ hàng trong kho      (nếu hết hàng thì không nhận đơn)
   └─ (Thanh toán — tuỳ mô hình nghiệp vụ, xem bên dưới)

   BẤT ĐỒNG BỘ — làm sau, hỏng không ảnh hưởng đơn hàng:
   ├─ Gửi email xác nhận
   ├─ Gửi SMS
   ├─ Ghi nhận phân tích
   ├─ Thông báo kho vận
   ├─ Cộng điểm thưởng
   └─ Cập nhật gợi ý sản phẩm
```

```java
@PostMapping("/orders")
@Transactional
public OrderResponse placeOrder(@RequestBody OrderRequest req) {
    Order order = orderService.create(req);              //  20 ms
    inventoryService.reserve(req.getItems());            // 150 ms
    PaymentResult pay = paymentService.charge(req);      // 800 ms

    // Mọi thứ còn lại: chỉ ghi sự kiện, xử lý sau
    outbox.publish(new OrderPlacedEvent(order.getId()));  //  5 ms

    return OrderResponse.of(order);
}                                                        // TỔNG: 975 ms
```

```text
   2.090 ms → 975 ms   (giảm 53%)
   Số thread cần: 1.045 → 488
   Số phụ thuộc đồng bộ: 7 → 2  ⇒ khả dụng 99,3% → 99,8%
```

Đi xa hơn: nếu nghiệp vụ chấp nhận **"đơn hàng đang xử lý"**, đưa cả thanh toán ra ngoài:

```text
   975 ms → 175 ms   (nhanh gấp 12 lần so với ban đầu)
   Số thread cần: 488 → 88
   Phụ thuộc đồng bộ: chỉ còn database của chính mình
```

Đây là quyết định nghiệp vụ, không phải quyết định kỹ thuật. Phải có sự đồng ý của bộ phận kinh doanh — nhưng hãy trình bày đúng con số: **12 lần công suất** đổi lấy việc email xác nhận đến sau 3 giây thay vì ngay lập tức.

## Vấn đề nền tảng: dual write

Đoạn code trên có một lỗi nghiêm trọng nếu viết ngây thơ:

```java
@Transactional
public void placeOrder(OrderRequest req) {
    Order order = orderRepository.save(new Order(req));    // ghi database
    kafkaTemplate.send("orders", new OrderPlacedEvent(order));  // ghi Kafka
}
```

```text
   Kịch bản hỏng A: database commit OK, gửi Kafka THẤT BẠI
   ⇒ Đơn hàng tồn tại nhưng không ai gửi email, không ai giao hàng.

   Kịch bản hỏng B: gửi Kafka OK, database ROLLBACK
   ⇒ Email xác nhận cho một đơn hàng không tồn tại.
```

**Bạn không thể có transaction nguyên tử trên hai hệ thống khác nhau.** Đây là giới hạn cơ bản, không phải lỗi cấu hình.

## Giải pháp: mẫu Outbox

Ghi sự kiện vào **cùng database, cùng transaction** với dữ liệu nghiệp vụ. Một tiến trình riêng đọc và đẩy sang message broker.

```text
   ┌──────────── MỘT TRANSACTION ────────────┐
   │  INSERT INTO orders (...)               │
   │  INSERT INTO outbox_event (...)         │  ← nguyên tử, cùng database
   └─────────────────────────────────────────┘
                    ↓
        [Tiến trình đọc outbox]  ← chạy riêng
                    ↓
              [Kafka / RabbitMQ]
                    ↓
              [Các consumer]
```

```sql
CREATE TABLE outbox_event (
    id           BIGSERIAL PRIMARY KEY,
    aggregate_id VARCHAR(100) NOT NULL,
    event_type   VARCHAR(100) NOT NULL,
    payload      JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ,
    attempts     INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_pending ON outbox_event (created_at)
    WHERE published_at IS NULL;
```

```java
@Service
public class OrderService {
    @Transactional
    public Order placeOrder(OrderRequest req) {
        Order order = orderRepository.save(new Order(req));

        outboxRepository.save(new OutboxEvent(
            order.getId().toString(),
            "OrderPlaced",
            toJson(new OrderPlacedEvent(order))));

        return order;
    }
}

@Component
public class OutboxPublisher {
    @Scheduled(fixedDelay = 500)
    @SchedulerLock(name = "outboxPublisher", lockAtMostFor = "5m")
    public void publish() {
        List<OutboxEvent> events = outboxRepository.findUnpublished(100);
        for (OutboxEvent e : events) {
            try {
                kafkaTemplate.send(topicFor(e.getEventType()),
                                   e.getAggregateId(), e.getPayload()).get();
                outboxRepository.markPublished(e.getId());
            } catch (Exception ex) {
                outboxRepository.incrementAttempts(e.getId());
                log.warn("Không gửi được sự kiện {}", e.getId(), ex);
                break;                      // giữ thứ tự: dừng ở lỗi đầu tiên
            }
        }
    }
}
```

Đảm bảo mà outbox mang lại: **at-least-once** (ít nhất một lần). Sự kiện không bao giờ mất, nhưng **có thể gửi trùng** nếu tiến trình chết sau khi gửi mà trước khi đánh dấu.

Vì vậy **consumer bắt buộc phải idempotent** — case 7 dành trọn cho chủ đề này.

### Biến thể: CDC với Debezium

Thay vì tự viết tiến trình đọc bảng, dùng **Change Data Capture** — đọc trực tiếp write-ahead log của database:

```text
   [App] → INSERT vào orders + outbox_event (1 transaction)
                    ↓
            [PostgreSQL WAL / MySQL binlog]
                    ↓
              [Debezium connector]
                    ↓
                 [Kafka]
```

| Tiêu chí | Tự viết publisher | Debezium CDC |
|---|---|---|
| Độ trễ | 500 ms (theo chu kỳ polling) | ~10-50 ms |
| Tải lên database | Query polling liên tục | Gần như không |
| Độ phức tạp vận hành | Thấp | **Cao** (thêm Kafka Connect) |
| Đảm bảo thứ tự | Cần cẩn thận | Theo thứ tự WAL |
| Phù hợp với | Hệ thống vừa | Hệ thống lớn, nhiều sự kiện |

Bắt đầu bằng tự viết; chuyển sang CDC khi độ trễ hoặc tải polling thành vấn đề.

## Chọn công nghệ hàng đợi

| Tiêu chí | Kafka | RabbitMQ | AWS SQS | Bảng DB |
|---|---|---|---|---|
| Thông lượng | Rất cao (triệu/giây) | Cao (chục nghìn/giây) | Cao | Thấp (nghìn/giây) |
| Giữ lại sau khi đọc | **Có** (theo thời gian) | Không | Không | Có |
| Đảm bảo thứ tự | Trong partition | Trong queue | FIFO queue | Theo ID |
| Nhiều consumer group | **Có** | Cần cấu hình | Cần SNS fan-out | Tự làm |
| Định tuyến phức tạp | Không | **Rất mạnh** | Cơ bản | Tự làm |
| Phát lại (replay) | **Có** | Không | Không | Có |
| Vận hành | Nặng | Trung bình | Không cần (dịch vụ) | Không cần |

**Hướng dẫn chọn**:

- **Bắt đầu bằng bảng trong database** nếu dưới vài nghìn sự kiện/phút. Không thêm hạ tầng mới, transaction nguyên tử miễn phí, dễ debug bằng SQL.
- **RabbitMQ** khi cần định tuyến linh hoạt, ưu tiên message, hoặc mô hình công việc phân tán.
- **Kafka** khi cần thông lượng rất cao, nhiều consumer độc lập cùng đọc một luồng, hoặc cần phát lại lịch sử.
- **SQS/dịch vụ đám mây** khi không muốn vận hành gì cả.

Đừng dùng Kafka chỉ vì nó nổi tiếng. Vận hành một cụm Kafka đúng cách là công việc toàn thời gian.

## Xử lý thất bại — phần quan trọng nhất

Bất đồng bộ nghĩa là không ai đang chờ để nhận lỗi. Nếu không thiết kế xử lý thất bại, sự kiện lỗi sẽ **biến mất trong im lặng**.

### Retry với backoff

```java
@RetryableTopic(
    attempts = "4",
    backoff = @Backoff(delay = 1000, multiplier = 3.0, maxDelay = 60000),
    dltTopicSuffix = "-dlt",
    autoCreateTopics = "true"
)
@KafkaListener(topics = "orders")
public void handle(OrderPlacedEvent event) {
    emailService.sendConfirmation(event);
}

@DltHandler
public void handleDlt(OrderPlacedEvent event,
                      @Header(KafkaHeaders.EXCEPTION_MESSAGE) String error) {
    log.error("Sự kiện vào DLT: {} - {}", event, error);
    alertService.notifyOncall("Email xác nhận thất bại", event);
    failedEventRepository.save(new FailedEvent(event, error));
}
```

Spring Kafka tạo các topic retry riêng (`orders-retry-0`, `orders-retry-1`...) nên message lỗi **không chặn** các message khác — điểm rất quan trọng.

### Dead Letter Queue

**DLQ (Dead Letter Queue)** — nơi chứa message không xử lý được sau mọi lần thử.

DLQ không phải nơi vứt rác. Nó cần:

| Yêu cầu | Vì sao |
|---|---|
| **Cảnh báo khi có message mới** | Nếu không ai nhìn, DLQ vô dụng |
| **Công cụ xem nội dung** | Để chẩn đoán |
| **Nút phát lại (replay)** | Sau khi sửa lỗi, đẩy lại vào luồng chính |
| **Lưu kèm nguyên nhân lỗi** | Không có thì không biết vì sao |

```promql
# Cảnh báo cần có
kafka_consumergroup_lag{topic=~".*-dlt"} > 0
```

Kinh nghiệm thực tế: **DLQ không có cảnh báo là DLQ không tồn tại**. Rất nhiều hệ thống có hàng nghìn message nằm im trong DLQ hàng tháng trời mà không ai biết.

### Poison message

Một message gây lỗi vĩnh viễn (dữ liệu hỏng) sẽ retry mãi mãi và **chặn toàn bộ partition**.

```java
@KafkaListener(topics = "orders")
public void handle(ConsumerRecord<String, String> record) {
    try {
        OrderPlacedEvent event = objectMapper.readValue(record.value(), OrderPlacedEvent.class);
        process(event);
    } catch (JsonProcessingException e) {
        // Lỗi VĨNH VIỄN — đừng retry, đẩy thẳng vào DLQ
        dltProducer.send("orders-dlt", record.key(), record.value());
        log.error("Message hỏng tại offset {}", record.offset(), e);
    }
}
```

Quy tắc: phân biệt **lỗi tạm thời** (retry được) và **lỗi vĩnh viễn** (đẩy thẳng DLQ). Giống hệt nguyên tắc ở phase-4 case 1.

## Giám sát hệ thống bất đồng bộ

Chỉ số quan trọng nhất là **lag** — độ trễ giữa lúc sự kiện được tạo và lúc được xử lý.

```promql
# Consumer lag — số message chưa xử lý
kafka_consumergroup_lag{group="email-service"}

# Tốc độ tăng lag — quan trọng hơn giá trị tuyệt đối
deriv(kafka_consumergroup_lag[5m]) > 0

# Với outbox: tuổi của sự kiện cũ nhất chưa gửi
```

```sql
SELECT EXTRACT(EPOCH FROM (now() - MIN(created_at))) AS oldest_pending_seconds
FROM outbox_event WHERE published_at IS NULL;
```

Cảnh báo hiệu quả: **lag tăng đơn điệu trong 10 phút**. Nó nghĩa là consumer xử lý chậm hơn tốc độ sinh — nếu không can thiệp, lag sẽ tăng mãi.

Ba nguyên nhân của lag tăng:

| Nguyên nhân | Cách nhận biết | Xử lý |
|---|---|---|
| Consumer quá ít | CPU consumer cao | Thêm instance (tối đa = số partition) |
| Consumer chậm | CPU thấp, thời gian xử lý mỗi message cao | Tối ưu code, gom lô |
| Một partition nóng | Lag lệch giữa các partition | Đổi khoá phân vùng (phase-4 case 5) |

Lưu ý giới hạn cơ bản: **số consumer trong một group không vượt quá số partition**. Nếu topic có 12 partition, instance thứ 13 sẽ ngồi không. Phải tính trước số partition khi tạo topic — tăng partition sau sẽ phá vỡ đảm bảo thứ tự theo khoá.

## Trải nghiệm người dùng khi chuyển sang bất đồng bộ

Đây là phần kỹ thuật ít nói tới nhưng quyết định sự chấp nhận của bộ phận kinh doanh.

```text
   ĐỒNG BỘ: "Đặt hàng thành công! Mã đơn: #12345"

   BẤT ĐỒNG BỘ (làm ĐÚNG):
   "Đã nhận đơn hàng #12345.
    Đang xác nhận thanh toán... [thanh tiến trình]
    Chúng tôi sẽ báo bạn ngay khi xong."
    ↓ (WebSocket / polling / push)
   "Thanh toán thành công! Đơn hàng đang được chuẩn bị."

   BẤT ĐỒNG BỘ (làm SAI):
   "Đã nhận yêu cầu."     ← rồi im lặng, người dùng không biết chuyện gì
```

Ba yếu tố bắt buộc để bất đồng bộ không làm hỏng trải nghiệm:

1. **Phản hồi ngay** với mã tham chiếu — người dùng biết yêu cầu đã được ghi nhận.
2. **Cập nhật trạng thái** qua WebSocket, SSE, hoặc polling — người dùng thấy tiến trình.
3. **Thông báo kết quả cuối** qua kênh phù hợp (trong app, email, push).

Và quan trọng: **xử lý trường hợp thất bại sau khi đã nhận**. Nếu thanh toán thất bại sau 30 giây, phải có luồng hoàn kho, thông báo khách, và cho phép thử lại.

## Saga — khi cần "rollback" trong thế giới bất đồng bộ

Bất đồng bộ đồng nghĩa không còn transaction ACID xuyên nhiều bước. Nếu bước 4 thất bại, phải **hoàn tác** ba bước trước bằng các hành động bù trừ.

```text
   Luồng thuận:
   Tạo đơn → Giữ kho → Trừ tiền → Giao vận
                                      ↓ THẤT BẠI
   Luồng bù trừ (ngược lại):
   Huỷ đơn ← Hoàn kho ← Hoàn tiền ←──┘
```

```java
@Component
public class OrderSaga {

    @KafkaListener(topics = "order-created")
    public void onOrderCreated(OrderCreatedEvent e) {
        commandGateway.send(new ReserveInventoryCommand(e.getOrderId(), e.getItems()));
    }

    @KafkaListener(topics = "inventory-reserved")
    public void onInventoryReserved(InventoryReservedEvent e) {
        commandGateway.send(new ChargePaymentCommand(e.getOrderId(), e.getAmount()));
    }

    @KafkaListener(topics = "payment-failed")
    public void onPaymentFailed(PaymentFailedEvent e) {
        // Bù trừ: nhả kho đã giữ
        commandGateway.send(new ReleaseInventoryCommand(e.getOrderId()));
        commandGateway.send(new CancelOrderCommand(e.getOrderId(), e.getReason()));
    }
}
```

Ba điều phải nhớ về saga:

1. **Hành động bù trừ không phải rollback.** Bạn không xoá được email đã gửi hay tiền đã chuyển — bạn thực hiện một hành động **mới** để bù lại (gửi email xin lỗi, hoàn tiền).
2. **Mọi bước phải idempotent**, kể cả bước bù trừ. Lệnh bù trừ có thể được gửi hai lần.
3. **Trạng thái trung gian là hữu hình.** Trong vài giây, đơn hàng ở trạng thái "đã giữ kho nhưng chưa thanh toán". Giao diện và báo cáo phải xử lý được trạng thái đó.

Saga là chủ đề lớn, nhưng điểm cần nhớ ở đây: **async hoá kéo theo nhu cầu về saga**, và đó là một phần chi phí phải tính vào quyết định.

## Bảng đánh đổi tổng hợp

| Khía cạnh | Đồng bộ | Bất đồng bộ |
|---|---|---|
| Latency người dùng cảm nhận | Cao | **Rất thấp** |
| Thông lượng | Thấp | **Rất cao** |
| Chịu lỗi downstream | Kém — hỏng là hỏng | **Tốt — chờ rồi làm lại** |
| Nhất quán | Ngay lập tức | **Cuối cùng** (vài giây) |
| Độ phức tạp code | Thấp | **Cao** |
| Debug | Dễ | **Khó** — cần tracing |
| Xử lý lỗi | Try/catch | **DLQ + phát lại + saga** |
| Trải nghiệm người dùng | Đơn giản | Cần thiết kế trạng thái chờ |

## Trường hợp thực tế: từ 95 RPS lên 3.200 RPS

Bối cảnh: API đặt hàng của một nền tảng giao đồ ăn.

| Giai đoạn | Thay đổi | RPS tối đa | p99 |
|---|---|---|---|
| 0 | Ban đầu, 8 lời gọi đồng bộ | 95 | 3.400 ms |
| 1 | Đưa email/SMS/analytics ra outbox | 210 | 1.500 ms |
| 2 | Đưa thông báo kho vận, điểm thưởng ra | 340 | 980 ms |
| 3 | Đưa thanh toán ra (đổi UX sang "đang xử lý") | 1.100 | 280 ms |
| 4 | Đưa cả giữ kho ra, dùng Redis để kiểm tra nhanh | 3.200 | 95 ms |

**Nhanh gấp 34 lần** so với ban đầu.

Nhưng chi phí phải trả, liệt kê trung thực:

```text
   ├─ Thêm Kafka (3 broker) + Kafka Connect
   ├─ Thêm bảng outbox và tiến trình publisher
   ├─ Viết saga xử lý 6 kịch bản bù trừ
   ├─ Xây hệ thống thông báo trạng thái qua WebSocket
   ├─ Xây bảng điều khiển DLQ với chức năng phát lại
   ├─ Thêm distributed tracing (không có thì không debug được)
   ├─ 3 tháng công sức của 4 người
   └─ Đội vận hành phải học Kafka
```

Và một sự cố trong quá trình chuyển đổi đáng ghi nhớ: giai đoạn 3, một lỗi trong saga khiến 2.000 đơn hàng bị trừ tiền nhưng không giữ được kho. Phải xử lý thủ công trong 2 ngày.

Bài học: **chuyển từng bước, mỗi bước theo dõi kỹ, và luôn có cơ chế đối soát tự động**. Đừng chuyển thanh toán sang bất đồng bộ cho tới khi các bước đơn giản hơn đã chạy ổn định vài tháng.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dual write (ghi DB rồi ghi Kafka riêng) | Mất sự kiện hoặc sự kiện ma |
| Consumer không idempotent | Gửi email 3 lần, cộng điểm 3 lần |
| Không có DLQ | Sự kiện lỗi biến mất im lặng |
| DLQ không có cảnh báo | Hàng nghìn message nằm im hàng tháng |
| Không phân biệt lỗi tạm thời / vĩnh viễn | Poison message chặn cả partition |
| Số consumer > số partition | Instance thừa ngồi không |
| Không giám sát lag | Không biết đang tụt hậu |
| Async hoá mà không đổi trải nghiệm người dùng | Người dùng bối rối, gọi tổng đài |
| Không có saga cho luồng nhiều bước | Dữ liệu không nhất quán khi lỗi giữa chừng |
| Dùng Kafka khi bảng DB là đủ | Chi phí vận hành không đáng |

## Tóm tắt case 4

- Câu hỏi phân loại: **"nếu bước này hỏng, nghiệp vụ chính có hỏng không?"** Không → đưa ra bất đồng bộ.
- Async hoá giảm latency, tăng thông lượng, và **tăng khả dụng** (ít phụ thuộc đồng bộ hơn).
- **Dual write luôn sai.** Dùng **mẫu outbox** (ghi sự kiện cùng transaction) hoặc **CDC**.
- Outbox cho **at-least-once** → **consumer bắt buộc phải idempotent**.
- Bắt đầu bằng **bảng trong database**; chỉ dùng Kafka khi thật sự cần thông lượng hoặc phát lại.
- **DLQ không có cảnh báo = không có DLQ.** Cần cả công cụ xem và phát lại.
- Phân biệt **lỗi tạm thời** (retry) và **lỗi vĩnh viễn** (thẳng DLQ) để tránh poison message.
- Chỉ số sống còn: **lag** và **tốc độ tăng lag**.
- Async hoá kéo theo **saga** cho hành động bù trừ, và **thiết kế lại trải nghiệm người dùng**.

**Bài kế tiếp** → [Case 5: Read replica và replication lag — đọc phải dữ liệu vừa ghi](05-case-read-replica-lag.md)

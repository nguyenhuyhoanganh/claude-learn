# Bài 1: Vì sao chúng ta cần Event-Driven Architecture

Cảm ơn bạn đã quan tâm đến khoá học này. Khoá học sẽ đưa bạn vượt qua mức "REST API thuần tuý" để xây dựng hệ thống **resilient by design** (mạnh mẽ ngay từ thiết kế) bằng **Spring Cloud Stream** và **Apache Kafka**.

## Nhìn vào ngành lập trình hiện nay

AI bây giờ có thể sinh code routine cực nhanh — expose REST endpoint, map DTO, viết boilerplate đều xong trong vài giây.

Nếu vai trò của một engineer chỉ là "viết loại code đó nhanh hơn", chúng ta đang **cạnh tranh với AI** — kẻ không bao giờ ngủ. Cuộc chiến này engineer thua chắc.

Giá trị thật của engineer đang dịch chuyển:
- KHÔNG phải "viết code nhanh tới đâu".
- MÀ là **architectural integrity** — khả năng thiết kế hệ thống chạy được trong thế giới thật: scale được, chịu được failure, xử lý được traffic không đoán trước.

Công ty cần engineer biết suy nghĩ ở mức **kiến trúc**, không chỉ implementation. Đây là lý do khoá này tập trung vào architecture pattern thay vì syntax language.

## Backend thực tế trong các công ty trông thế nào?

Trên giấy: gọi là "microservices". Architecture diagram đẹp — nhiều service nhỏ, mỗi service có trách nhiệm rõ ràng.

Thực tế: hầu hết hệ thống vẫn behave như **distributed monolith** (monolith phân tán). Lý do: các service kết nối với nhau bằng **synchronous REST call** (gọi REST đồng bộ) — tạo thành chuỗi dài phụ thuộc.

```text
Service A gọi Service B
   ↓ chờ response
Service B gọi Service C
   ↓ chờ response
Service C gọi Service D
   ↓ chờ response
...
```

Runtime vẫn **tightly coupled** (gắn chặt với nhau). Customer chỉ nhận được response thành công khi **mọi service** trong chuỗi đều **available**, đáp nhanh, và không lỗi.

## Ví dụ cụ thể — E-commerce app

User đặt hàng. Request đến **OrderService** trước. Vì hệ thống chia thành nhiều microservice, OrderService không tự hoàn thành request được. Nó phải gọi các service khác **đồng bộ**:

```text
Customer → OrderService
              ↓ sync REST call
           ProductService  (lấy giá hiện tại)
              ↓ sync REST call
           PaymentService  (thu tiền)
              ↓ sync REST call (internal)
           FraudCheckService  (check gian lận)
              ↓ trả về thành công
           PaymentService trả thành công
              ↓
           OrderService gọi InventoryService  (giữ hàng)
              ↓
           OrderService gọi ShippingService   (sắp xếp ship)
              ↓
           ShippingService gọi NotificationService  (báo customer)
              ↓
           Tất cả về OrderService
              ↓
           OrderService → response "OK" cho Customer
```

Nhìn từ customer = **1 request**. Thực tế backend = chuỗi **6-8 cuộc gọi service liên tiếp**.

Customer chỉ thấy "đặt hàng thành công" khi **mọi service** trong chuỗi đều **available + nhanh + không lỗi**.

## 4 vấn đề của kiến trúc sync chain

### Vấn đề 1: Độ trễ (latency) tích luỹ

```text
OrderService            50ms
+ ProductService        80ms
+ PaymentService       120ms
+ FraudCheckService    500ms  ← service này chậm
+ InventoryService     100ms
+ ShippingService      150ms
+ NotificationService   80ms
──────────────────────────────
Tổng customer thấy: 1080ms (hơn 1 giây)
```

1 service chậm → toàn chuỗi chậm. Customer cảm thấy "app chậm", **dù chỉ 1 service có vấn đề**.

Trong hệ sync, **latency cộng dồn**. Càng nhiều service trong chuỗi → app càng chậm.

### Vấn đề 2: Tính sẵn sàng (availability) là tích của tất cả

Giả sử mỗi service có uptime 99% (rất tốt).

```text
P(success) = P(Order) × P(Product) × P(Payment) × P(Fraud) 
             × P(Inventory) × P(Shipping) × P(Notif)
           = 0.99^7
           = 0.93
```

→ **7% request fail** dù mỗi service đều 99% uptime.

Trong hệ sync, **availability nhân với nhau**. Càng nhiều service → tổng availability càng thấp.

Customer nhận 500 Internal Server Error. Một số sẽ thử lại, một số bỏ luôn → mất doanh thu, mất khách.

### Vấn đề 3: Thêm feature mới = nguy hiểm

Business muốn thêm **RecommendationService** — "khách mua A, suggest B."

Trong kiến trúc sync:
- Phải sửa OrderService → thêm code gọi RecommendationService.
- Phải thêm logic timeout + retry.
- Phải test lại toàn chuỗi.
- Deploy + monitor.
- **Chạm vào critical order flow**.

Rủi ro: bug trong RecommendationService có thể khiến order fail. Vì sợ rủi ro nên team **ngại thêm feature**. → **Innovation chậm**.

Trong kiến trúc tightly coupled, thêm tính năng không chỉ khó mà còn **nguy hiểm**.

### Vấn đề 4: Mọi service phải up cùng lúc

Maintenance: muốn upgrade InventoryService → downtime 10 phút.

Trong sync: trong 10 phút đó, **mọi order đều fail**. Customer impact trực tiếp.

→ Tất cả service buộc phải up đồng thời, mọi lúc. Maintenance window khó schedule.

## Tổng kết vấn đề

Trong synchronous microservices:
- Communication phức tạp + tightly coupled.
- 1 service chậm → toàn flow chậm.
- 1 service fail → toàn operation fail.
- Thêm feature mới rủi ro phá flow hiện tại.
- Mọi service phải up đồng thời.
- Customer order bị mất (500 error), chỉ hi vọng họ thử lại.

Dù hệ thống đã được "tách thành microservices", behavior thực sự vẫn **fragile** (mỏng manh).

## Câu hỏi: thiết kế hệ thống mà không gặp các vấn đề trên được không?

Có — **Event-Driven Microservices**.

Ý tưởng cốt lõi: **services KHÔNG gọi nhau trực tiếp**. Thay vì gửi request và chờ response, mỗi service **publish event** (phát hành sự kiện) rồi đi làm việc khác. Các service khác **subscribe** (đăng ký) và **react** (phản ứng) với event đó **độc lập** khi nào chúng sẵn sàng.

```text
Customer click "Place Order"
       ↓
OrderService:
  - Lưu order vào DB
  - Publish event "OrderPlaced" lên Kafka
  - Trả response 202 Accepted cho customer NGAY LẬP TỨC
       ↓
Customer thấy "Order received" trong ~50ms
       
       
[Background — async]
Topic Kafka "order-events"
   │
   ├──► PaymentService consume (xử lý theo tốc độ riêng)
   │       → charge card
   │       → publish "PaymentCompleted"
   │
   ├──► InventoryService consume
   │       → decrement stock
   │
   ├──► ShippingService consume (bắt đầu sau PaymentCompleted)
   │       → sắp xếp delivery
   │       → publish "Shipped"
   │
   └──► RecommendationService consume (thêm mới — KHÔNG cần sửa OrderService)
           → build profile, suggest products

NotificationService listen "Shipped" → gửi email/push cho user.
```

OrderService **KHÔNG biết** ai consume event. KHÔNG biết có bao nhiêu consumer. KHÔNG quan tâm. Job của OrderService = lưu order + publish event. Hết.

Communication trở thành **asynchronous** (bất đồng bộ) và **non-blocking** (không chặn).

Services trở thành **loosely coupled** (gắn lỏng).

Hệ thống không còn phụ thuộc vào việc "mọi service phải up cùng lúc".

## 4 vấn đề được giải như thế nào

### Giải 1: Service chậm KHÔNG block toàn flow

Trong event-driven system, OrderService publish event xong là return cho customer ngay. Không chờ ai.

Nếu PaymentService chậm → chỉ payment processing bị delay. Customer **đã nhận response** từ OrderService. Phần còn lại của hệ thống tiếp tục độc lập.

→ Hệ thống **non-blocking by design**. Impact bị **isolated** (cô lập) ở service chậm.

### Giải 2: Failure KHÔNG ngay lập tức phá toàn operation

Event "OrderPlaced" được **lưu durably** (bền bỉ) trong messaging system (Kafka).

Nếu PaymentService fail khi đang process event đó → event **không bị mất**. Customer **không phải retry**. Service có thể retry process sau khi recover.

Thay vì fail customer request ngay lập tức → hệ thống chuyển sang model **eventual completion** (hoàn thành dần dần). Failures được handle như một phần của workflow, không phải khủng hoảng.

### Giải 3: Thêm service mới KHÔNG impact existing flow

Trong event-driven, services **decoupled** với nhau. OrderService không biết về service khác.

Muốn thêm RecommendationService? Service mới chỉ cần **subscribe vào "order-events" topic** và bắt đầu làm việc. **Zero changes** ở OrderService. **Zero risk** với critical workflow hiện tại.

→ Hệ thống **dễ evolve** (tiến hoá) theo thời gian.

### Giải 4: Services KHÔNG phải up đồng thời

Khi event được publish, nó được **lưu trong broker** (Kafka). Các application khác process khi nào available.

Không còn yêu cầu "mọi service phải up cùng lúc". Services tương tác qua **stored events** (event đã lưu), không phải **live request**.

Maintenance window dễ schedule: stop 1 service 10 phút → event accumulate trong topic → service back online → drain backlog → không customer impact.

## Tổng kết: chuyển từ sync sang event-driven thay đổi căn bản hệ thống

| Trục | Synchronous | Event-Driven |
|---|---|---|
| Dependencies | Tight (chặt) | Loose (lỏng) |
| Failures | Catastrophic (cascade) | Manageable (cô lập) |
| Scaling | Phức tạp, từng service | Practical (thực dụng) |
| Add capability | Nguy hiểm, sửa critical flow | Safe, subscribe topic mới |
| Availability requirement | Mọi service up cùng lúc | Bất kỳ lúc nào cũng OK |

Event-driven architecture **KHÔNG chỉ** là cách giao tiếp khác giữa các service. Nó là **cách thiết kế hệ thống khác** — hướng đến thế giới thật, nơi failure xảy ra liên tục, traffic không đoán trước, requirement thay đổi.

## Event-driven có challenge riêng

Khoá học sẽ dạy bạn:
- Eventual consistency (consistency dần dần) — gây UX surprises.
- Idempotency — process 1 event 2 lần không gây bug.
- Error handling — retry, Dead Letter Queue, recovery.
- Distributed tracing — theo dõi flow qua N service async.
- Ordering — đảm bảo thứ tự khi cần.
- Schema evolution — version event khi requirements thay đổi.

Tất cả những thứ này sẽ được dạy từng bước.

## Yêu cầu để theo khoá này

Bạn cần thoải mái với:
- **Java 8 trở lên** (khoá này dùng Java 21+ cho virtual thread).
- **Spring Boot** (biết @SpringBootApplication, @Bean, dependency injection, application.yml).
- **Docker** (biết docker-compose, exec vào container).

KHÔNG cần biết Kafka trước. Khoá sẽ dạy Kafka **from scratch** (từ đầu).

## Tóm tắt bài 1

- Giá trị của engineer dịch chuyển từ "viết code nhanh" sang **kiến trúc đúng đắn**.
- Sync REST chain biến microservices thành **distributed monolith**: latency cộng dồn, availability nhân với nhau, thêm feature nguy hiểm, mọi service phải up cùng lúc.
- 4 vấn đề: latency tích luỹ, availability tích, thêm feature rủi ro, requirement up đồng thời.
- **Event-Driven Architecture**: services publish event + return ngay, consumers react độc lập qua broker (Kafka).
- 4 giải: slow service không block, failure được cô lập + recoverable, thêm consumer zero impact, services không cần up đồng thời.
- Trade-off: eventual consistency, complexity shift, broker ops cost, debugging async.
- Khoá này dạy từ Kafka basics đến production-grade EDA project với Spring Cloud Stream.

**Bài kế tiếp** → [Phase 2 - Bài 1: Setup Kafka qua Docker](../phase-2-environment/01-kafka-docker-setup.md)

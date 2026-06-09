# Bài 2: Food Ordering System — bài toán bạn sẽ build

Bạn sẽ không học pattern bằng cách gật gù xem slide. Bạn sẽ **code thật** một hệ thống đặt đồ ăn từ A đến Z, gồm 4 microservice giao tiếp qua Kafka, deploy lên Kubernetes. Bài này mô tả **toàn bộ bài toán** — domain, REST API, các service, các Kafka topic, và **luồng SAGA 13 bước** xuyên suốt một order. Đọc kỹ — đây là tấm bản đồ bạn sẽ tra cứu suốt 13 phase còn lại.

## Domain — "đặt món ăn online" trông như thế nào?

Người dùng (Customer) đặt món từ Restaurant. Họ nhập đơn qua HTTP client (trong khoá: **Postman**). Hệ thống phải:

1. Nhận đơn, validate, lưu order ở trạng thái `PENDING`.
2. Thanh toán: gọi Payment service xử lý transaction.
3. Khi thanh toán xong, đổi trạng thái thành `PAID`.
4. Gửi sang Restaurant xin xác nhận (quán có đủ món, đủ shipper không).
5. Restaurant approve → trạng thái `APPROVED`.
6. Nếu bất kỳ bước nào lỗi → trạng thái `CANCELLED` kèm thông báo lỗi.

```text
            CREATE
   client ───────────────► [PENDING]
                              │
                              ▼ payment xong
                           [PAID]
                              │
                              ▼ restaurant approve
                           [APPROVED]   ← terminal state, có thể giao
                              ▲
                              │ rollback nếu lỗi
                           [CANCELLED]  ← terminal state, có message lỗi
```

5 trạng thái — `PENDING`, `PAID`, `APPROVED`, `CANCELLING`, `CANCELLED`. Khoá học sẽ dạy bạn dùng **state machine** ngay trong domain entity để **không cho** đổi state sai quy luật (ví dụ: không thể từ `APPROVED` quay về `PENDING`). Đó là một bài quan trọng trong phase-3.

## REST API của Order service

Order service là service **duy nhất** expose REST cho client. 3 service còn lại nói chuyện thuần qua Kafka.

### Tạo đơn

```text
POST /orders
Content-Type: application/json

{
  "customerId": "d215b5f8-0249-4dc5-89a3-51fd148cfb41",
  "restaurantId": "d215b5f8-0249-4dc5-89a3-51fd148cfb45",
  "address": {
    "street": "street_1",
    "postalCode": "1000AB",
    "city": "Amsterdam"
  },
  "price": 200.00,
  "items": [
    { "productId": "...", "quantity": 1, "price": 50.00, "subTotal": 50.00 },
    { "productId": "...", "quantity": 3, "price": 50.00, "subTotal": 150.00 }
  ]
}
```

Response:

```json
{
  "orderTrackingId": "10f2e1e8-...",
  "orderStatus": "PENDING",
  "message": "Order created successfully"
}
```

`orderTrackingId` là UUID public dùng để query sau này. `orderId` (UUID internal) **không** trả về — đây là pattern bảo mật: không expose internal identifier ra ngoài.

### Query trạng thái đơn

```text
GET /orders/{orderTrackingId}
→ { orderTrackingId, orderStatus: PAID|APPROVED|CANCELLED, failureMessages: [] }
```

Client poll endpoint này để biết đơn đã được approve chưa. Trong production thực, sẽ thay bằng WebSocket hoặc SSE push, nhưng polling là cách đơn giản nhất cho khoá học.

## 4 microservice — vai trò từng cái

```text
┌──────────────────────────────────────────────────────────────────────┐
│                                                                       │
│   [HTTP client / Postman]                                             │
│           │                                                            │
│           ▼ REST                                                       │
│   ┌────────────────┐                                                  │
│   │ Order Service  │ ◄──── coordinator của toàn bộ luồng SAGA          │
│   │  ┌──REST API─┐ │                                                  │
│   │  ┌──Domain──┐│ │                                                  │
│   │  ┌──DAO────┐│ │ ───► Postgres (schema: order)                     │
│   │  ┌──Msg────┐│ │ ◄──► Kafka                                        │
│   └────────────────┘                                                  │
│                                                                       │
│   ┌────────────────┐    ┌────────────────┐    ┌──────────────────┐    │
│   │Payment Service │    │Restaurant Svc  │    │Customer Service  │    │
│   │  Domain+DAO+Msg│    │ Domain+DAO+Msg │    │ trigger materialize│   │
│   │  Postgres      │    │  Postgres      │    │ Postgres → CQRS  │    │
│   │  Kafka         │    │  Kafka         │    │                  │    │
│   └────────────────┘    └────────────────┘    └──────────────────┘    │
│                                                                       │
│                       ┌────── Apache Kafka ─────────┐                 │
│                       │ payment-request-topic        │                 │
│                       │ payment-response-topic       │                 │
│                       │ restaurant-approval-request  │                 │
│                       │ restaurant-approval-response │                 │
│                       │ customer-topic (phase-10)    │                 │
│                       └──────────────────────────────┘                 │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Order service
- **Đầu vào duy nhất**: client gửi REST.
- **Đầu não SAGA**: tạo order, phát event, nghe response, cập nhật state, tiếp tục bước tiếp theo.
- **Postgres schema**: `order` — chứa table `orders`, `order_items`, `order_address`, `outbox_payment`, `outbox_restaurant`.
- **Kafka publisher**: `payment-request-topic`, `restaurant-approval-request-topic`.
- **Kafka listener**: `payment-response-topic`, `restaurant-approval-response-topic`.

### Payment service
- **Không** expose REST.
- **Vào** qua `payment-request-topic`, **ra** qua `payment-response-topic`.
- Validate ví khách hàng, tạo `Payment` entity, ghi DB schema `payment`.
- Trả kết quả `COMPLETED` hoặc `FAILED` về `payment-response-topic`.

### Restaurant service
- Vào `restaurant-approval-request-topic`, ra `restaurant-approval-response-topic`.
- Validate: order có > total price tối thiểu của quán? Quán đang nhận đơn? Sản phẩm available?
- Trả `APPROVED` hoặc `REJECTED` về response topic.

### Customer service
- Ban đầu (phase-1 đến phase-9): chỉ là **materialized view** trong cùng Postgres instance. Khi customer mới được tạo, một trigger sao chép vào schema mà Order service đọc được.
- Phase-10 (CQRS): nâng cấp. Customer service trở thành microservice riêng, publish event lên `customer-topic`. Order service nghe và ghi vào table local. Bonus: nếu customer chưa tồn tại trong order DB → reject order.

## Kafka topic và luồng event

Bốn topic chính cho SAGA, một topic phụ cho CQRS:

| Topic | Producer | Consumer | Payload |
|---|---|---|---|
| `payment-request-topic` | Order service | Payment service | `PaymentRequestAvroModel` (orderId, sagaId, customerId, price, type=PAY hoặc CANCEL) |
| `payment-response-topic` | Payment service | Order service | `PaymentResponseAvroModel` (orderId, sagaId, status, failureMessages) |
| `restaurant-approval-request-topic` | Order service | Restaurant service | `RestaurantApprovalRequestAvroModel` (orderId, sagaId, restaurantId, products) |
| `restaurant-approval-response-topic` | Restaurant service | Order service | `RestaurantApprovalResponseAvroModel` (orderId, sagaId, status, failureMessages) |
| `customer-topic` (phase-10) | Customer service | Order service | `CustomerAvroModel` (customerId, username, fullName) |

> **Avro** là format serialization có schema (giống Protobuf). Khoá dùng Avro để event có **type safety** giữa producer và consumer, và để Schema Registry có thể validate version compatibility. Phase-4 sẽ giải thích kỹ.

## Luồng SAGA 13 bước — đường đi của một order thành công

Đây là **xương sống** của project. Đọc đi đọc lại đến khi nhớ.

```text
┌─────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐   ┌──────────┐   ┌──────────────┐
│ Order   │   │ Payment  │   │ Payment  │   │ Order   │   │ Restaurant│  │ Restaurant   │
│ Svc DB  │   │ Request  │   │ Service  │   │ Svc DB  │   │ Approval  │  │ Service      │
│         │   │ Topic    │   │          │   │         │   │ Request   │  │              │
└────┬────┘   └────┬─────┘   └────┬─────┘   └────┬────┘   └────┬──────┘  └─────┬────────┘
     │  1.create   │              │              │              │                │
     │ ────────────│              │              │              │                │
     │  2.publish  │              │              │              │                │
     │ ────────────►              │              │              │                │
     │             │ 3.consume    │              │              │                │
     │             │ ─────────────►              │              │                │
     │             │              │ 4.payment    │              │                │
     │             │              │ ────────────►│              │                │
     │             │              │              │              │                │
     │             │  5.publish payment-response │              │                │
     │ ◄────────── 6.consume ─────────────────── │              │                │
     │ 7.update    │              │              │              │                │
     │ status=PAID │              │              │              │                │
     │             │              │              │ 8.publish    │                │
     │             │              │              │ ───────────► │                │
     │             │              │              │              │ 9.consume      │
     │             │              │              │              │ ─────────────► │
     │             │              │              │              │     10.approval│
     │             │              │              │              │ ◄────────────  │
     │             │              │              │              │                │
     │             │              │              │ 11.publish approval-response  │
     │ ◄──── 12.consume ───────────────────────────────────── ─ ─────────────────│
     │ 13.update                                                                 │
     │ status=APPROVED                                                            │
     ▼                                                                            ▼
```

Mô tả chi tiết:

| # | Service | Hành động | Ghi chú |
|---|---|---|---|
| 1 | Order | INSERT `orders` row, status = `PENDING` | Trong cùng transaction sẽ INSERT outbox event ở phase-9 |
| 2 | Order | Publish `OrderCreatedEvent` → `payment-request-topic` | Phase-1 đến 8: publish trực tiếp. Phase-9 trở đi: ghi outbox + scheduler publish. |
| 3 | Payment | Consume từ `payment-request-topic` | Listener nhận event |
| 4 | Payment | Tạo `Payment` entity, INSERT DB `payment` schema | Validate ví, deduct balance |
| 5 | Payment | Publish `PaymentCompletedEvent` → `payment-response-topic` | |
| 6 | Order | Consume từ `payment-response-topic` | |
| 7 | Order | UPDATE `orders.status = PAID` | |
| 8 | Order | Publish `OrderPaidEvent` → `restaurant-approval-request-topic` | |
| 9 | Restaurant | Consume từ `restaurant-approval-request-topic` | |
| 10 | Restaurant | Validate order, INSERT `order_approval` row | |
| 11 | Restaurant | Publish `OrderApprovedEvent` → `restaurant-approval-response-topic` | |
| 12 | Order | Consume từ `restaurant-approval-response-topic` | |
| 13 | Order | UPDATE `orders.status = APPROVED` | Order hoàn thành |

**Lưu ý quan trọng**: Order service DB bị UPDATE **3 lần** (bước 1, 7, 13). Mỗi UPDATE là một local ACID transaction riêng. Đây là tinh thần của SAGA — **không** có một transaction lớn xuyên service, mà là chuỗi transaction nhỏ + event nối lại.

## Khi có lỗi — luồng compensation

Giả sử Payment ở bước 4 từ chối (ví hết tiền). Payment publish event `PaymentFailedEvent`. Order consume, update `status = CANCELLED`, lưu `failureMessages`. SAGA kết thúc ở đây — không cần rollback gì khác vì các bước sau chưa chạy.

Phức tạp hơn: Restaurant ở bước 10 từ chối (hết món). Lúc này tiền đã trừ ở Payment. Order phải **rollback Payment** bằng cách publish event `PaymentCancelRequestEvent` → Payment service refund → Payment publish `PaymentCancelledEvent` → Order set `status = CANCELLED`.

```text
[Order PENDING]
       │
       ▼
[Payment OK] ────► [Order PAID]
                          │
                          ▼ ask restaurant
                  [Restaurant REJECT]
                          │
                          ▼ compensation: ask Payment to cancel
                  [Payment refund OK] ────► [Order CANCELLED]
```

Đó là tinh thần SAGA: **không có "rollback" tự động** — bạn phải **code compensation logic** cho từng bước. Phase-8 thực hành cụ thể.

## Tại sao Order service làm "coordinator"?

Khoá dùng **choreography** (mỗi service tự xử sự kiện) nhưng vẫn cho Order service **khởi xướng và kết thúc** SAGA. Vì:

1. **Có "đầu" rõ ràng**: client gọi REST vào Order — phải Order initiate.
2. **State authoritative**: trạng thái cuối cùng (`PAID`, `APPROVED`, `CANCELLED`) thuộc về Order — nó là **source of truth** của một đơn hàng.
3. **Theo dõi SAGA progress**: Order biết SAGA đang ở step nào và update DB cho phù hợp.

Tuy nhiên Order **không** "ra lệnh" cho service khác — nó **publish event**. Payment và Restaurant **tự** quyết định phản ứng. Đây là choreography đúng nghĩa.

So sánh nhanh:

| | Choreography (khoá này) | Orchestration |
|---|---|---|
| Đầu não | Không có — distributed | Có 1 orchestrator |
| Coupling | Loose — service không biết về nhau | Tighter — orchestrator biết tất cả service |
| Phù hợp khi | Luồng đơn giản, ít step | Luồng phức tạp, nhiều nhánh điều kiện |
| Debug | Khó hơn — phải trace event qua nhiều service | Dễ hơn — log ở orchestrator |
| Framework hỗ trợ | Không cần | Camunda, Temporal, Eventuate |

Khoá chọn choreography để bạn **thấy event-driven nguyên bản**, không bị framework che mất.

## Outbox sẽ "vá" vào luồng này như thế nào?

Phase-9 sẽ refactor: thay vì bước 2 publish trực tiếp lên Kafka, Order service ghi vào table `payment_outbox` trong **cùng** ACID transaction với INSERT `orders`. Một scheduler riêng định kỳ:
1. Đọc các row outbox có status `STARTED`.
2. Publish lên Kafka.
3. Mark status `COMPLETED`.

```text
Trước Outbox (phase-1 đến 8):
   step 1 (DB) ─┐
   step 2 (Kafka) ─┘ ← hai thao tác riêng, không atomic. Có thể lệch.

Sau Outbox (phase-9 trở đi):
   1 transaction: INSERT orders + INSERT payment_outbox  ← atomic, an toàn
   ────────────────────────────────────────────────
   Scheduler đọc payment_outbox → Kafka → mark COMPLETED  ← retry tự nhiên
```

Phase-13 thay scheduler bằng **Debezium CDC** đọc Postgres WAL log → nhanh hơn polling, không lag, không cần index outbox.

## CQRS sẽ "vá" Customer như thế nào?

Ở phase đầu, Customer là materialized view: dùng SQL trigger để copy `customers` từ `customer` schema sang `order` schema. Order service đọc trực tiếp từ schema `customer` để biết "customer này có tồn tại không?".

```text
Phase 1-9:  Customer → Postgres trigger → bảng materialized → Order đọc trực tiếp
```

Phase-10 nâng cấp:
1. Tạo Customer service riêng, có DB riêng.
2. Customer publish event `CustomerCreatedEvent` lên Kafka.
3. Order service consume event, ghi vào table local trong DB của Order.
4. Order query từ table local đó.

```text
Phase 10+:  Customer Svc → Kafka customer-topic → Order Svc consume → Order local table
```

Lúc này không có DB chia sẻ giữa Customer và Order. Đây là **CQRS đầy đủ**: Customer service làm command (write), Order service làm query (read trên replica).

## Tóm tắt bài 2

- **Bài toán**: food ordering — 4 microservice + Kafka + Postgres, 5 trạng thái order, REST API public chỉ ở Order service.
- **Luồng SAGA 13 bước**: Order → Payment → Order → Restaurant → Order, mỗi mũi tên là Kafka event.
- **Compensation**: nếu Restaurant từ chối sau khi Payment OK, phải hoàn tiền — code logic compensation tay, không có rollback tự động.
- **Order là "coordinator"**: initiate, hold state, finalize — nhưng vẫn theo choreography (không ra lệnh, chỉ publish event).
- **Outbox (phase-9) và CDC (phase-13)** sẽ vá lỗ hổng dual-write. CQRS (phase-10) sẽ vá pattern Customer chia sẻ DB.

**Bài kế tiếp** → [Bài 3: Thiết lập môi trường — Java, Maven, IntelliJ, Docker, Postgres, Kafka tool](03-thiet-lap-moi-truong.md)

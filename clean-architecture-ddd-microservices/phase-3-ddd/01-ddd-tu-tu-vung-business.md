# Bài 7: Domain-Driven Design — bắt đầu từ ngôn ngữ business

> Phase-2 đã dạy **vị trí** của domain code (ở giữa, không phụ thuộc ai). Phase-3 dạy **bên trong domain viết thế nào**. Domain-Driven Design (DDD) — Eric Evans, 2003 — cung cấp bộ pattern và từ vựng để code business logic gọn, sát ngôn ngữ business, và dễ tiến hoá. Bài này là **bản đồ DDD** trước khi đào sâu từng pattern ở 7 bài còn lại của phase.

## DDD giải bài toán gì?

Code Spring layered "thông thường" hay rơi vào pattern **Anemic Domain Model**: entity chỉ là túi getter/setter, mọi logic dồn vào `*ServiceImpl`.

```java
// Anemic — entity chỉ chứa state
public class Order {
    private UUID id;
    private OrderStatus status;
    public void setStatus(OrderStatus s) { this.status = s; }   // không validate
    // ... getter/setter
}

// Logic ở service — không có invariant
@Service
public class OrderService {
    public void payOrder(UUID id) {
        Order o = repo.findById(id);
        o.setStatus(OrderStatus.PAID);   // ai cũng set được, từ trạng thái nào cũng được
        repo.save(o);
    }
}
```

Vấn đề:
- Không có **invariant** (bất biến): từ `CANCELLED` cũng `setStatus(PAID)` được — sai logic.
- Logic phân tán nhiều `*Service` class. Đọc 1 class không hiểu Order làm gì.
- Khi business rule đổi, phải lùng nhiều service để sửa.
- Domain expert (PM, business) đọc code không hiểu — không có ngôn ngữ chung.

DDD đề xuất ngược lại: **đẩy logic vào Entity/Aggregate**, biến domain object thành "**nơi business rule sống**".

```java
// DDD: Rich domain model
public class Order extends AggregateRoot<OrderId> {
    private OrderStatus orderStatus;

    public void pay() {
        if (orderStatus != OrderStatus.PENDING) {
            throw new OrderDomainException("Order is not in PENDING state for pay");
        }
        orderStatus = OrderStatus.PAID;
    }

    public void approve() {
        if (orderStatus != OrderStatus.PAID) {
            throw new OrderDomainException("Order is not in PAID state for approve");
        }
        orderStatus = OrderStatus.APPROVED;
    }
}
```

Đọc class `Order` thấy ngay: chỉ pay được khi `PENDING`, chỉ approve được khi `PAID`. Đó là **invariant nội tại** — không cần đọc thêm service nào.

## 2 mặt của DDD: Strategic và Tactical

DDD có 2 tầng pattern:

### Strategic DDD — bản đồ rộng
- **Domain**: lĩnh vực hoạt động của hệ thống (food ordering, banking, healthcare).
- **Subdomain**: phần nhỏ trong domain (order management, payment processing, restaurant management).
- **Bounded Context**: ranh giới ngôn ngữ + model. Trong context A, "customer" mang nghĩa X; context B cùng từ "customer" mang nghĩa Y. Mỗi microservice = 1 bounded context.
- **Ubiquitous Language**: ngôn ngữ chung giữa dev và business — `"approve order"` trong code phải khớp với từ `"approve order"` business dùng.
- **Context Map**: sơ đồ các bounded context và cách chúng giao tiếp.

### Tactical DDD — pattern code cụ thể
- **Entity** — object có identity, vòng đời, state.
- **Value Object** — object không identity, immutable, định danh bằng giá trị.
- **Aggregate** — cụm Entity + VO **luôn nhất quán cùng nhau**.
- **Aggregate Root** — Entity "cổng vào" của Aggregate.
- **Domain Service** — logic không thuộc Entity nào hoặc spans nhiều Aggregate.
- **Domain Event** — sự kiện đã xảy ra trong domain.
- **Application Service** — vỏ ngoài domain, orchestrate use case.
- **Repository** — interface load/save Aggregate.
- **Factory** — tạo Aggregate phức tạp.

Phase-3 này tập trung Tactical (Strategic đã đề cập sơ ở phase-1).

## Bounded Context — đường ranh giới của bạn

Trước khi viết code, đặt câu hỏi: **mỗi từ business có giống nghĩa ở mọi nơi không?**

Trong food ordering, "Customer":

| Bounded Context | "Customer" mang nghĩa gì |
|---|---|
| **Order context** | Người đặt món, có địa chỉ giao hàng, lịch sử đơn |
| **Payment context** | Người trả tiền, có ví/thẻ, số dư |
| **Restaurant context** | Người dùng cuối, có rating, complaint history |
| **Marketing context** | Lead, có preferences, coupon |

4 bounded context, 4 nghĩa khác nhau cho "Customer". Cố tạo 1 class `Customer` chung là **chống lại DDD**. Khoá học có 4 microservice = 4 bounded context, mỗi service có Customer-related entity riêng.

```text
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│ Order context   │   │ Payment context │   │ Restaurant ctx  │
│                 │   │                 │   │                 │
│ Customer (lite) │   │ CreditEntity    │   │ ...             │
│  - id           │   │  - customerId   │   │                 │
│  - addresses    │   │  - balance      │   │                 │
└─────────────────┘   └─────────────────┘   └─────────────────┘
       ↑                       ↑                       ↑
       └───────────── chia sẻ ID, KHÔNG chia sẻ class ─┘
```

**Điểm chung duy nhất** giữa các context: **identifier** (UUID). Hai context cùng nói về một customer bằng cách dùng cùng `customerId`. **Không** dùng chung class.

## Ubiquitous Language — ngôn ngữ chung

Code dùng từ vựng giống business:

| Business nói | Code viết |
|---|---|
| "Khách tạo order" | `order.initiateOrder()` (không phải `order.create()` chung chung) |
| "Order đã pay" | `order.pay()` (không phải `order.setPaid()` hay `order.markAsPaid()`) |
| "Restaurant approve order" | `restaurant.approveOrder(order)` (không phải `restaurant.updateStatus(...)`) |
| "Compensate cancel" | `payment.cancel()` (không phải `payment.rollback()`) |

Đọc code = đọc tiếng business. Khi PM hỏi "ta có thể đảo lại trạng thái sau approve không", dev nhìn vào code: không có method `unApprove()` → trả lời chính xác "không, đó là terminal state".

## Tactical Pattern — preview 7 bài tới

### Entity
Object có **identity** (`UUID`, ID sinh ra một lần khi tạo, không đổi). Bằng identity → bằng entity, dù state có khác. Khoá học: `Order`, `OrderItem`, `Customer`, `Restaurant`, `Product`, `Payment`.

```java
public abstract class BaseEntity<ID> {
    private ID id;
    @Override public boolean equals(Object o) { /* dựa vào id */ }
    @Override public int hashCode() { /* dựa vào id */ }
}
```

### Value Object
Object **không identity**, **immutable**. Bằng giá trị → bằng nhau. Khoá học: `Money`, `Address`, `OrderId` (chính UUID id của Order cũng là VO!), `TrackingId`, `ProductId`.

```java
public final class Money {
    private final BigDecimal amount;
    public Money add(Money other) { return new Money(amount.add(other.amount)); }
    // KHÔNG có setter
}
```

### Aggregate + Aggregate Root
Cụm entity luôn nhất quán cùng nhau. Một entity là **root** — entry point, chịu trách nhiệm enforce invariant.

```text
Order Aggregate
├── Order (root) ──────────────── enforce invariant cho cụm
│   ├── orderId, customerId, status, totalPrice
│   └── items: List<OrderItem>
└── OrderItem (entity, không root)
    └── itemId, productId, quantity, subTotal
```

Quy tắc vàng: **outside chỉ chạm Root**. Muốn sửa `OrderItem.quantity` phải đi qua `Order` (root). Đảm bảo invariant không bị phá.

### Domain Event
"Sự kiện vừa xảy ra". Bất biến, immutable, tên ở **past tense**:
- `OrderCreatedEvent` (sau khi initiate order thành công)
- `OrderPaidEvent` (sau khi pay)
- `OrderCancelledEvent` (sau khi cancel)

Service khác lắng nghe event, phản ứng — đây là cách bounded context giao tiếp.

### Domain Service
Logic không thuộc Entity nào. Ví dụ: tính `totalPrice` cần `Order` + `Restaurant.products` cùng lúc — không hợp đặt trong `Order` (không nên Order biết về Restaurant). Đặt `OrderDomainService.validateAndInitiateOrder(Order, Restaurant)`.

### Application Service
Tầng "**vỏ ngoài domain**". Trách nhiệm:
- Implement input port (interface domain expose ra).
- Validate input từ ngoài.
- Mapper DTO ↔ Domain.
- Quản lý transaction (`@Transactional`).
- Gọi repository load/save.
- Gọi domain service / aggregate root.
- Publish domain event ra ngoài.

**Quan trọng**: Application Service **không chứa business rule**. Business rule thuộc Entity và Domain Service. App service chỉ orchestrate.

### Repository
Interface tải/lưu Aggregate **dưới góc nhìn domain**. Domain chỉ biết "tôi cần lưu Order". Cách lưu (Postgres, MongoDB) là chi tiết hạ tầng.

```java
public interface OrderRepository {
    Order save(Order order);
    Optional<Order> findById(OrderId id);
    Optional<Order> findByTrackingId(TrackingId trackingId);
}
```

Implementation `OrderRepositoryImpl` nằm ở `order-dataaccess`, dùng JPA. Domain không biết JPA.

## DDD vs Clean Architecture — vị trí mỗi thứ

Bảng đặt đúng tầng:

| Pattern | Module Maven |
|---|---|
| Entity (Order, OrderItem) | `order-domain-core` |
| Value Object (Money, Address) | `order-domain-core` |
| Aggregate Root (Order) | `order-domain-core` |
| Domain Event class | `order-domain-core` |
| Domain Service | `order-domain-core` |
| Application Service | `order-application-service` |
| Port interface (input + output) | `order-application-service` |
| DTO (CreateOrderCommand, ...) | `order-application-service` |
| Mapper | `order-application-service` |
| Repository interface | `order-application-service` |
| Repository implementation (JPA) | `order-dataaccess` |
| REST Controller | `order-application` |
| Kafka Producer/Consumer | `order-messaging` |
| Spring config + `@Bean` | `order-container` |

Đây là bản đồ. Mỗi bài kế tiếp sẽ code 1-2 layer.

## Eventual Consistency và Domain Event

Domain Event nối các Bounded Context. Vì chúng đi qua message broker (Kafka), tính nhất quán là **eventual** — không tức thì.

```text
[Order context]                   [Payment context]
 publish OrderCreatedEvent ─Kafka─► consume, process payment ─Kafka─► PaymentCompletedEvent
                                                                        │
[Order context] ◄────── consume ──────────────────────────────────────┘
 update Order to PAID
```

Trong khoảng thời gian giữa "Order created" và "Order paid", Order ở trạng thái `PENDING`. Client query thấy `PENDING`. Vài giây sau query lại thấy `PAID`. Đó là eventual consistency — design UX/UI phải chấp nhận.

## Books gốc — đọc thêm sau khoá

Sau khoá học:
1. **Domain-Driven Design: Tackling Complexity in the Heart of Software** — Eric Evans, 2003. Sách gốc, dày, kinh điển.
2. **Implementing Domain-Driven Design** — Vaughn Vernon, 2013. Thực dụng, code Java, gần với khoá hơn.
3. **Domain-Driven Design Distilled** — Vaughn Vernon, 2016. Bản tóm tắt 150 trang.
4. **Patterns, Principles, and Practices of Domain-Driven Design** — Scott Millett, 2015. Nhiều ví dụ .NET nhưng pattern universal.

## Bẫy thường gặp khi áp DDD lần đầu

| Bẫy | Tránh bằng cách |
|---|---|
| Tạo class `Customer` chung cho cả Order + Payment + Restaurant context | Mỗi context tự định nghĩa entity riêng, chỉ chia sẻ `customerId`. |
| Đặt logic vào `OrderService` thay vì `Order` entity | Hỏi: "logic này phụ thuộc state của entity nào?". Nếu chỉ Order → đặt vào Order. |
| Aggregate khổng lồ (chứa 10 entity) | Cụm nhỏ — chỉ những entity **bắt buộc** nhất quán cùng nhau (1 transaction). |
| Outside truy cập trực tiếp `OrderItem` | Đi qua `Order.addItem()`, `Order.removeItem()`. |
| Application Service chứa business rule | Hỏi: "rule này có cần state của entity không?". Nếu có → đặt vào entity. |
| Domain Event là setter (mutable) | Event là **fact đã xảy ra** — bất biến. Field `final`, không setter. |
| Reuse JPA `@Entity` làm Domain Entity | Tách 2 class, dùng mapper. JPA entity ở `dataaccess`, domain entity ở `domain-core`. |
| Repository trả về `Page<OrderJpaEntity>` | Repository interface (ở domain) trả `List<Order>` — không lộ JPA. |

## Tóm tắt bài 7

- **Anemic Domain Model** (entity rỗng + service béo) là pattern **chống DDD** mà code Spring thường rơi vào. DDD giải bằng cách **đẩy logic vào entity/aggregate**.
- **Strategic DDD**: Bounded Context, Ubiquitous Language, Subdomain. **Tactical DDD**: Entity, VO, Aggregate, Domain Service, Domain Event, App Service, Repository.
- **Bounded Context = ranh giới microservice**. Không share entity class xuyên context — chỉ share identifier.
- Trong food ordering: 4 microservice = 4 bounded context. Mỗi service tự định nghĩa entity riêng cho khái niệm "Customer", "Order", v.v.
- Domain Event nối các context, eventual consistency là hệ quả tự nhiên.
- 7 bài còn lại của phase-3 code từng pattern: base classes → VO → Aggregate → State machine → Domain Event/Service → Application Service → Tests.

**Bài kế tiếp** → [Bài 8: Thiết kế Order Aggregate — fields, relationships, invariant](02-thiet-ke-order-aggregate.md)

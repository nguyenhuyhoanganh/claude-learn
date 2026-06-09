# Bài 28: Restaurant Service — Domain Core

> Restaurant service nhận `OrderApprovalRequest` từ Order (sau khi Payment xong), validate có đủ product available + price đúng + restaurant active, rồi approve hoặc reject. Bài này code domain core: `Restaurant` aggregate, `Product` + `OrderApproval` + `OrderDetail` entities. Cấu trúc giống Order/Payment, điểm khác là **logic validation cross-products**.

## Bài toán Restaurant service

Khi nhận `OrderApprovalRequest`:
1. Restaurant phải đang active.
2. Mỗi product trong đơn phải `available=true`.
3. Tổng `quantity * price` của các product phải khớp `request.totalAmount` (chống tampering).
4. Nếu OK → tạo `OrderApproval(orderId, status=APPROVED)`, publish `OrderApprovedEvent`.
5. Nếu lỗi → tạo `OrderApproval(orderId, status=REJECTED)`, publish `OrderRejectedEvent` với failureMessages.

## Entities

### `Restaurant` — Aggregate Root

```java
public class Restaurant extends AggregateRoot<RestaurantId> {
    private final OrderApproval orderApproval;       // tạo trong constructor
    private final boolean active;
    private final OrderDetail orderDetail;            // chi tiết đơn cần approve

    private Restaurant(Builder b) {
        setId(b.restaurantId);
        this.orderApproval = b.orderApproval;
        this.active = b.active;
        this.orderDetail = b.orderDetail;
    }
    // builder + getter
}
```

Trong context Restaurant, `Restaurant` chứa **snapshot order đang được xét duyệt** (qua `OrderDetail`) + một `OrderApproval` để track kết quả. Đây là **trick** — Aggregate này không track tất cả product Restaurant đang bán, chỉ snapshot đơn hiện tại.

### `OrderApproval` — Entity (status)

```java
public class OrderApproval extends BaseEntity<OrderApprovalId> {
    private final RestaurantId restaurantId;
    private final OrderId orderId;
    private final OrderApprovalStatus approvalStatus;

    private OrderApproval(Builder b) {
        setId(b.orderApprovalId);
        this.restaurantId = b.restaurantId;
        this.orderId = b.orderId;
        this.approvalStatus = b.approvalStatus;
    }
}

public enum OrderApprovalStatus { APPROVED, REJECTED }
```

### `Product` — Entity riêng

```java
public class Product extends BaseEntity<ProductId> {
    private String name;
    private Money price;
    private boolean available;
    private final int quantity;     // quantity trong đơn

    public Product(ProductId productId, String name, Money price, int quantity) {
        setId(productId);
        this.name = name;
        this.price = price;
        this.quantity = quantity;
    }

    public void updateWithConfirmedNamePriceAndAvailability(String name, Money price, boolean available) {
        this.name = name;
        this.price = price;
        this.available = available;
    }
}
```

Khác Order Product (cũng có class `Product` riêng), Restaurant Product có thêm `quantity` và `available`. **Mỗi bounded context có Product riêng** — đúng DDD.

### `OrderDetail` — Value Object snapshot order

```java
public class OrderDetail {
    private final OrderId orderId;
    private final OrderStatus orderStatus;
    private final Money totalAmount;
    private final List<Product> products;

    private OrderDetail(Builder b) { ... }
    // builder + getter
}
```

## Domain Events

```java
public abstract class OrderApprovalEvent implements DomainEvent<OrderApproval> {
    private final OrderApproval orderApproval;
    private final RestaurantId restaurantId;
    private final List<String> failureMessages;
    private final ZonedDateTime createdAt;
    // constructor + getters
}

public class OrderApprovedEvent extends OrderApprovalEvent {
    public OrderApprovedEvent(OrderApproval orderApproval, RestaurantId restaurantId,
                              List<String> failureMessages, ZonedDateTime createdAt) {
        super(orderApproval, restaurantId, failureMessages, createdAt);
    }
}

public class OrderRejectedEvent extends OrderApprovalEvent {
    public OrderRejectedEvent(OrderApproval orderApproval, RestaurantId restaurantId,
                              List<String> failureMessages, ZonedDateTime createdAt) {
        super(orderApproval, restaurantId, failureMessages, createdAt);
    }
}
```

## Domain Service

```java
public interface RestaurantDomainService {
    OrderApprovalEvent validateOrder(Restaurant restaurant, List<String> failureMessages);
}
```

```java
@Slf4j
public class RestaurantDomainServiceImpl implements RestaurantDomainService {

    private static final String UTC = "UTC";

    @Override
    public OrderApprovalEvent validateOrder(Restaurant restaurant, List<String> failureMessages) {
        restaurant.validateOrder(failureMessages);
        log.info("Validating order with id: {}", restaurant.getOrderDetail().getOrderId().getValue());

        if (failureMessages.isEmpty()) {
            log.info("Order is approved for order id: {}", restaurant.getOrderDetail().getOrderId().getValue());
            restaurant.constructOrderApproval(OrderApprovalStatus.APPROVED);
            return new OrderApprovedEvent(restaurant.getOrderApproval(),
                restaurant.getId(),
                failureMessages,
                ZonedDateTime.now(ZoneId.of(UTC)));
        } else {
            log.info("Order is rejected for order id: {}", restaurant.getOrderDetail().getOrderId().getValue());
            restaurant.constructOrderApproval(OrderApprovalStatus.REJECTED);
            return new OrderRejectedEvent(restaurant.getOrderApproval(),
                restaurant.getId(),
                failureMessages,
                ZonedDateTime.now(ZoneId.of(UTC)));
        }
    }
}
```

`Restaurant.validateOrder()` chính là chỗ chứa business rule:

```java
// trong Restaurant aggregate root
public void validateOrder(List<String> failureMessages) {
    if (orderDetail.getOrderStatus() != OrderStatus.PAID) {
        failureMessages.add("Payment is not completed for order: " + orderDetail.getOrderId());
    }
    Money totalAmount = orderDetail.getProducts().stream()
        .map(p -> {
            if (!p.isAvailable()) {
                failureMessages.add("Product with id: " + p.getId().getValue() + " is not available");
            }
            return p.getPrice().multiply(p.getQuantity());
        })
        .reduce(Money.ZERO, Money::add);
    if (!totalAmount.equals(orderDetail.getTotalAmount())) {
        failureMessages.add("Price total is not correct for order: " + orderDetail.getOrderId());
    }
}

public void constructOrderApproval(OrderApprovalStatus orderApprovalStatus) {
    this.orderApproval = OrderApproval.builder()
        .orderApprovalId(new OrderApprovalId(UUID.randomUUID()))
        .restaurantId(this.getId())
        .orderId(this.getOrderDetail().getOrderId())
        .approvalStatus(orderApprovalStatus)
        .build();
}
```

**Đặt logic validation trong Aggregate Root** — đúng DDD. Domain Service chỉ orchestrate.

## So sánh 3 service Domain Service đến giờ

| Aspect | Order | Payment | Restaurant |
|---|---|---|---|
| Aggregate Root chính | `Order` | `Payment` | `Restaurant` |
| Phương pháp validation failure | Throw exception | Tích lũy `failureMessages` | Tích lũy `failureMessages` |
| Trả về | Single event class với status field | Khác event class (Completed/Cancelled/Failed) | Khác event class (Approved/Rejected) |
| State machine | Yes (5 trạng thái) | Đơn giản (3 trạng thái) | Chỉ APPROVED/REJECTED |
| Cross-aggregate validation | Restaurant products vs OrderItem | CreditEntry vs CreditHistory | Products available + price match |

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Reuse class `Product` của Order context | Mỗi context có Product riêng — khác semantic (Restaurant cần `available`, `quantity` snapshot) |
| Đặt `validateOrder` ở Domain Service thay vì Restaurant | Sai DDD. Logic của Restaurant → để Restaurant tự validate |
| `OrderApproval` không có `final` status | Status terminal — set 1 lần ở `constructOrderApproval` |
| Restaurant snapshot không có `Boolean active` | Quên check inactive → approve order cho quán đã đóng |

## Tóm tắt bài 28

- Restaurant domain core: 1 Aggregate Root (`Restaurant`) + 3 Entity (`Product`, `OrderApproval`, `OrderDetail`).
- Domain Service `validateOrder` orchestrate; logic chính ở `Restaurant.validateOrder()`.
- 2 Event: `OrderApprovedEvent`, `OrderRejectedEvent` extend `OrderApprovalEvent`.
- Cross-aggregate validation: status order = PAID + tất cả product available + price match.
- Cùng cấu trúc Payment (tích lũy failureMessages, multiple event classes).

**Bài kế tiếp** → [Bài 29: Restaurant Application Service + Data Access + Messaging](02-restaurant-application.md)

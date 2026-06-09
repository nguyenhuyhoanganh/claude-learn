# Bài 10: Order Aggregate Root — code thật state machine

> Bài 8 thiết kế trên giấy, bài 9 dựng base classes. Bài này **gõ Order entity hoàn chỉnh** — fields, builder, state machine, validation, exception handling. Đây là **trái tim** business logic. Code sạch ở bài này sẽ tốt cho cả 14 phase còn lại.

## Cấu trúc package trong `order-domain-core`

```text
order-domain-core/src/main/java/com/food/ordering/system/order/service/domain/
├── entity/
│   ├── Order.java               ← Aggregate Root
│   ├── OrderItem.java
│   ├── Customer.java            ← lite (chỉ id)
│   ├── Restaurant.java
│   └── Product.java
├── valueobject/
│   ├── OrderItemId.java
│   ├── StreetAddress.java       (nếu khác common-domain)
│   ├── TrackingId.java
│   └── OrderStatus.java         (extend từ common nếu cần)
├── event/
│   ├── OrderCreatedEvent.java
│   ├── OrderPaidEvent.java
│   └── OrderCancelledEvent.java
└── exception/
    └── OrderDomainException.java
```

## Customer, Restaurant, Product entity (lite version trong Order context)

```java
package com.food.ordering.system.order.service.domain.entity;

import com.food.ordering.system.domain.entity.AggregateRoot;
import com.food.ordering.system.domain.valueobject.CustomerId;

public class Customer extends AggregateRoot<CustomerId> {
    public Customer() {}
    public Customer(CustomerId customerId) { setId(customerId); }
}
```

Customer trong Order context **chỉ cần ID** để verify existence — không cần name, address. Đây là tinh thần **Bounded Context**: mỗi context có model riêng cho cùng khái niệm.

```java
public class Product extends BaseEntity<ProductId> {
    private String name;
    private Money price;

    public Product(ProductId productId) { setId(productId); }
    public Product(ProductId productId, String name, Money price) {
        setId(productId);
        this.name = name;
        this.price = price;
    }

    public void updateWithConfirmedNameAndPrice(String name, Money price) {
        this.name = name;
        this.price = price;
    }
    // getter
}
```

Product có **2 constructor**:
- `Product(productId)` — client request tạo Order chỉ gửi `productId`. Tin tưởng restaurant sẽ điền thông tin.
- `Product(productId, name, price)` — sau khi domain service load từ Restaurant.

`updateWithConfirmedNameAndPrice()` được gọi trong `OrderDomainService` khi đối chiếu Product trong order với Product hiện tại của Restaurant.

```java
public class Restaurant extends AggregateRoot<RestaurantId> {
    private final List<Product> products;
    private boolean active;

    private Restaurant(Builder b) {
        setId(b.restaurantId);
        this.products = b.products;
        this.active = b.active;
    }
    // builder + getter
}
```

Restaurant trong Order context: chứa `products` (để verify item của order có available và đúng giá) + flag `active`. Logic chi tiết về Restaurant thuộc Restaurant service — Order chỉ cần đủ data validate.

## OrderItem entity

```java
package com.food.ordering.system.order.service.domain.entity;

import com.food.ordering.system.domain.entity.BaseEntity;
import com.food.ordering.system.domain.valueobject.Money;
import com.food.ordering.system.domain.valueobject.OrderId;
import com.food.ordering.system.order.service.domain.valueobject.OrderItemId;

public class OrderItem extends BaseEntity<OrderItemId> {

    private OrderId orderId;            // back-ref set bởi Order, không final
    private final Product product;
    private final int quantity;
    private final Money price;
    private final Money subTotal;

    private OrderItem(Builder b) {
        setId(b.orderItemId);
        this.product = b.product;
        this.quantity = b.quantity;
        this.price = b.price;
        this.subTotal = b.subTotal;
    }

    void initializeOrderItem(OrderId orderId, OrderItemId orderItemId) {
        this.orderId = orderId;
        setId(orderItemId);
    }

    boolean isPriceValid() {
        return price.isGreaterThanZero() &&
               price.equals(product.getPrice()) &&
               price.multiply(quantity).equals(subTotal);
    }

    // builder + getter
}
```

3 điểm quan trọng:
1. **`initializeOrderItem` là package-private (`void` không có `public`)** — chỉ `Order` trong cùng package gọi được. Outside không thể tự ý set `orderId` cho item.
2. **`isPriceValid()` là package-private** — domain logic, chỉ Order dùng.
3. **Constructor private + Builder** — kiểm soát chặt việc tạo.

## Order Aggregate Root — full code

Khoá học chia làm 3 phần để dễ đọc.

### Phần 1: Fields + Builder

```java
package com.food.ordering.system.order.service.domain.entity;

import com.food.ordering.system.domain.entity.AggregateRoot;
import com.food.ordering.system.domain.valueobject.*;
import com.food.ordering.system.order.service.domain.exception.OrderDomainException;
import com.food.ordering.system.order.service.domain.valueobject.OrderItemId;
import com.food.ordering.system.order.service.domain.valueobject.StreetAddress;
import com.food.ordering.system.order.service.domain.valueobject.TrackingId;

import java.util.List;
import java.util.UUID;

public class Order extends AggregateRoot<OrderId> {

    private final CustomerId customerId;
    private final RestaurantId restaurantId;
    private final StreetAddress deliveryAddress;
    private final Money price;
    private final List<OrderItem> items;

    private TrackingId trackingId;
    private OrderStatus orderStatus;
    private List<String> failureMessages;

    public static final String FAILURE_MESSAGE_DELIMITER = ",";

    private Order(Builder b) {
        super.setId(b.orderId);
        this.customerId = b.customerId;
        this.restaurantId = b.restaurantId;
        this.deliveryAddress = b.deliveryAddress;
        this.price = b.price;
        this.items = b.items;
        this.trackingId = b.trackingId;
        this.orderStatus = b.orderStatus;
        this.failureMessages = b.failureMessages;
    }

    public static Builder builder() { return new Builder(); }

    public static final class Builder {
        private OrderId orderId;
        private CustomerId customerId;
        private RestaurantId restaurantId;
        private StreetAddress deliveryAddress;
        private Money price;
        private List<OrderItem> items;
        private TrackingId trackingId;
        private OrderStatus orderStatus;
        private List<String> failureMessages;

        public Builder orderId(OrderId v)              { this.orderId = v; return this; }
        public Builder customerId(CustomerId v)        { this.customerId = v; return this; }
        public Builder restaurantId(RestaurantId v)    { this.restaurantId = v; return this; }
        public Builder deliveryAddress(StreetAddress v){ this.deliveryAddress = v; return this; }
        public Builder price(Money v)                  { this.price = v; return this; }
        public Builder items(List<OrderItem> v)        { this.items = v; return this; }
        public Builder trackingId(TrackingId v)        { this.trackingId = v; return this; }
        public Builder orderStatus(OrderStatus v)      { this.orderStatus = v; return this; }
        public Builder failureMessages(List<String> v) { this.failureMessages = v; return this; }

        public Order build() { return new Order(this); }
    }

    // getters (omitted)
}
```

Builder pattern: **mọi state phải truyền qua builder**, không có setter public. Đây là cách enforce immutability lúc create. Sau khi build, state chỉ đổi qua method được kiểm soát.

### Phần 2: Initialize + Validate (chạy lúc tạo Order)

```java
public void initializeOrder() {
    setId(new OrderId(UUID.randomUUID()));
    trackingId = new TrackingId(UUID.randomUUID());
    orderStatus = OrderStatus.PENDING;
    initializeOrderItems();
}

private void initializeOrderItems() {
    long itemId = 1;
    for (OrderItem item : items) {
        item.initializeOrderItem(super.getId(), new OrderItemId(itemId++));
    }
}

public void validateOrder() {
    validateInitialOrder();
    validateTotalPrice();
    validateItemsPrice();
}

private void validateInitialOrder() {
    if (orderStatus != null || getId() != null) {
        throw new OrderDomainException("Order is not in correct state for initialization!");
    }
}

private void validateTotalPrice() {
    if (price == null || !price.isGreaterThanZero()) {
        throw new OrderDomainException("Total price must be greater than zero!");
    }
}

private void validateItemsPrice() {
    Money orderItemsTotal = items.stream().map(orderItem -> {
        validateItemPrice(orderItem);
        return orderItem.getSubTotal();
    }).reduce(Money.ZERO, Money::add);

    if (!price.equals(orderItemsTotal)) {
        throw new OrderDomainException("Total price " + price.getAmount()
            + " is not equal to Order items total " + orderItemsTotal.getAmount() + "!");
    }
}

private void validateItemPrice(OrderItem orderItem) {
    if (!orderItem.isPriceValid()) {
        throw new OrderDomainException(
            "Order item price " + orderItem.getPrice().getAmount() +
            " is not valid for product " + orderItem.getProduct().getId().getValue());
    }
}
```

Quan sát:
- `initializeOrder()` được gọi **sau khi build** từ DTO của client. Lúc này client chỉ có `customerId`, `restaurantId`, `items`. Order tự sinh `orderId`, `trackingId`, set `PENDING`.
- `validateOrder()` được gọi trong `OrderDomainService`, **không** trong `initializeOrder()`. Vì validate cần thông tin Restaurant — không thuộc Order isolated.
- 2 validation hỗn hợp: state machine (`validateInitialOrder`) + business invariant (`validateTotalPrice`, `validateItemsPrice`).

### Phần 3: State changing methods

```java
public void pay() {
    if (orderStatus != OrderStatus.PENDING) {
        throw new OrderDomainException("Order is not in correct state for pay operation!");
    }
    orderStatus = OrderStatus.PAID;
}

public void approve() {
    if (orderStatus != OrderStatus.PAID) {
        throw new OrderDomainException("Order is not in correct state for approve operation!");
    }
    orderStatus = OrderStatus.APPROVED;
}

public void initCancel(List<String> failureMessages) {
    if (orderStatus != OrderStatus.PAID) {
        throw new OrderDomainException("Order is not in correct state for initCancel operation!");
    }
    orderStatus = OrderStatus.CANCELLING;
    updateFailureMessages(failureMessages);
}

public void cancel(List<String> failureMessages) {
    if (!(orderStatus == OrderStatus.CANCELLING || orderStatus == OrderStatus.PENDING)) {
        throw new OrderDomainException("Order is not in correct state for cancel operation!");
    }
    orderStatus = OrderStatus.CANCELLED;
    updateFailureMessages(failureMessages);
}

private void updateFailureMessages(List<String> failureMessages) {
    if (this.failureMessages != null && failureMessages != null) {
        this.failureMessages.addAll(
            failureMessages.stream().filter(m -> !m.isEmpty()).toList());
    }
    if (this.failureMessages == null) {
        this.failureMessages = failureMessages;
    }
}
```

State transition rất nghiêm:
- `pay()` chỉ chạy nếu đang `PENDING`. Nếu gọi 2 lần → throw ngay.
- `approve()` chỉ chạy nếu `PAID`. Không thể approve trực tiếp từ `PENDING` (phải đi qua `PAID` trước).
- `initCancel()` là bước intermediate khi compensation: `PAID → CANCELLING`. Chờ payment refund xong mới `CANCELLING → CANCELLED` qua `cancel()`.
- `cancel()` accept cả `CANCELLING` (compensation flow) và `PENDING` (payment lỗi ngay từ đầu).

Quan sát: code đọc **rất khớp business**. PM hỏi "có thể từ `PAID` cancel thẳng không?" — dev nhìn code: không, phải qua `initCancel` để vào `CANCELLING` trước. Code = tài liệu nghiệp vụ.

## State machine diagram đối chiếu code

```text
                  initializeOrder()
        ────────────────────────────► [PENDING]
                                         │
                            ┌────────────┼──────────────────┐
                            │ pay()      │                  │ cancel(msgs)
                            │            │                  │ (payment fail
                            ▼            │                  │  từ PENDING)
                         [PAID]          │                  │
                            │            │                  ▼
                ┌───────────┴────┐       │            [CANCELLED]
                │ approve()      │ initCancel(msgs)
                │                │       │
                ▼                ▼       │
            [APPROVED]      [CANCELLING] │
                                  │      │
                                  │ cancel(msgs)
                                  ▼      │
                              [CANCELLED]┘
```

Match 1-1 với code. Đây là sức mạnh của state machine trong entity.

## Tại sao throw exception mà không trả `boolean`?

```java
// Cách A: trả boolean
public boolean pay() {
    if (orderStatus != OrderStatus.PENDING) return false;
    orderStatus = OrderStatus.PAID;
    return true;
}

// Cách B (khoá học): throw exception
public void pay() {
    if (orderStatus != OrderStatus.PENDING) throw new OrderDomainException(...);
    orderStatus = OrderStatus.PAID;
}
```

Khoá học chọn B vì:
- Caller **không thể quên** check return. Exception buộc handle.
- Thông tin lỗi rõ ràng (message + stack trace) → debug nhanh.
- Match Spring `@Transactional` — Runtime Exception trigger rollback tự nhiên.
- Trường hợp `pay()` từ sai state là **bug logic**, không phải kết quả expected — exception phù hợp.

Trade-off: phía caller phải `try-catch`. Nhưng catch ở `ControllerAdvice` (Spring exception handler) là một chỗ duy nhất, không tản mác.

## OrderItemId và TrackingId — VO riêng của Order

```java
package com.food.ordering.system.order.service.domain.valueobject;

public class OrderItemId extends BaseId<Long> {
    public OrderItemId(Long value) { super(value); }
}

public class TrackingId extends BaseId<java.util.UUID> {
    public TrackingId(java.util.UUID value) { super(value); }
}
```

`OrderItemId` dùng `Long` chứ không UUID vì:
- Item ID scope trong Order — không cần global unique.
- Long index nhanh hơn UUID.
- Sequence 1, 2, 3... dễ đọc khi debug.

`TrackingId` dùng UUID vì:
- Expose ra REST → cần unique global.
- Không cho client guess (số sequence dễ enumerate).

## OrderDomainException

```java
package com.food.ordering.system.order.service.domain.exception;

import com.food.ordering.system.domain.exception.DomainException;

public class OrderDomainException extends DomainException {
    public OrderDomainException(String message)               { super(message); }
    public OrderDomainException(String message, Throwable t)  { super(message, t); }
}
```

Extend `DomainException` (từ common). Controller advice catch riêng `OrderDomainException` để trả HTTP 400 (bad request), khác với `OrderNotFoundException` trả 404 (sẽ tạo sau).

## Unit test Order entity — không cần Spring

```java
class OrderTest {

    @Test
    void initializeOrder_setsPendingState() {
        Order order = createValidOrder();
        order.initializeOrder();
        assertEquals(OrderStatus.PENDING, order.getOrderStatus());
        assertNotNull(order.getId());
        assertNotNull(order.getTrackingId());
    }

    @Test
    void pay_fromNonPending_throwsException() {
        Order order = createValidOrder();
        order.initializeOrder();
        order.pay();    // PENDING → PAID OK
        assertThrows(OrderDomainException.class, order::pay);  // PAID → pay() FAIL
    }

    @Test
    void approve_requiresPaid() {
        Order order = createValidOrder();
        order.initializeOrder();   // PENDING
        assertThrows(OrderDomainException.class, order::approve);  // PENDING → approve() FAIL
    }

    @Test
    void initCancel_thenCancel_movesToCancelled() {
        Order order = createValidOrder();
        order.initializeOrder();
        order.pay();
        order.initCancel(List.of("Restaurant rejected"));
        assertEquals(OrderStatus.CANCELLING, order.getOrderStatus());
        order.cancel(List.of());
        assertEquals(OrderStatus.CANCELLED, order.getOrderStatus());
    }

    private Order createValidOrder() {
        Product p = new Product(new ProductId(UUID.randomUUID()), "Pizza", new Money(new BigDecimal("50.00")));
        OrderItem item = OrderItem.builder()
            .product(p).quantity(1)
            .price(p.getPrice())
            .subTotal(p.getPrice().multiply(1))
            .build();
        return Order.builder()
            .customerId(new CustomerId(UUID.randomUUID()))
            .restaurantId(new RestaurantId(UUID.randomUUID()))
            .deliveryAddress(new StreetAddress(UUID.randomUUID(), "1 Main", "10000", "Hanoi"))
            .price(new Money(new BigDecimal("50.00")))
            .items(List.of(item))
            .build();
    }
}
```

Test chạy < 100ms. Không cần Spring, không cần testcontainer. **Đó là phần thưởng của domain core pure**.

## Tóm tắt bài 10

- `Order` extends `AggregateRoot<OrderId>`, fields được set qua Builder (immutable lúc tạo).
- `initializeOrder()` sinh ID, trackingId, set PENDING — không cần thông tin từ ngoài.
- `validateOrder()` tách riêng vì cần Domain Service inject data trước.
- 4 state-changing methods: `pay`, `approve`, `initCancel`, `cancel`. Mỗi method check state trước, throw exception nếu sai.
- `OrderItem.initializeOrderItem()` là package-private — chỉ Order gọi. Outside không tự sửa item.
- Domain logic test được bằng JUnit thuần — Spring không tham gia.

**Bài kế tiếp** → [Bài 11: Domain Events và Order Domain Service](05-domain-events-domain-service.md)

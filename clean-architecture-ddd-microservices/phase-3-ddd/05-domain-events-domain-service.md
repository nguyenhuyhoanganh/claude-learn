# Bài 11: Domain Events và Order Domain Service

> Order entity đã xong (bài 10). Giờ ta cần: (1) **Event** mô tả "việc đã xảy ra" để bounded context khác lắng nghe, (2) **Domain Service** điều phối logic không thuộc 1 entity riêng lẻ. Bài này code cả 2 — cùng giải thích vì sao DDD tách chúng ra khỏi entity.

## Domain Event — "fact đã xảy ra trong domain"

Quy tắc đặt tên: **danh từ + past participle**. Không phải "Pay" mà "PaymentCompleted". Không phải "CreateOrder" mà "OrderCreated".

3 event Order cần:
- `OrderCreatedEvent` — Order vừa được tạo (sau `initializeOrder()` + `validateOrder()`). Trigger Payment service.
- `OrderPaidEvent` — Order vừa pay xong. Trigger Restaurant service.
- `OrderCancelledEvent` — Order vừa cancel. Có thể trigger refund hoặc notification.

### OrderCreatedEvent — code

```java
package com.food.ordering.system.order.service.domain.event;

import com.food.ordering.system.domain.event.DomainEvent;
import com.food.ordering.system.order.service.domain.entity.Order;

import java.time.ZonedDateTime;

public class OrderCreatedEvent implements DomainEvent<Order> {

    private final Order order;
    private final ZonedDateTime createdAt;

    public OrderCreatedEvent(Order order, ZonedDateTime createdAt) {
        this.order = order;
        this.createdAt = createdAt;
    }

    public Order getOrder()          { return order; }
    public ZonedDateTime getCreatedAt() { return createdAt; }
}
```

Đặc trưng:
- `final` fields, **không setter** → immutable.
- Constructor nhận hết — bằng chứng "fact đã xảy ra, không thể sửa".
- `createdAt` luôn `ZonedDateTime` (UTC) — quan trọng cho ordering event xuyên timezone.
- Generic `DomainEvent<Order>` chỉ rõ event này gắn với Order aggregate.

### OrderPaidEvent & OrderCancelledEvent

Tương tự, cùng pattern:

```java
public class OrderPaidEvent implements DomainEvent<Order> {
    private final Order order;
    private final ZonedDateTime createdAt;
    public OrderPaidEvent(Order order, ZonedDateTime createdAt) { ... }
}

public class OrderCancelledEvent implements DomainEvent<Order> {
    private final Order order;
    private final ZonedDateTime createdAt;
    public OrderCancelledEvent(Order order, ZonedDateTime createdAt) { ... }
}
```

3 class giống nhau cấu trúc — vì sao không gộp 1 class với enum? Vì:
- **Type safety**: handler chỉ nhận event mình quan tâm (Payment chỉ nhận `OrderCreatedEvent`).
- **Tương lai mở rộng**: mỗi event có thể thêm field khác (vd `OrderCancelledEvent` thêm `failureMessages: List<String>`).
- **Đọc code rõ**: thấy `OrderPaidEvent` biết ngay nghĩa, không phải kiểm tra enum.

### Bonus: OrderCancelledEvent thực tế cần thêm gì?

Trong code khoá, event class giữ tối thiểu (chỉ `Order` + `createdAt`). Vì sao? — Vì Order entity đã chứa đủ thông tin (`failureMessages`, `orderStatus`). Subscriber có thể đọc trực tiếp.

Production thực tế cân nhắc:
- Có nên chứa `Order` đầy đủ trong event không? — Tốt cho convenience, nhưng vô tình lộ internal state cho subscriber. Một approach an toàn hơn: event chỉ chứa **những field public thực sự cần** (`orderId`, `customerId`, `failureMessages`).
- Khoá học dùng cách "chứa Order full" cho đơn giản. Khi convert sang Avro/Kafka (phase-4), chỉ map các field public.

## Khi nào fire event?

Trong khoá học, event được tạo trong **Domain Service** (không phải trong entity). Vì sao?

```java
// Cách A: entity tự tạo event (event sourcing nguyên thuỷ)
public class Order {
    public OrderCreatedEvent initializeAndCreate() {
        initializeOrder();
        return new OrderCreatedEvent(this, ZonedDateTime.now());
    }
}

// Cách B (khoá học): Domain Service orchestrate
public class OrderDomainServiceImpl {
    public OrderCreatedEvent validateAndInitiateOrder(Order order, Restaurant restaurant) {
        validateRestaurant(restaurant);
        setOrderProductInformation(order, restaurant);
        order.validateOrder();
        order.initializeOrder();
        log.info("Order with id: {} is initiated", order.getId().getValue());
        return new OrderCreatedEvent(order, ZonedDateTime.now(ZoneId.of(UTC)));
    }
}
```

Cách B tách orchestration ra Domain Service vì:
- Tạo event cần data từ **nhiều entity** (Order + Restaurant) → không thuộc 1 entity riêng.
- Event timestamp cần `ZoneId` cố định → service quản lý.
- Validation chạy theo thứ tự (`validateRestaurant` rồi `validateOrder`) → cần coordinator.

Cách A vẫn đúng DDD, nhưng cách B phù hợp với cấu trúc khoá học.

## Domain Service — interface

```java
package com.food.ordering.system.order.service.domain;

import com.food.ordering.system.order.service.domain.entity.Order;
import com.food.ordering.system.order.service.domain.entity.Restaurant;
import com.food.ordering.system.order.service.domain.event.OrderCancelledEvent;
import com.food.ordering.system.order.service.domain.event.OrderCreatedEvent;
import com.food.ordering.system.order.service.domain.event.OrderPaidEvent;

import java.util.List;

public interface OrderDomainService {

    OrderCreatedEvent validateAndInitiateOrder(Order order, Restaurant restaurant);

    OrderPaidEvent payOrder(Order order);

    void approveOrder(Order order);

    OrderCancelledEvent cancelOrderPayment(Order order, List<String> failureMessages);

    void cancelOrder(Order order, List<String> failureMessages);
}
```

5 method. Một số trả event, một số không:

| Method | Trả event vì | Không trả vì |
|---|---|---|
| `validateAndInitiateOrder` | Cần publish `OrderCreatedEvent` để Payment biết | — |
| `payOrder` | Cần publish `OrderPaidEvent` để Restaurant biết | — |
| `approveOrder` | — | Approved là terminal state, không cần thông báo ai |
| `cancelOrderPayment` | Cần publish `OrderCancelledEvent` cho refund flow | — |
| `cancelOrder` | — | Final cancel — kết thúc luôn, không phát event nữa |

## Domain Service — implementation

```java
package com.food.ordering.system.order.service.domain;

import com.food.ordering.system.domain.valueobject.ProductId;
import com.food.ordering.system.order.service.domain.entity.Order;
import com.food.ordering.system.order.service.domain.entity.Product;
import com.food.ordering.system.order.service.domain.entity.Restaurant;
import com.food.ordering.system.order.service.domain.event.OrderCancelledEvent;
import com.food.ordering.system.order.service.domain.event.OrderCreatedEvent;
import com.food.ordering.system.order.service.domain.event.OrderPaidEvent;
import com.food.ordering.system.order.service.domain.exception.OrderDomainException;
import lombok.extern.slf4j.Slf4j;

import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;

@Slf4j
public class OrderDomainServiceImpl implements OrderDomainService {

    private static final String UTC = "UTC";

    @Override
    public OrderCreatedEvent validateAndInitiateOrder(Order order, Restaurant restaurant) {
        validateRestaurant(restaurant);
        setOrderProductInformation(order, restaurant);
        order.validateOrder();
        order.initializeOrder();
        log.info("Order with id: {} is initiated", order.getId().getValue());
        return new OrderCreatedEvent(order, ZonedDateTime.now(ZoneId.of(UTC)));
    }

    @Override
    public OrderPaidEvent payOrder(Order order) {
        order.pay();
        log.info("Order with id: {} is paid", order.getId().getValue());
        return new OrderPaidEvent(order, ZonedDateTime.now(ZoneId.of(UTC)));
    }

    @Override
    public void approveOrder(Order order) {
        order.approve();
        log.info("Order with id: {} is approved", order.getId().getValue());
    }

    @Override
    public OrderCancelledEvent cancelOrderPayment(Order order, List<String> failureMessages) {
        order.initCancel(failureMessages);
        log.info("Order payment is cancelling for order id: {}", order.getId().getValue());
        return new OrderCancelledEvent(order, ZonedDateTime.now(ZoneId.of(UTC)));
    }

    @Override
    public void cancelOrder(Order order, List<String> failureMessages) {
        order.cancel(failureMessages);
        log.info("Order with id: {} is cancelled", order.getId().getValue());
    }

    private void validateRestaurant(Restaurant restaurant) {
        if (!restaurant.isActive()) {
            throw new OrderDomainException(
                "Restaurant with id " + restaurant.getId().getValue() + " is currently not active!");
        }
    }

    private void setOrderProductInformation(Order order, Restaurant restaurant) {
        order.getItems().forEach(orderItem ->
            restaurant.getProducts().forEach(restaurantProduct -> {
                Product currentProduct = orderItem.getProduct();
                if (currentProduct.equals(restaurantProduct)) {
                    currentProduct.updateWithConfirmedNameAndPrice(
                        restaurantProduct.getName(), restaurantProduct.getPrice());
                }
            })
        );
    }
}
```

Phân tích từng method:

### `validateAndInitiateOrder` — flow đầy đủ tạo Order

```text
1. validateRestaurant(restaurant)       ← restaurant active?
2. setOrderProductInformation(...)      ← đối chiếu Product price với Restaurant.products
3. order.validateOrder()                ← Order tự validate (totalPrice, items)
4. order.initializeOrder()              ← Order tự set state PENDING + sinh ID
5. return OrderCreatedEvent             ← fact: order đã tạo
```

Thứ tự **rất quan trọng**:
- Validate Restaurant **trước** vì cần Restaurant active.
- `setOrderProductInformation` chạy trước `validateOrder` vì `validateItemsPrice` cần product price chính xác.
- `validateOrder` trước `initializeOrder` vì validate có thể fail → không tạo gì.

### `setOrderProductInformation` — kỹ thuật "đối chiếu price"

Client gửi lên `OrderItem` với `Product(productId, price)`. Nhưng giá đó có thể bị tamper. Service phải:
1. Lookup `Restaurant.products` theo `productId`.
2. So sánh giá client gửi với giá Restaurant đang niêm yết.
3. Cập nhật `Product` trong OrderItem với giá xác thực từ Restaurant.

`Product.equals` dựa vào ID (vì `Product extends BaseEntity`). Hai Product cùng `productId` = bằng nhau → match → update.

Nếu giá lệch, `validateItemsPrice()` (gọi sau) sẽ throw — block order.

> **Lưu ý**: cách code dùng nested `forEach` là O(n×m). Với restaurant có nhiều products, dùng `Map<ProductId, Product>` sẽ O(n). Khoá học giữ đơn giản, production cần optimize.

### `payOrder` / `approveOrder` / `cancelOrder` — gọn

Mỗi method chỉ gọi state-change của entity + log + (optional) tạo event. Đó là vai trò "**điều phối**" của Domain Service — không tự làm logic, chỉ ra lệnh.

## Khác biệt Domain Service vs Application Service

| | Domain Service | Application Service |
|---|---|---|
| Thuộc tầng | `order-domain-core` | `order-application-service` |
| Phụ thuộc Spring | Không | Có (`@Service`, `@Transactional`, `@Autowired`) |
| Phụ thuộc repository | Không | Có |
| Phụ thuộc message publisher | Không | Có |
| Chứa business rule | Có (validate, orchestration logic) | Không (chỉ orchestration use case) |
| Là input port | Không (interface nội bộ domain) | Có (`OrderApplicationService` là input port) |
| Gọi bởi | `OrderApplicationService` (app service) | REST Controller, Kafka Listener |

```text
   REST/Kafka
       │
       ▼
   ┌──────────────────────────────────┐
   │  OrderApplicationService          │  ← input port + @Service Spring
   │   - Validate input                 │
   │   - Mapper DTO → Domain            │
   │   - Load Customer, Restaurant      │
   │   - Call OrderDomainService         │
   │   - Save Order                      │
   │   - Publish event                   │
   └──────────────┬──────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────┐
   │  OrderDomainService               │  ← pure domain, không Spring
   │   - validateAndInitiateOrder      │
   │   - payOrder / approveOrder / ... │
   └──────────────────────────────────┘
                  │
                  ▼
   ┌──────────────────────────────────┐
   │  Order (Aggregate Root)           │  ← state machine, invariant
   └──────────────────────────────────┘
```

Application Service: **tổ chức workflow xung quanh** domain (load data, save, publish event).
Domain Service: **chứa business orchestration** trong domain (validate cross-entity, sinh event).
Entity: **state machine** + **invariant** của chính nó.

## Phụ thuộc của OrderDomainServiceImpl — Lombok

Một dependency duy nhất: `@Slf4j` từ Lombok cho logger. Cần thêm `lombok` ở `order-domain-core/pom.xml`:

```xml
<dependency>
    <groupId>org.projectlombok</groupId>
    <artifactId>lombok</artifactId>
    <optional>true</optional>
</dependency>
```

Lombok là **compile-time annotation processor** — chỉ tham gia generate code lúc compile, không xuất hiện runtime. Vì vậy được phép trong domain core (không "phụ thuộc framework runtime").

Vẫn có nhánh phản đối Lombok trong domain core vì nó là **dependency external**. Nếu thật sự khắt khe, tự khai báo `Logger log = LoggerFactory.getLogger(...)`. Khoá học chấp nhận Lombok cho cleanliness.

## Unit test Domain Service

```java
class OrderDomainServiceImplTest {

    private final OrderDomainService domainService = new OrderDomainServiceImpl();

    @Test
    void validateAndInitiateOrder_setsPriceFromRestaurantAndInitiates() {
        Restaurant restaurant = createActiveRestaurantWithPizza("Pizza", new BigDecimal("50.00"));
        Order order = createOrderRequesting("Pizza", new BigDecimal("50.00"), 1);

        OrderCreatedEvent event = domainService.validateAndInitiateOrder(order, restaurant);

        assertEquals(OrderStatus.PENDING, order.getOrderStatus());
        assertNotNull(event);
        assertEquals(order.getId(), event.getOrder().getId());
    }

    @Test
    void validateAndInitiateOrder_rejectsInactiveRestaurant() {
        Restaurant restaurant = createInactiveRestaurant();
        Order order = createValidOrder();
        assertThrows(OrderDomainException.class,
            () -> domainService.validateAndInitiateOrder(order, restaurant));
    }

    @Test
    void payOrder_returnsEventAndChangesState() {
        Order order = initiatedOrder();
        OrderPaidEvent event = domainService.payOrder(order);
        assertEquals(OrderStatus.PAID, order.getOrderStatus());
        assertEquals(order.getId(), event.getOrder().getId());
    }
}
```

100% JUnit thuần, không Spring. Test < 50ms.

## Bẫy thường gặp với Domain Event và Domain Service

| Bẫy | Tránh bằng cách |
|---|---|
| Domain Event có setter / mutable field | Field `final`, constructor chỉ nhận đủ. Không setter. |
| Tạo Event với `LocalDateTime` thay vì `ZonedDateTime` | Mất thông tin timezone → ordering event xuyên timezone sai. Dùng `ZonedDateTime` UTC. |
| Domain Service gọi `repository.save(...)` | SAI. Service không biết repository. Save là việc Application Service. |
| Tạo nhiều method `OrderDomainService.findOrder(...)` | SAI. Find là việc Repository. Domain Service chỉ chứa logic business. |
| Inject Spring bean vào Domain Service | SAI. Domain Service thuần Java, không Spring. |
| Event class chứa `Map<String, Object>` để "linh hoạt" | SAI. Mất type safety. Tạo class riêng với field explicit. |
| Đặt logic state transition trong Domain Service | SAI (về DDD). State machine thuộc Entity. Domain Service chỉ orchestrate. |
| Application Service chứa logic validate price | SAI. Validate là business rule → Entity hoặc Domain Service. |

## Tóm tắt bài 11

- **Domain Event** là fact đã xảy ra, đặt tên past-participle, immutable, có `ZonedDateTime UTC`.
- **3 event Order**: `OrderCreatedEvent`, `OrderPaidEvent`, `OrderCancelledEvent`.
- **Domain Service** orchestrate logic không thuộc entity riêng (validate cross-entity, sinh event).
- `validateAndInitiateOrder()` là flow đầy đủ: validate Restaurant → set Product price → validate Order → initialize → trả event.
- Domain Service **không phụ thuộc Spring**, **không gọi repository**. Đó là việc của Application Service.
- Unit test bằng JUnit thuần, < 50ms mỗi test.

**Bài kế tiếp** → [Bài 12: Application Service — DTO, ports, command handlers](06-application-service-ports.md)

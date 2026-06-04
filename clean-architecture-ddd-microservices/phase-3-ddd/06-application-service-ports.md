# Bài 12: Application Service — DTO, ports, command handlers

> Domain core đã pure. Bây giờ ta dựng **vỏ ngoài domain** — Application Service module: nơi định nghĩa **input port** (REST/Kafka gọi vào), **output port** (Repository, MessagePublisher), **DTO** (Command/Response), **Mapper**, và **Command Handler** orchestrate. Đây là chỗ Spring vào cuộc — nhưng vẫn không động đến domain.

## Cấu trúc package — `order-application-service`

```text
order-application-service/src/main/java/com/food/ordering/system/order/service/domain/
├── OrderApplicationServiceImpl.java          ← Implementation input port
├── OrderCreateHelper.java                    ← Helper cho create flow
├── OrderCreateCommandHandler.java            ← Command Handler tạo Order
├── OrderTrackCommandHandler.java             ← Command Handler track Order
├── dto/
│   ├── create/
│   │   ├── CreateOrderCommand.java
│   │   ├── CreateOrderResponse.java
│   │   ├── OrderAddress.java
│   │   └── OrderItem.java
│   ├── track/
│   │   ├── TrackOrderQuery.java
│   │   └── TrackOrderResponse.java
│   └── message/
│       ├── CustomerModel.java
│       ├── PaymentResponse.java
│       └── RestaurantApprovalResponse.java
├── mapper/
│   └── OrderDataMapper.java
├── ports/
│   ├── input/
│   │   ├── service/
│   │   │   └── OrderApplicationService.java          ← input port từ REST
│   │   └── message/
│   │       └── listener/
│   │           ├── PaymentResponseMessageListener.java   ← input port từ Kafka
│   │           └── RestaurantApprovalResponseMessageListener.java
│   └── output/
│       ├── repository/
│       │   ├── OrderRepository.java
│       │   ├── CustomerRepository.java
│       │   └── RestaurantRepository.java
│       └── message/
│           └── publisher/
│               └── payment/
│                   └── OrderCreatedPaymentRequestMessagePublisher.java
└── outbox/   (sẽ thêm ở phase-9)
```

Cấu trúc rõ: `ports/input/` là **nơi caller ngoài (REST, Kafka) gọi vào**; `ports/output/` là **nơi domain ra ngoài (DB, Kafka publish)**.

## DTO — Command, Query, Response

Bắt đầu từ Command/Response cho create order. Dùng record của Java 17 cho ngắn gọn:

```java
package com.food.ordering.system.order.service.domain.dto.create;

import lombok.Builder;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Builder
public record CreateOrderCommand(
    UUID customerId,
    UUID restaurantId,
    BigDecimal price,
    List<OrderItem> items,
    OrderAddress address
) {}
```

```java
public record OrderItem(
    UUID productId,
    Integer quantity,
    BigDecimal price,
    BigDecimal subTotal
) {}

public record OrderAddress(
    String street,
    String postalCode,
    String city
) {}

public record CreateOrderResponse(
    UUID orderTrackingId,
    OrderStatus orderStatus,
    String message
) {}
```

3 quan sát:

| Decision | Lý do |
|---|---|
| Dùng `record` thay `class` | Java 17 record auto immutable + concise + equals/hashCode/toString sẵn |
| `@Builder` của Lombok | Builder cho record vẫn rất hữu ích, nhất là DTO 5+ field |
| DTO field dùng kiểu **primitive** (UUID, BigDecimal) | DTO là **ngôn ngữ ngoài domain** — không dùng VO. Mapper sẽ convert sang VO. |

### TrackOrderQuery + Response

```java
@Builder
public record TrackOrderQuery(UUID orderTrackingId) {}

@Builder
public record TrackOrderResponse(
    UUID orderTrackingId,
    OrderStatus orderStatus,
    List<String> failureMessages
) {}
```

### Validation bằng Bean Validation

DTO **thêm** annotation validation. Spring Web tự chạy khi `@Valid`:

```java
public record CreateOrderCommand(
    @NotNull UUID customerId,
    @NotNull UUID restaurantId,
    @NotNull BigDecimal price,
    @NotNull List<OrderItem> items,
    @NotNull OrderAddress address
) {}
```

Validation **chống null/format** — không phải business rule. Business rule (tổng tiền > 0, item price khớp restaurant) ở domain.

## Mapper — OrderDataMapper

```java
package com.food.ordering.system.order.service.domain.mapper;

import com.food.ordering.system.domain.valueobject.*;
import com.food.ordering.system.order.service.domain.dto.create.CreateOrderCommand;
import com.food.ordering.system.order.service.domain.dto.create.CreateOrderResponse;
import com.food.ordering.system.order.service.domain.dto.create.OrderAddress;
import com.food.ordering.system.order.service.domain.dto.track.TrackOrderResponse;
import com.food.ordering.system.order.service.domain.entity.Order;
import com.food.ordering.system.order.service.domain.entity.OrderItem;
import com.food.ordering.system.order.service.domain.entity.Product;
import com.food.ordering.system.order.service.domain.entity.Restaurant;
import com.food.ordering.system.order.service.domain.valueobject.StreetAddress;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.stream.Collectors;

@Component
public class OrderDataMapper {

    public Restaurant createOrderCommandToRestaurant(CreateOrderCommand command) {
        return Restaurant.builder()
            .restaurantId(new RestaurantId(command.restaurantId()))
            .products(command.items().stream()
                .map(orderItem -> new Product(new ProductId(orderItem.productId())))
                .collect(Collectors.toList()))
            .build();
    }

    public Order createOrderCommandToOrder(CreateOrderCommand command) {
        return Order.builder()
            .customerId(new CustomerId(command.customerId()))
            .restaurantId(new RestaurantId(command.restaurantId()))
            .deliveryAddress(orderAddressToStreetAddress(command.address()))
            .price(new Money(command.price()))
            .items(orderItemsToOrderItemEntities(command.items()))
            .build();
    }

    public CreateOrderResponse orderToCreateOrderResponse(Order order, String message) {
        return CreateOrderResponse.builder()
            .orderTrackingId(order.getTrackingId().getValue())
            .orderStatus(order.getOrderStatus())
            .message(message)
            .build();
    }

    public TrackOrderResponse orderToTrackOrderResponse(Order order) {
        return TrackOrderResponse.builder()
            .orderTrackingId(order.getTrackingId().getValue())
            .orderStatus(order.getOrderStatus())
            .failureMessages(order.getFailureMessages())
            .build();
    }

    private List<OrderItem> orderItemsToOrderItemEntities(List<...> orderItems) {
        return orderItems.stream().map(orderItem ->
            OrderItem.builder()
                .product(new Product(new ProductId(orderItem.productId())))
                .price(new Money(orderItem.price()))
                .quantity(orderItem.quantity())
                .subTotal(new Money(orderItem.subTotal()))
                .build()).collect(Collectors.toList());
    }

    private StreetAddress orderAddressToStreetAddress(OrderAddress orderAddress) {
        return new StreetAddress(UUID.randomUUID(),
            orderAddress.street(), orderAddress.postalCode(), orderAddress.city());
    }
}
```

Mapper là **biên giới** giữa "thế giới primitives" (DTO) và "thế giới domain" (VO/Entity). Đây là chỗ wrap `UUID → CustomerId`, `BigDecimal → Money`.

Chú ý `createOrderCommandToRestaurant`: từ command tạo ra `Restaurant` **chỉ với products có productId** — chưa có name/price. Sau đó Application Service load Restaurant đầy đủ từ DB qua `RestaurantRepository`. Hai object đó merge trong `OrderDomainService.setOrderProductInformation()`.

## Output Ports — Repository và MessagePublisher

```java
package com.food.ordering.system.order.service.domain.ports.output.repository;

import com.food.ordering.system.domain.valueobject.OrderId;
import com.food.ordering.system.order.service.domain.entity.Order;
import com.food.ordering.system.order.service.domain.valueobject.TrackingId;

import java.util.Optional;

public interface OrderRepository {
    Order save(Order order);
    Optional<Order> findByTrackingId(TrackingId trackingId);
}
```

```java
public interface CustomerRepository {
    Optional<Customer> findCustomer(UUID customerId);
}

public interface RestaurantRepository {
    Optional<Restaurant> findRestaurantInformation(Restaurant restaurant);
}
```

Tất cả ở `ports/output/repository/`. Domain interfaces — implementation ở `order-dataaccess` (phase-5).

Output port cho Kafka publisher:

```java
package com.food.ordering.system.order.service.domain.ports.output.message.publisher.payment;

import com.food.ordering.system.domain.event.publisher.DomainEventPublisher;
import com.food.ordering.system.order.service.domain.event.OrderCreatedEvent;

public interface OrderCreatedPaymentRequestMessagePublisher extends DomainEventPublisher<OrderCreatedEvent> {
    // marker - extend DomainEventPublisher<OrderCreatedEvent>
}
```

Tên dài nhưng rõ: "publisher cho event `OrderCreated`, gửi message `PaymentRequest`". Tương tự:
- `OrderCancelledPaymentRequestMessagePublisher` — gửi cancel request đến Payment.
- `OrderPaidRestaurantRequestMessagePublisher` — gửi approval request đến Restaurant.

## Input Ports — OrderApplicationService

```java
package com.food.ordering.system.order.service.domain.ports.input.service;

import com.food.ordering.system.order.service.domain.dto.create.CreateOrderCommand;
import com.food.ordering.system.order.service.domain.dto.create.CreateOrderResponse;
import com.food.ordering.system.order.service.domain.dto.track.TrackOrderQuery;
import com.food.ordering.system.order.service.domain.dto.track.TrackOrderResponse;
import jakarta.validation.Valid;

public interface OrderApplicationService {
    CreateOrderResponse createOrder(@Valid CreateOrderCommand createOrderCommand);
    TrackOrderResponse trackOrder(@Valid TrackOrderQuery trackOrderQuery);
}
```

`@Valid` ở interface → Spring AOP sẽ chạy validation trước khi invoke method, ném `ConstraintViolationException` nếu fail.

## Implementation — OrderApplicationServiceImpl

```java
package com.food.ordering.system.order.service.domain;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;

@Slf4j
@Validated
@Service
@RequiredArgsConstructor
public class OrderApplicationServiceImpl implements OrderApplicationService {

    private final OrderCreateCommandHandler orderCreateCommandHandler;
    private final OrderTrackCommandHandler orderTrackCommandHandler;

    @Override
    public CreateOrderResponse createOrder(CreateOrderCommand createOrderCommand) {
        return orderCreateCommandHandler.createOrder(createOrderCommand);
    }

    @Override
    public TrackOrderResponse trackOrder(TrackOrderQuery trackOrderQuery) {
        return orderTrackCommandHandler.trackOrder(trackOrderQuery);
    }
}
```

Service mỏng — chỉ delegate sang Command Handler. Vì sao tách thành Handler?
- **Single Responsibility**: 1 handler / 1 use case.
- Khi flow phức tạp (Outbox phase-9), Handler có thể có nhiều bước, tránh fat service.

## OrderCreateCommandHandler — orchestrate full flow

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderCreateCommandHandler {

    private final OrderCreateHelper orderCreateHelper;
    private final OrderDataMapper orderDataMapper;
    private final OrderCreatedPaymentRequestMessagePublisher orderCreatedPaymentRequestMessagePublisher;

    public CreateOrderResponse createOrder(CreateOrderCommand createOrderCommand) {
        OrderCreatedEvent orderCreatedEvent = orderCreateHelper.persistOrder(createOrderCommand);
        log.info("Order created with id: {}", orderCreatedEvent.getOrder().getId().getValue());

        orderCreatedPaymentRequestMessagePublisher.publish(orderCreatedEvent);

        return orderDataMapper.orderToCreateOrderResponse(
            orderCreatedEvent.getOrder(), "Order created successfully");
    }
}
```

Flow:
1. Persist Order (tách ra helper vì cần `@Transactional`).
2. Publish event ra Kafka.
3. Map sang Response trả về.

> **Chú ý**: persist và publish **không atomic** ở giai đoạn này — đây chính là lỗ hổng dual-write sẽ được vá ở phase-9 bằng Outbox pattern. Tạm chấp nhận.

## OrderCreateHelper — bước persist (cần transaction)

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderCreateHelper {

    private final OrderDomainService orderDomainService;
    private final OrderRepository orderRepository;
    private final CustomerRepository customerRepository;
    private final RestaurantRepository restaurantRepository;
    private final OrderDataMapper orderDataMapper;

    @Transactional
    public OrderCreatedEvent persistOrder(CreateOrderCommand createOrderCommand) {
        checkCustomer(createOrderCommand.customerId());
        Restaurant restaurant = checkRestaurant(createOrderCommand);
        Order order = orderDataMapper.createOrderCommandToOrder(createOrderCommand);

        OrderCreatedEvent orderCreatedEvent =
            orderDomainService.validateAndInitiateOrder(order, restaurant);

        saveOrder(order);
        log.info("Order is created with id: {}", orderCreatedEvent.getOrder().getId().getValue());
        return orderCreatedEvent;
    }

    private void checkCustomer(UUID customerId) {
        Optional<Customer> customer = customerRepository.findCustomer(customerId);
        if (customer.isEmpty()) {
            log.warn("Could not find customer with id: {}", customerId);
            throw new OrderDomainException("Could not find customer with id: " + customerId);
        }
    }

    private Restaurant checkRestaurant(CreateOrderCommand createOrderCommand) {
        Restaurant restaurant = orderDataMapper.createOrderCommandToRestaurant(createOrderCommand);
        Optional<Restaurant> optional = restaurantRepository.findRestaurantInformation(restaurant);
        if (optional.isEmpty()) {
            log.warn("Could not find restaurant with id: {}", createOrderCommand.restaurantId());
            throw new OrderDomainException(
                "Could not find restaurant with id: " + createOrderCommand.restaurantId());
        }
        return optional.get();
    }

    private void saveOrder(Order order) {
        Order saved = orderRepository.save(order);
        if (saved == null) {
            throw new OrderDomainException("Could not save order!");
        }
        log.info("Order is saved with id: {}", saved.getId().getValue());
    }
}
```

Quan sát:
- `@Transactional` đặt ở `OrderCreateHelper` (không phải `OrderCreateCommandHandler`) vì:
  - Helper là method **load + save** trong cùng DB.
  - Publish event Kafka **không** trong transaction này (sẽ vá bằng Outbox).
- 3 dependency repository: Order (lưu), Customer (verify exist), Restaurant (verify exist + load products).
- `OrderDomainService` được inject — dùng cho `validateAndInitiateOrder`.
- Log info / log warn xen kẽ — debug trace.

## OrderTrackCommandHandler

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderTrackCommandHandler {

    private final OrderDataMapper orderDataMapper;
    private final OrderRepository orderRepository;

    @Transactional(readOnly = true)
    public TrackOrderResponse trackOrder(TrackOrderQuery trackOrderQuery) {
        Optional<Order> orderResult = orderRepository.findByTrackingId(
            new TrackingId(trackOrderQuery.orderTrackingId()));
        if (orderResult.isEmpty()) {
            log.warn("Could not find order with tracking id: {}", trackOrderQuery.orderTrackingId());
            throw new OrderNotFoundException(
                "Could not find order with tracking id: " + trackOrderQuery.orderTrackingId());
        }
        return orderDataMapper.orderToTrackOrderResponse(orderResult.get());
    }
}
```

`@Transactional(readOnly = true)` — hint cho Hibernate skip dirty checking, optimize SELECT.

## Đăng ký Spring Bean cho Domain Service

Đến đây, Application Service đã có `@Service`, `@Component` — Spring tự discover. Nhưng `OrderDomainServiceImpl` là **pure Java**, không có `@Component`. Phải đăng ký thủ công trong container module:

```java
// order-container/.../BeanConfiguration.java
@Configuration
public class BeanConfiguration {
    @Bean
    public OrderDomainService orderDomainService() {
        return new OrderDomainServiceImpl();
    }
}
```

Đây là chỗ duy nhất Spring "biết" về `OrderDomainServiceImpl`. Domain core vẫn sạch.

## Dependency của `order-application-service` module

```xml
<dependencies>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-domain-core</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework</groupId>
        <artifactId>spring-tx</artifactId>      <!-- cho @Transactional -->
    </dependency>
    <dependency>
        <groupId>org.springframework</groupId>
        <artifactId>spring-context</artifactId>  <!-- cho @Component, @Service -->
    </dependency>
    <dependency>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
        <optional>true</optional>
    </dependency>
</dependencies>
```

Vẫn không phụ thuộc Spring Boot starter — chỉ Spring core (Tx, Context). Application Service "biết" Spring nhưng không bị couple vào toàn bộ Spring Boot.

## Vì sao tách layer nhiều như vậy?

Có người sẽ hỏi: "1 service Spring có 2-3 class là xong, sao đây cần Helper + Handler + Service + Mapper + DomainService + Entity + Event?"

Trả lời:

| Class | Vai trò unique |
|---|---|
| `OrderApplicationServiceImpl` | Implement input port — facade |
| `OrderCreateCommandHandler` | Orchestrate full create flow (persist + publish) |
| `OrderCreateHelper` | Đoạn cần `@Transactional` — load+save trong DB |
| `OrderDomainService` | Business orchestration (validate + sinh event) |
| `Order` (entity) | State machine + invariant |
| `OrderDataMapper` | Convert DTO ↔ Domain |

Mỗi lớp một trách nhiệm rõ ràng. Khi cần debug "order tạo bị lỗi":
- Lỗi validation input → `@Valid` annotation, không vào method.
- Lỗi customer/restaurant không tồn tại → `OrderCreateHelper.checkXxx`.
- Lỗi business (price lệch, state sai) → `Order` hoặc `OrderDomainService`.
- Lỗi save DB → `OrderRepositoryImpl`.

Stack trace chỉ thẳng đến chỗ lỗi. Đó là phần thưởng của tách layer.

## Bẫy thường gặp khi viết Application Service

| Bẫy | Tránh bằng cách |
|---|---|
| Đặt `@Transactional` ở Application Service top-level method | Khi method có thao tác ngoài DB (publish Kafka), transaction bao bọc luôn → khó kiểm soát. Tách thành Helper riêng. |
| `@Transactional` không có `propagation` rõ ràng | Mặc định `REQUIRED` — OK nhất. Hạn chế `REQUIRES_NEW` trừ khi rõ lý do. |
| Inject `EntityManager` vào Application Service | KHÔNG. App service chỉ biết Repository interface — không biết JPA. |
| DTO field dùng VO (Money, OrderId) | KHÔNG. DTO dùng primitive (BigDecimal, UUID) — VO là internal domain. |
| Mapper trả về Entity nhưng không set ID | OK cho tạo mới. Sau khi `domainService.initialize()`, ID được sinh. |
| Validation business rule trong DTO (vd `@DecimalMin("0.01")` cho price) | OK cho check format. Business rule chính (tổng = sum items) thuộc domain. |
| Quên `@Validated` ở class | `@Valid` ở interface method không hoạt động nếu class không có `@Validated`. |
| Throw `IllegalArgumentException` thay vì `OrderDomainException` | Mất khả năng phân biệt loại lỗi ở ControllerAdvice. |

## Tóm tắt bài 12

- Application Service module = nơi chứa **input/output port**, **DTO**, **Mapper**, **Command Handler**, và Spring `@Service`.
- Input port: `OrderApplicationService` (REST), `PaymentResponseMessageListener` (Kafka — phase-5).
- Output port: `OrderRepository`, `CustomerRepository`, `RestaurantRepository`, `OrderCreatedPaymentRequestMessagePublisher`.
- DTO dùng `record` Java 17 + Lombok `@Builder`, field primitive.
- `OrderCreateCommandHandler` orchestrate full flow; `OrderCreateHelper` đảm nhiệm phần `@Transactional`.
- `@Bean` factory cho `OrderDomainServiceImpl` đặt trong `order-container` — domain core không biết Spring.

**Bài kế tiếp** → [Bài 13: Message Publisher trong Application Service](07-message-publisher.md)

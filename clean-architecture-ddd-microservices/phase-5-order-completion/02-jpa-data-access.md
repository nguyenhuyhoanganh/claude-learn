# Bài 21: JPA Entity + Repository Adapter (Postgres)

> Output port `OrderRepository` (ở Application Service) cần implementation. Bài này code module `order-dataaccess`: JPA entity, Spring Data repository, adapter implement port — kèm mapper Domain ↔ JPA.

## Cấu trúc `order-dataaccess`

```text
order-dataaccess/src/main/java/com/food/ordering/system/order/service/dataaccess/
├── order/
│   ├── entity/
│   │   ├── OrderEntity.java                 ← JPA @Entity
│   │   ├── OrderItemEntity.java
│   │   └── OrderAddressEntity.java
│   ├── repository/
│   │   └── OrderJpaRepository.java          ← Spring Data
│   ├── adapter/
│   │   └── OrderRepositoryImpl.java          ← implements output port
│   └── mapper/
│       └── OrderDataAccessMapper.java
├── customer/
│   ├── entity/
│   │   └── CustomerEntity.java
│   ├── repository/
│   │   └── CustomerJpaRepository.java
│   └── adapter/
│       └── CustomerRepositoryImpl.java
└── restaurant/
    ├── entity/
    │   └── RestaurantEntity.java
    ├── repository/
    │   └── RestaurantJpaRepository.java
    ├── adapter/
    │   └── RestaurantRepositoryImpl.java
    └── mapper/
        └── RestaurantDataAccessMapper.java
```

## JPA `OrderEntity`

```java
package com.food.ordering.system.order.service.dataaccess.order.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Getter @Setter
@Builder
@AllArgsConstructor
@NoArgsConstructor
@Entity
@Table(name = "orders", schema = "order")
public class OrderEntity {

    @Id
    private UUID id;

    private UUID customerId;
    private UUID restaurantId;
    private UUID trackingId;
    private BigDecimal price;

    @Enumerated(EnumType.STRING)
    private OrderStatus orderStatus;

    private String failureMessages;

    @OneToOne(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.EAGER)
    private OrderAddressEntity address;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.EAGER)
    private List<OrderItemEntity> items;
}
```

```java
@Getter @Setter @Builder
@AllArgsConstructor @NoArgsConstructor
@Entity
@Table(name = "order_items", schema = "order")
@IdClass(OrderItemEntityId.class)
public class OrderItemEntity {
    @Id @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    private OrderEntity order;

    @Id
    private Long id;

    private UUID productId;
    private BigDecimal price;
    private Integer quantity;
    private BigDecimal subTotal;
}
```

```java
@Data
@AllArgsConstructor
@NoArgsConstructor
public class OrderItemEntityId implements Serializable {
    private Long id;
    private OrderEntity order;
    // equals + hashCode bằng id + order.id
}
```

`OrderItem` JPA dùng composite key `(order_id, id)` — id chỉ unique trong scope order.

## Spring Data Repository

```java
@Repository
public interface OrderJpaRepository extends JpaRepository<OrderEntity, UUID> {
    Optional<OrderEntity> findByTrackingId(UUID trackingId);
}
```

Spring auto generate query từ tên method.

## Adapter `OrderRepositoryImpl`

```java
@Component
@RequiredArgsConstructor
public class OrderRepositoryImpl implements OrderRepository {

    private final OrderJpaRepository orderJpaRepository;
    private final OrderDataAccessMapper orderDataAccessMapper;

    @Override
    public Order save(Order order) {
        return orderDataAccessMapper.orderEntityToOrder(
            orderJpaRepository.save(orderDataAccessMapper.orderToOrderEntity(order)));
    }

    @Override
    public Optional<Order> findByTrackingId(TrackingId trackingId) {
        return orderJpaRepository.findByTrackingId(trackingId.getValue())
            .map(orderDataAccessMapper::orderEntityToOrder);
    }
}
```

3 dòng. Đó là sức mạnh của Hexagonal — adapter chỉ cần convert Domain ↔ JPA và gọi Spring Data.

## Mapper `OrderDataAccessMapper`

```java
@Component
public class OrderDataAccessMapper {

    public OrderEntity orderToOrderEntity(Order order) {
        OrderEntity orderEntity = OrderEntity.builder()
            .id(order.getId().getValue())
            .customerId(order.getCustomerId().getValue())
            .restaurantId(order.getRestaurantId().getValue())
            .trackingId(order.getTrackingId().getValue())
            .address(deliveryAddressToAddressEntity(order.getDeliveryAddress()))
            .price(order.getPrice().getAmount())
            .items(orderItemsToOrderItemEntities(order.getItems()))
            .orderStatus(order.getOrderStatus())
            .failureMessages(order.getFailureMessages() != null
                ? String.join(Order.FAILURE_MESSAGE_DELIMITER, order.getFailureMessages())
                : "")
            .build();
        orderEntity.getAddress().setOrder(orderEntity);
        orderEntity.getItems().forEach(item -> item.setOrder(orderEntity));
        return orderEntity;
    }

    public Order orderEntityToOrder(OrderEntity orderEntity) {
        return Order.builder()
            .orderId(new OrderId(orderEntity.getId()))
            .customerId(new CustomerId(orderEntity.getCustomerId()))
            .restaurantId(new RestaurantId(orderEntity.getRestaurantId()))
            .deliveryAddress(addressEntityToDeliveryAddress(orderEntity.getAddress()))
            .price(new Money(orderEntity.getPrice()))
            .items(orderItemEntitiesToOrderItems(orderEntity.getItems()))
            .trackingId(new TrackingId(orderEntity.getTrackingId()))
            .orderStatus(orderEntity.getOrderStatus())
            .failureMessages(orderEntity.getFailureMessages().isEmpty()
                ? new ArrayList<>()
                : new ArrayList<>(Arrays.asList(
                    orderEntity.getFailureMessages().split(Order.FAILURE_MESSAGE_DELIMITER))))
            .build();
    }

    // ... helpers
}
```

Hai chiều convert. `failureMessages` lưu Postgres dưới dạng string nối bằng dấu phẩy (1 column thay vì 1 bảng riêng).

> Back-reference (`orderEntity.getAddress().setOrder(orderEntity)`) cần thiết cho `@OneToOne mappedBy` — JPA cần biết cả 2 phía mới persist đúng.

## Customer + Restaurant adapter

Tương tự — đơn giản hơn vì không update từ Order service, chỉ read.

```java
@Component
@RequiredArgsConstructor
public class CustomerRepositoryImpl implements CustomerRepository {
    private final CustomerJpaRepository customerJpaRepository;

    @Override
    public Optional<Customer> findCustomer(UUID customerId) {
        return customerJpaRepository.findById(customerId)
            .map(entity -> new Customer(new CustomerId(entity.getId())));
    }
}
```

```java
@Component
@RequiredArgsConstructor
public class RestaurantRepositoryImpl implements RestaurantRepository {
    private final RestaurantJpaRepository restaurantJpaRepository;
    private final RestaurantDataAccessMapper restaurantDataAccessMapper;

    @Override
    public Optional<Restaurant> findRestaurantInformation(Restaurant restaurant) {
        List<UUID> productIds = restaurant.getProducts().stream()
            .map(p -> p.getId().getValue()).collect(Collectors.toList());
        List<RestaurantEntity> rows = restaurantJpaRepository
            .findByRestaurantIdAndProductIdIn(restaurant.getId().getValue(), productIds);
        return rows.isEmpty() ? Optional.empty()
            : Optional.of(restaurantDataAccessMapper.restaurantEntityToRestaurant(rows));
    }
}
```

`findByRestaurantIdAndProductIdIn` — return rows từ view `order.restaurant_m_view` (materialized view với data từ Restaurant schema). Sẽ tạo schema ở bài 24.

## Materialized view của Restaurant

Order service đọc Restaurant data qua materialized view trong DB của Order:

```sql
-- order/restaurant_m_view
CREATE MATERIALIZED VIEW order.restaurant_m_view AS
SELECT
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.active AS restaurant_active,
    p.id AS product_id,
    p.name AS product_name,
    p.price AS product_price
FROM restaurant.restaurants r
JOIN restaurant.products p ON p.restaurant_id = r.id
WITH DATA;
```

`@Table` mapping:

```java
@Entity
@Table(name = "order_restaurant_m_view", schema = "order")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
@IdClass(RestaurantEntityId.class)
public class RestaurantEntity {
    @Id private UUID restaurantId;
    private String restaurantName;
    private Boolean restaurantActive;
    @Id private UUID productId;
    private String productName;
    private BigDecimal productPrice;
}
```

Đây là **CQRS sơ khai** ở giai đoạn này. Phase-10 sẽ nâng cấp lên CQRS đầy đủ qua Kafka.

## Refresh materialized view

PostgreSQL trigger sẽ refresh view khi `restaurant.restaurants` thay đổi (sẽ setup ở schema SQL bài 24):

```sql
CREATE OR REPLACE FUNCTION restaurant.refresh_order_restaurant_m_view()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW order.restaurant_m_view;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_order_restaurant_m_view
AFTER INSERT OR UPDATE OR DELETE ON restaurant.products
FOR EACH STATEMENT EXECUTE FUNCTION restaurant.refresh_order_restaurant_m_view();
```

Trade-off: refresh full view mỗi lần thay đổi → chậm khi data lớn. Phase-10 sẽ thay bằng event-driven (Kafka).

## Schema multi-tenancy

Postgres 1 DB chia nhiều schema:
- `order` — Order service tables.
- `payment` — Payment service.
- `restaurant` — Restaurant service.
- `customer` — Customer (sẽ thay bằng microservice ở phase-10).

Mỗi service connect cùng JDBC URL, nhưng `default_schema=order`:

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/postgres?currentSchema=order&binaryTransfer=true&reWriteBatchedInserts=true
    username: postgres
    password: admin
  jpa:
    open-in-view: false
    show-sql: true
    hibernate:
      ddl-auto: none
    properties:
      hibernate.dialect: org.hibernate.dialect.PostgreSQLDialect
```

`ddl-auto: none` — không auto create table. Schema được tạo bằng SQL script (Flyway/Liquibase trong production; khoá học dùng manual SQL file).

## Bẫy thường gặp với JPA

| Bẫy | Tránh bằng cách |
|---|---|
| Reuse JPA `@Entity` làm Domain Entity | Đã nói nhiều lần — tách 2 class + mapper. |
| `FetchType.EAGER` cho `OneToMany` lớn | N+1 query. Dùng LAZY + `@EntityGraph` khi cần. |
| Quên set back-reference (`item.setOrder(order)`) | `@OneToMany mappedBy` cần — JPA insert NULL vào FK. |
| `ddl-auto=update` ở production | Nguy hiểm — JPA tự sửa schema. Dùng migration tool. |
| `open-in-view=true` (default) | View render giữ session JPA mở → N+1 + lock connection. Tắt. |
| `@Transactional` ở Adapter | Đặt ở Application Service. Adapter chỉ là wrapper. |
| Catch `DataAccessException` ở Adapter | Để Spring translation tự xử lý, throw lên app service. |
| Mapper thiếu null check | NullPointerException khi field optional. Code defensive. |

## Tóm tắt bài 21

- `order-dataaccess` module: JPA entity + Spring Data repository + adapter implement output port.
- Tách Domain Entity (`Order`) ≠ JPA Entity (`OrderEntity`) — mapper convert.
- Materialized view của Restaurant trong DB Order — CQRS sơ khai (phase-10 nâng cấp).
- Schema-per-service trong cùng Postgres instance, mỗi service `currentSchema=...`.
- Tránh JPA gotcha: `open-in-view=false`, không `EAGER` blanket, không reuse Domain Entity.

**Bài kế tiếp** → [Bài 22: Messaging module — Kafka publisher + listener implementations](03-messaging-module.md)

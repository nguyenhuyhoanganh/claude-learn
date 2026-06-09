# Bài 29: Restaurant Application Service + Data Access + Messaging

> Sau Domain Core, lắp 4 module còn lại — application service, data access, messaging, container. Cấu trúc lặp lại Payment service. Bài này gọn, nhấn mạnh điểm khác biệt.

## Application Service module

### Input port

```java
public interface RestaurantApprovalRequestMessageListener {
    void approveOrder(RestaurantApprovalRequest restaurantApprovalRequest);
}
```

```java
public record RestaurantApprovalRequest(
    String id,
    String sagaId,
    String restaurantId,
    String orderId,
    RestaurantOrderStatus restaurantOrderStatus,
    List<Product> products,
    BigDecimal price,
    Instant createdAt
) {}
```

`RestaurantApprovalRequest.products` chứa snapshot products của order (productId + quantity) — gửi từ Order. Restaurant **không tin** snapshot này, sẽ query DB chính chủ.

### Output ports

```java
public interface RestaurantRepository {
    Optional<Restaurant> findRestaurantInformation(Restaurant restaurant);
}

public interface OrderApprovalRepository {
    OrderApproval save(OrderApproval orderApproval);
}

public interface OrderApprovedMessagePublisher 
    extends DomainEventPublisher<OrderApprovedEvent> {}

public interface OrderRejectedMessagePublisher 
    extends DomainEventPublisher<OrderRejectedEvent> {}
```

### Implementation `RestaurantApprovalRequestHelper`

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class RestaurantApprovalRequestHelper {

    private final RestaurantDomainService restaurantDomainService;
    private final RestaurantDataMapper restaurantDataMapper;
    private final RestaurantRepository restaurantRepository;
    private final OrderApprovalRepository orderApprovalRepository;
    private final OrderApprovedMessagePublisher approvedPublisher;
    private final OrderRejectedMessagePublisher rejectedPublisher;

    @Transactional
    public OrderApprovalEvent persistOrderApproval(RestaurantApprovalRequest request) {
        log.info("Processing restaurant approval for order id: {}", request.orderId());
        List<String> failureMessages = new ArrayList<>();
        Restaurant restaurant = findRestaurant(request);

        OrderApprovalEvent event = restaurantDomainService.validateOrder(restaurant, failureMessages);
        orderApprovalRepository.save(restaurant.getOrderApproval());
        return event;
    }

    private Restaurant findRestaurant(RestaurantApprovalRequest request) {
        Restaurant restaurant = restaurantDataMapper.restaurantApprovalRequestToRestaurant(request);
        Optional<Restaurant> optional = restaurantRepository.findRestaurantInformation(restaurant);
        if (optional.isEmpty()) {
            log.error("Restaurant with id: {} not found!", request.restaurantId());
            throw new RestaurantNotFoundException(
                "Restaurant with id: " + request.restaurantId() + " not found!");
        }
        Restaurant found = optional.get();
        restaurant.setActive(found.isActive());
        restaurant.getOrderDetail().getProducts().forEach(p ->
            found.getOrderDetail().getProducts().stream()
                .filter(rp -> rp.getId().equals(p.getId()))
                .findFirst()
                .ifPresent(rp -> p.updateWithConfirmedNamePriceAndAvailability(
                    rp.getName(), rp.getPrice(), rp.isAvailable())));
        return restaurant;
    }
}
```

`findRestaurant` load thông tin restaurant + product từ DB → cập nhật snapshot trong `restaurant` để có **giá thật** + `available` thật → domain service validate.

### Listener implementation

```java
@Slf4j
@Service
@Validated
@RequiredArgsConstructor
public class RestaurantApprovalRequestMessageListenerImpl 
        implements RestaurantApprovalRequestMessageListener {

    private final RestaurantApprovalRequestHelper helper;
    private final OrderApprovedMessagePublisher approvedPublisher;
    private final OrderRejectedMessagePublisher rejectedPublisher;

    @Override
    public void approveOrder(RestaurantApprovalRequest request) {
        OrderApprovalEvent event = helper.persistOrderApproval(request);
        if (event instanceof OrderApprovedEvent approved) {
            approvedPublisher.publish(approved);
        } else if (event instanceof OrderRejectedEvent rejected) {
            rejectedPublisher.publish(rejected);
        }
    }
}
```

## Data Access module

JPA entities — chú ý `RestaurantEntity` chính là **materialized view** trong schema `restaurant` (data sản phẩm thật):

```java
@Entity
@Table(name = "order_approval", schema = "restaurant")
public class OrderApprovalEntity {
    @Id private UUID id;
    private UUID restaurantId;
    private UUID orderId;
    @Enumerated(EnumType.STRING) private OrderApprovalStatus status;
}

@Entity
@Table(name = "restaurants", schema = "restaurant")
public class RestaurantEntity {
    @Id private UUID id;
    private String name;
    private boolean active;
}

@Entity
@Table(name = "products", schema = "restaurant")
public class ProductEntity {
    @Id private UUID id;
    private UUID restaurantId;
    private String name;
    private BigDecimal price;
    private boolean available;
}
```

Adapter `RestaurantRepositoryImpl`:

```java
@Component
@RequiredArgsConstructor
public class RestaurantRepositoryImpl implements RestaurantRepository {
    private final RestaurantJpaRepository restaurantJpaRepository;
    private final ProductJpaRepository productJpaRepository;
    private final RestaurantDataAccessMapper restaurantDataAccessMapper;

    @Override
    public Optional<Restaurant> findRestaurantInformation(Restaurant restaurant) {
        List<UUID> productIds = restaurant.getOrderDetail().getProducts().stream()
            .map(p -> p.getId().getValue()).collect(Collectors.toList());

        Optional<RestaurantEntity> restaurantEntity = 
            restaurantJpaRepository.findById(restaurant.getId().getValue());
        if (restaurantEntity.isEmpty()) return Optional.empty();

        List<ProductEntity> productEntities = 
            productJpaRepository.findByIdIn(productIds);

        return Optional.of(restaurantDataAccessMapper
            .restaurantEntityToRestaurant(restaurantEntity.get(), productEntities));
    }
}
```

## Messaging module

### Listener

```java
@KafkaListener(
    id = "${kafka-consumer-config.restaurant-approval-consumer-group-id}",
    topics = "${restaurant-service.restaurant-approval-request-topic-name}")
public void receive(@Payload List<RestaurantApprovalRequestAvroModel> messages,
                    @Header(KafkaHeaders.RECEIVED_KEY) List<String> keys,
                    @Header(KafkaHeaders.RECEIVED_PARTITION) List<Integer> partitions,
                    @Header(KafkaHeaders.OFFSET) List<Long> offsets,
                    Acknowledgment acknowledgment) {
    log.info("{} restaurant approval requests received", messages.size());
    messages.forEach(avroModel -> {
        try {
            restaurantApprovalRequestMessageListener.approveOrder(
                mapper.restaurantApprovalRequestAvroModelToRestaurantApprovalRequest(avroModel));
        } catch (DataAccessException e) {
            SQLException sqlException = (SQLException) e.getRootCause();
            if (sqlException != null && 
                PSQLState.UNIQUE_VIOLATION.getState().equals(sqlException.getSQLState())) {
                log.error("Caught unique constraint exception for order id: {}", avroModel.getOrderId());
            } else {
                throw new RestaurantApplicationServiceException(
                    "Throwing DataAccessException: " + e.getMessage(), e);
            }
        }
    });
    acknowledgment.acknowledge();
}
```

Idempotent qua UNIQUE constraint `order_approval(order_id)`.

### Publisher (2 publisher gửi cùng topic)

```java
@Component
@RequiredArgsConstructor
public class OrderApprovedKafkaMessagePublisher implements OrderApprovedMessagePublisher {
    private final RestaurantMessagingDataMapper mapper;
    private final RestaurantServiceConfigData configData;
    private final KafkaProducer<String, RestaurantApprovalResponseAvroModel> kafkaProducer;

    @Override
    public void publish(OrderApprovedEvent event) {
        String orderId = event.getOrderApproval().getOrderId().getValue().toString();
        RestaurantApprovalResponseAvroModel avroModel = 
            mapper.orderApprovedEventToRestaurantApprovalResponseAvroModel(event);
        kafkaProducer.send(
            configData.getRestaurantApprovalResponseTopicName(),
            orderId,
            avroModel,
            kafkaCallback());
    }
}
```

`OrderRejectedKafkaMessagePublisher` tương tự với mapper khác.

## Container

```java
@SpringBootApplication(scanBasePackages = "com.food.ordering.system")
public class RestaurantServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(RestaurantServiceApplication.class, args);
    }
}

@Configuration
public class BeanConfiguration {
    @Bean
    public RestaurantDomainService restaurantDomainService() {
        return new RestaurantDomainServiceImpl();
    }
}
```

`application.yml`:

```yaml
server.port: 8383

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/postgres?currentSchema=restaurant&...

restaurant-service:
  restaurant-approval-request-topic-name: restaurant-approval-request
  restaurant-approval-response-topic-name: restaurant-approval-response

kafka-consumer-config:
  restaurant-approval-consumer-group-id: restaurant-approval-topic-consumer
```

## Chạy 3 service cùng lúc — luồng SAGA hoàn chỉnh

```text
1. Khởi Kafka stack
2. Khởi Postgres + init-schema.sql (4 schema + seed data)
3. java -jar order-container.jar      (8181)
4. java -jar payment-container.jar    (8282)
5. java -jar restaurant-container.jar (8383)

Postman POST /orders → response PENDING (trackingId)

Log Order:
  Sent payment-request

Log Payment:
  Received payment-request, validated, sent payment-response (COMPLETED)

Log Order:
  Received payment-response, updated PAID, sent restaurant-approval-request

Log Restaurant:
  Received restaurant-approval-request, validated all products available + price match, sent restaurant-approval-response (APPROVED)

Log Order:
  Received restaurant-approval-response (APPROVED), updated APPROVED

GET /orders/{trackingId} → status APPROVED
```

Toàn bộ 13 bước SAGA hoàn thành — dù trong code phase-7 chưa có SAGA pattern formal, listener đã tự chuyển state qua từng bước.

## Bẫy thường gặp

| Triệu chứng | Nguyên nhân |
|---|---|
| Restaurant approve nhưng Order vẫn `PAID` | Restaurant response topic name sai, Order group ID sai |
| `RestaurantNotFoundException` luôn | Schema restaurant chưa seed |
| Product price lệch dù DB đúng | Quên `updateWithConfirmedNamePriceAndAvailability` |
| Restaurant approve rồi reject lần 2 | Listener không idempotent. Thêm UNIQUE constraint |
| Restaurant chạy nhưng listener không nhận | `restaurant-approval-request` topic chưa tạo |

## Tóm tắt bài 29

- Restaurant application service follow pattern Payment: input port message listener + output port repository + 2 publisher.
- `findRestaurant` load thông tin restaurant + products thật, update snapshot trong request.
- Listener idempotent qua UNIQUE constraint `order_approval(order_id)`.
- 3 service chạy cùng nhau → SAGA bước 1-13 hoàn thành.

**Bài kế tiếp** → [Bài 30 (phase-8): SAGA Pattern — từ rời rạc đến formal SAGA](../phase-8-saga-pattern/01-saga-intro.md)

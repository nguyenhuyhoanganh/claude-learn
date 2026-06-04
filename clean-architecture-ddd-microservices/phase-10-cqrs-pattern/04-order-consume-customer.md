# Bài 44: Order Service consume Customer event + Query CQRS

> Customer publish event. Bây giờ Order consume, ghi vào table `order.customers` local. Order query customer **từ table local**, không qua materialized view nữa. Đây là CQRS đầy đủ — write side (Customer service) và read side (Order service) độc lập.

## Module `order-customer` — listener

```text
order-service/order-customer/src/main/java/com/food/ordering/system/order/service/customer/
├── messaging/
│   ├── listener/
│   │   └── CustomerKafkaListener.java       ← consume topic customer
│   ├── adapter/
│   │   └── CustomerMessageListenerImpl.java ← INSERT vào order.customers
│   └── mapper/
│       └── CustomerMessagingDataMapper.java
├── entity/
│   └── CustomerEntity.java                  ← JPA cho order.customers
├── repository/
│   └── CustomerJpaRepository.java
└── adapter/
    └── CustomerRepositoryImpl.java           ← replace materialized view query
```

## Input port — `CustomerMessageListener`

```java
public interface CustomerMessageListener {
    void customerCreated(CustomerModel customerModel);
}

public record CustomerModel(
    UUID id,
    String username,
    String firstName,
    String lastName
) {}
```

## Listener implementation

```java
@Slf4j
@Service
@Validated
@RequiredArgsConstructor
public class CustomerMessageListenerImpl implements CustomerMessageListener {

    private final CustomerRepository customerRepository;

    @Override
    @Transactional
    public void customerCreated(CustomerModel customerModel) {
        try {
            customerRepository.createCustomer(new Customer(
                new CustomerId(customerModel.id()),
                customerModel.username(),
                customerModel.firstName(),
                customerModel.lastName()));
            log.info("Customer is created in Order Service with id: {}", customerModel.id());
        } catch (DataIntegrityViolationException e) {
            log.error("Caught unique constraint exception for customer id: {}",
                customerModel.id());
            // Duplicate Kafka delivery — skip silently
        }
    }
}
```

Idempotent qua UNIQUE primary key `(id)`.

## Kafka listener

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class CustomerKafkaListener implements KafkaConsumer<CustomerAvroModel> {

    private final CustomerMessageListener customerMessageListener;
    private final CustomerMessagingDataMapper customerMessagingDataMapper;

    @Override
    @KafkaListener(id = "${kafka-consumer-config.customer-group-id}",
                   topics = "${order-service.customer-topic-name}")
    public void receive(@Payload List<CustomerAvroModel> messages,
                        @Header(KafkaHeaders.RECEIVED_KEY) List<String> keys,
                        @Header(KafkaHeaders.RECEIVED_PARTITION) List<Integer> partitions,
                        @Header(KafkaHeaders.OFFSET) List<Long> offsets,
                        Acknowledgment acknowledgment) {
        log.info("{} number of customer create events received with keys: {}",
            messages.size(), keys);

        messages.forEach(avroModel -> {
            try {
                customerMessageListener.customerCreated(
                    customerMessagingDataMapper.customerAvroModelToCustomerModel(avroModel));
            } catch (Exception e) {
                log.error("Error in CustomerKafkaListener for customer id: {}", avroModel.getId(), e);
            }
        });
        acknowledgment.acknowledge();
    }
}
```

`customer-group-id` config:
```yaml
order-service:
  customer-topic-name: customer

kafka-consumer-config:
  customer-group-id: customer-topic-consumer
  ...
```

## JPA entity + adapter

```java
@Entity
@Table(name = "customers", schema = "order")
@Getter @Setter @Builder
@AllArgsConstructor @NoArgsConstructor
public class CustomerEntity {
    @Id private UUID id;
    private String username;
    private String firstName;
    private String lastName;
}

@Repository
public interface CustomerJpaRepository extends JpaRepository<CustomerEntity, UUID> {}

@Component
@RequiredArgsConstructor
public class CustomerRepositoryImpl implements CustomerRepository {

    private final CustomerJpaRepository customerJpaRepository;
    private final CustomerDataAccessMapper customerDataAccessMapper;

    @Override
    public Customer createCustomer(Customer customer) {
        return customerDataAccessMapper.customerEntityToCustomer(
            customerJpaRepository.save(customerDataAccessMapper.customerToCustomerEntity(customer)));
    }

    @Override
    public Optional<Customer> findCustomer(UUID customerId) {
        return customerJpaRepository.findById(customerId)
            .map(customerDataAccessMapper::customerEntityToCustomer);
    }
}
```

Interface `CustomerRepository` thay đổi: phase trước chỉ `findCustomer`, phase này thêm `createCustomer` cho listener gọi.

## OrderCreateHelper — đọc customer từ table local

```java
private void checkCustomer(UUID customerId) {
    Optional<Customer> customer = customerRepository.findCustomer(customerId);
    if (customer.isEmpty()) {
        log.warn("Could not find customer with id: {}", customerId);
        throw new OrderDomainException("Could not find customer with id: " + customerId);
    }
}
```

Code không đổi! Chỉ implementation `findCustomer` giờ query `order.customers` (table local) thay materialized view cũ. Đây là sức mạnh của Clean Architecture — interface không đổi, implementation thay.

## Container — cập nhật

`order-container/pom.xml` thêm dependency:
```xml
<dependency>
    <groupId>com.food.ordering.system</groupId>
    <artifactId>order-customer</artifactId>
</dependency>
```

`OrderServiceApplication` cập nhật `@EntityScan` + `@EnableJpaRepositories`:
```java
@EntityScan(basePackages = {
    "com.food.ordering.system.order.service.dataaccess",
    "com.food.ordering.system.order.service.customer"     // mới
})
@EnableJpaRepositories(basePackages = {
    "com.food.ordering.system.order.service.dataaccess",
    "com.food.ordering.system.order.service.customer"     // mới
})
```

## Test end-to-end CQRS

### Bước 1: Customer service tạo customer
```text
POST http://localhost:8484/customers
{
  "customerId": "d215b5f8-0249-4dc5-89a3-51fd148cfb43",
  "username": "lan_pham",
  "firstName": "Lan",
  "lastName": "Pham"
}
```

DB:
- `customer.customers` có row mới.
- `customer.customer_outbox` STARTED.

Sau 5s scheduler:
- Kafka topic `customer` có message.
- `customer_outbox` COMPLETED.

### Bước 2: Order service consume
Log Order:
```text
[Order]  1 number of customer create events received with keys: [d215...cb43]
[Order]  Customer is created in Order Service with id: d215...cb43
```

DB Order:
```text
$ psql -c "SELECT * FROM \"order\".customers WHERE id='d215...cb43';"
   id          | username | first_name | last_name
   ------------+----------+------------+-----------
   d215...cb43 | lan_pham | Lan        | Pham
```

### Bước 3: POST order với customer mới
```text
POST http://localhost:8181/orders
{
  "customerId": "d215b5f8-0249-4dc5-89a3-51fd148cfb43",
  "restaurantId": "d215b5f8-0249-4dc5-89a3-51fd148cfb45",
  ...
}
```

Response 200 PENDING. SAGA chạy bình thường.

### Bước 4: Test idempotent — duplicate event

Reset Kafka offset:
```text
$ docker exec -it kafka-broker-1 kafka-consumer-groups \
    --bootstrap-server kafka-broker-1:9092 \
    --group customer-topic-consumer \
    --reset-offsets --to-offset 0 \
    --topic customer --execute
```

Order consume lại:
```text
[Order]  1 number of customer create events received
[Order]  Caught unique constraint exception for customer id: d215...cb43
```

Duplicate → UNIQUE primary key catch → skip. DB không đổi.

## CQRS vs trước phase-10

| Aspect | Trước CQRS | Sau CQRS |
|---|---|---|
| Customer storage | Schema chung Postgres + materialized view | Customer service (sự thật) + Order replica |
| Sync method | Postgres trigger refresh full view | Kafka event qua outbox |
| Customer service | Không tồn tại | Microservice riêng, REST + Kafka |
| Order query customer | Materialized view (eventual) | Table local (eventual) |
| Latency sync | Vài ms (trigger sync) | Vài giây (Kafka + scheduler) |
| Scale Customer riêng | Không | Có |
| Resilience | Postgres down → cả 2 down | Customer down → Order vẫn chạy với data cũ |

## Trade-off CQRS thực tế trong phase

| Pro | Con |
|---|---|
| Customer service deploy độc lập | Eventual consistency lag |
| Customer scale ngang dễ | Logic sync phức tạp hơn (Kafka + outbox) |
| Order không phụ thuộc Customer DB | Order phải maintain local replica schema |
| Pattern clear, mở rộng cho Restaurant tương lai | Storage trùng lặp (customer data 2 nơi) |

## Khi nào KHÔNG nên CQRS Customer

Khoá học chỉ ra trường hợp: nếu Customer service throughput thấp + Order rate cũng thấp + schema chung Postgres OK → đừng phức tạp hoá. Materialized view + trigger là đủ.

CQRS đáng dùng khi:
- Customer + Order team riêng → cần deploy độc lập.
- Customer cần scale gấp 10 vì onboarding mass user.
- Customer query phức tạp (Elasticsearch full-text search trên Customer name).
- Customer cần GDPR delete → ảnh hưởng nhiều system → event-driven dễ track.

## Mở rộng — CQRS cho Order Read side?

Bài tập (không có trong khoá): tạo Order Read Service riêng với Elasticsearch. Khi Order đổi status:
1. Order service write → DB Order (như hiện tại).
2. Publish event `OrderStatusChangedEvent`.
3. Order Read Service consume → ghi vào Elasticsearch.
4. Client query `/orders/search?customer=X&status=PAID&from=...` → Order Read Service trả từ Elasticsearch.

Tăng performance query 10-100 lần. Cost: maintain Elasticsearch cluster.

## Bẫy thường gặp

| Bẫy | Sửa |
|---|---|
| Customer service crash → topic không có event mới → Order query không có data | Idempotent design + retry trên Customer scheduler |
| Order replica lệch với Customer master | Replay topic từ offset 0 để re-sync |
| 2 service ghi `customer.customers` đồng thời | Customer service là **sole writer**. Order chỉ consume. |
| Customer event chứa password / sensitive field | Schema customer chỉ chứa public data. PII riêng → secrets vault. |
| Order query customer fail vì replica chưa sync | UX accept eventual: "Try again in a few seconds" hoặc cache local pessimistic |

## Tóm tắt bài 44

- Order consume `customer` topic, INSERT vào `order.customers` local table.
- `CustomerRepositoryImpl` đổi từ query materialized view sang query local table — interface giữ nguyên.
- Idempotent qua UNIQUE primary key.
- CQRS hoàn chỉnh: Customer service = write side, Order = read side cho data customer.
- Trade-off: eventual consistency lag 5-10s, đổi lấy scale + decoupled deploy.
- Pattern mở rộng được cho Order Read Service (Elasticsearch) hoặc các domain entity khác.

**Bài kế tiếp** → [Bài 45 (phase-11): Kubernetes local — chạy stack trên minikube](../phase-11-kubernetes/01-kubernetes-intro.md)

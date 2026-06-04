# Bài 14: Test toàn bộ domain logic — JUnit, Mockito, không Spring

> Một trong những lý do lớn để dùng Clean Architecture: **test domain logic không cần khởi Spring**. Bài này code các test thực sự: unit test cho `Order` entity, integration-style test cho `OrderCreateCommandHandler` với mock repositories. Bạn sẽ thấy test chạy **< 1 giây toàn bộ**, có thể chạy thoải mái mọi lần lưu file.

## Cấu trúc test

```text
order-domain-core/src/test/java/...
└── entity/
    └── OrderTest.java                      ← test Order state machine, validation

order-application-service/src/test/java/...
├── OrderApplicationServiceTest.java        ← test create flow với mock dependency
└── OrderTrackCommandHandlerTest.java       ← test track query
```

Test JUnit 5 (`org.junit.jupiter:junit-jupiter`) + Mockito (`org.mockito:mockito-core`).

## Test #1: `OrderTest` — state machine

```java
package com.food.ordering.system.order.service.domain.entity;

import static org.junit.jupiter.api.Assertions.*;

class OrderTest {

    private Order order;

    @BeforeEach
    void setUp() {
        order = Order.builder()
            .customerId(new CustomerId(UUID.randomUUID()))
            .restaurantId(new RestaurantId(UUID.randomUUID()))
            .deliveryAddress(new StreetAddress(UUID.randomUUID(), "1 Main", "10000", "Hanoi"))
            .price(new Money(new BigDecimal("50.00")))
            .items(List.of(OrderItem.builder()
                .product(new Product(new ProductId(UUID.randomUUID()), "Pizza", new Money(new BigDecimal("50.00"))))
                .quantity(1)
                .price(new Money(new BigDecimal("50.00")))
                .subTotal(new Money(new BigDecimal("50.00")))
                .build()))
            .build();
    }

    @Test
    void initializeOrder_assignsIds_andSetsPending() {
        order.initializeOrder();
        assertEquals(OrderStatus.PENDING, order.getOrderStatus());
        assertNotNull(order.getId());
        assertNotNull(order.getTrackingId());
        assertNotNull(order.getItems().get(0).getId());
    }

    @Test
    void validateOrder_passesWithMatchingTotal() {
        order.initializeOrder();
        assertDoesNotThrow(() -> order.validateOrder());
    }

    @Test
    void validateOrder_failsWhenTotalMismatchItems() {
        Order o = Order.builder()
            .customerId(new CustomerId(UUID.randomUUID()))
            .restaurantId(new RestaurantId(UUID.randomUUID()))
            .deliveryAddress(new StreetAddress(UUID.randomUUID(), "1 Main", "10000", "Hanoi"))
            .price(new Money(new BigDecimal("99.99")))   // lệch tổng items
            .items(List.of(OrderItem.builder()
                .product(new Product(new ProductId(UUID.randomUUID()), "Pizza", new Money(new BigDecimal("50.00"))))
                .quantity(1).price(new Money(new BigDecimal("50.00"))).subTotal(new Money(new BigDecimal("50.00")))
                .build()))
            .build();
        o.initializeOrder();
        OrderDomainException ex = assertThrows(OrderDomainException.class, o::validateOrder);
        assertTrue(ex.getMessage().contains("Total price"));
    }

    @ParameterizedTest
    @MethodSource("invalidStatesForPay")
    void pay_throwsForNonPending(OrderStatus invalidStatus) {
        Order o = Order.builder()...build();
        // hack set status (bằng reflection hoặc factory test riêng)
        setStatus(o, invalidStatus);
        assertThrows(OrderDomainException.class, o::pay);
    }

    static Stream<OrderStatus> invalidStatesForPay() {
        return Stream.of(OrderStatus.PAID, OrderStatus.APPROVED, 
                         OrderStatus.CANCELLING, OrderStatus.CANCELLED);
    }

    @Test
    void approve_flowFromPaid() {
        order.initializeOrder();
        order.pay();
        order.approve();
        assertEquals(OrderStatus.APPROVED, order.getOrderStatus());
    }

    @Test
    void initCancel_thenCancel_flow() {
        order.initializeOrder();
        order.pay();
        order.initCancel(List.of("Restaurant rejected", ""));   // 1 message + 1 empty
        assertEquals(OrderStatus.CANCELLING, order.getOrderStatus());
        assertEquals(1, order.getFailureMessages().size());   // empty bị filter

        order.cancel(List.of("Refund completed"));
        assertEquals(OrderStatus.CANCELLED, order.getOrderStatus());
        assertEquals(2, order.getFailureMessages().size());
    }

    @Test
    void cancel_fromPending_directlyToCancelled() {
        order.initializeOrder();
        order.cancel(List.of("Payment failed"));
        assertEquals(OrderStatus.CANCELLED, order.getOrderStatus());
    }
}
```

Quan sát:
- `@BeforeEach` setup fresh Order — mỗi test độc lập.
- `@ParameterizedTest` test 4 invalid state cho `pay()` trong 1 method.
- `assertThrows` + check message → đảm bảo error message rõ ràng cho dev khi debug.
- Edge case: empty failure message bị filter (nhờ `.filter(m -> !m.isEmpty())` trong `updateFailureMessages`).

Chạy toàn bộ:

```text
$ mvn test -pl order-service/order-domain/order-domain-core
[INFO] OrderTest:
[INFO]   initializeOrder_assignsIds_andSetsPending: PASSED (15 ms)
[INFO]   validateOrder_passesWithMatchingTotal: PASSED (3 ms)
[INFO]   validateOrder_failsWhenTotalMismatchItems: PASSED (5 ms)
[INFO]   ... 10 tests, 0 failures
[INFO] Total time: 0.234 s
```

234ms cho 10 tests. **Đây là phần thưởng** — feedback loop cực nhanh.

## Test #2: `OrderApplicationServiceTest` — Mock toàn bộ dependency

```java
@SpringBootTest(classes = OrderTestConfiguration.class)
class OrderApplicationServiceTest {

    @Autowired
    private OrderApplicationService orderApplicationService;

    @Autowired
    private OrderDataMapper orderDataMapper;

    @Autowired
    private OrderRepository orderRepository;
    
    @Autowired
    private CustomerRepository customerRepository;

    @Autowired
    private RestaurantRepository restaurantRepository;

    private CreateOrderCommand createOrderCommand;
    private CreateOrderCommand createOrderCommandWrongPrice;
    private final UUID CUSTOMER_ID = UUID.fromString("d215b5f8-0249-4dc5-89a3-51fd148cfb41");
    private final UUID RESTAURANT_ID = UUID.fromString("d215b5f8-0249-4dc5-89a3-51fd148cfb45");
    private final UUID PRODUCT_ID = UUID.fromString("d215b5f8-0249-4dc5-89a3-51fd148cfb48");
    private final UUID ORDER_ID = UUID.fromString("15a497c1-0f4b-4eff-b9f4-c402c8c07afb");
    private final BigDecimal PRICE = new BigDecimal("200.00");

    @BeforeAll
    void init() {
        createOrderCommand = CreateOrderCommand.builder()
            .customerId(CUSTOMER_ID)
            .restaurantId(RESTAURANT_ID)
            .price(PRICE)
            .address(new OrderAddress("street", "10000", "Hanoi"))
            .items(List.of(
                new OrderItem(PRODUCT_ID, 1, new BigDecimal("50.00"), new BigDecimal("50.00")),
                new OrderItem(PRODUCT_ID, 3, new BigDecimal("50.00"), new BigDecimal("150.00"))
            ))
            .build();

        createOrderCommandWrongPrice = CreateOrderCommand.builder()
            // ... like above but price = 250.00 (lệch)
            .build();

        Customer customer = new Customer(new CustomerId(CUSTOMER_ID));
        Restaurant restaurantResponse = Restaurant.builder()
            .restaurantId(new RestaurantId(RESTAURANT_ID))
            .products(List.of(new Product(new ProductId(PRODUCT_ID), "Pizza", new Money(new BigDecimal("50.00")))))
            .active(true)
            .build();

        Order order = orderDataMapper.createOrderCommandToOrder(createOrderCommand);
        order.setId(new OrderId(ORDER_ID));

        when(customerRepository.findCustomer(CUSTOMER_ID)).thenReturn(Optional.of(customer));
        when(restaurantRepository.findRestaurantInformation(any())).thenReturn(Optional.of(restaurantResponse));
        when(orderRepository.save(any())).thenReturn(order);
    }

    @Test
    void shouldCreateOrder() {
        CreateOrderResponse response = orderApplicationService.createOrder(createOrderCommand);
        assertEquals(OrderStatus.PENDING, response.orderStatus());
        assertEquals("Order created successfully", response.message());
        assertNotNull(response.orderTrackingId());
    }

    @Test
    void shouldThrowExceptionForWrongTotalPrice() {
        OrderDomainException ex = assertThrows(OrderDomainException.class,
            () -> orderApplicationService.createOrder(createOrderCommandWrongPrice));
        assertTrue(ex.getMessage().contains("Total price"));
    }

    @Test
    void shouldThrowExceptionWhenCustomerNotFound() {
        when(customerRepository.findCustomer(any())).thenReturn(Optional.empty());
        OrderDomainException ex = assertThrows(OrderDomainException.class,
            () -> orderApplicationService.createOrder(createOrderCommand));
        assertTrue(ex.getMessage().contains("Could not find customer"));
    }

    @Test
    void shouldThrowExceptionWhenRestaurantInactive() {
        Restaurant inactive = Restaurant.builder()
            .restaurantId(new RestaurantId(RESTAURANT_ID))
            .products(List.of(...))
            .active(false)
            .build();
        when(restaurantRepository.findRestaurantInformation(any())).thenReturn(Optional.of(inactive));
        OrderDomainException ex = assertThrows(OrderDomainException.class,
            () -> orderApplicationService.createOrder(createOrderCommand));
        assertTrue(ex.getMessage().contains("currently not active"));
    }
}
```

## Test Configuration

Vì `OrderApplicationServiceImpl` cần dependency injection, ta dùng `@SpringBootTest` với một config class **chỉ tạo bean cần thiết** (không khởi DB, Kafka):

```java
@SpringBootApplication(scanBasePackages = "com.food.ordering.system.order.service.domain")
public class OrderTestConfiguration {

    @Bean
    public OrderRepository orderRepository() {
        return Mockito.mock(OrderRepository.class);
    }

    @Bean
    public CustomerRepository customerRepository() {
        return Mockito.mock(CustomerRepository.class);
    }

    @Bean
    public RestaurantRepository restaurantRepository() {
        return Mockito.mock(RestaurantRepository.class);
    }

    @Bean
    public OrderCreatedPaymentRequestMessagePublisher publisher() {
        return Mockito.mock(OrderCreatedPaymentRequestMessagePublisher.class);
    }

    // Domain service (pure Java) — đăng ký @Bean
    @Bean
    public OrderDomainService orderDomainService() {
        return new OrderDomainServiceImpl();
    }
}
```

Spring scan các package có `@Component`, `@Service` (CommandHandler, Helper, Mapper, ApplicationServiceImpl) — wire chúng với mock repository.

Không có Postgres, không có Kafka. Test khởi chỉ Spring core (validation, transaction support) → khoảng 2-3s startup, sau đó mỗi test < 50ms.

## Tại sao `@SpringBootTest` mà không pure JUnit?

Có thể test pure JUnit:

```java
@Test
void testCreate() {
    OrderRepository repo = mock(OrderRepository.class);
    CustomerRepository custRepo = mock(CustomerRepository.class);
    RestaurantRepository restRepo = mock(RestaurantRepository.class);
    OrderDataMapper mapper = new OrderDataMapper();
    OrderDomainService domainService = new OrderDomainServiceImpl();
    OrderCreateHelper helper = new OrderCreateHelper(domainService, repo, custRepo, restRepo, mapper);
    OrderCreatedPaymentRequestMessagePublisher pub = mock(...);
    OrderCreateCommandHandler handler = new OrderCreateCommandHandler(helper, mapper, pub);
    OrderApplicationServiceImpl svc = new OrderApplicationServiceImpl(handler, ...);
    // ... assert
}
```

Đó là **pure JUnit unit test**. Chạy nhanh hơn `@SpringBootTest`. Nhưng:
- Boilerplate khá nhiều (wire tay).
- `@Valid` annotation **không hoạt động** (cần Spring AOP).
- `@Transactional` không hoạt động (cần Spring proxy).

Khoá học dùng `@SpringBootTest` với mock bean — trade-off: chậm 2-3s startup, đổi lại test giống production behavior (validation, transaction proxy).

Khi nào pick pure JUnit, khi nào pick `@SpringBootTest`:

| Test cái gì | Pick |
|---|---|
| Entity logic, state machine | Pure JUnit |
| Value Object, Mapper | Pure JUnit |
| Domain Service | Pure JUnit |
| Application Service với `@Transactional`, `@Valid` | `@SpringBootTest` + mock |
| End-to-end (REST → DB → Kafka) | `@SpringBootTest` + Testcontainers |

## Test #3: Validation `@Valid` hoạt động

```java
@Test
void shouldFailValidationForNullCustomerId() {
    CreateOrderCommand invalid = CreateOrderCommand.builder()
        // customerId = null
        .restaurantId(RESTAURANT_ID)
        .price(PRICE)
        .items(List.of(...))
        .address(...)
        .build();
    assertThrows(ConstraintViolationException.class,
        () -> orderApplicationService.createOrder(invalid));
}
```

Đây là chỗ chứng minh `@Valid` chạy — `@SpringBootTest` cần thiết.

## Test Coverage benchmark

Mục tiêu:
- **Domain Core**: > 90% (rule + state machine + invariant must cover).
- **Application Service**: > 80% (happy path + 2-3 error path).
- **Adapter** (data, messaging): > 60% (integration test với Testcontainer ở phase-5+).

Đo coverage bằng JaCoCo:

```xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <version>0.8.11</version>
    <executions>
        <execution>
            <goals><goal>prepare-agent</goal></goals>
        </execution>
        <execution>
            <id>report</id>
            <phase>test</phase>
            <goals><goal>report</goal></goals>
        </execution>
    </executions>
</plugin>
```

```text
$ mvn clean test
$ open target/site/jacoco/index.html
```

## Bẫy thường gặp khi test

| Bẫy | Tránh bằng cách |
|---|---|
| Test fail không deterministic (sometimes pass, sometimes fail) | Random UUID, ZonedDateTime.now() → cố định trong test. |
| Mock repository trả về `null` mà code không check | Use `Optional.empty()` thay null. Code phải `.isEmpty()` check. |
| Test trùng tên trong nhiều file → compiler conflict | Đặt tên rõ: `OrderApplicationServiceTest`, `OrderDomainServiceTest`. |
| `@SpringBootTest` không tìm được class | `scanBasePackages` chưa cover package có `@Component`. |
| Test query DB real trong unit test | Mock repository, không gọi DB. DB ở integration test riêng. |
| Quên `verify(publisher).publish(any())` | Khi muốn assert publisher được gọi, dùng Mockito `verify`. |
| Test `OrderItem` rỗng nhưng pass (assert thiếu) | Đảm bảo assert thật sự kiểm tra điều bạn nghĩ — đọc lại assert. |
| Coverage 100% nhưng bug ngoài unit test | Coverage là cần, không đủ. Cộng integration test ở phase sau. |

## Tóm tắt bài 14

- Domain core (`Order`, `OrderItem`, VO) test **pure JUnit + Mockito** — chạy < 100ms / test.
- Application Service test với `@SpringBootTest` + mock Repository/Publisher → vẫn nhanh, vẫn cover `@Valid`, `@Transactional`.
- Test pattern: setup → action → assert state + assert exception + assert publisher called.
- Coverage mục tiêu: domain > 90%, app service > 80%, adapter > 60% (kèm integration test).
- JaCoCo plugin tích hợp Maven sẵn — chạy `mvn test` xong xem report HTML.

**Bài kế tiếp** → [Bài 15 (phase-4): Apache Kafka — topic, partition, producer, consumer cho microservices](../phase-4-kafka/01-kafka-co-ban.md)

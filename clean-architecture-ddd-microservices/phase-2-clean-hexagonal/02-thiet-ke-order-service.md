# Bài 5: Thiết kế Order Service — từ 3-tier đến Port & Adapter, từng bước

> Ở bài 4 bạn đã hiểu **lý thuyết** Clean và Hexagonal. Bài này **vẽ ra** kiến trúc của Order service — cho thấy từng port, từng adapter, từng mũi tên dependency. Cuối bài, bạn có một sơ đồ đầy đủ để **chiếu sang code Java** ở bài tiếp theo. Đọc bài này với giấy bút — vẽ lại sơ đồ vào sổ.

## Điểm xuất phát: kiến trúc 3 tầng (cần phá vỡ)

Trước khi áp Hexagonal, hãy nhìn Order service theo lối nghĩ cũ — kiến trúc 3 tầng:

```text
   ┌─────────────────┐
   │   API Layer     │  REST endpoint POST /orders
   │  Controller     │
   └────────┬────────┘
            │ depends on  ──── 1
            ▼
   ┌─────────────────┐
   │ Business Layer  │  OrderService - business logic
   │ (Domain)        │
   └────────┬────────┘
            │ depends on  ──── 2
            ▼
   ┌─────────────────┐
   │  Data Layer     │  OrderRepository - JPA
   └────────┬────────┘
            ▼
       PostgreSQL
```

Mũi tên **1** và **2** đều **trỏ xuống**. Hệ quả như bài 4 đã chỉ ra:
- Đổi DB → sửa Business layer.
- Test Business → cần Data layer thật.
- Business "biết" về JPA.

Bây giờ áp Hexagonal Architecture từng bước.

## Bước 1: Đảo mũi tên Data → Business

Mục tiêu: **bỏ** mũi tên `Business → Data`. Thay bằng **interface tại domain layer**.

```text
   ┌─────────────────────────────────────┐
   │       Domain (Business) Layer        │
   │                                       │
   │   ┌─────────────────────────┐        │
   │   │  Business logic class    │        │
   │   │  OrderService            │        │
   │   │   uses ── IOrderRepo     │        │
   │   └─────────────────────────┘        │
   │                                       │
   │   ┌─────────────────────────┐        │
   │   │  IOrderRepository        │ ◄────  │  Đây là OUTPUT PORT
   │   │  (interface)             │       │  Domain quyết định ký hợp đồng
   │   └─────────────────────────┘        │
   └──────────────────▲──────────────────┘
                      │ implements
                      │
   ┌──────────────────┴──────────────────┐
   │       Data Access Layer              │
   │                                       │
   │   class OrderJpaAdapter              │
   │   implements IOrderRepository        │ ◄── SECONDARY ADAPTER
   │   (sử dụng Spring JPA bên trong)     │
   └─────────────────────────────────────┘
```

**Source-code dependency lúc này**:
- Domain layer: 0 dependency ra ngoài. Tự sướng.
- Data layer: **phụ thuộc Domain** (để implements interface).

Đảo chiều thành công. Đây là **Dependency Inversion** đã áp dụng vào tầng đầu tiên.

**Quan sát quan trọng**: interface `IOrderRepository` được định nghĩa **bởi domain**, không bởi data layer. Domain mới biết "tôi cần gì" — data layer chỉ cài đặt. Đó là tinh thần "**high-level module defines the abstraction, low-level module implements it**".

## Bước 2: Tách tiếp — Input port cho API layer

API layer (REST controller) muốn gọi vào domain. Theo lối cũ, controller `@Autowired OrderService`. Lúc này API "biết" về class concrete của domain — vẫn còn coupling.

Tách bằng input port:

```text
   ┌─────────────────────────────────────┐
   │            Domain Layer              │
   │                                       │
   │   ┌─────────────────────────┐        │
   │   │  OrderApplicationService │  ◄────│  INPUT PORT (interface)
   │   │  (interface)              │      │  API layer phụ thuộc vào đây
   │   └─────────▲───────────────┘        │
   │             │ implements              │
   │   ┌─────────┴───────────────┐        │
   │   │  OrderAppServiceImpl     │       │
   │   │  (class concrete)        │       │
   │   └─────────────────────────┘        │
   └──────────────────▲──────────────────┘
                      │ depends on (interface only)
                      │
   ┌──────────────────┴──────────────────┐
   │            API Layer                  │
   │                                       │
   │   class OrderController             │ ◄── PRIMARY ADAPTER
   │   @Autowired OrderApplicationService │  (gọi vào domain qua input port)
   │   (qua interface — không biết impl)  │
   └─────────────────────────────────────┘
```

Lưu ý kép:
- API layer **phụ thuộc Domain** (qua interface `OrderApplicationService`).
- Cài đặt `OrderAppServiceImpl` **ở trong** Domain layer.

API layer giờ **không biết** về class concrete `OrderAppServiceImpl` — chỉ thấy interface. Đổi implementation, API không sửa.

## Bước 3: Thêm Messaging và External Service

Order service cần publish event lên Kafka. Lại áp Hexagonal:

```text
   ┌─────────────────────────────────────────────────┐
   │                Domain Layer                       │
   │                                                    │
   │   ┌─────────────────────────┐                    │
   │   │  IOrderRepository        │   ← output port DB │
   │   └─────────────────────────┘                    │
   │                                                    │
   │   ┌─────────────────────────┐                    │
   │   │  IPaymentRequest         │   ← output port    │
   │   │   MessagePublisher       │      Kafka         │
   │   └─────────────────────────┘                    │
   │                                                    │
   │   ┌─────────────────────────┐                    │
   │   │  IRestaurantApproval     │   ← output port    │
   │   │   MessagePublisher       │      Kafka         │
   │   └─────────────────────────┘                    │
   │                                                    │
   │   ┌─────────────────────────┐                    │
   │   │  ICustomerRepository     │   ← output port    │
   │   │  (đọc customer DB)       │     external svc   │
   │   └─────────────────────────┘                    │
   └─────────────────────────────────────────────────┘
                ▲           ▲          ▲          ▲
                │ implement │          │          │
   ┌────────────┴───────────┴──────────┴──────────┴────────────┐
   │  Secondary Adapters (mỗi loại 1 module)                    │
   │                                                              │
   │  Data Access:    OrderRepositoryImpl                        │
   │                  CustomerRepositoryImpl                      │
   │  Messaging:      PaymentRequestKafkaPublisher                │
   │                  RestaurantApprovalKafkaPublisher            │
   └────────────────────────────────────────────────────────────┘
```

Mỗi nhu cầu của domain → một **interface** trong domain. Mỗi implementation tech → một **adapter** ngoài domain. Bao nhiêu cũng được, không giới hạn 6 cạnh.

> **Hexagon ≠ chính xác 6 cạnh**. Tên gọi "hexagonal" chỉ là minh hoạ trực quan. Bạn có thể có 3, 5, 10 port. Quan trọng là **tách port khỏi adapter**.

## Bước 4: Thêm tầng Application Service trong Domain

Đây là điểm khoá học **làm rõ hơn** so với Hexagonal nguyên bản. Domain Layer của khoá chia làm 2 phần:

```text
   ┌─────────────────────────────────────┐
   │            Domain Layer              │
   │                                       │
   │   ┌─────────────────────────────┐   │
   │   │  order-application-service   │   │  ← Application Service
   │   │                               │   │     (orchestration, mapping,
   │   │   - OrderAppServiceImpl       │   │      transaction, port impl)
   │   │   - OrderCreateCommandHandler │   │
   │   │   - OrderTrackCommandHandler  │   │
   │   │   - DTO classes               │   │
   │   │   - Mapper                    │   │
   │   │   - Port interfaces (in/out)  │   │
   │   └──────────────┬──────────────┘   │
   │                  │ uses              │
   │                  ▼                    │
   │   ┌─────────────────────────────┐   │
   │   │  order-domain-core           │   │  ← Domain Core
   │   │                               │   │     (Entity, Aggregate, VO,
   │   │   - Order (aggregate root)    │   │      Domain Event,
   │   │   - OrderItem (entity)         │   │      Domain Service)
   │   │   - Money (value object)      │   │
   │   │   - Address (value object)    │   │
   │   │   - OrderCreatedEvent        │   │
   │   │   - OrderDomainService       │   │
   │   └─────────────────────────────┘   │
   └─────────────────────────────────────┘
```

**Vì sao tách**?

| Trách nhiệm | Domain Core | Application Service |
|---|---|---|
| Business invariant (rule) | ✅ | ❌ |
| State machine của Order | ✅ | ❌ |
| Tính tiền, validate Order | ✅ | ❌ |
| Phát Domain Event | ✅ (chỉ tạo event object) | ❌ |
| Gọi Repository | ❌ | ✅ |
| Mapping DTO ↔ Domain | ❌ | ✅ |
| Validate input từ ngoài | ❌ | ✅ |
| Quản lý transaction | ❌ | ✅ |
| Implement input port | ❌ | ✅ |

Nói cách khác:
- **Domain core** là "**linh hồn**" — pure business, không biết gì về DB, message, mapping.
- **Application service** là "**vỏ ngoài của domain**" — biết về repo, message publisher, mapper, transaction.

Application service vẫn ở **trong** domain layer (đối với Hexagonal "domain layer" là khái niệm rộng). Cả hai cùng tách khỏi infrastructure (adapter ngoài).

## Sơ đồ tổng hợp Order Service

Bỏ tất cả lại với nhau:

```text
   PRIMARY ADAPTERS (driving)                              SECONDARY ADAPTERS (driven)

   ┌─────────────────┐                                    ┌──────────────────────┐
   │   REST Controller│                                    │ OrderRepositoryImpl  │
   │  (POST /orders) │                                    │ (Postgres + JPA)     │
   └────────┬────────┘                                    └──────────▲───────────┘
            │ calls                                                   │ implements
            ▼                                                          │
   ┌────────────────────────────────────────────────────────────────────────────────────┐
   │                              DOMAIN LAYER                                         │
   │                                                                                    │
   │   ┌──────────────────────────┐    ┌─────────────────────────────────────┐         │
   │   │ INPUT PORT (interface)    │    │ OUTPUT PORTS (interfaces)            │         │
   │   │                           │    │                                       │         │
   │   │ OrderApplicationService   │    │ OrderRepository                       │         │
   │   │   .createOrder(cmd)       │    │ CustomerRepository                    │         │
   │   │   .trackOrder(id)         │    │ RestaurantRepository                  │         │
   │   └────────▲──────────────────┘    │ PaymentRequestMessagePublisher        │         │
   │            │                       │ RestaurantApprovalRequestMsgPublisher │         │
   │            │ implements             └─────────────────────────────────────┘         │
   │            │                                                                         │
   │   ┌────────┴──────────────────────────────────────────────────┐                     │
   │   │   APPLICATION SERVICE module                                │                     │
   │   │   - OrderAppServiceImpl                                     │                     │
   │   │   - OrderCreateCommandHandler                               │                     │
   │   │   - OrderTrackCommandHandler                                │                     │
   │   │   - Mapper (CreateOrderCommand → Order)                    │                     │
   │   │   - DTO (CreateOrderCommand, CreateOrderResponse, ...)    │                     │
   │   └─────────────────────────▲─────────────────────────────────┘                     │
   │                              │ uses                                                   │
   │   ┌─────────────────────────┴─────────────────────────────────┐                     │
   │   │   DOMAIN CORE module                                       │                     │
   │   │   - Order (aggregate root)                                  │                     │
   │   │   - OrderItem (entity)                                       │                     │
   │   │   - Money / Address (value object)                         │                     │
   │   │   - OrderCreatedEvent / OrderPaidEvent / ...               │                     │
   │   │   - OrderDomainService (entry point của core logic)         │                     │
   │   └────────────────────────────────────────────────────────────┘                     │
   │                                                                                       │
   └────────────────────────────────────────────────────────────────────────────────────┘
            ▲                                                          │ uses
            │ calls                                                     ▼
   ┌────────┴────────┐                                    ┌──────────────────────┐
   │ Kafka Listener  │                                    │ PaymentRequestKafka  │
   │ (for response   │                                    │ Publisher            │
   │  events)        │                                    │ RestaurantApproval   │
   └─────────────────┘                                    │ KafkaPublisher       │
                                                          └──────────────────────┘

   ↑ Hai bên trái = PRIMARY ADAPTERS  ↑                   ↑ Bên phải = SECONDARY ADAPTERS ↑
   (gọi vào domain qua input port)                        (cài đặt output port của domain)
```

Đọc kỹ sơ đồ. Tất cả mũi tên dependency đều **trỏ vào** Domain Layer ở giữa. Không có mũi tên nào từ Domain trỏ ra ngoài.

## Module — chuyển sơ đồ thành Maven multi-module

Khoá học **đẩy mỗi tầng thành Maven module riêng** để **dependency rule được Maven enforce**. Nếu bạn vô ý import từ outer module vào domain core, Maven sẽ báo lỗi compile.

```text
order-service/                        (parent, packaging=pom)
├── order-domain/                     (parent, packaging=pom)
│   ├── order-domain-core/            ← Entity, Aggregate, VO, Domain Event
│   │                                   0 dependency
│   └── order-application-service/    ← Application service, port interface, DTO
│                                       depends on: order-domain-core
│
├── order-application/                ← REST Controller, RequestDTO REST
│                                       depends on: order-application-service
│
├── order-dataaccess/                 ← JPA Entity, Repository Adapter
│                                       depends on: order-application-service
│
├── order-messaging/                  ← Kafka Avro mapper, Producer, Listener
│                                       depends on: order-application-service
│
└── order-container/                  ← Spring Boot main class, @Configuration
                                        depends on: TẤT CẢ
```

**Tại sao chia chi tiết vậy?**

| Module | Lý do tách |
|---|---|
| `order-domain-core` | Không phụ thuộc ai, test JUnit thuần, có thể tái sử dụng |
| `order-application-service` | Chứa input/output port — interface | adapter | DTO. Tách để adapter có chỗ implement. |
| `order-application` | Đổi từ REST sang gRPC = chỉ cần thay module này, không động core |
| `order-dataaccess` | Đổi Postgres → MongoDB = thay module này |
| `order-messaging` | Đổi Kafka → RabbitMQ = thay module này |
| `order-container` | Chỗ duy nhất Spring "biết tất cả", lắp ráp `@Bean` |

Khi `mvn dependency:tree`, bạn sẽ thấy mũi tên đúng chiều:

```text
order-container
  ├── order-application
  │   └── order-application-service
  │       └── order-domain-core
  ├── order-dataaccess
  │   └── order-application-service
  └── order-messaging
      └── order-application-service
```

Tất cả module **đều phụ thuộc** `order-domain-core` (trực tiếp hoặc transitively). Nhưng `order-domain-core` **không phụ thuộc** ai. Đó là dependency rule, được Maven bảo vệ.

## Vì sao `order-container` cần riêng?

`order-container` là chỗ duy nhất có:
- `@SpringBootApplication` (main class).
- `@Configuration` + `@Bean` factory cho domain class.
- `application.yml` (config Spring, Postgres, Kafka).
- `pom.xml` build runnable JAR (spring-boot-maven-plugin).

Tại sao tách? Vì:
1. Domain code **không được** "biết" Spring. Nếu đặt main class chung với domain → coupling.
2. Build runnable JAR cần đóng gói tất cả dependency → module riêng `order-container` giải quyết.
3. Sau này build Docker image → chỉ build `order-container` thôi.

```java
// order-container/.../OrderServiceApplication.java
@SpringBootApplication(scanBasePackages = "com.food.ordering.system")
public class OrderServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}

// order-container/.../BeanConfiguration.java
@Configuration
public class BeanConfiguration {
    @Bean
    public OrderDomainService orderDomainService() {
        return new OrderDomainServiceImpl();
    }
}
```

Domain class `OrderDomainServiceImpl` **không** có `@Service`. Nó được đăng ký Spring bean **ở container** bằng `@Bean` factory. Đây là kỹ thuật giữ domain "thuần Java".

## Bẫy thường gặp khi áp Clean Architecture lần đầu

| Bẫy | Tránh bằng cách |
|---|---|
| Dùng JPA `@Entity` luôn làm Domain Entity | Tạo 2 class: `Order` (domain, thuần Java) và `OrderEntity` (JPA, ở `order-dataaccess`). Mapper chuyển qua lại. |
| `@Autowired` trong domain core | Dùng constructor injection trong domain (vẫn thuần Java) + đăng ký `@Bean` ở container. |
| Domain core depends on `spring-context` | Maven import phải xanh sạch. `order-domain-core/pom.xml` không có Spring dependency. |
| Output port định nghĩa ở `order-dataaccess` | SAI. Output port là **interface của Domain**, phải nằm trong `order-application-service`. |
| Mapper nằm trong domain core | Mapper biết về 2 model → coupling. Đặt mapper ở `order-application-service` hoặc ở adapter tương ứng. |
| Controller `@Autowired OrderAppServiceImpl` (class concrete) | Phải `@Autowired OrderApplicationService` (interface). |
| Module `order-application` import `order-dataaccess` | Tuyệt đối không. API không biết về DB. Cả hai chỉ biết về `order-application-service`. |
| Test domain phải mở Spring Context | Domain core là Java thuần — test bằng `new` + `Mockito` đơn thuần. |

## Suy nghĩ kỹ trước khi vẽ thêm port

Mỗi port là một interface phải maintain. Đừng vẽ port "có thể cần sau". Vẽ khi domain **đang cần**. Quy tắc:

- Có thao tác I/O với thế giới ngoài (DB, Kafka, HTTP, file) → cần output port.
- Có cách thế giới ngoài gọi vào domain (REST, message listener, scheduler trigger) → cần input port.
- Logic thuần (tính tiền, validate) → **không cần** port. Code thẳng trong domain.

## Checklist hiểu bài

1. Trong sơ đồ Order Service, kể ra **4 output port** mà domain dùng. (`OrderRepository`, `CustomerRepository`, `RestaurantRepository`, `PaymentRequestMessagePublisher`, `RestaurantApprovalRequestMessagePublisher` — hoặc tương tự)
2. **Primary adapter** của Order Service là cái gì? (REST Controller, và sau này Kafka Listener cho payment/restaurant response)
3. `order-container` có thể **phụ thuộc** `order-dataaccess` không? **Có** — vì container là chỗ "biết tất cả" để wiring.
4. `order-dataaccess` có thể **phụ thuộc** `order-application`? **Không** — hai module song song, chỉ qua port chung trong `order-application-service`.
5. JPA `@Entity` đặt ở module nào? (`order-dataaccess` — không phải `order-domain-core`)
6. `@SpringBootApplication` đặt ở module nào? (`order-container`, duy nhất 1 chỗ)
7. Output port **interface** đặt ở module nào? (`order-application-service`)
8. Output port **implementation** đặt ở module nào? (`order-dataaccess` hoặc `order-messaging` — module adapter tương ứng)

## Tóm tắt bài 5

- Order service áp Hexagonal: domain ở giữa, port trên rìa, adapter bên ngoài.
- Domain layer chia 2: **domain-core** (Entity, business rule thuần) và **application-service** (orchestration, port, DTO, mapper).
- Tổng cộng 6 module Maven: `order-domain-core`, `order-application-service`, `order-application`, `order-dataaccess`, `order-messaging`, `order-container`.
- Dependency rule được **Maven enforce**: outer module import inner, inner không import outer.
- `order-container` là chỗ Spring biết về domain — domain vẫn "không biết" Spring.

**Bài kế tiếp** → [Bài 6: Tạo Maven multi-module project — code thật phần xương sống Order Service](03-build-maven-modules.md)

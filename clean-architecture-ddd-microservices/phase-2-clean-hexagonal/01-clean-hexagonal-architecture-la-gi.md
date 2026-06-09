# Bài 4: Clean và Hexagonal Architecture — vì sao và như thế nào

> Đây là **bài quan trọng nhất phase đầu**. Mọi code Java bạn sẽ viết trong 13 phase tiếp theo đều xếp theo cấu trúc bài này dạy. Hiểu sai bài này = lạc đường cả khoá. Đọc chậm, đọc kỹ, vẽ lại sơ đồ ra giấy. Mục tiêu sau bài: bạn **trả lời được** "vì sao tầng A không được phụ thuộc tầng B" và "Dependency Inversion thực sự làm gì".

## Bài toán: kiến trúc 3 tầng truyền thống và nỗi đau của nó

Ai từng học Spring đều quen kiến trúc 3 tầng:

```text
   ┌─────────────────┐
   │   API layer     │  Controller, REST endpoint
   └────────┬────────┘
            │ depends on
            ▼
   ┌─────────────────┐
   │ Business layer  │  Service, business logic
   └────────┬────────┘
            │ depends on
            ▼
   ┌─────────────────┐
   │   Data layer    │  Repository, JPA, JDBC
   └─────────────────┘
            │
            ▼
       Database
```

Đọc kỹ chiều mũi tên: **API phụ thuộc Business, Business phụ thuộc Data**. Trong Java code, điều đó nghĩa là gì?

```java
// File: BusinessService.java
import com.app.dataaccess.OrderJpaRepository;   // ← import từ tầng data
//      ─────────────────────────────────────
//      Đây chính là dependency. Business "biết" về data layer.

@Service
public class BusinessService {
    @Autowired
    private OrderJpaRepository repo;   // ← class JPA, dính chặt vào tầng data

    public Order createOrder(...) {
        // logic nghiệp vụ
        repo.save(orderEntity);   // ← gọi JPA repository trực tiếp
    }
}
```

Khi bạn muốn:
- Đổi từ PostgreSQL sang MongoDB → phải sửa `BusinessService` (vì JPA dính cứng).
- Test `BusinessService` mà không spin up Postgres → phải mock `OrderJpaRepository`, mà mock JPA repository rất khó vì Spring auto-generate.
- Tách team riêng làm business / riêng làm data layer → business team phải đợi data team có schema mới làm được.
- Thay Spring bằng Quarkus → phải gỡ `@Autowired` khỏi business → trải khắp file.

**Vấn đề cốt lõi**: business layer là phần quan trọng nhất (nó là "what your software actually does") nhưng nó lại **phụ thuộc** vào những thứ phụ trợ (DB, framework, message broker). Hệ quả: code business thay đổi mỗi khi tầng dưới thay đổi.

Clean Architecture (Robert C. Martin, 2012) và Hexagonal Architecture (Alistair Cockburn, 2005) cùng giải vấn đề này.

## Tinh thần chung: Business nằm giữa, dependency chỉ "hướng vào"

Cả hai kiến trúc đề ra một **dependency rule** (quy tắc phụ thuộc) duy nhất:

> **Source code dependency chỉ được trỏ vào trong, không bao giờ ra ngoài.**

```text
┌─────────────────────────────────────────────────────────┐
│   Frameworks & Drivers (Spring, JPA, Kafka client)      │
│   ┌─────────────────────────────────────────────┐       │
│   │  Adapters (Controllers, JPA Adapter, ...)    │       │
│   │  ┌────────────────────────────────────┐      │       │
│   │  │  Application Service / Use Case    │      │       │
│   │  │  ┌─────────────────────────┐       │      │       │
│   │  │  │   Entity / Domain Core  │       │      │       │
│   │  │  └─────────────────────────┘       │      │       │
│   │  └────────────────────────────────────┘      │       │
│   └─────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘

      Dependencies →→→ chỉ được trỏ vào trong →→→
```

Tầng **càng vào trong** thì:
- Càng **ít** phụ thuộc bên ngoài (Entity ở trung tâm: 0 dependency).
- Càng **ổn định**, ít thay đổi.
- Càng **quan trọng** (business value cao nhất).

Tầng **càng ngoài** thì:
- Càng nhiều dependency vào framework, library, OS.
- Càng **thay đổi nhiều** (Spring update version, đổi DB, đổi UI).
- Càng "**chi tiết kỹ thuật**" — không phải bản chất nghiệp vụ.

Hexagonal Architecture vẽ trực quan như cái lục giác:

```text
                ┌──────────────────────────┐
                │       Application         │
                │       (Domain Layer)      │
                │                            │
   REST   ──►  ◄──port──[Core Business]──port──►  ◄── Postgres
   client      │                            │       adapter
               │                            │
   Postman ──► ◄──port──                ──port──►  ◄── Kafka adapter
               └──────────────────────────┘
```

Cái "lục giác" ở giữa là **domain core**. 6 cạnh (hoặc nhiều hơn) là các **port** mà adapter bên ngoài cắm vào — như "phích cắm tai nghe": cùng một interface (port), nhiều loại adapter cắm được (tai nghe có dây, tai nghe Bluetooth, loa ngoài).

**Onion Architecture** (Jeffrey Palermo, 2008) cùng tinh thần — vẽ ra hành tây nhiều lớp đồng tâm. Khoá học sẽ dùng "Clean" và "Hexagonal" thay thế nhau vì khác biệt rất nhỏ.

## Nguyên lý #1 — Dependency Inversion (đảo ngược phụ thuộc)

Đây là **trái tim** của Clean Architecture. Dùng OOP + interface để **đảo** chiều phụ thuộc.

### Trước khi đảo (kiến trúc 3 tầng cũ)

```text
   ┌─────────────────┐
   │ Business layer  │
   │  Service.java   │  ← code business
   └────────┬────────┘
            │ import + new
            ▼
   ┌─────────────────┐
   │ Data layer      │
   │  JpaRepo.java   │  ← class concrete của framework
   └─────────────────┘
```

Business phụ thuộc Data. Sửa Data = sửa Business.

### Sau khi đảo (Clean Architecture)

```text
   ┌──────────────────────────────────┐
   │ Business / Domain layer           │
   │                                    │
   │   ┌──────────────────────────┐    │
   │   │ Service.java (logic)      │    │
   │   │ uses ── IOrderRepository  │    │
   │   └──────────────────────────┘    │
   │                                    │
   │   ┌──────────────────────────┐    │
   │   │ IOrderRepository (interface) │ ← port
   │   └──────────────────────────┘    │
   └──────────────────────────────────┘
                  ▲
                  │ implements (Data layer phụ thuộc Business)
                  │
   ┌──────────────┴───────────────────┐
   │ Data access layer                 │
   │                                    │
   │   OrderJpaAdapter implements      │ ← adapter
   │   IOrderRepository                 │
   └──────────────────────────────────┘
```

Đảo nghĩa là: **Data phụ thuộc Business**, không phải ngược lại. Cách làm:
1. Trong tầng business, định nghĩa **interface** `IOrderRepository` mô tả "tôi cần repo nào".
2. Service code chỉ phụ thuộc interface, không biết gì về implementation.
3. Trong tầng data access, tạo `OrderJpaAdapter implements IOrderRepository` — adapter cài đặt interface bằng JPA.
4. Tầng data access **import** interface từ business. Business **không** import gì từ data.

Source code dependency giờ đảo chiều: từ business → data **thành** data → business. Đó là **Dependency Inversion Principle (DIP)** — chữ "D" trong SOLID.

### Vì sao điều này quan trọng?

```text
                 BEFORE                                AFTER
   ┌───────────┐         ┌───────────┐    ┌───────────┐         ┌───────────┐
   │ Business  │────────►│   Data    │    │ Business  │◄────────│   Data    │
   │           │ depends │  (JPA)    │    │           │ depends │  (JPA)    │
   └───────────┘         └───────────┘    └───────────┘         └───────────┘
       │                                        │
       │                                        │
       ▼                                        ▼
   Đổi JPA → MongoDB                      Đổi JPA → MongoDB
   = phải sửa Business                    = chỉ thêm MongoAdapter
                                          Business không bị động.
```

Đây là siêu năng lực của Clean Architecture. Domain core trở thành **stable** — không bị động vì framework update, không bị động vì DB migrate, không bị động vì Kafka đổi sang RabbitMQ.

## Nguyên lý #2 — Port & Adapter (Hexagonal terminology)

Hexagonal Architecture đặt tên cho mọi thứ rất gợi nhớ.

### Port = interface "tôi cần / tôi cho"

Port là **interface** ở tầng domain. Mỗi port là một "cổng" — chỗ adapter cắm vào.

Hai loại port:
- **Input port** (driving port) — interface mà domain **expose ra** cho người dùng/UI gọi vào.
- **Output port** (driven port) — interface mà domain **cần dùng** để gọi tầng dưới (DB, Kafka, external service).

```text
       INPUT PORT                  DOMAIN                  OUTPUT PORT
                                   CORE
   ┌──────────────┐         ┌────────────────┐         ┌──────────────────┐
   │ OrderApp     │         │                │         │ OrderRepository  │
   │ Service      │◄────────│                ├────────►│ (interface)       │
   │ (interface)  │         │                │         └──────────────────┘
   └──────────────┘         │   Order        │
                            │   logic        │         ┌──────────────────┐
                            │                ├────────►│ PaymentRequest    │
                            │                │         │ MessagePublisher  │
                            └────────────────┘         │ (interface)       │
                                                       └──────────────────┘
```

### Adapter = class concrete cài đặt port

Adapter là implementation của port, nằm **ngoài** domain.

Hai loại adapter (đối xứng port):
- **Primary adapter** (driving adapter) — gọi vào domain qua input port. Ví dụ: REST controller, CLI handler, gRPC server, Kafka consumer.
- **Secondary adapter** (driven adapter) — được domain gọi qua output port. Ví dụ: JPA repository adapter, Kafka producer adapter, HTTP client gọi service ngoài.

```text
   PRIMARY ADAPTER             DOMAIN CORE              SECONDARY ADAPTER
   (driving — drive into       (logic ở giữa)           (driven — bị drive
    domain)                                              bởi domain)

   REST Controller ──► input ──► Domain ──► output ──► JPA Adapter
   Kafka Listener  ──► port  ──► logic  ──► port   ──► Kafka Producer
   CLI Handler     ──► port  ──► logic  ──► port   ──► HTTP Client
```

> **Nhớ đơn giản**: ai gọi vào domain (drive nó chạy) = **primary**. Ai bị domain gọi xuống = **secondary**. Cả hai đều là adapter, đều cài đặt một port.

## Nguyên lý #3 — Dependency Injection để "ghép nối"

Dependency Inversion **đảo** dependency ở mức **compile time** (source code). Để runtime hoạt động, vẫn cần một implementation **thật** cho interface. Đó là việc của **Dependency Injection (DI)**.

```text
COMPILE TIME (source code):
   Business chỉ biết:    interface IOrderRepository
   Data chỉ biết:        class OrderJpaAdapter implements IOrderRepository

RUNTIME (program đang chạy):
   Có ai đó (DI container) chui vào và "ghép":
   "Khi Business cần IOrderRepository, đưa cho nó instance của OrderJpaAdapter"
```

Trong Spring, việc ghép này được làm bằng `@Autowired` hoặc constructor injection. Nhưng — **đây là điểm tinh tế của khoá học** — bạn sẽ **không** dùng `@Autowired` trong domain core. Vì sao? Vì domain core phải **độc lập framework**. Nếu domain có `@Autowired`, nó đã phụ thuộc Spring.

Khoá học giải bằng cách:
1. Domain core viết thuần Java, không annotation Spring.
2. Tầng **container** (chính là `order-container` module) chứa class config với các `@Bean` factory tạo instance domain class.
3. Spring chỉ "nhìn thấy" container, không "nhìn thấy" domain.

```java
// order-domain-core/.../OrderDomainService.java   ← thuần Java, không Spring
public class OrderDomainServiceImpl implements OrderDomainService {
    public OrderCreatedEvent validateAndInitiateOrder(Order order, Restaurant restaurant) {
        // logic nghiệp vụ
    }
}

// order-container/.../BeanConfiguration.java   ← chỉ ở container
@Configuration
public class BeanConfiguration {
    @Bean
    public OrderDomainService orderDomainService() {
        return new OrderDomainServiceImpl();   // factory thủ công
    }
}
```

Cách làm này hơi "thêm code" so với việc chấm `@Service` lên class. Nhưng trade-off rất rõ: domain core **chạy được mà không cần Spring**. Bạn có thể test domain bằng JUnit thuần. Bạn có thể dùng lại domain với một framework khác (Micronaut, Quarkus) sau này mà không sửa dòng nào.

## Lợi ích — vì sao đáng "viết thêm code"

Khoá học sẽ chỉ rõ 5 lợi ích sau khi áp dụng:

### 1. Testable một cách điên rồ

```text
Trước: muốn test BusinessService → khởi Spring + Postgres + Kafka + Spring Test
       Thời gian khởi 1 test: 10-30 giây.

Sau:   muốn test OrderDomainServiceImpl → new + truyền mock vào → assert
       Thời gian: < 100ms.
```

Test domain logic bằng JUnit thuần, không Spring boot test, không testcontainer, không Postgres. Khoá học có cả phase test riêng để bạn thấy.

### 2. Thay tech stack không sửa core

```text
Đổi Postgres → MongoDB:
   Thêm OrderMongoAdapter implements OrderRepository
   Cập nhật @Bean trong container
   Domain core: 0 dòng sửa.

Đổi Kafka → RabbitMQ:
   Thêm OrderRabbitPublisher implements OrderMessagePublisher
   Domain core: 0 dòng sửa.
```

### 3. Phát triển song song nhiều team

Domain team định nghĩa port → ký hợp đồng interface. Sau đó:
- Team Business code domain core với mock adapter.
- Team Infrastructure code adapter cho Postgres/Kafka.
- Hai team không block nhau.

### 4. Delay quyết định kỹ thuật

Bạn chưa biết chọn Postgres hay MongoDB? Code business trước, chọn DB sau. Bạn chưa biết Kafka hay RabbitMQ? Code business trước, chọn message broker sau. Đây là tư tưởng "**defer infrastructure decisions**" của Robert Martin.

### 5. Code business **đọc được** sau 5 năm

Khi framework đã change 3 lần, DB đã migrate 2 lần, message broker đã đổi 1 lần — domain core vẫn nguyên. Đọc class `Order`, `OrderDomainService` 5 năm sau vẫn hiểu business làm gì.

## Trade-off — "writing more code"

Khoá học **không** giấu nhược điểm:

| Nhược | Giải thích |
|---|---|
| **Nhiều file hơn** | Mỗi adapter cần interface + impl. Mỗi DTO cần class riêng cho từng tầng. |
| **Mapping nhiều** | Entity domain ≠ JPA entity ≠ DTO REST ≠ Avro Kafka — 4 class cho 1 khái niệm. Có mapper. |
| **Học curve** | Junior dev mới vào dễ hỏi "tại sao file đơn giản thế này lại tách làm 3 module?". |
| **Overkill cho project nhỏ** | App CRUD < 20 endpoint, vòng đời < 1 năm → 3-tier nhanh hơn. |

> **Khi nào KHÔNG áp dụng Clean Architecture?**
> - Prototype, hackathon, MVP demo cuối tuần.
> - Script ETL chạy 1 lần.
> - Microservice cực nhỏ (CRUD-like) mà bạn chắc chắn sẽ không thay tech.
> - Team chưa hiểu DI sâu, áp dụng vội sẽ rối.
>
> **Khi nào ÁP DỤNG mạnh?**
> - Service có business logic phức tạp (có state machine, có rule).
> - Service dự kiến sống nhiều năm.
> - Service cần test sâu (regulated industry, banking).
> - Service có nhiều adapter (multi-DB, multi-channel input).

## Clean vs Hexagonal vs Onion — khác nhau ở đâu?

3 kiến trúc cùng tinh thần, khác biệt nhỏ ở "domain core viết thế nào":

| | Hexagonal (2005) | Onion (2008) | Clean (2012) |
|---|---|---|---|
| Trọng tâm | Port + Adapter | Layered onion | "Use Case" + Entity |
| Domain core | "Application" (chưa chi tiết) | Có Domain Model + Domain Service | Có **Entity** (enterprise rule) + **Use Case** (application rule) |
| Cụm từ | Port, adapter, primary/secondary | Inner / outer ring | Entity, Use Case, Interface Adapter, Framework |

Tóm gọn:
- **Hexagonal** đặt tên cho cấu trúc **bên ngoài** (port + adapter).
- **Onion** đặt tên cho **vòng tròn nhiều lớp** bao quanh domain.
- **Clean** thêm chi tiết **bên trong** (Entity vs Use Case).

Khoá học **kết hợp**: dùng vocabulary Hexagonal (port + adapter) ở tầng ngoài, dùng DDD (Entity, Aggregate, Domain Service) ở tầng trong. Robert Martin chính là đề xuất "Clean = Hexagonal + Onion + DDD".

## DDD đứng ở đâu trong bức tranh này?

DDD là **complement** (bổ sung) — nó nói **bên trong** domain core viết thế nào. Clean Architecture nói "domain core nằm ở giữa và không phụ thuộc gì". DDD nói "domain core có Entity, Aggregate, Value Object, Domain Service, Application Service, Domain Event".

```text
Clean: WHERE business code lives    (vị trí trong kiến trúc)
DDD:   HOW business code structured (bên trong cụ thể viết sao)
```

Phase-3 sẽ đào sâu DDD. Hiện tại chỉ cần biết: Clean Architecture giải vấn đề "domain phụ thuộc ai?", còn DDD giải vấn đề "domain viết thế nào để khớp với ngôn ngữ business?".

## So sánh với một thứ bạn có thể đã biết — Spring layered

Code Spring "kiểu Việt Nam thường gặp":

```java
@RestController
class OrderController {
    @Autowired OrderService service;
}

@Service
class OrderService {
    @Autowired OrderRepository repo;   // ← repo là JPA repository thẳng
    public void createOrder(...) {
        Order entity = new Order(...);
        entity.setStatus("PENDING");
        repo.save(entity);
    }
}

@Repository
interface OrderRepository extends JpaRepository<Order, UUID> {}
```

Code khoá học (Clean Architecture):

```java
// order-domain-core: thuần Java, không Spring
public class Order {                       // ← Aggregate Root
    private OrderStatus status;
    public void initiate() {
        validate();
        this.status = OrderStatus.PENDING;
    }
}

public interface OrderRepository {         // ← output port, thuần Java
    Optional<Order> findById(OrderId id);
    Order save(Order order);
}

// order-application-service: Application service - vẫn thuần Java
public class OrderCreateCommandHandler {
    private final OrderRepository orderRepository;   // ← phụ thuộc interface
    public CreateOrderResponse createOrder(CreateOrderCommand cmd) {
        Order order = ...;
        order.initiate();
        return CreateOrderResponse.from(orderRepository.save(order));
    }
}

// order-application: REST controller, có Spring annotation
@RestController
public class OrderController {
    private final OrderApplicationService service;   // ← input port
    @PostMapping("/orders")
    public CreateOrderResponse createOrder(@RequestBody CreateOrderCommand cmd) {
        return service.createOrder(cmd);
    }
}

// order-dataaccess: Spring Data JPA adapter
@Component
public class OrderRepositoryImpl implements OrderRepository {
    private final OrderJpaRepository jpaRepo;
    private final OrderDataAccessMapper mapper;
    @Override
    public Order save(Order order) {
        return mapper.toDomain(jpaRepo.save(mapper.toJpaEntity(order)));
    }
}
```

Khác biệt:
- **Spring annotation** chỉ xuất hiện ở tầng ngoài (`order-application`, `order-dataaccess`).
- **Mapper** chuyển giữa Domain Entity và JPA Entity (đừng dùng JPA entity làm Domain Entity — đây là bẫy lớn).
- Test domain logic không cần khởi Spring.

## Checklist hiểu bài

Trả lời được hết là OK đi tiếp:

1. **Dependency Rule** nói gì? (Source code dependency chỉ trỏ vào trong)
2. **Port** và **Adapter** khác nhau ở điểm nào? (Port = interface ở domain; Adapter = class concrete ở ngoài)
3. **Input port** và **output port** dùng cho ai? (Input: primary adapter gọi vào; Output: domain gọi xuống secondary adapter)
4. **Dependency Inversion** đảo cái gì? (Đảo source-code dependency: tầng dưới phụ thuộc tầng trên qua interface, không phải ngược lại)
5. **Dependency Injection** khác Dependency Inversion ở đâu? (DI là cơ chế runtime để ghép implementation vào interface; DIP là nguyên tắc thiết kế ở compile time)
6. Vì sao **không đặt `@Autowired` trong domain core**? (Để domain độc lập framework)
7. **Mapper** giữa Domain Entity và JPA Entity dùng để làm gì? (Tách model business khỏi model DB — đổi DB không sửa domain)
8. **Clean Architecture** đi xa hơn **Hexagonal Architecture** ở điểm nào? (Định nghĩa chi tiết bên trong domain: Entity = enterprise rule, Use Case = application rule)

Nếu bí 2-3 câu trở lên → đọc lại từ đầu.

## Tóm tắt bài 4

- **Dependency Rule**: source code dependency chỉ trỏ vào trong, không bao giờ ra ngoài.
- **Hexagonal** đặt tên cho cấu trúc ngoài (Port + Adapter, primary + secondary).
- **Clean** thêm chi tiết bên trong domain (Entity + Use Case).
- **Dependency Inversion** + **Dependency Injection** là 2 kỹ thuật then chốt để đảo phụ thuộc.
- Domain core phải **thuần Java**, không phụ thuộc Spring/JPA/Kafka — đây là điểm khác biệt của khoá học so với Spring layered thông thường.
- Cái giá phải trả: **nhiều file hơn, mapper nhiều hơn**. Đổi lại: **testable, đổi tech dễ, sống lâu**.

**Bài kế tiếp** → [Bài 5: Thiết kế Order Service theo Hexagonal Architecture — từ 3-tier đến Port & Adapter](02-thiet-ke-order-service.md)

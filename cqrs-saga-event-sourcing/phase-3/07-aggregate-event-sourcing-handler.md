# Bài 7: Aggregate và EventSourcingHandler — trái tim write side

Axon đang nhận command nhưng chưa biết làm gì. **Aggregate** là nơi ta dạy nó: validate command, sinh event, và lưu event theo kiểu event sourcing. Đây là class quan trọng nhất phía ghi. Bài này xây `CustomerAggregate` xử lý cả create/update/delete.

## Aggregate chịu trách nhiệm gì?

> **Aggregate** (Phase 2) = đối tượng gói **state + business logic** của một record. Trong Axon, nó làm ba việc:
> 1. **Xử lý** command (`@CommandHandler`) — validate.
> 2. **Apply** event để lưu vào event store (`@EventSourcingHandler`).
> 3. Axon tự **phát** event ra bus sau khi lưu xong.

```text
   CreateCustomerCommand
          │  @CommandHandler (constructor)
          ▼
   ┌──────────────────────┐
   │  CustomerAggregate    │  validate (mobileNumber chưa tồn tại?)
   │  state: customerId... │  ──► AggregateLifecycle.apply(CustomerCreatedEvent)
   └──────────┬───────────┘
              │  @EventSourcingHandler
              ▼
   gán state nội bộ + Axon lưu event vào EVENT STORE
              │
              ▼  (Axon tự động) publish lên EVENT BUS
```

## Khung CustomerAggregate

Trong `command/aggregate`:

```java
@Aggregate
public class CustomerAggregate {

    @AggregateIdentifier
    private String customerId;
    private String name;
    private String email;
    private String mobileNumber;
    private boolean activeSw;
    // KHÔNG final: update sẽ ghi đè các field này

    public CustomerAggregate() { }   // constructor rỗng — Axon BẮT BUỘC cần

    // ... command handlers bên dưới
}
```

| Phần | Vì sao |
|---|---|
| `@Aggregate` | Báo Axon: class này xử lý command |
| `@AggregateIdentifier` trên `customerId` | Khóa định danh aggregate (khác `@TargetAggregateIdentifier` ở command) |
| Field **không** `final` | Mỗi lần update, Axon ghi đè các field này |
| Constructor rỗng | Framework cần để khởi tạo aggregate trước khi replay event |

### Vì sao `customerId` (không phải mobileNumber) làm aggregate identifier?

Đây là quyết định thiết kế cốt lõi của event sourcing:

```text
Event sourcing: mỗi write KHÔNG ghi đè 1 record — mà thêm 1 ENTRY mới, tăng sequence:
   customerId=abc, seq=0  CustomerCreated  {mobile:123}
   customerId=abc, seq=1  CustomerUpdated  {name:...}
   customerId=abc, seq=2  CustomerUpdated  {email:...}
```

Khi update/delete, Axon **load lại** toàn bộ event cũ theo aggregate identifier để dựng state hiện tại, rồi mới thêm event mới với sequence tăng dần. Nên identifier phải **không bao giờ đổi** suốt vòng đời.

- `customerId`: sinh lúc tạo, **không bao giờ đổi** → hợp lý.
- `mobileNumber`: customer có thể đổi từ `123` → `456` → chuỗi event bị "gãy" (vài event mobile 123, vài event mobile 456) → event sourcing hỏng. **Không** dùng làm identifier.

## CommandHandler create — constructor

Create dùng **constructor** (vì đang tạo aggregate mới); update/delete dùng **method thường**.

```java
@CommandHandler
public CustomerAggregate(CreateCustomerCommand command, CustomerRepository repository) {
    // 1. Validate: không cho 2 customer cùng mobileNumber active
    Optional<Customer> optionalCustomer =
        repository.findByMobileNumberAndActiveSw(command.getMobileNumber(), true);
    if (optionalCustomer.isPresent()) {
        throw new CustomerAlreadyExistException(
            "Customer already exist with given mobile number " + command.getMobileNumber());
    }

    // 2. Tạo event từ command (copy field cùng tên)
    CustomerCreatedEvent event = new CustomerCreatedEvent();
    BeanUtils.copyProperties(command, event);   // Spring: copy theo tên field khớp

    // 3. Publish event → Axon sẽ lưu event store rồi đẩy lên bus
    AggregateLifecycle.apply(event);
}
```

| Bước | Giải thích |
|---|---|
| `@CommandHandler` trên constructor | Báo Axon: constructor này xử lý `CreateCustomerCommand` |
| Inject `CustomerRepository` qua tham số | Axon tự inject bean — dùng để query read DB validate |
| `BeanUtils.copyProperties(src, target)` | Copy data command → event theo **tên field khớp** (đỡ set tay từng field) |
| `AggregateLifecycle.apply(event)` | **Phát** event. Đây chỉ là *publish*; việc *lưu* do `@EventSourcingHandler` lo (bên dưới) |

## EventSourcingHandler — lưu vào event store

`apply()` mới chỉ phát event. Ta cần một method bắt event đó và áp vào state — Axon dùng chính việc này để lưu event store:

```java
@EventSourcingHandler
public void on(CustomerCreatedEvent event) {
    this.customerId   = event.getCustomerId();
    this.name         = event.getName();
    this.email        = event.getEmail();
    this.mobileNumber = event.getMobileNumber();
    this.activeSw     = event.isActiveSw();
}
```

- `@EventSourcingHandler`: báo Axon "khi `CustomerCreatedEvent` được apply, chạy method này".
- Logic chỉ là **đọc field từ event, gán vào state aggregate** (dùng `this`).
- **Phía sau**: Axon lưu event vào storage theo kiểu **lịch sử/tuần tự** (event cũ ở dưới, event mới chồng lên, mỗi cái một sequence). Sau khi lưu xong, Axon đẩy event lên event bus.

```text
EVENT STORE (write DB), tích lũy theo thời gian:
   seq 2  CustomerUpdatedEvent   ← mới nhất, chồng lên trên
   seq 1  CustomerUpdatedEvent
   seq 0  CustomerCreatedEvent   ← đầu tiên, dưới cùng
```

> **"Write DB của tôi đâu? Kafka đâu?"** Hai câu hỏi hay gặp:
> - Vì Axon Server chạy **dev mode**, mọi event/data lưu vào thư mục `events/`, `data/` ta đã mount (Phase 3 bài 2). Production: DevOps cấu hình MongoDB/NoSQL làm event store (Axon khuyến nghị MongoDB).
> - Event bus: **Axon Server có sẵn event bus nội bộ** — không cần Kafka/RabbitMQ. Production có thể thay bằng Kafka tùy nhu cầu. Developer chỉ lo *phát* và *consume* event.

## Update và Delete — CommandHandler kiểu method

Update/delete dùng **method thường** (không constructor) + `@CommandHandler`:

```java
@CommandHandler
public void handle(UpdateCustomerCommand command) {
    // (validation sẽ chuyển sang Interceptor — bài 9; ở đây tạm bỏ qua)
    CustomerUpdatedEvent event = new CustomerUpdatedEvent();
    BeanUtils.copyProperties(command, event);
    AggregateLifecycle.apply(event);
}

@EventSourcingHandler
public void on(CustomerUpdatedEvent event) {
    // update chỉ cho đổi name + email → KHÔNG đụng customerId/mobileNumber/activeSw
    this.name  = event.getName();
    this.email = event.getEmail();
}

@CommandHandler
public void handle(DeleteCustomerCommand command) {
    CustomerDeletedEvent event = new CustomerDeletedEvent();
    BeanUtils.copyProperties(command, event);
    AggregateLifecycle.apply(event);
}

@EventSourcingHandler
public void on(CustomerDeletedEvent event) {
    this.activeSw = event.isActiveSw();   // chỉ đổi cờ active → soft delete
}
```

Hai điểm tinh tế:

| Điểm | Giải thích |
|---|---|
| Update chỉ gán `name` + `email` | Ta không cho đổi `customerId`/`mobileNumber`/`activeSw` qua update thường. Các field khác **được copy nguyên** từ event trước đó khi replay → không mất |
| Một entry mới khi update | Event sourcing không ghi đè — update tạo `CustomerUpdatedEvent` mới (seq tăng); các field không đổi kế thừa từ event cũ |

## Mẫu lặp lại — nhận diện pattern

Mọi command handler đều theo khuôn:

```text
1. (validate nếu cần)
2. tạo Event tương ứng + BeanUtils.copyProperties(command, event)
3. AggregateLifecycle.apply(event)
   → @EventSourcingHandler bắt event → gán state → Axon lưu event store → publish bus
```

## Tóm tắt bài 7

- **`@Aggregate`** xử lý command, **`@AggregateIdentifier`** = `customerId` (chọn field **không bao giờ đổi** vì event sourcing load lại theo nó).
- **Create** → `@CommandHandler` trên **constructor**; **update/delete** → `@CommandHandler` trên **method**.
- Mẫu: validate → `BeanUtils.copyProperties(command, event)` → `AggregateLifecycle.apply(event)`.
- **`@EventSourcingHandler`** bắt event đã apply, gán vào state; Axon lưu event vào store (append-only, có sequence) rồi đẩy lên bus.
- Dev mode → event lưu thư mục `events/`; event bus nội bộ của Axon Server (không cần Kafka). Production → MongoDB/Kafka do DevOps.
- Update chỉ đổi `name`+`email`; field khác kế thừa khi replay.

**Bài kế tiếp** → [Bài 8: Projection và Query API — read side](08-projection-query-api.md)

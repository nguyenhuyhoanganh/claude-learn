# Bài 9: Demo, Interceptor validation, đọc EventStore và plugin

Một vòng CQRS đã hoàn chỉnh (bài 4-8). Bài này chạy demo thật, quan sát event trong Axon dashboard, rồi cải thiện code: chuyển validation ra **Interceptor** (chạy *trước* khi command tới handler), học cách **đọc trực tiếp EventStore**, và dùng **plugin IntelliJ** để điều hướng command ↔ event.

## Chạy demo & quan sát dashboard

Thứ tự khởi động: Axon Server (Docker) → Eureka → Customer → Gateway. (Reset sạch: xóa container + nội dung `data/`, `events/`, và file `*.db` của H2.)

> **Bẫy khởi động hay gặp**: nếu customer báo lỗi duplicate REST API → còn `CustomerController` cũ chứa API trùng với `CustomerQueryController`. **Xóa hẳn** `CustomerController` (đã tách hết sang command/query).

Sau khi tạo/đọc/sửa/xóa qua Postman, mở dashboard `localhost:8024`:

| Tab | Quan sát được gì |
|---|---|
| **Search** (Query Time = last hour) | Các event đã lưu: cùng **aggregate identifier** (= customerId), **sequence** 0,1,2..., cùng **aggregate type** `CustomerAggregate`, **payload type** `CustomerCreatedEvent`/`...Updated`/`...Deleted` |
| Bật checkbox **payload data** | Xem **nội dung** từng event (name, email...) — vàng cho việc debug production |
| **Commands** | Số command đã dispatch (vd create×1, update×2) và distribution sang query side |
| **Queries** | Số query đã chạy, số lỗi |

```text
Search → các event của 1 customer (aggregate identifier = customerId):
   seq 0   CustomerCreatedEvent
   seq 1   CustomerUpdatedEvent
   seq 2   CustomerUpdatedEvent
   seq 3   CustomerDeletedEvent   ← sau khi delete
```

> **Tra theo aggregate identifier**: trong ô query của Search, gõ `aggregateIdentifier = "your-customer-id"` (không khoảng trắng, đúng hoa/thường) để lọc đúng một customer. Sau delete, fetch sẽ ném `ResourceNotFound` (read DB đã set `activeSw=false`) → chứng tỏ write↔read **đồng bộ** qua event bus.

Đây chính là sức mạnh đã hứa ở Phase 2: **mọi thay đổi đều có dấu vết** trong event store, dùng để audit, debug, phân tích.

## Plugin IntelliJ cho Axon — điều hướng command ↔ event

Cài: Plugins → Marketplace → "Axon Framework" → Install → restart IDE.

Sau khi cài, ở dòng tạo command/event xuất hiện **mũi tên màu cam** bên trái. Click để nhảy:

```text
CustomerCommandController   ──(click ➜)──►  CustomerAggregate @CommandHandler
   (nơi build command)                         (nơi xử lý command)

CustomerAggregate apply(event)  ──(click ➜)──►  có 2 nơi handle event:
                                                 • CustomerProjection @EventHandler
                                                 • CustomerAggregate @EventSourcingHandler
```

Trong dự án thật có hàng trăm command/event — thay vì mở tay từng class, plugin cho nhảy thẳng từ "nơi phát" tới "nơi xử lý" và ngược lại. (Chỉ có trên IntelliJ marketplace, chưa có cho Eclipse/VS Code.)

## Interceptor — validate TRƯỚC khi command tới handler

Hiện validation nằm trong aggregate (sau khi command đã tới handler). Axon **khuyến nghị** validate *trước khi dispatch tới handler*, bằng `MessageDispatchInterceptor`. Lợi ích: gom mọi validation command vào **một chỗ**, dễ bảo trì.

```text
CommandGateway.send  ──►  [INTERCEPTOR validate]  ──►  Aggregate @CommandHandler
                            ▲ chạy TRƯỚC handler
```

Trong `command/interceptor`:

```java
@Component
@RequiredArgsConstructor
public class CustomerCommandInterceptor
        implements MessageDispatchInterceptor<CommandMessage<?>> {

    private final CustomerRepository repository;

    @Override
    public BiFunction<Integer, CommandMessage<?>, CommandMessage<?>> handle(
            List<? extends CommandMessage<?>> messages) {

        return (index, command) -> {

            if (CreateCustomerCommand.class.equals(command.getPayloadType())) {
                CreateCustomerCommand cmd = (CreateCustomerCommand) command.getPayload();
                repository.findByMobileNumberAndActiveSw(cmd.getMobileNumber(), true)
                    .ifPresent(c -> { throw new CustomerAlreadyExistException(...); });

            } else if (UpdateCustomerCommand.class.equals(command.getPayloadType())) {
                UpdateCustomerCommand cmd = (UpdateCustomerCommand) command.getPayload();
                repository.findByMobileNumberAndActiveSw(cmd.getMobileNumber(), true)
                    .orElseThrow(() -> new ResourceNotFoundException("Customer","mobileNumber",cmd.getMobileNumber()));

            } else if (DeleteCustomerCommand.class.equals(command.getPayloadType())) {
                DeleteCustomerCommand cmd = (DeleteCustomerCommand) command.getPayload();
                repository.findByCustomerIdAndActiveSw(cmd.getCustomerId(), true)
                    .orElseThrow(() -> new ResourceNotFoundException("Customer","customerId",cmd.getCustomerId()));
            }

            return command;   // không sửa gì thì trả nguyên command
        };
    }
}
```

Giải thích các điểm dễ rối:

| Điểm | Giải thích |
|---|---|
| Generic `CommandMessage<?>` | Mọi command được Axon bọc trong `CommandMessage` (chứa payload + metadata) |
| Trả `BiFunction<Integer, CommandMessage, CommandMessage>` | Lambda chạy cho **từng** command. Axon hỗ trợ **batch** nên nhận `List` (ở ta list 1 phần tử) |
| `command.getPayloadType()` | Lấy class của payload → rẽ nhánh validate theo loại command |
| `(CreateCustomerCommand) command.getPayload()` | Ép kiểu payload để đọc field |
| `return command` | Trả command (có thể đã sửa). Validate fail thì ném exception ngay |

> Bạn có thể **sửa** command message (ví dụ nâng version) trong interceptor, không chỉ validate. Sau khi chuyển validation ra đây, xóa (hoặc comment) code validate trong aggregate. Cần thêm method repo `findByCustomerIdAndActiveSw` cho nhánh delete.

### Đăng ký interceptor — bước dễ quên

Interceptor sẽ **không chạy** nếu chưa đăng ký với CommandGateway. Trong Spring Boot main class:

```java
@Autowired
public void registerCustomerCommandInterceptor(
        ApplicationContext context, CommandGateway commandGateway) {
    commandGateway.registerDispatchInterceptor(
        context.getBean(CustomerCommandInterceptor.class));
}
```

Giờ mọi command dispatch qua `CommandGateway` đều chạy interceptor trước. Test: tạo customer trùng mobileNumber → breakpoint dừng trong interceptor → ném `CustomerAlreadyExist`.

## Đọc trực tiếp EventStore

Thường validate bằng cách đọc **read DB** (như trên). Nhưng đôi khi cần đọc thẳng **event store**. Axon cấp bean `EventStore`:

```java
// Trong aggregate, inject EventStore qua tham số @CommandHandler
List<?> events = eventStore.readEvents(command.getCustomerId())   // theo aggregate identifier
        .asStream()
        .collect(Collectors.toList());

if (events.isEmpty()) {
    throw new ResourceNotFoundException("Customer", "customerId", command.getCustomerId());
}
```

- `readEvents(aggregateId)` trả toàn bộ event của một aggregate; có overload đọc từ một **sequence** cụ thể.
- `.asStream()` → xử lý dạng stream; ở đây chỉ check rỗng, nhưng bạn có thể đọc nội dung event để ra quyết định nghiệp vụ.

> Đây là cách "đi thẳng vào nguồn sự thật" (event store) thay vì read DB — hữu ích cho các validation đặc thù. (Trong khóa, giảng viên giữ validate ở interceptor nên đoạn này để tham khảo/comment.)

## Tóm tắt bài 9

- Demo: dashboard **Search** cho thấy event theo aggregate identifier + sequence; tra `aggregateIdentifier = "..."`; write↔read đồng bộ qua event bus.
- **Plugin IntelliJ**: mũi tên cam nhảy command ↔ handler ↔ event — tăng năng suất khi nhiều command/event.
- **`MessageDispatchInterceptor`**: validate **trước** khi command tới handler, gom validation một chỗ; rẽ nhánh theo `getPayloadType()`. **Phải đăng ký** với CommandGateway trong main class, nếu không nó không chạy.
- **`EventStore.readEvents(aggregateId)`**: đọc trực tiếp event store khi cần (thay vì read DB).
- Bẫy: xóa `CustomerController` cũ để tránh duplicate route.

**Bài kế tiếp** → [Bài 10: Event Processors — subscribing vs streaming và rollback](10-event-processors-rollback.md)

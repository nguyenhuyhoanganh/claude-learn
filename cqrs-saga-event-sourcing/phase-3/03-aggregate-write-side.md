# Bài 3: Aggregate — Trái tim của Write Side

## Aggregate là gì?

Aggregate là class Java trung tâm của phía **Write Side** trong CQRS + Event Sourcing. Nó:
1. Nhận và xử lý Commands (`@CommandHandler`)
2. Validate business rules
3. Apply Events (`AggregateLifecycle.apply()`)
4. Cập nhật internal state khi Event được apply (`@EventSourcingHandler`)

Axon Framework lưu các events này vào Event Store và tự động **replay** chúng khi cần rebuild state.

---

## Cấu trúc một Aggregate class

```java
@Aggregate  // Đánh dấu đây là Aggregate cho Axon
@Slf4j
public class CustomerAggregate {

    // ===== STATE FIELDS =====
    // Các field này được rebuild từ events (NOT from DB directly)
    
    @AggregateIdentifier  // Aggregate ID - phải có, phải unique
    private String customerId;
    
    private String name;
    private String email;
    private String mobileNumber;
    
    // Constructor mặc định PHẢI có (Axon cần để deserialize)
    public CustomerAggregate() {}
    
    
    // ===== COMMAND HANDLERS =====
    // Xử lý commands, validate business rules, rồi apply events
    
    @CommandHandler
    public CustomerAggregate(CreateCustomerCommand command) {
        // Đây là constructor CommandHandler — dùng cho "create" commands
        // Validate business logic ở đây
        if (command.getName() == null || command.getName().isEmpty()) {
            throw new IllegalArgumentException("Customer name cannot be empty");
        }
        
        // Nếu validation pass → apply event (KHÔNG set state trực tiếp!)
        apply(CustomerCreatedEvent.builder()
            .customerId(command.getCustomerId())
            .name(command.getName())
            .email(command.getEmail())
            .mobileNumber(command.getMobileNumber())
            .build());
    }
    
    @CommandHandler
    public void handle(UpdateCustomerCommand command) {
        // Method CommandHandler — dùng cho "update" commands
        apply(CustomerUpdatedEvent.builder()
            .customerId(command.getCustomerId())
            .name(command.getName())
            .email(command.getEmail())
            .mobileNumber(command.getMobileNumber())
            .build());
    }
    
    @CommandHandler
    public void handle(DeleteCustomerCommand command) {
        apply(CustomerDeletedEvent.builder()
            .customerId(command.getCustomerId())
            .build());
    }
    
    
    // ===== EVENT SOURCING HANDLERS =====
    // Cập nhật STATE của Aggregate khi event được apply
    // KHÔNG có side effects! KHÔNG gọi DB, KHÔNG gọi API ngoài!
    
    @EventSourcingHandler
    public void on(CustomerCreatedEvent event) {
        // Đây là method duy nhất được phép SET STATE
        this.customerId = event.getCustomerId();
        this.name = event.getName();
        this.email = event.getEmail();
        this.mobileNumber = event.getMobileNumber();
    }
    
    @EventSourcingHandler
    public void on(CustomerUpdatedEvent event) {
        this.name = event.getName();
        this.email = event.getEmail();
        this.mobileNumber = event.getMobileNumber();
    }
    
    @EventSourcingHandler
    public void on(CustomerDeletedEvent event) {
        // Có thể mark as deleted nếu cần
        // AggregateLifecycle.markDeleted(); // xóa aggregate khỏi memory
    }
}
```

---

## Quy tắc vàng của Aggregate

### ❌ SAI — Set state trong CommandHandler

```java
@CommandHandler
public void handle(UpdateCustomerCommand command) {
    // WRONG! Không set state trực tiếp trong CommandHandler
    this.name = command.getName();  // ❌
    this.email = command.getEmail(); // ❌
}
```

### ✅ ĐÚNG — Apply event, set state trong EventSourcingHandler

```java
@CommandHandler
public void handle(UpdateCustomerCommand command) {
    // CORRECT: Chỉ apply event
    apply(new CustomerUpdatedEvent(...)); // ✅
}

@EventSourcingHandler
public void on(CustomerUpdatedEvent event) {
    // CORRECT: Set state chỉ ở đây
    this.name = event.getName(); // ✅
}
```

**Tại sao?** Khi replay events từ Event Store, Axon chỉ gọi `@EventSourcingHandler`, không gọi `@CommandHandler`. Nếu bạn set state trong CommandHandler, state sẽ bị mất khi replay.

---

## Luồng đầy đủ khi CommandHandler xử lý Command

```
1. Client gửi CreateCustomerCommand
2. Axon tạo Aggregate instance mới
3. @CommandHandler constructor được gọi
4. Validation thực hiện
5. apply(CustomerCreatedEvent) được gọi
6. Axon gọi @EventSourcingHandler on(CustomerCreatedEvent)
   → State của Aggregate được cập nhật
7. Axon lưu CustomerCreatedEvent vào Event Store
8. Axon publish CustomerCreatedEvent lên Event Bus
9. Projection @EventHandler nhận event → cập nhật Read DB
```

---

## Aggregate với Snapshot (nâng cao)

Khi số lượng events nhiều (1000+), replay toàn bộ events mỗi lần tốn thời gian. **Snapshot** giải quyết vấn đề này.

```java
// Trong Spring Boot main class
@Bean
public SnapshotTriggerDefinition customerSnapshotTrigger(Snapshotter snapshotter) {
    // Tạo snapshot sau mỗi 50 events
    return new EventCountSnapshotTriggerDefinition(snapshotter, 50);
}
```

```java
// Gắn snapshot trigger vào Aggregate
@Aggregate(snapshotTriggerDefinition = "customerSnapshotTrigger")
public class CustomerAggregate {
    // ...
}
```

**Cách hoạt động:**
```
Events 1-50  → Snapshot A (state sau 50 events)
Events 51-100 → Snapshot B (state sau 100 events)

Khi cần rebuild state tại event 98:
  Không replay events 1-50 (covered by Snapshot A)
  Chỉ replay: Snapshot A → events 51-98
```

---

## Validation với MessageDispatchInterceptor

Đôi khi bạn muốn validate trước khi command đến Aggregate (ví dụ: kiểm tra trùng lặp trong DB).

```java
@Component
@RequiredArgsConstructor
public class CreateCustomerCommandInterceptor implements MessageDispatchInterceptor<CommandMessage<?>> {
    
    private final CustomerRepository customerRepository;
    
    @Override
    public BiFunction<Integer, CommandMessage<?>, CommandMessage<?>> handle(
            List<? extends CommandMessage<?>> messages) {
        return (index, command) -> {
            if (command.getPayload() instanceof CreateCustomerCommand createCmd) {
                // Kiểm tra duplicate trong read database
                if (customerRepository.existsByMobileNumber(createCmd.getMobileNumber())) {
                    throw new CustomerAlreadyExistsException(
                        "Customer with mobile " + createCmd.getMobileNumber() + " already exists"
                    );
                }
            }
            return command;
        };
    }
}
```

```java
// Đăng ký interceptor khi startup
@Component
@RequiredArgsConstructor
public class CustomerServiceConfig {
    
    private final CommandBus commandBus;
    private final CreateCustomerCommandInterceptor commandInterceptor;
    
    @PostConstruct
    public void registerInterceptor() {
        commandBus.registerDispatchInterceptor(commandInterceptor);
    }
}
```

---

## Đọc data từ Event Store

Axon cung cấp `EventStore` để đọc trực tiếp events:

```java
@RestController
@RequiredArgsConstructor
public class CustomerEventController {
    
    private final EventStore eventStore;
    
    @GetMapping("/api/customers/{customerId}/events")
    public List<Object> getCustomerEvents(@PathVariable String customerId) {
        return eventStore.readEvents(customerId)
            .asStream()
            .map(DomainEventMessage::getPayload)
            .collect(Collectors.toList());
    }
}
```

Trả về toàn bộ history của một customer — hữu ích cho audit, debugging.

---

## Tóm tắt Aggregate rules

| Quy tắc | Giải thích |
|---|---|
| `@Aggregate` | Annotation bắt buộc |
| `@AggregateIdentifier` | Phải có, unique per entity |
| Constructor mặc định | Phải có (Axon dùng khi deserialize) |
| `@CommandHandler` | Xử lý command, KHÔNG set state |
| `apply(event)` | Publish event, gọi từ CommandHandler |
| `@EventSourcingHandler` | Chỉ nơi DUY NHẤT được phép set state |
| Không gọi DB trong `@EventSourcingHandler` | Event được replay — side effects sẽ bị duplicate |

**Tiếp theo:** Projection — Read Side →

# Bài 2: Commands, Events và Queries — Building Blocks của CQRS

## Tổng quan ba loại message

Trong Axon Framework, tất cả giao tiếp được thực hiện qua **messages**:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  COMMAND    │    │   EVENT     │    │   QUERY     │
│             │    │             │    │             │
│ Intent to   │    │ Fact that   │    │ Request for │
│ change      │    │ happened    │    │ data        │
│             │    │             │    │             │
│ Present     │    │ Past        │    │ Present     │
│ tense       │    │ tense       │    │ tense       │
└─────────────┘    └─────────────┘    └─────────────┘
      │                   │                  │
      ▼                   ▼                  ▼
 @CommandHandler    @EventHandler      @QueryHandler
   (Aggregate)      (Projection)       (QueryService)
```

---

## Commands

### Đặc điểm
- Biểu thị **ý định thay đổi** state
- **Dùng thì hiện tại**: `CreateCustomer`, `UpdateAccount`, `DeleteCard`
- Có thể bị **từ chối** (validation fail → exception)
- Mỗi command chỉ có **một handler** (Command is dispatched to exactly one handler)

### Cách tạo Command class

```java
// Command class — đặt trong package command
@Data
@Builder
public class CreateCustomerCommand {
    
    @TargetAggregateIdentifier  // QUAN TRỌNG: phải có field này
    private final String customerId;
    
    private final String name;
    private final String email;
    private final String mobileNumber;
}
```

**`@TargetAggregateIdentifier`**: annotation bắt buộc. Nó cho Axon biết command này thuộc về Aggregate instance nào. Axon dùng giá trị này để route command đến đúng Aggregate.

### Các command khác

```java
@Data
@Builder
public class UpdateCustomerCommand {
    @TargetAggregateIdentifier
    private final String customerId;
    private final String name;
    private final String email;
    private final String mobileNumber;
}

@Data
@Builder
public class DeleteCustomerCommand {
    @TargetAggregateIdentifier
    private final String customerId;
}
```

---

## Events

### Đặc điểm
- Biểu thị **điều đã xảy ra** — immutable fact
- **Dùng thì quá khứ**: `CustomerCreated`, `AccountUpdated`, `CardDeleted`
- **Không thể bị từ chối** — event là sự thật đã xảy ra
- Có thể có **nhiều handlers** (fan-out — nhiều component lắng nghe cùng 1 event)

### Cách tạo Event class

```java
// Event class — đặt trong package event
@Data
@Builder
public class CustomerCreatedEvent {
    private final String customerId;
    private final String name;
    private final String email;
    private final String mobileNumber;
}

@Data
@Builder
public class CustomerUpdatedEvent {
    private final String customerId;
    private final String name;
    private final String email;
    private final String mobileNumber;
}

@Data
@Builder
public class CustomerDeletedEvent {
    private final String customerId;
}
```

**Lưu ý về naming convention:**
```
Command: CreateCustomer (verb + noun, present)
Event:   CustomerCreated (noun + verb past participle)
```

---

## Queries

### Đặc điểm
- Biểu thị **yêu cầu đọc data**
- Không thay đổi state
- Mỗi query có một handler (hoặc multiple handlers với scatter-gather)

### Cách tạo Query class

```java
// Query class — đặt trong package query
@Data
@AllArgsConstructor
public class FindCustomerQuery {
    private final String customerId;
}

@Data
@AllArgsConstructor
public class FindAllCustomersQuery {
    // không cần field nếu query tất cả
}
```

---

## Gửi Commands từ Controller

```java
@RestController
@RequestMapping("/api/customers")
@RequiredArgsConstructor
public class CustomerCommandController {
    
    private final CommandGateway commandGateway;
    
    @PostMapping
    public ResponseEntity<String> createCustomer(@RequestBody @Valid CustomerDto dto) {
        String customerId = UUID.randomUUID().toString();
        
        CreateCustomerCommand command = CreateCustomerCommand.builder()
            .customerId(customerId)
            .name(dto.getName())
            .email(dto.getEmail())
            .mobileNumber(dto.getMobileNumber())
            .build();
        
        // sendAndWait: gửi command và chờ kết quả (blocking)
        commandGateway.sendAndWait(command);
        
        return ResponseEntity.status(HttpStatus.CREATED).body(customerId);
    }
    
    @PutMapping("/{customerId}")
    public ResponseEntity<String> updateCustomer(
            @PathVariable String customerId,
            @RequestBody @Valid CustomerDto dto) {
        
        UpdateCustomerCommand command = UpdateCustomerCommand.builder()
            .customerId(customerId)
            .name(dto.getName())
            .email(dto.getEmail())
            .mobileNumber(dto.getMobileNumber())
            .build();
        
        commandGateway.sendAndWait(command);
        return ResponseEntity.ok("Customer updated successfully");
    }
    
    @DeleteMapping("/{customerId}")
    public ResponseEntity<String> deleteCustomer(@PathVariable String customerId) {
        commandGateway.sendAndWait(new DeleteCustomerCommand(customerId));
        return ResponseEntity.ok("Customer deleted successfully");
    }
}
```

### CommandGateway methods

| Method | Mô tả |
|---|---|
| `sendAndWait(command)` | Blocking — chờ đến khi command xử lý xong |
| `send(command)` | Non-blocking — trả về `CompletableFuture` |
| `sendAndWait(command, timeout, unit)` | Blocking với timeout |

---

## Gửi Queries từ Controller

```java
@RestController
@RequestMapping("/api/customers")
@RequiredArgsConstructor
public class CustomerQueryController {
    
    private final QueryGateway queryGateway;
    
    @GetMapping("/{customerId}")
    public ResponseEntity<CustomerViewDto> getCustomer(@PathVariable String customerId) {
        FindCustomerQuery query = new FindCustomerQuery(customerId);
        
        // query trả về CompletableFuture, dùng join() để chờ
        CustomerViewDto result = queryGateway
            .query(query, ResponseTypes.instanceOf(CustomerViewDto.class))
            .join();
        
        return ResponseEntity.ok(result);
    }
    
    @GetMapping
    public ResponseEntity<List<CustomerViewDto>> getAllCustomers() {
        FindAllCustomersQuery query = new FindAllCustomersQuery();
        
        List<CustomerViewDto> results = queryGateway
            .query(query, ResponseTypes.multipleInstancesOf(CustomerViewDto.class))
            .join();
        
        return ResponseEntity.ok(results);
    }
}
```

---

## Cấu trúc package khuyến nghị

```
src/main/java/com/example/customer/
├── command/
│   ├── CreateCustomerCommand.java
│   ├── UpdateCustomerCommand.java
│   └── DeleteCustomerCommand.java
├── event/
│   ├── CustomerCreatedEvent.java
│   ├── CustomerUpdatedEvent.java
│   └── CustomerDeletedEvent.java
├── query/
│   ├── FindCustomerQuery.java
│   └── FindAllCustomersQuery.java
├── aggregate/
│   └── CustomerAggregate.java          ← Write side
├── projection/
│   └── CustomerProjection.java         ← Read side
├── controller/
│   ├── CustomerCommandController.java
│   └── CustomerQueryController.java
└── dto/
    └── CustomerDto.java
```

---

## Tóm tắt mối quan hệ

```
Controller
    │ commandGateway.sendAndWait(CreateCustomerCommand)
    ▼
Axon Server (route đến đúng Aggregate instance)
    │
    ▼
CustomerAggregate.@CommandHandler handle(CreateCustomerCommand)
    │ apply(CustomerCreatedEvent)
    ▼
CustomerAggregate.@EventSourcingHandler on(CustomerCreatedEvent)
    │ (cập nhật state của Aggregate)
    │
    └──► Axon Server lưu Event vào Event Store
         │
         └──► CustomerProjection.@EventHandler on(CustomerCreatedEvent)
                   │ (cập nhật Read Database)
```

**Tiếp theo:** Aggregate — trái tim của Write Side →

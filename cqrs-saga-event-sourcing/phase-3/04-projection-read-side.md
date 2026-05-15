# Bài 4: Projection — Read Side của CQRS

## Projection là gì?

Projection là component phía **Read Side** của CQRS. Nó:
1. Lắng nghe Events từ Event Bus (`@EventHandler`)
2. Cập nhật **Read Database** với data đã được tối ưu cho queries
3. Xử lý Queries từ client (`@QueryHandler`)

Projection đảm bảo Read Database luôn được đồng bộ với Write Database thông qua events.

---

## Cấu trúc Projection class

```java
@Component
@ProcessingGroup("customer")  // Nhóm processor — cùng nhóm xử lý tuần tự
@RequiredArgsConstructor
@Slf4j
public class CustomerProjection {

    private final CustomerRepository customerRepository;  // JPA Repository cho Read DB
    
    
    // ===== EVENT HANDLERS =====
    // Cập nhật Read Database khi events xảy ra
    
    @EventHandler
    public void on(CustomerCreatedEvent event) {
        log.info("CustomerCreatedEvent received: {}", event.getCustomerId());
        
        // Tạo entity cho Read Database
        Customer customer = new Customer();
        customer.setCustomerId(event.getCustomerId());
        customer.setName(event.getName());
        customer.setEmail(event.getEmail());
        customer.setMobileNumber(event.getMobileNumber());
        customer.setActiveSw(true);
        
        customerRepository.save(customer);
    }
    
    @EventHandler
    public void on(CustomerUpdatedEvent event) {
        Customer customer = customerRepository.findById(event.getCustomerId())
            .orElseThrow(() -> new CustomerNotFoundException(event.getCustomerId()));
        
        customer.setName(event.getName());
        customer.setEmail(event.getEmail());
        customer.setMobileNumber(event.getMobileNumber());
        
        customerRepository.save(customer);
    }
    
    @EventHandler
    public void on(CustomerDeletedEvent event) {
        Customer customer = customerRepository.findById(event.getCustomerId())
            .orElseThrow(() -> new CustomerNotFoundException(event.getCustomerId()));
        
        customer.setActiveSw(false);  // Soft delete
        customerRepository.save(customer);
    }
    
    
    // ===== QUERY HANDLERS =====
    // Phục vụ queries từ client, đọc từ Read Database
    
    @QueryHandler
    public CustomerDto handle(FindCustomerQuery query) {
        Customer customer = customerRepository.findByCustomerIdAndActiveSw(
            query.getCustomerId(), true)
            .orElseThrow(() -> new CustomerNotFoundException(query.getCustomerId()));
        
        return mapToDto(customer);
    }
    
    @QueryHandler
    public List<CustomerDto> handle(FindAllCustomersQuery query) {
        return customerRepository.findByActiveSw(true).stream()
            .map(this::mapToDto)
            .collect(Collectors.toList());
    }
    
    private CustomerDto mapToDto(Customer customer) {
        CustomerDto dto = new CustomerDto();
        dto.setCustomerId(customer.getCustomerId());
        dto.setName(customer.getName());
        dto.setEmail(customer.getEmail());
        dto.setMobileNumber(customer.getMobileNumber());
        return dto;
    }
}
```

---

## Read Database Entity

```java
@Entity
@Table(name = "customers")
@Data
public class Customer {
    
    @Id
    private String customerId;
    
    private String name;
    private String email;
    private String mobileNumber;
    private Boolean activeSw;
    
    // Thêm các field cần thiết cho queries
    // Có thể denormalize data từ nhiều sources để tối ưu read
}
```

---

## Event Processors

Axon Framework xử lý events qua **Event Processors**. Có 2 loại:

### 1. Subscribing Event Processor (mặc định)
- Xử lý events **synchronously** trong cùng thread với publisher
- Đơn giản, nhưng nếu EventHandler bị lỗi → command cũng bị lỗi

```yaml
axon:
  eventhandling:
    processors:
      customer:                    # tên processor = @ProcessingGroup
        mode: subscribing          # mặc định
```

### 2. Tracking Event Processor
- Xử lý events **asynchronously** trong thread riêng
- Có token store (lưu vị trí đã xử lý trong event stream)
- Nếu service restart → tiếp tục từ vị trí đã dừng
- **Khuyến nghị cho production**

```yaml
axon:
  eventhandling:
    processors:
      customer:
        mode: tracking             # async processing
        thread-count: 2            # số thread
        batch-size: 100            # số events xử lý một lần
```

### So sánh

| Aspect | Subscribing | Tracking |
|---|---|---|
| Thread | Cùng thread với publisher | Thread riêng |
| Error handling | Lỗi lan đến Command | Isolated |
| Restart recovery | Không tự động | Từ token đã lưu |
| Production | ⚠️ Cẩn thận | ✅ Khuyến nghị |
| Setup | Đơn giản | Cần Token Store |

### Token Store cho Tracking Processor

```java
@Bean
public TokenStore tokenStore(EntityManagerFactory entityManagerFactory) {
    return JpaTokenStore.builder()
        .entityManagerProvider(new SimpleEntityManagerProvider(entityManagerFactory))
        .serializer(XStreamSerializer.defaultSerializer())
        .build();
}
```

---

## Replay Events

Một trong những feature mạnh nhất: **replay tất cả events** để rebuild Read Database.

**Khi nào cần replay?**
- Bug trong EventHandler → dữ liệu Read DB sai
- Thêm Projection mới cần build từ đầu
- Schema migration cho Read DB

**Cách trigger replay:**

```java
// Lấy processor theo tên và reset token về đầu
eventProcessingConfiguration
    .eventProcessor("customer", TrackingEventProcessor.class)
    .ifPresent(processor -> {
        processor.shutDown();
        processor.resetTokens();  // reset về event đầu tiên
        processor.start();
    });
```

Hoặc qua REST endpoint:

```java
@RestController
@RequestMapping("/admin")
@RequiredArgsConstructor
public class EventReplayController {
    
    private final EventProcessingConfiguration eventProcessingConfiguration;
    
    @PostMapping("/replay/{processorName}")
    public ResponseEntity<String> replay(@PathVariable String processorName) {
        eventProcessingConfiguration
            .eventProcessor(processorName, TrackingEventProcessor.class)
            .ifPresent(processor -> {
                processor.shutDown();
                processor.resetTokens();
                processor.start();
            });
        return ResponseEntity.ok("Replay started for: " + processorName);
    }
}
```

---

## Idempotency trong EventHandler

Events có thể được deliver nhiều lần (at-least-once delivery). EventHandler phải **idempotent**:

```java
@EventHandler
public void on(CustomerCreatedEvent event) {
    // Kiểm tra trước khi insert
    if (customerRepository.existsById(event.getCustomerId())) {
        log.warn("Customer {} already exists, skipping duplicate event", 
                 event.getCustomerId());
        return;  // Skip duplicate
    }
    
    // Proceed with creating
    Customer customer = new Customer();
    // ...
    customerRepository.save(customer);
}
```

---

## Các cách implement CQRS khác nhau

Transcript đề cập đến nhiều approaches:

### Approach 1: Axon Framework (cách học trong khóa này)
- Axon Framework + Axon Server
- Event Store built-in
- Annotations-based
- Best for: teams mới với CQRS/ES

### Approach 2: Tự build với Kafka
- Commands → REST API → Service → publish to Kafka
- Read side → Kafka consumer → update Read DB
- Event Store → tự implement với database
- Best for: teams đã có Kafka expertise

### Approach 3: Spring + Database
- Write DB: normal relational DB (lưu events thủ công)
- Event publish: Transactional Outbox Pattern
- Read DB: separate database
- Best for: simple CQRS, không cần full Event Sourcing

---

## Tóm tắt: Write Side vs Read Side

```
              WRITE SIDE                          READ SIDE
┌─────────────────────────────┐    ┌─────────────────────────────┐
│                             │    │                             │
│  Command → Aggregate        │    │  EventHandler → Repository  │
│  @CommandHandler            │    │  @EventHandler              │
│  AggregateLifecycle.apply() │    │                             │
│  @EventSourcingHandler      │    │  Query → QueryHandler       │
│                             │    │  @QueryHandler              │
│  Event Store (Axon Server)  │    │  Read Database (JPA/H2)     │
│                             │    │                             │
└─────────────────────────────┘    └─────────────────────────────┘
         │ Events published                ▲
         └────────────────────────────────►│
```

**Tiếp theo (Phase 4):** Materialized View Pattern →

# Bài 1: Materialized View Pattern

## Vấn đề cần giải quyết

Khi đã implement CQRS với Event Sourcing cho từng microservice riêng lẻ, bạn vẫn có thể gặp vấn đề: **làm sao đọc data tổng hợp từ nhiều microservices một cách hiệu quả?**

Ví dụ: Bank profile page cần dữ liệu từ Customer, Accounts, Loans, Cards.

- **API Composition** (Phase 1): gọi 4 services tại runtime → latency cao, phụ thuộc availability
- **Materialized View Pattern**: pre-compute và lưu sẵn view tổng hợp → đọc cực nhanh

---

## Materialized View Pattern là gì?

Một **Materialized View** là một bảng/document trong database lưu trữ **kết quả đã được pre-computed** từ nhiều nguồn data khác nhau.

```
Thay vì:
Client → Query → [join 4 services tại runtime] → Response

Với Materialized View:
                   ┌──────────────────────────┐
Customer events ──►│                          │
Account events  ──►│  Materialized View       │
Loan events     ──►│  Projection              │◄── Client query
Card events     ──►│  (pre-computed, indexed) │    (single DB query!)
                   └──────────────────────────┘
```

---

## Kiến trúc

```
┌─────────────┐  events  ┌─────────────────────────────────┐
│  Customer   ├──────────►                                 │
│  Service    │          │  Customer Summary               │
│  (Write DB) │          │  Projection Service             │
├─────────────┤          │                                 │
│  Account    ├──────────►  @EventHandler methods          │
│  Service    │          │       ↓                         │
│  (Write DB) │          │  Materialized View DB           │
├─────────────┤          │  ┌────────────────────────────┐ │
│  Loan       ├──────────►  │ customer_summary table:    │ │
│  Service    │          │  │  - customerId              │ │
│  (Write DB) │          │  │  - name, email             │ │
├─────────────┤          │  │  - account_balance         │ │
│  Card       ├──────────►  │  - loan_summary            │ │
│  Service    │          │  │  - card_summary            │ │
│  (Write DB) │          │  └────────────────────────────┘ │
└─────────────┘          └────────────────────┬────────────┘
                                              │
                                Client ───────┘
                                (1 fast query!)
```

---

## Khi nào cần Materialized View?

Materialized View Pattern đặc biệt hữu ích khi:

1. **Data từ nhiều microservices** cần được hiển thị cùng nhau
2. **Read operations nhiều hơn write** (thường là 80% read, 20% write)
3. **Query performance quan trọng** — không thể chấp nhận latency của multiple API calls
4. **Complex aggregations** — tính toán tổng, trung bình, grouping phức tạp

---

## Implementation với Axon Framework

### 1. Tạo Materialized View entity

```java
@Entity
@Table(name = "customer_summary")
@Data
public class CustomerSummary {
    
    @Id
    private String customerId;
    
    // Từ Customer Service
    private String name;
    private String email;
    private String mobileNumber;
    
    // Từ Account Service
    private String accountNumber;
    private String accountType;
    private BigDecimal accountBalance;
    
    // Từ Loan Service
    private BigDecimal totalLoan;
    private BigDecimal loanOutstanding;
    
    // Từ Card Service
    private String cardNumber;
    private BigDecimal cardLimit;
    private BigDecimal cardOutstanding;
    
    private LocalDateTime lastUpdated;
}
```

### 2. Tạo Projection lắng nghe events từ nhiều services

```java
@Component
@ProcessingGroup("customer-summary")
@RequiredArgsConstructor
@Slf4j
public class CustomerSummaryProjection {
    
    private final CustomerSummaryRepository summaryRepository;
    
    // ---- Customer events ----
    
    @EventHandler
    public void on(CustomerCreatedEvent event) {
        CustomerSummary summary = new CustomerSummary();
        summary.setCustomerId(event.getCustomerId());
        summary.setName(event.getName());
        summary.setEmail(event.getEmail());
        summary.setMobileNumber(event.getMobileNumber());
        summary.setLastUpdated(LocalDateTime.now());
        summaryRepository.save(summary);
    }
    
    @EventHandler
    public void on(CustomerUpdatedEvent event) {
        CustomerSummary summary = findSummary(event.getCustomerId());
        summary.setName(event.getName());
        summary.setEmail(event.getEmail());
        summaryRepository.save(summary);
    }
    
    // ---- Account events ----
    
    @EventHandler
    public void on(AccountCreatedEvent event) {
        // Account được tạo cho customer nào? Cần customerId trong event!
        CustomerSummary summary = findByMobileNumber(event.getMobileNumber());
        summary.setAccountNumber(event.getAccountNumber());
        summary.setAccountType(event.getAccountType());
        summary.setAccountBalance(event.getBalance());
        summaryRepository.save(summary);
    }
    
    @EventHandler
    public void on(AccountBalanceUpdatedEvent event) {
        CustomerSummary summary = findByAccountNumber(event.getAccountNumber());
        summary.setAccountBalance(event.getNewBalance());
        summaryRepository.save(summary);
    }
    
    // ---- Loan events ----
    
    @EventHandler
    public void on(LoanCreatedEvent event) {
        CustomerSummary summary = findByMobileNumber(event.getMobileNumber());
        summary.setTotalLoan(event.getLoanAmount());
        summary.setLoanOutstanding(event.getOutstandingAmount());
        summaryRepository.save(summary);
    }
    
    // ---- Card events ----
    
    @EventHandler
    public void on(CardCreatedEvent event) {
        CustomerSummary summary = findByMobileNumber(event.getMobileNumber());
        summary.setCardNumber(event.getCardNumber());
        summary.setCardLimit(event.getCardLimit());
        summaryRepository.save(summary);
    }
    
    // ---- Query Handler ----
    
    @QueryHandler
    public CustomerSummaryDto handle(FindCustomerSummaryQuery query) {
        CustomerSummary summary = summaryRepository
            .findByMobileNumber(query.getMobileNumber())
            .orElseThrow(() -> new ResourceNotFoundException("Customer", query.getMobileNumber()));
        
        return mapToDto(summary);
    }
    
    // Helper methods
    private CustomerSummary findSummary(String customerId) {
        return summaryRepository.findById(customerId)
            .orElseThrow(() -> new ResourceNotFoundException("CustomerSummary", customerId));
    }
    
    // ... other helpers
}
```

### 3. Query Controller

```java
@RestController
@RequestMapping("/api/summary")
@RequiredArgsConstructor
public class CustomerSummaryController {
    
    private final QueryGateway queryGateway;
    
    @GetMapping
    public ResponseEntity<CustomerSummaryDto> getCustomerSummary(
            @RequestParam String mobileNumber) {
        
        CustomerSummaryDto result = queryGateway
            .query(new FindCustomerSummaryQuery(mobileNumber),
                   ResponseTypes.instanceOf(CustomerSummaryDto.class))
            .join();
        
        return ResponseEntity.ok(result);
    }
}
```

---

## Thách thức: Event ordering và Cross-service coordination

### Vấn đề ordering

Events từ các services khác nhau có thể arrive theo thứ tự không đoán trước:

```
Timeline thực tế:
T=1: CustomerCreated (customer-service)
T=2: AccountCreated (account-service) ← nhưng CustomerSummary chưa có!
T=3: CardCreated (card-service)
```

**Giải pháp:** Tạo CustomerSummary skeleton ngay khi CustomerCreated, sau đó enrich dần:

```java
@EventHandler
public void on(CustomerCreatedEvent event) {
    // Tạo summary với chỉ customer data
    CustomerSummary summary = new CustomerSummary();
    summary.setCustomerId(event.getCustomerId());
    // ... set customer fields
    summaryRepository.save(summary);
    // Account, Loan, Card sẽ update sau khi nhận events tương ứng
}
```

### Vấn đề liên kết (cross-service identity)

Làm sao Account Service biết account này thuộc customer nào?

**Giải pháp:** Dùng `mobileNumber` làm common identifier (như trong project mẫu của course), hoặc tốt hơn là truyền `customerId` trong account creation request.

---

## Lợi ích so với API Composition

| Tiêu chí | API Composition | Materialized View |
|---|---|---|
| Read latency | Cao (4 API calls) | Thấp (1 DB query) |
| Write complexity | Thấp | Cao (phải sync) |
| Service dependency | 4 services online | Không phụ thuộc |
| Data freshness | Real-time | Eventually consistent |
| Phù hợp | Nhỏ, đơn giản | Enterprise, high-traffic |

---

## Transactional Outbox Pattern

Một thách thức khác: **đảm bảo event được publish kể cả khi service crash**.

### Vấn đề

```
1. Service lưu data vào DB ✅
2. Service chuẩn bị publish event lên Kafka...
3. Service CRASH! ❌
→ Data đã lưu nhưng event KHÔNG được publish
→ Materialized View không được update
```

### Giải pháp: Transactional Outbox

```
┌────────────────────────────────────────────┐
│  Service (single transaction)              │
│                                            │
│  1. Save data to main table        ─────► DB.main_table    │
│  2. Save event to outbox table     ─────► DB.outbox_table  │
│  (BOTH in same transaction)                │
└────────────────────────────────────────────┘
                │
                │ Message Relay process (separate)
                ▼
        Reads outbox_table
                │
                ▼
        Publish to Kafka/RabbitMQ
                │
                ▼
        Mark outbox record as published
```

**Tại sao an toàn?**
- Data và event được lưu trong **cùng 1 database transaction**
- Nếu service crash: transaction rollback → cả data và event đều rollback
- Message Relay chạy riêng: đọc outbox → publish → đánh dấu đã gửi
- Nếu Message Relay crash: sẽ retry lại từ outbox chưa được đánh dấu

### Implementation đơn giản với Axon

Axon Server tự động đảm bảo reliable event delivery khi dùng Axon Server làm Event Store. Không cần implement Outbox thủ công.

Với Kafka: Cần implement Outbox manually hoặc dùng Debezium (CDC - Change Data Capture).

---

> **Khi nào dùng Materialized View?** Khi có nhiều microservices cần query cùng lúc, API Composition quá chậm, và team đã sẵn sàng quản lý eventual consistency.

**Tiếp theo (Phase 5):** Choreography Saga Pattern →

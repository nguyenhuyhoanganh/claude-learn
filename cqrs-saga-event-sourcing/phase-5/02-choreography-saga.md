# Bài 2: Choreography Saga Pattern

## Nguyên lý Choreography

Trong Choreography Saga, **không có central coordinator**. Mỗi service:
1. Lắng nghe events từ service trước
2. Thực hiện local transaction
3. Publish event để trigger service tiếp theo

Giống như vũ điệu ballet: mỗi vũ công (service) biết bước tiếp theo của mình dựa vào nhịp nhạc (events), không cần đạo diễn ra hiệu.

---

## Kiến trúc Choreography Saga

```
                    EVENT BUS (Kafka/RabbitMQ/Axon)
                           │
Client ──► Customer Service ──────────────────────────────────►
    Request                │ CustomerMobileNumUpdatedEvent     │
                           │                                   │
                           ├──────────────────────────────────►│
                           │                              Account Service
                           │                                   │ AccountMobileNumUpdatedEvent
                           │                                   │
                           │                              Card Service
                           │                                   │ CardMobileNumUpdatedEvent
                           │                                   │
                           │                              Loan Service
                           │                              (Last step)
```

**Flow happy path:**
```
CustomerMobileUpdated → Account listens → AccountMobileUpdated
                     → Card listens    → CardMobileUpdated
                     → Loan listens    → LoanMobileUpdated (END)
```

**Flow với compensation:**
```
CustomerMobileUpdated → AccountMobileUpdated → CardMobileUpdated
                                              → LOAN FAILS!
                                              → CardRollbackEvent
                                         → AccountRollbackEvent
                                    → CustomerRollbackEvent
```

---

## Implementation với Spring + Kafka

### Bước 1: Events và Commands

```java
// Event: Customer đã update mobile number
@Data
@Builder
public class CustomerMobileNumberUpdatedEvent {
    private String customerId;
    private String mobileNumber;      // old mobile number
    private String newMobileNumber;   // new mobile number
}

// Event: Account đã update mobile number
@Data
@Builder
public class AccountMobileNumberUpdatedEvent {
    private String accountNumber;
    private String mobileNumber;
    private String newMobileNumber;
}

// Compensation event: rollback card
@Data
@Builder
public class CardMobileNumberRollbackEvent {
    private String cardNumber;
    private String mobileNumber;      // phải rollback về cái này
    private String newMobileNumber;
    private String errorMessage;
}
```

### Bước 2: Customer Service — khởi đầu Saga

```java
@RestController
@RequestMapping("/api/customers")
@RequiredArgsConstructor
public class CustomerCommandController {
    
    private final CustomerService customerService;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    @PatchMapping("/mobile-number")
    public ResponseEntity<String> updateMobileNumber(
            @RequestBody MobileNumberUpdateRequest request) {
        
        // 1. Update local customer DB
        customerService.updateMobileNumber(request.getOldMobile(), request.getNewMobile());
        
        // 2. Publish event để trigger Account Service
        CustomerMobileNumberUpdatedEvent event = CustomerMobileNumberUpdatedEvent.builder()
            .customerId(request.getCustomerId())
            .mobileNumber(request.getOldMobile())
            .newMobileNumber(request.getNewMobile())
            .build();
        
        kafkaTemplate.send("customer-mobile-updated", event);
        
        return ResponseEntity.ok("Mobile number update initiated");
    }
}
```

### Bước 3: Account Service — lắng nghe và forward

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class AccountSagaEventHandler {
    
    private final AccountService accountService;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    // Lắng nghe event từ Customer Service
    @KafkaListener(topics = "customer-mobile-updated", groupId = "account-service")
    public void handleCustomerMobileUpdated(CustomerMobileNumberUpdatedEvent event) {
        try {
            // Update Account DB
            accountService.updateMobileNumber(event.getMobileNumber(), event.getNewMobileNumber());
            
            // Publish event để trigger Card Service
            AccountMobileNumberUpdatedEvent accountEvent = AccountMobileNumberUpdatedEvent.builder()
                .accountNumber(accountService.findAccountByMobile(event.getMobileNumber()).getAccountNumber())
                .mobileNumber(event.getMobileNumber())
                .newMobileNumber(event.getNewMobileNumber())
                .build();
            
            kafkaTemplate.send("account-mobile-updated", accountEvent);
            
        } catch (Exception e) {
            log.error("Failed to update account mobile number", e);
            
            // Publish rollback event — trigger Customer rollback
            CustomerMobileNumberRollbackEvent rollback = CustomerMobileNumberRollbackEvent.builder()
                .customerId(event.getCustomerId())
                .mobileNumber(event.getMobileNumber())
                .newMobileNumber(event.getNewMobileNumber())
                .errorMessage(e.getMessage())
                .build();
            
            kafkaTemplate.send("customer-mobile-rollback", rollback);
        }
    }
    
    // Lắng nghe rollback event từ Card Service
    @KafkaListener(topics = "account-mobile-rollback", groupId = "account-service")
    public void handleAccountMobileRollback(AccountMobileNumberRollbackEvent event) {
        // Rollback account mobile number
        accountService.updateMobileNumber(event.getNewMobileNumber(), event.getMobileNumber());
        
        // Forward rollback lên Customer Service
        CustomerMobileNumberRollbackEvent customerRollback = /* ... */;
        kafkaTemplate.send("customer-mobile-rollback", customerRollback);
    }
}
```

### Bước 4: Card Service

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class CardSagaEventHandler {
    
    private final CardService cardService;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    
    @KafkaListener(topics = "account-mobile-updated", groupId = "card-service")
    public void handleAccountMobileUpdated(AccountMobileNumberUpdatedEvent event) {
        try {
            cardService.updateMobileNumber(event.getMobileNumber(), event.getNewMobileNumber());
            
            // Forward đến Loan Service
            CardMobileNumberUpdatedEvent cardEvent = /* ... */;
            kafkaTemplate.send("card-mobile-updated", cardEvent);
            
        } catch (Exception e) {
            // Rollback account
            AccountMobileNumberRollbackEvent rollback = /* ... */;
            kafkaTemplate.send("account-mobile-rollback", rollback);
        }
    }
}
```

---

## Choreography Saga với Axon Framework

Axon Framework đơn giản hóa Choreography Saga rất nhiều vì Event Bus đã được tích hợp sẵn.

Thay vì cần Kafka, bạn chỉ cần:

```java
// Customer Aggregate — khởi đầu
@CommandHandler
public void handle(UpdateMobileNumberCommand cmd) {
    apply(CustomerMobileNumberUpdatedEvent.builder()
        .customerId(cmd.getCustomerId())
        .mobileNumber(cmd.getMobileNumber())
        .newMobileNumber(cmd.getNewMobileNumber())
        .build());
}

// Account Projection — lắng nghe và forward
@EventHandler
public void on(CustomerMobileNumberUpdatedEvent event) {
    try {
        accountService.updateMobileNumber(event.getMobileNumber(), event.getNewMobileNumber());
        
        // Apply event mới
        // (cần inject CommandGateway và dispatch UpdateAccountMobileNumberCommand)
        commandGateway.sendAndWait(UpdateAccountMobileNumberCommand.builder()
            // ...
            .build());
            
    } catch (Exception e) {
        // Dispatch rollback command
        commandGateway.sendAndWait(RollbackCustomerMobileNumberCommand.builder()
            // ...
            .build());
    }
}
```

---

## Demo: Happy Path và Compensation

### Happy Path
```
Request: update mobile 123 → 456

Customer Service:  DB updated (mobileNumber=456)  ✅
Account Service:   DB updated (mobileNumber=456)  ✅
Card Service:      DB updated (mobileNumber=456)  ✅
Loan Service:      DB updated (mobileNumber=456)  ✅

Result: tất cả 4 services cùng có mobileNumber=456
```

### Failure Path (Loan Service fails)
```
Customer Service:  DB updated (mobileNumber=456)  ✅
Account Service:   DB updated (mobileNumber=456)  ✅
Card Service:      DB updated (mobileNumber=456)  ✅
Loan Service:      EXCEPTION ❌

Compensation chain:
CardRollbackEvent:       Card DB → mobileNumber=123  ✅
AccountRollbackEvent:    Account DB → mobileNumber=123 ✅
CustomerRollbackEvent:   Customer DB → mobileNumber=123 ✅

Result: tất cả 4 services rollback về mobileNumber=123
```

---

## Nhược điểm của Choreography

### 1. Khó theo dõi business flow
Không có nơi nào duy nhất mô tả toàn bộ Saga flow. Phải đọc code của từng service.

### 2. Tight coupling qua events
Services phụ thuộc vào event schema của nhau. Thay đổi event → phải update nhiều services.

### 3. Khó debug
Khi có lỗi, phải trace qua nhiều service logs để hiểu chuyện gì đã xảy ra.

### 4. Circular dependencies dễ xảy ra
Service A lắng nghe event của B, B lắng nghe event của C, C lắng nghe event của A → vòng lặp!

---

## Khi nào chọn Choreography?

✅ **Chọn Choreography khi:**
- Flow đơn giản, ít bước (2-3 services)
- Đội đã quen với event-driven architecture
- Cần absolute decoupling
- Không muốn introduce Saga Manager dependency

❌ **Không chọn khi:**
- Nhiều hơn 4-5 services
- Nhiều nhánh điều kiện trong flow
- Cần dễ debug và monitor
- Team mới với event-driven

**Tiếp theo (Phase 6):** Orchestration Saga — giải pháp cho flow phức tạp →

# Bài 1: Orchestration Saga Pattern

## Nguyên lý Orchestration

Trong Orchestration Saga, có một **Saga Manager** (Orchestrator) trung tâm điều phối toàn bộ flow. Tên "Orchestration" lấy cảm hứng từ nhạc trưởng chỉ huy dàn nhạc — orchestrator ra lệnh cho từng nhạc công (service) khi nào chơi, cái gì chơi.

```
                    ┌──────────────────┐
                    │   SAGA MANAGER   │
                    │  (Orchestrator)  │
                    │                  │
Client ──► Customer ─► @StartSaga     │
Service            │   │               │
                   │   ├──► accounts  ─┤─► success?
                   │   │               │   → tiếp tục
                   │   ├──► cards     ─┤─► fail?
                   │   │               │   → trigger rollback
                   │   └──► loans     ─┘
                   │
                   └── @EndSaga
```

---

## Orchestration Saga với Axon Framework

Axon Framework hỗ trợ Saga Manager qua annotation `@Saga`.

### Cấu trúc

```java
@Saga  // Đánh dấu đây là Saga Manager
@Slf4j
public class UpdateMobileNumberSaga {
    
    // Inject CommandGateway để dispatch commands
    // Dùng @Autowired vì Saga cần empty constructor
    @Autowired
    private transient CommandGateway commandGateway;
    // transient: không serialize field này khi Saga được persist
    
    
    // ============================================================
    // HAPPY PATH
    // ============================================================
    
    @StartSaga  // Đây là step đầu tiên của Saga
    @SagaEventHandler(associationProperty = "customerId")
    // associationProperty: dùng customerId để link các events của cùng 1 Saga instance
    public void handle(CustomerMobileNumberUpdatedEvent event) {
        log.info("Saga Step 1: CustomerMobileNumberUpdatedEvent for customerId={}", 
                 event.getCustomerId());
        
        // Dispatch command đến Account Service
        UpdateAccountMobileNumberCommand accountCmd = UpdateAccountMobileNumberCommand.builder()
            .accountNumber(event.getAccountNumber())
            .customerId(event.getCustomerId())
            .mobileNumber(event.getMobileNumber())
            .newMobileNumber(event.getNewMobileNumber())
            // ... other fields
            .build();
        
        commandGateway.send(accountCmd, new CommandCallback<>() {
            @Override
            public void onResult(CommandMessage<? extends UpdateAccountMobileNumberCommand> msg,
                                 CommandResultMessage<?> result) {
                if (result.isExceptional()) {
                    // Account Service failed → rollback Customer
                    log.error("Account update failed, initiating rollback");
                    commandGateway.sendAndWait(RollbackCustomerMobileNumberCommand.builder()
                        .customerId(event.getCustomerId())
                        .mobileNumber(event.getMobileNumber())
                        .newMobileNumber(event.getNewMobileNumber())
                        .errorMessage(result.exceptionResult().getMessage())
                        .build());
                }
            }
        });
    }
    
    @SagaEventHandler(associationProperty = "customerId")
    public void handle(AccountMobileNumberUpdatedEvent event) {
        log.info("Saga Step 2: AccountMobileNumberUpdatedEvent for account={}", 
                 event.getAccountNumber());
        
        // Dispatch command đến Card Service
        commandGateway.send(
            UpdateCardMobileNumberCommand.builder()
                .cardNumber(event.getCardNumber())
                .accountNumber(event.getAccountNumber())
                .customerId(event.getCustomerId())
                .mobileNumber(event.getMobileNumber())
                .newMobileNumber(event.getNewMobileNumber())
                .build(),
            new CommandCallback<>() {
                @Override
                public void onResult(CommandMessage<?> msg, CommandResultMessage<?> result) {
                    if (result.isExceptional()) {
                        // Card Service failed → rollback Account
                        commandGateway.sendAndWait(RollbackAccountMobileNumberCommand.builder()
                            .accountNumber(event.getAccountNumber())
                            .customerId(event.getCustomerId())
                            .mobileNumber(event.getMobileNumber())
                            .newMobileNumber(event.getNewMobileNumber())
                            .errorMessage(result.exceptionResult().getMessage())
                            .build());
                    }
                }
            }
        );
    }
    
    @SagaEventHandler(associationProperty = "customerId")
    public void handle(CardMobileNumberUpdatedEvent event) {
        log.info("Saga Step 3: CardMobileNumberUpdatedEvent for card={}", 
                 event.getCardNumber());
        
        // Dispatch command đến Loan Service (bước cuối)
        commandGateway.send(
            UpdateLoanMobileNumberCommand.builder()
                .loanNumber(event.getLoanNumber())
                .cardNumber(event.getCardNumber())
                .accountNumber(event.getAccountNumber())
                .customerId(event.getCustomerId())
                .mobileNumber(event.getMobileNumber())
                .newMobileNumber(event.getNewMobileNumber())
                .build(),
            new CommandCallback<>() {
                @Override
                public void onResult(CommandMessage<?> msg, CommandResultMessage<?> result) {
                    if (result.isExceptional()) {
                        // Loan Service failed → rollback Card
                        commandGateway.sendAndWait(RollbackCardMobileNumberCommand.builder()
                            .cardNumber(event.getCardNumber())
                            .accountNumber(event.getAccountNumber())
                            .customerId(event.getCustomerId())
                            .mobileNumber(event.getMobileNumber())
                            .newMobileNumber(event.getNewMobileNumber())
                            .errorMessage(result.exceptionResult().getMessage())
                            .build());
                    }
                }
            }
        );
    }
    
    @EndSaga  // Kết thúc Saga — happy path
    @SagaEventHandler(associationProperty = "customerId")
    public void handle(LoanMobileNumberUpdatedEvent event) {
        log.info("Saga COMPLETE: All services updated successfully for customerId={}", 
                 event.getCustomerId());
        // Emit success response (dùng với Subscription Query — xem bài sau)
    }
    
    
    // ============================================================
    // COMPENSATION CHAIN (rollback)
    // ============================================================
    
    @SagaEventHandler(associationProperty = "customerId")
    public void handle(CardMobileNumberRollbackEvent event) {
        log.info("Saga Compensation: CardRollback, triggering AccountRollback");
        
        commandGateway.sendAndWait(RollbackAccountMobileNumberCommand.builder()
            .accountNumber(event.getAccountNumber())
            .customerId(event.getCustomerId())
            .mobileNumber(event.getMobileNumber())
            .newMobileNumber(event.getNewMobileNumber())
            .errorMessage(event.getErrorMessage())
            .build());
    }
    
    @SagaEventHandler(associationProperty = "customerId")
    public void handle(AccountMobileNumberRollbackEvent event) {
        log.info("Saga Compensation: AccountRollback, triggering CustomerRollback");
        
        commandGateway.sendAndWait(RollbackCustomerMobileNumberCommand.builder()
            .customerId(event.getCustomerId())
            .mobileNumber(event.getMobileNumber())
            .newMobileNumber(event.getNewMobileNumber())
            .errorMessage(event.getErrorMessage())
            .build());
    }
    
    @EndSaga  // Kết thúc Saga — failure path
    @SagaEventHandler(associationProperty = "customerId")
    public void handle(CustomerMobileNumberRollbackEvent event) {
        log.info("Saga ROLLBACK COMPLETE: All services rolled back for customerId={}", 
                 event.getCustomerId());
        // Emit failure response (dùng với Subscription Query — xem bài sau)
    }
}
```

---

## Compensation Transactions trong Aggregate

Mỗi service cần handle cả command update VÀ command rollback:

```java
// Trong CustomerAggregate
@CommandHandler
public void handle(UpdateCustomerMobileNumberCommand cmd) {
    // Apply update event
    apply(CustomerMobileNumberUpdatedEvent.builder()
        .customerId(cmd.getCustomerId())
        .mobileNumber(cmd.getMobileNumber())
        .newMobileNumber(cmd.getNewMobileNumber())
        // ...
        .build());
}

@CommandHandler
public void handle(RollbackCustomerMobileNumberCommand cmd) {
    // Apply rollback event
    apply(CustomerMobileNumberRollbackEvent.builder()
        .customerId(cmd.getCustomerId())
        .mobileNumber(cmd.getMobileNumber())
        .newMobileNumber(cmd.getNewMobileNumber())
        .errorMessage(cmd.getErrorMessage())
        .build());
}

@EventSourcingHandler
public void on(CustomerMobileNumberUpdatedEvent event) {
    // Cập nhật state sang mobile mới
    this.mobileNumber = event.getNewMobileNumber();
}

@EventSourcingHandler
public void on(CustomerMobileNumberRollbackEvent event) {
    // Rollback về mobile cũ
    this.mobileNumber = event.getMobileNumber();  // old mobile
    this.errorMsg = event.getErrorMessage();
}
```

---

## @StartSaga và @EndSaga

```java
@StartSaga    // Tạo Saga instance mới
@SagaEventHandler(associationProperty = "customerId")
public void handle(CustomerMobileNumberUpdatedEvent event) { ... }


@EndSaga      // Kết thúc và cleanup Saga instance
@SagaEventHandler(associationProperty = "customerId")
public void handle(LoanMobileNumberUpdatedEvent event) { ... }  // happy path end

@EndSaga      // Saga cũng có thể kết thúc ở đây (failure path end)
@SagaEventHandler(associationProperty = "customerId")
public void handle(CustomerMobileNumberRollbackEvent event) { ... }  // failure end
```

**Luôn luôn có 2 `@EndSaga`:**
- Một cho happy path (khi tất cả steps thành công)
- Một cho failure path (khi rollback hoàn tất)

---

## associationProperty — Liên kết events với Saga instance

```java
@SagaEventHandler(associationProperty = "customerId")
```

`associationProperty` xác định field nào trong event để tìm đúng Saga instance. Nếu có 100 customers đang update mobile số cùng lúc → 100 Saga instances → mỗi instance xử lý riêng của customer của mình.

Axon dùng giá trị `customerId` để route đúng event đến đúng Saga instance.

**Tất cả `@SagaEventHandler` phải dùng cùng associationProperty** để chúng thuộc cùng 1 Saga instance.

---

## Lưu ý quan trọng: CQRS + Saga

Khi kết hợp CQRS với Saga:
- Mỗi service có **2 databases**: Write DB (Event Store) và Read DB
- Khi rollback: phải rollback **cả 2 databases**

```
Account Service rollback:
  1. AccountAggregate @EventSourcingHandler → cập nhật Write DB (Event Store)
  2. AccountProjection @EventHandler → cập nhật Read DB

Cả hai phải được rollback!
```

Trong Axon Framework, đây tự động xảy ra:
1. `RollbackAccountMobileNumber` command → `AccountAggregate` apply rollback event → Write DB updated
2. `AccountMobileNumberRollbackEvent` published → `AccountProjection` handler → Read DB updated

---

## Subscription Queries — Theo dõi kết quả Saga

Vấn đề: Client gửi request update mobile → nhận ngay "OK" → nhưng Saga chạy async → làm sao biết kết quả?

**Giải pháp: Subscription Query**

```java
// Controller — đợi kết quả từ Saga
@PatchMapping("/mobile-number")
public ResponseEntity<ResponseDto> updateMobileNumber(@RequestBody MobileNumberUpdateDto dto) {
    
    // 1. Tạo Subscription Query — đăng ký lắng nghe kết quả
    SubscriptionQueryResult<ResponseDto, ResponseDto> queryResult = queryGateway.subscriptionQuery(
        new FindCustomerQuery(dto.getCurrentMobileNumber()),  // query identifier
        ResponseTypes.instanceOf(ResponseDto.class),          // initial response type
        ResponseTypes.instanceOf(ResponseDto.class)           // update response type
    );
    
    // 2. Dispatch command để bắt đầu Saga
    commandGateway.send(UpdateCustomerMobileNumberCommand.builder()
        // ...
        .build());
    
    // 3. Đợi kết quả đầu tiên từ Saga (blocking)
    try (queryResult) {
        ResponseDto result = queryResult.updates().blockFirst();  // đợi vô thời hạn
        return ResponseEntity.status(/* dựa vào result.getStatusCode() */)
            .body(result);
    }
}
```

```java
// Trong Saga Manager — emit kết quả
@Autowired
private transient QueryUpdateEmitter queryUpdateEmitter;

@EndSaga
@SagaEventHandler(associationProperty = "customerId")
public void handle(LoanMobileNumberUpdatedEvent event) {
    // Emit success
    queryUpdateEmitter.emit(
        FindCustomerQuery.class,           // query type
        query -> true,                     // predicate (always true = emit to all)
        new ResponseDto(200, "Mobile number updated successfully in all services")
    );
}

@EndSaga
@SagaEventHandler(associationProperty = "customerId")
public void handle(CustomerMobileNumberRollbackEvent event) {
    // Emit failure
    queryUpdateEmitter.emit(
        FindCustomerQuery.class,
        query -> true,
        new ResponseDto(500, "Mobile number update failed in all services")
    );
}
```

**Luồng hoạt động:**
```
Client ──► Controller
               │ 1. Tạo SubscriptionQuery (đăng ký lắng nghe)
               │ 2. Dispatch command
               │ 3. blockFirst() — đợi...
               ▼
         [Saga chạy qua 4 services...]
               │
               │ Saga kết thúc (@EndSaga)
               │ → Emit ResponseDto
               ▼
         Controller nhận ResponseDto
               │
               ▼
         Return response to Client
```

---

## Lợi thế Orchestration so với Choreography

| Aspect | Choreography | Orchestration (Axon) |
|---|---|---|
| Business flow visibility | ❌ Phân tán | ✅ Tập trung trong Saga class |
| Debug | ❌ Trace qua nhiều services | ✅ Single Saga log |
| Error handling | ❌ Mỗi service tự handle | ✅ Centralized trong Saga |
| Real-time status | ❌ Khó | ✅ Subscription Queries |
| Compensation logic | ❌ Phân tán | ✅ Tập trung |
| Axon Dashboard | Không có | ✅ Theo dõi Saga instances |

**Tiếp theo (Phase 7):** Snapshots — Giải quyết performance trong Event Sourcing →

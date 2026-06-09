# Bài 3: Saga Manager và happy path

Đây là trái tim Orchestration: lớp `@Saga` lắng nghe event, dispatch command tới service kế tiếp, lặp lại tới service cuối. Bài này xây Saga Manager cho luôn thành công (happy path): customer → accounts → cards → loans, đồng thời cập nhật mobileNumber ở **cả write DB lẫn read DB** mỗi service.

## Khởi đầu: API + command đầu tiên

Trong `CustomerCommandController`, thêm API đổi số → build và dispatch `UpdateCustomerMobileNumCommand`:

```java
@PatchMapping("/mobile-number")
public ResponseEntity<ResponseDto> updateMobileNumber(
        @Valid @RequestBody MobileNumberUpdateDto dto) {
    UpdateCustomerMobileNumCommand command = UpdateCustomerMobileNumCommand.builder()
        .customerId(dto.getCustomerId())
        .accountNumber(dto.getAccountNumber()).loanNumber(dto.getLoanNumber())
        .cardNumber(dto.getCardNumber())
        .mobileNumber(dto.getCurrentMobileNumber())
        .newMobileNumber(dto.getNewMobileNumber())
        .build();
    commandGateway.sendAndWait(command);
    return ResponseEntity.ok(new ResponseDto("200", "Request processed"));
}
```

Command này được `CustomerAggregate` xử lý (như Phase 3): `@CommandHandler` → apply `CustomerMobileNumberUpdatedEvent` → `@EventSourcingHandler` cập nhật **write DB** (set `newMobileNumber`).

## Cập nhật cả read DB — Projection

Event sourcing handler chỉ lo write DB. Read DB cập nhật ở **Projection**:

```java
// CustomerProjection
@EventHandler
public void on(CustomerMobileNumberUpdatedEvent event) {
    customerService.updateMobileNumber(event.getMobileNumber(), event.getNewMobileNumber());
}
```

`ICustomerService.updateMobileNumber(old, new)`: tìm record theo số cũ → set số mới → save (read DB). Vậy là mỗi service cập nhật **cả hai DB** qua một event.

> **Một event, ba nơi nghe**: `CustomerMobileNumberUpdatedEvent` được xử lý ở (1) `@EventSourcingHandler` (write DB), (2) `CustomerProjection` `@EventHandler` (read DB), và (3) **Saga Manager** (forward sang service kế). Plugin IntelliJ Axon hiển thị đủ ba nơi.

## Lớp Saga Manager

Tạo `UpdateMobileNumberSaga` trong package `saga` của customer:

```java
@Saga                        // ← annotation Axon: class này là Saga instance
@Slf4j
public class UpdateMobileNumberSaga {

    @Autowired
    private transient CommandGateway commandGateway;   // field injection + transient

    @StartSaga                                          // ← event đầu tiên KHỞI ĐỘNG saga
    @SagaEventHandler(associationProperty = "customerId")
    public void handle(CustomerMobileNumberUpdatedEvent event) {
        log.info("Saga event 1 (start): customerId={}", event.getCustomerId());
        // ... dispatch command sang accounts (bên dưới)
    }
}
```

| Annotation / từ khóa | Ý nghĩa |
|---|---|
| `@Saga` | Báo Axon: đây là **Saga instance** (Saga Manager) |
| `@SagaEventHandler(associationProperty = "customerId")` | Method xử lý event trong saga; `associationProperty` = field dùng để **tìm đúng saga instance** |
| `@StartSaga` | Đặt trên event handler **đầu tiên** → khởi động một saga mới |
| `@Autowired ... transient CommandGateway` | **Field injection** (Axon Saga cần constructor rỗng); **`transient`** để CommandGateway không bị serialize khi saga state truyền giữa service |

> **`associationProperty` cực kỳ quan trọng**: nó là "sợi chỉ" gom mọi event của **cùng một** giao dịch vào **cùng một** saga instance. Ta dùng `customerId` (unique cho mỗi customer). **Mọi** `@SagaEventHandler` trong saga này phải dùng cùng association property `customerId`, nếu không Axon tưởng chúng thuộc các saga khác nhau.

## Forward sang service kế: dispatch command với callback

Trong `handle(CustomerMobileNumberUpdatedEvent)`, dispatch command sang accounts. Nhưng **không** dùng `sendAndWait` — dùng `send` **kèm callback** để bắt lỗi (chuẩn bị cho compensation bài sau):

```java
UpdateAccountMobileNumCommand command = UpdateAccountMobileNumCommand.builder()
    .accountNumber(event.getAccountNumber()).cardNumber(event.getCardNumber())
    .loanNumber(event.getLoanNumber()).customerId(event.getCustomerId())
    .mobileNumber(event.getMobileNumber()).newMobileNumber(event.getNewMobileNumber())
    .build();

commandGateway.send(command, (commandMessage, commandResultMessage) -> {
    if (commandResultMessage.isExceptional()) {
        // accounts lỗi → kích hoạt compensation customer (bài 4)
    }
});
```

`commandGateway.send(command, CommandCallback)`: callback chạy **sau khi** accounts xử lý xong. `commandResultMessage.isExceptional()` cho biết có lỗi không — happy path thì `false`, ta đi tiếp. (Compensation dùng nhánh `true`, để bài 4.)

```text
   Saga.handle(CustomerUpdated)  ──send(updateAccountCommand, callback)──►  AccountAggregate
                                                                              │ xử lý
   callback chạy  ◄──────────────────────────────────────────────────────────┘
   isExceptional()? false → đi tiếp ; true → compensation
```

## Chuỗi happy path đầy đủ

Mỗi service: nhận command → aggregate apply event → (write DB + read DB cập nhật) → **Saga Manager nghe event đó → dispatch command kế tiếp**. Lặp tới loans:

```text
   T1  CustomerMobileNumberUpdatedEvent → Saga dispatch UpdateAccountMobileNumCommand
   T2  AccountMobileNumberUpdatedEvent  → Saga dispatch UpdateCardMobileNumCommand
   T3  CardMobileNumberUpdatedEvent     → Saga dispatch UpdateLoanMobileNumCommand
   T4  LoanMobileNumberUpdatedEvent     → Saga KẾT THÚC (@EndSaga)
```

Mỗi `@SagaEventHandler` đều dùng `associationProperty = "customerId"`. Với mỗi service (accounts/cards/loans), lặp lại y khuôn customer: thêm `@CommandHandler` + `@EventSourcingHandler` trong aggregate (write DB), thêm `@EventHandler` trong projection + method service (read DB).

## Kết thúc saga: @EndSaga

Event cuối (`LoanMobileNumberUpdatedEvent`) đánh dấu hết chuỗi xuôi:

```java
@EndSaga                                            // ← kết thúc saga
@SagaEventHandler(associationProperty = "customerId")
public void handle(LoanMobileNumberUpdatedEvent event) {
    log.info("Saga event 4 (end): loanNumber={}", event.getLoanNumber());
    // loans là service cuối → không dispatch gì thêm
}
```

`@EndSaga` báo Axon đóng saga instance. Loans cuối chuỗi nên không forward đi đâu.

> Một saga sẽ có **hai** method `@EndSaga`: một cho happy path (loans updated — bài này), một cho failure path (customer rolled back — bài 4).

## Tóm tắt bài 3

- API customer dispatch `UpdateCustomerMobileNumCommand`; aggregate `@EventSourcingHandler` cập nhật **write DB**, projection `@EventHandler` cập nhật **read DB**.
- **Saga Manager** (`@Saga`): `@SagaEventHandler(associationProperty="customerId")` — association property gom event vào đúng saga instance, **phải nhất quán** mọi handler.
- `@StartSaga` trên handler đầu; `@EndSaga` trên handler cuối; `CommandGateway` inject kiểu `@Autowired transient` (field injection).
- Forward bằng `commandGateway.send(command, callback)` + `isExceptional()` (để dành nhánh lỗi cho compensation).
- Chuỗi: Customer→Account→Card→Loan, mỗi service cập nhật **cả hai DB**; loans `@EndSaga`.

**Bài kế tiếp** → [Bài 4: Compensation transactions và demo](04-orchestration-compensation-va-demo.md)

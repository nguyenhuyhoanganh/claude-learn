# Bài 4: Compensation transactions và demo

Happy path xong (bài 3). Giờ xử lý nhánh lỗi: khi một service ném exception, Saga Manager dispatch **rollback command** ngược chiều để mọi service quay về số cũ — và vì CQRS, phải hoàn tác **cả write DB lẫn read DB**. Bài này hoàn thiện compensation và chạy demo cả hai kịch bản.

## Kích hoạt compensation từ callback

Nhớ ở bài 3, mỗi lần forward command ta dùng `send(command, callback)` + `isExceptional()`. Nhánh `true` chính là nơi kích hoạt compensation:

```java
// Trong Saga, sau khi dispatch updateLoanMobileNumCommand:
commandGateway.send(loanCommand, (msg, result) -> {
    if (result.isExceptional()) {
        // loans lỗi → rollback service TRƯỚC nó: cards
        RollbackCardMobileNumberCommand rollback = RollbackCardMobileNumberCommand.builder()
            .cardNumber(event.getCardNumber())
            .accountNumber(event.getAccountNumber())
            .customerId(event.getCustomerId())
            .mobileNumber(event.getMobileNumber())
            .newMobileNumber(event.getNewMobileNumber())
            .errorMsg(result.exceptionResult().getMessage())   // lý do lỗi
            .build();
        commandGateway.sendAndWait(rollback);
    }
});
```

> `result.exceptionResult().getMessage()` lấy thông điệp lỗi → nhét vào `errorMsg` để lưu vào write DB (audit: vì sao rollback). Rollback command mang theo `accountNumber` + `customerId` vì chuỗi compensation còn phải đi tiếp qua accounts → customer (Phase 6 bài 2).

## Aggregate xử lý rollback command — "tráo" số cũ

Mỗi service cần `@CommandHandler` + `@EventSourcingHandler` cho rollback command (giống update nhưng **set lại số cũ**):

```java
// CardAggregate
@CommandHandler
public void handle(RollbackCardMobileNumberCommand command) {
    CardMobileNumberRollbackEvent event = new CardMobileNumberRollbackEvent();
    BeanUtils.copyProperties(command, event);
    AggregateLifecycle.apply(event);
}

@EventSourcingHandler
public void on(CardMobileNumberRollbackEvent event) {
    this.mobileNumber = event.getMobileNumber();   // ← số CŨ, KHÔNG phải getNewMobileNumber()
    this.errorMsg     = event.getErrorMsg();        // lưu lý do vào write DB
}
```

| Điểm | Update (xuôi) | Rollback (ngược) |
|---|---|---|
| Set vào write DB | `getNewMobileNumber()` (số mới) | **`getMobileNumber()`** (số cũ) |
| Field `errorMsg` | không | có — lưu lý do rollback |

Cần thêm field `private String errorMsg;` vào aggregate để lưu.

## Projection rollback — "tráo" tham số

Read DB cũng phải hoàn tác. Projection gọi cùng `updateMobileNumber(old, new)` nhưng **đảo thứ tự tham số**:

```java
// CardProjection
@EventHandler
public void on(CardMobileNumberRollbackEvent event) {
    // update xuôi:  updateMobileNumber(getMobileNumber, getNewMobileNumber)
    // rollback:     ĐẢO LẠI → tìm theo số MỚI (đang lưu), set về số CŨ
    cardService.updateMobileNumber(event.getNewMobileNumber(), event.getMobileNumber());
}
```

> **Quy tắc tráo tham số**: ở event update, gọi `updateMobileNumber(số_cũ, số_mới)` (tìm số cũ → set số mới). Ở event rollback, **đảo lại** `updateMobileNumber(số_mới, số_cũ)` (tìm số mới đang lưu → set về số cũ). Sai thứ tự = rollback hỏng.

## Chuỗi compensation ngược trong Saga Manager

Mỗi rollback event được Saga nghe → dispatch rollback command service trước, lan tới customer:

```text
   Loans lỗi
     │ callback: rollback CARD
     ▼
   CardMobileNumberRollbackEvent  → Saga dispatch RollbackAccountMobileNumberCommand
     ▼
   AccountMobileNumberRollbackEvent → Saga dispatch RollbackCustomerMobileNumberCommand
     ▼
   CustomerMobileNumberRollbackEvent → @EndSaga (kết thúc nhánh lỗi)
```

Mỗi `@SagaEventHandler` rollback vẫn dùng `associationProperty = "customerId"`. Customer là compensation cuối → handler của nó gắn **`@EndSaga`** (không dispatch gì thêm).

> **Hai method `@EndSaga`**: một cho `LoanMobileNumberUpdatedEvent` (happy path — bài 3), một cho `CustomerMobileNumberRollbackEvent` (failure path — đây). Cùng kết thúc saga, ở hai nhánh khác nhau.

## Demo happy path

Reset sạch (xóa container Axon + data/events + file H2), khởi động đủ service. Tạo data số `...7672`. Gọi API orchestration đổi sang `...7673`, gửi kèm `customerId/accountNumber/loanNumber/cardNumber` (lấy từ `fetchCustomerSummary`).

> **Bẫy validation**: `@NotEmpty` chỉ áp cho String — đừng đặt nó trên field `Long` (accountNumber...), sẽ lỗi validation. Bỏ các validation đó.

Theo log trong customer (search `updateMobileNumberSaga`): thấy "Saga Event 1 start" → "Event 2" → "Event 3" → "Event 4 end". Kiểm tra `fetchCustomerSummary` với số mới → cả 4 service mang `7673`. Trên Axon dashboard Search: 4 event `...UpdatedEvent` theo thứ tự.

## Demo nhánh lỗi

Ném exception trong `LoanAggregate` (service cuối) khi xử lý `UpdateLoanMobileNumCommand`:

```java
// trong @CommandHandler/@EventSourcingHandler của loans
throw new RuntimeException("An error occurred in loan service");
```

Gọi API đổi số. Quan sát Axon Search:

```text
   CustomerMobileNumberUpdatedEvent  ✅
   AccountMobileNumberUpdatedEvent   ✅
   CardMobileNumberUpdatedEvent      ✅
   LoanMobileNumberUpdatedEvent      ✗ (không bao giờ phát — loans lỗi)
   CardMobileNumberRollbackEvent     ◄─ compensation bắt đầu
   AccountMobileNumberRollbackEvent
   CustomerMobileNumberRollbackEvent ◄─ @EndSaga
```

Kiểm tra `fetchCustomerSummary`: cả 4 service vẫn mang **số cũ** → compensation chạy đúng. Bỏ exception → happy path lại đồng bộ số mới.

## So sánh Choreography (Phase 5) vs Orchestration (Phase 6)

| | Choreography | Orchestration |
|---|---|---|
| Điều phối | Mỗi service tự gọi (Spring Cloud Stream) | Saga Manager (Axon) |
| Số DB mỗi service | 1 | 2 (CQRS: read + write) |
| Rollback cục bộ | `setRollbackOnly()` thủ công | Qua rollback command → cả 2 DB |
| Bắt lỗi để compensation | try/catch trong service | `callback.isExceptional()` trong Saga |
| Điểm điều khiển | Phân tán | Tập trung |

## Tóm tắt bài 4

- Compensation kích hoạt từ **callback** `isExceptional()`; rollback command mang `errorMsg` + id các service phía sau.
- Aggregate rollback: `@EventSourcingHandler` set **số cũ** (`getMobileNumber`) + lưu `errorMsg` (write DB).
- Projection rollback: gọi `updateMobileNumber` **đảo tham số** (số mới → số cũ) cho read DB.
- Chuỗi compensation ngược: card → account → customer; customer gắn **`@EndSaga`**.
- Saga có **hai** `@EndSaga` (happy: loan updated; failure: customer rollback).
- Demo: happy → 4 service số mới; lỗi loans → rollback event ngược → 4 service số cũ.

**Bài kế tiếp** → [Bài 5: Subscription queries — biết trạng thái tổng của Saga](05-subscription-queries-overall-status.md)

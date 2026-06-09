# Bài 2: Chuẩn bị commands, events và config

Vì Orchestration chạy trên CQRS/Axon, mọi thay đổi data phải đi qua **command → event**. Bài này tạo bộ command/event dùng chung cho Saga: 4 command "update" (xuôi) + 3 command "rollback" (ngược), cùng các event tương ứng — tất cả đặt trong `common` để mọi service và Saga Manager dùng chung.

## Code nền: copy từ Section 3 (CQRS + ES)

Khác Phase 5 (copy từ code không-CQRS), Phase 6 **copy từ Section 3** — nơi đã có CQRS + Event Sourcing. Ta thêm Saga **lên trên** nền CQRS/ES đó (không trộn với materialized view của Section 4 cho gọn).

## DTO request — mang sẵn các aggregate identifier

```java
@Data
public class MobileNumberUpdateDto {
    private String currentMobileNumber;
    private String newMobileNumber;
    private String customerId;     // aggregate id của customer
    private Long   accountNumber;  // aggregate id của accounts
    private Long   loanNumber;     // aggregate id của loans
    private Long   cardNumber;     // aggregate id của cards
}
```

> **Vì sao nhận thêm customerId/accountNumber/...?** Trong CQRS + ES, để cập nhật write DB (event store), mỗi aggregate cần **aggregate identifier** của nó (Phase 3). `CustomerAggregate` cần `customerId`, `AccountsAggregate` cần `accountNumber`, v.v. Client lấy các id này từ `fetchCustomerSummary` (Phase 1) và gửi kèm → tránh phải query DB lại trong interceptor. (Nếu client không gửi được, có thể query theo mobileNumber trong interceptor.)

## XStream config — như Phase 4

Vì command/event sẽ serialize giữa các service, cần whitelist (như Materialized View, Phase 4 bài 3): tạo `AxonConfig` (`@Bean XStream` cho phép `com.eazybytes.**`) trong `common`, rồi `@Import(AxonConfig.class)` vào main class của cả 4 service.

## Bốn command "update" (xuôi)

Đặt trong `common/command`. Mỗi command mang đủ field + có **target aggregate identifier riêng** theo service:

```java
@Data @Builder
public class UpdateCustomerMobileNumCommand {
    @TargetAggregateIdentifier
    private String customerId;            // ← target id của CUSTOMER
    private Long accountNumber, loanNumber, cardNumber;
    private String mobileNumber, newMobileNumber;
}
```

| Command | Target aggregate identifier |
|---|---|
| `UpdateCustomerMobileNumCommand` | `customerId` |
| `UpdateAccountMobileNumCommand` | `accountNumber` |
| `UpdateCardMobileNumCommand` | `cardNumber` |
| `UpdateLoanMobileNumCommand` | `loanNumber` |

> Mỗi command thuộc service nào → `@TargetAggregateIdentifier` đặt trên field định danh của service đó. Đây là điều Axon cần để biết update đúng aggregate trong event store.

## Ba command "rollback" (ngược) — chú ý field kế thừa

Compensation cũng phải qua command (CQRS bắt buộc). Nhưng số lượng field **giảm dần** theo chiều ngược:

```java
@Data @Builder
public class RollbackCustomerMobileNumberCommand {
    @TargetAggregateIdentifier
    private String customerId;
    private String mobileNumber, newMobileNumber;
    private String errorMsg;     // lý do rollback — sẽ lưu vào write DB
}
```

| Rollback command | Field mang theo | Vì sao |
|---|---|---|
| `RollbackCustomerMobileNumberCommand` | `customerId` (+ mobile, error) | Customer là **compensation cuối** → không cần id service khác |
| `RollbackAccountMobileNumberCommand` | `accountNumber` **+ customerId** | Account rollback xong phải kích hoạt rollback **customer** → cần `customerId` |
| `RollbackCardMobileNumberCommand` | `cardNumber` + `accountNumber` + `customerId` | Card rollback xong kích hoạt rollback **account** → cần cả `accountNumber` và `customerId` (để account còn kích hoạt customer) |

> **Không có rollback command cho loans!** Loans là service **cuối** trong chuỗi xuôi. Nếu loans lỗi, nó chỉ rollback DB của chính nó (qua `@Transactional`/event sourcing) — không ai "compensation" loans cả. Compensation chỉ áp cho các service **trước** điểm lỗi.

```text
   Mỗi rollback command mang theo id của TẤT CẢ service mà chuỗi compensation
   còn phải đi qua phía sau nó:
   card-rollback  → cần cardNumber, accountNumber, customerId
   account-rollback → cần accountNumber, customerId
   customer-rollback → chỉ cần customerId (cuối chuỗi)
```

## Event classes — 4 update + 3 rollback

Mỗi command có một event tương ứng (quy tắc CQRS: command sinh event). Đặt trong `common/event`, đều `@Data`:

```text
UPDATE events (4):
   CustomerMobileNumberUpdatedEvent, AccountMobileNumberUpdatedEvent,
   CardMobileNumberUpdatedEvent,     LoanMobileNumberUpdatedEvent

ROLLBACK events (3):  (không có cho loans)
   CustomerMobileNumRollbackEvent, AccountMobileNumRollbackEvent,
   CardMobileNumRollbackEvent
```

Field của event khớp với command tương ứng. Rollback event mang thêm `errorMsg` (để Saga Manager và write DB biết lý do).

## Bản đồ tổng

```text
   COMMANDS (common/command):        EVENTS (common/event):
   update: Customer/Account/Card/Loan   updated: Customer/Account/Card/Loan
   rollback: Customer/Account/Card      rollback: Customer/Account/Card
   (KHÔNG có rollback cho Loan — service cuối)
```

## Tóm tắt bài 2

- Code nền copy từ **Section 3** (đã có CQRS+ES); thêm Saga lên trên.
- `MobileNumberUpdateDto` mang sẵn **customerId/accountNumber/loanNumber/cardNumber** vì mỗi aggregate cần id để update event store.
- XStream whitelist `com.eazybytes.**` trong `common` + `@Import` mọi service.
- **4 command update** (mỗi cái `@TargetAggregateIdentifier` riêng theo service) + **3 command rollback** (mang theo id của các service còn phải compensation phía sau).
- **Không** có rollback cho **loans** (service cuối, chỉ rollback chính nó).
- Mỗi command có event tương ứng; rollback event mang thêm `errorMsg`.

**Bài kế tiếp** → [Bài 3: Saga Manager và happy path](03-orchestration-saga-manager-happy-path.md)

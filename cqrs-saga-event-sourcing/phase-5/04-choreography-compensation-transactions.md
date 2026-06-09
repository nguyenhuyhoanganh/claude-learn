# Bài 4: Compensation transactions và demo hoàn chỉnh

Happy path xong (bài 3). Giờ phần khó: khi một service ném exception, phải **rollback DB cục bộ** *và* **kích hoạt chuỗi compensation ngược chiều** để mọi service quay về số cũ. Bài này xây compensation cho từng service và chạy demo kịch bản lỗi.

> **Tư duy thiết kế compensation**: nghĩ tới *mọi* chỗ code có thể lỗi/ném exception, rồi xử lý từng chỗ. Ta xét lần lượt: lỗi ở customer, ở accounts, ở cards, ở loans.

## Trường hợp 1: lỗi ngay trong Customer (service đầu)

Nếu exception xảy ra trong customer **trước khi** phát event đi đâu, chỉ cần rollback DB cục bộ. Spring làm điều này tự động — **nếu** có `@Transactional`:

```java
@Transactional
public boolean updateMobileNumber(MobileNumberUpdateDto dto) {
    Customer customer = ...; customer.setMobileNumber(dto.getNewMobileNumber());
    repository.save(customer);
    // throw new RuntimeException("...");  // nếu lỗi ở đây → Spring tự rollback save() trên
    updateAccountMobileNumber(dto);
    return true;
}
```

`@Transactional` bọc method thành một transaction; RuntimeException (hoặc con của nó) → Spring Data JPA **tự rollback**. Vì chưa phát event nào ra ngoài, không cần compensation. Đơn giản nhất.

## Trường hợp 2: lỗi ở Accounts (service giữa)

Đây mới là phần thật sự của Saga. Khi accounts lỗi, nó phải: (a) rollback DB của **chính nó**, (b) **kích hoạt compensation ở customer** (service trước). Chỉ `@Transactional` là **không đủ** — vì ta đang *bắt* exception (không ném lên) để còn gọi compensation.

```java
public boolean updateMobileNumber(MobileNumberUpdateDto dto) {
    boolean result = false;
    try {
        Accounts account = ...; account.setMobileNumber(dto.getNewMobileNumber());  // T2
        repository.save(account);
        updateCardMobileNumber(dto);     // phát tiếp sang cards
        result = true;
    } catch (Exception ex) {
        log.error("Error updating account mobile number", ex);
        // (a) rollback DB cục bộ THỦ CÔNG (vì ta nuốt exception, không ném lên)
        TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        // (b) kích hoạt compensation ở customer (service TRƯỚC)
        rollbackCustomerMobileNumber(dto);
    }
    return result;
}

private void rollbackCustomerMobileNumber(MobileNumberUpdateDto dto) {
    log.info("Sending rollbackCustomerMobileNumber request: {}", dto);
    streamBridge.send("rollbackCustomerMobileNumber-out-0", dto);
}
```

| Kỹ thuật | Vì sao |
|---|---|
| `try/catch` thay vì để exception ném lên | Ta cần *bắt* để còn gọi compensation, không cho nó nổ ra ngoài |
| `TransactionAspectSupport.currentTransactionStatus().setRollbackOnly()` | Vì đã nuốt exception, Spring **không** tự rollback → phải đánh dấu rollback **thủ công** |
| `rollbackCustomerMobileNumber-out-0` | Phát event compensation về customer (cần binding + destination `rollback-customer-mobile-number` ở yml hai đầu, + function `rollbackCustomerMobileNumber` bên customer) |

## Compensation ở Customer — và cái bẫy "số nào để tra"

Bên customer, function `rollbackCustomerMobileNumber` gọi `customerService.rollbackMobileNumber(dto)`:

```java
public boolean rollbackMobileNumber(MobileNumberUpdateDto dto) {
    // BẪY: lúc này DB customer ĐANG mang số MỚI (đã update ở T1).
    // Muốn tra đúng record, phải tìm theo số MỚI, rồi set lại số CŨ.
    Customer customer = repository
        .findByMobileNumberAndActiveSw(dto.getNewMobileNumber(), true)   // tra theo số MỚI
        .orElseThrow(() -> new ResourceNotFoundException("Customer","mobileNumber",dto.getNewMobileNumber()));
    customer.setMobileNumber(dto.getCurrentMobileNumber());              // set lại số CŨ
    repository.save(customer);
    return true;
}
```

> **Bẫy quan trọng**: khi compensation chạy, customer DB **đã** mang số mới (T1 đã đổi). Nên phải tra record theo **`newMobileNumber`**, rồi gán lại **`currentMobileNumber`** (số cũ). Tra nhầm theo số cũ → không thấy record. Và customer là service đầu → compensation của nó **không** phát tiếp đi đâu (kết thúc chuỗi).

## Trường hợp 3 & 4: lỗi ở Cards / Loans — chuỗi compensation dài hơn

Quy luật lặp lại: mỗi service khi lỗi → rollback cục bộ + gọi compensation của service **ngay trước** nó.

```text
Lỗi ở LOANS (T4):
   Loans rollback → rollbackCardMobileNumber
   Cards: set số cũ ở Cards DB → rollbackAccountMobileNumber
   Accounts: set số cũ ở Accounts DB → rollbackCustomerMobileNumber
   Customer: set số cũ ở Customer DB → DỪNG
```

Mỗi service cần:
- `@Transactional` + try/catch + `setRollbackOnly()` (rollback cục bộ).
- Function compensation **nhận** từ service sau (vd accounts có `rollbackAccountMobileNumber` nghe từ cards).
- `streamBridge.send` compensation **gửi** tới service trước (vd cards gửi `rollbackAccountMobileNumber-out-0`).
- Logic `rollbackMobileNumber` set lại số cũ (cùng bẫy "tra theo số mới").

Đặc biệt: khi accounts làm compensation cục bộ xong (set số cũ), nó còn phải **gọi tiếp** `rollbackCustomerMobileNumber` để dây chuyền chạy hết về customer.

```text
   Mỗi service trong chuỗi compensation:
   nhận rollback ──► set số cũ ở DB mình ──► gọi rollback của service TRƯỚC
```

## Demo kịch bản lỗi

Cố tình ném exception ở **Loans** (service cuối) sau khi save:

```java
repository.save(loans);
throw new RuntimeException("Some error occurred");   // giả lập lỗi
```

Restart đủ 4 service (sau nhiều thay đổi config, **đừng** tin devtools — restart tay). Tạo data số `...7670`, rồi gọi API đổi sang `...7671`:

- Client nhận **200** ngay (async — đây **không** phải trạng thái tổng cuối).
- Theo log: Loans báo lỗi (catch block) → "compensation on cards triggered" → Cards "compensation on accounts triggered" → Accounts "compensation on customer triggered" → Customer "received rollbackCustomerMobileNumber".
- Kiểm tra `fetchCustomerSummary`: số **mới** (7671) → lỗi (không có data); số **cũ** (7670) → trả về đủ, và cả 4 service đều mang **7670**.

→ Compensation chạy đúng: mọi service quay về số cũ. Bỏ exception đi, chạy lại → happy path đồng bộ số mới cả 4 service.

## Bảng tổng kết binding (happy + compensation)

```text
HAPPY (xuôi):     customer → accounts → cards → loans → (status) → customer
   updateAccountMobileNumber → updateCardMobileNumber → updateLoanMobileNumber → updateMobileNumberStatus

COMPENSATION (ngược): loans → cards → accounts → customer
   rollbackCardMobileNumber → rollbackAccountMobileNumber → rollbackCustomerMobileNumber
```

## Anti-pattern & lưu ý

| Bẫy | Tránh bằng |
|---|---|
| Quên `setRollbackOnly()` khi nuốt exception | DB cục bộ không rollback → data sai. Phải đánh dấu thủ công |
| Compensation tra theo số cũ | Không thấy record (DB đã mang số mới) → tra theo **số mới**, set lại số cũ |
| Tin devtools sau nhiều thay đổi config | Restart **tay** toàn bộ service |
| Client coi 200 là kết quả cuối | Async → 200 chỉ là "đã nhận"; client phải **poll** trạng thái thật |

## Tóm tắt bài 4

- Lỗi ở service đầu (customer): chỉ cần `@Transactional` → Spring tự rollback, không cần compensation.
- Lỗi ở service giữa/cuối: **try/catch** + `TransactionAspectSupport...setRollbackOnly()` (rollback cục bộ thủ công vì nuốt exception) + phát event **compensation** về service trước.
- Compensation lan ngược chiều tới tận customer; mỗi service set lại **số cũ** — bẫy: tra record theo **số mới**.
- Demo lỗi ở loans → chuỗi compensation cards→accounts→customer → cả 4 về số cũ.
- Cốt lõi Saga không nằm ở business logic mà ở **thiết kế cẩn thận luồng + mọi kịch bản lỗi**.

**Bài kế tiếp** → [Phase 6 — Bài 1: Orchestration Saga với CQRS/Axon](../phase-6/01-orchestration-saga-introduction.md)

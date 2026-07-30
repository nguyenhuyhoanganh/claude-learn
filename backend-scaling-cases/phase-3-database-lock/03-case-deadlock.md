# Case 3: Deadlock — hai giao dịch chờ nhau vĩnh viễn

```text
ERROR: deadlock detected
DETAIL: Process 12045 waits for ShareLock on transaction 891234; blocked by process 11987.
        Process 11987 waits for ShareLock on transaction 891235; blocked by process 12045.
HINT: See server log for query details.
```

Lỗi này gây hoang mang vì nó **không tái hiện được**. Chạy lại thì thành công. Trên máy dev không bao giờ gặp. Chỉ xuất hiện ở production, ngẫu nhiên, vài lần một ngày.

Bài này giải thích chính xác điều kiện sinh ra deadlock, và điều quan trọng hơn: cách thiết kế để nó **không thể xảy ra**.

## Deadlock là gì

**Deadlock (bế tắc)** — hai hoặc nhiều giao dịch chờ lẫn nhau thành vòng tròn, không ai nhả trước, nên không ai đi tiếp được.

```text
   Giao dịch A                        Giao dịch B
   ───────────                        ───────────
   UPDATE account WHERE id=1  ✓       UPDATE account WHERE id=2  ✓
   (giữ lock trên dòng 1)             (giữ lock trên dòng 2)

   UPDATE account WHERE id=2  ⏳      UPDATE account WHERE id=1  ⏳
   (chờ B nhả dòng 2)                 (chờ A nhả dòng 1)

   ┌──────────────────────────────────────────┐
   │   A ──chờ──→ [dòng 2] ──giữ bởi──→ B     │
   │   ↑                                 │     │
   │   └──giữ bởi── [dòng 1] ←──chờ──────┘    │
   └──────────────────────────────────────────┘
              VÒNG TRÒN — không lối thoát
```

Database phát hiện vòng tròn này và **hy sinh một giao dịch** (rollback nó) để giao dịch kia đi tiếp. Giao dịch bị hy sinh nhận lỗi deadlock.

Bốn điều kiện Coffman cần có đồng thời để deadlock xảy ra:

1. **Mutual exclusion** — tài nguyên chỉ một người giữ được.
2. **Hold and wait** — giữ tài nguyên này rồi xin thêm tài nguyên khác.
3. **No preemption** — không ai bị tước tài nguyên đang giữ.
4. **Circular wait** — chuỗi chờ tạo thành vòng tròn.

Phá vỡ **bất kỳ điều kiện nào** là hết deadlock. Trong thực tế, điều kiện số 4 dễ phá nhất — và đó là giải pháp chính của bài này.

## Bảy tình huống sinh deadlock trong ứng dụng thật

### 1. Cập nhật nhiều dòng theo thứ tự khác nhau — kinh điển nhất

```java
// Chuyển tiền
@Transactional
public void transfer(Long fromId, Long toId, BigDecimal amount) {
    accountRepo.decrease(fromId, amount);     // khoá dòng fromId
    accountRepo.increase(toId, amount);       // khoá dòng toId
}
```

```text
   Người dùng 1 chuyển từ A → B    (khoá A rồi khoá B)
   Người dùng 2 chuyển từ B → A    (khoá B rồi khoá A)

   Chạy đồng thời → DEADLOCK
```

**Giải pháp: luôn khoá theo thứ tự cố định**, thường là theo khoá chính tăng dần:

```java
@Transactional
public void transfer(Long fromId, Long toId, BigDecimal amount) {
    Long first = Math.min(fromId, toId);
    Long second = Math.max(fromId, toId);

    // Khoá theo thứ tự ID tăng dần — MỌI giao dịch đều theo thứ tự này
    accountRepo.lockById(first);
    accountRepo.lockById(second);

    accountRepo.decrease(fromId, amount);
    accountRepo.increase(toId, amount);
}
```

```sql
-- lockById
SELECT id FROM account WHERE id = :id FOR UPDATE;
```

Vì mọi giao dịch đều khoá theo thứ tự tăng dần, **vòng tròn không thể hình thành**. Đây là kỹ thuật **lock ordering** — đơn giản, hiệu quả tuyệt đối, và áp dụng được cho mọi ngôn ngữ, mọi database.

### 2. Cập nhật hàng loạt không sắp xếp

```java
// SAI — thứ tự các phần tử trong Set là ngẫu nhiên
@Transactional
public void updateAll(Set<Long> ids) {
    ids.forEach(id -> repo.increment(id));
}
```

Hai request với cùng tập ID nhưng thứ tự duyệt khác nhau → deadlock.

```java
// ĐÚNG — sắp xếp trước
@Transactional
public void updateAll(Collection<Long> ids) {
    ids.stream().sorted().forEach(id -> repo.increment(id));
}
```

Hoặc tốt hơn, một câu SQL duy nhất — database tự xử lý thứ tự nhất quán:

```sql
UPDATE counter SET value = value + 1 WHERE id = ANY(:ids);
```

### 3. Chuyển đổi từ shared lock lên exclusive lock

```java
@Transactional
public void process(Long id) {
    Item item = repo.findByIdForShare(id);      // S-lock
    if (item.isReady()) {
        repo.updateStatus(id, DONE);            // cần nâng lên X-lock
    }
}
```

```text
   A: lấy S-lock trên dòng 5   ✓
   B: lấy S-lock trên dòng 5   ✓  (S tương thích với S)

   A: muốn nâng lên X-lock → phải chờ B nhả S
   B: muốn nâng lên X-lock → phải chờ A nhả S
   ⇒ DEADLOCK
```

Đây là **lock upgrade deadlock**, rất hay gặp và khó nhận ra. Giải pháp: **lấy X-lock ngay từ đầu** nếu biết sẽ ghi.

```java
Item item = repo.findByIdForUpdate(id);        // FOR UPDATE ngay từ đầu
```

### 4. Insert đụng unique index

```java
@Transactional
public void register(String email, String phone) {
    userRepo.insert(email, phone);     // bảng có unique index trên cả email và phone
}
```

Hai giao dịch cùng insert với email/phone chéo nhau có thể deadlock trên các index khác nhau. Rất khó tránh hoàn toàn; xử lý bằng cách bắt lỗi và thử lại.

### 5. Foreign key gây khoá ngầm

```sql
-- Bảng order_item có FK tới orders
INSERT INTO order_item (order_id, sku) VALUES (100, 'ABC');
```

InnoDB tự lấy **shared lock trên dòng cha** (`orders.id = 100`) để đảm bảo dòng cha không bị xoá. Nếu giao dịch khác đang UPDATE dòng cha đó, có thể sinh deadlock — dù nhìn code bạn không thấy có lệnh nào đụng bảng `orders`.

Đây là loại deadlock khó hiểu nhất vì **lock không xuất hiện trong SQL bạn viết**.

### 6. Gap lock ở MySQL với isolation REPEATABLE READ

Case 7 sẽ nói kỹ. Tóm tắt: MySQL khoá cả **khoảng trống** giữa các giá trị index, nên hai INSERT vào những giá trị hoàn toàn khác nhau vẫn có thể chặn nhau.

### 7. Thứ tự khác nhau giữa các bảng

```java
// Luồng A
@Transactional void a() {
    orderRepo.update(...);        // bảng orders
    inventoryRepo.update(...);    // bảng inventory
}

// Luồng B
@Transactional void b() {
    inventoryRepo.update(...);    // bảng inventory  ← thứ tự ngược
    orderRepo.update(...);        // bảng orders
}
```

Cùng nguyên lý, nhưng ở mức bảng. Giải pháp: quy ước **thứ tự truy cập bảng cố định trong toàn dự án** và ghi vào tài liệu kiến trúc. Ví dụ: `user → order → order_item → inventory → payment`. Mọi luồng nghiệp vụ đều đi theo thứ tự này.

## Đọc log deadlock

### PostgreSQL

```text
ERROR:  deadlock detected
DETAIL:  Process 12045 waits for ShareLock on transaction 891234;
         blocked by process 11987.
         Process 11987 waits for ShareLock on transaction 891235;
         blocked by process 12045.
         Process 12045: UPDATE account SET balance = balance - 100 WHERE id = 2
         Process 11987: UPDATE account SET balance = balance + 100 WHERE id = 1
CONTEXT:  while updating tuple (0,3) in relation "account"
```

Hai dòng `Process ...:` cho biết chính xác hai câu lệnh xung đột. Từ đó truy ngược ra hai luồng code.

Bật ghi log đầy đủ:

```sql
ALTER SYSTEM SET log_lock_waits = on;
ALTER SYSTEM SET deadlock_timeout = '1s';    -- sau 1s mới chạy thuật toán dò deadlock
SELECT pg_reload_conf();
```

`deadlock_timeout` là khoảng thời gian PostgreSQL chờ trước khi chạy thuật toán phát hiện vòng tròn (vì thuật toán này tốn CPU). Đặt quá nhỏ thì tốn CPU, quá lớn thì deadlock kéo dài. 1 giây là hợp lý.

### MySQL

```sql
SHOW ENGINE INNODB STATUS\G
```

```text
------------------------
LATEST DETECTED DEADLOCK
------------------------
2026-07-30 14:23:11
*** (1) TRANSACTION:
TRANSACTION 891234, ACTIVE 0 sec starting index read
mysql tables in use 1, locked 1
LOCK WAIT 3 lock struct(s), heap size 1136, 2 row lock(s)
UPDATE account SET balance = balance - 100 WHERE id = 2

*** (1) WAITING FOR THIS LOCK TO BE GRANTED:
RECORD LOCKS space id 42 page no 4 n bits 80 index PRIMARY of table `bank`.`account`
trx id 891234 lock_mode X locks rec but not gap waiting

*** (2) TRANSACTION:
TRANSACTION 891235, ACTIVE 0 sec starting index read
UPDATE account SET balance = balance + 100 WHERE id = 1

*** (2) HOLDS THE LOCK(S): ...
*** (2) WAITING FOR THIS LOCK TO BE GRANTED: ...

*** WE ROLL BACK TRANSACTION (1)
```

Bật ghi mọi deadlock vào error log:

```sql
SET GLOBAL innodb_print_all_deadlocks = ON;
```

Đọc log MySQL cần chú ý ba cụm từ:

| Cụm từ | Nghĩa |
|---|---|
| `lock_mode X locks rec but not gap` | Khoá đúng bản ghi, không khoá khoảng trống |
| `lock_mode X locks gap before rec` | **Gap lock** — khoá khoảng trống (case 7) |
| `lock mode S` | Shared lock, thường do foreign key |

## Xử lý: retry là bắt buộc

Deadlock **không thể loại bỏ 100%**. Ngay cả thiết kế hoàn hảo cũng có thể gặp gap lock hoặc FK lock bất ngờ. Vì vậy mọi ứng dụng nghiêm túc đều phải có cơ chế thử lại.

Điểm mấu chốt: deadlock là lỗi **tạm thời (transient)** — chạy lại thường thành công ngay, vì lần này thứ tự đã khác.

```java
@Retryable(
    retryFor = { CannotAcquireLockException.class,
                 DeadlockLoserDataAccessException.class },
    maxAttempts = 3,
    backoff = @Backoff(delay = 50, multiplier = 2, random = true)
)
@Transactional
public void transfer(Long from, Long to, BigDecimal amount) {
    ...
}
```

Ba chi tiết quan trọng:

1. **Retry phải nằm NGOÀI transaction.** Transaction đã bị rollback rồi, retry bên trong nó là vô nghĩa. Với Spring, `@Retryable` và `@Transactional` trên cùng một method thì thứ tự proxy quyết định — an toàn nhất là tách ra hai lớp:

```java
@Service
public class TransferFacade {
    @Retryable(retryFor = CannotAcquireLockException.class, maxAttempts = 3,
               backoff = @Backoff(delay = 50, multiplier = 2, random = true))
    public void transfer(Long from, Long to, BigDecimal amount) {
        transferService.doTransfer(from, to, amount);    // @Transactional nằm trong đây
    }
}
```

2. **Phải có jitter** (`random = true`). Không có nó, hai giao dịch bị deadlock sẽ thử lại **cùng lúc** và deadlock tiếp — chính xác là vấn đề mà công thức Kingman ở phase-1 bài 5 đã cảnh báo.

3. **Chỉ retry được khi thao tác idempotent.** Chuyển tiền retry mù có thể chuyển hai lần. Cần khoá idempotency (phase-5 bài 7).

## Phòng ngừa — bảng chiến lược

| Chiến lược | Phá điều kiện Coffman nào | Hiệu quả | Chi phí |
|---|---|---|---|
| **Lock ordering** (sắp xếp theo ID) | Circular wait | Rất cao | Rất thấp |
| Gộp thành một câu SQL | Hold and wait | Cao | Thấp |
| Rút ngắn transaction | Giảm cửa sổ va chạm | Cao | Thấp |
| Lấy X-lock ngay từ đầu | Lock upgrade | Cao | Thấp |
| `lock_timeout` ngắn | No preemption | Trung bình | Rất thấp |
| Optimistic locking (`@Version`) | Mutual exclusion | Cao | Trung bình |
| Đưa về hàng đợi một luồng | Circular wait | Rất cao | Cao (đổi kiến trúc) |
| Retry có jitter | (xử lý hậu quả) | Bắt buộc phải có | Thấp |

Ba dòng đầu giải quyết được 90% deadlock trong thực tế.

## Trường hợp thực tế: hệ thống ví điện tử

Bối cảnh: ~200 deadlock mỗi ngày ở API chuyển tiền. Người dùng thỉnh thoảng thấy lỗi "Giao dịch thất bại, vui lòng thử lại".

**Chẩn đoán** — bật `innodb_print_all_deadlocks`, gom nhóm log sau 24 giờ:

```text
   142 deadlock: transfer A→B đụng transfer B→A          (thứ tự khoá)
    38 deadlock: cập nhật hạn mức + cập nhật số dư       (thứ tự bảng)
    20 deadlock: insert transaction_log đụng FK          (khoá ngầm FK)
```

**Sửa theo thứ tự**:

| Việc | Deadlock/ngày sau khi sửa |
|---|---|
| Ban đầu | 200 |
| Thêm lock ordering theo `account_id` tăng dần | 58 |
| Quy ước thứ tự bảng: `account → limit → transaction_log` | 20 |
| Bỏ FK trên `transaction_log`, dùng kiểm tra ở tầng ứng dụng | 3 |
| Thêm retry với jitter | 0 lỗi lộ ra người dùng |

Deadlock vẫn còn 3 cái mỗi ngày, nhưng retry xử lý hết — người dùng không bao giờ thấy. Đây là mục tiêu thực tế: **không phải diệt sạch deadlock, mà là làm nó vô hình với người dùng**.

Về việc bỏ foreign key: đây là đánh đổi có thật. Bạn mất một lớp bảo vệ toàn vẹn dữ liệu ở tầng database, đổi lấy ít khoá ngầm hơn. Chỉ nên làm khi tầng ứng dụng thật sự đảm bảo được, và có job đối soát định kỳ. Nhiều hệ thống quy mô lớn chọn hướng này; nhiều hệ thống khác thì không. Không có câu trả lời đúng tuyệt đối.

## Giám sát

```promql
# PostgreSQL
rate(pg_stat_database_deadlocks[5m]) > 0

# MySQL — lấy từ SHOW ENGINE INNODB STATUS hoặc
# performance_schema.events_errors_summary_global_by_error
```

Cảnh báo hợp lý: **deadlock tăng đột biến** so với mức nền, không phải "có deadlock". Vài deadlock mỗi ngày trong hệ thống bận là bình thường.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Không có retry | Người dùng thấy lỗi ngẫu nhiên không giải thích được |
| Retry không có jitter | Hai giao dịch lại đụng nhau lần nữa |
| Retry bên trong transaction | Vô nghĩa — transaction đã rollback |
| Retry thao tác không idempotent | Chuyển tiền hai lần |
| Duyệt `Set`/`HashMap` để cập nhật | Thứ tự ngẫu nhiên → deadlock ngẫu nhiên |
| Nghĩ deadlock là lỗi của database | Là lỗi thiết kế thứ tự truy cập trong code |
| Chỉ tăng `innodb_lock_wait_timeout` | Không liên quan — deadlock được phát hiện tức thì, không phụ thuộc timeout này |
| Không bật `innodb_print_all_deadlocks` | Chỉ xem được deadlock **cuối cùng**, mất hết lịch sử |

Bẫy cuối cùng rất hay gặp: `SHOW ENGINE INNODB STATUS` chỉ hiện **deadlock gần nhất**. Không bật ghi log đầy đủ thì bạn không bao giờ thống kê được mẫu hình.

## Tóm tắt case 3

- Deadlock = **vòng tròn chờ đợi**. Database phát hiện và hy sinh một giao dịch.
- Cần đủ 4 điều kiện Coffman; **phá vỡ vòng tròn (circular wait) là cách dễ nhất**.
- Giải pháp số một: **lock ordering** — luôn khoá theo thứ tự ID tăng dần.
- Cũng cần: quy ước **thứ tự truy cập bảng cố định** trong toàn dự án.
- Lock upgrade (S → X) là nguồn deadlock hay bị bỏ sót — lấy `FOR UPDATE` ngay từ đầu.
- Foreign key và gap lock sinh **khoá ngầm** không xuất hiện trong SQL bạn viết.
- **Retry với jitter là bắt buộc**, đặt NGOÀI transaction, và thao tác phải idempotent.
- Mục tiêu thực tế: **deadlock vô hình với người dùng**, không phải deadlock bằng 0.

**Bài kế tiếp** → [Case 4: Hot row — khi cả nghìn người tranh nhau một dòng dữ liệu](04-case-hot-row.md)

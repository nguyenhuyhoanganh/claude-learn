# Case 7: Isolation level và gap lock — những cái khoá bạn không hề viết ra

Bạn chạy hai câu INSERT vào hai giá trị hoàn toàn khác nhau:

```sql
-- Session 1
INSERT INTO booking (room_id, day) VALUES (10, '2026-08-05');

-- Session 2
INSERT INTO booking (room_id, day) VALUES (10, '2026-08-09');
```

Hai ngày khác nhau, hai dòng khác nhau, không đụng gì tới nhau. Vậy mà session 2 bị chặn.

Thủ phạm là một loại khoá không xuất hiện trong bất kỳ câu SQL nào bạn viết: **gap lock**. Bài này giải thích nó, cùng với isolation level — chủ đề mà hiểu sai gây ra vô số lỗi khó chịu.

## Bốn hiện tượng đọc bất thường

Trước khi nói về isolation level, phải hiểu chúng sinh ra để ngăn cái gì.

### Dirty read (đọc bẩn)

Đọc được dữ liệu mà giao dịch khác **chưa commit** — và có thể sẽ rollback.

```text
   A: UPDATE account SET balance = 0 WHERE id = 1;   (chưa commit)
   B: SELECT balance FROM account WHERE id = 1;  → 0
   A: ROLLBACK
   ⇒ B đã đọc một giá trị CHƯA BAO GIỜ TỒN TẠI thật sự.
```

### Non-repeatable read (đọc lặp không nhất quán)

Đọc cùng một dòng hai lần trong cùng transaction, ra hai kết quả khác nhau.

```text
   B: SELECT balance WHERE id=1  → 100
   A: UPDATE balance = 50 WHERE id=1; COMMIT
   B: SELECT balance WHERE id=1  → 50     ← khác lần đọc trước!
```

### Phantom read (đọc bóng ma)

Chạy cùng một câu truy vấn theo điều kiện, lần sau xuất hiện **dòng mới**.

```text
   B: SELECT count(*) FROM booking WHERE day='2026-08-05'  → 3
   A: INSERT INTO booking (day) VALUES ('2026-08-05'); COMMIT
   B: SELECT count(*) FROM booking WHERE day='2026-08-05'  → 4   ← có "bóng ma"
```

### Write skew (lệch ghi) — hiện tượng ít người biết nhất

Hai transaction đều đọc, đều thấy điều kiện hợp lệ, đều ghi — và kết quả tổng hợp vi phạm quy tắc nghiệp vụ.

```text
   Quy tắc: bệnh viện luôn phải có ít nhất 1 bác sĩ trực.
   Hiện có: Alice và Bob đang trực.

   A (Alice xin nghỉ)             B (Bob xin nghỉ)
   ──────────────────             ────────────────
   đếm số người trực → 2          đếm số người trực → 2
   2 >= 2, được nghỉ  ✓           2 >= 2, được nghỉ  ✓
   UPDATE Alice = off             UPDATE Bob = off
   COMMIT                          COMMIT

   ⇒ KHÔNG CÒN AI TRỰC. Cả hai đều "kiểm tra đúng".
```

Điểm đặc biệt: **hai transaction ghi vào hai dòng khác nhau**, nên không có xung đột lock nào. Đây là lý do write skew chỉ bị ngăn bởi isolation `SERIALIZABLE`.

## Bốn isolation level

| Level | Dirty read | Non-repeatable | Phantom | Write skew |
|---|---|---|---|---|
| `READ UNCOMMITTED` | Có | Có | Có | Có |
| `READ COMMITTED` | Không | Có | Có | Có |
| `REPEATABLE READ` | Không | Không | Tuỳ DB | Có |
| `SERIALIZABLE` | Không | Không | Không | **Không** |

Mặc định của các database phổ biến:

| Database | Mặc định | Ghi chú |
|---|---|---|
| PostgreSQL | `READ COMMITTED` | `REPEATABLE READ` là snapshot isolation thật |
| MySQL / InnoDB | **`REPEATABLE READ`** | Ngăn phantom nhờ gap lock |
| Oracle | `READ COMMITTED` | Không có `REPEATABLE READ` thật |
| SQL Server | `READ COMMITTED` | Mặc định dùng lock, không phải MVCC |

Chú ý sự khác biệt lớn: **MySQL mặc định chặt hơn PostgreSQL**. Code chuyển từ MySQL sang PostgreSQL (hoặc ngược lại) có thể đổi hành vi mà không ai để ý.

## Gap lock — đặc sản của MySQL

Ở `REPEATABLE READ`, InnoDB phải ngăn phantom read. Cách nó làm: khoá không chỉ **bản ghi** mà cả **khoảng trống giữa các bản ghi**.

```text
   Bảng booking, index trên (room_id, day), dữ liệu hiện có:

   ... (10, '2026-08-01') ... (10, '2026-08-10') ... (10, '2026-08-20') ...
        ↑                ↑                     ↑
     record lock      GAP LOCK             record lock
                   (mọi giá trị từ
                    08-01 đến 08-10)

   SELECT * FROM booking WHERE room_id=10 AND day BETWEEN '2026-08-03'
                                                     AND '2026-08-15' FOR UPDATE;

   ⇒ Khoá cả KHOẢNG TRỐNG. Mọi INSERT vào 08-02 → 08-19 đều bị chặn,
     kể cả những ngày chưa có bản ghi nào.
```

**Next-key lock** = record lock + gap lock phía trước nó. Đây là kiểu khoá mặc định của InnoDB ở `REPEATABLE READ`.

### Hệ quả thực tế

Gap lock giải thích rất nhiều hiện tượng khó hiểu:

**1. INSERT vào giá trị khác nhau vẫn chặn nhau**

```sql
-- Session 1
BEGIN;
DELETE FROM booking WHERE room_id = 10 AND day = '2026-08-05';
-- Nếu dòng đó KHÔNG tồn tại, InnoDB vẫn đặt gap lock trên khoảng chứa nó!

-- Session 2
BEGIN;
INSERT INTO booking (room_id, day) VALUES (10, '2026-08-07');   -- BỊ CHẶN
```

**2. Deadlock ở những chỗ tưởng như không thể**

Hai INSERT vào hai giá trị khác nhau, gap lock chồng lấn theo hai hướng ngược nhau → deadlock (case 3, biến thể 6).

**3. Query trên cột không có index khoá gần như cả bảng**

Đây là hệ quả nghiêm trọng nhất, và là chủ đề của case 9.

### Khi nào InnoDB KHÔNG dùng gap lock

| Tình huống | Có gap lock? |
|---|---|
| Isolation `READ COMMITTED` | **Không** |
| Truy vấn bằng unique index với điều kiện `=` khớp đúng một dòng | Không |
| `SELECT` thông thường (không `FOR UPDATE`) | Không (dùng MVCC) |
| Truy vấn theo khoảng (`BETWEEN`, `>`, `<`) | **Có** |
| Truy vấn trên index không unique | **Có** |
| Truy vấn không dùng được index | **Có, gần như cả bảng** |

### Có nên đổi MySQL sang `READ COMMITTED`?

Nhiều hệ thống quy mô lớn làm điều này để giảm gap lock và deadlock:

```sql
SET GLOBAL transaction_isolation = 'READ-COMMITTED';
```

| Được | Mất |
|---|---|
| Không còn gap lock → ít deadlock hơn nhiều | Có phantom read |
| Đồng thời cao hơn | Non-repeatable read |
| Giống hành vi PostgreSQL, Oracle | Phải rà lại code dựa vào `REPEATABLE READ` |
| Binlog nhỏ hơn (với `ROW` format) | |

**Khuyến nghị**: nếu ứng dụng của bạn đã tuân thủ nguyên tắc của case 6 (dùng ràng buộc database, atomic UPDATE, không dựa vào `if-check-then-act`), thì `READ COMMITTED` là lựa chọn tốt — bạn không cần đến sự bảo vệ của `REPEATABLE READ`. Nếu code cũ dựa vào đọc lặp nhất quán, hãy cẩn thận và kiểm thử kỹ.

## `SERIALIZABLE` ở PostgreSQL — cơ chế thông minh

PostgreSQL cài đặt `SERIALIZABLE` bằng **SSI (Serializable Snapshot Isolation)** — không dùng lock, mà **theo dõi các phụ thuộc đọc-ghi** giữa các giao dịch. Nếu phát hiện một mẫu có thể dẫn tới kết quả không thể xảy ra trong thực thi tuần tự, nó huỷ một giao dịch.

```java
@Transactional(isolation = Isolation.SERIALIZABLE)
public void takeDayOff(Long doctorId) {
    long onCall = doctorRepo.countOnCall();
    if (onCall >= 2) {
        doctorRepo.setOffDuty(doctorId);
    } else {
        throw new NotEnoughDoctorsException();
    }
}
```

Với `SERIALIZABLE`, kịch bản write skew ở trên sẽ khiến một trong hai giao dịch nhận lỗi:

```text
ERROR: could not serialize access due to read/write dependencies among transactions
DETAIL: Reason code: Canceled on identification as a pivot, during commit attempt.
HINT: The transaction might succeed if retried.
```

**`HINT` nói rõ: hãy thử lại.** Đây là điều kiện tiên quyết — dùng `SERIALIZABLE` **bắt buộc phải có retry**:

```java
@Retryable(retryFor = CannotSerializeTransactionException.class,
           maxAttempts = 5,
           backoff = @Backoff(delay = 50, multiplier = 2, random = true))
public void takeDayOff(Long doctorId) {
    txService.doTakeDayOff(doctorId);
}
```

### Đánh đổi của `SERIALIZABLE`

| Ưu | Nhược |
|---|---|
| Đúng tuyệt đối — ngăn cả write skew | Tỉ lệ huỷ giao dịch cao khi tải lớn |
| Không cần suy nghĩ về lock thủ công | Chi phí theo dõi phụ thuộc (~10-30% overhead) |
| Code nghiệp vụ viết tự nhiên | **Bắt buộc phải có retry ở mọi nơi** |
| | Không dùng được trên hot row |

**Khi nào dùng**: các giao dịch có bất biến phức tạp liên quan nhiều dòng/nhiều bảng, tần suất không quá cao. Ví dụ: xét duyệt hạn mức tín dụng, phân ca trực, kiểm tra ràng buộc tổng.

**Khi nào không dùng**: đường dẫn nóng, thông lượng cao. Ở đó hãy diễn đạt bất biến bằng ràng buộc database hoặc atomic UPDATE (case 6) — rẻ hơn nhiều.

## Bảng đối chiếu: MySQL vs PostgreSQL

Đây là bảng đáng nhớ nhất của bài, vì nó giải thích vì sao cùng một đoạn code lại chạy khác nhau trên hai database:

| Khía cạnh | MySQL (InnoDB) | PostgreSQL |
|---|---|---|
| Isolation mặc định | `REPEATABLE READ` | `READ COMMITTED` |
| Ngăn phantom ở `RR` | Có, bằng **gap lock** | Có, bằng snapshot (nhưng không ngăn write skew) |
| Gap lock | **Có** | Không có khái niệm này |
| `SERIALIZABLE` cài đặt bằng | Lock (đọc thành `FOR SHARE`) | **SSI** — theo dõi phụ thuộc |
| Lỗi khi xung đột serializable | Lock wait timeout / deadlock | `could not serialize access` |
| Lưu phiên bản cũ ở | Undo log | Trong chính bảng (cần VACUUM) |
| Đọc có chặn ghi không | Không | Không |

Hai điều rút ra:

1. Chuyển database mà không rà lại code đồng thời là rất rủi ro.
2. Đừng viết code dựa vào hành vi cụ thể của một isolation level. Hãy diễn đạt bất biến bằng **ràng buộc tường minh** — chúng đúng ở mọi database, mọi isolation level.

## Chọn isolation level — hướng dẫn thực dụng

```text
   Bất biến của bạn là gì?
   │
   ├─ "Giá trị này không được trùng"
   │    → UNIQUE constraint. Isolation nào cũng được.
   │
   ├─ "Số này không được âm"
   │    → CHECK + atomic UPDATE. Isolation nào cũng được.
   │
   ├─ "Đọc lại trong cùng transaction phải ra kết quả giống nhau"
   │    → REPEATABLE READ
   │
   ├─ "Tổng/số lượng trên nhiều dòng phải thoả điều kiện"
   │    (đây là write skew)
   │    → SERIALIZABLE + retry
   │    hoặc: khoá một dòng đại diện bằng FOR UPDATE (rẻ hơn)
   │
   └─ Còn lại
        → READ COMMITTED (mặc định), + kỹ thuật case 6
```

Nhánh áp chót đáng chú ý: thay vì dùng `SERIALIZABLE` (đắt), bạn thường có thể **vật chất hoá xung đột** — tạo một dòng đại diện để khoá:

```java
@Transactional
public void takeDayOff(Long doctorId, LocalDate date) {
    // Khoá dòng "lịch trực ngày X" — biến write skew thành xung đột lock thường
    scheduleRepo.lockByDate(date);          // SELECT ... FOR UPDATE

    if (doctorRepo.countOnCall(date) >= 2) {
        doctorRepo.setOffDuty(doctorId, date);
    } else {
        throw new NotEnoughDoctorsException();
    }
}
```

Kỹ thuật này gọi là **materializing conflicts**. Nó chuyển một bài toán cần `SERIALIZABLE` thành một bài toán lock thông thường — rẻ hơn nhiều và dễ suy luận hơn.

## Chẩn đoán

```sql
-- Xem isolation level hiện tại
SHOW transaction_isolation;                    -- PostgreSQL
SELECT @@transaction_isolation;                -- MySQL

-- PostgreSQL: đếm số lần huỷ do xung đột serializable
SELECT datname, xact_commit, xact_rollback, conflicts, deadlocks
FROM pg_stat_database WHERE datname = current_database();
```

Trong MySQL, xác định deadlock có phải do gap lock không — đọc `SHOW ENGINE INNODB STATUS` và tìm cụm từ:

```text
lock_mode X locks gap before rec              ← gap lock
lock_mode X locks rec but not gap             ← chỉ record lock
lock_mode X                                    ← next-key lock (record + gap)
```

Nếu thấy `locks gap`, cân nhắc chuyển sang `READ COMMITTED` hoặc thêm index để thu hẹp phạm vi khoá.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Đặt `SERIALIZABLE` mà không có retry | Lỗi ngẫu nhiên hiện ra cho người dùng |
| Nghĩ `REPEATABLE READ` ngăn được write skew | Không ngăn được. Chỉ `SERIALIZABLE` mới ngăn |
| Nghĩ isolation cao là "an toàn hơn, cứ dùng" | Trả giá bằng throughput và tỉ lệ huỷ giao dịch |
| Chuyển MySQL ↔ PostgreSQL không rà code | Hành vi đồng thời đổi âm thầm |
| Không biết gap lock tồn tại | Deadlock và chặn không giải thích được |
| Dùng `SERIALIZABLE` cho hot row | Tỉ lệ huỷ gần 100% |
| Đặt isolation ở mức global | Ảnh hưởng mọi giao dịch, kể cả những cái không cần |

Bẫy cuối: hãy đặt isolation **ở mức từng transaction**, chỉ cho những chỗ thật sự cần:

```java
@Transactional(isolation = Isolation.SERIALIZABLE)   // chỉ method này
```

## Tóm tắt case 7

- Bốn hiện tượng: **dirty read, non-repeatable read, phantom read, write skew**.
- **Write skew** là hiện tượng ít biết nhất và chỉ `SERIALIZABLE` ngăn được.
- MySQL mặc định `REPEATABLE READ`, PostgreSQL mặc định `READ COMMITTED` — **khác nhau về hành vi**.
- **Gap lock** của InnoDB khoá cả khoảng trống → INSERT vào giá trị khác nhau vẫn chặn nhau, và sinh deadlock bất ngờ.
- Chuyển MySQL sang `READ COMMITTED` giảm gap lock và deadlock, đổi lại mất bảo vệ phantom.
- PostgreSQL `SERIALIZABLE` dùng **SSI** — hiệu quả nhưng **bắt buộc phải có retry**.
- Mẹo hay nhất: **vật chất hoá xung đột** — khoá một dòng đại diện, biến write skew thành lock thường.
- Nguyên tắc bao trùm: **diễn đạt bất biến bằng ràng buộc tường minh**, đừng dựa vào isolation level.

**Bài kế tiếp** → [Case 8: N+1 query — 1 request sinh 500 câu SQL](08-case-n-plus-1.md)

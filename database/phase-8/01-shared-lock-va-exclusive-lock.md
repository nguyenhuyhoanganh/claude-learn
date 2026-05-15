# Bài 1: Shared Lock và Exclusive Lock

## Tại sao cần Locks?

Trong môi trường nhiều người dùng cùng truy cập database, cần đảm bảo:
- Người đọc không đọc giá trị đang thay đổi dở
- Người ghi không ghi chồng lên ghi của người khác
- Dữ liệu luôn nhất quán

**Locks** là cơ chế database dùng để kiểm soát truy cập đồng thời.

---

## Exclusive Lock (X-Lock) - Khóa Độc Quyền

**Exclusive lock** = Tôi sắp thay đổi dữ liệu này, không ai được đọc hoặc ghi khi tôi đang làm.

```
Khi nào dùng: UPDATE, DELETE, INSERT
Hiệu quả: Không ai khác có thể đọc hoặc ghi row đó

Điều kiện để acquire:
  → Không có Shared Lock nào đang tồn tại trên row đó
  → Không có Exclusive Lock nào khác trên row đó
```

### Ví dụ

```sql
-- Transaction 1 bắt đầu UPDATE
BEGIN;
UPDATE accounts SET balance = balance + 200 WHERE user_id = 1;
-- → Database tự động acquire Exclusive Lock trên row user_id=1
-- → Không ai có thể đọc balance này cho đến khi commit/rollback

COMMIT;
-- → Exclusive Lock được giải phóng
```

---

## Shared Lock (S-Lock) - Khóa Đọc

**Shared lock** = Tôi đang đọc dữ liệu này, không ai được thay đổi trong khi tôi đọc.

```
Khi nào dùng: SELECT (trong một số isolation levels)
Hiệu quả: Nhiều shared locks có thể cùng tồn tại, nhưng block exclusive lock

Điều kiện để acquire:
  → Không có Exclusive Lock nào đang tồn tại trên row đó
  → Nhiều transactions có thể có shared lock cùng lúc
```

### Cách acquire Shared Lock trong SQL

```sql
-- Explicit shared lock (PostgreSQL)
SELECT * FROM accounts WHERE user_id = 1 FOR SHARE;
-- → Acquire shared lock: nhiều người có thể đọc
-- → Nhưng không ai có thể UPDATE row này

-- LOCK TABLE (toàn bộ bảng)
LOCK TABLE accounts IN SHARE MODE;
```

---

## Shared vs Exclusive: Quan hệ tương tác

```
Ma trận tương thích:

              Muốn S-Lock   Muốn X-Lock
Đang có S-Lock   ✅ OK         ❌ Block
Đang có X-Lock   ❌ Block      ❌ Block
Không có lock    ✅ OK         ✅ OK

→ Nhiều người đọc cùng lúc: OK
→ Đọc + Ghi cùng lúc: Block
→ Nhiều người ghi cùng lúc: Block
```

---

## Timeline Ví dụ: Alice, Bob, Charlie

```
Timeline (trái → phải = thời gian):

Alice:  [BEGIN] [X-Lock: deposit $200] [COMMIT] [BEGIN] [S-Lock: reporting.............] [COMMIT]
Bob:                                             [BEGIN] [S-Lock: reporting.......] [COMMIT]
Charlie:                                                   [BEGIN] [X-Lock: transfer] ← FAIL! Bob có S-Lock
                                                                    [Waiting...........] [X-Lock: OK] [COMMIT]
```

**Giải thích:**
1. Alice deposit $200 → Acquire X-Lock → Commit → Release
2. Alice bắt đầu long reporting query → Acquire S-Lock trên account của mình
3. Bob bắt đầu reporting query → Acquire S-Lock trên account của Bob → OK (S-Lock tương thích)
4. Charlie muốn transfer $300 vào account của Bob → Cần X-Lock → **FAIL** vì Bob có S-Lock!
5. Bob hoàn thành reporting → Release S-Lock
6. Charlie thử lại X-Lock → **Thành công** → Transfer được thực hiện

---

## Deadlock - Tình huống Khóa Lẫn Nhau

**Deadlock** xảy ra khi 2 transactions chờ nhau giải phóng lock, tạo thành vòng tròn vô hạn.

### Demo Deadlock trong PostgreSQL

```sql
-- Terminal 1: Transaction T1
BEGIN;
INSERT INTO test VALUES (20);  -- Acquire X-Lock trên value 20
-- ✓ Thành công (20 không tồn tại)

-- Terminal 2: Transaction T2
BEGIN;
INSERT INTO test VALUES (21);  -- Acquire X-Lock trên value 21
-- ✓ Thành công (21 không tồn tại)

-- Terminal 1: T1 cố gắng insert 21 (đang bị T2 lock)
INSERT INTO test VALUES (21);  -- → BLOCKING... chờ T2 release

-- Terminal 2: T2 cố gắng insert 20 (đang bị T1 lock)
INSERT INTO test VALUES (20);  -- → DEADLOCK DETECTED!
```

```
Kết quả:
  ERROR:  deadlock detected
  DETAIL:  Process 1234 waits for ShareLock on transaction 5678;
           blocked by process 5678.
           Process 5678 waits for ShareLock on transaction 1234;
           blocked by process 1234.
  HINT:   See server log for query details.
  
  → PostgreSQL tự động detect deadlock
  → Transaction "cuối cùng" bị rollback (victim)
  → Transaction "đầu tiên" tiếp tục
```

### Deadlock Detection

```
Hầu hết databases detect deadlock theo cách:
  1. Maintain wait-for graph (ai đang chờ ai)
  2. Phát hiện cycle trong graph = deadlock
  3. Chọn "victim" (thường là transaction nhỏ nhất / ít cost nhất)
  4. Rollback victim
  5. Transaction còn lại tiếp tục

PostgreSQL: Check deadlock sau mỗi deadlock_timeout (default 1 giây)
```

### Cách Tránh Deadlock

```sql
-- ❌ Dễ deadlock: Acquire locks theo thứ tự khác nhau
-- T1: Lock A, rồi Lock B
-- T2: Lock B, rồi Lock A

-- ✅ Tránh deadlock: Luôn acquire locks theo cùng thứ tự
-- T1: Lock A, rồi Lock B  
-- T2: Lock A (chờ), rồi Lock B

-- ✅ Dùng SELECT FOR UPDATE sớm để tránh bất ngờ
BEGIN;
SELECT * FROM accounts WHERE id IN (1, 2) ORDER BY id FOR UPDATE;
-- → Acquire locks theo thứ tự id → Không deadlock
```

---

## Two-Phase Locking (2PL)

**Two-Phase Locking** là protocol quản lý locks theo 2 giai đoạn:

```
Phase 1 - Growing (Tăng):
  → Chỉ ACQUIRE locks
  → Không release bất kỳ lock nào

Phase 2 - Shrinking (Giảm):
  → Chỉ RELEASE locks
  → Không acquire thêm lock nào mới

Quy tắc vàng: Một khi đã release, không acquire nữa!
```

### Ví dụ 2PL với Booking System

```sql
-- Phase 1: Acquire locks
BEGIN;
SELECT * FROM seats WHERE id = 14 FOR UPDATE;   -- ← Acquire X-Lock (Phase 1)
-- Kiểm tra seat có available không
-- Thực hiện business logic

-- Vẫn trong Phase 1: Acquire thêm locks nếu cần
UPDATE seats SET is_booked = 1, name = 'Hussein' WHERE id = 14;

-- Phase 2: Release locks (khi COMMIT/ROLLBACK)
COMMIT;  -- ← Release X-Lock (Phase 2)
```

### Vì sao 2PL đảm bảo Serializability?

```
Không có 2PL:
  T1 acquire A, release A, acquire B
  T2 có thể acquire A ở giữa → Interleaving phức tạp

Có 2PL:
  T1 acquire A, acquire B, release A, release B
  → Không có "gaps" trong lock acquisition
  → Execution history tương đương serial execution
```

---

## SELECT FOR UPDATE - Row-Level Exclusive Lock

```sql
-- Cú pháp
SELECT * FROM table WHERE condition FOR UPDATE;

-- Tương đương với: Acquire X-Lock ngay khi SELECT
-- Giữ lock cho đến khi COMMIT/ROLLBACK

-- Ví dụ: Booking seat an toàn
BEGIN;
SELECT * FROM seats WHERE id = 14 AND is_booked = 0 FOR UPDATE;
-- Nếu có result: seat available, và bây giờ bị lock bởi transaction này
-- Nếu ai khác cũng SELECT FOR UPDATE id=14: HỌ SẼ BLOCK!

UPDATE seats SET is_booked = 1, name = 'Alice' WHERE id = 14;
COMMIT;
-- Lock released, người kia unblock và thấy seat đã booked
```

### Các biến thể khác

```sql
-- FOR SHARE: Chỉ Shared Lock (block updates, allow reads)
SELECT * FROM seats WHERE id = 14 FOR SHARE;

-- FOR UPDATE SKIP LOCKED: Bỏ qua locked rows (không block)
SELECT * FROM seats WHERE is_booked = 0 FOR UPDATE SKIP LOCKED LIMIT 1;
-- → Useful cho queue processing: nhiều workers không tranh nhau

-- FOR UPDATE NOWAIT: Fail ngay nếu bị block
SELECT * FROM seats WHERE id = 14 FOR UPDATE NOWAIT;
-- → Trả về error ngay thay vì chờ (tốt cho UX)
```

---

## Ưu và Nhược điểm

```
Ưu điểm của Locks:
  ✅ Đảm bảo Consistency (không dirty/phantom reads với đúng isolation)
  ✅ Đảm bảo Serializable execution
  ✅ Phù hợp với banking, booking, inventory systems

Nhược điểm của Locks:
  ❌ Giảm Concurrency (nhiều người chờ nhau)
  ❌ Deadlock risk
  ❌ Lock overhead (database phải maintain lock table)
  ❌ Blocking UX (user phải chờ)

Thực tế:
  Bank of America đôi khi không nhận giao dịch lúc nửa đêm
  → Họ đang chạy batch reporting với shared locks
  → Không ai có thể acquire exclusive lock để deposit/withdraw
```

---

## Pessimistic vs Optimistic Locking

```
Pessimistic Locking (PostgreSQL, MySQL mặc định):
  "Luôn assume có conflict → Lấy lock trước"
  → SELECT FOR UPDATE
  → Block ngay từ đầu
  → Tốt khi: conflict thường xảy ra

Optimistic Locking (NoSQL, một số ứng dụng):
  "Assume không có conflict → Chỉ kiểm tra lúc commit"
  → Thêm version column
  → UPDATE WHERE version = ? → Fail nếu version changed
  → Retry nếu fail
  → Tốt khi: conflict hiếm

Ví dụ Optimistic:
  ALTER TABLE accounts ADD COLUMN version INTEGER DEFAULT 0;
  
  -- Read
  SELECT balance, version FROM accounts WHERE id = 1;
  -- Got: balance=100, version=5
  
  -- Update (chỉ thành công nếu version chưa thay đổi)
  UPDATE accounts 
  SET balance = 200, version = 6
  WHERE id = 1 AND version = 5;
  -- Nếu rows_affected = 0: Ai đó đã modify → Retry!
```

---

**Tiếp theo:** 02-double-booking-va-pagination.md →

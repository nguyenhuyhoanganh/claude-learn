# Phase 18: ACID - Ôn Tập và Chi Tiết Triển Khai

> Section này là tổng hợp từ các bài giảng archived (phiên bản cũ) của khóa học.
> Nội dung ACID chi tiết đã có ở Phase 1-5. File này tập trung vào
> các góc độ bổ sung về IMPLEMENTATION.

## ACID - Nhắc Lại Nhanh

```
A - Atomicity:    All or nothing (tất cả hoặc không có gì)
C - Consistency:  Data luôn hợp lệ (không vi phạm constraints)
I - Isolation:    Transactions không ảnh hưởng nhau
D - Durability:   Committed data không bao giờ mất
```

---

## Transaction: Unit of Work

```sql
-- Ví dụ chuyển tiền: 2 queries = 1 transaction

BEGIN;

-- Query 1: Kiểm tra và trừ tiền account 1
UPDATE accounts SET balance = balance - 100 
WHERE id = 1 AND balance >= 100;

-- Query 2: Cộng tiền account 2
UPDATE accounts SET balance = balance + 100 
WHERE id = 2;

COMMIT;

-- Nếu COMMIT: cả 2 thay đổi được lưu vĩnh viễn
-- Nếu ROLLBACK / crash: cả 2 thay đổi được hủy bỏ
```

---

## Atomicity: All-or-Nothing

### Tại sao cần Atomicity?

```
KHÔNG có Atomicity:
  1. UPDATE account_1: balance 1000 → 900  ← ghi xuống disk
  2. DATABASE CRASH!
  3. Restart database
  4. account_1 = 900, account_2 = 500 (vẫn vậy)
  
  Kết quả: $100 bốc hơi! Ai chịu trách nhiệm?

CÓ Atomicity:
  1. UPDATE account_1: balance 1000 → 900  ← ghi vào WAL/memory
  2. DATABASE CRASH!
  3. Restart database
  4. Database phát hiện: transaction chưa commit, đang chạy
  5. ROLLBACK tự động: account_1 = 1000 (phục hồi)
  
  Kết quả: Nhất quán, không mất tiền
```

### Rollback Time - Vấn đề thực tế

```
Long transaction (1 giờ chạy) → crash:
  Database restart phải ROLLBACK tất cả thay đổi
  → Rollback có thể mất > 1 giờ!
  → Database "không khởi động được" trong thời gian đó
  
Best practice:
  ❌ Transaction dài hàng giờ
  ✅ Transaction ngắn, commit nhanh
  ✅ Chia nhỏ batch operations
```

---

## Triển khai Atomicity: Write Strategy

### Strategy 1: Write TRƯỚC khi commit (Optimistic Write)

```
Databases: SQL Server, một số NoSQL

Queries trong transaction:
  UPDATE table1 ... → ghi NGAY xuống DISK
  INSERT table2 ... → ghi NGAY xuống DISK
  UPDATE table3 ... → ghi NGAY xuống DISK
  
COMMIT:
  → Chỉ ghi 1 bit: "transaction X: committed"
  → Cực nhanh!

ROLLBACK:
  → Phải go back và UNDO tất cả changes trên disk
  → Chậm! (đặc biệt nếu nhiều changes)

Đặc điểm:
  ✅ Commit rất nhanh
  ❌ Rollback chậm
  ❌ Restart sau crash có thể chậm (phải undo uncommitted)
```

### Strategy 2: Write vào MEMORY, flush khi commit (Deferred Write)

```
Databases: Postgres, nhiều RDBMS khác

Queries trong transaction:
  UPDATE table1 ... → ghi vào BUFFER (RAM)
  INSERT table2 ... → ghi vào BUFFER (RAM)
  UPDATE table3 ... → ghi vào BUFFER (RAM)
  
COMMIT:
  → Flush tất cả changes từ RAM → DISK (WAL first)
  → Chậm hơn nếu nhiều changes

ROLLBACK:
  → Discard buffer (free RAM)
  → Cực nhanh!

Đặc điểm:
  ✅ Rollback cực nhanh
  ✅ Query execution nhanh (write to RAM)
  ❌ Commit có thể chậm nếu nhiều changes
```

### WAL (Write Ahead Log) - Chìa khóa của cả 2 strategies

```
WAL = Append-only log ghi TRƯỚC khi thực sự modify data

Format WAL entry:
  [LSN][TransactionID][Type][TableID][RowID][OldValue][NewValue]

Quá trình:
  1. Ghi vào WAL: "T1 UPDATE account_1: 1000→900"
  2. Thực hiện thay đổi thực tế (memory/disk)
  3. Commit: Ghi WAL commit record

Khi crash và restart:
  1. Đọc WAL từ sau checkpoint gần nhất
  2. REDO: Replay committed transactions
  3. UNDO: Rollback uncommitted transactions
  
WAL đảm bảo:
  → Không mất data đã commit (Durability)
  → Có thể undo uncommitted (Atomicity)
```

---

## Consistency: Data Không Bao Giờ Invalid

```
Database Constraints:
  NOT NULL, UNIQUE, FOREIGN KEY, CHECK

VÍ DỤ:
  accounts.balance CHECK (balance >= 0)
  
  Transaction: transfer $1500 từ account có $1000:
    UPDATE accounts SET balance = balance - 1500 WHERE id=1;
    → balance = -500 → CHECK constraint FAILS!
    → Database tự động ROLLBACK!
    
Consistency ≠ chỉ về data trong DB:
  → Cũng về "application-level invariants"
  → VD: "Tổng số tiền trong hệ thống không đổi"
  → Database không tự enforce điều này
  → Application code phải đảm bảo
```

---

## Isolation: Transactions Không Ảnh Hưởng Nhau

### Isolation Levels (nhắc lại)

```
READ UNCOMMITTED:
  Đọc được data chưa commit
  → Dirty reads, Non-repeatable reads, Phantom reads
  
READ COMMITTED (default PostgreSQL):
  Chỉ đọc committed data
  → Non-repeatable reads, Phantom reads
  
REPEATABLE READ (default MySQL):
  Đọc consistent snapshot trong transaction
  → Phantom reads có thể xảy ra (MySQL fix bằng gap locks)
  
SERIALIZABLE:
  Hoàn toàn isolated như chạy tuần tự
  → Tốt nhất về correctness, kém nhất về performance
```

---

## Durability: Committed Data Không Bao Giờ Mất

### WAL + Checkpointing

```
Đảm bảo Durability:

1. WAL ghi trước khi commit:
   → Ngay cả khi crash GIỮA commit, WAL có đủ info để redo

2. Checkpoint:
   → Định kỳ flush buffer → disk
   → Ghi checkpoint record vào WAL
   → Restart chỉ cần replay WAL từ checkpoint

3. fsync():
   → Đảm bảo WAL thực sự đến physical storage
   → Không chỉ OS buffer cache
   → Postgres: fsync = on (default, không tắt!)

Tại sao KHÔNG được tắt fsync?
  fsync=off → crash có thể corrupt database hoàn toàn!
  Không phải "data mất một ít" mà là "database corrupted"
```

### Durability trong Cloud

```
Cloud database durability:
  AWS RDS: Multi-AZ synchronous replication
  → Commit chỉ succeed khi CẢ PRIMARY và STANDBY nhận được data
  → Không phụ thuộc vào 1 disk

  Aurora: 6 copies across 3 Availability Zones
  → Commit succeed khi 4/6 copies confirm
  → Cực kỳ durable

  Tradeoff: Nhiều replicas → commit latency cao hơn
```

---

## Quick Reference: ACID Pitfalls

```
Lỗi thường gặp:

1. Transaction quá dài:
   ❌ BEGIN; ... (1000 queries) ... COMMIT;
   ✅ Chia thành nhiều transactions nhỏ
   ✅ Dùng batch processing với checkpoints

2. Bỏ qua transaction cho operations quan trọng:
   ❌ UPDATE balance WHERE id=1;  -- không có transaction
       UPDATE balance WHERE id=2;  -- nếu crash ở đây?
   ✅ BEGIN; UPDATE...; UPDATE...; COMMIT;

3. Giả sử committed sau query thành công:
   ❌ if row_affected == 1: assume_success()
   ✅ Chỉ success sau COMMIT không có error

4. Không handle rollback ở application:
   ❌ try: db.execute(); except: log_error()
   ✅ try: db.execute(); except: db.rollback(); raise

5. Tắt fsync để tăng performance:
   ❌ fsync=off  -- NGUY HIỂM với production!
   ✅ Dùng unlogged tables hoặc fsync=on + SSD nhanh

6. Isolation level quá thấp:
   ❌ READ UNCOMMITTED cho financial data
   ✅ REPEATABLE READ hoặc SERIALIZABLE cho banking
```

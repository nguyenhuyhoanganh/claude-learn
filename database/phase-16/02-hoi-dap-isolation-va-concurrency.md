# Bài 2: Hỏi Đáp - Isolation Levels và Concurrency

## Giới thiệu

Các câu hỏi về isolation levels là phổ biến nhất và hay bị hiểu nhầm. Bài này giải đáp chi tiết các câu hỏi thực tế từ developers.

---

## Câu hỏi 1: Snapshot Isolation vs Repeatable Read - Khác gì nhau?

### Lý thuyết vs Thực tế PostgreSQL

```
Lý thuyết ISO SQL (4 isolation levels):
  1. Read Uncommitted
  2. Read Committed
  3. Repeatable Read (vẫn có Phantom Reads)
  4. Serializable

Thực tế PostgreSQL:
  - Repeatable Read = Snapshot Isolation (không có Phantom Reads!)
  - PostgreSQL "phá quy tắc" vì performance reasons
  - Mọi row đều có version (xmin/xmax) → Snapshot miễn phí
```

### Phantom Reads: Lý thuyết vs PostgreSQL

```sql
-- Scenario: Phantom Reads theo lý thuyết ISO

-- Transaction 1 (Repeatable Read):
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT COUNT(*) FROM orders WHERE amount > 1000;
-- → 50 rows

-- Transaction 2 (concurrent):
BEGIN;
INSERT INTO orders (user_id, amount) VALUES (99, 1500);  -- amount > 1000!
COMMIT;

-- Transaction 1 (continues):
SELECT COUNT(*) FROM orders WHERE amount > 1000;
-- Lý thuyết ISO: → 51 rows (phantom read!)
-- PostgreSQL: → 50 rows (snapshot isolation prevents this!)
```

**Tại sao PostgreSQL không có Phantom Reads?**

```
PostgreSQL Repeatable Read implementation:
  - Mỗi transaction có snapshot_id = transaction start time
  - Mọi row được tag với xmin (transaction created it)
  - Khi đọc: Chỉ thấy rows với xmin ≤ snapshot_id

  Transaction 1 starts at snapshot_id = 100
  Transaction 2 inserts row với xmin = 101

  Transaction 1 sees: rows với xmin ≤ 100
  → Row mới (xmin=101) bị lọc ra!
  → Không có Phantom Read!

Đây là Snapshot Isolation - PostgreSQL implement Repeatable Read
bằng MVCC thay vì locks.
```

### Snapshot Isolation trong các Database khác

```
Database vs Isolation Implementation:
  PostgreSQL: Repeatable Read = Snapshot (MVCC, no locks)
  MySQL InnoDB: Repeatable Read = Snapshot (MVCC, gap locks)
  Oracle: Default = Read Committed, có option Serializable
  SQL Server: Snapshot Isolation là option riêng biệt

→ "Repeatable Read" nghĩa khác nhau tùy database!
→ Kiểm tra documentation của DB bạn đang dùng.
```

---

## Câu hỏi 2: Tất cả Isolation Levels - Giải thích Chi Tiết

### Read Committed (Default trong PostgreSQL, Oracle)

```
Behavior: Mỗi query thấy mọi thứ đã COMMIT trước khi query đó bắt đầu.
         (Không phải trước khi transaction bắt đầu)

Timeline:
  T=0: Transaction 1 starts (Read Committed)
  T=1: Transaction 1: SELECT salary FROM emp WHERE id=5  → 50,000
  T=2: Transaction 2: UPDATE emp SET salary=60,000 WHERE id=5; COMMIT
  T=3: Transaction 1: SELECT salary FROM emp WHERE id=5  → 60,000 (!)
  
→ Non-repeatable read! (same query, different result)
→ Điều này được chấp nhận trong Read Committed

Use case:
  - Hầu hết web applications (default)
  - Khi bạn muốn thấy data "fresh" nhất
  - Không cần consistency trong 1 transaction
```

### Repeatable Read / Snapshot (PostgreSQL)

```
Behavior: Mỗi transaction thấy snapshot của data tại thời điểm START transaction.
         Mọi thay đổi sau đó (dù commit) đều không visible.

Timeline:
  T=0: Transaction 1 starts (Repeatable Read), snapshot = T0
  T=1: Transaction 1: SELECT salary FROM emp WHERE id=5  → 50,000
  T=2: Transaction 2: UPDATE emp SET salary=60,000 WHERE id=5; COMMIT
  T=3: Transaction 1: SELECT salary FROM emp WHERE id=5  → 50,000 (unchanged!)
  T=4: Transaction 1 COMMIT
  T=5: New transaction: SELECT salary → 60,000

→ Repeatable! Không thấy ngoài thay đổi
→ Phù hợp cho reports và analytics trong một transaction

Cảnh báo:
  Nếu Transaction 1 UPDATE salary, và T2 cũng UPDATE salary:
  T1's update thành công, T2's update sẽ conflict!
  → T2 có thể bị rollback (serialization anomaly)
```

### Serializable

```
Behavior: Kết quả giống như transactions chạy tuần tự (một sau một),
         dù thực tế chúng chạy đồng thời.

Dùng SSI (Serializable Snapshot Isolation) trong PostgreSQL:
  - Không block transactions như SELECT FOR UPDATE
  - Detect conflicts và fail conflicting transaction

Use case: Hospital example
  Doctor A và Doctor B cùng lúc muốn off shift
  Rule: Phải có ít nhất 1 doctor on shift
  
  Transaction A: SELECT COUNT(*) WHERE on_shift=true → 2 (A và B)
  Transaction B: SELECT COUNT(*) WHERE on_shift=true → 2 (A và B)
  Transaction A: UPDATE doctor SET on_shift=false WHERE id=A
  Transaction B: UPDATE doctor SET on_shift=false WHERE id=B
  
  Với Serializable: Một trong hai sẽ FAIL (serialization error)
  → Ứng dụng phải retry
```

---

## Câu hỏi 3: Serializable vs SELECT FOR UPDATE - Khi nào dùng gì?

### SELECT FOR UPDATE (Pessimistic Locking)

```sql
-- Pattern: Lock trước khi đọc
BEGIN;
SELECT * FROM doctor WHERE on_shift = true FOR UPDATE;
-- → Lock tất cả rows matching WHERE clause
-- → Transaction khác muốn UPDATE những rows này sẽ BLOCK

-- Kiểm tra điều kiện
IF count_on_shift > 1 THEN
    UPDATE doctor SET on_shift = false WHERE id = :my_id;
END IF;

COMMIT;
-- → Lock được giải phóng
```

```
Ưu điểm SELECT FOR UPDATE:
  ✅ Đơn giản, dễ hiểu
  ✅ Transaction không bao giờ fail (chỉ wait)
  ✅ Predictable: Biết chính xác khi nào lock được release

Nhược điểm:
  ❌ Blocking: Các transactions khác phải chờ
  ❌ Deadlock nguy cơ (nếu lock nhiều rows theo thứ tự khác nhau)
  ❌ Throughput thấp hơn với nhiều concurrent users
```

### Serializable Isolation (Optimistic Locking)

```sql
-- PostgreSQL Serializable:
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT COUNT(*) FROM doctor WHERE on_shift = true;
-- Không lock, chỉ "ghi nhớ" những gì đã đọc

UPDATE doctor SET on_shift = false WHERE id = :my_id;

COMMIT;
-- Tại thời điểm COMMIT, database kiểm tra:
-- Có ai khác đọc/ghi những rows mình đã đọc không?
-- Nếu có conflict: ROLLBACK với error "could not serialize"
-- Application phải catch error và retry!
```

```
Ưu điểm Serializable:
  ✅ Non-blocking (transactions không chờ nhau)
  ✅ Higher throughput khi conflict ít xảy ra
  ✅ Automatic detection của complex anomalies

Nhược điểm:
  ❌ Transactions có thể FAIL (cần retry logic)
  ❌ Phức tạp hơn cho application
  ❌ Overhead của conflict detection
```

### Khi nào dùng gì?

```
SELECT FOR UPDATE phù hợp khi:
  ✅ Bạn kiểm soát được scope của operations
  ✅ Transactions ngắn (< 1 giây)
  ✅ Concurrent conflicts thường xuyên
  ✅ Simple operations (1-2 rows)
  ✅ Team không muốn handle retry logic

Serializable phù hợp khi:
  ✅ Concurrent conflicts hiếm
  ✅ Long-running transactions
  ✅ Complex business logic (nhiều reads, nhiều writes)
  ✅ Application đã có retry mechanism

Khuyến nghị thực tế:
  SELECT FOR UPDATE: Đơn giản hơn, ít bug hơn, ưu tiên trước
  Serializable: Khi performance quan trọng và conflict thực sự hiếm
```

---

## Câu hỏi 4: Có cần Transaction khi chỉ READ không?

**Ngắn gọn:** Đôi khi CÓ, nhưng thường KHÔNG cần thiết.

### Khi READ không cần Transaction

```sql
-- Simple read: Không cần BEGIN/COMMIT
SELECT * FROM products WHERE category = 'electronics';

-- Equivalent với:
BEGIN;
SELECT * FROM products WHERE category = 'electronics';
COMMIT;

-- Cả hai đều chạy ở Read Committed isolation (default)
-- Không có sự khác biệt nào với single read
```

### Khi READ CẦN Transaction

```sql
-- Scenario: Consistent view qua nhiều queries
BEGIN ISOLATION LEVEL REPEATABLE READ;

-- Query 1: Lấy tổng orders
SELECT COUNT(*) FROM orders;  -- → 1000

-- (Concurrent transaction tạo thêm 50 orders)

-- Query 2: Lấy tổng amount
SELECT SUM(amount) FROM orders;
-- Với transaction: SUM tính trên cùng snapshot với COUNT
-- Không có transaction: SUM có thể tính trên 1050 orders!

COMMIT;
-- → Consistent! COUNT và SUM đều dùng snapshot t=0
```

```
Cần transaction READ khi:
  - Cần consistency qua nhiều queries (reports, analytics)
  - Đang JOIN nhiều bảng và cần consistent snapshot
  - Dùng cursor (cursor phải trong transaction)
  - Một phần của business logic cần atomic read

Không cần khi:
  - Single query (implicit transaction anyway)
  - Data không change trong thời gian bạn query
  - Eventual consistency acceptable
```

---

## Câu hỏi 5: Cùng một Database Connection cho nhiều Clients?

**Câu hỏi:** Tại sao cần Connection Pool? Tại sao không dùng 1 connection cho tất cả?

### Vấn đề với 1 Connection

```
TCP là bidirectional stream, không phải request-response:

Client → [Query A][Query B] → Database (qua TCP)
                              Database xử lý A và B
Client ← [Result B][Result A] ← Database (B nhanh hơn!)

Client nhận Result B trước A:
  Làm sao biết Result B là response cho Query B không phải A?
  TCP KHÔNG tag data với query ID!
  → Application có thể nhận WRONG results!

→ Đây là bug cực kỳ nguy hiểm và khó debug!
```

### Connection Pool - Đúng cách

```javascript
// Connection Pool Pattern
const { Pool } = require('pg');

const pool = new Pool({
    host: 'localhost',
    database: 'myapp',
    max: 20,        // Tối đa 20 connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Mỗi query lấy 1 connection từ pool
async function getUser(id) {
    const client = await pool.connect();  // Lấy 1 connection
    try {
        const result = await client.query(
            'SELECT * FROM users WHERE id = $1', [id]
        );
        return result.rows[0];
    } finally {
        client.release();  // LUÔN trả connection về pool!
    }
}
```

```
Connection Pool đảm bảo:
  - Mỗi query chạy trên 1 connection riêng
  - 1 connection tại 1 thời điểm chỉ có 1 request
  - No query mixing, no wrong results
  - Connections được reuse (tiết kiệm overhead)
```

### HTTP/2 và tương lai với QUIC

```
Giải pháp lý tưởng (chưa có): Database protocol dùng multiplexing
  HTTP/2 có streams: Tag mỗi request với stream_id
  QUIC cũng có stream multiplexing
  
  Nếu database dùng QUIC:
    Query A → stream_id=1 → Database
    Query B → stream_id=2 → Database
    Result B ← stream_id=2 ← Database
    Result A ← stream_id=1 ← Database
    → Client biết chính xác Result nào là của Query nào!
    → 1 connection cho tất cả queries! (safe!)
    
Thực tế 2024:
  - PostgreSQL dùng proprietary wire protocol (không phải QUIC)
  - MySQL dùng protocol riêng
  - Connection pool vẫn là solution chuẩn
```

---

**Tiếp theo:** 03-hoi-dap-database-internals.md →

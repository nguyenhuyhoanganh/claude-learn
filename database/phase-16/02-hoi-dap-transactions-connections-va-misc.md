# Bài 2: Hỏi & Đáp - Transactions, Connections và Miscellaneous

## Q1: Read-only Transaction có cần không?

**Câu hỏi:** Khi chỉ đọc data, có cần bọc trong transaction không?

### Lợi ích của Read-only Transaction

```sql
-- Bắt đầu read-only transaction
BEGIN;
SET TRANSACTION READ ONLY;

SELECT * FROM accounts WHERE user_id = 123;
SELECT * FROM transactions WHERE account_id = 456;

COMMIT;
```

### Lý do 1: Bảo vệ code

```
Scenario: Bạn đang gọi nhiều service methods
  readUserData() 
  → readAccountBalance()
  → readTransactionHistory()
  → ... (có 20 methods)
  
  Một method nào đó có thể vô tình UPDATE data
  
  → Read-only transaction sẽ FAIL ngay lập tức!
  → Bạn tìm ra bug sớm hơn
  → Code rõ ràng ý định: "Tôi CHỈ đọc"
```

### Lý do 2: Performance optimization

```
PostgreSQL mặc định behavior:
  → Transaction ID chỉ được gán khi có WRITE đầu tiên
  → Read-only transaction: Không có transaction ID!
  → Tiết kiệm:
    - Không cần acquire transaction ID từ sequence
    - Không cần maintain MVCC metadata
    - Không cần vacuum cleanup sau này

Scale: 100 triệu transactions
  - 50 triệu read-only → Tiết kiệm 50 triệu transaction IDs
  → Significant improvement at scale!
```

### Snapshot Isolation trong Read-only Transaction

```sql
-- Đảm bảo consistent snapshot cho cả transaction
BEGIN;
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET TRANSACTION READ ONLY;

-- Query 1 lúc 12:00:00
SELECT balance FROM accounts WHERE id = 1;  -- Thấy: 1000

-- (Meanwhile: someone updates balance to 1500 and commits)

-- Query 2 lúc 12:00:05
SELECT balance FROM accounts WHERE id = 1;  -- Vẫn thấy: 1000!
-- → REPEATABLE READ đảm bảo nhất quán trong transaction

COMMIT;
```

---

## Q2: Có dùng chung 1 database connection cho nhiều clients không?

**Câu hỏi:** Tại sao không dùng 1 connection duy nhất cho toàn bộ application?

### Vấn đề 1: Concurrency

```
Tình huống: 100 concurrent requests + 1 shared connection

  Request 1: SELECT * FROM orders WHERE user_id = 1
  Request 2: INSERT INTO logs VALUES ('event')
  Request 3: UPDATE inventory SET qty = qty - 1
  ...
  
  → Tất cả 100 requests cạnh tranh 1 TCP connection
  → Serialization: Chỉ 1 query chạy tại một thời điểm
  → Throughput cực thấp
```

### Vấn đề 2: Response Ordering (Nghiêm trọng hơn)

```
TCP là bidirectional stream, không phải request-response!

Timeline:
  Client gửi Query 1 (SELECT users)     → Server
  Client gửi Query 2 (SELECT products)  → Server
  
  Server xử lý Query 2 nhanh hơn → Gửi Response 2 trước
  Client nhận Response 2...
  
  Câu hỏi: Client biết Response 2 là cho Query 2 hay Query 1?
  
  → KHÔNG CÓ TAGGING TRONG TCP!
  → User 1 có thể nhận kết quả của User 2!
  → Data corruption / security breach!
```

```javascript
// BAD: Share single connection
const sharedConn = await createConnection(config);

app.get('/users', async (req, res) => {
    const result = await sharedConn.query('SELECT * FROM users');
    res.json(result.rows);  // Có thể nhận kết quả của /products!
});

app.get('/products', async (req, res) => {
    const result = await sharedConn.query('SELECT * FROM products');
    res.json(result.rows);  // Có thể nhận kết quả của /users!
});

// GOOD: Connection Pool
const pool = new Pool({ max: 10 });

app.get('/users', async (req, res) => {
    // Pool cấp riêng 1 connection, execute, return
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);  // Đảm bảo đúng kết quả
});
```

### Connection Pool: Best Practice

```javascript
const pool = new Pool({
    max: 10,                    // Max connections
    idleTimeoutMillis: 30000,   // Đóng idle connections sau 30s
    connectionTimeoutMillis: 2000, // Error nếu không lấy được conn trong 2s
});

// 1 query = 1 connection từ pool
async function getUser(id) {
    const result = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [id]
    );
    return result.rows[0];
}
// Connection tự động return về pool sau khi query xong!
```

---

## Q3: UUID vs Sequential ID - Nên dùng cái nào?

**Câu hỏi:** UUID hay AUTO_INCREMENT integer cho Primary Key?

### UUID: Pros và Cons

```
UUID (Universally Unique Identifier):
  - 128 bits = 16 bytes (native binary)
  - Hoặc 36 chars khi lưu dưới dạng string: "550e8400-e29b-41d4-a716-446655440000"

Pros:
  ✅ Globally unique (client tự generate, không cần DB)
  ✅ Không lộ business data (số records, growth rate)
  ✅ Merge data từ nhiều databases dễ dàng
  ✅ Microservices: Mỗi service generate UUID độc lập

Cons:
  ❌ 16 bytes (min) vs 8 bytes (BIGINT) = 2x larger primary key
  ❌ String format: 36 bytes = 4.5x larger
  ❌ Random = Random I/O → Cache miss nhiều hơn
  ❌ Bloated secondary indexes (PK value copied vào mỗi secondary index)
```

### Sequential Integer: Pros và Cons

```
BIGSERIAL / AUTO_INCREMENT:
  - 8 bytes
  - Sequential: 1, 2, 3, 4, 5...

Pros:
  ✅ Nhỏ gọn (8 bytes)
  ✅ Sequential inserts = Leaf page luôn hot trong cache
  ✅ Range queries hiệu quả (WHERE id BETWEEN 100 AND 200)
  ✅ Secondary indexes nhỏ hơn (8 byte PK)

Cons:
  ❌ Predictable (attacker có thể đoán /users/1, /users/2...)
  ❌ Cần central sequence generator (bottleneck ở scale lớn)
  ❌ Khó merge data từ nhiều databases
```

### UUID v7: Compromise tốt nhất

```
UUID v7 (mới, 2022):
  - 128 bits như UUID v4
  - Nhưng BẮT ĐẦU bằng millisecond timestamp!
  - Sequential trong cùng millisecond
  
  Format: [48-bit timestamp][4-bit version][12-bit seq][62-bit random]
  
  Lợi ích so với UUID v4:
  ✅ Chronologically sortable (new > old)
  ✅ Sequential inserts within same ms → Fewer random I/Os
  ✅ Still globally unique
  
  So với INTEGER:
  ❌ Vẫn 16 bytes (2x larger)
  ❌ Vẫn chậm hơn sequential integer một chút
```

### Decision Framework

```
Dùng UUID khi:
  → Microservices (nhiều services insert vào cùng table)
  → Data từ nhiều nguồn cần merge
  → Public API (không muốn lộ sequential IDs)
  → Event sourcing, distributed systems

Dùng Sequential Integer khi:
  → Single service, single writer
  → Maximum write/read performance cần thiết
  → Internal IDs (không expose ra ngoài)
  → Large scale với nhiều secondary indexes
```

---

## Q4: Cần Transaction khi chỉ UPDATE không?

**Câu hỏi:** Nếu chỉ có 1 UPDATE statement, có cần explicit transaction không?

### Single Statement = Implicit Transaction

```sql
-- Statement đơn lẻ TỰ ĐỘNG có implicit transaction
UPDATE accounts SET balance = balance - 100 WHERE id = 1;

-- PostgreSQL tự làm:
-- BEGIN;
-- UPDATE accounts SET balance = balance - 100 WHERE id = 1;
-- COMMIT;  ← Auto commit nếu thành công

-- Không khác gì:
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;
```

### Khi nào cần explicit Transaction?

```sql
-- NEED explicit transaction: Multiple related statements
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;  -- Debit
UPDATE accounts SET balance = balance + 100 WHERE id = 2;  -- Credit
COMMIT;
-- → Nếu statement 2 fail: Cả 2 đều rollback (atomicity!)

-- KHÔNG cần: Single statement
UPDATE users SET last_login = NOW() WHERE id = 123;
-- → Auto transaction, implicit commit
```

---

## Q5: Tại sao UPDATE trong PostgreSQL update tất cả indexes?

**Câu hỏi:** Tôi chỉ update 1 column, tại sao tất cả indexes đều bị update?

### PostgreSQL: MVCC qua Copy-on-Write (HOT Update)

```
PostgreSQL không update row tại chỗ!
  
UPDATE users SET email = 'new@email.com' WHERE id = 1;

Bước 1: Tạo row MỚI với giá trị mới
  [id=1, name="Alice", email="new@email.com"] ← Row mới
  
Bước 2: Mark row CŨ là deleted (xmax = current txn)
  [id=1, name="Alice", email="old@email.com"] ← Invisible sau commit

Bước 3: Update ALL indexes để trỏ đến row mới
  → Primary index: PK=1 → new_tuple_id
  → Email index: "new@email.com" → new_tuple_id  (add new entry)
  → Name index: "Alice" → new_tuple_id  (update to new pointer)
  → Created_at index: ... → new_tuple_id
  
→ Tất cả indexes phải cập nhật!
→ N indexes = N index updates per UPDATE
```

### HOT Update: Optimization

```
HOT = Heap Only Tuple update
Điều kiện: 
  1. Updated column KHÔNG CÓ INDEX
  2. Row mới nằm trên cùng page với row cũ
  
Khi đủ điều kiện:
  → Chỉ tạo chain trong heap: Old row → New row
  → KHÔNG update secondary indexes!
  → Tiết kiệm N-1 index updates
```

```sql
-- Kiểm tra HOT updates
SELECT n_tup_upd, n_tup_hot_upd
FROM pg_stat_user_tables
WHERE relname = 'users';

-- n_tup_upd: Tổng số updates
-- n_tup_hot_upd: HOT updates (tốt!)
-- HOT ratio = n_tup_hot_upd / n_tup_upd
-- → Cao = Tốt (ít index overhead)
```

---

## Q6: Bitmap Index Scan có giá trị gì?

**Câu hỏi:** Tại sao cần Bitmap Index Scan? Không phải Index Scan là đủ?

### So sánh Index Scan vs Bitmap Index Scan

```
Situation: Query trả về nhiều rows phân tán ngẫu nhiên

Index Scan:
  Tìm row 1 → Fetch page 500 từ disk
  Tìm row 2 → Fetch page 12 từ disk  
  Tìm row 3 → Fetch page 987 từ disk
  Tìm row 4 → Fetch page 12 từ disk  ← Same page! Fetch AGAIN!
  ...
  
  → Nhiều random I/Os
  → Cùng page có thể được fetch nhiều lần!

Bitmap Index Scan:
  Phase 1: Scan index → Build bitmap of PAGES
    "Row cần tìm ở các pages: 12, 500, 987, ..."
    Loại bỏ duplicates → [12, 500, 987]
  
  Phase 2: Sort pages → [12, 500, 987] (sequential order!)
  
  Phase 3: Fetch each page ONCE (sequential, sorted)
    Fetch page 12   → Filter rows needed
    Fetch page 500  → Filter rows needed
    Fetch page 987  → Filter rows needed
  
  → Mỗi page chỉ fetch 1 lần!
  → Sequential access (friendly to disk prefetch)
```

### Khi nào dùng Bitmap vs Index Scan?

```
PostgreSQL planner tự quyết định dựa trên:
  
  Estimated rows returned:
    → Ít rows (1-10): Index Scan (direct fetch)
    → Nhiều rows, nhiều pages: Bitmap Index Scan
    → Rất nhiều rows (> 20% table): Sequential Scan
  
  Page correlation:
    → Data clustered (sequential IDs): Index Scan OK
    → Data scattered (random UUIDs): Bitmap preferred
```

---

## Tóm tắt Best Practices từ Q&A

```
Query Planning:
  1. VACUUM ANALYZE sau khi insert lượng lớn data
  2. Index không dùng → Drop (tiết kiệm write overhead)
  3. Cost trong EXPLAIN không phải milliseconds, chỉ là relative units
  4. Small tables → Sequential scan thường nhanh hơn index scan

Transactions:
  5. Read-only transactions: Code clarity + Performance hint cho DB
  6. Single statement: Implicit transaction (không cần explicit)
  7. Multiple related statements: LUÔN dùng explicit transaction

Connections:
  8. KHÔNG dùng 1 shared connection cho nhiều concurrent requests
  9. Connection Pool: Giải pháp đúng đắn
  10. Mỗi query trong pool: 1 riêng connection

Primary Key:
  11. UUID v4: Random → Random I/Os → Tránh nếu có thể
  12. UUID v7: Sequential timestamp prefix → Better than v4
  13. Sequential INTEGER: Fastest, smallest, best cache locality
  14. Choose based on: Distributed system? → UUID; Single writer? → INTEGER
```

---

**Tiếp theo:** Phase 17 - Database Discussions Summary →

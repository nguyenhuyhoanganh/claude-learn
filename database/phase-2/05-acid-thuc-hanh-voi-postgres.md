# Bài 5: ACID Thực hành với PostgreSQL

## Setup môi trường

Cài đặt PostgreSQL qua Docker (cách đơn giản nhất để thực hành):

```bash
# Khởi động PostgreSQL container
docker run --name pg-acid \
  -e POSTGRES_PASSWORD=postgres \
  -d postgres:13

# Kết nối vào container
docker exec -it pg-acid psql -U postgres
```

## Tạo bảng thực hành

```sql
-- Bảng sản phẩm
CREATE TABLE products (
    pid     SERIAL PRIMARY KEY,
    name    TEXT,
    price   FLOAT,
    inventory INTEGER
);

-- Bảng doanh thu
CREATE TABLE sales (
    sale_id    SERIAL PRIMARY KEY,
    product_id INTEGER,
    price      FLOAT,
    quantity   INTEGER
);

-- Thêm dữ liệu mẫu
INSERT INTO products (name, price, inventory) 
VALUES ('iPhone', 999.99, 100);
```

---

## Demo 1: Atomicity

### Kịch bản: Crash giữa chừng

```sql
-- Terminal 1: Bắt đầu transaction bán hàng
BEGIN;

-- Trừ inventory
UPDATE products 
SET inventory = inventory - 10 
WHERE pid = 1;

-- Kiểm tra: inventory = 90
SELECT inventory FROM products WHERE pid = 1;

-- Mô phỏng crash: Thoát khỏi psql mà KHÔNG commit
-- \q  hoặc Ctrl+C

-- Terminal 1 (sau khi reconnect):
-- Kiểm tra: inventory = 100 (đã rollback tự động!)
SELECT inventory FROM products WHERE pid = 1;
```

**Kết quả:** Database tự động rollback khi connection bị đứt mà chưa commit.

### Transaction đúng cách

```sql
BEGIN;

-- Trừ inventory
UPDATE products 
SET inventory = inventory - 10 
WHERE pid = 1;

-- Ghi nhận sale
INSERT INTO sales (product_id, price, quantity)
VALUES (1, 999.99, 10);

-- Kiểm tra tính nhất quán: inventory + sold = 100
SELECT 
    p.inventory AS remaining,
    COALESCE(SUM(s.quantity), 0) AS sold,
    p.inventory + COALESCE(SUM(s.quantity), 0) AS total
FROM products p
LEFT JOIN sales s ON s.product_id = p.pid
WHERE p.pid = 1
GROUP BY p.inventory;

-- Lưu thay đổi
COMMIT;
```

---

## Demo 2: Isolation Levels

### Setup

```sql
-- Thêm dữ liệu mẫu
INSERT INTO sales (product_id, price, quantity) VALUES
    (1, 999.99, 3),
    (1, 999.99, 2),
    (2, 49.99, 5),
    (2, 49.99, 3);
```

### READ COMMITTED (Default) - Non-Repeatable Read

**Mở hai terminal song song:**

```sql
-- Terminal 1: Bắt đầu report (READ COMMITTED - mặc định)
BEGIN;
SELECT pid, COUNT(*) as sales_count 
FROM sales 
GROUP BY pid;
-- Kết quả: pid=1 → 2 sales, pid=2 → 2 sales

-- Terminal 2: Đồng thời thêm sale mới
INSERT INTO sales (product_id, price, quantity) 
VALUES (1, 999.99, 5);
COMMIT;

-- Terminal 1: Query tiếp theo trong cùng transaction
SELECT pid, price, quantity FROM sales;
-- ⚠️ Giờ thấy thêm 1 row mới của Terminal 2!
-- → Inconsistent report!

COMMIT;
```

### REPEATABLE READ - Fix Non-Repeatable Read

```sql
-- Terminal 1: Dùng REPEATABLE READ
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SELECT pid, COUNT(*) as sales_count 
FROM sales 
GROUP BY pid;
-- Kết quả: pid=1 → 3 sales

-- Terminal 2 vẫn insert và commit như trên

-- Terminal 1: Query lại
SELECT pid, price, quantity FROM sales;
-- ✅ Không thấy row mới! Snapshot được giữ nguyên.

COMMIT;
-- Sau khi commit, query mới sẽ thấy row từ Terminal 2
```

---

## Demo 3: Phantom Read và cách fix

```sql
-- Terminal 1: Bắt đầu trong REPEATABLE READ
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;

SELECT pid, SUM(price) as total 
FROM sales 
GROUP BY pid;
-- pid=1: $2999.97

-- Terminal 2: Insert sale mới
INSERT INTO sales (product_id, price, quantity)
VALUES (1, 15.00, 1);
COMMIT;

-- Terminal 1: SUM lại
SELECT pid, SUM(price) as total 
FROM sales 
GROUP BY pid;
-- PostgreSQL: Vẫn $2999.97 ✅ (không thấy phantom)
-- MySQL: Thấy $3014.97 ⚠️ (phantom read xảy ra!)
COMMIT;
```

**Lưu ý đặc biệt của PostgreSQL:** REPEATABLE READ trong PostgreSQL = Snapshot Isolation → Không có Phantom Read.

---

## Demo 4: Durability

```sql
-- Terminal 1: Commit một thay đổi
BEGIN;
INSERT INTO products (name, price, inventory) 
VALUES ('TV', 3000.00, 10);
COMMIT;

-- Dừng container đột ngột (mô phỏng crash)
-- docker stop pg-acid

-- Khởi động lại
-- docker start pg-acid
-- docker exec -it pg-acid psql -U postgres

-- Kiểm tra: Dữ liệu vẫn còn!
SELECT * FROM products;
-- Thấy TV với id mới ← Durability hoạt động!
```

---

## Demo 5: Serializable và Conflict Detection

### Vấn đề: Concurrent Updates

```sql
-- Tình huống: Hai người cùng update dữ liệu có dependency

-- Tạo bảng test
CREATE TABLE test_serial (value TEXT);
INSERT INTO test_serial VALUES ('A'), ('A'), ('B'), ('B');
```

**Non-Serializable (vấn đề):**

```sql
-- Terminal 1: Đổi A → B
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
UPDATE test_serial SET value='B' WHERE value='A';

-- Terminal 2: Đổi B → A
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
UPDATE test_serial SET value='A' WHERE value='B';

-- Cả hai commit
-- Terminal 1: COMMIT;
-- Terminal 2: COMMIT;

-- Kết quả cuối: A, A, B, B (như ban đầu - không đúng ý định!)
SELECT * FROM test_serial; 
```

**Serializable (đúng):**

```sql
-- Đặt lại dữ liệu
TRUNCATE test_serial;
INSERT INTO test_serial VALUES ('A'), ('A'), ('B'), ('B');

-- Terminal 1:
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
UPDATE test_serial SET value='B' WHERE value='A';

-- Terminal 2:
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
UPDATE test_serial SET value='A' WHERE value='B';

-- Terminal 1: COMMIT; → Thành công
-- Terminal 2: COMMIT; → ERROR!
-- ERROR: could not serialize access due to read/write dependencies
-- → Application phải retry transaction này

-- Retry Terminal 2:
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
UPDATE test_serial SET value='A' WHERE value='B';
COMMIT; -- Thành công (vì không còn conflict)

-- Kết quả đúng: A, A, A, A (tất cả thành A)
SELECT * FROM test_serial;
```

**Quan trọng:** Khi dùng SERIALIZABLE, application phải có **retry logic**:

```python
import psycopg2
from psycopg2 import OperationalError

def execute_with_retry(conn, sql, max_retries=3):
    for attempt in range(max_retries):
        try:
            with conn.cursor() as cur:
                cur.execute("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE")
                cur.execute(sql)
                cur.execute("COMMIT")
                return True
        except OperationalError as e:
            if "could not serialize" in str(e):
                conn.rollback()
                if attempt < max_retries - 1:
                    print(f"Serialization conflict, retrying... (attempt {attempt+1})")
                    continue
            raise
    return False
```

---

## Tổng kết Thực hành

| Demo | Học được gì |
|---|---|
| Demo 1 | Atomicity tự động rollback khi crash |
| Demo 2 | READ COMMITTED cho phép Non-Repeatable Read |
| Demo 3 | PostgreSQL REPEATABLE READ ngăn cả Phantom Read |
| Demo 4 | WAL đảm bảo dữ liệu survive sau crash |
| Demo 5 | SERIALIZABLE cần retry logic trong application |

**Lời khuyên thực tế:**
1. Dùng `READ COMMITTED` cho OLTP thông thường
2. Dùng `REPEATABLE READ` khi tạo reports
3. Dùng `SERIALIZABLE` khi transactions có complex dependencies
4. Luôn giữ transaction ngắn nhất có thể

---

**Tiếp theo:** Phase 3 - Database Internals: Cách dữ liệu được lưu trữ →

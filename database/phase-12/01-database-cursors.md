# Bài 1: Database Cursors

## Vấn đề: Xử lý Dataset Lớn

Khi cần query 1 triệu rows:

```
SELECT * FROM grades WHERE grade BETWEEN 90 AND 100;
-- → Có thể trả về 500,000 rows!

Database phải:
  1. Execute query (index scan, ...)
  2. Compile kết quả
  3. Truyền qua network (TCP)
  4. Client nhận và lưu vào memory

Client application phải:
  → Có đủ memory để chứa 500,000 rows
  → Chờ toàn bộ kết quả về mới bắt đầu xử lý

→ Vừa tốn memory, vừa latency cao!
```

**Giải pháp:** Database Cursors - xử lý dữ liệu từng phần.

---

## Database Cursor là gì?

**Cursor** = Con trỏ trỏ đến một vị trí trong result set, cho phép đọc dữ liệu từng phần.

```
Không có Cursor:
  Client: "Cho tôi tất cả 1 triệu rows"
  Database: [Fetch 1M rows] → [Transfer qua network] → Client nhận 1M rows

Với Cursor:
  Client: "Tạo cursor cho query này"
  Database: [Tạo execution plan] → "Cursor C1 sẵn sàng"
  
  Client: "Cho tôi 100 rows đầu tiên"
  Database: [Fetch 100 rows] → Client nhận 100 rows
  
  Client: "Cho tôi 100 rows tiếp theo"
  Database: [Fetch 100 rows tiếp] → Client nhận 100 rows
  
  ... (cứ thế cho đến hết)
```

---

## Cursor trong SQL - Cú pháp cơ bản

```sql
-- Cursor phải nằm trong Transaction
BEGIN;

-- Khai báo cursor
DECLARE cursor_c CURSOR FOR
    SELECT id, student_name FROM grades
    WHERE grade BETWEEN 90 AND 100;
-- → Database TẠO EXECUTION PLAN, CHƯA thực sự execute query!

-- Fetch từng row
FETCH cursor_c;          -- Lấy 1 row tiếp theo
FETCH 10 FROM cursor_c;  -- Lấy 10 rows tiếp theo
FETCH ALL FROM cursor_c; -- Lấy tất cả rows còn lại

-- Di chuyển cursor
FETCH FIRST FROM cursor_c;  -- Row đầu tiên
FETCH LAST FROM cursor_c;   -- Row cuối cùng (expensive!)
FETCH PRIOR FROM cursor_c;  -- Row trước đó (backward scroll)

-- Đóng cursor và kết thúc transaction
CLOSE cursor_c;
COMMIT;
```

---

## Server-side vs Client-side Cursor

### Client-side Cursor

```
Cách hoạt động:
  1. Client gửi query
  2. Database execute TOÀN BỘ query
  3. Truyền TẤT CẢ results về client
  4. Client lưu vào memory (iterator/cursor object)
  5. Client iterate qua results LOCAL

"Cursor" trong trường hợp này chỉ là abstraction trong code
Tất cả data đã ở phía client rồi!
```

```python
# Python psycopg2 - Client-side cursor (default)
import psycopg2

conn = psycopg2.connect(host='localhost', database='test', user='postgres')

# Client-side cursor: Không có tên
cursor = conn.cursor()  # ← Không có name = client-side

cursor.execute("SELECT * FROM employees")
# → Database execute toàn bộ, truyền về client
# → Tất cả data đang ở phía Python process

rows = cursor.fetchmany(50)  # Lấy 50 rows từ local memory
# Nhanh! Không cần round-trip
```

### Server-side Cursor

```
Cách hoạt động:
  1. Client khai báo cursor với tên
  2. Database tạo execution plan (CHƯA execute)
  3. Cursor "tồn tại" trên server
  4. Client gọi FETCH → Database execute một phần → Trả về
  5. Client xử lý phần nhỏ → Yêu cầu phần tiếp theo
  6. Database memory chứa cursor state

Data vẫn ở phía DATABASE cho đến khi client fetch
```

```python
# Python psycopg2 - Server-side cursor
import psycopg2

conn = psycopg2.connect(host='localhost', database='test', user='postgres')

# Server-side cursor: Có tên
cursor = conn.cursor('my_cursor')  # ← Có name = server-side!

cursor.execute("SELECT * FROM employees")
# → Database chỉ tạo execution plan, CHƯA fetch data

rows = cursor.fetchmany(50)  # Gửi request đến server để fetch 50 rows
# Cần round-trip đến database!
# Nhưng chỉ truyền 50 rows thôi
```

---

## Demo: Client-side vs Server-side Performance

### Setup: Insert 1 Triệu Rows

```python
# insert_1million.py
import psycopg2
import time

conn = psycopg2.connect(
    host='localhost',
    database='hussaindb',
    user='postgres',
    password='postgres',
    port=5432
)

cursor = conn.cursor()

# Insert 1 triệu rows
start = time.time()
for i in range(1_000_000):
    cursor.execute(
        "INSERT INTO employees (id, name) VALUES (%s, %s)",
        (i, f"test_{i}")
    )

conn.commit()
print(f"Inserted 1M rows in {time.time() - start:.2f}s")
cursor.close()
conn.close()
```

### Test Client-side Cursor

```python
# client_cursor.py
import psycopg2
import time

conn = psycopg2.connect(host='localhost', database='hussaindb',
                         user='postgres', password='postgres')

cursor = conn.cursor()  # Client-side (no name)

# Measure: Tạo cursor
t = time.time()
# (Cursor creation is instant, no DB operation)
print(f"Cursor created: {(time.time()-t)*1000:.2f}ms")

# Measure: Execute query (toàn bộ 1M rows về client)
t = time.time()
cursor.execute("SELECT * FROM employees")
print(f"Execute query: {(time.time()-t)*1000:.2f}ms")
# → ~845ms (phải transfer toàn bộ data về client!)

# Measure: Fetch 50 rows (từ local memory)
t = time.time()
rows = cursor.fetchmany(50)
print(f"Fetch 50 rows: {(time.time()-t)*1000:.2f}ms")
# → ~0.01ms (data đã ở local memory!)

cursor.close()
conn.close()
```

```
Output:
  Cursor created:  0.02ms
  Execute query:   845ms  ← Chờ toàn bộ 1M rows về
  Fetch 50 rows:   0.01ms ← Instant (data local)
```

### Test Server-side Cursor

```python
# server_cursor.py
import psycopg2
import time

conn = psycopg2.connect(host='localhost', database='hussaindb',
                         user='postgres', password='postgres')

cursor = conn.cursor('server_cursor')  # Server-side (has name!)

# Measure: Execute query (chỉ tạo execution plan)
t = time.time()
cursor.execute("SELECT * FROM employees")
print(f"Execute query: {(time.time()-t)*1000:.2f}ms")
# → ~3ms! (Chỉ tạo plan, KHÔNG fetch data)

# Measure: Fetch 50 rows (round-trip to server)
t = time.time()
rows = cursor.fetchmany(50)
print(f"Fetch 50 rows: {(time.time()-t)*1000:.2f}ms")
# → ~2ms (network round-trip, nhưng chỉ 50 rows)

# Loop qua nhiều batches
for batch in range(10):
    t = time.time()
    rows = cursor.fetchmany(50)
    print(f"Batch {batch}: {(time.time()-t)*1000:.2f}ms")
# → Mỗi batch ~2ms

cursor.close()
conn.close()
```

```
Output:
  Execute query:  3ms    ← Nhanh! Chỉ tạo plan
  Fetch 50 rows:  2ms    ← Round-trip nhưng nhỏ
  Batch 0:        2ms
  Batch 1:        2ms
  ...
```

---

## So sánh Client-side vs Server-side

```
┌──────────────────┬─────────────────────┬──────────────────────┐
│ Tiêu chí         │ Client-side         │ Server-side          │
├──────────────────┼─────────────────────┼──────────────────────┤
│ Execute time     │ Chậm (transfer all) │ Nhanh (plan only)    │
│ Memory (client)  │ Cao (toàn bộ data)  │ Thấp (từng batch)   │
│ Memory (server)  │ Thấp                │ Cao (giữ cursor)     │
│ Network usage    │ Nhiều (1 lần)       │ Ít (nhiều round-trip)│
│ First row delay  │ Cao (chờ tất cả)    │ Thấp (~3ms)          │
│ Scalability      │ Tốt (stateless)     │ Kém (stateful)       │
│ Web app friendly │ ✅ Có               │ ❌ Không (stateful)   │
│ Batch processing │ ❌ Không hiệu quả   │ ✅ Rất tốt            │
└──────────────────┴─────────────────────┴──────────────────────┘
```

---

## Ưu điểm của Server-side Cursor

```
1. Memory efficiency (client):
   → Không cần load 1M rows vào memory
   → Process 50 rows → Discard → Process tiếp 50 rows
   → Ứng dụng với ít RAM có thể xử lý dataset lớn

2. Streaming:
   → Đọc 50 rows → Stream qua WebSocket → Đọc tiếp 50 rows
   → User thấy data ngay lập tức, không phải chờ tất cả

3. Cancellation:
   → Xử lý được 100K rows → Done → CLOSE cursor → COMMIT
   → Không cần process toàn bộ 1M rows

4. Paging hiệu quả:
   → Mỗi page fetch = 1 FETCH call
   → Không phải re-execute query mỗi page
   → (Nhưng cần giữ connection... xem nhược điểm)
```

---

## Nhược điểm của Server-side Cursor

```
1. Stateful:
   → Cursor gắn với 1 transaction, 1 connection
   → Không chia sẻ được giữa các connections/servers
   
   Vấn đề với REST API (stateless):
     Request 1 → Server A → Tạo cursor
     Request 2 → Server B → Server B không biết cursor!
   
   → Server-side cursors KHÔNG compatible với stateless REST

2. Long-running transactions:
   → Cursor yêu cầu open transaction
   → Transaction chạy lâu = Database overhead
   → Có thể block DDL operations (ALTER TABLE...)
   → Có thể giữ locks lâu hơn cần thiết

3. Cursor leak:
   → Quên CLOSE cursor = Memory leak trên database
   → Nhiều clients leak cursors = Database memory overflow!

4. Server memory usage:
   → Database phải giữ cursor state
   → Nhiều cursors đồng thời = Database memory pressure
```

---

## Khi nào dùng Server-side Cursor?

```
✅ Dùng Server-side khi:
  - Batch processing / ETL jobs
  - Data migration (copy từ DB này sang DB khác)
  - MapReduce trên large dataset
  - Streaming data cho analytics
  - Stored procedures cần iterate qua nhiều rows

❌ Tránh Server-side khi:
  - REST API (stateless)
  - Web requests với nhiều concurrent users
  - Operations không biết khi nào kết thúc
  - Nếu không cẩn thận về cursor lifecycle

✅ Client-side phù hợp hơn cho:
  - Web applications
  - API endpoints
  - Bất kỳ nơi nào cần stateless operations
  - Với điều kiện: WHERE clause hợp lý + LIMIT

Giải pháp thay thế cho web:
  - Keyset pagination (thay vì cursor)
  - LIMIT + WHERE id > :last_id
```

---

## Stored Procedure với Cursor

```sql
-- Ví dụ: Cursor trong stored procedure PostgreSQL (PL/pgSQL)
CREATE OR REPLACE FUNCTION process_high_grades()
RETURNS void AS $$
DECLARE
    grade_record RECORD;
    c_high_grades CURSOR FOR
        SELECT id, student_name, grade
        FROM grades
        WHERE grade >= 90;
BEGIN
    OPEN c_high_grades;
    
    LOOP
        FETCH c_high_grades INTO grade_record;
        EXIT WHEN NOT FOUND;  -- Khi hết rows
        
        -- Xử lý từng row
        UPDATE students
        SET honor_roll = TRUE
        WHERE id = grade_record.id;
        
        -- Log
        INSERT INTO audit_log (action, student_id, grade)
        VALUES ('honor_roll_added', grade_record.id, grade_record.grade);
    END LOOP;
    
    CLOSE c_high_grades;
END;
$$ LANGUAGE plpgsql;
```

---

## Thực tiễn tốt nhất

```
1. Luôn CLOSE cursor sau khi dùng
   → Tránh cursor leak

2. Giữ cursor lifetime ngắn
   → OPEN → FETCH → Process → CLOSE
   → Không giữ cursor mở qua nhiều requests

3. Dùng LIMIT thay vì cursor cho web
   → SELECT * FROM table WHERE id > :cursor ORDER BY id LIMIT 50
   → Stateless, scale tốt, không cần open transaction

4. Batch size hợp lý
   → fetchmany(50) hoặc fetchmany(1000) tùy use case
   → Không quá nhỏ (quá nhiều round-trips)
   → Không quá lớn (defeat the purpose)

5. Monitor cursor count
   → SELECT * FROM pg_cursors;  -- Xem cursors đang mở
   → Alert nếu cursor count cao bất thường
```

---

**Tiếp theo:** Phase 13 - NoSQL Architecture →

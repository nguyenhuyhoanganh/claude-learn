# Bài 2: Cursor Nâng Cao - Patterns và Thực Chiến

## Giới thiệu

Bài trước đã giới thiệu khái niệm cursor. Bài này đi sâu vào các patterns nâng cao: forward-only vs scrollable cursors, cursor-based pagination, ETL patterns, và những bẫy thường gặp trong production.

---

## 1. Cursor Types - Các Loại Cursor

### Forward-only Cursor (mặc định)

```sql
-- Chỉ đi về phía trước
DECLARE c CURSOR FOR SELECT id FROM employees;

FETCH c;      -- Row 1
FETCH c;      -- Row 2
FETCH c;      -- Row 3
-- Không thể quay lại Row 2!
```

### Scrollable Cursor

```sql
-- Có thể di chuyển tự do
DECLARE c SCROLL CURSOR FOR SELECT id FROM employees;

FETCH FIRST FROM c;    -- Row đầu tiên
FETCH LAST FROM c;     -- Row cuối cùng (⚠️ expensive!)
FETCH PRIOR FROM c;    -- Row trước đó
FETCH ABSOLUTE 5 FROM c;  -- Row thứ 5
FETCH RELATIVE -2 FROM c; -- 2 rows trước vị trí hiện tại
```

**Tại sao `FETCH LAST` đắt?**

```
Forward cursor:
  Database biết "page hiện tại" → Fetch tiếp là nhanh

Scrollable FETCH LAST:
  Database phải:
    1. Traverse index/table đến cuối
    2. Hoặc đọc toàn bộ result set vào temp buffer
  → Nhiều I/O hơn!

Khi nào cần FETCH LAST?
  → Hầu như không bao giờ trong production
  → Thay thế bằng: ORDER BY id DESC LIMIT 1
```

---

## 2. Cursor-based Pagination vs Offset Pagination

### Vấn đề với OFFSET Pagination

```sql
-- OFFSET pagination - cách phổ biến nhưng có vấn đề
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 0;   -- Page 1
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 20;  -- Page 2
SELECT * FROM posts ORDER BY created_at DESC LIMIT 20 OFFSET 1000; -- Page 51
```

```
Vấn đề với OFFSET lớn:
  OFFSET 1000 = Database phải:
    1. Scan 1020 rows
    2. Discard 1000 rows đầu
    3. Trả về 20 rows

  O(N) cho mỗi page! Càng về sau càng chậm.
  Instagram cũ: Page cuối mất hàng phút!
```

### Keyset Pagination (Cursor-based)

```sql
-- Keyset pagination - hiệu quả hơn
-- Page 1: Lấy 20 posts đầu
SELECT * FROM posts ORDER BY id DESC LIMIT 20;
-- → Nhận được: posts với id từ 1000 đến 981

-- Page 2: Dùng id nhỏ nhất từ page trước làm "cursor"
SELECT * FROM posts WHERE id < 981 ORDER BY id DESC LIMIT 20;
-- → Database dùng index trực tiếp, O(log N) + O(page_size)!
```

```
So sánh:
┌──────────────────┬──────────────────┬──────────────────────┐
│                  │ OFFSET Pagination│ Keyset Pagination    │
├──────────────────┼──────────────────┼──────────────────────┤
│ Page 1 speed     │ O(log N)         │ O(log N)             │
│ Page 1000 speed  │ O(N)             │ O(log N)             │
│ Consistent data  │ Không (inserts)  │ Có                   │
│ Jump to page X   │ Có               │ Không                │
│ Stateless        │ Có               │ Có (encode cursor)   │
│ Implementation   │ Đơn giản         │ Hơi phức tạp         │
└──────────────────┴──────────────────┴──────────────────────┘
```

### Keyset Pagination trong API

```python
# FastAPI example với keyset pagination
from fastapi import FastAPI, Query
from pydantic import BaseModel
import psycopg2

app = FastAPI()

@app.get("/posts")
async def get_posts(
    cursor: int = None,  # ID của post cuối cùng trong page trước
    limit: int = Query(20, le=100)
):
    conn = psycopg2.connect("...")
    db = conn.cursor()

    if cursor is None:
        # Page đầu tiên
        db.execute(
            "SELECT id, title, created_at FROM posts ORDER BY id DESC LIMIT %s",
            (limit,)
        )
    else:
        # Page tiếp theo: lấy posts có id < cursor
        db.execute(
            "SELECT id, title, created_at FROM posts WHERE id < %s ORDER BY id DESC LIMIT %s",
            (cursor, limit)
        )

    rows = db.fetchall()
    db.close()
    conn.close()

    # Cursor cho page tiếp theo
    next_cursor = rows[-1][0] if rows else None

    return {
        "data": [{"id": r[0], "title": r[1]} for r in rows],
        "next_cursor": next_cursor  # Client dùng để fetch page sau
    }
```

---

## 3. ETL Pattern với Server-side Cursor

**ETL** = Extract, Transform, Load - xử lý và chuyển đổi dữ liệu lớn.

```python
# ETL: Đọc từ Postgres, transform, ghi vào data warehouse
import psycopg2
import psycopg2.extras  # Cho RealDictCursor

def etl_employees_to_warehouse():
    """
    Extract 1M rows từ Postgres
    Transform: tính bonus
    Load: ghi vào data warehouse
    """
    source_conn = psycopg2.connect("host=source_db dbname=prod")
    dest_conn = psycopg2.connect("host=warehouse dbname=dw")

    # Dùng server-side cursor để không load tất cả vào memory
    source_cursor = source_conn.cursor('etl_cursor', cursor_factory=psycopg2.extras.RealDictCursor)
    dest_cursor = dest_conn.cursor()

    try:
        # Execute query - chưa fetch data
        source_cursor.execute("""
            SELECT id, name, salary, department, hire_date
            FROM employees
            WHERE active = TRUE
        """)

        batch_size = 1000
        total_processed = 0

        while True:
            # Fetch 1000 rows mỗi lần
            rows = source_cursor.fetchmany(batch_size)
            if not rows:
                break

            # Transform: tính bonus
            transformed = []
            for row in rows:
                bonus = row['salary'] * 0.1  # 10% bonus
                transformed.append((
                    row['id'],
                    row['name'],
                    row['salary'],
                    bonus,
                    row['department'],
                    row['hire_date']
                ))

            # Load: ghi vào data warehouse
            psycopg2.extras.execute_values(
                dest_cursor,
                """INSERT INTO employee_warehouse
                   (id, name, salary, bonus, department, hire_date)
                   VALUES %s
                   ON CONFLICT (id) DO UPDATE
                   SET salary = EXCLUDED.salary,
                       bonus = EXCLUDED.bonus""",
                transformed
            )
            dest_conn.commit()

            total_processed += len(rows)
            print(f"Processed {total_processed} rows...")

        print(f"ETL complete: {total_processed} rows processed")

    finally:
        source_cursor.close()
        source_conn.commit()
        source_conn.close()
        dest_conn.close()
```

---

## 4. Streaming với WebSocket

```python
# FastAPI WebSocket: Stream query results trực tiếp
from fastapi import FastAPI, WebSocket
import psycopg2
import json

app = FastAPI()

@app.websocket("/stream/employees")
async def stream_employees(websocket: WebSocket):
    await websocket.accept()

    conn = psycopg2.connect("host=localhost dbname=prod")

    # Server-side cursor
    cursor = conn.cursor('stream_cursor')

    try:
        cursor.execute("SELECT id, name, salary FROM employees ORDER BY id")

        batch = 1
        while True:
            rows = cursor.fetchmany(100)
            if not rows:
                break

            # Gửi từng batch qua WebSocket
            await websocket.send_json({
                "batch": batch,
                "rows": [{"id": r[0], "name": r[1], "salary": r[2]} for r in rows]
            })
            batch += 1

        # Báo hiệu kết thúc
        await websocket.send_json({"done": True, "total_batches": batch - 1})

    except Exception as e:
        await websocket.send_json({"error": str(e)})
    finally:
        cursor.close()
        conn.close()
        await websocket.close()
```

---

## 5. Monitoring Cursors

### Xem cursors đang mở trong PostgreSQL

```sql
-- Xem tất cả cursors đang open
SELECT name, statement, is_holdable, is_scrollable, creation_time
FROM pg_cursors;

-- Xem cursors và transaction liên quan
SELECT c.pid, c.query, c.query_start, c.state, cur.name as cursor_name
FROM pg_stat_activity c
JOIN pg_cursors cur ON c.pid = cur.creation_time::text  -- simplified
WHERE cur.name IS NOT NULL;
```

### Alert cho cursor leak

```python
# Monitor script
import psycopg2
import time

def check_cursor_leak(conn, threshold=50):
    """Alert nếu quá nhiều cursors đang mở"""
    cursor = conn.cursor()
    cursor.execute("SELECT count(*) FROM pg_cursors")
    count = cursor.fetchone()[0]
    cursor.close()

    if count > threshold:
        print(f"⚠️  WARNING: {count} cursors open! Possible leak!")
        # Send alert...
    return count
```

---

## 6. Cursor trong các ngôn ngữ/framework khác

### Java (JDBC)

```java
// Java JDBC - fetchSize để kiểm soát kích thước fetch
Connection conn = DriverManager.getConnection(url, user, password);
conn.setAutoCommit(false);  // Cần với server-side cursor

PreparedStatement stmt = conn.prepareStatement(
    "SELECT id, name FROM employees",
    ResultSet.TYPE_FORWARD_ONLY,
    ResultSet.CONCUR_READ_ONLY
);
stmt.setFetchSize(1000);  // Fetch 1000 rows/round-trip (server-side)

ResultSet rs = stmt.executeQuery();
while (rs.next()) {
    int id = rs.getInt("id");
    String name = rs.getString("name");
    // Process...
}
rs.close();
stmt.close();
conn.close();
```

### Go (pgx)

```go
// Go với pgx driver - streaming rows
import (
    "context"
    "github.com/jackc/pgx/v5"
)

func processRows(ctx context.Context, conn *pgx.Conn) {
    rows, err := conn.Query(ctx,
        "SELECT id, name FROM employees ORDER BY id")
    if err != nil {
        panic(err)
    }
    defer rows.Close()

    for rows.Next() {
        var id int
        var name string
        if err := rows.Scan(&id, &name); err != nil {
            panic(err)
        }
        // Process...
    }

    if err := rows.Err(); err != nil {
        panic(err)
    }
}
```

### Node.js (pg)

```javascript
// Node.js với pg driver
const { Client } = require('pg');
const QueryStream = require('pg-query-stream');

const client = new Client({ connectionString: 'postgres://localhost/prod' });
await client.connect();

// Streaming với pg-query-stream
const query = new QueryStream('SELECT id, name FROM employees', [], {
    highWaterMark: 1000  // Buffer size
});

const stream = client.query(query);

stream.on('data', (row) => {
    // Xử lý từng row
    console.log(row.id, row.name);
});

stream.on('end', () => {
    client.end();
    console.log('Done!');
});

stream.on('error', (err) => {
    console.error(err);
    client.end();
});
```

---

## 7. Holdable Cursors

```sql
-- Cursor thông thường: đóng khi transaction kết thúc
BEGIN;
DECLARE c CURSOR FOR SELECT id FROM employees;
FETCH 10 FROM c;
COMMIT;
-- Cursor c bị đóng khi COMMIT!

-- Holdable cursor: tồn tại qua transaction boundaries
BEGIN;
DECLARE c CURSOR WITH HOLD FOR SELECT id FROM employees;
FETCH 10 FROM c;
COMMIT;
-- Cursor c VẪN MỞ sau COMMIT!

FETCH 10 FROM c;  -- Vẫn hoạt động!
CLOSE c;          -- Phải CLOSE thủ công
```

**Cảnh báo về Holdable Cursors:**

```
Holdable cursor:
  + Linh hoạt hơn (không bị gắn với transaction)
  - Server phải "materialize" toàn bộ result set vào disk (temp storage)
  - Chiếm nhiều server resources hơn
  - Phải CLOSE thủ công (nguy cơ leak cao hơn)

Khi nào dùng Holdable cursor?
  → Hầu như không bao giờ trong web apps
  → Chỉ trong batch jobs dài cần persist state qua transactions
```

---

## Tổng kết

```
Chọn strategy phù hợp:

Web API (REST):
  → Keyset pagination (cursor-based URL params)
  → Client-side cursor với LIMIT/OFFSET cho dataset nhỏ
  → KHÔNG dùng server-side cursor

Batch processing / ETL:
  → Server-side cursor với fetchmany(1000)
  → Đảm bảo CLOSE cursor trong finally block
  → Monitor pg_cursors để phát hiện leak

Real-time streaming:
  → Server-side cursor + WebSocket/gRPC streaming
  → Hoặc dùng message queue (Kafka, RabbitMQ)

Large report generation:
  → Server-side cursor để kiểm soát memory
  → Hoặc async job + stream result to S3/file
```

---

**Tiếp theo:** Phase 13 - NoSQL Architecture →

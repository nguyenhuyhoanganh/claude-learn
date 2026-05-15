# Bài 2: Giải quyết Double Booking và Pagination

## Phần 1: Vấn đề Double Booking

### Double Booking là gì?

**Double booking** xảy ra khi 2 users cùng book một seat/resource tại cùng thời điểm, và cả hai đều nghĩ mình đã thành công.

```
Timeline (Race Condition):

T1 (User Alice):  [SELECT seat=15: available] ────────────────── [UPDATE booked=1] [COMMIT]
T2 (User Bob):    [SELECT seat=15: available] [UPDATE booked=1] [COMMIT]

Kết quả:
  seat 15 = booked by Bob (last write wins)
  Alice đã nhận email "Booking successful!" nhưng seat thuộc về Bob!
```

---

### Giải pháp Sai: Chỉ Check Rồi Update

```javascript
// ❌ CẦU TRÚC NGUY HIỂM - Race condition!
async function bookSeat(seatId, userName) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Step 1: Kiểm tra seat có available không
        const result = await client.query(
            'SELECT * FROM seats WHERE id = $1 AND is_booked = 0',
            [seatId]
        );
        
        if (result.rowCount === 0) {
            throw new Error('Seat already booked');
        }
        
        // ← NGUY HIỂM: Khoảng hở giữa check và update!
        //   Transaction khác có thể chen vào đây
        
        // Step 2: Book seat
        await client.query(
            'UPDATE seats SET is_booked = 1, name = $1 WHERE id = $2',
            [userName, seatId]
        );
        
        await client.query('COMMIT');
        return 'Booking successful';
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
```

```
Vấn đề: Check và Update không atomic!

T1 passes check → Switch to T2 → T2 passes check → T2 updates
→ T1 resumes → T1 updates (double booking!)
```

---

### Giải pháp Đúng: SELECT FOR UPDATE

```javascript
// ✅ AN TOÀN: Row-level exclusive lock
async function bookSeat(seatId, userName) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // SELECT FOR UPDATE: Acquire exclusive lock NGAY KHI SELECT
        // Transaction khác sẽ phải CHỜ nếu cũng cố SELECT FOR UPDATE row này
        const result = await client.query(
            'SELECT * FROM seats WHERE id = $1 AND is_booked = 0 FOR UPDATE',
            [seatId]
        );
        
        if (result.rowCount === 0) {
            // Seat đã booked (hoặc không tồn tại)
            await client.query('ROLLBACK');
            return { success: false, message: 'Seat already booked' };
        }
        
        // Bây giờ ta có exclusive lock, an toàn để update
        await client.query(
            'UPDATE seats SET is_booked = 1, name = $1 WHERE id = $2',
            [userName, seatId]
        );
        
        await client.query('COMMIT');  // ← Đây mới release lock
        return { success: true, message: 'Booking successful' };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
```

### Luồng khi có 2 users cùng book:

```
T1 (Alice books seat 15):
  BEGIN
  SELECT seat=15 FOR UPDATE → Acquire X-Lock
  seat available → OK
  UPDATE seat=15, name='Alice'
  COMMIT → Release lock

T2 (Bob books seat 15):
  BEGIN
  SELECT seat=15 FOR UPDATE → BLOCK! (T1 có X-Lock)
  [Waiting...]
  [T1 COMMIT → Lock released]
  [T2 unblocked]
  SELECT seat=15 → is_booked=1 (đã booked bởi Alice)
  rowCount = 0 → Seat already booked!
  ROLLBACK
  
→ Bob nhận thông báo "Seat already booked"
→ KHÔNG có double booking!
```

---

### Giải pháp Alternative: UPDATE trực tiếp + kiểm tra affected rows

```sql
-- Alternative: Chỉ update nếu seat chưa booked
UPDATE seats 
SET is_booked = 1, name = $1 
WHERE id = $2 AND is_booked = 0;  -- ← Điều kiện bảo vệ

-- Kiểm tra số rows bị affected
-- affected_rows = 1: booking thành công
-- affected_rows = 0: seat đã booked rồi
```

```javascript
async function bookSeatAlternative(seatId, userName) {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const result = await client.query(
            `UPDATE seats 
             SET is_booked = 1, name = $1 
             WHERE id = $2 AND is_booked = 0`,
            [userName, seatId]
        );
        
        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Seat already booked' };
        }
        
        await client.query('COMMIT');
        return { success: true, message: 'Booking successful' };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
```

**Tại sao cách này cũng hoạt động:**

```
Khi T1 và T2 cùng chạy UPDATE:
  1. T1 update thành công → Implicit X-Lock trên row
  2. T2 muốn update row → Phải chờ T1 release (implicit 2PL)
  3. T1 commit → Release lock
  4. T2 unblock → Re-evaluate WHERE clause với data mới committed
  5. is_booked = 1 → WHERE fails → affected_rows = 0 → Booking failed

PostgreSQL semantics: Sau khi unblock, query được "re-evaluated"
với committed values (READ COMMITTED behavior)
```

**So sánh 2 giải pháp:**

```
SELECT FOR UPDATE:
  ✅ Explicit, rõ ràng về intent
  ✅ Nhiều business logic có thể thực hiện an toàn trong transaction
  ✅ Consistent behavior trên mọi database
  ❌ Thêm 1 round-trip (SELECT + UPDATE)

UPDATE + check affected_rows:
  ✅ Ít round-trip hơn (chỉ 1 UPDATE)
  ✅ Đơn giản hơn
  ❌ Behavior phụ thuộc vào database và isolation level
  ❌ Khó mở rộng khi cần multi-step business logic
```

**Khuyến nghị:** Dùng `SELECT FOR UPDATE` khi cần rõ ràng và kiểm soát.

---

## Phần 2: SQL Pagination - Offset là Vấn đề

### Cách Pagination Phổ Biến (Và Sai)

```sql
-- Pagination thông thường với OFFSET
SELECT title FROM news
ORDER BY id DESC
LIMIT 10 OFFSET 0;    -- Page 1

SELECT title FROM news
ORDER BY id DESC
LIMIT 10 OFFSET 10;   -- Page 2

SELECT title FROM news
ORDER BY id DESC
LIMIT 10 OFFSET 100;  -- Page 11

SELECT title FROM news
ORDER BY id DESC
LIMIT 10 OFFSET 1000; -- Page 101
```

### Tại sao OFFSET Chậm?

```
OFFSET N = Fetch N rows rồi... Vứt đi!

OFFSET 100:   Fetch 110 rows → Giữ 10     (1.1x work)
OFFSET 1000:  Fetch 1010 rows → Giữ 10    (101x work)
OFFSET 10000: Fetch 10010 rows → Giữ 10   (1001x work)
OFFSET 100000: Fetch 100010 rows → Giữ 10 (10001x work)

→ Thời gian tăng tuyến tính với offset!
```

### EXPLAIN ANALYZE cho thấy vấn đề

```sql
-- Page 1 (OFFSET 0)
EXPLAIN ANALYZE
SELECT title FROM news ORDER BY id DESC LIMIT 10 OFFSET 0;
```

```
Index Scan Backward on news
  Rows fetched: 10
  Time: 0.2ms   ← Nhanh!
```

```sql
-- Page 10001 (OFFSET 100000)
EXPLAIN ANALYZE
SELECT title FROM news ORDER BY id DESC LIMIT 10 OFFSET 100000;
```

```
Index Scan Backward on news
  Rows fetched: 100010   ← Fetch 100,010 rows!
  Rows returned: 10      ← Nhưng chỉ giữ 10
  Time: 620ms            ← Chậm hơn 3000x!
```

### Vấn đề Thứ 2: Duplicate Records

```
User đang ở page 11 (offset 100), đọc được rows 101-110

Trong khi đó: Ai đó INSERT 1 row mới vào bảng

User request page 12 (offset 110):
→ Row cũ số 111 bây giờ bị đẩy xuống vị trí 112
→ Query trả về: rows 111-120 (nhưng user đã thấy row 111!)
→ DUPLICATE ROW xuất hiện!

Ngược lại, nếu có row bị DELETE:
→ Một row có thể bị BỎ QUA (skipped)
```

---

### Giải Pháp: Keyset Pagination (Cursor Pagination)

**Ý tưởng:** Thay vì "bỏ qua N rows", hãy dùng index để tìm điểm bắt đầu.

```sql
-- Keyset Pagination
-- Page 1: Lấy 10 items đầu tiên
SELECT id, title FROM news
ORDER BY id DESC
LIMIT 10;
-- → Returns: [id=1000, id=999, ..., id=991]
-- → Client lưu lại last_id = 991

-- Page 2: Lấy 10 items SAU id=991
SELECT id, title FROM news
WHERE id < 991      -- ← Sử dụng last_id từ page trước
ORDER BY id DESC
LIMIT 10;
-- → Returns: [id=990, id=989, ..., id=981]
-- → Client lưu lại last_id = 981

-- Page N: Cứ thế tiếp tục...
SELECT id, title FROM news
WHERE id < :last_id
ORDER BY id DESC
LIMIT 10;
```

### EXPLAIN ANALYZE: Keyset vs Offset

```sql
-- Keyset Pagination (rất nhanh ngay cả ở page 1000)
EXPLAIN ANALYZE
SELECT id, title FROM news
WHERE id < 500 
ORDER BY id DESC
LIMIT 10;
```

```
Index Scan Backward on news
  Index Cond: (id < 500)
  Rows fetched: 10     ← Chỉ fetch đúng 10 rows!
  Rows returned: 10
  Time: 0.1ms          ← Nhanh như page 1!
```

### Implementation trong API

```javascript
// REST API với Keyset Pagination
app.get('/news', async (req, res) => {
    const { cursor, limit = 10 } = req.query;
    
    let query;
    let params;
    
    if (cursor) {
        // Có cursor: lấy từ sau cursor
        query = `
            SELECT id, title, created_at 
            FROM news 
            WHERE id < $1
            ORDER BY id DESC 
            LIMIT $2
        `;
        params = [cursor, limit];
    } else {
        // Không có cursor: lấy từ đầu
        query = `
            SELECT id, title, created_at 
            FROM news 
            ORDER BY id DESC 
            LIMIT $1
        `;
        params = [limit];
    }
    
    const result = await pool.query(query, params);
    const rows = result.rows;
    
    // Cursor tiếp theo = id của item cuối cùng
    const nextCursor = rows.length > 0 ? rows[rows.length - 1].id : null;
    
    res.json({
        data: rows,
        nextCursor,        // Client dùng để lấy page tiếp theo
        hasMore: rows.length === limit
    });
});
```

```
Request: GET /news
Response: {
    data: [{id: 1000, title: "..."}, ...],
    nextCursor: 991,
    hasMore: true
}

Request: GET /news?cursor=991
Response: {
    data: [{id: 990, title: "..."}, ...],
    nextCursor: 981,
    hasMore: true
}
```

### So sánh OFFSET vs Keyset

```
┌──────────────────┬──────────────────┬──────────────────┐
│ Tiêu chí         │ OFFSET           │ Keyset           │
├──────────────────┼──────────────────┼──────────────────┤
│ Performance      │ O(N) - chậm dần  │ O(1) - hằng số   │
│ Page 1000        │ ~seconds         │ ~ms              │
│ Duplicate risk   │ Có               │ Không            │
│ Skip risk        │ Có (nếu delete)  │ Không            │
│ Jump to page N   │ Dễ (OFFSET=N*10) │ Khó              │
│ Implementation   │ Đơn giản         │ Cần lưu cursor   │
│ Use case         │ Admin panels     │ Infinite scroll  │
│                  │ (low traffic)    │ APIs (high perf) │
└──────────────────┴──────────────────┴──────────────────┘
```

### Khi nào dùng OFFSET?

```
OFFSET vẫn OK khi:
  ✅ Dataset nhỏ (< 10,000 rows)
  ✅ Cần "Jump to page N" (admin interface, reports)
  ✅ Traffic thấp
  ✅ Không cần real-time consistency

Keyset tốt hơn khi:
  ✅ Dataset lớn (100K+ rows)
  ✅ Infinite scroll / Load more
  ✅ High traffic APIs
  ✅ Cần stable pagination (không duplicate/skip)
```

---

**Tiếp theo:** 03-connection-pooling.md →

# Bài 1: Hỏi & Đáp - Indexing và Query Planning

## Q1: Tại sao query của tôi dùng Heap Scan thay vì Index Only Scan?

**Tình huống:** Adam tạo partitioned table, insert 1000 rows, ngay lập tức query → Thấy Bitmap Index Scan thay vì Index Only Scan.

### Nguyên nhân: MVCC Visibility

```
PostgreSQL cần kiểm tra "visibility" của mỗi row:
  - Có transaction nào đang chạy mà KHÔNG nên thấy row này không?
  - Row này có bị delete/update bởi transaction chưa commit không?

Thông tin visibility lưu ở đâu?
  → HEAP (bảng thực), không phải INDEX!
  → Hai hidden columns: xmin và xmax
```

```
xmin = Transaction ID tạo row này
xmax = Transaction ID xóa/update row này

Ví dụ:
  Transaction T1 insert row → xmin = T1
  Transaction T2 delete row → xmax = T2
  Transaction T3 query      → Check: xmin < T3 < xmax? → Visible!
```

### Tại sao sau khi insert ngay rồi query lại cần Heap Fetch?

```
Bạn vừa insert rows → xmin = transaction ID vừa rồi
Postgres không "tin" index 100%:
  "Rows này có thể có transactions đang chạy không thấy được"
  → Phải go to HEAP để check visibility (xmin/xmax)
  → Không thể dùng Index Only Scan!
```

### Giải pháp: VACUUM

```sql
-- Sau khi insert nhiều data, chạy VACUUM
VACUUM ANALYZE your_table;

-- VACUUM làm gì?
-- → Đi qua tất cả rows, check visibility
-- → Nếu row visible với TẤT CẢ transactions → Mark as "all_visible"
-- → Lưu thông tin này trong Visibility Map

-- Sau đó:
EXPLAIN ANALYZE SELECT count(*) FROM your_table WHERE grade = 1;
-- → Bây giờ sẽ dùng Index Only Scan!
-- → Không cần check heap nữa vì Visibility Map đảm bảo rồi
```

---

## Q2: Tôi đã có Index nhưng tại sao vẫn dùng Full Table Scan?

**Tình huống:** Karate tạo bảng với 7 rows, có PRIMARY KEY index, nhưng query vẫn dùng Sequential Scan.

### Lý do: Bảng quá nhỏ

```
PostgreSQL planner logic:
  
  Option A - Dùng B+Tree index:
    Traverse root → intermediate nodes → leaf
    → 3-5 I/O operations
    → Fetch tuple from heap
    → 4-6 I/O total
  
  Option B - Sequential Scan:
    Bảng 7 rows → 1 page (< 8KB)
    → 1 I/O total!
  
  → Option B rẻ hơn 4-6 lần!
  → Planner chọn Sequential Scan (đúng!)
```

### Vấn đề: Statistics outdated sau khi insert nhiều data

```
Scenario:
  1. Bảng nhỏ → Planner cache: "Sequential Scan là best"
  2. Insert 3 triệu rows...
  3. Query ngay → Planner VẪN nghĩ bảng nhỏ!
  4. Sequential scan qua 3M rows → Rất chậm!

Nguyên nhân:
  → Statistics chưa update sau khi insert
  → Planner không biết bảng đã to hơn

Fix:
```

```sql
-- Cập nhật statistics
ANALYZE your_table;
-- hoặc
VACUUM ANALYZE your_table;

-- Oracle:
EXEC DBMS_STATS.GATHER_TABLE_STATS('schema', 'table');

-- SQL Server:
UPDATE STATISTICS your_table;
```

### Rule of thumb

```
Sau khi insert lượng lớn data:
  1. Chạy VACUUM ANALYZE (PostgreSQL)
  2. Đợi auto-vacuum chạy
  3. Hoặc manually trigger statistics update

Khi nào dùng index vs sequential scan?
  → Nhỏ (< vài nghìn rows): Sequential scan thường nhanh hơn
  → Lớn (hàng triệu rows) + chọn lọc cao (< 5% rows): Index scan
  → Lớn + chọn lọc thấp (> 20% rows): Sequential scan
```

---

## Q3: Chi phí (Cost) trong PostgreSQL EXPLAIN là gì?

**Câu hỏi:** `cost=0.00..4.25` trong EXPLAIN có nghĩa là 4.25 milliseconds không?

### Trả lời: KHÔNG phải milliseconds!

```
cost=0.00..4.25 có nghĩa:
  - 0.00 = Chi phí để lấy ROW ĐẦU TIÊN (startup cost)
  - 4.25 = Chi phí để lấy ROW CUỐI CÙNG (total cost)
  
  Đơn vị: Không có đơn vị thực tế!
  → Đây là "cost units" = combination of:
    - Disk I/O cost (số page reads)
    - CPU cost (số operations)
    - Không liên quan đến thời gian thực
```

```sql
-- Ví dụ 1: Không có ORDER BY
EXPLAIN SELECT * FROM grades;
-- → cost=0.00..21.00
-- Startup cost = 0 (không cần chuẩn bị gì)
-- Total cost = 21 (đọc tất cả rows)

-- Ví dụ 2: Có ORDER BY
EXPLAIN SELECT * FROM grades ORDER BY g;
-- → cost=70.00..73.00
-- Startup cost = 70 (phải sort TẤT CẢ trước khi trả row đầu tiên!)
-- Total cost = 73 (sau khi sort, lấy tất cả)

→ ORDER BY tăng startup cost đáng kể!
→ Với LIMIT 10 sau ORDER BY: Bạn trả startup cost nhưng chỉ lấy 10 rows
→ Chi phí thực tế phụ thuộc vào cách sử dụng kết quả
```

### Khi nào startup cost quan trọng?

```
LIMIT clause:
  SELECT * FROM grades ORDER BY g LIMIT 10;
  → Startup cost = 70 (vẫn phải sort trước)
  → Nhưng chỉ fetch 10 rows sau đó
  
  Optimization: Nếu có index trên g → Sort free!
  → Startup cost = 0 (đọc index theo thứ tự)

Pagination:
  → OFFSET pagination: Mỗi trang vẫn trả startup cost
  → Keyset pagination: Không trả startup cost
```

---

## Q4: Tại sao database đọc Pages thay vì Rows?

**Câu hỏi:** Database đã biết vị trí row trong index, tại sao phải fetch cả page?

### Giới hạn của phần cứng

```
Hard Drive / SSD:
  Không có "byte addressability"!
  Chỉ đọc được theo BLOCKS (thường 4KB, 8KB, 16KB)
  
  Bạn muốn 1 byte ở position 1024?
  → Phải đọc block chứa byte đó
  → Block kích thước 4KB = 4096 bytes
  → Đọc 4096 bytes, lấy 1 byte cần
  
  → Không thể "chỉ đọc row"!

PostgreSQL page size = 8KB
  → Mỗi lần đọc từ disk = 8KB minimum
  → Nhiều rows fit trong 1 page → Amortize I/O cost
```

### Row size không cố định

```
Tại sao không biết vị trí chính xác của row?
  → Row size KHÔNG cố định (variable length)!
  
  Table schema:
    id:    4 bytes (fixed)
    name:  VARCHAR(255) - 1 đến 255 bytes (variable!)
    email: TEXT - variable
    notes: TEXT - variable (có thể NULL = 0 bytes)
  
  Row 1: id=1, name="Al", email="al@x.com", notes=NULL
    → Tổng: 4 + 2 + 8 + 0 = 14 bytes
    
  Row 2: id=2, name="Bob Smith Johnson", email="bob@longdomain.com", notes="very long note..."
    → Tổng: 4 + 17 + 18 + 100 = 139 bytes
  
  → Không thể biết trước offset của Row 3!
```

### Tuple ID không phải byte offset

```
B+Tree leaf node chứa:
  (salary_value) → (page_number, slot_number)
  
  Ví dụ: (50000) → (page=7, slot=3)
  
  Nghĩa là:
    → Fetch page 7 từ disk
    → Trong page 7, tìm slot 3
    → Slot = offset trong page (được lưu trong page header)
  
  Không phải byte offset trong file!
  → Phải đọc cả page để tìm slot 3
```

---

## Q5: Có nên Drop Indexes không dùng không?

**Câu hỏi:** Index không được dùng có nên xóa không?

### Chi phí duy trì Index

```
Mỗi index = Cấu trúc B+Tree riêng biệt
  → Mỗi INSERT: Cập nhật TẤT CẢ indexes
  → Mỗi UPDATE (column có index): Cập nhật index đó
  → Mỗi DELETE: Cập nhật TẤT CẢ indexes
  
  10 indexes trên 1 bảng:
    INSERT 1 row → 10 index updates!
    → Write throughput giảm đáng kể
    → Disk space tăng
    → Buffer pool bị chia cho nhiều index pages
```

### Covering Index (Non-key columns)

```sql
-- Tình huống: Query thường dùng
SELECT name, email FROM users WHERE age > 25;

-- Index đơn giản trên age:
CREATE INDEX idx_age ON users(age);
→ Tìm được rows qua index
→ Nhưng vẫn phải fetch heap để lấy name, email
→ Random I/O trên heap!

-- Covering index (non-key columns):
CREATE INDEX idx_age_covering ON users(age) INCLUDE (name, email);
→ age = search key
→ name, email = stored in leaf nodes (non-key columns)
→ Index Only Scan! Không cần fetch heap!
→ Nhanh hơn nhiều cho query này
```

### Khi nào nên drop index?

```
✅ Drop khi:
  - Index không được dùng trong bất kỳ query nào
  - Index chỉ được dùng trong query rất hiếm (cân nhắc)
  - Table write-heavy và index gây bottleneck
  - Index bị outdated (business logic thay đổi)

❌ Không drop khi:
  - Index dùng trong nhiều queries
  - Table read-heavy
  - Index enforce uniqueness (PRIMARY KEY, UNIQUE)
  - Bạn không chắc (hỏi DBA!)

Cách kiểm tra index usage:
```

```sql
-- PostgreSQL: Index usage statistics
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE relname = 'your_table'
ORDER BY idx_scan;

-- Index với idx_scan = 0 → Không bao giờ được dùng!
-- Cân nhắc drop
```

---

## Q6: CREATE INDEX có block writes không?

### Standard CREATE INDEX

```sql
-- Cách thông thường - Block tất cả writes!
CREATE INDEX idx_salary ON employees(salary);
```

```
Cách database xử lý:
  1. Acquire AccessExclusiveLock trên table
  2. Đọc TẤT CẢ rows, build B+Tree
  3. Commit index vào catalog
  4. Release lock

Trong thời gian build:
  → Mọi INSERT, UPDATE, DELETE đều BỊ BLOCK
  → Chỉ SELECT được phép
  → Trên bảng lớn: Có thể mất hàng giờ!
  → Production: Không thể dùng cách này!
```

### CREATE INDEX CONCURRENTLY (PostgreSQL)

```sql
-- An toàn cho production - Không block writes
CREATE INDEX CONCURRENTLY idx_salary ON employees(salary);
```

```
Cách database xử lý:
  Phase 1: Take note of WAL sequence number (LSN1)
           Scan toàn bộ table, build index (không lock writes)
           Concurrent writes tiếp tục...
  
  Phase 2: Note new LSN2
           Apply diff (LSN1 → LSN2) lên index
           Concurrent writes tiếp tục...
  
  Phase 3: Check if more changes after LSN2?
           Repeat until LSN is stable
  
  Final:   Lock briefly → Commit to catalog → Release
           Index now available!

Trade-offs:
  ✅ Không block writes
  ❌ Khoảng 2x chậm hơn standard CREATE INDEX
  ❌ Nếu có lỗi giữa chừng: Index "invalid", phải drop và tạo lại
  ❌ Không thể trong transaction block
```

```sql
-- Kiểm tra index status
SELECT indexname, indisvalid 
FROM pg_indexes 
JOIN pg_index ON indexrelid = (SELECT oid FROM pg_class WHERE relname = indexname)
WHERE tablename = 'employees';
-- indisvalid = false → Index invalid, cần drop và tạo lại
```

---

**Tiếp theo:** 02-hoi-dap-transactions-connections-va-misc.md →

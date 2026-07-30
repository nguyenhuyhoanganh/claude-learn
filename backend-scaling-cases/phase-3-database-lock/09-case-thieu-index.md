# Case 9: Thiếu index — khi một câu UPDATE khoá gần như cả bảng

Ở case 1 tôi có nói: InnoDB **không** có lock escalation (tự nâng row lock thành table lock). Điều đó đúng. Nhưng có một cơ chế khác cho ra kết quả tương tự, thậm chí tệ hơn — và hầu như không ai biết cho tới khi gặp phải.

```sql
UPDATE orders SET status = 'CANCELLED' WHERE tracking_code = 'ABC123';
```

Câu lệnh này khớp **đúng một dòng**. Nếu cột `tracking_code` không có index, nó khoá **toàn bộ 5 triệu dòng** của bảng.

## Cơ chế: InnoDB khoá những dòng nó QUÉT, không phải những dòng nó KHỚP

Đây là điều then chốt của bài:

```text
   CÓ INDEX trên tracking_code:
   ┌─────────────────────────────────────────────────┐
   │ Dùng index → nhảy thẳng tới 1 dòng              │
   │ Quét: 1 dòng                                     │
   │ Khoá: 1 dòng                                     │
   └─────────────────────────────────────────────────┘

   KHÔNG CÓ INDEX:
   ┌─────────────────────────────────────────────────┐
   │ Full table scan → đọc từng dòng để kiểm tra      │
   │ Quét: 5.000.000 dòng                             │
   │ Khoá: 5.000.000 dòng  ← TẤT CẢ, dù chỉ khớp 1!  │
   └─────────────────────────────────────────────────┘
```

Lý do kỹ thuật: InnoDB đặt lock ở **tầng storage engine**, khi nó đọc từng bản ghi. Việc lọc theo điều kiện `WHERE` diễn ra ở **tầng SQL, phía trên**. Nghĩa là lock đã được đặt **trước khi** biết dòng đó có khớp hay không.

Ở isolation `REPEATABLE READ` (mặc định MySQL), lock trên các dòng không khớp được giữ tới cuối transaction. Kết quả thực tế **tương đương một table lock**.

> Ở `READ COMMITTED`, InnoDB có tối ưu gọi là "semi-consistent read": nó nhả lock trên các dòng không khớp ngay sau khi đánh giá. Đây là một lý do nữa để cân nhắc `READ COMMITTED` (case 7). Nhưng trong lúc câu lệnh đang chạy, chúng vẫn bị khoá tạm thời — và với 5 triệu dòng thì "tạm thời" cũng đủ dài để gây sự cố.

PostgreSQL không có vấn đề này (nó chỉ khoá dòng thực sự cập nhật), nhưng full table scan vẫn gây hại theo cách khác: chậm, ngốn I/O, đẩy dữ liệu nóng ra khỏi bộ đệm.

## Hiện tượng

```text
   14:00  Deploy một tính năng mới: huỷ đơn theo mã vận đơn.
          Cột tracking_code mới thêm, chưa có index.

   14:05  Chức năng hoạt động. Chậm (2 giây) nhưng dùng được.
          Đội QA duyệt.

   20:00  Giờ cao điểm. 30 nhân viên chăm sóc khách hàng cùng dùng chức năng này.

   20:01  MỌI thao tác ghi trên bảng orders bị chặn.
          Đặt hàng không được. Thanh toán không được.
          Toàn bộ hệ thống bán hàng đứng im.

   20:04  Kỹ sư trực nhìn SHOW PROCESSLIST: 400 câu lệnh trạng thái
          "Waiting for lock". Thủ phạm: 30 câu UPDATE ... WHERE tracking_code.
```

Một tính năng phụ, dùng bởi 30 người, làm sập hệ thống phục vụ hàng triệu người.

## Xác nhận bằng `EXPLAIN`

**`EXPLAIN`** — lệnh cho biết database dự định thực thi query như thế nào. Đây là công cụ quan trọng nhất trong toàn bộ việc tối ưu database.

```sql
EXPLAIN UPDATE orders SET status='CANCELLED' WHERE tracking_code='ABC123';
```

```text
+----+-------------+--------+------+---------------+------+---------+------+---------+-------------+
| id | select_type | table  | type | possible_keys | key  | key_len | ref  | rows    | Extra       |
+----+-------------+--------+------+---------------+------+---------+------+---------+-------------+
|  1 | UPDATE      | orders | ALL  | NULL          | NULL | NULL    | NULL | 4982331 | Using where |
+----+-------------+--------+------+---------------+------+---------+------+---------+-------------+
                             ↑                       ↑                        ↑
                          type=ALL              key=NULL               gần 5 triệu dòng
                       (full table scan)     (không dùng index)
```

Ba dấu hiệu đỏ trong một dòng. Sau khi thêm index:

```sql
CREATE INDEX idx_orders_tracking ON orders (tracking_code);
```

```text
| id | select_type | table  | type | key                 | rows | Extra       |
|  1 | UPDATE      | orders | ref  | idx_orders_tracking |    1 | Using where |
                             ↑      ↑                       ↑
                          dùng index                     1 dòng
```

### Bảng giá trị `type` trong MySQL, từ tốt nhất tới tệ nhất

| `type` | Nghĩa | Đánh giá |
|---|---|---|
| `system` / `const` | Khớp đúng 1 dòng qua khoá chính/unique | Tuyệt vời |
| `eq_ref` | Mỗi dòng bảng ngoài khớp 1 dòng bảng này | Rất tốt |
| `ref` | Dùng index không unique | Tốt |
| `range` | Quét một khoảng của index | Chấp nhận được |
| `index` | Quét **toàn bộ index** | Kém |
| `ALL` | **Full table scan** | **Rất tệ** |

Quy tắc: thấy `ALL` trên bảng lớn là phải sửa. Thấy `ALL` trong một câu `UPDATE`/`DELETE` là **khẩn cấp**.

### PostgreSQL

```sql
EXPLAIN (ANALYZE, BUFFERS) UPDATE orders SET status='CANCELLED'
WHERE tracking_code='ABC123';
```

```text
Update on orders  (cost=0.00..112893.00 rows=1 width=245) (actual time=1823.4..1823.4 rows=0 loops=1)
  ->  Seq Scan on orders  (cost=0.00..112893.00 rows=1 width=245)
                          (actual time=912.3..1823.1 rows=1 loops=1)
        Filter: (tracking_code = 'ABC123'::text)
        Rows Removed by Filter: 4982330          ← 5 triệu dòng bị loại!
        Buffers: shared hit=1024 read=61870      ← đọc 61.870 trang từ đĩa
```

Hai chỉ số cần nhìn: **`Seq Scan`** (quét tuần tự) và **`Rows Removed by Filter`**. Con số thứ hai lớn nghĩa là database đọc rất nhiều để trả về rất ít.

Luôn dùng `EXPLAIN ANALYZE` (thực thi thật, cho số liệu thật) thay vì `EXPLAIN` đơn thuần (chỉ ước lượng). Cẩn thận: với `UPDATE`/`DELETE`, `EXPLAIN ANALYZE` **thực sự thay đổi dữ liệu** — hãy bọc trong transaction rồi rollback:

```sql
BEGIN;
EXPLAIN (ANALYZE) UPDATE orders SET ... WHERE ...;
ROLLBACK;
```

## Ba dạng thiếu index hay gặp

### 1. Cột mới thêm mà quên index

Kịch bản ở đầu bài. Phòng ngừa: **quy trình bắt buộc** — mọi cột xuất hiện trong `WHERE`, `JOIN`, `ORDER BY` phải có index, và điều này phải nằm trong checklist review migration.

### 2. Index có nhưng không dùng được

Index tồn tại nhưng query viết theo cách khiến database không dùng được nó:

```sql
-- Có index trên created_at, nhưng KHÔNG DÙNG ĐƯỢC:
WHERE DATE(created_at) = '2026-07-30'          -- hàm bọc quanh cột
WHERE created_at + INTERVAL 1 DAY > NOW()      -- tính toán trên cột
WHERE CAST(user_id AS CHAR) = '123'            -- ép kiểu
WHERE name LIKE '%abc'                          -- ký tự đại diện ở đầu
WHERE status != 'DONE'                          -- phủ định, độ chọn lọc thấp
```

```sql
-- Viết lại để dùng được index:
WHERE created_at >= '2026-07-30' AND created_at < '2026-07-31'
WHERE created_at > NOW() - INTERVAL 1 DAY
WHERE user_id = 123
WHERE name LIKE 'abc%'
WHERE status IN ('PENDING', 'PROCESSING')
```

**Nguyên tắc**: cột phải đứng "trần trụi" một mình ở vế trái. Mọi phép biến đổi trên cột đều làm index vô dụng.

Nếu buộc phải dùng biểu thức, tạo **functional index**:

```sql
CREATE INDEX idx_orders_date ON orders ((DATE(created_at)));       -- PostgreSQL
CREATE INDEX idx_email_lower ON users ((lower(email)));
```

**Ép kiểu ngầm** là thủ phạm tinh vi nhất: nếu `user_id` là `BIGINT` mà bạn truyền chuỗi `'123'`, MySQL ép kiểu và có thể bỏ qua index. Lỗi này thường đến từ tầng ORM hoặc từ tham số không khớp kiểu.

### 3. Composite index sai thứ tự

```sql
CREATE INDEX idx_a ON orders (status, created_at);
```

Index này dùng được cho:

```sql
WHERE status = 'PENDING'                                    ✓
WHERE status = 'PENDING' AND created_at > '2026-01-01'      ✓
WHERE status = 'PENDING' ORDER BY created_at                ✓ (không cần sort!)
```

Nhưng **không** dùng được cho:

```sql
WHERE created_at > '2026-01-01'                             ✗
```

**Quy tắc leftmost prefix**: composite index chỉ dùng được nếu query có điều kiện trên **các cột đầu tiên liên tiếp** của index.

Thứ tự cột trong composite index nên là:

```text
   1. Cột dùng với phép = (đẳng thức)     ← trước
   2. Cột dùng để sắp xếp (ORDER BY)
   3. Cột dùng với phép khoảng (>, <, BETWEEN)  ← sau

   Ví dụ: WHERE tenant_id = ? AND status = ? AND created_at > ? ORDER BY created_at
   ⇒ INDEX (tenant_id, status, created_at)
```

Đặt cột khoảng lên trước sẽ làm các cột sau nó trong index trở nên vô dụng cho việc lọc.

### Covering index — mẹo tăng tốc đáng kể

Nếu index chứa **mọi cột** mà query cần, database không phải đọc bảng chính:

```sql
-- Query: SELECT status, created_at FROM orders WHERE user_id = ?
CREATE INDEX idx_cover ON orders (user_id, status, created_at);
-- hoặc PostgreSQL 11+:
CREATE INDEX idx_cover ON orders (user_id) INCLUDE (status, created_at);
```

```text
   EXPLAIN cho thấy: Extra: Using index          (MySQL)
                     Index Only Scan             (PostgreSQL)

   ⇒ Không chạm bảng chính. Nhanh hơn 2-10 lần.
```

## Tạo index trên bảng lớn mà không gây downtime

Đây là phần thực chiến quan trọng. `CREATE INDEX` thông thường **khoá bảng** trong suốt quá trình — với bảng 5 triệu dòng có thể mất 10 phút.

### PostgreSQL

```sql
CREATE INDEX CONCURRENTLY idx_orders_tracking ON orders (tracking_code);
```

`CONCURRENTLY` không khoá ghi. Đánh đổi:

- Chậm hơn 2-3 lần (quét bảng hai lượt).
- **Không chạy được trong transaction** — nên không dùng được trực tiếp trong nhiều công cụ migration (Flyway cần `-- lock_timeout` và cấu hình riêng).
- Nếu thất bại giữa chừng, để lại một index **`INVALID`** phải xoá thủ công:

```sql
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
DROP INDEX CONCURRENTLY idx_orders_tracking;   -- rồi tạo lại
```

Với Flyway/Liquibase:

```sql
-- V15__add_tracking_index.sql
-- flyway:executeInTransaction=false
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tracking ON orders (tracking_code);
```

### MySQL 8

```sql
ALTER TABLE orders ADD INDEX idx_tracking (tracking_code), ALGORITHM=INPLACE, LOCK=NONE;
```

`LOCK=NONE` cho phép đọc ghi bình thường trong lúc tạo. Nếu MySQL không hỗ trợ với thao tác đó, nó báo lỗi ngay thay vì âm thầm khoá bảng — đó là hành vi mong muốn.

Với bảng cực lớn hoặc MySQL cũ, dùng công cụ **`pt-online-schema-change`** (Percona) hoặc **`gh-ost`** (GitHub): chúng tạo bảng mới, sao chép dữ liệu dần dần, rồi đổi tên. Không có downtime.

### Luôn đặt `lock_timeout` khi chạy DDL

```sql
SET lock_timeout = '5s';
CREATE INDEX CONCURRENTLY ...;
```

Nếu không, lệnh DDL sẽ **xếp hàng chờ** lock — và trong lúc chờ, nó **chặn mọi query mới** (case 2). Đây là cách một lệnh `CREATE INDEX` vô hại làm sập hệ thống.

## Tìm index thiếu và index thừa

### Query chậm

```sql
-- PostgreSQL: cần extension pg_stat_statements
SELECT calls, mean_exec_time, total_exec_time, rows,
       left(query, 80) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

Sắp xếp theo `total_exec_time` (không phải `mean_exec_time`) — một query 5 ms chạy 1 triệu lần tốn nhiều tài nguyên hơn query 2 giây chạy 10 lần.

```sql
-- MySQL: bật slow query log
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 1;
SET GLOBAL log_queries_not_using_indexes = ON;     -- rất hữu ích
```

Phân tích bằng `pt-query-digest`:

```bash
pt-query-digest /var/log/mysql/slow.log | head -50
```

### Bảng bị quét tuần tự nhiều

```sql
-- PostgreSQL: bảng nào bị Seq Scan nhiều nhất
SELECT relname,
       seq_scan, seq_tup_read,
       idx_scan,
       seq_tup_read / NULLIF(seq_scan, 0) AS avg_rows_per_seq_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC
LIMIT 10;
```

`seq_scan` cao + `idx_scan` thấp trên bảng lớn = thiếu index.

### Index không bao giờ được dùng

Index thừa cũng có hại: chúng làm chậm mọi `INSERT`/`UPDATE`/`DELETE` và chiếm dung lượng.

```sql
-- PostgreSQL: index chưa từng được dùng
SELECT schemaname, relname, indexrelname,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size,
       idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
```

Chú ý: `idx_scan = 0` chỉ đúng kể từ lần reset thống kê gần nhất. Kiểm tra `stats_reset` trước khi xoá index dựa vào con số này.

## Cái giá của index — đừng tạo bừa

| Chi phí | Chi tiết |
|---|---|
| Ghi chậm hơn | Mỗi `INSERT` phải cập nhật mọi index. 10 index = ghi chậm ~3-5 lần |
| Dung lượng | Index thường chiếm 10-40% kích thước bảng |
| Bộ nhớ | Index cạnh tranh chỗ trong buffer pool với dữ liệu |
| Bảo trì | Cần rebuild định kỳ khi bị phân mảnh |

Quy tắc thực dụng: **3-5 index cho mỗi bảng là hợp lý; trên 10 là dấu hiệu cần rà soát.** Ưu tiên composite index phục vụ nhiều query hơn là nhiều index đơn cột.

## Trường hợp thực tế: bảng 80 triệu dòng

Bối cảnh: bảng `event_log`, 80 triệu dòng, một query báo cáo mất 45 giây và làm chậm cả hệ thống.

```sql
SELECT user_id, count(*)
FROM event_log
WHERE event_type = 'PURCHASE'
  AND created_at >= '2026-07-01'
  AND created_at < '2026-08-01'
GROUP BY user_id;
```

```text
   EXPLAIN ban đầu: Seq Scan, Rows Removed by Filter: 79.400.000
```

Quá trình tối ưu:

| Bước | Hành động | Thời gian |
|---|---|---|
| 0 | Ban đầu | 45.000 ms |
| 1 | `CREATE INDEX (event_type, created_at)` | 3.200 ms |
| 2 | Đổi thứ tự: `(event_type, created_at, user_id)` — covering index | 890 ms |
| 3 | Partition bảng theo tháng | 180 ms |
| 4 | Bảng tổng hợp cập nhật hàng đêm | **8 ms** |

Nhận xét về từng bước:

- **Bước 1** cho cải thiện lớn nhất (14 lần) với công sức nhỏ nhất.
- **Bước 2** biến thành index-only scan — không chạm bảng chính.
- **Bước 3** (partition) giúp query chỉ đọc partition tháng 7, và cho phép xoá dữ liệu cũ bằng `DROP PARTITION` thay vì `DELETE` (nhanh hơn hàng nghìn lần).
- **Bước 4** là câu trả lời đúng cho báo cáo: **tính trước, đừng tính lúc người dùng hỏi**.

Bài học chung: với dữ liệu lớn, thứ tự ưu tiên luôn là **index → phân vùng → tính trước**. Đừng nhảy thẳng tới giải pháp phức tạp nhất.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| `UPDATE`/`DELETE` trên cột không index | Khoá gần như cả bảng ở MySQL |
| Bọc hàm quanh cột trong `WHERE` | Index bị vô hiệu hoá |
| Ép kiểu ngầm (số vs chuỗi) | Index bị bỏ qua, không có cảnh báo |
| Composite index sai thứ tự | Không dùng được cho query cần |
| `CREATE INDEX` không có `CONCURRENTLY` | Khoá bảng nhiều phút |
| DDL không đặt `lock_timeout` | Xếp hàng chờ và chặn mọi query mới |
| Tạo index cho mọi cột | Ghi chậm 3-5 lần, tốn dung lượng |
| Xoá index dựa vào `idx_scan = 0` không kiểm tra `stats_reset` | Xoá nhầm index quan trọng |
| Chỉ nhìn `mean_exec_time` | Bỏ sót query nhanh nhưng chạy cực nhiều |

## Tóm tắt case 9

- **InnoDB khoá những dòng nó QUÉT, không phải những dòng nó KHỚP** — thiếu index biến `UPDATE` một dòng thành khoá cả bảng.
- `EXPLAIN` là công cụ số một. Thấy `type=ALL` / `Seq Scan` trên bảng lớn là phải sửa.
- Ba dạng thiếu index: quên tạo, **có mà không dùng được** (hàm/ép kiểu), sai thứ tự composite.
- **Leftmost prefix**: composite index chỉ dùng được từ các cột đầu tiên liên tiếp.
- Thứ tự cột: **đẳng thức → sắp xếp → khoảng**.
- Tạo index trên bảng lớn: `CONCURRENTLY` (PostgreSQL) / `LOCK=NONE` (MySQL), **luôn kèm `lock_timeout`**.
- Index không miễn phí: ghi chậm hơn, tốn dung lượng. **3-5 index/bảng** là hợp lý.
- Với báo cáo trên dữ liệu lớn: **index → partition → tính trước**.

**Bài kế tiếp** → [Phase 4 - Case 1: Retry storm — khi cơ chế thử lại tự giết hệ thống](../phase-4-cascading-failure/01-case-retry-storm.md)

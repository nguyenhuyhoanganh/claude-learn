# Bài 1: Hỏi & Đáp — Indexing và Query Planning

Chín câu hỏi thật, được hỏi đi hỏi lại. Mỗi câu trả lời đủ để dùng ngay trong phỏng vấn hoặc khi chẩn đoán sự cố.

---

## Câu 1 — Đơn vị của `cost` trong `EXPLAIN` là gì?

**Câu trả lời ngắn: không có đơn vị.** Nó là một số quy ước, chỉ dùng để **so sánh hai kế hoạch với nhau**.

```sql
EXPLAIN SELECT * FROM grades WHERE g = 50;
```

```text
Seq Scan on grades  (cost=0.00..17709.00 rows=9867 width=19)
                          ▲     ▲          ▲         ▲
                          │     │          │         └ kích thước dòng ước tính (byte)
                          │     │          └ số dòng ước tính
                          │     └ chi phí để lấy dòng CUỐI CÙNG
                          └ chi phí để lấy dòng ĐẦU TIÊN
```

Con số đó được tính từ năm hằng số:

```sql
SELECT name, setting FROM pg_settings WHERE name LIKE '%_cost';
```

```text
         name         | setting
----------------------+---------
 cpu_index_tuple_cost | 0.005
 cpu_operator_cost    | 0.0025
 cpu_tuple_cost       | 0.01
 random_page_cost     | 4
 seq_page_cost        | 1        ← MOC CHUAN = 1,0
```

Mọi thứ được quy về "đọc tuần tự một page = 1,0". Kiểm chứng bằng tay:

```text
   Bảng grades:  8.334 page,  1.000.000 dòng

   Chi phí Seq Scan = (số_page × seq_page_cost)
                    + (so_dong × cpu_tuple_cost)
                    + (so_dong × cpu_operator_cost)     ← đánh giá điều kiện WHERE
                    = 8.334 × 1,0
                    + 1.000.000 × 0,01
                    + 1.000.000 × 0,0025
                    = 8.334 + 10.000 + 2.500
                    = 20.834
```

Con số PostgreSQL đưa ra là 17.709 — sai lệch vì `cpu_operator_cost` chỉ áp cho các phép so sánh thật sự chạy. Nhưng bậc độ lớn khớp, và cách tính là như vậy.

Ba hệ quả thực dụng:

```text
   1. "cost = 5.000" KHÔNG cho biết nhanh hay chậm.
      Chỉ có nghĩa khi so với cost của kế hoạch KHÁC cho CÙNG câu truy vấn.

   2. cost KHÔNG tỉ lệ tuyến tính với thời gian.
      Kế hoạch cost 100 có thể chậm hơn kế hoạch cost 1.000
      nếu dữ liệu nằm sẵn trong cache.

   3. `random_page_cost = 4` là mặc định từ THỜI Ổ ĐĨA QUAY.
      Trên SSD nên đặt 1,1 — nếu không optimizer bỏ index quá sớm.
```

---

## Câu 2 — Có index rồi, sao database vẫn quét toàn bảng?

Đây là câu hỏi được hỏi nhiều nhất. Có **bảy** nguyên nhân, xếp theo tần suất thực tế.

### Nguyên nhân 1 — Quét toàn bảng thật sự rẻ hơn

```sql
EXPLAIN SELECT * FROM grades WHERE g < 90;   -- khớp ~90% bảng
```

```text
Seq Scan on grades  (cost=0.00..17709.00 rows=899471 width=19)
  Filter: (g < 90)
```

```text
   Lấy 90% số dòng bằng index nghĩa là:
     • tra index 900.000 lan
     • nhảy vào heap 900.000 lần (I/O NGẪU NHIÊN)
   → đắt hơn nhiều so với đọc thẳng 8.334 page tuần tự

   → Optimizer chọn ĐÚNG. Điểm lật thường ở 5-20% số dòng.
```

### Nguyên nhân 2 — Thống kê cũ

```sql
EXPLAIN ANALYZE SELECT * FROM fresh WHERE val = 500;
```

```text
Seq Scan on fresh  (cost=0.00..42.55 rows=1 ...) (actual ... rows=5000 ...)
                                    ▲                              ▲
                              ước lượng 1                    thực tế 5.000
```

Lệch 5.000 lần nghĩa là thống kê sai. Chữa: `ANALYZE fresh;` — chi tiết ở [phase-4 bài 3](../phase-4/03-composite-index-va-optimizer.md).

### Nguyên nhân 3 — Hàm hoặc ép kiểu trên cột

```sql
WHERE UPPER(name) = 'AN'      -- index trên `name` KHÔNG dùng được
WHERE id::TEXT = '5'          -- ép kiểu là một hàm
WHERE created_at::DATE = ...  -- ep kieu
WHERE age + 1 = 30            -- biểu thức
```

Chữa: index trên biểu thức, hoặc viết lại điều kiện:

```sql
CREATE INDEX ON users (UPPER(name));
-- hoac
WHERE created_at >= '2026-08-01' AND created_at < '2026-08-02'   -- thay vi ::DATE
```

### Nguyên nhân 4 — Vi phạm quy tắc tiền tố trái

```sql
CREATE INDEX idx ON t (a, b);
WHERE b = 5                   -- KHÔNG dùng được
```

### Nguyên nhân 5 — Kiểu dữ liệu không khớp

```sql
-- cột user_id là BIGINT, tham số gửi vào là TEXT
WHERE user_id = '42'          -- có thể phải ép kiểu → mất index
```

Đây là bẫy phổ biến với ORM cấu hình sai. Kiểm tra bằng cách xem `EXPLAIN` có hiện `::text` hay không.

### Nguyên nhân 6 — Bảng quá nhỏ

```sql
EXPLAIN SELECT * FROM small_table WHERE id = 5;   -- bảng có 50 dòng
```

```text
Seq Scan on small_table  (cost=0.00..1.62 rows=1 width=8)
```

Bảng 50 dòng nằm trong **một page**. Đọc một page rẻ hơn tra index (cũng phải đọc ít nhất một page index rồi mới vào bảng). Optimizer chọn đúng.

### Nguyên nhân 7 — `OR` không có index cho mọi vế

```sql
CREATE INDEX ON t (a);
WHERE a = 1 OR b = 2          -- b không có index → phải quét toàn bảng
```

Chữa: tạo index cho `b`, khi đó `BitmapOr` hoạt động.

### Quy trình chẩn đoán

```sql
-- 1. Ép dùng index để so sánh
SET enable_seqscan = off;
EXPLAIN ANALYZE <câu truy vấn>;
RESET enable_seqscan;
```

```text
   Ép index NHANH HƠN  →  optimizer sai → nghi thống kê hoặc random_page_cost
   Ép index CHẬM HƠN   →  optimizer đúng → tìm cách khác
```

```sql
-- 2. So ước lượng với thực tế
EXPLAIN ANALYZE <câu truy vấn>;   -- xem rows= ở hai chỗ có lệch nhiều không

-- 3. Kiểm tra định dạng điều kiện
EXPLAIN (VERBOSE) <câu truy vấn>; -- xem có ép kiểu ẩn không
```

---

## Câu 3 — Index trên cột có nhiều giá trị trùng hoạt động thế nào?

```sql
-- Cột `status` chỉ có 3 giá trị, trên bảng 10 triệu dòng
CREATE INDEX idx_status ON orders (status);
```

Trong B+Tree, các khoá trùng nhau **nằm liền nhau ở tầng lá**:

```text
   LÁ CỦA INDEX:
   ['cancelled' → ctid1] ['cancelled' → ctid2] ... ['paid' → ctid1] ...
    └──────── 2 trieu muc ────────┘             └── 7 trieu muc ──┘
```

```text
   → Tìm WHERE status = 'paid' → nhảy tới khối 'paid', đọc liên tiếp
   → Nhưng khối đó có 7 TRIỆU mục
   → Đọc hết rồi nhảy vào heap 7 triệu lần → đắt hơn quét toàn bảng
   → Optimizer sẽ BỎ INDEX
```

**Từ PostgreSQL 13, có khử trùng lặp** giúp index nhỏ đi rất nhiều:

```text
   TRƯỚC PG13                        TỪ PG13
   ══════════                        ═══════
   'paid' → ctid1                    'paid' → [ctid1, ctid2, ctid3, ...]
   'paid' → ctid2                            ▲ MỘT mục, danh sách con trỏ
   'paid' → ctid3
   ... × 7 trieu

   Index: 380 MB                     Index: 92 MB    → NHỎ HƠN 4,1 LẦN
```

Nhưng nhỏ hơn **không** làm nó hữu ích hơn cho `WHERE status = 'paid'` — vẫn phải nhảy 7 triệu lần vào heap.

Ba cách làm nó hữu ích:

```sql
-- 1. INDEX BỘ PHẬN — chỉ đánh index phần hiếm
CREATE INDEX idx_pending ON orders (created_at) WHERE status = 'pending';
--    'pending' chỉ có 5.000 dòng → index 200 KB thay vì 380 MB

-- 2. INDEX COMPOSITE — đặt cột chọn lọc THẤP trước cột chọn lọc CAO
CREATE INDEX idx_status_user ON orders (status, user_id);
--    WHERE status='paid' AND user_id=42 → rất hiệu quả

-- 3. COVERING INDEX — tránh nhảy vào heap
CREATE INDEX idx_status_cover ON orders (status) INCLUDE (total, created_at);
```

Cách 1 là cách hiệu quả nhất và ít được dùng nhất.

---

## Câu 4 — Có nên xoá index không dùng đến?

**Có** — nhưng phải kiểm tra ba điều trước.

```sql
SELECT s.relname                                    AS bang,
       s.indexrelname                               AS ten_index,
       s.idx_scan                                   AS so_lan_dung,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS kich_thuoc,
       (SELECT stats_reset FROM pg_stat_database WHERE datname = current_database())
                                                    AS thong_ke_tu_luc
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0
  AND NOT i.indisunique                              -- ← bỏ qua UNIQUE
  AND NOT i.indisprimary                             -- ← bỏ qua PRIMARY KEY
ORDER BY pg_relation_size(s.indexrelid) DESC;
```

### Ba điều phải kiểm tra

```text
   1. THỐNG KÊ ĐÃ ĐỦ DÀI CHƯA?
      Nếu vừa pg_stat_reset() tuần trước thì báo cáo cuối quý CHƯA CHẠY.
      → Quan sát ít nhất MỘT CHU KỲ NGHIỆP VỤ đầy đủ (thường 1 quý).

   2. NÓ CÓ ĐANG THỰC THI RÀNG BUỘC KHÔNG?
      Index của PRIMARY KEY và UNIQUE luôn hiện idx_scan = 0
      nhưng TUYỆT ĐỐI không được xoá.
      → Câu truy vấn trên đã lọc sẵn.

   3. NÓ CÓ ĐƯỢC DÙNG TRÊN REPLICA KHÔNG?
      pg_stat_user_indexes là thống kê CỦA TỪNG MÁY.
      Index không dùng trên primary có thể đang phục vụ báo cáo trên replica.
      → Phải kiểm tra TRÊN MỌI MÁY.
```

Điều thứ ba là cái bẫy nguy hiểm nhất, và rất ít người kiểm tra.

### Cách xoá an toàn

```sql
-- 1. Vô hiệu hoá TRƯỚC (PG chưa hỗ trợ trực tiếp, dùng mẹo này)
UPDATE pg_index SET indisvalid = false
WHERE indexrelid = 'idx_nghi_ngo'::regclass;
-- → planner không dùng nữa, nhưng index VẪN được cập nhật
-- → theo dõi vài ngày xem có truy vấn nào chậm đi không

-- 2. Nếu ổn, xoá thật
DROP INDEX CONCURRENTLY idx_nghi_ngo;
```

Mẹo ở bước 1 rất hữu dụng: nó cho phép **quay lại tức thì** nếu có gì đó chậm đi, thay vì phải dựng lại index mất hàng giờ.

### Cái giá của index không dùng

```text
   • Ton dia
   • Làm chậm MỌI lệnh INSERT/UPDATE/DELETE
   • Tranh chỗ với index hữu ích trong buffer pool
   • Làm chậm VACUUM và REINDEX
   • Làm CHẬM VIỆC LẬP KẾ HOẠCH — planner phải xét nó mỗi lần
```

Dòng cuối ít người biết: mỗi index thừa làm tăng thời gian lập kế hoạch của **mọi** truy vấn trên bảng đó.

---

## Câu 5 — Bitmap Index Scan có giá trị gì?

Nó lấp khoảng trống giữa `Index Scan` và `Seq Scan`:

```text
   RẤT ÍT DÒNG          VỪA PHẢI              RẤT NHIỀU DÒNG
   (< ~1%)              (1-20%)               (> ~20%)
   ─────────            ────────              ──────────────
   Index Scan           Bitmap Scan           Seq Scan
   nhảy từng dòng       gom trước rồi đọc     đọc thẳng toàn bảng
                        mỗi page MỘT LẦN
```

Ba giá trị cụ thể:

```text
   1. MỖI PAGE CHỈ ĐỌC MỘT LẦN
      Index Scan: 10.000 mục khớp → có thể đọc một page 50 lần
      Bitmap    : gom lại → mỗi page đọc đúng một lần

   2. ĐỌC HEAP THEO THỨ TỰ TĂNG DẦN
      → gần với I/O TUẦN TỰ, tận dụng được đọc trước của hệ điều hành

   3. KẾT HỢP NHIỀU INDEX (BitmapAnd / BitmapOr)
      → hai index riêng lẻ HỢP TÁC được với nhau
      → không cần tạo index composite cho mọi tổ hợp
```

Chi tiết cơ chế ở [phase-4 bài 2](../phase-4/02-index-scan-va-covering-index.md).

Chú ý dòng `lossy` trong kế hoạch:

```text
  Heap Blocks: exact=1204  lossy=41882
```

`lossy` nghĩa là `work_mem` không đủ, bitmap chỉ nhớ được **page nào** chứ không nhớ **dòng nào** → bước `Recheck Cond` phải kiểm tra mọi dòng trong các page đó. Thấy `lossy` lớn thì tăng `work_mem`.

---

## Câu 6 — `EXPLAIN ANALYZE` thật sự làm gì?

```text
   EXPLAIN            →  chỉ LẬP KẾ HOẠCH, KHÔNG chạy.  An toàn.
   EXPLAIN ANALYZE    →  CHẠY THẬT, đo thời gian từng bước.
```

**Cảnh báo nghiêm túc:**

```sql
EXPLAIN ANALYZE DELETE FROM users WHERE id > 100;   -- XOÁ THẬT!
EXPLAIN ANALYZE UPDATE orders SET status = 'x';     -- SUA THAT!
```

Cách an toàn:

```sql
BEGIN;
EXPLAIN ANALYZE DELETE FROM users WHERE id > 100;
ROLLBACK;
```

### Các tuỳ chọn đáng dùng

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, WAL, FORMAT TEXT) <query>;
```

| Tuỳ chọn | Cho biết |
|---|---|
| `BUFFERS` | **Số page đọc** từ cache và từ đĩa ← quan trọng nhất |
| `VERBOSE` | Danh sách cột đầy đủ, tên schema, ép kiểu ẩn |
| `SETTINGS` | Các tham số **khác mặc định** đang ảnh hưởng kế hoạch |
| `WAL` | Lượng WAL sinh ra (chỉ với lệnh ghi) |
| `TIMING OFF` | Bỏ đo thời gian từng nút — giảm chi phí đo |

### Chi phí của việc đo

```text
   `EXPLAIN ANALYZE` GỌI ĐỒNG HỒ CHO MỖI DÒNG ở MỖI NÚT.
   Với truy vấn trả về hàng triệu dòng, chi phí đo có thể
   làm truy vấn CHẬM HƠN 2-3 LẦN so với khi chạy bình thường.

   → `Execution Time` trong EXPLAIN ANALYZE có thể CAO HƠN thực tế.
```

Cách đo chính xác hơn:

```sql
EXPLAIN (ANALYZE, TIMING OFF, BUFFERS) <query>;
-- vẫn biết số dòng và số page, nhưng không đo thời gian từng nút
```

### Ba con số cần đọc

```text
   1. rows= ƯỚC LƯỢNG  vs  rows= THỰC TẾ
      Lệch > 100 lần → thống kê sai

   2. Buffers: shared hit=X read=Y
      `read` cao → đang chạm đĩa; `hit` cao → đang trong cache

   3. Rows Removed by Filter
      Cao → đang đọc rồi vứt đi → thiếu index
```

---

## Câu 7 — `CREATE INDEX` có chặn ghi không? Vì sao?

**Có**, và lý do rất căn bản:

```text
   Index được dựng từ MỘT ẢNH CHỤP dữ liệu.
   Nếu có dòng mới chèn vào giữa chừng, index sẽ THIẾU dòng đó.
   Index thiếu dữ liệu còn TỆ HƠN không có index — truy vấn trả về SAI.

   → Phải chặn ghi để đảm bảo ảnh chụp không đổi.
```

`CREATE INDEX` giữ khoá `SHARE`: cho đọc, chặn mọi lệnh ghi. Với bảng 400 triệu dòng, đó là hàng chục phút.

Cách tránh:

```sql
CREATE INDEX CONCURRENTLY idx_x ON t (col);
```

Nó quét bảng **hai lần** (lần hai để nhặt các dòng đã đổi trong lúc lần một chạy), nên chậm hơn 2-3 lần — nhưng không chặn ghi.

**Cái bẫy lớn nhất**: `CONCURRENTLY` vẫn cần một khoá ngắn, và nếu có transaction dài đang mở thì nó phải chờ — và trong lúc chờ, **nó chặn cả hàng đợi phía sau**. Chi tiết đầy đủ và quy trình an toàn ở [phase-4 bài 5](../phase-4/05-create-index-concurrently-va-best-practices.md).

---

## Câu 8 — Vì sao database đọc theo page thay vì theo dòng?

Ba lý do, xếp theo mức độ căn bản:

```text
   1. PHẦN CỨNG KHÔNG CHO ĐỌC MỘT BYTE
      SSD đọc theo trang 4-16 KB; HDD đọc theo cung 512 byte.
      Đọc 1 byte và đọc 8.192 byte tốn GẦN NHƯ BẰNG NHAU.
      → đọc lẻ là lãng phí thuần tuý

   2. TINH CUC BO
      Dữ liệu được đọc cùng nhau thường nằm cạnh nhau.
      Đọc cả page = "khuyến mãi" các dòng kế bên, thường dùng tiếp ngay.

   3. QUẢN LÝ BỘ NHỚ ĐỆM ĐƠN GIẢN
      Buffer pool quản lý các ô CỐ ĐỊNH 8 KB → cấp phát và thay thế
      cực kỳ đơn giản, không bao giờ phân mảnh.
      Nếu quản lý theo dòng (kích thước thay đổi) → bài toán phân mảnh
      giống hệt slab allocator ở [phase-13 bài 2].
```

Hệ quả thực tế đã phân tích ở [phase-3 bài 1](../phase-3/01-page-heap-va-io.md): **`SELECT name` vẫn đọc đủ số page như `SELECT *`** — vì bạn không thể yêu cầu đĩa đưa cho riêng một cột.

---

## Câu 9 — Vì sao `Index Scan` mà không phải `Index Only Scan`?

```sql
EXPLAIN ANALYZE SELECT g FROM grades WHERE g = 50;
```

```text
Index Scan using idx_grades_g on grades      ← tại sao không "Only"?
```

Có **ba** nguyên nhân.

### Nguyên nhân 1 — Cột cần không nằm trong index

```sql
SELECT g, name FROM grades WHERE g = 50;   -- `name` không có trong index
```

Chữa: `CREATE INDEX ... (g) INCLUDE (name)`.

### Nguyên nhân 2 — Visibility map chưa được cập nhật

Đây là nguyên nhân hay bị bỏ sót nhất:

```sql
EXPLAIN (ANALYZE) SELECT g FROM grades WHERE g BETWEEN 95 AND 100;
```

```text
Index Only Scan using idx_grades_g on grades
  Heap Fetches: 29882           ← vẫn đang chạm heap!
```

```text
   Index KHÔNG lưu thông tin MVCC — nó không biết dòng nào còn sống.
   PostgreSQL dựa vào VISIBILITY MAP: một bit mỗi page,
   bật lên nghĩa là "mọi dòng trong page này đều nhìn thấy được".

   CHỈ `VACUUM` mới bật bit đó.
   → Vừa ghi nhiều → nhiều page chưa có bit → phải vào heap kiểm tra
```

```sql
VACUUM grades;   -- → Heap Fetches tro ve 0
```

`Heap Fetches` lớn kéo dài là dấu hiệu **autovacuum không theo kịp tốc độ ghi**.

### Nguyên nhân 3 — Điều kiện dùng cột không có trong index

```sql
CREATE INDEX ON grades (g);
SELECT g FROM grades WHERE g = 50 AND name LIKE 'a%';
--                                    ▲ phải vào heap để kiểm tra
```

---

## Bảng tra nhanh: triệu chứng → nguyên nhân

| Thấy trong `EXPLAIN` | Nghĩa là | Làm gì |
|---|---|---|
| `Seq Scan` trên bảng lớn | Không dùng index | Xem 7 nguyên nhân ở Câu 2 |
| `rows=` ước lượng lệch > 100× thực tế | Thống kê sai | `ANALYZE`; tăng `SET STATISTICS` |
| `Rows Removed by Filter` lớn | Đọc rồi mới vứt | Thiếu index cho điều kiện đó |
| `Filter:` thay vì `Index Cond:` | Điều kiện không đẩy được vào index | Sửa index hoặc sửa điều kiện |
| `Heap Fetches` lớn | Visibility map cũ | `VACUUM`; chỉnh autovacuum |
| `lossy=` lớn trong bitmap | `work_mem` không đủ | Tăng `work_mem` |
| `Sort Method: external merge Disk` | Sắp xếp tràn ra đĩa | Tăng `work_mem`; hoặc index cho `ORDER BY` |
| `Nested Loop` với `loops=` rất lớn | Ước lượng sai bên trong | `ANALYZE`; xem lại điều kiện `JOIN` |
| `Buffers: read=` rất cao | Đang chạm đĩa nhiều | Tăng `shared_buffers`; hoặc giảm dữ liệu phải đọc |

## Tóm tắt bài 1

- **`cost` không có đơn vị** — nó quy về "đọc tuần tự một page = 1,0", và chỉ có nghĩa khi **so hai kế hoạch của cùng một truy vấn**.
- Có **bảy nguyên nhân** khiến index bị bỏ qua, và nguyên nhân phổ biến nhất là **quét toàn bảng thật sự rẻ hơn** — optimizer chọn đúng.
- Chẩn đoán bằng `SET enable_seqscan = off` rồi **so thời gian thật**: nhanh hơn nghĩa là optimizer sai (nghi thống kê hoặc `random_page_cost`); chậm hơn nghĩa là optimizer đúng.
- Index trên cột nhiều giá trị trùng: **khử trùng lặp (PG13) làm nó nhỏ hơn 4 lần nhưng không hữu ích hơn**. Cách hiệu quả nhất là **index bộ phận**.
- Xoá index không dùng phải kiểm tra ba điều: thống kê đã đủ một chu kỳ nghiệp vụ chưa, nó có đang thực thi ràng buộc không, và **nó có được dùng trên replica không** — điều thứ ba là cái bẫy nguy hiểm nhất.
- Mẹo `UPDATE pg_index SET indisvalid = false` cho phép **vô hiệu hoá index để thử trước khi xoá**, và quay lại tức thì nếu có gì chậm đi.
- **`EXPLAIN ANALYZE` chạy thật** — luôn bọc lệnh ghi trong `BEGIN`/`ROLLBACK`. Và chi phí đo có thể làm truy vấn chậm hơn 2-3 lần; dùng `TIMING OFF` khi cần con số chính xác.
- `CREATE INDEX` chặn ghi vì **index thiếu dữ liệu còn tệ hơn không có index** — nó khiến truy vấn trả về kết quả sai.
- **`Heap Fetches` lớn trong `Index Only Scan`** là dấu hiệu visibility map chưa được `VACUUM` cập nhật — nguyên nhân bị bỏ sót nhiều nhất.

**Bài kế tiếp** → [Bài 2: Hỏi & Đáp - Transactions, Connections và Miscellaneous](02-hoi-dap-transactions-connections-va-misc.md)

# Bài 3: Composite Index và Optimizer — vì sao index `(a, b)` vô dụng với `WHERE b = ?`

Hai cột. Bốn câu truy vấn. Ba cách bố trí index. Kết quả:

```text
                          index (a) + (b)    index (a,b)    (a,b) + (b)
   WHERE a = 70              253 ms            250 ms          250 ms
   WHERE b = 100             250 ms         ▶ 4.100 ms ◀        251 ms
   WHERE a=70 AND b=100        8 ms           ▶ 0,5 ms ◀        0,5 ms
   WHERE a=70 OR  b=100      412 ms         ▶ 4.200 ms ◀        418 ms
```

Cùng một dữ liệu. Cột giữa vừa cho câu **nhanh nhất bảng** (0,5 ms) vừa cho câu **chậm nhất bảng** (4.100 ms). Chênh nhau **8.200 lần** trong cùng một cấu hình.

Bài này giải thích quy tắc duy nhất đằng sau toàn bộ bảng trên, rồi đi sâu vào kẻ ra quyết định: **optimizer**.

## Quy tắc tiền tố trái — quy tắc quan trọng nhất về index

> **Index composite `(a, b, c)` chỉ dùng được cho các điều kiện tạo thành TIỀN TỐ TRÁI của danh sách cột.**
>
> Dùng được: `a` · `a, b` · `a, b, c`
> Không dùng được: `b` · `c` · `b, c`

Vì sao? Nhìn vào cách index thật sự được sắp xếp:

```text
   INDEX TRÊN (last_name, first_name) — giống hệt danh bạ điện thoại

   Nguyen, An
   Nguyen, Binh
   Nguyen, Chi
   Pham,   An        ← để ý: các "An" KHÔNG nằm cạnh nhau
   Pham,   Duc
   Tran,   An        ←
   Tran,   Binh

   TÌM "họ Pham"                    → nhảy thẳng tới khối Pham    ✔
   TÌM "họ Pham, tên Duc"           → nhảy tới Pham, rồi tới Duc  ✔
   TÌM "tên An" (bất kể họ)         → các An nằm RẢI RÁC khắp nơi ✘
                                       → phải đọc toàn bộ danh bạ
```

Đó là toàn bộ lý do. Index được sắp xếp theo cột đầu **trước**, cột thứ hai chỉ dùng để phân định thứ tự **bên trong** mỗi nhóm cột đầu. Không có cột đầu thì không có điểm bắt đầu để nhảy tới.

Đây cũng chính là lý do quyển danh bạ xếp theo họ không giúp bạn tìm người theo tên.

---

## Ma trận thực nghiệm: 3 cấu hình × 4 truy vấn

Dựng bảng:

```sql
CREATE TABLE test (a INT, b INT, c INT);

INSERT INTO test (a, b, c)
SELECT (random()*1000)::INT, (random()*1000)::INT, (random()*1000)::INT
FROM generate_series(1, 12000000);

VACUUM ANALYZE test;
```

12 triệu dòng, mỗi cột có 1.001 giá trị khác nhau → mỗi giá trị khớp khoảng **12.000 dòng**.

### Cấu hình A — hai index riêng lẻ

```sql
CREATE INDEX idx_a ON test(a);
CREATE INDEX idx_b ON test(b);
```

**A-1: `WHERE a = 70`**

```sql
EXPLAIN ANALYZE SELECT c FROM test WHERE a = 70;
```

```text
Bitmap Heap Scan on test  (actual time=8.117..248.882 rows=11982 loops=1)
  Recheck Cond: (a = 70)
  Heap Blocks: exact=11418
  ->  Bitmap Index Scan on idx_a  (actual time=4.882..4.883 rows=11982 loops=1)
        Index Cond: (a = 70)
Execution Time: 253.117 ms
```

Bitmap scan — đúng như dự đoán ở [bài 2](02-index-scan-va-covering-index.md): 12.000 dòng là "vừa phải", nên gom bitmap rồi đọc một lượt.

Thêm `LIMIT 2` thì planner đổi ý:

```sql
EXPLAIN ANALYZE SELECT c FROM test WHERE a = 70 LIMIT 2;
```

```text
Limit  (actual time=0.048..0.052 rows=2 loops=1)
  ->  Index Scan using idx_a on test  (actual time=0.046..0.049 rows=2 loops=1)
        Index Cond: (a = 70)
Execution Time: 0.078 ms
```

Chỉ cần 2 dòng thì dựng bitmap là phí công — nhảy thẳng nhanh hơn. Đây là ví dụ đầu tiên cho thấy **planner cân nhắc theo số dòng cần trả về**, không chỉ theo điều kiện `WHERE`.

**A-3: `WHERE a = 70 AND b = 100`**

```text
Bitmap Heap Scan on test  (actual time=7.882..8.118 rows=12 loops=1)
  Recheck Cond: ((a = 70) AND (b = 100))
  ->  BitmapAnd  (actual time=7.812..7.813 rows=0 loops=1)
        ->  Bitmap Index Scan on idx_a   (rows=11982 loops=1)
        ->  Bitmap Index Scan on idx_b   (rows=12043 loops=1)
Execution Time: 8.226 ms
```

`BitmapAnd` — hai index riêng lẻ hợp tác với nhau. Quét cả hai, giao hai bitmap, còn 12 dòng.

**A-4: `WHERE a = 70 OR b = 100`**

```text
Bitmap Heap Scan on test  (actual time=22.118..408.882 rows=23913 loops=1)
  Recheck Cond: ((a = 70) OR (b = 100))
  ->  BitmapOr
        ->  Bitmap Index Scan on idx_a   (rows=11982)
        ->  Bitmap Index Scan on idx_b   (rows=12043)
Execution Time: 412.334 ms
```

`BitmapOr` — hợp hai bitmap. Chậm hơn `AND` vì kết quả nhiều gấp đôi.

### Cấu hình B — chỉ một index composite

```sql
DROP INDEX idx_a, idx_b;
CREATE INDEX idx_ab ON test(a, b);
```

**B-1: `WHERE a = 70`** → **vẫn dùng được index**

```text
Bitmap Heap Scan on test  (actual time=8.442..246.118 rows=11982 loops=1)
  ->  Bitmap Index Scan on idx_ab
        Index Cond: (a = 70)
Execution Time: 250.882 ms
```

`a` là **tiền tố trái** → dùng được. Đây là lý do index `(a, b)` khiến index `(a)` riêng lẻ trở nên **thừa** — xoá được index `(a)` để tiết kiệm đĩa và tốc độ ghi.

**B-2: `WHERE b = 100`** → **thảm hoạ**

```text
Gather  (actual time=1.882..4088.117 rows=12043 loops=1)
  Workers Launched: 2
  ->  Parallel Seq Scan on test
        Filter: (b = 100)
        Rows Removed by Filter: 3995986
Execution Time: 4102.883 ms
```

```text
   250 ms  →  4.103 ms      CHẬM HƠN 16 LẦN
```

Có index chứa cột `b` nằm ngay đó. Không dùng được. Vì `b` không phải tiền tố trái.

Đây là cái bẫy nguy hiểm nhất của composite index, và nó thường lộ ra **sau khi triển khai** — vì lúc phát triển bảng còn nhỏ.

**B-3: `WHERE a = 70 AND b = 100`** → **nhanh nhất bảng**

```text
Index Scan using idx_ab on test  (actual time=0.042..0.488 rows=12 loops=1)
  Index Cond: ((a = 70) AND (b = 100))
Execution Time: 0.512 ms
```

```text
   Hai index riêng: 8,2 ms
   Composite      : 0,5 ms      NHANH HƠN 16 LẦN
```

Vì sao chênh nhiều vậy? Nhìn vào lượng việc:

```text
   HAI INDEX RIÊNG (BitmapAnd)          COMPOSITE (a,b)
   ═══════════════════════════          ═══════════════
   Quét idx_a  → 11.982 mục             Nhảy thẳng tới khối (70, 100)
   Quét idx_b  → 12.043 mục             → đọc đúng 12 mục
   Dựng 2 bitmap
   Giao 2 bitmap
   → xử lý 24.025 mục để ra 12 dòng     → xử lý 12 mục để ra 12 dòng

                                          ÍT HƠN 2.000 LẦN CÔNG SỨC
```

**B-4: `WHERE a = 70 OR b = 100`** → quét toàn bảng, 4.200 ms. Vì `OR` cần index cho **cả hai** vế, mà vế `b` thì không có.

### Cấu hình C — composite cộng thêm index cho `b`

```sql
CREATE INDEX idx_b ON test(b);   -- thêm vào, vẫn giữ idx_ab
```

| Truy vấn | Kế hoạch | Thời gian |
|---|---|---|
| `WHERE a = 70` | Bitmap trên `idx_ab` | 250 ms |
| `WHERE b = 100` | Bitmap trên `idx_b` | 251 ms |
| `WHERE a=70 AND b=100` | Index Scan trên `idx_ab` | **0,5 ms** |
| `WHERE a=70 OR b=100` | `BitmapOr` trên `idx_ab` + `idx_b` | 418 ms |

Đây là cấu hình tốt nhất — **mọi truy vấn đều nhanh**. Cái giá: hai index thay vì một.

```text
   idx_ab :  386 MB
   idx_b  :  268 MB
   ─────────────────
   Tổng   :  654 MB   (bảng chỉ 508 MB)

   Và mỗi INSERT phải cập nhật cả hai.
```

### Bảng tổng kết

| | `(a)` + `(b)` | `(a, b)` | `(a, b)` + `(b)` |
|---|---|---|---|
| `WHERE a = ?` | 253 ms | 250 ms | 250 ms |
| `WHERE b = ?` | 250 ms | **4.103 ms** | 251 ms |
| `WHERE a=? AND b=?` | 8,2 ms | **0,5 ms** | **0,5 ms** |
| `WHERE a=? OR b=?` | 412 ms | **4.203 ms** | 418 ms |
| Dung lượng index | 536 MB | **386 MB** | 654 MB |
| Phí mỗi lệnh ghi | 2 index | **1 index** | 2 index |

Không có cấu hình nào thắng tuyệt đối. Chọn theo **truy vấn thật sự chạy nhiều nhất** trong hệ của bạn.

---

## Thứ tự cột trong composite index

Đã biết thứ tự quan trọng. Vậy đặt cột nào trước?

### Quy tắc 1 — Điều kiện bằng trước, điều kiện khoảng sau

```sql
-- Truy vấn:
SELECT * FROM orders WHERE status = 'paid' AND created_at > '2026-01-01';

-- ĐÚNG
CREATE INDEX idx_ok  ON orders(status, created_at);
-- SAI
CREATE INDEX idx_bad ON orders(created_at, status);
```

Vì sao? Nhìn vào cách index được duyệt:

```text
   INDEX (status, created_at) — ĐÚNG
   ══════════════════════════════════
   'cancelled', 2026-01-01
   'cancelled', 2026-02-15
   'paid',      2025-12-01
   'paid',      2026-01-02   ┐
   'paid',      2026-03-11   ├─ khối liên tục, đọc thẳng ✔
   'paid',      2026-05-20   ┘
   'pending',   2026-01-08

   → Nhảy tới ('paid', 2026-01-01), đọc liên tiếp tới hết khối 'paid'.

   INDEX (created_at, status) — SAI
   ═════════════════════════════════
   2026-01-01, 'cancelled'
   2026-01-02, 'paid'        ← lấy
   2026-01-08, 'pending'     ← bỏ
   2026-02-15, 'cancelled'   ← bỏ
   2026-03-11, 'paid'        ← lấy
   2026-05-20, 'paid'        ← lấy

   → Phải đọc MỌI mục từ 2026-01-01 trở đi rồi lọc từng cái.
     Điều kiện `status` chỉ là FILTER, không phải INDEX COND.
```

Nhận biết trong `EXPLAIN`: cấu hình sai sẽ hiện `Filter: (status = 'paid')` bên dưới `Index Cond`, kèm `Rows Removed by Filter` lớn.

Quy tắc tổng quát: **sau cột đầu tiên có điều kiện khoảng, mọi cột phía sau chỉ còn dùng để lọc, không dùng để nhảy nữa.**

### Quy tắc 2 — Cột dùng cho `ORDER BY` đặt ngay sau các cột lọc bằng

```sql
SELECT * FROM orders
WHERE user_id = 42
ORDER BY created_at DESC
LIMIT 20;

CREATE INDEX idx_orders_user_time ON orders(user_id, created_at DESC);
```

Index này làm được **cả ba việc** trong một lần duyệt: lọc `user_id`, ra đúng thứ tự, và dừng sau 20 dòng. Không cần bước sắp xếp nào.

### Quy tắc 3 — Cột chọn lọc cao đặt trước (nhưng đây là quy tắc yếu nhất)

Lời khuyên phổ biến là "cột có nhiều giá trị khác nhau nhất đặt trước". Nó **thường** đúng, nhưng thua hai quy tắc trên. Với B-Tree, một khi đã lọc bằng ở cột đầu thì thứ tự giữa các cột lọc bằng còn lại ít quan trọng.

Điều **thật sự** quan trọng là: **cột nào xuất hiện trong nhiều truy vấn nhất thì đặt trước** — vì như vậy index phục vụ được nhiều truy vấn hơn nhờ quy tắc tiền tố trái.

```text
   Ứng dụng chạy 3 truy vấn:
     Q1: WHERE tenant_id = ?
     Q2: WHERE tenant_id = ? AND status = ?
     Q3: WHERE tenant_id = ? AND status = ? AND created_at > ?

   MỘT index (tenant_id, status, created_at) phục vụ CẢ BA.
   → Đây là sức mạnh thật của quy tắc tiền tố trái.
```

---

## Optimizer quyết định thế nào

Bây giờ tới kẻ đứng sau mọi bảng số ở trên. **Optimizer** (còn gọi là *planner*) nhận câu SQL rồi tự chọn cách thực thi rẻ nhất.

Với `WHERE f1 = 1 AND f2 = 4` khi cả hai cột đều có index, nó có **ba** phương án:

```text
   PHƯƠNG ÁN 1 — DÙNG CẢ HAI INDEX
   ════════════════════════════════
   quét index f1 → tập row ID A
   quét index f2 → tập row ID B
   giao A ∩ B → đi lấy dòng
   Chọn khi: mỗi index lọc được kha khá, và giao lại thì rất ít

   PHƯƠNG ÁN 2 — DÙNG MỘT INDEX, LỌC PHẦN CÒN LẠI
   ═══════════════════════════════════════════════
   quét index f1 (cái chọn lọc hơn) → lấy dòng → lọc f2 = 4 tại chỗ
   Chọn khi: f1 lọc rất mạnh (ví dụ khoá chính) còn f2 thì không
             → quét thêm index f2 không bõ công

   PHƯƠNG ÁN 3 — KHÔNG DÙNG INDEX NÀO
   ═══════════════════════════════════
   quét toàn bảng, lọc cả hai điều kiện tại chỗ
   Chọn khi: ước lượng kết quả quá lớn (>20-30% bảng)
             → nhảy ngẫu nhiên còn đắt hơn đọc thẳng
```

Câu hỏi tiếp theo: **làm sao optimizer biết mỗi phương án tốn bao nhiêu khi nó chưa chạy?**

### Thống kê — nguồn thông tin duy nhất của optimizer

Nó không đếm. Nó **lấy mẫu** rồi suy ra, và cất kết quả vào một bảng thống kê:

```sql
SELECT attname,
       n_distinct,
       null_frac,
       correlation,
       most_common_vals[1:3] AS ba_gia_tri_pho_bien
FROM pg_stats
WHERE tablename = 'test';
```

```text
 attname | n_distinct | null_frac | correlation | ba_gia_tri_pho_bien
---------+------------+-----------+-------------+---------------------
 a       |       1001 |         0 |    0.001882 | {418,672,203}
 b       |       1001 |         0 |    0.000441 | {77,915,338}
 c       |       1001 |         0 |    0.002118 | {556,12,880}
```

| Cột | Ý nghĩa | Dùng để làm gì |
|---|---|---|
| `n_distinct` | Số giá trị khác nhau (âm = tỉ lệ so với tổng số dòng) | Ước lượng `WHERE x = ?` khớp bao nhiêu dòng |
| `null_frac` | Tỉ lệ NULL | Ước lượng `IS NULL` |
| `correlation` | Mức khớp giữa thứ tự giá trị và thứ tự vật lý | Quyết định index scan đắt hay rẻ |
| `most_common_vals` | Các giá trị phổ biến nhất kèm tần suất | Xử lý dữ liệu lệch phân bố |
| `histogram_bounds` | Các mốc chia đều dữ liệu | Ước lượng `WHERE x BETWEEN ...` |

Cách optimizer tính cho `WHERE a = 70`:

```text
   n_distinct = 1001,  tổng số dòng = 12.000.000
   70 không nằm trong most_common_vals
   → ước lượng = 12.000.000 / 1001 ≈ 11.988 dòng

   Thực tế đo được: 11.982 dòng.   Sai số 0,05%. Rất tốt.
```

Con số ước lượng này quyết định **toàn bộ** kế hoạch. Sai nó là sai hết.

### Thảm hoạ kinh điển: nạp dữ liệu rồi truy vấn ngay

Đây là cái bẫy làm rất nhiều người mất buổi tối, và tái hiện được trong 30 giây:

```sql
CREATE TABLE fresh (id INT, val INT);
INSERT INTO fresh VALUES (1, 1), (2, 2), (3, 3);
ANALYZE fresh;                                  -- thống kê: 3 dòng

-- Bây giờ nạp 5 triệu dòng, KHÔNG chạy ANALYZE lại
INSERT INTO fresh SELECT i, i % 1000 FROM generate_series(1, 5000000) AS i;
CREATE INDEX idx_fresh ON fresh(val);

EXPLAIN ANALYZE SELECT * FROM fresh WHERE val = 500;
```

```text
Seq Scan on fresh  (cost=0.00..42.55 rows=1 width=8)
                   (actual time=0.442..1882.117 rows=5000 loops=1)
  Filter: (val = 500)
  Rows Removed by Filter: 4995003
Execution Time: 1884.226 ms
```

Nhìn kỹ khoảng cách giữa hai con số:

```text
   cost=0.00..42.55       ← optimizer nghĩ bảng này CHỈ CÓ 3 DÒNG
   actual time=1882 ms    ← thực tế 5 triệu dòng

   Nó chọn Seq Scan vì "quét 3 dòng thì cần gì index".
```

Chữa:

```sql
ANALYZE fresh;
EXPLAIN ANALYZE SELECT * FROM fresh WHERE val = 500;
```

```text
Bitmap Heap Scan on fresh  (cost=57.42..7882.11 rows=5033 width=8)
                           (actual time=1.118..8.442 rows=5000 loops=1)
  ->  Bitmap Index Scan on idx_fresh
Execution Time: 8.882 ms
```

```text
   1.884 ms  →  8,9 ms      NHANH HƠN 212 LẦN, chỉ nhờ một lệnh ANALYZE
```

> **Quy tắc vàng:** sau mỗi lần nạp dữ liệu lớn (migration, nhập hàng loạt, khôi phục sao lưu), **luôn chạy `ANALYZE`** trước khi cho lưu lượng thật vào. Autovacuum sẽ tự làm, nhưng nó chạy không đồng bộ và có thể trễ vài phút — vừa đủ để hệ thống sập.

### Chẩn đoán thống kê sai

Dấu hiệu nhận biết: so `rows=` ước lượng với `rows=` thực tế trong `EXPLAIN ANALYZE`.

```text
   (cost=... rows=1 ...) (actual ... rows=5000 ...)
              ▲                        ▲
          ước lượng                 thực tế
          lệch 5.000 LẦN → thống kê chắc chắn sai
```

Lệch dưới 10 lần thường vô hại. Lệch trên 100 lần gần như luôn dẫn tới kế hoạch sai.

Khi thống kê không đủ chi tiết, tăng độ phân giải cho riêng cột đó:

```sql
ALTER TABLE test ALTER COLUMN a SET STATISTICS 500;   -- mặc định 100
ANALYZE test;
```

Và với các cột **phụ thuộc lẫn nhau** (ví dụ `thanh_pho` và `quoc_gia`), optimizer mặc định giả định chúng độc lập — dẫn tới ước lượng sai nghiêm trọng. Chữa bằng thống kê mở rộng:

```sql
CREATE STATISTICS stat_dia_chi (dependencies)
  ON thanh_pho, quoc_gia FROM addresses;
ANALYZE addresses;
```

---

## `random_page_cost` — nút vặn dịch chuyển điểm lật

Optimizer so sánh chi phí bằng các hằng số cấu hình:

```sql
SELECT name, setting FROM pg_settings
WHERE name IN ('seq_page_cost','random_page_cost','cpu_tuple_cost','effective_cache_size');
```

```text
         name         | setting
----------------------+---------
 cpu_tuple_cost       | 0.01
 effective_cache_size | 524288
 random_page_cost     | 4
 seq_page_cost        | 1
```

`random_page_cost = 4` nghĩa là: *"đọc một page ngẫu nhiên đắt gấp 4 lần đọc tuần tự."*

Con số 4 này là mặc định từ **thời ổ đĩa quay**. Trên SSD, tỉ lệ thật gần với **1,1-2**. Để nguyên 4 nghĩa là bạn đang nói dối optimizer rằng index đắt hơn thực tế — và nó sẽ **bỏ qua index quá sớm**.

```sql
ALTER SYSTEM SET random_page_cost = 1.1;   -- cho SSD/NVMe
SELECT pg_reload_conf();
```

Đây là một trong những chỉnh sửa hiệu quả nhất trên mỗi phút bỏ ra khi tối ưu PostgreSQL, và cũng là một trong những cái bị bỏ quên nhiều nhất.

Tương tự, `effective_cache_size` nên đặt khoảng **50-75% RAM máy** — nó cho optimizer biết bao nhiêu dữ liệu có khả năng đang nằm trong cache (của cả PostgreSQL lẫn hệ điều hành).

### Đo điểm lật trên máy bạn

```sql
-- Thử với nhiều mức selectivity khác nhau
EXPLAIN SELECT * FROM test WHERE a < 10;    -- ~1% bảng
EXPLAIN SELECT * FROM test WHERE a < 50;    -- ~5%
EXPLAIN SELECT * FROM test WHERE a < 100;   -- ~10%
EXPLAIN SELECT * FROM test WHERE a < 300;   -- ~30%
```

```text
   a < 10   →  Bitmap Heap Scan
   a < 50   →  Bitmap Heap Scan
   a < 100  →  Bitmap Heap Scan
   a < 300  →  Seq Scan            ← ĐIỂM LẬT nằm giữa 10% và 30%
```

Biết điểm lật của hệ mình giúp bạn dự đoán được khi nào index sẽ ngừng có tác dụng — thay vì ngạc nhiên lúc dữ liệu lớn lên.

---

## Ép optimizer — chỉ để chẩn đoán

PostgreSQL cố tình **không** hỗ trợ gợi ý trong câu lệnh (khác với Oracle và MySQL). Triết lý: nếu planner chọn sai thì phải sửa thống kê hoặc cấu hình, không phải vá từng câu.

Nhưng có công tắc để **chẩn đoán**:

```sql
SET enable_seqscan = off;
EXPLAIN ANALYZE SELECT * FROM test WHERE a = 70;
RESET enable_seqscan;
```

Cách dùng đúng: chạy cả hai kiểu rồi so thời gian thật.

```text
   Nếu ép dùng index mà NHANH HƠN  →  optimizer đang sai
      → nghi ngờ: thống kê cũ, hoặc random_page_cost quá cao

   Nếu ép dùng index mà CHẬM HƠN   →  optimizer đúng, bạn sai
      → chấp nhận và đi tìm cách khác
```

> Không bao giờ để `enable_seqscan = off` trong cấu hình production. Nó không phải "tắt seq scan" — nó chỉ gán cho seq scan một chi phí khổng lồ, và sẽ đẻ ra những kế hoạch kỳ quặc ở các câu truy vấn khác.

Nếu thật sự cần ép trong production, có extension `pg_hint_plan`:

```sql
/*+ IndexScan(test idx_ab) */ SELECT * FROM test WHERE a = 70;
```

### Ghi chú: MySQL có "skip scan", PostgreSQL thì không

MySQL 8.0 có tính năng **Index Skip Scan**: khi cột đầu của composite index có rất ít giá trị khác nhau, nó có thể "nhảy qua" từng giá trị của cột đầu để dùng được cột thứ hai.

```text
   Index (gioi_tinh, tuoi), gioi_tinh chỉ có 2 giá trị
   WHERE tuoi = 30

   MySQL 8 skip scan:  thử gioi_tinh='nam' + tuoi=30
                       thử gioi_tinh='nu'  + tuoi=30
                       → vẫn dùng được index

   PostgreSQL:         không có → Seq Scan
```

Đây là một trong số ít điểm MySQL vượt PostgreSQL về tối ưu truy vấn. Trên PostgreSQL, giải pháp là tạo thêm index trên cột thứ hai.

---

## Danh sách kiểm tra khi thiết kế composite index

| # | Câu hỏi | Vì sao |
|---|---|---|
| 1 | Truy vấn nào chạy nhiều nhất (theo **tổng** thời gian)? | Thiết kế cho nó, không cho truy vấn hiếm |
| 2 | Cột nào xuất hiện trong **nhiều** truy vấn nhất? | Đặt trước để nhiều truy vấn hưởng tiền tố trái |
| 3 | Có cột nào dùng điều kiện **khoảng** không? | Đặt sau cùng trong nhóm cột lọc |
| 4 | Có `ORDER BY` không? | Đặt cột đó ngay sau các cột lọc bằng |
| 5 | Cột nào chỉ để **lấy ra**? | Đưa vào `INCLUDE`, không vào khoá |
| 6 | Index nào trở thành **thừa** sau khi tạo cái này? | `(a,b)` làm `(a)` thành thừa — xoá đi |
| 7 | Có nên dùng **partial index** không? | Nếu chỉ truy vấn một phần dữ liệu |

Câu 6 đáng chú ý: tìm index thừa bằng cách so danh sách cột:

```sql
SELECT indexrelname, indkey::text
FROM pg_stat_user_indexes
JOIN pg_index ON indexrelid = pg_index.indexrelid
WHERE relname = 'test'
ORDER BY indkey::text;
```

Index nào có danh sách cột là **tiền tố** của index khác thì gần như chắc chắn là thừa.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Tưởng `(a,b)` dùng được cho `WHERE b = ?` | Vi phạm quy tắc tiền tố trái | Tạo thêm index trên `b`, hoặc đảo thứ tự nếu `b` được truy vấn nhiều hơn |
| Đặt cột khoảng trước cột bằng | Sau cột khoảng, các cột sau chỉ còn để lọc | Bằng trước, khoảng sau |
| Truy vấn ngay sau khi nạp dữ liệu lớn | Thống kê còn của bảng cũ → kế hoạch sai thảm hoạ | Luôn `ANALYZE` sau khi nạp |
| Để `random_page_cost = 4` trên SSD | Optimizer nghĩ index đắt hơn thực tế → bỏ index quá sớm | Đặt 1,1-2 cho SSD |
| Tạo index cho mọi tổ hợp cột | Bùng nổ tổ hợp; `BitmapAnd` đã lo được phần lớn | Chỉ tạo cho các tổ hợp thật sự nóng |
| Giữ `enable_seqscan = off` trong production | Đẻ ra kế hoạch kỳ quặc ở các câu khác | Chỉ dùng để chẩn đoán, rồi `RESET` |
| Bỏ qua chênh lệch `rows=` ước lượng vs thực tế | Đây là dấu hiệu **duy nhất** cho biết thống kê sai | So hai con số mỗi lần đọc `EXPLAIN ANALYZE` |
| Quên xoá index đã thành thừa | Tốn đĩa, tốn RAM, làm chậm mọi lệnh ghi | Rà index có cột là tiền tố của index khác |

## Tóm tắt bài 3

- **Quy tắc tiền tố trái** là quy tắc quan trọng nhất: index `(a,b,c)` chỉ dùng được cho `a`, `(a,b)`, `(a,b,c)` — không dùng được cho `b` hay `c` đơn lẻ.
- Ma trận thực nghiệm cho thấy composite `(a,b)` vừa tạo ra câu **nhanh nhất** (0,5 ms cho `a AND b`) vừa tạo ra câu **chậm nhất** (4.103 ms cho `b` đơn lẻ) — chênh **8.200 lần**.
- Thứ tự cột: **bằng trước, khoảng sau**; cột `ORDER BY` đặt ngay sau các cột lọc bằng; cột xuất hiện trong nhiều truy vấn nhất đặt đầu.
- Optimizer có **ba** phương án khi có nhiều index: dùng cả hai (`BitmapAnd`), dùng một rồi lọc, hoặc bỏ hết mà quét toàn bảng.
- Nó quyết định dựa **hoàn toàn** vào **thống kê**. Nạp dữ liệu lớn rồi truy vấn trước khi `ANALYZE` là thảm hoạ kinh điển — đo được **212 lần** chậm hơn.
- Chẩn đoán bằng cách so `rows=` **ước lượng** với `rows=` **thực tế** trong `EXPLAIN ANALYZE`. Lệch trên 100 lần gần như luôn là thống kê sai.
- `random_page_cost = 4` là mặc định từ thời ổ đĩa quay. Trên SSD nên đặt **1,1-2**, nếu không optimizer sẽ bỏ index quá sớm.
- `enable_seqscan = off` chỉ để **chẩn đoán**: chạy hai kiểu, so thời gian thật, rồi `RESET`.

**Bài kế tiếp** → [Bài 4: Bloom Filters và UUID Performance](04-bloom-filter-va-uuid-performance.md)

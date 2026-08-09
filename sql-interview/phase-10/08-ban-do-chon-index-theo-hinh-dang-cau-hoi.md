# Bài 8: Bản đồ chọn index — từ hình dạng câu hỏi tới cấu trúc, trong 60 giây

Bảy bài trước, mỗi bài một cấu trúc. Bài này gộp chúng lại thành **một quy trình bạn chạy được ngay trên bảng của mình**, cộng bộ câu hỏi phỏng vấn tổng hợp.

Nguyên tắc xuyên suốt, nhắc lại lần cuối:

> **Đừng hỏi "cột này có nên đánh index không". Hỏi "câu này có hình dạng gì", rồi mới chọn cấu trúc mang đúng hình dạng đó. Thứ tự hai câu hỏi mới là thứ quyết định.**

---

## Phần 1 — Cây quyết định

```text
                    Câu truy vấn của bạn hỏi cái gì?
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   SO SÁNH được            "CHỨA" cái gì đó        "GẦN" cái gì đó
   (=, <, >, BETWEEN,      (từ, chuỗi con,         (toạ độ, ý nghĩa)
    tiền tố, ORDER BY)      phần tử, khoá JSON)           │
        │                       │                        │
        ▼                       ▼                        ▼
  ┌─────────────┐        ┌─────────────┐        ┌────────────────┐
  │  Bảng lớn?  │        │ Đơn vị tìm  │        │  Mấy chiều?    │
  │  Đã sắp sẵn │        │ là gì?      │        │                │
  │  trên đĩa?  │        └──────┬──────┘        └───────┬────────┘
  └──────┬──────┘               │                       │
    ┌────┴────┐        ┌────────┼────────┐        ┌─────┴──────┐
   Có        Không     │        │        │       2-3         hàng nghìn
    │          │      TỪ    CHUỖI CON  PHẦN TỬ    │              │
    ▼          ▼       │        │        │        ▼              ▼
  BRIN      B-TREE     ▼        ▼        ▼      GiST /        HNSW /
 (bài 5)    (bài 2)   GIN      GIN      GIN     SP-GiST      IVFFlat
            + partial  tsvector trgm    jsonb   (bài 1)      (bài 7)
            + covering (bài 6)  (bài 6) /array
                                        (bài 6)

  Nhánh riêng: bảng CHỈ ĐỌC + nhiều cột ít giá trị + lọc nhiều điều kiện
            → BITMAP (Oracle) / cột-store  (bài 4)
  Nhánh riêng: khoá rất dài, chỉ tra "=", index không vừa RAM
            → HASH, hoặc B-Tree trên md5(cột)  (bài 3)
```

## Phần 2 — Bảng tra một trang

| Hình dạng câu hỏi | Ví dụ SQL | Cấu trúc | Cái giá phải nói kèm |
|---|---|---|---|
| Bằng, khoảng, tiền tố, thứ tự | `WHERE id = ?`, `ORDER BY ngay DESC LIMIT 20` | **B-Tree** | Ghi chậm hơn, index có thể to bằng dữ liệu |
| Bằng, trên khoá **rất dài** | `WHERE url = ?` (url 200 byte) | **Hash**, hoặc B-Tree trên `md5(url)` | Mất thứ tự, mất phủ, mất `UNIQUE`, mất nhiều cột |
| Chỉ một nhánh giá trị, phân bố lệch | `WHERE trang_thai = 'loi'` (0,3%) | **Partial B-Tree** | Chỉ phục vụ đúng điều kiện trong `WHERE` của index |
| Nhiều cột ít giá trị, bảng **chỉ đọc** | `WHERE tt=? AND kenh=? AND mien=?` | **Bitmap** (Oracle) / cột-store | Khoá cả cụm khi ghi → cấm dùng cho OLTP |
| Khoảng trên bảng **rất lớn đã sắp** | `WHERE tao_luc >= now()-'7d'` trên bảng log 2 tỉ dòng | **BRIN** | Vỡ im lặng khi correlation tụt |
| Chứa **từ** | `to_tsvector(...) @@ to_tsquery(...)` | **GIN + tsvector** | Bộ tách từ + từ điển đông cứng lúc tạo index |
| Chứa **chuỗi con** | `ILIKE '%giữa%'` | **GIN + pg_trgm** | Index to gấp 3-10 lần, ghi rất chậm |
| Chứa **phần tử / khoá JSON** | `tags @> ARRAY[...]`, `meta @> '{...}'` | **GIN** (`jsonb_path_ops` nếu chỉ `@>`) | Ghi chậm; cân nhắc `fastupdate` |
| **Gần nhau** trong 2-3 chiều | `ORDER BY vitri <-> point(...)` | **GiST / SP-GiST** | GiST có sai dương → phải kiểm lại |
| **Chồng lấn** khoảng | `EXCLUDE USING gist (phong WITH =, khoang WITH &&)` | **GiST** | Chỉ GiST làm được ràng buộc này |
| **Giống ý** trong nghìn chiều | `ORDER BY emb <=> ? LIMIT 10` | **HNSW / IVFFlat** | Recall < 100%, tốn RAM |
| Cột **ít giá trị**, bảng OLTP, phân bố đều | `WHERE gioi_tinh = 'nam'` | **Không index** | Optimizer bỏ qua là đúng |

## Phần 3 — Bảng đối chiếu bảy cấu trúc

| | B-Tree | Hash | GIN | GiST | SP-GiST | BRIN | HNSW |
|---|---|---|---|---|---|---|---|
| Cơ số mỗi tầng | vài trăm | — (1 bước) | vài trăm | vài chục | 2-4 | — (quét dải) | ~m hàng xóm |
| `=` | ✅ | ✅ | ✅ | ✅ | ✅ | ~ (theo dải) | ❌ |
| Khoảng / thứ tự | ✅ | ❌ | ❌ | ~ | ~ | ✅ | ❌ |
| `ORDER BY` miễn phí | ✅ | ❌ | ❌ | ~ (kNN) | ❌ | ❌ | ✅ (theo khoảng cách) |
| Nhiều cột | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ❌ |
| `UNIQUE` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Index phủ (`INCLUDE`) | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Cỡ so với dữ liệu | ~1× | ~0,2× | ~1-3× | ~1× | ~0,5× | **~0,0001×** | ~1,5× |
| Chi phí ghi | thấp | thấp | **rất cao** | trung bình | trung bình | **rất thấp** | cao |
| Kết quả chính xác? | ✅ | ✅ | ✅ | phải kiểm lại | ✅ | phải kiểm lại | **❌ ~95%** |
| Điều kiện ngầm | không | không | từ điển cố định | — | — | **correlation cao** | dữ liệu có cấu trúc |

Ba dòng cuối là ba dòng đáng nhớ nhất: **cỡ**, **chi phí ghi**, và **điều kiện ngầm**. Chúng là ba vế mà ứng viên thường bỏ quên khi chỉ nói về tốc độ đọc.

## Phần 4 — Bản đồ sang các hệ khác

| Nhu cầu | PostgreSQL | MySQL 8 | SQL Server | Oracle |
|---|---|---|---|---|
| Mặc định | btree | B+Tree (InnoDB) | B+Tree | B-Tree |
| Bằng, khoá dài | `USING HASH` | — (chỉ AHI tự động) | Hash (memory-optimized) | Hash cluster |
| Cột ít giá trị, kho dữ liệu | *(không có)* → partial / `btree_gin` / cột-store | — | Columnstore Index | **Bitmap Index** |
| Full-text | `GIN + tsvector` | `FULLTEXT INDEX` | Full-Text Index | Oracle Text |
| Chuỗi con | `pg_trgm` | ngram parser (CJK) | — | — |
| JSON | `GIN` trên `jsonb` | index trên cột sinh | index trên cột tính | JSON search index |
| Không gian | `GiST` / PostGIS | `SPATIAL INDEX` (R-Tree) | Spatial Index | Spatial |
| Bảng lớn đã sắp | `BRIN` | — | Columnstore | Zone Map (Exadata) |
| Vector | `pgvector` (hnsw/ivfflat) | HeatWave / MySQL 9 `VECTOR` | Vector (2025) | AI Vector Search (23ai) |

Dòng đáng nhớ nhất: **MySQL không có tương đương của partial index và BRIN**, nên với bảng log rất lớn, cách làm chuẩn ở MySQL là **phân vùng theo thời gian** thay vì index đặc biệt.

## Phần 5 — Quy trình sáu bước, chạy được ngay trên bảng của bạn

### Bước 1 — Tìm câu truy vấn thật sự đắt (đừng đoán)

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

SELECT round(total_exec_time)::bigint AS tong_ms,
       calls,
       round(mean_exec_time::numeric, 2) AS trung_binh_ms,
       round(100 * shared_blks_read / NULLIF(shared_blks_hit + shared_blks_read, 0), 1) AS phan_tram_doc_dia,
       left(query, 90) AS cau_lenh
  FROM pg_stat_statements
 ORDER BY total_exec_time DESC
 LIMIT 20;
```

Sắp theo **tổng thời gian**, không phải thời gian trung bình. Một câu chạy 50 ms mà chạy 2 triệu lần một ngày đắt hơn một câu chạy 8 giây mà chạy 3 lần.

### Bước 2 — Phân loại hình dạng của từng câu

Với mỗi câu trong top 20, trả lời đúng một câu hỏi: **nó so sánh, nó tìm cái chứa, hay nó tìm cái gần?** Rồi tra bảng ở phần 2.

### Bước 3 — Đọc plan hiện tại, tìm bốn dấu hiệu

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) <câu lệnh>;
```

| Thấy gì | Nghĩa là | Làm gì |
|---|---|---|
| `Seq Scan` trên bảng lớn | Không index nào phục vụ được hình dạng này | Kiểm SARGable trước; nếu đã SARGable thì **sai loại index** |
| `rows=` ước lượng lệch `actual rows` trên 10 lần | Thống kê sai hoặc cột tương quan | `ANALYZE`, tăng `STATISTICS`, hoặc `CREATE STATISTICS` |
| `Heap Blocks: lossy=` lớn | `work_mem` không đủ cho bitmap | Tăng `work_mem` (bài 4) |
| `Rows Removed by Index Recheck` rất lớn | BRIN/GiST không loại được bao nhiêu | Kiểm `correlation` (bài 5) |

### Bước 4 — Tìm index vô dụng và index trùng

```sql
-- Index chưa từng được dùng lần nào (chạy trên bản production đã chạy đủ lâu)
SELECT s.relname AS bang, s.indexrelname AS index_name,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS co,
       s.idx_scan AS so_lan_dung
  FROM pg_stat_user_indexes s
  JOIN pg_index i ON i.indexrelid = s.indexrelid
 WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
 ORDER BY pg_relation_size(s.indexrelid) DESC;
```

```sql
-- Index trùng tiền tố: đã có (a,b,c) thì (a) và (a,b) là thừa
SELECT indrelid::regclass AS bang, array_agg(indexrelid::regclass) AS nhom_trung
  FROM pg_index
 GROUP BY indrelid, (indkey::text || COALESCE(indpred::text,''))
HAVING count(*) > 1;
```

### Bước 5 — Đo chi phí ghi trước khi thêm index

```sql
-- Đếm số index đang có trên bảng ghi nhiều
SELECT relname, count(*) AS so_index,
       pg_size_pretty(sum(pg_relation_size(indexrelid))) AS tong_co_index
  FROM pg_stat_user_indexes GROUP BY relname ORDER BY 3 DESC;
```

Quy tắc thực dụng: bảng OLTP ghi nhiều nên giữ **dưới 5 index**. Mỗi `INSERT` là `1 + số index` thao tác ghi.

### Bước 6 — Tạo an toàn, rồi xác nhận nó thật sự được dùng

```sql
CREATE INDEX CONCURRENTLY idx_moi ON bang (...);

-- Kiểm index có bị INVALID không (CONCURRENTLY có thể thất bại giữa chừng)
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;

-- Sau vài giờ chạy thật: nó có được dùng không?
SELECT indexrelname, idx_scan FROM pg_stat_user_indexes WHERE indexrelname = 'idx_moi';
```

**Bước 6 là bước hay bị bỏ nhất.** Rất nhiều index được tạo, không bao giờ được dùng, và nằm đó ăn chi phí ghi suốt nhiều năm.

## Phần 6 — Ước lượng chi phí **trước** khi tạo index

Bước 5 nói "đo chi phí ghi". Đây là cách tính ra con số **trước** khi bạn chạm vào production.

### Ước lượng kích thước

```text
Cỡ index B-Tree ≈ số dòng × (cỡ khoá + 12 byte overhead) ÷ 0,7
                                                            ▲
                        hệ số lấp đầy: lá không bao giờ đầy 100%
                        (fillfactor mặc định của btree là 90, thực tế ~70%)
```

```sql
-- Đo cỡ khoá thật thay vì đoán
SELECT pg_column_size(cot_can_index) AS byte_moi_khoa
  FROM bang LIMIT 1;

SELECT avg(pg_column_size(email))::int AS trung_binh,
       max(pg_column_size(email))      AS lon_nhat
  FROM customers;
```

```text
Ví dụ: 50 triệu dòng, cột email trung bình 24 byte

  50.000.000 × (24 + 12) ÷ 0,7  =  2.571.428.571 byte  ≈  2,4 GB

Đối chiếu với các loại khác trên cùng cột đó:
  hash    ≈ 50.000.000 × (4 + 8 + overhead) ÷ 0,7   ≈  1,4 GB
  brin    ≈ (cỡ bảng ÷ 8 KB ÷ 128) × ~32 byte       ≈  vài trăm KB
  gin trgm≈ 3-10 × cỡ dữ liệu cột                    ≈  10-30 GB  ← cẩn thận
```

Dòng cuối là chỗ hay gây tai nạn: **`pg_trgm` trên cột `TEXT` lớn có thể tạo index to hơn cả bảng.** Tính trước, đừng chạy rồi mới biết.

### Ước lượng có vừa RAM không — đây mới là ngưỡng lật thật

```sql
SHOW shared_buffers;   -- vùng đệm của PostgreSQL

-- Tổng cỡ mọi index đang có + index sắp tạo, so với shared_buffers + page cache
SELECT pg_size_pretty(sum(pg_relation_size(indexrelid))) AS tong_index
  FROM pg_stat_user_indexes;
```

```text
  Tổng index vừa RAM     → mọi lượt tra là đọc RAM       (~0,1 µs/trang)
  Tổng index vượt RAM    → tra có thể chạm đĩa           (~100 µs/trang)
                            chênh 1.000 lần

  → Thêm một index 3 GB vào máy có 8 GB buffer không phải "tốn 3 GB".
    Nó có thể ĐẨY index đang nóng ra khỏi RAM và làm CHẬM những query khác.
```

Đây là cái giá ẩn mà gần như không ai tính: **index mới không chỉ tốn chỗ của nó, nó còn lấy chỗ của index cũ.**

### Ước lượng chi phí ghi

```sql
-- Tần suất ghi thật của bảng
SELECT relname,
       n_tup_ins + n_tup_upd + n_tup_del AS tong_luot_ghi,
       n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd,0), 1) AS phan_tram_hot
  FROM pg_stat_user_tables ORDER BY 2 DESC LIMIT 10;
```

```text
Bảng nhận 3.000 lượt ghi/giây, đang có 4 index:
  mỗi lượt ghi = 1 (heap) + 4 (index) = 5 thao tác

Thêm index thứ 5:
  mỗi lượt ghi = 6 thao tác  →  chi phí ghi tăng 20%

Và nếu index mới nằm trên một cột ĐANG ĐƯỢC UPDATE:
  → HOT update bị tắt cho bảng đó
  → mọi UPDATE giờ phải sửa CẢ 5 index thay vì 0
  → chi phí ghi tăng gấp nhiều lần, không phải 20%
```

Dòng cuối là bẫy nặng nhất trong cả phần này, và nó ít khi được nhắc: **đánh index lên một cột hay bị `UPDATE` sẽ giết HOT update của toàn bảng.**

## Phần 7 — Vận hành index trên bảng đang chạy

Chọn đúng cấu trúc mới là nửa việc. Nửa còn lại là đưa nó lên production mà không gãy.

### `CREATE INDEX CONCURRENTLY` thật sự làm gì

```sql
CREATE INDEX CONCURRENTLY idx_moi ON orders (customer_id, status);
```

```text
Bên trong, nó chạy BA giai đoạn thay vì một:

  1. Ghi nhận index vào catalog (chưa dùng được), lấy khoá NHẸ
     → ShareUpdateExclusiveLock: KHÔNG chặn SELECT/INSERT/UPDATE/DELETE
  2. Quét bảng lần 1 → dựng index
  3. CHỜ mọi transaction đang mở kết thúc
  4. Quét bảng lần 2 → bắt các dòng đã đổi trong lúc quét lần 1
  5. CHỜ lần nữa → đánh dấu index hợp lệ

  Cái giá: chậm hơn 2-3 lần, và bước 3/5 có thể CHỜ RẤT LÂU
           nếu có một transaction nào đó mở suốt.
```

```sql
-- Trước khi chạy CONCURRENTLY: kiểm có transaction nào đang mở lâu không
SELECT pid, now() - xact_start AS mo_duoc, state, left(query, 60)
  FROM pg_stat_activity
 WHERE xact_start IS NOT NULL AND now() - xact_start > interval '1 minute'
 ORDER BY xact_start;
```

Đây là kiểm tra bắt buộc. `CREATE INDEX CONCURRENTLY` sẽ **đứng chờ vô hạn** sau lưng một phiên `idle in transaction` — và bạn tưởng nó đang chạy.

### Khi nó thất bại: index `INVALID`

```sql
-- Dấu hiệu: index tồn tại, chiếm chỗ, ĂN CHI PHÍ GHI, nhưng KHÔNG ĐƯỢC DÙNG
SELECT indexrelid::regclass AS ten_index, indrelid::regclass AS bang
  FROM pg_index WHERE NOT indisvalid;

-- Cách duy nhất: xoá rồi làm lại (cũng phải CONCURRENTLY)
DROP INDEX CONCURRENTLY idx_moi;
```

**Đây là chỗ sinh ra "index ma"**: tạo thất bại, không ai kiểm, nó nằm đó nhiều năm — tốn dung lượng, làm chậm mọi `INSERT`, và không phục vụ một truy vấn nào.

### Thay một index bằng index khác mà không có khoảng trống

Tình huống thật: bạn muốn đổi `(customer_id)` thành `(customer_id, status)`. Xoá trước rồi tạo sau là để lại một khoảng thời gian **không có index nào** — đủ để làm sập production.

```sql
-- 1. Tạo cái mới trước, tên tạm
CREATE INDEX CONCURRENTLY idx_orders_cust_status_new ON orders (customer_id, status);

-- 2. Xác nhận nó hợp lệ VÀ đang được dùng
SELECT indisvalid FROM pg_index WHERE indexrelid = 'idx_orders_cust_status_new'::regclass;
SELECT idx_scan FROM pg_stat_user_indexes WHERE indexrelname = 'idx_orders_cust_status_new';

-- 3. Chỉ khi đã chắc: xoá cái cũ
DROP INDEX CONCURRENTLY idx_orders_cust;

-- 4. Đổi tên (rất nhanh, chỉ khoá catalog)
ALTER INDEX idx_orders_cust_status_new RENAME TO idx_orders_cust;
```

### Index phình và cách dựng lại không khoá

```sql
-- Ước lượng độ phình: so cỡ thật với cỡ lý thuyết
SELECT indexrelname,
       pg_size_pretty(pg_relation_size(indexrelid)) AS co_that,
       idx_scan
  FROM pg_stat_user_indexes
 WHERE relname = 'orders'
 ORDER BY pg_relation_size(indexrelid) DESC;

-- Dựng lại KHÔNG khoá ghi — PostgreSQL 12 trở lên
REINDEX INDEX CONCURRENTLY idx_orders_cust;

-- Cả bảng
REINDEX TABLE CONCURRENTLY orders;
```

```text
  REINDEX thường     : khoá ACCESS EXCLUSIVE — không ai đọc/ghi được
  REINDEX CONCURRENTLY: chỉ khoá nhẹ, nhưng cần chỗ trống bằng cỡ index
                        và cũng để lại index INVALID nếu thất bại
```

### Bảng mức khoá cần thuộc

| Câu lệnh | Khoá | Chặn `SELECT`? | Chặn `INSERT/UPDATE`? |
|---|---|---|---|
| `CREATE INDEX` | ShareLock | Không | **Có** |
| `CREATE INDEX CONCURRENTLY` | ShareUpdateExclusive | Không | Không |
| `DROP INDEX` | AccessExclusive | **Có** | **Có** |
| `DROP INDEX CONCURRENTLY` | ShareUpdateExclusive | Không | Không |
| `REINDEX` | AccessExclusive | **Có** | **Có** |
| `REINDEX CONCURRENTLY` | ShareUpdateExclusive | Không | Không |
| `ALTER INDEX ... RENAME` | AccessExclusive (rất ngắn) | Có, vài ms | Có, vài ms |
| `CLUSTER` / `VACUUM FULL` | AccessExclusive | **Có, rất lâu** | **Có, rất lâu** |

Hàng thứ ba đáng in đậm trong đầu: **`DROP INDEX` thường cũng khoá cả đọc.** Rất nhiều người nhớ phải `CREATE ... CONCURRENTLY` mà quên mất `DROP` cũng cần.

## Phần 8 — Bốn con số neo cho phỏng vấn

Khi bị hỏi *"tại sao"*, có con số là thắng. Bốn con số này đủ cho hầu hết câu hỏi về index:

```text
1. Fanout của B-Tree      : vài trăm  → 100 triệu dòng chỉ cần 4 tầng
2. Ngưỡng lật của index   : trên ~5-10% số dòng thì Seq Scan thắng
3. Giá của đọc ngẫu nhiên : random_page_cost 4.0 vs seq_page_cost 1.0
4. Trang PostgreSQL       : 8 KB  (InnoDB 16 KB, dòng đệm CPU 64 byte)
```

Và một câu neo cho mọi câu hỏi: **"Chi phí thật là số trang phải đọc, không phải số phép so sánh."**

## Phần 9 — Mười hai câu hỏi phỏng vấn tổng hợp, kèm đáp án 30 giây

**1. `CREATE INDEX` mặc định tạo loại gì?**
B-Tree. Đây là câu lệnh duy nhất trong SQL âm thầm chọn hộ bạn một cấu trúc dữ liệu — không hệ nào hỏi bạn.

**2. B-Tree trả lời được những hình dạng câu hỏi nào?**
Bốn: `=`, `<`/`>`, `BETWEEN`, `LIKE 'tiền tố%'` — cộng `ORDER BY`, `MIN`/`MAX`, merge join miễn phí, vì lá đã sắp và nối đôi.

**3. Vì sao B-Tree chứ không phải cây nhị phân?**
Vì chi phí là **số lần đọc trang**, không phải số phép so. Đơn vị đọc nhỏ nhất là một trang, nên nút phải to bằng một trang; fanout vài trăm kéo cây từ 20 tầng xuống 3-4 tầng. Ràng buộc "máy không đọc được 1 byte" vẫn còn nguyên hôm nay.

**4. Hash index nhanh hơn B-Tree, sao không dùng?**
Vì B-Tree bán kèm **thứ tự** và **khả năng phủ**, cộng `UNIQUE` và nhiều cột. Hash thắng ~0,8 micro giây ở bước tra rồi thua hàng nghìn lần ở mọi truy vấn cần thứ tự.

**5. Cột `trang_thai` 4 giá trị có nên index không?**
Ba tầng: phân bố đều + OLTP → không. Phân bố lệch → **partial index** trên nhánh hiếm. Kho dữ liệu lọc nhiều cột → **bitmap/cột-store**. Và gần như luôn đáng làm **cột thứ hai** trong composite.

**6. PostgreSQL có bitmap index không?**
Không. Nó có **Bitmap Index Scan** — bitmap tạm trong RAM dựng từ B-Tree, để đọc heap theo số trang tăng dần. Một cái là cách lưu, một cái là cách chạy.

**7. Bảng log 2 tỉ dòng thì index thế nào?**
BRIN trên `created_at` — nhỏ hơn B-Tree hàng nghìn lần. **Kèm điều kiện ngầm**: chỉ hiệu quả khi thứ tự vật lý trùng thứ tự thời gian. `UPDATE` hàng loạt dòng cũ là hỏng im lặng. Theo dõi `pg_stats.correlation`, dưới 0,9 là báo động.

**8. `LIKE '%x%'` chậm, xử lý sao?**
Tuỳ hình dạng thật: tiền tố → B-Tree `text_pattern_ops`; theo **từ** → GIN + `tsvector`; **chuỗi con** thật sự → GIN + `pg_trgm`, kèm cái giá index to gấp 3-10 lần.

**9. Vì sao tìm "bảo hàn" ra 0 mà `LIKE` ra 12.400?**
Đơn vị của index đảo là **một từ trọn vẹn**; "bảo hàn" không phải một từ nên không có mục để tra, và máy không quay lại quét bảng. Tiền tố thì dùng được `to_tsquery('hàn:*')`; chuỗi giữa từ thì phải đổi sang trigram.

**10. Vì sao không có cây cho vector search?**
Trong 1.536 chiều, khoảng cách xa nhất và gần nhất chênh nhau ~5%, nên không vùng nào đủ xa để loại bỏ — cây suy biến về quét toàn bộ. Lối ra là chấp nhận **xấp xỉ**: HNSW, recall ~95%, nhanh hơn ~900 lần.

**11. Có index rồi mà vẫn `Seq Scan`, vì sao?**
Bốn nguyên nhân, nói đủ bốn: không SARGable (bọc hàm, ép kiểu ngầm); độ chọn lọc quá thấp; thống kê lỗi thời; và — chỗ tách ứng viên — **đúng cột nhưng sai loại index**, tức câu hỏi không mang hình dạng mà cấu trúc đó biết trả lời.

**12. Câu lệnh chậm 400 lần qua một đêm, không ai deploy gì?**
Quy trình loại trừ, mỗi nghi phạm một phép đo: so plan (không đổi → không phải optimizer) → cỡ bảng và `n_dead_tup` (loại bloat) → `pg_stat_activity` (loại khoá chờ) → `REINDEX` (loại index hỏng) → còn lại là **dữ liệu đã đổi hình dạng**: correlation, phân bố, độ chọn lọc.

## Phần 10 — Checklist trước khi tạo bất kỳ index nào

```text
[ ] Câu truy vấn này có trong top 20 của pg_stat_statements không?
[ ] Điều kiện đã SARGable chưa? (cột đứng trần một vế)
[ ] Câu này có HÌNH DẠNG gì: so sánh / chứa / gần?
[ ] Cấu trúc tôi chọn có mang đúng hình dạng đó không?
[ ] Đã có index nào phục vụ được rồi chưa? (kiểm trùng tiền tố)
[ ] Bảng này ghi bao nhiêu lượt mỗi giây? Thêm index này đắt bao nhiêu?
[ ] Cấu trúc này có ĐIỀU KIỆN NGẦM nào không? (correlation, từ điển, chỉ-đọc)
[ ] Nếu điều kiện ngầm vỡ, tôi phát hiện bằng cách nào? (đã dựng cảnh báo chưa)
[ ] Tạo bằng CONCURRENTLY chưa?
[ ] Sau 24 giờ, idx_scan có tăng không?
```

Dòng thứ tám là dòng mà cả loạt bài này tồn tại để dạy: **mọi cấu trúc rẻ đều kèm một điều kiện ngầm, và điều kiện đó vỡ thì không có lỗi nào.**

## Phần 11 — Mười tình huống: bạn chọn gì?

Tự trả lời trước khi mở đáp án. Đây là dạng câu hỏi mà người phỏng vấn thật sự dùng — họ mô tả bối cảnh, không nói tên cấu trúc.

**1.** Bảng `nhat_ky_api` 4 tỉ dòng, chỉ `INSERT`, truy vấn duy nhất là *"log 24 giờ qua của service X"*. Chọn gì?

<details><summary>Đáp án</summary>

**Phân vùng theo ngày + BRIN trên `tao_luc`**, cộng B-Tree trên `service` nếu độ chọn lọc đủ cao. BRIN vì bảng chỉ thêm mới nên correlation ≈ 1. **Phải nói kèm**: dựng cảnh báo trên `pg_stats.correlation`, và bật `autosummarize = on` để dải mới nhất được tóm tắt ngay — nếu không thì truy vấn "24 giờ qua" luôn phải đọc dải cuối. Đó cũng chính là dải chứa dữ liệu bạn cần.
</details>

**2.** Bảng `san_pham` 800.000 dòng. Ô tìm kiếm cho phép gõ *"iph"* và phải ra `iPhone`. Chọn gì?

<details><summary>Đáp án</summary>

Đây là **tiền tố**, không phải chuỗi con — nên B-Tree với `text_pattern_ops` là đủ và rẻ nhất:
```sql
CREATE INDEX ON san_pham (lower(ten) text_pattern_ops);
SELECT * FROM san_pham WHERE lower(ten) LIKE 'iph%';
```
Chỉ khi khách gõ *"phone"* và phải ra `iPhone` (chuỗi **giữa**) mới cần `pg_trgm`. Nhầm hai cái này là tự chuốc index to gấp 5 lần cho không.
</details>

**3.** Bảng `don_hang` 200 triệu dòng. Dashboard hỏi *"đơn đang ở trạng thái `loi`"* — chiếm 0,2% số dòng. Chọn gì?

<details><summary>Đáp án</summary>

**Partial index**, không phải index cả cột:
```sql
CREATE INDEX CONCURRENTLY ON don_hang (tao_luc) WHERE trang_thai = 'loi';
```
Index vài MB thay vì vài GB, và luôn được dùng vì độ chọn lọc rất cao. Đây là phản ví dụ cho câu *"cột ít giá trị đừng index"*.
</details>

**4.** Hệ thống đặt phòng. Không được cho hai lượt đặt **trùng khoảng thời gian** cùng một phòng. Chọn gì?

<details><summary>Đáp án</summary>

**GiST + ràng buộc `EXCLUDE`** — đây là thứ chỉ GiST làm được:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE dat_phong ADD CONSTRAINT khong_trung
  EXCLUDE USING gist (phong_id WITH =, khoang_thoi_gian WITH &&);
```
Ưu điểm lớn nhất: **database ép luật**, không phụ thuộc ứng dụng kiểm đúng hay sai. So với cách khoá bi quan ở [phase-8 bài 4](../phase-8/04-case-dat-cho-trang-thai-giu-va-bay-cron-job.md), đây là cách rẻ và chắc hơn hẳn.
</details>

**5.** Bảng `su_kien` với cột `payload JSONB`. Truy vấn duy nhất: `payload @> '{"kenh":"app"}'`. Chọn gì?

<details><summary>Đáp án</summary>

**GIN với `jsonb_path_ops`** — nhỏ hơn và nhanh hơn `jsonb_ops` mặc định 2-3 lần, đổi lại chỉ phục vụ toán tử `@>` (mà đây đúng là toán tử duy nhất được dùng):
```sql
CREATE INDEX ON su_kien USING GIN (payload jsonb_path_ops);
```
Nếu chỉ tra **một khoá cố định**, phương án còn rẻ hơn là B-Tree trên biểu thức: `CREATE INDEX ON su_kien ((payload->>'kenh'))`.
</details>

**6.** Bảng `khach_hang` 30 triệu dòng, khoá chính là `UUID v4` dạng `TEXT`. Ghi 2.000 dòng/giây và đang chậm dần. Chẩn đoán?

<details><summary>Đáp án</summary>

Ba vấn đề chồng nhau: (1) khoá **ngẫu nhiên** làm bẩn một trang khác mỗi lần chèn, phá cả ba ưu thế của khoá tăng dần ở [bài 2](02-vi-sao-la-cay-b-chu-khong-phai-cay-nhi-phan.md); (2) `UUID` lưu dạng `TEXT` là **36 byte** thay vì 16 byte của kiểu `uuid` → fanout thấp, cây cao hơn; (3) nếu là InnoDB thì **mọi secondary index đều mang theo 36 byte đó**. Cách chữa: đổi sang kiểu `uuid` gốc, và nếu đổi được thì dùng **UUID v7** (có tiền tố thời gian nên tăng dần). Chi tiết ở [phase-5 bài 5](../phase-5/05-khoa-chinh-auto-increment-uuid-v4-hay-v7.md).
</details>

**7.** Báo cáo kho dữ liệu lọc đồng thời `trang_thai`, `kenh`, `mien`, `nhom_hang` — cột nào cũng 3-8 giá trị. Bảng 500 triệu dòng, nạp một lần mỗi đêm. Chọn gì?

<details><summary>Đáp án</summary>

Trên Oracle: **bitmap index cho từng cột** — đây đúng là trường hợp bitmap sinh ra để phục vụ. Trên PostgreSQL: đánh B-Tree từng cột rồi **để `BitmapAnd` làm việc**, nhớ tăng `work_mem`; hoặc `btree_gin` trên nhiều cột; hoặc chuyển hẳn phần báo cáo sang **cột-store**. Vế phải nói kèm: phương án bitmap **chỉ đúng vì bảng chỉ đọc** — cùng cột đó trên bảng OLTP thì nó là cái bẫy.
</details>

**8.** `EXPLAIN` cho thấy `Seq Scan` trên bảng 40 triệu dòng dù cột trong `WHERE` đã có index, và `ANALYZE` không đổi gì. Bạn kiểm gì, theo thứ tự?

<details><summary>Đáp án</summary>

Bốn bước, dừng ngay khi tìm ra: (1) **điều kiện có SARGable không** — cột bị bọc hàm, bị ép kiểu ngầm, hay `LIKE '%x%'`? (2) **độ chọn lọc** — câu này lấy bao nhiêu phần trăm bảng? Trên 20% thì `Seq Scan` là đúng. (3) **index có `INVALID` không** — `SELECT ... FROM pg_index WHERE NOT indisvalid`. (4) **đúng cột nhưng sai loại index** — câu hỏi có mang hình dạng mà cấu trúc đó biết trả lời không? Bước 4 là bước phần lớn người ta không nghĩ tới.
</details>

**9.** Bảng `bai_viet` 5 triệu dòng, cột `noi_dung` là `TEXT` dài. Bạn định đánh `pg_trgm`. Có gì cần tính trước?

<details><summary>Đáp án</summary>

**Kích thước.** GIN trigram thường to gấp **3-10 lần dữ liệu cột** — 5 triệu bài × 4 KB nội dung = 20 GB dữ liệu, index có thể **60-200 GB**. Phải: (1) ước lượng trước bằng cách dựng thử trên 1% dữ liệu rồi nhân lên; (2) kiểm nó có vượt RAM không, vì vượt là mọi truy vấn khác cũng chậm theo; (3) cân nhắc chỉ index `tieu_de` thay vì cả `noi_dung`; (4) hỏi lại xem người dùng thật sự cần **chuỗi con** hay chỉ cần **từ** — nếu là từ thì `tsvector` nhẹ hơn nhiều và còn xếp hạng được.
</details>

**10.** Bạn vừa `CREATE INDEX CONCURRENTLY` trên bảng 100 triệu dòng. 40 phút rồi vẫn chưa xong, CPU và đĩa đều nhàn. Chuyện gì?

<details><summary>Đáp án</summary>

Gần như chắc chắn nó đang **chờ một transaction cũ đóng lại** — `CREATE INDEX CONCURRENTLY` phải đợi mọi transaction mở trước đó kết thúc, hai lần. Thủ phạm điển hình là một phiên `idle in transaction` mà ứng dụng quên đóng.
```sql
SELECT pid, state, now() - xact_start AS mo_duoc, left(query,60)
  FROM pg_stat_activity WHERE state = 'idle in transaction'
 ORDER BY xact_start;
```
Đóng phiên đó thì index chạy tiếp. Bài học: **luôn kiểm transaction cũ trước khi chạy `CONCURRENTLY`** — xem thêm [phase-7 bài 6](../phase-7/06-connection-pool-job-queue-va-transaction-dai.md).
</details>

## Tóm tắt bài 8

- Quy trình gói trong một câu: **hình dạng câu hỏi → cấu trúc → cái giá → cách phát hiện khi nó vỡ**.
- Ba hình dạng gốc: **so sánh được** (B-Tree, BRIN, hash), **chứa** (GIN), **gần** (GiST, HNSW).
- Ba vế hay bị bỏ quên khi so sánh index: **kích thước**, **chi phí ghi**, và **điều kiện ngầm** — không phải tốc độ đọc.
- Bốn con số neo: fanout vài trăm; ngưỡng lật 5-10%; `random_page_cost` 4.0 vs `seq_page_cost` 1.0; trang 8 KB.
- Quy trình sáu bước chạy được ngay: `pg_stat_statements` → phân loại hình dạng → đọc plan → dọn index thừa → đo chi phí ghi → `CONCURRENTLY` rồi **xác nhận `idx_scan` có tăng**.
- Bước hay bị bỏ nhất là bước cuối. Index tạo ra mà không ai kiểm xem có được dùng không sẽ nằm đó ăn chi phí ghi suốt nhiều năm.
- **Ước lượng trước khi tạo**: cỡ ≈ `số dòng × (cỡ khoá + 12) ÷ 0,7`; `pg_trgm` có thể **to hơn cả bảng**. Và index mới không chỉ tốn chỗ của nó — **nó lấy chỗ của index đang nóng trong RAM**.
- Bẫy chi phí ghi nặng nhất: **đánh index lên cột hay bị `UPDATE` sẽ tắt HOT update của cả bảng** — chi phí tăng gấp nhiều lần, không phải vài phần trăm.
- Vận hành: `CREATE INDEX CONCURRENTLY` **đứng chờ vô hạn sau lưng một `idle in transaction`**; thất bại thì để lại index `INVALID` ăn chi phí ghi mà không phục vụ ai; và **`DROP INDEX` thường cũng khoá cả đọc** — rất nhiều người quên vế này.
- Thay index thì **tạo cái mới trước, xác nhận `indisvalid` và `idx_scan`, rồi mới xoá cái cũ** — đừng để một khoảng thời gian không có index nào.

**Bài kế tiếp** → [Bài 9: Đối chiếu nguồn — 26 điểm đúng, 9 chỗ cần đính chính](09-doi-chieu-nguon-va-nhung-cho-can-dinh-chinh.md)

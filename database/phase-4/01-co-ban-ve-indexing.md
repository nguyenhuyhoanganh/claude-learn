# Bài 1: Cơ bản về Indexing — từ 3 giây xuống 0,1 mili-giây

Một bảng 11 triệu dòng. Hai câu truy vấn gần như giống hệt nhau:

```sql
SELECT id FROM employees WHERE id   = 2000;      -- 0,1 mili-giây
SELECT id FROM employees WHERE name = 'zsGQKAP'; -- 3.021 mili-giây
```

Chênh nhau **30.000 lần**. Cùng bảng, cùng dữ liệu, cùng máy. Khác biệt duy nhất: cột `id` có index, cột `name` thì không.

Nhưng câu chuyện chưa dừng ở đó. Sau khi tạo index cho `name`, có một câu vẫn chậm **y như cũ**:

```sql
SELECT id FROM employees WHERE name LIKE '%zsG%';  -- vẫn 3.000+ mili-giây
```

Bài này giải thích cả ba con số: vì sao index nhanh, chính xác nó nhanh nhờ cái gì, và **vì sao có index rồi mà vẫn chậm**.

## Index là gì

**Index** (chỉ mục) là một **cấu trúc dữ liệu phụ, được sắp xếp**, ánh xạ giá trị của một hoặc vài cột sang vị trí dòng trong bảng.

Hình dung quen thuộc nhất là quyển danh bạ điện thoại có gờ chữ cái ở mép:

```text
   KHÔNG CÓ GỜ CHỮ CÁI                CÓ GỜ CHỮ CÁI
   ═══════════════════                 ═════════════
   Tìm "Zebra Corp"?                   Tìm "Zebra Corp"?
   → lật từ trang 1                    → lật thẳng tới gờ [Z]
   → lật tiếp trang 2                  → tìm trong vài trang
   → ... 800 trang                     → thấy
   → thấy ở trang 799
                                       ~3 lần lật
   ~799 lần lật
```

Ba tính chất của index, và tính chất thứ ba là chỗ mọi người quên:

1. **Được sắp xếp** — đó là lý do nhảy tới đúng chỗ được.
2. **Là bản sao** — dữ liệu tồn tại hai nơi: trong bảng và trong index.
3. **Phải được duy trì** — mỗi `INSERT`/`UPDATE`/`DELETE` phải cập nhật **mọi** index của bảng.

Tính chất 2 và 3 là **hoá đơn** của tính chất 1. Không có bữa trưa miễn phí.

## Dựng bảng thí nghiệm

Mọi con số trong bài đều tái hiện được. Bắt đầu:

```bash
docker run --name idx-lab -e POSTGRES_PASSWORD=lab -p 5441:5432 -d postgres:16
docker exec -it idx-lab psql -U postgres
```

```sql
CREATE TABLE employees (
    id   SERIAL PRIMARY KEY,
    name TEXT
);

INSERT INTO employees (name)
SELECT substr(md5(random()::text), 1, 7)
FROM generate_series(1, 11000000);

ANALYZE employees;
```

```text
INSERT 0 11000000
Time: 41883.226 ms (00:41.883)
```

```sql
SELECT pg_size_pretty(pg_relation_size('employees'))          AS bang,
       pg_size_pretty(pg_relation_size('employees_pkey'))     AS index_pk,
       pg_relation_size('employees') / 8192                   AS so_page;
```

```text
   bảng   | index_pk | so_page
----------+----------+---------
 517 MB   | 236 MB   |   66200
```

Ghi nhớ ba con số này: **66.200 page**, bảng **517 MB**, index primary key **236 MB**. Chúng sẽ giải thích mọi thứ phía sau.

> Chú ý: bảng chỉ có 2 cột mà index primary key đã chiếm 46% kích thước bảng. Index **không hề nhẹ**.

---

## Thí nghiệm 1 — Trường hợp đẹp nhất: index-only scan

```sql
EXPLAIN ANALYZE SELECT id FROM employees WHERE id = 2000;
```

```text
Index Only Scan using employees_pkey on employees
    (cost=0.43..4.45 rows=1 width=4) (actual time=0.031..0.033 rows=1 loops=1)
  Index Cond: (id = 2000)
  Heap Fetches: 0
Planning Time: 0.104 ms
Execution Time: 0.061 ms
```

Ba dòng cần đọc kỹ:

| Dòng | Ý nghĩa |
|---|---|
| `Index Only Scan` | **Chỉ đọc index, không chạm vào bảng lần nào** |
| `Index Cond: (id = 2000)` | Điều kiện được đẩy **vào trong** index — index tự lọc |
| `Heap Fetches: 0` | Số lần phải nhảy vào bảng: **không lần nào** |

Vì sao được như vậy? Vì câu lệnh chỉ cần cột `id`, mà `id` **đã nằm sẵn trong index**. Không có lý do gì phải đi tìm dòng thật.

```text
   ĐƯỜNG ĐI: 0,061 ms

   Cây index employees_pkey (4 tầng)
     ROOT     → đang trong RAM       ~100 ns
     TẦNG 2   → đang trong RAM       ~100 ns
     TẦNG 3   → đang trong RAM       ~100 ns
     LÁ       → tìm thấy id=2000     ~100 ns
              → id đã có ngay đây → TRẢ VỀ

   Không chạm bảng. Không chạm đĩa.
```

Đây là loại truy vấn **rẻ nhất có thể** trong một database quan hệ.

---

## Thí nghiệm 2 — Cùng index, nhưng lấy thêm một cột

```sql
EXPLAIN ANALYZE SELECT id, name FROM employees WHERE id = 5000;
```

```text
Index Scan using employees_pkey on employees
    (cost=0.43..8.45 rows=1 width=12) (actual time=1.882..1.886 rows=1 loops=1)
  Index Cond: (id = 5000)
Planning Time: 0.098 ms
Execution Time: 2.512 ms
```

```text
   0,061 ms  →  2,512 ms      CHẬM HƠN ~41 LẦN
```

Chỉ vì thêm một cột vào danh sách `SELECT`. Chuyện gì đã xảy ra?

```text
   Index Only Scan               Index Scan
   ══════════════                ═══════════
   cây index → thấy id           cây index → thấy "id=5000 ở ctid (302,17)"
             → xong                        │
                                           ▼  ← CHẶNG THÊM VÀO
                                    nhảy vào HEAP đọc page 302
                                    → I/O NGẪU NHIÊN, có thể phải xuống đĩa
                                    → lấy được cột `name`
```

Chú ý cái tên trong kế hoạch đã đổi: `Index Only Scan` → `Index Scan`. Mất chữ "Only" nghĩa là **có chạm vào bảng**.

Bài học đầu tiên và cũng là bài học lớn: **danh sách cột trong `SELECT` ảnh hưởng trực tiếp tới tốc độ**, không chỉ mệnh đề `WHERE`. Đây là nền của kỹ thuật *covering index*, chủ đề [bài 2](02-index-scan-va-covering-index.md).

---

## Thí nghiệm 3 — Không có index: quét toàn bảng

```sql
EXPLAIN ANALYZE SELECT id FROM employees WHERE name = 'zsGQKAP';
```

```text
Gather  (cost=1000.00..134292.10 rows=1 width=4)
        (actual time=0.412..3020.887 rows=1 loops=1)
  Workers Planned: 2
  Workers Launched: 2
  ->  Parallel Seq Scan on employees
        (cost=0.00..133292.00 rows=1 width=4)
        (actual time=1985.221..3011.443 rows=0 loops=3)
        Filter: (name = 'zsGQKAP'::text)
        Rows Removed by Filter: 3666666
Planning Time: 0.083 ms
Execution Time: 3021.334 ms
```

Bốn dòng đáng đọc:

| Dòng | Ý nghĩa |
|---|---|
| `Parallel Seq Scan` | Quét tuần tự — đọc **mọi page** trong 66.200 page |
| `Workers Launched: 2` | PostgreSQL chia việc cho 3 tiến trình (1 chính + 2 phụ) |
| `Filter: (name = ...)` | Điều kiện áp **sau khi đã đọc dòng lên** — khác hẳn `Index Cond` |
| `Rows Removed by Filter: 3666666` | Mỗi worker đọc rồi vứt đi 3,67 triệu dòng |

```text
   0,061 ms  →  3.021 ms      CHẬM HƠN ~49.500 LẦN
```

Và chú ý: dù có **3 CPU chạy song song**, nó vẫn mất 3 giây. Song song hoá không cứu được việc phải đọc 517 MB từ đĩa.

### `Index Cond` khác `Filter` chỗ nào

Đây là phân biệt quan trọng nhất khi đọc `EXPLAIN`, và rất nhiều người bỏ qua:

```text
   Index Cond: (id = 2000)              Filter: (name = 'zsGQKAP')
   ═══════════════════════              ══════════════════════════
   Điều kiện được đẩy VÀO index.        Điều kiện áp SAU khi đã đọc dòng.
   Index chỉ trả về dòng khớp.          Mọi dòng đều bị đọc lên rồi mới lọc.

   → chạm rất ít dòng                   → chạm MỌI dòng
```

Thấy `Filter` kèm `Rows Removed by Filter` với số lớn nghĩa là: **công sức đọc đã bỏ ra rồi mới vứt đi**. Đó là dấu hiệu rõ nhất của một index còn thiếu.

---

## Tạo index và đo lại

```sql
CREATE INDEX idx_employees_name ON employees(name);
```

```text
CREATE INDEX
Time: 18442.117 ms (00:18.442)
```

18 giây — vì PostgreSQL phải đọc cả 11 triệu dòng, sắp xếp, rồi dựng cây. Và lệnh này **khoá bảng chặn mọi lệnh ghi** trong suốt 18 giây đó (cách tránh: [bài 5](05-create-index-concurrently-va-best-practices.md)).

```sql
EXPLAIN ANALYZE SELECT id FROM employees WHERE name = 'zsGQKAP';
```

```text
Index Scan using idx_employees_name on employees
    (cost=0.56..8.58 rows=1 width=4) (actual time=0.048..0.049 rows=1 loops=1)
  Index Cond: (name = 'zsGQKAP'::text)
Planning Time: 0.226 ms
Execution Time: 0.075 ms
```

```text
   3.021 ms  →  0,075 ms      NHANH HƠN ~40.000 LẦN
```

Một lệnh `CREATE INDEX` 18 giây đổi lấy 40.000 lần tăng tốc. Đây là lý do index là công cụ tối ưu **hiệu quả nhất trên mỗi đồng bỏ ra** trong toàn bộ kho vũ khí.

---

## Thí nghiệm 4 — Có index rồi mà vẫn chậm

```sql
EXPLAIN ANALYZE SELECT id FROM employees WHERE name LIKE '%zsG%';
```

```text
Gather  (cost=1000.00..134298.10 rows=1100 width=4)
        (actual time=1.482..2955.117 rows=1329 loops=1)
  Workers Planned: 2
  ->  Parallel Seq Scan on employees
        Filter: (name ~~ '%zsG%'::text)
        Rows Removed by Filter: 3666223
Execution Time: 2971.884 ms
```

Vẫn `Parallel Seq Scan`. Index nằm đó, không được dùng.

### Vì sao — hình dung bằng danh bạ

```text
   INDEX ĐƯỢC SẮP XẾP THEO THỨ TỰ TỪ TRÁI SANG PHẢI:

      aaGQKAP
      abXYZ12
      ...
      zsGQKAP        ← tìm "bắt đầu bằng zs" → nhảy thẳng tới đây ✔
      ztABC99
      ...

   WHERE name LIKE 'zsG%'   → "bắt đầu bằng zsG"
      → Index dùng được. Nhảy tới vùng bắt đầu bằng 'zsG', đọc liên tiếp.

   WHERE name LIKE '%zsG%'  → "chứa zsG ở BẤT KỲ ĐÂU"
      → Index VÔ DỤNG. Không có cách nào nhảy tới "vùng chứa zsG".
      → Giống như hỏi danh bạ: "công ty nào có chữ 'zeb' ở giữa tên?"
        Gờ chữ cái không giúp được gì. Phải đọc từng trang.
```

Nguyên tắc tổng quát:

> **Index chỉ giúp khi bạn hỏi về TIỀN TỐ của giá trị đã được sắp xếp.**
> Hỏi về phần giữa, phần cuối, hay về một hàm áp lên giá trị — index bó tay.

### Bảng: điều kiện nào dùng được index

| Điều kiện | Dùng được B-Tree? | Vì sao |
|---|---|---|
| `WHERE x = 5` | ✔ | Nhảy thẳng tới giá trị |
| `WHERE x > 5`, `x BETWEEN a AND b` | ✔ | Nhảy tới điểm đầu rồi đi ngang qua các lá |
| `WHERE x IN (1,2,3)` | ✔ | Ba lần nhảy |
| `WHERE x LIKE 'abc%'` | ✔ | Tiền tố — nhảy tới vùng đó |
| `WHERE x LIKE '%abc'` | ✘ | Hậu tố — không nhảy được |
| `WHERE x LIKE '%abc%'` | ✘ | Phần giữa — không nhảy được |
| `WHERE UPPER(x) = 'ABC'` | ✘ | Index lưu `x`, không lưu `UPPER(x)` |
| `WHERE x + 1 = 10` | ✘ | Biểu thức áp lên cột |
| `WHERE x::text = '5'` | ✘ | Ép kiểu cũng là một hàm |
| `WHERE x IS NULL` | ✔ (PostgreSQL) | B-Tree của PG có lưu NULL |
| `WHERE a = 1 OR b = 2` | Một phần | Cần index trên **cả hai** cột, rồi hợp bitmap |
| `ORDER BY x` | ✔ | Index đã sắp sẵn — bỏ được bước sắp xếp |

Ba dòng `✘` ở giữa bảng (hàm, biểu thức, ép kiểu) có chung một nguyên nhân và có chung một cách chữa — mục kế tiếp.

### Cách chữa: index trên biểu thức

Nếu bạn thật sự cần tìm theo `UPPER(name)`, hãy đánh index **trên chính biểu thức đó**:

```sql
CREATE INDEX idx_employees_name_upper ON employees (UPPER(name));

EXPLAIN ANALYZE SELECT id FROM employees WHERE UPPER(name) = 'ZSGQKAP';
```

```text
Index Scan using idx_employees_name_upper on employees
  Index Cond: (upper(name) = 'ZSGQKAP'::text)
Execution Time: 0.084 ms
```

Điều kiện để nó hoạt động: biểu thức trong `WHERE` phải **khớp chính xác** biểu thức lúc tạo index. `UPPER(name)` không dùng được index tạo trên `LOWER(name)`.

### Cách chữa cho `LIKE '%...%'`: index tam tự

PostgreSQL có extension `pg_trgm` cho phép index cả tìm kiếm phần giữa:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_employees_name_trgm
  ON employees USING GIN (name gin_trgm_ops);

EXPLAIN ANALYZE SELECT id FROM employees WHERE name LIKE '%zsG%';
```

```text
Bitmap Heap Scan on employees  (actual time=8.442..31.220 rows=1329 loops=1)
  Recheck Cond: (name ~~ '%zsG%'::text)
  ->  Bitmap Index Scan on idx_employees_name_trgm  (actual time=6.118..6.119 ...)
        Index Cond: (name ~~ '%zsG%'::text)
Execution Time: 31.884 ms
```

```text
   2.972 ms  →  31,9 ms      NHANH HƠN ~93 LẦN
```

Cách hoạt động: `pg_trgm` chẻ chuỗi thành các cụm 3 ký tự (`zsGQKAP` → `zsG`, `sGQ`, `GQK`, ...) rồi đánh index từng cụm. Tìm `%zsG%` trở thành tìm cụm `zsG` — mà cụm thì tra được.

Cái giá: index GIN này **rất lớn và rất chậm khi ghi**. Đo trước khi dùng.

---

## Hoá đơn của index

Index không miễn phí. Ba khoản phí, đo được cả ba:

### Khoản 1 — Dung lượng đĩa

```sql
SELECT indexrelname AS ten_index,
       pg_size_pretty(pg_relation_size(indexrelid)) AS kich_thuoc
FROM pg_stat_user_indexes WHERE relname = 'employees';
```

```text
        ten_index          | kich_thuoc
---------------------------+------------
 employees_pkey            | 236 MB
 idx_employees_name        | 400 MB
 idx_employees_name_upper  | 400 MB
 idx_employees_name_trgm   | 259 MB
```

```text
   Bảng:   517 MB
   Index: 1.295 MB    →  index chiếm GẤP 2,5 LẦN bảng
```

Đây là tình huống rất hay gặp trong thực tế và rất hay bị bỏ sót khi ước lượng dung lượng.

### Khoản 2 — Tốc độ ghi

```sql
-- Xoá hết index phụ, chỉ giữ primary key
DROP INDEX idx_employees_name, idx_employees_name_upper, idx_employees_name_trgm;

\timing on
INSERT INTO employees (name)
SELECT substr(md5(random()::text), 1, 7) FROM generate_series(1, 200000);
```

```text
Time: 892.441 ms
```

```sql
-- Tạo lại 3 index rồi chèn y hệt
CREATE INDEX idx_employees_name ON employees(name);
CREATE INDEX idx_employees_name_upper ON employees(UPPER(name));
CREATE INDEX idx_employees_name_trgm ON employees USING GIN (name gin_trgm_ops);

INSERT INTO employees (name)
SELECT substr(md5(random()::text), 1, 7) FROM generate_series(1, 200000);
```

```text
Time: 4127.883 ms
```

```text
   892 ms  →  4.128 ms      CHẬM HƠN 4,6 LẦN chỉ vì thêm 3 index
```

Đây là lý do "đánh index cho mọi cột" là ý tưởng tồi. Mỗi index bắt **mọi** lệnh ghi trả thêm phí, kể cả những lệnh ghi không liên quan gì tới cột đó.

### Khoản 3 — Tranh chỗ trong RAM

Khoản này khó đo nhưng thường nguy hiểm nhất. Nếu tổng bảng + index vượt quá `shared_buffers`, các index ít dùng sẽ **đẩy dữ liệu nóng ra khỏi RAM**, làm mọi thứ chậm đi mà không thấy nguyên nhân trực tiếp.

---

## Các loại index trong PostgreSQL

`B-Tree` là mặc định và chiếm 95% trường hợp. Nhưng biết các loại còn lại giúp giải quyết những bài toán mà B-Tree bó tay:

| Loại | Hợp với | Không hợp với | Ví dụ dùng |
|---|---|---|---|
| **B-Tree** (mặc định) | `=`, `<`, `>`, `BETWEEN`, `LIKE 'x%'`, `ORDER BY` | Tìm phần giữa, dữ liệu đa chiều | Gần như mọi thứ |
| **Hash** | Chỉ `=` | Mọi thứ khác | Hiếm dùng — B-Tree gần như luôn tốt bằng hoặc hơn |
| **GIN** | Giá trị **chứa nhiều phần tử**: mảng, `jsonb`, toàn văn, tam tự | Ghi nhiều (cập nhật chậm) | Tìm kiếm toàn văn, `jsonb @>`, `LIKE '%x%'` |
| **GiST** | Dữ liệu hình học, khoảng, láng giềng gần nhất | | PostGIS, `tsrange` chồng lấn |
| **BRIN** | Bảng **rất lớn** có dữ liệu **tương quan với thứ tự vật lý** | Dữ liệu ngẫu nhiên | Bảng nhật ký theo thời gian |
| **SP-GiST** | Dữ liệu phân cấp, không cân bằng | | Địa chỉ IP, điểm không gian |

### BRIN — index tí hon cho bảng khổng lồ

Đáng nhắc riêng vì tỉ lệ lợi ích/chi phí của nó rất đặc biệt:

```text
   B-TREE                              BRIN
   ══════                              ════
   Lưu MỌI giá trị + con trỏ           Chỉ lưu min/max cho mỗi NHÓM 128 page
   Bảng 1 tỷ dòng → index ~30 GB       Bảng 1 tỷ dòng → index ~3 MB
                                        → NHỎ HƠN 10.000 LẦN

   Tìm chính xác: rất nhanh             Tìm khoảng: loại bỏ được các nhóm
                                        không chứa giá trị cần, rồi quét
                                        các nhóm còn lại
```

Điều kiện sống còn: **dữ liệu phải tương quan với thứ tự vật lý**. Bảng nhật ký chèn theo thời gian thì `created_at` tương quan gần như hoàn hảo → BRIN cực hiệu quả. Bảng có `user_id` ngẫu nhiên thì BRIN vô dụng.

```sql
CREATE INDEX idx_logs_time_brin ON logs USING BRIN (created_at);
```

### Partial index — chỉ đánh index phần cần

Nếu 99% dòng có `status = 'done'` và bạn chỉ bao giờ tìm `status = 'pending'`:

```sql
-- Index đầy đủ: đánh cả 100 triệu dòng
CREATE INDEX idx_jobs_status ON jobs(status);

-- Partial index: chỉ đánh 50.000 dòng đang chờ
CREATE INDEX idx_jobs_pending ON jobs(created_at) WHERE status = 'pending';
```

```text
   Index đầy đủ  : 2,1 GB, cập nhật với mọi thay đổi status
   Partial index : 1,8 MB, chỉ cập nhật khi dòng vào/ra trạng thái 'pending'
                    → NHỎ HƠN ~1.200 LẦN
```

Điều kiện: câu truy vấn phải chứa **đúng** mệnh đề `WHERE` của index thì planner mới dùng được nó.

Đây là một trong những kỹ thuật hiệu quả nhất mà ít người dùng — đặc biệt hợp với các bảng hàng đợi công việc.

---

## Quyết định đánh index ở đâu

Đừng đoán. Hỏi database.

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

```sql
SELECT left(query, 70)                 AS cau_lenh,
       calls                           AS so_lan_goi,
       round(total_exec_time::numeric)  AS tong_ms,
       round(mean_exec_time::numeric, 2) AS trung_binh_ms
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

```text
             cau_lenh              | so_lan_goi | tong_ms  | trung_binh_ms
-----------------------------------+------------+----------+---------------
 SELECT * FROM orders WHERE user_id|     412883 | 1882441  |          4.56
 SELECT id FROM employees WHERE nam|        118 |  356112  |       3018.24
```

Đọc bảng này đúng cách rất quan trọng:

- Dòng 2 chậm nhất mỗi lần (3 giây) nhưng chỉ chạy 118 lần.
- Dòng 1 chỉ 4,56 ms mỗi lần nhưng chạy **412.883 lần** — và **tốn tổng thời gian gấp 5 lần**.

> **Tối ưu theo `total_exec_time`, không theo `mean_exec_time`.** Một câu chậm chạy hiếm gây ít thiệt hại hơn một câu hơi chậm chạy liên tục.

### Tìm index vô dụng

Index không được dùng vẫn tốn đĩa và vẫn làm chậm mọi lệnh ghi. Tìm chúng:

```sql
SELECT relname                                  AS bang,
       indexrelname                             AS ten_index,
       idx_scan                                 AS so_lan_duoc_dung,
       pg_size_pretty(pg_relation_size(indexrelid)) AS kich_thuoc
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelid NOT IN (SELECT conindid FROM pg_constraint WHERE contype IN ('p','u'))
ORDER BY pg_relation_size(indexrelid) DESC;
```

Trước khi xoá, kiểm tra hai điều:

1. **Thống kê đã đủ dài chưa?** Nếu vừa `pg_stat_reset()` tuần trước thì báo cáo cuối quý chưa chạy. Nên quan sát ít nhất một chu kỳ nghiệp vụ đầy đủ.
2. **Nó có đang thực thi ràng buộc không?** Index của `PRIMARY KEY`/`UNIQUE` luôn hiện `idx_scan = 0` nhưng tuyệt đối không được xoá — câu truy vấn trên đã lọc sẵn.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Đánh index cho mọi cột trong `WHERE` | Mỗi index làm mọi lệnh ghi chậm đi và tốn RAM | Đánh theo `pg_stat_statements`, ưu tiên tổng thời gian |
| `WHERE UPPER(col) = ...` rồi ngạc nhiên sao chậm | Index lưu `col`, không lưu `UPPER(col)` | Index trên biểu thức, hoặc dùng `citext` |
| `WHERE col::text = '5'` | Ép kiểu là một hàm → mất index | Truyền đúng kiểu từ ứng dụng |
| Dùng `LIKE '%x%'` trên bảng lớn | B-Tree không tra được phần giữa | `pg_trgm` + GIN, hoặc tìm kiếm toàn văn |
| Tin "có index là chắc chắn được dùng" | Optimizer so chi phí; lấy 30% bảng thì quét tuần tự rẻ hơn | Luôn kiểm chứng bằng `EXPLAIN` |
| Đo trên bảng vài nghìn dòng | Toàn bộ trong RAM, mọi phương án đều nhanh | Tối thiểu 1 triệu dòng |
| Chạy `CREATE INDEX` trên production giờ cao điểm | Khoá bảng, chặn mọi lệnh ghi hàng chục giây tới hàng giờ | `CREATE INDEX CONCURRENTLY`, xem [bài 5](05-create-index-concurrently-va-best-practices.md) |
| Giữ index chưa từng được dùng | Tốn đĩa, tốn RAM, làm chậm ghi | Rà `pg_stat_user_indexes` định kỳ |
| Chỉ nhìn `Execution Time` khi so sánh | Không thấy được số page thật sự đọc | Dùng `EXPLAIN (ANALYZE, BUFFERS)` |

## Tóm tắt bài 1

- Index là **bản sao đã sắp xếp** của một vài cột. Ba tính chất: sắp xếp (lợi ích), là bản sao (tốn đĩa), phải duy trì (chậm ghi).
- Đo trên bảng 11 triệu dòng: không index **3.021 ms** → có index **0,075 ms**, tăng tốc **~40.000 lần** đổi lấy một lệnh `CREATE INDEX` 18 giây.
- Thêm **một cột** vào `SELECT` có thể làm chậm **41 lần** (`Index Only Scan` → `Index Scan`) vì nó thêm chặng nhảy vào bảng.
- Phân biệt **`Index Cond`** (điều kiện đẩy vào index — tốt) với **`Filter`** kèm `Rows Removed by Filter` lớn (đọc rồi mới vứt — dấu hiệu thiếu index).
- **Index chỉ giúp khi hỏi về tiền tố.** `LIKE 'abc%'` dùng được; `LIKE '%abc%'`, `UPPER(col)`, `col::text` đều làm mất index — chữa bằng index trên biểu thức hoặc `pg_trgm` + GIN.
- Hoá đơn đo được: 3 index làm bảng phình **gấp 2,5 lần** và làm `INSERT` chậm **4,6 lần**.
- **BRIN** nhỏ hơn B-Tree tới 10.000 lần cho bảng lớn có dữ liệu tương quan thứ tự vật lý. **Partial index** nhỏ hơn ~1.200 lần cho cột lệch phân bố.
- Quyết định đánh index bằng `pg_stat_statements` **theo tổng thời gian**, và rà index vô dụng bằng `pg_stat_user_indexes`.

**Bài kế tiếp** → [Bài 2: Index Scan vs Index Only Scan và Covering Index](02-index-scan-va-covering-index.md)

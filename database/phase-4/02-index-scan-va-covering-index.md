# Bài 2: Index Scan, Index Only Scan và Bitmap Scan — ba cách dùng cùng một index

Bạn đã tạo index. Nhưng "dùng index" không phải một hành động duy nhất — PostgreSQL có **ba** cách dùng nó, và chênh lệch giữa cách tốt nhất với cách tệ nhất trên cùng dữ liệu có thể lên tới **hàng trăm lần**.

```text
   Seq Scan          →  không đụng index          21.000 ms
   Index Scan        →  dùng index + nhảy vào bảng  16.000 ms
   Bitmap Index Scan →  dùng index, gom rồi mới nhảy   380 ms
   Index Only Scan   →  dùng index, KHÔNG chạm bảng      4 ms
```

Bài này giải thích bốn dòng đó: mỗi kiểu quét hoạt động thế nào, khi nào planner chọn kiểu nào, và quan trọng nhất — **làm sao để ép được về dòng cuối cùng**.

## Dựng bảng thí nghiệm

```sql
CREATE TABLE grades (
    id   SERIAL PRIMARY KEY,
    g    INT,
    name TEXT
);

INSERT INTO grades (g, name)
SELECT (random() * 100)::INT,
       substr(md5(random()::text), 1, 12)
FROM generate_series(1, 10000000);

VACUUM ANALYZE grades;
```

```text
INSERT 0 10000000
Time: 38221.117 ms (00:38.221)
```

`VACUUM ANALYZE` ở cuối **không phải cho có**. Sẽ thấy ở phần *visibility map* vì sao nếu bỏ nó thì `Index Only Scan` không hoạt động đúng.

```sql
SELECT pg_size_pretty(pg_relation_size('grades')) AS bang,
       pg_relation_size('grades')/8192            AS so_page;
```

```text
   bang   | so_page
----------+---------
 651 MB   |   83334
```

---

## Kiểu 1 — Seq Scan: đọc hết, không đụng index

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT name FROM grades WHERE id = 7;
```

Chưa tạo index phụ nào, nhưng `id` là primary key nên đã có index. Thử một cột chưa có index:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, g FROM grades WHERE g BETWEEN 80 AND 95 ORDER BY g DESC;
```

```text
Sort  (cost=2371882.44..2375872.31 rows=1595948 width=8)
      (actual time=19882.117..21044.882 rows=1584220 loops=1)
  Sort Key: g DESC
  Sort Method: external merge  Disk: 27912kB
  ->  Gather  (cost=1000.00..2141882.10 rows=1595948 width=8)
      Workers Launched: 2
      ->  Parallel Seq Scan on grades
            Filter: ((g >= 80) AND (g <= 95))
            Rows Removed by Filter: 1805260
  Buffers: shared hit=1284 read=82050, temp read=3489 written=3502
Execution Time: 21188.446 ms
```

Bốn dấu hiệu xấu trong kế hoạch này:

| Dấu hiệu | Nghĩa là |
|---|---|
| `Parallel Seq Scan` | Đọc toàn bộ 83.334 page |
| `Rows Removed by Filter: 1805260` | Mỗi worker đọc rồi vứt 1,8 triệu dòng |
| `Sort Method: external merge Disk: 27912kB` | Sắp xếp **tràn ra đĩa** vì không đủ `work_mem` |
| `temp read=3489 written=3502` | Ghi và đọc lại file tạm — I/O thêm |

**21 giây.** Bây giờ tạo index.

---

## Kiểu 2 — Index Scan: dùng index rồi nhảy vào bảng

```sql
CREATE INDEX idx_grades_g ON grades(g);
```

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, g FROM grades WHERE g BETWEEN 80 AND 95 ORDER BY g DESC;
```

```text
Index Scan Backward using idx_grades_g on grades
    (cost=0.43..1638224.11 rows=1595948 width=8)
    (actual time=0.062..15884.221 rows=1584220 loops=1)
  Index Cond: ((g >= 80) AND (g <= 95))
  Buffers: shared hit=8842 read=1580117
Execution Time: 16112.883 ms
```

Chỉ nhanh hơn từ 21 giây xuống 16 giây. **Có index mà gần như không cải thiện.** Vì sao?

Nhìn dòng `Buffers: read=1580117` — đọc **1,58 triệu** page, trong khi cả bảng chỉ có 83.334 page. Nghĩa là nhiều page bị đọc **đi đọc lại nhiều lần**.

```text
   INDEX SCAN — cơ chế
   ═══════════════════

   cây index (g)                        HEAP
   ┌─────────────┐
   │ g=80 → (912,3)  ──────────────────▶ đọc page 912  ┐
   │ g=80 → (17,8)   ──────────────────▶ đọc page 17   │
   │ g=80 → (4402,1) ──────────────────▶ đọc page 4402 │  1,58 TRIỆU
   │ g=81 → (88,12)  ──────────────────▶ đọc page 88   │  lần nhảy
   │ g=81 → (912,7)  ──────────────────▶ đọc page 912  │  NGẪU NHIÊN
   │  ...                                  ↑ ĐỌC LẠI!  │
   │ (1,58 triệu mục)                                  ┘
   └─────────────┘

   Vấn đề: mỗi mục index là MỘT lần nhảy vào heap.
           Page 912 bị đọc lại nhiều lần vì nhiều dòng khớp nằm trong đó.
```

Đây là lý do **index không phải lúc nào cũng thắng**: khi số dòng khớp lớn, số lần nhảy ngẫu nhiên còn đắt hơn đọc tuần tự cả bảng.

Điểm lật thường ở khoảng **5-10% số dòng của bảng**. Trên ngưỡng đó, optimizer sẽ bỏ index — và nó chọn đúng.

### Nhưng vì sao lần này planner vẫn chọn index?

Vì có `ORDER BY g DESC`. Index đã sắp sẵn theo `g`, nên dùng nó giúp **bỏ được bước sắp xếp** — và bước sắp xếp ở kế hoạch trước đã tràn ra đĩa. Chú ý cái tên `Index Scan Backward`: nó đi ngược cây từ cuối lên để ra thứ tự giảm dần.

Đây là một ví dụ hay: planner cân **hai** lợi ích trái chiều (lọc nhanh vs khỏi sắp xếp) chứ không chỉ nhìn một chiều.

---

## Kiểu 3 — Bitmap Index Scan: điểm cân bằng thông minh

Bỏ `ORDER BY` đi để thấy planner chọn gì:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, g FROM grades WHERE g BETWEEN 95 AND 100;
```

```text
Bitmap Heap Scan on grades  (cost=11284.22..189882.41 rows=594882 width=8)
                            (actual time=44.118..380.226 rows=594102 loops=1)
  Recheck Cond: ((g >= 95) AND (g <= 100))
  Heap Blocks: exact=83334
  ->  Bitmap Index Scan on idx_grades_g  (cost=0.00..11135.50 rows=594882 width=0)
        (actual time=42.882..42.883 rows=594102 loops=1)
        Index Cond: ((g >= 95) AND (g <= 100))
  Buffers: shared hit=1636 read=83326
Execution Time: 402.118 ms
```

**402 ms** thay vì 16 giây. Đây là kiểu quét đặc trưng của PostgreSQL, và ý tưởng của nó rất đẹp.

### Bitmap hoạt động thế nào

```text
   BƯỚC 1 — Bitmap Index Scan: quét index, KHÔNG nhảy vào heap ngay
   ═════════════════════════════════════════════════════════════════

   Tạo một mảng bit, mỗi bit ứng với MỘT PAGE của bảng:

   page:   0   1   2   3   4   5   6   7   8   9  ... 83333
   bit:  [ 0   0   0   0   0   0   0   0   0   0  ...   0 ]

   Quét index, mỗi lần tìm thấy một dòng khớp:
     "g=97 nằm ở page 4"     → bật bit 4  →  [0 0 0 0 1 0 ...]
     "g=96 nằm ở page 9"     → bật bit 9  →  [0 0 0 0 1 0 0 0 0 1 ...]
     "g=98 nằm ở page 4"     → bit 4 đã bật rồi → KHÔNG LÀM GÌ  ← mấu chốt
     ...

   BƯỚC 2 — SẮP XẾP bitmap theo số page (tự nhiên có sẵn)

   BƯỚC 3 — Bitmap Heap Scan: đọc heap MỘT LƯỢT theo thứ tự page
   ═════════════════════════════════════════════════════════════════

   đọc page 4 → 9 → 17 → 88 → 302 → ...   (TUẦN TỰ, không nhảy lùi)
   Mỗi page chỉ đọc ĐÚNG MỘT LẦN.

   BƯỚC 4 — Recheck Cond
   Mỗi page đọc lên có nhiều dòng, không phải dòng nào cũng khớp
   → phải kiểm tra lại điều kiện để loại bỏ dòng không thoả.
```

Ba lợi ích so với Index Scan thường:

| | Index Scan | Bitmap Scan |
|---|---|---|
| Số lần đọc một page | Nhiều lần nếu nhiều dòng khớp trong đó | **Đúng một lần** |
| Thứ tự đọc heap | Ngẫu nhiên, nhảy tới nhảy lui | **Tăng dần theo số page** → gần với tuần tự |
| Đổi lại | Trả về đúng thứ tự index | Mất thứ tự; phải `Recheck Cond` |

Dòng cuối giải thích vì sao thêm `ORDER BY g` lại làm planner quay về `Index Scan`: bitmap không giữ được thứ tự.

### `BitmapAnd` — kết hợp nhiều index

Đây là chỗ bitmap toả sáng nhất, và là câu trả lời cho câu hỏi *"có nên gộp hai cột vào một index composite không?"*

```sql
EXPLAIN (ANALYZE)
SELECT id FROM grades WHERE g > 95 AND id < 100000;
```

```text
Bitmap Heap Scan on grades  (actual time=18.882..24.117 rows=5942 loops=1)
  Recheck Cond: ((id < 100000) AND (g > 95))
  ->  BitmapAnd  (actual time=18.221..18.222 rows=0 loops=1)
        ->  Bitmap Index Scan on grades_pkey  (actual time=6.118..6.118 rows=99999 loops=1)
              Index Cond: (id < 100000)
        ->  Bitmap Index Scan on idx_grades_g  (actual time=11.442..11.443 rows=396122 loops=1)
              Index Cond: (g > 95)
Execution Time: 24.883 ms
```

```text
   BITMAP A (từ index id)     :  [1 1 1 0 0 1 0 0 ...]   99.999 dòng
   BITMAP B (từ index g)      :  [1 0 1 0 1 1 0 1 ...]  396.122 dòng
                                  ─────── AND ───────
   KẾT QUẢ                    :  [1 0 1 0 0 1 0 0 ...]    5.942 dòng

   Page nào chỉ có ở một bên → KHÔNG cần đọc. 100% không chứa dòng thoả cả hai.
```

Hai index riêng lẻ **hợp tác được với nhau** nhờ bitmap. Đây là lý do bạn không nhất thiết phải tạo index composite cho mọi tổ hợp điều kiện — nhưng cũng không phải composite là vô ích, xem [bài 3](03-composite-index-va-optimizer.md).

Tương tự có `BitmapOr` cho điều kiện `OR`.

### Bitmap "hao hụt" — khi `work_mem` không đủ

Chú ý dòng này trong kế hoạch:

```text
  Heap Blocks: exact=83334
```

`exact` nghĩa là bitmap đủ chi tiết tới **từng dòng**. Nhưng nếu bảng quá lớn so với `work_mem`, PostgreSQL chuyển sang chế độ hao hụt:

```text
  Heap Blocks: exact=1204  lossy=41882
```

`lossy` nghĩa là bitmap chỉ còn ghi nhớ **"page này có dòng khớp"**, không nhớ được dòng nào. Hậu quả: bước `Recheck Cond` phải kiểm tra **mọi dòng** trong các page đó, không chỉ dòng ứng viên.

Thấy `lossy` lớn là dấu hiệu nên tăng `work_mem`:

```sql
SET work_mem = '64MB';
```

---

## Kiểu 4 — Index Only Scan: không chạm bảng lần nào

Đây là đích đến. Thử câu chỉ cần cột đã có trong index:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT g FROM grades WHERE g BETWEEN 95 AND 100;
```

```text
Index Only Scan using idx_grades_g on grades
    (cost=0.43..15882.11 rows=594882 width=4)
    (actual time=0.042..118.226 rows=594102 loops=1)
  Index Cond: ((g >= 95) AND (g <= 100))
  Heap Fetches: 0
  Buffers: shared hit=1638
Execution Time: 141.882 ms
```

```text
   Bitmap Scan : 402 ms,  đọc 84.962 page
   Index Only  : 142 ms,  đọc  1.638 page     → ÍT HƠN 52 LẦN
```

Không chạm bảng lần nào (`Heap Fetches: 0`). Nhưng nó chỉ trả về được cột `g`. Muốn lấy thêm `id` mà vẫn giữ Index Only Scan thì cần **covering index**.

### Visibility map — vì sao Index Only Scan đôi khi không hoạt động

Đây là chi tiết ít tài liệu nhắc, nhưng là nguyên nhân số một khiến Index Only Scan "không chạy như quảng cáo".

Vấn đề: index **không lưu thông tin phiên bản MVCC**. Nó không biết dòng nào còn sống, dòng nào đã chết. Về nguyên tắc, database vẫn phải vào heap để kiểm tra — mà thế thì hết "only".

Lời giải của PostgreSQL là **visibility map** (bản đồ hiển thị): mỗi page của bảng có một bit, bật lên nghĩa là *"mọi dòng trong page này đều nhìn thấy được bởi mọi transaction"*.

```text
   Index Only Scan, với mỗi mục index tìm được:
       ├── Page chứa dòng này có bit visibility bật?
       │     CÓ  → tin index, không cần vào heap        ✔ Heap Fetches += 0
       │     KHÔNG → PHẢI vào heap kiểm tra             ✘ Heap Fetches += 1
```

Và **chỉ có `VACUUM` mới bật bit đó**. Nên:

```sql
-- Ghi thêm dữ liệu → các page mới chưa có bit visibility
INSERT INTO grades (g, name)
SELECT (random()*100)::INT, 'x' FROM generate_series(1, 500000);

EXPLAIN (ANALYZE) SELECT g FROM grades WHERE g BETWEEN 95 AND 100;
```

```text
Index Only Scan using idx_grades_g on grades
  Heap Fetches: 29882        ← KHÔNG còn 0!
Execution Time: 288.117 ms
```

```sql
VACUUM grades;
EXPLAIN (ANALYZE) SELECT g FROM grades WHERE g BETWEEN 95 AND 100;
```

```text
  Heap Fetches: 0            ← trở lại 0
Execution Time: 148.221 ms
```

> **Quy tắc:** thấy `Heap Fetches` lớn trong một `Index Only Scan` nghĩa là autovacuum đang không theo kịp tốc độ ghi. Đó là dấu hiệu cần chỉnh `autovacuum_vacuum_scale_factor` xuống cho bảng đó.

---

## Covering index — hai cách, và chúng khác nhau thật sự

Mục tiêu: đưa đủ cột vào index để không phải chạm bảng.

### Cách A — thêm cột vào khoá

```sql
CREATE INDEX idx_grades_g_id ON grades(g, id);
```

### Cách B — dùng `INCLUDE` (từ PostgreSQL 11)

```sql
CREATE INDEX idx_grades_g_inc ON grades(g) INCLUDE (id);
```

Cả hai đều cho `Index Only Scan` với `SELECT id, g ... WHERE g = ...`. Nhưng bên trong chúng **rất khác nhau**:

```text
   CÁCH A — (g, id) đều là KHOÁ
   ══════════════════════════════
   Cây được sắp xếp theo (g, rồi tới id)

        NÚT TRONG:  chứa cả g và id     ← id chiếm chỗ ở MỌI TẦNG
             │
        LÁ:  (80,1) (80,7) (80,42) (81,3) ...

   → Dùng được cho:  WHERE g=80 AND id=42     ✔ tìm chính xác
                     ORDER BY g, id            ✔ đã sắp sẵn
   → Cây CAO hơn vì nút trong nặng hơn

   CÁCH B — g là KHOÁ, id chỉ ĐI KÈM
   ══════════════════════════════════
   Cây chỉ sắp xếp theo g

        NÚT TRONG:  chỉ chứa g          ← nhẹ, cây THẤP hơn
             │
        LÁ:  80→[id:1, id:7, id:42]  81→[id:3] ...
                  ▲ id chỉ nằm ở LÁ, KHÔNG tham gia sắp xếp

   → Dùng được cho:  WHERE g=80 rồi lấy id ra    ✔
   → KHÔNG dùng được:  WHERE id=42 đơn thuần     ✘
                       ORDER BY g, id            ✘ id không sắp
```

Bảng chọn:

| | Thêm vào khoá `(g, id)` | `INCLUDE (id)` |
|---|---|---|
| Lọc/sắp xếp theo cột thêm | **Được** | Không |
| Kích thước cây | Lớn hơn (cột thêm ở mọi tầng) | **Nhỏ hơn** (chỉ ở lá) |
| Chiều cao cây | Cao hơn | **Thấp hơn** |
| Ép được `UNIQUE` trên cột đầu | Không (`UNIQUE(g,id)` khác `UNIQUE(g)`) | **Được** — `CREATE UNIQUE INDEX ... INCLUDE` |
| Kiểu dữ liệu cột thêm | Phải hỗ trợ so sánh B-Tree | **Kiểu nào cũng được** |

Nguyên tắc chọn:

> **Cột dùng để LỌC hoặc SẮP XẾP → đưa vào khoá.**
> **Cột chỉ để LẤY RA → đưa vào `INCLUDE`.**

Đo kích thước để thấy khác biệt:

```sql
SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes WHERE relname = 'grades';
```

```text
   indexrelname     | pg_size_pretty
--------------------+----------------
 grades_pkey        | 225 MB
 idx_grades_g       | 225 MB
 idx_grades_g_id    | 300 MB
 idx_grades_g_inc   | 300 MB
```

Trên bảng chỉ 2-3 cột thì chênh lệch không rõ. Trên bảng thật với khoá dài (chuỗi, khoá phức) thì `INCLUDE` tiết kiệm rõ rệt hơn.

### Cái giá của covering index

```text
   Index gốc     idx_grades_g      : 225 MB
   Covering      idx_grades_g_inc  : 300 MB     → LỚN HƠN 33%
```

Và index càng lớn thì:

- Càng khó nằm trọn trong RAM → chính việc tra index cũng gây I/O.
- Càng chậm khi ghi (mỗi `INSERT` phải ghi nhiều byte hơn).
- Càng dễ đẩy các index khác ra khỏi buffer pool.

Vì thế: **chỉ INCLUDE những cột thật sự xuất hiện thường xuyên trong `SELECT` của câu truy vấn nóng.** Đừng gộp cả bảng vào index — làm thế thì bạn vừa tạo ra một bản sao thứ hai của bảng.

---

## Cây quyết định: planner chọn kiểu quét nào

```text
                    Có index dùng được cho điều kiện WHERE?
                              │
              ┌───────────────┴───────────────┐
             KHÔNG                            CÓ
              │                                │
          Seq Scan            Mọi cột cần đều nằm trong index?
                                              │
                              ┌───────────────┴──────────────┐
                             CÓ                            KHÔNG
                              │                              │
                    ┌─────────┴────────┐          Ước lượng bao nhiêu dòng khớp?
              Bit visibility           │                     │
              đã bật hết?              │        ┌────────────┼────────────┐
                    │                  │      RẤT ÍT       VỪA        RẤT NHIỀU
           ┌────────┴───────┐          │        │            │            │
          CÓ              KHÔNG        │   Index Scan   Bitmap Scan   Seq Scan
           │                │          │   (nhảy ít)    (gom rồi     (index không
    INDEX ONLY SCAN    Index Only      │                 đọc 1 lượt)   bõ công)
      (nhanh nhất)     + Heap Fetches  │
                                       │
                            Cần ORDER BY theo index?
                            → luôn ưu tiên Index Scan
                              (bitmap không giữ thứ tự)
```

Bảng tóm tắt bốn kiểu:

| Kiểu quét | Đọc index | Chạm heap | Giữ thứ tự | Dùng khi |
|---|---|---|---|---|
| **Seq Scan** | Không | Toàn bộ | Không | Không có index, hoặc lấy >20-30% bảng |
| **Index Scan** | Có | Mỗi mục một lần nhảy | **Có** | Ít dòng khớp, hoặc cần `ORDER BY` |
| **Bitmap Scan** | Có | Mỗi page **một lần** | Không | Vừa phải (1-20% bảng) |
| **Index Only Scan** | Có | **Không** | Có | Mọi cột cần đều trong index + visibility map sạch |

---

## Ứng dụng thực tế: tối ưu một truy vấn phân trang

Đây là mẫu truy vấn xuất hiện ở gần như mọi ứng dụng:

```sql
SELECT id, g FROM grades WHERE g BETWEEN 10 AND 20 ORDER BY g LIMIT 1000;
```

**Trước tối ưu** (chỉ có index trên `g`):

```text
Limit  (actual time=0.088..6.442 rows=1000 loops=1)
  ->  Index Scan using idx_grades_g on grades
        Index Cond: ((g >= 10) AND (g <= 20))
        Buffers: shared hit=1004 read=8
Execution Time: 6.512 ms
```

**Sau tối ưu** (thêm covering index):

```sql
CREATE INDEX idx_grades_g_cover ON grades(g) INCLUDE (id);
```

```text
Limit  (actual time=0.042..0.488 rows=1000 loops=1)
  ->  Index Only Scan using idx_grades_g_cover on grades
        Index Cond: ((g >= 10) AND (g <= 20))
        Heap Fetches: 0
        Buffers: shared hit=12
Execution Time: 0.522 ms
```

```text
   6,51 ms  →  0,52 ms      NHANH HƠN 12,5 LẦN
   1.012 page → 12 page     ĐỌC ÍT HƠN 84 LẦN
```

Và lưu ý: câu này đã dùng index từ trước, đã có `LIMIT`. Chỉ thêm một chữ `INCLUDE` mà nhanh hơn 12 lần — vì nó xoá bỏ hoàn toàn 1.000 lần nhảy vào heap.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Thấy `Index Only Scan` là yên tâm | `Heap Fetches` lớn thì nó vẫn đang chạm heap | Luôn xem `Heap Fetches`; nếu lớn thì `VACUUM` / chỉnh autovacuum |
| `INCLUDE` cả chục cột | Index phình gần bằng bảng, mất hết lợi ích | Chỉ INCLUDE cột thật sự xuất hiện trong `SELECT` nóng |
| Đưa cột lọc vào `INCLUDE` | Cột trong `INCLUDE` **không** dùng để lọc được | Cột lọc/sắp xếp thì phải nằm trong khoá |
| Thấy `Bitmap Scan` tưởng là tệ | Đó thường là lựa chọn **đúng** cho khoảng vừa phải | So thời gian thật, đừng đoán theo tên kế hoạch |
| Bỏ qua `lossy` trong `Heap Blocks` | Bitmap hao hụt làm bước recheck đắt hơn nhiều | Tăng `work_mem` |
| Thử `Index Only Scan` ngay sau khi nạp dữ liệu | Visibility map chưa được bật | Chạy `VACUUM` trước khi đo |
| Tạo covering index cho mọi truy vấn | Mỗi cái tốn đĩa, tốn RAM, làm chậm ghi | Chỉ cho truy vấn đứng đầu `pg_stat_statements` |
| Chỉ nhìn `Execution Time` | Không thấy số page thật sự đọc | Luôn bật `BUFFERS` |

## Tóm tắt bài 2

- Có **bốn** kiểu quét, không phải hai: `Seq Scan` → `Index Scan` → `Bitmap Scan` → `Index Only Scan`, và chênh nhau tới hàng trăm lần trên cùng dữ liệu.
- **Index Scan** nhảy vào heap **mỗi mục một lần** — cùng một page có thể bị đọc lại nhiều lần. Đó là lý do có index mà vẫn chậm khi nhiều dòng khớp.
- **Bitmap Scan** gom trước danh sách page rồi đọc **mỗi page đúng một lần theo thứ tự tăng dần** — đổi lại mất thứ tự và phải `Recheck Cond`. `BitmapAnd` cho phép **hai index riêng lẻ hợp tác với nhau**.
- **Index Only Scan** không chạm heap, nhưng chỉ hoạt động khi **visibility map đã được `VACUUM` bật**. `Heap Fetches > 0` là dấu hiệu autovacuum không theo kịp.
- Hai cách làm covering index khác nhau thật sự: **thêm vào khoá** (lọc/sắp xếp được, cây to hơn) vs **`INCLUDE`** (chỉ lấy ra được, cây nhỏ hơn, kiểu nào cũng nhận).
- Quy tắc: **cột để lọc/sắp xếp → vào khoá; cột chỉ để lấy ra → vào `INCLUDE`.**
- Ví dụ thực tế: chỉ thêm `INCLUDE (id)` vào một truy vấn phân trang đã tối ưu sẵn cũng làm nó nhanh thêm **12,5 lần** và đọc ít hơn **84 lần** số page.

**Bài kế tiếp** → [Bài 3: Composite Index và Database Optimizer](03-composite-index-va-optimizer.md)

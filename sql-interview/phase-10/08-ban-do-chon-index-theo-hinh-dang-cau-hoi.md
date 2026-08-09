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

## Phần 6 — Bốn con số neo cho phỏng vấn

Khi bị hỏi *"tại sao"*, có con số là thắng. Bốn con số này đủ cho hầu hết câu hỏi về index:

```text
1. Fanout của B-Tree      : vài trăm  → 100 triệu dòng chỉ cần 4 tầng
2. Ngưỡng lật của index   : trên ~5-10% số dòng thì Seq Scan thắng
3. Giá của đọc ngẫu nhiên : random_page_cost 4.0 vs seq_page_cost 1.0
4. Trang PostgreSQL       : 8 KB  (InnoDB 16 KB, dòng đệm CPU 64 byte)
```

Và một câu neo cho mọi câu hỏi: **"Chi phí thật là số trang phải đọc, không phải số phép so sánh."**

## Phần 7 — Mười hai câu hỏi phỏng vấn tổng hợp, kèm đáp án 30 giây

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

## Phần 8 — Checklist trước khi tạo bất kỳ index nào

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

## Tóm tắt bài 8

- Quy trình gói trong một câu: **hình dạng câu hỏi → cấu trúc → cái giá → cách phát hiện khi nó vỡ**.
- Ba hình dạng gốc: **so sánh được** (B-Tree, BRIN, hash), **chứa** (GIN), **gần** (GiST, HNSW).
- Ba vế hay bị bỏ quên khi so sánh index: **kích thước**, **chi phí ghi**, và **điều kiện ngầm** — không phải tốc độ đọc.
- Bốn con số neo: fanout vài trăm; ngưỡng lật 5-10%; `random_page_cost` 4.0 vs `seq_page_cost` 1.0; trang 8 KB.
- Quy trình sáu bước chạy được ngay: `pg_stat_statements` → phân loại hình dạng → đọc plan → dọn index thừa → đo chi phí ghi → `CONCURRENTLY` rồi **xác nhận `idx_scan` có tăng**.
- Bước hay bị bỏ nhất là bước cuối. Index tạo ra mà không ai kiểm xem có được dùng không sẽ nằm đó ăn chi phí ghi suốt nhiều năm.

**Bài kế tiếp** → [Bài 9: Đối chiếu nguồn — 26 điểm đúng, 9 chỗ cần đính chính](09-doi-chieu-nguon-va-nhung-cho-can-dinh-chinh.md)

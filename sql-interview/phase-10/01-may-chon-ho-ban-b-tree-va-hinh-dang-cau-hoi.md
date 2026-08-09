# Bài 1: Câu lệnh duy nhất trong SQL âm thầm chọn hộ bạn một cấu trúc dữ liệu

Một đêm, bốn câu lệnh, cùng một bảng 12 triệu dòng. Cả bốn cột đều đã được đánh index từ lâu. Vậy mà **ba trong bốn câu vẫn quét sạch cả bảng**.

Không câu nào báo lỗi. Không cảnh báo nào. Bạn mở `EXPLAIN` lên xem và ba lần liền nó ghi đúng một chữ: `Seq Scan`. Index vẫn nằm đó, nguyên vẹn, đúng tên bạn đặt.

Bạn xoá index đánh lại. Bạn chạy `ANALYZE`. Ba câu đó vẫn quét. Tới đây phần lớn chúng ta kết luận: *"chắc bảng còn nhỏ nên optimizer thấy quét nhanh hơn"*. Không phải — bảng đó 12 triệu dòng, và **câu thứ tư dùng index rất ngọt**.

Cùng một bảng, cùng một loại index, một câu dùng được, ba câu không. Khác biệt không nằm ở dữ liệu. Nó nằm ở một chỗ gần như không ai nhìn.

> Index bạn tạo ra **không sai**. Nó chỉ không phải **loại** index trả lời được câu hỏi bạn đang hỏi.

## Chỗ không ai nhìn: bạn chưa bao giờ được chọn

Gõ lại câu lệnh tạo index đi. Bạn viết tên index, tên bảng, tên cột, rồi chấm hết:

```sql
CREATE INDEX idx_orders_note ON orders (note);
```

Ở đâu trong câu lệnh đó bạn được chọn **loại** index? Không có chỗ nào cả.

Bạn chưa bao giờ chọn, vì máy chưa bao giờ hỏi. Máy chọn hộ bạn, và luôn chọn cùng một thứ: **B-Tree**.

```text
CREATE INDEX ... ON t (col);
                  ▲
                  └── ở đây có một tham số vô hình:
                      USING btree     ← mặc định, không ai gõ bao giờ
```

Viết đầy đủ ra thì câu lệnh trên thật ra là:

```sql
CREATE INDEX idx_orders_note ON orders USING btree (note);
```

Đây là **câu lệnh duy nhất trong SQL âm thầm chọn hộ bạn một cấu trúc dữ liệu**. `SELECT` không chọn hộ bạn thuật toán join (optimizer chọn, nhưng nó chọn lại mỗi lần chạy và bạn xem được trong `EXPLAIN`). `CREATE TABLE` bắt bạn khai từng kiểu dữ liệu. Chỉ có `CREATE INDEX` là quyết định thay bạn một lần, đóng cứng vào đĩa, và không nói gì.

| Hệ quản trị | Mặc định khi không ghi `USING` | Ghi chú |
|---|---|---|
| PostgreSQL | `btree` | Có 6 loại dựng sẵn, xem bảng ở cuối bài |
| MySQL/InnoDB | B+Tree | `USING HASH` bị **bỏ qua im lặng** trên InnoDB |
| MySQL/MEMORY | **HASH** | Engine duy nhất mà mặc định *không* phải B-Tree |
| SQL Server | B+Tree (nonclustered) | Columnstore phải khai riêng |
| Oracle | B-Tree | `CREATE BITMAP INDEX` là câu lệnh riêng |

Dòng thứ ba đáng nhớ: cùng một cú pháp `CREATE INDEX`, đổi storage engine là đổi luôn cấu trúc nằm dưới — mà không có dòng cảnh báo nào.

## B-Tree là một cái cây **sắp xếp** — và đó là toàn bộ câu chuyện

Máy xếp mọi giá trị của cột thành **một hàng từ nhỏ tới lớn**, rồi chia tầng cho dễ nhảy vào giữa hàng.

```text
Hàng đã xếp (đây mới là bản chất, cái cây chỉ là mục lục của hàng này):

  ... 39 │ 40 │ 41 │ 42 │ 43 │ 44 ...
                       ▲
        nhảy thẳng tới đây, không đọc 12 triệu dòng
```

Nó nhanh **vì nó biết thứ tự**. Và đó vừa là sức mạnh, vừa là **cái trần**.

Nên câu hỏi đúng không phải *"Index của tôi có tốt không?"*. Câu hỏi đúng là:

> **"Câu tôi đang hỏi có giải được bằng thứ tự không?"**

Bốn câu lệnh đêm đó tách làm hai nhóm, đúng theo ranh giới này.

### Nhóm chạy được: câu thứ tư

```sql
SELECT * FROM orders WHERE customer_id = 42;
```

Máy đi vào cây: so một lần rẽ nhánh, so lần nữa rẽ nhánh, ba tầng là tới nơi. 12 triệu dòng, **3 lần đọc trang**.

> **Đính chính nguồn.** Bản gốc nói *"4 lần so, vì mỗi lần so bỏ đi một nửa số dòng còn lại"*. Câu này lẫn hai chuyện. "Bỏ đi một nửa" là mô tả **cây nhị phân**. B-Tree không chia đôi — mỗi tầng nó chia cho **hệ số phân nhánh** (fanout), thường vài trăm. Con số đúng: 12 triệu dòng với fanout ~250 cho ra `log₂₅₀(12.000.000) ≈ 3` **tầng** (tức 3 lần đọc trang), còn **số phép so** thì nhiều hơn hẳn — khoảng `3 × log₂(250) ≈ 24` phép so vì trong mỗi nút vẫn phải tìm nhị phân. Bài 2 sẽ cho thấy vì sao chính chỗ lẫn này là toàn bộ lý do B-Tree ra đời.

Và cùng cái hàng đã xếp đó trả lời được **ba câu hỏi nữa gần như miễn phí**:

```sql
WHERE total_amount > 1000000                          -- lớn hơn
WHERE ordered_at BETWEEN '2024-03-01' AND '2024-06-30' -- trong khoảng
WHERE ten LIKE 'Nguyễn%'                               -- bắt đầu bằng
```

Bốn câu hỏi khác nhau, một cấu trúc. Vì cả bốn thật ra là **cùng một câu**: *"đi tới chỗ nào trong hàng, rồi đọc tiếp từ đó"*.

```text
        =            >            BETWEEN         LIKE 'x%'
   ┌────┴────┐  ┌────┴──────┐  ┌────┴─────┐   ┌────┴─────┐
   nhảy tới   nhảy tới rồi   nhảy tới rồi    nhảy tới rồi
   rồi dừng   đọc tới cuối   đọc tới mốc    đọc tới khi
                             thứ hai        hết tiền tố

            → cả bốn: MỘT phép nhảy + MỘT lần đọc xuôi
```

Máy không hiểu ngày tháng, không hiểu tiền, không hiểu tên người. Nó chỉ biết **cái nào đứng trước cái nào**. Chỉ vậy thôi.

### Ranh giới lộ ra: sắp xếp cần một phép so

Muốn xếp hàng thì phải trả lời được *"cái nào lớn hơn?"* cho mọi cặp giá trị.

- Với **số**: so được.
- Với **ngày giờ**: so được (nó là số).
- Với **chuỗi**: so được, theo bảng chữ cái (collation).

Hết. Không còn gì so được nữa.

Thử một phép so xem sao: **giữa hai bài viết dài ba trang, bài nào lớn hơn?** Câu hỏi đó không có nghĩa. Mà không có nghĩa thì không xếp được hàng, không có hàng thì không dựng được cây.

> **Chốt khối 1.** B-Tree là cây sắp xếp, nên nó chỉ trả lời đúng bốn hình dạng câu hỏi: **bằng**, **lớn/nhỏ hơn**, **trong khoảng**, **bắt đầu bằng**. Ngoài bốn cái đó, nó không có cửa.

## Ba câu còn lại của đêm đó

```sql
-- Câu 1: bài viết có chứa chữ "bảo hành" (nằm giữa bài)
SELECT * FROM posts   WHERE noi_dung LIKE '%bảo hành%';

-- Câu 2: quán ăn gần chỗ tôi đang đứng
SELECT * FROM quan_an ORDER BY khoang_cach(vi_do, kinh_do, 21.02, 105.83) LIMIT 20;

-- Câu 3: sản phẩm "giống" cái tôi vừa xem
SELECT * FROM products ORDER BY mo_ta_vector <-> :vector_cua_san_pham LIMIT 10;
```

Ba câu này nghe rất bình thường — ứng dụng nào cũng có đủ cả ba. Nhưng thử xếp hàng cho chúng, và cả ba **gãy ở đúng một chỗ**, vì ba lý do khác nhau.

**Câu 1 — chữ nằm ở giữa.** B-Tree xếp theo chữ cái **đầu**, nên nó biết chỗ nào bắt đầu bằng "bảo". Nhưng chữ cần tìm nằm **ở giữa bài**. Ở giữa thì không có đầu nào để mà nhảy tới.

```text
Hàng đã xếp theo nội dung bài:

  "Anh em ơi, bảo hành 12 tháng..."   ← chữ B ở giữa
  "Bảo hành mở rộng"                  ← chữ B ở đầu  ✓ nhảy tới được
  "Chính sách đổi trả, bảo hành..."   ← chữ B ở giữa
  "Zalo shop, bảo hành tận nơi"       ← chữ B ở giữa

  LIKE 'Bảo hành%'  → nhảy được, chỉ chạm 1 dòng
  LIKE '%bảo hành%' → phải mở từng bài ra đọc, cả 4 triệu bài
```

**Câu 2 — hai con số đi với nhau.** "Gần" là vĩ độ **và** kinh độ. Xếp theo vĩ độ thì mất kinh độ, xếp theo kinh độ thì mất vĩ độ. **Một cái hàng chỉ có một chiều.**

```text
Xếp theo vĩ độ:  A(21.02, 105.83)   B(21.03, 130.00)   C(21.04, 105.84)

  B đứng ngay cạnh A trong hàng — nhưng ngoài đời B cách A 2.500 km.
  C xa A hai bậc trong hàng     — nhưng ngoài đời C cách A 2 km.

  → thứ tự trong hàng KHÔNG phản ánh khoảng cách thật.
```

**Câu 3 — không tồn tại phép so.** "Giống" là gì? Không phải bằng, không phải lớn hơn. Không có phép so nào cho hai cái áo. Câu hỏi này thậm chí **không có một đáp án đúng duy nhất**.

Ba câu, ba lý do, cùng một kết cục:

```text
không so được lớn/nhỏ  →  không xếp được hàng
không có hàng          →  không dựng được cây
không có cây           →  máy chỉ còn một cách: đọc hết
```

> **Chốt khối 2.** Cái `Seq Scan` đó **không phải lỗi của máy**. Nó là câu trả lời trung thực nhất máy đưa ra được. Bạn giao cho nó một câu hỏi mà cấu trúc trong tay nó **không mang hình dạng đó**.

## Mỗi câu đều có một cấu trúc sinh ra đúng để trả lời nó

Không câu nào bó tay cả. Chỉ là **bạn phải gọi tên nó ra**, vì máy sẽ không tự chọn.

### Câu chứa chữ → index đảo (inverted index)

Nó không lưu bài viết. Nó lưu **từ**. Và mỗi từ cầm theo danh sách số hiệu bài chứa nó. Bạn hỏi từ, nó trả về danh sách. **Lật ngược quan hệ là xong.**

```text
Cách thường (xuôi):              Index đảo (ngược):
  bài 1 → [bảo, hành, 12, tháng]   "bảo"  → [1, 7, 9, 204, ...]
  bài 7 → [bảo, hành, tận, nơi]    "hành" → [1, 7, 55, ...]
  bài 9 → [chính, sách, bảo, ...]  "tháng"→ [1, 33, ...]

  Hỏi "bảo hành" = lấy 2 danh sách rồi giao nhau. Không mở bài nào.
```

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- cho tìm chuỗi con
CREATE INDEX idx_posts_fts ON posts USING GIN (to_tsvector('simple', noi_dung));
```

Bài 6 mổ kỹ loại này — kể cả chỗ nó **im lặng trả về 0 kết quả** khi khách gõ thiếu một chữ cái.

### Câu tìm gần → cây R (R-Tree, trong Postgres là GiST)

Nó không xếp toạ độ thành hàng. Nó **bọc từng cụm điểm vào một ô chữ nhật**, rồi bọc các ô nhỏ vào ô lớn hơn. Tìm gần thành ra chỉ mở đúng vài cái ô.

```text
        ┌──────────────────────────────┐
        │ Ô lớn A                      │
        │   ┌─────────┐  ┌──────────┐  │
        │   │ ô A1    │  │ ô A2     │  │
        │   │ • • •   │  │  • •     │  │
        │   └─────────┘  └──────────┘  │
        └──────────────────────────────┘
                ▲
        điểm của bạn rơi vào A1 → chỉ mở A1 và hàng xóm sát nó
```

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE INDEX idx_quan_an_vitri ON quan_an USING GIST (vi_tri);
```

### Câu tìm giống ý → index vector

Mỗi sản phẩm thành **một điểm trong không gian nghìn chiều**. Câu hỏi cũng thành một điểm. Và "giống ý" nghĩa là **nằm gần**. Không so lớn nhỏ nữa, chỉ đo khoảng cách.

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX idx_products_vec ON products USING hnsw (mo_ta_vector vector_cosine_ops);
```

Bài 7 mổ loại này, kể cả chỗ nó **cố tình trả lời sai** — và vì sao đó lại là thiết kế đúng.

## Sáu loại index đã nằm sẵn trong máy bạn

Trong PostgreSQL, cả ba thứ vừa nói **đều có sẵn**, không phải cài gì thêm (trừ vài extension đi kèm bản cài).

| Loại | Cấu trúc | Trả lời được hình dạng câu hỏi | Kích thước tương đối |
|---|---|---|---|
| **btree** | Cây sắp xếp | `=` `<` `>` `BETWEEN` `LIKE 'x%'` `ORDER BY` | Chuẩn (1×) |
| **hash** | Bảng băm | Chỉ `=` | Nhỏ hơn với khoá dài |
| **gin** | Index đảo | "chứa phần tử/từ này": full-text, `jsonb @>`, mảng, trigram | To (2-3× btree) |
| **gist** | Cây bao khối | Chồng lấn/giao nhau/gần nhau: không gian, range, full-text | Vừa |
| **spgist** | Cây phân hoạch không cân bằng | Dữ liệu phân bố lệch: điểm, tiền tố văn bản, `inet` | Nhỏ |
| **brin** | Tóm tắt min/max theo khối | Bảng cực lớn, dữ liệu **đã sắp tự nhiên** trên đĩa | Cực nhỏ (~1/10.000) |

Gọi tên chúng ra chỉ tốn **hai chữ**:

```sql
CREATE INDEX ... USING GIN  (...);   -- tìm chữ, jsonb, mảng
CREATE INDEX ... USING GIST (...);   -- toạ độ, khoảng, chồng lấn
CREATE INDEX ... USING BRIN (...);   -- bảng log khổng lồ
```

Câu lệnh dài thêm đúng hai chữ, và cái `Seq Scan` biến mất.

> **Đính chính nguồn.** Bản gốc nói *"Postgres, MySQL, cả 3 đều vậy"* — chỉ kể tên hai hệ, con số "3" là chỗ nói vấp. Quan trọng hơn: câu *"máy luôn chọn B-Tree"* **không đúng tuyệt đối**. MySQL engine `MEMORY` mặc định là HASH; Oracle có `CREATE BITMAP INDEX` là câu lệnh riêng. Điều đúng ở mọi hệ là: **mặc định của bảng nghiệp vụ thông thường luôn là B-Tree, và không hệ nào hỏi bạn cả.**

### SP-GiST: loại ít người biết nhất trong sáu loại

Năm loại kia sẽ có bài riêng. Riêng SP-GiST thì không, nên nói gọn ở đây.

**SP** = *Space-Partitioned* — cây **phân hoạch không gian** và **không cân bằng**. Khác biệt cốt lõi với GiST:

```text
GiST   : các ô con ĐƯỢC PHÉP chồng lấn nhau
         → một điểm có thể nằm trong nhiều ô → phải mở nhiều nhánh

SP-GiST: các ô con KHÔNG chồng lấn, phủ kín và rời nhau
         → một điểm nằm trong ĐÚNG MỘT ô → đi thẳng một nhánh
         → đổi lại: cây có thể rất lệch nếu dữ liệu dồn cục
```

Ba dạng dùng thật:

```sql
-- 1. Điểm trong không gian: quadtree/k-d tree, nhanh hơn GiST khi dữ liệu phân bố lệch
CREATE INDEX ON quan_an USING SPGIST (vi_tri);

-- 2. Tiền tố văn bản: radix tree (cây tiền tố) — index NHỎ hơn btree rất nhiều
--    vì các chuỗi chung tiền tố dùng chung nhánh
CREATE INDEX ON urls USING SPGIST (duong_dan text_ops);
SELECT * FROM urls WHERE duong_dan LIKE 'https://shop.vn/danh-muc/%';

-- 3. Địa chỉ mạng: cực hợp vì IP vốn là cây tiền tố nhị phân
CREATE INDEX ON nhat_ky USING SPGIST (dia_chi_ip inet_ops);
SELECT * FROM nhat_ky WHERE dia_chi_ip << '10.0.0.0/8';
```

Dòng thứ hai đáng nhớ: với cột URL hoặc đường dẫn (rất nhiều chuỗi chung tiền tố), **SP-GiST radix tree thường nhỏ hơn B-Tree 2-5 lần** và trả lời tiền tố nhanh hơn. Rất ít người biết, và nó đúng cái hình dạng dữ liệu của mọi bảng log web.

Cái giá: SP-GiST **không hỗ trợ index nhiều cột**, và với dữ liệu phân bố đều thì nó thua GiST.

## Phòng thí nghiệm: dựng lại đúng đêm đó trên máy bạn

Đọc xong mà không gõ lại thì chỉ nhớ được vài ngày. Đoạn này dựng đủ dữ liệu để **tự nhìn thấy** cả bốn câu lệnh, chạy trong khoảng hai phút.

```sql
-- 1. Dựng bảng 3 triệu dòng (đủ để optimizer bỏ index, không cần tới 12 triệu)
CREATE TABLE bai_viet (
    id          BIGSERIAL PRIMARY KEY,
    khach_id    INT,
    tieu_de     TEXT,
    noi_dung    TEXT,
    vi_do       DOUBLE PRECISION,
    kinh_do     DOUBLE PRECISION,
    tao_luc     TIMESTAMPTZ
);

INSERT INTO bai_viet (khach_id, tieu_de, noi_dung, vi_do, kinh_do, tao_luc)
SELECT (random()*100000)::int,
       'Bai viet so ' || i,
       CASE WHEN i % 250 = 0
            THEN 'Chinh sach doi tra va bao hanh 12 thang chinh hang cho san pham'
            ELSE 'Noi dung mau khong chua tu khoa can tim, dai vua du de giong that'
       END,
       20.5 + random()*2,
       105.0 + random()*2,
       now() - (random()*365) * interval '1 day'
  FROM generate_series(1, 3000000) i;

-- 2. Đánh index đúng như đêm đó: cột nào cũng có index, đều là mặc định
CREATE INDEX ON bai_viet (khach_id);
CREATE INDEX ON bai_viet (noi_dung);      -- đây là cái sẽ KHÔNG cứu được câu 1
CREATE INDEX ON bai_viet (vi_do);         -- và cái này KHÔNG cứu được câu 2
CREATE INDEX ON bai_viet (tao_luc);
ANALYZE bai_viet;
```

Giờ chạy bốn câu và đọc plan:

```sql
-- CÂU 4 — có thứ tự → dùng index ngọt
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM bai_viet WHERE khach_id = 42;
```

```text
Bitmap Heap Scan on bai_viet  (actual time=0.089..0.152 rows=31 loops=1)
  Recheck Cond: (khach_id = 42)
  Buffers: shared hit=34                       ← chạm 34 trang
  ->  Bitmap Index Scan on bai_viet_khach_id_idx  (actual time=0.061..0.061 rows=31)
Execution Time: 0.203 ms
```

```sql
-- CÂU 1 — chuỗi nằm GIỮA → index trên noi_dung vô dụng
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM bai_viet WHERE noi_dung LIKE '%bao hanh%';
```

```text
Gather  (actual time=1.9..2841 rows=12000 loops=1)
  ->  Parallel Seq Scan on bai_viet  (actual time=... rows=4000 loops=3)
        Filter: (noi_dung ~~ '%bao hanh%')
        Rows Removed by Filter: 996000
  Buffers: shared hit=112 read=71428            ← chạm 71.540 trang, gấp 2.100 lần
Execution Time: 2853 ms
```

Hai plan này cạnh nhau là toàn bộ bài học: **cùng một bảng, cùng có index, chênh nhau 14.000 lần** — không phải vì dữ liệu, mà vì **hình dạng câu hỏi**.

```sql
-- Đổi hình dạng câu hỏi: TIỀN TỐ thay vì chuỗi giữa
EXPLAIN (ANALYZE) SELECT * FROM bai_viet WHERE noi_dung LIKE 'Chinh sach%';
--  → Index Scan, dưới 1 ms. Cùng cột, cùng index, chỉ đổi vị trí dấu %.

-- Rồi gọi tên đúng cấu trúc cho câu hỏi "chứa chuỗi"
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ON bai_viet USING GIN (noi_dung gin_trgm_ops);
EXPLAIN (ANALYZE) SELECT * FROM bai_viet WHERE noi_dung LIKE '%bao hanh%';
--  → Bitmap Heap Scan qua index GIN, ~15 ms thay vì 2.853 ms.
```

```sql
-- CÂU 2 — "gần" trong hai chiều: btree trên vi_do không giữ được khoảng cách
EXPLAIN (ANALYZE)
SELECT * FROM bai_viet
 ORDER BY point(kinh_do, vi_do) <-> point(105.83, 21.02)
 LIMIT 20;
--  → Seq Scan + Sort trên 3 triệu dòng, dù vi_do đã có index.

CREATE INDEX ON bai_viet USING GIST (point(kinh_do, vi_do));
--  → giờ Index Scan kNN, dưới 1 ms.
```

Ba dòng cần rút ra khi đọc plan:

| Đọc dòng nào | Nó nói gì |
|---|---|
| `Seq Scan` / `Index Scan` / `Bitmap Heap Scan` | Máy **chọn đường nào** |
| `Buffers: shared hit=... read=...` | **Số trang thật sự phải đọc** — đây mới là chi phí, không phải mili giây |
| `Rows Removed by Filter` | Số dòng đọc lên rồi **vứt đi**. Con số này lớn nghĩa là index không lọc giúp được gì |

Dòng `Buffers` là dòng quý nhất và ít người bật nhất. Mili giây phụ thuộc máy đang bận hay rảnh; **số trang thì không nói dối**.

```sql
-- Dọn phòng thí nghiệm
DROP TABLE bai_viet;
```

## Vì sao gần như không ai biết chuyện này?

Sáu loại index nằm ngay trong máy, tài liệu công khai và miễn phí, vậy mà phần lớn dev đi hết sự nghiệp chỉ dùng **một loại**. Vì sao?

Vì **B-Tree chọn đúng 9 trên 10 lần**. Cột số, cột ngày, cột mã đơn, cột tên. Chín phần mười công việc thật đúng là mấy cột đó. Mặc định này tốt tới mức **nó tự xoá mình khỏi tầm mắt bạn**.

Và đây là cú lật:

```text
Mặc định SAI      → bạn phát hiện ngay ngày đầu tiên.
Mặc định ĐÚNG 9/10 → bạn KHÔNG BAO GIỜ phát hiện,
                     vì chín lần đầu nó đều đúng.
                     Lần thứ mười không kêu một tiếng nào.
```

Nên bạn không hề chọn sai. **Bạn chưa từng được hỏi.** Và một lựa chọn không ai đưa ra cho bạn thì nó không nằm trong đầu bạn — cho tới cái đêm ba câu lệnh cùng quét một bảng 12 triệu dòng.

Đây là dạng lỗi khó chịu nhất trong nghề: nó không nằm ở chỗ bạn viết sai, nó nằm ở chỗ **bạn không biết là mình có quyền chọn**.

## Bảng tra nhanh: từ hình dạng câu hỏi → cấu trúc

Đây là thứ nên dán lên màn hình. Bài 8 sẽ mở rộng thành một bản đồ đầy đủ.

| Câu hỏi nghiệp vụ nghe như thế nào | Hình dạng | Cấu trúc đúng |
|---|---|---|
| "đơn của khách số 42" | bằng | btree |
| "đơn trên 1 triệu" / "từ tháng 3 tới tháng 6" | khoảng | btree |
| "tên bắt đầu bằng Nguyễn" | tiền tố | btree |
| "20 đơn mới nhất" | thứ tự + giới hạn | btree |
| "bài viết **chứa chữ** bảo hành" | chứa từ | gin (full-text) |
| "sản phẩm có tên **chứa chuỗi** 'iph'" | chứa chuỗi con | gin/gist + `pg_trgm` |
| "đơn hàng có `metadata->>'kenh' = 'app'`" | chứa khoá JSON | gin (`jsonb_path_ops`) |
| "bài có **thẻ** trong danh sách này" | giao mảng | gin |
| "quán ăn **gần** chỗ tôi" | lân cận không gian | gist / spgist |
| "phòng nào **trùng lịch** với khoảng này" | chồng lấn khoảng | gist (`EXCLUDE`) |
| "sản phẩm **giống ý** cái này" | lân cận nhiều chiều | hnsw / ivfflat (pgvector) |
| "log 2 tỉ dòng, lấy 7 ngày gần nhất" | khoảng trên bảng đã sắp | brin |
| "đơn ở trạng thái nào, kênh nào, miền nào" (kho dữ liệu) | giao nhiều cột ít giá trị | bitmap (Oracle) / columnstore |

## Ba câu hỏi phỏng vấn quanh bài này

**"Vì sao có index rồi mà vẫn `Seq Scan`?"**
Trả lời theo hai tầng mới đủ điểm. Tầng một là ba lý do kinh điển: điều kiện không SARGable (bọc hàm, ép kiểu), độ chọn lọc quá thấp, thống kê lỗi thời. Tầng hai — chỗ tách ứng viên — là: **có thể index đúng cột nhưng sai loại**, tức câu hỏi không mang hình dạng mà B-Tree biết trả lời. Nói được vế thứ hai là bạn đã đứng trên phần lớn ứng viên.

**"Cột `noi_dung` kiểu `TEXT` có nên đánh index không?"**
Đây là câu hỏi bẫy vì nó cố tình hỏi sai. Câu đúng phải là *"bạn tra cột đó bằng phép gì?"*. `= 'chuỗi chính xác'` thì btree (nhưng cân nhắc index trên `md5(noi_dung)` nếu chuỗi rất dài). `LIKE 'tiền tố%'` thì btree với `text_pattern_ops`. `LIKE '%giữa%'` thì `pg_trgm`. Tìm kiếm theo từ thì GIN + `tsvector`. Bốn câu trả lời khác nhau cho cùng một cột.

**"Kể một loại index bạn từng dùng ngoài B-Tree."**
Nếu chưa từng dùng, đừng bịa. Cách trả lời an toàn và vẫn ghi điểm: nêu đúng hình dạng bài toán mà bạn biết B-Tree không giải được, kèm loại index tương ứng và **cái giá của nó** — ví dụ GIN cho full-text nhưng ghi chậm hơn hẳn vì mỗi lần `INSERT` phải cập nhật hàng chục mục từ.

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| "Đánh index là xong, không cần nghĩ gì thêm" | Bạn vừa chọn B-Tree mà không biết mình đã chọn |
| Thấy `Seq Scan` là nghĩ ngay tới thống kê cũ | Thống kê cũ làm **đổi plan**; sai loại index thì plan **không bao giờ đổi** dù `ANALYZE` bao nhiêu lần |
| Nghĩ `LIKE '%x%'` chỉ là "chậm hơn chút" | Nó không phải chậm hơn — nó **không có cấu trúc nào phục vụ**, trừ khi bạn dựng trigram |
| Đánh btree lên cột toạ độ rồi tưởng đã tối ưu | Hàng một chiều không giữ được khoảng cách hai chiều |
| Dùng `USING HASH` trên InnoDB | MySQL **bỏ qua im lặng**, bạn vẫn nhận B+Tree |
| Nghĩ nhiều loại index thì cứ đánh hết cho chắc | Mỗi index là một cây phải cập nhật ở **mọi** lần ghi |

## Tóm tắt bài 1

- `CREATE INDEX` là câu lệnh duy nhất trong SQL **chọn hộ bạn một cấu trúc dữ liệu** — mặc định `USING btree`, và không hệ nào hỏi bạn.
- B-Tree là **cây sắp xếp**, nên nó chỉ trả lời được bốn hình dạng: `=`, `<`/`>`, `BETWEEN`, `LIKE 'tiền tố%'` (cộng `ORDER BY` miễn phí).
- Không so được lớn nhỏ → không xếp được hàng → không dựng được cây → máy buộc phải đọc hết. `Seq Scan` là câu trả lời **trung thực**, không phải lỗi.
- Ba hình dạng câu hỏi phá vỡ thứ tự: **chứa chuỗi/từ** (chữ nằm ở giữa), **gần nhau trong không gian** (hàng chỉ có một chiều), **giống ý** (không tồn tại phép so).
- PostgreSQL có sẵn **sáu loại**: btree, hash, gin, gist, spgist, brin — cộng hnsw/ivfflat qua `pgvector`. Gọi tên chúng tốn đúng hai chữ.
- Đừng hỏi *"cột này có nên đánh index không"*. Hỏi *"câu này có **hình dạng** gì"*, rồi mới chọn cấu trúc mang đúng hình dạng đó. **Thứ tự hai câu hỏi mới là thứ quyết định.**

**Bài kế tiếp** → [Bài 2: Vì sao là cây B chứ không phải cây nhị phân](02-vi-sao-la-cay-b-chu-khong-phai-cay-nhi-phan.md)

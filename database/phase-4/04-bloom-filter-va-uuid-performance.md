# Bài 4: Bloom Filter và cái giá của UUID trong B+Tree

Bài này ghép hai chủ đề tưởng như không liên quan, nhưng chúng chung một gốc: **cả hai đều nói về việc tránh những lần chạm đĩa vô ích**.

- **Bloom filter** trả lời câu hỏi *"có cần đi tìm không?"* bằng vài bit RAM, chặn được phần lớn lượt tìm kiếm hụt.
- **UUID ngẫu nhiên** thì làm điều ngược lại: nó biến mỗi lần ghi thành một lần chạm đĩa ở chỗ mới, và làm sập hiệu năng ghi.

---

# Phần I — Bloom Filter

## Bài toán: hàng triệu lượt tìm kiếm hụt

Một hệ thống kiểm tra tên đăng nhập đã tồn tại chưa. Mỗi lần người dùng gõ một ký tự, gửi một truy vấn:

```sql
SELECT 1 FROM users WHERE username = 'nguyenvanan123';
```

99% số lần trả về **không có gì**. Nhưng để biết "không có gì", database vẫn phải:

```text
   đọc page gốc index    → I/O
   đọc page tầng 2       → I/O
   đọc page lá           → I/O
   → "không tìm thấy"

   Ba lần chạm đĩa để trả lời "không".
   × 50.000 lượt gõ phím mỗi giây = 150.000 I/O/giây cho câu trả lời RỖNG.
```

Bloom filter giải quyết đúng chuyện này: **trả lời "chắc chắn không có" mà không cần chạm đĩa lần nào.**

## Bloom filter là gì

Một **mảng bit** cộng với **k hàm băm**. Chỉ vậy.

Nó trả lời được đúng hai câu:

```text
   "Giá trị X có trong tập không?"

   → "CHẮC CHẮN KHÔNG CÓ"     ← luôn luôn đúng, không bao giờ sai
   → "CÓ THỂ CÓ"              ← có thể sai (dương tính giả)
```

Chú ý sự bất đối xứng: nó **không bao giờ** nói sai câu đầu. Đó chính là tính chất khiến nó dùng được.

Hình dung: một người bảo vệ ở cổng kho. Anh ta không biết chính xác trong kho có gì, nhưng anh ta chắc chắn về những thứ **không** có. Nói "không có đâu, khỏi vào" thì luôn đúng. Nói "có thể có, mời vào tìm" thì đôi khi bạn vào tìm rồi về tay không.

## Cách hoạt động — diễn từng bước

Dùng mảng 16 bit và 3 hàm băm:

```text
   MẢNG BAN ĐẦU (16 bit, tất cả bằng 0)

   vị trí: 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
   bit:  [ 0  0  0  0  0  0  0  0  0  0  0  0  0  0  0  0 ]
```

**Thêm "an123":**

```text
   h1("an123") = 3        h2("an123") = 9        h3("an123") = 14
                  ↓                     ↓                      ↓
   vị trí: 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
   bit:  [ 0  0  0  1  0  0  0  0  0  1  0  0  0  0  1  0 ]
                    ▲                  ▲              ▲
                  BẬT               BẬT             BẬT
```

**Thêm "binh456":**

```text
   h1 = 1        h2 = 9  (đã bật rồi)        h3 = 6

   vị trí: 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
   bit:  [ 0  1  0  1  0  0  1  0  0  1  0  0  0  0  1  0 ]
             ▲          ▲     ▲
```

**Tra "chi789" — trường hợp CHẮC CHẮN KHÔNG CÓ:**

```text
   h1 = 5   → bit[5]  = 0   ← MỘT BIT BẰNG 0 LÀ ĐỦ KẾT LUẬN
   h2 = 11
   h3 = 2

   → "CHẮC CHẮN KHÔNG CÓ"

   Vì sao chắc chắn? Nếu "chi789" từng được thêm vào,
   thì bit[5] BẮT BUỘC phải bằng 1. Nó bằng 0 → chưa từng được thêm.
   → Không cần chạm đĩa. Trả lời ngay.
```

**Tra "duc999" — trường hợp DƯƠNG TÍNH GIẢ:**

```text
   h1 = 3   → bit[3]  = 1  ✔  (do "an123" bật)
   h2 = 6   → bit[6]  = 1  ✔  (do "binh456" bật)
   h3 = 14  → bit[14] = 1  ✔  (do "an123" bật)

   → "CÓ THỂ CÓ" → phải đi tra database thật
   → Tra xong: KHÔNG CÓ.  Đây là DƯƠNG TÍNH GIẢ.

   Cả ba bit đều bật, nhưng bởi những phần tử KHÁC.
```

Dương tính giả chỉ gây **lãng phí một lần tra**, không gây sai kết quả. Đó là lý do nó chấp nhận được.

## Kích thước bao nhiêu thì đủ

Công thức: với `n` phần tử và tỉ lệ dương tính giả mong muốn `p`:

```text
   Số bit cần:      m = −(n × ln p) / (ln 2)²
   Số hàm băm tối ưu: k = (m / n) × ln 2
```

Bảng thực dụng:

| Tỉ lệ dương tính giả | Bit mỗi phần tử | Số hàm băm |
|---|---|---|
| 10% | 4,8 | 3 |
| **1%** | **9,6** | **7** |
| 0,1% | 14,4 | 10 |
| 0,01% | 19,2 | 13 |

Con số đáng kinh ngạc nằm ở đây:

```text
   1 TRIỆU tên đăng nhập, mỗi tên trung bình 15 ký tự

   LƯU ĐẦY ĐỦ (hash set):  1.000.000 × 15 byte  ≈  15 MB (chưa kể overhead)
   BLOOM FILTER 1% FP   :  1.000.000 × 9,6 bit  ≈  1,2 MB

                                        → NHỎ HƠN 12 LẦN
```

Và với 1% dương tính giả, **99% lượt tìm kiếm hụt bị chặn ngay tại RAM**, không chạm đĩa.

Điểm quan trọng: kích thước bloom filter **không phụ thuộc độ dài của phần tử**. Lưu URL 200 ký tự cũng chỉ tốn 9,6 bit mỗi cái.

## Nó được dùng ở đâu

| Nơi dùng | Bài toán được giải |
|---|---|
| **RocksDB / LevelDB** | Mỗi SSTable có một bloom filter → biết ngay file nào **chắc chắn không chứa** khoá cần tìm, khỏi mở file |
| **Cassandra / HBase** | Y hệt trên — bỏ qua các SSTable không liên quan |
| **PostgreSQL** (extension `bloom`) | Index bloom cho bảng nhiều cột, khi truy vấn lọc theo tổ hợp cột bất kỳ |
| **Google Safe Browsing** (Chrome) | Trình duyệt giữ bloom filter các URL độc hại; chỉ hỏi server khi bloom nói "có thể" |
| **CDN / cache** | "Nội dung này chắc chắn chưa từng được cache" → khỏi tra cache |
| **Chống trùng lặp** | Lọc sự kiện đã xử lý trong luồng dữ liệu lớn |

### Bloom index trong PostgreSQL

Trường hợp dùng cụ thể: bảng có nhiều cột, và truy vấn lọc theo **tổ hợp bất kỳ** của chúng.

```text
   BẢNG CÓ 6 CỘT, truy vấn lọc theo tổ hợp bất kỳ

   DÙNG B-TREE:  phải tạo index cho từng tổ hợp
                 → 2⁶ − 1 = 63 index
                 → không khả thi

   DÙNG BLOOM:   MỘT index duy nhất phục vụ mọi tổ hợp
```

```sql
CREATE EXTENSION IF NOT EXISTS bloom;

CREATE TABLE t (i1 INT, i2 INT, i3 INT, i4 INT, i5 INT, i6 INT);
INSERT INTO t SELECT (random()*100)::INT, (random()*100)::INT, (random()*100)::INT,
                     (random()*100)::INT, (random()*100)::INT, (random()*100)::INT
FROM generate_series(1, 5000000);

CREATE INDEX idx_bloom ON t USING bloom (i1, i2, i3, i4, i5, i6);
ANALYZE t;

EXPLAIN ANALYZE SELECT * FROM t WHERE i2 = 42 AND i5 = 17;
```

```text
Bitmap Heap Scan on t  (actual time=18.442..112.882 rows=498 loops=1)
  Recheck Cond: ((i2 = 42) AND (i5 = 17))
  Rows Removed by Index Recheck: 4218        ← đây là DƯƠNG TÍNH GIẢ
  ->  Bitmap Index Scan on idx_bloom  (actual time=17.118..17.119 rows=4716 loops=1)
        Index Cond: ((i2 = 42) AND (i5 = 17))
Execution Time: 118.226 ms
```

Dòng `Rows Removed by Index Recheck: 4218` chính là dương tính giả hiện hình: index trả về 4.716 ứng viên, kiểm tra lại thì chỉ 498 dòng đúng. Vẫn tốt hơn nhiều so với quét 5 triệu dòng.

Giới hạn của bloom index: **chỉ hỗ trợ toán tử `=`**, không hỗ trợ `<`, `>`, `BETWEEN`, `ORDER BY`.

## Ba giới hạn phải biết

| Giới hạn | Vì sao | Hệ quả |
|---|---|---|
| **Không xoá được** | Xoá một bit có thể phá nhiều phần tử khác cùng dùng bit đó | Cần xoá thì dùng *counting bloom filter* (mỗi ô là bộ đếm, tốn 4× bộ nhớ) |
| **Phải định cỡ trước** | Thêm quá số phần tử dự kiến thì tỉ lệ dương tính giả tăng vọt | Ước lượng dư 20-30%, hoặc dùng *scalable bloom filter* |
| **Không liệt kê được** | Không lấy ra được danh sách phần tử đã thêm | Chỉ dùng để **kiểm tra tồn tại**, không dùng để lưu trữ |

## Có nên tự cài bloom filter không?

Câu hỏi này đáng bàn vì nhiều người cài bloom filter ở tầng ứng dụng khi database đã có sẵn.

| Tình huống | Nên |
|---|---|
| Muốn giảm truy vấn hụt xuống database | **Cài ở tầng ứng dụng hoặc Redis** — chặn trước khi tới database mới có ý nghĩa |
| Muốn tăng tốc index nhiều cột trong PostgreSQL | **Dùng extension `bloom`** — đừng tự viết |
| Đang dùng RocksDB/Cassandra | **Đã có sẵn, chỉ cần chỉnh cấu hình** |
| Muốn chống trùng lặp trong luồng dữ liệu | **Tự cài** — không hệ nào lo giúp |

Nguyên tắc: bloom filter chỉ có giá trị khi nó nằm **trước** thứ đắt tiền mà nó đang bảo vệ. Đặt bloom filter *bên trong* database để chặn truy vấn *tới* database là vô nghĩa.

---

# Phần II — UUID trong B+Tree

## Diễn lại quá trình chèn ngẫu nhiên

Giả sử mỗi page lá chứa được **2 khoá**. Chèn lần lượt: `10, 90, 80, 45, 70, 60` (đại diện cho UUID ngẫu nhiên — vì UUID cuối cùng cũng chỉ là một con số 128 bit).

```text
   CHÈN 10:   [10, __]

   CHÈN 90:   [10, 90]                                    page đầy

   CHÈN 80:   80 phải nằm GIỮA 10 và 90 → TÁCH PAGE
              [10, 80] ⇄ [90, __]
              ↑ cấp page mới, chép dữ liệu, sửa nút cha, nối lại danh sách

   CHÈN 45:   45 nằm giữa 10 và 80 → TÁCH PAGE LẦN NỮA
              [10, 45] ⇄ [80, __] ⇄ [90, __]

   CHÈN 70:   70 nằm giữa 45 và 80 → còn chỗ ở page 2
              [10, 45] ⇄ [70, 80] ⇄ [90, __]

   CHÈN 60:   60 nằm giữa 45 và 70 → TÁCH PAGE LẦN THỨ BA
              [10, 45] ⇄ [60, 70] ⇄ [80, __] ⇄ [90, __]

   ══════════════════════════════════════════════════════
   6 lần chèn → 3 lần TÁCH PAGE
   Đụng vào 4 page khác nhau, rải rác
   Các page cuối chỉ đầy 50%
```

Bây giờ so với chèn theo thứ tự tăng dần: `10, 20, 30, 50, 70, 80`:

```text
   CHÈN 10:   [10, __]
   CHÈN 20:   [10, 20]                          page đầy
   CHÈN 30:   30 lớn hơn mọi thứ → page MỚI ở cuối, không tách
              [10, 20] ⇄ [30, __]
   CHÈN 50:   [10, 20] ⇄ [30, 50]
   CHÈN 70:   [10, 20] ⇄ [30, 50] ⇄ [70, __]
   CHÈN 80:   [10, 20] ⇄ [30, 50] ⇄ [70, 80]

   ══════════════════════════════════════════════════════
   6 lần chèn → 0 lần TÁCH PAGE
   Chỉ đụng vào 1 page (page cuối, luôn nằm trong RAM)
   Mọi page đầy 100%
```

## Ba cái giá phải trả

### Giá 1 — Tách page

Mỗi lần tách page là một chuỗi việc:

```text
   1. Đọc page hiện tại (nếu chưa trong RAM → I/O NGẪU NHIÊN)
   2. Cấp một page mới
   3. Chép một nửa số mục sang page mới
   4. Sửa nút cha để thêm con trỏ mới
   5. Nếu nút cha đầy → tách tiếp lên trên, có thể tới tận gốc
   6. Cập nhật danh sách liên kết hai chiều giữa các lá
   7. Ghi TOÀN BỘ các page bị đổi vào WAL
```

Bước 7 đặc biệt đắt vì cơ chế `full_page_writes` — lần đầu một page bị sửa sau checkpoint, **cả page 8 KB** được chép vào WAL (xem [phase-2 bài 2](../phase-2/02-atomicity-va-durability.md)).

### Giá 2 — Mất tính cục bộ trong buffer pool

```text
   KHOÁ TĂNG DẦN                       UUID NGẪU NHIÊN
   ═════════════                       ════════════════
   Mọi lần chèn đụng page CUỐI          Mỗi lần chèn đụng MỘT page ngẫu nhiên
   → page đó luôn nóng trong RAM        → trong index 20 GB, buffer pool 4 GB
   → gần như không có I/O đọc              → 80% khả năng page đó KHÔNG có trong RAM
                                           → phải ĐỌC từ đĩa trước khi ghi

   ┌───┬───┬───┬───┬███┐               ┌███┬───┬███┬───┬███┐
   └───┴───┴───┴───┴───┘               └───┴───┴───┴───┴───┘
        1 page nóng                      page nóng rải khắp nơi
```

Đây thường là cái giá **lớn nhất** trên bảng lớn, và cũng khó nhận ra nhất vì nó thể hiện thành "cache hit ratio giảm dần" chứ không thành một lỗi rõ ràng.

### Giá 3 — Phình index

Page bị tách chỉ đầy ~50%. Sau hàng triệu lần chèn ngẫu nhiên, index có thể chiếm gấp **1,5-2 lần** so với cần thiết.

## Đo trên máy bạn

```sql
CREATE TABLE t_seq  (id BIGINT PRIMARY KEY, payload TEXT);
CREATE TABLE t_uuid (id UUID   PRIMARY KEY, payload TEXT);

\timing on

INSERT INTO t_seq
SELECT i, repeat('x', 100) FROM generate_series(1, 3000000) AS i;
```

```text
Time: 9218.442 ms (00:09.218)
```

```sql
INSERT INTO t_uuid
SELECT gen_random_uuid(), repeat('x', 100) FROM generate_series(1, 3000000);
```

```text
Time: 34118.226 ms (00:34.118)
```

```sql
SELECT 'seq'  AS loai,
       pg_size_pretty(pg_relation_size('t_seq'))       AS bang,
       pg_size_pretty(pg_relation_size('t_seq_pkey'))  AS index
UNION ALL
SELECT 'uuid',
       pg_size_pretty(pg_relation_size('t_uuid')),
       pg_size_pretty(pg_relation_size('t_uuid_pkey'));
```

```text
 loai |  bang  | index
------+--------+--------
 seq  | 404 MB | 64 MB
 uuid | 442 MB | 133 MB
```

```text
   Thời gian chèn:   9,2 s  →  34,1 s     CHẬM HƠN 3,7 LẦN
   Kích thước index: 64 MB  →  133 MB     LỚN HƠN 2,1 LẦN
```

Và nhớ rằng đây là **PostgreSQL** — hệ dùng heap, nên đã nhẹ đòn. Trên MySQL InnoDB, nơi **bảng bắt buộc sắp theo primary key**, tách page xảy ra với cả dữ liệu thật chứ không chỉ với index, nên khoảng cách còn lớn hơn nhiều.

## Trường hợp Shopify

Shopify từng dùng UUID v4 làm khoá và gặp đúng vấn đề này ở quy mô lớn. Họ chuyển sang **ULID** — một định dạng có tiền tố thời gian nên **tăng dần theo thời gian**, mà vẫn giữ được tính phân tán (sinh được ở nhiều máy không cần phối hợp).

Cách đọc bài học này cho đúng:

```text
   VẤN ĐỀ KHÔNG PHẢI: "UUID xấu"
   VẤN ĐỀ THẬT LÀ  : "khoá NGẪU NHIÊN trong cấu trúc SẮP XẾP thì đắt"

   → Cần định danh phân tán? Vẫn dùng được.
   → Chỉ cần chọn loại TĂNG DẦN THEO THỜI GIAN.
```

## Bảng so sánh các loại định danh

| Loại | Cấu trúc | Tăng dần? | Lộ thông tin | Kích thước |
|---|---|---|---|---|
| `BIGSERIAL` | Số tự tăng | **Có, hoàn hảo** | Lộ quy mô kinh doanh | 8 byte |
| **UUID v1** | Thời gian + địa chỉ MAC | Một phần (thứ tự byte kỳ lạ) | **Lộ địa chỉ MAC** | 16 byte |
| **UUID v4** | Ngẫu nhiên hoàn toàn | **Không** | Không lộ gì | 16 byte |
| **UUID v7** | Timestamp ms + ngẫu nhiên | **Có** | Lộ thời điểm tạo | 16 byte |
| **ULID** | Timestamp ms + ngẫu nhiên | **Có** | Lộ thời điểm tạo | 16 byte (26 ký tự) |
| **Snowflake** | Thời gian + máy + số đếm | **Có** | Lộ thời gian + máy | 8 byte |

**UUID v7** là lựa chọn mặc định tốt nhất hiện nay khi cần định danh phân tán: chuẩn hoá chính thức (RFC 9562, 2024), tăng dần, kích thước bằng v4, và mọi thư viện lớn đều đã hỗ trợ.

```sql
-- PostgreSQL 18 có sẵn uuidv7(); bản cũ hơn dùng extension pg_uuidv7
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    ...
);
```

## Cách lưu UUID — đừng lưu bằng chuỗi

Đây là lỗi rất phổ biến và rất đắt:

| Cách lưu | Kích thước | Ghi chú |
|---|---|---|
| `CHAR(36)` / `VARCHAR(36)` | **36 byte** | Dạng chuỗi có dấu gạch — **lãng phí 20 byte mỗi giá trị** |
| `BINARY(16)` (MySQL) | 16 byte | Đúng cách cho MySQL |
| `UUID` (PostgreSQL) | 16 byte | Kiểu gốc, đúng cách |

```text
   BẢNG 50 TRIỆU DÒNG, 4 INDEX PHỤ TRÊN INNODB

   CHAR(36) :  50.000.000 × 36 × (1 + 4) = 9,0 GB dành cho riêng khoá
   BINARY(16):  50.000.000 × 16 × (1 + 4) = 4,0 GB

                                     → TIẾT KIỆM 5 GB
```

Nhớ lại từ [phase-3 bài 3](../phase-3/03-primary-key-vs-secondary-key.md): trên InnoDB, primary key bị **nhân bản vào mọi index phụ**. Nên 20 byte lãng phí không phải nhân 1 lần — nó nhân với số index phụ cộng một.

Với MySQL 8, có hàm chuyển đổi kèm sắp xếp lại byte cho UUID v1:

```sql
INSERT INTO t (id) VALUES (UUID_TO_BIN(UUID(), 1));   -- tham số 1 = đảo byte thời gian lên đầu
SELECT BIN_TO_UUID(id, 1) FROM t;
```

## Bảng quyết định chọn khoá chính

| Tình huống | Nên dùng | Vì sao |
|---|---|---|
| Ứng dụng một database, không cần khoá đoán trước | `BIGSERIAL` / `BIGINT IDENTITY` | Nhỏ nhất, nhanh nhất, không phình index |
| Cần sinh khoá ở client hoặc nhiều máy | **UUID v7** | Tăng dần + phân tán |
| Không được để lộ quy mô ra ngoài | `BIGSERIAL` nội bộ + mã công khai riêng | Tách khoá kỹ thuật khỏi mã đối ngoại |
| Đã lỡ dùng UUID v4 và đang chậm | Chuyển dần sang v7, hoặc đổi lưu trữ sang `BINARY(16)` | Giảm được phần lớn thiệt hại mà không đổi kiến trúc |
| Bảng chỉ nối thêm, cực lớn, nhiều máy sinh khoá | Snowflake | 8 byte, tăng dần, không cần phối hợp |

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Lưu UUID bằng `CHAR(36)` | Lãng phí 20 byte mỗi giá trị, nhân với mọi index phụ | `UUID` (PG) hoặc `BINARY(16)` (MySQL) |
| Dùng UUID v4 làm khoá chính trên InnoDB | Bảng sắp theo PK → tách page liên tục | UUID v7 hoặc khoá tăng dần |
| Nghĩ "UUID xấu, cấm dùng" | Vấn đề là **ngẫu nhiên**, không phải UUID | Dùng biến thể tăng dần |
| Đặt bloom filter *bên trong* database để chặn truy vấn *tới* database | Nó phải nằm **trước** thứ nó bảo vệ | Đặt ở tầng ứng dụng hoặc Redis |
| Định cỡ bloom filter sát nút | Vượt số phần tử dự kiến thì FP tăng vọt | Ước lượng dư 20-30% |
| Dùng bloom index cho `<`, `>`, `ORDER BY` | Bloom chỉ hỗ trợ `=` | Dùng B-Tree cho các toán tử đó |
| Tự cài bloom filter khi database đã có sẵn | Tốn công, dễ sai | Dùng extension `bloom`, hoặc cấu hình RocksDB |

## Tóm tắt bài 4

- **Bloom filter** trả lời *"chắc chắn không có"* (luôn đúng) hoặc *"có thể có"* (có thể sai) bằng một mảng bit và k hàm băm — **nhỏ hơn 12 lần** so với lưu đầy đủ.
- Với **9,6 bit mỗi phần tử** đạt tỉ lệ dương tính giả 1% — nghĩa là chặn được 99% lượt tìm kiếm hụt trước khi chạm đĩa.
- Ba giới hạn: **không xoá được**, **phải định cỡ trước**, **không liệt kê được**. Và nó chỉ có giá trị khi nằm **trước** thứ đắt tiền mà nó bảo vệ.
- PostgreSQL có extension `bloom` — một index duy nhất phục vụ mọi tổ hợp cột, thay vì 63 index B-Tree cho bảng 6 cột.
- **Khoá ngẫu nhiên trong cấu trúc được sắp xếp gây ba cái giá**: tách page, mất tính cục bộ trong buffer pool, và phình index.
- Đo trên PostgreSQL: UUID v4 chèn **chậm hơn 3,7 lần**, index **lớn hơn 2,1 lần** so với khoá tăng dần — và trên InnoDB còn tệ hơn vì bảng cũng sắp theo khoá.
- Bài học từ Shopify không phải "UUID xấu" mà là **"ngẫu nhiên trong cấu trúc sắp xếp thì đắt"**. Giải pháp: **UUID v7** — tăng dần, phân tán, kích thước như v4.
- Luôn lưu UUID bằng **16 byte nhị phân**, không bao giờ bằng `CHAR(36)`.

**Bài kế tiếp** → [Bài 5: Create Index Concurrently và Best Practices](05-create-index-concurrently-va-best-practices.md)

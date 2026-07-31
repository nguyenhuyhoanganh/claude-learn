# Bài 3: Chuỗi, `VARCHAR` và độ dài khoá index

Hai cột trong cùng một bảng, khác nhau đúng một con số nằm trong ngoặc. Người phỏng vấn chỉ vào con số đó rồi hỏi:

> *"`VARCHAR(50)` với `VARCHAR(255)` khác gì nhau?"*

Ngắn tới mức nghe như được tặng điểm. Và rất nhiều người trả lời xong rồi ra về tay không — vì họ dừng lại ở câu đầu tiên: *"nó là giới hạn số ký tự"*. Đúng. Nhưng đó là câu nằm sẵn trong trang đầu tài liệu, và người phỏng vấn thì đang muốn biết một thứ khác: **bạn đã tự chọn độ rộng cho một cột trên bảng thật bao giờ chưa?**

## Tầng 1: khai rộng có tốn đĩa không?

Gần như không.

`VARCHAR` là **chuỗi có độ dài thay đổi** (*variable-length character*). Nó lưu theo độ dài **thật** của dữ liệu, không theo con số bạn khai.

```text
Chuỗi "abc" lưu trong VARCHAR(50) hay VARCHAR(255):

  ┌────────┬───┬───┬───┐
  │ len=3  │ a │ b │ c │      ← 1 byte tiền tố độ dài + 3 byte dữ liệu
  └────────┴───┴───┴───┘

  Chuỗi dài quá 127 byte (Postgres) hoặc 255 byte (MySQL)
  → tiền tố nở lên 4 byte (Postgres) / 2 byte (MySQL)
```

Khai rộng hơn tốn thêm **đúng 0 byte** — trừ trường hợp chuỗi vượt ngưỡng tiền tố.

```sql
CREATE TEMP TABLE t50  (c VARCHAR(50));
CREATE TEMP TABLE t255 (c VARCHAR(255));
INSERT INTO t50  SELECT 'abc' FROM generate_series(1,1000000);
INSERT INTO t255 SELECT 'abc' FROM generate_series(1,1000000);

SELECT pg_size_pretty(pg_total_relation_size('t50'))  AS kich_thuoc_50,
       pg_size_pretty(pg_total_relation_size('t255')) AS kich_thuoc_255;
-- 35 MB | 35 MB     ← giống hệt nhau
```

Ngay cả khi có khác biệt, 10 triệu dòng tiết kiệm được khoảng 10 MB — bằng đúng một tấm ảnh chụp bằng điện thoại. **Đó là toàn bộ phần thưởng của tầng 1.**

### `CHAR(n)` thì khác hẳn — và đây là bẫy thật

`CHAR(n)` là chuỗi **độ dài cố định**: nó **đệm thêm dấu cách** cho đủ `n` ký tự.

```sql
CREATE TEMP TABLE tc (c CHAR(255));
INSERT INTO tc VALUES ('abc');
SELECT length(c), octet_length(c) FROM tc;
-- 3 | 255      ← length() bỏ dấu cách đuôi, nhưng đĩa vẫn tốn 255 byte
```

Và tệ hơn, `CHAR` có hành vi so sánh gây bất ngờ:

```sql
SELECT 'abc'::char(10) = 'abc   '::char(10);   -- true  (dấu cách đuôi bị bỏ qua)
SELECT 'abc'::text     = 'abc   '::text;       -- false
SELECT length('abc'::char(10));                 -- 3     (không phải 10!)
```

> **Luật:** đừng dùng `CHAR` trừ khi dữ liệu **thật sự** luôn đúng độ dài đó — mã tiền tệ `CHAR(3)`, mã quốc gia ISO `CHAR(2)`, mã hash cố định. Mọi trường hợp khác dùng `VARCHAR` hoặc `TEXT`.

### PostgreSQL: `TEXT` và `VARCHAR` là **cùng một thứ**

Đây là điểm khác biệt lớn giữa Postgres và MySQL, và là chỗ ghi điểm dễ:

```text
PostgreSQL, bên trong:
  TEXT, VARCHAR(n), VARCHAR   → cùng dùng kiểu varlena
  Khác biệt duy nhất: VARCHAR(n) có thêm một phép KIỂM TRA độ dài
  → TEXT nhanh hơn VARCHAR(n) một chút xíu (bỏ được phép kiểm tra)
```

Nghĩa là trong PostgreSQL, `VARCHAR(255)` **không** nhanh hơn hay gọn hơn `TEXT`. Nhiều team Postgres dùng thẳng `TEXT` cho mọi cột chuỗi, rồi đặt luật độ dài bằng `CHECK` — vì đổi `CHECK` không cần khoá bảng lâu như đổi kiểu:

```sql
-- Cách này dễ nới ra sau này hơn ALTER TYPE
CREATE TABLE customers (
    full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 200),
    email     TEXT UNIQUE   CHECK (length(email) <= 320)   -- RFC 5321
);

-- Nới lỏng sau này: chỉ cần drop + add constraint, không rewrite bảng
ALTER TABLE customers DROP CONSTRAINT customers_full_name_check;
ALTER TABLE customers ADD  CONSTRAINT customers_full_name_check
      CHECK (length(full_name) BETWEEN 1 AND 500) NOT VALID;
ALTER TABLE customers VALIDATE CONSTRAINT customers_full_name_check;  -- không khoá ghi
```

MySQL/InnoDB thì **có** phân biệt thật: `VARCHAR` lưu inline trong dòng, còn `TEXT`/`BLOB` lưu ở trang tràn (*overflow page*) khi vượt ngưỡng — nghĩa là `TEXT` có thể cần thêm một lần đọc đĩa. Trên MySQL, dùng `VARCHAR(n)` cho chuỗi ngắn là đúng.

## Tầng 2: cột đó có đánh index không?

Đây là câu hỏi đứng **trên** câu vừa rồi, và là chỗ đáp án tầng 1 chết.

**Đĩa tính theo độ dài thật. Index thì không — index tính theo độ dài bạn khai.**

```text
InnoDB, index prefix:
  Độ dài khoá index = số ký tự khai báo × số byte tối đa của 1 ký tự

  utf8mb4 (hỗ trợ emoji, tiếng Việt đầy đủ): 4 byte/ký tự
  → VARCHAR(255) ăn 255 × 4 = 1020 byte khoá index

  Trần khoá index của InnoDB:
    • Row format COMPACT / REDUNDANT  →   767 byte
    • Row format DYNAMIC / COMPRESSED → 3072 byte (MySQL 5.7+, mặc định 8.0)
```

Đây chính là lý do **Laravel từng phải hạ độ dài chuỗi mặc định xuống 191**:

```php
// AppServiceProvider.php của các dự án Laravel cũ
Schema::defaultStringLength(191);   // 191 × 4 = 764 byte < 767
```

Và đây là lỗi bạn gặp khi vượt trần:

```text
ERROR 1071 (42000): Specified key was too long; max key length is 767 bytes
```

Với index gộp (composite), giới hạn cộng dồn:

```sql
-- MySQL 8, DYNAMIC row format, utf8mb4 → trần 3072 byte
CREATE INDEX idx ON t (col_a, col_b, col_c);
-- VARCHAR(255) × 3 × 4 byte = 3060 byte  → vừa sát trần, thêm cột nữa là vỡ
```

PostgreSQL không có giới hạn cứng theo `n`, nhưng có giới hạn **theo dữ liệu thật**: một mục trong index B-tree không được vượt khoảng **2704 byte** (1/3 trang 8 KB):

```text
ERROR: index row size 3016 exceeds btree version 4 maximum 2704 for index "..."
HINT: Values larger than 1/3 of a buffer page cannot be indexed.
```

### Chiến lược khi cột dài mà vẫn cần tra cứu

| Nhu cầu | Giải pháp | Ghi chú |
|---|---|---|
| Tìm chính xác chuỗi dài (URL, path) | Index trên **hash** của cột | `CREATE INDEX ON t (md5(url))` rồi query `WHERE md5(url) = md5($1) AND url = $1` |
| MySQL: index một phần đầu chuỗi | **Prefix index** | `CREATE INDEX idx ON t (url(100))` — không dùng được cho `ORDER BY`, không covering |
| Tìm chuỗi con `%abc%` | `pg_trgm` GIN index | Xem phase-3 bài 3, anti-pattern #4 |
| Tìm theo từ | Full-text search `tsvector` | `CREATE INDEX ON t USING gin(to_tsvector('simple', noi_dung))` |
| Đảm bảo duy nhất trên chuỗi dài | `UNIQUE` trên cột hash + `CHECK` | Hoặc rút gọn độ dài thật |

```sql
-- PostgreSQL: index hash cho URL dài
ALTER TABLE pages ADD COLUMN url_hash BYTEA
    GENERATED ALWAYS AS (sha256(url::bytea)) STORED;   -- PG 12+
CREATE UNIQUE INDEX pages_url_hash_uk ON pages(url_hash);
```

## Đào sâu: collation — thứ quyết định `'a' = 'A'` đúng hay sai

**Collation** (bảng đối chiếu) là bộ luật quy định cách so sánh và sắp xếp chuỗi. Đây là nguồn bug im lặng nhất trong nhóm kiểu chuỗi.

```sql
-- MySQL, collation mặc định KHÔNG phân biệt hoa thường (_ci = case insensitive)
SELECT 'ABC' = 'abc';                                  -- 1 (true)

-- PostgreSQL, mặc định PHÂN BIỆT hoa thường
SELECT 'ABC' = 'abc';                                  -- false
```

Cùng một dòng code ứng dụng, chạy trên hai hệ, cho hai kết quả đăng nhập khác nhau. Đây là loại bug chỉ lộ ra khi công ty đổi database.

Ba hệ quả cần biết:

**① Index gắn liền với collation.** Đổi collation của cột là **vô hiệu hoá index** — phải `REINDEX`:

```sql
ALTER TABLE users ALTER COLUMN email TYPE TEXT COLLATE "C";
REINDEX TABLE users;    -- bắt buộc, nếu không index sắp xếp sai
```

**② Nâng cấp glibc có thể làm hỏng index.** Đây là sự cố thật, rất khó chẩn đoán: PostgreSQL dùng collation của hệ điều hành; nâng OS từ Debian 10 lên 11 đổi glibc, thứ tự sắp xếp thay đổi, và **index B-tree cũ trở nên sai** — query trả thiếu dòng mà không báo lỗi.

```sql
-- Kiểm tra sau mọi lần nâng cấp OS / container base image
SELECT collname, collversion, pg_collation_actual_version(oid) AS phien_ban_that
FROM pg_collation WHERE collprovider = 'c' AND collversion IS NOT NULL;
-- Lệch nhau → REINDEX DATABASE
```

Cách phòng: dùng collation `"C"` (so sánh theo byte, không đổi bao giờ) cho cột kỹ thuật như email, slug, mã; hoặc dùng ICU collation với phiên bản cố định (`PG 15+`).

**③ Muốn tìm không phân biệt hoa thường trong Postgres:**

```sql
-- Cách 1: kiểu CITEXT (extension) — sạch nhất
CREATE EXTENSION IF NOT EXISTS citext;
ALTER TABLE customers ALTER COLUMN email TYPE CITEXT;
CREATE UNIQUE INDEX ON customers (email);          -- tự động không phân biệt hoa thường

-- Cách 2: index trên biểu thức
CREATE UNIQUE INDEX customers_email_lower_uk ON customers (lower(email));
-- BẮT BUỘC query phải viết đúng dạng đó, nếu không index không được dùng:
SELECT * FROM customers WHERE lower(email) = lower($1);

-- Cách 3 (PG 12+): collation không phân biệt hoa thường, không cần đổi query
CREATE COLLATION case_insensitive (
    provider = icu, locale = 'und-u-ks-level2', deterministic = false
);
ALTER TABLE customers ALTER COLUMN email TYPE TEXT COLLATE case_insensitive;
```

> Cách 2 chính là "thủ phạm số 1 giết index" đã học ở phase-3 — nhưng đảo ngược: nếu bạn **tạo index trên biểu thức** thì query bọc hàm lại trở thành đúng. Điểm mấu chốt là **index và query phải khớp hình dạng nhau**.

## Chuẩn hoá chuỗi trước khi lưu — việc phải làm ở tầng database

Dữ liệu bẩn vào được database thì mọi báo cáo phía sau đều lệch. Ba thủ phạm kinh điển:

```sql
-- ① Khoảng trắng thừa vô hình
SELECT '  Nguyễn Văn An  ' = 'Nguyễn Văn An';   -- false
-- Chữa: btrim() khi ghi, hoặc dùng cột sinh (generated column)

-- ② Chữ hoa/thường lẫn lộn trong email
-- Chữa: lower() + UNIQUE index như trên

-- ③ Unicode có nhiều cách viết cùng một chữ (normalization)
SELECT 'é' = 'é';    -- có thể FALSE: một bên là U+00E9, bên kia là 'e' + U+0301
SELECT normalize('é', NFC) = normalize('é', NFC);   -- true (PG 13+)
```

Cột sinh (*generated column*) là cách đẹp nhất để ép chuẩn hoá ngay tại database:

```sql
CREATE TABLE customers (
    customer_id  BIGSERIAL PRIMARY KEY,
    email_raw    TEXT NOT NULL,
    email_chuan  TEXT GENERATED ALWAYS AS (lower(btrim(email_raw))) STORED,
    UNIQUE (email_chuan)
);
```

Từ giây đó, không một dòng code nào trên đời tạo được hai tài khoản `An@Gmail.com` và `an@gmail.com` nữa — kể cả script import, kể cả intern ngày đầu.

## Khi nào chọn gì — bảng quyết định

| Trường hợp | PostgreSQL | MySQL 8 |
|---|---|---|
| Tên người, địa chỉ, mô tả | `TEXT` + `CHECK length` | `VARCHAR(255)` |
| Email | `CITEXT` hoặc `TEXT` + unique index `lower()` | `VARCHAR(320)`, collation `_ci` |
| Mã cố định (ISO, currency) | `CHAR(3)` | `CHAR(3)` |
| Slug, mã tra cứu có index | `TEXT COLLATE "C"` | `VARCHAR(100)` charset `ascii` |
| Nội dung bài viết, JSON thô | `TEXT` / `JSONB` | `LONGTEXT` / `JSON` |
| URL dài cần unique | `TEXT` + unique index trên hash | `VARCHAR(2048)` + cột hash |
| Số điện thoại | `TEXT` (giữ số 0 đầu!) | `VARCHAR(20)` |
| Mã hash mật khẩu bcrypt | `CHAR(60)` | `CHAR(60)` |

> **Số điện thoại không bao giờ lưu bằng kiểu số.** `0901234567` lưu thành `INT` sẽ mất số `0` đầu, và không chứa được `+84` hay dấu cách.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `VARCHAR(255)` cho mọi cột "cho chắc" | Vỡ trần khoá index khi ghép nhiều cột | Khai sát nhu cầu **với cột có index** |
| `CHAR(n)` cho dữ liệu độ dài thay đổi | Đệm dấu cách, tốn đĩa, so sánh lạ | `VARCHAR`/`TEXT` |
| Nghĩ `TEXT` chậm hơn `VARCHAR` trong Postgres | Sai — chúng là một | Dùng `TEXT` thoải mái trên PG |
| Đổi collation mà quên `REINDEX` | Index sắp xếp sai, query thiếu dòng | Luôn `REINDEX` sau khi đổi collation |
| Nâng cấp OS/glibc không kiểm collation | Index B-tree hỏng âm thầm | Kiểm `pg_collation_actual_version` |
| Lưu email không chuẩn hoá | Hai tài khoản cùng một email | Generated column + `UNIQUE` |
| Số điện thoại lưu kiểu số | Mất số 0 đầu | Luôn dùng chuỗi |
| Index trên `lower(col)` mà query dùng `col` | Index bị bỏ qua | Query phải khớp hình dạng index |
| MySQL prefix index rồi mong `ORDER BY` dùng nó | Vẫn phải sort | Prefix index chỉ lọc, không sắp |

## Câu hỏi phỏng vấn hay gặp

**H: `VARCHAR(50)` và `VARCHAR(255)` khác gì nhau?**
Trên đĩa gần như không khác — `VARCHAR` lưu theo độ dài thật, khai rộng chỉ tốn thêm tối đa vài byte tiền tố. Khác biệt thật nằm ở **index**: InnoDB tính độ dài khoá theo con số khai báo nhân số byte tối đa của charset, nên `VARCHAR(255)` utf8mb4 ăn 1020 byte và dễ chạm trần 767 hoặc 3072 byte. Nên cột nào có index thì khai sát; cột không index thì thoải mái.

**H: `TEXT` hay `VARCHAR`?**
Trong PostgreSQL chúng là cùng một kiểu, `VARCHAR(n)` chỉ thêm một phép kiểm tra độ dài — em thường dùng `TEXT` + `CHECK`, vì nới `CHECK` không phải rewrite bảng như `ALTER TYPE`. Trong MySQL thì có khác thật: `VARCHAR` lưu inline còn `TEXT` có thể lưu ở trang tràn, nên chuỗi ngắn dùng `VARCHAR`.

**H: Vì sao Laravel đặt độ dài mặc định 191?**
Vì MySQL cũ dùng row format COMPACT với trần khoá index 767 byte, mà utf8mb4 là 4 byte/ký tự → 767 ÷ 4 = 191. MySQL 5.7+ với row format DYNAMIC nới lên 3072 byte nên giới hạn này không còn cần thiết.

**H: Cột email cần unique, không phân biệt hoa thường, làm sao?**
Ba cách: `CITEXT` extension; unique index trên `lower(email)` (nhưng query phải viết `WHERE lower(email) = lower($1)`); hoặc collation non-deterministic từ PG 12. Em thích cách generated column `lower(btrim(email))` + `UNIQUE` vì luật nằm trong dữ liệu, không phụ thuộc vào việc mọi chỗ trong code có nhớ gọi `lower()` hay không.

**H: Có bao giờ index chuỗi bị hỏng mà không báo lỗi không?**
Có — khi collation thay đổi. Postgres dùng collation của glibc, nên nâng cấp hệ điều hành có thể đổi thứ tự sắp xếp và làm index B-tree cũ trở nên sai, query trả thiếu dòng im lặng. Cách phòng: dùng collation `"C"` cho cột kỹ thuật, và kiểm `pg_collation_actual_version` sau mỗi lần nâng cấp.

## Tóm tắt bài 3

- `VARCHAR` lưu theo **độ dài thật**; khai rộng gần như không tốn đĩa. `CHAR(n)` thì đệm dấu cách — chỉ dùng cho mã cố định.
- Trong PostgreSQL, `TEXT` và `VARCHAR(n)` là **một kiểu**; trong MySQL thì khác nhau thật.
- Khác biệt quan trọng nằm ở **index**: độ dài khoá tính theo con số khai báo × byte/ký tự — trần 767 hoặc 3072 byte (InnoDB), ~2704 byte (Postgres).
- Chuỗi dài cần tra cứu → index trên hash, prefix index (MySQL), `pg_trgm`, hoặc full-text search.
- **Collation quyết định `'a' = 'A'`** và gắn liền với index — đổi collation hoặc nâng glibc mà không `REINDEX` là bug im lặng.
- Chuẩn hoá chuỗi bằng **generated column** để luật nằm trong dữ liệu, không nằm trong trí nhớ của lập trình viên.

**Bài kế tiếp** → [Bài 4: Thời gian — UTC, múi giờ và bẫy gom nhóm theo ngày](04-thoi-gian-utc-mui-gio-va-gom-nhom-theo-ngay.md)

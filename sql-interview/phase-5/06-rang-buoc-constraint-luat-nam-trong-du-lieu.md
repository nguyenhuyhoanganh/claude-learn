# Bài 6: Ràng buộc — đặt luật vào trong dữ liệu, không vào trong trí nhớ

23h47, đêm 11 tháng 11. Một shop áo thun trên sàn. Trên màn hình là file `kho_final_v7_that.xlsx` — cái file mà cả công ty gọi là "kho hàng".

Hai bạn kho cùng mở nó lên, cách nhau ba giây. Cả hai đều thấy: áo trắng còn 40 chiếc. Cả hai cùng trừ đi phần mình vừa bán. Cả hai cùng bấm lưu.

Tháng sau chốt sổ: hệ thống đã bán **300 đơn** áo trắng. Trong kho có **40 chiếc**. 260 khách vừa mua một cái áo không tồn tại.

Excel không làm sai. Nó làm đúng thứ nó được sinh ra để làm. Thứ shop đó thiếu không phải một cái bảng đẹp hơn — mà là **một người gác cửa**.

Sự khác biệt cốt lõi giữa Excel và database gói gọn trong một câu:

> **Trong Excel, luật nằm trong đầu người nhập liệu. Trong database, luật nằm trong chính dữ liệu.**

Người nghỉ việc thì mang cái đầu đi. Database thì ở lại, và nó không quên. Không bao giờ.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Constraint** | con-strên | **Ràng buộc** — luật database tự thi hành, không ai lách được |
| **`NOT NULL`** | | Bắt buộc phải có giá trị, không được để trống |
| **`CHECK`** | chéc | Ràng buộc **điều kiện** — giá trị phải thoả biểu thức |
| **`UNIQUE`** | iu-nịc | **Không được trùng** |
| **`FOREIGN KEY`** | pho-rin ki | **Khoá ngoại** — phải tồn tại ở bảng kia |
| **`EXCLUDE`** | éch-clut | Ràng buộc chặn hai bản ghi **chồng lấn** nhau (chỉ PostgreSQL) |
| **Invariant** | in-vê-ri-ần | **Bất biến** — quy tắc luôn phải đúng, không có ngoại lệ |
| **Partial index** | pa-sồ | **Index một phần** — chỉ đánh trên tập dòng thoả điều kiện |
| **`NOT VALID`** | | Chế độ thêm ràng buộc **chỉ áp cho dữ liệu mới**, chưa quét dữ liệu cũ |
| **`DEFERRABLE`** | đi-phơ-ra-bồ | **Hoãn được** — kiểm tra tới lúc `COMMIT` thay vì ngay lập tức |
| **Cascade** | cát-kêit | **Dây chuyền** — xoá cha thì xoá luôn con |

## Năm loại ràng buộc và việc chúng chặn

| Ràng buộc | Chặn điều gì | Chi phí |
|---|---|---|
| `NOT NULL` | Ô để trống | Gần như không |
| `CHECK` | Giá trị vô lý (tồn kho âm, email không có `@`) | Rất rẻ, chạy mỗi lần ghi |
| `UNIQUE` | Trùng lặp | Tạo index — tốn đĩa + làm chậm ghi |
| `PRIMARY KEY` | `NOT NULL` + `UNIQUE`, và là định danh | Như `UNIQUE` |
| `FOREIGN KEY` | Trỏ tới bản ghi không tồn tại | Cần index ở cả hai phía |
| `EXCLUDE` (PG) | Hai bản ghi *chồng lấn* nhau | Cần GiST index |

Nguyên tắc chọn nơi đặt luật:

```text
Luật ở tầng ứng dụng   → mỗi service phải tự nhớ. Thêm service = thêm chỗ quên.
                          Import thủ công, script migration, intern chạy tay
                          đều đi vòng qua nó được.

Luật ở tầng database   → không một dòng lệnh nào trên đời phá được.
                          Kể cả bạn. Kể cả lúc 3 giờ sáng.
```

Đặt cả hai. Ứng dụng kiểm tra để báo lỗi đẹp cho người dùng; database kiểm tra để **đảm bảo**.

## `NOT NULL` — mặc định nên là bắt buộc, không phải tuỳ chọn

```sql
-- ❌ Cột nào cũng cho NULL "cho linh hoạt"
CREATE TABLE orders (
    order_id     BIGSERIAL PRIMARY KEY,
    customer_id  BIGINT,
    status       TEXT,
    total_amount NUMERIC(14,2)
);
-- Hệ quả: sum(total_amount) bỏ qua NULL → doanh thu thiếu ÂM THẦM
--         status IS NULL nghĩa là gì? Không ai biết.

-- ✅ Bắt buộc là mặc định, cho NULL chỉ khi NULL có NGHĨA
CREATE TABLE orders (
    order_id     BIGSERIAL PRIMARY KEY,
    customer_id  BIGINT         NOT NULL REFERENCES customers(customer_id),
    status       TEXT           NOT NULL,
    total_amount NUMERIC(14,2)  NOT NULL DEFAULT 0,
    cancelled_at TIMESTAMPTZ              -- cho NULL vì "chưa huỷ" là trạng thái thật
);
```

**Câu hỏi để tự quyết:** *"`NULL` ở cột này nghĩa là gì?"* Nếu trả lời được ("chưa huỷ", "chưa xếp phòng ban", "khách không khai số điện thoại") thì cho `NULL`. Nếu không trả lời được thì đặt `NOT NULL`.

Thêm `NOT NULL` vào bảng lớn đang chạy sẽ **quét toàn bảng và khoá ghi**. Cách làm không downtime (PG 12+):

```sql
-- 1. Thêm CHECK tương đương ở chế độ NOT VALID — nhanh, không quét bảng cũ
ALTER TABLE orders ADD CONSTRAINT orders_status_nn CHECK (status IS NOT NULL) NOT VALID;
-- Từ giây này, mọi dòng MỚI đều bị chặn

-- 2. Dọn dữ liệu cũ theo lô
UPDATE orders SET status = 'unknown' WHERE status IS NULL AND order_id BETWEEN 1 AND 10000;

-- 3. Validate — chỉ khoá đọc-ghi ở mức nhẹ (SHARE UPDATE EXCLUSIVE)
ALTER TABLE orders VALIDATE CONSTRAINT orders_status_nn;

-- 4. PG 12+ nhận ra CHECK đã valid nên SET NOT NULL không cần quét lại
ALTER TABLE orders ALTER COLUMN status SET NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_status_nn;
```

## `CHECK` — nơi bạn viết luật nghiệp vụ vào bảng

```sql
CREATE TABLE products (
    product_id BIGSERIAL PRIMARY KEY,
    sku        TEXT           NOT NULL UNIQUE,
    price      NUMERIC(12,2)  NOT NULL CHECK (price >= 0),
    ton_kho    INT            NOT NULL CHECK (ton_kho >= 0),
    category   TEXT           NOT NULL CHECK (category IN ('ao','quan','giay','phu_kien')),
    discount   NUMERIC(4,3)            CHECK (discount BETWEEN 0 AND 1)
);
```

Dòng `CHECK (ton_kho >= 0)` là dòng đắt giá nhất trong cả bảng. Từ giây đó trở đi, **không một câu lệnh nào trên đời làm tồn kho âm được nữa** — kể cả bạn, kể cả bạn intern ngày đầu, kể cả script import của đối tác.

Ràng buộc liên cột — thứ ứng dụng rất hay quên:

```sql
ALTER TABLE bookings ADD CONSTRAINT ck_thoi_gian
    CHECK (ket_thuc > bat_dau);

ALTER TABLE orders ADD CONSTRAINT ck_huy_hop_le
    CHECK (
        (status = 'cancelled' AND cancelled_at IS NOT NULL) OR
        (status <> 'cancelled' AND cancelled_at IS NULL)
    );
```

Ràng buộc thứ hai đọc là: *"đơn huỷ thì phải có thời điểm huỷ; đơn chưa huỷ thì không được có."* Đây là loại bất biến (*invariant*) mà code sẽ vi phạm sau vài lần refactor, còn database thì không.

### Bẫy lớn nhất của `CHECK`: nó bỏ qua `NULL`

```sql
ALTER TABLE products ADD CHECK (price >= 0);
INSERT INTO products (price) VALUES (NULL);   -- ✅ CHẤP NHẬN!
```

Vì `NULL >= 0` cho ra `UNKNOWN`, mà `CHECK` chỉ từ chối khi kết quả là `FALSE`. **`UNKNOWN` được coi như đạt.** Đây là logic ba trị đã học ở phase-2 bài 3, xuất hiện lại ở chỗ ít ai ngờ.

Cách chữa: luôn ghép `NOT NULL` với `CHECK`, hoặc viết rõ trong `CHECK`.

Hai giới hạn khác cần biết:
- `CHECK` **phải immutable** — không được dùng `now()`, không được truy vấn bảng khác. Muốn kiểm tra liên bảng, dùng trigger hoặc khoá ngoại.
- MySQL chỉ **thực sự** thi hành `CHECK` từ phiên bản **8.0.16**. Trước đó nó phân tích cú pháp rồi bỏ qua im lặng — một cái bẫy đắt tiền cho các hệ cũ.

## `UNIQUE` và bài toán soft delete

Ràng buộc `UNIQUE` có một hành vi rất hay gây bất ngờ:

```sql
CREATE TABLE users (email TEXT UNIQUE);
INSERT INTO users VALUES (NULL);
INSERT INTO users VALUES (NULL);   -- ✅ ĐƯỢC! Hai NULL không "bằng nhau"
```

Đây là hệ quả trực tiếp của logic ba trị: `NULL = NULL` cho ra `UNKNOWN`, nên chuẩn SQL coi hai `NULL` là khác nhau. PG 15+ cho phép đảo lại hành vi này:

```sql
CREATE TABLE users (email TEXT UNIQUE NULLS NOT DISTINCT);   -- chỉ cho phép một NULL
```

Đây chính là chỗ **soft delete gãy** — bài toán bạn sẽ gặp lại chi tiết ở phase-6:

```sql
CREATE TABLE users (
    user_id    BIGSERIAL PRIMARY KEY,
    email      TEXT NOT NULL,
    deleted_at TIMESTAMPTZ,
    UNIQUE (email)                -- ❌ khách xoá tài khoản rồi đăng ký lại → bị chặn
);

-- Sửa sai: ghép deleted_at vào constraint
UNIQUE (email, deleted_at)        -- ❌ VẪN SAI!
-- Hai dòng CÒN SỐNG cùng email, deleted_at đều NULL
-- → hai NULL được coi là khác nhau → constraint cho qua
-- → hai tài khoản chung một email

-- ✅ ĐÚNG: partial unique index — chỉ ràng buộc trên dòng còn sống
CREATE UNIQUE INDEX users_email_alive_uk
    ON users (email) WHERE deleted_at IS NULL;
```

**Partial index** (index một phần) là công cụ rất mạnh và ít được dùng đúng mức:

```sql
-- Mỗi khách chỉ có một địa chỉ mặc định
CREATE UNIQUE INDEX addr_default_uk
    ON addresses (customer_id) WHERE is_default;

-- Mỗi sản phẩm chỉ có một chiến dịch giảm giá đang chạy
CREATE UNIQUE INDEX promo_active_uk
    ON promotions (product_id) WHERE status = 'active';
```

## `FOREIGN KEY` — và ba chi phí ít ai nhắc

```sql
CREATE TABLE orders (
    customer_id BIGINT NOT NULL
        REFERENCES customers(customer_id)
        ON DELETE RESTRICT      -- chặn xoá khách nếu còn đơn
        ON UPDATE CASCADE
);
```

Các hành vi `ON DELETE`:

| Hành vi | Nghĩa | Dùng khi |
|---|---|---|
| `RESTRICT` / `NO ACTION` | Chặn xoá bản ghi cha | **Mặc định nên chọn** — dữ liệu nghiệp vụ |
| `CASCADE` | Xoá cha thì xoá luôn con | Quan hệ sở hữu chặt (đơn hàng → dòng đơn hàng) |
| `SET NULL` | Đặt khoá ngoại về `NULL` | Quan hệ lỏng (nhân viên → phòng ban đã giải thể) |
| `SET DEFAULT` | Đặt về giá trị mặc định | Hiếm dùng |

> `CASCADE` rất nguy hiểm khi dùng nhầm chỗ: xoá một khách hàng có thể kéo theo hàng nghìn đơn hàng, và bạn không thấy con số đó trước khi bấm Enter. Mặc định nên là `RESTRICT`, và chỉ dùng `CASCADE` cho quan hệ mà bản ghi con **không có ý nghĩa** khi thiếu cha.

**Ba chi phí của khoá ngoại:**

**① Bắt buộc phải có index ở phía con.** Database **không** tự tạo index cho cột khoá ngoại (chỉ tự tạo cho phía cha). Thiếu nó, mỗi lần xoá/cập nhật bản ghi cha là một lần **quét toàn bảng con**:

```sql
-- Tìm mọi khoá ngoại chưa có index — chạy câu này trên database của bạn ngay
SELECT c.conrelid::regclass AS bang_con, a.attname AS cot_thieu_index
FROM pg_constraint c
JOIN pg_attribute  a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = c.conrelid AND a.attnum = i.indkey[0]
  );
```

**② Khoá ngoại lấy khoá trên bảng cha.** Mỗi `INSERT` vào bảng con phải kiểm tra bản ghi cha tồn tại, và giữ một khoá nhẹ trên đó. Trên bảng cha bị tham chiếu bởi nhiều bảng con, đây là nguồn tranh chấp và deadlock đáng kể.

**③ Thứ tự nạp dữ liệu bị ràng buộc.** Import phải theo đúng thứ tự cha trước con. Với các job nạp lớn, cách làm là tạm vô hiệu hoá:

```sql
ALTER TABLE orders DROP CONSTRAINT orders_customer_id_fkey;
-- nạp dữ liệu
ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(customer_id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_customer_id_fkey;  -- khoá nhẹ
```

Vì ba chi phí này, nhiều hệ thống quy mô rất lớn (đặc biệt sau khi sharding) **bỏ khoá ngoại** và chuyển việc kiểm tra sang tầng ứng dụng cộng với job đối soát định kỳ. Đó là một đánh đổi có ý thức, không phải sự lười biếng — nhưng chỉ nên làm khi bạn đã đo được vấn đề.

## `EXCLUDE` — ràng buộc mà chỉ PostgreSQL có

Bài toán: một phòng khách sạn không được có hai lượt đặt **chồng lấn thời gian**. `UNIQUE` không giải được vì không có hai giá trị nào bằng nhau — chúng chỉ *giao nhau*.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE bookings (
    booking_id BIGSERIAL PRIMARY KEY,
    room_id    BIGINT      NOT NULL,
    khoang     TSTZRANGE   NOT NULL,
    EXCLUDE USING gist (
        room_id WITH =,          -- cùng phòng
        khoang  WITH &&          -- VÀ khoảng thời gian giao nhau
    )
);

INSERT INTO bookings (room_id, khoang)
VALUES (101, '[2026-08-01 14:00, 2026-08-03 12:00)');   -- ✅

INSERT INTO bookings (room_id, khoang)
VALUES (101, '[2026-08-02 14:00, 2026-08-05 12:00)');
-- ERROR: conflicting key value violates exclusion constraint
```

Một dòng khai báo thay thế toàn bộ đoạn code kiểm tra chồng lấn ở tầng ứng dụng — đoạn code vốn **luôn** có race condition (xem lại phase-4 bài 3, bài toán double booking). Đây là giải pháp đúng đắn nhất cho lớp bài toán đặt chỗ, và nói được nó trong phỏng vấn là điểm cộng lớn.

## `DEFERRABLE` — hoãn kiểm tra tới lúc commit

Bài toán vòng tròn: nhân viên `A` là quản lý của `B`, `B` là quản lý của `A`. Chèn dòng nào trước cũng vi phạm khoá ngoại.

```sql
ALTER TABLE employees
    ADD CONSTRAINT emp_mgr_fk FOREIGN KEY (manager_id) REFERENCES employees(emp_id)
    DEFERRABLE INITIALLY IMMEDIATE;

BEGIN;
SET CONSTRAINTS emp_mgr_fk DEFERRED;   -- hoãn kiểm tra tới COMMIT
INSERT INTO employees (emp_id, full_name, manager_id) VALUES (1, 'A', 2);
INSERT INTO employees (emp_id, full_name, manager_id) VALUES (2, 'B', 1);
COMMIT;   -- kiểm tra ở đây, cả hai đều hợp lệ
```

Cũng dùng được cho `UNIQUE` khi cần hoán đổi giá trị:

```sql
-- Đổi thứ tự hai mục trong danh sách có UNIQUE(vi_tri)
BEGIN;
SET CONSTRAINTS items_vitri_uk DEFERRED;
UPDATE items SET vi_tri = 2 WHERE id = 1;
UPDATE items SET vi_tri = 1 WHERE id = 2;
COMMIT;
```

## Đọc lỗi ràng buộc và trả về thông báo tử tế

Ràng buộc chỉ hữu ích nếu ứng dụng dịch được lỗi thành câu người dùng hiểu. Đặt **tên** cho mọi constraint (đừng để database tự sinh) và bắt theo tên:

```sql
ALTER TABLE products ADD CONSTRAINT ck_ton_kho_khong_am CHECK (ton_kho >= 0);
```

```python
import psycopg
from psycopg import errors

THONG_BAO = {
    "ck_ton_kho_khong_am": "Số lượng tồn kho không được nhỏ hơn 0.",
    "users_email_alive_uk": "Email này đã được đăng ký.",
    "orders_customer_id_fkey": "Khách hàng không tồn tại.",
}

try:
    cur.execute(sql, params)
except (errors.CheckViolation, errors.UniqueViolation,
        errors.ForeignKeyViolation) as e:
    ten = e.diag.constraint_name
    raise LoiNghiepVu(THONG_BAO.get(ten, "Dữ liệu không hợp lệ.")) from e
```

Đây là mẫu thiết kế quan trọng: **để database là nguồn chân lý duy nhất về tính hợp lệ**, còn ứng dụng chỉ dịch lỗi. Không có chuyện hai nơi cùng giữ luật rồi lệch nhau.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Tồn kho có 47 sản phẩm đang **âm**. Không ai biết từ bao giờ, và code đã kiểm `if ton_kho > 0` ở mọi chỗ.

**Chẩn đoán:** đếm thiệt hại trước, rồi tìm đường vào.

```sql
-- ① Bao nhiêu dòng đang sai, sai từ khi nào?
SELECT count(*), min(updated_at), max(updated_at)
FROM products WHERE ton_kho < 0;

-- ② Có ràng buộc nào không?
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint WHERE conrelid = 'products'::regclass;
-- Chỉ có primary key → KHÔNG CÓ CHECK NÀO
```

**Ba đường vào mà code không chặn được:**

```text
   ① Race condition giữa lúc kiểm và lúc ghi (xem phase-8 bài 1)
   ② Script import của đối tác — nó không đi qua code của bạn
   ③ Lệnh chạy tay lúc 3 giờ sáng để "sửa nhanh"
```

**Cách xử lý — 4 bước, không được đảo thứ tự:**

```sql
-- ① DỌN DỮ LIỆU CŨ TRƯỚC (nếu không, bước ③ sẽ thất bại)
UPDATE products SET ton_kho = 0 WHERE ton_kho < 0;

-- ② Thêm ràng buộc ở chế độ NOT VALID — chặn NGAY dòng mới, chưa quét dòng cũ
ALTER TABLE products
  ADD CONSTRAINT ck_ton_kho_khong_am CHECK (ton_kho >= 0) NOT VALID;

-- ③ Validate — chỉ khoá nhẹ, không chặn đọc-ghi
ALTER TABLE products VALIDATE CONSTRAINT ck_ton_kho_khong_am;

-- ④ Sửa luôn chỗ gốc: ghi nguyên tử thay vì đọc-kiểm-ghi
UPDATE products SET ton_kho = ton_kho - 1
WHERE product_id = $1 AND ton_kho >= 1 RETURNING ton_kho;
```

> Từ giây bước ② chạy xong, **không một câu lệnh nào trên đời làm tồn kho âm được nữa** — kể cả script đối tác, kể cả lệnh chạy tay.

> **Tình huống 2:** Khách xoá tài khoản, tháng sau đăng ký lại bằng email cũ và bị báo **"Email đã tồn tại"**. Nhưng bộ phận hỗ trợ tìm cả buổi không thấy tài khoản nào mang email đó.

**Chẩn đoán:**

```sql
-- Tìm bằng câu lệnh KHÔNG lọc deleted_at
SELECT user_id, email, deleted_at FROM users WHERE email = 'an@gmail.com';
--  42 | an@gmail.com | 2026-06-15 10:22:00+07     ◄── ĐÂY, dòng đã xoá mềm
```

**Nguyên nhân:** `UNIQUE (email)` **không biết đọc** điều kiện lọc của ứng dụng. Nó nhìn thấy cả dòng đã xoá mềm, và nó chặn.

**Và đây là cái bẫy:** cách chữa ai cũng nghĩ ra đầu tiên lại **thủng ngay**.

```sql
-- ❌ Nghe hợp lý nhưng SAI
ALTER TABLE users ADD CONSTRAINT uq_email UNIQUE (email, deleted_at);
```

```sql
-- Chứng minh nó thủng:
INSERT INTO users (email, deleted_at) VALUES ('x@y.com', NULL);
INSERT INTO users (email, deleted_at) VALUES ('x@y.com', NULL);   -- ✅ LỌT!
-- Vì NULL <> NULL → ràng buộc coi hai dòng là KHÁC NHAU
-- → giờ có HAI tài khoản sống chung một email
```

**Cách đúng — partial unique index:**

```sql
ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_email;

CREATE UNIQUE INDEX users_email_alive_uk
    ON users (email) WHERE deleted_at IS NULL;   -- ◄── CHỈ ràng buộc dòng còn sống
```

```sql
-- Kiểm chứng: hai dòng đã xoá cùng email → OK; hai dòng sống cùng email → CHẶN
INSERT INTO users (email, deleted_at) VALUES ('x@y.com', now());   -- ✅
INSERT INTO users (email, deleted_at) VALUES ('x@y.com', now());   -- ✅ (đều đã xoá)
INSERT INTO users (email, deleted_at) VALUES ('x@y.com', NULL);    -- ✅
INSERT INTO users (email, deleted_at) VALUES ('x@y.com', NULL);    -- ❌ CHẶN ĐÚNG
```

> MySQL không có partial index — thay bằng cột sinh: `email_alive = IF(deleted_at IS NULL, email, NULL)` rồi `UNIQUE (email_alive)`.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `CHECK` mà cột cho phép `NULL` | `NULL` lọt qua vì `UNKNOWN` không phải `FALSE` | Ghép `NOT NULL` |
| `UNIQUE(email, deleted_at)` cho soft delete | Hai `NULL` khác nhau → trùng email | Partial unique index `WHERE deleted_at IS NULL` |
| Khoá ngoại không có index ở phía con | Xoá cha = quét toàn bảng con | Luôn tạo index cho cột FK |
| `ON DELETE CASCADE` mặc định | Xoá một dòng kéo theo hàng nghìn dòng | Mặc định `RESTRICT` |
| MySQL < 8.0.16 tin vào `CHECK` | Ràng buộc bị bỏ qua **im lặng** | Kiểm phiên bản; hoặc dùng trigger |
| Thêm `NOT NULL`/`CHECK` thẳng trên bảng lớn | Quét toàn bảng + khoá ghi | `NOT VALID` → backfill → `VALIDATE` |
| Constraint không đặt tên | Không dịch được lỗi cho người dùng | Luôn `ADD CONSTRAINT ten_ro_rang` |
| Chỉ kiểm tra ở tầng ứng dụng | Import/script/service mới đi vòng qua được | Đặt ở cả hai tầng |
| Dùng ứng dụng để chống chồng lấn thời gian | Luôn có race condition | `EXCLUDE USING gist` |
| Nhiều `CHECK` phức tạp trên bảng ghi cực nhiều | Chi phí mỗi lần ghi | Đo; cân nhắc kiểm ở tầng nạp dữ liệu |

## Câu hỏi phỏng vấn hay gặp

**H: Nên đặt luật ở tầng ứng dụng hay database?**
Cả hai, nhưng với vai trò khác nhau. Ứng dụng kiểm tra để **báo lỗi đẹp** cho người dùng; database kiểm tra để **đảm bảo**. Lý do: mọi script import, mọi migration, mọi service mới, mọi lệnh chạy tay đều đi vòng qua tầng ứng dụng được — nhưng không đi vòng qua database được.

**H: Vì sao `CHECK (price >= 0)` vẫn cho chèn `NULL`?**
Vì `NULL >= 0` trả về `UNKNOWN`, và `CHECK` chỉ từ chối khi kết quả là `FALSE`. `UNKNOWN` được coi như đạt. Phải ghép thêm `NOT NULL`.

**H: Có nên dùng khoá ngoại trong hệ thống lớn không?**
Có, cho tới khi đo được rằng nó là nút thắt. Ba chi phí: cột FK phải tự tạo index; mỗi `INSERT` con lấy khoá trên bảng cha, dễ tranh chấp; và thứ tự nạp dữ liệu bị ràng buộc. Sau khi shard thì khoá ngoại xuyên shard không thi hành được, nên nhiều hệ thống bỏ FK và chuyển sang job đối soát định kỳ — đó là đánh đổi có ý thức, không phải mặc định.

**H: Soft delete làm hỏng `UNIQUE` thế nào?**
Khách xoá tài khoản rồi đăng ký lại bằng email cũ sẽ bị chặn, vì `UNIQUE` nhìn thấy cả dòng đã xoá. Ghép `deleted_at` vào constraint cũng không cứu được, vì hai dòng còn sống đều có `deleted_at = NULL` mà hai `NULL` được coi là khác nhau. Cách đúng là **partial unique index** chỉ ràng buộc trên dòng còn sống.

**H: Làm sao chặn hai lượt đặt phòng chồng lấn thời gian?**
`UNIQUE` không giải được vì không có giá trị nào bằng nhau, chúng chỉ giao nhau. Trong PostgreSQL dùng `EXCLUDE USING gist (room_id WITH =, khoang WITH &&)`. Một dòng khai báo thay cho toàn bộ đoạn kiểm tra ở tầng ứng dụng — đoạn code vốn luôn có race condition giữa lúc đọc và lúc ghi.

## Tóm tắt bài 6

- **Luật nằm trong dữ liệu, không nằm trong trí nhớ** — người nghỉ việc mang cái đầu đi, database thì ở lại.
- `NOT NULL` nên là mặc định; chỉ cho `NULL` khi trả lời được câu *"`NULL` ở đây nghĩa là gì?"*.
- `CHECK` bỏ qua `NULL` vì `UNKNOWN` không phải `FALSE` — luôn ghép với `NOT NULL`. MySQL chỉ thi hành `CHECK` từ 8.0.16.
- `UNIQUE` coi hai `NULL` là khác nhau → dùng **partial unique index** cho soft delete và cho "chỉ một dòng mặc định".
- Khoá ngoại **không tự tạo index ở phía con** — thiếu nó, xoá bản ghi cha là quét toàn bảng con.
- `EXCLUDE USING gist` giải sạch bài toán chồng lấn thời gian; `DEFERRABLE` giải bài toán tham chiếu vòng và hoán đổi giá trị.
- Thêm ràng buộc trên bảng lớn: `NOT VALID` → backfill theo lô → `VALIDATE`. Luôn **đặt tên** constraint để dịch được lỗi.

**Bài kế tiếp** → [Bài 7: Email và nghệ thuật chuẩn hoá dữ liệu trước khi so trùng](07-email-va-chuan-hoa-du-lieu-truoc-khi-so-trung.md)

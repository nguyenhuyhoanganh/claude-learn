# Bài 7: Email và nghệ thuật chuẩn hoá dữ liệu trước khi so trùng

Hai dòng trong bảng người dùng, và chúng là **cùng một con người**:

```text
 id   | email          | created_at
------+----------------+---------------------
 4821 | An@shop.vn     | 2026-03-14 09:22:11
 9137 | an@shop.vn     | 2026-07-02 16:40:03
```

Bạn đã hạ chữ thường ở tầng ứng dụng. Bạn đã đặt `UNIQUE` trên cột `email` từ ngày đầu tiên. Không có dòng nào bị lỗi, không có cảnh báo nào.

Vậy hai dòng này chui vào bảng bằng đường nào?

Đây là câu hỏi phỏng vấn nghe như dành cho người mới — *"email nên lưu nguyên hay hạ hết về chữ thường?"* — và gần như ai cũng trả lời xong trong ba giây rồi dừng lại đúng ở chỗ mà người phỏng vấn mới bắt đầu đào.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Normalization** (dữ liệu) | noọc-ma-lai-dây-sần | **Chuẩn hoá** — đưa nhiều cách viết về **một dạng duy nhất** để so sánh |
| **Canonical form** | ca-nô-ni-cần | **Dạng chuẩn tắc** — bản đại diện duy nhất của một giá trị |
| **Local-part** | lô-cần pát | **Phần trước dấu `@`** trong địa chỉ email |
| **Domain part** | đô-mêin | **Phần sau dấu `@`** — tên miền |
| **RFC 5321** | a-rờ-ép-xi | **Chuẩn quốc tế** định nghĩa giao thức gửi thư (SMTP) |
| **Case-sensitive** | kêis | **Phân biệt hoa thường** — `A` khác `a` |
| **Case-insensitive** | | **Không phân biệt hoa thường** — `A` bằng `a` |
| **`citext`** | si-tếch | Kiểu chuỗi **không phân biệt hoa thường** của PostgreSQL |
| **Collation** | cồ-lây-sần | **Luật so sánh và sắp xếp** chuỗi của database |
| **Generated column** | | **Cột sinh** — cột do database tự tính từ cột khác |
| **Functional index** | | **Chỉ mục trên biểu thức** — `CREATE INDEX ... ON t (lower(x))` |
| **Bulk import** | bấch | **Nhập hàng loạt** — nạp dữ liệu thẳng vào bảng, không qua ứng dụng |
| **Homoglyph** | hô-mô-gláp | **Ký tự nhìn giống nhau** nhưng khác mã (chữ `а` Cyrillic vs `a` Latin) |
| **Unicode NFC/NFKC** | | **Dạng chuẩn Unicode** — gộp các cách mã hoá khác nhau của cùng một chữ |
| **Plus addressing** | | **Địa chỉ có dấu cộng** — `an+shopee@gmail.com` vẫn về hộp thư `an@gmail.com` |

## Tầng 1 — câu trả lời ai cũng biết, và vì sao nó chưa đủ

```sql
-- Cách gần như mọi dự án đang làm
email = lower(email);              -- hạ chữ ở tầng ứng dụng
-- rồi:
CREATE TABLE users (
    email TEXT UNIQUE NOT NULL
);
```

Câu này **đúng**. Tài liệu nào cũng khuyên như vậy. Nhưng nó đặt toàn bộ niềm tin vào một giả định: **mọi dữ liệu vào bảng đều đi qua hàm `lower()` của bạn.**

Giả định đó sai.

```text
   BỐN CỬA SAU KHÔNG ĐI QUA TẦNG ỨNG DỤNG CỦA BẠN:

   ┌─────────────────────────────────────────────────────────────┐
   │                                                              │
   │   Ứng dụng web  ──► lower() ──┐                              │
   │                                │                             │
   │   ① Nhập hàng loạt (CSV)  ─────┤                             │
   │   ② Trang quản trị cũ     ─────┼──►  ┌──────────────┐       │
   │   ③ Dịch vụ khác ghi thẳng ────┤     │  BẢNG users  │       │
   │   ④ Script sửa dữ liệu    ─────┘     └──────────────┘       │
   │      (chạy tay lúc 2 giờ sáng)                               │
   │                                                              │
   └─────────────────────────────────────────────────────────────┘

   VÀ RÀNG BUỘC UNIQUE KHÔNG KÊU LẤY MỘT TIẾNG.

   Vì với database, 'An@shop.vn' và 'an@shop.vn' là HAI CHUỖI
   KHÁC NHAU HOÀN TOÀN. Nó đang làm đúng việc của nó.
```

**Bài học cốt lõi:** *ràng buộc phải nằm ở nơi dữ liệu đi qua, không phải ở nơi bạn hy vọng dữ liệu đi qua.* Tầng ứng dụng có thể bị vòng qua; database thì không.

## Tầng 2 — ba cách ép chuẩn hoá ở tầng database

### Cách ① — cột chuẩn hoá riêng (khuyến nghị)

```sql
ALTER TABLE users ADD COLUMN email_normalized TEXT;

UPDATE users SET email_normalized = lower(btrim(email));

ALTER TABLE users
    ALTER COLUMN email_normalized SET NOT NULL,
    ADD CONSTRAINT uq_users_email_norm UNIQUE (email_normalized);
```

Tốt hơn nữa: để **database tự tính**, người viết code không thể quên:

```sql
-- PostgreSQL 12+ / MySQL 5.7+ — cột sinh, không ai ghi tay được
ALTER TABLE users
    ADD COLUMN email_normalized TEXT
    GENERATED ALWAYS AS (lower(btrim(email))) STORED;

CREATE UNIQUE INDEX uq_users_email_norm ON users (email_normalized);
```

```text
   VÌ SAO CÁCH NÀY THẮNG:

   · Bulk import cũng bị ép chuẩn hoá — cột sinh chạy ở tầng lưu trữ
   · Không ai "quên gọi hàm" được, vì không có hàm nào để gọi
   · GIỮ NGUYÊN cột `email` gốc → vẫn gửi thư đúng cách người dùng viết
   · Đọc lên là hiểu ngay: cột nào để so, cột nào để gửi
```

### Cách ② — chỉ mục trên biểu thức

```sql
CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(btrim(email)));
```

```text
   ✅ Không cần thêm cột, không cần migration dữ liệu
   ❌ Mọi truy vấn tra cứu PHẢI viết đúng biểu thức mới dùng được index:
        SELECT * FROM users WHERE lower(btrim(email)) = lower(btrim(:input));
      Viết thiếu btrim() → KHÔNG dùng index → quét cả bảng
   ❌ Người mới rất dễ viết sai, và sai thì im lặng (chỉ chậm, không lỗi)
```

### Cách ③ — kiểu `citext` của PostgreSQL

```sql
CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE users ALTER COLUMN email TYPE citext;
-- Từ đây: 'An@shop.vn' = 'an@shop.vn' → TRUE, và UNIQUE tự hiểu như vậy
```

```text
   ✅ Trong suốt — mọi so sánh tự động không phân biệt hoa thường
   ✅ Giữ nguyên cách viết gốc của người dùng
   ❌ Không xử lý khoảng trắng thừa, không xử lý dấu chấm của Gmail
   ❌ Chỉ có ở PostgreSQL — chuyển sang database khác là hỏng
   ❌ citext dùng lower() theo collation của database
      → nâng cấp hệ điều hành đổi luật collation có thể làm
        INDEX SAI LỆCH (xem lại phase-5 bài 3)
```

| | Cột sinh + `UNIQUE` | Index trên biểu thức | `citext` |
|---|---|---|---|
| Chặn được cửa sau | ✅ | ✅ | ✅ |
| Giữ bản gốc để gửi thư | ✅ | ✅ | ✅ |
| Truy vấn dễ viết đúng | ✅ | ❌ **dễ sai, sai thì im lặng** | ✅ |
| Chuẩn hoá được nhiều hơn hoa/thường | ✅ | ✅ | ❌ |
| Chạy trên mọi database | ✅ | ✅ | ❌ chỉ PostgreSQL |
| Tốn thêm dung lượng | ⚠️ có | ✅ không | ✅ không |

> **Khuyến nghị:** cột sinh + `UNIQUE`. Nó là cách duy nhất vừa chống được cửa sau, vừa không đòi người viết truy vấn phải nhớ gì.

## Tầng 3 — sự thật khó chịu: hoa thường **không** đủ, và chuẩn hoá quá tay còn tệ hơn

Đây là chỗ mà phần lớn ứng viên dừng lại, và là chỗ người phỏng vấn thực sự muốn nghe.

### Chuẩn RFC 5321 nói gì

```text
   an@SHOP.VN
   ▲▲  ▲▲▲▲▲▲▲
   │      └──── PHẦN SAU @  (domain)
   │             → KHÔNG phân biệt hoa thường. Đây là luật, chắc chắn.
   │
   └─────────── PHẦN TRƯỚC @  (local-part)
                 → DO MÁY CHỦ NHẬN QUYẾT ĐỊNH.
                   Theo chuẩn, nó ĐƯỢC PHÉP phân biệt hoa thường!
```

Nghĩa là về mặt lý thuyết, `An@shop.vn` và `an@shop.vn` **có thể là hai hộp thư khác nhau**, và chuẩn cho phép điều đó.

```text
   VẬY CÓ NÊN HẠ CHỮ THƯỜNG PHẦN LOCAL-PART KHÔNG?

   THỰC TẾ: gần như 100% nhà cung cấp lớn (Gmail, Outlook, Yahoo,
   iCloud, Zoho) đều coi hoa thường là một. Máy chủ phân biệt hoa
   thường tồn tại nhưng cực hiếm, chủ yếu là hệ thống nội bộ cũ.

   → HẠ CHỮ THƯỜNG LÀ ĐÁNH ĐỔI ĐÚNG cho phần lớn sản phẩm:
     rủi ro chặn nhầm một người dùng hiếm  <  chi phí có hai
     tài khoản trùng cho cùng một người.

   ⚠ NHƯNG PHẢI BIẾT MÌNH ĐANG ĐÁNH ĐỔI, chứ không phải tưởng
     rằng chuẩn quy định như vậy. Đó là khác biệt giữa
     "em hạ chữ thường" và "em hạ chữ thường, và đây là cái giá".
```

### Còn dấu chấm và dấu cộng của Gmail thì sao?

```text
   GMAIL BỎ QUA DẤU CHẤM TRONG PHẦN LOCAL-PART:

      nguyenvanan@gmail.com
      nguyen.van.an@gmail.com
      n.g.u.y.e.n.v.a.n.a.n@gmail.com
                                        ← TẤT CẢ về CÙNG MỘT hộp thư

   Một địa chỉ 10 ký tự có 9 khe đặt dấu chấm → 2⁹ = 512 cách viết.

   GMAIL CŨNG BỎ MỌI THỨ SAU DẤU CỘNG:
      an+shopee@gmail.com
      an+ngan-hang@gmail.com            ← đều về an@gmail.com
```

**Vậy có nên gỡ dấu chấm và dấu cộng khi chuẩn hoá không?** Đây là câu hỏi bẫy thật sự, và câu trả lời là **cẩn thận, đừng tự chế luật cho từng nhà cung cấp**.

```text
   ┌─────────────────────────────────────────────────────────────┐
   │ NẾU BẠN GỠ DẤU CHẤM CHO MỌI TÊN MIỀN:                       │
   │                                                              │
   │   nguyen.an@congty.vn  →  nguyenan@congty.vn                │
   │                                                              │
   │   Nhưng congty.vn KHÔNG bỏ qua dấu chấm!                    │
   │   → Bạn vừa gộp HAI NGƯỜI KHÁC NHAU thành một tài khoản.    │
   │   → Người này đăng nhập thấy dữ liệu người kia.              │
   │   → Đây là LỖ HỔNG BẢO MẬT, không phải bug hiển thị.        │
   └─────────────────────────────────────────────────────────────┘

   VÀ NẾU CHỈ ÁP DỤNG RIÊNG CHO gmail.com:
   · Luật của Gmail có thể đổi
   · Google Workspace dùng tên miền riêng (congty.com chạy Gmail)
     → bạn không biết tên miền nào thực sự chạy Gmail
   · Bạn phải bảo trì một danh sách tên miền mãi mãi
```

```text
   ⚠ ĐÁNH ĐỔI PHẢI HIỂU RÕ:

   GỠ DẤU CHẤM/DẤU CỘNG:
     ✅ Chặn được người tạo hàng nghìn tài khoản dùng thử miễn phí
        từ một hộp thư (đây là lý do CHÍNH ĐÁNG duy nhất)
     ❌ Rủi ro GỘP NHẦM HAI NGƯỜI trên tên miền không theo luật Gmail

   → Chỉ dùng khi bạn CÓ bài toán chống lạm dụng thật,
     và chỉ áp cho danh sách tên miền đã xác minh,
     và LƯU LẠI cả bản gốc để còn gỡ ra được.
```

### Ba tầng chuẩn hoá — chọn tầng theo mục đích

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ TẦNG A — AN TOÀN, NÊN LÀM CHO MỌI DỰ ÁN                      │
   │   · btrim()          bỏ khoảng trắng đầu/cuối                │
   │   · lower()          hạ chữ thường TOÀN BỘ địa chỉ           │
   │   · NFC              chuẩn hoá Unicode                        │
   │   → Rủi ro gộp nhầm: gần bằng không                          │
   ├──────────────────────────────────────────────────────────────┤
   │ TẦNG B — CÓ RỦI RO, CHỈ KHI CÓ LÝ DO                         │
   │   · gỡ mọi thứ sau dấu +                                     │
   │   → Chặn lạm dụng dùng thử. Rủi ro: người dùng thật sự       │
   │     muốn hai tài khoản riêng bằng +work / +personal          │
   ├──────────────────────────────────────────────────────────────┤
   │ TẦNG C — NGUY HIỂM, HẦU NHƯ KHÔNG NÊN                        │
   │   · gỡ dấu chấm                                              │
   │   → Chỉ cho danh sách tên miền đã xác minh chạy Gmail        │
   │   → Sai một tên miền = gộp nhầm hai con người                │
   └──────────────────────────────────────────────────────────────┘
```

## Kiến trúc và cách hoạt động: hai cột, hai nhiệm vụ

```sql
CREATE TABLE users (
    id               BIGSERIAL PRIMARY KEY,

    -- CỘT GỬI THƯ: giữ nguyên đúng cách người dùng gõ
    email            TEXT NOT NULL
                     CHECK (length(email) <= 320),     -- RFC 5321: 64 + 1 + 255

    -- CỘT SO TRÙNG: database tự tính, không ai ghi tay được
    email_normalized TEXT
                     GENERATED ALWAYS AS (lower(btrim(email))) STORED,

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_users_email_norm ON users (email_normalized);
```

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  Người dùng gõ:  "  An.Nguyen@Shop.VN  "                     │
   └───────────────────────────┬──────────────────────────────────┘
                               ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  Tầng ứng dụng: btrim + validate định dạng                   │
   │  → "An.Nguyen@Shop.VN"                                        │
   └───────────────────────────┬──────────────────────────────────┘
                               ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  BẢNG users                                                   │
   │                                                               │
   │  email            = "An.Nguyen@Shop.VN"   ← gửi thư dùng cột  │
   │                                              này, giữ đúng     │
   │                                              cách họ viết      │
   │                                                               │
   │  email_normalized = "an.nguyen@shop.vn"   ← UNIQUE nằm ở đây  │
   │                       ▲                                       │
   │                       └─ DATABASE TỰ TÍNH, mọi cửa vào đều bị │
   │                          ép qua, kể cả bulk import            │
   └──────────────────────────────────────────────────────────────┘
```

```java
// Tra cứu — LUÔN tra trên cột chuẩn hoá
@Query("SELECT u FROM User u WHERE u.emailNormalized = :norm")
Optional<User> findByEmail(@Param("norm") String normalizedEmail);

// Và chuẩn hoá đầu vào bằng ĐÚNG hàm mà cột sinh đang dùng
public static String normalizeEmail(String raw) {
    return raw == null ? null : raw.trim().toLowerCase(Locale.ROOT);
}
```

```text
   ⚠ CHI TIẾT NHỎ NHƯNG GIẾT NGƯỜI: Locale.ROOT

   "I".toLowerCase()  ở Locale mặc định Thổ Nhĩ Kỳ  →  "ı"  (i không chấm!)
   "I".toLowerCase(Locale.ROOT)                      →  "i"

   Máy chủ đặt locale tr_TR → hàm Java hạ chữ KHÁC hàm lower() của
   PostgreSQL → tra cứu không khớp cột sinh → "email không tồn tại"
   cho đúng những người dùng có chữ I hoa.

   → LUÔN dùng Locale.ROOT khi chuẩn hoá dữ liệu để so sánh.
     Đây là lỗi kinh điển, có tên riêng: "Turkish I problem".
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bộ phận CSKH báo có khách hàng "mất hết đơn hàng cũ". Kiểm tra thì tài khoản vẫn còn nguyên, nhưng đơn hàng nằm ở **một tài khoản khác cùng email**.

**Chẩn đoán:**

```sql
-- ① Đếm xem có bao nhiêu cặp trùng khi bỏ qua hoa thường
SELECT lower(btrim(email)) AS chuan_hoa,
       count(*)            AS so_tai_khoan,
       array_agg(id ORDER BY created_at) AS cac_id,
       array_agg(email)                  AS cac_cach_viet
FROM users
GROUP BY 1
HAVING count(*) > 1
ORDER BY 2 DESC;
```

```text
   chuan_hoa       | so_tai_khoan | cac_id       | cac_cach_viet
   ----------------+--------------+--------------+---------------------------
   an@shop.vn      |            2 | {4821, 9137} | {An@shop.vn, an@shop.vn}
   binh@gmail.com  |            3 | {102,884,...}| {Binh@..., binh@..., BINH@}
   ...
   (1.847 dòng)                                  ← 1.847 người bị tách đôi
```

```sql
-- ② Chúng vào bảng bằng đường nào? Xem thời điểm tạo
SELECT date_trunc('day', created_at) AS ngay, count(*)
FROM users
WHERE email <> lower(email)
GROUP BY 1 ORDER BY 2 DESC LIMIT 5;
--  2026-02-11 | 1203      ← một ngày duy nhất tạo 1.203 tài khoản chữ hoa
--  2026-06-03 |  412      ← ngày chạy migration từ hệ thống cũ
```

```text
   → Ngày 11/02 là ngày nhập danh sách khách hàng từ file CSV của
     đối tác. Script nhập chạy thẳng vào database, không qua ứng dụng.
     Đúng "cửa sau ①".
```

**Cách xử lý — gộp tài khoản, làm theo thứ tự này:**

```sql
-- BƯỚC 1: khoá bảng lại để không phát sinh thêm trong lúc gộp
BEGIN;

-- BƯỚC 2: chọn tài khoản GIỮ LẠI — thường là cái CŨ NHẤT có đăng nhập gần đây
CREATE TEMP TABLE merge_plan AS
SELECT lower(btrim(email))                                    AS norm,
       (array_agg(id ORDER BY last_login_at DESC NULLS LAST,
                            created_at ASC))[1]               AS giu_lai,
       array_remove(array_agg(id ORDER BY created_at), NULL)  AS tat_ca
FROM users GROUP BY 1 HAVING count(*) > 1;

-- BƯỚC 3: chuyển dữ liệu con sang tài khoản giữ lại
UPDATE orders o SET user_id = m.giu_lai
FROM merge_plan m WHERE o.user_id = ANY(m.tat_ca) AND o.user_id <> m.giu_lai;

UPDATE addresses a SET user_id = m.giu_lai
FROM merge_plan m WHERE a.user_id = ANY(m.tat_ca) AND a.user_id <> m.giu_lai;
-- ... lặp cho MỌI bảng có khoá ngoại tới users (đừng sót bảng nào)

-- BƯỚC 4: đánh dấu tài khoản thừa, ĐỪNG XOÁ NGAY
UPDATE users u SET merged_into = m.giu_lai, status = 'MERGED'
FROM merge_plan m WHERE u.id = ANY(m.tat_ca) AND u.id <> m.giu_lai;

COMMIT;
```

```text
   ⚠ VÌ SAO KHÔNG XOÁ NGAY MÀ ĐÁNH DẤU `MERGED`:

   · Gộp nhầm thì còn gỡ ra được
   · Link cũ / email cũ / token cũ vẫn trỏ tới id cũ → cần chuyển hướng
   · Kế toán và đối soát cần truy vết được lịch sử
   → Xoá hẳn sau 90 ngày, khi đã chắc chắn.
```

**Chặn tái diễn — ba lớp:**

```sql
-- ① Ràng buộc ở database, không phụ thuộc ứng dụng
ALTER TABLE users ADD COLUMN email_normalized TEXT
    GENERATED ALWAYS AS (lower(btrim(email))) STORED;
CREATE UNIQUE INDEX uq_users_email_norm ON users (email_normalized);
```

```sql
-- ② Kiểm tra định kỳ, phòng khi có đường vào mới
-- Chạy hằng ngày, bắn cảnh báo nếu > 0
SELECT count(*) FROM (
    SELECT 1 FROM users GROUP BY lower(btrim(email)) HAVING count(*) > 1
) t;
```

```java
// ③ Test chặn regression
@Test
void khong_the_tao_hai_tai_khoan_cung_email_khac_hoa_thuong() {
    userRepository.save(new User("An@shop.vn"));
    assertThatThrownBy(() -> userRepository.saveAndFlush(new User("an@shop.vn")))
        .isInstanceOf(DataIntegrityViolationException.class);
}
```

> **Tình huống 2:** Sau khi thêm `UNIQUE` trên cột chuẩn hoá, một số người dùng báo *"hệ thống nói email đã tồn tại nhưng tôi chưa từng đăng ký"*.

**Chẩn đoán — bạn vừa chặn nhầm người thật:**

```sql
SELECT email, email_normalized, created_at
FROM users WHERE email_normalized = 'nguyenan@congty.vn';
--  nguyen.an@congty.vn | nguyenan@congty.vn | 2026-01-04
--                        ▲
--  Cột chuẩn hoá đang GỠ DẤU CHẤM → gộp nhầm hai người khác nhau
```

```sql
-- Kiểm tra định nghĩa cột sinh
\d+ users
--  email_normalized | text | generated always as
--      (lower(replace(split_part(email,'+',1), '.', ''))) stored
--                            ▲                    ▲
--                  gỡ dấu cộng            GỠ DẤU CHẤM cho MỌI tên miền
```

**Cách xử lý — hạ về tầng A, và chỉ áp tầng B/C khi có danh sách tên miền:**

```sql
-- Sửa cột sinh: chỉ btrim + lower
ALTER TABLE users DROP COLUMN email_normalized;
ALTER TABLE users ADD COLUMN email_normalized TEXT
    GENERATED ALWAYS AS (lower(btrim(email))) STORED;
```

```sql
-- Nếu THẬT SỰ cần chống lạm dụng dùng thử, tách thành cột RIÊNG,
-- KHÔNG đặt UNIQUE lên nó — chỉ dùng để đếm và cảnh báo
ALTER TABLE users ADD COLUMN email_abuse_key TEXT
    GENERATED ALWAYS AS (
        CASE WHEN lower(split_part(email, '@', 2)) IN ('gmail.com','googlemail.com')
             THEN lower(replace(split_part(split_part(email,'@',1), '+', 1), '.', ''))
                  || '@gmail.com'
             ELSE lower(btrim(email))
        END
    ) STORED;

-- Dùng để PHÁT HIỆN, không dùng để CHẶN:
SELECT email_abuse_key, count(*) FROM users
WHERE created_at > now() - interval '7 days'
GROUP BY 1 HAVING count(*) > 5;
```

```text
   NGUYÊN TẮC RÚT RA:

   CHUẨN HOÁ ĐỂ SO TRÙNG DANH TÍNH   → chỉ tầng A (btrim + lower)
                                        vì sai = GỘP NHẦM NGƯỜI
   CHUẨN HOÁ ĐỂ PHÁT HIỆN LẠM DỤNG   → tầng B/C được, nhưng
                                        chỉ CẢNH BÁO, không CHẶN CỨNG

   Hai mục đích, hai cột, hai mức độ hung hăng khác nhau.
```

> **Tình huống 3:** Một người dùng ở Thổ Nhĩ Kỳ không đăng nhập được. Email đúng, mật khẩu đúng, hệ thống báo "email không tồn tại".

**Chẩn đoán — Turkish I problem:**

```java
// Log ra giá trị sau khi chuẩn hoá
log.info("input='{}' normalized='{}'", raw, raw.toLowerCase());
//  input='Ilker@shop.vn'  normalized='ılker@shop.vn'
//                                     ▲ i KHÔNG CHẤM
```

```bash
# Locale của JVM trên pod đó
java -XshowSettings:properties -version 2>&1 | grep user.language
#   user.language = tr
```

**Cách xử lý:**

```java
// ✅ Luôn dùng Locale.ROOT cho chuẩn hoá dữ liệu
raw.trim().toLowerCase(Locale.ROOT);
```

```java
// Và cố định locale của JVM để không phụ thuộc môi trường
// -Duser.language=en -Duser.country=US
```

**Chặn tái diễn:**

```java
@Test
void chuan_hoa_email_khong_phu_thuoc_locale() {
    Locale mac_dinh = Locale.getDefault();
    try {
        Locale.setDefault(new Locale("tr", "TR"));
        assertThat(EmailUtils.normalize("Ilker@shop.vn")).isEqualTo("ilker@shop.vn");
    } finally {
        Locale.setDefault(mac_dinh);
    }
}
```

## Không chỉ email — cùng một luật cho mọi thứ cần so trùng

```text
   BÀI HỌC NÀY ÁP DỤNG CHO MỌI DỮ LIỆU CÓ NHIỀU CÁCH VIẾT:

   ┌──────────────────┬────────────────────────────────────────────┐
   │ Số điện thoại    │ 0912345678 / +84912345678 / 84 912 345 678 │
   │                  │ → chuẩn hoá về E.164: +84912345678          │
   ├──────────────────┼────────────────────────────────────────────┤
   │ Mã số thuế / CCCD│ có gạch nối, có khoảng trắng                │
   │                  │ → gỡ mọi ký tự không phải chữ số            │
   ├──────────────────┼────────────────────────────────────────────┤
   │ Biển số xe       │ 30A-123.45 / 30A12345 / 30a 123 45         │
   ├──────────────────┼────────────────────────────────────────────┤
   │ Tên đăng nhập    │ hoa/thường + Unicode NFC                    │
   │                  │ ⚠ + HOMOGLYPH: chữ `а` Cyrillic nhìn        │
   │                  │   giống hệt `a` Latin → giả mạo tài khoản   │
   ├──────────────────┼────────────────────────────────────────────┤
   │ Tên miền website │ hoa/thường + IDN punycode + bỏ "www."       │
   ├──────────────────┼────────────────────────────────────────────┤
   │ Địa chỉ ví/crypto│ ⚠ CÓ loại PHÂN BIỆT hoa thường thật sự      │
   │                  │   (checksum nằm trong hoa/thường!)          │
   │                  │   → hạ chữ thường là PHÁ HỎNG địa chỉ       │
   └──────────────────┴────────────────────────────────────────────┘

   → Câu hỏi luôn phải hỏi trước: "hai cách viết này CÓ THẬT SỰ
     là cùng một thứ không, theo luật của ai?"
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chỉ hạ chữ ở tầng ứng dụng | Bulk import / admin cũ / dịch vụ khác ghi thẳng vào là lọt | Cột sinh + `UNIQUE` ở database |
| `UNIQUE` đặt trên cột `email` gốc | Không chặn được `An@` vs `an@` | Đặt trên cột **chuẩn hoá** |
| Ghi đè cột gốc bằng bản đã hạ chữ | Mất cách viết người dùng chọn; thư gửi trông thiếu tôn trọng | Giữ **hai cột**, hai nhiệm vụ |
| Gỡ dấu chấm cho **mọi** tên miền | **Gộp nhầm hai người** → lộ dữ liệu chéo | Chỉ tầng A; tầng C phải có whitelist |
| Dùng cột chống lạm dụng làm `UNIQUE` | Chặn nhầm người dùng thật | Cột riêng, chỉ **cảnh báo** |
| `toLowerCase()` không có `Locale.ROOT` | **Turkish I** — người dùng có chữ `I` không đăng nhập được | Luôn `Locale.ROOT` |
| Hàm chuẩn hoá ở Java khác `lower()` ở SQL | Tra cứu không khớp cột sinh, "email không tồn tại" | Cùng một định nghĩa, có test đối chiếu |
| Quên `btrim()` | `"an@shop.vn "` là chuỗi khác | `lower(btrim(...))` |
| Index trên biểu thức nhưng truy vấn viết khác | Không dùng index → quét cả bảng, **im lặng** | Cột sinh dễ dùng đúng hơn |
| Không chuẩn hoá Unicode | Cùng chữ `é` mã hai kiểu → hai dòng | NFC trước khi lưu |
| Hạ chữ thường địa chỉ ví crypto | **Phá hỏng checksum** → mất tiền | Biết loại nào phân biệt hoa thường |
| Xoá ngay tài khoản trùng khi gộp | Gộp nhầm là không gỡ được | Đánh dấu `MERGED`, xoá sau 90 ngày |

## Câu hỏi phỏng vấn hay gặp

**H: Email nên lưu nguyên hay hạ hết về chữ thường?**
Em lưu **cả hai**: một cột `email` giữ nguyên đúng cách người dùng gõ để gửi thư, và một cột `email_normalized` là cột sinh `lower(btrim(email))` với ràng buộc `UNIQUE` đặt trên đó. Lý do phải để database tự tính là vì hạ chữ ở tầng ứng dụng có thể bị vòng qua — nhập hàng loạt từ CSV, trang quản trị cũ, hay một dịch vụ khác ghi thẳng vào bảng đều không đi qua hàm của bạn, và `UNIQUE` trên cột gốc **không kêu một tiếng** vì với database thì `An@` và `an@` là hai chuỗi khác nhau. Nguyên tắc chung là ràng buộc phải nằm ở nơi dữ liệu **đi qua**, không phải nơi bạn hy vọng nó đi qua.

**H: Theo chuẩn thì email có phân biệt hoa thường không?**
Có phần có, phần không. Theo RFC 5321, **phần sau dấu `@`** — tên miền — chắc chắn không phân biệt hoa thường. Nhưng **phần trước dấu `@`** thì do máy chủ nhận quyết định, và chuẩn **cho phép** nó phân biệt hoa thường. Nghĩa là về lý thuyết `An@shop.vn` và `an@shop.vn` có thể là hai hộp thư khác nhau. Thực tế thì gần như 100% nhà cung cấp lớn coi chúng là một, nên hạ chữ thường vẫn là đánh đổi đúng — rủi ro chặn nhầm một người dùng hiếm nhỏ hơn nhiều chi phí có hai tài khoản cho cùng một người. Điểm quan trọng là **biết mình đang đánh đổi**, chứ không phải tưởng chuẩn quy định như vậy.

**H: Gmail bỏ qua dấu chấm, vậy có nên gỡ dấu chấm khi chuẩn hoá không?**
Không, không cho mọi tên miền. Nếu gỡ dấu chấm với `nguyen.an@congty.vn` mà `congty.vn` không theo luật của Gmail thì bạn vừa **gộp hai người khác nhau thành một tài khoản** — người này đăng nhập vào thấy dữ liệu người kia, đó là lỗ hổng bảo mật chứ không phải bug hiển thị. Và nếu chỉ áp riêng cho `gmail.com` thì vẫn có vấn đề: Google Workspace chạy Gmail trên tên miền riêng của công ty nên bạn không biết tên miền nào thực sự là Gmail. Em chia làm ba tầng: tầng A gồm `btrim` + `lower` + Unicode NFC là an toàn cho mọi dự án; gỡ dấu cộng là tầng B, có rủi ro; gỡ dấu chấm là tầng C, chỉ dùng khi có danh sách tên miền đã xác minh. Và nếu cần chống lạm dụng dùng thử thì em tách một cột riêng để **cảnh báo**, tuyệt đối không đặt `UNIQUE` lên nó.

**H: Có `citext` của PostgreSQL rồi thì cần cột chuẩn hoá làm gì?**
`citext` giải quyết đúng một chuyện là hoa thường, rất gọn và trong suốt. Nhưng nó không xử lý khoảng trắng thừa, không mở rộng được sang các luật chuẩn hoá khác, chỉ có ở PostgreSQL, và nó dùng `lower()` theo collation của database — mà nâng cấp hệ điều hành làm đổi luật collation thì index B-tree có thể sai lệch. Cột sinh thì hiện rõ định nghĩa chuẩn hoá ngay trong lược đồ, chạy trên mọi database, và mở rộng được. Em chọn cột sinh trừ khi dự án đã dùng `citext` sẵn.

**H: Bạn từng gặp lỗi gì khi chuẩn hoá chuỗi?**
Turkish I. Trong Java, `"I".toLowerCase()` ở locale Thổ Nhĩ Kỳ trả về `ı` — chữ i **không chấm** — chứ không phải `i`. Nếu JVM chạy với `user.language=tr` thì hàm chuẩn hoá ở Java sẽ khác `lower()` của PostgreSQL, và mọi người dùng có chữ `I` hoa trong email sẽ bị báo "email không tồn tại" dù mật khẩu đúng. Cách chữa là luôn dùng `toLowerCase(Locale.ROOT)` cho mọi chuẩn hoá dữ liệu, và có test chạy với locale `tr_TR` để chặn.

**H: Bài học này áp dụng cho những dữ liệu nào khác?**
Mọi thứ có nhiều cách viết cho cùng một giá trị: số điện thoại chuẩn hoá về E.164, mã số thuế gỡ hết ký tự không phải số, biển số xe, tên miền bỏ `www.`, tên đăng nhập phải chuẩn hoá Unicode NFC và còn phải để ý **homoglyph** — chữ `а` Cyrillic nhìn giống hệt `a` Latin nên dùng để giả mạo tài khoản. Nhưng có một ngoại lệ quan trọng: **địa chỉ ví crypto có loại dùng chính hoa/thường làm checksum**, nên hạ chữ thường là phá hỏng địa chỉ và có thể mất tiền. Nên câu hỏi luôn phải hỏi trước là *"hai cách viết này có thật sự là cùng một thứ không, và theo luật của ai?"*

## Tóm tắt bài 7

- Hạ chữ ở **tầng ứng dụng là không đủ** — bulk import, admin cũ, dịch vụ khác ghi thẳng đều vòng qua nó, và `UNIQUE` trên cột gốc **không kêu một tiếng**.
- Ràng buộc phải nằm ở nơi dữ liệu **đi qua**, không phải nơi bạn hy vọng nó đi qua.
- Giải pháp chuẩn: **hai cột** — `email` giữ nguyên để gửi thư, `email_normalized` là **cột sinh** với `UNIQUE` đặt trên đó.
- RFC 5321: **phần sau `@` không phân biệt hoa thường**, nhưng **phần trước `@` được phép phân biệt**. Hạ chữ thường là đánh đổi đúng — nhưng phải biết mình đang đánh đổi.
- **Gỡ dấu chấm cho mọi tên miền = gộp nhầm hai người = lỗ hổng bảo mật.** Ba tầng chuẩn hoá: A an toàn, B có rủi ro, C nguy hiểm.
- Chuẩn hoá **để so trùng danh tính** chỉ dùng tầng A; chuẩn hoá **để phát hiện lạm dụng** dùng cột riêng và chỉ **cảnh báo**, không chặn cứng.
- **`toLowerCase()` phải có `Locale.ROOT`** — Turkish I biến `I` thành `ı` và làm người dùng không đăng nhập được.
- Hàm chuẩn hoá ở ứng dụng phải **khớp chính xác** định nghĩa cột sinh ở database.
- Gộp tài khoản trùng: chuyển dữ liệu con → **đánh dấu `MERGED`, đừng xoá ngay** → xoá sau 90 ngày.
- Cùng một luật cho số điện thoại, mã số thuế, tên đăng nhập, tên miền — nhưng **địa chỉ ví crypto dùng hoa/thường làm checksum**, hạ chữ là phá hỏng.

**Bài kế tiếp** → [Phase 6, Bài 1: DELETE vs TRUNCATE vs DROP](../phase-6/01-delete-truncate-drop-lenh-nao-khong-co-duong-quay-lai.md)

**Quay lại** → [Bài 6: Ràng buộc — luật nằm trong dữ liệu](06-rang-buoc-constraint-luat-nam-trong-du-lieu.md)

# Bài 3: Soft delete hay xoá thật?

Ghế còn ấm. Người phỏng vấn không hỏi gì về dự án cũ. Anh lật sổ, nhìn lên, hỏi đúng một câu mà bạn nghĩ mình trả lời xong trong ba giây:

> *"Soft delete hay xoá thật? Bạn chọn cái nào?"*

Câu trả lời của bạn — dù là gì — gần như chắc chắn **đúng**. Và bạn vẫn có thể trượt, vì đây là câu hỏi bốn tầng, và mỗi tầng là **một tờ hoá đơn** sẽ tới tay bạn ở một mốc thời gian khác nhau.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Soft delete** | sóp đi-lít | **Xoá mềm** — chỉ đánh dấu là đã xoá, dữ liệu vẫn còn |
| **Hard delete** | hát | **Xoá thật** — dòng biến mất khỏi bảng |
| **Anonymization** | a-nô-ni-mai-zê-shân | **Ẩn danh hoá** — giữ dòng nhưng xoá phần nhận dạng cá nhân |
| **Crypto-shredding** | crip-tô sret-đing | **Xoá bằng cách huỷ khoá** — dữ liệu mã hoá thành rác vĩnh viễn |
| **RLS** (*Row Level Security*) | | **Bảo mật cấp dòng** — database tự lọc, code không cần nhớ |
| **Partial unique index** | | Index duy nhất **chỉ áp cho tập dòng thoả điều kiện** |
| **Retention** | ri-ten-shân | **Thời hạn lưu trữ** dữ liệu theo luật hoặc theo chính sách |
| **Nghị định 13/2023** | | Luật Việt Nam về dữ liệu cá nhân — xoá trong **72 giờ** |
| **GDPR** | ge-đi-pi-a | Luật châu Âu về dữ liệu cá nhân |
| **SCD Type 2** | | Cách lưu **lịch sử thay đổi** có `hiệu_lực_từ` / `hiệu_lực_đến` |

## Soft delete là gì và vì sao ai cũng chọn nó

**Soft delete** (xoá mềm) là không xoá thật, chỉ đánh dấu bản ghi là "đã xoá":

```sql
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

-- "Xoá"
UPDATE users SET deleted_at = now() WHERE user_id = 42;

-- Mọi truy vấn phải nhớ lọc
SELECT * FROM users WHERE deleted_at IS NULL;
```

Lý do ai cũng chọn nó rất chính đáng:

- Khôi phục được khi người dùng bấm nhầm.
- Giữ được lịch sử để audit và điều tra sự cố.
- Không làm gãy khoá ngoại của các bản ghi liên quan.
- Báo cáo lịch sử vẫn đúng (đơn hàng cũ vẫn trỏ được về khách đã xoá).

Nghe không có nhược điểm nào. Đó là lý do nó là mặc định ở gần như mọi dự án. Và đó cũng là lý do bốn tờ hoá đơn dưới đây luôn tới đúng hẹn.

## Tờ hoá đơn thứ nhất — tuần đầu tiên: một chỗ quên lọc

```sql
-- Query A nhớ lọc
SELECT count(*) FROM users WHERE deleted_at IS NULL;      -- 1.190.000

-- Query B ở màn hình khác thì quên
SELECT count(*) FROM users;                                -- 1.284.000
```

94.000 người "biến mất" hay "sống lại" tuỳ bạn đọc báo cáo nào. Không ai xoá dữ liệu, không ai chạy lệnh gì — chỉ là hai câu truy vấn khác nhau đúng một mệnh đề.

Và nó lan rất nhanh: mỗi `JOIN` là thêm một chỗ phải nhớ.

```sql
-- Đơn hàng của khách đã xoá vẫn hiện ra
SELECT o.* FROM orders o
JOIN users u ON u.user_id = o.user_id
WHERE u.deleted_at IS NULL;          -- nhớ ở đây
--   ... và ở mọi bảng khác trong câu lệnh
```

**Ngưỡng để nói cho gọn trong phỏng vấn:** dưới khoảng 10 chỗ đọc, tay còn chống được. Trên 10, phải **đẩy điều kiện xuống một lớp bên dưới** — đừng đánh cược vào trí nhớ.

Ba cách đẩy xuống, xếp theo độ mạnh:

```sql
-- ① VIEW — rẻ nhất, nhưng vẫn phải nhớ dùng view thay vì bảng
CREATE VIEW users_alive AS SELECT * FROM users WHERE deleted_at IS NULL;

-- ② ĐỔI TÊN BẢNG — ép mọi code cũ phải sửa, không ai "quên" được
ALTER TABLE users RENAME TO users_all;
CREATE VIEW users AS SELECT * FROM users_all WHERE deleted_at IS NULL;
-- Code cũ trỏ tới "users" giờ tự động chỉ thấy dòng còn sống

-- ③ ROW LEVEL SECURITY — mạnh nhất, database tự thi hành
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_alive_only ON users
    FOR SELECT USING (deleted_at IS NULL);
-- Ngay cả lệnh chạy tay cũng không nhìn thấy dòng đã xoá
-- (trừ vai trò có BYPASSRLS)
```

Ở tầng ORM, hầu hết framework có sẵn: Laravel `SoftDeletes` trait, Django `SafeDeleteModel`, Rails `acts_as_paranoid`, Hibernate `@Where(clause = "deleted_at IS NULL")`. Nhưng chú ý: **chúng chỉ lọc ở tầng ORM**. Query thô, script báo cáo, job ETL và mọi service viết bằng ngôn ngữ khác đều đi vòng qua được.

## Tờ hoá đơn thứ hai — tháng thứ ba: đăng ký lại bằng email cũ

Khách xoá tài khoản. Tháng sau đăng ký lại bằng đúng email đó. Màn hình báo **"Email đã tồn tại"**. Nhưng trong ứng dụng không có tài khoản nào mang email đó. Bộ phận hỗ trợ tìm cả buổi.

Vì `UNIQUE` không biết đọc điều kiện lọc của bạn. Nó nhìn thấy cả dòng đã xoá, và nó chặn.

```sql
CREATE TABLE users (
    user_id    BIGSERIAL PRIMARY KEY,
    email      TEXT NOT NULL,
    deleted_at TIMESTAMPTZ,
    UNIQUE (email)          -- ❌ chặn cả email của tài khoản đã xoá
);
```

Cách chữa ai cũng nghĩ ra đầu tiên — và nó **thủng ngay lập tức**:

```sql
UNIQUE (email, deleted_at)   -- ❌ VẪN SAI
```

Vì trong SQL, **`NULL` không bằng `NULL`**. Hai dòng còn sống, cùng email, cột `deleted_at` cùng là `NULL` — ràng buộc so hai ô `NULL`, thấy chúng "khác nhau", rồi cho qua. Bạn vừa mở cửa cho **hai tài khoản chung một email**.

Ba cách đúng:

```sql
-- ✅ ① Partial unique index — chỉ ràng buộc trên dòng còn sống (PostgreSQL)
CREATE UNIQUE INDEX users_email_alive_uk
    ON users (email) WHERE deleted_at IS NULL;

-- ✅ ② Dùng sentinel thay NULL — chạy được trên MySQL (không có partial index)
ALTER TABLE users ALTER COLUMN deleted_at SET DEFAULT '1970-01-01'::timestamptz;
ALTER TABLE users ALTER COLUMN deleted_at SET NOT NULL;
-- Giờ UNIQUE(email, deleted_at) hoạt động đúng, vì không còn NULL

-- ✅ ③ MySQL: cột sinh làm khoá phụ
ALTER TABLE users
  ADD COLUMN email_alive VARCHAR(320)
      GENERATED ALWAYS AS (IF(deleted_at IS NULL, email, NULL)) STORED,
  ADD UNIQUE KEY (email_alive);
-- Dòng đã xoá có email_alive = NULL → không tham gia ràng buộc
```

Nhưng đổi lại, bạn vừa mất một lời hứa: **khôi phục không còn vô điều kiện**. Khách xoá tài khoản, người khác đăng ký email đó, giờ không khôi phục được nữa. Đó là đánh đổi phải nói ra:

> **Soft delete giữ dữ liệu, nhưng không giữ được lời hứa khôi phục.**

## Tờ hoá đơn thứ ba — năm thứ nhất: bảng phình và query chậm

```text
Bảng users:  1.284.000 dòng
Còn sống:    1.190.000 dòng
Đã xoá:         94.000 dòng (7%)

Sau 3 năm bảng events:  400 triệu dòng, 340 triệu đã "xoá" (85%)
→ Mọi index vẫn chứa đủ 400 triệu mục
→ Mọi lần quét vẫn chạm 400 triệu dòng
→ Bạn đang trả tiền RAM và CPU cho dữ liệu không ai đọc
```

Ba cách xử lý:

```sql
-- ① Partial index — chỉ đánh index dòng còn sống
CREATE INDEX users_email_idx ON users (email) WHERE deleted_at IS NULL;
-- Index nhỏ hơn 93%, query nhanh hơn rõ rệt
-- Điều kiện: query PHẢI có WHERE deleted_at IS NULL để optimizer dùng được

-- ② Đưa cột lọc vào ĐẦU index gộp
CREATE INDEX orders_alive_idx ON orders (deleted_at, customer_id, ordered_at);
-- Kém hơn partial index nhưng chạy được trên MySQL

-- ③ Chuyển sang bảng lưu trữ (archive) — cách bền nhất
CREATE TABLE users_archive (LIKE users INCLUDING ALL);

WITH moved AS (
    DELETE FROM users
    WHERE deleted_at < now() - INTERVAL '90 days'
    RETURNING *
)
INSERT INTO users_archive SELECT * FROM moved;
```

Cách ③ đưa soft delete về đúng vai trò của nó: **một cái thùng rác 30–90 ngày, có người dọn, có hạn** — chứ không phải một cái kho giữ mọi thứ mãi mãi vì không ai dám xoá.

Nếu bảng đã được **phân vùng** (partition) theo thời gian, việc dọn còn rẻ hơn nữa: `DROP TABLE` trên partition cũ là thao tác tức thì (xem phase-7 bài 3).

## Tờ hoá đơn thứ tư — năm thứ hai: khách đòi xoá thật

Đây là chỗ bạn đi ra khỏi vùng kỹ thuật. Không có mẹo nào ở đây cả. Có một **cái hạn, và cái hạn đó do luật đặt, không do bạn đặt.**

| Quy định | Phạm vi | Thời hạn xoá dữ liệu cá nhân |
|---|---|---|
| **Nghị định 13/2023/NĐ-CP** (Việt Nam) | Dữ liệu cá nhân của người ở VN | **72 giờ** kể từ khi nhận yêu cầu |
| **GDPR** điều 17 (EU) | Công dân EU | "Không chậm trễ quá mức", thực tế ~1 tháng |
| **CCPA** (California) | Cư dân California | 45 ngày (gia hạn được tới 90) |

Cột `deleted_at` **không đáp ứng được cái nào** — dữ liệu vẫn còn nguyên trong bảng, trong backup, trong replica, trong kho phân tích.

Nhưng đừng vội xoá sạch mọi thứ, vì chiều ngược lại cũng là luật:

| Quy định | Loại dữ liệu | Thời hạn **bắt buộc giữ** |
|---|---|---|
| Luật Kế toán 2015 (VN), điều 41 | Chứng từ kế toán, hoá đơn | **10 năm** |
| Luật Kế toán (VN) | Tài liệu dùng trực tiếp ghi sổ, báo cáo tài chính | 10 năm |
| Luật Giao dịch điện tử | Chứng từ điện tử | Theo thời hạn của chứng từ giấy tương ứng |
| Quy định ngành ngân hàng | Hồ sơ khách hàng, giao dịch | Thường 5–10 năm sau khi đóng tài khoản |

**Xoá thật một dòng đơn hàng có thể là vi phạm luật khác, ở chiều ngược lại.**

### Câu trả lời đúng: tách làm hai loại dữ liệu

```text
① DỮ LIỆU CÁ NHÂN (họ tên, email, số điện thoại, địa chỉ, CCCD)
   → Phải có đường XOÁ THẬT. Chậm nhất 72 giờ.
   → Soft delete chỉ là thùng rác 30 ngày có job dọn.

② SỔ SÁCH (đơn hàng, hoá đơn, giao dịch, chứng từ)
   → KHÔNG AI được phép xoá. Luật bắt giữ 10 năm.
   → Nhưng phải TÁCH được phần nhận dạng cá nhân ra khỏi nó.
```

Kỹ thuật để làm được cả hai cùng lúc:

```sql
-- ① Ẩn danh hoá (anonymization): giữ dòng sổ sách, xoá phần nhận dạng
UPDATE users SET
    full_name  = 'Đã xoá theo yêu cầu',
    email      = 'deleted-' || user_id || '@invalid.local',
    phone      = NULL,
    address    = NULL,
    id_number  = NULL,
    anonymized_at = now()
WHERE user_id = 42;
-- Đơn hàng vẫn trỏ về user_id = 42 → báo cáo doanh thu không gãy
-- Nhưng không còn dữ liệu cá nhân nào

-- ② Crypto-shredding: dữ liệu cá nhân được mã hoá bằng khoá RIÊNG mỗi người
--    Xoá khoá = dữ liệu vĩnh viễn không giải mã được, kể cả trong backup cũ
DELETE FROM user_encryption_keys WHERE user_id = 42;
```

**Crypto-shredding là câu trả lời cho vấn đề khó nhất của quyền được lãng quên: backup.** Bạn không thể sửa một bản backup đã ghi ra băng từ. Nhưng nếu dữ liệu trong đó được mã hoá bằng khoá riêng của từng người, và bạn xoá khoá đó, thì nó vĩnh viễn là rác. Nói được điều này trong phỏng vấn là điểm cộng rất lớn.

Đừng quên **danh sách nơi cần dọn** — dữ liệu cá nhân không chỉ nằm ở bảng chính:

```text
□ Bảng chính              □ Replica đọc
□ Bảng lịch sử / audit    □ Kho phân tích (BigQuery/Snowflake)
□ Cache (Redis)           □ Chỉ mục tìm kiếm (Elasticsearch)
□ Log ứng dụng            □ Email marketing (Mailchimp/Klaviyo)
□ Backup                  □ CDC stream (Kafka)
```

## Bảng quyết định

| Loại dữ liệu | Chiến lược | Lý do |
|---|---|---|
| Nội dung người dùng tạo (bài viết, bình luận) | Soft delete + dọn sau 30 ngày | Bấm nhầm là chuyện thường |
| Tài khoản người dùng | Soft delete 30 ngày → **ẩn danh hoá** | Vừa cho hối hận, vừa tuân thủ luật |
| Đơn hàng, hoá đơn, giao dịch | **Không bao giờ xoá** — dùng cột `status` | Luật giữ 10 năm |
| Dòng giỏ hàng, session, dữ liệu tạm | **Xoá thật ngay** | Không ai hối hận, không ai kiểm toán |
| Log, event, metric | Xoá thật theo **partition** | Khối lượng lớn, có hạn lưu trữ rõ ràng |
| Dữ liệu cá nhân nhạy cảm (CCCD, sinh trắc) | Mã hoá + crypto-shredding | Backup không sửa được |
| Bảng cấu hình, danh mục | Soft delete (cột `is_active`) | Cần lịch sử để báo cáo cũ đúng |

Lưu ý điểm cuối: với bảng danh mục, thứ bạn thật sự cần thường **không phải soft delete** mà là **SCD Type 2** (xem phase-4 bài 2) — lưu lịch sử thay đổi có `hieu_luc_tu` / `hieu_luc_den`, để báo cáo tháng trước dùng đúng giá của tháng trước.

## Đào sâu: khôi phục là một lời hứa, và lời hứa phải được kiểm thử

Câu ăn điểm nhất trong cả bài phỏng vấn này:

> *"Khôi phục được là một lời hứa. Nên em có kiểm tra nó thật."*

Vì khôi phục một bản ghi hiếm khi đơn giản như đặt `deleted_at = NULL`:

```text
Khôi phục user 42 — những thứ phải kiểm:
  □ Email của họ đã bị người khác lấy chưa?         (unique constraint)
  □ Các bản ghi con đã bị cascade xoá chưa?          (orders, addresses)
  □ Username / slug có bị chiếm chưa?
  □ Subscription đã bị huỷ ở cổng thanh toán chưa?   (hệ thống ngoài)
  □ Dữ liệu đã bị dọn khỏi search index chưa?
  □ Quyền / vai trò của họ còn tồn tại không?
```

Câu hỏi tự kiểm tra dành cho hệ thống của bạn ngay hôm nay: **bảng nào đang soft delete mà chưa ai bấm khôi phục lần nào?** Nếu chưa ai bấm, bạn không có tính năng khôi phục — bạn chỉ có một cột `deleted_at` và một cái kho rác.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Khách gửi email yêu cầu **xoá toàn bộ dữ liệu cá nhân** theo Nghị định 13. Bạn có **72 giờ**. Nhưng họ có 200 đơn hàng mà kế toán bảo phải giữ 10 năm.

**Đây là bài toán hai luật ngược chiều nhau. Cách xử lý:**

```sql
-- ═══ BƯỚC 1: ẨN DANH HOÁ, không xoá dòng ═══
BEGIN;
UPDATE users SET
    full_name     = 'Đã xoá theo yêu cầu',
    email         = 'deleted-' || user_id || '@invalid.local',
    phone         = NULL,
    address       = NULL,
    id_number     = NULL,
    date_of_birth = NULL,
    anonymized_at = now()
WHERE user_id = 42;

-- Đơn hàng VẪN trỏ về user_id = 42 → báo cáo doanh thu KHÔNG GÃY
-- Nhưng không còn dữ liệu cá nhân nào

-- ═══ BƯỚC 2: xoá phần nhận dạng nằm rải rác ở bảng khác ═══
UPDATE orders SET
    ten_nguoi_nhan = 'Đã xoá', dia_chi_giao = 'Đã xoá', sdt_nguoi_nhan = NULL
WHERE customer_id = 42;

DELETE FROM addresses      WHERE user_id = 42;
DELETE FROM payment_methods WHERE user_id = 42;
COMMIT;
```

**Bước 3 — danh sách nơi cần dọn, đừng quên chỗ nào:**

```text
   □ Bảng chính              □ Replica đọc (tự đồng bộ)
   □ Bảng lịch sử / audit    □ Kho phân tích (BigQuery/Snowflake)
   □ Cache Redis             □ Chỉ mục tìm kiếm (Elasticsearch)
   □ Log ứng dụng            □ Email marketing (Mailchimp)
   □ CDC stream (Kafka)      □ BACKUP  ◄── chỗ khó nhất
```

**Bước 4 — backup: chỗ duy nhất không sửa được.**

```text
   Bạn KHÔNG thể sửa một bản backup đã ghi ra.

   ✅ Cách duy nhất: CRYPTO-SHREDDING
      Mã hoá dữ liệu cá nhân bằng khoá RIÊNG cho từng người,
      lưu khoá ở nơi xoá được.
      Xoá khoá → dữ liệu trong MỌI backup cũ vĩnh viễn thành rác.
```

```sql
DELETE FROM user_encryption_keys WHERE user_id = 42;
-- Từ giây này, không ai giải mã được dữ liệu của user 42, kể cả bạn
```

**Bước 5 — ghi nhận để chứng minh đã tuân thủ:**

```sql
INSERT INTO gdpr_requests (user_id, loai, nhan_luc, hoan_thanh_luc, nguoi_xu_ly)
VALUES (42, 'erasure', '2026-08-01 09:00+07', now(), 'system');
```

> **Tình huống 2:** Sản phẩm có nút "Khôi phục tài khoản". Chưa ai bấm bao giờ. Sếp hỏi *"nó có chạy không?"*

**Câu trả lời trung thực: bạn không biết — vì chưa ai kiểm.**

```sql
-- ① Đếm xem có bao nhiêu tài khoản đang chờ khôi phục
SELECT count(*) FROM users
WHERE deleted_at IS NOT NULL AND deleted_at > now() - INTERVAL '30 days';

-- ② KIỂM THỬ THẬT: thử khôi phục một tài khoản trên môi trường staging
```

**Sáu thứ phải kiểm trước khi dám nói "khôi phục được":**

```text
   □ Email của họ đã bị người khác lấy chưa?     → partial unique index chặn
   □ Bản ghi con đã bị CASCADE xoá chưa?          → orders, addresses còn không
   □ Username / slug có bị chiếm chưa?
   □ Subscription ở cổng thanh toán đã huỷ chưa?  → hệ thống NGOÀI, khó nhất
   □ Dữ liệu đã bị dọn khỏi search index chưa?
   □ Vai trò / quyền của họ còn tồn tại không?
```

```python
# Test tự động — chạy trong CI, không để nó hỏng âm thầm
def test_khoi_phuc_tai_khoan(db):
    u = tao_user(email="test@x.com")
    xoa_mem(u.id)
    tao_user(email="test@x.com")          # người khác lấy email đó

    with pytest.raises(EmailDaBiChiem):   # PHẢI báo lỗi rõ ràng
        khoi_phuc(u.id)                   # chứ không phải im lặng thất bại
```

> **Câu ăn điểm khi phỏng vấn:** *"Khôi phục là một lời hứa. Nên em có kiểm tra nó thật."*

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `WHERE deleted_at IS NULL` ở một chỗ | Hai báo cáo lệch nhau | Đẩy xuống view / RLS khi >10 chỗ đọc |
| `UNIQUE(email, deleted_at)` | Hai `NULL` khác nhau → trùng email | Partial unique index |
| Không có job dọn | Bảng phình mãi, index chậm dần | Thùng rác có hạn 30–90 ngày |
| Chỉ dựa vào ORM để lọc | Query thô / ETL / service khác đi vòng qua | RLS hoặc đổi tên bảng + view |
| Coi `deleted_at` là đủ để tuân thủ luật | Vi phạm Nghị định 13 / GDPR | Đường xoá thật + ẩn danh hoá |
| Xoá thật dòng đơn hàng để "tuân thủ GDPR" | Vi phạm Luật Kế toán (giữ 10 năm) | Tách dữ liệu cá nhân khỏi sổ sách |
| Quên dọn ở replica / cache / search / backup | Dữ liệu vẫn tồn tại ở nơi khác | Checklist đầy đủ + crypto-shredding |
| Chưa bao giờ thử khôi phục | Ngày cần dùng mới biết nó không chạy | Kiểm thử khôi phục định kỳ |
| Soft delete cho bảng danh mục | Báo cáo cũ dùng nhầm giá mới | SCD Type 2 |

## Câu hỏi phỏng vấn hay gặp

**H: Soft delete hay xoá thật, bạn chọn cái nào?**
Em tách làm hai loại. Đơn hàng và chứng từ thì **không xoá** — Luật Kế toán bắt giữ 10 năm. Dữ liệu cá nhân thì **phải có đường xoá thật**, chậm nhất 72 giờ theo Nghị định 13. Soft delete em chỉ dùng làm **thùng rác 30 ngày có job dọn**, không phải kho giữ mãi mãi. Điều kiện "chưa xoá" em đẩy xuống một lớp bên dưới bằng view hoặc RLS, không tin vào trí nhớ. Ràng buộc duy nhất chỉ đánh trên dòng còn sống bằng partial index. Và **khôi phục là một lời hứa nên em có kiểm tra nó thật.**

**H: Vì sao `UNIQUE(email, deleted_at)` không cứu được?**
Vì hai dòng còn sống đều có `deleted_at = NULL`, mà trong SQL `NULL` không bằng `NULL` — ràng buộc coi hai ô đó là khác nhau rồi cho qua. Kết quả là hai tài khoản chung một email. Cách đúng là partial unique index `WHERE deleted_at IS NULL`, hoặc dùng giá trị sentinel thay `NULL` nếu database không hỗ trợ partial index.

**H: Làm sao xoá dữ liệu cá nhân trong backup?**
Không sửa được backup đã ghi. Cách duy nhất là **crypto-shredding**: mã hoá dữ liệu cá nhân bằng khoá riêng cho từng người dùng, lưu khoá ở nơi có thể xoá được. Xoá khoá thì dữ liệu trong mọi backup cũ vĩnh viễn không giải mã được nữa. Ngoài ra vẫn phải đặt hạn lưu trữ cho backup — giữ 90 ngày thay vì giữ mãi.

**H: Soft delete làm chậm hệ thống thế nào?**
Bảng và index vẫn chứa đủ mọi dòng đã xoá, nên bạn trả tiền RAM và CPU cho dữ liệu không ai đọc. Sau ba năm, bảng event có thể 85% là dòng chết. Cách chữa: partial index chỉ đánh trên dòng còn sống (query bắt buộc phải có `WHERE deleted_at IS NULL` để dùng được), và chuyển dữ liệu cũ sang bảng archive hoặc dùng partition rồi `DROP PARTITION`.

## Tóm tắt bài 3

- Soft delete gửi bạn **bốn tờ hoá đơn**: quên lọc (tuần đầu), `UNIQUE` gãy (tháng 3), bảng phình (năm 1), luật đòi xoá thật (năm 2).
- Trên 10 chỗ đọc thì **đẩy điều kiện xuống** view / đổi tên bảng / Row Level Security — đừng tin trí nhớ.
- `UNIQUE(email, deleted_at)` **không cứu được** vì `NULL ≠ NULL` → dùng **partial unique index**.
- Soft delete là **thùng rác có hạn 30–90 ngày, có job dọn**, không phải kho giữ mãi mãi.
- Tách hai loại: **dữ liệu cá nhân** phải xoá thật (Nghị định 13: 72 giờ) vs **sổ sách** không được xoá (Luật Kế toán: 10 năm) → giải bằng **ẩn danh hoá** và **crypto-shredding**.
- **Khôi phục là một lời hứa** — phải kiểm thử nó, vì email có thể đã bị người khác lấy, bản ghi con đã cascade, hệ thống ngoài đã huỷ.

**Bài kế tiếp** → [Bài 4: SQL Injection và lưu mật khẩu đúng cách](04-sql-injection-va-luu-mat-khau-dung-cach.md)

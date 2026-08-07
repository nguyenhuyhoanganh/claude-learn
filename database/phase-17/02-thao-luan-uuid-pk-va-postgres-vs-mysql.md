# Bài 3: Thảo luận — UUID làm Primary Key, và câu chuyện Uber

Hai câu chuyện thật trong bài này, và cả hai đều dạy cùng một bài học: **quyết định tưởng nhỏ ở tầng lưu trữ có thể quyết định kiến trúc của cả công ty**.

---

# Phần I — Shopify và UUID

## Vì sao người ta muốn UUID

```text
   ✔ Sinh duoc o CLIENT, khong can hoi database
   ✔ Sinh duoc o NHIEU MAY ma khong dung nhau
   ✔ Khong lo quy mo kinh doanh
     (id=1.245.883 cho doi thu biet ban da xu ly bao nhieu don)
   ✔ Ghep du lieu tu nhieu he thong khong so trung
   ✔ Doan khong duoc → khong duyet duoc du lieu nguoi khac
```

Toàn là lý do chính đáng. Vấn đề nằm ở **UUID v4** — biến thể ngẫu nhiên hoàn toàn.

## Vì sao ngẫu nhiên lại đắt

Nhắc lại cơ chế từ [phase-4 bài 4](../phase-4/04-bloom-filter-va-uuid-performance.md), nhìn từ góc khác:

```text
   KHOA TANG DAN                        UUID v4
   ══════════════                       ═══════
   Chen 1001, 1002, 1003...             Chen f47ac1..., 550e84..., 6ba7b8...
   → tat ca vao PAGE CUOI               → moi cai vao MOT PAGE NGAU NHIEN

   ┌───┬───┬───┬───┬███┐                ┌███┬───┬███┬───┬███┐
   └───┴───┴───┴───┴───┘                └───┴───┴───┴───┴───┘
     1 page nong, luon trong RAM          page nong RAI KHAP NOI

   → 0 lan doc dia truoc khi ghi        → phai DOC page do len truoc
                                          (index 20 GB, RAM 4 GB
                                           → 80% kha nang khong co trong cache)
```

Và trên InnoDB, hậu quả nhân đôi vì **bảng cũng được sắp theo primary key**:

```text
   POSTGRESQL (heap)         INNODB (clustered)
   ═════════════════         ══════════════════
   Bang: nhet vao cho trong   Bang: PHAI chen dung vi tri thu tu
         → khong tach page          → TACH PAGE
   Index PK: tach page        Clustered index CHINH LA bang
                                    → tach page keo theo CA DU LIEU
                              Index phu: chua CA UUID (16-36 byte)
                                    → phinh theo
```

## Con số đo được

Thí nghiệm trên PostgreSQL, 3 triệu dòng:

```text
   ┌──────────────┬────────────┬──────────┬─────────────────┐
   │              │ Thoi gian  │  Index   │ Tuong quan      │
   ├──────────────┼────────────┼──────────┼─────────────────┤
   │ BIGINT       │    9,2 s   │   64 MB  │  1,000          │
   │ UUID v4      │   34,1 s   │  133 MB  │  0,002          │
   │ UUID v7      │   10,8 s   │   71 MB  │  0,998          │
   └──────────────┴────────────┴──────────┴─────────────────┘

   UUID v4 vs BIGINT :  cham hon 3,7 lan, index lon hon 2,1 lan
   UUID v7 vs BIGINT :  cham hon 1,2 lan, index lon hon 1,1 lan
```

Cột `tương quan` (từ `pg_stats.correlation`) là bằng chứng trực tiếp: v4 hoàn toàn ngẫu nhiên (0,002), v7 gần như hoàn hảo (0,998).

## Shopify chuyển sang ULID

Shopify gặp đúng vấn đề này ở quy mô lớn và chuyển từ UUID v4 sang **ULID** — định dạng có 48 bit đầu là timestamp mili-giây, phần còn lại ngẫu nhiên.

```text
   ULID:  01ARZ3NDEKTSV4RRFFQ69G5FAV
          └────┬────┘└──────┬───────┘
          48 bit thoi gian  80 bit ngau nhien

   → TANG DAN theo thoi gian → chen vao page cuoi
   → VAN phan tan → sinh duoc o nhieu may
   → Ma hoa Base32 → doc duoc, khong co ky tu de nham (I, L, O, U)
```

Cách đọc bài học này cho đúng:

```text
   ❌ "UUID xau, dung cam"
   ✔  "KHOA NGAU NHIEN trong CAU TRUC SAP XEP thi dat"

   → Van dung duoc dinh danh phan tan.
   → Chi can chon loai TANG DAN THEO THOI GIAN.
```

## UUID v7 — lựa chọn mặc định hiện nay

Chuẩn hoá chính thức trong **RFC 9562 (2024)**:

```text
   UUID v7:  0190a4f2-8c3d-7abc-9def-0123456789ab
             └─────┬─────┘ ▲
             48 bit ms     └ phien ban 7
```

```sql
-- PostgreSQL 18 co san
CREATE TABLE orders (id UUID PRIMARY KEY DEFAULT uuidv7());

-- Ban cu hon: extension
CREATE EXTENSION pg_uuidv7;
CREATE TABLE orders (id UUID PRIMARY KEY DEFAULT uuid_generate_v7());
```

### Bảng so sánh các loại định danh

| Loại | Tăng dần | Kích thước | Lộ gì | Sinh ở client |
|---|---|---|---|---|
| `BIGSERIAL` | **Hoàn hảo** | 8 byte | **Quy mô kinh doanh** | Không |
| UUID v1 | Một phần | 16 byte | **Địa chỉ MAC** | Có |
| UUID v4 | **Không** | 16 byte | Không | Có |
| **UUID v7** | **Có** | 16 byte | Thời điểm tạo | **Có** |
| ULID | **Có** | 16 byte | Thời điểm tạo | **Có** |
| Snowflake | **Có** | **8 byte** | Thời gian + máy | Cần phối hợp |

## Lưu trữ — sai chỗ này rất đắt

```text
   PostgreSQL:  kieu UUID      → 16 byte   ✔
   MySQL     :  BINARY(16)     → 16 byte   ✔
                CHAR(36)       → 36 byte   ✘ LANG PHI 20 BYTE

   TREN INNODB, 20 byte lang phi bi NHAN LEN trong MOI INDEX PHU:

   Bang 100 trieu dong, 5 index phu:
     BINARY(16) :  100tr × 16 × 6 =  9,6 GB
     CHAR(36)   :  100tr × 36 × 6 = 21,6 GB
                                     ─────────
                              THEM 12 GB tranh cho trong buffer pool
```

```sql
-- MySQL 8: chuyen doi kem sap xep lai byte
INSERT INTO t (id) VALUES (UUID_TO_BIN(UUID(), 1));
SELECT BIN_TO_UUID(id, 1) FROM t;
--                     ▲ tham so 1 = dao byte thoi gian len dau (cho UUID v1)
```

## Mẫu tách đôi

Khi cần cả hiệu năng lẫn định danh không đoán được:

```sql
CREATE TABLE orders (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- ky thuat
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE     -- doi ngoai
);
```

```text
   `id`        → khoa ngoai, JOIN, index — nho va nhanh
   `public_id` → URL, API, tich hop — khong lo quy mo

   ✔ Duoc ca hai
   ✘ Ton them mot cot va mot index UNIQUE
   ✘ Phai nho dung dung cai nao o dung cho
```

---

# Phần II — Vì sao Uber chuyển từ PostgreSQL sang MySQL

Năm 2016 Uber công bố bài viết gây tranh cãi lớn về việc họ chuyển từ PostgreSQL sang MySQL. Đây là ca nghiên cứu tốt vì nó cho thấy **cùng một đặc tính vừa là điểm mạnh vừa là điểm yếu, tuỳ tải**.

## Lý do 1 — Khuếch đại ghi qua index

```text
   POSTGRESQL:  moi index tro toi `ctid` (vi tri vat ly).
                UPDATE tao phien ban moi → ctid doi
                → PHAI cap nhat MOI INDEX
                → ke ca index tren cot KHONG THAY DOI

   MYSQL INNODB: index phu tro toi PRIMARY KEY (khong doi).
                 UPDATE mot cot khong duoc danh index
                 → KHONG dung index phu nao
```

```text
   Bang cua Uber: 12 index, cap nhat rat thuong xuyen
     PostgreSQL: 1 lenh UPDATE → dung 12 index
     MySQL     : 1 lenh UPDATE → dung 0 index (neu cot do khong co index)
```

**Nhưng**: PostgreSQL có **HOT update** giảm nhẹ chuyện này. Điều kiện là phiên bản mới nằm cùng page **và** không cột nào được đánh index bị đổi. Với `fillfactor` mặc định 100 và bảng cập nhật nhiều, tỉ lệ HOT thường thấp.

## Lý do 2 — Nhân bản gửi thay đổi vật lý

```text
   POSTGRESQL: nhan ban VAT LY — gui chinh WAL
     → moi thay doi index cung phai gui
     → mot UPDATE dung 12 index = luu luong nhan ban lon

   MYSQL: nhan ban qua BINLOG LOGIC
     → gui "UPDATE t SET x=1 WHERE id=5" (hoac anh hang)
     → replica TU TINH LAI index cua no
     → luu luong nho hon nhieu
```

Với Uber chạy nhân bản xuyên trung tâm dữ liệu, khác biệt băng thông này rất tốn kém.

## Lý do 3 — Nâng cấp phiên bản

```text
   Nhan ban VAT LY doi hai ben CUNG PHIEN BAN PostgreSQL.
   → nang cap phai dung dich vu, hoac dung cong cu ngoai (pglogical)

   Nhan ban LOGIC cua MySQL cho phep binlog di qua giua cac phien ban
   → nang cap cuon chieu, khong dung dich vu
```

> **Cập nhật quan trọng:** PostgreSQL đã có **nhân bản logic** từ phiên bản 10 (2017) — sau bài viết của Uber. Điều này giải quyết được lý do 3, và giảm nhẹ lý do 2. Đọc bài viết của Uber mà không biết điều này sẽ ra kết luận sai.

## Lý do 4 — Kết nối tốn kém

```text
   PostgreSQL: mot TIEN TRINH moi ket noi (~5-10 MB)
   MySQL     : mot LUONG moi ket noi (~256 KB - 1 MB)

   → o quy mo Uber, chenh lech nay rat lon
```

Điều này vẫn đúng đến nay. Cách giảm nhẹ là PgBouncer, và Uber có dùng — nhưng nó thêm một tầng phải vận hành.

## Phía ngược lại

Bài viết của Uber bị phản biện nhiều, và các phản biện cũng có lý:

```text
   • Ho dung PostgreSQL 9.2 — mot phien ban DA CU vao thoi diem do
   • Nhieu van de da duoc giai quyet o cac phien ban sau
   • Ho khong tan dung `fillfactor` va HOT update
   • Mot so van de xuat phat tu MO HINH DU LIEU cua ho,
     khong phai tu PostgreSQL
   • Nhan ban logic (PG10) da xoa bo ly do 3
```

## Bài học đúng cần rút ra

```text
   ❌ "MySQL tot hon PostgreSQL"
   ❌ "PostgreSQL tot hon MySQL"

   ✔  MOI DAC TINH KIEN TRUC LA MOT DANH DOI, va no CO LOI hay CO HAI
      tuy vao TAI CUA BAN.

   Index PostgreSQL tro toi ctid:
     → CO HAI voi tai UPDATE nhieu, nhieu index
     → CO LOI khi doc: KHONG can tra khoa chinh lan thu hai

   Index InnoDB tro toi primary key:
     → CO LOI voi tai UPDATE nhieu
     → CO HAI khi doc qua index phu (ba chang), va phinh theo kich thuoc PK
```

## Bảng đối chiếu cập nhật (2026)

| Đặc tính | PostgreSQL | MySQL InnoDB |
|---|---|---|
| Mô hình MVCC | Nhiều phiên bản trong bảng | Sửa tại chỗ + undo log |
| Index phụ trỏ tới | `ctid` (vị trí vật lý) | Primary key |
| `UPDATE` đụng index | **Mọi index** (trừ HOT) | Chỉ index của cột bị đổi |
| Đọc qua index phụ | 2 chặng | **3 chặng** |
| Dọn rác | `VACUUM` trên bảng | *purge* trên undo log |
| Nhân bản | Vật lý **và** logic (từ PG10) | Logic (binlog) |
| Mỗi kết nối | Tiến trình (~5-10 MB) | **Luồng (~256 KB-1 MB)** |
| Kiểu dữ liệu, index | **Phong phú hơn nhiều** (GIN, GiST, BRIN, PostGIS) | Cơ bản |
| Truy vấn phức tạp | **Mạnh hơn** (CTE, window, LATERAL) | Đã cải thiện nhiều ở 8.0 |
| Đổi engine | Không | **Được** |

## Chọn cái nào

```text
   NGHIENG VE POSTGRESQL:
     ✔ Truy van phuc tap, phan tich, bao cao
     ✔ Can kieu du lieu dac biet (jsonb, mang, dia ly, vector)
     ✔ Can index dac biet (GIN, BRIN, partial, bieu thuc)
     ✔ Can rang buoc chat che, tinh dung dan la uu tien
     ✔ Ti le doc/ghi nghieng ve doc

   NGHIENG VE MYSQL:
     ✔ Tai UPDATE cuc nhieu tren bang nhieu index
     ✔ Rat nhieu ket noi (mo hinh luong re hon)
     ✔ Truy van chu yeu don gian theo khoa chinh
     ✔ Doi da co san chuyen mon MySQL
     ✔ Can doi storage engine (MyRocks cho tai ghi nang)

   THUC TE: voi 95% ung dung, CA HAI DEU DU TOT.
            Chuyen mon cua doi quan trong hon lua chon san pham.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| UUID v4 làm khoá chính | Chèn chậm 3,7 lần, index lớn 2,1 lần; InnoDB còn tệ hơn | UUID v7 hoặc `BIGINT` |
| Lưu UUID bằng `CHAR(36)` | Lãng phí 20 byte, **nhân lên trong mọi index phụ** | `UUID` (PG) / `BINARY(16)` (MySQL) |
| Đọc bài Uber 2016 rồi kết luận cho 2026 | Nhân bản logic (PG10) đã xoá bỏ một lý do chính | Kiểm tra thời điểm và phiên bản trong mọi so sánh |
| Chọn hệ theo bài blog | Đặc tính là **đánh đổi**, có lợi hay có hại tuỳ tải của bạn | Đo trên tải thật của mình |
| Bỏ qua `fillfactor` khi bảng cập nhật nhiều | Tỉ lệ HOT thấp → mọi `UPDATE` đụng mọi index | `fillfactor = 80` cho bảng ghi nhiều |
| Nghĩ phải chọn giữa hiệu năng và không lộ thông tin | Có mẫu tách đôi | `id` kỹ thuật + `public_id` đối ngoại |

## Tóm tắt bài 3

- Lý do muốn UUID đều chính đáng; vấn đề chỉ nằm ở **v4 — ngẫu nhiên hoàn toàn**.
- Đo thật trên PostgreSQL: **UUID v4 chèn chậm hơn 3,7 lần, index lớn hơn 2,1 lần**; **UUID v7 chỉ chậm hơn 1,2 lần**. Cột `correlation` là bằng chứng trực tiếp: v4 = 0,002, v7 = 0,998.
- Trên **InnoDB hậu quả nhân đôi** vì bảng cũng sắp theo primary key — tách page kéo theo cả dữ liệu, và index phụ phình theo kích thước khoá.
- Bài học từ Shopify: **"khoá ngẫu nhiên trong cấu trúc sắp xếp thì đắt"**, không phải "UUID xấu". **UUID v7 (RFC 9562, 2024)** là lựa chọn mặc định hiện nay.
- Bốn lý do Uber chuyển sang MySQL: khuếch đại ghi qua index · nhân bản vật lý tốn băng thông · nâng cấp phiên bản phải dừng dịch vụ · kết nối tốn kém. **Nhân bản logic của PostgreSQL 10 đã xoá bỏ lý do thứ ba** — đọc bài đó mà không biết điều này sẽ ra kết luận sai.
- Bài học đúng: **mỗi đặc tính kiến trúc là một đánh đổi**. Index trỏ `ctid` có hại khi `UPDATE` nhiều nhưng có lợi khi đọc; index trỏ primary key thì ngược lại.
- Với **95% ứng dụng, cả hai đều đủ tốt** — chuyên môn của đội quan trọng hơn lựa chọn sản phẩm.

**Bài kế tiếp** → [Bài 4: QUIC Protocol cho Database và Distributed Transaction](03-quic-va-distributed-transaction.md)

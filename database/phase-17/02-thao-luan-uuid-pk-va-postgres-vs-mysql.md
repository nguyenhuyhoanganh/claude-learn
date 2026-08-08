# Bài 3: Thảo luận — UUID làm Primary Key, và câu chuyện Uber

Hai câu chuyện thật trong bài này, và cả hai đều dạy cùng một bài học: **quyết định tưởng nhỏ ở tầng lưu trữ có thể quyết định kiến trúc của cả công ty**.

---

# Phần I — Shopify và UUID

## Vì sao người ta muốn UUID

```text
   ✔ Sinh được ở CLIENT, không cần hỏi database
   ✔ Sinh được ở NHIỀU MÁY mà không đụng nhau
   ✔ Không lộ quy mô kinh doanh
     (id=1.245.883 cho đối thủ biết bạn đã xử lý bao nhiêu đơn)
   ✔ Ghép dữ liệu từ nhiều hệ thống không sợ trùng
   ✔ Đoán không được → không duyệt được dữ liệu người khác
```

Toàn là lý do chính đáng. Vấn đề nằm ở **UUID v4** — biến thể ngẫu nhiên hoàn toàn.

## Vì sao ngẫu nhiên lại đắt

Nhắc lại cơ chế từ [phase-4 bài 4](../phase-4/04-bloom-filter-va-uuid-performance.md), nhìn từ góc khác:

```text
   KHOÁ TĂNG DẦN                        UUID v4
   ══════════════                       ═══════
   Chèn 1001, 1002, 1003...             Chèn f47ac1..., 550e84..., 6ba7b8...
   → tất cả vào PAGE CUỐI               → mỗi cái vào MỘT PAGE NGẪU NHIÊN

   ┌───┬───┬───┬───┬███┐                ┌███┬───┬███┬───┬███┐
   └───┴───┴───┴───┴───┘                └───┴───┴───┴───┴───┘
     1 page nóng, luôn trong RAM          page nóng RẢI KHẮP NƠI

   → 0 lần đọc đĩa trước khi ghi        → phải ĐỌC page đó lên trước
                                          (index 20 GB, RAM 4 GB
                                           → 80% khả năng không có trong cache)
```

Và trên InnoDB, hậu quả nhân đôi vì **bảng cũng được sắp theo primary key**:

```text
   POSTGRESQL (heap)         INNODB (clustered)
   ═════════════════         ══════════════════
   Bảng: nhét vào chỗ trống   Bảng: PHẢI chèn đúng vị trí thứ tự
         → không tách page          → TÁCH PAGE
   Index PK: tách page        Clustered index CHÍNH LÀ bảng
                                    → tách page kéo theo CẢ DỮ LIỆU
                              Index phụ: chứa CẢ UUID (16-36 byte)
                                    → phình theo
```

## Con số đo được

Thí nghiệm trên PostgreSQL, 3 triệu dòng:

```text
   ┌──────────────┬────────────┬──────────┬─────────────────┐
   │              │ Thời gian  │  Index   │ Tương quan      │
   ├──────────────┼────────────┼──────────┼─────────────────┤
   │ BIGINT       │    9,2 s   │   64 MB  │  1,000          │
   │ UUID v4      │   34,1 s   │  133 MB  │  0,002          │
   │ UUID v7      │   10,8 s   │   71 MB  │  0,998          │
   └──────────────┴────────────┴──────────┴─────────────────┘

   UUID v4 vs BIGINT :  chậm hơn 3,7 lần, index lớn hơn 2,1 lần
   UUID v7 vs BIGINT :  chậm hơn 1,2 lần, index lớn hơn 1,1 lần
```

Cột `tương quan` (từ `pg_stats.correlation`) là bằng chứng trực tiếp: v4 hoàn toàn ngẫu nhiên (0,002), v7 gần như hoàn hảo (0,998).

## Shopify chuyển sang ULID

Shopify gặp đúng vấn đề này ở quy mô lớn và chuyển từ UUID v4 sang **ULID** — định dạng có 48 bit đầu là timestamp mili-giây, phần còn lại ngẫu nhiên.

```text
   ULID:  01ARZ3NDEKTSV4RRFFQ69G5FAV
          └────┬────┘└──────┬───────┘
          48 bit thời gian  80 bit ngẫu nhiên

   → TĂNG DẦN theo thời gian → chèn vào page cuối
   → VẪN phân tán → sinh được ở nhiều máy
   → Mã hoá Base32 → đọc được, không có ký tự dễ nhầm (I, L, O, U)
```

Cách đọc bài học này cho đúng:

```text
   ❌ "UUID xấu, đừng dùng"
   ✔  "KHOÁ NGẪU NHIÊN trong CẤU TRÚC SẮP XẾP thì đắt"

   → Vẫn dùng được định danh phân tán.
   → Chỉ cần chọn loại TĂNG DẦN THEO THỜI GIAN.
```

## UUID v7 — lựa chọn mặc định hiện nay

Chuẩn hoá chính thức trong **RFC 9562 (2024)**:

```text
   UUID v7:  0190a4f2-8c3d-7abc-9def-0123456789ab
             └─────┬─────┘ ▲
             48 bit ms     └ phiên bản 7
```

```sql
-- PostgreSQL 18 có sẵn
CREATE TABLE orders (id UUID PRIMARY KEY DEFAULT uuidv7());

-- Bản cũ hơn: extension
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

   TRÊN INNODB, 20 byte lãng phí bị NHÂN LÊN trong MỌI INDEX PHỤ:

   Bảng 100 triệu dòng, 5 index phụ:
     BINARY(16) :  100tr × 16 × 6 =  9,6 GB
     CHAR(36)   :  100tr × 36 × 6 = 21,6 GB
                                     ─────────
                              THÊM 12 GB tranh chỗ trong buffer pool
```

```sql
-- MySQL 8: chuyển đổi kèm sắp xếp lại byte
INSERT INTO t (id) VALUES (UUID_TO_BIN(UUID(), 1));
SELECT BIN_TO_UUID(id, 1) FROM t;
--                     ▲ tham số 1 = đảo byte thời gian lên đầu (cho UUID v1)
```

## Mẫu tách đôi

Khi cần cả hiệu năng lẫn định danh không đoán được:

```sql
CREATE TABLE orders (
    id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- kỹ thuật
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE     -- đối ngoại
);
```

```text
   `id`        → khoá ngoại, JOIN, index — nhỏ và nhanh
   `public_id` → URL, API, tích hợp — không lộ quy mô

   ✔ Được cả hai
   ✘ Tốn thêm một cột và một index UNIQUE
   ✘ Phải nhớ dùng đúng cái nào ở đúng chỗ
```

---

# Phần II — Vì sao Uber chuyển từ PostgreSQL sang MySQL

Năm 2016 Uber công bố bài viết gây tranh cãi lớn về việc họ chuyển từ PostgreSQL sang MySQL. Đây là ca nghiên cứu tốt vì nó cho thấy **cùng một đặc tính vừa là điểm mạnh vừa là điểm yếu, tuỳ tải**.

## Lý do 1 — Khuếch đại ghi qua index

```text
   POSTGRESQL:  mọi index trỏ tới `ctid` (vị trí vật lý).
                UPDATE tạo phiên bản mới → ctid đổi
                → PHẢI cập nhật MỌI INDEX
                → kể cả index trên cột KHÔNG THAY ĐỔI

   MYSQL INNODB: index phụ trỏ tới PRIMARY KEY (không đổi).
                 UPDATE một cột không được đánh index
                 → KHÔNG đụng index phụ nào
```

```text
   Bảng của Uber: 12 index, cập nhật rất thường xuyên
     PostgreSQL: 1 lệnh UPDATE → đụng 12 index
     MySQL     : 1 lệnh UPDATE → đụng 0 index (nếu cột đó không có index)
```

**Nhưng**: PostgreSQL có **HOT update** giảm nhẹ chuyện này. Điều kiện là phiên bản mới nằm cùng page **và** không cột nào được đánh index bị đổi. Với `fillfactor` mặc định 100 và bảng cập nhật nhiều, tỉ lệ HOT thường thấp.

## Lý do 2 — Nhân bản gửi thay đổi vật lý

```text
   POSTGRESQL: nhân bản VẬT LÝ — gửi chính WAL
     → mọi thay đổi index cũng phải gửi
     → một UPDATE đụng 12 index = lưu lượng nhân bản lớn

   MYSQL: nhân bản qua BINLOG LOGIC
     → gửi "UPDATE t SET x=1 WHERE id=5" (hoặc ảnh hàng)
     → replica TỰ TÍNH LẠI index của nó
     → lưu lượng nhỏ hơn nhiều
```

Với Uber chạy nhân bản xuyên trung tâm dữ liệu, khác biệt băng thông này rất tốn kém.

## Lý do 3 — Nâng cấp phiên bản

```text
   Nhân bản VẬT LÝ đòi hai bên CÙNG PHIÊN BẢN PostgreSQL.
   → nâng cấp phải dừng dịch vụ, hoặc dùng công cụ ngoài (pglogical)

   Nhân bản LOGIC của MySQL cho phép binlog đi qua giữa các phiên bản
   → nâng cấp cuốn chiếu, không dừng dịch vụ
```

> **Cập nhật quan trọng:** PostgreSQL đã có **nhân bản logic** từ phiên bản 10 (2017) — sau bài viết của Uber. Điều này giải quyết được lý do 3, và giảm nhẹ lý do 2. Đọc bài viết của Uber mà không biết điều này sẽ ra kết luận sai.

## Lý do 4 — Kết nối tốn kém

```text
   PostgreSQL: một TIẾN TRÌNH mỗi kết nối (~5-10 MB)
   MySQL     : một LUỒNG mỗi kết nối (~256 KB - 1 MB)

   → ở quy mô Uber, chênh lệch này rất lớn
```

Điều này vẫn đúng đến nay. Cách giảm nhẹ là PgBouncer, và Uber có dùng — nhưng nó thêm một tầng phải vận hành.

## Phía ngược lại

Bài viết của Uber bị phản biện nhiều, và các phản biện cũng có lý:

```text
   • Họ dùng PostgreSQL 9.2 — một phiên bản ĐÃ CŨ vào thời điểm đó
   • Nhiều vấn đề đã được giải quyết ở các phiên bản sau
   • Họ không tận dụng `fillfactor` và HOT update
   • Một số vấn đề xuất phát từ MÔ HÌNH DỮ LIỆU của họ,
     không phải từ PostgreSQL
   • Nhân bản logic (PG10) đã xoá bỏ lý do 3
```

## Bài học đúng cần rút ra

```text
   ❌ "MySQL tốt hơn PostgreSQL"
   ❌ "PostgreSQL tốt hơn MySQL"

   ✔  MỖI ĐẶC TÍNH KIẾN TRÚC LÀ MỘT ĐÁNH ĐỔI, và nó CÓ LỢI hay CÓ HẠI
      tuỳ vào TẢI CỦA BẠN.

   Index PostgreSQL trỏ tới ctid:
     → CÓ HẠI với tải UPDATE nhiều, nhiều index
     → CÓ LỢI khi đọc: KHÔNG cần tra khoá chính lần thứ hai

   Index InnoDB trỏ tới primary key:
     → CÓ LỢI với tải UPDATE nhiều
     → CÓ HẠI khi đọc qua index phụ (ba chặng), và phình theo kích thước PK
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
     ✔ Truy vấn phức tạp, phân tích, báo cáo
     ✔ Cần kiểu dữ liệu đặc biệt (jsonb, mảng, địa lý, vector)
     ✔ Cần index đặc biệt (GIN, BRIN, partial, biểu thức)
     ✔ Cần ràng buộc chặt chẽ, tính đúng đắn là ưu tiên
     ✔ Tỉ lệ đọc/ghi nghiêng về đọc

   NGHIENG VE MYSQL:
     ✔ Tải UPDATE cực nhiều trên bảng nhiều index
     ✔ Rất nhiều kết nối (mô hình luồng rẻ hơn)
     ✔ Truy vấn chủ yếu đơn giản theo khoá chính
     ✔ Đội đã có sẵn chuyên môn MySQL
     ✔ Cần đổi storage engine (MyRocks cho tải ghi nặng)

   THỰC TẾ: với 95% ứng dụng, CẢ HAI ĐỀU ĐỦ TỐT.
            Chuyên môn của đội quan trọng hơn lựa chọn sản phẩm.
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

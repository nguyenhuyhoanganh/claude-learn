# Bài 1: Database Partitioning — xoá 200 triệu dòng trong 40 mili-giây

Bảng `events` có 2 tỷ dòng. Chính sách lưu trữ: giữ 90 ngày. Mỗi đêm phải xoá dữ liệu quá hạn.

```sql
DELETE FROM events WHERE created_at < now() - interval '90 days';
```

Câu này xoá khoảng **200 triệu dòng**. Chuyện xảy ra:

```text
   • Chạy 6 tiếng 20 phút
   • Sinh ~40 GB WAL → đầy đĩa, replica tụt lại phía sau
   • Giữ khoá trên 200 triệu dòng → mọi truy vấn khác chậm dần
   • Xong rồi bảng VẪN chiếm nguyên dung lượng (DELETE không thu hồi đĩa)
   • autovacuum phải dọn 200 triệu tuple chết → thêm nhiều giờ nữa
```

Nếu bảng được **phân mảnh theo ngày**, việc đó thành:

```sql
DROP TABLE events_2025_11;
```

```text
   Time: 42.118 ms
```

**Sáu tiếng hai mươi phút xuống bốn mươi hai mili-giây.** Không WAL, không khoá, không rác, và đĩa được trả lại ngay lập tức.

Bài này là về kỹ thuật đó, và về những cái bẫy khiến nhiều đội triển khai xong lại chậm hơn trước.

## Partitioning là gì

**Partitioning** (phân mảnh) là chia **một bảng logic** thành **nhiều bảng vật lý** nhỏ hơn, nhưng **vẫn trong cùng một database**.

```text
   TRƯỚC — MỘT BẢNG                     SAU — MỘT BẢNG LOGIC, NHIỀU BẢNG VẬT LÝ

   ┌───────────────────┐                ┌───────────────────┐
   │                   │                │  events (rỗng)    │ ← bảng "cha", chỉ là
   │                   │                └─────────┬─────────┘   khai báo, không chứa
   │     events        │                          │              dữ liệu
   │   2 tỷ dòng       │          ┌───────────────┼───────────────┐
   │    650 GB         │          ▼               ▼               ▼
   │                   │   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │                   │   │events_2026 │  │events_2026 │  │events_2026 │
   └───────────────────┘   │   _06      │  │   _07      │  │   _08      │
                           │  60 tỷ.. GB│  │            │  │            │
                           └────────────┘  └────────────┘  └────────────┘

   Ứng dụng vẫn viết:  SELECT * FROM events WHERE ...
   Database tự quyết định đụng vào bảng con nào.
```

Điểm mấu chốt: **ứng dụng không cần biết gì cả**. Nó vẫn truy vấn bảng `events`. Đây là khác biệt lớn nhất so với sharding.

## Ngang và dọc

### Phân mảnh ngang (horizontal) — chia theo DÒNG

Đây là thứ mọi người nói tới khi nói "partitioning".

```text
   ┌────────────────────────────────┐
   │ id │ name │ city   │ created   │
   ├────┼──────┼────────┼───────────┤
   │  1 │ An   │ Ha Noi │ 2026-06-01│  ┐
   │  2 │ Binh │ HCM    │ 2026-06-15│  ├─ mảnh THÁNG 6
   │  3 │ Chi  │ Da Nang│ 2026-06-28│  ┘
   ├────┼──────┼────────┼───────────┤ ← LÁT CẮT NGANG
   │  4 │ Dung │ Ha Noi │ 2026-07-02│  ┐
   │  5 │ Em   │ HCM    │ 2026-07-19│  ├─ mảnh THÁNG 7
   └────┴──────┴────────┴───────────┘  ┘
```

### Phân mảnh dọc (vertical) — chia theo CỘT

```text
   ┌────┬──────┬────────┬───────────────────────────┐
   │ id │ name │ city   │  avatar (BLOB 2 MB)       │
   ├────┼──────┼────────┼───────────────────────────┤
   │  1 │ An   │ Ha Noi │  <2 MB dữ liệu ảnh>       │
   └────┴──────┴────────┴───────────────────────────┘
                        ▲
                     LÁT CẮT DỌC

   → BẢNG NÓNG: users(id, name, city)         — nhỏ, nhiều dòng mỗi page
   → BẢNG LẠNH: user_avatars(user_id, avatar) — to, hiếm khi đọc
```

Vì sao có tác dụng: cột nặng làm **giảm số dòng vừa một page**. Tách nó ra khiến bảng nóng gọn lại, và mọi truy vấn danh sách đọc ít page hơn hẳn — như đã tính ở [phase-3 bài 2](../phase-3/02-row-based-vs-column-based.md).

> PostgreSQL đã tự làm một phần bằng **TOAST** (giá trị > ~2 KB tự đẩy sang bảng phụ). Nhưng tách tay vẫn hơn khi bạn biết rõ cột nào hiếm dùng.

Phần còn lại của bài chỉ nói về **phân mảnh ngang**.

---

## Ba kiểu phân mảnh ngang

### RANGE — theo khoảng

```sql
PARTITION BY RANGE (created_at)
```

```text
   events_2026_06  →  từ 2026-06-01 tới 2026-07-01
   events_2026_07  →  từ 2026-07-01 tới 2026-08-01
   events_2026_08  →  từ 2026-08-01 tới 2026-09-01
```

**Dùng khi:** dữ liệu chuỗi thời gian, nhật ký, giao dịch, đo lường. Đây là kiểu phổ biến nhất — chiếm khoảng 80% trường hợp thực tế.

### LIST — theo danh sách giá trị

```sql
PARTITION BY LIST (region)
```

```text
   customers_north   →  ('ha_noi', 'hai_phong', 'quang_ninh')
   customers_central →  ('da_nang', 'hue', 'nha_trang')
   customers_south   →  ('hcm', 'can_tho', 'vung_tau')
```

**Dùng khi:** giá trị rời rạc, số lượng ít và ổn định — vùng miền, quốc gia, loại sản phẩm, mã khách hàng lớn.

### HASH — theo hàm băm

```sql
PARTITION BY HASH (user_id)
```

```text
   users_p0  →  hash(user_id) % 4 = 0
   users_p1  →  hash(user_id) % 4 = 1
   users_p2  →  hash(user_id) % 4 = 2
   users_p3  →  hash(user_id) % 4 = 3
```

**Dùng khi:** chỉ cần **chia đều** để giảm kích thước mỗi mảnh và giảm tranh chấp, không có tiêu chí nghiệp vụ nào.

**Nhược điểm lớn:** mất hẳn khả năng "xoá cả mảnh cũ" — vì không mảnh nào là "cũ". Và **đổi số mảnh thì phải phân bố lại toàn bộ dữ liệu**.

### Phân mảnh lồng nhau

Kết hợp được:

```sql
PARTITION BY RANGE (created_at)           -- cấp 1: theo tháng
  → mỗi mảnh tháng lại PARTITION BY HASH (user_id)   -- cấp 2: chia 4
```

Rất mạnh nhưng cũng rất dễ mất kiểm soát: 24 tháng × 4 = **96 bảng vật lý**. Xem phần "quá nhiều mảnh" ở dưới.

### Bảng chọn kiểu

| Kiểu | Dùng khi | Xoá dữ liệu cũ | Chia đều |
|---|---|---|---|
| **RANGE** | Chuỗi thời gian, khoảng số | **Rất dễ** (`DROP` mảnh) | Không đảm bảo |
| **LIST** | Giá trị rời rạc, ít, ổn định | Dễ nếu theo nhóm | Không đảm bảo |
| **HASH** | Chỉ cần chia nhỏ đều | **Không làm được** | **Rất đều** |

---

## Lợi ích số một: cắt tỉa mảnh (partition pruning)

Đây là nguồn gốc của phần lớn lợi ích về hiệu năng.

```text
   TRUY VẤN:  SELECT * FROM events WHERE created_at >= '2026-08-01';

   KHÔNG PHÂN MẢNH                    CÓ PHÂN MẢNH THEO THÁNG
   ═══════════════                    ════════════════════════
   quét 2 tỷ dòng                     Planner đọc điều kiện:
   đọc 650 GB                           "created_at >= 2026-08-01"
                                      → events_2026_06? loại   ✘ khỏi đụng
                                      → events_2026_07? loại   ✘ khỏi đụng
                                      → events_2026_08? GIỮ    ✔
                                      → chỉ quét 1 mảnh, 60 triệu dòng
                                        đọc 20 GB

                                      → ĐỌC ÍT HƠN 32 LẦN
```

Kiểm chứng bằng `EXPLAIN`:

```sql
EXPLAIN SELECT count(*) FROM events WHERE created_at >= '2026-08-01';
```

```text
Aggregate  (cost=1284221.11..1284221.12 rows=1 width=8)
  ->  Seq Scan on events_2026_08 events   ← CHỈ MỘT bảng con xuất hiện
        Filter: (created_at >= '2026-08-01'::date)
```

Không thấy `events_2026_06` và `events_2026_07` trong kế hoạch — chúng đã bị **cắt tỉa**.

Bây giờ bỏ điều kiện phân mảnh:

```sql
EXPLAIN SELECT count(*) FROM events WHERE user_id = 42;
```

```text
Aggregate
  ->  Append
        ->  Seq Scan on events_2026_06 events_1     ← QUÉT
        ->  Seq Scan on events_2026_07 events_2     ← QUÉT
        ->  Seq Scan on events_2026_08 events_3     ← QUÉT
        ... (mọi mảnh)
```

**Không có điều kiện trên cột phân mảnh thì không cắt tỉa được** — và bây giờ bạn quét **mọi** bảng con. Đây là cái bẫy số một, sẽ nói kỹ ở dưới.

---

## Partitioning khác Sharding chỗ nào

Hai từ nghe giống nhau và bị nhầm rất nhiều. Đây là câu hỏi phỏng vấn loại ứng viên rất hiệu quả.

```text
   PARTITIONING                          SHARDING
   ════════════                          ════════
   ┌─────────────────────────┐           ┌──────────┐  ┌──────────┐  ┌──────────┐
   │   MỘT máy chủ database  │           │ MÁY 1    │  │ MÁY 2    │  │ MÁY 3    │
   │  ┌──────┐┌──────┐┌────┐ │           │ ┌──────┐ │  │ ┌──────┐ │  │ ┌──────┐ │
   │  │mảnh 1││mảnh 2││... │ │           │ │users │ │  │ │users │ │  │ │users │ │
   │  └──────┘└──────┘└────┘ │           │ └──────┘ │  │ └──────┘ │  │ └──────┘ │
   └─────────────────────────┘           └──────────┘  └──────────┘  └──────────┘
                                          A-H            I-P            Q-Z
```

| | Partitioning | Sharding |
|---|---|---|
| Số máy chủ | **Một** | **Nhiều** |
| Ứng dụng có biết không | **Không** — hoàn toàn trong suốt | **Có** — phải biết dữ liệu ở máy nào |
| Tên bảng khi truy vấn | Vẫn tên bảng cha | Cùng tên, khác máy |
| Ai định tuyến | **Database** | **Ứng dụng** (hoặc lớp proxy) |
| `JOIN` xuyên mảnh | **Được** | Rất khó hoặc không được |
| Transaction xuyên mảnh | **Được, ACID đầy đủ** | Rất khó (cần 2PC) |
| `UNIQUE` toàn cục | **Được** (nếu chứa khoá phân mảnh) | Không |
| Giải quyết vấn đề | Bảng **quá lớn** | **Toàn bộ máy** quá tải |
| Độ khó triển khai | Vừa | **Rất cao** |
| Quay đầu được không | Được | Gần như không |

Quy tắc thực dụng:

> **Partitioning giải quyết vấn đề "bảng quá to". Sharding giải quyết vấn đề "một máy không đủ".**
>
> Nếu máy chủ còn chịu được tải mà chỉ có một bảng quá to → **partitioning**.
> Chỉ khi cả máy chủ đã hết sức mới tính tới sharding.

Đây là nấc 8 và nấc 10 trên "thang scale" ở [phase-1 bài 1](../phase-1/01-gioi-thieu-khoa-hoc.md), và khoảng cách chi phí giữa chúng rất lớn.

---

## Bốn lợi ích của partitioning

### 1. Truy vấn nhanh hơn nhờ cắt tỉa

Đã nói ở trên. Nhưng có một sắc thái quan trọng:

> Nếu bảng của bạn **nằm gọn trong RAM**, partitioning gần như **không** giúp gì về tốc độ.
>
> Lợi ích chỉ xuất hiện khi bạn đã bị giới hạn bởi **I/O** hoặc bởi **RAM**.

Đây là lý do nhiều đội triển khai partitioning trên bảng 50 GB với máy 128 GB RAM rồi thất vọng vì không nhanh lên. Bảng đã ở trong cache sẵn rồi.

### 2. Bảo trì theo từng mảnh

Đây là lợi ích **bị đánh giá thấp nhất**, và thường quan trọng hơn tốc độ truy vấn:

```text
   BẢNG 650 GB KHÔNG PHÂN MẢNH        MỖI MẢNH 20 GB
   ══════════════════════════════      ═══════════════
   VACUUM       → nhiều giờ            → vài phút mỗi mảnh
   REINDEX      → nhiều giờ, cần       → vài phút, cần 20 GB đĩa trống
                  650 GB đĩa trống
   ANALYZE      → chậm, mẫu thô        → nhanh, thống kê CHÍNH XÁC HƠN
                                          cho từng mảnh
   Sao lưu      → phải làm cả bảng     → sao lưu mảnh mới, mảnh cũ chỉ 1 lần
```

Dòng `ANALYZE` đáng chú ý: thống kê theo từng mảnh **chính xác hơn** thống kê chung, nên planner ra quyết định tốt hơn — một lợi ích gián tiếp ít ai để ý.

### 3. Xoá dữ liệu cũ tức thì

Chính là ví dụ mở đầu bài. So sánh đầy đủ:

| | `DELETE` 200 triệu dòng | `DROP TABLE` một mảnh |
|---|---|---|
| Thời gian | Hàng giờ | **Mili-giây** |
| WAL sinh ra | Hàng chục GB | **Gần như không** |
| Khoá | Trên 200 triệu dòng | Khoá ngắn trên bảng cha |
| Rác cần dọn | 200 triệu tuple chết | **Không có** |
| Đĩa được trả lại | Không (cần `VACUUM FULL`) | **Ngay lập tức** |

Nếu hệ thống của bạn có chính sách lưu trữ theo thời gian, **chỉ riêng lợi ích này đã đủ để đi partitioning**.

### 4. Nạp và tách dữ liệu hàng loạt

```sql
-- Nạp dữ liệu vào một bảng thường (nhanh, không đụng bảng đang chạy)
CREATE TABLE events_2026_09 (LIKE events INCLUDING ALL);
COPY events_2026_09 FROM '/data/september.csv' CSV;
CREATE INDEX ON events_2026_09 (user_id);
ANALYZE events_2026_09;

-- Rồi GẮN vào, gần như tức thì
ALTER TABLE events ATTACH PARTITION events_2026_09
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
```

Và ngược lại — **tách** một mảnh ra để đưa sang lưu trữ rẻ:

```sql
ALTER TABLE events DETACH PARTITION events_2026_06;
-- Bây giờ events_2026_06 là bảng độc lập: xuất ra file, chuyển tablespace,
-- hoặc chuyển sang máy khác.
```

Cho phép chiến lược lưu trữ phân tầng:

```text
   Mảnh 3 tháng gần nhất  →  tablespace trên NVMe (đắt, nhanh)
   Mảnh 3-12 tháng        →  tablespace trên HDD  (rẻ, chậm)
   Mảnh trên 12 tháng     →  xuất ra Parquet trên object storage
```

---

## Năm nhược điểm

### 1. Truy vấn không có khoá phân mảnh thì quét mọi mảnh

Đây là cái bẫy làm nhiều hệ thống **chậm hơn sau khi phân mảnh**:

```text
   TRƯỚC:  SELECT * FROM events WHERE user_id = 42;
           → 1 lần tra index trên bảng 2 tỷ dòng
           → ~4 lần I/O

   SAU (phân mảnh 24 tháng):
           → 24 lần tra index, mỗi bảng con một lần
           → ~96 lần I/O, cộng chi phí hợp kết quả
           → CHẬM HƠN
```

Cách phòng: **thiết kế khoá phân mảnh theo truy vấn thật**, không theo trực giác. Nếu 90% truy vấn lọc theo `user_id` chứ không theo thời gian, thì phân mảnh theo thời gian là quyết định sai.

### 2. `UPDATE` làm dòng chuyển mảnh rất đắt

```sql
UPDATE events SET created_at = '2026-09-15' WHERE id = 12345;
-- dòng này đang ở mảnh tháng 8, giờ phải sang mảnh tháng 9
```

PostgreSQL biến nó thành **`DELETE` ở mảnh cũ + `INSERT` ở mảnh mới**. Nghĩa là:

```text
   • Ghi WAL cho cả hai thao tác
   • Cập nhật index của cả hai mảnh
   • Sinh một tuple chết ở mảnh cũ
   • Chậm hơn UPDATE thường nhiều lần
```

Nguyên tắc: **chọn khoá phân mảnh là thứ không bao giờ thay đổi.** `created_at` tốt (không ai đổi ngày tạo). `status` thì rất tệ.

### 3. Ràng buộc duy nhất phải chứa khoá phân mảnh

```sql
-- SAI — PostgreSQL từ chối
CREATE TABLE events (
    id         BIGSERIAL PRIMARY KEY,       -- ✘
    created_at DATE NOT NULL
) PARTITION BY RANGE (created_at);
```

```text
ERROR:  unique constraint on partitioned table must include all partitioning columns
DETAIL:  PRIMARY KEY constraint on table "events" lacks column "created_at"
```

```sql
-- ĐÚNG
CREATE TABLE events (
    id         BIGSERIAL,
    created_at DATE NOT NULL,
    PRIMARY KEY (id, created_at)            -- ✔ có chứa khoá phân mảnh
) PARTITION BY RANGE (created_at);
```

Vì sao có giới hạn này: index duy nhất chỉ tồn tại **trong từng mảnh**. Database không có cách nào rẻ để đảm bảo `id` không trùng **giữa các mảnh** — trừ khi khoá đó chứa luôn thông tin quyết định mảnh nào.

Hệ quả cần chấp nhận: **khoá chính của bảng phân mảnh luôn là khoá phức**, và khoá ngoại trỏ tới nó cũng phải phức theo.

### 4. Quá nhiều mảnh làm chậm việc lập kế hoạch

```text
   Mỗi mảnh là một bảng thật, có catalog riêng, thống kê riêng, khoá riêng.

   10 mảnh   →  thời gian lập kế hoạch tăng không đáng kể
   100 mảnh  →  bắt đầu thấy được
   1000 mảnh →  thời gian lập kế hoạch có thể LỚN HƠN thời gian chạy
   10000     →  vấn đề nghiêm trọng: khoá catalog, tốn RAM cho mỗi kết nối
```

Ngưỡng thực dụng: **giữ dưới ~100 mảnh** cho một bảng. Phân mảnh theo tháng giữ 5 năm = 60 mảnh — ổn. Phân mảnh theo ngày giữ 3 năm = 1.095 mảnh — có vấn đề.

Nếu cần độ chi tiết cao ở dữ liệu mới nhưng vẫn giữ dữ liệu cũ lâu: **phân mảnh theo ngày cho 30 ngày gần nhất, rồi gộp thành mảnh tháng cho phần cũ hơn**.

### 5. Thay đổi cấu trúc phức tạp hơn

PostgreSQL lan truyền phần lớn thay đổi từ bảng cha xuống các mảnh, nhưng không phải mọi thứ:

```text
   ADD COLUMN        → tự lan xuống mọi mảnh          ✔
   CREATE INDEX      → cần CONCURRENTLY thì phải làm
                       TỪNG MẢNH rồi ATTACH thủ công  ⚠
   ADD CONSTRAINT    → có thể phải kiểm tra mọi mảnh  ⚠
```

Tạo index trên bảng phân mảnh mà không chặn ghi cần quy trình riêng — chi tiết ở [bài 2](02-partitioning-thuc-hanh-postgres.md).

---

## Khi nào nên partitioning

| Dấu hiệu | Nên partitioning? |
|---|---|
| Bảng > 100 GB **và** máy không đủ RAM để cache | **Có** |
| Có chính sách xoá dữ liệu theo thời gian | **Có, rất đáng** |
| `VACUUM` / `REINDEX` chạy quá lâu không có cửa sổ bảo trì | **Có** |
| Phần lớn truy vấn lọc theo một cột thời gian | **Có** |
| Bảng lớn nhưng nằm gọn trong RAM | Không — sẽ không nhanh lên |
| Truy vấn lọc theo nhiều cột khác nhau, không có cột chung | Không — sẽ quét mọi mảnh |
| Cột định phân mảnh hay bị `UPDATE` | Không — mỗi lần đổi là chuyển mảnh |
| Bảng dưới 10 GB | Không — chưa cần, chỉ thêm phức tạp |

Ngưỡng thô để nhớ: **bắt đầu nghĩ tới partitioning ở khoảng 50-100 GB một bảng, hoặc khi cửa sổ bảo trì không còn đủ.**

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chọn khoá phân mảnh không xuất hiện trong truy vấn | Mọi truy vấn quét mọi mảnh → **chậm hơn trước** | Chọn theo `pg_stat_statements`, không theo trực giác |
| Phân mảnh theo cột hay bị `UPDATE` | Mỗi lần đổi = `DELETE` + `INSERT` xuyên mảnh | Chọn cột bất biến (`created_at`) |
| Tạo hàng nghìn mảnh | Thời gian lập kế hoạch vượt thời gian chạy | Giữ dưới ~100 mảnh; gộp mảnh cũ |
| Quên tạo mảnh cho kỳ tiếp theo | `INSERT` thất bại lúc nửa đêm | Tự động hoá bằng `pg_partman` hoặc job định kỳ + mảnh `DEFAULT` |
| Kỳ vọng nhanh lên khi bảng đã nằm trong RAM | Không có lợi ích tốc độ | Chỉ partitioning khi bị giới hạn I/O hoặc RAM |
| Nhầm partitioning với sharding | Kỳ vọng sai về khả năng scale | Partitioning = một máy; sharding = nhiều máy |
| Không tính chi phí khoá chính phức | Mọi khoá ngoại trỏ tới cũng phải phức | Thiết kế mô hình dữ liệu từ đầu với ràng buộc này |

## Tóm tắt bài 1

- **Partitioning** chia một bảng logic thành nhiều bảng vật lý **trong cùng một database** — hoàn toàn trong suốt với ứng dụng.
- Ba kiểu: **RANGE** (thời gian, khoảng — phổ biến nhất), **LIST** (giá trị rời rạc), **HASH** (chia đều, nhưng mất khả năng xoá mảnh cũ).
- Lợi ích lớn nhất về tốc độ đến từ **cắt tỉa mảnh** — nhưng chỉ có tác dụng khi truy vấn **có điều kiện trên cột phân mảnh**.
- Lợi ích **bị đánh giá thấp nhất** là bảo trì theo từng mảnh: `VACUUM`, `REINDEX`, `ANALYZE`, sao lưu đều gọn lại; và thống kê theo mảnh còn chính xác hơn.
- Lợi ích **rõ rệt nhất trong vận hành**: xoá dữ liệu cũ từ **hàng giờ xuống mili-giây** bằng `DROP TABLE` một mảnh.
- **Partitioning ≠ Sharding**: một máy vs nhiều máy; trong suốt vs ứng dụng phải biết; giữ được `JOIN` và ACID vs mất chúng.
- Năm nhược điểm: truy vấn không có khoá phân mảnh **quét mọi mảnh**, `UPDATE` xuyên mảnh rất đắt, **khoá duy nhất phải chứa khoá phân mảnh**, quá nhiều mảnh làm chậm lập kế hoạch, thay đổi cấu trúc phức tạp hơn.
- Ngưỡng thô: nghĩ tới partitioning ở **50-100 GB một bảng**, hoặc khi cửa sổ bảo trì không còn đủ.

**Bài kế tiếp** → [Bài 2: Partitioning thực hành với PostgreSQL](02-partitioning-thuc-hanh-postgres.md)

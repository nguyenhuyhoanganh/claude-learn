# Bài 2: Hỏi & Đáp — Transactions, Connections và Isolation

Bảy câu hỏi về transaction và kết nối. Ba câu đầu là những câu bị trả lời sai nhiều nhất khi phỏng vấn.

---

## Câu 1 — Bốn isolation level: giải thích đầy đủ

Đây là câu hỏi phỏng vấn phổ biến nhất về database. Câu trả lời tốt phải có **ba tầng**: bảng chuẩn, cơ chế bên dưới, và khác biệt giữa các hệ.

### Tầng 1 — Bảng chuẩn

| Mức | Dirty read | Non-repeatable read | Phantom read |
|---|---|---|---|
| `READ UNCOMMITTED` | Có thể | Có thể | Có thể |
| `READ COMMITTED` | Không | Có thể | Có thể |
| `REPEATABLE READ` | Không | Không | **Có thể** |
| `SERIALIZABLE` | Không | Không | Không |

### Tầng 2 — Cơ chế thật

Đây là chỗ phân biệt người thuộc bài với người hiểu bài:

```text
   READ COMMITTED
     → MỖI CÂU LỆNH lấy MỘT ẢNH CHỤP MỚI
     → nên câu lệnh thứ hai thấy được thay đổi mà câu thứ nhất không thấy

   REPEATABLE READ
     → MỘT ẢNH CHỤP duy nhất, chụp lúc câu lệnh ĐẦU TIÊN chạy
     → dùng cho toàn bộ transaction

   SERIALIZABLE (PostgreSQL)
     → như REPEATABLE READ, CỘNG THÊM theo dõi phụ thuộc đọc-ghi
     → phát hiện được chu kỳ phụ thuộc → HUỶ một transaction (lỗi 40001)
```

### Tầng 3 — Thực tế từng hệ

**Đây là phần tạo ra khác biệt khi phỏng vấn:**

| Hệ | Mặc định | `READ UNCOMMITTED` thật? | `REPEATABLE READ` chặn phantom? |
|---|---|---|---|
| **PostgreSQL** | `READ COMMITTED` | Không — âm thầm nâng thành `READ COMMITTED` | **CÓ** — vì cài bằng snapshot |
| **MySQL InnoDB** | `REPEATABLE READ` | Có | Có với `SELECT` thường; đọc có khoá thì khác |
| **Oracle** | `READ COMMITTED` | Không hỗ trợ | Không có mức này |
| **SQL Server** | `READ COMMITTED` (khoá) | **Có** (`WITH (NOLOCK)`) | Không, trừ khi bật `SNAPSHOT` |

Vì sao PostgreSQL `REPEATABLE READ` chặn được phantom:

```text
   CÁCH CHUẨN ANSI HÌNH DUNG:  khoá các DÒNG đã đọc
     → khe trống giữa các dòng KHÔNG khoá được
     → ai đó INSERT vào khe → PHANTOM lọt vào

   CÁCH POSTGRESQL LÀM:  ghi nhớ mình bắt đầu ở thời điểm nào,
                          rồi LỌC BỎ mọi dòng sinh ra sau đó
     → dòng mới có xmin > snapshot của tôi → VÔ HÌNH
     → phantom không lọt được, và không cần khoá gì cả
```

Nó **không cố** chặn phantom — cơ chế snapshot **tình cờ** chặn luôn. Nói được câu này là dấu hiệu hiểu cơ chế chứ không thuộc bảng.

Chi tiết đầy đủ ở [phase-2 bài 3](../phase-2/03-isolation-va-read-phenomena.md).

---

## Câu 2 — Snapshot Isolation khác Repeatable Read thế nào?

Câu trả lời phụ thuộc vào **hệ nào**:

```text
   TRONG POSTGRESQL:  KHÔNG KHÁC GÌ CẢ.
     PostgreSQL cài đặt REPEATABLE READ BẰNG snapshot isolation.
     Hai tên gọi, một cơ chế.

   TRONG SQL SERVER:  LÀ HAI MỨC KHÁC NHAU.
     REPEATABLE READ  → dùng KHOÁ
     SNAPSHOT         → dùng phiên bản (giống Postgres)
     → phải bật riêng: ALTER DATABASE ... SET ALLOW_SNAPSHOT_ISOLATION ON

   TRONG LÝ THUYẾT:
     Snapshot Isolation MẠNH HƠN Repeatable Read chuẩn ANSI
     (vì nó chặn luôn phantom), nhưng YẾU HƠN Serializable
     (vì nó không chặn write skew).
```

### Bất thường mà Snapshot Isolation **không** chặn: write skew

```text
   Quy định: ca trực phải có ít nhất 1 bác sĩ.
   Hiện có 2: An và Bình.

   An:   đếm bác sĩ đang trực → 2 → "còn Bình, mình xin nghỉ được"
   Bình: đếm bác sĩ đang trực → 2 → "còn An, mình xin nghỉ được"
   An:   UPDATE ... An nghi      COMMIT
   Bình: UPDATE ... Bình nghỉ    COMMIT

   → 0 bác sĩ trực. Quy tắc nghiệp vụ bị phá.
```

```text
   Vì sao Snapshot Isolation không bắt được:
     • An và Bình sửa HAI DÒNG KHÁC NHAU
     • không có ghi đè → không phải lost update
     • cả hai đều đọc đúng, ghi đúng dòng của mình
   → Chỉ SERIALIZABLE mới bắt được, bằng cách theo dõi PHỤ THUỘC ĐỌC-GHI
```

Thí nghiệm tái hiện đầy đủ ở [phase-2 bài 5](../phase-2/05-acid-thuc-hanh-voi-postgres.md).

---

## Câu 3 — Đã có `SELECT FOR UPDATE` rồi, sao còn cần `SERIALIZABLE`?

Câu hỏi rất hay, và câu trả lời là: **chúng giải hai vấn đề khác nhau**.

```text
   SELECT ... FOR UPDATE  →  khoá những DÒNG BẠN ĐÃ ĐỌC
   SERIALIZABLE           →  bảo vệ cả những DÒNG CHƯA TỒN TẠI
```

### Trường hợp `FOR UPDATE` bó tay

```sql
-- Quy định: mỗi phòng tối đa 3 người
BEGIN;
SELECT count(*) FROM members WHERE room_id = 7 FOR UPDATE;   -- đếm được 2
-- ... hai transaction cùng đếm được 2 ...
INSERT INTO members (room_id, user_id) VALUES (7, :toi);
COMMIT;
-- → 4 người trong phòng
```

```text
   `FOR UPDATE` khoá 2 DÒNG ĐANG CÓ.
   Những dòng SẮP ĐƯỢC CHÈN thì không tồn tại → không khoá được.
   → Cả hai transaction đều chèn thành công.
```

Ba cách chữa:

```text
   1. SERIALIZABLE
      → PostgreSQL theo dõi phụ thuộc đọc-ghi và huỷ một transaction
      → CẦN VÒNG LẶP THỬ LẠI

   2. KHOÁ MỘT DÒNG "CHA" ĐẠI DIỆN
      SELECT * FROM rooms WHERE id = 7 FOR UPDATE;   -- khoá CHÍNH cái phòng
      → mọi người vào phòng 7 đều phải xếp hàng qua dòng này

   3. KHOÁ TƯ VẤN
      SELECT pg_advisory_xact_lock(hashtext('room:7'));
      → không cần dòng thật để khoá
```

Cách 2 đơn giản nhất và thường là câu trả lời đúng trong thực tế.

### So sánh

| | `FOR UPDATE` | `SERIALIZABLE` |
|---|---|---|
| Kiểu | **Bi quan** — chờ | **Lạc quan** — huỷ và thử lại |
| Bảo vệ dòng đã có | ✔ | ✔ |
| Bảo vệ dòng chưa tồn tại | **✘** | ✔ |
| Chống write skew | ✘ | ✔ |
| Cần vòng lặp thử lại | Không | **Bắt buộc** |
| Chi phí khi ít tranh chấp | Chờ vô ích | Gần như không |
| Chi phí khi nhiều tranh chấp | Xếp hàng | **Huỷ và làm lại nhiều** |

---

## Câu 4 — Nhiều client dùng chung một kết nối database được không?

**Về mặt kỹ thuật: được. Về mặt an toàn: rất nguy hiểm.**

```text
   MỘT KẾT NỐI POSTGRES CÓ TRẠNG THÁI:
     • transaction hiện tại
     • biến phiên (SET search_path, SET timezone, SET role...)
     • bảng tạm
     • câu lệnh chuẩn bị sẵn
     • con trỏ đang mở
     • khoá tư vấn cấp phiên
```

```text
   Client A: SET search_path = 'tenant_a';
   Client B (dùng chung kết nối): SELECT * FROM users;
   → B đọc dữ liệu của TENANT A
```

Đây không phải giả thuyết — đó là một lớp lỗi bảo mật thật, và nó rất khó truy vì lỗi chỉ xuất hiện khi hai request rơi trúng cùng một kết nối.

### Cách đúng: connection pool

```text
   Pool KHÔNG chia sẻ kết nối đồng thời.
   Nó CHO MƯỢN: một client giữ kết nối từ lúc bắt đầu tới lúc kết thúc
   một đơn vị công việc, rồi TRẢ LẠI.

   → Không có hai client dùng chung MỘT LÚC
   → Nhưng TRẠNG THÁI vẫn có thể sót lại
```

Vì thế pool tốt phải **dọn dẹp khi trả kết nối**:

```text
   PgBouncer transaction mode:
     • tự chạy DISCARD ALL (hoặc server_reset_query)
     • → xoá bảng tạm, câu lệnh chuẩn bị, biến phiên

   HikariCP:
     • rollback transaction chưa kết thúc
     • đặt lại autoCommit, readOnly, isolation
```

Và với PgBouncer transaction mode, quy tắc bắt buộc:

```sql
-- SAI: định lại ở kết nối, request sau thừa hưởng
SET search_path = 'tenant_a';

-- ĐÚNG: chỉ trong transaction hiện tại
SET LOCAL search_path = 'tenant_a';
```

Danh sách đầy đủ những gì PgBouncer transaction mode phá vỡ ở [phase-8 bài 3](../phase-8/03-connection-pooling.md).

---

## Câu 5 — Chỉ đọc thôi thì có cần transaction không?

**Có, trong ba trường hợp** — và trường hợp đầu tiên là trường hợp thật sự quan trọng.

### Trường hợp 1 — Nhiều truy vấn phải nhất quán với nhau

```text
   BÁO CÁO KHÔNG CÓ TRANSACTION

   10:00:00.000  SELECT SUM(amount) FROM orders;   → 5.000.000.000
   10:00:00.100     ⟵ một đơn hàng 3.000.000 được ghi vào
   10:00:00.200  SELECT COUNT(*) FROM orders;      → 12.001

   TỜ BÁO CÁO IN RA:
     Tổng doanh thu : 5.000.000.000   (trên 12.000 đơn)
     Số đơn         : 12.001
   → HAI CON SỐ KHÔNG KHỚP NHAU
```

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT SUM(amount) FROM orders;
SELECT COUNT(*)   FROM orders;
COMMIT;
-- → cả hai nhìn CÙNG MỘT ảnh chụp
```

### Trường hợp 2 — Cần trạng thái tại một thời điểm

Xuất dữ liệu, đối soát, sao lưu logic — tất cả đều cần "ảnh chụp lúc bắt đầu", không phải "trạng thái trôi theo thời gian".

### Trường hợp 3 — Khai báo rõ để database tối ưu

```sql
BEGIN TRANSACTION READ ONLY;
```

```text
   PostgreSQL biết chắc không có gì để rollback
   → không cần cấp XID ghi
   → một số kiểm tra được bỏ qua
```

### Khi nào **không** cần

```text
   ✘ Một câu SELECT đơn lẻ
     → nó ĐÃ nằm trong một transaction ngầm rồi (autocommit)
     → bọc thêm BEGIN/COMMIT chỉ tốn hai vòng mạng
```

### Và cái giá phải nhớ

```text
   Transaction chỉ đọc VẪN GIỮ MỘT ẢNH CHỤP.
   Ảnh chụp đó CHẶN `VACUUM` dọn rác trên TOÀN BỘ database.

   → Báo cáo chạy 2 giờ = VACUUM bị chặn 2 giờ
   → Bảng bị UPDATE nhiều sẽ phình lên trong 2 giờ đó
```

Đây là lý do các báo cáo nặng nên chạy trên **replica**, không phải trên primary.

---

## Câu 6 — Vì sao `UPDATE` trong PostgreSQL đụng vào MỌI index?

```sql
UPDATE users SET last_login = now() WHERE id = 42;
-- Bảng có 5 index, không cái nào chứa cột `last_login`
-- → vẫn có thể phải cập nhật cả 5
```

Lý do nằm ở mô hình MVCC:

```text
   PostgreSQL KHÔNG SỬA TẠI CHỖ.
   `UPDATE` = tạo một PHIÊN BẢN MỚI của dòng ở vị trí KHÁC.
   → ctid đổi từ (0,1) sang (0,4)

   Mà MỌI index của PostgreSQL đều trỏ tới `ctid`.
   → dòng đổi chỗ → mọi index phải trỏ lại chỗ mới
   → KỂ CẢ index trên các cột KHÔNG HỀ THAY ĐỔI
```

### Cơ chế giảm nhẹ: HOT update

**HOT** = *Heap-Only Tuple*. Nếu thoả **cả hai** điều kiện:

```text
   1. Phiên bản mới nằm CÙNG PAGE với phiên bản cũ
   2. KHÔNG cột nào ĐƯỢC ĐÁNH INDEX bị thay đổi

   → Index KHÔNG cần cập nhật.
   → Chỉ tạo một chuỗi liên kết trong chính page đó.
```

Kiểm tra tỉ lệ HOT:

```sql
SELECT relname,
       n_tup_upd                                              AS tong_update,
       n_tup_hot_upd                                          AS update_hot,
       round(100.0*n_tup_hot_upd/NULLIF(n_tup_upd,0), 1)      AS ti_le_hot
FROM pg_stat_user_tables WHERE n_tup_upd > 1000
ORDER BY n_tup_upd DESC;
```

```text
 relname |  tong_update  | update_hot | ti_le_hot
---------+---------------+------------+-----------
 users   |       1284993 |    1198442 |      93.3
 orders  |        882117 |     102883 |      11.7    ← THẤP, cần xem lại
```

Hai cách tăng tỉ lệ HOT:

```sql
-- 1. Chừa chỗ trống trong page để phiên bản mới nằm cùng page
ALTER TABLE orders SET (fillfactor = 80);
VACUUM FULL orders;      -- cần dừng lại bảng để áp dụng

-- 2. Bỏ index trên các cột BỊ CẬP NHẬT THƯỜNG XUYÊN
DROP INDEX idx_orders_updated_at;   -- nếu ít được dùng
```

Cách 2 phản trực giác nhưng rất hiệu quả: **một index trên cột hay thay đổi làm hỏng HOT cho mọi `UPDATE` của bảng đó**.

### So sánh với InnoDB

```text
   INNODB SỬA TẠI CHỖ, và index phụ trỏ tới PRIMARY KEY (không đổi).
   → `UPDATE` một cột không được đánh index → KHÔNG đụng index phụ nào

   Đổi lại: InnoDB phải ghi UNDO LOG, và đọc dữ liệu cũ phải tra undo log.
```

Đây là ví dụ tiêu biểu cho nguyên tắc "không có lựa chọn miễn phí": PostgreSQL đổi chi phí đọc dữ liệu cũ lấy chi phí cập nhật index; InnoDB đổi ngược lại.

---

## Câu 7 — Vì sao `COUNT(*)` trong PostgreSQL chậm?

```sql
SELECT count(*) FROM orders;   -- bảng 50 triệu dòng → ~4 giây
```

```text
   MyISAM lưu sẵn số dòng trong metadata → trả về tức thì.
   PostgreSQL PHẢI ĐẾM THẬT.

   VÌ SAO?  Vì MVCC:
     Transaction A đang chạy thấy 50.000.000 dòng
     Transaction B (bắt đầu sau) thấy 50.000.017 dòng
     → KHÔNG CÓ "số dòng" duy nhất để lưu sẵn
```

### `COUNT(*)` và `COUNT(cột)` **không** giống nhau

Đây là chi tiết rất hay bị bỏ qua, và nó quyết định truy vấn có được `Index Only Scan` hay không.

```sql
EXPLAIN ANALYZE SELECT count(*) FROM grades WHERE id BETWEEN 1000 AND 4000;
```

```text
Aggregate  (actual time=1.882..1.883 rows=1 loops=1)
  ->  Index Only Scan using grades_pkey on grades  (rows=3001 loops=1)
        Index Cond: ((id >= 1000) AND (id <= 4000))
        Heap Fetches: 0
Execution Time: 1.918 ms                              ← KHÔNG chạm heap
```

```sql
EXPLAIN ANALYZE SELECT count(g) FROM grades WHERE id BETWEEN 1000 AND 4000;
--                        ▲ đếm theo MỘT CỘT cụ thể
```

```text
Aggregate  (actual time=12.442..12.443 rows=1 loops=1)
  ->  Index Scan using grades_pkey on grades  (rows=3001 loops=1)
        Index Cond: ((id >= 1000) AND (id <= 4000))
Execution Time: 12.488 ms                             ← MẤT chữ "Only"
```

Vì sao khác nhau:

```text
   COUNT(*)     →  "đếm SỐ DÒNG"
                   không cần biết giá trị nào cả
                   → index là đủ → INDEX ONLY SCAN  ✔

   COUNT(cột)   →  "đếm số dòng có `cột` KHÁC NULL"
                   → PHẢI biết giá trị của `cột`
                   → nếu `cột` không nằm trong index → PHẢI VÀO HEAP  ✘
```

Và kết quả cũng khác:

```text
   COUNT(*)  → 3001
   COUNT(g)  → 2987      ← thiếu 14 dòng có g IS NULL
```

Hai hiểu lầm cần dẹp:

```text
   ❌ "COUNT(*) đọc HẾT mọi cột rồi đếm"
   ✔  Gần như mọi database hiện đại đều KHÔNG làm vậy.
      COUNT(*) chỉ đếm MỤC, không chạm giá trị nào.
      → COUNT(*) NHANH HƠN HOẶC BẰNG COUNT(cột), không bao giờ chậm hơn.

   ❌ "COUNT(1) nhanh hơn COUNT(*)"
   ✔  Y HỆT NHAU. Planner xử lý hai cái như nhau.
      Đây là truyền thuyết từ thời Oracle những năm 1990.
```

### `Heap Fetches` xuất hiện sau khi `UPDATE`

Ngay cả `COUNT(*)` cũng mất tác dụng nếu visibility map cũ:

```sql
UPDATE grades SET g = 20 WHERE id BETWEEN 1000 AND 4000;
EXPLAIN ANALYZE SELECT count(*) FROM grades WHERE id BETWEEN 1000 AND 4000;
```

```text
  ->  Index Only Scan using grades_pkey on grades
        Heap Fetches: 6002        ← vẫn phải vào heap 6.002 lần
Execution Time: 18.882 ms
```

```sql
VACUUM grades;
-- chạy lại → Heap Fetches: 0, Execution Time: 1.9 ms
```

```text
   Index KHÔNG biết dòng nào còn sống.
   Sau UPDATE, các page bị sửa MẤT bit visibility
   → Index Only Scan phải vào heap kiểm tra từng dòng
   → chỉ `VACUUM` mới bật lại bit đó
```

Ba cách thay thế:

```sql
-- 1. ƯỚC LƯỢNG (tức thì, sai số vài phần trăm)
SELECT reltuples::BIGINT FROM pg_class WHERE relname = 'orders';
```

```text
 reltuples
-----------
  49998112
```

```sql
-- 2. ƯỚC LƯỢNG cho truy vấn CÓ ĐIỀU KIỆN
EXPLAIN SELECT * FROM orders WHERE status = 'paid';
--   → đọc số `rows=` trong kế hoạch
```

```sql
-- 3. BỘ ĐẾM CHÍNH XÁC bằng trigger (khi thật sự cần)
CREATE TABLE row_counts (bang TEXT PRIMARY KEY, cnt BIGINT NOT NULL DEFAULT 0);
-- + trigger AFTER INSERT/DELETE tăng/giảm
-- ⚠ nhưng dòng này trở thành ĐIỂM NÓNG → cần bộ đếm chia mảnh
```

Cách 3 mang lại đúng vấn đề đã phân tích ở [phase-10 bài 1](../phase-10/01-system-design-twitter-database.md): một dòng bộ đếm bị cập nhật liên tục trở thành điểm nóng khoá.

Và cách rẻ nhất cho giao diện phân trang:

```sql
SELECT ... LIMIT 21;   -- lấy 21, hiện 20, còn 1 dòng nghĩa là "còn trang sau"
```

## Bảng tra nhanh

| Câu hỏi | Câu trả lời một dòng |
|---|---|
| Isolation level nào mặc định? | PostgreSQL/Oracle/SQL Server: `READ COMMITTED`. MySQL: `REPEATABLE READ` |
| PostgreSQL `REPEATABLE READ` có phantom không? | **Không** — nó cài bằng snapshot |
| Snapshot Isolation khác Repeatable Read? | Trong PostgreSQL: **giống hệt**. Trong SQL Server: khác |
| `FOR UPDATE` có chống được write skew? | **Không** — chỉ `SERIALIZABLE` hoặc khoá dòng cha |
| Chia sẻ kết nối giữa các client? | **Không** — dùng pool, và `SET LOCAL` thay `SET` |
| Chỉ đọc có cần transaction? | **Có** nếu nhiều truy vấn phải nhất quán với nhau |
| `UPDATE` có đụng mọi index? | **Có**, trừ khi đạt điều kiện **HOT update** |
| `COUNT(*)` sao chậm? | MVCC — không có "số dòng" duy nhất để lưu sẵn |
| `COUNT(*)` hay `COUNT(cột)`? | **`COUNT(*)`** — nó không cần biết giá trị nên `Index Only Scan` được |
| `COUNT(1)` có nhanh hơn `COUNT(*)`? | **Không** — y hệt nhau; đây là truyền thuyết cũ |

## Tóm tắt bài 2

- Trả lời về isolation level cần **ba tầng**: bảng chuẩn, cơ chế bên dưới (mỗi câu lệnh một snapshot vs một snapshot cho cả transaction), và **thực tế từng hệ**.
- **PostgreSQL `REPEATABLE READ` chặn phantom** — không phải vì nó cố chặn, mà vì cơ chế snapshot **tình cờ** chặn luôn. Nói được điều này phân biệt hiểu cơ chế với thuộc bảng.
- **Snapshot Isolation = Repeatable Read trong PostgreSQL**, nhưng là hai mức khác nhau trong SQL Server. Cả hai đều **không chặn write skew**.
- **`FOR UPDATE` không bảo vệ được dòng chưa tồn tại** — nó khoá cái đã đọc. Ba cách chữa: `SERIALIZABLE`, khoá dòng cha đại diện, hoặc khoá tư vấn.
- **Không bao giờ chia sẻ một kết nối giữa các client** — trạng thái phiên (`search_path`, bảng tạm, khoá tư vấn) rò rỉ sang nhau. Với PgBouncer transaction mode, luôn dùng **`SET LOCAL`**.
- **Transaction chỉ đọc vẫn cần** khi nhiều truy vấn phải nhất quán với nhau — nhưng nó **giữ ảnh chụp và chặn `VACUUM`**, nên báo cáo nặng phải chạy trên replica.
- **`UPDATE` trong PostgreSQL đụng mọi index** vì `ctid` đổi — trừ khi đạt **HOT update**. Theo dõi tỉ lệ HOT; tỉ lệ thấp thì giảm `fillfactor` hoặc bỏ index trên cột hay thay đổi.
- **`COUNT(*)` chậm vì MVCC**: mỗi transaction thấy số dòng khác nhau nên không có con số duy nhất để lưu sẵn. Dùng `reltuples` cho số xấp xỉ, hoặc `LIMIT n+1` cho phân trang.
- **`COUNT(*)` và `COUNT(cột)` không giống nhau**: `COUNT(*)` chỉ đếm mục nên `Index Only Scan` được; `COUNT(cột)` phải biết giá trị để loại `NULL` nên **phải vào heap** — đo được **1,9 ms so với 12,5 ms**. Và `COUNT(1)` **không** nhanh hơn `COUNT(*)` — đó là truyền thuyết từ thời Oracle thập niên 1990.

**Bài kế tiếp** → [Bài 3: Hỏi & Đáp - Database Internals và Best Practices](03-hoi-dap-database-internals.md)

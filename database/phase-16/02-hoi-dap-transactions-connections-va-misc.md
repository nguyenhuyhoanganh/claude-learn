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
     → MOI CAU LENH lay MOT ANH CHUP MOI
     → nen cau lenh thu hai thay duoc thay doi ma cau thu nhat khong thay

   REPEATABLE READ
     → MOT ANH CHUP duy nhat, chup luc cau lenh DAU TIEN chay
     → dung cho toan bo transaction

   SERIALIZABLE (PostgreSQL)
     → nhu REPEATABLE READ, CONG THEM theo doi phu thuoc doc-ghi
     → phat hien duoc chu ky phu thuoc → HUY mot transaction (loi 40001)
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
   CACH CHUAN ANSI HINH DUNG:  khoa cac DONG da doc
     → khe trong giua cac dong KHONG khoa duoc
     → ai do INSERT vao khe → PHANTOM lot vao

   CACH POSTGRESQL LAM:  ghi nho minh bat dau o thoi diem nao,
                          roi LOC BO moi dong sinh ra sau do
     → dong moi co xmin > snapshot cua toi → VO HINH
     → phantom khong lot duoc, va khong can khoa gi ca
```

Nó **không cố** chặn phantom — cơ chế snapshot **tình cờ** chặn luôn. Nói được câu này là dấu hiệu hiểu cơ chế chứ không thuộc bảng.

Chi tiết đầy đủ ở [phase-2 bài 3](../phase-2/03-isolation-va-read-phenomena.md).

---

## Câu 2 — Snapshot Isolation khác Repeatable Read thế nào?

Câu trả lời phụ thuộc vào **hệ nào**:

```text
   TRONG POSTGRESQL:  KHONG KHAC GI CA.
     PostgreSQL cai dat REPEATABLE READ BANG snapshot isolation.
     Hai ten goi, mot co che.

   TRONG SQL SERVER:  LA HAI MUC KHAC NHAU.
     REPEATABLE READ  → dung KHOA
     SNAPSHOT         → dung phien ban (giong Postgres)
     → phai bat rieng: ALTER DATABASE ... SET ALLOW_SNAPSHOT_ISOLATION ON

   TRONG LY THUYET:
     Snapshot Isolation MANH HON Repeatable Read chuan ANSI
     (vi no chan luon phantom), nhung YEU HON Serializable
     (vi no khong chan write skew).
```

### Bất thường mà Snapshot Isolation **không** chặn: write skew

```text
   Quy dinh: ca truc phai co it nhat 1 bac si.
   Hien co 2: An va Binh.

   An:   dem bac si dang truc → 2 → "con Binh, minh xin nghi duoc"
   Binh: dem bac si dang truc → 2 → "con An, minh xin nghi duoc"
   An:   UPDATE ... An nghi      COMMIT
   Binh: UPDATE ... Binh nghi    COMMIT

   → 0 bac si truc. Quy tac nghiep vu bi pha.
```

```text
   Vi sao Snapshot Isolation khong bat duoc:
     • An va Binh sua HAI DONG KHAC NHAU
     • khong co ghi de → khong phai lost update
     • ca hai deu doc dung, ghi dung dong cua minh
   → Chi SERIALIZABLE moi bat duoc, bang cach theo doi PHU THUOC DOC-GHI
```

Thí nghiệm tái hiện đầy đủ ở [phase-2 bài 5](../phase-2/05-acid-thuc-hanh-voi-postgres.md).

---

## Câu 3 — Đã có `SELECT FOR UPDATE` rồi, sao còn cần `SERIALIZABLE`?

Câu hỏi rất hay, và câu trả lời là: **chúng giải hai vấn đề khác nhau**.

```text
   SELECT ... FOR UPDATE  →  khoa nhung DONG BAN DA DOC
   SERIALIZABLE           →  bao ve ca nhung DONG CHUA TON TAI
```

### Trường hợp `FOR UPDATE` bó tay

```sql
-- Quy dinh: moi phong toi da 3 nguoi
BEGIN;
SELECT count(*) FROM members WHERE room_id = 7 FOR UPDATE;   -- dem duoc 2
-- ... hai transaction cung dem duoc 2 ...
INSERT INTO members (room_id, user_id) VALUES (7, :toi);
COMMIT;
-- → 4 nguoi trong phong
```

```text
   `FOR UPDATE` khoa 2 DONG DANG CO.
   Nhung dong SAP DUOC CHEN thi khong ton tai → khong khoa duoc.
   → Ca hai transaction deu chen thanh cong.
```

Ba cách chữa:

```text
   1. SERIALIZABLE
      → PostgreSQL theo doi phu thuoc doc-ghi va huy mot transaction
      → CAN VONG LAP THU LAI

   2. KHOA MOT DONG "CHA" DAI DIEN
      SELECT * FROM rooms WHERE id = 7 FOR UPDATE;   -- khoa CHINH cai phong
      → moi nguoi vao phong 7 deu phai xep hang qua dong nay

   3. KHOA TU VAN
      SELECT pg_advisory_xact_lock(hashtext('room:7'));
      → khong can dong that de khoa
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
   MOT KET NOI POSTGRES CO TRANG THAI:
     • transaction hien tai
     • bien phien (SET search_path, SET timezone, SET role...)
     • bang tam
     • cau lenh chuan bi san
     • con tro dang mo
     • khoa tu van cap phien
```

```text
   Client A: SET search_path = 'tenant_a';
   Client B (dung chung ket noi): SELECT * FROM users;
   → B doc du lieu cua TENANT A
```

Đây không phải giả thuyết — đó là một lớp lỗi bảo mật thật, và nó rất khó truy vì lỗi chỉ xuất hiện khi hai request rơi trúng cùng một kết nối.

### Cách đúng: connection pool

```text
   Pool KHONG chia se ket noi dong thoi.
   No CHO MUON: mot client giu ket noi tu luc bat dau toi luc ket thuc
   mot don vi cong viec, roi TRA LAI.

   → Khong co hai client dung chung MOT LUC
   → Nhung TRANG THAI van co the sot lai
```

Vì thế pool tốt phải **dọn dẹp khi trả kết nối**:

```text
   PgBouncer transaction mode:
     • tu chay DISCARD ALL (hoac server_reset_query)
     • → xoa bang tam, cau lenh chuan bi, bien phien

   HikariCP:
     • rollback transaction chua ket thuc
     • dat lai autoCommit, readOnly, isolation
```

Và với PgBouncer transaction mode, quy tắc bắt buộc:

```sql
-- SAI: dinh lai o ket noi, request sau thua huong
SET search_path = 'tenant_a';

-- DUNG: chi trong transaction hien tai
SET LOCAL search_path = 'tenant_a';
```

Danh sách đầy đủ những gì PgBouncer transaction mode phá vỡ ở [phase-8 bài 3](../phase-8/03-connection-pooling.md).

---

## Câu 5 — Chỉ đọc thôi thì có cần transaction không?

**Có, trong ba trường hợp** — và trường hợp đầu tiên là trường hợp thật sự quan trọng.

### Trường hợp 1 — Nhiều truy vấn phải nhất quán với nhau

```text
   BAO CAO KHONG CO TRANSACTION

   10:00:00.000  SELECT SUM(amount) FROM orders;   → 5.000.000.000
   10:00:00.100     ⟵ mot don hang 3.000.000 duoc ghi vao
   10:00:00.200  SELECT COUNT(*) FROM orders;      → 12.001

   TO BAO CAO IN RA:
     Tong doanh thu : 5.000.000.000   (tren 12.000 don)
     So don         : 12.001
   → HAI CON SO KHONG KHOP NHAU
```

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SELECT SUM(amount) FROM orders;
SELECT COUNT(*)   FROM orders;
COMMIT;
-- → ca hai nhin CUNG MOT anh chup
```

### Trường hợp 2 — Cần trạng thái tại một thời điểm

Xuất dữ liệu, đối soát, sao lưu logic — tất cả đều cần "ảnh chụp lúc bắt đầu", không phải "trạng thái trôi theo thời gian".

### Trường hợp 3 — Khai báo rõ để database tối ưu

```sql
BEGIN TRANSACTION READ ONLY;
```

```text
   PostgreSQL biet chac khong co gi de rollback
   → khong can cap XID ghi
   → mot so kiem tra duoc bo qua
```

### Khi nào **không** cần

```text
   ✘ Mot cau SELECT don le
     → no DA nam trong mot transaction ngam roi (autocommit)
     → boc them BEGIN/COMMIT chi ton hai vong mang
```

### Và cái giá phải nhớ

```text
   Transaction chi doc VAN GIU MOT ANH CHUP.
   Anh chup do CHAN `VACUUM` don rac tren TOAN BO database.

   → Bao cao chay 2 gio = VACUUM bi chan 2 gio
   → Bang bi UPDATE nhieu se phinh len trong 2 gio do
```

Đây là lý do các báo cáo nặng nên chạy trên **replica**, không phải trên primary.

---

## Câu 6 — Vì sao `UPDATE` trong PostgreSQL đụng vào MỌI index?

```sql
UPDATE users SET last_login = now() WHERE id = 42;
-- Bang co 5 index, khong cai nao chua cot `last_login`
-- → van co the phai cap nhat ca 5
```

Lý do nằm ở mô hình MVCC:

```text
   PostgreSQL KHONG SUA TAI CHO.
   `UPDATE` = tao mot PHIEN BAN MOI cua dong o vi tri KHAC.
   → ctid doi tu (0,1) sang (0,4)

   Ma MOI index cua PostgreSQL deu tro toi `ctid`.
   → dong doi cho → moi index phai tro lai cho moi
   → KE CA index tren cac cot KHONG HE THAY DOI
```

### Cơ chế giảm nhẹ: HOT update

**HOT** = *Heap-Only Tuple*. Nếu thoả **cả hai** điều kiện:

```text
   1. Phien ban moi nam CUNG PAGE voi phien ban cu
   2. KHONG cot nao DUOC DANH INDEX bi thay doi

   → Index KHONG can cap nhat.
   → Chi tao mot chuoi lien ket trong chinh page do.
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
 orders  |        882117 |     102883 |      11.7    ← THAP, can xem lai
```

Hai cách tăng tỉ lệ HOT:

```sql
-- 1. Chua cho trong page de phien ban moi nam cung page
ALTER TABLE orders SET (fillfactor = 80);
VACUUM FULL orders;      -- can dung lai bang de ap dung

-- 2. Bo index tren cac cot BI CAP NHAT THUONG XUYEN
DROP INDEX idx_orders_updated_at;   -- neu it duoc dung
```

Cách 2 phản trực giác nhưng rất hiệu quả: **một index trên cột hay thay đổi làm hỏng HOT cho mọi `UPDATE` của bảng đó**.

### So sánh với InnoDB

```text
   INNODB SUA TAI CHO, va index phu tro toi PRIMARY KEY (khong doi).
   → `UPDATE` mot cot khong duoc danh index → KHONG dung index phu nao

   Doi lai: InnoDB phai ghi UNDO LOG, va doc du lieu cu phai tra undo log.
```

Đây là ví dụ tiêu biểu cho nguyên tắc "không có lựa chọn miễn phí": PostgreSQL đổi chi phí đọc dữ liệu cũ lấy chi phí cập nhật index; InnoDB đổi ngược lại.

---

## Câu 7 — Vì sao `COUNT(*)` trong PostgreSQL chậm?

```sql
SELECT count(*) FROM orders;   -- bang 50 trieu dong → ~4 giay
```

```text
   MyISAM luu san so dong trong metadata → tra ve tuc thi.
   PostgreSQL PHAI DEM THAT.

   VI SAO?  Vi MVCC:
     Transaction A dang chay thay 50.000.000 dong
     Transaction B (bat dau sau) thay 50.000.017 dong
     → KHONG CO "so dong" duy nhat de luu san
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
Execution Time: 1.918 ms                              ← KHONG cham heap
```

```sql
EXPLAIN ANALYZE SELECT count(g) FROM grades WHERE id BETWEEN 1000 AND 4000;
--                        ▲ dem theo MOT COT cu the
```

```text
Aggregate  (actual time=12.442..12.443 rows=1 loops=1)
  ->  Index Scan using grades_pkey on grades  (rows=3001 loops=1)
        Index Cond: ((id >= 1000) AND (id <= 4000))
Execution Time: 12.488 ms                             ← MAT chu "Only"
```

Vì sao khác nhau:

```text
   COUNT(*)     →  "dem SO DONG"
                   khong can biet gia tri nao ca
                   → index la du → INDEX ONLY SCAN  ✔

   COUNT(cot)   →  "dem so dong co `cot` KHAC NULL"
                   → PHAI biet gia tri cua `cot`
                   → neu `cot` khong nam trong index → PHAI VAO HEAP  ✘
```

Và kết quả cũng khác:

```text
   COUNT(*)  → 3001
   COUNT(g)  → 2987      ← thieu 14 dong co g IS NULL
```

Hai hiểu lầm cần dẹp:

```text
   ❌ "COUNT(*) doc HET moi cot roi dem"
   ✔  Gan nhu moi database hien dai deu KHONG lam vay.
      COUNT(*) chi dem MUC, khong cham gia tri nao.
      → COUNT(*) NHANH HON HOAC BANG COUNT(cot), khong bao gio cham hon.

   ❌ "COUNT(1) nhanh hon COUNT(*)"
   ✔  Y HET NHAU. Planner xu ly hai cai nhu nhau.
      Day la truyen thuyet tu thoi Oracle nhung nam 1990.
```

### `Heap Fetches` xuất hiện sau khi `UPDATE`

Ngay cả `COUNT(*)` cũng mất tác dụng nếu visibility map cũ:

```sql
UPDATE grades SET g = 20 WHERE id BETWEEN 1000 AND 4000;
EXPLAIN ANALYZE SELECT count(*) FROM grades WHERE id BETWEEN 1000 AND 4000;
```

```text
  ->  Index Only Scan using grades_pkey on grades
        Heap Fetches: 6002        ← van phai vao heap 6.002 lan
Execution Time: 18.882 ms
```

```sql
VACUUM grades;
-- chay lai → Heap Fetches: 0, Execution Time: 1.9 ms
```

```text
   Index KHONG biet dong nao con song.
   Sau UPDATE, cac page bi sua MAT bit visibility
   → Index Only Scan phai vao heap kiem tra tung dong
   → chi `VACUUM` moi bat lai bit do
```

Ba cách thay thế:

```sql
-- 1. UOC LUONG (tuc thi, sai so vai phan tram)
SELECT reltuples::BIGINT FROM pg_class WHERE relname = 'orders';
```

```text
 reltuples
-----------
  49998112
```

```sql
-- 2. UOC LUONG cho truy van CO DIEU KIEN
EXPLAIN SELECT * FROM orders WHERE status = 'paid';
--   → doc so `rows=` trong ke hoach
```

```sql
-- 3. BO DEM CHINH XAC bang trigger (khi that su can)
CREATE TABLE row_counts (bang TEXT PRIMARY KEY, cnt BIGINT NOT NULL DEFAULT 0);
-- + trigger AFTER INSERT/DELETE tang/giam
-- ⚠ nhung dong nay tro thanh DIEM NONG → can bo dem chia manh
```

Cách 3 mang lại đúng vấn đề đã phân tích ở [phase-10 bài 1](../phase-10/01-system-design-twitter-database.md): một dòng bộ đếm bị cập nhật liên tục trở thành điểm nóng khoá.

Và cách rẻ nhất cho giao diện phân trang:

```sql
SELECT ... LIMIT 21;   -- lay 21, hien 20, con 1 dong nghia la "con trang sau"
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

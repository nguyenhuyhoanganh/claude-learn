# Bài 3: Hỏi & Đáp — Database Internals và Best Practices

Tám câu hỏi về cơ chế bên trong và về những quyết định thiết kế hay bị tranh cãi.

---

## Câu 1 — Vì sao xoá dữ liệu mà bảng không nhỏ lại?

```sql
SELECT pg_size_pretty(pg_relation_size('events'));   -- 42 GB
DELETE FROM events WHERE created_at < '2025-01-01';  -- xoa 30 trieu dong
SELECT pg_size_pretty(pg_relation_size('events'));   -- VAN 42 GB
```

Vì `DELETE` **không xoá byte nào**:

```text
   DELETE chi ghi mot dau: "tuple nay chet tu transaction XID 12345"
     → dat `xmax` cua tuple
     → tuple VAN NAM DO, chiem nguyen cho

   Vi sao phai vay?  Vi MVCC:
     Transaction khac dang chay CO THE van can thay dong do
     (neu no bat dau TRUOC khi xoa)
     → khong duoc phep xoa that ngay
```

Ba mức dọn dẹp:

| Lệnh | Làm gì | Khoá | Trả đĩa về HĐH |
|---|---|---|---|
| `VACUUM` | Đánh dấu chỗ trống để **tái dùng** | Nhẹ, chạy song song được | **Không** |
| `VACUUM FULL` | Viết lại cả bảng, gọn lại | **`ACCESS EXCLUSIVE`** — chặn tất cả | **Có** |
| `pg_repack` | Như `VACUUM FULL` nhưng không chặn | Nhẹ (trừ vài giây cuối) | **Có** |

```sql
-- Xem co bao nhieu rac
SELECT relname,
       n_live_tup                                                AS dong_song,
       n_dead_tup                                                AS dong_chet,
       round(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),1) AS pct_chet,
       last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;
```

```text
 relname |  dong_song  | dong_chet | pct_chet |     last_autovacuum
---------+-------------+-----------+----------+-------------------------
 events  |   120000000 |  30000000 |     20.0 | 2026-08-07 03:12:44+00
```

Ngưỡng thực dụng: **trên 20% là đáng lo**. Nó nghĩa là mọi truy vấn đang đọc thêm 20% page chứa xác chết.

```bash
# Khong chan bang, khuyen nghi cho production
pg_repack -t events -d mydb
```

Và cách tốt nhất là **không tạo ra vấn đề**: phân mảnh theo thời gian rồi `DROP` cả mảnh ([phase-6](../phase-6/01-database-partitioning-la-gi.md)) — mili-giây thay vì hàng giờ, và đĩa được trả về ngay.

---

## Câu 2 — Autovacuum là gì và khi nào nó chạy?

```sql
SHOW autovacuum_vacuum_scale_factor;   -- 0.2
SHOW autovacuum_vacuum_threshold;      -- 50
```

```text
   NGUONG KICH HOAT =  threshold  +  scale_factor × so_dong

   Bang 1.000 dong    →  50 + 0,2×1.000     =        250 dong chet
   Bang 100 trieu dong→  50 + 0,2×100.000.000 = 20.000.050 dong chet
                                                 ▲
                        PHAI CO 20 TRIEU dong chet moi chay!
```

Đây là vấn đề: **công thức tỉ lệ phần trăm không hợp với bảng lớn**. Bảng 100 triệu dòng tích tụ 20 triệu xác chết (20% phình) trước khi autovacuum động tay.

Cách chữa — đặt riêng cho bảng lớn:

```sql
ALTER TABLE events SET (
    autovacuum_vacuum_scale_factor = 0.01,      -- 1% thay vi 20%
    autovacuum_vacuum_threshold    = 1000,
    autovacuum_analyze_scale_factor = 0.005,    -- ANALYZE con thuong xuyen hon
    autovacuum_vacuum_cost_delay   = 2          -- chay nhanh hon (mac dinh 2ms tu PG12)
);
```

Kiểm tra autovacuum có đang chạy không:

```sql
SELECT pid, now() - xact_start AS chay_bao_lau, query
FROM pg_stat_activity WHERE query LIKE 'autovacuum%';
```

### Ba thứ chặn `VACUUM` dọn rác

Đây là nguyên nhân số một khiến bảng phình dù autovacuum vẫn chạy:

```sql
-- 1. Transaction dang mo lau
SELECT pid, now()-xact_start AS mo_bao_lau, state, left(query,50)
FROM pg_stat_activity WHERE xact_start IS NOT NULL
ORDER BY xact_start LIMIT 5;

-- 2. Khe nhan ban khong hoat dong
SELECT slot_name, active, wal_status,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_giu
FROM pg_replication_slots;

-- 3. Transaction chuan bi san bi bo quen
SELECT gid, prepared, owner FROM pg_prepared_xacts;
```

```text
   VACUUM chi don duoc tuple ma KHONG transaction nao con can thay.
   → Mot transaction mo tu 3 gio truoc chan viec don MOI THU sau do
   → tren TOAN BO database, khong chi bang do
```

Phòng thủ:

```sql
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';
```

---

## Câu 3 — Nên dùng `TEXT` hay `VARCHAR(n)`?

**Trong PostgreSQL: hoàn toàn như nhau về hiệu năng.**

```text
   `TEXT`, `VARCHAR(n)`, `VARCHAR` deu dung CUNG mot kieu luu tru ben trong.
   `VARCHAR(n)` chi them mot rang buoc kiem tra do dai.
   → KHONG co khac biet ve toc do hay dung luong.
```

Lời khuyên thực dụng:

```sql
-- NEN: dung TEXT, va CHECK neu that su can gioi han nghiep vu
CREATE TABLE users (
    email TEXT NOT NULL CHECK (length(email) <= 254),
    bio   TEXT
);
```

Vì sao `CHECK` tốt hơn `VARCHAR(n)`:

```text
   Doi VARCHAR(50) thanh VARCHAR(100):
     → PostgreSQL 9.2+ khong viet lai bang, nhung VAN lay ACCESS EXCLUSIVE

   Doi CHECK:
     ALTER TABLE ... DROP CONSTRAINT ..., ADD CONSTRAINT ... NOT VALID;
     ALTER TABLE ... VALIDATE CONSTRAINT ...;
     → khoa NHE hon nhieu
```

**Với MySQL thì khác:**

```text
   VARCHAR(n)  →  luu trong dong, danh index duoc day du
   TEXT        →  co the luu NGOAI dong, index chi duoc TIEN TO 767/3072 byte
                  va khong dung duoc cho mot so thao tac

   → Tren MySQL, VARCHAR(n) thuong la lua chon dung.
```

Đây là ví dụ điển hình cho lời khuyên xuyên suốt khoá này: **lời khuyên đúng cho hệ này có thể sai cho hệ khác**.

---

## Câu 4 — `NULL` có ảnh hưởng hiệu năng không?

Có, theo ba hướng — và hướng thứ hai là hướng ít người biết.

### Hướng 1 — `NULL` chiếm rất ít chỗ

```text
   PostgreSQL luu mot BITMAP NULL o dau moi tuple:
     1 bit cho moi cot
     → cot NULL KHONG chiem byte du lieu nao

   Bang 20 cot, 15 cot NULL:
     Voi NULL      : 23 byte header + 3 byte bitmap + 5 cot du lieu
     Voi chuoi rong: 23 byte header + 20 cot du lieu
   → NULL GON HON dang ke
```

### Hướng 2 — Index bỏ qua được `NULL`

```sql
-- Bang 100 trieu dong, chi 50.000 dong co `deleted_at` khac NULL
CREATE INDEX idx_deleted ON orders (deleted_at) WHERE deleted_at IS NOT NULL;
```

```text
   Index day du     : 2,1 GB
   Index bo phan    : 1,8 MB      → NHO HON ~1.200 LAN
```

Đây là kỹ thuật rất hiệu quả cho các cột "hiếm khi có giá trị": `deleted_at`, `error_message`, `cancelled_at`.

### Hướng 3 — `NULL` làm logic phức tạp và dễ sai

```sql
SELECT * FROM users WHERE status <> 'active';
-- → KHONG tra ve dong co status IS NULL!
```

```text
   NULL <> 'active'  →  NULL  (khong phai TRUE)
   WHERE chi giu dong co dieu kien TRUE
   → dong NULL bi BO QUA am tham
```

```sql
-- Cach dung
WHERE status IS DISTINCT FROM 'active';
-- hoac
WHERE status <> 'active' OR status IS NULL;
```

Toán tử `IS DISTINCT FROM` xử lý `NULL` như một giá trị bình thường — nó là công cụ đúng cho tình huống này và rất ít người dùng.

Tương tự với `NOT IN`:

```sql
-- BAY: neu subquery tra ve BAT KY NULL nao, ket qua LUON RONG
SELECT * FROM orders WHERE user_id NOT IN (SELECT id FROM banned_users);

-- AN TOAN
SELECT * FROM orders o WHERE NOT EXISTS (
    SELECT 1 FROM banned_users b WHERE b.id = o.user_id
);
```

Đây là một trong những bẫy SQL gây bug âm thầm nhiều nhất.

---

## Câu 5 — Nên dùng `UUID` hay `BIGINT` làm khoá chính?

Đã phân tích ở [phase-4 bài 4](../phase-4/04-bloom-filter-va-uuid-performance.md), tóm tắt lại thành quy tắc quyết định:

```text
   ✔ BIGINT (BIGSERIAL / IDENTITY)
     • Ung dung mot database
     • Khong can sinh khoa o client
     • Nho nhat (8 byte), nhanh nhat, khong phinh index

   ✔ UUID v7  (KHONG phai v4)
     • Can sinh khoa o nhieu noi
     • Khong muon lo quy mo kinh doanh
     • TANG DAN theo thoi gian → khong gay tach page

   ✘ UUID v4
     • Ngau nhien hoan toan → tach page lien tuc
     • Do that tren PostgreSQL: chen CHAM HON 3,7 LAN, index LON HON 2,1 LAN
     • Tren InnoDB con te hon vi bang cung sap theo khoa chinh
```

Và quy tắc lưu trữ:

```text
   PostgreSQL : kieu UUID (16 byte)         — KHONG dung TEXT
   MySQL      : BINARY(16)                  — KHONG dung CHAR(36)

   CHAR(36) lang phi 20 byte MOI GIA TRI,
   va tren InnoDB con bi NHAN LEN trong MOI index phu.
```

Mẫu tách đôi khi cần cả hai:

```sql
CREATE TABLE orders (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- ky thuat, noi bo
    order_no UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE     -- doi ngoai
);
```

`id` lo hiệu năng và toàn vẹn tham chiếu; `order_no` lo giao tiếp với thế giới bên ngoài mà không lộ quy mô.

---

## Câu 6 — Xoá mềm hay xoá thật?

```sql
-- Xoa mem
ALTER TABLE orders ADD COLUMN deleted_at TIMESTAMPTZ;
UPDATE orders SET deleted_at = now() WHERE id = 42;
```

| | Xoá mềm | Xoá thật |
|---|---|---|
| Khôi phục được | **Có** | Không (trừ khi có sao lưu) |
| Giữ lịch sử | **Có** | Không |
| Kích thước bảng | **Phình mãi** | Ổn định |
| Mọi truy vấn phải nhớ | `WHERE deleted_at IS NULL` | Không cần |
| `UNIQUE` | **Gãy** — không tạo lại email đã "xoá" được | Bình thường |
| Khoá ngoại | Trỏ tới dòng đã "xoá" | Database chặn |

Ba vấn đề của xoá mềm, và cách xử lý:

```sql
-- VAN DE 1: quen `WHERE deleted_at IS NULL` o mot cho nao do
-- → Giai: dung VIEW hoac Row Level Security
CREATE VIEW active_orders AS SELECT * FROM orders WHERE deleted_at IS NULL;

-- VAN DE 2: UNIQUE gay
-- → Giai: index BO PHAN
CREATE UNIQUE INDEX idx_email_active ON users (email) WHERE deleted_at IS NULL;

-- VAN DE 3: bang phinh mai
-- → Giai: chuyen dong da xoa sang bang luu tru dinh ky
```

Mẫu thực dụng thường tốt hơn cả hai: **xoá thật + bảng lưu trữ**.

```sql
BEGIN;
  INSERT INTO orders_archive SELECT *, now() AS archived_at FROM orders WHERE id = 42;
  DELETE FROM orders WHERE id = 42;
COMMIT;
```

```text
   ✔ Bang chinh gon, moi truy van nhanh
   ✔ Khong can nho `WHERE deleted_at IS NULL` o dau ca
   ✔ UNIQUE va khoa ngoai hoat dong binh thuong
   ✔ Van khoi phuc duoc
```

Chủ đề này được đào sâu ở [sql-interview/phase-6](../../sql-interview/phase-6/03-soft-delete-hay-xoa-that.md).

---

## Câu 7 — Nên đặt logic nghiệp vụ ở database hay ở ứng dụng?

Đây là câu hỏi gây tranh cãi nhiều nhất, và câu trả lời tốt là **phân biệt hai loại logic**.

```text
   ┌─────────────────────────────────────────────────────────┐
   │ NEN O DATABASE — BAT BIEN VE DU LIEU                    │
   │   • Rang buoc: NOT NULL, CHECK, UNIQUE, FOREIGN KEY     │
   │   • Kieu du lieu dung (dung TEXT cho moi thu)           │
   │   • Cach ly tenant (Row Level Security)                 │
   │   → VI: chung KHONG THE bi bo qua, ke ca khi ung dung   │
   │     co bug, hoac khi co ung dung THU HAI ghi vao        │
   ├─────────────────────────────────────────────────────────┤
   │ NEN O UNG DUNG — QUY TAC NGHIEP VU                      │
   │   • Quy trinh, luong trang thai                          │
   │   • Tinh toan gia, khuyen mai                            │
   │   • Goi dich vu ngoai                                    │
   │   → VI: de kiem thu, de doc, de trien khai, dung tay    │
   │     nghe cua doi ngu                                     │
   └─────────────────────────────────────────────────────────┘
```

### Vì sao ràng buộc phải ở database

```text
   Ung dung kiem tra: "email phai duy nhat"
   → nhung co:
       • mot dich vu THU HAI cung ghi vao bang do
       • mot job di tru chay truc tiep bang SQL
       • mot ky su sua tay luc khan cap
       • mot dieu kien tranh chap giua hai request
   → MOT trong nhung duong do se pha vo quy tac

   Rang buoc o database: KHONG DUONG NAO pha duoc.
```

### Vì sao quy trình không nên ở database

```text
   Stored procedure:
     ✘ Kho kiem thu tu dong
     ✘ Kho quan ly phien ban trong git
     ✘ Kho go loi
     ✘ Kho trien khai dan (khong co canary)
     ✘ Khoa chat vao mot he quan tri
```

### Vùng xám: trigger

```text
   ✔ HOP: bo dem phi chuan hoa, ghi audit, cap nhat updated_at
     → nhung viec PHAI luon xay ra, khong duoc quen

   ✘ KHONG HOP: logic nghiep vu phuc tap, goi dich vu ngoai
     → logic AN, doc code ung dung khong thay no ton tai
     → gay ra "hanh vi ma thuat" rat kho go
```

Quy tắc thực dụng: **trigger chỉ nên làm những việc mà mọi đường ghi đều phải làm, và phải rất ngắn**.

---

## Câu 8 — Khi nào nên phi chuẩn hoá?

```text
   CHUAN HOA la mac dinh dung.  Phi chuan hoa la TOI UU CO CHU DICH.
   → Chi lam khi CO SO DO chung minh la can.
```

Ba dạng phi chuẩn hoá, xếp theo mức độ rủi ro:

```text
   1. CỘT ĐẾM SẴN  (rui ro VUA)
      users.follower_count, posts.comment_count
      → phai co job doi soat

   2. CỘT CHÉP SANG  (rui ro CAO)
      orders.customer_name chep tu customers.name
      → doi ten khach hang phai cap nhat hang trieu don
      → TRU KHI la CO CHU DICH: giu ten LUC DAT HANG

   3. BẢNG TỔNG HỢP  (rui ro THAP)
      daily_sales tinh san tu orders
      → tinh lai duoc bat cu luc nao tu nguon su that
      → AN TOAN NHAT
```

Dạng 3 an toàn nhất vì nó **không phải nguồn sự thật** — sai thì tính lại. Dạng 2 nguy hiểm nhất vì bản sao có thể lệch mà không ai biết.

Quy tắc bắt buộc:

```text
   MOI cot phi chuan hoa PHAI di kem MOT TRUY VAN DOI SOAT.
   Neu khong viet duoc truy van doi soat → dung phi chuan hoa cot do.
```

```sql
-- Vi du truy van doi soat
SELECT p.id, p.comment_count AS ghi_trong_bang, count(c.id) AS dem_that
FROM posts p LEFT JOIN comments c ON c.post_id = p.id
GROUP BY p.id, p.comment_count
HAVING p.comment_count <> count(c.id);
```

Và với PostgreSQL, **materialized view** thường là lựa chọn tốt hơn bảng tổng hợp tự viết:

```sql
CREATE MATERIALIZED VIEW daily_sales AS
SELECT date(created_at) AS ngay, count(*) AS so_don, sum(total) AS doanh_thu
FROM orders GROUP BY 1;

CREATE UNIQUE INDEX ON daily_sales (ngay);      -- bat buoc cho CONCURRENTLY

REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales;   -- khong chan doc
```

## Bảng tra nhanh

| Câu hỏi | Câu trả lời một dòng |
|---|---|
| `DELETE` sao không giảm dung lượng? | Chỉ đánh dấu chết; cần `VACUUM` để tái dùng, `pg_repack` để trả đĩa |
| Autovacuum khi nào chạy? | `50 + 20% số dòng` — quá muộn cho bảng lớn, phải chỉnh riêng |
| Cái gì chặn `VACUUM`? | Transaction dài · khe nhân bản chết · transaction chuẩn bị sẵn |
| `TEXT` hay `VARCHAR(n)`? | PostgreSQL: như nhau, dùng `TEXT` + `CHECK`. MySQL: `VARCHAR(n)` |
| `NULL` có tốn chỗ? | Không — bitmap 1 bit mỗi cột; và index bộ phận bỏ qua được `NULL` |
| Bẫy `NULL` nguy hiểm nhất? | `NOT IN (subquery có NULL)` luôn trả về rỗng |
| `UUID` hay `BIGINT`? | `BIGINT` mặc định; UUID **v7** nếu cần phân tán; **không bao giờ** v4 |
| Xoá mềm hay xoá thật? | Xoá thật + bảng lưu trữ thường tốt hơn cả hai |
| Logic ở đâu? | **Bất biến dữ liệu** ở database; **quy trình nghiệp vụ** ở ứng dụng |
| Khi nào phi chuẩn hoá? | Khi có số đo chứng minh; và **luôn kèm truy vấn đối soát** |

## Tóm tắt bài 3

- **`DELETE` không xoá byte nào** — nó chỉ đánh dấu chết, vì MVCC bắt buộc giữ lại cho các transaction đang chạy. `VACUUM` tái dùng chỗ, `pg_repack` trả đĩa mà không chặn bảng.
- **Autovacuum kích hoạt ở `50 + 20% số dòng`** — công thức này quá muộn cho bảng lớn (100 triệu dòng phải có 20 triệu xác chết). Phải đặt riêng `autovacuum_vacuum_scale_factor = 0.01`.
- **Ba thứ chặn `VACUUM`** dọn rác trên **toàn bộ database**: transaction dài, khe nhân bản không hoạt động, transaction chuẩn bị sẵn bị bỏ quên.
- `TEXT` và `VARCHAR(n)` **giống hệt nhau trong PostgreSQL** (dùng `TEXT` + `CHECK` để dễ đổi), nhưng **khác nhau trong MySQL** — lời khuyên đúng cho hệ này có thể sai cho hệ khác.
- `NULL` **gọn hơn chuỗi rỗng** và cho phép **index bộ phận nhỏ hơn ~1.200 lần**. Nhưng bẫy nguy hiểm nhất là **`NOT IN` với subquery chứa `NULL` luôn trả về rỗng** — dùng `NOT EXISTS` và `IS DISTINCT FROM`.
- Khoá chính: **`BIGINT` mặc định**, **UUID v7** nếu cần phân tán, **không bao giờ v4**, và **luôn lưu 16 byte nhị phân**.
- **Xoá thật + bảng lưu trữ** thường tốt hơn xoá mềm: bảng chính gọn, không phải nhớ `WHERE deleted_at IS NULL`, `UNIQUE` và khoá ngoại hoạt động bình thường.
- **Bất biến dữ liệu thuộc về database** (không đường nào phá được), **quy trình nghiệp vụ thuộc về ứng dụng** (dễ kiểm thử và triển khai). Trigger chỉ nên làm việc mà mọi đường ghi đều phải làm.
- **Mọi cột phi chuẩn hoá phải đi kèm một truy vấn đối soát** — viết không được truy vấn đó thì đừng phi chuẩn hoá cột đó.

**Bài kế tiếp** → [Phase 17 — Bài 1: WAL, Redo và Undo Logs](../phase-17/01-wal-redo-undo-logs.md)

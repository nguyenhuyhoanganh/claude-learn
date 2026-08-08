# Bài 3: Hỏi & Đáp — Database Internals và Best Practices

Tám câu hỏi về cơ chế bên trong và về những quyết định thiết kế hay bị tranh cãi.

---

## Câu 1 — Vì sao xoá dữ liệu mà bảng không nhỏ lại?

```sql
SELECT pg_size_pretty(pg_relation_size('events'));   -- 42 GB
DELETE FROM events WHERE created_at < '2025-01-01';  -- xoá 30 triệu dòng
SELECT pg_size_pretty(pg_relation_size('events'));   -- VẪN 42 GB
```

Vì `DELETE` **không xoá byte nào**:

```text
   DELETE chỉ ghi một dấu: "tuple này chết từ transaction XID 12345"
     → đặt `xmax` của tuple
     → tuple VẪN NẰM ĐÓ, chiếm nguyên chỗ

   Vì sao phải vậy?  Vì MVCC:
     Transaction khác đang chạy CÓ THỂ vẫn cần thấy dòng đó
     (nếu nó bắt đầu TRƯỚC khi xoá)
     → không được phép xoá thật ngay
```

Ba mức dọn dẹp:

| Lệnh | Làm gì | Khoá | Trả đĩa về HĐH |
|---|---|---|---|
| `VACUUM` | Đánh dấu chỗ trống để **tái dùng** | Nhẹ, chạy song song được | **Không** |
| `VACUUM FULL` | Viết lại cả bảng, gọn lại | **`ACCESS EXCLUSIVE`** — chặn tất cả | **Có** |
| `pg_repack` | Như `VACUUM FULL` nhưng không chặn | Nhẹ (trừ vài giây cuối) | **Có** |

```sql
-- Xem có bao nhiêu rác
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
# Không chặn bảng, khuyến nghị cho production
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
   NGƯỠNG KÍCH HOẠT =  threshold  +  scale_factor × số_dòng

   Bảng 1.000 dòng    →  50 + 0,2×1.000     =        250 dòng chết
   Bảng 100 triệu dòng→  50 + 0,2×100.000.000 = 20.000.050 dòng chết
                                                 ▲
                        PHẢI CÓ 20 TRIỆU dòng chết mới chạy!
```

Đây là vấn đề: **công thức tỉ lệ phần trăm không hợp với bảng lớn**. Bảng 100 triệu dòng tích tụ 20 triệu xác chết (20% phình) trước khi autovacuum động tay.

Cách chữa — đặt riêng cho bảng lớn:

```sql
ALTER TABLE events SET (
    autovacuum_vacuum_scale_factor = 0.01,      -- 1% thay vì 20%
    autovacuum_vacuum_threshold    = 1000,
    autovacuum_analyze_scale_factor = 0.005,    -- ANALYZE còn thường xuyên hơn
    autovacuum_vacuum_cost_delay   = 2          -- chạy nhanh hơn (mặc định 2ms từ PG12)
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
-- 1. Transaction đang mở lâu
SELECT pid, now()-xact_start AS mo_bao_lau, state, left(query,50)
FROM pg_stat_activity WHERE xact_start IS NOT NULL
ORDER BY xact_start LIMIT 5;

-- 2. Khe nhân bản không hoạt động
SELECT slot_name, active, wal_status,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_giu
FROM pg_replication_slots;

-- 3. Transaction chuẩn bị sẵn bị bỏ quên
SELECT gid, prepared, owner FROM pg_prepared_xacts;
```

```text
   VACUUM chỉ dọn được tuple mà KHÔNG transaction nào còn cần thấy.
   → Một transaction mở từ 3 giờ trước chặn việc dọn MỌI THỨ sau đó
   → trên TOÀN BỘ database, không chỉ bảng đó
```

Phòng thủ:

```sql
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';
```

---

## Câu 3 — Nên dùng `TEXT` hay `VARCHAR(n)`?

**Trong PostgreSQL: hoàn toàn như nhau về hiệu năng.**

```text
   `TEXT`, `VARCHAR(n)`, `VARCHAR` đều dùng CÙNG một kiểu lưu trữ bên trong.
   `VARCHAR(n)` chỉ thêm một ràng buộc kiểm tra độ dài.
   → KHÔNG có khác biệt về tốc độ hay dung lượng.
```

Lời khuyên thực dụng:

```sql
-- NÊN: dùng TEXT, và CHECK nếu thật sự cần giới hạn nghiệp vụ
CREATE TABLE users (
    email TEXT NOT NULL CHECK (length(email) <= 254),
    bio   TEXT
);
```

Vì sao `CHECK` tốt hơn `VARCHAR(n)`:

```text
   Đổi VARCHAR(50) thành VARCHAR(100):
     → PostgreSQL 9.2+ không viết lại bảng, nhưng VẪN lấy ACCESS EXCLUSIVE

   Đổi CHECK:
     ALTER TABLE ... DROP CONSTRAINT ..., ADD CONSTRAINT ... NOT VALID;
     ALTER TABLE ... VALIDATE CONSTRAINT ...;
     → khoá NHẸ hơn nhiều
```

**Với MySQL thì khác:**

```text
   VARCHAR(n)  →  lưu trong dòng, đánh index được đầy đủ
   TEXT        →  có thể lưu NGOÀI dòng, index chỉ được TIỀN TỐ 767/3072 byte
                  và không dùng được cho một số thao tác

   → Trên MySQL, VARCHAR(n) thường là lựa chọn đúng.
```

Đây là ví dụ điển hình cho lời khuyên xuyên suốt khoá này: **lời khuyên đúng cho hệ này có thể sai cho hệ khác**.

---

## Câu 4 — `NULL` có ảnh hưởng hiệu năng không?

Có, theo ba hướng — và hướng thứ hai là hướng ít người biết.

### Hướng 1 — `NULL` chiếm rất ít chỗ

```text
   PostgreSQL lưu một BITMAP NULL ở đầu mỗi tuple:
     1 bit cho mỗi cột
     → cột NULL KHÔNG chiếm byte dữ liệu nào

   Bảng 20 cột, 15 cột NULL:
     Với NULL      : 23 byte header + 3 byte bitmap + 5 cột dữ liệu
     Với chuỗi rỗng: 23 byte header + 20 cột dữ liệu
   → NULL GỌN HƠN đáng kể
```

### Hướng 2 — Index bỏ qua được `NULL`

```sql
-- Bảng 100 triệu dòng, chỉ 50.000 dòng có `deleted_at` khác NULL
CREATE INDEX idx_deleted ON orders (deleted_at) WHERE deleted_at IS NOT NULL;
```

```text
   Index đầy đủ     : 2,1 GB
   Index bộ phận    : 1,8 MB      → NHỎ HƠN ~1.200 LẦN
```

Đây là kỹ thuật rất hiệu quả cho các cột "hiếm khi có giá trị": `deleted_at`, `error_message`, `cancelled_at`.

### Hướng 3 — `NULL` làm logic phức tạp và dễ sai

```sql
SELECT * FROM users WHERE status <> 'active';
-- → KHÔNG trả về dòng có status IS NULL!
```

```text
   NULL <> 'active'  →  NULL  (không phải TRUE)
   WHERE chỉ giữ dòng có điều kiện TRUE
   → dòng NULL bị BỎ QUA âm thầm
```

```sql
-- Cách đúng
WHERE status IS DISTINCT FROM 'active';
-- hoặc
WHERE status <> 'active' OR status IS NULL;
```

Toán tử `IS DISTINCT FROM` xử lý `NULL` như một giá trị bình thường — nó là công cụ đúng cho tình huống này và rất ít người dùng.

Tương tự với `NOT IN`:

```sql
-- BẪY: nếu subquery trả về BẤT KỲ NULL nào, kết quả LUÔN RỖNG
SELECT * FROM orders WHERE user_id NOT IN (SELECT id FROM banned_users);

-- AN TOÀN
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
     • Ứng dụng một database
     • Không cần sinh khoá ở client
     • Nhỏ nhất (8 byte), nhanh nhất, không phình index

   ✔ UUID v7  (KHÔNG phải v4)
     • Cần sinh khoá ở nhiều nơi
     • Không muốn lộ quy mô kinh doanh
     • TĂNG DẦN theo thời gian → không gây tách page

   ✘ UUID v4
     • Ngẫu nhiên hoàn toàn → tách page liên tục
     • Đo thật trên PostgreSQL: chèn CHẬM HƠN 3,7 LẦN, index LỚN HƠN 2,1 LẦN
     • Trên InnoDB còn tệ hơn vì bảng cũng sắp theo khoá chính
```

Và quy tắc lưu trữ:

```text
   PostgreSQL : kiểu UUID (16 byte)         — KHÔNG dùng TEXT
   MySQL      : BINARY(16)                  — KHÔNG dùng CHAR(36)

   CHAR(36) lãng phí 20 byte MỖI GIÁ TRỊ,
   và trên InnoDB còn bị NHÂN LÊN trong MỌI index phụ.
```

Mẫu tách đôi khi cần cả hai:

```sql
CREATE TABLE orders (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- kỹ thuật, nội bộ
    order_no UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE     -- đối ngoại
);
```

`id` lo hiệu năng và toàn vẹn tham chiếu; `order_no` lo giao tiếp với thế giới bên ngoài mà không lộ quy mô.

---

## Câu 6 — Xoá mềm hay xoá thật?

```sql
-- Xoá mềm
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
-- VẤN ĐỀ 1: quên `WHERE deleted_at IS NULL` ở một chỗ nào đó
-- → Giải: dùng VIEW hoặc Row Level Security
CREATE VIEW active_orders AS SELECT * FROM orders WHERE deleted_at IS NULL;

-- VẤN ĐỀ 2: UNIQUE gãy
-- → Giải: index BỘ PHẬN
CREATE UNIQUE INDEX idx_email_active ON users (email) WHERE deleted_at IS NULL;

-- VẤN ĐỀ 3: bảng phình mãi
-- → Giải: chuyển dòng đã xoá sang bảng lưu trữ định kỳ
```

Mẫu thực dụng thường tốt hơn cả hai: **xoá thật + bảng lưu trữ**.

```sql
BEGIN;
  INSERT INTO orders_archive SELECT *, now() AS archived_at FROM orders WHERE id = 42;
  DELETE FROM orders WHERE id = 42;
COMMIT;
```

```text
   ✔ Bảng chính gọn, mọi truy vấn nhanh
   ✔ Không cần nhớ `WHERE deleted_at IS NULL` ở đâu cả
   ✔ UNIQUE và khoá ngoại hoạt động bình thường
   ✔ Vẫn khôi phục được
```

Chủ đề này được đào sâu ở [sql-interview/phase-6](../../sql-interview/phase-6/03-soft-delete-hay-xoa-that.md).

---

## Câu 7 — Nên đặt logic nghiệp vụ ở database hay ở ứng dụng?

Đây là câu hỏi gây tranh cãi nhiều nhất, và câu trả lời tốt là **phân biệt hai loại logic**.

```text
   ┌─────────────────────────────────────────────────────────┐
   │ NÊN Ở DATABASE — BẤT BIẾN VỀ DỮ LIỆU                    │
   │   • Ràng buộc: NOT NULL, CHECK, UNIQUE, FOREIGN KEY     │
   │   • Kiểu dữ liệu đúng (đừng TEXT cho mọi thứ)           │
   │   • Cách ly tenant (Row Level Security)                 │
   │   → VÌ: chúng KHÔNG THỂ bị bỏ qua, kể cả khi ứng dụng   │
   │     có bug, hoặc khi có ứng dụng THỨ HAI ghi vào        │
   ├─────────────────────────────────────────────────────────┤
   │ NÊN Ở ỨNG DỤNG — QUY TẮC NGHIỆP VỤ                      │
   │   • Quy trình, luồng trạng thái                          │
   │   • Tính toán giá, khuyến mãi                            │
   │   • Gọi dịch vụ ngoài                                    │
   │   → VÌ: dễ kiểm thử, dễ đọc, dễ triển khai, đúng tay    │
   │     nghề của đội ngũ                                     │
   └─────────────────────────────────────────────────────────┘
```

### Vì sao ràng buộc phải ở database

```text
   Ứng dụng kiểm tra: "email phải duy nhất"
   → nhưng có:
       • một dịch vụ THỨ HAI cũng ghi vào bảng đó
       • một job di trú chạy trực tiếp bằng SQL
       • một kỹ sư sửa tay lúc khẩn cấp
       • một điều kiện tranh chấp giữa hai request
   → MỘT trong những đường đó sẽ phá vỡ quy tắc

   Ràng buộc ở database: KHÔNG ĐƯỜNG NÀO phá được.
```

### Vì sao quy trình không nên ở database

```text
   Stored procedure:
     ✘ Khó kiểm thử tự động
     ✘ Khó quản lý phiên bản trong git
     ✘ Khó gỡ lỗi
     ✘ Khó triển khai dần (không có canary)
     ✘ Khoá chặt vào một hệ quản trị
```

### Vùng xám: trigger

```text
   ✔ HỢP: bộ đếm phi chuẩn hoá, ghi audit, cập nhật updated_at
     → những việc PHẢI luôn xảy ra, không được quên

   ✘ KHÔNG HỢP: logic nghiệp vụ phức tạp, gọi dịch vụ ngoài
     → logic ẨN, đọc code ứng dụng không thấy nó tồn tại
     → gây ra "hành vi ma thuật" rất khó gỡ
```

Quy tắc thực dụng: **trigger chỉ nên làm những việc mà mọi đường ghi đều phải làm, và phải rất ngắn**.

---

## Câu 8 — Khi nào nên phi chuẩn hoá?

```text
   CHUẨN HOÁ là mặc định đúng.  Phi chuẩn hoá là TỐI ƯU CÓ CHỦ ĐÍCH.
   → Chỉ làm khi CÓ SỐ ĐO chứng minh là cần.
```

Ba dạng phi chuẩn hoá, xếp theo mức độ rủi ro:

```text
   1. CỘT ĐẾM SẴN  (rủi ro VỪA)
      users.follower_count, posts.comment_count
      → phải có job đối soát

   2. CỘT CHÉP SANG  (rủi ro CAO)
      orders.customer_name chép từ customers.name
      → đổi tên khách hàng phải cập nhật hàng triệu đơn
      → TRỪ KHI là CÓ CHỦ ĐÍCH: giữ tên LÚC ĐẶT HÀNG

   3. BẢNG TỔNG HỢP  (rủi ro THẤP)
      daily_sales tính sẵn từ orders
      → tính lại được bất cứ lúc nào từ nguồn sự thật
      → AN TOÀN NHẤT
```

Dạng 3 an toàn nhất vì nó **không phải nguồn sự thật** — sai thì tính lại. Dạng 2 nguy hiểm nhất vì bản sao có thể lệch mà không ai biết.

Quy tắc bắt buộc:

```text
   MỖI cột phi chuẩn hoá PHẢI đi kèm MỘT TRUY VẤN ĐỐI SOÁT.
   Nếu không viết được truy vấn đối soát → đừng phi chuẩn hoá cột đó.
```

```sql
-- Ví dụ truy vấn đối soát
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

CREATE UNIQUE INDEX ON daily_sales (ngay);      -- bắt buộc cho CONCURRENTLY

REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales;   -- không chặn đọc
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

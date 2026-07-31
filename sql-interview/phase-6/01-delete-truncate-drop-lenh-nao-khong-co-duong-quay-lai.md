# Bài 1: `DELETE` vs `TRUNCATE` vs `DROP` — lệnh nào không có đường quay lại

23h47, đêm thứ Sáu. Một dev chạy lệnh dọn dữ liệu tạm trên production rồi bình thản bấm Enter. Ba giây sau, 2 triệu đơn hàng bốc hơi. Biểu đồ doanh thu rơi thẳng về 0.

Anh ta nhớ ra phao cứu sinh, gõ:

```sql
ROLLBACK;
```

Màn hình đáp lại:

```text
WARNING: there is no transaction in progress
```

Cái phao anh vẫn tin tưởng bấy lâu **chưa từng được thổi phồng**.

Câu hỏi phỏng vấn *"`DELETE`, `TRUNCATE`, `DROP` khác gì nhau?"* ai cũng thuộc đáp án. Nhưng đêm thứ Sáu đó chứng minh: **thuộc đáp án không cứu được dữ liệu**. Bài này đi từ dòng họ của ba lệnh, tới thứ thật sự giết người — chế độ autocommit.

## Tra dòng họ: DML và DDL

SQL chia lệnh thành các nhóm, và nhóm quyết định hành vi:

```text
DML — Data Manipulation Language (thao tác DỮ LIỆU)
      INSERT, UPDATE, DELETE, SELECT
      → đụng vào từng DÒNG
      → ghi nhật ký từng dòng → rollback được

DDL — Data Definition Language (thao tác CẤU TRÚC)
      CREATE, ALTER, DROP, TRUNCATE
      → đụng vào CẢ ĐỐI TƯỢNG
      → nhiều hệ tự COMMIT ngầm → không rollback được
```

`TRUNCATE` mang họ **DDL** dù nghe như lệnh xoá dữ liệu. Đó là mấu chốt của toàn bộ khác biệt.

| | `DELETE` | `TRUNCATE` | `DROP` |
|---|---|---|---|
| Nhóm | DML | DDL | DDL |
| Xoá gì | Dòng được chọn | Toàn bộ dòng | **Cả bảng** |
| Có `WHERE` | Có | Không | Không |
| Ghi nhật ký từng dòng | Có | Không (chỉ ghi thao tác) | Không |
| Kích hoạt trigger | **Có** | Không | Không |
| Rollback được | Có | **PG: có. MySQL/Oracle: KHÔNG** | **PG: có. MySQL/Oracle: KHÔNG** |
| Reset bộ đếm ID | Không | Có (tuỳ cú pháp) | — (bảng biến mất) |
| Giải phóng đĩa ngay | **Không** (cần `VACUUM`) | Có | Có |
| Tốc độ trên 10 triệu dòng | Phút | Mili giây | Mili giây |
| Cấu trúc bảng còn lại | Còn | Còn | **Mất** |

Điểm gây bất ngờ lớn nhất: **PostgreSQL cho phép rollback cả `TRUNCATE` và `DROP`** vì nó xử lý DDL trong transaction thật (MVCC áp dụng cho cả catalog). MySQL và Oracle thì **tự động commit ngầm** trước và sau mọi lệnh DDL — không có đường về.

```sql
-- PostgreSQL: an toàn
BEGIN;
TRUNCATE orders;
SELECT count(*) FROM orders;   -- 0
ROLLBACK;
SELECT count(*) FROM orders;   -- 2000000  ← dữ liệu quay lại!

-- MySQL: đã xong từ lúc bấm Enter
START TRANSACTION;
TRUNCATE orders;               -- ngầm COMMIT trước và sau lệnh này
ROLLBACK;                      -- không có tác dụng gì
SELECT count(*) FROM orders;   -- 0
```

Biết chi tiết này là ghi điểm ngay — vì đa số ứng viên học thuộc câu *"TRUNCATE không rollback được"* mà không biết nó chỉ đúng với một nửa số hệ quản trị.

## `DELETE` — sát thủ cẩn thận nhất

Nó không bao giờ vội. Nó duyệt từng dòng, và chỉ ra tay với dòng được `WHERE` chọn.

```sql
DELETE FROM orders WHERE status = 'cancelled' AND ordered_at < now() - INTERVAL '2 years';
```

Mỗi dòng bị xoá đều được **ghi vào nhật ký hoàn tác** trước, nên rollback được. Mỗi dòng bị xoá cũng **kích nổ trigger** nếu bảng có trigger — điều này quan trọng cho audit log, nhưng cũng làm `DELETE` chậm gấp bội.

Ba đặc điểm hay bị bỏ qua:

**① `DELETE` không trả lại đĩa.** Trong PostgreSQL, dòng bị xoá chỉ được đánh dấu "chết" (*dead tuple*). Đĩa vẫn bị chiếm cho tới khi `VACUUM` chạy — và `VACUUM` thường chỉ trả chỗ đó cho các lần ghi sau, chứ **không trả về hệ điều hành**.

```sql
-- Sau khi DELETE 90% bảng
SELECT pg_size_pretty(pg_total_relation_size('orders'));   -- vẫn 12 GB

-- Muốn thu hồi thật sự: VACUUM FULL — nhưng nó KHOÁ TOÀN BẢNG
VACUUM FULL orders;                    -- ⚠ ACCESS EXCLUSIVE, có thể hàng giờ

-- Cách không downtime: pg_repack (extension)
pg_repack -t orders -d mydb
```

**② `DELETE` bảng lớn làm nghẽn cả hệ thống.** Xoá 50 triệu dòng trong một transaction sẽ: làm phình WAL/undo log, giữ khoá suốt thời gian đó, làm replica chạy trễ, và nếu bị huỷ giữa chừng thì rollback còn lâu hơn cả lúc xoá.

```sql
-- ✅ Xoá theo lô, mỗi lô một transaction riêng
DO $$
DECLARE so_dong INT;
BEGIN
  LOOP
    DELETE FROM orders
    WHERE order_id IN (
        SELECT order_id FROM orders
        WHERE status = 'cancelled' AND ordered_at < now() - INTERVAL '2 years'
        LIMIT 5000
    );
    GET DIAGNOSTICS so_dong = ROW_COUNT;
    EXIT WHEN so_dong = 0;
    COMMIT;
    PERFORM pg_sleep(0.1);   -- cho replica và autovacuum thở
  END LOOP;
END $$;
```

**③ Bộ đếm ID không lùi.** Ghế số 9 từng có người ngồi thì bỏ trống luôn; người mới nhận số 10. Đây là hành vi đúng — sequence không được phép tái sử dụng số.

## `TRUNCATE` — dọn sạch ruột, giữ nguyên vỏ

Nó không đi từng phòng. Trong mắt nó, dữ liệu của bạn không phải những dòng riêng lẻ — nó **tháo nguyên cả kệ chứa** ra khỏi bảng.

```sql
TRUNCATE TABLE orders;                          -- dọn ruột
TRUNCATE TABLE orders RESTART IDENTITY;         -- + reset bộ đếm ID về 1
TRUNCATE TABLE orders, order_items CASCADE;     -- + truncate luôn bảng con tham chiếu tới
```

Cấu trúc bảng còn nguyên: cột, kiểu dữ liệu, index, ràng buộc, quyền truy cập — đủ cả. Chỉ ruột là sạch bóng.

Điểm quan trọng khi phỏng vấn: **`TRUNCATE` xoá dấu vết**. `RESTART IDENTITY` đưa bộ đếm ID về 1, như chưa từng có ai sống ở đây. Trên môi trường test, đó là tính năng. Trên bảng chạy thật, đó là **mất dấu** — hai bản ghi khác nhau ở hai thời điểm có cùng ID, và mọi log, cache, hệ thống ngoài đang tham chiếu tới ID cũ đều trỏ sai.

`TRUNCATE` cần khoá `ACCESS EXCLUSIVE` — nghĩa là nó **chặn cả `SELECT`**. Với bảng đang được đọc liên tục, lệnh này sẽ đứng chờ, và trong lúc chờ nó chặn luôn mọi query mới xếp hàng sau nó. Đây là cách kinh điển để "treo" một hệ thống bằng một lệnh mà bạn tưởng là nhanh.

```sql
-- An toàn hơn: bỏ cuộc nếu không lấy được khoá trong 3 giây
SET lock_timeout = '3s';
TRUNCATE TABLE orders;
```

## `DROP` — xoá sự tồn tại

Nó không xoá đồ đạc trong nhà. Nó xoá **căn nhà**.

```sql
DROP TABLE orders;
```

Schema cháy. Index cháy. Ràng buộc cháy. Quyền truy cập cháy. Định nghĩa về cái bảng bị nhổ khỏi từ điển hệ thống. Sáng hôm sau, mọi query trỏ về cái tên cũ đồng loạt gào lên:

```text
ERROR: relation "orders" does not exist
```

Nếu bảng khác đang tựa vào bảng này bằng khoá ngoại, database sẽ **chặn** cú đập — cho tới khi bạn thêm `CASCADE`:

```sql
DROP TABLE orders CASCADE;
-- NOTICE: drop cascades to constraint order_items_order_id_fkey on table order_items
-- NOTICE: drop cascades to view v_doanh_thu_thang
```

Đọc kỹ mấy dòng `NOTICE` đó. Chúng đang liệt kê những thứ **vừa sập theo**: view, materialized view, ràng buộc, hàm. `CASCADE` là từ khoá nguy hiểm nhất trong SQL vì nó phá dây chuyền mà không hỏi lại.

Trước khi `DROP`, luôn xem trước ai đang phụ thuộc:

```sql
-- Liệt kê mọi đối tượng phụ thuộc vào bảng
SELECT DISTINCT dependent_ns.nspname || '.' || dependent_view.relname AS phu_thuoc
FROM pg_depend
JOIN pg_rewrite     ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_class AS source_table   ON pg_depend.refobjid = source_table.oid
JOIN pg_namespace dependent_ns  ON dependent_view.relnamespace = dependent_ns.oid
WHERE source_table.relname = 'orders';
```

## Thủ phạm thật: autocommit

Đây là chỗ đêm thứ Sáu được giải mã.

Anh dev đó chạy `DELETE` — lệnh **hiền lành nhất**, lệnh có rollback. Vậy vì sao rollback không cứu được?

Vì `ROLLBACK` chỉ cứu được khi **transaction còn đang mở**. Mà gần như mọi client SQL đều bật **autocommit** theo mặc định:

```text
Autocommit BẬT (mặc định ở psql, MySQL CLI, DBeaver, DataGrip, mọi driver):
   Mỗi lệnh bạn gõ được bọc trong transaction riêng và COMMIT NGAY sau khi chạy xong.
   Bạn gõ ROLLBACK → không còn gì để rollback nữa.

Hung thủ không phải lệnh xoá. Hung thủ là CHẾ ĐỘ MẶC ĐỊNH.
```

Kiểm tra và tắt:

```sql
-- psql
\echo :AUTOCOMMIT
\set AUTOCOMMIT off

-- MySQL
SELECT @@autocommit;
SET autocommit = 0;
```

Trong DBeaver / DataGrip: chuyển toolbar sang chế độ *Manual Commit*. Với môi trường production, nên đặt đây là **mặc định vĩnh viễn** cho mọi kết nối tay.

## Bùa hộ mệnh: quy trình chạy lệnh xoá trên production

```sql
-- ① MỞ TRANSACTION TRƯỚC, luôn luôn
BEGIN;

-- ② Đếm trước để biết mình sắp đụng vào bao nhiêu
SELECT count(*) FROM orders
WHERE status = 'cancelled' AND ordered_at < now() - INTERVAL '2 years';
-- 18432   ← con số này phải khớp với kỳ vọng của bạn

-- ③ Chạy lệnh xoá — GIỮ NGUYÊN điều kiện, chỉ đổi SELECT thành DELETE
DELETE FROM orders
WHERE status = 'cancelled' AND ordered_at < now() - INTERVAL '2 years';
-- DELETE 18432   ← khớp với bước ② chứ?

-- ④ Kiểm chứng lần cuối
SELECT count(*) FROM orders;

-- ⑤ Đúng thì chốt, sai thì huỷ
COMMIT;   -- hoặc ROLLBACK;
```

**Con số ở bước ③ là chốt chặn cuối cùng.** Nếu bạn định xoá vài nghìn dòng mà màn hình báo `DELETE 1284917`, bạn còn đúng một giây để gõ `ROLLBACK` — với điều kiện bạn đã mở `BEGIN`.

Ba lớp bảo vệ, xếp theo độ rẻ:

| Lớp | Cách làm | Chi phí |
|---|---|---|
| **Nhìn trước** | Viết `SELECT` với đúng điều kiện, xem số dòng | 3 giây |
| **Chặn lại** | `BEGIN` → chạy → đọc số dòng → `COMMIT`/`ROLLBACK` | 10 giây |
| **Bọc ngoài** | Tài khoản chỉ đọc cho việc hằng ngày; `SET lock_timeout`; MySQL safe-updates | Cài một lần |

```sql
-- MySQL: chặn UPDATE/DELETE không có WHERE dùng khoá
SET sql_safe_updates = 1;
DELETE FROM orders;
-- ERROR 1175: You are using safe update mode and you tried to update a table
--             without a WHERE that uses a KEY column

-- PostgreSQL: không có safe-updates, nhưng có tài khoản chỉ đọc
CREATE ROLE analyst LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE shop TO analyst;
GRANT USAGE ON SCHEMA public TO analyst;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analyst;
-- Dùng tài khoản này cho MỌI việc, chỉ đổi sang tài khoản ghi khi thật sự cần ghi
```

## Khi đã lỡ tay: đường về duy nhất

```text
Lệnh đã COMMIT rồi → database không giúp được nữa. Chỉ còn ba cửa:

① Backup + PITR (Point-In-Time Recovery)
   Khôi phục về đúng thời điểm TRƯỚC lệnh xoá.
   Điều kiện: có base backup + WAL archive liên tục.
   Thực tế: khôi phục ra một database TẠM, lấy đúng bảng cần, rồi chép ngược.

② Replica còn trễ
   Nếu có replica cấu hình recovery_min_apply_delay (ví dụ trễ 1 giờ),
   dữ liệu vẫn còn ở đó. Tạm dừng replay ngay lập tức rồi trích ra.

③ Log tầng ứng dụng / kho dữ liệu / CDC stream
   Nếu bạn stream thay đổi sang Kafka/S3, dữ liệu vẫn còn ở đó.
```

Và một sự thật đắng: **backup chưa từng được restore thử thì không phải backup**. Nó là một file. Lịch kiểm tra khôi phục hàng quý là thứ phân biệt team có backup thật với team có "cảm giác an toàn".

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tin `ROLLBACK` mà không mở `BEGIN` | Autocommit đã chốt xong từ lâu | Tắt autocommit trên production |
| Tin "TRUNCATE không rollback được" ở mọi hệ | Sai — Postgres rollback được | Biết rõ hệ mình dùng |
| `DELETE` bảng lớn trong một transaction | Phình WAL, khoá lâu, replica trễ, rollback còn lâu hơn | Xoá theo lô, commit từng lô |
| Tưởng `DELETE` trả lại đĩa | Bảng vẫn 12 GB sau khi xoá 90% | `VACUUM FULL` (khoá) hoặc `pg_repack` |
| `TRUNCATE` trên bảng đang được đọc | Chờ khoá `ACCESS EXCLUSIVE`, chặn cả hàng đợi phía sau | `SET lock_timeout` |
| `TRUNCATE ... RESTART IDENTITY` trên production | ID tái sử dụng → log và hệ thống ngoài trỏ sai | Không reset ID trên bảng thật |
| `DROP ... CASCADE` không đọc `NOTICE` | View, FK, hàm sập theo mà không biết | Kiểm phụ thuộc trước |
| Dùng tài khoản superuser cho việc hằng ngày | Một lệnh sai là hết | Tài khoản chỉ đọc mặc định |
| Không kiểm thử khôi phục backup | Đêm cần dùng mới biết nó hỏng | Diễn tập khôi phục định kỳ |

## Câu hỏi phỏng vấn hay gặp

**H: `DELETE`, `TRUNCATE`, `DROP` khác nhau thế nào?**
`DELETE` là DML, xoá theo `WHERE`, ghi nhật ký từng dòng, kích hoạt trigger, rollback được, chậm, và không trả lại đĩa ngay. `TRUNCATE` là DDL, xoá sạch ruột bảng trong một thao tác, không trigger, rất nhanh, giải phóng đĩa ngay, và **rollback được trên PostgreSQL nhưng không trên MySQL/Oracle**. `DROP` xoá cả cấu trúc bảng khỏi database.

**H: Xoá 50 triệu dòng trên bảng production, làm thế nào?**
Không chạy một `DELETE` duy nhất — nó phình WAL, giữ khoá lâu, làm replica trễ và nếu huỷ giữa chừng thì rollback còn lâu hơn. Em xoá theo lô 5.000–10.000 dòng, commit từng lô, nghỉ ngắn giữa các lô cho replica và autovacuum kịp theo. Nếu xoá gần hết bảng thì cách rẻ hơn nhiều là **tạo bảng mới chỉ chứa phần giữ lại rồi đổi tên**, hoặc dùng partition và `DROP PARTITION`.

**H: Vì sao `DELETE` xong bảng vẫn nặng như cũ?**
Postgres chỉ đánh dấu dòng là chết chứ không trả chỗ ngay; đĩa được `VACUUM` thu hồi để tái dùng cho lần ghi sau, chứ không trả về hệ điều hành. Muốn thu hồi thật thì `VACUUM FULL` (khoá toàn bảng) hoặc `pg_repack` (không downtime).

**H: Đêm đó anh ấy chạy `DELETE` mà sao `ROLLBACK` không cứu được?**
Vì client bật autocommit — mỗi lệnh được commit ngay sau khi chạy xong, nên lúc gõ `ROLLBACK` thì không còn transaction nào đang mở. Hung thủ không phải lệnh xoá, mà là chế độ mặc định. Bùa hộ mệnh chỉ có hai lá: mở `BEGIN` trước khi đụng lệnh xoá, và một bản backup **đã được restore thử**.

**H: Có cách nào xoá gần hết bảng mà nhanh không?**
Đảo ngược bài toán: tạo bảng mới chỉ chứa phần muốn giữ, rồi hoán đổi tên trong một transaction ngắn. Xoá 95% của bảng 100 triệu dòng theo cách này mất vài phút thay vì vài giờ, và không để lại bloat. Nếu bảng đã được phân vùng theo thời gian thì còn đơn giản hơn: `DROP TABLE` trên partition cũ, tức thì.

## Tóm tắt bài 1

- `DELETE` là **DML** (từng dòng, có trigger, có rollback, chậm, không trả đĩa ngay); `TRUNCATE` và `DROP` là **DDL**.
- **PostgreSQL rollback được cả `TRUNCATE` và `DROP`**; MySQL/Oracle commit ngầm — biết chi tiết này là ghi điểm.
- Thủ phạm thật của mọi tai nạn xoá dữ liệu là **autocommit**, không phải lệnh xoá.
- Quy trình bắt buộc: `BEGIN` → `SELECT count(*)` → chạy lệnh → **đọc số dòng bị ảnh hưởng** → `COMMIT` hoặc `ROLLBACK`.
- Xoá bảng lớn: theo lô, commit từng lô; hoặc đảo bài toán — tạo bảng mới chứa phần giữ lại rồi đổi tên; hoặc `DROP PARTITION`.
- Sau khi đã commit, đường về duy nhất là **backup + PITR**, replica trễ, hoặc CDC stream. Backup chưa restore thử thì chỉ là một file.

**Bài kế tiếp** → [Bài 2: Quên `WHERE`, thiếu `ON` và quy trình chạy lệnh trên production](02-quen-where-thieu-on-va-quy-trinh-chay-lenh-tren-production.md)

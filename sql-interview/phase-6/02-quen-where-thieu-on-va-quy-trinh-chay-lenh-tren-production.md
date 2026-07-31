# Bài 2: Quên `WHERE`, thiếu `ON` và quy trình chạy lệnh trên production

11h47 đêm. Hùng chỉ cần sửa giá của **đúng một** sản phẩm. Anh gõ lệnh cập nhật, đặt giá về 0 để test, rồi nhấn Enter mà không nhìn lại dòng vừa gõ.

Terminal im lặng đúng một nhịp, rồi trả về:

```text
UPDATE 1284917
```

Toàn bộ kho hàng vừa có giá 0 đồng.

Thiếu đúng một mệnh đề. Không phải lỗi cú pháp. Không có cảnh báo nào. **Câu lệnh chạy đúng như bạn viết** — và đó mới là chỗ đáng sợ nhất.

## Vì sao SQL lại cho phép chuyện này

`WHERE` không phải bộ lọc thêm vào cho đẹp. Trong SQL, mọi câu lệnh đều thao tác trên **một tập hợp**, và tập hợp mặc định của `UPDATE` hay `DELETE` là **toàn bộ số dòng trong bảng**. Bạn chỉ được phép **thu nó lại**.

```text
Hình dung một cái rây, cả bảng đổ lên trên:

    ┌──────── 1.284.917 dòng ────────┐
    ▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼▼
    ══════════ WHERE ══════════       ← những lỗ rây quyết định dòng nào lọt xuống
              ▼   ▼
           chỉ 1 dòng bị sửa

Không viết WHERE = KHÔNG CÓ RÂY. Tất cả cùng rơi xuống.
```

SQL là ngôn ngữ **khai báo**: bạn mô tả kết quả mong muốn, nó thực hiện đúng như thế. Nó không có khái niệm *"bạn lỡ tay"*. Nếu bạn mô tả "mọi dòng", nó sửa mọi dòng — không hỏi lại.

## Bẫy thứ hai: thiếu `ON` — nó không xoá, nó **nhân bản**

Bẫy này lịch sự hơn nhiều, nên khó thấy hơn nhiều.

```sql
-- Quên điều kiện ghép
SELECT * FROM orders, customers;
--            ▲ dấu phẩy = CROSS JOIN, không có ON

-- 100.000 đơn × 50.000 khách = 5.000.000.000 dòng
```

Cơ sở dữ liệu đang làm **đúng định nghĩa toán học**: tích Descartes. Mỗi dòng bảng trái ghép với mọi dòng bảng phải. Câu lệnh không sai cú pháp — nó chỉ chạy mãi không xong, ăn hết bộ nhớ tạm, đầy đĩa `temp`, và kéo theo mọi query khác đang xếp hàng.

Và đây là lúc **hai cái bẫy gặp nhau**:

```sql
-- UPDATE có JOIN mà thiếu điều kiện ghép
UPDATE orders o
SET status = 'paid'
FROM payments p;
--  ▲ thiếu WHERE o.order_id = p.order_id

-- Số dòng bị đụng vào KHÔNG phải số dòng bạn nhìn thấy,
-- mà là tích của hai bảng — và mỗi dòng orders bị ghi đè nhiều lần.
```

`DELETE ... USING` cũng vậy. Đây là lý do mẹo "chạy `SELECT` trước" ở phần sau **có giá của nó** — sẽ nói rõ.

## Quy trình ba lớp: nhìn trước, chặn lại, bọc ngoài

### Lớp 1 — Nhìn trước bằng `SELECT` (3 giây)

Mẹo cứu mạng chỉ có một câu: **viết `SELECT` với đúng điều kiện đó trước, rồi chỉ đổi một từ ở đầu dòng.**

```sql
-- ① Viết câu SELECT trước
SELECT * FROM products WHERE sku = 'AO-TRANG-M';
-- 1 dòng   ← đúng cái mình muốn

-- ② Đổi ĐÚNG MỘT TỪ ở đầu, giữ nguyên toàn bộ phần điều kiện
UPDATE products SET price = 0 WHERE sku = 'AO-TRANG-M';
```

Điểm mấu chốt: **bạn không gõ lại câu lệnh, bạn chỉ thay từ đầu dòng.** Không gõ lại thì không gõ sai.

Có một cách viết còn an toàn hơn — soạn sẵn câu `UPDATE` nhưng để `WHERE` ở trên:

```sql
-- Viết điều kiện TRƯỚC, lệnh SAU. Nếu lỡ chạy nửa chừng thì cũng chỉ là SELECT.
SELECT count(*)
--UPDATE products SET price = 0
FROM products
WHERE sku = 'AO-TRANG-M';
```

### Lớp 2 — Chặn lại bằng transaction (10 giây)

```sql
BEGIN;

UPDATE products SET price = 0 WHERE sku = 'AO-TRANG-M';
-- UPDATE 1        ← con số này là chốt chặn cuối cùng

-- Kiểm chứng bằng mắt trước khi chốt
SELECT product_id, sku, price FROM products WHERE sku = 'AO-TRANG-M';

COMMIT;   -- hoặc ROLLBACK; nếu con số không khớp
```

Với `UPDATE`, `RETURNING` cho bạn thấy **chính xác những dòng vừa đổi** trước khi commit:

```sql
BEGIN;
UPDATE products SET price = 0
WHERE sku = 'AO-TRANG-M'
RETURNING product_id, sku, price;
-- product_id | sku         | price
--        142 | AO-TRANG-M  |  0.00
COMMIT;
```

### Lớp 3 — Bọc ngoài bằng thói quen và cấu hình (cài một lần)

```sql
-- ① Tắt autocommit vĩnh viễn cho kết nối tay
-- psql: thêm vào ~/.psqlrc
\set AUTOCOMMIT off
\set PROMPT1 '%[%033[1;31m%]%/%[%033[0m%]%R%# '   -- nhắc tên database bằng màu đỏ

-- ② MySQL: chặn UPDATE/DELETE không dùng khoá
SET sql_safe_updates = 1;

-- ③ Đặt trần thời gian giữ khoá — nếu lệnh chạy quá lâu thì tự bỏ
SET lock_timeout       = '5s';
SET statement_timeout  = '30s';

-- ④ Tài khoản chỉ đọc là mặc định; chỉ đổi sang tài khoản ghi khi thật sự cần ghi
```

Thêm hai thói quen của người từng bị đau:

- **Đặt tên kết nối production bằng màu đỏ** trong DBeaver/DataGrip. Trò này nghe trẻ con nhưng cứu được rất nhiều người khỏi chạy nhầm cửa sổ.
- **Không bao giờ chạy tay lúc nửa đêm.** Tỷ lệ sai của con người lúc 23h47 cao gấp nhiều lần lúc 10 giờ sáng. Nếu không cháy nhà, để tới sáng.

## Đào sâu: mẹo "SELECT trước" có hai cái giá

Đây là chỗ tách người đã đọc tài liệu với người đã đau.

### Giá thứ nhất: `SELECT` và `DELETE` đếm hai tập khác nhau khi có JOIN

```sql
-- Bạn nhìn thấy:
SELECT o.* FROM orders o
JOIN order_items i ON i.order_id = o.order_id
WHERE i.product_id = 42;
-- 100 dòng

-- Bạn xoá:
DELETE FROM orders o
USING order_items i
WHERE i.order_id = o.order_id AND i.product_id = 42;
-- DELETE 100    ← có vẻ khớp...
```

Nhưng nếu một đơn hàng có **nhiều dòng** chứa product 42, `SELECT` trả về 100 dòng **có lặp** trong khi `DELETE` xoá đúng số đơn **duy nhất**. Ngược lại, với `UPDATE ... FROM`, một dòng đích khớp nhiều dòng nguồn sẽ bị ghi đè **nhiều lần** và bạn không kiểm soát được giá trị cuối cùng — PostgreSQL không báo lỗi, nó chỉ chọn một dòng nguồn tuỳ ý.

```sql
-- ✅ Cách kiểm chứng đúng khi có JOIN: đếm số dòng ĐÍCH duy nhất
SELECT count(DISTINCT o.order_id) FROM orders o
JOIN order_items i ON i.order_id = o.order_id
WHERE i.product_id = 42;
```

### Giá thứ hai: `NULL` sống sót một cách lặng lẽ

```sql
-- Điều kiện nghe như bao trùm mọi dòng còn lại
DELETE FROM users WHERE status <> 'active';
```

Dòng có `status IS NULL` **không thoả** bất kỳ phép so sánh nào — `NULL <> 'active'` cho ra `UNKNOWN`, mà `WHERE` chỉ giữ `TRUE`. Nên chúng sống sót, âm thầm, và bạn tưởng đã dọn sạch.

```sql
-- ✅ Viết cho đủ
DELETE FROM users WHERE status IS DISTINCT FROM 'active';
-- hoặc
DELETE FROM users WHERE status <> 'active' OR status IS NULL;
```

Đây chính là logic ba trị của phase-2 bài 3, xuất hiện ở nơi nguy hiểm nhất: lệnh xoá.

## Một chuyện nữa: `UPDATE` không có `WHERE` vẫn có thể "đúng"

Có những lệnh cố ý không cần `WHERE`:

```sql
UPDATE settings SET updated_at = now();   -- bảng 3 dòng, hoàn toàn hợp lý
```

Nên không thể cấm tuyệt đối. Cách phòng thực tế là **giới hạn thiệt hại**, không phải cấm:

```sql
-- PostgreSQL: chưa có LIMIT cho UPDATE/DELETE, dùng subquery
UPDATE products SET price = 0
WHERE product_id IN (
    SELECT product_id FROM products WHERE sku = 'AO-TRANG-M' LIMIT 10
);

-- MySQL: có LIMIT trực tiếp
UPDATE products SET price = 0 WHERE sku = 'AO-TRANG-M' LIMIT 10;
```

Và ở tầng kiến trúc, đây là lý do các team trưởng thành **không cho ai chạy tay trên production**:

```text
Thay đổi dữ liệu production đi qua đúng một trong ba cửa:

① Migration có review + có script rollback + chạy qua CI
② Admin tool có phân quyền, có audit log, có giới hạn số dòng
③ Runbook được duyệt trước, có người thứ hai ngồi cạnh xem màn hình

Cửa thứ tư — "mở terminal gõ đại" — là cửa dẫn tới 11h47 đêm.
```

## Trường hợp đặc biệt: `UPDATE` khiến dòng "nhảy" qua bộ lọc của chính nó

Một bẫy tinh vi mà ít tài liệu nhắc:

```sql
-- Ý định: tăng giá 10% cho sản phẩm dưới 100k
UPDATE products SET price = price * 1.1 WHERE price < 100000;
```

Trong PostgreSQL, câu này **an toàn**: `UPDATE` làm việc trên ảnh chụp (snapshot) tại thời điểm bắt đầu lệnh, mỗi dòng chỉ được xử lý đúng một lần. Nhưng cùng logic đó viết bằng vòng lặp ở tầng ứng dụng thì không:

```python
# ❌ Chạy lặp cho tới khi "không còn dòng nào" — vòng lặp vô tận
while True:
    n = db.execute("UPDATE products SET price = price*1.1 WHERE price < 100000")
    if n == 0: break
    # Dòng vừa tăng vẫn có thể < 100000 → lại được chọn ở vòng sau
```

Bài học: khi xử lý theo lô, **điều kiện chọn lô phải là thứ mà chính lệnh đó thay đổi thành không-còn-thoả** (ví dụ đánh dấu cột `da_xu_ly`), hoặc phải dùng khoảng ID cố định.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `WHERE` trong `UPDATE`/`DELETE` | Toàn bảng bị sửa/xoá | `SELECT` trước, `BEGIN` bọc ngoài |
| Quên `ON` khi ghép bảng | Tích Descartes, treo hệ thống | Luôn viết `JOIN ... ON`, không dùng dấu phẩy |
| `UPDATE ... FROM` thiếu điều kiện ghép | Số dòng bị đụng = tích hai bảng | Kiểm bằng `count(DISTINCT khoá_đích)` |
| Tin số dòng của `SELECT` khi có JOIN | `SELECT` đếm dòng lặp, `DELETE` đếm dòng đích | Đếm `DISTINCT` khoá chính |
| `WHERE col <> 'x'` khi cột có `NULL` | Dòng `NULL` sống sót lặng lẽ | `IS DISTINCT FROM` |
| Chạy tay trên production lúc nửa đêm | Tỷ lệ sai cao nhất | Để tới sáng, có người thứ hai |
| Kết nối production trông giống staging | Chạy nhầm cửa sổ | Đặt màu đỏ + prompt hiện tên DB |
| Không đặt `statement_timeout` | Một lệnh sai treo cả hệ thống | Đặt mặc định cho mọi phiên tay |
| Vòng lặp cập nhật với điều kiện tự thoả lại | Vòng lặp vô tận | Đánh dấu cột `da_xu_ly` hoặc dùng khoảng ID |

## Câu hỏi phỏng vấn hay gặp

**H: Làm sao tránh chạy `UPDATE` quên `WHERE` trên production?**
Ba lớp. Nhìn trước: viết `SELECT` với đúng điều kiện rồi **chỉ đổi một từ ở đầu dòng** — không gõ lại thì không gõ sai. Chặn lại: `BEGIN`, chạy, đọc số dòng bị ảnh hưởng, khớp thì `COMMIT` không khớp thì `ROLLBACK`. Bọc ngoài: tắt autocommit, tài khoản chỉ đọc là mặc định, `statement_timeout`, và MySQL thì bật `sql_safe_updates`.

**H: Mẹo "SELECT trước" có bao giờ nói dối không?**
Có, hai chỗ. Khi câu lệnh có JOIN, `SELECT` đếm dòng **sau khi nhân**, còn `DELETE` xoá số dòng đích **duy nhất** — hai con số khác nhau; phải đếm `DISTINCT` khoá chính. Và với `NULL`: điều kiện `<> 'x'` nghe như bao trùm phần còn lại nhưng dòng `NULL` không thoả, nên chúng sống sót im lặng.

**H: Thiếu `ON` thì chuyện gì xảy ra?**
Database làm đúng định nghĩa toán học: tích Descartes, mỗi dòng trái ghép mọi dòng phải. Nó không mất dữ liệu, nó **làm dữ liệu phình ra** — và một truy vấn phình đủ to thì treo cả hệ thống vì ăn hết bộ nhớ tạm và đĩa temp. Nguy hiểm hơn khi nó nằm trong `UPDATE ... FROM`: một dòng đích khớp nhiều dòng nguồn sẽ bị ghi đè nhiều lần và giá trị cuối cùng là tuỳ ý.

**H: Nếu lỡ tay rồi thì sao?**
Nếu transaction còn mở thì `ROLLBACK` ngay. Nếu đã commit thì database hết cách — chỉ còn backup + PITR khôi phục về thời điểm trước lệnh, replica cấu hình trễ, hoặc CDC stream. Và bài học thật không nằm ở cách khôi phục, mà ở chỗ **thay đổi production không nên đi qua terminal của một người**: nó nên đi qua migration có review, hoặc admin tool có audit log và giới hạn số dòng.

## Tóm tắt bài 2

- Tập mặc định của `UPDATE`/`DELETE` là **toàn bộ bảng**; `WHERE` chỉ để **thu nó lại**. SQL không có khái niệm "lỡ tay".
- Thiếu `ON` không làm mất dữ liệu — nó làm dữ liệu **phình ra** theo tích hai bảng, và đủ để treo hệ thống.
- Ba lớp bảo vệ: **nhìn trước** (`SELECT`, đổi một từ), **chặn lại** (`BEGIN` + đọc số dòng + `RETURNING`), **bọc ngoài** (autocommit off, tài khoản chỉ đọc, timeout, safe-updates).
- Mẹo "SELECT trước" nói dối ở hai chỗ: **JOIN làm lệch số dòng** và **`NULL` sống sót qua `<>`**.
- Con số `UPDATE n` / `DELETE n` là **chốt chặn cuối cùng** — luôn đọc nó trước khi commit.
- Ở tầng kiến trúc: thay đổi production đi qua migration có review hoặc admin tool có audit, không qua terminal lúc nửa đêm.

**Bài kế tiếp** → [Bài 3: Soft delete hay xoá thật?](03-soft-delete-hay-xoa-that.md)

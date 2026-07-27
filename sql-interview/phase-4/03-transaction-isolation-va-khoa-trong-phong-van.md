# Bài 3: Transaction, isolation và khoá trong phỏng vấn

Đây là mảng mà ứng viên hay bị hỏi bất ngờ. Bạn ứng tuyển vị trí data hoặc backend, luyện kỹ JOIN với window function, rồi người phỏng vấn hỏi: *"Hai người cùng đặt chỗ ngồi cuối cùng, làm sao đảm bảo chỉ một người đặt được?"*. Đó không phải câu hỏi SQL thuần — nó kiểm tra bạn có hiểu điều gì xảy ra khi nhiều transaction chạy đồng thời hay không.

Bài này gói gọn phần kiến thức đó theo hướng phỏng vấn: các hiện tượng đọc sai, isolation level, và ba cách xử lý tranh chấp mà bạn cần nói tên được.

## ACID trong ba mươi giây

| Chữ | Nghĩa | Ví dụ thất bại nếu thiếu |
|---|---|---|
| **A**tomicity | Toàn bộ hoặc không gì cả | Trừ tiền tài khoản A xong thì lỗi, chưa cộng cho B |
| **C**onsistency | Dữ liệu luôn thoả mọi ràng buộc | Đơn hàng trỏ tới khách không tồn tại |
| **I**solation | Transaction đồng thời không thấy trạng thái dở dang của nhau | Đọc được số dư giữa chừng của giao dịch khác |
| **D**urability | Đã commit là còn, kể cả mất điện | Báo thành công xong khởi động lại thì mất |

Trong bốn chữ, **Isolation là chữ duy nhất có nhiều mức**, và cũng là chữ chiếm gần hết thời lượng câu hỏi phỏng vấn.

## Bốn hiện tượng đọc sai

```text
① DIRTY READ — đọc dữ liệu CHƯA commit
   T1: UPDATE so_du = 200 (chưa commit)
   T2:                        SELECT so_du → 200   ← đọc trúng dữ liệu bẩn
   T1: ROLLBACK                                     ← 200 chưa bao giờ tồn tại thật

② NON-REPEATABLE READ — đọc CÙNG một dòng hai lần, ra hai giá trị
   T1: SELECT so_du → 100
   T2:                        UPDATE so_du = 200; COMMIT
   T1: SELECT so_du → 200   ← cùng dòng, khác kết quả trong cùng transaction

③ PHANTOM READ — đọc cùng ĐIỀU KIỆN hai lần, số DÒNG thay đổi
   T1: SELECT COUNT(*) WHERE city='Ha Noi' → 5
   T2:                        INSERT khách mới ở Ha Noi; COMMIT
   T1: SELECT COUNT(*) WHERE city='Ha Noi' → 6   ← xuất hiện "bóng ma"

④ LOST UPDATE — hai transaction cùng ghi, một bản cập nhật BIẾN MẤT
   T1: SELECT ton_kho → 10
   T2:                        SELECT ton_kho → 10
   T1: UPDATE ton_kho = 9 (bán 1)
   T2:                        UPDATE ton_kho = 9 (bán 1)   ← đúng ra phải là 8
```

Hiện tượng ④ là thứ gây thiệt hại thật nhiều nhất, nhưng lại **không** nằm trong bảng chuẩn SQL — nên nhiều tài liệu bỏ qua. Nhắc tới nó khi phỏng vấn thường tạo ấn tượng tốt.

## Bốn mức isolation

| Mức | Dirty read | Non-repeatable | Phantom | Ghi chú |
|---|---|---|---|---|
| `READ UNCOMMITTED` | Có thể | Có thể | Có thể | PostgreSQL không thực sự cài đặt (xử lý như READ COMMITTED) |
| `READ COMMITTED` | Không | Có thể | Có thể | **Mặc định của PostgreSQL, Oracle, SQL Server** |
| `REPEATABLE READ` | Không | Không | Có thể (theo chuẩn) | **Mặc định của MySQL/InnoDB** |
| `SERIALIZABLE` | Không | Không | Không | Chậm nhất, an toàn nhất |

```text
        AN TOÀN ────────────────────────────────► HIỆU NĂNG
        SERIALIZABLE   REPEATABLE READ   READ COMMITTED   READ UNCOMMITTED
```

Hai chi tiết cài đặt hay được hỏi vặn — biết được thì rất nổi bật:

**PostgreSQL `REPEATABLE READ` cũng chặn luôn phantom read**, dù chuẩn SQL không yêu cầu. Nó dùng ảnh chụp (snapshot) toàn bộ tại thời điểm bắt đầu transaction, nên số dòng không thể thay đổi giữa chừng. Đổi lại, khi hai transaction xung đột ghi, Postgres báo lỗi `could not serialize access` và ứng dụng **phải tự thử lại**.

**MySQL `REPEATABLE READ` dùng gap lock** (khoá cả khoảng trống giữa các giá trị index) để chặn phantom, nên hành vi khoá phức tạp hơn và dễ deadlock hơn Postgres.

```sql
-- Đặt mức isolation cho một transaction
BEGIN ISOLATION LEVEL REPEATABLE READ;
-- ...
COMMIT;

-- Xem mức hiện tại
SHOW transaction_isolation;      -- PostgreSQL
SELECT @@transaction_isolation;  -- MySQL
```

## Lost update: ba cách xử lý

Đây là bài toán trung tâm. Kịch bản: hai người cùng mua sản phẩm cuối cùng.

### Cách 1: Ghi nguyên tử (đơn giản nhất, nên ưu tiên)

```sql
-- SAI: đọc rồi ghi ở tầng ứng dụng
SELECT ton_kho FROM products WHERE product_id = 1;    -- app đọc được 10
UPDATE products SET ton_kho = 9 WHERE product_id = 1; -- app tự tính 10 - 1

-- ĐÚNG: để database tính, một câu lệnh nguyên tử
UPDATE products
SET ton_kho = ton_kho - 1
WHERE product_id = 1 AND ton_kho > 0
RETURNING ton_kho;
```

Nếu `RETURNING` không trả dòng nào, nghĩa là hết hàng — và không có transaction nào đè lên nhau được, vì `UPDATE` tự lấy khoá dòng trong lúc thực thi. Đây là cách rẻ nhất và nên là câu trả lời đầu tiên.

### Cách 2: Khoá bi quan (`SELECT FOR UPDATE`)

Dùng khi cần đọc, tính toán phức tạp, rồi mới ghi:

```sql
BEGIN;
SELECT ton_kho FROM products WHERE product_id = 1 FOR UPDATE;
--     ▲ khoá dòng này; transaction khác gọi FOR UPDATE trên cùng dòng sẽ phải CHỜ

-- tính toán nghiệp vụ ở đây

UPDATE products SET ton_kho = ton_kho - 1 WHERE product_id = 1;
COMMIT;   -- khoá được nhả tại đây
```

| Biến thể | Hành vi khi dòng đang bị khoá |
|---|---|
| `FOR UPDATE` | Chờ tới khi được |
| `FOR UPDATE NOWAIT` | Báo lỗi ngay — dùng khi thà thất bại nhanh |
| `FOR UPDATE SKIP LOCKED` | Bỏ qua dòng đó, lấy dòng khác — **nền tảng của hàng đợi công việc** |
| `FOR SHARE` | Khoá đọc: người khác đọc được, không ghi được |

`SKIP LOCKED` đáng học riêng vì nó giải bài toán "nhiều worker cùng lấy việc từ một bảng" mà không cần hệ thống hàng đợi riêng:

```sql
-- Mỗi worker lấy 10 job khác nhau, không giẫm chân nhau, không phải chờ nhau
WITH lay_viec AS (
    SELECT job_id FROM jobs
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 10
    FOR UPDATE SKIP LOCKED
)
UPDATE jobs j
SET status = 'processing', started_at = now()
FROM lay_viec l
WHERE j.job_id = l.job_id
RETURNING j.*;
```

Nêu được mẫu này khi phỏng vấn backend gần như luôn ghi điểm — nó là cách triển khai hàng đợi bằng chính database, tránh phải thêm một hệ thống mới.

### Cách 3: Khoá lạc quan (optimistic locking)

Không khoá gì cả; thay vào đó kiểm tra dữ liệu có bị đổi từ lúc đọc hay không:

```sql
ALTER TABLE products ADD COLUMN version INT NOT NULL DEFAULT 0;

-- Đọc kèm version
SELECT product_id, ton_kho, version FROM products WHERE product_id = 1;  -- version = 7

-- Ghi kèm điều kiện version
UPDATE products
SET ton_kho = 9, version = version + 1
WHERE product_id = 1 AND version = 7;
-- rowcount = 0 → có người khác đã sửa → đọc lại và thử lại ở tầng ứng dụng
```

| | Bi quan (`FOR UPDATE`) | Lạc quan (version) |
|---|---|---|
| Khi tranh chấp | Chờ | Thất bại, phải thử lại |
| Phù hợp khi | Tranh chấp **nhiều** | Tranh chấp **ít** |
| Rủi ro | Deadlock, chờ lâu | Nhiều lần thử lại vô ích |
| Yêu cầu | Transaction phải mở | Thêm cột version, thêm logic retry |
| Ví dụ điển hình | Trừ tồn kho vé sự kiện | Sửa hồ sơ người dùng qua form web |

Trả lời "chọn theo mức độ tranh chấp" thay vì "cái nào tốt hơn" là câu trả lời đúng.

## Case: double booking

```sql
-- SAI: có khoảng trống giữa kiểm tra và ghi
SELECT COUNT(*) FROM bookings WHERE seat_id = 42 AND show_id = 7;   -- = 0
INSERT INTO bookings (seat_id, show_id, user_id) VALUES (42, 7, 100);
```

Hai request đồng thời đều thấy `0` rồi đều chèn. Ba cách sửa, xếp theo thứ tự nên chọn:

```sql
-- 1. Ràng buộc unique — để database đảm bảo, đơn giản và chắc chắn nhất
ALTER TABLE bookings ADD CONSTRAINT uq_seat_show UNIQUE (seat_id, show_id);
-- request thứ hai nhận lỗi trùng khoá → ứng dụng bắt lỗi và báo "ghế đã có người đặt"

-- 2. Khoá bi quan trên bản ghi ghế
BEGIN;
SELECT * FROM seats WHERE seat_id = 42 FOR UPDATE;
INSERT INTO bookings (...) VALUES (...);
COMMIT;

-- 3. Ràng buộc loại trừ cho khoảng thời gian (đặt phòng chồng lịch)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE bookings ADD CONSTRAINT khong_chong_lich
    EXCLUDE USING GIST (room_id WITH =, khoang_thoi_gian WITH &&);
```

Cách 3 (`EXCLUDE` constraint của PostgreSQL) là câu trả lời gây ấn tượng mạnh cho bài toán đặt phòng: nó chặn **chồng lấn khoảng thời gian** ở tầng database, thứ mà `UNIQUE` không làm được vì hai khoảng chồng nhau không hề "bằng nhau".

## Deadlock

```text
T1: BEGIN                        T2: BEGIN
    UPDATE tk SET .. WHERE id=1      UPDATE tk SET .. WHERE id=2
    (giữ khoá dòng 1)                (giữ khoá dòng 2)

    UPDATE tk SET .. WHERE id=2      UPDATE tk SET .. WHERE id=1
    (chờ T2 nhả khoá dòng 2)         (chờ T1 nhả khoá dòng 1)
                    ↓                                ↓
              ┌──────────────────────────────────────────┐
              │  CHỜ VÒNG TRÒN — không ai đi tiếp được   │
              └──────────────────────────────────────────┘
   Database phát hiện và HUỶ một transaction làm "nạn nhân"
   → ERROR: deadlock detected
```

**Cách phòng ngừa số một: luôn truy cập tài nguyên theo cùng một thứ tự.**

```python
# Luôn khoá theo id tăng dần, bất kể chuyển tiền chiều nào
ids = sorted([tu_tk, den_tk])
for i in ids:
    db.execute("SELECT * FROM tai_khoan WHERE id = %s FOR UPDATE", (i,))
```

Các biện pháp bổ trợ:

| Biện pháp | Chi tiết |
|---|---|
| Giữ transaction ngắn | Ít thời gian giữ khoá = ít cơ hội đụng nhau |
| Không gọi API ngoài trong transaction | Kéo dài thời gian giữ khoá theo cách không kiểm soát được |
| Thử lại khi gặp deadlock | Deadlock là chuyện bình thường; ứng dụng nên retry có backoff |
| Đặt `lock_timeout` | Thà thất bại nhanh còn hơn treo |
| Giảm mức isolation nếu nghiệp vụ cho phép | MySQL `REPEATABLE READ` dùng gap lock, dễ deadlock hơn `READ COMMITTED` |

```sql
-- Xem các phiên đang bị chặn và ai đang chặn (PostgreSQL)
SELECT blocked.pid   AS bi_chan,
       blocked.query AS query_bi_chan,
       blocking.pid  AS dang_chan,
       blocking.query AS query_dang_chan
FROM pg_stat_activity AS blocked
JOIN pg_stat_activity AS blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));
```

## MVCC: vì sao đọc không chặn ghi

PostgreSQL (và Oracle) dùng MVCC — mỗi `UPDATE` tạo ra một **phiên bản mới** của dòng thay vì sửa tại chỗ:

```text
UPDATE customers SET city='Da Nang' WHERE customer_id=1;

  Phiên bản cũ:  (id=1, city='Ha Noi',  xmin=100, xmax=205)  ← còn giữ cho transaction cũ
  Phiên bản mới: (id=1, city='Da Nang', xmin=205, xmax=NULL) ← transaction mới thấy cái này
```

Hệ quả cần nêu được khi phỏng vấn:

- **Đọc không bao giờ chặn ghi, ghi không bao giờ chặn đọc.** Đây là ưu thế lớn nhất của MVCC.
- Phiên bản cũ trở thành **dòng chết** (dead tuple), cần `VACUUM` dọn.
- Transaction mở lâu **chặn `VACUUM`** dọn những dòng mà nó còn có thể cần thấy → bảng phình (bloat) → mọi query chậm dần.
- `COUNT(*)` phải quét thật, vì mỗi transaction thấy một tập phiên bản khác nhau ([phase-3 bài 4](../phase-3/04-phan-trang-va-xu-ly-bang-lon.md)).

```sql
-- Tìm bảng bị phình nặng
SELECT relname, n_live_tup, n_dead_tup,
       ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS pct_chet,
       last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Đọc-rồi-ghi ở tầng ứng dụng | Lost update | `UPDATE ... SET x = x - 1` nguyên tử |
| Kiểm tra-rồi-chèn | Bản ghi trùng, double booking | Ràng buộc unique |
| Gọi API ngoài bên trong transaction | Giữ khoá nhiều giây | Gọi trước hoặc sau transaction |
| Khoá tài nguyên theo thứ tự khác nhau | Deadlock | Sắp xếp thứ tự khoá nhất quán |
| Không xử lý lỗi serialization ở `REPEATABLE READ` | Giao dịch thất bại âm thầm | Bắt lỗi và thử lại |
| Quên `COMMIT` | `idle in transaction`, chặn `VACUUM` | Dùng context manager, đặt `idle_in_transaction_session_timeout` |
| Dùng `SERIALIZABLE` cho mọi thứ | Nhiều lần thử lại, thông lượng giảm | Chỉ dùng cho phần nghiệp vụ thật sự cần |
| Tin `FOR UPDATE` khoá được dòng chưa tồn tại | Vẫn double booking | Ràng buộc unique hoặc `EXCLUDE` |

Dòng cuối đáng nhấn mạnh: `SELECT ... FOR UPDATE` chỉ khoá **dòng đang tồn tại**. Với bài toán "chỉ được có một booking cho ghế này", dòng cần khoá chưa tồn tại tại thời điểm kiểm tra — nên chỉ khoá thôi là không đủ. Đây là câu hỏi vặn rất hay gặp.

## Câu hỏi phỏng vấn hay gặp

**"Hai người cùng đặt chỗ cuối, xử lý sao?"**
Trả lời theo lớp: (1) ràng buộc `UNIQUE(seat_id, show_id)` là biện pháp chắc chắn nhất vì database đảm bảo; (2) `SELECT ... FOR UPDATE` nếu cần tính toán trước khi ghi; (3) với đặt phòng theo khoảng thời gian thì dùng `EXCLUDE` constraint. Nhấn mạnh rằng "kiểm tra rồi chèn" ở tầng ứng dụng luôn có đua tranh.

**"`READ COMMITTED` và `REPEATABLE READ` khác nhau thế nào?"**
`READ COMMITTED` lấy ảnh chụp mới cho **mỗi câu lệnh** — nên hai lần `SELECT` trong cùng transaction có thể ra khác nhau. `REPEATABLE READ` lấy một ảnh chụp cho **cả transaction**. Thêm được chi tiết PostgreSQL chặn luôn phantom ở mức này (khác chuẩn) là điểm cộng.

**"Deadlock là gì và tránh thế nào?"**
Hai hay nhiều transaction chờ vòng tròn. Database phát hiện và huỷ một nạn nhân. Phòng ngừa: thứ tự khoá nhất quán, transaction ngắn, retry có backoff, `lock_timeout`.

**"Vì sao không dùng `SERIALIZABLE` cho mọi thứ cho an toàn?"**
Vì cái giá: PostgreSQL cài đặt bằng SSI, phải theo dõi phụ thuộc đọc-ghi và huỷ transaction khi phát hiện xung đột — nghĩa là ứng dụng phải retry, và dưới tải cao tỉ lệ huỷ tăng làm thông lượng giảm mạnh. Cách thực dụng: `READ COMMITTED` làm mặc định, nâng mức riêng cho phần nghiệp vụ nhạy cảm, và dùng ràng buộc database để đảm bảo tính đúng đắn.

**"Transaction dài gây hại gì?"**
Giữ khoá lâu; chặn `VACUUM` dọn dòng chết gây phình bảng; giữ ảnh chụp cũ làm tăng chi phí lưu phiên bản; trên hệ có replica còn có thể gây xung đột khi áp dụng thay đổi. Một transaction để quên có thể làm chậm cả database — đó là lý do nên đặt `idle_in_transaction_session_timeout`.

## Tóm tắt bài 3

- Bốn hiện tượng: dirty read, non-repeatable read, phantom read, và **lost update** (không nằm trong chuẩn nhưng gây thiệt hại nhiều nhất).
- PostgreSQL mặc định `READ COMMITTED`, MySQL mặc định `REPEATABLE READ`; PostgreSQL chặn luôn phantom ở `REPEATABLE READ`.
- Ba cách chống lost update: ghi nguyên tử (ưu tiên), khoá bi quan, khoá lạc quan bằng cột version.
- `FOR UPDATE SKIP LOCKED` biến bảng thường thành hàng đợi công việc cho nhiều worker.
- `FOR UPDATE` không khoá được dòng **chưa tồn tại** — chống double booking phải dùng ràng buộc unique hoặc `EXCLUDE`.
- Phòng deadlock bằng thứ tự khoá nhất quán, transaction ngắn, và retry có backoff.
- MVCC cho phép đọc không chặn ghi, nhưng transaction dài chặn `VACUUM` và làm phình bảng.

**Bài kế tiếp** → [Bài 4: Bộ câu hỏi phỏng vấn SQL kèm đáp án](04-bo-cau-hoi-phong-van-sql-kem-dap-an.md)

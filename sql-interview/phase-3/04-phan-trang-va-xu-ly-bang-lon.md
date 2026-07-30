# Bài 4: Phân trang và xử lý bảng lớn

Có một loại câu hỏi phỏng vấn mà chỉ người đã vận hành hệ thống thật mới trả lời trôi chảy: *"Bảng có 200 triệu dòng, bạn cần thêm một cột `NOT NULL` và cập nhật giá trị cho toàn bộ. Làm thế nào mà không làm sập production?"*

Bài này gom những tình huống đó: phân trang trên tập dữ liệu lớn, cập nhật hàng loạt an toàn, và các thao tác DDL không gây downtime. Đây là mảng ít xuất hiện trên các trang luyện SQL nhưng gặp liên tục khi đi làm.

## Vì sao `OFFSET` sụp đổ ở trang sâu

```sql
SELECT * FROM orders ORDER BY ordered_at DESC LIMIT 20 OFFSET 200000;
```

```text
Database phải làm gì:
  1. Sắp xếp (hoặc quét index) từ đầu
  2. ĐỌC và VỨT BỎ 200,000 dòng đầu tiên     ← toàn bộ công sức bị lãng phí
  3. Trả về 20 dòng tiếp theo

Thời gian tăng TUYẾN TÍNH theo độ sâu trang:
  OFFSET 0       →   1 ms
  OFFSET 10,000  →  45 ms
  OFFSET 200,000 → 890 ms
  OFFSET 1,000,000 → 4,300 ms
```

Ngoài chậm, `OFFSET` còn có một lỗi ít ai để ý: **kết quả không nhất quán khi dữ liệu thay đổi**. Nếu có đơn mới được chèn trong lúc người dùng chuyển từ trang 1 sang trang 2, mọi dòng bị đẩy lùi một vị trí — người dùng thấy lại dòng đã xem ở cuối trang 1, hoặc một dòng bị bỏ qua hoàn toàn. Với trang danh sách thì khó chịu; với job xuất dữ liệu chạy theo trang thì đó là **mất dữ liệu**.

## Keyset pagination (seek method)

Ý tưởng: thay vì đếm "bỏ qua bao nhiêu dòng", hãy nhớ **dòng cuối cùng của trang trước** và nói với database "cho tôi những dòng đứng sau nó".

```sql
-- Trang 1
SELECT order_id, ordered_at, total_amount
FROM orders
ORDER BY order_id DESC
LIMIT 20;
-- giả sử dòng cuối trả về có order_id = 4,981,203

-- Trang 2 — không có OFFSET
SELECT order_id, ordered_at, total_amount
FROM orders
WHERE order_id < 4981203        -- nhảy THẲNG vào đúng vị trí trong index
ORDER BY order_id DESC
LIMIT 20;
```

```text
OFFSET:  đọc 200,020 dòng, vứt 200,000        → 890 ms
KEYSET:  đi cây index tới đúng chỗ, đọc 20    →   1 ms  (bất kể trang thứ mấy)
```

Thời gian là **hằng số** với mọi trang. Đây là cách mọi API "infinite scroll" hoạt động (Twitter, Facebook, GitHub API) — và biết gọi đúng tên "cursor-based pagination" trong phỏng vấn là điểm cộng.

### Khi khoá sắp xếp không duy nhất

Đây là phần mà đa số ứng viên làm sai. Nếu sắp theo `ordered_at` mà hai đơn cùng thời điểm, so sánh đơn giản sẽ **bỏ sót hoặc lặp** dòng.

```sql
-- SAI: bỏ sót các đơn khác có cùng ordered_at
WHERE ordered_at < '2024-06-07 16:40:00'

-- ĐÚNG: so sánh bộ (tuple) — thêm khoá chính làm tiêu chí phá hoà
WHERE (ordered_at, order_id) < ('2024-06-07 16:40:00', 4981203)
ORDER BY ordered_at DESC, order_id DESC
LIMIT 20;
```

So sánh bộ được PostgreSQL hỗ trợ trực tiếp và **dùng được index** trên `(ordered_at DESC, order_id DESC)`. Dạng viết tay tương đương (cần cho MySQL cũ):

```sql
WHERE ordered_at < :ts
   OR (ordered_at = :ts AND order_id < :id)
```

Quy tắc: **luôn thêm một cột duy nhất vào cuối khoá sắp xếp** để thứ tự là toàn phần. Không có nó, phân trang không thể đúng.

### Trường hợp sắp xếp ngược chiều nhau

Khi cần `ORDER BY a ASC, b DESC`, so sánh bộ không dùng được — phải viết tay:

```sql
WHERE (a > :a) OR (a = :a AND b < :b)
ORDER BY a ASC, b DESC
LIMIT 20;
```

Index tương ứng phải là `(a ASC, b DESC)`. Đây là lý do trang danh sách cho phép người dùng đổi tuỳ ý cột sắp xếp rất khó làm keyset — một trade-off nên nêu ra khi phỏng vấn.

### So sánh hai cách

| Tiêu chí | `OFFSET` | Keyset |
|---|---|---|
| Tốc độ trang sâu | Chậm tuyến tính | **Hằng số** |
| Nhảy tới trang bất kỳ ("trang 500") | **Được** | Không được |
| Hiển thị tổng số trang | **Được** | Khó (cần `COUNT` riêng) |
| Nhất quán khi dữ liệu đổi | Không | **Có** |
| Đổi cột sắp xếp linh hoạt | **Dễ** | Cần index cho từng kiểu sắp |
| Phù hợp | Trang quản trị, ít dữ liệu | API, infinite scroll, xuất dữ liệu |

Câu trả lời thực dụng khi được hỏi: *"Trang quản trị cần nhảy trang thì `OFFSET` chấp nhận được nếu tổng dữ liệu nhỏ. API công khai và job xuất dữ liệu thì bắt buộc keyset."*

### Đóng gói con trỏ (cursor)

Đừng để lộ khoá chính thô ra API. Mã hoá thành token mờ để có thể đổi cách phân trang sau này mà không phá vỡ hợp đồng API:

```python
import base64, json

def tao_cursor(dong_cuoi):
    return base64.urlsafe_b64encode(
        json.dumps({"ts": dong_cuoi.ordered_at.isoformat(), "id": dong_cuoi.order_id}).encode()
    ).decode()

def doc_cursor(token):
    return json.loads(base64.urlsafe_b64decode(token))
```

Nếu token cần chống giả mạo (người dùng không được tự sửa để xem dữ liệu khác), hãy ký nó — nhưng lưu ý base64 **không phải** mã hoá, chỉ là encode.

## Đếm số dòng trên bảng lớn

```sql
SELECT COUNT(*) FROM orders;   -- 50 triệu dòng → vài giây, mỗi lần tải trang
```

PostgreSQL phải quét thật vì MVCC: mỗi transaction nhìn thấy một tập dòng khác nhau, không có bộ đếm chung nào đúng cho mọi người. Bốn cách xử lý, chọn theo yêu cầu nghiệp vụ:

```sql
-- 1. Ước lượng (tức thời, sai số vài %) — đủ cho "khoảng 4.9 triệu kết quả"
SELECT reltuples::bigint AS uoc_luong FROM pg_class WHERE relname = 'orders';

-- 2. Ước lượng có kèm điều kiện lọc — lấy từ chính plan của optimizer
EXPLAIN (FORMAT JSON) SELECT * FROM orders WHERE status = 'paid';
-- → đọc trường "Plan Rows"

-- 3. Đếm có chặn: hiển thị "1000+" thay vì con số chính xác
SELECT COUNT(*) FROM (SELECT 1 FROM orders WHERE status='paid' LIMIT 1001) t;

-- 4. Bảng đếm riêng, cập nhật bằng trigger — khi cần chính xác tuyệt đối
CREATE TABLE dem_bang (ten TEXT PRIMARY KEY, so_dong BIGINT);
-- lưu ý: trigger trên bảng ghi nhiều sẽ tạo điểm nghẽn tranh chấp (contention)
```

Cách 4 có cái giá thật: mọi `INSERT` đều phải cập nhật cùng một dòng đếm, biến nó thành điểm nóng khoá. Giải pháp thường dùng là đếm phân mảnh (nhiều dòng đếm, cộng lại khi đọc).

Cách trả lời tốt nhất vẫn là hỏi ngược: *"Người dùng cần con số chính xác hay chỉ cần biết còn nhiều kết quả?"*

## Cập nhật và xoá hàng loạt an toàn

```sql
-- NGUY HIỂM: một transaction khổng lồ
UPDATE orders SET status = 'archived' WHERE ordered_at < '2020-01-01';
-- 30 triệu dòng → khoá lâu, WAL phình to, replica trễ, rollback mất hàng giờ nếu lỗi
```

> **Ba từ trong phần này cần làm rõ trước:**
>
> **Khoá (lock)** — Khi một transaction đang sửa một dòng, database "giữ" dòng đó lại để transaction khác không sửa đồng thời gây hỏng dữ liệu. Transaction khác muốn đụng vào phải **xếp hàng chờ**. Sửa 30 triệu dòng nghĩa là giữ 30 triệu dòng suốt thời gian chạy — mọi người dùng đụng phải chúng đều bị treo.
>
> **Replica (bản sao)** — Máy chủ database thứ hai giữ bản sao dữ liệu của máy chính, thường dùng để chia tải đọc (báo cáo chạy trên replica cho khỏi ảnh hưởng hệ thống chính) và để dự phòng khi máy chính hỏng.
>
> **Replication lag (độ trễ sao chép)** — Replica luôn chậm hơn máy chính một chút vì phải nhận và áp dụng lại các thay đổi. Bình thường độ trễ dưới một giây. Nhưng khi máy chính sinh ra khối lượng thay đổi khổng lồ trong thời gian ngắn, replica không theo kịp và độ trễ vọt lên hàng phút.
>
> ```text
> Máy chính: UPDATE 30 triệu dòng  ──▶ sinh hàng chục GB WAL
>                                        │
>                                        ▼ replica phải áp dụng lại từng thay đổi
> Replica:   tụt lại 5 phút  ──▶ báo cáo đọc từ replica cho ra số liệu CŨ 5 PHÚT
>                            ──▶ người dùng vừa đặt hàng xong, xem lại thấy "chưa có đơn nào"
> ```
>
> Đây là lý do "chia lô rồi nghỉ giữa các lô" không phải chuyện cầu toàn — nó trực tiếp bảo vệ trải nghiệm người dùng.

Bốn hậu quả cụ thể — nên nêu đủ khi phỏng vấn:

```text
① Khoá 30 triệu dòng suốt thời gian chạy → mọi transaction đụng chúng phải chờ
② WAL (write-ahead log) phình vài chục GB → có nguy cơ đầy đĩa
③ Replica trễ hàng phút vì phải áp dụng cùng khối lượng thay đổi
④ Transaction dài chặn VACUUM → bảng phình (bloat) toàn hệ thống
⑤ Lỡ lỗi ở phút thứ 50 → rollback cũng mất chừng ấy thời gian
```

Cách đúng: chia thành từng lô nhỏ, mỗi lô một transaction riêng.

```sql
-- Mẫu xử lý theo lô, lặp tới khi không còn dòng nào
WITH lo AS (
    SELECT order_id
    FROM orders
    WHERE ordered_at < '2020-01-01'
      AND status <> 'archived'          -- điều kiện idempotent: chạy lại không sai
    ORDER BY order_id
    LIMIT 5000
    FOR UPDATE SKIP LOCKED               -- bỏ qua dòng đang bị khoá, không chờ
)
UPDATE orders o
SET status = 'archived'
FROM lo
WHERE o.order_id = lo.order_id;
```

```python
while True:
    so_dong = db.execute(SQL_TREN).rowcount
    db.commit()                     # commit MỖI lô — giữ transaction ngắn
    if so_dong == 0:
        break
    kiem_tra_do_tre_replica()       # dừng lại nếu replica đang trễ
    time.sleep(0.1)                 # nhường I/O cho lưu lượng thật
```

Bốn chi tiết ăn điểm trong đoạn trên: **commit từng lô**, **điều kiện idempotent** (`status <> 'archived'` để chạy lại được sau khi gián đoạn), **`SKIP LOCKED`** để không kẹt sau dòng đang khoá, và **nghỉ giữa các lô** để không chiếm hết I/O của lưu lượng người dùng thật.

Với xoá hàng loạt, kích thước lô nên nhỏ hơn (1,000-5,000) vì `DELETE` tạo nhiều dòng chết cần `VACUUM` dọn:

```sql
DELETE FROM orders
WHERE order_id IN (
    SELECT order_id FROM orders WHERE ordered_at < '2020-01-01' LIMIT 1000
);
```

Nhưng nếu bảng đã được **phân vùng theo thời gian**, cách tốt hơn hẳn là bỏ nguyên một phân vùng:

```sql
ALTER TABLE orders DETACH PARTITION orders_2019;
DROP TABLE orders_2019;      -- gần như tức thời, không tạo dòng chết nào
```

Nêu được lựa chọn này khi được hỏi "xoá 30 triệu dòng cũ thế nào" là câu trả lời cấp senior: **thao tác nhanh nhất là thao tác không phải làm**.

## DDL không gây downtime

Đây là phần trả lời trực tiếp câu hỏi mở đầu bài.

| Thao tác | Cách nguy hiểm | Cách an toàn |
|---|---|---|
| Thêm cột có `DEFAULT` | Postgres ≤ 10: viết lại cả bảng | PG 11+ làm tức thời; hệ cũ: thêm cột NULL rồi backfill |
| Thêm ràng buộc `NOT NULL` | Quét toàn bảng khi giữ khoá | Thêm `CHECK ... NOT VALID` → `VALIDATE CONSTRAINT` (khoá nhẹ) |
| Tạo index | `CREATE INDEX` khoá ghi | `CREATE INDEX CONCURRENTLY` |
| Xoá index | `DROP INDEX` khoá | `DROP INDEX CONCURRENTLY` |
| Đổi kiểu cột | Viết lại cả bảng | Thêm cột mới → backfill theo lô → đổi tên trong một transaction ngắn |
| Thêm khoá ngoại | Quét kiểm tra khi giữ khoá | `ADD CONSTRAINT ... NOT VALID` → `VALIDATE CONSTRAINT` |

Quy trình chuẩn cho cột `NOT NULL` trên bảng lớn — đúng bài toán đề mở đầu:

```sql
-- Bước 1: thêm cột cho phép NULL (tức thời, chỉ sửa metadata)
ALTER TABLE orders ADD COLUMN kenh_ban TEXT;

-- Bước 2: sửa ứng dụng để GHI giá trị cho cột mới từ giờ trở đi (deploy trước)

-- Bước 3: backfill dữ liệu cũ theo lô (như mẫu ở trên), chạy nền

-- Bước 4: thêm ràng buộc dưới dạng chưa kiểm chứng — khoá rất ngắn
ALTER TABLE orders ADD CONSTRAINT kenh_ban_not_null
    CHECK (kenh_ban IS NOT NULL) NOT VALID;

-- Bước 5: kiểm chứng — quét bảng nhưng CHỈ giữ khoá nhẹ, không chặn đọc/ghi
ALTER TABLE orders VALIDATE CONSTRAINT kenh_ban_not_null;
```

Nguyên tắc xuyên suốt: **tách thao tác lấy khoá nặng khỏi thao tác quét lâu**. Mọi kỹ thuật trong bảng trên đều là biến thể của nguyên tắc này.

Một cái bẫy vận hành cần biết: DDL cần khoá `ACCESS EXCLUSIVE`, và nếu có một transaction dài đang chạy, lệnh `ALTER TABLE` sẽ **xếp hàng chờ — đồng thời chặn mọi query đến sau nó**. Một `ALTER TABLE` tưởng chừng tức thời có thể làm treo cả hệ thống theo cách này. Cách phòng: đặt `lock_timeout` trước khi chạy DDL.

```sql
SET lock_timeout = '3s';          -- thà thất bại nhanh còn hơn chặn cả hệ thống
ALTER TABLE orders ADD COLUMN kenh_ban TEXT;
```

## Phân vùng bảng (partitioning)

Khi bảng vượt vài trăm triệu dòng, phân vùng là công cụ tiếp theo:

```sql
CREATE TABLE orders (
    order_id     BIGSERIAL,
    customer_id  INT NOT NULL,
    ordered_at   TIMESTAMPTZ NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL
) PARTITION BY RANGE (ordered_at);

CREATE TABLE orders_2024_q1 PARTITION OF orders
    FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');
CREATE TABLE orders_2024_q2 PARTITION OF orders
    FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
```

| Lợi ích | Chi tiết |
|---|---|
| Cắt bớt phân vùng (partition pruning) | Query có điều kiện thời gian chỉ chạm 1-2 phân vùng |
| Xoá dữ liệu cũ tức thời | `DROP TABLE` phân vùng thay vì `DELETE` hàng chục triệu dòng |
| Bảo trì theo phần | `VACUUM`/`REINDEX` từng phân vùng, không phải cả bảng |
| Index nhỏ hơn | Mỗi phân vùng có index riêng, cây nông hơn |

Cái giá phải trả — luôn nên nêu cùng lợi ích:

```text
- Khoá chính phải CHỨA cột phân vùng → ràng buộc unique toàn cục khó thực hiện
- Query KHÔNG có điều kiện trên cột phân vùng phải quét MỌI phân vùng
- Cần tự động hoá việc tạo phân vùng cho kỳ mới (nếu quên, INSERT sẽ lỗi)
- Quá nhiều phân vùng (hàng nghìn) làm chậm chính bước lập plan
```

Chọn khoá phân vùng theo **cách dữ liệu được truy vấn và bị xoá**, không theo cách nó được ghi. Thời gian là lựa chọn phổ biến nhất vì dữ liệu cũ thường bị xoá theo lô thời gian.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `OFFSET` sâu trên API công khai | Chậm dần, timeout | Keyset pagination |
| Keyset không có tiêu chí phá hoà | Dòng bị lặp hoặc bỏ sót | Thêm khoá chính vào `ORDER BY` |
| `COUNT(*)` mỗi lần tải trang | Vài giây mỗi request | Ước lượng hoặc đếm có chặn |
| `UPDATE` toàn bảng một transaction | Khoá lâu, WAL phình, replica trễ | Chia lô, commit từng lô |
| Xử lý lô không idempotent | Chạy lại sau lỗi cho kết quả sai | Thêm điều kiện loại trừ dòng đã xử lý |
| `CREATE INDEX` không `CONCURRENTLY` | Khoá ghi cả bảng | Luôn `CONCURRENTLY` trên production |
| DDL khi đang có transaction dài | Chặn toàn bộ query đến sau | `SET lock_timeout` trước DDL |
| Quên tạo phân vùng cho kỳ mới | `INSERT` lỗi lúc nửa đêm | Tự động hoá, hoặc dùng phân vùng mặc định |
| Backfill không giới hạn tốc độ | Chiếm hết I/O, ảnh hưởng người dùng | Nghỉ giữa các lô, theo dõi độ trễ replica |

## Câu hỏi phỏng vấn hay gặp

**"Phân trang trên bảng 100 triệu dòng, làm thế nào?"**
Keyset pagination với khoá sắp xếp toàn phần (thêm khoá chính), index khớp đúng thứ tự sắp, và trả về token con trỏ thay vì số trang. Nêu rõ trade-off: không nhảy được tới trang bất kỳ — nhưng với API thì gần như không ai cần.

**"Cần xoá 50 triệu dòng cũ, làm sao không sập production?"**
Ưu tiên 1: nếu bảng đã phân vùng theo thời gian thì `DROP` phân vùng. Ưu tiên 2: xoá theo lô 1,000-5,000 dòng, commit từng lô, nghỉ giữa các lô, theo dõi độ trễ replica và tiến độ `VACUUM`. Tuyệt đối tránh một `DELETE` khổng lồ.

**"Thêm cột `NOT NULL` vào bảng 200 triệu dòng?"**
Quy trình 5 bước ở trên: thêm cột nullable → deploy code ghi giá trị mới → backfill theo lô → `CHECK ... NOT VALID` → `VALIDATE CONSTRAINT`. Nhấn mạnh việc tách khoá nặng khỏi quét lâu.

**"Vì sao `COUNT(*)` trên PostgreSQL chậm hơn MySQL?"**
InnoDB cũng phải quét, nhưng MyISAM lưu sẵn số dòng chính xác nên trả về tức thời. PostgreSQL không lưu được con số chung vì MVCC — mỗi transaction thấy một tập dòng khác nhau. Đây là hệ quả trực tiếp của mô hình đồng thời, không phải điểm yếu cài đặt.

**"Khi nào nên phân vùng bảng?"**
Khi bảng đủ lớn để bảo trì trở thành vấn đề (thường từ vài trăm triệu dòng), **và** query có điều kiện lọc tự nhiên theo khoá phân vùng, **và** dữ liệu cũ bị xoá theo lô. Thiếu điều kiện thứ hai thì phân vùng chỉ làm mọi thứ chậm hơn.

## Tóm tắt bài 4

- `OFFSET` sâu chậm tuyến tính **và** cho kết quả không nhất quán khi dữ liệu thay đổi.
- Keyset pagination có thời gian hằng số; bắt buộc phải có khoá sắp xếp toàn phần (thêm khoá chính).
- `COUNT(*)` trên bảng lớn nên thay bằng ước lượng hoặc đếm có chặn — hỏi nghiệp vụ trước.
- Cập nhật/xoá hàng loạt phải chia lô, commit từng lô, idempotent, và nghỉ giữa các lô.
- DDL an toàn dựa trên một nguyên tắc: **tách thao tác giữ khoá nặng khỏi thao tác quét lâu**.
- Phân vùng biến việc xoá dữ liệu cũ thành `DROP TABLE` tức thời, nhưng chỉ đáng làm khi query lọc theo khoá phân vùng.

**Bài kế tiếp** → [Phase 4 - Bài 1: Case báo cáo doanh thu, cohort và retention](../phase-4/01-case-bao-cao-doanh-thu-cohort-va-retention.md)

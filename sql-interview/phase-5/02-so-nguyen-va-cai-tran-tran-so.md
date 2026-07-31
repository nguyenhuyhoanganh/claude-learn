# Bài 2: Số nguyên và cái trần — tràn số trong SQL

1 giờ 47 phút sáng. Sàn thương mại điện tử vẫn chạy êm, không ai trực. Bảng đơn hàng vừa nhận cái đơn thứ **2.147.483.647**. Rồi một đơn rớt. Rồi mười đơn. Rồi tất cả.

Log chỉ có đúng một dòng:

```text
ERROR: integer out of range
```

Không ai đụng vào code, không ai deploy gì cả. Cái sàn đó không bị hack — **nó chỉ đơn giản là đếm hết số**.

Đây là loại sự cố đáng sợ nhất: nó được lập trình sẵn từ nhiều năm trước, bởi một người đã nghỉ việc, trong đúng một dòng `CREATE TABLE`, và nó nổ vào lúc bạn không có mặt.

## Mỗi kiểu số nguyên là một cái hộp có kích thước cố định

Bạn khai kiểu nào, database cấp cho bạn đúng chừng đó bit — không hơn một bit.

```text
INTEGER = 32 bit
  ┌─┬───────────────────────────────┐
  │S│         31 bit giá trị        │
  └─┴───────────────────────────────┘
   ▲
   └── 1 bit dành cho dấu (âm / dương)

31 bit đếm được tối đa: 2³¹ − 1 = 2.147.483.647
```

| Kiểu (PostgreSQL) | Bit | Từ | Đến | Byte |
|---|---|---|---|---|
| `SMALLINT` / `INT2` | 16 | −32.768 | **32.767** | 2 |
| `INTEGER` / `INT` / `INT4` | 32 | −2.147.483.648 | **2.147.483.647** | 4 |
| `BIGINT` / `INT8` | 64 | −9,22×10¹⁸ | **9.223.372.036.854.775.807** | 8 |
| `NUMERIC` (không scale) | biến đổi | (gần như vô hạn) | (gần như vô hạn) | ~2 byte/4 chữ số |

**Ba con số phải thuộc lòng: 32.767 — 2,1 tỷ — 9,2 triệu tỷ.**

MySQL còn có `TINYINT` (1 byte, −128..127) và các biến thể `UNSIGNED` (bỏ bit dấu, gấp đôi trần dương: `INT UNSIGNED` lên tới 4.294.967.295). PostgreSQL **không có** `UNSIGNED` — muốn chặn số âm thì dùng `CHECK (col >= 0)`.

### Vì sao 2,1 tỷ đến nhanh hơn bạn nghĩ

`INT` nghe rất rộng — 2,1 tỷ đơn hàng thì công ty nào bán được? Vấn đề là **khoá tự tăng (sequence) không bao giờ lùi**:

```text
Nguồn tiêu thụ id mà không ai nghĩ tới:
  • INSERT thất bại  → sequence VẪN nhảy (không rollback được)
  • ON CONFLICT DO NOTHING → vẫn tiêu một id mỗi lần thử
  • Bảng log / event / audit → 5.000 dòng/giây = 157 tỷ dòng/năm
  • Import lại dữ liệu, chạy lại migration
  • Bảng bị TRUNCATE rồi nạp lại (nếu không RESTART IDENTITY)
```

Một bảng `events` ghi 5.000 dòng/giây chạm trần `INT` sau **đúng 5 ngày**. Một bảng `orders` của sàn lớn với `ON CONFLICT` retry nhiều có thể tiêu id nhanh gấp 3 lần số đơn thật.

## Điều gì thực sự xảy ra khi tràn

Đây là chỗ SQL khác hẳn C/Java, và là điểm ghi điểm khi phỏng vấn:

```sql
-- PostgreSQL: BÁO LỖI, huỷ transaction
SELECT 2147483647::int + 1;
-- ERROR: integer out of range

-- MySQL chế độ STRICT (mặc định từ 5.7): BÁO LỖI
INSERT INTO t (col_int) VALUES (2147483648);
-- ERROR 1264: Out of range value

-- MySQL chế độ non-strict (cấu hình cũ): ÂM THẦM cắt về giá trị trần
-- → col_int = 2147483647, chỉ có warning
```

| Hệ | Hành vi khi tràn | Mức nguy hiểm |
|---|---|---|
| PostgreSQL | `ERROR`, transaction huỷ | Ồn ào — dễ phát hiện |
| MySQL STRICT | `ERROR 1264` | Ồn ào |
| MySQL non-strict | **Cắt (clamp) về trần, chỉ warning** | Im lặng — nguy hiểm nhất |
| SQLite | Kiểu động, tự nới thành INTEGER 8 byte | Ít gặp |
| Oracle | `NUMBER` mặc định rất rộng | Ít gặp |

Trong C hay Java, `int` tràn thì **quay vòng** (`2147483647 + 1 = -2147483648`) — âm thầm và tai hại. SQL nghiêm khắc hơn: nó báo lỗi. Đó là điều tốt. Nhưng "báo lỗi" nghĩa là **toàn bộ luồng ghi dừng lại**, đúng lúc 1 giờ 47 sáng.

### Tràn không chỉ ở cột — nó ở cả biểu thức

```sql
-- Cột là INT, phép nhân trung gian cũng là INT → tràn TRƯỚC khi kịp gán
SELECT sum(quantity * unit_price_int) FROM order_items;
-- ERROR: integer out of range   ← dù cột đích là BIGINT!

-- Sửa: ép kiểu SỚM, ngay tại toán hạng
SELECT sum(quantity::bigint * unit_price_int) FROM order_items;
```

Đây là bẫy tinh vi: bạn đã đổi cột đích sang `BIGINT`, nhưng phép tính trung gian vẫn chạy ở `INT`. **`SUM()` trong PostgreSQL tự nới `int` → `bigint`, nhưng phép `*` thì không.**

Tương tự với `COUNT`: `count(*)` trả về `bigint` nên an toàn, nhưng `sum(col_int)` trả `bigint` còn `sum(col_bigint)` trả `numeric` (Postgres tự nới thêm một bậc để tránh tràn).

## Đo trước khi vỡ: câu query bạn nên đặt vào monitoring hôm nay

Cái trần không bao giờ tự nói cho bạn biết. Phải chủ động hỏi:

```sql
-- Liệt kê mọi sequence và % đã tiêu so với trần của kiểu cột
SELECT
    seq.schemaname || '.' || seq.sequencename        AS sequence_name,
    tbl.table_name || '.' || tbl.column_name         AS cot_dich,
    tbl.data_type,
    seq.last_value,
    CASE tbl.data_type
        WHEN 'smallint' THEN 32767
        WHEN 'integer'  THEN 2147483647
        WHEN 'bigint'   THEN 9223372036854775807
    END                                              AS tran,
    round(100.0 * seq.last_value / CASE tbl.data_type
        WHEN 'smallint' THEN 32767
        WHEN 'integer'  THEN 2147483647
        WHEN 'bigint'   THEN 9223372036854775807
    END, 2)                                          AS phan_tram_da_dung
FROM pg_sequences seq
JOIN information_schema.columns tbl
  ON tbl.column_default LIKE '%' || seq.sequencename || '%'
WHERE seq.last_value IS NOT NULL
ORDER BY phan_tram_da_dung DESC;
```

**Ngưỡng cảnh báo nên đặt: 70%.** Không phải 95% — vì migration một bảng tỷ dòng mất hàng ngày, và bạn cần thời gian.

Câu query tương đương cho MySQL:

```sql
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, AUTO_INCREMENT,
       ROUND(100 * AUTO_INCREMENT / CASE
           WHEN COLUMN_TYPE LIKE 'smallint%' THEN 32767
           WHEN COLUMN_TYPE LIKE 'int%'      THEN 2147483647
           WHEN COLUMN_TYPE LIKE 'bigint%'   THEN 9223372036854775807
       END, 2) AS pct
FROM information_schema.TABLES t
JOIN information_schema.COLUMNS c USING (TABLE_SCHEMA, TABLE_NAME)
WHERE c.EXTRA = 'auto_increment' AND t.AUTO_INCREMENT IS NOT NULL
ORDER BY pct DESC;
```

## Ba cách xử lý, xếp theo giá tiền

### ① Rẻ nhất: chọn đúng từ đầu

```sql
-- Khoá chính của bảng sẽ lớn → BIGINT, không bàn cãi
CREATE TABLE orders (
    order_id BIGSERIAL PRIMARY KEY,   -- hoặc: GENERATED ALWAYS AS IDENTITY
    ...
);
```

Chênh lệch giữa `INT` và `BIGINT` là **4 byte mỗi dòng**. Bảng 100 triệu dòng: tốn thêm 400 MB, cộng thêm phần index. Với giá đĩa hiện nay, đó là vài nghìn đồng. So với một đêm mất ngủ và hàng nghìn đơn hàng rớt, đây là món hời không cần nghĩ.

> **Ngoại lệ hợp lý để dùng `INT`:** bảng tra cứu (danh mục, tỉnh thành, trạng thái) — chắc chắn không quá vài nghìn dòng, và `INT` giúp index gọn hơn khi bảng này bị join liên tục.

### ② Rẻ nhì: giám sát

Đặt câu query % trần ở trên vào dashboard, cảnh báo ở 70%. Chi phí: 10 phút cài đặt.

### ③ Đắt nhất: di trú lúc đang chạy

Cách sai (khoá bảng, viết lại toàn bộ, có thể mất hàng giờ):

```sql
ALTER TABLE orders ALTER COLUMN order_id TYPE BIGINT;   -- ⚠ ACCESS EXCLUSIVE LOCK
```

Cách đúng, không downtime:

```sql
-- 1. Thêm cột mới (nhanh, không rewrite vì cho phép NULL)
ALTER TABLE orders ADD COLUMN order_id_big BIGINT;

-- 2. Trigger giữ đồng bộ cho ghi mới
CREATE FUNCTION sync_order_id() RETURNS trigger AS $$
BEGIN NEW.order_id_big := NEW.order_id; RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_sync BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION sync_order_id();

-- 3. Backfill theo lô, nghỉ giữa các lô để replica kịp theo
DO $$
DECLARE i BIGINT := 0;
BEGIN
  LOOP
    UPDATE orders SET order_id_big = order_id
    WHERE order_id_big IS NULL AND order_id BETWEEN i AND i + 9999;
    EXIT WHEN NOT FOUND AND i > (SELECT max(order_id) FROM orders);
    i := i + 10000;
    COMMIT;                      -- procedure trong PG 11+
    PERFORM pg_sleep(0.05);
  END LOOP;
END $$;

-- 4. Tạo index mới CONCURRENTLY (không khoá ghi)
CREATE UNIQUE INDEX CONCURRENTLY orders_id_big_uk ON orders(order_id_big);

-- 5. Đối soát
SELECT count(*) FROM orders WHERE order_id_big IS DISTINCT FROM order_id;  -- = 0

-- 6. Hoán đổi trong transaction ngắn (vài chục ms)
BEGIN;
ALTER TABLE orders DROP CONSTRAINT orders_pkey;
ALTER TABLE orders RENAME COLUMN order_id     TO order_id_old;
ALTER TABLE orders RENAME COLUMN order_id_big TO order_id;
ALTER TABLE orders ADD PRIMARY KEY USING INDEX orders_id_big_uk;
ALTER SEQUENCE orders_order_id_seq AS BIGINT;   -- nới trần cho chính sequence
COMMIT;
```

Đừng quên bước cuối: **sequence cũng có kiểu riêng**. `ALTER SEQUENCE ... AS BIGINT` là dòng mà người ta hay quên, và rồi cột đã `BIGINT` nhưng sequence vẫn dừng ở 2,1 tỷ.

Nhớ luôn: mọi **khoá ngoại** trỏ tới cột này cũng phải đổi kiểu theo, nếu không join sẽ ép kiểu ngầm và **mất index** (xem lại phase-3 bài 1).

## Cái trần không biến mất — nó chuyển sang chỗ khác

Đổi hết sang `BIGINT` xong, có một chỗ không ai nghĩ tới, và nó nằm **ngoài** database:

```javascript
// JavaScript: Number là float64, chỉ giữ nguyên vẹn số nguyên tới 2^53 − 1
Number.MAX_SAFE_INTEGER              // 9007199254740991  (~9 triệu tỷ)

JSON.parse('{"id": 9223372036854775807}').id
// → 9223372036854775000    ← làm tròn IM LẶNG, không lỗi, không warning
```

Backend đúng, database đúng, mà trình duyệt hiển thị sai id. Người dùng click vào đơn hàng và nhận 404.

**Cách chữa:** trả ID lớn về client dưới dạng **chuỗi**.

```json
{ "order_id": "9223372036854775807", "amount": "1500000.50" }
```

```python
# FastAPI / Pydantic
class OrderOut(BaseModel):
    order_id: int
    model_config = ConfigDict(json_encoders={int: str})
```

```java
// Jackson
@JsonSerialize(using = ToStringSerializer.class)
private Long orderId;
```

Các trần "ẩn" khác cần biết:

| Chỗ | Trần | Hậu quả |
|---|---|---|
| JavaScript `Number` | 2⁵³ − 1 ≈ 9,007×10¹⁵ | Làm tròn im lặng |
| Protobuf `int32` | 2,1 tỷ | Lỗi encode |
| Redis `INCR` | `int64` | Lỗi ở 9,2 triệu tỷ |
| Postgres `OID` (nội bộ) | 4,29 tỷ | Wraparound trong catalog |
| Postgres **transaction id** | 2 tỷ (32 bit) | **Wraparound → database dừng ghi** nếu không `VACUUM` |
| MySQL `AUTO_INCREMENT` trên `INT UNSIGNED` | 4,29 tỷ | Duplicate key error |

Cái cuối ở PostgreSQL đáng nói riêng: **transaction ID wraparound**. Postgres đánh số mỗi transaction bằng số 32 bit. Nếu autovacuum không chạy kịp, database sẽ tự **từ chối mọi lệnh ghi** để tự bảo vệ. Đây là sự cố production kinh điển (Sentry, Mailchimp đều từng dính). Giám sát bằng:

```sql
SELECT datname, age(datfrozenxid) AS tuoi_xid
FROM pg_database ORDER BY tuoi_xid DESC;
-- Cảnh báo khi vượt 1.000.000.000 (trần là ~2.100.000.000)
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `id SERIAL` (là `INT`) cho bảng sự kiện | Chạm trần sau vài ngày/tháng | `BIGSERIAL` / `BIGINT GENERATED ALWAYS AS IDENTITY` |
| `SMALLINT` cho cột `so_luong` | Đơn sỉ 40.000 cái → lỗi | `INT` là mặc định an toàn |
| Đổi cột sang `BIGINT` mà quên sequence | Vẫn chết ở 2,1 tỷ | `ALTER SEQUENCE ... AS BIGINT` |
| Đổi cột mà quên khoá ngoại trỏ tới | Ép kiểu ngầm khi join → mất index | Đổi đồng bộ cả hai phía |
| Phép nhân trung gian vẫn là `INT` | Tràn dù cột đích `BIGINT` | Ép kiểu tại toán hạng: `a::bigint * b` |
| Trả `BIGINT` id qua JSON cho JS | Làm tròn im lặng ở 2⁵³ | Serialize thành chuỗi |
| MySQL chạy non-strict mode | Ghi đè im lặng giá trị trần | `sql_mode = STRICT_TRANS_TABLES` |
| Không giám sát `age(datfrozenxid)` | Postgres dừng ghi vì XID wraparound | Alert ở 1 tỷ |
| Nghĩ "bảng tôi nhỏ, `INT` đủ rồi" | Bảng nhỏ thật, nhưng id tiêu do retry/import | Vẫn dùng `BIGINT` cho khoá chính |

## Câu hỏi phỏng vấn hay gặp

**H: `INT` chứa được tối đa bao nhiêu?**
2.147.483.647 — vì `INT` là 32 bit, một bit dành cho dấu, còn 31 bit giá trị: 2³¹ − 1.

**H: Khi tràn thì chuyện gì xảy ra?**
PostgreSQL và MySQL chế độ strict đều báo lỗi và huỷ lệnh — không quay vòng như C. Nhưng MySQL cấu hình non-strict thì **cắt im lặng về giá trị trần**, đây mới là kịch bản nguy hiểm vì không ai biết dữ liệu đã sai.

**H: `INT` hay `BIGINT` cho khoá chính?**
`BIGINT`, gần như luôn luôn. Chênh 4 byte mỗi dòng — trên bảng 100 triệu dòng là 400 MB, quá rẻ so với một cuộc di trú lúc đang chạy. Chỉ dùng `INT` cho bảng tra cứu chắc chắn nhỏ. Và nhớ: sequence tiêu id kể cả khi `INSERT` thất bại, nên số id đã dùng luôn lớn hơn số dòng thật.

**H: Bảng 500 triệu dòng đang ở 80% trần `INT`, làm gì?**
Không `ALTER TYPE` trực tiếp vì nó khoá bảng và viết lại toàn bộ. Em thêm cột `BIGINT`, trigger đồng bộ, backfill theo lô, tạo unique index `CONCURRENTLY`, đối soát, rồi hoán đổi trong transaction ngắn — và nhớ `ALTER SEQUENCE ... AS BIGINT` cùng mọi khoá ngoại trỏ tới nó.

**H: Đổi hết sang `BIGINT` là hết lo chứ?**
Không. Trần chỉ chuyển ra ngoài database. JavaScript chỉ giữ nguyên vẹn số nguyên tới 2⁵³, nên ID lớn phải trả về dưới dạng chuỗi. Ngoài ra Postgres còn có trần transaction ID 32 bit — nếu autovacuum không kịp thì database tự dừng ghi.

## Tóm tắt bài 2

- Ba con số phải thuộc: **32.767** (`SMALLINT`), **2.147.483.647** (`INT`), **9,2 triệu tỷ** (`BIGINT`).
- Sequence tiêu id kể cả khi `INSERT` thất bại — số id đã dùng luôn nhiều hơn số dòng thật.
- Postgres/MySQL-strict **báo lỗi** khi tràn; MySQL non-strict **cắt im lặng** — đây mới là kịch bản chết người.
- Tràn xảy ra cả ở **biểu thức trung gian**, không chỉ ở cột đích — ép kiểu ngay tại toán hạng.
- Xếp theo giá: chọn `BIGINT` từ đầu (rẻ nhất) → giám sát % trần ở ngưỡng 70% (rẻ nhì) → di trú lúc đang chạy (đắt nhất).
- Đổi sang `BIGINT` phải đổi cả **sequence** và mọi **khoá ngoại**; và nhớ trần 2⁵³ của JavaScript ở tầng client.

**Bài kế tiếp** → [Bài 3: Chuỗi, VARCHAR và độ dài khoá index](03-chuoi-varchar-text-va-do-dai-khoa-index.md)

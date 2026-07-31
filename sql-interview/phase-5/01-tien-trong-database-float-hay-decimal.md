# Bài 1: Tiền trong database — `FLOAT` hay `DECIMAL`?

3 giờ sáng ngày đối soát cuối tháng. Sổ kế toán chốt **1.847.000.000đ**. Database cộng lại ra một con số khác — hụt đúng vài đồng lẻ. Không ai sửa code, không giao dịch nào lỗi. Nhưng mỗi đêm cộng sổ, tiền lại hụt thêm một chút.

Con ma đó không nằm trong code. Nó nằm trong đúng một chữ ở câu `CREATE TABLE`, chữ mà hầu hết chúng ta gõ mà không nghĩ: `FLOAT`.

Đây là câu hỏi phỏng vấn ngắn tới mức nghe như được tặng điểm — *"cột tiền bạn khai kiểu gì?"* — và là câu loại người đều đặn, vì đáp án đúng ("dùng `DECIMAL`") chỉ là tầng một.

## Máy tính đếm bằng nhị phân, còn tiền thì đếm bằng thập phân

Thử ngay trên database của bạn:

```sql
SELECT 0.1::float8 + 0.2::float8 AS ket_qua;
```

```text
      ket_qua
--------------------
 0.30000000000000004
```

Không phải lỗi database. Đây là chuẩn **IEEE 754** — chuẩn số thực dấu phẩy động (*floating point*, "dấu phẩy trôi nổi") mà mọi CPU trên đời đều dùng.

Lý do rất đời thường: trong hệ **thập phân** (cơ số 10), `1/3` không viết hết được — nó là `0.3333...` kéo dài mãi. Trong hệ **nhị phân** (cơ số 2), `0.1` cũng rơi vào đúng tình cảnh đó:

```text
0.1 trong hệ nhị phân = 0.0001100110011001100110011... (lặp vô hạn)

FLOAT8 chỉ có 53 bit phần định trị (mantissa) để chứa.
→ Nó cầm kéo cắt phăng phần đuôi.
→ Giá trị lưu được KHÔNG phải 0.1, mà là 0.1000000000000000055511151231257827...
```

Trên trục số của `FLOAT`, các giá trị biểu diễn được nằm cách nhau những **khe hở**. Số nào rơi vào khe thì bị đẩy sang giá trị gần nhất. Một lần lệch chỉ là hạt bụi ở chữ số thứ 17. Nhưng ví điện tử của bạn cộng trừ 10 triệu lần mỗi tháng — hạt bụi chồng lên nhau.

### Ba kiểu số thực, ba lời hứa khác nhau

| Kiểu | Cách lưu | Chính xác? | Kích thước | Dùng cho |
|---|---|---|---|---|
| `REAL` / `FLOAT4` | Nhị phân, ~7 chữ số | **Không** | 4 byte | Cảm biến, toạ độ thô |
| `DOUBLE PRECISION` / `FLOAT8` | Nhị phân, ~15 chữ số | **Không** | 8 byte | Khoa học, ML, đo lường |
| `NUMERIC(p, s)` / `DECIMAL(p, s)` | Thập phân, từng chữ số | **Có** | Biến đổi (~2 byte / 4 chữ số) | **Tiền, số lượng, tỉ lệ pháp lý** |

`NUMERIC` và `DECIMAL` trong PostgreSQL là **một kiểu, hai tên gọi**. `p` (*precision*, độ chính xác) là tổng số chữ số; `s` (*scale*, số lẻ) là số chữ số sau dấu phẩy.

```sql
NUMERIC(14, 2)   -- tối đa 12 chữ số phần nguyên + 2 chữ số lẻ
                 -- → lớn nhất 999.999.999.999,99
```

`NUMERIC` lưu **từng chữ số thập phân** như kế toán ghi sổ, nên `0.1 + 0.2` ra đúng `0.3`. Không có khe hở nào.

```sql
SELECT 0.1::numeric + 0.2::numeric;   -- 0.3   (đúng tuyệt đối)
```

## Ba cách `FLOAT` giết hệ thống tiền của bạn

### ① Sai số tích luỹ khi cộng dồn

```sql
-- Bảng dùng FLOAT
CREATE TEMP TABLE gd_float (so_tien float8);
INSERT INTO gd_float SELECT 0.01 FROM generate_series(1, 1000000);
SELECT sum(so_tien) FROM gd_float;
-- 10000.000000181458   ← lẽ ra phải đúng 10000

-- Bảng dùng NUMERIC
CREATE TEMP TABLE gd_num (so_tien numeric(12,2));
INSERT INTO gd_num SELECT 0.01 FROM generate_series(1, 1000000);
SELECT sum(so_tien) FROM gd_num;
-- 10000.00            ← chính xác
```

Một triệu giao dịch nhỏ là chuyện thường ngày của một ví điện tử. Sai số `0.00000018` nghe vô hại, cho tới lúc bạn phải giải thích với kiểm toán vì sao tổng nợ không khớp tổng có.

### ② So sánh bằng luôn trượt

```sql
-- Cột so_du là FLOAT
SELECT * FROM tai_khoan WHERE so_du = 0.3;   -- 0 dòng
```

Trong máy, giá trị đó **chưa bao giờ đúng bằng** `0.3`. Dữ liệu nằm ngay trước mắt mà câu lệnh vẫn trả về rỗng. Đây là loại bug tệ nhất: không có dòng lỗi nào, không có gì màu đỏ.

> **Luật:** không bao giờ dùng `=` với cột `FLOAT`. Nếu buộc phải, so bằng khoảng dung sai: `WHERE abs(so_du - 0.3) < 1e-9`.

### ③ Làm tròn "về số chẵn gần nhất" gây lệch báo cáo

`FLOAT` làm tròn theo quy tắc *banker's rounding* ở tầng phần cứng, còn `NUMERIC` làm tròn theo quy tắc "nửa lên" (*half up*) như con người:

```sql
SELECT round(2.5::float8)   AS f,    -- 2   (về số chẵn)
       round(2.5::numeric)  AS n;    -- 3   (nửa lên)
```

Cùng một phép làm tròn, hai kết quả. Với hàng triệu dòng hoá đơn, hai con số cuối cùng lệch nhau đủ để kế toán gọi điện.

## Hai cách lưu tiền đúng — chọn cái nào

### Cách A: `NUMERIC(p, s)` — mặc định nên chọn

```sql
CREATE TABLE payments (
    payment_id SERIAL PRIMARY KEY,
    order_id   INT            NOT NULL REFERENCES orders(order_id),
    amount     NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
    currency   CHAR(3)        NOT NULL DEFAULT 'VND',
    paid_at    TIMESTAMPTZ    NOT NULL
);
```

Đọc lên là hiểu ngay `1500000.50` nghĩa là gì. Mọi công cụ BI, mọi thư viện ORM đều hiểu.

### Cách B: số nguyên đơn vị nhỏ nhất (*minor unit*)

Lưu tất cả bằng đơn vị nhỏ nhất của loại tiền: 1 đô = `100` cent, 1.500đ = `1500` (VND không có đơn vị lẻ).

```sql
CREATE TABLE payments (
    amount_minor BIGINT  NOT NULL CHECK (amount_minor >= 0),  -- cent / đồng
    currency     CHAR(3) NOT NULL
);
```

| | `NUMERIC(14,2)` | `BIGINT` minor unit |
|---|---|---|
| Chính xác | Tuyệt đối | Tuyệt đối |
| Tốc độ tính | Chậm hơn (~2-5×) | Nhanh nhất (số nguyên gốc CPU) |
| Đọc bằng mắt | Dễ | Phải nhớ chia lại |
| Chia / tính %  | Vẫn phải làm tròn | Vẫn phải làm tròn |
| Đa tiền tệ | Phải nhớ `scale` riêng từng loại | **Bắt buộc** nhớ `scale` riêng |
| Rủi ro | Ép sang float ở tầng app | Quên chia 100 khi hiển thị |

**Chọn thế nào:** hệ thống nội bộ, báo cáo, ERP → `NUMERIC`. Hệ thống thanh toán thông lượng cao, nhiều loại tiền, tích hợp Stripe/Adyen (các cổng này đều dùng minor unit) → `BIGINT`.

> Lưu ý đa tiền tệ: VND có `scale = 0`, USD có `scale = 2`, còn dinar Kuwait (KWD) có `scale = 3`. Nếu lưu minor unit, **bắt buộc** phải lưu kèm mã tiền tệ và tra bảng `scale`, nếu không `1000` là 10 đô hay 1 dinar sẽ không ai biết.

## Đào sâu: cột đúng kiểu vẫn hỏng nếu tầng ứng dụng ép sang float

Đây là chỗ 90% dev vẫn dính sau khi đã "chuyển sang `DECIMAL`":

```python
# SAI — driver trả về Decimal, code ép sang float
row = cur.fetchone()
tong = float(row["amount"]) * 1.1     # thuế 10% → sai số quay lại ngay tại đây

# ĐÚNG — giữ nguyên Decimal suốt đường đi
from decimal import Decimal, ROUND_HALF_UP
tong = (row["amount"] * Decimal("1.1")).quantize(
    Decimal("0.01"), rounding=ROUND_HALF_UP
)
```

```javascript
// JavaScript nguy hiểm nhất: Number là float64, KHÔNG có kiểu decimal gốc
JSON.parse('{"amount": 1234567890123456789}')   // → 1234567890123456800  (sai)

// Cách chữa: trả tiền và ID lớn về client dưới dạng CHUỖI
// rồi dùng decimal.js / big.js để tính
```

| Ngôn ngữ | Kiểu đúng | Kiểu giết bạn |
|---|---|---|
| Java | `BigDecimal` | `double`, `float` |
| Python | `decimal.Decimal` | `float` |
| JavaScript / TS | `decimal.js`, `BigInt`, chuỗi | `Number` |
| Go | `shopspring/decimal` | `float64` |
| C# | `decimal` | `double` |
| PHP | `bcmath` / `brick/math` | `float` |

**Nguyên tắc: tiền không được ép kiểu giữa đường.** Chỉ đổi sang chuỗi đúng một lần, ở khâu cuối cùng khi hiển thị.

## Làm tròn là quyết định nghiệp vụ, không phải chi tiết kỹ thuật

Chia hoá đơn 100.000đ cho 3 người: mỗi người 33.333,33đ, tổng lại là 99.999,99đ. **Một xu biến mất.** Ai chịu?

```sql
-- Phân bổ số dư lẻ cho dòng cuối — kỹ thuật "largest remainder"
WITH phan_bo AS (
    SELECT
        nguoi_id,
        floor(100000.0 / count(*) OVER ()) AS phan_co_ban,
        row_number()      OVER (ORDER BY nguoi_id) AS thu_tu,
        count(*)          OVER ()                   AS so_nguoi
    FROM nguoi_chia_tien
)
SELECT
    nguoi_id,
    phan_co_ban
      + CASE WHEN thu_tu <= 100000 - phan_co_ban * so_nguoi THEN 1 ELSE 0 END
      AS so_tien
FROM phan_bo;
```

Hai luật bất di bất dịch:

1. **Chỉ làm tròn đúng một lần**, ở bước cuối. Làm tròn ở mỗi bước trung gian thì sai số cộng dồn.
2. **Nghiệp vụ quyết định hướng làm tròn.** Thuế VAT ở Việt Nam làm tròn đến đồng; phí sàn thường làm tròn **lên** (có lợi cho sàn); chia cổ tức làm tròn **xuống** rồi phần dư đưa vào quỹ. Không có mặc định đúng.

## Khi nào `FLOAT` mới là lựa chọn đúng

`FLOAT` không phải kiểu dữ liệu tồi — nó chỉ bị dùng sai chỗ. Sân nhà của nó:

- **Toạ độ địa lý** (vĩ độ, kinh độ) — lệch một phần tỷ độ là vài milimet, không ai kiện.
- **Cảm biến IoT**: nhiệt độ, độ ẩm, áp suất — bản thân phép đo đã có sai số lớn hơn nhiều.
- **Feature vector cho machine learning** — mô hình không quan tâm chữ số thứ 15.
- **Số rất lớn hoặc rất nhỏ**: `FLOAT8` chứa tới `1e308`, còn `NUMERIC` cũng chứa được nhưng chậm hơn nhiều.
- **Tính toán khoa học nặng**: `FLOAT` được CPU xử lý bằng lệnh phần cứng, nhanh hơn `NUMERIC` (vốn được cài đặt bằng phần mềm) từ 2 đến 5 lần.

```text
Câu hỏi để tự quyết:
  "Nếu con số này lệch 0,000001 thì có ai mất tiền, mất quyền lợi,
   hoặc có thể kiện được không?"
        Có  → NUMERIC hoặc số nguyên
        Không → FLOAT thoải mái
```

## Chuyển cột `FLOAT` sang `NUMERIC` mà không dừng hệ thống

Với bảng nhỏ (dưới vài triệu dòng), một lệnh là xong — nhưng nó **khoá bảng** trong lúc viết lại toàn bộ:

```sql
ALTER TABLE payments ALTER COLUMN amount TYPE NUMERIC(14,2) USING amount::numeric;
```

Với bảng lớn đang chạy production, làm theo 5 bước sau (không khoá lâu):

```sql
-- 1. Thêm cột mới, chưa ai dùng
ALTER TABLE payments ADD COLUMN amount_new NUMERIC(14,2);

-- 2. Trigger giữ hai cột đồng bộ cho mọi ghi mới
CREATE FUNCTION sync_amount() RETURNS trigger AS $$
BEGIN
    NEW.amount_new := NEW.amount::numeric(14,2);
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_amount BEFORE INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION sync_amount();

-- 3. Backfill theo lô nhỏ, chạy lúc vắng người
UPDATE payments SET amount_new = amount::numeric(14,2)
WHERE amount_new IS NULL AND payment_id BETWEEN 1 AND 10000;
-- lặp lại theo khoảng id, nghỉ vài trăm ms giữa các lô

-- 4. Đối soát TRƯỚC khi đổi tên — bước không được bỏ
SELECT count(*) FROM payments WHERE amount_new IS DISTINCT FROM amount::numeric(14,2);
-- phải bằng 0

-- 5. Đổi tên trong một transaction ngắn
BEGIN;
ALTER TABLE payments RENAME COLUMN amount     TO amount_old;
ALTER TABLE payments RENAME COLUMN amount_new TO amount;
COMMIT;
```

Giữ `amount_old` thêm vài ngày rồi mới `DROP COLUMN`. Đó là dây an toàn của bạn.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách tránh |
|---|---|---|
| `price FLOAT` trong `CREATE TABLE` | Sai số tích luỹ | `NUMERIC(12,2)` |
| `WHERE so_du = 0.3` trên cột float | Không bao giờ khớp | Đổi cột sang `NUMERIC` |
| `NUMERIC` không có `(p, s)` | Postgres cho phép, nhưng scale tự do → `100.5` và `100.50` là hai giá trị khác nhau khi so `=`? (không, nhưng `sum` và định dạng đầu ra sẽ lộn xộn) | Luôn khai rõ `NUMERIC(14,2)` |
| Backend đọc `Decimal` rồi ép `float` | Cột đúng nhưng app sai | Dùng kiểu decimal của ngôn ngữ |
| Trả `BIGINT` id / tiền về JSON cho JS | JS làm tròn im lặng quá `2^53` | Serialize thành chuỗi |
| Làm tròn ở mỗi bước trung gian | Sai số cộng dồn | Làm tròn đúng một lần ở cuối |
| Lưu minor unit mà không lưu currency | `1000` là 10 USD hay 1000 VND? | Luôn kèm `currency CHAR(3)` |
| Cột tiền cho phép `NULL` | `sum()` bỏ qua `NULL`, tổng thiếu âm thầm | `NOT NULL DEFAULT 0` + `CHECK` |

## Câu hỏi phỏng vấn hay gặp

**H: Vì sao không lưu tiền bằng `FLOAT`?**
Vì `FLOAT` là nhị phân, mà `0.1` không biểu diễn hết được trong nhị phân, nên mỗi phép tính đều để lại sai số. Với hệ thống tiền, sai số tích luỹ theo số lượng giao dịch và làm lệch đối soát. Em dùng `NUMERIC(14,2)` hoặc số nguyên theo đơn vị nhỏ nhất.

**H: `NUMERIC` chậm hơn `FLOAT` bao nhiêu?**
Khoảng 2-5 lần cho phép tính, vì `FLOAT` chạy bằng lệnh phần cứng của CPU còn `NUMERIC` chạy bằng phần mềm. Nhưng trong query thực tế, thời gian đọc đĩa và join thường chiếm áp đảo, nên khác biệt này hiếm khi thấy được. Chỉ đáng bàn ở bảng hàng trăm triệu dòng và query tính toán nặng.

**H: Bảng đã lỡ dùng `FLOAT` rồi thì sao?**
Thêm cột `NUMERIC` mới, dựng trigger đồng bộ, backfill theo lô, đối soát bằng `IS DISTINCT FROM`, rồi đổi tên trong một transaction ngắn. Giữ cột cũ vài ngày. Quan trọng nhất: **dữ liệu cũ đã sai rồi thì đổi kiểu không sửa được sai số quá khứ** — phải đối soát lại với nguồn gốc (log giao dịch, sao kê ngân hàng).

**H: `DECIMAL(10,2)` và `NUMERIC(10,2)` khác nhau không?**
Trong PostgreSQL là một kiểu, hai tên gọi. Trong MySQL cũng vậy. Chuẩn SQL nói `DECIMAL` phải chính xác đúng `p` chữ số, còn `NUMERIC` được phép chính xác hơn — nhưng gần như không hệ nào phân biệt.

## Tóm tắt bài 1

- `FLOAT`/`REAL`/`DOUBLE` lưu **gần đúng** vì máy đếm bằng nhị phân — cấm dùng cho tiền.
- Tiền chỉ có hai lựa chọn đúng: `NUMERIC(p, s)` hoặc số nguyên theo **đơn vị nhỏ nhất** kèm mã tiền tệ.
- Không bao giờ so `=` trên cột `FLOAT`; dùng khoảng dung sai nếu bắt buộc.
- Cột đúng kiểu vẫn hỏng nếu tầng ứng dụng ép sang `float` — dùng `BigDecimal`/`Decimal`/`decimal.js`, và trả ID lớn về client dưới dạng chuỗi.
- **Làm tròn đúng một lần, ở bước cuối, theo luật nghiệp vụ** — số dư lẻ phải có người nhận.
- `FLOAT` vẫn đúng cho toạ độ, cảm biến, ML — nơi lệch một phần tỷ không ai mất tiền.

**Bài kế tiếp** → [Bài 2: Số nguyên và cái trần — tràn số trong SQL](02-so-nguyen-va-cai-tran-tran-so.md)

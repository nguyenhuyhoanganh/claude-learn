# Bài 2: JOIN toàn tập và bài toán "khách chưa từng đặt hàng"

Người phỏng vấn không hỏi "JOIN là gì" — câu đó ai cũng trả lời được. Họ hỏi: **"INNER JOIN khác LEFT JOIN chỗ nào?"**, và đây là lúc phần lớn ứng viên bắt đầu ấp úng. Không phải vì họ không biết, mà vì họ chỉ thuộc định nghĩa chứ chưa có mô hình hình dung được chuyện gì xảy ra với từng dòng dữ liệu.

Bài này xây mô hình đó, rồi dùng nó để giải bài toán kinh điển nhất của JOIN: *tìm những khách hàng chưa từng đặt bất kỳ đơn hàng nào* — bằng ba cách khác nhau, kèm phân tích cái nào nên dùng khi nào.

## Mô hình tư duy: JOIN là "tích Descartes rồi lọc"

Đây là mô hình đúng về mặt ngữ nghĩa và giải thích được mọi loại JOIN. Với `A JOIN B ON <điều kiện>`, hãy hình dung database làm hai bước:

```text
Bước 1 — Ghép MỌI dòng A với MỌI dòng B (tích Descartes / cartesian product)
    A có 3 dòng, B có 4 dòng  →  12 cặp

    a1-b1  a1-b2  a1-b3  a1-b4
    a2-b1  a2-b2  a2-b3  a2-b4
    a3-b1  a3-b2  a3-b3  a3-b4

Bước 2 — Giữ lại cặp nào thoả điều kiện ON
    Giả sử chỉ a1-b2 và a3-b1 thoả  →  kết quả 2 dòng
```

**INNER JOIN dừng ở đây.** Dòng nào của A không tìm được bạn nhảy nào ở B thì biến mất, và ngược lại. Đó chính là hình ảnh "buổi hẹn hò": chỉ những cặp match được với nhau mới xuất hiện trong danh sách cuối.

**LEFT JOIN làm thêm bước 3**: quét lại bảng A, dòng nào **không xuất hiện lần nào** trong kết quả bước 2 thì thêm nó vào, và bù toàn bộ cột của B bằng `NULL`.

```text
Bước 3 (chỉ LEFT JOIN) — Bù dòng mồ côi
    a2 không match với b nào  →  thêm dòng:  a2 | NULL | NULL | NULL
                                              ^^^^  ^^^^^^^^^^^^^^^^^
                                              cột A  toàn bộ cột B = NULL
```

Cái `NULL` sinh ra ở bước 3 chính là **chìa khoá** của toàn bộ bài này. Nó không phải dữ liệu thật — nó là dấu hiệu "dòng này không tìm được cặp". Và ta sẽ dùng chính dấu hiệu đó để làm bộ lọc.

### "Bù NULL" nghĩa là gì — xem từng bước trên dữ liệu thật

Cụm "bù NULL" (tiếng Anh gọi là *NULL padding*) nghe trừu tượng, nên hãy xem chính xác database tạo ra cái gì. Dùng dữ liệu mẫu thật, và cố tình rút gọn còn vài cột cho dễ nhìn.

**Dữ liệu đầu vào — hai bảng riêng biệt:**

```text
BẢNG TRÁI: customers                 BẢNG PHẢI: orders
┌─────────────┬───────────┐          ┌──────────┬─────────────┬───────────┐
│ customer_id │ full_name │          │ order_id │ customer_id │  status   │
├─────────────┼───────────┤          ├──────────┼─────────────┼───────────┤
│      1      │ Khach A   │          │    1     │      1      │ paid      │
│      2      │ Khach B   │          │    2     │      1      │ paid      │
│      3      │ Khach C   │          │    3     │      2      │ cancelled │
│      4      │ Khach D   │          │    4     │      2      │ shipped   │
│      5      │ Khach E   │          │    5     │      3      │ pending   │
└─────────────┴───────────┘          └──────────┴─────────────┴───────────┘
    5 dòng                                       5 dòng
```

**Bước 1 + 2 — ghép và lọc theo `ON o.customer_id = c.customer_id`:**

Database duyệt từng khách, tìm xem có đơn nào mang `customer_id` khớp không:

```text
Khach A (id=1) → tìm thấy order 1, order 2   → sinh 2 dòng
Khach B (id=2) → tìm thấy order 3, order 4   → sinh 2 dòng
Khach C (id=3) → tìm thấy order 5            → sinh 1 dòng
Khach D (id=4) → KHÔNG tìm thấy đơn nào      → sinh 0 dòng   ← "mồ côi"
Khach E (id=5) → KHÔNG tìm thấy đơn nào      → sinh 0 dòng   ← "mồ côi"
```

Kết quả trung gian sau bước 2 — **đây cũng chính là kết quả cuối cùng của `INNER JOIN`**:

```text
┌─────────────┬───────────┬──────────┬─────────────┬───────────┐
│ c.customer_id│c.full_name│o.order_id│o.customer_id│ o.status  │
├─────────────┼───────────┼──────────┼─────────────┼───────────┤
│      1      │ Khach A   │    1     │      1      │ paid      │
│      1      │ Khach A   │    2     │      1      │ paid      │
│      2      │ Khach B   │    3     │      2      │ cancelled │
│      2      │ Khach B   │    4     │      2      │ shipped   │
│      3      │ Khach C   │    5     │      3      │ pending   │
└─────────────┴───────────┴──────────┴─────────────┴───────────┘
   Khach D và Khach E KHÔNG có mặt ở đây.
```

**Bước 3 — chỉ `LEFT JOIN` mới làm bước này:**

Database quay lại rà bảng trái và tự hỏi từng dòng: *"Khách này đã xuất hiện ở kết quả bước 2 chưa?"*

- Khach A, B, C: đã xuất hiện → không làm gì thêm.
- Khach D, E: chưa xuất hiện lần nào → **phải thêm vào**, vì `LEFT JOIN` cam kết giữ trọn bảng trái.

Nhưng ở đây có một vấn đề kỹ thuật: bảng kết quả có 5 cột, trong đó 3 cột (`o.order_id`, `o.customer_id`, `o.status`) đến từ bảng `orders`. Khach D không có đơn nào, vậy **điền gì vào 3 ô đó**?

```text
Không thể để trống — bảng kết quả phải vuông, mọi dòng phải đủ 5 ô.
Không thể điền 0    — số 0 là một giá trị có nghĩa, sẽ bị hiểu nhầm là dữ liệu thật.
Không thể điền ''   — chuỗi rỗng cũng là một giá trị.

→ SQL điền NULL, nghĩa là "KHÔNG CÓ GÌ Ở ĐÂY".
  Chính hành động điền đó gọi là BÙ NULL (NULL padding).
```

Kết quả cuối cùng của `LEFT JOIN`:

```text
┌─────────────┬───────────┬──────────┬─────────────┬───────────┐
│ c.customer_id│c.full_name│o.order_id│o.customer_id│ o.status  │
├─────────────┼───────────┼──────────┼─────────────┼───────────┤
│      1      │ Khach A   │    1     │      1      │ paid      │
│      1      │ Khach A   │    2     │      1      │ paid      │
│      2      │ Khach B   │    3     │      2      │ cancelled │
│      2      │ Khach B   │    4     │      2      │ shipped   │
│      3      │ Khach C   │    5     │      3      │ pending   │
│      4      │ Khach D   │  [NULL]  │   [NULL]    │  [NULL]   │ ← dòng BÙ
│      5      │ Khach E   │  [NULL]  │   [NULL]    │  [NULL]   │ ← dòng BÙ
└─────────────┴───────────┴──────────┴─────────────┴───────────┘
              ▲───── cột bảng TRÁI ─────▲──── cột bảng PHẢI đều NULL ────▲
                 vẫn có dữ liệu thật
```

Ba điều cần rút ra từ hình này — và đây là phần người phỏng vấn muốn nghe:

1. **`NULL` ở hai dòng cuối không có trong bảng `orders`.** Bảng `orders` không hề chứa dòng nào rỗng như vậy. Chúng do **phép `LEFT JOIN` tự tạo ra** ngay tại thời điểm ghép, và chỉ tồn tại trong kết quả của câu lệnh này.

2. **Chỉ cột của bảng phải bị bù NULL.** Cột bảng trái (`customer_id`, `full_name`) vẫn giữ nguyên dữ liệu thật. Đó là ý nghĩa của "bảng trái là nhân vật chính".

3. **`NULL` ở đây mang một thông tin cụ thể**: "dòng bảng trái này không tìm được bất kỳ cặp nào ở bảng phải". Nó không phải dữ liệu thiếu, mà là **kết quả của một phép suy luận**. Và vì nó mang thông tin, ta dùng được nó làm bộ lọc.

Đó chính là lý do câu lệnh dưới đây hoạt động:

```sql
WHERE o.order_id IS NULL      -- "chỉ giữ những dòng được BÙ ra ở bước 3"
```

```text
Đọc thành lời:
  "order_id là khoá chính của bảng orders, nên trong dữ liệu thật nó KHÔNG BAO GIỜ rỗng.
   Vậy nếu tôi nhìn thấy một dòng có order_id rỗng, chỉ có MỘT khả năng duy nhất:
   dòng đó do LEFT JOIN bù ra. Mà bù ra nghĩa là khách này không có đơn nào."
```

**Vì sao `INNER JOIN` không có bước 3?** Vì cam kết của nó khác hẳn: nó chỉ hứa trả về những cặp **thật sự khớp nhau**. Khach D không khớp với đơn nào, nên theo đúng cam kết đó, Khach D không thuộc về kết quả. Không có dòng nào cần bù, và cũng không có `NULL` nào được sinh ra.

Tóm lại sự khác biệt giữa hai loại join nằm ở đúng một câu hỏi:

```text
                      "Dòng bảng trái không tìm được cặp thì sao?"
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
        INNER JOIN                                   LEFT JOIN
   "Vứt nó đi. Tôi chỉ quan tâm            "Giữ lại. Bảng trái là nhân vật chính.
    những cặp khớp nhau."                   Phần bảng phải thì điền NULL."
```

> Lưu ý cho tầng performance: database **không thật sự** tạo ra tích Descartes rồi mới lọc (12 dòng với bảng nhỏ thì được, chứ 1 triệu × 1 triệu thì bất khả thi). Nó dùng hash join, merge join hoặc nested loop có index. Nhưng **kết quả luôn giống hệt** mô hình trên. Nói được cả hai vế này khi phỏng vấn là điểm cộng — xem chi tiết ở [Bài 3](03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md).

## Năm loại JOIN, một hình vẽ

```text
        A          B                 Câu lệnh                  Giữ lại gì
    ┌───────┬───────┬───────┐
    │  chỉ  │ giao  │  chỉ  │
    │   A   │ A ∩ B │   B   │
    └───────┴───────┴───────┘

    [       ███████        ]    INNER JOIN         Chỉ phần giao
    [███████████████       ]    LEFT  [OUTER] JOIN Toàn bộ A + phần giao
    [       ███████████████]    RIGHT [OUTER] JOIN Toàn bộ B + phần giao
    [██████████████████████]    FULL  [OUTER] JOIN Tất cả từ hai phía
    [  mọi cặp A×B, không ON ]  CROSS JOIN         Tích Descartes đầy đủ
```

| Loại | Dòng A không match | Dòng B không match | Dùng khi nào trong thực tế |
|---|---|---|---|
| `INNER JOIN` | Loại bỏ | Loại bỏ | Mặc định — khi chỉ quan tâm dữ liệu có ở cả hai bên |
| `LEFT JOIN` | **Giữ**, cột B = NULL | Loại bỏ | Báo cáo "mọi khách hàng, kèm số đơn (0 nếu chưa mua)" |
| `RIGHT JOIN` | Loại bỏ | **Giữ**, cột A = NULL | Hiếm dùng — đổi vị trí bảng rồi dùng LEFT dễ đọc hơn |
| `FULL OUTER JOIN` | **Giữ** | **Giữ** | Đối soát hai nguồn dữ liệu: bên nào thiếu, bên nào thừa |
| `CROSS JOIN` | — (không có ON) | — | Sinh ma trận: mọi ngày × mọi sản phẩm để lấp lỗ hổng báo cáo |

**Mẹo trả lời phỏng vấn**: `RIGHT JOIN` gần như không bao giờ nên dùng trong code production. `A RIGHT JOIN B` luôn viết lại được thành `B LEFT JOIN A`, và người đọc chỉ cần nhớ một chiều. Nói được ý này cho thấy bạn quan tâm tới code review chứ không chỉ tới kết quả.

## Chạy thử trên dữ liệu mẫu

### INNER JOIN — chỉ khách có đơn

```sql
SELECT c.customer_id,
       c.full_name,
       o.order_id,
       o.total_amount
FROM customers AS c
INNER JOIN orders AS o ON o.customer_id = c.customer_id
ORDER BY c.customer_id, o.order_id;
```

```text
 customer_id | full_name | order_id | total_amount
-------------+-----------+----------+--------------
           1 | Khach A   |        1 |      1850000
           1 | Khach A   |        2 |      5400000
           2 | Khach B   |        3 |      3200000
           2 | Khach B   |        4 |      2100000
           3 | Khach C   |        5 |       650000
(5 dòng)
```

Khách D và E **biến mất hoàn toàn**. Đây là hành vi đúng của INNER JOIN — và cũng là nguồn gốc của một lớp bug kinh điển khi đi làm: báo cáo "tổng số khách hàng" viết bằng INNER JOIN sẽ âm thầm bỏ sót toàn bộ khách chưa mua.

Cũng để ý: khách A xuất hiện **hai dòng** vì có hai đơn. Số dòng kết quả không bằng số dòng bảng trái — đây là hiện tượng *nhân dòng* (fanout), sẽ đào sâu ở bài sau.

### LEFT JOIN — giữ toàn bộ khách

```sql
SELECT c.customer_id,
       c.full_name,
       o.order_id,
       o.total_amount
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
ORDER BY c.customer_id, o.order_id;
```

```text
 customer_id | full_name | order_id | total_amount
-------------+-----------+----------+--------------
           1 | Khach A   |        1 |      1850000
           1 | Khach A   |        2 |      5400000
           2 | Khach B   |        3 |      3200000
           2 | Khach B   |        4 |      2100000
           3 | Khach C   |        5 |       650000
           4 | Khach D   |   [NULL] |       [NULL]   ← bù NULL ở bước 3
           5 | Khach E   |   [NULL] |       [NULL]   ← bù NULL ở bước 3
(7 dòng)
```

Hai dòng cuối là **dòng do LEFT JOIN sinh ra**, không có thật trong bảng `orders`. Bảng bên trái là nhân vật chính, luôn được giữ nguyên vẹn.

## Bài toán kinh điển: khách chưa từng đặt hàng

Đề bài xuất hiện trong hầu hết mọi buổi phỏng vấn, dưới nhiều lớp áo khác nhau: *khách chưa mua*, *user chưa từng đăng nhập*, *sản phẩm chưa bán được cái nào*, *nhân viên chưa nộp báo cáo*. Tất cả đều là cùng một dạng: **anti-join** (phép trừ tập hợp).

### Cách 1 — LEFT JOIN + IS NULL (cách kinh điển)

Chỉ đúng hai bước:

```sql
SELECT c.customer_id,
       c.full_name,
       c.email
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id   -- bước 1: giữ mọi khách
WHERE o.order_id IS NULL;                                 -- bước 2: chỉ giữ dòng không match
```

```text
 customer_id | full_name |   email
-------------+-----------+------------
           4 | Khach D   | d@shop.vn
           5 | Khach E   | [NULL]
```

**Vì sao bước 2 hoạt động?** Vì `order_id` là khoá chính của `orders`, nó **không bao giờ NULL trong dữ liệu thật**. Nên nếu ta thấy `order_id IS NULL`, chỉ có một khả năng duy nhất: dòng đó do LEFT JOIN bù ra ở bước 3 → khách này không match với đơn nào.

> **Bẫy chết người**: phải kiểm tra `IS NULL` trên cột **không nullable** của bảng phải (khoá chính, hoặc cột `NOT NULL`). Nếu bạn viết `WHERE o.total_amount IS NULL` mà cột `total_amount` cho phép NULL, bạn sẽ vô tình bắt luôn cả những đơn thật có `total_amount` rỗng. Người phỏng vấn rất hay hỏi vặn đúng chỗ này.

### Cách 2 — NOT EXISTS (cách an toàn nhất)

```sql
SELECT c.customer_id,
       c.full_name
FROM customers AS c
WHERE NOT EXISTS (
    SELECT 1
    FROM orders AS o
    WHERE o.customer_id = c.customer_id
);
```

`EXISTS` trả về đúng/sai chứ không trả dữ liệu, nên viết `SELECT 1` hay `SELECT *` bên trong đều như nhau — optimizer bỏ qua danh sách cột. Nó dừng ngay khi tìm thấy dòng đầu tiên khớp (*short-circuit*).

Đây là cách **an toàn nhất** vì nó miễn nhiễm với NULL (giải thích ngay dưới).

### Cách 3 — NOT IN (cách có bẫy)

```sql
SELECT c.customer_id, c.full_name
FROM customers AS c
WHERE c.customer_id NOT IN (SELECT o.customer_id FROM orders AS o);
```

Với dữ liệu mẫu hiện tại, câu này chạy đúng. Nhưng nó là **quả bom hẹn giờ**.

### Bẫy NOT IN + NULL — câu hỏi vặn kinh điển

Giả sử bảng `orders` có một dòng với `customer_id` là `NULL` (đơn của khách vãng lai, hoặc dữ liệu import lỗi):

```sql
INSERT INTO orders (customer_id, status, ordered_at, total_amount)
VALUES (NULL, 'paid', '2024-07-01', 100000);   -- giả sử cột cho phép NULL
```

Chạy lại cách 3 → **kết quả trả về 0 dòng**. Không lỗi, không cảnh báo, chỉ đơn giản là sai.

Nguyên nhân nằm ở **logic ba trị** (three-valued logic) của SQL. `x NOT IN (a, b, NULL)` được database dịch thành:

```text
x <> a  AND  x <> b  AND  x <> NULL

Mà bất kỳ phép so sánh nào với NULL đều cho UNKNOWN, không phải TRUE/FALSE:
    4 <> NULL   →  UNKNOWN

Bảng chân trị của AND:
    TRUE    AND UNKNOWN  →  UNKNOWN
    FALSE   AND UNKNOWN  →  FALSE
    UNKNOWN AND UNKNOWN  →  UNKNOWN

WHERE chỉ giữ dòng có giá trị TRUE. UNKNOWN bị loại như FALSE.
→ Không dòng nào TRUE được nữa  →  kết quả rỗng.
```

Đây là câu người phỏng vấn dùng để phân biệt ứng viên đã từng bị dữ liệu thật cắn với ứng viên chỉ học lý thuyết. Câu trả lời hoàn chỉnh gồm ba phần: (1) nó trả về rỗng, (2) vì logic ba trị như trên, (3) khắc phục bằng `NOT EXISTS`, hoặc thêm `WHERE o.customer_id IS NOT NULL` vào subquery.

### Hai thuật ngữ cần biết: anti-join và semi-join

Bài toán vừa giải có một cái tên chính thức, và người phỏng vấn thường dùng chính cái tên đó:

```text
SEMI-JOIN  —  "lấy dòng bảng trái CÓ ít nhất một cặp bên phải"
              Ví dụ: khách ĐÃ TỪNG đặt hàng
              Viết bằng: EXISTS  /  IN

ANTI-JOIN  —  "lấy dòng bảng trái KHÔNG có cặp nào bên phải"
              Ví dụ: khách CHƯA TỪNG đặt hàng
              Viết bằng: NOT EXISTS  /  LEFT JOIN ... IS NULL
```

Điểm khiến chúng khác hẳn `INNER JOIN` thông thường: **cả hai đều không nhân dòng và không lấy dữ liệu từ bảng phải**. Chúng chỉ dùng bảng phải để trả lời một câu hỏi đúng/sai — "có hay không có cặp" — rồi vứt bỏ.

```text
INNER JOIN customers–orders   →  5 dòng (Khach A xuất hiện 2 lần vì có 2 đơn)
SEMI-JOIN  customers–orders   →  3 dòng (mỗi khách CÓ đơn xuất hiện đúng 1 lần)
ANTI-JOIN  customers–orders   →  2 dòng (Khach D, E)
                                  ▲
                       số dòng không bao giờ vượt quá số dòng bảng trái
```

Đó là lý do `EXISTS` không cần `DISTINCT` còn `JOIN` thì cần — một khác biệt sẽ quay lại nhiều lần trong series.

### So sánh ba cách

| Tiêu chí | LEFT JOIN + IS NULL | NOT EXISTS | NOT IN |
|---|---|---|---|
| An toàn với NULL | An toàn | **An toàn** | **Nguy hiểm** — rỗng nếu có NULL |
| Độ dễ đọc | Tốt, quen thuộc | Tốt, diễn tả đúng ý "không tồn tại" | Ngắn nhất nhưng dễ hiểu nhầm |
| Plan thường gặp (Postgres) | Hash Anti Join | Hash Anti Join | Thường phải materialize + kiểm NULL |
| Nhiều cột điều kiện | Cồng kềnh | Rất gọn | Phải dùng tuple, khó đọc |
| Khuyến nghị | Dùng được | **Mặc định nên dùng** | Chỉ khi chắc chắn không NULL |

Trên PostgreSQL hiện đại, `NOT EXISTS` và `LEFT JOIN ... IS NULL` thường được optimizer quy về **cùng một plan** (Hash Anti Join), nên tốc độ tương đương. Điểm khác nhau thật sự là ngữ nghĩa an toàn và tính diễn đạt. Câu trả lời ăn điểm: *"Về plan hai cách thường như nhau, em chọn `NOT EXISTS` vì nó không vỡ khi cột có NULL và đọc lên đúng nghĩa 'không tồn tại đơn nào'."*

## Use case thực chiến: cùng một khuôn mẫu, năm bài toán

Nhận ra "đây là anti-join" là kỹ năng đáng giá — vì bạn sẽ gặp nó liên tục khi đi làm:

```sql
-- 1. Sản phẩm chưa bán được cái nào (dọn kho, phân tích tồn)
SELECT p.sku, p.name
FROM products AS p
WHERE NOT EXISTS (SELECT 1 FROM order_items AS oi WHERE oi.product_id = p.product_id);
-- → SKU-005 (Webcam 4K)

-- 2. Đơn đã tạo nhưng CHƯA có thanh toán (đối soát tài chính — chạy hằng ngày)
SELECT o.order_id, o.total_amount, o.ordered_at
FROM orders AS o
WHERE o.status <> 'cancelled'
  AND NOT EXISTS (SELECT 1 FROM payments AS pm WHERE pm.order_id = o.order_id);
-- → order 5 (pending). Đây chính là báo cáo "tiền treo" mà kế toán hỏi mỗi sáng.

-- 3. Phòng ban không có nhân viên nào (dọn dữ liệu master)
SELECT d.dept_name
FROM departments AS d
WHERE NOT EXISTS (SELECT 1 FROM employees AS e WHERE e.dept_id = d.dept_id);
-- → Legal

-- 4. Khách đăng ký >30 ngày mà chưa mua lần nào (danh sách cho chiến dịch win-back)
SELECT c.customer_id, c.email
FROM customers AS c
WHERE c.created_at < now() - INTERVAL '30 days'
  AND NOT EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.customer_id);

-- 5. Khách CÓ đơn nhưng chưa đơn nào thành công (mua hụt — dấu hiệu lỗi thanh toán)
SELECT c.customer_id, c.email
FROM customers AS c
WHERE EXISTS     (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id)
  AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.customer_id
                                           AND o.status IN ('paid', 'shipped'));
```

Case 5 là dạng người phỏng vấn hay dùng để tăng độ khó: nó cần **đồng thời** `EXISTS` và `NOT EXISTS`, và không viết được bằng một `LEFT JOIN ... IS NULL` đơn giản.

## Bài toán biến thể hay bị hỏi tiếp: đếm đơn của MỌI khách

Câu hỏi nối tiếp gần như chắc chắn sẽ có: *"Giờ liệt kê mọi khách kèm số đơn, khách chưa mua thì hiện 0."*

```sql
SELECT c.customer_id,
       c.full_name,
       COUNT(o.order_id)                      AS so_don,      -- ĐÚNG
       COALESCE(SUM(o.total_amount), 0)       AS tong_chi
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.full_name
ORDER BY so_don DESC;
```

```text
 customer_id | full_name | so_don | tong_chi
-------------+-----------+--------+----------
           1 | Khach A   |      2 |  7250000
           2 | Khach B   |      2 |  5300000
           3 | Khach C   |      1 |   650000
           4 | Khach D   |      0 |        0
           5 | Khach E   |      0 |        0
```

Ở đây có **hai bẫy** cùng lúc, và đây là chỗ ứng viên hay rơi:

**Bẫy 1: `COUNT(*)` thay vì `COUNT(o.order_id)`.** `COUNT(*)` đếm số *dòng*, mà khách D vẫn có đúng một dòng (dòng bù NULL) → sẽ ra **1** thay vì **0**. `COUNT(o.order_id)` chỉ đếm giá trị **khác NULL** → ra đúng 0.

```text
COUNT(*)          → đếm dòng, kể cả dòng toàn NULL   → Khach D = 1  (SAI)
COUNT(o.order_id) → bỏ qua NULL                       → Khach D = 0  (ĐÚNG)
```

**Bẫy 2: `SUM` trả NULL chứ không phải 0.** `SUM` của một tập toàn NULL là `NULL`, không phải `0`. Đưa thẳng ra báo cáo sẽ hiện ô trống. Bọc `COALESCE(..., 0)` để chuẩn hoá.

## Bẫy thường gặp với JOIN

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `INNER JOIN` khi cần "mọi bản ghi bên trái" | Âm thầm mất dòng, báo cáo thiếu số | Vẽ ra: bảng nào là "nhân vật chính"? |
| `NOT IN` với subquery có NULL | Kết quả rỗng, không báo lỗi | Dùng `NOT EXISTS` |
| `IS NULL` trên cột nullable của bảng phải | Bắt nhầm dòng có thật | Kiểm trên khoá chính bảng phải |
| `COUNT(*)` sau LEFT JOIN | Khách không đơn bị đếm thành 1 | `COUNT(cột_bảng_phải)` |
| `SUM` sau LEFT JOIN không bọc COALESCE | Ô trống thay vì 0 | `COALESCE(SUM(x), 0)` |
| Quên `status <> 'cancelled'` | Tính cả đơn huỷ vào doanh thu | Hỏi lại đề trước khi viết |
| Dùng `RIGHT JOIN` trong code chung | Người review phải xoay đầu | Đổi vị trí bảng, dùng `LEFT` |
| `JOIN` không có `ON` (quên điều kiện) | Tích Descartes, query treo | Bật `ONLY_FULL_GROUP_BY`/review kỹ |

## Câu hỏi phỏng vấn hay gặp về JOIN

**"INNER JOIN và LEFT JOIN, cái nào nhanh hơn?"**
Không có câu trả lời cố định. `INNER JOIN` **thường** nhanh hơn hoặc bằng, vì optimizer được tự do đổi thứ tự bảng và đẩy bộ lọc xuống sớm; với `LEFT JOIN`, bảng trái buộc phải được bảo toàn nên không gian tối ưu hẹp hơn. Nhưng nếu điều kiện lọc làm bảng phải teo lại còn vài dòng thì chênh lệch không đáng kể. Đây là câu nên trả lời bằng "tuỳ dữ liệu và plan, em sẽ `EXPLAIN ANALYZE` để biết chắc".

**"`LEFT JOIN` rồi `WHERE b.col = 'x'` thì sao?"**
Nó biến LEFT JOIN thành INNER JOIN — vì dòng bù NULL không thoả `b.col = 'x'` nên bị `WHERE` loại sạch. Đây là bẫy được hỏi nhiều nhất và có hẳn một mục riêng ở [Bài 3](03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md).

**"JOIN 3 bảng trở lên thì viết thế nào?"**
Nối tuần tự, mỗi `JOIN` một dòng, và luôn tự hỏi sau mỗi bước: *số dòng có bị nhân lên không?* Ví dụ `orders JOIN order_items` sẽ nhân đơn hàng lên theo số sản phẩm — nếu sau đó `SUM(o.total_amount)` thì doanh thu bị tính trùng. Chi tiết ở bài sau.

**"CROSS JOIN dùng làm gì trong thực tế?"**
Sinh khung dữ liệu đầy đủ. Ví dụ báo cáo doanh thu theo ngày × danh mục, ngày nào không bán được gì vẫn phải hiện dòng 0: `CROSS JOIN` chuỗi ngày với danh sách danh mục, rồi `LEFT JOIN` dữ liệu thật vào.

**"FULL OUTER JOIN dùng khi nào?"**
Đối soát (reconciliation) hai nguồn: so sổ nội bộ với sao kê ngân hàng, tìm giao dịch bên nào có mà bên kia thiếu:

```sql
SELECT COALESCE(a.txn_id, b.txn_id) AS txn_id,
       CASE WHEN a.txn_id IS NULL THEN 'chi co o ngan hang'
            WHEN b.txn_id IS NULL THEN 'chi co o he thong'
            ELSE 'khop' END AS trang_thai
FROM he_thong AS a
FULL OUTER JOIN ngan_hang AS b ON b.txn_id = a.txn_id
WHERE a.txn_id IS NULL OR b.txn_id IS NULL;
```

> MySQL 8 **không có** `FULL OUTER JOIN`. Cách thay thế: `LEFT JOIN` `UNION` `RIGHT JOIN`. Biết chi tiết này là dấu hiệu bạn từng làm việc thật với MySQL.

## Tóm tắt bài 2

- JOIN = ghép mọi cặp rồi lọc theo `ON`; LEFT JOIN làm thêm bước bù `NULL` cho dòng mồ côi.
- `NULL` do LEFT JOIN sinh ra là **dấu hiệu "không match"** — nền tảng của mọi anti-join.
- Bài toán "chưa từng..." có ba cách giải; **`NOT EXISTS` là mặc định nên chọn** vì miễn nhiễm NULL.
- `NOT IN` + subquery chứa NULL → trả về rỗng, không báo lỗi. Đây là câu hỏi vặn kinh điển.
- Sau LEFT JOIN, luôn dùng `COUNT(cột_bảng_phải)` và `COALESCE(SUM(...), 0)`.

**Bài kế tiếp** → [Bài 3: Bẫy ON vs WHERE, nhân dòng và thuật toán join](03-join-nang-cao-fanout-on-vs-where-va-thuat-toan-join.md)

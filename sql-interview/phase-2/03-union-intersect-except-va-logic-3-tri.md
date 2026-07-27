# Bài 3: UNION, INTERSECT, EXCEPT và logic ba trị của NULL

Hai chủ đề trong một bài, và chúng liên quan chặt với nhau hơn bạn tưởng: phép toán tập hợp là cách SQL so sánh **hai tập dữ liệu**, còn `NULL` là thứ phá vỡ mọi quy tắc so sánh mà bạn nghĩ là hiển nhiên. Cộng lại, đây là mảng gây ra những con số sai mà không ai phát hiện.

`NULL` xứng đáng có phần riêng vì một lý do đơn giản: nó là **nguyên nhân số một** khiến query đúng cú pháp cho ra kết quả sai. Người phỏng vấn biết điều đó, nên câu hỏi về NULL xuất hiện ở mọi cấp độ.

## Bốn phép toán tập hợp

```text
        A          B
    ┌───────┬───────┬───────┐
    │  chỉ  │ giao  │  chỉ  │
    │   A   │ A ∩ B │   B   │
    └───────┴───────┴───────┘

  UNION      [███████████████████████]  A ∪ B, ĐÃ khử trùng lặp
  UNION ALL  [███████████████████████]  A ∪ B, GIỮ nguyên trùng lặp (nhanh hơn)
  INTERSECT  [        ███████        ]  chỉ phần chung
  EXCEPT     [███████                ]  có ở A, KHÔNG có ở B   (Oracle gọi là MINUS)
```

```sql
-- Danh sách mọi thành phố xuất hiện trong hệ thống
SELECT city FROM customers WHERE city IS NOT NULL
UNION
SELECT location FROM departments;
```

```text
    city
-------------
 Da Nang
 Ha Noi
 Ho Chi Minh
```

Ba luật cứng khi dùng phép toán tập hợp:

```text
1. Số cột phải BẰNG NHAU ở mọi nhánh.
2. Kiểu dữ liệu phải TƯƠNG THÍCH theo từng vị trí cột (cột 1 với cột 1, ...).
3. Tên cột kết quả lấy từ nhánh ĐẦU TIÊN; các nhánh sau chỉ khớp theo VỊ TRÍ, không theo tên.
4. ORDER BY chỉ đặt ở CUỐI CÙNG, áp cho toàn bộ kết quả.
```

Luật số 3 là nguồn của một bug rất khó thấy:

```sql
-- SAI ÂM THẦM: cột bị lệch vị trí, không hề báo lỗi vì cả hai đều là TEXT
SELECT full_name, city  FROM customers
UNION ALL
SELECT location, dept_name FROM departments;    -- location vào cột "full_name"!
```

Không lỗi, không cảnh báo, dữ liệu trộn lẫn. Cách phòng: luôn viết rõ danh sách cột theo đúng thứ tự và đọc lại từng nhánh khi review.

### UNION và UNION ALL: khác biệt về performance

```text
UNION ALL : nối hai tập, xong.                              → O(n + m)
UNION     : nối hai tập, RỒI sort/hash toàn bộ để khử trùng → O((n+m) log(n+m)) + RAM
```

Trên bảng lớn, khác biệt là hàng chục lần. Quy tắc: **mặc định dùng `UNION ALL`**, chỉ dùng `UNION` khi bạn thật sự cần khử trùng lặp và không có cách nào đảm bảo hai nhánh rời nhau.

Trong rất nhiều trường hợp, hai nhánh vốn đã rời nhau về mặt logic — lúc đó `UNION` chỉ tốn công vô ích:

```sql
-- Hai nhánh không thể trùng nhau (một bên đã huỷ, một bên chưa) → UNION ALL là đủ
SELECT order_id, 'da_huy'  AS loai FROM orders WHERE status = 'cancelled'
UNION ALL
SELECT order_id, 'dang_xu_ly'     FROM orders WHERE status IN ('pending', 'paid');
```

### Use case thực chiến

```sql
-- 1. Gộp bảng đang chạy với bảng lưu trữ (pattern rất phổ biến khi có archive)
SELECT order_id, customer_id, total_amount, ordered_at FROM orders
UNION ALL
SELECT order_id, customer_id, total_amount, ordered_at FROM orders_archive
WHERE ordered_at >= '2023-01-01';

-- 2. EXCEPT để đối chiếu dữ liệu — dùng khi kiểm thử di trú (migration)
SELECT customer_id, email FROM customers_cu
EXCEPT
SELECT customer_id, email FROM customers_moi;
-- → dòng nào còn lại nghĩa là di trú bị thiếu hoặc sai. Rỗng = khớp hoàn toàn.

-- 3. INTERSECT: khách vừa mua accessory vừa mua monitor
SELECT o.customer_id FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p ON p.product_id = oi.product_id AND p.category = 'accessory'
INTERSECT
SELECT o.customer_id FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN products p ON p.product_id = oi.product_id AND p.category = 'monitor';
```

Case 2 là câu trả lời rất mạnh cho câu hỏi *"bạn kiểm tra kết quả migration thế nào?"*: chạy `EXCEPT` hai chiều, cả hai đều rỗng nghĩa là hai tập giống hệt nhau.

> **Chi tiết quan trọng**: `EXCEPT` và `INTERSECT` so sánh dòng theo kiểu **`NULL` được coi là bằng `NULL`** — khác hẳn với `=` trong `WHERE`. Đây là ngoại lệ hiếm hoi mà SQL đối xử với NULL như một giá trị bình thường, và nó khiến `EXCEPT` trở thành công cụ đối chiếu đáng tin hơn nhiều so với tự viết join.

> MySQL 8.0.31+ mới có `INTERSECT`/`EXCEPT`. Với phiên bản cũ hơn, phải thay bằng `INNER JOIN` (cho INTERSECT) và `LEFT JOIN ... IS NULL` (cho EXCEPT) — và lúc đó phải tự xử lý NULL bằng tay.

## NULL không phải là giá trị — nó là "không biết"

Đây là mô hình tư duy cần cài vào đầu: `NULL` **không** nghĩa là 0, không nghĩa là chuỗi rỗng, không nghĩa là "sai". Nó nghĩa là **"không biết"** (unknown).

Từ đó suy ra mọi hành vi kỳ quặc:

```sql
SELECT NULL = NULL;      -- → NULL (không phải TRUE!)  "không biết có bằng không biết?"
SELECT NULL <> NULL;     -- → NULL
SELECT NULL + 1;         -- → NULL   "không biết cộng 1 vẫn là không biết"
SELECT 'abc' || NULL;    -- → NULL   (nối chuỗi cũng bị nuốt)
SELECT NULL > 0;         -- → NULL
```

**SQL dùng logic ba trị**: mọi biểu thức boolean cho ra `TRUE`, `FALSE`, hoặc `UNKNOWN`.

```text
      AND  │ TRUE  FALSE  UNK              OR   │ TRUE  FALSE  UNK
    ───────┼───────────────────          ───────┼───────────────────
     TRUE  │ TRUE  FALSE  UNK             TRUE  │ TRUE  TRUE   TRUE
     FALSE │ FALSE FALSE  FALSE           FALSE │ TRUE  FALSE  UNK
     UNK   │ UNK   FALSE  UNK             UNK   │ TRUE  UNK    UNK

     NOT TRUE = FALSE      NOT FALSE = TRUE      NOT UNKNOWN = UNKNOWN
```

Hai ô đáng nhớ nhất: `FALSE AND UNKNOWN = FALSE` (vì sai một vế là đủ sai), và `TRUE OR UNKNOWN = TRUE` (đúng một vế là đủ đúng). Chính hai ô này quyết định `NOT IN` sụp đổ còn `IN` thì không.

**Quy tắc vàng**: `WHERE` chỉ giữ dòng cho `TRUE`. `UNKNOWN` bị loại y như `FALSE`.

Hệ quả gây sốc nhất:

```sql
SELECT * FROM customers WHERE city = 'Ha Noi';    -- 2 dòng
SELECT * FROM customers WHERE city <> 'Ha Noi';   -- 2 dòng  (không phải 3!)
-- Tổng = 4, nhưng bảng có 5 khách. Khach D (city NULL) KHÔNG nằm ở cả hai vế.
```

Đây là bug kinh điển của báo cáo phân khúc: cộng tất cả nhóm lại không bằng tổng chung, vì các dòng NULL rơi vào khoảng trống giữa `=` và `<>`. Cách sửa:

```sql
SELECT * FROM customers WHERE city <> 'Ha Noi' OR city IS NULL;
-- hoặc gọn hơn trên PostgreSQL:
SELECT * FROM customers WHERE city IS DISTINCT FROM 'Ha Noi';
```

### `IS DISTINCT FROM`: toán tử so sánh an-toàn-với-NULL

```text
  Biểu thức                        Kết quả
  ──────────────────────────────   ─────────
  NULL =  NULL                     UNKNOWN
  NULL IS NOT DISTINCT FROM NULL   TRUE      ← "bằng nhau" theo nghĩa thông thường
  1    IS DISTINCT FROM NULL       TRUE      ← "khác nhau" theo nghĩa thông thường
  1    <> NULL                     UNKNOWN
```

Cực kỳ hữu ích khi so sánh hai cột đều có thể NULL — ví dụ phát hiện thay đổi dữ liệu trong pipeline ETL:

```sql
-- Tìm bản ghi có thay đổi giữa hai bảng, xử lý đúng cả trường hợp NULL
SELECT n.id
FROM moi n
JOIN cu  c ON c.id = n.id
WHERE n.email IS DISTINCT FROM c.email
   OR n.city  IS DISTINCT FROM c.city;
```

Viết bằng `<>` thuần sẽ **bỏ sót** mọi thay đổi liên quan tới NULL (từ có giá trị sang NULL và ngược lại). Đây là bug ETL cực kỳ hay gặp. MySQL có toán tử tương đương là `<=>` (null-safe equal), dùng ngược lại: `NOT (a <=> b)`.

### NULL cư xử thế nào ở từng ngữ cảnh

Bảng này đáng học thuộc — nó gói gọn phần lớn câu hỏi phỏng vấn về NULL:

| Ngữ cảnh | Hành vi với NULL |
|---|---|
| `WHERE col = x` | Dòng NULL bị loại |
| `WHERE col <> x` | Dòng NULL **cũng** bị loại |
| `JOIN ... ON a.x = b.x` | NULL không match với NULL → dòng bị mất |
| `GROUP BY` | Mọi NULL gom vào **một nhóm chung** |
| `DISTINCT` | Nhiều NULL bị rút thành **một** |
| `ORDER BY` | Postgres: NULL cuối khi ASC; MySQL: NULL đầu khi ASC |
| `COUNT(col)` | Bỏ qua NULL |
| `SUM`/`AVG`/`MAX`/`MIN` | Bỏ qua NULL |
| Ràng buộc `UNIQUE` | Cho phép **nhiều** dòng NULL (chúng không "bằng nhau") |
| `CHECK (col > 0)` | NULL cho `UNKNOWN` → **được chấp nhận** (chỉ chặn `FALSE`) |
| `EXCEPT` / `INTERSECT` | NULL được coi là **bằng** NULL |
| `NOT IN (tập có NULL)` | Luôn trả rỗng |
| Nối chuỗi `\|\|` | Toàn bộ chuỗi thành NULL |

Ba dòng cuối là những chỗ hành vi **không nhất quán** với phần còn lại — và chính vì thế mà chúng hay được hỏi.

Chi tiết `UNIQUE` cho phép nhiều NULL là câu hỏi rất hay gặp trong phỏng vấn thiên về thiết kế:

```sql
-- Bảng customers có UNIQUE(email), nhưng Khach E có email NULL.
INSERT INTO customers (full_name, email) VALUES ('Khach F', NULL);   -- THÀNH CÔNG
-- Hai dòng cùng email NULL vẫn hợp lệ, vì NULL <> NULL.
```

Muốn "chỉ một dòng được phép NULL", cần partial unique index:

```sql
CREATE UNIQUE INDEX ON customers ((email IS NULL)) WHERE email IS NULL;
```

Còn chi tiết `ORDER BY` khác nhau giữa các hệ thì sửa bằng cách viết rõ ràng:

```sql
SELECT city FROM customers ORDER BY city ASC NULLS LAST;   -- Postgres/Oracle
SELECT city FROM customers ORDER BY city IS NULL, city;    -- MySQL: cách di động
```

## Bộ công cụ xử lý NULL

```sql
-- COALESCE: trả về giá trị KHÁC NULL đầu tiên trong danh sách
SELECT COALESCE(city, 'Chua cap nhat') FROM customers;
SELECT COALESCE(sdt_di_dong, sdt_ban, email, 'khong co lien he') FROM lien_he;

-- NULLIF: biến một giá trị cụ thể thành NULL — dùng nhiều nhất để chống chia cho 0
SELECT doanh_thu / NULLIF(so_don, 0) AS gia_tri_don_tb FROM thong_ke;
SELECT NULLIF(city, '') FROM customers;   -- chuẩn hoá chuỗi rỗng thành NULL

-- CASE: xử lý NULL tường minh, luôn nhớ nhánh IS NULL đứng trước
SELECT full_name,
       CASE WHEN city IS NULL   THEN 'chua ro'
            WHEN city = 'Ha Noi' THEN 'mien bac'
            ELSE 'khac' END AS vung
FROM customers;
```

Bẫy với `CASE`: nếu viết `CASE city WHEN NULL THEN ...` thì **không bao giờ khớp**, vì dạng này so sánh bằng `=` và `city = NULL` cho `UNKNOWN`. Luôn dùng dạng `CASE WHEN col IS NULL THEN ...`. Đây là câu hỏi mẹo rất hay xuất hiện.

Bẫy với `COALESCE` trong điều kiện lọc:

```sql
-- Chạy đúng nhưng làm MẤT INDEX trên cột city (xem phase-3 bài 1)
WHERE COALESCE(city, 'x') = 'Ha Noi'

-- Viết lại giữ được index
WHERE city = 'Ha Noi'
```

### NULL và chuỗi rỗng

```text
PostgreSQL, MySQL, SQL Server:  '' KHÁC NULL     ('' là chuỗi có độ dài 0)
Oracle:                         '' ĐƯỢC COI LÀ NULL   ← đặc thù riêng, hay bị hỏi
```

Trong thực tế, dữ liệu nhập từ form web thường lẫn cả hai, và đó là nguồn bug kinh điển: bộ lọc `WHERE city IS NULL` bỏ sót các dòng có `city = ''`. Chuẩn hoá ngay ở tầng nhận dữ liệu, hoặc dùng `NULLIF(TRIM(city), '')` khi đọc.

## Bẫy thường gặp về NULL và tập hợp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `col = NULL` | Không bao giờ đúng | `IS NULL` |
| `WHERE col <> 'x'` bỏ sót dòng NULL | Tổng các nhóm không khớp tổng chung | `OR col IS NULL` hoặc `IS DISTINCT FROM` |
| `NOT IN` với tập có NULL | Rỗng | `NOT EXISTS` |
| So sánh hai cột nullable bằng `<>` trong ETL | Bỏ sót thay đổi | `IS DISTINCT FROM` / `<=>` |
| `UNION` khi không cần khử trùng | Chậm nhiều lần | `UNION ALL` |
| `UNION` với cột lệch vị trí | Trộn dữ liệu, không báo lỗi | Liệt kê cột rõ ràng, review từng nhánh |
| `ORDER BY` giữa các nhánh `UNION` | Lỗi cú pháp | Chỉ đặt `ORDER BY` ở cuối |
| `CASE col WHEN NULL` | Không bao giờ khớp | `CASE WHEN col IS NULL` |
| Nối chuỗi có cột NULL | Cả chuỗi thành NULL | `COALESCE(col, '')` hoặc `CONCAT_WS` |
| Tin `UNIQUE` chặn được NULL trùng | Nhiều dòng NULL cùng tồn tại | Partial unique index |

## Câu hỏi phỏng vấn hay gặp

**"`UNION` và `UNION ALL` khác nhau thế nào, dùng cái nào?"**
`UNION` khử trùng lặp (tốn thêm một bước sort/hash), `UNION ALL` giữ nguyên. Mặc định nên `UNION ALL` vì rẻ hơn; chỉ dùng `UNION` khi thật sự cần khử trùng. Thêm được câu *"nếu hai nhánh vốn rời nhau về logic thì `UNION` chỉ tốn công vô ích"* là đủ đầy đặn.

**"`COUNT(*)` có đếm dòng NULL không?"**
Có — `COUNT(*)` đếm **dòng**, không quan tâm nội dung. Chỉ `COUNT(col)` mới bỏ qua NULL.

**"Vì sao `WHERE col <> 'x'` không trả về dòng có `col` NULL?"**
Vì `NULL <> 'x'` cho `UNKNOWN`, mà `WHERE` chỉ giữ `TRUE`. Đây là câu kiểm tra bạn có nắm logic ba trị hay không.

**"NULL trong index có được lưu không?"**
PostgreSQL **có** lưu NULL trong index B-Tree, nên `WHERE col IS NULL` vẫn dùng được index. Oracle thì **không** lưu NULL trong index B-Tree đơn cột, nên `IS NULL` phải quét toàn bảng — một khác biệt kinh điển giữa hai hệ.

**"Thiết kế bảng: nên cho phép NULL hay dùng giá trị mặc định?"**
Câu hỏi thiên về thiết kế. Trả lời tốt: dùng `NULL` khi "chưa biết / không áp dụng" là trạng thái có nghĩa nghiệp vụ; dùng `NOT NULL DEFAULT` khi luôn tồn tại giá trị hợp lệ. Tránh dùng giá trị canh chừng (`-1`, `'N/A'`, `'1970-01-01'`) thay cho NULL — chúng lọt vào các phép `AVG`, `MIN` và làm sai số liệu một cách âm thầm, đúng kiểu bug không ai phát hiện.

## Tóm tắt bài 3

- `UNION ALL` là mặc định; `UNION` thêm bước khử trùng lặp tốn kém.
- Các nhánh khớp theo **vị trí cột**, không theo tên — nguồn bug lệch cột không báo lỗi.
- `EXCEPT` hai chiều là công cụ đối chiếu dữ liệu tốt nhất khi kiểm thử migration.
- `NULL` nghĩa là "không biết"; mọi so sánh với nó cho `UNKNOWN`, và `WHERE` loại `UNKNOWN` như `FALSE`.
- `WHERE col <> 'x'` **bỏ sót** dòng NULL — nguyên nhân khiến tổng các phân khúc không khớp tổng chung.
- `IS DISTINCT FROM` (Postgres) / `<=>` (MySQL) là cách so sánh an toàn với NULL, thiết yếu cho ETL.
- `UNIQUE` cho phép nhiều NULL; `CHECK` chấp nhận NULL — hai chi tiết hay bị hiểu sai khi thiết kế bảng.

**Bài kế tiếp** → [Phase 3 - Bài 1: Index hoạt động thế nào và cách viết query dùng được index](../phase-3/01-index-hoat-dong-the-nao-va-viet-query-dung-index.md)

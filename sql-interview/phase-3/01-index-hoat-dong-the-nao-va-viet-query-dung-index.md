# Bài 1: Index hoạt động thế nào và cách viết query dùng được index

Có một câu hỏi phỏng vấn tưởng dễ mà loại rất nhiều người: *"Bảng đã có index trên cột `email` rồi, vì sao query `WHERE LOWER(email) = 'a@shop.vn'` vẫn quét toàn bảng?"*. Ứng viên biết "index làm query nhanh hơn" nhưng không biết **điều kiện để index được dùng** sẽ đứng hình ở đây.

Bài này trả lời câu đó và toàn bộ họ câu hỏi quanh nó: index thật ra là cấu trúc gì, vì sao thứ tự cột trong composite index quan trọng, và danh sách những cách viết query khiến index bị vô hiệu hoá.

## Nền tảng: database đọc dữ liệu như thế nào

Muốn hiểu index, phải hiểu trước cái mà index đang cố tránh. Bốn khái niệm nền:

**Trang (page/block)** — Database **không đọc từng dòng**. Nó đọc theo khối cố định gọi là *trang*, mặc định 8KB ở PostgreSQL (16KB ở InnoDB). Cần đúng một dòng cũng phải đọc trọn trang chứa nó.

```text
Một trang 8KB ≈ chứa được khoảng 50-100 dòng nhỏ

Bảng 10 triệu dòng  ≈  100,000 - 200,000 trang
Muốn quét cả bảng   →  phải đọc từng ấy trang
```

**Heap (đống)** — Vùng chứa dữ liệu dòng thật của bảng trong PostgreSQL. Các dòng nằm ở đây **không theo thứ tự nào** — dòng mới được nhét vào bất kỳ chỗ trống nào. Đó là lý do tìm một dòng cụ thể mà không có index thì phải dò từ đầu.

**I/O và bộ nhớ đệm (buffer pool)** — Đọc từ đĩa chậm hơn đọc từ RAM khoảng 1000 lần. Database giữ các trang hay dùng trong RAM (*buffer pool*). Trang cần mà đã có sẵn trong RAM gọi là *cache hit*; phải lấy từ đĩa gọi là *cache miss*.

```text
Đọc 1 trang từ RAM        ~ 0.0001 ms
Đọc 1 trang từ SSD        ~ 0.1 ms       ← chậm hơn ~1,000 lần
Đọc 1 trang từ HDD        ~ 10 ms        ← chậm hơn ~100,000 lần
```

**Sequential scan (quét tuần tự)** — Đọc lần lượt mọi trang của bảng từ đầu tới cuối. Với bảng 10 triệu dòng, đó là hàng trăm nghìn lần đọc trang, để rồi có thể chỉ giữ lại vài dòng.

Toàn bộ mục đích của index gói gọn trong một câu: **giảm số trang phải đọc**. Không phải "làm database chạy nhanh hơn" một cách trừu tượng — mà là biến 200,000 lần đọc trang thành 4 lần.

Điều này cũng giải thích luôn một chuyện nghe có vẻ nghịch lý và sẽ gặp lại ở cuối bài: với **bảng rất nhỏ** (nằm gọn trong một trang), quét tuần tự chỉ tốn **1 lần đọc**, trong khi đi qua index tốn 3-4 lần. Lúc đó database cố tình **không** dùng index — và nó đúng.

## B+Tree: cấu trúc đứng sau 95% index bạn gặp

```text
                       ┌──────────────┐
        ROOT           │  50  │  100  │              ← 1 lần đọc
                       └───┬──┴───┬───┘
                ┌──────────┘      └──────────┐
        ┌───────▼──────┐              ┌──────▼───────┐
INTERNAL│ 10 │ 25 │ 40 │              │ 120 │ 160    │  ← 1 lần đọc
        └──┬─┴────┴──┬─┘              └──────────────┘
           │         │
    ┌──────▼───┐ ┌───▼──────┐
LEAF│ 10→ctid  │ │ 25→ctid  │ ...                      ← 1 lần đọc
    │ 12→ctid  │ │ 30→ctid  │
    └────┬─────┘ └────┬─────┘
         └────────────┘   ← các lá NỐI ĐÔI với nhau (đó là chữ "+" trong B+Tree)
                            → quét khoảng (BETWEEN, >, <) rất rẻ
```

Ba đặc điểm quyết định mọi thứ:

1. **Cây cân bằng, độ sâu rất thấp.** Với hệ số phân nhánh khoảng vài trăm, một cây 3-4 tầng chứa được hàng trăm triệu bản ghi. Tìm một dòng chỉ tốn 3-4 lần đọc trang thay vì quét cả bảng.
2. **Dữ liệu ở lá được sắp thứ tự và nối đôi.** Nên index không chỉ phục vụ `=` mà cả `BETWEEN`, `>`, `<`, `LIKE 'abc%'`, và cả `ORDER BY` (đọc theo thứ tự sẵn có, khỏi sort).
3. **Lá chỉ chứa con trỏ tới dòng thật** (Postgres gọi là `ctid`), không chứa toàn bộ dòng. Nên sau khi tra index thường phải nhảy về bảng đọc dữ liệu — bước này gọi là *heap fetch*, và nó là lý do index không phải lúc nào cũng thắng.

So sánh chi phí trên bảng 10 triệu dòng:

```text
Sequential Scan : đọc ~10,000,000 dòng  (~ 80,000 trang 8KB)  → hàng giây
Index Scan      : 4 lần đọc trang index + 1 heap fetch        → dưới 1 mili giây
```

## Các loại index và khi nào dùng

| Loại | Phục vụ toán tử | Tình huống điển hình |
|---|---|---|
| **B-Tree** (mặc định) | `=`, `<`, `>`, `BETWEEN`, `IN`, `LIKE 'x%'`, `ORDER BY` | 95% trường hợp |
| Hash | Chỉ `=` | Hiếm dùng; B-Tree đã bao trùm |
| GIN | `@>`, `?`, full-text, phần tử mảng | JSONB, mảng, tìm kiếm văn bản |
| GiST | Giao/chồng lấn không gian, khoảng | Dữ liệu địa lý, kiểu range |
| BRIN | Khoảng giá trị theo khối vật lý | Bảng cực lớn, dữ liệu **đã sắp tự nhiên** (log theo thời gian) |

BRIN đáng nhớ vì nó là câu trả lời gây ấn tượng cho *"bảng log 2 tỉ dòng thì index thế nào?"*: BRIN chỉ lưu min/max cho mỗi khối, nên **nhỏ hơn B-Tree hàng nghìn lần**, đổi lại chỉ hiệu quả khi dữ liệu được ghi theo thứ tự tăng dần của cột (đúng với `created_at` của bảng log).

> **Bảng này là bản tóm tắt.** Mỗi dòng trong đó là một cấu trúc riêng, có **cái giá** và **điều kiện ngầm** riêng — và điều kiện ngầm vỡ ra thì *không có dòng lỗi nào*. [Phase 10](../phase-10/01-may-chon-ho-ban-b-tree-va-hinh-dang-cau-hoi.md) dành trọn 9 bài mổ từng loại: vì sao là cây B chứ không phải cây nhị phân, hash bán thiếu món gì, vì sao PostgreSQL **không có** bitmap index, cái đêm BRIN chậm 400 lần mà không ai đụng gì, vì sao tìm "bảo hàn" ra 0 kết quả, và loại index **cố tình trả lời sai**.

### Một khác biệt cấu trúc hay bị hỏi: clustered index

```text
InnoDB (MySQL)                        PostgreSQL
──────────────────────                ─────────────────────────────
Dữ liệu dòng nằm NGAY TRONG lá        Dữ liệu nằm ở HEAP riêng
của index khoá chính                  Mọi index đều là "secondary"
  → primary key lookup: 1 bước          → index scan: tra index rồi
  → secondary index lưu giá trị PK,       fetch từ heap (2 bước)
    tra secondary rồi tra tiếp PK       → có Index Only Scan nếu
    (2 lần đi cây)                        visibility map cho phép
```

Hệ quả thực tế của InnoDB: **khoá chính nên nhỏ và tăng dần**. Dùng `UUID v4` ngẫu nhiên làm khoá chính khiến các dòng chèn rải rác khắp cây, gây tách trang (page split) và phình index — một câu hỏi thiết kế rất hay gặp. Giải pháp: `BIGINT` tự tăng, hoặc UUID v7 (có tiền tố thời gian nên tăng dần).

## Composite index và quy tắc tiền tố trái

Đây là nội dung được hỏi nhiều nhất về index.

```sql
CREATE INDEX idx_orders_cust_status_date
    ON orders (customer_id, status, ordered_at);
```

Index này sắp dữ liệu theo `customer_id` trước, cùng `customer_id` thì sắp theo `status`, cùng cả hai thì sắp theo `ordered_at` — giống hệt cách sắp danh bạ theo (họ, tên đệm, tên).

```text
Index (customer_id, status, ordered_at) — sắp theo thứ tự đó:

  (1, 'paid',      2024-04-02)
  (1, 'paid',      2024-05-18)
  (2, 'cancelled', 2024-04-25)
  (2, 'shipped',   2024-06-07)
  (3, 'pending',   2024-06-21)
```

**Quy tắc tiền tố trái (leftmost prefix)**: index chỉ dùng được nếu query cung cấp điều kiện cho các cột **từ trái sang, liên tục**.

| Query | Dùng được index? | Vì sao |
|---|---|---|
| `WHERE customer_id = 1` | **Có** (cột 1) | Tiền tố trái |
| `WHERE customer_id = 1 AND status = 'paid'` | **Có** (cột 1, 2) | Tiền tố trái |
| `WHERE customer_id = 1 AND status = 'paid' AND ordered_at > '2024-01-01'` | **Có** (cả 3) | Lý tưởng |
| `WHERE status = 'paid'` | **Không hiệu quả** | Thiếu cột đầu — như tra danh bạ khi chỉ biết tên đệm |
| `WHERE ordered_at > '2024-01-01'` | **Không hiệu quả** | Thiếu hai cột đầu |
| `WHERE customer_id = 1 AND ordered_at > '2024-01-01'` | **Một phần** | Dùng được cột 1; `ordered_at` chỉ lọc lại sau, vì cột `status` ở giữa bị bỏ trống |

Dòng cuối là chi tiết mà ứng viên giỏi nói ra được: index vẫn được dùng nhưng **chỉ tới cột đầu tiên**, phần còn lại thành filter. Postgres có thể thực hiện *skip scan* trong một số trường hợp, nhưng đừng trông cậy vào đó.

### Thứ tự cột: quy tắc bằng trước, khoảng sau

```text
Đặt cột dùng với "=" TRƯỚC, cột dùng với khoảng (>, <, BETWEEN) SAU CÙNG.
```

Vì sao? Sau khi gặp một điều kiện khoảng, dữ liệu trong index **không còn được sắp** theo các cột phía sau nữa:

```sql
-- Query: WHERE status = 'paid' AND ordered_at BETWEEN ... AND customer_id = 1

-- TỐT: hai cột bằng đứng trước, cột khoảng đứng cuối
CREATE INDEX ON orders (customer_id, status, ordered_at);
--  → nhảy thẳng tới đúng vùng (1,'paid') rồi quét liên tục theo khoảng ngày

-- KÉM: cột khoảng nằm giữa
CREATE INDEX ON orders (customer_id, ordered_at, status);
--  → sau khi lọc khoảng ngày, các dòng có status khác nhau nằm xen kẽ
--    → phải đọc thừa rồi lọc lại
```

Thứ tự phụ thuộc **query**, không phụ thuộc bảng. Đây là lý do không thể "index hết mọi cột" rồi hy vọng ổn.

Một tiêu chí phụ khi nhiều cột đều dùng `=`: đặt cột có **độ chọn lọc cao** (nhiều giá trị phân biệt) lên trước, để thu hẹp nhanh hơn.

## Covering index và index-only scan

Nếu index đã chứa **mọi cột** query cần, database không phải nhảy về bảng — đó là *index-only scan*, nhanh hơn đáng kể.

```sql
-- Query cần: customer_id (lọc) + ordered_at, total_amount (hiển thị)
SELECT ordered_at, total_amount FROM orders WHERE customer_id = 1;

-- Index thường: tra index rồi phải fetch heap để lấy total_amount
CREATE INDEX ON orders (customer_id);

-- Covering index: mọi thứ nằm sẵn trong index → Index Only Scan
CREATE INDEX ON orders (customer_id, ordered_at, total_amount);

-- Postgres: INCLUDE cho cột chỉ để "chở theo", không tham gia sắp xếp
CREATE INDEX ON orders (customer_id) INCLUDE (ordered_at, total_amount);
```

`INCLUDE` tốt hơn khi cột chỉ cần đọc chứ không cần lọc/sắp: index nhỏ hơn và cây nông hơn vì cột phụ chỉ nằm ở tầng lá.

> **Lưu ý riêng của PostgreSQL** hay được hỏi vặn: index-only scan vẫn có thể phải chạm heap để kiểm tra khả năng nhìn thấy (visibility) của dòng, nếu *visibility map* chưa đánh dấu trang đó là "toàn bộ đều thấy được". Vì thế sau khi nạp nhiều dữ liệu, chạy `VACUUM ANALYZE` mới thấy index-only scan phát huy tác dụng. Biết chi tiết này là dấu hiệu bạn từng đọc `EXPLAIN` thật.

## Cách viết query giết chết index

Đây là phần trả lời trực tiếp câu hỏi mở đầu bài. Điều kiện gọi là **SARGable** (Search-ARGument-able) khi nó cho phép database dùng index. Cột phải đứng **một mình** ở một vế, không bị bọc trong hàm hay phép tính.

| Viết SAI (không dùng index) | Viết ĐÚNG |
|---|---|
| `WHERE LOWER(email) = 'a@shop.vn'` | `WHERE email = 'a@shop.vn'`, hoặc tạo index biểu thức |
| `WHERE YEAR(ordered_at) = 2024` | `WHERE ordered_at >= '2024-01-01' AND ordered_at < '2025-01-01'` |
| `WHERE ordered_at::date = '2024-04-02'` | `WHERE ordered_at >= '2024-04-02' AND ordered_at < '2024-04-03'` |
| `WHERE total_amount * 1.1 > 1000000` | `WHERE total_amount > 1000000 / 1.1` |
| `WHERE name LIKE '%phim%'` | `LIKE 'phim%'`, hoặc index GIN + full-text |
| `WHERE CAST(customer_id AS TEXT) = '1'` | `WHERE customer_id = 1` |
| `WHERE status <> 'cancelled'` | `WHERE status IN ('pending','paid','shipped')` |
| `WHERE col1 = col2` (cùng bảng) | Index không giúp được; cân nhắc cột sinh (generated column) |

Nguyên tắc chung: **cột trần một bên, hằng số bên kia**.

Khi thật sự cần biến đổi cột, hãy tạo index cho chính biểu thức đó:

```sql
-- Index biểu thức: index chính giá trị đã biến đổi
CREATE INDEX idx_customers_email_lower ON customers (LOWER(email));
-- → giờ WHERE LOWER(email) = 'a@shop.vn' dùng được index

-- Tìm kiếm chuỗi con: cần trigram thay vì B-Tree
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);
-- → giờ WHERE name ILIKE '%phim%' dùng được index
```

### Bẫy ép kiểu ngầm — thủ phạm khó thấy nhất

```sql
-- Cột phone kiểu VARCHAR, truyền vào số
WHERE phone = 0987654321      -- MySQL ép cả CỘT sang số → index vô hiệu, và sai dữ liệu
WHERE phone = '0987654321'    -- đúng kiểu → dùng index
```

MySQL đặc biệt nguy hiểm ở đây vì nó **im lặng ép kiểu cả cột**. Đây là nguyên nhân của rất nhiều sự cố "hôm qua còn nhanh, hôm nay chậm" khi một service đổi cách truyền tham số. Cùng nhóm với nó là join giữa hai cột khác kiểu (`VARCHAR` với `INT`) — index trên cột join bị bỏ qua hoàn toàn.

### Bẫy OR

```sql
-- OR trên hai cột khác nhau thường khiến optimizer bỏ index
WHERE email = 'a@shop.vn' OR city = 'Ha Noi';

-- Viết lại thành UNION để mỗi nhánh dùng index riêng
SELECT * FROM customers WHERE email = 'a@shop.vn'
UNION
SELECT * FROM customers WHERE city  = 'Ha Noi';
```

PostgreSQL có thể xử lý bằng `BitmapOr` khi cả hai cột đều có index — nhưng nếu chỉ một cột có index thì bắt buộc phải quét toàn bảng, vì cần kiểm tra mọi dòng cho vế còn lại.

## Vì sao có index mà database vẫn không dùng

Ba nguyên nhân, đều là câu hỏi phỏng vấn:

**1. Bảng quá nhỏ.** Bảng 7 dòng nằm gọn trong một trang 8KB; đọc một trang rẻ hơn đi cây rồi fetch heap. Optimizer chọn `Seq Scan` là **đúng**, không phải lỗi.

**2. Điều kiện lọc quá rộng (độ chọn lọc thấp).** Nếu query lấy 40% số dòng, đi index rồi fetch heap từng dòng ngẫu nhiên **đắt hơn** quét tuần tự. Ngưỡng thực tế thường quanh 5-10%.

```text
Độ chọn lọc = số dòng khớp / tổng số dòng

  0.01% (1 trên 10,000)  → index thắng áp đảo
  5%                     → tuỳ, thường vẫn dùng index (hoặc bitmap scan)
  40%                    → sequential scan thắng
```

Hệ quả thiết kế: index trên cột `gender` hay `is_active` (chỉ 2-3 giá trị) hầu như vô dụng — **trừ khi** phân bố lệch hẳn (ví dụ 0.1% dòng có `status = 'error'`), lúc đó *partial index* mới là câu trả lời đúng.

**3. Thống kê lỗi thời.** Optimizer ước lượng dựa trên thống kê; sau khi nạp lượng lớn dữ liệu mà chưa `ANALYZE`, nó có thể tưởng bảng vẫn nhỏ. Cách sửa: `ANALYZE orders;`.

## Partial index và các kiểu index chuyên biệt

```sql
-- Partial index: chỉ index phần dữ liệu thật sự được truy vấn
CREATE INDEX idx_orders_pending ON orders (ordered_at) WHERE status = 'pending';
-- Bảng 50 triệu đơn nhưng chỉ ~1000 đơn pending
-- → index vài chục KB thay vì vài GB, và query dashboard "đơn chờ xử lý" cực nhanh

-- Chỉ index dòng chưa xoá mềm (soft delete) — pattern rất phổ biến
CREATE INDEX idx_customers_active ON customers (email) WHERE deleted_at IS NULL;

-- Unique có điều kiện: mỗi khách chỉ được có MỘT đơn nháp
CREATE UNIQUE INDEX ON orders (customer_id) WHERE status = 'draft';
```

Partial index là một trong những câu trả lời gây ấn tượng nhất cho *"làm sao tối ưu query trên bảng rất lớn"*, vì nó tấn công thẳng vào kích thước index thay vì chỉ sắp xếp lại cột.

## Cái giá của index

Index không miễn phí — và người phỏng vấn luôn muốn nghe vế này:

| Chi phí | Chi tiết |
|---|---|
| Ghi chậm hơn | Mỗi `INSERT`/`UPDATE`/`DELETE` phải cập nhật **mọi** index liên quan |
| Dung lượng | Index có thể chiếm bằng hoặc hơn dữ liệu gốc |
| Bộ nhớ đệm | Index chiếm chỗ trong buffer pool, đẩy dữ liệu nóng ra ngoài |
| Bảo trì | Index phình theo thời gian, cần `REINDEX` định kỳ |
| Optimizer chậm hơn | Nhiều index → nhiều phương án phải cân nhắc khi lập plan |

Quy tắc thực dụng: bảng ghi nhiều (OLTP, bảng log) nên có **ít index**; bảng đọc nhiều (báo cáo, analytics) chịu được nhiều index hơn.

Tìm index thừa để xoá:

```sql
-- Postgres: index chưa từng được dùng lần nào
SELECT schemaname, relname AS bang, indexrelname AS index_name,
       idx_scan AS so_lan_dung,
       pg_size_pretty(pg_relation_size(indexrelid)) AS kich_thuoc
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;
```

Cũng nên xoá index **trùng tiền tố**: đã có `(a, b, c)` thì `(a)` và `(a, b)` là thừa, vì index rộng hơn phục vụ được mọi tiền tố trái của nó.

Và khi tạo index trên bảng đang chạy production:

```sql
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders (customer_id);
```

`CONCURRENTLY` không khoá ghi (đổi lại chậm hơn và có thể thất bại, để lại index `INVALID` cần dọn). Không nhắc tới `CONCURRENTLY` khi được hỏi "tạo index trên bảng 100 triệu dòng đang chạy thế nào" là mất điểm nặng — vì `CREATE INDEX` thường sẽ khoá ghi cả bảng trong nhiều phút.

## Bẫy thường gặp với index

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Bọc cột trong hàm ở `WHERE` | Index vô hiệu | Viết lại SARGable, hoặc index biểu thức |
| `LIKE '%x%'` | Quét toàn bảng | Index trigram / full-text |
| So sánh khác kiểu | Ép kiểu ngầm, mất index | Thống nhất kiểu, ép tường minh |
| Index từng cột riêng lẻ thay vì composite | Mỗi index chỉ giúp một phần | Thiết kế composite theo query thật |
| Cột khoảng đặt giữa composite index | Các cột sau mất tác dụng | Bằng trước, khoảng sau |
| Index cột có 2-3 giá trị | Không được dùng, tốn chỗ | Partial index nếu phân bố lệch |
| Tạo index tràn lan "cho chắc" | Ghi chậm, tốn dung lượng | Chỉ index theo query thực tế đo được |
| `CREATE INDEX` không `CONCURRENTLY` trên production | Khoá ghi cả bảng | Luôn `CONCURRENTLY` |
| Quên `ANALYZE` sau khi nạp dữ liệu lớn | Optimizer chọn plan sai | `VACUUM ANALYZE` |

## Câu hỏi phỏng vấn hay gặp

**"Có index rồi nhưng query vẫn chậm, bạn làm gì?"**
Quy trình trả lời: (1) chạy `EXPLAIN ANALYZE` xem plan thật; (2) kiểm tra index có được dùng không, nếu không thì tìm nguyên nhân — hàm bọc cột, ép kiểu, độ chọn lọc thấp, thống kê cũ; (3) so `rows` ước lượng với `actual rows`, lệch nhiều nghĩa là thống kê sai; (4) cân nhắc composite hoặc covering index. Trình bày theo quy trình luôn được chấm cao hơn nêu một mẹo lẻ.

**"Index có làm `INSERT` chậm không?"**
Có. Mỗi index là một cây phải cập nhật thêm. Bảng 10 index thì mỗi `INSERT` là 11 thao tác ghi. Đây là lý do khi nạp hàng loạt (bulk load), người ta thường xoá index, nạp xong rồi tạo lại.

**"Nên tạo index trên cột nào?"**
Cột xuất hiện ở `WHERE`, `JOIN ... ON`, `ORDER BY`, `GROUP BY` — và có **độ chọn lọc đủ cao**. Ngược lại, đừng index cột ít giá trị phân biệt hoặc cột hầu như không dùng để lọc.

**"Index trên `(a, b)` và hai index riêng `(a)`, `(b)`, khác gì nhau?"**
Composite `(a, b)` phục vụ tốt query lọc cả hai và query chỉ lọc `a`, nhưng gần như vô dụng cho query chỉ lọc `b`. Hai index riêng có thể được kết hợp bằng bitmap scan nhưng thường chậm hơn một composite đúng thứ tự. Composite gần như luôn thắng khi query dùng cả hai cột.

**"Bảng 100 triệu dòng, query `WHERE created_at > now() - interval '1 day'` chậm, xử lý sao?"**
Nhiều lớp: index B-Tree trên `created_at`; nếu dữ liệu ghi tuần tự thì BRIN rẻ hơn nhiều; nếu chỉ truy vấn dữ liệu gần đây thì partial index; và nếu bảng còn tiếp tục lớn thì phân vùng (partition) theo thời gian để mỗi query chỉ chạm một vài phân vùng.

## Tóm tắt bài 1

- B+Tree cân bằng, độ sâu 3-4 tầng, lá nối đôi — vì thế phục vụ được cả tra chính xác, quét khoảng và `ORDER BY`.
- Composite index tuân theo **quy tắc tiền tố trái**; đặt cột `=` trước, cột khoảng sau cùng.
- Covering index (`INCLUDE`) cho phép index-only scan, bỏ được bước fetch heap.
- Index chỉ được dùng khi điều kiện **SARGable**: cột đứng trần một vế, không bọc hàm, không ép kiểu.
- Optimizer cố tình bỏ index khi bảng nhỏ, độ chọn lọc thấp, hoặc thống kê lỗi thời.
- Index tốn chi phí ghi và dung lượng; partial index là công cụ mạnh nhất cho bảng rất lớn.
- Trên production, luôn `CREATE INDEX CONCURRENTLY`.

**Bài kế tiếp** → [Bài 2: Đọc hiểu execution plan](02-doc-hieu-execution-plan.md)

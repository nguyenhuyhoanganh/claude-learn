# Bài 2: Đọc hiểu execution plan

Câu hỏi *"query này chậm, bạn debug thế nào?"* có một câu trả lời sai kinh điển: "em thêm index". Câu trả lời đúng luôn bắt đầu bằng **"em chạy `EXPLAIN ANALYZE` để xem database đang thật sự làm gì"** — vì thêm index mù quáng cũng hay vô ích như đoán mò.

Đọc được execution plan là kỹ năng phân biệt rõ nhất giữa người "viết được SQL" và người "vận hành được SQL". Bài này dạy cách đọc plan từ đầu, và quan trọng hơn: cách tìm đúng nút thắt cổ chai trong một plan dài ba mươi dòng.

## EXPLAIN và EXPLAIN ANALYZE

```sql
EXPLAIN SELECT ...;          -- chỉ ƯỚC LƯỢNG, không chạy query. An toàn tuyệt đối.
EXPLAIN ANALYZE SELECT ...;  -- CHẠY THẬT rồi báo cáo số liệu thực tế.
```

> **Cảnh báo sống còn**: `EXPLAIN ANALYZE` **thực thi** câu lệnh. Với `SELECT` thì vô hại, nhưng với `UPDATE`/`DELETE`/`INSERT` thì dữ liệu bị thay đổi thật. Muốn xem plan của câu ghi mà không đổi dữ liệu, bọc trong transaction rồi rollback:
> ```sql
> BEGIN;
> EXPLAIN ANALYZE DELETE FROM orders WHERE ordered_at < '2020-01-01';
> ROLLBACK;
> ```

Bộ tuỳ chọn nên dùng khi điều tra nghiêm túc:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT TEXT)
SELECT c.full_name, COUNT(o.order_id)
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.customer_id
GROUP BY c.customer_id, c.full_name;
```

| Tuỳ chọn | Cho biết |
|---|---|
| `ANALYZE` | Thời gian và số dòng **thực tế** |
| `BUFFERS` | Số trang đọc từ cache và từ đĩa — chỉ ra query có bị I/O bound không |
| `VERBOSE` | Danh sách cột đầu ra của từng node |
| `SETTINGS` | Các tham số cấu hình khác mặc định (hữu ích khi debug môi trường lệch nhau) |
| `FORMAT JSON` | Dạng máy đọc, dùng cho công cụ trực quan hoá |

## Cách đọc một plan

> **"Node" là gì?** Mỗi dòng bắt đầu bằng `->` trong plan là một **node** — tức một *bước xử lý* mà database sẽ làm: quét một bảng, ghép hai kết quả, sắp xếp, gom nhóm. Mỗi node nhận dữ liệu từ các node con bên dưới, xử lý, rồi đẩy kết quả lên node cha. Toàn bộ plan là một cái cây gồm những bước như vậy, và dòng trên cùng (không có `->`) là bước cuối cùng trả kết quả về cho bạn.
>
> **Mức thụt lề = quan hệ cha con.** Node thụt sâu hơn là con của node ngay phía trên nó ở mức thụt nông hơn.

Plan là một **cây**, và quy tắc đọc là: **từ trong ra ngoài, từ dưới lên trên**. Node thụt lề sâu nhất chạy trước; kết quả của nó chảy lên node cha.

```text
HashAggregate  (cost=289.12..291.62 rows=200 width=48)
                (actual time=2.145..2.198 rows=5 loops=1)
  Group Key: c.customer_id
  ->  Hash Right Join  (cost=13.50..259.12 rows=6000 width=40)
                        (actual time=0.089..1.902 rows=7 loops=1)
        Hash Cond: (o.customer_id = c.customer_id)
        ->  Seq Scan on orders o  (cost=0.00..210.00 rows=6000 width=8)
                                   (actual time=0.011..0.015 rows=5 loops=1)
        ->  Hash  (cost=11.00..11.00 rows=200 width=36)
                   (actual time=0.041..0.042 rows=5 loops=1)
              ->  Seq Scan on customers c  (cost=0.00..11.00 rows=200 width=36)
                                            (actual time=0.014..0.018 rows=5 loops=1)
Planning Time: 0.284 ms
Execution Time: 2.301 ms
```

Đọc theo thứ tự thực thi:

```text
④ HashAggregate          ← gom nhóm, trả kết quả cuối
   └─ ③ Hash Right Join   ← ghép hai bên
        ├─ ② Seq Scan orders      (probe)
        └─ ① Seq Scan customers → Hash  (build)

Thứ tự chạy: ① dựng hash từ customers → ② quét orders và tra hash → ③ ra dòng ghép → ④ gom nhóm
```

Chi tiết đáng chú ý: ta viết `LEFT JOIN` nhưng plan hiện `Hash Right Join`. Optimizer đã **đổi vai hai bảng** (đặt bảng nhỏ hơn ở phía build hash) và đổi `LEFT` thành `RIGHT` để bù lại. Kết quả không đổi. Nhìn thấy điều này mà không hoảng là dấu hiệu bạn đọc plan quen tay.

### Giải mã các con số

```text
cost=13.50..259.12   rows=6000   width=40
     ▲       ▲            ▲          ▲
     │       │            │          └─ kích thước trung bình một dòng (byte)
     │       │            └─ SỐ DÒNG ƯỚC LƯỢNG
     │       └─ chi phí tới khi trả xong dòng CUỐI
     └─ chi phí tới khi trả ra dòng ĐẦU TIÊN

actual time=0.089..1.902   rows=7   loops=1
            ▲       ▲           ▲        ▲
            │       │           │        └─ node này chạy bao nhiêu LẦN
            │       │           └─ số dòng thực tế MỖI LẦN chạy
            │       └─ mili giây tới dòng cuối
            └─ mili giây tới dòng đầu
```

Bốn điều cần nhớ về các con số này:

1. **`cost` không có đơn vị.** Nó là số tương đối do optimizer tự quy ước (mốc 1.0 = đọc tuần tự một trang). Chỉ dùng để **so sánh giữa các plan**, không phải để đoán mili giây.
2. **`actual rows` là số dòng cho mỗi lần lặp**, không phải tổng. Tổng thực tế = `rows × loops`. Đây là chỗ hiểu nhầm phổ biến nhất.
3. **Thời gian là luỹ tích.** `actual time` của node cha đã bao gồm thời gian của các node con. Muốn biết một node tốn bao nhiêu **riêng nó**, lấy thời gian của nó trừ đi thời gian các con.
4. **`cost` ở nút đầu (`13.50`) lớn** nghĩa là node phải làm xong một khối việc trước khi trả dòng đầu tiên — dấu hiệu của `Sort`, `Hash`, `HashAggregate` (các node "chặn").

## Bảng tra các loại node

### Node quét bảng

| Node | Nghĩa | Tốt hay xấu |
|---|---|---|
| `Seq Scan` | Đọc toàn bộ bảng | Tốt nếu bảng nhỏ hoặc lấy phần lớn dòng; **xấu** nếu lọc ra rất ít dòng từ bảng lớn |
| `Index Scan` | Đi cây index rồi fetch heap từng dòng | Tốt khi số dòng khớp ít |
| `Index Only Scan` | Lấy hết dữ liệu ngay trong index | **Tốt nhất** — không chạm heap |
| `Bitmap Heap Scan` | Gom trước danh sách vị trí, rồi đọc heap theo thứ tự vật lý | Tốt ở khoảng giữa: quá nhiều cho index scan, quá ít cho seq scan |
| `Tid Scan` | Truy cập trực tiếp theo `ctid` | Hiếm |

`Bitmap Heap Scan` luôn đi kèm `Bitmap Index Scan` bên dưới. Nó tồn tại để tránh việc nhảy heap ngẫu nhiên hàng nghìn lần — thay vào đó sắp lại thứ tự rồi đọc tuần tự. Thấy `Recheck Cond` kèm `Heap Blocks: exact=... lossy=...` là bình thường; `lossy` nhiều nghĩa là bitmap tràn `work_mem` và đã phải hạ độ chi tiết xuống mức trang.

### Node join

| Node | Cơ chế | Cảnh báo |
|---|---|---|
| `Nested Loop` | Với mỗi dòng ngoài, tìm trong bảng trong | Nguy hiểm khi `loops` lớn mà bảng trong không có index |
| `Hash Join` | Dựng hash bảng nhỏ, quét bảng lớn tra vào | Xem `Batches`: lớn hơn 1 nghĩa là tràn RAM, đổ ra đĩa |
| `Merge Join` | Sắp cả hai rồi chạy song song | Tốt nếu đã sẵn thứ tự; đắt nếu phải sort |
| `Hash Semi Join` | `EXISTS` / `IN` đã được viết lại | Dấu hiệu tốt |
| `Hash Anti Join` | `NOT EXISTS` / `LEFT JOIN ... IS NULL` | Dấu hiệu tốt |

### Node khác

| Node | Nghĩa | Cảnh báo |
|---|---|---|
| `Sort` | Sắp xếp | Xem `Sort Method`: `quicksort Memory` là tốt, `external merge Disk` là xấu |
| `HashAggregate` | Gom nhóm bằng hash | Tràn RAM thì đổ đĩa |
| `GroupAggregate` | Gom nhóm trên dữ liệu đã sắp | Cần `Sort` bên dưới, trừ khi đi theo index |
| `Materialize` | Lưu tạm kết quả để dùng lại | Thường vô hại |
| `Memoize` | Bộ nhớ đệm cho nested loop (PG 14+) | Dấu hiệu tốt |
| `Gather` / `Gather Merge` | Gom kết quả từ các worker song song | Xem `Workers Launched` |
| `SubPlan` | Subquery **không** decorrelate được | **Cờ đỏ** nếu `loops` lớn |
| `WindowAgg` | Window function | Luôn cần đầu vào đã sắp |
| `Limit` | Cắt số dòng | Đứng trên `Sort` thì vẫn phải sort hết |

## Sáu cờ đỏ cần tìm trong plan

Đây là checklist thực dụng khi mở một plan lạ:

```text
① Chênh lệch ƯỚC LƯỢNG vs THỰC TẾ
   rows=10 (ước lượng) ... actual rows=980,000
   → thống kê sai → plan sai từ gốc. Chạy ANALYZE. Cân nhắc tăng statistics target.

② Seq Scan trên bảng lớn kèm bộ lọc chặt
   Seq Scan on orders (actual rows=12) + Rows Removed by Filter: 4,999,988
   → thiếu index, hoặc điều kiện không SARGable.

③ Nested Loop với loops rất lớn
   -> Index Scan ... (actual time=0.02..0.03 rows=1 loops=850,000)
   → 0.03ms × 850,000 ≈ 25 giây. Mỗi lần nhanh nhưng lặp quá nhiều.

④ Sort hoặc Hash đổ ra đĩa
   Sort Method: external merge  Disk: 82,376kB
   HashAggregate ... Batches: 17  Memory Usage: 4,096kB  Disk Usage: 65,432kB
   → tăng work_mem, hoặc giảm lượng dữ liệu phải sort.

⑤ Rows Removed by Filter khổng lồ
   → database đọc rồi vứt đi phần lớn. Đẩy bộ lọc xuống index.

⑥ SubPlan với loops lớn
   → correlated subquery không decorrelate được. Viết lại thành JOIN hoặc window function.
```

Cách tìm nút thắt trong plan ba mươi dòng: **tìm node có `actual time` cuối lớn nhất mà các node con của nó đều nhỏ**. Đó là nơi thời gian thật sự bị tiêu, chứ không phải node ngoài cùng (node ngoài cùng luôn có thời gian lớn nhất vì là luỹ tích).

## Ví dụ: chẩn đoán và sửa một query chậm

Giả sử bảng `orders` đã có 5 triệu dòng và không có index trên `customer_id`:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT o.order_id, o.total_amount
FROM orders o
WHERE o.customer_id = 42 AND o.status = 'paid';
```

```text
Seq Scan on orders o  (cost=0.00..112500.00 rows=13 width=14)
                       (actual time=0.412..842.115 rows=17 loops=1)
  Filter: ((customer_id = 42) AND (status = 'paid'::text))
  Rows Removed by Filter: 4999983                       ← ② CỜ ĐỎ
  Buffers: shared hit=1024 read=61476                   ← đọc 61,476 trang từ đĩa
Planning Time: 0.121 ms
Execution Time: 842.203 ms
```

Chẩn đoán: đọc 5 triệu dòng để lấy 17 dòng. `Buffers ... read=61476` cho biết gần 480MB được đọc từ đĩa. Đây là ca sách giáo khoa của việc thiếu index.

```sql
CREATE INDEX CONCURRENTLY idx_orders_cust_status ON orders (customer_id, status);
ANALYZE orders;
```

```text
Index Scan using idx_orders_cust_status on orders o
    (cost=0.43..64.21 rows=16 width=14) (actual time=0.031..0.048 rows=17 loops=1)
  Index Cond: ((customer_id = 42) AND (status = 'paid'::text))
  Buffers: shared hit=20
Execution Time: 0.071 ms
```

Từ 842ms xuống 0.071ms — nhanh gấp khoảng **12,000 lần**. Ba điểm cần đọc ra: điều kiện đã chuyển từ `Filter` thành `Index Cond` (lọc ngay trong index thay vì đọc rồi vứt), `Buffers` giảm từ 62,500 trang xuống 20, và ước lượng `rows=16` giờ sát thực tế `17`.

Muốn tiến thêm một bước nữa — bỏ luôn bước fetch heap:

```sql
CREATE INDEX CONCURRENTLY idx_orders_cust_status_covering
    ON orders (customer_id, status) INCLUDE (order_id, total_amount);
-- → Index Only Scan, Buffers còn khoảng 4-5 trang
```

## Khi ước lượng lệch thực tế

Đây là nguyên nhân gốc của phần lớn plan xấu, và cũng là câu hỏi phỏng vấn ở tầng cao.

```text
rows=10  →  actual rows=980,000       Lệch 98,000 lần
```

Ước lượng sai kéo theo mọi quyết định sau đó sai: optimizer tưởng chỉ có 10 dòng nên chọn nested loop, thực tế 980,000 dòng nên nested loop chạy 980,000 vòng.

| Nguyên nhân | Cách xử lý |
|---|---|
| Thống kê lỗi thời | `ANALYZE bang;` — kiểm tra `last_analyze` trong `pg_stat_user_tables` |
| Cột có phân bố lệch | `ALTER TABLE ... ALTER COLUMN col SET STATISTICS 1000;` rồi `ANALYZE` |
| Nhiều cột **tương quan** với nhau (tỉnh và quận) | `CREATE STATISTICS ... (dependencies) ON col1, col2 FROM bang;` |
| Điều kiện dùng hàm optimizer không hiểu | Dùng index biểu thức, hoặc cột sinh (generated column) |
| Tham số truyền vào bị "đóng băng" plan | Postgres: xem `plan_cache_mode`; SQL Server gọi là parameter sniffing |

Ví dụ tương quan cột — vấn đề kinh điển mà rất ít người biết:

```sql
-- Optimizer mặc định giả định hai cột ĐỘC LẬP:
--   P(city='Ha Noi' AND district='Cau Giay') = P(city) × P(district)
-- Thực tế Cầu Giấy CHỈ tồn tại ở Hà Nội → ước lượng thấp hơn thực tế rất nhiều
CREATE STATISTICS stat_dia_chi (dependencies) ON city, district FROM addresses;
ANALYZE addresses;
```

## EXPLAIN trên MySQL

Cú pháp và cách đọc khác hẳn Postgres, nên nếu công ty dùng MySQL thì đây là phần bắt buộc:

```sql
EXPLAIN SELECT ...;              -- dạng bảng, chỉ ước lượng
EXPLAIN ANALYZE SELECT ...;      -- MySQL 8.0.18+, có số liệu thực tế
EXPLAIN FORMAT=JSON SELECT ...;  -- chi tiết hơn, có cost
```

Cột `type` là thứ cần nhìn đầu tiên, xếp từ tốt nhất đến tệ nhất:

```text
system > const > eq_ref > ref > range > index > ALL
   tốt nhất ────────────────────────────────► tệ nhất

const  : khớp đúng 1 dòng qua khoá chính/unique
eq_ref : join qua khoá chính/unique, mỗi dòng ngoài khớp đúng 1 dòng
ref    : dùng index không unique, khớp nhiều dòng
range  : quét khoảng trên index (BETWEEN, >, IN)
index  : quét TOÀN BỘ index (đỡ hơn ALL chút, vẫn xấu)
ALL    : quét toàn bảng ← cờ đỏ trên bảng lớn
```

Cột `Extra` chứa các cảnh báo quan trọng:

| Giá trị `Extra` | Nghĩa |
|---|---|
| `Using index` | Covering index — **tốt** (tương đương Index Only Scan) |
| `Using where` | Có lọc sau khi đọc — bình thường |
| `Using filesort` | Phải sắp xếp thêm — cân nhắc index khớp `ORDER BY` |
| `Using temporary` | Phải tạo bảng tạm (hay gặp với `GROUP BY` + `ORDER BY` khác cột) |
| `Using join buffer` | Join không index — **xấu** |

Thấy đồng thời `Using temporary; Using filesort` trên bảng lớn là dấu hiệu query cần được thiết kế lại.

## Bẫy thường gặp khi đọc plan

| Bẫy | Thực tế |
|---|---|
| So `cost` giữa hai database khác nhau | `cost` là đơn vị nội bộ, chỉ so trong cùng một hệ và cùng cấu hình |
| Đọc `actual rows` là tổng | Nó là số dòng **mỗi lần lặp**; nhân với `loops` mới ra tổng |
| Nghĩ `Seq Scan` luôn xấu | Bảng nhỏ hoặc lấy phần lớn dòng thì seq scan là lựa chọn đúng |
| Nghĩ `Nested Loop` luôn xấu | Với `loops` nhỏ và bảng trong có index, đây là plan tốt nhất |
| Chỉ nhìn node ngoài cùng | Thời gian luỹ tích; nút thắt nằm ở node con |
| `EXPLAIN` thay vì `EXPLAIN ANALYZE` | Không có `ANALYZE` thì không phát hiện được lệch ước lượng |
| Chạy `EXPLAIN ANALYZE` trên `DELETE` mà quên rollback | Mất dữ liệu thật |
| Đo trên máy dev rồi kết luận cho production | Dữ liệu, cấu hình, cache khác nhau → plan khác nhau |
| Quên yếu tố cache | Lần chạy đầu đọc đĩa, lần sau đọc RAM. Dùng `BUFFERS` để phân biệt |

## Câu hỏi phỏng vấn hay gặp

**"Query chạy 30 giây, bạn xử lý thế nào?"**
Trình bày theo quy trình: (1) `EXPLAIN (ANALYZE, BUFFERS)`; (2) tìm node tốn thời gian nhất; (3) đối chiếu ước lượng với thực tế để biết vấn đề nằm ở thống kê hay ở thiếu index; (4) kiểm tra `Rows Removed by Filter` và các node đổ đĩa; (5) sửa — thêm index, viết lại query cho SARGable, hoặc tăng `work_mem`; (6) đo lại và so sánh. Nhấn mạnh **đo trước, sửa sau**.

**"`cost=0.00..112500.00` nghĩa là gì?"**
`0.00` là chi phí tới dòng đầu tiên, `112500.00` là tới dòng cuối. Đơn vị tương đối, không phải mili giây. Nút đầu bằng 0 nghĩa là node trả dòng ngay không cần chuẩn bị (đặc trưng của `Seq Scan`).

**"Vì sao ước lượng lệch thực tế nhiều?"**
Thống kê lỗi thời, phân bố dữ liệu lệch, hoặc các cột tương quan mà optimizer giả định là độc lập. Nêu được cả ba nguyên nhân và giải pháp tương ứng (`ANALYZE`, tăng statistics target, `CREATE STATISTICS`) là câu trả lời đầy đủ nhất.

**"Thấy `Nested Loop` có nên sửa ngay không?"**
Không. Cần nhìn `loops`. `loops=5` với index scan bên trong là plan tối ưu. `loops=850,000` mới là vấn đề — và cách sửa thường là thêm index cho bảng trong, hoặc ép optimizer chọn hash join bằng cách sửa lại query/thống kê.

**"`work_mem` là gì và ảnh hưởng thế nào?"**
Là lượng RAM mỗi thao tác sort/hash được phép dùng trước khi đổ ra đĩa. Đặt quá thấp → `external merge Disk`, chậm hàng chục lần. Đặt quá cao → nhiều query đồng thời có thể làm cạn RAM máy chủ, vì giới hạn này áp cho **mỗi thao tác**, không phải mỗi phiên. Cách an toàn: đặt mức chung vừa phải rồi nâng riêng cho phiên chạy báo cáo nặng (`SET LOCAL work_mem = '256MB'`).

## Tóm tắt bài 2

- `EXPLAIN` chỉ ước lượng; `EXPLAIN (ANALYZE, BUFFERS)` mới cho số liệu thật — nhớ rollback với câu lệnh ghi.
- Đọc plan từ trong ra ngoài; thời gian là luỹ tích nên nút thắt nằm ở node con, không phải node ngoài cùng.
- `actual rows` là số dòng **mỗi lần lặp**; tổng thật = `rows × loops`.
- Sáu cờ đỏ: lệch ước lượng, seq scan trên bảng lớn, nested loop nhiều vòng, sort/hash đổ đĩa, `Rows Removed by Filter` lớn, `SubPlan` lặp nhiều.
- Lệch ước lượng thường do thống kê cũ, phân bố lệch, hoặc cột tương quan — sửa bằng `ANALYZE`, statistics target, `CREATE STATISTICS`.
- Trên MySQL, nhìn cột `type` (tránh `ALL`) và cột `Extra` (tránh `Using temporary; Using filesort`).

**Bài kế tiếp** → [Bài 3: 15 anti-pattern làm chậm query](03-muoi-lam-anti-pattern-lam-cham-query.md)

# Bài 3: Dùng AI viết SQL mà không bị nó lừa

Câu SQL này chạy hoàn hảo. Không lỗi, không cảnh báo. Nó trả về một con số đẹp đẽ.

Vấn đề là **con số đó sai — sai gấp hơn hai lần**. Và nếu bạn không biết SQL, bạn sẽ không bao giờ phát hiện ra.

Đây không phải bài viết chê AI. AI viết SQL rất tốt và bạn nên dùng nó mỗi ngày. Đây là bài về câu hỏi thật sự quan trọng: **bạn có biết khi nào nó viết đúng và khi nào nó viết sai không?**

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Fanout** | phen-ao | **Nhân dòng** — JOIN một-nhiều làm dòng bên trái bị lặp, mọi `SUM` sai theo |
| **Cardinality** | ca-đi-na-li-ti | **Lực lượng quan hệ** — một dòng bên này ứng với mấy dòng bên kia |
| **Schema** | ski-ma | **Lược đồ** — cấu trúc bảng, cột, kiểu dữ liệu, quan hệ |
| **DDL** | | Câu lệnh tạo bảng — thứ bạn dán cho AI để nó khỏi đoán |
| **Dialect** | đai-a-lếch | **Phương ngữ** — khác biệt cú pháp giữa Postgres, MySQL, SQL Server, Oracle |
| **Assumption** | a-sấm-shân | **Giả định** — thứ AI tự đặt ra mà không nói, và là nguồn lỗi số một |
| **Hallucination** | ha-lu-si-nê-shân | **Bịa** — AI tạo ra tên bảng, cột, hoặc hàm không tồn tại |
| **Execution plan** | | **Kế hoạch thực thi** — cách database định chạy câu lệnh |
| **Covering index** | | Index **chứa đủ mọi cột** query cần, khỏi phải mở bảng gốc |
| **Persisted query** | | Câu lệnh đã được duyệt và lưu sẵn, chỉ gửi mã băm |

## Cái bẫy: một ví dụ cụ thể

Dữ liệu: khách hàng tên An, có **một** đơn hàng trị giá 1.000.000đ. An hoàn tiền **hai lần** cho chính đơn đó — 200.000đ và 100.000đ.

Nhớ kỹ chi tiết này: **một đơn hàng, nhưng hai dòng hoàn tiền.**

Bạn hỏi AI: *"Tính doanh thu thực = tổng đơn hàng trừ tổng hoàn tiền."* AI trả về:

```sql
SELECT
    c.customer_id,
    c.full_name,
    sum(o.total_amount) - COALESCE(sum(r.amount), 0) AS doanh_thu_thuc
FROM customers c
JOIN orders  o ON o.customer_id = c.customer_id
LEFT JOIN refunds r ON r.order_id = o.order_id
GROUP BY c.customer_id, c.full_name;
```

Đọc qua thì cực kỳ hợp lý. Lấy tổng đơn hàng, trừ tổng hoàn tiền, ra doanh thu thực — đúng công thức luôn.

**Và đây là chỗ mọi thứ vỡ:**

```text
Sau khi JOIN, dòng đơn hàng bị NHÂN BẢN theo số dòng hoàn tiền:

 customer | order_id | total_amount | refund_amount
----------+----------+--------------+---------------
 An       |     5001 |    1.000.000 |       200.000   ← dòng 1
 An       |     5001 |    1.000.000 |       100.000   ← dòng 2 (đơn bị lặp!)

 sum(total_amount) = 1.000.000 + 1.000.000 = 2.000.000   ← CỘNG NHẦM 2 LẦN
 sum(refund)       =   200.000 +   100.000 =   300.000   ← đúng

 AI báo: 2.000.000 − 300.000 = 1.700.000
 Sự thật: 1.000.000 − 300.000 =   700.000

 LỆCH 1 TRIỆU — gấp 2,4 lần.
```

Hiện tượng này gọi là **fanout** (nhân dòng) — đã học kỹ ở phase-1 bài 3. Câu lệnh chạy chỉn chu, không một dòng lỗi. Nhưng nó sai.

### Cách viết đúng

```sql
-- Cách 1: gộp từng bên TRƯỚC khi join (rõ ràng nhất)
WITH don AS (
    SELECT customer_id, sum(total_amount) AS tong_don
    FROM orders GROUP BY 1
),
hoan AS (
    SELECT o.customer_id, sum(r.amount) AS tong_hoan
    FROM refunds r JOIN orders o USING (order_id)
    GROUP BY 1
)
SELECT c.customer_id, c.full_name,
       d.tong_don - COALESCE(h.tong_hoan, 0) AS doanh_thu_thuc
FROM customers c
JOIN      don  d USING (customer_id)
LEFT JOIN hoan h USING (customer_id);

-- Cách 2: scalar subquery tương quan (ngắn hơn, chậm hơn trên bảng lớn)
SELECT c.customer_id, c.full_name,
       sum(o.total_amount)
         - COALESCE(sum((SELECT sum(r.amount) FROM refunds r
                         WHERE r.order_id = o.order_id)), 0) AS doanh_thu_thuc
FROM customers c JOIN orders o USING (customer_id)
GROUP BY 1, 2;
```

## Vì sao AI mắc lỗi này — ba lý do

**① Nó không thấy dữ liệu của bạn.** Nó không biết rằng trong bảng của bạn, một đơn hàng có thể có nhiều dòng hoàn tiền. Đó là **thông tin về lực lượng quan hệ** (cardinality), và nó chỉ nằm trong đầu bạn.

**② Nó không chạy câu lệnh trên dữ liệu thật.** Nên nó không bao giờ thấy được con số cuối cùng là sai. Nó chỉ đưa cho bạn một câu **trông có vẻ đúng**.

**③ Nó không biết định nghĩa nghiệp vụ của riêng bạn.** Doanh thu công ty bạn có trừ đơn huỷ không? Có gồm thuế không? Có tính phí ship không? Ghi nhận theo ngày đặt hay ngày giao? AI không biết — và **bạn phải biết**, để hỏi đúng và để kiểm đúng.

## Ba prompt làm AI viết SQL chuẩn hơn hẳn

### Prompt 1 — dán schema (quan trọng nhất)

AI không nhìn thấy database của bạn. Không đưa schema thì nó **buộc phải đoán** tên bảng, tên cột, và quan hệ.

```text
❌ "Viết SQL lấy top khách hàng"
   → AI bịa ra bảng `customers`, cột `revenue`
   → Database của bạn: bảng `users`, cột `total_spend`
   → Copy về chạy, lỗi ngay. Sửa tên xong, kết quả vẫn sai.
```

```text
✅ Prompt có schema:

Tôi dùng PostgreSQL 16. Schema:

CREATE TABLE customers (
    customer_id BIGSERIAL PRIMARY KEY,
    full_name   TEXT NOT NULL,
    city        TEXT,
    created_at  TIMESTAMPTZ NOT NULL
);
CREATE TABLE orders (
    order_id     BIGSERIAL PRIMARY KEY,
    customer_id  BIGINT NOT NULL REFERENCES customers(customer_id),
    status       TEXT NOT NULL,       -- pending | paid | shipped | cancelled
    ordered_at   TIMESTAMPTZ NOT NULL,
    total_amount NUMERIC(14,2) NOT NULL
);
CREATE TABLE refunds (
    refund_id BIGSERIAL PRIMARY KEY,
    order_id  BIGINT NOT NULL REFERENCES orders(order_id),
    amount    NUMERIC(14,2) NOT NULL,
    refunded_at TIMESTAMPTZ NOT NULL
);

QUAN HỆ QUAN TRỌNG:
- Một order có thể có NHIỀU refund (hoàn tiền từng phần).
- Một customer có nhiều order.
- ordered_at là TIMESTAMPTZ lưu UTC; báo cáo cần theo giờ Asia/Ho_Chi_Minh.
- Doanh thu KHÔNG tính đơn status = 'cancelled'.

Yêu cầu: top 10 khách chi tiêu nhiều nhất năm 2026, doanh thu thực đã trừ hoàn tiền.
```

Ba dòng ở mục **QUAN HỆ QUAN TRỌNG** chính là thứ chặn được cái bẫy fanout ở đầu bài. Đó là 30 giây gõ thêm để tiết kiệm 30 phút debug.

Mẹo lấy schema nhanh:

```sql
-- PostgreSQL: xuất DDL của một bảng
\d+ orders                                   -- trong psql
pg_dump -s -t orders -t refunds mydb         -- ngoài shell

-- MySQL
SHOW CREATE TABLE orders;
```

Với database lớn, **chỉ dán những bảng liên quan** — dán cả trăm bảng sẽ làm nhiễu và AI chọn nhầm bảng.

### Prompt 2 — nêu rõ hệ và phiên bản

PostgreSQL, MySQL, SQL Server, Oracle nhìn giống nhau nhưng khác nhau ở hàng trăm chi tiết. Một câu chạy mượt trên Postgres có thể lỗi đỏ lòm trên MySQL.

| Việc | PostgreSQL | MySQL 8 | SQL Server |
|---|---|---|---|
| Lấy 10 dòng đầu | `LIMIT 10` | `LIMIT 10` | `SELECT TOP 10` |
| Nối chuỗi | `a \|\| b` | `CONCAT(a,b)` | `a + b` |
| Ngày hiện tại | `now()` | `NOW()` | `GETDATE()` |
| Cắt theo tháng | `date_trunc('month', d)` | `DATE_FORMAT(d,'%Y-%m-01')` | `DATETRUNC(month, d)` |
| Upsert | `ON CONFLICT DO UPDATE` | `ON DUPLICATE KEY UPDATE` | `MERGE` |
| Chuỗi rỗng vs NULL | Khác nhau | Khác nhau | Khác nhau |
| Oracle: chuỗi rỗng | — | — | **Oracle coi `''` là `NULL`** |

Chỉ cần thêm một dòng: *"Tôi đang dùng PostgreSQL 16"*. Năm từ, độ chính xác tăng vọt — và AI còn tận dụng được đúng tính năng mạnh của hệ đó (`FILTER`, `DISTINCT ON`, `LATERAL`, `GENERATED` cột...).

### Prompt 3 — bắt AI giải thích và nêu giả định

Đây là vũ khí ít ai dùng, và là chiếc lưới an toàn bắt lỗi **trước khi lỗi bắt bạn**.

```text
Cuối prompt, thêm:

"Giải thích từng phần của query, và nêu rõ MỌI GIẢ ĐỊNH bạn đang đặt ra
 về dữ liệu và về định nghĩa nghiệp vụ. Với mỗi JOIN, nói rõ một dòng bên
 trái có thể khớp bao nhiêu dòng bên phải."
```

Hai lợi ích:

**① AI tự soát lại logic** khi buộc phải giải thích — tỷ lệ sai giảm rõ rệt.

**② Bạn phát hiện ngay giả định sai.** Ví dụ AI viết: *"Tôi giả định `total_amount` đã trừ thuế"* — bạn đọc và biết ngay là sai, sửa từ đầu thay vì sau khi đã gửi báo cáo cho sếp.

Với lệnh ghi, thêm một câu nữa:

```text
"Query này sẽ ảnh hưởng đến những dòng nào? Viết thêm câu SELECT tương ứng
 để tôi kiểm tra trước khi chạy."
```

Một dòng prompt này đã cứu vô số database khỏi thảm hoạ xoá nhầm (xem phase-6 bài 2).

## Checklist kiểm chứng: 8 câu hỏi cho mọi SQL do AI viết

Đây là phần quan trọng nhất của bài. Prompt tốt làm giảm sai, nhưng **chỉ kiểm chứng mới bắt được sai**.

```text
① FANOUT — mỗi JOIN có nhân dòng không?
   → Đếm dòng TRƯỚC và SAU join. Nếu tăng, mọi SUM/AVG/COUNT đều sai.

② NULL — cột nào có thể NULL?
   → NOT IN với NULL trả về rỗng; LEFT JOIN + WHERE thành INNER JOIN;
     aggregate bỏ qua NULL; NULL <> 'x' không đúng.

③ MÚI GIỜ — gom nhóm theo ngày trên UTC hay giờ địa phương?
   → 7 tiếng đầu mỗi ngày bị đếm sang hôm trước (phase-5 bài 4).

④ ĐỊNH NGHĨA NGHIỆP VỤ — "doanh thu" của công ty bạn nghĩa là gì?
   → Có trừ đơn huỷ? Có gồm thuế, phí ship? Ghi nhận theo ngày đặt hay giao?

⑤ DISTINCT — có DISTINCT nào đang CHE một lỗi fanout không?
   → DISTINCT làm số dòng đúng lại nhưng SUM vẫn sai.

⑥ BIÊN KHOẢNG — BETWEEN hay >= <? Ngày cuối có bị mất không?
   → BETWEEN '...00:00' AND '...23:59:59' mất dữ liệu giây cuối.

⑦ KIỂU DỮ LIỆU — có FLOAT ở cột tiền không? Có ép kiểu ngầm không?
   → Ép kiểu ngầm giết index (phase-3 bài 1).

⑧ HIỆU NĂNG — EXPLAIN có Seq Scan trên bảng lớn không?
   → Câu đúng vẫn có thể chạy 30 giây thay vì 0,2 giây.
```

### Câu kiểm chứng fanout — luôn chạy đầu tiên

```sql
-- Trước join
SELECT count(*) FROM orders WHERE ordered_at >= '2026-01-01';   -- 128.430

-- Sau join
SELECT count(*) FROM orders o
LEFT JOIN refunds r USING (order_id)
WHERE o.ordered_at >= '2026-01-01';                              -- 141.882
--                                                                  ▲ TĂNG
-- → 13.452 dòng thừa = fanout. Mọi SUM(o.total_amount) đang sai.
```

Nhanh hơn nữa, kiểm ngay trong một câu:

```sql
SELECT
    count(*)                    AS so_dong_sau_join,
    count(DISTINCT o.order_id)  AS so_don_thuc
FROM orders o LEFT JOIN refunds r USING (order_id);
-- Hai con số khác nhau → CÓ fanout
```

### Đối chiếu với con số đã biết

```sql
-- Luôn có ít nhất một con số "neo" mà bạn biết chắc
SELECT sum(total_amount) FROM orders
WHERE status <> 'cancelled' AND ordered_at >= '2026-01-01';
-- So với tổng của báo cáo mới. Lệch = có gì đó sai.
```

## Dùng AI để tối ưu query chậm — quy trình đúng

Một câu query mất 10 giây. Đừng chỉ gửi mỗi câu SQL cho AI. **Gửi kèm ba thứ:**

```text
① Câu SQL
② Schema các bảng liên quan + danh sách INDEX hiện có
③ Kết quả EXPLAIN (ANALYZE, BUFFERS)
```

```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM orders WHERE customer_id IN (
    SELECT customer_id FROM customers WHERE tier = 'vip'
) AND ordered_at >= '2026-07-01';
```

```text
Prompt:

Query này chạy 10 giây trên PostgreSQL 16. Bảng orders có 5 triệu dòng,
customers có 210.000 dòng.

[dán schema + danh sách index]
[dán kết quả EXPLAIN ANALYZE]

Hỏi:
1. Nút thắt nằm ở node nào trong plan? Vì sao?
2. Ước lượng (rows=) có lệch nhiều so với thực tế (actual rows=) không?
   Nếu có, nguyên nhân là gì?
3. Đề xuất index cụ thể, và giải thích vì sao thứ tự cột như vậy.
4. Viết lại query nếu cần, giải thích từng thay đổi.
5. Với mỗi index đề xuất: nó làm chậm INSERT/UPDATE bao nhiêu?
```

Câu hỏi số 5 là câu phân biệt người biết dùng AI với người phụ thuộc AI. **AI có thể gợi ý, nhưng quyết định là của bạn** — mỗi index làm chậm thao tác ghi và tốn dung lượng (phase-3 bài 1).

Ví dụ điển hình: từ 10 giây xuống 0,2 giây qua ba bước, và **bạn phải hiểu từng bước**:

```text
① Bỏ SELECT * → chỉ lấy 4 cột cần                     10s → 7s
   Vì sao: bảng có 40 cột gồm cột ghi chú dài và JSON metadata.
   Và nó mở đường cho covering index ở bước ③.

② IN (subquery) → JOIN tường minh                     7s → 2s
   Vì sao: optimizer đời cũ có thể chạy lại subquery cho từng dòng.
   Postgres hiện đại tự viết lại thành semi-join, nhưng JOIN tường minh
   cho plan sạch hơn, dễ đoán hơn, dễ gắn index hơn.

③ Thêm composite index (customer_id, ordered_at)      2s → 0.2s
   Vì sao: lọc bằng, rồi lọc khoảng — đúng thứ tự "bằng trước, khoảng sau".
```

## Bốn việc AI **không** thay bạn được

**① Kiểm chứng.** Chỉ người hiểu SQL mới biết nghi ngờ, mới biết đếm số dòng trước và sau join để bắt lỗi nhân đôi.

**② Tối ưu ở tầng vật lý.** Cùng một kết quả đúng, câu này chạy 30 giây, câu kia 0,2 giây. Vì nó biết dùng index — thứ AI không thấy được trừ khi bạn đưa `EXPLAIN`.

**③ Hiểu bài toán.** Doanh thu công ty bạn có trừ đơn huỷ không? AI không biết định nghĩa của riêng bạn.

**④ Chịu trách nhiệm.** AI không ngồi trong phòng họp giải thích vì sao báo cáo lệch một tỷ.

```text
Nghĩ thế này: AI giống chế độ lái tự động.
Nó bay rất tốt trong điều kiện bình thường.
Nhưng khi gặp nhiễu động — một câu query sai một cách tinh vi —
thì chỉ cơ trưởng mới nhận ra và cầm lái lại.

Và người cơ trưởng đó là người hiểu SQL.
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** AI viết cho bạn một câu báo cáo doanh thu. Nó chạy, ra một con số đẹp. **Làm sao biết nó đúng trong 60 giây?**

**Quy trình bốn bước — chạy đúng thứ tự này mỗi lần:**

```sql
-- ═══ BƯỚC 1 (15 giây): KIỂM FANOUT — thủ phạm số 1 ═══
-- Chạy câu của AI nhưng đổi phần SELECT
SELECT count(*) AS so_dong_sau_join,
       count(DISTINCT o.order_id) AS so_don_that
FROM orders o
LEFT JOIN refunds r USING (order_id);       -- giữ nguyên MỌI JOIN của AI
```

```text
   HAI CON SỐ BẰNG NHAU  → không có fanout, đi tiếp bước 2.
   KHÁC NHAU             → CÓ FANOUT. Mọi SUM/AVG/COUNT trong câu đó ĐANG SAI.
                            Dừng lại, sửa bằng cách gộp từng bên TRƯỚC khi join.
```

```sql
-- ═══ BƯỚC 2 (15 giây): KIỂM NULL ═══
-- Cột nào trong điều kiện có thể NULL?
SELECT count(*) FILTER (WHERE status IS NULL) AS status_null,
       count(*) FILTER (WHERE total_amount IS NULL) AS tien_null
FROM orders;
-- Có NULL → xem lại: NOT IN sẽ trả rỗng, <> sẽ bỏ sót, SUM sẽ bỏ qua

-- ═══ BƯỚC 3 (15 giây): KIỂM MÚI GIỜ ═══
-- Nếu câu có gom nhóm theo ngày, so hai cách
SELECT sum(total_amount) FILTER (
         WHERE ordered_at >= '2026-08-01' AND ordered_at < '2026-08-02')
       AS theo_utc,
       sum(total_amount) FILTER (
         WHERE ordered_at >= (DATE '2026-08-01')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'
           AND ordered_at <  (DATE '2026-08-02')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
       AS theo_gio_vn
FROM orders;
-- Lệch nhau → AI đã gom nhóm trên UTC, 7 tiếng đầu mỗi ngày bị đếm sai ngày

-- ═══ BƯỚC 4 (15 giây): ĐỐI CHIẾU CON SỐ NEO ═══
-- Luôn có ít nhất một con số bạn biết chắc
SELECT sum(total_amount) FROM orders
WHERE status <> 'cancelled' AND ordered_at >= '2026-01-01';
-- So với tổng của báo cáo mới. Lệch = có gì đó sai.
```

**Đóng gói thành một script chạy được, dùng cho mọi câu AI viết:**

```python
def kiem_chung_sql(cau_lenh: str, bang_dich: str, khoa_chinh: str):
    """Chạy trước khi tin bất kỳ câu SQL nào AI viết."""
    tu_from = cau_lenh[cau_lenh.upper().index("FROM"):]
    tu_from = tu_from.split("GROUP BY")[0].split("ORDER BY")[0]

    r = db.execute(f"""
        SELECT count(*) AS sau_join,
               count(DISTINCT {bang_dich}.{khoa_chinh}) AS thuc_te
        {tu_from}
    """).fetchone()

    if r.sau_join != r.thuc_te:
        raise AssertionError(
            f"⚠ FANOUT: {r.sau_join} dòng sau join nhưng chỉ {r.thuc_te} "
            f"{bang_dich} thật. Mọi SUM/COUNT trong câu này đang SAI."
        )
```

> **Tình huống 2:** Bạn nhờ AI tối ưu một query chậm. Nó đề xuất **5 index mới**. Có nên tạo hết không?

**Không. Hỏi ngược ba câu trước — và tự đo.**

```sql
-- ① Index nào ĐANG CÓ mà KHÔNG AI DÙNG? (bỏ trước khi thêm)
SELECT s.indexrelname, s.idx_scan,
       pg_size_pretty(pg_relation_size(s.indexrelid)) AS kich_thuoc
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.relname = 'orders' AND s.idx_scan = 0
  AND NOT i.indisunique AND NOT i.indisprimary;
-- Thường có 3–5 index chưa bao giờ được quét → BỎ chúng trước

-- ② Index đề xuất có bị index sẵn có PHỦ chưa?
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'orders';
-- Index trên (a) là THỪA nếu đã có index trên (a, b)

-- ③ Bảng này ghi nhiều hay đọc nhiều?
SELECT n_tup_ins + n_tup_upd + n_tup_del AS so_lan_ghi,
       seq_scan + idx_scan                AS so_lan_doc
FROM pg_stat_user_tables WHERE relname = 'orders';
-- Ghi áp đảo → mỗi index thêm vào là một cái giá phải trả MỖI LẦN GHI
```

**Rồi đo thật tác động của index trước khi giữ nó:**

```sql
-- Thử trên bản sao, đo cả hai chiều
CREATE INDEX CONCURRENTLY idx_thu ON orders (customer_id, ordered_at);

-- Chiều ĐỌC: nhanh hơn bao nhiêu?
EXPLAIN (ANALYZE, BUFFERS) SELECT ... ;    -- trước: 420ms → sau: 3ms

-- Chiều GHI: chậm đi bao nhiêu?
\timing on
INSERT INTO orders SELECT ... FROM generate_series(1, 100000);
-- trước: 412ms → sau: 468ms  (+13%)

-- Kết luận nói được bằng SỐ:
-- "đọc nhanh hơn 140 lần, ghi chậm đi 13% — bảng này đọc nhiều nên GIỮ"
```

> **Nguyên tắc:** AI **gợi ý** được, nhưng **quyết định là của bạn** — vì bạn là người chịu tải ghi, không phải nó. Câu hỏi cuối luôn phải là *"index này làm chậm `INSERT` bao nhiêu?"*

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Không dán schema | AI bịa tên bảng/cột | Dán DDL các bảng liên quan |
| Không nói rõ quan hệ 1-nhiều | Fanout, số liệu sai gấp đôi | Ghi rõ "một order có nhiều refund" |
| Không nêu hệ và phiên bản | Cú pháp sai hệ | "Tôi dùng PostgreSQL 16" |
| Copy chạy luôn không kiểm | Con số sai mà không ai biết | Chạy checklist 8 điểm |
| Không đếm dòng trước/sau join | Bỏ lọt fanout | `count(*)` vs `count(DISTINCT khoá)` |
| Tin `DISTINCT` đã sửa lỗi | Số dòng đúng nhưng `SUM` vẫn sai | Gộp trước khi join |
| Không đưa `EXPLAIN` khi hỏi tối ưu | AI đoán mò | Luôn gửi kèm plan + index |
| Nhận đề xuất index không hỏi cái giá | Bảng ghi nhiều bị chậm đi | Hỏi tác động lên `INSERT` |
| Dán cả trăm bảng vào prompt | AI nhiễu, chọn nhầm bảng | Chỉ bảng liên quan |
| Để AI viết lệnh `UPDATE`/`DELETE` rồi chạy thẳng | Xoá nhầm dữ liệu | Bắt viết `SELECT` kiểm tra trước |
| Không có con số "neo" để đối chiếu | Không biết sai bao nhiêu | Luôn có một tổng đã biết chắc |

## Câu hỏi phỏng vấn hay gặp

**H: AI viết SQL được rồi, học SQL để làm gì?**
Thứ trở nên thừa là **học vẹt cú pháp**, không phải kỹ năng SQL. AI viết nhanh hơn em, nhưng nó không thấy dữ liệu của em, không chạy trên dữ liệu thật, và không biết định nghĩa nghiệp vụ của công ty em. Nó chỉ đưa ra câu **trông có vẻ đúng**. Ví dụ kinh điển: join đơn hàng với hoàn tiền khi một đơn có nhiều dòng hoàn — câu lệnh chạy chỉn chu mà con số sai gấp 2,4 lần vì fanout. Người không biết SQL sẽ không bao giờ phát hiện ra.

**H: Bạn kiểm chứng SQL do AI viết thế nào?**
Em có checklist. Đầu tiên là **fanout** — so `count(*)` với `count(DISTINCT khoá_chính)` sau join, khác nhau là mọi `SUM` đều sai. Rồi tới `NULL` (`NOT IN` với `NULL` trả rỗng, `LEFT JOIN` + `WHERE` thành `INNER JOIN`), múi giờ khi gom nhóm theo ngày, biên khoảng ngày, `DISTINCT` có đang che lỗi không, kiểu dữ liệu tiền, và cuối cùng là `EXPLAIN`. Và em luôn có một con số "neo" đã biết chắc để đối chiếu.

**H: Prompt thế nào để AI viết SQL chuẩn?**
Ba thứ. Một: dán **schema** — DDL các bảng liên quan, và quan trọng nhất là ghi rõ **quan hệ một-nhiều**, vì đó là thứ chặn fanout. Hai: nêu rõ **hệ và phiên bản**, vì cú pháp khác nhau ở hàng trăm chi tiết. Ba: bắt AI **giải thích và nêu giả định** — nó tự soát lại logic nên sai ít hơn, và em phát hiện ngay giả định sai trước khi gửi báo cáo đi.

**H: Dùng AI tối ưu query chậm thế nào?**
Đừng chỉ gửi câu SQL. Gửi kèm schema, danh sách index hiện có, và kết quả `EXPLAIN (ANALYZE, BUFFERS)`. Rồi hỏi cụ thể: nút thắt ở node nào, ước lượng có lệch thực tế không và vì sao, đề xuất index kèm giải thích thứ tự cột, và **index đó làm chậm `INSERT` bao nhiêu**. Câu cuối là câu quan trọng — AI gợi ý được, nhưng quyết định thêm index là của em vì em là người chịu tải ghi.

## Tóm tắt bài 3

- AI viết SQL **chạy được** không có nghĩa là **đúng** — ví dụ kinh điển là fanout khi một đơn có nhiều dòng hoàn tiền, lệch 2,4 lần mà không một dòng lỗi.
- Ba lý do AI sai: **không thấy dữ liệu**, **không chạy trên dữ liệu thật**, **không biết định nghĩa nghiệp vụ** của bạn.
- Ba prompt: dán **schema kèm quan hệ một-nhiều**, nêu **hệ và phiên bản**, bắt **giải thích và nêu giả định**.
- Checklist 8 điểm kiểm chứng: **fanout**, `NULL`, múi giờ, định nghĩa nghiệp vụ, `DISTINCT` che lỗi, biên khoảng, kiểu dữ liệu, `EXPLAIN`.
- Kiểm fanout nhanh nhất: so `count(*)` với `count(DISTINCT khoá_chính)` sau join.
- Tối ưu bằng AI: gửi **schema + index + `EXPLAIN ANALYZE`**, và luôn hỏi **cái giá của index đề xuất**.
- AI là chế độ lái tự động; **cơ trưởng vẫn là người hiểu SQL** — và người chịu trách nhiệm cho con số cuối cùng.

**Bài kế tiếp** → [Bài 4: Case đặt chỗ — trạng thái giữ và bẫy cron job](04-case-dat-cho-trang-thai-giu-va-bay-cron-job.md)

# Bài 1: Case báo cáo doanh thu, cohort và retention

Từ đây trở đi là phần thực chiến: những bài toán bạn sẽ được giao trong tuần đầu đi làm, và cũng là những bài mà người phỏng vấn dùng cho vòng "live coding" hoặc bài tập về nhà.

Điểm chung của chúng: đề bài nghe rất ngắn (*"làm cho tôi báo cáo retention"*), nhưng lời giải đòi hỏi ghép nhiều kỹ thuật đã học — window function, CTE, self join, xử lý NULL, lấp lỗ hổng ngày. Đó chính là lý do chúng phân loại ứng viên tốt.

## Case 1: Báo cáo doanh thu theo tháng, có tăng trưởng

Đề bài thường gặp: *"Doanh thu từng tháng, so với tháng trước tăng/giảm bao nhiêu phần trăm, và luỹ kế từ đầu năm."*

```sql
WITH doanh_thu_thang AS (
    SELECT date_trunc('month', o.ordered_at)::date AS thang,
           SUM(o.total_amount)                     AS doanh_thu,
           COUNT(*)                                AS so_don,
           COUNT(DISTINCT o.customer_id)           AS so_khach
    FROM orders AS o
    WHERE o.status <> 'cancelled'          -- LUÔN hỏi lại: đơn huỷ/hoàn có tính không?
    GROUP BY 1
)
SELECT thang,
       doanh_thu,
       so_don,
       ROUND(doanh_thu / so_don)                                AS gia_tri_don_tb,
       LAG(doanh_thu) OVER (ORDER BY thang)                     AS thang_truoc,
       ROUND(100.0 * (doanh_thu - LAG(doanh_thu) OVER (ORDER BY thang))
             / NULLIF(LAG(doanh_thu) OVER (ORDER BY thang), 0), 1) AS tang_truong_pct,
       SUM(doanh_thu) OVER (ORDER BY thang ROWS UNBOUNDED PRECEDING) AS luy_ke
FROM doanh_thu_thang
ORDER BY thang;
```

```text
   thang    | doanh_thu | so_don | gia_tri_don_tb | thang_truoc | tang_truong_pct | luy_ke
------------+-----------+--------+----------------+-------------+-----------------+---------
 2024-04-01 |   1850000 |      1 |        1850000 |      [NULL] |          [NULL] | 1850000
 2024-05-01 |   5400000 |      1 |        5400000 |     1850000 |           191.9 | 7250000
 2024-06-01 |   2750000 |      2 |        1375000 |     5400000 |           -49.1 |10000000
```

Bốn chi tiết ăn điểm trong query này:

1. **`WHERE status <> 'cancelled'`** — và quan trọng hơn, **nói ra rằng bạn đã hỏi lại** về đơn huỷ, đơn hoàn, đơn thử nghiệm nội bộ.
2. **`NULLIF(..., 0)`** chống chia cho 0 khi tháng trước không có doanh thu.
3. **`ROWS UNBOUNDED PRECEDING`** viết tường minh thay vì để mặc định `RANGE` — tránh bẫy đã học ở [phase-1 bài 5](../phase-1/05-window-function-tu-a-den-z.md).
4. **`COUNT(DISTINCT customer_id)`** tách biệt "số đơn" với "số khách" — hai chỉ số hay bị nhầm lẫn trong báo cáo.

### Biến thể: so cùng kỳ năm trước (YoY)

```sql
SELECT thang,
       doanh_thu,
       LAG(doanh_thu, 12) OVER (ORDER BY thang) AS cung_ky_nam_truoc,
       ROUND(100.0 * (doanh_thu - LAG(doanh_thu, 12) OVER (ORDER BY thang))
             / NULLIF(LAG(doanh_thu, 12) OVER (ORDER BY thang), 0), 1) AS yoy_pct
FROM doanh_thu_thang;
```

**Bẫy quan trọng**: `LAG(x, 12)` lùi **12 dòng**, không phải 12 tháng. Nếu có tháng nào không có đơn nào (thiếu dòng), phép so sánh lệch hoàn toàn. Đây là lý do bước lấp lỗ hổng ngày/tháng bên dưới không phải chuyện làm cho đẹp — nó là điều kiện đúng đắn.

### Lấp lỗ hổng: những ngày không có đơn

```sql
WITH chuoi_ngay AS (
    SELECT generate_series('2024-04-01'::date, '2024-06-30'::date, '1 day')::date AS ngay
    -- MySQL không có generate_series → dùng recursive CTE (phase-2 bài 2)
)
SELECT d.ngay,
       COALESCE(SUM(o.total_amount), 0) AS doanh_thu,
       COUNT(o.order_id)                AS so_don,
       ROUND(AVG(COALESCE(SUM(o.total_amount), 0))
             OVER (ORDER BY d.ngay ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)) AS ma7
FROM chuoi_ngay AS d
LEFT JOIN orders AS o
       ON o.ordered_at::date = d.ngay
      AND o.status <> 'cancelled'        -- điều kiện bảng phải → đặt ở ON, không ở WHERE
GROUP BY d.ngay
ORDER BY d.ngay;
```

Hai điểm đúng-sai then chốt:

- `o.status <> 'cancelled'` nằm trong `ON`. Đẩy xuống `WHERE` sẽ xoá sạch những ngày không có đơn — đúng thứ ta vừa bỏ công tạo ra.
- Trung bình trượt 7 ngày (`ma7`) chỉ đúng khi **mọi ngày đều có dòng**. Thiếu ngày thì "7 dòng gần nhất" không còn là "7 ngày gần nhất".

> Đây là bug rất hay gặp trên dashboard thật: biểu đồ trông bình thường, nhưng đường trung bình trượt sai vì các ngày trống bị bỏ qua thay vì tính là 0.

## Case 2: Cohort retention

Đề bài: *"Khách đăng ký tháng nào thì tháng thứ 1, 2, 3 sau đó còn bao nhiêu phần trăm quay lại mua?"* Đây là bài toán phân tích được hỏi nhiều nhất ở vị trí data analyst.

> **"Cohort" và "retention" nghĩa là gì?**
>
> **Cohort** (nhóm đồng hành) là một nhóm người dùng có **chung mốc bắt đầu**. Ví dụ "cohort tháng 4/2024" = tất cả khách có đơn hàng đầu tiên trong tháng 4/2024. Họ được xếp cùng nhóm vì bước vào hệ thống cùng thời điểm.
>
> **Retention** (tỉ lệ giữ chân) là phần trăm người của cohort đó **còn quay lại** sau N kỳ.
>
> Vì sao phải chia cohort thay vì nhìn tổng số khách hoạt động mỗi tháng? Vì con số tổng trộn lẫn khách cũ và khách mới, nên nó che mất câu hỏi thật sự quan trọng: *"khách mới có ở lại với chúng ta không, và tình hình đang tốt lên hay xấu đi?"*
>
> ```text
> Cách nhìn TỔNG (che giấu vấn đề)      Cách nhìn COHORT (nhìn rõ)
> ─────────────────────────────         ──────────────────────────────────
> T4: 100 khách hoạt động                Cohort T4: tháng sau còn 40% ┐
> T5: 105 khách hoạt động                Cohort T5: tháng sau còn 30% ├ đang XẤU ĐI
> T6: 110 khách hoạt động                Cohort T6: tháng sau còn 20% ┘
>   → trông như đang tăng trưởng          → thật ra đang mất khách nhanh dần,
>                                           chỉ nhờ đổ tiền quảng cáo kéo khách mới
>                                           vào bù mà tổng số vẫn tăng
> ```
>
> Đây chính là lý do phân tích cohort được hỏi nhiều: nó là công cụ phát hiện vấn đề mà số liệu tổng luôn giấu đi.

Ý tưởng chia làm ba bước:

```text
Bước 1 — Gán mỗi khách vào một COHORT (nhóm theo tháng mua ĐẦU TIÊN)
Bước 2 — Với mỗi lần mua, tính KHOẢNG CÁCH tháng so với cohort
Bước 3 — Đếm số khách duy nhất theo (cohort × khoảng cách), chia cho cỡ cohort
```

```sql
WITH lan_dau AS (
    SELECT customer_id,
           date_trunc('month', MIN(ordered_at))::date AS thang_cohort
    FROM orders
    WHERE status <> 'cancelled'
    GROUP BY customer_id
),
hoat_dong AS (
    SELECT f.thang_cohort,
           f.customer_id,
           (EXTRACT(YEAR  FROM o.ordered_at) - EXTRACT(YEAR  FROM f.thang_cohort)) * 12
         + (EXTRACT(MONTH FROM o.ordered_at) - EXTRACT(MONTH FROM f.thang_cohort)) AS thang_thu
    FROM orders   AS o
    JOIN lan_dau  AS f ON f.customer_id = o.customer_id
    WHERE o.status <> 'cancelled'
),
co_cohort AS (
    SELECT thang_cohort, COUNT(DISTINCT customer_id) AS co_ban_dau
    FROM lan_dau GROUP BY thang_cohort
)
SELECT h.thang_cohort,
       c.co_ban_dau,
       h.thang_thu,
       COUNT(DISTINCT h.customer_id)                                          AS con_lai,
       ROUND(100.0 * COUNT(DISTINCT h.customer_id) / c.co_ban_dau, 1)         AS ti_le_pct
FROM hoat_dong AS h
JOIN co_cohort AS c ON c.thang_cohort = h.thang_cohort
GROUP BY h.thang_cohort, c.co_ban_dau, h.thang_thu
ORDER BY h.thang_cohort, h.thang_thu;
```

```text
 thang_cohort | co_ban_dau | thang_thu | con_lai | ti_le_pct
--------------+------------+-----------+---------+-----------
 2024-04-01   |          1 |         0 |       1 |     100.0
 2024-04-01   |          1 |         1 |       1 |     100.0
 2024-06-01   |          2 |         0 |       2 |     100.0
```

**Vì sao tính `thang_thu` bằng công thức năm × 12 + tháng** thay vì trừ ngày rồi chia 30? Vì các tháng có số ngày khác nhau — chia cho 30 sẽ khiến một số khách rơi nhầm sang tháng bên cạnh. Chi tiết này rất hay được hỏi vặn.

Muốn xoay thành bảng tam giác quen thuộc trên dashboard, dùng conditional aggregation:

```sql
SELECT thang_cohort,
       co_ban_dau,
       ROUND(100.0 * COUNT(DISTINCT customer_id) FILTER (WHERE thang_thu = 1) / co_ban_dau, 1) AS m1,
       ROUND(100.0 * COUNT(DISTINCT customer_id) FILTER (WHERE thang_thu = 2) / co_ban_dau, 1) AS m2,
       ROUND(100.0 * COUNT(DISTINCT customer_id) FILTER (WHERE thang_thu = 3) / co_ban_dau, 1) AS m3
FROM hoat_dong JOIN co_cohort USING (thang_cohort)
GROUP BY thang_cohort, co_ban_dau
ORDER BY thang_cohort;
```

**Cảnh báo nghiệp vụ nên nêu ra**: cohort của tháng gần nhất luôn trông tệ hơn thực tế vì chưa đủ thời gian quan sát. Báo cáo phải làm mờ hoặc loại các ô chưa "chín". Nói được điều này cho thấy bạn hiểu số liệu chứ không chỉ viết được query.

## Case 3: Phân tích phễu (funnel)

Đề bài: *"Trong số đơn được tạo, bao nhiêu phần trăm được thanh toán, bao nhiêu phần trăm được giao?"*

```sql
SELECT date_trunc('month', ordered_at)::date AS thang,
       COUNT(*)                                                 AS da_tao,
       COUNT(*) FILTER (WHERE status IN ('paid','shipped'))      AS da_thanh_toan,
       COUNT(*) FILTER (WHERE status = 'shipped')                AS da_giao,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('paid','shipped')) / COUNT(*), 1) AS tt_pct,
       ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'shipped')
             / NULLIF(COUNT(*) FILTER (WHERE status IN ('paid','shipped')), 0), 1)       AS giao_pct
FROM orders
GROUP BY 1
ORDER BY 1;
```

Điểm cần cẩn thận: **mỗi bước phễu phải bao gồm các trạng thái sau nó**. Đơn `shipped` đương nhiên đã thanh toán, nên `COUNT(*) FILTER (WHERE status = 'paid')` một mình sẽ đếm thiếu. Đây là lỗi logic hay gặp và người phỏng vấn thường cố tình gài.

Với phễu dựa trên bảng sự kiện (`events`), khuôn thay đổi — phải kiểm tra **thứ tự thời gian**, không chỉ sự tồn tại:

```sql
WITH moc AS (
    SELECT user_id,
           MIN(created_at) FILTER (WHERE event = 'view_product') AS xem,
           MIN(created_at) FILTER (WHERE event = 'add_to_cart')  AS them_gio,
           MIN(created_at) FILTER (WHERE event = 'checkout')     AS thanh_toan
    FROM events
    GROUP BY user_id
)
SELECT COUNT(*)                                              AS da_xem,
       COUNT(*) FILTER (WHERE them_gio  > xem)               AS da_them_gio,
       COUNT(*) FILTER (WHERE thanh_toan > them_gio)         AS da_thanh_toan
FROM moc
WHERE xem IS NOT NULL;
```

Điều kiện `them_gio > xem` loại bỏ trường hợp người dùng thêm vào giỏ trong một phiên trước rồi mới xem sản phẩm — nếu chỉ kiểm tra "có sự kiện" thì phễu bị thổi phồng.

## Case 4: Gaps and islands — chuỗi ngày liên tiếp

Đề bài kinh điển: *"Tìm chuỗi ngày mua hàng liên tiếp dài nhất của mỗi khách."* Bài này nổi tiếng vì mẹo giải rất đẹp và ứng viên biết nó luôn gây ấn tượng.

**Mẹo**: nếu các ngày liên tiếp, thì `ngày - số_thứ_tự_của_ngày` là một **hằng số**. Hằng số đó chính là "mã đảo".

```text
ngay        row_number   ngay - row_number
2024-04-01      1          2024-03-31  ┐
2024-04-02      2          2024-03-31  ├─ cùng ĐẢO (chuỗi liên tiếp 3 ngày)
2024-04-03      3          2024-03-31  ┘
2024-04-07      4          2024-04-03  ┐
2024-04-08      5          2024-04-03  ┘─ đảo khác (chuỗi 2 ngày)
```

```sql
WITH ngay_mua AS (
    SELECT DISTINCT customer_id, ordered_at::date AS ngay
    FROM orders WHERE status <> 'cancelled'
),
danh_dau AS (
    SELECT customer_id, ngay,
           ngay - (ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY ngay))::int AS ma_dao
    FROM ngay_mua
)
SELECT customer_id,
       MIN(ngay)        AS bat_dau,
       MAX(ngay)        AS ket_thuc,
       COUNT(*)         AS so_ngay_lien_tiep
FROM danh_dau
GROUP BY customer_id, ma_dao
ORDER BY so_ngay_lien_tiep DESC;
```

Cùng một khuôn giải được cả loạt bài thực tế:

| Bài toán | Cách áp dụng |
|---|---|
| Chuỗi đăng nhập liên tiếp (streak) | Y hệt, thay `orders` bằng bảng đăng nhập |
| Khoảng thời gian máy chủ liên tục lỗi | Đảo theo mốc phút thay vì ngày |
| Gộp các khoảng thời gian chồng lấn | Dùng `MAX(ket_thuc) OVER (...)` để phát hiện điểm bắt đầu đảo mới |
| Tìm ngày **thiếu** trong chuỗi | So chuỗi ngày đầy đủ với dữ liệu, lấy phần chênh |

`DISTINCT` ở CTE đầu là bắt buộc: hai đơn cùng ngày sẽ làm `ROW_NUMBER` nhảy hai bước và phá vỡ mã đảo.

## Case 5: Sessionization — chia sự kiện thành phiên

Đề bài: *"Gom các sự kiện của người dùng thành phiên, cách nhau quá 30 phút thì tính là phiên mới."*

```sql
WITH co_khoang_cach AS (
    SELECT user_id,
           created_at,
           created_at - LAG(created_at) OVER (PARTITION BY user_id ORDER BY created_at) AS cach_lan_truoc
    FROM events
),
danh_dau_phien AS (
    SELECT user_id,
           created_at,
           SUM(CASE WHEN cach_lan_truoc > INTERVAL '30 minutes' OR cach_lan_truoc IS NULL
                    THEN 1 ELSE 0 END)
               OVER (PARTITION BY user_id ORDER BY created_at ROWS UNBOUNDED PRECEDING) AS so_phien
    FROM co_khoang_cach
)
SELECT user_id,
       so_phien,
       MIN(created_at)                    AS bat_dau,
       MAX(created_at)                    AS ket_thuc,
       MAX(created_at) - MIN(created_at)  AS thoi_luong,
       COUNT(*)                           AS so_su_kien
FROM danh_dau_phien
GROUP BY user_id, so_phien;
```

Kỹ thuật cốt lõi: **tổng luỹ kế của cờ 0/1 tạo ra số hiệu nhóm**. Mỗi lần gặp khoảng cách lớn, cờ bằng 1 làm tổng tăng lên một bậc, mở ra một phiên mới. Đây là mẫu tái sử dụng được cho mọi bài "chia chuỗi thành đoạn theo điều kiện".

## Case 6: Phân khúc RFM

Đề bài: *"Chia khách thành nhóm theo mức độ gần đây, tần suất và giá trị chi tiêu."* Đây là bài tổng hợp hay được dùng làm bài tập về nhà.

```sql
WITH rfm AS (
    SELECT customer_id,
           CURRENT_DATE - MAX(ordered_at)::date AS so_ngay_tu_lan_cuoi,   -- Recency
           COUNT(*)                             AS tan_suat,               -- Frequency
           SUM(total_amount)                    AS gia_tri                 -- Monetary
    FROM orders
    WHERE status <> 'cancelled'
    GROUP BY customer_id
),
diem AS (
    SELECT customer_id, so_ngay_tu_lan_cuoi, tan_suat, gia_tri,
           NTILE(5) OVER (ORDER BY so_ngay_tu_lan_cuoi DESC) AS r,   -- càng gần đây điểm càng cao
           NTILE(5) OVER (ORDER BY tan_suat ASC)             AS f,
           NTILE(5) OVER (ORDER BY gia_tri  ASC)             AS m
    FROM rfm
)
SELECT customer_id, r, f, m,
       CASE WHEN r >= 4 AND f >= 4 THEN 'khach VIP'
            WHEN r >= 4 AND f <  4 THEN 'khach moi tiem nang'
            WHEN r <= 2 AND f >= 4 THEN 'nguy co roi bo'
            WHEN r <= 2 AND f <= 2 THEN 'da roi bo'
            ELSE 'trung binh' END AS phan_khuc
FROM diem
ORDER BY m DESC, f DESC;
```

Lưu ý về `NTILE`: nó chia thành các nhóm **đều nhau về số lượng**, nên khi dữ liệu có nhiều giá trị trùng, hai khách cùng chỉ số có thể rơi vào hai nhóm khác nhau. Nếu cần ranh giới ổn định, dùng `PERCENT_RANK` hoặc ngưỡng cố định do nghiệp vụ quy định. Nêu được hạn chế này là điểm cộng.

## Case 7: Top N kèm nhóm "khác"

Đề bài thực tế cho biểu đồ tròn: *"Top 3 danh mục theo doanh thu, phần còn lại gộp thành 'Khác'."*

```sql
WITH theo_danh_muc AS (
    SELECT p.category,
           SUM(oi.quantity * oi.unit_price) AS doanh_thu
    FROM order_items oi
    JOIN products p ON p.product_id = oi.product_id
    GROUP BY p.category
),
xep_hang AS (
    SELECT category, doanh_thu,
           ROW_NUMBER() OVER (ORDER BY doanh_thu DESC) AS hang
    FROM theo_danh_muc
)
SELECT CASE WHEN hang <= 3 THEN category ELSE 'Khac' END AS nhom,
       SUM(doanh_thu)                                     AS doanh_thu
FROM xep_hang
GROUP BY 1
ORDER BY doanh_thu DESC;
```

Khuôn này giữ được **tổng doanh thu không đổi** — điều mà cách làm ngây thơ (`LIMIT 3`) không đảm bảo, và là chỗ báo cáo hay bị kế toán bắt lỗi.

## Bẫy thường gặp khi làm báo cáo

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên loại đơn huỷ/hoàn tiền | Doanh thu cao hơn sổ sách | Hỏi rõ định nghĩa "doanh thu" trước khi viết |
| Join xuống bảng chi tiết rồi `SUM` cột tổng | Nhân dòng, số bị thổi | Gom trước, join sau |
| Ngày không có đơn bị mất dòng | Trung bình trượt sai, `LAG` lệch kỳ | Sinh chuỗi ngày rồi `LEFT JOIN` |
| Điều kiện bảng phải đặt ở `WHERE` sau `LEFT JOIN` | Xoá mất các ngày trống vừa tạo | Đưa vào `ON` |
| Nhầm múi giờ | Doanh thu lệch sang ngày hôm trước | Đổi về múi giờ nghiệp vụ: `ordered_at AT TIME ZONE 'Asia/Ho_Chi_Minh'` |
| Cohort tháng gần nhất chưa đủ thời gian quan sát | Kết luận sai là retention đang giảm | Loại hoặc làm mờ ô chưa chín |
| Bước phễu không bao gồm trạng thái sau | Tỉ lệ chuyển đổi thấp giả tạo | Mỗi bước gồm cả các trạng thái tiếp theo |
| `LAG(x, 12)` khi dữ liệu thiếu tháng | So sai kỳ | Lấp đủ chuỗi tháng trước khi dùng `LAG` |
| Dùng `AVG` khi phân phối lệch | Bị vài giá trị cực đoan kéo | Thêm trung vị `PERCENTILE_CONT(0.5)` |

Bẫy múi giờ đáng nói thêm: nếu `ordered_at` lưu ở UTC mà báo cáo tính theo giờ Việt Nam, mọi đơn từ 00:00 đến 07:00 giờ Việt Nam sẽ bị xếp vào **ngày hôm trước**. Doanh thu ngày lệch khoảng 20-30% mà nhìn qua vẫn thấy "hợp lý" — đúng kiểu bug sống sót nhiều tháng.

```sql
-- Chuẩn hoá về múi giờ nghiệp vụ trước khi cắt theo ngày
SELECT date_trunc('day', ordered_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS ngay,
       SUM(total_amount)
FROM orders GROUP BY 1;
```

## Câu hỏi phỏng vấn hay gặp

**"Định nghĩa doanh thu của bạn là gì?"**
Câu hỏi bẫy có chủ đích. Trả lời tốt là hỏi ngược lại: tính theo thời điểm đặt đơn hay thời điểm thanh toán? Đơn hoàn tiền trừ vào tháng bán hay tháng hoàn? Có gồm phí vận chuyển và thuế không? Đơn nội bộ/test có loại không? Người phỏng vấn muốn thấy bạn biết rằng "doanh thu" không phải một khái niệm duy nhất.

**"Tính retention thế nào?"**
Nêu ba bước: gán cohort theo lần hoạt động đầu, tính khoảng cách kỳ, đếm số người dùng duy nhất theo (cohort × kỳ) chia cỡ cohort. Thêm cảnh báo về cohort chưa chín và về việc chọn mốc cohort (ngày đăng ký hay ngày mua đầu tiên — hai định nghĩa cho hai kết quả khác nhau).

**"Tìm chuỗi ngày hoạt động liên tiếp dài nhất?"**
Mẹo gaps and islands: `ngay - ROW_NUMBER()` là hằng số trong mỗi chuỗi liên tiếp, gom nhóm theo hằng số đó. Nhớ `DISTINCT` ngày trước khi đánh số.

**"Báo cáo của bạn không khớp với báo cáo của team khác, xử lý thế nào?"**
Câu hỏi tình huống, kiểm tra tư duy hệ thống. Trả lời theo quy trình: đối chiếu định nghĩa chỉ số trước (thường lệch ở đây), rồi đến phạm vi thời gian và múi giờ, rồi bộ lọc trạng thái, cuối cùng mới soi query tìm fanout. Dùng `EXCEPT` để tìm chính xác những bản ghi lệch giữa hai kết quả.

## Tóm tắt bài 1

- Báo cáo doanh thu luôn bắt đầu bằng việc **hỏi rõ định nghĩa**: đơn huỷ, đơn hoàn, phí, thuế, múi giờ.
- Lấp lỗ hổng ngày bằng chuỗi ngày sinh sẵn + `LEFT JOIN`, điều kiện bảng phải đặt ở `ON`.
- Cohort retention = gán cohort theo hoạt động đầu tiên + tính khoảng cách kỳ + đếm người dùng duy nhất.
- Gaps and islands giải bằng mẹo `ngay - ROW_NUMBER()` cho ra hằng số trong mỗi chuỗi.
- Sessionization dùng tổng luỹ kế của cờ 0/1 để sinh số hiệu nhóm.
- Múi giờ là nguồn sai lệch âm thầm và phổ biến nhất trong báo cáo theo ngày.

**Bài kế tiếp** → [Bài 2: Case dữ liệu trùng lặp, dedup và upsert](02-case-du-lieu-trung-lap-dedup-va-upsert.md)

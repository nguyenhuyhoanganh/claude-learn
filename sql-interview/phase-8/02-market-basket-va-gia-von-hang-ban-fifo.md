# Bài 2: Market basket và giá vốn hàng bán FIFO

Hai bài toán, hai câu chuyện, cùng một kết luận: **SQL không chỉ để lấy dữ liệu ra — nó là công cụ phân tích.**

Bài toán một: cứ mỗi tối thứ Sáu, có một ông bố tạt vào siêu thị mua bỉm cho con rồi vác thêm nguyên một thùng bia về nhà. Bạn nghĩ đó là trùng hợp? Hàng nghìn ông bố khác cũng làm y hệt. Và siêu thị **biết trước điều đó** — họ cố tình xếp bia ngay cạnh kệ bỉm.

Bài toán hai: cuối tháng, kế toán mở báo cáo lãi lỗ và tái mặt. Hệ thống báo lãi 30 triệu, nhưng két tiền trống trơn. Thủ phạm là một con số duy nhất tính sai: **giá vốn hàng bán**.

Cả hai đều là câu hỏi phỏng vấn cấp mid–senior, và cả hai đều giải được bằng SQL thuần.

---

# Phần 1: Market basket analysis — tìm cặp sản phẩm mua chung

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Market basket analysis** | | **Phân tích giỏ hàng** — tìm sản phẩm hay được mua chung |
| **Self join** | seo join | **Tự nối** — nối một bảng với chính nó |
| **Non-equi join** | non-i-qui | Nối **không dùng dấu bằng** (dùng `<`, `>`, khoảng…) |
| **Association rule** | a-sô-si-ê-shân | **Luật kết hợp** — "mua A thì hay mua B" |
| **Support** | sấp-po | **Độ phổ biến** — cặp này xuất hiện trong bao nhiêu % số đơn |
| **Confidence** | con-phi-đần | **Độ tin cậy** — trong số đơn có A, bao nhiêu % có B (**không đối xứng**) |
| **Lift** | lịp | **Độ nâng** — mua A làm xác suất mua B **tăng bao nhiêu lần** |
| **COGS** (*Cost of Goods Sold*) | | **Giá vốn hàng bán** — tiền thực bỏ ra mua đúng món vừa bán |
| **FIFO** (*First In First Out*) | phai-phô | **Nhập trước xuất trước** |
| **LIFO** | lai-phô | **Nhập sau xuất trước** — VAS 02 và IFRS **không cho phép** |
| **Bình quân gia quyền** | | Lấy giá trung bình có trọng số theo số lượng |
| **Running total** | | **Tổng luỹ tiến** — cộng dồn qua từng dòng |
| **Materialized view** | ma-tê-ri-a-lai | **Khung nhìn vật chất hoá** — kết quả tính sẵn, lưu xuống đĩa |

## Dữ liệu đầu vào chỉ có hai cột

```sql
-- order_items: mỗi dòng ghi MỘT món trong MỘT đơn
--   order_id | product_id
--   ---------+-----------
--        101 | bim
--        101 | bia
--        101 | khan_giay
--        102 | bim
--        102 | bia
--        103 | ca_phe
```

Một đơn có ba món thì nằm trên ba dòng, cùng chung một mã đơn. Bạn cần tìm: **mọi cặp sản phẩm từng xuất hiện chung trong một đơn**, và đếm xem cặp nào xuất hiện nhiều nhất.

## Kỹ thuật: self join — nối một bảng với chính nó

Tưởng tượng bạn photo bảng đơn hàng thành hai bảng sinh đôi, `a` và `b`, rồi dán chúng lại theo điều kiện *cùng một mã đơn*.

```text
Đơn 101 có: bỉm, bia, khăn giấy

Ghép mọi món với mọi món trong cùng đơn:
   bỉm  ↔ bỉm        ← vô nghĩa (tự bắt cặp với chính mình)
   bỉm  ↔ bia        ✓
   bỉm  ↔ khăn giấy  ✓
   bia  ↔ bỉm        ← TRÙNG với "bỉm ↔ bia"
   bia  ↔ bia        ← vô nghĩa
   bia  ↔ khăn giấy  ✓
   khăn ↔ bỉm        ← trùng
   khăn ↔ bia        ← trùng
   khăn ↔ khăn       ← vô nghĩa
```

Hai rắc rối: **tự bắt cặp** và **đếm hai lần**. Cách xử lý cực thanh lịch — chỉ giữ cặp mà mã món bên `a` **nhỏ hơn** mã món bên `b`:

```sql
SELECT
    a.product_id AS san_pham_1,
    b.product_id AS san_pham_2,
    count(*)     AS so_don_mua_chung
FROM order_items a
JOIN order_items b
  ON a.order_id   = b.order_id      -- cùng một đơn
 AND a.product_id < b.product_id    -- ◄── một dòng nhỏ xíu, hết trùng, hết tự nhân đôi
GROUP BY 1, 2
ORDER BY so_don_mua_chung DESC
LIMIT 20;
```

```text
 san_pham_1 | san_pham_2 | so_don_mua_chung
------------+------------+------------------
 bim        | bia        |            18432
 ca_phe     | banh_mi    |            15201
 mi_tom     | trung      |            12876
```

Một dấu `<` thay cho `=` giải quyết cả hai vấn đề cùng lúc. Đây là **non-equi join** (join không dùng dấu bằng) — kỹ thuật đã gặp ở phase-1 bài 3, nay dùng đúng chỗ nhất của nó.

## Cạm bẫy: một đơn mua hai lần cùng sản phẩm

```sql
-- Nếu order_items có 2 dòng cùng product_id trong cùng đơn
-- (khách mua bia ở hai dòng riêng), cặp (bỉm, bia) bị đếm 2 lần cho MỘT đơn.

-- ✅ Khử trùng trước khi ghép
WITH don_duy_nhat AS (
    SELECT DISTINCT order_id, product_id FROM order_items
)
SELECT a.product_id, b.product_id, count(*) AS so_don
FROM don_duy_nhat a
JOIN don_duy_nhat b
  ON a.order_id = b.order_id AND a.product_id < b.product_id
GROUP BY 1, 2
ORDER BY 3 DESC;
```

## Đếm thô chưa đủ: support, confidence và lift

Cặp `(túi nylon, mọi thứ)` sẽ luôn đứng đầu — không phải vì chúng liên quan, mà vì **túi nylon có trong mọi đơn**. Đếm thô đánh lừa bạn.

Ba chỉ số của **luật kết hợp** (*association rules*):

```text
SUPPORT(A,B)    = số đơn có cả A và B  /  tổng số đơn
                  → "cặp này phổ biến tới mức nào"

CONFIDENCE(A→B) = số đơn có cả A và B  /  số đơn có A
                  → "mua A rồi thì bao nhiêu % mua B"

LIFT(A,B)       = confidence(A→B) / (số đơn có B / tổng số đơn)
                  → "mua A làm xác suất mua B TĂNG bao nhiêu lần"

   lift > 1  : mua cùng nhau nhiều hơn ngẫu nhiên  ← thứ bạn tìm
   lift = 1  : độc lập, không liên quan
   lift < 1  : mua cái này thì ÍT mua cái kia (sản phẩm thay thế)
```

**Lift là chỉ số quan trọng nhất** vì nó loại bỏ được ảnh hưởng của sản phẩm phổ biến. Túi nylon có confidence rất cao với mọi thứ, nhưng lift ≈ 1 → nó không mang thông tin gì.

```sql
WITH don_duy_nhat AS (
    SELECT DISTINCT order_id, product_id FROM order_items
),
tong AS (
    SELECT count(DISTINCT order_id)::numeric AS so_don FROM don_duy_nhat
),
don_le AS (
    SELECT product_id, count(*)::numeric AS so_don_co
    FROM don_duy_nhat GROUP BY 1
),
cap AS (
    SELECT a.product_id AS p1, b.product_id AS p2, count(*)::numeric AS so_don_chung
    FROM don_duy_nhat a
    JOIN don_duy_nhat b ON a.order_id = b.order_id AND a.product_id < b.product_id
    GROUP BY 1, 2
    HAVING count(*) >= 50                      -- lọc nhiễu: cặp quá hiếm thì bỏ
)
SELECT
    c.p1, c.p2,
    c.so_don_chung,
    round(c.so_don_chung / t.so_don, 4)                        AS support,
    round(c.so_don_chung / d1.so_don_co, 4)                    AS confidence_1_den_2,
    round(c.so_don_chung / d2.so_don_co, 4)                    AS confidence_2_den_1,
    round((c.so_don_chung * t.so_don) / (d1.so_don_co * d2.so_don_co), 3) AS lift
FROM cap c
CROSS JOIN tong t
JOIN don_le d1 ON d1.product_id = c.p1
JOIN don_le d2 ON d2.product_id = c.p2
WHERE (c.so_don_chung * t.so_don) / (d1.so_don_co * d2.so_don_co) > 1.5
ORDER BY lift DESC
LIMIT 20;
```

Chú ý công thức lift được rút gọn về `(chung × tổng) / (riêng_A × riêng_B)` — dạng này đối xứng và ít phép chia hơn, tránh sai số.

Chú ý thêm: **confidence không đối xứng**. `confidence(bỉm→bia)` có thể là 0,6 trong khi `confidence(bia→bỉm)` chỉ 0,05 — vì bia được mua nhiều hơn bỉm rất nhiều. Đây là điều quyết định bạn gợi ý theo chiều nào.

## Cạm bẫy quy mô: self join là phép nhân

```text
Một đơn có k món → sinh ra k×(k−1)/2 cặp

Đơn 5 món   → 10 cặp
Đơn 20 món  → 190 cặp
Đơn 100 món (đơn sỉ) → 4.950 cặp

Bảng 50 triệu dòng order_items, trung bình 8 món/đơn:
   6,25 triệu đơn × 28 cặp = 175 triệu dòng trung gian
```

Ba cách khống chế:

```sql
-- ① Giới hạn phạm vi thời gian (hầu như luôn hợp lý về nghiệp vụ)
WHERE o.ordered_at >= now() - INTERVAL '90 days'

-- ② Loại đơn quá lớn (đơn sỉ, đơn nhập hàng — không phải hành vi tiêu dùng)
HAVING count(*) BETWEEN 2 AND 20

-- ③ Lọc sản phẩm quá hiếm TRƯỚC khi ghép (giảm bậc hai)
WITH sp_pho_bien AS (
    SELECT product_id FROM order_items
    GROUP BY 1 HAVING count(DISTINCT order_id) >= 100
)
```

Với dữ liệu thật sự lớn, bài toán này nên chạy **theo lô ban đêm** và ghi kết quả vào bảng `product_affinity`, chứ không tính trực tiếp lúc người dùng đang xem trang.

## Ứng dụng production

```sql
-- Bảng kết quả tính sẵn, refresh hằng đêm
CREATE MATERIALIZED VIEW product_affinity AS
SELECT p1, p2, lift, confidence_1_den_2 FROM (...);

CREATE INDEX ON product_affinity (p1, lift DESC);

-- Lúc người dùng thả sản phẩm vào giỏ: một truy vấn, dưới 1 ms
SELECT p2 AS goi_y FROM product_affinity
WHERE p1 = $1 ORDER BY lift DESC LIMIT 5;
```

Từ giây đó, khách vừa thả bỉm vào giỏ, màn hình bật ngay: *"Thêm thùng bia chứ?"*. Chỉ một câu lệnh SQL mà mỗi đơn dày thêm.

---

# Phần 2: Giá vốn hàng bán (COGS) theo FIFO

## Vì sao bài toán này khó

**COGS** (*Cost of Goods Sold*, giá vốn hàng bán) là số tiền thực sự bạn bỏ ra để mua đúng những món hàng vừa bán đi. Tính đúng COGS thì lợi nhuận mới thật; tính sai thì mọi con số đều là ảo.

Cái khó: bạn nhập cùng một sản phẩm nhiều lần với **giá khác nhau**.

```text
Nhập kho (lô hàng):
   01/06: 100 chiếc, giá 80.000đ/chiếc
   10/06: 150 chiếc, giá 85.000đ/chiếc
   20/06: 200 chiếc, giá 90.000đ/chiếc

Bán ra:
   25/06: 220 chiếc

Câu hỏi: giá vốn của 220 chiếc đó là bao nhiêu?
```

Có ba phương pháp kế toán, cho ba đáp án khác nhau:

| Phương pháp | Cách tính 220 chiếc | Giá vốn |
|---|---|---|
| **FIFO** (nhập trước xuất trước) | 100×80k + 120×85k | 18.200.000đ |
| **LIFO** (nhập sau xuất trước) | 200×90k + 20×85k | 19.700.000đ |
| **Bình quân gia quyền** | 220 × 86.111đ | 18.944.444đ |

Chênh lệch **1,5 triệu** trên một lần bán. Nhân với hàng nghìn giao dịch là con số quyết định lãi hay lỗ.

> Ở Việt Nam, Chuẩn mực kế toán VAS 02 cho phép FIFO và bình quân gia quyền, **không cho phép LIFO** (giống IFRS). FIFO là phương pháp phổ biến nhất vì nó phản ánh đúng dòng hàng vật lý với hàng có hạn sử dụng.

## Lời giải: window function với tổng luỹ tiến

Ý tưởng cốt lõi: **ghép khoảng luỹ tiến của lô nhập với khoảng luỹ tiến của lượng bán.**

```text
LÔ NHẬP, cộng dồn:
   lô A: 100 chiếc  →  khoảng [  0, 100)   giá 80k
   lô B: 150 chiếc  →  khoảng [100, 250)   giá 85k
   lô C: 200 chiếc  →  khoảng [250, 450)   giá 90k

BÁN 220 chiếc      →  khoảng [  0, 220)

Giao nhau:
   [0,220) ∩ [  0,100) = 100 chiếc × 80k
   [0,220) ∩ [100,250) = 120 chiếc × 85k
   [0,220) ∩ [250,450) =   0 chiếc
```

Bài toán trở thành: **tìm phần giao của hai khoảng**. Và trong SQL, đó là `LEAST(hết_A, hết_B) - GREATEST(đầu_A, đầu_B)`.

```sql
CREATE TABLE lo_nhap (
    lo_id      BIGSERIAL PRIMARY KEY,
    product_id BIGINT         NOT NULL,
    so_luong   INT            NOT NULL,
    don_gia    NUMERIC(12,2)  NOT NULL,
    nhap_luc   TIMESTAMPTZ    NOT NULL
);

CREATE TABLE xuat_kho (
    xuat_id    BIGSERIAL PRIMARY KEY,
    product_id BIGINT      NOT NULL,
    so_luong   INT         NOT NULL,
    xuat_luc   TIMESTAMPTZ NOT NULL
);
```

```sql
WITH nhap AS (
    SELECT
        product_id, lo_id, so_luong, don_gia,
        sum(so_luong) OVER (PARTITION BY product_id ORDER BY nhap_luc, lo_id)
            - so_luong                                        AS bat_dau,
        sum(so_luong) OVER (PARTITION BY product_id ORDER BY nhap_luc, lo_id)
                                                              AS ket_thuc
    FROM lo_nhap
),
xuat AS (
    SELECT
        product_id, xuat_id, so_luong, xuat_luc,
        sum(so_luong) OVER (PARTITION BY product_id ORDER BY xuat_luc, xuat_id)
            - so_luong                                        AS bat_dau,
        sum(so_luong) OVER (PARTITION BY product_id ORDER BY xuat_luc, xuat_id)
                                                              AS ket_thuc
    FROM xuat_kho
)
SELECT
    x.xuat_id,
    x.product_id,
    x.so_luong                                          AS so_luong_ban,
    sum( (LEAST(n.ket_thuc, x.ket_thuc)
          - GREATEST(n.bat_dau, x.bat_dau)) * n.don_gia ) AS gia_von,
    round(
        sum( (LEAST(n.ket_thuc, x.ket_thuc)
              - GREATEST(n.bat_dau, x.bat_dau)) * n.don_gia ) / x.so_luong, 2
    )                                                    AS gia_von_don_vi
FROM xuat x
JOIN nhap n
  ON n.product_id = x.product_id
 AND n.bat_dau    < x.ket_thuc          -- ◄── điều kiện GIAO NHAU của hai khoảng
 AND n.ket_thuc   > x.bat_dau
GROUP BY x.xuat_id, x.product_id, x.so_luong
ORDER BY x.xuat_id;
```

Đọc kỹ hai dòng `ON`: `n.bat_dau < x.ket_thuc AND n.ket_thuc > x.bat_dau` là điều kiện chuẩn để hai khoảng nửa mở `[a,b)` và `[c,d)` giao nhau. Đây là mẫu thiết kế dùng lại được cho mọi bài toán khớp khoảng — phân bổ ngân sách, tính công theo ca, chia hoa hồng theo bậc.

**Toàn bộ vòng lặp FIFO ở tầng ứng dụng vừa biến mất, thay bằng một câu SQL chạy trong một lần quét.**

## Kiểm chứng — bước không được bỏ

```sql
-- ① Tổng số lượng khớp phải bằng đúng số lượng xuất
SELECT x.xuat_id, x.so_luong AS xuat,
       sum(LEAST(n.ket_thuc, x.ket_thuc) - GREATEST(n.bat_dau, x.bat_dau)) AS khop
FROM xuat x JOIN nhap n
  ON n.product_id = x.product_id AND n.bat_dau < x.ket_thuc AND n.ket_thuc > x.bat_dau
GROUP BY 1, 2
HAVING x.so_luong <> sum(LEAST(n.ket_thuc, x.ket_thuc) - GREATEST(n.bat_dau, x.bat_dau));
-- Phải trả về 0 dòng. Có dòng nào = bán vượt tồn kho.

-- ② Tổng giá vốn phải bằng tổng tiền nhập của phần đã bán
SELECT sum(gia_von) FROM ket_qua_cogs;
```

Điều kiện ① thất bại nghĩa là **bán nhiều hơn nhập** — dữ liệu kho đã sai từ trước, và không phương pháp tính nào cứu được.

## Bình quân gia quyền — đơn giản hơn nhiều

Nếu doanh nghiệp dùng bình quân gia quyền di động, mọi thứ gọn lại:

```sql
SELECT
    product_id,
    sum(so_luong * don_gia) / NULLIF(sum(so_luong), 0) AS gia_von_binh_quan
FROM lo_nhap
WHERE nhap_luc <= $1                       -- tại thời điểm xuất kho
GROUP BY product_id;
```

Nhớ `NULLIF(..., 0)` — nếu không, sản phẩm chưa nhập lô nào sẽ gây lỗi chia cho 0.

## Bảng so sánh ba phương pháp

| | FIFO | Bình quân gia quyền | LIFO |
|---|---|---|---|
| Phản ánh dòng hàng vật lý | ✅ Đúng nhất | Không | Ngược |
| Độ phức tạp tính | Cao (khớp khoảng) | Thấp | Cao |
| Khi giá nhập **tăng** | Giá vốn thấp → lãi cao → **thuế cao** | Ở giữa | Giá vốn cao → lãi thấp |
| Hợp lệ theo VAS 02 / IFRS | ✅ | ✅ | ❌ |
| Cần lưu lịch sử lô hàng | ✅ | Không bắt buộc | ✅ |
| Dùng cho hàng có hạn dùng | ✅ Bắt buộc | Không phù hợp | Không |

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bạn chạy câu tìm cặp sản phẩm mua chung. Sau 25 phút nó vẫn chưa xong, và đĩa `temp` đầy.

**Chẩn đoán — tính trước xem nó sinh ra bao nhiêu dòng:**

```sql
-- ① Phân bố số món mỗi đơn — thủ phạm nằm ở cái đuôi
SELECT so_mon, count(*) AS so_don
FROM (SELECT order_id, count(*) AS so_mon FROM order_items GROUP BY 1) t
GROUP BY 1 ORDER BY 1 DESC LIMIT 5;
--  so_mon | so_don
--     847 |      3     ◄── ĐƠN SỈ! 847 món sinh ra 847×846/2 = 358.281 CẶP
--     612 |      5
--       8 | 1240000

-- ② Ước lượng tổng số dòng trung gian TRƯỚC KHI chạy
SELECT sum(so_mon * (so_mon - 1) / 2) AS so_cap_se_sinh_ra
FROM (SELECT order_id, count(*) AS so_mon FROM order_items GROUP BY 1) t;
--  2.847.000.000    ◄── GẦN 3 TỶ DÒNG. Đây là lý do nó không xong.
```

**Cách xử lý — ba lớp lọc, giảm theo cấp số nhân:**

```sql
WITH
-- ① LỌC SẢN PHẨM HIẾM TRƯỚC — giảm đầu vào thì kết quả giảm BẬC HAI
sp_pho_bien AS (
    SELECT product_id FROM order_items
    GROUP BY 1 HAVING count(DISTINCT order_id) >= 100
),
-- ② LOẠI ĐƠN SỈ — chúng không phản ánh hành vi tiêu dùng
don_hop_le AS (
    SELECT i.order_id, i.product_id
    FROM order_items i
    JOIN orders o USING (order_id)
    JOIN sp_pho_bien s USING (product_id)
    WHERE o.ordered_at >= now() - INTERVAL '90 days'    -- ③ GIỚI HẠN THỜI GIAN
    GROUP BY 1, 2                                        -- khử trùng luôn
),
don_loc AS (
    SELECT order_id FROM don_hop_le
    GROUP BY 1 HAVING count(*) BETWEEN 2 AND 20          -- ② bỏ đơn quá lớn
)
SELECT a.product_id, b.product_id, count(*) AS so_don
FROM don_hop_le a
JOIN don_hop_le b ON a.order_id = b.order_id AND a.product_id < b.product_id
JOIN don_loc      d ON d.order_id = a.order_id
GROUP BY 1, 2
HAVING count(*) >= 50
ORDER BY 3 DESC;
--  3 tỷ dòng → khoảng 40 triệu dòng → chạy trong ~2 phút
```

**Và với production, đừng tính lúc người dùng đang xem:**

```sql
-- Tính sẵn hằng đêm
CREATE MATERIALIZED VIEW product_affinity AS SELECT ... ;
CREATE INDEX ON product_affinity (p1, lift DESC);

-- Lúc người dùng thả sản phẩm vào giỏ: một truy vấn, dưới 1 ms
SELECT p2 FROM product_affinity WHERE p1 = $1 ORDER BY lift DESC LIMIT 5;

-- Làm mới không khoá đọc
REFRESH MATERIALIZED VIEW CONCURRENTLY product_affinity;
```

> **Tình huống 2:** Kế toán chạy báo cáo COGS, con số **không khớp** với tính tay. Câu SQL không báo lỗi gì.

**Chẩn đoán — bước kiểm chứng bắt buộc mà nhiều người bỏ qua:**

```sql
-- ① Tổng số lượng KHỚP có bằng tổng số lượng XUẤT không?
WITH nhap AS (...), xuat AS (...)
SELECT x.xuat_id,
       x.so_luong                                                   AS phai_khop,
       sum(LEAST(n.ket_thuc, x.ket_thuc) - GREATEST(n.bat_dau, x.bat_dau)) AS da_khop
FROM xuat x
JOIN nhap n ON n.product_id = x.product_id
           AND n.bat_dau < x.ket_thuc AND n.ket_thuc > x.bat_dau
GROUP BY 1, 2
HAVING x.so_luong <> sum(LEAST(n.ket_thuc, x.ket_thuc)
                       - GREATEST(n.bat_dau, x.bat_dau));
```

```text
   TRẢ VỀ 0 DÒNG  → khớp hoàn toàn, con số đúng.
   CÓ DÒNG        → ĐÃ BÁN VƯỢT TỒN KHO.
                    Dữ liệu kho SAI TỪ TRƯỚC, không phương pháp tính nào cứu được.
```

**Ba nguyên nhân thường gặp và cách sửa:**

```sql
-- ① BÁN VƯỢT TỒN: có xuất mà không có lô nhập tương ứng
SELECT product_id,
       sum(so_luong) FILTER (WHERE loai='nhap') AS tong_nhap,
       sum(so_luong) FILTER (WHERE loai='xuat') AS tong_xuat
FROM kho_movements GROUP BY 1
HAVING sum(so_luong) FILTER (WHERE loai='xuat')
     > sum(so_luong) FILTER (WHERE loai='nhap');
--  → phải bổ sung phiếu nhập bị thiếu, hoặc điều chỉnh kiểm kê

-- ② THỨ TỰ LÔ KHÔNG ỔN ĐỊNH: hai lô nhập cùng thời điểm
-- ❌ SUM(...) OVER (ORDER BY nhap_luc)
-- ✅ thêm tie-break để thứ tự tất định giữa các lần chạy
SUM(so_luong) OVER (PARTITION BY product_id ORDER BY nhap_luc, lo_id)

-- ③ ĐƠN GIÁ DÙNG FLOAT: sai số tích luỹ
ALTER TABLE lo_nhap ALTER COLUMN don_gia TYPE NUMERIC(12,2);
```

**Chốt lại bằng một câu đối soát tổng — chạy mỗi lần lên báo cáo:**

```sql
SELECT
    (SELECT sum(gia_von) FROM ket_qua_cogs)                       AS cogs_tinh_ra,
    (SELECT sum(so_luong * don_gia) FROM lo_nhap
      WHERE lo_id IN (SELECT DISTINCT lo_id FROM ket_qua_cogs))   AS tong_tien_lo;
-- Hai con số phải có quan hệ hợp lý; lệch lớn = có lô bị tính thừa hoặc thiếu
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Self join không có `a.id < b.id` | Cặp bị đếm 2 lần + tự bắt cặp | Dùng `<` thay `=` |
| Không `DISTINCT` trước self join | Một đơn 2 dòng cùng sản phẩm → đếm sai | `SELECT DISTINCT order_id, product_id` |
| Xếp hạng cặp bằng đếm thô | Túi nylon luôn đứng đầu | Dùng **lift**, không dùng count |
| Quên `HAVING count >= n` | Cặp xuất hiện 1 lần có lift rất cao (nhiễu) | Lọc ngưỡng tối thiểu |
| Nghĩ confidence đối xứng | Gợi ý sai chiều | Tính cả hai chiều |
| Self join trên bảng lớn không giới hạn | 175 triệu dòng trung gian | Giới hạn thời gian + loại đơn sỉ |
| Tính affinity trực tiếp lúc người dùng xem | Trang chậm | Materialized view refresh hằng đêm |
| COGS tính bằng vòng lặp ở tầng app | Chậm, khó kiểm chứng, dễ sai | Window function + khớp khoảng |
| Không kiểm tra tổng khớp = tổng xuất | Bán vượt tồn mà không biết | Câu kiểm chứng `HAVING` |
| `ORDER BY` trong window không có tie-break | Thứ tự lô không ổn định giữa các lần chạy | Thêm `, lo_id` vào `ORDER BY` |
| Chia cho tổng số lượng bằng 0 | Lỗi division by zero | `NULLIF(sum(...), 0)` |
| Dùng `FLOAT` cho đơn giá | Sai số tích luỹ (phase-5 bài 1) | `NUMERIC(12,2)` |

## Câu hỏi phỏng vấn hay gặp

**H: Tìm các cặp sản phẩm hay được mua chung, viết SQL.**
Self join bảng `order_items` với chính nó theo `order_id`, và điều kiện `a.product_id < b.product_id` — dấu `<` thay cho `=` vừa loại bỏ việc tự bắt cặp vừa loại bỏ việc đếm mỗi cặp hai lần. Nhớ `DISTINCT` trước để một đơn có hai dòng cùng sản phẩm không bị đếm hai lần. Và em không xếp hạng bằng đếm thô mà bằng **lift**, vì đếm thô sẽ luôn đưa túi nylon lên đầu.

**H: Lift là gì và vì sao dùng nó?**
Lift đo xem **mua A làm xác suất mua B tăng bao nhiêu lần** so với ngẫu nhiên. Công thức rút gọn là `(số đơn có cả hai × tổng số đơn) / (số đơn có A × số đơn có B)`. Lift lớn hơn 1 là mua cùng nhau nhiều hơn ngẫu nhiên, bằng 1 là độc lập, nhỏ hơn 1 là sản phẩm thay thế. Nó loại bỏ được ảnh hưởng của sản phẩm phổ biến — thứ mà support và confidence không làm được.

**H: Tính giá vốn hàng bán theo FIFO bằng SQL thế nào?**
Em biến nó thành bài toán **khớp khoảng**. Dùng window function tính tổng luỹ tiến cho cả lô nhập và lượng xuất, mỗi bản ghi trở thành một khoảng `[bắt_đầu, kết_thúc)`. Rồi join hai bên với điều kiện giao nhau `n.bat_dau < x.ket_thuc AND n.ket_thuc > x.bat_dau`, và số lượng khớp là `LEAST(hết) - GREATEST(đầu)`. Toàn bộ vòng lặp FIFO ở tầng ứng dụng biến mất, thay bằng một lần quét. Bước cuối bắt buộc là kiểm chứng tổng số lượng khớp bằng đúng số lượng xuất — không bằng nghĩa là đã bán vượt tồn kho.

**H: Vì sao không dùng LIFO?**
Chuẩn mực kế toán Việt Nam VAS 02 và chuẩn quốc tế IFRS đều **không cho phép** LIFO, vì nó cho phép doanh nghiệp thao túng lợi nhuận khi giá biến động. Chỉ US GAAP còn cho phép. Ở Việt Nam chỉ có FIFO và bình quân gia quyền.

**H: Self join có vấn đề gì về hiệu năng?**
Nó là phép nhân: một đơn có k món sinh ra k(k−1)/2 cặp, nên đơn 100 món tạo ra 4.950 dòng trung gian. Trên bảng 50 triệu dòng, kết quả trung gian có thể tới hàng trăm triệu dòng. Em khống chế bằng ba cách: giới hạn phạm vi thời gian, loại đơn quá lớn (đơn sỉ không phản ánh hành vi tiêu dùng), và lọc bỏ sản phẩm quá hiếm **trước** khi ghép — vì giảm đầu vào thì kết quả giảm theo bậc hai.

## Tóm tắt bài 2

- **Market basket** giải bằng self join với `a.product_id < b.product_id` — dấu `<` loại bỏ cả tự bắt cặp lẫn đếm hai lần trong một dòng.
- Xếp hạng cặp bằng **lift**, không bằng đếm thô: lift loại bỏ ảnh hưởng của sản phẩm phổ biến. **Confidence không đối xứng** — quyết định chiều gợi ý.
- Self join là **phép nhân** — khống chế bằng giới hạn thời gian, loại đơn sỉ, lọc sản phẩm hiếm trước; và tính sẵn vào materialized view.
- **COGS FIFO** biến thành bài toán **khớp khoảng**: window function tạo khoảng luỹ tiến hai bên, join theo điều kiện giao nhau, số lượng khớp là `LEAST(hết) − GREATEST(đầu)`.
- Mẫu khớp khoảng này dùng lại được cho phân bổ ngân sách, tính công theo ca, chia hoa hồng theo bậc.
- Luôn có **bước kiểm chứng**: tổng khớp phải bằng tổng xuất — không bằng nghĩa là dữ liệu kho đã sai từ trước.

**Bài kế tiếp** → [Bài 3: Dùng AI viết SQL mà không bị nó lừa](03-dung-ai-viet-sql-ma-khong-bi-no-lua.md)

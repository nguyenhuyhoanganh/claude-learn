# Bài 6: `CASE WHEN` và nghệ thuật dán nhãn dữ liệu

300 dòng điểm, cột xếp loại vẫn trống trơn. Sếp muốn có ngay chiều nay: **Giỏi, Khá, Trung bình, Yếu** cho từng sinh viên. Mà trong bảng chỉ có mỗi con số, không có lấy một chữ nào.

Cách nhanh nhất ai cũng nghĩ ra: mở Excel, gõ tay từng ô. 300 ô, nửa buổi chiều. Tháng sau điểm cập nhật lại làm từ đầu — nghe thôi đã thấy mệt.

Nhưng quy tắc thì đơn giản lắm:

```text
   Từ 8.0 trở lên  →  Giỏi
   Từ 6.5 trở lên  →  Khá
   Từ 5.0 trở lên  →  Trung bình
   Dưới nữa        →  Yếu
```

Trong đầu bạn, nó chỉ là **bốn cái ngưỡng**. Vậy sao không **nói thẳng bốn cái ngưỡng đó cho database nghe**, để chính nó dán nhãn ngay trong lúc lấy dữ liệu ra?

Nó làm được. Hai từ khoá thôi: **`CASE WHEN`**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **`CASE`** | kêis | **Trường hợp** — mở khối xét điều kiện |
| **`WHEN`** | oen | **Khi** — mở một điều kiện |
| **`THEN`** | đen | **Thì** — giá trị trả về nếu điều kiện đúng |
| **`ELSE`** | eo | **Còn lại thì** — nhánh hứng phần không khớp điều kiện nào |
| **`END`** | en | **Hết** — đóng khối `CASE` |
| **Searched CASE** | | Dạng đầy đủ: mỗi `WHEN` có một điều kiện riêng |
| **Simple CASE** | | Dạng rút gọn: so một cột với nhiều giá trị |
| **Pivot** | pi-vốt | **Xoay bảng** — biến hàng thành cột |
| **Alias** (`AS`) | ây-li-át | **Bí danh** — đặt tên cho cột kết quả |

## `CASE WHEN` là gì — một cái máy dán nhãn

```text
   Hình dung một DÃY CỔNG XẾP DỌC, mỗi cổng có một người gác
   cầm một điều kiện:

                      hàng dữ liệu đi vào
                              │
                              ▼
       ┌──────────────────────────────────────┐
       │  CỔNG 1:  điểm >= 8.0 ?              │──► CÓ → dán nhãn "Giỏi", RA NGOÀI
       └──────────────────┬───────────────────┘
                    KHÔNG │
       ┌──────────────────▼───────────────────┐
       │  CỔNG 2:  điểm >= 6.5 ?              │──► CÓ → dán nhãn "Khá", RA NGOÀI
       └──────────────────┬───────────────────┘
                    KHÔNG │
       ┌──────────────────▼───────────────────┐
       │  CỔNG 3:  điểm >= 5.0 ?              │──► CÓ → "Trung bình", RA NGOÀI
       └──────────────────┬───────────────────┘
                    KHÔNG │
       ┌──────────────────▼───────────────────┐
       │  ELSE:  hứng tất cả phần còn lại     │──► "Yếu"
       └──────────────────────────────────────┘

   MỘT HÀNG → MỘT NHÃN. Không ai nhận hai lần.
   Gặp cổng cho qua đầu tiên là DỪNG, không đi tiếp xuống dưới.
```

**Một chuyện phải nói ngay:** `CASE WHEN` **không hề sửa dữ liệu trong bảng**. Nó chỉ tạo thêm một cột **ngay lúc bạn lấy dữ liệu ra**; đóng câu lệnh lại là cột đó biến mất.

## Cú pháp — đọc lên nghe như tiếng Việt

Cấu trúc rất tự nhiên: **`WHEN` là "khi"**, **`THEN` là "thì"**.

> *"**Khi** điểm từ 8 trở lên **thì** là Giỏi."*

Cứ một cặp *khi – thì* là một mức. Hết các mức thì đóng lại bằng **`END`**.

```sql
SELECT ho_ten, diem,
    CASE
        WHEN diem >= 8.0 THEN 'Giỏi'
        WHEN diem >= 6.5 THEN 'Khá'
        WHEN diem >= 5.0 THEN 'Trung bình'
        ELSE 'Yếu'
    END AS xep_loai              -- ◄── AS đặt tên cho cột mới
FROM bang_diem;
```

```text
 ho_ten          | diem | xep_loai
-----------------+------+------------
 Nguyễn Thị Ngọc |  8.7 | Giỏi
 Trần Văn Hùng   |  6.9 | Khá
 Lê Thị Mai      |  5.2 | Trung bình
 Phạm Văn Nam    |  4.0 | Yếu
```

Theo dõi hai hàng đi qua dãy cổng:

```text
   NGỌC (8.7):
      Cổng 1 hỏi "có từ 8.0 trở lên không?" → CÓ!
      → nhận nhãn "Giỏi" rồi RẼ RA NGOÀI luôn.
      → Các cổng còn lại Ngọc KHÔNG BAO GIỜ NHÌN THẤY.

   HÙNG (6.9):
      Cổng 1 không cho qua (6.9 < 8.0).
      Đi tiếp xuống cổng 2 "từ 6.5 trở lên?" → LỌT!
      → nhận nhãn "Khá".
```

> **Một điều nhiều người viết thừa:** không cần ghi `WHEN diem >= 6.5 AND diem < 8.0`. Vì ai từ 8.0 trở lên **đã bị cổng 1 giữ lại rồi**, không xuống được tới đây. **Điều kiện sau chỉ cần lo phần còn lại.**

## Hai lỗi cú pháp hay gặp

```text
   ① QUÊN `END`
      Máy đọc tới cuối khối mà không thấy chỗ đóng
      → BÁO LỖI CÚ PHÁP NGAY, câu lệnh không chạy.
      → Lỗi này DỄ THẤY vì máy la lên liền.

   ② QUÊN `ELSE`
      Hàng nào không lọt cổng nào sẽ nhận giá trị NULL.
      → Câu lệnh VẪN CHẠY NGON LÀNH, không báo gì cả.
      → Bạn chỉ phát hiện khi nhìn thấy cột bị TRỐNG.
```

```sql
-- ⚠️ Thiếu ELSE
SELECT ho_ten,
    CASE WHEN diem >= 5.0 THEN 'Đạt' END AS ket_qua
FROM bang_diem;
```

```text
 ho_ten          | ket_qua
-----------------+---------
 Nguyễn Thị Ngọc | Đạt
 Phạm Văn Nam    |          ← NULL, không phải "Không đạt"
```

**Lỗi thứ hai nguy hiểm hơn lỗi thứ nhất** — vì lỗi cú pháp thì máy chặn bạn ngay, còn `NULL` âm thầm thì trôi thẳng vào báo cáo.

> **Luật:** luôn viết `ELSE`, kể cả khi bạn nghĩ mọi trường hợp đã được phủ hết. Nếu thật sự muốn `NULL` thì viết rõ `ELSE NULL` để người đọc sau biết đó là cố ý.

## Cái bẫy chết người: sai thứ tự điều kiện

Đây là phần quan trọng nhất của cả bài.

Vẫn bốn mức đó, nhưng ta **đảo thứ tự** — đưa điều kiện **rộng nhất** lên đứng đầu:

```sql
-- ❌ SAI THỨ TỰ ĐIỀU KIỆN
CASE
    WHEN diem >= 5.0 THEN 'Trung bình'    -- ◄── cái sàng LỖ TO NHẤT đặt lên đầu
    WHEN diem >= 6.5 THEN 'Khá'
    WHEN diem >= 8.0 THEN 'Giỏi'
    ELSE 'Yếu'
END
```

**Câu lệnh vẫn chạy. Không một lời cảnh báo.** Và đây mới là chỗ đau:

```text
   NGỌC (9.0) đi vào cổng đầu.
   Cổng hỏi: "có từ 5.0 trở lên không?"
   → 9.0 thì ĐƯƠNG NHIÊN LÀ CÓ!

   → Ngọc bị chộp ngay tại cổng đầu, nhận nhãn "Trung bình" — ĐÚNG LUẬT.
   → Cổng "Giỏi" nằm ngay bên dưới, cách đúng một dòng,
     nhưng Ngọc đã RẼ RA MẤT RỒI.

   CHẠY HẾT BẢNG, KẾT QUẢ:
      Cả lớp Trung bình. KHÔNG MỘT AI GIỎI. KHÔNG MỘT AI KHÁ.
```

Đọc lại câu lệnh mười lần cũng không thấy lỗi, vì **nó không sai cú pháp**. Máy làm đúng y như những gì bạn viết — chỉ là bạn viết nhầm thứ tự.

### Quy tắc "cái sàng"

```text
   Hình dung một chồng sàng lọc gạo:

        ┌───────────────────────┐
        │  sàng lỗ TO (>= 5.0)  │  ← gần như MỌI HẠT đều lọt qua
        └───────────────────────┘
        ┌───────────────────────┐
        │  sàng lỗ vừa (>= 6.5) │  ← chẳng còn gì để lọc
        └───────────────────────┘
        ┌───────────────────────┐
        │  sàng lỗ nhỏ (>= 8.0) │  ← trống rỗng
        └───────────────────────┘

   Đặt cái sàng lỗ TO NHẤT lên trên thì nó HỨNG SẠCH,
   mấy cái sàng dưới còn gì để lọc nữa?
```

> **LUẬT:** xếp điều kiện **khắt khe nhất lên trên**, rồi **nới rộng dần xuống dưới**.
> Giỏi → Khá → Trung bình → phần còn lại.

**Mẹo thử nhanh:** lấy **giá trị cao nhất** trong bảng chạy thử một câu. Nếu nó rơi vào mức thấp, gần như chắc chắn bạn đã **xếp ngược**.

```sql
-- Kiểm tra trong 3 giây
SELECT max(diem), (SELECT xep_loai FROM ... WHERE diem = (SELECT max(diem) ...))
-- điểm cao nhất mà ra "Trung bình" → SAI THỨ TỰ
```

## Dạng rút gọn: khi chỉ so một cột với nhiều giá trị

Khi mọi điều kiện đều là *"cột này bằng giá trị nào"*, có cách viết ngắn hơn:

```sql
-- Dạng ĐẦY ĐỦ (searched CASE) — mỗi WHEN một điều kiện riêng
CASE
    WHEN status = 'paid'      THEN 'Đã thanh toán'
    WHEN status = 'pending'   THEN 'Chờ xử lý'
    WHEN status = 'cancelled' THEN 'Đã huỷ'
    ELSE 'Khác'
END

-- Dạng RÚT GỌN (simple CASE) — viết cột MỘT LẦN ở đầu
CASE status
    WHEN 'paid'      THEN 'Đã thanh toán'
    WHEN 'pending'   THEN 'Chờ xử lý'
    WHEN 'cancelled' THEN 'Đã huỷ'
    ELSE 'Khác'
END
```

| | Dạng đầy đủ | Dạng rút gọn |
|---|---|---|
| So sánh được | Mọi phép (`>`, `<`, `LIKE`, `IS NULL`, `AND`/`OR`) | **Chỉ so bằng** (`=`) |
| So nhiều cột khác nhau | ✅ Được | ❌ Chỉ một cột |
| Bắt được `NULL` | ✅ Được (`WHEN col IS NULL`) | ❌ **Không** — vì `NULL = NULL` cho ra `UNKNOWN` |
| Độ dài | Dài hơn | Ngắn gọn |

> **Bẫy của dạng rút gọn:** nó dùng phép `=` ngầm, mà `NULL = 'paid'` không cho ra `TRUE` cũng không cho ra `FALSE` — nó cho ra `UNKNOWN`. Nên hàng có `status` là `NULL` sẽ **rơi vào `ELSE`**, không cách nào bắt riêng được. Muốn bắt `NULL` thì phải dùng dạng đầy đủ với `WHEN status IS NULL`.

## Kết hợp `CASE WHEN` với `GROUP BY` — biến bảng dài thành báo cáo

Sếp hỏi tiếp một câu rất thường gặp: *"Bao nhiêu bạn qua môn?"*

Lúc này sếp **không cần danh sách 300 dòng nữa**. Sếp cần đúng **hai con số**: đạt bao nhiêu, không đạt bao nhiêu.

```sql
SELECT
    CASE WHEN diem >= 5.0 THEN 'Đạt' ELSE 'Không đạt' END AS ket_qua,
    COUNT(*) AS so_luong
FROM bang_diem
GROUP BY CASE WHEN diem >= 5.0 THEN 'Đạt' ELSE 'Không đạt' END;
```

```text
 ket_qua    | so_luong
------------+----------
 Đạt        |      228
 Không đạt  |       72

   300 dòng gói gọn trong 2 con số — đúng bằng câu hỏi của sếp. (76% qua môn)
```

Cách hoạt động, hình dung bằng **hai cái giỏ**:

```text
   ┌──────────┐   ┌──────────────┐
   │   Đạt    │   │  Không đạt   │
   └──────────┘   └──────────────┘
        ▲                ▲
        │                │
   Từng hàng chạy qua CASE, nhận nhãn, rồi RƠI VÀO ĐÚNG GIỎ CỦA MÌNH.
   GROUP BY gom các hàng cùng nhãn về một giỏ.
   COUNT(*) đếm xem mỗi giỏ có bao nhiêu hàng.
```

### Ba bước, một quy trình

```text
   ① DÁN NHÃN   bằng CASE
   ② GOM NHÓM   bằng GROUP BY
   ③ ĐẾM/TÍNH   bằng COUNT / SUM / AVG
```

**Lưu ý về việc lặp lại khối `CASE`:** phải viết nó **hai lần** — một lần trong `SELECT`, một lần trong `GROUP BY`. Đó là vì `GROUP BY` chạy **trước** `SELECT` (xem [bài 1](01-vi-sao-8-tren-10-ung-vien-truot-vong-sql.md) về thứ tự xử lý), nên lúc `GROUP BY` làm việc thì tên cột `ket_qua` **chưa tồn tại**.

Ba cách tránh viết lặp:

```sql
-- ① MySQL và PostgreSQL cho phép GROUP BY theo SỐ THỨ TỰ cột
SELECT CASE WHEN diem >= 5.0 THEN 'Đạt' ELSE 'Không đạt' END AS ket_qua,
       COUNT(*)
FROM bang_diem
GROUP BY 1;                       -- ◄── cột thứ 1 trong SELECT

-- ② Dùng CTE cho rõ ràng nhất (khuyến nghị)
WITH da_gan_nhan AS (
    SELECT CASE WHEN diem >= 5.0 THEN 'Đạt' ELSE 'Không đạt' END AS ket_qua
    FROM bang_diem
)
SELECT ket_qua, COUNT(*) AS so_luong
FROM da_gan_nhan
GROUP BY ket_qua;

-- ③ MySQL (chỉ MySQL) cho dùng thẳng alias trong GROUP BY
GROUP BY ket_qua;                 -- ❌ SQL Server và Oracle KHÔNG cho
```

## `CASE` không chỉ nằm trong `SELECT`

Đây là phần ít người biết, và là chỗ `CASE` phát huy nhiều nhất.

### ① Trong `ORDER BY` — sắp xếp theo thứ tự tuỳ ý

```sql
-- Sắp trạng thái theo thứ tự NGHIỆP VỤ, không phải thứ tự bảng chữ cái
SELECT order_id, status
FROM orders
ORDER BY CASE status
             WHEN 'pending'   THEN 1
             WHEN 'paid'      THEN 2
             WHEN 'shipped'   THEN 3
             WHEN 'cancelled' THEN 4
         END;
```

Không có `CASE` thì `ORDER BY status` sẽ ra `cancelled, paid, pending, shipped` — đúng bảng chữ cái nhưng vô nghĩa với người đọc.

### ② Trong `UPDATE` — sửa nhiều mức trong một câu

```sql
-- ❌ Ba câu, ba lần quét bảng
UPDATE san_pham SET gia = gia * 0.9  WHERE loai = 'ao';
UPDATE san_pham SET gia = gia * 0.8  WHERE loai = 'quan';
UPDATE san_pham SET gia = gia * 0.95 WHERE loai = 'giay';

-- ✅ Một câu, một lần quét
UPDATE san_pham
SET gia = gia * CASE loai
                    WHEN 'ao'   THEN 0.9
                    WHEN 'quan' THEN 0.8
                    WHEN 'giay' THEN 0.95
                    ELSE 1                    -- ◄── ELSE 1 = giữ nguyên giá
                END;
```

> **Chú ý `ELSE 1` ở đây.** Nếu quên `ELSE`, các loại khác sẽ nhận `NULL`, và `gia * NULL` cho ra `NULL` — **bạn vừa xoá sạch giá của mọi sản phẩm còn lại**. Đây là ví dụ rõ nhất vì sao "quên `ELSE`" nguy hiểm hơn "quên `END`".

### ③ Trong hàm tổng hợp — kỹ thuật xoay bảng (pivot)

```sql
-- Biến HÀNG thành CỘT: mỗi trạng thái một cột
SELECT
    date_trunc('month', ordered_at) AS thang,
    COUNT(*)                                                   AS tong_don,
    COUNT(CASE WHEN status = 'paid'      THEN 1 END)           AS da_thanh_toan,
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END)           AS da_huy,
    SUM(CASE WHEN status <> 'cancelled' THEN total_amount ELSE 0 END) AS doanh_thu
FROM orders
GROUP BY 1
ORDER BY 1;
```

```text
 thang      | tong_don | da_thanh_toan | da_huy | doanh_thu
------------+----------+---------------+--------+------------
 2026-06-01 |     1204 |          1012 |    192 | 842150000
 2026-07-01 |     1389 |          1201 |    188 | 967300000
```

Kỹ thuật này gọi là **conditional aggregation** (đếm/cộng có điều kiện), và nó được mổ xẻ đầy đủ ở [bài 4](04-group-by-having-va-nghe-thuat-aggregate.md).

> **Mẹo nhỏ:** `COUNT(CASE WHEN ... THEN 1 END)` **không cần `ELSE`** — vì nhánh còn lại tự động là `NULL`, mà `COUNT` thì bỏ qua `NULL`. Nhưng `SUM(CASE ...)` thì **cần `ELSE 0`**, nếu không `SUM` sẽ cộng nhầm.

PostgreSQL có cách viết gọn hơn cho việc này:

```sql
COUNT(*) FILTER (WHERE status = 'paid')     AS da_thanh_toan
-- tương đương COUNT(CASE WHEN status = 'paid' THEN 1 END), nhưng dễ đọc hơn
```

### ④ Xử lý `NULL` — nhưng thường có cách gọn hơn

```sql
-- Dùng CASE
CASE WHEN city IS NULL THEN 'Chưa rõ' ELSE city END

-- ✅ Gọn hơn — COALESCE trả về giá trị KHÁC NULL đầu tiên
COALESCE(city, 'Chưa rõ')
```

## Cái giá của `CASE WHEN`: ngưỡng nằm cứng trong code

Đây là điều cần nói thẳng.

```text
   Bốn cái ngưỡng 8.0 / 6.5 / 5.0 đang NẰM CỨNG TRONG CÂU LỆNH,
   chứ không nằm trong DỮ LIỆU.

   Sang năm nhà trường sửa quy chế (Giỏi phải từ 8.5)
   → bạn phải MỞ LẠI TỪNG CÂU LỆNH có CASE WHEN để sửa tay.
   → Và chỗ nào quên thì báo cáo đó sai, không ai biết.
```

**Cách bài bản:** đưa ngưỡng vào một **bảng quy chế riêng** rồi `JOIN` vào khi cần.

```sql
CREATE TABLE quy_che_xep_loai (
    xep_loai   TEXT NOT NULL,
    diem_tu    NUMERIC(3,1) NOT NULL,
    diem_den   NUMERIC(3,1) NOT NULL,
    hieu_luc_tu DATE NOT NULL,
    hieu_luc_den DATE                    -- NULL = còn hiệu lực
);

INSERT INTO quy_che_xep_loai VALUES
    ('Giỏi',       8.0, 10.0, '2020-01-01', NULL),
    ('Khá',        6.5,  8.0, '2020-01-01', NULL),
    ('Trung bình', 5.0,  6.5, '2020-01-01', NULL),
    ('Yếu',        0.0,  5.0, '2020-01-01', NULL);

-- Giờ đổi quy chế = sửa MỘT DÒNG DỮ LIỆU, không sửa câu lệnh nào
SELECT d.ho_ten, d.diem, q.xep_loai
FROM bang_diem d
JOIN quy_che_xep_loai q
  ON d.diem >= q.diem_tu AND d.diem < q.diem_den    -- ◄── non-equi join
 AND q.hieu_luc_den IS NULL;
```

**Khi nào chọn cách nào:**

| | `CASE WHEN` trong câu lệnh | Bảng quy chế + `JOIN` |
|---|---|---|
| Ngưỡng **hầu như không đổi** | ✅ Đơn giản, dễ đọc | Thừa |
| Ngưỡng **đổi theo thời gian** | ❌ Sửa tay nhiều chỗ | ✅ Sửa một dòng dữ liệu |
| Cần **báo cáo cũ dùng quy chế cũ** | ❌ Không làm được | ✅ Có `hieu_luc_tu`/`den` |
| Chỉ dùng ở **một chỗ duy nhất** | ✅ | Thừa |
| Dùng ở **nhiều báo cáo** | ❌ Lặp lại, dễ lệch | ✅ Một nguồn sự thật |

**Ngưỡng thực dụng:** khi cùng bộ ngưỡng đó xuất hiện ở **ba câu lệnh trở lên**, hãy đưa nó vào bảng.

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Báo cáo xếp loại chạy ra kết quả **cả lớp Trung bình**, không một ai Giỏi. Câu lệnh không báo lỗi gì.

**Chẩn đoán trong 10 giây — mẹo "thử giá trị cao nhất":**

```sql
-- Lấy điểm CAO NHẤT bảng, xem nó được xếp loại gì
SELECT diem,
    CASE
        WHEN diem >= 5.0 THEN 'Trung bình'
        WHEN diem >= 6.5 THEN 'Khá'
        WHEN diem >= 8.0 THEN 'Giỏi'
        ELSE 'Yếu'
    END AS xep_loai
FROM bang_diem ORDER BY diem DESC LIMIT 1;
```

```text
 diem | xep_loai
------+------------
  9.8 | Trung bình     ◄── ĐIỂM CAO NHẤT MÀ RA "TRUNG BÌNH"
                            → CHẮC CHẮN XẾP NGƯỢC THỨ TỰ
```

**Cách sửa — đảo lại cho khắt khe nhất lên trên:**

```sql
CASE
    WHEN diem >= 8.0 THEN 'Giỏi'          -- ◄── sàng lỗ NHỎ NHẤT lên đầu
    WHEN diem >= 6.5 THEN 'Khá'
    WHEN diem >= 5.0 THEN 'Trung bình'
    ELSE 'Yếu'
END
```

**Chặn tái diễn — kiểm chứng bằng phân bố, không tin bằng mắt:**

```sql
-- Sau khi sửa, xem phân bố có hợp lý không
SELECT xep_loai, count(*), round(100.0*count(*)/sum(count(*)) OVER (), 1) AS phan_tram
FROM (SELECT CASE WHEN diem>=8.0 THEN 'Giỏi'
                  WHEN diem>=6.5 THEN 'Khá'
                  WHEN diem>=5.0 THEN 'Trung bình'
                  ELSE 'Yếu' END AS xep_loai
      FROM bang_diem) t
GROUP BY 1 ORDER BY 2 DESC;
```

```text
 xep_loai   | count | phan_tram
------------+-------+-----------
 Khá        |   118 |      39.3
 Trung bình |    96 |      32.0
 Giỏi       |    64 |      21.3
 Yếu        |    22 |       7.3

   ✅ Có đủ BỐN mức, phân bố hợp lý.
   ⚠ Nếu thấy MỘT mức chiếm 100% → gần như chắc chắn sai thứ tự.
   ⚠ Nếu thấy có mức = 0 → kiểm lại ngưỡng, có thể một nhánh không bao giờ tới được.
```

> **Tình huống 2:** Chạy `UPDATE` để điều chỉnh giá theo loại sản phẩm. Chạy xong, **hàng nghìn sản phẩm có giá `NULL`**.

**Chẩn đoán — xem đúng câu lệnh đã chạy:**

```sql
-- Câu lệnh đã chạy
UPDATE san_pham
SET gia = gia * CASE loai
                    WHEN 'ao'   THEN 0.9
                    WHEN 'quan' THEN 0.8
                    WHEN 'giay' THEN 0.95
                END;                    -- ◄── THIẾU `ELSE 1`
```

```text
   SẢN PHẨM LOẠI 'phu_kien' (không khớp nhánh nào):
      CASE trả về NULL
      → gia * NULL = NULL
      → GIÁ BỊ XOÁ SẠCH.

   Và câu lệnh CHẠY NGON LÀNH, không một lời cảnh báo.
```

**Đo thiệt hại:**

```sql
SELECT loai, count(*) AS so_sp_mat_gia
FROM san_pham WHERE gia IS NULL GROUP BY 1;
--  phu_kien | 3.412
--  do_bo    |   890
```

**Cách khôi phục và cách viết đúng:**

```sql
-- ① KHÔI PHỤC từ backup / bảng lịch sử giá (nếu có)
UPDATE san_pham s SET gia = h.gia
FROM lich_su_gia h
WHERE h.product_id = s.product_id AND s.gia IS NULL
  AND h.hieu_luc_den IS NULL;

-- ② VIẾT ĐÚNG: luôn có ELSE
UPDATE san_pham
SET gia = gia * CASE loai
                    WHEN 'ao'   THEN 0.9
                    WHEN 'quan' THEN 0.8
                    WHEN 'giay' THEN 0.95
                    ELSE 1                    -- ◄── giữ nguyên giá
                END;
```

**Và quy trình an toàn — xem trước khi chạy thật:**

```sql
-- ③ CHẠY THỬ bằng SELECT trước, xem CÓ dòng nào ra NULL không
SELECT loai, count(*) AS so_dong,
       count(*) FILTER (WHERE CASE loai
                                  WHEN 'ao'   THEN 0.9
                                  WHEN 'quan' THEN 0.8
                                  WHEN 'giay' THEN 0.95
                              END IS NULL) AS se_thanh_null
FROM san_pham GROUP BY 1;
--  phu_kien | 3412 | 3412    ◄── PHÁT HIỆN TRƯỚC KHI CHẠY UPDATE

-- ④ Rồi mới bọc transaction và chạy thật
BEGIN;
UPDATE san_pham SET gia = gia * CASE ... ELSE 1 END
RETURNING product_id, loai, gia;
-- đọc kết quả, khớp thì COMMIT, không khớp thì ROLLBACK
COMMIT;
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| **Sai thứ tự điều kiện** | Cả bảng nhận nhãn thấp nhất, **không báo lỗi** | Khắt khe nhất lên trên, nới dần xuống dưới |
| Quên `END` | Lỗi cú pháp | Máy báo ngay — dễ sửa |
| **Quên `ELSE`** | Nhánh còn lại thành `NULL`, **âm thầm** | Luôn viết `ELSE`, kể cả `ELSE NULL` |
| Quên `ELSE` trong `UPDATE ... SET x = x * CASE` | **Xoá sạch giá trị** vì `x * NULL = NULL` | `ELSE 1` |
| Quên `ELSE 0` trong `SUM(CASE ...)` | Tổng sai | `SUM` cần `ELSE 0`; `COUNT` thì không |
| Dùng dạng rút gọn để bắt `NULL` | Không bắt được, rơi vào `ELSE` | Dạng đầy đủ với `WHEN col IS NULL` |
| Viết thừa `AND diem < 8.0` ở cổng dưới | Rườm rà, dễ sai khi đổi ngưỡng | Điều kiện sau chỉ lo phần còn lại |
| Dùng alias của `SELECT` trong `GROUP BY` | Chạy ở MySQL, **lỗi ở SQL Server/Oracle** | Lặp lại khối `CASE`, hoặc dùng CTE, hoặc `GROUP BY 1` |
| Bọc `CASE` quanh cột trong `WHERE` | **Mất index**, quét toàn bảng | Viết điều kiện trực tiếp trên cột |
| Ngưỡng nằm cứng ở nhiều câu lệnh | Đổi quy chế phải sửa tay khắp nơi | Bảng quy chế + `JOIN` |
| Lồng `CASE` trong `CASE` nhiều tầng | Không ai đọc nổi | Tách thành CTE nhiều bước |

## Câu hỏi phỏng vấn hay gặp

**H: `CASE WHEN` hoạt động thế nào?**
Nó là một **dãy cổng xếp dọc**: hàng dữ liệu đi từ cổng trên xuống, **cổng nào cho qua trước thì nhận nhãn của cổng đó rồi rẽ ra ngoài** — các cổng còn lại nó không bao giờ nhìn thấy. `WHEN` là "khi", `THEN` là "thì", `ELSE` hứng phần còn lại, `END` đóng khối. Và nó **không sửa dữ liệu trong bảng** — chỉ tạo thêm một cột lúc lấy dữ liệu ra.

**H: Bẫy lớn nhất của `CASE WHEN` là gì?**
**Sai thứ tự điều kiện.** Nếu đặt điều kiện rộng nhất lên đầu — ví dụ `WHEN diem >= 5.0 THEN 'Trung bình'` — thì học sinh 9.0 vẫn thoả điều kiện đó và bị chộp ngay tại cổng đầu, nhận nhãn "Trung bình". Chạy hết bảng thì **cả lớp Trung bình, không một ai Giỏi** — mà câu lệnh **không sai cú pháp** nên không có lời cảnh báo nào. Luật là xếp điều kiện **khắt khe nhất lên trên**, nới rộng dần xuống dưới. Mẹo thử: lấy giá trị cao nhất chạy thử, nếu nó rơi vào mức thấp thì đã xếp ngược.

**H: Quên `END` và quên `ELSE`, cái nào nguy hiểm hơn?**
**Quên `ELSE` nguy hiểm hơn.** Quên `END` thì máy báo lỗi cú pháp ngay, bạn sửa trong 5 giây. Quên `ELSE` thì câu lệnh **chạy ngon lành**, nhánh không khớp nhận `NULL`, và bạn chỉ phát hiện khi nhìn thấy cột trống trong báo cáo. Tệ nhất là trong `UPDATE ... SET gia = gia * CASE ...` — quên `ELSE 1` thì mọi loại không khớp sẽ nhận `gia * NULL = NULL`, tức là **xoá sạch giá của chúng**.

**H: `CASE` dùng được ở những đâu ngoài `SELECT`?**
Bốn chỗ. **`ORDER BY`** để sắp xếp theo thứ tự nghiệp vụ thay vì thứ tự bảng chữ cái. **`UPDATE`** để sửa nhiều mức trong một câu thay vì ba lần quét bảng. **Trong hàm tổng hợp** để xoay bảng — `COUNT(CASE WHEN ... THEN 1 END)` biến hàng thành cột. Và **`GROUP BY`** để gom theo nhãn vừa dán, nhưng phải viết lại khối `CASE` vì `GROUP BY` chạy trước `SELECT` nên alias chưa tồn tại.

**H: Nhược điểm của `CASE WHEN` là gì?**
Các ngưỡng **nằm cứng trong câu lệnh** chứ không nằm trong dữ liệu. Sang năm đổi quy chế là phải mở lại từng câu lệnh có `CASE` để sửa tay, và chỗ nào quên thì báo cáo đó sai âm thầm. Cách bài bản là đưa ngưỡng vào một **bảng quy chế** rồi `JOIN` với điều kiện khoảng — lúc đó đổi quy chế chỉ là sửa một dòng dữ liệu, và có thêm cột hiệu lực để **báo cáo cũ vẫn dùng đúng quy chế cũ**. Ngưỡng để chuyển: khi cùng bộ ngưỡng xuất hiện ở **ba câu lệnh trở lên**.

## Tóm tắt bài 6

- `CASE WHEN` là **dãy cổng xếp dọc** — gặp điều kiện đúng đầu tiên là **dừng**, không đi tiếp. Một hàng, một nhãn.
- Nó **không sửa dữ liệu trong bảng**, chỉ tạo cột ngay lúc lấy dữ liệu ra.
- **Bẫy lớn nhất là sai thứ tự** — cái sàng lỗ to đặt lên đầu thì hứng sạch. Xếp **khắt khe nhất lên trên**.
- **Quên `ELSE` nguy hiểm hơn quên `END`** — một cái báo lỗi ngay, một cái âm thầm cho `NULL`.
- Dạng rút gọn (`CASE col WHEN ...`) chỉ so bằng và **không bắt được `NULL`**.
- Ba bước tạo báo cáo: **dán nhãn** (`CASE`) → **gom nhóm** (`GROUP BY`) → **đếm** (`COUNT`).
- `CASE` còn dùng được trong **`ORDER BY`**, **`UPDATE`**, và **hàm tổng hợp** (xoay bảng). Nhớ: `SUM` cần `ELSE 0`, `COUNT` thì không.
- Ngưỡng **nằm cứng trong code** là nợ kỹ thuật — dùng ở ba chỗ trở lên thì chuyển sang **bảng quy chế + `JOIN`**.

**Bài kế tiếp** → [Phase 2, Bài 1: Subquery toàn tập](../phase-2/01-subquery-toan-tap.md)

# Bài 2: Row-Based vs Column-Based — cùng một bảng, hai cách xếp byte

Cùng một bảng nhân viên. Cùng ba câu truy vấn. Chỉ khác **thứ tự các byte nằm trên đĩa**.

Kết quả: một câu chạy nhanh gấp **8 lần**, một câu chạy chậm gấp **8 lần**, một câu gần như bằng nhau.

Bài này cho thấy chính xác vì sao — và sau khi hiểu, bạn sẽ biết vì sao không ai chạy báo cáo phân tích trên chính database của ứng dụng, và vì sao `SELECT *` trong một hệ phân tích là hành động phá hoại.

## Ba câu truy vấn dùng để so sánh

Bảng nhân viên, 8 dòng cho dễ vẽ (thực tế là hàng triệu):

```text
 row_id │ id │first_name│last_name│   ssn   │ salary │    dob     │  title   │ join_date
────────┼────┼──────────┼─────────┼─────────┼────────┼────────────┼──────────┼───────────
  1001  │  1 │ John     │ Smith   │ 111-11  │ 101000 │ 1990-01-02 │ Engineer │ 2015-03-01
  1002  │  2 │ Melissa  │ Brown   │ 222-22  │ 102000 │ 1988-11-30 │ Manager  │ 2016-07-12
  1003  │  3 │ Rick     │ Jones   │ 333-33  │ 103000 │ 1995-06-15 │ Engineer │ 2018-01-05
  1004  │  4 │ Paul     │ Davis   │ 444-44  │ 104000 │ 1992-09-21 │ Analyst  │ 2019-11-30
  1005  │  5 │ Hussein  │ Nasser  │ 555-55  │ 105000 │ 1985-04-08 │ Engineer │ 2012-05-20
  1006  │  6 │ Anna     │ Wilson  │ 666-66  │ 106000 │ 1991-12-01 │ Manager  │ 2017-02-14
  1007  │  7 │ David    │ Lee     │ 777-77  │ 107000 │ 1993-08-19 │ Analyst  │ 2020-06-01
  1008  │  8 │ Sarah    │ Kim     │ 888-88  │ 108000 │ 1989-03-27 │ Engineer │ 2014-09-09
```

Ba câu truy vấn, cố tình chọn ba hình dạng rất khác nhau:

```sql
-- Q1: TÌM MỘT DÒNG THEO ĐIỀU KIỆN, LẤY MỘT CỘT
SELECT first_name FROM employees WHERE ssn = '666-66';

-- Q2: TÌM MỘT DÒNG, LẤY MỌI CỘT
SELECT * FROM employees WHERE id = 1;

-- Q3: TỔNG HỢP MỘT CỘT TRÊN TOÀN BẢNG
SELECT SUM(salary) FROM employees;
```

Giả định để so sánh cho công bằng: **không có index nào**. Ta chỉ so cách sắp xếp byte, không so cấu trúc tìm kiếm phụ.

---

## Cách 1 — Row store: các cột của một dòng nằm cạnh nhau

Đây là cách PostgreSQL, MySQL, Oracle, SQL Server mặc định dùng. Trên đĩa, các byte xếp như sau:

```text
   MỖI Ô XÁM = MỘT BLOCK. MỘT LẦN I/O = MỘT BLOCK.
   (ở đây giả sử 2 dòng vừa một block)

   ┌─ BLOCK 1 ──────────────────────────────────────────────────────────┐
   │ 1001│1│John   │Smith │111-11│101000│1990-01-02│Engineer│2015-03-01 ┃│
   │ 1002│2│Melissa│Brown │222-22│102000│1988-11-30│Manager │2016-07-12 ┃│
   └────────────────────────────────────────────────────────────────────┘
   ┌─ BLOCK 2 ──────────────────────────────────────────────────────────┐
   │ 1003│3│Rick   │Jones │333-33│103000│1995-06-15│Engineer│2018-01-05 ┃│
   │ 1004│4│Paul   │Davis │444-44│104000│1992-09-21│Analyst │2019-11-30 ┃│
   └────────────────────────────────────────────────────────────────────┘
   ┌─ BLOCK 3 ──────────────────────────────────────────────────────────┐
   │ 1005│5│Hussein│Nasser│555-55│105000│1985-04-08│Engineer│2012-05-20 ┃│
   │ 1006│6│Anna   │Wilson│666-66│106000│1991-12-01│Manager │2017-02-14 ┃│
   └────────────────────────────────────────────────────────────────────┘
   ┌─ BLOCK 4 ──────────────────────────────────────────────────────────┐
   │ 1007│7│David  │Lee   │777-77│107000│1993-08-19│Analyst │2020-06-01 ┃│
   │ 1008│8│Sarah  │Kim   │888-88│108000│1989-03-27│Engineer│2014-09-09 ┃│
   └────────────────────────────────────────────────────────────────────┘

   Ký hiệu ┃ chỉ để phân biệt dòng — trên đĩa không có ký tự nào cả,
   chỉ là các byte nằm liền nhau.
```

Điểm cốt lõi: **mọi cột của một nhân viên nằm sát nhau**. Đọc được một dòng là có luôn cả 9 cột.

### Q1 trên row store — tìm theo SSN

```text
   SELECT first_name FROM employees WHERE ssn = '666-66';

   Block 1 → đọc → ssn ở đây: 111-11, 222-22  → không khớp
   Block 2 → đọc → ssn ở đây: 333-33, 444-44  → không khớp
   Block 3 → đọc → ssn ở đây: 555-55, 666-66  → TÌM THẤY ✔
                   và first_name = 'Anna' ĐÃ NẰM SẴN TRONG RAM
                   → lấy luôn, KHÔNG cần I/O thêm

   TỔNG: 3 lần I/O
```

Điểm mạnh của row store lộ ra ở dòng cuối: **tìm được dòng rồi thì mọi cột khác miễn phí**. Chúng đã ở trong RAM.

### Q2 trên row store — lấy mọi cột của một dòng

```text
   SELECT * FROM employees WHERE id = 1;

   Block 1 → đọc → id 1 nằm đây → lấy TOÀN BỘ 9 cột từ RAM

   TỔNG: 1 lần I/O
```

Đây là kịch bản **tốt nhất có thể** của row store, và cũng chính là hình dạng của 95% truy vấn trong ứng dụng web: *"lấy hồ sơ của một người dùng"*, *"lấy chi tiết một đơn hàng"*.

### Q3 trên row store — tổng hợp một cột

```text
   SELECT SUM(salary) FROM employees;

   Block 1 → đọc → lấy 101000, 102000 → cộng
             VỨT ĐI: id, first_name, last_name, ssn, dob, title, join_date
   Block 2 → đọc → lấy 103000, 104000 → cộng    (lại vứt 7 cột)
   Block 3 → đọc → lấy 105000, 106000 → cộng    (lại vứt 7 cột)
   Block 4 → đọc → lấy 107000, 108000 → cộng    (lại vứt 7 cột)

   TỔNG: 4 lần I/O (toàn bộ bảng)

   TỈ LỆ HỮU ÍCH:  đọc 9 cột, dùng 1 cột  →  ~11%
                   → 89% băng thông đĩa BỊ LÃNG PHÍ
```

Trên bảng 8 dòng thì không sao. Trên bảng **500 triệu dòng** thì con số 89% lãng phí kia là hàng trăm gigabyte đọc vô ích cho mỗi lần chạy báo cáo.

---

## Cách 2 — Column store: các giá trị của một cột nằm cạnh nhau

Đây là cách ClickHouse, Amazon Redshift, Google BigQuery, Snowflake, Apache Parquet dùng. Cùng dữ liệu đó, xếp lại:

```text
   ┌─ CỘT id ────────────────┐  ┌─ CỘT first_name ─────────────┐
   │ B1: 1001│1  1002│2      │  │ B1: 1001│John   1002│Melissa │
   │     1003│3  1004│4      │  │     1003│Rick   1004│Paul    │
   │ B2: 1005│5  1006│6      │  │ B2: 1005│Hussein 1006│Anna   │
   │     1007│7  1008│8      │  │     1007│David  1008│Sarah   │
   └─────────────────────────┘  └──────────────────────────────┘

   ┌─ CỘT ssn ───────────────┐  ┌─ CỘT salary ─────────────────┐
   │ B1: 1001│111-11 ...     │  │ B1: 1001│101000 1002│102000  │
   │     1004│444-44         │  │     1003│103000 1004│104000  │
   │ B2: 1005│555-55         │  │     1005│105000 1006│106000  │
   │     1006│666-66 ...     │  │     1007│107000 1008│108000  │
   └─────────────────────────┘  └──────────────────────────────┘

   ... và tương tự cho last_name, dob, title, join_date
```

Chú ý điều quan trọng nhất: **`row_id` bị lặp lại trong MỌI cột**. Đó là cách duy nhất để ráp các mảnh lại thành một dòng. Và nó chính là nguồn gốc của mọi điểm yếu của column store — sẽ thấy ngay ở Q2.

### Q1 trên column store — tìm theo SSN

```text
   SELECT first_name FROM employees WHERE ssn = '666-66';

   Bước 1 — chỉ quét cột ssn (không đụng 8 cột kia):
       ssn block 1 → 111-11, 222-22, 333-33, 444-44 → không có
       ssn block 2 → 555-55, 666-66                 → TÌM THẤY, row_id = 1006

   Bước 2 — nhảy sang cột first_name lấy đúng row_id 1006:
       first_name block 2 → 'Anna'      (không cần đọc block 1)

   TỔNG: 3 lần I/O
```

Bằng row store trong ví dụ nhỏ này. Nhưng chú ý: bước 1 chỉ quét **cột `ssn`**, không phải cả bảng. Trên bảng thật với 50 cột, bước quét đó rẻ hơn row store **khoảng 50 lần**.

### Q2 trên column store — thảm hoạ

```text
   SELECT * FROM employees WHERE id = 1;

   Bước 1 — quét cột id:  id block 1 → tìm thấy id=1, row_id = 1001

   Bước 2 — bây giờ phải đi NHẶT từng cột về:
       nhảy sang cột first_name, đọc block chứa 1001   → I/O
       nhảy sang cột last_name,  đọc block chứa 1001   → I/O
       nhảy sang cột ssn,        đọc block chứa 1001   → I/O
       nhảy sang cột salary,     đọc block chứa 1001   → I/O
       nhảy sang cột dob,        đọc block chứa 1001   → I/O
       nhảy sang cột title,      đọc block chứa 1001   → I/O
       nhảy sang cột join_date,  đọc block chứa 1001   → I/O

   TỔNG: 1 + 8 = 9 lần I/O  (row store chỉ tốn 1)
   Và cả 8 lần nhảy đó là I/O NGẪU NHIÊN, rải khắp đĩa.
```

```text
                    ROW STORE        COLUMN STORE
   Q2 (SELECT *)  :    1 I/O    vs      9 I/O      → CHẬM GẤP 9 LẦN
```

Với bảng 50 cột, `SELECT *` trên column store tốn **51 lần nhảy** cho một dòng. Đây là lý do câu cảnh báo *"đừng bao giờ `SELECT *` trên database phân tích"* nghiêm túc hơn nhiều so với trên database thường.

### Q3 trên column store — chỗ nó toả sáng

```text
   SELECT SUM(salary) FROM employees;

   Chỉ đọc cột salary. Không đụng 8 cột kia.
       salary block 1 → 101000, 102000, 103000, 104000, ... → cộng dồn

   TỔNG: 1 lần I/O

   TỈ LỆ HỮU ÍCH: đọc 1 cột, dùng 1 cột  →  100%
```

```text
                    ROW STORE        COLUMN STORE
   Q3 (SUM)       :    4 I/O    vs      1 I/O      → NHANH GẤP 4 LẦN
```

Và trên bảng thật 50 cột thì tỉ lệ không phải 4 lần — nó là **50 lần**, cộng thêm lợi ích nén ở phần sau.

---

## Ba câu truy vấn, hai kho lưu trữ, một bảng tổng kết

| | Row store | Column store | Ai thắng |
|---|---|---|---|
| **Q1** — lọc 1 điều kiện, lấy 1 cột | 3 I/O | 3 I/O | Hoà (nhưng column thắng khi bảng nhiều cột) |
| **Q2** — `SELECT *` một dòng | **1 I/O** | 9 I/O | **Row, cách biệt lớn** |
| **Q3** — tổng hợp 1 cột toàn bảng | 4 I/O | **1 I/O** | **Column, cách biệt lớn** |

Nguyên tắc rút ra, và nó gọn đến bất ngờ:

> **Xếp cạnh nhau thứ mà bạn hay đọc cùng nhau.**
>
> Hay đọc *cả một dòng* → xếp theo dòng.
> Hay đọc *cả một cột* → xếp theo cột.

---

## Nén — vũ khí thật sự của column store

Ba lần I/O ở trên mới chỉ là một nửa câu chuyện. Nửa còn lại quan trọng hơn.

Trong column store, **các giá trị nằm cạnh nhau đều cùng một cột**, nghĩa là cùng kiểu dữ liệu và thường rất giống nhau. Đó là điều kiện lý tưởng cho thuật toán nén:

```text
   ROW STORE — các byte cạnh nhau rất khác nhau
   ═══════════════════════════════════════════════
   1001│1│John│Smith│111-11│101000│1990-01-02│Engineer│2015-03-01
        ↑    ↑     ↑      ↑       ↑          ↑        ↑
      số  chuỗi chuỗi  chuỗi     số        ngày    chuỗi
   → Thuật toán nén gần như không tìm được mẫu lặp
   → Tỉ lệ nén điển hình: 2-3 lần

   COLUMN STORE — các byte cạnh nhau rất giống nhau
   ═══════════════════════════════════════════════
   Cột title:  Engineer, Manager, Engineer, Analyst, Engineer, Manager,
               Analyst, Engineer, Engineer, Engineer, Engineer ...
   → Chỉ có 3 giá trị khác nhau lặp đi lặp lại
   → Tỉ lệ nén điển hình: 10-30 lần
```

Bốn kỹ thuật nén mà column store dùng, và mỗi cái đều **chỉ khả thi khi dữ liệu xếp theo cột**:

| Kỹ thuật | Cách làm | Hợp với cột nào | Ví dụ |
|---|---|---|---|
| **Run-Length Encoding** | Thay chuỗi lặp bằng "giá trị × số lần" | Ít giá trị khác nhau, đã sắp xếp | `Engineer,Engineer,Engineer` → `Engineer×3` |
| **Dictionary** | Thay giá trị bằng số nhỏ, giữ bảng tra riêng | Chuỗi lặp nhiều | `Engineer`→`1`, `Manager`→`2` (8 byte → 1 byte) |
| **Delta** | Chỉ lưu phần chênh so với giá trị trước | Số tăng dần, ngày tháng | `101000,102000,103000` → `101000,+1000,+1000` |
| **Bit-packing** | Dùng đúng số bit cần thiết | Số trong khoảng hẹp | Tuổi 0-127 → 7 bit thay vì 32 bit |

Hiệu ứng cộng dồn rất lớn:

```text
   BẢNG 500 TRIỆU DÒNG, 50 CỘT — chạy SELECT SUM(salary)

   ROW STORE                          COLUMN STORE
   ─────────────                      ──────────────
   Phải đọc: toàn bộ bảng             Phải đọc: chỉ cột salary
             = 200 GB                           = 4 GB
   Nén 2 lần → 100 GB thật đọc        Nén 10 lần → 400 MB thật đọc
                                       ─────────────────────────────
   Ở tốc độ 1 GB/s:  100 giây         Ở tốc độ 1 GB/s:  0,4 giây
                                                        → 250 LẦN
```

Con số 250 lần này không phải phóng đại — đó là khoảng cách thật giữa chạy một báo cáo trên PostgreSQL và chạy nó trên ClickHouse.

Điều thú vị: PostgreSQL cũng mượn ý tưởng này. Từ phiên bản 13, index B-Tree có **deduplication** — gộp các khoá trùng nhau ở nút lá lại thành một mục kèm danh sách con trỏ. Đó chính là dictionary encoding thu nhỏ, áp cho index.

---

## Cái giá của column store: ghi

Mọi thứ trên đều nói về đọc. Ghi thì ngược lại hoàn toàn.

```text
   THÊM MỘT NHÂN VIÊN MỚI

   ROW STORE                          COLUMN STORE
   ─────────────                      ──────────────
   Ghi 1 dòng vào 1 block             Phải ghi vào 9 cấu trúc khác nhau:
   → 1 lần ghi                          cột id        → 1 lần ghi
                                        cột first_name→ 1 lần ghi
                                        cột last_name → 1 lần ghi
                                        cột ssn       → 1 lần ghi
                                        cột salary    → 1 lần ghi
                                        cột dob       → 1 lần ghi
                                        cột title     → 1 lần ghi
                                        cột join_date → 1 lần ghi
                                      → 8-9 lần ghi, rải rác
                                      → và làm HỎNG các khối đã nén
```

Dòng cuối là chỗ đau nhất: chèn một dòng vào giữa một khối đã nén bằng RLE nghĩa là phải **giải nén, chèn, nén lại**. Đây là lý do column store gần như không bao giờ cho sửa từng dòng — chúng thiết kế cho **nạp theo lô** (ClickHouse khuyến nghị chèn theo lô hàng nghìn dòng, không chèn lẻ).

Xoá một dòng cũng đau tương tự: phải đánh dấu ở cả 9 cấu trúc.

---

## OLTP vs OLAP — hai thế giới, hai kho lưu trữ

Sự phân đôi này là lý do tồn tại của cả hai kiểu:

| | **OLTP** (giao dịch trực tuyến) | **OLAP** (phân tích trực tuyến) |
|---|---|---|
| Tên đầy đủ | Online Transaction Processing | Online Analytical Processing |
| Câu hỏi điển hình | "Đơn hàng #12345 có gì?" | "Doanh thu theo tỉnh 3 năm qua?" |
| Chạm bao nhiêu dòng | 1 tới vài chục | Hàng triệu tới hàng tỷ |
| Chạm bao nhiêu cột | Gần như **tất cả** | 2-5 cột trong số hàng chục |
| Tỉ lệ đọc/ghi | Ghi nhiều, liên tục, lẻ tẻ | Gần như chỉ đọc; nạp theo lô |
| Yêu cầu độ trễ | Mili-giây | Giây tới phút là chấp nhận được |
| **Kho phù hợp** | **Row store** | **Column store** |
| Ví dụ hệ | PostgreSQL, MySQL, Oracle | ClickHouse, Redshift, BigQuery, Snowflake, DuckDB |

### Vì sao không nên chạy báo cáo trên database ứng dụng

Ghép hai điều đã học sẽ ra một kết luận rất thực dụng:

```text
   Database ứng dụng của bạn là ROW STORE, tối ưu cho OLTP.

   Chạy một câu báo cáo OLAP lên nó:
     → quét toàn bảng (hàng chục GB)
     → đẩy MỌI page nóng ra khỏi buffer pool     ← đây mới là vấn đề thật
     → mọi truy vấn OLTP đang chạy bỗng nhiên cache miss
     → cả hệ thống chậm đi trong 10 phút, dù báo cáo chỉ chạy 30 giây

   Đây gọi là "ô nhiễm buffer pool" (buffer pool pollution).
```

Ba cách xử lý, từ rẻ tới đắt:

1. Chạy báo cáo trên **replica đọc** — báo cáo làm bẩn cache của replica, không đụng primary.
2. Bảng tổng hợp / **materialized view** — tính trước theo lịch, báo cáo chỉ đọc kết quả.
3. **Kho dữ liệu riêng** dạng cột — sao chép định kỳ sang ClickHouse/BigQuery.

---

## Ranh giới đang mờ đi

Phân đôi "row cho OLTP, column cho OLAP" đúng, nhưng ngành đang tiến tới các hệ lai:

| Hướng | Là gì | Ví dụ |
|---|---|---|
| **Extension cột cho hệ row** | Gắn thêm khả năng lưu cột vào database quan hệ | `citus columnar` cho PostgreSQL, Hydra |
| **Bộ tăng tốc trong bộ nhớ** | Giữ thêm một bản sao dạng cột trong RAM để chạy phân tích | MySQL HeatWave, SQL Server Columnstore Index |
| **Định dạng file cột** | Không phải database, chỉ là định dạng lưu trữ | Apache Parquet, ORC — nền của gần như mọi data lake |
| **HTAP** | Một hệ phục vụ cả hai loại tải | TiDB, SingleStore |
| **Cột nhúng** | Thư viện cột chạy ngay trong tiến trình ứng dụng | DuckDB — "SQLite của phân tích" |

Xu hướng thực dụng nhất hiện nay: giữ PostgreSQL/MySQL cho nghiệp vụ, xuất dữ liệu sang **Parquet** trên object storage, rồi truy vấn bằng **DuckDB** hoặc một engine phân tích. Rẻ hơn nhiều so với dựng cả một kho dữ liệu.

### Phân mảnh dọc — column store của nhà nghèo

Nếu chưa cần đến kho dữ liệu riêng, có một kỹ thuật đơn giản áp dụng được ngay trong database quan hệ: **tách cột ít dùng nhưng nặng ra bảng riêng**.

```sql
-- TRƯỚC: một bảng, cột `bio` rất nặng nhưng hiếm khi cần
CREATE TABLE users (
    id       BIGINT PRIMARY KEY,
    email    TEXT,
    name     TEXT,
    bio      TEXT           -- trung bình 4 KB, chỉ dùng ở trang hồ sơ
);

-- SAU: tách ra
CREATE TABLE users (
    id    BIGINT PRIMARY KEY,
    email TEXT,
    name  TEXT
);
CREATE TABLE user_bios (
    user_id BIGINT PRIMARY KEY REFERENCES users(id),
    bio     TEXT
);
```

Vì sao có tác dụng: cột `bio` nặng làm **giảm số dòng vừa một page**. Tách nó ra khiến bảng `users` gọn lại, nhiều dòng hơn trên mỗi page, và mọi truy vấn danh sách đọc ít page hơn hẳn.

```text
   TRƯỚC: dòng ~4.100 byte  →  ~2 dòng/page   →  1 triệu dòng = 500.000 page
   SAU  : dòng ~100 byte    →  ~64 dòng/page  →  1 triệu dòng =  15.600 page
                                                  → giảm 32 LẦN
```

> PostgreSQL đã tự làm một phần việc này bằng cơ chế **TOAST**: giá trị quá lớn (mặc định > ~2 KB) tự động được đẩy sang một bảng phụ, chỉ để lại con trỏ. Nhưng tách tay vẫn hiệu quả hơn khi bạn biết rõ cột nào hiếm dùng.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| `SELECT *` trên database cột | Mỗi cột là một lần nhảy I/O; 50 cột = 51 lần nhảy cho một dòng | Liệt kê đúng cột cần |
| Chèn từng dòng vào database cột | Phải ghi vào N cấu trúc và phá vỡ khối đã nén | Nạp theo lô hàng nghìn dòng |
| Chạy báo cáo phân tích trên database ứng dụng | Đẩy hết page nóng ra khỏi cache, làm chậm cả hệ trong nhiều phút | Replica đọc, bảng tổng hợp, hoặc kho dữ liệu riêng |
| Chọn database cột cho ứng dụng web | Mỗi lần lấy hồ sơ người dùng là một loạt lần nhảy | Row store cho OLTP, không bàn cãi |
| Nghĩ "cột luôn nhanh hơn" | Chỉ nhanh hơn khi **chạm ít cột trên nhiều dòng** | So theo hình dạng truy vấn thật của bạn |
| Để cột TEXT nặng chung bảng nóng | Giảm số dòng mỗi page → mọi truy vấn danh sách chậm đi | Tách bảng, hoặc để TOAST làm việc |
| Nghĩ chỉ cần đổi sang cột là xong | Column store hầu như không hỗ trợ `UPDATE`/`DELETE` lẻ, không có ràng buộc khoá ngoại | Dùng nó như kho phân tích, không phải nguồn sự thật |

## Tóm tắt bài 2

- Khác biệt duy nhất giữa row store và column store là **thứ tự các byte trên đĩa** — nhưng nó thay đổi hiệu năng theo cả hai chiều, mỗi chiều hàng chục lần.
- Nguyên tắc gốc: **xếp cạnh nhau thứ hay được đọc cùng nhau.**
- Trên ba câu truy vấn mẫu: `SELECT *` một dòng — row thắng **9 lần**; `SUM` một cột — column thắng **4 lần** (và tới 250 lần trên bảng thật khi tính cả nén).
- Column store nén tốt gấp **5-10 lần** row store, vì các giá trị cạnh nhau cùng kiểu và hay lặp — cho phép RLE, dictionary, delta, bit-packing.
- Cái giá của column store là **ghi**: một dòng mới phải ghi vào N cấu trúc và phá vỡ các khối đã nén. Vì thế chúng đòi nạp theo lô.
- **OLTP → row store. OLAP → column store.** Chạy truy vấn OLAP trên database OLTP không chỉ chậm — nó còn **làm bẩn buffer pool** và kéo cả hệ thống xuống trong nhiều phút.
- Ranh giới đang mờ: extension cột, HTAP, Parquet + DuckDB. Và **phân mảnh dọc** là cách rẻ nhất để hưởng một phần lợi ích ngay trong database quan hệ.

**Bài kế tiếp** → [Bài 3: Primary Key vs Secondary Key](03-primary-key-vs-secondary-key.md)

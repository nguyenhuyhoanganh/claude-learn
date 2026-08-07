# Bài 3: Primary Key vs Secondary Key — điều bạn chưa biết về hai chữ "khoá chính"

Hỏi mười người "primary key là gì", chín người trả lời: *"cột định danh duy nhất cho mỗi dòng, không trùng, không rỗng."*

Câu đó đúng. Nhưng nó chỉ là **một phần nhỏ** của sự thật, và là phần ít quan trọng nhất về mặt hiệu năng.

Trên MySQL InnoDB, khai báo primary key còn có nghĩa: *"toàn bộ bảng này sẽ được **sắp xếp vật lý** theo cột đó trên đĩa."* Đó là một quyết định kiến trúc lớn hơn nhiều so với "không cho trùng" — và chọn sai cột có thể làm tốc độ chèn giảm hàng chục lần.

Bài này bóc tách những gì hai chữ "khoá chính" thật sự hàm ý, và vì sao câu trả lời khác nhau tuỳ hệ bạn đang dùng.

## Ba khái niệm hay bị gộp làm một

```text
   ┌──────────────────────────────────────────────────────────────────┐
   │ 1. PRIMARY KEY — một RÀNG BUỘC LOGIC                             │
   │    "Cột này không trùng, không rỗng, và là định danh của dòng."   │
   │    Đây là khái niệm của mô hình quan hệ. Không nói gì về đĩa.     │
   ├──────────────────────────────────────────────────────────────────┤
   │ 2. PRIMARY INDEX — một CẤU TRÚC TÌM KIẾM                          │
   │    Cây B+Tree được tạo ra để thực thi ràng buộc trên.             │
   ├──────────────────────────────────────────────────────────────────┤
   │ 3. CLUSTERED INDEX — một CÁCH SẮP XẾP VẬT LÝ                     │
   │    "Dữ liệu thật của bảng nằm luôn trong cây, xếp theo thứ tự."   │
   │    ĐÂY mới là thứ quyết định hiệu năng.                           │
   └──────────────────────────────────────────────────────────────────┘
```

Vấn đề: **mỗi hệ ghép ba khái niệm này lại theo cách khác nhau.**

| Hệ | Khai `PRIMARY KEY` thì được gì |
|---|---|
| **MySQL InnoDB** | Cả ba. Bảng **bắt buộc** được sắp xếp vật lý theo primary key |
| **PostgreSQL** | Chỉ (1) và (2). Bảng vẫn là **heap lộn xộn**, không sắp gì cả |
| **Oracle** | Mặc định (1) và (2); muốn (3) phải khai `ORGANIZATION INDEX` |
| **SQL Server** | Mặc định cả ba; đổi được bằng `NONCLUSTERED` |

Nói cách khác: **cùng một câu `CREATE TABLE`, PostgreSQL và MySQL cho ra hai cấu trúc đĩa hoàn toàn khác nhau.** Đây là gốc rễ của rất nhiều tranh cãi "Postgres nhanh hơn hay MySQL nhanh hơn" — hai bên đang so hai thứ khác nhau.

---

## Heap organized table — bảng lộn xộn

Đây là cách PostgreSQL luôn làm. Không có thứ tự nào được duy trì:

```text
   CHÈN LẦN LƯỢT: 7, 1, 2

   INSERT 7:   ┌──────────────────┐
               │ 7 │ An   │ 15000 │  ← nhét vào chỗ trống đầu tiên
               │                  │
               └──────────────────┘

   INSERT 1:   ┌──────────────────┐
               │ 7 │ An   │ 15000 │
               │ 1 │ Binh │ 22000 │  ← nhét ngay sau, KHÔNG quan tâm thứ tự
               └──────────────────┘

   INSERT 2:   ┌──────────────────┐
               │ 7 │ An   │ 15000 │
               │ 1 │ Binh │ 22000 │
               │ 2 │ Chi  │ 18000 │  ← lại nhét tiếp
               └──────────────────┘

   Thứ tự vật lý: 7, 1, 2.   Hoàn toàn không liên quan tới giá trị khoá.
```

Kiểm chứng trên PostgreSQL:

```sql
CREATE TABLE demo_heap (id INT PRIMARY KEY, name TEXT);
INSERT INTO demo_heap VALUES (7, 'An'), (1, 'Binh'), (2, 'Chi');
SELECT ctid, id, name FROM demo_heap;
```

```text
 ctid  | id | name
-------+----+------
 (0,1) |  7 | An
 (0,2) |  1 | Binh
 (0,3) |  2 | Chi
```

Dòng `id = 7` nằm ở khe 1, `id = 1` nằm ở khe 2. **Có `PRIMARY KEY` nhưng bảng vẫn lộn xộn.** Primary key chỉ tạo ra một cây B+Tree riêng bên cạnh, trỏ về các `ctid` này.

**Ưu điểm:** chèn cực nhanh — luôn là "nhét vào chỗ trống gần nhất", không phải dịch chuyển gì.

**Nhược điểm:** muốn đọc theo thứ tự khoá thì phải nhảy cóc khắp đĩa.

---

## Index organized table — bảng được sắp xếp

Đây là cách MySQL InnoDB luôn làm. Bảng **chính là** cây B+Tree, dữ liệu nằm ở lá, xếp theo thứ tự khoá:

```text
   CHÈN LẦN LƯỢT: 1, 8, 2

   INSERT 1:   ┌──────────────────┐
               │ 1 │ An   │ 15000 │
               │                  │
               │                  │
               └──────────────────┘

   INSERT 8:   ┌──────────────────┐
               │ 1 │ An   │ 15000 │
               │ 8 │ Binh │ 22000 │  ← 8 > 1, xếp ngay sau, vẫn đúng thứ tự
               │                  │
               └──────────────────┘

   INSERT 2:   ┌──────────────────┐
               │ 1 │ An   │ 15000 │
               │ 2 │ Chi  │ 18000 │  ← PHẢI CHÈN VÀO GIỮA
               │ 8 │ Binh │ 22000 │  ← 8 bị ĐẨY XUỐNG
               └──────────────────┘

   Thứ tự vật lý: 1, 2, 8.   Luôn khớp thứ tự khoá.
```

Bước cuối là chỗ phát sinh chi phí. Database không thật sự "đẩy" từng byte — nó để sẵn khoảng trống trong page. Nhưng khi page hết khoảng trống thì xảy ra chuyện tệ hơn: **tách page** (*page split*).

```text
   PAGE ĐẦY, PHẢI CHÈN VÀO GIỮA → TÁCH PAGE

   TRƯỚC                          SAU
   ┌──────────────┐               ┌──────────────┐   ┌──────────────┐
   │ 1  2  3  4   │               │ 1  2  _  _   │   │ 3  4  _  _   │
   │ 5  6  7  8   │  chèn 3,5  →  │ 3  5  _  _   │   │ 6  7  8  _   │
   └──────────────┘               └──────────────┘   └──────────────┘
     1 page, đầy 100%               2 page, mỗi cái đầy ~50%

   HẬU QUẢ:
     • Một lần ghi biến thành: đọc page + cấp page mới + chép nửa dữ liệu
       + sửa nút cha + có thể làm nút cha đầy → tách tiếp lên trên
     • Bảng phình gần GẤP ĐÔI (các page chỉ đầy nửa)
     • Dữ liệu logic liền nhau nay nằm rải rác vật lý
```

### `fillfactor` — chừa chỗ trước cho khỏi tách

Cách giảm nhẹ: cố tình **không lấp đầy page** khi tạo, để dành chỗ cho những lần chèn/cập nhật sau.

```sql
-- PostgreSQL: mặc định bảng 100, index 90
CREATE TABLE t (...) WITH (fillfactor = 80);
ALTER INDEX idx_x SET (fillfactor = 70);

-- MySQL InnoDB: MERGE_THRESHOLD, và innodb_fill_factor cho lúc dựng index
```

Đánh đổi:

| `fillfactor` cao (95-100) | `fillfactor` thấp (70-80) |
|---|---|
| Ít page hơn → quét nhanh hơn | Nhiều page hơn → quét chậm hơn |
| Tách page thường xuyên khi có chèn/cập nhật | Ít tách page |
| Hợp với bảng **chỉ đọc** hoặc chỉ nối thêm | Hợp với bảng **cập nhật nhiều** |

Với PostgreSQL, `fillfactor` thấp còn có tác dụng phụ rất đáng giá: tăng tỉ lệ **HOT update** (phiên bản mới nằm cùng page → không phải cập nhật index) — xem [bài 1](01-page-heap-va-io.md).

---

## Vì sao clustered index thắng lớn ở truy vấn khoảng

Đây là phần thưởng cho toàn bộ chi phí sắp xếp ở trên:

```sql
SELECT * FROM employees WHERE id BETWEEN 1 AND 9;
```

```text
   CLUSTERED (InnoDB)                    HEAP (PostgreSQL)
   ══════════════════                    ══════════════════
   Cây index                             Cây index          Heap
   ┌──────────┐                          ┌──────────┐   ┌──────────────┐
   │ ...      │                          │ 1 → (7,3)│   │page 0: 45,12 │
   └────┬─────┘                          │ 2 → (0,9)│   │page 1: 88,3  │
        ▼                                │ 3 → (1,2)│   │page 2: 7,91  │
   ┌──────────────────────┐              │ ...      │   │  ...         │
   │ LÁ: 1,2,3,4,5,6,7,8,9│              └────┬─────┘   └──────────────┘
   │ (kèm luôn dữ liệu)   │                   │
   └──────────────────────┘                   └─▶ nhảy tới page 7
                                               ─▶ nhảy tới page 0
   → Chúng nằm LIỀN NHAU                       ─▶ nhảy tới page 1
   → 1-2 lần I/O TUẦN TỰ                       ─▶ ... 9 lần nhảy
                                               → 9 lần I/O NGẪU NHIÊN
```

Con số thực tế trên bảng lớn: truy vấn khoảng theo primary key trên InnoDB có thể nhanh hơn **5-20 lần** so với PostgreSQL heap — với điều kiện lấy nhiều dòng liên tiếp.

Đây là lý do các bảng dạng nhật ký, dữ liệu chuỗi thời gian, tin nhắn theo cuộc trò chuyện rất hợp với clustered index: bạn gần như luôn hỏi *"cho tôi các dòng trong khoảng này"*.

### PostgreSQL: sắp xếp một lần bằng `CLUSTER`

PostgreSQL không có clustered index thật, nhưng có một lệnh sắp xếp lại bảng **một lần**:

```sql
CLUSTER employees USING employees_pkey;
ANALYZE employees;
```

Điểm mấu chốt: **thứ tự này không được duy trì.** Dòng chèn sau đó lại nhét vào chỗ trống bất kỳ. Muốn giữ thứ tự phải chạy lại `CLUSTER` định kỳ — và lệnh này **khoá toàn bảng** (`ACCESS EXCLUSIVE`), không dùng được giờ cao điểm.

Đo mức độ "còn sắp xếp" của bảng bằng chỉ số tương quan:

```sql
SELECT attname, correlation
FROM pg_stats
WHERE tablename = 'employees' AND attname = 'id';
```

```text
 attname | correlation
---------+-------------
 id      |        0.97
```

| `correlation` | Nghĩa |
|---|---|
| Gần **1,0** | Thứ tự vật lý khớp thứ tự khoá → quét khoảng rẻ, planner ưu tiên index |
| Gần **0** | Hoàn toàn ngẫu nhiên → quét khoảng đắt, planner có thể bỏ index |
| Gần **−1,0** | Ngược thứ tự (vẫn tốt, chỉ là đọc ngược) |

Chỉ số này ảnh hưởng trực tiếp tới quyết định của optimizer — chi tiết ở [phase-4 bài 3](../phase-4/03-composite-index-va-optimizer.md).

---

## Secondary index — cấu trúc rời, và cú nhảy về bảng

**Secondary index** (index phụ) là index trên cột **không phải** khoá gom cụm. Nó luôn là một cấu trúc **tách rời** khỏi dữ liệu.

```text
   BẢNG (lộn xộn hoặc sắp theo khoá khác)   INDEX PHỤ trên `last_name`
   ┌──────────────────────────────┐         ┌────────────────────────┐
   │ page 0: 7│An   │Nguyen       │         │ Le    → ...            │
   │ page 1: 1│Binh │Tran         │         │ Nguyen→ page 0, khe 1  │
   │ page 2: 2│Chi  │Le           │         │ Pham  → ...            │
   │   ...                        │         │ Tran  → page 1, khe 1  │
   └──────────────────────────────┘         └────────────────────────┘
                                              ↑ ĐƯỢC SẮP XẾP theo last_name
```

Tra cứu luôn có **hai chặng**:

```text
   SELECT * FROM employees WHERE last_name = 'Tran';

   Chặng 1: đi xuống cây index phụ  →  tìm thấy "trỏ tới page 1, khe 1"
   Chặng 2: nhảy vào bảng đọc page 1 →  lấy dòng đầy đủ

   Chặng 2 chính là điểm yếu: nó là I/O NGẪU NHIÊN.
   Khớp 1.000 dòng nghĩa là có thể phải nhảy 1.000 lần.
```

Đây là lý do **covering index** (index chứa đủ mọi cột cần thiết) có sức mạnh lớn: nó **xoá bỏ hoàn toàn chặng 2**. Chủ đề của [phase-4 bài 2](../phase-4/02-index-scan-va-covering-index.md).

### InnoDB: index phụ tốn **ba** chặng, không phải hai

Đây là chi tiết ít người biết nhưng có hệ quả rất lớn.

Trong InnoDB, lá của index phụ **không** chứa con trỏ vật lý. Nó chứa **giá trị primary key**:

```text
   POSTGRESQL — index phụ trỏ THẲNG tới vị trí vật lý
   ══════════════════════════════════════════════════════
   index phụ (last_name) → ctid (1,1) → đọc heap → xong
                                          2 CHẶNG

   MYSQL INNODB — index phụ trỏ tới PRIMARY KEY
   ══════════════════════════════════════════════════════
   index phụ (last_name) → primary key = 42
                            → tra CLUSTERED INDEX theo 42
                              → xuống lá lấy dữ liệu
                                          3 CHẶNG
```

Vì sao InnoDB thiết kế vậy? Vì bảng của nó **được sắp xếp**, nên vị trí vật lý của một dòng có thể **thay đổi** khi xảy ra tách page. Nếu index phụ trỏ vào vị trí vật lý thì mỗi lần tách page sẽ phải cập nhật mọi index phụ. Trỏ vào primary key thì primary key không bao giờ đổi.

Hệ quả cực kỳ thực tế: **kích thước primary key được nhân lên trong mọi index phụ.**

```text
   BẢNG 10 TRIỆU DÒNG, 5 INDEX PHỤ

   PRIMARY KEY = BIGINT (8 byte)
     Mỗi mục index phụ: khoá + 8 byte PK
     Phần PK chiếm:  10.000.000 × 8 × 5  =  400 MB

   PRIMARY KEY = UUID dạng CHAR(36) (36 byte)
     Mỗi mục index phụ: khoá + 36 byte PK
     Phần PK chiếm:  10.000.000 × 36 × 5 = 1.800 MB

   → TỐN THÊM 1,4 GB, chỉ vì đổi kiểu khoá chính.
   → Và 1,4 GB đó tranh chỗ với dữ liệu nóng trong buffer pool.
```

Ba quy tắc rút ra cho InnoDB:

1. **Primary key phải nhỏ.** `BIGINT` 8 byte gần như luôn là lựa chọn đúng.
2. **Primary key phải tăng dần.** Ngẫu nhiên gây tách page liên tục (xem [bài 1](01-page-heap-va-io.md)).
3. **Đừng dùng khoá phức nhiều cột** làm primary key nếu bảng có nhiều index phụ — toàn bộ khoá phức đó bị nhân bản vào từng index.

Nếu buộc phải dùng UUID: lưu dạng `BINARY(16)` thay vì `CHAR(36)` (tiết kiệm 20 byte mỗi mục), và dùng **UUID v7** có tiền tố thời gian nên tăng dần.

---

## Bảng đối chiếu bốn hệ

| | PostgreSQL | MySQL InnoDB | Oracle | SQL Server |
|---|---|---|---|---|
| Bảng mặc định | **Heap** (lộn xộn) | **Clustered** theo PK | Heap | Heap (đến khi tạo clustered index) |
| `PRIMARY KEY` có sắp xếp bảng? | Không | **Có, bắt buộc** | Không (trừ khi khai `ORGANIZATION INDEX`) | Có (mặc định) |
| Không khai PK thì sao | Vẫn chạy bình thường | InnoDB tự tạo khoá ẩn 6 byte | Vẫn chạy | Vẫn chạy |
| Index phụ trỏ tới | `ctid` (vị trí vật lý) | **Primary key** | `rowid` | Khoá gom cụm, hoặc RID |
| Số chặng tra index phụ | 2 | **3** | 2 | 2 hoặc 3 |
| Đổi được cách tổ chức? | Chỉ `CLUSTER` một lần | Không | `ORGANIZATION INDEX` | `CLUSTERED`/`NONCLUSTERED` |

Đọc bảng này thành lời: *"Trên PostgreSQL, primary key gần như chỉ là một ràng buộc. Trên InnoDB, nó là quyết định về cách toàn bộ dữ liệu nằm trên đĩa."*

---

## Chọn primary key thế nào

Danh sách kiểm tra, xếp theo mức độ quan trọng:

| # | Tiêu chí | Vì sao | Vi phạm thì sao |
|---|---|---|---|
| 1 | **Không bao giờ đổi giá trị** | Mọi khoá ngoại và index phụ (InnoDB) trỏ tới nó | Đổi một giá trị = cập nhật hàng loạt khắp nơi |
| 2 | **Nhỏ** | Bị nhân bản vào mọi index phụ (InnoDB) và mọi khoá ngoại | Phình index, đẩy dữ liệu nóng khỏi RAM |
| 3 | **Tăng dần** (nếu clustered) | Chèn luôn vào page cuối, đang nóng | Tách page liên tục, ghi chậm hàng chục lần |
| 4 | **Không mang ý nghĩa nghiệp vụ** | Nghiệp vụ thay đổi, khoá thì không được đổi | Đổi quy tắc mã hoá = phải đổi khoá chính |
| 5 | **Không lộ thông tin** | Khoá tăng dần lộ quy mô kinh doanh | Đối thủ đếm được số đơn hàng của bạn |

Chú ý tiêu chí 3 và 5 **mâu thuẫn nhau**. Đó là một đánh đổi thật, và cách giải thường dùng là **tách đôi**:

```sql
CREATE TABLE orders (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- kỹ thuật, nội bộ
    order_no TEXT UNIQUE NOT NULL,                             -- nghiệp vụ, lộ ra ngoài
    ...
);
```

Cột `id` lo hiệu năng và toàn vẹn tham chiếu; cột `order_no` lo giao tiếp với thế giới bên ngoài, và tự do đổi định dạng mà không đụng gì tới cấu trúc lưu trữ.

### Khoá tự nhiên vs khoá thay thế

| | Khoá tự nhiên (natural key) | Khoá thay thế (surrogate key) |
|---|---|---|
| Là gì | Dữ liệu nghiệp vụ có sẵn: CMND, email, mã sản phẩm | Số tự sinh không mang ý nghĩa |
| Ưu | Không cần cột thừa; `JOIN` đôi khi bớt được một bước | Ổn định, nhỏ, tăng dần |
| Nhược | **Nghiệp vụ đổi thì chết** — email đổi được, CMND đổi số, mã sản phẩm bị tái cấu trúc | Cần thêm một cột và một index |
| Thực tế | Hiếm khi đáng | **Mặc định nên chọn** |

Câu chuyện kinh điển: một hệ dùng số CMND làm primary key. Nhà nước đổi từ 9 số sang 12 số. Toàn bộ khoá ngoại của 40 bảng phải cập nhật đồng thời trong một transaction. Đó là lý do tiêu chí số 1 đứng đầu danh sách.

---

## Đo thử trên máy bạn

Thí nghiệm cho thấy khác biệt giữa khoá tăng dần và khoá ngẫu nhiên trên PostgreSQL:

```sql
-- Khoá tăng dần
CREATE TABLE t_seq (id BIGINT PRIMARY KEY, payload TEXT);
\timing on
INSERT INTO t_seq
SELECT i, repeat('x', 100) FROM generate_series(1, 2000000) AS i;
```

```text
INSERT 0 2000000
Time: 6142.883 ms (00:06.143)
```

```sql
-- Khoá ngẫu nhiên (UUID)
CREATE TABLE t_uuid (id UUID PRIMARY KEY, payload TEXT);
INSERT INTO t_uuid
SELECT gen_random_uuid(), repeat('x', 100) FROM generate_series(1, 2000000);
```

```text
INSERT 0 2000000
Time: 21877.412 ms (00:21.877)
```

```sql
SELECT 'seq'  AS loai, pg_size_pretty(pg_total_relation_size('t_seq'))  AS kich_thuoc
UNION ALL
SELECT 'uuid', pg_size_pretty(pg_total_relation_size('t_uuid'));
```

```text
 loai | kich_thuoc
------+------------
 seq  | 331 MB
 uuid | 429 MB
```

```text
   Thời gian chèn:  6,1 s  →  21,9 s   (chậm hơn 3,6 lần)
   Dung lượng    :  331 MB →  429 MB   (lớn hơn 30%)
```

Và nhớ rằng PostgreSQL dùng heap nên đã **nhẹ đòn** rồi. Trên InnoDB, nơi bảng bắt buộc sắp theo primary key, khoảng cách còn lớn hơn nhiều.

Kiểm tra chỉ số tương quan để thấy nguyên nhân:

```sql
SELECT tablename, attname, correlation FROM pg_stats
WHERE tablename IN ('t_seq','t_uuid') AND attname = 'id';
```

```text
 tablename | attname | correlation
-----------+---------+-------------
 t_seq     | id      |         1.0     ← hoàn hảo
 t_uuid    | id      |    0.001845     ← hoàn toàn ngẫu nhiên
```

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Dùng UUID v4 làm primary key trên InnoDB | Bảng sắp theo PK → mỗi lần chèn rơi page ngẫu nhiên → tách page liên tục | `BIGINT` tự tăng, hoặc UUID v7, lưu `BINARY(16)` |
| Dùng khoá phức nhiều cột làm PK trên InnoDB | Toàn bộ khoá phức bị nhân bản vào mọi index phụ | PK thay thế `BIGINT`, khoá phức để `UNIQUE` |
| Dùng dữ liệu nghiệp vụ (email, CMND) làm PK | Nghiệp vụ đổi → phải cập nhật mọi khoá ngoại | Khoá thay thế cho PK, khoá tự nhiên để `UNIQUE` |
| Nghĩ `PRIMARY KEY` trên PostgreSQL sắp xếp bảng | Không hề — bảng vẫn là heap | Muốn sắp thì `CLUSTER` (một lần, khoá bảng) |
| Chạy `CLUSTER` trên bảng lớn giờ cao điểm | Khoá `ACCESS EXCLUSIVE`, chặn mọi truy cập | Chạy giờ thấp điểm, hoặc dùng `pg_repack` |
| Không khai primary key trên InnoDB | InnoDB tự tạo khoá ẩn 6 byte bạn không kiểm soát và không dùng được | Luôn khai primary key tường minh |
| Để `fillfactor` 100 trên bảng cập nhật nhiều | Tách page liên tục, và mất cơ hội HOT update | Đặt 70-85 cho bảng ghi nhiều |

## Tóm tắt bài 3

- "Primary key" gộp **ba khái niệm** khác nhau — ràng buộc logic, cấu trúc tìm kiếm, và cách sắp xếp vật lý — và **mỗi hệ ghép chúng theo cách khác nhau**.
- **PostgreSQL**: bảng luôn là heap lộn xộn; primary key chỉ là ràng buộc kèm một index riêng. **MySQL InnoDB**: bảng **bắt buộc** sắp xếp vật lý theo primary key.
- **Index organized table** thắng lớn ở truy vấn khoảng (5-20 lần) nhưng trả giá bằng **tách page** khi chèn không theo thứ tự.
- Trong InnoDB, index phụ trỏ tới **primary key** chứ không trỏ tới vị trí vật lý → tra index phụ tốn **ba chặng**, và **kích thước primary key bị nhân lên trong mọi index phụ**.
- Chọn primary key theo thứ tự ưu tiên: **không đổi > nhỏ > tăng dần > không mang nghĩa nghiệp vụ**. Mâu thuẫn giữa "tăng dần" và "không lộ thông tin" giải bằng cách tách `id` kỹ thuật khỏi mã nghiệp vụ.
- Đo thực tế trên PostgreSQL: khoá UUID ngẫu nhiên chèn **chậm hơn 3,6 lần** và tốn thêm **30% dung lượng** so với khoá tăng dần — và trên InnoDB khoảng cách còn lớn hơn.
- `pg_stats.correlation` cho biết bảng còn "sắp xếp" tới đâu, và nó ảnh hưởng trực tiếp tới quyết định dùng index của optimizer.

**Bài kế tiếp** → [Phase 4 — Bài 1: Cơ bản về Database Indexing](../phase-4/01-co-ban-ve-indexing.md)

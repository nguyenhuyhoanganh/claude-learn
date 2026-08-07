# Bài 1: Page, Heap và I/O — đổi đơn vị suy nghĩ từ "dòng" sang "trang"

Đây là bài quan trọng nhất của cả khoá. Không phải vì nó khó, mà vì nó **đổi cách bạn nhìn mọi câu SQL** từ nay về sau.

Thử một câu hỏi trước khi đọc tiếp:

```sql
SELECT name FROM employees WHERE id = 40;
```

Bảng có 10.000 dòng, mỗi dòng 6 cột. Câu này chỉ lấy **một cột** của **một dòng**. Vậy database phải đọc bao nhiêu byte từ ổ đĩa?

Câu trả lời trực giác: "một cái tên, chắc vài chục byte."

Câu trả lời thật: **ít nhất 8.192 byte** — và nếu không có index thì **hơn 80 triệu byte**.

Bài này giải thích vì sao, và sau khi hiểu, bạn sẽ không bao giờ nhìn `SELECT` như cũ nữa.

## Bảng nhìn từ hai phía

Cùng một bảng, hai cách nhìn hoàn toàn khác nhau:

```text
   CÁCH BẠN NHÌN (logic)                    CÁCH ĐĨA NHÌN (vật lý)
   ═══════════════════════                   ══════════════════════
   ┌────┬────────┬──────────┬────────┐      ┌──────────────────────────┐
   │ id │  name  │   dob    │ salary │      │ 0110100101110010011...   │
   ├────┼────────┼──────────┼────────┤      │ 1010011101001010110...   │
   │ 10 │ An     │1990-01-02│  15000 │      │ 0011101010010111010...   │
   │ 20 │ Binh   │1988-11-30│  22000 │      │ 1101001011101001011...   │
   │ 30 │ Chi    │1995-06-15│  18000 │      │ ...                      │
   │ .. │  ...   │   ...    │   ...  │      └──────────────────────────┘
   └────┴────────┴──────────┴────────┘
   "Bảng có dòng và cột"                    "Chỉ có một dãy byte dài"
```

Giữa hai cách nhìn đó có một tầng dịch, và tầng dịch ấy tên là **page**. Hiểu tầng này là hiểu vì sao query nhanh hay chậm.

## Row ID — địa chỉ vật lý của một dòng

Database không dùng khoá chính của bạn để **định vị** dòng trên đĩa. Nó tự duy trì một địa chỉ riêng, gọi là **row ID** (PostgreSQL gọi là *tuple ID*, viết tắt `ctid`).

Đây không phải khái niệm trừu tượng — nó là **cột thật, xem được**:

```sql
CREATE TABLE employees (
    id     INT PRIMARY KEY,
    name   TEXT,
    dob    DATE,
    salary INT
);

INSERT INTO employees VALUES
    (10, 'An',   '1990-01-02', 15000),
    (20, 'Binh', '1988-11-30', 22000),
    (30, 'Chi',  '1995-06-15', 18000);

SELECT ctid, id, name FROM employees;
```

```text
 ctid  | id | name
-------+----+------
 (0,1) | 10 | An
 (0,2) | 20 | Binh
 (0,3) | 30 | Chi
```

Đọc `ctid` thành lời:

```text
   (0, 1)
    │  └── vị trí thứ 1 TRONG page đó
    └───── page số 0

   "Dòng này nằm ở khe số 1 của trang số 0."
```

Đây là **địa chỉ vật lý**. Nó không phải `id = 10` bạn khai báo. Nếu bạn `UPDATE` dòng này, `ctid` sẽ **đổi** — vì PostgreSQL tạo một phiên bản mới ở chỗ khác:

```sql
UPDATE employees SET salary = 16000 WHERE id = 10;
SELECT ctid, id, salary FROM employees ORDER BY id;
```

```text
 ctid  | id | salary
-------+----+--------
 (0,4) | 10 |  16000      ← ĐỔI từ (0,1) sang (0,4)
 (0,2) | 20 |  22000
 (0,3) | 30 |  18000
```

Chi tiết nhỏ này có hệ quả rất lớn, sẽ nói ở cuối bài.

### Hai trường phái row ID

| | PostgreSQL | MySQL InnoDB |
|---|---|---|
| Row ID là gì | `ctid` — hệ thống tự sinh, (page, khe) | **Chính là primary key** bạn khai báo |
| Index phụ trỏ tới gì | Trỏ thẳng tới `ctid` | Trỏ tới **primary key**, rồi tra tiếp |
| Không khai primary key | Vẫn có `ctid` | InnoDB tự tạo một khoá ẩn 6 byte |

Khác biệt này là gốc rễ của rất nhiều hành vi khác nhau giữa hai hệ — chi tiết ở [phase-17 bài 5](../phase-17/05-indexing-postgres-vs-mysql.md).

## Page — đơn vị thật sự của database

**Page** (trang) là **khối byte có kích thước cố định** mà database dùng làm đơn vị đọc/ghi. Đây là khái niệm quan trọng nhất bài này.

| Hệ | Kích thước page mặc định |
|---|---|
| PostgreSQL | **8 KB** (8.192 byte) |
| MySQL InnoDB | **16 KB** |
| Oracle | 8 KB (đổi được 2-32 KB) |
| SQL Server | 8 KB |

Vì sao lại có khái niệm này? Vì **ổ đĩa không cho phép đọc một byte lẻ**. Ổ đĩa làm việc theo khối. Đọc 1 byte hay đọc 8.192 byte liền nhau tốn gần như cùng thời gian — nên đọc lẻ là lãng phí thuần tuý.

```text
   RAM                                    ĐĨA
   ═══                                    ═══
   Đánh địa chỉ theo BYTE                 Đánh địa chỉ theo KHỐI
   "cho tôi byte thứ 1.048.576"           "cho tôi khối thứ 128"
   → nhận đúng 1 byte                     → nhận cả 4.096 byte

   Đó là lý do có chữ "Random Access"     Đó là lý do database phải
   trong RAM (Random Access Memory).      gom dữ liệu thành PAGE.
```

### Bên trong một page 8 KB

```text
   ┌──────────────────────────────────────────────────┐ ← byte 0
   │ PageHeader (24 byte)                             │
   │   checksum, con trỏ vùng trống, LSN...           │
   ├──────────────────────────────────────────────────┤
   │ ItemId[1] ItemId[2] ItemId[3] ...   →→→          │  4 byte mỗi cái
   │ (mảng con trỏ tới từng dòng, mọc TỪ TRÊN XUỐNG)  │
   ├──────────────────────────────────────────────────┤
   │                                                  │
   │            VÙNG TRỐNG (free space)               │
   │                                                  │
   ├──────────────────────────────────────────────────┤
   │        ←←←   Tuple[3]  Tuple[2]  Tuple[1]        │
   │ (dữ liệu thật của từng dòng, mọc TỪ DƯỚI LÊN)    │
   ├──────────────────────────────────────────────────┤
   │ Special space (chỉ dùng cho page của index)      │
   └──────────────────────────────────────────────────┘ ← byte 8191

   Hai đầu mọc vào giữa. Khi chúng chạm nhau → page đầy.
```

Thiết kế "mọc từ hai đầu" này rất khéo: nó cho phép cả số dòng lẫn kích thước dòng thay đổi tự do mà không cần biết trước cái nào sẽ chiếm nhiều hơn.

### Tính số dòng trên một page

```text
   Page 8.192 byte
   − 24 byte PageHeader
   ─────────────────────
   ≈ 8.168 byte dùng được

   Mỗi dòng tốn:  4 byte ItemId  +  23 byte tuple header  +  dữ liệu thật

   Dòng ~100 byte dữ liệu  →  tốn ~127 byte
   8.168 / 127  ≈  64 dòng mỗi page

   Bảng 1.000.000 dòng  →  ~15.600 page  →  ~128 MB
```

Con số 23 byte header mỗi dòng đáng chú ý: với dòng nhỏ (ví dụ chỉ có một cột `INT` 4 byte), **header còn nặng hơn dữ liệu**. Đây là lý do các bảng nhiều cột nhỏ thường tốn đĩa hơn ta tưởng.

### Xem page thật trên máy bạn

```sql
CREATE TABLE grades (id SERIAL PRIMARY KEY, g INT, name TEXT);

INSERT INTO grades (g, name)
SELECT (random()*100)::INT, substr(md5(random()::TEXT), 1, 10)
FROM generate_series(1, 1000000);

SELECT pg_size_pretty(pg_relation_size('grades'))     AS kich_thuoc,
       pg_relation_size('grades') / 8192              AS so_page,
       (SELECT count(*) FROM grades)                  AS so_dong,
       (SELECT count(*) FROM grades) /
           (pg_relation_size('grades') / 8192)        AS dong_moi_page;
```

```text
 kich_thuoc | so_page | so_dong | dong_moi_page
------------+---------+---------+---------------
 65 MB      |    8334 | 1000000 |           119
```

Đọc thành lời: *"Một triệu dòng nằm trong 8.334 trang. Quét toàn bảng nghĩa là đọc 8.334 trang. Nếu chúng nằm sẵn trong RAM thì khoảng 8 mili-giây; nếu phải xuống SSD thì khoảng 800 mili-giây."*

Và xem chính xác dòng nào nằm ở page nào:

```sql
SELECT ctid, id FROM grades WHERE id IN (1, 120, 240, 999999);
```

```text
    ctid    |   id
------------+--------
 (0,1)      |      1
 (1,1)      |    120
 (2,1)      |    240
 (8332,102) | 999999
```

Dòng `id=1` ở page 0, dòng `id=120` đã sang page 1. Đúng 119 dòng mỗi page như tính toán.

## I/O — đồng tiền của database

**I/O** là một thao tác đọc/ghi giữa RAM và đĩa. Và đây là câu cần khắc vào đầu:

> **I/O là đồng tiền của database. Query nào tiêu ít I/O hơn thì nhanh hơn. Chấm hết.**

Ba tính chất của một lần I/O, và cả ba đều phản trực giác:

```text
   1. MỘT LẦN I/O TRẢ VỀ CẢ PAGE, KHÔNG PHẢI MỘT DÒNG
      Bạn cần dòng thứ 4 → nhận luôn dòng 4, 5, 6 (và cả 60 dòng khác cùng page)
      → Không từ chối được. Không có cách nào "chỉ lấy dòng 4".

   2. KHÔNG CHỌN ĐƯỢC CỘT
      Bạn cần mỗi cột `name` → vẫn nhận cả `dob`, `salary`, mọi cột khác
      → Vì chúng nằm CẠNH NHAU trong cùng byte của page (kho hàng theo dòng)

   3. MỘT LẦN I/O CÓ THỂ TRẢ VỀ NHIỀU PAGE
      Tuỳ cách phân vùng đĩa, tuỳ hệ điều hành đọc trước (read-ahead)
      → Đôi khi bạn được "khuyến mãi" page kế bên
```

### Vì sao `SELECT name` cũng đắt gần bằng `SELECT *`

Đây là hệ quả trực tiếp của tính chất số 2, và nó làm nhiều người ngạc nhiên:

```text
   Trong PAGE, dữ liệu xếp THEO DÒNG (row store):

   ┌──────────────────────────────────────────────────────────┐
   │ [10│An  │1990-01-02│15000] [20│Binh│1988-11-30│22000] ... │
   │  └───── dòng 1 ─────┘       └───── dòng 2 ─────┘         │
   └──────────────────────────────────────────────────────────┘

   SELECT name FROM employees;
     → vẫn phải đọc TOÀN BỘ page (không cắt ra được)
     → rồi giải mã từng dòng
     → rồi VỨT ĐI dob và salary
```

Vậy `SELECT name` có tiết kiệm gì không? **Có**, nhưng không phải ở I/O:

| Tiết kiệm được | Không tiết kiệm được |
|---|---|
| Băng thông mạng trả về client | Số page phải đọc từ đĩa |
| Bộ nhớ giữ kết quả ở client | Chi phí đọc page vào RAM |
| Chi phí giải mã (một phần) | |
| **Cơ hội dùng index-only scan** ← đây mới là cái lớn | |

Dòng cuối cùng là chỗ `SELECT` ít cột thật sự đáng giá: nếu mọi cột bạn cần đều nằm trong một index, database có thể **không chạm vào bảng lần nào**. Đó là *index-only scan*, chủ đề của [phase-4 bài 2](../phase-4/02-index-scan-va-covering-index.md).

> Riêng với **database cột** (column store) thì mọi thứ đảo ngược: `SELECT name` chỉ đọc đúng phần chứa `name`. Đó là lý do chúng thống trị mảng phân tích — xem [bài 2](02-row-based-vs-column-based.md).

## Heap — đống hồ sơ không sắp xếp

**Heap** là cấu trúc lưu bảng ở dạng **không có thứ tự**: dòng mới cứ nhét vào page nào còn chỗ.

```text
   HEAP CỦA BẢNG employees

   Page 0            Page 1            Page 2       ...   Page 333
   ┌───────────┐     ┌───────────┐     ┌───────────┐      ┌───────────┐
   │ id=10 An  │     │ id=40 Dung│     │ id=70 ... │      │id=9990 ...│
   │ id=20 Binh│     │ id=50 Em  │     │ id=80 ... │      │id=10000...│
   │ id=30 Chi │     │ id=60 Phuc│     │ id=90 ... │      │           │
   └───────────┘     └───────────┘     └───────────┘      └───────────┘

   Muốn tìm id = 10000?  →  Không biết nó ở đâu.
                             Phải đọc page 0, 1, 2, ... cho đến khi gặp.
```

Vì sao lại thiết kế "vô tổ chức" như vậy? Vì **ghi nhanh**. Nếu bắt bảng luôn sắp xếp theo `id`, thì chèn một dòng có `id` nằm giữa sẽ phải dịch chuyển hàng triệu dòng phía sau. Heap đổi lấy chi phí đọc để có tốc độ ghi.

### Đếm I/O: có index và không có index

Dùng bảng 10.000 nhân viên, 3 dòng mỗi page → **3.334 page**.

```text
   ╔═══════════════════════════════════════════════════════════════════╗
   ║  KHÔNG CÓ INDEX                                                   ║
   ║  SELECT * FROM employees WHERE id = 10000;                        ║
   ╚═══════════════════════════════════════════════════════════════════╝

   Page 0    → đọc → có id 10, 20, 30       → không khớp → bỏ
   Page 1    → đọc → có id 40, 50, 60       → không khớp → bỏ
   Page 2    → đọc → ...                    → không khớp → bỏ
     ...
   Page 3333 → đọc → có id 9990, 10000      → TÌM THẤY

   TỔNG: 3.334 lần đọc page   (~27 MB)
   Và đen đủi nhất: dòng cần tìm nằm ở page CUỐI CÙNG.
```

```text
   ╔═══════════════════════════════════════════════════════════════════╗
   ║  CÓ INDEX TRÊN id                                                 ║
   ║  SELECT * FROM employees WHERE id = 10000;                        ║
   ╚═══════════════════════════════════════════════════════════════════╝

   Bước 1 — đi xuống cây index (B+Tree, 3 tầng):
       đọc page gốc      → 1 I/O
       đọc page tầng 2   → 1 I/O
       đọc page lá       → 1 I/O   → tìm thấy: "id=10000 ở ctid (3333, 2)"

   Bước 2 — nhảy vào heap:
       đọc page 3333     → 1 I/O   → lấy đúng dòng cần

   TỔNG: 4 lần đọc page   (~32 KB)
```

```text
   3.334  vs  4     →   NHANH HƠN ~833 LẦN
```

Đó là toàn bộ lý do index tồn tại, diễn đạt bằng đúng một con số.

### Kiểm chứng bằng `EXPLAIN (ANALYZE, BUFFERS)`

Lý thuyết trên đo được trực tiếp:

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM grades WHERE g = 50;
```

```text
Seq Scan on grades  (cost=0.00..17709.00 rows=9867 width=19)
                    (actual time=0.024..92.451 rows=9923 loops=1)
  Filter: (g = 50)
  Rows Removed by Filter: 990077
  Buffers: shared hit=8334
Planning Time: 0.062 ms
Execution Time: 92.883 ms
```

Ba dòng cần đọc:

| Dòng | Ý nghĩa |
|---|---|
| `Seq Scan` | Quét tuần tự — đọc mọi page |
| `Buffers: shared hit=8334` | **Đọc đúng 8.334 page** — khớp chính xác con số tính tay |
| `Rows Removed by Filter: 990077` | Đọc 1 triệu dòng, vứt đi 990.077 dòng |

Bây giờ thêm index:

```sql
CREATE INDEX idx_grades_g ON grades(g);
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM grades WHERE g = 50;
```

```text
Bitmap Heap Scan on grades  (cost=110.42..5893.28 rows=9867 width=19)
                            (actual time=1.204..12.118 rows=9923 loops=1)
  Recheck Cond: (g = 50)
  Heap Blocks: exact=4779
  Buffers: shared hit=4809
  ->  Bitmap Index Scan on idx_grades_g  (cost=0.00..107.96 rows=9867 width=0)
      Buffers: shared hit=30
Execution Time: 12.502 ms
```

```text
   Không index: 8.334 page,  92,9 ms
   Có index   : 4.809 page,  12,5 ms   →  nhanh hơn 7,4 lần
```

Chú ý: chỉ nhanh hơn **7 lần**, không phải 833 lần như ví dụ lý thuyết. Vì sao? Vì `g = 50` khớp tới **9.923 dòng** (1% bảng), rải rác khắp 4.779 page khác nhau. Index giúp bỏ qua được một nửa số page, nhưng vẫn phải chạm rất nhiều.

Đây là bài học thực chiến quan trọng: **index hiệu quả tỉ lệ nghịch với số dòng khớp**. Tìm 1 dòng thì thần kỳ; tìm 1% bảng thì đỡ được vài lần; tìm 30% bảng thì optimizer sẽ bỏ qua index. Chi tiết ở [phase-4 bài 3](../phase-4/03-composite-index-va-optimizer.md).

## Index cũng nằm trên đĩa, cũng tốn I/O

Một hiểu lầm phổ biến: "index nằm trong RAM nên tra index là miễn phí".

Sai. **Index cũng là các page trên đĩa**, cũng phải đọc lên, cũng tốn I/O:

```sql
SELECT pg_size_pretty(pg_relation_size('grades'))       AS bang,
       pg_size_pretty(pg_relation_size('idx_grades_g')) AS index_g,
       pg_size_pretty(pg_total_relation_size('grades')) AS tong_cong;
```

```text
   bang  | index_g | tong_cong
---------+---------+-----------
 65 MB   | 21 MB   | 108 MB
```

Ba điều rút ra:

1. Index chiếm **21 MB** — bằng 1/3 bảng, và đó chỉ là **một** index.
2. `pg_total_relation_size` (108 MB) lớn hơn tổng bảng + index vì còn có primary key index và các cấu trúc phụ.
3. Index càng nhỏ thì càng dễ **nằm trọn trong RAM** → tra index không chạm đĩa lần nào. Index quá lớn thì chính việc tra index cũng gây I/O.

Đây là lý do "đánh index cho mọi cột" là ý tưởng tồi: bạn vừa làm chậm mọi lệnh ghi, vừa đẩy các index hữu ích ra khỏi RAM.

## Clustered index — khi bảng CHÍNH LÀ index

Heap không sắp xếp. Nhưng có một cách tổ chức khác: **sắp xếp luôn bảng theo một index**. Khi đó bảng không còn là heap nữa — nó **chính là** cây index, với dữ liệu nằm ở lá.

```text
   POSTGRESQL — HEAP + INDEX RIÊNG        MYSQL INNODB — CLUSTERED INDEX
   ══════════════════════════════          ══════════════════════════════
        INDEX (cây)                             INDEX = BẢNG (một cây)
        ┌─────────┐                             ┌─────────┐
        │ 10 → (0,1)                            │  10, 20, 30 ...
        │ 20 → (0,2)                            └────┬────┘
        │ 30 → (0,3)                                 │
        └────┬────┘                             ┌────▼────────────────┐
             │ trỏ tới                          │ LÁ chứa LUÔN dữ liệu│
        ┌────▼────────────────┐                 │ 10│An │1990│15000   │
        │ HEAP (rời, không sắp)│                │ 20│Binh│1988│22000  │
        │ 10│An │... 20│Binh│..│                └─────────────────────┘
        └─────────────────────┘
                                                 Chỉ MỘT lần tra là xong.
        Phải tra 2 lần: index rồi heap.
```

Hệ quả rất khác nhau:

| | PostgreSQL (heap) | MySQL InnoDB (clustered) |
|---|---|---|
| Tra theo primary key | 2 bước: index → heap | **1 bước** — dữ liệu nằm ngay ở lá |
| Tra theo index phụ | 2 bước: index phụ → heap | **3 bước**: index phụ → primary key → clustered index |
| Quét theo thứ tự primary key | Ngẫu nhiên trên đĩa | **Tuần tự** — rất nhanh |
| Chèn dòng mới | Nhét vào chỗ trống bất kỳ | Phải chèn **đúng vị trí** theo thứ tự |

### Bẫy UUID làm khoá chính trên InnoDB

Cột cuối cùng của bảng trên dẫn tới một sự cố hiệu năng rất hay gặp:

```text
   PRIMARY KEY TĂNG DẦN (auto increment)
   ══════════════════════════════════════
   Chèn 1001, 1002, 1003, 1004 ...
   → tất cả rơi vào CÙNG page cuối
   → page đó đang nằm trong RAM
   → 1 page bẩn, ghi 1 lần

   ┌────┬────┬────┬────┬────┐
   │... │... │... │... │████│ ← chỉ page cuối bị đụng
   └────┴────┴────┴────┴────┘

   PRIMARY KEY LÀ UUID NGẪU NHIÊN
   ══════════════════════════════════════
   Chèn f47ac10b..., 550e8400..., 6ba7b810...
   → mỗi cái rơi vào MỘT page KHÁC NHAU, ngẫu nhiên
   → phải đọc page đó lên trước (I/O ngẫu nhiên)
   → chèn vào giữa → có thể làm page ĐẦY → TÁCH PAGE

   ┌────┬────┬────┬────┬────┐
   │████│    │████│████│    │ ← page rải khắp nơi bị đụng
   └────┴────┴────┴────┴────┘
```

Trên bảng lớn, khác biệt này có thể là **hàng chục lần** về tốc độ chèn. Đó là lý do Shopify từng phải chuyển khỏi UUID làm khoá chính — chi tiết ở [phase-17 bài 2](../phase-17/02-thao-luan-uuid-pk-va-postgres-vs-mysql.md) và [phase-4 bài 4](../phase-4/04-bloom-filter-va-uuid-performance.md).

> **Chú ý:** vấn đề này nặng ở InnoDB vì bảng **bắt buộc** sắp theo primary key. PostgreSQL dùng heap nên nhẹ hơn nhiều — nhưng index trên UUID vẫn bị phân mảnh. Nếu cần khoá phân tán, dùng UUID v7 (có tiền tố thời gian, tăng dần) thay vì v4.

## Cái giá của việc PostgreSQL không sửa tại chỗ

Nhớ lại chi tiết ở đầu bài: `UPDATE` làm `ctid` thay đổi. Bây giờ ghép nó với sự thật *"mọi index của PostgreSQL đều trỏ tới `ctid`"*:

```text
   Bảng employees có 4 index: (id), (name), (dob), (salary)

   UPDATE employees SET salary = 16000 WHERE id = 10;

   1. Tạo phiên bản mới của dòng → ctid đổi từ (0,1) sang (0,4)
   2. Index trên id     → phải trỏ lại (0,4)   ← dù id KHÔNG đổi
   3. Index trên name   → phải trỏ lại (0,4)   ← dù name KHÔNG đổi
   4. Index trên dob    → phải trỏ lại (0,4)   ← dù dob KHÔNG đổi
   5. Index trên salary → phải trỏ lại (0,4)   ← cái này thì hợp lý

   → SỬA MỘT CỘT, ĐỤNG VÀO BỐN INDEX.
```

Đây gọi là **write amplification** (khuếch đại ghi), và nó là một trong những lý do PostgreSQL bị chê ở workload ghi nhiều. PostgreSQL có cơ chế giảm nhẹ tên là **HOT update** (*Heap-Only Tuple*): nếu phiên bản mới nằm **cùng page** và **không cột nào được đánh index bị đổi**, thì các index không cần cập nhật.

Kiểm tra tỉ lệ HOT trên bảng của bạn:

```sql
SELECT relname,
       n_tup_upd       AS tong_update,
       n_tup_hot_upd   AS update_hot,
       round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd, 0), 1) AS ti_le_hot
FROM pg_stat_user_tables
WHERE n_tup_upd > 0
ORDER BY n_tup_upd DESC;
```

```text
 relname | tong_update | update_hot | ti_le_hot
---------+-------------+------------+-----------
 grades  |      120000 |     115200 |      96.0
```

Tỉ lệ HOT cao (>90%) là dấu hiệu tốt. Tỉ lệ thấp nghĩa là bạn đang trả phí cập nhật index cho gần như mọi lệnh `UPDATE`.

## Dòng chết và vì sao bảng không nhỏ lại

Hệ quả cuối cùng của mô hình nhiều phiên bản: **`DELETE` không thu hồi chỗ**.

```sql
SELECT pg_size_pretty(pg_relation_size('grades')) AS truoc_khi_xoa;
DELETE FROM grades WHERE g < 50;
SELECT pg_size_pretty(pg_relation_size('grades')) AS sau_khi_xoa;
```

```text
 truoc_khi_xoa
---------------
 65 MB

 sau_khi_xoa
-------------
 65 MB          ← Y NGUYÊN, dù đã xoá ~50% số dòng
```

`DELETE` chỉ **đánh dấu chết** (`xmax`), không xoá byte. Chỗ đó chỉ được tái sử dụng sau khi `VACUUM` chạy:

```sql
SELECT relname, n_live_tup AS dong_song, n_dead_tup AS dong_chet
FROM pg_stat_user_tables WHERE relname = 'grades';
```

```text
 relname | dong_song | dong_chet
---------+-----------+-----------
 grades  |    504218 |    495782
```

```sql
VACUUM grades;   -- trả chỗ về cho chính bảng này dùng lại
```

Sau `VACUUM` thường, dung lượng vẫn 65 MB nhưng chỗ trống được **tái sử dụng** cho dòng mới. Muốn trả đĩa lại cho hệ điều hành phải dùng `VACUUM FULL` — lệnh này **khoá toàn bảng**, tuyệt đối không chạy giờ cao điểm.

Con số cần theo dõi trên production:

```sql
SELECT relname,
       n_dead_tup,
       round(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0), 1) AS pct_chet,
       last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;
```

Tỉ lệ dòng chết trên 20% là dấu hiệu autovacuum không theo kịp — mọi query sẽ chậm dần vì phải đọc cả page chứa xác chết.

## Đổi đơn vị suy nghĩ

Đây là kết luận của bài, và là thứ đáng mang theo suốt phần còn lại của khoá:

```text
   ┌─────────────────────────────────────────────────────────────────┐
   │  CÁCH NGHĨ CŨ                CÁCH NGHĨ MỚI                      │
   │  ────────────                ─────────────                      │
   │  "query trả 10 dòng"    →    "query đọc bao nhiêu PAGE?"        │
   │  "bảng có 1 triệu dòng" →    "bảng chiếm 8.334 PAGE = 65 MB"    │
   │  "index làm nhanh hơn"  →    "index giảm từ 8.334 xuống 4 I/O"  │
   │  "SELECT ít cột nhanh"  →    "vẫn đọc đủ page, trừ khi          │
   │                               index-only scan"                  │
   └─────────────────────────────────────────────────────────────────┘
```

Bốn câu hỏi nên tự hỏi trước khi viết bất kỳ query nào:

1. Query này phải chạm bao nhiêu page?
2. Các page đó có nằm sẵn trong RAM không?
3. Đọc chúng là tuần tự hay nhảy cóc?
4. Có cách nào lấy được kết quả mà **không** chạm vào bảng không?

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| "`SELECT name` rẻ hơn `SELECT *` rất nhiều" | Vẫn đọc đủ số page; chỉ tiết kiệm băng thông và cơ hội index-only scan | Đo bằng `EXPLAIN (ANALYZE, BUFFERS)`, so cột `Buffers` |
| "Index nằm trong RAM nên tra miễn phí" | Index cũng là page trên đĩa, có thể lớn hơn cả RAM | Theo dõi `pg_relation_size` của từng index |
| "Xoá dữ liệu thì bảng nhỏ lại" | `DELETE` chỉ đánh dấu chết | `VACUUM` để tái dùng; `VACUUM FULL` (khoá bảng) để trả đĩa |
| Đánh index cho mọi cột | Mỗi index tốn đĩa, làm chậm ghi, đẩy index hữu ích ra khỏi RAM | Đánh theo query thật đang chậm, đo trước và sau |
| Dùng UUID v4 làm primary key trên InnoDB | Mỗi lần chèn rơi vào page ngẫu nhiên → tách page liên tục | Khoá tăng dần, hoặc UUID v7 |
| Đo hiệu năng trên bảng vài nghìn dòng | Toàn bộ nằm trong RAM, mọi phương án đều nhanh như nhau | Tối thiểu 1 triệu dòng |
| Bỏ qua tỉ lệ dòng chết | Bảng phình, query chậm dần mà không rõ lý do | Theo dõi `n_dead_tup`, chỉnh autovacuum |

## Tóm tắt bài 1

- **Page** là đơn vị đọc/ghi thật sự: 8 KB ở PostgreSQL, 16 KB ở InnoDB. Database đếm page, không đếm dòng.
- **`ctid`** là địa chỉ vật lý `(page, khe)` của một dòng — xem được, và **đổi mỗi lần `UPDATE`** trong PostgreSQL.
- **Một lần I/O trả về cả page**, không chọn được dòng, không chọn được cột. Đó là lý do `SELECT name` vẫn đọc đủ số page.
- **Heap** là bảng không sắp xếp — ghi nhanh, đọc chậm. Tìm một dòng trong heap 3.334 page tốn 3.334 I/O; có index chỉ tốn **4**.
- **Index cũng nằm trên đĩa và cũng tốn I/O.** Index nhỏ thì nằm trọn trong RAM; index to thì chính việc tra nó cũng gây I/O.
- **Clustered index** (InnoDB) để dữ liệu ngay ở lá → tra primary key một bước, nhưng index phụ tốn ba bước, và UUID ngẫu nhiên làm khoá chính gây tách page liên tục.
- PostgreSQL không sửa tại chỗ → **mọi index phải cập nhật** khi `UPDATE`, trừ khi đạt điều kiện **HOT update**.
- **`DELETE` không thu hồi đĩa.** Theo dõi `n_dead_tup`; `VACUUM` để tái dùng, `VACUUM FULL` (khoá bảng) để trả lại hệ điều hành.
- Kết luận lớn nhất: **đổi đơn vị suy nghĩ từ *dòng* sang *page* và *số lần I/O*.**

**Bài kế tiếp** → [Bài 2: Row-Based vs Column-Based Databases](02-row-based-vs-column-based.md)

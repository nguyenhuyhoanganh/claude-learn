# Bài 1: B-Tree — vì sao tìm 1 dòng trong 1 tỷ dòng chỉ tốn 4 lần đọc

Bảng có **1 tỷ dòng**. Bạn tìm một dòng theo `id`. Database trả lời trong **0,1 mili-giây**.

Con số đó nghĩa là nó đã đọc khoảng **4 page**. Bốn. Trong một tỷ dòng.

Bài này giải thích cấu trúc làm được điều đó. Nhưng để hiểu vì sao nó phải trông như vậy, ta đi từ những cách **đơn giản hơn** và xem chúng gãy ở đâu.

## Bốn cách tìm dữ liệu, và ba cái đầu đều gãy

### Cách 1 — Mảng không sắp xếp (chính là heap)

```text
   [45] [12] [88] [3] [67] [21] [99] [7] ...

   Tìm 67?  → so từng phần tử từ đầu.
   1 tỷ dòng → trung bình 500 triệu lần so sánh.
   → 66.000 page phải đọc (như đã tính ở phase-3)
```

**Gãy vì:** phải đọc mọi thứ.

### Cách 2 — Mảng đã sắp xếp

```text
   [3] [7] [12] [21] [45] [67] [88] [99] ...

   Tìm 67?  → tìm kiếm nhị phân, log₂(1 tỷ) ≈ 30 lần so sánh.  ✔ RẤT NHANH ĐỌC

   Chèn 50? → phải chen vào giữa 45 và 67
              → DỊCH CHUYỂN mọi phần tử phía sau
              → 1 tỷ dòng: dịch trung bình 500 triệu phần tử.  ✘
```

**Gãy vì:** chèn quá đắt. Mà database thì lúc nào cũng chèn.

### Cách 3 — Bảng băm (hash table)

```text
   hash(67) = 4  →  đi thẳng tới ô 4.   MỘT bước. ✔ NHANH NHẤT

   Nhưng:  "cho tôi mọi giá trị từ 50 đến 80"?
           → hash không giữ thứ tự nào cả
           → 50 ở ô 9, 51 ở ô 2, 52 ở ô 7...
           → phải quét TOÀN BỘ bảng băm.  ✘

           "sắp xếp theo giá trị"?  → cũng bó tay.  ✘
```

**Gãy vì:** không hỗ trợ truy vấn khoảng và sắp xếp — mà chúng chiếm phần lớn truy vấn thật.

### Cách 4 — Cây tìm kiếm nhị phân

```text
             45
           ／    ＼
        12         88
       ／ ＼      ／  ＼
      3    21   67     99

   Tìm 67?  → 45 → 88 → 67.   3 bước.  ✔ Nhanh, và GIỮ THỨ TỰ
   Chèn 50? → đi xuống đúng chỗ, gắn vào.  ✔ Rẻ
```

Nghe hoàn hảo. Nhưng nó gãy vì một lý do **chỉ xuất hiện khi dữ liệu nằm trên đĩa**:

```text
   Cây nhị phân với 1 tỷ phần tử:
      chiều cao = log₂(1.000.000.000) ≈ 30 TẦNG

   Mỗi nút chỉ chứa 1 giá trị và 2 con trỏ ≈ 20 byte.
   Nhưng ĐƠN VỊ ĐỌC CỦA ĐĨA LÀ 8.192 BYTE.

   → Mỗi lần xuống một tầng = đọc một page 8 KB để dùng có 20 byte
   → 30 tầng = 30 LẦN I/O NGẪU NHIÊN
   → trên SSD: 30 × 100 µs = 3 mili-giây
   → LÃNG PHÍ 99,8% mỗi lần đọc
```

**Gãy vì:** cây quá **cao**, và mỗi tầng là một lần chạm đĩa.

---

## Ý tưởng của B-Tree: làm cây thấp xuống bằng cách làm nút béo ra

Vấn đề của cây nhị phân là mỗi nút chỉ có **2** nhánh. Muốn cây thấp thì phải cho mỗi nút **nhiều** nhánh hơn. Bao nhiêu?

```text
   Câu trả lời: NHIỀU NHẤT MÀ MỘT PAGE CHỨA ĐƯỢC.

   Page 8 KB, mỗi mục = khoá 8 byte + con trỏ 8 byte = 16 byte
   → 8.192 / 16 ≈ 500 mục mỗi nút

   ĐÂY LÀ Ý TƯỞNG TRUNG TÂM CỦA B-TREE:
        MỘT NÚT = MỘT PAGE
```

Hệ quả tính ra ngay:

```text
   CÂY NHỊ PHÂN (2 nhánh)        B-TREE (500 nhánh)
   ═════════════════════          ═══════════════════
   tầng 1:            2           tầng 1:            500
   tầng 2:            4           tầng 2:        250.000
   tầng 3:            8           tầng 3:    125.000.000
   ...                            tầng 4: 62.500.000.000
   tầng 30: 1.073.741.824

   30 TẦNG cho 1 tỷ               4 TẦNG cho 62 tỷ

   30 lần I/O  →  3 ms            4 lần I/O  →  0,4 ms
                                  và tầng 1-3 thường nằm sẵn trong RAM
                                  → thực tế chỉ 1 lần chạm đĩa
```

Đó là toàn bộ câu trả lời cho tiêu đề bài. Không có phép màu — chỉ là **chọn số nhánh khớp với kích thước page**.

Con số "số nhánh mỗi nút" gọi là **fan-out** (độ toè). Fan-out càng lớn thì cây càng thấp, và cây càng thấp thì càng ít I/O.

---

## Giải phẫu một B-Tree

Cấu trúc được Bayer và McCreight mô tả năm 1970. Từ vựng cần nắm:

```text
                    ┌──────────────────────┐
                    │   [17]    [35]       │  ← NÚT GỐC (root)
                    └──┬──────┬──────┬─────┘     luôn nằm trong RAM
              ┌────────┘      │      └────────┐
       ┌──────▼─────┐  ┌──────▼─────┐  ┌──────▼─────┐
       │ [5]  [11]  │  │ [22]  [28] │  │ [41] [56]  │  ← NÚT TRONG (internal)
       └─┬───┬────┬─┘  └─┬───┬────┬─┘  └─┬───┬────┬─┘
      ┌──▼┐┌─▼─┐┌─▼─┐ ┌──▼┐┌─▼─┐┌─▼─┐ ┌──▼┐┌─▼─┐┌─▼─┐
      │1,3││7,9││13 │ │19 ││25 ││31 │ │38 ││48 ││60 │  ← NÚT LÁ (leaf)
      └───┘└───┘└───┘ └───┘└───┘└───┘ └───┘└───┘└───┘
```

| Thuật ngữ | Nghĩa |
|---|---|
| **Nút** (node) | **Một page trên đĩa.** Đây là điểm khác biệt với mọi bài giảng cấu trúc dữ liệu ở trường |
| **Bậc** (degree, `M`) | Số nút con tối đa của một nút |
| **Phần tử** (element) | Một cặp **khoá + giá trị**. Một nút có `M` con thì chứa `M − 1` phần tử |
| **Khoá** (key) | Thứ bạn tìm kiếm — giá trị của cột được đánh index |
| **Giá trị** (value) | **Con trỏ dữ liệu**: trỏ tới dòng thật trong bảng |
| **Gốc** (root) | Nút trên cùng. Được dùng ở mọi lần tìm nên **luôn nằm trong RAM** |
| **Nút trong** (internal) | Tầng giữa. Chỉ để dẫn đường |
| **Lá** (leaf) | Tầng đáy. Không có con |

### Con trỏ dữ liệu trỏ đi đâu — hai trường phái

Đây là một trong những khác biệt kiến trúc lớn nhất giữa các hệ:

```text
   POSTGRESQL                          MYSQL INNODB / ORACLE
   ══════════                          ═════════════════════
   con trỏ → ctid (page, khe)          con trỏ → GIÁ TRỊ PRIMARY KEY
             = vị trí vật lý                     rồi phải tra tiếp
             ~6 byte, cố định                    clustered index

   → Index phụ luôn nhỏ                → Index phụ PHÌNH THEO
   → Nhưng UPDATE làm ctid đổi           kích thước primary key
     → phải cập nhật MỌI index         → Nhưng UPDATE không cần
                                          động vào index phụ
```

Đây chính là lý do (một trong nhiều lý do) khiến Uber từng chuyển từ PostgreSQL sang MySQL — chi tiết ở [phase-17 bài 5](../phase-17/05-indexing-postgres-vs-mysql.md).

Và nó cũng khớp với kết luận ở [phase-3 bài 3](../phase-3/03-primary-key-vs-secondary-key.md): trên InnoDB, **primary key phải nhỏ**, vì nó bị nhân bản vào mọi index phụ.

---

## Tìm kiếm — diễn từng bước

Tìm khoá `28` trong cây ở trên:

```text
   BƯỚC 1 — đọc NÚT GỐC (1 lần I/O, nhưng thường đã trong RAM)
   ┌──────────────────────┐
   │   [17]    [35]       │
   └──────────────────────┘
      28 > 17 ✔
      28 < 35 ✔
      → rẽ nhánh GIỮA

   BƯỚC 2 — đọc NÚT TRONG (1 lần I/O)
   ┌──────────────┐
   │ [22]  [28]   │
   └──────────────┘
      28 > 22 ✔
      28 = 28 ✔ ← TÌM THẤY NGAY TẠI ĐÂY

      → Trong B-Tree gốc, giá trị nằm ở MỌI nút,
        nên tìm thấy ở nút trong là xong luôn.

   TỔNG: 2 lần đọc page
```

Chú ý dòng cuối: **B-Tree gốc lưu giá trị ở mọi nút**. Đó là điểm khác biệt then chốt với B+Tree, và cũng là nguồn gốc của mọi hạn chế ở phần sau.

---

## Chèn và tách nút

Cây cao 4 tầng chỉ hữu ích nếu nó **giữ nguyên** độ cao khi dữ liệu lớn lên. Cơ chế giữ cân bằng là **tách nút**.

Giả sử mỗi nút chứa tối đa 3 khoá. Chèn `4` vào nút đã đầy `[1, 3, 5]`:

```text
   TRƯỚC — nút lá đã đầy
   ┌────────────┐
   │ [1] [3] [5]│
   └────────────┘

   Chèn 4 → nút đầy → TÁCH

   BƯỚC 1: sắp lại thành [1, 3, 4, 5]
   BƯỚC 2: lấy phần tử GIỮA (4) ĐẨY LÊN nút cha
   BƯỚC 3: chia phần còn lại thành hai nút

   SAU
              ┌─────┐
              │ [4] │  ← đẩy lên cha
              └──┬──┘
           ┌─────┴─────┐
      ┌────▼───┐   ┌───▼────┐
      │[1] [3] │   │  [5]   │
      └────────┘   └────────┘
```

Nếu nút cha cũng đầy thì nó lại tách, đẩy tiếp lên trên. Trường hợp cực đoan: lan tới tận gốc, và **gốc tách ra thì cây cao thêm một tầng**.

Ba tính chất quan trọng của cơ chế này:

```text
   1. CÂY CHỈ CAO LÊN TỪ GỐC, không cao lên từ lá
      → mọi lá LUÔN ở cùng độ sâu
      → mọi lần tìm kiếm tốn ĐÚNG BẰNG NHAU số lần I/O
      → đây là ý nghĩa của chữ "cân bằng" (balanced)

   2. Sau khi tách, hai nút mới đầy khoảng 50%
      → đây là nguồn gốc của "index phình" ở [bài 4 phase-4]

   3. Cây cao thêm một tầng thì SỨC CHỨA NHÂN LÊN ~500 LẦN
      → nên chuyện cao thêm tầng xảy ra CỰC KỲ hiếm
```

Tính chất 1 là lý do bạn có thể tin vào con số "4 lần I/O": **không có dòng nào may mắn hơn dòng nào**.

### Xoá và gộp nút

Ngược lại: khi một nút xuống dưới nửa số phần tử tối thiểu, nó **mượn** từ nút anh em, hoặc **gộp** với nút anh em.

Nhưng trong database thực tế, chuyện này ít xảy ra hơn lý thuyết nhiều:

```text
   PostgreSQL: DELETE chỉ ĐÁNH DẤU CHẾT. Mục index vẫn nằm đó
               cho tới khi VACUUM dọn. Ngay cả khi đó, page rỗng
               cũng thường được giữ lại để tái dùng chứ không gộp.

   → Hệ quả: CHIỀU CAO CÂY GẦN NHƯ KHÔNG BAO GIỜ GIẢM.
     Xoá 90% dữ liệu thì index vẫn cao như cũ, chỉ là rỗng ruột.
     Muốn thu gọn thật thì phải REINDEX.
```

---

## Ba hạn chế của B-Tree gốc

Đây là phần dẫn tới B+Tree ở [bài 2](02-btree-plus-va-ung-dung-thuc-te.md).

### Hạn chế 1 — Giá trị nằm ở mọi nút, ăn hết chỗ

```text
   MỘT PAGE 8 KB CỦA NÚT TRONG

   B-TREE GỐC: mỗi phần tử = khoá + GIÁ TRỊ + con trỏ con
   ┌──────────────────────────────────────────────────────┐
   │ k=17│val│→ │ k=35│val│→ │ k=52│val│→ │ ... │         │
   └──────────────────────────────────────────────────────┘
     khoá 8B + giá trị 8B + con trỏ 8B = 24 byte mỗi phần tử
     → 8.192 / 24 ≈ 341 phần tử

   NẾU KHOÁ LÀ UUID DẠNG CHUỖI (36 byte):
     36 + 8 + 8 = 52 byte
     → 8.192 / 52 ≈ 157 phần tử   ← FAN-OUT GIẢM HƠN MỘT NỬA
```

Và fan-out giảm thì cây cao lên:

```text
   fan-out 341:  341³  ≈ 39.000.000  → 3 tầng đủ cho 39 triệu dòng
   fan-out 157:  157³  ≈  3.900.000  → 3 tầng chỉ đủ 3,9 triệu
                                        → 1 tỷ dòng cần 5 tầng

   → THÊM 2 LẦN I/O CHO MỖI LẦN TÌM KIẾM, chỉ vì đổi kiểu khoá.
```

Đây là lời giải thích ở tầng cấu trúc dữ liệu cho lời khuyên **"khoá chính phải nhỏ"**.

Điều lãng phí hơn nữa: khi duyệt xuống, bạn **chỉ dùng khoá** để so sánh. Phần `val` ở các nút trong hoàn toàn không được dùng — nhưng vẫn phải đọc lên vì nó nằm cùng page.

### Hạn chế 2 — Truy vấn khoảng phải nhảy loạn xạ

Tìm mọi khoá từ 4 đến 9 trong B-Tree gốc:

```text
                    ┌──────────┐
                    │ [5]      │
                    └──┬────┬──┘
              ┌────────┘    └────────┐
         ┌────▼───┐              ┌───▼──────┐
         │ [3]    │              │ [7] [9]  │
         └─┬───┬──┘              └─┬──┬───┬─┘
        ┌──▼┐ ┌▼──┐             ┌──▼┐┌▼─┐┌─▼──┐
        │ 1 │ │ 4 │             │ 6 ││8 ││ 10 │
        └───┘ └───┘             └───┘└──┘└────┘

   Tìm 4  → gốc → [3] → lá[4]        3 lần I/O
   Tìm 5  → gốc (thấy ngay)          1 lần I/O
   Tìm 6  → gốc → [7,9] → lá[6]      3 lần I/O
   Tìm 7  → gốc → [7,9] (thấy)       2 lần I/O
   Tìm 8  → gốc → [7,9] → lá[8]      3 lần I/O
   Tìm 9  → gốc → [7,9] (thấy)       2 lần I/O
   ─────────────────────────────────────────────
   TỔNG: 14 lần duyệt cho 6 giá trị NẰM SÁT NHAU

   Chúng liền kề về mặt LOGIC, nhưng phải leo lên leo xuống
   cây để đi từ cái này sang cái kia.
```

Đây là hạn chế nghiêm trọng nhất trong thực tế, vì truy vấn khoảng (`BETWEEN`, `>`, `ORDER BY ... LIMIT`) chiếm phần rất lớn khối lượng công việc thật.

### Hạn chế 3 — Nút trong khó nằm trọn trong RAM

Vì các nút trong bị phình bởi giá trị, tổng kích thước các tầng trên lớn hơn cần thiết. Nếu chúng không nằm trọn trong RAM thì mỗi lần tìm kiếm phải chạm đĩa ngay từ tầng đầu — mất luôn ưu thế chính của B-Tree.

---

## Xem cây thật trên PostgreSQL

```sql
CREATE EXTENSION IF NOT EXISTS pageinspect;

CREATE TABLE t (id BIGINT PRIMARY KEY, val TEXT);
INSERT INTO t SELECT i, repeat('x', 50) FROM generate_series(1, 5000000) AS i;
```

```sql
SELECT * FROM bt_metap('t_pkey');
```

```text
 magic  | version | root | level | fastroot | fastlevel | ...
--------+---------+------+-------+----------+-----------+-----
 340322 |       4 |  412 |     2 |      412 |         2 |
```

`level = 2` nghĩa là cây có **3 tầng** (đếm từ 0). Năm triệu dòng, ba tầng.

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT version, tree_level, index_size, root_block_no,
       leaf_pages, avg_leaf_density
FROM pgstatindex('t_pkey');
```

```text
 version | tree_level | index_size | root_block_no | leaf_pages | avg_leaf_density
---------+------------+------------+---------------+------------+------------------
       4 |          2 |  112336896 |           412 |      13712 |            90.05
```

Ba con số đáng đọc:

| Con số | Nghĩa |
|---|---|
| `tree_level = 2` | Cây 3 tầng cho 5 triệu dòng |
| `leaf_pages = 13712` | 5.000.000 / 13.712 ≈ **365 khoá mỗi lá** — đúng như tính fan-out |
| `avg_leaf_density = 90` | Lá đầy 90% — khớp `fillfactor` mặc định của index |

Thử với khoá lớn hơn để thấy fan-out giảm:

```sql
CREATE TABLE t_uuid (id UUID PRIMARY KEY, val TEXT);
INSERT INTO t_uuid SELECT gen_random_uuid(), repeat('x', 50)
FROM generate_series(1, 5000000);

SELECT tree_level, leaf_pages, avg_leaf_density,
       pg_size_pretty(index_size::bigint) AS kich_thuoc
FROM pgstatindex('t_uuid_pkey');
```

```text
 tree_level | leaf_pages | avg_leaf_density | kich_thuoc
------------+------------+------------------+------------
          2 |      27423 |            67.42 | 220 MB
```

```text
   BIGINT :  13.712 lá,  mật độ 90,0%,  107 MB
   UUID   :  27.423 lá,  mật độ 67,4%,  220 MB

   → GẤP ĐÔI số lá, mật độ THẤP HƠN 25%, dung lượng GẤP ĐÔI
```

Mật độ 67% thay vì 90% chính là dấu vết của việc **tách page do chèn ngẫu nhiên** ([phase-4 bài 4](../phase-4/04-bloom-filter-va-uuid-performance.md)). Cấu trúc dữ liệu không nói dối.

---

## Vì sao không có nút vặn cho fan-out

Câu hỏi thường gặp: nếu fan-out lớn thì tốt, sao không tăng page lên 64 KB để fan-out lớn hơn nữa?

```text
   PAGE LỚN HƠN                        PAGE NHỎ HƠN
   ════════════                        ════════════
   ✔ fan-out lớn, cây thấp             ✔ đọc ít byte thừa
   ✔ ít lần I/O khi tìm kiếm           ✔ ít tranh chấp khoá trên page
   ✘ mỗi lần I/O đọc nhiều byte thừa   ✘ cây cao hơn
   ✘ tách page tốn kém hơn             ✘ nhiều lần I/O hơn
   ✘ page bẩn nặng hơn khi ghi WAL     ✘ tỉ lệ header/dữ liệu xấu hơn
```

8 KB (PostgreSQL) và 16 KB (InnoDB) là điểm cân bằng được rút ra từ thực tế nhiều thập kỷ, khớp với đơn vị đọc của phần cứng và của hệ điều hành. Đổi được (PostgreSQL phải biên dịch lại, InnoDB có `innodb_page_size`) nhưng gần như không bao giờ nên đổi.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Hình dung B-Tree như cây nhị phân trong sách giáo khoa | Trong database, **một nút = một page**, fan-out hàng trăm | Luôn nghĩ theo page |
| Dùng khoá lớn (UUID chuỗi, khoá phức dài) | Fan-out giảm → cây cao thêm → thêm I/O cho **mọi** lần tìm | Khoá nhỏ nhất có thể |
| Tưởng xoá dữ liệu thì index tự thu nhỏ | Chiều cao cây gần như không bao giờ giảm | `REINDEX CONCURRENTLY` |
| Tưởng hash index luôn nhanh hơn B-Tree | Hash không làm được khoảng, sắp xếp, tiền tố | B-Tree cho gần như mọi trường hợp |
| Ngạc nhiên vì `avg_leaf_density` thấp | Đó là dấu vết của tách page do chèn ngẫu nhiên | Khoá tăng dần, hoặc `REINDEX` định kỳ |
| Chỉnh `innodb_page_size` để "tối ưu" | Đánh đổi phức tạp, mặc định đã là điểm cân bằng tốt | Để nguyên |

## Tóm tắt bài 1

- Ba cấu trúc đơn giản hơn đều gãy: mảng không sắp xếp (đọc hết), mảng sắp xếp (chèn đắt), bảng băm (không làm được khoảng), cây nhị phân (**quá cao**, mỗi tầng một lần chạm đĩa).
- **Ý tưởng trung tâm của B-Tree: một nút = một page.** Fan-out ~500 thay vì 2 làm cây từ 30 tầng xuống còn 4 tầng.
- Nút chứa **phần tử** = khoá + con trỏ dữ liệu. Con trỏ trỏ tới `ctid` (PostgreSQL) hoặc tới **primary key** (InnoDB) — khác biệt này lan ra rất nhiều hệ quả.
- **Cây chỉ cao lên từ gốc**, nên mọi lá ở cùng độ sâu → mọi lần tìm kiếm tốn đúng bằng nhau số I/O. Đó là ý nghĩa của "cân bằng".
- Tách page để lại các nút đầy ~50% — nguồn gốc của index phình. Và **chiều cao cây gần như không bao giờ giảm** khi xoá dữ liệu.
- Ba hạn chế của B-Tree gốc: **giá trị chiếm chỗ ở mọi nút** (giảm fan-out), **truy vấn khoảng nhảy loạn xạ** (14 lần duyệt cho 6 giá trị liền kề), **nút trong khó nằm trọn trong RAM**.
- Đo thật: khoá `BIGINT` cho 13.712 lá mật độ 90%; đổi sang UUID cho 27.423 lá mật độ 67% — **gấp đôi dung lượng** cho cùng số dòng.

**Bài kế tiếp** → [Bài 2: B+Tree và ứng dụng trong Database Systems](02-btree-plus-va-ung-dung-thuc-te.md)

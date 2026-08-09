# Bài 4: Bitmap index — khi "cột ít giá trị đừng đánh index" là lời khuyên đúng cho một nửa công ty

Cột `trang_thai` của bảng đơn hàng có đúng **4 giá trị**: `cho_xu_ly`, `dang_giao`, `hoan_thanh`, `huy`. Bảng **80.000.000 dòng**.

Bạn đánh index lên nó, chạy lại câu lệnh, và máy vẫn quét sạch cả bảng như chưa có gì.

Bạn tra tài liệu. Tài liệu trả lời rất rõ: *"Cột ít giá trị (low cardinality) thì đừng đánh index, vì nó không lọc được bao nhiêu."* Đúng — và bộ tối ưu cũng nghĩ y hệt, nên nó bỏ qua.

Nhưng cùng công ty đó, tầng dưới, **đội kho dữ liệu đánh index chính trên mấy cột 4 giá trị ấy**. Báo cáo của họ chạy nhanh hơn gấp cả trăm lần.

Hai đội, cùng một cột, hai kết luận ngược hẳn nhau. **Và không đội nào sai cả.**

Thứ khác nhau giữa họ không phải cái cột. Là **cái cấu trúc nằm dưới chữ "index"**.

---

## Phần 1 — Vì sao bộ tối ưu bỏ qua B-Tree ở đây (và nó tính đúng)

Trước khi nói về cấu trúc mới, phải hiểu chính xác cái cũ hỏng ở đâu. Vì nó **không hỏng ở chỗ bạn nghĩ**.

B-Tree trên cột 4 giá trị vẫn chạy được. Nó tra ra rất nhanh — cây vẫn 3 tầng, vẫn `O(log n)`. Vấn đề nằm ở **thứ nó trả về**.

```sql
SELECT * FROM don_hang WHERE trang_thai = 'huy';
```

Cây B trả lời: **20.000.000 dòng**. Không phải 20 dòng. Một phần tư cả bảng. Và mỗi dòng là **một con trỏ tới một chỗ khác nhau trên đĩa**.

```text
Con đường của Index Scan:

  index ──► ctid (12,4)  ──► đọc trang 12   ┐
        ──► ctid (9871,2)──► đọc trang 9871 │  mỗi lần một trang KHÁC
        ──► ctid (33,1)  ──► đọc trang 33   │  → đọc NGẪU NHIÊN
        ──► ... 20 triệu lần ...            ┘

Con đường của Seq Scan:

  đọc trang 1 → 2 → 3 → ... → 800.000       → đọc TUẦN TỰ
```

Đây là chỗ con số nói hết. PostgreSQL định giá hai kiểu đọc **khác nhau bốn lần**:

```text
  seq_page_cost    = 1.0     ← đọc trang kế tiếp
  random_page_cost = 4.0     ← nhảy tới trang bất kỳ  (mặc định; SSD nên hạ về 1.1)

Bảng 80 triệu dòng ≈ 800.000 trang (8 KB, ~100 dòng/trang):

  Seq Scan       : 800.000 × 1.0                    =    800.000
  Index Scan     : 20.000.000 × 4.0  (heap fetch)   = 80.000.000
                   + chi phí đi index

  → Index Scan đắt gấp 100 lần. Optimizer chọn Seq Scan, VÀ NÓ ĐÚNG.
```

Nghịch lý nằm ở đây: **bạn đọc 20 triệu dòng bằng cách chạm vào 800.000 trang nhiều lần, thay vì chạm mỗi trang đúng một lần**. Với tỷ lệ 1/4 cả bảng, gần như trang nào cũng chứa ít nhất một dòng khớp — nên đằng nào cũng phải đọc hết mọi trang, chỉ khác là bạn đọc chúng **lộn xộn** thay vì **theo hàng**.

> **Ngưỡng lật** (thuộc lòng con số này): index thắng khi kết quả dưới khoảng **5-10% số dòng**. Trên 20-30% thì quét tuần tự thắng chắc. Ở giữa là vùng xám mà bitmap heap scan (phần 4) chen vào.

Vậy **câu hỏi thật không phải** *"Cột này có đáng đánh index không?"*. Câu hỏi thật là:

> **"Có cách lưu nào khác không, để một phần tư cả bảng vẫn trả lời được nhanh?"**

---

## Phần 2 — Ý tưởng: bỏ con trỏ, chỉ lưu bit

Ý tưởng đơn giản tới mức hơi bất ngờ. Thay vì lưu **danh sách con trỏ**, ta lưu **một dãy bit**.

Mỗi giá trị của cột thành một dãy bit. Dãy đó dài **đúng bằng số dòng của bảng**. Bit thứ *i* trả lời đúng một câu: *"Dòng thứ i có mang giá trị này không?"* — có thì `1`, không thì `0`.

```text
Bảng 8 dòng:

  dòng:        1    2    3    4    5    6    7    8
  trang_thai:  huy  giao huy  done cho  done huy  giao

Bốn dãy bit:

  cho_xu_ly  :  0    0    0    0    1    0    0    0
  dang_giao  :  0    1    0    0    0    0    0    1
  hoan_thanh :  0    0    0    1    0    1    0    0
  huy        :  1    0    1    0    0    0    1    0
                ▲         ▲                   ▲
                └─────────┴───────────────────┘
        nhìn vào dãy "huy" là biết ngay dòng 1, 3, 7 —
        không đọc bảng, không con trỏ nào.
```

Phóng lên cỡ thật:

```text
80.000.000 dòng × 4 giá trị = 320.000.000 bit
320.000.000 / 8              =  40.000.000 byte  =  40 MB
```

Nghe to. Nhưng 40 MB đó còn **nén được rất mạnh**, và lý do nén được chính là lý do khiến B-Tree vô dụng.

### Vì sao nén được mạnh: cái làm B-Tree hỏng lại làm bitmap nhỏ

Cột ít giá trị thì các bit giống nhau nằm thành **từng cụm dài**. Chỉ cần ghi *"cụm này dài bao nhiêu"* thay vì ghi từng bit — kỹ thuật gọi là **mã hoá độ dài loạt (Run-Length Encoding, RLE)**:

```text
Thô  : 0000000000000000000000001111111111100000000000000000000...
RLE  : (0 × 24) (1 × 11) (0 × 3.000) ...
       ▲
       ba con số thay cho 3.035 bit
```

```text
  40 MB  ──RLE──►  vài trăm KB
```

Trong thực tế, các hệ dùng biến thể tinh vi hơn: **WAH** (Word-Aligned Hybrid, Oracle dùng họ này) và **Roaring Bitmap** (chuẩn de-facto hiện nay, dùng trong Elasticsearch/Lucene, Druid, ClickHouse, Spark). Roaring chia không gian thành khối 65.536 bit rồi **chọn cách lưu riêng cho từng khối** tuỳ mật độ:

```text
Khối thưa  (< 4.096 bit bật)  → lưu mảng số hiệu (2 byte mỗi số)
Khối dày   (> 4.096 bit bật)  → lưu bitmap thô (8 KB cố định)
Khối liền  (chạy dài)         → lưu danh sách khoảng [từ, tới]

  → mỗi khối tự chọn dạng rẻ nhất. Đây là lý do Roaring
    thắng cả RLE thuần lẫn bitmap thuần trên dữ liệu thật.
```

> **Chốt khối 1.** Càng ít giá trị thì dãy bit càng lặp, càng lặp thì càng nén tốt. **Chính cái làm B-Tree vô dụng lại là chính cái làm bitmap nhỏ đi.** Hai cấu trúc phản ứng ngược chiều nhau trước cùng một tính chất của dữ liệu.

---

## Phần 3 — Chỗ bitmap thật sự thắng: câu hỏi nhiều điều kiện

Nhỏ chưa phải là nhanh. Chỗ bitmap thắng nằm ở **câu hỏi thật**, mà câu hỏi thật thì gần như không bao giờ chỉ có một điều kiện.

Báo cáo thật nghe thế này:

```sql
SELECT COUNT(*), SUM(tong_tien)
FROM don_hang
WHERE trang_thai = 'huy'
  AND kenh       = 'app'
  AND mien       = 'bac';
```

Ba điều kiện trên ba cột, và cột nào cũng chỉ vài giá trị.

**Với B-Tree**: ba lần đi cây riêng, ra ba tập con trỏ khổng lồ (20 triệu, 30 triệu, 25 triệu), rồi máy phải **gộp ba tập đó lại**. Bước gộp mới là bước đắt — nó là sắp xếp và giao nhau trên hàng chục triệu con trỏ.

**Với bitmap**: ba dãy bit **chồng lên nhau**, lấy phép `AND` từng bit một. Bit nào cả ba cùng bằng `1` thì dòng đó lọt. Chấm hết.

```text
  huy   : 1 0 1 0 0 0 1 0
  app   : 1 1 1 0 0 1 1 0
  bac   : 1 0 1 1 0 1 0 0
  ────────────────────── AND
  kết quả 1 0 1 0 0 0 0 0     → dòng 1 và dòng 3
```

Và phép `AND` trên bit là **thứ rẻ nhất mà một con chip biết làm**. Nó xử lý cả một từ máy trong một nhịp:

```text
  CPU 64-bit thường : 64 bit / nhịp
  có AVX2           : 256 bit / nhịp
  có AVX-512        : 512 bit / nhịp

  80.000.000 dòng / 64 = 1.250.000 nhịp
  ở 3 GHz              ≈ 0,4 mili giây cho MỘT phép AND toàn bảng
```

So sánh trực diện:

| | B-Tree | Bitmap |
|---|---|---|
| Lọc từng cột | 3 lần đi cây, ra 3 danh sách ctid | 3 lần tra, ra 3 dãy bit |
| Gộp kết quả | Sắp xếp + giao nhau ~75 triệu con trỏ | `AND` từng từ máy, 1,25 triệu nhịp |
| Thời gian gộp | hàng giây | dưới 1 mili giây |
| Thêm điều kiện thứ 4 | Thêm một tập lớn nữa phải gộp | Thêm **một** phép `AND` nữa |
| `COUNT(*)` | Phải đếm từng dòng | **Đếm bit bật** (`POPCNT`, 1 lệnh CPU) |

Dòng cuối là món quà ít ai để ý: `COUNT(*)` trên bitmap **không cần chạm bảng chút nào** — chỉ đếm số bit bật. Đây là lý do màn hình dashboard kiểu *"hôm nay có bao nhiêu đơn huỷ từ app ở miền Bắc"* chạy dưới 10 ms trên kho dữ liệu 80 triệu dòng.

> **Chốt khối 2.** B-Tree **lọc từng cột rồi mới gộp**. Bitmap **gộp luôn trong lúc lọc**. Càng nhiều điều kiện, khoảng cách càng giãn ra — và đó chính xác là hình dạng của mọi câu truy vấn báo cáo.

---

## Phần 4 — Cái giá, và nó nằm đúng ở chỗ vừa làm nó nhỏ

Tới đây nghe như bitmap thắng mọi mặt. Nó không. Và cái giá của nó nằm đúng ở **phép nén**.

Một khách bấm huỷ đơn. Đúng **một dòng** đổi trạng thái.

Với B-Tree: máy sửa một lá là xong. Với bitmap, chuyện dài hơn nhiều — vì bit của dòng đó **không nằm riêng**. Nó nằm trong một cụm đã nén chung với hàng nghìn dòng hàng xóm.

```text
Sửa 1 dòng trong bitmap đã nén:

  1. giải nén cả cụm         (~hàng nghìn dòng)
  2. lật 1 bit ở dãy "cho_xu_ly" về 0
  3. lật 1 bit ở dãy "huy"    lên 1        ← phải sửa HAI dãy
  4. nén lại cả cụm từ đầu
  5. ghi xuống

  Và trong suốt bước 1-5, cả cụm bị KHOÁ.
```

Nghĩa là **một người sửa một đơn, vô tình chặn luôn hàng nghìn đơn khác** nằm cạnh nó trong dãy bit. Đây không phải khoá dòng nữa — nó là khoá **một mảnh của cấu trúc index**, và ranh giới mảnh đó chẳng liên quan gì tới nghiệp vụ.

```text
Ba giao dịch cùng lúc trên bảng có bitmap index:

  T1: huỷ đơn #4.812.003  ──┐
  T2: huỷ đơn #4.812.117  ──┼── cùng rơi vào một cụm nén
  T3: huỷ đơn #4.812.940  ──┘

  → T2, T3 xếp hàng chờ T1, dù ba đơn hoàn toàn không liên quan gì nhau.
```

Trên hệ OLTP có nghìn lượt ghi mỗi giây, đây là **thảm hoạ** — và nó biểu hiện thành cái mà đội vận hành gọi là *"tự nhiên deadlock/timeout hàng loạt không rõ lý do"*.

> **Chốt khối 3.** Thứ quyết định bitmap dùng được hay không **không phải kiểu dữ liệu, cũng không phải số giá trị của cột**. Là **số người ghi cùng lúc vào bảng đó**.

Bảng cân đối cuối cùng:

| Bảng của bạn | Bitmap là gì |
|---|---|
| Kho dữ liệu, nạp 1 lần mỗi đêm rồi chỉ đọc | **Món quà** |
| Bảng báo cáo, `INSERT` theo lô, không `UPDATE` | Tốt |
| Bảng đơn hàng, nghìn lượt ghi mỗi giây | **Cái bẫy** |

Và bây giờ hai đội ở đầu bài đã được giải thích trọn vẹn: **đội ứng dụng đúng vì bảng của họ có người ghi liên tục; đội kho dữ liệu cũng đúng vì bảng của họ chỉ đọc.** Cùng một cột, hai câu trả lời, không ai sai.

---

## Phần 5 — Chỗ khó chịu nhất: PostgreSQL **không có** Bitmap Index

Bạn vừa nghe xong ba khối về bitmap và rất có thể đang định mở PostgreSQL lên gõ thử. **Đừng.**

```sql
CREATE BITMAP INDEX idx ON don_hang (trang_thai);
-- ERROR:  syntax error at or near "BITMAP"
```

PostgreSQL **không có bitmap index**. Không hề có. Câu lệnh tạo nó không tồn tại và **chưa bao giờ tồn tại**.

Thứ PostgreSQL có tên là **Bitmap Index Scan**, và nó là **một thứ khác hẳn**.

### Hai cái tên khác nhau một chữ, mà một cái là **cách LƯU**, một cái là **cách CHẠY**

| | Bitmap **Index** (Oracle) | Bitmap Index **Scan** (PostgreSQL) |
|---|---|---|
| Là gì | Cấu trúc **lưu trên đĩa** | **Bước trong kế hoạch chạy** |
| Sống bao lâu | Vĩnh viễn tới khi `DROP` | Vài mili giây rồi vứt |
| Ai tạo | Bạn, bằng `CREATE BITMAP INDEX` | Optimizer, tự quyết mỗi lần chạy |
| Dựng từ đâu | Từ dữ liệu cột | Từ **index B-Tree có sẵn** |
| Thấy ở đâu | `pg_indexes` / `user_indexes` | Chỉ trong `EXPLAIN` |

> Nửa số câu trả lời bạn đọc trên mạng nhầm đúng chỗ này, và **cái nhầm đó không bao giờ tự lộ ra** — vì cả hai đều "chạy được", chỉ là bạn đang nói về hai tầng khác nhau.

### Bitmap Index Scan thật sự làm gì (đây là phần đáng học nhất)

Đây là lời giải của PostgreSQL cho đúng cái vấn đề ở phần 1: **đọc ngẫu nhiên 20 triệu lần**. Nó không đổi cách lưu, nó đổi **thứ tự đọc**.

```text
Ba bước:

1. Bitmap Index Scan  : đi index B-Tree, KHÔNG đọc heap ngay.
                        Thay vào đó đánh dấu vào một bitmap TRONG RAM:
                        "trang nào có dòng khớp".

2. BitmapAnd/BitmapOr : nếu có nhiều index, giao/hợp các bitmap đó
                        bằng phép bit — đúng ý tưởng của bài này.

3. Bitmap Heap Scan   : đọc heap theo ĐÚNG THỨ TỰ SỐ TRANG TĂNG DẦN.
                        → đọc ngẫu nhiên biến thành đọc gần-tuần-tự.
                        → mỗi trang chạm ĐÚNG MỘT LẦN.
```

```text
Index Scan thường:   trang 9871 → 33 → 4402 → 33 → 12 → 9871 → ...
                     (nhảy lung tung, trang lặp lại nhiều lần)

Bitmap Heap Scan:    trang 12 → 33 → 4402 → 9871 → ...
                     (tăng dần, mỗi trang đúng một lần)
```

Đọc một plan thật:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM don_hang WHERE trang_thai = 'huy' AND kenh = 'app';
```

```text
Bitmap Heap Scan on don_hang  (cost=... rows=6000000 ...)
  Recheck Cond: (trang_thai = 'huy')
  Filter: (kenh = 'app')
  Heap Blocks: exact=412033 lossy=98211          ← ĐỌC KỸ DÒNG NÀY
  ->  BitmapAnd
        ->  Bitmap Index Scan on idx_trang_thai  (rows=20000000)
        ->  Bitmap Index Scan on idx_kenh        (rows=30000000)
```

Ba chi tiết phải biết đọc:

**`BitmapAnd`** — đây chính là "gộp trong lúc lọc" của bài này, chỉ khác là bitmap dựng tạm trong RAM. Cùng ý tưởng, khác vòng đời.

**`lossy=98211`** — đây là chỗ quan trọng nhất. Bitmap tạm bị giới hạn bởi `work_mem`. Khi không đủ chỗ ghi *"dòng nào khớp"*, PostgreSQL hạ độ phân giải xuống *"trang nào có dòng khớp"* — gọi là **lossy**. Hệ quả: nó phải đọc cả trang rồi **kiểm lại từng dòng**.

**`Recheck Cond`** — chính là bước kiểm lại đó. Nó luôn xuất hiện trong plan, nhưng chỉ **thật sự tốn công** khi có phần lossy.

```sql
-- Thấy lossy lớn → tăng work_mem cho phiên đó rồi đo lại
SET work_mem = '256MB';
```

Đây là một trong những chỉnh tay rẻ tiền và hiệu quả nhất cho truy vấn báo cáo — và gần như không ai biết vì nó nằm ở dòng thứ tư của một plan mà đa số chỉ đọc dòng đầu.

---

## Phần 6 — Vậy trên PostgreSQL thì làm gì? (phần mở rộng ngoài transcript)

Bạn có bảng 80 triệu dòng và một cột 4 giá trị. PostgreSQL không có bitmap index. Đây là **năm phương án thật**, xếp theo thứ tự nên thử.

### 1. Partial index — thường là câu trả lời đúng nhất

Nếu bạn chỉ quan tâm **một** trong bốn giá trị (và nó hiếm), đừng index cả cột:

```sql
-- Chỉ 0,3% đơn ở trạng thái lỗi, nhưng dashboard hỏi nó suốt
CREATE INDEX idx_dh_loi ON don_hang (ngay_tao)
    WHERE trang_thai = 'loi';
-- Index vài MB thay vì vài GB, và nó LUÔN được dùng vì độ chọn lọc cao
```

Đây là chỗ *"cột ít giá trị đừng đánh index"* sai hoàn toàn: nếu **phân bố lệch**, partial index trên nhánh hiếm là công cụ mạnh nhất bạn có.

### 2. Đưa cột ít giá trị vào **sau** cột chọn lọc cao

```sql
-- SAI: index riêng cột trang_thai
CREATE INDEX ON don_hang (trang_thai);

-- ĐÚNG: cột lọc mạnh đứng trước, cột ít giá trị đi kèm để lọc nốt
CREATE INDEX ON don_hang (ngay_tao, trang_thai);
CREATE INDEX ON don_hang (khach_hang_id, trang_thai);
```

Cột 4 giá trị **gần như không bao giờ đáng đứng một mình**, nhưng rất đáng làm cột thứ hai.

### 3. Để `BitmapAnd` làm việc — đánh index từng cột rồi tin optimizer

```sql
CREATE INDEX ON don_hang (trang_thai);
CREATE INDEX ON don_hang (kenh);
CREATE INDEX ON don_hang (mien);
SET work_mem = '256MB';
```

Đây là bản "bitmap của người nghèo": không có cấu trúc trên đĩa, nhưng có đúng phép giao bit lúc chạy. Với báo cáo chạy vài lần một ngày, thường là đủ.

### 4. `btree_gin` — gần với bitmap index nhất mà PostgreSQL có sẵn

```sql
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE INDEX idx_dh_gin ON don_hang USING GIN (trang_thai, kenh, mien);
```

GIN lưu, với mỗi giá trị, một **danh sách ctid đã nén** — về bản chất rất gần một bitmap trên đĩa. Nó giao các danh sách đó ngay trong index. Cái giá đúng như bài đã cảnh báo: **ghi chậm hơn nhiều** (giảm bớt bằng `fastupdate`, xem bài 6).

### 5. Đổi hẳn sang cột-store cho phần báo cáo

Nếu đây thật sự là bài toán kho dữ liệu, câu trả lời hiện đại không phải bitmap index mà là **lưu theo cột**:

| Công cụ | Cách làm |
|---|---|
| Citus Columnar | Bảng cột-store ngay trong PostgreSQL |
| ClickHouse / Druid | Cột-store + Roaring bitmap cho lọc |
| SQL Server | Clustered Columnstore Index |
| Oracle | Bitmap index + bitmap **join** index |

Cột-store nén cột 4 giá trị xuống gần như không tốn gì (dictionary encoding + RLE), và quét 80 triệu dòng của **một cột** rẻ hơn quét 80 triệu dòng của **cả bảng** cả chục lần.

---

## Phần 7 — Bitmap index ở Oracle, cho đủ bức tranh

```sql
CREATE BITMAP INDEX idx_dh_trangthai ON don_hang (trang_thai);
CREATE BITMAP INDEX idx_dh_kenh      ON don_hang (kenh);
```

Hai điều Oracle làm mà rất đáng biết:

**Bitmap join index** — dựng bitmap trên bảng sự kiện theo cột của **bảng chiều** (dimension), tức là gộp sẵn phép join vào index:

```sql
CREATE BITMAP INDEX idx_dh_tinh
    ON don_hang (kh.tinh_thanh)
    FROM don_hang dh, khach_hang kh
    WHERE dh.khach_hang_id = kh.id;
-- → lọc "đơn của khách ở Hà Nội" mà không join lúc chạy
```

Đây là xương sống của mô hình **star schema** trong kho dữ liệu cổ điển.

**Và cảnh báo chính thức từ Oracle**, đúng như phần 4 của bài: bitmap index **không dành cho bảng OLTP**, vì một lần `UPDATE` khoá cả một đoạn bitmap.

Một chỗ Oracle đính chính lại trực giác phổ biến: bitmap **không** chỉ tốt cho cột 2-4 giá trị. Tài liệu Oracle nói rõ nó vẫn hiệu quả với cột **hàng nghìn** giá trị phân biệt trong kho dữ liệu, miễn là bảng lớn và chỉ đọc. Ranh giới thật là **đọc/ghi**, không phải **cardinality**.

---

## Câu hỏi phỏng vấn

**"Cột `gioi_tinh` / `trang_thai` có nên đánh index không?"**
Câu trả lời một tầng (*"không, vì cardinality thấp"*) là câu trả lời của người đọc tài liệu. Câu trả lời ba tầng:
1. Nếu **phân bố đều** và bảng OLTP → không, đúng như tài liệu, vì kết quả chiếm 25% bảng thì heap fetch ngẫu nhiên đắt hơn quét tuần tự.
2. Nếu **phân bố lệch** (0,3% là `loi`) → có, nhưng bằng **partial index** trên nhánh hiếm.
3. Nếu đây là **kho dữ liệu chỉ đọc** và câu hỏi lọc nhiều cột ít giá trị cùng lúc → có, và cấu trúc đúng là **bitmap index** (Oracle) hoặc cột-store, không phải B-Tree.

**"PostgreSQL có bitmap index không?"**
Không. Nó có **Bitmap Index Scan** — một bước trong kế hoạch chạy, dựng bitmap **tạm trong RAM** từ index B-Tree có sẵn để biến đọc ngẫu nhiên thành đọc theo thứ tự trang. Một cái là *cách lưu*, một cái là *cách chạy*. Nói được đúng chỗ này là điểm cộng lớn, vì phần lớn tài liệu tiếng Việt trên mạng nhầm.

**"Trong `EXPLAIN` thấy `Heap Blocks: exact=... lossy=...` nghĩa là gì?"**
`work_mem` không đủ chứa bitmap ở mức từng dòng, nên PostgreSQL hạ độ phân giải xuống mức **trang** cho phần `lossy`; những trang đó phải đọc rồi kiểm lại từng dòng qua `Recheck Cond`. Thấy `lossy` lớn thì tăng `work_mem` rồi đo lại.

**"Vì sao bitmap index không dùng được cho OLTP?"**
Vì bit của một dòng nằm trong một cụm đã nén chung với hàng nghìn dòng khác. Sửa một dòng phải giải nén — sửa — nén lại cả cụm, và khoá cả cụm trong lúc đó. Một người sửa một đơn chặn hàng nghìn đơn không liên quan. Yếu tố quyết định là **số lượt ghi đồng thời**, không phải cardinality.

---

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| "Cardinality thấp thì đừng index" — coi là luật tuyệt đối | Chỉ đúng cho OLTP với phân bố đều. Lệch phân bố → partial index; kho dữ liệu → bitmap/cột-store |
| Gõ `CREATE BITMAP INDEX` trên PostgreSQL | Lỗi cú pháp. Cấu trúc này chưa bao giờ tồn tại ở đó |
| Thấy `Bitmap Index Scan` rồi tưởng mình có bitmap index | Đó là bước chạy, dựng từ B-Tree, sống vài mili giây |
| Bỏ qua dòng `lossy=` trong `EXPLAIN` | Đó thường là nguyên nhân chính khiến báo cáo chậm |
| Đánh bitmap index trên bảng đơn hàng của Oracle | Khoá theo cụm → nghẽn ghi hàng loạt, khó chẩn đoán |
| Nghĩ bitmap chỉ hợp cột 2-4 giá trị | Oracle dùng được tới hàng nghìn giá trị, miễn là bảng chỉ đọc |
| Đánh index riêng lẻ cột `trang_thai` rồi thắc mắc sao không dùng | Cột ít giá trị hầu như chỉ đáng làm **cột thứ hai** trong composite |
| Quên rằng `UPDATE` trạng thái phải sửa **hai** dãy bit | Chi phí ghi gấp đôi so với hình dung ban đầu |

---

## Tóm tắt bài 4

- B-Tree trên cột ít giá trị **không hỏng ở bước tra**, nó hỏng ở bước **trả về**: 20 triệu con trỏ ngẫu nhiên đắt gấp ~100 lần một lần quét tuần tự. Optimizer bỏ index ở đây là **tính đúng**.
- Bitmap đổi cách lưu: mỗi giá trị một **dãy bit dài bằng số dòng**. 80 triệu dòng × 4 giá trị = 40 MB thô, và nén xuống vài trăm KB.
- **Càng ít giá trị càng nén tốt** — đúng cái tính chất làm B-Tree vô dụng lại làm bitmap nhỏ đi.
- Chỗ thắng thật là **nhiều điều kiện**: bitmap **gộp trong lúc lọc** bằng phép `AND` 64 bit/nhịp, còn B-Tree phải **lọc xong rồi mới gộp** hàng chục triệu con trỏ. `COUNT(*)` thành một lệnh `POPCNT`.
- Cái giá nằm đúng ở phép nén: sửa một dòng phải giải nén — sửa — nén lại **và khoá cả cụm hàng nghìn dòng**. Yếu tố quyết định là **ai ghi vào bảng**, không phải cột có mấy giá trị.
- **PostgreSQL không có bitmap index.** Nó có **Bitmap Index Scan** — bitmap tạm trong RAM, dựng từ B-Tree, để biến đọc ngẫu nhiên thành đọc theo số trang tăng dần. Đọc `Heap Blocks: exact/lossy` và chỉnh `work_mem`.
- Trên PostgreSQL, năm phương án theo thứ tự: **partial index** → **composite (cột lọc mạnh đứng trước)** → **để `BitmapAnd` làm việc** → **`btree_gin`** → **cột-store**.

**Bài kế tiếp** → [Bài 5: BRIN và điều kiện ngầm không ai viết ra](05-brin-va-dieu-kien-ngam-khong-ai-viet-ra.md)

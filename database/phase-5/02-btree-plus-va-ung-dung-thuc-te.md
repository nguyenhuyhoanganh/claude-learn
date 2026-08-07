# Bài 2: B+Tree — một thay đổi nhỏ sửa được cả ba hạn chế

[Bài 1](01-btree-co-ban.md) kết thúc với ba hạn chế của B-Tree gốc:

1. Giá trị nằm ở mọi nút → chiếm chỗ → fan-out nhỏ → cây cao.
2. Truy vấn khoảng phải leo lên leo xuống — 14 lần duyệt cho 6 giá trị liền kề.
3. Nút trong phình to → khó nằm trọn trong RAM.

**B+Tree sửa cả ba bằng đúng một thay đổi:**

> **Đẩy toàn bộ giá trị xuống tầng lá, và nối các lá lại thành một danh sách liên kết.**

Đơn giản đến mức khó tin. Bài này cho thấy vì sao nó đủ, và vì sao **mọi** database quan hệ thực tế đều dùng B+Tree chứ không dùng B-Tree.

## So sánh trực tiếp

```text
   B-TREE GỐC — giá trị ở MỌI nút
   ══════════════════════════════════════════════════════════
                  ┌───────────────────┐
                  │ 5│val │  8│val    │   ← nút trong CŨNG chứa giá trị
                  └─┬──────┬────────┬─┘
            ┌───────┘      │        └───────┐
      ┌─────▼─────┐  ┌─────▼─────┐   ┌──────▼────┐
      │1│val 3│val│  │6│val 7│val│   │9│val 11│val│
      └───────────┘  └───────────┘   └───────────┘
        (các lá KHÔNG nối với nhau)


   B+TREE — giá trị CHỈ ở lá, lá NỐI NHAU
   ══════════════════════════════════════════════════════════
                  ┌───────────────────┐
                  │   5   │   8       │   ← CHỈ có khoá, không có giá trị
                  └─┬──────┬────────┬─┘
            ┌───────┘      │        └───────┐
      ┌─────▼─────┐  ┌─────▼─────┐   ┌──────▼─────┐
      │1│val 3│val│⇄│5│val 6│val 7│val│⇄│8│val 9│val 11│val│
      └───────────┘  └────────────┘   └────────────┘
         ▲              ▲                 ▲
         └──────────────┴─────────────────┘
            DANH SÁCH LIÊN KẾT HAI CHIỀU giữa các lá

   Chú ý: khoá 5 và 8 xuất hiện HAI LẦN — một lần ở nút trong (dẫn đường),
          một lần ở lá (kèm giá trị). Đây là cái giá, sẽ bàn ở dưới.
```

---

## Sửa hạn chế 1: fan-out tăng gấp đôi trở lên

```text
   MỘT PAGE 8 KB CỦA NÚT TRONG, khoá BIGINT 8 byte

   B-TREE:   mỗi mục = khoá 8B + GIÁ TRỊ 8B + con trỏ con 8B = 24 byte
             8.192 / 24  ≈  341 nhánh

   B+TREE:   mỗi mục = khoá 8B + con trỏ con 8B          = 16 byte
             8.192 / 16  ≈  512 nhánh

                          → FAN-OUT TĂNG 1,5 LẦN
```

Với khoá dài thì khác biệt còn lớn hơn nhiều — vì phần "giá trị" là hằng số bị loại bỏ.

Fan-out tăng thì sức chứa của mỗi tầng tăng theo luỹ thừa:

```text
   SỐ DÒNG CHỨA ĐƯỢC THEO CHIỀU CAO CÂY

   Chiều cao   B-Tree (341)        B+Tree (512)
   ─────────   ─────────────       ────────────
   2 tầng          116.281            262.144
   3 tầng       39.651.821        134.217.728
   4 tầng   13.521.271.000     68.719.476.736

   → 3 TẦNG: B+Tree chứa gấp 3,4 LẦN
   → 4 TẦNG: B+Tree chứa 68 TỶ dòng

   Nói cách khác: gần như MỌI bảng bạn từng gặp
   đều nằm gọn trong một cây 3-4 tầng.
```

Đây là lời giải thích đầy đủ cho tiêu đề bài 1: **tìm 1 dòng trong 1 tỷ dòng chỉ tốn 4 lần đọc**.

---

## Sửa hạn chế 2: truy vấn khoảng thành đi bộ ngang

Đây là cải tiến có tác động lớn nhất trong thực tế.

Cùng bài toán ở [bài 1](01-btree-co-ban.md): lấy mọi khoá từ 4 đến 9.

```text
   B-TREE GỐC — 14 lần duyệt
   ══════════════════════════
   Tìm 4 → gốc → nút trong → lá        3 I/O
   Tìm 5 → LEO NGƯỢC LÊN GỐC → ...     1 I/O
   Tìm 6 → LEO NGƯỢC LÊN GỐC → ...     3 I/O
   Tìm 7 → LEO NGƯỢC LÊN GỐC → ...     2 I/O
   Tìm 8 → LEO NGƯỢC LÊN GỐC → ...     3 I/O
   Tìm 9 → LEO NGƯỢC LÊN GỐC → ...     2 I/O
   ─────────────────────────────────────────
                                      14 I/O


   B+TREE — 4 lần duyệt
   ═════════════════════
   Tìm 4:  gốc → nút trong → lá                     3 I/O
           ↓
   [lá:  4  5  6 ] ⇄ [lá:  7  8  9 ] ⇄ [lá: 10 ...]
     ▲───────────────────▶                          1 I/O
     đi thẳng sang lá kế bên theo con trỏ liên kết
   ─────────────────────────────────────────────────
                                                     4 I/O
```

```text
   14 I/O  →  4 I/O      GIẢM 3,5 LẦN trên ví dụ tí hon này
```

Và khoảng cách này **tăng theo kích thước khoảng**:

```text
   Lấy 10.000 dòng liên tiếp:

   B-TREE:  ~10.000 lần duyệt cây, mỗi lần 3-4 I/O
            → ~35.000 I/O, hoàn toàn NGẪU NHIÊN

   B+TREE:  3 I/O xuống lá đầu tiên
            + đi ngang qua ~28 lá (365 khoá mỗi lá)
            → 31 I/O, và gần như TUẦN TỰ

                    → NHANH HƠN HƠN 1.000 LẦN
```

Điều này giải thích vì sao các mẫu truy vấn sau chạy nhanh đến vậy trên B+Tree:

```sql
SELECT * FROM orders WHERE created_at BETWEEN '2026-01-01' AND '2026-01-31';
SELECT * FROM users  WHERE id > 1000 ORDER BY id LIMIT 100;
SELECT * FROM logs   ORDER BY ts DESC LIMIT 50;
```

Câu cuối đặc biệt thú vị: `ORDER BY ts DESC` đi **ngược** danh sách liên kết. Đó là lý do danh sách phải **hai chiều**, và cũng là lý do bạn thấy `Index Scan Backward` trong `EXPLAIN`.

---

## Sửa hạn chế 3: các tầng trên nằm gọn trong RAM

Vì nút trong chỉ chứa khoá, tổng dung lượng các tầng không phải lá rất nhỏ:

```text
   BẢNG 1 TỶ DÒNG, khoá BIGINT, B+Tree fan-out 512

   Tầng lá     : 1.000.000.000 / 365 ≈ 2.740.000 page × 8 KB = 21,9 GB
   Tầng 3      :     2.740.000 / 512 ≈     5.352 page × 8 KB = 42,8 MB
   Tầng 2      :         5.352 / 512 ≈        11 page × 8 KB =  88 KB
   Tầng 1 (gốc):                                1 page       =   8 KB
                                                ──────────────────────
   MỌI TẦNG TRỪ LÁ                                        ≈ 43 MB
```

**43 megabyte.** Máy chủ nào cũng thừa sức giữ toàn bộ phần đó trong RAM vĩnh viễn.

Hệ quả thực tế:

```text
   Tìm một dòng trong 1 tỷ dòng:
      tầng 1 (gốc)      → RAM     ~100 ns
      tầng 2            → RAM     ~100 ns
      tầng 3            → RAM     ~100 ns
      tầng lá           → có thể phải xuống đĩa   ~100 µs
      nhảy vào heap     → có thể phải xuống đĩa   ~100 µs
      ─────────────────────────────────────────────────────
      → THỰC TẾ CHỈ 1-2 LẦN CHẠM ĐĨA, không phải 4
```

Đây là lý do các hệ thống lớn vẫn cho thời gian phản hồi dưới mili-giây trên bảng hàng tỷ dòng.

---

## Cái giá: khoá bị nhân đôi

B+Tree không miễn phí. Khoá dùng để dẫn đường ở nút trong **cũng phải xuất hiện lại ở lá**, vì lá phải chứa đủ mọi khoá.

```text
   Nút trong:  [ 5 ][ 8 ]
   Lá:         [1,3] [5,6,7] [8,9,11]
                      ▲       ▲
                khoá 5 và 8 lặp lại
```

Cái giá này nhỏ tới mức không đáng bàn:

```text
   Số khoá ở nút trong ≈ số lá ≈ (tổng số khoá) / 365
                        ≈ 0,27% tổng số khoá

   → Tốn thêm chưa tới 0,3% dung lượng
   → Đổi lấy fan-out gấp 1,5 lần và truy vấn khoảng nhanh gấp 1.000 lần
```

Đây là một trong những đánh đổi có tỉ lệ lợi/hại tốt nhất trong toàn bộ ngành khoa học máy tính, và là lý do **không hệ nào còn dùng B-Tree gốc cho index của bảng**.

### Con trỏ giữa các lá là một LỰA CHỌN, không phải bắt buộc

Chi tiết này ít được nhắc, và nó cho thấy cách người thiết kế database suy nghĩ.

Danh sách liên kết ở tầng lá **cũng có giá**: mỗi lá phải lưu thêm hai con trỏ (trước và sau), và — quan trọng hơn — **mỗi lần tách page phải cập nhật con trỏ của hai lá hàng xóm**, tức là ba page bị sửa thay vì một.

Vì vậy không phải hệ nào cũng giữ nó:

| Hệ | Con trỏ giữa các lá | Vì sao |
|---|---|---|
| PostgreSQL, MySQL InnoDB, Oracle, SQL Server | **Có** | Truy vấn khoảng và `ORDER BY` là mẫu chính |
| **WiredTiger** (MongoDB) | **Không** | Truy vấn chủ yếu theo khoá; quét khoảng hiếm |

```text
   QUYET DINH CUA WIREDTIGER:
     "Ung dung MongoDB chu yeu tra theo _id hoac theo mot truong cu the.
      Quet khoang lien tuc rat hiem.
      → BO con tro la di, doi lay ghi nhanh hon va page gon hon."

   HE QUA:
     ✔ Tach page re hon (chi sua 1 page thay vi 3)
     ✔ Moi la chua duoc nhieu khoa hon
     ✘ Quet khoang phai LEO LAI CAY cho moi buoc
       → dung nhu han che cua B-Tree goc o [bai 1](01-btree-co-ban.md)
```

Bài học vượt ra ngoài chuyện B+Tree:

> **Người thiết kế database chỉ giữ lại những gì tải của họ thật sự cần.** Cùng một cấu trúc dữ liệu, hai hệ có thể cài khác nhau — và cả hai đều đúng, cho tải của họ.

Đây cũng là lời nhắc khi đọc tài liệu: câu "B+Tree có con trỏ giữa các lá" đúng với **phần lớn** hệ, nhưng không phải **mọi** hệ.

---

## Lá của B+Tree chứa gì — hai kiến trúc

Đây là chỗ PostgreSQL và MySQL rẽ hai hướng, và nó ảnh hưởng tới mọi thứ.

```text
   POSTGRESQL — LÁ CHỨA CON TRỎ
   ═════════════════════════════
   Lá index primary key:
      [ id=42 → ctid(1204, 7) ]  ← 8 byte khoá + 6 byte con trỏ
                    │
                    ▼
   HEAP (bảng, rời rạc):
      page 1204, khe 7:  [42 | 'Nguyen An' | '1990-01-02' | 15000]

   → Mọi index đều cùng cấu trúc: khoá → ctid
   → Bảng và index tách rời


   MYSQL INNODB — LÁ CHỨA CẢ DÒNG (clustered index)
   ═════════════════════════════════════════════════
   Lá clustered index:
      [ id=42 | 'Nguyen An' | '1990-01-02' | 15000 ]  ← CẢ DÒNG nằm đây
                                                        BẢNG CHÍNH LÀ CÂY

   Lá index phụ (trên name):
      [ 'Nguyen An' → id=42 ]  ← trỏ tới PRIMARY KEY, không trỏ vị trí
                       │
                       ▼ phải tra clustered index lần nữa
```

Bảng hệ quả:

| | PostgreSQL | MySQL InnoDB |
|---|---|---|
| Tra primary key | Index → heap: **2 chặng** | **1 chặng** — dòng nằm ngay ở lá |
| Tra index phụ | Index → heap: **2 chặng** | Index phụ → PK → clustered: **3 chặng** |
| Kích thước lá clustered | Nhỏ (chỉ khoá + con trỏ) | **Lớn** — chứa cả dòng |
| Quét theo thứ tự PK | Ngẫu nhiên trên đĩa | **Tuần tự** — rất nhanh |
| Index phụ phình theo PK | Không | **Có** — PK bị nhân bản vào mọi index phụ |
| `UPDATE` một cột | Đổi `ctid` → **cập nhật mọi index** (trừ khi HOT) | Index phụ **không cần đổi** |

Đọc bảng này xong sẽ hiểu vì sao không thể trả lời gọn câu "Postgres hay MySQL nhanh hơn". Chúng nhanh ở **những chỗ khác nhau**, và lựa chọn kiến trúc lá này là gốc rễ.

### Vì sao trên InnoDB khoá chính lớn lại nguy hiểm

Ghép hai dòng của bảng trên:

```text
   1. Index phụ trỏ tới PRIMARY KEY
   2. Lá clustered chứa CẢ DÒNG

   → BẢNG 100 TRIỆU DÒNG, 5 INDEX PHỤ

   PK = BIGINT (8 byte):
       phần PK trong index phụ = 100.000.000 × 8 × 5 = 4 GB

   PK = UUID lưu CHAR(36):
       phần PK trong index phụ = 100.000.000 × 36 × 5 = 18 GB
                                                        ────────
                                              THÊM 14 GB
```

14 GB đó tranh chỗ trực tiếp với dữ liệu nóng trong buffer pool. Đây chính là cơ chế đằng sau con số đo được ở [phase-4 bài 4](../phase-4/04-bloom-filter-va-uuid-performance.md).

---

## Ba cải tiến hiện đại của B+Tree trong PostgreSQL

B+Tree không đứng yên từ 1970. Ba cải tiến gần đây đáng biết:

### Khử trùng lặp (PostgreSQL 13)

Trước đây, index trên cột có nhiều giá trị lặp lưu mỗi lần lặp một mục riêng:

```text
   TRƯỚC PG13                          TỪ PG13 (deduplication)
   ══════════                          ═══════════════════════
   'active' → ctid(1,1)                'active' → [ctid(1,1), ctid(1,2),
   'active' → ctid(1,2)                            ctid(3,7), ...]
   'active' → ctid(3,7)                           ▲ MỘT mục, danh sách con trỏ
   ... × 1 triệu lần

   Index: 1,2 GB                       Index: 280 MB     → NHỎ HƠN 4,3 LẦN
```

Bật mặc định. Hiệu quả nhất với cột lệch phân bố mạnh (trạng thái, loại, cờ boolean).

Ý tưởng này chính là **dictionary encoding** của database cột, thu nhỏ và áp vào index — nối lại với [phase-3 bài 2](../phase-3/02-row-based-vs-column-based.md).

### Xoá index từ dưới lên (PostgreSQL 14)

Trước đây, mục index của dòng đã chết chỉ được dọn khi `VACUUM` chạy. Với bảng bị `UPDATE` liên tục, index phình nhanh hơn `VACUUM` dọn.

Từ PG14, khi một page lá sắp đầy, PostgreSQL **kiểm tra ngay tại chỗ** xem có mục nào trỏ tới dòng đã chết không, và dọn chúng trước khi quyết định tách page.

```text
   → Tránh được phần lớn các lần tách page vô ích
   → Index của bảng UPDATE nhiều ổn định hơn hẳn
```

### Nén tiền tố ở nút trong

Nút trong không cần lưu trọn khoá — chỉ cần đủ để phân biệt hướng rẽ. Với khoá chuỗi dài, cắt bớt phần đuôi làm tăng fan-out đáng kể.

---

## Khi nào B+Tree KHÔNG phải lựa chọn đúng

B+Tree tối ưu cho **đọc**. Với tải ghi cực nặng, nó có điểm yếu cố hữu:

```text
   MỖI LẦN CHÈN VÀO B+TREE:
      • đọc page lá đích (I/O ngẫu nhiên nếu chưa trong RAM)
      • có thể tách page → thêm I/O, sửa nút cha
      • ghi WAL cho mọi page bị đổi
      • với full_page_writes: có thể ghi cả page 8 KB vào WAL
```

Cấu trúc thay thế là **LSM Tree** (*Log-Structured Merge Tree*):

| | B+Tree | LSM Tree |
|---|---|---|
| Ghi | Ghi ngẫu nhiên tại chỗ | **Ghi tuần tự, nối thêm** |
| Đọc điểm | **Nhanh** — 3-4 I/O | Chậm hơn — phải tra nhiều tầng |
| Đọc khoảng | **Rất nhanh** — đi ngang lá | Phải trộn nhiều tầng |
| Khuếch đại ghi | Cao | Thấp hơn (nhưng có compaction) |
| Dung lượng | Chuẩn | **Nén tốt hơn** |
| Dùng ở | PostgreSQL, MySQL, Oracle, SQL Server | RocksDB, LevelDB, Cassandra, HBase |

Đây là lý do các hệ thống ghi cực nhiều (nhật ký, đo lường, chuỗi thời gian) hay chọn engine LSM. Chi tiết ở [phase-11 bài 3](../phase-11/03-leveldb-rocksdb-va-demo.md).

## Ứng dụng thực tế: đọc `EXPLAIN` bằng con mắt B+Tree

Bây giờ các dòng trong `EXPLAIN` có nghĩa cụ thể:

| Dòng trong `EXPLAIN` | Chuyện gì đang xảy ra trong cây |
|---|---|
| `Index Scan using idx_x` | Đi từ gốc xuống lá, rồi với mỗi mục thì nhảy vào heap |
| `Index Scan Backward` | Đi **ngược** danh sách liên kết ở tầng lá — chỉ B+Tree làm được |
| `Index Only Scan` | Đi xuống lá rồi **dừng ở đó** — mọi thứ cần đã có trong lá |
| `Bitmap Index Scan` | Quét lá thu thập con trỏ, chưa nhảy vào heap |
| `Index Cond: (x > 5)` | Điều kiện được dùng để **chọn điểm bắt đầu** trên cây |
| `Filter: (y = 3)` | Điều kiện **không** dùng để chọn điểm bắt đầu — chỉ lọc sau |

Và câu hỏi để tự chẩn đoán khi truy vấn khoảng chậm:

```text
   "Truy vấn của tôi có đi ngang được ở tầng lá không,
    hay nó phải leo lại cây cho mỗi giá trị?"

   → Nếu điều kiện khớp TIỀN TỐ TRÁI của index → đi ngang được  ✔
   → Nếu không                                  → leo lại       ✘
```

Đây chính là quy tắc tiền tố trái ở [phase-4 bài 3](../phase-4/03-composite-index-va-optimizer.md), nhìn từ tầng cấu trúc dữ liệu.

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| Nói "database dùng B-Tree" | Thực tế là **B+Tree** — khác nhau ở chỗ then chốt | Nói đúng tên, và nói được khác biệt khi phỏng vấn |
| Khoá chính lớn trên InnoDB | Bị nhân bản vào **mọi** index phụ | `BIGINT`, hoặc UUID lưu 16 byte nhị phân |
| Tưởng `ORDER BY DESC` chậm hơn `ASC` | Lá nối hai chiều — đi ngược tốn như đi xuôi | Cả hai đều dùng được index |
| Tưởng index trên cột ít giá trị là vô dụng | Từ PG13 có khử trùng lặp, và partial index vẫn rất hiệu quả | Đo trước khi kết luận |
| Chọn engine LSM cho tải đọc khoảng nhiều | LSM phải trộn nhiều tầng khi đọc khoảng | B+Tree cho OLTP có nhiều truy vấn khoảng |
| Bỏ qua `Index Scan Backward` khi đọc `EXPLAIN` | Nó cho biết index **đang** phục vụ `ORDER BY` | Đọc kỹ để biết index có bỏ được bước sắp xếp không |

## Tóm tắt bài 2

- B+Tree sửa cả ba hạn chế của B-Tree bằng **một thay đổi**: giá trị chỉ ở lá, và các lá nối nhau thành danh sách liên kết hai chiều.
- **Fan-out tăng 1,5 lần trở lên** → cây 4 tầng chứa được **68 tỷ dòng**. Gần như mọi bảng bạn từng gặp đều nằm trong cây 3-4 tầng.
- **Truy vấn khoảng biến từ leo cây thành đi bộ ngang**: lấy 10.000 dòng liên tiếp giảm từ ~35.000 I/O ngẫu nhiên xuống ~31 I/O gần tuần tự.
- Với 1 tỷ dòng, **mọi tầng trừ lá chỉ chiếm ~43 MB** → nằm vĩnh viễn trong RAM → thực tế chỉ 1-2 lần chạm đĩa cho một lần tìm kiếm.
- Cái giá là **khoá bị nhân đôi**, nhưng chỉ tốn thêm dưới **0,3%** dung lượng.
- **Con trỏ giữa các lá là một lựa chọn, không phải bắt buộc.** WiredTiger (MongoDB) **bỏ hẳn nó** vì tải của MongoDB ít quét khoảng — đổi lấy tách page rẻ hơn và lá gọn hơn. Cùng một cấu trúc, hai hệ cài khác nhau, và cả hai đều đúng cho tải của họ.
- **Lá chứa gì** là chỗ hai kiến trúc rẽ hướng: PostgreSQL để con trỏ `ctid`, InnoDB để **cả dòng** (clustered) và index phụ trỏ tới **primary key** — nên PK lớn làm phình mọi index phụ.
- Ba cải tiến hiện đại: **khử trùng lặp** (PG13, có thể nhỏ hơn 4 lần), **xoá index từ dưới lên** (PG14), **nén tiền tố**.
- B+Tree tối ưu cho đọc; tải ghi cực nặng thì **LSM Tree** hợp hơn — đó là lý do RocksDB, Cassandra tồn tại.

**Bài kế tiếp** → [Phase 6 — Bài 1: Database Partitioning là gì](../phase-6/01-database-partitioning-la-gi.md)

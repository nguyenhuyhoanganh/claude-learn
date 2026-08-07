# Bài 0: Từ điển thuật ngữ Database cho người mới

Khoá này đi xuống **dưới** lớp SQL. Mà xuống dưới thì gặp ngay một bức tường: page, heap, buffer pool, WAL, MVCC, XID, LSM tree, compaction... Mỗi câu giải thích lại chứa ba từ mới chưa được giải thích. Người học mắc kẹt không phải vì khái niệm khó, mà vì **thiếu từ vựng để đọc câu giải thích**.

Bài này phá bức tường đó. Mỗi thuật ngữ được cho **ba thứ**: nghĩa kỹ thuật chính xác, một hình dung đời thường để nhớ, và bài nào trong khoá sẽ đào sâu nó.

> Không cần thuộc bài này. Cứ đọc lướt một lượt để "quen mặt chữ", rồi quay lại tra khi gặp từ lạ ở các bài sau. Riêng phần cuối — **"Đường đi của một câu `SELECT`"** — thì nên đọc kỹ, vì nó là bản đồ ráp mọi thuật ngữ lại với nhau.

## Trước hết: database là một chương trình, không phải phép màu

Người mới thường hình dung database như một hộp đen: đưa SQL vào, dữ liệu chạy ra. Thực tế nó chỉ là **một tiến trình (process) chạy trên máy chủ**, đọc ghi **file thường** trên ổ đĩa, giống hệt mọi chương trình khác.

```text
        ỨNG DỤNG CỦA BẠN                    MÁY CHỦ DATABASE
    ┌────────────────────┐            ┌──────────────────────────────┐
    │  code Java/Python  │            │  tiến trình postgres/mysqld  │
    │                    │  ─TCP──▶   │  ┌────────────────────────┐  │
    │  "SELECT * FROM    │  câu SQL   │  │ RAM: vùng đệm dữ liệu  │  │
    │   orders WHERE..." │  dạng text │  └───────────┬────────────┘  │
    │                    │            │              │ đọc/ghi       │
    │                    │  ◀──────   │  ┌───────────▼────────────┐  │
    │  danh sách dòng    │  kết quả   │  │ Ổ ĐĨA: các file .dat   │  │
    └────────────────────┘            │  └────────────────────────┘  │
                                      └──────────────────────────────┘
```

Ba hệ quả rút ra ngay, và cả khoá này xoay quanh chúng:

1. **Dữ liệu nằm trên ổ đĩa** → đọc ổ đĩa chậm hơn đọc RAM cỡ vạn lần → mọi kỹ thuật tăng tốc đều là *tìm cách đọc ít đĩa hơn*.
2. **RAM có hạn** → không nạp hết dữ liệu vào RAM được → phải có chiến lược giữ cái gì, bỏ cái gì.
3. **Máy có thể mất điện bất cứ lúc nào** → phải có cơ chế đảm bảo dữ liệu đã hứa lưu thì không mất.

Mọi thuật ngữ dưới đây đều là tên gọi của một giải pháp cho ba vấn đề trên.

---

## Nhóm 1 — Dữ liệu nằm ở đâu trên ổ đĩa

### Row (dòng) / Tuple (bộ)

| | |
|---|---|
| **Nghĩa** | Một bản ghi trong bảng. `(id=1, ten='Nam', tuoi=30)` là một row. |
| **Hình dung** | Một dòng trong bảng Excel. |
| **Ghi chú** | PostgreSQL hay gọi là *tuple*, MySQL gọi là *record*. Cùng một thứ. Trong PostgreSQL, một dòng bị `UPDATE` sẽ sinh ra một **tuple mới** chứ không sửa tại chỗ — chi tiết ở [phase-2 bài 3](../phase-2/03-isolation-va-read-phenomena.md). |

### Page (trang) / Block (khối)

| | |
|---|---|
| **Nghĩa** | Đơn vị đọc/ghi nhỏ nhất của database. PostgreSQL: **8 KB**. MySQL InnoDB: **16 KB**. Oracle mặc định 8 KB. |
| **Hình dung** | Database không đọc từng dòng, nó đọc từng **trang giấy**. Cần một chữ ở giữa trang thì vẫn phải cầm cả trang lên. |
| **Vì sao có** | Ổ đĩa vật lý cũng làm việc theo khối. Đọc 1 byte hay đọc 8192 byte liền nhau tốn gần như cùng thời gian, nên đọc lẻ từng dòng là lãng phí thuần tuý. |
| **Học ở** | [phase-3 bài 1](../phase-3/01-page-heap-va-io.md) |

```text
MỘT PAGE 8 KB CỦA POSTGRES — nhìn từ bên trong

┌──────────────────────────────────────────────────┐  ← đầu page
│ PageHeader (24 byte): checksum, con trỏ trống... │
├──────────────────────────────────────────────────┤
│ ItemId[1] ItemId[2] ItemId[3] ...  →→→           │  mảng con trỏ, mọc từ trên xuống
├──────────────────────────────────────────────────┤
│                                                  │
│              KHOẢNG TRỐNG (free space)           │
│                                                  │
├──────────────────────────────────────────────────┤
│           ←←←  Tuple[3] Tuple[2] Tuple[1]        │  dữ liệu thật, mọc từ dưới lên
└──────────────────────────────────────────────────┘  ← cuối page

Hai đầu mọc vào giữa. Khi chúng chạm nhau → page đầy → dòng mới phải sang page khác.
```

Con số cần nhớ: nếu một dòng nặng ~100 byte, một page 8 KB chứa được **khoảng 80 dòng**. Nghĩa là bảng 1 triệu dòng ≈ **12.500 page** ≈ 100 MB. Con số này quyết định query của bạn nhanh hay chậm, vì cái database thật sự đếm là **số page phải đọc**, không phải số dòng.

### Heap (đống)

| | |
|---|---|
| **Nghĩa** | Cấu trúc lưu bảng ở dạng **không sắp xếp**: dòng mới cứ nhét vào chỗ trống nào còn. |
| **Hình dung** | Một đống hồ sơ quăng vào thùng carton. Tìm một hồ sơ cụ thể phải bới cả thùng, nhưng ném thêm hồ sơ mới vào thì cực nhanh. |
| **Vì sao thế** | Ghi nhanh. Nếu bắt bảng luôn sắp xếp thì mỗi lần chèn một dòng vào giữa phải dịch chuyển hàng triệu dòng phía sau. |
| **Học ở** | [phase-3 bài 1](../phase-3/01-page-heap-va-io.md), [phase-3 bài 3](../phase-3/03-primary-key-vs-secondary-key.md) |

### Full table scan / Sequential scan (quét toàn bảng)

| | |
|---|---|
| **Nghĩa** | Đọc **mọi page** của bảng từ đầu đến cuối để tìm dòng thoả điều kiện. |
| **Hình dung** | Không có mục lục thì phải lật từng trang sách. |
| **Bẫy nhận thức** | Quét toàn bảng **không phải lúc nào cũng xấu**. Nếu query lấy 80% số dòng, quét tuần tự còn nhanh hơn dùng index — vì đọc tuần tự trên đĩa nhanh hơn nhảy lung tung. [phase-4 bài 3](../phase-4/03-composite-index-va-optimizer.md) giải thích cách optimizer quyết định. |

### Tablespace / Data file

| | |
|---|---|
| **Nghĩa** | File vật lý thật sự trên ổ đĩa chứa bảng và index. |
| **Hình dung** | Nếu page là trang giấy thì data file là **quyển sổ** đóng gáy các trang lại. |
| **Kiểm chứng được** | Trong PostgreSQL chạy `SELECT pg_relation_filepath('orders');` sẽ ra đúng đường dẫn file. Vào thư mục đó `ls -la` thấy file thật, kích thước thật. Database không giấu gì cả. |

---

## Nhóm 2 — Đọc và ghi: chỗ mọi thứ chậm đi

### I/O (Input/Output)

| | |
|---|---|
| **Nghĩa** | Thao tác đọc/ghi giữa RAM và ổ đĩa. |
| **Hình dung** | Đi từ bàn làm việc (RAM) xuống kho lưu trữ (đĩa) để lấy hồ sơ. |
| **Con số phải nhớ** | Đọc 1 page từ RAM: ~**100 nanosecond**. Từ SSD: ~**100 microsecond** (chậm hơn 1.000 lần). Từ HDD: ~**10 millisecond** (chậm hơn 100.000 lần). |

Cách hình dung tỉ lệ này cho dễ nhớ: nếu đọc từ RAM mất **1 giây**, thì đọc từ SSD mất **17 phút**, còn đọc từ HDD mất **28 tiếng**. Đó là lý do toàn bộ ngành database xoay quanh việc *tránh chạm ổ đĩa*.

### Random I/O vs Sequential I/O

```text
SEQUENTIAL I/O — đọc liền mạch          RANDOM I/O — nhảy cóc
   page 1 → 2 → 3 → 4 → 5                 page 4.201 → 17 → 9.888 → 302
   ────────────────────────                 ↑    ↓      ↑     ↓
   Đầu đọc đi thẳng một mạch.             Mỗi lần nhảy phải định vị lại.
   HDD: ~200 MB/s                          HDD: ~1-2 MB/s hiệu dụng
   SSD: ~3.000 MB/s                        SSD: chậm hơn ~2-5 lần tuần tự
```

Đây là lý do sâu xa vì sao index không phải lúc nào cũng thắng: **index gây random I/O**, còn quét toàn bảng là sequential I/O. Nhảy cóc 100 lần có thể tốn hơn đọc thẳng 1.000 page.

### Buffer pool / Shared buffers (vùng đệm)

| | |
|---|---|
| **Nghĩa** | Vùng RAM database dành riêng để giữ các page vừa đọc, phòng khi cần lại. |
| **Hình dung** | Cái bàn làm việc. Hồ sơ lấy từ kho lên thì để trên bàn, lần sau cần thì với tay là có. Bàn nhỏ thì phải cất bớt xuống kho. |
| **Tên gọi** | PostgreSQL: `shared_buffers`. MySQL InnoDB: `innodb_buffer_pool_size`. Cùng khái niệm. |
| **Cấu hình thường gặp** | InnoDB: 50-75% RAM máy. PostgreSQL: 25% RAM (vì Postgres còn dựa thêm vào cache của hệ điều hành). |

### Cache hit / Cache miss

| | |
|---|---|
| **Nghĩa** | *Hit* = page cần đã có sẵn trong buffer pool. *Miss* = phải xuống đĩa lấy. |
| **Hình dung** | Hit = hồ sơ đang nằm trên bàn. Miss = phải đi xuống kho. |
| **Ngưỡng thực tế** | Hệ OLTP khoẻ mạnh có **cache hit ratio > 99%**. Tụt xuống 90% nghĩa là số lần xuống đĩa tăng **gấp 10 lần** — đó là lúc hệ thống "tự nhiên chậm" mà không đổi gì cả. |

### Dirty page (trang bẩn)

| | |
|---|---|
| **Nghĩa** | Page đã bị sửa trong RAM nhưng **chưa** ghi xuống đĩa. |
| **Hình dung** | Tờ giấy trên bàn bạn đã viết thêm chữ, nhưng bản trong kho vẫn là bản cũ. Mất điện lúc này thì chữ vừa viết bay mất. |
| **Vì sao tồn tại** | Ghi xuống đĩa ngay mỗi lần sửa thì quá chậm. Database gom lại, ghi theo lô. |

### WAL — Write-Ahead Log (nhật ký ghi trước)

| | |
|---|---|
| **Nghĩa** | Một file nhật ký **chỉ ghi nối tiếp**, ghi lại "tôi sắp thay đổi cái này thành cái kia" **trước khi** thật sự thay đổi. |
| **Hình dung** | Sổ nhật ký của thủ kho: ghi "đã nhập 10 thùng hàng, sẽ xếp lên kệ B" vào sổ trước, rồi mới đi xếp. Cháy nhà lúc đang xếp thì mở sổ ra là biết phải làm lại gì. |
| **Vì sao thiên tài** | Ghi nhật ký là **sequential I/O** (nhanh), sửa dữ liệu thật là **random I/O** (chậm). WAL cho phép "hứa xong" bằng thao tác nhanh, rồi thư thả làm thao tác chậm. |
| **Tên gọi** | PostgreSQL: WAL. MySQL InnoDB: *redo log*. Oracle: *redo log*. Cùng ý tưởng. |
| **Học ở** | [phase-17 bài WAL](../phase-17/01-wal-redo-undo-logs.md) |

### fsync

| | |
|---|---|
| **Nghĩa** | Lệnh của hệ điều hành: "ghi thật xuống đĩa vật lý ngay, đừng giữ trong bộ nhớ đệm nữa". |
| **Hình dung** | Không chỉ bấm Save, mà đứng chờ đến khi đèn ổ cứng tắt hẳn. |
| **Vì sao quan trọng** | Đây chính là chỗ chữ **D** trong ACID được thực thi. Không có `fsync`, "đã commit" chỉ là lời hứa suông của hệ điều hành. Và `fsync` **chậm** — nó là nút cổ chai của mọi database ghi nhiều. |

### Checkpoint (điểm kiểm)

| | |
|---|---|
| **Nghĩa** | Thời điểm database dồn hết dirty page xuống đĩa và đánh dấu "tới đây mọi thứ đã an toàn". |
| **Hình dung** | Cuối ca làm việc, thủ kho xếp hết hàng còn tồn lên kệ rồi gạch một đường ngang sổ: "từ đây trở lên đã xong". |
| **Vì sao cần** | Không có checkpoint thì khi khởi động lại sau sự cố, database phải đọc lại WAL **từ đầu lịch sử**. Có checkpoint thì chỉ cần đọc từ vạch gạch ngang. |

---

## Nhóm 3 — Tìm nhanh: index và họ hàng

### Index (chỉ mục)

| | |
|---|---|
| **Nghĩa** | Một cấu trúc dữ liệu phụ, **được sắp xếp**, ánh xạ giá trị cột → vị trí dòng trong bảng. |
| **Hình dung** | Mục lục cuối sách: "Atomicity ... trang 47". Bạn không đọc cả sách, bạn tra mục lục rồi lật thẳng trang 47. |
| **Cái giá** | Index là **bản sao** dữ liệu → tốn đĩa. Và mỗi `INSERT`/`UPDATE`/`DELETE` phải cập nhật **mọi** index → ghi chậm đi. |
| **Học ở** | [phase-4](../phase-4/01-co-ban-ve-indexing.md) toàn bộ |

### B-Tree và B+Tree

| | |
|---|---|
| **Nghĩa** | Cấu trúc cây cân bằng, mỗi nút là một page, dùng để làm index. |
| **Hình dung** | Cây thư mục có sắp xếp. Từ gốc đi xuống, mỗi tầng loại bỏ phần lớn khả năng, vài bước là tới nơi. |
| **B-Tree vs B+Tree** | B-Tree để dữ liệu ở **mọi** nút. B+Tree chỉ để dữ liệu ở **lá**, và các lá nối nhau thành danh sách liên kết → quét khoảng (`WHERE x BETWEEN a AND b`) cực nhanh. Mọi database thực tế đều dùng **B+Tree**. |
| **Con số phải nhớ** | Cây cao 3-4 tầng đủ chứa **hàng trăm triệu dòng**. Nghĩa là tìm một dòng trong bảng 100 triệu dòng chỉ tốn **3-4 lần đọc page**. |
| **Học ở** | [phase-5](../phase-5/01-btree-co-ban.md) |

```text
B+TREE — vì sao chỉ 3 tầng mà chứa được hàng trăm triệu dòng

                    ┌──── ROOT (1 page) ────┐
                    │  200 con trỏ xuống    │
                    └───┬───────────────┬───┘
              ┌─────────┘               └─────────┐
        ┌─────▼─────┐                       ┌─────▼─────┐
        │ INTERNAL  │  ... 200 page ...     │ INTERNAL  │   tầng 2
        │200 con trỏ│                       │200 con trỏ│
        └─────┬─────┘                       └─────┬─────┘
       ┌──────┴──────┐                     ┌──────┴──────┐
   ┌───▼───┐     ┌───▼───┐             ┌───▼───┐     ┌───▼───┐
   │ LEAF  │◀───▶│ LEAF  │◀── ... ────▶│ LEAF  │◀───▶│ LEAF  │   tầng 3 (lá)
   └───────┘     └───────┘             └───────┘     └───────┘
       ▲ các lá NỐI NHAU → quét khoảng chỉ việc đi ngang, không cần leo lên lại

   1 × 200 × 200 = 40.000 lá × ~200 khoá/lá ≈ 8 TRIỆU dòng ở cây 3 tầng.
   Thêm 1 tầng nữa → ~1,6 tỷ dòng, vẫn chỉ 4 lần đọc page.
```

### Leaf node / Internal node / Root

| | |
|---|---|
| **Root (gốc)** | Page trên cùng, mọi tìm kiếm bắt đầu từ đây. Luôn nằm sẵn trong RAM vì được dùng liên tục. |
| **Internal node (nút trong)** | Tầng giữa, chỉ chứa **khoá dẫn đường** — không chứa dữ liệu, chỉ chứa kiểu "nhỏ hơn 500 thì rẽ trái". |
| **Leaf node (nút lá)** | Tầng đáy, chứa khoá **và** con trỏ tới dòng thật (hoặc chính dữ liệu, tuỳ engine). |

### Clustered index (index gom cụm)

| | |
|---|---|
| **Nghĩa** | Index mà **dữ liệu thật của bảng nằm luôn ở lá**. Bảng *chính là* cây index. |
| **Hình dung** | Từ điển: các từ được xếp theo bảng chữ cái, và định nghĩa nằm ngay cạnh từ. Không có "mục lục riêng" — quyển sách chính là mục lục. |
| **Khác biệt sống còn** | MySQL InnoDB: **mọi bảng đều clustered** theo primary key. PostgreSQL: **không có** clustered index — bảng luôn là heap rời rạc. Khác biệt này giải thích rất nhiều hành vi lạ giữa hai hệ, xem [phase-17 bài 5](../phase-17/05-indexing-postgres-vs-mysql.md). |

### Secondary index (index phụ)

| | |
|---|---|
| **Nghĩa** | Index trên cột không phải primary key. |
| **Hình dung** | Mục lục thứ hai, xếp theo chủ đề thay vì theo trang. |
| **Bẫy ở InnoDB** | Lá của secondary index **không** chứa con trỏ vật lý, nó chứa **primary key**. Nên tra secondary index xong phải tra tiếp clustered index — gọi là *double lookup*. Đây là lý do primary key dài (như UUID dạng chuỗi) làm phình mọi index phụ. |

### Covering index & Index-only scan

| | |
|---|---|
| **Covering index** | Index chứa **đủ mọi cột** mà query cần. |
| **Index-only scan** | Hệ quả: database đọc xong index là trả kết quả, **không cần chạm vào bảng**. |
| **Hình dung** | Mục lục ghi luôn cả tóm tắt nội dung. Tra mục lục xong là đủ, khỏi lật trang. |
| **Tăng tốc bao nhiêu** | Thường **2-10 lần**, vì bỏ hẳn được bước random I/O vào heap. |
| **Học ở** | [phase-4 bài 2](../phase-4/02-index-scan-va-covering-index.md) |

### Cardinality và Selectivity

| | |
|---|---|
| **Cardinality (lực lượng)** | Số giá trị **khác nhau** trong một cột. Cột `gioi_tinh` có cardinality 2-3. Cột `email` có cardinality = số dòng. |
| **Selectivity (độ chọn lọc)** | Tỉ lệ dòng còn lại sau khi lọc. `WHERE email = 'x'` trên 1 triệu dòng → selectivity ≈ 0,000001 (rất chọn lọc, index cực hiệu quả). `WHERE gioi_tinh = 'nam'` → selectivity ≈ 0,5 (index gần như vô dụng). |
| **Quy tắc ngón tay cái** | Index chỉ đáng dùng khi lọc ra **dưới ~5-10%** số dòng. Trên ngưỡng đó, optimizer thường chọn quét toàn bảng — và nó chọn đúng. |

---

## Nhóm 4 — Nhiều người dùng cùng lúc

### Transaction (giao dịch)

| | |
|---|---|
| **Nghĩa** | Một nhóm câu lệnh được coi là **một đơn vị công việc duy nhất**: hoặc thành công toàn bộ, hoặc không gì cả. |
| **Hình dung** | Chuyển khoản: trừ tiền tài khoản A **và** cộng tiền tài khoản B. Làm nửa vời là mất tiền. |
| **Học ở** | [phase-2 bài 1](../phase-2/01-acid-va-transaction.md) |

### COMMIT và ROLLBACK

| | |
|---|---|
| **COMMIT** | "Tôi hài lòng, hãy lưu vĩnh viễn." Sau lệnh này dữ liệu phải sống sót cả khi mất điện. |
| **ROLLBACK** | "Bỏ hết, coi như tôi chưa làm gì." |
| **Điều ít ai biết** | Rollback **không miễn phí**. Với transaction lớn, rollback có thể chạy **hàng giờ** — vì database phải đi hoàn tác từng thay đổi đã ghi. Đây là lý do "transaction dài là ý tưởng tồi". |

### Isolation level (mức cô lập)

| | |
|---|---|
| **Nghĩa** | Cài đặt quy định transaction của bạn được **nhìn thấy** gì từ các transaction đang chạy song song. |
| **Hình dung** | Độ dày bức tường giữa các phòng làm việc. Tường mỏng → nghe thấy hết (nhanh nhưng nhiễu). Tường dày → yên tĩnh tuyệt đối (chuẩn nhưng chậm). |
| **Bốn mức chuẩn** | `READ UNCOMMITTED` → `READ COMMITTED` → `REPEATABLE READ` → `SERIALIZABLE`, dày dần. |
| **Học ở** | [phase-2 bài 3](../phase-2/03-isolation-va-read-phenomena.md) |

### Read phenomena (hiện tượng đọc bất thường)

Bốn "bệnh" sinh ra khi các transaction giẫm lên nhau. Nhớ bằng câu chuyện thay vì nhớ định nghĩa:

| Tên | Chuyện gì xảy ra | Hình dung |
|---|---|---|
| **Dirty read** (đọc bẩn) | Bạn đọc thứ người khác **chưa commit** — họ có thể rollback ngay sau đó | Đọc bản nháp của đồng nghiệp rồi báo cáo sếp; đồng nghiệp xé bản nháp đi |
| **Non-repeatable read** (đọc không lặp lại được) | Đọc một dòng hai lần trong cùng transaction, ra **hai giá trị khác nhau** | Hỏi giá lúc 9h là 100k, hỏi lại lúc 9h05 thành 120k, trong cùng một cuộc thương lượng |
| **Phantom read** (đọc bóng ma) | Chạy lại cùng câu truy vấn khoảng, xuất hiện **dòng mới chưa từng có** | Đếm người trong phòng ra 5, đếm lại ra 6 — có người vừa lẻn vào |
| **Lost update** (mất cập nhật) | Hai người cùng sửa một dòng, thay đổi của một người **bị ghi đè mất tăm** | Hai người cùng sửa một file Word rồi lần lượt lưu đè lên nhau |

### Lock (khoá)

| | |
|---|---|
| **Shared lock (S)** | Khoá đọc. Nhiều người cùng giữ được. |
| **Exclusive lock (X)** | Khoá ghi. Chỉ một người giữ, và loại trừ mọi khoá khác. |
| **Hình dung** | Shared = nhiều người cùng đọc chung một tấm bảng thông báo. Exclusive = một người mang bảng đi sửa, không ai đọc được lúc đó. |
| **Học ở** | [phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md) |

### Deadlock (khoá chết)

| | |
|---|---|
| **Nghĩa** | A giữ khoá 1 và chờ khoá 2; B giữ khoá 2 và chờ khoá 1. Không ai nhường, cả hai đứng mãi. |
| **Hình dung** | Hai người ở hai đầu cầu một làn, cùng đi vào giữa, không ai chịu lùi. |
| **Cách database xử lý** | Phát hiện vòng tròn chờ rồi **giết một transaction** làm vật tế. Ứng dụng nhận lỗi và phải **thử lại**. |

### MVCC — Multi-Version Concurrency Control

| | |
|---|---|
| **Nghĩa** | Thay vì khoá, database giữ **nhiều phiên bản** của cùng một dòng. Mỗi transaction đọc phiên bản phù hợp với thời điểm nó bắt đầu. |
| **Hình dung** | Thay vì tranh nhau một quyển sổ, mỗi người được phát một bản photocopy tại thời điểm họ bước vào. Ai sửa thì sửa bản mới, bản photocopy của người khác không đổi. |
| **Vì sao là phát minh lớn** | **Người đọc không chặn người ghi, người ghi không chặn người đọc.** Đây là câu thần chú của MVCC và là lý do PostgreSQL/MySQL InnoDB chịu được tải cao. |
| **Cái giá** | Sinh ra rác — các phiên bản cũ không ai dùng nữa. Phải có `VACUUM` (Postgres) hoặc *purge* (InnoDB) đi dọn. |

### Snapshot (ảnh chụp)

| | |
|---|---|
| **Nghĩa** | Trạng thái database "đóng băng" tại một thời điểm mà transaction nhìn thấy. |
| **Hình dung** | Chụp ảnh căn phòng lúc 9h00. Người ra vào sau đó không ảnh hưởng gì tới bức ảnh. |

### Undo log

| | |
|---|---|
| **Nghĩa** | Nhật ký ghi lại **giá trị cũ** trước khi sửa, dùng để dựng lại phiên bản cũ hoặc để rollback. |
| **Hình dung** | Nút Ctrl+Z. Muốn quay lại thì phải nhớ trước đó là gì. |
| **Khác biệt hai hệ** | MySQL InnoDB sửa dòng **tại chỗ** và đẩy giá trị cũ sang undo log. PostgreSQL **không sửa tại chỗ** — nó ghi một phiên bản mới ngay trong bảng. Đó là lý do Postgres cần `VACUUM` còn InnoDB thì không, nhưng đổi lại InnoDB phải "mở undo log" khi đọc dữ liệu cũ. |

### XID — Transaction ID

| | |
|---|---|
| **Nghĩa** | Số thứ tự PostgreSQL cấp cho mỗi transaction, dùng để biết phiên bản nào cũ hơn phiên bản nào. |
| **Hình dung** | Số thứ tự lấy ở quầy ngân hàng. Số nhỏ hơn là tới trước. |
| **Cái bẫy nổi tiếng** | XID chỉ có **32 bit** → khoảng 4 tỷ số → dùng hết thì quay vòng về 0, và "tới trước/tới sau" đảo lộn. Gọi là *transaction wraparound*, từng làm sập Sentry. |

---

## Nhóm 5 — Khi một máy không đủ

### Partitioning (phân mảnh)

| | |
|---|---|
| **Nghĩa** | Chia một bảng lớn thành nhiều bảng con, **vẫn trong cùng một database**. |
| **Hình dung** | Một tủ hồ sơ chia thành 12 ngăn theo tháng. Vẫn là một cái tủ, vẫn ở một phòng. |
| **Lợi ích chính** | Query có điều kiện theo tháng chỉ đụng vào 1 ngăn thay vì cả tủ (*partition pruning*). Và xoá dữ liệu cũ = `DROP` cả ngăn, tức thì, thay vì `DELETE` hàng triệu dòng. |
| **Học ở** | [phase-6](../phase-6/01-database-partitioning-la-gi.md) |

### Sharding (phân tán)

| | |
|---|---|
| **Nghĩa** | Chia dữ liệu ra **nhiều máy chủ database khác nhau**. |
| **Hình dung** | Không phải chia tủ thành ngăn nữa, mà mang các tủ đi đặt ở các toà nhà khác nhau. |
| **Cái giá tàn khốc** | Mất `JOIN` xuyên shard, mất transaction ACID xuyên shard, mất `UNIQUE` toàn cục. Đây là **cánh cửa một chiều** — sharding rồi rất khó quay lại. |
| **Học ở** | [phase-7](../phase-7/01-database-sharding-la-gi.md) |

### Replication (nhân bản)

| | |
|---|---|
| **Nghĩa** | Copy toàn bộ dữ liệu sang máy khác, giữ đồng bộ liên tục. |
| **Hình dung** | Photocopy toàn bộ tủ hồ sơ sang một toà nhà khác, và cứ có giấy mới là fax sang ngay. |
| **Khác sharding chỗ nào** | Sharding: mỗi máy giữ **một phần khác nhau**. Replication: mỗi máy giữ **toàn bộ, giống nhau**. |
| **Học ở** | [phase-9](../phase-9/01-database-replication-la-gi.md) |

### Primary / Replica (trước gọi Master / Standby)

| | |
|---|---|
| **Primary** | Máy nhận mọi lệnh ghi. |
| **Replica** | Máy nhận bản sao, thường chỉ cho đọc. |
| **Dùng làm gì** | Đẩy tải đọc (báo cáo, thống kê) sang replica để primary rảnh tay ghi. |

### Replication lag (độ trễ nhân bản)

| | |
|---|---|
| **Nghĩa** | Khoảng thời gian replica chậm hơn primary. |
| **Hình dung** | Bản fax tới muộn vài giây. |
| **Bẫy kinh điển** | Người dùng bấm "Lưu" (ghi vào primary) rồi trang tự tải lại (đọc từ replica) → **thấy dữ liệu cũ** → tưởng là mất dữ liệu. Gọi là bài toán *read-your-own-writes*. |

### Synchronous vs Asynchronous replication

| | Đồng bộ | Bất đồng bộ |
|---|---|---|
| **Cách chạy** | Primary chờ replica xác nhận rồi mới báo commit thành công | Primary báo thành công ngay, gửi sang replica sau |
| **Mất dữ liệu khi primary chết** | Không | Có — mất phần chưa kịp gửi |
| **Tốc độ ghi** | Chậm (cộng thêm 1 vòng mạng) | Nhanh |
| **Hình dung** | Gửi thư bảo đảm, đứng chờ ký nhận | Bỏ thư vào thùng rồi đi luôn |

---

## Nhóm 6 — Engine: cỗ máy bên dưới

### Storage engine

| | |
|---|---|
| **Nghĩa** | Thành phần thật sự lo việc đọc/ghi dữ liệu xuống đĩa. Cùng một câu SQL, engine khác nhau thực thi khác nhau. |
| **Hình dung** | Cùng một chiếc xe (giao diện SQL), nhưng thay được động cơ (engine) — xăng, dầu hay điện. |
| **Ví dụ** | MySQL đổi được engine: InnoDB, MyISAM, MEMORY... PostgreSQL thì gắn liền với engine của nó. |
| **Học ở** | [phase-11](../phase-11/01-database-engine-la-gi.md) |

### LSM Tree — Log-Structured Merge Tree

| | |
|---|---|
| **Nghĩa** | Cấu trúc lưu trữ thay thế B+Tree, tối ưu cho **ghi cực nhiều**. Ghi vào RAM trước, khi đầy thì đổ xuống đĩa thành file bất biến. |
| **Hình dung** | Không xếp hàng lên kệ ngay. Cứ chất thành từng chồng theo thứ tự thời gian, thỉnh thoảng gộp các chồng lại cho gọn. |
| **Dùng ở đâu** | RocksDB, LevelDB, Cassandra, HBase. |
| **Đánh đổi** | Ghi cực nhanh, nhưng đọc chậm hơn (phải tìm qua nhiều chồng) và tốn CPU cho việc gộp. |

### SSTable, Memtable, Compaction

| | |
|---|---|
| **Memtable** | Bảng trong RAM nhận dữ liệu ghi mới. |
| **SSTable** | File bất biến trên đĩa, đã sắp xếp, sinh ra khi memtable đầy và bị đổ xuống. |
| **Compaction** | Tiến trình nền gộp nhiều SSTable thành ít file hơn, xoá bản trùng và bản đã xoá. |
| **Hình dung** | Memtable = giỏ đựng đồ trên bàn. SSTable = thùng đã niêm phong xếp vào kho. Compaction = định kỳ mở nhiều thùng cũ ra, bỏ đồ hỏng, đóng lại thành ít thùng hơn. |

### Bloom filter

| | |
|---|---|
| **Nghĩa** | Cấu trúc siêu nhẹ trả lời câu hỏi "giá trị này **chắc chắn không có**, hay **có thể có**?" |
| **Hình dung** | Bảo vệ ở cổng kho: "Chắc chắn không có món này ở đây, khỏi vào" hoặc "Có thể có, mời vào tìm". Nó không bao giờ nói sai câu đầu. |
| **Vì sao hữu ích** | Chặn được phần lớn lượt tìm kiếm vô ích trước khi chúng chạm ổ đĩa. |
| **Học ở** | [phase-4 bài 4](../phase-4/04-bloom-filter-va-uuid-performance.md) |

---

## Nhóm 7 — Database quyết định chạy thế nào

### Query planner / Optimizer

| | |
|---|---|
| **Nghĩa** | Bộ phận đọc câu SQL rồi tự nghĩ ra **cách thực thi rẻ nhất**. |
| **Hình dung** | Google Maps của database. Bạn nói điểm đến, nó tự chọn đường. |
| **Điểm mấu chốt** | SQL là ngôn ngữ **khai báo** — bạn mô tả *muốn gì*, không mô tả *làm thế nào*. Nên planner mới là kẻ quyết định query nhanh hay chậm. |

### Cost (chi phí)

| | |
|---|---|
| **Nghĩa** | Con số ước lượng planner dùng để so sánh các phương án. |
| **Đơn vị** | **Không phải mili-giây.** Trong PostgreSQL, đơn vị là "chi phí đọc tuần tự một page" = 1,0. Đọc ngẫu nhiên một page = 4,0. Xử lý một dòng = 0,01. |
| **Hệ quả quan trọng** | Cost chỉ có ý nghĩa **khi so với cost khác trong cùng câu query**. Nói "cost 5.000 là chậm" là vô nghĩa. |

### EXPLAIN và EXPLAIN ANALYZE

| | |
|---|---|
| **EXPLAIN** | Cho xem **kế hoạch dự định**, không chạy thật. Nhanh, an toàn. |
| **EXPLAIN ANALYZE** | **Chạy thật** rồi báo cả kế hoạch lẫn thời gian thực tế. Cẩn thận: `EXPLAIN ANALYZE DELETE ...` sẽ xoá dữ liệu thật. |
| **Cách đọc** | Đọc **từ trong ra ngoài, từ dưới lên**. Nút thụt vào sâu nhất chạy trước. |

### Statistics (thống kê)

| | |
|---|---|
| **Nghĩa** | Bảng số liệu về phân bố dữ liệu (có bao nhiêu giá trị khác nhau, giá trị nào phổ biến, bao nhiêu phần trăm NULL) mà planner dựa vào để đoán. |
| **Hình dung** | Bản khảo sát mẫu. Planner không đếm cả bảng, nó lấy mẫu rồi suy ra. |
| **Vì sao query "tự nhiên chậm"** | Thống kê cũ → planner đoán sai → chọn nhầm kế hoạch. Chạy `ANALYZE` cập nhật lại thường là thuốc chữa. |

### Ba thuật toán JOIN

| Thuật toán | Cách làm | Nhanh khi | Hình dung |
|---|---|---|---|
| **Nested Loop** | Với mỗi dòng bảng A, tìm trong bảng B | A rất nhỏ **và** B có index | Cầm 5 tên đi tra danh bạ 5 lần |
| **Hash Join** | Đổ bảng nhỏ vào bảng băm trong RAM, quét bảng lớn đối chiếu | Cả hai bảng lớn, không có index | Xếp danh bạ thành các ngăn theo chữ cái rồi tra một lượt |
| **Merge Join** | Sắp xếp cả hai rồi chạy song song như khoá kéo | Cả hai **đã** sắp xếp sẵn | Hai danh sách đã xếp thứ tự, dò song song từ trên xuống |

---

## Đường đi của một câu `SELECT` — ráp mọi thuật ngữ lại

Đây là phần đáng đọc kỹ nhất. Nó cho thấy các thuật ngữ trên **nối vào nhau** ở đâu.

```text
  Bạn gõ:  SELECT * FROM orders WHERE customer_id = 42;

  ┌─ 1. PARSER ────────────────────────────────────────────────────────┐
  │  Đọc chuỗi text, kiểm tra cú pháp, dịch thành cây cú pháp.         │
  │  Sai chính tả SQL thì chết ở đây.                                  │
  └────────────────────────────┬───────────────────────────────────────┘
  ┌─ 2. PLANNER / OPTIMIZER ───▼───────────────────────────────────────┐
  │  Mở STATISTICS ra xem: cột customer_id có bao nhiêu giá trị khác   │
  │  nhau? Giá trị 42 ước chừng khớp mấy dòng?                        │
  │                                                                    │
  │  Rồi tính COST cho từng phương án:                                 │
  │     • Seq Scan  : đọc hết 12.500 page  → cost 12.700               │
  │     • Index Scan: đọc 4 page index + 30 page heap → cost 138       │
  │  Chọn phương án rẻ hơn → Index Scan.                               │
  └────────────────────────────┬───────────────────────────────────────┘
  ┌─ 3. EXECUTOR ──────────────▼───────────────────────────────────────┐
  │  Đi xuống B+TREE của index:                                        │
  │     ROOT (đang nằm trong BUFFER POOL → CACHE HIT, ~100ns)          │
  │       → INTERNAL node (cache hit)                                  │
  │         → LEAF node (CACHE MISS → xuống đĩa, ~100µs)               │
  │            → lấy được con trỏ tới dòng trong HEAP                  │
  │                                                                    │
  │  Với mỗi con trỏ, đọc PAGE 8KB chứa dòng đó (RANDOM I/O).         │
  │  Page đọc lên được nạp vào BUFFER POOL để lần sau dùng lại.        │
  │                                                                    │
  │  Với mỗi dòng tìm được, kiểm tra MVCC: phiên bản này có thuộc     │
  │  SNAPSHOT của transaction mình không? Nếu không → bỏ qua.          │
  └────────────────────────────┬───────────────────────────────────────┘
                               ▼
                      Trả danh sách dòng về client
```

Và với một câu `UPDATE`, đường đi khác hẳn ở nửa sau:

```text
  UPDATE orders SET status = 'paid' WHERE id = 7;

  1. Tìm dòng (giống hệt SELECT ở trên)
  2. Xin EXCLUSIVE LOCK trên dòng đó
       → nếu có transaction khác đang giữ → NGỒI CHỜ
       → nếu chờ vòng tròn với nhau → DEADLOCK → bị giết
  3. Ghi vào WAL trước:  "dòng id=7, status: 'pending' → 'paid'"
  4. Sửa PAGE trong BUFFER POOL → page thành DIRTY PAGE
  5. Cập nhật MỌI INDEX có liên quan
  6. COMMIT → fsync() cái WAL xuống đĩa  ← chữ D của ACID nằm đúng ở đây
       (page bẩn thì cứ để đó, CHECKPOINT sau này sẽ dọn)
```

Đọc kỹ hình trên là bạn đã có bộ khung của cả khoá học. Mỗi phase phía sau chỉ là phóng to một ô trong hình này.

## Bảng tra nhanh: triệu chứng → thuật ngữ → bài học

| Bạn đang gặp | Từ khoá cần tra | Đọc bài |
|---|---|---|
| Query bỗng dưng chậm dù không đổi code | Statistics, Planner | [phase-4 bài 3](../phase-4/03-composite-index-va-optimizer.md) |
| Có index rồi mà vẫn quét toàn bảng | Selectivity, Cost | [phase-16 bài 1](../phase-16/01-hoi-dap-indexing-va-query-planning.md) |
| Hai người đặt trùng một chỗ ngồi | Lost update, Lock | [phase-8 bài 2](../phase-8/02-double-booking-va-pagination.md) |
| Báo cáo ra số không khớp với danh sách | Non-repeatable read, Phantom read | [phase-2 bài 3](../phase-2/03-isolation-va-read-phenomena.md) |
| Ứng dụng báo "deadlock detected" | Deadlock | [phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md) |
| Vừa lưu xong tải lại thấy dữ liệu cũ | Replication lag | [phase-9 bài 1](../phase-9/01-database-replication-la-gi.md) |
| Bảng phình to mãi dù đã xoá dữ liệu | MVCC, VACUUM | [phase-3 bài 1](../phase-3/01-page-heap-va-io.md) |
| `OFFSET 100000` chạy 30 giây | Full table scan, Keyset pagination | [phase-8 bài 2](../phase-8/02-double-booking-va-pagination.md) |
| Hết connection dù server còn rảnh | Connection pool | [phase-8 bài 3](../phase-8/03-connection-pooling.md) |
| Ghi rất nhiều, B-Tree không chịu nổi | LSM Tree, Compaction | [phase-11 bài 3](../phase-11/03-leveldb-rocksdb-va-demo.md) |

## Mười từ nếu chỉ được nhớ mười từ

Nếu bạn quên hết bài này, giữ lại mười từ sau là đủ để đọc được phần lớn tài liệu database:

1. **Page** — đơn vị đọc/ghi, 8 KB hoặc 16 KB. Database đếm page, không đếm dòng.
2. **Buffer pool** — RAM giữ page nóng. Tỉ lệ trúng đích quyết định tốc độ hệ thống.
3. **I/O** — chạm đĩa. Chậm hơn RAM 1.000-100.000 lần. Mọi tối ưu đều nhằm giảm cái này.
4. **Index / B+Tree** — mục lục có sắp xếp, cao 3-4 tầng, chứa hàng trăm triệu dòng.
5. **WAL** — ghi nhật ký trước, sửa dữ liệu sau. Nền tảng của độ bền và của phục hồi sau sự cố.
6. **Transaction** — nhóm lệnh một mất một còn.
7. **Isolation level** — độ dày bức tường giữa các transaction chạy song song.
8. **MVCC** — nhiều phiên bản một dòng, để người đọc và người ghi không chặn nhau.
9. **Lock** — khoá. Shared thì chia sẻ được, Exclusive thì độc chiếm.
10. **Planner** — kẻ thật sự quyết định query của bạn chạy thế nào.

## Tóm tắt bài 0

- Database chỉ là một tiến trình đọc ghi file thường; mọi thuật ngữ đều là tên của một giải pháp cho ba vấn đề: **đĩa chậm, RAM ít, điện có thể mất**.
- Đơn vị suy nghĩ của database là **page**, không phải dòng. Đổi được đơn vị suy nghĩ này là hiểu được phần lớn phần còn lại.
- Index nhanh nhờ **B+Tree 3-4 tầng**, nhưng chỉ đáng dùng khi lọc ra dưới ~10% số dòng.
- Bốn hiện tượng đọc bất thường (**dirty / non-repeatable / phantom / lost update**) là lý do isolation level tồn tại.
- **MVCC** là câu trả lời hiện đại cho tranh chấp: nhiều phiên bản thay vì khoá, đổi lại phải dọn rác.
- Hình *"Đường đi của một câu SELECT"* là bộ khung của cả khoá — các phase sau chỉ phóng to từng ô.

**Bài kế tiếp** → [Bài 1: Vì sao phải đi xuống dưới lớp SQL](01-gioi-thieu-khoa-hoc.md)

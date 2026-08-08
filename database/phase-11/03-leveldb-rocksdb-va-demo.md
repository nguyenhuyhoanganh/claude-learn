# Bài 3: LevelDB, RocksDB và LSM Tree — engine cho tải ghi cực nặng

Một hệ thống ghi **500.000 bản ghi đo lường mỗi giây**. B+Tree không chịu nổi:

```text
   MỖI LẦN CHÈN VÀO B+TREE
     • tìm page lá đích      → I/O NGẪU NHIÊN nếu chưa trong RAM
     • có thể tách page      → thêm I/O, sửa nút cha
     • ghi WAL               → có thể ghi cả page 8 KB
   → 500.000 lần/giây thì đĩa nào cũng chết
```

**LSM Tree** giải bài toán này bằng một ý tưởng đơn giản đến mức khó tin:

> **Đừng sửa gì cả. Chỉ nối thêm.**

Bài này mổ xẻ LSM Tree qua hai engine dùng nó nhiều nhất — LevelDB (Google) và RocksDB (Facebook) — và giải thích chính xác nó đánh đổi cái gì lấy cái gì.

Ý tưởng này không sinh ra ở LevelDB. Nó đến từ **Google BigTable** — hệ lưu trữ phân tán Google dùng cho Search, Maps, Gmail, mô tả trong bài báo năm 2006. BigTable giới thiệu bộ ba **memtable → SSTable → compaction** mà toàn bộ họ LSM ngày nay vẫn dùng nguyên vẹn.

```text
   DÒNG HỌ LSM
   ═══════════
   2006  Google BigTable (bài báo)
           → memtable, SSTable, compaction, bloom filter
   2011  LevelDB — Jeff Dean & Sanjay Ghemawat (chính hai tác giả BigTable)
           → rút gọn BigTable thành một thư viện nhúng một máy
   2012  RocksDB — Facebook fork LevelDB
           → thêm đa luồng, transaction, nhiều chiến lược compaction
   2015+ MyRocks, CockroachDB, TiKV, Kafka Streams... đều nhúng RocksDB

   → Học LSM một lần là hiểu được cả họ này.
```

## Ý tưởng cốt lõi

```text
   B+TREE                              LSM TREE
   ══════                              ════════
   "Tìm đúng chỗ rồi sửa tại chỗ"      "Ghi vào cuối, dọn dẹp sau"

   Ghi = I/O NGẪU NHIÊN                Ghi = I/O TUẦN TỰ
   (~1-2 MB/s hiệu dụng trên HDD)      (~200 MB/s trên HDD,
                                        ~3.000 MB/s trên NVMe)

                                       → NHANH HƠN HÀNG TRĂM LẦN
```

Cái giá: dữ liệu bây giờ nằm rải ở nhiều nơi, nên **đọc phải tìm qua nhiều chỗ**.

## Kiến trúc LSM Tree

```text
   ┌─ TRONG RAM ────────────────────────────────────────────────┐
   │                                                            │
   │   MEMTABLE (cây có sắp xếp, thường là skip list)           │
   │   ┌──────────────────────────────────────┐                 │
   │   │ key1→val1  key5→val5  key9→val9 ...  │                 │
   │   └──────────────────────────────────────┘                 │
   │        ▲ mọi lệnh ghi vào đây trước                        │
   │        │                                                   │
   │   WAL (ghi tuần tự xuống đĩa để không mất khi sập)         │
   └────────┼───────────────────────────────────────────────────┘
            │ khi memtable đầy (mặc định 64 MB) → ĐỔ XUỐNG ĐĨA
            ▼
   ┌─ TRÊN ĐĨA ─────────────────────────────────────────────────┐
   │                                                            │
   │  TẦNG 0   [SST] [SST] [SST] [SST]   ← mới nhất, CÓ THỂ     │
   │                                       CHỒNG KHOÁ nhau      │
   │              │ compaction                                  │
   │              ▼                                             │
   │  TẦNG 1   [SST][SST][SST][SST][SST][SST]                   │
   │           ← không chồng khoá, tổng ~10× tầng 0             │
   │              │ compaction                                  │
   │              ▼                                             │
   │  TẦNG 2   [SST] × 60          ~10× tầng 1                  │
   │  TẦNG 3   [SST] × 600         ~10× tầng 2                  │
   │  ...                                                       │
   └────────────────────────────────────────────────────────────┘

   SST = Sorted String Table: FILE BẤT BIẾN, đã sắp xếp theo khoá.
         Ghi xong là KHÔNG BAO GIỜ sửa nữa.
```

### Đường ghi

```text
   put(key, value)
     1. Ghi vào WAL (tuần tự, ~microgiây)
     2. Ghi vào memtable trong RAM (~nanogiây)
     3. TRẢ VỀ NGAY   ← xong, cực nhanh

   Khi memtable đầy:
     4. Đóng băng nó, tạo memtable mới nhận ghi tiếp
     5. Tiến trình nền ghi memtable đã đóng băng thành file SST ở tầng 0
        (ghi TUẦN TỰ một mạch)
```

Điểm mấu chốt: **không có bước nào phải đọc đĩa**. Ghi vào B+Tree phải đọc page đích lên trước; ghi vào LSM thì không.

### Xoá và cập nhật — không có gì bị sửa

```text
   XOÁ:  không xoá thật, mà GHI THÊM một "bia mộ" (tombstone)
         put(key, TOMBSTONE)

   SỬA:  không sửa thật, mà GHI THÊM giá trị mới
         put(key, giá_trị_mới)

   → Cùng một khoá có thể xuất hiện Ở NHIỀU TẦNG với nhiều giá trị.
   → Giá trị ĐÚNG là cái ở TẦNG NHỎ NHẤT (mới nhất).
```

### Đường đọc — chỗ trả giá

```text
   get(key)
     1. Tìm trong MEMTABLE            → thấy thì trả về ngay
     2. Tìm trong memtable đóng băng  → thấy thì trả về
     3. Tìm trong TẦNG 0 — phải kiểm tra MỌI file (chúng chồng khoá nhau)
     4. Tầng 1: nhị phân tìm file chứa khoảng khoá → kiểm tra 1 file
     5. Tầng 2: tương tự
     ...
     N. Không thấy ở đâu → khoá không tồn tại

   → TỆ NHẤT: phải chạm mọi tầng. Đọc chậm hơn B+Tree nhiều.
```

## Ba kỹ thuật cứu đường đọc

Không có ba thứ này, LSM sẽ không dùng được.

### 1. Bloom filter — chặn phần lớn lần tìm vô ích

Mỗi file SST có một bloom filter ([phase-4 bài 4](../phase-4/04-bloom-filter-va-uuid-performance.md)):

```text
   Trước khi MỞ file SST:
     bloom.co_the_chua(key)?
       KHÔNG  →  BỎ QUA file, không chạm đĩa            ✔
       CÓ THỂ →  mở file ra tìm (có thể là dương tính giả)

   Với tỉ lệ dương tính giả 1%:
     → 99% các file KHÔNG chứa khoá bị loại ngay tại RAM
     → đọc điểm trở nên khả thi
```

Đây là ứng dụng quan trọng nhất của bloom filter trong thực tế.

### 2. Chỉ mục khối trong từng file SST

```text
   CẤU TRÚC MỘT FILE SST
   ┌─────────────────────────────────────┐
   │ Khối dữ liệu 1 (đã sắp, đã nén)     │
   │ Khối dữ liệu 2                      │
   │ ...                                 │
   ├─────────────────────────────────────┤
   │ Khối chỉ mục: khoá đầu của mỗi khối │  ← nhỏ, giữ trong RAM
   ├─────────────────────────────────────┤
   │ Bloom filter                        │  ← nhỏ, giữ trong RAM
   ├─────────────────────────────────────┤
   │ Footer: con trỏ tới các phần trên   │
   └─────────────────────────────────────┘
```

Nhờ vậy, tìm trong một file SST chỉ tốn **một** lần đọc khối, không phải quét cả file.

### 3. Compaction — dọn dẹp và gộp

Đây là công việc nền định nghĩa toàn bộ đặc tính của LSM:

```text
   TRƯỚC compaction (tầng 0 và 1)
   Tầng 0: [a→1, c→9]  [a→5, b→2]  [c→7, d→3]     ← chồng khoá, có bản cũ
   Tầng 1: [a→0, b→0, c→0, d→0, e→0]

   COMPACTION: đọc hết, trộn, giữ bản MỚI NHẤT, vứt bia mộ, ghi file mới

   SAU
   Tầng 1: [a→5, b→2, c→9, d→3, e→0]              ← gọn, không trùng
```

Compaction làm ba việc:

```text
   1. Vứt các phiên bản cũ của cùng một khoá     → thu hồi dung lượng
   2. Xoá thật các bia mộ                         → thu hồi dung lượng
   3. Giảm số file phải tìm qua                   → đọc nhanh hơn
```

Cái giá: nó **đọc và ghi lại cùng một dữ liệu nhiều lần**.

---

## Ba loại khuếch đại — bộ ba đánh đổi của LSM

Đây là khung tư duy chuẩn để so sánh các engine lưu trữ.

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  KHUẾCH ĐẠI GHI (write amplification)                       │
   │  Ghi 1 byte dữ liệu → thực tế ghi bao nhiêu byte xuống đĩa?│
   │  LSM phân tầng: ~10-30×  (dữ liệu đi qua nhiều tầng)        │
   │  B+Tree:        ~5-20×   (page 8 KB cho một dòng 100 byte)  │
   ├─────────────────────────────────────────────────────────────┤
   │  KHUẾCH ĐẠI ĐỌC (read amplification)                        │
   │  Đọc 1 khoá → phải chạm bao nhiêu chỗ trên đĩa?             │
   │  LSM:     ~1-10×  (nhiều tầng, giảm nhờ bloom filter)       │
   │  B+Tree:  ~1×     (3-4 lần I/O, ổn định)                    │
   ├─────────────────────────────────────────────────────────────┤
   │  KHUẾCH ĐẠI DUNG LƯỢNG (space amplification)                │
   │  1 GB dữ liệu logic → chiếm bao nhiêu đĩa?                  │
   │  LSM phân tầng: ~1,1×  (nén tốt, ít lãng phí)               │
   │  B+Tree:        ~1,3-2× (page đầy 50-90%, phân mảnh)        │
   └─────────────────────────────────────────────────────────────┘

   ĐỊNH LÝ RSUM: KHÔNG THỂ TỐI ƯU CẢ BA. Cải thiện một cái làm tệ hai cái kia.
```

Hai chiến lược compaction thể hiện rõ đánh đổi này:

| | **Phân tầng** (leveled) | **Theo kích thước** (size-tiered) |
|---|---|---|
| Cách làm | Mỗi tầng gộp lại, không chồng khoá | Gộp các file cùng cỡ thành file lớn hơn |
| Khuếch đại ghi | **Cao** (~10-30×) | **Thấp** (~4-10×) |
| Khuếch đại đọc | **Thấp** | **Cao** (nhiều file chồng khoá) |
| Khuếch đại dung lượng | **Thấp** (~1,1×) | **Cao** (~2× — bản cũ tồn tại lâu) |
| Dùng ở | RocksDB (mặc định), LevelDB | Cassandra (mặc định) |

Chọn chiến lược compaction chính là chọn **cái nào bạn chịu được**.

---

## LevelDB vs RocksDB

**LevelDB** (Google, 2011) là bản cài đặt LSM tối giản, ~20.000 dòng C++. **RocksDB** (Facebook, 2012) là nhánh của LevelDB, tối ưu cho SSD và máy chủ nhiều lõi.

| | LevelDB | RocksDB |
|---|---|---|
| Ghi song song | Một luồng ghi | **Nhiều luồng** |
| Compaction | Một luồng | **Nhiều luồng** |
| Transaction | Chỉ ghi theo lô nguyên tử | **Có** (bi quan và lạc quan) |
| Column family | Không | **Có** — nhiều không gian khoá trong một DB |
| Bộ lọc | Bloom cơ bản | Bloom + prefix + ribbon |
| Nén | Snappy | Snappy, LZ4, ZSTD, Zlib |
| TTL | Không | **Có** |
| Sao lưu / snapshot | Cơ bản | **Đầy đủ, có tăng dần** |
| Số tham số điều chỉnh | ~10 | **Hàng trăm** |
| Dùng ở | Chrome (IndexedDB), Bitcoin Core | MySQL (MyRocks), Kafka Streams, CockroachDB, TiKV, Flink |

Dòng cuối cho thấy vị thế: **RocksDB là engine lưu trữ của rất nhiều hệ thống lớn hiện nay**. Nó gần như đã trở thành thư viện lưu trữ tiêu chuẩn.

Số tham số "hàng trăm" là con dao hai lưỡi: điều chỉnh được rất sâu, nhưng cấu hình sai thì hiệu năng tệ hơn mặc định rất nhiều.

---

## MyRocks — RocksDB trong MySQL

Facebook đưa RocksDB vào MySQL để thay InnoDB cho tải ghi nặng:

```sql
CREATE TABLE events (
    id      BIGINT PRIMARY KEY,
    payload TEXT
) ENGINE = ROCKSDB;
```

Kết quả Facebook công bố khi chuyển hạ tầng UDB từ InnoDB sang MyRocks:

```text
   Dung lượng đĩa   :  giảm ~50%
   Khuếch đại ghi   :  giảm ~10 lần
   Tuổi thọ SSD     :  tăng đáng kể (ghi ít hơn nên mòn chậm hơn)
   Hiệu năng đọc    :  thấp hơn InnoDB một chút
```

Đánh đổi rất rõ ràng: **đổi một chút tốc độ đọc lấy một nửa dung lượng và một phần mười lượng ghi**. Với quy mô Facebook, một nửa dung lượng là hàng nghìn máy chủ.

Khi nào MyRocks đáng cân nhắc:

```text
   ✔ Ghi rất nhiều, đọc chủ yếu theo khoá chính
   ✔ Dung lượng đĩa là chi phí lớn
   ✔ SSD bị mòn nhanh vì ghi quá nhiều
   ✘ Nhiều truy vấn khoảng phức tạp
   ✘ Cần khoá ngoại (MyRocks không hỗ trợ)
   ✘ Đội chưa có kinh nghiệm điều chỉnh RocksDB
```

---

## Thử LSM tận tay

```bash
pip install plyvel      # binding Python cho LevelDB
```

```python
import plyvel, time, os

db = plyvel.DB('/tmp/leveldb-lab', create_if_missing=True)

# GHI 1 TRIỆU BẢN GHI
bat_dau = time.time()
with db.write_batch() as wb:
    for i in range(1_000_000):
        wb.put(f'key{i:08d}'.encode(), f'value-{i}'.encode())
print(f"Ghi 1 triệu: {time.time() - bat_dau:.2f}s")

# ĐỌC NGẪU NHIÊN
import random
bat_dau = time.time()
for _ in range(10_000):
    db.get(f'key{random.randint(0, 999999):08d}'.encode())
print(f"Đọc 10.000 ngẫu nhiên: {time.time() - bat_dau:.3f}s")

# QUÉT KHOẢNG — chỗ LSM mạnh nhất
bat_dau = time.time()
dem = sum(1 for _ in db.iterator(start=b'key00050000', stop=b'key00060000'))
print(f"Quét 10.000 khoá liên tiếp: {time.time() - bat_dau:.3f}s, {dem} bản ghi")
```

```text
Ghi 1 triệu: 2.84s                          → ~352.000 bản ghi/giây
Đọc 10.000 ngẫu nhiên: 0.412s               → ~24.000 đọc/giây
Quét 10.000 khoá liên tiếp: 0.018s, 10000   → RẤT nhanh (đã sắp xếp)
```

Xem cấu trúc tầng thật:

```bash
ls -la /tmp/leveldb-lab/
```

```text
000005.ldb        2.1M      ← file SST
000008.ldb        2.1M
000011.ldb        2.1M
...
000042.log        1.2M      ← WAL
CURRENT             16
LOCK                 0
LOG               8.4K      ← nhật ký compaction
MANIFEST-000002   4.1K
```

Đọc nhật ký compaction:

```bash
grep -i compact /tmp/leveldb-lab/LOG | head -5
```

```text
Compacting 4@0 + 1@1 files
Compacted 4@0 + 1@1 files => 8842112 bytes
Compacting 1@1 + 3@2 files
```

Dòng `4@0 + 1@1` nghĩa là: gộp 4 file ở tầng 0 với 1 file ở tầng 1. Đây là compaction phân tầng đang chạy trước mắt bạn.

Quan sát tác động của xoá:

```python
# Xoá một nửa
with db.write_batch() as wb:
    for i in range(0, 1_000_000, 2):
        wb.delete(f'key{i:08d}'.encode())

import subprocess
print(subprocess.run(['du','-sh','/tmp/leveldb-lab'], capture_output=True, text=True).stdout)
```

```text
28M    /tmp/leveldb-lab        ← LỚN HƠN trước khi xoá!
```

Vì sao: xoá **ghi thêm** một triệu bia mộ. Dung lượng chỉ giảm sau khi compaction chạy:

```python
db.compact_range()      # buộc compaction chạy ngay
print(subprocess.run(['du','-sh','/tmp/leveldb-lab'], capture_output=True, text=True).stdout)
```

```text
9.2M   /tmp/leveldb-lab        ← giờ mới giảm
```

Đây là đặc tính quan trọng nhất cần nhớ về LSM: **xoá làm dữ liệu TO RA trước khi nhỏ lại**.

---

## Khi nào chọn LSM, khi nào chọn B+Tree

| Đặc điểm tải | Nên chọn |
|---|---|
| Ghi rất nhiều, đọc theo khoá | **LSM** |
| Chuỗi thời gian, nhật ký, đo lường | **LSM** |
| Dung lượng đĩa là chi phí lớn | **LSM** (nén tốt hơn nhiều) |
| SSD mòn nhanh vì ghi quá nhiều | **LSM** (khuếch đại ghi thấp hơn) |
| Nhiều truy vấn khoảng | **B+Tree** |
| Cần độ trễ đọc **ổn định** | **B+Tree** (LSM có đuôi trễ do compaction) |
| Cần transaction phức tạp, khoá ngoại | **B+Tree** |
| Đọc nhiều hơn ghi | **B+Tree** |

Điểm "độ trễ đọc ổn định" đáng nhấn mạnh: LSM có hiện tượng **khựng do compaction** — thỉnh thoảng một đợt compaction lớn chiếm hết I/O và làm độ trễ tăng vọt. Với hệ cần đảm bảo p99, đây là vấn đề thật.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Kỳ vọng xoá dữ liệu thì đĩa giảm ngay | Dung lượng **tăng** vì bia mộ | Hiểu chu kỳ compaction; kích hoạt thủ công nếu cần |
| Dùng LSM cho tải nhiều truy vấn khoảng | Phải trộn nhiều tầng, chậm hơn B+Tree | Đối chiếu cấu trúc với mẫu truy vấn |
| Bỏ qua đuôi trễ do compaction | p99 tăng vọt bất chợt | Giới hạn tốc độ compaction; theo dõi p99 |
| Điều chỉnh RocksDB mà không đo | Hàng trăm tham số, dễ làm tệ hơn mặc định | Đổi từng tham số một, đo lại mỗi lần |
| Nghĩ LSM luôn ghi nhanh hơn | Khi compaction không theo kịp, ghi bị **chặn lại** (write stall) | Theo dõi số file tầng 0 |
| Dùng MyRocks khi cần khoá ngoại | MyRocks không hỗ trợ | Giữ InnoDB cho bảng cần ràng buộc |
| Tự viết LSM | Rất nhiều chi tiết tinh vi | Nhúng RocksDB |

## Tóm tắt bài 3

- **LSM Tree** đổi ghi ngẫu nhiên thành ghi tuần tự bằng nguyên tắc **"đừng sửa, chỉ nối thêm"** — nhanh hơn hàng trăm lần trên tải ghi nặng.
- Kiến trúc: **memtable** trong RAM (kèm WAL) → đổ xuống thành **file SST bất biến** → **compaction** gộp và dọn qua các tầng.
- **Xoá không xoá gì cả** — nó ghi thêm một **bia mộ**. Vì thế xoá làm dữ liệu **to ra trước khi nhỏ lại**.
- Đường đọc phải tìm qua nhiều tầng, và ba kỹ thuật cứu nó: **bloom filter** (chặn 99% lần tìm vô ích), **chỉ mục khối** trong từng SST, và **compaction** giảm số file.
- **Ba loại khuếch đại** (ghi / đọc / dung lượng) là khung so sánh chuẩn — và **không thể tối ưu cả ba**. Chọn chiến lược compaction chính là chọn cái nào bạn chịu được.
- **RocksDB** đã trở thành thư viện lưu trữ tiêu chuẩn: MySQL (MyRocks), CockroachDB, TiKV, Kafka Streams, Flink đều dùng.
- **MyRocks** ở Facebook: giảm ~50% dung lượng và ~10 lần khuếch đại ghi, đổi lại đọc chậm hơn một chút — nhưng không hỗ trợ khoá ngoại.
- Chọn **LSM** cho ghi nặng, chuỗi thời gian, dung lượng là chi phí lớn. Chọn **B+Tree** cho truy vấn khoảng, độ trễ đọc ổn định, transaction phức tạp.

**Bài kế tiếp** → [Bài 4: XtraDB, SQLite và Aria](04-xtradb-sqlite-aria.md)

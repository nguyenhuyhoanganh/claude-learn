# Bài 1: Lưu Trữ Dữ Liệu trên Disk và Kiến Trúc PostgreSQL

## Phần 1: Database Lưu Dữ Liệu trên Disk như thế nào?

### Ổ cứng HDD vs SSD - Khái niệm cơ bản

```
HDD (Hard Disk Drive) - Đĩa cứng cơ học:
  Tổ chức vật lý:
    Platter (đĩa tròn) → Track → Sector → Block
    Mỗi block: 512 bytes (thường gặp)
    Địa chỉ: [Platter số, Track số, Sector số, Block số]

  Ưu điểm:
    ✅ Ghi đè nhiều lần không hỏng
    ✅ Rẻ hơn cho dung lượng lớn

  Nhược điểm:
    ❌ Chậm - bị giới hạn vật lý (phải quay, di chuyển đầu đọc)
    ❌ Sequential I/O cần spindle time

SSD (Solid State Drive):
  Tổ chức logic:
    Block → Pages (nhiều pages/block)
    Mỗi page: 4KB-8KB thông thường
    Địa chỉ: [Block số, Page số]

  Ưu điểm:
    ✅ Nhanh hơn 100-400x (random access)
    ✅ Không có bộ phận cơ học

  Nhược điểm:
    ❌ Có "shelf life" (giới hạn số lần ghi)
    ❌ Không thể ghi đè trực tiếp - phải erase trước
```

### Cách Database Đọc Dữ Liệu

```
Ví dụ: Table với 1 column integer (4 bytes/row)

Insert row 1 (=7):       [7 | _ | _ | _ | ... | _]
                                           ↑ 512 bytes block
Insert row 2 (=100):     [7 | 100 | _ | _ | ... | _]
Insert rows 3...128:     [7 | 100 | ... | row128]   ← Block đầy!
Insert row 129:          Cần block mới!
                         [row129 | _ | _ | ...]

Khi cần đọc row 1:
  1. Database tra metadata: "Row 1 ở Block X, Page Y"
  2. Đọc toàn bộ block (512 bytes) - không thể đọc 4 bytes!
  3. Extract row 1 từ block đó
  
  → Row 2, 3... 128 được "miễn phí" (đã trong cùng block!)
  → Row 129 cần I/O thứ hai (block khác)
```

### Vấn đề SSD: Write Amplification

```
SSD không cho phép ghi đè (overwrite) trực tiếp!

Quy trình update trong SSD:
  1. Tìm page cũ chứa data cần update
  2. Mark page cũ là "stale" (không xóa ngay)
  3. Ghi data mới vào page MỚI (trống)
  4. Cập nhật mapping: logical page → new physical page

Vấn đề: Block với stale pages không thể dùng!
  Block [Page_A_new | Page_B_new | Page_A_old(stale) | Page_B_old(stale)]
         ↑ active                  ↑ wasted space!

Garbage Collection:
  → Chạy ngầm, copy active pages sang block mới
  → Xóa sạch block cũ (chỉ erase được cả block!)
  → Tốn thêm I/O = write amplification!
```

### B-Tree và SSDs - Tại sao LSM-Tree ra đời

```
B-Tree vấn đề với SSD:
  Khi insert data mới, B-Tree rebalance → update internal nodes
  Update internal node = ghi đè → SSD không thích!
  
  Kết quả:
    ✅ Inserts vào leaf pages (append-only, SSD OK)
    ❌ Rebalancing updates internal pages (SSD không thích)
    ❌ Nhiều stale pages → garbage collection nhiều → SSD xuống cấp

Facebook với RocksDB:
  → Nhận ra B-Tree "giết" SSDs khi write-heavy
  → Chuyển sang LSM-Tree (Log-Structured Merge Tree)
  
  LSM-Tree = Append-only:
    → Không bao giờ update in-place
    → Luôn write mới → SSD yêu thích!
    → Thương đánh đổi: Read hơi chậm hơn
```

---

## Phần 2: Kiến Trúc PostgreSQL - Các Processes

### Kiến trúc Process-based (không phải Thread-based)

```
Postgres chọn processes thay vì threads:
  Lý do lịch sử: Threads không ổn định vào những năm 1990
  Ngày nay: Threads đã ổn định nhưng Postgres vẫn giữ thiết kế cũ
  
  Trade-off của processes:
    ✅ Isolation tốt hơn (crash 1 process không ảnh hưởng khác)
    ❌ Mỗi process cần virtual memory space riêng
    ❌ Context switching tốn kém hơn threads
    ❌ TLB (Translation Lookaside Buffer) cache misses nhiều hơn
```

### Sơ đồ Kiến trúc PostgreSQL

```
┌─────────────────────────────────────────────────┐
│                  Client                          │
│  (App server, psql, connection pool)             │
└──────────────────┬──────────────────────────────┘
                   │ TCP Port 5432
                   ▼
┌─────────────────────────────────────────────────┐
│           Postmaster Process                     │
│  (Process cha - lắng nghe kết nối đến)          │
│  → Fork new backend process cho mỗi connection  │
└──────────────────┬──────────────────────────────┘
        ┌──────────┴──────────┐
        ▼                     ▼
┌──────────────┐     ┌──────────────────────────────┐
│   Backend     │     │      Shared Memory            │
│  Process 1   │◄───►│  (Shared Buffers / Buffer Pool│
├──────────────┤     │   + WAL records)              │
│   Backend     │◄───►│                              │
│  Process 2   │     └──────────────────────────────┘
└──────────────┘
        │
        ▼
┌──────────────────────────────────────────────────┐
│           Background Workers                     │
│  (Parallel query execution, pooled processes)    │
└──────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────┐
│  Auxiliary Processes (chạy nền, maintenance)     │
│  ┌─────────────────┬──────────────────────────┐  │
│  │ Background Writer│ Ghi dirty pages → OS cache│ │
│  ├─────────────────┼──────────────────────────┤  │
│  │ Checkpointer    │ Flush pages + WAL → Disk  │  │
│  ├─────────────────┼──────────────────────────┤  │
│  │ WAL Writer      │ Flush WAL → Disk khi commit│ │
│  ├─────────────────┼──────────────────────────┤  │
│  │ Autovacuum      │ Dọn dead tuples           │  │
│  ├─────────────────┼──────────────────────────┤  │
│  │ WAL Archiver    │ Backup WAL cho history    │  │
│  ├─────────────────┼──────────────────────────┤  │
│  │ WAL Receiver    │ Nhận WAL từ master (replica)│ │
│  ├─────────────────┼──────────────────────────┤  │
│  │ WAL Sender      │ Push WAL đến replicas     │  │
│  ├─────────────────┼──────────────────────────┤  │
│  │ Startup Process │ Recovery sau crash        │  │
│  └─────────────────┴──────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### Giải thích các Processes quan trọng

#### Postmaster - "Process cha"

```
Vai trò:
  → Listener trên port 5432
  → Fork backend process mới cho mỗi client connection
  → Parent của tất cả processes khác

Max connections = 100 (mặc định):
  → Mỗi connection = 1 process riêng
  → Process tốn RAM + CPU (context switching)
  → Default thấp để bảo vệ server khỏi OOM
  → Giải pháp: Connection pooler (PgBouncer) trước Postgres
```

#### Backend Process - "1 connection = 1 process"

```
Mỗi lần client kết nối:
  Postmaster fork() → tạo backend process mới
  
  Fork() trong Linux:
    → Copy virtual memory address space (không thực sự copy data)
    → Dùng Copy-on-Write (COW): chỉ copy page khi có thay đổi
    → Chia sẻ shared memory với tất cả processes
```

#### Shared Memory - "Trái tim của Postgres"

```
Chứa:
  - Shared Buffers: Cache pages từ disk (8KB mỗi page)
  - WAL records: Write-Ahead Log changes
  - Lock information: Lock tables
  
Cấu hình:
  shared_buffers = 128MB  (mặc định, khá thấp)
  Khuyến nghị: 25% RAM server
  
Tại sao shared? Tất cả backend processes đều truy cập
  → Dùng mmap() để chia sẻ giữa processes
  → Cần mutex/semaphore để tránh race conditions
```

#### Background Writer vs Checkpointer

```
Background Writer:
  → Ghi dirty pages từ shared buffers → OS file cache
  → OS cache (KHÔNG phải disk trực tiếp)
  → Mục đích: Giải phóng space trong shared buffers
  → Nếu crash: Không sao! WAL sẽ recover
  
Checkpointer:
  → Flush TẤT CẢ dirty pages + WAL → Disk thực (O_DIRECT)
  → Tạo "checkpoint record": "Tại thời điểm này, DB consistent"
  → Mục đích: Durability + giảm recovery time
  
  Khác biệt then chốt:
    Background Writer: OS cache (not durable)
    Checkpointer: Disk thực (durable)
```

#### WAL Writer - "Đảm bảo Durability khi Commit"

```
Khi bạn COMMIT:
  → WAL Writer PHẢI flush WAL records → Disk trước khi trả lời
  → Pages trong shared buffers có thể vẫn dirty → OK
  → Tại sao? WAL là "redo log" - crash recovery dựa vào đây
  
  Không phải chờ pages flush → Performance tốt hơn!
```

#### Startup Process - "Recovery sau crash"

```
Chạy ĐẦU TIÊN khi Postgres khởi động (trước Postmaster!)

Quy trình recovery:
  1. Tìm checkpoint cuối cùng (lần cuối consistent)
  2. Tìm tất cả WAL records SAU checkpoint đó
  3. Apply WAL records vào pages trong memory (redo)
  4. Pages bây giờ = trạng thái trước khi crash
  5. Bàn giao cho Postmaster → bắt đầu nhận connections

  → Đây là lý do WAL còn gọi là "redo log"
```

#### Autovacuum - "Dọn dẹp MVCC"

```
Vấn đề: Postgres dùng tuples (MVCC append-only):
  UPDATE row = tạo tuple mới + mark tuple cũ là dead
  
  Sau nhiều updates: Bảng đầy "dead tuples" vô dụng
  
Autovacuum làm:
  → Scan table, tìm dead tuples
  → Free up space trong pages
  → Update Visibility Map (cho Index Only Scan)
  → Update statistics (cho query planner)
  
  Autovacuum Launcher: Process quản lý
  Autovacuum Workers: Thực sự dọn dẹp (max_autovacuum_workers)
```

---

## Tóm tắt

```
Lưu trữ disk:
  HDD: Sector/Block cơ học, đọc bằng block (512B), overwrite OK
  SSD: Pages/Blocks, không overwrite trực tiếp → write amplification
  Database đọc theo page (8KB), không phải byte
  B-Tree + SSD = cần cẩn thận (rebalancing updates in-place)
  LSM-Tree + SSD = tốt hơn cho write-heavy workloads

Postgres Architecture:
  Process-based (không phải thread-based)
  Postmaster → fork backend per connection
  Shared Memory = shared buffers + WAL
  Background Writer → OS cache (không durable)
  Checkpointer → disk trực tiếp (durable)
  WAL Writer → flush WAL khi commit (key for durability)
  Startup Process → recovery after crash (redo WAL)
  Autovacuum → dọn dead tuples từ MVCC
```

---

**Tiếp theo:** 02-distributed-systems-va-consistent-hashing.md →

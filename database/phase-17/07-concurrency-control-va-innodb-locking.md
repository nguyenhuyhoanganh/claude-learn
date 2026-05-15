# Bài 7: Optimistic vs Pessimistic Concurrency Control và MySQL InnoDB Locking

## Phần 1: Concurrency Control - Vấn đề cần giải quyết

### Lost Update Problem

```
Kịch bản: 2 transactions cùng update account balance

T1: BEGIN
T1: SELECT balance FROM accounts WHERE id=1; → $100
T1: (tính toán, mất 2 giây)

T2: BEGIN
T2: SELECT balance FROM accounts WHERE id=1; → $100
T2: UPDATE accounts SET balance = 90 WHERE id=1;  (withdraw $10)
T2: COMMIT

T1: UPDATE accounts SET balance = 150 WHERE id=1;  (deposit $50)
T1: COMMIT

Kết quả: balance = $150 (SAI!)
         Đúng phải là: 100 - 10 + 50 = $140

→ T2's update bị "lost" (mất)!
→ Đây là LOST UPDATE problem
```

### Giải pháp: Concurrency Control

```
Câu hỏi cốt lõi:
  "Làm sao ngăn người khác thay đổi value
   mà bạn đang làm việc?"

2 trường phái:
  1. Pessimistic: Lock ngay khi bắt đầu
  2. Optimistic:  Không lock, kiểm tra lúc commit
```

---

## Phần 2: Pessimistic Concurrency Control

### Ý tưởng

```
Pessimistic = "Tôi bi quan, tôi khóa mọi thứ trước"

Giống như: Mang ô mỗi ngày dù trời đẹp
  → Đảm bảo không bị ướt
  → Nhưng mang ô nặng, tốn sức

Database: Lock row trước khi đọc/ghi
  → Đảm bảo không ai thay đổi
  → Nhưng locks có chi phí
```

### Cách hoạt động

```
SELECT ... FOR UPDATE (Exclusive Lock):
  T1: BEGIN
  T1: SELECT balance FROM accounts WHERE id=1 FOR UPDATE;
      → Row bị LOCKED!
  
  T2: BEGIN
  T2: SELECT balance FROM accounts WHERE id=1 FOR UPDATE;
      → BLOCKED! Phải đợi T1 release

  T1: UPDATE accounts SET balance = 150 WHERE id=1;
  T1: COMMIT → Lock released

  T2: Unblocked → tiếp tục với balance mới nhất
```

### Lock Types

```
Shared Lock (S-lock) = Read lock:
  Nhiều transactions có thể cùng hold S-lock
  Không thể hold S-lock nếu ai đó có X-lock

Exclusive Lock (X-lock) = Write lock:
  Chỉ 1 transaction hold X-lock tại một thời điểm
  Không ai có thể S-lock hoặc X-lock cùng lúc

Compatibility matrix:
       S-lock  X-lock
S-lock  OK      CONFLICT
X-lock  CONFLICT CONFLICT
```

### Lock Granularity

```
Row-level locks (chi tiết nhất):
  + Chỉ lock rows được access
  - Quản lý phức tạp, tốn memory
  - SQL Server: lưu trong RAM → có thể blow up memory

Page-level locks:
  + Ít overhead hơn row
  - Lock nhiều rows hơn cần thiết

Table-level locks (thô nhất):
  + Đơn giản nhất
  - Block toàn bộ table

SQL Server Lock Escalation:
  Lock 7000+ rows → tự động escalate lên TABLE LOCK!
  → Tiết kiệm memory
  → Nhưng block nhiều transactions khác
  → Có thể tune threshold

PostgreSQL Row Locks:
  Lưu lock info TRÊN DISK (trong row header hints bits)
  → Không cần memory riêng cho lock table
  → Không có lock escalation
  → Nhiều I/O hơn khi lock/unlock
```

---

## Phần 3: Optimistic Concurrency Control

### Ý tưởng

```
Optimistic = "Tôi lạc quan, xung đột ít xảy ra"

Giống như: Không mang ô
  → Nếu mưa: chạy vào cửa hàng mua ô, hay chịu ướt
  → Bình thường thì nhẹ nhàng hơn

Database: Không lock, kiểm tra lúc commit
  → Nếu có conflict: FAIL transaction, retry
  → Thường ít conflict → performance tốt hơn
```

### Cách hoạt động

```
T1: BEGIN
T1: READ balance (version=1, value=$100)  ← ghi nhớ version

T2: BEGIN
T2: READ balance (version=1, value=$100)
T2: UPDATE balance = $90  → COMMIT thành công
    Balance: version=2, value=$90

T1: UPDATE balance = $150
T1: COMMIT CHECK: "balance version vẫn là 1 không?"
    → KHÔNG! version=2 rồi → CONFLICT!
    → Transaction FAILS (rollback)
    → T1 phải RETRY từ đầu

T1 retry:
T1: READ balance (version=2, value=$90)  ← đọc lại
T1: UPDATE balance = $90 + $50 = $140
T1: COMMIT → version=3 → SUCCESS!
```

### Version/Timestamp Approach

```sql
-- Lưu version counter trong table
ALTER TABLE accounts ADD COLUMN version INT DEFAULT 0;

-- Read
SELECT balance, version FROM accounts WHERE id=1;
-- Giả sử: balance=100, version=5

-- Update với version check
UPDATE accounts 
SET balance = 150, version = version + 1
WHERE id = 1 AND version = 5;  -- ← optimistic check

-- Kiểm tra rows_affected:
-- 1 row: SUCCESS (nobody changed between read và write)
-- 0 rows: CONFLICT → retry
```

### MongoDB WiredTiger - Optimistic by Default

```
MongoDB sử dụng Optimistic Concurrency Control:
  - WiredTiger storage engine
  - Không lock rows khi read
  - Conflict detection lúc commit
  - Retry tự động (application phải handle)

Tại sao?
  → Tránh overhead của lock management
  → Multi-core CPU tận dụng tốt hơn
  → Throughput cao hơn khi ít conflict

Khi nào conflict nhiều:
  → Retry liên tục → tệ hơn pessimistic
```

### So sánh

```
┌──────────────────────┬────────────────┬────────────────┐
│                      │ Pessimistic    │ Optimistic     │
├──────────────────────┼────────────────┼────────────────┤
│ Lock overhead        │ Cao            │ Không có       │
│ Conflict handling    │ Blocking/Wait  │ Retry          │
│ Tốt khi conflict     │ Cao            │ Thấp           │
│ Read performance     │ Bị ảnh hưởng  │ Tốt            │
│ Databases dùng       │ Postgres,MySQL │ MongoDB        │
│                      │ Oracle, MSSQL  │ (WiredTiger)   │
├──────────────────────┼────────────────┼────────────────┤
│ Use case tốt         │ Banking, high  │ Social apps,   │
│                      │ conflict rate  │ low conflict   │
└──────────────────────┴────────────────┴────────────────┘
```

---

## Phần 4: MySQL InnoDB B+Tree Locking (Advanced)

### B+Tree Structure Review

```
B+Tree với degree=3 (max 3 elements/node):

           [3, 6]              ← Root (Internal node)
          /       \
       [1,3]    [6,7,9]        ← Leaf pages (data here!)
       
Leaf pages CHAINED:  [1,3] ↔ [6,7,9]  (doubly linked)

Databases: nodes = pages (8KB thường)
  → Mỗi thay đổi = page lock
  → Race condition nếu không lock đúng
```

### MySQL 5.6 - Index-Level Locking

```
MySQL 5.6 approach: Lock toàn bộ INDEX khi cần

READ operation (SELECT):
  1. Acquire S-lock (shared) trên INDEX
  2. Traverse: root → internal → leaf  (không lock từng node)
  3. Acquire S-lock trên LEAF page
  4. Read data
  5. Release leaf S-lock
  6. Release index S-lock

WRITE operation - không có page split:
  1. Acquire S-lock trên INDEX (vẫn shared!)
  2. Traverse đến leaf
  3. Acquire X-lock trên LEAF page
  4. Write data (không làm thay đổi cấu trúc tree)
  5. Release leaf X-lock
  6. Release index S-lock

→ Concurrent reads+writes có thể xảy ra (S-lock compatible)!
```

```
WRITE operation - có PAGE SPLIT (SMO - Structure Modification):
  1. Acquire S-lock trên INDEX
  2. Traverse, tìm leaf, chuẩn bị write
  3. Phát hiện leaf đầy → PHẢI SPLIT
  4. UPGRADE index lock: S → X (exclusive!)
  5. Split leaf, update parent (có thể cascade lên root)
  6. Release X-lock trên index

Vấn đề:
  Trong bước 4-6: KHÔNG AI CÓ THỂ ĐỌC INDEX!
  → All reads bị block
  → Write-heavy workload + nhiều splits → đau!
```

### MySQL 8.0 - Page-Level Locking (Latch Coupling)

```
MySQL 8.0 giới thiệu:
  1. Lock từng PAGE (không chỉ index)
  2. New lock type: SX-lock (Schema modification exclusive)
  3. Latch coupling: lock child trước khi release parent

READ operation (MySQL 8.0):
  1. Acquire S-lock trên INDEX
  2. Lock root page với S-lock
  3. Lock child page với S-lock
  4. Release root S-lock (latch coupling!)
  5. Reach leaf → S-lock leaf
  6. Release internal node locks
  7. Read → Release leaf S-lock → Release index S-lock

Tốt hơn? Đọc vẫn không thay đổi nhiều về correctness,
nhưng cho phép write đồng thời...
```

```
WRITE - không có split (MySQL 8.0):
  1. Acquire S-lock trên INDEX (shared - reads still work!)
  2. Traverse với S-locks trên từng node (latch coupling)
  3. Reach leaf → upgrade to X-lock
  4. Write data (no structure change)
  5. Release X-lock → Release index S-lock

→ Reads và writes có thể concurrent!
→ Miễn là không có page split

WRITE - có PAGE SPLIT (MySQL 8.0):
  1. S-lock index
  2. Traverse...
  3. Leaf đầy → cần split
  4. Acquire SX-lock trên INDEX (không conflict với S-locks!)
     → Reads TIẾP TỤC được phép!
     → Chỉ block writes khác đang split
  5. X-lock từng page cần thay đổi (latch coupling)
  6. Thực hiện split
  7. Release SX-lock

Cải thiện quan trọng:
  WRITE (split) không block READS nữa!
  (MySQL 5.6: write split block cả reads)
```

### Lock Types Summary

```
Lock Hierarchy trong MySQL 8.0:

Index Level:
  S-lock:   Readers + non-split writers
  SX-lock:  Writers với page split (không block S-lock holders)
  X-lock:   Exclusive (không có trong normal ops)

Page Level (Latch):
  S-latch:  Đọc page content
  X-latch:  Ghi vào page

Latch Coupling Pattern:
  Lock parent → Lock child → Release parent → move down
  → Giảm thời gian giữ lock
  → Cho phép concurrent traversal
```

### Thực tế và Trade-offs

```
MySQL 5.6:
  ✅ Simple design
  ✅ Easy to understand
  ❌ Write splits block all reads
  ❌ Write-heavy workload bị ảnh hưởng nhiều

MySQL 8.0:
  ✅ Reads không bị block bởi splits
  ✅ Tốt hơn cho mixed read/write workloads
  ❌ Phức tạp hơn
  ❌ Vẫn có blocking khi cùng path bị traverse

Fill Factor - Giảm thiểu splits:
  Mặc định: page 100% đầy → nhiều splits
  Fill factor 70%:
    → 30% space dự phòng cho inserts/updates
    → Ít splits hơn
    → Ít blocking hơn
  Đánh đổi: dùng nhiều disk hơn

PostgreSQL approach:
  Lưu row locks trực tiếp trong row (hint bits)
  → Không cần lock manager riêng
  → Ít memory
  → Nhiều I/O hơn (phải write hint bits to disk)
  → Không có lock escalation
```

### Tóm tắt chọn approach

```
Pessimistic (Postgres, MySQL, Oracle):
  → High conflict rate
  → Banking, inventory, ticket booking
  → "Không muốn retry, chấp nhận waiting"

Optimistic (MongoDB WiredTiger):
  → Low conflict rate
  → Social media, analytics, read-heavy
  → "Chấp nhận retry, không muốn blocking"

MySQL 5.6 vs 8.0:
  → 8.0 tốt hơn cho mixed workloads
  → 8.0 có bugs và regressions (bài học: upgrade cẩn thận)
  → 9.x đang fix nhiều vấn đề của 8.0

PostgreSQL:
  → Ổn định, predictable
  → Row locks on disk: tốt cho memory, nhiều I/O hơn
  → HOT optimization giảm write amplification
```

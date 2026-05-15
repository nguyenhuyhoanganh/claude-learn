# Bài 4: Hash Tables và Consistent Hashing

## Phần 1: Hash Tables - Cấu trúc nền tảng

### Array - Nền tảng của Hash Table

```
Array trong RAM (consecutive memory slots):
  Index:  [0]  [1]  [2]  [3]  [4]
  Value:  [7]  [23] [15] [42] [8]
  Addr:   0x00 0x04 0x08 0x0C 0x10

  Truy cập array[3]:
    CPU: address = base_addr + 3 × sizeof(int)
       = 0x00 + 3 × 4 = 0x0C
    → Fetch từ 0x0C → return 42
    
  Cost: O(1) - constant time!
  
  Vấn đề: Key phải là integer index (0, 1, 2, ...)
  → Không dùng được key như "user_id=ABC123"
```

### Hash Table = Glorified Array

```
Bài toán: Tìm tên sinh viên theo student_id

student_id: 10045738 → name: "Nguyen Van A"
student_id: 29483721 → name: "Tran Thi B"

Cách Hash Table giải quyết:
  1. Lấy key: 10045738
  2. Hash: hash(10045738) = 3894729384
  3. Modulo: 3894729384 % 10 = 4 (array size = 10)
  4. Store name tại index 4

  array[4] = "Nguyen Van A"

Lookup:
  hash(10045738) % 10 = 4 → array[4] → "Nguyen Van A"
  Cost: O(1)!
```

### Collision - Khi hai keys cùng index

```
Collision xảy ra khi:
  hash(key_A) % size == hash(key_B) % size

Ví dụ:
  hash(10045738) % 10 = 4  ← student A
  hash(29483724) % 10 = 4  ← student B → COLLISION!

Giải pháp phổ biến: Chaining
  array[4] → [student_A] → [student_B] → null
  
Giải pháp khác: Open Addressing (tìm slot kế tiếp)
```

### Use Case: Hash Join trong Database

```
Query: SELECT e.name, c.company_name
       FROM employees e JOIN companies c ON e.company_id = c.id

Bước 1: Build phase (table nhỏ hơn = companies)
  Quét bảng companies, tạo hash table trong RAM:
    hash(company_id=1) % 1000 = 347 → "Apple"
    hash(company_id=2) % 1000 = 892 → "Google"
    hash(company_id=3) % 1000 = 123 → "Meta"

Bước 2: Probe phase (table lớn hơn = employees)
  Quét bảng employees:
    employee: company_id=1
    → hash(1) % 1000 = 347
    → array[347] = "Apple" → match!
    
Cost:
  Build: O(n) - quét bảng nhỏ 1 lần
  Probe: O(1) per row - lookup hash table
  
Vì sao chọn bảng nhỏ để build?
  → Hash table phải FIT vào RAM
  → RAM có giới hạn!
```

### Giới hạn của Hash Tables

```
Giới hạn 1: PHẢI fit vào RAM
  ❌ Hash table 1 tỷ rows × 100 bytes = 100GB RAM
  → Không thể!
  
  Workaround: Partition data
    Chia nhỏ thành chunks → hash từng chunk
    
Giới hạn 2: Chi phí tạo hash table
  Phải scan toàn bộ table để build
  O(n) - tốn thời gian với table lớn

Giới hạn 3: RESIZE rất đắt
  array size = 10 → hash % 10
  Thêm 1 element → array size = 11 → hash % 11
  
  Tất cả keys thay đổi vị trí! Phải remap toàn bộ!
  
  key=10045738: hash % 10 = 4  ← index cũ
  key=10045738: hash % 11 = 7  ← index mới (khác!)
  
  → Vấn đề này dẫn đến Distributed Hashing...
```

---

## Phần 2: Consistent Hashing - Giải pháp cho Distributed Systems

### Vấn đề: Sharding với Naive Hashing

```
Setup: 4 database shards
  S0, S1, S2, S3

Routing: hash(key) % 4

  key=4:   hash → 4 % 4 = 0 → Server S0
  key=5:   hash → 5 % 4 = 1 → Server S1
  key=6:   hash → 6 % 4 = 2 → Server S2
  key=7:   hash → 7 % 4 = 3 → Server S3
  key=8:   hash → 8 % 4 = 0 → Server S0
```

### Vấn đề khi thêm Server

```
Thêm S4 → 5 servers → hash(key) % 5

  key=4:   hash → 4 % 5 = 4 → Server S4  ← ĐÃ THAY ĐỔI! (was S0)
  key=5:   hash → 5 % 5 = 0 → Server S0  ← ĐÃ THAY ĐỔI! (was S1)
  key=6:   hash → 6 % 5 = 1 → Server S1  ← ĐÃ THAY ĐỔI! (was S2)
  key=7:   hash → 7 % 5 = 2 → Server S2  ← ĐÃ THAY ĐỔI! (was S3)
  key=8:   hash → 8 % 5 = 3 → Server S3  ← ĐÃ THAY ĐỔI! (was S0)

Kết quả: TẤT CẢ keys đổi server!
  → Phải move data từ tất cả servers
  → Toàn bộ cluster bị ảnh hưởng
  → Cực kỳ tốn kém!
```

### Consistent Hashing - Ý tưởng cốt lõi

```
Thay vì map key → server index,
map key → VỊ TRÍ TRÊN VÒNG TRÒN (ring)

Ring = circle với giá trị 0 → 360 độ

Bước 1: Đặt servers lên ring
  hash(S0_ip) % 360 = 0   → S0 ở vị trí 0°
  hash(S1_ip) % 360 = 90  → S1 ở vị trí 90°
  hash(S2_ip) % 360 = 180 → S2 ở vị trí 180°
  hash(S3_ip) % 360 = 270 → S3 ở vị trí 270°

Ring:
          S1 (90°)
    ┌─────┴─────┐
    │           │
S0(0°)         S2(180°)
    │           │
    └─────┬─────┘
          S3(270°)
```

### Routing trong Consistent Hashing

```
Bước 2: Map keys lên ring

  key=1500: hash → 1500 % 360 = 60°
  → 60° nằm giữa S0(0°) và S1(90°)
  → Chọn server TIẾP THEO theo chiều kim đồng hồ = S1

  key=2000: hash → 2000 % 360 = 200°
  → 200° nằm giữa S2(180°) và S3(270°)
  → Chọn server tiếp theo = S3

  key=3000: hash → 3000 % 360 = 120°
  → 120° nằm giữa S1(90°) và S2(180°)
  → Chọn server tiếp theo = S2

  key=20000: hash → 20000 % 360 = 280°
  → 280° > 270° (S3), không còn server sau S3
  → Quay vòng → S0 (0°)

Ring với keys:
          S1 (90°)
     60°↗      ↘120°
    ┌─────┴─────┐
    │   1500    3000│
S0(0°)   280°↙  S2(180°)
   280°│         │200°
    └─────┬─────┘
          S3(270°)
         (2000)
```

### Thêm Server - Chỉ ảnh hưởng 1 neighbor

```
Thêm S4 tại vị trí 50°:

Ring mới:
          S1 (90°)
       50°→S4     
    ┌───┴──┴────┐
    │           │
S0(0°)         S2(180°)

key=1500 (60°) → Trước: S1(90°) | Sau: S1(90°)  ← không đổi
key cũ tại 60°: hash → 60° > 50° → vẫn đến S1

Chỉ những keys trong khoảng (0°, 50°) cần move từ S1 → S4:
  key=40° (ví dụ) → trước đến S1, nay đến S4
  
Thay đổi: CHỈ S1 bị ảnh hưởng (neighbor gần nhất)
  → Di chuyển một phần data từ S1 sang S4
  → Các servers khác KHÔNG bị ảnh hưởng!
```

### Xóa Server

```
Xóa S1 (90°):
  Tất cả keys của S1 (khoảng 0° - 90°) → chuyển sang S2 (180°)
  
  Chỉ S2 (neighbor tiếp theo) nhận data của S1
  → Các servers khác không bị ảnh hưởng
```

### Vấn đề của Consistent Hashing

```
Vấn đề 1: Phân phối không đều (Hot Spot)
  Nếu servers ngẫu nhiên nằm ở:
    S0: 0°, S1: 5°, S2: 10°, S3: 355°
  → S3 phải chứa 345° - 355° range = ÍT data
  → S0 phải chứa 355° - 5° range... nhưng S0 = 0° và S3 = 355°
  
  Giải pháp: Virtual Nodes
    Mỗi server có nhiều "virtual positions" trên ring
    S0 → vị trí 0°, 120°, 240°
    S1 → vị trí 40°, 160°, 280°
    → Phân phối đều hơn

Vấn đề 2: Di chuyển data vẫn tốn kém
  Thêm/xóa server → phải copy data qua network
  → I/O cao, latency cao trong thời gian migration

Vấn đề 3: Server crash (không có thời gian migrate)
  → Cần replication!
  Mỗi key được lưu ở N servers tiếp theo trên ring
  (Cassandra mặc định replication factor = 3)
```

### Cassandra và Consistent Hashing

```
Cassandra dùng Consistent Hashing:
  - Mỗi node có token range trên ring
  - Replication factor = 3 (3 copies)
  - Khi thêm node: chỉ adjacent nodes bị ảnh hưởng

Ví dụ cluster 4 nodes, RF=3:
  Key → Node1 (primary)
      → Node2 (replica 1) 
      → Node3 (replica 2)
  
  Nếu Node1 crash → Node2 hoặc Node3 serve request

KHÔNG dùng Consistent Hashing khi:
  ❌ Single database (dùng partitioning thay thế)
  ❌ Data nhỏ vừa 1 server
  ❌ Chưa cần phân tán
```

### Hash Tables trong Database Internals

```
Databases dùng Hash Tables cho:
  1. Hash Joins (đã nói)
  2. Hash Indexes (lookup chính xác - không range query)
  3. Buffer Pool (tìm page trong memory cache)
  4. Lock Table (track rows đang bị lock)

Postgres buffer pool:
  hash(block_number) → slot trong shared_buffers
  Cho phép O(1) lookup "page này đã cached chưa?"
```

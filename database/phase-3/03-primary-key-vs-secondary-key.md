# Bài 3: Primary Key vs Secondary Key - Điều bạn có thể chưa biết

## Primary Key không chỉ là "unique"

Nhiều developers nghĩ Primary Key chỉ là một constraint để đảm bảo unique. Thực tế, Primary Key ảnh hưởng sâu đến cách **toàn bộ bảng được tổ chức trên disk**.

---

## Clustered Index và Index Organized Table (IOT)

Khi bạn tạo Primary Key, hầu hết databases sẽ tổ chức toàn bộ bảng **theo thứ tự của Primary Key**. Đây gọi là **Clustered Index** (hoặc **Index Organized Table - IOT** theo thuật ngữ của Oracle).

### Cách hoạt động

**Bảng không có Primary Key (Heap Organized Table):**
```
Insert order: 7, 1, 2 (insert theo thứ tự này)

Disk layout (lộn xộn theo thứ tự insert):
Page 0: [row_id=1, id=7, name="Alice"]
Page 0: [row_id=2, id=1, name="Bob"]
Page 1: [row_id=3, id=2, name="Carol"]

→ Không có thứ tự, tìm kiếm phải quét tuần tự
```

**Bảng có Primary Key (Clustered Index / IOT):**
```
Insert order: 7, 1, 2 (insert theo thứ tự này)

Disk layout (được sắp xếp theo PK):
Page 0: [id=1, name="Bob"]
Page 0: [id=2, name="Carol"]
Page 1: [id=7, name="Alice"]

→ Luôn được sắp xếp theo PK, tìm kiếm theo range rất nhanh
```

### Chi phí của Clustering

Database phải duy trì thứ tự này khi INSERT:

```
Insert id=8 → Thêm vào page 1 sau id=7 (OK)
Insert id=3 → Cần chen vào giữa id=2 và id=7

Page 0: [id=1] [id=2] [id=3?] → Không đủ chỗ!
→ Page split: Chia page 0 thành page 0a và page 0b
→ Chi phí I/O cao hơn
```

**Ưu điểm bù lại:** Range queries cực nhanh vì dữ liệu liền kề nhau

---

## Vấn đề với UUID làm Primary Key

**Cảnh báo quan trọng cho MySQL và databases dùng Clustered Index:**

```
UUID v4 = Hoàn toàn random
Ví dụ: 
  "a1b2c3d4-..." 
  "9f8e7d6c-..." 
  "12345678-..."
  
→ Mỗi UUID insert vào một vị trí RANDOM trong clustered index
→ Database liên tục phải page split
→ Index bị phân mảnh (fragmented)
→ Hiệu năng write giảm mạnh theo thời gian
```

**Giải pháp:**
```sql
-- Tùy chọn 1: Dùng AUTO_INCREMENT hoặc SERIAL (sequential)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,  -- Sequential, tốt cho clustered index
    ...
);

-- Tùy chọn 2: Dùng ULID hoặc UUID v7 (time-ordered UUID)
-- ULID: 01H5EXAMPLE... (có time prefix, roughly sequential)

-- Tùy chọn 3: Dùng random UUID nhưng thêm BIGINT sequential PK
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE,
    ...
);
```

---

## So sánh giữa các Database

### MySQL (InnoDB) - Primary Key bắt buộc

```
MySQL luôn có clustered index.
Nếu bạn không tạo PK → MySQL tự tạo hidden PK (6-byte ROWID)

Table được tổ chức THEO thứ tự PK:
  → Primary key lookup: NHANH (vì đây chính là heap)
  → Secondary index lookup: PHẢI đọc index + truy vấn thêm qua PK vào heap
```

```
Secondary index trong MySQL:
  ┌─────────────────────────────────────────┐
  │ Index trên email:                       │
  │ "alice@email.com" → PK=1                │  ← Lưu giá trị PK, không phải row address
  │ "bob@email.com"   → PK=2                │
  └─────────────────────────────────────────┘
  
  Lookup: email → secondary index → PK value → clustered index
  = 2 index lookups
```

### PostgreSQL - Không có clustered index mặc định

```
Postgres: Bảng là HEAP (không có order)
         MỌI index đều là secondary index
         Secondary index trỏ đến row_id (ctid)

  ┌─────────────────────────────────────────┐
  │ Index trên email:                       │
  │ "alice@email.com" → ctid=(0,1)          │  ← Trỏ thẳng đến heap location
  │ "bob@email.com"   → ctid=(0,2)          │
  └─────────────────────────────────────────┘
  
  Lookup: email → index → ctid → heap location
  = 1 index lookup + 1 heap lookup
```

**Vấn đề với PostgreSQL khi UPDATE:**
```
Khi UPDATE 1 row trong Postgres:
→ Row cũ được đánh dấu "dead"
→ Row mới được tạo với ctid mới
→ TẤT CẢ secondary indexes phải cập nhật pointer sang ctid mới

= Chi phí UPDATE cao hơn MySQL nếu bảng có nhiều indexes
```

### Oracle - Flexible

```
Oracle cho phép chọn:
  1. Heap Organized Table (HOT) - mặc định, không có order
  2. Index Organized Table (IOT) - sắp xếp theo PK (như MySQL)

Lựa chọn tùy theo use case:
  HOT: Nhiều updates, writes phức tạp
  IOT: Nhiều range queries, reads quan trọng hơn writes
```

---

## Clustered Index vs Secondary Index: Khi nào dùng gì?

### Clustered Index (Primary Key lookups):

```sql
-- Rất nhanh: Range query trên PK
SELECT * FROM orders WHERE id BETWEEN 1000 AND 2000;
-- Vì orders với id 1000-2000 nằm liền kề trên disk

-- Rất nhanh: Exact lookup trên PK
SELECT * FROM orders WHERE id = 5000;
-- Direct lookup vào clustered index
```

### Secondary Index:

```sql
-- Tạo secondary index cho lookup thường xuyên
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- Khi query:
SELECT * FROM orders WHERE customer_id = 42;
-- B-Tree của secondary index → tìm thấy các PK → 
-- → Lookup từng PK trong clustered index (cho MySQL)
-- HOẶC
-- → Lookup từng ctid trong heap (cho PostgreSQL)
```

---

## Covering Index - Tối ưu hóa nâng cao

**Covering Index** là khi index chứa đủ thông tin để trả lời query mà không cần đọc heap:

```sql
-- Query này cần customer_id và order_date
SELECT customer_id, order_date FROM orders WHERE customer_id = 42;

-- Index thường:
CREATE INDEX idx_orders_customer ON orders(customer_id);
-- → Tìm customer_id trong index → Đọc heap để lấy order_date

-- Covering index:
CREATE INDEX idx_orders_customer_date ON orders(customer_id, order_date);
-- → Tìm customer_id trong index → order_date cũng có trong index
-- → KHÔNG cần đọc heap! Tiết kiệm 1 I/O per row
```

Kỹ thuật này sẽ được thảo luận chi tiết hơn trong phần Database Indexing.

---

## Tổng kết

```
Primary Key:
  = Constraint (unique, not null)
  + Clustered Index (trong hầu hết databases)
  → Table được tổ chức theo thứ tự PK trên disk

Secondary Index:
  = Cấu trúc riêng biệt
  → Trỏ về PK (MySQL) hoặc ctid (PostgreSQL)
  → Cần 2 lookups để lấy full row data

Lời khuyên:
  1. Dùng sequential PK (SERIAL/AUTO_INCREMENT) với MySQL
  2. Tránh random UUID làm PK trong clustered index
  3. Tạo covering index cho hot queries
  4. Hiểu rằng mỗi index thêm chi phí cho writes
```

---

**Tiếp theo:** Phase 4 - Database Indexing: Tất cả về indexes →

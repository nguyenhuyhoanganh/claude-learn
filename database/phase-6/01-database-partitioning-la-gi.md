# Bài 1: Database Partitioning là gì?

## Vấn đề: Bảng quá lớn

Khi bảng có hàng trăm triệu hoặc tỷ rows:
- Index vẫn cần nhiều I/O operations
- Query chậm dù đã có index tốt
- Memory không đủ để cache index
- Maintenance (VACUUM, backup) mất rất nhiều thời gian

**Nguyên tắc vàng:**
> "Cách nhanh nhất để query bảng 1 tỷ rows là **tránh không query bảng 1 tỷ rows**"

---

## Partitioning là gì?

**Database Partitioning** là kỹ thuật chia bảng lớn thành nhiều bảng nhỏ hơn (gọi là partitions), trong khi **client chỉ thấy một bảng duy nhất**.

```
Bảng CUSTOMERS (1 triệu rows):
┌────────────────────────────────┐
│ id │ name  │ grade │ ...       │
│ 1  │ John  │  85   │ ...       │
│ 2  │ Jane  │  72   │ ...       │
│ ...                            │
│ 1M │ Kim   │  91   │ ...       │
└────────────────────────────────┘

↓ Partitioning theo ID ↓

grades_0_200K:              grades_200K_400K:
[id 1 → 200,000]            [id 200,001 → 400,000]

grades_400K_600K:           grades_600K_800K:
[id 400,001 → 600,000]      [id 600,001 → 800,000]

grades_800K_1M:
[id 800,001 → 1,000,000]
```

**Client query vẫn như cũ:**
```sql
-- Client không biết có partitions
SELECT name FROM customers WHERE id = 700001;

-- Database tự động xác định:
-- id=700001 → grades_600K_800K partition
-- Chỉ query 200,000 rows thay vì 1,000,000!
```

---

## Horizontal vs Vertical Partitioning

### Horizontal Partitioning (Phổ biến)

Chia bảng theo **rows** — mỗi partition chứa một subset của rows:

```
Original table (5 rows):
[row1] [row2] [row3] [row4] [row5]

Horizontal partitions:
Partition A: [row1] [row2]    ← Chia theo id 1-2
Partition B: [row3] [row4]    ← Chia theo id 3-4
Partition C: [row5]           ← Chia theo id 5
```

**Khi nói "partitioning" trong database, mặc định là horizontal partitioning.**

### Vertical Partitioning (Ít phổ biến)

Chia bảng theo **columns** — tách các columns ít dùng ra bảng riêng:

```
Original table:
[id, name, email, photo_blob, bio_text, created_at]
   ↓ Vertical partitioning ↓
Hot table (frequently accessed):          Cold table (rarely accessed):
[id, name, email, created_at]             [id, photo_blob, bio_text]
→ Nhỏ gọn, fit memory                    → Lưu trên storage chậm/rẻ
→ Queries nhanh hơn
```

**Use case:** Tách BLOB columns (ảnh, văn bản lớn) ra bảng riêng để giảm kích thước hot table.

---

## Ba loại Partitioning

### 1. Range Partitioning

Chia theo **khoảng giá trị** — phổ biến nhất:

```sql
-- Partitioning theo grade (0-100)
CREATE TABLE grades_parts (
    id    SERIAL NOT NULL,
    g     INTEGER NOT NULL
) PARTITION BY RANGE(g);

-- Tạo từng partition
CREATE TABLE grades_00_35 PARTITION OF grades_parts
    FOR VALUES FROM (0) TO (35);

CREATE TABLE grades_35_60 PARTITION OF grades_parts
    FOR VALUES FROM (35) TO (60);

CREATE TABLE grades_60_80 PARTITION OF grades_parts
    FOR VALUES FROM (60) TO (80);

CREATE TABLE grades_80_100 PARTITION OF grades_parts
    FOR VALUES FROM (80) TO (100);
```

**Ví dụ thực tế khác:**
```sql
-- Partitioning theo thời gian (rất phổ biến cho logs, IoT data)
CREATE TABLE sensor_data PARTITION BY RANGE(created_at);

CREATE TABLE sensor_data_2022 PARTITION OF sensor_data
    FOR VALUES FROM ('2022-01-01') TO ('2023-01-01');

CREATE TABLE sensor_data_2023 PARTITION OF sensor_data
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');

CREATE TABLE sensor_data_2024 PARTITION OF sensor_data
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
```

### 2. List Partitioning

Chia theo **giá trị rời rạc** (discrete values):

```sql
-- Partitioning theo state
CREATE TABLE customers PARTITION BY LIST(state);

CREATE TABLE customers_california PARTITION OF customers
    FOR VALUES IN ('CA');

CREATE TABLE customers_new_york PARTITION OF customers
    FOR VALUES IN ('NY');

CREATE TABLE customers_other PARTITION OF customers
    FOR VALUES IN ('TX', 'FL', 'WA', 'IL');
```

**Use case:** Khi muốn phân chia theo region, country, category...

### 3. Hash Partitioning

Chia theo **kết quả hàm hash** — phân phối đều nhất:

```sql
-- Partitioning bằng hash (4 partitions)
CREATE TABLE orders PARTITION BY HASH(customer_id);

CREATE TABLE orders_p0 PARTITION OF orders
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);

CREATE TABLE orders_p1 PARTITION OF orders
    FOR VALUES WITH (MODULUS 4, REMAINDER 1);

CREATE TABLE orders_p2 PARTITION OF orders
    FOR VALUES WITH (MODULUS 4, REMAINDER 2);

CREATE TABLE orders_p3 PARTITION OF orders
    FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

**Use case:** Khi không có column tốt để range/list partition, nhưng muốn phân phối đều.

---

## Partitioning vs Sharding

**Sự khác biệt cốt lõi:**

```
Partitioning:                    Sharding:
┌─────────────────────┐          ┌───────────┐  ┌───────────┐
│  Database Server 1   │          │  Server A │  │  Server B │
│                      │          │           │  │           │
│  Partition A         │          │  Shard A  │  │  Shard B  │
│  Partition B         │          │  (id<500K)│  │ (id>500K) │
│  Partition C         │          │           │  │           │
│  Partition D         │          └───────────┘  └───────────┘
└─────────────────────┘
                                  Client phải biết shard nào!
Client không biết gì cả!
```

| | Partitioning | Sharding |
|---|---|---|
| **Servers** | 1 database server | Nhiều database servers |
| **Client awareness** | Client không biết gì | Client phải biết shard nào |
| **Complexity** | Thấp (database quản lý) | Cao (application logic) |
| **Scale** | Vertical (1 server) | Horizontal (nhiều servers) |
| **Use when** | Bảng lớn, 1 server đủ | Cần phân tán nhiều servers |

**Khuyến nghị:** Thử partitioning trước khi nghĩ đến sharding. Sharding phức tạp hơn nhiều.

---

**Tiếp theo:** 02-partitioning-thuc-hanh-postgres.md →

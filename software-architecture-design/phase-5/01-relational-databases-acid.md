# Bài 1: Relational Databases & ACID Transactions

## Relational Database là gì?

Data được lưu trong **tables**:
- Mỗi **row** = một record
- Mỗi **column** = một attribute (có name, type, constraints)
- Mỗi record có **primary key** (unique identifier)
- **Schema** định nghĩa trước structure của mỗi table

**Query language**: SQL (Structured Query Language) — industry standard

## Lợi ích của Relational Databases

### 1. Flexible & Powerful Queries (SQL)

```sql
-- Tìm users theo city
SELECT * FROM users WHERE city = 'Hanoi';

-- Join: kết hợp nhiều tables
SELECT o.order_id, u.name, p.product_name
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN products p ON o.product_id = p.id
WHERE o.created_at > '2024-01-01';

-- Aggregation
SELECT category, AVG(price) as avg_price, COUNT(*) as count
FROM products
GROUP BY category
ORDER BY avg_price DESC;
```

### 2. Tiết kiệm storage (No Duplication)

```
❌ Không có relational DB:
orders: [order_id, product_name, product_company, product_category, ...]
→ Mỗi order lặp lại toàn bộ product info → lãng phí!

✅ Có relational DB:
orders: [order_id, product_id, ...]    ← chỉ lưu foreign key
products: [product_id, name, company, category, ...]

→ JOIN để combine khi cần
```

### 3. Dễ hiểu

Table structure natural cho human beings — không cần background CS phức tạp.

### 4. ACID Transactions

## ACID Transactions

Trong database, **transaction** = một chuỗi operations được xem như là một operation duy nhất.

**Ví dụ:** Chuyển tiền từ tài khoản A sang B:
```
BEGIN TRANSACTION
1. Trừ 100 từ account A
2. Cộng 100 vào account B
COMMIT
```

ACID đảm bảo cả 4 properties:

### A — Atomicity (Nguyên tử)

> Tất cả operations trong transaction EITHER xảy ra TẤT CẢ, HOẶC không xảy ra cái nào.

```
Chuyển tiền:
- Trừ A: ✓
- Cộng B: ✗ (server crash!)

→ Atomicity: ROLLBACK → trừ A cũng bị undo
→ Không bao giờ mất 100 "vào không khí"
```

### C — Consistency (Nhất quán)

> Transaction không vi phạm bất kỳ constraint nào. Data luôn ở trạng thái hợp lệ.

```sql
-- Constraint: số dư không được âm
CHECK (balance >= 0)

Transaction: Trừ 1000 từ account có 500
→ Violation → Transaction FAIL → Rollback
```

### I — Isolation (Cô lập)

> Concurrent transactions không thấy intermediate state của nhau.

```
Transaction T1: Transfer $100 from A to B
Transaction T2: Read balance of A and B

T2 thấy:
├── TRƯỚC khi T1: A=1000, B=500
├── HOẶC SAU khi T1: A=900, B=600
└── KHÔNG BAO GIỜ: A=900, B=500 (intermediate state!)
```

### D — Durability (Bền vững)

> Transaction đã commit sẽ PERSIST mãi mãi, kể cả khi system crash.

```
User mua hàng → Transaction commit
→ Server crash ngay sau đó
→ Khi restart: purchase vẫn còn trong DB
```

## Nhược điểm của Relational Databases

### 1. Rigid Schema

- Schema phải define trước
- ALTER TABLE → downtime hoặc complexity
- Không thể dễ dàng add attributes cho từng record riêng

### 2. Complex & Costly to Maintain

- Hỗ trợ SQL + ACID transactions → phức tạp trong implementation
- Harder to scale horizontally

### 3. Slower Reads (so với NoSQL)

- ACID guarantees thêm overhead
- Complex joins có thể chậm với large datasets

## Khi nào dùng Relational Database?

✅ **Phù hợp:**
- Data có inherent relationships (orders↔users↔products)
- Cần ACID transactions (financial, medical, inventory)
- Cần complex querying và analytics
- Data có structure rõ ràng và ít thay đổi schema

❌ **Không phù hợp:**
- Read performance là ưu tiên tối cao
- Data không có inherent relationships
- Schema thay đổi thường xuyên
- Need extreme horizontal scale

## Popular Relational Databases

| Database | Use Case |
|----------|----------|
| **PostgreSQL** | Most feature-rich, open source |
| **MySQL** | Web applications, widely used |
| **AWS RDS** | Managed cloud service |
| **Oracle** | Enterprise, financial |
| **SQLite** | Embedded, local storage |

## Tóm tắt

```
Relational DB (SQL):
├── Data in tables với predefined schema
├── SQL: powerful, flexible queries
├── ACID: Atomicity, Consistency, Isolation, Durability
└── Best for: structured data, relationships, transactions

Trade-offs:
├── ✅ Complex queries, no duplication, ACID
└── ❌ Rigid schema, slower reads, harder to scale
```

---
**Tiếp theo:** Bài 2 - Non-Relational Databases →

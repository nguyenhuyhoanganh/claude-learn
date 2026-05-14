# Bài 3: Isolation và Read Phenomena

## Tại sao cần Isolation?

Trong thực tế, database có nhiều connections đồng thời, mỗi connection chạy nhiều transactions. Khi nhiều transactions cùng đọc/ghi dữ liệu, các vấn đề không mong muốn có thể xảy ra.

**Câu hỏi cốt lõi:**
> "Một transaction đang chạy có thể thấy những thay đổi đang được thực hiện bởi các transaction khác không?"

Câu trả lời không đơn giản là "có" hay "không" — nó phụ thuộc vào **Isolation Level** bạn chọn.

---

## Bốn Read Phenomena (Hiện tượng đọc không mong muốn)

### 1. Dirty Read (Đọc bẩn)

**Định nghĩa:** Transaction A đọc dữ liệu mà Transaction B đã ghi nhưng **chưa commit**.

```
Bảng SALES:
┌────────────┬──────────┬───────┐
│ product_id │ quantity │ price │
├────────────┼──────────┼───────┤
│     1      │    10    │   5   │
│     2      │    20    │   4   │
└────────────┴──────────┴───────┘

Timeline:

Transaction A (Report):          Transaction B (New Sale):
BEGIN
SELECT SUM(qty*price) 
  → $50 + $80 = $130
                                 BEGIN
                                 UPDATE: product_1.qty = 15
                                 (chưa commit!)
SELECT SUM(qty*price)            
  → 15×5 + $80 = $155           ROLLBACK (sale bị hủy)
                                 (product_1.qty trở lại 10)
COMMIT
```

**Vấn đề:** Transaction A đọc được giá trị $155 không chính xác, thậm chí dữ liệu đó sau này bị rollback.

**Hậu quả:** Report sai, quyết định sai dựa trên dữ liệu không tồn tại.

---

### 2. Non-Repeatable Read (Đọc không lặp lại được)

**Định nghĩa:** Transaction A đọc cùng một row hai lần và nhận được **giá trị khác nhau** vì Transaction B đã commit một thay đổi ở giữa.

```
Timeline:

Transaction A (Report):          Transaction B:
BEGIN
SELECT qty FROM sales WHERE pid=1
  → qty = 10
                                 BEGIN
                                 UPDATE sales SET qty=15 WHERE pid=1
                                 COMMIT ← đã commit!
SELECT SUM(qty*price) FROM sales
  → 15×5 + 80 = $155 (SAI!)
  (nên là $130 theo snapshot lúc đầu)
```

**Khác với Dirty Read:** Transaction B đã commit, nên đây không phải "bẩn" — nhưng kết quả vẫn không nhất quán trong cùng một transaction.

---

### 3. Phantom Read (Đọc ma)

**Định nghĩa:** Transaction A chạy một range query hai lần, lần hai có thêm các row mới mà Transaction B đã INSERT (không phải UPDATE).

```
Timeline:

Transaction A (Report):          Transaction B:
BEGIN
SELECT pid, SUM(price) FROM sales
GROUP BY pid
  → product_1: $40, product_2: ???
                                 INSERT INTO sales (pid, price, date)
                                 VALUES (1, 15, '2021-02-07')
                                 COMMIT

SELECT SUM(qty*price) FROM sales
  → Giờ có thêm row mới!
  → Kết quả tăng lên $15
```

**Sự khác biệt với Non-Repeatable Read:**
- Non-Repeatable Read: Row đã đọc **bị thay đổi**
- Phantom Read: Row **mới xuất hiện** trong range query

**Tại sao khó fix hơn:** Bạn không thể lock một row chưa tồn tại để ngăn nó xuất hiện.

---

### 4. Lost Update (Mất cập nhật)

**Định nghĩa:** Hai transactions cùng đọc một giá trị, cùng update, nhưng một bản update bị **ghi đè** bởi bản kia.

```
Timeline:

Transaction A:                   Transaction B:
BEGIN                            BEGIN
SELECT qty FROM sales 
  → qty = 10
                                 SELECT qty FROM sales
                                   → qty = 10
UPDATE sales SET qty = 10+10=20
                                 UPDATE sales SET qty = 10+5=15
COMMIT
                                 COMMIT
                                 
Kết quả cuối: qty = 15
Nhưng đúng ra phải là: 10+10+5 = 25!
```

**Vấn đề:** Transaction A đã tăng thêm 10, nhưng Transaction B không biết điều đó, nên ghi đè bằng 15.

---

## Isolation Levels (Mức độ cô lập)

Để giải quyết các Read Phenomena trên, SQL chuẩn định nghĩa 4 isolation levels:

```
Mức độ cô lập (từ thấp đến cao):
READ UNCOMMITTED → READ COMMITTED → REPEATABLE READ → SERIALIZABLE
     (nhanh nhất)                                    (chậm nhất)
```

### So sánh các Isolation Level

| Isolation Level | Dirty Read | Non-Repeatable Read | Phantom Read |
|---|---|---|---|
| READ UNCOMMITTED | Có thể xảy ra | Có thể | Có thể |
| READ COMMITTED | **Ngăn được** | Có thể | Có thể |
| REPEATABLE READ | Ngăn được | **Ngăn được** | Có thể* |
| SERIALIZABLE | Ngăn được | Ngăn được | **Ngăn được** |

*Ngoại lệ: PostgreSQL với REPEATABLE READ cũng ngăn Phantom Read (dùng MVCC)

---

### READ UNCOMMITTED

```sql
BEGIN TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;
-- Có thể đọc dirty data của transaction khác
-- Không database production nào recommend dùng level này
```

Hầu như không database nào implement đầy đủ level này. SQL Server có hỗ trợ nhưng cực kỳ hiếm dùng.

---

### READ COMMITTED (Mặc định của nhiều database)

```sql
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;
-- Mỗi query chỉ thấy dữ liệu đã được commit
-- Vẫn có thể bị Non-Repeatable Read và Phantom Read
```

**Khi nào dùng:** Phù hợp với hầu hết ứng dụng OLTP thông thường. Cân bằng tốt giữa nhất quán và hiệu năng.

---

### REPEATABLE READ

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- Row đã đọc sẽ không thay đổi trong suốt transaction
-- Ngăn Non-Repeatable Read
```

**Cách implement:**
- **MySQL/Oracle:** Dùng shared locks trên các row đã đọc. Giữ lock đến cuối transaction.
- **PostgreSQL:** Dùng MVCC (Multi-Version Concurrency Control) — tạo snapshot tại thời điểm bắt đầu transaction.

```
PostgreSQL MVCC:
┌─────────────────────────────────────────┐
│ Khi transaction bắt đầu, Postgres tạo  │
│ một "snapshot" - phiên bản của database │
│ tại thời điểm đó.                       │
│                                         │
│ Mọi query trong transaction đều đọc     │
│ từ snapshot này, bất kể transaction     │
│ khác có commit gì mới.                  │
└─────────────────────────────────────────┘
```

---

### SERIALIZABLE

```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- Transactions chạy như thể tuần tự (serial)
-- Giải quyết tất cả read phenomena
```

**Cách implement:**
- **Optimistic (phổ biến hơn):** Không lock trước. Khi commit, kiểm tra xem có conflict không. Nếu có → fail transaction, client phải retry.
- **Pessimistic:** Lock rows/ranges trước khi đọc/ghi.

```sql
-- Khi dùng SERIALIZABLE và có conflict:
ERROR: could not serialize access due to read/write dependencies
DETAIL: Process 12345 detected anti-dependency.
HINT: The transaction might succeed if retried.
-- → Application phải retry transaction
```

---

## PostgreSQL đặc biệt: MVCC

PostgreSQL dùng **Multi-Version Concurrency Control (MVCC)** cho REPEATABLE READ và SERIALIZABLE:

```
Cách hoạt động:
1. Mỗi row có version (transaction ID)
2. UPDATE không sửa row cũ mà tạo row MỚI
3. DELETE đánh dấu row là "deleted" (không xóa ngay)
4. Transaction chỉ thấy rows có version ≤ transaction ID của nó
5. Background process (autovacuum) dọn dẹp các phiên bản cũ

Ưu điểm:
- Readers không block writers
- Writers không block readers
- Hiệu năng tốt cho read-heavy workloads
```

**So sánh PostgreSQL vs MySQL (Repeatable Read):**
- PostgreSQL: REPEATABLE READ = SNAPSHOT → **Không có Phantom Read**
- MySQL: REPEATABLE READ → **Vẫn có Phantom Read** (cần SERIALIZABLE để fix)

---

## Chọn Isolation Level phù hợp

```
Ứng dụng của bạn:

├── Report/Analytics cần nhất quán?
│   └── REPEATABLE READ hoặc SERIALIZABLE
│
├── OLTP thông thường (đặt hàng, thanh toán)?
│   └── READ COMMITTED (mặc định, phù hợp)
│
├── Concurrent update trên cùng row?
│   └── SERIALIZABLE (+ retry logic)
│
└── Chấp nhận đọc dirty cho speed?
    └── READ UNCOMMITTED (cực kỳ hiếm dùng)
```

---

**Tiếp theo:** 04-consistency-va-eventual-consistency.md →

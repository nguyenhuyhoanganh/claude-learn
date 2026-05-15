# Bài 1: ACID và Transaction là gì?

## Tại sao cần hiểu ACID?

ACID là nền tảng của mọi database system. Dù bạn dùng PostgreSQL, MySQL, MongoDB hay bất kỳ database nào, bạn đều cần hiểu bốn thuộc tính này để:
- Biết khi nào dữ liệu của bạn an toàn
- Thiết kế transaction đúng cách
- Chọn isolation level phù hợp
- Debug các lỗi dữ liệu khó hiểu

**ACID = Atomicity + Consistency + Isolation + Durability**

## Transaction là gì?

Một **transaction** là tập hợp các SQL query được xử lý như **một đơn vị công việc duy nhất**.

### Tại sao cần transaction?

Ví dụ chuyển tiền từ tài khoản A sang tài khoản B:

```sql
-- Đây là 3 query riêng biệt, nhưng phải được thực thi như 1 unit
BEGIN;

-- Query 1: Kiểm tra số dư
SELECT balance FROM accounts WHERE id = 1;

-- Query 2: Trừ tiền tài khoản nguồn
UPDATE accounts SET balance = balance - 100 WHERE id = 1;

-- Query 3: Cộng tiền tài khoản đích
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

COMMIT;
```

Nếu không có transaction và hệ thống crash sau Query 2 nhưng trước Query 3, bạn sẽ mất $100.

### Vòng đời của một transaction

```
BEGIN (bắt đầu)
    │
    ├── Query 1
    ├── Query 2
    ├── ...
    ├── Query N
    │
    ├── COMMIT (lưu tất cả thay đổi vào disk)
    │       hoặc
    └── ROLLBACK (hủy tất cả thay đổi)
```

### Điều gì xảy ra khi database crash?

Khi database restart, nó sẽ phát hiện có transaction chưa commit và tự động **rollback**.

Lưu ý: Với transaction lớn (hàng chục nghìn query), quá trình rollback có thể mất hàng giờ. Đây là lý do **transaction dài là bad practice**.

### Transaction read-only

Transaction không chỉ dùng để thay đổi dữ liệu. Transaction read-only cũng hữu ích khi:
- Bạn muốn **snapshot** dữ liệu tại một thời điểm
- Tạo report và muốn kết quả nhất quán trong suốt quá trình

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;
-- Tất cả các query trong transaction này sẽ thấy
-- cùng một "snapshot" của database

SELECT SUM(price) FROM sales;     -- $130
-- ... nhiều query khác ...
SELECT COUNT(*) FROM products;    -- nhất quán với query trên

COMMIT;
```

## Implicit vs Explicit Transactions

Mọi SQL query đều chạy trong một transaction, dù bạn có khai báo hay không:

```sql
-- Explicit transaction
BEGIN;
UPDATE accounts SET balance = 100 WHERE id = 1;
COMMIT;

-- Implicit transaction (database tự tạo và commit ngay)
UPDATE accounts SET balance = 100 WHERE id = 1;
-- Tương đương với: BEGIN; UPDATE...; COMMIT;
```

## Trade-off quan trọng: Write to disk vs Write to memory

Đây là câu hỏi thiết kế quan trọng của mọi database engine:

| Chiến lược | Ưu điểm | Nhược điểm |
|---|---|---|
| **Write to disk ngay** (PostgreSQL) | Commit rất nhanh | Rollback chậm hơn |
| **Write to memory, commit to disk** | Rollback rất nhanh | Commit chậm hơn |

PostgreSQL chọn chiến lược đầu: mỗi query trong transaction đã được ghi xuống disk, nên commit chỉ cần đánh dấu "đã commit" - cực kỳ nhanh.

---

**Tiếp theo:** 02-atomicity-va-durability.md →

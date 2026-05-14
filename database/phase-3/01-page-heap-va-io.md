# Bài 1: Page, Heap và I/O - Cách Database lưu trữ dữ liệu

## Tại sao cần hiểu điều này?

Khi bạn viết một câu SQL như `SELECT * FROM employees WHERE id = 1000`, database không chỉ đơn giản "tìm row đó". Nó phải đọc dữ liệu từ disk theo một cơ chế cụ thể. Hiểu cơ chế này sẽ giải thích tại sao:
- Query này chậm, query kia nhanh
- Index có giúp ích không và tại sao
- SELECT * tốn kém hơn SELECT id như thế nào

---

## Các khái niệm cốt lõi

### 1. Row ID (Tuple ID)

Mỗi row trong database có một **Row ID** (hay Tuple ID trong PostgreSQL) — một định danh nội bộ do hệ thống quản lý, **khác với** Primary Key mà bạn tạo.

```
Bảng EMPLOYEES:
┌────────┬──────┬───────────┬────────────┬────────┐
│ row_id │  id  │   name    │    dob     │ salary │
├────────┼──────┼───────────┼────────────┼────────┤
│   1    │  10  │ John      │ 1990-01-01 │ 50000  │
│   2    │  20  │ Jane      │ 1985-05-15 │ 70000  │
│   3    │  30  │ Ahmed     │ 1992-03-20 │ 60000  │
└────────┴──────┴───────────┴────────────┴────────┘
```

- **PostgreSQL:** Row ID là `ctid` — metadata riêng, tất cả indexes đều trỏ đến row_id
- **MySQL (InnoDB):** Primary Key chính là Row ID — table được tổ chức quanh PK

---

### 2. Page (Trang dữ liệu)

Database không đọc từng row riêng lẻ từ disk. Thay vào đó, dữ liệu được tổ chức thành **pages** — các đơn vị dữ liệu có kích thước cố định.

```
Kích thước page mặc định:
  PostgreSQL: 8 KB
  MySQL:      16 KB
  SQL Server: 8 KB

Mỗi page có thể chứa nhiều rows:
  Page size = 8 KB
  Row size = ~200 bytes
  → 1 page ≈ 40 rows
```

**Ví dụ tổ chức pages:**

```
Heap (tập hợp tất cả pages):
┌─────────────────────────────────────────┐
│ Page 0                                  │
│  [row_id=1, emp_id=10, John, ...]       │
│  [row_id=2, emp_id=20, Jane, ...]       │
│  [row_id=3, emp_id=30, Ahmed, ...]      │
├─────────────────────────────────────────┤
│ Page 1                                  │
│  [row_id=4, emp_id=40, Bob, ...]        │
│  [row_id=5, emp_id=50, Alice, ...]      │
│  [row_id=6, emp_id=60, Carol, ...]      │
├─────────────────────────────────────────┤
│ Page 2, 3, ... N                        │
│  ...                                    │
└─────────────────────────────────────────┘
```

---

### 3. I/O (Input/Output)

**I/O** là một lần đọc/ghi từ disk. Đây là **đơn vị tính chi phí** quan trọng nhất trong database.

**Quy tắc vàng:**
> "Số I/O càng ít, query càng nhanh. Đây là 'tiền tệ' của database."

**Điều quan trọng cần biết về I/O:**

```
1 I/O đọc: 1 page (hoặc nhiều page liền kề)
           KHÔNG phải 1 row
           KHÔNG phải 1 byte cụ thể

→ Khi đọc 1 page, bạn nhận được TẤT CẢ rows trong page đó
  dù bạn chỉ cần 1 row
```

**Ví dụ thực tế:**
```sql
-- Bạn cần 1 row, nhưng database đọc cả 1 page (40 rows)
SELECT * FROM employees WHERE id = 42;

-- Database đọc page chứa row có id=42
-- Bạn dùng 1 row, "bỏ phí" 39 rows còn lại
-- → Không thể tránh khỏi, đây là cách disk hoạt động
```

---

### 4. Heap (Tập hợp pages)

**Heap** là toàn bộ dữ liệu của một table — tập hợp tất cả pages.

```
Đặc điểm của Heap:
  - Chứa TẤT CẢ thông tin của table
  - Không có thứ tự (rows lộn xộn theo thứ tự insert)
  - Đọc toàn bộ heap = Full Table Scan = rất tốn kém
  - Mỗi lần đọc phải kéo TOÀN BỘ dữ liệu của row
```

**Vấn đề với Heap Scan:**

```sql
-- Query này cần duyệt TOÀN BỘ heap
SELECT * FROM employees WHERE salary > 100000;

-- Database phải:
-- 1. Đọc page 0 → kiểm tra từng row → lấy row thỏa điều kiện
-- 2. Đọc page 1 → kiểm tra tiếp...
-- 3. Đọc page 2...
-- ...
-- N. Đọc page cuối

-- Nếu bảng có 1 triệu row với page size 8KB, row size 200B:
-- 1,000,000 / 40 = 25,000 pages phải đọc!
```

---

### 5. Index - Giải pháp cho Heap Scan chậm

**Index** là một cấu trúc dữ liệu riêng biệt, chứa:
- Giá trị cột được index
- Pointer đến vị trí row tương ứng trong heap

```
Index trên cột employee_id:

Index (B-Tree):                    Heap:
┌───────────┬──────────────┐       ┌─────────────────┐
│ emp_id=10 │ → row_id=1,  │──────►│ Page 0, row 1   │
│           │   page=0     │       │ (full row data) │
├───────────┼──────────────┤       └─────────────────┘
│ emp_id=20 │ → row_id=2,  │──────►Page 0, row 2
│           │   page=0     │       
├───────────┼──────────────┤       
│ emp_id=40 │ → row_id=4,  │──────►Page 1, row 4
│           │   page=1     │       
└───────────┴──────────────┘       
```

**Truy vấn với Index:**

```
SELECT * FROM employees WHERE emp_id = 10000;

Không có index:
  Đọc page 0 → không thấy 10000
  Đọc page 1 → không thấy 10000
  ...
  Đọc page 333 → Tìm thấy! (đọc 333 pages)

Có index:
  Tìm trong index B-Tree: emp_id=10000 → page=333, row_id=9999
  Đọc page 333 → Tìm thấy! (đọc 2 pages: 1 index + 1 heap)
```

---

## Tóm tắt: I/O là chi phí chính

```
Mỗi I/O = đọc 1 page = đọc nhiều rows

Không có index:
  Query = Full heap scan
  Cost = N pages (N = tổng số pages trong bảng)

Có index:
  Query = Đọc index B-Tree (vài pages) + Đọc heap page cần thiết
  Cost = log(N) + 1 (rất nhỏ so với N)
```

**Nguyên tắc quan trọng:**
- SELECT ít columns hơn sẽ không ít I/O hơn (trong row-based DB)
- Nhưng SELECT ít columns giảm công parse/serialize trong memory
- Index giúp giảm I/O đáng kể
- Đọc nhiều rows cùng lúc (via full scan) đôi khi hiệu quả hơn đọc từng row qua index (index scan kém hơn khi kết quả trả về > 5-10% table)

---

## OS Cache - Layer giữa Database và Disk

PostgreSQL không đọc trực tiếp từ disk mà thông qua OS cache:

```
Query → PostgreSQL Buffer Pool → OS Page Cache → Disk

Lần đầu: Disk → OS Cache → PG Buffer → Query (chậm)
Lần sau: OS Cache → PG Buffer → Query (nhanh)
```

**Tại sao quan trọng:** Khi bạn thấy query đầu tiên chậm nhưng query tiếp theo nhanh hơn nhiều — đó là OS Cache đang hoạt động.

---

**Tiếp theo:** 02-row-based-vs-column-based.md →

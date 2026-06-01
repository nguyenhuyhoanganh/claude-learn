# Bài 1: Relational Databases & ACID Transactions (Cơ sở dữ liệu quan hệ và giao dịch ACID)

## Phase 5 nói về cái gì?

Sau khi đã có Load Balancer, Message Broker, API Gateway, CDN (Phase 4), giờ tới lúc bàn về **nơi lưu trữ dữ liệu** — phần quan trọng và khó scale nhất trong mọi kiến trúc. Phase 5 sẽ đi qua: Relational DB (SQL), Non-Relational DB (NoSQL), kỹ thuật mở rộng database, CAP theorem (định luật vàng của distributed data), và lưu trữ dữ liệu phi cấu trúc (file, media).

Bài 1 này khởi đầu với loại database lâu đời nhất nhưng vẫn phổ biến nhất: **Relational Database**.

## Relational Database là gì?

Relational Database (cơ sở dữ liệu quan hệ) tổ chức dữ liệu dưới dạng các **bảng (tables)** liên kết với nhau qua khoá:

- Mỗi **row** (hàng) = một bản ghi (record).
- Mỗi **column** (cột) = một thuộc tính (attribute) — có tên, kiểu dữ liệu (type), và ràng buộc (constraint, vd: NOT NULL, UNIQUE).
- Mỗi record có **primary key** (khoá chính) — một định danh duy nhất.
- **Schema** (cấu trúc bảng) phải định nghĩa **trước** — bảng nào có cột gì, kiểu gì.

Quan hệ giữa các bảng được biểu diễn qua **foreign key** (khoá ngoại) — một cột trong bảng này trỏ đến primary key của bảng khác.

**Ngôn ngữ truy vấn (query language)**: SQL (Structured Query Language) — chuẩn ngành, đã tồn tại từ thập niên 1970.

## Lợi ích của Relational Databases

### 1. Truy vấn linh hoạt và mạnh mẽ (Flexible & Powerful Queries — qua SQL)

SQL cho phép viết các câu truy vấn rất phức tạp, kết hợp nhiều bảng, lọc, gom nhóm, tính toán:

```sql
-- Tìm users theo city
SELECT * FROM users WHERE city = 'Hanoi';

-- Join: kết hợp nhiều tables qua khoá ngoại
SELECT o.order_id, u.name, p.product_name
FROM orders o
JOIN users u ON o.user_id = u.id
JOIN products p ON o.product_id = p.id
WHERE o.created_at > '2024-01-01';

-- Aggregation (gom nhóm và tính toán)
SELECT category, AVG(price) as avg_price, COUNT(*) as count
FROM products
GROUP BY category
ORDER BY avg_price DESC;
```

Khả năng JOIN nhiều bảng là điểm mạnh đặc trưng — bạn không cần load hết dữ liệu lên ứng dụng rồi tự ghép, mà để database làm điều đó cực kỳ tối ưu.

### 2. Tiết kiệm storage (Không trùng lặp dữ liệu)

Nhờ khả năng tách dữ liệu ra nhiều bảng và liên kết qua foreign key, ta không cần lặp lại các thông tin chung:

```text
❌ Nếu KHÔNG có relational DB:
orders: [order_id, product_name, product_company, product_category, ...]
→ Mỗi order phải lặp lại toàn bộ thông tin sản phẩm → lãng phí storage,
   khi đổi tên sản phẩm phải update hàng nghìn order!

✅ Có relational DB:
orders:    [order_id, product_id, ...]    ← chỉ lưu foreign key
products:  [product_id, name, company, category, ...]

→ Khi cần thông tin đầy đủ → JOIN orders với products
→ Đổi tên sản phẩm: chỉ update 1 dòng trong bảng products
```

Nguyên tắc này gọi là **normalization** (chuẩn hoá) — phân tách dữ liệu để mỗi sự thật chỉ tồn tại một nơi.

### 3. Dễ hiểu, dễ làm việc

Cấu trúc bảng rất tự nhiên với con người — giống như Excel sheet vậy. Lập trình viên không cần kiến thức CS chuyên sâu để bắt đầu.

### 4. ACID Transactions (sẽ giải thích bên dưới)

Đây là lợi ích **lớn nhất** của relational DB — và là lý do nó vẫn thống trị các domain critical như tài chính, y tế, kho vận sau hàng chục năm.

## ACID Transactions — Đảm bảo dữ liệu không bao giờ sai

Trong database, **transaction** = một chuỗi các thao tác (operations) được coi như **một operation duy nhất**. Hoặc tất cả thành công, hoặc tất cả bị huỷ bỏ.

**Ví dụ kinh điển:** Chuyển tiền từ tài khoản A sang tài khoản B:

```sql
BEGIN TRANSACTION;
  -- Step 1: Trừ 100 từ tài khoản A
  UPDATE accounts SET balance = balance - 100 WHERE id = 'A';
  -- Step 2: Cộng 100 vào tài khoản B
  UPDATE accounts SET balance = balance + 100 WHERE id = 'B';
COMMIT;
```

Hai câu UPDATE này phải đi cùng nhau. Nếu chỉ thực hiện được câu đầu mà câu sau fail → 100 đồng "biến mất". ACID đảm bảo điều đó không bao giờ xảy ra.

ACID là viết tắt của 4 thuộc tính: **Atomicity, Consistency, Isolation, Durability**.

### A — Atomicity (Tính nguyên tử — không thể chia tách)

> Tất cả operations trong transaction **HOẶC** xảy ra **TẤT CẢ**, **HOẶC** không xảy ra cái nào. Không có trạng thái nửa chừng.

```text
Chuyển tiền A → B:
- Trừ A: ✓ (đã thực hiện)
- Cộng B: ✗ (server crash trước khi kịp!)

→ Atomicity: Database tự động ROLLBACK (huỷ bỏ) → việc trừ A cũng bị undo
→ Số dư A và B quay về như chưa từng giao dịch
→ Không bao giờ mất 100 "vào không khí"
```

Atomicity được thực hiện qua **transaction log** — database ghi lại mọi thay đổi vào log, nếu transaction fail thì đảo ngược (rollback) từ log.

### C — Consistency (Tính nhất quán)

> Transaction không được phép vi phạm bất kỳ ràng buộc (constraint) nào của database. Dữ liệu luôn ở trạng thái hợp lệ trước và sau transaction.

```sql
-- Ràng buộc: số dư không được phép âm
ALTER TABLE accounts ADD CONSTRAINT balance_non_negative
    CHECK (balance >= 0);

-- Giao dịch: Trừ 1000 từ tài khoản chỉ có 500
BEGIN TRANSACTION;
  UPDATE accounts SET balance = balance - 1000 WHERE id = 'A';  -- → balance = -500
COMMIT;

→ Vi phạm constraint balance >= 0 → Transaction FAIL → Rollback tự động
→ Số dư A vẫn là 500, không có vi phạm
```

Consistency dựa trên các constraint bạn định nghĩa: NOT NULL, UNIQUE, FOREIGN KEY, CHECK, ...

### I — Isolation (Tính cô lập)

> Các transaction chạy đồng thời (concurrent) không được nhìn thấy trạng thái trung gian (intermediate state) của nhau.

```text
Transaction T1: Chuyển 100 từ A sang B
Transaction T2: Đọc balance của A và B (chạy đồng thời với T1)

T2 chỉ được nhìn thấy:
├── TRƯỚC khi T1 chạy:     A=1000, B=500   (tổng = 1500)
├── HOẶC SAU khi T1 xong:  A=900,  B=600   (tổng = 1500)
└── KHÔNG BAO GIỜ thấy:    A=900,  B=500   (tổng = 1400!) — trạng thái trung gian
```

Nếu không có isolation, T2 có thể đọc được tổng tiền là 1400 — sai 100 đồng — vì đọc giữa lúc T1 đang chạy nửa chừng.

Isolation được thực hiện qua **locks** (khoá) hoặc **MVCC** (Multi-Version Concurrency Control). Có nhiều cấp độ isolation (READ COMMITTED, REPEATABLE READ, SERIALIZABLE) — đánh đổi giữa độ chặt chẽ và hiệu năng.

### D — Durability (Tính bền vững)

> Một transaction đã commit (xác nhận thành công) sẽ tồn tại **mãi mãi**, kể cả khi hệ thống crash ngay sau đó.

```text
User mua hàng → Transaction commit thành công (DB trả về OK)
→ Server crash ngay lập tức (mất điện, kernel panic, ...)
→ Khi restart: giao dịch mua hàng VẪN CÒN trong database
→ User không bị mất tiền, đơn hàng vẫn được xử lý
```

Durability được thực hiện qua **write-ahead log (WAL)** — mọi thay đổi được ghi vào log trên đĩa **trước** khi báo OK cho client. Khi crash xảy ra, database đọc lại WAL và phục hồi (replay) các transaction đã commit.

## Nhược điểm của Relational Databases

Không có công cụ vàng cho mọi tình huống. Relational DB cũng có các điểm yếu rõ ràng:

### 1. Rigid Schema (Schema cứng nhắc)

- Schema phải được định nghĩa **trước** — bảng nào, cột nào, kiểu gì.
- Khi cần đổi cấu trúc bảng (ALTER TABLE) → có thể gây downtime (database lock bảng) hoặc complexity (cần migration script).
- Không thể dễ dàng thêm attributes riêng cho từng record — mỗi record bị buộc phải có đúng các cột giống nhau.

### 2. Complex & Costly to Maintain (Phức tạp khi vận hành)

- Hỗ trợ SQL + ACID đầy đủ → bản thân database engine phức tạp.
- Khó scale theo chiều ngang (horizontal scaling) — sẽ học chi tiết trong bài 3 (database techniques).
- Khi data và traffic cực lớn, vận hành DB cluster trở thành công việc của cả team DBA.

### 3. Slower Reads (Đọc chậm hơn NoSQL)

- Các đảm bảo ACID thêm overhead (locks, MVCC, WAL).
- Complex JOIN trên dataset lớn có thể rất chậm.
- Khi cần đọc hàng triệu record/giây với latency thấp → NoSQL thường thắng.

## Khi nào nên dùng Relational Database?

✅ **Phù hợp:**

- Data có **mối quan hệ tự nhiên** giữa nhiều entity (orders ↔ users ↔ products).
- Cần **ACID transactions** (tài chính — banking, y tế — medical records, kho vận — inventory).
- Cần **truy vấn phức tạp** và phân tích (analytics, reporting).
- Data có cấu trúc rõ ràng và schema **ít thay đổi**.

❌ **Không phù hợp:**

- Read performance là ưu tiên tối cao (cần microsecond latency).
- Data không có quan hệ rõ ràng (vd: cache đơn giản key-value).
- Schema thay đổi liên tục (mỗi user một field khác nhau).
- Cần horizontal scaling cực lớn (hàng petabyte data — vd: log analytics, IoT).

## Các Relational Database phổ biến

| Database | Trường hợp sử dụng |
|----------|----------|
| **PostgreSQL** | Tính năng phong phú nhất, open source, được cộng đồng ưa chuộng nhất hiện nay |
| **MySQL** | Web applications, được dùng cực kỳ rộng rãi, có MariaDB là fork open-source |
| **AWS RDS** | Managed service trên AWS — chạy MySQL/PostgreSQL/MariaDB không cần tự quản |
| **Oracle** | Enterprise, financial — đắt nhưng feature-rich, lâu đời |
| **SQLite** | Embedded — chạy trong process ứng dụng, file đơn lẻ, không cần server |
| **Microsoft SQL Server** | Phổ biến trong môi trường Windows/.NET enterprise |

## Tóm tắt bài 1

```text
Relational DB (SQL):
├── Dữ liệu trong tables với schema cố định
├── SQL: truy vấn linh hoạt, mạnh mẽ
├── ACID: 4 đảm bảo về tính đúng đắn của transaction
│   ├── Atomicity   — all-or-nothing
│   ├── Consistency — không vi phạm constraint
│   ├── Isolation   — concurrent không nhìn thấy intermediate
│   └── Durability  — committed = persist mãi mãi
└── Phù hợp: structured data, có quan hệ, cần transaction

Trade-offs:
├── ✅ Truy vấn phức tạp, không trùng lặp, ACID đảm bảo
└── ❌ Schema cứng, đọc chậm hơn NoSQL, khó scale ngang
```

Relational DB là nền tảng — hầu hết hệ thống đều có ít nhất một SQL database. Bài kế tiếp sẽ về anh em đối lập của nó: NoSQL — sinh ra để giải quyết những vấn đề mà SQL không scale được.

---
**Bài kế tiếp**: [Bài 2 - Non-Relational Databases (NoSQL)](02-non-relational-databases.md) →

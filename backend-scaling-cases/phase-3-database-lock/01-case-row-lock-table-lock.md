# Case 1: Row lock, table lock — một câu UPDATE làm sập cả hệ thống

Đây là case gốc đã mở đầu khoá học. Bây giờ ta có đủ từ vựng để mổ xẻ nó tới tận đáy.

```java
@Transactional
public void placeOrder(String sku, int qty) {
    jdbc.update("UPDATE inventory SET stock = stock - ? WHERE sku = ?", qty, sku);
    orderRepository.save(new Order(sku, qty));
}
```

Ba dòng code. Chạy hoàn hảo suốt hai năm. Ngày sale, nó làm sập toàn bộ website.

## Vì sao database cần lock

Không có lock thì hai giao dịch song song phá nhau:

```text
   Tồn kho ban đầu: stock = 10

   Giao dịch A                     Giao dịch B
   ───────────                     ───────────
   đọc stock = 10
                                   đọc stock = 10
   tính 10 - 3 = 7
                                   tính 10 - 4 = 6
   ghi stock = 7
                                   ghi stock = 6

   Kết quả: stock = 6
   Đúng ra phải là: 10 - 3 - 4 = 3
   ⇒ BÁN THỪA 3 SẢN PHẨM KHÔNG CÓ THẬT
```

Hiện tượng này gọi là **lost update** (mất cập nhật). Lock sinh ra để ngăn nó.

**Lock (khoá)** — cơ chế database giữ chỗ trên một tài nguyên (dòng, bảng, khoảng giá trị) để các giao dịch khác phải chờ.

## Các mức độ khoá

```text
   ┌──────────────────────────────────────────────────────┐
   │ TABLE LOCK — khoá cả bảng                            │
   │ ┌──────────────────────────────────────────────────┐ │
   │ │ PAGE LOCK — khoá một trang dữ liệu (~8 KB)       │ │
   │ │ ┌──────────────────────────────────────────────┐ │ │
   │ │ │ ROW LOCK — khoá một dòng                     │ │ │
   │ │ └──────────────────────────────────────────────┘ │ │
   │ └──────────────────────────────────────────────────┘ │
   └──────────────────────────────────────────────────────┘
        Càng ra ngoài, càng nhiều người bị chặn.
```

| Mức | Ảnh hưởng | Chi phí quản lý | Ai dùng |
|---|---|---|---|
| Row lock | Chỉ chặn ai đụng đúng dòng đó | Cao (nhiều lock cần theo dõi) | InnoDB, PostgreSQL |
| Page lock | Chặn mọi dòng trong cùng trang | Trung bình | SQL Server (có thể) |
| Table lock | Chặn mọi người | Rất thấp | MyISAM, DDL |

Câu hỏi hay gặp: "khi nào database dùng table lock?" — Với PostgreSQL và InnoDB, các thao tác DML thông thường (`INSERT`/`UPDATE`/`DELETE`) **luôn dùng row lock**. Table lock xuất hiện khi:

- Chạy DDL (`ALTER TABLE`, `CREATE INDEX` không có `CONCURRENTLY`).
- `LOCK TABLE` tường minh.
- SQL Server có **lock escalation** — tự nâng cấp lên table lock khi một giao dịch giữ quá nhiều row lock (ngưỡng ~5.000). PostgreSQL và InnoDB **không** làm điều này.

> **Đính chính một hiểu lầm phổ biến**: nhiều người nghĩ "UPDATE nhiều dòng quá thì MySQL tự chuyển sang table lock". InnoDB **không** có lock escalation. Nhưng có một cơ chế khác nguy hiểm tương đương, thậm chí tệ hơn — xem case 9 (thiếu index).

## Hai loại lock cơ bản

**Shared lock (S) — khoá chia sẻ, khoá đọc**: nhiều giao dịch cùng giữ được. Dùng khi đọc mà muốn đảm bảo dữ liệu không đổi.

**Exclusive lock (X) — khoá độc quyền, khoá ghi**: chỉ một giao dịch giữ được. Mọi lock khác trên cùng tài nguyên phải chờ.

```text
   Bảng tương thích:

              Muốn lấy S    Muốn lấy X
   Đang giữ S     ✓ OK          ✗ chờ
   Đang giữ X     ✗ chờ         ✗ chờ
```

Trong SQL:

```sql
-- Shared lock
SELECT * FROM inventory WHERE sku = 'ABC' FOR SHARE;        -- PostgreSQL
SELECT * FROM inventory WHERE sku = 'ABC' LOCK IN SHARE MODE;  -- MySQL cũ

-- Exclusive lock
SELECT * FROM inventory WHERE sku = 'ABC' FOR UPDATE;       -- cả hai

-- UPDATE/DELETE tự động lấy exclusive lock, không cần viết gì thêm
UPDATE inventory SET stock = stock - 1 WHERE sku = 'ABC';
```

## MVCC — vì sao đọc thường không bị chặn

Nếu mọi thứ đều khoá thì database sẽ rất chậm. PostgreSQL và InnoDB dùng **MVCC (Multi-Version Concurrency Control)** — điều khiển đồng thời đa phiên bản.

Ý tưởng: thay vì ghi đè dữ liệu, database **giữ nhiều phiên bản** của mỗi dòng. Người đọc thấy phiên bản cũ, người ghi tạo phiên bản mới.

```text
   Dòng inventory[sku=ABC]:

   phiên bản 1: stock=10, tạo bởi tx#100, xoá bởi tx#105
   phiên bản 2: stock=7,  tạo bởi tx#105, chưa xoá   ← hiện tại

   Giao dịch tx#103 (bắt đầu trước tx#105) → thấy phiên bản 1: stock=10
   Giao dịch tx#107 (bắt đầu sau)          → thấy phiên bản 2: stock=7
```

Hệ quả cực kỳ quan trọng:

> **Đọc không chặn ghi. Ghi không chặn đọc. Chỉ có ghi chặn ghi.**

Nghĩa là `SELECT` thông thường **không bao giờ** phải chờ lock (trừ khi bạn thêm `FOR UPDATE`). Đây là lý do nhiều người ngạc nhiên: "tôi chỉ SELECT mà sao vẫn chậm?" — nếu SELECT chậm thì lý do là query hoặc I/O, không phải lock.

Cái giá của MVCC: các phiên bản cũ phải được dọn dẹp. PostgreSQL dùng tiến trình `VACUUM`; nếu không kịp dọn, bảng phình to (**table bloat**) và query chậm dần. Đây là một nguồn sự cố riêng của PostgreSQL.

## Case gốc: chuyện gì đã xảy ra

Quay lại đoạn code đầu bài. Ngày sale, 10.000 người cùng mua sản phẩm hot `SKU-IPHONE`.

```text
   t=0     : 200 Tomcat thread nhận request (case phase-2)
   t=0,001 : Cả 200 chạy UPDATE inventory WHERE sku='SKU-IPHONE'

   Nhưng chỉ MỘT giao dịch giữ được exclusive lock trên dòng đó.
   199 giao dịch còn lại XẾP HÀNG.

   ┌─────────────────────────────────────────────────────┐
   │  tx#1  ██ giữ X-lock trên dòng SKU-IPHONE           │
   │  tx#2  ░░░░░░░░░░░░░░░ chờ                          │
   │  tx#3  ░░░░░░░░░░░░░░░ chờ                          │
   │  ...                                                 │
   │  tx#200 ░░░░░░░░░░░░░░ chờ                          │
   └─────────────────────────────────────────────────────┘
```

Mỗi UPDATE mất 2 ms. Thời gian chờ trung bình cho giao dịch thứ n là `n × 2 ms`:

```text
   Giao dịch thứ 1  : 0 ms
   Giao dịch thứ 100: 200 ms
   Giao dịch thứ 200: 400 ms
```

Nghe không tệ lắm. Nhưng thảm hoạ đến từ chỗ khác: **transaction không chỉ có mỗi câu UPDATE**.

```java
@Transactional
public void placeOrder(String sku, int qty) {
    jdbc.update("UPDATE inventory SET stock = stock - ? WHERE sku = ?", qty, sku);
    // ↑ lấy X-lock ở đây

    orderRepository.save(new Order(sku, qty));       // 5 ms
    auditRepository.save(new Audit(sku));            // 3 ms
    notificationClient.send(sku);                    // 800 ms ← GỌI HTTP!

    // ↑ lock CHỈ ĐƯỢC NHẢ Ở ĐÂY, khi transaction commit
}
```

**Lock được giữ cho tới khi transaction kết thúc**, không phải khi câu lệnh kết thúc. Đây là quy tắc quan trọng nhất của bài này.

```text
   Thời gian giữ lock = toàn bộ thời gian transaction = 810 ms

   Giao dịch thứ 200 phải chờ: 200 × 0,81 = 162 GIÂY
```

162 giây. Client timeout từ lâu. Tomcat thread bị giam. Connection pool cạn. Toàn bộ hệ thống sập — và tất cả bắt nguồn từ một dòng gọi HTTP nằm nhầm chỗ.

```text
   CHUỖI SỰ KIỆN ĐẦY ĐỦ

   Lock trên 1 dòng bị giữ 810 ms
        ↓
   199 giao dịch xếp hàng, mỗi cái giữ 1 connection DB
        ↓
   Connection pool (10) cạn sạch
        ↓
   190 Tomcat thread chờ mượn connection
        ↓
   Thread pool (200) cạn sạch
        ↓
   MỌI endpoint chết, kể cả trang chủ
```

Đây là chỗ phase-2 và phase-3 gặp nhau: **một lock ở database leo lên tận tầng HTTP**.

## Chẩn đoán

### PostgreSQL

```sql
-- Ai đang chờ ai
SELECT
    blocked.pid          AS blocked_pid,
    blocked.usename      AS blocked_user,
    now() - blocked.query_start AS blocked_duration,
    left(blocked.query, 60)     AS blocked_query,
    blocking.pid         AS blocking_pid,
    now() - blocking.state_change AS blocking_duration,
    blocking.state       AS blocking_state,
    left(blocking.query, 60)    AS blocking_query
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
    ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
ORDER BY blocked_duration DESC;
```

Kết quả điển hình khi gặp case này:

```text
 blocked_pid | blocked_duration |    blocked_query    | blocking_pid | blocking_state
-------------+------------------+---------------------+--------------+-----------------------
       12045 | 00:00:38         | UPDATE inventory... |        11987 | idle in transaction
       12046 | 00:00:37         | UPDATE inventory... |        11987 | idle in transaction
       ... (197 dòng nữa)
```

Chú ý `blocking_state = idle in transaction`: giao dịch chặn **không đang chạy query nào** — nó đang chờ ứng dụng làm việc khác (gọi HTTP). Đây là chữ ký không thể nhầm lẫn của case này.

```sql
-- Xem chi tiết lock đang giữ
SELECT locktype, relation::regclass, mode, granted, pid
FROM pg_locks
WHERE NOT granted OR relation = 'inventory'::regclass
ORDER BY granted;
```

Bật ghi log tự động:

```sql
ALTER SYSTEM SET log_lock_waits = on;
ALTER SYSTEM SET deadlock_timeout = '1s';   -- chờ > 1s thì ghi log
SELECT pg_reload_conf();
```

### MySQL

```sql
-- MySQL 8+
SELECT * FROM performance_schema.data_lock_waits;

SELECT
    r.trx_id AS waiting_trx,
    r.trx_mysql_thread_id AS waiting_thread,
    r.trx_query AS waiting_query,
    b.trx_id AS blocking_trx,
    b.trx_query AS blocking_query,
    TIMESTAMPDIFF(SECOND, r.trx_wait_started, NOW()) AS wait_seconds
FROM information_schema.innodb_trx r
JOIN performance_schema.data_lock_waits w
    ON r.trx_id = w.REQUESTING_ENGINE_TRANSACTION_ID
JOIN information_schema.innodb_trx b
    ON b.trx_id = w.BLOCKING_ENGINE_TRANSACTION_ID;
```

```sql
-- Xem transaction đang chạy lâu nhất
SELECT trx_id, trx_state, trx_started,
       TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS duration,
       trx_rows_locked, trx_query
FROM information_schema.innodb_trx
ORDER BY trx_started;
```

## Giải pháp, theo thứ tự hiệu quả

### 1. Rút ngắn transaction — hiệu quả nhất, rẻ nhất

```java
// ĐÚNG: chỉ giữ lock đúng phần cần thiết
public void placeOrder(String sku, int qty) {
    Order order = reserveStock(sku, qty);        // transaction ngắn: 8 ms
    notificationClient.send(sku);                 // NGOÀI transaction: 800 ms
}

@Transactional
protected Order reserveStock(String sku, int qty) {
    jdbc.update("UPDATE inventory SET stock = stock - ? WHERE sku = ? AND stock >= ?",
                qty, sku, qty);
    return orderRepository.save(new Order(sku, qty));
}
```

```text
   Thời gian giữ lock: 810 ms → 8 ms  (giảm 100 lần)
   Thông lượng dòng nóng: 1,2 → 125 UPDATE/giây
```

**Quy tắc bất di bất dịch**: trong `@Transactional` chỉ được có thao tác database. Không HTTP, không gửi mail, không đọc file, không `Thread.sleep`, không tính toán nặng.

### 2. Đặt lock ở CUỐI transaction

Nếu buộc phải làm nhiều việc trong một transaction, hãy sắp xếp để thao tác trên dòng nóng nằm **cuối cùng**:

```java
@Transactional
public void placeOrder(String sku, int qty) {
    Order order = orderRepository.save(new Order(sku, qty));   // dòng riêng, không tranh chấp
    auditRepository.save(new Audit(sku));                       // dòng riêng

    // Đặt CUỐI CÙNG: lock trên dòng nóng chỉ bị giữ trong vài ms cuối
    jdbc.update("UPDATE inventory SET stock = stock - ? WHERE sku = ?", qty, sku);
}
```

Kỹ thuật đơn giản, hiệu quả bất ngờ: thời gian giữ lock trên dòng nóng giảm từ "cả transaction" xuống "vài ms cuối transaction".

### 3. Dùng atomic UPDATE thay vì đọc-sửa-ghi

```java
// SAI — hai bước, cần lock lâu và có race condition
Inventory inv = repo.findBySku(sku);       // SELECT
inv.setStock(inv.getStock() - qty);        // tính trong Java
repo.save(inv);                            // UPDATE

// ĐÚNG — một câu lệnh nguyên tử, database tự lo
int updated = jdbc.update(
    "UPDATE inventory SET stock = stock - ? WHERE sku = ? AND stock >= ?",
    qty, sku, qty);
if (updated == 0) throw new OutOfStockException();
```

Điều kiện `AND stock >= ?` vừa chống bán âm kho, vừa cho biết kết quả qua số dòng bị ảnh hưởng — không cần đọc trước.

### 4. Đặt `lock_timeout` — chống hàng đợi vô hạn

```sql
-- PostgreSQL
ALTER ROLE app_user SET lock_timeout = '3s';

-- MySQL
SET GLOBAL innodb_lock_wait_timeout = 5;    -- mặc định 50 giây!
```

Với `lock_timeout = 3s`, giao dịch thứ 200 nhận lỗi sau 3 giây thay vì chờ 162 giây. Bạn đổi "một số request lỗi" lấy "hệ thống không sập" — đánh đổi gần như luôn đúng.

Đây là **load shedding ở tầng database** (phase-1 bài 5).

### 5. Giảm tranh chấp trên chính dòng nóng

Nếu vẫn nghẽn, vấn đề là **hot row** — một dòng bị cả nghìn người tranh nhau. Case 4 dành riêng cho chủ đề này, với các kỹ thuật: chia nhỏ counter, gom lô, đưa sang Redis, chuyển sang hàng đợi.

## Bảng tổng hợp thời gian giữ lock

Đo trên hệ thống thật, cùng một logic nghiệp vụ:

| Cách viết | Thời gian giữ lock | Thông lượng dòng nóng |
|---|---|---|
| Transaction bọc cả lời gọi HTTP | 810 ms | **1,2/giây** |
| Transaction chỉ có thao tác DB | 8 ms | 125/giây |
| Đặt UPDATE dòng nóng ở cuối | 2 ms | 500/giây |
| Atomic UPDATE, transaction 1 câu | 0,8 ms | 1.250/giây |
| Gom lô 100 đơn rồi UPDATE một lần | 0,8 ms / 100 đơn | **~50.000/giây** |

Từ 1,2 lên 50.000 — cải thiện **hơn 40.000 lần** mà không thêm một máy nào. Đây là lý do tối ưu lock đáng giá hơn nhiều so với nâng cấp phần cứng.

## Bẫy thường gặp

| Bẫy | Thực tế |
|---|---|
| "Lock nhả sau khi câu lệnh xong" | Nhả khi **transaction** commit/rollback |
| "SELECT cũng bị chặn bởi UPDATE" | Với MVCC thì không. `SELECT FOR UPDATE` thì có |
| "InnoDB tự nâng lên table lock khi nhiều row lock" | Không. Nhưng thiếu index thì khoá gần như cả bảng (case 9) |
| Gọi HTTP/gửi mail trong `@Transactional` | Thủ phạm số một của mọi vấn đề lock |
| Để `innodb_lock_wait_timeout` mặc định 50 giây | Quá dài, đủ để hệ thống sập trước |
| Dùng `@Transactional` cho method chỉ đọc | Vẫn mở transaction, giữ snapshot. Dùng `readOnly = true` |
| Đọc rồi sửa rồi ghi trong Java | Race condition + giữ lock lâu. Dùng atomic UPDATE |
| Nghĩ thêm pod sẽ giúp | Càng nhiều pod càng nhiều giao dịch tranh cùng dòng — tệ hơn |

Bẫy cuối cùng đáng nhấn mạnh: đây chính là hệ số **α (contention)** trong USL (phase-1 bài 5). Khi nút thắt là một dòng dữ liệu, **scale ngang làm mọi thứ tệ hơn**.

## Tóm tắt case 1

- Lock được giữ **tới khi transaction kết thúc**, không phải khi câu lệnh kết thúc.
- **Row lock** là mặc định của InnoDB/PostgreSQL. Table lock chủ yếu đến từ DDL.
- **MVCC**: đọc không chặn ghi, ghi không chặn đọc — chỉ **ghi chặn ghi**.
- Thủ phạm số một: **gọi HTTP bên trong `@Transactional`** → giữ lock hàng trăm mili-giây.
- Thứ tự sửa: rút ngắn transaction → đặt lock ở cuối → atomic UPDATE → `lock_timeout` → giảm hot row.
- Chữ ký chẩn đoán: **`idle in transaction` ở PostgreSQL** / `innodb_trx` có transaction chạy lâu.
- `lock_timeout` là **load shedding ở tầng database** — thà lỗi vài request còn hơn sập cả hệ thống.

**Bài kế tiếp** → [Case 2: Transaction dài — kẻ giết người thầm lặng](02-case-transaction-dai.md)

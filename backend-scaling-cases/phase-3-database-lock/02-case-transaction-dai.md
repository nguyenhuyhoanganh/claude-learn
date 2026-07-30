# Case 2: Transaction dài — kẻ giết người thầm lặng

Case 1 cho thấy transaction dài chặn người khác. Nhưng đó mới chỉ là tác hại **rõ ràng nhất**. Transaction dài còn gây ra bốn thiệt hại khác mà hầu như không ai liên hệ tới nó — và một trong số đó có thể làm database của bạn phình gấp 10 lần chỉ trong một đêm.

## Hiện tượng — bốn triệu chứng tưởng chừng không liên quan

```text
   Thứ Hai
   ├─ Ổ đĩa database từ 200 GB lên 380 GB chỉ sau một đêm
   ├─ Query trên bảng orders chậm gấp 5 lần (dù dữ liệu không tăng mấy)
   ├─ Replica bị trễ 40 phút so với primary
   └─ Một số UPDATE bị timeout ngẫu nhiên

   Nguyên nhân chung của cả bốn: MỘT job báo cáo mở transaction
   lúc 2 giờ sáng và giữ nó trong 6 tiếng.
```

Điều đáng sợ: job đó **chỉ đọc dữ liệu**. Nó không khoá gì cả, không ghi gì cả. Vậy mà nó gây ra tất cả những điều trên.

## Vì sao transaction chỉ đọc cũng nguy hiểm

Quay lại MVCC (case 1). Database giữ nhiều phiên bản của mỗi dòng. Câu hỏi: **khi nào dọn phiên bản cũ?**

Trả lời: khi **không còn giao dịch nào có thể cần đến nó nữa**.

```text
   09:00  tx#500 (job báo cáo) BẮT ĐẦU. Snapshot: nhìn thấy thế giới lúc 09:00.

   09:05  tx#501 UPDATE orders SET status='PAID' WHERE id=1
          → tạo phiên bản mới, phiên bản cũ PHẢI GIỮ LẠI vì tx#500 có thể đọc

   09:10  tx#502 UPDATE cùng dòng đó
          → thêm một phiên bản nữa, cả hai phiên bản cũ vẫn phải giữ

   ... 6 tiếng sau ...

   15:00  Đã có 3 triệu phiên bản cũ không thể dọn.
          Bảng orders phình từ 40 GB lên 180 GB.
          Mọi query phải quét qua đống rác đó.
```

Cơ chế này gọi là **bloat** (phình) ở PostgreSQL. Tiến trình `VACUUM` có nhiệm vụ dọn dẹp, nhưng nó **không được phép dọn** những phiên bản mà transaction đang mở còn có thể nhìn thấy.

```text
   PostgreSQL: xem transaction cũ nhất đang mở
   SELECT pid, now() - xact_start AS tx_age, state, left(query,50)
   FROM pg_stat_activity
   WHERE xact_start IS NOT NULL
   ORDER BY xact_start
   LIMIT 5;

    pid  |    tx_age    |        state        |         query
   ------+--------------+---------------------+----------------------
   11987 | 06:12:33     | idle in transaction | SELECT * FROM orders  ← THỦ PHẠM
```

Một dòng `tx_age = 06:12:33` là đủ để giải thích cả bốn triệu chứng ở trên.

MySQL/InnoDB có vấn đề tương đương: các phiên bản cũ nằm trong **undo log**, và undo log không thể cắt bớt khi còn transaction cũ. Kết quả: file `ibdata`/undo tablespace phình to, và **history list length** tăng vọt.

```sql
-- MySQL: kiểm tra độ dài lịch sử undo
SHOW ENGINE INNODB STATUS\G
-- Tìm dòng: History list length 4823910   ← quá lớn = có transaction dài
```

## Bốn thiệt hại của transaction dài

| # | Thiệt hại | Cơ chế |
|---|---|---|
| 1 | **Chặn giao dịch khác** | Giữ lock tới khi commit (case 1) |
| 2 | **Bloat / undo phình** | Ngăn VACUUM dọn phiên bản cũ |
| 3 | **Query chậm dần** | Phải quét qua nhiều phiên bản chết |
| 4 | **Chặn DDL** | `ALTER TABLE` phải chờ mọi transaction cũ kết thúc |
| 5 | **Replica trễ** | Replica cũng phải giữ phiên bản cũ để phục vụ query đang chạy |

Thiệt hại số 4 đáng nói riêng. Bạn chạy một lệnh migration đơn giản:

```sql
ALTER TABLE orders ADD COLUMN note TEXT;
```

Lệnh này ở PostgreSQL 11+ rất nhanh (chỉ đổi metadata). Nhưng nó cần **ACCESS EXCLUSIVE lock** trên bảng, và phải chờ mọi transaction đang đọc bảng đó kết thúc. Nếu có một transaction chạy 6 tiếng:

```text
   ALTER TABLE chờ 6 tiếng  ←  và trong lúc chờ, NÓ CHẶN MỌI QUERY MỚI
   ⇒ Toàn bộ ứng dụng đứng im
```

Đây là kịch bản kinh điển "chạy migration lúc rảnh mà làm sập production". Cách phòng:

```sql
SET lock_timeout = '3s';           -- không lấy được lock trong 3s thì bỏ
ALTER TABLE orders ADD COLUMN note TEXT;
```

Thà migration thất bại và thử lại, còn hơn nó xếp hàng và chặn tất cả.

## Sáu nguồn transaction dài trong ứng dụng Spring

### 1. `@Transactional` bọc quanh vòng lặp lớn

```java
// SAI — một transaction cho 500.000 bản ghi
@Transactional
public void importOrders(List<OrderDto> dtos) {
    for (OrderDto dto : dtos) {
        orderRepository.save(toEntity(dto));       // 500.000 lần
    }
}
```

Transaction chạy 40 phút, giữ lock trên mọi dòng vừa ghi, chặn VACUUM.

```java
// ĐÚNG — chia lô, mỗi lô một transaction ngắn
public void importOrders(List<OrderDto> dtos) {
    Lists.partition(dtos, 500).forEach(this::importBatch);
}

@Transactional
protected void importBatch(List<OrderDto> batch) {
    batch.forEach(dto -> orderRepository.save(toEntity(dto)));
    entityManager.flush();
    entityManager.clear();       // giải phóng persistence context
}
```

Đánh đổi cần biết: chia lô nghĩa là **mất tính nguyên tử toàn cục**. Nếu lô thứ 300 lỗi, 299 lô trước đã commit. Phải thiết kế để chạy lại được (idempotent) — ghi lại tiến độ, dùng `INSERT ... ON CONFLICT DO NOTHING`, hoặc có bước dọn dẹp.

Với đa số bài toán nhập liệu, đánh đổi này là đúng. "Toàn bộ hoặc không gì cả" nghe hay nhưng trong thực tế thường không phải yêu cầu thật.

### 2. `@Transactional` ở tầng controller

```java
@RestController
@Transactional            // ← đặt ở đây là sai
public class OrderController {

    @PostMapping("/orders")
    public OrderResponse create(@RequestBody OrderRequest req) {
        Order o = orderService.place(req);
        return mapper.toResponse(o);       // serialize cũng nằm trong transaction
    }
}
```

Transaction bao gồm cả deserialize request, validate, map DTO, serialize response. Đặt `@Transactional` ở **tầng service**, càng gần thao tác database càng tốt.

### 3. `open-in-view = true`

Đã nói ở phase-2 case 2. Nó giữ **connection** suốt request; với một số cấu hình còn giữ cả transaction. Luôn đặt `false`.

### 4. Job báo cáo chạy hàng giờ

```java
@Scheduled(cron = "0 0 2 * * *")
@Transactional(readOnly = true)
public void nightlyReport() {
    // chạy 6 tiếng
}
```

`readOnly = true` giúp một chút (PostgreSQL có thể tối ưu), nhưng **vẫn giữ snapshot** và vẫn chặn VACUUM.

Cách đúng:

```java
@Scheduled(cron = "0 0 2 * * *")
public void nightlyReport() {
    List<Long> ids = fetchIdsToProcess();          // transaction rất ngắn
    Lists.partition(ids, 1000).forEach(batch -> {
        processChunk(batch);                        // mỗi lô một transaction
    });
}
```

Tốt hơn nữa: cho job báo cáo chạy trên **read replica** riêng, để bloat (nếu có) không ảnh hưởng database chính. Đây là bulkhead ở tầng dữ liệu.

### 5. Debug bằng breakpoint trên môi trường chung

Nghe buồn cười nhưng xảy ra thật: lập trình viên đặt breakpoint giữa một transaction trên môi trường staging dùng chung, đi ăn trưa. Transaction mở 1 tiếng, chặn cả đội.

Phòng: đặt `idle_in_transaction_session_timeout` ở mọi môi trường.

### 6. Connection pool trả connection về mà chưa commit

Nếu code lấy connection thủ công và quên `commit()`/`rollback()`, connection quay về pool với transaction còn mở. Lần sau ai mượn phải nó sẽ kế thừa transaction cũ. HikariCP có bảo vệ:

```yaml
spring.datasource.hikari.auto-commit: true   # mặc định, giúp phát hiện sớm
```

## Tuyến phòng thủ: ba tham số database

Đây là phần đáng giá nhất của bài. Ba dòng cấu hình, đặt một lần, phòng được gần như mọi biến thể:

```sql
-- PostgreSQL
ALTER ROLE app_user SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app_user SET statement_timeout = '30s';
ALTER ROLE app_user SET lock_timeout = '5s';

-- Cho user chạy báo cáo thì nới lỏng hơn
ALTER ROLE report_user SET statement_timeout = '30min';
ALTER ROLE report_user SET idle_in_transaction_session_timeout = '1min';
```

| Tham số | Chặn được gì | Giá trị gợi ý |
|---|---|---|
| `idle_in_transaction_session_timeout` | Transaction mở mà không làm gì (gọi HTTP, breakpoint) | 30 giây |
| `statement_timeout` | Query chạy quá lâu (thiếu index, tích Descartes) | 10-30 giây |
| `lock_timeout` | Chờ lock quá lâu | 3-5 giây |

MySQL tương đương:

```sql
SET GLOBAL innodb_lock_wait_timeout = 5;
SET GLOBAL max_execution_time = 30000;        -- ms, chỉ áp cho SELECT
SET GLOBAL wait_timeout = 600;
-- MySQL không có idle_in_transaction_session_timeout tương đương;
-- phải giám sát bằng information_schema.innodb_trx
```

Điểm quan trọng: `idle_in_transaction_session_timeout` **huỷ hẳn session**, ứng dụng nhận exception. Điều đó nghe đáng sợ nhưng chính là điều bạn muốn — nó biến một vấn đề âm thầm thành một lỗi có thể nhìn thấy và sửa được.

## Giám sát — cảnh báo cần có

```sql
-- Đưa vào exporter Prometheus hoặc chạy định kỳ
SELECT
    max(EXTRACT(EPOCH FROM (now() - xact_start))) AS oldest_tx_seconds
FROM pg_stat_activity
WHERE xact_start IS NOT NULL AND state <> 'idle';
```

```promql
# Cảnh báo khi có transaction chạy quá 5 phút
pg_stat_activity_max_tx_duration > 300
```

Ba chỉ số cần theo dõi thường xuyên trên PostgreSQL:

| Chỉ số | Ý nghĩa | Ngưỡng |
|---|---|---|
| Transaction cũ nhất | Nguồn gây bloat | > 5 phút |
| `n_dead_tup` (số dòng chết) | Mức bloat hiện tại | > 20% `n_live_tup` |
| Tuổi `relfrozenxid` | Nguy cơ wraparound | > 200 triệu |

```sql
-- Bảng nào đang bloat nặng
SELECT schemaname, relname,
       n_live_tup, n_dead_tup,
       round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
       last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC
LIMIT 10;
```

Chỉ số thứ ba — **transaction ID wraparound** — là tình huống hiếm nhưng chí mạng. PostgreSQL dùng số nguyên 32-bit cho ID giao dịch; nếu VACUUM bị chặn quá lâu, database sẽ **tự động dừng nhận ghi** để tự bảo vệ. Đã có những sự cố nổi tiếng trong ngành vì lý do này. Transaction dài là nguyên nhân chính khiến VACUUM không chạy được.

## Xử lý khẩn cấp

Khi phát hiện transaction dài đang gây hại:

```sql
-- PostgreSQL: huỷ query nhưng giữ kết nối (nhẹ nhàng)
SELECT pg_cancel_backend(11987);

-- Nếu không được: ngắt hẳn kết nối (mạnh tay)
SELECT pg_terminate_backend(11987);

-- Huỷ hàng loạt các session idle in transaction quá 10 phút
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - state_change > interval '10 minutes';
```

```sql
-- MySQL
KILL 12045;                    -- thread id từ innodb_trx.trx_mysql_thread_id
```

Sau khi dọn xong, PostgreSQL cần chạy VACUUM để thu hồi:

```sql
VACUUM (VERBOSE, ANALYZE) orders;       -- dọn nhưng không trả đĩa về OS

-- Trả đĩa về OS thì cần viết lại bảng (KHOÁ BẢNG — cẩn thận!)
VACUUM FULL orders;                     -- chặn mọi truy cập, chỉ làm khi có downtime

-- Thay thế không khoá bảng (cần extension pg_repack)
pg_repack -t orders -d shop
```

`VACUUM FULL` khoá bảng hoàn toàn — với bảng 180 GB nó có thể chạy hàng giờ. Dùng `pg_repack` nếu không có cửa sổ bảo trì.

## Bảng so sánh: transaction ngắn vs dài

| Khía cạnh | Transaction 10 ms | Transaction 6 giờ |
|---|---|---|
| Lock giữ | 10 ms | 6 giờ |
| Ảnh hưởng VACUUM | Không | Chặn hoàn toàn |
| Bloat sinh ra | ~0 | Hàng chục GB |
| Chặn DDL | Không | Có, và DDL lại chặn tiếp mọi query |
| Ảnh hưởng replica | Không | Trễ nghiêm trọng |
| Rollback nếu lỗi | Tức thì | Có thể mất hàng giờ |
| Nguy cơ wraparound | Không | Có |

Dòng cuối cùng về rollback thường bị bỏ qua: nếu một transaction ghi 500.000 dòng rồi thất bại, việc **rollback cũng tốn thời gian tương đương**. Bạn không thể "huỷ nhanh" một transaction lớn.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| `@Transactional` bọc vòng lặp lớn | Transaction hàng chục phút |
| `@Transactional` ở controller | Bao gồm cả serialize/deserialize |
| `readOnly = true` nghĩ là vô hại | Vẫn giữ snapshot, vẫn chặn VACUUM |
| Không đặt `idle_in_transaction_session_timeout` | Một breakpoint làm chết cả môi trường |
| Chạy migration mà không đặt `lock_timeout` | Migration chờ, và chặn mọi query khác |
| Không theo dõi `n_dead_tup` | Bloat tích luỹ âm thầm hàng tháng |
| `VACUUM FULL` trên production giờ cao điểm | Khoá bảng hàng giờ |
| Chia lô mà không làm idempotent | Chạy lại sinh dữ liệu trùng |

## Tóm tắt case 2

- Transaction dài gây **5 thiệt hại**: chặn lock, bloat, query chậm, chặn DDL, replica trễ.
- **Transaction chỉ đọc cũng nguy hiểm** — nó giữ snapshot và chặn VACUUM dọn phiên bản cũ.
- Chữ ký: `idle in transaction` với `tx_age` lớn trong `pg_stat_activity`; `History list length` lớn ở MySQL.
- Ba dòng phòng thủ bắt buộc: `idle_in_transaction_session_timeout`, `statement_timeout`, `lock_timeout`.
- `@Transactional` phải nằm ở **tầng service**, chỉ bọc thao tác database, và **chia lô** cho khối lượng lớn.
- Chia lô đánh đổi tính nguyên tử → phải thiết kế **idempotent**.
- Migration luôn chạy kèm `SET lock_timeout` — thà thất bại còn hơn chặn cả hệ thống.
- Theo dõi: transaction cũ nhất, `n_dead_tup`, tuổi `relfrozenxid`.

**Bài kế tiếp** → [Case 3: Deadlock — hai giao dịch chờ nhau vĩnh viễn](03-case-deadlock.md)

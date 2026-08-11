# Bài 6: Cơ chế Transaction bên trong

`COMMIT` trả về sau 0,2 mili-giây và hứa với bạn rằng dữ liệu **sẽ sống sót** kể cả khi cắt điện ngay giây tiếp theo. Đó là một lời hứa rất lớn cho 0,2 mili-giây.

Bài này mở nắp: chính xác chuyện gì xảy ra khi bạn gõ `BEGIN`, khi bạn ghi dòng đầu tiên, và **bảy bước** của `COMMIT` — trong đó chỉ **một** bước quyết định độ bền, và **một bước khác** quyết định thời điểm người khác nhìn thấy việc bạn làm. Hiểu thứ tự bảy bước đó giải thích được gần như mọi hành vi lạ của transaction.

## `BEGIN` gần như không làm gì

```text
   BEGIN;

   Ghi đĩa?          KHÔNG
   Cấp XID?          KHÔNG  (xem bài 2 — virtual XID)
   Chụp snapshot?    KHÔNG  (chỉ chụp ở câu lệnh đầu tiên)
   Lấy khoá?         KHÔNG
   Ghi WAL?          KHÔNG

   Nó chỉ đổi MỘT BIẾN TRẠNG THÁI trong bộ nhớ của backend:
        TBLOCK_DEFAULT  ──▶  TBLOCK_STARTED
```

Vì thế `BEGIN` rẻ tới mức gần như miễn phí. Cái đắt là **giữ** transaction mở, không phải mở nó.

Máy trạng thái đầy đủ:

```text
   ┌─────────────────┐
   │ TBLOCK_DEFAULT  │  ngoài transaction (autocommit)
   └────────┬────────┘
            │ BEGIN
            ▼
   ┌─────────────────┐
   │ TBLOCK_STARTED  │  đã BEGIN, chưa chạy lệnh nào
   └────────┬────────┘
            │ câu lệnh đầu tiên ──▶ CHỤP SNAPSHOT tại đây
            ▼
   ┌─────────────────┐◀────── SAVEPOINT ──▶ ┌──────────────────┐
   │ TBLOCK_INPROGRESS│                      │ TBLOCK_SUBINPROG │
   └───┬─────────┬───┘                       └──────────────────┘
       │         │
   COMMIT     lỗi SQL
       │         ▼
       │  ┌──────────────────┐
       │  │ TBLOCK_ABORT     │  ← "current transaction is aborted,
       │  └────────┬─────────┘     commands ignored until end of
       │           │ ROLLBACK      transaction block"
       ▼           ▼
   ┌─────────────────┐
   │ TBLOCK_DEFAULT  │
   └─────────────────┘
```

Trạng thái `TBLOCK_ABORT` là nguồn của một thông báo lỗi ai cũng từng gặp:

```text
ERROR:  current transaction is aborted, commands ignored until end of transaction block
```

Nó nghĩa là: một câu lệnh đã lỗi, transaction chuyển sang trạng thái huỷ, và **mọi lệnh sau đó bị bỏ qua** cho tới khi bạn `ROLLBACK` (hoặc `ROLLBACK TO SAVEPOINT`). Đây là lý do driver/ORM tốt luôn bọc mỗi câu lệnh trong savepoint khi cần "chạy tiếp dù lỗi".

---

## Lệnh ghi đầu tiên — lúc mọi thứ bắt đầu tốn kém

```text
   INSERT INTO t VALUES (1);        ◀ lệnh ghi đầu tiên trong transaction

   ┌──────────────────────────────────────────────────────────────┐
   │ 1. CẤP XID                                                   │
   │    lấy khoá nhẹ XidGenLock → tăng bộ đếm toàn cục → 784512   │
   ├──────────────────────────────────────────────────────────────┤
   │ 2. ĐĂNG KÝ VÀO ProcArray                                     │
   │    ghi xid vào ô PGPROC của mình trong bộ nhớ chung          │
   │    → từ giờ MỌI backend khác chụp snapshot đều thấy 784512    │
   │      trong danh sách xip[] "đang chạy"                       │
   ├──────────────────────────────────────────────────────────────┤
   │ 3. GHI TUPLE VÀO SHARED BUFFER                               │
   │    tìm page có chỗ (qua FSM) → ghi tuple xmin=784512         │
   │    → page thành BẨN (chưa xuống đĩa)                          │
   ├──────────────────────────────────────────────────────────────┤
   │ 4. GHI BẢN GHI WAL VÀO BỘ ĐỆM WAL                            │
   │    XLOG_HEAP_INSERT + dữ liệu → wal_buffers (CHƯA fsync)     │
   ├──────────────────────────────────────────────────────────────┤
   │ 5. LẤY KHOÁ                                                  │
   │    RowExclusiveLock trên bảng (mức bảng)                     │
   └──────────────────────────────────────────────────────────────┘

   Chú ý: KHÔNG có lần fsync nào. Chưa có gì bền vững cả.
```

Ở thời điểm này, nếu máy mất điện, **toàn bộ việc bạn vừa làm biến mất** — và đó là hành vi đúng, vì bạn chưa `COMMIT`.

---

## `COMMIT` — bảy bước, đúng thứ tự

Đây là phần cốt lõi của bài:

```text
   COMMIT;

   ┌─ BƯỚC 1 ─ TIỀN COMMIT ──────────────────────────────────────┐
   │  • kích hoạt trigger DEFERRED                                │
   │  • kiểm tra ràng buộc DEFERRABLE                             │
   │  • đóng cursor không HOLD                                    │
   │  • nếu SERIALIZABLE: kiểm tra xung đột SSI (bài 8)           │
   │  ⚠ Lỗi ở bước này khiến COMMIT thất bại và thành ROLLBACK    │
   ├─ BƯỚC 2 ─ GHI BẢN GHI WAL "COMMIT" ─────────────────────────┤
   │  XLOG_XACT_COMMIT vào bộ đệm WAL                             │
   │  (chứa XID, timestamp, danh sách sub-xid, file cần xoá...)   │
   ├─ BƯỚC 3 ─ ĐẨY WAL XUỐNG ĐĨA  ★★★ ────────────────────────────┤
   │  fsync() tới hết bản ghi commit của mình                      │
   │  ★ ĐÂY LÀ BƯỚC DUY NHẤT QUYẾT ĐỊNH ĐỘ BỀN                    │
   │  ★ ĐÂY CŨNG LÀ BƯỚC CHẬM NHẤT (0,1 - 10 ms tuỳ phần cứng)    │
   │  → synchronous_commit điều khiển chính bước này              │
   ├─ BƯỚC 4 ─ ĐÁNH DẤU pg_xact = COMMITTED ─────────────────────┤
   │  ghi 2 bit vào SLRU (trong bộ nhớ, sẽ xuống đĩa sau)         │
   ├─ BƯỚC 5 ─ GỠ KHỎI ProcArray  ★★★ ───────────────────────────┤
   │  xoá XID khỏi PGPROC của mình                                │
   │  ★ ĐÂY LÀ KHOẢNH KHẮC NGƯỜI KHÁC BẮT ĐẦU NHÌN THẤY BẠN      │
   ├─ BƯỚC 6 ─ TRẢ MỌI KHOÁ ─────────────────────────────────────┤
   │  khoá bảng, khoá dòng, advisory lock cấp transaction         │
   │  → những ai đang chờ được đánh thức                          │
   ├─ BƯỚC 7 ─ DỌN DẸP CỤC BỘ ───────────────────────────────────┤
   │  xoá snapshot, bộ nhớ context, bảng tạm ON COMMIT DROP       │
   └─────────────────────────────────────────────────────────────┘
```

### Vì sao thứ tự bước 3 và bước 5 quan trọng

```text
   ĐỘ BỀN (bước 3)  xảy ra TRƯỚC  KHẢ KIẾN (bước 5)

   Có một khe thời gian rất nhỏ mà:
     • WAL đã ghi "784512 COMMITTED" xuống đĩa
     • nhưng 784512 vẫn còn trong ProcArray
     → transaction khác vẫn thấy nó "đang chạy"

   Nếu mất điện đúng lúc này:
     → khi khởi động lại, redo WAL thấy commit record
     → transaction ĐƯỢC CÔNG NHẬN đã commit                ✔ đúng

   Nếu thứ tự ngược lại (gỡ ProcArray trước khi fsync):
     → người khác đọc được dữ liệu đã commit
     → mất điện → dữ liệu KHÔNG có trong WAL
     → dữ liệu người ta đã đọc BIẾN MẤT                    ✘ SAI
```

Đây là một nguyên tắc chung của mọi hệ ghi log: **bền trước, thấy sau**. Không hệ nào làm ngược.

---

## `synchronous_commit` — cái nút vặn độ bền

Bước 3 là bước chậm nhất, và PostgreSQL cho bạn **vặn nó theo từng transaction**:

```text
   TRỤC ĐỘ BỀN ────────────────────────────────────────────────▶ AN TOÀN HƠN
   TRỤC TỐC ĐỘ ◀────────────────────────────────────────────────  NHANH HƠN

   off ─── local ─── remote_write ─── on ─── remote_apply
```

| Giá trị | `COMMIT` trả về sau khi | Mất gì khi sự cố | Độ trễ điển hình |
|---|---|---|---|
| `off` | Ghi vào **bộ đệm WAL trong RAM** | **Tối đa 3× `wal_writer_delay`** (~600 ms) giao dịch cuối, nếu máy chết | ~0,01 ms |
| `local` | `fsync` WAL trên **máy này** | Không mất nếu chỉ tiến trình chết; mất nếu máy hỏng hẳn | 0,1–5 ms |
| `remote_write` | Replica đã **nhận** vào bộ nhớ | Mất nếu **cả hai** máy chết cùng lúc | +RTT mạng |
| `on` *(mặc định)* | `fsync` local **+** replica đã `fsync` (nếu có `synchronous_standby_names`) | Gần như không | +RTT mạng |
| `remote_apply` | Replica đã **áp dụng xong**, đọc được ngay | Không | +RTT + thời gian apply |

> **Điều quan trọng nhất về `off`:** nó **không** làm hỏng dữ liệu. Database vẫn nhất quán sau khi khởi động lại — chỉ là **vài giao dịch cuối cùng biến mất**. Đây khác hẳn với `fsync = off` (tắt hẳn fsync), thứ **có thể** làm hỏng dữ liệu và không bao giờ được dùng trên production.

Vặn theo từng transaction — đây là kỹ thuật rất đáng dùng:

```sql
-- Chuyển tiền: bền tuyệt đối
BEGIN;
SET LOCAL synchronous_commit = 'on';
UPDATE accounts SET so_du = so_du - 100 WHERE id = 1;
UPDATE accounts SET so_du = so_du + 100 WHERE id = 2;
COMMIT;

-- Ghi log truy cập: mất vài dòng cũng không sao, cần nhanh
BEGIN;
SET LOCAL synchronous_commit = 'off';
INSERT INTO access_log (path, ts) VALUES ('/api/x', now());
COMMIT;
```

Đo thử trên cùng một máy (SSD NVMe, 10.000 `INSERT` một dòng, mỗi cái một transaction):

```text
   synchronous_commit = on     →  10.000 commit trong 12,4 giây  (806/s)
   synchronous_commit = off    →  10.000 commit trong  0,9 giây  (11.100/s)
                                  ───────────────────────────────
                                  nhanh hơn ~14 lần
```

Con số này giải thích vì sao ghi log/số đo/sự kiện là ứng viên hoàn hảo cho `off`.

### `commit_delay` — gộp commit của nhiều phiên

Một cách khác để giảm số lần `fsync` mà **không** giảm độ bền:

```text
   KHÔNG GỘP                          CÓ GỘP (group commit)
   ═════════                          ═════════════════════
   tx A: fsync  ──▶ 1 ms              tx A ─┐
   tx B: fsync  ──▶ 1 ms              tx B ─┼─▶ MỘT fsync ──▶ 1 ms
   tx C: fsync  ──▶ 1 ms              tx C ─┘
   ─────────────────────              ─────────────────────
   3 lần fsync                        1 lần fsync cho cả ba
```

```sql
ALTER SYSTEM SET commit_delay = 100;      -- micro-giây, chờ gom thêm
ALTER SYSTEM SET commit_siblings = 5;     -- chỉ chờ nếu có ≥5 tx đang hoạt động
```

Chỉ đáng dùng khi có **rất nhiều** transaction ngắn song song và đĩa có `fsync` chậm (HDD, EBS mạng). Trên NVMe hiện đại thì lợi ích rất nhỏ.

---

## `ROLLBACK` — vì sao nó gần như miễn phí

```text
   ROLLBACK;

   1. Ghi bản ghi WAL XLOG_XACT_ABORT           (không cần fsync!)
   2. Đánh dấu pg_xact = ABORTED                (2 bit)
   3. Gỡ khỏi ProcArray
   4. Trả mọi khoá
   5. Dọn bộ nhớ cục bộ

   KHÔNG có bước "hoàn tác thay đổi".
   Các tuple đã ghi vẫn nằm đó — nhưng vì xmin của chúng thuộc một
   transaction đã ABORT, MVCC coi như chúng chưa từng tồn tại (bài 2).
   VACUUM sẽ dọn sau.
```

Bước 1 **không cần `fsync`** vì: nếu máy chết trước khi bản ghi abort xuống đĩa, khi khởi động lại PostgreSQL không tìm thấy bản ghi commit cho XID đó → mặc định coi là đã abort. Kết quả giống hệt.

So sánh trực tiếp:

| | PostgreSQL | MySQL InnoDB |
|---|---|---|
| `ROLLBACK` 1 dòng | ~0,05 ms | ~0,1 ms |
| `ROLLBACK` 10 triệu dòng | **~0,05 ms** | **hàng chục phút** |
| Huỷ được giữa chừng? | Không cần | **Không** — phải chờ xong |
| Chi phí trả sau | `VACUUM` phải dọn | Purge thread phải dọn undo |

---

## `idle in transaction` — trạng thái tốn kém nhất

```sql
SELECT state, count(*) FROM pg_stat_activity GROUP BY state;
```

```text
        state         | count
----------------------+-------
 active               |    12
 idle                 |    84
 idle in transaction  |    31      ⚠
```

Bốn trạng thái và ý nghĩa thật:

| Trạng thái | Nghĩa | Đang giữ gì |
|---|---|---|
| `active` | Đang chạy một câu lệnh | Mọi thứ (bình thường) |
| `idle` | Không trong transaction | **Chỉ kết nối** — vô hại |
| `idle in transaction` | Đã `BEGIN`, đang chờ lệnh tiếp | **Snapshot + khoá + XID** ⚠ |
| `idle in transaction (aborted)` | Đã lỗi, chờ `ROLLBACK` | Khoá đã trả, nhưng **XID và snapshot vẫn giữ** |

```text
   MỘT PHIÊN "idle in transaction" GIỮ CHÂN:

   ┌────────────────────────────────────────────────────────────┐
   │ • SNAPSHOT   → kéo xmin horizon → VACUUM vô dụng           │
   │                trên TOÀN BỘ database                       │
   │ • MỌI KHOÁ   → người khác chờ vô thời hạn                  │
   │ • XID        → nếu đã ghi, chặn cả việc freeze             │
   │ • SLOT KẾT NỐI → chiếm một chỗ trong max_connections        │
   └────────────────────────────────────────────────────────────┘

   Và nó KHÔNG làm gì cả. Nó đang chờ ứng dụng gửi lệnh tiếp theo.
```

Nguyên nhân số một trong thực tế: **gọi API bên ngoài trong lúc transaction đang mở**.

```python
# ✘ SAI — transaction mở suốt thời gian chờ mạng
with conn.transaction():
    don = cur.execute("SELECT * FROM orders WHERE id = %s", (id,))
    ket_qua = requests.post("https://payment.example/charge", ...)   # 3 giây!
    cur.execute("UPDATE orders SET status = %s WHERE id = %s", (ket_qua, id))

# ✔ ĐÚNG — hai transaction ngắn, gọi mạng ở giữa
with conn.transaction():
    don = cur.execute("SELECT * FROM orders WHERE id = %s FOR UPDATE", (id,))
    cur.execute("UPDATE orders SET status = 'processing' WHERE id = %s", (id,))

ket_qua = requests.post("https://payment.example/charge", ...)       # ngoài tx

with conn.transaction():
    cur.execute("UPDATE orders SET status = %s WHERE id = %s", (ket_qua, id))
```

### Bốn cái hẹn giờ nên đặt

```sql
-- 1. Một câu lệnh chạy quá lâu
ALTER SYSTEM SET statement_timeout = '60s';

-- 2. Chờ khoá quá lâu (chống hàng đợi khoá dây chuyền — bài 7)
ALTER SYSTEM SET lock_timeout = '5s';

-- 3. Ngồi không trong transaction quá lâu
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';

-- 4. TỔNG thời gian một transaction  (PostgreSQL 17+)
ALTER SYSTEM SET transaction_timeout = '30min';
```

Cái thứ tư là bổ sung quan trọng của PostgreSQL 17: trước đó, một transaction gồm 1.000 câu lệnh mỗi cái 1 giây sẽ **lách qua** cả `statement_timeout` lẫn `idle_in_transaction_session_timeout` và chạy 1.000 giây một cách hợp lệ. `transaction_timeout` bịt lỗ đó.

Nên đặt theo vai trò thay vì toàn cục:

```sql
ALTER ROLE app_web SET statement_timeout = '10s';
ALTER ROLE app_web SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE app_etl SET statement_timeout = '2h';       -- job dài được phép
```

---

## `SAVEPOINT` — bên trong và cái giá

```sql
BEGIN;                            -- XID 900
  INSERT INTO t VALUES (1);
  SAVEPOINT sp1;                  -- XID 901, cha = 900
    INSERT INTO t VALUES (2);
    -- lỗi ở đây
  ROLLBACK TO sp1;                -- 901 → ABORTED
  INSERT INTO t VALUES (3);       -- XID 902, cha = 900
COMMIT;                           -- 900, 902 commit; 901 vẫn abort
```

```text
   TRÊN ĐĨA SAU KHI COMMIT:

   tuple (1): xmin=900  → 900 commit  → NHÌN THẤY  ✔
   tuple (2): xmin=901  → 901 abort   → VÔ HÌNH    ✔
   tuple (3): xmin=902  → 902 commit  → NHÌN THẤY  ✔

   Quan hệ cha-con lưu ở pg_subtrans (SLRU, giống pg_xact).
   Kiểm tra khả kiến với sub-xid phải LẦN NGƯỢC lên cha.
```

Cái giá — nhắc lại từ [bài 2](02-transaction-id-snapshot-va-quy-tac-nhin-thay.md) vì nó quá quan trọng:

```text
   ≤ 64 sub-transaction đang mở  → nằm gọn trong bộ đệm PGPROC → NHANH
   > 64                          → PGPROC "overflowed"
                                 → snapshot của MỌI backend bị đánh dấu
                                 → mỗi kiểm tra khả kiến phải tra pg_subtrans
                                 → TOÀN CỤM chậm đi                    ⚠
```

Bốn nguồn sinh sub-transaction ngoài ý muốn:

```sql
-- 1. Khối EXCEPTION trong PL/pgSQL — MỖI LẦN VÀO KHỐI là 1 sub-tx
DO $$ BEGIN
  FOR i IN 1..100000 LOOP
    BEGIN
      INSERT INTO t VALUES (i);
    EXCEPTION WHEN OTHERS THEN NULL;   -- ◀ 100.000 sub-transaction
    END;
  END LOOP;
END $$;
-- Chữa: INSERT ... ON CONFLICT DO NOTHING

-- 2. Spring @Transactional(propagation = NESTED)
-- 3. Django atomic() lồng nhau
-- 4. Driver tự bọc mỗi câu lệnh trong savepoint để "chạy tiếp khi lỗi"
--    (JDBC autosave=always, psycopg autocommit=False + savepoint)
```

Theo dõi:

```sql
SELECT wait_event_type, wait_event, count(*)
FROM pg_stat_activity
WHERE wait_event LIKE 'Subtrans%' OR wait_event_type = 'LWLock'
GROUP BY 1, 2 ORDER BY 3 DESC;
```

---

## Transaction hai pha (`PREPARE TRANSACTION`)

Dành cho distributed transaction — nhưng phải hiểu cái giá trước khi dùng.

```sql
BEGIN;
  UPDATE accounts SET so_du = so_du - 100 WHERE id = 1;
PREPARE TRANSACTION 'chuyen_tien_4482';
-- Từ đây: transaction ĐÃ BỀN VỮNG nhưng CHƯA COMMIT
-- Nó SỐNG SÓT QUA CẢ RESTART

-- Sau khi coordinator xác nhận mọi bên sẵn sàng:
COMMIT PREPARED 'chuyen_tien_4482';
-- hoặc
ROLLBACK PREPARED 'chuyen_tien_4482';
```

```text
   PREPARE TRANSACTION làm gì

   1. Chạy toàn bộ bước 1-4 của COMMIT (kể cả fsync WAL)
   2. GHI trạng thái vào pg_twophase/  ← sống sót qua restart
   3. CHUYỂN quyền sở hữu khoá và XID từ backend sang một "PGPROC ma"
   4. Backend được giải phóng, kết nối đóng được

   ⚠ NHƯNG PGPROC ma đó VẪN:
      • giữ mọi khoá
      • giữ XID → kéo xmin horizon → CHẶN VACUUM TOÀN DATABASE
      • tồn tại VĨNH VIỄN cho tới khi có người COMMIT/ROLLBACK PREPARED
```

Đây là lý do prepared transaction bỏ quên là một trong bốn thủ phạm chặn vacuum ở [bài 5](05-autovacuum-freeze-va-wraparound.md).

```sql
-- Nếu ứng dụng không dùng 2PC, tắt hẳn để không bao giờ gặp
SHOW max_prepared_transactions;      -- mặc định 0 = đã tắt sẵn
```

Mặc định PostgreSQL **tắt** tính năng này (`max_prepared_transactions = 0`) — một mặc định rất khôn ngoan. Chỉ bật khi thật sự có transaction manager (XA, Narayana, Atomikos) quản lý vòng đời, và phải có job dọn các gid quá hạn.

---

## Những thứ **không** rollback được

Đây là danh sách hay gây bất ngờ:

```text
   ✘ SEQUENCE / SERIAL / IDENTITY
        BEGIN; INSERT (nextval → 5); ROLLBACK;
        → lần INSERT sau vẫn nhận 6, KHÔNG quay lại 5
        → id bị "thủng lỗ". Đây là THIẾT KẾ, không phải lỗi:
          nếu sequence rollback được, mọi phiên phải chờ nhau.

   ✘ setval() thủ công          — cũng không rollback

   ✘ Lệnh trong dblink / postgres_fdw tới máy KHÁC
        (trừ khi dùng 2PC tường minh)

   ✘ Hàm gọi ra ngoài: gửi mail, gọi HTTP, ghi file
        → đây là lý do KHÔNG BAO GIỜ gọi tác dụng phụ trong transaction

   ✘ NOTIFY  — thật ra CÓ rollback (gửi ở COMMIT), nhưng người
        nhận có thể xử lý trước khi bạn ROLLBACK phần khác

   ✔ MỌI thứ khác trong database ĐỀU rollback được:
        DDL (CREATE TABLE, ALTER, DROP), TRUNCATE, GRANT...
        ← đây là điểm PostgreSQL vượt trội hơn MySQL,
          nơi DDL tự động commit ngầm và không hoàn tác được
```

Điểm cuối đáng nhấn mạnh, vì nó thay đổi cách viết migration:

```sql
-- PostgreSQL: migration nguyên tử, hoặc thành công hết hoặc không gì cả
BEGIN;
  ALTER TABLE orders ADD COLUMN note TEXT;
  CREATE INDEX idx_orders_note ON orders (note);
  UPDATE schema_version SET v = 42;
COMMIT;      -- lỗi ở bất kỳ đâu → toàn bộ quay về như cũ

-- MySQL: mỗi lệnh DDL tự commit → migration hỏng giữa chừng
--        để lại schema ở trạng thái nửa vời, phải sửa tay
```

*(Ngoại lệ: `CREATE INDEX CONCURRENTLY`, `CREATE DATABASE`, `VACUUM`, `ALTER SYSTEM` không chạy được trong khối transaction.)*

---

## Điều khiển transaction trong procedure

Từ PostgreSQL 11, `PROCEDURE` gọi bằng `CALL` được phép `COMMIT` giữa chừng — thứ mà `FUNCTION` không làm được:

```sql
CREATE PROCEDURE xu_ly_theo_lo()
LANGUAGE plpgsql AS $$
DECLARE
  n INT;
BEGIN
  LOOP
    DELETE FROM cu_ky WHERE id IN (
      SELECT id FROM cu_ky WHERE ts < now() - interval '90 days' LIMIT 10000
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    EXIT WHEN n = 0;
    COMMIT;              -- ◀ chốt từng lô, giải phóng khoá và snapshot
  END LOOP;
END $$;

CALL xu_ly_theo_lo();
```

```text
   VÌ SAO ĐIỀU NÀY QUAN TRỌNG

   Xoá 200 triệu dòng trong MỘT transaction:
     • giữ snapshot suốt hàng giờ → chặn vacuum toàn database
     • giữ khoá trên hàng trăm triệu dòng
     • WAL phình khổng lồ, không thể huỷ giữa chừng

   Xoá theo lô 10.000, COMMIT sau mỗi lô:
     • snapshot chỉ sống vài chục mili-giây
     • dừng lại lúc nào cũng được
     • vacuum dọn kịp trong lúc chạy
```

Đây là mẫu chuẩn cho mọi công việc xoá/cập nhật hàng loạt — đã bàn ở [phase-12 bài 2](../phase-12/02-cursor-nang-cao-va-use-cases.md) dưới góc độ cursor.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Gọi API bên ngoài trong transaction | `idle in transaction` nhiều giây → chặn vacuum toàn database | Chia thành hai transaction ngắn, gọi mạng ở giữa |
| Nghĩ `synchronous_commit = off` làm hỏng dữ liệu | Nó chỉ mất **vài giao dịch cuối**, database vẫn nhất quán | Dùng cho log/số đo; đừng nhầm với `fsync = off` (thứ này mới nguy hiểm) |
| Dựa vào sequence để không có lỗ hổng id | Sequence **không rollback** — thiết kế cố ý | Nếu cần số liên tục, dùng bảng đếm riêng có khoá (và chấp nhận nút cổ chai) |
| Khối `EXCEPTION` trong vòng lặp PL/pgSQL | > 64 sub-tx → tràn → cả cụm chậm | `ON CONFLICT`, hoặc bắt lỗi ngoài vòng lặp |
| Xoá hàng trăm triệu dòng trong một transaction | Chặn vacuum hàng giờ, WAL khổng lồ, không huỷ được | `PROCEDURE` + `COMMIT` theo lô 10.000 |
| Bật `max_prepared_transactions` "cho chắc" | Một gid bỏ quên chặn vacuum vĩnh viễn | Để mặc định `0` trừ khi thật sự có transaction manager |
| Chỉ đặt `statement_timeout` | Transaction 1.000 lệnh × 1 giây vẫn lách qua | Thêm `idle_in_transaction_session_timeout` và `transaction_timeout` (PG17+) |
| Tưởng `BEGIN` chụp snapshot | Snapshot chụp ở **câu lệnh đầu tiên** | Chạy một câu lệnh ngay nếu cần chốt thời điểm |

---

## Tóm tắt bài 6

- **`BEGIN` gần như miễn phí** — chỉ đổi một biến trạng thái trong bộ nhớ. Không ghi đĩa, không cấp XID, không chụp snapshot. Cái đắt là **giữ** transaction mở.
- **XID chỉ được cấp ở lệnh ghi đầu tiên**, cùng lúc backend đăng ký vào `ProcArray` để mọi người khác thấy mình "đang chạy".
- **`COMMIT` có bảy bước**, trong đó **bước 3 (`fsync` WAL) quyết định độ bền** và **bước 5 (gỡ khỏi `ProcArray`) quyết định thời điểm người khác nhìn thấy**. Thứ tự luôn là **bền trước, thấy sau** — đảo lại sẽ khiến dữ liệu người ta đã đọc biến mất sau sự cố.
- **`synchronous_commit` vặn được theo từng transaction.** Đo thật: `off` nhanh hơn `on` khoảng **14 lần** cho các transaction nhỏ. Nó **không làm hỏng dữ liệu**, chỉ mất vài giao dịch cuối — khác hẳn `fsync = off`.
- **`ROLLBACK` gần như miễn phí và không cần `fsync`**: thiếu bản ghi commit thì recovery mặc định coi là abort. Rollback 10 triệu dòng nhanh bằng rollback 1 dòng.
- **`idle in transaction` là trạng thái tốn kém nhất**: giữ snapshot (chặn vacuum toàn database), giữ khoá, giữ XID — mà không làm gì cả. Nguyên nhân số một là **gọi API bên ngoài trong transaction**.
- **Bốn cái hẹn giờ cần có**: `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`, và `transaction_timeout` (PostgreSQL 17+, bịt lỗ transaction gồm nhiều lệnh ngắn).
- **Quá 64 sub-transaction là một vực hiệu năng** làm chậm **cả cụm**, không riêng phiên gây ra. Khối `EXCEPTION` trong vòng lặp PL/pgSQL là nguồn phổ biến nhất.
- **`PREPARE TRANSACTION` tạo ra một transaction sống sót qua restart** và giữ khoá + XID vĩnh viễn cho tới khi có người kết thúc nó. Để `max_prepared_transactions = 0` trừ khi thật sự cần.
- **Sequence không rollback** (cố ý, để các phiên không phải chờ nhau), nhưng **DDL thì có** — đây là điểm PostgreSQL hơn hẳn MySQL: migration là nguyên tử, hỏng giữa chừng thì quay về nguyên trạng.

**Bài kế tiếp** → [Bài 7: Bản đồ đầy đủ các loại khoá](07-ban-do-day-du-cac-loai-khoa.md) — từ khoá bảng tới spinlock, và vì sao một `ALTER TABLE` có thể làm đứng cả hệ thống.

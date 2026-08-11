# Bài 7: Bản đồ đầy đủ các loại khoá trong PostgreSQL

[Phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md) đã giới thiệu khoá chia sẻ, khoá độc quyền và deadlock. Bài này đi xa hơn nhiều: PostgreSQL không có **một** hệ thống khoá, nó có **năm** hệ thống khoá độc lập, hoạt động ở năm quy mô thời gian khác nhau — từ vài nano-giây tới vài giờ.

Hiểu bản đồ đầy đủ này giải thích được những thứ mà lý thuyết "shared/exclusive" không giải thích nổi:

- Vì sao một `ALTER TABLE` chạy 5 mili-giây lại làm **cả hệ thống đứng 10 phút**.
- Vì sao `pg_locks` có `locktype` tên là `transactionid`, `virtualxid`, `tuple`, `spectoken`.
- Vì sao thêm 200 partition khiến database báo `out of shared memory`.
- Vì sao `wait_event = 'LWLock'` không phải khoá bạn có thể nhìn thấy trong `pg_locks`.

## Năm tầng khoá

```text
   ┌─────────────────────────────────────────────────────────────────────┐
   │ 1. HEAVYWEIGHT LOCK  (khoá nặng, "lock manager")                    │
   │    Quy mô  : bảng, dòng-đợi, transaction, đối tượng, advisory       │
   │    Thời gian: tới hết transaction (mili-giây → giờ)                 │
   │    Ở đâu   : bảng băm trong shared memory                           │
   │    Nhìn thấy: pg_locks                              ← 8 MODE        │
   ├─────────────────────────────────────────────────────────────────────┤
   │ 2. ROW-LEVEL LOCK  (khoá dòng)                                      │
   │    Quy mô  : một tuple                                              │
   │    Thời gian: tới hết transaction                                   │
   │    Ở đâu   : GHI THẲNG VÀO xmax + infomask CỦA TUPLE                │
   │    Nhìn thấy: KHÔNG có trong pg_locks (trừ phần "tuple lock")       │
   ├─────────────────────────────────────────────────────────────────────┤
   │ 3. PREDICATE LOCK  (SIREAD — chỉ ở SERIALIZABLE)                    │
   │    Quy mô  : tuple / page / bảng                                    │
   │    Thời gian: tới khi không còn transaction nào chồng lấn           │
   │    Nhìn thấy: pg_locks với mode = SIReadLock         → bài 8        │
   ├─────────────────────────────────────────────────────────────────────┤
   │ 4. LIGHTWEIGHT LOCK  (LWLock)                                       │
   │    Quy mô  : một cấu trúc dữ liệu trong shared memory               │
   │    Thời gian: MICRO-GIÂY (chỉ trong lúc sửa cấu trúc đó)            │
   │    Nhìn thấy: pg_stat_activity.wait_event_type = 'LWLock'           │
   ├─────────────────────────────────────────────────────────────────────┤
   │ 5. SPINLOCK                                                         │
   │    Quy mô  : vài byte                                               │
   │    Thời gian: NANO-GIÂY, quay vòng bận (busy-wait), không xếp hàng  │
   │    Nhìn thấy: gần như không                                         │
   └─────────────────────────────────────────────────────────────────────┘
```

Nguyên tắc chung: **tầng càng thấp thì càng nhanh, càng nhỏ, và càng khó nhìn thấy.** Khi chẩn đoán, luôn bắt đầu từ tầng 1.

---

## Tầng 1 — Heavyweight lock

### Không chỉ khoá bảng: 12 loại đối tượng

Nhiều người tưởng heavyweight lock chỉ dành cho bảng. Thực ra `pg_locks.locktype` có tới hơn 10 giá trị:

| `locktype` | Khoá cái gì | Khi nào gặp |
|---|---|---|
| `relation` | Một bảng/index/view | Mọi truy vấn |
| `extend` | Quyền **nối thêm page** vào cuối bảng | Nhiều phiên cùng `INSERT` ồ ạt |
| `frozenid` | Cập nhật `datfrozenxid` của database | `VACUUM` |
| `page` | Một page (chỉ dùng bởi index hash) | Hiếm |
| `tuple` | **Quyền xếp hàng** trên một dòng | Nhiều phiên chờ cùng một dòng |
| `transactionid` | Chờ một transaction kết thúc | Chờ khoá dòng ⭐ |
| `virtualxid` | Chờ một transaction (kể cả chưa có XID) | `CREATE INDEX CONCURRENTLY` |
| `speculative token` | Chốt tạm cho `INSERT ... ON CONFLICT` | Upsert đồng thời |
| `object` | Đối tượng trong catalog (schema, role, subscription…) | DDL |
| `userlock` | Không dùng nữa | — |
| `advisory` | Khoá do **ứng dụng tự định nghĩa** | `pg_advisory_lock()` |
| `applytransaction` | Nhân bản logic đang áp dụng | Logical replication |

Hai dòng đáng chú ý nhất:

```text
   transactionid — CƠ CHẾ CHỜ KHOÁ DÒNG THẬT SỰ

   Khi A giữ khoá dòng và B muốn dòng đó:
     • B KHÔNG chờ "khoá trên dòng"
     • B xin ShareLock trên chính TRANSACTION ID CỦA A
     • A giữ ExclusiveLock trên transaction id của mình suốt thời gian sống
     • A kết thúc → khoá đó được trả → B được đánh thức

   → Đây là lý do trong pg_locks bạn thấy:
        locktype = transactionid, mode = ShareLock, granted = false
     mà KHÔNG thấy dòng nào nói "đang chờ dòng số 42".


   tuple — HÀNG ĐỢI CÔNG BẰNG CHO MỘT DÒNG

   Nếu 50 phiên cùng chờ một dòng, khi khoá được trả thì cả 50 cùng tỉnh
   và tranh nhau → sóng đụng độ (thundering herd) và có thể có phiên
   chờ mãi (starvation).

   Nên PostgreSQL thêm một khoá "tuple": chỉ MỘT phiên được quyền
   "đang xếp hàng ở đầu" cho dòng đó. 49 phiên còn lại chờ khoá tuple.
   → thứ tự FIFO, không ai bị bỏ đói.
```

### Tám mode và ma trận xung khắc đầy đủ

```text
   Từ NHẸ NHẤT tới NẶNG NHẤT

   1. ACCESS SHARE            (AS)   SELECT
   2. ROW SHARE               (RS)   SELECT FOR UPDATE/SHARE
   3. ROW EXCLUSIVE           (RE)   INSERT, UPDATE, DELETE, MERGE
   4. SHARE UPDATE EXCLUSIVE  (SUE)  VACUUM, ANALYZE, CREATE INDEX CONCURRENTLY,
                                     ALTER TABLE ... SET (một số tuỳ chọn)
   5. SHARE                   (S)    CREATE INDEX (không CONCURRENTLY)
   6. SHARE ROW EXCLUSIVE     (SRE)  CREATE TRIGGER, một số ALTER TABLE
   7. EXCLUSIVE               (E)    REFRESH MATERIALIZED VIEW CONCURRENTLY
   8. ACCESS EXCLUSIVE        (AE)   ALTER TABLE, DROP, TRUNCATE,
                                     VACUUM FULL, REINDEX, CLUSTER
```

Ma trận xung khắc — `✘` nghĩa là phải chờ:

```text
                       ĐANG CÓ AI GIỮ MODE NÀY
                AS    RS    RE    SUE    S    SRE    E    AE
             ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
   XIN   AS  │  ✔  │  ✔  │  ✔  │  ✔  │  ✔  │  ✔  │  ✔  │  ✘  │
         RS  │  ✔  │  ✔  │  ✔  │  ✔  │  ✔  │  ✔  │  ✘  │  ✘  │
         RE  │  ✔  │  ✔  │  ✔  │  ✔  │  ✘  │  ✘  │  ✘  │  ✘  │
        SUE  │  ✔  │  ✔  │  ✔  │  ✘  │  ✘  │  ✘  │  ✘  │  ✘  │
          S  │  ✔  │  ✔  │  ✘  │  ✘  │  ✔  │  ✘  │  ✘  │  ✘  │
        SRE  │  ✔  │  ✔  │  ✘  │  ✘  │  ✘  │  ✘  │  ✘  │  ✘  │
          E  │  ✔  │  ✘  │  ✘  │  ✘  │  ✘  │  ✘  │  ✘  │  ✘  │
         AE  │  ✘  │  ✘  │  ✘  │  ✘  │  ✘  │  ✘  │  ✘  │  ✘  │
             └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
                                                          ▲
                                        ACCESS EXCLUSIVE chặn TẤT CẢ,
                                        và bị TẤT CẢ chặn
```

Ba điều đọc ra được từ ma trận:

1. **`INSERT`/`UPDATE`/`DELETE` (RE) không chặn nhau** — nhiều phiên ghi cùng bảng thoải mái. Xung đột ghi-ghi được xử lý ở **tầng khoá dòng**, không phải tầng bảng.
2. **`VACUUM` (SUE) không chặn đọc và ghi** — nhưng hai `VACUUM` trên cùng bảng thì chặn nhau.
3. **`SELECT` (AS) chỉ bị chặn bởi đúng một mode: `ACCESS EXCLUSIVE`.** Nghĩa là mọi sự cố "truy vấn đọc bị treo" đều quy về ai đó đang giữ hoặc đang chờ `ACCESS EXCLUSIVE`.

### Hàng đợi khoá — vì sao `ALTER TABLE` làm đứng hệ thống

Đây là cơ chế quan trọng nhất trong cả bài, và là nguyên nhân của rất nhiều sự cố production.

```text
   PostgreSQL xếp hàng khoá theo FIFO và KHÔNG cho ai vượt mặt.
   Một yêu cầu mới xung khắc với BẤT KỲ AI ĐANG CHỜ cũng phải xếp sau.

   t0:  Truy vấn báo cáo (AS) chạy — dự kiến 10 phút
        ┌──────────────────────────────────────┐
        │ GIỮ: [báo cáo: ACCESS SHARE]         │
        │ CHỜ: (rỗng)                          │
        └──────────────────────────────────────┘

   t1:  Bạn chạy ALTER TABLE orders ADD COLUMN note TEXT;  (AE)
        AE xung khắc với AS → phải chờ
        ┌──────────────────────────────────────┐
        │ GIỮ: [báo cáo: ACCESS SHARE]         │
        │ CHỜ: [ALTER: ACCESS EXCLUSIVE]  ◀    │
        └──────────────────────────────────────┘

   t2:  Một SELECT bình thường của người dùng tới. (AS)
        AS KHÔNG xung khắc với AS của báo cáo...
        NHƯNG nó xung khắc với AE ĐANG CHỜ ở hàng đợi
        → PHẢI XẾP SAU                                       ⚠
        ┌──────────────────────────────────────┐
        │ GIỮ: [báo cáo: ACCESS SHARE]         │
        │ CHỜ: [ALTER: AE] [SELECT#1] [SELECT#2] [SELECT#3]…│
        └──────────────────────────────────────┘

   t3:  Sau vài giây: HÀNG NGHÌN truy vấn xếp hàng.
        Connection pool cạn. Ứng dụng báo lỗi hàng loạt.
        Toàn hệ thống ĐỨNG — trong khi ALTER TABLE thật ra
        chỉ cần 5 MILI-GIÂY để chạy.
```

Vì sao PostgreSQL không cho vượt mặt: nếu cho, một dòng `SELECT` liên tục sẽ khiến `ALTER TABLE` **chờ mãi mãi**. Công bằng FIFO là đánh đổi có chủ ý.

**Cách phòng thủ chuẩn — luôn dùng khi chạy DDL trên production:**

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';           -- không lấy được trong 3s thì bỏ
ALTER TABLE orders ADD COLUMN note TEXT;
COMMIT;
```

Nếu thất bại thì thử lại — với vòng lặp có lùi dần:

```bash
#!/usr/bin/env bash
for i in 1 2 3 4 5 6 7 8 9 10; do
  if psql -v ON_ERROR_STOP=1 -c "SET lock_timeout='3s';
       ALTER TABLE orders ADD COLUMN note TEXT;"; then
    echo "Xong ở lần thử $i"; exit 0
  fi
  echo "Lần $i không lấy được khoá, chờ $((i*5))s..."
  sleep $((i * 5))
done
echo "Thất bại sau 10 lần"; exit 1
```

Nguyên tắc: **thà thất bại nhanh 10 lần còn hơn làm đứng hệ thống một lần.**

### Khoá sống ở đâu, và vì sao hết chỗ

```text
   BẢNG BĂM TRONG SHARED MEMORY, kích thước CỐ ĐỊNH lúc khởi động:

   số ô = max_locks_per_transaction        (mặc định 64)
        × (max_connections + max_prepared_transactions)

   ví dụ: 64 × (200 + 0) = 12.800 ô khoá cho toàn cụm

   ⚠ Đây KHÔNG phải giới hạn cứng cho mỗi transaction —
     một transaction dùng 5.000 khoá vẫn được, miễn tổng chưa cạn.
```

Lỗi kinh điển:

```text
ERROR:  out of shared memory
HINT:  You might need to increase "max_locks_per_transaction".
```

Nguồn phổ biến nhất là **bảng phân mảnh**:

```text
   SELECT * FROM su_kien WHERE ngay = '2026-08-11';

   Bảng su_kien có 365 partition, mỗi partition có 3 index.
   Nếu KHÔNG loại được partition (partition pruning thất bại):
     → khoá 365 partition × (1 bảng + 3 index) = 1.460 khoá
     → chỉ 8 truy vấn như vậy là cạn sạch 12.800 ô          ⚠
```

Cách chữa theo thứ tự ưu tiên:

```sql
-- 1. Kiểm tra partition pruning có hoạt động không (quan trọng nhất)
EXPLAIN SELECT * FROM su_kien WHERE ngay = '2026-08-11';
-- Phải thấy chỉ 1 partition trong kế hoạch, không phải 365

-- 2. Nếu vẫn cần nhiều khoá, tăng số ô (cần RESTART)
ALTER SYSTEM SET max_locks_per_transaction = 256;

-- 3. Giảm số partition: 365 partition ngày → 12 partition tháng
```

### Fast path — vì sao khoá nhẹ không tốn gì

Nếu mỗi `SELECT` phải sửa bảng băm chung trong shared memory, `LockManager` sẽ thành nút cổ chai khủng khiếp. Nên PostgreSQL có đường tắt:

```text
   MỖI BACKEND CÓ 16 Ô KHOÁ RIÊNG (không cần đụng bảng chung)

   Điều kiện dùng đường tắt:
     • mode NHẸ: ACCESS SHARE / ROW SHARE / ROW EXCLUSIVE
     • bảng KHÔNG dùng chung giữa các database
     • chưa có ai giữ mode NẶNG trên bảng đó
     • còn ô trống trong 16 ô

   → Truy vấn thường: lấy khoá KHÔNG CẦN khoá toàn cục nào. Rất nhanh.

   Khi ai đó xin mode NẶNG:
     → hệ thống phải "kéo" mọi khoá fast path của mọi backend ra bảng chung
       để kiểm tra xung khắc → đây là lúc LockManager bị tranh chấp
```

Hệ quả thực tế: truy vấn chạm **nhiều hơn 16 bảng/index** (join nhiều bảng, hoặc bảng phân mảnh) không dùng được đường tắt, phải đi bảng chung → nếu chạy với tần suất cao sẽ thấy `wait_event = 'lock_manager'`.

---

## Tầng 2 — Khoá dòng

### Bốn mode và điều đặc biệt: chúng không tốn bộ nhớ

```text
   KHOÁ DÒNG KHÔNG NẰM TRONG BẢNG BĂM NÀO CẢ.
   Nó được GHI THẲNG VÀO TUPLE:

        t_xmax    = XID của người khoá
        t_infomask = cờ cho biết đây là khoá loại gì:
                     HEAP_XMAX_KEYSHR_LOCK  → FOR KEY SHARE
                     HEAP_XMAX_EXCL_LOCK    → FOR UPDATE
                     HEAP_XMAX_LOCK_ONLY    → "chỉ khoá, KHÔNG xoá"  ⭐

   → khoá 10 triệu dòng KHÔNG tốn thêm byte shared memory nào
   → nhưng mỗi dòng bị khoá là một lần GHI vào page (và vào WAL)
   → PostgreSQL đổi BỘ NHỚ lấy I/O — nên nó không cần "leo thang khoá"
     như SQL Server ([phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md))
```

Cờ `HEAP_XMAX_LOCK_ONLY` là chi tiết then chốt: nó cho phép phân biệt *"dòng này bị xoá bởi transaction 900"* với *"dòng này bị khoá bởi transaction 900"*. Không có nó, `SELECT FOR UPDATE` sẽ làm dòng biến mất với người khác.

### Ma trận xung khắc khoá dòng

```text
                        ĐANG CÓ AI GIỮ
                 KEY SHARE  SHARE  NO KEY UPDATE  UPDATE
              ┌──────────┬───────┬─────────────┬────────┐
   FOR KEY    │    ✔     │   ✔   │      ✔      │   ✘    │
   SHARE      │          │       │             │        │
              ├──────────┼───────┼─────────────┼────────┤
   FOR SHARE  │    ✔     │   ✔   │      ✘      │   ✘    │
              ├──────────┼───────┼─────────────┼────────┤
   FOR NO KEY │    ✔     │   ✘   │      ✘      │   ✘    │
   UPDATE     │          │       │             │        │
              ├──────────┼───────┼─────────────┼────────┤
   FOR UPDATE │    ✘     │   ✘   │      ✘      │   ✘    │
              └──────────┴───────┴─────────────┴────────┘
```

Lệnh nào lấy mode nào:

| Lệnh | Mode khoá dòng |
|---|---|
| `SELECT ... FOR UPDATE` | `FOR UPDATE` |
| `SELECT ... FOR NO KEY UPDATE` | `FOR NO KEY UPDATE` |
| `SELECT ... FOR SHARE` | `FOR SHARE` |
| `SELECT ... FOR KEY SHARE` | `FOR KEY SHARE` |
| `UPDATE` **không** đụng cột khoá | `FOR NO KEY UPDATE` |
| `UPDATE` **có** đụng cột khoá / `DELETE` | `FOR UPDATE` |
| `INSERT` vào bảng con có khoá ngoại | **`FOR KEY SHARE` trên dòng cha** ⭐ |

Dòng cuối gây nhiều bất ngờ nhất:

```text
   INSERT INTO orders (user_id, ...) VALUES (1, ...);

   → lấy FOR KEY SHARE trên users(id = 1)
   → để bảo đảm dòng cha không bị xoá giữa chừng

   Nếu có 500 phiên cùng INSERT order cho user_id = 1
   (ví dụ: tài khoản hệ thống, tài khoản khách vãng lai):
     • 500 khoá KEY SHARE trên cùng một dòng
     • → PostgreSQL tạo MultiXactId (bài 5)
     • → pg_multixact phình nhanh
     • → và nếu ai đó UPDATE dòng users(id=1) → chặn CẢ 500 phiên  ⚠
```

### MultiXact — khi nhiều người cùng khoá một dòng

```text
   MỘT người khoá:
       xmax = 784512                     (XID thường)

   NHIỀU người khoá:
       xmax = 42  + cờ HEAP_XMAX_IS_MULTI
              │
              └─▶ pg_multixact/offsets ─▶ pg_multixact/members
                                            [784512: KEY SHARE]
                                            [784519: KEY SHARE]
                                            [784530: SHARE]

   Chi phí ẩn:
     • mỗi lần thêm người khoá → tạo MultiXactId MỚI (không sửa cái cũ)
     • → ghi thêm vào pg_multixact
     • → kiểm tra khả kiến phải giải mã multixact (đọc SLRU)
     • → bộ đếm multixact có thể tràn (bài 5)
```

### `NOWAIT` và `SKIP LOCKED`

Hai công cụ biến khoá dòng thành mẫu thiết kế hữu ích:

```sql
-- NOWAIT: thất bại ngay nếu phải chờ
SELECT * FROM seats WHERE id = 14 FOR UPDATE NOWAIT;
-- ERROR: could not obtain lock on row in relation "seats"

-- SKIP LOCKED: bỏ qua dòng đang bị khoá, lấy dòng khác
SELECT * FROM job_queue
WHERE status = 'pending'
ORDER BY created_at
LIMIT 10
FOR UPDATE SKIP LOCKED;
```

`SKIP LOCKED` là nền tảng của **hàng đợi công việc trong database** — mẫu này tốt tới mức nhiều hệ thống bỏ hẳn message broker:

```sql
-- Một worker lấy việc, không bao giờ đụng worker khác
WITH viec AS (
  SELECT id FROM job_queue
   WHERE status = 'pending' AND run_after <= now()
   ORDER BY priority DESC, created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED
)
UPDATE job_queue j
   SET status = 'running', started_at = now(), worker_id = pg_backend_pid()
  FROM viec
 WHERE j.id = viec.id
RETURNING j.*;
```

```text
   VÌ SAO SKIP LOCKED HƠN HẲN "SELECT rồi UPDATE"

   Không có SKIP LOCKED:
     10 worker cùng SELECT → cùng thấy job #1 → 9 worker chờ → xử lý tuần tự
   Có SKIP LOCKED:
     worker 1 lấy #1, worker 2 bỏ qua #1 lấy #2, worker 3 lấy #3...
     → 10 worker chạy SONG SONG hoàn toàn, không ai chờ ai
```

Nhớ đặt `autovacuum_vacuum_scale_factor` rất thấp cho bảng hàng đợi ([bài 5](05-autovacuum-freeze-va-wraparound.md)) — đây là loại bảng phình nhanh nhất.

---

## Tầng 4 — Lightweight lock (LWLock)

Đây là tầng **không nhìn thấy trong `pg_locks`** và là nguyên nhân của phần lớn các sự cố "database chậm mà không có truy vấn nào chậm".

```text
   LWLock BẢO VỆ CÁC CẤU TRÚC DỮ LIỆU TRONG SHARED MEMORY

   ┌──────────────────────────────────────────────────────────────┐
   │ buffer_mapping   bảng tra "page nào đang ở buffer nào"       │
   │ BufferContent    nội dung một buffer cụ thể                  │
   │ WALInsert        chèn bản ghi vào bộ đệm WAL (có 8 khe)      │
   │ WALWrite         ghi WAL xuống đĩa                           │
   │ ProcArray        danh sách transaction đang chạy             │
   │ XidGen           bộ đếm cấp XID                              │
   │ lock_manager     bảng băm khoá nặng (tầng 1!)                │
   │ SubtransSLRU     bộ đệm pg_subtrans (bài 2!)                 │
   │ TransactionSLRU  bộ đệm pg_xact                              │
   │ MultiXactOffset  bộ đệm pg_multixact                         │
   └──────────────────────────────────────────────────────────────┘

   Đặc điểm:
     • chỉ hai mode: SHARED / EXCLUSIVE
     • giữ trong MICRO-GIÂY, không phải tới hết transaction
     • KHÔNG dò deadlock (thiết kế đảm bảo không có vòng)
     • KHÔNG xuất hiện trong pg_locks
```

Chẩn đoán:

```sql
SELECT wait_event_type, wait_event, count(*) AS so_phien
FROM pg_stat_activity
WHERE wait_event IS NOT NULL AND state = 'active'
GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 10;
```

```text
 wait_event_type |   wait_event    | so_phien
-----------------+-----------------+----------
 LWLock          | WALWrite        |       28   ← nghẽn ghi WAL
 LWLock          | buffer_mapping  |       11   ← shared_buffers quá nhỏ / quá lớn
 LWLock          | lock_manager    |        9   ← quá nhiều khoá nặng
 LWLock          | SubtransSLRU    |        7   ← tràn sub-transaction (bài 2)
 Lock            | transactionid   |        4   ← chờ khoá dòng (tầng 1)
```

Bảng tra nhanh nguyên nhân → cách chữa:

| `wait_event` | Nghĩa | Hướng chữa |
|---|---|---|
| `WALWrite` / `WALSync` | Nghẽn ở ghi WAL | Đĩa WAL nhanh hơn; `synchronous_commit` thấp hơn cho tải phù hợp; tăng `wal_buffers` |
| `buffer_mapping` | Tranh chấp bảng tra buffer | Xem lại `shared_buffers`; giảm số truy vấn quét lớn |
| `BufferContent` | Nhiều phiên tranh cùng một page | Điểm nóng dữ liệu — phân tán khoá, giảm `UPDATE` cùng dòng |
| `lock_manager` | Quá nhiều khoá nặng | Giảm số partition/index chạm tới; giảm truy vấn nhiều bảng tần suất cao |
| `SubtransSLRU` | Tràn sub-transaction | Bỏ khối `EXCEPTION` trong vòng lặp ([bài 6](06-co-che-transaction-ben-trong.md)) |
| `MultiXactOffset`/`Members` | Nhiều khoá chia sẻ cùng dòng | Xem lại khoá ngoại trỏ tới dòng cha nóng |
| `ProcArray` | Nhiều kết nối cùng chụp snapshot | Giảm `max_connections`, dùng pool |

**Tầng 5 — spinlock** thì hầu như không cần quan tâm: nó bảo vệ vài byte, quay vòng bận vài chục nano-giây rồi thôi. Nếu spinlock trở thành vấn đề, bạn sẽ thấy CPU cao bất thường mà mọi tầng trên đều bình thường — trường hợp cực hiếm.

---

## Advisory lock — khoá do bạn tự định nghĩa

PostgreSQL cho bạn mượn hạ tầng khoá của nó cho **bất cứ thứ gì**, kể cả thứ không phải dữ liệu:

```sql
-- Cấp phiên: giữ tới khi gọi unlock hoặc đóng kết nối
SELECT pg_advisory_lock(12345);
SELECT pg_advisory_unlock(12345);

-- Cấp transaction: TỰ ĐỘNG trả khi COMMIT/ROLLBACK  ← nên dùng cái này
SELECT pg_advisory_xact_lock(12345);

-- Không chờ, trả về true/false
SELECT pg_try_advisory_lock(12345);

-- Hai số nguyên 32 bit thay vì một số 64 bit (tiện phân nhóm)
SELECT pg_advisory_xact_lock(1001, 42);   -- (loại tài nguyên, id)
```

Ba mẫu dùng thực tế:

```sql
-- MẪU 1: đảm bảo chỉ MỘT instance chạy job định kỳ
--         (thay cho Redis lock, không cần thêm hạ tầng)
SELECT pg_try_advisory_lock(hashtext('job_tong_hop_hang_ngay'));
-- → true: tôi được chạy;  false: instance khác đang chạy, bỏ qua

-- MẪU 2: khoá theo nghiệp vụ mà không có dòng để khoá
--         "chỉ một người được xử lý đơn hàng của user 42 tại một thời điểm"
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('user_orders'), 42);
-- ... xử lý phức tạp nhiều bảng ...
COMMIT;   -- khoá tự trả

-- MẪU 3: serialize migration khi nhiều pod cùng khởi động
SELECT pg_advisory_lock(hashtext('schema_migration'));
-- ... chạy migration ...
SELECT pg_advisory_unlock(hashtext('schema_migration'));
```

```text
   ⚠ BA CÁI BẪY CỦA ADVISORY LOCK

   1. PgBouncer ở chế độ TRANSACTION làm hỏng advisory lock CẤP PHIÊN.
      Kết nối bạn dùng ở câu lệnh sau có thể là kết nối KHÁC.
      → chỉ dùng pg_advisory_XACT_lock khi đi qua pooler
        ([phase-8 bài 3](../phase-8/03-connection-pooling.md))

   2. KHÔNG có dò deadlock giữa advisory lock và khoá thường?
      SAI — CÓ dò. Advisory lock nằm ở tầng 1, tham gia đồ thị chờ đầy đủ.
      Vẫn phải khoá theo thứ tự nhất quán.

   3. hashtext() có thể ĐỤNG ĐỘ. Hai chuỗi khác nhau ra cùng một số.
      → với hệ thống lớn, tự quản lý không gian id (ví dụ: 1000-1999 cho
        loại A, 2000-2999 cho loại B) thay vì băm chuỗi tuỳ tiện.
```

---

## Dò deadlock — thuật toán thật

```text
   BƯỚC 1 — CHỜ ĐÃ
     Phiên bị chặn NGỦ deadlock_timeout (mặc định 1 giây).
     Phần lớn việc chờ là chờ bình thường, dò vòng tốn CPU → không dò vội.

   BƯỚC 2 — DỰNG ĐỒ THỊ CHỜ
     Hết 1 giây mà chưa được, phiên đó tự chạy DeadLockCheck:
     duyệt toàn bộ hàng đợi khoá, dựng đồ thị "ai chờ ai".

          ┌───┐  chờ   ┌───┐
          │ A │ ─────▶ │ B │
          └───┘        └───┘
            ▲            │
            └────────────┘  chờ      → CÓ VÒNG

   BƯỚC 3 — THỬ SẮP XẾP LẠI (soft edge)
     Một số cạnh là "mềm": phiên chỉ đang XẾP HÀNG chứ chưa giữ khoá.
     PostgreSQL thử đổi thứ tự hàng đợi để phá vòng mà KHÔNG giết ai.
     → đây là lý do không phải mọi vòng chờ đều thành lỗi deadlock.

   BƯỚC 4 — GIẾT VẬT TẾ
     Không sắp xếp được thì phiên PHÁT HIỆN RA VÒNG tự huỷ chính nó:
     ERROR: deadlock detected  (SQLSTATE 40P01)
```

Khác biệt với MySQL InnoDB (nhắc lại từ [phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md)):

| | PostgreSQL | MySQL InnoDB |
|---|---|---|
| Thời điểm dò | Sau `deadlock_timeout` (1s) | **Ngay lập tức** khi phát hiện chờ vòng |
| Chọn nạn nhân | Phiên **phát hiện** ra vòng | Phiên đã làm **ít việc nhất** |
| Có thử sắp xếp lại không | **Có** (soft edge) | Không |
| Chi phí mỗi deadlock | Ít nhất 1 giây treo | Gần như tức thì |

Bật ghi log để phân tích:

```sql
ALTER SYSTEM SET log_lock_waits = on;              -- ghi log khi chờ > deadlock_timeout
ALTER SYSTEM SET deadlock_timeout = '1s';
ALTER SYSTEM SET log_min_duration_statement = '1s';
SELECT pg_reload_conf();
```

```text
LOG:  process 28471 still waiting for ShareLock on transaction 784512 after 1000.183 ms
DETAIL:  Process holding the lock: 28455. Wait queue: 28471, 28492, 28510.
CONTEXT:  while updating tuple (14,3) in relation "seats"
STATEMENT:  UPDATE seats SET is_booked = true WHERE id = 14
```

Dòng `Wait queue:` cho bạn thấy toàn bộ hàng đợi — cực kỳ hữu ích khi điều tra sự cố dây chuyền.

---

## Bộ truy vấn chẩn đoán khoá

### Ai đang chặn ai (dùng ngay khi có sự cố)

```sql
SELECT
  bi_chan.pid              AS pid_bi_chan,
  bi_chan.usename          AS user_bi_chan,
  left(bi_chan.query, 50)  AS lenh_bi_chan,
  bi_chan.wait_event_type || ':' || bi_chan.wait_event AS dang_cho,
  now() - bi_chan.query_start AS cho_bao_lau,
  ke_chan.pid              AS pid_ke_chan,
  ke_chan.state            AS trang_thai_ke_chan,
  left(ke_chan.query, 50)  AS lenh_ke_chan,
  now() - ke_chan.xact_start AS tx_ke_chan_mo_bao_lau
FROM pg_stat_activity bi_chan
JOIN LATERAL unnest(pg_blocking_pids(bi_chan.pid)) AS blocking(pid) ON true
JOIN pg_stat_activity ke_chan ON ke_chan.pid = blocking.pid
WHERE cardinality(pg_blocking_pids(bi_chan.pid)) > 0
ORDER BY cho_bao_lau DESC;
```

### Cây chặn nhiều tầng

```sql
WITH RECURSIVE cay AS (
  SELECT pid, pg_blocking_pids(pid) AS chan_boi, 1 AS tang, pid::text AS duong_di
  FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid)) = 0
    AND pid IN (SELECT unnest(pg_blocking_pids(pid)) FROM pg_stat_activity)
  UNION ALL
  SELECT a.pid, pg_blocking_pids(a.pid), c.tang + 1, c.duong_di || ' → ' || a.pid
  FROM pg_stat_activity a JOIN cay c ON c.pid = ANY(pg_blocking_pids(a.pid))
  WHERE c.tang < 10
)
SELECT tang, duong_di, left(query, 60) AS cau_lenh
FROM cay JOIN pg_stat_activity USING (pid) ORDER BY tang, pid;
```

```text
 tang |        duong_di         |               cau_lenh
------+-------------------------+----------------------------------------
    1 | 28455                   | (idle in transaction)          ◀ GỐC RỄ
    2 | 28455 → 28471           | ALTER TABLE orders ADD COLUMN...
    3 | 28455 → 28471 → 28492   | SELECT * FROM orders WHERE ...
    3 | 28455 → 28471 → 28510   | SELECT count(*) FROM orders
```

Đọc cây này: giết `28455` là giải phóng toàn bộ. Giết `28492` thì vô ích.

### Toàn cảnh khoá trên một bảng

```sql
SELECT l.pid, l.locktype, l.mode, l.granted,
       l.relation::regclass AS bang,
       l.transactionid, l.virtualtransaction,
       a.state, left(a.query, 40) AS cau_lenh
FROM pg_locks l LEFT JOIN pg_stat_activity a USING (pid)
WHERE l.relation = 'orders'::regclass OR l.locktype IN ('transactionid','tuple')
ORDER BY l.granted, l.pid;
```

```text
  pid  |   locktype    |        mode         | granted |  bang  |   state
-------+---------------+---------------------+---------+--------+------------
 28455 | relation      | AccessShareLock     | t       | orders | idle in tx
 28455 | transactionid | ExclusiveLock       | t       |        | idle in tx
 28471 | relation      | AccessExclusiveLock | f       | orders | active     ◀ CHỜ
 28492 | relation      | AccessShareLock     | f       | orders | active     ◀ CHỜ
```

Cột `granted = f` là toàn bộ câu chuyện: ai đang chờ, chờ cái gì.

### Giết đúng người

```sql
-- Nhẹ: huỷ câu lệnh, giữ kết nối
SELECT pg_cancel_backend(28455);

-- Nặng: đóng hẳn kết nối (dùng khi idle in transaction)
SELECT pg_terminate_backend(28455);

-- Dọn hàng loạt các phiên treo trong transaction quá 10 phút
SELECT pid, pg_terminate_backend(pid), left(query, 40)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND now() - state_change > interval '10 min';
```

---

## DDL an toàn — bảng tra cứu

Mode khoá và việc phải viết lại bảng của các lệnh hay dùng:

| Lệnh | Mode | Viết lại bảng? | An toàn cho production? |
|---|---|---|---|
| `ADD COLUMN` (không default) | AE | Không | ✔ nếu có `lock_timeout` |
| `ADD COLUMN ... DEFAULT <hằng>` | AE | **Không** (PG11+) | ✔ nếu có `lock_timeout` |
| `ADD COLUMN ... DEFAULT random()` | AE | **CÓ** — cả bảng | ✘ thêm cột rồi `UPDATE` theo lô |
| `DROP COLUMN` | AE | Không (chỉ ẩn đi) | ✔ nhưng chỗ không được trả lại tới khi `pg_repack` |
| `ALTER COLUMN TYPE varchar(50)→varchar(100)` | AE | Không (PG9.2+) | ✔ |
| `ALTER COLUMN TYPE int → bigint` | AE | **CÓ** | ✘ dùng cột mới + backfill + đổi tên |
| `SET NOT NULL` | AE | Không, nhưng **quét cả bảng** | ⚠ thêm `CHECK (x IS NOT NULL) NOT VALID` → `VALIDATE` → `SET NOT NULL` |
| `ADD FOREIGN KEY` | SRE trên cả hai bảng | Không, nhưng **quét cả bảng** | ⚠ dùng `NOT VALID` rồi `VALIDATE CONSTRAINT` |
| `ADD CHECK` | AE | Không, nhưng **quét cả bảng** | ⚠ `NOT VALID` rồi `VALIDATE` |
| `CREATE INDEX` | **S** — chặn mọi lệnh ghi | Không | ✘ dùng `CONCURRENTLY` |
| `CREATE INDEX CONCURRENTLY` | SUE | Không | ✔ (quét 2 lượt, chậm hơn, có thể để lại index `INVALID`) |
| `DROP INDEX` | AE | Không | ⚠ dùng `DROP INDEX CONCURRENTLY` |
| `REINDEX` | AE | Có | ✘ dùng `REINDEX CONCURRENTLY` (PG12+) |
| `TRUNCATE` | AE | — | ⚠ nhanh nhưng chặn tất cả |
| `ADD COLUMN ... GENERATED ALWAYS AS IDENTITY` | AE | **CÓ** | ✘ |

Mẫu chuẩn cho ba việc nguy hiểm nhất:

```sql
-- 1. Thêm NOT NULL mà không quét chặn
ALTER TABLE orders ADD CONSTRAINT orders_note_nn
      CHECK (note IS NOT NULL) NOT VALID;      -- nhanh, chỉ AE khoảnh khắc
ALTER TABLE orders VALIDATE CONSTRAINT orders_note_nn;  -- SUE, không chặn ghi
ALTER TABLE orders ALTER COLUMN note SET NOT NULL;      -- PG12+ dùng CHECK, không quét
ALTER TABLE orders DROP CONSTRAINT orders_note_nn;

-- 2. Thêm khoá ngoại không chặn
ALTER TABLE orders ADD CONSTRAINT fk_user
      FOREIGN KEY (user_id) REFERENCES users(id) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT fk_user;   -- chỉ SHARE UPDATE EXCLUSIVE

-- 3. Đổi int → bigint không dừng dịch vụ
ALTER TABLE orders ADD COLUMN id_new BIGINT;      -- nhanh
-- backfill theo lô + trigger đồng bộ, rồi đổi tên trong một transaction ngắn
```

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Chạy DDL không có `lock_timeout` | Một truy vấn dài + `ALTER` = cả hệ thống xếp hàng | Luôn `SET LOCAL lock_timeout = '3s'` + vòng lặp thử lại |
| Nghĩ `SELECT` không bao giờ bị chặn | Nó bị chặn bởi `ACCESS EXCLUSIVE` — và bởi cả `AE` **đang chờ** | Hiểu quy tắc hàng đợi FIFO không vượt mặt |
| Tìm khoá dòng trong `pg_locks` | Khoá dòng nằm **trong tuple**, không có ở đó | Tìm `locktype = 'transactionid', granted = false` |
| Giết nhầm phiên (giết nạn nhân thay vì thủ phạm) | Sự cố không hết | Dùng truy vấn **cây chặn** để tìm gốc rễ |
| Nhiều partition + pruning hỏng | `out of shared memory` | Sửa pruning trước; rồi mới tăng `max_locks_per_transaction` |
| `pg_advisory_lock` cấp phiên qua PgBouncer transaction mode | Khoá trả nhầm kết nối, hoặc không bao giờ trả | Chỉ dùng `pg_advisory_xact_lock` |
| Nhiều `INSERT` con trỏ tới một dòng cha nóng | MultiXact phình, mọi `UPDATE` dòng cha chặn tất cả | Tránh dòng cha "vạn năng"; xem lại thiết kế khoá ngoại |
| Chỉ nhìn `pg_locks` khi chẩn đoán chậm | LWLock **không có** trong `pg_locks` | Xem `pg_stat_activity.wait_event_type/wait_event` |
| `CREATE INDEX` (không `CONCURRENTLY`) trên production | Chặn **mọi lệnh ghi** suốt thời gian xây | Luôn `CONCURRENTLY`, và kiểm tra `indisvalid` sau đó |

---

## Tóm tắt bài 7

- **PostgreSQL có năm hệ thống khoá độc lập**, không phải một: heavyweight (tới hết transaction, thấy trong `pg_locks`), khoá dòng (ghi trong tuple), predicate lock (SSI), LWLock (micro-giây, chỉ thấy qua `wait_event`), spinlock (nano-giây).
- **Khoá dòng không tốn bộ nhớ chung** vì nó ghi thẳng vào `xmax` + `t_infomask` của tuple. Đó là lý do PostgreSQL không cần "leo thang khoá" như SQL Server — nó đổi **bộ nhớ** lấy **I/O ghi**.
- **Chờ khoá dòng thực chất là chờ `transactionid`**: người chờ xin `ShareLock` trên **XID của người giữ**. Vì thế `pg_locks` không có dòng nào nói "đang chờ dòng số 42".
- **Khoá `tuple` tồn tại để xếp hàng công bằng** — chỉ một phiên được đứng đầu hàng cho một dòng, tránh 50 phiên cùng tỉnh dậy tranh nhau.
- **Hàng đợi khoá là FIFO và không cho vượt mặt.** Một `ALTER TABLE` chờ phía sau truy vấn dài sẽ **chặn mọi `SELECT` đến sau nó** — đây là cơ chế đằng sau hầu hết sự cố "cả hệ thống đứng vì một lệnh DDL 5 mili-giây".
- **`SELECT` chỉ bị chặn bởi đúng một mode: `ACCESS EXCLUSIVE`.** Mọi sự cố treo truy vấn đọc đều quy về ai đó đang giữ hoặc đang **chờ** mode đó.
- **`out of shared memory` thường là do bảng phân mảnh**: partition pruning hỏng khiến một truy vấn khoá hàng nghìn đối tượng. Sửa pruning trước khi tăng `max_locks_per_transaction`.
- **`INSERT` vào bảng con lấy `FOR KEY SHARE` trên dòng cha.** Nhiều con trỏ tới một dòng cha nóng sinh **MultiXact** và biến mọi `UPDATE` dòng cha thành điểm chặn toàn cục.
- **`SKIP LOCKED` biến bảng thường thành hàng đợi công việc song song thật sự** — 10 worker chạy đồng thời không ai chờ ai, đủ tốt để nhiều hệ thống bỏ hẳn message broker.
- **LWLock không xuất hiện trong `pg_locks`.** Khi database chậm mà không truy vấn nào chậm, hãy nhìn `pg_stat_activity.wait_event` — `WALWrite`, `lock_manager`, `SubtransSLRU`, `buffer_mapping` đều dẫn tới nguyên nhân khác nhau.
- **Dò deadlock chỉ chạy sau 1 giây** và có bước **thử sắp xếp lại hàng đợi** trước khi giết ai — nên không phải mọi vòng chờ đều thành lỗi.
- **Mọi DDL production phải có `lock_timeout` và vòng lặp thử lại.** Thà thất bại nhanh mười lần còn hơn làm đứng hệ thống một lần.

**Bài kế tiếp** → [Bài 8: SERIALIZABLE và Serializable Snapshot Isolation](08-serializable-snapshot-isolation.md) — mức isolation duy nhất chặn được write skew, và nó làm điều đó **mà không khoá gì cả**.

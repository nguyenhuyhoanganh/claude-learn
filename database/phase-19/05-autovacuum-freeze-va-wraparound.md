# Bài 5: Autovacuum, Freeze và Transaction ID Wraparound

Có một thông báo lỗi mà không kỹ sư PostgreSQL nào muốn thấy:

```text
ERROR:  database is not accepting commands to avoid wraparound data loss in database "appdb"
HINT:  Stop the postmaster and vacuum that database in single-user mode.
```

Database vẫn chạy. Đĩa vẫn còn. Không có gì hỏng. Nhưng **mọi lệnh ghi đều bị từ chối**, và cách duy nhất ra khỏi tình trạng đó là dừng dịch vụ. Vài công ty lớn đã viết postmortem về đúng sự cố này.

Nguyên nhân luôn giống nhau: `VACUUM` đã không chạy được, trong nhiều tuần, mà không ai để ý.

Bài này nói về hệ thống lẽ ra phải ngăn chuyện đó — **autovacuum** — vì sao mặc định của nó không hợp với bảng lớn, cơ chế **freeze** chống wraparound, và bốn thứ có thể chặn tất cả.

## Autovacuum — ai gọi, khi nào

```text
   ┌──── AUTOVACUUM LAUNCHER (một tiến trình, luôn chạy) ────┐
   │  Cứ mỗi autovacuum_naptime / (số database)              │
   │  → chọn database tiếp theo → sinh một WORKER            │
   │  (naptime = 1 phút, 5 database → 12 giây một lượt)      │
   └───────────────────────┬─────────────────────────────────┘
                           ▼
   ┌──── AUTOVACUUM WORKER (tối đa autovacuum_max_workers = 3) ────┐
   │  1. Đọc thống kê mọi bảng trong database                      │
   │  2. Tính ngưỡng cho từng bảng                                 │
   │  3. Lập danh sách bảng vượt ngưỡng                            │
   │  4. Vacuum/analyze lần lượt từng bảng                         │
   │  5. Kết thúc                                                  │
   └───────────────────────────────────────────────────────────────┘
```

Ba tính chất định hình mọi hành vi của nó:

| Tính chất | Hệ quả |
|---|---|
| **Một bảng chỉ có một worker** | Bảng 500 GB được xử lý bởi đúng một tiến trình, không chia nhỏ |
| **Danh sách bảng chốt lúc worker khởi động** | Bảng vượt ngưỡng sau đó phải chờ lượt sau |
| **Tối đa 3 worker cùng lúc (mặc định)** | 10 bảng lớn cùng cần vacuum → 7 bảng xếp hàng |

Vì thế trên hệ thống nhiều bảng lớn, `autovacuum_max_workers = 3` là quá ít — nhưng nhớ điều đã học ở [bài 4](04-vacuum-co-che-day-du.md): **tăng worker phải tăng cả `cost_limit`**, nếu không chỉ là chia nhỏ cùng một ngân sách.

---

## Công thức ngưỡng — và vì sao nó sai với bảng lớn

```text
   NGƯỠNG VACUUM
   ═════════════
   ngưỡng = autovacuum_vacuum_threshold      (mặc định 50)
          + autovacuum_vacuum_scale_factor   (mặc định 0.2 = 20%)
          × reltuples

   → vacuum khi:  n_dead_tup > ngưỡng


   NGƯỠNG ANALYZE
   ══════════════
   ngưỡng = autovacuum_analyze_threshold     (mặc định 50)
          + autovacuum_analyze_scale_factor  (mặc định 0.1 = 10%)
          × reltuples


   NGƯỠNG INSERT  (PostgreSQL 13+ — cho bảng chỉ thêm)
   ═══════════════════════════════════════════════════
   ngưỡng = autovacuum_vacuum_insert_threshold    (mặc định 1000)
          + autovacuum_vacuum_insert_scale_factor (mặc định 0.2)
          × reltuples
```

Bây giờ thay số vào và nhìn con số 20% có nghĩa gì:

| Số dòng của bảng | Ngưỡng mặc định | Bảng phình bao nhiêu trước khi được dọn |
|---|---|---|
| 1.000 | 250 xác | ~30 KB — không sao |
| 100.000 | 20.050 xác | ~3 MB — không sao |
| 10 triệu | **2.000.050 xác** | ~300 MB |
| 100 triệu | **20.000.050 xác** | **~3 GB** ⚠ |
| 1 tỉ | **200.000.050 xác** | **~30 GB** ⚠⚠ |

```text
   VẤN ĐỀ CỦA TỈ LỆ CỐ ĐỊNH

   n_dead_tup
      ▲
      │                                    ╱ ngưỡng 20% (tăng tuyến tính)
      │                              ╱
   3GB┤                        ╱ ◀── bảng phải phình tới ĐÂY mới được dọn
      │                  ╱
      │            ╱
      │      ╱
      └──────────────────────────────────────▶ kích thước bảng

   Bảng càng lớn, autovacuum càng "kiên nhẫn" — đúng ngược với thứ ta muốn.
```

**Cách chữa: đặt riêng cho từng bảng lớn.**

```sql
-- Bảng lớn, ghi nhiều
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor  = 0.01,   -- 1% thay vì 20%
  autovacuum_vacuum_threshold     = 1000,
  autovacuum_analyze_scale_factor = 0.005,  -- thống kê tươi hơn
  autovacuum_vacuum_cost_delay    = 0       -- không hãm cho riêng bảng này
);

-- Bảng hàng đợi (nhỏ nhưng ghi/xoá cực nhiều)
ALTER TABLE job_queue SET (
  autovacuum_vacuum_scale_factor = 0.0,     -- bỏ hẳn phần tỉ lệ
  autovacuum_vacuum_threshold    = 500      -- cứ 500 xác là dọn
);

-- Xem cài đặt riêng của một bảng
SELECT relname, reloptions FROM pg_class WHERE relname = 'orders';
```

Một chiến lược đơn giản và hiệu quả cho toàn cụm: **đặt `scale_factor` toàn cục về 0 và dùng ngưỡng tuyệt đối** cho các bảng lớn, thay vì để tỉ lệ.

### Bảng chỉ thêm — vấn đề bị bỏ quên suốt nhiều năm

Trước PostgreSQL 13, một bảng chỉ `INSERT` (log, sự kiện, số đo) **không bao giờ** kích hoạt autovacuum, vì `n_dead_tup` luôn bằng 0.

```text
   Bảng events: 500 triệu dòng, chỉ INSERT, không UPDATE/DELETE

   TRƯỚC PG13:
     n_dead_tup = 0 → không bao giờ vượt ngưỡng → KHÔNG BAO GIỜ vacuum
       → bit visibility map không bao giờ được bật → Index Only Scan vô dụng
       → tuple không bao giờ được đóng băng
       → cho tới ngày autovacuum_freeze_max_age ép chạy
       → và lúc đó nó phải quét TOÀN BỘ 500 triệu dòng một lần    ⚠

   PG13+: ngưỡng insert giải quyết chuyện này.
```

Nếu bạn đang chạy bản cũ hơn 13, phải tự lên lịch `VACUUM` cho các bảng chỉ thêm.

### Kiểm tra bảng nào đang quá hạn

```sql
WITH cd AS (
  SELECT (SELECT setting::float FROM pg_settings
          WHERE name = 'autovacuum_vacuum_threshold')    AS nguong,
         (SELECT setting::float FROM pg_settings
          WHERE name = 'autovacuum_vacuum_scale_factor') AS ty_le
)
SELECT s.relname,
       s.n_live_tup, s.n_dead_tup,
       (cd.nguong + cd.ty_le * c.reltuples)::bigint AS nguong_kich_hoat,
       round(100.0 * s.n_dead_tup /
             NULLIF(cd.nguong + cd.ty_le * c.reltuples, 0), 0) AS pct_toi_nguong,
       s.last_autovacuum
FROM pg_stat_user_tables s
JOIN pg_class c ON c.oid = s.relid
CROSS JOIN cd
WHERE s.n_dead_tup > 1000
ORDER BY pct_toi_nguong DESC NULLS LAST
LIMIT 15;
```

```text
    relname   | n_live_tup | n_dead_tup | nguong_kich_hoat | pct_toi_nguong | last_autovacuum
--------------+------------+------------+------------------+----------------+------------------
 orders       |   48291022 |   18492011 |          9658254 |            191 | 2026-08-03 04:12
 sessions     |     129048 |     412882 |            25859 |           1596 | (null)
```

`pct_toi_nguong` > 100 mà `last_autovacuum` cũ hoặc `null` nghĩa là autovacuum **đang không theo kịp hoặc đang bị chặn**. Đây là truy vấn nên gắn vào hệ thống giám sát.

---

## Freeze — vì sao phải đóng băng

Nhắc lại từ [bài 2](02-transaction-id-snapshot-va-quy-tac-nhin-thay.md): XID là số 32 bit so sánh **theo vòng tròn**, mỗi lúc chỉ nhìn được nửa vòng (2³¹ ≈ 2,1 tỉ).

```text
   TUPLE CŨ có xmin = 1.000
   BỘ ĐẾM hiện tại  = 2.200.000.000

   So sánh vòng tròn:  2.200.000.000 − 1.000  >  2³¹
   → PostgreSQL kết luận: "xmin = 1.000 nằm ở TƯƠNG LAI"
   → tuple đó chưa sinh ra với tôi
   → DỮ LIỆU BIẾN MẤT (dù byte vẫn nằm nguyên trên đĩa)        ⚠⚠⚠
```

**Freeze** là cách chống: đánh dấu tuple đủ cũ là "cũ hơn mọi thứ, khỏi so sánh nữa".

```text
   CÁCH LÀM (từ PostgreSQL 9.4 trở đi)

   TRƯỚC freeze:  xmin = 784.512   infomask = 0x0100 (XMIN_COMMITTED)
   SAU   freeze:  xmin = 784.512   infomask = 0x0300 (XMIN_FROZEN)
                        ▲                      ▲▲▲▲▲▲
                  GIỮ NGUYÊN               cờ nói "luôn nhìn thấy"

   (Bản rất cũ ghi đè xmin = 2 = FrozenTransactionId, làm mất
    thông tin gỡ lỗi. Cách mới giữ lại giá trị gốc.)
```

Sau khi đóng băng một page, `VACUUM` nâng **`relfrozenxid`** của bảng — mốc "mọi tuple cũ hơn mốc này đều đã đóng băng". Giá trị nhỏ nhất trong toàn database thành **`datfrozenxid`**.

### Bốn tham số điều khiển freeze

```text
   TRỤC TUỔI XID  (age = XID hiện tại − xmin của tuple)
   0 ─────────────────────────────────────────────────────────▶ 2,1 tỉ
        │            │                    │              │
       50tr        150tr                200tr          1,6 tỉ
        │            │                    │              │
        ▼            ▼                    ▼              ▼
   ┌─────────┬──────────────┬──────────────────┬───────────────────┐
   │vacuum_  │vacuum_freeze_│autovacuum_freeze_│vacuum_failsafe_age│
   │freeze_  │table_age     │max_age           │                   │
   │min_age  │              │                  │                   │
   ├─────────┼──────────────┼──────────────────┼───────────────────┤
   │Vacuum   │Vacuum kế     │ÉP chạy vacuum    │CHẾ ĐỘ CỨU HOẢ:    │
   │thường   │tiếp thành    │chống wraparound  │bỏ hãm tốc,        │
   │đóng băng│AGGRESSIVE:   │NGAY CẢ KHI       │bỏ dọn index,      │
   │tuple    │quét cả page  │autovacuum = off  │chỉ lo freeze      │
   │già hơn  │all-visible   │                  │                   │
   │mốc này  │              │                  │                   │
   └─────────┴──────────────┴──────────────────┴───────────────────┘
```

| Tham số | Mặc định | Vai trò |
|---|---|---|
| `vacuum_freeze_min_age` | 50 triệu | Tuổi tối thiểu để một tuple được đóng băng |
| `vacuum_freeze_table_age` | 150 triệu | Từ tuổi này, vacuum chuyển sang **quyết liệt** |
| `autovacuum_freeze_max_age` | 200 triệu | **Ép** chạy vacuum chống wraparound, không thể tắt |
| `vacuum_failsafe_age` | 1,6 tỉ | Chế độ cứu hoả (PG14+): bỏ mọi thứ trừ freeze |

Khác biệt giữa vacuum **thường** và vacuum **quyết liệt** (nhắc lại từ [bài 3](03-visibility-map-fsm-va-hot.md)):

```text
   VACUUM THƯỜNG      : bỏ qua page có bit all-visible → nhanh
   VACUUM QUYẾT LIỆT  : chỉ bỏ qua page có bit all-FROZEN → chậm hơn nhiều
   → bảng lưu trữ đã freeze xong: quyết liệt cũng chỉ vài giây
   → bảng chưa bao giờ freeze: quyết liệt = quét toàn bộ, hàng giờ
```

---

## Bốn nấc thang tới thảm hoạ

```text
   TUỔI datfrozenxid                TRẠNG THÁI HỆ THỐNG
   ═════════════════                ═══════════════════

   0 ─ 200 triệu        ✔ BÌNH THƯỜNG
                          autovacuum thường xử lý

   200tr ─ 1,6 tỉ       ⚡ VACUUM CHỐNG WRAPAROUND ĐANG CHẠY
                          • xuất hiện trong pg_stat_activity với chữ
                            "(to prevent wraparound)"
                          • KHÔNG tự nhường khi chặn lệnh khác     ⚠
                            (autovacuum thường thì có nhường)
                          • DDL của bạn sẽ treo sau nó

   1,6 tỉ ─ 2,1 tỉ      🔥 CHẾ ĐỘ CỨU HOẢ (failsafe)
                          • bỏ cost delay, bỏ dọn index
                          • log đầy cảnh báo:
                            "database must be vacuumed within N transactions"

   ~2,1 tỉ (còn ~3tr)   ⛔ DỪNG NHẬN LỆNH GHI
                          ERROR: database is not accepting commands
                          to avoid wraparound data loss
                          → chỉ đọc được. Ứng dụng chết.
```

### Xử lý khi đã tới nấc thứ tư

```sql
-- 1. XÁC ĐỊNH bảng nào giữ mốc cũ nhất
SELECT c.oid::regclass AS bang,
       age(c.relfrozenxid) AS tuoi,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS kich_thuoc
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r', 'm', 't')
ORDER BY age(c.relfrozenxid) DESC
LIMIT 10;
```

```sql
-- 2. DỌN NGUYÊN NHÂN TRƯỚC — nếu không, vacuum sẽ lại vô dụng
--    (transaction dài, replication slot chết, prepared transaction)
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
WHERE state = 'idle in transaction' AND now() - xact_start > interval '1 hour';

SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots
WHERE NOT active;                       -- kiểm tra kỹ trước khi xoá!

ROLLBACK PREPARED 'gid_bi_bo_quen';
```

```sql
-- 3. FREEZE GẤP, ưu tiên tốc độ hơn mọi thứ khác
SET maintenance_work_mem = '2GB';
SET vacuum_cost_delay = 0;
VACUUM (FREEZE, INDEX_CLEANUP OFF, VERBOSE) bang_gia_nhat;
```

Từ PostgreSQL 14, cơ chế failsafe khiến chuyện phải vào **single-user mode** hầu như không còn xảy ra nữa. Nếu vẫn phải:

```bash
# Dừng postgres trước
postgres --single -D /var/lib/postgresql/data appdb
# rồi trong dấu nhắc:
backend> VACUUM (FREEZE) bang_gia_nhat;
```

> **Điều quan trọng nhất về wraparound:** nó **không bao giờ là sự cố đột ngột**. Nó luôn là hệ quả của nhiều tuần vacuum bị chặn mà không ai theo dõi. Một câu truy vấn giám sát duy nhất là đủ để nó không bao giờ xảy ra.

---

## MultiXact wraparound — bộ đếm thứ hai ít ai biết

Có **hai** bộ đếm có thể tràn, không phải một.

Khi **nhiều** transaction cùng khoá chia sẻ một dòng, `xmax` không chứa nổi nhiều XID. PostgreSQL tạo một **MultiXactId** — một mã trỏ tới danh sách các transaction đó, lưu trong `pg_multixact/`:

```text
   MỘT transaction khoá dòng:
       xmax = 784512          (XID thường)

   BA transaction cùng FOR SHARE trên một dòng:
       xmax = 42              (MultiXactId!)   + cờ HEAP_XMAX_IS_MULTI
                │
                └──▶ pg_multixact/members: [784512, 784519, 784530]
```

MultiXactId cũng là số 32 bit và **cũng tràn được**:

```sql
SELECT datname,
       age(datfrozenxid)          AS tuoi_xid,
       mxid_age(datminmxid)       AS tuoi_multixact
FROM pg_database ORDER BY 3 DESC;
```

```text
 datname |  tuoi_xid | tuoi_multixact
---------+-----------+----------------
 appdb   | 182004881 |      398210448    ⚠ sắp chạm 400 triệu
```

| Tham số | Mặc định | Ghi chú |
|---|---|---|
| `autovacuum_multixact_freeze_max_age` | 400 triệu | Ép vacuum chống multixact wraparound |
| `vacuum_multixact_freeze_min_age` | 5 triệu | Tuổi tối thiểu để đóng băng multixact |
| `vacuum_multixact_freeze_table_age` | 150 triệu | Ngưỡng chuyển sang quyết liệt |

Ngoài ra vùng `pg_multixact/members` có **giới hạn dung lượng riêng** và có thể đầy trước cả khi bộ đếm tràn:

```text
ERROR:  multixact "members" limit exceeded
HINT:  Execute a database-wide VACUUM in that database with reduced
       vacuum_multixact_freeze_min_age and vacuum_multixact_freeze_table_age
```

Ai sinh nhiều MultiXact? **Khoá ngoại**. Mỗi `INSERT` vào bảng con lấy `FOR KEY SHARE` trên dòng cha ([phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md)). Một dòng cha "nóng" có hàng nghìn con sẽ sinh MultiXact liên tục.

```text
   Bảng users (cha) — hàng orders (con) trỏ tới user_id = 1 (tài khoản hệ thống)
   → mỗi INSERT order lấy FOR KEY SHARE trên users(id=1)
   → nhiều transaction cùng lúc → MultiXact mới mỗi lần
   → bộ đếm multixact chạy nhanh hơn cả bộ đếm XID           ⚠
```

Đây là lý do nên giám sát **cả hai** con số, không chỉ `age(datfrozenxid)`.

---

## Bốn thứ chặn `VACUUM` — và cách gỡ từng cái

Đây là nội dung quan trọng nhất của bài. Mọi sự cố bloat và wraparound đều quy về một trong bốn thứ này.

```text
   xmin horizon = MIN của bốn nguồn:

   ┌────────────────────────────────────────────────────────────────┐
   │ 1  TRANSACTION ĐANG MỞ trên chính máy này                      │
   │ 2  KHE NHÂN BẢN (replication slot) không hoạt động             │
   │ 3  PREPARED TRANSACTION bị bỏ quên                             │
   │ 4  REPLICA gửi hot_standby_feedback với truy vấn dài           │
   └────────────────────────────────────────────────────────────────┘

   Chỉ cần MỘT cái bị kẹt → VACUUM dọn được 0 tuple
   → trên TOÀN BỘ database, kể cả bảng không liên quan
```

### 1. Transaction đang mở

```sql
SELECT pid, usename, application_name, state,
       now() - xact_start AS mo_bao_lau,
       age(backend_xmin)  AS giu_bao_nhieu_xid,
       left(query, 60)    AS cau_lenh
FROM pg_stat_activity
WHERE backend_xmin IS NOT NULL
ORDER BY age(backend_xmin) DESC LIMIT 10;
```

**Gỡ:**

```sql
SELECT pg_terminate_backend(21874);          -- xử lý ngay

ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';   -- phòng ngừa
ALTER SYSTEM SET statement_timeout = '120s';
SELECT pg_reload_conf();
```

**Nguồn phổ biến nhất trong ứng dụng thật:**

```text
   ✘ ORM mở transaction lúc đầu request và giữ tới cuối,
     kể cả trong lúc gọi API bên ngoài
   ✘ Job báo cáo/ETL chạy hàng giờ trong một transaction
   ✘ Connection pool (PgBouncer session mode) giữ transaction dở
   ✘ Người ngồi debug: mở psql, gõ BEGIN, rồi đi ăn trưa
```

### 2. Khe nhân bản không hoạt động

Đây là thủ phạm **âm thầm nhất**, vì nó không xuất hiện trong `pg_stat_activity`.

```sql
SELECT slot_name, slot_type, active,
       age(xmin)         AS giu_xid,
       age(catalog_xmin) AS giu_xid_catalog,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_ton
FROM pg_replication_slots
ORDER BY age(xmin) DESC NULLS LAST;
```

```text
  slot_name   | slot_type | active | giu_xid | giu_xid_catalog | wal_ton
--------------+-----------+--------+---------+-----------------+---------
 debezium_cdc | logical   | f      |         |       284918022 | 412 GB   ⚠⚠
 replica_2    | physical  | t      |    1284 |                 | 18 MB
```

Dòng đầu là một quả bom kép: khe CDC của Debezium đã chết từ lâu, giữ 284 triệu XID **và** 412 GB WAL. Cả bloat lẫn đầy đĩa đang chờ.

**Gỡ:**

```sql
-- Sau khi chắc chắn consumer đã bỏ, không định quay lại
SELECT pg_drop_replication_slot('debezium_cdc');

-- Phòng ngừa: giới hạn WAL giữ lại cho slot (PG13+)
ALTER SYSTEM SET max_slot_wal_keep_size = '100GB';
```

> `max_slot_wal_keep_size` bảo vệ **đĩa** (khe bị vô hiệu hoá khi vượt ngưỡng), nhưng **không** bảo vệ khỏi việc khe giữ `xmin`. Vẫn phải giám sát `age(xmin)` của từng khe.

### 3. Prepared transaction bị bỏ quên

```sql
SELECT gid, prepared, owner, database, age(transaction) AS giu_xid
FROM pg_prepared_xacts ORDER BY prepared;
```

```text
        gid          |         prepared          | owner |   giu_xid
---------------------+---------------------------+-------+-----------
 tx_order_4482_2pc   | 2026-06-14 03:22:10+07    | app   | 194882014  ⚠
```

Một transaction hai pha được `PREPARE` mà không ai `COMMIT PREPARED` hay `ROLLBACK PREPARED` sẽ **sống mãi qua cả restart**. Đây là hậu quả điển hình của distributed transaction có coordinator chết ([phase-17 bài 4](../phase-17/03-quic-va-distributed-transaction.md)).

**Gỡ:**

```sql
ROLLBACK PREPARED 'tx_order_4482_2pc';

-- Nếu không dùng 2PC thì tắt hẳn để không bao giờ gặp lại
ALTER SYSTEM SET max_prepared_transactions = 0;   -- cần restart
```

### 4. `hot_standby_feedback` từ replica

```sql
-- Chạy trên PRIMARY
SELECT application_name, state, age(backend_xmin) AS replica_giu_xid
FROM pg_stat_replication;
```

```text
 application_name |   state   | replica_giu_xid
------------------+-----------+-----------------
 replica_bao_cao  | streaming |        88192044   ⚠
```

Replica đang chạy một truy vấn báo cáo dài. Với `hot_standby_feedback = on`, nó báo lên primary *"đừng dọn tuple mà tôi còn cần"*.

```text
   ĐÁNH ĐỔI KHÔNG THỂ TRÁNH

   hot_standby_feedback = on
     ✔ truy vấn trên replica không bị huỷ giữa chừng
     ✘ nhưng truy vấn dài trên replica làm PRIMARY phình

   hot_standby_feedback = off
     ✔ primary tự do dọn dẹp
     ✘ replica báo lỗi:
       "canceling statement due to conflict with recovery"

   Không có lựa chọn thứ ba. Chỉ có thể:
     • đặt statement_timeout trên replica, HOẶC
     • tách hẳn replica báo cáo ra khỏi chuỗi nhân bản
       (nhân bản logic, hoặc bản sao độc lập)
```

---

## Bộ giám sát tối thiểu

Bốn truy vấn này nên có trong hệ thống cảnh báo của mọi cụm PostgreSQL:

```sql
-- 1. WRAPAROUND — cảnh báo ở 50%, khẩn cấp ở 80%
SELECT datname,
       age(datfrozenxid) AS tuoi_xid,
       round(100.0 * age(datfrozenxid) / 2000000000, 1) AS pct_xid,
       mxid_age(datminmxid) AS tuoi_mxid,
       round(100.0 * mxid_age(datminmxid) / 4000000000, 1) AS pct_mxid
FROM pg_database
WHERE datallowconn ORDER BY 2 DESC;

-- 2. XMIN HORIZON — cảnh báo nếu > 50 triệu
SELECT max(age(backend_xmin)) AS xid_bi_giu_lau_nhat FROM pg_stat_activity;

-- 3. KHE NHÂN BẢN chết — cảnh báo nếu có bất kỳ dòng nào
SELECT slot_name, active, age(xmin), age(catalog_xmin),
       pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn) AS byte_wal_ton
FROM pg_replication_slots WHERE NOT active;

-- 4. PREPARED TRANSACTION cũ — cảnh báo nếu > 1 giờ
SELECT gid, prepared, age(transaction) FROM pg_prepared_xacts
WHERE prepared < now() - interval '1 hour';
```

Ngưỡng cảnh báo gợi ý:

| Chỉ số | Cảnh báo | Khẩn cấp |
|---|---|---|
| `age(datfrozenxid)` | 1 tỉ (50%) | 1,5 tỉ (75%) |
| `mxid_age(datminmxid)` | 2 tỉ (50%) | 3 tỉ (75%) |
| `max(age(backend_xmin))` | 50 triệu | 500 triệu |
| Khe nhân bản không hoạt động | tồn tại > 1 giờ | tồn tại > 6 giờ |
| Prepared transaction | tồn tại > 1 giờ | tồn tại > 24 giờ |
| `n_dead_tup / n_live_tup` | 20% | 50% |

---

## Cấu hình khởi điểm hợp lý

Cho một máy production tầm trung (16 nhân, 64 GB RAM, SSD NVMe):

```sql
-- Autovacuum tích cực hơn nhiều so với mặc định
ALTER SYSTEM SET autovacuum_max_workers = 6;
ALTER SYSTEM SET autovacuum_vacuum_cost_limit = 2000;   -- ~390 MB/s page bẩn
ALTER SYSTEM SET autovacuum_vacuum_cost_delay = '2ms';
ALTER SYSTEM SET autovacuum_naptime = '15s';
ALTER SYSTEM SET autovacuum_work_mem = '512MB';         -- ×6 worker = 3 GB RAM

-- Ngưỡng toàn cục chặt hơn (các bảng lớn vẫn nên đặt riêng)
ALTER SYSTEM SET autovacuum_vacuum_scale_factor = 0.05;
ALTER SYSTEM SET autovacuum_analyze_scale_factor = 0.02;

-- Freeze sớm và đều thay vì dồn cục
ALTER SYSTEM SET vacuum_freeze_min_age = 20000000;      -- 20tr
ALTER SYSTEM SET autovacuum_freeze_max_age = 400000000; -- 400tr, giãn ra

-- Chặn nguồn gây kẹt horizon
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';
ALTER SYSTEM SET max_slot_wal_keep_size = '64GB';

-- Cho VACUUM thủ công nhiều bộ nhớ
ALTER SYSTEM SET maintenance_work_mem = '1GB';

SELECT pg_reload_conf();
```

Lưu ý về `autovacuum_freeze_max_age = 400000000`: nâng nó lên **giãn thưa** các đợt vacuum chống wraparound (đỡ bị bất ngờ), nhưng đổi lại mỗi đợt sẽ nặng hơn và bạn có ít dư địa hơn khi có sự cố. Chỉ nâng khi đã có giám sát tốt.

> **Một tham số đã biến mất:** `old_snapshot_threshold` (cho phép huỷ transaction quá cũ để giải phóng vacuum) bị **gỡ bỏ ở PostgreSQL 17** vì có lỗi hiếm gây trả về dữ liệu sai. Đừng dựa vào nó.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Để `scale_factor = 0.2` cho bảng 100 triệu dòng | Bảng phải tích 20 triệu xác (~3 GB) mới được dọn | Đặt riêng `0.01` + ngưỡng tuyệt đối cho bảng lớn |
| **Tắt autovacuum** để "giảm tải" | Bom hẹn giờ: wraparound trong vài tuần | Không bao giờ tắt. Muốn giảm tải thì chỉnh `cost_delay` |
| Chỉ giám sát `age(datfrozenxid)` | Bộ đếm MultiXact tràn trước, không ai thấy | Giám sát **cả** `mxid_age(datminmxid)` |
| Tạo replication slot để thử rồi quên | Giữ XID và WAL vô hạn cho tới khi đầy đĩa | Giám sát khe `NOT active`; đặt `max_slot_wal_keep_size` |
| Bật `hot_standby_feedback` mặc định rồi quên | Truy vấn dài trên replica làm primary phình | Đặt `statement_timeout` trên replica, hoặc tách replica báo cáo |
| `VACUUM FULL` khi thấy wraparound | Chặn cả hệ thống, và **chậm hơn** `VACUUM FREEZE` | `VACUUM (FREEZE, INDEX_CLEANUP OFF)` |
| Nghĩ vacuum chống wraparound sẽ tự nhường DDL | Nó **không** tự huỷ khi chặn lệnh khác | Đừng chạy DDL khi thấy `(to prevent wraparound)` trong `pg_stat_activity` |
| Bảng chỉ `INSERT` trên PostgreSQL < 13 | Không bao giờ tự vacuum → đóng băng dồn cục | Lên lịch `VACUUM` thủ công, hoặc nâng cấp lên 13+ |

---

## Tóm tắt bài 5

- **Ngưỡng mặc định `50 + 20% số dòng` sai với bảng lớn.** Bảng 100 triệu dòng phải tích **20 triệu xác chết** (~3 GB) mới được dọn. Bảng càng lớn, autovacuum càng kiên nhẫn — đúng ngược điều ta cần.
- **Đặt cấu hình riêng cho từng bảng lớn**: `autovacuum_vacuum_scale_factor = 0.01` cộng ngưỡng tuyệt đối. Với bảng hàng đợi, đặt `scale_factor = 0` và dùng hẳn ngưỡng tuyệt đối.
- **Bảng chỉ `INSERT` không bao giờ tự vacuum trước PostgreSQL 13** — không bật bit VM, không đóng băng, cho tới ngày bị ép quét toàn bộ.
- **Freeze đánh dấu tuple là "cũ hơn mọi thứ"** bằng cờ `HEAP_XMIN_FROZEN`, giữ nguyên `xmin` gốc. Không có nó, tuple cũ sẽ rơi vào "tương lai" khi bộ đếm quay vòng và **biến mất khỏi tầm nhìn**.
- **Bốn nấc thang wraparound**: bình thường → vacuum chống wraparound (không tự nhường khoá) → chế độ cứu hoả → **dừng nhận lệnh ghi**. Nó không bao giờ đột ngột, luôn là nhiều tuần bị chặn mà không ai nhìn.
- **Có HAI bộ đếm tràn được**: XID và **MultiXactId**. MultiXact sinh ra từ khoá chia sẻ nhiều bên — mà nguồn lớn nhất là **khoá ngoại** trỏ tới cùng một dòng cha nóng.
- **Bốn thứ chặn vacuum**: transaction đang mở · **khe nhân bản chết** · prepared transaction bỏ quên · `hot_standby_feedback` từ replica chạy truy vấn dài. Chỉ một cái kẹt là vacuum dọn được 0 tuple **trên toàn database**.
- **Khe nhân bản là thủ phạm âm thầm nhất** vì nó không hiện trong `pg_stat_activity`. Một khe Debezium chết có thể giữ hàng trăm triệu XID và hàng trăm GB WAL cùng lúc.
- **`hot_standby_feedback` là đánh đổi không có đường thứ ba**: bật thì primary phình, tắt thì truy vấn trên replica bị huỷ. Cách thoát duy nhất là tách hẳn replica báo cáo.
- **Bốn truy vấn giám sát** — tuổi XID, tuổi MultiXact, `xmin horizon`, khe nhân bản chết — là đủ để wraparound không bao giờ xảy ra với bạn.

**Bài kế tiếp** → [Bài 6: Cơ chế Transaction bên trong](06-co-che-transaction-ben-trong.md) — chuyện gì thật sự xảy ra giữa `BEGIN` và `COMMIT`.

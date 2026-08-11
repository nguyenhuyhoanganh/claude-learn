# Bài 9: Phòng thí nghiệm và bảng tra cứu tổng hợp

Tám bài trước mô tả cơ chế. Bài này bắt bạn **nhìn thấy** chúng: bảy thí nghiệm chạy được trên máy của bạn trong khoảng một tiếng, mỗi cái tái hiện một cơ chế và cho ra con số đo được.

Sau đó là phần tra cứu: bộ truy vấn giám sát hoàn chỉnh, bảng tham số, và quy trình chẩn đoán năm phút khi hệ thống có sự cố.

## Dựng phòng thí nghiệm

```bash
docker run -d --name pglab \
  -e POSTGRES_PASSWORD=lab \
  -p 5433:5432 \
  postgres:17 \
  -c shared_buffers=256MB \
  -c log_lock_waits=on \
  -c log_min_duration_statement=500 \
  -c autovacuum_naptime=10s

docker exec -it pglab psql -U postgres
```

```sql
CREATE EXTENSION IF NOT EXISTS pageinspect;      -- xem byte trong page
CREATE EXTENSION IF NOT EXISTS pgstattuple;      -- đo bloat chính xác
CREATE EXTENSION IF NOT EXISTS pg_visibility;    -- xem visibility map
CREATE EXTENSION IF NOT EXISTS pg_freespacemap;  -- xem free space map
CREATE EXTENSION IF NOT EXISTS pg_buffercache;   -- xem shared_buffers
```

Mở sẵn **ba** cửa sổ terminal, gọi là **A**, **B**, **C**. Nhiều thí nghiệm cần chạy song song.

---

## Thí nghiệm 1 — Nhìn thấy MVCC ở mức byte

*Kiểm chứng: [bài 1](01-mvcc-tuple-header-va-phien-ban.md)*

```sql
CREATE TABLE tn1 (id INT PRIMARY KEY, v TEXT);
INSERT INTO tn1 VALUES (1, 'ban-dau');
UPDATE tn1 SET v = 'lan-1' WHERE id = 1;
UPDATE tn1 SET v = 'lan-2' WHERE id = 1;
DELETE FROM tn1 WHERE id = 1;

SELECT lp, lp_flags, t_xmin, t_xmax, t_ctid,
       lpad(to_hex(t_infomask), 4, '0') AS infomask,
       CASE WHEN t_infomask &  256 > 0 THEN 'xmin_committed ' ELSE '' END ||
       CASE WHEN t_infomask & 1024 > 0 THEN 'xmax_committed ' ELSE '' END ||
       CASE WHEN t_infomask & 2048 > 0 THEN 'xmax_invalid '   ELSE '' END ||
       CASE WHEN t_infomask & 8192 > 0 THEN 'updated '        ELSE '' END AS co
FROM heap_page_items(get_raw_page('tn1', 0));
```

```text
 lp | lp_flags | t_xmin | t_xmax | t_ctid | infomask |               co
----+----------+--------+--------+--------+----------+--------------------------------
  1 |        1 |    745 |    746 | (0,2)  | 0500     | xmin_committed xmax_committed
  2 |        1 |    746 |    747 | (0,3)  | 2500     | xmin_committed xmax_committed updated
  3 |        1 |    747 |    748 | (0,3)  | 2500     | xmin_committed xmax_committed updated
```

**Điều cần thấy:**

```text
   • BA tuple cho MỘT dòng logic — dù bảng "trống rỗng" sau DELETE
   • Chuỗi ctid:  lp1 ──▶ lp2 ──▶ lp3 ──▶ (chính nó, hết chuỗi)
   • Tuple cuối có xmax ≠ 0 → đã bị DELETE, nhưng DỮ LIỆU VẪN CÒN
```

Kiểm chứng dữ liệu chưa mất:

```sql
SELECT pg_size_pretty(pg_relation_size('tn1'));   -- 8192 bytes: page vẫn còn
VACUUM tn1;
SELECT lp, lp_flags FROM heap_page_items(get_raw_page('tn1', 0));
--  lp | lp_flags
--   1 |        0     ← UNUSED: bây giờ mới thật sự trống
--   2 |        0
--   3 |        0
```

---

## Thí nghiệm 2 — Snapshot quyết định bạn thấy gì

*Kiểm chứng: [bài 2](02-transaction-id-snapshot-va-quy-tac-nhin-thay.md)*

```sql
CREATE TABLE tn2 (id INT PRIMARY KEY, v INT);
INSERT INTO tn2 VALUES (1, 100);
```

| Bước | **Phiên A** (`READ COMMITTED`) | **Phiên B** (`REPEATABLE READ`) | **Phiên C** (ghi) |
|---|---|---|---|
| 1 | `BEGIN;` | `BEGIN ISOLATION LEVEL REPEATABLE READ;` | |
| 2 | `SELECT v FROM tn2;` → **100** | `SELECT v FROM tn2;` → **100** ← chụp ảnh ở đây | |
| 3 | | | `UPDATE tn2 SET v=200;` `COMMIT;` |
| 4 | `SELECT v FROM tn2;` → **200** ⭐ | `SELECT v FROM tn2;` → **100** ⭐ | |
| 5 | `COMMIT;` | `COMMIT;` | |
| 6 | `SELECT v FROM tn2;` → **200** | `SELECT v FROM tn2;` → **200** | |

Xem snapshot của từng phiên:

```sql
-- Chạy ở bước 4, trong phiên B
SELECT pg_current_snapshot();     -- xmin:xmax:xip — chú ý xmax nhỏ hơn XID của C
SELECT pg_current_xact_id_if_assigned();   -- NULL: phiên B chưa ghi gì
```

**Điều cần thấy:** cùng một câu `SELECT`, cùng một thời điểm, hai kết quả khác nhau — và **cả hai đều đúng**. Đây là lý do `COUNT(*)` không thể lưu sẵn một con số.

---

## Thí nghiệm 3 — `SELECT` làm bẩn cả bảng

*Kiểm chứng: hint bit ở [bài 2](02-transaction-id-snapshot-va-quy-tac-nhin-thay.md)*

```sql
CREATE TABLE tn3 (id INT, v TEXT);
INSERT INTO tn3 SELECT i, repeat('x', 100) FROM generate_series(1, 200000) i;

-- Đếm page BẨN trong shared_buffers TRƯỚC khi đọc
SELECT count(*) FILTER (WHERE isdirty) AS page_ban, count(*) AS tong
FROM pg_buffercache WHERE relfilenode = pg_relation_filenode('tn3');
```

```text
 page_ban | tong
----------+------
        0 | 3226      ← COPY/INSERT đã ghi xong, checkpoint đã dọn
```

```sql
-- Bây giờ chỉ ĐỌC. Không sửa gì cả.
SELECT count(*) FROM tn3;

-- Đếm lại
SELECT count(*) FILTER (WHERE isdirty) AS page_ban, count(*) AS tong
FROM pg_buffercache WHERE relfilenode = pg_relation_filenode('tn3');
```

```text
 page_ban | tong
----------+------
     3226 | 3226      ⚠ MỘT CÂU SELECT LÀM BẨN TOÀN BỘ 3.226 PAGE
```

**Điều cần thấy:** `SELECT` đặt hint bit `HEAP_XMIN_COMMITTED` vào từng tuple, làm bẩn mọi page. Checkpointer sau đó phải ghi lại toàn bộ xuống đĩa. Đây là lý do luôn nên `VACUUM` sau khi nạp dữ liệu lớn.

Kiểm chứng cách chữa:

```sql
CHECKPOINT;  VACUUM tn3;  CHECKPOINT;
SELECT count(*) FROM tn3;
SELECT count(*) FILTER (WHERE isdirty) FROM pg_buffercache
WHERE relfilenode = pg_relation_filenode('tn3');
--  count = 0     ← lần này SELECT không làm bẩn gì
```

---

## Thí nghiệm 4 — Visibility Map và `Heap Fetches`

*Kiểm chứng: [bài 3](03-visibility-map-fsm-va-hot.md)*

```sql
CREATE TABLE tn4 (id BIGSERIAL PRIMARY KEY, uid INT, tien NUMERIC);
INSERT INTO tn4 (uid, tien)
SELECT (random()*1000)::int, random()*500 FROM generate_series(1, 500000);
CREATE INDEX ON tn4 (uid, tien);

-- TRƯỚC vacuum
SELECT count(*) FILTER (WHERE all_visible) AS sach, count(*) AS tong
FROM pg_visibility_map('tn4');
--  sach = 0, tong = 3922

EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT uid, tien FROM tn4 WHERE uid = 42;
```

```text
 Index Only Scan using tn4_uid_tien_idx on tn4 (actual time=0.048..3.902 rows=507)
   Index Cond: (uid = 42)
   Heap Fetches: 507                    ⚠
   Buffers: shared hit=511
 Execution Time: 3.951 ms
```

```sql
VACUUM (ANALYZE) tn4;

SELECT count(*) FILTER (WHERE all_visible) AS sach FROM pg_visibility_map('tn4');
--  sach = 3922

EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT uid, tien FROM tn4 WHERE uid = 42;
```

```text
 Index Only Scan using tn4_uid_tien_idx on tn4 (actual time=0.029..0.398 rows=507)
   Heap Fetches: 0                      ✔
   Buffers: shared hit=6
 Execution Time: 0.428 ms
```

**Kết quả đo:** 511 buffer → 6 buffer, 3,95 ms → 0,43 ms. **Nhanh hơn 9 lần**, chỉ nhờ mấy nghìn bit trong file `_vm`.

Bây giờ phá nó để thấy chiều ngược lại:

```sql
UPDATE tn4 SET tien = tien + 1 WHERE id % 100 = 0;   -- sửa 1% số dòng
SELECT count(*) FILTER (WHERE all_visible) AS sach FROM pg_visibility_map('tn4');
--  sach = 51        ← sửa 1% số dòng làm TẮT 98,7% số bit!
```

**Điều cần thấy:** 1% số dòng bị sửa nhưng chúng rải đều khắp bảng, nên gần như mọi page đều bị chạm. Đây là lý do bảng ghi rải rác cần autovacuum rất quyết liệt để giữ `Index Only Scan` hoạt động.

---

## Thí nghiệm 5 — Transaction dài chặn vacuum

*Kiểm chứng: `xmin horizon` ở [bài 2](02-transaction-id-snapshot-va-quy-tac-nhin-thay.md) và [bài 5](05-autovacuum-freeze-va-wraparound.md)*

**Phiên A** — mở một transaction rồi để đó:

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT 1;                 -- chụp snapshot TẠI ĐÂY
-- KHÔNG commit. Để nguyên cửa sổ này.
```

**Phiên B** — tạo rác:

```sql
CREATE TABLE tn5 (id INT PRIMARY KEY, v INT);
INSERT INTO tn5 SELECT i, 0 FROM generate_series(1, 100000) i;

DO $$ BEGIN FOR i IN 1..10 LOOP UPDATE tn5 SET v = v + 1; END LOOP; END $$;

SELECT pg_size_pretty(pg_relation_size('tn5')) AS kich_thuoc,
       (SELECT dead_tuple_count FROM pgstattuple('tn5')) AS xac_chet;
```

```text
 kich_thuoc | xac_chet
------------+----------
 43 MB      |  1000000
```

```sql
VACUUM (VERBOSE) tn5;
```

```text
INFO:  finished vacuuming "public.tn5": index scans: 0
tuples: 0 removed, 100000 remain, 1000000 are dead but not yet removable
                                  ▲▲▲▲▲▲▲ MỘT TRIỆU xác chết, dọn được 0
removable cutoff: 802, which was 1 XIDs old when operation ended
```

```sql
SELECT pg_size_pretty(pg_relation_size('tn5'));   -- vẫn 43 MB
```

**Phiên C** — tìm thủ phạm:

```sql
SELECT pid, state, age(backend_xmin) AS giu_xid,
       now() - xact_start AS mo_bao_lau, left(query, 40)
FROM pg_stat_activity WHERE backend_xmin IS NOT NULL
ORDER BY age(backend_xmin) DESC;
```

```text
  pid  |        state        | giu_xid | mo_bao_lau |  query
-------+---------------------+---------+------------+----------
   118 | idle in transaction |    1002 | 00:03:41   | SELECT 1
```

**Phiên A** — đóng transaction:

```sql
COMMIT;
```

**Phiên B** — vacuum lại:

```sql
VACUUM (VERBOSE) tn5;
```

```text
tuples: 1000000 removed, 100000 remain, 0 are dead but not yet removable
        ▲▲▲▲▲▲▲ bây giờ dọn được hết
```

**Điều cần thấy:** một phiên chạy đúng một câu `SELECT 1` và ngồi im đã khoá chặt việc dọn dẹp của **toàn bộ database**. Không có lỗi nào, không có cảnh báo nào — chỉ có `VACUUM` chạy tốn I/O mà không làm được gì.

---

## Thí nghiệm 6 — HOT update và `fillfactor`

*Kiểm chứng: [bài 3](03-visibility-map-fsm-va-hot.md)*

```sql
-- Bảng A: fillfactor mặc định 100
CREATE TABLE tn6_a (id INT PRIMARY KEY, ten TEXT, dem INT);
INSERT INTO tn6_a SELECT i, 'user' || i, 0 FROM generate_series(1, 100000) i;

-- Bảng B: fillfactor 80
CREATE TABLE tn6_b (id INT PRIMARY KEY, ten TEXT, dem INT) WITH (fillfactor = 80);
INSERT INTO tn6_b SELECT i, 'user' || i, 0 FROM generate_series(1, 100000) i;

-- UPDATE cột KHÔNG được index, 20 lần
DO $$ BEGIN FOR i IN 1..20 LOOP
  UPDATE tn6_a SET dem = dem + 1;
  UPDATE tn6_b SET dem = dem + 1;
END LOOP; END $$;

SELECT relname,
       n_tup_upd AS tong_upd, n_tup_hot_upd AS hot,
       round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd,0), 1) AS ty_le_hot,
       pg_size_pretty(pg_relation_size(relid)) AS kich_thuoc
FROM pg_stat_user_tables WHERE relname LIKE 'tn6%' ORDER BY relname;
```

```text
 relname | tong_upd |     hot | ty_le_hot | kich_thuoc
---------+----------+---------+-----------+------------
 tn6_a   |  2000000 |  612044 |      30.6 | 175 MB
 tn6_b   |  2000000 | 1941822 |      97.1 |  59 MB      ✔
```

Bây giờ thêm một index vào cột hay đổi và làm lại:

```sql
CREATE INDEX ON tn6_b (dem);          -- ◀ một lệnh này phá HOT
SELECT pg_stat_reset();
DO $$ BEGIN FOR i IN 1..20 LOOP UPDATE tn6_b SET dem = dem + 1; END LOOP; END $$;

SELECT n_tup_upd, n_tup_hot_upd,
       round(100.0*n_tup_hot_upd/NULLIF(n_tup_upd,0),1) AS ty_le_hot
FROM pg_stat_user_tables WHERE relname = 'tn6_b';
```

```text
 n_tup_upd | n_tup_hot_upd | ty_le_hot
-----------+---------------+-----------
   2000000 |             0 |       0.0     ⚠ HOT CHẾT HOÀN TOÀN
```

**Điều cần thấy:** `fillfactor = 80` đưa tỉ lệ HOT từ 31% lên 97% và giảm kích thước bảng **ba lần**. Nhưng chỉ cần **một** `CREATE INDEX` trên cột hay đổi là tỉ lệ HOT về **0**.

---

## Thí nghiệm 7 — `ALTER TABLE` làm đứng hệ thống

*Kiểm chứng: hàng đợi khoá ở [bài 7](07-ban-do-day-du-cac-loai-khoa.md)*

**Phiên A** — mô phỏng một truy vấn dài:

```sql
BEGIN;
SELECT count(*) FROM tn4;
SELECT pg_sleep(120);      -- giả lập báo cáo chạy 2 phút
```

**Phiên B** — chạy DDL:

```sql
ALTER TABLE tn4 ADD COLUMN ghi_chu TEXT;
-- ...treo. Đang chờ ACCESS EXCLUSIVE.
```

**Phiên C** — một `SELECT` hoàn toàn bình thường:

```sql
SELECT count(*) FROM tn4;
-- ...CŨNG TREO!  ⚠
-- Nó không xung khắc với phiên A, nhưng xung khắc với ALTER đang CHỜ.
```

**Phiên C thứ hai** (mở thêm terminal) — chẩn đoán:

```sql
SELECT pid, state, wait_event_type, wait_event,
       pg_blocking_pids(pid) AS bi_chan_boi, left(query, 45) AS cau_lenh
FROM pg_stat_activity WHERE datname = current_database() AND state <> 'idle';
```

```text
 pid | state  | wait_event_type | wait_event | bi_chan_boi |        cau_lenh
-----+--------+-----------------+------------+-------------+----------------------
 118 | active | Timeout         | PgSleep    | {}          | SELECT pg_sleep(120)
 124 | active | Lock            | relation   | {118}       | ALTER TABLE tn4 ADD..
 131 | active | Lock            | relation   | {118,124}   | SELECT count(*) FROM..
                                                ▲▲▲▲▲▲▲
                                    SELECT bị chặn bởi CẢ HAI —
                                    kể cả bởi ALTER chỉ đang XẾP HÀNG
```

Xem hàng đợi khoá:

```sql
SELECT pid, mode, granted FROM pg_locks
WHERE relation = 'tn4'::regclass ORDER BY granted DESC, pid;
```

```text
 pid |        mode         | granted
-----+---------------------+---------
 118 | AccessShareLock     | t         ← đang giữ
 124 | AccessExclusiveLock | f         ← chờ
 131 | AccessShareLock     | f         ← chờ SAU nó
```

Cách chữa — huỷ phiên B rồi thử lại đúng cách:

```sql
-- Phiên C: giết ALTER đang chờ
SELECT pg_cancel_backend(124);
-- → phiên 131 (SELECT) được giải phóng NGAY LẬP TỨC

-- Phiên B: chạy lại có bảo hiểm
BEGIN;
SET LOCAL lock_timeout = '3s';
ALTER TABLE tn4 ADD COLUMN ghi_chu TEXT;
COMMIT;
-- ERROR: canceling statement due to lock timeout
-- → thất bại sau 3 giây, KHÔNG chặn ai. Thử lại sau.
```

**Điều cần thấy:** `SELECT` của phiên C **không hề xung khắc** với phiên A. Nó bị chặn chỉ vì có một `ACCESS EXCLUSIVE` đang **xếp hàng** ở giữa. Đây là cơ chế đằng sau phần lớn các sự cố "cả hệ thống đứng vì một lệnh DDL".

---

## Bộ truy vấn giám sát hoàn chỉnh

Lưu thành `giam-sat-postgres.sql` và chạy khi cần:

```sql
-- ════════════════════════════════════════════════════════════════
-- 1. SỨC KHOẺ WRAPAROUND  (cảnh báo 50%, khẩn cấp 75%)
-- ════════════════════════════════════════════════════════════════
SELECT datname,
       age(datfrozenxid)                                       AS tuoi_xid,
       round(100.0*age(datfrozenxid)/2000000000, 1)            AS pct_xid,
       mxid_age(datminmxid)                                    AS tuoi_mxid,
       round(100.0*mxid_age(datminmxid)/4000000000, 1)         AS pct_mxid
FROM pg_database WHERE datallowconn ORDER BY 2 DESC;

-- ════════════════════════════════════════════════════════════════
-- 2. AI ĐANG GIỮ xmin horizon  (cảnh báo > 50 triệu)
-- ════════════════════════════════════════════════════════════════
SELECT 'backend'   AS nguon, pid::text AS id, age(backend_xmin) AS giu_xid,
       (now() - xact_start)::text AS thoi_gian, left(query, 40) AS chi_tiet
FROM pg_stat_activity WHERE backend_xmin IS NOT NULL
UNION ALL
SELECT 'slot', slot_name, greatest(age(xmin), age(catalog_xmin)),
       CASE WHEN active THEN 'active' ELSE 'KHÔNG HOẠT ĐỘNG' END, slot_type
FROM pg_replication_slots
UNION ALL
SELECT 'prepared_xact', gid, age(transaction), (now()-prepared)::text, database
FROM pg_prepared_xacts
ORDER BY giu_xid DESC NULLS LAST LIMIT 20;

-- ════════════════════════════════════════════════════════════════
-- 3. BLOAT VÀ TÌNH TRẠNG VACUUM
-- ════════════════════════════════════════════════════════════════
SELECT relname,
       pg_size_pretty(pg_relation_size(relid))                 AS kich_thuoc,
       n_live_tup, n_dead_tup,
       round(100.0*n_dead_tup/NULLIF(n_live_tup+n_dead_tup,0),1) AS pct_chet,
       n_tup_upd, n_tup_hot_upd,
       round(100.0*n_tup_hot_upd/NULLIF(n_tup_upd,0),1)        AS pct_hot,
       last_autovacuum, last_autoanalyze
FROM pg_stat_user_tables
WHERE pg_relation_size(relid) > 50*1024*1024
ORDER BY n_dead_tup DESC LIMIT 20;

-- ════════════════════════════════════════════════════════════════
-- 4. AI CHẶN AI  (chạy ngay khi có sự cố treo)
-- ════════════════════════════════════════════════════════════════
SELECT nan_nhan.pid                       AS pid_bi_chan,
       (now()-nan_nhan.query_start)::text AS cho_bao_lau,
       nan_nhan.wait_event_type||':'||nan_nhan.wait_event AS dang_cho,
       left(nan_nhan.query, 40)           AS lenh_bi_chan,
       thu_pham.pid                       AS pid_thu_pham,
       thu_pham.state                     AS trang_thai_thu_pham,
       (now()-thu_pham.xact_start)::text  AS tx_thu_pham_mo,
       left(thu_pham.query, 40)           AS lenh_thu_pham
FROM pg_stat_activity nan_nhan
JOIN LATERAL unnest(pg_blocking_pids(nan_nhan.pid)) AS b(pid) ON true
JOIN pg_stat_activity thu_pham ON thu_pham.pid = b.pid
ORDER BY nan_nhan.query_start;

-- ════════════════════════════════════════════════════════════════
-- 5. ĐANG CHỜ CÁI GÌ  (LWLock không có trong pg_locks!)
-- ════════════════════════════════════════════════════════════════
SELECT coalesce(wait_event_type,'(đang chạy)') AS loai,
       coalesce(wait_event,'-')                AS su_kien,
       count(*) AS so_phien
FROM pg_stat_activity WHERE state = 'active'
GROUP BY 1,2 ORDER BY 3 DESC LIMIT 15;

-- ════════════════════════════════════════════════════════════════
-- 6. VACUUM ĐANG CHẠY  (so_luot_lap > 1 → tăng maintenance_work_mem)
-- ════════════════════════════════════════════════════════════════
SELECT p.pid, p.relid::regclass AS bang, p.phase,
       round(100.0*p.heap_blks_scanned/NULLIF(p.heap_blks_total,0),1) AS pct,
       p.index_vacuum_count AS so_luot_lap,
       (now()-a.xact_start)::text AS chay_bao_lau
FROM pg_stat_progress_vacuum p JOIN pg_stat_activity a USING (pid);

-- ════════════════════════════════════════════════════════════════
-- 7. PHIÊN TREO TRONG TRANSACTION
-- ════════════════════════════════════════════════════════════════
SELECT pid, usename, application_name, state,
       (now()-state_change)::text AS treo_bao_lau, left(query,50)
FROM pg_stat_activity
WHERE state LIKE 'idle in transaction%'
  AND now()-state_change > interval '1 min'
ORDER BY state_change;

-- ════════════════════════════════════════════════════════════════
-- 8. INDEX KHÔNG BAO GIỜ DÙNG  (mỗi cái làm chậm mọi UPDATE và VACUUM)
-- ════════════════════════════════════════════════════════════════
SELECT relname AS bang, indexrelname AS index_khong_dung,
       pg_size_pretty(pg_relation_size(indexrelid)) AS kich_thuoc, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0 AND indexrelid NOT IN (
        SELECT conindid FROM pg_constraint WHERE contype IN ('p','u'))
ORDER BY pg_relation_size(indexrelid) DESC LIMIT 20;
```

---

## Quy trình chẩn đoán năm phút

Khi hệ thống có sự cố, đi theo cây này:

```text
   ┌─ TRIỆU CHỨNG: truy vấn treo / ứng dụng timeout ───────────────────┐
   │                                                                   │
   │  ▶ Chạy truy vấn #4 (ai chặn ai)                                  │
   │     • Có kết quả?  → tìm pid GỐC (không bị ai chặn) → xử lý nó    │
   │     • Rỗng?        → không phải vấn đề khoá, đi tiếp              │
   │                                                                   │
   │  ▶ Chạy truy vấn #5 (đang chờ cái gì)                             │
   │     • Lock:transactionid  → tranh chấp khoá dòng                  │
   │     • Lock:relation       → có DDL đang chặn (xem #4)             │
   │     • LWLock:WALWrite     → nghẽn ghi WAL → xem đĩa / sync_commit │
   │     • LWLock:SubtransSLRU → tràn sub-transaction → xem code       │
   │     • LWLock:lock_manager → quá nhiều khoá → xem partition        │
   │     • IO:DataFileRead     → thiếu index hoặc shared_buffers nhỏ   │
   └───────────────────────────────────────────────────────────────────┘

   ┌─ TRIỆU CHỨNG: đĩa đầy / bảng phình ───────────────────────────────┐
   │  ▶ Chạy #3 → pct_chet cao ở bảng nào?                             │
   │  ▶ Chạy #2 → có ai giữ xmin horizon không?                        │
   │     • CÓ  → xử lý nguồn đó TRƯỚC. VACUUM lúc này là vô ích.       │
   │     • KHÔNG → autovacuum không theo kịp:                          │
   │        - #6 xem có đang chạy không, so_luot_lap có > 1 không      │
   │        - đặt autovacuum_vacuum_scale_factor riêng cho bảng đó     │
   │        - tăng autovacuum_vacuum_cost_limit                        │
   └───────────────────────────────────────────────────────────────────┘

   ┌─ TRIỆU CHỨNG: truy vấn ĐỘT NHIÊN chậm, không đổi gì ──────────────┐
   │  ▶ EXPLAIN (ANALYZE, BUFFERS) — xem Heap Fetches                  │
   │     • cao → visibility map lạc hậu → VACUUM (bài 3)               │
   │  ▶ #3 xem last_autoanalyze — thống kê cũ → kế hoạch sai           │
   │  ▶ #8 xem có ai vừa thêm index vào cột hay đổi không (giết HOT)   │
   └───────────────────────────────────────────────────────────────────┘

   ┌─ TRIỆU CHỨNG: log báo "not accepting commands" ───────────────────┐
   │  ▶ Đây là WRAPAROUND. Chạy #1 và #2 ngay.                         │
   │  ▶ Gỡ nguồn chặn horizon TRƯỚC, rồi:                              │
   │     SET vacuum_cost_delay = 0;                                    │
   │     VACUUM (FREEZE, INDEX_CLEANUP OFF, VERBOSE) <bảng già nhất>;  │
   └───────────────────────────────────────────────────────────────────┘
```

---

## Bảng tra cứu tham số

```text
   ═══ MVCC / VACUUM ════════════════════════════════════════════════
   autovacuum                        on       ⚠ KHÔNG BAO GIỜ tắt
   autovacuum_max_workers            3        → 4-8 cho hệ nhiều bảng lớn
   autovacuum_naptime                1min     → 10-15s
   autovacuum_vacuum_threshold       50
   autovacuum_vacuum_scale_factor    0.2      → 0.05 toàn cục, 0.01 bảng lớn
   autovacuum_analyze_scale_factor   0.1      → 0.02
   autovacuum_vacuum_insert_threshold 1000    (PG13+, cho bảng chỉ thêm)
   autovacuum_vacuum_cost_delay      2ms      → 0 nếu I/O dư
   autovacuum_vacuum_cost_limit      200      → 1000-2000  ⚠ CHIA CHUNG mọi worker
   autovacuum_work_mem               -1       → 512MB  (×số worker = RAM cần)
   maintenance_work_mem              64MB     → 1GB cho VACUUM thủ công
   vacuum_cost_delay                 0        (VACUUM thủ công KHÔNG bị hãm)

   ═══ FREEZE / WRAPAROUND ══════════════════════════════════════════
   vacuum_freeze_min_age             50tr     → 20tr (freeze đều hơn)
   vacuum_freeze_table_age           150tr
   autovacuum_freeze_max_age         200tr    → 400tr nếu đã giám sát tốt
   vacuum_failsafe_age               1.6 tỉ   (PG14+)
   autovacuum_multixact_freeze_max_age 400tr

   ═══ TRANSACTION / TIMEOUT ════════════════════════════════════════
   default_transaction_isolation     read committed
   statement_timeout                 0        → 30-60s (đặt theo ROLE)
   lock_timeout                      0        → 5s     ⚠ BẮT BUỘC cho DDL
   idle_in_transaction_session_timeout 0      → 5min   ⚠ QUAN TRỌNG NHẤT
   transaction_timeout               0        → 30min  (PG17+)
   deadlock_timeout                  1s
   synchronous_commit                on       (vặn được theo transaction)

   ═══ KHOÁ ═════════════════════════════════════════════════════════
   max_locks_per_transaction         64       → 256 nếu nhiều partition
   max_pred_locks_per_transaction    64       → 256 nếu dùng SERIALIZABLE
   max_pred_locks_per_page           2        → 8
   max_pred_locks_per_relation       -2       → -4
   log_lock_waits                    off      → ON  ⚠ luôn bật

   ═══ LƯU TRỮ ══════════════════════════════════════════════════════
   fillfactor (theo bảng)            100      → 80-90 cho bảng UPDATE nhiều
   vacuum_truncate (theo bảng)       true     → false cho bảng cực nóng
```

---

## Bản đồ tổng hợp: mọi thứ nối với nhau thế nào

```text
                    ┌─────────────────────────────────┐
                    │   BẠN CHẠY MỘT LỆNH UPDATE      │
                    └────────────────┬────────────────┘
                                     ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ CẤP XID (nếu chưa có) → đăng ký vào ProcArray          [bài 2,6]│
   └────────────────────────────────┬────────────────────────────────┘
                                     ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ LẤY KHOÁ: ROW EXCLUSIVE trên bảng + khoá dòng trong tuple  [b.7]│
   │   • xung đột? → chờ trên locktype=transactionid                 │
   │   • hàng đợi FIFO, không ai vượt mặt                            │
   └────────────────────────────────┬────────────────────────────────┘
                                     ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ GHI TUPLE MỚI                                            [bài 1]│
   │   • cột sửa có index? + page còn chỗ? → HOT UPDATE       [bài 3]│
   │     KHÔNG → tuple mới ở page khác + cập nhật MỌI index          │
   │   • tuple cũ: đặt xmax, giữ nguyên dữ liệu                      │
   │   • TẮT bit visibility map của page                      [bài 3]│
   └────────────────────────────────┬────────────────────────────────┘
                                     ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ COMMIT: WAL → fsync → pg_xact → gỡ ProcArray → trả khoá  [bài 6]│
   │   SERIALIZABLE? → kiểm tra cấu trúc nguy hiểm trước      [bài 8]│
   └────────────────────────────────┬────────────────────────────────┘
                                     ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ TUPLE CŨ BÂY GIỜ LÀ RÁC — nhưng chưa dọn được            [bài 1]│
   │   phải chờ xmin horizon vượt qua xmax của nó             [bài 2]│
   │   ← bị giữ bởi: tx dài · slot · prepared xact · replica  [bài 5]│
   └────────────────────────────────┬────────────────────────────────┘
                                     ▼
   ┌─────────────────────────────────────────────────────────────────┐
   │ AUTOVACUUM: n_dead_tup > 50 + 20%×reltuples?             [bài 5]│
   │   → quét heap → dọn index → dọn heap → FSM → VM → freeze [bài 4]│
   │   → bit VM bật lại → Index Only Scan hoạt động trở lại   [bài 3]│
   └─────────────────────────────────────────────────────────────────┘

   VÒNG TRÒN KHÉP KÍN. Đứt ở bất kỳ khâu nào → bloat → chậm → wraparound.
```

---

## Ba mươi giây tổng kết cả phase

1. **PostgreSQL không sửa dòng, nó ghi phiên bản mới.** Mọi thứ khác trong phase này là hệ quả của một câu đó.
2. **Khả kiến = so hai số của tuple (`xmin`, `xmax`) với ba số của snapshot (`xmin`, `xmax`, `xip`).** Không có gì phức tạp hơn thế.
3. **Isolation level chỉ khác nhau ở thời điểm chụp snapshot** — và snapshot chụp ở **câu lệnh đầu tiên**, không phải ở `BEGIN`.
4. **`VACUUM` là một nửa của cơ chế, không phải việc bảo trì tuỳ chọn.** Nó dọn xác, bật bit VM, cập nhật FSM, và **đóng băng** — việc cuối liên quan tới tính đúng đắn.
5. **Transaction dài là kẻ thù số một.** Nó chặn dọn dẹp trên **toàn bộ database**, không riêng bảng nó chạm. Ba anh em họ của nó: khe nhân bản chết, prepared transaction bỏ quên, `hot_standby_feedback`.
6. **Ngưỡng autovacuum mặc định (20%) sai với bảng lớn.** Phải đặt riêng cho từng bảng lớn.
7. **`Heap Fetches` trong `EXPLAIN` là chỉ số sức khoẻ của visibility map.** Cao nghĩa là `Index Only Scan` đang giả vờ.
8. **HOT update né toàn bộ chi phí index — và một `CREATE INDEX` giết nó cho cả bảng.**
9. **Hàng đợi khoá là FIFO, không ai vượt mặt.** Một `ALTER TABLE` chờ phía sau truy vấn dài sẽ chặn mọi thứ đến sau. Luôn dùng `lock_timeout`.
10. **PostgreSQL có năm hệ thống khoá.** `pg_locks` chỉ cho thấy một cái. Khi database chậm mà không truy vấn nào chậm, nhìn `wait_event`.
11. **`SERIALIZABLE` chặn write skew mà không khoá gì** — nhưng bắt buộc phải có vòng lặp thử lại, và chất lượng index quyết định tỉ lệ báo động giả.
12. **Bốn truy vấn giám sát** (tuổi XID, `xmin horizon`, bloat, ai chặn ai) là đủ để không bao giờ gặp sự cố wraparound.

---

## Đọc tiếp

| Nội dung | Ở đâu |
|---|---|
| Nền tảng: ACID và bốn hiện tượng đọc | [phase-2](../phase-2/01-acid-va-transaction.md) |
| Page, heap, I/O — đơn vị suy nghĩ | [phase-3 bài 1](../phase-3/01-page-heap-va-io.md) |
| Khoá cơ bản, deadlock, 2PL | [phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md) |
| WAL, redo, undo và độ bền | [phase-17 bài 1](../phase-17/01-wal-redo-undo-logs.md) |
| Kiến trúc tiến trình và bố cục file | [phase-17 bài 2](../phase-17/01-luu-tru-du-lieu-va-kien-truc-postgres.md) |
| Khuếch đại ghi sáu tầng | [phase-17 bài 7](../phase-17/06-nulls-va-write-amplification.md) |
| Bi quan vs lạc quan, InnoDB locking | [phase-17 bài 8](../phase-17/07-concurrency-control-va-innodb-locking.md) |
| Ôn tập toàn khoá | [phase-18](../phase-18/01-acid-review-va-implementation-details.md) |

| Khoá liên quan | Quan hệ |
|---|---|
| [database-su-co-va-phong-van](../../database-su-co-va-phong-van/README.md) | Đi từ **sự cố thật** ngược về các cơ chế trong phase này |
| [sql-interview](../../sql-interview/README.md) | Tầng trên: viết SQL cho đúng và nhanh |
| [backend-scaling-cases](../../backend-scaling-cases/README.md) | Áp dụng ở tầng hệ thống: pool, khoá, hàng đợi |

---

*Hết phase 19. Nếu chỉ mang theo được một câu: **PostgreSQL đánh đổi công việc dọn dẹp lấy khả năng đọc không bao giờ chặn ghi** — và mọi sự cố nghiêm trọng của nó đều bắt đầu từ chỗ ai đó ngăn không cho nó dọn.*

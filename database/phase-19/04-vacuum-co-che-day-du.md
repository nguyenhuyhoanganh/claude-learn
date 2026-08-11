# Bài 4: VACUUM — mổ xẻ từng pha

Cái tên "vacuum" (máy hút bụi) gợi ý sai. Nó khiến người ta nghĩ đây là việc dọn dẹp tuỳ chọn, làm cũng được không làm cũng được — như quét nhà.

Thực tế: **`VACUUM` là một nửa của cơ chế MVCC.** [Bài 1](01-mvcc-tuple-header-va-phien-ban.md) cho thấy PostgreSQL chỉ làm nửa việc khi ghi — nó tạo phiên bản mới và bỏ mặc phiên bản cũ. Nửa còn lại là `VACUUM`. Không có nó, database sẽ phình tới khi hết đĩa, rồi **dừng nhận lệnh ghi** để tự cứu.

Bài này mổ xẻ nó: sáu nhiệm vụ, các pha thực thi, bộ nhớ nó dùng, cách nó tự hãm tốc độ, và ba biến thể `VACUUM FULL`/`CLUSTER`/`pg_repack` khác nhau ở đâu.

## `VACUUM` làm sáu việc, không phải một

```text
   ┌───────────────────────────────────────────────────────────────────┐
   │ 1. DỌN TUPLE CHẾT             xoá tuple có xmax đã commit và cũ    │
   │                               hơn xmin horizon; trả chỗ trong page │
   ├───────────────────────────────────────────────────────────────────┤
   │ 2. DỌN MỤC INDEX              xoá các mục index trỏ tới tuple đó   │
   │                               (nếu không, index trỏ vào hư không)  │
   ├───────────────────────────────────────────────────────────────────┤
   │ 3. CẬP NHẬT FSM               ghi lại "page này còn bao nhiêu chỗ" │
   │                               → INSERT sau này tái dùng được       │
   ├───────────────────────────────────────────────────────────────────┤
   │ 4. BẬT BIT VISIBILITY MAP     đánh dấu page "sạch" / "đóng băng"   │
   │                               → Index Only Scan hoạt động          │
   ├───────────────────────────────────────────────────────────────────┤
   │ 5. ĐÓNG BĂNG TUPLE CŨ         đặt cờ HEAP_XMIN_FROZEN,             │
   │                               nâng relfrozenxid → chống wraparound │
   ├───────────────────────────────────────────────────────────────────┤
   │ 6. CẮT ĐUÔI BẢNG              nếu các page CUỐI bảng đều rỗng      │
   │                               → trả đĩa về hệ điều hành            │
   └───────────────────────────────────────────────────────────────────┘

   (ANALYZE là việc RIÊNG: cập nhật thống kê cho optimizer.
    VACUUM ANALYZE = làm cả hai.)
```

Nhiệm vụ 5 là nhiệm vụ **không thể bỏ qua được**. Bốn nhiệm vụ đầu chỉ ảnh hưởng hiệu năng; nhiệm vụ 5 ảnh hưởng **tính đúng đắn** — bỏ nó đủ lâu thì database ngừng hoạt động. Chi tiết ở [bài 5](05-autovacuum-freeze-va-wraparound.md).

---

## Vì sao phải quét heap **hai lượt**

Câu hỏi tự nhiên: sao không quét một lượt, gặp tuple chết thì xoá luôn?

```text
   NẾU XOÁ NGAY KHI GẶP:

   page 87, lp[12] → tuple chết
      → giải phóng lp[12], đánh dấu UNUSED
      → INSERT mới lấy lp[12] cho một dòng KHÁC
      → nhưng INDEX vẫn còn mục cũ trỏ (87,12)!
      → truy vấn qua index đọc phải DÒNG SAI                    ⚠ HỎNG DỮ LIỆU

   ⇒ BẮT BUỘC phải xoá mục index TRƯỚC, rồi mới giải phóng con trỏ.
     Mà muốn xoá mục index thì phải biết TOÀN BỘ danh sách ctid chết.
     ⇒ phải quét heap gom danh sách trước.
```

Từ đó ra kiến trúc ba bước:

```text
   ┌── LƯỢT 1: QUÉT HEAP ────────────────────────────────────────┐
   │  • đọc từng page (bỏ qua page có bit all-visible)           │
   │  • pruning: cắt chuỗi HOT, gom tuple chết trong page         │
   │  • đóng băng tuple đủ cũ                                     │
   │  • GHI DANH SÁCH ctid CHẾT vào bộ nhớ                        │
   │  • đánh dấu con trỏ là DEAD (chưa phải UNUSED)               │
   └────────────────────────────┬────────────────────────────────┘
                                ▼
   ┌── LƯỢT 2: DỌN INDEX ────────────────────────────────────────┐
   │  • với MỖI index của bảng: quét TOÀN BỘ index               │
   │  • xoá mọi mục trỏ tới ctid trong danh sách                 │
   │  ⚠ đây thường là pha TỐN THỜI GIAN NHẤT                     │
   └────────────────────────────┬────────────────────────────────┘
                                ▼
   ┌── LƯỢT 3: DỌN HEAP ─────────────────────────────────────────┐
   │  • quay lại các page đã ghi nhận                            │
   │  • đổi con trỏ DEAD → UNUSED (bây giờ đã an toàn)           │
   │  • cập nhật FSM và bit VM                                   │
   └─────────────────────────────────────────────────────────────┘
```

> **Hệ quả về hiệu năng:** thời gian `VACUUM` phụ thuộc vào **số index**, không chỉ kích thước bảng. Bảng 10 GB có 8 index tốn nhiều thời gian hơn bảng 30 GB có 1 index. Đây là lý do "bỏ index thừa" cũng là một biện pháp giảm tải vacuum.

---

## Bộ nhớ: `maintenance_work_mem` và cái trần 1 GB

Danh sách ctid chết phải nằm trong bộ nhớ. Kích thước bộ nhớ đó quyết định **số lượt lặp**:

```text
   TRƯỚC PostgreSQL 17 — mảng phẳng, 6 byte mỗi ctid
   ═══════════════════════════════════════════════════
   maintenance_work_mem = 64 MB (mặc định)
     → 64 MB ÷ 6 byte = 11,1 triệu ctid mỗi lượt

   Bảng có 30 triệu tuple chết:
   ┌──────────────────────────────────────────────────────────┐
   │ lượt 1: gom 11,1tr → QUÉT TOÀN BỘ 8 INDEX → dọn heap     │
   │ lượt 2: gom 11,1tr → QUÉT TOÀN BỘ 8 INDEX → dọn heap     │
   │ lượt 3: gom  7,8tr → QUÉT TOÀN BỘ 8 INDEX → dọn heap     │
   └──────────────────────────────────────────────────────────┘
     → 24 lần quét index toàn phần thay vì 8            ⚠ CHẬM GẤP BA

   Trần cứng: 1 GB → 178.956.970 ctid, không tăng thêm được
   dù đặt maintenance_work_mem = 8GB
```

Cách chữa (mọi phiên bản):

```sql
-- Cho phiên chạy vacuum thủ công
SET maintenance_work_mem = '1GB';
VACUUM (VERBOSE) bang_lon;

-- Cho autovacuum worker (nhân với autovacuum_max_workers khi tính RAM!)
ALTER SYSTEM SET autovacuum_work_mem = '512MB';
```

> **PostgreSQL 17 đổi hẳn cấu trúc:** danh sách ctid chuyển từ mảng phẳng sang **TidStore** (cây radix nén). Nó tốn ít bộ nhớ hơn ~5-20 lần cho cùng số ctid, **và bỏ luôn trần 1 GB**. Với bảng rất lớn, nâng cấp lên 17 có thể biến vacuum nhiều giờ thành vacuum một lượt.

---

## Đọc `VACUUM VERBOSE` như đọc một biên bản

```sql
VACUUM (VERBOSE, ANALYZE) orders;
```

```text
INFO:  vacuuming "public.orders"
INFO:  finished vacuuming "public.orders": index scans: 1
pages: 0 removed, 131234 remain, 131234 scanned (100.00% of total)
tuples: 482911 removed, 4517089 remain, 0 are dead but not yet removable
removable cutoff: 784922, which was 12 XIDs old when operation ended
new relfrozenxid: 782014, which is 2908 XIDs ahead of previous value
index scan needed: 12842 pages from table (9.79% of total) had 482911
     dead item identifiers removed
index "orders_pkey": pages: 13721 in total, 0 newly deleted, 0 currently
     deleted, 0 reusable
avg read rate: 142.881 MB/s, avg write rate: 38.221 MB/s
buffer usage: 271843 hits, 18922 misses, 5081 dirtied
WAL usage: 24881 records, 4102 full page images, 31882914 bytes
system usage: CPU: user: 2.11 s, system: 0.48 s, elapsed: 4.92 s
```

Đọc từng dòng quan trọng:

| Dòng | Ý nghĩa | Cần lo khi |
|---|---|---|
| `index scans: 1` | Số lượt lặp | **> 1** → tăng `maintenance_work_mem` |
| `pages: 0 removed` | Số page cắt được ở đuôi bảng | Luôn 0 nếu cuối bảng còn dòng sống — bình thường |
| `131234 scanned (100.00%)` | Tỉ lệ page phải quét | 100% nghĩa là VM không giúp được gì → bảng vừa bị ghi khắp nơi |
| `0 are dead but not yet removable` | **Số tuple chết KHÔNG dọn được** | **> 0 → có transaction/slot đang chặn** ⚠ |
| `removable cutoff: 784922 ... 12 XIDs old` | `xmin horizon` tại thời điểm chạy | Chênh lệch lớn → có transaction cũ |
| `new relfrozenxid` | Mốc đóng băng mới | Không nhích → freeze không tiến triển |
| `full page images: 4102` | Số lần ghi cả page 8 KB vào WAL | Cao → checkpoint quá dày |

Dòng đáng chú ý nhất là `are dead but not yet removable`. Đây là **cảnh báo sớm** cho mọi sự cố bloat:

```text
   tuples: 0 removed, 4517089 remain, 8842019 are dead but not yet removable
                                      ▲▲▲▲▲▲▲
   → 8,8 TRIỆU tuple chết mà KHÔNG dọn được
   → VACUUM chạy xong, tốn I/O, và không giải quyết được gì
   → nguyên nhân KHÔNG nằm ở vacuum, nằm ở xmin horizon (bài 2 và bài 5)
```

---

## Theo dõi vacuum đang chạy

```sql
SELECT p.pid,
       now() - a.xact_start AS chay_bao_lau,
       p.relid::regclass    AS bang,
       p.phase,
       p.heap_blks_scanned, p.heap_blks_total,
       round(100.0 * p.heap_blks_scanned / NULLIF(p.heap_blks_total,0), 1) AS pct,
       p.index_vacuum_count AS so_luot_lap,
       p.num_dead_item_ids          -- PostgreSQL < 17: cột tên là num_dead_tuples
FROM pg_stat_progress_vacuum p
JOIN pg_stat_activity a USING (pid);
```

```text
  pid  | chay_bao_lau |  bang  |        phase        | ... | pct | so_luot_lap
-------+--------------+--------+---------------------+-----+-----+-------------
 28471 | 00:14:22     | orders | vacuuming indexes   | ... |62.1 |           2
```

Bảy pha bạn có thể thấy:

```text
   initializing              khởi động
   scanning heap             ◀ LƯỢT 1 — quét heap, gom ctid chết
   vacuuming indexes         ◀ LƯỢT 2 — thường lâu nhất
   vacuuming heap            ◀ LƯỢT 3 — giải phóng con trỏ
   cleaning up indexes       dọn hậu kỳ cho index (cập nhật thống kê B-Tree)
   truncating heap           cắt đuôi bảng   ⚠ lấy ACCESS EXCLUSIVE!
   performing final cleanup  ghi thống kê, kết thúc
```

Nếu `so_luot_lap` (`index_vacuum_count`) lớn hơn 1, bạn vừa phát hiện được vấn đề `maintenance_work_mem` mô tả ở trên — trong lúc nó còn đang chạy.

### Pha `truncating heap` — cái bẫy ít ai biết

```text
   Ở pha CUỐI, nếu các page CUỐI bảng đều rỗng, VACUUM cắt đuôi bảng
   để trả đĩa về hệ điều hành. Muốn cắt, nó phải lấy ACCESS EXCLUSIVE
   — khoá mạnh nhất, chặn cả SELECT.

   ┌──────────────────────────────────────────────────────────┐
   │ VACUUM xin ACCESS EXCLUSIVE trên orders                   │
   │   → mọi truy vấn mới vào orders phải XẾP HÀNG SAU nó      │
   │   → nếu có truy vấn dài đang chạy, VACUUM chờ             │
   │   → và cả hàng đợi đứng im                        ⚠       │
   └──────────────────────────────────────────────────────────┘

   PostgreSQL có cơ chế nhượng bộ: kiểm tra mỗi 20 ms, nếu thấy ai đó
   đang chờ mình thì BỎ việc cắt đuôi. Nhưng khoảnh khắc treo vẫn có thật.
```

Với bảng rất nóng, tắt hẳn phần này:

```sql
ALTER TABLE hot_table SET (vacuum_truncate = off);
-- hoặc một lần:
VACUUM (TRUNCATE OFF) hot_table;
```

Đánh đổi: bảng không tự trả đĩa về hệ điều hành nữa, nhưng chỗ trống vẫn được tái dùng bình thường.

---

## Cơ chế tự hãm tốc độ (cost-based delay)

`VACUUM` chạy hết tốc lực sẽ ăn hết I/O và làm treo ứng dụng. Nên nó **tự đếm chi phí và tự ngủ**:

```text
   MỖI THAO TÁC CÓ MỘT "GIÁ" (đơn vị quy ước)

   vacuum_cost_page_hit   =  1   page đã có trong shared_buffers
   vacuum_cost_page_miss  =  2   phải đọc từ đĩa   (PG14+; trước đó = 10)
   vacuum_cost_page_dirty = 20   làm bẩn một page sạch  ← đắt nhất

   VÒNG LẶP:
     tích luỹ chi phí ──▶ chạm vacuum_cost_limit (200) ──▶ NGỦ cost_delay ──┐
        ▲                                                                    │
        └────────────────────────────────────────────────────────────────────┘
```

Từ đó tính ra **thông lượng thật** của autovacuum:

```text
   THÔNG LƯỢNG = (cost_limit ÷ cost_delay) × 8 KB ÷ giá mỗi page

   MẶC ĐỊNH HIỆN NAY (PG12+): limit=200, delay=2ms
     200 ÷ 0,002s = 100.000 đơn vị/giây
     • toàn page bẩn (20)   → 5.000 page/s  = 39 MB/s
     • toàn page miss (2)   → 50.000 page/s = 390 MB/s

   MẶC ĐỊNH CŨ (trước PG12): limit=200, delay=20ms
     10.000 đơn vị/giây
     • toàn page bẩn → 500 page/s = 3,9 MB/s        ⚠ CHẬM KHỦNG KHIẾP
     → bảng 100 GB cần ~7 tiếng chỉ để đi hết một lượt
```

Con số 3,9 MB/s giải thích vì sao rất nhiều hệ thống PostgreSQL cũ có autovacuum "chạy suốt mà không bao giờ đuổi kịp". Nếu bạn đang dùng bản cũ hoặc thừa hưởng cấu hình cũ, đây là việc đầu tiên nên sửa:

```sql
ALTER SYSTEM SET autovacuum_vacuum_cost_delay = '2ms';   -- hoặc 0 nếu I/O dư
ALTER SYSTEM SET autovacuum_vacuum_cost_limit = 1000;    -- ~200 MB/s page bẩn
SELECT pg_reload_conf();
```

Quan trọng: **`VACUUM` thủ công mặc định KHÔNG bị hãm** (`vacuum_cost_delay = 0`). Nên khi bạn tự gõ `VACUUM`, nó chạy hết tốc lực. Nếu chạy giờ cao điểm, hãy tự hãm:

```sql
SET vacuum_cost_delay = '10ms';
VACUUM bang_lon;
```

### Chia sẻ ngân sách giữa các worker

Chi tiết ít người biết: `autovacuum_vacuum_cost_limit` là **ngân sách chung cho toàn bộ worker**, không phải cho mỗi worker.

```text
   autovacuum_max_workers = 3, cost_limit = 200

   1 worker chạy  → nó dùng cả 200
   3 worker chạy  → mỗi worker chỉ được ~66      ⚠

   → Tăng autovacuum_max_workers mà KHÔNG tăng cost_limit
     = chia nhỏ cùng một cái bánh, không nhanh hơn chút nào.
```

Muốn nhiều worker chạy nhanh hơn thì phải tăng **cả hai**.

---

## Vacuum song song

Từ PostgreSQL 13, pha dọn index chạy song song được:

```sql
VACUUM (PARALLEL 4, VERBOSE) orders;
```

```text
   MỘT WORKER MỘT INDEX (không chia nhỏ một index)

   orders có 5 index:
   ┌─────────┬─────────┬─────────┬─────────┬─────────┐
   │ idx_1   │ idx_2   │ idx_3   │ idx_4   │ idx_5   │
   └────┬────┴────┬────┴────┬────┴────┬────┴────┬────┘
      w0        w1        w2        w3        w0 (làm tiếp)

   → bảng 1 index thì PARALLEL vô dụng
   → index nhỏ hơn min_parallel_index_scan_size (512 kB) bị bỏ qua
   → autovacuum KHÔNG dùng song song; chỉ VACUUM thủ công
```

---

## Bốn cách dọn — chọn cái nào

| | `VACUUM` | `VACUUM FULL` | `CLUSTER` | `pg_repack` |
|---|---|---|---|---|
| Cơ chế | Đánh dấu chỗ để tái dùng | Viết lại cả bảng | Viết lại **theo thứ tự index** | Viết lại qua bảng tạm + trigger |
| Khoá | `SHARE UPDATE EXCLUSIVE` (nhẹ) | **`ACCESS EXCLUSIVE`** | **`ACCESS EXCLUSIVE`** | Nhẹ, trừ vài giây cuối |
| Chặn `SELECT` | Không | **Có, toàn bộ thời gian** | **Có** | Chỉ khoảnh khắc tráo |
| Trả đĩa về HĐH | Chỉ khi cắt được đuôi | **Có** | **Có** | **Có** |
| Cần thêm đĩa | Không | **~2× kích thước bảng** | ~2× | ~2× |
| Xây lại index | Không | Có | Có | Có |
| Sắp lại thứ tự vật lý | Không | Không | **Có** | Có (tuỳ chọn) |
| Dùng khi | **99% trường hợp** | Bảo trì có cửa sổ dừng | Cần đọc theo dải liên tục | Production không được dừng |

```text
   CÂY QUYẾT ĐỊNH

   Bảng phình?
     │
     ├─ Chỗ trống sẽ được ghi đè lại sớm?  ──▶ VACUUM thường là đủ.
     │   (bảng ghi liên tục)                   Đừng làm gì thêm.
     │
     └─ Cần trả đĩa thật (vừa xoá 80% dữ liệu)?
          │
          ├─ Có cửa sổ bảo trì?  ──▶ VACUUM FULL (nhanh nhất, đơn giản nhất)
          │
          └─ Không được dừng?    ──▶ pg_repack
                                     (cài extension + cần 2× đĩa trống)
```

Một hiểu nhầm phổ biến cần dẹp:

> **`VACUUM FULL` không phải "`VACUUM` mạnh hơn".** Nó là một lệnh **khác hẳn**: viết lại toàn bộ bảng và index sang file mới rồi tráo. Chạy nó định kỳ theo lịch là sai; nó chỉ dành cho tình huống một lần sau khi xoá lượng lớn dữ liệu.

Ví dụ dùng `pg_repack`:

```bash
# Cài (Debian/Ubuntu)
apt-get install postgresql-16-repack
psql -c "CREATE EXTENSION pg_repack;"

# Dọn một bảng, không chặn ứng dụng
pg_repack -d appdb -t orders --no-superuser-check

# Dọn cả database, 4 luồng
pg_repack -d appdb -j 4
```

---

## Đo bloat: bao nhiêu là quá nhiều

### Cách chính xác (quét thật, chậm)

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;

SELECT * FROM pgstattuple('orders');
```

```text
 table_len   | 1073741824
 tuple_count |    4517089
 tuple_len   |  641928442
 tuple_percent            | 59.78
 dead_tuple_count         |    892011
 dead_tuple_len           | 128449584
 dead_tuple_percent       | 11.96     ◀ xác chết
 free_space               | 291228914
 free_percent             | 27.12     ◀ chỗ trống chờ tái dùng
```

Với bảng rất lớn, dùng bản lấy mẫu (nhanh hơn nhiều, sai số nhỏ):

```sql
SELECT * FROM pgstattuple_approx('orders');
```

### Cách ước lượng (không quét, tức thì)

```sql
SELECT s.schemaname, s.relname,
       pg_size_pretty(pg_relation_size(s.relid))                         AS kich_thuoc,
       s.n_live_tup, s.n_dead_tup,
       round(100.0 * s.n_dead_tup
             / NULLIF(s.n_live_tup + s.n_dead_tup, 0), 1)               AS pct_chet,
       s.last_autovacuum
FROM pg_stat_user_tables s
WHERE pg_relation_size(s.relid) > 100 * 1024 * 1024
ORDER BY s.n_dead_tup DESC
LIMIT 15;
```

### Ngưỡng hành động

```text
   dead_tuple_percent < 10%   → bình thường, không làm gì
   10% - 20%                  → kiểm tra cấu hình autovacuum của bảng đó
   20% - 40%                  → autovacuum không theo kịp: chỉnh scale_factor
   > 40%                      → có thứ gì đó ĐANG CHẶN vacuum → tìm nguyên nhân
                                (đừng vội VACUUM FULL — nó sẽ phình lại ngay)

   free_percent > 40% và ổn định
                              → bảng đã "nở" tới trạng thái cân bằng
                                Chỗ đó được tái dùng. KHÔNG cần làm gì.
```

Dòng cuối rất quan trọng. Bảng ghi nhiều luôn có một lượng chỗ trống nhất định — đó là **bộ đệm hoạt động**, không phải rác. `VACUUM FULL` nó xong thì tuần sau nó lại nở về đúng kích thước cũ, và bạn đã trả giá một lần dừng hệ thống vô ích.

---

## Khi `VACUUM` chạy mà không dọn được gì

Nếu bạn thấy `X are dead but not yet removable` với X lớn, `VACUUM` **không phải** vấn đề. Vấn đề là `xmin horizon` bị giữ. Bốn thủ phạm:

```sql
-- 1. Transaction đang mở lâu
SELECT pid, state, now() - xact_start AS mo_bao_lau, left(query,60)
FROM pg_stat_activity
WHERE xact_start IS NOT NULL AND now() - xact_start > interval '5 min'
ORDER BY xact_start;

-- 2. Khe nhân bản không hoạt động
SELECT slot_name, active, restart_lsn,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS tut_hau
FROM pg_replication_slots;

-- 3. Prepared transaction bị bỏ quên
SELECT gid, prepared, owner, database FROM pg_prepared_xacts ORDER BY prepared;

-- 4. Replica gửi feedback (nếu hot_standby_feedback = on)
SELECT application_name, state, backend_xmin FROM pg_stat_replication;
```

Toàn bộ chủ đề này — kể cả cách xử lý từng trường hợp — ở [bài 5](05-autovacuum-freeze-va-wraparound.md).

---

## Các tuỳ chọn `VACUUM` đáng biết

```sql
-- Bỏ qua dọn index (nhanh gấp nhiều lần, dùng khi cần freeze GẤP)
VACUUM (INDEX_CLEANUP OFF, VERBOSE) bang_lon;

-- Không cắt đuôi bảng → không lấy ACCESS EXCLUSIVE
VACUUM (TRUNCATE OFF) hot_table;

-- Quét cả page có bit all-visible (chẩn đoán hỏng VM)
VACUUM (DISABLE_PAGE_SKIPPING) t;

-- Đóng băng mọi tuple có thể (dùng sau khi nạp dữ liệu lớn)
VACUUM (FREEZE, ANALYZE) bang_luu_tru;

-- Bỏ qua bảng TOAST đi kèm
VACUUM (PROCESS_TOAST OFF) t;

-- Giới hạn lượng shared_buffers vacuum được dùng (PG16+)
VACUUM (BUFFER_USAGE_LIMIT '16MB') bang_lon;

-- Song song 4 luồng cho pha index (PG13+)
VACUUM (PARALLEL 4) t;
```

Tuỳ chọn `INDEX_CLEANUP OFF` là **van cứu hộ**: khi database sắp chạm giới hạn wraparound, bạn cần freeze thật nhanh và không quan tâm index có phình thêm chút nào.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Chạy `VACUUM FULL` theo lịch cron | Chặn toàn bộ hệ thống định kỳ, và bảng phình lại ngay sau đó | Chỉ dùng một lần sau khi xoá lượng lớn; còn lại để autovacuum lo |
| `VACUUM` xong thấy đĩa không giảm → nghĩ là hỏng | Đúng thiết kế: `VACUUM` **đánh dấu để tái dùng**, không trả đĩa | Muốn trả đĩa: `pg_repack` (online) hoặc `VACUUM FULL` (có dừng) |
| Tăng `autovacuum_max_workers` để vacuum nhanh hơn | Ngân sách cost chia đều → mỗi worker chậm hơn | Tăng **cả** `autovacuum_vacuum_cost_limit` |
| Bỏ qua `index scans: N` trong VERBOSE | N > 1 nghĩa là quét index lặp lại N lần, chậm gấp N | Tăng `maintenance_work_mem` / `autovacuum_work_mem` |
| Gõ `VACUUM` thủ công giữa giờ cao điểm | Không bị hãm tốc → ăn hết I/O | `SET vacuum_cost_delay = '10ms';` trước khi chạy |
| Thấy bloat cao → `VACUUM FULL` ngay | Không chữa nguyên nhân; tuần sau lặp lại | Tìm `xmin horizon` bị giữ trước ([bài 5](05-autovacuum-freeze-va-wraparound.md)) |
| Để `maintenance_work_mem` mặc định 64 MB trên máy 64 GB RAM | Vacuum bảng lớn lặp hàng chục lượt | `1GB` cho phiên thủ công; `512MB` cho autovacuum worker |
| Quên rằng vacuum phụ thuộc **số index** | Bảng nhiều index vacuum rất lâu mà không hiểu vì sao | Rà và bỏ index không dùng (`pg_stat_user_indexes.idx_scan = 0`) |

---

## Tóm tắt bài 4

- **`VACUUM` làm sáu việc**: dọn tuple chết, dọn mục index, cập nhật FSM, bật bit VM, **đóng băng tuple cũ**, cắt đuôi bảng. Chỉ việc thứ năm liên quan tới **tính đúng đắn** — bỏ nó đủ lâu thì database dừng ghi.
- **Phải quét heap hai lượt** vì mục index bắt buộc phải xoá **trước** khi giải phóng con trỏ dòng — nếu không, index sẽ trỏ vào dòng khác. Đây là lý do thời gian vacuum phụ thuộc **số index**, không chỉ kích thước bảng.
- **`maintenance_work_mem` quyết định số lượt lặp.** Trước PG17, mỗi ctid chết tốn 6 byte và có trần cứng 1 GB (~179 triệu ctid). PostgreSQL 17 thay bằng **TidStore** — tốn ít bộ nhớ hơn nhiều và **bỏ trần**.
- **Dòng quan trọng nhất trong `VACUUM VERBOSE` là `are dead but not yet removable`.** Nó lớn nghĩa là vấn đề không nằm ở vacuum mà ở `xmin horizon` đang bị ai đó giữ.
- **Autovacuum tự hãm tốc bằng cost-based delay.** Mặc định cũ (delay 20 ms) chỉ cho **3,9 MB/s** page bẩn — nguyên nhân kinh điển của "autovacuum không bao giờ đuổi kịp". Mặc định mới (2 ms) cho ~39 MB/s.
- **Ngân sách cost chia chung cho mọi worker.** Tăng số worker mà không tăng `cost_limit` là chia nhỏ cùng một cái bánh.
- **`VACUUM` thủ công KHÔNG bị hãm tốc** — nó chạy hết công suất I/O. Chạy giờ cao điểm thì phải tự đặt `vacuum_cost_delay`.
- **Pha `truncating heap` lấy `ACCESS EXCLUSIVE`**, chặn cả `SELECT` trong khoảnh khắc. Với bảng cực nóng, đặt `vacuum_truncate = off`.
- **`VACUUM FULL` không phải "vacuum mạnh hơn"** — nó viết lại cả bảng, cần gấp đôi đĩa, chặn tất cả. Dùng `pg_repack` khi không được dừng.
- **`free_percent` cao và ổn định không phải bệnh** — đó là bộ đệm hoạt động của bảng ghi nhiều. `VACUUM FULL` nó chỉ để nó nở lại là công cốc.

**Bài kế tiếp** → [Bài 5: Autovacuum, Freeze và Transaction ID Wraparound](05-autovacuum-freeze-va-wraparound.md) — ai gọi vacuum, khi nào, và điều gì xảy ra nếu nó không kịp.

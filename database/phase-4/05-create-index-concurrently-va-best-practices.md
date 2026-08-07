# Bài 5: `CREATE INDEX CONCURRENTLY` và quy trình đánh index an toàn

Bạn tìm ra một index còn thiếu. Truy vấn sẽ nhanh hơn 200 lần. Bạn gõ:

```sql
CREATE INDEX idx_orders_user ON orders(user_id);
```

Bảng có 400 triệu dòng. Lệnh chạy **43 phút**. Và trong suốt 43 phút đó, **mọi lệnh `INSERT`, `UPDATE`, `DELETE` lên bảng `orders` đều bị treo**. Ứng dụng hết connection sau 90 giây. Toàn hệ thống sập.

Bài này là về cách làm đúng việc đó, cộng với quy trình vận hành index nói chung.

## `CREATE INDEX` khoá cái gì

```text
   CREATE INDEX (thường)  →  giữ khoá SHARE trên bảng

   Cho phép                     Chặn
   ────────                     ────
   SELECT              ✔        INSERT   ✘
                                UPDATE   ✘
                                DELETE   ✘
                                ALTER    ✘
```

Vì sao phải chặn ghi? Vì index đang được dựng từ một ảnh chụp dữ liệu. Nếu có dòng mới chèn vào giữa chừng, index sẽ thiếu dòng đó — và một index thiếu dữ liệu còn tệ hơn không có index, vì truy vấn sẽ trả về kết quả **sai**.

### Nhìn thấy khoá bằng mắt

**Phiên A:**

```sql
CREATE INDEX idx_grades_g ON grades(g);   -- để chạy, đừng ngắt
```

**Phiên B** — chạy ngay trong lúc đó:

```sql
INSERT INTO grades (g, name) VALUES (50, 'test');
-- ...không trả về gì. Đang treo.
```

**Phiên C** — xem chuyện gì đang xảy ra:

```sql
SELECT pid,
       state,
       wait_event_type,
       pg_blocking_pids(pid) AS bi_chan_boi,
       left(query, 45)       AS cau_lenh
FROM pg_stat_activity
WHERE datname = 'postgres' AND state <> 'idle';
```

```text
 pid | state  | wait_event_type | bi_chan_boi |            cau_lenh
-----+--------+-----------------+-------------+---------------------------------
 118 | active | IO              |    {}       | CREATE INDEX idx_grades_g ON gr
 124 | active | Lock            |   {118}     | INSERT INTO grades (g, name) VA
```

Và xem chính xác loại khoá:

```sql
SELECT locktype, relation::regclass, mode, granted
FROM pg_locks WHERE relation = 'grades'::regclass;
```

```text
 locktype | relation |       mode        | granted
----------+----------+-------------------+---------
 relation | grades   | ShareLock         | t        ← CREATE INDEX giữ
 relation | grades   | RowExclusiveLock  | f        ← INSERT đang chờ
```

`granted = f` nghĩa là "đang xếp hàng chờ". Đây là hình ảnh của sự cố ở đầu bài.

---

## `CONCURRENTLY` — dựng index mà không chặn ghi

```sql
CREATE INDEX CONCURRENTLY idx_orders_user ON orders(user_id);
```

Cách nó làm được:

```text
   GIAI ĐOẠN 1 — Đăng ký
      Ghi vào catalog: "có một index đang được dựng, đánh dấu INVALID".
      Từ giây phút này, mọi lệnh ghi mới đều tự động cập nhật index đó.
      → Khoá rất ngắn.

   GIAI ĐOẠN 2 — Quét lần một
      Chờ mọi transaction đang mở kết thúc.
      Quét toàn bảng, dựng index từ dữ liệu hiện có.
      → KHÔNG chặn ghi.

   GIAI ĐOẠN 3 — Quét lần hai
      Chờ mọi transaction đang mở kết thúc (lần nữa).
      Quét lại để nhặt những dòng đã đổi trong lúc giai đoạn 2 chạy.
      → KHÔNG chặn ghi.

   GIAI ĐOẠN 4 — Đánh dấu hợp lệ
      Nếu mọi thứ ổn: bỏ cờ INVALID, index bắt đầu được planner dùng.
```

Cái giá của việc không chặn ghi:

| | `CREATE INDEX` | `CREATE INDEX CONCURRENTLY` |
|---|---|---|
| Chặn ghi | **Có, toàn bộ thời gian** | Không |
| Số lần quét bảng | 1 | **2** |
| Thời gian | Chuẩn | **Chậm hơn 2-3 lần** |
| CPU và I/O | Chuẩn | Cao hơn |
| Có thể thất bại giữa chừng | Không (rollback sạch) | **Có — để lại index INVALID** |
| Chạy trong transaction | Được | **Không được** |

Dòng cuối rất quan trọng với công cụ migration: nhiều framework tự bọc migration trong một transaction, và như vậy `CONCURRENTLY` sẽ báo lỗi.

```text
ERROR:  CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

Cách xử lý tuỳ framework — Rails có `disable_ddl_transaction!`, Django có `atomic = False`, Flyway/Liquibase có cấu hình tương ứng.

---

## Cái bẫy lớn nhất: `CONCURRENTLY` vẫn có thể làm sập hệ thống

Đây là phần quan trọng nhất của bài, và là chỗ rất nhiều người bị bất ngờ.

`CONCURRENTLY` **không chặn ghi**, nhưng nó vẫn cần một khoá **ngắn** ở giai đoạn 1 và 4. Và khoá trong PostgreSQL xếp hàng theo thứ tự — **kẻ đang chờ sẽ chặn mọi kẻ đến sau**.

```text
   t=0    Một transaction phân tích đang mở, đã đọc bảng orders
          → nó giữ AccessShareLock, sẽ còn chạy 20 phút nữa

   t=1    CREATE INDEX CONCURRENTLY khởi động
          → cần khoá nhẹ nhưng xung khắc → XẾP HÀNG CHỜ

   t=2    Một INSERT bình thường tới
          → khoá của nó KHÔNG xung khắc với transaction ở t=0
          → NHƯNG nó phải xếp sau CREATE INDEX trong hàng đợi
          → BỊ CHẶN

   t=3..  Mọi INSERT/UPDATE tiếp theo đều xếp hàng phía sau
          → 20 PHÚT SAU, ỨNG DỤNG ĐÃ CHẾT VÌ HẾT CONNECTION
```

```text
   HÀNG ĐỢI KHOÁ

   [đang giữ]  transaction phân tích (20 phút)
        ↓
   [chờ #1]    CREATE INDEX CONCURRENTLY      ← chặn cả hàng phía sau
        ↓
   [chờ #2]    INSERT
   [chờ #3]    UPDATE
   [chờ #4]    INSERT
        ...
```

Nghịch lý: bạn dùng `CONCURRENTLY` **để tránh** chặn ghi, nhưng nó lại gây chặn ghi vì bị kẹt trong hàng đợi.

### Cách phòng: đặt `lock_timeout`

```sql
SET lock_timeout = '5s';
CREATE INDEX CONCURRENTLY idx_orders_user ON orders(user_id);
```

Nếu không lấy được khoá trong 5 giây, lệnh **thất bại ngay** thay vì ngồi chặn hàng đợi. Bạn dọn dẹp rồi thử lại sau.

### Kiểm tra trước khi chạy

```sql
-- Có transaction nào đang mở lâu không?
SELECT pid,
       now() - xact_start AS mo_bao_lau,
       state,
       left(query, 50)    AS cau_lenh
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
  AND now() - xact_start > interval '1 minute'
ORDER BY xact_start;
```

Thấy dòng nào thì **xử lý nó trước** — hoặc chờ nó xong, hoặc `pg_terminate_backend(pid)` nếu đó là transaction bị bỏ quên.

---

## Khi `CONCURRENTLY` thất bại: index INVALID

```text
ERROR:  could not create unique index "idx_users_email"
DETAIL:  Key (email)=(a@b.com) is duplicated.
```

Index không biến mất. Nó nằm lại ở trạng thái **INVALID**:

```text
   INDEX INVALID:
     • Planner KHÔNG dùng nó → không giúp gì cho truy vấn
     • Nhưng nó VẪN được cập nhật với mọi lệnh ghi → làm chậm ghi
     • Và vẫn chiếm đĩa

   → Tệ nhất trong mọi thế giới. Phải dọn ngay.
```

Tìm chúng:

```sql
SELECT c.relname AS ten_index,
       t.relname AS bang,
       pg_size_pretty(pg_relation_size(c.oid)) AS kich_thuoc
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
JOIN pg_class t ON t.oid = i.indrelid
WHERE NOT i.indisvalid;
```

```text
     ten_index      |  bang  | kich_thuoc
--------------------+--------+------------
 idx_users_email    | users  | 1284 MB
```

Dọn:

```sql
DROP INDEX CONCURRENTLY idx_users_email;
```

> **Quy tắc vận hành:** đưa câu truy vấn tìm index INVALID vào bảng theo dõi. Một index INVALID bị bỏ quên là khoản phí âm thầm trả mãi.

---

## `DROP INDEX` và `REINDEX` cũng có bản CONCURRENTLY

### `DROP INDEX CONCURRENTLY`

`DROP INDEX` thường lấy khoá `ACCESS EXCLUSIVE` — chặn **cả đọc lẫn ghi**. Trên bảng nóng, chỉ vài giây cũng đủ gây sự cố.

```sql
DROP INDEX CONCURRENTLY idx_khong_dung_toi;
```

Cũng không chạy được trong transaction, giống `CREATE`.

### `REINDEX CONCURRENTLY` (từ PostgreSQL 12)

Dùng khi index bị **phình** (bloat) — chiếm nhiều đĩa hơn mức cần thiết do các page bị tách và các mục chết.

```sql
REINDEX INDEX CONCURRENTLY idx_orders_user;
REINDEX TABLE CONCURRENTLY orders;      -- mọi index của bảng
```

Cái giá cần biết trước:

```text
   REINDEX CONCURRENTLY dựng một index MỚI song song với index cũ
   → TRONG LÚC CHẠY, CẦN GẤP ĐÔI DUNG LƯỢNG ĐĨA cho index đó

   Index 40 GB → cần thêm 40 GB trống trong lúc chạy.
   Không đủ đĩa → thất bại giữa chừng → để lại index INVALID.
```

Kiểm tra đĩa trống trước khi chạy. Đây là nguyên nhân thất bại phổ biến nhất.

### Đo mức phình của index

```sql
SELECT
    i.relname                                       AS ten_index,
    pg_size_pretty(pg_relation_size(i.oid))         AS kich_thuoc,
    round(100 * (1 - s.avg_leaf_density / 100), 1)  AS pct_trong
FROM pg_class i
JOIN pg_index x ON x.indexrelid = i.oid
CROSS JOIN LATERAL pgstatindex(i.oid) s
WHERE i.relkind = 'i'
  AND pg_relation_size(i.oid) > 100 * 1024 * 1024
ORDER BY pg_relation_size(i.oid) DESC;
```

Cần extension:

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;
```

```text
    ten_index      | kich_thuoc | pct_trong
-------------------+------------+-----------
 idx_orders_user   | 4218 MB    |      48.2
 idx_orders_status | 1102 MB    |      12.1
```

Ngưỡng thực dụng: **`pct_trong` trên 40%** thì đáng `REINDEX`. Dưới 30% thì để yên — reindex cũng tốn tài nguyên.

Nguyên nhân phình phổ biến nhất chính là khoá ngẫu nhiên gây tách page ([bài 4](04-bloom-filter-va-uuid-performance.md)) và các bảng bị `UPDATE` nhiều.

---

## Quy trình đánh index an toàn trên production

Đây là danh sách chạy được, theo thứ tự:

### Bước 1 — Xác nhận index này thật sự cần

```sql
SELECT left(query, 80)                     AS cau_lenh,
       calls,
       round(total_exec_time::numeric)     AS tong_ms,
       round(mean_exec_time::numeric, 2)   AS tb_ms
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

Nhắc lại từ [bài 1](01-co-ban-ve-indexing.md): xếp theo **tổng thời gian**, không theo trung bình.

### Bước 2 — Xác nhận nó sẽ được dùng

Kiểm tra trên bản sao dữ liệu, hoặc dùng `EXPLAIN` với `GENERIC_PLAN`:

```sql
BEGIN;
CREATE INDEX idx_thu ON orders(user_id, created_at);
EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 42 ORDER BY created_at DESC LIMIT 20;
ROLLBACK;      -- vứt index đi
```

Mẹo này chỉ dùng được trên môi trường thử vì `CREATE INDEX` trong transaction sẽ khoá bảng. Nhưng nó cho câu trả lời chắc chắn: **planner có dùng index này không.**

### Bước 3 — Ước lượng thời gian và dung lượng

```sql
-- Ước lượng thô: index ~ 40-60% kích thước bảng cho một cột int/bigint
SELECT pg_size_pretty(pg_relation_size('orders')) AS bang,
       (SELECT count(*) FROM orders)              AS so_dong;
```

Kinh nghiệm: **khoảng 1-3 phút cho mỗi 10 triệu dòng** với `CONCURRENTLY` trên SSD. Bảng 400 triệu dòng → dự trù 40 phút tới 2 tiếng.

### Bước 4 — Kiểm tra không có transaction dài

```sql
SELECT pid, now() - xact_start AS mo_bao_lau, state, left(query, 50)
FROM pg_stat_activity
WHERE xact_start IS NOT NULL AND now() - xact_start > interval '1 minute';
```

### Bước 5 — Chạy, có phanh

```sql
SET lock_timeout = '5s';
SET statement_timeout = 0;              -- KHÔNG giới hạn thời gian chạy
SET maintenance_work_mem = '2GB';       -- dựng index nhanh hơn nhiều

CREATE INDEX CONCURRENTLY idx_orders_user_created
    ON orders(user_id, created_at DESC);
```

`maintenance_work_mem` đáng chú ý: mặc định chỉ 64 MB. Tăng lên 1-2 GB có thể rút ngắn thời gian dựng index **2-4 lần**, và nó chỉ được dùng bởi các lệnh bảo trì nên không ảnh hưởng truy vấn thường.

### Bước 6 — Theo dõi tiến độ (PostgreSQL 12+)

Từ phiên khác:

```sql
SELECT phase,
       round(100.0 * blocks_done / NULLIF(blocks_total, 0), 1) AS pct,
       blocks_done, blocks_total
FROM pg_stat_progress_create_index;
```

```text
             phase              | pct  | blocks_done | blocks_total
--------------------------------+------+-------------+--------------
 building index: scanning table | 42.7 |      178442 |       418003
```

### Bước 7 — Xác nhận hợp lệ và được dùng

```sql
-- Kiểm tra không INVALID
SELECT indisvalid FROM pg_index WHERE indexrelid = 'idx_orders_user_created'::regclass;

-- Sau vài giờ, kiểm tra nó có được dùng không
SELECT indexrelname, idx_scan
FROM pg_stat_user_indexes WHERE indexrelname = 'idx_orders_user_created';
```

`idx_scan = 0` sau 24 giờ nghĩa là bạn vừa tạo một index vô dụng — xoá đi.

---

## Quy ước đặt tên

Tên index tự sinh của PostgreSQL (`orders_user_id_idx`) khó đọc khi có nhiều index. Quy ước gợi ý:

```text
   idx_<bảng>_<cột1>_<cột2>[_<điều kiện>]

   idx_orders_user_created
   idx_orders_status_pending          ← partial index
   idx_users_email_lower              ← index trên biểu thức
   uq_users_email                     ← unique index
```

Lợi ích thật: nhìn tên là biết index đó phục vụ truy vấn nào, nên khi rà soát index thừa sẽ nhanh hơn nhiều.

## Bảng tra cứu các lệnh

| Việc | Lệnh an toàn cho production |
|---|---|
| Tạo index | `CREATE INDEX CONCURRENTLY ...` |
| Xoá index | `DROP INDEX CONCURRENTLY ...` |
| Dựng lại index phình | `REINDEX INDEX CONCURRENTLY ...` |
| Dựng lại mọi index của bảng | `REINDEX TABLE CONCURRENTLY ...` |
| Đổi tên index | `ALTER INDEX ... RENAME TO ...` (khoá rất ngắn) |
| Xem tiến độ | `SELECT * FROM pg_stat_progress_create_index;` |
| Tìm index INVALID | `SELECT ... FROM pg_index WHERE NOT indisvalid;` |
| Tìm index không dùng | `SELECT ... FROM pg_stat_user_indexes WHERE idx_scan = 0;` |
| Đo phình | `pgstatindex()` từ extension `pgstattuple` |

## Ghi chú cho MySQL

MySQL 5.6+ hỗ trợ **online DDL**, cú pháp khác:

```sql
ALTER TABLE orders
  ADD INDEX idx_user (user_id),
  ALGORITHM=INPLACE, LOCK=NONE;
```

| Tham số | Nghĩa |
|---|---|
| `ALGORITHM=INPLACE` | Không dựng lại cả bảng |
| `ALGORITHM=COPY` | Chép cả bảng — rất chậm, chặn ghi |
| `LOCK=NONE` | Cho phép cả đọc lẫn ghi trong lúc chạy |
| `LOCK=SHARED` | Chỉ cho đọc |

Khai báo tường minh `ALGORITHM=INPLACE, LOCK=NONE` là cách tốt: nếu MySQL **không thể** làm online cho thao tác đó, nó sẽ **báo lỗi ngay** thay vì âm thầm khoá bảng. Đây là kiểu "thất bại sớm" rất đáng dùng.

Với MySQL, công cụ phổ biến cho các thao tác không hỗ trợ online là `pt-online-schema-change` (Percona) hoặc `gh-ost` (GitHub).

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `CREATE INDEX` thường trên bảng lớn ở production | Chặn mọi lệnh ghi hàng chục phút → hết connection → sập | Luôn dùng `CONCURRENTLY` |
| Chạy `CONCURRENTLY` khi có transaction dài đang mở | Nó kẹt hàng đợi và **chặn mọi lệnh ghi phía sau** | Kiểm tra `pg_stat_activity` trước; đặt `lock_timeout` |
| Không đặt `lock_timeout` | Lệnh ngồi chờ vô hạn, kéo cả hàng đợi | `SET lock_timeout = '5s'` |
| Bỏ quên index INVALID sau khi thất bại | Không giúp truy vấn nhưng vẫn làm chậm ghi và tốn đĩa | Rà `pg_index WHERE NOT indisvalid` định kỳ |
| `REINDEX` khi đĩa gần đầy | Cần gấp đôi dung lượng index → thất bại giữa chừng | Kiểm tra đĩa trống trước |
| Để `maintenance_work_mem` mặc định 64 MB | Dựng index chậm 2-4 lần | `SET maintenance_work_mem = '2GB'` trước khi chạy |
| Đặt `statement_timeout` nhỏ rồi chạy tạo index | Lệnh bị cắt giữa chừng → index INVALID | `SET statement_timeout = 0` cho riêng phiên đó |
| Tạo index rồi không kiểm tra nó có được dùng | Trả phí ghi mãi mãi cho một index vô dụng | Kiểm tra `idx_scan` sau 24 giờ |
| `CONCURRENTLY` bên trong migration có transaction | Báo lỗi ngay | Tắt bọc transaction cho migration đó |

## Tóm tắt bài 5

- `CREATE INDEX` thường giữ khoá `SHARE`: **cho đọc, chặn mọi lệnh ghi** suốt thời gian dựng — trên bảng lớn là hàng chục phút.
- `CREATE INDEX CONCURRENTLY` không chặn ghi, đổi lại: **quét bảng hai lần**, chậm hơn 2-3 lần, tốn CPU hơn, **không chạy được trong transaction**, và **có thể thất bại để lại index INVALID**.
- **Cái bẫy lớn nhất**: `CONCURRENTLY` vẫn cần khoá ngắn, và nếu bị một transaction dài chặn thì **nó chặn cả hàng đợi phía sau** — gây đúng sự cố mà nó lẽ ra phải tránh. Phòng bằng `lock_timeout` và kiểm tra `pg_stat_activity` trước.
- **Index INVALID là tệ nhất trong mọi thế giới**: không giúp truy vấn, vẫn làm chậm ghi, vẫn tốn đĩa. Phải rà định kỳ.
- `REINDEX CONCURRENTLY` cần **gấp đôi dung lượng đĩa** trong lúc chạy. Đo phình bằng `pgstatindex`; ngưỡng đáng làm là trên 40% trống.
- `maintenance_work_mem` mặc định 64 MB — tăng lên 1-2 GB rút ngắn thời gian dựng index **2-4 lần**.
- Quy trình 7 bước: xác nhận cần → xác nhận được dùng → ước lượng → kiểm tra transaction dài → chạy có phanh → theo dõi tiến độ → xác nhận hợp lệ và được dùng sau 24 giờ.
- MySQL dùng `ALTER TABLE ... ALGORITHM=INPLACE, LOCK=NONE` — khai báo tường minh để **thất bại sớm** thay vì âm thầm khoá bảng.

**Bài kế tiếp** → [Phase 5 — Bài 1: B-Tree, cấu trúc dữ liệu nền tảng của Database Index](../phase-5/01-btree-co-ban.md)

# Bài 2: Partitioning thực hành với PostgreSQL

Bài này là phòng thí nghiệm. Bạn sẽ dựng một bảng phân mảnh từ đầu, chứng kiến việc cắt tỉa mảnh bằng mắt, tạo index không chặn ghi, tự động hoá việc sinh mảnh mới, và — phần khó nhất — **chuyển một bảng lớn đang chạy sang dạng phân mảnh mà không dừng dịch vụ**.

```bash
docker run --name part-lab -e POSTGRES_PASSWORD=lab -p 5442:5432 -d postgres:16
docker exec -it part-lab psql -U postgres
```

## Hai thế hệ cú pháp

Trước khi bắt đầu, cần biết PostgreSQL có **hai** cách phân mảnh, và tài liệu cũ trên mạng thường nói về cách cũ:

```text
   CÁCH CŨ — KẾ THỪA BẢNG (trước PostgreSQL 10)
   ═════════════════════════════════════════════
   CREATE TABLE events_2026_06 () INHERITS (events);
   + CHECK constraint tự viết
   + TRIGGER tự viết để định tuyến INSERT
   + constraint_exclusion = on

   → Nhiều mã tay, dễ sai, chậm.  KHÔNG DÙNG NỮA.

   CÁCH MỚI — PHÂN MẢNH KHAI BÁO (từ PostgreSQL 10)
   ═════════════════════════════════════════════════
   CREATE TABLE events (...) PARTITION BY RANGE (created_at);
   CREATE TABLE events_2026_06 PARTITION OF events
       FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');

   → Database tự định tuyến, tự cắt tỉa.  DÙNG CÁI NÀY.
```

Nếu tìm thấy hướng dẫn nào bảo bạn viết trigger để định tuyến `INSERT`, đó là tài liệu đã lỗi thời gần một thập kỷ.

---

## Lab 1 — Dựng bảng phân mảnh

```sql
CREATE TABLE events (
    id         BIGSERIAL,
    user_id    BIGINT      NOT NULL,
    event_type TEXT        NOT NULL,
    payload    TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (id, created_at)          -- BẮT BUỘC chứa khoá phân mảnh
) PARTITION BY RANGE (created_at);
```

Thử bỏ `created_at` khỏi khoá chính để thấy lỗi:

```sql
-- PRIMARY KEY (id) → sẽ báo:
```

```text
ERROR:  unique constraint on partitioned table must include all partitioning columns
DETAIL:  PRIMARY KEY constraint on table "events" lacks column "created_at".
```

Tạo các mảnh:

```sql
CREATE TABLE events_2026_06 PARTITION OF events
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE events_2026_07 PARTITION OF events
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE events_2026_08 PARTITION OF events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
```

Chú ý ranh giới: **`FROM` là bao gồm, `TO` là loại trừ.** `'2026-07-01'` thuộc mảnh tháng 7, không thuộc mảnh tháng 6. Viết liền mạch như trên là đúng, không bị hở cũng không bị chồng.

### Mảnh mặc định — lưới an toàn

```sql
CREATE TABLE events_default PARTITION OF events DEFAULT;
```

Không có nó, một `INSERT` với ngày ngoài mọi khoảng sẽ **thất bại**:

```text
ERROR:  no partition of relation "events" found for row
DETAIL:  Partition key of the failing row contains (created_at) = (2026-09-15 ...).
```

Đây là sự cố nửa đêm kinh điển: quên tạo mảnh cho tháng mới, và đúng 00:00:00 ngày 1 thì mọi lệnh ghi bắt đầu lỗi.

> **Nhưng đừng ỷ lại vào mảnh mặc định.** Nó là lưới an toàn, không phải giải pháp. Dữ liệu rơi vào đó sẽ phình mãi, và quan trọng hơn: **khi có mảnh mặc định, việc gắn mảnh mới sẽ phải quét toàn bộ mảnh mặc định** để chắc chắn không có dòng nào lẽ ra thuộc mảnh mới. Nên: có mảnh mặc định + có cảnh báo khi nó không rỗng.

```sql
-- Đưa vào bảng theo dõi
SELECT count(*) AS so_dong_lac_vao_mac_dinh FROM events_default;
```

### Nạp dữ liệu và xem nó đi đâu

```sql
INSERT INTO events (user_id, event_type, payload, created_at)
SELECT (random()*100000)::BIGINT,
       (ARRAY['click','view','purchase','logout'])[1 + (random()*3)::INT],
       repeat('x', 50),
       '2026-06-01'::timestamptz + (random() * interval '92 days')
FROM generate_series(1, 3000000);
```

```text
INSERT 0 3000000
Time: 24118.442 ms (00:24.118)
```

Cột ẩn `tableoid` cho biết mỗi dòng thật sự nằm ở bảng con nào:

```sql
SELECT tableoid::regclass AS mảnh, count(*), min(created_at)::date, max(created_at)::date
FROM events GROUP BY 1 ORDER BY 1;
```

```text
      mảnh      |  count  |    min     |    max
----------------+---------+------------+------------
 events_2026_06 |  978122 | 2026-06-01 | 2026-06-30
 events_2026_07 | 1010883 | 2026-07-01 | 2026-07-31
 events_2026_08 | 1010995 | 2026-08-01 | 2026-08-31
```

Database đã tự định tuyến từng dòng. Không có trigger nào, không có code nào.

---

## Lab 2 — Thấy việc cắt tỉa bằng mắt

```sql
CREATE INDEX ON events (user_id);
CREATE INDEX ON events (created_at);
VACUUM ANALYZE events;
```

Chú ý: `CREATE INDEX` trên bảng cha **tự động tạo index tương ứng trên mọi mảnh**. Kiểm tra:

```sql
SELECT indexrelname, relname
FROM pg_stat_user_indexes WHERE relname LIKE 'events%' ORDER BY relname;
```

```text
           indexrelname            |    relname
-----------------------------------+----------------
 events_2026_06_created_at_idx     | events_2026_06
 events_2026_06_user_id_idx        | events_2026_06
 events_2026_06_pkey               | events_2026_06
 events_2026_07_created_at_idx     | events_2026_07
 ...
```

### Có cắt tỉa

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM events WHERE created_at >= '2026-08-01';
```

```text
Aggregate  (actual time=88.442..88.443 rows=1 loops=1)
  ->  Seq Scan on events_2026_08 events  (actual time=0.018..58.117 rows=1010995 loops=1)
        Filter: (created_at >= '2026-08-01 00:00:00+00'::timestamptz)
  Buffers: shared hit=9884
Execution Time: 88.512 ms
```

**Chỉ một** bảng con xuất hiện. Hai mảnh kia đã bị loại bỏ ngay ở bước lập kế hoạch.

### Không cắt tỉa được

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM events WHERE user_id = 42;
```

```text
Aggregate  (actual time=1.882..1.885 rows=1 loops=1)
  ->  Append  (actual time=0.442..1.842 rows=31 loops=1)
        ->  Index Only Scan using events_2026_06_user_id_idx  (rows=9 loops=1)
        ->  Index Only Scan using events_2026_07_user_id_idx  (rows=11 loops=1)
        ->  Index Only Scan using events_2026_08_user_id_idx  (rows=11 loops=1)
  Buffers: shared hit=12
Execution Time: 1.918 ms
```

Ba mảnh đều bị đụng. Với 3 mảnh thì không sao; với 60 mảnh thì đây là 60 lần tra index thay vì 1.

### Cắt tỉa lúc chạy (runtime pruning)

Khi giá trị chưa biết lúc lập kế hoạch (câu lệnh chuẩn bị sẵn, tham số), PostgreSQL vẫn cắt tỉa được — nhưng ở **thời điểm chạy**:

```sql
PREPARE q(timestamptz) AS SELECT count(*) FROM events WHERE created_at >= $1;
EXPLAIN (ANALYZE) EXECUTE q('2026-08-01');
```

```text
Aggregate  (actual time=88.118..88.119 rows=1 loops=1)
  ->  Append  (actual time=0.022..58.442 rows=1010995 loops=1)
        Subplans Removed: 2                    ← CẮT TỈA LÚC CHẠY
        ->  Seq Scan on events_2026_08 events_1
```

Dòng `Subplans Removed: 2` là dấu hiệu của cắt tỉa lúc chạy. Nó vẫn hiệu quả, chỉ khác là không nhìn thấy trong `EXPLAIN` thường.

Kiểm tra công tắc:

```sql
SHOW enable_partition_pruning;    -- phải là on (mặc định)
```

### Hai tối ưu nên bật thêm

```sql
SET enable_partitionwise_join = on;         -- mặc định off
SET enable_partitionwise_aggregate = on;    -- mặc định off
```

| Tuỳ chọn | Làm gì | Khi nào có lợi |
|---|---|---|
| `partitionwise_join` | `JOIN` hai bảng phân mảnh **giống hệt nhau** theo từng cặp mảnh thay vì gộp trước rồi join | Hai bảng cùng khoá phân mảnh, cùng ranh giới |
| `partitionwise_aggregate` | Gom nhóm trong từng mảnh rồi mới hợp | `GROUP BY` có chứa khoá phân mảnh |

Cả hai mặc định **tắt** vì chúng làm tăng thời gian và bộ nhớ lập kế hoạch. Bật khi bạn thật sự có mẫu truy vấn đó, và đo lại.

---

## Lab 3 — Xoá dữ liệu cũ: so sánh trực tiếp

```sql
\timing on

-- Cách cũ
DELETE FROM events WHERE created_at < '2026-07-01';
```

```text
DELETE 978122
Time: 8442.118 ms (00:08.442)
```

Và bảng vẫn chiếm nguyên dung lượng:

```sql
SELECT pg_size_pretty(pg_relation_size('events_2026_06'));
```

```text
 pg_size_pretty
----------------
 118 MB          ← vẫn nguyên, dù đã xoá hết dòng
```

Khôi phục rồi thử cách phân mảnh:

```sql
DROP TABLE events_2026_06;
```

```text
DROP TABLE
Time: 12.442 ms
```

```text
   8.442 ms  →  12 ms      NHANH HƠN ~700 LẦN
   Và đĩa được trả lại NGAY, không cần VACUUM.
```

Trên bảng thật với hàng trăm triệu dòng, khoảng cách này là **hàng giờ so với mili-giây**.

### Tách thay vì xoá

Nếu cần giữ dữ liệu nhưng không cần nó trong bảng chính:

```sql
-- PostgreSQL 14+: không chặn truy vấn đang chạy
ALTER TABLE events DETACH PARTITION events_2026_07 CONCURRENTLY;
```

Sau lệnh này, `events_2026_07` là một bảng độc lập bình thường. Bạn có thể:

```sql
-- Chuyển sang ổ đĩa rẻ
ALTER TABLE events_2026_07 SET TABLESPACE cold_storage;

-- Hoặc xuất ra file rồi xoá
COPY events_2026_07 TO '/backup/events_2026_07.csv' CSV;
DROP TABLE events_2026_07;
```

---

## Lab 4 — Nạp dữ liệu ngoài rồi gắn vào

Mẫu này rất hữu ích: nạp nặng diễn ra trên một bảng **chưa nằm trong** bảng phân mảnh, nên không ảnh hưởng gì tới hệ thống đang chạy.

```sql
-- Bước 1: bảng thường, giống hệt cấu trúc
CREATE TABLE events_2026_09 (LIKE events INCLUDING ALL);

-- Bước 2: nạp thoải mái, nhanh, không đụng bảng chính
INSERT INTO events_2026_09 (user_id, event_type, payload, created_at)
SELECT (random()*100000)::BIGINT, 'click', repeat('x', 50),
       '2026-09-01'::timestamptz + (random() * interval '29 days')
FROM generate_series(1, 1000000);

-- Bước 3: THÊM RÀNG BUỘC KHỚP VỚI KHOẢNG SẼ GẮN  ← BƯỚC QUAN TRỌNG NHẤT
ALTER TABLE events_2026_09 ADD CONSTRAINT chk_range
  CHECK (created_at >= '2026-09-01' AND created_at < '2026-10-01');

ANALYZE events_2026_09;

-- Bước 4: gắn vào
\timing on
ALTER TABLE events ATTACH PARTITION events_2026_09
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
```

```text
ALTER TABLE
Time: 8.118 ms
```

**Bước 3 là chỗ quyết định.** Nếu bỏ qua nó, PostgreSQL phải **quét toàn bộ** bảng để tự kiểm tra rằng mọi dòng đều nằm trong khoảng — và trong lúc quét, nó giữ khoá `ACCESS EXCLUSIVE` trên bảng cha, chặn **mọi** truy vấn.

```text
   CÓ CHECK constraint trước     →  8 ms, khoá gần như không cảm nhận được
   KHÔNG có                      →  quét cả bảng, khoá bảng cha suốt thời gian đó
```

Với bảng 100 triệu dòng, khác biệt là **8 mili-giây so với vài phút hệ thống đứng**.

---

## Lab 5 — Tạo index không chặn ghi trên bảng phân mảnh

Đây là chỗ dễ vấp. `CREATE INDEX CONCURRENTLY` **không chạy được** trực tiếp trên bảng phân mảnh:

```sql
CREATE INDEX CONCURRENTLY idx_events_type ON events (event_type);
```

```text
ERROR:  cannot create index on partitioned table "events" concurrently
```

Quy trình đúng gồm ba bước:

```sql
-- Bước 1: tạo index "rỗng" trên bảng cha, KHÔNG lan xuống mảnh
CREATE INDEX idx_events_type ON ONLY events (event_type);
-- Index này ở trạng thái INVALID cho tới khi mọi mảnh có index con
```

```sql
-- Bước 2: tạo index trên TỪNG mảnh, có CONCURRENTLY
CREATE INDEX CONCURRENTLY idx_events_2026_07_type ON events_2026_07 (event_type);
CREATE INDEX CONCURRENTLY idx_events_2026_08_type ON events_2026_08 (event_type);
CREATE INDEX CONCURRENTLY idx_events_2026_09_type ON events_2026_09 (event_type);
```

```sql
-- Bước 3: gắn từng index con vào index cha
ALTER INDEX idx_events_type ATTACH PARTITION idx_events_2026_07_type;
ALTER INDEX idx_events_type ATTACH PARTITION idx_events_2026_08_type;
ALTER INDEX idx_events_type ATTACH PARTITION idx_events_2026_09_type;
```

Kiểm tra index cha đã hợp lệ:

```sql
SELECT indisvalid FROM pg_index WHERE indexrelid = 'idx_events_type'::regclass;
```

```text
 indisvalid
------------
 t
```

Chỉ khi **mọi** mảnh đã có index con được gắn, index cha mới chuyển sang hợp lệ. Quên một mảnh thì nó ở INVALID mãi.

---

## Lab 6 — Tự động sinh mảnh mới

Quên tạo mảnh cho kỳ tới là sự cố phổ biến nhất khi vận hành bảng phân mảnh. Hai cách tự động hoá.

### Cách A — Hàm tự viết + `pg_cron`

```sql
CREATE OR REPLACE FUNCTION tao_manh_thang_toi(ten_bang TEXT, so_thang_truoc INT DEFAULT 3)
RETURNS void AS $$
DECLARE
    i          INT;
    bat_dau    DATE;
    ket_thuc   DATE;
    ten_manh   TEXT;
BEGIN
    FOR i IN 0..so_thang_truoc LOOP
        bat_dau  := date_trunc('month', CURRENT_DATE) + (i || ' month')::interval;
        ket_thuc := bat_dau + interval '1 month';
        ten_manh := format('%s_%s', ten_bang, to_char(bat_dau, 'YYYY_MM'));

        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = ten_manh) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
                ten_manh, ten_bang, bat_dau, ket_thuc);
            RAISE NOTICE 'Đã tạo mảnh %', ten_manh;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

```sql
SELECT tao_manh_thang_toi('events');
```

```text
NOTICE:  Đã tạo mảnh events_2026_10
NOTICE:  Đã tạo mảnh events_2026_11
NOTICE:  Đã tạo mảnh events_2026_12
```

Tham số `so_thang_truoc = 3` là chủ ý: **luôn tạo dư vài kỳ**. Nếu job chạy hàng ngày mà chết mất một tuần, bạn vẫn còn mảnh dùng.

Lên lịch:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('tao-manh', '0 3 * * *', $$SELECT tao_manh_thang_toi('events')$$);
```

Và hàm dọn mảnh cũ:

```sql
CREATE OR REPLACE FUNCTION xoa_manh_qua_han(ten_bang TEXT, giu_bao_nhieu_thang INT)
RETURNS void AS $$
DECLARE
    r         RECORD;
    nguong    DATE := date_trunc('month', CURRENT_DATE)
                      - (giu_bao_nhieu_thang || ' month')::interval;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_inherits i ON i.inhrelid = c.oid
        WHERE i.inhparent = ten_bang::regclass
          AND c.relname ~ '_\d{4}_\d{2}$'
          AND to_date(right(c.relname, 7), 'YYYY_MM') < nguong
    LOOP
        EXECUTE format('DROP TABLE %I', r.relname);
        RAISE NOTICE 'Đã xoá mảnh %', r.relname;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

> **Cảnh báo:** hàm này **xoá dữ liệu vĩnh viễn**. Trước khi bật tự động, chạy ở chế độ chỉ in ra tên mảnh trong vài chu kỳ để xác nhận nó chọn đúng. Và đảm bảo có sao lưu.

### Cách B — `pg_partman`

Nếu môi trường cho phép cài extension, `pg_partman` lo mọi thứ:

```sql
CREATE EXTENSION pg_partman;

SELECT partman.create_parent(
    p_parent_table := 'public.events',
    p_control      := 'created_at',
    p_interval     := '1 month',
    p_premake      := 4                   -- luôn giữ sẵn 4 kỳ tương lai
);

UPDATE partman.part_config
SET retention = '6 months',               -- giữ 6 tháng
    retention_keep_table = false          -- hết hạn thì DROP luôn
WHERE parent_table = 'public.events';
```

Rồi lên lịch cho tiến trình bảo trì của nó:

```sql
SELECT cron.schedule('partman', '0 3 * * *', $$SELECT partman.run_maintenance()$$);
```

Với hệ thống nghiêm túc, `pg_partman` gần như luôn là lựa chọn đúng — nó đã xử lý sẵn hàng chục trường hợp biên mà hàm tự viết sẽ gặp.

---

## Lab 7 — Chuyển bảng lớn đang chạy sang dạng phân mảnh

Đây là phần khó nhất và ít tài liệu nói nhất. Bạn có bảng `orders` 400 GB đang phục vụ production. Không thể dừng.

Vấn đề cốt lõi: **không có lệnh nào biến một bảng thường thành bảng phân mảnh tại chỗ.** Phải tạo bảng mới rồi chuyển dữ liệu.

### Chiến lược 1 — Cửa sổ bảo trì (đơn giản nhất, cần dừng dịch vụ)

```sql
BEGIN;
ALTER TABLE orders RENAME TO orders_old;

CREATE TABLE orders (LIKE orders_old INCLUDING ALL) PARTITION BY RANGE (created_at);
-- tạo các mảnh...

INSERT INTO orders SELECT * FROM orders_old;   -- CHẬM: hàng giờ với 400 GB
COMMIT;
```

Chỉ dùng được nếu chịu được vài giờ dừng. Với phần lớn hệ thống thì không.

### Chiến lược 2 — Bảng cũ thành một mảnh (nhanh nhất, khuyến nghị)

Mẹo: **gắn luôn bảng cũ vào làm mảnh "quá khứ"**, chỉ phân mảnh cho dữ liệu mới.

```sql
-- Bước 1: đổi tên
ALTER TABLE orders RENAME TO orders_historical;

-- Bước 2: thêm CHECK khớp với khoảng sẽ gắn (chạy được với NOT VALID để không khoá lâu)
ALTER TABLE orders_historical
  ADD CONSTRAINT chk_hist CHECK (created_at < '2026-09-01') NOT VALID;
ALTER TABLE orders_historical VALIDATE CONSTRAINT chk_hist;   -- quét nhưng khoá nhẹ

-- Bước 3: bảng cha mới
CREATE TABLE orders (LIKE orders_historical INCLUDING ALL)
  PARTITION BY RANGE (created_at);

-- Bước 4: gắn bảng cũ làm mảnh quá khứ — TỨC THÌ nhờ có CHECK ở bước 2
ALTER TABLE orders ATTACH PARTITION orders_historical
  FOR VALUES FROM (MINVALUE) TO ('2026-09-01');

-- Bước 5: mảnh cho dữ liệu mới
CREATE TABLE orders_2026_09 PARTITION OF orders
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
```

```text
   ƯU ĐIỂM: KHÔNG chép dữ liệu. Bước 4 chỉ mất mili-giây.
   NHƯỢC:   mảnh "quá khứ" vẫn là một khối 400 GB — không cắt tỉa được
            bên trong nó. Nhưng dữ liệu mới thì đã phân mảnh đàng hoàng.

   → Sau này có thể chia nhỏ mảnh quá khứ dần dần, khi rảnh.
```

Đây là chiến lược tốt nhất cho phần lớn trường hợp: **đổi được ngay, gần như không rủi ro, và cải thiện dần theo thời gian**.

### Chiến lược 3 — Chép nền, đổi tên cuối cùng

Dùng khi bắt buộc phải phân mảnh cả dữ liệu cũ:

```text
   1. Tạo bảng phân mảnh mới `orders_new`
   2. Chép dữ liệu theo LÔ (ví dụ mỗi lô 1 tháng), chạy nền nhiều ngày
   3. Đặt TRIGGER trên `orders` để nhân đôi mọi thay đổi sang `orders_new`
   4. Khi đã bắt kịp: trong một transaction ngắn, đổi tên hai bảng
   5. Theo dõi, và giữ bảng cũ vài ngày để có thể quay lại
```

Phức tạp hơn nhiều, nhưng dừng dịch vụ chỉ vài giây. Các công cụ như `pg_repack` hoặc pattern của `gh-ost` (bên MySQL) đi theo hướng này.

---

## Theo dõi bảng phân mảnh

```sql
-- Kích thước từng mảnh
SELECT c.relname                                   AS manh,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS tong,
       (SELECT reltuples::BIGINT FROM pg_class WHERE oid = c.oid) AS so_dong_uoc
FROM pg_class c
JOIN pg_inherits i ON i.inhrelid = c.oid
WHERE i.inhparent = 'events'::regclass
ORDER BY c.relname;
```

```text
      manh      |  tong  | so_dong_uoc
----------------+--------+-------------
 events_2026_07 | 152 MB |     1010883
 events_2026_08 | 152 MB |     1010995
 events_2026_09 | 148 MB |     1000000
 events_default |   8 kB |           0
```

```sql
-- Mảnh nào đang nóng
SELECT relname, seq_scan, idx_scan, n_tup_ins, n_tup_upd, n_tup_del
FROM pg_stat_user_tables
WHERE relname LIKE 'events_%' ORDER BY relname;
```

Ba cảnh báo nên đưa vào hệ thống theo dõi:

| Cảnh báo | Truy vấn | Ngưỡng |
|---|---|---|
| Mảnh mặc định có dữ liệu | `SELECT count(*) FROM events_default` | `> 0` |
| Thiếu mảnh cho kỳ tới | Kiểm tra tồn tại mảnh của tháng sau | Không tồn tại |
| Số mảnh quá nhiều | Đếm `pg_inherits` | `> 100` |

---

## Ghi chú cho MySQL

MySQL cũng có partitioning, cú pháp gọn hơn nhưng ít linh hoạt hơn:

```sql
CREATE TABLE events (
    id         BIGINT AUTO_INCREMENT,
    user_id    BIGINT,
    created_at DATE NOT NULL,
    PRIMARY KEY (id, created_at)
)
PARTITION BY RANGE (TO_DAYS(created_at)) (
    PARTITION p202606 VALUES LESS THAN (TO_DAYS('2026-07-01')),
    PARTITION p202607 VALUES LESS THAN (TO_DAYS('2026-08-01')),
    PARTITION pmax    VALUES LESS THAN MAXVALUE
);

ALTER TABLE events DROP PARTITION p202606;
```

Khác biệt cần biết:

| | PostgreSQL | MySQL |
|---|---|---|
| Mảnh là bảng độc lập | **Có** — truy vấn trực tiếp được | Không — chỉ là mảnh bên trong |
| Gắn bảng ngoài vào | **Có** (`ATTACH PARTITION`) | Có (`EXCHANGE PARTITION`, hạn chế hơn) |
| Khoá ngoại | Hỗ trợ (từ PG12) | **Không hỗ trợ** trên bảng phân mảnh |
| Số mảnh tối đa | Không giới hạn cứng | 8.192 |
| Mảnh trên tablespace khác | **Có** | Có, hạn chế |

Điểm quan trọng nhất: **MySQL không cho dùng khoá ngoại trên bảng phân mảnh** — cả chiều trỏ đi lẫn chiều được trỏ tới. Đây thường là yếu tố quyết định.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `ATTACH PARTITION` không có `CHECK` trước | Quét toàn bảng trong lúc giữ khoá `ACCESS EXCLUSIVE` | Luôn thêm `CHECK` khớp khoảng trước khi gắn |
| Quên tạo mảnh cho kỳ tới | `INSERT` lỗi lúc 00:00 ngày 1 | Job tự động tạo dư 3-4 kỳ + mảnh `DEFAULT` |
| Ỷ lại vào mảnh `DEFAULT` | Nó phình mãi, và làm chậm việc gắn mảnh mới | Cảnh báo khi nó không rỗng |
| `CREATE INDEX CONCURRENTLY` trực tiếp trên bảng cha | Báo lỗi | Quy trình 3 bước: `ON ONLY` → từng mảnh → `ATTACH` |
| Ranh giới mảnh bị hở hoặc chồng | Dòng rơi vào `DEFAULT` hoặc lệnh tạo mảnh bị từ chối | `TO` của mảnh này = `FROM` của mảnh sau |
| Bật `partitionwise_join` khi không có mẫu truy vấn phù hợp | Tăng thời gian và bộ nhớ lập kế hoạch vô ích | Chỉ bật khi đo được lợi ích |
| Dùng hướng dẫn cũ với trigger định tuyến | Chậm, dễ sai, mất cắt tỉa | Chỉ dùng phân mảnh khai báo (PG10+) |
| Chuyển bảng lớn bằng `INSERT ... SELECT` trong giờ làm việc | Hàng giờ dừng dịch vụ | Chiến lược 2: gắn bảng cũ làm mảnh quá khứ |

## Tóm tắt bài 2

- Chỉ dùng **phân mảnh khai báo** (PostgreSQL 10+). Mọi hướng dẫn có trigger định tuyến đều đã lỗi thời.
- Khoá chính **bắt buộc chứa cột phân mảnh**; ranh giới `FROM` bao gồm, `TO` loại trừ.
- **Mảnh `DEFAULT` là lưới an toàn, không phải giải pháp** — có nó nhưng phải cảnh báo khi nó không rỗng, vì nó làm chậm việc gắn mảnh mới.
- Cột ẩn **`tableoid`** cho biết mỗi dòng thật sự nằm ở mảnh nào — công cụ chẩn đoán số một.
- `Subplans Removed: N` trong `EXPLAIN` là dấu hiệu **cắt tỉa lúc chạy** — vẫn hiệu quả dù không thấy trong `EXPLAIN` thường.
- Xoá dữ liệu cũ: `DELETE` 978.000 dòng mất **8.442 ms và không trả lại đĩa**; `DROP TABLE` mảnh mất **12 ms và trả đĩa ngay**.
- **`ATTACH PARTITION` phải có `CHECK` constraint trước** — nếu không, PostgreSQL quét toàn bảng trong lúc giữ khoá chặn mọi truy vấn.
- Tạo index không chặn ghi cần **quy trình ba bước**: `ON ONLY` trên cha → `CONCURRENTLY` từng mảnh → `ALTER INDEX ... ATTACH`.
- Luôn **tự động sinh mảnh dư 3-4 kỳ** — bằng hàm tự viết + `pg_cron`, hoặc `pg_partman`.
- Chuyển bảng lớn đang chạy: chiến lược tốt nhất là **gắn bảng cũ làm mảnh quá khứ** — mất mili-giây, không chép dữ liệu, cải thiện dần về sau.

**Bài kế tiếp** → [Phase 7 — Bài 1: Database Sharding là gì](../phase-7/01-database-sharding-la-gi.md)

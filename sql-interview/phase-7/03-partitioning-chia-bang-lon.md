# Bài 3: Partitioning — chia bảng lớn thành nhiều mảnh

Netflix có hơn 300 triệu người dùng. Mỗi giây, hàng triệu sự kiện xem phim được ghi lại — tổng cộng hàng tỷ dòng. Vậy làm sao khi bạn mở app, nó biết ngay bạn đã xem gì hôm qua, chỉ trong vài mili giây?

Đây không phải phép màu. Đây là **table partitioning** (phân vùng bảng).

Ý tưởng gọn tới mức dễ bị hiểu nhầm:

> **Partitioning không làm dữ liệu nhỏ đi. Nó không nén, không xoá gì cả. Nó giúp database biết CHỖ NÀO KHÔNG CẦN NHÌN TỚI.**

Phase-3 bài 4 đã giới thiệu partitioning ở mức cơ bản. Bài này đi sâu vào phần quyết định thành bại: chọn khoá phân vùng, các bẫy làm mất partition pruning, ràng buộc bị vỡ, và vận hành vòng đời partition.

## Cơ chế: partition pruning

```text
KHÔNG PARTITION — bảng events, 1 tỷ dòng, 400 GB
   WHERE created_at = '2026-06-15'
   → Index scan trên B+Tree chứa đủ 1 tỷ mục
   → Index cao 5 tầng, và bản thân index nặng 30 GB (không nằm gọn trong RAM)

CÓ PARTITION theo tháng — 36 mảnh, mỗi mảnh ~28 triệu dòng
   ┌────────┬────────┬────────┬────────┬────────┬────────┐
   │2026_01 │2026_02 │2026_03 │2026_04 │2026_05 │2026_06 │ ...
   └────────┴────────┴────────┴────────┴────────┴────────┘
                                                    ▲
   WHERE created_at = '2026-06-15'
   → Optimizer LOẠI BỎ 35 mảnh ngay ở bước lập kế hoạch
   → Chỉ chạm đúng 1 mảnh, index của mảnh đó chỉ 800 MB, cao 4 tầng
```

Bước "loại bỏ 35 mảnh" gọi là **partition pruning** (tỉa phân vùng). Nó là **toàn bộ giá trị** của partitioning. Mất pruning thì partitioning chỉ còn là gánh nặng.

## Ba kiểu phân vùng

```sql
-- ① RANGE — theo khoảng. Phổ biến nhất, dùng cho thời gian.
CREATE TABLE events (
    event_id   BIGSERIAL,
    user_id    BIGINT      NOT NULL,
    event_type TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (event_id, created_at)   -- ⚠ khoá phân vùng PHẢI nằm trong PK
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_06 PARTITION OF events
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE events_2026_07 PARTITION OF events
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

-- Bắt mọi giá trị không thuộc mảnh nào — cứu bạn khỏi lỗi INSERT
CREATE TABLE events_default PARTITION OF events DEFAULT;


-- ② LIST — theo danh sách giá trị rời rạc
CREATE TABLE orders (
    order_id BIGSERIAL, region TEXT NOT NULL, ...
) PARTITION BY LIST (region);

CREATE TABLE orders_bac  PARTITION OF orders FOR VALUES IN ('HN','HP','QN');
CREATE TABLE orders_nam  PARTITION OF orders FOR VALUES IN ('HCM','CT','BD');


-- ③ HASH — chia đều theo hàm băm. Dùng khi không có tiêu chí tự nhiên.
CREATE TABLE sessions (
    session_id UUID, user_id BIGINT NOT NULL, ...
) PARTITION BY HASH (user_id);

CREATE TABLE sessions_p0 PARTITION OF sessions FOR VALUES WITH (MODULUS 8, REMAINDER 0);
CREATE TABLE sessions_p1 PARTITION OF sessions FOR VALUES WITH (MODULUS 8, REMAINDER 1);
-- ... p2..p7
```

| Kiểu | Dùng khi | Lợi ích chính | Bẫy |
|---|---|---|---|
| `RANGE` | Dữ liệu theo thời gian (log, event, đơn hàng) | `DROP PARTITION` để dọn dữ liệu cũ — tức thì | Mảnh mới nhất thành điểm nóng ghi |
| `LIST` | Theo vùng, theo tenant, theo trạng thái | Tách biệt rõ ràng, dễ backup riêng | Phân bố lệch nếu một giá trị áp đảo |
| `HASH` | Chia đều tải, không có tiêu chí tự nhiên | Cân bằng tự nhiên | **Không** `DROP PARTITION` để dọn dữ liệu cũ được |

Có thể phân vùng **nhiều tầng**:

```sql
CREATE TABLE events_2026_06 PARTITION OF events
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01')
    PARTITION BY HASH (user_id);          -- tháng 6 lại chia tiếp thành 4 mảnh
```

Nhưng cẩn thận: mỗi tầng nhân số mảnh lên, và số mảnh là thứ có trần (xem phần sau).

## Bẫy số một: viết query làm mất pruning

Đây là chỗ 90% người dùng partition mà không được lợi gì.

```sql
-- ❌ Bọc hàm quanh khoá phân vùng → optimizer không tỉa được
SELECT * FROM events WHERE date_trunc('day', created_at) = '2026-06-15';
-- → quét TẤT CẢ 36 mảnh

-- ✅ Để khoá phân vùng trần trụi, so sánh khoảng
SELECT * FROM events
WHERE created_at >= '2026-06-15' AND created_at < '2026-06-16';
-- → chạm đúng 1 mảnh
```

Bốn cách khác cũng giết pruning:

```sql
-- ❌ Không có điều kiện trên khoá phân vùng
SELECT * FROM events WHERE user_id = 42;              -- quét mọi mảnh

-- ❌ Hàm không ổn định (volatile) — optimizer không biết trước giá trị
SELECT * FROM events WHERE created_at > (SELECT max(ts) FROM checkpoints);
-- → PG 11+ có RUNTIME pruning cứu được trường hợp này, PG cũ thì không

-- ❌ Ép kiểu ngầm giữa timestamptz và text
SELECT * FROM events WHERE created_at::text LIKE '2026-06%';

-- ❌ OR giữa khoá phân vùng và cột khác
SELECT * FROM events WHERE created_at = '2026-06-15' OR user_id = 42;
```

**Cách kiểm chứng — luôn làm sau khi tạo partition:**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM events WHERE created_at >= '2026-06-15' AND created_at < '2026-06-16';
```

```text
Aggregate  (cost=... rows=1)
  ->  Seq Scan on events_2026_06 events  (actual rows=284192)
                   ▲▲▲▲▲▲▲▲▲▲▲▲▲▲
        CHỈ MỘT mảnh xuất hiện → pruning hoạt động

-- Nếu bạn thấy "Append" với 36 nhánh con → pruning KHÔNG hoạt động
```

Hai loại pruning cần phân biệt:

| Loại | Xảy ra khi | Ví dụ |
|---|---|---|
| **Plan-time pruning** | Giá trị đã biết lúc lập kế hoạch | `WHERE created_at = '2026-06-15'` |
| **Run-time pruning** (PG 11+) | Giá trị chỉ biết lúc chạy | tham số `$1`, subquery, nested loop |

Với run-time pruning, `EXPLAIN` không kèm `ANALYZE` vẫn hiện đủ 36 mảnh — bạn phải xem dòng `(never executed)` trong `EXPLAIN ANALYZE` để biết mảnh nào thật sự bị chạm.

## Bẫy số hai: khoá phân vùng phải nằm trong mọi ràng buộc duy nhất

Đây là hạn chế đau nhất và là lý do nhiều dự án phải thiết kế lại giữa chừng.

```sql
CREATE TABLE events (
    event_id   BIGSERIAL PRIMARY KEY,        -- ❌ LỖI
    created_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);
-- ERROR: unique constraint on partitioned table must include all
--        partitioning columns
```

Lý do: index của mỗi mảnh là **cục bộ**. Postgres không có index toàn cục nào để kiểm tra `event_id` có trùng ở mảnh khác hay không.

```sql
-- ✅ Buộc phải ghép khoá phân vùng vào PK
PRIMARY KEY (event_id, created_at)
```

Hệ quả dây chuyền — phần thật sự đau:

```sql
-- ① Khoá ngoại trỏ TỚI bảng phân vùng phải trỏ vào cả cặp khoá
CREATE TABLE event_details (
    event_id   BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,           -- phải mang theo cột này
    FOREIGN KEY (event_id, created_at) REFERENCES events(event_id, created_at)
);

-- ② UNIQUE trên cột khác không tạo được
CREATE UNIQUE INDEX ON events (idempotency_key);   -- ❌ không được
-- → phải là UNIQUE (idempotency_key, created_at), tức là KHÔNG còn đảm bảo
--   toàn cục nữa: cùng một key ở hai tháng khác nhau vẫn lọt qua
```

Điểm ② là bẫy nghiêm trọng cho các bảng cần idempotency (chống trùng). Cách xử lý:

```sql
-- Tách khoá chống trùng ra một bảng nhỏ KHÔNG phân vùng
CREATE TABLE idempotency_keys (
    key        TEXT PRIMARY KEY,
    event_id   BIGINT      NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);
-- Bảng này nhỏ, chỉ giữ 30 ngày, và đảm bảo duy nhất TOÀN CỤC
```

## Vòng lặp vận hành: tạo trước, dọn sau

Partition không tự sinh ra. Quên tạo mảnh cho tháng sau nghĩa là **mọi lệnh ghi thất bại lúc 0h ngày 1**:

```text
ERROR: no partition of relation "events" found for row
DETAIL: Partition key of the failing row contains (created_at) = (2026-08-01 00:00:03+07).
```

`DEFAULT PARTITION` cứu bạn khỏi lỗi này, nhưng dữ liệu rơi vào đó sẽ không được pruning và sẽ khoá bảng khi bạn tạo mảnh thật sau đó. Nên coi nó là **lưới an toàn có cảnh báo**, không phải giải pháp.

Tự động hoá bằng job hằng ngày:

```sql
CREATE OR REPLACE PROCEDURE bao_tri_partition() LANGUAGE plpgsql AS $$
DECLARE
    thang    DATE;
    ten_mang TEXT;
BEGIN
    -- Tạo trước 3 tháng
    FOR i IN 0..2 LOOP
        thang    := date_trunc('month', now())::date + (i || ' months')::interval;
        ten_mang := 'events_' || to_char(thang, 'YYYY_MM');
        IF to_regclass(ten_mang) IS NULL THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
                ten_mang, thang, thang + INTERVAL '1 month');
            EXECUTE format('CREATE INDEX ON %I (user_id, created_at)', ten_mang);
            RAISE NOTICE 'Đã tạo %', ten_mang;
        END IF;
    END LOOP;

    -- Dọn mảnh quá 24 tháng — TỨC THÌ, không sinh WAL như DELETE
    FOR ten_mang IN
        SELECT c.relname FROM pg_class c
        JOIN pg_inherits i ON i.inhrelid = c.oid
        WHERE i.inhparent = 'events'::regclass
          AND c.relname < 'events_' || to_char(now() - INTERVAL '24 months', 'YYYY_MM')
    LOOP
        EXECUTE format('DROP TABLE %I', ten_mang);
        RAISE NOTICE 'Đã dọn %', ten_mang;
    END LOOP;
END $$;
```

Hoặc dùng extension `pg_partman` — nó lo toàn bộ vòng đời này, bao gồm cả việc chuyển mảnh cũ sang lưu trữ nén.

**Đây chính là lợi ích lớn nhất của partitioning theo thời gian**, và là câu trả lời ăn điểm:

```text
Xoá 300 triệu dòng cũ:
   DELETE FROM events WHERE created_at < '2024-08-01';
   → hàng giờ, WAL khổng lồ, replica trễ, bloat, phải VACUUM FULL

   DROP TABLE events_2024_07;
   → vài mili giây, gần như không sinh WAL, trả đĩa về hệ điều hành NGAY
```

Trước khi xoá hẳn, có thể tách ra để lưu trữ:

```sql
-- Tách mảnh ra khỏi bảng cha mà không xoá dữ liệu
ALTER TABLE events DETACH PARTITION events_2024_07 CONCURRENTLY;   -- PG 14+, không khoá lâu
-- Giờ nó là bảng độc lập: nén, chuyển sang tablespace chậm, dump ra S3, rồi drop
```

## Khi nào KHÔNG nên partition

Partitioning không phải viên đạn bạc. Với bảng nhỏ, nó **làm chậm đi**.

| Dấu hiệu nên partition | Dấu hiệu KHÔNG nên |
|---|---|
| Bảng > ~100 GB hoặc > vài trăm triệu dòng | Bảng dưới 50 GB |
| Có nhu cầu **xoá dữ liệu cũ theo lô lớn** | Không bao giờ xoá dữ liệu |
| Hầu hết query đều lọc theo một cột rõ ràng | Query truy cập ngẫu nhiên toàn bảng |
| Bảo trì (`VACUUM`, `REINDEX`) quá nặng | Bảo trì đang ổn |
| Cần tách dữ liệu nóng/lạnh sang lưu trữ khác | Toàn bộ dữ liệu đều nóng |

**Ba cái giá phải trả:**

**① Thời gian lập kế hoạch tăng theo số mảnh.** Optimizer phải xét từng mảnh. Với vài nghìn mảnh, thời gian planning có thể vượt cả thời gian thực thi.

```text
Số mảnh khuyến nghị:  vài chục tới vài trăm.
Vượt ~1.000 mảnh → planning time trở thành vấn đề rõ rệt.
→ Chia theo THÁNG (36 mảnh cho 3 năm) tốt hơn chia theo NGÀY (1.095 mảnh).
```

Có thể giảm bằng `enable_partition_pruning = on` (mặc định) và tăng `max_locks_per_transaction` — mỗi mảnh cần một khoá.

**② Query không lọc theo khoá phân vùng thì chậm hơn bảng thường**, vì phải mở và quét mọi mảnh, mỗi mảnh một index riêng.

**③ Ràng buộc duy nhất toàn cục biến mất** (đã nói ở trên).

## Partitioning vs Sharding — đừng lẫn

Đây là câu hỏi phỏng vấn hay đi kèm:

```text
PARTITIONING
   • Chia bảng thành nhiều mảnh TRÊN CÙNG MỘT MÁY (hoặc cùng một cluster)
   • Ứng dụng không biết gì — vẫn query một tên bảng
   • Vẫn có transaction ACID xuyên mảnh
   • Giải bài toán: bảo trì nặng, xoá dữ liệu cũ, quét bảng lớn

SHARDING
   • Chia bảng thành nhiều mảnh TRÊN NHIỀU MÁY KHÁC NHAU
   • Cần lớp định tuyến, ứng dụng hoặc proxy phải biết mảnh nào ở máy nào
   • JOIN và transaction xuyên shard rất đắt hoặc không có
   • Giải bài toán: một máy không đủ CPU/RAM/đĩa/thông lượng ghi
```

**Partition trước, shard sau.** Partitioning rẻ hơn nhiều và giải được phần lớn vấn đề. Chỉ shard khi đã chạm trần của một máy (xem bài 4).

## MySQL và các hệ khác

| Hệ | Hỗ trợ | Khác biệt đáng chú ý |
|---|---|---|
| PostgreSQL 10+ | Declarative partitioning | Mạnh nhất; PG 11+ có run-time pruning, PG 14+ có `DETACH CONCURRENTLY` |
| PostgreSQL < 10 | Inheritance + trigger | Thủ công, chậm, nên nâng cấp |
| MySQL 8 | `PARTITION BY RANGE/LIST/HASH/KEY` | **Không hỗ trợ khoá ngoại** trên bảng phân vùng; giới hạn 8192 mảnh |
| Oracle | Rất mạnh, có global index | Global index giữ được unique toàn cục — Postgres chưa có |
| SQL Server | Partition function + scheme | `SWITCH PARTITION` để trao đổi dữ liệu tức thì |

Điểm khác biệt lớn nhất: **Oracle và SQL Server có global index**, cho phép giữ `UNIQUE` toàn cục trên cột không phải khoá phân vùng. PostgreSQL và MySQL thì chưa — đó là lý do bạn phải ghép khoá phân vùng vào PK.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Query bọc hàm quanh khoá phân vùng | Mất pruning, quét mọi mảnh | Giữ cột trần, so sánh khoảng |
| Query không lọc theo khoá phân vùng | Chậm **hơn** bảng thường | Chọn khoá theo query phổ biến nhất |
| Quên tạo mảnh cho kỳ sau | Ghi thất bại lúc 0h ngày 1 | Job tạo trước 3 kỳ + `DEFAULT` có cảnh báo |
| Chia theo ngày cho 3 năm | 1.095 mảnh → planning time nổ | Chia theo tháng |
| Tưởng `UNIQUE` vẫn toàn cục | Trùng key giữa hai mảnh | Bảng phụ không phân vùng cho khoá chống trùng |
| Dựa vào `DEFAULT PARTITION` | Không pruning; tạo mảnh thật sau đó bị khoá | Coi nó là lưới an toàn có alert |
| `DELETE` thay vì `DROP PARTITION` | Hàng giờ, WAL khổng lồ, bloat | `DROP`/`DETACH PARTITION` |
| Phân vùng bảng 20 GB | Chi phí lớn hơn lợi ích | Chỉ partition từ ~100 GB |
| Quên tạo index trên mảnh mới | Mảnh mới nhất (nóng nhất) không có index | Tạo index ngay trong job |
| Không tăng `max_locks_per_transaction` | Lỗi hết khoá khi query chạm nhiều mảnh | Tăng theo số mảnh |

## Câu hỏi phỏng vấn hay gặp

**H: Partitioning giải quyết vấn đề gì?**
Nó **không** làm dữ liệu nhỏ đi — nó giúp database biết chỗ nào không cần nhìn tới. Ba lợi ích thật: partition pruning làm query lọc theo khoá phân vùng nhanh hơn nhiều; `DROP PARTITION` dọn dữ liệu cũ trong vài mili giây thay vì hàng giờ `DELETE`; và bảo trì (`VACUUM`, `REINDEX`) chạy trên từng mảnh nhỏ thay vì bảng khổng lồ.

**H: Có partition rồi mà query vẫn chậm, vì sao?**
Gần như chắc chắn là mất pruning. Ba thủ phạm: query bọc hàm quanh khoá phân vùng, query không có điều kiện nào trên khoá phân vùng, hoặc ép kiểu ngầm. Cách kiểm là `EXPLAIN ANALYZE` — nếu thấy `Append` với đủ mọi mảnh con thay vì đúng một mảnh thì pruning không hoạt động.

**H: Hạn chế lớn nhất của partitioning trong Postgres là gì?**
Ràng buộc duy nhất phải chứa khoá phân vùng, vì index của mỗi mảnh là cục bộ và Postgres chưa có global index. Nghĩa là bạn mất `UNIQUE` toàn cục trên cột khác — cùng một idempotency key ở hai tháng khác nhau vẫn lọt qua. Cách xử lý là tách khoá chống trùng ra một bảng nhỏ không phân vùng.

**H: Partitioning và sharding khác gì nhau?**
Partitioning chia bảng thành nhiều mảnh **trên cùng một máy**, ứng dụng không biết gì và vẫn có ACID xuyên mảnh. Sharding chia sang **nhiều máy khác nhau**, cần lớp định tuyến, và JOIN với transaction xuyên shard trở nên rất đắt. Partition rẻ hơn nhiều nên luôn làm trước; chỉ shard khi đã chạm trần một máy.

**H: Nên chia bao nhiêu mảnh?**
Vài chục tới vài trăm. Vượt khoảng 1.000 mảnh thì thời gian lập kế hoạch trở thành vấn đề, vì optimizer phải xét từng mảnh và mỗi mảnh cần một khoá. Với dữ liệu 3 năm, chia theo tháng (36 mảnh) tốt hơn chia theo ngày (1.095 mảnh) — trừ khi bạn thật sự cần dọn dữ liệu theo ngày.

## Tóm tắt bài 3

- Partitioning **không làm dữ liệu nhỏ đi** — nó giúp optimizer **loại bỏ** phần không cần nhìn (partition pruning).
- Ba kiểu: `RANGE` (thời gian — phổ biến nhất), `LIST` (vùng/tenant), `HASH` (chia đều, nhưng mất khả năng dọn dữ liệu cũ bằng `DROP`).
- **Mất pruning là mất tất cả** — bọc hàm quanh khoá phân vùng, thiếu điều kiện, hoặc ép kiểu ngầm đều giết nó. Luôn kiểm bằng `EXPLAIN ANALYZE`.
- Ràng buộc duy nhất **phải chứa khoá phân vùng** → mất `UNIQUE` toàn cục; giải bằng bảng phụ không phân vùng.
- Lợi ích lớn nhất: `DROP PARTITION` dọn 300 triệu dòng trong **vài mili giây** thay vì hàng giờ `DELETE`.
- Chỉ partition từ ~100 GB; giữ số mảnh trong khoảng **vài chục tới vài trăm**; luôn có job **tạo trước** và **dọn sau**.

**Bài kế tiếp** → [Bài 4: Sharding — chia một database thành nhiều máy](04-sharding-chia-mot-database-thanh-nhieu-may.md)

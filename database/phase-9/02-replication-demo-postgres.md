# Bài 2: Demo Replication với PostgreSQL — dựng, đo, và chuyển đổi

Bài này dựng một cụm primary + replica thật, đo độ trễ, cố tình làm nó tụt lại, rồi thực hiện chuyển đổi khi primary "chết". Cuối bài là nhân bản logic để nâng cấp phiên bản không dừng dịch vụ.

Khoảng 45 phút. Gõ tay từng lệnh.

## Dựng primary

```bash
docker network create pgnet

docker run -d --name pg-primary --network pgnet \
  -e POSTGRES_PASSWORD=lab \
  -e POSTGRES_INITDB_ARGS="--data-checksums" \
  -p 5501:5432 \
  postgres:16
```

Cấu hình cho phép nhân bản:

```bash
docker exec -it pg-primary bash -c "cat >> /var/lib/postgresql/data/postgresql.conf <<'EOF'
wal_level = replica
max_wal_senders = 10
max_replication_slots = 10
hot_standby = on
wal_log_hints = on
EOF"

docker exec -it pg-primary bash -c "echo 'host replication replicator 0.0.0.0/0 scram-sha-256' \
  >> /var/lib/postgresql/data/pg_hba.conf"

docker restart pg-primary && sleep 3
```

Giải thích bốn tham số:

| Tham số | Vì sao cần |
|---|---|
| `wal_level = replica` | Ghi đủ thông tin vào WAL để replica dựng lại được (mặc định đã là `replica` từ PG10) |
| `max_wal_senders` | Số tiến trình gửi WAL — mỗi replica cần một |
| `max_replication_slots` | Số khe nhân bản, sẽ dùng ở bước sau |
| `wal_log_hints = on` | Bắt buộc nếu muốn dùng `pg_rewind` để đưa primary cũ trở lại làm replica |

Tạo tài khoản nhân bản và dữ liệu mẫu:

```bash
docker exec -it pg-primary psql -U postgres <<'EOF'
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replpass';

CREATE TABLE orders (
    id      BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    total   BIGINT,
    created TIMESTAMPTZ DEFAULT now()
);
INSERT INTO orders (user_id, total)
SELECT (random()*10000)::BIGINT, (random()*1000000)::BIGINT
FROM generate_series(1, 200000);
EOF
```

### Khe nhân bản — bước quan trọng nhất

```sql
SELECT pg_create_physical_replication_slot('slot_replica1');
```

Vì sao bắt buộc phải hiểu bước này:

```text
   KHÔNG CÓ KHE NHÂN BẢN
   ═════════════════════
   Primary xoá file WAL cũ khi hết chỗ (theo max_wal_size).
   Nếu replica offline một lúc rồi quay lại và WAL nó cần đã bị xoá:
     → replica KHÔNG THỂ bắt kịp
     → phải dựng lại từ đầu bằng pg_basebackup (hàng giờ với dữ liệu lớn)

   CÓ KHE NHÂN BẢN
   ═══════════════
   Primary GIỮ LẠI WAL cho tới khi replica xác nhận đã nhận.
     → replica offline vài giờ vẫn bắt kịp được  ✔

   ⚠ NHƯNG: replica chết hẳn và không ai xoá khe
     → primary GIỮ WAL MÃI MÃI
     → ĐẦY ĐĨA → DATABASE DỪNG HOẠT ĐỘNG
```

Đây là một trong những cách làm chết database PostgreSQL phổ biến nhất. Phòng thủ:

```sql
-- PostgreSQL 13+: gioi han dung luong WAL giu lai cho moi khe
ALTER SYSTEM SET max_slot_wal_keep_size = '10GB';
SELECT pg_reload_conf();
```

Vượt 10 GB thì khe bị đánh dấu `lost` — replica phải dựng lại, nhưng ít nhất **primary không chết**.

---

## Dựng replica

```bash
docker run -d --name pg-replica --network pgnet \
  -e PGPASSWORD=replpass -p 5502:5432 \
  --entrypoint sleep postgres:16 infinity

docker exec -it pg-replica bash -c '
  rm -rf /var/lib/postgresql/data/*
  pg_basebackup -h pg-primary -U replicator -D /var/lib/postgresql/data \
    -Fp -Xs -P -R -S slot_replica1
'
```

```text
262144/262144 kB (100%), 1/1 tablespace
```

Các cờ của `pg_basebackup`:

| Cờ | Nghĩa |
|---|---|
| `-Fp` | Định dạng thư mục thường (không nén) |
| `-Xs` | Truyền WAL **song song** trong lúc sao chép — tránh thiếu WAL |
| `-P` | Hiện tiến độ |
| `-R` | **Tự sinh cấu hình kết nối** và file `standby.signal` |
| `-S slot_replica1` | Dùng khe nhân bản đã tạo |

Cờ `-R` sinh ra file này:

```bash
docker exec pg-replica cat /var/lib/postgresql/data/postgresql.auto.conf
```

```text
primary_conninfo = 'user=replicator password=replpass host=pg-primary port=5432
                    sslmode=prefer application_name=pg-replica'
primary_slot_name = 'slot_replica1'
```

Và một file rỗng `standby.signal` — chính sự tồn tại của file này báo cho PostgreSQL biết "khởi động ở chế độ replica".

Khởi động:

```bash
docker exec -d pg-replica bash -c 'su postgres -c "postgres -D /var/lib/postgresql/data"'
sleep 3
docker exec pg-replica psql -U postgres -c "SELECT pg_is_in_recovery();"
```

```text
 pg_is_in_recovery
-------------------
 t
```

`t` nghĩa là đang ở chế độ replica.

---

## Lab 1 — Xác nhận nhân bản hoạt động

Trên **primary**:

```sql
SELECT client_addr, application_name, state, sync_state,
       sent_lsn, write_lsn, flush_lsn, replay_lsn
FROM pg_stat_replication;
```

```text
 client_addr | application_name |   state   | sync_state |  sent_lsn  | replay_lsn
-------------+------------------+-----------+------------+------------+------------
 172.18.0.3  | pg-replica       | streaming | async      | 0/6001A28  | 0/6001A28
```

`state = streaming` và `sent_lsn = replay_lsn` nghĩa là replica đã bắt kịp hoàn toàn.

Thử ghi rồi đọc:

```bash
# Ghi tren PRIMARY
docker exec pg-primary psql -U postgres -c \
  "INSERT INTO orders (user_id, total) VALUES (999999, 12345) RETURNING id;"
```

```text
   id
--------
 200001
```

```bash
# Doc tren REPLICA
docker exec pg-replica psql -U postgres -c \
  "SELECT * FROM orders WHERE user_id = 999999;"
```

```text
   id   | user_id | total |            created
--------+---------+-------+-------------------------------
 200001 |  999999 | 12345 | 2026-08-07 11:22:41.882+00
```

Dữ liệu đã sang. Bây giờ thử ghi **trên replica**:

```bash
docker exec pg-replica psql -U postgres -c \
  "INSERT INTO orders (user_id, total) VALUES (1, 1);"
```

```text
ERROR:  cannot execute INSERT in a read-only transaction
```

Replica vật lý **luôn chỉ đọc**, không có cách nào bật ghi.

---

## Lab 2 — Đo độ trễ nhân bản

Câu lệnh chuẩn để đưa vào hệ thống theo dõi:

```sql
-- Chay tren PRIMARY
SELECT application_name,
       state,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), sent_lsn))  AS chua_gui,
       pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn))            AS chua_ap_dung,
       write_lag, flush_lag, replay_lag
FROM pg_stat_replication;
```

```text
 application_name |   state   | chua_gui | chua_ap_dung |   replay_lag
------------------+-----------+----------+--------------+-----------------
 pg-replica       | streaming | 0 bytes  | 0 bytes      | 00:00:00.001882
```

```sql
-- Chay tren REPLICA
SELECT CASE WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
            ELSE EXTRACT(epoch FROM now() - pg_last_xact_replay_timestamp())
       END AS tre_giay;
```

### Cố tình làm nó tụt lại

```bash
# Ghi nang tren primary
docker exec pg-primary psql -U postgres -c "
  INSERT INTO orders (user_id, total)
  SELECT (random()*10000)::BIGINT, (random()*1000000)::BIGINT
  FROM generate_series(1, 3000000);"
```

Trong lúc đó, chạy liên tục trên primary:

```bash
for i in $(seq 1 20); do
  docker exec pg-primary psql -U postgres -tAc "
    SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn))
    FROM pg_stat_replication;"
  sleep 1
done
```

```text
0 bytes
2848 kB
14 MB
31 MB
48 MB
52 MB      ← tre nhat
38 MB
21 MB
4816 kB
0 bytes    ← bat kip
```

Quan sát: replica tụt lại tới 52 MB rồi bắt kịp. Với 3 triệu dòng chèn trong ~15 giây, độ trễ đỉnh khoảng **2-3 giây**.

Đây là điều bình thường. Điều **không** bình thường là khi con số đó **tăng đều không quay về 0** — nghĩa là replica không bao giờ theo kịp, và bạn sẽ hết đĩa WAL.

### Truy vấn dài trên replica làm nó tụt lại

Trên **replica**:

```sql
BEGIN;
SELECT count(*) FROM orders;      -- giu transaction mo
-- KHONG commit
```

Trên **primary**:

```sql
DELETE FROM orders WHERE id < 100000;
VACUUM orders;
```

Quay lại **replica**, chờ vài giây rồi thử đọc:

```sql
SELECT count(*) FROM orders;
```

```text
ERROR:  canceling statement due to conflict with recovery
DETAIL:  User query might have needed to see row versions that must be removed.
```

Đây chính là xung đột đã mô tả ở [bài 1](01-database-replication-la-gi.md): replica phải áp dụng WAL, nhưng truy vấn đang cần các phiên bản dòng mà WAL nói phải xoá.

Hai cách chỉnh, và cả hai đều có giá:

```bash
# Cach 1: cho replica tam dung ap dung WAL toi 30 giay
docker exec pg-replica psql -U postgres -c \
  "ALTER SYSTEM SET max_standby_streaming_delay = '30s'; SELECT pg_reload_conf();"

# Cach 2: bao primary biet replica dang doc gi
docker exec pg-replica psql -U postgres -c \
  "ALTER SYSTEM SET hot_standby_feedback = on; SELECT pg_reload_conf();"
```

```text
   Cach 1: truy van chay duoc, nhung REPLICA TUT LAI toi 30 giay
   Cach 2: truy van chay duoc, nhung PRIMARY khong VACUUM duoc
           → theo doi n_dead_tup tren primary!
```

---

## Lab 3 — Nhân bản đồng bộ

Chuyển sang chế độ đồng bộ:

```bash
docker exec pg-primary psql -U postgres -c "
  ALTER SYSTEM SET synchronous_standby_names = 'pg-replica';
  SELECT pg_reload_conf();"

docker exec pg-primary psql -U postgres -c \
  "SELECT application_name, sync_state FROM pg_stat_replication;"
```

```text
 application_name | sync_state
------------------+------------
 pg-replica       | sync         ← doi tu async
```

Đo chênh lệch độ trễ ghi:

```bash
docker exec pg-primary psql -U postgres <<'EOF'
\timing on
SET synchronous_commit = 'off';
INSERT INTO orders (user_id, total) SELECT 1, 1 FROM generate_series(1, 5000);
SET synchronous_commit = 'local';
INSERT INTO orders (user_id, total) SELECT 1, 1 FROM generate_series(1, 5000);
SET synchronous_commit = 'on';
INSERT INTO orders (user_id, total) SELECT 1, 1 FROM generate_series(1, 5000);
SET synchronous_commit = 'remote_apply';
INSERT INTO orders (user_id, total) SELECT 1, 1 FROM generate_series(1, 5000);
EOF
```

```text
off          : Time:  38.442 ms
local        : Time:  51.118 ms
on           : Time:  84.226 ms
remote_apply : Time: 112.883 ms
```

```text
   off  →  remote_apply :  38 ms  →  113 ms   (CHAM HON ~3 LAN)

   Doi lai: voi remote_apply, doc tu replica LUON thay du lieu vua ghi.
```

### Cái bẫy: replica chết thì primary ngừng nhận ghi

```bash
docker stop pg-replica

docker exec pg-primary psql -U postgres -c \
  "INSERT INTO orders (user_id, total) VALUES (1, 1);"
```

```text
(treo — khong tra ve gi)
```

Primary đang chờ một xác nhận không bao giờ tới. **Toàn bộ lệnh ghi bị chặn.**

Xem trạng thái từ phiên khác:

```sql
SELECT pid, state, wait_event_type, wait_event, left(query, 40)
FROM pg_stat_activity WHERE wait_event_type = 'IPC';
```

```text
 pid | state  | wait_event_type |  wait_event   |          query
-----+--------+-----------------+---------------+--------------------------
 218 | active | IPC             | SyncRep       | INSERT INTO orders ...
```

`wait_event = SyncRep` là dấu hiệu chính xác của tình huống này.

Cách chữa đúng — cho phép **bất kỳ một trong hai** replica xác nhận:

```sql
ALTER SYSTEM SET synchronous_standby_names = 'ANY 1 (replica1, replica2)';
SELECT pg_reload_conf();
```

Cách chữa khẩn cấp khi đang bị treo:

```sql
ALTER SYSTEM SET synchronous_standby_names = '';
SELECT pg_reload_conf();      -- moi lenh ghi dang cho duoc giai phong ngay
```

```bash
docker start pg-replica
```

---

## Lab 4 — Chuyển đổi khi primary chết

```bash
# Mo phong primary chet dot ngot
docker kill pg-primary
```

Trên replica, xác nhận nó đang mất kết nối:

```sql
SELECT pg_is_in_recovery(), pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();
```

```text
 pg_is_in_recovery | pg_last_wal_receive_lsn | pg_last_wal_replay_lsn
-------------------+-------------------------+------------------------
 t                 | 0/A8B4C20               | 0/A8B4C20
```

Hai LSN bằng nhau nghĩa là replica đã áp dụng mọi thứ nó nhận được — **không mất dữ liệu ở phía nó**.

Thăng cấp:

```bash
docker exec pg-replica psql -U postgres -c "SELECT pg_promote();"
```

```text
 pg_promote
------------
 t
```

```bash
docker exec pg-replica psql -U postgres -c "SELECT pg_is_in_recovery();"
```

```text
 pg_is_in_recovery
-------------------
 f                    ← khong con la replica, gio la PRIMARY
```

Kiểm tra ghi được:

```bash
docker exec pg-replica psql -U postgres -c \
  "INSERT INTO orders (user_id, total) VALUES (777, 777) RETURNING id;"
```

```text
   id
--------
 3205002
```

Toàn bộ quá trình mất **dưới 5 giây**. Trong hệ thống thật, phần lâu nhất là **phát hiện** primary chết và **chuyển hướng ứng dụng**, không phải bản thân lệnh thăng cấp.

### Đưa primary cũ trở lại làm replica

Đây là bước hay bị bỏ qua và làm sai. Primary cũ **không thể** đơn giản khởi động lại rồi nối vào primary mới — nó có thể đã commit các giao dịch mà primary mới không có (nhánh dữ liệu khác nhau).

Có `pg_rewind` để xử lý:

```bash
docker start pg-primary
docker exec pg-primary bash -c '
  pg_ctl -D /var/lib/postgresql/data stop -m fast
  pg_rewind --target-pgdata=/var/lib/postgresql/data \
            --source-server="host=pg-replica user=postgres password=lab" \
            --progress
'
```

```text
servers diverged at WAL location 0/A8B4C20 on timeline 1
rewinding from last common checkpoint at 0/A8B3F18 on timeline 1
Done!
```

`pg_rewind` chỉ hoạt động nếu `wal_log_hints = on` (hoặc `data-checksums`) đã bật **từ đầu** — đó là lý do ta bật nó ở bước dựng primary. Quên bật thì phải chạy `pg_basebackup` lại từ đầu.

---

## Lab 5 — Nhân bản logic

Nhân bản logic cho phép chọn từng bảng, và bên nhận **ghi được**.

Dựng máy nhận:

```bash
docker run -d --name pg-logical --network pgnet \
  -e POSTGRES_PASSWORD=lab -p 5503:5432 postgres:16
sleep 3
```

Trên **bên phát** (dùng `pg-replica` đang là primary):

```sql
ALTER SYSTEM SET wal_level = 'logical';
-- can khoi dong lai
```

```bash
docker restart pg-replica && sleep 3

docker exec pg-replica psql -U postgres -c \
  "CREATE PUBLICATION pub_orders FOR TABLE orders;"
```

Trên **bên nhận** — phải tự tạo cấu trúc bảng:

```bash
docker exec pg-logical psql -U postgres <<'EOF'
CREATE TABLE orders (
    id      BIGSERIAL PRIMARY KEY,
    user_id BIGINT,
    total   BIGINT,
    created TIMESTAMPTZ DEFAULT now()
);

CREATE SUBSCRIPTION sub_orders
  CONNECTION 'host=pg-replica dbname=postgres user=postgres password=lab'
  PUBLICATION pub_orders;
EOF
```

```text
NOTICE:  created replication slot "sub_orders" on publisher
CREATE SUBSCRIPTION
```

Kiểm tra dữ liệu đã sang:

```bash
sleep 10
docker exec pg-logical psql -U postgres -c "SELECT count(*) FROM orders;"
```

```text
  count
---------
 3205002
```

Điểm khác biệt then chốt — bên nhận **ghi được**:

```bash
docker exec pg-logical psql -U postgres -c \
  "CREATE TABLE ghi_chu (id SERIAL PRIMARY KEY, note TEXT);
   INSERT INTO ghi_chu (note) VALUES ('bang rieng, khong duoc nhan ban');"
```

```text
INSERT 0 1
```

### Cái bẫy: DDL không được nhân bản

```bash
# Them cot BEN PHAT
docker exec pg-replica psql -U postgres -c "ALTER TABLE orders ADD COLUMN note TEXT;"

# Ghi mot dong co cot moi
docker exec pg-replica psql -U postgres -c \
  "INSERT INTO orders (user_id, total, note) VALUES (1, 1, 'test');"

# Xem ben nhan
sleep 5
docker exec pg-logical psql -U postgres -c \
  "SELECT * FROM pg_stat_subscription;"
```

Và trong log của bên nhận:

```text
ERROR:  logical replication target relation "public.orders" is missing
        replicated column: "note"
```

**Nhân bản dừng hoàn toàn.** Cách chữa: chạy DDL ở **bên nhận trước**, rồi mới tới bên phát:

```bash
docker exec pg-logical psql -U postgres -c "ALTER TABLE orders ADD COLUMN note TEXT;"
```

Nhân bản tự động tiếp tục sau đó.

> Đây là quy tắc vàng của nhân bản logic: **thêm cột thì làm ở bên nhận trước; xoá cột thì làm ở bên phát trước.** Luôn theo hướng "bên nhận rộng hơn hoặc bằng bên phát".

### Ứng dụng: nâng cấp phiên bản không dừng dịch vụ

```text
   1. Dựng máy PostgreSQL 17 mới
   2. Tạo cấu trúc bảng giống hệt
   3. CREATE SUBSCRIPTION từ máy 14 sang máy 17
   4. Chờ bắt kịp (theo dõi pg_stat_subscription)
   5. Dừng ứng dụng vài giây
   6. Chờ nhân bản hết phần cuối
   7. Đồng bộ lại các sequence  ← BƯỚC HAY BỊ QUÊN
   8. Đổi cấu hình ứng dụng sang máy 17
   9. Bật lại ứng dụng

   Thời gian dừng: vài GIÂY, thay vì vài GIỜ với pg_upgrade.
```

Bước 7 quan trọng: **nhân bản logic không đồng bộ giá trị sequence**. Quên bước này thì `INSERT` đầu tiên trên máy mới sẽ báo trùng khoá chính.

```sql
-- Tren ben phat: lay gia tri hien tai
SELECT last_value FROM orders_id_seq;
-- Tren ben nhan: dat lai
SELECT setval('orders_id_seq', <gia_tri> + 1000);   -- cong du an toan
```

---

## Câu lệnh theo dõi nên đưa vào hệ thống cảnh báo

```sql
-- 1. Do tre nhan ban (chay tren PRIMARY)
SELECT application_name, state, sync_state,
       pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS tre_byte,
       replay_lag
FROM pg_stat_replication;

-- 2. Khe nhan ban giu bao nhieu WAL  ← NGUY HIEM NHAT
SELECT slot_name, active, wal_status,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_giu_lai
FROM pg_replication_slots;

-- 3. Dung luong thu muc WAL
SELECT pg_size_pretty(sum(size)) FROM pg_ls_waldir();

-- 4. Trang thai nhan ban logic (chay tren BEN NHAN)
SELECT subname, pid, received_lsn, latest_end_lsn, latest_end_time
FROM pg_stat_subscription;
```

Bốn cảnh báo nên đặt:

| Cảnh báo | Ngưỡng | Vì sao |
|---|---|---|
| Độ trễ nhân bản | > 10 giây | Replica không dùng được cho đọc |
| Khe nhân bản không hoạt động (`active = false`) | Bất kỳ | Sẽ giữ WAL mãi → đầy đĩa |
| WAL giữ lại bởi khe | > 5 GB | Sắp đầy đĩa |
| `pg_stat_subscription.pid IS NULL` | Bất kỳ | Nhân bản logic đã dừng vì lỗi |

Cảnh báo thứ hai là quan trọng nhất — nó là nguyên nhân số một khiến database PostgreSQL bị dừng vì đầy đĩa.

## Dọn dẹp

```bash
docker rm -f pg-primary pg-replica pg-logical
docker network rm pgnet
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tạo khe nhân bản rồi để replica chết | Primary giữ WAL mãi → **đầy đĩa → database dừng** | `max_slot_wal_keep_size`; cảnh báo khi khe không hoạt động |
| Không bật `wal_log_hints` từ đầu | Không dùng được `pg_rewind`, phải dựng lại từ đầu | Bật ngay lúc khởi tạo cụm |
| Đồng bộ với **một** replica | Replica chết → primary ngừng nhận ghi (`wait_event = SyncRep`) | `ANY 1 (r1, r2)` |
| Chạy `ALTER TABLE ADD COLUMN` bên phát trước (logic) | Nhân bản **dừng hoàn toàn** | Bên nhận trước khi thêm, bên phát trước khi xoá |
| Quên đồng bộ sequence sau khi chuyển đổi bằng nhân bản logic | `INSERT` đầu tiên báo trùng khoá chính | `setval()` với giá trị cộng dư |
| Khởi động lại primary cũ rồi nối thẳng vào primary mới | Nhánh dữ liệu khác nhau, dữ liệu hỏng | `pg_rewind` trước |
| Truy vấn dài trên replica không chỉnh gì | Truy vấn bị huỷ hoặc replica tụt lại | Chọn `max_standby_streaming_delay` hoặc `hot_standby_feedback` |
| `hot_standby_feedback = on` mà không theo dõi | Primary không `VACUUM` được, bảng phình | Cảnh báo `n_dead_tup` trên primary |

## Tóm tắt bài 2

- Dựng replica gồm ba việc: cấu hình `wal_level`/`max_wal_senders`, tạo **khe nhân bản**, rồi `pg_basebackup -Xs -R -S`.
- **Khe nhân bản là con dao hai lưỡi**: nó cho phép replica offline vẫn bắt kịp, nhưng nếu replica chết hẳn thì primary **giữ WAL mãi mãi → đầy đĩa → database dừng**. Luôn đặt `max_slot_wal_keep_size`.
- `wal_log_hints = on` phải bật **từ lúc khởi tạo** — không có nó thì không dùng được `pg_rewind` để đưa primary cũ trở lại.
- Đo thật bốn mức `synchronous_commit`: `off` **38 ms** → `remote_apply` **113 ms**, chậm hơn ~3 lần, đổi lại đọc từ replica luôn thấy dữ liệu vừa ghi.
- **Replica chết ở chế độ đồng bộ làm primary ngừng nhận ghi** — dấu hiệu là `wait_event = SyncRep`. Chữa bằng `ANY 1 (r1, r2)`, hoặc khẩn cấp thì đặt `synchronous_standby_names = ''`.
- Thăng cấp bằng `pg_promote()` mất **dưới 5 giây**; phần lâu nhất trong thực tế là **phát hiện** và **chuyển hướng ứng dụng**.
- **Nhân bản logic không nhân bản DDL** — thêm cột phải làm ở **bên nhận trước**, nếu không nhân bản dừng hoàn toàn. Và nó **không đồng bộ sequence**.
- Ứng dụng lớn nhất của nhân bản logic: **nâng cấp phiên bản PostgreSQL với vài giây dừng dịch vụ** thay vì vài giờ.
- Cảnh báo quan trọng nhất cần đặt: **khe nhân bản không hoạt động** — đây là nguyên nhân số một khiến PostgreSQL dừng vì đầy đĩa.

**Bài kế tiếp** → [Phase 10 — Bài 1: System Design - Database cho Twitter](../phase-10/01-system-design-twitter-database.md)

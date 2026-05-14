# Bài 2: Demo Replication với PostgreSQL 13

## Mục tiêu

Thiết lập Master/Standby replication với 2 PostgreSQL instances trên Docker:
- **pg-master**: Port 5432 - nhận writes
- **pg-standby**: Port 5433 - read-only replica

---

## Bước 1: Khởi động Master và Standby

### Tạo thư mục data

```bash
mkdir -p ~/replication/master_data
mkdir -p ~/replication/standby_data
```

### Khởi động Master

```bash
docker run \
  --name pg-master \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -v ~/replication/master_data:/var/lib/postgresql/data \
  -d postgres:13
```

### Khởi động Standby (instance thứ 2)

```bash
docker run \
  --name pg-standby \
  -e POSTGRES_PASSWORD=postgres \
  -p 5433:5432 \
  -v ~/replication/standby_data:/var/lib/postgresql/data \
  -d postgres:13
```

```bash
# Kiểm tra cả 2 đang chạy
docker ps
# → pg-master (5432) và pg-standby (5433)
```

---

## Bước 2: Copy Data từ Master sang Standby

Replication yêu cầu Standby bắt đầu từ **cùng điểm** với Master.

```bash
# Dừng cả 2 instances
docker stop pg-master pg-standby

# Backup data cũ của standby
mv ~/replication/standby_data ~/replication/standby_data_backup

# Copy toàn bộ data từ master sang standby
cp -r ~/replication/master_data ~/replication/standby_data

# Sau khi copy, standby có cùng data với master
```

---

## Bước 3: Cấu hình Master - pg_hba.conf

Cho phép standby kết nối để replication:

```bash
# Chỉnh sửa pg_hba.conf của master
vim ~/replication/master_data/pg_hba.conf
```

Thêm dòng sau vào cuối file:

```
# pg_hba.conf
# Cho phép replication từ bất kỳ host nào (dùng MD5 auth)
host    replication    postgres    all    md5
```

```
Giải thích:
  host        = Kết nối TCP/IP
  replication = Chỉ cho replication (không phải regular queries)
  postgres    = User được phép (production nên dùng dedicated user)
  all         = Từ bất kỳ IP nào
  md5         = Authentication bằng password hash
```

---

## Bước 4: Cấu hình Standby - postgresql.conf

Cho standby biết cách kết nối vào master:

```bash
# Chỉnh sửa postgresql.conf của standby
vim ~/replication/standby_data/postgresql.conf
```

Tìm và uncomment `primary_conninfo`:

```
# postgresql.conf (trên STANDBY)
primary_conninfo = 'application_name=standby1 host=localhost port=5432 user=postgres password=postgres'
```

```
Giải thích các tham số:
  application_name = 'standby1'   - Tên unique cho standby này
  host=localhost                  - Host của master
  port=5432                       - Port của master
  user=postgres                   - User để connect (nên là dedicated user)
  password=postgres               - Password
```

---

## Bước 5: Tạo standby.signal

File này báo cho PostgreSQL biết đây là standby (read-only):

```bash
# Tạo file standby.signal trong thư mục data của standby
touch ~/replication/standby_data/standby.signal

# File này là "cờ" để PostgreSQL tự động vào standby mode
# Read-only mode + chờ WAL từ master
```

---

## Bước 6: Cấu hình Master - Synchronous Standbys

```bash
# Chỉnh sửa postgresql.conf của master
vim ~/replication/master_data/postgresql.conf
```

Tìm và uncomment `synchronous_standby_names`:

```
# postgresql.conf (trên MASTER)
# Đảm bảo transaction chỉ commit khi ít nhất 1 standby đã nhận
synchronous_standby_names = 'FIRST 1 (standby1)'

# Cú pháp: FIRST N (name1, name2, name3)
# → Chờ ít nhất N trong số các standbys đã nhận WAL

# Ví dụ với nhiều standbys:
# synchronous_standby_names = 'FIRST 2 (standby1, standby2, standby3)'
# → Chờ ít nhất 2 trong 3 standbys

# ANY 2 (standby1, standby2, standby3)
# → Tương tự nhưng không có priority
```

---

## Bước 7: Khởi động lại và Kiểm tra

```bash
# Khởi động lại cả 2 instances
docker start pg-master pg-standby

# Kiểm tra logs của master
docker logs pg-master
# → "standby1 is now a synchronous standby with priority 1"

# Kiểm tra logs của standby
docker logs pg-standby
# → "started streaming WAL from the primary at ..."
```

---

## Bước 8: Verify Replication

### Kiểm tra trên Master

```sql
-- Kết nối Master
docker exec -it pg-master psql -U postgres

-- Kiểm tra trạng thái replication
SELECT 
    client_addr,
    application_name,
    state,
    sync_state,
    sent_lsn,
    replay_lsn
FROM pg_stat_replication;
```

```
Kết quả:
  client_addr | application_name | state     | sync_state
  -----------  | ----------------  | ---------  | ----------
  172.17.0.3  | standby1         | streaming | sync

→ "streaming" = Đang replication
→ "sync" = Synchronous mode (như đã cấu hình)
```

---

## Bước 9: Test Replication Hoạt Động

### Terminal 1 - Master (tạo table và data)

```sql
-- Kết nối Master
docker exec -it pg-master psql -U postgres

-- Tạo bảng và insert data
CREATE TABLE test (id INTEGER, name VARCHAR(50));

INSERT INTO test SELECT generate_series(1, 10000), 'test_' || generate_series(1, 10000);

-- Thay đổi schema
ALTER TABLE test ADD COLUMN score INTEGER;
```

### Terminal 2 - Standby (đọc data đã replicated)

```sql
-- Kết nối Standby
docker exec -it pg-standby psql -U postgres

-- Kiểm tra bảng tự động xuất hiện!
\d test
-- → Column: id, name, score (đã có column score!)

-- Đọc data
SELECT COUNT(*) FROM test;
-- → 10000 (data đã replicated từ master)

-- Thử write → Sẽ bị từ chối
INSERT INTO test VALUES (10001, 'cannot_write', 100);
-- ERROR: cannot execute INSERT in a read-only transaction
```

---

## Bước 10: Failover - Promote Standby lên Master

Khi Master fail, ta có thể promote Standby:

```bash
# Cách 1: Dùng pg_ctl
docker exec pg-standby pg_ctl promote -D /var/lib/postgresql/data

# Cách 2: Tạo file trigger
touch ~/replication/standby_data/promote.signal

# Cách 3: Dùng pg_promote() function (PostgreSQL 12+)
# psql -c "SELECT pg_promote();" -h localhost -p 5433 -U postgres
```

```sql
-- Sau khi promote, kiểm tra standby đã là master
-- (Kết nối đến port 5433 - former standby)
docker exec -it pg-standby psql -U postgres

-- Thử insert - bây giờ phải thành công!
INSERT INTO test VALUES (10001, 'now_writable', 100);
-- → 1 row inserted ✓

-- Former standby giờ là master!
SELECT pg_is_in_recovery();
-- → f (false = không còn trong recovery/standby mode)
```

---

## Monitoring Replication Lag

```sql
-- Trên Master: Xem chi tiết replication
SELECT
    application_name,
    client_addr,
    state,
    sent_lsn,
    write_lsn,
    flush_lsn,
    replay_lsn,
    write_lag,
    flush_lag,
    replay_lag,
    sync_state
FROM pg_stat_replication;
```

```
Giải thích các lag fields:
  write_lag    = Thời gian từ khi master write đến khi standby nhận được
  flush_lag    = Thời gian đến khi standby flush xuống disk
  replay_lag   = Thời gian đến khi standby apply vào database
  
  Healthy:  write_lag < 100ms, replay_lag < 1s
  Warning:  replay_lag > 30s (check network, I/O)
  Critical: replay_lag > 5min (immediate investigation needed)
```

---

## Cấu hình Nâng Cao

### Asynchronous Replication (cho performance tốt hơn)

```
# postgresql.conf trên Master
# Comment out hoặc để trống synchronous_standby_names:
# synchronous_standby_names = ''  # Empty = Asynchronous!

# → Writes không cần chờ standby ACK
# → Faster writes, nhưng có nguy cơ mất data nếu master fail
```

### Dedicated Replication User (Best Practice)

```sql
-- Tạo user chuyên dùng cho replication (không dùng postgres user)
CREATE USER replicator WITH REPLICATION LOGIN PASSWORD 'secure_password';
```

```
# pg_hba.conf
host    replication    replicator    all    md5

# postgresql.conf (standby)
primary_conninfo = 'application_name=standby1 host=master_host port=5432 user=replicator password=secure_password'
```

---

## Tóm tắt Quy trình Setup

```
Master:                              Standby:
  1. Cấu hình pg_hba.conf             3. Copy data từ Master
     (allow replication)              4. Cấu hình primary_conninfo
  2. Cấu hình synchronous_             5. Tạo standby.signal file
     standby_names                    6. Khởi động

↓
7. Verify: pg_stat_replication (trên Master)
8. Test: CREATE TABLE → xuất hiện trên Standby!
9. Test: INSERT trên Standby → ERROR (read-only)
```

---

**Tiếp theo:** Phase 10 - Database System Design →

# Bài 3: Các cách triển khai Redis

Trước khi viết được lệnh đầu tiên, ta cần **một Redis chạy ở đâu đó**. Có 4 con đường phổ biến — mỗi cái có nơi phù hợp riêng. Bài này phân tích để bạn chọn đúng cách cho việc học và cho production.

## Tổng quan 4 lựa chọn

| Cách | Phù hợp khi nào | Ưu | Nhược |
|---|---|---|---|
| **Redis Cloud** (managed) | Học, prototype, prod muốn ít vận hành | Setup 5 phút, có dashboard, free tier 30 MB | Phụ thuộc nhà cung cấp, phí khi scale |
| **Docker** local | Học, dev local, CI | Khởi động/tắt nhanh, dễ reset, không "bẩn" máy | Cần cài Docker, hơi tốn RAM cho Docker Desktop trên Mac |
| **Cài bare-metal** (brew/apt/binary) | Dev local lâu dài | Chạy thẳng trên OS, ít overhead | "Bẩn" máy, nâng cấp/gỡ thủ công, khó multi-version |
| **Build từ source** | Hack core, học nội bộ | Tuỳ biến tối đa | Tốn thời gian, không cần thiết để **dùng** Redis |

> Khuyến nghị cho khoá học: **Redis Cloud (free)** để bắt đầu nhanh + **Docker** trên máy local để chạy thử nghiệm. Đến phần làm app thực tế ở phase-3 sẽ chuyển sang dùng song song.

## Lựa chọn 1 — Redis Cloud (managed)

**Redis Cloud** là dịch vụ SaaS của Redis Inc. cho phép tạo Redis instance trên AWS/GCP/Azure mà không phải lo vận hành.

**Khi nào nên dùng**:
- Đang học, muốn không phải cài đặt gì.
- Đội nhỏ, không có DevOps fulltime.
- Cần feature thương mại như RediSearch, RedisJSON, Active-Active replication.

**Khi nào KHÔNG nên dùng**:
- Yêu cầu compliance ép dữ liệu phải ở on-prem hoặc VPC riêng.
- Workload cực lớn (TB) — chi phí managed cao hơn tự host nhiều lần.

**Các khái niệm cần hiểu khi dùng Redis Cloud**:

- **Subscription**: nhóm các database, gắn với region và plan thanh toán. Một subscription có thể có nhiều database.
- **Database**: một instance Redis logic (có endpoint + port + password riêng). Đây là cái app của bạn kết nối tới.
- **Endpoint**: host:port để kết nối. Ví dụ: `redis-12345.c14.us-east-1-2.ec2.cloud.redislabs.com:12345`.
- **Default user / password**: credential dùng để AUTH khi kết nối.
- **Free tier**: 1 database, 30 MB, không backup, dùng để học là đủ.

Setup chi tiết sẽ ở **bài 4** tiếp theo. Đây chỉ là tổng quan.

## Lựa chọn 2 — Docker (khuyến nghị cho dev local)

Docker chạy Redis trong một container, không "động chạm" tới OS chính. Đây là cách **đơn giản và sạch nhất** cho dev local.

### 2.1. Chạy Redis một dòng lệnh

Sau khi cài Docker Desktop (Mac/Windows) hoặc Docker Engine (Linux):

```bash
docker run --name redis-local -p 6379:6379 -d redis:7-alpine
```

Giải thích từng cờ:

- `docker run` — tạo và chạy container mới.
- `--name redis-local` — đặt tên container để sau này dễ tham chiếu (`docker stop redis-local`).
- `-p 6379:6379` — map cổng `6379` của container ra cổng `6379` của host (máy bạn). Client trên host kết nối `localhost:6379` sẽ vào Redis trong container.
- `-d` — detached mode, container chạy nền, không chiếm terminal.
- `redis:7-alpine` — image. `7` là major version Redis; `alpine` là biến thể base Alpine Linux (rất nhẹ, ~30 MB).

Kiểm tra:

```bash
docker ps                       # thấy container đang chạy
docker exec -it redis-local redis-cli ping   # phản hồi: PONG
```

### 2.2. Bật persistence + AUTH

Mặc định container trên KHÔNG có persistence, dữ liệu mất khi container bị xoá. Để giữ dữ liệu:

```bash
docker run --name redis-local \
  -p 6379:6379 \
  -v $(pwd)/redis-data:/data \
  -d redis:7-alpine \
  redis-server --appendonly yes --requirepass "matkhaucuaban"
```

- `-v $(pwd)/redis-data:/data` — mount thư mục local vào `/data` trong container. Redis ghi RDB/AOF vào đây, tồn tại sau khi container bị xoá.
- `--appendonly yes` — bật AOF (append-only file) persistence.
- `--requirepass` — yêu cầu mật khẩu khi kết nối. Bắt buộc nếu mở port ra LAN.

### 2.3. Bật RedisInsight kèm theo

[RedisInsight](https://redis.io/insight/) là GUI chính chủ. Có thể chạy cùng Docker:

```bash
docker run -d --name redisinsight -p 5540:5540 redis/redisinsight:latest
```

Mở `http://localhost:5540` → Add Redis Database → nhập `localhost:6379` (hoặc IP container nếu bạn không map ra host).

### 2.4. Docker Compose — gọn gàng hơn

Tạo file `docker-compose.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: redis-local
    ports:
      - "6379:6379"
    volumes:
      - ./redis-data:/data
    command: redis-server --appendonly yes
    restart: unless-stopped

  redisinsight:
    image: redis/redisinsight:latest
    container_name: redisinsight
    ports:
      - "5540:5540"
    depends_on:
      - redis
    restart: unless-stopped
```

Chạy `docker compose up -d`. Dừng `docker compose down`. Cách này lý tưởng cho dev local.

## Lựa chọn 3 — Cài thẳng lên OS

### macOS với Homebrew

```bash
brew install redis
brew services start redis     # chạy như service (autostart)
# hoặc chỉ chạy 1 lần:
redis-server
```

Mặc định listen `127.0.0.1:6379`, không có password, persistence RDB mặc định. Config nằm ở `/opt/homebrew/etc/redis.conf` (Apple Silicon) hoặc `/usr/local/etc/redis.conf` (Intel).

### Linux với apt (Ubuntu/Debian)

```bash
# Lấy repo chính thức của Redis (mới hơn repo OS)
sudo apt-get install lsb-release curl gpg
curl -fsSL https://packages.redis.io/gpg | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list
sudo apt-get update
sudo apt-get install redis

sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### Windows

Redis **không hỗ trợ Windows chính thức**. Có 3 cách:
1. **WSL2** (khuyến nghị): cài Ubuntu trong WSL2, làm theo lệnh Linux.
2. **Docker Desktop**: dùng Docker như mục 2.
3. **Memurai / Microsoft Open Tech port** (cũ): có thể chạy được Redis trên Windows nhưng phiên bản thường tụt sau.

## Lựa chọn 4 — Build từ source (chỉ khi cần)

```bash
wget https://download.redis.io/redis-stable.tar.gz
tar -xzvf redis-stable.tar.gz
cd redis-stable
make
make test           # tùy chọn, mất ~5 phút
sudo make install   # cài vào /usr/local/bin
```

Cần khi:
- Bạn muốn build với patch tuỳ chỉnh.
- Bạn nghiên cứu nội bộ Redis.

Không cần khi chỉ học cách **dùng** Redis.

## Tệp cấu hình `redis.conf` — những trường quan trọng

Khi tự host, bạn nên hiểu vài directive trong `redis.conf`:

```conf
# Mạng
bind 127.0.0.1 -::1        # IP được phép listen. Mặc định chỉ localhost.
port 6379                  # Cổng TCP
protected-mode yes         # An toàn: từ chối kết nối từ ngoài nếu không có password
requirepass "abc123"       # Bật AUTH, client phải gửi AUTH abc123 trước khi dùng

# Bộ nhớ
maxmemory 2gb              # Giới hạn RAM Redis được dùng
maxmemory-policy allkeys-lru   # Khi đầy, xoá key ít dùng gần đây

# Persistence
save 3600 1 300 100 60 10000   # RDB snapshot: mỗi 1h nếu ≥1 key thay đổi, 5p nếu ≥100, 1p nếu ≥10000
appendonly yes             # AOF log
appendfsync everysec       # Fsync mỗi giây (mất tối đa 1s dữ liệu cuối)

# Replication
replicaof 10.0.0.5 6379    # Làm replica của master ở 10.0.0.5
masterauth "abc123"        # Mật khẩu của master nếu master yêu cầu

# Slow log
slowlog-log-slower-than 10000   # Log lệnh chạy > 10ms (đơn vị: microsecond)
slowlog-max-len 128             # Giữ 128 lệnh chậm nhất gần nhất
```

> **Nguyên tắc bảo mật**: KHÔNG BAO GIỜ chạy Redis với `bind 0.0.0.0` + không có `requirepass` + cổng mở ra Internet. Có hàng nghìn worm tự động quét và chiếm các Redis open. **Luôn** dùng password và bind đúng interface.

## Các kiến trúc triển khai khi lên production

Đây là cái nhìn trước (sẽ học sâu hơn ở phase nâng cao):

### 3a. Single instance
```text
[App] → [Redis 6379]
```
Đơn giản nhất, không HA. Crash là mất kết nối, có thể mất dữ liệu giữa các snapshot.

### 3b. Master + replica(s)
```text
[App writes] ──→ [Master]
                    ↓ async replication
[App reads]  ←── [Replica 1] [Replica 2]
```
Replica đồng bộ bất đồng bộ từ master. Master fail → có thể promote replica thủ công. Đọc có thể scale.

### 3c. Redis Sentinel (HA tự động)
```text
       [Sentinel 1] [Sentinel 2] [Sentinel 3]   ← giám sát + bầu master mới
              ↓        ↓        ↓
[App] ──→ [Master] [Replica 1] [Replica 2]
```
Sentinel quorum (số lẻ ≥3) giám sát master, tự động failover khi master chết. App dùng client hiểu Sentinel để tự reconnect.

### 3d. Redis Cluster (sharding)
```text
              keyspace = 16384 slots
[App] ─→ [Node 1: slots 0-5460]
       ─→ [Node 2: slots 5461-10922]
       ─→ [Node 3: slots 10923-16383]
            mỗi node có replica riêng
```
Mỗi node chứa một phần keyspace. Client (cluster-aware) tự routing key tới đúng node. Đây là cách scale ngang khi dataset > 1 máy.

## Tóm tắt bài 3

- **Redis Cloud**: nhanh nhất để bắt đầu, không phải cài.
- **Docker**: lựa chọn tốt nhất cho dev local — sạch, dễ tắt/bật, dễ test nhiều version.
- **Bare-metal**: dùng khi muốn Redis chạy nền lâu dài như service hệ thống.
- **Source build**: chỉ khi cần hack nội bộ.
- Hiểu `redis.conf` cơ bản: `bind`, `requirepass`, `maxmemory`, persistence — đặc biệt **bảo mật**: không bao giờ mở Redis công khai không password.
- Production có nhiều mức kiến trúc: single → replica → Sentinel → Cluster.

**Bài kế tiếp** → [Bài 4: Setup Redis Cloud chi tiết từ A đến Z](04-setup-redis-cloud.md)

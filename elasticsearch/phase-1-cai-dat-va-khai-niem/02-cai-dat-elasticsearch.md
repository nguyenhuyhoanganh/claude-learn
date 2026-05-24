# Bài 2: Cài Elasticsearch và Kibana

Có 4 cách cài:

| Cách                | Pros                                  | Cons                                        |
|---------------------|---------------------------------------|---------------------------------------------|
| Native (apt/brew)   | Setup nhanh                            | Cấu hình OS riêng từng platform              |
| Docker              | Portable, một command                 | Cần Docker biết                              |
| VM (VirtualBox)     | Cô lập, Linux thật                    | Tốn disk + RAM                               |
| Elastic Cloud (paid)| Zero setup, managed                   | Tốn tiền                                     |

→ Khoá học **chọn Docker** (đơn giản, modern). Original course dùng VirtualBox + Ubuntu — bạn có thể chọn nếu thích cô lập.

## Cài qua Docker (recommended)

### Prerequisites

- Docker Desktop (Mac/Win) hoặc Docker Engine (Linux).
- 8 GB RAM máy host (Elasticsearch ăn ~2-4 GB).
- 30 GB disk free.

### docker-compose.yml

Tạo folder `elastic-local/`, file `docker-compose.yml`:

```yaml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0
    container_name: elasticsearch
    environment:
      - node.name=node-1
      - cluster.name=docker-cluster
      - discovery.type=single-node
      - bootstrap.memory_lock=true
      - xpack.security.enabled=false        # Tắt security cho học
      - ES_JAVA_OPTS=-Xms2g -Xmx2g          # Heap 2 GB
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - es-data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"      # REST API
      - "9300:9300"      # Node-to-node
    healthcheck:
      test: ["CMD-SHELL", "curl -s http://localhost:9200 || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10

  kibana:
    image: docker.elastic.co/kibana/kibana:8.13.0
    container_name: kibana
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    ports:
      - "5601:5601"
    depends_on:
      elasticsearch:
        condition: service_healthy

volumes:
  es-data:
```

### Khởi động

```bash
docker compose up -d
```

→ Đợi 1-2 phút cho container start.

Verify:

```bash
curl http://localhost:9200
```

Expect:

```json
{
  "name" : "node-1",
  "cluster_name" : "docker-cluster",
  "cluster_uuid" : "...",
  "version" : {
    "number" : "8.13.0",
    "build_flavor" : "default",
    "lucene_version" : "9.9.2"
  },
  "tagline" : "You Know, for Search"
}
```

→ Elasticsearch chạy. Slogan **"You Know, for Search"** = đặc trưng project.

Kibana: mở browser `http://localhost:5601`.

### Tắt khi không dùng

```bash
docker compose down       # Stop, giữ data
docker compose down -v    # Stop + xoá volume (mất data)
```

## Cấu hình giải thích

### `discovery.type=single-node`

Nói cluster chạy **1 node**. Bỏ → ES chờ peer node khác → không start.

### `xpack.security.enabled=false`

Tắt authentication. **Chỉ cho local learning**. Production phải bật.

→ Nếu bật, mỗi request cần `--user elastic:password`. Phức tạp cho học.

### `ES_JAVA_OPTS=-Xms2g -Xmx2g`

Set JVM heap:
- `-Xms` = initial heap size.
- `-Xmx` = max heap size.

**Best practice**: set bằng nhau → JVM không phải resize → predictable.

**Quy tắc heap size**:
- Tối đa **50% RAM** máy.
- Không quá **30 GB** (do JVM compressed pointer limit).

→ Phase 8 bài 4 sâu hơn.

### `bootstrap.memory_lock=true`

Lock memory → OS không swap → tránh latency spike.

### Volume `es-data`

Lưu data ngoài container → restart container không mất index. **Quan trọng**.

## Cài native (alternative)

Nếu không thích Docker, cài trực tiếp.

### Linux (Ubuntu/Debian)

```bash
# Add Elastic repo
wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo apt-key add -
sudo apt-get install apt-transport-https
echo "deb https://artifacts.elastic.co/packages/8.x/apt stable main" | \
    sudo tee /etc/apt/sources.list.d/elastic-8.x.list

# Install
sudo apt-get update && sudo apt-get install elasticsearch kibana

# Configure (tắt security cho local)
sudo nano /etc/elasticsearch/elasticsearch.yml
# Set: xpack.security.enabled: false
# Set: discovery.type: single-node

# Start
sudo systemctl daemon-reload
sudo systemctl enable elasticsearch kibana
sudo systemctl start elasticsearch kibana

# Verify
curl http://localhost:9200
```

### macOS

```bash
brew install elastic/tap/elasticsearch-full
brew install elastic/tap/kibana-full
brew services start elasticsearch-full
brew services start kibana-full
```

### Windows

Download MSI/ZIP từ <https://www.elastic.co/downloads/elasticsearch>.

## Verify Kibana

Mở `http://localhost:5601` → màn hình welcome:

```text
┌─────────────────────────────────────────────────┐
│            Welcome to Kibana                     │
│                                                  │
│  Browse data from Elasticsearch...               │
│                                                  │
│  [Add integrations] [Explore on my own]          │
└─────────────────────────────────────────────────┘
```

Click **Explore on my own** → vào dashboard chính.

Quan trọng: **Dev Tools** (icon ⌘ trong sidebar) — REST console viết query trực tiếp.

```text
GET /
```

Click ▶ → kết quả JSON bên phải. → Tool **chính khoá học**.

## Test với data mẫu

Kibana có sample dataset có sẵn (eCommerce, Flights, Web Logs):

1. Trang welcome → **Add integrations**.
2. Tab **Sample data** → chọn **Sample web logs** → **Add data**.
3. Đợi vài giây → click **View data** → vào Dashboards thử ngay.

→ Verify cluster work end-to-end + xem demo Kibana mạnh thế nào.

## Heap size tuning

Default Docker image `ES_JAVA_OPTS=-Xms2g -Xmx2g` cho dev OK. Production:

```text
RAM máy 16 GB → heap 8 GB
RAM máy 32 GB → heap 16 GB
RAM máy 64 GB → heap 30 GB (không hơn)
RAM máy 128 GB → heap 30 GB + cluster nhiều node nhỏ thay vì 1 node lớn
```

→ Phase 8 sâu hơn.

## Đa node cluster (local)

Bài này chạy single-node. Multi-node setup:

```yaml
services:
  es-node1:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0
    environment:
      - node.name=node-1
      - cluster.initial_master_nodes=node-1,node-2,node-3
      - discovery.seed_hosts=es-node2,es-node3
    ...
  es-node2:
    ...
  es-node3:
    ...
```

→ Test sharding, replica, failover. Demo Phase 8 bài 7.

## Troubleshooting

### Lỗi: vm.max_map_count too low

```text
max virtual memory areas vm.max_map_count [65530] is too low
```

→ Linux/Mac (Docker Desktop dùng Linux VM):

```bash
sudo sysctl -w vm.max_map_count=262144
```

Persist: edit `/etc/sysctl.conf` thêm `vm.max_map_count=262144`.

### Lỗi: insufficient memory

→ Tăng RAM Docker Desktop (Preferences → Resources → Memory ≥ 4 GB).

### Kibana báo "Kibana server is not ready yet"

→ Elasticsearch chưa lên. Đợi 30s. Check `docker logs elasticsearch`.

### Browser cảnh báo HTTPS

Default 8.x Elasticsearch enable security + HTTPS. Khoá tắt qua `xpack.security.enabled=false` → dùng HTTP. Nếu vẫn HTTPS → restart container clean.

## Tóm tắt

- Cài bằng **Docker Compose** đơn giản nhất.
- Port: **9200** (REST API), **5601** (Kibana).
- Tắt security qua `xpack.security.enabled=false` cho local.
- Set heap qua `ES_JAVA_OPTS=-Xms2g -Xmx2g`. Production: ≤ 50% RAM, ≤ 30 GB.
- Volume `es-data` giữ data qua restart.
- **Dev Tools** trong Kibana = REST console — tool chính dùng suốt khoá.
- Test cluster: `curl http://localhost:9200` → JSON với `tagline: "You Know, for Search"`.
- Multi-node setup local cho test failover (Phase 8).

---

→ [Bài tiếp theo: REST API và curl](03-rest-api-va-curl.md)

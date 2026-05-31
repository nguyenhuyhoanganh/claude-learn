# Bài 1: Setup Kafka local bằng Docker Compose

Để học Kafka, bạn cần 1 Kafka broker chạy được. Không cần cluster 3 node, không cần ZooKeeper setup phức tạp. **1 container Docker** là đủ cho học + dev + local test.

Bài này: chọn image phù hợp, viết Docker Compose, launch container, exec vào CLI tools.

## Apache Kafka có 2 image chính thức

| Image | Tech | Use case |
|---|---|---|
| **apache/kafka** | JVM-based | General use, **production**, học. Bao gồm full CLI tools |
| **apache/kafka-native** | GraalVM native | Faster startup. **Experimental**. KHÔNG có CLI tools. CI/CD integration test |

**Khoá này dùng `apache/kafka`** (chuẩn). Sau này lúc viết integration test (Section 15) mới dùng `apache/kafka-native` cho fast startup.

> Lưu ý version: Kafka team release thường xuyên. Core concepts ổn định từ version 1+. Bài học sẽ dùng version mới nhất theo repo GitHub kèm khoá.

## Docker Compose YAML

Tạo file `docker-compose.yml`:

```yaml
services:
  kafka:
    image: apache/kafka:latest
    container_name: kafka
    working_dir: /opt/kafka
    ports:
      - "9092:9092"
```

Giải thích:

| Field | Nghĩa |
|---|---|
| `image: apache/kafka:latest` | Pull standard JVM image. Production thay `:latest` bằng specific version (vd `:3.8.0`). |
| `container_name: kafka` | Đặt tên container `kafka` để `docker exec` dễ. |
| `working_dir: /opt/kafka` | Khi `docker exec ... bash`, mặc định landing ở đây — chứa `bin/` (CLI tools) + `config/` (properties). |
| `ports: 9092:9092` | Map port broker. Producer/consumer trên host kết nối qua `localhost:9092`. |

Đơn giản. Không ZooKeeper riêng — Kafka 3.x dùng **KRaft mode** internal, embedded controller.

## Launch container

Terminal trong thư mục chứa `docker-compose.yml`:

```bash
docker compose up
# hoặc detached
docker compose up -d
```

Output (foreground mode):
```text
[+] Running 1/1
 ✓ Container kafka  Started
kafka | [2026-05-31 10:23:45,123] INFO Starting controller (kafka.server.ControllerServer)
kafka | [2026-05-31 10:23:45,234] INFO ...
kafka | [2026-05-31 10:23:46,012] INFO Kafka Server started (kafka.server.KafkaServer)
```

Khi thấy `Kafka Server started` → broker ready.

> Scroll lên: Kafka log tất cả internal config properties dùng. Tạm thời không cần đọc hết — sẽ học dần.

### Kiểm tra container

```bash
docker ps
# CONTAINER ID   IMAGE                COMMAND     PORTS                    NAMES
# abc123...      apache/kafka:latest  ...         0.0.0.0:9092->9092/tcp   kafka
```

### Stop

```bash
docker compose down       # stop + remove container
docker compose stop       # chỉ stop, giữ container
```

## Exec vào container — explore CLI

CLI tools nằm trong container, không có sẵn trên host. Phải exec vào:

```bash
docker exec -it kafka bash
```

- `-i` interactive (giữ stdin mở).
- `-t` allocate TTY.
- `kafka` = container name.
- `bash` = command chạy bên trong.

Bạn sẽ landing trong `/opt/kafka`:

```bash
[appuser@abc123 kafka]$ pwd
/opt/kafka

[appuser@abc123 kafka]$ ls -l
total ...
drwxr-xr-x  bin/
drwxr-xr-x  config/
drwxr-xr-x  libs/
drwxr-xr-x  logs/
...
```

### `bin/` — CLI tools

```bash
[appuser@abc123 kafka]$ ls bin/
kafka-topics.sh
kafka-console-producer.sh
kafka-console-consumer.sh
kafka-consumer-groups.sh
kafka-configs.sh
kafka-producer-perf-test.sh
... (~30 scripts)
```

Mỗi tool = 1 wrapper Java cho task admin/test khác nhau. Sẽ dùng trong các bài sau.

### `config/` — properties files

```bash
[appuser@abc123 kafka]$ ls config/
broker.properties
consumer.properties
controller.properties
producer.properties
server.properties
...
```

Mỗi file = 1 nhóm config (broker, consumer, etc.). Tạm thời không đụng — Kafka default cho học OK.

> Doc reference: kafka.apache.org/documentation/#configuration. Mỗi property có giải thích chi tiết.

## Quirks: gọi CLI tool phải `./script.sh`

```bash
[appuser@abc123 kafka]$ cd bin/
[appuser@abc123 bin]$ kafka-topics.sh --help
bash: kafka-topics.sh: command not found
```

Tại sao? Check `PATH`:

```bash
[appuser@abc123 bin]$ echo $PATH
/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# /opt/kafka/bin KHÔNG có
```

Phải dùng `./` prefix:

```bash
[appuser@abc123 bin]$ ./kafka-topics.sh --help
Create, delete, describe, or change a topic.
Option                                   Description
------                                   -----------
--alter                                  Alter the number of partitions...
...
```

Hoặc full path:
```bash
/opt/kafka/bin/kafka-topics.sh --help
```

> Khoá học sau này sẽ dùng `./` cho ngắn.

## Multi-container setup (Kafka + app)

Bạn sẽ thêm Spring Boot app + Kafka cùng compose:

```yaml
services:
  kafka:
    image: apache/kafka:latest
    container_name: kafka
    working_dir: /opt/kafka
    ports:
      - "9092:9092"
  
  consumer-app:
    build: ./consumer-app
    depends_on:
      - kafka
    environment:
      SPRING_KAFKA_BOOTSTRAP_SERVERS: kafka:9092   # ← container-internal hostname
```

Trong cùng compose network, services gọi nhau bằng service name (`kafka`), không phải `localhost`.

## Production note — đây CHỈ là dev setup

1-broker setup chỉ phù hợp:
- ✓ Local learning.
- ✓ Unit test, integration test trong dev.
- ✓ Demo.

KHÔNG dùng cho production vì:
- ✗ Single point of failure (1 broker chết = data inaccessible).
- ✗ Replication factor max = 1.
- ✗ Không có rolling upgrade.
- ✗ Không có high availability.

Production: 3+ brokers, replication factor 3, min in-sync replicas 2. Detail ở Phase 9 (Kafka Cluster Architecture).

## Troubleshoot phổ biến

| Issue | Fix |
|---|---|
| Port 9092 đã bind | `docker ps`, stop service đang dùng port. Hoặc đổi mapping `9093:9092`. |
| Container exit ngay | Check `docker logs kafka`. Thường missing config hoặc Java OOM. |
| `docker exec` báo not running | Container không up. `docker compose up -d` lại. |
| Disk full sau vài tuần | Kafka log accumulate. Set retention hoặc cleanup. |
| Apple Silicon (M1/M2) slow | Image multi-arch hỗ trợ ARM. Pull lại nếu emulated x86_64. |

## Tóm tắt bài 1

- 2 image official: **apache/kafka** (standard, dùng cho học + prod) vs **apache/kafka-native** (GraalVM, experimental, CI/CD test).
- Docker Compose 1 service đủ chạy local Kafka — KRaft mode, không cần ZooKeeper.
- `docker exec -it kafka bash` để vào container, landing `/opt/kafka`.
- `bin/` chứa CLI tools, gọi bằng `./script.sh` (không trong PATH).
- `config/` chứa properties files, doc reference ở kafka.apache.org.
- Setup này CHỈ cho dev — production cần cluster 3+ broker.

**Bài kế tiếp** → [Phase 3 - Bài 1: Kafka topics — cấu trúc lưu trữ event](../phase-3-kafka-fundamentals/01-topics-partitions.md)

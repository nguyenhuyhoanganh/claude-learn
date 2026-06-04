# Bài 1: Setup Kafka local bằng Docker Compose

Để học Kafka, bạn cần 1 Kafka broker chạy được. Mục tiêu của section này rất đơn giản: **dùng Docker Compose để chạy Kafka ở local** phục vụ học, dev và test. Không cần cluster 3 node, không cần ZooKeeper setup phức tạp. **1 container Docker** là đủ.

Lưu ý: ở giai đoạn này có thể bạn sẽ không hiểu hết mọi command/property — Kafka có rất nhiều thành phần, mọi concept cần được giới thiệu **từng cái một theo thứ tự cụ thể**. Hãy kiên nhẫn. Càng học càng sáng tỏ.

Bài này: chọn image phù hợp, viết Docker Compose, launch container, exec vào CLI tools.

## Apache Kafka có 2 image chính thức

Apache Kafka project cung cấp 2 official Docker image. Hiểu sự khác biệt rất quan trọng.

| Image | Tech | Use case |
|---|---|---|
| **apache/kafka** | JVM-based (Java standard) | General use, **production**, học. **Bao gồm CLI tools** đầy đủ |
| **apache/kafka-native** | GraalVM compile sang native binary | Faster startup. **Experimental** (đang thử nghiệm). **KHÔNG** có CLI tools. Chủ yếu cho integration test trong CI/CD pipeline |

**Khoá học này dùng `apache/kafka`** (standard image) cho việc học. Sau này khi viết integration test (Section 15) mới dùng `apache/kafka-native` cho startup nhanh.

### Về version Kafka

Kafka team release version mới khá thường xuyên. Đôi khi là bug fix, đôi khi là thay đổi architecture internal. Tuy nhiên **các core concept ổn định từ Kafka version 1+** — những gì học hôm nay vẫn dùng được cho năm sau.

GitHub repo của khoá học sẽ chứa toàn bộ source code, được update mỗi 3-6 tháng để giữ current. Khi học, **dùng version trong repo** thay vì version cũ trên slide video.

## Docker Compose YAML

Tạo file `docker-compose.yml` ở thư mục project:

```yaml
services:
  kafka:
    image: apache/kafka:latest
    container_name: kafka
    working_dir: /opt/kafka
    ports:
      - "9092:9092"
```

Giải thích từng field:

| Field | Ý nghĩa |
|---|---|
| `image: apache/kafka:latest` | Pull standard JVM image. Production nên thay `:latest` bằng version cụ thể (vd `:3.8.0`) để reproducible. |
| `container_name: kafka` | Đặt tên container là `kafka` để `docker exec` cho ngắn. |
| `working_dir: /opt/kafka` | Khi `docker exec ... bash`, mặc định landing ở đây. Path này chứa `bin/` (CLI tools) + `config/` (file properties). |
| `ports: 9092:9092` | Map port của broker. Producer/consumer trên host (máy của bạn) sẽ kết nối qua `localhost:9092`. |

Setup cực kỳ đơn giản. **Không cần ZooKeeper riêng** — Kafka 3.x dùng **KRaft mode** (Kafka Raft) với controller embedded ngay trong broker.

## Launch container

Mở terminal ở thư mục chứa `docker-compose.yml`:

```bash
docker compose up
# hoặc detached mode (chạy nền)
docker compose up -d
```

Output (foreground mode):
```text
[+] Running 1/1
 ✓ Container kafka  Started
kafka | [2026-06-01 10:23:45,123] INFO Starting controller (kafka.server.ControllerServer)
kafka | [2026-06-01 10:23:45,234] INFO ...
kafka | [2026-06-01 10:23:46,012] INFO Kafka Server started (kafka.server.KafkaServer)
```

Khi thấy dòng `Kafka Server started` → broker đã sẵn sàng.

> Nếu scroll log lên: Kafka in ra **toàn bộ properties** mà nó dùng khi start. Rất nhiều. Tạm thời không cần đọc hết — sẽ học dần dần xuyên suốt khoá.

### Kiểm tra container đang chạy

```bash
docker ps
# CONTAINER ID   IMAGE                COMMAND     PORTS                    NAMES
# abc123...      apache/kafka:latest  ...         0.0.0.0:9092->9092/tcp   kafka
```

### Stop container

```bash
docker compose down       # stop + xoá container
docker compose stop       # chỉ stop, giữ container (data tạm vẫn còn)
```

## Exec vào container — explore CLI tools

CLI tools nằm **trong container**, không có sẵn trên host. Phải exec vào:

```bash
docker exec -it kafka bash
```

- `-i` interactive (giữ stdin mở).
- `-t` allocate TTY (terminal giả).
- `kafka` = tên container.
- `bash` = command chạy bên trong (mở shell bash).

Bạn sẽ landing trong `/opt/kafka` (vì đặt `working_dir` ở compose):

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

### Thư mục `bin/` — CLI tools

```bash
[appuser@abc123 kafka]$ ls bin/
kafka-topics.sh
kafka-console-producer.sh
kafka-console-consumer.sh
kafka-consumer-groups.sh
kafka-configs.sh
kafka-producer-perf-test.sh
... (~30 script .sh)
```

Mỗi tool là 1 wrapper Java cho task admin/test khác nhau:
- `kafka-topics.sh` — quản lý topic (create, list, describe, delete).
- `kafka-console-producer.sh` — producer dòng lệnh, gửi message text.
- `kafka-console-consumer.sh` — consumer dòng lệnh, đọc message.
- `kafka-consumer-groups.sh` — xem/reset offset của consumer group.

Sẽ dùng tools này trong các bài tiếp theo.

### Thư mục `config/` — properties files

```bash
[appuser@abc123 kafka]$ ls config/
broker.properties
consumer.properties
controller.properties
producer.properties
server.properties
...
```

Mỗi file là 1 nhóm config:
- `broker.properties` — config khi node chạy role broker only.
- `controller.properties` — config khi node chạy role controller only.
- `server.properties` — config khi node chạy cả 2 role (broker + controller). Default Docker container dùng file này.
- `producer.properties` / `consumer.properties` — reference cho producer/consumer app (không phải config cho server).

Tạm thời không đụng các file này — Kafka default cho việc học đã OK.

> Doc reference đầy đủ: kafka.apache.org/documentation/#configuration. Mỗi property có mô tả chi tiết.

## Lưu ý: gọi CLI tool phải dùng `./script.sh`

Thử chạy:

```bash
[appuser@abc123 kafka]$ cd bin/
[appuser@abc123 bin]$ kafka-topics.sh --help
bash: kafka-topics.sh: command not found
```

Lỗi. Tại sao? Check biến `PATH`:

```bash
[appuser@abc123 bin]$ echo $PATH
/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# /opt/kafka/bin KHÔNG có trong PATH
```

Bash chỉ tìm command trong các path liệt kê. `/opt/kafka/bin` không có → không tìm thấy.

Fix: dùng `./` prefix để bash hiểu "chạy file ở thư mục hiện tại":

```bash
[appuser@abc123 bin]$ ./kafka-topics.sh --help
Create, delete, describe, or change a topic.
Option                                   Description
------                                   -----------
--alter                                  Alter the number of partitions...
...
```

Hoặc dùng full path:
```bash
/opt/kafka/bin/kafka-topics.sh --help
```

> Khoá học từ giờ sẽ dùng `./` cho ngắn gọn.

## Multi-container setup (Kafka + Spring Boot app)

Sau này bạn sẽ thêm Spring Boot app vào cùng `docker-compose.yml`:

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
      SPRING_KAFKA_BOOTSTRAP_SERVERS: kafka:9092   # ← dùng tên service, KHÔNG localhost
```

Trong cùng compose network, services gọi nhau bằng **tên service** (`kafka`), không phải `localhost`.

Tại sao? `localhost` bên trong container `consumer-app` = chính container `consumer-app`, không phải Kafka. Dùng tên service → Docker DNS resolve sang IP của container kafka.

## Setup này CHỈ dành cho dev — KHÔNG production

1-broker setup chỉ phù hợp:
- ✓ Local learning.
- ✓ Unit test, integration test trong dev.
- ✓ Demo, POC.

KHÔNG dùng cho production vì:
- ✗ **Single point of failure** — 1 broker chết = data inaccessible, hệ thống down.
- ✗ Replication factor max = 1 → không có backup data.
- ✗ Không có rolling upgrade (không upgrade Kafka mà không downtime được).
- ✗ Không có high availability.

Production phải dùng cluster: **3+ broker, replication factor 3, min in-sync replicas 2**. Chi tiết ở Phase 9 (Kafka Cluster Architecture Deep Dive).

## Troubleshoot các vấn đề phổ biến

| Vấn đề | Cách fix |
|---|---|
| Port 9092 đã bị bind | `docker ps`, stop service đang dùng port. Hoặc đổi mapping `9093:9092`. |
| Container exit ngay lập tức | Check `docker logs kafka`. Thường do missing config hoặc Java OOM. |
| `docker exec` báo "container is not running" | Container không up. Chạy `docker compose up -d` lại. |
| Disk đầy sau vài tuần | Kafka log accumulate. Set retention hoặc xoá thư mục `/opt/kafka/logs` định kỳ trong dev. |
| Apple Silicon (M1/M2/M3) chạy chậm | Image multi-arch hỗ trợ ARM. Pull lại nếu đang emulated x86_64. |

## Tóm tắt bài 1

- Apache Kafka có **2 image official**:
  - `apache/kafka` (standard JVM) — dùng cho học + production. Bao gồm CLI tools.
  - `apache/kafka-native` (GraalVM, experimental) — startup nhanh, dùng cho CI/CD integration test. Không có CLI tools.
- Docker Compose **1 service đơn giản** đủ chạy local Kafka — dùng KRaft mode, không cần ZooKeeper riêng.
- `docker exec -it kafka bash` để vào container, landing tại `/opt/kafka`.
- Thư mục `bin/` chứa CLI tools (~30 script), gọi bằng `./script.sh` (vì không trong PATH).
- Thư mục `config/` chứa properties files reference.
- Multi-container: services gọi nhau bằng **tên service**, không `localhost`.
- Setup này **CHỈ cho dev** — production cần cluster 3+ broker với replication.

**Bài kế tiếp** → [Phase 3 - Bài 1: Kafka core concepts — event, topic, broker, cluster](../phase-3-kafka-fundamentals/01-core-concepts-cluster.md)

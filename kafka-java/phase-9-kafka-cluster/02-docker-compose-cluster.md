# Bài 2: Multi-Node Cluster Docker Compose setup

Cài 3-node cluster local cho học. Bài này: env-variable override convention, full `docker-compose.yml`, từng config explained.

## Env-variable override rules

Docker container không quen edit `.properties` files. Kafka cho phép override mọi server property qua environment variable:

```text
Rules:
1. Prefix `KAFKA_`.
2. Property name UPPERCASE.
3. Replace dots (.) with underscores (_).

Examples:
  node.id                              → KAFKA_NODE_ID
  listeners                            → KAFKA_LISTENERS
  controller.quorum.voters             → KAFKA_CONTROLLER_QUORUM_VOTERS
  offsets.topic.replication.factor     → KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR
  auto.create.topics.enable            → KAFKA_AUTO_CREATE_TOPICS_ENABLE
```

Same rule applies to all configs. Used heavily in Docker Compose + Kubernetes.

## Common file: server.env

Properties **same across all 3 brokers** go here:

```env
# server.env

KAFKA_CLUSTER_ID=abc123-XYZ-cluster-uuid
KAFKA_PROCESS_ROLES=broker,controller

# Listener security
KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,INTERNAL:PLAINTEXT,EXTERNAL:PLAINTEXT
KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER
KAFKA_INTER_BROKER_LISTENER_NAME=INTERNAL

# Controller setup
KAFKA_CONTROLLER_QUORUM_VOTERS=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093

# Production-grade defaults
KAFKA_AUTO_CREATE_TOPICS_ENABLE=false
KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=3
KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=3
KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=2
```

### KAFKA_CLUSTER_ID

Generate once:
```bash
docker run --rm apache/kafka:latest /opt/kafka/bin/kafka-storage.sh random-uuid
# Output: 4LqzdcN-S6CN-XJHzKL...
```

Use this same UUID for all brokers + persistent across restart. Production: store in secret management.

### KAFKA_CONTROLLER_QUORUM_VOTERS

List all controller-eligible nodes:
```text
1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
```

Format: `nodeId@host:port`. `9093` = controller port (internal cluster comm).

### KAFKA_INTER_BROKER_LISTENER_NAME

Tells broker: "Use `INTERNAL` label for replication between brokers."

Replication traffic uses port labeled INTERNAL.

## Per-broker config — docker-compose.yml

```yaml
services:
  kafka1:
    image: apache/kafka:latest
    container_name: kafka1
    hostname: kafka1
    working_dir: /opt/kafka
    env_file:
      - server.env
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_LISTENERS: "CONTROLLER://kafka1:9093,INTERNAL://kafka1:9092,EXTERNAL://0.0.0.0:8081"
      KAFKA_ADVERTISED_LISTENERS: "INTERNAL://kafka1:9092,EXTERNAL://localhost:8081"
    ports:
      - "8081:8081"

  kafka2:
    image: apache/kafka:latest
    container_name: kafka2
    hostname: kafka2
    working_dir: /opt/kafka
    env_file:
      - server.env
    environment:
      KAFKA_NODE_ID: 2
      KAFKA_LISTENERS: "CONTROLLER://kafka2:9093,INTERNAL://kafka2:9092,EXTERNAL://0.0.0.0:8082"
      KAFKA_ADVERTISED_LISTENERS: "INTERNAL://kafka2:9092,EXTERNAL://localhost:8082"
    ports:
      - "8082:8082"

  kafka3:
    image: apache/kafka:latest
    container_name: kafka3
    hostname: kafka3
    working_dir: /opt/kafka
    env_file:
      - server.env
    environment:
      KAFKA_NODE_ID: 3
      KAFKA_LISTENERS: "CONTROLLER://kafka3:9093,INTERNAL://kafka3:9092,EXTERNAL://0.0.0.0:8083"
      KAFKA_ADVERTISED_LISTENERS: "INTERNAL://kafka3:9092,EXTERNAL://localhost:8083"
    ports:
      - "8083:8083"
```

### Breakdown per broker

- `node.id`: unique 1, 2, 3.
- `KAFKA_LISTENERS`:
  - `CONTROLLER://kafka1:9093` — listen on port 9093 for controller traffic.
  - `INTERNAL://kafka1:9092` — listen on 9092 for inter-broker replication.
  - `EXTERNAL://0.0.0.0:8081` — listen on 8081 (0.0.0.0 = all interfaces) for clients.
- `KAFKA_ADVERTISED_LISTENERS`:
  - `INTERNAL://kafka1:9092` — other Docker containers reach via Docker service name `kafka1`.
  - `EXTERNAL://localhost:8081` — host machine (your Java app) reaches via `localhost:8081`.
- `ports: 8081:8081` — Docker port mapping (host:container).

### Why different external ports?

Each broker exposes own port to host:
- Kafka1 → `localhost:8081`.
- Kafka2 → `localhost:8082`.
- Kafka3 → `localhost:8083`.

Host can talk to all 3. Required for client to receive metadata for all brokers.

Internal port 9092 same in all brokers — they communicate via Docker network using service names (`kafka1:9092`, `kafka2:9092`, ...).

## Start cluster

```bash
cd /path/to/kafka-cluster
docker compose down       # stop old single-node container if any
docker compose up -d      # start 3-node cluster

# Wait ~10 sec for cluster to form

docker ps -a              # verify all 3 running
# CONTAINER NAME   STATUS                  PORTS
# kafka1           Up 12 seconds           0.0.0.0:8081->8081/tcp
# kafka2           Up 12 seconds           0.0.0.0:8082->8082/tcp
# kafka3           Up 12 seconds           0.0.0.0:8083->8083/tcp
```

✅ 3 brokers running.

## Create topic with replication

```bash
docker exec -it kafka1 bash
cd /opt/kafka/bin

./kafka-topics.sh --bootstrap-server kafka1:9092 \
  --create --topic demo-topic \
  --partitions 2 \
  --replication-factor 3
```

✅ Topic đã được tạo.

### Describe — xem partition phân tán thế nào trong cluster

```bash
./kafka-topics.sh --bootstrap-server kafka1:9092 \
  --describe --topic demo-topic

# Output:
# Topic: demo-topic   TopicId: ...   PartitionCount: 2   ReplicationFactor: 3
#   Topic: demo-topic   Partition: 0   Leader: 1   Replicas: 1,2,3   Isr: 1,2,3
#   Topic: demo-topic   Partition: 1   Leader: 2   Replicas: 2,3,1   Isr: 2,3,1
```

Đọc output:
- **Partition 0**: Leader = node 1. Replica nằm ở các node 1, 2, 3. ISR = 1, 2, 3 (cả 3 đều đang đồng bộ).
- **Partition 1**: Leader = node 2. Replica nằm ở các node 2, 3, 1. ISR = 2, 3, 1.

**ISR** (In-Sync Replicas) = follower đang theo kịp leader (trong khoảng tolerance cho phép). Khi 1 follower lag quá xa hoặc disconnect, nó bị loại khỏi ISR.

## Demo High Availability

### Test 1: Stop broker 2

```bash
docker stop kafka2
```

Describe lại:
```text
Partition 0: Leader: 1   Replicas: 1,2,3   Isr: 1,3       ← Node 2 mất khỏi ISR
Partition 1: Leader: 3   Replicas: 2,3,1   Isr: 3,1       ← Trước Leader là 2, giờ thành 3
```

Quan sát:
- ✅ Node 2 từng là leader của partition 1 → controller tự động elect node 3 làm leader mới.
- ✅ ISR shrink (chỉ còn 1, 3 thay vì 1, 2, 3).
- ✅ Producer + consumer vẫn chạy bình thường — không bị gián đoạn.

### Restart broker 2

```bash
docker start kafka2
```

Đợi vài giây. Describe:
```text
Partition 0: Leader: 1   Replicas: 1,2,3   Isr: 1,2,3    ← ISR full trở lại
Partition 1: Leader: 3   Replicas: 2,3,1   Isr: 3,1,2
```

Node 2 catch up → rejoin ISR.

**Lưu ý**: leadership **có thể không tự động rebalance** về node 2 ngay lập tức. Kafka có cơ chế "**preferred leader election**" chạy định kỳ để đưa leadership về preferred leader (thường là replica đầu tiên trong list).

### Test 2: Có chịu được 2 broker chết cùng lúc không? KHÔNG.

Cluster 3 broker, quorum (đa số) = 2.

```bash
docker stop kafka1
docker stop kafka2
```

Chỉ còn kafka3 alive.

Kết quả: **cluster unavailable** (cluster không hoạt động được). Vì sao? Controller election cần **đa số** broker tham gia. 1 node không thể tự bầu chính mình làm controller (không đủ quorum).

→ **Quy tắc production**: cluster 3 node chịu được **1 broker fail đồng thời**. Muốn chịu được 2 fail đồng thời → cần 5 node (quorum 3).

```text
Số broker  |  Quorum  |  Số fail chịu được đồng thời
3          |  2       |  1
5          |  3       |  2
7          |  4       |  3
```

Nên dùng **số lẻ** (tránh split-brain — khi cluster bị chia 2 nửa bằng nhau, không bên nào đủ quorum).

## Demo Application — sống sót qua broker restart

Chạy producer + consumer với **chỉ 1 bootstrap server**:

```yaml
# section11/01-consumer.yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:8081           # chỉ Kafka1!
      bindings:
        consumer-in-0:
          consumer:
            configuration:
              auto.offset.reset: earliest
      bindings:
        consumer-in-0:
          destination: demo-topic
          group: demo-group
```

Bootstrap chỉ `localhost:8081`. Nhưng client **tự khám phá ra cả 3 broker** sau khi connect (qua cluster metadata broadcast).

Verify trong log consumer:
```text
[Consumer ...] Discovered cluster nodes: 1, 2, 3
```

Dù YAML chỉ config 1 broker, client biết đầy đủ về cả 3.

### Stop bootstrap broker giữa lúc producer + consumer đang chạy

Producer publish 1 message mỗi 50ms. Consumer đang đọc.

```bash
docker stop kafka1     # ← bootstrap server!
```

Application logs:
```text
[Consumer ...] Node 1 disconnected.
[Consumer ...] Rebalance triggered.
[Consumer ...] Adding newly assigned partitions: demo-topic-0
received: msg-634
received: msg-635
```

✅ **Application vẫn chạy bình thường** dù bootstrap broker đã chết. Client tự động fall back sang các broker khác (kafka2, kafka3).

Bootstrap server **KHÔNG phải là runtime dependency**. Chỉ cần thiết cho **lần kết nối đầu tiên** để client học metadata của cluster.

### Test tiếp: restart kafka1, stop kafka2

```bash
docker start kafka1
docker stop kafka2
```

Kết quả tương tự — consumer vẫn chạy bình thường.

### Stop kafka3

```bash
docker start kafka2
docker stop kafka3
```

Vẫn chạy bình thường.

**Producer + consumer KHÔNG miss bất kỳ message nào** qua tất cả các lần broker failure này.

## Command verify cluster

```bash
# Metadata cluster (Kafka 3.x KRaft mode)
./kafka-metadata-quorum.sh --bootstrap-server kafka1:9092 describe --status

# Danh sách broker đang alive
./kafka-broker-api-versions.sh --bootstrap-server kafka1:9092

# Topic + ISR status
./kafka-topics.sh --bootstrap-server kafka1:9092 --describe --topic demo-topic

# Consumer group lag
./kafka-consumer-groups.sh --bootstrap-server kafka1:9092 --describe --group demo-group
```

## Tổng kết toàn Phase 9

### Concepts

| Concept | Mang lại gì |
|---|---|
| **Nhiều broker** | Capacity (tổng CPU, disk, RAM) |
| **Partition** | Scalability (parallel processing cho 1 topic) |
| **Replication factor** | Availability (chịu được broker failure) |
| **Listeners** | Network communication nhiều lớp (control / data / external) |
| **Advertised listeners** | Cho client biết cách reach broker |
| **Controller quorum** | Consensus quản lý cluster |
| **ISR** | Follower đang đồng bộ, eligible làm leader khi cần |

### Cluster sizing

| Số broker | Số fail chịu được đồng thời | Replication factor khuyến nghị |
|---|---|---|
| 1 (dev) | 0 | 1 (không có lựa chọn khác) |
| 3 | 1 | 3 |
| 5 | 2 | 3 |
| 7 | 3 | 3 (hoặc 5 cho data cực quan trọng) |

`replication.factor=3` đủ cho 99% trường hợp production.

### Checklist config cluster production

- [ ] `replication.factor >= 3` cho business topic.
- [ ] `min.insync.replicas = 2` (Phase 12 sẽ học).
- [ ] `offsets.topic.replication.factor = 3`.
- [ ] `transaction.state.log.replication.factor = 3`.
- [ ] `auto.create.topics.enable = false`.
- [ ] Config client với nhiều bootstrap server (3+).
- [ ] `advertised.listeners` config đúng để client reach được.
- [ ] Listener khác nhau cho internal vs external traffic.
- [ ] SSL/SASL cho external listener ở production.
- [ ] Monitor ISR shrinking (alert khi ISR < replication factor).

## Take-away của Phase 9

- Cluster KHÔNG tự động cho HA. **Broker + partition + replication = 3 trục độc lập**, plan từng cái.
- Multi-broker Docker Compose = cách thực dụng có cluster local cho test.
- Quy tắc override property qua env variable: `KAFKA_<TÊN_PROPERTY_UPPERCASE_VÀ_DẤU_DOTS_THÀNH_UNDERSCORES>`.
- **Listeners** = nhiều port mỗi broker cho 3 loại traffic: control / data / external.
- `advertised.listeners` = broker khai báo **cách client reach mình**, theo "góc nhìn của người gọi".
- **ISR** track follower healthy. ISR sẽ shrink khi broker fail, expand lại khi broker recover.
- Client tự discover full cluster từ bootstrap server. Bootstrap broker **không phải runtime-critical**.
- Cluster 3 node chịu được **1 broker fail** đồng thời. Cluster 5 node chịu được 2.

**Bài kế tiếp** → [Phase 10 - High-Throughput Batch Processing](../phase-10-batch-processing/01-batch-consumer.md)

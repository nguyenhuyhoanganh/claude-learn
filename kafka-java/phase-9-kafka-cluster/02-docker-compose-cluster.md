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

✅ Topic created.

### Describe — see distribution

```bash
./kafka-topics.sh --bootstrap-server kafka1:9092 \
  --describe --topic demo-topic

# Output:
# Topic: demo-topic   TopicId: ...   PartitionCount: 2   ReplicationFactor: 3
#   Topic: demo-topic   Partition: 0   Leader: 1   Replicas: 1,2,3   Isr: 1,2,3
#   Topic: demo-topic   Partition: 1   Leader: 2   Replicas: 2,3,1   Isr: 2,3,1
```

Interpretation:
- Partition 0: Leader = node 1. Replicas in nodes 1, 2, 3. ISR = 1, 2, 3 (all in-sync).
- Partition 1: Leader = node 2. Replicas in nodes 2, 3, 1. ISR = 2, 3, 1.

**ISR** (In-Sync Replicas) = followers caught up with leader within tolerance.

## High availability demo

### Test 1: Stop broker 2

```bash
docker stop kafka2
```

Describe again:
```text
Partition 0: Leader: 1   Replicas: 1,2,3   Isr: 1,3       ← Node 2 missing
Partition 1: Leader: 3   Replicas: 2,3,1   Isr: 3,1       ← Was Leader 2, now 3
```

✅ Node 2 was leader of partition 1 → controller elect node 3 as new leader.
✅ ISR shrink (1, 3 instead of 1, 2, 3).
✅ Producer/consumer still work.

### Restart broker 2

```bash
docker start kafka2
```

Wait few seconds. Describe:
```text
Partition 0: Leader: 1   Replicas: 1,2,3   Isr: 1,2,3    ← back to full ISR
Partition 1: Leader: 3   Replicas: 2,3,1   Isr: 3,1,2
```

Node 2 catches up → rejoins ISR.

**Leadership might not auto-rebalance** back to node 2 immediately. Kafka has "preferred leader election" running periodically.

### Test 2: Tolerate 2 broker failures? No.

Cluster of 3 brokers, quorum = 2 (majority).

```bash
docker stop kafka1
docker stop kafka2
```

Only kafka3 alive.

Result: **cluster unavailable**. Why? Controller election needs majority. 1 node alone can't elect itself.

→ **Production rule**: 3-node cluster tolerates **1** failure simultaneously. For 2 simultaneous failures → need 5 nodes (quorum 3).

```text
Cluster size:  Quorum:  Tolerable failures:
3              2        1
5              3        2
7              4        3
```

Odd numbers preferred (avoid split-brain).

## Application demo — survive broker restart

Run producer + consumer with **only 1 bootstrap server**:

```yaml
# section11/01-consumer.yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:8081           # only Kafka1!
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

Bootstrap = `localhost:8081` only. But client **discovers all 3** after connecting (cluster metadata broadcast).

Verify in consumer log:
```text
[Consumer ...] Discovered cluster nodes: 1, 2, 3
```

Even though we only configured 1, client knows all 3.

### Stop bootstrap broker mid-flight

Producer publishing 1 msg/50ms. Consumer reading.

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

✅ **Application keeps working** dù bootstrap broker xuống. Client falls back to other brokers (kafka2, kafka3).

Bootstrap server không phải runtime dependency. Chỉ initial connection.

### Restart kafka1, stop kafka2

```bash
docker start kafka1
docker stop kafka2
```

Same result — consumer continues.

### Stop kafka3

```bash
docker start kafka2
docker stop kafka3
```

Continues working.

**Producer + consumer never miss message** across all these failures.

## Cluster verification commands

```bash
# Cluster metadata
./kafka-metadata-quorum.sh --bootstrap-server kafka1:9092 describe --status

# Broker list
./kafka-broker-api-versions.sh --bootstrap-server kafka1:9092

# Topic with ISR
./kafka-topics.sh --bootstrap-server kafka1:9092 --describe --topic demo-topic

# Consumer group lag
./kafka-consumer-groups.sh --bootstrap-server kafka1:9092 --describe --group demo-group
```

## Phase 9 — toàn bộ summary

### Concepts

| Concept | What it provides |
|---|---|
| **Multiple brokers** | Capacity (CPU, disk, RAM total) |
| **Partitions** | Scalability (parallelism per topic) |
| **Replication factor** | Availability (tolerate failures) |
| **Listeners** | Multi-network communication (control / data / external) |
| **Advertised listeners** | How clients reach each broker |
| **Controller quorum** | Cluster management consensus |
| **ISR** | In-sync followers, eligible for leader election |

### Cluster sizing

| Brokers | Tolerable simultaneous failures | Replication factor recommendation |
|---|---|---|
| 1 (dev) | 0 | 1 (no real choice) |
| 3 | 1 | 3 |
| 5 | 2 | 3 |
| 7 | 3 | 3 (or 5 for very critical) |

`replication.factor=3` covers 99% production cases.

### Production cluster config checklist

- [ ] `replication.factor >= 3` for business topics.
- [ ] `min.insync.replicas = 2` (Phase 12).
- [ ] `offsets.topic.replication.factor = 3`.
- [ ] `transaction.state.log.replication.factor = 3`.
- [ ] `auto.create.topics.enable = false`.
- [ ] Multiple bootstrap servers in client config.
- [ ] `advertised.listeners` correctly configured for client reachability.
- [ ] Different listener for internal vs external traffic.
- [ ] SSL/SASL for external in production.
- [ ] Monitor ISR shrinking.

## Phase 9 takeaways

- Cluster ≠ instant HA. Brokers + partitions + replication = 3 independent dimensions.
- Multi-broker Docker compose = practical local cluster.
- Env variable override convention: `KAFKA_<UPPER_PROPERTY_NAME_WITH_UNDERSCORES>`.
- Listeners = multiple ports per broker for control/data/external traffic.
- `advertised.listeners` = how clients reach broker, **per caller perspective**.
- ISR tracks healthy followers. Shrinks during broker failure.
- Client discovers full cluster from bootstrap. Bootstrap broker not runtime-critical.
- 3-node cluster tolerates 1 simultaneous failure. 5-node tolerates 2.

**Bài kế tiếp** → [Phase 10 - High-Throughput Batch Processing](../phase-10-batch-processing/01-batch-consumer.md)

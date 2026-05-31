# Bài 1: Replication Factor + Kafka Listeners deep-dive

Phase 3 đã giới thiệu cluster + leader/follower ở mức cao. Bài này dig sâu hơn để chuẩn bị setup cluster Docker thực tế ở bài sau.

2 concept cốt lõi:
1. **Replication factor** — bao nhiêu copies của mỗi partition trong cluster.
2. **Kafka listeners** — multiple ports/interfaces cho controller / internal / external traffic.

## Vấn đề: stateful application ≠ stateless scaling

Spring Boot microservice = **stateless**. Scale up = "spin more instances + load balancer." Đơn giản.

Kafka = **stateful**. Store data on disk.

```text
Kafka cluster với 3 brokers:
  Broker 1: stores order-events data
  Broker 2: stores product-views data
  Broker 3: stores inventory-events data

Producer cần publish "order-events":
  → Phải gọi Broker 1 (broker khác không có data của topic này)
```

KHÔNG phải mọi broker handle mọi topic. Mỗi topic data **assigned to specific brokers**.

→ Scaling Kafka không trivial. Cần hiểu **partitioning + replication**.

## Tổng kết: brokers vs partitions vs replication

```text
Brokers      → Capacity      (số máy = disk + CPU + RAM tổng)
Partitions   → Scalability   (parallelism cho 1 topic)
Replication  → Availability  (chịu broker failure)
```

3 trục độc lập. Plan từng cái.

## Partition distribution

### 1 partition, không scale

```text
Topic "product-view-events" với 1 partition.
Controller assigns Broker X = leader of partition 0.

100 product-service instances producing → ALL go to Broker X.
→ Broker X bottleneck.
100 consumer instances → max 1 active (vì 1 partition).
→ Useless paralellism.
```

→ Single partition = single point of contention.

### N partitions, scale linearly

```text
Topic "product-view-events" với 3 partitions.
Controller distributes:
  Partition 0 → Broker A (leader)
  Partition 1 → Broker B (leader)
  Partition 2 → Broker C (leader)

100 producers → traffic balanced across 3 brokers (by key hash).
3 consumers in group → 1-1 assignment.
```

Partitions = **fundamental unit of parallelism**.

Vẫn vấn đề: 1 broker chết → mất partition data → topic unavailable.

→ Cần **replication**.

## Replication factor

Khi tạo topic: `--replication-factor N`.

```bash
./kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic order-events \
  --partitions 2 --replication-factor 3
```

`replication-factor 3` = mỗi partition có **3 copies** (1 primary + 2 followers).

### Distribution

```text
Cluster 3 brokers, topic 2 partitions, replication factor 3:

Broker 1:  P0-leader   P1-follower
Broker 2:  P0-follower P1-leader
Broker 3:  P0-follower P1-follower

Total copies of P0: Broker1 + Broker2 + Broker3 = 3
Total copies of P1: Broker1 + Broker2 + Broker3 = 3
```

Controller distribute **evenly**. Mỗi broker có mix leader + follower.

### Replication = 1 → no redundancy

```text
Broker 1: P0 (only copy)
Broker 1 dies → P0 data inaccessible → topic unavailable.
```

Production NEVER use `replication-factor 1`.

### Replication = N → can tolerate N-1 broker failures

```text
RF=3 → tolerate 2 broker failures (1 copy still alive).
RF=2 → tolerate 1 broker failure.
RF=1 → tolerate 0.
```

### Replication factor ≤ broker count

```text
3 brokers, replication factor 5 → ERROR.
Mỗi partition cần 5 brokers để host, but only 3 available.
```

Common production setup: **3 brokers, RF=3, min.insync.replicas=2** (Phase 12 detail).

## Kafka Listeners — multiple ports for different traffic

Cluster có 3 types of communication:

| Type | Between | Purpose |
|---|---|---|
| **Control plane** | Controllers | Cluster management, election |
| **Data plane** | Brokers | Replication, internal data sync |
| **External** | Application ↔ Broker | Producer publish, consumer poll |

3 types → 3 different ports. Brokers listen on multiple addresses simultaneously.

### Configuration

```properties
listeners=CONTROLLER://kafka1:9093,INTERNAL://kafka1:9092,EXTERNAL://0.0.0.0:8081
controller.listener.names=CONTROLLER
inter.broker.listener.name=INTERNAL
```

Breakdown:
- `listeners` = list of `LABEL://host:port` triples. Broker opens all these.
- `controller.listener.names` = label used cho controller traffic.
- `inter.broker.listener.name` = label used cho broker replication.

Remaining labels (`EXTERNAL`) inferred for client traffic.

> Labels (`CONTROLLER`, `INTERNAL`, `EXTERNAL`) là **arbitrary names**. Kafka không hiểu "internal" có nghĩa gì. Bạn label "FOO", "BAR" cũng work. Tên semantically meaningful là best practice.

### Vì sao nhiều ports?

Network segmentation:
- **Controller traffic**: critical, low-volume, sensitive.
- **Inter-broker replication**: high-volume, internal subnet only.
- **External**: opens to clients, may need encryption (TLS).

Tách:
- Run on separate network interfaces (vd controller trên private subnet, external trên public).
- Apply different security (controller plaintext internal, external SASL_SSL).
- Different firewall rules.

## Advertised listeners — how clients reach the broker

Vấn đề:
- Broker listens at `0.0.0.0:8081`.
- Client connects → broker says "for this topic, talk to Broker X."
- Client needs to know **Broker X's reachable address**.

`advertised.listeners` = broker tells clients **how to reach me**.

```properties
advertised.listeners=INTERNAL://kafka1:9092,EXTERNAL://localhost:8081
```

Per label, where to reach this broker:
- Internal (other brokers in cluster): `kafka1:9092` (Docker service name).
- External (client app outside cluster): `localhost:8081` (port-mapped via Docker).

### From caller's perspective

`INTERNAL://kafka1:9092` — other Docker containers reach this via service name `kafka1`.
`EXTERNAL://localhost:8081` — host machine (running producer app) sees Kafka via port-mapped `localhost:8081`.

Both valid simultaneously. Network plane determines which is used.

### Real production

```properties
advertised.listeners=INTERNAL://10.0.1.5:9092,EXTERNAL://kafka1.acme.com:9092
```

Internal IP for VPC traffic. Public DNS for external client (cross-AZ, hybrid cloud).

## Security protocol per listener

Each listener has security:

```properties
listener.security.protocol.map=CONTROLLER:PLAINTEXT,INTERNAL:PLAINTEXT,EXTERNAL:SASL_SSL
```

| Protocol | Auth | Encryption |
|---|---|---|
| `PLAINTEXT` | None | None |
| `SSL` | None | Yes |
| `SASL_PLAINTEXT` | Username/password | None |
| `SASL_SSL` | Username/password | Yes |

Mix:
- Internal subnet trusted → `PLAINTEXT` (no overhead).
- External public-facing → `SASL_SSL` (security mandatory).

Phase 16 security deep-dive.

## Cluster ID + node ID

Per-broker properties:

```properties
node.id=1                        # unique per broker (1, 2, 3, ...)
cluster.id=abc123...             # SAME across all brokers
```

`cluster.id` generated once:
```bash
./kafka-storage.sh random-uuid
# abc123-XYZ-...
```

Use this same UUID for **all** brokers in cluster. Tells brokers "you belong to this cluster."

Different cluster IDs → brokers refuse to join.

## Controller quorum voters

```properties
controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
```

List of `nodeId@host:port` for **all controller-eligible nodes**.

Each broker knows about all controllers. During election, brokers vote among themselves.

KRaft mode (Kafka 3.0+) replaces ZooKeeper. Controllers maintain cluster metadata internally.

## Internal `__consumer_offsets` topic replication

Kafka tracks consumer offsets in `__consumer_offsets` internal topic.

Default replication factor:
```properties
offsets.topic.replication.factor=1
```

Production: **set to broker count or 3**:
```properties
offsets.topic.replication.factor=3
```

If 1 broker dies and only 1 copy → consumer offset tracking lost → confused on rebalance. **Always replicate**.

Same for `transaction.state.log.replication.factor` (Phase 14 transactions).

## Auto-create topics

Default dev:
```properties
auto.create.topics.enable=true
```

Producer/consumer to non-existent topic → auto-create with defaults (1 partition, RF=1).

Production:
```properties
auto.create.topics.enable=false
```

Reasons:
- Typo in topic name → silently create new topic. Producer publishes nothing visible to consumer. Bug.
- Auto-created defaults (RF=1) are unsafe.
- Topic creation should be explicit infra operation (Terraform, CLI).

## Broker properties summary table

| Property | Common? | Notes |
|---|---|---|
| `node.id` | Different per broker | 1, 2, 3, ... |
| `cluster.id` | Same | Generated once |
| `process.roles` | Same | `broker,controller` for combined |
| `listeners` | Different ports | Per broker may differ |
| `advertised.listeners` | Different | Reflects each broker's reachable address |
| `controller.quorum.voters` | Same | All controllers in cluster |
| `listener.security.protocol.map` | Same | Security per label |
| `controller.listener.names` | Same | Which label = controller |
| `inter.broker.listener.name` | Same | Which label = data plane |
| `auto.create.topics.enable` | Same | Set false in prod |
| `offsets.topic.replication.factor` | Same | Match broker count or 3 |

## Tóm tắt bài 1

- **Brokers**: capacity. **Partitions**: scalability. **Replication**: availability.
- Replication factor N = N copies per partition. Tolerate N-1 broker failures.
- Production: **3 brokers, RF=3, min.insync.replicas=2**.
- **Listeners**: multiple ports/labels per broker:
  - CONTROLLER (control plane).
  - INTERNAL (data plane, inter-broker).
  - EXTERNAL (clients).
- `advertised.listeners` = each broker tells clients **how to reach me** per label.
- Different security per listener possible (PLAINTEXT internal, SASL_SSL external).
- `cluster.id` shared across cluster. `node.id` unique.
- `controller.quorum.voters` = list of all controllers.
- Production: `auto.create.topics.enable=false`, `offsets.topic.replication.factor=3`.

**Bài kế tiếp** → [Bài 2: Multi-Node Cluster Docker Compose Setup](02-docker-compose-cluster.md)

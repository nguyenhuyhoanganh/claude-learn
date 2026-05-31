# Bài 9: Tóm tắt Phase 3 — mental model Kafka đã đủ

Bạn vừa đi qua **34 lessons + 9 files**. Trước khi sang code Java/Spring (Phase 4), bài này tổng kết toàn bộ mental model + cheatsheet CLI để tham khảo nhanh.

## Mental model — 1 trang

```text
+──────────────────────────────────────────────────────────────────+
│                       KAFKA CLUSTER                               │
│                                                                   │
│  +─────────────────────────────────────────────────────────────+ │
│  │   Controller (active, 1 of N controller-eligible nodes)      │ │
│  │     - assign partition leaders/followers                     │ │
│  │     - handle node failure / rebalance                        │ │
│  │     - DOES NOT serve client traffic                          │ │
│  +─────────────────────────────────────────────────────────────+ │
│                                                                   │
│  +────────────+ +────────────+ +────────────+ +────────────+     │
│  │ Broker 1   │ │ Broker 2   │ │ Broker 3   │ │ Broker 4   │     │
│  │            │ │            │ │            │ │            │     │
│  │ Topic A    │ │ Topic A    │ │ Topic A    │ │ Topic A    │     │
│  │  P0 LEADER │ │  P0 follow │ │  P1 LEADER │ │  P2 LEADER │     │
│  │  P1 follow │ │  P2 follow │ │  P0 follow │ │  P1 follow │     │
│  └────────────+ └────────────+ └────────────+ └────────────+     │
│                                                                   │
│  Topic A (3 partitions, replication factor 2):                   │
│    Partition 0: [msg0, msg1, msg2, ...]  ← append-only log        │
│    Partition 1: [msg0, msg1, ...]                                 │
│    Partition 2: [msg0, ...]                                       │
│                                                                   │
│  Internal: __consumer_offsets (ledger per group per partition)    │
│            __cluster_metadata (KRaft)                             │
+──────────────────────────────────────────────────────────────────+
              ▲                                ▲
              │ bootstrap.servers              │ bootstrap.servers
              │ (any broker)                   │
   +─────────────────+              +─────────────────────────────+
   │ Producer App    │              │ Consumer Group "payments"   │
   │ + client lib    │              │  ┌──────────┐ ┌──────────┐  │
   │                 │              │  │Consumer 1│ │Consumer 2│  │
   │ KafkaProducer   │              │  │ owns P0  │ │ owns P1,2│  │
   │ .send(record)   │              │  └──────────┘ └──────────┘  │
   │                 │              │   ← max parallel = #partitions
   │ batches:        │              │                              │
   │ linger.ms       │              │  poll() loop:                │
   │ batch.size      │              │   max.poll.records           │
   │                 │              │   commit offset → ledger     │
   │ hash(key)%N     │              │                              │
   │   → partition   │              │ Consumer Group "inventory":  │
   │                 │              │   independent ledger         │
   +─────────────────+              +─────────────────────────────+
```

## Concept recap

### 1. Event Streaming Platform
- Kafka = **event streaming**, not message queue, not DB.
- Capture + store durably + deliver real-time.
- Open source, distributed, JVM-based.
- Terms `event`, `message`, `record` interchangeable.

### 2. Cluster + Roles
- Production: cluster of N nodes.
- Each node: `process.roles = broker | controller | broker,controller`.
- **Broker** serves data (read/write). **Controller** manages cluster.
- **1 active controller** at a time. Rest are standbys.
- Small cluster: combined role. Large: dedicated controller nodes.

### 3. Topic + Partition + Offset
- **Topic** = logical, named bucket of events.
- **Partition** = physical append-only log inside topic.
- **Offset** = position within partition (per-partition, sequential, Long).
- Ordering guaranteed **within partition**, NOT across.

### 4. Leader/Follower replication
- Each partition has 1 leader broker + N followers (replication factor).
- Producer/consumer talk to **leader only**.
- Followers receive replicated data.
- Leader fails → follower promoted.

### 5. Bootstrap server
- Client only needs IP of **1 broker** to start.
- That broker returns full cluster metadata.
- Production: list 3+ for HA at connection time.

### 6. Serialization
- Kafka stores/transports **bytes only**.
- App responsible for serialize/deserialize.
- Built-in: String, Integer, Long, byte[].
- Complex objects: **JSON** (easy), **Avro/Protobuf** (production with schema registry).
- Console tools = String hard-coded.

### 7. Retention
- Default: 7 days (168h).
- Both time-based (`log.retention.hours`) and size-based (`log.retention.bytes`) active.
- Whichever first → segments deleted.
- Per-topic override via `kafka-configs.sh`.
- **Log compaction** = alternative: keep latest value per key.

### 8. Producer tuning
- Client library buffers + batches.
- **`linger.ms`** = max wait before flush (default 0).
- **`batch.size`** = max bytes per batch (default 16KB).
- Whichever first → send.
- Console default `--timeout-ms 1000` → 1s wait → batches visible.
- Production: 5-100ms linger, 16-64KB batch for balance.

### 9. Consumer model
- **PULL**, not push. Backpressure naturally handled.
- Persistent TCP + long-polling.
- `max.poll.records` (default 500) per poll.
- Tune by processing time + memory.

### 10. Consumer Groups
- Group = set of consumers sharing `group.id`.
- Within group: each message → **1 consumer only** (load balanced).
- Across groups: each group → independent stream (broadcast).
- Anonymous group if no `group.id` (CLI auto-assigns).
- Production: always explicit `group.id` (`service-env`).

### 11. Partition + Key
- Producer client computes: `partition = hash(key) % numPartitions`.
- Same key → same partition → sequential ordering preserved.
- Good keys: `account_id`, `user_id`, `order_id`, `device_id`.
- Bad keys: `current_date`, random, null (sticky partitioner for null).
- Manual partition override possible (rare).

### 12. Consumer scaling
- Max parallel consumers in group = number of partitions.
- More consumers than partitions → idle ones.
- Plan partition count for 3-5 year growth.

### 13. Rebalancing
- Triggered: consumer join/leave, partition added.
- Kafka redistribute partitions across group members.
- **Eager rebalance** = stop-the-world (default pre-2.4). **Cooperative** = incremental (preferred).
- Pitfalls: rebalance storm (rolling deploy), long processing kicked, session timeout.

### 14. Modifying partitions
- `--alter` increase: yes. Decrease: no.
- Increase breaks ordering temporarily for keys.
- Best: plan ahead. Or: create new versioned topic + migrate.

### 15. Offset tracking
- Kafka maintains ledger: `(group, partition) → current_offset`.
- Stored in internal topic `__consumer_offsets`.
- Survives consumer crash/restart.
- `--describe` shows CURRENT-OFFSET, LOG-END-OFFSET, LAG.
- `LAG > 0` → backlog.

### 16. Reset offsets
- `kafka-consumer-groups.sh --reset-offsets`.
- Options: `--shift-by`, `--to-earliest`, `--to-latest`, `--to-offset`, `--by-duration`, `--to-datetime`.
- Stop consumers first.
- `--dry-run` then `--execute`.
- App-level commit via manual ack for fine control (Phase 12).

## CLI Cheatsheet

```bash
# === Setup ===
docker compose up -d
docker exec -it kafka bash
cd /opt/kafka/bin

# === Topics ===
./kafka-topics.sh --bootstrap-server localhost:9092 --create --topic NAME --partitions N
./kafka-topics.sh --bootstrap-server localhost:9092 --list
./kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic NAME
./kafka-topics.sh --bootstrap-server localhost:9092 --delete --topic NAME
./kafka-topics.sh --bootstrap-server localhost:9092 --alter --topic NAME --partitions M

# === Console Producer ===
./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic NAME
./kafka-console-producer.sh --bootstrap-server localhost:9092 --topic NAME \
  --property parse.key=true --property key.separator=:
./kafka-console-producer.sh ... --timeout-ms 0   # send immediately

# === Console Consumer ===
./kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic NAME
./kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic NAME --from-beginning
./kafka-console-consumer.sh ... --group GROUPNAME
./kafka-console-consumer.sh ... --property print.key=true --property print.offset=true --property print.timestamp=true

# === Consumer Groups ===
./kafka-consumer-groups.sh --bootstrap-server localhost:9092 --list
./kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group NAME
./kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group NAME --topic TOPIC --reset-offsets --shift-by -10 --dry-run
# replace --dry-run with --execute when ready

# === Configs (per-topic override) ===
./kafka-configs.sh --bootstrap-server localhost:9092 \
  --entity-type topics --entity-name NAME \
  --alter --add-config retention.ms=2592000000   # 30 days
```

## Production readiness checklist (Phase 3 level)

- [ ] Cluster size: 3+ brokers production.
- [ ] Replication factor: 3 (min in-sync replicas 2).
- [ ] Topic naming: consistent convention (`service.entity.v1`).
- [ ] Partition count: plan 3-5 year growth.
- [ ] Key chosen for ordering requirements (entity ID).
- [ ] Consumer group naming: `service-env`.
- [ ] Retention configured per business need (default 7d may not fit).
- [ ] Serializer chosen: Avro/Protobuf with schema registry for production.
- [ ] Monitoring: consumer lag dashboard.
- [ ] Idempotent consumer for safe reprocessing.

Items này sẽ deep-dive trong Phase 9 (Cluster Architecture), 11 (Concurrency), 12 (Reliability), 18 (Best Practices).

## Common mistakes Phase 3

| Mistake | Why bad | Fix |
|---|---|---|
| 1 partition for high-traffic topic | Cannot scale consumers | Plan partition count for growth |
| Random / date / null key for ordered processing | All to 1 partition or distribution skewed | Use entity ID as key |
| Consumer in same group thấy duplicate message | Misconfigured `group.id` (different per instance) | Same `group.id` for all instances |
| `--from-beginning` không có effect sau lần đầu | Ledger là source of truth, not CLI flag | Use `--reset-offsets --to-earliest` |
| Reset offset không stop consumer | Kafka rejects | Stop all consumers first |
| Topic alter +partition cho critical ordered events | Broken ordering for keys | New topic + migration |
| Forget `--bootstrap-server` flag | Required, no default | Use shell alias |
| Ignore consumer lag in production | Silent buildup → eventually OOM | Monitor + alert on lag |

## Cái gì còn ở Phase 4+?

- **Phase 4-5**: Spring Cloud Stream — producer/consumer/processor apps trong Java.
- **Phase 6**: Consumer group scaling deep-dive (rebalance protocols).
- **Phase 7**: Processor (stream processing logic).
- **Phase 8**: Event routing (multiple destinations, conditional).
- **Phase 9**: Cluster architecture (replication factor, ISR, min.insync.replicas).
- **Phase 10**: High-throughput batch processing.
- **Phase 11**: Concurrent message processing (multi-thread per consumer).
- **Phase 12**: Acknowledgement modes (manual, auto, sync vs async).
- **Phase 13**: Error handling (DLQ, retry topics, recoverable vs fatal).
- **Phase 14**: Transactions (exactly-once cross-topic).
- **Phase 15**: Integration testing (Testcontainers, embedded Kafka).
- **Phase 16**: Security (SASL, SSL, ACL).
- **Phase 17**: Final project Netflux.
- **Phase 18**: Best practices.

## Tóm tắt Phase 3

Phase 3 đã build mental model:
- **What** Kafka stores (topics, partitions, offsets, bytes).
- **Who** stores it (brokers + controllers, leader/follower).
- **How** producer sends (batched via client lib, key→partition).
- **How** consumer reads (pull, group, parallel via partition assignment).
- **How** Kafka remembers (offset ledger per group per partition).
- **How** to recover/replay (reset offsets).

Bạn đã có đủ base để **code Java/Spring** app phase tiếp theo. Mental model rõ ràng = code clear.

**Bài kế tiếp** → [Phase 4 - Bài 1: Setup Spring Cloud Stream + first consumer](../phase-4-spring-cloud-stream-consumer/01-spring-cloud-stream-intro.md)

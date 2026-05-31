# Bài 1: Kafka core concepts — event, topic, broker, cluster

Bạn đã setup được Kafka container. Trước khi gõ command đầu tiên, cần có **mental model** đúng. Bài này: định nghĩa event/topic/producer/consumer, vai trò broker/controller trong cluster, leader/follower replication, và **bootstrap server** — concept mà tất cả Kafka client phải biết.

## Event là gì?

> **Event** = bất cứ thứ gì xảy ra trong business domain của bạn.

Ví dụ:
- "Sam liked a tweet."
- "Sam placed an order."
- "User clicked a link."
- "Driver shared current location (lat, lng)."

Terminology mixed thường xuyên:
| Term | Source |
|---|---|
| **Event** | Developers (loose) |
| **Message** | Developers (loose) |
| **Record** | **Official Kafka term** |

Trong khoá này dùng **event** và **message** xen kẽ. Khi Kafka API/CLI ghi `record` → cũng là event.

## Kafka = Event Streaming Platform

Tính năng cốt lõi:
1. **Capture** events khi chúng xảy ra trong application.
2. **Store** events durably (disk, replicated).
3. **Deliver** events to other applications real-time (hoặc replay sau).

Đặc điểm:
- **Open source** (Apache project).
- **Distributed** by design (cluster of nodes).
- Viết chủ yếu bằng **Java**, vài component **Scala**.

## Topic — đơn vị tổ chức data

> **Topic** = collection of related events, giống "table" trong RDBMS.

```text
Kafka cluster có thể chứa:
  - Topic "product-view-events"     ← khi user click vào product
  - Topic "order-events"             ← khi user place order
  - Topic "driver-locations"         ← từ Uber driver phone
  - Topic "payment-events"
  - ... hàng trăm/ngàn topics
```

KHÔNG có hard limit số topic — phụ thuộc resource (disk, RAM).

### Naming convention

Kafka cho phép:
- Lowercase + uppercase letters.
- Digits.
- Dấu chấm `.`, gạch nối `-`, gạch dưới `_`.

KHÔNG bắt buộc theo pattern nào. Nhưng team nên **consistent**:
- `order-events`, `payment-events` (kebab-case).
- `order.events.v1` (dot-namespaced, có version).
- `ORDER_EVENTS` (uppercase).

Chọn 1, dùng nhất quán.

## Producer + Consumer

```text
+──────────────────────+      write     +─────────────────+
│ Order Service (Java) │ ───────────►   │  Kafka topic   │
│ (producer)           │                │  "order-events"│
+──────────────────────+                +─────────────────+
                                                 │
                                                 │ read
                                                 ▼
                                       +──────────────────────+
                                       │ Payment Service     │
                                       │ (Python, consumer)  │
                                       +──────────────────────+
```

Bất kỳ app **publish messages** = **Producer**.
Bất kỳ app **read messages** = **Consumer**.

Producer/consumer = role, không phải fixed app. 1 app có thể vừa producer vừa consumer (Section 07: Processor app).

## Vấn đề: 1 node Kafka chết = mất hết?

Local dev: 1 container OK. **Production tuyệt đối không**.

Cần:
- **High availability**: 1 node chết, system vẫn chạy.
- **Horizontal scalability**: traffic tăng → thêm node để chia tải.

Solution: **Kafka cluster** — multiple Kafka servers chạy chung.

```text
+──────────────────────────────────────+
│ Kafka Cluster                         │
│  +──────+ +──────+ +──────+ +──────+ │
│  │ Node1│ │ Node2│ │ Node3│ │ Node4│ │
│  +──────+ +──────+ +──────+ +──────+ │
│  ↕ ↕ ↕ ↕ — they all know each other  │
+──────────────────────────────────────+
        ▲
        │ producer/consumer talk to cluster
        │
   Application
```

**Application không cần biết có bao nhiêu node**. Code app **giống hệt** với 1 node hay 100 node — cluster là black box.

## Node Roles: Broker vs Controller

Mỗi Kafka node chạy với 1 trong 3 role configurations:

| `process.roles` value | Meaning |
|---|---|
| `broker` | Chỉ làm broker (xử lý data) |
| `controller` | Chỉ làm controller (quản lý cluster) |
| `broker,controller` | Cả 2 (default cho small cluster, KRaft mode) |

### Broker — data plane

- Stores data on disk.
- Handle read + write requests từ producer/consumer.
- Cluster có **nhiều brokers** đồng thời.

### Controller — control plane

- Manages cluster operations: assign topic partitions to brokers, monitor health, trigger leader election.
- **Chỉ 1 controller active tại 1 thời điểm**.
- **KHÔNG handle client traffic** (producer/consumer không kết nối controller).
- Controller chết → các node controller-eligible khác bầu controller mới.

### Strategy theo cluster size

```text
SMALL cluster (3 nodes, dev/staging):
  Every node: process.roles=broker,controller
  → 1 trong 3 là controller, 2 là standby controller + tất cả serve broker.

LARGE cluster (100+ nodes, production):
  3 dedicated controller nodes: process.roles=controller
    (1 active + 2 standby, không handle data)
  97 broker nodes: process.roles=broker
  → Tách concern: controller chuyên quản lý, broker chuyên data.
```

Lý do tách ở large cluster: controller work load cao (nhiều partition, frequent rebalance). Nếu kiêm broker → bottleneck.

### Trong container của bạn

Docker container chạy với default `server.properties`:

```bash
# Inside container
grep process.roles config/server.properties
# process.roles=broker,controller
```

→ 1 node làm cả 2 việc. Đủ cho dev.

```bash
# Other property files for reference
grep process.roles config/broker.properties      # broker
grep process.roles config/controller.properties  # controller
```

## Leader & Follower — replication mechanism

Topic được tạo trên cluster — controller assign **owner**:

```text
Step 1: Controller picks 1 broker to be LEADER for topic "order-events".
Step 2: Producer writes "OrderPlaced" → goes to LEADER broker.
Step 3: LEADER stores on disk + serves to consumers.
```

Vấn đề: Leader chết → data trên broker đó = mất.

Solution: Controller cũng assign **followers**:

```text
+──────────+   "you are LEADER for order-events"
│ Broker 1 │ ◄────────────────────────────────── Controller
+──────────+
     │ replicate to followers
     ▼
+──────────+ +──────────+
│ Broker 2 │ │ Broker 3 │  ← FOLLOWERS (backup)
│ FOLLOWER │ │ FOLLOWER │
+──────────+ +──────────+
```

Mỗi message Producer gửi:
1. Leader write to disk.
2. Leader replicate sang Followers.
3. Followers acknowledge.

Leader chết → Controller promote 1 Follower thành new Leader. Producer/Consumer **không bị gián đoạn**.

Đây là **replication**. Detail (replication factor, ISR — In-Sync Replicas, ack mode) ở Phase 9 (Cluster Architecture Deep Dive).

### Topic phân tán đều cluster

```text
Topic "order-events":  Broker1=Leader, Broker2=Follower, Broker3=Follower
Topic "payment-events": Broker2=Leader, Broker1=Follower, Broker3=Follower
Topic "user-events":   Broker3=Leader, Broker1=Follower, Broker2=Follower
```

Mỗi broker đều có load (vừa leader vừa follower). Không có 1 broker idle.

## Bootstrap Server — single point of entry

Cluster 100 broker. Application làm sao gọi đúng broker chứa data?

**Không cần biết IP của 100 broker**. Chỉ cần biết **1 broker bất kỳ** đang sống.

```text
Application Code:
  bootstrap.servers = broker-1.kafka.acme.com:9092

Connect → broker-1 send back ENTIRE cluster metadata:
  - "order-events" → leader on broker-7
  - "payment-events" → leader on broker-12
  - ... all 100 brokers info
  
App's Kafka client (library) caches metadata, routes future requests directly.
```

**Bootstrap server = bất kỳ broker nào**. Không phải special role.

### Bootstrap server chết khi connect lần đầu?

Vấn đề: app khởi động, biết duy nhất `broker-1`, mà broker-1 down → app không connect được.

Fix: cung cấp **list** of bootstrap servers:

```yaml
# application.properties
spring.kafka.bootstrap-servers: broker-1:9092,broker-2:9092,broker-3:9092
```

Client thử lần lượt, success với broker đầu tiên alive. Sau đó full metadata.

### Practical

- Dev: 1 broker → `localhost:9092`.
- Production: 3+ bootstrap servers (cùng cluster nhưng different node, để tránh single-point-of-failure ở connection time).

## Recap mental model

```text
┌─ Cluster (1+ Nodes) ─────────────────────────────┐
│                                                   │
│  Each Node = Broker, Controller, or both          │
│                                                   │
│  Controller (1 active) — manages cluster:         │
│    - assigns leader/followers per topic           │
│    - reacts to node failures                      │
│                                                   │
│  Brokers (many) — store + serve data:             │
│    - Topic-A leader → handles Topic-A reads/writes│
│    - Topic-A follower → keeps replica             │
│                                                   │
│  Bootstrap Server = any broker reachable          │
│    → client gets full metadata → routes correctly │
│                                                   │
└───────────────────────────────────────────────────┘

         ▲                            │
         │ produce                    │ consume
         │                            ▼
    Producer App                Consumer App
```

## Tóm tắt bài 1

- **Event = message = record** — same thing, different naming context.
- **Topic** = collection of events, giống RDBMS table. Unlimited (theo resource).
- **Producer** publish to topic. **Consumer** read from topic. 1 app có thể cả 2.
- **Kafka cluster** = nhiều Kafka servers cho HA + scalability. Application không biết có bao nhiêu node.
- 2 roles: **Broker** (data) + **Controller** (cluster management). Small cluster: 1 node có cả 2. Large cluster: tách.
- **Controller** chỉ 1 active, có standby. Controller chết → re-elect tự động.
- **Leader broker** sở hữu topic, handle read/write. **Followers** = backup. Leader chết → follower promote.
- **Bootstrap server** = bất kỳ 1 broker. Client kết nối → nhận full cluster metadata. List để tránh SPOF ở init time.

**Bài kế tiếp** → [Bài 2: Tạo topic + producer + consumer bằng CLI](02-topics-cli-demo.md)

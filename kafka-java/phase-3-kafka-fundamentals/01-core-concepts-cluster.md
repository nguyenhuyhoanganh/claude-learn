# Bài 1: Kafka core concepts — event, topic, broker, cluster

Bạn đã setup được Kafka container ở Phase 2. Trước khi gõ command đầu tiên, cần có **mental model** đúng. Bài này định nghĩa:

- **Event** là gì?
- **Topic** là gì?
- **Producer** và **Consumer** là gì?
- **Broker** + **Controller** là gì? Cluster hoạt động ra sao?
- **Leader/Follower** replication.
- **Bootstrap server** — concept mà mọi Kafka client phải biết.

Section này hoàn toàn về Kafka, **chưa có Java, chưa có Spring Boot**. Sẽ chỉ dùng CLI tool để làm quen với Kafka. Vài bài đầu tập trung lý thuyết để có mental model đúng, sau đó nhiều demo hands-on.

## Event là gì?

> **Event** = bất cứ điều gì xảy ra trong business domain của bạn.

Ví dụ event trong các business khác nhau:
- "Sam liked a tweet" — social media.
- "Sam placed an order" — e-commerce.
- "User clicked a link" — analytics.
- "Driver shared current location (lat, lng)" — ride-sharing như Uber.

Event có thể là bất cứ điều gì.

### Terminology — event vs message vs record

Người ta dùng các thuật ngữ này **lẫn lộn**, đặc biệt dev:

| Term | Nguồn |
|---|---|
| **Event** | Developer (dùng phổ biến, loose) |
| **Message** | Developer (dùng phổ biến, loose) |
| **Record** | **Official Kafka terminology** (chính thức) |

Tất cả đều **cùng ý nghĩa** trong context Kafka. Trong khoá học sẽ dùng **event** và **message** xen kẽ. Khi Kafka CLI/API ghi `record` → cũng chính là event.

## Kafka là Event Streaming Platform

Tính năng cốt lõi:
1. **Capture** event khi chúng xảy ra trong application.
2. **Store** event durably (lưu bền bỉ trên disk, replicated qua nhiều node).
3. **Deliver** event đến các application khác **real-time** (hoặc replay sau này).

Đặc điểm:
- **Open source** (Apache project).
- **Distributed** (phân tán) by design.
- **Highly available, horizontally scalable**.
- Viết chủ yếu bằng **Java**, một số component bằng **Scala**.

## Kafka lưu data như thế nào?

Câu hỏi này khó trả lời rõ ngay bây giờ. Sẽ giải thích ở mức high-level trước. Internal mechanism sẽ học dần.

### Topic — đơn vị tổ chức data

> **Topic** = collection of related events. Giống như **table** trong relational database.

```text
Kafka cluster có thể chứa:
  - Topic "product-view-events"     ← khi user click vào product
  - Topic "order-events"             ← khi user place order
  - Topic "driver-locations"         ← từ Uber driver phone app
  - Topic "payment-events"
  - Topic "inventory-events"
  - ... hàng trăm hoặc hàng ngàn topic
```

**KHÔNG có hard limit** số topic — phụ thuộc resource (disk, RAM, file descriptor) bạn có.

### Naming convention

Kafka cho phép topic name chứa:
- Lowercase + uppercase letters (a-z, A-Z).
- Digits (0-9).
- Dấu chấm `.`, gạch nối `-`, gạch dưới `_`.

**KHÔNG bắt buộc theo pattern nào**. Nhưng team nên chọn 1 convention và **dùng nhất quán**:
- `order-events`, `payment-events` (kebab-case với dash).
- `order.events.v1` (dot-namespaced, có version).
- `ORDER_EVENTS` (uppercase với underscore).

Chọn 1, dùng nhất quán cho cả team.

## Producer + Consumer

Ví dụ kiến trúc cụ thể:

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

- OrderService (viết bằng Spring Boot) **publish event** khi user place order → gọi là **Producer**.
- PaymentService (viết bằng Python) **consume event** và charge tiền user → gọi là **Consumer**.

Quy tắc:
- App **publish** message → **Producer**.
- App **read** message → **Consumer**.
- Producer/Consumer là **role**, không phải fixed app. 1 app có thể vừa producer vừa consumer (sẽ học ở Section 07: Processor).

## Vấn đề: nếu 1 node Kafka chết thì sao?

Trong dev local, chạy 1 container OK. **Production tuyệt đối không**.

Nếu chỉ 1 node Kafka và nó crash do OOM (out of memory) hoặc disk full → toàn bộ application **không thể giao tiếp**, mọi order pending bị mất.

Cần:
- **High availability** (HA, sẵn sàng cao): 1 node chết, hệ thống vẫn chạy.
- **Horizontal scalability** (scale ngang): traffic tăng → thêm node để chia tải.

Application sẽ gọi vào Kafka server. Hỏi: 1 Kafka server xử lý được bao nhiêu request 1 lúc? Không vô hạn. Vậy phải chạy **nhiều Kafka instance** để distribute load.

## Kafka Cluster

Solution: chạy **multiple Kafka server cùng nhau** theo mode **cluster**.

```text
+──────────────────────────────────────+
│ Kafka Cluster                         │
│  +──────+ +──────+ +──────+ +──────+ │
│  │ Node1│ │ Node2│ │ Node3│ │ Node4│ │
│  +──────+ +──────+ +──────+ +──────+ │
│  ↕ ↕ ↕ ↕ — they all know each other  │
│                                       │
│  Mỗi node biết về mọi node khác,      │
│  giống như một gia đình.              │
+──────────────────────────────────────+
        ▲
        │ Producer/Consumer talk to cluster
        │
   Application
```

Cách hoạt động:
- Mỗi instance biết về mọi instance khác trong cluster.
- Application gọi vào cluster — **không quan trọng cluster có 1 node hay 100 node**, code Application **GIỐNG NHAU** trong cả 2 trường hợp.
- Từ góc nhìn application: Kafka cluster là **complete black box**.

## Node Roles: Broker vs Controller

Mỗi Kafka node khi start phải có **role**. Có 2 role, configured qua property `process.roles`:

| `process.roles` value | Ý nghĩa |
|---|---|
| `broker` | Node chỉ làm broker (xử lý data) |
| `controller` | Node chỉ làm controller (quản lý cluster) |
| `broker,controller` | Node làm cả 2 (default cho small cluster, KRaft mode) |

### Broker — data plane (mặt phẳng data)

- **Lưu data** trên disk.
- Handle **read + write request** từ producer và consumer.
- Cluster có **nhiều broker** đồng thời (đa số node là broker).

### Controller — control plane (mặt phẳng điều khiển)

- **Quản lý cluster**: assign partition của topic cho broker nào, monitor health, trigger leader election khi cần.
- **Chỉ 1 controller active tại 1 thời điểm** trong toàn cluster.
- Controller **KHÔNG handle client traffic** (producer/consumer **không** kết nối controller).
- Khi controller chết → các node có role controller khác **bầu cử (election)** ra controller mới.

### Strategy chọn role theo kích thước cluster

```text
SMALL cluster (3 node, dev/staging):
  Mỗi node có: process.roles=broker,controller
  → 1 trong 3 node được bầu làm controller active,
    2 node còn lại là standby controller.
  → Cả 3 node đồng thời serve broker traffic.

LARGE cluster (100+ node, production):
  3 node dedicated làm controller: process.roles=controller
    (1 active + 2 standby, KHÔNG handle data traffic)
  97 node làm broker: process.roles=broker
  → Tách concern: controller chuyên quản lý cluster,
    broker chuyên xử lý data.
```

Lý do tách ở large cluster: controller có **rất nhiều việc** (nhiều partition, frequent rebalance). Nếu vừa làm controller vừa làm broker thì bị bottleneck.

### Trong Docker container của bạn

Docker container chạy với file default `server.properties`:

```bash
# Inside container
grep process.roles config/server.properties
# Output: process.roles=broker,controller
```

→ 1 node làm cả 2 việc. Đủ cho dev.

Tham khảo các file khác:
```bash
grep process.roles config/broker.properties      # broker (chỉ broker)
grep process.roles config/controller.properties  # controller (chỉ controller)
```

## Leader & Follower — cơ chế replication

Khi tạo topic, controller chọn **owner** cho topic đó:

```text
Step 1: Controller pick 1 broker làm LEADER cho topic "order-events".
Step 2: Producer publish "OrderPlaced" → message đi đến LEADER broker.
Step 3: LEADER lưu trên disk + serve cho consumer khi consumer ask.
```

Vấn đề: nếu LEADER chết → data trên broker đó mất.

Solution: controller cũng assign **followers** (đi theo):

```text
+──────────+   "you are LEADER for order-events"
│ Broker 1 │ ◄────────────────────────────────── Controller
+──────────+
     │ replicate data to followers
     ▼
+──────────+ +──────────+
│ Broker 2 │ │ Broker 3 │  ← FOLLOWERS (backup)
│ FOLLOWER │ │ FOLLOWER │
+──────────+ +──────────+
```

Mỗi message Producer gửi:
1. Leader nhận → ghi vào disk.
2. Leader replicate (sao chép) sang Followers.
3. Followers acknowledge.

Khi Leader chết → Controller promote 1 Follower thành **new Leader**. Producer + Consumer **không bị gián đoạn**.

Đây là cơ chế **replication**. Chi tiết (replication factor, ISR — In-Sync Replicas, ack mode) sẽ học ở Phase 9 (Cluster Architecture Deep Dive).

### Topic được phân tán đều cluster

```text
Topic "order-events":    Broker1=Leader, Broker2=Follower, Broker3=Follower
Topic "payment-events":  Broker2=Leader, Broker1=Follower, Broker3=Follower
Topic "user-events":     Broker3=Leader, Broker1=Follower, Broker2=Follower
```

Mỗi broker đều có load — vừa làm leader cho topic này vừa làm follower cho topic khác. **Không có broker nào idle**.

## Bootstrap Server — single point of entry

Câu hỏi: cluster có 100 broker. Application muốn produce "order events" → làm sao biết phải gọi broker nào (broker chứa data của topic đó)?

**Không cần biết IP của 100 broker**. Chỉ cần biết **1 broker bất kỳ đang sống** trong cluster.

```text
Application Code:
  bootstrap.servers = broker-1.kafka.acme.com:9092

Kết nối → broker-1 trả về TOÀN BỘ cluster metadata:
  - "order-events" leader trên broker-7
  - "payment-events" leader trên broker-12
  - ... info của 100 broker

Kafka client (library trong app) cache metadata này, route request tiếp theo trực tiếp đến đúng broker.
```

**Bootstrap server = bất kỳ broker nào** trong cluster. **KHÔNG phải special role** như broker/controller — chỉ là tên gọi cho "broker đầu tiên client kết nối tới."

### Lo lắng: nếu bootstrap broker chết lúc kết nối thì sao?

Vấn đề có thật:
- Application khởi động, biết duy nhất `broker-1`.
- `broker-1` đang down.
- Application không kết nối được → fail.

Fix: cung cấp **list** of bootstrap servers:

```yaml
# application.properties
spring.kafka.bootstrap-servers: broker-1:9092,broker-2:9092,broker-3:9092
```

Kafka client sẽ thử lần lượt từng broker trong list. Success với broker đầu tiên alive. Sau khi connect → nhận full metadata, biết về 100 broker còn lại.

### Practical recommendation

- **Dev (1 broker)**: `localhost:9092`.
- **Production**: list **3+ bootstrap server** (các node khác nhau trong cluster, để tránh single-point-of-failure ở connection time).

## Recap mental model

```text
┌─ Cluster (1+ Node) ──────────────────────────────┐
│                                                   │
│  Mỗi Node = Broker, Controller, hoặc cả hai      │
│                                                   │
│  Controller (1 active tại 1 thời điểm)            │
│  — quản lý cluster:                               │
│    - assign leader/followers per topic            │
│    - react tới node failure                       │
│                                                   │
│  Brokers (nhiều) — store + serve data:            │
│    - Topic-A leader → handle Topic-A reads/writes │
│    - Topic-A follower → giữ replica (backup)      │
│                                                   │
│  Bootstrap Server = bất kỳ broker reachable nào   │
│    → client nhận full metadata → route đúng       │
│                                                   │
└───────────────────────────────────────────────────┘

         ▲                            │
         │ produce                    │ consume
         │                            ▼
    Producer App                Consumer App
```

## Tóm tắt bài 1

- **Event = message = record** — cùng 1 thứ, tên gọi khác nhau theo context.
- **Topic** = collection of events, giống RDBMS table. Không có hard limit số topic (phụ thuộc resource).
- **Producer** publish vào topic. **Consumer** read từ topic. 1 app có thể đóng cả 2 role.
- **Kafka cluster** = nhiều Kafka server cùng nhau, cho HA + scalability. Application không cần biết cluster có bao nhiêu node — code y hệt.
- 2 role: **Broker** (data plane) + **Controller** (control plane). Small cluster: 1 node làm cả 2. Large cluster: tách dedicated controller.
- **Controller** chỉ 1 active tại 1 thời điểm, có standby. Controller chết → re-elect tự động.
- **Leader broker** sở hữu topic, handle read/write. **Followers** = backup. Leader chết → follower được promote thành leader mới.
- **Bootstrap server** = bất kỳ 1 broker trong cluster. Client kết nối → nhận full cluster metadata. Production nên list 3+ broker để tránh SPOF ở init time.

**Bài kế tiếp** → [Bài 2: Tạo topic + producer + consumer bằng CLI](02-topics-cli-demo.md)

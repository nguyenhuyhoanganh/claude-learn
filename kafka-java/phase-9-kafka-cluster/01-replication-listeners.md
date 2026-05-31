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

| Loại | Giữa ai với ai | Mục đích |
|---|---|---|
| **Control plane** (mặt phẳng điều khiển) | Giữa các controller | Quản lý cluster, election |
| **Data plane** (mặt phẳng data) | Giữa các broker | Replication, sync data nội bộ |
| **External** | Application ↔ Broker | Producer publish, consumer poll |

3 loại traffic → 3 port khác nhau. Mỗi broker listen trên **nhiều địa chỉ đồng thời**.

### Cấu hình listener

```properties
listeners=CONTROLLER://kafka1:9093,INTERNAL://kafka1:9092,EXTERNAL://0.0.0.0:8081
controller.listener.names=CONTROLLER
inter.broker.listener.name=INTERNAL
```

Giải thích từng property:
- `listeners` = danh sách `LABEL://host:port`, phân cách bằng dấu phẩy. Broker mở mọi port này để lắng nghe.
- `controller.listener.names` = label nào dùng cho traffic controller.
- `inter.broker.listener.name` = label nào dùng cho data plane (broker-to-broker replication).

Label còn lại (`EXTERNAL`) Kafka tự suy ra là dành cho client traffic.

> **Lưu ý**: các label (`CONTROLLER`, `INTERNAL`, `EXTERNAL`) chỉ là **tên gọi tuỳ ý**. Kafka không hiểu "internal" có nghĩa gì cụ thể. Bạn label thành `FOO`, `BAR` vẫn chạy được. Đặt tên có ý nghĩa là best practice cho dễ đọc cấu hình.

### Vì sao cần nhiều port?

Để **phân chia network (network segmentation)**:
- **Controller traffic**: quan trọng, volume thấp, nhạy cảm — nên đi qua port riêng.
- **Inter-broker replication**: volume cao, chỉ trong internal subnet — không exposed ra ngoài.
- **External**: mở cho client kết nối, có thể cần encryption (TLS).

Tách port mang lại lợi ích:
- Chạy trên các network interface khác nhau (vd controller trên private subnet, external trên public).
- Áp dụng security khác nhau (controller plaintext nội bộ, external SASL_SSL).
- Firewall rule khác nhau cho từng loại traffic.

## Advertised listeners — broker khai báo cách reach mình

Vấn đề thực tế:
- Broker listen ở `0.0.0.0:8081` (mọi interface).
- Client kết nối → broker bảo "topic này thì gọi Broker X."
- Client cần biết **địa chỉ Broker X có thể connect được**.

`advertised.listeners` = broker **khai báo cho client biết cách reach mình** (tương ứng với từng label).

```properties
advertised.listeners=INTERNAL://kafka1:9092,EXTERNAL://localhost:8081
```

Theo từng label, broker chỉ ra địa chỉ tương ứng:
- Internal (broker khác trong cluster): reach qua `kafka1:9092` (tên service Docker).
- External (client app bên ngoài Docker network): reach qua `localhost:8081` (port đã port-map qua Docker).

### Hiểu theo "góc nhìn của người gọi"

`INTERNAL://kafka1:9092` — các Docker container khác trong cùng network reach broker này qua service name `kafka1`.

`EXTERNAL://localhost:8081` — máy host (đang chạy producer Spring Boot app) thấy Kafka qua port đã map ra `localhost:8081`.

Cả 2 đều **valid đồng thời**. Network plane mà client đang ở sẽ quyết định cái nào được dùng.

### Production thực tế

```properties
advertised.listeners=INTERNAL://10.0.1.5:9092,EXTERNAL://kafka1.acme.com:9092
```

- Internal: IP private cho traffic trong VPC.
- External: public DNS cho client gọi từ ngoài (cross-AZ, hybrid cloud).

## Security protocol theo từng listener

Mỗi listener có security riêng:

```properties
listener.security.protocol.map=CONTROLLER:PLAINTEXT,INTERNAL:PLAINTEXT,EXTERNAL:SASL_SSL
```

| Protocol | Authentication | Encryption |
|---|---|---|
| `PLAINTEXT` | Không | Không |
| `SSL` | Không | Có |
| `SASL_PLAINTEXT` | Username/password | Không |
| `SASL_SSL` | Username/password | Có |

Mix theo nhu cầu:
- Internal subnet trusted (nội bộ tin tưởng) → dùng `PLAINTEXT` để tránh overhead encryption.
- External public-facing → `SASL_SSL` bắt buộc (bảo mật mandatory).

Phase 16 sẽ đi sâu vào security.

## Cluster ID + node ID

Property cho mỗi broker:

```properties
node.id=1                        # unique cho mỗi broker (1, 2, 3, ...)
cluster.id=abc123...             # GIỐNG NHAU cho tất cả broker trong cluster
```

`cluster.id` được generate **một lần** lúc setup cluster:
```bash
./kafka-storage.sh random-uuid
# Output: abc123-XYZ-...
```

Dùng cùng UUID này cho **tất cả** broker trong cluster. Property này nói với broker "mày thuộc cluster này."

Nếu broker có `cluster.id` khác nhau → từ chối join cluster (Kafka coi đó là cluster khác).

## Controller quorum voters

```properties
controller.quorum.voters=1@kafka1:9093,2@kafka2:9093,3@kafka3:9093
```

Danh sách `nodeId@host:port` của **mọi node eligible làm controller**.

Mỗi broker biết về tất cả controller-eligible. Khi election xảy ra, các broker này bầu cử lẫn nhau để chọn ra controller active.

KRaft mode (Kafka 3.0+) đã thay thế ZooKeeper. Các controller tự duy trì metadata của cluster internally bằng Raft consensus protocol.

## Internal topic `__consumer_offsets` cũng cần replicate

Kafka tracks offset của các consumer group trong internal topic `__consumer_offsets`.

Replication factor mặc định:
```properties
offsets.topic.replication.factor=1
```

Production nên **set = số broker hoặc 3**:
```properties
offsets.topic.replication.factor=3
```

Vì sao quan trọng? Nếu chỉ 1 copy và broker chứa copy đó chết → **mất tracking consumer offset** → khi rebalance consumer bị confused (không biết đã consume tới đâu) → có thể replay hoặc skip message. **Luôn replicate** topic này.

Tương tự với `transaction.state.log.replication.factor` (Phase 14 sẽ học về transactions).

## Auto-create topics

Default dev:
```properties
auto.create.topics.enable=true
```

Producer/consumer gọi vào topic chưa tồn tại → broker tự tạo topic với default (1 partition, replication factor = 1).

Production phải set:
```properties
auto.create.topics.enable=false
```

Lý do:
- Typo trong tên topic → broker silently tạo topic mới với tên sai. Producer publish vào đó mà consumer không thấy gì → bug khó debug.
- Topic auto-create dùng default RF=1, không safe cho production.
- Tạo topic phải là **infra operation explicit** (qua Terraform, CLI, hoặc admin tool).

## Bảng tổng kết các broker property

| Property | Common giữa các broker? | Note |
|---|---|---|
| `node.id` | Khác nhau | 1, 2, 3, ... mỗi broker 1 ID unique |
| `cluster.id` | Giống nhau | Generate 1 lần, share cho cả cluster |
| `process.roles` | Giống nhau | `broker,controller` cho small cluster |
| `listeners` | Có thể khác (port khác) | Mỗi broker mở port riêng |
| `advertised.listeners` | Khác | Phản ánh địa chỉ reachable của từng broker |
| `controller.quorum.voters` | Giống nhau | List tất cả controller trong cluster |
| `listener.security.protocol.map` | Giống nhau | Security theo label |
| `controller.listener.names` | Giống nhau | Label nào = controller |
| `inter.broker.listener.name` | Giống nhau | Label nào = data plane |
| `auto.create.topics.enable` | Giống nhau | Set false ở production |
| `offsets.topic.replication.factor` | Giống nhau | Bằng số broker hoặc 3 |

## Tóm tắt bài 1

- 3 trục cốt lõi:
  - **Số broker** → quyết định **capacity** (CPU, RAM, disk tổng cộng).
  - **Số partition** → quyết định **scalability** (parallel processing cho 1 topic).
  - **Replication factor** → quyết định **availability** (chịu được bao nhiêu broker chết).
- Replication factor = N → mỗi partition có N copy → chịu được N-1 broker fail đồng thời.
- Production chuẩn: **3 broker, RF=3, min.insync.replicas=2**.
- **Listeners**: mỗi broker có nhiều port/label cho các loại traffic:
  - CONTROLLER (control plane).
  - INTERNAL (data plane, inter-broker replication).
  - EXTERNAL (client).
- `advertised.listeners` = broker khai báo **cách client reach mình** theo từng label.
- Security có thể khác nhau giữa các listener (vd PLAINTEXT internal, SASL_SSL external).
- `cluster.id` share trong toàn cluster. `node.id` unique cho mỗi broker.
- `controller.quorum.voters` = list của tất cả controller-eligible node.
- Production: `auto.create.topics.enable=false`, `offsets.topic.replication.factor=3`.

**Bài kế tiếp** → [Bài 2: Multi-Node Cluster Docker Compose Setup](02-docker-compose-cluster.md)

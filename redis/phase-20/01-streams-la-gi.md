# Bài 1: Streams là gì — event-driven messaging trong Redis

Đến **Streams** — kiểu dữ liệu **cuối cùng** trong khoá này. Là kiểu phức tạp nhất + powerful nhất. Streams kết hợp tính chất của Log file + Sorted Set + Pub/Sub, giải bài toán **event-driven messaging** và **microservices communication**.

## Tại sao streams?

App RB hiện có:
- List làm queue (BLPOP/RPUSH).
- Pub/Sub cho real-time notification.
- Counter cho metric.

Hạn chế:
- **List queue**: mất message khi consumer crash giữa BLPOP và xử lý xong.
- **Pub/Sub**: subscriber offline → tin nhắn mất.
- **Counter**: không lưu history events.

Cần data structure:
- **Persistent**: lưu mọi event, replay được.
- **Multi-consumer**: nhiều worker đọc cùng stream với load balancing.
- **Ack mechanism**: confirm message đã xử lý.
- **Replay**: đọc từ thời điểm X trở đi.

→ **Streams** giải tất cả. Inspired bởi Kafka, RabbitMQ, AWS Kinesis.

## Streams là gì?

> **Stream** = append-only log của entries. Mỗi entry có **ID** (auto-generated, monotonic) và **field-value pairs** (như mini-hash).

```text
event:user-actions
   ID                       Fields
   1736935200000-0   {action:"signup", userId:"u1"}
   1736935210000-0   {action:"view",   userId:"u2", itemId:"i5"}
   1736935210000-1   {action:"like",   userId:"u3", itemId:"i7"}
   1736935220000-0   {action:"bid",    userId:"u1", itemId:"i5", amount:"100"}
```

Tương tự:
- **List**: ordered, persistent. **Khác**: stream có ID + field-value, không phải string.
- **Sorted Set**: ID monotonic increasing như score. **Khác**: stream có structured fields.
- **Kafka topic**: gần nhất conceptually. Persistent log.

## Anatomy của 1 entry

```text
Stream Entry:
  ID:       <timestamp-ms>-<sequence>
  Fields:   field1, value1, field2, value2, ...
```

ID auto-generate: `1736935200000-0`:
- Phần trước `-`: Unix timestamp ms.
- Phần sau: sequence (cho entries cùng ms).

→ Mỗi entry có ID unique, ordered.

Tự supply ID:
```text
XADD events:user 12345-0 action signup
```

→ Thường để auto. `*` cho default.

## Lệnh chính

Bắt đầu bằng `X`:

```text
XADD       Add entry
XREAD      Read entries (blocking option)
XRANGE     Read by ID range
XLEN       Stream length
XDEL       Delete entry (rare)
XTRIM      Trim stream length
XGROUP     Consumer group management
XREADGROUP Read trong consumer group
XACK       Acknowledge message processed
XCLAIM     Claim message từ idle consumer
XINFO      Stream/group info
XPENDING   View pending messages
```

15+ lệnh. Học dần qua phase này.

## Use case kinh điển

### 1. Event log
```ts
await client.xAdd('events:user-actions', '*', {
  action: 'page_view',
  userId: req.user.id,
  url: req.url,
  timestamp: String(Date.now()),
});
```

→ Mọi action user được log. Replay được.

### 2. Activity feed
```ts
await client.xAdd(`feed:user#${followerId}`, '*', {
  type: 'new_post',
  authorId: postAuthor,
  postId,
});
```

→ Follower's feed = stream entries. UI lazy load.

### 3. Job queue (replacement cho List)
```ts
// Producer
await client.xAdd('jobs:email', '*', {
  type: 'send_welcome',
  userId,
  template: 'welcome.html',
});

// Worker với consumer group
await client.xReadGroup('email-workers', 'worker-1', { ... });
```

→ Reliable queue với ack + retry.

### 4. Microservices messaging
```ts
// Service A: order-service
await client.xAdd('events:orders', '*', {
  type: 'OrderCreated',
  orderId,
  userId,
  amount,
});

// Service B: email-service (consumer)
const messages = await client.xReadGroup('emails', 'worker-1', {
  key: 'events:orders',
  id: '>',
});
// Process: send confirmation email
```

→ Event-driven architecture. Service loosely coupled.

### 5. Audit log
Mọi mutation → write to stream với user, timestamp, before/after.

```ts
await client.xAdd('audit:items', '*', {
  action: 'update',
  itemId,
  userId,
  before: JSON.stringify(old),
  after: JSON.stringify(new),
});
```

Replay → reproduce state. Compliance.

## So với Pub/Sub

| | Pub/Sub | Streams |
|---|---|---|
| Persistence | KHÔNG | CÓ |
| Replay | KHÔNG | CÓ (XRANGE) |
| Ack | KHÔNG | CÓ (XACK) |
| Consumer group | KHÔNG | CÓ |
| Offline subscriber | mất message | nhận khi online |
| Throughput | Cao | Cao |
| Complexity | Đơn giản | Phức tạp |

→ Streams là **Pub/Sub++**. Đa số use case nên dùng Streams trừ khi cần đơn giản tuyệt đối.

## So với List queue

| | List Queue (LPUSH/BLPOP) | Streams |
|---|---|---|
| Ordering | FIFO | FIFO theo ID |
| Persistent | CÓ | CÓ |
| Multiple consumers | Round-robin (BLPOP) | Consumer Groups |
| Ack | KHÔNG | CÓ |
| Retry on failure | Manual | Pending Entries List |
| Message lost on worker crash | CÓ | KHÔNG (nếu chưa XACK) |
| Replay | KHÔNG | CÓ |

→ Streams **superior cho production queue**. List queue cho prototype/simple use.

## So với Kafka

| | Kafka | Streams |
|---|---|---|
| Architecture | Distributed broker cluster | Redis instance |
| Persistence | Disk-only | Memory + disk (RDB/AOF) |
| Throughput | 1M+ msg/s | 100k-1M msg/s |
| Ordering | Per partition | Per stream key |
| Retention | Configurable (days, GB) | Manual XTRIM |
| Replay | CÓ (offsets) | CÓ (IDs) |
| Operational | Heavy (ZooKeeper, brokers) | Light (Redis ops) |

→ Kafka cho big data scale. Streams cho small-medium app + reuse Redis infra.

## Streams cấu trúc nội bộ

Radix tree of "macro nodes". Mỗi node lưu nhiều entries compressed.

- **Append**: O(1).
- **Read by ID**: O(log N).
- **Range query**: O(log N + K).
- **Memory efficient**: compression.

Memory ~50-100 byte/entry. 1M entries ~50-100 MB.

## Streams workflow basic

### Producer
```ts
const id = await client.xAdd('events', '*', { type: 'login', userId: '42' });
// id = "1736935200000-0"
```

### Consumer
```ts
// Read entries từ start
const result = await client.xRead({
  key: 'events',
  id: '0',     // từ đầu
});

// Read new entries (block 5s)
const result = await client.xRead({
  key: 'events',
  id: '$',     // chỉ entries mới
  BLOCK: 5000,
});
```

### Consumer Group
```ts
// Setup
await client.xGroupCreate('events', 'email-workers', '$');

// Worker
const messages = await client.xReadGroup('email-workers', 'worker-1', {
  key: 'events',
  id: '>',
});

// Process & ack
for (const msg of messages) {
  await processMsg(msg);
  await client.xAck('events', 'email-workers', msg.id);
}
```

## Tóm tắt bài 1

- Streams = append-only log với entries có ID + fields.
- Use case: event log, activity feed, reliable queue, microservices messaging, audit.
- So với Pub/Sub: persistent, replayable, ack support.
- So với List: support consumer group, no lost messages.
- So với Kafka: lighter weight, reuse Redis infra.
- Tiền đề cho phase này: 15+ lệnh, complex but powerful.

**Bài kế tiếp** → [Bài 2: XADD, XREAD — basic ops](02-xadd-xread.md)

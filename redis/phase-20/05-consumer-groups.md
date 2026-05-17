# Bài 5: Consumer Groups overview

**Consumer Group** = feature mạnh nhất của Streams. Cho phép multiple workers share work atomically với ack + retry built-in. Bài này dạy concepts + setup.

## Consumer Group là gì?

> **Consumer Group** = một group of consumers cùng đọc 1 stream, mỗi message **chỉ delivered tới 1 consumer trong group**. Group track which messages đã ack.

```text
Stream: events:orders
   │
   ▼
Consumer Group: order-processors
   ├─ consumer-1 (worker process A)
   ├─ consumer-2 (worker process B)
   └─ consumer-3 (worker process C)
```

Producer add 100 entries. Distribution:
- consumer-1 nhận ~33.
- consumer-2 nhận ~33.
- consumer-3 nhận ~33.

→ Load balanced. Tự động.

## Multiple groups, multiple readers

```text
Stream: events:orders
   │
   ▼
   ├─ Group: order-processors    (workers handle order logic)
   │  ├─ consumer-1
   │  └─ consumer-2
   │
   ├─ Group: email-senders        (workers send confirmation)
   │  ├─ consumer-1
   │  └─ consumer-2
   │
   └─ Group: analytics            (workers aggregate)
      └─ consumer-1
```

Mỗi group **độc lập**, nhận **tất cả entries** (broadcast giữa groups). Trong group, load balance giữa consumers.

→ Fan-out giữa groups + load balance trong group. Pattern phổ biến cho microservices.

## Setup commands

### Create group

```text
XGROUP CREATE events:orders order-processors $
```

- `events:orders`: stream key.
- `order-processors`: group name.
- `$`: start ID. `$` = từ entries mới sau lệnh này. `0` = từ start.

`XGROUP CREATE` fail nếu stream không tồn tại. Use `MKSTREAM` để auto-create:

```text
XGROUP CREATE events:orders order-processors $ MKSTREAM
```

### Delete group

```text
XGROUP DESTROY events:orders order-processors
```

## Reading from group

```text
XREADGROUP GROUP <group_name> <consumer_name> [BLOCK ms] [COUNT n] STREAMS <key> <id>
```

```text
XREADGROUP GROUP order-processors worker-1 BLOCK 0 COUNT 10 STREAMS events:orders >
```

- `>`: special ID = "new entries not delivered to any consumer in this group yet".
- `worker-1`: consumer name within group. **Stable per process** (don't randomize).

Each call: Redis assigns entries to worker-1 (if any new). Group tracks "delivered to worker-1".

## Consumer name = process identity

Convention: consumer name = process ID hoặc hostname.

```ts
const consumerName = `worker-${process.env.HOSTNAME ?? process.pid}`;
```

→ Khi worker restart, dùng same name → resume pending messages.

## Acknowledge

After successfully process, **must XACK**:

```text
XACK events:orders order-processors 1736935200000-0
```

→ Mark entry as processed in this group. Removed from Pending Entries List (PEL).

Without XACK: entry stays in PEL → reclaimable.

```ts
const messages = await client.xReadGroup('order-processors', 'worker-1', {
  key: 'events:orders',
  id: '>',
});

for (const msg of messages[0].messages) {
  try {
    await processOrder(msg.message);
    await client.xAck('events:orders', 'order-processors', msg.id);
  } catch (err) {
    // Don't ack — message remains in PEL, can retry
  }
}
```

## Pending Entries List (PEL)

Mỗi group có PEL = list of entries đã delivered to consumer nhưng chưa XACK.

Inspect:
```text
XPENDING events:orders order-processors

1) (integer) 5                # total pending
2) "1736935200000-0"          # earliest pending ID
3) "1736935210000-0"          # latest pending ID
4) 1) 1) "worker-1"           # pending per consumer
      2) "3"
   2) 1) "worker-2"
      2) "2"
```

Plus detailed:
```text
XPENDING events:orders order-processors - + 10

1) 1) "1736935200000-0"      # ID
   2) "worker-1"              # consumer
   3) (integer) 23456         # idle time (ms since delivery)
   4) (integer) 1             # delivery count
2) ...
```

→ Useful debug: entries stuck (high idle time), retry counts (high delivery count = repeated failure).

## XACK on success only

```ts
try {
  await processMsg(msg);
  await client.xAck(stream, group, msg.id);    // ✓ remove from PEL
} catch (err) {
  // Don't ack — stays in PEL
  // After timeout, another consumer can claim
}
```

If always ack: lose retry semantic.  
If never ack: PEL grows infinitely.  
**Ack on success only**. Failure → leave in PEL → reclaim later.

## XCLAIM — reclaim idle messages

Worker crash → entries pending in worker's PEL never ack'd.

Other worker reclaim:
```text
XCLAIM events:orders order-processors worker-2 60000 1736935200000-0
```

- `60000`: minimum idle time (ms). Only claim if idle > 60s.
- `worker-2`: new owner.
- ID: entry to claim.

After XCLAIM: entry now belongs to worker-2. worker-2 retry processing.

### XAUTOCLAIM (Redis 6.2+)

```text
XAUTOCLAIM events:orders order-processors worker-2 60000 0
```

Auto find idle messages, claim batch. Easier than manual XCLAIM.

```ts
async function reclaimIdleMessages() {
  const result = await client.xAutoClaim(
    'events:orders',
    'order-processors',
    'worker-2',
    60000,    // min idle ms
    '0'       // start ID
  );
  
  for (const msg of result.messages) {
    try {
      await processMsg(msg);
      await client.xAck('events:orders', 'order-processors', msg.id);
    } catch (err) {
      // Increment delivery count, leave in PEL
    }
  }
}

// Run periodically
setInterval(reclaimIdleMessages, 60000);
```

→ Background recovery. Crash-resistant.

## Workflow đầy đủ

```ts
const STREAM = 'events:orders';
const GROUP = 'order-processors';
const CONSUMER = `worker-${process.env.HOSTNAME}`;

// 1. Setup (one time)
async function setup() {
  try {
    await client.xGroupCreate(STREAM, GROUP, '$', { MKSTREAM: true });
  } catch (err) {
    if (!err.message.includes('BUSYGROUP')) throw err;
    // Group already exists, OK
  }
}

// 2. Main worker loop
async function workerLoop() {
  while (true) {
    // First, process any pending messages from previous runs
    await processPending();
    
    // Then read new
    const result = await client.xReadGroup(GROUP, CONSUMER, {
      key: STREAM,
      id: '>',
    }, { BLOCK: 5000, COUNT: 10 });
    
    if (!result) continue;
    
    for (const msg of result[0].messages) {
      try {
        await processOrder(msg.message);
        await client.xAck(STREAM, GROUP, msg.id);
      } catch (err) {
        console.error('Failed:', err);
        // Leave in PEL for reclaim
      }
    }
  }
}

// 3. Process pending (on startup recovery)
async function processPending() {
  const pending = await client.xReadGroup(GROUP, CONSUMER, {
    key: STREAM,
    id: '0',     // start of my PEL
  });
  
  if (!pending) return;
  
  for (const msg of pending[0].messages) {
    try {
      await processOrder(msg.message);
      await client.xAck(STREAM, GROUP, msg.id);
    } catch (err) {
      // Still failing, leave
    }
  }
}

// 4. Reclaim from dead consumers (run periodically)
async function reclaim() {
  const result = await client.xAutoClaim(STREAM, GROUP, CONSUMER, 60000, '0');
  // Process claimed...
}

setup();
workerLoop();
setInterval(reclaim, 60000);
```

**Complete reliable consumer**. Crash-safe, retry-safe, load-balanced.

## So với Kafka

Consumer Group concept inspired by Kafka. Similar:
- Multiple consumers share work.
- Each message processed once per group.
- Manual offset commit (XACK ~ commit offset).
- Reassign on failure.

Differences:
- Kafka per-partition ordering. Streams per-stream key.
- Kafka log compaction. Streams XTRIM manual.
- Kafka stronger durability guarantees. Streams Redis-level.

For app < Kafka-scale, Streams thắng simplicity + reuse Redis.

## Tóm tắt bài 5

- Consumer Group = N workers share work on 1 stream, load balanced.
- Multiple groups = fan-out independent.
- `XGROUP CREATE` setup. `XREADGROUP > consumer` read new. `XACK` confirm.
- PEL tracks unacked messages.
- `XCLAIM`/`XAUTOCLAIM` reclaim idle messages từ dead consumers.
- Reliable: crash-safe, retry, exactly-once với careful design.

**Bài kế tiếp** → [Bài 6: Consumer Group thực chiến — code patterns](06-consumer-groups-implementation.md)

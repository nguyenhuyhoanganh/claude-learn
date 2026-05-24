# Bài 4: Issues với standard streams — vì sao cần Consumer Groups

Streams "vanilla" (chỉ XADD/XREAD) có 3 vấn đề lớn khi production. Bài này identify từng vấn đề, set up motivation cho **Consumer Group** (bài 5).

## Vấn đề 1: Multiple consumers nhận duplicate

Có 3 worker đọc same stream:

```ts
// Worker A
xRead({ key: 'jobs', id: '$' }, { BLOCK: 0 });

// Worker B (cùng code)
xRead({ key: 'jobs', id: '$' }, { BLOCK: 0 });

// Worker C
xRead({ key: 'jobs', id: '$' }, { BLOCK: 0 });
```

Producer add 1 entry:
```text
XADD jobs * task send_email
```

Result:
- **All 3 workers receive same entry**.
- All 3 process → duplicate email sent 3 lần.

→ "Broadcast" mode. **Không có load balancing**.

App muốn:
- Có 1 worker nhận entry (load balance).
- Hoặc workers process subset chia rõ ràng.

XREAD chỉ broadcast. Không support.

## Vấn đề 2: Worker crash → lost messages

```ts
const result = await client.xRead({ key: 'jobs', id: lastId });
const msg = result[0].messages[0];

// Crash here

await processMsg(msg);
await persistCheckpoint(msg.id);
```

Worker crash giữa read và persistCheckpoint:
- Restart: lastId chưa update → re-read entry → process **lại** từ đầu.

Hoặc:
```ts
const result = await client.xRead(...);
const msg = result[0].messages[0];
await persistCheckpoint(msg.id);   // commit before process

// Crash here

await processMsg(msg);     // không chạy
```

→ Message **lost**, không process.

Either way: **at-most-once** hoặc **at-least-once**. Không có **exactly-once** native.

## Vấn đề 3: Không có retry

Nếu processMsg throw error (vd Stripe API down):

```ts
try {
  await processMsg(msg);
  await persistCheckpoint(msg.id);
} catch (err) {
  console.error('Failed:', err);
  // Không retry
}
```

Message lost. Manual retry queue cần code.

## Vấn đề 4: No coordination between workers

3 worker reading stream. Mỗi worker maintain own checkpoint. Không biết worker khác đã process gì.

Scenario: worker A xử lý slow, B xử lý fast. B đã process entry X. A vẫn chưa biết, vẫn process X → double work.

→ Cần **shared state** between workers về "đã process gì".

## Pattern attempts để fix với plain XREAD

### Attempt 1: Distributed lock per message

```ts
const result = await client.xRead(...);
for (const msg of result[0].messages) {
  const lock = await acquireLock(`msg:${msg.id}`, 30);
  if (!lock) continue;     // someone else processing
  
  try {
    await processMsg(msg);
  } finally {
    await releaseLock(`msg:${msg.id}`, lock);
  }
}
```

→ 2 worker race trên lock. Loser skip.

Vấn đề:
- Lock overhead per message.
- Lock TTL phải > processing time. Crash → wait.
- Sau thành công, lock vẫn TTL → wasted.

Acceptable nhưng hacky.

### Attempt 2: Partition by hash

Worker A handle entries có `hash(id) % 3 == 0`. B for 1. C for 2.

```ts
for (const msg of messages) {
  const hash = simpleHash(msg.id);
  if (hash % 3 !== WORKER_INDEX) continue;
  await processMsg(msg);
}
```

→ Mỗi worker handle 1/3 entries.

Vấn đề:
- 3 workers cùng read all → bandwidth wasted.
- 1 worker crash → entries của partition đó bị stuck.
- Resize cluster (add/remove worker) → repartition logic.

Complex.

### Attempt 3: Single consumer + queue work

1 dispatcher consumer read all, push job vào List queue. Worker pool LPOP từ List.

```ts
// Dispatcher
const result = await client.xRead({ key: 'events', id: '$' });
for (const msg of result[0].messages) {
  await client.lPush('worker-queue', msg.id);
}

// Worker
const id = await client.brPop('worker-queue');
await processMsg(id);
```

→ Hoạt động, but adds latency + complexity. Lose Stream benefits (XRANGE, replay).

## Tóm tắt: standard Stream không đủ

Multi-consumer scenarios cần:
1. **Auto load balancing** (không broadcast).
2. **Persistent acknowledgment** (track "đã process gì").
3. **Auto-retry on failure** (Pending Entries List).
4. **Reclaiming idle messages** (worker crash → reassign).

→ **Consumer Groups** built-in support tất cả. Bài 5-6.

## Consumer Group — preview

```ts
// Setup once
await client.xGroupCreate('events', 'email-workers', '$');

// 3 workers:
// Worker 1
const r1 = await client.xReadGroup('email-workers', 'worker-1', 
  { key: 'events', id: '>' });

// Worker 2 (different worker name)
const r2 = await client.xReadGroup('email-workers', 'worker-2',
  { key: 'events', id: '>' });

// 1 entry from producer → ONE of workers gets it (load balanced)
```

Plus:
- XACK cho confirm.
- XPENDING list pending.
- XCLAIM reclaim idle.

→ Production-grade messaging.

## Why XREAD vẫn useful?

XREAD/XRANGE vẫn quan trọng cho:
- **Single consumer**: simple worker, không cần load balancing.
- **Analytics replay**: scan history with XRANGE.
- **Logging/audit**: append + historical replay.
- **Multiple independent consumers**: vd 3 analytics services, mỗi cái độc lập đọc same stream.

→ XREAD + XRANGE: foundation. Consumer Group: advanced layer.

## Pattern: independent consumers (fan-out)

Use case: 3 services độc lập consume same stream cho different purposes.

```ts
// Analytics service
await client.xRead({ key: 'events', id: lastId_analytics });

// Audit service  
await client.xRead({ key: 'events', id: lastId_audit });

// Notification service
await client.xRead({ key: 'events', id: lastId_notif });
```

Mỗi service maintain own checkpoint. Tất cả nhận same entries (broadcast).

→ Fan-out pattern. Works với XREAD vanilla. Mỗi service như 1 standalone subscriber.

## Pattern: load-balanced workers

Use case: 3 workers cùng job (gửi email), chia work.

→ **Cần Consumer Group**. Bài 5-6.

## Decision: XREAD vs Consumer Group

| Scenario | Approach |
|---|---|
| 1 consumer | XREAD |
| Multiple independent subscribers (different purposes) | XREAD per subscriber |
| Multiple workers same job, load balance | **Consumer Group** |
| Need ack + retry | **Consumer Group** |
| Replay history | XRANGE |
| Analytics scan | XRANGE |

## Common patterns trong real app

### Audit log
```ts
// Producer in every mutation
await client.xAdd('audit:items', '*', { action, userId, ... });

// Analytics consumer with XREAD (single, independent)
xRead({ key: 'audit:items', id: lastId });
```

### Event-driven order processing
```ts
// Producer
await client.xAdd('events:orders', '*', { type: 'OrderCreated', ... });

// Email service (Consumer Group, multiple workers)
xReadGroup('email-workers', 'worker-1', { key: 'events:orders', id: '>' });

// Inventory service (Consumer Group, multiple workers)
xReadGroup('inventory-workers', 'worker-1', { key: 'events:orders', id: '>' });
```

→ 2 services, mỗi service Consumer Group riêng. Workers trong cùng group share work.

## Tóm tắt bài 4

- Standard XREAD broadcast → không load balance.
- Manual checkpoint → at-most-once hoặc at-least-once, không có exactly-once.
- No native retry on crash.
- Hacky workarounds (lock per msg, partition by hash, dispatcher pattern) complex.
- **Consumer Groups** giải tất cả → bài 5-6.
- XREAD vẫn dùng cho single consumer + fan-out independent subscribers.

**Bài kế tiếp** → [Bài 5: Consumer Groups overview](05-consumer-groups.md)

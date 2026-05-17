# Bài 3: XRANGE + replay history

`XREAD` cho consume real-time. **XRANGE** cho **replay history** — đọc entries trong khoảng ID/time. Use case: audit, debug, analytics, recover from crash.

## XRANGE cú pháp

```text
XRANGE key start end [COUNT count]
```

`start`, `end` là ID hoặc:
- `-`: minimum (start of stream).
- `+`: maximum (end of stream).

## Examples

### Read all

```text
XRANGE events - +
```

Tất cả entries từ đầu đến cuối.

### Read latest N

```text
XRANGE events - + COUNT 10
```

10 entries đầu (oldest first).

### Read by time range

ID = timestamp ms, dùng làm filter:

```text
XRANGE events 1736935200000 1736935210000
```

→ Entries trong khoảng 10 giây. **Time-based filter free** (no extra index needed).

### Read by partial timestamp

```text
XRANGE events 1736935200000-0 1736935200000-99999
```

Tất cả entries trong cùng millisecond.

### Read newer first — XREVRANGE

```text
XREVRANGE events + - COUNT 10
```

`XREVRANGE` reverses: newest first. Note: argument order reversed (`+ -` thay `- +`).

Use case: "show recent activities" UI.

## Result format

```text
XRANGE events - + COUNT 2
1) 1) "1736935200000-0"
   2) 1) "action"
      2) "signup"
      3) "userId"
      4) "42"
2) 1) "1736935210000-0"
   2) 1) "action"
      2) "view"
      ...
```

Array of [ID, fields]. Client lib parse:
```ts
[
  { id: '1736935200000-0', message: { action: 'signup', userId: '42' } },
  { id: '1736935210000-0', message: { action: 'view', ... } },
]
```

## Use case 1: Activity feed pagination

```ts
async function getRecentActivities(userId: string, beforeId = '+') {
  const result = await client.xRevRange(`feed:user#${userId}`, beforeId, '-', {
    COUNT: 20,
  });
  return result;
}

// First page
const page1 = await getRecentActivities(userId);
// Pass last id of page1 to get next:
const lastId = page1[page1.length - 1].id;
const page2 = await getRecentActivities(userId, lastId);
```

Cursor-based pagination. Stable kể cả khi có entries mới.

## Use case 2: Time-window aggregation

```ts
async function countActionsInLastHour() {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const entries = await client.xRange('events', oneHourAgo, '+');
  
  const byAction = new Map<string, number>();
  for (const e of entries) {
    const action = e.message.action;
    byAction.set(action, (byAction.get(action) ?? 0) + 1);
  }
  return byAction;
}
```

Hourly aggregate. No need separate counters per hour.

## Use case 3: Audit replay

```ts
async function getItemHistory(itemId: string) {
  const allItems = await client.xRange('audit:items', '-', '+');
  return allItems.filter((e) => e.message.itemId === itemId);
}
```

Linear scan — slow nếu audit stream lớn. Better: separate stream per item:

```ts
await client.xAdd(`audit:item#${itemId}`, '*', { action, userId, ... });

// Replay:
const history = await client.xRange(`audit:item#${itemId}`, '-', '+');
```

## Use case 4: Replay từ checkpoint

Worker restart sau crash. Cần resume từ last processed:

```ts
async function consumeFromCheckpoint() {
  let lastId = await client.get('checkpoint:worker-1') ?? '0';
  
  while (true) {
    // Read history first
    const history = await client.xRange('events', lastId, '+', { COUNT: 100 });
    
    if (history.length === 0) {
      // Switch to live read
      const live = await client.xRead({ key: 'events', id: lastId }, { BLOCK: 0 });
      // Process live...
      continue;
    }
    
    for (const e of history) {
      await processEvent(e);
      lastId = e.id;
      await client.set('checkpoint:worker-1', lastId);
    }
  }
}
```

Hybrid replay + live. Complex but reliable.

→ Lý tưởng: dùng Consumer Group (bài 5-6) thay vì manual.

## Special IDs

- `-`: minimum (= "0-0").
- `+`: maximum.
- `0`: same as `-` trong XREAD/XRANGE context.
- `$`: last entry now (chỉ XREAD).
- `>`: chỉ XREADGROUP — new entries chưa được consumer group consume.

## Edge case: empty stream

```text
XRANGE empty_stream - +
(empty array)
```

Không error. Return empty.

## Memory consideration

XRANGE materialize all entries in memory trước khi return. Stream 1M entries với 5 fields ≈ 150 MB reply.

Best practice: **always use COUNT** để limit:
```text
XRANGE events - + COUNT 1000
```

Pagination thay vì full scan.

## Combine XRANGE + Pipeline

```ts
const ids = ['1736935200000-0', '1736935210000-0'];
const promises = ids.map((id) => client.xRange('events', id, id));
const results = await Promise.all(promises);
```

→ Fetch specific entries by ID. Hữu ích khi đã có list IDs.

## XINFO — stream info

```text
XINFO STREAM events
1) "length"
2) (integer) 1247
3) "radix-tree-keys"
4) (integer) 5
5) "radix-tree-nodes"
6) (integer) 12
7) "groups"
8) (integer) 2
9) "last-generated-id"
10) "1736935200000-5"
11) "first-entry"
12) ...
13) "last-entry"
14) ...
```

Length, num groups, last ID, first/last entry. Hữu ích monitoring.

## XRANGE vs XREAD vs XREADGROUP

| | XRANGE | XREAD | XREADGROUP |
|---|---|---|---|
| Use case | Historical, ad-hoc | Real-time consume | Consumer group |
| Block | KHÔNG | CÓ option | CÓ option |
| Track position | Manual | Pass last ID | Auto (per group) |
| Ack | KHÔNG | KHÔNG | CÓ (XACK) |
| Use case | UI history, replay | Single consumer | Multi consumer with load balancing |

## Tóm tắt bài 3

- `XRANGE key start end` đọc historical entries by ID range.
- `-` / `+` cho min/max. ID = timestamp ms cho time filter free.
- `XREVRANGE` cho newest first.
- Use case: activity feed, audit replay, aggregation, checkpoint recovery.
- Luôn dùng `COUNT` cho big streams.

**Bài kế tiếp** → [Bài 4: Issues với standard streams](04-streams-issues.md)

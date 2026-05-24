# Bài 2: XADD, XREAD — basic ops

2 lệnh cơ bản nhất với Stream: add và read. Bài này đi sâu vào cú pháp, ID format, blocking read, edge cases.

## XADD — thêm entry

```text
XADD key [NOMKSTREAM] [MAXLEN | MINID [= | ~] threshold] <* | ID> field value [field value ...]
```

Cú pháp đơn giản nhất:
```text
XADD events:user * action signup userId 42
"1736935200000-0"            ← auto-generated ID
```

- `*` = auto ID (timestamp + sequence).
- Returns ID của entry vừa thêm.

## ID format

```text
<milliseconds>-<sequence>
```

- `milliseconds`: Unix timestamp ms khi entry tạo.
- `sequence`: counter cho entries cùng ms (0, 1, 2, ...).

Examples:
- `1736935200000-0`: entry đầu tại 1736935200000.
- `1736935200000-1`: entry thứ 2 cùng ms.
- `1736935200001-0`: entry tiếp ms sau.

**Monotonic**: ID luôn tăng. ID nhỏ hơn refused:
```text
XADD events 1000-0 ...
XADD events 999-0 ...
(error) ERR The ID specified in XADD is equal or smaller than the target stream top item
```

## Multi-field

```text
XADD events * action like userId 42 itemId 7 timestamp 1736935200000
```

Như HSET, nhiều field-value pairs. Đây là điểm khác List (List chỉ có 1 value).

## MAXLEN — auto trim

Cap stream length tự động:

```text
XADD events MAXLEN 1000 * action ...
```

→ Sau thêm, nếu stream > 1000 entries, xoá cũ nhất.

`MAXLEN ~`:
```text
XADD events MAXLEN ~ 1000 * action ...
```

`~` (approximate): trim không exact (vì internal node alignment). Faster.

Default exact `MAXLEN 1000`. Production thường dùng `~` cho performance.

## MINID — keep entries newer than ID

```text
XADD events MINID 1736935200000 * action ...
```

Xoá mọi entry có ID < 1736935200000. Giữ recent.

## NOMKSTREAM — không tạo stream nếu chưa có

```text
XADD events NOMKSTREAM * action ...
```

Default: stream tự tạo. `NOMKSTREAM` = chỉ append nếu stream đã tồn tại. Hiếm dùng.

## XLEN — đếm entries

```text
XLEN events
(integer) 47
```

O(1). Cached.

## XREAD — đọc entries

Đọc với 3 mode:

### Read from start

```text
XREAD STREAMS events 0
```

→ Đọc tất cả entries từ ID `0` trở đi. Tương đương "read all".

### Read entries newer than ID

```text
XREAD STREAMS events 1736935200000-0
```

→ Entries với ID > 1736935200000-0.

### Read only new entries

```text
XREAD STREAMS events $
```

`$` = "last entry now". Đọc entries chưa có. Nếu không có, returns nil (no entries).

→ Cho stream consumer: "tôi đã thấy hết. Đợi entries mới".

## BLOCK option

```text
XREAD BLOCK 5000 STREAMS events $
```

`BLOCK <ms>`: chờ tối đa N ms cho entries mới.

- `BLOCK 0`: chờ vô hạn.
- `BLOCK 5000`: chờ 5s, nil nếu không có gì mới.

Pattern long polling cho real-time:
```ts
async function consumeForever() {
  let lastId = '$';     // start fresh
  while (true) {
    const result = await client.xRead(
      { key: 'events', id: lastId },
      { BLOCK: 0, COUNT: 100 }
    );
    if (!result) continue;
    
    for (const stream of result) {
      for (const msg of stream.messages) {
        await processMessage(msg);
        lastId = msg.id;
      }
    }
  }
}
```

## COUNT option

```text
XREAD COUNT 10 STREAMS events 0
```

Max 10 entries per response. Batch.

## Multiple streams

```text
XREAD STREAMS events:user events:order $ $
```

Đọc 2 streams cùng lúc. Result chia per stream.

```ts
const result = await client.xRead([
  { key: 'events:user', id: '$' },
  { key: 'events:order', id: '$' },
], { BLOCK: 5000 });
```

→ Reactor pattern: 1 worker handle nhiều topic.

## Return format

```text
XREAD COUNT 2 STREAMS events 0
1) 1) "events"
   2) 1) 1) "1736935200000-0"
         2) 1) "action"
            2) "signup"
            3) "userId"
            4) "42"
      2) 1) "1736935210000-0"
         2) 1) "action"
            2) "view"
            ...
```

Nested arrays. Trong code:
```ts
result = [
  {
    name: 'events',
    messages: [
      { id: '1736935200000-0', message: { action: 'signup', userId: '42' } },
      { id: '1736935210000-0', message: { action: 'view', ... } },
    ]
  }
]
```

Client lib parse tự động.

## Pattern producer + consumer

### Producer (vd web server)
```ts
async function trackEvent(action: string, userId: string, extras: Record<string, string>) {
  await client.xAdd('events:user-actions', '*', {
    action,
    userId,
    timestamp: String(Date.now()),
    ...extras,
  });
}

// Mỗi user action:
trackEvent('view', userId, { itemId: '42' });
trackEvent('like', userId, { itemId: '42' });
```

### Consumer (vd analytics worker)
```ts
async function analyticsWorker() {
  let lastId = '$';
  while (true) {
    const result = await client.xRead(
      { key: 'events:user-actions', id: lastId },
      { BLOCK: 0, COUNT: 100 }
    );
    if (!result) continue;
    
    for (const { messages } of result) {
      for (const msg of messages) {
        await aggregateMetric(msg.message);
        lastId = msg.id;
      }
    }
  }
}
```

→ Producer + consumer decoupled. Producer fast, consumer process at own pace.

## Bẫy: $ không cho replay

`XREAD STREAMS events $` chỉ đọc entries **sau khi command run**. Nếu worker crash + restart, mất entries trong khi down.

Để replay từ last seen, lưu lastId persistent:
```ts
// On crash recovery
const lastId = await client.get('worker:lastId') || '0';
while (true) {
  const result = await client.xRead({ key: 'events', id: lastId }, { BLOCK: 0 });
  for (const msg of result[0].messages) {
    await processMsg(msg);
    lastId = msg.id;
    await client.set('worker:lastId', lastId);    // persist
  }
}
```

→ Tự xử lý acknowledgment + offset. Phức tạp.

→ Consumer Group giải bài này tự động. Sẽ học bài 5-6.

## Memory overhead

Stream 1M entries với 5 fields × ~30 byte/value = 150 byte/entry × 1M = 150 MB.

So với Pub/Sub: Pub/Sub không persistent → 0 memory. Streams trade memory cho durability.

## XTRIM — manual trim

```text
XTRIM events MAXLEN ~ 1000
```

Trim stream xuống ~1000 entries. Hữu ích khi quên `MAXLEN` trong XADD.

```text
XTRIM events MINID 1736900000000
```

Xoá entries cũ hơn ID này.

## XDEL — xoá entry cụ thể

```text
XDEL events 1736935200000-0
```

Xoá entry với ID đó. Hiếm dùng (streams append-only theo design).

Use case: compliance (GDPR delete user data).

## Tóm tắt bài 2

- `XADD key * field value ...` thêm entry với auto ID.
- ID format `<timestamp>-<sequence>`.
- `MAXLEN ~ N` để cap length.
- `XREAD STREAMS key <id>` đọc entries newer than id.
- `$` cho "only new". `0` cho "all".
- `BLOCK ms` cho long polling.
- Memory ~150 byte/entry với 5 fields.

**Bài kế tiếp** → [Bài 3: XRANGE + replay history](03-xrange-replay.md)

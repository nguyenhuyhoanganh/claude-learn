# Bài 4: Use cases của List — khi nào nên/không nên dùng

List là kiểu **dễ overuse**. Bài này cover 4 use case chính + decision tree để biết khi nào List, khi nào cấu trúc khác.

## Use case 1: Activity feed / Recent items

**Yêu cầu**: hiển thị N item gần nhất (recent posts, recently viewed, notifications).

```ts
async function logActivity(userId: string, activity: object) {
  const key = `activity:user#${userId}`;
  await client.multi()
    .lPush(key, JSON.stringify(activity))
    .lTrim(key, 0, 99)
    .exec();
}

async function getRecentActivities(userId: string) {
  const raw = await client.lRange(`activity:user#${userId}`, 0, 19);
  return raw.map((r) => JSON.parse(r));
}
```

**Khi nào List OK**:
- Cố định N (vd 100 gần nhất, không cần phân page sâu).
- Append-only.
- Thứ tự = insertion order (chronological).

**Khi nào Sorted Set tốt hơn**:
- Cần pagination sâu (page 50, page 100).
- Cần range query theo time (vd "activities trong 24h qua").
- Cần delete element giữa (vd unfollow → loại activity của user đó).

→ **Sorted Set linh hoạt hơn** trong hầu hết case. List chỉ ưu khi rất đơn giản.

## Use case 2: Simple queue

**Yêu cầu**: producer → enqueue, worker → dequeue.

```ts
// Producer
await client.rPush('jobs', JSON.stringify(job));

// Worker (blocking)
const subClient = client.duplicate();
await subClient.connect();
while (true) {
  const result = await subClient.blPop('jobs', 0);
  if (result) {
    const job = JSON.parse(result.element);
    await processJob(job);
  }
}
```

**Khi nào OK**:
- Worker đáng tin (không crash giữa BLPOP và xử lý xong).
- Không cần retry, dead letter, ack.
- Throughput nhỏ-vừa (< 10k jobs/s).

**Khi nào KHÔNG dùng List**:
- Cần ack/retry → **Stream + Consumer Group** (phase-20).
- Cần priority → **Sorted Set** với score = priority.
- Cần delayed job → **Sorted Set** với score = runAt.

→ List queue **đơn giản** nhưng **mong manh**. Production lớn → Stream.

## Use case 3: Bid history (App RB)

**Yêu cầu**: ghi lịch sử bid của 1 item, hiển thị 20 bid gần nhất.

```ts
async function addBid(itemId: string, bid: BidEntry) {
  await client.rPush(`bids:item#${itemId}`, JSON.stringify(bid));
}

async function getRecentBids(itemId: string, count = 20) {
  const raw = await client.lRange(`bids:item#${itemId}`, -count, -1);
  return raw.map((r) => JSON.parse(r));
}
```

**OK với List** vì:
- Append-only (bid không update / delete).
- Chỉ hiển thị N gần nhất.
- Không cần range query theo time.

**Sorted Set cũng OK** nếu cần:
- Range theo amount: "bids 100-500$".
- Range theo time: "bids trong 1h cuối".

App RB chọn List cho đơn giản. Sẽ làm chi tiết bài 6.

## Use case 4: Pub-Sub buffer

**Yêu cầu**: subscriber offline tạm thời, vẫn nhận message khi online lại.

```ts
// Publish
await client.rPush(`inbox:user#${userId}`, JSON.stringify(message));

// Subscriber khi online
const messages = await client.lRange(`inbox:user#${userId}`, 0, -1);
await client.del(`inbox:user#${userId}`);
// Process messages
```

Pattern **persistent pub-sub** đơn giản. Nhưng **Stream** tốt hơn hẳn với:
- Multiple consumer reading same stream.
- Replay từ ID nhất định.
- Consumer group cho parallel processing.

→ Pub-sub buffer **legacy**. Code mới dùng Stream.

## Decision tree: List vs Alternative

```text
"Cần lưu collection sequence"
            │
            ▼
       Có duplicate?
       ┌────┴────┐
       │         │
      KHÔNG      CÓ
       │         │
       ▼         ▼
   Sorted Set   Có thứ tự?
                 ┌──┴──┐
                 │     │
                 CÓ    KHÔNG
                 │     │
                 ▼     ▼
            Cần range  Set
            theo score?
            ┌─┴─┐
            │   │
           CÓ   KHÔNG
            │   │
            ▼   ▼
        Sorted  Insertion
        Set     order?
                ┌─┴─┐
                │   │
               CÓ   KHÔNG
                │   │
                ▼   ▼
              List  Stream
              hoặc  (event)
              Stream
```

→ Đa số đường về Sorted Set / Stream. List chỉ "trúng" ở vài nhánh hẹp.

## Anti-patterns với List

### 1. Dùng List làm "map index"

```ts
// SAI
await client.rPush('users:list', JSON.stringify({ id, name }));
// Tìm user theo id: phải scan toàn list
const all = await client.lRange('users:list', 0, -1);
const found = all.find((u) => JSON.parse(u).id === targetId);
```

→ O(N) lookup. Cách đúng: 1 Hash per user (`users#<id>`).

### 2. Dùng List với 1M+ element

```text
RPUSH event_log <event>     # mỗi lần có event
LRANGE event_log -100 -1    # OK
LRANGE event_log 500000 500099  # CHẬM
```

→ Cho event log lớn, dùng **Stream** với XADD/XREAD. Có ID, có consumer group.

### 3. LINSERT để sort

```ts
// SAI — dùng LINSERT giữ thứ tự sorted
await client.lInsert('leaderboard', 'BEFORE', someValue, newValue);
```

→ O(N) per insert, không scale. Dùng Sorted Set.

### 4. LREM 0 trên list lớn

```text
LREM big_list 0 element     # quét toàn 1M element — block server
```

→ Quét toàn list. Tránh.

## When List wins (hiếm)

1. **Strict insertion-order, no other criteria**: vd log of raw events theo append order, không bao giờ pagination sâu.
2. **Memory tối ưu cho list nhỏ**: listpack encoding làm list <100 element rất gọn.
3. **Simple BLPOP queue**: với workload nhỏ, ít requirement.

90% các case khác → Sorted Set hoặc Stream.

## Tổng kết khi nào dùng gì

| Tình huống | Cấu trúc đúng |
|---|---|
| Cache HTML | String |
| Counter atomic | String (INCR) |
| Object với nhiều field | Hash |
| Tập không trùng | Set |
| Ranking, top N theo score | Sorted Set |
| Time-based event log | Stream (Redis 5+) |
| Job queue đơn giản, throughput thấp | List (LPUSH/RPOP/BLPOP) |
| Job queue production | Stream + Consumer Group |
| Activity feed có pagination | Sorted Set |
| Activity feed cố định 100 gần nhất | List (LPUSH+LTRIM) hoặc Sorted Set |
| Approximate unique count | HyperLogLog |
| Bitmap presence | Bitmap |
| Full-text search | RediSearch |

→ List = công cụ chuyên dụng, không phải mặc định.

## Tóm tắt bài 4

- 4 use case List chính: activity feed, simple queue, append log, pub-sub buffer.
- Sorted Set / Stream tốt hơn ở **hầu hết** case Production.
- Anti-patterns: dùng List làm index, list >10k, LINSERT để sort, LREM 0 list lớn.
- Decision tree: List chỉ "trúng" khi đơn giản, insertion-order, không cần range query.

**Bài kế tiếp** → [Bài 5: Bid history trong app RB — List in action](05-bid-history-app-rb.md)

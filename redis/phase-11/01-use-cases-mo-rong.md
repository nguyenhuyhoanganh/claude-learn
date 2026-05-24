# Bài 1: Sorted Set use cases mở rộng

Phase-10 đã xem 5 use case classic. Phase-11 đi sâu vào **2 use case dùng cho app RB**: ranking theo attribute (most viewed, most expensive) và range query theo time (ending soonest). Bài này thiết lập framework chung trước khi vào code.

## Pattern: "Most X" với attribute từ Hash

Vấn đề chung:
- Có **nhiều hash** lưu records (vd `items#1`, `items#2`, ...).
- Mỗi hash có một **attribute number** (vd `views`, `price`, `rating`).
- Cần truy vấn "top N có X cao nhất".

**SQL solution**: index trên cột → `SELECT ORDER BY X DESC LIMIT N`. Chấp nhận được, vài ms.

**Redis solution**: **maintain sorted set song song**. Member = hash key (hoặc id), score = attribute value.

```text
items#1 → { name: "Vintage Piano",  views: 1247 }
items#2 → { name: "Old Camera",     views: 892 }
items#3 → { name: "Rare Coin",      views: 2103 }

items:views (sorted set):
  items#2 → 892
  items#1 → 1247
  items#3 → 2103

ZRANGE items:views 0 9 REV    → top 10 most viewed
```

→ Sub-millisecond cho top N, bất kể có 1M item.

## Trade-off của pattern này

**Pro**:
- O(log N + K) lookup top N — nhanh hơn nhiều so với scan full collection.
- Update chỉ tốn O(log N) khi attribute đổi.
- Có thể range query theo score (vd "items có price 100-500").

**Con**:
- **Duplicate data**: views vừa ở hash vừa ở sorted set. Phải sync.
- **Write amplification**: mỗi update phải đụng 2-3 cấu trúc.
- **Memory**: sorted set ~50 byte/entry. 1M item × 5 sort indexes = 250 MB.

→ Đầu tư memory + sync code để có sub-ms read. Đúng tinh thần Redis: **đầu tư write để siêu nhanh read**.

## Mental model: secondary index thủ công

Trong SQL: `CREATE INDEX idx_views ON items(views)` — DB tự maintain.

Trong Redis: bạn tự `ZADD` mỗi khi views đổi. Không có "auto-index". Sorted set chính là **index thủ công**.

Hệ quả:
- Khi thêm sort criteria mới → thêm 1 sorted set.
- Khi đổi schema (vd field "views" rename "view_count") → migrate cả hash và sorted set.
- Khi xoá item → phải xoá cả khỏi mọi sorted set index.

→ Có thể wrap trong helper functions để tránh quên:

```ts
export async function setItemViews(itemId: string, views: number) {
  await Promise.all([
    client.hSet(itemKey(itemId), 'views', views.toString()),
    client.zAdd(itemsByViewsKey(), { score: views, value: itemId }),
  ]);
}

export async function deleteItem(itemId: string) {
  await Promise.all([
    client.del(itemKey(itemId)),
    client.zRem(itemsByViewsKey(), itemId),
    client.zRem(itemsByPriceKey(), itemId),
    client.zRem(itemsByEndingSoonKey(), itemId),
    // ... mọi sort index
  ]);
}
```

→ **Single source of truth** cho mọi mutation. Không scatter `zAdd` khắp codebase.

## Pattern: Time-window query

Vấn đề: "items kết thúc trong 1h tới".

**Naive**: scan toàn bộ items, filter theo endingAt. O(N) full scan. Không acceptable.

**Sorted set với score = timestamp**:

```text
items:ending-at:
  items#1 → 1736935200000    (endingAt = timestamp ms)
  items#2 → 1736935800000
  items#3 → 1736942400000

# Items kết thúc giữa now và now+1h:
ZRANGE items:ending-at <now-ms> <now+1h-ms> BYSCORE LIMIT 0 20
```

O(log N + K). K = số items trong window. Cực hiệu quả.

Use case khác cùng pattern:
- **Scheduled jobs**: score = runAt timestamp → worker poll items ≤ now.
- **Recent activities**: score = createdAt → "user X trong 24h qua làm gì".
- **Subscription expiration**: score = expiresAt → "user nào hết hạn trong 7 ngày tới".

## App RB — 5 sort indexes cần có

Phase trước đã đề cập, giờ chi tiết:

| Sort index | Score | Use case UI |
|---|---|---|
| `items:views` | views count | Carousel "Most viewed" |
| `items:price` | price | Carousel "Most expensive" |
| `items:ending-at` | endingAt timestamp | Carousel "Ending soonest" (filter ≥ now) |
| `items:likes` | likes count | Dashboard sort by likes |
| `items:created` | createdAt timestamp | "Recently added" |

Plus per-user:
| Sort index | Score | Use case |
|---|---|---|
| `items:by-owner:<userId>` | createdAt | Dashboard "your items" |
| `bids:item:<itemId>` | bidTime hoặc bidAmount | Bid history |

## Quirk: score là double — cẩn thận với string ID

Sorted set **score luôn là number**. Member là string. Đôi khi cần đảo: member là number, score là string. Không trực tiếp.

Workaround:
- Member nên là id ngắn (UUID, hex string).
- Nếu cần "sort theo username (string)": dùng `BYLEX` mode với mọi score = 0.

Đặc biệt: app RB dùng **hex string IDs** (`a3f9c2d1...`). Lúc cần lưu id làm score (vd `usernames` sorted set với member = username, score = userId), phải **convert hex → decimal**.

```ts
const decimalId = parseInt(hexId, 16);    // "a3f9..." → number
const hexId = decimalId.toString(16);     // ngược lại
```

→ Bài 2 sẽ áp dụng pattern này.

## Khi nào KHÔNG dùng sorted set cho "Top X"?

1. **Top X không thay đổi nhiều**: dùng cached array, refresh hourly. Đơn giản hơn.

2. **Sort dynamic kết hợp**: vd "top items by views_in_last_24h × likes". Score không cố định — phải tính runtime. Sorted set không phù hợp; dùng RediSearch hoặc tính ad-hoc.

3. **Cần full-text search**: dùng RediSearch.

4. **Workload write quá nặng**: nếu mỗi second có 100k write update score → sorted set có thể chậm. Cân nhắc batch update hoặc dùng counter rời.

## Pattern phổ biến: initialize lúc tạo entity

Khi tạo item, **luôn khởi tạo trong mọi sorted set ngay**:

```ts
export async function createItem(attrs: CreateItemAttrs): Promise<string> {
  const id = genId();
  const now = Date.now();
  
  await Promise.all([
    // Canonical storage
    client.hSet(itemKey(id), serialize(attrs)),
    
    // Sort indexes — score initial cho mỗi
    client.zAdd(itemsByViewsKey(),      { score: 0,                    value: id }),
    client.zAdd(itemsByLikesKey(),      { score: 0,                    value: id }),
    client.zAdd(itemsByPriceKey(),      { score: attrs.price,          value: id }),
    client.zAdd(itemsByEndingSoonKey(), { score: attrs.endingAt.getTime(), value: id }),
    client.zAdd(itemsByCreatedKey(),    { score: now,                  value: id }),
    
    // Per-user index
    client.zAdd(userItemsKey(attrs.ownerId), { score: now, value: id }),
  ]);
  
  return id;
}
```

7 lệnh trong 1 pipeline. ~1.5ms. Setup mọi index trong lần tạo.

Lợi: mọi item có ngay trong mọi sort index từ lúc tạo. Không cần "first view" để xuất hiện trong "ending soon".

## Tóm tắt bài 1

- Sorted Set = **secondary index thủ công** cho ranking và range query.
- Pattern "Most X": maintain song song với canonical hash.
- Pattern time-window: score = timestamp, range query O(log N + K).
- App RB cần 5+ sort indexes — initialize lúc tạo entity.
- Trade-off: duplicate data + sync code để có sub-ms read.

**Bài kế tiếp** → [Bài 2: Storing usernames trong sorted set + hex conversion](02-storing-usernames-hex.md)

# Bài 5: Use case kinh điển của Set + áp vào app RB

Bài cuối phase-8. Tổng hợp 4 use case kinh điển của Set, áp dụng vào app RB (e-commerce auction), và cung cấp template code cho mỗi pattern.

## Use case 1: Uniqueness enforcement

**Câu hỏi cốt lõi**: "X đã được dùng chưa?"

### Username uniqueness

Lúc đăng ký, đảm bảo username không trùng:

```ts
async function isUsernameAvailable(username: string): Promise<boolean> {
  return (await client.sIsMember('usernames', username.toLowerCase())) === 0;
}

async function registerUser(attrs: CreateUserAttrs): Promise<string> {
  const username = attrs.username.toLowerCase();
  
  if (await client.sIsMember('usernames', username)) {
    throw new Error('Username taken');
  }
  
  const id = genId();
  
  // Pipeline: tạo user + đăng ký username
  await Promise.all([
    client.hSet(userKey(id), serialize(attrs)),
    client.sAdd('usernames', username),
  ]);
  
  return id;
}
```

**Race condition**: 2 user đăng ký cùng username đồng thời, cả 2 đều thấy `isMember` = 0 → cả 2 vào nhánh "tạo". Cần atomic với MULTI/EXEC hoặc Lua. Sẽ học phase-17. Tạm chấp nhận race rất hiếm.

**Convention**: lowercase username trước khi check/add → "Alice" và "alice" không thể đăng ký cả 2.

### IP banlist

```ts
async function isIPBanned(ip: string): Promise<boolean> {
  return (await client.sIsMember('banned_ips', ip)) === 1;
}

// Middleware
app.use(async (req, res, next) => {
  if (await isIPBanned(req.ip)) {
    return res.status(403).send('Forbidden');
  }
  next();
});
```

Một SISMEMBER mỗi request — overhead ~0.5ms. Acceptable.

Nếu cần tốc độ cao hơn (vd 1M request/s): cache trong app memory với refresh background.

### Email domain whitelist/blacklist

```ts
const FREE_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com'];
await client.sAdd('free_email_domains', ...FREE_EMAIL_DOMAINS);

async function isFreeDomain(email: string): Promise<boolean> {
  const domain = email.split('@')[1]?.toLowerCase();
  return (await client.sIsMember('free_email_domains', domain)) === 1;
}
```

## Use case 2: Relationship modeling

**Câu hỏi cốt lõi**: "X liên quan tới Y nào?"

### Like — user likes items

App RB cần biết user đã like item nào và item có những user nào like.

**Bi-directional index pattern**:

```ts
// keys.ts
export const userLikesKey = (userId: string) => `likes:user#${userId}`;
export const itemLikedByKey = (itemId: string) => `liked_by:item#${itemId}`;

// queries/likes.ts
export async function likeItem(userId: string, itemId: string) {
  // Atomic-ish: add vào CẢ HAI set
  await Promise.all([
    client.sAdd(userLikesKey(userId), itemId),
    client.sAdd(itemLikedByKey(itemId), userId),
  ]);
}

export async function unlikeItem(userId: string, itemId: string) {
  await Promise.all([
    client.sRem(userLikesKey(userId), itemId),
    client.sRem(itemLikedByKey(itemId), userId),
  ]);
}
```

**Bi-directional index** = mỗi quan hệ N-N được lưu 2 lần (forward + backward) để **truy vấn O(1) cả 2 chiều**.

- "Alice like item nào?" → `SMEMBERS likes:user#alice` (forward).
- "Item 42 được ai like?" → `SMEMBERS liked_by:item#42` (backward).

Trade-off: memory gấp đôi. Nhưng các truy vấn không bao giờ O(N) full-table-scan.

### Helper queries

```ts
export async function getLikedItems(userId: string): Promise<string[]> {
  return await client.sMembers(userLikesKey(userId));
}

export async function getLikeCount(itemId: string): Promise<number> {
  return await client.sCard(itemLikedByKey(itemId));
}

export async function hasLiked(userId: string, itemId: string): Promise<boolean> {
  return (await client.sIsMember(itemLikedByKey(itemId), userId)) === 1;
}
```

**Mọi query O(1)**:
- `SCARD` đếm = O(1).
- `SISMEMBER` check = O(1).
- `SMEMBERS` cho user khi like ít item = chấp nhận. Khi user là celeb like 10k+ item → dùng SSCAN.

### Render UI

```ts
router.get('/items/:id', async (req, res) => {
  const itemId = req.params.id;
  const userId = req.session?.userId;
  
  const [item, likeCount, hasLikedIt] = await Promise.all([
    getItem(itemId),
    getLikeCount(itemId),
    userId ? hasLiked(userId, itemId) : false,
  ]);
  
  res.render('item-detail', { item, likeCount, hasLikedIt });
});
```

3 lệnh Redis trong 1 RTT pipeline. Render p99 < 5ms.

## Use case 3: Set operations cho discovery

**Câu hỏi cốt lõi**: "Phần chung / khác biệt giữa 2 người là gì?"

### Common likes (mục đích chính của intersection)

Trang profile user `B` xem bởi user `A`:

```ts
async function getCommonLikes(userIdA: string, userIdB: string): Promise<string[]> {
  return await client.sInter([
    userLikesKey(userIdA),
    userLikesKey(userIdB),
  ]);
}

router.get('/users/:id', async (req, res) => {
  const profileUserId = req.params.id;
  const currentUserId = req.session?.userId;
  
  const profileLikes = await getLikedItems(profileUserId);
  const commonLikes = currentUserId 
    ? await getCommonLikes(currentUserId, profileUserId)
    : [];
  
  // Render
  res.render('user-profile', { profileLikes, commonLikes });
});
```

→ UI hiển thị "Items they like" và "You and they both like" — đúng spec phase-6 bài 1.

### Items liked by friends

```ts
async function getItemsLikedByFriends(userId: string): Promise<string[]> {
  const friendsLikesKeys = friends.map((fId) => userLikesKey(fId));
  return await client.sUnion(friendsLikesKeys);   // distinct items
}
```

→ Discovery feed: "Bạn bè của bạn cũng đang thích những item này".

### Recommendation pattern (đơn giản)

```ts
async function recommend(userId: string, similarUserId: string, limit = 10) {
  // Item similar user like mà bạn chưa like
  const recommendations = await client.sDiff([
    userLikesKey(similarUserId),
    userLikesKey(userId),
  ]);
  return recommendations.slice(0, limit);
}
```

→ Recommend engine sơ khai. Cho production, kết hợp với collaborative filtering, vector similarity (Redis Stack).

## Use case 4: Unordered collections

**Câu hỏi cốt lõi**: "Một tập không cần thứ tự, không cần count chính xác."

### Tag cho item

```ts
export const itemTagsKey = (itemId: string) => `tags:item#${itemId}`;

await client.sAdd(itemTagsKey('xyz'), 'vintage', 'wood', 'piano');
await client.sMembers(itemTagsKey('xyz'));    // ['vintage', 'wood', 'piano']
```

Tag không cần thứ tự, không trùng → Set hoàn hảo.

### Reverse tag index (tag → items)

```ts
export const tagItemsKey = (tag: string) => `items:tag#${tag}`;

// Khi add tag
await Promise.all([
  client.sAdd(itemTagsKey(itemId), tag),
  client.sAdd(tagItemsKey(tag), itemId),
]);

// "Item nào có tag 'vintage'?"
await client.sMembers(tagItemsKey('vintage'));
```

Bi-directional index lại xuất hiện.

### Faceted search

User filter "vintage" AND "wood":

```ts
const filtered = await client.sInter([
  tagItemsKey('vintage'),
  tagItemsKey('wood'),
]);
// → items có cả 2 tag
```

→ Search by facet, O(N) với N là tag nhỏ nhất.

> Với search phức tạp (full-text, weighted ranking), dùng RediSearch (phase-18). Set chỉ phù hợp với filter exact match.

## Áp dụng đầy đủ cho app RB

Cập nhật `keys.ts`:

```ts
// USERS
export const userKey = (id: string) => `users#${id}`;
export const usernameSetKey = () => `usernames`;

// SESSIONS
export const sessionKey = (token: string) => `sessions#${token}`;

// ITEMS
export const itemKey = (id: string) => `items#${id}`;

// LIKES (bi-directional)
export const userLikesKey = (userId: string) => `likes:user#${userId}`;
export const itemLikedByKey = (itemId: string) => `liked_by:item#${itemId}`;

// VIEWS (uniqueness check)
export const itemViewersKey = (itemId: string) => `viewers:item#${itemId}`;
```

Sau phase-8, app có:
- Username unique → SADD/SISMEMBER ở `usernames`.
- Likes 2 chiều → 2 set per user + per item.
- Views unique → 1 set per item, SADD trả 1 nếu first time.

## View counter với uniqueness

```ts
export async function viewItem(userId: string, itemId: string) {
  // SADD trả 1 nếu mới, 0 nếu đã có
  const isNewView = await client.sAdd(itemViewersKey(itemId), userId);
  
  if (isNewView === 1) {
    // Increment counter trong hash item
    await client.hIncrBy(itemKey(itemId), 'views', 1);
  }
}
```

**Atomic-ish**: SADD trước (atomic), HINCRBY chỉ chạy nếu mới. Race condition rất hiếm trong thực tế (user view cùng item 2 lần đồng thời gần như không xảy ra). Cho production strict: dùng Lua.

## Memory consideration

Với 1M user và 100k item:
- `likes:user#X` mỗi user trung bình 50 items → 50M entries.
- `liked_by:item#Y` mỗi item trung bình 500 users → 50M entries (cùng tổng).
- Mỗi entry intset/listpack: ~10-20 byte → ~1 GB.

Cho app vừa, 1 instance Redis (32GB) chứa thoải mái. Cho app lớn (Twitter scale), cần shard.

## Tóm tắt phase-8

Đã học:
- Set là gì, encoding nội bộ, lệnh cơ bản (Bài 1).
- Phép toán giữa set: UNION, INTER, DIFF + use case (Bài 2).
- STORE variants cho cache phép toán (Bài 3).
- SISMEMBER, SSCAN cho operation an toàn (Bài 4).
- 4 use case kinh điển + áp vào app RB (Bài 5).

App RB giờ có Set cho: usernames, likes (bi-directional), views (unique).

**Phase tiếp theo** (phase-9 = Section 10 transcript): **Set implementation chi tiết** — implement đầy đủ likes và unique view trong app, kèm patterns sản xuất.

→ [Phase-9 — Bài 1: Yêu cầu username unique trong app RB](../phase-9/01-username-unique.md)

# Bài 6: Cache key generation — chống typo bằng helper function

Phần đầu Bài 5 ta đã viết key inline:

```ts
await client.set('pageCache#' + route, ...);
```

Nó hoạt động, nhưng không scale khi app lớn. Bài này refactor sang **helper function** trong `keys.ts` — pattern bắt buộc cho mọi app production.

## Vấn đề thật của key inline

Giả sử ta có nhiều file dùng cùng key pattern:

```ts
// page-cache.ts
await client.set('pageCache#' + route, html, { EX: 2 });

// background-warmer.ts
const cached = await client.get('pageCache#' + route);

// admin-tools.ts
await client.del('pageCache#' + route);

// analytics.ts
const keys = await client.scan(0, { MATCH: 'pageCache#*' });

// monitoring.ts
const all = await client.scan(0, { MATCH: 'pageCach#*' });  // ← TYPO!
```

5 file, 5 chỗ viết tay. Một chỗ typo → bug âm thầm:
- `monitoring.ts` luôn trả mảng rỗng.
- Bạn debug nhiều giờ trước khi nhận ra.
- TypeScript không bắt được (chỉ string).

**Rules of three**: viết key cùng pattern ở 3+ file → tách function. Thực ra với key, **viết 1 lần cũng nên tách** vì gần như chắc chắn sẽ dùng nhiều chỗ.

## Giải pháp: file `keys.ts`

Tập trung mọi key generator vào một file duy nhất.

```ts
// src/services/keys.ts

export const pageCacheKey = (id: string) => `pageCache#${id}`;
```

Cách dùng:

```ts
// page-cache.ts
import { pageCacheKey } from '../keys';

await client.set(pageCacheKey(route), html, { EX: 2 });

// background-warmer.ts
import { pageCacheKey } from '../keys';

const cached = await client.get(pageCacheKey(route));

// monitoring.ts
import { pageCacheKey } from '../keys';

await client.scan(0, { MATCH: pageCacheKey('*') });
//                                          ^^^ vẫn pattern, không phải route thật
```

→ Mọi file dùng cùng một nguồn key. Typo bị TypeScript bắt ngay khi compile (vì `pageCacheKey` là identifier, không phải string).

## Template literal vs concatenation

JavaScript có 2 cách nối string:

```ts
// Concatenation
const k = 'pageCache#' + id;

// Template literal (back-tick, ES6+)
const k = `pageCache#${id}`;
```

Cả hai làm cùng thứ. **Template literal** ưu thế khi:
- Có nhiều biến: `` `users#${id}:cart:${itemId}` `` rõ ràng hơn `'users#' + id + ':cart:' + itemId`.
- Có expression phức tạp: `` `cache:${slug.toLowerCase()}` ``.
- Có newline: template literal hỗ trợ `\n` literal.

Khuyến cáo: dùng template literal cho mọi key generator.

## File `keys.ts` mở rộng

Đến cuối khoá, file này có ~30 entries. Tổ chức theo nhóm:

```ts
// src/services/keys.ts

// ─────────────────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────────────────
export const pageCacheKey = (route: string) => `pageCache#${route}`;
export const searchResultsCacheKey = (query: string) =>
  `cache:search#${query.toLowerCase()}`;

// ─────────────────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────────────────
export const userKey            = (id: string) => `users#${id}`;
export const userSessionsKey    = (id: string) => `users#${id}:sessions`;
export const userByUsernameKey  = (name: string) => `usernames:${name}`;
export const userByEmailKey     = (email: string) => `emails:${email.toLowerCase()}`;

// ─────────────────────────────────────────────────────────
// ITEMS / AUCTIONS
// ─────────────────────────────────────────────────────────
export const itemKey       = (id: string) => `items#${id}`;
export const itemBidsKey   = (id: string) => `items#${id}:bids`;
export const itemViewsKey  = (id: string) => `items#${id}:views`;
export const itemLikesKey  = (id: string) => `items#${id}:likes`;
export const itemsByEndingSoonKey = () => `items:by-ending-soon`;
export const itemsByPriceKey = () => `items:by-price`;

// ─────────────────────────────────────────────────────────
// SESSIONS
// ─────────────────────────────────────────────────────────
export const sessionKey   = (id: string) => `sessions#${id}`;

// ─────────────────────────────────────────────────────────
// LEADERBOARDS
// ─────────────────────────────────────────────────────────
export const leaderboardKey = (period: string) => `leaderboard:${period}`;

// ─────────────────────────────────────────────────────────
// LOCKS
// ─────────────────────────────────────────────────────────
export const lockKey       = (resource: string) => `lock:${resource}`;

// ─────────────────────────────────────────────────────────
// RATE LIMITING
// ─────────────────────────────────────────────────────────
export const rateLimitKey = (uid: string, window: string) =>
  `rate:${uid}:${window}`;
```

> File này trở thành **bản đồ data layer** của app. Engineer mới onboard chỉ cần đọc `keys.ts` là nắm app dùng những loại key gì.

## Type-safety nâng cao (TypeScript)

Bạn có thể đẩy thêm safety:

### Ép kiểu argument

```ts
export const userKey = (id: UserId) => `users#${id}`;

type UserId = string & { __brand: 'UserId' };
type ItemId = string & { __brand: 'ItemId' };

// userKey(itemId)   ← compile error, ItemId không phải UserId
```

Brand type ngăn truyền nhầm id giữa các entity. Hơi over-engineering cho app nhỏ.

### Trả về kiểu key cụ thể

```ts
type RedisKey<T extends string> = string & { __redisKeyType: T };

export const userKey = (id: string): RedisKey<'user'> =>
  `users#${id}` as RedisKey<'user'>;

export async function getUser(id: string) {
  return await client.hGetAll(userKey(id));   // OK
}
```

Cấp độ này hữu ích cho lib chung; app product thường không cần.

## Quy tắc thiết kế cho `keys.ts`

### 1. Tên function rõ ràng

❌ `userK(id)` — ngắn nhưng cryptic.  
✅ `userKey(id)` — rõ là "key cho user".  
✅ `userSessionKey(uid)` — rõ "key cho session của user".

### 2. Pure function — không side effect

Function chỉ trả string. Không log, không validate, không gọi DB.

```ts
// SAI
export const userKey = (id: string) => {
  console.log('Building user key for', id);   // không cần
  if (!id) throw new Error('id required');     // không nên ở đây
  return `users#${id}`;
};

// ĐÚNG
export const userKey = (id: string) => `users#${id}`;
```

Side effect khiến function khó test, khó cache. Validate ở chỗ khác (controller).

### 3. Tránh logic phức tạp

```ts
// SAI - logic business trong key generator
export const userKey = (id: string) => {
  const env = process.env.NODE_ENV;
  return env === 'production' ? `users#${id}` : `dev:users#${id}`;
};

// ĐÚNG - namespace ở config level
export const userKey = (id: string) => `${NAMESPACE}:users#${id}`;
// hoặc set ở client init
```

### 4. Nhóm theo entity, comment phân cách

Như ví dụ file trên — block comment phân cách giúp file 500 dòng vẫn dễ đọc.

### 5. Export hằng số cũng nên ở đây

```ts
// keys.ts
export const NAMESPACE = process.env.REDIS_NAMESPACE ?? 'arb';
export const CACHE_TTL_SHORT  = 60;       // 1 phút
export const CACHE_TTL_MEDIUM = 300;      // 5 phút
export const CACHE_TTL_LONG   = 3600;     // 1 giờ
```

Tập trung cấu hình → dễ tune.

## Anti-pattern: dùng class

Một số tutorial dùng class:

```ts
class Keys {
  static userKey(id: string) { return `users#${id}`; }
  static itemKey(id: string) { return `items#${id}`; }
}

// Dùng:
Keys.userKey('42');
```

Hoạt động nhưng:
- Verbose hơn `userKey('42')`.
- Class không có state → chỉ là namespace giả.
- TypeScript treeshaking khó hơn với class.

Function module export rõ ràng hơn.

## Áp dụng vào `page-cache.ts`

Sau refactor:

```ts
// src/services/queries/page-cache.ts
import { client } from '../redis/client';
import { pageCacheKey } from '../keys';

const CACHED_ROUTES = ['/about', '/privacy', '/auth/signin', '/auth/signup'];

export async function getCachePage(route: string): Promise<string | null> {
  if (!CACHED_ROUTES.includes(route)) return null;
  return await client.get(pageCacheKey(route));
}

export async function setCachePage(route: string, page: string): Promise<void> {
  if (!CACHED_ROUTES.includes(route)) return;
  await client.set(pageCacheKey(route), page, { EX: 2 });
}
```

```ts
// src/services/keys.ts
export const pageCacheKey = (route: string) => `pageCache#${route}`;
```

So với phiên bản inline: chỉ 1 dòng thay đổi trong `page-cache.ts` (import + dùng function). Nhưng giờ mọi file khác dùng `pageCacheKey()` đều đồng bộ tuyệt đối.

## Bonus: cache stampede mitigation (preview)

Bài 5 đã đề cập race condition khi 2 request cùng miss. Code có thể nâng cấp:

```ts
import { lockKey, pageCacheKey } from '../keys';

export async function setCachePage(route: string, page: string): Promise<void> {
  if (!CACHED_ROUTES.includes(route)) return;
  
  // Chỉ worker giữ lock mới được rebuild & set
  const lock = await client.set(lockKey(`rebuild:${route}`), '1', {
    NX: true,
    EX: 5,
  });
  if (!lock) return;   // worker khác đang rebuild → skip
  
  await client.set(pageCacheKey(route), page, { EX: 2 });
  await client.del(lockKey(`rebuild:${route}`));
}
```

Mục đích: nếu 100 request cùng miss, chỉ 1 actually re-render, 99 còn lại "nhường". Cần thêm logic ở getCachePage để "đợi và đọc lại" — bài phase concurrency sẽ làm đủ.

## Tóm tắt phase-3

Phase-3 đã đi qua:
- App overview, stack, roadmap (Bài 1).
- Cách dùng client lib, vì sao không có ORM thật (Bài 2).
- **Redis Design Methodology** — bài học cốt lõi cả khoá (Bài 3).
- Key naming convention chuyên nghiệp (Bài 4).
- Implement page caching thực tế (Bài 5).
- Helper function `keys.ts` chống typo, làm bản đồ data (Bài 6).

Bạn đã làm **feature đầu tiên** với Redis trong app thật, từ thiết kế đến code. Pattern này sẽ lặp lại cho mọi feature tiếp theo:

```text
Liệt query → 5 câu hỏi → key naming → code (10-30 dòng) → test → tối ưu
```

**Phase tiếp theo** (phase-4 = Section 05 trong transcript) sẽ học **Hash data structure** — kiểu dữ liệu lý tưởng để lưu user/product profile với nhiều field. Đó là kiểu sẽ dùng nhiều nhất sau String trong app.

→ Sẽ tiếp tục ở session sau.

## Reference đầy đủ phase-3

| Bài | Topic | Dòng code thực tế |
|---|---|---|
| 1 | App overview, setup | 0 (lý thuyết) |
| 2 | Client library | ~10 (snippets) |
| 3 | Design methodology | 0 (tư duy) |
| 4 | Key naming | ~20 (`keys.ts` partial) |
| 5 | Page caching impl | 13 (`page-cache.ts`) |
| 6 | Key generation refactor | +30 (`keys.ts` full) |

Tổng app: ~60 dòng cho feature đầu tiên. Phần lớn thời gian là **thiết kế và verify**, không phải gõ code. Đây là tâm thế đúng với Redis.

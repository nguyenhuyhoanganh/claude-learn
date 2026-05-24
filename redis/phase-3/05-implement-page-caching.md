# Bài 5: Implement page caching — viết code thực tế

Đã có:
- Hiểu app (Bài 1)
- Hiểu client lib (Bài 2)
- Đi qua design methodology (Bài 3)
- Quy ước key (Bài 4)

Giờ vào code. Mục tiêu: cache HTML của 4 trang static (`/about`, `/privacy`, `/auth/signin`, `/auth/signup`) trong Redis.

## File ta sẽ làm việc

`src/services/queries/page-cache.ts` — chứa 2 function rỗng:

```ts
export async function getCachePage(route: string): Promise<string | null> {
  // TODO
}

export async function setCachePage(route: string, page: string): Promise<void> {
  // TODO
}
```

Framework (SvelteKit) đã gọi 2 function này ở middleware level. Bạn chỉ cần điền logic Redis.

### Flow gọi từ framework

```text
Request → /about
   │
   ▼
getCachePage("/about")
   │
   ├─→ Có cache → return HTML → Response (1-2ms) ✓
   │
   └─→ null → SvelteKit render → HTML mới
              │
              ▼
           setCachePage("/about", html)
              │
              ▼
           Response (50ms+)
```

## Bước 1 — Định danh các route được cache

Trong `page-cache.ts`, thêm danh sách:

```ts
const CACHED_ROUTES = ['/about', '/privacy', '/auth/signin', '/auth/signup'];
```

> Để tạm trong file này. Nếu list lớn hoặc dùng nhiều nơi, tách ra `src/config/cached-routes.ts`.

## Bước 2 — Import dependencies

```ts
import { client } from '../redis/client';
import { pageCacheKey } from '../keys';
```

- `client` — Redis client đã khởi tạo (xem `client.ts`).
- `pageCacheKey` — function sinh key (sẽ tạo ở Bài 6, tạm thời inline).

## Bước 3 — Implement `getCachePage`

```ts
export async function getCachePage(route: string): Promise<string | null> {
  // Không trong danh sách cache → không truy vấn Redis
  if (!CACHED_ROUTES.includes(route)) {
    return null;
  }

  // Truy vấn cache
  return await client.get(pageCacheKey(route));
}
```

### Tại sao check `CACHED_ROUTES` trước?

3 lý do:
1. **Tiết kiệm 1 round-trip Redis** với các route không cache (đa số request).
2. **Đơn giản logic ở framework side**: gọi `getCachePage(route)` luôn an toàn, không cần check ở caller.
3. **Tránh "cache pollution"**: nếu ai đó vô tình set cache cho `/dashboard`, route đó cũng không bị đọc nhầm.

### Trả về null nghĩa là gì?

Có 2 trường hợp `getCachePage` trả `null`:
1. Route không trong list cache → SvelteKit render trang như bình thường (không "miss cache").
2. Route trong list nhưng Redis chưa có (cache miss) → SvelteKit render + sau đó set cache.

Cả 2 đều mapping về cùng hành vi "render fresh". Tốt cho caller.

### Edge case: Redis down?

Nếu Redis down, `client.get()` ném exception. Caller (SvelteKit middleware) nên catch để fallback về render thường:

```ts
// Ở middleware (không phải trong getCachePage)
try {
  const cached = await getCachePage(route);
  if (cached) return new Response(cached);
} catch (e) {
  console.error('Cache lookup failed, falling back', e);
}
// → continue render flow
```

→ Cache là **optimization**, không phải requirement. App vẫn chạy được khi Redis chết.

## Bước 4 — Implement `setCachePage`

```ts
export async function setCachePage(route: string, page: string): Promise<void> {
  if (!CACHED_ROUTES.includes(route)) {
    return;
  }

  await client.set(pageCacheKey(route), page, { EX: 2 });
}
```

### Phân tích từng phần

- **Check `CACHED_ROUTES`**: same lý do như `getCachePage`. Nếu một caller (vd bug) gọi set với route không thuộc list, ta im lặng skip thay vì pollute Redis.
- **`client.set(key, value, { EX: 2 })`** — set kèm TTL 2 giây.
- **TTL = 2 giây cho dev**: dễ test (refresh trang 3s sau thấy render lại). **Production**: 2 phút - vài giờ tuỳ tần suất bạn update trang static.
- **Không cần `return`** — `client.set` trả `"OK"` nhưng caller không quan tâm.

### Vì sao không dùng `KEEPTTL`?

```ts
await client.set(pageCacheKey(route), page, { EX: 2 });
```

vs

```ts
await client.set(pageCacheKey(route), page, { KEEPTTL: true });
```

`KEEPTTL` chỉ hữu ích khi **đã có** TTL và muốn giữ. Lần đầu set → không có TTL nào để giữ. Set với `EX: 2` mỗi lần đảm bảo TTL mới được áp dụng → đúng cho cache.

### Có cần dùng `SET ... XX` để chỉ ghi nếu đã có?

Không. Lần đầu render trang, cache chưa có → cần set. Lần sau cache hết hạn → cần set lại. `XX` sẽ skip cả 2 trường hợp → hỏng cache logic.

### Race condition giữa 2 request cùng miss?

Tình huống: 2 user cùng request `/about` tại đúng thời điểm cache vừa hết hạn:

```text
User A: getCachePage → null → render (50ms)
User B: getCachePage → null → render (50ms)  
User A: setCachePage(html_A)
User B: setCachePage(html_B)
```

→ 2 lần render thay vì 1. Lãng phí CPU.

Đây là **cache stampede** — không vấn đề nếu traffic thấp (vài user), nghiêm trọng nếu traffic cao (10k user cùng miss).

Mitigation cho phase này: chấp nhận. 4 trang static, traffic chia đều. Nếu sau này cần:
- Lock với `SET lock:rebuild#/about worker NX EX 30` — chỉ 1 worker rebuild.
- Probabilistic early refresh — refresh background trước expire.
- Sẽ học trong phase concurrency sau.

## Code đầy đủ file `page-cache.ts`

```ts
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

**13 dòng code, 0 dòng comment.** Code rõ tới mức comment chỉ là noise.

## Bước 5 — Test thủ công

```bash
npm run dev
```

Mở browser:
1. `http://localhost:3000/about` — render lần đầu (~50ms). Cache đã được set.
2. Refresh ngay — render từ cache (~2ms).
3. Đợi 3 giây, refresh — cache hết hạn, render lại (~50ms).

Verify trong RedisInsight:
- Browser tab → search `pageCache#*`
- Thấy 1 key `pageCache#/about` với TTL ~2 giây.

```text
> KEYS pageCache#*
1) "pageCache#/about"
> GET "pageCache#/about"
"<html>...</html>"
> TTL "pageCache#/about"
(integer) 1
```

## Bước 6 — Verify với route KHÔNG cache

Mở `http://localhost:3000/dashboard` (cần đăng nhập, nhưng để test):
- `getCachePage("/dashboard")` → null (không trong list).
- Render mỗi lần.
- Trong Redis, KHÔNG có key `pageCache#/dashboard` được tạo.

## Hiệu năng kỳ vọng

Đo bằng `curl -w "%{time_total}\n" http://localhost:3000/about -o /dev/null -s`:

| Lần | Cache | Thời gian |
|---|---|---|
| 1 (sau khi cache hết) | Miss → render → set | ~50-80 ms |
| 2 (ngay sau) | Hit | ~3-5 ms |
| 3 (ngay sau) | Hit | ~3-5 ms |

Hệ số tăng tốc: **10-20x**. CPU server giảm thêm vì khong render template.

## Vấn đề tiềm năng cần lưu ý

### 1. Cache có HTML "personalized" không phải static

Nếu trang `/about` chứa `<a href="/dashboard">Hi {{user.name}}</a>` trong nav bar:
- Cache lần đầu: chứa `"Hi Alice"`.
- User Bob vào sau: thấy `"Hi Alice"` (sai!).

→ Trước khi cache một route, **xác minh thật sự static** (mọi user thấy giống nhau). SvelteKit có cách tách "static shell" và "dynamic island" — vượt scope phase này.

### 2. Cache hết hạn cùng lúc cho tất cả 4 trang

Tất cả set TTL 2 → có thể cùng hết hạn → spike. Nhẹ vì chỉ 4 trang, nhưng best practice thêm jitter:

```ts
const ttl = 2 + Math.floor(Math.random() * 2);   // 2-3s
await client.set(pageCacheKey(route), page, { EX: ttl });
```

### 3. Update trang `/about` rồi deploy

User cũ thấy phiên bản cũ tới khi TTL hết. Mitigation:
- `DEL pageCache#/about` ngay sau deploy.
- Hoặc dùng `pageCache:v2#/about` (version trong key) → deploy thay version → cache cũ tự expire.

### 4. Redis cluster

Nếu lên cluster, hash tag cần. Hiện app dùng standalone (1 instance) → không cần. Khi cần:

```ts
export const pageCacheKey = (route: string) => `{pageCache}#${route}`;
```

Mọi key cùng `{pageCache}` slot → có thể MGET nhiều page cùng lúc.

## Khi nào NÊN mở rộng cache?

Sau khi 4 trang static hoạt động, có thể nghĩ tới:
- Cache search result (`/search?q=...`) — TTL ngắn ~30s.
- Cache user profile public (`/users/{id}`) — TTL trung bình ~5 phút.
- Cache item details (`/items/{id}`) — TTL ngắn ~30s nhưng invalidate khi có bid mới.

**Mỗi lần cache thêm**, đi qua **5 câu hỏi methodology** lại. Không "cache đại".

## Tóm tắt bài 5

- 13 dòng code đầu tiên thực sự dùng Redis trong app.
- Pattern **check whitelist trước → đụng Redis** tiết kiệm round-trip và an toàn.
- TTL ngắn cho dev, dài cho prod; có thể thêm jitter.
- Set kèm `EX` mỗi lần, không cần `KEEPTTL` cho first-time.
- Cache miss + re-render là chấp nhận được khi traffic thấp; production lớn cần lock/stampede mitigation.
- Cache có thể stale khi deploy → version trong key hoặc DEL ngay là patch chuẩn.

**Bài kế tiếp** → [Bài 6: Cache key generation — chống typo bằng helper function](06-cache-key-generation.md)

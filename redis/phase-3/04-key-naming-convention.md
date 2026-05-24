# Bài 4: Key naming convention — quy tắc đặt tên key chuyên nghiệp

Tên key là **interface** của data trong Redis. Một tên xấu khiến engineer khác (hoặc bạn 3 tháng sau) không hiểu key chứa gì, dễ trùng key giữa các feature, khó debug, khó migrate. Bài này đặt nền tảng cho mọi feature còn lại.

## Hai nguyên tắc gốc

1. **Key phải unique** trong toàn bộ Redis. Trùng = ghi đè/đụng kiểu.
2. **Engineer khác đọc key phải hiểu** đại loại key chứa gì.

Tất cả convention khác chỉ là kỹ thuật phục vụ 2 nguyên tắc này.

## Pattern chuẩn nhất: `entity:identifier`

Đây là pattern **được toàn cộng đồng Redis dùng** từ ngày đầu:

```text
user:42                  → toàn bộ thông tin user id 42
user:42:profile          → riêng profile
user:42:sessions         → list các session
user:42:cart             → giỏ hàng
session:abc-123          → một session cụ thể
product:7                → một sản phẩm
product:7:reviews        → review của sản phẩm 7
cache:page:home          → cache trang home
order:2025:00001234      → một order với năm trong tên
```

### 3 lý do dùng dấu `:`

1. **Quy ước cộng đồng** — mọi tool (RedisInsight, redis-cli, Bull, Sidekiq...) hiểu `:` là dấu phân cách level.
2. **Hỗ trợ tree view**: RedisInsight tự nhóm key thành cây dựa trên `:`. Bạn duyệt keyspace như duyệt thư mục.
3. **Pattern matching dễ**: `SCAN 0 MATCH "user:*"` tìm mọi key user.

> Bạn **có thể** dùng `.` hoặc `/` hoặc `-` — không sai ngữ pháp Redis. Nhưng đi ngược cộng đồng tốn nhiều chi phí công cụ. Cứ dùng `:`.

## Cấu trúc thường gặp

```text
{namespace}:{entity}:{id}[:{subfield}]
```

| Phần | Vai trò | Ví dụ |
|---|---|---|
| namespace | Phân biệt app/env/feature | `arb`, `prod`, `cache`, `lock` |
| entity | Loại đối tượng | `user`, `product`, `session`, `order` |
| id | Định danh duy nhất | `42`, `abc-123`, UUID |
| subfield | Phụ kiện (optional) | `profile`, `cart`, `wins` |

Ví dụ:

```text
arb:user:42:profile
arb:product:7:reviews
arb:cache:page:home
arb:lock:order:1234
arb:rate:user:42:minute:2025-01-15T14:32
```

> Namespace `arb` giúp khi cùng một Redis được share giữa nhiều app — không đụng key. Nhiều team thay vào đó dùng **DB index hoặc Redis instance riêng** cho mỗi app.

## Quy ước thực tế — case study từ khoá

App RB cache 4 trang `/about`, `/privacy`, `/auth/signin`, `/auth/signup`. Key có thể là:

❌ `page` — không unique, ghi đè liên tục.  
❌ `about`, `signin` — không có namespace, dễ đụng feature khác.  
✅ `pageCache:/about`, `pageCache:/privacy` — rõ ràng.  
✅ `pageCache#/about` — variant dùng `#` cho unique identifier (giải thích bên dưới).

## Tách `:` vs `#` — biến tấu hữu ích

Stephen Greiner trong khoá giới thiệu thêm: dùng `#` để đánh dấu **unique identifier** trong key, còn `:` cho các phần tử lớp/category.

```text
pageCache#/about            # # → unique id (route)
users#42                    # # → unique id (user id)
users:posts                 # : → relationship (post của user)
users:posts#19              # post 19 của user
```

### Lý do?

Khi dùng **RediSearch** (full-text search Redis module), ta định nghĩa index trên các key. Quy ước `#` giúp:
- Dễ regex pattern phân biệt "phần phân loại" vs "id thực".
- Tránh nhầm khi user input chứa `:` lọt vào id.

**Đây là không bắt buộc**. Quy ước phổ biến nhất là chỉ dùng `:`. Nếu team bạn dự định dùng RediSearch nhiều, có thể cân nhắc `#`.

> Nội bộ Redis **không** phân biệt `:` và `#` — đó là quy ước con người. Bạn vẫn dùng được cả hai.

## Hash tag — `{...}` cho Redis Cluster

Khi lên **Redis Cluster** (sharding 16384 slot), một lệnh đa key (vd `MGET user:1:name user:1:role`) chỉ chạy nếu tất cả key cùng slot.

Mặc định slot tính từ **toàn bộ tên key**: `user:1:name` và `user:1:role` thường khác slot.

**Hash tag** giải quyết: nếu key chứa `{...}`, **chỉ phần trong ngoặc** được dùng để băm.

```text
user:{42}:name      → slot = CRC16("42") % 16384
user:{42}:role      → cùng slot
user:{42}:cart      → cùng slot
```

→ Mọi key thuộc user 42 nằm cùng node → `MGET`, `MSET`, `MULTI`, Lua đa key chạy được.

### Khi nào cần hash tag?

- Bạn **chắc** sẽ lên Cluster mode trong tương lai → thêm hash tag từ đầu.
- Feature có thao tác đa key trên cùng entity (MSET user fields, MGET user fields).
- **Không cần** nếu chạy standalone hoặc dùng phương án Sentinel.

### Trade-off của hash tag

- Mọi key cùng `{42}` nằm cùng 1 node → user 42 "nóng" sẽ tạo hot shard.
- Phân bố không đồng đều nếu id của bạn không random tốt (vd toàn user mới có id liên tiếp).

→ Cân nhắc khi thiết kế: thường an toàn nhất là dùng hash tag **chỉ cho id thực** (user id, order id), không cho field gộp.

## Đặt tên key — checklist trước khi commit

| Câu hỏi | OK | Không OK |
|---|---|---|
| Unique? | `cache:page:about` | `page` |
| Có namespace? | `arb:rate:user:42:60s` | `rate:42` |
| Engineer khác hiểu? | `lock:order:1234` | `lock_x_1234` |
| Có `:` phân cách? | `user:42:profile` | `userprofile42` |
| Hash tag (nếu Cluster)? | `user:{42}:*` | `user:42:*` |
| Không quá dài? (~ < 100 byte) | OK | `application:production:feature:caching:page:rendering:html:home:user:42:session:abc:created:at:2025...` |
| Tránh whitespace/control char? | OK | `cache page #home` |

## Tránh các pattern hay sai

### 1. Key dynamic không có namespace
```text
SET 42 "data"        # số đơn không cho biết nó là gì
SET "abc" "data"     # tương tự
```
→ Thêm namespace: `user:42`, `session:abc`.

### 2. Đặt cùng tên cho kiểu khác nhau
```text
SET stat:views 100              # String
ZADD stat:views ...             # Sorted set — WRONGTYPE
```
→ Phân biệt: `stat:views:count` (string), `stat:views:rank` (zset).

### 3. Tên key có whitespace / unicode rủi ro
```text
SET "user 42" "data"
```
→ Phải quote khắp nơi, đau đầu. Tránh.

### 4. Lưu mật khẩu/secret trong key name
```text
SET "session:user:42:pwd-abc123" "..."     # SAI: password lộ qua key name
```
→ Password chỉ trong value, key dùng hash/uuid không reverse được.

### 5. Key cực dài
```text
SET "data:my-app-name:v2:env-prod:feature-x:type-cache:..." "val"
```
→ Mỗi key tốn memory cho cả tên. Với hàng triệu key, tên dài thêm 100 byte = 100 MB phí. Giữ tên < 50 byte khi có thể.

## Sinh key bằng function — chống typo

**Đây là technique quan trọng** áp dụng từ ngày đầu code. Đừng viết key dạng string raw trong nhiều file:

❌ **Cách viết dễ typo**:

```ts
// page-cache.ts
await client.set('pageCache#' + route, html, { EX: 60 });

// somewhere-else.ts
await client.get('pageCach#' + route);   // ← TYPO! "pageCach" thiếu chữ "e"
// → null, debugging nhiều giờ
```

✅ **Cách đúng — function tập trung**:

```ts
// keys.ts
export const pageCacheKey = (id: string) => `pageCache#${id}`;
export const userKey = (id: string) => `user#${id}`;
export const sessionKey = (id: string) => `session#${id}`;
export const lockKey = (resource: string) => `lock:${resource}`;
export const rateKey = (uid: string, minute: number) => `rate#${uid}:${minute}`;
```

```ts
// page-cache.ts
import { pageCacheKey } from '../keys';

await client.set(pageCacheKey(route), html, { EX: 60 });

// somewhere-else.ts
import { pageCacheKey } from '../keys';

await client.get(pageCacheKey(route));   // ← KHÔNG thể typo, TypeScript check
```

### Lợi của pattern này

1. **Zero typo**: tên function được autocomplete; sai tên → compile error.
2. **Đổi convention một chỗ**: muốn đổi từ `pageCache#x` sang `cache:page:x` → sửa 1 dòng trong `keys.ts`.
3. **Documentation tự nhiên**: file `keys.ts` là **bản đồ data** của app — đọc nó là biết app dùng những key gì.
4. **TypeScript validation**: ép kiểu argument (`id: string`).
5. **Dễ test**: mock `keys.ts` để inject test key trong unit test.

### File `keys.ts` cuối cùng sẽ trông như

```ts
// src/services/keys.ts

// Cache
export const pageCacheKey = (route: string) => `pageCache#${route}`;

// Users
export const userKey       = (id: string) => `users#${id}`;
export const userSessionsKey = (id: string) => `users#${id}:sessions`;
export const usernameToIdKey = (name: string) => `usernames:${name}`;

// Items / auctions
export const itemKey       = (id: string) => `items#${id}`;
export const itemBidsKey   = (id: string) => `items#${id}:bids`;
export const itemViewsKey  = (id: string) => `items#${id}:views`;

// Sessions
export const sessionKey    = (id: string) => `sessions#${id}`;

// Leaderboards
export const leaderboardKey = (period: string) => `leaderboard:${period}`;

// Locks
export const lockKey       = (resource: string) => `lock:${resource}`;

// Rate limiting
export const rateLimitKey  = (uid: string, window: string) =>
  `rate:${uid}:${window}`;
```

> Cuối khoá, file này thường có 20-50 entries. Mỗi entry tương ứng một loại key trong app.

## Tổng hợp: bộ key cho app RB

Sau khi áp dụng convention:

| Mục đích | Key | Kiểu | TTL |
|---|---|---|---|
| Cache HTML trang | `pageCache#/about` | String | 2-60s (dev/prod) |
| User profile | `users#42` | Hash | — |
| Username → user id | `usernames:alice` | String | — |
| User session | `sessions#abc-123` | Hash | 24h |
| Auction info | `items#7` | Hash | — |
| Bid của 1 auction | `items#7:bids` | Sorted Set | — |
| View counter | `items#7:views` | String (INCR) | — |
| Leaderboard | `leaderboard:wins:2025-01` | Sorted Set | reset theo tháng |
| Lock thanh toán | `lock:order:1234` | String | 30s |
| Rate limit | `rate:42:2025-01-15T14:32` | String (INCR) | 60s |

## Tóm tắt bài 4

- Pattern chuẩn: `entity:identifier[:subfield]` với dấu `:`.
- **Quy ước cộng đồng** — đừng đảo ngược trừ khi có lý do.
- Variant `#` để đánh dấu unique id (cho RediSearch sau).
- **Hash tag `{}`** cho Cluster — cân nhắc từ đầu nếu sẽ scale ngang.
- **File `keys.ts`** tập trung mọi key — chống typo, dễ refactor, là bản đồ data.
- Avoid: tên trùng kiểu khác, tên có whitespace/secret, tên cực dài.

**Bài kế tiếp** → [Bài 5: Implement page caching — code thực tế](05-implement-page-caching.md)

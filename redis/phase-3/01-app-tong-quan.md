# Bài 1: Tổng quan app E-Commerce — sân chơi cho phần còn lại của khoá

Học lệnh đơn lẻ chỉ đủ "biết". Để **master Redis**, ta phải dùng nó trong một ứng dụng thật, với các feature liên kết: cache, session, search, leaderboard, real-time bid... Bài này giới thiệu app sẽ là **sân chơi** xuyên suốt các phase còn lại.

## "RB" — Redis eBay

App tên gọi `RB` (Red-Bay), mô phỏng eBay theo dạng **đấu giá**:
- Người bán tạo "auction" cho một sản phẩm.
- Người mua đặt giá thầu (bid) trong thời gian đấu giá mở.
- Khi đấu giá kết thúc, người bid cao nhất thắng.

Đây là loại app **đặt nặng real-time, throughput cao**, dùng tối đa các data structure Redis:

| Feature trong app | Data structure Redis |
|---|---|
| Cache trang HTML | String + TTL |
| Session đăng nhập | Hash + TTL |
| Profile user, sản phẩm | Hash |
| Bid history của một auction | List hoặc Stream |
| Top sản phẩm đang hot, leaderboard người bán | Sorted Set |
| Tag/category của sản phẩm | Set |
| Đếm view, like | INCR (String) |
| Search sản phẩm | RediSearch |
| Notification real-time bid mới | Pub/Sub hoặc Stream |
| Daily active users | Bitmap / HyperLogLog |
| Chống bid trùng / atomic decrement inventory | INCR + Lua |
| Distributed lock cho thanh toán | SET NX EX |
| Geosearch shop gần | Geospatial |

→ Đến hết khoá, bạn sẽ implement tất cả những thứ trên.

## Stack công nghệ

Khoá gốc dùng **TypeScript + SvelteKit** (Node.js):

| Layer | Tech |
|---|---|
| Frontend | SvelteKit (server-side rendering) |
| Backend (chung process với front nhờ SvelteKit) | Node.js + TypeScript |
| Redis client lib | `node-redis` (chính chủ Redis Inc.) |
| Redis | Redis Cloud free hoặc Redis Docker local |

> Đừng quá lo lắng về TypeScript/SvelteKit. **Mọi bài học là về Redis**, không phải framework. Logic sẽ "translate" 1-1 sang Python, Java, Go, Rust, PHP... vì client lib các ngôn ngữ có API cực giống nhau (xem [Bài 2](02-redis-client-libraries.md)).

### Cấu trúc thư mục dự án `arb`

Dự án có 2 thư mục quan trọng bạn sẽ thường xuyên đụng:

```text
arb/
├── src/
│   └── services/
│       ├── queries/         ← FILE CHÍNH bạn sẽ sửa
│       │   ├── page-cache.ts        (caching layer)
│       │   ├── users.ts             (CRUD user)
│       │   ├── items.ts             (CRUD item/auction)
│       │   ├── bids.ts              (bid logic)
│       │   ├── sessions.ts          (đăng nhập)
│       │   ├── ...
│       │   └── keys.ts              (key naming helper — quan trọng!)
│       └── redis/
│           └── client.ts            (khởi tạo client Redis)
├── .env                     ← cấu hình host/port/password
└── package.json
```

Phần lớn file `queries/*.ts` có **các function rỗng** chờ bạn implement. Phase-3 này sẽ làm file `page-cache.ts` và `keys.ts`.

## Server-side rendering — vì sao cần cache?

SvelteKit dùng **server-side rendering (SSR)**: mỗi request, server **chạy code** để sinh HTML rồi trả về.

```text
Browser → /privacy → SvelteKit server
                       │
                       │  1. Match route → component PrivacyPage.svelte
                       │  2. Run server-side code (data fetch, transform)
                       │  3. Render Svelte → HTML
                       │  4. Send HTML back
                       ▼
                     Browser hiển thị
```

Bước 2-3 có thể **chậm** (10-200 ms tuỳ logic). Nếu trang **không đổi giữa các user** (vd `/about`, `/privacy`), ta render 1 lần → cache HTML → request sau trả thẳng từ Redis.

### Hiệu quả mong đợi

Một request render HTML cho trang static `/about`:
- Không cache: ~50 ms (mỗi user, mỗi lần truy cập)
- Có cache Redis: ~1-2 ms (đọc string từ Redis)

→ Throughput tăng **~25x**, latency p99 giảm tương ứng. CPU server giảm ~95% cho route đó.

## Cài đặt nhanh app

### 1. Cài Node.js
[nodejs.org](https://nodejs.org) — chọn LTS (mới nhất ổn định).

### 2. Tải source và cài dependencies

```bash
unzip arb.zip
cd arb
npm install
```

> Sẽ có vài cảnh báo `npm audit` về moderate vulnerabilities. **KHÔNG** chạy `npm audit fix` — sẽ làm hỏng app. Cảnh báo này thường là dependency transitive không ảnh hưởng runtime.

### 3. Cấu hình `.env`

Mở file `.env` ở root project. Bạn sẽ thấy:

```bash
REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=
```

Điền từ Redis Cloud Console (xem [Phase-1 bài 4](../phase-1/04-setup-redis-cloud.md)):

```bash
REDIS_HOST=redis-12345.c14.us-east-1-2.ec2.cloud.redislabs.com
REDIS_PORT=12345
REDIS_PASSWORD=your-32-char-password
```

Hoặc nếu chạy Redis local Docker:

```bash
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### 4. Chạy app dev

```bash
npm run dev
```

Mở `http://localhost:3000` → thấy giao diện app. **Nhưng** hầu hết feature chưa hoạt động: search trả về loading mãi, sign in/sign up không phản hồi, dashboard trống...

→ **Đó là việc của bạn**: implement các function Redis trong `src/services/queries/*` để app sống lại.

## Roadmap các feature ta sẽ implement

Phase-3 trở đi, mỗi phase sẽ thêm một mảng feature:

| Phase | Feature | Data structure chính |
|---|---|---|
| **Phase-3** (đang ở đây) | Page caching | String + TTL |
| Phase-4 (= S05) | User profile, item info | Hash |
| Phase-5 (= S06) | Các "gotcha" Redis | — (lý thuyết) |
| Phase-6 (= S07) | Design pattern phổ biến | Tổng hợp |
| Phase-7 (= S08) | Pipelining | Optimization |
| Phase-8 (= S09) | Unique constraint với Set | Set |
| Phase-9 (= S10) | Implement Set thủ công | (học sâu) |
| Phase-10 (= S11) | Leaderboard, ranking | Sorted Set |
| Phase-11 (= S12) | Thêm pattern Sorted Set | Sorted Set |
| Phase-12 (= S13) | Migrate từ SQL sang Redis | Tổng hợp |
| Phase-13 (= S14) | Unique counter | HyperLogLog |
| Phase-14 (= S15) | Activity feed, message inbox | List |
| Phase-15 (= S16) | Practice tổng hợp app | Mixed |
| Phase-16 (= S17) | Lua scripting | EVAL |
| Phase-17 (= S18) | Concurrency, transaction, lock | MULTI/WATCH, RedLock |
| Phase-18 (= S19) | Full-text search | RediSearch |
| Phase-19 (= S20) | Search trong action | RediSearch |
| Phase-20 (= S21) | Event-driven messaging | Stream |

→ Hết khoá, bạn đã chạm gần như **mọi tính năng quan trọng** của Redis.

## Một dòng quan trọng cho phần còn lại

Trước khi bắt tay code, có **một câu khẩu quyết** quan trọng nhất khoá học:

> **Trong Redis, hãy bắt đầu từ câu hỏi: "Tôi cần truy vấn dữ liệu như thế nào?"**
>
> Sau khi trả lời rõ ràng, mới chọn data structure và viết lệnh.

Đây là **Redis Design Methodology** — sẽ là chủ đề [Bài 3](03-redis-design-methodology.md). Khác hoàn toàn với SQL "đặt data vào table rồi viết query linh hoạt sau".

## Tóm tắt bài 1

- App RB = eBay-style auction, dùng Node.js + SvelteKit + node-redis.
- Mọi function Redis bạn cần viết nằm trong `src/services/queries/*.ts`.
- Cấu hình `.env` với host/port/password Redis Cloud.
- Mục tiêu phase-3: implement page caching cho các trang static.
- Bài học cốt lõi sẽ rút ra: **query-first design** thay vì **schema-first**.

**Bài kế tiếp** → [Bài 2: Redis client library — khác biệt với ORM SQL](02-redis-client-libraries.md)

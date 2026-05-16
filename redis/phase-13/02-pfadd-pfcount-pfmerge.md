# Bài 2: PFADD, PFCOUNT, PFMERGE chi tiết + thuật toán

Bài 1 giới thiệu HLL ở mức khái niệm. Bài này đi sâu vào từng lệnh, hiểu nguyên lý hash → bucket → max-leading-zeros, biết khi nào sai số xuất hiện, và pattern multi-day HLL aggregation.

## PFADD chi tiết

```text
PFADD key element [element ...]
```

Add element vào HLL. Auto-create HLL nếu key chưa tồn tại.

```text
PFADD page:views:2026-01-15 user_42
(integer) 1
```

### Return value

- **1**: HLL state thay đổi (đăng ký new "observation").
- **0**: state không đổi (element có vẻ đã có hoặc hash collision với element cũ).

→ Return value **không đảm bảo** "đây là lần đầu add element". Probabilistic.

Cụ thể:
- Element thật mới + hash của nó không đụng register cao nhất → return 1.
- Element thật mới + hash đụng register cao nhất với element cũ → return 0 (false negative).
- Element trùng → return 0.

→ Đừng tin tuyệt đối return value cho "isNew" check. Nếu cần chắc, vẫn dùng Set + SISMEMBER.

### Add nhiều element

```text
PFADD page:views user1 user2 user3 user4
(integer) 1
```

Trả 1 nếu **ít nhất 1** element làm state thay đổi.

O(N) với N = số element add.

### Add 0 element — tạo HLL rỗng

```text
PFADD page:views
(integer) 1            # tạo HLL rỗng
EXISTS page:views
(integer) 1
PFCOUNT page:views
(integer) 0
```

→ Useful để pre-create HLL trước khi dùng (vd init cho item mới).

## PFCOUNT chi tiết

### Single key

```text
PFCOUNT page:views
(integer) 1247
```

O(1). Trả estimate.

### Multiple keys — union count

```text
PFCOUNT dau:2026-01-15 dau:2026-01-16 dau:2026-01-17
(integer) 5_000_000
```

Tính count của **union** virtual (không tạo merged key). O(N) với N = số HLL keys.

→ Hữu ích: tính WAU/MAU mà không cần lưu merged HLL.

### Trên Cluster

Multi-key PFCOUNT cần mọi key cùng slot. Hash tag:

```text
PFCOUNT {dau}:2026-01-15 {dau}:2026-01-16 {dau}:2026-01-17
```

## PFMERGE chi tiết

```text
PFMERGE destination key [key ...]
```

Lưu HLL union vào `destination` (overwrites). O(N) với N = số HLL.

```text
PFMERGE wau:2026-W03 dau:2026-01-13 dau:2026-01-14 ... dau:2026-01-19
OK

PFCOUNT wau:2026-W03
(integer) 5_000_000      # WAU count
```

### Khác PFCOUNT multi-key

| | PFCOUNT multi-key | PFMERGE |
|---|---|---|
| Tạo key mới | KHÔNG | CÓ |
| Trả về | count | "OK" |
| Lần sau dùng | phải tính lại | đọc instant |

→ PFMERGE khi cần re-query nhiều lần (cache materialized view).

### Pattern aggregation pyramid

```text
hour:2026-01-15T14   # HLL theo giờ
hour:2026-01-15T15
...

day:2026-01-15       # merge 24 hour HLLs
day:2026-01-16
...

week:2026-W03        # merge 7 day HLLs
week:2026-W04
...

month:2026-01        # merge 30 day HLLs
```

Cron daily:
```ts
const hours = lastNHours(24);
const hourKeys = hours.map((h) => `hour:${h}`);
await client.pfMerge(`day:${today}`, ...hourKeys);
```

Cron weekly:
```ts
const days = lastNDays(7);
const dayKeys = days.map((d) => `day:${d}`);
await client.pfMerge(`week:${currentWeek}`, ...dayKeys);
```

→ Query "MAU last month" = `PFCOUNT month:2026-01`. Instant.

## Thuật toán HyperLogLog — hiểu sơ

Không cần code lại. Nhưng hiểu sơ giúp trust và debug.

### Nguyên lý

1. Hash element thành chuỗi bit (vd 64 bit).
2. Dùng N bit đầu (default 14 bit → 16384 bucket) làm **bucket index**.
3. Đếm số "leading zeros" trong các bit còn lại + 1.
4. Trong bucket đó, lưu **max** leading zeros từng thấy.
5. Combined max của 16384 bucket → estimate count.

Trực giác:
- Element được hash random → bit pattern uniform.
- "Leading zeros = N" xuất hiện với xác suất 1/2^N.
- Nếu đã thấy bit pattern "00000001" (7 leading zeros) → đã có ≥ 128 unique element.
- Stats trên 16384 bucket → estimate chính xác hơn.

### Memory analysis

16384 bucket × 6 bit/bucket = 12288 bit = 12 KB.

6 bit cho mỗi bucket = đếm tới 63 leading zeros = đủ cho 2^63 ≈ 10^19 unique element.

→ 1 HLL count được tới **gần infinity** với 12 KB.

### Sai số

Standard error = 1.04 / sqrt(num_buckets) = 1.04 / sqrt(16384) ≈ 0.81%.

Tăng số bucket → giảm sai số nhưng tăng memory. Redis chọn 16384 = sweet spot.

## Pattern thực tế

### DAU/WAU/MAU

```ts
function dauKey(date: string) { return `dau:${date}`; }
function wauKey(week: string) { return `wau:${week}`; }
function mauKey(month: string) { return `mau:${month}`; }

async function trackVisit(userId: string) {
  const today = todayString();   // "2026-01-15"
  await client.pfAdd(dauKey(today), userId);
}

async function getDAU(date: string) {
  return await client.pfCount(dauKey(date));
}

async function getWAU(weekId: string, days: string[]) {
  // Compute trên-the-fly:
  return await client.pfCount(...days.map(dauKey));
  
  // Hoặc pre-computed:
  // return await client.pfCount(wauKey(weekId));
}

// Cron: pre-compute weekly
async function rollupWeekly() {
  const week = currentWeek();
  const days = lastNDays(7);
  await client.pfMerge(wauKey(week), ...days.map(dauKey));
}
```

### Unique IP tracking

```ts
async function trackRequest(ip: string, endpoint: string) {
  const today = todayString();
  await client.pfAdd(`unique_ips:${endpoint}:${today}`, ip);
}

async function getDistinctIPs(endpoint: string, date: string) {
  return await client.pfCount(`unique_ips:${endpoint}:${date}`);
}
```

→ Đếm unique IP per endpoint per day mà không lưu IP. Hợp privacy.

### Distinct search queries

```ts
async function trackSearch(query: string) {
  await client.pfAdd(`searches:${todayString()}`, query.toLowerCase().trim());
}

async function getDistinctSearches(date: string) {
  return await client.pfCount(`searches:${date}`);
}
```

## So sánh với Bitmap cho unique counting

Bitmap (phase-2 bài 6) cũng đếm unique:

```text
SETBIT visit:2026-01-15 1001 1     # user 1001 visit
BITCOUNT visit:2026-01-15           # count
```

Bitmap requirements:
- User ID **integer dense** (1, 2, 3, ..., N).
- Memory: N bit / day. 1M user → 125 KB/day.

HLL requirements:
- User ID **bất kỳ string** (UUID, email, hash).
- Memory: 12 KB cố định.
- Sai số 0.81%.

**Bitmap thắng khi**: user ID integer dense, cần precision.
**HLL thắng khi**: user ID UUID/string, sai số acceptable, hoặc cần merge unions efficient.

App RB dùng UUID → HLL phù hợp hơn Bitmap.

## Bẫy thường gặp

### 1. Mixing PFADD và Set commands

```text
SADD viewers user1
PFADD viewers user2
# WRONGTYPE - viewers là Set, không phải HLL
```

→ Key 1 type duy nhất. Không mix.

### 2. Đếm khi HLL chưa tồn tại

```text
PFCOUNT nonexistent_key
(integer) 0          # không error, trả 0
```

Khác `EXISTS` (trả 0). PFCOUNT graceful.

### 3. PFMERGE destination cũ

```text
PFADD existing user1 user2 user3
PFCOUNT existing → 3

PFMERGE existing source1 source2
PFCOUNT existing → 100   # đã merge, count thay đổi
```

PFMERGE **không reset** dest. Element từ dest cũ vẫn tính. Nếu cần fresh merge:
```text
DEL existing
PFMERGE existing source1 source2
```

### 4. Mong PFCOUNT trả con số chính xác cho audit

```ts
const total = await client.pfCount('paid_users');
billing.invoice(total);    // BUG — sai số 0.81%
```

→ Cho audit, dùng counter chính xác. HLL chỉ cho metrics/analytics.

## Tóm tắt bài 2

- **PFADD**: thêm element, return 1/0 probabilistic.
- **PFCOUNT**: count single hoặc multi-key (union virtual).
- **PFMERGE**: lưu union vào dest mới.
- Aggregation pyramid: hour → day → week → month → pre-compute.
- Thuật toán: hash → bucket → max-leading-zeros → estimate.
- Sai số 0.81% là tỷ lệ, không offset cố định.
- KHÔNG mix PFADD với SADD trên cùng key.

**Bài kế tiếp** → [Bài 3: HLL trong app RB — unique view counter](03-hll-trong-app-rb.md)

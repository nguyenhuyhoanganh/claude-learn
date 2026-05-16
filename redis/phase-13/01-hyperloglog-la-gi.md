# Bài 1: HyperLogLog là gì?

Đến **HyperLogLog** (HLL) — kiểu dữ liệu probabilistic độc đáo của Redis. Tên hơi lạ, chức năng siêu chuyên dụng: **đếm số phần tử unique xấp xỉ** trong một tập, với memory cố định **12 KB** bất kể có bao nhiêu phần tử.

Nghe có vẻ phép thuật. Nhưng có cái giá: sai số ~0.81%.

## Bài toán

Ở phase-9 ta giải "unique view per item" bằng Set:

```text
viewers:item#42 → Set {user_id_1, user_id_2, ..., user_id_N}
```

Mỗi user_id ~30 byte. Item có 1M unique viewer → set ~30 MB.

10k item phổ biến × 30 MB = **300 GB**. Không feasible cho 1 instance.

## HyperLogLog giải bài này

Thay Set bằng HLL:

```text
PFADD viewers:item#42 user_id_1
PFADD viewers:item#42 user_id_2
...
PFCOUNT viewers:item#42 → ~999850 (gần đúng 1M)
```

Memory: **12 KB / HLL bất kể có 1, 1M, hay 1 tỷ phần tử**.

10k item × 12 KB = **120 MB**. Giảm **2500x** so với Set.

Trade-off: sai số ~0.81%.

## "Probabilistic" — nghĩa là gì?

HLL không lưu phần tử thật. Nó dùng một thuật toán toán học (Flajolet-Martin / HyperLogLog) để **estimate** số unique từ các "hash signature" của phần tử.

Hash signature là vài bit/element, lưu trong 16384 bucket. Mỗi bucket giữ "max leading zeros" của các hash đi qua nó. Combined statistics → estimate count.

> Chi tiết thuật toán đáng đọc nhưng vượt scope. Quan trọng: hiểu **HLL không thể trả về phần tử**, chỉ trả **count xấp xỉ**.

## So sánh Set vs HLL

| | Set | HyperLogLog |
|---|---|---|
| Memory | ~30 byte/element | **12 KB cố định** |
| `count` | O(1) — `SCARD` | O(1) — `PFCOUNT` |
| `add` | O(1) — `SADD` | O(1) — `PFADD` |
| `check member` | O(1) — `SISMEMBER` | **KHÔNG hỗ trợ** |
| `list members` | O(N) — `SMEMBERS` | **KHÔNG hỗ trợ** |
| `union` | O(N) | O(1) — `PFMERGE` |
| `intersect` | O(N) | **KHÔNG hỗ trợ** |
| Sai số | 0% | **~0.81%** |

→ HLL hi sinh "list" và "membership" để có memory siêu gọn + count nhanh.

## Khi nào dùng HLL — và khi nào KHÔNG

**Dùng HLL khi**:
- Cần count unique, sai số nhỏ acceptable.
- Memory quan trọng (vd millions of distinct counters).
- Không cần list members hoặc check "X có trong tập?".

**KHÔNG dùng HLL khi**:
- Cần biết "user X đã ở đây chưa?" (không có membership check).
- Cần list các phần tử.
- Cần count chính xác tuyệt đối (tiền, billing, audit).
- Tập nhỏ (<10k items) — set rẻ hơn 12KB cố định.

## Use case thực tế

| Use case | Lý do dùng HLL |
|---|---|
| Daily Active Users (DAU) — unique visitor/ngày | 100M+ user, sai số 0.81% acceptable |
| Unique IP/request per endpoint | Hàng tỷ request, memory cố định |
| Unique words trong stream text | Stream lớn, không thể lưu hết |
| Unique search queries trong tháng | Analytics, không cần list |
| Page view unique per article | App RB use case (sẽ làm bài 3) |

## 2 lệnh chính

HLL chỉ có **3 lệnh** (so với 25 cho Sorted Set):

```text
PFADD key element [element ...]      # thêm element vào HLL
PFCOUNT key [key ...]                # đếm unique (có thể merge nhiều HLL)
PFMERGE destination key [key ...]    # merge nhiều HLL vào 1
```

`PF` viết tắt **Philippe Flajolet** — nhà toán học phát minh thuật toán HyperLogLog.

## PFADD

```text
PFADD vegetables celery
(integer) 1                      # mới thêm, HLL state thay đổi

PFADD vegetables celery
(integer) 0                      # đã có (probabilistic — không 100% đảm bảo)

PFADD vegetables carrot tomato cucumber
(integer) 1                      # ít nhất 1 mới
```

**Return value**: 1 nếu HLL state thay đổi (ít nhất 1 element mới), 0 nếu không. Có thể dùng làm "isNew" check — **không 100% chính xác** do hash collision.

## PFCOUNT

```text
PFCOUNT vegetables
(integer) 4
```

Single key: đếm unique trong HLL đó.

Multiple key: union virtual + count:
```text
PFADD set_a apple banana
PFADD set_b banana cherry
PFCOUNT set_a set_b
(integer) 3              # apple, banana, cherry
```

Tương đương `PFCOUNT(PFMERGE set_a, set_b)` không cần tạo merged key.

## PFMERGE

```text
PFMERGE all_vegs vegetables_2020 vegetables_2021 vegetables_2022
OK
PFCOUNT all_vegs
(integer) 1234
```

Lưu **HLL union** vào key mới. Memory dest vẫn 12 KB (không cộng dồn).

Use case: aggregate daily HLLs thành monthly:
```text
PFMERGE wau:2026-W03 dau:2026-01-13 dau:2026-01-14 ... dau:2026-01-19
PFCOUNT wau:2026-W03                          # WAU
```

## Sai số 0.81% — cụ thể thế nào?

Standard error của HLL = **0.81%** với cấu hình mặc định (16384 register).

Nghĩa là:
- Add 1000 unique → PFCOUNT trả 991-1009 (avg).
- Add 1M unique → trả 991k-1009k.
- Add 1B unique → trả 991M-1009M.

Sai số **tỷ lệ với count**, không phải fixed offset. Càng nhiều element, sai số tuyệt đối càng lớn, nhưng tỷ lệ giữ nguyên.

## Edge case: count nhỏ

Khi có < 100 unique, HLL có thể đếm **chính xác** (do thuật toán có "small-range correction"). Sai số chỉ xuất hiện khi count > vài trăm.

→ Với dataset nhỏ, HLL hoạt động như Set cho count, kèm memory cố định 12 KB.

## Memory chính xác

HLL trong Redis dùng **dense representation**: 12,304 byte (≈ 12 KB).

Sparse representation (khi ít element): chỉ vài chục byte. Khi vượt threshold, convert sang dense.

Cấu hình `hll-sparse-max-bytes` trong redis.conf (default 3000).

## Bẫy: nhầm với Set + SCARD

```ts
// SAI: nghĩ HLL có membership check
if (await client.sIsMember('viewers:item#42', userId)) {
  // ...
}
// SISMEMBER trên HLL → error WRONGTYPE
```

HLL **không phải set**. Lệnh SET không work với HLL key.

Nếu cần "X đã có chưa?" → dùng Set, không HLL.

## Bẫy: count chính xác cho compliance

```ts
const totalUsers = await client.pfCount('all_users');
// → 999874  (thực ra 1M, sai số 0.0126%)
```

Cho hiển thị "1M users" → OK.  
Cho audit financial / compliance / legal → KHÔNG.

→ Quyết định "sai số có acceptable không?" trước khi chọn HLL.

## Combine HLL + counter chính xác

Một pattern hybrid:

```ts
// HLL cho unique view (memory hiệu quả)
await client.pfAdd(`hll:item#${itemId}`, userId);
const uniqueViews = await client.pfCount(`hll:item#${itemId}`);

// Counter cho TOTAL view (bao gồm revisit)
await client.hIncrBy(itemKey(itemId), 'totalViews', 1);
```

UI hiển thị 2 số: "1234 unique views" (HLL) và "5678 total views" (counter). Mỗi cái có purpose riêng.

## Tóm tắt bài 1

- HLL = đếm unique **xấp xỉ** với **12 KB cố định**.
- Sai số ~**0.81%** standard error.
- Không có membership check, không list elements.
- 3 lệnh: `PFADD`, `PFCOUNT`, `PFMERGE`.
- Tiết kiệm hàng nghìn lần memory so với Set cho big dataset.
- Trade-off: dùng khi memory > precision; tránh khi cần exact count.

**Bài kế tiếp** → [Bài 2: PFADD, PFCOUNT, PFMERGE chi tiết + thuật toán](02-pfadd-pfcount-pfmerge.md)

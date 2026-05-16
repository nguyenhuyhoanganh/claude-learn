# Bài 1: Set là gì — kiểu dữ liệu thứ 4

Đã có String, Hash. Đến **Set** — kiểu thứ 4 quan trọng nhất. Set giải quyết 2 lớp bài toán mà String/Hash không làm tốt: **đảm bảo duy nhất** và **so sánh giữa các tập** (intersection, union, difference). Bài này định nghĩa Set, so sánh với cấu trúc khác, và preview các use case sẽ áp dụng cho app RB.

## Set là gì?

> **Set trong Redis là một tập hợp các string không thứ tự, không trùng lặp**, được tham chiếu qua một key.

3 tính chất quan trọng:

1. **Phần tử là string** (kể cả số được biểu diễn dạng string).
2. **Không trùng lặp**: mọi phần tử trong set là **duy nhất**. Thêm phần tử đã có → no-op.
3. **Không có thứ tự** (unordered): không có "phần tử đầu", "cuối". Khi lấy ra (`SMEMBERS`), thứ tự có thể khác giữa các lần.

```text
Redis keyspace
+-----------------------------------------+
|                                         |
|  colors  →  { "red", "green", "blue" }  |
|                                         |
|  tags:item#42  →  { "vintage", "wood" } |
|                                         |
|  likes:user#alice  →  { "5", "12", "7" }|
|                                         |
+-----------------------------------------+
```

## So sánh với cấu trúc khác

| Đặc tính | List | Set | Sorted Set | Hash |
|---|---|---|---|---|
| Trùng lặp | ✓ cho phép | ✗ không | ✗ không | (field unique trong 1 hash) |
| Thứ tự | Có thứ tự insertion | Không | Theo score | Không |
| `SADD/LPUSH` | O(1) | O(1) | O(log N) | O(1) |
| Kiểm tra "có/không" | O(N) — phải duyệt | O(1) — `SISMEMBER` | O(log N) | O(1) — `HEXISTS` |
| Use case chính | Queue, log, history | Tag, unique check, intersection | Ranking, leaderboard | Object |

→ **Set ưu việt khi cần "membership check" nhanh và "không trùng" tự động.**

## Equivalent ở các ngôn ngữ

| Ngôn ngữ | Tương đương |
|---|---|
| Python | `set()` (kiểu built-in) |
| Java | `HashSet<String>` |
| JavaScript | `new Set()` (ES6+) |
| C# | `HashSet<string>` |
| Go | `map[string]struct{}` (idiom) |

Concept giống hệt: tập không trùng, check membership O(1).

## Naming convention cho lệnh Set

Mọi lệnh Set bắt đầu bằng **`S`**:

```text
SADD    SREM    SMEMBERS    SISMEMBER    SCARD    SSCAN
SUNION  SINTER  SDIFF       SUNIONSTORE  SINTERSTORE   SDIFFSTORE
SPOP    SRANDMEMBER         SMOVE        SMISMEMBER
```

Tổng ~20 lệnh. Bài này và 4 bài tiếp sẽ học các lệnh chính.

## SADD — thêm phần tử

```text
SADD key element [element ...]
```

```text
SADD colors red
(integer) 1            # 1 phần tử mới được thêm

SADD colors red
(integer) 0            # red đã có → no-op

SADD colors green blue
(integer) 2            # thêm 2 phần tử mới

SADD colors green orange
(integer) 1            # green đã có; chỉ orange là mới
```

**Return value**: số phần tử **thực sự được thêm** (không tính trùng).

Tính chất:
- **Auto-tạo set** khi key chưa tồn tại.
- **O(1) trung bình** cho mỗi phần tử (hash table internally).
- **Atomic** — thêm nhiều phần tử cùng atomic block.

## SMEMBERS — lấy tất cả phần tử

```text
SMEMBERS colors
1) "red"
2) "blue"
3) "green"
4) "orange"
```

**Cảnh báo big set**: `SMEMBERS` trả tất cả trong 1 lệnh, **O(N)**. Set 100k phần tử → reply hàng MB, chặn event loop. Dùng `SSCAN` thay (bài 4).

## SCARD — đếm số phần tử

```text
SCARD colors
(integer) 4
```

O(1) — Redis lưu cached count.

→ Đếm "số like" của item: `SCARD likes:item#42` cực nhanh, không cần duyệt.

## SREM — xoá phần tử

```text
SREM colors orange
(integer) 1

SREM colors orange
(integer) 0            # không còn để xoá

SREM colors red green nonexistent
(integer) 2            # xoá 2 (nonexistent không tính)
```

**Khi xoá phần tử cuối → set tự xoá luôn (key biến mất)**. Same quirk như Hash.

## SISMEMBER — check có không

```text
SISMEMBER colors red
(integer) 1

SISMEMBER colors purple
(integer) 0
```

**O(1)**. Đây là **operation cốt lõi** của Set — kiểm tra membership.

→ "User X đã like item Y chưa?":
```text
SISMEMBER likes:item#Y X
```
O(1) bất kể có 1M người like.

## SMISMEMBER — check nhiều phần tử cùng lúc (Redis ≥ 6.2)

```text
SMISMEMBER colors red purple blue
1) (integer) 1     # red có
2) (integer) 0     # purple không
3) (integer) 1     # blue có
```

Tiết kiệm RTT khi cần check nhiều. Vd "user đã like những item nào trong 20 item hiển thị?":
```text
SMISMEMBER likes:user#alice item#1 item#2 ... item#20
```
1 RTT cho 20 check.

## Cấu trúc nội bộ — intset vs hashtable

Redis tối ưu encoding của set tuỳ nội dung:

| Encoding | Khi nào | Đặc điểm |
|---|---|---|
| **intset** | Tất cả phần tử là integer, ≤ 512 phần tử | Mảng sắp xếp, binary search O(log N), cực gọn |
| **listpack** (≥ 7.2) | Phần tử string nhỏ, ≤ 128 phần tử | Lưu nén liên tục |
| **hashtable** | Lớn hơn ngưỡng | Hash table thật, O(1) |

Cấu hình trong `redis.conf`:
```conf
set-max-intset-entries 512
set-max-listpack-entries 128
set-max-listpack-value 64
```

Kiểm tra:
```text
OBJECT ENCODING colors
"listpack"
```

→ Set nhỏ rất tiết kiệm memory. Một set tag 10 phần tử với listpack: ~100 byte. Cùng dữ liệu ở hashtable: ~500 byte. Redis tự chuyển khi vượt ngưỡng.

## Use case Set trong app RB

Quay lại 6 resource từ phase-6:

| Resource | Cấu trúc đã chọn | Lệnh Set sẽ dùng |
|---|---|---|
| **View** | Set của user_id đã view item | `SADD`, `SISMEMBER`, `SCARD` |
| **Like (user → items)** | Set item_id user đã like | `SADD`, `SREM`, `SMEMBERS`, `SCARD` |
| **Like (item → users)** | Set user_id đã like item | `SADD`, `SREM`, `SCARD` |
| **Username uniqueness** | Set tất cả username đã đăng ký | `SADD`, `SISMEMBER` |
| **Common likes** (intersection 2 user) | `SINTER` 2 set likes | `SINTER` |

→ **Set xuất hiện ở 5/6 feature**. Đây là kiểu dữ liệu **dùng nhiều thứ 2** sau Hash.

## Bốn use case kinh điển của Set

1. **Uniqueness enforcement**: tag, username, IP whitelist/blacklist.
2. **Membership check**: "user đã đọc bài này?", "IP có trong blocklist?".
3. **Relationship**: "user X follows những ai", "post Y được like bởi ai".
4. **Set operations**: union (gộp), intersection (cộng đồng chung), difference (khác biệt).

Mỗi cái 1 bài tiếp sau.

## Một set thường có bao nhiêu phần tử?

| App | Set | Kích thước |
|---|---|---|
| Tag của một bài viết | `tags:post#42` | 3-10 |
| User follow một celebrity | `followers:user#celeb` | 1M-100M |
| Banned IPs | `banned_ips` | 1k-100k |
| Item likes | `likes:item#popular` | 100-1M |
| Online users now | `online:users` | 1k-1M |

→ Quy mô **đa dạng**. Set 1M+ phần tử **vẫn nhanh** cho `SISMEMBER`, nhưng cần cẩn thận với `SMEMBERS`/`SUNION` (O(N) reply).

## Quirk: Set của number — vẫn là string

```text
SADD numbers 1 2 3
SISMEMBER numbers 1        # 1 (có)
SISMEMBER numbers "1"      # 1 (vẫn có — Redis so sánh string)
SISMEMBER numbers 01       # 0 (không — "01" khác "1")
```

Redis lưu byte. `1` và `01` là string khác nhau. Convention team: chuẩn hoá trước khi `SADD`.

## Lệnh đặc biệt — SPOP, SRANDMEMBER, SMOVE

Học nhanh:

```text
SRANDMEMBER colors            # trả 1 phần tử random, KHÔNG xoá
SRANDMEMBER colors 3          # trả 3 phần tử random không trùng
SRANDMEMBER colors -3         # trả 3 phần tử có thể trùng

SPOP colors                   # trả + XOÁ 1 phần tử random
SPOP colors 3                 # trả + xoá 3 phần tử

SMOVE source dest "red"       # chuyển "red" từ source sang dest, atomic
```

Use case ít gặp nhưng có khi cần:
- **SRANDMEMBER**: sampling, A/B test.
- **SPOP**: lottery draw (chọn người thắng và loại khỏi pool).
- **SMOVE**: chuyển user giữa các trạng thái (online → offline).

## Tóm tắt bài 1

- Set = tập string không thứ tự, không trùng, membership check O(1).
- 4 use case chính: uniqueness, membership, relationship, set operations.
- Lệnh bắt đầu bằng `S`: SADD, SREM, SMEMBERS, SISMEMBER, SCARD, SSCAN, S{UNION,INTER,DIFF}[STORE].
- Encoding nội bộ: intset (số) → listpack (nhỏ) → hashtable (lớn).
- Quirk: số lưu là string, "1" ≠ "01".
- Cảnh báo big set: `SMEMBERS` O(N), dùng `SSCAN`.

**Bài kế tiếp** → [Bài 2: Set operations — UNION, INTER, DIFF](02-union-inter-diff.md)

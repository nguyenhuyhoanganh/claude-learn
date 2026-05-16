# Bài 4: SISMEMBER, SSCAN — single-set operation an toàn

Bài 1 đã giới thiệu `SISMEMBER` và `SSCAN` ngắn gọn. Bài này đi sâu: vì sao `SISMEMBER` là **lệnh dùng nhiều nhất** trong production với Set, vì sao `SSCAN` thay thế `SMEMBERS` cho set lớn, và pattern paginated iteration.

## SISMEMBER — câu hỏi vàng

```text
SISMEMBER key member
```

Trả 1 nếu member có trong set, 0 nếu không. **O(1)**.

```text
SADD likes:item#42 user#1 user#2 user#3
SISMEMBER likes:item#42 user#1     # 1
SISMEMBER likes:item#42 user#99    # 0
```

### Vì sao là "lệnh vàng"?

Đa số use case Set thực ra là **check membership**:

- "User đã like item này chưa?" → SISMEMBER likes:item#X user#Y
- "IP có bị ban không?" → SISMEMBER banned_ips X.X.X.X
- "Email domain có whitelisted?" → SISMEMBER allowed_domains gmail.com
- "User đã đọc bài này?" → SISMEMBER read:user#X post#Y
- "User trong premium tier?" → SISMEMBER premium_users X

Mỗi cái là 1 RTT, O(1). Bất kể set lớn cỡ nào (1k hay 1M phần tử), tốc độ như nhau.

### So với cách "sai" — load set rồi check

```ts
// SAI
const members = await client.smembers(`likes:item#42`);
if (members.includes(userId)) { /* ... */ }
```

Vấn đề:
- `SMEMBERS` O(N) — load 1M phần tử = MB data.
- Client phải parse mảng lớn.
- `Array.includes` O(N) ở client.

vs:

```ts
// ĐÚNG
const exists = await client.sIsMember(`likes:item#42`, userId);
```

- O(1) ở server.
- Trả về 0 hoặc 1 — vài byte.

Pattern này áp dụng cho mọi cấu trúc có "check" version: `EXISTS` cho key, `HEXISTS` cho hash field, `SISMEMBER` cho set.

## SMISMEMBER — multi-check (Redis ≥ 6.2)

```text
SMISMEMBER key member [member ...]
```

Trả mảng cùng độ dài với member input.

```text
SMISMEMBER likes:item#42 user#1 user#99 user#2
1) (integer) 1
2) (integer) 0
3) (integer) 1
```

**Use case**: render carousel 20 item, biết user đã like item nào.

```ts
const userId = req.session.userId;
const itemIds = ['item#1', 'item#2', ..., 'item#20'];

// Cách cũ: 20 RTT
const liked: boolean[] = [];
for (const id of itemIds) {
  liked.push((await client.sIsMember(`likes:item#${id}`, userId)) === 1);
}

// Tốt hơn: 1 lệnh per item nhưng pipeline
const promises = itemIds.map((id) => client.sIsMember(`likes:item#${id}`, userId));
const liked = (await Promise.all(promises)).map((v) => v === 1);
// → 1 RTT, 20 lệnh
```

Nhưng SMISMEMBER **không phù hợp** ở đây vì là check 1 user trên **nhiều set khác nhau**. SMISMEMBER là check **nhiều user trên 1 set**:

```text
# "Trong 5 user này, ai đã like item#42?"
SMISMEMBER likes:item#42 user#1 user#2 user#3 user#4 user#5
1) 1
2) 0
3) 1
4) 0
5) 1
```

→ Mỗi use case nhỏ chọn đúng tool.

## SMEMBERS — chỉ với set nhỏ

```text
SMEMBERS key
```

Trả mảng tất cả phần tử. **O(N)**.

Khi nào OK:
- Set < 1k phần tử (tag, role, permission).
- Khi thật sự cần toàn bộ.

Khi nào không OK:
- Set > 10k phần tử ở production traffic.
- Chỉ cần check 1 phần tử (dùng SISMEMBER).

## SSCAN — iterate set lớn an toàn

```text
SSCAN key cursor [MATCH pattern] [COUNT count]
```

Iterate **theo page**, cursor-based — giống `SCAN` cho keyspace, `HSCAN` cho hash field.

### Workflow

```text
SSCAN big_set 0 COUNT 100
1) "73"                       # cursor tiếp theo
2) 1) "member1"
   2) "member2"
   ...
   100) "member100"

SSCAN big_set 73 COUNT 100
1) "145"                      # cursor mới
2) 1) "member101"
   ...

# ... lặp ...

SSCAN big_set 9001 COUNT 100
1) "0"                        # cursor 0 = hết
2) 1) "memberLast"
```

**Cursor `"0"` đầu vào** = bắt đầu. **Cursor `"0"` đầu ra** = kết thúc.

### Tính chất

- **Mỗi page nhỏ** — không chặn event loop.
- **COUNT là hint**: Redis có thể trả nhiều/ít hơn. Vd COUNT 100 có thể trả 50-200 phần tử thực.
- **Không đảm bảo không trùng giữa các page** — phần tử có thể xuất hiện nhiều lần qua nhiều page (hiếm, do rehashing).
- **Không đảm bảo "snapshot"** — phần tử thêm/xoá trong khi scan có thể hoặc không xuất hiện.

→ Use case "list tất cả" với set lớn. Không cho atomic snapshot.

### Implement trong Node.js

```ts
async function* iterateSet(key: string) {
  let cursor = '0';
  do {
    const { cursor: next, members } = await client.sScan(key, cursor, { COUNT: 100 });
    for (const m of members) yield m;
    cursor = next;
  } while (cursor !== '0');
}

// Dùng
for await (const member of iterateSet('big_set')) {
  console.log(member);
}
```

Hoặc dùng `client.sScanIterator(key)` (node-redis ≥ 4) — built-in async iterator.

### MATCH pattern

```text
SSCAN tags:posts 0 MATCH "tech*" COUNT 100
```

Chỉ trả phần tử match. **Lọc xảy ra sau scan**, COUNT không đảm bảo số match — có thể trả 0 dù COUNT 100.

→ Phải scan nhiều page để collect đủ. Hữu ích khi nhiều phần tử có prefix chung.

## SMEMBERS vs SSCAN — quyết định

| Set size | Lệnh nên dùng |
|---|---|
| < 1k | `SMEMBERS` (đơn giản) |
| 1k - 10k | `SMEMBERS` (vẫn OK trên local) |
| 10k - 100k | `SSCAN` ở production |
| > 100k | **Phải dùng** `SSCAN` |

Càng ngày càng nghiêng về SSCAN. Default code mới: SSCAN với set có khả năng lớn.

## SCARD — đếm O(1)

```text
SCARD likes:item#42
(integer) 1283
```

Đếm số phần tử, không cần duyệt. Redis lưu cached count.

Use case: hiển thị "1,283 likes" trên UI mà không tốn O(N).

## Bonus: SPOP với count

```text
SPOP set 5         # lấy + xoá 5 phần tử random (không trùng)
SPOP set 1         # lấy + xoá 1 (= SPOP set)
SPOP set           # lấy + xoá 1
```

Use case ít gặp:
- Lottery: chọn N người thắng từ pool.
- Rate limit "token bucket" thủ công.

## Bonus: SMOVE giữa 2 set

```text
SMOVE source dest "x"
```

Atomic chuyển "x" từ source sang dest. Trả 1 nếu thành công, 0 nếu "x" không có ở source.

Use case:
- Workflow state: `pending` → `processing` → `done`.
- Online status: `online` → `offline` khi disconnect.

## Tóm tắt bài 4

- **SISMEMBER**: lệnh dùng nhiều nhất cho Set — O(1) check membership.
- **SMISMEMBER**: check nhiều phần tử trên 1 set — 1 RTT.
- **SMEMBERS** chỉ dùng cho set nhỏ — set lớn dùng **SSCAN** paginated.
- **SCARD**: đếm O(1) — không cần duyệt.
- Khi viết code: prefer SISMEMBER hơn SMEMBERS-then-filter ở client.

**Bài kế tiếp** → [Bài 5: Use case kinh điển của Set + áp vào app RB](05-use-cases-va-app-rb.md)

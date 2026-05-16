# Bài 2: Chọn data type Redis cho từng resource

Đã liệt 6 resource cần lưu: **User, Session, Item, Bid, View, Like**. Bài này áp dụng một **decision framework** để chọn data type Redis phù hợp cho từng cái. Cách tiếp cận này áp dụng được cho mọi app Redis sau này.

## Framework: 4 dấu hiệu cho thấy nên/không nên dùng Hash

Sau khi học Hash ở phase-4, ta thấy nó cực phù hợp khi data có shape của một **record/object**. Đây là 4 dấu hiệu để nhanh chóng quyết định:

### Nên dùng Hash khi:

1. **Record có nhiều thuộc tính** (≥ 3 field). Vd: user (name, email, password, role, ...), item (title, image, price, description, ...).
2. **Truy cập một record tại một thời điểm** là use case phổ biến. Vd: trang `/items/:id` cần đầy đủ thông tin 1 item.
3. **Cần sort/filter một collection record theo nhiều tiêu chí**. Vd: dashboard sort by name/price/views/...

### KHÔNG nên dùng Hash khi:

1. **Record chỉ dùng cho accounting / uniqueness check** (vd: Likes — chỉ care "ai like", count, không có nhiều field).
2. **Record có 1-2 thuộc tính** (vd: counter đơn).
3. **Quan hệ relational thuần** (vd: user → list of liked items — quan hệ, không phải object).
4. **Time-series data** (snapshot 1-2 giá trị theo thời gian — vd: lịch sử bid).

→ Không có dấu hiệu nào là tuyệt đối. Áp dụng cảm tính kèm test giả tưởng "query nào sẽ chạy".

## Áp framework cho 6 resource

### Resource 1: User

| Câu hỏi | Trả lời |
|---|---|
| Nhiều thuộc tính? | ✓ username, password, email, created_at, ... |
| Truy cập 1 record tại một thời điểm? | ✓ login, profile page xem 1 user |
| Sort/filter collection? | Không thực sự cần (admin có thể có sort nhưng app này không) |
| Accounting/unique-check thôi? | ✗ — có nội dung thực |

→ **Hash**. Key pattern: `users#<user_id>`. Mỗi user là một hash với field {username, password, ...}.

```text
users#abc-123 → {
  username: "alice",
  password: "<hashed>",
  createdAt: "1700000000000"
}
```

### Resource 2: Session

| Câu hỏi | Trả lời |
|---|---|
| Nhiều thuộc tính? | ✓ user_id, username, expires_at |
| Truy cập 1 record/request? | ✓ mỗi request đọc 1 session theo token |
| Sort/filter? | ✗ |
| Accounting only? | ✗ |

→ **Hash** với TTL. Key: `sessions#<token>`.

```text
sessions#tok-xyz → {
  userId: "abc-123",
  username: "alice"
}
TTL = 24h
```

> Có thể chỉ dùng String JSON cho session nếu app đơn giản và ít update field lẻ. Hash cho phép cập nhật `userId` mà không touch `username` — atomic per field. Khoá học chọn Hash để có nhất quán pattern.

### Resource 3: Item (auction)

| Câu hỏi | Trả lời |
|---|---|
| Nhiều thuộc tính? | ✓ title, image, description, price, time, ... (10+ field) |
| Truy cập 1 record? | ✓ trang `/items/:id` |
| Sort/filter collection? | ✓ dashboard sort by 5 tiêu chí |
| Accounting only? | ✗ |

→ **Hash**. Key: `items#<item_id>`.

```text
items#xyz → {
  name: "Vintage Piano",
  description: "...",
  imageUrl: "...",
  price: "150.50",
  views: "237",
  likes: "12",
  bids: "8",
  endingAt: "1735689600000",
  ownerId: "abc-123",
  highestBidUserId: "def-456",
  createdAt: "..."
}
```

> Sort theo 5 tiêu chí: sẽ làm bằng **secondary indexes** (Sorted Set) riêng. Hash chỉ là "storage canonical"; sort + pagination dùng cấu trúc khác. Học sau ở phase-10/11.

### Resource 4: Bid

| Câu hỏi | Trả lời |
|---|---|
| Nhiều thuộc tính? | Vừa: amount, user_id, time |
| Truy cập 1 record? | KHÔNG — luôn truy cập tập bid của 1 item |
| Sort/filter collection? | ✓ — bid history theo thời gian |
| Accounting/time-series? | ✓ — đây là chuỗi time-series |

→ **NOT Hash**. Là time-series → **List** hoặc **Sorted Set** hoặc **Stream**.

Lựa chọn:
- **List** (LPUSH/LRANGE): đơn giản nhất, append fast, lấy N gần nhất nhanh.
- **Sorted Set** (ZADD timestamp): sort theo time chuẩn, range query theo time.
- **Stream** (XADD): full event log, có consumer group cho subscriber.

Khoá học chọn **List** cho bid (sẽ làm phase-14). Đơn giản và đủ cho use case.

### Resource 5: View

| Câu hỏi | Trả lời |
|---|---|
| Nhiều thuộc tính? | ✗ — chỉ là "user X đã view item Y" |
| Truy cập 1 record? | ✗ |
| Sort/filter? | ✗ |
| Accounting/unique-check? | ✓✓ — **chỉ là uniqueness check** |

→ **NOT Hash**. Là Set-membership check → **Set**.

```text
views:item#xyz → {abc-123, def-456, ghi-789, ...}
                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                  Set chứa các user_id đã view item xyz
```

`SADD views:item#xyz abc-123` — return 1 nếu lần đầu (count this view), 0 nếu đã có.

Sẽ làm phase-9.

### Resource 6: Like

| Câu hỏi | Trả lời |
|---|---|
| Nhiều thuộc tính? | ✗ |
| Truy cập 1 record? | ✗ |
| Sort/filter? | ✗ |
| Accounting + cần intersection (user A AND B cùng like)? | ✓✓ |

→ **NOT Hash**. **Set** với membership + intersection.

```text
likes:user#alice → {item1, item2, item3, ...}
likes:user#bob   → {item2, item3, item4, ...}

SINTER likes:user#alice likes:user#bob → {item2, item3}
```

Sẽ làm phase-9.

## Bảng tổng kết

| Resource | Kiểu Redis | Key pattern | Lý do |
|---|---|---|---|
| User | **Hash** | `users#<id>` | Object nhiều field |
| Session | **Hash + TTL** | `sessions#<token>` | Object + expiration |
| Item | **Hash** + secondary indexes | `items#<id>` | Object + sort nhiều chiều |
| Bid | **List** (hoặc Sorted Set) | `bids:item#<id>` | Time-series |
| View | **Set** | `views:item#<id>` | Uniqueness check + count |
| Like | **Set** | `likes:user#<id>` + `liked-by:item#<id>` | Membership + intersection |

## Câu hỏi: vì sao có cả 2 set cho Like?

```text
likes:user#alice    → items mà alice đã like  (xem dashboard của alice)
liked-by:item#xyz   → users đã like item xyz   (count likes, check "ai đã like")
```

Đây là **bi-directional index** — pattern phổ biến trong Redis. Khi like → SADD vào **cả hai set**. Khi unlike → SREM cả hai. Atomic-ish (cần MULTI/EXEC để tuyệt đối atomic, sẽ học sau).

Trade-off: tốn gấp đôi memory cho relationship, nhưng cả hai chiều query đều O(1).

## Câu hỏi: bao nhiêu hash items mới hợp lý?

App giả định **1M+ items active**. Mỗi item là 1 hash ~10 field × ~30 byte = ~300 byte. Tổng: ~**300 MB**. Vẫn ổn cho 1 instance Redis trung bình. Nếu tăng tới 100M items → cần sharding (Cluster).

Memory cho field name lặp lại được listpack encoding tối ưu nội bộ (~50% saving).

## Hệ quả: kiến trúc data layer hiện hình

Sau bài này, ta đã biết:

```text
src/services/keys.ts (mở rộng)
─────────────────────────────────
userKey(id)         → users#<id>
usernameMapKey(u)   → usernames:<u>     (secondary index — sẽ thêm sau)
sessionKey(token)   → sessions#<token>
itemKey(id)         → items#<id>
itemBidsKey(id)     → bids:item#<id>
itemViewsKey(id)    → views:item#<id>
itemLikesKey(id)    → liked-by:item#<id>
userLikesKey(uid)   → likes:user#<uid>
```

Mỗi function trong `queries/*` map đến 1-2 lệnh Redis trên các key trên.

## Tóm tắt bài 2

- 4-question framework cho Hash: nhiều thuộc tính / 1-at-a-time / multi-sort / không-phải-accounting-only.
- 3 resource dùng Hash: **User, Session, Item**.
- 3 resource dùng cấu trúc khác: **Bid** (List), **View** (Set), **Like** (Set với bi-directional index).
- Item dùng Hash + **secondary indexes** (Sorted Set sẽ học phase-10) cho sort.
- Bi-directional index pattern: 2 set cho 2 chiều query, tốn 2x memory đổi lấy O(1) query.

**Bài kế tiếp** → [Bài 3: Implement create user — HSET object syntax](03-create-user.md)

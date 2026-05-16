# Bài 2: Set operations — UNION, INTER, DIFF

Sức mạnh thật của Set là **3 phép toán so sánh giữa nhiều set**: union (hợp), intersection (giao), difference (hiệu). Đây là toán tập hợp cấp 1, nhưng được Redis thực thi với **O(N)** trên hàng triệu phần tử mà không cần code logic — đây là chỗ Set thắng SQL JOIN ở nhiều use case.

## SUNION — phép hợp

> **Union(A, B, ...)** = tập chứa **mọi phần tử** xuất hiện ở **ít nhất 1 set**.

```text
SADD colors:1 red blue orange
SADD colors:2 blue green purple
SADD colors:3 blue red purple

SUNION colors:1 colors:2 colors:3
1) "red"
2) "blue"
3) "orange"
4) "green"
5) "purple"
```

Mỗi phần tử **chỉ xuất hiện 1 lần** trong kết quả (đặc tính set).

### Tính chất

- **Commutative**: `SUNION A B` = `SUNION B A`.
- **O(N)** với N = tổng số phần tử ở mọi set input.
- Set không tồn tại được coi như set rỗng → không lỗi.

### Use case

**Gộp danh sách follower nhiều account**:
```text
SUNION followers:acc1 followers:acc2 followers:acc3
```
→ Distinct followers của 3 account, dùng để mailing list.

**Tổng hợp tag từ nhiều bài**:
```text
SUNION tags:post#1 tags:post#2 tags:post#3
```
→ Mọi tag từng dùng trong 3 bài.

**DAU = WAU đơn giản**: union DAU 7 ngày = WAU.
```text
SUNIONSTORE wau:2026-W03 dau:2026-01-13 dau:2026-01-14 ... dau:2026-01-19
SCARD wau:2026-W03
```

## SINTER — phép giao

> **Intersection(A, B, ...)** = tập chứa các phần tử **xuất hiện ở MỌI set**.

```text
SINTER colors:1 colors:2 colors:3
1) "blue"
```

Chỉ "blue" có ở cả 3.

### Tính chất

- **Commutative**: `SINTER A B` = `SINTER B A`.
- **O(N * M)** với N = phần tử ở set nhỏ nhất, M = số set.
- Redis **tối ưu**: bắt đầu từ set nhỏ nhất, dừng sớm khi phần tử không có ở set khác.
- Nếu một set không tồn tại → kết quả luôn là set rỗng.

### Use case kinh điển — Common likes (sẽ làm app RB)

> "Items mà cả user A và user B cùng like" → đây là **phép giao**.

```text
SADD likes:user#alice item#5 item#12 item#88
SADD likes:user#bob   item#5 item#33 item#88 item#99

SINTER likes:user#alice likes:user#bob
1) "item#5"
2) "item#88"
```

→ Trang profile user hiển thị "bạn và họ cùng thích": 1 lệnh SINTER. SQL phải JOIN 2 bảng likes, GROUP BY, HAVING — phức tạp hơn nhiều, chậm hơn.

### Use case khác

**Friends of friends (cộng đồng chung)**:
```text
SINTER follows:user#alice follows:user#bob
```
→ Người mà cả alice và bob đang follow.

**Sản phẩm nằm trong nhiều bộ lọc**:
```text
SADD products:color:red item#5 item#7 item#9
SADD products:size:M    item#7 item#9 item#22

SINTER products:color:red products:size:M
1) "item#7"
2) "item#9"
```
→ Sản phẩm vừa đỏ vừa size M. Faceted search cơ bản.

**Tag chung của nhiều bài**:
```text
SINTER tags:post#1 tags:post#2
```
→ Tag mà 2 bài cùng có.

## SDIFF — phép hiệu

> **Diff(A, B, C, ...)** = phần tử **có ở A** nhưng **KHÔNG có ở** B, C, ...

```text
SDIFF colors:1 colors:2 colors:3
1) "orange"
```

Chỉ "orange" có ở `colors:1` mà không có ở 2 set kia.

### Tính chất

- **KHÔNG commutative**: `SDIFF A B` ≠ `SDIFF B A`. Thứ tự **rất quan trọng**.
- O(N) với N = tổng phần tử ở set đầu + tất cả set sau.

### Use case

**Bài chưa đọc**:
```text
SDIFF all_posts read_by_user#alice
```
→ Bài chưa đọc bởi alice.

**Quà chưa nhận**:
```text
SDIFF available_gifts received_by_user#42
```

**Người follow tôi mà tôi không follow lại**:
```text
SDIFF followers:me follows:me
```
→ Asymmetric followers.

**Item user A like mà user B không**:
```text
SDIFF likes:user#alice likes:user#bob
```
→ "Bạn (alice) thích nhưng họ (bob) chưa".

## Cảnh báo: hiệu năng với set lớn

Cả 3 operation đều **O(N)**. Trên set ~10k phần tử: micro giây. Trên set ~1M phần tử: vài ms. Trên set ~100M: vài trăm ms — chặn event loop nghiêm trọng.

**Khi nào lo lắng**:
- Set follower của celebrity (Justin Bieber: ~300M).
- Aggregated set toàn site sau nhiều SUNION.

**Giải pháp**:
1. **Cache kết quả**: `SUNIONSTORE` lưu vào key mới, refresh định kỳ (xem bài 3).
2. **Pre-compute**: tính sẵn ở background job, set TTL.
3. **Sharding**: tách followers thành nhiều set theo bucket.
4. **Approximation**: HyperLogLog cho count xấp xỉ (phase-13).

## So sánh với SQL

```sql
-- SINTER tương đương:
SELECT item_id FROM likes WHERE user_id = 'alice'
INTERSECT
SELECT item_id FROM likes WHERE user_id = 'bob';

-- Hoặc:
SELECT a.item_id FROM likes a
JOIN likes b ON a.item_id = b.item_id
WHERE a.user_id = 'alice' AND b.user_id = 'bob';
```

Redis: 1 lệnh, atomic, sub-millisecond cho set vừa.

SQL: bộ tối ưu hoá phải plan, dùng index, có thể scan bảng. Performance phụ thuộc table size.

**Trade-off**: Redis cần **biết trước query** (đã lưu thành set sẵn). SQL linh hoạt hơn.

## Bẫy: WRONGTYPE khi key không phải set

```text
SET colors "string"
SUNION colors anotherSet
# (error) WRONGTYPE Operation against a key holding the wrong kind of value
```

Cẩn thận namespace key.

## Bẫy: cluster CROSSSLOT

Trong Redis Cluster, `SINTER a b` chỉ chạy nếu a và b cùng slot. Phải hash tag:

```text
SADD likes:user:{alice} ...
SADD likes:user:{bob} ...
SINTER likes:user:{alice} likes:user:{bob}
# CROSSSLOT vì {alice} ≠ {bob}
```

→ Phải đặt **chung hash tag** nếu sẽ intersect:

```text
SADD likes:{social}:user#alice ...
SADD likes:{social}:user#bob ...
SINTER likes:{social}:user#alice likes:{social}:user#bob
```

Nhưng đặt cùng tag → mọi like trên 1 node → hot shard. Trade-off cần cân nhắc.

**Workaround**: dùng `MULTI` với set copy:
1. SUNIONSTORE result {tag} ... (chuyển source set sang cùng slot)
2. SINTER trên copy

Tăng RTT + memory tạm thời.

## Câu hỏi: union/inter của 0 hoặc 1 set?

```text
SUNION colors:1                    # = SMEMBERS colors:1
SINTER colors:1                    # = SMEMBERS colors:1
SDIFF colors:1                     # = SMEMBERS colors:1
```

Đơn nhất → giống `SMEMBERS`. Không lỗi.

```text
SUNION nonexistent_set
(empty array)
```

Không lỗi. Set không tồn tại = set rỗng.

## Tóm tắt bài 2

- **SUNION**: gộp tất cả phần tử unique.
- **SINTER**: chỉ phần tử có ở MỌI set.
- **SDIFF**: phần tử ở set đầu mà không ở set sau (không commutative).
- O(N) tổng phần tử input — cẩn thận với set 1M+.
- Use case kinh điển: common likes (SINTER), unread items (SDIFF), aggregated DAU (SUNION).
- Cluster: cần hash tag, đánh đổi hot shard.

**Bài kế tiếp** → [Bài 3: STORE variants và cache kết quả](03-store-variants.md)

# Bài 3: SORT options đầy đủ — LIMIT, STORE, ALPHA, ASC/DESC

Tiếp theo bài 2, cover các option còn lại của SORT để có cái nhìn đầy đủ. Sau bài này, bạn có thể đọc bất kỳ SORT command nào trong codebase legacy.

## Full syntax

```text
SORT key [BY pattern] [LIMIT offset count] 
         [GET pattern [GET pattern ...]] 
         [ASC | DESC] [ALPHA] [STORE destination]
```

8 options. Phần lớn optional. Đã học BY, GET. Còn LIMIT, ASC/DESC, ALPHA, STORE.

## LIMIT — pagination

Tương tự SQL `LIMIT/OFFSET`:

```text
SORT books:likes BY books#*->year LIMIT 0 2
1) "bad"
2) "ok"
```

`LIMIT 0 2` — skip 0, lấy 2.

```text
SORT books:likes BY books#*->year LIMIT 1 2
1) "ok"
2) "good"
```

`LIMIT 1 2` — skip 1, lấy 2.

Kết hợp với GET:
```text
SORT books:likes BY books#*->year LIMIT 0 5 GET # GET books#*->title
```

→ Top 5 sorted, với id + title.

LIMIT là **phổ biến** trong SORT — gần như mọi use case cần pagination.

## ASC / DESC

```text
SORT books:likes BY books#*->year DESC
1) "good"     # year 1950 (cao nhất)
2) "ok"
3) "bad"
```

Default ASC. `DESC` cho descending.

```text
SORT books:likes BY books#*->year DESC LIMIT 0 10
```

→ Top 10 newest books.

## ALPHA — sort string thay vì number

Mặc định SORT cố parse sort criteria thành **double** để sort numeric:

```text
SORT books:likes BY books#*->year       # year parse được, OK
SORT books:likes BY books#*->title      # title là string, không parse → ?
```

Khi BY value không phải số, SORT vẫn cố parse → error hoặc treat as 0.

Để sort alphabetically, thêm `ALPHA`:

```text
SORT books:likes BY books#*->title ALPHA
1) "bad"      # "Bad Book"
2) "good"     # "Good Book"  
3) "ok"       # "OK Book"
```

ALPHA dùng cho:
- Sort theo name/title.
- Sort theo enum-like string.
- Sort khi numeric không có nghĩa.

## STORE — lưu kết quả vào list

```text
SORT books:likes BY books#*->year STORE sorted_books
(integer) 3
```

`STORE dest` — không trả về kết quả, mà **lưu vào key `dest` dạng LIST**.

```text
LRANGE sorted_books 0 -1
1) "bad"
2) "ok"
3) "good"
```

Lưu ý: kết quả luôn là **LIST**, không phải sorted set hay set.

### Use case STORE

```text
SORT books:likes BY books#*->year STORE cache:sorted_by_year
EXPIRE cache:sorted_by_year 60
```

→ Materialized view: tính sort 1 lần, cache 1 phút. Subsequent reads = `LRANGE cache:sorted_by_year`.

## Combination: full feature SORT

```text
SORT items:tags:vintage 
     BY items#*->price 
     DESC
     LIMIT 0 20 
     GET # 
     GET items#*->name 
     GET items#*->price
```

Đọc trái sang phải:
1. Source: `items:tags:vintage` (set của itemIds có tag "vintage").
2. Sort BY price (number) DESC.
3. LIMIT 0 20 — top 20 đắt nhất.
4. GET # — trả id.
5. GET items#*->name — kèm name.
6. GET items#*->price — kèm price.

Result mảng flat:
```text
[id1, name1, price1, id2, name2, price2, ...]
```

→ "Top 20 vintage items đắt nhất, kèm name + price" — **1 lệnh, 1 RTT**.

Tương đương SQL:
```sql
SELECT id, name, price 
FROM items 
WHERE 'vintage' IN tags
ORDER BY price DESC 
LIMIT 20;
```

## Bẫy: SORT với Sorted Set + sort theo score gốc

```text
ZADD leaderboard 100 alice 50 bob 200 charlie

SORT leaderboard ALPHA       # → alice, bob, charlie (alphabet)
SORT leaderboard             # → ERROR (members là string, không number)
SORT leaderboard BY NOSORT   # → bob, alice, charlie (theo score gốc)
```

→ Để giữ thứ tự sorted set, dùng `BY NOSORT`. Hoặc dùng `ZRANGE` trực tiếp.

## Bẫy: BY pattern với non-existent field

```text
HSET book#1 title "Hello"          # không có "year"
SORT books BY books#*->year ALPHA  # year không có cho book#1
```

→ Treat as nil → sort value = "" → đứng đầu (smallest string). Không error.

Lo lắng cho schema: nếu thêm field mới và quên backfill, sort có thể không như mong đợi.

## Bẫy: SORT trên big collection chặn server

```text
SORT items:all BY items#*->views DESC LIMIT 0 20    # 1M items
```

Redis:
1. Load 1M members vào memory.
2. Lookup 1M HGET cho BY.
3. Sort 1M (O(N log N)).
4. Return top 20.

Steps 1-3 đều **trên main thread**. Chặn 1-5 giây với 1M items. Nguy hiểm cho production.

Workaround:
- **Pre-compute** sort result trong Sorted Set riêng → ZRANGE.
- **STORE** với TTL → cache.
- **RediSearch** với index.

→ SORT đẹp về cú pháp, không scale. Đây là **lý do chính** RediSearch ra đời.

## STORE + RENAME pattern — atomic rotation

```text
SORT items BY items#*->views DESC LIMIT 0 100 STORE cache:top100:new
RENAME cache:top100:new cache:top100
```

Tạo result mới trong key tạm, rồi RENAME atomic → cache update không bị "rỗng" trong lúc tính lại.

Còn tốt hơn với pipeline:
```ts
await client.multi()
  .sort('items', { /* args */, STORE: 'cache:top100:new' })
  .rename('cache:top100:new', 'cache:top100')
  .expire('cache:top100', 60)
  .exec();
```

3 lệnh atomic. Pattern hay cho periodic cache refresh.

## Kết quả SORT khi key không tồn tại

```text
SORT nonexistent
(empty array)
```

Không error. Trả mảng rỗng. Giống nhiều lệnh Redis khác.

## SORT_RO — read-only variant (Redis 7+)

```text
SORT_RO key [BY ...] [GET ...] [LIMIT ...]
```

Không hỗ trợ `STORE`. Chỉ đọc. Useful cho:
- Read-only replicas.
- Permission system: user role có quyền `SORT_RO` mà không `SORT`.

## Đặc biệt: SORT trên Hash field — không hỗ trợ

```text
SORT hash_key                # error - SORT chỉ làm với set/sortedset/list
```

Để "sort hash fields", phải:
1. Lấy keys/values với HGETALL.
2. Sort client-side.

Hoặc thiết kế lại: tạo sorted set/list của hash entries.

## Pattern: external-key indirection

```text
HSET sort_proxy:1 score 100
HSET sort_proxy:2 score 50
SADD all_items 1 2

SORT all_items BY sort_proxy:*->score
1) "2"     # score 50
2) "1"     # score 100
```

Sort criteria không nằm trong hash chính, mà trong proxy hash. Pattern này cho phép sort trên multiple criteria khác nhau cùng dataset.

## Tóm tắt bài 3

- `LIMIT offset count` — pagination, dùng nhiều.
- `ASC/DESC` — hướng sort.
- `ALPHA` — sort alphabet thay vì number.
- `STORE dest` — kết quả thành LIST tại dest, không trả về.
- Multiple `GET` trả flat array.
- SORT trên big collection (>10k) **rất nguy hiểm** — chặn event loop.
- STORE + RENAME atomic cho cache refresh pattern.

**Bài kế tiếp** → [Bài 4: Implement SORT trong app RB](04-sort-trong-app-rb.md)

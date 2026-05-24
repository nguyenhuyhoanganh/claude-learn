# Bài 3: Numeric queries — range, comparison, sort

NUMERIC field cho phép range query nhanh. Đây là backbone cho filter "price 100-500", "items ending in 24h", "views > 1000". Bài này cover cú pháp đầy đủ.

## Cú pháp FT.SEARCH

```text
FT.SEARCH <index> <query> [options]
```

Query language tự riêng. Numeric query syntax:

```text
@field:[min max]
```

## Range queries

```text
FT.SEARCH idx:items "@price:[100 500]"
```

→ Items có `price >= 100` AND `price <= 500`.

Inclusive both ends. Để exclusive, dùng `(`:

```text
@price:[(100 500]      # price > 100 AND <= 500
@price:[100 (500]      # >= 100 AND < 500
@price:[(100 (500]     # > 100 AND < 500
```

## Infinity

```text
@price:[100 +inf]      # >= 100
@price:[-inf 500]      # <= 500
@price:[-inf +inf]     # bất kỳ (= match all)
```

## Operator >, <, >=, <=, ==, != (mới)

Redis 7.4+ support natural syntax:

```text
@price > 100
@price >= 100
@price < 500
@price <= 500
@price == 150
@price != 0
```

Cú pháp truyền thống (range) still works và phổ biến hơn.

## Filter combination

### AND

```text
@price:[100 500] @views:[1000 +inf]
```

Space = AND. → price 100-500 AND views ≥ 1000.

### OR

```text
@price:[100 200] | @price:[400 500]
```

`|` = OR. → price 100-200 OR 400-500.

### NOT

```text
-@price:[100 200]
```

`-` = NOT. → NOT (price 100-200) = price outside [100, 200].

### Parentheses grouping

```text
(@price:[100 500] @views:[1000 +inf]) | @price:[1000 +inf]
```

→ (price 100-500 AND views ≥ 1000) OR price ≥ 1000.

## Sort by numeric

Cần `SORTABLE` trong schema:

```text
FT.SEARCH idx:items "*" SORTBY price ASC
FT.SEARCH idx:items "*" SORTBY price DESC
```

`*` = match all. Sort all items by price.

Combined với filter:
```text
FT.SEARCH idx:items "@views:[1000 +inf]" SORTBY price DESC
```

→ Items có views ≥ 1000, sort by price descending.

## Pagination

```text
FT.SEARCH idx:items "@price:[100 500]" LIMIT 0 20
FT.SEARCH idx:items "@price:[100 500]" LIMIT 20 20    # page 2
```

`LIMIT <offset> <count>`. Default `LIMIT 0 10`.

Cho pagination sâu: tốn (giống SQL OFFSET). Cân nhắc cursor-based khi > 1000 page.

## Return only specific fields

```text
FT.SEARCH idx:items "@price:[100 500]" RETURN 3 name price views
```

`RETURN <n> <field1> ... <fieldN>`. Chỉ trả về 3 field name, price, views.

Default: trả về tất cả fields. Limit fields giảm bandwidth.

## NOCONTENT — chỉ trả keys

```text
FT.SEARCH idx:items "@price:[100 500]" NOCONTENT
```

Chỉ trả về key names, không trả data. Subsequent: HGETALL hoặc pipeline.

Use case: count + IDs, sau đó lazy load.

## Result format

```text
FT.SEARCH idx:items "@price:[100 500]" LIMIT 0 2

1) (integer) 47          ← total matches (across all pages)
2) "items#42"            ← key name
3) 1) "name"             ← fields
   2) "Vintage Piano"
   3) "price"
   4) "150"
   5) "views"
   6) "237"
4) "items#88"
5) 1) "name"
   2) "Old Camera"
   ...
```

First element = total count. Sau đó pair `[key, fields-array]`.

→ Client lib parse thành array of objects:
```ts
const result = await client.ft.search('idx:items', '@price:[100 500]', { LIMIT: { from: 0, size: 2 } });
// result.total: 47
// result.documents: [
//   { id: 'items#42', value: { name, price, views } },
//   { id: 'items#88', value: { name, price, views } },
// ]
```

## Complex example

Search items:
- Price 100-500.
- Views ≥ 100.
- Not ending in past.
- Sort by ending time (closest first).
- Top 20.
- Return name, price, endingAt.

```text
FT.SEARCH idx:items
  "@price:[100 500] @views:[100 +inf] @endingAt:[<NOW_MS> +inf]"
  SORTBY endingAt ASC
  LIMIT 0 20
  RETURN 3 name price endingAt
```

Trong code:
```ts
const now = Date.now();
const result = await client.ft.search(
  'idx:items',
  `@price:[100 500] @views:[100 +inf] @endingAt:[${now} +inf]`,
  {
    SORTBY: { BY: 'endingAt', DIRECTION: 'ASC' },
    LIMIT: { from: 0, size: 20 },
    RETURN: ['name', 'price', 'endingAt'],
  }
);
```

1 RTT cho complex query trên 1M+ items.

## Performance comparison

| Approach | Latency 1M items |
|---|---|
| Pipeline (KEYS + filter + sort) | ❌ chặn server |
| Sorted Set per field intersect | ~50ms (multi-key ops) |
| RediSearch | **~5ms** |

→ RediSearch là **best tool** cho multi-field filter + sort.

## SORTBY MAX

```text
FT.SEARCH idx:items "@views:[1000 +inf]" SORTBY price DESC LIMIT 0 1
```

→ Item đắt nhất có views ≥ 1000.

`SORTBY` + `LIMIT 0 1` = top-N pattern, scale tốt.

## Aggregation với numeric

`FT.AGGREGATE` cho group/sum/avg numeric:

```text
FT.AGGREGATE idx:items "*"
  GROUPBY 1 @ownerId
  REDUCE COUNT 0 AS total_items
  REDUCE SUM 1 @price AS total_value
  SORTBY 2 @total_value DESC
  LIMIT 0 10
```

→ Top 10 sellers theo total value of items. SQL equivalent:
```sql
SELECT ownerId, COUNT(*) as total_items, SUM(price) as total_value
FROM items
GROUP BY ownerId
ORDER BY total_value DESC
LIMIT 10;
```

RediSearch Aggregate cực mạnh. Sub-feature riêng.

## Edge cases

### Field không có value

```text
HSET items#42 name "Piano"     # không có price field
FT.SEARCH idx "@price:[100 500]"
# items#42 không xuất hiện (no value để compare)
```

Documents thiếu field bị skip trong filter. Để include: chấp nhận hoặc default value.

### Float precision

```text
HSET items#42 price 99.999999
FT.SEARCH idx "@price:[100 +inf]"
# Có thể không match nếu precision lose
```

Float NUMERIC dùng IEEE 754 double. Precision ~15-17 chữ số. Cho money, lưu cents (integer).

## Tóm tắt bài 3

- `@field:[min max]` cho range. `(` cho exclusive. `+inf/-inf` cho mở.
- AND (space), OR (|), NOT (-), grouping (parentheses).
- SORTBY + LIMIT cho pagination.
- RETURN chọn fields. NOCONTENT chỉ keys.
- Latency ~5ms cho 1M items với complex query.
- FT.AGGREGATE cho group/sum/avg.

**Bài kế tiếp** → [Bài 4: Tag queries — categorical filter](04-tag-queries.md)

# Bài 6: Sorting + searching kết hợp + EXPLAIN/PROFILE

Khi search results lớn, user thường muốn sort khác (price asc, newest first, ...). Bài này về SORTBY trong search, performance considerations, EXPLAIN/PROFILE debugging.

## SORTBY in search

```text
FT.SEARCH idx:items "chair" SORTBY price ASC
```

→ Items có "chair", sort theo price tăng dần.

Field cần `SORTABLE` trong schema.

## Combine với filter

```text
FT.SEARCH idx:items "@price:[100 500] chair" SORTBY views DESC
```

→ Items "chair" có price 100-500, sort theo views giảm dần.

## SORTBY vs default (relevance)

Default sort: BM25 score descending.

| SORTBY | Use case |
|---|---|
| (none) | "Most relevant first" — search bar default |
| price ASC | "Cheapest first" |
| price DESC | "Most expensive first" |
| createdAt DESC | "Newest first" |
| endingAt ASC | "Ending soonest" |
| views DESC | "Most popular" |

UI: dropdown "Sort by" → mapping sang SORTBY param.

## Code implementation

```ts
type SortOption = 'relevance' | 'price-asc' | 'price-desc' | 'newest' | 'ending-soon' | 'popular';

function getSortConfig(sort: SortOption) {
  switch (sort) {
    case 'price-asc':    return { BY: 'price', DIRECTION: 'ASC' };
    case 'price-desc':   return { BY: 'price', DIRECTION: 'DESC' };
    case 'newest':       return { BY: 'createdAt', DIRECTION: 'DESC' };
    case 'ending-soon':  return { BY: 'endingAt', DIRECTION: 'ASC' };
    case 'popular':      return { BY: 'views', DIRECTION: 'DESC' };
    default:             return undefined;   // relevance
  }
}

export async function searchItems(
  rawInput: string,
  options: { sort?: SortOption; page?: number; perPage?: number } = {}
) {
  const query = parseSearchInput(rawInput);
  if (!query) return { items: [], total: 0, hasMore: false };
  
  const sortBy = getSortConfig(options.sort ?? 'relevance');
  
  const result = await client.ft.search('idx:items', query, {
    LIMIT: { from: (options.page ?? 1 - 1) * 20, size: options.perPage ?? 20 },
    SORTBY: sortBy,
    RETURN: ['name', 'price', 'views', 'imageUrl'],
  });
  
  // ... parse + return
}
```

URL: `/search?q=chair&sort=price-asc&page=1`.

## Performance: SORTBY uses sorted index

Field `SORTABLE` → RediSearch maintain separate sorted index → SORTBY O(log N + K).

Field không SORTABLE → SORTBY phải scan match results, sort runtime → slow with many matches.

→ **Always SORTABLE** cho field bạn dự định sort.

Trade-off: SORTABLE tốn ~10-20% extra memory.

## Filter + sort là common pattern

```text
FT.SEARCH idx:items 
  "@tags:{vintage} @price:[100 500] piano" 
  SORTBY views DESC 
  LIMIT 0 20
```

→ Items tag vintage, price 100-500, "piano" in text, sort by views.

Faceted search UI:
- Sidebar filters (price range, tag, brand).
- Top sort dropdown.
- Search query.

All combine in 1 RediSearch query. Sub-ms.

## Pagination với SORTBY

```text
FT.SEARCH idx "chair" SORTBY price ASC LIMIT 0 20    # page 1
FT.SEARCH idx "chair" SORTBY price ASC LIMIT 20 20   # page 2
```

Stable ordering nếu data không đổi.

Bẫy: data thay đổi giữa pages → trùng/sót.

Fix: cursor-based với last seen sort value:
```text
FT.SEARCH idx "@price:[150 +inf] chair" SORTBY price ASC LIMIT 0 20
```

Page 2: dùng price của item cuối page 1 làm cursor.

Complex hơn nhưng stable. Cho infinite scroll.

## EXPLAIN command

Debug query slow hoặc unexpected results:

```text
FT.EXPLAIN idx:items "(@name:chair => {$weight: 5.0}) | (@description:chair)"
```

Return parse tree:
```text
UNION {
  INTERSECT WITH WEIGHT 5.0 {
    @name:UNION {
      chair
      +chair(expanded)    # stemming
    }
  }
  INTERSECT {
    @description:UNION {
      chair
      +chair(expanded)
    }
  }
}
```

→ Thấy:
- Stemming xảy ra (chair → +chair).
- Weight 5.0 áp dụng cho @name branch.
- UNION giữa name và description.

Verify query đúng intent.

## PROFILE command

Đo actual performance:

```text
FT.PROFILE idx:items SEARCH QUERY "chair"
```

Return:
```text
1) [search results]
2) "profile"
   "warning"  ""
   "iterators_profile"
       "type"   "TEXT_INDEX"
       "term"   "chair"
       "size"   1247
       "time"   "0.05"
   "result_processors_profile"
       "type"   "Sorter"
       "time"   "0.02"
   "total_time"  "0.12"
   "Parsing time"  "0.01"
   "Pipeline creation time" "0.01"
```

Thấy:
- 1247 documents matched.
- Sorting took 0.02ms.
- Total 0.12ms.

Bottleneck phần nào → biết optimize.

## Slow queries common causes

### 1. Big SORTBY without index

Schema không SORTABLE → runtime sort.

Fix: add SORTABLE.

### 2. Fuzzy với MAXEXPANSIONS hit

Fuzzy "%word%" expand thành 200+ tokens.

Fix: increase MINPREFIX or limit fuzzy distance.

### 3. Cross-product big sets

```text
@tag:{popular} @tag:{vintage}
```

Both tags rất common → intersection lớn.

Fix: filter bằng more restrictive criteria first.

### 4. RETURN nhiều fields

Loading nhiều fields = bandwidth.

Fix: RETURN chỉ fields cần.

## SORTBY MAX optimization

Khi chỉ cần top N:

```text
FT.SEARCH idx "*" SORTBY views DESC LIMIT 0 10 SORTBY MAX 100
```

`SORTBY MAX 100`: sort top 100 only. Faster cho big results.

Trade-off: results không hoàn toàn correct nếu cần page sau (page 11+).

## Aggregate alternative

```text
FT.AGGREGATE idx:items "chair"
  GROUPBY 1 @ownerId
  REDUCE COUNT 0 AS items_count
  SORTBY 2 @items_count DESC
  LIMIT 0 10
```

→ Top 10 sellers có nhiều items match "chair". Aggregation thay search.

Use case: analytics, dashboards.

## Real example: e-commerce search

```ts
async function searchProducts(input: SearchInput) {
  const { q, minPrice, maxPrice, tags, sort, page } = input;
  
  // Build query
  let queryParts: string[] = [];
  
  if (q) {
    const parsed = parseSearchInput(q);
    if (parsed) queryParts.push(parsed);
  }
  
  if (minPrice !== undefined || maxPrice !== undefined) {
    queryParts.push(`@price:[${minPrice ?? '-inf'} ${maxPrice ?? '+inf'}]`);
  }
  
  if (tags && tags.length > 0) {
    queryParts.push(`@tags:{${tags.join('|')}}`);
  }
  
  const query = queryParts.join(' ') || '*';
  
  return await client.ft.search('idx:items', query, {
    LIMIT: { from: (page - 1) * 20, size: 20 },
    SORTBY: getSortConfig(sort),
  });
}
```

→ Combine search + filter + sort. 1 query, ~5-20ms.

## Tóm tắt bài 6

- SORTBY trong search cho user choice (price/date/views).
- Field cần SORTABLE → fast sort O(log N).
- Combine filter (tag, numeric) + sort + search = faceted search.
- EXPLAIN cho execution plan. PROFILE cho timing.
- Common slow causes: non-SORTABLE sort, fuzzy expand, big intersection.

**Bài kế tiếp** → [Bài 7: Updating index + tổng kết phase-19](07-updating-index-tong-ket.md)

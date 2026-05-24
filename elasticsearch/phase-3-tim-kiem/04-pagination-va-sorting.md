# Bài 4: Pagination và Sorting

Search trả 10 doc default. Production cần pagination (next page) và sorting (theo date, rating). Bài này.

## Pagination cơ bản: from + size

```text
GET /movies/_search
{
    "from": 0,
    "size": 10,
    "query": { "match_all": {} }
}
```

- **`from`** — skip N doc đầu (default 0).
- **`size`** — số doc trả (default 10).

Page 1: `from: 0, size: 10`.
Page 2: `from: 10, size: 10`.
Page 3: `from: 20, size: 10`.

Hoặc qua URL:

```text
GET /movies/_search?from=10&size=10
```

## Pitfall: deep pagination

ES collect doc đến `from + size` rồi sort → trả `[from, from+size)`.

→ `from: 10000` = ES phải fetch + sort **10010 doc**. RAM nổ.

Default limit: `from + size ≤ 10000`. Vượt → error:

```text
"Result window is too large, from + size must be less than or equal to: [10000]"
```

→ Production tránh deep pagination.

### Workaround 1: scroll API (legacy)

Dùng cho "export tất cả":

```text
GET /movies/_search?scroll=1m
{
    "size": 100,
    "query": { "match_all": {} }
}
```

→ Response có `_scroll_id`. Tiếp tục:

```text
GET /_search/scroll
{
    "scroll": "1m",
    "scroll_id": "..."
}
```

→ Snapshot point-in-time, batch 100 doc/lần. Không phù hợp interactive search.

Đã deprecated trong ES 7.10+. Thay bằng **search_after**.

### Workaround 2: search_after (recommended)

Dùng tiebreaker để continue từ doc cuối page trước:

```text
GET /movies/_search
{
    "size": 10,
    "sort": [
        { "year": "desc" },
        { "_id":  "asc" }            ← Tiebreaker (unique)
    ],
    "query": { "match_all": {} }
}
```

Response cuối page 1:

```json
{
    "hits": [
        ...,
        { "_id": "100", "sort": ["2020", "100"] }     ← Doc cuối
    ]
}
```

Page 2: dùng `search_after`:

```text
GET /movies/_search
{
    "size": 10,
    "sort": [{ "year": "desc" }, { "_id": "asc" }],
    "search_after": ["2020", "100"],
    "query": { "match_all": {} }
}
```

→ Trả 10 doc tiếp theo sau `["2020", "100"]`. Không limit deep.

→ **Production standard** cho infinite scroll.

## Sorting

```text
GET /movies/_search
{
    "query": { "match_all": {} },
    "sort": [
        { "year": "desc" }
    ]
}
```

→ Sort year giảm dần.

Multiple sort (tiebreaker):

```text
{
    "sort": [
        { "year": "desc" },
        { "rating": "desc" },
        { "_score": "desc" }
    ]
}
```

→ Year trước, rating sau, score cuối.

### Sort by relevance (default)

Không có `sort` → ES sort by `_score` desc tự động.

Explicit:

```text
"sort": [{ "_score": "desc" }]
```

## Vấn đề: sort text field

```text
{
    "sort": [{ "title": "asc" }]
}
```

→ ERROR:

```text
"Text fields are not optimised for operations that require per-document field data"
```

→ Text field bị analyze → individual tokens lưu → không có "full string" để sort.

### Fix: dùng `.keyword` sub-field

Default dynamic mapping tạo `title` (text) + `title.keyword` (keyword):

```text
{
    "sort": [{ "title.keyword": "asc" }]
}
```

→ Sort alphabetical theo full title.

Nếu explicit mapping chưa có `.keyword`, phải reindex.

## Filter + sort + paginate

Production query đầy đủ:

```text
GET /movies/_search
{
    "from": 0,
    "size": 20,
    "query": {
        "bool": {
            "must":   [{ "match": { "title": "star" } }],
            "filter": [{ "range": { "year": { "gte": "2000" } } }]
        }
    },
    "sort": [
        { "year": "desc" },
        { "_score": "desc" }
    ],
    "_source": ["title", "year", "rating"]
}
```

Combine:
- Filter year ≥ 2000.
- Match title "star".
- Sort year desc, rồi score.
- Limit 20.
- Chỉ trả title/year/rating.

## `_source` field selection

Giảm response size:

```text
"_source": ["title", "year"]
```

→ Trả 2 field.

Exclude pattern:

```text
"_source": {
    "includes": ["title", "year"],
    "excludes": ["internal_*"]
}
```

→ Include 2, exclude tất cả `internal_*`.

Disable hoàn toàn (chỉ metadata):

```text
"_source": false
```

## Track total hits

Default ES count hits chính xác đến 10,000. Vượt → `total = "10000+"`.

Force chính xác:

```text
{
    "track_total_hits": true,
    ...
}
```

→ Cost ~10-20% slower nhưng precise count.

Production: `false` (chỉ "có hay không kết quả") thậm chí nhanh hơn.

## Pitfall

### Pitfall 1: deep pagination performance

```text
"from": 9000, "size": 10        ← OK technically
```

→ Fetch + sort 9010 doc. Slow. Avoid.

→ Production: max 1000 page (10 doc/page × 100 page).

### Pitfall 2: sort text field

```text
"sort": [{ "title": "asc" }]       ← Fail
```

→ Dùng `title.keyword`.

### Pitfall 3: search_after không có tiebreaker

```text
"sort": [{ "year": "desc" }],
"search_after": ["2020"]
```

→ 2 doc cùng year = không biết tiếp từ doc nào. **Bắt buộc** tiebreaker với unique field (`_id`).

## Tóm tắt

- **`from + size`** — pagination cơ bản. Default limit `from + size ≤ 10000`.
- Deep pagination = bad performance. Dùng **`search_after`** với sort + tiebreaker.
- **`sort`** array, multiple field, asc/desc.
- Default sort by `_score` desc.
- Text field không sort được. Dùng **`.keyword`** sub-field.
- `_source` giảm response size (`includes`/`excludes` patterns).
- `track_total_hits: true` cho count precise, slower.

---

→ [Bài tiếp theo: Filters vs Queries](05-filters-vs-queries.md)

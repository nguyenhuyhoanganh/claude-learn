# Bài 5: Filters vs Queries

`bool` có 4 clause: `must`, `filter`, `should`, `must_not`. Bài này: phân biệt **query context** (score) vs **filter context** (yes/no) → performance tối ưu.

## Query context

- Tính `_score` (BM25 relevance).
- Doc match được rank theo relevance.
- **Không cache** (vì score phụ thuộc inverse document frequency của toàn corpus).

Dùng: `must`, `should` trong bool.

```text
{
    "bool": {
        "must":   [{ "match": { "title": "star" } }],
        "should": [{ "match": { "genre": "sci-fi" } }]
    }
}
```

→ Doc match "star" được rank theo relevance. Doc match cả "star" + "sci-fi" score cao hơn.

## Filter context

- Chỉ yes/no, **không tính score**.
- **Cacheable** — ES cache filter result (bitmap doc IDs).
- Faster.

Dùng: `filter`, `must_not` trong bool.

```text
{
    "bool": {
        "filter": [
            { "term":  { "genre": "Sci-Fi" } },
            { "range": { "year": { "gte": "2010" } } }
        ]
    }
}
```

→ Filter Sci-Fi + year ≥ 2010. Mọi doc match có **cùng score = 0**.

## So sánh

| Aspect          | Query (`must`, `should`)         | Filter (`filter`, `must_not`)   |
|-----------------|-----------------------------------|---------------------------------|
| Tính `_score`?  | ✅ Có                              | ❌ Không                         |
| Cacheable?      | ❌                                | ✅                              |
| Speed           | Slower                            | Faster                          |
| Use case        | Relevance ranking matter          | Yes/no filter                   |

## Khi nào dùng filter?

Mọi điều kiện **không cần relevance**:
- Range (year, date).
- Term/terms (status, category).
- Exists / missing.
- Geo (within radius).
- Boolean (is_active).

→ Faster + cache.

## Khi nào dùng query?

Khi relevance matters:
- Full-text search (match, match_phrase).
- Multi-field search (multi_match).
- Fuzzy.

## Combine pattern

Best practice — combine cả 2:

```text
GET /movies/_search
{
    "query": {
        "bool": {
            "must": [
                { "match": { "title": "star wars" } }       ← Relevance
            ],
            "filter": [
                { "term":  { "genre": "Sci-Fi" } },         ← Yes/no
                { "range": { "year": { "gte": "2000" } } }  ← Yes/no
            ]
        }
    }
}
```

→ Match doc text-relevant ("star wars"), filter Sci-Fi 2000+, sort theo score.

## Example: filter only

Pure filter (không cần ranking):

```text
GET /movies/_search
{
    "query": {
        "bool": {
            "filter": [
                { "term":  { "status": "active" } },
                { "range": { "stock": { "gt": 0 } } }
            ]
        }
    }
}
```

→ Mọi doc score = 0 (vì không có query context). Sort theo field khác:

```text
"sort": [{ "rating": "desc" }]
```

→ Production e-commerce list "active products in stock, sort by rating".

## constant_score

Wrap filter trong constant_score → mọi match cùng score (default 1.0):

```text
{
    "query": {
        "constant_score": {
            "filter": {
                "term": { "genre": "Sci-Fi" }
            }
        }
    }
}
```

→ Same effect như filter trong bool, sytax khác. Score = 1.0.

## must_not = filter no-score

`must_not` luôn ở filter context:

```text
{
    "bool": {
        "must_not": [
            { "match": { "title": "trek" } }
        ]
    }
}
```

→ Exclude doc có "trek" trong title. Cacheable.

## Caching cơ chế

ES build **bitmap** doc IDs cho mỗi filter:

```text
Filter "genre: Sci-Fi"  → bitmap [1,0,1,0,0,1,1,...]
Filter "year >= 2010"   → bitmap [0,1,1,0,1,1,0,...]
```

→ Combine = AND bitmap → result.

Bitmap nhỏ (1 bit/doc), cache LRU trong RAM. Query lặp lại = lookup cache → microseconds.

→ Query workload có **filter lặp lại** (vd "active=true" mọi query) — cache hit rate cao → cực nhanh.

## Demo

Tạo 2 query đo time:

```text
# Slow: filter trong must (query context)
GET /movies/_search
{
    "query": {
        "bool": {
            "must": [
                { "match": { "title": "movie" } },
                { "range": { "year": { "gte": "2000" } } }
            ]
        }
    }
}

# Fast: filter trong filter
GET /movies/_search
{
    "query": {
        "bool": {
            "must": [
                { "match": { "title": "movie" } }
            ],
            "filter": [
                { "range": { "year": { "gte": "2000" } } }
            ]
        }
    }
}
```

→ Cùng kết quả, fast version 20-50% faster trên data lớn.

## Pitfall

### Pitfall 1: relevance score = 0 không phải bug

```text
"hits": [
    { "_id": "1", "_score": 0.0, ... }
]
```

→ Filter context. **Không** phải lỗi. Sort theo field khác nếu cần thứ tự.

### Pitfall 2: term in must thay filter

```text
{
    "bool": {
        "must": [
            { "term": { "status": "active" } }     ← Should be filter
        ]
    }
}
```

→ Work nhưng slow + không cache. Chuyển vào `filter`.

### Pitfall 3: range trong query

```text
"must": [
    { "range": { "year": { "gte": "2010" } } }     ← Slow
]
```

→ Range nên ở filter context (yes/no).

### Pitfall 4: should without must

```text
{
    "bool": {
        "should": [...]            ← Standalone
    }
}
```

→ ES ngầm yêu cầu ít nhất 1 should match. Behavior khác khi combine với must.

## Tóm tắt

- **Query context** (`must`, `should`) — tính score, không cache, slower.
- **Filter context** (`filter`, `must_not`) — yes/no, cache, faster.
- Best practice: **match trong must**, **range/term trong filter**.
- Filter cacheable qua bitmap doc IDs → hit cache = microseconds.
- Filter score = 0. Sort by field khác nếu cần order.
- `constant_score { filter: ... }` = filter + score = 1.0 fixed.
- `must_not` luôn filter context.

---

→ [Bài tiếp theo: Fuzzy queries](06-fuzzy-queries.md)

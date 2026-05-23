# Bài 1: Query Lite vs Query DSL

ES có 2 cách viết search query: **Query Lite** (URI params) và **Query DSL** (JSON body). Bài này: so sánh + khi nào dùng cái nào.

## Query Lite (URI search)

Cú pháp gọn — query nằm trong URL:

```text
GET /movies/_search?q=title:star
```

→ Tìm movie có "star" trong title.

Phức tạp hơn:

```text
GET /movies/_search?q=+year:>2010 +title:trek
```

→ Movies có year > 2010 **AND** title chứa "trek".

### Cú pháp Query Lite

| Operator       | Ý nghĩa                                  |
|----------------|------------------------------------------|
| `field:value`  | Match field                              |
| `+field:value` | Required (AND)                           |
| `-field:value` | Excluded (NOT)                           |
| `field:>N`     | Greater than                             |
| `field:<N`     | Less than                                |
| `field:[A TO B]` | Range                                  |
| `field:"phrase"` | Phrase match                           |
| `*`, `?`       | Wildcard                                 |

### Pros / Cons

**Pros**:
- Nhanh gõ.
- Test 1-2 query trong browser.

**Cons**:
- **URL encoding** — `>`, `:`, space cần encode → cryptic.
- Hard to read complex query.
- **Security risk** — đừng cho user pass thẳng query → DoS risk.
- Khó debug.

→ **Production tuyệt đối không** dùng. Chỉ explore nhanh.

## Query DSL (JSON body)

Cú pháp đầy đủ — query trong body JSON:

```text
GET /movies/_search
{
    "query": {
        "match": { "title": "star" }
    }
}
```

→ Same kết quả với Query Lite ở trên.

Phức tạp:

```text
GET /movies/_search
{
    "query": {
        "bool": {
            "must": [
                { "match": { "title": "trek" } }
            ],
            "filter": [
                { "range": { "year": { "gte": "2010" } } }
            ]
        }
    }
}
```

→ Dài hơn nhưng:
- Readable.
- Versioned trong code.
- Không URL encoding.
- Combine logic phức tạp dễ.

→ **Production standard**.

## GET có body — legal nhưng lạ

HTTP spec không cấm GET có body, nhưng hiếm tool support. ES support.

Nếu tool không cho GET có body, dùng `POST /movies/_search` thay thế — ES treat identical.

## Anatomy của Query DSL

```text
GET /movies/_search
{
    "query": { ... },         // Bắt buộc — search query
    "from": 0,                // Optional — offset (default 0)
    "size": 10,               // Optional — limit (default 10)
    "sort": [ ... ],          // Optional — sort order
    "_source": [ ... ],       // Optional — fields trả về
    "aggs": { ... },          // Optional — aggregations
    "highlight": { ... }      // Optional — highlight matched text
}
```

→ Body có nhiều "section" — query, paging, sort, aggregations. Bài tiếp theo deep dive từng cái.

## Query types

ES có ~30 loại query. Phổ biến:

| Type            | Use case                                        |
|-----------------|-------------------------------------------------|
| `match`         | Full-text search (analyzed)                     |
| `match_phrase`  | Phrase search (cần đúng thứ tự)                  |
| `match_all`     | Trả mọi document                                |
| `term`          | Exact match (không analyze)                     |
| `terms`         | Match 1 trong list values                       |
| `range`         | Numeric/date range                              |
| `exists`        | Field có giá trị                                 |
| `prefix`        | Bắt đầu bằng...                                  |
| `wildcard`      | Pattern `*` `?`                                  |
| `fuzzy`         | Tolerant typo                                    |
| `bool`          | Combine queries (AND/OR/NOT)                    |
| `multi_match`   | Match nhiều fields                              |
| `nested`        | Query nested objects                            |

→ Bài 2 onwards: từng cái chi tiết.

## Demo

Index sample (Phase 2):

```text
GET /movies/_search?q=title:star
```

vs:

```text
GET /movies/_search
{
    "query": {
        "match": { "title": "star" }
    }
}
```

→ Cùng kết quả: Star Wars + Star Trek (vì cả 2 đều có "star").

Note: `match` query trên `text` field = analyzed. Treat "star" và "Star" giống nhau, return cả phim chỉ có "star" (vì single-token tìm thấy).

## Query vs Filter

Bài 5 sâu hơn, preview:

- **Query context** — tính `_score` (relevance ranking).
- **Filter context** — chỉ yes/no, không score → faster + cacheable.

Filter dùng trong `bool` query:

```text
{
    "query": {
        "bool": {
            "must":   [...],       // Query context — affect score
            "filter": [...]        // Filter context — yes/no only
        }
    }
}
```

## Tóm tắt

- **Query Lite** = URL params. Nhanh nhưng cryptic, security risk. Không production.
- **Query DSL** = JSON body. Readable, powerful, **production standard**.
- GET search có body legal nhưng rare. Dùng POST thay nếu tool reject.
- Body có: `query`, `from`, `size`, `sort`, `_source`, `aggs`, `highlight`.
- 30+ query types. Phổ biến: `match`, `term`, `range`, `bool`, `match_phrase`.
- **Query** (rank by score) vs **Filter** (yes/no, faster).

---

→ [Bài tiếp theo: JSON Search deep dive](02-json-search-deep-dive.md)

# Bài 2: JSON Search deep dive — match, term, bool

Bài này: 3 query loại quan trọng nhất — **match**, **term**, **bool** + cách combine.

## match — full-text search

Default cho text field:

```text
GET /movies/_search
{
    "query": {
        "match": { "title": "star wars" }
    }
}
```

Hành vi:

1. ES analyze "star wars" với analyzer của field (default = English).
2. Tokens: `["star", "wars"]`.
3. Match document có `star` HOẶC `wars` trong title (OR).
4. Score = TF-IDF/BM25, doc có cả 2 token score cao hơn.

→ Result:
- Star Wars: cả 2 tokens → score cao.
- Star Trek: chỉ "star" → score thấp hơn.

### Force AND

Mặc định OR. Đổi thành AND:

```text
{
    "query": {
        "match": {
            "title": {
                "query": "star wars",
                "operator": "and"
            }
        }
    }
}
```

→ Chỉ doc có **cả** "star" và "wars". Star Trek bị loại.

### `minimum_should_match`

Compromise: cần ít nhất X tokens match:

```text
{
    "query": {
        "match": {
            "title": {
                "query": "star wars new hope",
                "minimum_should_match": "75%"
            }
        }
    }
}
```

→ 4 tokens × 75% = 3 phải match. Doc có 3+ token được trả.

## term — exact match

Search **không analyze**. Dùng cho `keyword`, numeric, boolean:

```text
GET /movies/_search
{
    "query": {
        "term": { "genre": "Sci-Fi" }
    }
}
```

→ Match doc có genre **chính xác** là "Sci-Fi" (case-sensitive).

→ `term: "sci-fi"` (lowercase) **không** match nếu data lưu "Sci-Fi".

### Khi nào dùng term?

- Tag, status, category (keyword fields).
- Numeric (ID, count).
- Boolean (is_active).
- Date exact (rare).

**Đừng** dùng term cho text field (vì text bị analyze, term không) — sẽ không match thường.

## terms — match 1 trong N

```text
GET /movies/_search
{
    "query": {
        "terms": { "genre": ["Sci-Fi", "Action", "Drama"] }
    }
}
```

→ Genre = Sci-Fi OR Action OR Drama.

## range — numeric/date

```text
GET /movies/_search
{
    "query": {
        "range": {
            "year": {
                "gte": "2010",
                "lt":  "2020"
            }
        }
    }
}
```

→ Year ≥ 2010 AND < 2020.

Operators: `gt`, `gte`, `lt`, `lte`.

Date math:

```text
{
    "range": {
        "release_date": {
            "gte": "now-7d/d",
            "lt":  "now/d"
        }
    }
}
```

→ 7 ngày trước, làm tròn về day.

## exists — field có giá trị

```text
GET /movies/_search
{
    "query": {
        "exists": { "field": "director" }
    }
}
```

→ Doc có field `director` (không null/missing).

Inverse (field không có): wrap trong `must_not`:

```text
{
    "query": {
        "bool": {
            "must_not": { "exists": { "field": "director" } }
        }
    }
}
```

## bool — combine queries

Combine N queries với AND, OR, NOT logic:

```text
{
    "query": {
        "bool": {
            "must":     [...],      // AND — affect score
            "filter":   [...],      // AND — no score, cacheable
            "should":   [...],      // OR — affect score
            "must_not": [...]       // NOT — no score
        }
    }
}
```

| Clause      | Match logic | Affects score | Cacheable |
|-------------|-------------|---------------|-----------|
| `must`      | AND         | ✅            | ❌        |
| `filter`    | AND         | ❌            | ✅        |
| `should`    | OR          | ✅            | ❌        |
| `must_not`  | NOT (AND)   | ❌            | ✅        |

→ **`must` vs `filter`**: same logic (AND) nhưng filter không score → faster.

### Example: complex query

"Movies thể loại Sci-Fi, **không** có 'trek' trong title, năm 2010-2015":

```text
GET /movies/_search
{
    "query": {
        "bool": {
            "must": [
                { "match": { "genre": "Sci-Fi" } }
            ],
            "must_not": [
                { "match": { "title": "trek" } }
            ],
            "filter": [
                {
                    "range": {
                        "year": { "gte": "2010", "lt": "2015" }
                    }
                }
            ]
        }
    }
}
```

→ Result: Interstellar (2014 Sci-Fi, không trek).

### `should` cho OR

```text
{
    "bool": {
        "must": [ { "match": { "title": "movie" } } ],
        "should": [
            { "term": { "genre": "Sci-Fi" } },
            { "term": { "genre": "Action" } }
        ]
    }
}
```

→ Phải có "movie" trong title; **boost score** nếu cũng có Sci-Fi hoặc Action.

→ `should` standalone (không có `must`): ít nhất 1 should phải match. Default behavior.

## multi_match — search nhiều field

```text
{
    "query": {
        "multi_match": {
            "query": "star wars",
            "fields": ["title", "description", "tags"]
        }
    }
}
```

→ Tìm "star wars" trong title HOẶC description HOẶC tags.

Boost field:

```text
"fields": ["title^3", "description"]
```

→ Match trong title score 3× hơn description.

## match_all & match_none

```text
{ "query": { "match_all": {} } }      // Trả mọi doc
{ "query": { "match_none": {} } }     // Trả 0 doc (rare)
```

→ Default khi không có query = `match_all`.

## Counter intuitive: text field + term

```text
{
    "query": {
        "term": { "title": "Star Wars" }
    }
}
```

→ Title là `text` → bị analyze thành `["star", "wars"]` ở index. `term` không analyze → tìm chuỗi exact "Star Wars" → **không có token nào** lưu như vậy → 0 results.

→ Lỗi kinh điển. **Quy tắc**:
- `match` cho text.
- `term` cho keyword / numeric / boolean.

## Constant score

Nếu cần score đều cho mọi filter match:

```text
{
    "query": {
        "constant_score": {
            "filter": {
                "term": { "genre": "Sci-Fi" }
            },
            "boost": 1.2
        }
    }
}
```

→ Mọi doc match score = 1.2. Faster than scoring.

## Tóm tắt

- **`match`** — full-text, analyzed. Default OR; `operator: and` cho AND.
- **`term`** — exact, không analyze. Dùng cho keyword/numeric.
- **`terms`** — 1 trong list values.
- **`range`** — numeric/date với gt/gte/lt/lte.
- **`exists`** — field có giá trị. Inverse qua `must_not`.
- **`bool`** — combine với must/filter/should/must_not.
  - `filter` faster (no score, cacheable).
  - `should` = OR + boost.
- **`multi_match`** — search nhiều field, boost qua `^N`.
- **Đừng `term` text field** — không match (vì text bị analyze).

---

→ [Bài tiếp theo: Phrase matching](03-phrase-matching.md)

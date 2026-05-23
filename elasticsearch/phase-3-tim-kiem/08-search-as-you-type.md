# Bài 8: Search-as-you-type với N-grams

Google search bar mỗi ký tự gõ ra ngay suggestion. ES có 3 cách thực hiện. Bài này: query-time (đơn giản), index-time (N-gram, fast), `search_as_you_type` type (modern).

## Cách 1: match_phrase_prefix (query-time)

Đơn giản nhất — không cần config special:

```text
GET /movies/_search
{
    "query": {
        "match_phrase_prefix": {
            "title": "star tr"
        }
    }
}
```

→ Match "star" + prefix "tr" cho từ cuối → "Star Trek".

User gõ:
- "s" → match Star Wars, Star Trek.
- "st" → match Star Wars, Star Trek.
- "star tr" → match Star Trek.

### Pros / Cons

**Pros**:
- 0 setup.
- Work với mọi text field.

**Cons**:
- Slow với data lớn (prefix scan).
- Score weird khi user gõ giữa chừng.
- Không scale.

→ OK cho POC. Production cần cách khác.

## Cách 2: N-grams (index-time)

**N-gram** = chuỗi N ký tự liên tiếp.

### Unigram, Bigram, Trigram

"star":
- **1-grams (unigrams)**: [s, t, a, r]
- **2-grams (bigrams)**: [st, ta, ar]
- **3-grams (trigrams)**: [sta, tar]
- **4-grams**: [star]

### Edge N-grams

Chỉ tính N-gram **bắt đầu từ đầu**:

"star" edge N-grams (1-4):
- [s, st, sta, star]

→ Map ngay với cách user gõ "s" → "st" → "sta" → "star".

### Setup analyzer custom

```text
PUT /autocomplete-test
{
    "settings": {
        "analysis": {
            "filter": {
                "autocomplete_filter": {
                    "type": "edge_ngram",
                    "min_gram": 1,
                    "max_gram": 20
                }
            },
            "analyzer": {
                "autocomplete": {
                    "type": "custom",
                    "tokenizer": "standard",
                    "filter": ["lowercase", "autocomplete_filter"]
                }
            }
        }
    },
    "mappings": {
        "properties": {
            "title": {
                "type": "text",
                "analyzer": "autocomplete",         ← Index time: build edge N-grams
                "search_analyzer": "standard"        ← Search time: bình thường
            }
        }
    }
}
```

**Quan trọng**: 2 analyzer khác nhau:

- **Index time** = `autocomplete` → mỗi từ split thành edge N-grams.
- **Search time** = `standard` → query analyzed bình thường (KHÔNG split N-gram).

→ Lý do: nếu search time cũng split, user gõ "star" → ["s", "st", "sta", "star"] → match cả từ chứa "s" → result garbage.

### Test analyzer

```text
POST /autocomplete-test/_analyze
{
    "analyzer": "autocomplete",
    "text": "Star"
}
```

Output:

```json
{
    "tokens": [
        { "token": "s", ... },
        { "token": "st", ... },
        { "token": "sta", ... },
        { "token": "star", ... }
    ]
}
```

→ 4 tokens. Index lưu cả 4.

### Insert + search

```text
PUT /autocomplete-test/_doc/1
{ "title": "Star Wars" }

PUT /autocomplete-test/_doc/2
{ "title": "Star Trek" }

PUT /autocomplete-test/_doc/3
{ "title": "Interstellar" }
```

Index "Star Wars" → tokens lưu: [s, st, sta, star, w, wa, war, wars].

Search "sta":

```text
GET /autocomplete-test/_search
{
    "query": { "match": { "title": "sta" } }
}
```

→ Match Star Wars + Star Trek (cả 2 đều có token "sta" trong index).

### Why edge_ngram?

Regular n-gram split mọi vị trí: "star" → [s, t, a, r, st, ta, ar, sta, tar, star]. Tốn space + match cả "tar" → có thể match "tara".

Edge n-gram chỉ từ đầu: match đúng autocomplete UX.

## Cách 3: `search_as_you_type` field type (modern, recommended)

ES 7.2+ có type dedicated:

```text
PUT /search-test
{
    "mappings": {
        "properties": {
            "title": {
                "type": "search_as_you_type"
            }
        }
    }
}
```

→ ES tự tạo **multiple sub-fields**:
- `title` (text, standard).
- `title._2gram` (bigram shingle).
- `title._3gram` (trigram shingle).
- `title._index_prefix` (edge n-gram).

### Search

```text
GET /search-test/_search
{
    "query": {
        "multi_match": {
            "query": "star tr",
            "type": "bool_prefix",
            "fields": [
                "title",
                "title._2gram",
                "title._3gram"
            ]
        }
    }
}
```

→ Use `multi_match` với type `bool_prefix` — match prefix cho từ cuối, regular cho các từ khác.

### Why prefer over N-gram custom?

- Less setup.
- ES tự tune optimization.
- Built-in best practices.

→ Production modern: dùng `search_as_you_type` thay vì custom N-gram (trừ khi cần ultra-control).

## Demo

```text
# Setup
PUT /products
{
    "mappings": {
        "properties": {
            "name": { "type": "search_as_you_type" }
        }
    }
}

POST /products/_bulk
{ "index": { "_id": 1 } }
{ "name": "iPhone 15 Pro" }
{ "index": { "_id": 2 } }
{ "name": "iPad Air" }
{ "index": { "_id": 3 } }
{ "name": "MacBook Pro" }

# User gõ "iP"
GET /products/_search
{
    "query": {
        "multi_match": {
            "query": "iP",
            "type": "bool_prefix",
            "fields": ["name", "name._2gram", "name._3gram"]
        }
    }
}
# → Match iPhone, iPad

# User gõ "iPhone 15"
GET /products/_search
{
    "query": {
        "multi_match": {
            "query": "iPhone 15",
            "type": "bool_prefix",
            "fields": ["name", "name._2gram", "name._3gram"]
        }
    }
}
# → Match iPhone 15 Pro (top), iPad (lower score).
```

## Performance comparison

| Method                    | Setup | Speed | Quality | Index size |
|---------------------------|-------|-------|---------|------------|
| `match_phrase_prefix`     | None  | Slow  | Medium  | Same       |
| Custom N-gram             | High  | Fast  | High    | 3-5× bigger |
| `search_as_you_type` type | Low   | Fast  | High    | 2-3× bigger |

→ Modern: dùng `search_as_you_type`.

## Completion suggester (alternative)

ES có **completion suggester** API riêng cho autocomplete:

```text
PUT /products
{
    "mappings": {
        "properties": {
            "suggest": {
                "type": "completion"
            }
        }
    }
}

POST /products/_doc/1
{
    "suggest": ["iPhone 15 Pro", "Apple iPhone 15"]
}

POST /products/_search
{
    "suggest": {
        "my-suggest": {
            "prefix": "iPh",
            "completion": {
                "field": "suggest"
            }
        }
    }
}
```

→ Tối ưu cho autocomplete pure. Storage cost cao. Phù hợp khi cần **explicit list** suggestion.

## ✨ Tổng kết Phase 3

Sau Phase 3:

- **Query Lite vs Query DSL** — JSON body production standard.
- **match / term / range / bool** — core queries.
- **must / filter / should / must_not** — bool clauses; filter faster cacheable.
- **match_phrase** — phrase với slop.
- **Pagination**: from/size limit 10K; deep pagination dùng `search_after`.
- **Sorting**: text cần `.keyword`; `_score` default.
- **Fuzzy** với Levenshtein distance, AUTO fuzziness.
- **Partial matching**: prefix (fast), wildcard (tránh leading *), regexp (slow).
- **Search-as-you-type**: `match_phrase_prefix`, N-grams custom, `search_as_you_type` type.

→ Phase 4: import data lớn (Logstash, FileBeat).

## Tóm tắt

- 3 cách search-as-you-type:
  1. **`match_phrase_prefix`** — simple, no setup, slow.
  2. **N-gram custom analyzer** — fast, manual config, control cao.
  3. **`search_as_you_type` type** — modern recommend.
- **Edge N-gram** = N-gram từ đầu chuỗi → khớp UX autocomplete.
- Index time analyzer khác search time analyzer — critical avoid match garbage.
- **Completion suggester** = API riêng, tối ưu pure autocomplete.

---

→ **Sẵn sàng?** [Phase 4: Import data](../phase-4-import-du-lieu/01-import-tools-tong-quan.md)

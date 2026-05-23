# Bài 6: Fuzzy queries — Tolerant typo

User gõ "intersteller" thay vì "interstellar" → vẫn muốn trả result. **Fuzzy search** giải quyết qua **Levenshtein distance**.

## Levenshtein distance

Số bước **substitute/insert/delete** ký tự để biến string A thành B.

```text
"interstellar"  →  "interstaller"   distance = 1 (substitute e → a)
"interstellar"  →  "intersteller"   distance = 1 (substitute a → e)
"interstellar"  →  "intrstellar"    distance = 1 (delete 'e')
"interstellar"  →  "interrstellar"  distance = 1 (insert 'r')
"interstellar"  →  "intersteler"    distance = 2 (substitute + delete)
```

→ Càng giống = distance càng thấp.

ES dùng concept này cho **fuzzy match**:

```text
{
    "query": {
        "fuzzy": {
            "title": {
                "value": "intersteller",
                "fuzziness": 1
            }
        }
    }
}
```

→ Match doc có token cách "intersteller" tối đa 1 edit. Match "interstellar" (distance 1).

## fuzziness levels

| Value      | Ý nghĩa                                       |
|------------|-----------------------------------------------|
| `0`        | No fuzziness (exact)                          |
| `1`        | Tối đa 1 edit                                  |
| `2`        | Tối đa 2 edits                                |
| `AUTO`     | Tự chọn dựa độ dài (recommended)               |

### AUTO

Default ES setting:

```text
"fuzziness": "AUTO"
```

Quy tắc AUTO:
- String 0-2 ký tự: fuzziness 0 (exact).
- String 3-5 ký tự: fuzziness 1.
- String > 5 ký tự: fuzziness 2.

→ Tự balance: short string không tolerate nhiều typo (vì 1 typo = % ký tự lớn).

Override:

```text
"fuzziness": "AUTO:4,7"
```

→ < 4 chars exact, 4-7 chars f=1, > 7 chars f=2.

## fuzzy trong match query

Thực tế ít dùng `fuzzy` standalone — dùng `match` với `fuzziness` parameter:

```text
{
    "query": {
        "match": {
            "title": {
                "query": "intersteller",
                "fuzziness": "AUTO"
            }
        }
    }
}
```

→ Match query với fuzzy tolerance. Better UX (cũng tokenize + analyze).

## Use case

- **Search bar** — user gõ nhanh sai.
- **Auto-complete** kết hợp với match_phrase_prefix.
- **Name search** — user spelling không chính xác (Tang vs Đặng, Smith vs Smyth).

## Limitation

### 1. Performance cost

Fuzzy = ES expand mỗi token thành **mọi từ trong distance** → check tất cả → slower hơn match thường.

→ Avoid fuzzy với data **rất lớn** + query throughput cao. Cân nhắc precomputed N-grams (bài 8).

### 2. Match quá lỏng

Fuzziness 2 trên short string → match cả từ không liên quan.

→ Default AUTO ok 90% case.

### 3. Không match cụm

Fuzzy work **per token**. "Inter stellar" (2 tokens) vẫn cần 2 token match. Phrase fuzziness limited.

## Demo

Dataset có "Interstellar":

```text
GET /movies/_search
{
    "query": {
        "match": {
            "title": "interstellar"          ← Exact
        }
    }
}
# → Match Interstellar.

GET /movies/_search
{
    "query": {
        "match": {
            "title": "intersteller"          ← Typo, no fuzziness
        }
    }
}
# → 0 results.

GET /movies/_search
{
    "query": {
        "match": {
            "title": {
                "query": "intersteller",
                "fuzziness": 1
            }
        }
    }
}
# → Match Interstellar (distance 1).

GET /movies/_search
{
    "query": {
        "match": {
            "title": {
                "query": "intrsteler",       ← Distance 2 (delete e, e→nothing)
                "fuzziness": 2
            }
        }
    }
}
# → Match Interstellar.
```

## Combine với bool

Fuzzy trong bool filter pattern:

```text
{
    "query": {
        "bool": {
            "must": [
                {
                    "match": {
                        "title": {
                            "query": "intersteller",
                            "fuzziness": "AUTO"
                        }
                    }
                }
            ],
            "filter": [
                { "range": { "year": { "gte": "2010" } } }
            ]
        }
    }
}
```

## Best practices

### 1. Default AUTO

90% case AUTO đủ. Override chỉ khi specific use.

### 2. Combine với boost

Original term score cao hơn fuzzy match:

```text
{
    "query": {
        "bool": {
            "should": [
                { "match": { "title": { "query": "interstellar", "boost": 10 } } },        ← Exact
                { "match": { "title": { "query": "interstellar", "fuzziness": "AUTO" } } } ← Fuzzy fallback
            ]
        }
    }
}
```

→ Exact match score 10×, fuzzy match score 1×. Exact ưu tiên.

### 3. Disable fuzzy cho field critical

`status: "active"` — không bao giờ muốn fuzzy match "actiev" → dùng `term` (exact).

## Tóm tắt

- **Fuzzy** = tolerate typo qua **Levenshtein distance** (edit count).
- **`fuzziness`**: 0/1/2 hoặc **AUTO** (recommended).
- Dùng trong `fuzzy` query hoặc `match` với param `fuzziness`.
- Cost performance — avoid với data huge.
- Combine với boost exact match → exact score cao hơn fuzzy.
- Default AUTO: short string strict, long string tolerant.

---

→ [Bài tiếp theo: Partial matching](07-partial-matching.md)

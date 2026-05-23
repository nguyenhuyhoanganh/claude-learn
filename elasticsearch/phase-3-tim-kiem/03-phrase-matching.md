# Bài 3: Phrase matching

`match` cho từng token rời rạc — "star wars" matches doc có "wars star" (sai thứ tự). Cần **phrase match** khi thứ tự quan trọng.

## Vấn đề

```text
GET /movies/_search
{
    "query": {
        "match": { "title": "star wars" }
    }
}
```

→ Match Star Wars (good), Star Trek (vì có "star"), War Horse (vì có "wars" stem).

→ Nếu chỉ muốn **đúng cụm "star wars"** liền nhau:

## match_phrase

```text
GET /movies/_search
{
    "query": {
        "match_phrase": { "title": "star wars" }
    }
}
```

→ Chỉ doc có "star" rồi liền "wars" trong title.

### Cơ chế

Inverted index ES lưu **position** của mỗi token. Phrase query check:
1. Doc có cả "star" và "wars"?
2. Position của "wars" = position("star") + 1?

→ Yes → match.

## slop — flexible phrase

Nếu chấp nhận từ chêm vào giữa:

```text
{
    "query": {
        "match_phrase": {
            "title": {
                "query": "star beyond",
                "slop": 2
            }
        }
    }
}
```

→ "Star X Y beyond" vẫn match (slop = 2 cho phép tối đa 2 từ giữa).

→ Match "Star Trek Beyond" (1 từ giữa, < slop 2).

### Slop large = proximity query

```text
{
    "match_phrase": {
        "title": {
            "query": "star beyond",
            "slop": 50
        }
    }
}
```

→ Match doc có "star" và "beyond" cách nhau tối đa 50 từ. Score giảm khi xa hơn → effectively proximity search.

Hữu ích cho document dài (article, book) — "tìm doc nói về star và beyond gần nhau".

### Slop và reverse order

Slop **cho phép đổi thứ tự** với cost = 2 (1 cho mỗi reversal):

- "star wars" với slop 2 → match "wars star" (reversed).
- "star wars" với slop 1 → KHÔNG match "wars star" (cần slop ≥ 2).

## Demo

```text
# Doc 1: title = "Star Wars"
# Doc 2: title = "Star Trek Beyond"
# Doc 3: title = "Beyond the Stars"

GET /movies/_search
{
    "query": {
        "match_phrase": { "title": "star wars" }
    }
}
# → Match doc 1 only.

GET /movies/_search
{
    "query": {
        "match_phrase": {
            "title": { "query": "star beyond", "slop": 1 }
        }
    }
}
# → Match doc 2 (1 từ "trek" giữa "star" và "beyond").
```

## match vs match_phrase use case

| Query             | Use case                                        |
|-------------------|-------------------------------------------------|
| `match`           | General search — relevance ranking matter       |
| `match_phrase`    | Quote-like search ("exact phrase")              |
| `match_phrase` + slop | Flexible phrase (1-2 word in between)        |
| `match_phrase` + slop lớn | Proximity (gần nhau, doc dài)              |

→ UI thường: input không quote → `match`. Input trong "quote" → `match_phrase`.

## match_phrase_prefix

Phrase + prefix cho từ cuối:

```text
{
    "query": {
        "match_phrase_prefix": { "title": "star wa" }
    }
}
```

→ Match "Star Wars", "Star Warriors" — "star" exact + "wa" prefix cho từ cuối.

→ Dùng cho **search as you type** (bài 8).

## Limitations

### 1. Slop số nhỏ làm score lệch

Slop 10 — doc với từ cách 1 và doc với từ cách 9 cùng match nhưng cùng score (default).

→ Dùng `match_phrase` strict nếu cần thứ tự exact.

### 2. Token analyzer phải khớp

Phrase match dùng cùng analyzer giữa index time và query time. Mismatch → 0 result.

→ Test với `POST /_analyze` để verify.

### 3. Performance

Phrase query đắt hơn term query 2-3× vì check position. Avoid với data lớn nếu OK với token match.

## Quote analysis

Stop words gây phiền:

```text
{
    "match_phrase": { "text": "to be or not to be" }
}
```

→ Nếu analyzer English có "to", "be", "or", "not" làm stop words → tokens lưu = ["be", "be"] → phrase fail.

→ Fix: dùng analyzer không stop word (vd `standard`) cho field có phrase quan trọng.

## Tóm tắt

- **`match_phrase`** = match token đúng thứ tự + liền kề.
- **`slop: N`** = cho phép N từ giữa hoặc reverse (cost 2).
- Slop lớn = proximity query (gần nhau ranks higher).
- **`match_phrase_prefix`** = phrase + prefix từ cuối (search-as-you-type).
- Cơ chế: inverted index lưu position → check position adjacent.
- Performance cost 2-3× vs `match`.
- Cẩn thận stop word — break phrase nếu analyzer remove.

---

→ [Bài tiếp theo: Pagination và Sorting](04-pagination-va-sorting.md)

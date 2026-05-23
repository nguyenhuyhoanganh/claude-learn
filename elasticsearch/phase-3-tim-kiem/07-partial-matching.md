# Bài 7: Partial matching — prefix, wildcard, regexp

Search "201" → match "2010", "2011", "2014" — **prefix matching**. Bài này: 3 cách partial match + trade-off performance.

## prefix query

Match document có token bắt đầu bằng string:

```text
GET /movies/_search
{
    "query": {
        "prefix": {
            "year": "201"
        }
    }
}
```

→ Match 2010, 2011, ..., 2019.

→ Field phải là `text` hoặc `keyword`. **Không** dùng với numeric/date.

### Cơ chế

Inverted index sorted alphabetically. Tìm prefix "201" → seek to "201" → scan forward đến hết "201xxx" → return matching docs. Khá nhanh.

→ Performance OK cho prefix ngắn (1-3 chars). Prefix dài chậm hơn (range scan rộng).

## wildcard query

Match pattern với `*` (any chars) và `?` (1 char):

```text
GET /movies/_search
{
    "query": {
        "wildcard": {
            "title": "star*"
        }
    }
}
```

→ Match "star", "stars", "starwars", "star trek beyond".

```text
{
    "wildcard": {
        "year": "201?"
    }
}
```

→ Match "2010", "2011", ..., "2019" (4 chars, starts "201").

```text
{
    "wildcard": {
        "title": "*wars*"
    }
}
```

→ Match doc có "wars" anywhere — bao gồm "Star Wars", "War Horse", "Wars of Roses".

### Performance warning

**Leading wildcard** (`*xxx`) cực chậm:
- ES không seek index được — phải scan ALL terms.
- Avoid với data lớn.

→ ES disable `*xxx` mặc định cho text field. Bật:

```text
PUT /idx
{
    "mappings": {
        "properties": {
            "title": {
                "type": "text",
                "index_phrases": true
            }
        }
    }
}
```

→ Phụ thuộc setting.

Best: tránh hoàn toàn leading wildcard. Dùng reverse index hoặc N-gram (bài 8).

## regexp query

Pattern phức tạp với regex syntax:

```text
GET /movies/_search
{
    "query": {
        "regexp": {
            "title": "s.*r"
        }
    }
}
```

→ Match doc có token bắt đầu "s", kết thúc "r": "Star", "Sender", "Server"...

Full regex syntax: `[a-z]`, `+`, `?`, `{n,m}`, alternation `|`...

### Limitations

- Chỉ apply trên **1 token** (không cross-token regex).
- Cực chậm. Avoid trong production search.
- Lucene regex syntax không 100% match POSIX/PCRE — đọc docs.

## Use case

| Need                            | Use                                    |
|---------------------------------|----------------------------------------|
| Autocomplete (year, ID)         | `prefix`                                |
| Pattern with wildcards          | `wildcard` (tránh leading `*`)         |
| Complex pattern (1 token)       | `regexp` (tránh production)            |
| Search-as-you-type              | N-gram (bài 8) hoặc `search_as_you_type` type |

## Demo

```text
# Index movies có year field (text)
PUT /movies-test
{
    "mappings": {
        "properties": {
            "year": { "type": "keyword" }
        }
    }
}

POST /movies-test/_bulk
{ "index": { "_id": 1 } }
{ "year": "2014" }
{ "index": { "_id": 2 } }
{ "year": "2015" }
{ "index": { "_id": 3 } }
{ "year": "1999" }

# Prefix
GET /movies-test/_search
{
    "query": { "prefix": { "year": "201" } }
}
# → 2 hits (2014, 2015)

# Wildcard
GET /movies-test/_search
{
    "query": { "wildcard": { "year": "1*" } }
}
# → 1 hit (1999)
```

## Term-level queries family

Prefix, wildcard, regexp đều thuộc nhóm **term-level**:
- Không analyze query string.
- Match từng token raw trong index.

So với `match` (analyze + search):

```text
# match: analyze "Star" → "star" → search lower-case token
{ "match": { "title": "Star" } }       

# prefix: search exact "Star" prefix (raw)
{ "prefix": { "title": "Star" } }       # → search "Star..." (case-sensitive!)
{ "prefix": { "title": "star" } }       # → search "star..." (match lowercase in index)
```

→ Term-level cần lowercase manually nếu field analyzed standard.

## Performance ranking

| Query type     | Speed | Use case                            |
|----------------|-------|-------------------------------------|
| `term`         | Fast  | Exact match                         |
| `prefix` (short) | Fast | Autocomplete (3-5 chars)            |
| `match`        | Fast  | Full-text search                    |
| `range`        | Fast  | Numeric/date                        |
| `match_phrase` | Medium | Phrase                             |
| `fuzzy`        | Slow  | Typo tolerance                      |
| `wildcard` (no leading *) | Medium | Pattern                  |
| `wildcard` (leading *) | **Very slow** | Avoid                |
| `regexp`       | Slow  | Complex pattern, 1 token            |

→ Plan accordingly. Test trên data thật.

## Pitfall

### Pitfall 1: prefix với text field analyzed

```text
"prefix": { "title": "Star" }      # Field analyzed lowercase
```

→ Token index = "star" (lowercase). Search "Star" prefix → 0 results.

→ Fix: lowercase query manually hoặc dùng `match`.

### Pitfall 2: leading wildcard accidentally

```text
"wildcard": { "name": "*smith" }
```

→ Scan toàn index. 10M doc = chục giây query. **Avoid**.

### Pitfall 3: regexp catastrophic backtracking

```text
"regexp": { "field": "(a+)+b" }
```

→ Regex evaluator exponential time. Crash ES.

→ Avoid nested quantifier in regex.

## Tóm tắt

- **`prefix`** — token bắt đầu bằng string. Fast cho prefix ngắn.
- **`wildcard`** — pattern với `*` `?`. **Tránh leading wildcard**.
- **`regexp`** — regex syntax, 1 token, slow.
- Term-level queries không analyze → cần match case index.
- Performance: `prefix` >> `wildcard` >> `regexp`.
- Search-as-you-type production: dùng N-gram (bài 8) hoặc `search_as_you_type` type.

---

→ [Bài tiếp theo: Search-as-you-type với N-grams](08-search-as-you-type.md)

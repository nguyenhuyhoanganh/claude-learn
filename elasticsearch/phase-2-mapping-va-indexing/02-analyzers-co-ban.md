# Bài 2: Analyzers cơ bản và Mapping

**Mapping** = schema cho index. **Analyzer** = pipeline xử lý text trước khi index. Bài này: hiểu 2 khái niệm, tạo mapping cho `movies` index.

## Mapping là gì?

Mapping định nghĩa **type của mỗi field** + **cách index**. Tương tự `CREATE TABLE` trong SQL nhưng linh hoạt hơn (có dynamic mapping).

```text
PUT /movies
{
    "mappings": {
        "properties": {
            "id":           { "type": "integer" },
            "title":        { "type": "text" },
            "year":         { "type": "date" },
            "genre":        { "type": "keyword" }
        }
    }
}
```

→ Mỗi field có type. ES enforce type khi index document.

### Vì sao mapping quan trọng?

Có 3 trường hợp ES cần biết type:

1. **Index**: làm sao xử lý value? (số → numeric tree, text → inverted index, date → date math).
2. **Search**: query trả đúng kết quả? (range chỉ work với numeric/date).
3. **Sort/Aggregate**: cần doc values (text default không có).

→ Sai type = sai search / sort.

## Dynamic mapping

Nếu **không** define mapping, ES auto-detect khi insert document đầu tiên:

```text
PUT /movies/_doc/1
{
    "title": "Inception",
    "year": 2010,
    "rating": 8.7,
    "release_date": "2010-07-16"
}
```

ES detect:
- `title` = string → `text` + `keyword` multi-field.
- `year` = number → `long`.
- `rating` = number with decimal → `float`.
- `release_date` = ISO 8601 string → `date`.

→ Tiện cho prototyping, **nguy hiểm production**:

- Document 1 có `port: 80` → mapped int. Document 2 có `port: "80"` → fail.
- Field tự sinh nhiều → mapping explosion (bài 8 sẽ giải thích).

→ Production: **explicit mapping**.

## Tạo mapping cho `movies`

Tạo lại index (nếu đã có):

```text
DELETE /movies

PUT /movies
{
    "mappings": {
        "properties": {
            "id":     { "type": "integer" },
            "year":   { "type": "date" },
            "genre":  { "type": "keyword" },
            "title":  { 
                "type": "text",
                "analyzer": "english"
            }
        }
    }
}
```

- **`id`** integer.
- **`year`** date — ES sẽ accept "2010", "2010-07-16", epoch timestamp...
- **`genre`** keyword — exact match (genre "Action" ≠ "action").
- **`title`** text + analyzer English (xử lý stop words, stem English).

Verify:

```text
GET /movies/_mapping
```

## Analyzer là gì?

**Analyzer** = pipeline 3 bước xử lý text **khi index** và **khi search**:

```text
Raw text                          
   │
   ▼
┌───────────────────────────┐
│  1. Character filters     │   (vd: bỏ HTML tag, &amp; → and)
└───────────────────────────┘
   │
   ▼
┌───────────────────────────┐
│  2. Tokenizer             │   (vd: split theo whitespace, punctuation)
└───────────────────────────┘
   │
   ▼
┌───────────────────────────┐
│  3. Token filters         │   (vd: lowercase, stem, stop words, synonyms)
└───────────────────────────┘
   │
   ▼
Final tokens → inverted index
```

Ví dụ với English analyzer:

```text
Input: "The Quick Brown Foxes Jumped Over the Lazy Dogs"
   │
   │ (1) Character filter: không đổi
   ▼
"The Quick Brown Foxes Jumped Over the Lazy Dogs"
   │
   │ (2) Tokenizer (standard): split whitespace + punctuation
   ▼
["The", "Quick", "Brown", "Foxes", "Jumped", "Over", "the", "Lazy", "Dogs"]
   │
   │ (3a) Lowercase
   ▼
["the", "quick", "brown", "foxes", "jumped", "over", "the", "lazy", "dogs"]
   │
   │ (3b) Stop words (English): bỏ "the", "over"
   ▼
["quick", "brown", "foxes", "jumped", "lazy", "dogs"]
   │
   │ (3c) Stem: jumped → jump, foxes → fox, dogs → dog
   ▼
["quick", "brown", "fox", "jump", "lazi", "dog"]
   │
   ▼
Index: ["quick", "brown", "fox", "jump", "lazi", "dog"]
```

→ Search "fox" match "Foxes"! Vì cả 2 đều stem về "fox".

## Built-in analyzers

| Analyzer            | Tokenizer        | Token filters                            | Use case                    |
|---------------------|------------------|------------------------------------------|------------------------------|
| **standard**        | Standard (whitespace + punctuation) | lowercase | Default, general purpose     |
| **simple**          | Lowercase         | (built-in lowercase) split không-letter  | Cực đơn giản                  |
| **whitespace**      | Whitespace       | (none)                                    | Giữ case, không filter      |
| **stop**            | Lowercase        | + stop words English                     | English content, basic      |
| **keyword**         | Keyword (no split) | (none)                                  | Treat full string as one token |
| **english/french/...**| Standard       | Lowercase + stop + stem + possessive     | Per-language full-text       |
| **pattern**         | Pattern (regex)  | lowercase                                | Custom split rule           |

→ Default = `standard` cho text field nếu không specify.

## Test analyzer

ES có endpoint `_analyze` test analyzer trên text bất kỳ:

```text
POST /_analyze
{
    "analyzer": "english",
    "text": "The Quick Brown Foxes Jumped Over the Lazy Dogs"
}
```

Response:

```json
{
    "tokens": [
        { "token": "quick", "start_offset": 4, "end_offset": 9, "position": 1 },
        { "token": "brown", "start_offset": 10, "end_offset": 15, "position": 2 },
        { "token": "fox",   "start_offset": 16, "end_offset": 21, "position": 3 },
        { "token": "jump",  "start_offset": 22, "end_offset": 28, "position": 4 },
        { "token": "lazi",  "start_offset": 34, "end_offset": 38, "position": 5 },
        { "token": "dog",   "start_offset": 39, "end_offset": 43, "position": 6 }
    ]
}
```

→ Verify cách tokenize trước khi index.

So sánh `standard`:

```text
POST /_analyze
{
    "analyzer": "standard",
    "text": "The Quick Brown Foxes Jumped Over the Lazy Dogs"
}
```

→ Output: ["the", "quick", "brown", "foxes", "jumped", "over", "the", "lazy", "dogs"]. **Không** stem, **không** stop word.

→ Search "fox" sẽ **không** match "Foxes" với standard. **Match** với english.

## Multi-field

ES có thể index **cùng field theo nhiều analyzer**:

```text
"title": {
    "type": "text",
    "analyzer": "english",
    "fields": {
        "raw":     { "type": "keyword" },        // exact, sort, agg
        "spanish": { "type": "text", "analyzer": "spanish" }   // Spanish version
    }
}
```

Search:
- `title` → English analyzer.
- `title.raw` → exact match (no analyze).
- `title.spanish` → Spanish analyzer.

→ Linh hoạt. Cost: storage tăng (mỗi sub-field index riêng).

## Custom analyzer

Trộn character filter + tokenizer + token filter tự design:

```text
PUT /custom-index
{
    "settings": {
        "analysis": {
            "analyzer": {
                "my_analyzer": {
                    "type": "custom",
                    "char_filter": ["html_strip"],
                    "tokenizer": "standard",
                    "filter": ["lowercase", "stop", "snowball"]
                }
            }
        }
    },
    "mappings": {
        "properties": {
            "content": {
                "type": "text",
                "analyzer": "my_analyzer"
            }
        }
    }
}
```

→ Strip HTML → split → lowercase → stop words → stem (snowball).

## text vs keyword recap

| Aspect              | `text`                          | `keyword`                       |
|---------------------|----------------------------------|---------------------------------|
| Analyzed?           | ✅ (split tokens)                | ❌ (treated as whole)            |
| Full-text search    | ✅                              | ❌ (chỉ exact)                   |
| Sort                | ❌ (cần fielddata=true, ác)      | ✅                              |
| Aggregate           | ❌ (cùng vấn đề)                 | ✅                              |
| Case sensitive search | Tuỳ analyzer                   | ✅ (sensitive)                   |

→ Best practice: dùng **multi-field** với cả text + keyword cho field có thể search lẫn aggregate (title, name, description).

## Pitfall

### Pitfall 1: change mapping runtime

```text
PUT /movies/_mapping
{
    "properties": {
        "title": { "type": "keyword" }       // Đã là text rồi
    }
}
```

→ FAIL. Không đổi type field đã có. Phải reindex sang index mới.

### Pitfall 2: dynamic mapping cho production

```text
PUT /logs/_doc/1
{
    "user": { "name": "alice", "email": "alice@example.com" }
}

PUT /logs/_doc/2
{
    "user": "bob"          // String, không phải object
}
```

→ FAIL. ES expect `user` là object (theo doc 1).

→ Production: explicit mapping, set `dynamic: "strict"` để fail nếu field không có trong mapping.

## Tóm tắt

- **Mapping** = schema. Tự define hoặc dynamic detect.
- **Analyzer** = char filter → tokenizer → token filter pipeline.
- Built-in analyzer: `standard` (default), `english`, `keyword`, `whitespace`...
- **`text`** analyzed, **`keyword`** raw. Multi-field cho cả 2.
- Test analyzer bằng `POST /_analyze`.
- Custom analyzer = chọn char_filter + tokenizer + filter.
- **Mapping change** runtime = không đổi field đã có. Reindex là cách duy nhất.

---

→ [Bài tiếp theo: REST import đơn lẻ](03-rest-import-don-le.md)

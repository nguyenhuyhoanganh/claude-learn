# Bài 4: Document và Index

Mọi data trong Elasticsearch nằm trong 2 khái niệm: **Document** (đơn vị data) và **Index** (collection của documents).

## Document

**Document** = đơn vị **nhỏ nhất** trong ES. Tương tự **row** trong SQL hoặc **object** trong NoSQL.

Format: **JSON** (luôn luôn).

Ví dụ document phim:

```json
{
    "title": "The Matrix",
    "year": 1999,
    "genre": ["sci-fi", "action"],
    "director": "Wachowski",
    "rating": 8.7,
    "release_date": "1999-03-31"
}
```

→ Mỗi field có **type** (string, number, date, array, object...). ES tự detect (dynamic mapping) hoặc bạn define trước (explicit mapping — Phase 2).

### Document ID

Mỗi document có **`_id`** unique trong index. Có 3 cách:

1. **Tự gán**:
   ```text
   PUT /movies/_doc/123
   { ... }
   ```
   → `_id = "123"`.

2. **ES tự sinh**:
   ```text
   POST /movies/_doc
   { ... }
   ```
   → `_id` random (vd `"AbcXyz123"`).

3. **Bulk** — tự gán trong từng entry (Phase 2).

→ Tự gán khi data có natural ID (UUID, primary key DB). Auto-gen khi không có (log event, metrics).

### Metadata fields

Mỗi document có metadata bắt đầu `_`:

```json
{
    "_index": "movies",          // index chứa
    "_id": "123",                // document ID
    "_version": 1,               // version (tăng mỗi update)
    "_source": { ... },          // data gốc bạn gửi
    "_score": 0.8                // chỉ trong search response — relevance
}
```

`_source` = JSON gốc bạn lưu. ES return cái này khi GET document.

## Index

**Index** = collection của documents **cùng schema** (đại khái — có thể mixed nhưng best practice là cùng).

Tương tự:

| SQL              | Elasticsearch      |
|------------------|--------------------|
| Database         | Cluster            |
| Table            | Index              |
| Row              | Document           |
| Column           | Field              |
| Schema           | Mapping            |
| Primary key      | _id                |

→ Mỗi index có:
- **Mapping** (schema) — định nghĩa type của mỗi field.
- **Settings** — số shard, replica, analyzer.
- **Aliases** — tên alias trỏ vào index (advanced — Phase 8).

### Tạo index

```text
PUT /movies
```

→ Tạo index `movies` với default settings.

Custom settings:

```text
PUT /movies
{
    "settings": {
        "number_of_shards": 3,
        "number_of_replicas": 1
    },
    "mappings": {
        "properties": {
            "title":    { "type": "text" },
            "year":     { "type": "integer" },
            "rating":   { "type": "float" },
            "release_date": { "type": "date" },
            "genre":    { "type": "keyword" }
        }
    }
}
```

- **`number_of_shards: 3`** — chia thành 3 primary shard (không đổi được sau!).
- **`number_of_replicas: 1`** — mỗi shard có 1 replica.
- **`mappings.properties`** — schema.

### Field types phổ biến

| Type        | Use case                                          | Search behavior              |
|-------------|---------------------------------------------------|------------------------------|
| `text`      | Full-text (description, content)                  | Analyzed (split words)       |
| `keyword`   | Exact match (category, status, ID)                | Not analyzed                 |
| `integer`   | Số nguyên                                          | Exact + range                |
| `long`      | Số 64-bit                                          | Exact + range                |
| `float`     | Số thập phân                                       | Exact + range                |
| `date`      | Ngày tháng (ISO 8601, epoch...)                   | Range, date math             |
| `boolean`   | true/false                                         | Exact                        |
| `geo_point` | Lat/lon                                            | Geo query                    |
| `nested`    | Array of objects (preserve relationship)          | Special query                |
| `object`    | Nested JSON                                        | Flattened (default)          |

### Quan trọng: text vs keyword

```json
{ "title": "The Matrix Reloaded" }
```

- Nếu `title` là **`text`**:
  - ES splits thành tokens: `["the", "matrix", "reloaded"]`.
  - Search "matrix" → match (vì 1 trong các tokens).
  - Search "The Matrix Reloaded" exact → cũng match.
  - **Cannot sort, aggregate** on text field (default).

- Nếu `title` là **`keyword`**:
  - Treated as single value `"The Matrix Reloaded"`.
  - Search "matrix" → KHÔNG match (vì không exact).
  - Search "The Matrix Reloaded" → match.
  - **Can sort, aggregate**.

→ Trade-off. ES default tạo **cả 2** (multi-field):

```json
{
    "title": { 
        "type": "text",
        "fields": {
            "keyword": { "type": "keyword" }
        }
    }
}
```

Dùng:
- `title` cho full-text search.
- `title.keyword` cho exact, sort, aggregate.

## CRUD trên document

### CREATE

Auto ID:

```text
POST /movies/_doc
{
    "title": "Inception",
    "year": 2010
}
```

Response:

```json
{
    "_index": "movies",
    "_id": "AbcXyz...",       // ES generated
    "_version": 1,
    "result": "created"
}
```

Explicit ID:

```text
PUT /movies/_doc/100
{
    "title": "The Matrix",
    "year": 1999
}
```

### READ

```text
GET /movies/_doc/100
```

Response:

```json
{
    "_index": "movies",
    "_id": "100",
    "_version": 1,
    "found": true,
    "_source": {
        "title": "The Matrix",
        "year": 1999
    }
}
```

Nếu không tồn tại:

```json
{
    "_index": "movies",
    "_id": "999",
    "found": false
}
```

HTTP 404.

### UPDATE

3 cách:

**1. Full update (replace)** — PUT với cùng ID:

```text
PUT /movies/_doc/100
{
    "title": "The Matrix",
    "year": 1999,
    "rating": 8.7              // field mới
}
```

→ Replaces toàn bộ document. **Field cũ không có trong PUT** thì **mất**.

**2. Partial update**:

```text
POST /movies/_update/100
{
    "doc": {
        "rating": 9.0
    }
}
```

→ Chỉ update field `rating`, giữ nguyên field khác.

**3. Update by script**:

```text
POST /movies/_update/100
{
    "script": {
        "source": "ctx._source.rating = ctx._source.rating + 0.1"
    }
}
```

→ Painless script (DSL của ES).

### DELETE

```text
DELETE /movies/_doc/100
```

Response:

```json
{
    "_id": "100",
    "_version": 2,
    "result": "deleted"
}
```

Document gone. Search không thấy nữa.

> Internally ES **mark deleted** (tombstone) → physical disk free khi segment merge. Vì thế xoá hàng triệu doc không immediate free disk.

## Cluster — context cao hơn Index

```text
Cluster
├── Index "movies"
│   ├── Shard 0 (primary)
│   ├── Shard 0 (replica)
│   ├── Shard 1 (primary)
│   └── Shard 1 (replica)
├── Index "users"
└── Index "logs-2026-01-05"
```

- **Cluster** = nhiều **node** (Elasticsearch process).
- 1 cluster có nhiều **index**.
- 1 index có nhiều **shard**.
- 1 shard có (optional) **replica**.

→ Bài 6 deep dive.

## Naming convention

- **Index name**: lowercase, không dấu, không space, không bắt đầu `_` hay `-`.
- Length ≤ 255 bytes.

Best practice:
- `users` (đơn giản)
- `logs-app-2026.01.05` (time-based)
- `orders-prod-v2` (env + version)

## Một vài "best practice"

### Một type / index

ES 6.x cho phép multiple type / index (`/movies/movie/1`, `/movies/actor/1`). **Bị deprecated trong 7.x** → mỗi index 1 type implicit (`_doc`).

→ ES 8+ chỉ còn `_doc`. Bỏ qua type khái niệm cũ.

### Index name pattern

Time-based index cho log:

```text
logs-2026-01-05
logs-2026-01-06
logs-2026-01-07
```

→ Tách theo ngày. Query qua wildcard hoặc alias:

```text
GET /logs-2026-01-*/_search
```

→ Easy delete old indices (Phase 8 ILM).

### Đừng tạo quá nhiều index

Mỗi index ăn ~50-200 MB RAM heap (mapping, shard overhead). Hàng nghìn index → heap nổ.

→ Dùng **alias** + **rollover** thay vì index per user.

## Tóm tắt

- **Document** = JSON đơn vị nhỏ nhất. Có `_id` unique, `_source` = data gốc.
- **Index** = collection document, có **mapping** (schema) + **settings**.
- Field types phổ biến: `text` (analyzed), `keyword` (exact), `integer`, `date`, `geo_point`...
- **`text` vs `keyword`**: text cho full-text search, keyword cho exact + sort + aggregate. Default tạo cả 2 (multi-field).
- CRUD: `PUT /index/_doc/id` (create/replace), `POST /index/_update/id` (partial), `DELETE /index/_doc/id`.
- Cluster > Index > Shard > Document hierarchy.
- ES 7+ chỉ còn 1 type implicit `_doc` per index.

---

→ [Bài tiếp theo: Inverted index và TF-IDF](05-inverted-index-va-tf-idf.md)

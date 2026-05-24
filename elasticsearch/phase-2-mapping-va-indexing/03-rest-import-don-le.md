# Bài 3: Import document đơn lẻ qua REST

Có mapping. Giờ insert document.

## PUT — explicit ID

Insert movie Interstellar (movieId = 109487):

```text
PUT /movies/_doc/109487
{
    "id": 109487,
    "title": "Interstellar",
    "year": "2014",
    "genre": ["IMAX", "Sci-Fi"]
}
```

Response:

```json
{
    "_index": "movies",
    "_id": "109487",
    "_version": 1,
    "result": "created",
    "_shards": { "total": 2, "successful": 1, "failed": 0 },
    "_seq_no": 0,
    "_primary_term": 1
}
```

Quan trọng:

- **`result: "created"`** — document mới được tạo.
- **`_version: 1`** — version đầu.
- **`_seq_no`** + **`_primary_term`** — dùng cho optimistic concurrency control (bài 6).

## POST — auto-generate ID

Khi không có natural ID:

```text
POST /movies/_doc
{
    "title": "Some Movie",
    "year": "2020"
}
```

Response:

```json
{
    "_index": "movies",
    "_id": "AbcXyz123...",       // ES random
    "_version": 1,
    "result": "created"
}
```

→ Phù hợp log event, metric — không có natural ID.

## GET document

```text
GET /movies/_doc/109487
```

Response:

```json
{
    "_index": "movies",
    "_id": "109487",
    "_version": 1,
    "_seq_no": 0,
    "_primary_term": 1,
    "found": true,
    "_source": {
        "id": 109487,
        "title": "Interstellar",
        "year": "2014",
        "genre": ["IMAX", "Sci-Fi"]
    }
}
```

→ `_source` = data gốc.

Không tồn tại:

```json
{
    "_index": "movies",
    "_id": "999",
    "found": false
}
```

HTTP 404.

### Chỉ lấy `_source`

```text
GET /movies/_source/109487
```

→ Chỉ trả phần `_source`, không metadata.

### Lọc field

```text
GET /movies/_doc/109487?_source=title,year
```

→ Chỉ trả title + year. Giảm response size.

## Verify với search

Sau insert vài document:

```text
GET /movies/_search
{
    "query": { "match_all": {} }
}
```

→ Trả top 10 documents.

Đếm:

```text
GET /movies/_count
```

```json
{ "count": 1, ... }
```

## Date format

Field `year` define `date` trong mapping. ES accept nhiều format:

```text
"year": "2014"                              ← year only
"year": "2014-07-16"                        ← ISO date
"year": "2014-07-16T00:00:00Z"              ← ISO datetime UTC
"year": 1405555200000                       ← epoch milliseconds
```

→ ES parse tự động. Internally lưu epoch ms.

Custom format:

```text
"year": {
    "type": "date",
    "format": "yyyy || yyyy-MM-dd || epoch_millis"
}
```

`||` = OR. List nhiều format ES accept.

## Field validation

Insert document sai type:

```text
PUT /movies/_doc/2
{
    "id": "not a number",       // ❌ id mapped int
    "title": "Test"
}
```

Response:

```json
{
    "error": {
        "type": "mapper_parsing_exception",
        "reason": "failed to parse field [id] of type [integer]"
    },
    "status": 400
}
```

→ HTTP 400. Document **không** index.

### `ignore_malformed`

Force ES skip field lỗi thay vì fail:

```text
PUT /movies
{
    "settings": {
        "index.mapping.ignore_malformed": true
    },
    "mappings": { ... }
}
```

→ Field lỗi bị skip, document vẫn index, field đó vào `_ignored`.

→ Trade-off: data inconsistent.

## Insert chỉ field cần

ES dynamic mapping = thêm field mới on-the-fly:

```text
PUT /movies/_doc/3
{
    "title": "New Movie",
    "year": "2020",
    "director": "Christopher Nolan"           // ← Field mới
}
```

→ ES tự add `director` vào mapping (text + keyword multi-field).

Check:

```text
GET /movies/_mapping
```

→ Thấy `director` mới xuất hiện.

→ Lợi: flexible. Hại: mapping explosion (bài 8).

Disable dynamic:

```text
PUT /movies
{
    "mappings": {
        "dynamic": "strict",          // Reject field không có trong mapping
        "properties": { ... }
    }
}
```

→ Insert field không khai báo → fail.

Hoặc `"dynamic": "false"` — accept document, nhưng field mới **không index** (chỉ lưu trong `_source`).

## Replace document

`PUT` cùng ID = **replace toàn bộ**:

```text
PUT /movies/_doc/109487
{
    "title": "Interstellar (Director's Cut)"
}
```

→ Document mới chỉ có `title`. Mọi field cũ **mất** (id, year, genre).

→ Cẩn thận. Nếu chỉ update 1 field → dùng `_update` (bài 5).

## Tóm tắt

- **`PUT /idx/_doc/<id>`** — create hoặc replace với ID cụ thể.
- **`POST /idx/_doc`** — create với ID auto-gen.
- **`GET /idx/_doc/<id>`** — get document. `?_source=field1,field2` để filter.
- Response có `_version`, `_seq_no`, `_primary_term` — quan trọng cho concurrency.
- Date field accept nhiều format, internal lưu epoch ms.
- Type mismatch = HTTP 400. `ignore_malformed: true` skip lỗi.
- Dynamic mapping flexible nhưng nguy hiểm. `dynamic: "strict"` cho production.
- `PUT` = full replace, mọi field cũ mất nếu không có trong body. Update field riêng → `_update`.

---

→ [Bài tiếp theo: Bulk API](04-bulk-api.md)

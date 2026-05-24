# Bài 3: REST API và curl

Elasticsearch là **server REST + JSON**. Hiểu REST = hiểu cách giao tiếp với Elasticsearch. Bài này: refresher REST, dùng curl, dùng Kibana Dev Tools (cách khoá học dùng chính).

## REST refresher

**REST** (Representational State Transfer) = pattern thiết kế API qua HTTP. Đặc trưng:

- **Client-server** — tách rời UI và data.
- **Stateless** — mỗi request tự đứng vững, server không lưu session.
- **Resource-based** — mỗi URL = resource (vd `/users/42`).
- **Standard HTTP verbs** — GET, POST, PUT, DELETE...

### HTTP verbs trong Elasticsearch

| Verb     | Ý nghĩa                                      | Ví dụ ES                       |
|----------|----------------------------------------------|--------------------------------|
| **GET**  | Đọc data, không thay đổi state               | Tìm document, list index       |
| **POST** | Tạo mới hoặc trigger action                  | Tạo document (ID tự sinh), search |
| **PUT**  | Tạo / update với ID cụ thể                   | Tạo index, tạo document ID = X |
| **DELETE** | Xoá                                        | Xoá document, xoá index        |
| **HEAD** | Check tồn tại (không return body)            | Check index exists             |

### HTTP request structure

```text
PUT /movies/_doc/1                          ← method + path
Content-Type: application/json              ← header

{                                           ← body (JSON)
    "title": "Inception",
    "year": 2010
}
```

5 phần:

- **Method** (verb) — GET/POST/PUT/DELETE...
- **Path / URL** — `/index/_type/id` cho ES.
- **Protocol** — HTTP/1.1, HTTPS.
- **Headers** — metadata, vd `Content-Type`.
- **Body** — payload, thường JSON.

### HTTP response

```text
HTTP/1.1 201 Created                        ← status code
Content-Type: application/json

{                                           ← body
    "_index": "movies",
    "_id": "1",
    "_version": 1,
    "result": "created"
}
```

Status code:

- `2xx` — success (200 OK, 201 Created, 204 No Content).
- `3xx` — redirect.
- `4xx` — client error (400 Bad Request, 404 Not Found, 409 Conflict).
- `5xx` — server error (500 Internal Server Error, 503 Service Unavailable).

## Gọi Elasticsearch với curl

```bash
curl -X GET "http://localhost:9200/"
```

- `-X GET` — method.
- `"http://localhost:9200/"` — URL.

Output (pretty):

```bash
curl -X GET "http://localhost:9200/" | jq
```

Hoặc dùng `?pretty`:

```bash
curl -X GET "http://localhost:9200/?pretty"
```

→ ES tự pretty-print JSON.

### Gửi body JSON

```bash
curl -X POST "http://localhost:9200/movies/_search?pretty" \
    -H "Content-Type: application/json" \
    -d '{
        "query": {
            "match": { "title": "inception" }
        }
    }'
```

- `-H "Content-Type: application/json"` **bắt buộc** (ES 6+).
- `-d` (data) — JSON body.

### Curl shortcut

Curl mỗi lần gõ `-H "Content-Type: application/json"` mệt. Cài alias trong `.bashrc`:

```bash
alias curles='curl -H "Content-Type: application/json"'
```

Dùng:

```bash
curles -X POST "http://localhost:9200/movies/_search?pretty" -d '...'
```

→ Gọn hơn 1 chút.

## Cách tốt hơn: Kibana Dev Tools

Curl OK nhưng:
- Phải escape quote phức tạp.
- Multi-line JSON khó gõ.
- Không có syntax highlight / autocomplete.

**Kibana Dev Tools** giải quyết:

1. Kibana → sidebar → **Dev Tools** (icon 🔧).
2. Console hiện ra:

```text
GET /

```

3. Click ▶ (Play button) bên phải dòng → execute → result hiện bên phải.

Cú pháp Dev Tools **gọn hơn curl**:

```
GET /                                         <-- thay vì curl -X GET ...
PUT /movies/_doc/1
{
    "title": "Inception"
}
GET /movies/_search
{
    "query": { "match_all": {} }
}
```

→ **Khoá học từ giờ dùng cú pháp này**. Tự convert sang curl khi cần script.

### Tip Dev Tools

- **Ctrl/Cmd + Enter** — run query.
- **Ctrl/Cmd + I** — auto-format JSON.
- Click **wrench icon** trên request → **Copy as cURL** → ra curl command.
- History (📜 icon) — query đã chạy.
- Auto-complete: gõ `GET /` → suggest tên index.

## URL structure Elasticsearch

Standard URL:

```text
http://localhost:9200/<index>/<endpoint>/<id>?<params>
```

Ví dụ:

```text
GET /                                       — cluster info
GET /_cat/indices?v                          — list all indices
PUT /movies                                  — tạo index "movies"
DELETE /movies                               — xoá index
PUT /movies/_doc/1                           — tạo document ID=1
GET /movies/_doc/1                           — get document ID=1
DELETE /movies/_doc/1                        — xoá document
POST /movies/_search                         — search
GET /movies/_mapping                         — xem schema
```

### Underscored endpoints

Endpoint bắt đầu `_` là **API call**, không phải data. Ví dụ:
- `_search` — search.
- `_doc` — document operations.
- `_bulk` — bulk import.
- `_cat/indices` — list indices.
- `_cluster/health` — cluster status.

→ ES dùng prefix `_` để tách "resource path" và "API action".

## Một loạt request thực hành

Mở Dev Tools, paste từng block, run từng cái:

```text
# 1. Cluster info
GET /

# 2. Cluster health
GET /_cluster/health

# 3. List all indices
GET /_cat/indices?v

# 4. Create index "movies"
PUT /movies

# 5. Add document with ID=1
PUT /movies/_doc/1
{
    "title": "Inception",
    "year": 2010,
    "genre": ["sci-fi", "action"]
}

# 6. Get document
GET /movies/_doc/1

# 7. Search all
GET /movies/_search

# 8. Search with query
GET /movies/_search
{
    "query": {
        "match": { "title": "inception" }
    }
}

# 9. Delete document
DELETE /movies/_doc/1

# 10. Delete index
DELETE /movies
```

→ Chạy lần lượt, quan sát response. Cảm nhận flow CRUD trên ES.

## Response anatomy

Ví dụ response của search:

```json
{
    "took": 5,
    "timed_out": false,
    "_shards": {
        "total": 1, "successful": 1, "skipped": 0, "failed": 0
    },
    "hits": {
        "total": { "value": 1, "relation": "eq" },
        "max_score": 0.5,
        "hits": [
            {
                "_index": "movies",
                "_id": "1",
                "_score": 0.5,
                "_source": {
                    "title": "Inception",
                    "year": 2010
                }
            }
        ]
    }
}
```

Field quan trọng:

- **`took`** — thời gian query (ms).
- **`_shards`** — bao nhiêu shard query, fail bao nhiêu.
- **`hits.total.value`** — số document khớp.
- **`hits.max_score`** — relevance score cao nhất (sẽ học bài 5).
- **`hits.hits[]`** — list document khớp.
- **`_source`** — data gốc của document.

## REST best practices cho ES

### 1. Luôn dùng `?pretty` khi debug

```text
GET /movies/_search?pretty
```

Production code thì tắt (verbose hơn).

### 2. Dùng `_source filter` để giảm response size

```text
GET /movies/_search?_source=title,year
```

→ Chỉ return field cần.

### 3. Pagination

```text
GET /movies/_search?from=10&size=10
```

→ Skip 10, lấy 10.

### 4. Verbose mode cho `_cat`

```text
GET /_cat/indices?v
GET /_cat/indices?v&h=index,docs.count,store.size
```

→ `v` = verbose header. `h` = chọn columns.

## Pitfall

### Pitfall 1: Quên `Content-Type`

```bash
curl -X POST "http://.../search" -d '{...}'
```

→ ES 6+ require header. Trả 406 Not Acceptable.

### Pitfall 2: Quote JSON sai

Bash:
```bash
curl -d "{ \"query\": ... }"      # ❌ Escape mệt
curl -d '{ "query": ... }'         # ✓ Single quote outer
```

→ Single quote bên ngoài → JSON bên trong không cần escape.

### Pitfall 3: PUT vs POST

- `PUT /index/_doc/<id>` — create hoặc update document với ID cụ thể.
- `POST /index/_doc` — create document với ID **tự sinh**.

Lẫn lộn → error 405 Method Not Allowed.

### Pitfall 4: Endpoint typo

```text
GET /movies/_serch       — typo "serch"
```

→ ES không hint, trả error chung. Đọc kỹ.

## Tóm tắt

- **REST** = pattern API qua HTTP với standard verb (GET/POST/PUT/DELETE).
- ES = server REST + JSON. Mọi tương tác = HTTP request.
- **Kibana Dev Tools** = console gõ JSON request trực tiếp — **tool chính** khoá học.
- URL pattern: `/<index>/<endpoint>/<id>?<params>`. Endpoint `_xxx` = API action.
- Response chứa `took`, `hits.total`, `hits.hits[]._source`.
- Curl OK cho script; Dev Tools OK cho explore.
- `?pretty` khi debug. `_source=field1,field2` để giảm size.

---

→ [Bài tiếp theo: Document và Index](04-document-va-index.md)

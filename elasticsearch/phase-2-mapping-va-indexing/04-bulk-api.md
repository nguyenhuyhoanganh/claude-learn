# Bài 4: Bulk API — Import nhiều document

Insert từng document qua REST = mỗi document 1 HTTP request → slow cho hàng nghìn document. **Bulk API** = gửi nhiều operations trong 1 request.

## Vì sao Bulk?

So sánh:

| Cách                   | Throughput              |
|------------------------|-------------------------|
| 1 document / request   | ~100-1000 doc/sec       |
| Bulk (1000 doc / request) | ~10,000-50,000 doc/sec |

→ 10-50× nhanh hơn. Lý do: bỏ HTTP overhead per request.

## Bulk format đặc biệt

Bulk **không phải JSON array**. Nó là **NDJSON** (newline-delimited JSON) — mỗi operation 2 dòng:

```
{ "action": { metadata } }
{ document data }
{ "action": { metadata } }
{ document data }
...
```

Ví dụ:

```
{ "index": { "_index": "movies", "_id": 135569 } }
{ "id": 135569, "title": "Star Trek Beyond", "year": "2016", "genre": ["Action", "Adventure", "Sci-Fi"] }
{ "index": { "_index": "movies", "_id": 122886 } }
{ "id": 122886, "title": "Star Wars: Episode VII", "year": "2015", "genre": ["Action", "Adventure", "Fantasy"] }
{ "index": { "_index": "movies", "_id": 109487 } }
{ "id": 109487, "title": "Interstellar", "year": "2014", "genre": ["IMAX", "Sci-Fi"] }
```

**Quan trọng**:
- Mỗi line phải kết thúc bằng `\n`.
- **Không** có dấu `,` giữa các line.
- File **phải** kết thúc bằng newline.
- Mỗi document line phải nằm trên **1 dòng duy nhất** (không pretty-print).

→ Format kỳ lạ nhưng có lý do: ES streaming parse từng line, route đến shard tương ứng → parallel.

## 4 actions

| Action      | Metadata                                       | Data line              |
|-------------|------------------------------------------------|------------------------|
| **index**   | `{ "_index": "...", "_id": "..." }`            | Document JSON          |
| **create**  | Như index nhưng fail nếu document đã tồn tại   | Document JSON          |
| **update**  | `{ "_index": "...", "_id": "..." }`            | `{ "doc": { fields } }`|
| **delete**  | `{ "_index": "...", "_id": "..." }`            | (không có line data)   |

Ví dụ mix:

```
{ "index":  { "_index": "movies", "_id": 1 } }
{ "title": "Movie A" }
{ "create": { "_index": "movies", "_id": 2 } }
{ "title": "Movie B" }
{ "update": { "_index": "movies", "_id": 1 } }
{ "doc": { "year": "2020" } }
{ "delete": { "_index": "movies", "_id": 3 } }
```

→ 4 operations: index 1, create 2 (fail nếu có), update 1, delete 3.

## Gửi bulk

### Endpoint

```text
POST /_bulk                       — bất kỳ index
POST /movies/_bulk                — default index = movies
```

→ Nếu specify index trong URL, có thể bỏ `_index` trong metadata:

```
POST /movies/_bulk
{ "index": { "_id": 1 } }
{ "title": "Movie A" }
```

### Content-Type

**Phải là**:

```
Content-Type: application/x-ndjson
```

→ Không phải `application/json` thông thường!

### Curl

```bash
curl -X POST "http://localhost:9200/_bulk" \
     -H "Content-Type: application/x-ndjson" \
     --data-binary @movies.json
```

- **`--data-binary`** (không `-d`) — giữ nguyên newline, không trim whitespace.
- **`@<file>`** — đọc từ file.

### Kibana Dev Tools

```
POST /_bulk
{ "index": { "_index": "movies", "_id": 1 } }
{ "title": "Movie A" }
{ "index": { "_index": "movies", "_id": 2 } }
{ "title": "Movie B" }
```

→ Dev Tools tự handle Content-Type. Paste raw.

## Demo: import MovieLens

Khoá host file `movies.json` (~100 movies) cho bulk. Tải:

```bash
wget https://media.sundog.tech/movies.json
head movies.json
```

Output (giả):

```
{ "index": { "_index": "movies", "_id": 135569 } }
{ "id": 135569, "title": "Star Trek Beyond", "year": "2016", "genre": ["Action", "Adventure", "Sci-Fi"] }
...
```

Import:

```bash
curl -X POST "http://localhost:9200/_bulk" \
     -H "Content-Type: application/x-ndjson" \
     --data-binary @movies.json
```

Response (lớn — mỗi operation 1 entry):

```json
{
    "took": 25,
    "errors": false,
    "items": [
        { "index": { "_index": "movies", "_id": "135569", "_version": 1, "result": "created", "status": 201 } },
        { "index": { "_index": "movies", "_id": "122886", "_version": 1, "result": "created", "status": 201 } },
        ...
    ]
}
```

- **`took`** — ms.
- **`errors`** — true nếu có operation fail.
- **`items[]`** — kết quả từng operation.

→ `errors: false` = tất cả thành công.

## Verify

```text
GET /_cat/indices?v
```

Thấy `movies` với docs.count = 100 (hoặc số trong file).

```text
GET /movies/_search
{
    "query": { "match_all": {} },
    "size": 5
}
```

→ Xem 5 document.

## Partial failure

Nếu vài operation fail (vd: type mismatch), `errors: true`, các operation **khác** vẫn thành công:

```json
{
    "errors": true,
    "items": [
        { "index": { "_id": "1", "status": 201, "result": "created" } },
        { "index": { "_id": "2", "status": 400, "error": { "type": "mapper_parsing_exception", ... } } },
        { "index": { "_id": "3", "status": 201, "result": "created" } }
    ]
}
```

→ Doc 2 fail nhưng 1 và 3 ok. Đây là **partial success** — ES không transaction.

Code production parse `items[]` tìm `status >= 400` → retry hoặc log.

## Tuning bulk size

Không phải càng to càng tốt. Trade-off:

| Bulk size       | Pro                        | Con                            |
|-----------------|----------------------------|--------------------------------|
| Quá nhỏ (10)    | Memory OK                  | HTTP overhead vẫn cao          |
| Vừa (1000-10000) | Balance                    | -                              |
| Quá to (>10MB)  | Throughput cao              | Memory pressure, queue lock    |

Best practice: **5-15 MB per bulk**, **1000-5000 doc**. Test với dataset thật.

```text
GET /_nodes/stats/thread_pool/write
```

→ Monitor write queue. Nếu queue grow → giảm bulk size.

## Pitfall

### Pitfall 1: missing newline

```
{ "index": { "_index": "x", "_id": 1 } }{ "title": "A" }
```

→ ES không parse được. Phải có `\n` giữa các line.

### Pitfall 2: pretty-print

```
{
    "index": {
        "_index": "x",
        "_id": 1
    }
}
```

→ FAIL. Metadata phải **1 dòng**.

### Pitfall 3: dùng `-d` thay `--data-binary`

```bash
curl -d @file.json     # Curl strip newline → FAIL
curl --data-binary @file.json    # OK
```

### Pitfall 4: bulk size quá to

Cluster timeout, queue full. Giảm size, dùng concurrent bulk.

### Pitfall 5: dùng JSON wrap array

```json
[
    { "index": { ... } },
    { "title": ... }
]
```

→ Không phải bulk format. FAIL.

## Generate bulk file từ CSV

Có CSV → cần convert sang bulk format. Python sample:

```python
import csv
import json

with open("movies.csv") as f, open("movies.json", "w") as out:
    reader = csv.DictReader(f)
    for row in reader:
        meta = { "index": { "_index": "movies", "_id": row["movieId"] } }
        doc = {
            "id": int(row["movieId"]),
            "title": row["title"],
            "genres": row["genres"].split("|")
        }
        out.write(json.dumps(meta) + "\n")
        out.write(json.dumps(doc) + "\n")
```

→ Convert MovieLens CSV sang bulk file. Phase 4 dùng Logstash tự động hoá.

## Tóm tắt

- **Bulk API** gửi nhiều operations 1 request. 10-50× nhanh hơn.
- Format: **NDJSON** (newline-delimited), mỗi op = metadata line + data line.
- 4 actions: **index**, **create**, **update**, **delete**.
- Endpoint: `POST /_bulk` hoặc `POST /<index>/_bulk`.
- Content-Type **`application/x-ndjson`**, curl dùng **`--data-binary`**.
- Mỗi line **1 dòng**, kết thúc `\n`. File kết thúc bằng newline.
- `errors: true` = có op fail nhưng các op khác có thể OK (partial success).
- Bulk size 5-15 MB, 1000-5000 doc là sweet spot.
- Generate bulk file từ CSV bằng script (Python, jq), hoặc dùng Logstash (Phase 4).

---

→ [Bài tiếp theo: Update và Delete](05-update-va-delete.md)

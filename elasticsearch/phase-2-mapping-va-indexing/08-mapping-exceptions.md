# Bài 8: Mapping exceptions và Mapping explosion

Mapping là heart của index. 2 lỗi kinh điển: **field type mismatch** và **mapping explosion** (số field nổ). Bài này: tránh và fix.

## Lỗi 1: Field type mismatch

Mapping define `port: integer`:

```text
PUT /logs/_doc/1
{ "service": "web", "port": 8080 }              ← OK
PUT /logs/_doc/2
{ "service": "web", "port": "8080" }            ← OK (ES tự coerce string → int)
PUT /logs/_doc/3
{ "service": "web", "port": "none" }            ← FAIL (không parse được)
```

Response error:

```json
{
    "error": {
        "type": "mapper_parsing_exception",
        "reason": "failed to parse field [port] of type [integer]",
        "caused_by": {
            "type": "number_format_exception",
            "reason": "For input string: \"none\""
        }
    },
    "status": 400
}
```

→ Document **không index**. HTTP 400.

### Fix 1: `ignore_malformed`

Skip field lỗi, vẫn index document:

```text
PUT /logs
{
    "settings": {
        "index.mapping.ignore_malformed": true
    },
    "mappings": {
        "properties": {
            "port": { "type": "integer" }
        }
    }
}
```

Insert lại:

```text
PUT /logs/_doc/3
{ "service": "web", "port": "none" }
```

→ Document index, field `port` bị bỏ qua. Vào `_ignored`:

```text
GET /logs/_doc/3
```

```json
{
    "_source": { "service": "web", "port": "none" },
    "_ignored": ["port"]
}
```

→ Field nằm trong `_source` nhưng **không index** → không search được bằng port. Search service vẫn ok.

### Limitation `ignore_malformed`

Chỉ work cho **leaf field**. Nested object hỏng → vẫn fail:

```text
PUT /logs/_doc/4
{
    "message": { "json": "object" }       ← message mapped text → FAIL
}
```

→ Object không thể "ignore" → fail toàn doc.

### Fix 2: Đổi schema

Nếu port có thể là string hợp lệ → đổi mapping sang `keyword`. Nhưng ES không cho **đổi type runtime**.

→ Phải **reindex sang index mới** với mapping đúng.

### Fix 3: Dead letter queue

Pattern production: fail doc → đẩy vào **DLQ** (Dead Letter Queue) → handle riêng.

- Logstash có DLQ output.
- Custom: catch exception → push Kafka topic riêng → batch fix.

## Lỗi 2: Mapping explosion

Mỗi index có **limit số field** (default 1000). Vượt = crash cluster.

### Vì sao xảy ra?

ES dynamic mapping = mỗi field mới (sinh ra từ doc) → add vào mapping.

Document log syslog:

```json
{
    "host": {
        "name": "server-1",
        "os": { "version": "20.04", "arch": "x64" }
    },
    "process": {
        "pid": 1234,
        "name": "nginx"
    }
}
```

→ ES flatten + map mỗi field:
- `host.name` keyword
- `host.os.version` keyword
- `host.os.arch` keyword
- `process.pid` long
- `process.name` keyword

→ 5 field. OK.

Document tiếp theo:

```json
{
    "host": {
        "name": "server-2",
        "os": { "version": "22.04", "arch": "arm64" },
        "uptime": 3600                           ← Field mới
    },
    "process": {
        "pid": 5678,
        "memory": "100MB"                        ← Field mới
    }
}
```

→ Thêm `host.uptime`, `process.memory`. Mapping = 7 field.

Document 1000 sau, mỗi cái có ít field khác nhau → **mapping nổ thành hàng nghìn**.

### Tại sao crash cluster?

Mapping được lưu trong **cluster state**. Cluster state **broadcast giữa các node** mỗi lần đổi.

- Mapping 100 field → state ~1 MB → ok.
- Mapping 10,000 field → state ~100 MB → broadcast lag.
- Mapping 100,000 field → state nặng → memory pressure → **OOM → cluster crash**.

### Demo

```text
# Tạo doc với 1001 fields → crash
PUT /big-index/_doc/1
{
    "field_1": "v1",
    "field_2": "v2",
    ...
    "field_1001": "v1001"
}
```

Response:

```json
{
    "error": {
        "type": "illegal_argument_exception",
        "reason": "Limit of total fields [1000] in index [big-index] has been exceeded"
    }
}
```

→ ES bảo vệ bạn — reject trước khi crash.

### Fix 1: Tăng limit

```text
PUT /big-index/_settings
{
    "index.mapping.total_fields.limit": 2000
}
```

→ Quick fix nhưng **chỉ trì hoãn**. Address root cause.

### Fix 2: `dynamic: false` hoặc `strict`

```text
PUT /logs
{
    "mappings": {
        "dynamic": "strict",            ← Reject field không khai báo
        "properties": {
            "service": { "type": "keyword" },
            "message": { "type": "text" }
        }
    }
}
```

→ Insert doc có field lạ → **fail**.

Hoặc `"dynamic": "false"` — accept doc, nhưng field mới **không index** (chỉ vào `_source`).

### Fix 3: `flattened` data type

Đã đề cập bài 7. Object → flatten thành 1 field. Sub-field không tạo mapping riêng:

```text
PUT /logs
{
    "mappings": {
        "properties": {
            "host": { "type": "flattened" }
        }
    }
}
```

→ Mọi sub-field của `host` (host.name, host.os.version, ...) treated as keyword trong 1 field `host`. **Mapping không nổ**.

Trade-off:
- ✅ Mapping ổn định.
- ⛔ Sub-field treated keyword → không analyzed, không range query.
- ⛔ Không highlight.

### Fix 4: Tách index

Mỗi loại log → index riêng:

```text
logs-nginx
logs-mysql
logs-app
```

→ Mỗi index có mapping riêng, tổng field per index < limit.

## Best practices

### 1. Explicit mapping cho production

Always define mapping explicit cho production index:

```text
PUT /logs
{
    "mappings": {
        "dynamic": "strict",
        "properties": {
            "timestamp": { "type": "date" },
            "level":     { "type": "keyword" },
            "message":   { "type": "text" }
        }
    }
}
```

→ Reject field không expected. Catch lỗi ngay.

### 2. Validate input pipeline

Logstash filter `mutate` / `prune` → bỏ field lạ trước khi index.

```text
filter {
    prune {
        whitelist_names => ["timestamp", "level", "message", "service"]
    }
}
```

### 3. Schema design first

Trước khi index hàng triệu doc, phác mapping. Tránh "discover field" runtime.

### 4. Monitor mapping size

```text
GET /logs/_mapping
```

→ Đếm field. Set alert nếu vượt threshold (vd 500).

### 5. Reindex strategy

Mapping wrong → reindex sang index mới:

```text
PUT /movies-v2
{ ... mapping mới ... }

POST /_reindex
{
    "source": { "index": "movies" },
    "dest":   { "index": "movies-v2" }
}
```

→ Phase 8 dạy ILM + alias để rotate seamless.

## Pitfall

### Pitfall 1: dynamic = true cho production

Default `dynamic: true` → mỗi field mới tự thêm. Đẹp cho dev, hại production.

→ Set `strict` hoặc `false`.

### Pitfall 2: ignore_malformed mọi nơi

Tạo data inconsistent. Document có / không có field tuỳ tâm trạng → query khó dự đoán.

→ Dùng có chọn lọc. Prefer fix root cause.

### Pitfall 3: increase limit thay vì refactor

Tăng `total_fields.limit` = patch tạm. 6 tháng sau nổ tiếp.

→ Fix root: schema design, flattened type, tách index.

## ✨ Tổng kết Phase 2

Sau Phase 2:

- Hiểu **mapping** (explicit + dynamic).
- Biết **analyzer** (char filter + tokenizer + token filter).
- CRUD document (PUT, POST, GET, DELETE).
- **Bulk API** import nhanh.
- 3 cách **update** (full PUT, partial `_update`, script).
- **Concurrency control** với `_seq_no` + `_primary_term`.
- **Data modeling**: denormalize, nested, parent-child.
- **Mapping exceptions** + explosion: cause + fix.

→ Phase 3 deep vào **search** — heart của ES.

## Tóm tắt

- **Type mismatch** = `mapper_parsing_exception`, HTTP 400. Fix: `ignore_malformed` (leaf only), reindex.
- **Mapping explosion** = số field vượt limit (default 1000). Cluster crash risk.
- Fix explosion: `dynamic: strict`, `flattened` type, tách index.
- **Best practice**: explicit mapping, validate input, monitor field count, reindex when wrong.
- Production: **không bao giờ** dynamic mapping cho index lưu data quan trọng.

---

→ **Sẵn sàng?** [Phase 3: Tìm kiếm](../phase-3-tim-kiem/01-query-lite-vs-query-dsl.md)

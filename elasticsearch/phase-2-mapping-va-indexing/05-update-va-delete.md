# Bài 5: Update và Delete

ES document **immutable**. Update thực chất là: tạo version mới + mark version cũ deleted. Bài này: cơ chế update + 3 cách update + delete.

## Document immutable

Lucene segment (file lưu inverted index) là **read-only sau khi ghi**. Vì sao?
- Append-only = thread-safe, lock-free.
- Cache friendly (cache không invalidate khi ghi).
- Optimize cho search heavy.

→ Update document = tạo segment mới chứa version mới + tombstone segment cũ.

→ Background process merge segment định kỳ → vacuum tombstone → reclaim disk.

## `_version` field

Mỗi document có `_version` (int) tăng mỗi update:

```json
{
    "_id": "1",
    "_version": 3,           ← Đã update 2 lần
    "_source": { ... }
}
```

→ ES tự maintain. Dùng để optimistic concurrency control (bài 6).

## Cách 1: Full replace với PUT

```text
PUT /movies/_doc/109487
{
    "id": 109487,
    "title": "Interstellar (Director's Cut)",       ← Đổi
    "year": "2014",
    "genre": ["IMAX", "Sci-Fi"]
}
```

→ Document mới **thay thế toàn bộ**. Mọi field không có trong body = **mất**.

Response:

```json
{
    "_id": "109487",
    "_version": 2,
    "result": "updated"
}
```

`_version` tăng từ 1 → 2.

→ **Pitfall**: nếu bỏ sót field, mất luôn. Production hay bug. Dùng `_update` an toàn hơn.

## Cách 2: Partial update với `_update`

```text
POST /movies/_update/109487
{
    "doc": {
        "title": "Interstellar (Director's Cut)"
    }
}
```

- Endpoint khác: `_update` (không `_doc`).
- Body: `{ "doc": { fields to update } }`.

→ Chỉ field trong `doc` thay đổi. Mọi field khác giữ nguyên.

Response:

```json
{
    "_id": "109487",
    "_version": 3,
    "result": "updated"
}
```

→ Behind the scene: ES GET document, merge với `doc`, index lại version mới. Atomic.

### Upsert pattern

Document có thể chưa tồn tại. Dùng `upsert` (update OR insert):

```text
POST /movies/_update/999
{
    "doc": {
        "year": "2020"
    },
    "upsert": {
        "id": 999,
        "title": "Brand New",
        "year": "2020",
        "genre": ["Comedy"]
    }
}
```

→ Nếu doc 999 đã có → update field `year`. Nếu chưa có → tạo từ `upsert`.

## Cách 3: Script update

Update phức tạp với logic (vd: increment counter, append array):

```text
POST /movies/_update/109487
{
    "script": {
        "source": "ctx._source.rating = ctx._source.rating + params.delta",
        "params": {
            "delta": 0.5
        }
    }
}
```

- **`ctx._source`** = document hiện tại.
- **`params`** = biến truyền vào (safer than hardcode).

Painless = scripting language built-in. Đủ dùng cho 99% case.

### Append vào array

```text
POST /movies/_update/109487
{
    "script": {
        "source": "ctx._source.genre.add(params.tag)",
        "params": { "tag": "Drama" }
    }
}
```

→ Thêm "Drama" vào genre array.

### Conditional update

```text
POST /movies/_update/109487
{
    "script": {
        "source": """
            if (ctx._source.year == '2014') {
                ctx._source.classic = true;
            } else {
                ctx.op = 'noop';
            }
        """
    }
}
```

→ Nếu year=2014 → set classic=true. Else → no-op (không update).

## Update by query

Update **nhiều document** match query:

```text
POST /movies/_update_by_query
{
    "query": {
        "term": { "year": "2014" }
    },
    "script": {
        "source": "ctx._source.classic = true"
    }
}
```

→ Mọi movie 2014 → classic=true. Cẩn thận (có thể update hàng triệu).

→ Có conflict version → fail. Set `conflicts: "proceed"` để skip.

## Delete document

```text
DELETE /movies/_doc/109487
```

Response:

```json
{
    "_id": "109487",
    "_version": 4,
    "result": "deleted"
}
```

→ Document mark deleted (tombstone). Search không thấy.

→ Disk free **sau merge** (không immediate).

## Delete by query

```text
POST /movies/_delete_by_query
{
    "query": {
        "match": { "title": "test" }
    }
}
```

→ Xoá mọi document title match "test". Dangerous.

## Delete index

```text
DELETE /movies
```

→ Xoá toàn bộ index. **Không reversible** (trừ khi có snapshot).

→ Trong production, **disable** `action.destructive_requires_name`:

```text
PUT /_cluster/settings
{
    "persistent": {
        "action.destructive_requires_name": true
    }
}
```

→ Cấm `DELETE /*` (wildcard). Phải gõ exact index name.

## Result codes

| Result      | Khi nào                                       |
|-------------|-----------------------------------------------|
| `created`   | Document mới (insert)                          |
| `updated`   | Document có rồi, đã update                     |
| `deleted`   | Document đã xoá                                |
| `noop`      | Update nhưng không thay đổi gì (script set `ctx.op = noop`) |
| `not_found` | DELETE nhưng document không tồn tại            |

## Pitfall

### Pitfall 1: PUT thay update partial

```text
PUT /movies/_doc/1
{ "year": "2020" }
```

→ Xoá tất cả field khác. Lỡ tay = data loss. Dùng `_update` cho partial.

### Pitfall 2: Update mass không có safeguard

```text
POST /movies/_update_by_query
{ "script": "ctx._source.rating = 0" }
```

→ Reset rating mọi movie. Test với query selective trước.

### Pitfall 3: Performance update heavy

Update = create new segment + tombstone. Update 1 doc 1000 lần = 1000 segment garbage.

→ Workload heavy update → cân nhắc reindex periodic, hoặc dùng store khác (PostgreSQL).

### Pitfall 4: `result: "noop"` không phải error

```json
{ "result": "noop" }
```

→ Script chạy nhưng quyết định không cần update. OK. Không phải bug.

## Tóm tắt

- Document **immutable** ở Lucene level. Update = tạo version mới + tombstone cũ.
- **`_version`** auto-increment.
- **3 cách update**:
  1. `PUT /idx/_doc/id` — full replace (cẩn thận data loss).
  2. `POST /idx/_update/id` `{ "doc": {...} }` — partial.
  3. `POST /idx/_update/id` `{ "script": ... }` — logic phức tạp (Painless).
- **`upsert`** = update if exists, insert if not.
- **`_update_by_query`** + **`_delete_by_query`** — mass operations.
- **`DELETE /idx/_doc/id`** — soft delete (tombstone, free sau merge).
- Result code: `created`, `updated`, `deleted`, `noop`, `not_found`.
- Production: bật `action.destructive_requires_name` để chặn wildcard delete.

---

→ [Bài tiếp theo: Concurrency control](06-concurrency-control.md)

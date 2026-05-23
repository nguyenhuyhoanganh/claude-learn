# Bài 7: Data modeling và Parent-Child

ES không phải RDBMS — không có FK, JOIN nghèo. Phải design data model khác. Bài này: normalized vs denormalized, nested object, parent-child relationships.

## RDBMS thinking vs ES thinking

RDBMS (3NF normalized):

```text
users           orders          products
─────           ──────          ────────
id PK           id PK            id PK
name            user_id FK       name
email           product_id FK    price
                quantity
```

→ Query "list orders của user X kèm product name" = JOIN 3 table.

ES không có JOIN. Cách approach data hoàn toàn khác.

## 3 patterns trong ES

### Pattern 1: Normalize + application-side join

Lưu mỗi entity riêng index, app làm join:

```text
Index: ratings
{ "user_id": 1, "movie_id": 109487, "rating": 9.0 }

Index: movies
{ "id": 109487, "title": "Interstellar" }
```

App:
1. Query rating của user → list movie_id + rating.
2. Loop, query movie by ID → get title.
3. Merge response.

**Pros**:
- Storage efficient (movie name 1 chỗ).
- Update movie name 1 chỗ.

**Cons**:
- 2× request → 2× latency.
- App logic phức tạp.

### Pattern 2: Denormalize

Copy data vào mỗi document:

```text
Index: ratings
{
    "user_id": 1,
    "movie_id": 109487,
    "movie_title": "Interstellar",         ← Duplicate
    "rating": 9.0
}
```

**Pros**:
- 1 query lấy hết.
- Latency thấp.

**Cons**:
- Storage waste (movie name lặp lại).
- Update movie name = update **mọi rating** của movie đó.

→ **Đa số case: denormalize được prefer** trong ES.

Lý do:
- Disk rẻ.
- Read scale > write scale (search nhiều hơn update).
- Movie name hiếm khi đổi (data immutable phần lớn).

### Pattern 3: Nested / Parent-Child

ES có 2 cơ chế relationship built-in:

- **Nested objects** — array of objects trong cùng doc.
- **Parent-child** — relate 2 document types trong cùng index.

→ Cả 2 đều có cost. Dùng khi denormalize không phù hợp.

## Nested objects

Document có array of object:

```json
{
    "title": "Inception",
    "actors": [
        { "name": "Leonardo DiCaprio", "role": "Cobb" },
        { "name": "Ellen Page", "role": "Ariadne" }
    ]
}
```

**Default behavior**: ES flatten thành:

```text
actors.name: ["Leonardo DiCaprio", "Ellen Page"]
actors.role: ["Cobb", "Ariadne"]
```

→ Search "name=Ellen AND role=Cobb" → **MATCH** (sai!). Vì ES không biết quan hệ tương ứng giữa item array.

**Fix**: dùng `nested` type:

```text
PUT /films
{
    "mappings": {
        "properties": {
            "actors": {
                "type": "nested",
                "properties": {
                    "name": { "type": "text" },
                    "role": { "type": "text" }
                }
            }
        }
    }
}
```

Mỗi object trong nested → lưu **document riêng** internal. Query special:

```text
GET /films/_search
{
    "query": {
        "nested": {
            "path": "actors",
            "query": {
                "bool": {
                    "must": [
                        { "match": { "actors.name": "Ellen" } },
                        { "match": { "actors.role": "Cobb" } }
                    ]
                }
            }
        }
    }
}
```

→ Cần combo trong **cùng object** → fail (đúng).

**Cost**: query nested chậm hơn flat ~2-3×. Mỗi item nested = doc internal.

## Parent-child relationship

Quan hệ 1-N giữa 2 document types **cùng index**:

```text
Franchise: Star Wars (parent)
├── Film: Episode IV (child)
├── Film: Episode V (child)
└── Film: Episode VI (child)
```

### Setup mapping

```text
PUT /series
{
    "mappings": {
        "properties": {
            "title": { "type": "text" },
            "film_to_franchise": {
                "type": "join",
                "relations": {
                    "franchise": "film"           ← franchise = parent, film = child
                }
            }
        }
    }
}
```

### Insert parent

```text
PUT /series/_doc/1
{
    "title": "Star Wars",
    "film_to_franchise": {
        "name": "franchise"
    }
}
```

### Insert child

```text
PUT /series/_doc/2?routing=1
{
    "title": "Episode IV: A New Hope",
    "film_to_franchise": {
        "name": "film",
        "parent": 1                  ← ID của parent franchise
    }
}
```

> **`?routing=1`** quan trọng — đảm bảo child ở **cùng shard** với parent. Required cho parent-child queries.

### Query: tìm film của Star Wars

```text
GET /series/_search
{
    "query": {
        "has_parent": {
            "parent_type": "franchise",
            "query": {
                "match": { "title": "Star Wars" }
            }
        }
    }
}
```

→ Trả mọi film có parent = franchise match "Star Wars".

### Query: tìm franchise có film X

```text
GET /series/_search
{
    "query": {
        "has_child": {
            "type": "film",
            "query": {
                "match": { "title": "The Force Awakens" }
            }
        }
    }
}
```

→ Trả franchise có film match.

## So sánh các patterns

| Pattern               | Storage | Query speed | Update flex | Use case               |
|-----------------------|---------|-------------|-------------|------------------------|
| **Denormalize**       | High    | ⭐ Fast      | Khó         | Default, 90% case      |
| App-side join         | Low     | Slow (2 req)| Dễ          | Movie name update freq |
| **Nested**            | Medium  | Medium      | Reindex full doc | Array of related items |
| **Parent-child**      | Low     | Slow         | Independent | True 1-N relationship  |

→ **Rule of thumb**: thử denormalize trước. Switch sang nested/parent-child khi thật sự cần.

## Khi nào dùng nested?

- Document có **array of object** + cần query combination field cùng object.
- Số item nested **không quá lớn** (< 1000). Quá → performance suffer.
- Update toàn document chấp nhận được.

Ví dụ: products có reviews (mỗi review = user, rating, comment).

## Khi nào dùng parent-child?

- Quan hệ thực sự **1-N** + 2 entity update độc lập.
- Child nhiều hơn parent rất nhiều (vd: 1 franchise → 100 movies → 10000 ratings).

Trade-off:
- ⛔ Slower query (factor 5-10×).
- ⛔ Phức tạp.
- ✅ Update independent.

→ **Đa số case nên tránh** — denormalize tốt hơn.

## Flattened type (alternative)

ES có type `flattened` — index toàn bộ object như single field:

```text
PUT /logs
{
    "mappings": {
        "properties": {
            "labels": { "type": "flattened" }     ← object bất kỳ
        }
    }
}

PUT /logs/_doc/1
{
    "labels": {
        "host": "server-1",
        "env": "prod",
        "version": "1.2"
    }
}
```

→ Tất cả sub-field treated as keyword. Dùng khi:
- Object có **nhiều field không biết trước** (avoid mapping explosion).
- Đủ cho exact-match query.

Search:

```text
GET /logs/_search
{
    "query": {
        "match": { "labels": "prod" }       ← search trong toàn object
    }
}

GET /logs/_search
{
    "query": {
        "match": { "labels.env": "prod" }   ← search field cụ thể
    }
}
```

→ Bài 8 nói thêm về mapping explosion.

## Tóm tắt

- ES không có JOIN. **Design data model khác** với RDBMS.
- 3 patterns:
  1. **Denormalize** (default) — duplicate data, fast query.
  2. **App-side join** — 2 query + merge in app.
  3. **Nested / Parent-child** — relationship built-in.
- **Nested**: array of related objects trong doc. Cần `nested` type + nested query.
- **Parent-child**: 2 doc type cùng index, relate qua `join` field. Cần `routing` khi insert.
- Parent-child slow hơn nested, dùng khi update độc lập.
- **Flattened type** cho object có nhiều sub-field không biết trước.
- Rule: thử denormalize trước, switch khi cần.

---

→ [Bài tiếp theo: Mapping exceptions](08-mapping-exceptions.md)

# Bài 2: Index aliases và rotation

**Alias** = "tên gọi" trỏ vào 1+ index. App query alias thay vì index name → swap index dưới hood không downtime.

## Alias basic

```text
POST /_aliases
{
    "actions": [
        { "add": { "index": "logs-2026.05.24", "alias": "logs-current" } }
    ]
}

GET /logs-current/_search       # = query logs-2026.05.24
```

→ App hardcode `logs-current`. Behind: swap target.

## Use case 1: zero-downtime reindex

Scenario: cần đổi mapping (vd thêm field, đổi analyzer). ES không cho đổi mapping runtime → reindex.

Without alias:

```text
App → query "logs"
                ↓
        Reindex `logs` → `logs-v2`
                ↓
        Update app config to "logs-v2"  ← Code change, deploy, downtime
```

With alias:

```text
App → query "logs" (alias)
                ↓ initial: alias → logs-v1
        Create logs-v2 with new mapping
        Reindex logs-v1 → logs-v2
                ↓
        Atomic swap alias:
            REMOVE alias logs-v1
            ADD    alias logs-v2
                ↓
        App unchanged. Query continues. Zero downtime.
```

Atomic swap:

```text
POST /_aliases
{
    "actions": [
        { "remove": { "index": "logs-v1", "alias": "logs" } },
        { "add":    { "index": "logs-v2", "alias": "logs" } }
    ]
}
```

→ **Atomic** — không có moment alias trỏ 0 hoặc 2 index. Either old or new.

## Use case 2: read multiple indices

Time-based logging:

```text
logs-2026.05.24
logs-2026.05.25
logs-2026.05.26
...
```

Alias `logs-last-7-days` trỏ 7 index gần nhất:

```text
POST /_aliases
{
    "actions": [
        { "add": { "index": "logs-2026.05.20", "alias": "logs-last-7-days" } },
        { "add": { "index": "logs-2026.05.21", "alias": "logs-last-7-days" } },
        ...
    ]
}

GET /logs-last-7-days/_search       # = query 7 indices, merge result
```

→ Daily cron script update alias add new + remove old.

Hoặc dùng wildcard không cần alias:

```text
GET /logs-2026.05.*/_search
```

→ Match index theo wildcard. Pros: simple. Cons: không atomic, không filter logic.

## Use case 3: filtered alias

Alias với filter built-in:

```text
POST /_aliases
{
    "actions": [
        {
            "add": {
                "index": "events",
                "alias": "events-vip-customers",
                "filter": { "term": { "customer_tier": "vip" } }
            }
        }
    ]
}

GET /events-vip-customers/_search       # = events filtered by tier=vip
```

→ Per-team alias. Marketing team query `events-vip-customers` only see VIP, không lo expose data tier khác.

## Use case 4: routing alias

Alias kèm routing → query chỉ hit 1 shard:

```text
"add": {
    "index": "events",
    "alias": "events-customer-123",
    "routing": "customer-123",
    "filter": { "term": { "customer_id": "customer-123" } }
}
```

→ Multi-tenant pattern. Mỗi customer alias riêng, query nhanh + isolated.

## Write alias (single index)

Alias usually multi-read. Write alias = 1 index target.

```text
POST /_aliases
{
    "actions": [
        {
            "add": {
                "index": "logs-2026.05.24",
                "alias": "logs-write",
                "is_write_index": true
            }
        }
    ]
}

POST /logs-write/_doc           # = write to logs-2026.05.24
```

→ Khi rollover (bài 3), `is_write_index` swap sang index mới. App vẫn `logs-write` write — index physical change.

## Rollover pattern (manual)

```text
# Initial setup
PUT /logs-000001
PUT /logs-000001/_alias/logs
PUT /logs-000001/_settings { "is_write_index": true }

# Khi index full (run periodic check)
POST /logs/_rollover
{
    "conditions": {
        "max_size": "50gb",
        "max_age":  "7d",
        "max_docs": 100000000
    }
}
```

→ ES check condition. Đạt → tạo `logs-000002`, swap write alias, return result.

→ ILM tự động hoá thêm (bài 3).

## List + remove alias

```text
GET /_cat/aliases?v                          # List all
GET /_cat/aliases/logs*?v                    # Pattern

DELETE /logs-v1/_alias/logs                  # Remove alias from index
```

## Best practices

### 1. Mọi index production có alias

App **không bao giờ** hardcode index name. Luôn dùng alias.

→ Cho phép migration, reindex, rollover seamless.

### 2. Naming convention

```text
logs-app-000001         # Physical index, suffix number
logs-app                # Alias for read
logs-app-write          # Alias for write
```

### 3. Atomic operation

Atomic alias swap qua `actions` array. **Không** delete trước rồi add — có gap.

### 4. Use template

Index template auto-add alias khi tạo index match pattern:

```text
PUT /_index_template/logs-template
{
    "index_patterns": ["logs-*"],
    "template": {
        "aliases": {
            "logs": {}
        },
        "settings": { ... },
        "mappings": { ... }
    }
}
```

→ Mỗi index mới match `logs-*` → tự có alias `logs` + settings + mappings.

## Pitfall

### 1. Alias không exist alias

```text
GET /logs/_search    → 404 not found
```

→ Tạo alias trước khi app gọi. Setup script step 1.

### 2. Write to read alias

Write tới alias trỏ multiple index → fail (không biết index nào):

```text
POST /logs-last-7-days/_doc       # ERROR
```

→ Write phải tới index direct hoặc alias single (`is_write_index: true`).

### 3. Mapping mismatch

Reindex sang index mới với mapping incompatible → reindex fail. Fix mapping trước.

## Tóm tắt

- **Alias** = pointer trỏ 1+ index. Read transparent.
- 4 use case: zero-downtime reindex, multi-index read, filtered view (per-tenant), routing.
- **Atomic swap** qua `actions` array.
- **Write alias** với `is_write_index: true` → 1 target.
- **Rollover** manual: `POST /alias/_rollover` với conditions.
- **Index template** auto-apply alias + settings cho index mới.
- Best practice: mọi index production có alias. App không hardcode index name.

---

→ [Bài tiếp theo: ILM (Index Lifecycle Management)](03-index-lifecycle-management.md)

# Bài 3: Index Lifecycle Management (ILM)

ILM = auto-manage lifecycle index theo 4 phase: **Hot → Warm → Cold → Delete**. Built-in từ ES 6.6+, free.

## Lifecycle phases

```text
Index born
    │
    ▼
┌─────────┐  Recent, frequent read/write, SSD, replica = 1
│  HOT    │  Index "active". Receives writes.
└────┬────┘
     │ rollover at: max_size 50GB, max_age 7d, max_docs 100M
     ▼
┌─────────┐  Read-only, occasional access, SSD/HDD mix, replica = 1
│  WARM   │
└────┬────┘
     │ after: min_age 30d
     ▼
┌─────────┐  Rare access, HDD, replica = 0, freeze
│  COLD   │
└────┬────┘
     │ after: min_age 90d (e.g., compliance)
     ▼
┌─────────┐  Snapshot to S3, searchable_snapshot
│ FROZEN  │
└────┬────┘
     │ after: min_age 365d
     ▼
   DELETE
```

→ Cost optimization: hot data SSD expensive, cold/frozen on cheap storage. Auto transition.

## Define policy

```text
PUT /_ilm/policy/logs-policy
{
    "policy": {
        "phases": {
            "hot": {
                "actions": {
                    "rollover": {
                        "max_size": "50gb",
                        "max_age":  "7d",
                        "max_docs": 100000000
                    },
                    "set_priority": { "priority": 100 }
                }
            },
            "warm": {
                "min_age": "30d",
                "actions": {
                    "shrink": { "number_of_shards": 1 },
                    "forcemerge": { "max_num_segments": 1 },
                    "allocate": {
                        "include": { "data_tier": "data_warm" },
                        "number_of_replicas": 1
                    },
                    "set_priority": { "priority": 50 }
                }
            },
            "cold": {
                "min_age": "90d",
                "actions": {
                    "allocate": {
                        "include": { "data_tier": "data_cold" },
                        "number_of_replicas": 0
                    },
                    "set_priority": { "priority": 0 }
                }
            },
            "delete": {
                "min_age": "365d",
                "actions": {
                    "delete": {}
                }
            }
        }
    }
}
```

→ ILM policy define mọi phase. Apply tới index template.

## Apply policy via template

```text
PUT /_index_template/logs-template
{
    "index_patterns": ["logs-*"],
    "template": {
        "settings": {
            "number_of_shards": 3,
            "number_of_replicas": 1,
            "index.lifecycle.name": "logs-policy",
            "index.lifecycle.rollover_alias": "logs"
        },
        "aliases": {
            "logs": {}
        }
    }
}
```

→ Mỗi index mới match `logs-*` → auto apply ILM + alias.

## Bootstrap

Tạo index đầu tiên với rollover alias:

```text
PUT /logs-000001
{
    "aliases": {
        "logs": {
            "is_write_index": true
        }
    }
}
```

→ App `POST /logs/_doc` → ghi vào `logs-000001`. Khi rollover → `logs-000002`, alias swap auto.

## Actions chi tiết

### `rollover`

Tạo index mới khi đạt condition (size/age/docs). Common ở hot phase.

### `shrink`

Reduce shard count. Vd hot 6 shards → warm 1 shard. Tiết kiệm overhead.

```text
"shrink": { "number_of_shards": 1 }
```

→ Index read-only, shard size to → consolidate.

### `forcemerge`

Merge segments → 1 segment. Tối ưu read, giảm disk.

```text
"forcemerge": { "max_num_segments": 1 }
```

→ Tốn 1-time CPU + disk. Apply lúc index không còn write.

### `freeze` (deprecated 8.x)

ES 7.x freeze chuyển index sang read-only + reduce heap. ES 8.x dùng **searchable_snapshot** thay.

### `searchable_snapshot`

Snapshot tới S3, mount lại như index thường (read slow nhưng work). Cold/frozen tier.

```text
"searchable_snapshot": {
    "snapshot_repository": "s3-archive"
}
```

→ Storage cost 90% cheaper. Trade-off: query slow vài giây.

### `allocate`

Force shard tới node có tag specific:

```text
"allocate": {
    "include": { "data_tier": "data_warm" }
}
```

→ ES có **data tiers** built-in: `data_hot`, `data_warm`, `data_cold`, `data_frozen`. Node setup với tag tier:

```yaml
node.roles: ["data_warm"]
```

→ Hardware difference: hot node SSD, warm/cold HDD.

### `delete`

Xoá index. Phase cuối.

## Monitor ILM

```text
GET /logs-*/_ilm/explain
```

```json
{
    "indices": {
        "logs-000005": {
            "managed": true,
            "policy": "logs-policy",
            "phase": "hot",
            "action": "rollover",
            "step": "check-rollover-ready",
            "age": "2d"
        },
        "logs-000004": {
            "phase": "warm",
            "action": "complete",
            "age": "32d"
        }
    }
}
```

→ Inspect mỗi index ở phase nào.

ILM run check mỗi 10 phút default:

```text
PUT /_cluster/settings
{
    "transient": {
        "indices.lifecycle.poll_interval": "1m"
    }
}
```

→ Tăng frequency cho test.

## Kibana UI

**Stack Management → Index Lifecycle Policies** → wizard tạo policy với UI:

- Slider chọn phases.
- Form điền conditions.
- Preview cost saving.

→ Đỡ phải viết JSON. Sau save deploy chuẩn.

## Real-world: log retention

```text
Day 0-7:   Hot tier, SSD, replica 1
Day 7-30:  Warm tier, HDD, replica 1
Day 30-90: Cold tier, HDD, replica 0
Day 90+:   Frozen (S3), retrieval slow
Day 365:   Delete
```

Cost analysis:
- Without ILM: 365 day × 100 GB = 36.5 TB SSD = expensive.
- With ILM: 7 day hot SSD + 23 day warm HDD + 60 day cold HDD + 275 day S3 frozen → tiết kiệm 70-80%.

## Snapshot lifecycle (SLM)

Bên cạnh ILM cho data, **SLM** (Snapshot Lifecycle Management) auto snapshot:

```text
PUT /_slm/policy/daily-snapshots
{
    "schedule": "0 30 1 * * ?",            # 1:30 AM daily
    "name": "<daily-snap-{now/d}>",
    "repository": "s3-snapshots",
    "config": {
        "indices": ["logs-*", "metrics-*"],
        "include_global_state": false
    },
    "retention": {
        "expire_after": "30d",
        "min_count": 5,
        "max_count": 50
    }
}
```

→ Daily snapshot to S3, keep 30 days. Bài 8 detail.

## Pitfall

### 1. Bootstrap missing

Tạo policy + template nhưng chưa tạo `logs-000001` với alias → app fail write.

→ Always bootstrap initial index.

### 2. Rollover alias không có

`rollover_alias` setting sai → ILM fail rollover.

→ Match `rollover_alias` với alias actual.

### 3. Phase order

`warm.min_age` < `hot rollover` → phase warm activate trước rollover → weird state.

→ `hot` rollover ngắn (vài ngày). `warm.min_age` lớn hơn (vd 30d).

### 4. Force delete vs ILM delete

ILM delete cẩn thận. Index có data quan trọng → snapshot trước.

## Tóm tắt

- **ILM** auto-manage index lifecycle: Hot → Warm → Cold → Frozen → Delete.
- Policy define actions per phase: rollover, shrink, forcemerge, allocate, searchable_snapshot, delete.
- Apply via **index template** + bootstrap initial index với alias.
- **Data tiers** (`data_hot`/`warm`/`cold`/`frozen`) cho hardware differentiation.
- Monitor: `GET /<index>/_ilm/explain`.
- Kibana UI wizard cho non-JSON.
- Pair với **SLM** auto snapshot.
- Real-world saving: 70-80% storage cost vs all-SSD.

---

→ [Bài tiếp theo: Hardware và heap sizing](04-hardware-va-heap-sizing.md)

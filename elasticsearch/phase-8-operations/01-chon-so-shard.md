# Bài 1: Chọn số shard

`number_of_shards` **cố định** lúc tạo index — không đổi runtime. Sai = đau đầu sau. Bài này: cách chọn đúng.

## Trade-off shard count

| Quá ít shard (vd 1)            | Quá nhiều shard (vd 1000)             |
|--------------------------------|---------------------------------------|
| Không scale query              | Memory overhead (50-200 MB / shard)   |
| Không parallel                 | Cluster state bloat                   |
| Hot spot                       | Search overhead (broadcast tất cả)    |
| Shard size lớn → slow recovery | Each shard nhỏ → underutilized        |

→ **Goldilocks zone**: shard size **20-50 GB**.

## Quy tắc kinh nghiệm

### 1. Shard size 20-50 GB

Theo Elastic recommend:

```text
Single shard: 10 - 50 GB
Sweet spot:    20 - 30 GB
```

→ Index dự kiến 100 GB → 3-5 shards.
→ Index 1 TB → ~20-30 shards.

### 2. Số shard / node ≤ 600

```text
Heap = 30 GB → max ~600 shards
Heap = 64 GB → max ~1200 shards (nhưng heap > 30 anti-pattern, xem bài 4)
```

→ Mỗi shard ~20-50 MB heap. Nhiều shard = heap nổ → GC pause → cluster slow.

### 3. Replica cho HA + read scale

Production:

```text
number_of_replicas: 1   # Default, đủ HA
```

→ Mỗi shard có 1 replica → mất 1 node OK. Total shards × 2.

### 4. Primary = power of N data nodes

Để distribute đều:

```text
5 data nodes → primary = 5 hoặc 10 (multiple of 5)
3 data nodes → primary = 3, 6, 9
```

→ Tránh shard imbalance (1 node có 2 shards, node khác có 1).

## Tính toán thực tế

Scenario: logging system, expect 100 GB/day, retention 30 days.

```text
Total data: 100 × 30 = 3,000 GB = 3 TB
With replica: 3 TB × 2 = 6 TB

Daily index "logs-YYYY.MM.DD":
   Size: 100 GB
   Shards: 100 / 30 = ~3-4 primary shards
   With 1 replica: 6-8 shards total per daily index

30 indices × 8 shards = 240 shards total

Data nodes: 3 (each holds ~80 shards → OK)
   Storage per node: 6 TB / 3 = 2 TB minimum
   Heap per node: 30 GB

Add 3 dedicated master nodes (small, 4 GB heap, 50 GB SSD).
```

→ Plan deploy: 3 master + 3 data + 1-2 coordinator. Total 7-8 nodes.

## Anti-patterns

### 1. Index nhỏ, shard mặc định

```text
PUT /tiny-index    # Default 1 primary + 1 replica (8.x default)
```

Tiny index 100 MB → 2 shards = 50 MB each. Wasteful nhưng acceptable.

Vấn đề: nếu **hàng nghìn index nhỏ** (mỗi tenant 1 index) → hàng nghìn shards → memory nổ.

→ Pattern fix: **shared index + filter by tenant_id** thay vì per-tenant index.

### 2. 1 huge index 1 shard

```text
PUT /huge-index
{
    "settings": { "number_of_shards": 1 }
}
```

Index 500 GB / 1 shard:
- Query không parallel.
- Recovery (copy shard sang node mới) **rất chậm**.
- 1 node failure → 50% index unavailable nếu replica chậm.

→ Phải reindex (đau đớn) sang nhiều shard.

### 3. Quá nhiều shard cho "future-proof"

```text
PUT /index
{
    "settings": { "number_of_shards": 100 }
}
```

Cho "scale sau". Hiện tại 10 GB data → 100 shards × 100 MB each = underutilized. Memory overhead vô ích.

→ Tốt hơn: start nhỏ + rollover (bài 2-3) khi grow.

## Check shard size

```text
GET /_cat/shards?v&s=store:desc
```

```text
index           shard  prirep  state    docs   store  ip
logs-2026.05.24 0      p       STARTED  10M    30gb   ...
logs-2026.05.24 0      r       STARTED  10M    30gb   ...
logs-2026.05.24 1      p       STARTED  10M    32gb   ...
```

→ Verify shard 20-50 GB. Vượt → split index (next time).

## Reindex để fix wrong shard count

Đã có index sai shard? Reindex sang index mới:

```text
PUT /logs-v2
{
    "settings": {
        "number_of_shards": 6,        # Đúng
        "number_of_replicas": 1
    },
    "mappings": { ... }
}

POST /_reindex
{
    "source": { "index": "logs-v1" },
    "dest":   { "index": "logs-v2" }
}
```

→ Block write source trong khi reindex (alias swap pattern — bài 2).

Reindex tốn time + resource. Tránh bằng plan đúng từ đầu.

## ILM tự rollover

Modern pattern: dùng **ILM** rollover khi shard size threshold:

```text
"rollover": {
    "max_size": "50gb",        # Khi shard primary > 50 GB → rollover
    "max_age":  "30d"          # Hoặc 30 ngày
}
```

→ ES tự tạo index mới khi đạt condition. Không cần plan size trước. Bài 3 detail.

## Tóm tắt

- **Shard size sweet spot 20-50 GB**. Quá nhỏ wasteful, quá lớn slow recovery.
- **Số shard / node ≤ 600** (heap 30 GB).
- **`number_of_replicas: 1`** mặc định production.
- Primary count = multiple of data node count.
- **`number_of_shards` cố định** lúc tạo. Sai = reindex.
- Anti-pattern: 1 huge shard, quá nhiều index nhỏ (per-tenant), shard "future-proof".
- Modern: **ILM rollover** auto khi đạt size/age threshold.

---

→ [Bài tiếp theo: Index aliases và rotation](02-index-aliases-va-rotation.md)

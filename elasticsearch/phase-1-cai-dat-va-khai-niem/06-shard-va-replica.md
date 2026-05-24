# Bài 6: Shard và Replica

ES nhanh + chịu lỗi nhờ **sharding** (chia index nhỏ) + **replication** (sao lưu). Bài này: cơ chế, math, failover.

## Vấn đề scale

Index có **10 tỷ document**:
- 1 node = không đủ disk, RAM.
- 1 node = bottleneck query (1 CPU process all).
- 1 node = single point of failure.

→ Cần **distributed**.

## Shard

**Shard** = phần nhỏ của index. Mỗi shard = **một Lucene index** độc lập (self-contained inverted index).

```text
Index "movies" (10 tỷ doc)
├── Shard 0: 2 tỷ doc
├── Shard 1: 2 tỷ doc
├── Shard 2: 2 tỷ doc
├── Shard 3: 2 tỷ doc
└── Shard 4: 2 tỷ doc
```

→ Mỗi shard có thể nằm trên **node khác nhau** → load chia đều.

### Routing: doc nào vào shard nào?

ES hash document `_id`:

```text
shard_id = hash(_id) % number_of_primary_shards
```

→ Document `_id = "movie-42"` luôn vào cùng 1 shard. Deterministic.

→ Khi search:
1. Coordinator node nhận request.
2. Broadcast tới mọi shard.
3. Mỗi shard search local → return top N hits.
4. Coordinator merge + sort → trả final top N.

→ Parallel = nhanh.

### Lưu ý quan trọng: số primary shard cố định

```text
PUT /movies
{
    "settings": {
        "number_of_shards": 5         // ← FIXED, không đổi được!
    }
}
```

→ Sau khi tạo index, **không thể đổi** `number_of_shards`. Lý do: routing dựa `hash % N`, đổi N → mọi document phải re-route → re-index toàn bộ.

→ **Phải plan trước**. Phase 8 bài 1 dạy chọn số shard.

→ Workaround: **reindex** sang index mới với shard count khác (tốn thời gian).

## Replica

**Replica** = bản sao của primary shard, trên node khác.

```text
Index "movies" với 5 primary + 1 replica:

Node 1:  P0  R1  R2
Node 2:  R0  P1  R3
Node 3:  R0  R1  P2  R3  P3  P4
Node 4:  R4
```

Mỗi shard có:
- **Primary** (P) — instance gốc, nhận write trước.
- **Replicas** (R) — copy, sync từ primary.

ES tự distribute: primary và replica **không cùng node** (để failover).

### Vì sao cần replica?

1. **High availability** — node primary die → replica promote thành primary mới.
2. **Read scalability** — read query có thể serve bởi primary HOẶC replica → tăng throughput.
3. **Snapshot point** — backup/restore.

### Cost replica

Replica = thêm storage + write overhead.

```text
1 primary + 1 replica = 2× storage + 2× write.
1 primary + 2 replicas = 3× storage + 3× write.
```

→ Trade-off: durability vs cost.

Best practice: **at least 1 replica** cho production. Read-heavy → 2+ replicas.

## Tính số shard

Công thức:

```text
total_shards = number_of_primary_shards × (1 + number_of_replicas)
```

Ví dụ:

```text
PUT /movies
{
    "settings": {
        "number_of_shards": 3,
        "number_of_replicas": 1
    }
}
```

→ Total = 3 × (1+1) = **6 shards**.

```text
"number_of_shards": 5, "number_of_replicas": 2
→ Total = 5 × (1+2) = 15 shards
```

## Failover scenario

Cluster 3 node, index 2 primary + 1 replica:

```text
Initial state:
Node 1:  P0  R1
Node 2:  P1
Node 3:  R0
```

### Node 1 die

```text
Node 1:  X
Node 2:  P1
Node 3:  R0
```

ES phát hiện node 1 mất:
1. R0 trên Node 3 **promote thành P0**.
2. P1 trên Node 2 vẫn ok.
3. Cluster status = **YELLOW** (vì R1 mất → không có replica của P1).

→ Service vẫn chạy. Không downtime.

Khi có node 4 thêm vào (hoặc node 1 hồi sinh):
1. ES auto-create R1 trên node mới.
2. R0 copy lại lên node mới.
3. Status = **GREEN**.

### Cluster status

| Status   | Ý nghĩa                                          |
|----------|--------------------------------------------------|
| **GREEN** | All primary + all replica chạy. Tốt nhất.       |
| **YELLOW** | All primary chạy, có replica missing. Service OK nhưng risk. |
| **RED**  | Có primary missing → data lost / inaccessible.   |

Check:

```text
GET /_cluster/health
```

Response:

```json
{
    "cluster_name": "docker-cluster",
    "status": "green",
    "number_of_nodes": 3,
    "active_primary_shards": 5,
    "active_shards": 10,
    "unassigned_shards": 0
}
```

## Best practice cluster size

### Số node tối thiểu

- **Dev / single-node**: 1 node OK.
- **Production**:
  - Min **3 master-eligible** node (avoid split-brain).
  - Number lẻ (3, 5, 7) cho quorum.

### Node types

ES có vai trò node:

| Role           | Trách nhiệm                                  |
|----------------|----------------------------------------------|
| **Master**     | Quản lý cluster state (chọn 1 active leader) |
| **Data**       | Lưu shard, xử lý query                       |
| **Ingest**     | Pre-processing pipeline                      |
| **Coordinator** | Route request, merge result                  |
| **Machine Learning** | Run ML jobs                            |

Default mỗi node = mọi role. Production tách:
- 3 dedicated master (nhỏ, không lưu data).
- N data node (lớn, mạnh).
- 2-3 coordinator (nhẹ, route load).

→ Phase 8 sâu hơn.

## Read & Write path

### Write

```text
1. Client gửi PUT /movies/_doc/42 đến node bất kỳ (coordinator).
2. Coordinator hash _id = 42 → biết shard nào → forward đến node có primary.
3. Primary nhận, ghi, replicate đến tất cả replica song song.
4. Replica ack về primary.
5. Primary ack về coordinator.
6. Coordinator ack về client.
```

→ Latency = max(primary, replicas).

### Read

```text
1. Client gửi GET /movies/_search đến coordinator.
2. Coordinator broadcast đến TẤT CẢ shard (primary HOẶC replica - round-robin).
3. Mỗi shard search local → return top N hits.
4. Coordinator merge sorted → return top N final.
```

→ Read scale với số shard + số replica.

## Demo (local)

Trong Dev Tools:

```text
GET /_cluster/health
```

```text
GET /_cat/nodes?v
```

```text
GET /_cat/shards/movies?v
```

→ Xem shard/node layout của index `movies`.

```text
PUT /test-shards
{
    "settings": {
        "number_of_shards": 5,
        "number_of_replicas": 1
    }
}

GET /_cat/shards/test-shards?v
```

→ Output show 10 shards (5P + 5R), assigned to nodes (single-node local thì replica unassigned vì không có node thứ 2).

```text
DELETE /test-shards
```

## Pitfall

### Pitfall 1: Quá nhiều shard

Mỗi shard ~50 MB heap overhead. 10,000 shard = 500 GB heap. Crash.

→ Best practice: shard size **20-50 GB**, không quá **1000 shard / node**.

### Pitfall 2: Quá ít shard

1 shard = không scale. Càng nhiều data → 1 shard nặng → query chậm.

→ Plan trước. Phase 8 detail.

### Pitfall 3: Single-node local có replica

```text
"number_of_replicas": 1
```

→ Local 1 node → replica không assignable → cluster YELLOW. OK cho local nhưng đừng confused.

Workaround: set `0` cho local.

### Pitfall 4: Update `number_of_shards` runtime

```text
PUT /movies/_settings
{
    "number_of_shards": 10        // ← FAIL
}
```

→ Không đổi được. Phải reindex.

→ `number_of_replicas` đổi được runtime (vì replica copy from primary, không re-route).

## Tóm tắt

- **Shard** = phần Lucene index, distribute trên cluster. Routing = `hash(_id) % N_shards`.
- **Primary** = original, **Replica** = copy on different node.
- `number_of_shards` **fixed** lúc tạo index. `number_of_replicas` đổi runtime.
- Failover: primary die → replica promote → cluster status YELLOW → recover khi node mới join.
- Cluster status: GREEN (perfect), YELLOW (replica missing), RED (primary missing).
- Read scale với shard + replica. Write scale chỉ với shard.
- Best practice: shard size 20-50 GB, không quá 1000 shard/node.
- Production cluster: min 3 master, lẻ số node.

---

→ **Sẵn sàng?** [Phase 2: Mapping và Indexing](../phase-2-mapping-va-indexing/01-ket-noi-va-movielens.md)

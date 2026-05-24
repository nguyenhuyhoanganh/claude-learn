# Bài 7: Failover thực tế

Phase 1 đã giải thích shard + replica. Bài này: failover thực tế khi node die. Demo + recovery.

## Setup demo: 3-node cluster

`docker-compose.yml`:

```yaml
services:
  es01:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0
    environment:
      - node.name=es01
      - cluster.name=demo
      - discovery.seed_hosts=es02,es03
      - cluster.initial_master_nodes=es01,es02,es03
      - bootstrap.memory_lock=true
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
    ports: ["9200:9200"]
    
  es02:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0
    environment:
      - node.name=es02
      - cluster.name=demo
      - discovery.seed_hosts=es01,es03
      - cluster.initial_master_nodes=es01,es02,es03
      ...
    ports: ["9201:9200"]
    
  es03:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.13.0
    environment:
      - node.name=es03
      - cluster.name=demo
      - discovery.seed_hosts=es01,es02
      - cluster.initial_master_nodes=es01,es02,es03
      ...
    ports: ["9202:9200"]
```

```bash
docker compose up -d
```

→ 3 nodes form cluster. Mỗi node có role default (master, data, ingest).

Verify:

```text
GET http://localhost:9200/_cat/nodes?v

ip          name  node.role
172.x.x.1   es01  cdfhilmrstw
172.x.x.2   es02  cdfhilmrstw
172.x.x.3   es03  cdfhilmrstw
```

→ Tất cả nodes thấy nhau.

## Tạo index với replica

```text
PUT /test-failover
{
    "settings": {
        "number_of_shards": 3,
        "number_of_replicas": 1
    }
}
```

→ 3 primary + 3 replica = 6 shards. Distribute trên 3 node:

```text
GET /_cat/shards/test-failover?v

index          shard  prirep  state    node
test-failover  0      p       STARTED  es01
test-failover  0      r       STARTED  es02
test-failover  1      p       STARTED  es02
test-failover  1      r       STARTED  es03
test-failover  2      p       STARTED  es03
test-failover  2      r       STARTED  es01
```

→ Mỗi node host 2 shards (1 primary + 1 replica). Primary và replica của cùng shard **luôn khác node**.

Cluster health:

```text
GET /_cluster/health

{
    "status": "green",
    "number_of_nodes": 3,
    "active_primary_shards": 3,
    "active_shards": 6,
    "unassigned_shards": 0
}
```

→ Green.

## Insert sample data

```text
POST /test-failover/_bulk
{ "index": { "_id": 1 } }
{ "name": "Alice" }
{ "index": { "_id": 2 } }
{ "name": "Bob" }
...
```

## Kill 1 node — simulate failure

```bash
docker stop es02
```

→ Sau ~30 giây cluster phát hiện es02 die.

Check:

```text
GET /_cluster/health

{
    "status": "yellow",                ← Replica lost
    "number_of_nodes": 2,
    "active_primary_shards": 3,
    "active_shards": 4,                ← Mất 2 shards của es02
    "unassigned_shards": 2
}
```

→ Status **yellow**: primary OK (replica promote), nhưng replicas missing.

Shard layout:

```text
GET /_cat/shards/test-failover?v

index          shard  prirep  state       node
test-failover  0      p       STARTED     es01
test-failover  0      r       UNASSIGNED  -        ← Mất
test-failover  1      p       STARTED     es03     ← Replica promoted!
test-failover  1      r       UNASSIGNED  -        ← Mất
test-failover  2      p       STARTED     es03
test-failover  2      r       STARTED     es01
```

→ Shard 1 primary từ es02 lost → ES promote replica (was on es03) thành primary. **Zero data loss, zero downtime**.

→ Query/write vẫn work:

```text
GET /test-failover/_search
```

→ Trả results.

## Recovery: bring node back

```bash
docker start es02
```

→ Sau 1-2 phút es02 rejoin cluster. ES re-replicate shards:

```text
GET /_cluster/health

{ "status": "green", ... }
```

```text
GET /_cat/shards/test-failover?v

# All shards STARTED again
```

→ Full recovery. Automatic.

## What if 2 nodes die?

Cluster có 3 nodes. Kill 2:

```bash
docker stop es02 es03
```

→ Cluster cần quorum master (majority). 1 node = không quorum → **read-only mode** hoặc **no master elected**:

```text
GET /_cluster/health

{
    "status": "red",                   ← Critical!
    "discovered_master": false
}
```

→ Cluster effectively dead. Bring back at least 1 node để quorum.

→ **Lesson**: minimum 3 master-eligible nodes cho production. Tolerate 1 failure.

→ Tolerate 2 failures → 5 master nodes. Tolerate N failures → 2N+1.

## What if 1 node có hết replica primary?

3 node, shard count = 3, replica = 1 → 6 shards distributed nhưng worst case:

Node 1: P0, P1, P2
Node 2: R0, R1, R2

→ Node 1 die → mọi primary lost → replica promote. Vẫn OK.

→ Đó là vì sao ES enforce **primary và replica của cùng shard không bao giờ cùng node**.

## Disk full scenarios

Node A disk 95% (flood watermark):

```text
GET /_cluster/health

# Cluster still green nhưng:
GET /<index>/_settings
{
    "<index>": {
        "settings": {
            "index.blocks.read_only_allow_delete": "true"     ← ES auto block!
        }
    }
}
```

→ Index trên node A read-only. Write fail.

Fix:
1. Free disk (delete old index, snapshot to S3).
2. Remove block:
   ```text
   PUT /<index>/_settings
   { "index.blocks.read_only_allow_delete": null }
   ```

## Network partition

Node A isolated network → ES coi như died:
- Shard reassign sang other nodes.
- Node A vẫn "think" it's the master → split brain risk!

ES 7+ với `cluster.initial_master_nodes` + quorum protect against split brain. Modern ES không bị issue này.

## Best practices recap

1. **Min 3 master-eligible nodes** (lẻ: 3, 5, 7).
2. **Replica ≥ 1** for production.
3. **Spread shards** across availability zones (cloud) — set `cluster.routing.allocation.awareness.attributes: zone`.
4. **Monitor cluster health** continuously.
5. **Test failover** trước go-live. Kill node trong dev → verify recovery.
6. **Snapshot regular** (bài 8) — safety net cuối.

## Awareness allocation (multi-AZ)

Production cloud: spread shard sang nhiều AZ:

```yaml
# Mỗi node
node.attr.zone: us-east-1a       # Hoặc 1b, 1c

# Cluster setting
cluster.routing.allocation.awareness.attributes: zone
```

→ ES không assign primary và replica cùng zone. AZ down → cluster vẫn work.

## Tóm tắt

- 3-node cluster với replica → tolerate **1 node failure**.
- Status flow: green → yellow (replica lost) → recovery → green.
- Need **quorum master** (majority). 3 master → tolerate 1, 5 master → tolerate 2.
- Primary và replica của cùng shard **không bao giờ** cùng node.
- Disk full → ES auto read-only block. Fix bằng free disk + unblock.
- **Multi-AZ** với awareness allocation cho cloud HA.
- Test failover trong dev trước go-live.

---

→ [Bài tiếp theo: Snapshots và restore](08-snapshots-va-restore.md)

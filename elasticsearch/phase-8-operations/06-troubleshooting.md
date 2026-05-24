# Bài 6: Troubleshooting

Production issue thường gặp + cách diagnose + fix.

## Cluster status RED

→ Critical. Có primary shard unassigned → data unavailable.

### Diagnose

```text
GET /_cluster/health
GET /_cluster/health?level=indices    # Index nào red
GET /_cat/shards?v&h=index,shard,prirep,state,unassigned.reason
GET /_cluster/allocation/explain      # Reason
```

### Common causes + fix

**1. Node crash / network partition**

→ Replica chưa promote thành primary kịp.

Fix: wait, hoặc force start replica:

```text
POST /_cluster/reroute
{
    "commands": [
        { "allocate_replica": { "index": "logs", "shard": 0, "node": "node-2" } }
    ]
}
```

**2. Disk full (flood watermark)**

→ Index read-only, không allocate được.

Fix: free disk, set:

```text
PUT /<index>/_settings
{ "index.blocks.read_only_allow_delete": null }
```

→ Remove block, retry allocate.

**3. Corrupted shard**

→ Storage error, fsync fail.

Fix: restore from snapshot. Hoặc allocate stale primary (data loss risk):

```text
POST /_cluster/reroute
{
    "commands": [
        { "allocate_stale_primary": { "index": "logs", "shard": 0, "node": "node-1", "accept_data_loss": true } }
    ]
}
```

→ **Last resort** — accept data loss.

## Cluster status YELLOW

→ Replica unassigned. Service OK nhưng risk.

### Common

**1. Single-node setup**

Single node + replica > 0 → replica không có node thứ 2 → yellow always.

Fix dev/local:

```text
PUT /<index>/_settings
{ "index.number_of_replicas": 0 }
```

→ Hoặc add node thứ 2.

**2. Allocation filter mismatch**

Replica require tag `data_warm` nhưng không có node match.

```text
GET /_cluster/allocation/explain
```

→ Đọc reason. Fix tag hoặc add node.

## Out of Memory / GC pause

Symptom: queries slow, log "GC overhead limit exceeded".

### Diagnose

```text
GET /_nodes/stats/jvm
```

`gc.collectors.young.collection_count` và `collection_time_in_millis` rising fast.

### Fix

1. **Heap đủ chưa?** Default ES 1 GB heap. Production phải set:
   ```text
   ES_JAVA_OPTS="-Xms16g -Xmx16g"
   ```

2. **Heap vượt 30 GB?** Compressed pointer mất → switch dùng nhiều node smaller.

3. **Query nặng?** Slow query log → top offender. Optimize:
   - Bỏ deep pagination (search_after).
   - Limit aggregation size.
   - Add filter (vs query) cho cacheable.

4. **Field data heavy?** Aggregate trên text field cũ (cần fielddata=true → ác). Switch keyword.

5. **Circuit breaker:**
   ```text
   GET /_nodes/stats/breaker
   ```
   Field data circuit breaker trip → ES reject query bảo vệ cluster.

## Slow indexing

Symptom: write queue grow, latency cao.

### Diagnose

```text
GET /_nodes/stats/thread_pool
```

`write.queue` > 0 sustained = bottleneck.

### Fix

1. **Increase bulk size** client side. 10 doc per req → 1000.

2. **Disable refresh tạm** cho mass import:
   ```text
   PUT /<index>/_settings
   { "index.refresh_interval": "-1" }
   ```
   Import xong restore:
   ```text
   { "index.refresh_interval": "1s" }
   ```

3. **Replica = 0** lúc mass import. Restore sau.

4. **Index có quá nhiều mapping field?** Reduce, dùng flattened.

5. **Disk IO bottleneck?** Check `iostat`. Upgrade SSD.

6. **Refresh interval default 1s** = fragmentation. Production có thể tăng 30s nếu OK trễ search:
   ```text
   "refresh_interval": "30s"
   ```

## Slow search

### Diagnose

Slow query log (Phase 8 bài 5).

### Common fix

1. **Filter vs query** — move clause vào `filter` context (cacheable).

2. **Pagination quá sâu** — dùng `search_after` thay `from + size`.

3. **Wildcard leading**: `*foo*` slow. Use ngram index time.

4. **Aggregation size quá lớn** — limit terms `size: 100` thay 10000.

5. **Index too many fields** — `_source` nặng → giảm `_source: ["field1", "field2"]`.

6. **No filter scope** — query 1 năm data thay vì 1 ngày. Force time range.

## Disk full

### Immediate

```text
DELETE /<old-index>           # Free up space
POST /<index>/_forcemerge     # Compact, may help
```

Watermark blocking:

```text
PUT /_cluster/settings
{
    "transient": {
        "cluster.routing.allocation.disk.watermark.flood_stage": "97%"
    }
}
```

→ Bump flood stage tạm để remove block.

### Long-term

- ILM delete old indices.
- Add more nodes.
- Compress / forcemerge cold data.

## Mapping conflict

Symptom: bulk fail với `mapper_parsing_exception`.

### Fix

1. Check mapping:
   ```text
   GET /<index>/_mapping
   ```

2. Pinpoint field mismatch.

3. Options:
   - **Set `ignore_malformed: true`** for that field.
   - **Reindex** với mapping mới.
   - **Validate client side** trước index.

## Cluster won't form

Multiple node nhưng chỉ thấy local node.

### Common

1. **`discovery.seed_hosts` wrong**:
   ```yaml
   discovery.seed_hosts: ["host1", "host2", "host3"]
   ```

2. **`cluster.initial_master_nodes`** sai cho first start.

3. **Cluster name mismatch**:
   ```yaml
   cluster.name: my-cluster      # Phải same across all nodes
   ```

4. **Firewall block** port 9300 (transport).

### Diagnose

ES log: `failed to connect` hoặc `cluster state inconsistency`.

## Split brain

Anti-pattern: 2 nodes both think they're master. Data corruption.

Modern ES 7+ uses **voting-only configuration** với min 3 master-eligible → quorum.

→ Always **3+ master nodes** in production. Lẻ.

## Reindex slow

Reindex 1B doc 1 day → quá lâu.

### Speed up

1. **Disable refresh** + **replica = 0** on destination.
2. Run reindex with slice (parallel):
   ```text
   POST /_reindex?slices=5&refresh
   {
       "source": { "index": "old" },
       "dest":   { "index": "new" }
   }
   ```
3. Use bulk indexing concurrently from multiple Logstash workers.

Tradeoff: heavy load on cluster. Run during off-peak.

## Hot threads

Find node CPU-bound:

```text
GET /_nodes/hot_threads
```

→ Returns top thread stack traces. Identify offending query / operation.

→ Forensic tool, ops team use.

## Diagnostic kit

```text
# Cluster overview
GET /
GET /_cluster/health?pretty
GET /_cat/nodes?v
GET /_cat/indices?v&s=store.size:desc
GET /_cat/shards?v&h=index,shard,prirep,state,unassigned.reason

# Node detail
GET /_nodes/stats/jvm,os,fs,thread_pool
GET /_nodes/hot_threads

# Allocation issue
GET /_cluster/allocation/explain
GET /_cluster/pending_tasks
```

→ Copy paste khi incident. Run all = full picture.

## Tóm tắt

- **Red** = primary missing → critical. Check allocation explain, restore snapshot.
- **Yellow** = replica missing → degraded. Acceptable temporary.
- **OOM/GC**: heap đủ chưa, query nặng, field data abuse.
- **Slow indexing**: bulk size, refresh interval, replica = 0 mass import.
- **Slow search**: filter context, search_after, limit agg size.
- **Disk full**: ILM delete, forcemerge, bump watermark tạm.
- **Mapping conflict**: ignore_malformed, reindex, validate client.
- **Cluster won't form**: seed_hosts, cluster.name, firewall.
- **3+ master nodes** lẻ tránh split brain.
- **Hot threads** API cho deep CPU diagnose.

---

→ [Bài tiếp theo: Failover thực tế](07-failover-thuc-te.md)

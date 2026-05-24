# Bài 8: Snapshots và Restore

Replica protect node failure. **Snapshot** protect cluster-wide disaster (data center down, accidental delete, corruption). Bài này: backup strategy.

## Snapshot là gì

ES snapshot = **incremental backup** ra remote storage (S3, GCS, Azure Blob, NFS, HDFS).

Lần đầu = full. Lần sau = incremental (chỉ segment mới).

→ Storage efficient. Snapshot daily 30 days không = 30× data size.

## Setup repository

Trước khi snapshot, register **repository** = location lưu.

### Local filesystem (dev)

```text
PUT /_snapshot/local-backup
{
    "type": "fs",
    "settings": {
        "location": "/mount/snapshots"
    }
}
```

→ Path `/mount/snapshots` phải:
- ES có write access.
- Cùng path trên **mọi node** (NFS share).
- Trong `path.repo` setting `elasticsearch.yml`:
  ```yaml
  path.repo: ["/mount/snapshots"]
  ```

### S3 (production)

Plugin `repository-s3` (built-in ES 8+):

```text
PUT /_snapshot/s3-backup
{
    "type": "s3",
    "settings": {
        "bucket": "my-es-backups",
        "region": "us-east-1",
        "base_path": "production-cluster"
    }
}
```

Credential: instance role (EC2) hoặc keystore:

```bash
bin/elasticsearch-keystore add s3.client.default.access_key
bin/elasticsearch-keystore add s3.client.default.secret_key
```

→ Production preferred. S3 cheap + 11 nines durability.

## Tạo snapshot

```text
PUT /_snapshot/s3-backup/snapshot-2026-05-24
{
    "indices": "logs-*,metrics-*",         ← Indices include (* = all)
    "ignore_unavailable": true,
    "include_global_state": false           ← Bỏ qua cluster state
}
```

→ Tạo snapshot tên `snapshot-2026-05-24` chứa logs-* và metrics-*.

Snapshot **chạy background**. Check progress:

```text
GET /_snapshot/s3-backup/snapshot-2026-05-24
GET /_snapshot/s3-backup/snapshot-2026-05-24/_status
```

State: `IN_PROGRESS` → `SUCCESS` (hoặc `PARTIAL`, `FAILED`).

## List snapshots

```text
GET /_snapshot/s3-backup/_all
GET /_cat/snapshots/s3-backup?v
```

## Restore

```text
POST /_snapshot/s3-backup/snapshot-2026-05-24/_restore
{
    "indices": "logs-2026.05.20",
    "rename_pattern": "(.+)",
    "rename_replacement": "restored-$1"     ← Restored as different name
}
```

Options:
- **`indices`** — restore subset.
- **`rename_pattern` + `rename_replacement`** — restore with new name (don't override original).
- **`include_global_state`** — restore cluster settings (rare, careful).

→ Restore chạy background. Check progress same way.

→ **Index must not exist** (or rename). Else ES refuse.

## Snapshot Lifecycle Management (SLM)

Manual snapshot không scale. **SLM** = auto snapshot + retention.

```text
PUT /_slm/policy/daily-snapshots
{
    "name": "<daily-snap-{now/d}>",
    "schedule": "0 30 1 * * ?",
    "repository": "s3-backup",
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

- **`schedule`** — cron. `0 30 1 * * ?` = 1:30 AM daily.
- **`name`** — template, date math.
- **`retention`** — keep 30 days, min 5, max 50 snapshots.

→ ES tự snapshot daily, prune cũ. Set + forget.

Force trigger:

```text
POST /_slm/policy/daily-snapshots/_execute
```

History:

```text
GET /_slm/policy/daily-snapshots
```

## Backup strategy

### 3-2-1 rule (general backup)

- **3** copies of data.
- **2** different media.
- **1** offsite.

ES translate:
- Production cluster = copy 1.
- Snapshot on S3 = copy 2 (offsite).
- (Optional) Replicate S3 cross-region = copy 3.

### Frequency

- **Hot data** (active write): daily snapshot.
- **Cold data**: weekly hoặc when changes.
- **Critical**: hourly snapshot if data loss intolerable.

### Retention

- **Compliance** (finance, health): 7 năm? Snapshot cũ → Glacier Deep Archive.
- **Operational** (logs): 30-90 days enough.

## Restore scenarios

### Scenario 1: oops, deleted index

```text
DELETE /important-data       # Whoops
```

Restore latest snapshot:

```text
POST /_snapshot/s3-backup/snapshot-2026-05-24/_restore
{
    "indices": "important-data"
}
```

→ Index back, data restored.

### Scenario 2: data corruption

Mapping change broke search. Restore previous version:

```text
POST /_snapshot/s3-backup/snapshot-2026-05-20/_restore
{
    "indices": "data",
    "rename_pattern": "(.+)",
    "rename_replacement": "data-restored"
}
```

→ Original `data` index still there. New `data-restored` from old snapshot. Compare, swap alias if good.

### Scenario 3: cluster wipe

Cluster down entirely (datacenter fire). Rebuild from snapshot:

```text
# New cluster
PUT /_snapshot/s3-backup        # Register same repo
{ "type": "s3", "settings": { ... } }

POST /_snapshot/s3-backup/snapshot-2026-05-24/_restore
{ "indices": "*" }
```

→ Disaster recovery. RTO (Recovery Time Objective) phụ thuộc snapshot size + bandwidth.

## Searchable snapshots (paid)

ES 7.10+ feature: mount snapshot as **read-only index** directly. Không cần restore full data.

```text
POST /_snapshot/s3-backup/snapshot-2026-05-24/_mount
{
    "index": "old-logs",
    "index_settings": {
        "index.number_of_replicas": 0
    }
}
```

→ Index "old-logs" available cho query. Data từ S3 (lazy load).

→ Foundation cho **frozen tier**. 80-90% storage cost saving vs hot tier.

## Cross-cluster restore

Restore từ snapshot tạo bởi cluster A vào cluster B:

```text
# Cluster B
PUT /_snapshot/cluster-a-repo
{
    "type": "s3",
    "settings": { ... same as cluster A ... }
}

POST /_snapshot/cluster-a-repo/snapshot-x/_restore
{ ... }
```

→ Pattern migration cluster, dev clone production data (with anonymize ideally).

## Best practices

### 1. Test restore regularly

Snapshot worthless nếu không restore được. Quarterly test:
- Restore vào staging cluster.
- Verify data integrity.
- Time the operation (RTO measurement).

### 2. Encrypt snapshots

S3 server-side encryption (SSE-S3, SSE-KMS):

```text
PUT /_snapshot/s3-backup
{
    "type": "s3",
    "settings": {
        "bucket": "...",
        "server_side_encryption": true
    }
}
```

### 3. Cross-region S3

```text
bucket: "my-es-backups-eu-west-1"     # Primary
+ S3 cross-region replication to:
       "my-es-backups-us-east-1"      # Replica
```

→ Single region outage doesn't lose backups.

### 4. Monitor SLM

```text
GET /_slm/stats
```

Failed snapshots: investigate. Storage growing fast: review retention.

### 5. Repository read-only

Production cluster có read-only access tới shared snapshot repo (e.g., dev clone use case):

```text
PUT /_snapshot/prod-readonly
{
    "type": "s3",
    "settings": {
        "bucket": "prod-backups",
        "readonly": true
    }
}
```

→ Cluster B chỉ restore, không tạo snapshot. Prevent accidental write.

## Pitfall

### 1. Snapshot khi index có heavy write

Snapshot không lock index, nhưng chỉ capture state lúc bắt đầu. Update during = next snapshot.

→ OK cho logs (append-only). Cẩn thận với data mutable.

### 2. Path repo không cùng mọi node

NFS phải mount cùng path mọi data node. Else snapshot fail.

### 3. Disk full repository

S3 vô hạn. Local FS có thể full → snapshot fail.

→ Monitor disk usage repo location.

### 4. Restore vào cluster nhỏ hơn

Snapshot từ cluster 10 node, restore vào cluster 3 node. Shard reassign per available nodes — OK nhưng có thể chậm + crowded.

## Tóm tắt

- **Snapshot** = incremental backup → S3 (production) hoặc filesystem (dev).
- Register repository (S3, GCS, Azure, FS, HDFS).
- Manual: `PUT /_snapshot/<repo>/<name>`. Auto: **SLM**.
- Restore selective indices, rename to avoid override.
- **Searchable snapshots** (paid) — mount S3 as read-only index, foundation frozen tier.
- Backup strategy: 3-2-1 rule. Daily snapshot for hot, retention 30-90 days.
- **Test restore regularly** — snapshot worthless if can't restore.
- Encrypt, cross-region replication for production.

---

→ [Bài tiếp theo: Rolling restart](09-rolling-restart.md)

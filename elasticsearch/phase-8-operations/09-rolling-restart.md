# Bài 9: Rolling restart

Production cluster cần restart định kỳ: ES upgrade, OS patch, config change. **Rolling restart** = restart từng node một, **không downtime**.

## Vì sao không stop all + start all?

Naive approach: `docker compose restart`:

- Cluster offline thời gian restart.
- User-facing service down.
- Risk cluster không re-form đúng (master election issue).

→ Production = unacceptable. Cần rolling.

## Steps rolling restart

### Step 1: Disable shard allocation

```text
PUT /_cluster/settings
{
    "persistent": {
        "cluster.routing.allocation.enable": "primaries"
    }
}
```

→ ES không tái phân bổ shard khi 1 node tạm vắng → tránh rebalance không cần.

### Step 2: Stop indexing & flush

```text
POST /_flush
POST /_flush/synced            # ES 7.x. ES 8+ tự sync
```

→ Force flush translog (write-ahead log) → disk. Recovery sau restart nhanh hơn.

### Step 3: Shutdown node 1

```bash
sudo systemctl stop elasticsearch       # On node 1

# Hoặc Docker
docker stop es01
```

Cluster status → **yellow** (replica của shard primary trên node 1 vẫn live).

### Step 4: Perform maintenance

- Upgrade ES version.
- Patch OS.
- Change config (heap, settings).
- Update certificates.

### Step 5: Start node 1

```bash
sudo systemctl start elasticsearch

# Hoặc
docker start es01
```

### Step 6: Wait for node rejoin

```text
GET /_cat/nodes?v
```

→ Node 1 back. Cluster status còn yellow (chưa rebalance vì allocation disabled).

### Step 7: Re-enable allocation

```text
PUT /_cluster/settings
{
    "persistent": {
        "cluster.routing.allocation.enable": null
    }
}
```

→ ES re-replicate shards. Status return green.

### Step 8: Wait for green

```text
GET /_cluster/health?wait_for_status=green&timeout=10m
```

→ Block until green hoặc 10 min timeout.

### Step 9: Repeat cho node tiếp theo

Steps 1-8 cho node 2, 3, ... N.

→ Sau khi tất cả nodes restarted, cluster đã full upgrade/patch.

## Script automation

Production = script automate, không gõ manual mỗi node. Ansible example:

```yaml
- hosts: elasticsearch_nodes
  serial: 1                          ← 1 node at a time
  tasks:
    - name: Disable shard allocation
      uri:
        url: "http://localhost:9200/_cluster/settings"
        method: PUT
        body_format: json
        body:
          persistent:
            cluster.routing.allocation.enable: "primaries"
    
    - name: Flush
      uri:
        url: "http://localhost:9200/_flush"
        method: POST
    
    - name: Restart elasticsearch
      service:
        name: elasticsearch
        state: restarted
    
    - name: Wait for green
      uri:
        url: "http://localhost:9200/_cluster/health?wait_for_status=green&timeout=10m"
        method: GET
    
    - name: Re-enable allocation
      uri:
        url: "http://localhost:9200/_cluster/settings"
        method: PUT
        body_format: json
        body:
          persistent:
            cluster.routing.allocation.enable: null
```

→ `serial: 1` Ansible run host-by-host → enforce rolling pattern.

## Major version upgrade

ES major upgrade (vd 7.x → 8.x):

- Read **Breaking changes** doc.
- Test trên staging cluster trước.
- Rolling restart approach work cho **same major** hoặc **major-1 → major** (vd 7.17 → 8.x).
- Older versions (vd 6.x → 8.x) → reindex required.

Best practice:
1. Full snapshot trước upgrade.
2. Upgrade Kibana sau ES.
3. Upgrade Logstash + Beats cuối.

→ Có downtime risk → maintenance window.

## Heartbeat uptime monitoring

Setup external check để alert nếu service down trong rolling:

```yaml
# Heartbeat beat
heartbeat.monitors:
  - type: http
    schedule: "@every 10s"
    urls: ["http://es:9200/_cluster/health"]
    check.response.json:
      - condition: { equals: { status: "green" } }
        description: "Cluster green"
```

→ Heartbeat = một Beat khác (như FileBeat) cho uptime. Push metrics → ES → Kibana → alert.

## Pitfalls

### 1. Quên re-enable allocation

Disable allocation step 1, quên enable step 7 → cluster never green. Shard không relocate.

→ Always pair disable + enable.

### 2. Restart quá nhanh

Restart node 2 trước khi node 1 fully recover → 2 nodes down cùng lúc → cluster red.

→ **Wait for green** giữa các node.

### 3. Insufficient quorum

3-node cluster, restart 1 (only 2 left). Master quorum = 2 of 3. Vẫn OK.

Nhưng nếu cluster nhỏ (5 master), restart **2 nodes cùng lúc** → 3 master left = quorum OK.

→ Đừng vội. Sequential safer.

### 4. Forget pre-restart flush

Skip flush → translog replay tốn lâu khi node restart. Restart 10 phút thay 2 phút.

→ Flush trước restart luôn.

## Tóm tắt

- **Rolling restart** = restart từng node sequential → no downtime.
- 9 steps: **disable allocation → flush → stop → maintenance → start → wait rejoin → enable allocation → wait green → repeat**.
- Production automate với **Ansible** (`serial: 1`).
- **Major version upgrade**: snapshot trước, breaking changes review, test staging.
- Heartbeat monitor cho external check.
- Pitfall: quên re-enable allocation, restart quá nhanh, skip flush.

## ✨ Tổng kết Phase 8

Sau Phase 8:

- **Shard count planning**: 20-50 GB / shard, ≤ 600 shards / node.
- **Aliases + rollover** cho zero-downtime ops.
- **ILM** auto-tier hot → warm → cold → frozen → delete.
- **Heap = 50% RAM, max 30 GB**. SSD, multiple node tốt hơn 1 node lớn.
- **Monitoring**: Stack Monitoring, separate cluster cho prod, alerts critical metrics.
- **Troubleshoot**: cluster status, allocation explain, slow query log, hot threads.
- **Failover**: replica handle node die. Min 3 master cho quorum. Multi-AZ awareness.
- **Snapshots** → S3, **SLM** auto, test restore quarterly.
- **Rolling restart** với disable allocation + wait green.

→ Phase 9: Elastic Cloud (managed service alternative).

---

→ **Sẵn sàng?** [Phase 9: Cloud](../phase-9-elasticsearch-tren-cloud/01-elastic-cloud-overview.md)

# Bài 5: Monitoring

ES production = monitor 24/7. Bài này: metrics cốt lõi, tools, alerts.

## Built-in monitoring (Kibana Stack Monitoring)

Kibana → **Stack Monitoring** — UI sẵn cho mọi component:

- **Elasticsearch**: cluster health, shards, indices, nodes, JVM stats.
- **Kibana**: response time, instance count.
- **Logstash**: pipeline events, throughput.
- **Beats**: agent count, events sent.

Setup:

```text
PUT /_cluster/settings
{
    "persistent": {
        "xpack.monitoring.collection.enabled": true
    }
}
```

→ ES tự collect metrics, lưu vào `.monitoring-*` indices. Kibana visualize.

→ **Basic free**. Advanced (alerting, custom retention) — paid.

## Core metrics phải monitor

### Cluster health

```text
GET /_cluster/health
```

```json
{
    "status": "green",                ← Quan trọng nhất
    "number_of_nodes": 6,
    "active_primary_shards": 100,
    "active_shards": 200,
    "unassigned_shards": 0,
    "pending_tasks": 0
}
```

Status:
- **green**: OK.
- **yellow**: primary OK, replica missing — cluster vẫn work.
- **red**: primary missing — data unavailable! Critical alert!

→ Monitor `status` change green → yellow/red.

### Node stats

```text
GET /_nodes/stats
```

Field quan trọng:

- **`jvm.mem.heap_used_percent`** — heap usage. > 75% = concern, > 85% = crisis (GC thrash).
- **`os.cpu.percent`** — CPU load.
- **`fs.total.available_in_bytes`** — disk free.
- **`indices.search.query_time_in_millis`** — total query time.
- **`indices.indexing.index_time_in_millis`** — total index time.
- **`thread_pool.write.queue`** — write queue depth. Build up = bottleneck.
- **`thread_pool.search.rejected`** — query rejected (queue full).

### Index stats

```text
GET /_cat/indices?v&s=store.size:desc
```

Per-index:
- `docs.count`.
- `store.size`.
- `pri.search.query_total` — total queries.
- `pri.indexing.index_total` — total indexed docs.

### Shard allocation

```text
GET /_cat/shards?v&h=index,shard,prirep,state,node,store
```

→ List mọi shard: state (STARTED/RELOCATING/UNASSIGNED), node assignment, size.

Unassigned shard:

```text
GET /_cluster/allocation/explain
```

→ ES giải thích vì sao shard không assign (disk full? no node match tag? ...).

## Monitor stack (production-grade)

### 1. Self-monitoring cluster (anti-pattern at scale)

Default: ES monitor chính nó → ghi `.monitoring-*` cùng cluster. **Vấn đề**: cluster down = mất luôn monitoring.

### 2. Separate monitoring cluster

```text
Production cluster ──ship metrics──► Monitoring cluster
   (your data)                          (small, dedicated)
                                              │
                                              ▼
                                           Kibana
                                       (alert on prod metrics)
```

→ Prod down → monitoring cluster vẫn alert. Production-grade.

Setup: MetricBeat ship `.monitoring-*` data sang separate cluster.

### 3. External monitoring

ES integrate với Grafana, Datadog, New Relic, Prometheus (qua `elasticsearch_exporter`).

→ Nhiều org dùng Prometheus + Grafana cho mọi system → unified dashboard.

## Slow query log

ES log slow query → debug:

```text
PUT /my-index/_settings
{
    "index.search.slowlog.threshold.query.warn": "10s",
    "index.search.slowlog.threshold.query.info": "5s",
    "index.search.slowlog.threshold.fetch.warn": "1s"
}
```

→ Query > 5s warn, > 10s error. Log vào `/var/log/elasticsearch/cluster-name_index_search_slowlog.log`.

→ Ship log này về ES separate cluster + dashboard "slow query top offenders". Optimize source.

## Alerts cần thiết

### Critical (page on-call)

- `cluster.status` = red.
- Node disk > 90%.
- `unassigned_shards` > 0 cho > 5 min.
- Heap used > 85% sustained 10 min.

### Warning (Slack)

- `cluster.status` = yellow.
- Node disk > 80%.
- Heap > 75%.
- Search rejected > 0.
- Indexing rate drop > 50%.
- Slow query count spike.

### Info

- Index rollover happened.
- Snapshot completed.
- New node joined.

## Watcher (paid)

X-Pack có Watcher API tạo alert programmatically:

```text
PUT /_watcher/watch/cluster_health_red
{
    "trigger": { "schedule": { "interval": "1m" } },
    "input": {
        "http": {
            "request": {
                "host": "localhost", "port": 9200,
                "path": "/_cluster/health"
            }
        }
    },
    "condition": {
        "compare": { "ctx.payload.status": { "eq": "red" } }
    },
    "actions": {
        "send_pagerduty": {
            "webhook": { ... }
        }
    }
}
```

Hoặc dùng **Kibana Alerts UI** (Phase 6 bài 4 đã đề cập). Modern + easier.

## Logstash monitoring

```text
GET _node/stats?human
```

(Endpoint Logstash, port 9600)

```json
{
    "pipeline": {
        "events": {
            "in": 12345,
            "out": 12340,
            "filtered": 5,
            "queue_push_duration_in_millis": 150
        }
    },
    "jvm": { ... }
}
```

Key metrics:
- `events.in/out` — throughput.
- `queue_push_duration` — bottleneck indicator.

## Beats monitoring

```bash
curl http://localhost:5066/stats
```

Per-beat metrics. Push lên monitoring cluster qua `monitoring.elasticsearch` config.

## Real-world ops dashboard

```text
┌──────────────────────────────────────────────────────┐
│  Cluster Health: GREEN ✓                              │
│                                                       │
│  Nodes: 6 active / 6 expected                         │
│  Shards: 200 active, 0 unassigned                    │
│  Disk: avg 65% (warn > 80%)                          │
│                                                       │
│  ┌─────────────────────────────────────────────┐    │
│  │ Query rate per minute (last 1h)              │    │
│  │ (line)                                        │    │
│  └─────────────────────────────────────────────┘    │
│                                                       │
│  ┌──────────────────┐  ┌──────────────────────┐    │
│  │ Heap usage / node│  │ Disk usage / node     │    │
│  │ (gauge per node) │  │ (gauge per node)      │    │
│  └──────────────────┘  └──────────────────────┘    │
│                                                       │
│  ┌─────────────────────────────────────────────┐    │
│  │ Slow query log (last 1h)                     │    │
│  │ Time | duration | query                       │    │
│  └─────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

→ NOC display 24/7. Page on red, slack on yellow.

## Tóm tắt

- **Kibana Stack Monitoring** = built-in UI, basic free.
- Core metrics: cluster health (status), JVM heap, CPU, disk, write queue, search rejected.
- Production: **separate monitoring cluster** (prod down ≠ monitoring down).
- External: Grafana + Prometheus + `elasticsearch_exporter`.
- **Slow query log** với threshold → debug.
- Critical alerts: red status, disk > 90%, heap > 85%, unassigned shards.
- **Watcher** (paid) hoặc **Kibana Alerts** cho automation.
- Logstash + Beats có monitoring endpoints riêng.

---

→ [Bài tiếp theo: Troubleshooting](06-troubleshooting.md)

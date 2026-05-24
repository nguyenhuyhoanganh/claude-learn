# Bài 1: Elastic Stack architecture cho logs

Phase 7 zoom vào use case **#1** của Elastic Stack: **centralized logging** cho cluster N server. Bài này: kiến trúc end-to-end.

## Vấn đề: log distributed

Production hiện đại = N server, N service. Log mỗi nơi:

```text
Web server 1: /var/log/nginx/access.log
Web server 2: /var/log/nginx/access.log
Web server 3: ...
App server 1: /var/log/app.log
App server 2: ...
DB server:    /var/log/mysql/slow.log
...
```

Có incident → SSH N server, grep log → mất giờ.

→ Need **centralized logging**: gom log mọi server về 1 chỗ search được.

## ELK / Elastic Stack pattern

Classic:

```text
N servers
   │
   │ (each runs FileBeat agent)
   ▼
FileBeat ──── (TCP) ────► Logstash (cluster) ────► Elasticsearch (cluster)
                            │                            │
                            │ parse/enrich/filter        │
                            ▼                            ▼
                       (optional) S3              Kibana
                       archive                    (dashboard)
```

Vai trò:
- **FileBeat** trên mỗi endpoint, ship raw log.
- **Logstash** trung tâm, parse Grok, enrich GeoIP, route theo type.
- **Elasticsearch** lưu + search.
- **Kibana** visualize + alert.

→ Đây gọi là **ELK** (Elasticsearch + Logstash + Kibana) hoặc **Elastic Stack** (tên mới khi Beats join).

## Component sizing

Production thường:

```text
                    1000 web servers
                     ├ FileBeat (~10 MB each)
                     │
                     ▼
                  Logstash cluster
                     │
                     ├─ 5 nodes
                     ├─ 8 GB RAM each
                     └─ Handle ~20K events/sec
                            │
                            ▼
                  Elasticsearch cluster
                     │
                     ├─ 3 master nodes (small)
                     ├─ 6 data nodes (32 GB RAM, SSD 1TB each)
                     ├─ 2 coordinator nodes
                     └─ Handle ~100K events/sec ingest
                            │
                            ▼
                       Kibana cluster
                     │
                     └─ 2 nodes behind LB
```

→ Scale dimension by dimension. Bottleneck thường ES write side.

## Data flow detail

### 1. App writes log

```text
2026-05-24 10:00:00 INFO User alice logged in from 192.168.1.5
```

Plain text vào `/var/log/app.log`.

### 2. FileBeat tail

FileBeat watch file, mỗi line mới = 1 event:

```json
{
    "@timestamp": "2026-05-24T10:00:00Z",
    "message": "2026-05-24 10:00:00 INFO User alice logged in from 192.168.1.5",
    "host": { "name": "app-server-01" },
    "log": { "file": { "path": "/var/log/app.log" } }
}
```

→ Ship Logstash port 5044.

### 3. Logstash parse

```text
filter {
    grok {
        match => {
            "message" => "%{TIMESTAMP_ISO8601:log_time} %{LOGLEVEL:level} %{GREEDYDATA:msg}"
        }
    }
    grok {
        match => {
            "msg" => "User %{WORD:username} logged in from %{IP:client_ip}"
        }
    }
    geoip { source => "client_ip" }
    date {
        match => ["log_time", "yyyy-MM-dd HH:mm:ss"]
        target => "@timestamp"
    }
}
```

→ Event sau parse:

```json
{
    "@timestamp": "2026-05-24T10:00:00Z",
    "level": "INFO",
    "msg": "User alice logged in from 192.168.1.5",
    "username": "alice",
    "client_ip": "192.168.1.5",
    "geoip": {
        "country_name": "Vietnam",
        "city_name": "Ho Chi Minh",
        "location": { "lat": 10.7, "lon": 106.6 }
    },
    "host": { "name": "app-server-01" }
}
```

→ Structured data. ES index → searchable.

### 4. ES index với daily rolling

```text
Index naming: logs-app-2026.05.24
              logs-app-2026.05.25
              ...
```

→ Daily index. Easy delete old via ILM (Phase 8).

### 5. Kibana view

Data view: `logs-app-*` → match all daily indices.

Discover: filter `level: ERROR and geoip.country_name: "Vietnam"` → list errors từ VN.

Dashboard: time series error count, top error message, geo heatmap.

## Pattern alternatives

### Beats → Elasticsearch direct (skip Logstash)

```text
FileBeat ──► Elasticsearch (with Ingest Pipeline)
```

→ ES có **Ingest Pipeline** — built-in lightweight Logstash-equivalent. Define pipeline:

```text
PUT /_ingest/pipeline/nginx
{
    "processors": [
        { "grok": { "field": "message", "patterns": [...] } },
        { "geoip": { "field": "clientip" } }
    ]
}
```

FileBeat output:

```yaml
output.elasticsearch:
    hosts: ["http://es:9200"]
    pipeline: "nginx"
```

→ Simpler infra (no Logstash). Trade-off: ingest pipeline ít powerful than Logstash. OK cho parse đơn giản.

### Kafka in the middle

```text
Apps ──► Kafka ──► Logstash ──► Elasticsearch
```

→ Buffer durable. Khi ES down hoặc slow, log không mất — pile up Kafka.

→ Production high-scale (10K+ events/sec): luôn dùng Kafka.

### Vector / Fluentd alternatives

**Vector** (Datadog) hoặc **Fluentd** (CNCF) thay Logstash:
- Vector: Rust-based, fast, low memory.
- Fluentd: Ruby-based, plugin rich.

→ Concept same. Vector hot trend 2023+ vì performance.

## Sizing planning

Daily volume:
- 1000 server × 10 events/sec × 86400 sec = ~860M events/day.
- Each event ~1 KB JSON → ~860 GB/day.

ES storage:
- × 1.5 (overhead + replica) = ~1.3 TB/day.
- Retention 7 days = ~9 TB.
- Retention 30 days = ~40 TB.

→ Plan disk + sharding accordingly. Phase 8 sâu.

## Tổng quan Phase 7

```text
Bài 1: Architecture                     ← bài này
Bài 2: FileBeat triển khai chi tiết
Bài 3: X-Pack Security
Bài 4: Log analysis Kibana
Bài 5: Data frame transforms
```

## Tóm tắt

- **ELK / Elastic Stack** = centralized logging cho cluster N server.
- Components: **Beats** (agent endpoint) → **Logstash** (parse) → **Elasticsearch** (store/search) → **Kibana** (view).
- Variant: Beats → ES direct (Ingest Pipeline) cho simple case.
- Production high-scale: thêm **Kafka** buffer.
- Time-based index `logs-app-YYYY.MM.DD` cho rotation.
- Sizing planning critical: events/day → GB/day → TB retention.

---

→ [Bài tiếp theo: FileBeat triển khai](02-filebeat-trien-khai.md)

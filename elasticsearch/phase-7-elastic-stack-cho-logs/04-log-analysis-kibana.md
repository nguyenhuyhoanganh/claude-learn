# Bài 4: Log analysis với Kibana

Data đã trong ES. Bài này: workflow analyze log + build dashboard production-grade.

## Workflow điều tra incident

Scenario: PagerDuty alert "error rate spike". Bạn lên Kibana:

### Step 1: Kibana Observability / Logs

Sidebar → **Observability → Logs** — UI dedicated cho log stream:

```text
┌──────────────────────────────────────────────────────┐
│ [Live tail ▶]  Time: Last 30 min  Search: [...]      │
│                                                       │
│ 14:23:01 [INFO]  GET /api/users 200 - 45ms           │
│ 14:23:02 [ERROR] PostgreSQL connection refused        │
│ 14:23:02 [ERROR] PostgreSQL connection refused        │
│ 14:23:03 [WARN]  Retry connection #1                  │
│ ...                                                   │
└──────────────────────────────────────────────────────┘
```

→ Tail real-time như `tail -f` nhưng aggregate từ N server.

### Step 2: Filter narrow

```text
Search: log.level: ERROR and service.name: "payment-api"
Time: Last 1 hour
```

→ Chỉ thấy error từ payment-api 1h qua.

### Step 3: Discover drill

Switch sang **Discover** → cùng filter → xem field detail:

```json
{
    "@timestamp": "2026-05-24T14:23:02Z",
    "level": "ERROR",
    "message": "PostgreSQL connection refused",
    "service": { "name": "payment-api" },
    "host": { "name": "app-prod-03" },
    "trace_id": "abc123def456",
    "user_id": "u-12345"
}
```

→ `trace_id` = follow request across services. Click filter → only events same trace.

### Step 4: Time histogram zoom

Histogram top of Discover. Spike rõ rệt:

```text
14:20 ▁▁▁▁  10 events
14:21 ▁▁▁▁  12 events
14:22 ▁▁▁▁  8 events
14:23 ████  1200 events  ← spike
14:24 ████  1500 events
```

Click+drag vùng spike → zoom in.

### Step 5: Top error breakdown

Aggregation:

```text
GET /logs-app-*/_search
{
    "query": {
        "bool": {
            "must": [
                { "match": { "level": "ERROR" } },
                { "range": { "@timestamp": { "gte": "2026-05-24T14:23:00Z" } } }
            ]
        }
    },
    "size": 0,
    "aggs": {
        "top_messages": {
            "terms": { "field": "message.keyword", "size": 10 }
        },
        "by_host": {
            "terms": { "field": "host.name", "size": 10 }
        }
    }
}
```

→ Top error: "PostgreSQL connection refused" 1200 events. Host distribution: app-prod-03 has 800/1200. Suspect node.

### Step 6: Correlate

Mở dashboard Infrastructure → CPU/memory của `app-prod-03` cùng thời điểm. Spike CPU? OOM? Disk full?

→ Root cause investigation.

## Build dashboard production logging

Layout chuẩn:

```text
┌─────────────────────────────────────────────────────────┐
│  Time range: Last 24h            Auto-refresh: 30s       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ╔═══════╗ ╔═══════╗ ╔═══════╗ ╔═══════╗               │
│  ║ Total ║ ║ Error ║ ║ p99   ║ ║ Active║   ← KPI strip │
│  ║ 12M   ║ ║ 0.12% ║ ║ 320ms ║ ║ Hosts ║               │
│  ╚═══════╝ ╚═══════╝ ╚═══════╝ ╚═══════╝               │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Request rate per minute (line)                  │   │
│  │  with status code breakdown stack                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌────────────────────┐  ┌──────────────────────────┐ │
│  │ Top 10 errors      │  │ Geographic distribution   │ │
│  │ (bar)              │  │ (map)                     │ │
│  └────────────────────┘  └──────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Recent ERROR events (data table)                │   │
│  │  timestamp | host | service | message            │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

→ Operator on-call vào dashboard này first. 30 second scan tất cả health metrics.

## Saved searches cho common patterns

Save filter dùng nhiều:

```text
Name: "5xx errors prod"
Query: log.level: ERROR and status: [500 TO 599] and env: prod
```

→ One click recall. Embed dashboard.

## Alerting (Kibana 7.11+)

Kibana có **Alerting** UI native:

1. **Management → Alerts and Insights → Rules**.
2. Create rule:
   - Trigger type: **Elasticsearch query**.
   - Index: `logs-*`.
   - Query: `log.level: ERROR and service.name: payment-api`.
   - Condition: `count > 100 per 5 minutes`.
3. Actions:
   - Slack webhook.
   - Email.
   - PagerDuty.
   - Webhook custom.

→ Auto alert 24/7. Foundation cho NOC + on-call rotation.

## Anomaly detection (ML, paid)

X-Pack ML detect spike bất thường tự động:

1. **Machine Learning → Anomaly Detection → Create job**.
2. Choose data view + field (vd `count of events`).
3. ML train baseline → detect deviation.

→ Catch anomaly không cần manually define threshold. Ví dụ: thường 100 events/h, bất ngờ 10K events/h → alert.

## SIEM use case

Elastic SIEM (paid) = security event monitoring:
- Failed login detection.
- Privilege escalation.
- Unusual data access.
- Threat intel matching.

→ Replace Splunk/Sumo Logic ở nhiều company.

## Log retention strategy

Logs grow fast. Strategy:

```text
Hot (last 7 days)     → SSD, replica 1, frequent access
Warm (7-30 days)      → SSD/HDD, replica 0, occasional
Cold (30-90 days)     → HDD slow, replica 0, rare
Frozen (90+ days)     → S3 (searchable snapshot), retrieval slow
Delete (> 365 days)   → Compliance dependent
```

→ ILM (Index Lifecycle Management) tự động transition. Phase 8 bài 3 sâu.

## Best practices

### 1. Structured logging from app

App log JSON (not plain text):

```json
{ "@timestamp": "...", "level": "ERROR", "trace_id": "...", "user_id": "...", "msg": "..." }
```

→ Skip Grok parsing. Direct ship → faster + more reliable.

Libraries: Python `structlog`, Java Logback JSON, Node `winston-json`.

### 2. Common field naming (ECS)

Elastic Common Schema = chuẩn naming convention:
- `@timestamp` (không `time`, `ts`, `timestamp`).
- `log.level` (không `level`, `loglevel`).
- `host.name`.
- `service.name`.
- `trace.id`.

→ ECS-compliant → dashboard universal, ML model preset.

### 3. Sample logs in dev

Don't ship 100% production volume → cost explodes. Sample 1-10% trừ ERROR (always ship).

### 4. Pre-aggregated metrics

Heavy aggregation real-time = slow. Use **rollup** hoặc **transform** (paid) precompute daily metric → dashboard fast.

## Tóm tắt

- Workflow incident: Logs UI → filter → Discover drill → time zoom → aggregate top errors → correlate other metrics.
- Dashboard layout: KPI top, trend middle, breakdown bottom, table cuối.
- **Saved search** for common patterns.
- **Alerting** native qua Kibana → Slack/email/PagerDuty.
- **Anomaly detection** (ML) auto-spot spike.
- **SIEM** cho security events.
- **ILM** retention strategy: hot/warm/cold/frozen tiers.
- Best practice: structured JSON log, **ECS** field naming, sample non-critical, pre-aggregate.

---

→ [Bài tiếp theo: Data frame transforms](05-data-frame-transforms.md)

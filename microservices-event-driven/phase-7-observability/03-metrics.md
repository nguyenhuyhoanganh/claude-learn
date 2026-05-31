# Bài 3: Metrics — 5 signal types thực sự cần đo

Metrics = trụ cột dễ nhất để collect + visualize. Vì thế nhiều team thu thập **mọi thứ có thể đo**. Result: 500 dashboard, 10000 graph, không ai biết nhìn cái nào lúc incident.

Bài này: 5 **types of signals** dựa trên Google SRE Golden Signals + Brendan Gregg's USE Method. Focus đúng chỗ.

## Metrics là gì

> **Metric** = giá trị số được **sample định kỳ** (mỗi 10s, 1 phút), giúp monitor health + performance theo thời gian.

Properties:
- **Numeric**: số → aggregate, alert dễ.
- **Time-series**: theo thời gian → trend, anomaly.
- **Low storage**: 1 metric = 8 bytes/sample × samples/day = small. So với logs lớn hơn nhiều.
- **Cheap query**: pre-aggregated, fast dashboards.

3 loại fundamental:

| Type | Description | Example |
|---|---|---|
| **Counter** | Monotonic increase (never decreases). Reset = restart. | requests_total, errors_total |
| **Gauge** | Value go up/down. Snapshot at sample time. | cpu_usage, queue_size, active_connections |
| **Histogram / Distribution** | Track distribution of values (latency, sizes). Calculate p50, p99. | request_duration_ms |

## Anti-pattern: collect everything

Naive thinking: "More data = better. Collect everything."

Costs:
- **Storage**: 100 metrics × 50 services × 5 instances × 1 sample/sec × 365 days = TBs.
- **Cost**: Datadog charges per host + per custom metric.
- **Cognitive load**: 200 graphs trên dashboard — eye finds nothing useful at 3am.
- **Alert noise**: alert mọi metric → ignore tất cả.

> "**You can't have too many alerts. You can have too many alerts that page you.**" — Google SRE book

Smart approach: pick **5 categories** below.

## 5 categories of signals

### Source: 4 Golden Signals (Google SRE) + USE Method (Brendan Gregg)

| Source | Focus |
|---|---|
| Google Golden Signals | User-facing: traffic, errors, latency, saturation |
| Brendan Gregg's USE | Resource-facing: Utilization, Saturation, Errors |

Combined → **5 categories**:

1. **Traffic** (demand)
2. **Errors** (failures)
3. **Latency** (responsiveness)
4. **Saturation** (queue / fullness)
5. **Utilization** (resource busy %)

### Signal 1: Traffic

> Amount of demand on system per unit time.

Examples:
- HTTP service: `requests_per_second`, `requests_per_minute`.
- Database: `queries_per_second`, `transactions_per_second`.
- Message broker: `events_published_per_sec`, `events_delivered_per_sec`.
- Cache: `cache_lookups_per_sec`.

Code:
```java
// Prometheus client
Counter requests = Counter.build()
    .name("http_requests_total")
    .labelNames("method", "endpoint", "status")
    .register();

requests.labels("POST", "/checkout", "200").inc();
```

Dashboard: line chart over time. Detect spike (traffic surge) or drop (outage).

#### Incoming vs outgoing

Service A calls Service B, C, D for each request:
- `incoming_requests_per_sec(A)` = 100.
- `outgoing_requests_per_sec(A)` = 300 (3 calls per request).

Outgoing = system resource (open connections). Track separately.

### Signal 2: Errors

> Rate + type of failures.

Examples:
- HTTP service: `error_rate = errors / total_requests`.
- Specific error codes: `http_5xx_per_sec`, `http_4xx_per_sec`.
- Downstream errors: `payment_gateway_timeout_count`.
- Business errors: `payment_declined_count`.

Code:
```java
errors.labels("payment_declined").inc();
errors.labels("stripe_timeout").inc();
```

Alerting rule:
```yaml
- alert: HighErrorRate
  expr: rate(http_errors_total{service="checkout"}[5m]) / rate(http_requests_total{service="checkout"}[5m]) > 0.01
  for: 2m
  annotations:
    summary: "Error rate > 1% for 2 min"
```

#### "Soft errors" as errors

Slow successful response = error from UX perspective:
```text
Latency > 5s → count as "slow_response" error metric.
```

Track these.

#### EDA-specific errors

- `events_failed_to_process_count`.
- `dead_letter_queue_size` (gauge).
- `broker_delivery_failures`.
- `consumer_lag` (gauge).

#### Database errors

- `aborted_transactions`.
- `deadlocks_per_minute`.
- `slow_queries_count`.
- `connection_pool_exhausted`.

### Signal 3: Latency

> Time to process a request.

⚠️ **Avoid average. Use percentiles.**

#### Average misleads

```text
1000 requests/min:
  - 950 fast: 50ms each.
  - 50 slow: 5000ms each.

Average = (950 × 50 + 50 × 5000) / 1000 = 297.5ms. "Looks OK!"

Reality: 50 users wait 5s. UX terrible. They leave.
```

#### Percentiles tell truth

| Metric | Value |
|---|---|
| p50 (median) | 50ms |
| p95 | 5000ms |
| p99 | 5000ms |

p95 = 5000ms → 5% users (50,000 if 1M users/day) hate the experience.

#### Code

```java
Histogram latency = Histogram.build()
    .name("http_request_duration_seconds")
    .labelNames("method", "endpoint", "status")
    .buckets(0.001, 0.005, 0.025, 0.1, 0.5, 1, 5, 10)
    .register();

var timer = latency.labels("POST", "/checkout", "200").startTimer();
// ... process
timer.observeDuration();
```

Prometheus query: `histogram_quantile(0.95, ...)` for p95.

#### Separate success vs failure latency

```text
If we fail fast (return error in 5ms), failed latency 5ms.
If success latency = 200ms.
Mixed = misleading.
```

Always separate by status:
- `http_request_duration_seconds{status="200"}` — success p95.
- `http_request_duration_seconds{status=~"5.."}` — error p95.

#### SLO often defined on latency

```text
SLO: 99% of requests < 200ms.
SLI: p99 < 200ms.
Alert: p99 exceeds 200ms for 5 min → page.
```

### Signal 4: Saturation

> How "full" a resource or queue is. Most predictive of impending failure.

Examples:
- **External message queue**: Kafka consumer lag, RabbitMQ queue depth.
- **Internal queue**: thread pool task queue size, in-memory processing buffer.
- **DB request queue**: pending queries.
- **Network connection pool**: in use / max.

#### Why saturation > utilization

CPU at 60% might still be fine. But if **queue** is growing → system can't keep up → soon overload.

```text
Producer rate = 1000 events/sec.
Consumer rate = 800 events/sec.

Queue grows 200/sec. After 1 hour: 720k events backlog.

CPU might be 50%, looks "healthy". But system is failing.
```

#### Alert on queue growth, not size alone

```yaml
- alert: KafkaConsumerLag
  expr: kafka_consumer_lag{group="checkout"} > 10000
  for: 5m
```

Or trend:
```yaml
- alert: GrowingLag
  expr: rate(kafka_consumer_lag{group="checkout"}[10m]) > 50
```

#### EDA-specific

- `consumer_lag` per topic + group.
- `dead_letter_queue_size`.
- `processing_backlog` (events queued for batch processing).

### Signal 5: Utilization

> How busy a resource is (% of capacity).

Examples:
- `cpu_usage_percent`.
- `memory_usage_bytes / memory_total`.
- `disk_usage_percent`.
- `network_bandwidth_used / max_bandwidth`.
- `db_connections_used / pool_size`.

Code:
```java
Gauge cpuUsage = Gauge.build()
    .name("process_cpu_usage_percent")
    .register();

// Periodically update
cpuUsage.set(getCpuUsage());
```

#### Alert BEFORE 100%

Performance degrades **before** resource saturated:
- CPU > 80% → queueing starts, latency p99 climbs.
- Memory > 90% → GC pressure, pauses.
- Disk > 95% → writes fail.

Set alert thresholds:
```yaml
- alert: HighCPU
  expr: cpu_usage_percent > 80
  for: 5m  # sustained, not transient spike
```

#### Granularity matters

Average over 10 minutes hides spikes:
```text
Real: 10s burst at 100% CPU, then 0% for 50s.
Average over minute = 17%. Looks healthy.

But user requests during burst all suffered.
```

Sample at 10-15s granularity for accurate picture.

## Combining 5 signals — example dashboard

For **CheckoutService**:

```text
+──────────────────────────────────────────────────────────────+
│ CheckoutService dashboard                                     │
+──────────────────────────────────────────────────────────────+
│                                                                │
│ TRAFFIC               ERRORS                                   │
│ [line: req/sec]      [line: error_rate %]                     │
│                                                                │
│ LATENCY (success)     LATENCY (error)                          │
│ [line: p50, p95, p99]  [line: p50, p95, p99]                  │
│                                                                │
│ SATURATION            UTILIZATION                              │
│ [line: thread_queue]  [line: cpu, memory]                     │
│ [line: kafka_lag]                                              │
│                                                                │
+──────────────────────────────────────────────────────────────+
```

10-12 graphs. Fit on 1 screen. Cover 95% of incidents.

## Tools

| Tool | Type | Use |
|---|---|---|
| **Prometheus** | Time-series DB | De-facto standard, pull model |
| **VictoriaMetrics** | Prometheus-compat | Cheaper at scale |
| **InfluxDB** | TSDB | Push model |
| **Grafana** | Visualization | Connects to anything |
| **Datadog** | SaaS APM | All-in-one, expensive |
| **AWS CloudWatch** | AWS managed | AWS native |
| **OpenTelemetry Metrics** | Standard | Vendor-neutral instrumentation |

Modern stack: **OpenTelemetry → Prometheus → Grafana**.

## RED Method — variant for HTTP services

Subset of 5 signals, focused on services:

- **R**ate (traffic).
- **E**rrors.
- **D**uration (latency).

For non-resource-bound services, RED enough. For deeper, add USE (Utilization, Saturation, Errors of resources).

## Custom business metrics

Beyond 5 signals, track business outcomes:
- `orders_placed_per_minute`.
- `revenue_per_hour`.
- `signups_per_day`.
- `cart_abandonment_rate`.

These detect user-facing impact faster than infra metrics. "Orders dropping" = bigger emergency than "CPU 80%".

## Cardinality warning

```text
metric "http_requests_total" with labels:
  method (10 values)
  endpoint (50 values)
  status (5 values)
  user_id (1M values)  ← DANGER

Combinations = 10 × 50 × 5 × 1M = 2.5 billion time series.
TSDB explode. Cost explode.
```

Rule: label cardinality < 10k. **Don't use user_id, request_id as label**. Use as log field instead.

## Anti-pattern: Alert on every metric

```text
500 metrics × alert each = 500 alerts.
99% false positive at any moment.
Oncall ignores.
```

Fix: alert only on metrics that directly signal **user-facing impact**.

Honeycomb's rule: **Page on symptoms, ticket on causes**.
- Symptom = user pain (error rate high, latency p99 spike).
- Cause = infra (CPU high) — may be OK if no user impact.

## Tóm tắt bài 3

- **Metrics** = numeric time-series, cheap to store + visualize.
- 3 types: **Counter**, **Gauge**, **Histogram**.
- Anti-pattern: collect everything → cost + cognitive overload.
- 5 signal types:
  - **Traffic**: requests/sec (incoming + outgoing).
  - **Errors**: rate + types, separate soft errors (slow successes).
  - **Latency**: percentiles (p50, p95, p99), separate success vs failure.
  - **Saturation**: queue depth, backlog, growth rate.
  - **Utilization**: CPU/mem/disk %, alert at 80% not 100%.
- Tools: **Prometheus** + **Grafana** + **OpenTelemetry** mainstream OSS.
- **RED Method** (Rate/Errors/Duration) cho HTTP services.
- Custom business metrics (orders/min, revenue) catch impact faster than infra metrics.
- **Cardinality control**: don't label by user_id, request_id.
- Alert on **symptoms** (user pain), ticket on **causes** (infra).

**Bài kế tiếp** → [Bài 4: Distributed Tracing — vẽ đường đi request qua services](04-distributed-tracing.md)

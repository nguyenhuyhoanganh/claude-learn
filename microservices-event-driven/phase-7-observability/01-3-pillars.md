# Bài 1: 3 trụ cột Observability — vì sao monitoring không đủ

3 giờ sáng. Pager kêu: "Checkout failure rate 5%". Bạn open dashboard. Số nào chỉ ra service nào fail? Tại sao? Bug ở đâu?

Trong monolith: SSH vào server, đọc log, profile process. Done in 30 phút.

Trong microservices: 50 service, 200 instances, request đi qua 8 service. Lỗi xảy ra ở đâu? **Observability** trả lời câu hỏi này.

## Monitoring vs Observability — khác biệt subtle nhưng quan trọng

| Aspect | Monitoring | Observability |
|---|---|---|
| Definition | Collect + display **predefined** metrics | Actively investigate, explore unknown |
| Tells you | "Something is wrong" | "What is wrong, where, why" |
| Approach | Reactive (set alerts on known thresholds) | Proactive (explore signals, find unknowns) |
| Tools | Dashboards, alerts | Logs, traces, metrics + query engines |
| Use case | "CPU > 80%, alert" | "Why is checkout slow at 3am?" |

**Monitoring is a subset of observability.** Observability includes the data and tooling needed để answer **unanticipated** questions.

```text
Monitoring: "Is the system healthy?" → Yes/No.
Observability: "Why is this user's request taking 3s?" → answer derivable.
```

## Vì sao microservices đặc biệt cần observability

Monolith debugging:
- Lỗi xảy ra trong 1 process.
- SSH + tail log + jstack + profiler → root cause ~ 30 phút.

Microservices debugging:
```text
User: POST /checkout — 504 timeout after 30s.

Path:
  Client → APIGateway → CheckoutSvc → CartSvc → InventorySvc → PriceSvc → 
                                    └→ PaymentSvc → StripeExt → ...
                                    └→ ShippingSvc → MapsExt → ...

11+ hops. Each could be the failure point. Each service runs 5+ instances.
Logs spread across 55 containers.
```

Without observability tooling: "Find the needle in 55 haystacks blindly."

**Plus**: most failures in microservices happen at **API boundaries** — network timeouts, malformed payloads, version drift. Single-service log không cho thấy.

## 3 trụ cột (3 pillars)

```text
                ╔══════════════════════════════════╗
                ║   OBSERVABILITY                   ║
                ╠══════════════════════════════════╣
                ║                                   ║
                ║   ┌────────┐ ┌────────┐ ┌────────┐║
                ║   │  Logs  │ │Metrics │ │Traces  │║
                ║   │ (what  │ │ (how   │ │ (where │ ║
                ║   │ happend│ │ much,  │ │ slow)  │ ║
                ║   │ where) │ │ how    │ │        │ ║
                ║   │        │ │ many)  │ │        │ ║
                ║   └────────┘ └────────┘ └────────┘║
                ╚══════════════════════════════════╝
```

### Pillar 1: Logs

> **Append-only records of events** happening inside a process/container/server. Text strings, structured (JSON) or semi-structured. With metadata: timestamp, level, service, host.

Example:
```json
{
  "ts": "2026-05-31T10:23:45Z",
  "level": "ERROR",
  "service": "checkout-svc",
  "host": "checkout-svc-7d-x9k2p",
  "correlationId": "req-abc-123",
  "userId": "u-42",
  "msg": "Payment failed: insufficient balance",
  "amount": 1500,
  "currency": "USD",
  "stack": "..."
}
```

Best for: detailed event context, error traces, debugging specific request.

Deep-dive: Bài 2.

### Pillar 2: Metrics

> **Regularly sampled numeric data points** — counters, distributions, gauges. Aggregable, low-storage.

Example:
```text
http.requests.count{service="checkout", method="POST", status=200}  → 1523/min
http.requests.duration_p99{service="checkout"}                       → 245ms
db.connections.active{service="cart"}                                → 18
cpu.usage{host="checkout-svc-7d-x9k2p"}                              → 67%
```

Best for: trends over time, alerting thresholds, capacity planning, SLO tracking.

Deep-dive: Bài 3.

### Pillar 3: Distributed Tracing

> **Path of a request across services**. Each hop = span. All spans linked by trace ID. Shows time spent in each service.

Example trace:
```text
[Trace: req-abc-123, total=2847ms]
└─[APIGateway: 12ms]
  └─[CheckoutSvc: 2823ms]
    ├─[CartSvc: 45ms]
    ├─[InventorySvc: 89ms]
    ├─[PriceSvc: 23ms]
    └─[PaymentSvc: 2654ms ⚠]
      └─[StripeExternal: 2620ms ⚠ slow]
```

Eye spotsthat `StripeExternal` is the bottleneck. Without trace: would dig into each service's log to find culprit.

Best for: end-to-end latency analysis, finding bottleneck, understanding request flow.

Deep-dive: Bài 4.

## Cách 3 pillar phối hợp

Real scenario:

```text
1. ALERT (monitoring): "Checkout success rate dropped to 90%."
   → Tool: Prometheus + AlertManager.

2. DASHBOARD (metrics): zoom in.
   → "Payment service error rate is 30%."
   → Narrow scope to Payment.

3. TRACES (distributed tracing): pick failed request.
   → Trace shows: "PaymentSvc → StripeExt: 504 timeout."
   → External dep is bad. But why now?

4. LOGS (distributed logging): filter PaymentSvc errors last hour.
   → Logs show: "Stripe API returning 503 for amount > $5000."
   → Specific failure pattern.

5. DECISION: 
   - Hotfix: route high-amount payments to backup provider.
   - Notify Stripe support.
   - Re-evaluate dependency strategy.
```

3 pillars complement nhau. **One alone insufficient** for production debugging.

## Tools landscape

| Pillar | Open source | SaaS | Note |
|---|---|---|---|
| Logs | ELK (Elasticsearch + Logstash + Kibana), Loki | Datadog Logs, Splunk, Sumo Logic | Structured JSON preferred |
| Metrics | Prometheus + Grafana, VictoriaMetrics | Datadog, New Relic, Honeycomb | Time-series DB |
| Traces | Jaeger, Zipkin, Tempo | Datadog APM, Honeycomb, New Relic | OpenTelemetry standard |
| Unified | OpenTelemetry (vendor-neutral) | Datadog, Honeycomb (full stack) | OTel = future standard |

**OpenTelemetry (OTel)** = CNCF project, becoming standard cho instrument code once → send to any backend.

```text
Application code
    │
    │ OpenTelemetry SDK
    │
    ▼
OpenTelemetry Collector
    │
    ├──► Prometheus (metrics)
    ├──► Loki (logs)
    ├──► Jaeger (traces)
    └──► Datadog / Honeycomb (any backend)
```

Decouple instrumentation từ backend. Switch vendors no code change.

## SLI / SLO / SLA — vocabulary observability

| Term | Definition | Example |
|---|---|---|
| **SLI** (Service Level Indicator) | Metric measured | Success rate, latency p99 |
| **SLO** (Service Level Objective) | Internal target for SLI | "99.9% requests succeed" |
| **SLA** (Service Level Agreement) | External contract with customers | "99.95% uptime or refund" |

Process: define SLO → instrument SLI → alert when SLI breaches SLO budget.

## Cost considerations

Observability không miễn phí. Số liệu thực:
- 1 GB log/day per microservice × 50 services = 50 GB/day.
- 1 year retention = 18 TB.
- Datadog Logs: ~$0.10/GB ingestion + $1.27/GB indexed retention/month.
- Self-hosted ELK: storage + ops effort.

Optimize:
- **Sampling**: trace 1% of requests, full sample only errors.
- **Log level discipline**: ERROR in prod, DEBUG in dev only.
- **Retention tiering**: hot 7 days, warm 30 days, cold 1 year.
- **Drop noisy logs**: health check logs, repeated identical messages.

Production: observability cost 5-15% infrastructure budget. Justified vs outage cost.

## Anti-pattern: Vanity dashboards

Dashboard với 100 graphs. Cool nhưng useless khi incident.

Fix: build dashboards around **SLOs + critical user journeys**. 5-10 graphs per service.

## Anti-pattern: Alert fatigue

50 alerts/day, 49 false-positive. Oncall ignores. Real incident missed.

Fix:
- Alert only on **user-impacting** thresholds (not "CPU 80%").
- Aggregate similar alerts.
- Tier severity (page vs ticket).

Honeycomb's rule: "Page on symptoms (user pain), not causes (CPU spike)."

## Tóm tắt bài 1

- **Monitoring** = preset alerts. **Observability** = explore unknowns.
- Microservices need observability vì: distributed, API-boundary failures dominant.
- 3 pillars: **Logs** (events), **Metrics** (numeric trends), **Traces** (request path).
- Workflow: monitoring alert → metric dashboard zoom → trace identify hop → log debug detail.
- Tools: OpenTelemetry standard. Backends: Prometheus, Loki, Jaeger, Datadog.
- Vocabulary: **SLI** (measure), **SLO** (internal target), **SLA** (customer contract).
- Cost optimization: sampling, log level discipline, retention tiering.
- Anti-pattern: vanity dashboards, alert fatigue → page on symptoms not causes.

**Bài kế tiếp** → [Bài 2: Distributed Logging — best practices](02-distributed-logging.md)

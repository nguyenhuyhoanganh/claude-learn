# Bài 4: Distributed Tracing — vẽ path của 1 request qua N services

User complain: "Email confirmation đến 1 ngày sau khi tôi đặt hàng". Backend có 50 service, order flow đi qua 8 service + 3 broker topic + 2 third-party APIs.

Metrics shows "checkout success rate OK". Logs có 100k lines/hour. **Tìm vấn đề ở đâu?**

Without distributed tracing: 4-8 giờ guess work. With tracing: 5 phút locate exact bottleneck.

## Vì sao logs + metrics không đủ

Scenario:

```text
User places order → 
  APIGateway → AuthService → OrderService → 
    [publish event "OrderPlaced"] → 
  PaymentService → StripeExternal → 
    [publish "PaymentCompleted"] →
  InventoryService → ShippingService → 
    [publish "OrderShipped"] →
  NotificationService → 
    SMTP / Push provider → user inbox.

  8+ hops. ~ 5 internal services + 3 external + 2 brokers.
```

Email arrives 1 day late. Where stuck?

**Logs**: each service log "Processed order ABC". 8 services × thousands of orders = 80k logs. Filter by orderId... nếu tất cả services log cùng ID. (Hi vọng đã có correlation ID.)

**Metrics**: cho thấy "Notification rate dropped". Why? Don't know.

**Tracing**: vẽ ra single trace = sequence of spans. See: PaymentService → StripeExternal took **24 hours** for this specific order. Stripe was timing out + retrying. Bottleneck identified instantly.

→ Tracing answers "**where** in distributed flow."

## Terminology

### Trace

> Entire path of 1 request through system. Identified by **Trace ID** (UUID).

### Span

> Single unit of work within trace. E.g., 1 service handling request, 1 DB query, 1 external API call.

```text
Trace [traceId=req-abc-123, total=2847ms]
├─ Span [APIGateway: handle_request] 12ms
│  └─ Span [AuthService: validate_token] 8ms
└─ Span [OrderService: process_order] 2823ms
   ├─ Span [DB: insert_order] 45ms
   ├─ Span [Kafka: publish_event] 5ms
   └─ Span [PaymentService: charge_card] 2654ms ⚠
      ├─ Span [DB: lookup_user_card] 12ms
      └─ Span [StripeAPI: charge] 2620ms ⚠
```

Spans = **parent-child hierarchy**. Trace = root span + all descendants.

### Trace Context

> Metadata passed between services to link spans into a trace.

W3C Trace Context standard:
```text
HTTP header: traceparent: 00-{traceId}-{parentSpanId}-{flags}
HTTP header: tracestate: vendor1=value,vendor2=value
```

For events (Kafka):
```text
Message headers: traceparent, tracestate.
```

### Span attributes

Each span carries metadata:
```json
{
  "spanId": "span-789",
  "parentSpanId": "span-456",
  "traceId": "req-abc-123",
  "operation": "stripe_charge",
  "service": "payment-svc",
  "startTime": "2026-05-31T10:23:45.234Z",
  "duration_ms": 2620,
  "status": "OK",
  "attributes": {
    "http.method": "POST",
    "http.url": "https://api.stripe.com/v1/charges",
    "http.status_code": 200,
    "stripe.amount": 1500,
    "stripe.currency": "USD"
  },
  "events": [
    {"name": "stripe_retry_1", "timestamp": "..."},
    {"name": "stripe_retry_2", "timestamp": "..."}
  ]
}
```

## How it works — workflow

```text
1. Client request enters system.
2. First service (APIGateway) generates Trace ID + root Span ID.
3. APIGateway sets context: {traceId, parentSpanId=root}.
4. APIGateway calls AuthService. Pass context via HTTP header.
5. AuthService creates child Span. Records duration. Logs to local tracer.
6. AuthService → OrderService, etc. Chain continues.
7. Each service uses instrumentation SDK → record span data.
8. Trace agent on each host collects span data.
9. Agent → ship to central trace backend (Jaeger, Tempo, Datadog).
10. Backend aggregates spans by traceId → reconstructs trace tree.
11. Dev queries trace UI → see full picture.
```

### Span lifecycle in code

```java
// OpenTelemetry Java
Tracer tracer = OpenTelemetry.getGlobalTracer("checkout-svc");

Span span = tracer.spanBuilder("process_order")
    .setSpanKind(SpanKind.INTERNAL)
    .startSpan();

try (Scope scope = span.makeCurrent()) {
    span.setAttribute("order.id", orderId);
    span.setAttribute("user.id", userId);
    
    processOrder(orderId);  // Internal logic
    
    span.setStatus(StatusCode.OK);
} catch (Exception e) {
    span.recordException(e);
    span.setStatus(StatusCode.ERROR, e.getMessage());
    throw e;
} finally {
    span.end();
}
```

When HTTP call to PaymentService:
```java
// SDK auto-injects traceparent header.
httpClient.post("https://payment-svc/charge", payload);
```

PaymentService extracts header → continues trace.

For Kafka:
```java
// Producer (auto-inject headers if instrumented)
producer.send(record);

// Consumer (extract headers → continue trace)
@KafkaListener("payments")
@WithSpan
public void onPayment(PaymentEvent e) { ... }
```

## Tools

| Tool | Type | Note |
|---|---|---|
| **Jaeger** | OSS (CNCF) | Popular, Uber origin |
| **Zipkin** | OSS (Twitter origin) | First mainstream tool, simpler |
| **Tempo** (Grafana) | OSS | Cheap object storage backend |
| **OpenTelemetry** | Standard | Instrumentation + collector |
| **Datadog APM** | SaaS | Integrated full-stack |
| **Honeycomb** | SaaS | Best-in-class for query, expensive |
| **New Relic APM** | SaaS | Enterprise |
| **AWS X-Ray** | AWS managed | AWS-native |

Modern stack: **OpenTelemetry instrumentation → OTel Collector → Tempo/Jaeger backend → Grafana visualize**.

## Architecture: data collection

```text
+──────────────+       +──────────────+
│ Service A    │       │ Service B    │
│ + OTel SDK   │       │ + OTel SDK   │
+──────────────+       +──────────────+
       │                       │
       │ export span data      │ export
       ▼                       ▼
+────────────────────────────────────────+
│ OpenTelemetry Collector (sidecar/      │
│ DaemonSet)                              │
│ - receive                               │
│ - batch                                 │
│ - sample                                │
│ - export                                │
+────────────────────────────────────────+
       │
       ▼
+──────────────────+ +──────────────────+
│ Trace backend    │ │ Log/Metric       │
│ (Jaeger, Tempo,  │ │ backends         │
│  Datadog)         │ │                  │
+──────────────────+ +──────────────────+
       │
       ▼
+──────────────+
│ Trace UI     │  (Grafana, Jaeger UI)
+──────────────+
```

OTel Collector decouple app từ backend. Switch vendor = config change.

## Trace UI exploration

Jaeger UI typical flow:

```text
1. Search:
   - Service: "checkout-svc"
   - Operation: "POST /checkout"
   - Tag: "error=true" OR "duration > 5s"
   - Time range: last 1 hour
   
2. Result: list of matching traces with duration.

3. Click trace → see full waterfall:
   [APIGateway]            [Auth]   [Order]              [Payment]              [Inventory]
   ████                    █        ████████            ██████████████████████  █████
   |─12ms─|                        |─━40ms━━━─|                              |─25ms─|
                                                       |─━━━━━2654ms━━━━━━━─|
                                                       └ slow ⚠ — investigate
                                                       
4. Expand Payment span → child spans:
   stripe_call took 2620ms (most of total).
   
5. Expand stripe_call → events:
   - retry_1 at 1000ms
   - retry_2 at 1800ms
   - success at 2620ms
   
6. Insight: Stripe was retrying due to rate limit / 503.
```

5 phút từ alert đến root cause.

## Challenges

### Challenge 1: Instrumentation effort

Auto-instrumentation covers common frameworks (Spring, Express, Django). But custom logic / business operations need manual span creation.

```java
// Manual span for business logic
Span span = tracer.spanBuilder("calculate_discount").startSpan();
try {
    return discountEngine.calc(order);
} finally {
    span.end();
}
```

Forgotten manual span → trace has "gap" → debugging harder.

OTel auto-instrumentation libraries widely available. Use them.

### Challenge 2: Cost — bandwidth + storage

```text
1M requests/day × 20 spans/trace × 500 bytes/span = 10 GB/day traces.
Retention 30 days = 300 GB.
× 10 services = bloated.
```

Storage in trace backend = $$$ (Honeycomb, Datadog charge per span).

#### Mitigation: sampling

```text
Strategies:
- HEAD-BASED sampling: decide upfront (random 1%).
- TAIL-BASED sampling: decide after seeing whole trace (keep errors + slow ones).
- ADAPTIVE: sample more during incidents.
```

```yaml
# OTel Collector tail-based sampling
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors
        type: status_code
        status_code: {status_codes: [ERROR]}
      - name: slow
        type: latency
        latency: {threshold_ms: 1000}
      - name: random
        type: probabilistic
        probabilistic: {sampling_percentage: 1}
```

Keep all errors, all slow, 1% of normal → good signal/noise ratio + manageable cost.

### Challenge 3: Trace size

```text
Some traces = 1000+ spans (e.g., complex workflow + fan-out).
UI can't render. Browser slow.
Human can't read.
```

Mitigation:
- Collapse repetitive spans (batch DB queries → 1 representative span).
- Flame graph view instead of waterfall.
- Drill-down on specific span chain.

### Challenge 4: Third-party services

You can't add spans inside Stripe, Sendgrid, AWS APIs. They're black boxes.

Mitigation:
- Span around your client call → see total external time.
- Use vendor's trace IDs if exposed (e.g., AWS request ID) → join externally.

### Challenge 5: Async event flows

Sync HTTP: span chain trivial.

Async Kafka:
```text
ProducerSpan ends → event sits in topic for 5s → ConsumerSpan starts.
The 5s is "in broker" — not in any span by default.

Trace gap unless you instrument:
- Inject trace context into Kafka message headers.
- Consumer creates span linked to producer span (span link, not child).
```

OpenTelemetry supports **span links** for async correlation.

## Real-world: Uber, Netflix

- **Uber's Jaeger**: Originally built at Uber for ride request tracing. Open-sourced 2017. CNCF graduated 2019.
- **Google Dapper** (2010 paper) = foundational tracing system. Inspiration for Jaeger, Zipkin.
- **Netflix Mantis** + tracing: handles billions of spans/day.

## Anti-pattern: Tracing as logs replacement

Don't dump entire request body, response body, every variable into span attributes.

❌ Wrong:
```java
span.setAttribute("request_body", JSON.stringify(request));  // huge
span.setAttribute("response_body", JSON.stringify(response));
```

Span attributes for **structured search**. Body content → logs (with sampling).

Cardinality of attributes also matters — high cardinality → indexing cost.

## Anti-pattern: No sampling = unmanaged cost

Production system with no sampling = $50k/month Datadog bill from traces alone.

Always sample. Always set policy.

## Integration: 3 pillars cùng nhau

Tracing tools modern integrate logs + metrics:
- Click span → see logs from that service/timeframe.
- Click span → see metrics dashboard for service.
- Click error in log → jump to trace.

Tools like **Honeycomb**, **Datadog**, **Grafana Tempo + Loki + Mimir** support this.

## Tóm tắt bài 4

- **Distributed tracing** = vẽ path của 1 request qua N services. Trace = collection of spans.
- Terminology: **Trace ID**, **Span**, **parent-child hierarchy**, **trace context** propagated via headers (HTTP + Kafka).
- W3C standard: `traceparent` header. OpenTelemetry = instrumentation standard.
- Workflow: SDK instrument → agent collect → backend store → UI visualize.
- Tools: **Jaeger**, **Zipkin**, **Tempo**, **Datadog APM**, **Honeycomb**.
- Architecture: app → OTel Collector → trace backend → UI.
- Challenges: manual instrumentation, **cost (bandwidth + storage)**, trace size, third-party gaps, **async event flows**.
- Mitigation: **tail-based sampling** (keep errors + slow + 1% normal).
- 3 pillars integrate: trace → log → metric jumps in modern tools.
- Anti-pattern: tracing as log replacement (dump body), no sampling.

**Bài kế tiếp** → [Phase 8 — Bài 1: Containerization và Kubernetes cho microservices](../phase-8-deployment/01-containers-k8s.md)

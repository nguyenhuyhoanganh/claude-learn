# Bài 2: Distributed Logging — best practices cho 1000 microservice instances

50 microservice × 5 instance × 1000 log lines/min = **250,000 log lines/min**. Không ai SSH đọc nổi. Centralized + indexed + structured là **mandatory**.

Bài này: 5 best practices để log thực sự useful (không phải đống text mù).

## Logging là gì — refresher

Log line = record của 1 event trong app:
- Receiving a request.
- Performing DB query.
- Starting/completing background job.
- Exception with stack trace.
- Business event (order placed).

```text
2026-05-31 10:23:45.234 INFO  [checkout-svc] Received order request user=u-42 product=p-1
2026-05-31 10:23:45.245 INFO  [checkout-svc] Calling PaymentService user=u-42 amount=1500
2026-05-31 10:23:47.890 ERROR [checkout-svc] PaymentService timeout user=u-42 trace=...
```

Logs cho dev visibility. Cho production debugging. Cho audit.

## Best practice 1: Centralized log aggregation

50 service × 5 instance = 250 containers. SSH từng cái → impossible.

Solution: **centralized log system** — aggregator collect + index + searchable.

```text
+──────────────+
│ Microservice │ ──► stdout (JSON)
│ container    │
+──────────────+
      │
      ▼ (log driver collects)
+──────────────+
│ Log shipper  │  (Fluentd, Vector, Filebeat)
+──────────────+
      │
      ▼
+──────────────────────────────────+
│ Centralized log storage + index   │
│ (Elasticsearch, Loki, Splunk)     │
+──────────────────────────────────+
      │
      ▼
+──────────────+
│ Query UI     │  (Kibana, Grafana, Splunk UI)
+──────────────+
```

Index by: timestamp, service, host, level, correlationId, userId, custom tags.

Query "show me all ERROR logs from checkout-svc in last 5 min" → instant.

### Tools landscape

| Stack | Components | Best for |
|---|---|---|
| **ELK** | Elasticsearch + Logstash + Kibana | Powerful queries, expensive at scale |
| **Loki** (Grafana stack) | Loki + Promtail + Grafana | Cheap (index labels only), pairs with Prometheus |
| **EFK** | Elasticsearch + Fluentd + Kibana | K8s common |
| **Splunk** | Enterprise SaaS | Strong but $$$$ |
| **Datadog Logs** | SaaS | Integrated with Datadog APM/metrics |
| **AWS CloudWatch Logs** | AWS managed | AWS native |
| **Google Cloud Logging** | GCP managed | GCP native |

## Best practice 2: Structured logging (JSON, not plain text)

❌ Bad — plain text:
```text
2026-05-31 10:23:45 INFO Payment for user 42 succeeded amount 1500 USD
```

To query "all payments > $1000", parse text with regex. Brittle. Slow.

✓ Good — structured (JSON):
```json
{
  "ts": "2026-05-31T10:23:45.234Z",
  "level": "INFO",
  "service": "payment-svc",
  "host": "payment-svc-7d-x9k2p",
  "msg": "Payment succeeded",
  "userId": "u-42",
  "amount": 1500,
  "currency": "USD",
  "correlationId": "req-abc-123"
}
```

Query: `level=ERROR AND service=payment-svc AND amount > 1000`. Fast, exact.

### Formats

| Format | Pros | Cons |
|---|---|---|
| **JSON** | Universal, easy parse, nested | Verbose (overhead) |
| **logfmt** (key=value) | Compact, readable | Limited nesting |
| **XML** | Structured, validated | Verbose, dated |

JSON wins majority of cases.

### Library examples

Java (Logback + Logstash encoder):
```xml
<appender name="STDOUT" class="ConsoleAppender">
    <encoder class="LogstashEncoder">
        <includeMdc>true</includeMdc>
    </encoder>
</appender>
```

Python (structlog):
```python
import structlog
log = structlog.get_logger()
log.info("payment_succeeded", user_id="u-42", amount=1500, currency="USD")
```

Go (zap):
```go
logger.Info("payment_succeeded",
    zap.String("userId", "u-42"),
    zap.Int("amount", 1500),
    zap.String("currency", "USD"))
```

Don't reinvent. Use proven libs.

## Best practice 3: Log levels (severity)

Standard hierarchy:

| Level | Use |
|---|---|
| **TRACE** | Most verbose. Function entry/exit. Dev only. |
| **DEBUG** | Detailed troubleshooting. Dev / staging. |
| **INFO** | Normal operations. Service started, request received, business event. |
| **WARN** | Recoverable issue. Slow query, deprecated API call, rare unexpected state. |
| **ERROR** | Operation failed. Exception caught, retry exhausted, user-visible bug. |
| **FATAL** | App cannot continue. Startup failure, data corruption detected. |

### Level discipline

In production:
- INFO + above → centralized log.
- DEBUG/TRACE → only enabled per-request via feature flag for deep debugging.

This:
- Reduces log volume 10-100×.
- Saves $$$ on storage/indexing.
- Faster searches.

### Alert routing per level

```text
FATAL → page oncall immediately.
ERROR → trigger ticket, page if rate > threshold.
WARN  → batch into daily review.
INFO  → searchable, no alert.
DEBUG → only when investigating.
```

## Best practice 4: Correlation ID (request tracing through logs)

Vấn đề: 1 user request đi qua 8 service, mỗi service log 10 lines. Tổng 80 log lines mixed với 1000 other concurrent requests. Filter cách nào?

Solution: **Correlation ID** (a.k.a. request ID, trace ID).

```text
Request 1 enters APIGateway. Generate ID = "req-abc-123".
APIGateway logs: "Received request" correlationId=req-abc-123
APIGateway forwards to CheckoutSvc with HTTP header: X-Correlation-ID: req-abc-123
CheckoutSvc logs: "Processing order" correlationId=req-abc-123
CheckoutSvc calls PaymentSvc with same header.
PaymentSvc logs: "Charging card" correlationId=req-abc-123
...
```

Query: `correlationId=req-abc-123` → see ALL events for that request across services. 

### Implementation

API Gateway / first service generate:
```java
String correlationId = request.getHeader("X-Correlation-ID");
if (correlationId == null) {
    correlationId = UUID.randomUUID().toString();
}
MDC.put("correlationId", correlationId);
// All subsequent log lines in this thread include correlationId.
```

Downstream HTTP call:
```java
httpClient.get(url)
    .header("X-Correlation-ID", MDC.get("correlationId"))
    .send();
```

Async (Kafka event):
```java
producerRecord.headers().add("X-Correlation-ID", 
    MDC.get("correlationId").getBytes());
```

Consumer extracts header and sets MDC for its processing.

### OpenTelemetry's TraceID

OpenTelemetry uses **TraceID** + **SpanID** standard. Frameworks auto-propagate.

```text
TraceID = correlationId equivalent (cross-service).
SpanID  = one operation within trace.
```

OTel format: `traceparent: 00-{traceId}-{spanId}-{flags}`. W3C standard.

Modern: use OTel. Don't roll your own correlation ID anymore.

## Best practice 5: Rich contextual fields

Log MORE than "error occurred". Include:

| Field | Why |
|---|---|
| `service` | Which microservice |
| `host` / `instance` | Which container |
| `userId` (or hash) | Whose request |
| `requestId` / `correlationId` | Tie to other events |
| `endpoint` / `method` | What API was called |
| `latency` | How long it took |
| `statusCode` | What was returned |
| `errorCode` / `exceptionType` | Categorize error |
| `stackTrace` (for ERROR) | Pinpoint code line |
| `parameters` (sanitized) | What inputs triggered |

Example rich error log:
```json
{
  "ts": "2026-05-31T10:23:45Z",
  "level": "ERROR",
  "service": "payment-svc",
  "host": "payment-svc-7d-x9k2p",
  "version": "v1.5.2",
  "correlationId": "req-abc-123",
  "spanId": "span-789",
  "userId": "u-42",
  "endpoint": "POST /charge",
  "latency_ms": 2654,
  "statusCode": 504,
  "exceptionType": "StripeTimeoutException",
  "errorCode": "STRIPE_504",
  "amount": 1500,
  "currency": "USD",
  "msg": "Payment gateway timeout",
  "stack": "at com.acme.payment.StripeClient.charge(StripeClient.java:127)\n..."
}
```

20 seconds of triage when this comes through. Without context: 2 hours.

## Best practice 6: Don't log secrets / PII

> ⚠️ **CRITICAL**: never log sensitive data:

| Don't log | Reason |
|---|---|
| Passwords | Obvious leak |
| Credit card numbers | PCI DSS compliance |
| Social security / national ID | Privacy law (GDPR, etc.) |
| Email addresses (often) | PII |
| Phone numbers | PII |
| API keys / tokens | Credential leak |
| Full request bodies | May contain above |
| Stripe API responses | Includes card details |

### Mitigations

**Redact at logger level**:
```java
@JsonSerialize(using = MaskedSerializer.class)
String password;

// Or in log message:
log.info("User login", "username", username, "password", "***");
```

**Field allowlist** in log config: only log known-safe fields.

**Hash PII for correlation**: log `userId_hash = sha256(userId)` to link events without exposing actual ID.

**GDPR right-to-erasure**: anonymize logs after 30 days, or use deletion API.

### Real incident

2018: GitHub accidentally logged some user passwords in plaintext logs (internal). Even though access controlled, this was a serious incident, public disclosure. Costs reputation + audit.

Treat logs as **potentially exposed**. Code accordingly.

## Best practice 7: Volume control

Log volume = cost + noise.

### Sampling

Don't log every successful request:
```java
if (random.nextDouble() < 0.01) {  // 1% sample
    log.info("Request handled", ...);
}
```

Always log errors. Sample success.

### Aggregation in logger

```java
// Instead of:
for (var item : items) log.debug("Processing item {}", item.id);

// Do:
log.debug("Processing {} items", items.size());
```

### Health-check filtering

```yaml
# Drop /health logs at shipper level
log_shipper:
  filters:
    - drop: path=~ ^/health$
```

Health probes happen every 5s. Drop them.

### Rate limiting per log line

```java
@RateLimited(maxPerMinute = 100)
log.error("Something went wrong");
```

Prevent error storms flooding broker.

## Anti-pattern: Log-and-throw

```java
catch (Exception e) {
    log.error("Failed!", e);
    throw new MyException(e);  // ← caller logs it again
}
```

Each layer logs same exception → 5× log spam.

Fix: log at boundary (top-level handler) OR throw. Not both.

## Anti-pattern: Print debugging in production

```python
print(f"DEBUG: user={user}")  # Won't go to centralized log
```

Use proper logger. Print bypasses central system → invisible in production.

## Production deployment example

Kubernetes:
```yaml
# DaemonSet runs Fluentd on each node
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
spec:
  template:
    spec:
      containers:
      - name: fluentd
        image: fluent/fluentd-kubernetes-daemonset:v1.16-debian-elasticsearch7-1
        # Tail container logs from /var/log/containers
        # Ship to Elasticsearch / Loki
```

Container app:
- Logs to stdout/stderr (12-factor app).
- K8s captures, Fluentd ships to ELK/Loki.
- Index by namespace, pod, container, plus log fields.

## Tóm tắt bài 2

- **Centralized aggregation** mandatory: ELK, Loki, Datadog, Splunk.
- **Structured logging (JSON)** > plain text — queryable, indexable.
- **Log levels** discipline: INFO+ in prod, DEBUG/TRACE only when investigating.
- **Correlation ID / trace ID** propagate cross-service (HTTP header + Kafka header). OTel standard.
- **Rich context**: service, host, user, endpoint, latency, error code, stack.
- **NEVER log secrets / PII** — redact, hash, allowlist.
- **Volume control**: sampling, drop health-check, rate-limit.
- Anti-pattern: log-and-throw (5× spam), print debugging.

**Bài kế tiếp** → [Bài 3: Metrics — measure trends, alert on SLOs](03-metrics.md)

# Bài 1: Monitoring và Observability — Prometheus, Grafana, ELK

Deploy được app chỉ là 1 nửa. **Quan sát** được app chạy thế nào = nửa còn lại. Bài này giới thiệu 3 trụ cột observability và toolkit standard.

## 3 trụ cột observability

```text
+──────────────+    +──────────────+    +──────────────+
│   METRICS    │    │     LOGS     │    │    TRACES    │
│              │    │              │    │              │
│ Numerical    │    │ Text events  │    │ Request flow │
│ time series  │    │ what happened│    │ across svcs  │
│              │    │              │    │              │
│ CPU 75%      │    │ ERROR: ...   │    │ A→B→C 200ms  │
│ req/s 100    │    │ INFO: ...    │    │              │
+──────────────+    +──────────────+    +──────────────+
```

| | Metrics | Logs | Traces |
|---|---|---|---|
| Type | Number time series | Text events | Request path |
| Cardinality | Low (CPU, RAM) | High (per request) | Per request |
| Storage | TSDB (Prometheus) | Document store (ELK) | Trace DB (Jaeger) |
| Cost | Cheap | Med | Med |
| Use | Aggregate, alert | Debug specific event | Find slow service |

## Tools landscape

| Category | Tool |
|---|---|
| **Metrics** | Prometheus, InfluxDB, Datadog, CloudWatch |
| **Logs** | Elasticsearch + Kibana (ELK), Loki, Splunk, Datadog Logs |
| **Traces** | Jaeger, Tempo, Zipkin, Datadog APM |
| **Dashboards** | Grafana (universal), Kibana (logs), Datadog |
| **Alerting** | Alertmanager, PagerDuty, Opsgenie, Slack |
| **All-in-one** | Datadog, New Relic, Dynatrace (paid SaaS) |
| **Open source stack** | LGTM (Loki/Grafana/Tempo/Mimir) by Grafana Labs |

Khoá học focus **Prometheus + Grafana** (open source standard).

## Prometheus

> **Prometheus** = time-series database + pull-based metrics scraper. Sinh ra ở SoundCloud, donate cho CNCF, là **chuẩn metrics ngành**.

### Architecture

```text
+──────────────+   scrape    +────────────────+
│ App with     │ ◄────────── │  Prometheus    │
│ /metrics     │  HTTP pull  │  server        │
│ endpoint     │   15s       │                │
+──────────────+             │  TSDB          │
                             │  Alertmgr      │
                             +────────────────+
                                      │
                                      ▼ visualize
                             +────────────────+
                             │   Grafana      │
                             │  dashboards    │
                             +────────────────+
```

Pull-based: Prometheus **gọi** target HTTP `/metrics` mỗi 15s. Khác push (StatsD, Telegraf).

### Metric format

```text
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 1234
http_requests_total{method="POST",status="201"} 567
http_requests_total{method="GET",status="500"} 12

# HELP node_cpu_seconds_total CPU time
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="user"} 12345.67
node_cpu_seconds_total{cpu="0",mode="idle"} 98765.43
```

Components:
- **Name**: `http_requests_total`.
- **Labels**: `{method="GET", status="200"}` — high cardinality.
- **Value**: number.

### 4 metric types

| Type | Mô tả | Ví dụ |
|---|---|---|
| **Counter** | Tăng dần, reset 0 khi restart | `http_requests_total` |
| **Gauge** | Lên/xuống tùy ý | `memory_usage_bytes`, `temperature` |
| **Histogram** | Distribution (bucket) | `request_duration_seconds` |
| **Summary** | Như histogram, client-side quantile | `response_size_bytes` |

### Exporter

App **không** tự expose metrics → exporter làm cầu nối:

| Exporter | Cho |
|---|---|
| **node_exporter** | Linux server (CPU, RAM, disk, network) |
| **cAdvisor** | Container |
| **mysqld_exporter** | MySQL |
| **redis_exporter** | Redis |
| **nginx_exporter** | nginx |
| **kube-state-metrics** | Kubernetes state |
| **blackbox_exporter** | HTTP/ICMP probe |

Setup node_exporter:

```bash
# Download
wget https://github.com/prometheus/node_exporter/releases/download/v1.7.0/node_exporter-1.7.0.linux-amd64.tar.gz
tar -xzf node_exporter-*.tar.gz
sudo mv node_exporter-*/node_exporter /usr/local/bin/

# systemd unit
sudo tee /etc/systemd/system/node_exporter.service <<EOF
[Unit]
Description=Node Exporter
[Service]
ExecStart=/usr/local/bin/node_exporter
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable --now node_exporter
curl http://localhost:9100/metrics | head
```

### Setup Prometheus

```bash
# Download
wget https://github.com/prometheus/prometheus/releases/download/v2.50.0/prometheus-2.50.0.linux-amd64.tar.gz
tar -xzf prometheus-*.tar.gz
cd prometheus-*

# Config
cat > prometheus.yml <<EOF
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node'
    static_configs:
      - targets:
        - 'web01:9100'
        - 'db01:9100'
        - 'app01:9100'

  - job_name: 'vprofile-app'
    static_configs:
      - targets: ['app01:8080']
    metrics_path: '/actuator/prometheus'    # Spring Boot
EOF

./prometheus --config.file=prometheus.yml
```

Browser: `http://localhost:9090`.

### PromQL — query language

```promql
# Current metric
http_requests_total

# Filter
http_requests_total{status="500"}

# Rate (per second)
rate(http_requests_total[5m])

# Aggregate
sum by (status) (rate(http_requests_total[5m]))

# Math
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100

# Threshold
node_cpu_seconds_total > 80
```

## Grafana

> **Grafana** = dashboard + visualization. Data source agnostic (Prometheus, MySQL, Elasticsearch, ...).

```bash
docker run -d -p 3000:3000 --name grafana grafana/grafana
```

Browser: `http://localhost:3000` → login `admin/admin` → set new password.

### Setup dashboard

1. Configuration → Data Sources → Add → Prometheus → URL `http://prometheus:9090`.
2. Dashboard → Import → ID `1860` (Node Exporter Full) → Done.

Hàng nghìn dashboard có sẵn ở [grafana.com/dashboards](https://grafana.com/grafana/dashboards).

### Custom panel

Query PromQL:

```promql
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

Panel hiện CPU usage % cho mỗi server.

## Alertmanager

```yaml
# alertmanager.yml
route:
  receiver: 'slack'
  group_by: ['alertname']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 1h

receivers:
  - name: 'slack'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/...'
        channel: '#alerts'
        text: '{{ .CommonAnnotations.summary }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_KEY'
```

Prometheus rules:

```yaml
# rules.yml
groups:
  - name: cpu
    rules:
      - alert: HighCPU
        expr: 100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU on {{ $labels.instance }}"
          description: "CPU > 80% for 5 minutes"

      - alert: DiskFull
        expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Disk almost full on {{ $labels.instance }}"
```

Khi rule trigger → Prometheus gửi alert → Alertmanager → Slack/PagerDuty.

## ELK Stack — log

```text
+──────────+     +──────────+     +────────────+     +───────+
│ App logs │ ──► │ Filebeat │ ──► │ Logstash   │ ──► │ Elas- │ ──► Kibana
│          │     │ (collect)│     │ (transform)│     │tic-   │     (UI)
+──────────+     +──────────+     +────────────+     │search │
                                                     │ (DB)  │
                                                     +───────+
```

- **Elasticsearch**: distributed search engine.
- **Logstash**: log processor (parse, transform).
- **Kibana**: web UI cho search + visualize.
- **Beats**: lightweight collectors (Filebeat, Metricbeat, Auditbeat).

Modern alternative: **Loki** (Grafana Labs) — like Prometheus but for logs, cheaper.

### Setup ELK Docker

```bash
docker run -d --name elasticsearch \
    -p 9200:9200 \
    -e "discovery.type=single-node" \
    -e "xpack.security.enabled=false" \
    docker.elastic.co/elasticsearch/elasticsearch:8.12.0

docker run -d --name kibana \
    -p 5601:5601 \
    -e ELASTICSEARCH_HOSTS=http://elasticsearch:9200 \
    --link elasticsearch \
    docker.elastic.co/kibana/kibana:8.12.0
```

Kibana: `http://localhost:5601`.

## Distributed tracing — Jaeger

Microservices → request đi qua nhiều service → cần trace.

```text
User → API Gateway → Auth Service → User Service → DB
                                       │
                                       └──► Notification Service → Email
```

Mỗi span = 1 hop. Trace = chuỗi span.

Setup Jaeger:

```bash
docker run -d --name jaeger \
    -p 16686:16686 \
    -p 6831:6831/udp \
    jaegertracing/all-in-one:latest
```

UI: `http://localhost:16686`.

App instrumented với OpenTelemetry SDK → gửi span vào Jaeger.

## Golden signals — Google SRE

4 metric **must monitor**:

1. **Latency** — request response time.
2. **Traffic** — req/s.
3. **Errors** — error rate %.
4. **Saturation** — CPU/RAM/disk %.

Mỗi service phải có 4 metric này. Alert khi vi phạm SLO.

## SLI / SLO / SLA

| Term | Mô tả | Ví dụ |
|---|---|---|
| **SLI** (Indicator) | Metric đo | `success_rate = success / total` |
| **SLO** (Objective) | Target | success_rate > 99.9% |
| **SLA** (Agreement) | Contract với user + penalty | 99.95% uptime, refund nếu < |

Pattern: define SLO → calculate error budget → quyết định deploy mới hay focus stability.

## Logging best practices

```python
# Bad
print("User logged in")

# Good — structured JSON
log.info("user_login", extra={
    "user_id": user.id,
    "ip": request.remote_addr,
    "timestamp": time.time(),
})
```

```text
# JSON output
{"level":"info","msg":"user_login","user_id":1234,"ip":"1.2.3.4","ts":1717000000}
```

JSON log → query dễ trong Kibana/Loki.

## Setup observability cho vProfile

```text
                Grafana :3000
                      │
                      ▼
                Prometheus :9090
                      │ scrape
       ┌──────────────┼──────────────┐
       ▼              ▼              ▼
  node_exporter  node_exporter  app metrics
   (web01)        (app01)       (app01:8080/actuator/prometheus)
                      ▼
                  Loki :3100
                      │
       Promtail collect /var/log
                      ▲
                      │
         Filebeat / Promtail in each VM
```

## CloudWatch — AWS native alternative

Nếu trên AWS, CloudWatch tích hợp sẵn:
- Metrics: free 10 alarm, paid more.
- Logs: log group + log stream.
- Insights query.
- Dashboards.

Pros: zero setup, IAM integrated.
Cons: lock-in AWS, expensive at scale.

Pattern: dev/lab Prometheus, prod CloudWatch hoặc DataDog.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Cardinality explosion | Prometheus OOM | Tránh label per-user/per-request |
| Log không structured | Khó query | JSON log từ đầu |
| Alert noisy | Ignored | Tune threshold, suppress |
| No SLO | Random debate | Define SLO clearly |
| Storage không retention | Disk full | Set retention 15-30d |
| Single Prometheus | SPOF | Federation hoặc Thanos cho HA |
| Quên backup dashboard | Mất config | Grafana provisioning Git |

## Tóm tắt bài 1

- **3 trụ cột**: metrics (Prometheus), logs (ELK/Loki), traces (Jaeger).
- **Prometheus pull-based**, 4 metric types (counter, gauge, histogram, summary).
- **Exporter** bridge cho app không có /metrics native (node_exporter, cAdvisor).
- **PromQL** query: rate, sum by, math.
- **Grafana** dashboard universal — Prometheus + ELK + nhiều data source.
- **Alertmanager** route alert → Slack, PagerDuty.
- **Golden signals**: latency, traffic, errors, saturation.
- **SLI/SLO/SLA** — define target trước, không reactive.
- AWS native: CloudWatch (free tier limited, expensive scale).

**Phase kế tiếp** → [Phase 24 — Bài 1: AWS Part 2 nâng cao](../phase-24-aws-part2/01-aws-advanced.md)

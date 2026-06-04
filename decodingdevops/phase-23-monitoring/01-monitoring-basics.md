# Bài 1: Monitoring và Observability — Prometheus, Grafana, ELK

Deploy được app chỉ là 1 nửa công việc. **Quan sát được app chạy thế nào** = nửa còn lại. Bài này giới thiệu 3 trụ cột observability và toolkit chuẩn ngành.

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
| Loại | Số liệu time series | Sự kiện text | Đường đi của request |
| Cardinality | Thấp (CPU, RAM) | Cao (mỗi request) | Mỗi request |
| Storage | TSDB (Prometheus) | Document store (ELK) | Trace DB (Jaeger) |
| Cost | Rẻ | Trung bình | Trung bình |
| Dùng để | Aggregate, alert | Debug event cụ thể | Tìm service chậm |

## Toolkit landscape (Bức tranh tổng thể)

| Category | Tool |
|---|---|
| **Metrics** | Prometheus, InfluxDB, Datadog, CloudWatch |
| **Logs** | Elasticsearch + Kibana (ELK), Loki, Splunk, Datadog Logs |
| **Traces** | Jaeger, Tempo, Zipkin, Datadog APM |
| **Dashboards** | Grafana (universal), Kibana (cho logs), Datadog |
| **Alerting** | Alertmanager, PagerDuty, Opsgenie, Slack |
| **All-in-one (SaaS)** | Datadog, New Relic, Dynatrace |
| **Open source stack** | LGTM (Loki/Grafana/Tempo/Mimir) của Grafana Labs |

Khoá học focus vào **Prometheus + Grafana** — chuẩn open source phổ biến nhất.

## Prometheus

> **Prometheus** = time-series database + metrics scraper kiểu pull. Ra đời tại SoundCloud, được donate cho CNCF, hiện là **chuẩn metrics của ngành**.

### Architecture

```text
+──────────────+   scrape    +────────────────+
│ App với      │ ◄────────── │  Prometheus    │
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

Cơ chế pull-based: Prometheus **chủ động gọi** target HTTP `/metrics` mỗi 15s. Khác với push-based (StatsD, Telegraf — app tự đẩy metric đến server).

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

Cấu trúc metric:
- **Name** (tên): `http_requests_total`.
- **Labels** (nhãn): `{method="GET", status="200"}` — high cardinality.
- **Value** (giá trị): số.

### 4 metric types (4 loại metric)

| Type | Mô tả | Ví dụ |
|---|---|---|
| **Counter** | Chỉ tăng dần, reset về 0 khi app restart | `http_requests_total` |
| **Gauge** | Có thể lên/xuống tuỳ ý | `memory_usage_bytes`, `temperature` |
| **Histogram** | Distribution (chia bucket) | `request_duration_seconds` |
| **Summary** | Giống histogram, tính quantile ở client | `response_size_bytes` |

### Exporter (Bộ chuyển đổi)

Khi app **không tự** expose metric ở format Prometheus → cần exporter làm cầu nối:

| Exporter | Dùng cho |
|---|---|
| **node_exporter** | Linux server (CPU, RAM, disk, network) |
| **cAdvisor** | Container |
| **mysqld_exporter** | MySQL |
| **redis_exporter** | Redis |
| **nginx_exporter** | nginx |
| **kube-state-metrics** | State của Kubernetes |
| **blackbox_exporter** | HTTP / ICMP probe |

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
    metrics_path: '/actuator/prometheus'    # Endpoint của Spring Boot
EOF

./prometheus --config.file=prometheus.yml
```

Browser: `http://localhost:9090`.

### PromQL — Ngôn ngữ query

```promql
# Metric hiện tại
http_requests_total

# Filter
http_requests_total{status="500"}

# Rate (mỗi giây)
rate(http_requests_total[5m])

# Aggregate
sum by (status) (rate(http_requests_total[5m]))

# Toán học
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100

# So sánh ngưỡng
node_cpu_seconds_total > 80
```

## Grafana

> **Grafana** = dashboard + visualization. Hỗ trợ rất nhiều data source (Prometheus, MySQL, Elasticsearch, ...).

```bash
docker run -d -p 3000:3000 --name grafana grafana/grafana
```

Browser: `http://localhost:3000` → đăng nhập `admin/admin` → set password mới.

### Setup dashboard

1. Configuration → Data Sources → Add → Prometheus → URL `http://prometheus:9090`.
2. Dashboard → Import → ID `1860` (Node Exporter Full) → Done.

Có hàng nghìn dashboard có sẵn tại [grafana.com/dashboards](https://grafana.com/grafana/dashboards).

### Custom panel

Query bằng PromQL:

```promql
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

Panel hiển thị % CPU usage cho từng server.

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

Prometheus rules (định nghĩa alert):

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
          description: "CPU > 80% trong 5 phút"

      - alert: DiskFull
        expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Disk almost full on {{ $labels.instance }}"
```

Khi rule trigger → Prometheus gửi alert đến Alertmanager → Alertmanager forward đến Slack/PagerDuty.

## ELK Stack — Log

```text
+──────────+     +──────────+     +────────────+     +───────+
│ App logs │ ──► │ Filebeat │ ──► │ Logstash   │ ──► │ Elas- │ ──► Kibana
│          │     │ (collect)│     │ (transform)│     │tic-   │     (UI)
+──────────+     +──────────+     +────────────+     │search │
                                                     │ (DB)  │
                                                     +───────+
```

- **Elasticsearch**: distributed search engine.
- **Logstash**: log processor (parse, transform log).
- **Kibana**: web UI để search + visualize.
- **Beats**: collector nhẹ (Filebeat cho file log, Metricbeat cho metric, Auditbeat cho audit).

Alternative hiện đại: **Loki** (Grafana Labs) — giống Prometheus nhưng cho log, rẻ hơn nhiều.

### Setup ELK qua Docker

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

Trong microservices → 1 request đi qua nhiều service → cần trace để debug:

```text
User → API Gateway → Auth Service → User Service → DB
                                       │
                                       └──► Notification Service → Email
```

Mỗi span = 1 hop. Trace = chuỗi các span liên kết.

Setup Jaeger:

```bash
docker run -d --name jaeger \
    -p 16686:16686 \
    -p 6831:6831/udp \
    jaegertracing/all-in-one:latest
```

UI: `http://localhost:16686`.

App được instrument với OpenTelemetry SDK → gửi span vào Jaeger.

## Golden signals — Google SRE

4 metric **bắt buộc phải monitor**:

1. **Latency** — thời gian response của request.
2. **Traffic** — số request/giây.
3. **Errors** — tỉ lệ lỗi (%).
4. **Saturation** — mức sử dụng tài nguyên CPU/RAM/disk (%).

Mỗi service production phải có 4 metric này. Alert khi vượt SLO.

## SLI / SLO / SLA

| Term | Mô tả | Ví dụ |
|---|---|---|
| **SLI** (Indicator) | Metric để đo | `success_rate = success / total` |
| **SLO** (Objective) | Mục tiêu nội bộ | success_rate > 99.9% |
| **SLA** (Agreement) | Cam kết với khách hàng + penalty | 99.95% uptime, refund nếu dưới mức |

Pattern: define SLO → tính error budget → quyết định nên deploy tính năng mới hay focus vào stability.

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
# Output dạng JSON
{"level":"info","msg":"user_login","user_id":1234,"ip":"1.2.3.4","ts":1717000000}
```

Log dạng JSON → query trong Kibana/Loki dễ dàng theo từng field.

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
         Filebeat / Promtail trên mỗi VM
```

## CloudWatch — Alternative trên AWS

Nếu chạy trên AWS, CloudWatch tích hợp sẵn:
- Metrics: free 10 alarm, nhiều hơn thì tính phí.
- Logs: log group + log stream.
- Insights query.
- Dashboards.

Ưu điểm: zero setup, tích hợp IAM.
Nhược điểm: vendor lock-in AWS, đắt khi scale lớn.

Pattern phổ biến: dev/lab dùng Prometheus, prod dùng CloudWatch hoặc Datadog.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Cardinality explosion (quá nhiều giá trị label) | Prometheus OOM | Tránh label per-user / per-request |
| Log không structured | Khó query | Dùng JSON log từ đầu |
| Alert noisy (nhiều cảnh báo nhiễu) | Bị bỏ qua | Tinh chỉnh threshold, suppress |
| Không có SLO | Tranh cãi mà không có data | Define SLO rõ ràng |
| Storage không có retention | Disk đầy | Set retention 15-30 ngày |
| Single Prometheus instance | SPOF | Federation hoặc Thanos cho HA |
| Quên backup dashboard | Mất config | Grafana provisioning lưu Git |

## Tóm tắt bài 1

- **3 trụ cột observability**: metrics (Prometheus), logs (ELK/Loki), traces (Jaeger).
- **Prometheus** pull-based, 4 metric type (counter, gauge, histogram, summary).
- **Exporter** làm cầu nối cho app không có endpoint /metrics native (node_exporter, cAdvisor).
- **PromQL** query: rate, sum by, math operation.
- **Grafana** dashboard universal — hỗ trợ Prometheus + ELK + nhiều data source khác.
- **Alertmanager** route alert đến Slack, PagerDuty.
- **Golden signals**: latency, traffic, errors, saturation.
- **SLI/SLO/SLA** — define target trước, không reactive.
- AWS native: CloudWatch (free tier hạn chế, đắt khi scale).

**Phase kế tiếp** → [Phase 24 — Bài 1: AWS Part 2 nâng cao](../phase-24-aws-part2/01-aws-advanced.md)

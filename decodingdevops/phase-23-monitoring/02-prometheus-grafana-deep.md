# Bài 2: Prometheus + Grafana deep — setup production

Bài 1 overview. Bài này **setup production-grade** Prometheus + Grafana stack với Alertmanager.

## Prometheus production setup

### Docker Compose stack

`docker-compose.yml`:

```yaml
version: '3.9'

services:
  prometheus:
    image: prom/prometheus:v2.50.0
    container_name: prometheus
    restart: unless-stopped
    user: "65534:65534"
    volumes:
      - ./prometheus:/etc/prometheus
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--storage.tsdb.retention.size=50GB'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
      - '--web.enable-lifecycle'
      - '--web.external-url=https://prometheus.acme.com'
    ports:
      - "9090:9090"
    networks:
      - monitoring

  alertmanager:
    image: prom/alertmanager:v0.27.0
    container_name: alertmanager
    restart: unless-stopped
    volumes:
      - ./alertmanager:/etc/alertmanager
      - alertmanager-data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
      - '--web.external-url=https://alertmanager.acme.com'
    ports:
      - "9093:9093"
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:10.3.0
    container_name: grafana
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD:-admin}
      GF_USERS_ALLOW_SIGN_UP: false
      GF_SERVER_ROOT_URL: https://grafana.acme.com
      GF_AUTH_GOOGLE_ENABLED: true
      GF_AUTH_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GF_AUTH_GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      GF_AUTH_GOOGLE_ALLOWED_DOMAINS: acme.com
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    ports:
      - "3000:3000"
    networks:
      - monitoring

  node-exporter:
    image: prom/node-exporter:v1.7.0
    container_name: node-exporter
    restart: unless-stopped
    pid: host
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    ports:
      - "9100:9100"
    networks:
      - monitoring

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    container_name: cadvisor
    restart: unless-stopped
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker:/var/lib/docker:ro
      - /dev/disk:/dev/disk:ro
    ports:
      - "8080:8080"
    networks:
      - monitoring

volumes:
  prometheus-data:
  alertmanager-data:
  grafana-data:

networks:
  monitoring:
```

### prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: production
    environment: prod

# Alertmanager
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

# Rule files
rule_files:
  - 'rules/*.yml'

# Scrape configs
scrape_configs:
  # Self
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Alertmanager
  - job_name: 'alertmanager'
    static_configs:
      - targets: ['alertmanager:9093']

  # Node exporter — static
  - job_name: 'node'
    static_configs:
      - targets:
          - 'web01:9100'
          - 'web02:9100'
          - 'db01:9100'
        labels:
          group: 'production'

  # Node exporter — EC2 service discovery
  - job_name: 'ec2-nodes'
    ec2_sd_configs:
      - region: us-east-1
        port: 9100
        filters:
          - name: tag:Project
            values: [vprofile]
          - name: tag:Monitor
            values: [enabled]
    relabel_configs:
      - source_labels: [__meta_ec2_tag_Name]
        target_label: instance
      - source_labels: [__meta_ec2_tag_Environment]
        target_label: env
      - source_labels: [__meta_ec2_tag_Role]
        target_label: role

  # K8s pods
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__

  # Docker containers
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']

  # Application — Spring Boot Actuator
  - job_name: 'vprofile-app'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets:
          - 'app01:8080'
          - 'app02:8080'

  # Blackbox — HTTP probe
  - job_name: 'blackbox-http'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://vprofile.acme.com
          - https://api.vprofile.acme.com/health
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox:9115
```

## Alert rules

`rules/golden-signals.yml`:

```yaml
groups:
  - name: golden_signals
    interval: 30s
    rules:
      # Latency
      - alert: HighLatencyP99
        expr: |
          histogram_quantile(0.99,
            sum by (le, service) (rate(http_request_duration_seconds_bucket[5m]))
          ) > 1
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "High P99 latency on {{ $labels.service }}"
          description: "P99 latency is {{ $value | humanizeDuration }}"
          runbook: "https://wiki.acme.com/runbook/high-latency"

      # Error rate
      - alert: HighErrorRate
        expr: |
          sum by (service) (rate(http_requests_total{status=~"5.."}[5m]))
            / sum by (service) (rate(http_requests_total[5m]))
            > 0.05
        for: 5m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Error rate > 5% on {{ $labels.service }}"

      # Saturation - CPU
      - alert: HighCPU
        expr: |
          100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "CPU > 85% on {{ $labels.instance }}"

      # Saturation - Memory
      - alert: HighMemory
        expr: |
          (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90
        for: 10m
        labels:
          severity: warning

      # Saturation - Disk
      - alert: DiskAlmostFull
        expr: |
          (node_filesystem_avail_bytes / node_filesystem_size_bytes) < 0.10
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Disk < 10% on {{ $labels.instance }}:{{ $labels.mountpoint }}"

      # Service down
      - alert: ServiceDown
        expr: up == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "{{ $labels.job }} down on {{ $labels.instance }}"
```

`rules/sli-slo.yml`:

```yaml
groups:
  - name: vprofile_slo
    rules:
      # SLI: availability
      - record: sli:availability:5m
        expr: |
          sum(rate(http_requests_total{status!~"5.."}[5m]))
            / sum(rate(http_requests_total[5m]))

      # SLO: 99.9% availability over 30d
      - alert: ErrorBudgetBurn
        expr: |
          (1 - sli:availability:5m) > (1 - 0.999) * 14.4
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error budget burning fast — exhaust in < 2 days"
```

## Alertmanager config

```yaml
global:
  resolve_timeout: 5m
  slack_api_url: 'https://hooks.slack.com/services/...'

route:
  receiver: 'default'
  group_by: ['alertname', 'cluster']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true

    - match:
        severity: warning
      receiver: 'slack-warnings'

    - match:
        team: platform
      receiver: 'slack-platform'

    - match:
        severity: info
      receiver: 'slack-info'

receivers:
  - name: 'default'
    slack_configs:
      - channel: '#alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: '${PD_SERVICE_KEY}'
        description: '{{ .GroupLabels.alertname }}'

  - name: 'slack-warnings'
    slack_configs:
      - channel: '#alerts-warning'
        color: 'warning'

  - name: 'slack-platform'
    slack_configs:
      - channel: '#platform-alerts'

  - name: 'slack-info'
    slack_configs:
      - channel: '#alerts-info'

inhibit_rules:
  # Suppress warning if critical alert for same instance
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['instance', 'alertname']
```

## PromQL deep

### Selectors

```promql
# Basic
http_requests_total

# Filter
http_requests_total{method="POST", status="200"}
http_requests_total{status=~"5.."}        # Regex
http_requests_total{instance!="localhost"} # Not equal
```

### Range vectors

```promql
# Last 5 minutes data
http_requests_total[5m]

# Rate (per second)
rate(http_requests_total[5m])

# Increase (counter delta)
increase(http_requests_total[1h])

# Average over time
avg_over_time(node_load1[1h])
```

### Aggregation

```promql
# Sum across all instances
sum(rate(http_requests_total[5m]))

# Sum by label
sum by (status) (rate(http_requests_total[5m]))

# Sum excluding label
sum without (instance) (rate(http_requests_total[5m]))

# Common aggregators
sum, avg, max, min, count, stddev, stdvar, topk, bottomk
```

### Functions

```promql
# Histogram quantile (P50, P95, P99)
histogram_quantile(0.95,
  sum by (le) (rate(http_request_duration_bucket[5m]))
)

# Sort
topk(10, sum by (instance) (rate(http_requests_total[5m])))

# Time-related
predict_linear(node_filesystem_avail_bytes[1h], 4 * 3600)  # 4h prediction

# Label manipulation
label_replace(metric, "new_label", "$1", "old_label", "(.*)")
```

### Combine queries

```promql
# Subtraction
node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes

# Division
node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes * 100

# Vector matching
rate(http_requests_total[5m]) / on(instance) group_left node_cpu_count
```

## Grafana provisioning

`grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

`grafana/provisioning/dashboards/dashboards.yml`:

```yaml
apiVersion: 1
providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    options:
      path: /etc/grafana/provisioning/dashboards
```

Copy dashboard JSON vào path → auto-load.

Top dashboards:
- **1860**: Node Exporter Full.
- **13775**: cAdvisor.
- **13639**: Logs from Loki.
- **12175**: Kubernetes cluster.

```bash
# Download
curl -L https://grafana.com/api/dashboards/1860/revisions/latest/download \
    -o grafana/provisioning/dashboards/node-exporter.json
```

## Production tips

### High availability

```text
2 Prometheus replica → same scrape, write to long-term storage (Thanos/Mimir/VictoriaMetrics)
2 Alertmanager replica → deduplicated alerts
3 Grafana replica → shared SQLite/MySQL DB
```

### Long-term storage

Prometheus retention 30 days default. For longer:
- **Thanos**: sidecar + object storage (S3).
- **Cortex / Mimir**: scalable multi-tenant.
- **VictoriaMetrics**: drop-in replacement, faster.

### Federation

Central Prometheus scrape from regional Prometheus:

```yaml
- job_name: 'federate'
  honor_labels: true
  metrics_path: '/federate'
  params:
    'match[]':
      - '{job=~".+"}'
  static_configs:
    - targets:
        - 'us-east-prom:9090'
        - 'us-west-prom:9090'
```

### Recording rules

Pre-compute expensive queries:

```yaml
groups:
  - name: recording
    interval: 30s
    rules:
      - record: instance:node_cpu_usage:rate5m
        expr: 100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100
```

Dashboard query `instance:node_cpu_usage:rate5m` → fast lookup.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Cardinality high (user_id label) | OOM | Aggregate before label |
| No retention setup | Disk full | Set retention.time + retention.size |
| Alert flapping | Pager fatigue | Add `for: Nm`, inhibit rules |
| Slow PromQL | Query timeout | Recording rules |
| No HA | SPOF | 2+ replicas |
| Forget Alertmanager | Alert not delivered | Always pair Prom + AM |
| Cert expiring not alerted | HTTPS break | Blackbox monitor TLS expiry |

## Tóm tắt bài 2

- Production stack: **Prometheus + Alertmanager + Grafana + node_exporter + cAdvisor**.
- **Service discovery**: EC2, K8s, Consul auto-find targets.
- **Alert rules** golden signals + SLO burn rate.
- **Alertmanager** routing: severity → Slack/PagerDuty.
- **Inhibit rules** suppress noise.
- **PromQL**: rate, sum by, histogram_quantile, predict_linear.
- **Grafana provisioning** datasource + dashboard from file.
- **Long-term storage**: Thanos / Mimir / VictoriaMetrics.

**Bài kế tiếp** → [Bài 3: Loki + ELK log + distributed tracing](03-loki-elk-tracing.md)

# Bài 3: Logs (Loki/ELK) + Distributed tracing (Jaeger)

Metrics chỉ là 1/3 observability. Bài này dạy **logs aggregation** và **distributed tracing**.

## Loki — log như Prometheus

**Loki** (Grafana Labs) = log aggregation rẻ + scale:
- Index **only labels**, log content stored compressed.
- 10-100x cheaper than ELK.
- Query với LogQL (giống PromQL).

### Stack

```text
App → Promtail/Fluent Bit → Loki → Grafana
```

### Loki Docker Compose

```yaml
services:
  loki:
    image: grafana/loki:2.9.4
    container_name: loki
    restart: unless-stopped
    user: "10001:10001"
    volumes:
      - ./loki/config.yml:/etc/loki/config.yml
      - loki-data:/loki
    command: -config.file=/etc/loki/config.yml
    ports:
      - "3100:3100"

  promtail:
    image: grafana/promtail:2.9.4
    container_name: promtail
    restart: unless-stopped
    volumes:
      - ./promtail/config.yml:/etc/promtail/config.yml
      - /var/log:/var/log:ro
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
    command: -config.file=/etc/promtail/config.yml
```

### loki config

```yaml
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore: {store: inmemory}
      replication_factor: 1

schema_config:
  configs:
    - from: 2024-01-01
      store: boltdb-shipper
      object_store: s3
      schema: v12
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/index
    cache_location: /loki/cache
    shared_store: s3
  aws:
    bucketnames: acme-loki-logs
    region: us-east-1
    s3forcepathstyle: false

compactor:
  working_directory: /loki/compactor
  shared_store: s3

limits_config:
  retention_period: 30d
  max_entries_limit_per_query: 5000
```

### Promtail config

```yaml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # System logs
  - job_name: syslog
    static_configs:
      - targets: [localhost]
        labels:
          job: syslog
          __path__: /var/log/syslog

  # nginx
  - job_name: nginx
    static_configs:
      - targets: [localhost]
        labels:
          job: nginx
          __path__: /var/log/nginx/*.log

  # Docker
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'

  # Tomcat app
  - job_name: vprofile-app
    static_configs:
      - targets: [localhost]
        labels:
          job: vprofile
          environment: production
          __path__: /opt/tomcat/logs/catalina.out
    pipeline_stages:
      # Parse Java log
      - multiline:
          firstline: '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}'
          max_wait_time: 3s
      - regex:
          expression: '^(?P<timestamp>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}) (?P<level>\w+) \[(?P<thread>[^\]]+)\] (?P<logger>\S+) - (?P<message>.*)'
      - labels:
          level:
          logger:
      - timestamp:
          source: timestamp
          format: '2006-01-02 15:04:05.000'
```

Pipeline:
- **multiline**: gộp stack trace thành 1 entry.
- **regex**: parse cấu trúc.
- **labels**: extract field thành label searchable.
- **timestamp**: use log time thay shipper time.

### LogQL queries

```logql
# All logs from app
{job="vprofile"}

# Filter level
{job="vprofile", level="ERROR"}

# Search content
{job="vprofile"} |= "OutOfMemoryError"

# Regex
{job="nginx"} |~ "5\\d{2}"

# Exclude
{job="vprofile"} != "DEBUG"

# Parse + filter
{job="nginx"}
  | json
  | status >= 500

# Rate of errors
sum(rate({job="vprofile", level="ERROR"}[5m]))

# Count by source
sum by (logger) (count_over_time({job="vprofile"}[1h]))
```

### Add Loki datasource Grafana

```yaml
- name: Loki
  type: loki
  url: http://loki:3100
```

Grafana **Explore** view → switch datasource Loki → query LogQL → live tail.

## ELK Stack — Elasticsearch + Kibana

Heavier than Loki nhưng full-text search mạnh hơn.

### Stack

```text
App → Filebeat → Logstash (parse) → Elasticsearch → Kibana
```

### Filebeat config

```yaml
filebeat.inputs:
  - type: filestream
    paths:
      - /var/log/nginx/access.log
    fields:
      service: nginx
      type: access
    fields_under_root: true

  - type: container
    paths:
      - /var/lib/docker/containers/*/*.log

output.logstash:
  hosts: ["logstash:5044"]

processors:
  - add_host_metadata: ~
  - add_docker_metadata: ~
```

### Logstash pipeline

```text
input {
    beats {
        port => 5044
    }
}

filter {
    if [service] == "nginx" {
        grok {
            match => {
                "message" => "%{COMBINEDAPACHELOG}"
            }
        }
        date {
            match => ["timestamp", "dd/MMM/yyyy:HH:mm:ss Z"]
        }
        geoip {
            source => "clientip"
        }
    }

    if [type] == "json" {
        json {
            source => "message"
        }
    }

    mutate {
        remove_field => ["host", "agent", "ecs"]
    }
}

output {
    elasticsearch {
        hosts => ["http://elasticsearch:9200"]
        index => "logs-%{+YYYY.MM.dd}"
        template_overwrite => true
    }
}
```

### Kibana

UI: discover logs, build dashboard, full-text search.

Index management:
- ILM (Index Lifecycle Management): hot → warm → cold → delete.
- Retention 30-90 ngày.
- Snapshot to S3 cho long-term.

### Loki vs ELK

| | Loki | ELK |
|---|---|---|
| Cost | Low | High |
| Index | Labels only | Full-text |
| Search speed | Slow per-line | Fast |
| Storage | Compressed object store | Disk-heavy |
| Aggregation | Limited | Powerful |
| Best for | Dev/debug, K8s logs | Production search-heavy |
| Grafana integration | Native | Plugin |

Modern: **Loki + ELK combine** — Loki for cheap retention, ELK for hot recent.

## Distributed tracing — Jaeger

### Concept

Trace request đi qua nhiều service:

```text
User → API Gateway → Auth → User Service → DB
                              ↓
                              Notification → Email
```

Each hop = span. Trace = chain of spans với common ID.

### Jaeger setup

```yaml
services:
  jaeger:
    image: jaegertracing/all-in-one:1.54
    container_name: jaeger
    restart: unless-stopped
    environment:
      COLLECTOR_OTLP_ENABLED: 'true'
    ports:
      - "16686:16686"      # UI
      - "4317:4317"        # OTLP gRPC
      - "4318:4318"        # OTLP HTTP
      - "6831:6831/udp"    # Jaeger compact
```

UI: `http://localhost:16686`.

### Instrument app — Java

```xml
<!-- pom.xml -->
<dependency>
    <groupId>io.opentelemetry.instrumentation</groupId>
    <artifactId>opentelemetry-spring-boot-starter</artifactId>
    <version>2.0.0</version>
</dependency>
```

`application.yml`:

```yaml
otel:
  service:
    name: vprofile
  exporter:
    otlp:
      endpoint: http://jaeger:4317
  traces:
    exporter: otlp
    sampler: parentbased_traceidratio
    sampler.arg: 0.1        # Sample 10%
```

Hoặc Java agent (no code change):

```bash
java -javaagent:opentelemetry-javaagent.jar \
     -Dotel.service.name=vprofile \
     -Dotel.exporter.otlp.endpoint=http://jaeger:4317 \
     -jar app.jar
```

### Instrument app — Python

```python
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.instrumentation.flask import FlaskInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor

trace.set_tracer_provider(TracerProvider())
otlp_exporter = OTLPSpanExporter(endpoint="http://jaeger:4317", insecure=True)
trace.get_tracer_provider().add_span_processor(BatchSpanProcessor(otlp_exporter))

# Auto-instrument frameworks
FlaskInstrumentor().instrument()
RequestsInstrumentor().instrument()

# Manual span
tracer = trace.get_tracer(__name__)

@app.route("/users")
def list_users():
    with tracer.start_as_current_span("query_database"):
        users = db.query("SELECT * FROM users")

    with tracer.start_as_current_span("format_response"):
        return jsonify(users)
```

### Read trace UI

Jaeger UI:
- Service dropdown → operation → list traces.
- Click trace → waterfall view spans.
- Find slow operation by duration.
- Span tags: HTTP code, error, user_id.

## Tempo — Loki for traces

**Tempo** (Grafana Labs): cheap distributed tracing như Loki for logs.

```yaml
services:
  tempo:
    image: grafana/tempo:2.3.1
    command: -config.file=/etc/tempo/tempo.yml
    volumes:
      - ./tempo/tempo.yml:/etc/tempo/tempo.yml
      - tempo-data:/tmp/tempo
    ports:
      - "3200:3200"     # UI
      - "4317:4317"     # OTLP gRPC
```

Grafana datasource → Tempo. Switch giữa metrics ↔ logs ↔ traces seamless.

### Exemplars — link metric → trace

Prometheus metric với trace ID:

```text
http_request_duration_seconds_bucket{...} 0.05 # trace_id=abc123
```

Click metric spike trong Grafana → jump to specific trace.

## LGTM stack — Grafana modern

**Loki + Grafana + Tempo + Mimir** = all-in-one observability stack:
- **Loki** logs.
- **Grafana** UI.
- **Tempo** traces.
- **Mimir** metrics (scalable Prometheus).

Plus **Pyroscope** for profiling.

Single vendor, integrated, cheaper than ELK + Jaeger + Prometheus federation.

## Synthetic monitoring

Test endpoint từ outside thực sự:

### Blackbox exporter

```yaml
modules:
  http_2xx:
    prober: http
    timeout: 10s
    http:
      valid_status_codes: [200, 201]
      method: GET
      tls_config:
        insecure_skip_verify: false
```

Prometheus job:

```yaml
- job_name: 'blackbox'
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

Metrics:
- `probe_success`: 0/1.
- `probe_duration_seconds`: latency.
- `probe_ssl_earliest_cert_expiry`: cert expiry.

Alert:

```yaml
- alert: EndpointDown
  expr: probe_success == 0
  for: 5m

- alert: CertExpiringSoon
  expr: probe_ssl_earliest_cert_expiry - time() < 7 * 86400
  for: 1h
```

### Synthetic Monitoring SaaS

- Pingdom.
- UptimeRobot.
- Datadog Synthetics.
- StatusCake.

Test từ multiple regions → user perspective real.

## Tổng kết phase 23

3 bài cover:
1. Observability basics + Prometheus + Grafana.
2. Production stack + PromQL + Alertmanager.
3. Logs (Loki/ELK) + Distributed tracing (Jaeger/Tempo).

Skills:
- Setup production monitoring stack.
- Write alert rules với golden signals + SLO.
- Query LogQL + PromQL.
- Instrument app với OpenTelemetry.
- Sythetic monitoring endpoint + cert.

## Tóm tắt bài 3

- **Loki** = log cheap, label-only index, LogQL query.
- **Promtail** ship log, pipeline stages parse + label.
- **ELK** heavy nhưng full-text search mạnh.
- **Jaeger / Tempo** distributed tracing với OpenTelemetry.
- **Tempo + Loki + Mimir + Grafana** = LGTM unified stack.
- **Exemplars** link metric ↔ trace.
- **Blackbox exporter** synthetic monitoring HTTP + TLS expiry.
- Modern: **OpenTelemetry** = vendor-agnostic instrumentation standard.

**Phase kế tiếp** → [Phase 24 — AWS Part 2](../phase-24-aws-part2/01-aws-advanced.md)

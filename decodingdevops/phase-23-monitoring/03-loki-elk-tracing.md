# Bài 3: Logs (Loki/ELK) + Distributed tracing (Jaeger)

Metrics chỉ là 1/3 trong observability. Bài này dạy 2 phần còn lại: **logs aggregation** (tập trung log) và **distributed tracing** (truy vết qua nhiều service).

## Loki — Log giống Prometheus

**Loki** (do Grafana Labs phát triển) = log aggregation rẻ + scale được:
- Index **chỉ label**, content log được lưu nén lại.
- Rẻ hơn ELK 10-100 lần.
- Query bằng LogQL (cú pháp giống PromQL).

### Stack

```text
App → Promtail / Fluent Bit → Loki → Grafana
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

### Loki config

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

### Promtail config (Shipper — chuyển log lên Loki)

```yaml
server:
  http_listen_port: 9080

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # System log
  - job_name: syslog
    static_configs:
      - targets: [localhost]
        labels:
          job: syslog
          __path__: /var/log/syslog

  # Nginx log
  - job_name: nginx
    static_configs:
      - targets: [localhost]
        labels:
          job: nginx
          __path__: /var/log/nginx/*.log

  # Docker container log
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'

  # Tomcat app log với pipeline parse
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

Các pipeline stage làm gì:
- **multiline**: gộp stack trace nhiều dòng thành 1 log entry.
- **regex**: parse cấu trúc log thành các field.
- **labels**: extract field thành label để search được.
- **timestamp**: dùng thời gian từ chính log (thay vì thời gian shipper).

### LogQL queries (Cú pháp query Loki)

```logql
# Lấy tất cả log từ app
{job="vprofile"}

# Filter theo level
{job="vprofile", level="ERROR"}

# Tìm content
{job="vprofile"} |= "OutOfMemoryError"

# Regex
{job="nginx"} |~ "5\\d{2}"

# Exclude
{job="vprofile"} != "DEBUG"

# Parse JSON + filter
{job="nginx"}
  | json
  | status >= 500

# Tốc độ lỗi
sum(rate({job="vprofile", level="ERROR"}[5m]))

# Đếm theo source
sum by (logger) (count_over_time({job="vprofile"}[1h]))
```

### Thêm Loki datasource vào Grafana

```yaml
- name: Loki
  type: loki
  url: http://loki:3100
```

Grafana **Explore** view → switch datasource sang Loki → query LogQL → live tail log real-time.

## ELK Stack — Elasticsearch + Logstash + Kibana

Nặng hơn Loki nhưng full-text search mạnh hơn.

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

UI để: discover log, build dashboard, full-text search.

Index management quan trọng:
- **ILM** (Index Lifecycle Management): hot → warm → cold → delete (chuyển index qua nhiều stage để tiết kiệm chi phí).
- Retention 30-90 ngày.
- Snapshot lên S3 cho lưu trữ dài hạn.

### Loki vs ELK

| | Loki | ELK |
|---|---|---|
| Cost | Thấp | Cao |
| Index | Chỉ label | Full-text |
| Search speed | Chậm khi search per-line | Nhanh |
| Storage | Object store nén | Disk-heavy |
| Aggregation | Hạn chế | Mạnh |
| Phù hợp cho | Dev/debug, K8s log | Production search nặng |
| Tích hợp Grafana | Native | Qua plugin |

Modern: **Combine cả Loki + ELK** — Loki cho retention rẻ, ELK cho hot recent (search nhanh).

## Distributed tracing — Jaeger

### Khái niệm

Trace 1 request đi qua nhiều service:

```text
User → API Gateway → Auth → User Service → DB
                              ↓
                              Notification → Email
```

Mỗi hop = 1 span. Trace = chuỗi các span chung 1 trace ID.

→ Quan trọng trong microservices: 1 request lỗi, biết được hop nào fail, hop nào chậm.

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
    sampler.arg: 0.1        # Sample 10% trace (giảm overhead)
```

Hoặc dùng Java agent (không cần sửa code):

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

# Auto-instrument cho các framework phổ biến
FlaskInstrumentor().instrument()
RequestsInstrumentor().instrument()

# Span thủ công cho phần custom
tracer = trace.get_tracer(__name__)

@app.route("/users")
def list_users():
    with tracer.start_as_current_span("query_database"):
        users = db.query("SELECT * FROM users")

    with tracer.start_as_current_span("format_response"):
        return jsonify(users)
```

### Đọc trace trên UI

Jaeger UI:
- Service dropdown → operation → list trace.
- Click vào 1 trace → xem waterfall view các span.
- Tìm operation chậm theo duration.
- Span tag: HTTP code, error, user_id, ...

## Tempo — Loki cho trace

**Tempo** (Grafana Labs): cheap distributed tracing — giống cách Loki làm với log.

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

Grafana datasource → Tempo. Switch giữa metric ↔ log ↔ trace mượt mà trong cùng 1 UI.

### Exemplars — Link metric ↔ trace

Prometheus metric có gắn trace ID:

```text
http_request_duration_seconds_bucket{...} 0.05 # trace_id=abc123
```

Click vào spike trên Grafana metric → jump thẳng đến trace cụ thể đã gây ra spike đó.

## LGTM stack — Grafana modern

**Loki + Grafana + Tempo + Mimir** = stack observability all-in-one:
- **Loki** logs.
- **Grafana** UI.
- **Tempo** traces.
- **Mimir** metrics (scalable Prometheus).

Bổ sung **Pyroscope** cho profiling.

Single vendor, tích hợp tốt, rẻ hơn so với ELK + Jaeger + Prometheus federation.

## Synthetic monitoring (Giám sát từ bên ngoài)

Test endpoint từ bên ngoài hệ thống — mô phỏng user thật:

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

Metric thu được:
- `probe_success`: 0/1 (endpoint có sống không).
- `probe_duration_seconds`: latency.
- `probe_ssl_earliest_cert_expiry`: ngày hết hạn cert TLS.

Alert dựa trên các metric này:

```yaml
- alert: EndpointDown
  expr: probe_success == 0
  for: 5m

- alert: CertExpiringSoon
  expr: probe_ssl_earliest_cert_expiry - time() < 7 * 86400
  for: 1h
```

### Synthetic Monitoring SaaS (Thay vì self-host)

- Pingdom.
- UptimeRobot.
- Datadog Synthetics.
- StatusCake.

Test từ nhiều region → phản ánh user perspective thật.

## Tổng kết phase 23

3 bài đã cover:
1. Observability basics + Prometheus + Grafana.
2. Production stack + PromQL + Alertmanager.
3. Logs (Loki/ELK) + Distributed tracing (Jaeger/Tempo).

Skill đạt được:
- Setup production monitoring stack đầy đủ.
- Viết alert rule với golden signals + SLO.
- Query LogQL + PromQL.
- Instrument app với OpenTelemetry.
- Synthetic monitoring endpoint + cert expiry.

## Tóm tắt bài 3

- **Loki** = log cheap, chỉ index label, query LogQL.
- **Promtail** ship log, pipeline stage parse + label.
- **ELK** nặng hơn nhưng full-text search mạnh.
- **Jaeger / Tempo** distributed tracing với OpenTelemetry.
- **Tempo + Loki + Mimir + Grafana** = LGTM unified stack.
- **Exemplars** link metric ↔ trace để debug nhanh.
- **Blackbox exporter** synthetic monitoring HTTP + TLS expiry.
- Modern: **OpenTelemetry** = standard vendor-agnostic cho instrumentation.

**Phase kế tiếp** → [Phase 24 — AWS Part 2](../phase-24-aws-part2/01-aws-advanced.md)

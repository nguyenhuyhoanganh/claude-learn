# Bài 4: FileBeat — Log shipper lightweight

Logstash chạy trên 1000 web server = 500 GB RAM (mỗi instance 500 MB). Quá đắt. **FileBeat** = agent Go nhẹ (~10 MB RAM), chỉ ship log → ES/Logstash xử lý.

## Architecture pattern

```text
1000 Web Servers
    │
    ├── FileBeat (10 MB RAM each) → tail log files
    │
    ▼
Logstash cluster (5 nodes)
    │
    │ Parse, enrich, geoip
    ▼
Elasticsearch cluster
    │
    ▼
Kibana dashboard
```

→ FileBeat = lightweight agent. Logstash = heavy ETL ở giữa. ES = storage + search.

→ Pattern industry-standard 2020+.

## Cài FileBeat

```bash
# Linux
curl -L -O https://artifacts.elastic.co/downloads/beats/filebeat/filebeat-8.13.0-amd64.deb
sudo dpkg -i filebeat-8.13.0-amd64.deb
sudo systemctl enable filebeat
```

Hoặc Docker:

```yaml
filebeat:
    image: docker.elastic.co/beats/filebeat:8.13.0
    volumes:
        - ./filebeat.yml:/usr/share/filebeat/filebeat.yml
        - /var/log:/var/log:ro                          ← Mount host logs
```

## Config cơ bản

`/etc/filebeat/filebeat.yml`:

```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /var/log/nginx/access.log
      - /var/log/nginx/error.log
    fields:
      service: nginx
      environment: production

output.elasticsearch:
    hosts: ["http://localhost:9200"]
    index: "nginx-logs-%{+yyyy.MM.dd}"
```

→ Tail 2 log file Nginx, push thẳng ES với index date.

Validate config:

```bash
sudo filebeat test config
```

Start:

```bash
sudo systemctl start filebeat
sudo journalctl -u filebeat -f          # Tail logs
```

→ FileBeat tail liên tục. Mỗi line mới → 1 event → ship ES.

## Module FileBeat

FileBeat có **modules** built-in cho services phổ biến — auto config + parse:

```bash
sudo filebeat modules enable nginx
sudo filebeat modules enable mysql
sudo filebeat modules enable system
```

→ Mỗi module có default path (nơi log thường ở), parsing pipeline (ES Ingest), dashboards Kibana có sẵn.

Setup dashboards Kibana:

```bash
sudo filebeat setup --dashboards
```

→ Tạo sẵn dashboard cho Nginx (top requests, error rate, response time...).

## Through Logstash

Pattern production: FileBeat → Logstash → ES.

FileBeat output đổi sang Logstash:

```yaml
output.logstash:
    hosts: ["logstash-server.local:5044"]
```

Logstash input Beats:

```text
input {
    beats {
        port => 5044
    }
}

filter {
    # Parse, enrich
    grok { ... }
    geoip { source => "clientip" }
}

output {
    elasticsearch {
        hosts => ["es:9200"]
        index => "logs-%{+YYYY.MM.dd}"
    }
}
```

→ FileBeat nhẹ (chỉ ship). Logstash trung tâm xử lý nặng.

## Multiline log

Stack trace Java span nhiều dòng:

```text
ERROR Something failed
    at com.example.Foo.bar(Foo.java:42)
    at com.example.Baz.qux(Baz.java:10)
    at ...
```

→ Mỗi dòng = 1 event trong FileBeat default → mất context.

Fix: multiline pattern:

```yaml
filebeat.inputs:
  - type: log
    paths: ["/var/log/app.log"]
    multiline.pattern: '^\s'                  ← Dòng bắt đầu whitespace
    multiline.negate: false
    multiline.match: after
```

→ Dòng bắt đầu whitespace (indent) = continuation của event trước → gộp.

Hoặc theo timestamp:

```yaml
multiline.pattern: '^\d{4}-\d{2}-\d{2}'      ← Dòng bắt đầu YYYY-MM-DD
multiline.negate: true
multiline.match: after
```

→ Dòng KHÔNG match (không bắt đầu date) → gộp vào event trước.

## Registry file

FileBeat track position đã đọc trong mỗi file:

```text
/var/lib/filebeat/registry/filebeat/data.json
```

→ Restart FileBeat → resume từ đúng position. Không duplicate.

→ **Đừng xoá** registry trừ khi muốn re-read từ đầu (test).

## At-least-once delivery

FileBeat đảm bảo event được delivered ít nhất 1 lần:

- Event chưa được Logstash/ES ack → FileBeat retry.
- Crash giữa chừng → resume từ registry.

→ **Có thể duplicate** trong scenario edge (Logstash crash sau khi ack). Acceptable cho log.

→ Nếu cần dedup → dùng `document_id` deterministic (hash của event) ở Logstash.

## Performance tuning

```yaml
filebeat.inputs:
  - type: log
    paths: [...]
    harvester_buffer_size: 16384              ← Read buffer (default 16k)
    close_inactive: 5m                         ← Đóng file harvester sau 5 phút idle

queue.mem:
    events: 4096                                ← Internal queue size
    flush.min_events: 512
    flush.timeout: 1s

output.logstash:
    bulk_max_size: 2048                         ← Bulk batch size
    worker: 4                                   ← Parallel workers
```

→ Tune theo throughput. Default OK cho < 10k events/sec.

## Multiple log files & types

```yaml
filebeat.inputs:
  - type: log
    paths: ["/var/log/nginx/*.log"]
    fields:
      type: nginx
  - type: log
    paths: ["/var/log/app/*.log"]
    fields:
      type: app
  - type: log
    paths: ["/var/log/mysql/*.log"]
    fields:
      type: mysql

output.logstash:
    hosts: ["logstash:5044"]
```

Logstash filter conditional:

```text
filter {
    if [fields][type] == "nginx" {
        grok { match => { "message" => "%{COMBINEDAPACHELOG}" } }
    } else if [fields][type] == "mysql" {
        grok { ... }
    }
}
```

## Khi nào dùng FileBeat vs Logstash trực tiếp?

| Scenario                          | Tool                          |
|-----------------------------------|-------------------------------|
| 1 server cần ship log             | FileBeat → ES direct          |
| 100+ server, log đa dạng          | FileBeat → Logstash → ES      |
| Parse phức tạp (multi-stage)      | FileBeat → Logstash → ES      |
| Resource endpoint limit (IoT)     | FileBeat (~10 MB)              |
| ETL pull từ DB, S3, Kafka         | Logstash trực tiếp             |

→ FileBeat = forward-only. Logstash = ETL full.

## Tóm tắt

- **FileBeat** = lightweight Go agent ship log từ endpoint.
- Cài qua `apt` hoặc Docker. Config `/etc/filebeat/filebeat.yml`.
- Inputs: list path. Output: ES hoặc Logstash.
- **Modules** built-in cho Nginx, MySQL, system... auto parse + dashboard.
- **Multiline pattern** cho stack trace span nhiều dòng.
- Registry track position đã đọc → resume sau restart.
- **At-least-once** delivery — có thể duplicate edge case.
- Pattern production: Beats → Logstash → ES.

---

→ [Bài tiếp theo: Streaming data patterns](05-streaming-data-patterns.md)

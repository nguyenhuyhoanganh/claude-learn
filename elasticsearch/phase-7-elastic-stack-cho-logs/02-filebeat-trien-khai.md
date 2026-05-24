# Bài 2: FileBeat triển khai chi tiết

Bài Phase 4 đã giới thiệu FileBeat. Bài này: pattern triển khai production cho mass deployment.

## Configuration management

1000 server = không cài/config thủ công 1000 lần. Dùng:

- **Ansible** — `ansible-playbook filebeat-install.yml -i inventory`.
- **Puppet / Chef** — module sẵn cho FileBeat.
- **Terraform** + cloud-init — deploy với EC2.
- **Kubernetes DaemonSet** — 1 pod FileBeat per node.

→ Pattern declarative: config in Git, apply N machines uniform.

## DaemonSet (Kubernetes)

Modern container deployment:

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
    name: filebeat
spec:
    selector:
        matchLabels: { app: filebeat }
    template:
        metadata:
            labels: { app: filebeat }
        spec:
            containers:
              - name: filebeat
                image: docker.elastic.co/beats/filebeat:8.13.0
                volumeMounts:
                  - name: varlog
                    mountPath: /var/log
                    readOnly: true
                  - name: config
                    mountPath: /usr/share/filebeat/filebeat.yml
                    subPath: filebeat.yml
            volumes:
              - name: varlog
                hostPath: { path: /var/log }
              - name: config
                configMap: { name: filebeat-config }
```

→ Mỗi K8s node có 1 FileBeat pod. Mount host `/var/log` → collect container logs.

## Multiple inputs per host

```yaml
filebeat.inputs:
  - type: log
    paths: ["/var/log/nginx/access.log"]
    fields:
      service: nginx
      log_type: access

  - type: log
    paths: ["/var/log/nginx/error.log"]
    fields:
      service: nginx
      log_type: error

  - type: log
    paths: ["/var/log/app/*.log"]
    fields:
      service: backend-api

  - type: log
    paths: ["/var/log/mysql/slow.log"]
    fields:
      service: mysql
      log_type: slow_query
    multiline.pattern: '^# Time'
    multiline.negate: true
    multiline.match: after
```

→ 1 FileBeat collect log nhiều services + categorize bằng custom fields.

## Modules

FileBeat modules = preset cho services phổ biến:

```bash
filebeat modules enable nginx mysql system apache
```

Mỗi module:
- Default log paths.
- Ingest pipeline ES sẵn.
- Dashboards Kibana.

Override default path:

```yaml
# /etc/filebeat/modules.d/nginx.yml
- module: nginx
  access:
    enabled: true
    var.paths: ["/custom/path/nginx/access.log"]
  error:
    enabled: true
    var.paths: ["/custom/path/nginx/error.log"]
```

Setup dashboards:

```bash
filebeat setup --dashboards
```

→ Kibana có dashboard "[Filebeat Nginx] Access Logs" sẵn. 5 phút từ install đến seeing data.

## Output options

### To Elasticsearch direct

```yaml
output.elasticsearch:
    hosts: ["https://es:9200"]
    username: "filebeat_writer"
    password: "${ES_PASSWORD}"        ← Env var
    pipeline: "nginx"                  ← Ingest pipeline name
    index: "logs-%{[fields.service]}-%{+yyyy.MM.dd}"
```

### To Logstash

```yaml
output.logstash:
    hosts: ["logstash-1:5044", "logstash-2:5044", "logstash-3:5044"]
    loadbalance: true               ← Round-robin Logstash nodes
    worker: 4                        ← Parallel workers per host
```

### To Kafka

```yaml
output.kafka:
    hosts: ["kafka-1:9092", "kafka-2:9092"]
    topic: "logs-%{[fields.service]}"
    partition.round_robin:
        reachable_only: true
```

→ Buffer durable. ES down không mất log.

## SSL/TLS

Production = TLS mandatory:

```yaml
output.elasticsearch:
    hosts: ["https://es:9200"]
    ssl.certificate_authorities: ["/etc/filebeat/certs/ca.crt"]
    ssl.certificate: "/etc/filebeat/certs/filebeat.crt"
    ssl.key: "/etc/filebeat/certs/filebeat.key"
    ssl.verification_mode: "full"
```

→ Encrypt giữa FileBeat và ES. Cần CA cert.

## Resource limits

FileBeat default light, nhưng có thể tune:

```yaml
queue.mem:
    events: 4096                    # Internal queue
    flush.min_events: 512
    flush.timeout: 5s

filebeat.inputs:
  - type: log
    paths: [...]
    harvester_buffer_size: 16384
    close_inactive: 5m
    close_renamed: true
    clean_inactive: 72h             # Cleanup state for old files
```

→ Khi log volume cao, tăng queue, parallel workers.

Memory limit (systemd):

```ini
[Service]
MemoryMax=200M
CPUQuota=50%
```

→ Cap FileBeat resource, không cạnh tranh với application.

## Centralized config (Elastic Agent + Fleet)

ES 8+ có **Elastic Agent** + **Fleet** — manage tất cả beats centrally:

1. Cài Fleet Server (ES managed).
2. Cài Elastic Agent (replace beats) trên endpoint.
3. UI Fleet trong Kibana: deploy policy → agent auto pull config.

→ Modern alternative cho FileBeat. Centralized management cho 1000s endpoint.

## Verify ingestion

After deploy:

```bash
# On FileBeat host
filebeat test config
filebeat test output            # Test connect ES/Logstash

# Check stats
curl http://localhost:5066/stats?pretty   # FileBeat monitoring endpoint
```

ES side:

```text
GET /_cat/indices/logs-*?v
```

→ Thấy index growing → working.

```text
GET /logs-nginx-*/_search
{
    "size": 10,
    "sort": [{"@timestamp": "desc"}]
}
```

→ Latest 10 events. Verify content đúng.

## Pitfall

### 1. File rotation

App rotate log (`logrotate`) → FileBeat lost track. Fix với:

```yaml
filebeat.inputs:
  - type: log
    paths: ["/var/log/app/*.log"]
    close_renamed: false              # Continue read after rename
    close_removed: true
    ignore_older: 24h                 # Skip files older than 24h
```

### 2. Permission

FileBeat user phải có read access log file:

```bash
sudo usermod -aG adm filebeat       # adm group read /var/log
```

### 3. Registry corruption

Registry file (`/var/lib/filebeat/registry`) lưu position. Corrupt → restart fail.

Recovery: backup config + delete registry → re-read từ đầu (acceptable nếu data còn ES).

### 4. Output buffer full

ES slow → FileBeat queue full → block reads → log file backup ở disk.

Monitor: `filebeat_input_events_dropped_total` metric.

Fix: tăng queue size, thêm Logstash node, hoặc add Kafka buffer.

## Tóm tắt

- Mass deployment FileBeat qua Ansible / Puppet / K8s DaemonSet.
- **Modules** cho services phổ biến — preset + dashboard sẵn.
- Output: ES (qua Ingest Pipeline) hoặc Logstash hoặc Kafka.
- TLS encrypt traffic production.
- **Elastic Agent + Fleet** = modern centralized management cho beats.
- Pitfall: file rotation, permission, registry, output buffer.

---

→ [Bài tiếp theo: X-Pack Security](03-x-pack-security.md)

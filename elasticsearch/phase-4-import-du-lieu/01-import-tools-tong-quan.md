# Bài 1: Import tools tổng quan

ES không tự thu thập data — bạn phải push vào. Có nhiều cách, từ manual đến enterprise ETL. Bài này: overview các tool import data.

## Đa dạng nguồn data

Production có data từ đủ chỗ:

- **Log file** trên server (nginx, application).
- **Database** (MySQL, PostgreSQL).
- **Message queue** (Kafka, RabbitMQ).
- **Cloud storage** (S3, GCS).
- **API external** (Twitter, weather).
- **Metrics** (CPU, memory).
- **Network packets**.

→ Mỗi nguồn cần adapter riêng. ES ecosystem có tool cho từng case.

## Các phương pháp import

| Tool                       | Use case                                | Setup     |
|----------------------------|----------------------------------------|-----------|
| **Bulk API direct**        | Script tự code (Python/Node)            | Low       |
| **Elasticsearch client lib** | App tự index                          | Low       |
| **Logstash**               | ETL pipeline, parse log                 | Medium    |
| **Beats (FileBeat, MetricBeat)** | Lightweight agent từ endpoint     | Low       |
| **Kafka Connect**          | Stream từ Kafka                         | High      |
| **AWS Lambda + S3 trigger**| Serverless event-driven                 | Medium    |

→ Khoá học focus **Logstash + FileBeat** (phổ biến nhất).

## Cách 1: Script + Bulk API

Phase 2 đã làm. Recap:

```python
import csv, json, requests

with open("movies.csv") as f:
    reader = csv.DictReader(f)
    bulk_data = []
    for row in reader:
        bulk_data.append(json.dumps({"index": {"_index": "movies", "_id": row["movieId"]}}))
        bulk_data.append(json.dumps({
            "title": row["title"],
            "genres": row["genres"].split("|")
        }))
    
    requests.post(
        "http://localhost:9200/_bulk",
        headers={"Content-Type": "application/x-ndjson"},
        data="\n".join(bulk_data) + "\n"
    )
```

**Pros**: full control. **Cons**: code maintain, không reusable cross project.

## Cách 2: Client library

ES có official client cho Python, Java, Node.js, Go, .NET, PHP...

Python ES client:

```python
from elasticsearch import Elasticsearch, helpers

es = Elasticsearch("http://localhost:9200")

def gen_docs():
    with open("movies.csv") as f:
        reader = csv.DictReader(f)
        for row in reader:
            yield {
                "_index": "movies",
                "_id": row["movieId"],
                "_source": {
                    "title": row["title"],
                    "genres": row["genres"].split("|")
                }
            }

helpers.bulk(es, gen_docs())
```

→ Higher-level. `helpers.bulk` tự chunk, retry, error handling.

## Cách 3: Logstash

**Logstash** = ETL server. Pipeline 3 stage:

```text
Input          →    Filter        →    Output
─────              ──────              ──────
File                Grok parse           Elasticsearch
TCP/UDP             JSON parse           File
Kafka               Mutate (rename)      S3
JDBC (DB)           GeoIP lookup         Kafka
S3                  Anonymize PII        ...
HTTP                Drop fields
...                 Add fields
```

→ Pull data, transform, push ES (hoặc nhiều output).

**Use case kinh điển**:
- Read Apache access log file → parse với Grok → enrich GeoIP → push ES.
- Read Kafka topic → transform JSON → push ES + S3 archive.
- Read MySQL table → push ES (full or incremental).

→ Bài 2-3 deep dive.

## Cách 4: Beats

**Beats** = family lightweight agent. Cài trên endpoint, push data về Logstash/ES:

| Beat        | Data                          |
|-------------|-------------------------------|
| **FileBeat**| Log file                      |
| **MetricBeat** | OS/service metrics           |
| **PacketBeat** | Network packets              |
| **WinlogBeat** | Windows Event Logs           |
| **Heartbeat** | Uptime check                  |
| **Auditbeat** | Linux audit                   |
| **Functionbeat** | AWS Lambda / Cloud functions |

→ Beats viết bằng **Go**, **ít resource** (vài MB RAM). Phù hợp deploy trên hàng nghìn endpoint.

Pipeline production:

```text
1000 web server
    ├── FileBeat → send to Logstash cluster (5 node)
    │                  ↓
    │            Filter, parse
    │                  ↓
    └── Elasticsearch cluster
                          ↓
                       Kibana
```

→ Bài 4 dạy FileBeat.

## Logstash vs Beats vs Script

| Aspect              | Script                  | Logstash                  | Beats              |
|---------------------|-------------------------|---------------------------|--------------------|
| Setup               | Low                     | Medium                    | Low                |
| Resource per host   | Low                     | **High** (JVM ~500MB)    | **Very low** (~10MB) |
| Transform power     | Custom (full)            | High (plugins, Grok)      | Limited            |
| Suitable for endpoint | No                    | Sometimes (legacy)        | **Yes**            |
| Suitable for centralized | Yes                | **Yes**                   | No                 |

→ Pattern:
- **Endpoint** (web server, app server): FileBeat.
- **Centralized**: Logstash.
- **Custom**: Script với client library.

## Kafka Connect (advanced)

Cho stream processing scale lớn — pattern modern:

```text
App produces event → Kafka topic → Kafka Connect ES sink → ES
```

Kafka Connect là plugin chính thức. Pros: durable buffer, replay, scale. Cons: complex setup, cần Kafka cluster.

→ Phase 7 có thể chạm.

## Tổng quan Phase 4

```text
Bài 1: Overview các tool                     ← bài này
Bài 2: Logstash cơ bản (cài, input/output)
Bài 3: Logstash + JDBC (import MySQL)
Bài 4: FileBeat (log shipping)
Bài 5: Streaming patterns (Kafka, S3)
```

## Demo: index data nhỏ với bulk script

```bash
# Generate bulk file
python3 -c "
import json
for i in range(10):
    print(json.dumps({'index': {'_index': 'demo', '_id': i}}))
    print(json.dumps({'value': i, 'name': f'item-{i}'}))
" > demo-bulk.json

# Import
curl -X POST "http://localhost:9200/_bulk" \
     -H "Content-Type: application/x-ndjson" \
     --data-binary @demo-bulk.json

# Verify
curl "http://localhost:9200/demo/_search?pretty"
```

→ 10 doc index xong trong giây.

## Performance tips chung

1. **Bulk** thay vì single request — 10-50× nhanh.
2. **Disable refresh tạm thời** cho mass import:
   ```text
   PUT /idx/_settings
   { "index": { "refresh_interval": "-1" } }
   ```
   Import xong, restore:
   ```text
   PUT /idx/_settings
   { "index": { "refresh_interval": "1s" } }
   ```
3. **Replica = 0** khi import lần đầu:
   ```text
   { "index": { "number_of_replicas": 0 } }
   ```
   Sau import set = 1.
4. **Parallel client** — multiple thread/process bulk simultaneously.

→ Production benchmark: 100K doc/sec/node là achievable.

## Tóm tắt

- 5 cách import: script direct, client library, **Logstash**, **Beats**, Kafka Connect.
- **Logstash** = ETL server với plugin input/filter/output. Pull → transform → push.
- **Beats** = lightweight agent (FileBeat, MetricBeat, ...) trên endpoint.
- Production pattern: Beats trên endpoint → Logstash cluster → Elasticsearch.
- Performance: bulk, disable refresh tạm, replica = 0 khi mass import.

---

→ [Bài tiếp theo: Logstash cơ bản](02-logstash-co-ban.md)

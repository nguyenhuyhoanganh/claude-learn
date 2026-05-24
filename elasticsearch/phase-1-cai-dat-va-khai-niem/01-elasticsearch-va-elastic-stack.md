# Bài 1: Elasticsearch và Elastic Stack

## Elasticsearch là gì?

**Elasticsearch** ra đời 2010, ban đầu là **scalable wrapper** trên **Apache Lucene** (thư viện full-text search Java). Lucene mạnh nhưng:
- Chỉ chạy single-machine.
- Khó scale.
- API low-level, không REST.

Elasticsearch fix cả ba:
- Distributed (cluster nhiều máy).
- Auto sharding & replication.
- **REST API** + JSON → mọi ngôn ngữ gọi được.

Đến nay, Elasticsearch không chỉ là search engine. Dùng cho:

| Use case             | Ví dụ thực tế                                    |
|----------------------|--------------------------------------------------|
| Full-text search     | Wikipedia, GitHub code search, Stack Overflow    |
| Log analytics        | ELK Stack ở hàng nghìn công ty                   |
| Metrics / APM        | Elastic APM (alternative Datadog)                |
| SIEM (security)      | Elastic Security                                  |
| Geo-spatial search   | Tìm nhà hàng gần đây, ride-share matching        |
| Real-time aggregation| Dashboard millions records, < 100ms              |
| Machine learning     | Anomaly detection (X-Pack ML)                    |

→ Tốc độ + flexibility là điểm bán. Kết quả tính bằng **mili-giây** thay vì giây/phút như Hadoop/Spark.

## Tại sao nhanh đến vậy?

3 lý do chính:

1. **Inverted index** (sẽ học bài 5) — không scan full data, chỉ lookup term.
2. **Distributed** — index chia thành **shard**, mỗi shard chạy parallel trên N node.
3. **In-memory caching** + **doc values** — column-store cho aggregation nhanh.

## Elastic Stack (a.k.a. ELK Stack)

Elasticsearch chỉ là **1 mảnh**. **Elastic Stack** là tập hợp công cụ:

```text
┌──────────────────────────────────────────────────────────────┐
│                                                                │
│   Data sources          ┌─Logstash─┐                          │
│   • App logs       ────►│ transform│────►┌──────────────────┐ │
│   • Metrics             │  filter  │     │                  │ │
│   • DB rows             └──────────┘     │   Elasticsearch  │ │
│   • Web APIs            ┌──Beats──┐      │      Cluster     │ │
│                    ────►│ lightweight├──►│                  │ │
│   • OS logs             │  shipper │     └────────┬─────────┘ │
│                         └──────────┘              │            │
│                                                   │            │
│                                          ┌────────▼─────────┐ │
│                                          │      Kibana       │ │
│                                          │  • Discover       │ │
│                                          │  • Visualize       │ │
│                                          │  • Dashboards      │ │
│                                          │  • Dev Tools       │ │
│                                          │  • Maps            │ │
│                                          └──────────────────┘ │
│                                                                │
│   X-Pack (paid features): security, alerting, ML, graph        │
│                                                                │
└──────────────────────────────────────────────────────────────┘
```

### 1. Elasticsearch

**Core**. Server REST + JSON, lưu + search + aggregate.

### 2. Kibana

**Web UI** cho Elasticsearch. Có:

- **Discover** — explore data tương tự pgAdmin/MySQL Workbench.
- **Visualize** — tạo chart từ data.
- **Dashboards** — gắn nhiều visualization vào trang.
- **Dev Tools** — viết JSON query trực tiếp (console). Đây là **tool chính khoá học dùng** thay curl.
- **Maps** — visualize geo data.
- **Canvas, Lens** — tool report nâng cao.

→ Bài Phase 6 dạy Kibana sâu.

### 3. Logstash

**ETL pipeline**: Extract → Transform → Load. Pull data từ N source, parse/filter/enrich, push vào N destination.

```text
Input → Filter → Output

input { file { path => "/var/log/apache/access.log" } }
filter { grok { match => { "message" => "%{COMBINEDAPACHELOG}" } } }
output { elasticsearch { hosts => "es:9200" index => "logs-%{+YYYY.MM.dd}" } }
```

→ Powerful nhưng nặng (Java). Phase 4 dạy.

### 4. Beats

**Lightweight shippers** — agent chạy trên endpoint, gửi data về Logstash/Elasticsearch.

| Beat        | Mục đích                              |
|-------------|---------------------------------------|
| **FileBeat**| Log file (Apache, Nginx, app logs)    |
| **MetricBeat** | System metrics (CPU, memory)        |
| **PacketBeat** | Network traffic                      |
| **WinlogBeat** | Windows Event Logs                   |
| **Heartbeat** | Uptime monitoring                     |
| **Auditbeat** | Linux audit framework                 |

→ Trade-off với Logstash:
- **Beats** nhẹ, agent tốt cho mass deployment.
- **Logstash** nặng nhưng transform mạnh hơn.

Pattern phổ biến: **Beats trên endpoint → Logstash trung gian → Elasticsearch**.

### 5. X-Pack

**Plugin official paid** từ Elastic. Một số tính năng đã chuyển free (basic license):

- **Security** (basic free) — authentication, RBAC, TLS.
- **Monitoring** (basic free) — cluster health UI.
- **Alerting** (paid) — trigger khi metric vượt threshold.
- **Reporting** (paid) — export dashboard ra PDF.
- **Machine Learning** (paid) — anomaly detection.
- **Graph** (paid) — relationship visualization.

→ Khoá học chạm **Security** (Phase 7) và **Monitoring** (Phase 8).

## Open-source vs Paid

Elastic license:

- **Apache 2.0** — đa số version cũ. Truly open source.
- **Elastic License v2 / SSPL** (từ 2021) — không cho phép managed service (như AWS Elasticsearch) bán Elastic miễn phí. Vẫn free để dùng nhưng có restriction.
- **OpenSearch** — fork mở từ Elasticsearch 7 do AWS lead. Apache 2.0 truly open.

→ Khoá học dùng Elasticsearch official (Elastic License). Concepts apply cho OpenSearch (~95% giống nhau).

## So sánh với database truyền thống

| Aspect              | RDBMS (MySQL/PostgreSQL)        | Elasticsearch                        |
|---------------------|---------------------------------|--------------------------------------|
| Primary use         | OLTP (transactions)             | Search + analytics                   |
| Schema              | Strict (DDL)                    | Flexible (dynamic mapping)           |
| Query language      | SQL                             | JSON Query DSL (+ ES SQL plugin)     |
| Indexing            | B-tree                          | Inverted index                       |
| Joins               | Mạnh                            | Yếu (cần denormalize)                |
| Transactions        | ACID                            | Per-document (limited)               |
| Latency             | < 10ms cho simple query         | < 100ms cho complex query trên triệu doc |
| Scale               | Vertical (thường)               | Horizontal (cluster)                 |
| Best for            | Account, order, inventory       | Log, search, analytics, recommendation |

→ Không phải thay thế nhau. Production thường **dùng cả 2**: RDBMS cho data chuẩn, Elasticsearch cho search/analytics.

## Vài câu chuyện về use case

### GitHub code search

Hàng tỷ file code → user search keyword → trả kết quả < 1 giây.

GitHub viết blog: dùng Elasticsearch + custom analyzer cho ngôn ngữ programming.

### Netflix log analytics

Hàng tỷ event log/ngày. ELK cluster monstrous (hàng nghìn node) crunch real-time.

### Uber search drivers

Tìm tài xế gần passenger. Geo query Elasticsearch.

### Wikipedia search

Auto-complete + full-text + relevance ranking.

## Mục tiêu Phase 1

Sau Phase 1, bạn:

- Cài Elasticsearch + Kibana local.
- Hiểu REST API + JSON request/response.
- Biết khái niệm Document, Index, Shard, Replica.
- Hiểu inverted index hoạt động ra sao (TF-IDF).
- Sẵn sàng index dữ liệu thực Phase 2.

## Tóm tắt

- **Elasticsearch** = distributed search engine + analytics engine, built trên Lucene.
- Không chỉ search — log, metrics, SIEM, geo, ML.
- **Elastic Stack** gồm: Elasticsearch (core), Kibana (UI), Logstash (ETL), Beats (shippers), X-Pack (security/ML/alerting).
- Nhanh vì: inverted index + distributed + caching.
- License không Apache 2.0 hoàn toàn → fork **OpenSearch** tồn tại.
- Bổ sung RDBMS, không thay thế.

---

→ [Bài tiếp theo: Cài Elasticsearch và Kibana](02-cai-dat-elasticsearch.md)

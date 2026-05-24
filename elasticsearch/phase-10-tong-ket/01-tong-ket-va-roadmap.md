# Bài 1: Tổng kết khoá học và roadmap tiếp theo

Bạn vừa hoàn thành khoá Elasticsearch + Elastic Stack. Bài cuối: ôn lại + hướng học tiếp.

## 9 phase đã đi qua

### Phase 1: Cài đặt và khái niệm

- ES là distributed search engine + analytics, built on Lucene.
- **Elastic Stack** = ES + Kibana + Logstash + Beats + X-Pack.
- Cài bằng Docker Compose. Kibana port 5601, ES port 9200.
- **Document** = JSON unit. **Index** = collection. **Cluster** = nhiều node.
- **Inverted index** + **TF-IDF/BM25** = cách ES nhanh.
- **Shard + Replica** = horizontal scale + HA. Primary fixed, replica adjustable runtime.

### Phase 2: Mapping và indexing

- **Mapping** = schema. Dynamic (auto-detect) vs explicit.
- **Analyzer** = char filter → tokenizer → token filter pipeline.
- **text** analyzed, **keyword** raw. Multi-field both.
- CRUD: PUT (create/replace), POST `_update` (partial), DELETE.
- **Bulk API** với NDJSON → mass import nhanh 10-50×.
- **Concurrency** với `_seq_no` + `_primary_term`, `retry_on_conflict`.
- **Data modeling**: denormalize (default), nested, parent-child.
- **Mapping explosion** danger — explicit + `dynamic: strict` cho production.

### Phase 3: Search

- **Query DSL** (JSON) production. Query Lite (URI) explore only.
- **match** full-text, **term** exact, **range** numeric/date, **bool** combine.
- **filter context** (cacheable, no score) vs **query context** (score).
- **match_phrase** với **slop** cho proximity.
- **Pagination**: from/size limit 10K. **`search_after`** cho deep.
- **Sort**: text cần `.keyword` sub-field.
- **Fuzzy** với Levenshtein distance, AUTO.
- **Partial match**: prefix, wildcard (tránh leading `*`), regexp.
- **Search-as-you-type**: edge N-gram custom analyzer hoặc `search_as_you_type` type.

### Phase 4: Import data

- Bulk script, client library, **Logstash**, **Beats**, Kafka Connect.
- **Logstash** pipeline: input → filter → output.
- **Grok** parse text unstructured.
- **JDBC** plugin import từ SQL với `:sql_last_value` incremental.
- **FileBeat** = lightweight Go agent ship log.
- Production: **Beats → Logstash → ES**. High-scale: thêm Kafka buffer.

### Phase 5: Aggregation

- Bucket aggregations: terms, range, date_histogram, filter.
- Metric aggregations: avg/sum/min/max, percentiles, cardinality, top_hits.
- Sub-aggregation nest → multi-dimensional.
- Pipeline aggs: cumulative_sum, moving_avg.
- **date_histogram** backbone time series.
- ES aggregation tốc độ ms trên triệu doc → real-time dashboard.

### Phase 6: Kibana

- **Discover** = data browser với KQL.
- **Visualize / Lens** = drag-drop chart builder.
- **Dashboards** = combine charts, global time + filter, drill-down.
- **Maps** geo visualization.
- **Alerting** native Kibana → Slack/PagerDuty.
- Saved objects export Git = Infrastructure as Code.

### Phase 7: Elastic Stack cho logs

- Centralized logging architecture: FileBeat → Logstash/Kafka → ES → Kibana.
- FileBeat mass deploy via Ansible/K8s DaemonSet, modules built-in.
- **X-Pack Security** (basic free): authentication, RBAC, TLS.
- Log analysis workflow: Logs UI → Discover → time zoom → aggregate.
- **Transform** = pre-compute aggregation → fast dashboards + entity-centric view.

### Phase 8: Operations

- Shard sizing 20-50 GB, ≤ 600 / node.
- **Aliases** zero-downtime ops, rollover.
- **ILM** auto-tier hot → warm → cold → frozen → delete.
- Heap = 50% RAM, max 30 GB. SSD essential.
- Monitoring: Stack Monitoring, separate cluster prod, alerts.
- Troubleshooting: cluster health, allocation explain, slow query log, hot threads.
- Failover: replica auto-promote, min 3 master quorum.
- **Snapshots** to S3 + **SLM** auto.
- **Rolling restart** 9-step pattern.

### Phase 9: Cloud

- **Elastic Cloud** = managed service. 14-day trial free.
- 5 min setup, auto HA, ILM, snapshot preset.
- Platinum features included.
- Connect qua endpoint URL hoặc Cloud ID.
- **ECK** = K8s operator cho self-host automation.
- Trade-off: cost 2-3× self-host, zero ops.

## Skill matrix bạn vừa nắm

| Skill                       | Level                           |
|-----------------------------|---------------------------------|
| ES architecture + concepts | ⭐⭐⭐⭐                          |
| Query DSL writing           | ⭐⭐⭐⭐                          |
| Aggregations                | ⭐⭐⭐                            |
| Data modeling               | ⭐⭐⭐                            |
| Logstash pipelines          | ⭐⭐⭐                            |
| FileBeat deployment         | ⭐⭐⭐                            |
| Kibana dashboards           | ⭐⭐⭐                            |
| Production ops              | ⭐⭐                              |
| Performance tuning          | ⭐⭐ (cần thực hành thêm)        |

## Roadmap học tiếp

### Level 1: Củng cố

- **Hands-on project**: index 1M+ documents thật, build dashboard end-to-end.
- **Performance testing**: dùng `esrally` benchmark cluster.
- **Reproduce failure scenarios**: kill node, fill disk, observer behavior.

### Level 2: Specialization

Chọn 1 trong các path:

**Search engineer path**:
- Advanced full-text search (synonyms, language-specific analyzer).
- Relevance tuning, A/B testing.
- Recommendation engine với significant_terms.
- **Vector search + embeddings** (LLM/RAG use case).

**Observability path**:
- **OpenTelemetry** + ES integration.
- **APM** (Application Performance Monitoring).
- SIEM (Security Information & Event Management).
- Time series database optimization.

**Data engineer path**:
- ETL với Logstash, Spark, Beam.
- Kafka + ES streaming patterns.
- ES + Hadoop/Spark integration.
- Data lake architecture.

**Operations path**:
- Kubernetes ECK deep dive.
- Multi-region clusters.
- Disaster recovery drills.
- Cost optimization at scale.

### Level 3: Certifications

Elastic Certified Engineer / Analyst — official exam:

- **Engineer**: install, config, security, troubleshoot. ~$400 USD.
- **Analyst**: KQL, dashboards, ML insights.
- **Observability Engineer**: APM, logs, metrics.

→ Recognize industry, salary boost.

### Level 4: Alternatives ecosystem

Học tools cùng category:

- **OpenSearch** (AWS fork) — same skills mostly transfer.
- **Solr** — Lucene-based alternative, library-rich.
- **Apache Pinot** — real-time OLAP.
- **ClickHouse** — column-store, replace ES for analytics scale.
- **Tantivy / Meilisearch / Typesense** — modern lightweight search.

→ Hiểu landscape, không lock vào 1 tool.

## Sách + resources

### Sách bắt buộc

1. **"Elasticsearch: The Definitive Guide"** (Clinton Gormley, Zachary Tong) — free online, comprehensive (ES 2.x nhưng concepts universal).
2. **"Relevant Search"** (Doug Turnbull, John Berryman) — tuning relevance, advanced.
3. **"Elasticsearch in Action"** (Madhusudhan Konda) — practical, ES 7+.

### Online

- **Elastic docs**: <https://www.elastic.co/guide> — comprehensive.
- **Elastic blog**: practical case studies.
- **Elasticsearch Reference**: full API doc.
- **Kibana docs**.

### Community

- **Reddit r/elasticsearch**.
- **Stack Overflow** tag `elasticsearch`.
- **Elastic Community Slack**: <https://elasticstack.slack.com>.
- **Elastic Forum**: <https://discuss.elastic.co>.

### Conferences

- **ElasticON** (yearly Elastic conference) — talks free YouTube.
- **Search Solutions** conference.

## Career

ES skills market value (2024-2025):

| Role                       | US salary range  |
|----------------------------|------------------|
| Search engineer (mid)      | $120-180k        |
| Data engineer (ES focus)   | $130-200k        |
| SRE / DevOps (Elastic Stack) | $140-220k      |
| Solutions Architect        | $180-280k        |
| Consultant Elastic-certified | $150-300k      |

Vietnam ~30-70% mức trên. ES skill hiếm + cao value.

## Lời cuối

ES + Elastic Stack là toolkit **rộng + sâu**. Khoá này chỉ là **foundation**. Mastering = practice + production experience + continuous learning.

3 nguyên tắc:

1. **Build something real** — toy project chưa đủ. Index dataset 100K+, build dashboard, share team.
2. **Break things in dev** — kill node, fill disk, mess mapping. Recovery experience > theory.
3. **Read source / discuss** — Elastic blog + community forums = continuous learning.

> "The expert in anything was once a beginner who never quit."

Chúc bạn thành công! 🚀

---

## ✨ Map toàn khoá

```text
elasticsearch/
├── README.md                                       ← Tổng quan
│
├── phase-1-cai-dat-va-khai-niem/                  ← Foundation (6 bài)
├── phase-2-mapping-va-indexing/                   ← Insert & manage (8 bài)
├── phase-3-tim-kiem/                              ← Search core (8 bài)
├── phase-4-import-du-lieu/                        ← ETL (5 bài)
├── phase-5-aggregation/                           ← Analytics (5 bài)
├── phase-6-kibana/                                ← Visualization (4 bài)
├── phase-7-elastic-stack-cho-logs/                ← Production logging (5 bài)
├── phase-8-operations/                            ← Production ops (9 bài)
├── phase-9-elasticsearch-tren-cloud/              ← Managed service (2 bài)
└── phase-10-tong-ket/                             ← Wrap (1 bài)
                                                     ─────────
                                                       53 bài
```

Done. Đi tiếp! 🎓

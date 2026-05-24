# Khoá học Elasticsearch và Elastic Stack

> Stack: **Elasticsearch** + **Kibana** + **Logstash** + **Beats** + **X-Pack**

Khoá học dành cho developer / DevOps / data engineer muốn học **search engine** + **log analytics** + **data exploration** trên scale lớn. Sau khoá, bạn có thể: index dữ liệu vào Elasticsearch, viết query phức tạp (full-text search, aggregation, geo), thiết lập pipeline log với Beats + Logstash, visualize bằng Kibana, vận hành cluster production (sharding, ILM, snapshot), và deploy lên Elastic Cloud.

## Vì sao Elasticsearch?

Elasticsearch xuất phát là **search engine** (built trên Apache Lucene), nhưng hiện tại được dùng cho:

- **Search ứng dụng** — Wikipedia, GitHub code search, Stack Overflow.
- **Log analytics** — ELK Stack (Elasticsearch + Logstash + Kibana) là pattern industry chuẩn cho centralized logging.
- **Metrics + APM** — alternative cho Prometheus/Datadog.
- **SIEM** (Security Information Event Management) — Elastic Security.
- **Real-time analytics** — milliseconds query trên hàng tỷ document.

→ Đa năng + tốc độ — đó là lý do Elasticsearch trong top 10 database engine phổ biến (DB-Engines ranking).

## Tổng quan kiến trúc khoá học

```text
┌──────────────────────────────────────────────────────────────────┐
│                                                                    │
│   APP/User                       Logs / Metrics / Events           │
│      │                                  │                          │
│      │ JSON REST                        │ collect                  │
│      ▼                                  ▼                          │
│  ┌─────────────────┐              ┌──────────┐                     │
│  │  Elasticsearch  │ ◄────────────┤  Beats   │ (FileBeat,         │
│  │   Cluster       │              │          │  MetricBeat...)    │
│  │  ┌──┬──┬──┬──┐  │              └──────────┘                     │
│  │  │S1│S2│S3│S4│  │ shards            │                          │
│  │  └──┴──┴──┴──┘  │              ┌──────────┐                     │
│  └─────▲───────────┘              │ Logstash │ (transform)         │
│        │                          └──────────┘                     │
│        │ visualize / query                                         │
│  ┌─────┴────────┐                                                  │
│  │   Kibana     │ — dashboards, Discover, Dev Tools                │
│  └──────────────┘                                                  │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

Trong khoá, bạn sẽ tự tay:

1. Cài Elasticsearch + Kibana trên Ubuntu (VM hoặc local).
2. Index dataset thực (MovieLens — phim, rating, tag).
3. Viết query đủ loại: match, term, range, bool, geo, fuzzy, partial.
4. Aggregations (group, histogram, stats, sub-aggregation).
5. Bulk import + REST API operations.
6. Cấu hình ETL với Logstash + FileBeat.
7. Vận hành: sharding, replica, ILM, snapshot, rolling restart.
8. Deploy production trên Elastic Cloud (managed service).

## Cấu trúc khoá học (10 phase, ~50-60 bài)

```text
elasticsearch/
├── README.md                                       ← Bạn đang ở đây
│
├── phase-1-cai-dat-va-khai-niem/                  ← Foundations
│   ├── 01-elasticsearch-va-elastic-stack.md
│   ├── 02-cai-dat-elasticsearch.md
│   ├── 03-rest-api-va-curl.md
│   ├── 04-document-va-index.md
│   ├── 05-inverted-index-va-tf-idf.md
│   └── 06-shard-va-replica.md
│
├── phase-2-mapping-va-indexing/                   ← ⭐ Insert & manage data
│   ├── 01-ket-noi-va-movielens.md
│   ├── 02-analyzers-co-ban.md
│   ├── 03-rest-import-don-le.md
│   ├── 04-bulk-api.md
│   ├── 05-update-va-delete.md
│   ├── 06-concurrency-control.md
│   ├── 07-data-modeling.md
│   └── 08-mapping-exceptions.md
│
├── phase-3-tim-kiem/                              ← ⭐ Search engine core
│   ├── 01-query-lite-vs-query-dsl.md
│   ├── 02-json-search-deep-dive.md
│   ├── 03-phrase-matching.md
│   ├── 04-pagination-va-sorting.md
│   ├── 05-filters-vs-queries.md
│   ├── 06-fuzzy-queries.md
│   ├── 07-partial-matching.md
│   └── 08-search-as-you-type.md
│
├── phase-4-import-du-lieu/                        ← ETL
│   ├── 01-import-tools-tong-quan.md
│   ├── 02-logstash-co-ban.md
│   ├── 03-logstash-jdbc-mysql.md
│   ├── 04-filebeat-cho-logs.md
│   └── 05-streaming-data-patterns.md
│
├── phase-5-aggregation/                           ← ⭐ Analytics
│   ├── 01-aggregation-tong-quan.md
│   ├── 02-bucket-aggregations.md
│   ├── 03-metric-aggregations.md
│   ├── 04-sub-aggregations.md
│   └── 05-histogram-va-date-histogram.md
│
├── phase-6-kibana/                                ← Visualization
│   ├── 01-kibana-tong-quan.md
│   ├── 02-discover.md
│   ├── 03-visualize.md
│   └── 04-dashboards.md
│
├── phase-7-elastic-stack-cho-logs/                ← ⭐ Production logging
│   ├── 01-elastic-stack-architecture.md
│   ├── 02-filebeat-trien-khai.md
│   ├── 03-x-pack-security.md
│   ├── 04-log-analysis-kibana.md
│   └── 05-data-frame-transforms.md
│
├── phase-8-operations/                            ← ⭐ Production-grade ops
│   ├── 01-chon-so-shard.md
│   ├── 02-index-aliases-va-rotation.md
│   ├── 03-index-lifecycle-management.md
│   ├── 04-hardware-va-heap-sizing.md
│   ├── 05-monitoring.md
│   ├── 06-troubleshooting.md
│   ├── 07-failover-thuc-te.md
│   ├── 08-snapshots-va-restore.md
│   └── 09-rolling-restart.md
│
├── phase-9-elasticsearch-tren-cloud/              ← Managed service
│   ├── 01-elastic-cloud-overview.md
│   └── 02-deploy-tren-cloud.md
│
└── phase-10-tong-ket/                             ← Wrap & roadmap
    └── 01-tong-ket-va-roadmap.md
```

## Lộ trình học (8–12 tuần)

| Phase | Nội dung                            | Thời gian | Ưu tiên     |
|-------|-------------------------------------|-----------|-------------|
| 1     | Cài đặt & khái niệm                 | 3-5 ngày  | Phải học    |
| **2** | **Mapping & indexing**              | **1 tuần** | **⭐ Core** |
| **3** | **Tìm kiếm (Query DSL)**            | **1.5 tuần** | **⭐ Core** |
| 4     | Import data (Logstash, FileBeat)    | 1 tuần    | Cần biết    |
| **5** | **Aggregation**                     | **1 tuần** | **⭐ Core** |
| 6     | Kibana                              | 4-5 ngày  | Quan trọng  |
| **7** | **Elastic Stack cho logs**          | **1 tuần** | **⭐ Core** |
| **8** | **Operations (production)**         | **1.5 tuần** | **⭐ Core** |
| 9     | Cloud (Elastic Cloud)               | 2-3 ngày  | Tham khảo   |
| 10    | Tổng kết                            | 1 ngày    | -           |

## Yêu cầu nền tảng

- **Linux command line**: `ls`, `cd`, `curl`, `cat`, `vi/nano` cơ bản.
- **JSON**: hiểu cấu trúc (object, array, key-value).
- **HTTP / REST**: biết GET/POST/PUT/DELETE là gì.
- **Database thông thường**: hiểu khái niệm row, table, query.
- (Optional) **Java**: không cần biết, nhưng Elasticsearch chạy trên JVM nên hiểu heap size sẽ giúp.

## Nguyên tắc học

1. **Hands-on từ bài 1** — đọc xong gõ ngay vào terminal hoặc Kibana Dev Tools. Không gõ = quên ngay.
2. **Hiểu inverted index trước, sau đó query** — đừng search blind.
3. **Phân biệt query vs filter** — quan trọng cho performance.
4. **Đọc response JSON kỹ** — `_score`, `_source`, `hits.total` thường ẩn insight.
5. **Production khác learning** — luôn đặt câu hỏi "lên prod thì sao?" (shard size, replica, monitoring).

## Bắt đầu

→ [Phase 1: Cài đặt và khái niệm](phase-1-cai-dat-va-khai-niem/01-elasticsearch-va-elastic-stack.md)

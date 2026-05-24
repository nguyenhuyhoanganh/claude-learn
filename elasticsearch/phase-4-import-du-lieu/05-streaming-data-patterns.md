# Bài 5: Streaming data patterns

Phase 4 đã cover Logstash + FileBeat. Bài cuối: pattern advanced cho high-scale streaming — Kafka, Spark, vector embedding.

## Kafka làm buffer giữa producer và ES

Production cao tải:

```text
Apps → produce events → Kafka topic → consume → ES
                       (buffer)
```

**Vì sao cần Kafka?**

- **Buffer** — Apps không block khi ES slow. Event xếp hàng Kafka.
- **Replay** — ES crash → re-consume từ offset.
- **Multi-consumer** — Cùng event consume vào ES + S3 archive + analytics.
- **Backpressure** — Kafka tự throttle, không nổ memory.
- **Durable** — Kafka persist disk, không mất event.

→ Mọi pipeline high-scale **bắt buộc** có Kafka (hoặc tương đương — Pulsar, Kinesis).

### Logstash + Kafka input

```text
input {
    kafka {
        bootstrap_servers => "kafka-broker:9092"
        topics => ["nginx-logs", "app-logs"]
        codec => "json"
        group_id => "logstash-consumers"
        consumer_threads => 4
    }
}

output {
    elasticsearch {
        hosts => ["http://es:9200"]
        index => "logs-%{+YYYY.MM.dd}"
    }
}
```

- **`group_id`** — Kafka consumer group. Scale: chạy N Logstash cùng group → consume parallel.
- **`consumer_threads`** — thread parallel mỗi instance.
- **`codec: json`** — Kafka event là JSON → parse luôn.

### Logstash + Kafka output

Cũng có thể dùng Logstash đẩy data tới Kafka:

```text
output {
    kafka {
        bootstrap_servers => "kafka:9092"
        topic_id => "logs-archive"
        codec => "json"
    }
}
```

→ Logstash trở thành producer Kafka — pattern fan-out (cùng event đi ES + Kafka).

## Pattern: dual write

Cho durable archive:

```text
Apps ──► Logstash ──► Elasticsearch (search)
                  └─► S3            (archive cheap)
```

ES expensive storage. Log cũ 90+ ngày archive S3, query rare bằng Athena.

```text
output {
    elasticsearch { ... }
    s3 {
        bucket => "logs-archive"
        prefix => "%{type}/%{+YYYY/MM/dd/HH}"
        time_file => 5         ← Flush mỗi 5 phút
        codec => "json_lines"
    }
}
```

→ Pattern phổ biến cho compliance (giữ log 7 năm legal).

## Apache Spark + ES

Spark batch processing → write kết quả vào ES:

```scala
import org.elasticsearch.spark.sql._

val df = spark.read.json("/path/to/data.json")

// Process
val result = df.groupBy("category").count()

// Write to ES
result.saveToEs("analytics/_doc")
```

→ Spark process petabyte, push aggregated result vào ES cho dashboard.

Spark + ES connector: `org.elasticsearch:elasticsearch-spark-30_2.12:8.x`.

## ES làm vector database (modern)

ES 8.x support **vector search** — store embeddings cho semantic search/RAG (Retrieval Augmented Generation):

```text
PUT /docs
{
    "mappings": {
        "properties": {
            "title":     { "type": "text" },
            "content":   { "type": "text" },
            "embedding": {
                "type": "dense_vector",
                "dims": 768,
                "index": true,
                "similarity": "cosine"
            }
        }
    }
}
```

Index document với vector (từ OpenAI/Hugging Face/sentence-transformers):

```text
PUT /docs/_doc/1
{
    "title": "AI revolution",
    "content": "Artificial intelligence is transforming industries...",
    "embedding": [0.123, -0.456, 0.789, ...]      ← 768 dimensions
}
```

KNN search (find similar):

```text
GET /docs/_knn_search
{
    "knn": {
        "field": "embedding",
        "query_vector": [0.111, -0.222, ...],
        "k": 10,
        "num_candidates": 100
    }
}
```

→ Trả 10 doc semantic gần nhất query vector. Foundation cho RAG, recommendation, semantic search.

Pipeline:

```text
Document/Query → embedding model (BERT, OpenAI) → vector
                                                     │
                                                     ▼
                                                  ES vector index
                                                     │
                                                     ▼
                                                 KNN search → top-k
```

## ✨ Tổng kết Phase 4

Sau Phase 4:

- 5 cách import: script direct, client library, **Logstash**, **Beats**, Kafka Connect.
- **Logstash** = ETL pipeline với input/filter/output plugins.
- **Filter**: csv, grok (regex), mutate, geoip, date, json.
- **JDBC plugin** pull DB → ES, incremental qua `:sql_last_value`.
- **FileBeat** = lightweight Go agent ship log từ endpoint.
- **Modules** built-in cho services phổ biến.
- Production pattern: **Beats → Logstash → ES**.
- High-scale: **Kafka buffer** giữa producer và consumer.
- **Vector search** với `dense_vector` type cho RAG/semantic.

→ Phase 5: aggregations (analytics core của ES).

## Tóm tắt

- **Kafka** = buffer durable giữa producer và ES. Bắt buộc cho high-scale.
- Logstash có Kafka input + output → fan-out pattern.
- **Dual write** ES + S3 cho hot search + cold archive.
- **Spark + ES connector** cho batch processing scale lớn.
- **Vector search** (ES 8+) với `dense_vector` type cho semantic search, RAG.

---

→ **Sẵn sàng?** [Phase 5: Aggregation](../phase-5-aggregation/01-aggregation-tong-quan.md)

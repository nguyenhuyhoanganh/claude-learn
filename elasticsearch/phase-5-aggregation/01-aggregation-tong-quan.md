# Bài 1: Aggregations tổng quan

Search trả document. **Aggregation** trả **thống kê tổng hợp** — count, sum, avg, group by. Đây là "analytics power" của ES — tương đương SQL `GROUP BY`.

## Vì sao quan trọng?

ES không chỉ để search Wikipedia. Nó còn dùng cho:

- **Dashboard analytics** — top product, sales per region, error rate per hour.
- **Log analysis** — số request per status code, latency percentile.
- **Business intelligence** — revenue per category, user activity per day.

→ Tất cả qua **aggregation**.

→ **Tốc độ**: hàng triệu doc, aggregation trả result trong **vài ms**. Khác Spark/Hadoop hàng phút.

## SQL equivalence

| SQL                              | ES                                |
|----------------------------------|-----------------------------------|
| `SELECT COUNT(*) FROM movies`    | Aggregation `value_count`         |
| `SELECT AVG(rating) FROM movies` | Aggregation `avg`                 |
| `GROUP BY genre`                 | **Bucket** aggregation `terms`     |
| `SELECT MIN(year), MAX(year)`    | Aggregations `min` + `max`        |
| `GROUP BY year, COUNT(*)`        | Bucket `terms` + sub-agg `value_count` |

## 2 loại aggregations

### 1. Bucket aggregations

Group doc thành "buckets":

- **`terms`** — group theo field value (như SQL `GROUP BY field`).
- **`range`** — group theo numeric range.
- **`date_histogram`** — group theo date interval (per hour/day/month).
- **`histogram`** — group theo numeric interval.
- **`filter`** / **`filters`** — group theo query.

### 2. Metric aggregations

Tính số trên doc trong bucket:

- **`avg`**, **`sum`**, **`min`**, **`max`**, **`stats`** (combo) — numeric.
- **`cardinality`** — distinct count (approximate).
- **`value_count`** — total count.
- **`percentiles`** — p50, p95, p99.
- **`top_hits`** — N doc đầu trong bucket.

→ Kết hợp: bucket + sub-metric = "average rating per genre".

## Query đầu tiên

```text
GET /movies/_search
{
    "size": 0,                                ← Không trả document, chỉ aggregation
    "aggs": {
        "by_genre": {                          ← Tên bucket (tự đặt)
            "terms": { "field": "genre" }     ← Group theo genre
        }
    }
}
```

Response:

```json
{
    "hits": { "total": 100, "hits": [] },     ← size=0 nên hits rỗng
    "aggregations": {
        "by_genre": {
            "buckets": [
                { "key": "Sci-Fi",  "doc_count": 30 },
                { "key": "Action",  "doc_count": 25 },
                { "key": "Drama",   "doc_count": 20 },
                ...
            ]
        }
    }
}
```

→ Mỗi genre có doc_count (số movies).

**`size: 0`** quan trọng — không lãng phí trả document, chỉ aggregation.

## Sub-aggregation

Nest aggregation trong bucket:

```text
GET /movies/_search
{
    "size": 0,
    "aggs": {
        "by_genre": {
            "terms": { "field": "genre" },
            "aggs": {                                       ← Nested
                "avg_rating": {
                    "avg": { "field": "rating" }
                }
            }
        }
    }
}
```

Response:

```json
{
    "aggregations": {
        "by_genre": {
            "buckets": [
                {
                    "key": "Sci-Fi",
                    "doc_count": 30,
                    "avg_rating": { "value": 7.8 }
                },
                {
                    "key": "Drama",
                    "doc_count": 20,
                    "avg_rating": { "value": 8.1 }
                }
            ]
        }
    }
}
```

→ "Average rating per genre". SQL equivalent:

```sql
SELECT genre, COUNT(*), AVG(rating) FROM movies GROUP BY genre;
```

## Filter + aggregation

Combine search + aggregation:

```text
GET /movies/_search
{
    "query": {
        "range": { "year": { "gte": "2010" } }    ← Filter doc 2010+
    },
    "size": 0,
    "aggs": {
        "by_genre": {
            "terms": { "field": "genre" },
            "aggs": {
                "avg_rating": { "avg": { "field": "rating" } }
            }
        }
    }
}
```

→ Chỉ aggregate movies 2010+ theo genre. Both query + agg work cùng nhau.

## Field type cho aggregation

| Field type     | Aggregation usable?                  |
|----------------|--------------------------------------|
| `keyword`      | ✅ (terms, cardinality, ...)         |
| `integer`/`long`/`float` | ✅ (avg, sum, range, ...)  |
| `date`         | ✅ (date_histogram, range, ...)       |
| `boolean`      | ✅ (terms)                            |
| **`text`**     | **❌** (cần fielddata = true, ác)     |

→ Aggregate trên text field default → ERROR. Dùng `.keyword` sub-field:

```text
"terms": { "field": "title.keyword" }
```

Phase 2 bài 2 đã đề cập multi-field.

## Limit bucket

Mặc định `terms` trả top 10 buckets sorted by doc_count desc. Tăng:

```text
"terms": {
    "field": "genre",
    "size": 50                ← Trả top 50
}
```

→ Cẩn thận: nhiều bucket = memory tốn.

Sort khác:

```text
"terms": {
    "field": "genre",
    "order": { "_key": "asc" }            ← Sort theo key alphabetical
}

"terms": {
    "field": "genre",
    "order": { "avg_rating": "desc" }      ← Sort theo sub-agg
}
```

## Mục tiêu Phase 5

```text
Bài 1: Aggregation tổng quan       ← bài này
Bài 2: Bucket aggregations sâu
Bài 3: Metric aggregations sâu
Bài 4: Sub-aggregation patterns
Bài 5: Histogram + date_histogram cho time series
```

## Tóm tắt

- **Aggregation** = analytics — count, sum, group by — tương đương SQL `GROUP BY`.
- 2 loại: **bucket** (group doc) + **metric** (compute trên doc).
- Nest sub-aggregation trong bucket = "metric per group".
- `size: 0` để không lãng phí trả document.
- Field aggregation: keyword, numeric, date, boolean. **Text không aggregate được**.
- Combine search query + aggregation cùng request.
- ES aggregation tốc độ ms trên triệu doc — replace Spark/Hadoop cho dashboard.

---

→ [Bài tiếp theo: Bucket aggregations](02-bucket-aggregations.md)

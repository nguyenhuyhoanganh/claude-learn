# Bài 3: Metric aggregations

Metric = tính số trên doc. Bài này: 10+ loại metric phổ biến.

## Single-value metrics

### avg, sum, min, max, value_count

```text
GET /movies/_search
{
    "size": 0,
    "aggs": {
        "avg_rating":     { "avg":   { "field": "rating" } },
        "sum_revenue":    { "sum":   { "field": "revenue" } },
        "min_year":       { "min":   { "field": "year" } },
        "max_year":       { "max":   { "field": "year" } },
        "total_count":    { "value_count": { "field": "rating" } }
    }
}
```

Response:

```json
{
    "aggregations": {
        "avg_rating":   { "value": 7.5 },
        "sum_revenue":  { "value": 1234567890 },
        "min_year":     { "value": 1959, "value_as_string": "1959" },
        "max_year":     { "value": 2024, "value_as_string": "2024" },
        "total_count":  { "value": 100 }
    }
}
```

### stats — combo

```text
"aggs": {
    "rating_stats": { "stats": { "field": "rating" } }
}
```

Response:

```json
{
    "rating_stats": {
        "count": 100,
        "min": 1.0,
        "max": 9.5,
        "avg": 7.5,
        "sum": 750.0
    }
}
```

→ 5 metrics trong 1 query. Hiệu quả hơn 5 query riêng.

### extended_stats — chi tiết hơn

```text
"aggs": {
    "rating_stats": { "extended_stats": { "field": "rating" } }
}
```

→ Thêm: `sum_of_squares`, `variance`, `std_deviation`, `std_deviation_bounds`.

## cardinality — distinct count

Đếm unique value (approximate, HyperLogLog):

```text
"aggs": {
    "unique_users": { "cardinality": { "field": "user_id" } }
}
```

Response:

```json
{
    "unique_users": { "value": 12345 }
}
```

→ Approximate (sai số ~1-5%) nhưng cực nhanh + ít memory. Đếm exact cho hàng triệu unique = slow + RAM nổ.

Adjust precision:

```text
"cardinality": {
    "field": "user_id",
    "precision_threshold": 10000      ← Default 3000. Higher = chính xác hơn, tốn RAM hơn.
}
```

## percentiles — distribution

P50 (median), p95, p99 cực kỳ quan trọng cho latency:

```text
"aggs": {
    "response_time_p": {
        "percentiles": {
            "field": "response_time_ms",
            "percents": [50, 90, 95, 99, 99.9]
        }
    }
}
```

Response:

```json
{
    "response_time_p": {
        "values": {
            "50.0":  120.0,         ← 50% request < 120ms
            "90.0":  450.0,         ← 90% < 450ms
            "95.0":  700.0,
            "99.0":  2300.0,        ← P99 = 2.3 sec
            "99.9":  15000.0        ← Tail latency 15 sec
        }
    }
}
```

→ Pattern Site Reliability Engineering — track p99 thay vì avg (avg che giấu tail).

### percentile_ranks — ngược lại

"Bao nhiêu request < 100ms?":

```text
"aggs": {
    "fast_requests": {
        "percentile_ranks": {
            "field": "response_time_ms",
            "values": [100, 500, 1000]
        }
    }
}
```

Response:

```json
{
    "values": {
        "100.0":  35.0,        ← 35% request < 100ms
        "500.0":  92.0,        ← 92% < 500ms
        "1000.0": 98.5         ← 98.5% < 1 sec
    }
}
```

→ Cho SLA: "99% request < 500ms" → check value tại 500 ≥ 99?

## top_hits — N doc top trong bucket

Lấy N doc đại diện mỗi bucket:

```text
{
    "size": 0,
    "aggs": {
        "by_genre": {
            "terms": { "field": "genre" },
            "aggs": {
                "top_movies": {
                    "top_hits": {
                        "size": 3,
                        "sort": [{ "rating": "desc" }],
                        "_source": ["title", "rating"]
                    }
                }
            }
        }
    }
}
```

Response:

```json
{
    "by_genre": {
        "buckets": [
            {
                "key": "Sci-Fi",
                "doc_count": 30,
                "top_movies": {
                    "hits": {
                        "hits": [
                            { "_source": { "title": "Interstellar", "rating": 9.5 } },
                            { "_source": { "title": "Inception",    "rating": 9.0 } },
                            { "_source": { "title": "The Matrix",   "rating": 8.7 } }
                        ]
                    }
                }
            }
        ]
    }
}
```

→ "Top 3 phim mỗi genre". Cực hữu ích cho UI category page.

## sum_bucket, avg_bucket — aggregate trên buckets

**Pipeline aggregations** — chạy sau bucket aggregation, aggregate trên result.

```text
{
    "size": 0,
    "aggs": {
        "by_genre": {
            "terms": { "field": "genre" },
            "aggs": {
                "avg_rating": { "avg": { "field": "rating" } }
            }
        },
        "max_avg_rating_genre": {
            "max_bucket": {
                "buckets_path": "by_genre>avg_rating"
            }
        }
    }
}
```

→ "Genre có avg_rating cao nhất". Response:

```json
{
    "max_avg_rating_genre": {
        "value": 8.5,
        "keys": ["Drama"]
    }
}
```

## moving_average, derivative

Time series analysis:

```text
{
    "aggs": {
        "events_per_day": {
            "date_histogram": { "field": "@timestamp", "calendar_interval": "day" },
            "aggs": {
                "count": { "value_count": { "field": "@timestamp" } },
                "trend": {
                    "moving_avg": {
                        "buckets_path": "count",
                        "window": 7
                    }
                }
            }
        }
    }
}
```

→ 7-day moving average của event count. Smooth out noise daily.

`derivative` = đạo hàm (delta).

## scripted_metric (advanced)

Custom logic với Painless:

```text
{
    "aggs": {
        "weighted_avg_rating": {
            "scripted_metric": {
                "init_script":    "state.weights = 0; state.weighted_sum = 0",
                "map_script":     "state.weights += doc['view_count'].value; state.weighted_sum += doc['rating'].value * doc['view_count'].value",
                "combine_script": "return state",
                "reduce_script":  "double total_weights = 0, total_sum = 0; for (s in states) { total_weights += s.weights; total_sum += s.weighted_sum; } return total_sum / total_weights"
            }
        }
    }
}
```

→ Weighted average rating (theo view_count). Cực mạnh nhưng chậm + complex. Avoid trừ khi thật sự cần.

## Practical example: dashboard

"Dashboard cho team sales":

```text
GET /sales/_search
{
    "query": { "range": { "date": { "gte": "now-30d/d" } } },
    "size": 0,
    "aggs": {
        "total_revenue":     { "sum": { "field": "amount" } },
        "avg_order_value":   { "avg": { "field": "amount" } },
        "unique_customers":  { "cardinality": { "field": "customer_id" } },
        "by_day": {
            "date_histogram": { "field": "date", "calendar_interval": "day" },
            "aggs": {
                "daily_revenue": { "sum": { "field": "amount" } }
            }
        },
        "by_product": {
            "terms": { "field": "product.keyword", "size": 10 },
            "aggs": {
                "revenue": { "sum": { "field": "amount" } }
            }
        }
    }
}
```

→ 1 request, 5 metrics + 2 charts. Frontend render dashboard.

→ Đây là **sweet spot** của ES — analytics interactive real-time.

## Tóm tắt

- Single-value metrics: `avg`, `sum`, `min`, `max`, `value_count`.
- **`stats`** combo 5 metrics. **`extended_stats`** thêm variance, std_deviation.
- **`cardinality`** — distinct count approximate (HyperLogLog), efficient.
- **`percentiles`** — p50/p95/p99 cho latency analysis (SRE).
- **`percentile_ranks`** — ngược lại, "bao nhiêu % < X?".
- **`top_hits`** — N doc top trong bucket. "Top movies per genre".
- **Pipeline aggs** (`sum_bucket`, `moving_avg`, `derivative`) — aggregate trên bucket result.
- **`scripted_metric`** — Painless custom logic. Avoid trừ khi cần.

---

→ [Bài tiếp theo: Sub-aggregations patterns](04-sub-aggregations.md)

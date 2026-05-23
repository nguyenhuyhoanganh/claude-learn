# Bài 4: Sub-aggregation patterns

Sức mạnh thực sự = **combine bucket + metric, nest nhiều cấp**. Bài này: pattern phổ biến.

## Pattern 1: metric per bucket

"Avg rating per genre":

```text
{
    "size": 0,
    "aggs": {
        "by_genre": {
            "terms": { "field": "genre" },
            "aggs": {
                "avg_rating": { "avg": { "field": "rating" } },
                "max_rating": { "max": { "field": "rating" } },
                "total":       { "value_count": { "field": "rating" } }
            }
        }
    }
}
```

→ Mỗi genre có 3 metrics: avg, max, count.

## Pattern 2: 2-level bucket nesting

"Top product per category":

```text
{
    "size": 0,
    "aggs": {
        "by_category": {
            "terms": { "field": "category.keyword" },
            "aggs": {
                "by_product": {
                    "terms": { "field": "product_id", "size": 5, "order": { "revenue": "desc" } },
                    "aggs": {
                        "revenue": { "sum": { "field": "amount" } }
                    }
                }
            }
        }
    }
}
```

→ Mỗi category có top 5 product theo revenue.

## Pattern 3: bucket trong bucket trong time

"Daily revenue per region":

```text
{
    "aggs": {
        "by_day": {
            "date_histogram": { "field": "date", "calendar_interval": "day" },
            "aggs": {
                "by_region": {
                    "terms": { "field": "region.keyword" },
                    "aggs": {
                        "revenue": { "sum": { "field": "amount" } }
                    }
                }
            }
        }
    }
}
```

→ Time series chart split by region. Foundation cho stacked chart Kibana.

## Pattern 4: filter + agg

"Avg rating của sci-fi movies":

```text
{
    "size": 0,
    "aggs": {
        "scifi": {
            "filter": { "term": { "genre": "Sci-Fi" } },
            "aggs": {
                "avg_rating": { "avg": { "field": "rating" } },
                "count":       { "value_count": { "field": "rating" } }
            }
        }
    }
}
```

→ Tương đương:

```sql
SELECT AVG(rating), COUNT(*) FROM movies WHERE genre = 'Sci-Fi';
```

Sao không dùng `query` outer + agg? **Cả 2 work**. Nhưng `filter` aggregation cho phép multi-subset trong 1 request:

```text
{
    "aggs": {
        "scifi":  { "filter": { "term": { "genre": "Sci-Fi" } }, "aggs": { ... } },
        "action": { "filter": { "term": { "genre": "Action" } }, "aggs": { ... } },
        "drama":  { "filter": { "term": { "genre": "Drama" } }, "aggs": { ... } }
    }
}
```

→ 3 metrics riêng cho 3 genre trong 1 query.

## Pattern 5: cumulative sum

Sum tích luỹ theo time:

```text
{
    "aggs": {
        "by_day": {
            "date_histogram": { "field": "date", "calendar_interval": "day" },
            "aggs": {
                "daily_revenue":      { "sum": { "field": "amount" } },
                "cumulative_revenue": { "cumulative_sum": { "buckets_path": "daily_revenue" } }
            }
        }
    }
}
```

Response:

```json
{
    "by_day": {
        "buckets": [
            { "key_as_string": "2026-05-20", "daily_revenue": { "value": 1000 }, "cumulative_revenue": { "value": 1000 } },
            { "key_as_string": "2026-05-21", "daily_revenue": { "value": 1500 }, "cumulative_revenue": { "value": 2500 } },
            { "key_as_string": "2026-05-22", "daily_revenue": { "value":  800 }, "cumulative_revenue": { "value": 3300 } }
        ]
    }
}
```

→ Chart "Total revenue YTD" cộng dồn.

## Pattern 6: significant_terms cho recommendation

"User xem phim A, recommend gì?":

```text
{
    "query": {
        "term": { "viewed_movies": "Inception" }            ← Users đã xem Inception
    },
    "aggs": {
        "similar_movies": {
            "significant_terms": {
                "field": "viewed_movies",
                "exclude": "Inception"                       ← Bỏ Inception khỏi result
            }
        }
    }
}
```

→ Trả phim **significant** trong group user xem Inception (so với population). Top movies → recommendation.

→ Foundation cho **collaborative filtering** đơn giản.

## Pattern 7: nested aggregation

Field kiểu `nested`:

```text
{
    "mappings": {
        "properties": {
            "reviews": {
                "type": "nested",
                "properties": {
                    "rating": { "type": "integer" },
                    "user_id": { "type": "keyword" }
                }
            }
        }
    }
}
```

Aggregate trên nested:

```text
{
    "aggs": {
        "reviews_agg": {
            "nested": { "path": "reviews" },                 ← Bắt buộc cho nested field
            "aggs": {
                "avg_rating": { "avg": { "field": "reviews.rating" } }
            }
        }
    }
}
```

→ Aggregate trên **mỗi review** (không phải mỗi product). Khác biệt quan trọng cho nested data.

## Performance gotchas

### 1. Bucket cardinality bùng nổ

```text
"by_user": { "terms": { "field": "user_id", "size": 1000000 } }
```

→ Memory + time terrible. Giới hạn:

```text
PUT /_cluster/settings
{
    "transient": { "search.max_buckets": 10000 }
}
```

→ Default ES 10K bucket max. Vượt = error.

### 2. Sub-aggregation depth

```text
agg1 > agg2 > agg3 > agg4 > agg5
```

→ Mỗi level multiply complexity. Avoid > 3-4 level.

### 3. Cardinality precision

`cardinality` default precision_threshold = 3000. Hi-cardinality data → tăng nhưng tốn RAM:

```text
"cardinality": {
    "field": "session_id",
    "precision_threshold": 40000
}
```

## Real-world example: e-commerce dashboard

```text
GET /orders/_search
{
    "query": {
        "range": { "created_at": { "gte": "now-30d/d" } }
    },
    "size": 0,
    "aggs": {
        "total_revenue": { "sum": { "field": "total" } },
        "unique_customers": { "cardinality": { "field": "customer_id" } },
        "order_value": {
            "percentiles": {
                "field": "total",
                "percents": [50, 90, 99]
            }
        },
        "daily_trend": {
            "date_histogram": { "field": "created_at", "calendar_interval": "day" },
            "aggs": {
                "revenue": { "sum": { "field": "total" } },
                "cumulative": { "cumulative_sum": { "buckets_path": "revenue" } }
            }
        },
        "top_products": {
            "terms": { "field": "product_id", "size": 10, "order": { "rev": "desc" } },
            "aggs": {
                "rev": { "sum": { "field": "total" } },
                "qty": { "sum": { "field": "quantity" } }
            }
        },
        "by_region": {
            "terms": { "field": "region.keyword" },
            "aggs": {
                "revenue": { "sum": { "field": "total" } },
                "top_categories": {
                    "terms": { "field": "category.keyword", "size": 3 }
                }
            }
        }
    }
}
```

→ 6 metrics + 3 charts. 1 request. Vài trăm ms. Render full dashboard.

→ Đây là productivity ES cho data analytics.

## Tóm tắt

- Pattern phổ biến: **metric per bucket**, **bucket nest bucket**, **filter agg**, **cumulative sum**.
- **`significant_terms`** cho recommendation, anomaly.
- **Nested field** cần wrap với `nested` agg.
- Cardinality + depth = performance bottleneck. Plan trước.
- Production dashboard = 1 query với nhiều aggs combine — fast + efficient.

---

→ [Bài tiếp theo: Histogram và date_histogram](05-histogram-va-date-histogram.md)

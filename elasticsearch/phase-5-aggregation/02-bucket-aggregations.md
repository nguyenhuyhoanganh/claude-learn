# Bài 2: Bucket aggregations

Bucket = nhóm doc theo tiêu chí. ES có ~30 loại bucket. Bài này: 5 loại phổ biến nhất.

## terms — group by value

Group doc theo unique value của field:

```text
GET /movies/_search
{
    "size": 0,
    "aggs": {
        "by_genre": {
            "terms": { "field": "genre" }
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
                { "key": "Sci-Fi", "doc_count": 30 },
                { "key": "Action", "doc_count": 25 }
            ]
        }
    }
}
```

→ SQL: `GROUP BY genre`.

### Options

```text
"terms": {
    "field": "genre",
    "size": 100,                                  ← Top N (default 10)
    "min_doc_count": 5,                           ← Bỏ bucket < 5 doc
    "order": { "_count": "desc" },                ← Sort theo count
    "missing": "N/A"                              ← Doc missing field → bucket "N/A"
}
```

### Cardinality high warning

Field có **nhiều unique value** (user_id, transaction_id) → bucket nổ. ES warning hoặc throw error nếu vượt limit.

→ Đừng terms agg trên field high-cardinality. Dùng `cardinality` (distinct count) thay.

## range — group by numeric range

```text
{
    "aggs": {
        "by_rating": {
            "range": {
                "field": "rating",
                "ranges": [
                    { "to": 5 },                  ← rating < 5
                    { "from": 5, "to": 7 },       ← 5 ≤ rating < 7
                    { "from": 7, "to": 9 },       ← 7 ≤ rating < 9
                    { "from": 9 }                  ← rating ≥ 9
                ]
            }
        }
    }
}
```

Response:

```json
{
    "aggregations": {
        "by_rating": {
            "buckets": [
                { "key": "*-5.0",  "from": "-Inf", "to": 5, "doc_count": 5 },
                { "key": "5.0-7.0", "from": 5, "to": 7, "doc_count": 20 },
                { "key": "7.0-9.0", "from": 7, "to": 9, "doc_count": 50 },
                { "key": "9.0-*",  "from": 9, "doc_count": 8 }
            ]
        }
    }
}
```

→ Custom rating tier (low/medium/high/excellent).

Named ranges (clearer):

```text
"ranges": [
    { "key": "low",       "to": 5 },
    { "key": "medium",    "from": 5, "to": 7 },
    { "key": "high",      "from": 7, "to": 9 },
    { "key": "excellent", "from": 9 }
]
```

## date_histogram — time series

Group doc theo interval thời gian:

```text
{
    "aggs": {
        "events_per_day": {
            "date_histogram": {
                "field": "@timestamp",
                "calendar_interval": "day"
            }
        }
    }
}
```

Intervals:
- `minute`, `hour`, `day`, `week`, `month`, `quarter`, `year`.
- Hoặc fixed: `30s`, `5m`, `1h`, `7d`.

Response:

```json
{
    "buckets": [
        { "key_as_string": "2026-05-20T00:00:00Z", "key": 1747699200000, "doc_count": 1234 },
        { "key_as_string": "2026-05-21T00:00:00Z", "key": 1747785600000, "doc_count": 5678 },
        ...
    ]
}
```

→ Foundation cho **time series chart** (Kibana line chart). Logs per day, sales per hour...

### Auto interval

```text
"date_histogram": {
    "field": "@timestamp",
    "calendar_interval": "auto",
    "buckets": 30                ← Mong muốn ~30 buckets
}
```

→ ES tự chọn interval phù hợp.

## histogram — numeric interval

Như date_histogram nhưng numeric:

```text
{
    "aggs": {
        "by_price": {
            "histogram": {
                "field": "price",
                "interval": 100             ← Bucket size = 100
            }
        }
    }
}
```

Response:

```json
{
    "buckets": [
        { "key": 0,    "doc_count": 50 },     ← Price 0-100
        { "key": 100,  "doc_count": 100 },    ← Price 100-200
        { "key": 200,  "doc_count": 75 }
    ]
}
```

→ Distribution chart (price histogram).

## filter / filters — group by query

### `filter` — single sub-set

```text
{
    "aggs": {
        "high_rated": {
            "filter": { "range": { "rating": { "gte": 8 } } },
            "aggs": {
                "avg_year": { "avg": { "field": "year" } }
            }
        }
    }
}
```

→ Aggregate trên subset doc match filter.

### `filters` — multiple bucket

```text
{
    "aggs": {
        "by_category": {
            "filters": {
                "filters": {
                    "blockbuster": { "range": { "rating": { "gte": 8 } } },
                    "popular":     { "range": { "rating": { "gte": 6, "lt": 8 } } },
                    "obscure":     { "range": { "rating": { "lt": 6 } } }
                }
            }
        }
    }
}
```

→ 3 bucket: blockbuster / popular / obscure. Mỗi bucket aggregate riêng.

## geo_distance — group theo khoảng cách

Cho geo data:

```text
{
    "aggs": {
        "by_distance": {
            "geo_distance": {
                "field": "location",
                "origin": "10.762622, 106.660172",        ← HCMC
                "unit": "km",
                "ranges": [
                    { "to": 5 },
                    { "from": 5, "to": 20 },
                    { "from": 20, "to": 100 },
                    { "from": 100 }
                ]
            }
        }
    }
}
```

→ Số store trong 5km, 5-20km, ...

## significant_terms — tìm trend

Tìm term **statistically significant** trong subset:

```text
GET /movies/_search
{
    "query": { "match": { "actor": "Tom Hanks" } },
    "aggs": {
        "significant_genres": {
            "significant_terms": { "field": "genre" }
        }
    }
}
```

→ Genre xuất hiện nhiều trong movie Tom Hanks **so với baseline** (toàn corpus). Hữu ích recommendation.

## Combine bucket loại nhau

```text
{
    "aggs": {
        "by_genre": {
            "terms": { "field": "genre" },
            "aggs": {
                "by_year": {
                    "date_histogram": {
                        "field": "release_date",
                        "calendar_interval": "year"
                    },
                    "aggs": {
                        "avg_rating": { "avg": { "field": "rating" } }
                    }
                }
            }
        }
    }
}
```

→ "Average rating per year per genre". Triple nested.

## Pitfall

### Pitfall 1: terms trên text

```text
"terms": { "field": "title" }       ← text → ERROR
"terms": { "field": "title.keyword" }   ← OK
```

### Pitfall 2: bucket cardinality cao

```text
"terms": { "field": "user_id", "size": 100000 }
```

→ Memory tốn. Dùng `cardinality` cho distinct count:

```text
"aggs": {
    "unique_users": { "cardinality": { "field": "user_id" } }
}
```

→ Approximate (HyperLogLog), nhưng cực rẻ memory.

### Pitfall 3: date_histogram interval không hợp lý

Time range 1 năm + interval 1 phút = 525,600 buckets. Crash.

→ Match interval với time range. Hoặc dùng `auto`.

## Tóm tắt

- **`terms`** — group by value. `size` limit top N.
- **`range`** — numeric range, named hoặc auto.
- **`date_histogram`** — time series, calendar/fixed interval.
- **`histogram`** — numeric interval, distribution chart.
- **`filter`** / **`filters`** — group by query.
- **`geo_distance`** — group theo radius.
- **`significant_terms`** — significant relative to baseline.
- Combine: nest sub-aggregation cho multi-dimensional.
- **Cardinality cao** → `cardinality` (approximate) thay `terms`.

---

→ [Bài tiếp theo: Metric aggregations](03-metric-aggregations.md)

# Bài 5: Histogram và date_histogram cho time series

ES strong cho time series (logs, metrics). `date_histogram` là **backbone** cho mọi time chart Kibana. Bài này: sâu hơn.

## Intervals

### calendar_interval — theo calendar

```text
"date_histogram": {
    "field": "@timestamp",
    "calendar_interval": "day"          ← 1 ngày calendar (24h, có thể có DST)
}
```

Values: `minute`, `hour`, `day`, `week`, `month`, `quarter`, `year`.

→ Respect calendar (month có 28/30/31 ngày). Bucket bắt đầu tại midnight (timezone applied).

### fixed_interval — fixed duration

```text
"date_histogram": {
    "field": "@timestamp",
    "fixed_interval": "1d"               ← Exactly 86400 seconds
}
```

Values: `<N><unit>` — `30s`, `5m`, `1h`, `7d`...

→ Fixed seconds. Không respect calendar. Phù hợp cho regular interval (every 5 minutes).

→ **Best practice**: dùng `calendar_interval` cho human-facing dashboard (day/month). `fixed_interval` cho regular sampling (sensor metrics).

## Time zone

Default UTC. Set timezone cho local:

```text
"date_histogram": {
    "field": "@timestamp",
    "calendar_interval": "day",
    "time_zone": "Asia/Ho_Chi_Minh"
}
```

→ Bucket "day" align với 00:00 VN time thay vì UTC.

→ Quan trọng cho business report (sales theo ngày local timezone).

## Format

```text
"date_histogram": {
    "field": "@timestamp",
    "calendar_interval": "day",
    "format": "yyyy-MM-dd"
}
```

→ `key_as_string` được format theo pattern.

## Min/max bounds

Force bucket range (fill empty days):

```text
"date_histogram": {
    "field": "@timestamp",
    "calendar_interval": "day",
    "min_doc_count": 0,                   ← Include empty buckets
    "extended_bounds": {
        "min": "2026-05-01",
        "max": "2026-05-31"
    }
}
```

→ Trả mọi ngày tháng 5, kể cả ngày không có event. Important cho chart liền mạch.

## Pattern: time series + breakdown

"Daily request count + status code breakdown":

```text
{
    "size": 0,
    "aggs": {
        "by_day": {
            "date_histogram": {
                "field": "@timestamp",
                "calendar_interval": "day",
                "min_doc_count": 0,
                "extended_bounds": { "min": "now-30d/d", "max": "now/d" }
            },
            "aggs": {
                "by_status": {
                    "terms": { "field": "status_code" }
                }
            }
        }
    }
}
```

→ 30 days × statuses. Foundation cho stacked area chart "requests by status over time".

## Pattern: histogram numeric

```text
{
    "aggs": {
        "by_price_bucket": {
            "histogram": {
                "field": "price",
                "interval": 50,
                "min_doc_count": 0,
                "extended_bounds": { "min": 0, "max": 1000 }
            }
        }
    }
}
```

→ Price distribution chart: [0-50], [50-100], ..., [950-1000].

## Pattern: auto_date_histogram

ES tự chọn interval phù hợp với data range:

```text
"auto_date_histogram": {
    "field": "@timestamp",
    "buckets": 50                          ← Mong muốn ~50 buckets
}
```

→ Data span 1 hour → interval 1m. Data span 1 year → interval 1 week. Auto.

→ Hữu ích cho UI cho user choose time range (last hour, last day, last month) — không phải tính interval manual.

## Date math (range query)

Trong query không phải agg:

```text
{
    "query": {
        "range": {
            "@timestamp": {
                "gte": "now-7d/d",        ← 7 days ago, round down to day
                "lt":  "now/d"             ← Today, round down to day
            }
        }
    }
}
```

Date math:
- `now` — current time
- `now-1h` — 1 hour ago
- `now-7d` — 7 days ago
- `now/d` — round down to nearest day (midnight)
- `now+1M` — 1 month from now

→ Recurring query "last 7 days" — không cần compute timestamp Python/client side.

## Real example: log analytics

Apache access log, dashboard "last 24 hours":

```text
GET /nginx-logs-*/_search
{
    "query": {
        "range": { "@timestamp": { "gte": "now-24h" } }
    },
    "size": 0,
    "aggs": {
        "requests_per_hour": {
            "date_histogram": {
                "field": "@timestamp",
                "fixed_interval": "1h",
                "extended_bounds": { "min": "now-24h", "max": "now" }
            },
            "aggs": {
                "by_status": {
                    "terms": { "field": "status_code" }
                },
                "by_method": {
                    "terms": { "field": "http_method.keyword" }
                },
                "p95_latency": {
                    "percentiles": { "field": "response_time_ms", "percents": [95] }
                }
            }
        },
        "top_urls": {
            "terms": { "field": "url.keyword", "size": 10 }
        },
        "error_count": {
            "filter": { "range": { "status_code": { "gte": 500 } } }
        },
        "geo_distribution": {
            "terms": { "field": "geoip.country_iso_code", "size": 20 }
        }
    }
}
```

→ 1 query trả: time series request count + status breakdown + method breakdown + p95 latency + top URLs + error count + geo. Full dashboard.

## ✨ Tổng kết Phase 5

Sau Phase 5:

- **Aggregation** = analytics — count, sum, group by — tương đương SQL.
- **Bucket** aggs (terms, range, date_histogram, filter, ...) group doc.
- **Metric** aggs (avg, sum, percentiles, cardinality, top_hits) compute trên doc.
- Sub-aggregation nest → multi-dimensional analytics.
- **Pipeline aggs** (cumulative_sum, moving_avg, derivative) — aggregate trên bucket result.
- **date_histogram** backbone time series. `calendar_interval` vs `fixed_interval`.
- **`size: 0`** cho agg-only query, không return doc.
- ES aggregation tốc độ ms trên triệu doc — replace Spark/Hadoop cho dashboard real-time.

→ Phase 6: Kibana — UI visualize tất cả.

## Tóm tắt

- **`calendar_interval`** respect calendar (day, month).
- **`fixed_interval`** fixed duration (1h, 30m).
- **`time_zone`** cho dashboard local.
- **`extended_bounds`** + `min_doc_count: 0` cho chart liền mạch (empty buckets).
- **`auto_date_histogram`** cho interactive zoom UI.
- **Date math**: `now-1d/d`, `now/M`, `now+1h` — recurring queries.
- Combine date_histogram + sub-aggs → full time series analytics 1 query.

---

→ **Sẵn sàng?** [Phase 6: Kibana](../phase-6-kibana/01-kibana-tong-quan.md)

# Bài 5: Data frame transforms

Dashboard chậm vì aggregate triệu doc mỗi refresh. **Transform** = pre-compute aggregation thành index riêng → query super fast.

## Vấn đề: heavy aggregation cost

Dashboard "revenue per customer per day":

```text
GET /orders/_search
{
    "aggs": {
        "by_customer": {
            "terms": { "field": "customer_id", "size": 10000 },
            "aggs": {
                "by_day": {
                    "date_histogram": { "field": "date", "calendar_interval": "day" },
                    "aggs": {
                        "revenue": { "sum": { "field": "amount" } }
                    }
                }
            }
        }
    }
}
```

Trên 100M orders → query 30 giây + tốn nhiều RAM. User refresh dashboard 10× = ES nóng.

→ Solve bằng **pre-compute**: chạy aggregation 1 lần / 5 phút, save result vào index riêng. Dashboard query index "rollup" → fast.

## Transform

Transform = ES feature (basic free từ 7.7):

```text
PUT /_transform/customer-daily-revenue
{
    "source": {
        "index": "orders"
    },
    "dest": {
        "index": "customer-daily-revenue"
    },
    "pivot": {
        "group_by": {
            "customer_id": { "terms": { "field": "customer_id" } },
            "day": { "date_histogram": { "field": "date", "calendar_interval": "day" } }
        },
        "aggregations": {
            "revenue": { "sum": { "field": "amount" } },
            "order_count": { "value_count": { "field": "_id" } }
        }
    },
    "sync": {
        "time": {
            "field": "date",
            "delay": "60s"
        }
    }
}
```

→ Transform:
- Source: `orders` index.
- Group: `customer_id` × `day`.
- Aggregate: revenue (sum), order_count.
- Sync: continuous, update mỗi khi orders thêm.

Start:

```text
POST /_transform/customer-daily-revenue/_start
```

ES tạo index `customer-daily-revenue` với pre-aggregated documents:

```json
{
    "customer_id": "u-123",
    "day":         "2026-05-20",
    "revenue":     12345.67,
    "order_count": 5
}
```

→ Dashboard query `customer-daily-revenue` → 100 documents (vs aggregate 100M).

## Continuous vs batch

### Continuous

```text
"sync": {
    "time": { "field": "date", "delay": "60s" }
}
```

→ Mỗi 60s ES check source có doc mới → update dest. Real-time-ish.

→ Pattern dashboard live.

### Batch (no sync)

```text
PUT /_transform/...
{
    "source": ...,
    "dest": ...,
    "pivot": ...
    // no "sync"
}

POST /_transform/.../_start
# Run once, then stop after completion.
```

→ One-shot. Pattern ETL chạy cron.

## Stop / delete transform

```text
POST /_transform/customer-daily-revenue/_stop
DELETE /_transform/customer-daily-revenue
```

→ Stop = pause. Delete = remove transform definition (không xoá dest index).

## Use case

### 1. Dashboard summarization

Trên: revenue per customer per day. 100M order → 100K summary doc.

### 2. Entity-centric search

Source: `events` index (login, click, purchase).
Pivot by `user_id` → aggregate count of events, last seen, total spent.
Dest: `user-profile` index.

→ "User 360° view" — single doc per user with all aggregated info. Search/filter user dễ:

```text
GET /user-profile/_search
{
    "query": {
        "range": { "last_seen": { "gte": "now-7d" } }
    }
}
```

→ "Active users last 7 days" — không scan 100M events.

### 3. Reduce cardinality

100M events × 30 days = 3B → dashboard slow. Pre-aggregate to 100K per day → 3M total.

## Comparison: Transform vs Rollup vs Direct agg

| Aspect           | Direct aggregation     | Rollup (deprecated)    | Transform           |
|------------------|------------------------|------------------------|---------------------|
| Pre-compute      | ❌                      | ✅                     | ✅                  |
| Continuous       | -                       | Time-based only         | Time + entity-based |
| Pivot multi-field | -                      | Limited                 | ✅ Flexible          |
| Query target     | Original index         | Special rollup index   | Regular index       |
| Status           | Always available       | Deprecated 8.x         | Recommended         |

→ **Transform** modern way. Rollup phase out.

## Transform UI

Kibana → **Stack Management → Transforms** — wizard tạo:

1. Choose source index.
2. Define group + aggregation.
3. Preview result.
4. Set sync (continuous) or one-shot.
5. Start.

→ Đỡ phải viết JSON.

## ✨ Tổng kết Phase 7

Sau Phase 7:

- Centralized logging architecture: **FileBeat → Logstash/Kafka → Elasticsearch → Kibana**.
- FileBeat triển khai mass deploy (Ansible, K8s DaemonSet), modules sẵn cho services phổ biến.
- **X-Pack Security** (basic free): authentication, RBAC, TLS — bật ngày 1.
- Workflow log analysis: Logs UI → Discover → time zoom → aggregate → correlate.
- Dashboard layout pattern: KPI → trend → breakdown → table.
- **Alerting** native qua Kibana → Slack/PagerDuty.
- **Transform** = pre-compute aggregation cho dashboard nhanh + entity-centric search.

→ Phase 8: production operations (sharding, ILM, snapshots, troubleshooting).

## Tóm tắt

- **Transform** pre-aggregate source → dest index. Dashboard query dest = fast.
- Pivot: group by N fields + aggregations.
- **Continuous**: sync với delay → real-time-ish dashboard.
- **Batch**: one-shot ETL.
- Use case: dashboard summary, entity-centric search (user 360°), cardinality reduction.
- Replace **Rollup** (deprecated). Created via UI hoặc REST.

---

→ **Sẵn sàng?** [Phase 8: Operations](../phase-8-operations/01-chon-so-shard.md)

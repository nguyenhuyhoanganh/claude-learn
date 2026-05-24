# Bài 4: Dashboards — Combine charts

**Dashboard** = trang gộp nhiều visualization + Discover save → 1 view tổng quan.

## Tạo dashboard

1. Sidebar → **Dashboard** → **Create dashboard**.
2. Click **Add from library** → chọn saved visualization → add vào canvas.
3. Repeat cho nhiều chart.
4. Drag-resize từng panel.
5. **Save** với name (vd "Web traffic — Production").

## Layout

Grid 48 column. Mỗi panel:
- Drag border để resize.
- Drag header để move.
- Click ⚙️ để edit (open Lens), delete, copy.

→ Tile dashboard theo logic visual: top = KPI (big numbers), middle = trends (time series), bottom = breakdowns (tables, pie).

## Use case dashboard

### Production monitoring

```text
┌────────────────────────────────────────────────────────┐
│  ╔══════════╗ ╔══════════╗ ╔══════════╗               │
│  ║ Requests ║ ║ Errors   ║ ║ P99 lat. ║   ← KPI       │
│  ║ 12.3M    ║ ║ 0.12%    ║ ║ 320ms    ║               │
│  ╚══════════╝ ╚══════════╝ ╚══════════╝               │
│                                                         │
│  ┌────────────────────────────────────────────────┐   │
│  │   Time series: requests per minute (24h)        │   │
│  │   line chart with status code breakdown         │   │
│  └────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────┐  ┌────────────────────────┐ │
│  │ Top 10 URLs         │  │ Geo distribution       │ │
│  │ (bar chart)         │  │ (map)                  │ │
│  └─────────────────────┘  └────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

→ Operator vào dashboard ngay lập tức nắm được status.

### Sales dashboard

```text
- Big numbers: Revenue this month, AOV, new customers
- Line: daily revenue (with last month comparison)
- Bar: top product by revenue
- Pie: revenue by channel
- Map: revenue by country
- Data table: latest orders
```

## Auto-refresh

Setting (top right): **Refresh every X**.

```text
Auto-refresh: every 30 sec
```

→ Dashboard tự reload data. NOC monitor real-time.

## Time range global

Dashboard có **single time range** apply mọi panel:

```text
Time picker: Last 24 hours
```

→ Mọi chart show data 24h. User change time → all charts update.

## Global filters

Top of dashboard có filter bar (KQL):

```text
Filter: status_code >= 400 and country: "VN"
```

→ Apply mọi panel. Drill-down without leaving dashboard.

→ Pinned filter từ Discover cũng apply.

## Drill-down

Click vào element trên chart (bar, pie slice, ...) → auto-filter dashboard theo value đó:

```text
Click bar "GET /api/checkout" → dashboard filter url: "/api/checkout"
                                  → All charts re-render với context này
```

→ Interactive analysis.

## Share dashboard

3 cách:

### 1. URL share

```text
Share → Permalinks → Copy
```

URL contains state (time, filter, panels). Send tới teammate → họ thấy y same view.

### 2. Embed iframe

```text
Share → Embed code → iframe HTML
```

→ Nhúng dashboard vào internal portal, Confluence page.

### 3. Export PNG / PDF (paid)

X-Pack Reporting → scheduled email PDF.

→ Weekly auto-email "Sales report PDF" to executives.

## Saved objects management

```text
Stack Management → Saved Objects
```

→ Browse, export, import dashboards / visualizations.

Export JSON, version control trong Git. Import vào ES khác = same dashboard.

→ Pattern Infrastructure-as-Code: dashboard committed Git, deploy với ES.

## Spaces

Multi-team / multi-environment? Kibana **Spaces** isolate:

```text
Space: dev      → dev dashboards
Space: prod     → prod dashboards
Space: marketing → marketing dashboards
```

→ User chỉ thấy space được grant. Role-based.

## Best practices

### 1. KISS

Dashboard 30 chart = overload. Limit 6-12 panel. Multiple dashboards specific.

### 2. Group by audience

- **Executive** dashboard: KPI, trend, geo.
- **Engineer** dashboard: error rate, latency, deploy markers.
- **Marketing** dashboard: campaign, conversion.

→ Stakeholder vào dashboard relevant, không lạc trong sea of chart.

### 3. Consistent time range

Mọi panel cùng time. Đừng mix "last day" với "last month".

### 4. Title clear

"Chart 1" — bad. "Top 10 URLs by Request Count (last 24h)" — good.

### 5. Filter cho context

Production dashboard filter `env: prod` để không lẫn dev data.

### 6. Version control

Export saved objects → commit Git → deploy bằng API.

## Alerting (paid)

Dashboard + alerting:
- Threshold: "Error rate > 5%" → email/Slack/PagerDuty.
- Anomaly: ML detect spike.

→ X-Pack Alerting plugin. Foundation cho on-call.

## ✨ Tổng kết Phase 6

Sau Phase 6:

- **Kibana** = web UI cho ES. No-code analytics.
- **Data view** = link Kibana ↔ ES indices.
- **Discover** = browser data với KQL + time range + columns.
- **Visualize / Lens** = drag-drop tạo chart.
- **Dashboard** = combine charts, single time, global filter, drill-down.
- **Maps** cho geo data.
- **Share**: URL, embed iframe, PDF email.
- **Spaces** isolate team / environment.
- **Saved objects** export Git → IaC pattern.
- Alerting + ML (paid) cho production observability.

## Tóm tắt

- **Dashboard** combine charts + Discover save với layout grid.
- Global time + global filter apply mọi panel.
- Auto-refresh cho real-time monitoring.
- Drill-down: click chart element → filter dashboard.
- Share qua URL, iframe, PDF (paid).
- Best practice: KISS, group by audience, consistent time, clear title.
- IaC: export JSON, commit Git, deploy via API.

---

→ **Sẵn sàng?** [Phase 7: Elastic Stack cho logs](../phase-7-elastic-stack-cho-logs/01-elastic-stack-architecture.md)

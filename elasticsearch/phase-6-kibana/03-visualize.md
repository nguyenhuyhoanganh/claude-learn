# Bài 3: Visualize — Build chart

**Visualize Library** = nơi tạo chart từ ES aggregation. Kibana 8+ có **Lens** — drag-drop visual builder modern.

## Types of chart

| Chart type      | Use case                                       |
|-----------------|------------------------------------------------|
| **Bar / Column**| Compare categories (revenue per region)        |
| **Line**        | Trend over time                                |
| **Area**        | Cumulative trend, stacked categories           |
| **Pie / Donut** | Proportion (caution: hard read > 5 slices)     |
| **Metric**      | Big number (total revenue, total users)        |
| **Gauge**       | Single metric vs target                        |
| **Heatmap**     | Density (request count per hour per day)       |
| **Data table**  | Structured tabular                             |
| **Treemap**     | Hierarchical proportion                        |
| **Map**         | Geo data                                       |
| **Markdown**    | Text annotation                                |
| **TSVB**        | Advanced time series                           |

## Tool: Lens (modern, recommended)

Kibana 8+ default. Drag-drop:

1. Sidebar → **Visualize Library** → **Create visualization** → **Lens**.
2. Chọn data view.
3. Drag field từ sidebar trái vào canvas.
4. Kibana **auto-suggest** chart type tốt nhất.

```text
Drag "title" (keyword) + "rating" (numeric)
   → Kibana suggest: Bar chart, "Top values of title" by "Average of rating"
```

5. Customize:
   - **X-axis**: term aggregation (genre, year, ...).
   - **Y-axis**: metric (avg, sum, count, ...).
   - **Break down by**: split bars/lines by another field.

6. **Save** với name.

## Visualize cũ (legacy)

Trước Lens, mỗi chart type có config panel riêng:

1. Choose chart type (Bar/Line/...).
2. Choose data view.
3. **Metrics** panel: chọn aggregation (Y axis).
4. **Buckets** panel: chọn split (X axis).
5. Save.

→ Vẫn dùng được. Lens dễ hơn cho beginner.

## Example: Top 10 Sci-Fi movies by rating

Steps trong Lens:

1. Create Lens visualization, choose data view "movies".
2. Add filter: `genre.keyword: "Sci-Fi"`.
3. Drag **title.keyword** → X axis. Lens chọn "Top 10 values".
4. Drag **rating** → Y axis. Default "Average".
5. Change chart type → **Horizontal bar** (dễ đọc với labels dài).
6. Sort: **Order by**: rating, descending.

→ Bar chart top 10 Sci-Fi movies theo avg rating.

Save: name "Top Sci-Fi Movies".

## Example: Time series — events per day with status breakdown

1. Create Lens.
2. Data view: `nginx-logs-*`.
3. X axis: drag **@timestamp** → "Date histogram", interval auto.
4. Y axis: drag **status_code** (any numeric) → "Count of records".
5. **Break down by**: drag `status_code.keyword` → stacked bars.
6. Chart type: **Bar (stacked)** hoặc **Area (stacked)**.

→ Stacked area chart: events per day, color stack by status code. Spot 5xx error spike instantly.

## Example: KPI metric

"Total revenue this month":

1. Lens → chart type **Metric**.
2. Drag `amount` → metric.
3. Function: **Sum**.
4. Add filter: time `now-1M`.

→ Big number `$1,234,567`.

Configure conditional color:
- Red if < 1M.
- Yellow if 1-2M.
- Green if > 2M.

→ "Traffic light" dashboard.

## Pie chart with care

```text
Pie:    Genre breakdown — 30% Sci-Fi, 25% Action, ...
```

→ Visual nice nhưng:
- Hard read khi > 5 slices.
- So sánh < 10% rất khó eyeball.

→ Best practice: **Bar chart** thay pie cho > 5 categories.

## Heatmap

Density 2 dimensions:

```text
X: hour of day (0-23)
Y: day of week (Mon-Sun)
Value: request count
```

→ Spot traffic pattern: peak hours, weekend vs weekday.

## TSVB — advanced time series

Time Series Visual Builder. Multiple data sources cùng chart:

- Compare current week vs previous week (overlay 2 line).
- Group filter (compare endpoint A vs B).
- Math expression (response time × multiplier).

→ Phức tạp nhưng power user love. Lens cover 80% use case; TSVB cho 20% còn lại.

## Maps

Geo data → Map.

1. Create **Map**.
2. Add layer:
   - **Documents** — plot mỗi doc với `geo_point`.
   - **Clusters and grids** — aggregate density per region.
   - **Heatmap** — geo density.
   - **Choropleth** — country/region color by metric.

→ Visualize "request distribution by country".

Requires field type `geo_point`:

```text
"location": { "type": "geo_point" }
```

→ Logstash `geoip` filter (Phase 4) tạo field này từ IP.

## Saved visualizations

Save tất cả vào Library:

```text
Stack Management → Saved Objects → Visualizations
```

→ List, search, copy, export. Reuse trong nhiều dashboards.

## Share / export

- **Share** → embed URL → user click vào xem chart.
- **PNG / PDF export** (paid feature Elastic).

## Pitfalls

### 1. Forget time range

Empty chart? Time range "Last 15 min" mà data ở hôm qua. Tăng range.

### 2. Wrong field type

```text
Aggregate "title" → fail (text field)
```

→ Dùng `title.keyword`.

### 3. Too many buckets

```text
Top 1000 of user_id    ← Slow + browser lag
```

→ Limit top 10-50. Top 1000 không readable anyway.

### 4. Pie cho time series

```text
Pie of events per day    ← Useless (time → line/bar)
```

→ Right chart for right data.

## Tóm tắt

- **Lens** = modern drag-drop builder. Auto-suggest chart.
- Chart types: bar, line, area, pie (sparingly), metric, gauge, heatmap, table, map, ...
- Buckets = X axis. Metrics = Y axis. Break down = split/color.
- Pie chỉ cho < 5 category. Bar tốt hơn nhiều.
- **Maps** cho geo data với `geo_point` field.
- **TSVB** cho time series advanced.
- Save visualizations vào Library → reuse trong dashboards.

---

→ [Bài tiếp theo: Dashboards](04-dashboards.md)

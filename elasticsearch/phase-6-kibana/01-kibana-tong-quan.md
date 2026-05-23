# Bài 1: Kibana tổng quan

5 phase trước viết JSON query qua Dev Tools. Production user (non-dev) cần UI thân thiện. **Kibana** = web UI cho ES.

## Kibana là gì

```text
┌─────────────────────────────────────────────────────┐
│                      Kibana                          │
│  ┌────────────┬────────────┬────────────┬─────────┐ │
│  │  Discover  │ Visualize  │ Dashboards │ DevTools│ │
│  │            │            │            │         │ │
│  │  Explore   │ Build      │ Combine    │ Raw     │ │
│  │  data      │ charts     │ charts     │ query   │ │
│  └────────────┴────────────┴────────────┴─────────┘ │
│  ┌────────────┬────────────┬────────────┬─────────┐ │
│  │   Maps     │  Canvas    │     ML     │   Logs  │ │
│  │            │            │            │         │ │
│  │  Geo viz   │ Pixel-perf │ Anomaly    │ Stream  │ │
│  └────────────┴────────────┴────────────┴─────────┘ │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
                    Elasticsearch
```

→ Kibana ngồi trên ES, query qua REST API. Bản thân không lưu data — chỉ visualize.

## Đặc trưng

1. **No-code analytics** — drag-drop tạo chart, không cần viết query.
2. **Real-time** — auto-refresh dashboard.
3. **Multi-user** — share dashboard, role-based access.
4. **Open-source** (basic free, advanced paid).

## Use case

| Persona            | Use case                                        |
|--------------------|-------------------------------------------------|
| **DevOps**         | Log analysis, troubleshoot incidents            |
| **SRE**            | SLA dashboard, p99 latency, error rate          |
| **Business analyst**| Sales report, customer behavior                |
| **Security**       | SIEM dashboard, anomaly hunt                    |
| **Marketing**      | Campaign performance, A/B test result           |
| **Developer**      | Query exploration (Dev Tools), debug           |

## Setup (đã làm Phase 1)

Phase 1 bài 2 đã cài qua docker-compose. Verify:

```bash
docker ps                  # Check kibana container
curl http://localhost:5601 # Kibana UI
```

→ Browser `http://localhost:5601`.

## Tour navigation

Sidebar trái (collapsible):

```text
🏠 Home

ANALYTICS
🔍 Discover           ← Explore raw data
📊 Visualize Library  ← Saved charts
📋 Dashboard          ← Combine charts
🗺️  Maps              ← Geo data
🎨 Canvas             ← Pixel-perfect report

OBSERVABILITY
📜 Logs
📈 Metrics
🐛 APM

SECURITY
🛡️  SIEM

MANAGEMENT
⚙️  Stack Management   ← Index, user, role
🔧 Dev Tools           ← REST console
```

→ 90% time: Discover + Visualize + Dashboard + Dev Tools.

## Index pattern / Data view

Trước khi visualize, Kibana cần biết **index nào** + **field nào**. Tạo **Data view** (gọi tắt cũ là "Index pattern"):

1. **Stack Management** → **Data Views** → **Create data view**.
2. Form:
   ```
   Name:            movies
   Index pattern:   movies*              ← Match index theo wildcard
   Timestamp field: (none) hoặc @timestamp cho time series
   ```
3. Save.

→ Kibana scan field từ index → display để bạn select khi visualize.

→ Pattern `logs-*` match `logs-2026-05-01`, `logs-2026-05-02`, ... → 1 data view multi-index.

## Sample data sẵn

Kibana ship sample dataset để test:

1. Home → **Try sample data**.
2. Choose:
   - **eCommerce** orders.
   - **Flight** data.
   - **Web logs**.
3. Click **Add data**.

→ Auto-import data + tạo data view + tạo dashboards. Explore ngay.

→ Best way để learn Kibana — interact với real data, không phải tự setup.

## So sánh với competitors

| Tool           | Strengths                          | Weaknesses                       |
|----------------|------------------------------------|----------------------------------|
| **Kibana**     | ES native, full Query DSL access  | Lock-in ES                       |
| **Grafana**    | Multi-source (Prometheus, MySQL...) | ES support limited so với Kibana |
| **Tableau**    | Beautiful viz, BI-grade             | Đắt, less real-time              |
| **Looker**     | Modern BI, SQL-first                | Đắt, không streaming             |
| **Superset**   | Open-source BI alternative          | Setup hơi nặng                   |

→ Pattern phổ biến:
- **Log analytics** → Kibana.
- **Metrics monitoring** → Grafana.
- **BI executive report** → Tableau / Looker.

## Phase 6 outline

```text
Bài 1: Tổng quan + setup            ← bài này
Bài 2: Discover — explore data
Bài 3: Visualize — build chart
Bài 4: Dashboards — combine
```

→ Sau Phase 6 biết: cài data view, dùng Discover, tạo bar/pie/line chart, combine vào dashboard, share team.

## Tóm tắt

- **Kibana** = web UI cho Elasticsearch. Visualize, dashboard, no-code.
- Components: Discover, Visualize, Dashboard, Maps, Canvas, Dev Tools, ML, SIEM...
- **Data view** (cũ: Index pattern) = link Kibana ↔ ES indices.
- Sample data sẵn cho explore nhanh.
- Pattern: Kibana cho log; Grafana cho metrics; Tableau cho BI.

---

→ [Bài tiếp theo: Discover](02-discover.md)

# Bài 2: Discover — Explore raw data

**Discover** = chế độ "browse" data ES. Như SQL `SELECT * FROM ... WHERE ...` với UI trực quan.

## Mở Discover

Sidebar → **Discover**.

```text
┌─────────────────────────────────────────────────────────┐
│  Data view: [movies ▼]    Time: [Last 24 hours ▼]      │
│                                                          │
│  Search: [search input box                          🔍] │
│                                                          │
│  ┌─ Field list ────────┬─ Documents ─────────────────┐ │
│  │ ☑ title             │  📊 Time histogram (auto)    │ │
│  │ ☑ year              │                              │ │
│  │ ☐ genre             │  Time          | title       │ │
│  │ ☐ rating            │  ──────────────|─────────────│ │
│  │ ...                 │  2026-05-24    | Inception   │ │
│  │                     │  2026-05-23    | Interstellar│ │
│  │                     │  ...                          │ │
│  └─────────────────────┴──────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## 3 phần chính

### 1. Data view + time range

- **Data view dropdown** — chọn index group.
- **Time picker** — Last 15 min / Last day / Last week / custom range.

Time picker chỉ hiện nếu data view có timestamp field.

### 2. Search bar (KQL)

Kibana có **KQL** (Kibana Query Language) — syntax đơn giản hơn Query DSL:

```text
# Match field
title: "Inception"

# Wildcard
title: Inter*

# Range
year > 2010

# Boolean
title: Star and year > 2010
title: Star or title: Trek
not title: Trek

# Exist
genre: *

# Nested groups
(title: Star or title: Trek) and year >= 2010
```

→ KQL **tự convert thành Query DSL** behind the scenes.

Lucene query syntax cũng support (toggle switch). Power users dùng Lucene.

### 3. Field list (left) + Documents (right)

- **Field list** — mọi field trong data view. Click `+` để add vào table.
- **Documents** — rows với column = selected fields. Click row để expand JSON full.

→ Default chỉ show `_source`. Add column để focus field cần.

## Time histogram

Top of result: bar chart count event per time bucket.

→ Quick visual: spike? trend? gap?

Click+drag trên histogram → zoom vào time range đó. Cực nhanh để debug incident:

```
"Hôm qua 14h có spike, drill xuống xem chuyện gì xảy ra"
```

## Save search

Search hay dùng → save:

1. Save icon top → name → save.
2. Load lại sau từ Discover → Open.

→ Search saved có thể attach vào dashboard.

## Filter bar

Filter chips top:

```text
[ + Add filter ]   [genre: Sci-Fi ×]   [year ≥ 2010 ×]
```

→ Click `+` → field, operator (`is`, `is not`, `is one of`, `exists`...), value. UI điền giúp.

Click filter chip:
- **Edit** — modify.
- **Pin** — apply cross app (visualize, dashboard).
- **Disable / Enable** — toggle.
- **Negate** — `NOT`.

→ Filter combine với search bar (AND).

## Use case Discover

### 1. Debug log incident

```text
Search: status_code >= 500 and url: "/api/checkout"
Time:   Last 1 hour
```

→ Thấy errors. Click vào doc → xem stack trace.

### 2. Explore new data

Mới ingest data → vào Discover → click qua field → hiểu data structure.

### 3. Ad-hoc query

Business hỏi "có bao nhiêu user signup hôm qua?":

```text
Search: event: signup
Time:   Yesterday
```

→ Histogram trả count tức thì.

## Field statistics

Click field name trong sidebar → popup show:
- **Top 5 values** với % distribution.
- **Visualize** button → tạo chart nhanh.

→ Quick EDA (exploratory data analysis).

## Saved query

Sau khi viết KQL phức tạp → save (icon bookmark cạnh search bar):

```text
Name: "Errors last hour"
Query: status_code >= 500 and @timestamp >= "now-1h"
```

→ Reuse / share.

## Export

Discover → Share → CSV download:

```text
Last 30 days, 100K rows → download CSV
```

→ Tốc độ giới hạn 10K rows default; raise qua setting nếu cần.

## Best practices

### 1. Always set time range

Default "Last 15 min". Forget → "0 results" panic.

### 2. Add field columns

Default _source hiển thị toàn JSON → noisy. Add 3-5 column quan trọng.

### 3. Pin filters cross-app

Filter pinned apply cả Visualize + Dashboard → consistent context.

### 4. Save thường

Saved search reuse, share, attach dashboard.

## Tóm tắt

- **Discover** = data browser. Time range + KQL search + field columns.
- **KQL** dễ hơn Query DSL: `field: value`, `and`, `or`, `not`, `>`, `<`.
- **Time histogram** quick visual + zoom drill-down.
- **Filter bar** + **search bar** combine AND.
- **Field statistics** popup cho EDA.
- **Save search** reuse + dashboard attachment.
- 90% debug log / explore data dùng Discover.

---

→ [Bài tiếp theo: Visualize](03-visualize.md)

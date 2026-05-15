# Bài 6: Big Data & Lambda Architecture

## Big Data là gì?

> **Big Data** = Datasets quá lớn, quá phức tạp, hoặc đến quá nhanh đến nỗi vượt khả năng xử lý của traditional applications.

### Ba V của Big Data

| V | Định nghĩa | Ví dụ |
|---|-----------|-------|
| **Volume** | Lượng data lớn (TBs, PBs/ngày) | Search engine index cả internet |
| **Variety** | Nhiều loại data khác nhau | Clicks + likes + views + purchases + location |
| **Velocity** | Data đến nhanh, liên tục | IoT sensors, real-time transactions |

### Ví dụ Big Data Use Cases

- **Internet Search**: Google crawl toàn bộ web, cung cấp search trong milliseconds
- **Medical Systems**: Phân tích patient records để phát hiện bệnh
- **Weather Prediction**: Satellite + sensor data để dự báo thời tiết
- **IoT Analytics**: Fleet of autonomous vehicles, factory machines
- **Social Media Analytics**: User behavior, trends, recommendations

## Hai chiến lược xử lý Big Data

### 1. Batch Processing

```
Data arrives → Stored as-is → Batch job runs periodically → Compute view → Store in queryable DB
```

**Đặc điểm:**
- Không xử lý từng event → xử lý **batches** theo schedule (hourly, daily, monthly)
- Có thể re-run nếu job fails (data vẫn còn nguyên)
- Kết quả đến sau delay (không real-time)
- Phù hợp cho complex analysis trên toàn bộ dataset

**Ưu điểm:**
- Easy to implement (không cần low latency)
- High availability (old view vẫn available trong khi job chạy)
- Efficient (batch processing > per-event)
- High fault tolerance (re-run nếu bug)
- Deep analysis (full dataset, complex ML models)

**Nhược điểm:**
- **High latency** — user không thấy changes ngay
- Không phù hợp cho real-time use cases

**Use cases điển hình:**
- Instructor payment: Tính revenue từ video views → pay end of month
- Course ratings: Tính average rating mỗi ngày từ tất cả reviews
- Search engine indexing: Crawl và index content periodically

### 2. Real-time Processing

```
Data arrives → Queue/Broker → Processing job (per-event) → Update real-time view
```

**Đặc điểm:**
- Xử lý mỗi event ngay khi arrive
- Real-time visibility
- Chỉ có recent data (không analyze historical)

**Ưu điểm:**
- Low latency (immediate response)
- Real-time alerts và actions

**Nhược điểm:**
- Hard to do complex analysis
- No historical context
- Less fault tolerant (bug = corrupt data)

**Use cases điển hình:**
- Log monitoring (production incidents)
- Stock price updates
- Live scoreboards

## Lambda Architecture — Best of Both Worlds

### Vấn đề

```
Batch: Deep analysis ✅ | Real-time ❌
Real-time: Immediate ✅ | Deep analysis ❌

Nhiều use cases cần CẢ HAI:
- Ride sharing: Real-time matching + Historical pattern analysis
- Log monitoring: Real-time alerts + Historical baseline comparison
- Ad tech: Real-time bidding + Historical ROI analysis
```

### Lambda Architecture Solution

Được đề xuất bởi Nathan Marz (Twitter/BackType):

```
                    ┌──────────────────────────────┐
                    │        Incoming Data          │
                    └─────────────┬────────────────┘
                                  │ (split!)
                    ┌─────────────▼────────────────┐
           ┌────────►      Batch Layer              │
           │        │  - Immutable master dataset   │
           │        │  - Periodic batch jobs        │
           │        │  - Batch views (complete)     │
           │        └──────────────┬───────────────┘
           │                       │
Data ──────┤                   Batch Views
           │                       │
           │        ┌──────────────▼───────────────┐
           │        │      Speed Layer              │
           └────────►  - Real-time processing       │
                    │  - Recent data only           │
                    │  - Real-time views            │
                    └──────────────┬───────────────┘
                                   │
                               Real-time Views
                                   │
                    ┌──────────────▼───────────────┐
                    │      Serving Layer            │
                    │  - Merge batch + real-time    │
                    │  - Respond to queries         │
                    └──────────────────────────────┘
```

### Ba Layers

**Batch Layer:**
- Lưu immutable master dataset (chỉ append, không sửa)
- Chạy batch processing jobs định kỳ
- Tạo "batch views" — comprehensive, accurate analysis
- Ví dụ storage: HDFS, S3

**Speed Layer:**
- Real-time processing cho events gần đây nhất
- "Close the gap" giữa hiện tại và lần chạy batch gần nhất
- Tạo "real-time views" — fast but limited
- Ví dụ: Kafka Streams, Flink, Storm

**Serving Layer:**
- Merge batch views + real-time views
- Respond to queries với combined data
- Ví dụ: Cassandra (batch views) + Redis (real-time views)

### Ví dụ thực tế: AdTech Platform

**Events:** Impressions (user xem ad), Clicks, Purchases

```
Advertiser Queries:
1. "Bao nhiêu users đang xem ads của tôi RIGHT NOW?"
   → Speed Layer only (real-time)

2. "Tổng ads shown trong 24 giờ qua?"
   → Batch Layer (22h) + Speed Layer (2h gần nhất) = merge

3. "ROI của campaign trong 3 tháng?"
   → Batch Layer only (deep historical analysis)
```

**Kết quả:** Lambda Architecture serve tất cả 3 queries efficiently!

## Khi nào dùng Lambda Architecture?

✅ **Phù hợp:**
- Cần cả real-time alerts VÀ historical analysis
- Log/metrics monitoring
- Ride sharing analytics
- Financial fraud detection với historical baseline
- Recommendation engines

❌ **Không cần khi:**
- Chỉ cần batch processing (simple reports)
- Chỉ cần real-time (monitoring without history)
- Data volume không đủ "big" để justify complexity

## Kappa Architecture (Simplified)

Alternative cho Lambda: **Chỉ có Speed Layer** (chạy real-time processing với replay capability).

```
Lambda: Batch Layer + Speed Layer + Serving Layer (complex)
Kappa:  Speed Layer only + Replay from log (simpler)
```

Kappa phù hợp khi real-time processing đủ handle historical replay.

## Tóm tắt

```
Big Data 3 Vs: Volume, Variety, Velocity

Processing Strategies:
├── Batch Processing: Periodic, full dataset, high accuracy, high latency
└── Real-time Processing: Per-event, low latency, limited analysis

Lambda Architecture:
├── Batch Layer: Immutable data + comprehensive batch views
├── Speed Layer: Real-time views for recent data
└── Serving Layer: Merge both → respond to any query

Best for: Systems needing both real-time AND historical analysis
```

---
**Tiếp theo:** Bài 7 - System Design Practice →

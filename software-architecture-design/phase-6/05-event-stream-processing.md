# Bài 5: Event Stream Processing & Windowing Strategies

## Vấn đề: Analyze Infinite Streams

Trong EDA, ta có **infinite stream of events** — không có điểm bắt đầu hay kết thúc:

```
... [event] [event] [event] [event] [event] [event] ...
    t=1      t=2      t=3      t=4      t=5      t=6
```

**Hai loại processing:**
1. **Isolated**: Mỗi event xử lý độc lập (đủ cho nhiều cases)
2. **Aggregated**: Cần analyze **chuỗi events** để có meaningful insights

**Ví dụ cần aggregate:** Số lần click quảng cáo mỗi phút? Revenue trung bình mỗi giờ?

**Giải pháp: Windowing** — chia stream thành finite "windows" để aggregate.

## Bốn Windowing Strategies

### 1. Tumbling Window

> Non-overlapping, fixed-size windows. Sau khi window close → output result → window mới bắt đầu.

```
|─── Window 1 ───|─── Window 2 ───|─── Window 3 ───|
t=0     t=5      t=5     t=10     t=10    t=15
[e1,e2,e3,e4,e5] [e6,e7,e8,e9]  [e10,e11,e12,e13]
     → result1        → result2        → result3
```

**Characteristics:**
- Mỗi event thuộc **đúng 1 window**
- Kết quả ra **đều đặn** (mỗi 5 phút, mỗi 1 giờ)
- Simple, no overlap

**Use cases:**
- **Billing**: Tổng doanh thu mỗi giờ/ngày/tháng
- **Metrics**: CPU usage trung bình mỗi 5 phút
- **Rate limiting**: Số requests mỗi phút
- **Reports**: Daily/hourly aggregations

### 2. Hopping Window

> Overlapping fixed-size windows. Window size > hop size → events có thể thuộc nhiều windows.

```
Window size = 10 giây, Hop size = 5 giây:

Window 1: [t=0 → t=10]  → result1
Window 2: [t=5 → t=15]  → result2
Window 3: [t=10 → t=20] → result3

Event tại t=7 thuộc Window 1 VÀ Window 2!
```

**Characteristics:**
- Events có thể thuộc nhiều windows (overlap)
- Output thường xuyên hơn tumbling (mỗi hop)
- Smoothed results (tránh bị ảnh hưởng bởi 1 spike)

**Use cases:**
- **Moving average**: "Average CPU trong 10 phút, cập nhật mỗi 5 phút"
- **Trend detection**: Smooth out noise
- **Alert systems**: "Nếu average error rate > 5% trong 10 phút → alert"
- **Dashboard metrics**: Smooth real-time charts

### 3. Sliding Window

> Window "trượt" theo từng event. Luôn track N events/N seconds gần nhất.

```
Events: [e1@t=1, e2@t=3, e3@t=6, e4@t=8, e5@t=11]
Window size = 5 giây:

Khi e3 arrive (t=6): Window = [e2@t=3, e3@t=6]    (e1 expired: t=6-5=1)
Khi e4 arrive (t=8): Window = [e3@t=6, e4@t=8]    (e2 expired: t=8-5=3)
Khi e5 arrive (t=11): Window = [e4@t=8, e5@t=11]  (e3 expired: t=11-5=6)
```

**Characteristics:**
- Mỗi event arrival trigger re-computation
- Most up-to-date view (real-time)
- More computationally expensive

**Use cases:**
- **Fraud detection**: "Nếu > 5 transactions trong 10 giây → fraud"
- **DDoS detection**: "Nếu > 1000 requests trong 1 phút từ 1 IP → block"
- **Real-time monitoring**: Exact rolling windows
- **Anomaly detection**: Continuous pattern analysis

### 4. Session Window

> Dynamic windows dựa trên **user activity**, đóng khi user idle quá X giây.

```
User activity:
[click] [click] [click]   ....idle 5 min....   [click] [view] [purchase]
|───── Session 1 ────|   (session ends)        |──── Session 2 ────────|

Session gap threshold = 5 minutes
```

**Characteristics:**
- Window size không cố định (phụ thuộc activity)
- Capture toàn bộ "user journey" trong một session
- Không bị split bởi arbitrary time boundaries

**Use cases:**
- **User session analytics**: Thời gian trung bình mỗi session
- **Funnel analysis**: User làm gì trong 1 visit?
- **E-commerce**: Items viewed in same session → recommendations
- **Clickstream analysis**: Hành vi user navigation
- **Video streaming**: Liên tục xem vs pause nhiều lần

## So sánh 4 Windowing Strategies

| | Tumbling | Hopping | Sliding | Session |
|--|---------|---------|---------|---------|
| **Overlap** | Không | Có | Có (per-event) | Không (activity-based) |
| **Output frequency** | Per window | Per hop | Per event | Per session end |
| **Complexity** | Thấp | Medium | Cao | Medium |
| **Latency** | Cao nhất | Medium | Thấp nhất | Variable |
| **Use for** | Billing, reports | Smooth metrics | Real-time alerts | User behavior |

## Time in Stream Processing

### Event Time vs Processing Time

```
Event Time:    Khi event thực sự xảy ra (timestamp trong event)
Processing Time: Khi event được xử lý bởi system
```

**Vấn đề:** Network delay, retries → events arrive out of order!

```
Expected: e1(t=1), e2(t=2), e3(t=3), e4(t=4)
Actual:   e1(t=1), e3(t=3), e4(t=4), e2(t=2)  ← e2 arrives late!
```

### Late Event Handling

Khi window đã close nhưng late event arrive:

```
Option 1: Drop late events
→ Simple, nhưng mất accuracy

Option 2: Recompute window khi late event arrive
→ Accurate nhưng expensive

Option 3: Watermark approach
→ Delay window close bởi "watermark" (expected max delay)
→ Ví dụ: Watermark = 5 giây → window đóng sau khi max event time + 5s
```

### Watermark

```
Max event time seen = t=50
Watermark = 5 giây
→ Window [t=0, t=10] đóng khi watermark vượt t=10+5=15

Events arrive sau watermark:
→ Dropped (quá trễ)
→ Hoặc sent to late data sink
```

## Popular Stream Processing Frameworks

| Framework | Language | Best for |
|-----------|----------|---------|
| **Apache Kafka Streams** | Java | Kafka ecosystem |
| **Apache Flink** | Java/Scala | Low latency, stateful |
| **Apache Spark Streaming** | Scala/Python | Batch + streaming |
| **AWS Kinesis** | Managed | AWS ecosystem |
| **Google Dataflow** | Managed | GCP, Beam |

## Tóm tắt

```
Event Stream Processing Windowing:

1. Tumbling Window: Non-overlapping, fixed → billing, reports
2. Hopping Window: Overlapping, fixed → smooth metrics, alerts
3. Sliding Window: Per-event, always fresh → fraud detection, DDoS
4. Session Window: Activity-based → user journeys, clickstream

Time:
├── Event Time: Khi xảy ra (preferred for accuracy)
└── Processing Time: Khi được xử lý (simpler)

Late Events:
└── Watermark: Delay window close để handle late arrivals
```

---
**Tiếp theo:** Bài 6 - Big Data Architecture →

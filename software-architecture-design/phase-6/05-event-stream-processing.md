# Bài 5: Event Stream Processing & Windowing Strategies (Xử lý luồng sự kiện và chiến lược windowing)

## Vấn đề: Phân tích Infinite Stream (luồng vô hạn)

Trong EDA (bài 4), ta có **luồng event vô hạn** (infinite stream) — không có điểm bắt đầu hay kết thúc:

```text
... [event] [event] [event] [event] [event] [event] ...
    t=1      t=2     t=3     t=4      t=5     t=6
```

**Hai loại processing đối với event:**

1. **Isolated** (xử lý độc lập): Mỗi event xử lý riêng — đủ cho nhiều use case (vd: gửi notification khi có event mới).
2. **Aggregated** (xử lý tổng hợp): Cần phân tích **chuỗi event** để có insight có nghĩa.

**Ví dụ cần aggregate:** Tổng số click quảng cáo mỗi phút? Doanh thu trung bình mỗi giờ? Số lỗi 5xx trong 5 phút gần nhất?

→ Stream không có "kết thúc" → không thể compute "tổng" trên stream được. Giải pháp: **Windowing** — chia stream thành các "cửa sổ" (window) hữu hạn để aggregate.

## Bốn chiến lược Windowing

### 1. Tumbling Window (Cửa sổ trượt không overlap)

> Window có **kích thước cố định** (fixed size), **không chồng lấn** (non-overlapping). Sau khi window đóng → output kết quả → window mới bắt đầu.

```text
|─── Window 1 ───|─── Window 2 ───|─── Window 3 ───|
t=0      t=5     t=5     t=10     t=10    t=15
[e1,e2,e3,e4,e5] [e6,e7,e8,e9]    [e10,e11,e12,e13]
      → result1        → result2         → result3
```

**Đặc điểm:**

- Mỗi event thuộc về **đúng 1 window**.
- Kết quả ra **đều đặn** theo chu kỳ (mỗi 5 phút, mỗi 1 giờ, ...).
- Đơn giản nhất, không có overlap → tính toán nhẹ.

**Use cases:**

- **Billing**: Tổng doanh thu theo giờ / ngày / tháng.
- **Metrics**: CPU sử dụng trung bình mỗi 5 phút.
- **Rate limiting**: Số request mỗi phút trên 1 API key.
- **Báo cáo**: Báo cáo theo giờ / ngày.

### 2. Hopping Window (Cửa sổ trượt có overlap)

> Window có kích thước cố định nhưng **chồng lấn** nhau. Window size > hop size → event có thể nằm trong nhiều window.

```text
Window size = 10 giây, Hop size = 5 giây:

Window 1: [t=0  → t=10]   → result1
Window 2: [t=5  → t=15]   → result2
Window 3: [t=10 → t=20]   → result3
Window 4: [t=15 → t=25]   → result4

Event tại t=7 thuộc CẢ Window 1 VÀ Window 2!
```

**Đặc điểm:**

- Event có thể thuộc về **nhiều window** (do overlap).
- Output ra thường xuyên hơn tumbling (mỗi hop, không phải mỗi window size).
- Kết quả **smooth** hơn — không bị ảnh hưởng quá mạnh bởi 1 spike (đỉnh đột biến).

**Use cases:**

- **Moving average**: "CPU trung bình trong 10 phút, cập nhật mỗi 5 phút".
- **Trend detection**: Smooth bớt nhiễu để thấy xu hướng.
- **Alert systems**: "Nếu error rate trung bình > 5% trong 10 phút gần nhất → cảnh báo".
- **Dashboard metrics**: Real-time chart mượt, không giật.

### 3. Sliding Window (Cửa sổ trượt liên tục theo từng event)

> Window "trượt" theo từng event đến. Luôn theo dõi **N event hoặc N giây gần nhất**.

```text
Events: [e1@t=1, e2@t=3, e3@t=6, e4@t=8, e5@t=11]
Window size = 5 giây:

Khi e3 đến  (t=6):  Window = [e2@t=3, e3@t=6]      (e1 đã expire: 6-5=1)
Khi e4 đến  (t=8):  Window = [e3@t=6, e4@t=8]      (e2 đã expire: 8-5=3)
Khi e5 đến  (t=11): Window = [e4@t=8, e5@t=11]     (e3 đã expire: 11-5=6)
```

**Đặc điểm:**

- Mỗi event đến **trigger compute lại** (window thay đổi liên tục).
- View **luôn cập nhật nhất** (real-time chính xác).
- Tốn tài nguyên tính toán hơn các loại window khác.

**Use cases:**

- **Fraud detection**: "Nếu > 5 giao dịch trong 10 giây → flag fraud".
- **DDoS detection**: "Nếu > 1000 request trong 1 phút từ 1 IP → block".
- **Real-time monitoring**: Cần rolling window cực chính xác.
- **Anomaly detection**: Phân tích pattern liên tục.

### 4. Session Window (Cửa sổ theo session người dùng)

> Window có kích thước **động** dựa trên **hoạt động user**, đóng khi user không hoạt động (idle) quá X giây.

```text
Hoạt động user:
[click] [click] [click]   ....idle 5 phút....   [click] [view] [purchase]
|───── Session 1 ────|    (session kết thúc)    |──── Session 2 ────────|

Session gap threshold = 5 phút
→ Sau 5 phút không có activity → session đóng
→ Activity mới sau đó → bắt đầu session mới
```

**Đặc điểm:**

- Kích thước window không cố định — phụ thuộc behavior user.
- **Capture toàn bộ "user journey"** trong 1 session.
- Không bị cắt bởi ranh giới thời gian tuỳ ý (vd: cắt giữa session khi đang shopping).

**Use cases:**

- **User session analytics**: Thời gian trung bình mỗi session.
- **Funnel analysis**: User làm gì trong 1 lần visit (xem trang nào, mua sản phẩm gì).
- **E-commerce**: Sản phẩm xem trong cùng session → để recommendation.
- **Clickstream analysis**: Phân tích hành vi điều hướng.
- **Video streaming**: Xem liên tục hay pause nhiều lần (binge vs casual).

## So sánh 4 Windowing Strategies

| | Tumbling | Hopping | Sliding | Session |
|--|---------|---------|---------|---------|
| **Overlap** | Không | Có | Có (per-event) | Không (theo activity) |
| **Tần suất output** | Mỗi window | Mỗi hop | Mỗi event | Khi session kết thúc |
| **Độ phức tạp** | Thấp | Trung bình | Cao | Trung bình |
| **Latency** | Cao nhất | Trung bình | Thấp nhất | Variable |
| **Phù hợp** | Billing, báo cáo | Smooth metrics | Real-time alert | User behavior |

## Time trong Stream Processing — vấn đề quan trọng

### Event Time vs Processing Time

```text
Event Time:      Khi event THỰC SỰ xảy ra (timestamp gắn vào event lúc tạo)
Processing Time: Khi event ĐƯỢC XỬ LÝ bởi hệ thống
```

Giữa hai thời điểm này có khoảng cách (delay) — do network, retry, queue.

**Vấn đề thực tế:** Network delay, retry → event đến **không theo đúng thứ tự** (out of order)!

```text
Mong đợi: e1(t=1), e2(t=2), e3(t=3), e4(t=4)
Thực tế:  e1(t=1), e3(t=3), e4(t=4), e2(t=2)  ← e2 đến muộn!
```

Stream processing dùng **event time** (chính xác hơn) nhưng phải xử lý vấn đề out-of-order.

### Xử lý Late Event (Sự kiện đến muộn)

Khi window đã đóng nhưng có event đến muộn (late event):

```text
Option 1: Drop late event (bỏ qua)
→ Đơn giản, nhưng mất accuracy

Option 2: Recompute window khi late event đến
→ Chính xác nhưng tốn tài nguyên (phải tính lại window cũ)

Option 3: Watermark (cách phổ biến nhất)
→ Trì hoãn việc đóng window bằng "watermark" (delay tối đa mong đợi)
→ Ví dụ: Watermark = 5 giây → window đóng sau khi max event time + 5s
```

### Watermark — cơ chế đợi event late

```text
Max event time đã thấy = t=50
Watermark = 5 giây (mong đợi event đến muộn tối đa 5s)
→ Window [t=0, t=10] sẽ đóng khi watermark vượt qua t=10+5=15

Nếu event với event_time = 8 đến lúc watermark = 12:
→ Vẫn được tính vào window [0, 10] (vì window chưa đóng)

Nếu event với event_time = 8 đến lúc watermark = 20:
→ Quá trễ → drop hoặc gửi vào "late data sink" (xử lý riêng)
```

Watermark là cân bằng giữa **chính xác** (chờ lâu hơn) và **latency** (đóng sớm hơn).

## Stateful Stream Processing

Khi tính aggregate trên window (vd: average, sum, count), framework phải **lưu state**:

- Sliding window count: phải nhớ N event gần nhất.
- Tumbling sum: phải nhớ tổng đang chạy trong window hiện tại.
- Session window: phải nhớ activity của từng user.

Frameworks hiện đại (Kafka Streams, Flink) hỗ trợ **stateful processing** với:
- Local state store (RocksDB).
- Checkpoint state lên distributed storage.
- Khôi phục state khi node crash.

## Các Stream Processing Framework phổ biến

| Framework | Ngôn ngữ | Thế mạnh |
|-----------|----------|---------|
| **Apache Kafka Streams** | Java | Tích hợp chặt với Kafka, đơn giản |
| **Apache Flink** | Java/Scala | Latency thấp, stateful processing mạnh |
| **Apache Spark Streaming** | Scala/Python | Batch + streaming unified, ML pipeline |
| **AWS Kinesis Data Analytics** | Managed (SQL hoặc Flink) | Hệ sinh thái AWS |
| **Google Dataflow / Apache Beam** | Managed / SDK | GCP + portable code (chạy được nhiều backend) |
| **Apache Storm** | Java | Lâu đời, low-latency |

**Lưu ý**: Spark Streaming dùng micro-batching (xử lý theo lô nhỏ — không hoàn toàn realtime). Flink là pure streaming (xử lý từng event).

## Tóm tắt bài 5

```text
Event Stream Processing — 4 chiến lược Windowing:

1. Tumbling Window: cố định, không overlap
   → billing, báo cáo theo chu kỳ

2. Hopping Window:  cố định, có overlap
   → smooth metrics, dashboard, alert

3. Sliding Window:  per-event, luôn fresh
   → fraud detection, DDoS, real-time

4. Session Window:  theo activity user
   → user journey, clickstream, funnel

Time:
├── Event Time:      khi event thực sự xảy ra (chính xác)
└── Processing Time: khi event được xử lý (đơn giản)

Late Event:
└── Watermark: đợi delay tối đa rồi mới đóng window

Stateful processing: framework lưu state (Flink, Kafka Streams)
```

Bài kế tiếp sẽ về **Big Data Architecture** — kết hợp batch và stream processing cho dữ liệu khổng lồ.

---
**Bài kế tiếp**: [Bài 6 - Big Data / Lambda Architecture (Kiến trúc dữ liệu lớn)](06-big-data-lambda-architecture.md) →

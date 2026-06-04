# Bài 6: Big Data & Lambda Architecture (Dữ liệu lớn và kiến trúc Lambda)

## Big Data là gì?

> **Big Data** = Dataset quá lớn, quá phức tạp, hoặc đến quá nhanh đến mức **vượt khả năng xử lý** của các ứng dụng truyền thống.

Big Data không có ngưỡng cố định (vd: "trên 1 TB"), mà là **tương đối** — khi traditional database/application không thể handle nữa, đó là Big Data.

### Ba V của Big Data (mô hình kinh điển)

| V | Định nghĩa | Ví dụ |
|---|-----------|-------|
| **Volume** (khối lượng) | Lượng data khổng lồ (TB, PB, EB / ngày) | Index search engine cho toàn bộ web |
| **Variety** (đa dạng) | Nhiều loại data khác nhau, cả structured và unstructured | Click + like + view + purchase + location + image |
| **Velocity** (tốc độ) | Data đến nhanh, liên tục, real-time | IoT sensor, real-time transaction, financial market |

Một số version mở rộng thêm 2 V nữa: **Veracity** (độ tin cậy — data có chính xác không) và **Value** (giá trị — phân tích ra insight gì).

### Ví dụ Big Data Use Cases

- **Internet Search**: Google crawl toàn bộ web (hàng tỉ trang), index, và phục vụ kết quả search trong vài millisecond.
- **Medical Systems**: Phân tích hồ sơ bệnh nhân (text, image, lab result) để phát hiện bệnh sớm, dự đoán nguy cơ.
- **Weather Prediction**: Dữ liệu vệ tinh + sensor mặt đất → mô hình dự báo thời tiết.
- **IoT Analytics**: Fleet xe tự lái, máy móc nhà máy gửi telemetry liên tục.
- **Social Media Analytics**: Phân tích behavior user, trend, recommendation cho hàng tỉ user.
- **Financial Trading**: Phân tích market data real-time để algorithmic trading.

## Hai chiến lược xử lý Big Data

### 1. Batch Processing (Xử lý theo lô)

```text
Data đến → Lưu nguyên vẹn → Batch job chạy định kỳ → Tính view → Lưu vào DB query được
```

**Đặc điểm:**

- **Không xử lý từng event** riêng lẻ → xử lý **batch** (lô) theo schedule (hàng giờ, hàng ngày, hàng tháng).
- Có thể **re-run** nếu job fail (vì data nguồn vẫn còn nguyên — immutable).
- Kết quả đến **sau một khoảng delay** (không real-time).
- Phù hợp cho phân tích phức tạp trên **toàn bộ dataset**.

**Ưu điểm:**

- Dễ implement (không cần low latency, không cần distributed state).
- High availability (view cũ vẫn dùng được trong khi job mới chạy).
- Hiệu quả (xử lý batch luôn tối ưu hơn per-event).
- Fault tolerance cao (job lỗi → chỉ cần rerun).
- **Deep analysis**: Có thể chạy ML model phức tạp, query toàn bộ historical data.

**Nhược điểm:**

- **High latency** — user không thấy thay đổi ngay lập tức (đợi đến lần chạy batch tới).
- Không phù hợp cho use case cần real-time.

**Use case điển hình:**

- **Instructor payment** trên Udemy: Tính revenue từ video view trong tháng → trả tiền cuối tháng.
- **Course ratings**: Tính average rating mỗi ngày từ tất cả review.
- **Search engine indexing**: Crawl và index nội dung mới theo chu kỳ (Google re-crawl cứ vài ngày/tuần).
- **Báo cáo tài chính cuối tháng**.
- **Train ML model** trên historical data.

### 2. Real-time Processing (Xử lý thời gian thực)

```text
Data đến → Queue / Broker → Processing job (per-event) → Cập nhật real-time view
```

**Đặc điểm:**

- Xử lý mỗi event **ngay khi đến**.
- Real-time visibility — kết quả thấy ngay.
- **Chỉ có recent data** (không thể phân tích lịch sử dài).

**Ưu điểm:**

- Low latency (phản hồi ngay).
- Cảnh báo và hành động real-time (vd: chặn fraud ngay tại transaction).

**Nhược điểm:**

- Khó làm phân tích phức tạp (state nhỏ, no historical context).
- Không có lịch sử để so sánh.
- Ít fault tolerance hơn batch (bug → corrupt real-time view → khó re-run vì stream đã trôi qua).

**Use case điển hình:**

- **Log monitoring** (giám sát production incident).
- **Stock price update**.
- **Live scoreboard** (bóng đá, game).
- **Real-time fraud detection** (chặn transaction ngay).
- **Real-time bidding** (ad tech).

## Lambda Architecture — Kết hợp Best of Both Worlds (cả hai cùng tốt)

### Vấn đề

```text
Batch:     Phân tích sâu ✅ | Real-time ❌
Real-time: Phản hồi ngay ✅ | Phân tích sâu ❌

Nhiều use case cần CẢ HAI:
- Ride sharing: Real-time matching + Phân tích pattern lịch sử
- Log monitoring: Real-time alert + So sánh với baseline lịch sử
- Ad tech:      Real-time bidding + Phân tích ROI dài hạn
- Recommendation: Real-time signal + Pattern user cũ
```

→ Cần một kiến trúc kết hợp cả hai.

### Lambda Architecture — Giải pháp

Được đề xuất bởi **Nathan Marz** (Twitter / BackType, ~2011):

```text
                    ┌──────────────────────────────┐
                    │       Incoming Data           │
                    └─────────────┬────────────────┘
                                  │ (chia làm 2 luồng!)
                    ┌─────────────▼────────────────┐
           ┌────────►       Batch Layer             │
           │        │  - Immutable master dataset   │
           │        │  - Batch job chạy định kỳ    │
           │        │  - Batch view (complete)      │
           │        └──────────────┬───────────────┘
           │                       │
Data ──────┤                   Batch Views
           │                       │
           │        ┌──────────────▼───────────────┐
           │        │       Speed Layer             │
           └────────►  - Real-time processing       │
                    │  - Chỉ recent data           │
                    │  - Real-time view             │
                    └──────────────┬───────────────┘
                                   │
                            Real-time Views
                                   │
                    ┌──────────────▼───────────────┐
                    │      Serving Layer            │
                    │  - Merge batch + real-time    │
                    │  - Trả lời query              │
                    └──────────────────────────────┘
```

### Ba Layer của Lambda

**Batch Layer (Tầng batch):**
- Lưu **immutable master dataset** (chỉ append, không bao giờ sửa).
- Chạy batch processing job định kỳ (mỗi giờ / mỗi ngày).
- Tạo "batch view" — comprehensive, accurate analysis.
- Ví dụ storage: HDFS, Amazon S3, Google Cloud Storage.
- Ví dụ compute: Hadoop MapReduce, Apache Spark.

**Speed Layer (Tầng real-time):**
- Real-time processing cho event gần đây nhất.
- **"Close the gap"** giữa hiện tại và lần chạy batch gần nhất.
- Tạo "real-time view" — nhanh nhưng giới hạn về complexity.
- Ví dụ: Apache Kafka Streams, Apache Flink, Apache Storm.

**Serving Layer (Tầng phục vụ):**
- **Merge batch view + real-time view** thành 1 view duy nhất.
- Trả lời query với data đã combined.
- Ví dụ: Cassandra (cho batch view) + Redis (cho real-time view).

### Ví dụ thực tế: AdTech Platform (nền tảng quảng cáo)

**Events thu thập:** Impression (user xem ad), Click, Purchase.

```text
Advertiser hỏi 3 loại query khác nhau:

1. "Bao nhiêu user đang xem ads của tôi RIGHT NOW?"
   → Speed Layer only (real-time stream gần nhất)

2. "Tổng ads shown trong 24 giờ qua?"
   → Batch Layer (22 giờ đầu, đã được batch tính)
   + Speed Layer (2 giờ gần nhất, real-time)
   → merge → trả về kết quả

3. "ROI (return on investment) của campaign trong 3 tháng?"
   → Batch Layer only (deep historical analysis, không cần real-time)
```

→ **Lambda Architecture serve tất cả 3 query một cách hiệu quả!**

## Khi nào dùng Lambda Architecture?

✅ **Phù hợp:**

- Cần **cả real-time alert + historical analysis**.
- Log / metrics monitoring với baseline lịch sử.
- Ride sharing analytics (Uber, Grab).
- Financial fraud detection với pattern history.
- Recommendation engine (real-time signal + collaborative filtering).
- Real-time dashboard với data trong giờ qua.

❌ **Không cần khi:**

- Chỉ cần batch processing (báo cáo đơn giản hàng ngày).
- Chỉ cần real-time (monitoring không cần history).
- Volume data không đủ "big" để biện hộ cho complexity.

## Nhược điểm của Lambda

Lambda có giá phải trả:

- **Code duplication**: Cùng business logic phải implement 2 lần (cho batch và speed layer) — vì frameworks khác nhau.
- **Operational complexity**: Vận hành 2 stack song song, sync, monitoring.
- **Consistency issue**: Khi merge batch + real-time, có thể có duplicate hoặc inconsistency.

→ Để giải quyết, có một alternative: **Kappa Architecture**.

## Kappa Architecture (đơn giản hơn Lambda)

Alternative do **Jay Kreps** (LinkedIn, người tạo Kafka) đề xuất.

> **Kappa Architecture** = Chỉ có Speed Layer, dùng **replay** từ event log để xử lý cả real-time lẫn historical.

```text
Lambda: Batch Layer + Speed Layer + Serving Layer  (phức tạp)
Kappa:  Speed Layer only + Event Log với replay     (đơn giản hơn)
```

**Cách Kappa hoạt động:**

```text
Tất cả event lưu vào Kafka (immutable log, retention dài — vd 1 tháng)
                ↓
        Speed Layer (Stream Processing)
                ↓
        Real-time View

Khi cần re-compute historical:
→ Replay từ đầu log (Kafka cho phép)
→ Tạo view mới
→ Switch traffic sang view mới
```

**Ưu điểm Kappa:**

- 1 codebase duy nhất (chỉ stream processing).
- Operational simpler hơn nhiều.

**Hạn chế Kappa:**

- Yêu cầu event log retention dài (đắt).
- Stream processing framework phải đủ mạnh để xử lý historical replay (Flink, Kafka Streams làm được).
- Không phù hợp khi logic batch khác hẳn logic stream (vd: ML training cần full dataset).

→ Hiện nay nhiều công ty chuyển từ Lambda sang Kappa nhờ stream processing đã đủ trưởng thành.

## So sánh Lambda vs Kappa

| | Lambda | Kappa |
|--|--------|-------|
| Số layer | 3 (Batch + Speed + Serving) | 2 (Stream + Serving) |
| Code | Duplicate (batch + stream) | Single (stream only) |
| Complexity | Cao | Trung bình |
| Khi nào dùng | Khi batch và stream khác hẳn nhau | Khi stream đủ mạnh, log retention OK |

## Tóm tắt bài 6

```text
Big Data — 3 Vs: Volume, Variety, Velocity

2 chiến lược xử lý:
├── Batch Processing:    chạy định kỳ trên full dataset
│                         deep analysis, high latency, fault tolerant
└── Real-time Processing: xử lý per-event
                          low latency, limited analysis, less fault tolerant

Lambda Architecture (kết hợp cả 2):
├── Batch Layer:    immutable master dataset + batch view comprehensive
├── Speed Layer:    real-time view cho recent data
└── Serving Layer:  merge batch + real-time → trả lời query

Kappa Architecture (simpler alternative):
└── Stream Layer + Event Log → replay khi cần historical

Phù hợp khi: cần cả real-time alert + historical analysis
```

Bài cuối Phase 6 sẽ là **System Design Practice** — áp dụng tất cả kiến thức để thiết kế một hệ thống thực tế.

---
**Bài kế tiếp**: [Bài 7 - System Design Practice (Thực hành system design)](07-system-design-practice.md) →

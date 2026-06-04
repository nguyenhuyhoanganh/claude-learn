# Bài 2: Message Brokers (Hệ thống nhắn tin trung gian)

## Vấn đề với Synchronous Communication (Giao tiếp đồng bộ)

Khi Service A gọi trực tiếp Service B (đồng bộ — qua HTTP REST hay RPC), kể cả khi có Load Balancer ở giữa:

```text
Service A  ────────── sync call (gọi đồng bộ) ──────────►  Service B
                                                          [đang xử lý...]
Service A  ◄───────── chờ response ──────────────────────
        (suốt thời gian này Service A bị block, không làm việc khác)
```

Có 2 vấn đề lớn cần giải quyết:

### Vấn đề 1: Coupling (gắn chặt) và Long Operations (thao tác kéo dài)

**Ví dụ thực tế: Hệ thống đặt vé (Ticket Reservation)**

```text
Frontend Service  ──►  Ticket Reservation Service
                          ├── Reserve ticket qua API của bên thứ ba (chậm)
                          ├── Charge credit card (chậm)
                          ├── Gửi confirmation email (chậm)
                          └── In vé (chậm)
                       ◄── Trả response sau ... vài giây tới vài phút

Frontend Service bị chờ TOÀN BỘ thời gian này!
```

Các vấn đề kèm theo:
- User đợi rất lâu — UX tệ.
- Nếu Ticket Service crash giữa chừng → phải làm lại từ đầu, có thể đã charge card.
- Frontend không thể xử lý request khác trong khi chờ.

### Vấn đề 2: Traffic Spike (đột biến tải)

```text
Sự kiện sale lớn (Black Friday, flash sale):
   10,000 user đặt hàng đồng thời
   
→ Frontend Service: OK (đã scale ngang được)
→ Order Fulfillment Service: BỊ QUÁ TẢI
   (mỗi order cần nhiều bước tốn thời gian: charge, ship, gửi mail)
```

Tại sao không scale Fulfillment Service luôn? — vì:
- Fulfillment có thể gọi service ngoài (payment gateway) cũng có giới hạn.
- Scale up nhanh không phải lúc nào cũng được.
- Sau khi sale xong, lại phải scale down → tốn chi phí ops.

→ Cần một "vùng đệm (buffer)" để **hấp thụ spike** mà không cần scale up sốc.

## Message Broker là gì?

> **Message Broker** = Building block (khối xây dựng) sử dụng **queue (hàng đợi)** để lưu trữ message giữa sender (người gửi) và receiver (người nhận).

```text
Sender  ──►  [Message Broker Queue]  ──►  Receiver
              ↑                            ↑
        Lưu trữ messages              Xử lý theo tốc độ của mình
        bền bỉ (durable)
```

Cách hoạt động:
- **Sender**: KHÔNG chờ receiver xử lý xong — gửi xong là xong (fire and forget — bắn và quên).
- **Queue**: Lưu (buffer) messages, persist (lưu bền bỉ trên disk) chúng để không mất.
- **Receiver**: Lấy messages từ queue và xử lý **theo tốc độ của mình**, không bị áp lực từ sender.

⚠️ **Lưu ý**: Message Broker là **internal component (thành phần nội bộ)** — không bao giờ expose (đưa ra) bên ngoài như Load Balancer. Chỉ các service trong hệ thống mới giao tiếp với broker.

## Publish-Subscribe Pattern (Mẫu xuất bản — đăng ký)

Mở rộng từ mô hình queue đơn giản: nhiều publishers (người xuất bản) và nhiều subscribers (người đăng ký) cùng dùng chung 1 channel/topic.

```text
Publishers (xuất bản)              Subscribers (đăng ký)
[Service A]  ──publish──►  [Channel/Topic]  ──subscribe──►  [Service B]
[Service C]  ──publish──►                   ──subscribe──►  [Service D]
                                            ──subscribe──►  [Service E]
```

Mỗi message được publish vào channel → tất cả subscriber đăng ký channel đó đều nhận được bản sao.

**Ví dụ: Online Store**

```text
Order Service  ──publishes (xuất bản)──►  [orders channel]
                                                │
                                                │ fan-out: broadcast cho mọi subscriber
                                ┌───────────────┼───────────────┐
                                ↓               ↓               ↓
                       [Analytics Service]  [Notification     [Review Service]
                       (cập nhật dashboard)    Service]        (lên lịch xin
                                              (gửi push noti)   review sau 1 tuần)
```

**Lợi ích vàng**: Thêm subscriber mới (vd: thêm Fraud Detection Service) — **KHÔNG cần sửa code Order Service**! Chỉ cần subscribe vào channel là xong.

→ Đây chính là **loose coupling (gắn lỏng)** mà event-driven architecture mang lại.

## Cách Message Broker giải quyết 2 vấn đề ban đầu

### Giải pháp cho vấn đề 1: Long Operations → Async

```text
User → Frontend → publish "đặt vé" lên Broker → Response NGAY: "đang xử lý"
                                                  ↓
                                       Ticket Service nhận message:
                                       reserve → charge → email → in vé
                                                  ↓
                                       publish "vé đã đặt xong" lên Broker
                                                  ↓
                                       Notification Service: gửi mail/push cho user
```

User nhận confirmation **ngay lập tức** ("đang xử lý đặt vé"), việc xử lý thực sự chạy bất đồng bộ ở background.

### Giải pháp cho vấn đề 2: Traffic Spike → Buffering (đệm)

```text
Black Friday: 10,000 orders ùa vào trong 1 phút

Frontend → [Broker queue]  →  Fulfillment Service
              ↑                    ↓
        Chứa 9,990 orders     Xử lý từng cái theo
        (buffer giữ lại)       sức của mình (vd 100/phút)
```

- Orders **không bị mất** — chờ trong queue.
- Fulfillment xử lý dần dần — không bị quá tải, không cần scale gấp.
- Sau khi sale xong (queue đã được drain) — về normal.

→ Queue đóng vai trò "đập tràn" hấp thụ peak load.

## Message Broker đóng góp gì cho Quality Attributes?

| Quality Attribute | Cơ chế |
|---|---|
| **Fault Tolerance** | Messages được persist — không mất khi service tạm down |
| **Availability** | Các service vẫn giao tiếp được dù một bên đang unavailable |
| **Scalability** | Buffer spikes → không cần over-provision máy chủ |
| **Decoupling** | Sender và receiver tách biệt — đổi receiver không động sender |
| **Latency (trade-off)** | ⚠️ Thêm tầng trung gian → latency tăng so với gọi sync trực tiếp |

→ Có **đánh đổi**: ta đổi latency thấp lấy decoupling + resilience.

## Các Message Broker phổ biến

| Broker | Use case phù hợp |
|---|---|
| **Apache Kafka** | Event streaming throughput cao, log aggregation, hệ thống lớn |
| **RabbitMQ** | General purpose, routing phức tạp, traditional message queue |
| **AWS SQS** (queue) **/ SNS** (pub-sub) | Cloud-native, managed (AWS lo phần ops) |
| **Redis Pub/Sub** | Đơn giản, in-memory, latency thấp, không persist |
| **Google Pub/Sub** | GCP managed, scale rất tốt |
| **Apache Pulsar** | Modern, multi-tenancy tốt, geo-replication |

Mỗi cái có triết lý thiết kế khác nhau:
- Kafka: log-based, ưu tiên throughput và replay.
- RabbitMQ: message queue truyền thống, routing flexible.
- Redis: ultra-fast nhưng dữ liệu có thể mất.

## Khi nào nên dùng Message Broker?

✅ **Phù hợp:**
- Operation dài hạn cần async (user không muốn chờ).
- Có traffic spike cần buffering.
- **Fanout pattern**: 1 event → nhiều consumer khác nhau xử lý.
- Muốn **decouple** service (không tight coupling).
- Áp dụng Event-Driven Architecture.
- Cần đảm bảo message không mất (Kafka, RabbitMQ persist).

❌ **Không phù hợp:**
- Cần response **NGAY LẬP TỨC** (real-time query — vd: search).
- Pattern request-response đơn giản.
- Khi **latency là critical** và mỗi ms đều quan trọng (trading system).
- Đơn vị đo bằng millisecond — broker thêm hop sẽ vượt budget.

## Tóm tắt bài 2

```text
Message Broker = Giao tiếp bất đồng bộ qua queue

Lợi ích:
├── Decouple service (sender không cần biết receiver)
├── Buffer traffic spike (đệm hấp thụ)
├── Cho phép pub/sub pattern (fan-out tới nhiều consumer)
└── Tăng fault tolerance (message không mất khi service down)

Trade-off:
└── Tăng latency so với gọi sync trực tiếp

Broker phổ biến: Kafka, RabbitMQ, AWS SQS/SNS, Redis Pub/Sub
```

Bài tiếp theo về **API Gateway** — một thành phần khác đứng giữa client và backend, giải quyết các vấn đề khác (auth, rate limit, routing).

---
**Bài kế tiếp**: [Bài 3 - API Gateway](03-api-gateway.md) →

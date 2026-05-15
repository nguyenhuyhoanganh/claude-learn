# Bài 2: Message Brokers

## Vấn đề với Synchronous Communication

Khi Service A gọi Service B trực tiếp (hoặc qua Load Balancer):

```
Service A ──────────(sync call)─────────> Service B
                                         [đang xử lý...]
Service A ◄──────(chờ response)─────────
```

**Hai vấn đề chính:**

### 1. Coupling và Long Operations

Ví dụ: Ticket Reservation System
```
Frontend Service → Ticket Reservation Service
                   [Reserve ticket via external API]
                   [Charge credit card]
                   [Send confirmation email]
                   [Print ticket]
                   ← ...có thể mất nhiều giây...
Frontend Service chờ toàn bộ thời gian!
```

Nếu Ticket Service crash giữa chừng → phải làm lại từ đầu.

### 2. Traffic Spike

```
Sale event: 10,000 users đặt hàng cùng lúc
→ Frontend Service OK (scale được)
→ Order Fulfillment Service BỊ OVERWHELMED
   (mỗi order cần nhiều operations tốn thời gian)
```

Không có "buffer" để hấp thụ spike.

## Message Broker là gì?

> **Message Broker** = Building block sử dụng queue để lưu messages giữa senders và receivers.

```
Sender → [Message Broker Queue] → Receiver
```

- **Sender**: Không chờ receiver xử lý xong — fire and forget
- **Queue**: Buffer messages, persist chúng
- **Receiver**: Xử lý messages theo pace của mình

**Lưu ý:** Message Broker là **internal** component — không expose externally như Load Balancer.

## Publish-Subscribe Pattern

```
Publishers                    Subscribers
[Service A] ──publish──> [Channel/Topic] ──subscribe──> [Service B]
[Service C] ──publish──>                 ──subscribe──> [Service D]
                                         ──subscribe──> [Service E]
```

**Ví dụ: Online Store**

```
Order Service ──publishes─> [orders channel]
                                │
                    ┌───────────┴──────────┐
                    ↓                      ↓
            [Analytics Service]   [Notification Service]
            (cập nhật dashboard)  (gửi push notification)
                                           │
                                           ↓
                                  [Review Service]
                                  (schedule review request)
```

→ Thêm subscriber mới **không cần sửa code Order Service**.

## Giải quyết hai vấn đề ban đầu

### Giải pháp 1: Long Operations → Async

```
User → Frontend → Broker: "đặt vé" → Response: "đang xử lý"
                               ↓
                      Ticket Service: reserve → charge → email
                               ↓
                           Broker → Notification: "vé đã đặt xong"
```

User nhận confirmation ngay lập tức, xử lý tiếp tục async.

### Giải pháp 2: Traffic Spike → Buffering

```
Sale event: 10,000 orders
Frontend → [Broker queue] → Fulfillment Service
                 ↑                    ↓
           Chứa 9,990 orders    Xử lý dần dần
           (buffer spike)       theo capacity
```

Orders không bị mất — xử lý sau khi sale xong.

## Quality Attributes từ Message Broker

| Quality | Cơ chế |
|---------|--------|
| **Fault Tolerance** | Messages không bị mất khi service down tạm thời |
| **Availability** | Services giao tiếp dù một bên unavailable |
| **Scalability** | Buffer spikes → không cần over-provision |
| **Latency (trade-off)** | Thêm indirection → tăng latency so với sync |

## Popular Message Brokers

| Broker | Use Case |
|--------|----------|
| **Apache Kafka** | High-throughput event streaming, log aggregation |
| **RabbitMQ** | General purpose, complex routing |
| **AWS SQS/SNS** | Cloud-native, managed service |
| **Redis Pub/Sub** | Simple, in-memory, low-latency |
| **Google Pub/Sub** | GCP managed, scalable |

## Khi nào dùng Message Broker?

✅ **Phù hợp:**
- Long-running operations cần async
- Traffic spikes cần buffering
- Fanout: một event → nhiều consumers
- Service decoupling (không muốn tight coupling)
- Event-driven architecture

❌ **Không phù hợp:**
- Cần response ngay lập tức (real-time query)
- Simple request-response patterns
- Khi latency là critical

## Tóm tắt

```
Message Broker = Queue-based async communication

Benefits:
├── Decouple services
├── Buffer traffic spikes
├── Enable pub/sub patterns
└── Improve fault tolerance

Trade-off:
└── Thêm latency so với direct communication

Popular: Kafka, RabbitMQ, AWS SQS/SNS
```

---
**Tiếp theo:** Bài 3 - API Gateway →

# Bài 4: Event-Driven Architecture

## Vấn đề với Direct Communication

Trong Microservices với direct calls:
```
Service A → calls → Service B
         → calls → Service C

Vấn đề:
- A phải biết B và C tồn tại
- A phải biết API của B và C
- A phải chờ B và C respond (synchronous coupling)
- B down → A gặp lỗi
```

## Event-Driven Architecture là gì?

> **Event-Driven Architecture (EDA)** = Services giao tiếp qua **events** (bất biến, thực tế xảy ra) thay vì direct API calls.

**Ba components:**
- **Event Emitters (Producers)**: Service sinh ra events
- **Event Channel (Message Broker)**: Transport events (Kafka, RabbitMQ)
- **Event Consumers**: Services subscribe và xử lý events

```
Trước (direct coupling):
Service A ──call──> Service B
Service A ──call──> Service C

Sau (event-driven):
Service A ──emit("order_placed")──> [Broker] ──subscribe──> Service B
                                             ──subscribe──> Service C
```

## Ví dụ: Banking System

**Setup ban đầu:**
```
Frontend → [orders channel] → Account Service
```

**Thêm Mobile Notifications (KHÔNG cần sửa Frontend hay Account Service):**
```
Frontend → [orders channel] → Account Service
                            → Mobile Notification Service (new!)
```

**Thêm Fraud Detection:**
```
Frontend → [orders channel] → Account Service
                            → Notification Service
                            → Fraud Detection Service (new!)
```

**Thêm Third-party integrations:**
```
Utility Companies ─┐
Payroll Service ───┼──> [deposits channel] → Account Service
                   │                       → Notification Service
```

→ **Mở rộng hệ thống mà KHÔNG sửa existing services!**

## Real-time Stream Analysis

EDA cho phép analyze events trong real-time:

```
Stream of transactions:
[LA Restaurant $50] [LA Gas Station $60] [TX Walmart $200] [LA Coffee $5]

Fraud Detection Service phân tích stream:
→ Phát hiện: TX transaction trong khi vừa có transactions ở LA
→ Physically impossible!
→ Flag as fraud → freeze account → notify user
```

## Event Sourcing Pattern

> Thay vì lưu current state, lưu **tất cả events** (append-only log).

```
Traditional DB:
account_balance = 1500

Event Sourcing:
Event 1: deposit(2000)     → balance: 2000
Event 2: withdrawal(300)   → balance: 1700
Event 3: deposit(100)      → balance: 1800
Event 4: withdrawal(300)   → balance: 1500

Current state = replay all events
```

**Lợi ích:**
- **Audit trail hoàn chỉnh**: Ai làm gì, khi nào
- **Time travel**: Reconstruct state tại bất kỳ điểm nào trong quá khứ
- **Undo/compensate**: Thêm compensating event thay vì modify existing
- **No lost data**: Events immutable → không bao giờ xóa

**Nhược điểm:**
- State lookup chậm hơn (cần replay)
- Giải pháp: **Snapshots** (định kỳ snapshot current state → replay từ snapshot gần nhất)

## CQRS Pattern (Command Query Responsibility Segregation)

**Vấn đề 1:** Database có cả reads và writes → contention → chậm.

**Vấn đề 2:** Join data từ multiple microservices databases khác nhau.

### Giải pháp CQRS

```
Write path (Commands):
Client → [Command Service] → Write-optimized DB
                         → Emit events → [Broker]

Read path (Queries):
                         [Broker] → [Query Service] → Read-optimized DB
Client → [Query Service] → Read-optimized DB
```

**Ví dụ thực tế: E-Commerce Product Search**

```
Product Service: {product_id, name, price, stock}
Review Service:  {review_id, product_id, rating, text}

Problem: User search cần cả product info + reviews
→ 2 DB calls → slow, complex join

CQRS Solution:
Product Service ──update event──> [Broker] ──> Product Search Service
Review Service  ──update event──> [Broker] ──┘

Product Search Service:
Materialized view = {product_id, name, price, avg_rating, review_count}
→ 1 fast query cho search results!
```

**Hai lợi ích của CQRS:**
1. **Separate read/write optimization**: Write DB cho consistency, Read DB cho speed
2. **Efficient cross-service joins**: Pre-joined materialized views

## Event-Driven Patterns Summary

| Pattern | Giải quyết vấn đề gì |
|---------|---------------------|
| **Pub/Sub** | Decoupling producers từ consumers |
| **Event Sourcing** | Audit trail, time travel, undo |
| **CQRS** | Read/write optimization, cross-service joins |
| **Saga** | Distributed transactions without 2PC |

## Quality Attributes của EDA

| Quality | Cơ chế |
|---------|--------|
| **Scalability** | Services không biết nhau → scale độc lập |
| **Extensibility** | Thêm subscriber mà không sửa producers |
| **Fault Tolerance** | Message broker buffer messages khi consumer down |
| **Real-time Analytics** | Analyze stream ngay khi events arrive |

**Trade-off:** Eventual consistency (consumers process async) — không phải immediate.

## Khi nào dùng EDA?

✅ **Phù hợp:**
- Loose coupling giữa services là priority
- Cần fanout (1 event → nhiều consumers)
- Async workflows (billing, notifications, fulfillment)
- Real-time analytics (fraud, metrics)
- Event sourcing (financial transactions, audit)

❌ **Không phù hợp:**
- Cần immediate response (synchronous request/response)
- Simple CRUD apps không cần async
- Khi eventual consistency không acceptable

## Tóm tắt

```
Event-Driven Architecture:

Components:
├── Producers: Emit events
├── Message Broker: Transport (Kafka, RabbitMQ)
└── Consumers: Subscribe & process

Key Patterns:
├── Pub/Sub: Decoupled fanout
├── Event Sourcing: Immutable event log as source of truth
└── CQRS: Separate read/write services + materialized views

Benefits:
├── Loose coupling (services don't know each other)
├── Easy to extend (add consumers without changing producers)
├── Fault tolerance (broker buffers messages)
└── Real-time stream processing
```

---
**Tiếp theo:** Bài 5 - Event Stream Processing →

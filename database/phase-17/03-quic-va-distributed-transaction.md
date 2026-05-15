# Bài 3: QUIC Protocol cho Database và Distributed Transaction

## Phần 1: QUIC - Giao thức tương lai cho Database?

### Vấn đề hiện tại: Database dùng TCP thuần

```
Kiến trúc hiện tại:
  Client → TCP connection → Database (Postgres/MySQL/Redis)

  Mỗi database có protocol riêng trên TCP:
    - Postgres: wire protocol
    - MySQL: MySQL protocol
    - Redis: RESP (Redis Serialization Protocol)

  Không có universal protocol như REST/gRPC cho web
```

### Vấn đề 1: Một TCP connection cho nhiều users

```
VẤN ĐỀ:
  Web Server (Node.js) ←→ Database (1 connection)
         ↑↑↑
  Nhiều users cùng lúc

  User A: "GET my photos"  ─┐
  User B: "GET my photos"  ─┼→ Cùng 1 TCP connection → NGUY HIỂM!
  User C: "POST new data"  ─┘

  Problem: Không biết response nào là của user nào!
    → Response của User A có thể trả về cho User B
    → Race condition trong việc đọc response
```

### Giải pháp hiện tại: Connection Pooling

```
Connection Pool (20 connections):
  [conn1] [conn2] [conn3] ... [conn20]

  User A arrives:
    1. Reserve conn3
    2. Execute query
    3. Return conn3 to pool

  Nhược điểm:
    ❌ Memory: 20 connections × metadata = RAM tốn
    ❌ Round trip: mỗi request mở/đóng từ pool
    ❌ Scale: 1000 users → cần nhiều connections
```

### HTTP/2 giải quyết vấn đề tương tự cho Web

```
HTTP/1.1 (giống TCP database):
  Request 1 → [đợi response 1] → Request 2 → ...
  Head-of-line blocking!

HTTP/2:
  Stream ID 1: Request A → Response A
  Stream ID 2: Request B → Response B  (parallel!)
  Stream ID 3: Request C → Response C

  Trick: mỗi request có Stream ID riêng → biết response nào là của ai
```

### QUIC: HTTP/2 ở tầng thấp hơn

```
TCP vấn đề với HTTP/2:
  Stream 1: [OK] [OK] [BAD PACKET] [WAIT...]
  Stream 2: [OK] [OK] [WAIT...] ← phải chờ dù không liên quan!
  → Head-of-line blocking ở tầng TCP!

QUIC (UDP-based) giải pháp:
  Stream 1: [OK] [OK] [RETRY stream 1 only] ← chỉ retry stream bị lỗi
  Stream 2: [OK] [OK] [OK] → tiếp tục bình thường
  Stream 3: [OK] [OK] [OK] → tiếp tục bình thường

  Mỗi stream HOÀN TOÀN ĐỘC LẬP!
```

### QUIC cho Database - Tương lai?

```
Nếu Database dùng QUIC:
  Web Server ←─ 1 QUIC connection ─→ Database
                   │
                   ├── Stream 1: User A query
                   ├── Stream 2: User B query
                   └── Stream 3: User C query

  Lợi ích:
    ✅ 1 connection phục vụ triệu users (không cần pool!)
    ✅ Không head-of-line blocking
    ✅ Tiết kiệm memory
    ✅ Giảm round trip

  Thách thức:
    ❌ UDP bị internet hạn chế
    ❌ Congestion control trên UDP phức tạp
    ❌ Database community bảo thủ với HTTP headers
    ❌ Chưa database nào implement QUIC
```

---

## Phần 2: Distributed Transaction

### Giao dịch đơn giản: Monolith

```
Ứng dụng Amazon (1 service, 1 database):

  User clicks "Buy"
      ↓
  Web Server (1 process)
      ↓
  BEGIN TRANSACTION
    INSERT order (order_id=123, user_id=456)
    INSERT order_items (order_id=123, item=laptop)
    INSERT payment (order_id=123, amount=1000$)
    UPDATE order SET status='paid'
  COMMIT
      ↓
  Thành công → Email user

  Nếu payment FAIL:
    ROLLBACK → Không có gì được tạo
    → User nhận email "Payment failed"
```

### Vấn đề với Microservices

```
Microservices Architecture:

  User clicks "Buy"
       ↓
  API Gateway
  ┌────┬────┬────┐
  ↓    ↓    ↓    ↓
Order  Payment  Shipment  Email
Service Service  Service   Service
  │        │        │
Postgres MongoDB Cassandra
(riêng)  (riêng)  (riêng)

KHÔNG THỂ làm 1 ACID transaction qua 3 database khác nhau!
```

### Kịch bản thất bại điển hình

```
Bước 1: Order Service  → INSERT order → SUCCESS (committed!)
Bước 2: Payment Service → charge card → FAIL!

Vấn đề:
  - Order đã COMMIT → không thể rollback!
  - Database khác nhau → không có distributed rollback
  - User: "Tại sao có order mà không charge tiền?"
  - Dev: "Phải viết 'compensating logic' để xóa order..."
```

### Giải pháp 1: Google Spanner - Atomic Clocks

```
Giải pháp của Google:
  Tất cả database servers có CÙNG thời gian (atomic clock)
  → Biết chính xác thứ tự các transaction
  → Có thể thực hiện distributed transaction thực sự

  Nhược điểm:
    ❌ Cực kỳ đắt (atomic clock hardware)
    ❌ Chỉ Google mới afford được
```

### Giải pháp 2: Compensating Edits (Saga Pattern)

```
Saga = Chuỗi transactions với rollback logic ngược lại

Bình thường:
  T1: Create Order  → Success
  T2: Charge Card   → Success
  T3: Create Ship   → Success

Nếu T2 fail:
  Compensate T1: DELETE order  ← phải tự viết!
  (Không có automatic rollback)

Code phức tạp:
  if payment_fail:
    order_service.delete_order(order_id)  # compensate
    email_service.send_failure_email()
    shipment_service.cancel_if_started()
  
  Nhược điểm:
    ❌ Rất nhiều code
    ❌ Dễ có bug
    ❌ Nếu compensating action cũng fail?
```

### Giải pháp 3: Event-Driven / Saga với Message Queue

```
Event-Driven Saga:

  Order Service → [Kafka: "order.created"] → Payment Service
                                                   ↓
                         ┌─ SUCCESS → [Kafka: "payment.success"] → Shipment
                         └─ FAIL    → [Kafka: "payment.failed"]  → Order Service
                                                                      ↓
                                                               Delete order
                                                               (compensate)

  Lợi ích:
    ✅ Decoupled - services không phụ thuộc nhau
    ✅ Retry tự động nếu service down
    ✅ Audit trail qua Kafka logs

  Nhược điểm:
    ❌ Eventual consistency (không immediate)
    ❌ Debug phức tạp
    ❌ Phải manage Kafka cluster
```

### Giải pháp 4: Quay về Monolith (Mini-Monolith)

```
Thực tế: Không phải mọi thứ đều cần microservices

Mini-Monolith:
  ┌─────────────────────────────┐
  │  OrderPaymentService        │
  │  (Order + Payment + Ship)   │ ← 1 database, ACID transactions!
  └─────────────────────────────┘
  ┌──────────┐  ┌──────────┐
  │  Cart    │  │  Search  │  ← Services riêng (không cần transaction)
  │ Service  │  │ Service  │
  └──────────┘  └──────────┘

  Chỉ tách service khi THỰC SỰ cần scale riêng
  Không tách vì "microservices là modern"
```

### So sánh các giải pháp

```
┌─────────────────┬──────────┬──────────┬────────────┐
│ Giải pháp       │ Độ phức  │ Hiệu     │ Chi phí    │
│                 │ tạp      │ suất     │            │
├─────────────────┼──────────┼──────────┼────────────┤
│ Atomic Clocks   │ Cao      │ Tốt      │ Rất đắt   │
│ Compensating    │ Rất cao  │ OK       │ Dev time   │
│ Event-Driven    │ Cao      │ Tốt      │ Kafka infra│
│ Mini-Monolith   │ Thấp     │ Tốt nhất │ Rẻ nhất   │
└─────────────────┴──────────┴──────────┴────────────┘

Lời khuyên: Trước khi chọn distributed transaction,
hỏi "Tại sao không dùng 1 database?"
```

### Khi nào THỰC SỰ cần Distributed Transaction?

```
CẦN khi:
  ✅ Scale thực sự đòi hỏi (Twitter, Amazon)
  ✅ Teams độc lập với tech stack khác nhau
  ✅ SLA/compliance khác nhau cho từng service

KHÔNG CẦN khi:
  ❌ Startup nhỏ < 1M users
  ❌ 1 team viết tất cả
  ❌ "Microservices sounds cool"
  ❌ Chưa profile bottleneck thực sự
```

# Bài 1: Database-per-Service Pattern

## Tại sao cần học pattern này?

Trước khi đi vào các pattern phức tạp như CQRS, Saga, Event Sourcing — bạn cần hiểu **tại sao** các pattern đó ra đời. Câu trả lời nằm ở đây: **Database-per-Service Pattern**.

Đây là pattern là "thủ phạm" buộc các microservice developer phải học các event-driven patterns. Hiểu rõ nó, bạn sẽ hiểu toàn bộ vì sao khóa học này tồn tại.

---

## Database-per-Service là gì?

Trong kiến trúc microservices, mỗi service sở hữu **database riêng của mình**. Không chia sẻ database với service khác.

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Customer        │    │  Order           │    │  Product         │
│  Service         │    │  Service         │    │  Service         │
├──────────────────┤    ├──────────────────┤    ├──────────────────┤
│  Customer DB     │    │  Order DB        │    │  Product DB      │
│  (MySQL)         │    │  (PostgreSQL)    │    │  (MongoDB)       │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

99% dự án microservices thực tế đều áp dụng pattern này. Nó không phải là lựa chọn — gần như là **bắt buộc** nếu bạn muốn tận dụng được lợi thế của microservices.

---

## Lợi ích

### 1. Loose Coupling (Kết nối lỏng)
Mỗi team phát triển và deploy service độc lập mà không cần lo ảnh hưởng đến service khác. Đây là mục tiêu cốt lõi của microservices.

### 2. Independent Scaling (Scale độc lập)
Trong e-commerce: Order service xử lý lượng data khổng lồ, Product service vừa phải, Customer service ít hơn. Với database riêng, từng service scale database theo đúng nhu cầu của mình — không lãng phí tài nguyên.

### 3. Faster Development (Phát triển nhanh hơn)
Team A thay đổi schema của Customer DB không cần hỏi ý kiến Team B hay Team C. Không có điểm tập trung gây nghẽn trong quá trình phát triển.

### 4. Resilience & Fault Tolerance (Chịu lỗi tốt)
Customer DB bị down → Order service và Product service vẫn chạy bình thường. Không có single point of failure ở tầng database.

### 5. Technology Freedom (Tự do chọn công nghệ)
- Product service lưu nhiều ảnh → dùng MongoDB (NoSQL)
- Order service cần ACID transactions → dùng PostgreSQL
- Customer service read nhiều → dùng Redis cache

Mỗi team chọn công nghệ phù hợp nhất với bài toán của mình.

### 6. Security (Bảo mật)
Muốn đọc data của Order service? Phải gọi API của Order service — không thể truy cập trực tiếp vào database. Authentication/Authorization luôn được enforce.

---

## Thách thức — Lý do ra đời của CQRS, Saga, Event Sourcing

Đây là phần quan trọng nhất. Database-per-Service mang lại nhiều lợi ích, nhưng đồng thời tạo ra **4 thách thức nghiêm trọng**:

```
Database-per-Service
         │
         ▼
┌────────────────────────────────────────────┐
│  1. Cross-Service Queries                  │
│  2. Data Consistency                       │
│  3. Complex Transactions                   │
│  4. Data Duplication                       │
└────────────────────────────────────────────┘
         │
         ▼
  → Cần các Event-Driven Patterns!
```

### Thách thức 1: Cross-Service Queries
Trong monolith: JOIN 4 tables trong 1 database — đơn giản.

Trong microservices: Data của customer ở DB1, accounts ở DB2, loans ở DB3, cards ở DB4. Muốn hiển thị dashboard tổng hợp → không thể JOIN!

**Giải pháp:** API Composition Pattern (ngắn hạn) hoặc CQRS Pattern (dài hạn, enterprise)

### Thách thức 2: Data Consistency
Khi update data liên quan đến nhiều service, làm sao đảm bảo tất cả cùng nhất quán? Ví dụ: Đổi số điện thoại của customer — cần update ở 4 service khác nhau.

### Thách thức 3: Complex Transactions
Trong monolith: 1 database transaction bao gồm tất cả → rollback dễ dàng nếu lỗi.

Trong microservices: Transaction trải rộng qua nhiều database → **Distributed Transaction** — rollback cực kỳ phức tạp.

**Giải pháp:** Saga Pattern (Choreography hoặc Orchestration)

### Thách thức 4: Data Duplication
Đôi khi cần lưu một phần data ở nhiều service để tránh gọi API chéo quá nhiều → dẫn đến data bị duplicate và khó đồng bộ.

---

## Tóm tắt

| Khía cạnh | Monolith | Microservices (Database-per-Service) |
|---|---|---|
| Database | 1 chung | Mỗi service 1 database |
| JOIN query | Dễ | Không thể trực tiếp |
| Transaction | ACID đơn giản | Distributed Transaction phức tạp |
| Scale | Scale toàn bộ | Scale từng service |
| Team independence | Thấp | Cao |

---

> **Điểm mấu chốt:** Database-per-Service là pattern không thể tránh khỏi trong microservices. Các thách thức nó tạo ra chính là lý do tồn tại của CQRS, Event Sourcing, Saga, Materialized View, và Transactional Outbox — toàn bộ nội dung của khóa học này.

**Tiếp theo:** Cross-Service Queries và API Composition Pattern →

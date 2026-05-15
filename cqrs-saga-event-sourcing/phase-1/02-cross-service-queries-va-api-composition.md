# Bài 2: Cross-Service Queries và API Composition Pattern

## Vấn đề: Cross-Service Queries

Hãy lấy ví dụ ứng dụng ngân hàng với 4 microservices:

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  Customer    │  │  Accounts    │  │  Loans       │  │  Cards       │
│  Service     │  │  Service     │  │  Service     │  │  Service     │
│  ─────────── │  │  ─────────── │  │  ─────────── │  │  ─────────── │
│  Customer DB │  │  Account DB  │  │  Loans DB    │  │  Cards DB    │
└──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘
```

UI cần hiển thị **Profile Page** với:
- Tên, email, ảnh → từ Customer Service
- Số dư tài khoản → từ Accounts Service
- Tóm tắt khoản vay → từ Loans Service
- Tóm tắt thẻ tín dụng → từ Cards Service

**Trong monolith:** `SELECT c.*, a.balance, l.loan_summary, cd.card_summary FROM customers c JOIN accounts a JOIN loans l JOIN cards cd WHERE c.id = ?` — một câu SQL, xong.

**Trong microservices:** Data nằm ở 4 database khác nhau, không thể JOIN. Đây là **Cross-Service Query Problem**.

---

## Giải pháp: API Composition Pattern

### Nguyên lý hoạt động

Có một component đóng vai trò **API Composer** — nhận request từ client, gọi lần lượt (hoặc song song) các service liên quan, tổng hợp kết quả, trả về client.

```
Client
  │
  ▼
API Composer ──► Customer Service ──► Customer DB
  │         ──► Accounts Service ──► Account DB
  │         ──► Loans Service    ──► Loans DB
  │         ──► Cards Service    ──► Cards DB
  │
  ▼
Aggregated Response → Client
```

### 3 lựa chọn cho API Composer

| Lựa chọn | Mô tả | Khuyến nghị |
|---|---|---|
| **Client** | UI tự gọi từng service và tổng hợp | ❌ Không an toàn (expose endpoint) |
| **API Gateway** | Gateway đóng vai trò composer | ✅ Khuyến nghị nhất |
| **Existing Service** | Một service gọi các service khác | ⚠️ Phụ thuộc vào ngữ cảnh |

**Tại sao API Gateway là lựa chọn tốt nhất?**
- Client không biết internal endpoints — bảo mật tốt hơn
- Spring Cloud Gateway xây dựng trên Reactive Programming → gọi song song với ít thread và ít memory
- Đây được gọi là **Gateway Aggregator Pattern** hoặc **Gateway Composition Pattern**

### Triển khai với Spring Cloud Gateway

```
┌─────────────────────────────────────────────┐
│           Spring Cloud Gateway              │
│         (API Composer/Aggregator)           │
│                                             │
│  /api/customers/{id}/summary                │
│     ├── GET /customer/{id}  [parallel]      │
│     ├── GET /accounts/{id}  [parallel]      │
│     ├── GET /loans/{id}     [parallel]      │
│     └── GET /cards/{id}     [parallel]      │
└─────────────────────────────────────────────┘
```

Nhờ Reactive Programming (WebFlux), các lời gọi này được thực hiện **song song** — giảm latency đáng kể so với gọi tuần tự.

---

## Nhược điểm của API Composition Pattern

Pattern này không phải silver bullet. Hiểu rõ nhược điểm để quyết định khi nào nên dùng:

### 1. Increased Latency (Tăng độ trễ)
Dù gọi song song, vẫn phải chờ service chậm nhất. Càng nhiều service gọi → latency càng tăng.

### 2. Complex Composition Logic
Client muốn data ở format khác? Cần viết transformation logic phức tạp bên trong API Composer.

### 3. Error Handling Phức tạp
- Service A timeout → retry hay bỏ qua?
- Service B trả lỗi 500 → trả partial response hay fail toàn bộ?
- Cần xây dựng circuit breaker, retry logic cẩn thận.

### 4. Data Consistency
4 service cùng lưu số điện thoại của customer → customer update SĐT → Có thể service này đã update, service kia chưa → data không đồng nhất tại thời điểm query.

### 5. Limited Scalability
API Composer có thể trở thành bottleneck. Dù có scale 100 instances của các provider service, nếu Composer bị quá tải → toàn bộ bị ảnh hưởng.

### 6. Dependency on Service Availability
Muốn hiển thị Profile Page đầy đủ → phải có cả 4 service hoạt động. 1 service down → phải xử lý null/empty data.

---

## Khi nào dùng API Composition?

| Phù hợp | Không phù hợp |
|---|---|
| Dự án nhỏ, ít traffic | Enterprise với hàng triệu transactions |
| Đội nhỏ, cần ra sản phẩm nhanh | Yêu cầu high scalability |
| Không cần consistent real-time | Data consistency quan trọng |
| **Chỉ cho READ operations** | Write/update operations |

> **Quan trọng:** API Composition Pattern **chỉ** giải quyết READ operations. Không dùng cho insert/update/delete.

---

## So sánh API Composition vs CQRS

| Tiêu chí | API Composition | CQRS |
|---|---|---|
| Độ phức tạp | Thấp | Cao |
| Scalability | Trung bình | Cao |
| Performance | Trung bình (latency cao) | Cao (pre-computed views) |
| Data Consistency | Eventually consistent | Eventually consistent |
| Phù hợp | Dự án nhỏ/vừa | Enterprise, high-traffic |

---

> **Kết luận:** API Composition Pattern là giải pháp ngắn hạn, đơn giản. Với enterprise applications xử lý triệu transactions/ngày, **CQRS** là lựa chọn đúng đắn — sẽ được học ở Phase 2 và Phase 3.

**Tiếp theo:** Data Consistency, Distributed Transactions và các thách thức còn lại →

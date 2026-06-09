# Bài 2: Cross-Service Queries và API Composition Pattern

Một trang profile ngân hàng cần hiển thị tên, số dư tài khoản, tóm tắt khoản vay và thẻ tín dụng của khách hàng. Trong monolith, đó là một câu SQL `JOIN`. Trong microservices, bốn mảnh dữ liệu đó nằm ở bốn database tách rời — và bạn không thể JOIN qua mạng. Bài này giải quyết thách thức đầu tiên của Database-per-Service: **Cross-Service Queries**.

## Vấn đề: truy vấn xuyên service (Cross-Service Queries)

Hãy lấy ứng dụng ngân hàng với 4 microservice:

```text
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Customer    │ │  Accounts    │ │   Loans      │ │   Cards      │
│  Service     │ │  Service     │ │   Service    │ │   Service    │
│ ──────────── │ │ ──────────── │ │ ──────────── │ │ ──────────── │
│ Customer DB  │ │ Account DB   │ │  Loans DB    │ │  Cards DB    │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

UI cần hiển thị một trang **Profile** tổng hợp:

| Thông tin | Lấy từ service |
|---|---|
| Tên, email, ảnh đại diện | Customer Service |
| Số dư tài khoản | Accounts Service |
| Tóm tắt khoản vay | Loans Service |
| Tóm tắt thẻ tín dụng | Cards Service |

**Trong monolith** (một DB, nhiều bảng):

```sql
SELECT c.name, c.email, a.balance, l.loan_summary, cd.card_summary
FROM customers c
JOIN accounts a ON a.customer_id = c.id
JOIN loans    l ON l.customer_id = c.id
JOIN cards    cd ON cd.customer_id = c.id
WHERE c.id = ?;
```

Một câu, xong.

**Trong microservices**: 4 bảng = 4 database độc lập, deploy ở 4 nơi. `JOIN` cần các bảng nằm chung một engine — điều không có ở đây. Đây chính là **Cross-Service Query Problem**: bất cứ khi nào cần data từ nhiều service, bạn phải truy vấn nhiều DB do nhiều service sở hữu, và không có cơ chế JOIN sẵn.

Có **hai** cách xử lý: **API Composition Pattern** (đơn giản, bài này) và **CQRS Pattern** (nâng cao, Phase 2-3). Bài này tập trung vào cách thứ nhất.

## Giải pháp: API Composition Pattern

> **API Composition** = có một component đứng ra **gọi tất cả service liên quan**, **gom (compose/aggregate)** các phản hồi thành một response duy nhất rồi trả về cho client.

Hai vai trò trong pattern:

| Vai trò | Trách nhiệm |
|---|---|
| **API Composer** | Component "chủ trì". Nhận request từ client, gọi các provider service, gom data, trả response tổng hợp. |
| **Provider Service** | Service sở hữu một phần data mà query cần (ở đây: customer, accounts, loans, cards). |

```text
Client
  │  GET /customerSummary?mobileNumber=...
  ▼
┌─────────────── API Composer ───────────────┐
│   ├──► Customer Service ──► Customer DB     │  (gọi song song)
│   ├──► Accounts Service ──► Account DB      │
│   ├──► Loans Service    ──► Loans DB        │
│   └──► Cards Service    ──► Cards DB         │
│                                             │
│   gom 4 phản hồi → 1 object tổng hợp        │
└─────────────────────────────────────────────┘
  │  Aggregated Response (JSON)
  ▼
Client
```

> **Cảnh báo phạm vi áp dụng**: API Composition **chỉ** dùng cho thao tác **đọc / truy vấn (read/query)**. Tuyệt đối không dùng cho insert / update / delete xuyên service — với write phân tán, bạn cần Saga (Phase 5-6). Bản thân API Composition không thuộc nhóm event-driven; nó chỉ là một giải pháp đọc đơn giản.

## Ai đóng vai API Composer? Ba lựa chọn

| Lựa chọn | Cơ chế | Đánh giá |
|---|---|---|
| **1. Client tự compose** | UI (web/mobile) tự gọi từng service rồi gom data ở phía client | Không nên — lộ endpoint nội bộ của microservice ra ngoài, rủi ro bảo mật |
| **2. API Gateway** | Gateway (edge server) đóng vai composer | **Khuyến nghị** — client chỉ thấy một entry point duy nhất |
| **3. Một service đứng ra compose** | Một microservice (ví dụ Customer) gọi các service còn lại rồi gom | Chấp nhận được, nhưng service đó vừa lo nghiệp vụ vừa lo aggregation |

**Vì sao lựa chọn 2 (API Gateway) là tốt nhất?**

- Client **không bao giờ** biết endpoint nội bộ — luôn đi qua một **single entry point** (edge server). An toàn hơn hẳn lựa chọn 1.
- Trong hệ sinh thái Spring, gateway được xây bằng **Spring Cloud Gateway** — vốn dựa trên **reactive programming** (lập trình phản ứng, non-blocking). Nhờ đó nó gọi các service phụ thuộc **song song** với rất ít thread và ít bộ nhớ.

> Khi triển khai API Composition bằng API Gateway, người ta đặt cho nó cái tên riêng: **Gateway Aggregator Pattern** (hoặc **Gateway Composition Pattern**).

Về lựa chọn 3: client gọi thẳng `GET /customer/{id}/summary` của Customer Service; chính Customer Service sẽ gọi accounts/loans/cards rồi gom. Lúc này gateway không phải composer — một microservice mới là composer.

```text
Lựa chọn 2 (khuyến nghị):

Client ──► Spring Cloud Gateway (edge server + composer)
                │
                ├──► Customer Service
                ├──► Accounts Service   } gọi PARALLEL bằng reactive
                ├──► Loans Service
                └──► Cards Service
```

## Mặt trái — bảy nhược điểm cần biết

API Composition không phải "viên đạn bạc". Hiểu nhược điểm để quyết định đúng:

| # | Nhược điểm | Giải thích |
|---|---|---|
| 1 | **Tăng độ trễ (Increased Latency)** | Dù gọi song song, vẫn phải chờ service chậm nhất. Càng nhiều service → latency tích lũy càng cao. |
| 2 | **Logic compose phức tạp** | Client muốn data ở format khác → phải viết logic transform/convert phức tạp trong composer. |
| 3 | **Error handling khó** | Service A timeout, B trả 500, C trả chậm → retry hay bỏ qua? Trả partial hay fail toàn bộ? Cần circuit breaker + retry. |
| 4 | **Data consistency** | Cùng một số điện thoại lưu rải rác ở 4 service; lúc query có thể chỗ đã update, chỗ chưa → kết quả lệch nhau. |
| 5 | **Khả năng scale hạn chế** | Composer là entry point chung → dễ thành bottleneck dù provider service đã scale nhiều instance. |
| 6 | **Phụ thuộc tính sẵn sàng của service** | Cần đủ 4 service sống mới có profile đầy đủ; một service down → phải xử lý null/empty. |
| 7 | **Khó test** | Test một luồng gọi nhiều service phụ thuộc lẫn nhau phức tạp hơn test một service đơn. |

## Khi nào dùng, khi nào không

| Phù hợp | Không phù hợp |
|---|---|
| Dự án nhỏ / vừa, ít traffic | Enterprise, hàng triệu transaction/ngày |
| Đội nhỏ, cần ra mắt nhanh | Yêu cầu khả năng scale cao |
| Chấp nhận eventual consistency cho read | Cần consistency real-time gắt gao |
| **Chỉ READ operations** | Write / update / delete xuyên service |

> **Nguyên tắc**: API Composition là giải pháp **ngắn hạn, đơn giản, chỉ-đọc**. Với enterprise xử lý triệu transaction/ngày, hãy dùng **CQRS** (Phase 2-3). Đừng cố nong API Composition cho hệ thống lớn.

## API Composition vs CQRS — chọn cái nào

| Tiêu chí | API Composition | CQRS |
|---|---|---|
| Độ phức tạp triển khai | Thấp | Cao |
| Khả năng scale | Trung bình | Cao |
| Performance đọc | Trung bình (latency tích lũy do gọi runtime) | Cao (đọc từ view dựng sẵn — pre-computed) |
| Data consistency | Eventual | Eventual |
| Phù hợp với | Dự án nhỏ/vừa | Enterprise, high-traffic |

Khác biệt cốt lõi: API Composition gom data **tại thời điểm có request** (đắt, lặp lại mỗi lần); CQRS **dựng sẵn một read model** và đọc thẳng từ đó (rẻ khi đọc, nhưng phải duy trì model). Ta sẽ hiểu rõ ở Phase 2.

## Tóm tắt bài 2

- **Cross-Service Queries**: thách thức #1 của Database-per-Service — không JOIN được data nằm ở nhiều DB.
- **API Composition Pattern**: một **API Composer** gọi nhiều **provider service**, gom phản hồi thành một response.
- Ba lựa chọn cho composer; **API Gateway** (Spring Cloud Gateway) là tốt nhất → gọi này còn gọi là **Gateway Aggregator Pattern**.
- Chỉ dùng cho **READ**, dự án nhỏ/vừa. Bảy nhược điểm: latency, logic phức tạp, error handling, data consistency, bottleneck, phụ thuộc availability, khó test.
- Enterprise high-traffic → dùng **CQRS** thay thế.

**Bài kế tiếp** → [Bài 3: Dựng dự án — 4 microservice, BOM và common module](03-setup-microservices-bom-common.md)

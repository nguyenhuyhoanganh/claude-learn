# Bài 1: Database-per-Service — pattern "thủ phạm" sinh ra cả khóa học

Tại sao không ai dùng CQRS, Saga, Event Sourcing trong một ứng dụng monolith? Bạn đã bao giờ thấy một web app truyền thống cần đến Saga chưa? Gần như không bao giờ. Các pattern nâng cao này **chỉ** xuất hiện trong môi trường microservices. Lý do nằm ở một quyết định kiến trúc duy nhất — và nó là "thủ phạm" buộc developer microservices phải học toàn bộ những pattern còn lại trong khóa này.

Quyết định đó là **Database-per-Service**. Hiểu thật rõ nó, bạn sẽ hiểu vì sao cả khóa học này tồn tại.

## Database-per-Service pattern là gì?

> **Database-per-Service** = mỗi microservice **sở hữu database riêng của mình**, không service nào được truy cập trực tiếp vào database của service khác.

Tên gọi đã tự giải thích. Hãy lấy một ứng dụng e-commerce với 3 microservice:

```text
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Customer Service │   │  Order Service   │   │ Product Service  │
│  (business logic)│   │ (business logic) │   │ (business logic) │
├──────────────────┤   ├──────────────────┤   ├──────────────────┤
│  Customer DB     │   │   Order DB       │   │  Product DB      │
│  (MySQL)         │   │ (PostgreSQL)     │   │  (MongoDB)       │
└──────────────────┘   └──────────────────┘   └──────────────────┘
        ▲                       ▲                       ▲
        └── chỉ Customer        └── chỉ Order           └── chỉ Product
            Service được chạm       Service được chạm       Service được chạm
```

Mỗi service có **business logic** (logic nghiệp vụ) riêng — do các team khác nhau phát triển độc lập, đúng tinh thần microservices. Và quan trọng nhất: phía sau mỗi service là một **database độc lập**.

> **Lưu ý về thực tế**: ~99% dự án microservices áp dụng pattern này. Có một số ít trường hợp dùng **shared database** (database dùng chung), nhưng kể cả khi đó, người ta cũng không dùng *một* database cho *tất cả* service. Ví dụ 10 service: có thể 3 service dùng chung một DB, 7 service còn lại mỗi cái một DB. Database-per-Service gần như là mặc định.

## Sáu lợi ích — vì sao ai cũng chọn pattern này

### 1. Kết nối lỏng (Loose Coupling)

Mục tiêu cốt lõi của microservices là **loose coupling** — giảm phụ thuộc giữa các thành phần nghiệp vụ. Khi mỗi service có DB riêng, team được tự do **phát triển và deploy độc lập**, không phải lo ảnh hưởng tới các thành phần khác.

### 2. Scale độc lập (Independent Scaling)

Câu hỏi: trong e-commerce, 3 service customer / product / order có cùng lượng dữ liệu không? Chắc chắn không.

```text
Order Service    → khối lượng GIAO DỊCH khổng lồ (đặt hàng là hành động thường xuyên nhất)
Product Service  → lượng data trung bình
Customer Service → lượng data ít nhất
```

Với DB riêng, Order Service có thể scale **chỉ database của mình** để đáp ứng tải, mà không động đến hai service kia. Nếu dùng chung một DB, quyết định "khi nào scale up / scale down" trở nên cực kỳ rối — vì phải cân nhắc nhu cầu của cả ba.

### 3. Phát triển nhanh hơn (Faster Development)

Mỗi service một DB → team đổi schema của Customer DB **không cần xin phép** team Order hay Product. Ngược lại, nếu dùng shared DB, bất kỳ thay đổi schema nào cũng buộc phải họp và đồng thuận với tất cả team dùng chung DB đó — một điểm nghẽn (bottleneck) lớn.

### 4. Chịu lỗi & cách ly sự cố (Resilience & Fault Tolerance)

Customer DB down → Order Service và Product Service vẫn chạy bình thường. Không có **single point of failure** (điểm hỏng làm sập cả hệ thống) ở tầng database.

### 5. Tự do chọn công nghệ (Technology Freedom)

Vì DB tách rời, mỗi team chọn loại DB phù hợp nhất với dữ liệu *và* loại thao tác của mình:

| Service | Đặc tính dữ liệu / thao tác | Lựa chọn DB hợp lý |
|---|---|---|
| Product | Lưu nhiều ảnh, schema linh hoạt | NoSQL (MongoDB) |
| Order | Cần ACID, transaction chặt | RDBMS (PostgreSQL, Oracle) |
| Customer | Đọc nhiều hơn ghi | DB tối ưu read, hoặc thêm cache |

Không chỉ chọn theo *kiểu* dữ liệu (SQL/NoSQL), mà còn theo *kiểu thao tác*: service đọc nhiều → chọn DB tối ưu read; service ghi nhiều → chọn DB tối ưu write.

### 6. Ngăn truy cập trái phép (Security)

Customer Service muốn đọc dữ liệu order? Nó **không thể** đọc trực tiếp từ Order DB — bắt buộc gọi API mà Order Service cung cấp. Nhờ đó luôn có một lớp **authentication / authorization** (xác thực / phân quyền) được áp dụng khi một service đọc dữ liệu của service khác. Shared DB thì ai có connection string là đọc thẳng được — không có rào chắn này.

## Mặt trái — bốn thách thức nghiêm trọng

Đến đây bạn có thể nghĩ: "pattern tuyệt vời, sao lại có ai muốn né nó?". Đừng vội. Database-per-Service mang lại nhiều lợi ích, nhưng **đồng thời** đẻ ra bốn thách thức nghiêm trọng — và chính bốn thách thức này là lý do tồn tại của mọi pattern còn lại trong khóa học.

```text
                 Database-per-Service
                         │
        ┌────────────────┼────────────────┬─────────────────┐
        ▼                ▼                 ▼                 ▼
┌───────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 1. Cross-     │ │ 2. Data      │ │ 3. Complex   │ │ 4. Data      │
│  Service      │ │  Consistency │ │  Transactions│ │  Duplication │
│  Queries      │ │              │ │ (distributed)│ │              │
└───────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
        │                │                 │                 │
        ▼                ▼                 ▼                 ▼
  API Composition    Saga Pattern    Saga Pattern    Event-Driven
  / CQRS                                              Architecture
```

| # | Thách thức | Bản chất | Sẽ giải bằng |
|---|---|---|---|
| 1 | **Cross-Service Queries** (truy vấn xuyên service) | Không thể JOIN data nằm ở nhiều DB | API Composition / CQRS |
| 2 | **Data Consistency** (nhất quán dữ liệu) | Ghi vào nhiều DB, làm sao đảm bảo "all-or-nothing" | Saga |
| 3 | **Complex Transactions** (giao dịch phân tán) | Một transaction trải qua nhiều DB → rollback rất khó | Saga |
| 4 | **Data Duplication** (trùng lặp dữ liệu) | Copy data sang nhiều service để tránh gọi API chéo → phải đồng bộ | Event-Driven |

Bài này chỉ giới thiệu nhanh; các bài sau đào sâu từng cái.

### Thách thức 1: Cross-Service Queries — bản xem trước

Monolith: data customer, accounts, loans, cards nằm trong **một** DB → `JOIN` 4 bảng là xong. Microservices: 4 bảng đó nằm ở 4 DB tách rời, deploy ở 4 nơi → **không thể JOIN**. (Bài 2 đào sâu + giải pháp.)

### Thách thức 2 & 3: Distributed Transactions — bản xem trước

Khi một thao tác ghi vào nhiều service (ví dụ: tạo order → trừ tiền → cập nhật kho), bạn có một **distributed transaction** (giao dịch phân tán). Nếu bước giữa chừng lỗi, dữ liệu rơi vào trạng thái nửa vời. Quản lý rollback / commit / exception trong môi trường này cực kỳ phức tạp. (Bài 5 đào sâu.)

### Thách thức 4: Data Duplication — bản xem trước

Đôi khi để tránh gọi API chéo quá nhiều, ta cố tình copy một phần data sang nhiều service → data bị trùng lặp và khó giữ đồng bộ. (Bài 5 đào sâu.)

## Monolith vs Microservices — bảng so sánh cốt lõi

| Khía cạnh | Monolith | Microservices (Database-per-Service) |
|---|---|---|
| Số database | 1 database chung | Mỗi service một database |
| JOIN nhiều entity | Dễ — một câu SQL | Không thể JOIN trực tiếp |
| Transaction nhiều bước | ACID đơn giản (`@Transactional`) | Distributed transaction phức tạp |
| Scale | Scale toàn bộ ứng dụng | Scale từng service độc lập |
| Độc lập giữa team | Thấp (đụng schema chung) | Cao (mỗi team một DB) |
| Tự do công nghệ DB | Một loại DB cho tất cả | Mỗi service chọn DB riêng |
| Single point of failure | DB chung = điểm hỏng chí mạng | Một DB hỏng không kéo sập service khác |

## Tóm tắt bài 1

- **Database-per-Service**: mỗi microservice sở hữu DB riêng, không ai chạm DB của ai → đây là pattern gần như bắt buộc (99% dự án).
- Sáu lợi ích: loose coupling, scale độc lập, dev nhanh, chịu lỗi, tự do công nghệ, bảo mật.
- Cái giá: bốn thách thức — cross-service queries, data consistency, complex transactions, data duplication.
- Bốn thách thức này **chính là lý do tồn tại** của API Composition, CQRS, Event Sourcing, Materialized View, Transactional Outbox và Saga — toàn bộ nội dung khóa học.
- Đây là trade-off nền tảng nhất của microservices: đổi lấy scalability + independence, bạn nhận lại độ phức tạp của distributed systems.

**Bài kế tiếp** → [Bài 2: Cross-Service Queries và API Composition Pattern](02-cross-service-queries-va-api-composition.md)

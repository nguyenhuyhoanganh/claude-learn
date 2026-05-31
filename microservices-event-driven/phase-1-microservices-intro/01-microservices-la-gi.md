# Bài 1: Microservices là gì? Vấn đề thực sự nó giải quyết

Bạn đang ở **công ty 5 dev** với 1 codebase Node.js. Tốc độ phát triển nhanh, vui vẻ. Sau 5 năm, công ty thành công, **200 dev** cùng code 1 repository. Mọi commit gây merge conflict. Mọi release ai cũng sợ. Mọi build mất 30 phút. Mọi bug lăm le knock-out 200 dev cùng lúc.

Đây là **scalability ceiling** của kiến trúc monolithic. Microservices sinh ra để vượt qua trần này.

## Microservices — định nghĩa chính xác

> **Microservices architecture** = kiến trúc **chia hệ thống thành tập service nhỏ, độc lập**, mỗi service:
> - Có **scope hẹp** (single business capability).
> - **Loosely coupled** với service khác.
> - **Independently deployed** (deploy không phụ thuộc service khác).
> - Thuộc **một team nhỏ** sở hữu trọn vẹn.

4 tính chất này là **bất biến**. Mất một cái = không phải microservices.

## Three-tier vs Microservices — bản đồ tư duy

Trước khi đào sâu, đặt microservices vào bản đồ lớn:

### Three-tier (monolithic)

```text
+──────────────────────────────────+
│  Presentation tier               │  ← Browser, mobile app, web client
│  (HTML/JS, React, iOS, Android)  │
+──────────────────────────────────+
            │ HTTP/REST
            ▼
+──────────────────────────────────+
│  Application tier (logic)        │  ← 1 codebase Java/Node/Python
│  - Auth                          │     1 process chạy mọi thứ
│  - Orders                        │
│  - Payments                      │
│  - Notifications                 │
│  - Admin                         │
+──────────────────────────────────+
            │ JDBC/SQL
            ▼
+──────────────────────────────────+
│  Data tier                       │  ← 1 database (Postgres/MySQL)
│  Postgres                        │
+──────────────────────────────────+
```

**1 codebase + 1 process + 1 database** = monolith. Đa số startup bắt đầu thế này — đúng và tốt.

### Microservices

```text
+──────────────+    +──────────────+    +──────────────+
│  Auth        │    │  Orders      │    │  Payments    │
│  service     │    │  service     │    │  service     │
│  (Go team A) │    │  (Java team B)│    │  (Node team C)│
│  → AuthDB    │    │  → OrderDB   │    │  → PayDB     │
+──────────────+    +──────────────+    +──────────────+
       ▲                  ▲                  ▲
       │                  │                  │
       └──────────┬───────┴─────────┬────────┘
                  │                 │
                  ▼                 ▼
          +──────────────+   +──────────────+
          │ Notifications│   │ Admin        │
          │ (Python D)   │   │ (Java E)     │
          │ → NotifDB    │   │ → AdminDB    │
          +──────────────+   +──────────────+
```

5 service × 5 team × 5 database × 5 process. Mỗi service có **runtime, codebase, deploy pipeline, schema, on-call rotation** riêng.

## Vì sao monolith đến lúc nào đó "vỡ trận"?

Monolith fail không vì code xấu, mà vì **2 trục scale** không scale được:

### 1. Organizational scalability (scale theo số người)

| Số dev | Vấn đề monolith |
|---|---|
| < 10 | Không vấn đề — nhanh, đơn giản, linh hoạt |
| 10-50 | Merge conflict xuất hiện thường xuyên |
| 50-200 | Release schedule thưa dần vì sợ break; meeting nhiều |
| 200+ | Diminishing return — thêm dev = giảm productivity cả nhóm |

Quy luật: **càng đông người cùng codebase, người sau càng làm chậm người trước**.

### 2. Technical scalability (scale theo lưu lượng)

Monolith deploy 1 instance = chạy **mọi thứ**: auth, orders, payments, ML inference, ...

| Vấn đề | Tác động |
|---|---|
| Heavy instance | Mỗi container ~2 GB RAM, không thể chạy trên commodity hardware rẻ |
| Tech lock-in | Quyết định stack 5 năm trước theo bạn vĩnh viễn |
| Refactor risk | Đổi 1 lib = sửa hàng trăm file, test cả hệ thống |
| Blast radius | 1 memory leak trong 1 module → kill toàn app |
| Resource skew | Auth gọi 10 req/s, search gọi 10k req/s — phải scale **cả hai** lên |

## Lý do microservices thắng (khi đúng điều kiện)

Microservices giải quyết 2 trục trên bằng cách **vật lý hoá ranh giới module**:

| Trục | Microservices fix |
|---|---|
| Team coordination | Mỗi service 1 team — team A đổi auth không cần xin phép team B |
| Codebase size | Code mỗi service nhỏ → IDE load nhanh, build nhanh, hiểu nhanh |
| Deploy independence | Team Payments deploy 5 lần/ngày không kéo theo team khác |
| Tech freedom | Search team chọn Elasticsearch + Go; Auth team chọn Postgres + Java |
| Resource efficiency | Scale chỉ service đang nóng (search × 100, auth × 2) |
| Blast radius | Bug trong notifications không kill orders |

## Câu chuyện ngành — "biết người biết ta"

Microservices không sinh ra trong vacuum. Nó là **kết tinh kinh nghiệm** của vài công ty bị buộc phải làm:

| Năm | Công ty | Sự kiện |
|---|---|---|
| ~2005 | Amazon | Bezos ban "API mandate" — mọi team expose data qua API, không share DB |
| ~2008 | Netflix | Bắt đầu migrate từ monolith Oracle sang cloud-native services |
| ~2011 | Twitter | "Fail Whale era" — monolith Ruby không scale, viết lại bằng Scala microservices |
| 2014 | James Lewis & Martin Fowler | Đặt tên chính thức "Microservices" trong bài blog kinh điển |
| 2015+ | Khắp ngành | K8s, Docker, service mesh boom — microservices trở thành "default" cho enterprise |
| 2020+ | Phản tỉnh | Nhiều công ty quay về modular monolith sau khi over-engineer microservices |

Bài học: microservices **không phải xu hướng**, mà là **phản ứng** với scale problem cụ thể.

## Event-Driven Architecture — người bạn của microservices

Trong khoá này, song song với microservices, bạn sẽ học **Event-Driven Architecture (EDA)**:

> **EDA** = service giao tiếp **bằng cách publish event** lên message broker (Kafka, RabbitMQ) thay vì gọi REST trực tiếp.

EDA **độc lập** với microservices — monolith vẫn có thể event-driven nội bộ. Nhưng khi kết hợp, hai cái tạo ra **decoupling cấp độ cao nhất**:

```text
Sync (REST):  Service A ─── HTTP call ───► Service B
              A phải biết B URL, B phải online, A đợi B trả về

Async (EDA):  Service A ──► Topic "order.placed" ◄── Service B subscribe
              A không biết B tồn tại; B đọc khi rảnh; A không đợi
```

EDA enable nhiều pattern mạnh: **Saga**, **CQRS**, **Event Sourcing** — phase 5 sẽ deep-dive.

## Khi nào KHÔNG nên microservices?

Microservices **không phải silver bullet**. Đừng dùng khi:

| Điều kiện | Lý do tránh |
|---|---|
| Team < 10 dev | Monolith đủ; overhead microservices cao hơn lợi |
| Domain chưa rõ | Vẽ sai boundary = sửa cực khổ; monolith dễ refactor hơn |
| Không có CI/CD mature | Deploy 10 service thủ công = thảm hoạ |
| Không có observability tốt | Debug distributed system không có log/trace = mò kim |
| Compliance không cho phép data fragmentation | 1 DB tập trung dễ audit hơn |
| Startup tìm product-market-fit | Speed > scalability lúc này |

> **Quote vàng**: "If you can't build a monolith, what makes you think you can build microservices?" — Simon Brown.

## Mental model — monolith và microservices là **bánh răng**

Như xe hộp số:
- **Số 1** (monolith): khởi động nhanh, đi chậm. Tốt cho 0→tốc độ thấp.
- **Số 4** (microservices): khởi động chậm, đi nhanh. Tốt cho tốc độ cao.

Không có chuyện "luôn dùng số 4". Cũng không có "số 1 lỗi thời". Cần **đúng số cho đúng tốc độ**.

Doanh nghiệp:
- 0-50 dev → monolith.
- 50-200 dev → **modular monolith** (monolith có boundary rõ trong code).
- 200+ dev hoặc product mature, traffic lớn → microservices.

## Tóm tắt bài 1

- **Microservices** = chia hệ thống thành service nhỏ, loosely coupled, independently deployed, owned by small team.
- Sinh ra để giải quyết **organizational scalability** (Conway's law) + **technical scalability** (resource, tech freedom).
- **Three-tier monolith** vẫn đúng với startup, team nhỏ — không "lỗi thời".
- **Event-Driven Architecture (EDA)** thường đi kèm microservices để decoupling mạnh hơn.
- Có **6+ điều kiện** KHÔNG nên microservices — biết để tránh distributed monolith.
- Tư duy đúng: monolith vs microservices = **bánh răng**, không phải tốt/xấu.

**Bài kế tiếp** → [Bài 2: Benefits và Challenges chi tiết — vì sao "distributed monolith" là cơn ác mộng](02-loi-ich-thach-thuc.md)

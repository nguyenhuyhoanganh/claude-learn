# Bài 1: CQRS — tách lệnh ghi và lệnh đọc thành hai thế giới

Phase 1 giải cross-service queries bằng API Composition, nhưng ta thừa nhận nó chỉ hợp dự án nhỏ — gọi 4 service ở runtime cho mỗi lần đọc là đắt. Với enterprise xử lý triệu giao dịch/ngày, cần một cách đọc rẻ hơn nhiều. Đó là **CQRS**. Phase 2 thuần lý thuyết (CQRS + Event Sourcing); Phase 3 mới code. Hãy hiểu thật chắc đã.

## CQRS là gì?

> **CQRS = Command Query Responsibility Segregation** = tách trách nhiệm xử lý **lệnh ghi (command)** và **lệnh đọc (query)** thành hai component riêng, thậm chí hai database riêng.

Mọi business logic bạn viết đều rơi vào đúng một trong hai nhóm:

| Nhóm | Bản chất | Thao tác |
|---|---|---|
| **Command** | Thay đổi / tạo / xóa dữ liệu | Insert, Update, Delete, Modify |
| **Query** | Chỉ đọc, không đụng vào dữ liệu | Select / read |

CQRS đề xuất hai việc:
1. Tách **API ghi** và **API đọc** thành hai component độc lập.
2. Dùng **database riêng** cho ghi và cho đọc.

```text
              ┌──────────── WRITE SIDE (Command) ───────────┐
 write req ──►│  Command Component → Write/Command Database  │
              └───────────────────┬──────────────────────────┘
                                  │ publish event
                                  ▼
                      ┌──────── Event Bus ────────┐
                      │   (Kafka / RabbitMQ)      │
                      └───────────┬───────────────┘
                                  │ consume event
              ┌──────────── READ SIDE (Query) ──────────────┐
 read  req ──►│  Query Component → Read Database (optimized) │
              └──────────────────────────────────────────────┘
```

Luồng:
1. Ai gọi API **thay đổi** data → **Command Component** xử lý → ghi vào **Write Database**.
2. Command Component **publish một event** lên **Event Bus**.
3. **Query Component** đọc event từ bus → cập nhật **Read Database**.
4. Ai gọi API **đọc** data → Query Component đọc thẳng từ **Read Database**.

## Hai database, làm sao đồng bộ? — Eventual Consistency

Hai DB tách rời thì phải có cơ chế đồng bộ. Đó là vai trò của **Event Bus** ở giữa: mỗi khi write DB đổi, command side phát event; query side nghe event và cập nhật read DB.

Đồng bộ này **không tức thì** — trễ vài nano/mili-giây đến vài giây. Cơ chế "rồi sẽ nhất quán, nhưng không ngay" gọi là **eventual consistency** (nhất quán cuối cùng).

```text
Write DB ──event──► Event Bus ──consume──► Read DB
  T=0               T=0+ε                  T=0+ε+δ   (vài ms)
```

> **Hệ quả thiết kế**: vì có eventual consistency, CQRS **chỉ triển khai tốt theo event-driven architecture** — chính Event Bus là lý do data đồng bộ kiểu "eventually". Về lý thuyết có thể làm CQRS **không** Event Bus (sync trực tiếp), nhưng không hiệu quả và kéo theo nhiều vấn đề; gần như không ai làm vậy.

## Vì sao tách hai database lại đáng giá?

### Mỗi bên một loại DB tối ưu riêng

| | Write Database | Read Database |
|---|---|---|
| Tối ưu cho | Ghi, consistency, toàn vẹn giao dịch | Đọc nhanh |
| Loại DB hợp lý | NoSQL / document store (MongoDB, EventStore) | RDBMS (PostgreSQL), cache (Redis), Elasticsearch |
| Hình dạng dữ liệu | Sự kiện / JSON document thô | Bảng dựng sẵn theo từng màn hình UI |

Ví dụ kinh điển: write side lưu JSON/document; nhưng client không muốn đọc JSON thô → **trong lúc** đẩy sang read side, ta viết logic transform để lưu ở dạng quan hệ phẳng, gọn → đọc cực đơn giản.

### Scale hai bên độc lập

Facebook, LinkedIn, Twitter đọc nhiều hơn ghi gấp bội. Với CQRS, bạn **chỉ scale read side** theo lượng đọc, không động đến write side. Một DB chung cho cả ghi lẫn đọc thì không có lựa chọn này — và sẽ nghẽn.

## CQRS giải cross-service queries "đẹp" hơn API Composition

Nhớ bài toán Profile Page (Phase 1): 4 service, muốn hiển thị tổng hợp.

**Với API Composition** — gọi runtime mỗi lần đọc:
```text
Gateway → Customer → Accounts → Loans → Cards   (4 network call MỖI request đọc)
          → latency cộng dồn, traffic nội bộ tăng vô ích
```

**Với CQRS** — dựng sẵn một read model:
```text
WRITE SIDE: Customer/Accounts/Loans/Cards mỗi service ghi DB riêng,
            rồi PUBLISH event ("customer X đổi", "account Y đổi"...)
                              │
                         Event Bus
                              │
READ SIDE:  Query Component nghe TẤT CẢ event
                              │
                              ▼
                     Read Database
                     ┌─────────────────────────────┐
                     │ customer_summary  (1 bảng     │
                     │ gộp sẵn customer+account+     │
                     │ loan+card cho đúng UI page)   │
                     └─────────────────────────────┘
                              │
            UI gọi fetchCustomerSummary → đọc 1 bảng, KHÔNG gọi 4 service
```

**Lợi thế cốt lõi**: **0 network call xuyên service tại runtime** cho thao tác đọc. Data đã được pre-compute và nằm sẵn trong read DB.

> **Query Component deploy ở đâu?** Tùy bạn — một component độc lập, hoặc nhúng vào một trong các service (customer/accounts/...). CQRS không bắt buộc nơi deploy; nó chỉ bắt buộc **tách trách nhiệm** ghi và đọc.

## Một read model cho mỗi nhu cầu — sức mạnh của projection

Trong ví dụ trên ta dựng **một** bảng cho **một** màn hình. Nhưng app thật có hàng trăm màn hình cần data từ nhiều service. CQRS cho phép dựng **100 read model (projection) cho 100 màn hình** — mỗi cái chỉ chứa đúng data màn hình đó cần, đọc cực nhanh, và **không** ảnh hưởng write side.

Ví dụ e-commerce: sau khi đặt hàng, UI muốn hiển thị tiến trình "đặt hàng → thanh toán → giao vận → nhận hàng". Với CQRS + Event Sourcing (bài sau), ta dựng một projection lịch sử sự kiện cho đúng màn hình này.

## Lợi ích và nhược điểm — quyết định có cơ sở

CQRS không phải viên đạn bạc. Cân nhắc cả hai mặt:

| Lợi ích | Giải thích |
|---|---|
| **Khả năng scale** | Scale write và read độc lập — sống còn với hệ xử lý triệu/tỷ bản ghi |
| **Mô hình dữ liệu tối ưu** | Write tối ưu consistency, read tối ưu tốc độ; mỗi bên một loại storage |
| **Linh hoạt** | Tạo bao nhiêu projection tùy ý, không đụng write side |
| **Cross-service query** | Đọc từ read model dựng sẵn, không gọi runtime |
| **Hợp với Event Sourcing** | Kết hợp cho audit trail + replay (bài sau) |

| Nhược điểm | Giải thích |
|---|---|
| **Tăng độ phức tạp** | Hai DB, hai component, phải duy trì đồng bộ → chỉ đáng cho hệ giao dịch lớn |
| **Eventual consistency** | Data trễ vài ms–vài s; **không** dùng được khi cần đọc thấy ngay kết quả vừa ghi |
| **Development overhead** | Phải tự viết logic tách command/query + đồng bộ DB |
| **Learning curve** | Đường cong học dốc; nên dùng framework (Axon) thay vì tự code từ đầu |

### Khi nào eventual consistency là cấm kỵ

| Chấp nhận eventual (dùng CQRS tốt) | Cần thấy-ngay (KHÔNG dùng CQRS, dùng sync) |
|---|---|
| Dashboard analytics | "Còn đủ tiền không?" ngay trước khi trừ |
| Danh sách sản phẩm | Số ghế trống khi đặt vé |
| Trang profile | Số lượng tồn kho cuối trước khi chốt đơn |
| Lịch sử thông báo | Xác nhận tức thì sau submit |

## Tóm tắt bài 1

- **CQRS** tách **command (ghi)** và **query (đọc)** thành hai component, hai database; đồng bộ qua **Event Bus** → **eventual consistency**.
- Lợi ích: scale độc lập, mỗi bên một DB tối ưu, dựng nhiều projection tùy ý, giải cross-service query mà **0 network call runtime**.
- Cái giá: phức tạp, eventual consistency, overhead, learning curve → chỉ đáng cho enterprise high-traffic; small app là over-engineering.
- CQRS triển khai tốt nhất theo **event-driven**; mạnh hơn nữa khi ghép **Event Sourcing** (bài sau).

**Bài kế tiếp** → [Bài 2: Event Sourcing — lưu lịch sử thay vì trạng thái](02-event-sourcing-pattern.md)

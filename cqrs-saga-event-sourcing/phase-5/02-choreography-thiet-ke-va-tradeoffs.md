# Bài 2: Lợi ích, nhược điểm và thiết kế Choreography Saga

Trước khi code, cần biết Saga đánh đổi gì (không phải viên đạn bạc), và thiết kế cụ thể ta sẽ xây: cho phép khách **đổi số điện thoại** và đồng bộ số mới qua cả 4 service ngân hàng — nếu một service lỗi thì **hoàn tác về số cũ ở mọi nơi**. Đây là một distributed transaction kinh điển.

## Lợi ích của Saga

| Lợi ích | Giải thích |
|---|---|
| **Data consistency** (lý do chính) | Giữ nhất quán xuyên service mà vẫn dùng DB-per-service; giải đúng bài toán distributed transaction |
| **Scalability** | Mỗi bước là transaction độc lập → scale riêng service nào tải cao, không đụng service khác |
| **Resiliency** | Compensation cho phép hệ hồi phục **uyển chuyển** khi lỗi; đảm bảo "hoặc tất cả, hoặc không gì" (combo: hoặc cả xe+phòng+vé, hoặc hủy hết) |
| **Flexibility** | Hai flavor (Choreography/Orchestration) — chọn theo stack: không dùng Axon → Choreography; đã có CQRS → Orchestration |

## Nhược điểm — phải biết trước

| Nhược điểm | Giải thích |
|---|---|
| **Complexity** | Khó nhất không phải business logic, mà là **điều phối** thứ tự compensation khi lỗi. Tốn công thiết kế |
| **Eventual consistency** | Saga thường làm trên event-driven (async); data đồng bộ **không tức thì** — trễ vài giây qua chuỗi service. Cần đọc thấy-ngay → Saga không hợp; client phải **poll** trạng thái |
| **Testing & debugging khó** | Transaction trải nhiều service; test/debug cả happy path lẫn compensation rất cực |

> Vì sao thường dùng event-driven (async)? Một business transaction qua 4-5 service có thể mất 20-40 giây. Bắt người dùng chờ ngần ấy là không chấp nhận được. Nên chỉ **trigger event ở service đầu**, các event kế tiếp chạy ngầm theo chuỗi; client **poll** để biết trạng thái tổng cuối cùng.

## Thiết kế: đổi số điện thoại xuyên 4 service

Nhắc lại quy tắc vàng (Phase 1): cùng một `mobileNumber` được dùng ở cả customer/accounts/cards/loans để gom data khách. Vậy khi khách **đổi số**, phải cập nhật số mới ở **cả bốn** — một distributed transaction.

```text
   PATCH /eazybank/customer/api/mobile-number  { currentMobileNumber, newMobileNumber }
        │
        ▼  T1
   Customer ── update mobileNumber ──► Customer DB
        │ event
        ▼  T2
   Accounts ── update mobileNumber ──► Accounts DB
        │ event
        ▼  T3
   Cards    ── update mobileNumber ──► Cards DB
        │ event
        ▼  T4
   Loans    ── update mobileNumber ──► Loans DB
        │ event "status: hoàn tất"
        ▼
   Customer (nghe status, biết toàn bộ Saga xong)
```

### Khi lỗi: chuỗi compensation ngược chiều

Giả sử lỗi ở **Loans (T4)**:

```text
   Loans ✗ lỗi → rollback Loans DB → kích hoạt C3
   C3 (Cards):  set lại số CŨ ở Cards DB    → kích hoạt C2
   C2 (Accounts): set lại số CŨ ở Accounts  → kích hoạt C1
   C1 (Customer): set lại số CŨ ở Customer
```

> Kết quả đảm bảo: **hoặc số mới ở cả 4 service, hoặc số cũ ở cả 4** — không bao giờ "nửa mới nửa cũ". `T` = transaction thường, `C` = compensation.

## Vì sao gọi là "Choreography"?

Trong choreography, **mọi** service đều "vào cuộc": customer biết sau T1 phải gọi T2; accounts biết sau T2 gọi T3; và khi lỗi, mỗi service biết phải gọi compensation của service **trước** nó.

```text
   Giống một màn MÚA TẬP THỂ (choreography):
   không có đạo diễn đứng chỉ; mỗi vũ công tự biết bước của mình
   và bước của người kế bên → cả nhóm khớp nhịp
```

Không có "nhạc trưởng" trung tâm — điều khiển **phân tán** khắp các service. Đó là lý do tên gọi.

## Stack hiện thực — không cần Axon

Vẻ đẹp của Choreography: **không** phụ thuộc framework như Axon. Chỉ cần async messaging:

| Thành phần | Vai trò |
|---|---|
| **Spring Cloud Stream** | Stream event tới message queue (RabbitMQ/Kafka) |
| **Spring Cloud Function** | Biến method Java thành "API" (function) được trigger bởi event — khỏi viết REST controller thủ công |
| **RabbitMQ** | Message broker (chọn vì dễ setup hơn Kafka; dùng Kafka cách làm tương tự) |

> Ta cố ý làm Choreography **không CQRS** để thấy: Saga *không bắt buộc* CQRS. Phase 3-4 đã dùng Axon/CQRS; ở đây dùng Spring Cloud Stream + Function + RabbitMQ thuần.

## So với combo du lịch (đối chiếu nhanh)

| Combo du lịch | Đổi số điện thoại (ta làm) |
|---|---|
| Car → Hotel → Flight | Customer → Accounts → Cards → Loans |
| reserveCar / cancelCar | updateMobileNumber / rollbackMobileNumber |
| Lỗi Flight → hủy Hotel, Car | Lỗi Loans → set số cũ ở Cards, Accounts, Customer |

## Tóm tắt bài 2

- Lợi ích Saga: **data consistency** (chính), scalability, resiliency (compensation), flexibility (2 flavor).
- Nhược điểm: complexity (điều phối compensation), eventual consistency (async → client phải poll), test/debug khó.
- Thiết kế: đổi `mobileNumber` qua T1→T4 (customer→accounts→cards→loans); lỗi → compensation C3→C1 ngược chiều set lại số cũ.
- "Choreography" = **múa tập thể**, điều khiển phân tán, mọi service tự biết bước kế/trước.
- Stack: **Spring Cloud Stream + Function + RabbitMQ** — không cần Axon/CQRS.

**Bài kế tiếp** → [Bài 3: Hiện thực Choreography Saga — happy path](03-choreography-implement-happy-path.md)

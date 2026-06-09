# Bài 11: Nhân bản sang accounts/cards/loans và các flavor CQRS + CDC

Customer đã CQRS + ES hoàn chỉnh. Bài này (1) nhân bản y hệt sang accounts (cards/loans tự làm), với một checklist các bước để bạn áp dụng cho **mọi** service; rồi (2) lùi lại nhìn toàn cảnh: có **bao nhiêu cách** (flavor) hiện thực CQRS, và một kỹ thuật thay thế — **CDC**.

## Checklist nhân bản CQRS + ES cho một service

Áp dụng cho accounts (và cards/loans). Lấy accounts làm ví dụ — khác customer chủ yếu ở **aggregate identifier là `accountNumber` (kiểu `Long`)** và **processing group `account-group`**.

```text
□ 1. pom.xml: đã có axon-spring-boot-starter (Phase 3 bài 3)
□ 2. application.yml: axon.axonserver.servers + processors.account-group.mode: subscribing
□ 3. Tạo package command/ và query/ + các sub-package
□ 4. command/        : CreateAccountCommand, UpdateAccountCommand, DeleteAccountCommand
     command/event/  : AccountCreatedEvent, AccountUpdatedEvent, AccountDeletedEvent
     command/aggregate/   : AccountsAggregate  (@AggregateIdentifier = accountNumber: Long)
     command/controller/  : AccountsCommandController
     command/interceptor/ : AccountsCommandInterceptor
     query/          : FindAccountQuery
     query/projection/    : AccountsProjection  (@ProcessingGroup("account-group"))
     query/handler/       : AccountsQueryHandler
     query/controller/    : AccountsQueryController
□ 5. Repository: thêm findByAccountNumber (param Long), findByMobileNumberAndActiveSw
□ 6. Mapper: thêm mapEventToAccount
□ 7. Service interface + Impl: đổi tham số (nhận AccountsEntity / AccountUpdatedEvent thay vì Dto)
□ 8. XÓA AccountsController cũ (tránh duplicate route)
□ 9. GlobalExceptionHandler: thêm handler cho CommandExecutionException
□ 10. Main class: registerXxxCommandInterceptor + configure(PropagatingErrorHandler)
```

> **Khác biệt cốt lõi khi nhân bản**: chọn đúng **aggregate identifier** không-bao-giờ-đổi cho mỗi domain — `accountNumber` (accounts), `cardNumber` (cards), `loanNumber` (loans), `customerId` (customer). Kiểu dữ liệu có thể khác (`Long` vs `String`) → chỉnh tham số repo cho khớp.

Mỗi service trong repo khóa học có README liệt kê đúng các bước này + code mẫu — dùng khi bí.

## Demo end-to-end 4 service

Sau khi cả 4 service CQRS xong, khởi động tất cả (đăng ký lên Axon Server — icon cam), restart gateway. Tạo data với **cùng mobileNumber** ở cả 4 service, rồi gọi `fetchCustomerSummary` (API composition từ Phase 1) trên gateway:

```text
GET gateway:8072 /api/composite/fetch/customerSummary?mobileNumber=...
   → { customer, accounts, loans, cards }   ← read side mỗi service trả về
```

Điểm hay: **read API không đổi hành vi** — vẫn đọc từ read DB. Việc chuyển sang CQRS + ES trong suốt với client. Trong dashboard Search, mỗi domain có aggregate identifier riêng (accountNumber/cardNumber/loanNumber/customerId), mỗi cái một chuỗi event sequence.

> Đây là lúc thấy hai pattern Phase 1 và Phase 3 ăn khớp: gateway gom (composition) từ read side của các service vốn được nuôi bằng event sourcing.

## Sáu flavor hiện thực CQRS

CQRS không có "một cách đúng". Tùy nhu cầu, developer chọn một trong các flavor sau (tăng dần độ mạnh + độ phức tạp):

| # | Flavor | DB | Model read/write | Event Sourcing | Đặc điểm |
|---|---|---|---|---|---|
| 1 | Single model, single DB | 1 | **chung** | Không | Chỉ tách API command/query. Code sạch, dễ test; scale/performance **hạn chế**. Cho app nhỏ/mới học |
| 2 | Separate model, single DB | 1 | **tách** | Không | Write dùng ORM nặng, read dùng model nhẹ. Cùng 1 transaction → **consistency mạnh** |
| 3 | Separate DB (no ES) | 2 | tách | **Không** | Read/write DB riêng, đồng bộ qua **event bus**. Scale độc lập, chọn công nghệ riêng. Rủi ro **out-of-order / mất message** vì không ES |
| 4 | **CQRS + ES, 2 DB** | 2 | tách | **Có** | **Đây là cái ta đã làm.** Write = event store. Performance + scale **cao**; complexity cao (Axon gánh hộ) |
| 5 | CQRS + ES, single DB | 1 (NoSQL) | tách schema/table | Có | Schema/table riêng cho event và read, cùng 1 DB → **consistency mạnh**, complexity/performance **trung bình** |
| 6 | CQRS + **CDC** | 2 | — | (tùy) | Đồng bộ write→read hoàn toàn bằng **CDC** (xem dưới). Developer viết **rất ít** code |

> Flavor 3 (separate DB, **không** ES) có cái bẫy out-of-order: write phát E1 rồi E2 rất nhanh, nhưng read có thể xử lý E2 trước E1 → read DB sai. ES (flavor 4) tránh được nhờ sequence number. Đó là một lý do nữa để ghép ES.

## CDC — Change Data Capture (flavor đặc biệt)

> **CDC (Change Data Capture)** = kỹ thuật **theo dõi và bắt thay đổi** trong DB rồi propagate sang hệ khác **real-time** — bằng cách đọc **transaction log** của DB, không cần app tự phát event.

```text
   Write DB (insert/update/delete)
        │ ghi vào TRANSACTION LOG (sau khi commit)
        │   MySQL: binlog   Postgres: WAL   MongoDB: oplog
        ▼
   CDC tool theo dõi log  ──►  publish thay đổi lên Kafka topic
        │   (I=insert, U=update, D=delete; read KHÔNG ghi log)
        ▼
   Target system (read DB / data warehouse / cache / analytics) consume → cập nhật
```

Khác biệt lớn với cách ta làm: với CDC, **developer không viết code phát event cũng không viết code consume** — DB và CDC tool lo hết. Đổi lại bạn lệ thuộc hạ tầng.

| | Axon (flavor 4) | CDC (flavor 6) |
|---|---|---|
| Ai phát event | Developer (`apply()`) | CDC tool đọc transaction log |
| Ai consume | Developer (`@EventHandler`) | CDC tool ghi vào target |
| Code | Nhiều | Rất ít |
| Phù hợp team | Mạnh về dev | Mạnh về infra, nhẹ về dev |

Lợi ích CDC: loose coupling (service không gọi nhau để đồng bộ), bất đồng bộ qua Kafka, scale tốt. Sản phẩm CDC phổ biến: **Debezium** (open-source, trên Apache Kafka; bắt thay đổi MySQL/Postgres/MongoDB qua transaction log).

> Giảng viên **không** khuyến nghị CDC từ góc nhìn developer (ít kiểm soát logic), nhưng team nặng infra có thể chuộng. Biết để khi gặp trong dự án không bỡ ngỡ.

## Tóm tắt bài 11

- Nhân bản CQRS+ES cho service mới = checklist 10 bước; mấu chốt chọn đúng **aggregate identifier không-đổi** (accountNumber/cardNumber/loanNumber, có thể khác kiểu) + processing group riêng.
- Read API **không đổi hành vi** sau khi chuyển CQRS → trong suốt với client; gateway `fetchCustomerSummary` (Phase 1) vẫn chạy.
- **Sáu flavor** CQRS từ đơn giản (1 model/1 DB) tới mạnh (CQRS+ES+2DB = cái ta làm); flavor không-ES dễ dính out-of-order.
- **CDC** (Debezium): đồng bộ write→read qua **transaction log** + Kafka, developer viết rất ít code; hợp team nặng infra.

**Bài kế tiếp** → [Phase 4 — Bài 1: Vì sao cần Materialized View Pattern](../phase-4/01-vi-sao-can-materialized-view.md)

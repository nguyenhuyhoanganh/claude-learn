# Bài 1: Giới thiệu Axon — công cụ hiện thực CQRS & Event Sourcing

Phase 2 cho ta lý thuyết. Giờ phải code. Nhưng tự xây CQRS + Event Sourcing từ con số 0 — tự viết event store, tự routing command tới handler, tự dựng event bus, tự làm projection mechanism — là **cực kỳ tốn công**. May mắn là có sẵn một sản phẩm trưởng thành lo phần hạ tầng đó: **Axon**. Phase 3 dùng Axon để hiện thực hóa toàn bộ lý thuyết Phase 2.

> **Tinh thần cần nhớ**: *cách* bạn implement không quan trọng bằng *kiến thức* về pattern. Tổ chức khác có thể dùng cách khác (tự code, hoặc framework khác). Hãy tập trung hiểu **vì sao** pattern hoạt động, **lợi ích** nó mang lại — đó mới là thứ theo bạn vào dự án thật.

## Analogy nhà hàng pizza — nhớ CQRS mãi mãi

Hình dung một tiệm pizza. Có hai loại nhân sự với trách nhiệm **tách bạch**:

```text
┌─────────────────────────┐        ┌─────────────────────────┐
│   ĐẦU BẾP (Chef)         │        │  PHỤC VỤ (Waiter)       │
│   làm pizza              │        │  nhận order, mang ra    │
│   → việc GHI / tạo ra    │        │  → việc ĐỌC / phục vụ   │
└─────────────────────────┘        └─────────────────────────┘
         ≈ Command side                     ≈ Query side
```

- Tiệm **nhỏ**, ít khách → **một người** kiêm cả hai (vừa làm vừa bưng). Đây là microservice truyền thống: một DB, một model lo cả ghi lẫn đọc.
- Tiệm **lớn**, đông khách → **không thể** một người ôm hết → phải tách vai. Đây là CQRS: **command side** (ghi) và **query side** (đọc) tách riêng.

Khi ai đó hỏi "CQRS là gì?", hãy nhớ tiệm pizza: tách *làm* và *phục vụ* thành hai vai để mỗi vai scale độc lập.

## Bốn bước hiện thực CQRS + Event Sourcing

Hiện tại mọi thao tác của microservice đi qua **một** DB. Để chuyển sang CQRS + ES, ta làm 4 việc:

```text
1. TÁCH API   →  write API (đổi data) ─► write DB
                 read  API (đọc data) ─► read DB

2. BẬT Event Sourcing trên write side
                 mỗi thay đổi của 1 record lưu kiểu lịch sử (audit), không ghi đè

3. PHÁT event mỗi khi write DB đổi  ─►  Event Bus

4. CONSUME event ở read side  ─►  cập nhật read DB (relational) cho read API đọc
```

Nghe phức tạp, nhưng với Axon nó trở nên đơn giản đến bất ngờ — vì Axon lo sẵn phần khó.

## Axon là gì? Ba thành phần

> **Axon** (axoniq.io) = một sản phẩm trưởng thành giúp hiện thực **CQRS, Event Sourcing, Saga** hiệu quả mà không phải xây từ đầu. Free cho phát triển/học tập local; bản production có tính phí.

| Thành phần | Vai trò | Ghi chú |
|---|---|---|
| **Axon Server** | Hạ tầng: **messaging, routing, và event store** sẵn dùng cho ứng dụng message-driven | Chạy như một process riêng (ta dựng bằng Docker ở bài sau) |
| **Axon Framework** | **Thư viện/SDK** Java: annotation + code để developer hiện thực pattern | Thêm vào service qua Maven dependency |
| **Axon IQ Console** | Giám sát (monitoring/managing/reporting) cách event được xử lý | **Tùy chọn**, không bắt buộc |

```text
┌──────────────────── Axon Framework (library trong service) ──────────────┐
│  @Aggregate  @CommandHandler  @EventSourcingHandler  @EventHandler        │
│  @QueryHandler   CommandGateway   QueryGateway   AggregateLifecycle       │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │ gRPC :8124
┌─────────────────────────────▼────────────────────────────────────────────┐
│  Axon Server (process riêng)                                              │
│   • Event Store (lưu event, append-only)                                  │
│   • Command routing  • Event bus nội bộ  • Query routing                  │
│   • Dashboard HTTP :8024                                                   │
└───────────────────────────────────────────────────────────────────────────┘
```

## Axon Server so với Kafka/RabbitMQ

Một câu hỏi tự nhiên: đã có Kafka/RabbitMQ rồi, sao cần Axon Server?

| Khía cạnh | Axon Server | Kafka / RabbitMQ |
|---|---|---|
| Event Store | Có sẵn (built-in) | Phải gắn DB riêng |
| Event Sourcing | Hỗ trợ first-class | Phải tự hiện thực |
| Routing command/query | Có sẵn | Phải tự cấu hình |
| Throughput thô | Vừa phải | Rất cao |
| Hệ sinh thái | Riêng Axon | Rộng |

Điểm mấu chốt: trong dự án thật, **DevOps/infra** lo dựng Axon Server (hoặc thay event bus nội bộ bằng Kafka/RabbitMQ tùy nhu cầu). Developer chỉ lo **phát event và consume event** — Axon Framework lo phần đó. Ta dựng Axon Server local chỉ để học.

## Khi nào KHÔNG nên ôm cả Axon

| Tình huống | Cân nhắc |
|---|---|
| App nhỏ, CRUD đơn giản | Không cần CQRS/ES → không cần Axon; over-engineering |
| Team chỉ cần message broker thuần | Kafka/RabbitMQ đủ; Axon là dư thừa |
| Khóa chặt vào một vendor là rủi ro | Axon là hệ sinh thái riêng; cân nhắc lock-in |
| Cần throughput cực lớn ở tầng bus | Kafka thắng về thông lượng thô |

Axon tỏa sáng đúng khi bạn **thực sự** cần CQRS + Event Sourcing (audit trail, replay, tách read/write) cho hệ phức tạp.

## Tóm tắt bài 1

- Tự xây CQRS/ES từ đầu rất tốn công → dùng **Axon** (sản phẩm trưởng thành, free cho local).
- **Analogy nhà hàng**: chef (làm = command/write) và phục vụ (bưng = query/read) tách vai khi tiệm lớn — đó chính là CQRS.
- Bốn bước: tách API write/read → bật Event Sourcing → phát event → consume cập nhật read DB.
- Ba thành phần Axon: **Axon Server** (hạ tầng + event store), **Axon Framework** (thư viện annotation), **Axon IQ Console** (giám sát, tùy chọn).
- Axon Server giao tiếp service qua gRPC :8124, dashboard HTTP :8024.

**Bài kế tiếp** → [Bài 2: Dựng Axon Server local bằng Docker](02-setup-axon-server-docker.md)

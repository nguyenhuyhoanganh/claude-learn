# Bài 3: Hiện thực Snapshot với Axon (kết thúc khóa học)

Lý thuyết xong (bài 2). Axon hỗ trợ snapshot sẵn — chỉ cần một bean và một thuộc tính annotation. Bài này hiện thực snapshot trong customer microservice, quan sát hành vi (gồm một điểm gây bối rối: snapshot tự tính là một event), và khép lại toàn bộ khóa học.

## Ba kiểu SnapshotTriggerDefinition

Axon định nghĩa cách kích hoạt snapshot qua interface `SnapshotTriggerDefinition`, có **ba** hiện thực:

| Implementation | Kích hoạt snapshot khi |
|---|---|
| `NoSnapshotTriggerDefinition` | **Không bao giờ** tạo snapshot (mặc định) |
| `EventCountSnapshotTriggerDefinition` | Sau mỗi **N event** (theo số lượng) — phổ biến nhất |
| `AggregateLoadTimeSnapshotTriggerDefinition` | Khi **thời gian load/replay** aggregate vượt ngưỡng |

Ta dùng `EventCountSnapshotTriggerDefinition` (theo số event).

## Hai bước cấu hình

### Bước 1: Bean SnapshotTriggerDefinition

Trong Spring Boot main class (`CustomersApplication`):

```java
@Bean(name = "customerSnapshotTrigger")
public SnapshotTriggerDefinition customerSnapshotTrigger(Snapshotter snapshotter) {
    return new EventCountSnapshotTriggerDefinition(snapshotter, 3);
    //                                                          └─ cứ 3 event → 1 snapshot
}
```

| Phần | Ý nghĩa |
|---|---|
| `Snapshotter` (tham số) | Bean Axon (package `org.axonframework.eventsourcing`) tự inject |
| `3` | Ngưỡng — cứ 3 event tạo một snapshot (thực tế đặt 100/1000; ở đây 3 cho dễ demo) |
| `@Bean(name=...)` | Đặt tên bean để gắn vào aggregate ở bước 2 |

### Bước 2: Gắn vào aggregate

```java
@Aggregate(snapshotTriggerDefinition = "customerSnapshotTrigger")
public class CustomerAggregate { ... }
```

Chỉ vậy. Framework tự lo việc tạo snapshot và dùng snapshot khi dựng state. Hai thay đổi: bean + thuộc tính `snapshotTriggerDefinition` trên `@Aggregate`.

## Demo: snapshot tự tính là một event (điểm dễ rối)

Với ngưỡng = 3, tạo customer rồi update nhiều lần, quan sát Axon dashboard:

```text
   event 0  CustomerCreated   ┐
   event 1  CustomerUpdated   ├─ đủ 3 → tạo SNAPSHOT (token 0)
   event 2  CustomerUpdated   ┘
   event 3  CustomerUpdated   ← nhưng SNAPSHOT cũng ĐƯỢC TÍNH như 1 event!
```

> **Điểm gây bối rối**: snapshot **được framework đếm như một event** trong bộ đếm. Nên sau 3 event đầu tạo snapshot thứ nhất; rồi snapshot đó + 2 update nữa = lại đủ 3 → snapshot thứ hai. Vì vậy bạn thấy snapshot xuất hiện "thường xuyên hơn dự đoán" — vì chính snapshot cũng làm tăng bộ đếm.

Trên dashboard: tab **Search** xem event thường; có **token** snapshot riêng. Cùng aggregate identifier (customerId) gắn cả event lẫn snapshot.

## Demo: replay bắt đầu từ snapshot, không từ đầu

Đây là phần chứng minh snapshot tăng tốc. Đặt breakpoint trong `@EventSourcingHandler` của `CustomerCreatedEvent` và `CustomerUpdatedEvent`, rồi trigger update mới:

```text
   KHÔNG snapshot (bài 1): breakpoint dừng N lần (replay mọi event)

   CÓ snapshot:
   - CustomerCreatedEvent KHÔNG bị gọi  ← state lấy từ SNAPSHOT
   - chỉ các event SAU snapshot mới replay
   → breakpoint dừng ít hơn hẳn
```

Khi state hiện tại nằm trọn trong snapshot và không có event nào sau đó, breakpoint **chỉ dừng một lần** (cho event mới đang lưu) — `CustomerCreatedEvent` không bao giờ được gọi. Framework đã dựng state từ snapshot.

> Lưu ý nhỏ: ngay *trước* khi tạo snapshot mới, các event giữa snapshot cũ và mới sẽ được replay (để tính snapshot mới) → lúc đó breakpoint dừng nhiều lần. Sau khi snapshot tạo xong, các lần ghi tiếp lại chỉ replay từ snapshot. Đây là hành vi đúng.

## Áp dụng & best practice production

- Cấu hình snapshot cho **mọi** aggregate có lịch sử dài (accounts/cards/loans tương tự customer — đổi tên bean + ngưỡng).
- Ngưỡng production thường **100-1000** (không phải 3); chọn theo tần suất ghi và độ dài lịch sử (Phase 2 bài 2 — trade-off frequency).
- Snapshot **không thay** event store — audit/time-travel vẫn nguyên (bài 2).
- Mọi framework/sản phẩm hỗ trợ event sourcing đều nên có snapshot; Axon có sẵn — kiểm tra mục "Tuning → Event snapshots" trong docs.

## Khép lại khóa học — bức tranh toàn cảnh

Bạn vừa đi hết một hành trình đầy đủ về event-driven microservices nâng cao:

```text
   Database-per-Service (Phase 1)  → sinh ra 4 thách thức
        │
        ├─ Cross-service query → API Composition (Phase 1) / CQRS (Phase 2-3)
        ├─ Đọc đa nguồn hiệu quả → Materialized View (Phase 4)
        ├─ Phát event tin cậy → Transactional Outbox (Phase 4)
        ├─ Distributed transaction → Saga: Choreography (Phase 5) / Orchestration (Phase 6)
        └─ Lịch sử + audit → Event Sourcing (Phase 2-3) + Snapshot (Phase 7)
```

"Bộ ba sát thủ" mà nhiều enterprise dùng: **CQRS + Event Sourcing + Saga** — bạn đã hiện thực cả ba với Axon, cộng các pattern bổ trợ (API Composition, Materialized View, Transactional Outbox, CDC). Đây là những chủ đề thường được hỏi trong phỏng vấn microservices.

## Tóm tắt bài 3

- Axon có 3 `SnapshotTriggerDefinition`: `NoSnapshot`, `EventCount` (theo số event — ta dùng), `AggregateLoadTime` (theo thời gian load).
- Hai bước: bean `EventCountSnapshotTriggerDefinition(snapshotter, N)` + `@Aggregate(snapshotTriggerDefinition="...")`.
- **Snapshot tự tính như một event** trong bộ đếm → snapshot xuất hiện thường hơn dự đoán.
- Replay bắt đầu từ **snapshot** (không từ event đầu) → breakpoint dừng ít hơn hẳn; `CreatedEvent` không bị gọi nếu state nằm trong snapshot.
- Production: ngưỡng 100-1000; áp cho mọi aggregate lịch sử dài; snapshot không thay event store.
- **Hoàn thành khóa**: CQRS + Event Sourcing + Saga + các pattern bổ trợ — chúc mừng bạn!

**Quay lại** → [README — Lộ trình toàn khóa](../README.md)

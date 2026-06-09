# Bài 6: Technical flow của CQRS & Event Sourcing — bản đồ để không lạc

Hiện thực CQRS + ES sinh ra **rất nhiều** component (command, aggregate, event, projection, query handler...). Dễ lạc. Bài này là **tấm bản đồ** ta sẽ quay lại nhiều lần: nó cho thấy một request đi qua những đâu, từ client tới DB và ngược lại. In nó ra, dán lên tường.

## Toàn cảnh: hai con đường

Client (UI hoặc service khác) có **hai** đường đi, tùy muốn ghi hay đọc:

```text
                          ┌───────────── CLIENT ─────────────┐
                          │  ghi → write API   đọc → read API │
                          └───────┬───────────────────┬───────┘
                                  │ (command)         │ (query)
              ════════ WRITE SIDE ════════    ════════ READ SIDE ════════
                                  │                   │
                        CustomerCommandController     CustomerQueryController
                                  │ build Command     │ build Query
                                  ▼                   ▼
                          CommandGateway          QueryGateway
                                  │ dispatch          │ dispatch
                                  ▼                   ▼
                       ┌──────────────────┐    ┌──────────────────┐
                       │  CustomerAggregate│    │ CustomerQueryHandler│
                       │  @CommandHandler  │    │  @QueryHandler     │
                       │  (validate +      │    │  (đọc read DB)     │
                       │   apply event)    │    └─────────┬─────────┘
                       └────────┬──────────┘              │
                                │ @EventSourcingHandler   │
                                ▼                         │
                          EVENT STORE (write DB)          │
                          (lưu event, append-only)        │
                                │ publish                 │
                                ▼                         │
                          ┌──────────────┐                │
                          │  EVENT BUS   │                │
                          └──────┬───────┘                │
                                 │ consume                │
                                 ▼                        │
                       ┌──────────────────┐               │
                       │ CustomerProjection│              │
                       │  @EventHandler    │              │
                       │  (lưu read DB)    │              │
                       └────────┬──────────┘              │
                                ▼                         │
                          READ DATABASE  ◄────────────────┘
                          (current state, đọc nhanh)
```

## Đường GHI (write side) — từng trạm

| Trạm | Làm gì | Annotation/Class chính |
|---|---|---|
| 1. Command Controller | Nhận request, build **command object** | `CommandGateway.sendAndWait` |
| 2. Aggregate | **Xử lý** command (validate), **apply** event | `@Aggregate`, `@CommandHandler`, `AggregateLifecycle.apply()` |
| 3. Event Sourcing Handler | Lưu data vào **event store** kiểu lịch sử | `@EventSourcingHandler` |
| 4. Event Bus | Sau khi lưu, **phát** event ra bus | (Axon Server lo) |
| 5. Projection | **Consume** event, lưu vào **read DB** | `@EventHandler` |

## Đường ĐỌC (read side) — từng trạm

| Trạm | Làm gì | Annotation/Class chính |
|---|---|---|
| 1. Query Controller | Nhận request, build **query object** | `QueryGateway.query` |
| 2. Query Handler | **Đọc** read DB, trả kết quả | `@QueryHandler` |

> Đối xứng đẹp: **Aggregate ↔ Query Handler** (đều "xử lý" theo logic ta viết), **Command ↔ Query** (đều là object mô tả ý định), **CommandGateway ↔ QueryGateway** (đều là cửa dispatch).

## Ánh xạ tới 5 khái niệm Event Sourcing (Phase 2)

| Khái niệm Phase 2 | Hiện thực ở Phase 3 |
|---|---|
| Command (ý định) | Command class + Command Controller + CommandGateway |
| Event (sự thật) | Event class |
| **Aggregate** (write side: validate + sinh + phát event) | `@Aggregate` class với `@CommandHandler` + `@EventSourcingHandler` |
| Event Store | Write DB do Axon Server quản (thư mục `events/` ở dev mode) |
| **Projection** (read side: dựng current state) | `@Component` class với `@EventHandler` |

## Bảng annotation Axon — tra cứu nhanh

| Annotation | Đặt ở đâu | Ý nghĩa |
|---|---|---|
| `@Aggregate` | Class aggregate | Đánh dấu đây là aggregate, Axon dùng để xử lý command |
| `@TargetAggregateIdentifier` | Field trong **command** | Khóa định danh aggregate mà command nhắm tới |
| `@AggregateIdentifier` | Field trong **aggregate** | Khóa định danh của aggregate (≈ `@Id`) |
| `@CommandHandler` | Constructor/method trong aggregate | Method xử lý một loại command |
| `@EventSourcingHandler` | Method trong aggregate | Áp event vào state + kích hoạt lưu event store |
| `@EventHandler` | Method trong projection | Xử lý event consume từ bus, cập nhật read DB |
| `@QueryHandler` | Method trong query handler | Xử lý một loại query, đọc read DB |
| `@ProcessingGroup` | Class projection | Gom event handler vào nhóm để cấu hình xử lý (bài 10) |

## Hiện trạng & việc còn lại

Tới giờ (bài 5) ta đã có: command classes, event classes, query class, command controller + CommandGateway. **Còn thiếu**:

```text
[✓] Command/Event/Query classes      [✓] Command Controller + CommandGateway
[ ] Aggregate  (@CommandHandler, @EventSourcingHandler)   ← bài 7
[ ] Projection (@EventHandler)                            ← bài 8
[ ] Query Controller + QueryGateway + QueryHandler        ← bài 8
```

Aggregate là mảnh tiếp theo — nơi business logic write side thực sự sống.

## Tóm tắt bài 6

- Một request có **hai đường**: write side (Controller → CommandGateway → Aggregate → Event Store → Event Bus → Projection → Read DB) và read side (Controller → QueryGateway → Query Handler → Read DB).
- Đối xứng: Aggregate ↔ Query Handler, Command ↔ Query, CommandGateway ↔ QueryGateway.
- Năm khái niệm Phase 2 ánh xạ 1-1 vào các class/annotation Phase 3.
- Nắm bảng annotation: `@Aggregate`, `@CommandHandler`, `@EventSourcingHandler`, `@EventHandler`, `@QueryHandler`, `@TargetAggregateIdentifier`/`@AggregateIdentifier`.
- Mảnh kế tiếp: **Aggregate**.

**Bài kế tiếp** → [Bài 7: Aggregate và EventSourcingHandler — trái tim write side](07-aggregate-event-sourcing-handler.md)

# Bài 4: Command, Event và Query classes — viên gạch đầu tiên

Axon cần biết: khi API nào đó được gọi thì **command** nào nên kích hoạt, **event** nào nên phát. Ta khai báo điều đó bằng các lớp POJO đơn giản: command classes (ý định ghi), query class (ý định đọc), event classes (sự thật đã xảy ra). Bài này tạo chúng cho `customer`, kèm các **quy ước đặt tên** và **annotation Axon** quan trọng.

## Bức tranh: 4 loại POJO ánh xạ tới API

```text
   API end user gọi           POJO ta tạo               Phase 2 gọi là
   ─────────────────          ───────────               ──────────────
   POST   create   ─────────► CreateCustomerCommand  ┐
   PUT    update   ─────────► UpdateCustomerCommand  ├─ Command (ý định ghi, hiện tại)
   PATCH  delete   ─────────► DeleteCustomerCommand  ┘
   GET    fetch    ─────────► FindCustomerQuery       ─ Query   (ý định đọc)

   (sau khi command xử lý xong, Axon phát)
                              CustomerCreatedEvent   ┐
                              CustomerUpdatedEvent   ├─ Event (sự thật, quá khứ)
                              CustomerDeletedEvent   ┘
```

## Command classes — ý định ghi

Customer hỗ trợ create/update/delete (read nằm ở query side). → tạo **3** command class trong package `command`.

### Quy ước đặt tên command: `Verb + Noun + Command`, thì hiện tại

```text
Create + Customer + Command   →  CreateCustomerCommand
Update + Customer + Command   →  UpdateCustomerCommand
Delete + Customer + Command   →  DeleteCustomerCommand
        │         │        │
       verb     noun    hậu tố
   (hành động) (đối tượng)
```

> Command **luôn thì hiện tại** (`Create`, `Update`, `Delete`) — không quá khứ, không tương lai. Vì command là *ý định sắp làm*, chưa xảy ra (đối lập với event — đã xảy ra, thì quá khứ; xem Phase 2).

### `CreateCustomerCommand`

```java
@Data
@Builder
public class CreateCustomerCommand {

    @TargetAggregateIdentifier        // ← annotation Axon, xem giải thích bên dưới
    private final String customerId;
    private final String name;
    private final String email;
    private final String mobileNumber;
    private final boolean activeSw;
}
```

| Annotation | Vai trò |
|---|---|
| `@Data` (Lombok) | Sinh getter/setter/constructor/toString/equals/hashCode |
| `@Builder` (Lombok) | Cho phép tạo object kiểu `.builder().customerId(..).build()` — ta sẽ dùng ở bài Command API |
| `@TargetAggregateIdentifier` (Axon) | **Khóa định danh aggregate** — báo Axon dùng `customerId` làm "khóa chính" để gắn mọi event/record của một customer |

> **`@TargetAggregateIdentifier` ≈ `@Id` của JPA**: như `@Id` báo cho Spring Data JPA biết cột khóa chính, annotation này báo cho Axon biết trường nào định danh duy nhất một aggregate. Axon dùng nó để gom đúng chuỗi event của cùng một customer.

Các field: end user gọi create chỉ gửi `name`, `email`, `mobileNumber`; còn `customerId` và `activeSw` ta tự sinh/gán trong logic.

### Update và Delete command

- `UpdateCustomerCommand`: y hệt 5 field + cùng annotation (update cũng nhận đủ field).
- `DeleteCustomerCommand`: chỉ **2 field** — `customerId` (end user gửi) và `activeSw` (ta gán `false` để soft delete). Vẫn cần `@TargetAggregateIdentifier` trên `customerId`.

```java
@Data @Builder
public class DeleteCustomerCommand {
    @TargetAggregateIdentifier
    private final String customerId;
    private final boolean activeSw;
}
```

## Query class — ý định đọc

Customer chỉ có **một** thao tác đọc (fetch theo mobileNumber) → **một** query class. (Nhiều thao tác đọc thì nhiều query class.)

### Quy ước đặt tên query: `Verb + Noun + Query`

Verb có thể là `Find` / `Read` / `Get`.

```java
@Value      // ← Lombok: chỉ getter, KHÔNG setter (immutable)
public class FindCustomerQuery {
    private final String mobileNumber;
}
```

> Vì sao `@Value` thay vì `@Data`? `@Value` sinh getter nhưng **không** sinh setter → object bất biến. Ta không có nhu cầu đổi giá trị sau khi tạo query, nên `@Value` hợp lý hơn.

## Event classes — sự thật đã xảy ra

Sau khi command xử lý xong, Axon phát event để read side cập nhật. Tạo 3 event class.

> **Vị trí package**: đặt event trong `command/event`. Lý do: **command side là bên *phát* event**, còn query side chỉ *xử lý* event. Nên gom event chung với command hợp lý hơn. (Đặt đâu cũng được, miễn nhất quán.)

### Quy ước đặt tên event: `Noun + Verb(quá khứ) + Event`

```text
Customer + Created + Event   →  CustomerCreatedEvent
Customer + Updated + Event   →  CustomerUpdatedEvent
Customer + Deleted + Event   →  CustomerDeletedEvent
         │         │
        noun   verb QUÁ KHỨ
```

> Event **luôn thì quá khứ** — vì khi command chạy xong, customer **đã** được tạo/sửa/xóa. Tên phải phản ánh sự thật đã rồi.

### `CustomerCreatedEvent`

```java
@Data
public class CustomerCreatedEvent {
    private String customerId;
    private String name;
    private String email;
    private String mobileNumber;
    private boolean activeSw;
}
```

Ba điểm khác biệt so với command — và lý do:

| Điểm | Command | Event | Vì sao |
|---|---|---|---|
| Field `final`? | có (`final`) | **không** final | Event đôi khi cần chỉnh data sau khi tạo, trước khi publish |
| `@TargetAggregateIdentifier`? | có | **không** | Event chỉ là **vật mang dữ liệu (data carrier)**, không lưu DB trực tiếp → không cần annotation định danh |
| Annotation | `@Data @Builder` | chỉ `@Data` | Event không cần builder ở đây |

- `CustomerUpdatedEvent`: 5 field như trên.
- `CustomerDeletedEvent`: 2 field (`customerId`, `activeSw`).

> **Vì sao event "chỉ là data carrier"?** Khi command xong, object event được publish lên event bus; read side đọc và xử lý. Không có thao tác lưu DB *gắn trực tiếp* vào event class (việc lưu do aggregate/projection làm), nên event không cần annotation gì ngoài `@Data`.

## Bảng tổng kết quy ước

| Loại | Đặt tên | Thì | Annotation chính | Field final? |
|---|---|---|---|---|
| Command | `Verb+Noun+Command` | hiện tại | `@Data @Builder` + `@TargetAggregateIdentifier` | có |
| Query | `Verb+Noun+Query` | — | `@Value` | có |
| Event | `Noun+Verb(qk)+Event` | quá khứ | `@Data` | không |

## Tóm tắt bài 4

- **Command** (`CreateCustomerCommand`...): ý định ghi, thì hiện tại, `@Data @Builder`, có `@TargetAggregateIdentifier` (≈ `@Id` của JPA) trên field định danh không-bao-giờ-đổi.
- **Query** (`FindCustomerQuery`): ý định đọc, `@Value` (immutable, chỉ getter).
- **Event** (`CustomerCreatedEvent`...): sự thật quá khứ, `@Data`, field **không** final, **không** annotation định danh (chỉ là data carrier). Đặt trong `command/event` vì command side phát event.
- Mỗi POJO ánh xạ tới một API; đây là viên gạch để Axon biết phải kích hoạt gì.

**Bài kế tiếp** → [Bài 5: Command API và CommandGateway](05-command-api-commandgateway.md)

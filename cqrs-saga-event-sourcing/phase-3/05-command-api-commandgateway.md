# Bài 5: Command API và CommandGateway — gửi lệnh vào Axon

Đã có command classes (bài 4). Giờ dựng REST API phía ghi: nhận data từ client, đóng gói thành command object, rồi **dispatch** command qua `CommandGateway` để Axon xử lý. Bài này tạo `CustomerCommandController` cho 3 thao tác create/update/delete.

## Luồng một command API

```text
Client (JSON)
   │ POST /eazybank/customer/api/create  { name, email, mobileNumber }
   ▼
CustomerCommandController
   │ 1. nhận CustomerDto
   │ 2. build CreateCustomerCommand (gán customerId, activeSw)
   │ 3. commandGateway.sendAndWait(command)
   ▼
CommandGateway  ──►  Axon  ──►  Aggregate (bài 7 xử lý)
   │
   ▼ trả 201 Created
Client
```

## Tạo CustomerCommandController

Trong `command/controller`:

```java
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class CustomerCommandController {

    private final CommandGateway commandGateway;   // ← Axon inject sẵn bean này

    @PostMapping("/create")
    public ResponseEntity<ResponseDto> createCustomer(@Valid @RequestBody CustomerDto dto) {
        CreateCustomerCommand command = CreateCustomerCommand.builder()
                .customerId(UUID.randomUUID().toString())   // tự sinh, end user không gửi
                .name(dto.getName())
                .email(dto.getEmail())
                .mobileNumber(dto.getMobileNumber())
                .activeSw(CustomerConstants.ACTIVE_SW)       // hằng = true
                .build();

        commandGateway.sendAndWait(command);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new ResponseDto("201", "Customer created successfully"));
    }
}
```

Điểm cần nắm:
- `.builder()...build()` dùng được nhờ `@Builder` đã gắn ở command class (bài 4).
- `customerId` sinh bằng `UUID.randomUUID().toString()` — end user không cung cấp.
- Sau `sendAndWait`, command được Axon xử lý (lưu event sourcing + phát event); ta trả **201**.

## CommandGateway — cửa gửi lệnh

> **`CommandGateway`** là interface của Axon Framework để **dispatch command**. Lúc khởi động, Axon tự tạo bean cho implementation của nó → ta chỉ cần inject như một dependency bình thường.

### `sendAndWait` (blocking) vs `send` (async)

Đây là lựa chọn quan trọng:

| Method | Kiểu | Hành vi |
|---|---|---|
| `sendAndWait(command)` | **Blocking** | Thread **chặn**, chờ command xử lý xong rồi mới đi tiếp |
| `sendAndWait(command, timeout, unit)` | Blocking có timeout | Chờ tối đa `timeout`, quá hạn thì bỏ |
| `send(command)` | **Async, non-blocking** | Trả `CompletableFuture`; thread không chờ. Dùng kèm callback nếu cần chạy tiếp sau khi xong |

```text
sendAndWait:  [dispatch] ──chờ──► [xử lý xong] ──► return   (đơn giản, đồng bộ)
send:         [dispatch] ──► return ngay  + callback chạy sau khi xong (async)
```

`sendAndWait()` không tham số chờ **vô hạn** tới khi command xong. Còn các overload khác cho phép kèm **metadata** và/hoặc **timeout**. Ở đây ta dùng bản đơn giản nhất (chờ vô hạn) vì sau khi gửi command ta không có việc gì khác cần làm trước khi trả response — nên blocking là hợp lý.

> Dùng `send()` (async + callback) khi: sau khi dispatch bạn còn việc khác để làm song song, hoặc không muốn thread bị chặn. Nếu chỉ "gửi xong, chờ kết quả, trả về" → `sendAndWait()` gọn hơn.

## Update và Delete API

Cùng khuôn: build command tương ứng → `sendAndWait` → trả status.

```java
@PutMapping("/update")
public ResponseEntity<ResponseDto> updateCustomer(@Valid @RequestBody CustomerDto dto) {
    UpdateCustomerCommand command = UpdateCustomerCommand.builder()
            .customerId(dto.getCustomerId())     // lần này lấy từ dto, KHÔNG sinh mới
            .name(dto.getName()).email(dto.getEmail())
            .mobileNumber(dto.getMobileNumber()).activeSw(dto.isActiveSw())
            .build();
    commandGateway.sendAndWait(command);
    return ResponseEntity.ok(new ResponseDto("200", "Customer updated successfully"));
}

@PatchMapping("/delete")     // PATCH chứ không DELETE — vì ta SOFT delete
public ResponseEntity<ResponseDto> deleteCustomer(@RequestParam String customerId) {
    DeleteCustomerCommand command = DeleteCustomerCommand.builder()
            .customerId(customerId)
            .activeSw(CustomerConstants.IN_ACTIVE_SW)   // = false → soft delete
            .build();
    commandGateway.sendAndWait(command);
    return ResponseEntity.ok(new ResponseDto("200", "Customer deleted successfully"));
}
```

Lưu ý:
- **Update**: `customerId` lấy từ dto (không sinh mới).
- **Delete**: dùng `@PatchMapping` chứ không `@DeleteMapping` — vì ta không xóa vật lý mà gán `activeSw=false` (soft delete). End user chỉ gửi `customerId`; `activeSw=false` ta gán tại controller.

## Dọn dẹp: xóa controller CRUD cũ

Trước đây CRUD nằm trong `CustomerController` (kiểu một-DB). Khi đã tách thành command/query, **xóa** các API trùng trong `CustomerController` (create/update/delete) để tránh xung đột route. (Toàn bộ class này sẽ bị xóa hẳn ở bài demo, sau khi query API cũng chuyển xong.)

> **Quan trọng**: lúc này Axon đã **nhận** command nhưng **chưa biết xử lý** — vì ta chưa viết **Aggregate**. Đó là việc của bài 7. Trước đó, bài 6 sẽ vẽ bản đồ tổng "technical flow" để bạn không lạc.

## Tóm tắt bài 5

- `CustomerCommandController`: nhận dto → **build command** (`@Builder`) → **`commandGateway.sendAndWait()`** → trả 201/200.
- **`CommandGateway`**: bean Axon tự tạo; `sendAndWait` = blocking (chờ xong), `send` = async (CompletableFuture + callback).
- `customerId` sinh bằng `UUID` ở create; lấy từ dto ở update.
- Delete dùng `@PatchMapping` + `activeSw=false` (soft delete).
- Xóa API CRUD trùng trong controller cũ.
- Axon đã nhận command nhưng **chưa xử lý** — cần Aggregate (bài 7).

**Bài kế tiếp** → [Bài 6: Technical flow của CQRS & Event Sourcing](06-technical-flow-cqrs-es.md)

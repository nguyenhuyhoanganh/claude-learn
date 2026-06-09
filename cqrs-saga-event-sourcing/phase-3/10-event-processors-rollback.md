# Bài 10: Event Processors — subscribing vs streaming và rollback

Điều gì xảy ra khi write side lưu event thành công, nhưng read side **ném exception** lúc cập nhật? Mặc định: event store đã lưu, read DB thì không → **lệch dữ liệu**. Bài này mổ xẻ vấn đề rollback ấy, giải thích hai loại **event processor** của Axon, và cấu hình để write side **tự rollback** khi read side lỗi.

## Vấn đề: read side lỗi, write side KHÔNG rollback

Thử nghiệm: cố tình ném exception trong projection.

```java
@EventHandler
public void on(CustomerUpdatedEvent event) {
    throw new RuntimeException("it is a bad day");   // giả lập lỗi read side
    // customerService.updateCustomer(event);
}
```

Gọi update qua Postman → **nhận response thành công**(!). Kiểm tra:

```text
Event store:  có CustomerUpdatedEvent mới (payload đúng)   ← ĐÃ lưu
Read DB:      vẫn tên/email CŨ (update thất bại)            ← KHÔNG cập nhật
```

```text
   command ──► aggregate ──► EVENT STORE ✅ (đã commit)
                                  │ publish
                                  ▼
                              projection ❌ RuntimeException
                                  → read DB không đổi, NHƯNG write side ĐÃ commit
```

Không chấp nhận được: nếu read side lỗi, lẽ ra phải rollback cả write side. Vì sao không? → tùy **event processor** đang dùng.

## Hai loại event processor

> **Event processor** = cơ chế Axon dùng để xử lý event. Có **hai** loại, khác nhau ở **threading** và **cách xử lý**.

| | **Subscribing** | **Streaming** |
|---|---|---|
| Threading | **Một thread** lo cả dispatch + handle + store | **Nhiều thread** (thread A dispatch, thread B handle) |
| Hợp với | Command + query **cùng một JVM** | Command + query ở **JVM/microservice khác nhau** |
| Thứ tự xử lý event | **Tuần tự** (sequential) | **Song song** (parallel) |
| Rollback khi lỗi | **Được** — cùng thread nên rollback cả write side | **Không** — lỗi ở handler này không rollback handler/transaction khác |
| Thông lượng | Thấp hơn (tuần tự) | Cao hơn (song song) |
| Mặc định Axon | | **Đây là mặc định** |

```text
SUBSCRIBING (1 thread):
   [dispatch → handle event → store]  ── cùng 1 thread ──► lỗi ở đâu rollback cả chuỗi

STREAMING (n thread):
   thread1:[dispatch]   thread2:[handle event]  ── tách thread ──► lỗi 1 nơi KHÔNG rollback nơi khác
```

**Vì sao demo trên không rollback?** Vì mặc định Axon là **streaming**: command chạy thread khác với event handler → exception ở handler không kéo theo rollback write side.

## Chọn loại nào?

```text
Command side + Query side TRONG CÙNG 1 microservice (1 JVM)?
   └─ CÓ  → dùng SUBSCRIBING  (rollback được, đơn giản)   ← trường hợp customer của ta
   └─ KHÔNG (2 microservice/JVM khác nhau) → dùng STREAMING
            (không rollback xuyên JVM được → cần SAGA, Phase 5-6)
```

Customer của ta gói cả command + query trong **một** service/JVM → chọn **subscribing** để được rollback.

## Bối cảnh: một command có thể phát NHIỀU event

Trước khi cấu hình, hiểu thêm: `AggregateLifecycle.apply()` trả về `ApplyMore` → cho phép phát thêm event:

```java
AggregateLifecycle.apply(event1)
    .andThenApply(() -> event2)
    .andThenApply(() -> event3);
```

- Ngoài aggregate (class không phải aggregate) → dùng **`EventGateway.publish(event)`**.
- Khi một command sinh nhiều event, mỗi event được một event handler xử lý. Nên **gom các event liên quan vào một processing group** để cấu hình chung (error handling, tuần tự/song song).

## Cấu hình subscribing + rollback — 3 bước

### Bước 1: Gán event handler vào processing group

Trên class `CustomerProjection`:

```java
@Component
@ProcessingGroup("customer-group")    // gom mọi @EventHandler trong class vào nhóm này
public class CustomerProjection { ... }
```

> Một event handler thuộc đúng **một** processing group. Gom nhóm cho phép cấu hình cách xử lý (error handling, processor mode) ở mức nhóm. Nếu một command phát nhiều event cùng nhóm → khi dùng subscribing, chúng xử lý trong **cùng một thread**.

### Bước 2: Propagate lỗi từ event handler lên command layer

Trong Spring Boot main class:

```java
@Autowired
public void configure(EventProcessingConfigurer config) {
    config.registerListenerInvocationErrorHandler(
        "customer-group",
        conf -> PropagatingErrorHandler.instance()
    );
}
```

- `PropagatingErrorHandler`: thay vì "nuốt" lỗi, nó **đẩy nguyên** RuntimeException từ event handler lên các tầng trên (command layer).

### Bước 3: Bật subscribing mode cho group (application.yml)

```yaml
axon:
  eventhandling:
    processors:
      customer-group:
        mode: subscribing
```

Ba thay đổi: `@ProcessingGroup` (projection) + `PropagatingErrorHandler` (main class) + `mode: subscribing` (yml).

## Kết quả sau cấu hình

Gọi update với projection vẫn ném exception:

```text
Response:    500 Internal Server Error  "it is a bad day"   (do GlobalExceptionHandler)
Event store: aggregate sequence KHÔNG tăng                  ← write side ĐÃ ROLLBACK
```

Vì giờ chạy **một thread**: lỗi ở event handler → propagate lên → write side **không commit**. Transaction write side chỉ commit khi **mọi** event xử lý sạch. Đúng như mong muốn.

## Bắt riêng CommandExecutionException

Mọi lỗi trong flow CQRS được Axon bọc thành `CommandExecutionException` (vì command là bước đầu của flow). Thêm handler riêng trong `GlobalExceptionHandler`:

```java
@ExceptionHandler(CommandExecutionException.class)
public ResponseEntity<ErrorResponseDto> handleCommandExecutionException(
        CommandExecutionException ex, WebRequest req) {
    return buildError("Command execution exception occurred due to: " + ex.getMessage(), ...);
}
```

So sánh:

| Handler | Bắt gì |
|---|---|
| `@ExceptionHandler(Exception.class)` | Mọi exception (cha của tất cả) |
| `@ExceptionHandler(CommandExecutionException.class)` | Riêng lỗi từ flow Axon — ưu tiên hơn, message rõ ràng hơn |

> Sau khi học xong, nhớ **bỏ** dòng `throw new RuntimeException("it is a bad day")` và bật lại logic thật trong projection.

## Khi nào KHÔNG dùng được rollback kiểu này

| Tình huống | Hệ quả |
|---|---|
| Command & query ở **2 JVM/microservice** | Subscribing vô dụng (không chung thread); rollback xuyên JVM cần **Saga** (Phase 5-6) |
| Cần thông lượng event cực lớn | Subscribing tuần tự chậm → streaming nhanh hơn nhưng mất rollback tự động |
| Streaming + nhiều event | Lỗi một event handler **không** dừng/rollback handler khác |

## Tóm tắt bài 10

- Mặc định Axon dùng **streaming** → read side lỗi **không** rollback write side (lệch data).
- Hai processor: **subscribing** (1 thread, tuần tự, rollback được, cùng JVM) vs **streaming** (n thread, song song, throughput cao, không rollback xuyên thread, cho đa JVM).
- Cùng một JVM → chọn **subscribing**: (1) `@ProcessingGroup` trên projection, (2) `PropagatingErrorHandler` trong main class, (3) `mode: subscribing` trong yml.
- Kết quả: lỗi read side → write side **rollback** (sequence không tăng).
- Bắt riêng `CommandExecutionException` để thông điệp lỗi rõ.
- Đa JVM/microservice → rollback cần **Saga** (Phase 5-6).

**Bài kế tiếp** → [Bài 11: Nhân bản sang accounts/cards/loans và các flavor CQRS + CDC](11-replicate-flavors-cdc.md)

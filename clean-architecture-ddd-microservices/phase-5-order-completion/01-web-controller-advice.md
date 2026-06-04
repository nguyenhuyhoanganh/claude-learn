# Bài 20: REST Controller + ControllerAdvice

> Phase-2 và 3 đã có domain + application service. Bài này lắp ráp **lớp REST** — controller nhận HTTP, gọi input port, trả response. Kèm `ControllerAdvice` để map domain exception thành HTTP status code chuẩn.

## Module `order-application`

```text
order-application/src/main/java/com/food/ordering/system/order/service/application/
├── rest/
│   ├── OrderController.java
│   └── OrderApplicationServiceTestController.java   ← cho dev test
└── exception/
    └── OrderGlobalExceptionHandler.java             ← @ControllerAdvice
```

Dependency `pom.xml`:

```xml
<dependencies>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-application-service</artifactId>
    </dependency>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>common-application</artifactId>   <!-- global handler base -->
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
</dependencies>
```

## `OrderController`

```java
@Slf4j
@RestController
@RequestMapping(value = "/orders", produces = "application/vnd.api.v1+json")
@RequiredArgsConstructor
public class OrderController {

    private final OrderApplicationService orderApplicationService;

    @PostMapping
    public ResponseEntity<CreateOrderResponse> createOrder(@RequestBody CreateOrderCommand command) {
        log.info("Creating order for customer: {} at restaurant: {}",
            command.customerId(), command.restaurantId());
        CreateOrderResponse response = orderApplicationService.createOrder(command);
        log.info("Order created with tracking id: {}", response.orderTrackingId());
        return ResponseEntity.ok(response);
    }

    @GetMapping("/{trackingId}")
    public ResponseEntity<TrackOrderResponse> getOrderByTrackingId(@PathVariable UUID trackingId) {
        TrackOrderResponse response =
            orderApplicationService.trackOrder(TrackOrderQuery.builder().orderTrackingId(trackingId).build());
        log.info("Returning order status with tracking id: {}", trackingId);
        return ResponseEntity.ok(response);
    }
}
```

### Điểm cần chú ý

- **`produces = "application/vnd.api.v1+json"`** — versioning qua media type. Sau này version 2 thêm `v2+json`, route khác. URL không có `/v1/...` → cleaner.
- Controller cực mỏng — chỉ delegate sang application service. Không log business, không validate (`@Valid` đã làm).
- Trả `ResponseEntity` để có quyền control status code và header sau này.

## ControllerAdvice — handler global

### Base class chung `common-application`

```java
// common-application/src/main/java/com/food/ordering/system/application/handler/GlobalExceptionHandler.java
@Slf4j
@ControllerAdvice
public class GlobalExceptionHandler {

    @ResponseBody
    @ExceptionHandler(value = {Exception.class})
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ErrorDTO handleException(Exception exception) {
        log.error(exception.getMessage(), exception);
        return ErrorDTO.builder()
            .code(HttpStatus.INTERNAL_SERVER_ERROR.getReasonPhrase())
            .message("Unexpected error!")
            .build();
    }

    @ResponseBody
    @ExceptionHandler(value = {ConstraintViolationException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorDTO handleException(ConstraintViolationException validationException) {
        String violations = extractViolationsFromException(validationException);
        log.error(violations, validationException);
        return ErrorDTO.builder()
            .code(HttpStatus.BAD_REQUEST.getReasonPhrase())
            .message(violations)
            .build();
    }

    private String extractViolationsFromException(ConstraintViolationException ex) {
        return ex.getConstraintViolations().stream()
            .map(ConstraintViolation::getMessage)
            .collect(Collectors.joining("--"));
    }
}
```

```java
@Data
@Builder
public class ErrorDTO {
    private final String code;
    private final String message;
}
```

2 handler default:
- `Exception` → 500 + "Unexpected error" — fallback.
- `ConstraintViolationException` → 400 + chi tiết violation — sai input.

### Subclass cho Order — `OrderGlobalExceptionHandler`

```java
@Slf4j
@ControllerAdvice
public class OrderGlobalExceptionHandler extends GlobalExceptionHandler {

    @ResponseBody
    @ExceptionHandler(value = {OrderDomainException.class})
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorDTO handleException(OrderDomainException orderDomainException) {
        log.error(orderDomainException.getMessage(), orderDomainException);
        return ErrorDTO.builder()
            .code(HttpStatus.BAD_REQUEST.getReasonPhrase())
            .message(orderDomainException.getMessage())
            .build();
    }

    @ResponseBody
    @ExceptionHandler(value = {OrderNotFoundException.class})
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorDTO handleException(OrderNotFoundException orderNotFoundException) {
        log.error(orderNotFoundException.getMessage(), orderNotFoundException);
        return ErrorDTO.builder()
            .code(HttpStatus.NOT_FOUND.getReasonPhrase())
            .message(orderNotFoundException.getMessage())
            .build();
    }
}
```

Mapping:

| Exception | HTTP status | Khi nào |
|---|---|---|
| `OrderDomainException` | 400 Bad Request | Business rule violated (price wrong, state mismatch) |
| `OrderNotFoundException` | 404 Not Found | Track ID không tồn tại |
| `ConstraintViolationException` | 400 Bad Request | `@Valid` field fail |
| Khác | 500 Internal Server Error | Lỗi bất ngờ |

Subclass mở rộng base — dùng lại logic chung, chỉ thêm domain-specific exception.

## `OrderNotFoundException`

```java
public class OrderNotFoundException extends DomainException {
    public OrderNotFoundException(String message)               { super(message); }
    public OrderNotFoundException(String message, Throwable t)  { super(message, t); }
}
```

Đặt trong `order-domain-core`. Throw từ `OrderTrackCommandHandler` khi tracking ID không tồn tại.

## Test với Postman

```text
POST http://localhost:8181/orders
Content-Type: application/json

{
  "customerId": "d215b5f8-0249-4dc5-89a3-51fd148cfb41",
  "restaurantId": "d215b5f8-0249-4dc5-89a3-51fd148cfb45",
  "address": { "street": "street_1", "postalCode": "1000AB", "city": "Amsterdam" },
  "price": 200.00,
  "items": [
    {"productId": "d215b5f8-0249-4dc5-89a3-51fd148cfb48", "quantity": 1, "price": 50.00, "subTotal": 50.00},
    {"productId": "d215b5f8-0249-4dc5-89a3-51fd148cfb48", "quantity": 3, "price": 50.00, "subTotal": 150.00}
  ]
}
```

Response 200:

```json
{
  "orderTrackingId": "10f2e1e8-...",
  "orderStatus": "PENDING",
  "message": "Order created successfully"
}
```

Edge cases:
- Sai tổng price (250 thay vì 200) → 400 + "Total price 250.00 is not equal to Order items total 200.00!".
- Customer không tồn tại → 400 + "Could not find customer with id: ...".
- Restaurant inactive → 400 + "Restaurant ... is currently not active!".

## Versioning qua media type — chi tiết

```text
GET /orders/abc-123
Accept: application/vnd.api.v1+json
```

Spring `produces = "application/vnd.api.v1+json"` chỉ trả về nếu Accept match. Nếu khách yêu cầu `v2+json` mà chỉ có v1 → 406 Not Acceptable.

Tương lai thêm v2:

```java
@GetMapping(value = "/{id}", produces = "application/vnd.api.v2+json")
public ResponseEntity<TrackOrderResponseV2> getOrderByTrackingIdV2(...) {...}
```

Cùng URL, khác response shape. Client cũ vẫn dùng v1 — không break.

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Controller chứa logic business | Để application service làm. Controller mỏng. |
| Quên `@Valid` ở `@RequestBody` | Validation không chạy → DTO null pass thẳng. |
| Trả `Map<String, Object>` thay `ErrorDTO` | Mất type safety + format inconsistent. |
| Subclass `GlobalExceptionHandler` override base method (vô tình) | Method signature trùng → base mất tác dụng. |
| Throw `RuntimeException` không có handler | Hit default 500 — log unclear. Tạo exception cụ thể. |
| `@RestController` thiếu base path `/orders` | Endpoint phân tán → dễ trùng path. |
| Catch exception trong controller | Để advice xử lý — controller sạch. |
| Trả raw stack trace ra client | Lộ internal. ErrorDTO chỉ có message ngắn. |

## Tóm tắt bài 20

- `OrderController` mỏng: `@RestController`, delegate sang `OrderApplicationService`.
- Versioning qua **media type** `application/vnd.api.v1+json` — flexible.
- `GlobalExceptionHandler` ở `common-application` xử lý 500 và validation 400.
- `OrderGlobalExceptionHandler` extend base, thêm `OrderDomainException` → 400 và `OrderNotFoundException` → 404.
- `ErrorDTO` trả về với `code` + `message` ngắn gọn — không lộ stack trace.

**Bài kế tiếp** → [Bài 21: JPA Entity + Repository Adapter (Postgres)](02-jpa-data-access.md)

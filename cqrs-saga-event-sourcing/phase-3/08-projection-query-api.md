# Bài 8: Projection và Query API — hoàn thiện read side

Write side đã xong (bài 7): command được lưu event store và phát lên bus. Giờ read side phải **nghe** event đó cập nhật read DB (Projection), rồi cung cấp API đọc (Query Controller → QueryGateway → QueryHandler). Xong bài này là một vòng CQRS hoàn chỉnh.

## Projection — nghe event, cập nhật read DB

> **Projection** (Phase 2) = view chỉ-đọc dựng từ chuỗi event. Nó consume event từ bus và lưu **current state** vào read DB để query đọc nhanh.

Trong `query/projection`:

```java
@Component
@RequiredArgsConstructor
public class CustomerProjection {

    private final ICustomerService customerService;

    @EventHandler
    public void on(CustomerCreatedEvent event) {
        Customer customerEntity = new Customer();
        BeanUtils.copyProperties(event, customerEntity);   // event → JPA entity
        customerService.createCustomer(customerEntity);    // lưu read DB (H2)
    }

    @EventHandler
    public void on(CustomerUpdatedEvent event) {
        customerService.updateCustomer(event);   // truyền thẳng event vào service
    }

    @EventHandler
    public void on(CustomerDeletedEvent event) {
        customerService.deleteCustomer(event.getCustomerId());
    }
}
```

| Phần | Giải thích |
|---|---|
| `@Component` | Để Spring tạo bean |
| `@EventHandler` (khác `@EventSourcingHandler`!) | Method này xử lý event **consume từ event bus** để cập nhật read DB |
| Read DB ở đây | Vẫn dùng **H2** (cùng DB phase 1). Production có thể MySQL/Postgres |

> **`@EventHandler` vs `@EventSourcingHandler` — đừng nhầm**:
> - `@EventSourcingHandler` (trong **aggregate**, bài 7): áp event để **lưu event store** phía ghi.
> - `@EventHandler` (trong **projection**, đây): xử lý event **consume từ bus** để **lưu read DB** phía đọc.

## Vì sao validate LẠI ở read side? — idempotency

Trong `createCustomer` của service (read side), ta vẫn kiểm tra trùng mobileNumber — **dù** aggregate đã validate rồi:

```java
public void createCustomer(Customer customer) {
    customerRepository.findByMobileNumberAndActiveSw(customer.getMobileNumber(), true)
        .ifPresent(c -> { throw new CustomerAlreadyExistException(...); });
    customerRepository.save(customer);
}
```

> **Vì sao tưởng thừa nhưng cần?** Event có thể bị **consume nhiều lần** (retry, lỗi mạng, replay). Nếu không kiểm tra, một event create bị xử lý 2 lần → 2 record trùng. Validate lại ở read side đảm bảo **idempotency** (xử lý lặp vẫn ra kết quả đúng). Luôn validate ở read side, đừng tin event chỉ đến đúng một lần.

Update ở service: load theo mobileNumber, nếu không có → `ResourceNotFoundException`; có thì map `name`+`email` từ event (qua `CustomerMapper.mapEventToCustomer`) rồi save. Delete: set `activeSw=false`.

## Query API — Controller, QueryGateway, QueryHandler

Đọc cũng phải đi qua "đúng flow" Axon (không đọc thẳng read DB từ controller). Ba mảnh:

### 1. Query Controller — build query, dispatch qua QueryGateway

```java
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class CustomerQueryController {

    private final QueryGateway queryGateway;

    @GetMapping("/fetch")
    public ResponseEntity<CustomerDto> fetchCustomer(@RequestParam String mobileNumber) {
        FindCustomerQuery query = new FindCustomerQuery(mobileNumber);

        CustomerDto customerDto = queryGateway.query(
                query,
                ResponseTypes.instanceOf(CustomerDto.class)   // kỳ vọng 1 CustomerDto
        ).join();                                              // chờ kết quả

        return ResponseEntity.status(HttpStatus.OK).body(customerDto);
    }
}
```

| Phần | Giải thích |
|---|---|
| `QueryGateway` | Bean Axon (đối xứng `CommandGateway`) để dispatch query |
| `ResponseTypes.instanceOf(CustomerDto.class)` | Báo Axon kiểu kết quả mong đợi (một object). Có `multipleInstancesOf` cho list |
| `.join()` | `query()` chạy **async** (trả CompletableFuture); `join()` **chờ** lấy kết quả để trả về client |

### 2. Query Handler — xử lý query, đọc read DB

Trong `query/handler`:

```java
@Component
@RequiredArgsConstructor
public class CustomerQueryHandler {

    private final ICustomerService customerService;

    @QueryHandler
    public CustomerDto findCustomer(FindCustomerQuery query) {
        return customerService.fetchCustomer(query.getMobileNumber());
    }
}
```

- `@QueryHandler`: method này xử lý `FindCustomerQuery`, đọc read DB qua service, trả `CustomerDto`.

```text
   GET /fetch?mobileNumber=...
        │ build FindCustomerQuery
        ▼
   QueryGateway.query(...)  ──►  CustomerQueryHandler.findCustomer  @QueryHandler
        │ .join() chờ                      │ fetchCustomer(mobileNumber)
        ▼                                  ▼
   CustomerDto  ◄────────────────────  READ DATABASE
```

## Vì sao không đọc thẳng read DB từ controller?

Bạn có thể bị cám dỗ: bỏ query object + query handler, đọc thẳng read DB trong controller cho nhanh. **Đừng**. Đi đúng flow Axon cho bạn:
- **Linh hoạt**: dựng nhiều query + query handler tùy nhu cầu nghiệp vụ.
- **Giám sát**: Axon dashboard đếm/theo dõi query (số lần chạy, số lỗi) — bài demo sẽ thấy.
- Đồng nhất với phần command (đối xứng, dễ bảo trì).

## Tóm tắt bài 8

- **Projection** (`@Component` + `@EventHandler`): consume event từ bus → lưu **read DB**. Phân biệt rõ `@EventHandler` (read side) với `@EventSourcingHandler` (write side).
- **Validate lại ở read side** để **idempotency** — event có thể đến nhiều lần.
- **Query API** ba mảnh: `CustomerQueryController` (build query + `QueryGateway.query(...).join()`), `CustomerQueryHandler` (`@QueryHandler` đọc read DB). Dùng `ResponseTypes.instanceOf`.
- Không đọc thẳng read DB từ controller — đi đúng flow để được linh hoạt + giám sát.
- Một vòng CQRS hoàn chỉnh đã chạy. Bài sau: demo + công cụ.

**Bài kế tiếp** → [Bài 9: Demo, Interceptor validation, đọc EventStore và plugin](09-demo-interceptor-eventstore-plugin.md)

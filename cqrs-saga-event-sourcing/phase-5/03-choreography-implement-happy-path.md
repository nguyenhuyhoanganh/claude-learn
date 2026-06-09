# Bài 3: Hiện thực Choreography Saga — happy path

Giờ code luồng thành công: khách đổi số → customer cập nhật → phát event → accounts → cards → loans → phát event "hoàn tất" về customer. Ta dùng **Spring Cloud Stream + Function + RabbitMQ**. Bài này dựng toàn bộ đường đi happy path; compensation để bài sau.

## Chuẩn bị: dependencies + RabbitMQ

Thêm vào pom của cả 4 service (customer/accounts/cards/loans):

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-stream</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-stream-binder-rabbit</artifactId>
</dependency>
```

> **Spring Cloud Function tự về theo**: khi thêm `spring-cloud-stream`, nó kéo theo `spring-cloud-function-context` — không cần khai báo riêng.

Chạy RabbitMQ bằng Docker (lệnh lấy từ trang chủ RabbitMQ), rồi khai báo kết nối trong `application.yml` mỗi service:

```yaml
spring:
  rabbitmq:
    host: localhost
    port: 5672
    username: guest
    password: guest
    connection-timeout: 10s
```

## DTO dùng chung trong common

API đổi số nhận hai số (cũ + mới); DTO dùng xuyên service → đặt trong `common`:

```java
@Data
public class MobileNumberUpdateDto {
    @NotEmpty @Pattern(regexp = "(^$|[0-9]{10})")
    private String currentMobileNumber;
    @NotEmpty @Pattern(regexp = "(^$|[0-9]{10})")
    private String newMobileNumber;
}
```

(Thêm `spring-boot-starter-validation` vào pom của `common` để dùng `@NotEmpty`/`@Pattern`.)

## API khởi đầu Saga — Customer

```java
@PatchMapping("/mobile-number")
public ResponseEntity<ResponseDto> updateMobileNumber(
        @Valid @RequestBody MobileNumberUpdateDto dto) {
    customerService.updateMobileNumber(dto);
    return ResponseEntity.ok(new ResponseDto("200", "Request processed successfully"));
}
```

Trong `CustomerServiceImpl`, cập nhật số rồi **phát event** sang accounts:

```java
@RequiredArgsConstructor @Slf4j
public class CustomerServiceImpl implements ICustomerService {

    private final CustomerRepository repository;
    private final StreamBridge streamBridge;     // ← của Spring Cloud Function

    public boolean updateMobileNumber(MobileNumberUpdateDto dto) {
        Customer customer = repository
            .findByMobileNumberAndActiveSw(dto.getCurrentMobileNumber(), true)
            .orElseThrow(() -> new ResourceNotFoundException("Customer","mobileNumber",dto.getCurrentMobileNumber()));
        customer.setMobileNumber(dto.getNewMobileNumber());   // T1
        repository.save(customer);

        updateAccountMobileNumber(dto);      // phát event sang accounts
        return true;
    }

    private void updateAccountMobileNumber(MobileNumberUpdateDto dto) {
        log.info("Sending updateAccountMobileNumber request: {}", dto);
        var result = streamBridge.send("updateAccountMobileNumber-out-0", dto);
        log.info("Is updateAccountMobileNumber triggered successfully? {}", result);
    }
}
```

> **`StreamBridge.send(binding, payload)`**: phát một message tới một **binding** (kênh). Trả `boolean` xác nhận đã gửi.

## Binding, destination, group — cấu hình Spring Cloud Stream

Đây là phần dễ rối nhất. Quy ước tên binding: `<function>-out-0` (gửi đi) và `<function>-in-0` (nhận về).

**Phía gửi (Customer `application.yml`):**

```yaml
spring:
  cloud:
    stream:
      bindings:
        updateAccountMobileNumber-out-0:
          destination: update-account-mobile-number
```

**Phía nhận (Accounts `application.yml`):**

```yaml
spring:
  cloud:
    function:
      definition: updateAccountMobileNumber       # ← tên function xử lý
    stream:
      bindings:
        updateAccountMobileNumber-in-0:
          destination: update-account-mobile-number   # PHẢI khớp destination bên gửi
          group: ${spring.application.name}            # = "accounts"
```

```text
Customer  ──send("updateAccountMobileNumber-out-0")──►  destination
                                              "update-account-mobile-number"
                                                          │
Accounts  ◄──"updateAccountMobileNumber-in-0" (cùng destination)──┘
              │ function.definition = updateAccountMobileNumber
              ▼
          function `updateAccountMobileNumber` chạy logic
```

Ba điểm khớp **bắt buộc**:

| Thành phần | Quy tắc |
|---|---|
| `destination` | **Giống nhau** ở cả bên gửi (`-out-0`) và bên nhận (`-in-0`) |
| prefix binding | Khớp với `function.definition` (vd `updateAccountMobileNumber`) |
| `function.definition` | = tên method function bên nhận |

### Vì sao `group` chỉ ở bên nhận (consumer)?

> **Consumer group**: bên nhận (consumer) khai `group` để khi có **nhiều instance** (vd 10 instance accounts), tất cả vào **cùng một group** → message **chỉ** được giao cho **một** instance (load balancing), không phải mọi instance đều xử lý. Bên gửi (producer) **không** cần group vì không có chuyện load-balance lúc phát.

## Function xử lý — Spring Cloud Function

Bên Accounts, tạo function consume event:

```java
@Configuration @Slf4j
public class AccountFunctions {

    @Bean
    public Consumer<MobileNumberUpdateDto> updateAccountMobileNumber(IAccountService service) {
        return dto -> {
            log.info("Received updateAccountMobileNumber request: {}", dto);
            service.updateMobileNumber(dto);   // T2: cập nhật accounts + phát sang cards
        };
    }
}
```

| Điểm | Giải thích |
|---|---|
| `@Bean` | Để Spring Cloud Function quản function |
| **Tên method = `function.definition`** | `updateAccountMobileNumber` phải khớp yml |
| `Consumer<T>` | Chỉ nhận input, không trả output (chỉ consume + tự phát tiếp). (`Function<I,O>` nếu cần trả; `Supplier<O>` nếu chỉ phát) |

`AccountServiceImpl.updateMobileNumber` cập nhật số rồi `streamBridge.send("updateCardMobileNumber-out-0", dto)` sang cards. Cards làm tương tự sang loans.

## Kết thúc chuỗi — Loans phát event "hoàn tất"

Loans là service cuối. Sau khi cập nhật, **không** còn service kế tiếp. Hai lựa chọn:
1. Dừng hẳn.
2. **Phát một event "status hoàn tất"** về lại customer (service khởi đầu) để biết Saga xong.

Chọn (2): loans `streamBridge.send("updateMobileNumberStatus-out-0", dto)` → customer có function `updateMobileNumberStatus` nghe, log/cập nhật cờ. Client có thể **poll** customer để biết trạng thái tổng.

```text
Customer → Accounts → Cards → Loans
   ▲                            │ phát "status hoàn tất"
   └────────────────────────────┘  (customer nghe → biết Saga xong)
```

## Demo happy path — quan sát RabbitMQ

Khởi động đủ 6 service + RabbitMQ. Mở dashboard RabbitMQ (`localhost:15672`, guest/guest):

| Tab | Thấy gì |
|---|---|
| **Connections** | 4 connection = 4 microservice |
| **Exchanges** | 4 exchange = 4 destination ta đặt |
| **Queues** | Queue tên `<destination>.<group>`; nhiều instance cùng group = một consumer group, chỉ một instance xử lý mỗi message |

Tạo data với cùng mobileNumber, gọi API đổi số. Theo log từng service: customer → "is updateAccountMobileNumber triggered? true" → accounts → cards → loans → customer nhận "received updateMobileNumberStatus". Kiểm tra `fetchCustomerSummary`: cả 4 service đều có **số mới**. Happy path chạy.

## Tóm tắt bài 3

- Stack: `spring-cloud-stream` + `binder-rabbit` (Function tự về); RabbitMQ qua Docker; `MobileNumberUpdateDto` trong `common`.
- **`StreamBridge.send("<fn>-out-0", payload)`** phát event; function `@Bean Consumer<T>` (tên = `function.definition`) consume.
- Khớp bắt buộc: **destination giống nhau** hai đầu; prefix binding = function.definition; tên method = definition.
- **Consumer group** chỉ ở bên nhận → load-balance giữa nhiều instance; producer không cần.
- Chuỗi: customer→accounts→cards→loans→(phát status)→customer; client **poll** trạng thái tổng.
- Demo: RabbitMQ dashboard cho thấy connections/exchanges/queues; số mới đồng bộ cả 4 service.

**Bài kế tiếp** → [Bài 4: Compensation transactions và demo hoàn chỉnh](04-choreography-compensation-transactions.md)

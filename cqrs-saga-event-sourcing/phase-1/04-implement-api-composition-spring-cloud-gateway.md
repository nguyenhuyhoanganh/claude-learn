# Bài 4: Implement API Composition bằng Spring Cloud Gateway

Bài 2 nói về *lý thuyết* API Composition; bài này *code thật*. Ta sẽ biến Spring Cloud Gateway thành một **API Composer**: nhận một request `customerSummary`, gọi **song song** cả 4 microservice bằng reactive, gom kết quả thành một object rồi trả về — tất cả trong ~66ms. Đây là phần code production-grade quan trọng nhất của Phase 1.

Toàn bộ thay đổi nằm **trong gateway server**. Các microservice giữ nguyên.

## Vì sao là WebClient, không phải Feign?

Đây là quyết định nền tảng. Composer cần gọi 4 service **song song, non-blocking** để giảm latency.

| | OpenFeign | WebClient |
|---|---|---|
| Mô hình | Blocking (mỗi call chiếm 1 thread đến khi có response) | **Non-blocking, reactive** |
| Gọi song song nhiều service | Khó, tốn thread | Tự nhiên, ít thread |
| Hợp với Spring Cloud Gateway | Không (gateway là reactive stack) | **Có** (cùng stack reactive) |

Spring Cloud Gateway xây trên **reactive programming** (lập trình phản ứng) để phục vụ lượng request lớn với ít thread + ít bộ nhớ. Feign là blocking → không hòa hợp. Vì vậy ta dùng **WebClient**.

Trong reactive, hai kiểu trả về cốt lõi:

| Kiểu | Khi nào dùng |
|---|---|
| **`Mono<T>`** | Kỳ vọng **một** object (vd một `CustomerDto`) |
| **`Flux<T>`** | Kỳ vọng **nhiều** object / luồng (collection, stream) |

`Mono<ResponseEntity<CustomerDto>>` nghĩa là: "tôi sẽ trả một response chứa một CustomerDto, **bất đồng bộ** — thread không đứng chờ".

## Bước 1: Các DTO hứng dữ liệu từng service

Mỗi service trả một mảnh; ta cần một DTO cho mỗi mảnh, rồi một DTO tổng hợp.

```java
@Data
public class CustomerDto {
    @NotEmpty @Size(min = 5, max = 30) private String name;
    @NotEmpty @Email                   private String email;
    @Pattern(regexp = "(^$|[0-9]{10})") private String mobileNumber;
    private boolean activeSw;
}

@Data
public class AccountsDto {
    private Long   accountNumber;
    private String accountType;
    private String branchAddress;
    private boolean activeSw;
}

@Data
public class CardsDto {
    private String cardNumber, cardType;
    private int totalLimit, amountUsed, availableAmount;
    private boolean activeSw;
}

@Data
public class LoansDto {
    private String loanNumber, loanType;
    private int totalLoan, amountPaid, outstandingAmount;
    private boolean activeSw;
}
```

DTO tổng hợp gom cả bốn — đây là thứ client nhận về:

```java
@Data @AllArgsConstructor
public class CustomerSummaryDto {
    private CustomerDto customer;
    private AccountsDto accounts;
    private LoansDto    loans;
    private CardsDto    cards;
}
```

## Bước 2: HTTP Interface khai báo cách gọi từng service

Spring 6 có **HTTP Interface** (`@HttpExchange`/`@GetExchange`) — bạn khai báo method *declarative* (mô tả ý định), framework sinh proxy gọi thật. Đây là "phiên bản reactive" của Feign:

```java
public interface CustomerSummaryClient {

    @GetExchange(value = "/eazybank/customer/api/fetch", accept = "application/json")
    Mono<ResponseEntity<CustomerDto>> fetchCustomerDetails(
            @RequestParam("mobileNumber") String mobileNumber);

    @GetExchange(value = "/eazybank/accounts/api/fetch", accept = "application/json")
    Mono<ResponseEntity<AccountsDto>> fetchAccountDetails(
            @RequestParam("mobileNumber") String mobileNumber);

    @GetExchange(value = "/eazybank/loans/api/fetch", accept = "application/json")
    Mono<ResponseEntity<LoansDto>> fetchLoanDetails(
            @RequestParam("mobileNumber") String mobileNumber);

    @GetExchange(value = "/eazybank/cards/api/fetch", accept = "application/json")
    Mono<ResponseEntity<CardsDto>> fetchCardDetails(
            @RequestParam("mobileNumber") String mobileNumber);
}
```

- `@GetExchange("...")`: đường dẫn gateway dùng để gọi service (prefix `/eazybank/<service>` đã được gateway route tới đúng microservice — xem bài 3).
- Trả `Mono<...>` → gọi bất đồng bộ, thread không chờ.

> **BẪY KINH ĐIỂN — phải nhớ**: dù tên tham số method đã là `mobileNumber`, bạn **vẫn phải** ghi rõ `@RequestParam("mobileNumber")`. Tên tham số Java **không** được giữ lại qua reflection ở runtime mặc định. Bỏ qua, bạn nhận lỗi runtime:
> ```
> Name for argument of type [String] not specified,
> and parameter name information not available via reflection.
> ```
> Đây đúng là lỗi giảng viên gặp trong demo. Luôn ghi tên param tường minh.

## Bước 3: Config WebClient → HTTP Interface proxy

HTTP Interface chỉ là khai báo; cần một "nhà máy" sinh proxy thật, gắn với WebClient biết base URL:

```java
@Configuration
public class ClientConfig {

    @Value("${app.base-url}")          // đọc từ application.yml → đổi được theo môi trường
    private String baseUrl;

    @Bean
    public CustomerSummaryClient customerClient() {
        WebClient webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .build();

        // Bọc WebClient để framework dùng được:
        // WebClientAdapter -> ReactorHttpExchangeAdapter -> HttpExchangeAdapter
        WebClientAdapter adapter = WebClientAdapter.create(webClient);

        HttpServiceProxyFactory factory = HttpServiceProxyFactory
                .builderFor(adapter)
                .build();

        // Sinh proxy thật cho interface declarative
        return factory.createClient(CustomerSummaryClient.class);
    }
}
```

`application.yml` của gateway:

```yaml
app:
  base-url: localhost:8072      # PORT CỦA GATEWAY (không phải Eureka 8070!)
```

> **BẪY THỨ HAI — giảng viên cũng dính**: `base-url` phải là port **gateway (8072)**, không phải Eureka (8070). Mọi lời gọi microservice đều đi *qua gateway*, nên base URL phải trỏ về chính gateway. Ghi nhầm 8070 → runtime error.

Vì sao phải bọc qua `WebClientAdapter`? `HttpServiceProxyFactory.builderFor(...)` cần một `HttpExchangeAdapter`, mà WebClient không phải kiểu đó. `WebClientAdapter` là cầu nối: nó `extends AbstractReactorHttpExchangeAdapter implements ReactorHttpExchangeAdapter → HttpExchangeAdapter`. Tóm lại: nó "đóng gói" WebClient để các class framework khác (như factory) dùng được.

```text
WebClient (biết baseUrl)
   │  WebClientAdapter.create(...)
   ▼
WebClientAdapter  ──implements──►  HttpExchangeAdapter
   │  HttpServiceProxyFactory.builderFor(adapter)
   ▼
HttpServiceProxyFactory  ──createClient(interface)──►  proxy gọi thật
```

## Bước 4: Handler — gọi song song và gom bằng Mono.zip

Đây là trái tim của composer. Gọi 4 service song song, chờ tất cả, gom thành một object:

```java
@Component @RequiredArgsConstructor
public class CustomerCompositeHandler {

    private final CustomerSummaryClient client;

    public Mono<ServerResponse> fetchCustomerSummary(ServerRequest request) {
        String mobileNumber = request.queryParam("mobileNumber").orElseThrow();

        // 4 lời gọi: KHÔNG block — thread không chờ response của dòng trên
        // mà chạy thẳng xuống dòng dưới → cả 4 được khởi chạy song song.
        Mono<ResponseEntity<CustomerDto>> customer = client.fetchCustomerDetails(mobileNumber);
        Mono<ResponseEntity<AccountsDto>> accounts = client.fetchAccountDetails(mobileNumber);
        Mono<ResponseEntity<LoansDto>>    loans    = client.fetchLoanDetails(mobileNumber);
        Mono<ResponseEntity<CardsDto>>    cards    = client.fetchCardDetails(mobileNumber);

        // zip: CHỜ cả 4 hoàn tất, gói kết quả vào một Tuple4
        return Mono.zip(customer, accounts, loans, cards)
            .flatMap(tuple -> {
                CustomerDto c = tuple.getT1().getBody();
                AccountsDto a = tuple.getT2().getBody();
                LoansDto    l = tuple.getT3().getBody();
                CardsDto    cd = tuple.getT4().getBody();

                CustomerSummaryDto summary = new CustomerSummaryDto(c, a, l, cd);

                return ServerResponse.ok()
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(BodyInserters.fromValue(summary));
            });
    }
}
```

Hai khái niệm cốt lõi:

- **`ServerRequest` / `ServerResponse`**: phiên bản reactive của `HttpServletRequest`/`HttpServletResponse`. Reactive stack không dùng servlet, nên dùng cặp này.
- **`Mono.zip(...)`**: chờ tất cả Mono phát xong, gom vào một **`Tuple`**. `Tuple` khác `List/Set` ở chỗ nó giữ **nhiều phần tử khác kiểu** — ở đây `Tuple4` chứa 4 ResponseEntity khác kiểu, lấy ra bằng `getT1()..getT4()`.

```text
   t=0ms   khởi chạy song song:
           ├─ customer ─┐
           ├─ accounts ─┤
           ├─ loans   ──┤  (4 call chạy đồng thời, không nối đuôi)
           └─ cards   ──┘
                        ▼  Mono.zip CHỜ đến khi cả 4 xong
   t≈66ms  → Tuple4 → flatMap gom thành CustomerSummaryDto → ServerResponse
```

## Bước 5: Functional Router — không có @RestController

Trong reactive stack, **không** dùng `@RestController` để map URL. Thay vào đó khai báo **functional endpoint** bằng `RouterFunction`:

```java
@Configuration(proxyBeanMethods = false)   // tối ưu thời gian khởi động gateway
public class CustomerCompositeRouter {

    @Bean
    public RouterFunction<ServerResponse> routerFunction(CustomerCompositeHandler handler) {
        return RouterFunctions.route(
            RequestPredicates.GET("/api/composite/fetch/customerSummary")
                .and(RequestPredicates.accept(MediaType.APPLICATION_JSON))
                .and(RequestPredicates.queryParam("mobileNumber", v -> true)),
            handler::fetchCustomerSummary
        );
    }
}
```

Cách đọc: "Khi có **GET** tới `/api/composite/fetch/customerSummary`, **chấp nhận JSON**, **có queryParam `mobileNumber`** → gọi `handler.fetchCustomerSummary`". Nếu request không thỏa đủ các predicate này, handler không bao giờ chạy.

| Thành phần REST truyền thống | Tương đương reactive functional |
|---|---|
| `@RestController` + `@GetMapping` | `RouterFunctions.route(predicate, handler)` |
| Tham số method `(@RequestParam ...)` | `RequestPredicates.queryParam(...)` |
| Trả `ResponseEntity` | Trả `Mono<ServerResponse>` |

## Kết quả & vì sao nhanh

Gọi `GET localhost:8072/api/composite/fetch/customerSummary?mobileNumber=...` (sau khi đã tạo data ở cả 4 service) trả về object gồm 4 mảnh trong **~66ms**.

```json
{
  "customer": { "name": "...", "email": "...", "mobileNumber": "..." },
  "accounts": { "accountNumber": ..., "accountType": "Savings" },
  "loans":    { "loanNumber": "...", "outstandingAmount": ... },
  "cards":    { "cardNumber": "...", "availableAmount": ... }
}
```

Nếu làm cùng việc này bằng Feign (blocking), 4 service sẽ bị gọi **tuần tự**: tổng thời gian ≈ tổng latency từng service. Với WebClient reactive, chúng chạy **song song** → tổng thời gian ≈ service chậm nhất. Đó là lý do con số 66ms ấn tượng.

```text
Feign (blocking, tuần tự):   [customer][accounts][loans][cards]  → cộng dồn
WebClient (song song):       [customer]
                             [accounts]   → ~max(của 4)  ≈ 66ms
                             [loans]
                             [cards]
```

## Tóm tắt bài 4

- Toàn bộ thay đổi nằm trong **gateway**; gateway trở thành **API Composer** (Gateway Aggregator Pattern).
- Dùng **WebClient** (reactive, non-blocking) thay Feign (blocking) để gọi 4 service song song.
- Năm bước: DTO → **HTTP Interface** (`@GetExchange`, trả `Mono`) → **ClientConfig** (WebClient + WebClientAdapter + HttpServiceProxyFactory) → **Handler** (`Mono.zip` + `Tuple4` + `flatMap`) → **Functional Router** (`RouterFunctions.route`, không `@RestController`).
- Hai bẫy: (1) phải ghi rõ `@RequestParam("mobileNumber")` — reflection không giữ tên param; (2) `base-url` là port **gateway 8072**, không phải Eureka 8070.
- Kết quả ~66ms nhờ gọi song song; Feign tuần tự sẽ chậm hơn hẳn.
- Nhắc lại giới hạn: pattern này chỉ cho **READ** + dự án nhỏ/vừa. Enterprise → CQRS (Phase 2-3).

**Bài kế tiếp** → [Bài 5: Data Consistency, Complex Transactions và Data Duplication](05-data-consistency-transactions-duplication.md)

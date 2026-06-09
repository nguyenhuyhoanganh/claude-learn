# Bài 3: Hiện thực Profile microservice và publish events

Đã có thiết kế (bài 2). Giờ code: tạo microservice `profile` chỉ-đọc, để 4 service nguồn **publish event** mỗi khi data đổi, và để `profile` **nghe** event cập nhật materialized view. Bài này gồm các kỹ thuật quan trọng: event dùng chung ở `common`, ba cách phát nhiều event, và cấu hình **XStream** để serialize event xuyên service.

## Tạo microservice `profile`

Copy từ `customer`, đổi tên, rồi **bỏ toàn bộ phần command** (profile chỉ đọc):

| Thay đổi | Chi tiết |
|---|---|
| `application.yml` | port `8084`, name `profile`, H2 file `profile`; **giữ** `axon.axonserver.servers` (để nhận event), **bỏ** `eventhandling.processors` (không có command) |
| Package | đổi `com.eazybytes.customer` → `...profile`; **xóa** package `command` |
| Class | `ProfileQueryController` (API `/api/profile`), `FindProfileQuery` (theo mobileNumber), `ProfileQueryHandler`, `ProfileProjection`, `Profile` entity, `ProfileRepository`, `ProfileServiceImpl` |
| Gateway | thêm route `/eazybank/profile/**` → `lb://PROFILE` |

`Profile` entity (materialized view):

```java
@Entity @Data
public class Profile {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long profileId;
    private String name;
    private String mobileNumber;
    private boolean activeSw;
    private long accountNumber;   // nullable/0 — cập nhật dần
    private long cardNumber;
    private long loanNumber;
}
```

> `profile` **không** có aggregate/command — nó chỉ subscribe event và cung cấp query API. Vẫn cần kết nối Axon Server vì event bus chính là Axon Server.

## Event dùng chung — đặt trong `common`

Trước đây event (vd `CustomerCreatedEvent`) nằm trong từng service. Nhưng event "data changed" được **dùng chung** bởi cả service nguồn (phát) và `profile` (consume) → phải đặt trong **`common`**:

```text
common/src/.../com/eazybytes/common/event/
   ├── CustomerDataChangedEvent   { name, mobileNumber, activeSw }
   ├── AccountDataChangedEvent    { mobileNumber, accountNumber }
   ├── LoanDataChangedEvent       { mobileNumber, loanNumber }
   └── CardDataChangedEvent       { mobileNumber, cardNumber }
```

```java
@Data
public class CustomerDataChangedEvent {
    private String name;
    private String mobileNumber;     // dùng để định danh record trong profile
    private boolean activeSw;
}
@Data
public class AccountDataChangedEvent {
    private String mobileNumber;
    private long accountNumber;      // không cần activeSw — xóa thì để 0
}
```

Mỗi event chỉ mang **đúng field** profile cần — không phải toàn bộ data của service. `mobileNumber` luôn có vì đó là khóa định danh trong profile.

## Phát event từ service nguồn — ba cách

Mỗi service nguồn, khi command xử lý xong, phải phát thêm event "data changed" cho profile. Có **ba** cách (đều hợp lệ):

### Cách 1: `apply().andThenApply()` — chuỗi event trong aggregate

```java
// Trong CustomerAggregate, @CommandHandler create:
CustomerCreatedEvent created = new CustomerCreatedEvent();
BeanUtils.copyProperties(command, created);

CustomerDataChangedEvent changed = new CustomerDataChangedEvent();
BeanUtils.copyProperties(command, changed);

AggregateLifecycle.apply(created)
    .andThenApply(() -> changed);   // event 2 phát ngay sau event 1, không điều kiện
```

`apply()` trả `ApplyMore` → `andThenApply()` cho phép phát thêm event (vô điều kiện). Dùng khi muốn event 2 đi ngay sau event 1.

### Cách 2: gọi `apply()` nhiều lần

```java
// Trong @CommandHandler update:
AggregateLifecycle.apply(updatedEvent);
AggregateLifecycle.apply(changedEvent);   // gọi apply() lần nữa cho event khác
```

Gọi `apply()` nhiều dòng với event khác nhau — tất cả đều được dispatch.

### Cách 3: `EventGateway` — khi KHÔNG ở trong aggregate

Vấn đề: `DeleteCustomerCommand` **chỉ có `customerId`**, không có `mobileNumber` → aggregate không phát được `CustomerDataChangedEvent` (cần mobileNumber để profile định danh). Giải: phát event từ **`CustomerServiceImpl`** (đã load entity có mobileNumber từ DB). Nhưng đây **không phải aggregate** → không dùng `AggregateLifecycle`. Dùng **`EventGateway`**:

```java
// Trong CustomerServiceImpl.deleteCustomer (sau khi set activeSw=false)
@RequiredArgsConstructor
public class CustomerServiceImpl ... {
    private final EventGateway eventGateway;

    public void deleteCustomer(String customerId) {
        Customer entity = ...; // load theo customerId
        entity.setActiveSw(false);
        repository.save(entity);

        CustomerDataChangedEvent event = new CustomerDataChangedEvent();
        event.setMobileNumber(entity.getMobileNumber());   // lấy từ entity đã load
        event.setActiveSw(false);
        eventGateway.publish(event);   // phát từ class thường (non-aggregate)
    }
}
```

| Cách | Dùng khi |
|---|---|
| `apply().andThenApply()` | Trong aggregate, phát thêm event nối tiếp |
| `apply()` nhiều lần | Trong aggregate, nhiều event độc lập |
| `EventGateway.publish()` | **Ngoài** aggregate (vd ServiceImpl), hoặc thiếu data trong command |

> Nếu **không** dùng Axon mà dùng Kafka/RabbitMQ, bạn sẽ phát event bằng Spring Cloud Stream thay vì các cách trên. Bản chất giống nhau: phát event khi data đổi.

Áp dụng tương tự cho accounts/cards/loans (mỗi cái phát `AccountDataChangedEvent`/...). Khi xóa, set số về **0** (sẽ giải thích bẫy `0L` bên dưới).

## ProfileProjection — nghe và cập nhật view

```java
@Component @ProcessingGroup("profile-group")
@RequiredArgsConstructor
public class ProfileProjection {
    private final IProfileService profileService;

    @EventHandler
    public void on(CustomerDataChangedEvent event) { profileService.handleCustomerDataChangedEvent(event); }
    @EventHandler
    public void on(AccountDataChangedEvent event)  { profileService.handleAccountDataChangedEvent(event); }
    @EventHandler
    public void on(LoanDataChangedEvent event)     { profileService.handleLoanDataChangedEvent(event); }
    @EventHandler
    public void on(CardDataChangedEvent event)     { profileService.handleCardDataChangedEvent(event); }
}
```

Logic service `handleCustomerDataChangedEvent` — **upsert** (insert nếu chưa có, update nếu có):

```java
public void handleCustomerDataChangedEvent(CustomerDataChangedEvent event) {
    Profile profile = profileRepository
        .findByMobileNumberAndActiveSw(event.getMobileNumber(), true)
        .orElseGet(Profile::new);   // chưa có → tạo mới

    profile.setMobileNumber(event.getMobileNumber());
    profile.setActiveSw(event.isActiveSw());
    if (event.getName() != null) {       // chỉ set name nếu event có name
        profile.setName(event.getName());
    }
    profileRepository.save(profile);
}
```

> **Bẫy null name khi delete**: event delete chỉ gửi `mobileNumber` + `activeSw`, **không** có `name`. Nếu set thẳng `name = null` → save thất bại (cột name là NOT NULL). Vì vậy chỉ set name **khi event có name**.

Còn `handleAccountDataChangedEvent` thì **yêu cầu profile đã tồn tại** (customer phải được tạo trước):

```java
public void handleAccountDataChangedEvent(AccountDataChangedEvent event) {
    Profile profile = profileRepository
        .findByMobileNumberAndActiveSw(event.getMobileNumber(), true)
        .orElseThrow(() -> new ResourceNotFoundException("Profile","mobileNumber",event.getMobileNumber()));
    profile.setAccountNumber(event.getAccountNumber());
    profileRepository.save(profile);
}
```

## Cấu hình XStream — cho phép serialize event xuyên service

Demo đầu sẽ **lỗi security**: customer phát `CustomerDataChangedEvent` sang profile (hai JVM khác nhau) → object phải **serialize** qua mạng. Axon mặc định **chặn** serialize vì lý do bảo mật. Phải whitelist package trong `common` (dùng chung mọi service):

```java
@Configuration
public class AxonConfig {
    @Bean
    public XStream xStream() {   // com.thoughtworks.xstream.XStream
        XStream xStream = new XStream();
        xStream.allowTypesByWildcard(new String[] { "com.eazybytes.**" });
        return xStream;
    }
}
```

Rồi `@Import(AxonConfig.class)` vào **mọi** Spring Boot main class (customer/accounts/cards/loans/profile).

> Whitelist `com.eazybytes.**` cho phép serialize mọi class trong package gốc — tiện cho tương lai (thêm event mới không phải sửa). Muốn chặt hơn, chỉ định `com.eazybytes.common.event`.

## Ba bẫy runtime đáng nhớ

| Bẫy | Triệu chứng | Sửa |
|---|---|---|
| Chưa whitelist XStream | Lỗi security khi profile nhận event | `AxonConfig` + `@Import` mọi service |
| Set `null` cho cột số (`accountNumber` kiểu `long`) | Runtime exception (null không ép được vào primitive) | Khi xóa, set `0L` thay vì `null` |
| `@RequestParam` thiếu tên | "Name for argument not specified" | Ghi rõ `@RequestParam("cardNumber")` mọi nơi (như Phase 1) |
| Phát nhầm event trong delete | Profile không cập nhật đúng | Delete phải phát đúng `XxxDataChangedEvent`, không phải `XxxUpdatedEvent` |

## Use case khác của Materialized View

Ngoài cross-service queries, pattern này còn dùng cho:

| Use case | Mô tả |
|---|---|
| **Chia sẻ/nhân bản data** | Account cần `address` của customer (vd gửi sổ séc) → giữ bản copy address trong account qua event, khỏi gọi customer runtime |
| **Reporting / Analytics** | Dựng bảng view riêng cho báo cáo ngày/tuần/tháng → process báo cáo đọc data sẵn, không quấy service nguồn, ít tốn compute |

## Tóm tắt bài 3

- Tạo `profile` chỉ-đọc (bỏ command), giữ kết nối Axon Server, route gateway `lb://PROFILE`.
- Event dùng chung (`XxxDataChangedEvent`) đặt trong **`common`**; mỗi event mang đúng field profile cần + `mobileNumber`.
- Ba cách phát nhiều event: `apply().andThenApply()`, `apply()` nhiều lần (trong aggregate), `EventGateway.publish()` (ngoài aggregate — vd delete thiếu mobileNumber).
- `ProfileProjection` (`@EventHandler`) → service **upsert** view; delete chỉ set field có giá trị (bẫy null name).
- **XStream**: whitelist `com.eazybytes.**` trong `AxonConfig` (`common`) + `@Import` mọi service để serialize event xuyên JVM.
- Bẫy: XStream security, `null`→`0L` cho cột số, `@RequestParam` thiếu tên, phát nhầm event.

**Bài kế tiếp** → [Bài 4: Transactional Outbox Pattern — publish event đáng tin cậy](04-transactional-outbox-pattern.md)

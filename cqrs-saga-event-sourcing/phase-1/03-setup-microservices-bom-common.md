# Bài 3: Dựng dự án — 4 microservice, BOM và common module

Trước khi implement API Composition bằng Spring Cloud Gateway (bài 4), ta cần một nền dự án thật để chạy thử. Bài này dựng bộ khung: bốn microservice ngân hàng (customer, accounts, loans, cards), hai thành phần hỗ trợ (Eureka, Gateway), một **BOM** quản lý version tập trung và một **common module** chứa code dùng chung. Đây là kiến trúc microservices Spring Boot điển hình — nắm được nó, bạn áp dụng được cho mọi dự án thật.

> **Bối cảnh khóa học**: giảng viên không dựng các service này từ con số 0 (việc đó thuộc khóa microservices cơ bản: cách tạo Eureka, Gateway, Spring Cloud Gateway routing). Khóa này nhận sẵn code "00_start" rồi bổ sung các pattern nâng cao lên trên. Bài này tóm tắt phần code nền đó để bạn hiểu mình đang đứng trên cái gì.

## Bức tranh tổng thể các thành phần

```text
                    ┌──────────────────────┐
   Client (Postman) │  Spring Cloud Gateway │  :8072  (edge server)
        │           │  (API composer sau)   │
        └──────────►└──────────┬───────────┘
                               │ hỏi Eureka để load-balance + route
                    ┌──────────▼───────────┐
                    │   Eureka Server       │  :8070  (service registry)
                    └──────────┬───────────┘
              ┌────────────┬───┴────────┬────────────┐
              ▼            ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Customer │ │ Accounts │ │  Loans   │ │  Cards   │
        │  :8080   │ │  :8081   │ │  :8083   │ │  :8082   │
        └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
             ▼            ▼            ▼            ▼
          H2 file      H2 file      H2 file      H2 file
```

| Thành phần | Vai trò | Port |
|---|---|---|
| **Eureka Server** | **Service registry** — nơi mọi service đăng ký, để gateway tìm và load-balance | 8070 |
| **Gateway Server** | **Edge server** — cổng vào duy nhất, route request tới service | 8072 |
| Customer Service | Quản lý thông tin cá nhân khách hàng | 8080 |
| Accounts Service | Quản lý tài khoản | 8081 |
| Cards Service | Quản lý thẻ | 8082 |
| Loans Service | Quản lý khoản vay | 8083 |

**Luồng nghiệp vụ**: luôn tạo **customer trước** (với một `mobileNumber`), rồi dùng **cùng `mobileNumber` đó** tạo bản ghi ở accounts, loans, cards. `mobileNumber` là **khóa chung duy nhất** xuyên suốt mọi service — không có nó, ta không gom được data của một khách.

## BOM — Bill of Materials, quản lý version tập trung

> **BOM (Bill of Materials)** = một Maven project đặc biệt có `packaging = pom`, dùng để **khai báo version của tất cả thư viện ở một chỗ duy nhất**. Mọi microservice kế thừa BOM này; muốn nâng/hạ version một thư viện, chỉ sửa một nơi.

Dự án có một BOM tên `eazy-bom`. Cấu trúc `pom.xml` của nó:

```xml
<project>
    <groupId>com.eazybytes</groupId>
    <artifactId>eazy-bom</artifactId>
    <version>1.0.0</version>
    <!-- packaging pom = đây là BOM, không build ra jar/war -->
    <packaging>pom</packaging>

    <!-- 1. Version tập trung: sửa ở đây là toàn hệ thống đổi theo -->
    <properties>
        <java.version>17</java.version>
        <spring-boot.version>3.x.x</spring-boot.version>
        <spring-cloud.version>2023.x.x</spring-cloud.version>
        <h2.version>2.x.x</h2.version>
        <lombok.version>1.18.x</lombok.version>
    </properties>

    <!-- 2. Module con: common chứa code dùng chung -->
    <modules>
        <module>common</module>
    </modules>

    <!-- 3. Dependency CHUNG cho MỌI service: khai báo 1 lần, không lặp lại -->
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-devtools</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
        </dependency>
    </dependencies>

    <!-- 4. dependencyManagement: chỉ KHAI BÁO version, không tải về.
            Service con dùng cái nào thì khai báo cái đó (không cần version). -->
    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-dependencies</artifactId>
                <version>${spring-boot.version}</version>
                <type>pom</type>
                <scope>import</scope>   <!-- kéo toàn bộ metadata version của Spring Boot -->
            </dependency>
            <dependency>
                <groupId>org.springframework.cloud</groupId>
                <artifactId>spring-cloud-dependencies</artifactId>
                <version>${spring-cloud.version}</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
            <!-- Thư viện ngoài Spring (Lombok, H2) khai báo version tường minh -->
        </dependencies>
    </dependencyManagement>
</project>
```

Phân biệt hai khối quan trọng:

| Khối | Ý nghĩa | Khi nào dùng |
|---|---|---|
| `<dependencies>` | Thư viện **tải về và dùng ngay** ở mọi service kế thừa | devtools, starter-test (chung cho tất cả) |
| `<dependencyManagement>` | **Chỉ khai báo version**, không tải. Service con chọn dùng cái nào thì khai báo (không kèm version) | Spring Boot/Cloud BOM, Lombok, H2 |

`<scope>import</scope>` với `<type>pom</type>`: kéo toàn bộ bảng version của Spring Boot vào BOM của bạn — nhờ đó service con khai báo `spring-boot-starter-web` mà **không cần ghi version** (lấy từ BOM).

## Common module — code dùng chung

`common` là một module con của `eazy-bom`, đóng gói thành **library (jar)** để mọi service import. Ví dụ tối thiểu: một `ErrorResponseDto` chuẩn hóa cấu trúc lỗi trả về client.

```java
@Data @AllArgsConstructor
public class ErrorResponseDto {
    private String  apiPath;
    private HttpStatus errorCode;
    private String  errorMsg;
    private LocalDateTime errorTime;
}
```

Bạn có thể thêm nhiều submodule khác (auditing, logging...) tùy nhu cầu. Mỗi service khai báo `common` như một dependency:

```xml
<dependency>
    <groupId>com.eazybytes</groupId>
    <artifactId>common</artifactId>
    <version>${project.version}</version>
</dependency>
```

> **Bẫy build thường gặp**: nếu service báo lỗi không tìm thấy `common`, nghĩa là jar của `common` chưa được publish vào local Maven repo. Sửa bằng cách build riêng module common, bỏ qua test:
> ```bash
> mvn clean install -Dmaven.test.skip=true   # tại module common
> ```
> Lệnh này tạo `common.jar` và đẩy vào `~/.m2`, từ đó các service mới "thấy" được nó.

Mỗi service kế thừa BOM qua thẻ `<parent>`:

```xml
<parent>
    <groupId>com.eazybytes</groupId>
    <artifactId>eazy-bom</artifactId>
    <version>1.0.0</version>
    <relativePath>../eazy-bom</relativePath>
</parent>
```

## Cấu trúc một microservice (lấy Accounts làm mẫu)

Mọi service theo cùng một bố cục package — học một cái là hiểu cả bốn:

```text
accounts/
├── controller/   AccountsController       → REST API: create / fetch / update / delete
├── service/
│   └── impl/      AccountServiceImpl       → toàn bộ business logic ở đây
├── dto/           AccountsDto, ResponseDto
├── entity/        BaseEntity, AccountsEntity (map tới bảng accounts)
├── repository/    AccountsRepository       → Spring Data JPA, CRUD
├── mapper/        AccountsMapper           → chuyển DTO ⇄ Entity
├── exception/     GlobalExceptionHandler   → @ControllerAdvice bắt lỗi tập trung
├── audit/         logic ghi createdDate/By, updatedDate/By
├── constants/
└── AccountsApplication                     → @SpringBootApplication, @EnableJpaAuditing
```

### Business logic — bốn thao tác CRUD với soft delete

`AccountServiceImpl` chứa logic cốt lõi. Vài điểm thiết kế đáng học:

```java
@Service @RequiredArgsConstructor
public class AccountServiceImpl implements AccountService {

    private final AccountsRepository repository;

    public void createAccount(String mobileNumber) {
        // Chặn tạo trùng: đã có account ACTIVE với mobileNumber này → ném business exception
        repository.findByMobileNumberAndActiveSw(mobileNumber, true)
            .ifPresent(a -> { throw new AccountAlreadyExistsException(mobileNumber); });

        AccountsEntity acc = new AccountsEntity();
        acc.setMobileNumber(mobileNumber);
        acc.setAccountNumber(generateRandomAccountNumber()); // sinh ngẫu nhiên
        acc.setAccountType("Savings");
        acc.setBranchAddress("123 Main Street");
        acc.setActiveSw(true);                                // soft-delete flag
        repository.save(acc);
    }

    public AccountsDto fetchAccount(String mobileNumber) {
        // Chỉ lấy bản ghi ĐANG active; đã soft-delete coi như không tồn tại
        AccountsEntity acc = repository.findByMobileNumberAndActiveSw(mobileNumber, true)
            .orElseThrow(() -> new ResourceNotFoundException("Account", "mobileNumber", mobileNumber));
        return AccountsMapper.toDto(acc);
    }

    public void updateAccount(AccountsDto dto) {
        AccountsEntity acc = repository.findByMobileNumberAndActiveSw(dto.getMobileNumber(), true)
            .orElseThrow(() -> new ResourceNotFoundException("Account", "mobileNumber", dto.getMobileNumber()));
        // Chỉ cho đổi accountType + branchAddress.
        // KHÔNG cho đổi accountNumber (đã sinh thì cố định) và mobileNumber
        // (mobileNumber là khóa chung — đổi nó phải qua API riêng đồng bộ mọi service).
        AccountsMapper.mapEditableFields(dto, acc);
        repository.save(acc);
    }

    public void deleteAccount(Long accountNumber) {
        AccountsEntity acc = repository.findByAccountNumber(accountNumber)
            .orElseThrow(() -> new ResourceNotFoundException("Account", "accountNumber", accountNumber.toString()));
        acc.setActiveSw(false);   // SOFT delete, không xóa vật lý
        repository.save(acc);
    }
}
```

Ba quyết định thiết kế quan trọng:

| Quyết định | Lý do |
|---|---|
| **Soft delete** (`activeSw=false`) thay vì xóa vật lý | Dự án thật gần như không bao giờ hard-delete — cần audit, khôi phục, đối soát |
| Update **không** cho đổi `mobileNumber` | `mobileNumber` là khóa chung xuyên service; đổi nó cần API riêng đồng bộ cả 4 service (xem bài 5 — data duplication) |
| Bắt lỗi tập trung bằng `@ControllerAdvice` | `GlobalExceptionHandler` xử lý mọi `RuntimeException` + business exception (`ResourceNotFoundException`, `AccountAlreadyExistsException`) → trả `ErrorResponseDto` thống nhất |

Cards và Loans có cấu trúc y hệt (CRUD theo `mobileNumber`). Customer thì tạo bằng thông tin cá nhân (name, email, mobileNumber).

## H2 lưu ra file — giữ data qua restart

H2 mặc định là **in-memory** (lưu trong RAM) → restart là mất sạch data. Để giữ data qua restart, cấu hình H2 ghi ra **file trên ổ cứng**:

```yaml
spring:
  datasource:
    url: jdbc:h2:file:~/accounts;AUTO_SERVER=true   # ~ = thư mục user; AUTO_SERVER cho nhiều connection
    username: sa
    password: ''
  h2:
    console:
      enabled: true
server:
  port: 8081
eureka:
  client:
    serviceUrl:
      defaultZone: http://localhost:8070/eureka/    # đăng ký với Eureka
```

- `jdbc:h2:file:~/accounts` → H2 tạo file `accounts.*.db` trong thư mục user. Service `cards`, `customer`, `loans` mỗi cái một file riêng.
- `AUTO_SERVER=true` → cho phép nhiều kết nối cùng lúc (ví dụ app + IntelliJ DB tool).
- **Reset data**: muốn bắt đầu lại từ trắng, xóa các file `*.db` trong thư mục user.

## Gateway routing — cổng vào duy nhất

Gateway server route theo prefix đường dẫn, dùng Eureka để load-balance:

```java
// Bất kỳ request /eazybank/customer/** → chuyển tới CUSTOMER service
.route(p -> p.path("/eazybank/customer/**")
    .filters(f -> f.rewritePath("/eazybank/customer/(?<segment>.*)", "/${segment}"))
    .uri("lb://CUSTOMER"))   // lb:// = load-balanced qua Eureka
```

Nhờ vậy client **luôn gọi gateway** (`localhost:8072`), không bao giờ biết port nội bộ của từng service. Trong Postman, người ta đặt host/port một lần ở scope collection (pre-request script trỏ về `localhost:8072`) để mọi request kế thừa.

## Thứ tự khởi động & kiểm thử

```text
1. Eureka Server   (8070)  ← khởi động ĐẦU TIÊN, mọi service đăng ký vào đây
2. Accounts (8081), Cards (8082), Customer (8080), Loans (8083)
3. Gateway Server  (8072)  ← khởi động CUỐI, sau khi service đã đăng ký
```

Mở Eureka dashboard (`localhost:8070`) thấy đủ 4 service registered = setup OK. Sau đó test bằng Postman: tạo customer trước, rồi dùng **cùng mobileNumber** tạo account/card/loan, kiểm tra fetch/update/delete (lưu ý update/delete là soft delete → query DB thấy `activeSw=false`).

## Tóm tắt bài 3

- Hệ thống gồm 4 microservice (customer/accounts/cards/loans) + Eureka (registry, 8070) + Gateway (edge server, 8072).
- **BOM (`eazy-bom`)**: `packaging=pom`, quản lý version tập trung; `<dependencies>` = dùng chung cho mọi service, `<dependencyManagement>` = chỉ khai báo version.
- **common module**: library chứa code dùng chung (vd `ErrorResponseDto`); build bằng `mvn clean install -Dmaven.test.skip=true` nếu service không thấy nó.
- Mỗi service theo bố cục package chuẩn; business logic ở `ServiceImpl` với **soft delete** và **không cho đổi `mobileNumber`** qua update thường.
- `mobileNumber` là **khóa chung duy nhất** xuyên mọi service.
- H2 dùng `jdbc:h2:file:~/...;AUTO_SERVER=true` để giữ data qua restart.

**Bài kế tiếp** → [Bài 4: Implement API Composition bằng Spring Cloud Gateway](04-implement-api-composition-spring-cloud-gateway.md)

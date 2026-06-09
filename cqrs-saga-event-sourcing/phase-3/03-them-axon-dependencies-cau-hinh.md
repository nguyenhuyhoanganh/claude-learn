# Bài 3: Thêm Axon dependencies và cấu hình microservice

Axon Server đã chạy (bài 2). Giờ các microservice cần "biết" Axon Framework: thêm thư viện qua BOM, khai báo dependency, và trỏ service tới Axon Server. Bài này là phần chuẩn bị cuối cùng trước khi viết business logic CQRS thật ở các bài sau.

> **"Giao kèo" của khóa học**: ta sẽ implement CQRS + ES đầy đủ trong **customer** trước, rồi **accounts**. Hai service **cards** và **loans** để bạn tự làm như bài tập (code mẫu có trong repo). Lặp lại nhiều lần giúp bạn thành thạo.

## Bước 1: Khai báo Axon BOM trong `eazy-bom`

Nhớ lại bài Phase 1: `eazy-bom` quản lý version tập trung. Thêm version Axon và import BOM của Axon:

```xml
<!-- trong eazy-bom/pom.xml -->
<properties>
    <axon.version>4.10.1</axon.version>   <!-- dùng đúng version repo khuyến nghị -->
</properties>

<dependencyManagement>
    <dependencies>
        <!-- ...spring-boot, spring-cloud BOM... -->
        <dependency>
            <groupId>org.axonframework</groupId>
            <artifactId>axon-bom</artifactId>
            <version>${axon.version}</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

> **Lời khuyên về version**: đừng tự động lấy version mới nhất trên Maven Central — bản mới đôi khi chưa ổn định. Dùng đúng version repo khóa học đã test (`4.10.1` tại thời điểm ghi hình). Nguyên tắc này áp dụng cho **mọi** thư viện, không riêng Axon.

`axon-bom` chỉ là bảng version; service nào cần dependency nào sẽ tự khai báo (không kèm version).

## Bước 2: Thêm starter vào từng service

Chỉ cần **một** dependency cho mỗi service muốn dùng Axon:

```xml
<dependency>
    <groupId>org.axonframework</groupId>
    <artifactId>axon-spring-boot-starter</artifactId>
</dependency>
```

Thêm vào: `customer`, `accounts`, `cards`, `loans`, và **`common`** (vì common cũng sẽ có code dùng chung liên quan Axon ở các bài sau).

**Không** thêm vào `eureka-server` và `gateway-server` — hai thành phần hỗ trợ này không triển khai CQRS.

```text
                axon-spring-boot-starter
        ┌──────────┬──────────┬──────────┬──────────┬──────────┐
        ▼          ▼          ▼          ▼          ▼          ✗
     customer   accounts    cards      loans     common   (eureka, gateway: KHÔNG)
```

## Bước 3: Trỏ service tới Axon Server

Trong `application.yml` của mỗi service dùng Axon, khai báo địa chỉ Axon Server (cổng **gRPC 8124**):

```yaml
axon:
  axonserver:
    servers: localhost:8124
```

```text
microservice ──(gRPC 8124)──► Axon Server
```

- Nếu có **cluster nhiều** Axon Server, liệt kê nhiều địa chỉ, ngăn cách bằng dấu phẩy.
- Local chỉ một server nên một dòng là đủ.

> **Mẹo IntelliJ Ultimate**: gõ tắt chữ cái đầu mỗi từ rồi để IDE gợi ý — vd gõ `a.a.s` → nó đề xuất `axon.axonserver.servers`. Áp dụng cho mọi property Spring Boot (`s.a` → các property bắt đầu `s...a...`).

> **Lưu ý quan trọng về phạm vi áp dụng**: **không bắt buộc** biến *mọi* service thành event-driven. Nếu chỉ một service cần CQRS, chỉ làm cho service đó. Trong khóa này ta chuyển cả 4 service sang CQRS **chỉ vì** muốn demo nhiều (CQRS, ES, Saga). Thực tế: quyết định theo nhu cầu nghiệp vụ.

## Bước 4: Tạo cấu trúc package command / query

Theo đúng tinh thần CQRS, mỗi service tách thành hai nhánh package. Ở `customer`:

```text
customer/
├── command/        ← tất cả class phía GHI
│   ├── (CreateCustomerCommand, UpdateCustomerCommand, DeleteCustomerCommand)
│   ├── event/      ← (CustomerCreatedEvent, ...Updated, ...Deleted)
│   ├── aggregate/  ← (CustomerAggregate)
│   ├── controller/ ← (CustomerCommandController)
│   └── interceptor/← (CustomerCommandInterceptor)
└── query/          ← tất cả class phía ĐỌC
    ├── (FindCustomerQuery)
    ├── projection/ ← (CustomerProjection)
    ├── handler/    ← (CustomerQueryHandler)
    └── controller/ ← (CustomerQueryController)
```

Các sub-package này ta sẽ điền dần qua các bài tiếp theo. Bài này chỉ dựng khung.

## Tóm tắt bài 3

- Thêm `axon-bom` vào `eazy-bom` (version `4.10.1` — dùng đúng version repo, đừng auto lấy mới nhất).
- Thêm **`axon-spring-boot-starter`** vào customer/accounts/cards/loans/common; **không** thêm vào eureka/gateway.
- Mỗi service: `axon.axonserver.servers: localhost:8124` (cổng gRPC).
- Không bắt buộc mọi service phải event-driven — quyết định theo nghiệp vụ.
- Dựng khung package: nhánh **`command`** (ghi) và **`query`** (đọc).
- Giao kèo: làm đủ ở customer + accounts; cards + loans tự làm.

**Bài kế tiếp** → [Bài 4: Command, Event và Query classes](04-command-event-query-classes.md)

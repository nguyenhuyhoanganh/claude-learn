# Bài 6: Tạo Maven multi-module project — biến kiến trúc thành code

> Bài 5 đã vẽ sơ đồ. Bài này **gõ tay** thiết kế đó thành Maven multi-module project: parent POM, child modules, dependencyManagement, và đồ thị dependency để **xác minh dependency rule** đúng. Cuối bài, bạn có skeleton để bắt đầu code domain ở phase-3.

## Mục tiêu cuối bài

Sau khi xong bài, cấu trúc thư mục `food-ordering-system/` sẽ thế này:

```text
food-ordering-system/
├── pom.xml                        ← parent POM (packaging=pom)
├── order-service/
│   ├── pom.xml                    ← parent của Order modules (pom)
│   ├── order-domain/
│   │   ├── pom.xml                ← parent của Domain modules (pom)
│   │   ├── order-domain-core/
│   │   │   └── pom.xml            ← jar, 0 dependency
│   │   └── order-application-service/
│   │       └── pom.xml            ← jar, depends on order-domain-core
│   ├── order-application/
│   │   └── pom.xml                ← jar, depends on order-application-service
│   ├── order-dataaccess/
│   │   └── pom.xml                ← jar, depends on order-application-service
│   ├── order-messaging/
│   │   └── pom.xml                ← jar, depends on order-application-service
│   └── order-container/
│       └── pom.xml                ← jar (runnable), depends on TẤT CẢ
```

7 file `pom.xml` cho Order service. Sẽ phát triển thêm cho Payment, Restaurant ở phase-6, 7.

## Bước 1: Tạo Maven project gốc

Mở IntelliJ → `File → New → Project → Maven`.

- `GroupId`: `com.food.ordering.system`
- `ArtifactId`: `food-ordering-system`
- `Version`: `1.0-SNAPSHOT`

IntelliJ tạo:
- Thư mục `food-ordering-system/` với `pom.xml`.
- Một thư mục `src/main/java`, `src/test/java` — **xoá đi** (parent POM không chứa code).

### Sửa parent `pom.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">

    <modelVersion>4.0.0</modelVersion>

    <groupId>com.food.ordering.system</groupId>
    <artifactId>food-ordering-system</artifactId>
    <version>1.0-SNAPSHOT</version>
    <packaging>pom</packaging>   <!-- không build JAR ở parent -->

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>2.6.7</version>           <!-- khoá học gốc; phase-14 nâng cấp -->
        <relativePath/>                    <!-- empty: tải từ Maven Central -->
    </parent>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <maven-compiler-plugin.version>3.9.0</maven-compiler-plugin.version>
    </properties>

    <modules>
        <!-- list các module con — sẽ thêm sau -->
    </modules>

    <dependencyManagement>
        <dependencies>
            <!-- khai báo version cho dependency dùng chung — sẽ điền sau -->
        </dependencies>
    </dependencyManagement>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>${maven-compiler-plugin.version}</version>
                <configuration>
                    <release>17</release>
                </configuration>
            </plugin>
        </plugins>
    </build>

</project>
```

3 điểm quan trọng:

| Thành phần | Vai trò |
|---|---|
| `<packaging>pom</packaging>` | Báo Maven: project này **không** build JAR, chỉ là tổ chức cha cho con. |
| `<parent>` trỏ về `spring-boot-starter-parent` | Kế thừa **dependency version mặc định của Spring Boot** (Jackson, Jakarta, Tomcat, etc) → trong child POM không cần khai version Spring dependency. |
| `<relativePath/>` (rỗng) | Báo Maven: parent ở **remote** (Maven Central), không tìm trong local filesystem. |

Spring Boot starter parent là tài sản lớn — Spring team đã chọn 1 bộ version dependency tương thích với nhau. Bạn import vào, "**hệ sinh thái Spring nhất quán**" được kế thừa.

## Bước 2: Tạo module `order-service` (cha của các module Order)

Trong IntelliJ: right click `food-ordering-system` → `New → Module → Maven`.

- `ArtifactId`: `order-service`
- Parent: `food-ordering-system`

IntelliJ tự thêm dòng `<module>order-service</module>` vào parent `pom.xml`. Vào `order-service/pom.xml`:

```xml
<project>
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>food-ordering-system</artifactId>
        <version>1.0-SNAPSHOT</version>
    </parent>

    <artifactId>order-service</artifactId>
    <packaging>pom</packaging>     <!-- vẫn là cha, không build JAR -->

    <modules>
        <!-- 6 module Order con -->
    </modules>
</project>
```

Xoá `src/main/java`, `src/test/java` (parent module không chứa code).

## Bước 3: Tạo `order-domain` (cha của 2 sub-module domain)

`order-service` → `New → Module → Maven`:

- `ArtifactId`: `order-domain`
- Parent: `order-service`
- `packaging: pom`

Xoá `src/`. `order-domain/pom.xml`:

```xml
<project>
    <parent>
        <artifactId>order-service</artifactId>
        <groupId>com.food.ordering.system</groupId>
        <version>1.0-SNAPSHOT</version>
    </parent>

    <artifactId>order-domain</artifactId>
    <packaging>pom</packaging>

    <modules>
        <module>order-domain-core</module>
        <module>order-application-service</module>
    </modules>
</project>
```

## Bước 4: Tạo 2 module bên trong `order-domain`

### `order-domain-core` — module trung tâm

`order-domain` → `New → Module → Maven`. ArtifactId: `order-domain-core`. Để parent là `order-domain`.

```xml
<project>
    <parent>
        <artifactId>order-domain</artifactId>
        <groupId>com.food.ordering.system</groupId>
        <version>1.0-SNAPSHOT</version>
    </parent>

    <artifactId>order-domain-core</artifactId>
    <!-- packaging mặc định: jar -->

    <!-- KHÔNG có dependency gì cả -->
    <!-- Đây là module pure Java -->
</project>
```

**Quan trọng**: module này không khai báo **bất kỳ** dependency nào. Đây chính là **Domain Core** của Hexagonal — phải hoàn toàn độc lập.

### `order-application-service`

Tương tự: `order-domain` → `New → Module → Maven`. ArtifactId: `order-application-service`.

```xml
<project>
    <parent>
        <artifactId>order-domain</artifactId>
        <groupId>com.food.ordering.system</groupId>
        <version>1.0-SNAPSHOT</version>
    </parent>

    <artifactId>order-application-service</artifactId>

    <dependencies>
        <dependency>
            <groupId>com.food.ordering.system</groupId>
            <artifactId>order-domain-core</artifactId>
            <!-- version sẽ lấy từ dependencyManagement của parent gốc -->
        </dependency>
    </dependencies>
</project>
```

Khi reload Maven, bạn sẽ thấy **lỗi**: `version not found for order-domain-core`. Đó là do version chưa được khai báo ở `dependencyManagement` của parent. Fix ở bước sau.

## Bước 5: Tạo 4 module còn lại của Order

Cùng pattern. Tất cả parent là `order-service` (không phải `order-domain`).

```text
order-service/
├── order-domain/
│   ├── order-domain-core/
│   └── order-application-service/
├── order-application/       ← REST controllers
├── order-dataaccess/         ← JPA adapters
├── order-messaging/          ← Kafka adapters
└── order-container/          ← Spring Boot runner
```

Xoá `src/` ở module cha, để lại ở module lá.

## Bước 6: Khai báo version trong `dependencyManagement` của parent root

Tới đây, các module reference lẫn nhau bằng `<dependency>` mà không có `<version>`. Để Maven hiểu, đặt version ở **một chỗ duy nhất** — `dependencyManagement` của parent root.

Mở `food-ordering-system/pom.xml`:

```xml
<dependencyManagement>
    <dependencies>
        <!-- Internal modules: project.version = 1.0-SNAPSHOT -->
        <dependency>
            <groupId>com.food.ordering.system</groupId>
            <artifactId>order-domain-core</artifactId>
            <version>${project.version}</version>
        </dependency>
        <dependency>
            <groupId>com.food.ordering.system</groupId>
            <artifactId>order-application-service</artifactId>
            <version>${project.version}</version>
        </dependency>
        <dependency>
            <groupId>com.food.ordering.system</groupId>
            <artifactId>order-application</artifactId>
            <version>${project.version}</version>
        </dependency>
        <dependency>
            <groupId>com.food.ordering.system</groupId>
            <artifactId>order-dataaccess</artifactId>
            <version>${project.version}</version>
        </dependency>
        <dependency>
            <groupId>com.food.ordering.system</groupId>
            <artifactId>order-messaging</artifactId>
            <version>${project.version}</version>
        </dependency>
        <!-- order-container không cần — module khác không phụ thuộc nó -->
    </dependencies>
</dependencyManagement>
```

**Tinh tế**:
- `${project.version}` = `1.0-SNAPSHOT` (kế thừa từ parent).
- Không đặt `order-container` ở đây vì không module nào "phụ thuộc" container — container phụ thuộc mọi module khác, không có chiều ngược.
- `dependencyManagement` **chỉ khai báo version**, không "kéo" dependency vào. Module con muốn dùng phải khai trong `<dependencies>` riêng (không cần `<version>` lúc đó).

Reload Maven. Lỗi version biến mất.

## Bước 7: Cài đặt `<dependencies>` của từng module — áp dụng đúng dependency rule

### `order-domain-core` — không khai dependency

```xml
<!-- KHÔNG có <dependencies>...</dependencies> -->
```

Module này pure Java. Nhớ: nếu cần JSR-305 annotation (`@Nullable`), Apache Commons, hay thư viện thuần utility — vẫn được, miễn không phải framework. Nhưng cố gắng **không**, để domain core sạch tuyệt đối.

### `order-application-service`

```xml
<dependencies>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-domain-core</artifactId>
    </dependency>
</dependencies>
```

Phụ thuộc domain core. Sẽ thêm `common-domain` (utility) ở phase-3.

### `order-application` (REST layer)

```xml
<dependencies>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-application-service</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
</dependencies>
```

REST adapter dùng Spring Web. Version Spring Boot kế thừa từ parent root.

### `order-dataaccess`

```xml
<dependencies>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-application-service</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
    </dependency>
</dependencies>
```

### `order-messaging`

```xml
<dependencies>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-application-service</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.kafka</groupId>
        <artifactId>spring-kafka</artifactId>
    </dependency>
    <!-- sẽ thêm Avro + Schema Registry ở phase-4 -->
</dependencies>
```

### `order-container` — lắp ráp tất cả

```xml
<dependencies>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-application-service</artifactId>
    </dependency>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-application</artifactId>
    </dependency>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-dataaccess</artifactId>
    </dependency>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>order-messaging</artifactId>
    </dependency>
    <!-- domain-core kế thừa transitively qua application-service -->
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
        </plugin>
    </plugins>
</build>
```

`spring-boot-maven-plugin` cho phép build runnable JAR (`mvn package` → có file `order-container-1.0-SNAPSHOT.jar` chạy được).

## Bước 8: Verify — `mvn clean install`

Mở terminal tại `food-ordering-system/`:

```text
$ mvn clean install -DskipTests
[INFO] Scanning for projects...
[INFO] ------------------------------------------------------------------------
[INFO] Reactor Build Order:
[INFO]
[INFO] food-ordering-system               [pom]
[INFO] order-service                      [pom]
[INFO] order-domain                       [pom]
[INFO] order-domain-core                  [jar]
[INFO] order-application-service          [jar]
[INFO] order-application                  [jar]
[INFO] order-dataaccess                   [jar]
[INFO] order-messaging                    [jar]
[INFO] order-container                    [jar]
[INFO] ...
[INFO] BUILD SUCCESS
```

Maven xếp build theo **topo order** của dependency: tầng dưới build trước, tầng trên build sau. `order-domain-core` luôn được build đầu — đó là dấu hiệu kiến trúc đúng.

## Bước 9: Vẽ đồ thị dependency để xác nhận

Dùng plugin `depgraph-maven-plugin`:

```text
$ brew install graphviz   # macOS, nếu chưa có
# Ubuntu: sudo apt install graphviz

$ mvn com.github.ferstl:depgraph-maven-plugin:4.0.2:aggregate \
      -DcreateImage=true \
      -DreduceEdges=false \
      -Dscope=compile \
      -DincludeParentProjects=true
```

Mở `target/dependency-graph.png`. Bạn sẽ thấy:

```text
                       ┌────────────────────┐
                       │  order-container    │
                       └──┬───┬───┬────────┬─┘
                          │   │   │        │
                          ▼   ▼   ▼        ▼
       ┌────────────────┐ ┌────────────┐ ┌──────────────┐
       │ order-application │ │ order-dataaccess│ │ order-messaging │
       └─────────┬────────┘ └──────────┬──────┘ └────────┬────────┘
                 │                       │                 │
                 └─────────────┬────────┴───────────────┘
                               ▼
                  ┌────────────────────────────┐
                  │ order-application-service   │
                  └─────────────┬──────────────┘
                                ▼
                  ┌────────────────────────────┐
                  │     order-domain-core       │
                  └────────────────────────────┘
```

**Mọi mũi tên đều "hướng xuống"** — về phía domain core. Domain core là **node đáy** không trỏ đi đâu. Đó là dấu hiệu cấu trúc Hexagonal **chính xác**.

## Bẫy thường gặp khi tạo Maven multi-module

| Bẫy | Sửa |
|---|---|
| Xoá `src/` của module cha → mất | Maven sẽ vẫn build vì `packaging=pom`. Nhưng nếu để `src/`, IntelliJ sẽ tự thêm code → bẩn. |
| Quên `<packaging>pom</packaging>` ở parent module | Maven báo lỗi `there is no source directory`. Thêm `<packaging>pom</packaging>`. |
| Khai version dependency trùng nhau ở mỗi child | Đặt vào `dependencyManagement` của parent root, child không khai version. Single source of truth. |
| Order container không build runnable JAR | Thiếu `spring-boot-maven-plugin` trong `<build><plugins>` của container. |
| Đặt `@Bean` trong domain-core | Sai. Bean configuration luôn ở container. |
| Module child trỏ wrong parent (`food-ordering-system` thay vì `order-service`) | Sửa `<parent>` block trong pom.xml của child. |
| `mvn package` báo `Failed to execute goal spring-boot-maven-plugin: missing main class` | Chưa có class `@SpringBootApplication` trong container. Sẽ tạo ở phase-5. |
| IntelliJ không nhận module mới | Right click `pom.xml` → `Add as Maven Project`, hoặc reload Maven. |

## So sánh với cấu trúc "Spring Boot 1 module" thường thấy

Lúc đầu, multi-module có vẻ "phức tạp hoá". So sánh:

| | Spring Boot 1 module | Multi-module khoá học |
|---|---|---|
| Số `pom.xml` | 1 | 7 (cho Order service) |
| Dependency check | Chỉ kiểm tra manual | Maven enforce: outer phụ thuộc inner |
| Test domain logic | Phải khởi Spring | JUnit thuần |
| Build mỗi module riêng | Không thể | `mvn install -pl order-domain-core` chỉ build core |
| Đổi DB | Sửa class trong source | Thay module dataaccess, không sửa core |
| Đường cong học | Thấp | Trung bình |
| Production ready | Cho prototype | Cho dự án sống lâu |

Khoá học chọn multi-module vì project sẽ kéo dài 13 phase, đụng nhiều adapter. Trade-off chấp nhận được.

## Một số tip Maven có thể bạn chưa biết

### `-pl` (project list) build module cụ thể

```text
$ mvn install -pl order-service/order-domain/order-domain-core
$ mvn install -pl order-service/order-domain/order-domain-core -am   # và build các module phụ thuộc
```

### `mvn dependency:tree` xem cây dependency

```text
$ mvn dependency:tree -pl order-service/order-application
[INFO] com.food.ordering.system:order-application:jar:1.0-SNAPSHOT
[INFO] +- com.food.ordering.system:order-application-service:jar:1.0-SNAPSHOT:compile
[INFO] |  \- com.food.ordering.system:order-domain-core:jar:1.0-SNAPSHOT:compile
[INFO] +- org.springframework.boot:spring-boot-starter-web:jar:2.6.7:compile
...
```

### `mvn versions:display-dependency-updates` kiểm tra version cũ

```text
$ mvn versions:display-dependency-updates
[INFO] The following dependencies in Dependencies have newer versions:
[INFO]   org.postgresql:postgresql ......................... 42.5.0 -> 42.6.0
```

Phase-14 sẽ dùng để nâng cấp Spring Boot.

## Tóm tắt bài 6

- Order service = **7 module Maven**: 1 parent + 1 domain parent + 2 domain leaf + 4 adapter/container.
- `<packaging>pom</packaging>` cho module cha; mặc định `jar` cho module lá.
- `dependencyManagement` của parent root **giữ tất cả version** ở 1 chỗ — child khai dependency không cần version.
- `spring-boot-starter-parent` được kế thừa → tất cả Spring dependency version đồng bộ.
- `depgraph-maven-plugin` vẽ đồ thị → kiểm tra trực quan dependency rule đúng.
- Cấu trúc này được lặp lại y hệt cho Payment và Restaurant ở phase-6, phase-7.

**Bài kế tiếp** → [Bài 7 (phase-3): Domain-Driven Design — Entity, Aggregate, Value Object, Domain Event](../phase-3-ddd/01-ddd-tu-tu-vung-business.md)

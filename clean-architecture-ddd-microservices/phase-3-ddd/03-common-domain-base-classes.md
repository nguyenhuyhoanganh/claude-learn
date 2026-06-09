# Bài 9: Common-domain module — base classes dùng chung cho mọi service

> Order, Payment, Restaurant đều cần khái niệm "Entity có ID", "Aggregate Root", "Domain Event", "BaseId<UUID>". Thay vì copy-paste, ta tạo module Maven riêng `common-domain` chứa abstract base. Bài này code những class nền tảng này — code này sẽ được tái sử dụng suốt khoá.

## Vị trí trong cấu trúc dự án

```text
food-ordering-system/
├── common/
│   ├── pom.xml                       ← parent (pom packaging)
│   └── common-domain/                ← module ta code bài này
│       ├── pom.xml                    ← jar packaging
│       └── src/main/java/com/food/ordering/system/domain/
│           ├── entity/
│           │   ├── BaseEntity.java
│           │   └── AggregateRoot.java
│           ├── valueobject/
│           │   ├── BaseId.java
│           │   ├── Money.java
│           │   ├── OrderId.java
│           │   ├── CustomerId.java
│           │   ├── RestaurantId.java
│           │   ├── ProductId.java
│           │   ├── OrderStatus.java
│           │   └── PaymentStatus.java
│           ├── event/
│           │   ├── DomainEvent.java
│           │   └── publisher/
│           │       └── DomainEventPublisher.java
│           └── exception/
│               └── DomainException.java
├── order-service/...
├── payment-service/...
└── restaurant-service/...
```

## Tạo module Maven

Thêm `<module>common</module>` vào root `food-ordering-system/pom.xml`. Tạo `common/pom.xml`:

```xml
<project>
    <parent>
        <artifactId>food-ordering-system</artifactId>
        <groupId>com.food.ordering.system</groupId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>common</artifactId>
    <packaging>pom</packaging>
    <modules>
        <module>common-domain</module>
    </modules>
</project>
```

Bên trong, `common-domain/pom.xml`:

```xml
<project>
    <parent>
        <artifactId>common</artifactId>
        <groupId>com.food.ordering.system</groupId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>common-domain</artifactId>
    <!-- KHÔNG có dependency — pure Java -->
</project>
```

Khai báo trong `dependencyManagement` của root:

```xml
<dependency>
    <groupId>com.food.ordering.system</groupId>
    <artifactId>common-domain</artifactId>
    <version>${project.version}</version>
</dependency>
```

`order-domain-core` sẽ thêm dependency `common-domain` — đây là **dependency duy nhất** của domain core.

## BaseEntity — abstract cha cho mọi Entity

```java
package com.food.ordering.system.domain.entity;

import java.util.Objects;

public abstract class BaseEntity<ID> {

    private ID id;

    public ID getId() {
        return id;
    }

    public void setId(ID id) {
        this.id = id;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        BaseEntity<?> that = (BaseEntity<?>) o;
        return id.equals(that.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id);
    }
}
```

Điểm cốt yếu:
1. **Generic `<ID>`**: ID type khác nhau giữa các entity (`OrderId`, `OrderItemId`, `PaymentId`).
2. **equals/hashCode dựa vào id**: 2 entity bằng nhau **chỉ khi** id giống. Đây là contract Entity của DDD.
3. **getClass() check** thay vì `instanceof`: 2 entity cùng id nhưng khác class (Order vs Restaurant) **không** bằng nhau.

## AggregateRoot — marker class

```java
package com.food.ordering.system.domain.entity;

public abstract class AggregateRoot<ID> extends BaseEntity<ID> {
    // Marker class — không thêm method.
    // Mục đích: gợi ý code reader rằng class này là root, được entry point từ outside.
}
```

Đơn giản nhưng quan trọng: **mỗi Aggregate có 1 Root**, được đánh dấu bằng cách extend `AggregateRoot`. Khi đọc code, thấy `Order extends AggregateRoot<OrderId>` → biết ngay đây là root, không phải sub-entity.

> Vì sao không nhét hết logic chung Aggregate vào `AggregateRoot`? — Giữ đơn giản. Logic chung (publish event, mark dirty) có thể thêm sau nếu cần, nhưng tại điểm này 1 class trống là đủ và rõ ý.

## BaseId — VO cha cho mọi identifier

```java
package com.food.ordering.system.domain.valueobject;

import java.util.Objects;

public abstract class BaseId<T> {

    private final T value;

    protected BaseId(T value) {
        this.value = value;
    }

    public T getValue() {
        return value;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        BaseId<?> baseId = (BaseId<?>) o;
        return value.equals(baseId.value);
    }

    @Override
    public int hashCode() {
        return Objects.hash(value);
    }
}
```

Điểm tinh tế:
1. **`final` field + `protected` constructor**: VO immutable, subclass chỉ định ID kiểu gì (UUID/Long/String).
2. **equals dựa vào `value`** — đặc trưng VO.
3. **`getClass() check`**: `OrderId(uuid-X)` ≠ `RestaurantId(uuid-X)` dù cùng giá trị UUID. **Type safety** cao.

## ID concrete classes — OrderId, CustomerId, RestaurantId, ProductId

```java
package com.food.ordering.system.domain.valueobject;

import java.util.UUID;

public class OrderId extends BaseId<UUID> {
    public OrderId(UUID value) {
        super(value);
    }
}

public class CustomerId extends BaseId<UUID> {
    public CustomerId(UUID value) { super(value); }
}

public class RestaurantId extends BaseId<UUID> {
    public RestaurantId(UUID value) { super(value); }
}

public class ProductId extends BaseId<UUID> {
    public ProductId(UUID value) { super(value); }
}
```

Mỗi class chỉ có constructor — vài dòng. Nhưng vai trò lớn: **type safety**. Method nhận `OrderId` không thể truyền nhầm `CustomerId`. Compiler chặn lỗi mà nếu dùng `UUID` trần sẽ vô hình.

## Money — Value Object cho tiền

Đặt ở `common-domain` vì Order, Payment cùng dùng:

```java
package com.food.ordering.system.domain.valueobject;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Objects;

public class Money {

    private final BigDecimal amount;

    public static final Money ZERO = new Money(BigDecimal.ZERO);

    public Money(BigDecimal amount) {
        this.amount = amount;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public boolean isGreaterThanZero() {
        return amount != null && amount.compareTo(BigDecimal.ZERO) > 0;
    }

    public boolean isGreaterThan(Money other) {
        return amount != null && amount.compareTo(other.amount) > 0;
    }

    public Money add(Money other) {
        return new Money(setScale(amount.add(other.amount)));
    }

    public Money subtract(Money other) {
        return new Money(setScale(amount.subtract(other.amount)));
    }

    public Money multiply(int multiplier) {
        return new Money(setScale(amount.multiply(new BigDecimal(multiplier))));
    }

    private BigDecimal setScale(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_EVEN);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Money money = (Money) o;
        return amount.equals(money.amount);
    }

    @Override
    public int hashCode() {
        return Objects.hash(amount);
    }
}
```

Trade-off đáng chú ý:
- **BigDecimal**: tiền tệ phải dùng `BigDecimal`, không `double/float` (float không chính xác cho số thập phân tiền).
- **Scale = 2**: rounded HALF_EVEN — chuẩn banker's rounding, giảm bias làm tròn.
- **No currency**: chưa hỗ trợ đa tiền tệ (USD vs VND). Production thật cần thêm `Currency` field; khoá học giữ đơn giản.
- **`Money.ZERO`** static — sentinel hằng để khởi tạo dễ.

## Enum dùng chung — OrderStatus, PaymentStatus

```java
package com.food.ordering.system.domain.valueobject;

public enum OrderStatus {
    PENDING, PAID, APPROVED, CANCELLING, CANCELLED
}

public enum PaymentStatus {
    COMPLETED, CANCELLED, FAILED
}
```

Vì sao enum đặt trong `common-domain`? — `OrderStatus` được Order service expose qua Kafka model → cần class chung để Payment/Restaurant service tham chiếu.

## DomainEvent interface

```java
package com.food.ordering.system.domain.event;

public interface DomainEvent<T> {
    // Marker interface. Generic T = entity type liên quan event.
}
```

Marker interface. Mục đích:
- Đánh dấu class này là Domain Event (không phải DTO, không phải command).
- Generic `T` chỉ rõ event này thuộc về entity nào (`OrderCreatedEvent implements DomainEvent<Order>`).

## DomainEventPublisher

```java
package com.food.ordering.system.domain.event.publisher;

import com.food.ordering.system.domain.event.DomainEvent;

public interface DomainEventPublisher<T extends DomainEvent<?>> {
    void publish(T domainEvent);
}
```

Interface publish event. Implementation cụ thể (Kafka) sẽ ở module `*-messaging`. Đây chỉ là contract.

## DomainException — base exception cho domain

```java
package com.food.ordering.system.domain.exception;

public class DomainException extends RuntimeException {
    public DomainException(String message) {
        super(message);
    }
    public DomainException(String message, Throwable cause) {
        super(message, cause);
    }
}
```

Mỗi service kế thừa thêm exception riêng:

```java
// trong order-domain-core
public class OrderDomainException extends DomainException { ... }

// trong payment-domain-core
public class PaymentDomainException extends DomainException { ... }
```

Vì sao? Catch riêng từng loại exception trong ControllerAdvice. Phân biệt lỗi nghiệp vụ vs lỗi hệ thống.

> Dùng `RuntimeException` thay vì checked exception — code DDD cleaner. Spring `@Transactional` mặc định rollback chỉ với RuntimeException, hợp ý.

## Address — VO chung cho địa chỉ

```java
package com.food.ordering.system.domain.valueobject;

import java.util.Objects;
import java.util.UUID;

public class StreetAddress {

    private final UUID id;            // ID nội bộ để map JPA (optional)
    private final String street;
    private final String postalCode;
    private final String city;

    public StreetAddress(UUID id, String street, String postalCode, String city) {
        this.id = id;
        this.street = street;
        this.postalCode = postalCode;
        this.city = city;
    }

    // getter only

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        StreetAddress that = (StreetAddress) o;
        return street.equals(that.street) &&
               postalCode.equals(that.postalCode) &&
               city.equals(that.city);
    }

    @Override
    public int hashCode() {
        return Objects.hash(street, postalCode, city);
    }
}
```

Lưu ý: `id` không tham gia equals/hashCode (vì VO bằng nhau theo **giá trị**, không theo ID). `id` chỉ để map JPA cho thuận tiện sau này — nếu hai address có cùng street + postal + city thì là **cùng giá trị**.

## Thử compile + test

```text
$ mvn install -pl common -am
[INFO] Reactor Summary:
[INFO] food-ordering-system  ... SUCCESS
[INFO] common                ... SUCCESS
[INFO] common-domain         ... SUCCESS
[INFO] BUILD SUCCESS
```

Test BaseId:

```java
@Test
void differentSubclasses_areNotEqual() {
    UUID uuid = UUID.randomUUID();
    OrderId orderId = new OrderId(uuid);
    CustomerId customerId = new CustomerId(uuid);
    assertNotEquals(orderId, customerId);   // type-safety: dù UUID giống, type khác
}

@Test
void sameSubclass_sameValue_areEqual() {
    UUID uuid = UUID.randomUUID();
    OrderId a = new OrderId(uuid);
    OrderId b = new OrderId(uuid);
    assertEquals(a, b);
}
```

Test Money:

```java
@Test
void money_add() {
    Money a = new Money(new BigDecimal("10.50"));
    Money b = new Money(new BigDecimal("5.25"));
    assertEquals(new BigDecimal("15.75"), a.add(b).getAmount());
}

@Test
void money_isGreaterThanZero() {
    assertTrue(new Money(new BigDecimal("0.01")).isGreaterThanZero());
    assertFalse(Money.ZERO.isGreaterThanZero());
    assertFalse(new Money(new BigDecimal("-1")).isGreaterThanZero());
}
```

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Dùng `Objects.equals(getClass(), o.getClass())` rồi quên gọi getClass với proxy JPA | Khoá học domain entity **không** dùng JPA → không bị proxy. Nếu dùng JPA, thay `getClass()` bằng `Hibernate.getClass()` |
| `Money` field `BigDecimal` không setScale | Tiền tệ phải có scale cố định để equals chính xác |
| `BaseId` không có `protected` constructor | Phải `protected` để subclass gọi `super(value)`, public ko an toàn |
| Cố `@Entity` lên `Order` | Domain entity **thuần Java** — JPA mapping ở `order-dataaccess` |
| Quên override `equals/hashCode` ở VO | VO phải implement → bằng nhau theo giá trị |
| Đặt enum trong `order-domain-core` | OrderStatus expose qua Kafka → tất cả service cần → đặt ở `common-domain` |

## Tóm tắt bài 9

- `common-domain` là module shared, pure Java, không phụ thuộc gì.
- `BaseEntity<ID>` + `AggregateRoot<ID>` là class cha cho Entity và Root.
- `BaseId<T>` là class cha cho mọi VO identifier — type safety không nhầm OrderId với CustomerId.
- `Money` đóng gói BigDecimal + business operation (add, subtract, isGreaterThan).
- `DomainEvent<T>` marker interface, `DomainEventPublisher<T>` interface publisher.
- `DomainException` chung, subclass per service: `OrderDomainException`, `PaymentDomainException`.

**Bài kế tiếp** → [Bài 10: Order Aggregate Root + Order Entity — code thật state machine](04-order-aggregate-state-machine.md)

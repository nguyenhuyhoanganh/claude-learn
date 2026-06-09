# Bài 23: Container module — Spring Boot main, @Bean, application.yml

> Container là chỗ duy nhất Spring "biết" về domain. Chứa main class, `@Configuration` đăng ký Domain Service bean, và `application.yml` cấu hình tất cả. Đây cũng là module build thành runnable JAR và Docker image.

## Cấu trúc `order-container`

```text
order-container/
├── pom.xml
└── src/main/
    ├── java/com/food/ordering/system/order/service/
    │   ├── OrderServiceApplication.java
    │   └── BeanConfiguration.java
    └── resources/
        ├── application.yml
        └── init-schema.sql              ← phase-5 cuối bài (optional)
```

## Main class

```java
package com.food.ordering.system.order.service;

import com.food.ordering.system.kafka.config.data.KafkaConfigData;
import com.food.ordering.system.kafka.config.data.KafkaConsumerConfigData;
import com.food.ordering.system.kafka.config.data.KafkaProducerConfigData;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@EnableJpaRepositories(basePackages = {"com.food.ordering.system.order.service.dataaccess"})
@EntityScan(basePackages = {"com.food.ordering.system.order.service.dataaccess"})
@SpringBootApplication(scanBasePackages = "com.food.ordering.system")
@EnableConfigurationProperties({
    KafkaConfigData.class,
    KafkaProducerConfigData.class,
    KafkaConsumerConfigData.class,
    OrderServiceConfigData.class
})
public class OrderServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}
```

### Annotation giải thích

| Annotation | Vai trò |
|---|---|
| `@SpringBootApplication` | Đánh dấu main class. `scanBasePackages` rộng để cover tất cả module Order. |
| `@EnableConfigurationProperties` | Đăng ký các `@ConfigurationProperties` class — tự bind từ YAML. |
| `@EnableJpaRepositories` | Spring Data scan repository interface từ data access module. |
| `@EntityScan` | Hibernate scan JPA `@Entity` từ data access module. Cần riêng vì khác package. |

`@EnableJpaRepositories` + `@EntityScan` **cần thiết** khi JPA entity và repository **không cùng package** với main class — đây chính là case của clean architecture multi-module.

## BeanConfiguration — đăng ký Domain Service

```java
package com.food.ordering.system.order.service;

import com.food.ordering.system.order.service.domain.OrderDomainService;
import com.food.ordering.system.order.service.domain.OrderDomainServiceImpl;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class BeanConfiguration {

    @Bean
    public OrderDomainService orderDomainService() {
        return new OrderDomainServiceImpl();
    }
}
```

Chỉ 1 bean cần đăng ký thủ công — `OrderDomainServiceImpl` vì là pure Java không có `@Component`. Mọi class khác (`@Service`, `@Component`, `@Repository`, `@RestController`) tự discovery.

## `OrderServiceConfigData` — config riêng Order

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
@ConfigurationProperties(prefix = "order-service")
public class OrderServiceConfigData {
    private String paymentRequestTopicName;
    private String paymentResponseTopicName;
    private String restaurantApprovalRequestTopicName;
    private String restaurantApprovalResponseTopicName;
}
```

Đặt trong `order-application-service` module — vì cả publisher (`order-messaging`) và listener đều cần.

## `application.yml` đầy đủ

```yaml
server:
  port: 8181

spring:
  jpa:
    open-in-view: false
    show-sql: true
    hibernate:
      ddl-auto: none
  sql:
    init:
      schema-locations: classpath:init-schema.sql    # optional, dev only
      mode: always
  datasource:
    url: jdbc:postgresql://localhost:5432/postgres?currentSchema=order&binaryTransfer=true&reWriteBatchedInserts=true&stringtype=unspecified
    username: postgres
    password: admin
    driver-class-name: org.postgresql.Driver

logging:
  level:
    com.food.ordering.system: DEBUG
    org.springframework.kafka: INFO

order-service:
  payment-request-topic-name: payment-request
  payment-response-topic-name: payment-response
  restaurant-approval-request-topic-name: restaurant-approval-request
  restaurant-approval-response-topic-name: restaurant-approval-response

kafka-config:
  bootstrap-servers: localhost:19092, localhost:29092, localhost:39092
  schema-registry-url-key: schema.registry.url
  schema-registry-url: http://localhost:8081
  num-of-partitions: 3
  replication-factor: 3

kafka-producer-config:
  key-serializer-class: org.apache.kafka.common.serialization.StringSerializer
  value-serializer-class: io.confluent.kafka.serializers.KafkaAvroSerializer
  compression-type: snappy
  acks: all
  batch-size: 16384
  batch-size-boost-factor: 100
  linger-ms: 5
  request-timeout-ms: 60000
  retry-count: 5

kafka-consumer-config:
  key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
  value-deserializer: io.confluent.kafka.serializers.KafkaAvroDeserializer
  payment-consumer-group-id: payment-topic-consumer
  restaurant-approval-consumer-group-id: restaurant-approval-topic-consumer
  auto-offset-reset: earliest
  specific-avro-reader-key: specific.avro.reader
  specific-avro-reader: true
  batch-listener: true
  auto-startup: true
  concurrency-level: 3
  session-timeout-ms: 10000
  heartbeat-interval-ms: 3000
  max-poll-interval-ms: 300000
  poll-timeout-ms: 150
  max-partition-fetch-bytes-default: 1048576
  max-partition-fetch-bytes-boost-factor: 1
```

Đầy đủ, sẵn sàng chạy.

## Giải thích kỹ Kafka consumer properties

Mỗi property có effect cụ thể — đặc biệt quan trọng khi tune throughput vs latency:

### `auto-offset-reset`
- `earliest`: consumer lần đầu join group → đọc từ offset 0 (replay full). Dev hữu ích.
- `latest`: chỉ đọc message **sau khi** consumer up. Production thường dùng.
- `none`: throw exception nếu không có offset → strict.

### `session-timeout-ms` + `heartbeat-interval-ms`
Heartbeat nhỏ hơn session timeout nhiều lần. Quy tắc: `heartbeat ≤ session/3`.
- Heartbeat 3s + session 10s → broker mark dead sau 10s không nghe heartbeat.

### `max-poll-interval-ms`
Giữa 2 lần `poll()`, consumer có 5 phút để xử lý. Quá → kicked out group → rebalance → message replay. Nếu xử lý batch nặng (mỗi message gọi external service, lưu DB) → tăng lên 10-15 phút.

### `max-partition-fetch-bytes`
Mỗi `poll()` từ 1 partition lấy tối đa bao nhiêu bytes. Default 1MB. Boost factor nâng cao throughput cho topic tải lớn.

### `concurrency-level`
Số thread consumer trong 1 instance. Nên = số partition (mỗi thread 1 partition). Vượt = idle.

## Schema SQL `init-schema.sql` (dev only)

```sql
DROP SCHEMA IF EXISTS "order" CASCADE;
CREATE SCHEMA "order";

CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'APPROVED', 'CANCELLING', 'CANCELLED');

CREATE TABLE "order".orders (
    id uuid NOT NULL,
    customer_id uuid NOT NULL,
    restaurant_id uuid NOT NULL,
    tracking_id uuid NOT NULL,
    price numeric(10,2) NOT NULL,
    order_status order_status NOT NULL,
    failure_messages text,
    CONSTRAINT orders_pkey PRIMARY KEY (id)
);

CREATE TABLE "order".order_items (
    id bigint NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    price numeric(10,2) NOT NULL,
    quantity integer NOT NULL,
    sub_total numeric(10,2) NOT NULL,
    CONSTRAINT order_items_pkey PRIMARY KEY (id, order_id),
    CONSTRAINT FK_ITEM_ORDER FOREIGN KEY (order_id) REFERENCES "order".orders (id) ON DELETE CASCADE
);

CREATE TABLE "order".order_address (
    id uuid NOT NULL,
    order_id uuid NOT NULL UNIQUE,
    street character varying NOT NULL,
    postal_code character varying NOT NULL,
    city character varying NOT NULL,
    CONSTRAINT order_address_pkey PRIMARY KEY (id),
    CONSTRAINT FK_ADDRESS_ORDER FOREIGN KEY (order_id) REFERENCES "order".orders (id) ON DELETE CASCADE
);

-- materialized view của Restaurant data
DROP MATERIALIZED VIEW IF EXISTS "order".order_restaurant_m_view;
CREATE MATERIALIZED VIEW "order".order_restaurant_m_view
AS
SELECT r.id AS restaurant_id,
       r.name AS restaurant_name,
       r.active AS restaurant_active,
       p.id AS product_id,
       p.name AS product_name,
       p.price AS product_price
  FROM "restaurant".restaurants r
  JOIN "restaurant".products p ON p.restaurant_id = r.id;

REFRESH MATERIALIZED VIEW "order".order_restaurant_m_view;

-- function + trigger refresh view khi restaurant.products thay đổi
CREATE OR REPLACE FUNCTION "order".refresh_order_restaurant_m_view()
RETURNS trigger AS $$
BEGIN
    REFRESH MATERIALIZED VIEW "order".order_restaurant_m_view;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS refresh_order_restaurant_m_view ON "restaurant".products;
CREATE TRIGGER refresh_order_restaurant_m_view
AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
ON "restaurant".products FOR EACH STATEMENT
EXECUTE PROCEDURE "order".refresh_order_restaurant_m_view();
```

Schema chạy 1 lần khi service start (nhờ `spring.sql.init.mode=always`).

Production thực dùng **Flyway** hoặc **Liquibase** — migration versioned. Khoá học giữ đơn giản.

## Build runnable JAR

`order-container/pom.xml` cần plugin:

```xml
<build>
    <finalName>order-container</finalName>
    <plugins>
        <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
            <configuration>
                <mainClass>com.food.ordering.system.order.service.OrderServiceApplication</mainClass>
            </configuration>
            <executions>
                <execution>
                    <goals><goal>repackage</goal></goals>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

```text
$ mvn clean package -pl order-service/order-container -am
$ java -jar order-service/order-container/target/order-container.jar
```

Service khởi → port 8181 → có thể curl/Postman test ngay.

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Quên `@EntityScan` → JPA entity không discovery | Thêm với package data access module. |
| `scanBasePackages` không cover hết → bean không inject | Đặt `"com.food.ordering.system"` (root). |
| `application.yml` có space/format sai → fail im lặng | Validate YAML lint trước. |
| `ddl-auto=create-drop` ở dev | OK ngắn hạn, mất data sau mỗi restart. Khoá học dùng `none` + script SQL. |
| 2 service cùng port → 1 service không start | Đặt port khác: order 8181, payment 8282, restaurant 8383. |
| Materialized view chưa có data → Restaurant query rỗng | Insert mock data vào `restaurant.restaurants` + refresh view trước. |

## Tóm tắt bài 23

- `order-container` chứa main class, `BeanConfiguration` đăng ký Domain Service, `application.yml` đầy đủ.
- `@EnableJpaRepositories` + `@EntityScan` chỉ rõ package vì multi-module.
- Schema SQL khởi tự động ở dev (`spring.sql.init.mode=always`). Production dùng Flyway.
- Kafka consumer properties tune cẩn thận: session/heartbeat, max-poll-interval, concurrency = số partition.
- Build runnable JAR với `spring-boot-maven-plugin repackage`.

**Bài kế tiếp** → [Bài 24: Customer Service + chạy Order Service end-to-end](05-customer-and-run.md)

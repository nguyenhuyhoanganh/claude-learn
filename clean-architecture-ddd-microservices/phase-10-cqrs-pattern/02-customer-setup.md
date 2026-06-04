# Bài 42: Setup Customer Kafka topic + Customer service module

> Bài 41 đã chốt: Customer thành microservice riêng. Bài này tạo Kafka topic `customer`, Avro schema cho event, và scaffold module Maven của Customer service — sẵn sàng code domain ở bài 43.

## Init Customer topic

Thêm vào `infrastructure/docker-compose/init_kafka.yml`:

```yaml
services:
  init-kafka:
    image: confluentinc/cp-kafka:${KAFKA_VERSION:-7.5.0}
    entrypoint: [ '/bin/sh', '-c' ]
    command: |
      "
      ...                                            # các topic cũ
      kafka-topics --bootstrap-server kafka-broker-1:9092 --create --if-not-exists \
        --topic customer --replication-factor 3 --partitions 3

      kafka-topics --bootstrap-server kafka-broker-1:9092 --list
      "
```

Restart init-kafka:
```text
$ docker compose -f common.yml -f init_kafka.yml up -d --force-recreate
```

Check:
```text
$ docker exec -it kafka-broker-1 kafka-topics \
    --bootstrap-server kafka-broker-1:9092 --list | grep customer
customer
```

## Avro schema — `customer.avsc`

`kafka-model/src/main/resources/avro/customer.avsc`:

```json
{
  "namespace": "com.food.ordering.system.kafka.order.avro.model",
  "type": "record",
  "name": "CustomerAvroModel",
  "fields": [
    { "name": "id",         "type": { "type": "string", "logicalType": "uuid" } },
    { "name": "username",   "type": "string" },
    { "name": "firstName",  "type": "string" },
    { "name": "lastName",   "type": "string" }
  ]
}
```

Build → `CustomerAvroModel.java` generated. Mọi service import.

## Tạo `customer-service` module

```text
food-ordering-system/
└── customer-service/
    ├── pom.xml
    ├── customer-domain/
    │   ├── customer-domain-core/
    │   └── customer-application-service/
    ├── customer-dataaccess/
    ├── customer-messaging/
    └── customer-container/
```

Cấu trúc giống Order. Maven module setup giống phase-2 bài 6.

### Parent `customer-service/pom.xml`

```xml
<project>
    <parent>
        <artifactId>food-ordering-system</artifactId>
        <groupId>com.food.ordering.system</groupId>
        <version>1.0-SNAPSHOT</version>
    </parent>
    <artifactId>customer-service</artifactId>
    <packaging>pom</packaging>
    <modules>
        <module>customer-domain</module>
        <module>customer-dataaccess</module>
        <module>customer-messaging</module>
        <module>customer-container</module>
    </modules>
</project>
```

### `customer-domain/pom.xml`

```xml
<modules>
    <module>customer-domain-core</module>
    <module>customer-application-service</module>
</modules>
```

### `customer-domain-core` — pure Java, không dependency

### `customer-application-service` — depends on `customer-domain-core` + spring

Pattern lặp lại — không có gì khác Order.

## Khai báo trong root `pom.xml`

```xml
<modules>
    <module>common</module>
    <module>infrastructure</module>
    <module>order-service</module>
    <module>payment-service</module>
    <module>restaurant-service</module>
    <module>customer-service</module>          <!-- mới -->
</modules>

<dependencyManagement>
    <dependencies>
        ...                                     <!-- các module Order/Payment/Restaurant -->
        <dependency>
            <groupId>com.food.ordering.system</groupId>
            <artifactId>customer-domain-core</artifactId>
            <version>${project.version}</version>
        </dependency>
        <dependency>
            <groupId>com.food.ordering.system</groupId>
            <artifactId>customer-application-service</artifactId>
            <version>${project.version}</version>
        </dependency>
        <dependency>
            <groupId>com.food.ordering.system</groupId>
            <artifactId>customer-dataaccess</artifactId>
            <version>${project.version}</version>
        </dependency>
        <dependency>
            <groupId>com.food.ordering.system</groupId>
            <artifactId>customer-messaging</artifactId>
            <version>${project.version}</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

## Order service — thêm `order-customer` module phụ

Order cần consume Customer event và lưu local. Tạo sub-module `order-customer`:

```text
order-service/
├── order-domain/
├── order-application/
├── order-application-service/
├── order-dataaccess/
├── order-messaging/
└── order-customer/              ← mới
    ├── pom.xml
    └── src/main/java/com/food/ordering/system/order/service/customer/
        ├── entity/
        │   └── CustomerEntity.java
        ├── repository/
        │   └── CustomerJpaRepository.java
        ├── adapter/
        │   └── CustomerRepositoryImpl.java
        ├── mapper/
        │   └── CustomerDataAccessMapper.java
        └── messaging/
            ├── listener/
            │   └── CustomerKafkaListener.java
            └── mapper/
                └── CustomerMessagingDataMapper.java
```

Module này chứa:
- JPA entity cho local customer table.
- Repository implementation (output port từ `order-application-service`).
- Kafka listener consume `customer` topic.

`order-container` add dependency `order-customer`.

## Schema mới — `order.customers` (local read replica)

```sql
DROP TABLE IF EXISTS "order".customers CASCADE;

CREATE TABLE "order".customers
(
    id          uuid NOT NULL,
    username    character varying COLLATE pg_catalog."default" NOT NULL,
    first_name  character varying COLLATE pg_catalog."default" NOT NULL,
    last_name   character varying COLLATE pg_catalog."default" NOT NULL,
    CONSTRAINT customers_pkey PRIMARY KEY (id)
);
```

Bỏ materialized view `order_customer_m_view` cũ. Thay bằng table thật được sync qua Kafka event.

## Removal — clean up materialized view + trigger

```sql
DROP MATERIALIZED VIEW IF EXISTS "order".order_customer_m_view;
DROP FUNCTION IF EXISTS "order".refresh_order_customer_m_view();
DROP TRIGGER IF EXISTS refresh_order_customer_m_view ON "customer".customers;
```

Customer service sẽ là **source of truth** mới cho customer data. Order chỉ có read replica.

## Customer outbox schema

```sql
DROP TABLE IF EXISTS "customer".customer_outbox CASCADE;

CREATE TABLE "customer".customer_outbox
(
    id              uuid NOT NULL,
    saga_id         uuid NOT NULL,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL,
    processed_at    TIMESTAMP WITH TIME ZONE,
    type            character varying NOT NULL,
    payload         jsonb NOT NULL,
    outbox_status   character varying NOT NULL,
    version         integer NOT NULL,
    CONSTRAINT customer_outbox_pkey PRIMARY KEY (id)
);

CREATE INDEX "customer_outbox_status"
    ON "customer".customer_outbox (outbox_status);
```

Đơn giản hơn payment_outbox vì Customer không có SAGA — chỉ "fire and forget" event.

## Container Customer service config

`application.yml`:

```yaml
server.port: 8484

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/postgres?currentSchema=customer&...

customer-service:
  customer-topic-name: customer
  outbox-scheduler-fixed-rate: 5000
  outbox-scheduler-initial-delay: 30000

kafka-config:
  bootstrap-servers: localhost:19092, localhost:29092, localhost:39092
  schema-registry-url: http://localhost:8081

kafka-producer-config:
  # tương tự Order
```

`OrderServiceApplication` add `@EnableScheduling` (đã có ở phase-9).

`OrderApplicationConfiguration` thêm Customer-related beans:

```java
@Configuration
public class OrderApplicationConfiguration {
    @Bean
    public CustomerRepository customerRepository(CustomerRepositoryImpl impl) {
        return impl;
    }
}
```

## Bẫy thường gặp setup phase

| Bẫy | Sửa |
|---|---|
| Quên init topic `customer` trước khi service start | Producer fail với `UNKNOWN_TOPIC_OR_PARTITION` |
| Avro schema có namespace sai | Generated class path không khớp import |
| Order không có dependency `order-customer` trong container | Listener không scan |
| Customer service port trùng (8181, 8282...) | Đặt port unique (8484) |
| Schema `customer` đã có data + trigger cũ | Drop cleanup trước khi reseed |
| Quên thêm `customer-service` vào root pom `<modules>` | Maven không build |
| Quên CustomerRepositoryImpl scan trong order-container | Spring không inject |

## Tóm tắt bài 42

- Thêm Kafka topic `customer` (3 partition, 3 replica) với Avro schema `CustomerAvroModel`.
- Tạo `customer-service` Maven module 5 con (domain core, app service, data access, messaging, container).
- Tạo `order-customer` module trong Order — consume + lưu local replica.
- Schema `order.customers` (local table) thay materialized view cũ.
- Schema `customer.customer_outbox` cho publish event (đơn giản hơn payment_outbox vì không SAGA).
- Sẵn sàng code domain + listener ở bài 43-44.

**Bài kế tiếp** → [Bài 43: Customer Service — Domain + Outbox + Publish](03-customer-domain.md)

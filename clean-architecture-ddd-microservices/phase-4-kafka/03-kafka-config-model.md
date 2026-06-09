# Bài 17: Module `kafka-config-data` + `kafka-model` (Avro)

> Hai module dùng chung cho tất cả service: config (broker URL, topic name) và model (Avro schema → Java class). Sạch, không phụ thuộc business — chỉ infrastructure.

## Module `kafka-config-data`

Mục đích: chứa `@ConfigurationProperties` để bind từ `application.yml` thành Java object — tránh `@Value` rải rác.

```text
infrastructure/kafka/kafka-config-data/
├── pom.xml
└── src/main/java/com/food/ordering/system/kafka/config/data/
    ├── KafkaConfigData.java
    ├── KafkaProducerConfigData.java
    └── KafkaConsumerConfigData.java
```

### `KafkaConfigData`

```java
package com.food.ordering.system.kafka.config.data;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@NoArgsConstructor
@AllArgsConstructor
@ConfigurationProperties(prefix = "kafka-config")
public class KafkaConfigData {
    private String bootstrapServers;
    private String schemaRegistryUrlKey;
    private String schemaRegistryUrl;
    private Integer numOfPartitions;
    private Short replicationFactor;
}
```

### `KafkaProducerConfigData`

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
@ConfigurationProperties(prefix = "kafka-producer-config")
public class KafkaProducerConfigData {
    private String keySerializerClass;
    private String valueSerializerClass;
    private String compressionType;
    private String acks;
    private Integer batchSize;
    private Integer batchSizeBoostFactor;
    private Integer lingerMs;
    private Integer requestTimeoutMs;
    private Integer retryCount;
}
```

### `KafkaConsumerConfigData`

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
@ConfigurationProperties(prefix = "kafka-consumer-config")
public class KafkaConsumerConfigData {
    private String keyDeserializer;
    private String valueDeserializer;
    private String autoOffsetReset;
    private String specificAvroReaderKey;
    private String specificAvroReader;
    private Integer batchListener;
    private Boolean autoStartup;
    private String concurrencyLevel;
    private Integer sessionTimeoutMs;
    private Integer heartbeatIntervalMs;
    private Integer maxPollIntervalMs;
    private Long pollTimeoutMs;
    private Integer maxPartitionFetchBytesDefault;
    private Integer maxPartitionFetchBytesBoostFactor;
}
```

Mỗi service Spring Boot `application.yml`:

```yaml
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

Bật `@ConfigurationProperties` trong container:

```java
@SpringBootApplication
@EnableConfigurationProperties({
    KafkaConfigData.class,
    KafkaProducerConfigData.class,
    KafkaConsumerConfigData.class
})
public class OrderServiceApplication { ... }
```

## Module `kafka-model` — Avro schema

### Avro là gì?

**Avro** là format serialization có schema. So với JSON:

| | JSON | Avro |
|---|---|---|
| Schema | Tự hiểu, không enforce | Bắt buộc, định nghĩa `.avsc` |
| Type safety | Không | Có (generate Java class) |
| Kích thước message | Lớn (kèm tên field) | Nhỏ (binary, không kèm tên) |
| Backward compatibility | Manual | Schema Registry kiểm tra |

### Schema file — `PaymentRequest.avsc`

```text
kafka-model/src/main/resources/avro/payment_request.avsc
```

```json
{
  "namespace": "com.food.ordering.system.kafka.order.avro.model",
  "type": "record",
  "name": "PaymentRequestAvroModel",
  "fields": [
    { "name": "id",              "type": { "type": "string", "logicalType": "uuid" } },
    { "name": "sagaId",          "type": { "type": "string", "logicalType": "uuid" } },
    { "name": "customerId",      "type": { "type": "string", "logicalType": "uuid" } },
    { "name": "orderId",         "type": { "type": "string", "logicalType": "uuid" } },
    { "name": "price",           "type": { "type": "bytes",  "logicalType": "decimal", "precision": 10, "scale": 2 } },
    { "name": "createdAt",       "type": { "type": "long",   "logicalType": "timestamp-millis" } },
    { "name": "paymentOrderStatus", "type": {
        "type": "enum",
        "name": "PaymentOrderStatus",
        "symbols": [ "PENDING", "CANCELLED" ]
    } }
  ]
}
```

Mỗi field:
- `id`: unique message id (chống dedupe).
- `sagaId`: id của saga instance (xuyên service).
- `customerId`, `orderId`: ID liên quan.
- `price`: `bytes` với `logicalType: decimal` — Avro chuẩn cho BigDecimal.
- `createdAt`: `long` epoch ms.
- `paymentOrderStatus`: enum.

### Schema khác

`payment_response.avsc`, `restaurant_approval_request.avsc`, `restaurant_approval_response.avsc` — cấu trúc tương tự, field tuỳ event.

### Generate Java class với Maven plugin

`pom.xml` của `kafka-model`:

```xml
<dependencies>
    <dependency>
        <groupId>org.apache.avro</groupId>
        <artifactId>avro</artifactId>
        <version>${avro.version}</version>
    </dependency>
</dependencies>

<build>
    <plugins>
        <plugin>
            <groupId>org.apache.avro</groupId>
            <artifactId>avro-maven-plugin</artifactId>
            <version>${avro.version}</version>
            <executions>
                <execution>
                    <phase>generate-sources</phase>
                    <goals>
                        <goal>schema</goal>
                    </goals>
                    <configuration>
                        <sourceDirectory>${project.basedir}/src/main/resources/avro</sourceDirectory>
                        <outputDirectory>${project.basedir}/target/generated-sources</outputDirectory>
                        <enableDecimalLogicalType>true</enableDecimalLogicalType>
                    </configuration>
                </execution>
            </executions>
        </plugin>
    </plugins>
</build>
```

`mvn generate-sources` → tạo `target/generated-sources/com/food/ordering/system/kafka/order/avro/model/PaymentRequestAvroModel.java`.

```java
// Auto-generated
public class PaymentRequestAvroModel extends SpecificRecordBase implements SpecificRecord {
    private CharSequence id;
    private CharSequence sagaId;
    private CharSequence customerId;
    private CharSequence orderId;
    private ByteBuffer price;
    private Long createdAt;
    private PaymentOrderStatus paymentOrderStatus;

    public static Builder newBuilder() { ... }
    public CharSequence getId() { ... }
    public void setId(CharSequence v) { ... }
    // ... getter/setter cho tất cả field
}
```

Class này được mọi service import:

```java
import com.food.ordering.system.kafka.order.avro.model.PaymentRequestAvroModel;
```

## Khi nào update schema — backward compatibility

Schema Registry enforce backward compatibility:
- **Backward**: consumer mới đọc message từ producer cũ (consumer code cũ có thể compile trên schema mới).
- **Forward**: consumer cũ đọc message từ producer mới (consumer mặc kệ field mới).
- **Full**: cả 2.

Quy tắc an toàn:
- Thêm field mới → có **default value** → tương thích.
- Đổi tên field → BREAK. Tạo field mới + giữ cũ.
- Xoá field → BREAK. Giữ field, mark deprecated.

```json
{ "name": "newField", "type": ["null", "string"], "default": null }
```

Field nullable + default null → consumer cũ đọc được message mới (bỏ qua field).

## Bẫy thường gặp

| Bẫy | Tránh bằng cách |
|---|---|
| Avro generate ra `CharSequence` chứ `String` | Đúng. Khi dùng, `.toString()`. Đặc tính Avro. |
| `BigDecimal` field set sai scale | Avro decimal logical type strict scale — match scale giữa schema và data. |
| `IDE không thấy class generated` | Mark `target/generated-sources` as source root trong IntelliJ. |
| `Schema Registry reject vì incompatibility` | Check `subject-name-strategy`. Default `<topic>-value`. |
| Thêm field non-null không default | Sẽ phá backward compat. Default `null` + nullable. |
| Tạo Avro model cho field nội bộ domain | KHÔNG. Avro chỉ cho data **trao đổi giữa service**. |

## Tóm tắt bài 17

- `kafka-config-data` chứa `@ConfigurationProperties` cho broker, producer, consumer.
- `kafka-model` chứa schema Avro `.avsc` + plugin `avro-maven-plugin` generate Java class.
- Tất cả service import cùng Avro class → consistent.
- Schema evolution an toàn: chỉ add field nullable + default → backward compatible.

**Bài kế tiếp** → [Bài 18: Generic Kafka Producer module](04-kafka-producer.md)

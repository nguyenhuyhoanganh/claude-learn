# Bài 18: Generic Kafka Producer module

> Module `kafka-producer` cung cấp **KafkaProducer<K,V> generic** dùng chung cho Order/Payment/Restaurant service. Producer wrap `KafkaTemplate` của Spring với callback handling, error log, generic type cho key + Avro value.

## Cấu trúc

```text
infrastructure/kafka/kafka-producer/
├── pom.xml
└── src/main/java/com/food/ordering/system/kafka/producer/
    ├── KafkaProducer.java              ← interface
    ├── service/
    │   └── impl/
    │       └── KafkaProducerImpl.java
    ├── config/
    │   └── KafkaProducerConfig.java    ← @Bean config
    └── exception/
        └── KafkaProducerException.java
```

## Dependencies — `pom.xml`

```xml
<dependencies>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>kafka-config-data</artifactId>
    </dependency>
    <dependency>
        <groupId>com.food.ordering.system</groupId>
        <artifactId>kafka-model</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.kafka</groupId>
        <artifactId>spring-kafka</artifactId>
    </dependency>
    <dependency>
        <groupId>io.confluent</groupId>
        <artifactId>kafka-avro-serializer</artifactId>
        <version>${kafka-avro.version}</version>
    </dependency>
</dependencies>
```

Confluent's Avro serializer cần repo riêng:

```xml
<repositories>
    <repository>
        <id>confluent</id>
        <url>https://packages.confluent.io/maven/</url>
    </repository>
</repositories>
```

## Interface `KafkaProducer<K, V>`

```java
package com.food.ordering.system.kafka.producer;

import org.apache.avro.specific.SpecificRecordBase;
import org.springframework.kafka.support.SendResult;

import java.io.Serializable;
import java.util.concurrent.CompletableFuture;
import java.util.function.BiConsumer;

public interface KafkaProducer<K extends Serializable, V extends SpecificRecordBase> {
    void send(String topicName,
              K key,
              V message,
              BiConsumer<SendResult<K, V>, Throwable> callback);
}
```

`V extends SpecificRecordBase` → ép value là Avro class.

## Implementation `KafkaProducerImpl`

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class KafkaProducerImpl<K extends Serializable, V extends SpecificRecordBase>
        implements KafkaProducer<K, V> {

    private final KafkaTemplate<K, V> kafkaTemplate;

    @Override
    public void send(String topicName, K key, V message,
                     BiConsumer<SendResult<K, V>, Throwable> callback) {
        log.info("Sending message={} to topic={}", message, topicName);
        try {
            CompletableFuture<SendResult<K, V>> kafkaResultFuture =
                kafkaTemplate.send(topicName, key, message);
            kafkaResultFuture.whenComplete(callback);
        } catch (KafkaException e) {
            log.error("Error on kafka producer with key: {}, message: {} and exception: {}",
                key, message, e.getMessage());
            throw new KafkaProducerException("Error on kafka producer with key: " + key 
                + " and message: " + message);
        }
    }

    @PreDestroy
    public void close() {
        if (kafkaTemplate != null) {
            log.info("Closing kafka producer!");
            kafkaTemplate.destroy();
        }
    }
}
```

`KafkaTemplate.send()` trả `CompletableFuture<SendResult>` (Spring 2.7+). Caller truyền callback xử lý success/failure async.

## Config bean `KafkaProducerConfig`

```java
@Configuration
@RequiredArgsConstructor
public class KafkaProducerConfig<K extends Serializable, V extends SpecificRecordBase> {

    private final KafkaConfigData kafkaConfigData;
    private final KafkaProducerConfigData kafkaProducerConfigData;

    @Bean
    public Map<String, Object> producerConfig() {
        Map<String, Object> props = new HashMap<>();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaConfigData.getBootstrapServers());
        props.put(kafkaConfigData.getSchemaRegistryUrlKey(), kafkaConfigData.getSchemaRegistryUrl());
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, kafkaProducerConfigData.getKeySerializerClass());
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, kafkaProducerConfigData.getValueSerializerClass());
        props.put(ProducerConfig.BATCH_SIZE_CONFIG,
            kafkaProducerConfigData.getBatchSize() * kafkaProducerConfigData.getBatchSizeBoostFactor());
        props.put(ProducerConfig.LINGER_MS_CONFIG, kafkaProducerConfigData.getLingerMs());
        props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, kafkaProducerConfigData.getCompressionType());
        props.put(ProducerConfig.ACKS_CONFIG, kafkaProducerConfigData.getAcks());
        props.put(ProducerConfig.REQUEST_TIMEOUT_MS_CONFIG, kafkaProducerConfigData.getRequestTimeoutMs());
        props.put(ProducerConfig.RETRIES_CONFIG, kafkaProducerConfigData.getRetryCount());
        return props;
    }

    @Bean
    public ProducerFactory<K, V> producerFactory() {
        return new DefaultKafkaProducerFactory<>(producerConfig());
    }

    @Bean
    public KafkaTemplate<K, V> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }
}
```

### Giải thích config quan trọng

| Config | Ý nghĩa |
|---|---|
| `acks=all` | Producer chờ leader + **tất cả ISR** ack → ghi message persistent. Trade-off: chậm hơn `acks=1` nhưng durable hơn. |
| `compression-type=snappy` | Nén message → tiết kiệm network + disk. Snappy nhanh hơn gzip. |
| `batch-size * boost` = 1.6MB | Batch message trước khi gửi → throughput cao. Boost factor cho cấu hình runtime tuỳ chỉnh. |
| `linger-ms=5` | Chờ tối đa 5ms để batch đủ. Nhỏ → latency thấp; lớn → throughput cao. |
| `retries=5` | Producer tự retry 5 lần nếu lỗi tạm. |
| `request-timeout-ms=60000` | Timeout cho 1 request — 60s rộng rãi. |

## Callback helper — `OrderKafkaMessageHelper`

Mỗi service tạo helper riêng để build callback (vì callback chứa logic update outbox/log):

```java
// trong order-messaging
@Slf4j
@Component
public class OrderKafkaMessageHelper {

    public <T> BiConsumer<SendResult<String, T>, Throwable> getKafkaCallback(
            String responseTopicName,
            T avroModel,
            String orderId,
            String avroModelName) {
        return (result, ex) -> {
            if (ex == null) {
                RecordMetadata metadata = result.getRecordMetadata();
                log.info("Received successful response from Kafka for order id: {} " +
                        "Topic: {} Partition: {} Offset: {} Timestamp: {}",
                    orderId, metadata.topic(), metadata.partition(),
                    metadata.offset(), metadata.timestamp());
            } else {
                log.error("Error while sending {} message {} and outbox type: {} to topic {}",
                    avroModelName, avroModel.toString(), responseTopicName, ex);
            }
        };
    }
}
```

Callback async — không block thread chính. Log success + topic/partition/offset để debug.

## Dùng trong service

```java
// order-messaging: CreateOrderKafkaMessagePublisher
@Override
public void publish(OrderCreatedEvent domainEvent) {
    String orderId = domainEvent.getOrder().getId().getValue().toString();
    PaymentRequestAvroModel avroModel =
        orderMessagingDataMapper.orderCreatedEventToPaymentRequestAvroModel(domainEvent);
    kafkaProducer.send(
        orderServiceConfigData.getPaymentRequestTopicName(),
        orderId,                                    // KEY = orderId → ordering theo order
        avroModel,
        orderKafkaMessageHelper.getKafkaCallback(
            orderServiceConfigData.getPaymentResponseTopicName(),
            avroModel, orderId, "PaymentRequestAvroModel"));
}
```

**Key = orderId** đảm bảo mọi message của 1 order đi cùng partition → consumer xử lý theo thứ tự.

## Producer KafkaProducerException

```java
public class KafkaProducerException extends RuntimeException {
    public KafkaProducerException(String message) { super(message); }
}
```

Throw khi `KafkaTemplate.send()` ném `KafkaException` synchronous (vd: broker không reachable). Async failure đi qua callback.

## Bẫy thường gặp với Producer

| Bẫy | Tránh bằng cách |
|---|---|
| `acks=1` cho data quan trọng | Nếu leader die trước replicate → mất. Dùng `acks=all` cho production. |
| Quên `key` → round-robin → out-of-order | Luôn set key cho event cần ordering. |
| Block on `future.get()` → mất async benefit | Dùng callback `whenComplete`. |
| Catch `Exception` rồi swallow | Re-throw `KafkaProducerException` hoặc log + alert. |
| `retries=0` + `acks=all` | Lỗi tạm thời như network blip → fail luôn. Đặt `retries >= 3`. |
| Producer instance per request | Tốn tài nguyên. Spring tự managed singleton qua `KafkaTemplate`. |
| Schema Registry credentials commit vào git | Production có auth → đặt vào env / vault. |

## Tóm tắt bài 18

- `KafkaProducer<K, V>` interface generic, key Serializable, value Avro SpecificRecord.
- Implementation wrap `KafkaTemplate` + callback async + log success/failure.
- Config quan trọng: `acks=all`, `retries=5`, `compression=snappy`, `batch + linger` cho throughput.
- Callback dùng `BiConsumer<SendResult, Throwable>` cho async result handling.
- Key luôn là `orderId` (cho ordering per-order trong cùng partition).

**Bài kế tiếp** → [Bài 19: Generic Kafka Consumer module](05-kafka-consumer.md)

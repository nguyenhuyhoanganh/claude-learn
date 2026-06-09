# Bài 19: Generic Kafka Consumer module

> Đối xứng với Producer, `kafka-consumer` cung cấp **interface consumer generic** + config bean. Mỗi service implement consumer cụ thể (PaymentResponseKafkaListener, RestaurantApprovalResponseKafkaListener) bằng cách extend interface.

## Interface `KafkaConsumer<T>`

```java
package com.food.ordering.system.kafka.consumer;

import org.apache.avro.specific.SpecificRecordBase;
import org.springframework.kafka.support.Acknowledgment;

import java.util.List;

public interface KafkaConsumer<T extends SpecificRecordBase> {
    void receive(List<T> messages,
                 List<String> keys,
                 List<Integer> partitions,
                 List<Long> offsets,
                 Acknowledgment acknowledgment);
}
```

Batch listener: nhận `List<T>` thay vì single message → throughput cao. Cùng key/partition/offset list để debug.

`Acknowledgment` cho phép **manual commit offset** sau khi xử lý xong.

## Config bean `KafkaConsumerConfig<K, V>`

```java
@Configuration
@RequiredArgsConstructor
public class KafkaConsumerConfig<K extends Serializable, V extends SpecificRecordBase> {

    private final KafkaConfigData kafkaConfigData;
    private final KafkaConsumerConfigData kafkaConsumerConfigData;

    @Bean
    public Map<String, Object> consumerConfigs() {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaConfigData.getBootstrapServers());
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, kafkaConsumerConfigData.getKeyDeserializer());
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, kafkaConsumerConfigData.getValueDeserializer());
        props.put(kafkaConfigData.getSchemaRegistryUrlKey(), kafkaConfigData.getSchemaRegistryUrl());
        props.put(kafkaConsumerConfigData.getSpecificAvroReaderKey(),
            kafkaConsumerConfigData.getSpecificAvroReader());
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, kafkaConsumerConfigData.getAutoOffsetReset());
        props.put(ConsumerConfig.SESSION_TIMEOUT_MS_CONFIG, kafkaConsumerConfigData.getSessionTimeoutMs());
        props.put(ConsumerConfig.HEARTBEAT_INTERVAL_MS_CONFIG, kafkaConsumerConfigData.getHeartbeatIntervalMs());
        props.put(ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG, kafkaConsumerConfigData.getMaxPollIntervalMs());
        props.put(ConsumerConfig.MAX_PARTITION_FETCH_BYTES_CONFIG,
            kafkaConsumerConfigData.getMaxPartitionFetchBytesDefault() *
            kafkaConsumerConfigData.getMaxPartitionFetchBytesBoostFactor());
        return props;
    }

    @Bean
    public ConsumerFactory<K, V> consumerFactory() {
        return new DefaultKafkaConsumerFactory<>(consumerConfigs());
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<K, V> kafkaListenerContainerFactory() {
        ConcurrentKafkaListenerContainerFactory<K, V> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory());
        factory.setBatchListener(kafkaConsumerConfigData.getBatchListener());
        factory.setConcurrency(kafkaConsumerConfigData.getConcurrencyLevel());
        factory.setAutoStartup(kafkaConsumerConfigData.getAutoStartup());
        factory.getContainerProperties().setPollTimeout(kafkaConsumerConfigData.getPollTimeoutMs());
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL);
        return factory;
    }
}
```

### Config quan trọng

| Config | Ý nghĩa |
|---|---|
| `auto-offset-reset=earliest` | Consumer lần đầu join group → đọc từ offset 0 (full replay). `latest` chỉ đọc message mới. |
| `session-timeout-ms=10000` | Broker mark consumer "dead" nếu không heartbeat trong 10s. |
| `heartbeat-interval-ms=3000` | Consumer gửi heartbeat mỗi 3s. |
| `max-poll-interval-ms=300000` | Giữa 2 lần poll, consumer có 5 phút để xử lý. Quá → kicked from group. |
| `concurrency-level=3` | 3 thread consumer chạy song song trong 1 instance → tối đa 3 partition song song. |
| `AckMode.MANUAL` | Code tự gọi `acknowledgment.acknowledge()` sau khi xử lý. Tránh mất message nếu xử lý fail. |
| `specific.avro.reader=true` | Deserialize ra concrete Avro class (PaymentResponseAvroModel) thay vì GenericRecord. |

## Implementation cụ thể trong service

Ví dụ Order service nhận response từ Payment:

```java
// order-messaging
@Slf4j
@Component
@RequiredArgsConstructor
public class PaymentResponseKafkaListener implements KafkaConsumer<PaymentResponseAvroModel> {

    private final PaymentResponseMessageListener paymentResponseMessageListener;  // input port (domain)
    private final OrderMessagingDataMapper orderMessagingDataMapper;

    @Override
    @KafkaListener(id = "${kafka-consumer-config.payment-consumer-group-id}",
                   topics = "${order-service.payment-response-topic-name}")
    public void receive(@Payload List<PaymentResponseAvroModel> messages,
                        @Header(KafkaHeaders.RECEIVED_KEY) List<String> keys,
                        @Header(KafkaHeaders.RECEIVED_PARTITION) List<Integer> partitions,
                        @Header(KafkaHeaders.OFFSET) List<Long> offsets,
                        Acknowledgment acknowledgment) {
        log.info("{} number of payment responses received with keys: {}, partitions: {} and offsets: {}",
            messages.size(), keys.toString(), partitions.toString(), offsets.toString());

        messages.forEach(paymentResponseAvroModel -> {
            try {
                if (PaymentStatus.COMPLETED == paymentResponseAvroModel.getPaymentStatus()) {
                    log.info("Processing successful payment for order id: {}",
                        paymentResponseAvroModel.getOrderId());
                    paymentResponseMessageListener.paymentCompleted(
                        orderMessagingDataMapper.paymentResponseAvroModelToPaymentResponse(
                            paymentResponseAvroModel));
                } else if (PaymentStatus.CANCELLED == paymentResponseAvroModel.getPaymentStatus()
                        || PaymentStatus.FAILED == paymentResponseAvroModel.getPaymentStatus()) {
                    log.info("Processing unsuccessful payment for order id: {}",
                        paymentResponseAvroModel.getOrderId());
                    paymentResponseMessageListener.paymentCancelled(
                        orderMessagingDataMapper.paymentResponseAvroModelToPaymentResponse(
                            paymentResponseAvroModel));
                }
            } catch (OptimisticLockingFailureException e) {
                log.error("Caught optimistic locking exception in PaymentResponseKafkaListener for order id: {}",
                    paymentResponseAvroModel.getOrderId());
                // không re-throw — skip dedupe message này (phase-9 sẽ explain)
            } catch (OrderNotFoundException e) {
                log.error("No order found for order id: {}", paymentResponseAvroModel.getOrderId());
            }
        });
        acknowledgment.acknowledge();
    }
}
```

### Pattern xử lý batch

1. Nhận `List<PaymentResponseAvroModel>`.
2. Mỗi message:
   - Convert sang DTO domain.
   - Switch theo `PaymentStatus` (COMPLETED → paymentCompleted; CANCELLED/FAILED → paymentCancelled).
   - Gọi input port (`PaymentResponseMessageListener` từ application service).
3. **Catch exception riêng**:
   - `OptimisticLockingFailureException` → skip (đã có saga khác xử lý).
   - `OrderNotFoundException` → log + skip.
4. **`acknowledgment.acknowledge()` cuối** → commit offset của cả batch.

### Tại sao acknowledge sau khi xử lý xong?

```text
NẾU acknowledge TRƯỚC khi xử lý:
   poll → ack → xử lý → crash mid-process → message mất.

NẾU acknowledge SAU khi xử lý:
   poll → xử lý → ack → crash trước ack → message poll lại lần sau.
   (At-least-once — phải idempotent ở phía consumer)
```

Khoá chọn cách 2: at-least-once + idempotent. An toàn hơn.

## Input port phía Application Service

Listener gọi vào input port:

```java
// order-application-service/ports/input/message/listener
public interface PaymentResponseMessageListener {
    void paymentCompleted(PaymentResponse paymentResponse);
    void paymentCancelled(PaymentResponse paymentResponse);
}
```

Implementation `PaymentResponseMessageListenerImpl` ở Application Service module — gọi `OrderPaymentSaga.process()` (phase-8) hoặc trực tiếp `OrderDomainService.payOrder(...)`.

## Consumer group ID rất quan trọng

```yaml
order-service:
  payment-response-topic-name: payment-response
  restaurant-approval-response-topic-name: restaurant-approval-response

kafka-consumer-config:
  payment-consumer-group-id: payment-topic-consumer
  restaurant-approval-consumer-group-id: restaurant-approval-topic-consumer
```

Group ID khác nhau giữa các consumer trong cùng service. Nếu trùng → tranh nhau message → mỗi listener chỉ nhận 1 phần data.

## Concurrency và scaling

`concurrency-level=3` cùng 3 partition → 3 thread đọc song song trong 1 instance. Nếu chạy 2 instance:
- Mỗi instance có 3 thread → 6 thread tổng.
- Nhưng chỉ 3 partition → chỉ 3 thread active, 3 thread idle.

Scale theo partition: thêm partition (`alter topic`) + thêm instance → song song hơn.

## Bẫy thường gặp với Consumer

| Bẫy | Tránh bằng cách |
|---|---|
| `AckMode.RECORD` (mặc định) + xử lý chậm | Mỗi message commit 1 lần → overhead. Dùng MANUAL + ack batch. |
| Quên `acknowledgment.acknowledge()` | Offset không commit → poll lại liên tục → infinite loop. |
| `max-poll-interval` quá ngắn | Consumer xử lý lâu → bị kick → rebalance → message replay. Tăng nếu xử lý nặng. |
| `auto-offset-reset=latest` lần đầu deploy | Message trước khi consumer up → bị bỏ qua. Dev nên `earliest`. |
| Consumer logic không idempotent | At-least-once → message duplicate. Code phải chấp nhận và skip duplicate. |
| Catch `Exception` rồi tiếp tục → message lỗi infinite retry | Catch loại exception cụ thể; lỗi unrecoverable → log + DLT (dead-letter topic). |
| 2 consumer cùng `groupId` trên cùng topic | Mỗi partition chỉ 1 consumer đọc → tranh nhau. OK nếu cố ý scale; sai nếu vô tình. |
| `batchListener=true` nhưng method ko nhận `List<>` | Spring báo lỗi. Match annotation và signature. |

## Tóm tắt bài 19

- `KafkaConsumer<T>` interface generic Avro value, có `Acknowledgment` cho manual commit.
- `KafkaConsumerConfig` build `ConcurrentKafkaListenerContainerFactory` với `AckMode.MANUAL` + batch listener + concurrency.
- Implementation cụ thể (`PaymentResponseKafkaListener`) annotation `@KafkaListener`, switch theo status, gọi input port domain.
- At-least-once delivery → consumer phải idempotent (sẽ chi tiết ở phase-9 với Outbox).
- Concurrency = số thread trong 1 instance; scale ngang = nhiều instance + đủ partition.

**Bài kế tiếp** → [Bài 20 (phase-5): Hoàn thiện Order Service — REST Controller + ControllerAdvice](../phase-5-order-completion/01-web-controller-advice.md)

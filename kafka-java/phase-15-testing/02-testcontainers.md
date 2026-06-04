# Bài 2: Testcontainers — test với Kafka thật trong Docker

Test Binder nhanh nhưng không phải Kafka thật. Bug **Kafka-specific** (serializer, key handling, partition logic) sẽ slip through.

Testcontainers chạy **Kafka broker thật trong Docker** trong khoảng thời gian test. Slow hơn nhưng catch được mọi bug.

> **Khuyến nghị**: nếu app đơn giản → chỉ dùng Testcontainers (không cần Test Binder). Nếu app phức tạp với nhiều business logic → Test Binder cho majority + ít Testcontainers cho critical e2e.

## Setup Testcontainers

### Maven dependency

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-testcontainers</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.testcontainers</groupId>
    <artifactId>kafka</artifactId>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.awaitility</groupId>
    <artifactId>awaitility</artifactId>
    <scope>test</scope>
</dependency>
```

### TestcontainersConfiguration

Spring Initializr generate sẵn (chọn Testcontainers + Kafka khi tạo project):

```java
package com.calmvinsguru.playground.section02;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.kafka.KafkaContainer;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    KafkaContainer kafkaContainer() {
        return new KafkaContainer(DockerImageName.parse("apache/kafka:latest"));
    }
}
```

Key annotations:
- `@TestConfiguration` — Spring nhận diện là config cho test scope.
- `@ServiceConnection` — Spring tự tìm Kafka container, auto inject `bootstrap.servers` vào app config.

→ KHÔNG cần manually set `spring.kafka.bootstrap-servers` — Spring Boot 3.1+ làm tự động.

## Abstract test base

```java
@Import(TestcontainersConfiguration.class)        // import test config
public abstract class AbstractTest {

    public static final String ORDER_EVENTS_TOPIC = "order-events";
    public static final String DIGITAL_DELIVERY_TOPIC = "digital-delivery";
    public static final String PHYSICAL_DELIVERY_TOPIC = "physical-delivery";

    @Autowired
    protected StreamBridge streamBridge;             // dùng để publish trong test
}
```

`@Import(TestcontainersConfiguration.class)` → mỗi test class extend từ AbstractTest sẽ tự spin Kafka container.

`StreamBridge` được auto-wire (vì giờ có Kafka binder thật). Dùng để producer message trong test.

## Test 1: Consumer (test acts as producer)

Pattern: app là Consumer → test cần "act as producer" để gửi message vào.

Không có `InputDestination` nữa (đó là Test Binder). Dùng **`StreamBridge`** thật.

```java
@SpringBootTest(classes = Section19Runner.DigitalDeliveryConsumer.class,
                properties = {
                    "section=section19",
                    "config=01-digital-consumer.yaml"
                })
@ExtendWith(OutputCaptureExtension.class)
class Lecture01DigitalConsumerTest extends AbstractTest {

    @Test
    void consumesDigitalDelivery(CapturedOutput output) {
        DigitalDelivery delivery = new DigitalDelivery(1, "sam@gmail.com");
        Message<DigitalDelivery> msg = MessageBuilder.withPayload(delivery).build();
        
        // Act: publish qua StreamBridge (Kafka thật)
        streamBridge.send(DIGITAL_DELIVERY_TOPIC, msg);
        
        // Assert: KHÔNG được verify ngay — async!
        Awaitility.await()
            .atMost(Duration.ofSeconds(5))
            .untilAsserted(() ->
                Assertions.assertTrue(
                    output.getOut().contains("digital delivery: DigitalDelivery[orderId=1")
                )
            );
    }
}
```

### Quan trọng: dùng Awaitility cho assertion async

Test Binder: synchronous. Send xong → message ngay tại consumer.

Testcontainers: **async**. Send message → qua broker → broker deliver tới consumer → consumer process. Có thể mất vài ms đến vài trăm ms.

Nếu assert ngay sau send → có thể consumer chưa process xong → assertion fail.

#### Cách XẤU: `Thread.sleep`

```java
streamBridge.send(...);
Thread.sleep(2000);     // hard-coded sleep
assertTrue(...);
```

Vấn đề:
- Nếu consumer xử lý nhanh hơn 2s → test chờ thừa.
- Nếu chậm hơn 2s → test fail.

#### Cách TỐT: Awaitility

```java
Awaitility.await()
    .atMost(Duration.ofSeconds(5))         // tối đa đợi 5s
    .untilAsserted(() -> {                 // re-check assertion
        Assertions.assertTrue(...);
    });
```

Awaitility:
- Mỗi 100ms default → chạy assertion lambda.
- Nếu assertion pass → exit ngay.
- Nếu chưa pass → wait, retry.
- Tổng wait time max = `atMost`.

→ Test pass nhanh nếu consumer nhanh, không đợi thừa. Wait nếu cần.

Custom polling interval:
```java
.pollInterval(Duration.ofMillis(50))      // check mỗi 50ms
```

## Test 2: Producer (test acts as consumer)

Pattern: app là Producer → test cần "act as consumer" để receive message.

Không có `OutputDestination`. Cần expose **một consumer bean** trong test scope.

### TestConsumerConfiguration

```java
@TestConfiguration
public class TestConsumerConfiguration {

    @Bean
    public BlockingQueue<Message<Order>> orders() {
        return new LinkedBlockingQueue<>();     // thread-safe queue
    }

    @Bean
    public Consumer<Message<Order>> testConsumer(BlockingQueue<Message<Order>> orders) {
        return orders::add;     // mỗi message → add vào queue
    }
}
```

Pattern:
- Consumer bean subscribe topic Kafka.
- Mỗi message nhận được → add vào `BlockingQueue`.
- Test class inject queue, poll messages, assert.

`BlockingQueue` thread-safe + có `poll(timeout)` chờ tới khi có message.

### Producer test class

```java
@SpringBootTest(classes = Section19Runner.Producer.class,
                properties = {
                    "section=section19",
                    "config=04-producer.yaml",
                    // ← THÊM test consumer vào function.definition
                    "spring.cloud.function.definition=producer;testConsumer",
                    "spring.cloud.stream.bindings.testConsumer-in-0.destination=order-events",
                    "spring.cloud.stream.kafka.bindings.testConsumer-in-0.consumer.configuration.key.deserializer=org.apache.kafka.common.serialization.IntegerDeserializer",
                    "spring.cloud.stream.kafka.bindings.testConsumer-in-0.consumer.configuration.auto.offset.reset=earliest"
                })
@Import(TestConsumerConfiguration.class)
class Lecture03ProducerTest extends AbstractTest {

    @Autowired
    BlockingQueue<Message<Order>> orders;

    @Test
    void producesOrders() throws InterruptedException {
        // Producer auto chạy, emit message mỗi giây
        
        Message<Order> message1 = orders.poll(5, TimeUnit.SECONDS);
        Assertions.assertNotNull(message1);
        Assertions.assertEquals(1,
            message1.getHeaders().get(KafkaHeaders.RECEIVED_KEY, Integer.class));  // ← RECEIVED_KEY!
        Assertions.assertEquals(1, message1.getPayload().orderId());
        Assertions.assertEquals(ProductType.DIGITAL, message1.getPayload().productType());
        
        Message<Order> message2 = orders.poll(5, TimeUnit.SECONDS);
        Assertions.assertNotNull(message2);
        Assertions.assertEquals(2,
            message2.getHeaders().get(KafkaHeaders.RECEIVED_KEY, Integer.class));
        Assertions.assertEquals(ProductType.PHYSICAL, message2.getPayload().productType());
    }
}
```

### Quan trọng: `function.definition=producer;testConsumer`

YAML gốc của producer chỉ có `function.definition=producer`. Nếu test override thành `testConsumer` → producer bean **không được activate** → app không produce gì.

Cần **cộng cả 2**: `producer;testConsumer`.

Producer bean (từ YAML gốc) + test consumer bean (từ test config) đều active.

### Quirk: `RECEIVED_KEY` không phải `KEY`

Khác Test Binder. Testcontainers dùng **Kafka binder thật** → binder rename inbound key → dùng `KafkaHeaders.RECEIVED_KEY`.

→ Quy tắc:
- Test Binder: `KafkaHeaders.KEY` (không rename).
- Testcontainers: `KafkaHeaders.RECEIVED_KEY` (rename).

### Properties dạng inline (không YAML)

Spring Boot test cho phép pass properties dạng inline list:

```java
properties = {
    "spring.cloud.function.definition=producer;testConsumer",
    "spring.cloud.stream.bindings.testConsumer-in-0.destination=order-events",
    ...
}
```

Tránh tạo YAML file riêng cho test config. Tiện cho one-off test config.

Production-grade alternative: tạo `application-test.yaml` riêng + `@ActiveProfiles("test")`.

## Catching Serialization Issue — vì sao Testcontainers quan trọng

Demo realistic: bug producer config quên `key.serializer`.

```yaml
# Producer YAML có lỗi
spring:
  cloud:
    stream:
      kafka:
        bindings:
          producer-out-0:
            producer:
              configuration:
                # key.serializer: IntegerSerializer    ← QUÊN!
      bindings:
        producer-out-0:
          destination: order-events
```

Producer publish với `KafkaHeaders.KEY = Integer 1`.

### Test Binder result

```
[Test] PASS ✓
```

Test Binder không simulate Kafka serialization → không catch bug → false positive.

### Testcontainers result

```
[Test] FAILED
Caused by: org.apache.kafka.common.errors.SerializationException:
  Can't convert key of class java.lang.Integer to class [B configured in key.serializer
```

Kafka thật fail vì không tìm thấy serializer cho Integer → producer throw exception → message không bao giờ tới topic → test consumer không nhận → test fail.

✅ Testcontainers catch được bug Test Binder miss.

→ Vì vậy **PHẢI** có Testcontainers cho critical paths.

## Khi nào pull image — performance note

Lần đầu chạy test:
```
Pulling apache/kafka:latest...
Pulled 100MB.
Starting container...
Container ready (10-30s).
```

Lần sau:
```
Starting container...   (10s, image cached)
```

→ Test đầu tiên chậm. CI cache image để giảm overhead. Local dev OK.

## So sánh Test Binder vs Testcontainers

| Aspect | Test Binder | Testcontainers |
|---|---|---|
| Speed | Cực nhanh (<1s) | Chậm (5-30s + Docker overhead) |
| Realistic | KHÔNG | Có (Kafka thật) |
| Catch Kafka bugs | KHÔNG | Có |
| Infrastructure | Không cần | Cần Docker |
| Setup | Đơn giản | Cần config + image pull |
| Use for | Business logic | E2e critical paths |
| Recommendation | Optional | **Must have** |

## Best practice: hybrid

```text
Testing pyramid:
   /\
  /  \         E2E (Testcontainers)        — vài critical paths
 /    \        
/______\       Integration (Test Binder)    — business logic majority
|      |
|______|       Unit tests                   — service layer logic
```

- 70% unit tests (mock dependencies).
- 25% Test Binder integration tests (business flow).
- 5% Testcontainers e2e tests (critical Kafka-specific behavior).

## Tóm tắt bài 2

- **Testcontainers** = Kafka broker thật chạy trong Docker trong test scope.
- `@ServiceConnection` + `KafkaContainer` bean → Spring auto config bootstrap server.
- Test consumer app: dùng `StreamBridge.send()` để publish (thay vì InputDestination).
- Test producer app: expose `Consumer<Message<T>>` bean + `BlockingQueue` trong test config.
- Khi inject test consumer: `function.definition=producer;testConsumer` (cả 2 active).
- Testcontainers async → **dùng Awaitility** thay vì Thread.sleep.
- Quirk: dùng `KafkaHeaders.RECEIVED_KEY` (Kafka binder rename), khác Test Binder (`KafkaHeaders.KEY`).
- **PHẢI** có Testcontainers cho critical e2e — Test Binder miss Kafka-specific bug (serializer, partitioning).
- Image pull lần đầu chậm, sau đó cached.
- Best practice: hybrid 70% unit + 25% Test Binder + 5% Testcontainers.

**Bài kế tiếp** → [Bài 3: Tóm tắt Phase 15 + production best practices](03-summary.md)

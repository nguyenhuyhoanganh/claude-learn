# Bài 1: Test Binder — testing nhanh trong JVM

Khi viết test cho EDA app, có 2 cách chính:
- **Test Binder**: in-memory queue trong cùng JVM. Không cần Kafka thật. Nhanh.
- **Testcontainers**: spin up Kafka broker thật trong Docker container. Realistic. Chậm hơn.

Bài này: dùng Test Binder. Bài 2-3 sẽ dùng Testcontainers.

## Test Binder là gì?

> **Test Binder** = SCS test implementation. Thay vì gửi message qua Kafka, nó dùng **in-memory queue** trong JVM.

```text
Production:
  Producer App ──► Kafka broker (network) ──► Consumer App

Test Binder:
  Producer App ──► in-memory queue (JVM) ──► Consumer App
```

Không có broker thật. Không có network call. Không cần Docker. Test chạy trong vài giây.

### Pros + Cons

| Pro | Con |
|---|---|
| **Cực nhanh** (no network, no broker startup) | **Không phải Kafka thật** — miss Kafka-specific bug |
| Không cần infrastructure (Docker, etc.) | Behavior có thể khác Kafka thực (serialization, partitioning) |
| Test logic business của app | Không test được isolation level, transaction, etc. |
| CI/CD friendly | Không test được key serialization quirks |
| Verify producer publish gì + consumer xử lý gì | |

→ Test Binder dùng cho **majority của test** (verify business logic). Bài 2 sẽ thêm Testcontainers cho critical end-to-end test.

## Project setup

```text
section19/
  Section19Runner.java (multiple inner classes — Producer, Processor, DigitalConsumer, PhysicalConsumer)
  producer/
  processor/
  consumer/
  dto/
    Order.java
    DigitalDelivery.java
    PhysicalDelivery.java
```

Reuse từ section 18 (content-based routing).

### src/test/java structure

```text
section01/
  AbstractTest.java                   — common base với @EnableTestBinder
  Lecture01DigitalConsumerTest.java
  Lecture02PhysicalConsumerTest.java
  Lecture03ProducerTest.java
  Lecture04ProcessorTest.java
```

### Maven dependency

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-stream-test-binder</artifactId>
    <scope>test</scope>
</dependency>
```

## AbstractTest base

```java
package com.calmvinsguru.playground.section01;

import com.fasterxml.jackson.databind.json.JsonMapper;
import org.springframework.cloud.stream.binder.test.EnableTestBinder;
import org.springframework.cloud.stream.binder.test.InputDestination;
import org.springframework.cloud.stream.binder.test.OutputDestination;
import org.springframework.messaging.Message;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.beans.factory.annotation.Autowired;
import java.time.Duration;

@EnableTestBinder           // ← KEY: tell Spring dùng Test Binder thay vì Kafka binder
public abstract class AbstractTest {

    public static final String ORDER_EVENTS_TOPIC = "order-events";
    public static final String DIGITAL_DELIVERY_TOPIC = "digital-delivery";
    public static final String PHYSICAL_DELIVERY_TOPIC = "physical-delivery";

    @Autowired
    protected InputDestination input;        // gửi message vào app

    @Autowired
    protected OutputDestination output;      // nhận message từ app

    /**
     * Helper deserialize byte[] về object type cụ thể.
     * Test binder return payload dạng byte[] — phải tự convert.
     */
    protected <T> Message<T> receive(String destination, Class<T> type) {
        Message<byte[]> msgBytes = output.receive(Duration.ofMillis(1000).toMillis(), destination);
        if (msgBytes == null) return null;
        
        try {
            T payload = JsonMapper.builder().build()
                .readValue(msgBytes.getPayload(), type);
            return MessageBuilder.createMessage(payload, msgBytes.getHeaders());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
```

### Annotation `@EnableTestBinder`

**KEY annotation**. Nếu không có:
- Spring detect Kafka binder trong classpath.
- Test cố connect Kafka broker → fail (không có broker).

`@EnableTestBinder` báo Spring: "dùng test implementation, in-memory only."

### 2 bean được inject

| Bean | Mục đích |
|---|---|
| `InputDestination` | Send message **vào consumer app** (simulate producer ngoài) |
| `OutputDestination` | Receive message **từ producer/processor app** xuất ra |

`input.send(message, topic)` → gửi đến binding consumer của app.
`output.receive(timeout, topic)` → nhận message app đã produce.

> Lưu ý: tham số `topic` ở đây là **tên Kafka topic**, KHÔNG phải binding name. Vd `order-events`, không phải `processor-in-0`.

## Test 1: Consumer

Test DigitalDeliveryConsumer:

```java
@SpringBootTest(classes = Section19Runner.DigitalDeliveryConsumer.class,
                properties = {
                    "section=section19",
                    "config=01-digital-consumer.yaml"
                })
@ExtendWith(OutputCaptureExtension.class)        // ← capture log để verify
class Lecture01DigitalConsumerTest extends AbstractTest {

    @Test
    void consumesDigitalDelivery(CapturedOutput output) {
        // Arrange
        DigitalDelivery delivery = new DigitalDelivery(1, "sam@gmail.com");
        Message<DigitalDelivery> msg = MessageBuilder.withPayload(delivery).build();
        
        // Act
        input.send(msg, DIGITAL_DELIVERY_TOPIC);
        
        // Assert
        Assertions.assertTrue(
            output.getOut().contains("digital delivery: DigitalDelivery[orderId=1")
        );
    }
}
```

### Giải thích từng phần

**`@SpringBootTest(classes = ...)`**

Bình thường Spring tự tìm `@SpringBootApplication`. Trong playground project có **nhiều runner** (Producer, Processor, Consumer, ...) → Spring không biết class nào.

→ Phải **explicit chỉ định**: chỉ load DigitalDeliveryConsumer runner.

**`properties = {...}`**

Pass parameters cho dynamic YAML loading (Phase 4 đã setup):
- `section=section19` → resolve `${section}` trong application.yaml.
- `config=01-digital-consumer.yaml` → resolve `${config}`.

**`@ExtendWith(OutputCaptureExtension.class)`**

Demo app chỉ log message ra console, không lưu DB. Verify bằng cách check log.

Spring Boot Test cung cấp `OutputCaptureExtension` — capture stdout trong test scope.

```java
void consumesDigitalDelivery(CapturedOutput output) {
    // output.getOut() = mọi text in ra console trong test
}
```

→ Hack để verify khi không có DB. Production app thường có DB → inject repository và verify rows được insert.

**`MessageBuilder.withPayload(...)`** + **`input.send(...)`**

Tạo Message<T> và gửi qua input destination tới topic `digital-delivery`. Consumer app subscribe topic này, sẽ nhận và process.

**Assertion**

Check log có chứa text expected. Nếu app log đúng → test pass.

### Test PhysicalConsumer tương tự

```java
@SpringBootTest(classes = Section19Runner.PhysicalDeliveryConsumer.class,
                properties = {"section=section19", "config=02-physical-consumer.yaml"})
@ExtendWith(OutputCaptureExtension.class)
class Lecture02PhysicalConsumerTest extends AbstractTest {

    @Test
    void consumesPhysicalDelivery(CapturedOutput output) {
        PhysicalDelivery delivery = new PhysicalDelivery(2, "5th Street");
        input.send(MessageBuilder.withPayload(delivery).build(), PHYSICAL_DELIVERY_TOPIC);
        
        Assertions.assertTrue(
            output.getOut().contains("physical delivery: PhysicalDelivery[orderId=2")
        );
    }
}
```

Same pattern.

## Test 2: Producer

Test producer emit Order objects định kỳ:

```java
@SpringBootTest(classes = Section19Runner.Producer.class,
                properties = {"section=section19", "config=04-producer.yaml"})
class Lecture03ProducerTest extends AbstractTest {

    @Test
    void producesOrders() {
        // Producer auto chạy, emit message qua poller mỗi giây
        
        Message<Order> message1 = receive(ORDER_EVENTS_TOPIC, Order.class);
        Message<Order> message2 = receive(ORDER_EVENTS_TOPIC, Order.class);
        
        // Validate message 1
        Assertions.assertEquals(1, 
            message1.getHeaders().get(KafkaHeaders.KEY, Integer.class));
        Assertions.assertEquals(1, message1.getPayload().orderId());
        Assertions.assertEquals(ProductType.DIGITAL, message1.getPayload().productType());
        
        // Validate message 2
        Assertions.assertEquals(2,
            message2.getHeaders().get(KafkaHeaders.KEY, Integer.class));
        Assertions.assertEquals(2, message2.getPayload().orderId());
        Assertions.assertEquals(ProductType.PHYSICAL, message2.getPayload().productType());
    }
}
```

### Quirk quan trọng: dùng `KafkaHeaders.KEY` không phải `RECEIVED_KEY`

Phase 5 bài 2 đã giải thích: producer set `KafkaHeaders.KEY`, consumer đọc `KafkaHeaders.RECEIVED_KEY` (Kafka binder rename inbound).

**Trong Test Binder**: KHÔNG có Kafka binder → header KHÔNG bị rename. Test sẽ thấy nguyên header `KafkaHeaders.KEY` mà producer set.

→ Trong test với Test Binder: dùng `KafkaHeaders.KEY` để đọc key.

(Test với Testcontainers sẽ dùng `RECEIVED_KEY` vì có Kafka binder thật — bài 2.)

### Padding pattern cho processor test

```java
@SpringBootTest(classes = Section19Runner.Processor.class,
                properties = {"section=section19", "config=03-processor.yaml"})
class Lecture04ProcessorTest extends AbstractTest {

    @Test
    void processorTransformsOrderToDelivery() {
        // Arrange: send Order vào input topic
        Order order = new Order(42, 100, 50.0, ProductType.DIGITAL);
        input.send(MessageBuilder.withPayload(order).build(), ORDER_EVENTS_TOPIC);
        
        // Act + Assert: processor emit DigitalDelivery
        Message<DigitalDelivery> delivered = receive(DIGITAL_DELIVERY_TOPIC, DigitalDelivery.class);
        
        Assertions.assertNotNull(delivered);
        Assertions.assertEquals(42, delivered.getPayload().orderId());
    }
}
```

Processor consume từ `order-events`, emit ra `digital-delivery` (nếu digital). Test cover full flow.

## Trade-off với approach output capture

Verify qua log → fragile, dễ break khi đổi log format.

Production app dùng repository → test rõ ràng hơn:

```java
@Test
void persistsOrder() {
    DigitalDelivery delivery = new DigitalDelivery(1, "sam@x.com");
    input.send(MessageBuilder.withPayload(delivery).build(), DIGITAL_DELIVERY_TOPIC);
    
    // Verify DB state
    Optional<DeliveryEntity> saved = repository.findByOrderId(1);
    assertTrue(saved.isPresent());
    assertEquals("sam@x.com", saved.get().getEmail());
}
```

Khi có DB + repository: prefer assert qua repository. Output capture chỉ hack cho demo không có DB.

## Test Binder limitations — bài 2 sẽ học

Test Binder **không** simulate:
- Real Kafka serialization (key/value serializer config).
- Partitioning behavior dựa trên hash(key).
- Consumer group rebalancing.
- Transaction commit/abort markers.
- Isolation levels.
- Network failure modes.

Production-grade app **cần** Testcontainers cho critical paths. Bài 2.

## Tóm tắt bài 1

- **Test Binder** = in-memory queue trong JVM, không cần Kafka broker.
- Cực nhanh, không cần infrastructure → CI/CD friendly.
- Annotation `@EnableTestBinder` cho test class (hoặc abstract base).
- 2 bean: `InputDestination.send(msg, topic)` + `OutputDestination.receive(timeout, topic)`.
- Pass topic name (vd "order-events"), KHÔNG phải binding name.
- Output trả về `Message<byte[]>` → phải tự deserialize bằng JsonMapper.
- Playground có multiple Spring Boot apps → phải `@SpringBootTest(classes = ...)` explicit.
- Pass properties `section` + `config` cho dynamic YAML loader.
- App không có DB → dùng `OutputCaptureExtension` để check log (hack tạm).
- Test Binder dùng `KafkaHeaders.KEY` (KHÔNG `RECEIVED_KEY`) — vì không có Kafka binder rename.
- Limitations: không simulate Kafka-specific behavior (serialization, partition, transaction).
- → Bổ sung Testcontainers cho critical e2e tests (bài 2).

**Bài kế tiếp** → [Bài 2: Testcontainers — test với Kafka thật trong Docker](02-testcontainers.md)

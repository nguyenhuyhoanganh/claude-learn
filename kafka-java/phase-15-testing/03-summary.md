# Bài 3: Tóm tắt Phase 15 — Testing strategies

Phase 15 đã cover 2 approach test cho EDA app. Bài này tổng kết quick reference + best practices production.

## Approach so sánh chi tiết

| Trục | Test Binder | Testcontainers |
|---|---|---|
| **Backend** | In-memory queue trong JVM | Docker Kafka container thật |
| **Annotation** | `@EnableTestBinder` | `@Import(TestcontainersConfiguration.class)` |
| **Inject để gửi** | `InputDestination.send()` | `StreamBridge.send()` |
| **Inject để nhận** | `OutputDestination.receive()` | Test consumer bean + `BlockingQueue` |
| **Speed** | <1 giây | 5-30 giây + Docker startup |
| **Catch Kafka bug** | KHÔNG | Có |
| **Header key** | `KafkaHeaders.KEY` | `KafkaHeaders.RECEIVED_KEY` |
| **Async** | Synchronous | Async → cần Awaitility |
| **CI/CD** | Trivial | Cần Docker available |
| **Use case** | Business logic majority | E2E critical paths |

## Workflow chuẩn cho từng loại app

### Consumer app

```text
Test Binder:
  Test ──input.send()──► Consumer App
                          │
                          ▼
                       Process
                          │
                          ▼
                       Verify (DB / log)

Testcontainers:
  Test ──streamBridge.send()──► Kafka broker ──► Consumer App
                                                   │
                                                   ▼
                                                Process
                                                   │
                                                   ▼
                                          Verify với Awaitility
```

### Producer app

```text
Test Binder:
  Producer App ──► (in-memory) ──► output.receive() ──► Verify

Testcontainers:
  Producer App ──► Kafka broker ──► Test Consumer Bean
                                       │
                                       ▼
                                   BlockingQueue
                                       │
                                       ▼
                              queue.poll() trong test → Verify
```

### Processor app (consume + produce)

Test acts as **both** producer (gửi input) **và** consumer (nhận output).

```text
Test Binder:
  Test ──input.send()──► Processor ──► output.receive() ──► Verify

Testcontainers:
  Test ──streamBridge.send()──► Kafka ──► Processor ──► Kafka ──► Test Consumer ──► Queue ──► Verify
```

## Patterns thường dùng

### Pattern 1: Verify với DB repository (production-like)

App thực tế thường save DB. Test verify qua repository:

```java
@Test
void persistsOrder() {
    Order order = new Order(1, ...);
    streamBridge.send("order-events", order);
    
    Awaitility.await()
        .atMost(Duration.ofSeconds(5))
        .untilAsserted(() -> {
            Optional<OrderEntity> saved = orderRepository.findById(1);
            assertTrue(saved.isPresent());
            assertEquals("Mike", saved.get().getCustomer());
        });
}
```

Tốt hơn nhiều so với check log.

### Pattern 2: Awaitility với polling interval

Default Awaitility check mỗi 100ms. Tune:

```java
Awaitility.await()
    .atMost(Duration.ofSeconds(10))
    .pollInterval(Duration.ofMillis(50))   // check thường xuyên hơn
    .untilAsserted(...);
```

Cẩn thận: `pollInterval` quá nhỏ → CPU spin. 50-100ms balance OK.

### Pattern 3: Multiple assertion với same wait

Verify nhiều thứ trong cùng wait:

```java
Awaitility.await()
    .atMost(Duration.ofSeconds(5))
    .untilAsserted(() -> {
        Optional<OrderEntity> order = orderRepo.findById(1);
        assertTrue(order.isPresent());
        assertEquals("DELIVERED", order.get().getStatus());
        
        List<NotificationEntity> notifs = notifRepo.findByOrderId(1);
        assertEquals(2, notifs.size());      // SMS + email
    });
```

### Pattern 4: Cleanup giữa test

Vì Testcontainers chạy Kafka thật, message từ test trước có thể leak sang test sau (nếu dùng cùng topic).

Options:
- Topic name unique per test: `"order-events-" + UUID.randomUUID()`.
- Reset offset trước mỗi test: gọi `kafka-consumer-groups.sh --reset-offsets`.
- Container per-class thay vì shared (chậm hơn nhưng isolated).

Default behavior: container shared trong test class, có thể leak. Cẩn thận với tests parallel.

## Common pitfalls

| Pitfall | Vấn đề | Sửa |
|---|---|---|
| Hard-coded `Thread.sleep` | Test flaky, chậm | Dùng Awaitility |
| Quên `@SpringBootTest(classes=...)` | Spring load wrong app | Explicit specify |
| Quên include test consumer trong `function.definition` | Test consumer không activate | `producer;testConsumer` |
| Confuse `KafkaHeaders.KEY` vs `RECEIVED_KEY` | Test pass với binder, fail với container | Test Binder = KEY, Testcontainers = RECEIVED_KEY |
| Test Binder cho serialization-sensitive logic | Miss bug | Phải có Testcontainers |
| Container restart mỗi test | Slow | Shared container per class |
| Quên auto.offset.reset=earliest cho test consumer | Miss message published trước test consumer start | Set earliest |
| BlockingQueue poll quá ngắn timeout | Test flaky khi network slow | Min 5 giây |

## Production-grade testing setup

### Pyramid

```text
       /\
      /  \   ── 5%   Testcontainers E2E
     /    \
    /------\ ── 25%  Test Binder integration
   /        \
  /----------\ ── 70%  Unit tests (mock deps)
 |____________|
```

### CI/CD considerations

- **Test Binder**: chạy nhanh → đưa vào `mvn test` phase chính. Block PR.
- **Testcontainers**: cần Docker → chạy ở job riêng (CI runner có Docker). Có thể tag `@Tag("e2e")` skip ở local fast loop.

```java
@Tag("e2e")
@SpringBootTest(...)
class Lecture01DigitalConsumerTest extends AbstractTest { ... }
```

Maven:
```xml
<profile>
    <id>fast</id>
    <build>
        <plugins>
            <plugin>
                <artifactId>maven-surefire-plugin</artifactId>
                <configuration>
                    <excludedGroups>e2e</excludedGroups>
                </configuration>
            </plugin>
        </plugins>
    </build>
</profile>
```

```bash
mvn test -P fast          # skip e2e
mvn test                  # full bao gồm e2e
```

## Đo coverage

| Coverage type | Tool | What to check |
|---|---|---|
| Line/branch coverage | JaCoCo | Code path nào chưa test |
| Mutation testing | PIT | Test có thực sự catch bug? |
| Integration coverage | Manual review | Critical flow nào đã có test? |

Goal hợp lý:
- Line coverage 70-85%.
- Critical business flow 100%.
- Edge cases (error handling, retry, DLQ): minimum 1 test each.

## Best practices cuối cùng

✅ **DO**:
- Hybrid Test Binder (fast) + Testcontainers (realistic).
- Awaitility cho async assertion.
- Repository assertion thay vì log check.
- Tag e2e tests để skip ở fast loop.
- Container shared per test class để giảm overhead.
- Pass section + config properties cho dynamic YAML.
- Test serialization scenarios với Testcontainers.

❌ **DON'T**:
- `Thread.sleep` cho async wait.
- Skip Testcontainers vì "Test Binder đủ rồi" — sẽ miss bug Kafka-specific.
- Test logic bằng output capture trừ khi không có DB.
- Forget cleanup state giữa tests parallel.
- Hard-code timeout quá ngắn (< 5s).
- Mix Test Binder + Testcontainers trong cùng test class (annotation conflict).

## Tóm tắt Phase 15

- **Test Binder**: in-memory, nhanh, dùng cho business logic. `@EnableTestBinder`, `InputDestination`/`OutputDestination`.
- **Testcontainers**: Docker Kafka thật, realistic, must-have cho critical paths. `@Import(TestcontainersConfiguration)`, `StreamBridge` + test consumer bean.
- 3 loại app pattern:
  - Consumer app → test gửi message vào.
  - Producer app → test nhận message ra.
  - Processor app → test làm cả 2.
- **Awaitility** thay vì `Thread.sleep` cho assertion async.
- Quirk header: Test Binder dùng `KafkaHeaders.KEY`, Testcontainers dùng `RECEIVED_KEY`.
- Test pyramid hybrid: 70% unit + 25% Test Binder + 5% Testcontainers.
- Testcontainers catch được serialization bug mà Test Binder miss → must have.
- CI/CD: tag e2e, profile riêng để control khi nào chạy.

**Bài kế tiếp** → [Phase 16 - Kafka Security](../phase-16-security/01-security-basics.md)

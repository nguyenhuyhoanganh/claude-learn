# Bài 3: Deserialization failures + Dynamic Pause/Resume consumer

2 advanced topics:
1. **Deserialization failure**: Spring không decode được bytes thành Java object.
2. **Pause/Resume**: tạm dừng consumer khi dependent service down, tránh hammer retry vô ích.

## Deserialization Failure

Bài 2 dạy DLQ cho exception trong **business logic** (InputValidationException, ServiceUnavailableException). Nhưng có 1 loại exception nữa: **deserialization exception** xảy ra **trước khi** bean handler được gọi.

### Khi nào xảy ra?

```java
@Bean
public Consumer<Integer> consumer() {     // expect Integer
    return order -> processOrder(order);
}
```

Spring config `value.deserializer = IntegerDeserializer`.

```bash
# T1 producer console
> 1     ✓ Spring decode bytes "1" → Integer 1 → handler nhận
> 100   ✓ decode OK
> -10   ✓ decode OK (vẫn là số nguyên hợp lệ)
> Vinod ✗ "Vinod" là String, KHÔNG decode thành Integer được!
```

Trường hợp `Vinod`:
- Producer gửi bytes của String "Vinod" (StringSerializer).
- Consumer thấy bytes, cố cast thành Integer bằng `IntegerDeserializer`.
- Deserializer throw `SerializationException`.
- Error xảy ra **trước khi handler bean được gọi**.

### Behavior với DLQ

Tin tốt: nếu `enable-dlq: true` → message **vẫn được gửi sang DLQ**.

T2 (DLQ consumer):
```text
key=null
value=Vinod        ← raw bytes của string "Vinod"

Headers:
  x-exception-fqcn: org.apache.kafka.common.errors.SerializationException
  x-exception-message: Size of data received by IntegerDeserializer is not 4
  x-exception-stacktrace: ...
  x-original-topic: order-events
  x-original-partition: 0
  x-original-offset: 12
```

Original message + exception preserved. Có thể manual review để fix root cause (producer gửi sai type).

### Vì sao quan trọng?

Trong production phân tán, producer và consumer thường ở **các team khác nhau**. Producer team đổi schema (vd: từ Integer → String) mà không thông báo → consumer fail deserialization → mọi message bị block.

DLQ cứu: message tiếp tục flow vào DLQ, consumer không stuck, ops team review và fix.

→ **Always enable DLQ ở production**, đặc biệt khi consume từ topic team khác own.

### Workaround tốt hơn: Schema Registry

Phase 4 đã đề cập **Avro/Protobuf + Schema Registry**:
- Producer publish event với schema reference.
- Consumer fetch schema, validate, decode.
- Schema evolution rules (backward/forward compat) enforce — không cho producer push breaking change.

Phase 13 không đi sâu schema registry — đó là production best practice quan trọng nhưng setup phức tạp. Có 1 phase dedicated trong khoá khác.

## Dynamic Pause/Resume — pattern cho dependent service down

### Vấn đề thực tế

Scenario: PaymentService consume `order-events`, gọi PostgreSQL DB lưu data.

```text
T+0: PostgreSQL down (maintenance window, hardware fail, ...)
T+1: PaymentService consume message-100 → DB call → fail → retry 3 lần → fail tất cả → DLQ
T+2: consume message-101 → cùng cảnh → DLQ
T+3: consume message-102 → DLQ
...
T+30 min: PostgreSQL back online
T+30 min: DLQ chứa 1800 message cần manually reprocess
```

Kết quả:
- DLQ ngập với message không thật sự lỗi — chỉ là dependent service tạm down.
- Mỗi message tốn 3 lần retry attempt × 5 giây = 15 giây wasted.
- Ops phải manually replay DLQ sau khi DB back.

**Vấn đề căn bản**: retry chỉ giúp cho **lỗi mức message**. Khi **dependent service down toàn bộ**, retry không có tác dụng. Cần ngừng consume cho đến khi service back.

### Solution: Pause consumer binding

```text
HealthCheckManager (chạy background):
  Mỗi 10 giây check DB connection:
    - DB healthy → ensure consumer running.
    - DB down → pause consumer binding.

Khi pause:
  - Consumer KHÔNG poll Kafka.
  - Messages tích luỹ ở broker (nhưng broker là durable, không sao).
  - Khi DB back: resume → consumer drain backlog → catch up.
```

### Spring API

Spring cung cấp bean `BindingsLifecycleController`:

```java
@Autowired
BindingsLifecycleController controller;

// Pause binding
controller.changeState("consumer-in-0", State.PAUSED);

// Resume binding
controller.changeState("consumer-in-0", State.RESUMED);

// Query current state
List<Binding<?>> bindings = controller.queryState("consumer-in-0");
```

### Code đầy đủ

```java
@Component
public class HealthCheckManager {

    private static final Logger log = LoggerFactory.getLogger(HealthCheckManager.class);
    private static final String BINDING = "consumer-in-0";

    private final BindingsLifecycleController controller;
    private final DataSource dataSource;

    public HealthCheckManager(BindingsLifecycleController controller, 
                              DataSource dataSource) {
        this.controller = controller;
        this.dataSource = dataSource;
    }

    @Scheduled(fixedRate = 10000)         // mỗi 10 giây
    public void checkDependencies() {
        if (isDbHealthy()) {
            resumeIfPaused();
        } else {
            pauseIfRunning();
        }
    }

    private void pauseIfRunning() {
        if (!isCurrentlyPaused()) {
            log.warn("DB unhealthy → pausing consumer");
            controller.changeState(BINDING, State.PAUSED);
        }
    }

    private void resumeIfPaused() {
        if (isCurrentlyPaused()) {
            log.info("DB healthy → resuming consumer");
            controller.changeState(BINDING, State.RESUMED);
        }
    }

    private boolean isCurrentlyPaused() {
        List<Binding<?>> bindings = controller.queryState(BINDING);
        return bindings.stream().allMatch(b -> b.getState() == State.PAUSED);
    }

    private boolean isDbHealthy() {
        try (Connection conn = dataSource.getConnection()) {
            return conn.isValid(2);
        } catch (SQLException e) {
            return false;
        }
    }
}
```

Don't forget `@EnableScheduling` trên `@Configuration` hoặc runner class:

```java
@EnableScheduling
@SpringBootApplication
public class Section17Runner { ... }
```

### Vì sao `queryState` trả về `List<Binding<?>>` thay vì `Binding<?>`?

Bạn có thể nghĩ: `consumer-in-0` là 1 binding → query trả về 1 binding.

Thực tế: `consumer-in-0` là **logical binding**. Runtime có thể có **nhiều instance** nếu dùng `concurrency: N` (Phase 11).

```yaml
spring:
  cloud:
    stream:
      bindings:
        consumer-in-0:
          consumer:
            concurrency: 3       # ← 3 instance
```

Khi đó `queryState("consumer-in-0")` trả về **3 binding** (mỗi consumer thread = 1 binding instance). Tất cả phải pause hoặc resume cùng lúc.

Logic check: `allMatch(state == PAUSED)` → đảm bảo tất cả paused. Nếu mixed state → có vấn đề.

### Demo

Producer config: 1 message / giây.

```yaml
# producer YAML
poller:
  fixed-delay: 1000
```

Consumer config + HealthCheckManager toggle every 10 giây giữa pause và resume (simulate cycling DB up/down).

Log:
```text
T+0s:  consumed message-1
T+1s:  consumed message-2
T+2s:  consumed message-3
...
T+9s:  consumed message-10
T+10s: HealthCheck: PAUSING consumer
       (no more "consumed" log — consumer not pulling messages)
       (producer vẫn publish: message-11, 12, 13, ... vào broker)
T+20s: HealthCheck: RESUMING consumer
       consumed message-11    ← drain backlog
       consumed message-12
       ...
T+30s: HealthCheck: PAUSING again
...
```

Quan sát quan trọng: **KHÔNG MISS message nào**. Producer publish 100 message → consumer eventually process đủ 100. Pause chỉ delay, không drop.

### Trade-off của Pause/Resume

| Pro | Con |
|---|---|
| Tránh DLQ flood khi service down | Cần code thêm (HealthCheckManager) |
| Consumer không waste CPU retry vô ích | Lag tăng trong lúc pause (cần monitor) |
| Smooth recovery khi service back | Nếu pause logic sai → consumer treo mãi |
| Original messages preserved trong broker | Kafka retention phải đủ lớn cho pause window |

### Use case ngoài DB health check

Pattern này còn dùng cho:
- **Rate limit từ 3rd party API**: pause khi hit limit, resume sau cooldown.
- **Maintenance window dự kiến**: pause trước khi deploy DB migration.
- **Manual ops**: pause để debug production issue mà không bị flood event mới.
- **Circuit breaker**: combine với Resilience4j circuit breaker → open circuit → pause binding.

### Anti-patterns

| Anti-pattern | Vấn đề | Sửa |
|---|---|---|
| Pause forever do bug trong health check | Consumer treo, lag tăng vô hạn | Add timeout, alert nếu paused > X phút |
| Health check chính nó chậm/fail | Block scheduler, không pause đúng lúc | Health check phải fast + simple |
| Toggle quá thường (mỗi giây) | Overhead, oscillation | Schedule 10s+, debounce |
| Quên `@EnableScheduling` | `@Scheduled` không chạy | Add annotation |
| Pause mà không log | Khó debug khi consumer ngừng | Log mọi state change |
| Không monitor lag khi pause | Backlog tích luỹ silent | Alert lag > threshold |

## Tóm tắt bài 3

- **Deserialization failure**: xảy ra trước khi bean handler được gọi (decode bytes fail). Vẫn được DLQ catch nếu `enable-dlq: true`.
- Schema Registry (Avro/Protobuf) là solution production để tránh deserialization issue.
- **Pause/Resume binding**: pattern advanced khi dependent service tạm down.
- Spring API: `BindingsLifecycleController.changeState(binding, state)` + `queryState(binding)`.
- `queryState` trả về **List** vì 1 logical binding có thể có nhiều runtime instance (qua `concurrency`).
- Trigger pause/resume từ `HealthCheckManager` scheduled task — check dependent service health.
- Message preserved trong broker khi pause — không bị mất.
- Use case rộng: DB health, rate limit, maintenance, manual ops, circuit breaker integration.
- Phải có monitoring + alerting cho paused state để tránh treo silent.

**Bài kế tiếp** → [Bài 4: Tóm tắt Phase 13](04-summary.md)

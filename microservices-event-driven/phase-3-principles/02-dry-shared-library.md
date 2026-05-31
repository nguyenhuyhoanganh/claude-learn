# Bài 2: DRY trap — vì sao shared library là kẻ thù trong microservices

DRY (Don't Repeat Yourself) là nguyên tắc software engineering bạn được dạy từ trường. **Trong microservices, áp dụng DRY mù quáng = phá vỡ loose coupling**. Bài này dạy khi nào DRY tốt, khi nào nó là kẻ thù.

## DRY trong monolith — tốt rõ

```java
// Monolith
public class CommonUtils {
    public static String formatDate(LocalDate d) { ... }
    public static boolean validateEmail(String s) { ... }
    public static String hashPassword(String s) { ... }
}

// 50 nơi trong codebase dùng CommonUtils.formatDate
```

Lợi:
- Fix 1 lần, applied everywhere.
- Consistent behavior.
- Save dev time.

Trong monolith, DRY là **dogma đúng**.

## DRY trong microservices — 3 vấn đề

### Vấn đề 1: Tight coupling qua shared library

Scenario: 10 service dùng `acme-common-lib` v1.0.

```text
acme-common-lib v1.0
        ▲
        │ import
+──────────────────────────────────────────+
│ Service A   Service B   ... Service J    │
+──────────────────────────────────────────+
```

Lib v1.1 release với bug fix critical. Implications:

| Action | Impact |
|---|---|
| Lib v1.1 release | 10 service phải rebuild + retest |
| Lib API change | 10 team phải đổi code |
| Lib bug ảnh hưởng | Mọi service share fate |
| Lib vulnerability (Log4Shell) | 10 service phải patch khẩn |

→ Lib trở thành **coupling point** giữa 10 service.

Vi phạm nguyên tắc cốt lõi: **microservices phải loosely coupled**.

### Vấn đề 2: Dependency hell

Service S dùng lib A và lib B. Lib A internally dùng lib B v2.

```text
Service S ──► Lib A v1.0 ──► Lib B v2.0
         └──► Lib B v2.0  (direct)
```

Lib A release v1.1 cần Lib B v3.0:

```text
Service S ──► Lib A v1.1 ──► Lib B v3.0
         └──► Lib B v2.0  (direct)
```

Conflict: 1 process, 2 version of Lib B.

Hệ quả:
- **Java/Maven**: lock conflict, build fail.
- **Node.js**: 2 version load OK nhưng tốn memory + behavior khó dự đoán.
- **Python**: virtualenv chỉ 1 version.

Solutions ép:
- Force update direct usage of B v3 → unrelated code change.
- Hoặc keep using A v1.0 → miss critical patch.
- Hoặc skip A v1.1 → tech debt.

Không có lựa chọn đẹp.

### Vấn đề 3: Defeat the purpose of isolation

Microservices isolate process boundary → bug in A không kill B.

Shared lib bug? **Tất cả service dùng lib đều affected**. Isolation broken.

Vd: Log4Shell (2021). Mọi service dùng log4j → patched cùng tuần → crisis cho toàn ngành.

## DRY vs Loose coupling — chọn cái nào?

Câu trả lời: **Loose coupling thắng**.

Lý do: việc duplicate 50 lần `formatDate` tệ ít hơn việc 10 service share lib bị bug.

Quote vàng: **"Duplication is far cheaper than the wrong abstraction"** — Sandi Metz.

## 5 alternative cho shared lib

### 1. Re-evaluate boundary

Logic phức tạp share giữa 2 service → có thể **boundary vẽ sai**.

```text
Service A và Service B đều có "calculate discount" logic 200 dòng.

Possible fix: discount là business capability riêng → DiscountService.
                ▲
                │ API call
        ┌───────┴───────┐
        │               │
    Service A       Service B
```

Move logic vào dedicated service → A và B gọi qua API. Decoupled.

### 2. Code generation

Cho data model dùng chung trong giao tiếp (vd Protobuf, OpenAPI):

```protobuf
// shared/user.proto (in shared schema repo)
message User {
    string id = 1;
    string email = 2;
    string name = 3;
}
```

Mỗi service generate code Java/Go/Python từ file proto → mỗi service có **own copy** của data class.

```bash
# Service A build
protoc --java_out=. user.proto
# Service B build (Go)
protoc --go_out=. user.proto
```

Lợi:
- Schema thay đổi → các service rebuild → break early (compile time).
- Mỗi service own copy code → no runtime sharing.
- Type-safe communication.

Đây là **good DRY**: share **schema/contract**, không share **runtime code**.

### 3. Sidecar pattern

Logic dùng chung deploy như **sidecar process** chạy cạnh app:

```text
Pod / Host:
+────────────────+
│ App container  │ ◄── localhost call ──► Sidecar container
│                │                          (shared logic)
+────────────────+
```

Vd: Service mesh (Istio, Linkerd) deploy Envoy sidecar handle:
- mTLS.
- Retry + circuit breaker.
- Metrics.
- Distributed tracing.

App không cần shared lib cho việc này — sidecar handle.

Trade-off:
- ✓ Logic update không cần rebuild app.
- ✓ Language-agnostic (Java app + Go sidecar).
- ✗ Latency ~1ms localhost call (cao hơn in-process).
- ✗ Operational complexity (extra container).

### 4. Duplicate code (yes, duplicate)

Cho utility code thay đổi nhanh hoặc service-specific:

```java
// Service A
class UserValidator { ... }       // Own copy, optimized for A

// Service B
class UserValidator { ... }       // Own copy, different optimization
```

Lợi:
- Mỗi service evolve độc lập.
- Migrate tech stack dễ (no shared lib block).
- No dependency hell.

"Wait, this violates DRY!" — đúng. Trade DRY để giữ loose coupling. Đó là **tradeoff đúng** trong microservices context.

### 5. Shared lib ONLY cho code cực kỳ stable + generic

Có 1 trường hợp shared lib OK: code **rất generic, rất stable**, gần như không bao giờ đổi.

Examples:
- Logging wrapper (cùng format JSON, cùng correlation ID).
- Retry helper.
- HTTP client config.
- Pattern matcher utility.

Quy tắc:
- Lib phải **self-contained** (không depend lib khác hoặc rất ít).
- Lib API **không bao giờ break** (semver strict).
- Lib **không có business logic** — chỉ utility.

Nếu bạn không tự tin code stable 5 năm không break → duplicate đi.

## Bên trong service — DRY vẫn áp dụng

Quan trọng: **trong 1 service, DRY vẫn đúng**.

```java
// Service Order codebase
class OrderService {
    public void placeOrder() {
        validateOrder(...);  // Helper
    }

    public void cancelOrder() {
        validateOrder(...);  // Reuse
    }

    private void validateOrder(...) { ... }
}
```

Đừng copy-paste `validateOrder` 5 nơi trong cùng service. Extract method.

DRY scope = trong boundary của service. Cross boundary = bỏ DRY, giữ loose coupling.

## Data duplication revisit

DRY applies **code**, không phải **data**. Data duplication (bài 1) là chuyện khác.

```text
ProductService own product data
ReviewService own review data

OrderService cần snippet of product info → 2 choices:
  A. API call → ProductService mỗi lần
  B. Cache copy locally trong OrderDB

Cả hai đều OK tuỳ trade-off latency/consistency.
```

Code:
```java
// Service Order — own logic
class OrderValidator {
    boolean isValid(Order o) { ... }
}

// Service Payment — own logic (có thể duplicate)
class PaymentValidator {
    boolean isValid(Payment p) { ... }
}
```

Validators trông giống → maybe duplicate. OK.

Data:
```text
ProductDB:
  products (source of truth)

OrderDB:
  orders
  cached_products (read-only snapshot) ← Data duplication
```

Snapshot of product data — OK với eventual consistency.

## Anti-pattern: "Common-utils library"

```text
acme-common-utils:
  - StringHelpers
  - DateUtils
  - JsonParser
  - HttpClient
  - DatabaseUtils
  - SecurityHelpers
  - ConfigLoader
```

10 random utility gói chung. Mỗi service dùng 2-3 cái.

Hệ quả:
- Tất cả service depend lib này.
- Thêm 1 helper mới → release lib → 10 service rebuild.
- Bug ở 1 helper → ảnh hưởng all.

Fix: tách thành lib **nhỏ + focused**:

```text
acme-logging-lib       (chỉ logging — siêu stable)
acme-http-client-lib   (HTTP wrapper)
acme-tracing-lib       (OpenTelemetry helpers)
```

Service nào cần thì import lib đó. Update granular.

## Real-world: Netflix vs shared lib

Netflix có lib internal phổ biến: Hystrix (circuit breaker), Ribbon (client-side LB), Eureka (service discovery).

Sau vài năm, Netflix announce:
- Hystrix → maintenance mode (deprecated 2018).
- Move toward **service mesh** (Istio-like, sidecar).

Lý do: shared lib upgrade pain. Sidecar pattern lets infrastructure team update mTLS/circuit breaker logic mà 1000 service không phải rebuild.

→ **Sidecar > shared lib cho infrastructure concerns**.

## Tóm tắt bài 2

- **DRY trong monolith** = tốt; **DRY trong microservices** với shared lib = phá loose coupling.
- 3 vấn đề shared lib: **tight coupling**, **dependency hell**, **broken isolation**.
- **Code duplication tốt hơn wrong abstraction** (Sandi Metz).
- 5 alternative: **re-evaluate boundary**, **code generation từ schema**, **sidecar pattern**, **duplicate code OK**, **shared lib chỉ cho stable+generic utility**.
- DRY vẫn áp dụng **trong 1 service**, không cross service.
- Data duplication ≠ code duplication — handle khác nhau.
- **Sidecar pattern > shared lib** cho infrastructure (mTLS, retry, observability).

**Bài kế tiếp** → [Bài 3: Structured Autonomy — cân bằng tự do và chuẩn cho team](03-structured-autonomy.md)

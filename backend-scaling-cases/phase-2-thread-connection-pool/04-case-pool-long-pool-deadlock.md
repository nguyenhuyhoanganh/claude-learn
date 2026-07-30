# Case 4: Pool lồng pool — deadlock tự tạo trong chính ứng dụng của bạn

Case 1-3 là "ai đó bên ngoài làm chậm ta". Case này khác hẳn: **không có ai bên ngoài cả**. Downstream khoẻ mạnh, database rảnh rỗi, mạng hoàn hảo. Ứng dụng vẫn treo cứng.

Thủ phạm là chính bạn — một dòng code trông hoàn toàn vô hại.

## Hiện tượng

```text
   Ứng dụng chạy tốt trên máy dev.
   Chạy tốt trên staging với 5 người test.
   Lên production, tải cao: TREO HOÀN TOÀN sau 3 phút.

   - CPU: 2%
   - Database: rảnh, không có query nào đang chạy
   - Không có exception nào trong log
   - Restart thì chạy lại được... 3 phút, rồi treo tiếp
```

Đặc điểm chẩn đoán vàng: **tải càng cao càng nhanh treo, và không bao giờ tự thoát**.

## Nguyên lý chung: chờ vòng tròn trên tài nguyên hữu hạn

Mọi biến thể của case này đều quy về một hình:

```text
   Pool có N chỗ.
   Mỗi tác vụ cần chiếm 1 chỗ, RỒI mới xin thêm 1 chỗ nữa.

   Khi có đúng N tác vụ cùng chạy:
   ┌──────────────────────────────────────────────┐
   │ Tác vụ 1: giữ chỗ 1  →  đang xin chỗ thứ 2   │
   │ Tác vụ 2: giữ chỗ 2  →  đang xin chỗ thứ 2   │
   │ ...                                           │
   │ Tác vụ N: giữ chỗ N  →  đang xin chỗ thứ 2   │
   └──────────────────────────────────────────────┘
        Pool đã hết sạch. Không ai nhả.
        Không ai xin được. TREO VĨNH VIỄN.
```

Điểm ác hiểm: với tải thấp, số tác vụ đồng thời < N nên luôn còn chỗ trống, code chạy hoàn hảo. Lỗi **chỉ xuất hiện đúng lúc tải cao** — tức là lúc bạn ít muốn nó xuất hiện nhất.

## Biến thể 1: `@Transactional(REQUIRES_NEW)` lồng nhau

```java
@Service
public class OrderService {

    @Transactional
    public void placeOrder(OrderRequest req) {
        Order order = orderRepository.save(new Order(req));   // giữ connection #1

        auditService.log("order created", order.getId());     // xin connection #2

        inventoryRepository.decrease(req.getSku(), req.getQty());
    }
}

@Service
public class AuditService {

    // Ghi log kiểm toán phải tồn tại kể cả khi transaction chính rollback
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(String action, Long entityId) {
        auditRepository.save(new AuditLog(action, entityId));
    }
}
```

`REQUIRES_NEW` nghĩa là: **tạm dừng transaction hiện tại, mở một transaction hoàn toàn mới**. Transaction mới cần **connection mới** — trong khi connection cũ **vẫn đang bị giữ**.

```text
   Pool = 10 connection

   10 request đồng thời, mỗi request:
     1. Mượn connection A cho transaction ngoài  ✓ (dùng hết 10 connection)
     2. Xin connection B cho REQUIRES_NEW        ✗ (pool trống rỗng)
     3. Chờ 30 giây → SQLTransientConnectionException

   Nhưng transaction ngoài vẫn đang giữ connection A và không nhả
   cho tới khi nó kết thúc. Mà nó không kết thúc được vì đang chờ B.
```

May mắn là HikariCP có `connectionTimeout` nên sau 30 giây sẽ ném exception thay vì treo mãi. Nhưng 30 giây đủ để mọi thứ sụp đổ.

**Cách sửa 1 — áp dụng công thức pool chống deadlock** (phase-1 bài 4):

```text
   pool ≥ Tn × (Cm − 1) + 1
   Tn = 200 thread, Cm = 2 connection/tác vụ
   ⇒ pool ≥ 200 × 1 + 1 = 201 connection

   Con số vô lý ⇒ dấu hiệu phải SỬA THIẾT KẾ, không phải tăng pool.
```

**Cách sửa 2 — bỏ `REQUIRES_NEW`, dùng event sau commit** (khuyến nghị):

```java
@Transactional
public void placeOrder(OrderRequest req) {
    Order order = orderRepository.save(new Order(req));
    inventoryRepository.decrease(req.getSku(), req.getQty());

    eventPublisher.publishEvent(new OrderCreatedEvent(order.getId()));
}

@Component
public class AuditListener {

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void onOrderCreated(OrderCreatedEvent event) {
        auditRepository.save(new AuditLog("order created", event.getOrderId()));
    }
}
```

Điểm mấu chốt: `AFTER_COMMIT` chạy **sau khi** transaction chính đã commit và **đã nhả connection**. Nên chỉ cần 1 connection tại một thời điểm. Không còn khả năng deadlock.

**Cách sửa 3 — nếu audit log không cần transaction riêng**, bỏ hẳn `REQUIRES_NEW`. Trong nhiều dự án, `REQUIRES_NEW` được thêm vào theo thói quen chứ không có yêu cầu nghiệp vụ thật.

## Biến thể 2: `@Async` gọi `@Async` trên cùng executor

```java
@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(10);
        ex.setMaxPoolSize(10);
        ex.setQueueCapacity(100);
        return ex;
    }
}

@Service
public class ReportService {

    @Async
    public CompletableFuture<Report> buildReport(Long userId) {
        // Mỗi báo cáo cần 3 phần, làm song song cho nhanh
        CompletableFuture<Part> a = buildPart(userId, "A");   // @Async, CÙNG pool
        CompletableFuture<Part> b = buildPart(userId, "B");
        CompletableFuture<Part> c = buildPart(userId, "C");

        return CompletableFuture.allOf(a, b, c)               // ← CHỜ Ở ĐÂY
            .thenApply(v -> new Report(a.join(), b.join(), c.join()));
    }

    @Async
    public CompletableFuture<Part> buildPart(Long userId, String type) { ... }
}
```

```text
   Pool = 10 thread

   10 request cùng gọi buildReport:
   ├─ 10 thread đều đang chạy buildReport
   ├─ Cả 10 đều đã submit 30 tác vụ buildPart vào HÀNG ĐỢI
   └─ Cả 10 đều đang CHỜ kết quả của buildPart

   Nhưng buildPart cần thread để chạy — mà cả 10 thread đều đang chờ.
   Không thread nào rảnh để lấy việc từ hàng đợi.

   ⇒ DEADLOCK VĨNH VIỄN. Không có timeout nào cứu được.
```

Đây là **thread pool starvation deadlock** — nguy hiểm hơn biến thể 1 vì **không có timeout tự động**, hệ thống treo mãi mãi.

**Quy tắc vàng**: *không bao giờ chờ (block) trên kết quả của một tác vụ được submit vào cùng pool mà bạn đang chạy.*

**Cách sửa — tách pool**:

```java
@Bean("orchestratorExecutor")
public Executor orchestratorExecutor() {
    ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
    ex.setCorePoolSize(10);
    ex.setThreadNamePrefix("orch-");
    return ex;
}

@Bean("workerExecutor")
public Executor workerExecutor() {
    ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
    ex.setCorePoolSize(40);        // pool riêng cho tác vụ con
    ex.setThreadNamePrefix("work-");
    return ex;
}
```

```java
@Async("orchestratorExecutor")
public CompletableFuture<Report> buildReport(Long userId) { ... }

@Async("workerExecutor")            // pool KHÁC
public CompletableFuture<Part> buildPart(Long userId, String type) { ... }
```

Pool cha chờ pool con thì an toàn, vì hai pool độc lập. Quy tắc chung: **chỉ được chờ theo một chiều, từ pool ở tầng trên xuống pool ở tầng dưới, không bao giờ vòng lại.**

## Biến thể 3: `parallelStream()` và `ForkJoinPool.commonPool`

Đây là biến thể tinh vi nhất, vì `parallelStream()` trông vô hại như một thao tác đọc danh sách.

```java
public List<Product> enrich(List<Long> ids) {
    return ids.parallelStream()                          // chạy trên commonPool
        .map(id -> productClient.fetch(id))              // gọi HTTP CHẶN
        .collect(Collectors.toList());
}
```

Hai vấn đề nghiêm trọng:

**1. `commonPool` là tài nguyên toàn cục dùng chung cho cả JVM.** Kích thước mặc định là `số CPU − 1`. Trên container 2 core, `commonPool` chỉ có **1 thread**.

```text
   Container 2 core → ForkJoinPool.commonPool có 1 thread

   parallelStream() với 50 phần tử, mỗi phần tử gọi HTTP 200 ms
   ⇒ 50 × 200 ms = 10 giây, chạy TUẦN TỰ trên 1 thread
   ⇒ "Song song" mà chậm hơn vòng for thường!
```

**2. Mọi `parallelStream()` trong toàn ứng dụng dùng chung pool đó.** Một chỗ gọi HTTP chặn trong `parallelStream()` sẽ làm nghẽn **tất cả** `parallelStream()` khác — kể cả những chỗ chỉ tính toán thuần và hoàn toàn vô can.

```java
// ĐÚNG — dùng executor riêng, tự kiểm soát
private final ExecutorService ioPool = Executors.newFixedThreadPool(50);

public List<Product> enrich(List<Long> ids) {
    List<CompletableFuture<Product>> futures = ids.stream()
        .map(id -> CompletableFuture.supplyAsync(() -> productClient.fetch(id), ioPool))
        .toList();

    return futures.stream().map(CompletableFuture::join).toList();
}
```

**Quy tắc**: `parallelStream()` chỉ dùng cho **tính toán thuần CPU trên tập dữ liệu lớn** (từ vài nghìn phần tử trở lên). Tuyệt đối không dùng khi bên trong có I/O.

Tương tự với `CompletableFuture.supplyAsync(...)` **không truyền executor** — nó cũng dùng `commonPool`. Luôn truyền executor tường minh.

## Biến thể 4: Đệ quy trên cùng pool

```java
@Async("taskExecutor")
public CompletableFuture<Void> processTree(Node node) {
    List<CompletableFuture<Void>> children = node.getChildren().stream()
        .map(this::processTree)              // đệ quy, cùng pool!
        .toList();
    return CompletableFuture.allOf(children.toArray(new CompletableFuture[0]));
}
```

Cây sâu 5 tầng, mỗi node 3 con → tầng thứ 3 đã cần 27 thread đồng thời. Pool 10 thread thì kẹt ngay từ tầng 2.

Sửa: dùng `ForkJoinPool` với `RecursiveTask` — nó có cơ chế **work-stealing** (thread đang chờ sẽ đi làm việc khác trong hàng đợi thay vì ngồi không), thiết kế riêng cho đệ quy phân nhánh:

```java
public class TreeTask extends RecursiveTask<Integer> {
    private final Node node;

    @Override
    protected Integer compute() {
        List<TreeTask> subs = node.getChildren().stream().map(TreeTask::new).toList();
        invokeAll(subs);                     // ForkJoinPool tự work-stealing
        return subs.stream().mapToInt(ForkJoinTask::join).sum() + 1;
    }
}

ForkJoinPool pool = new ForkJoinPool(8);
int total = pool.invoke(new TreeTask(root));
```

## Biến thể 5: Pool của HTTP client nhỏ hơn số thread

Không phải deadlock, nhưng cùng họ và rất hay gặp:

```text
   Tomcat: 200 thread
   Apache HttpClient: maxPerRoute = 5 (mặc định!)

   ⇒ 200 thread giành nhau 5 chỗ.
   ⇒ 195 thread xếp hàng ở connectionRequestTimeout.
   ⇒ Nhìn từ ngoài: "service ngoài chậm" — mà thực ra nó rảnh rỗi.
```

Không có exception nếu `connectionRequestTimeout` không được đặt (mặc định là 3 phút hoặc vô hạn tuỳ phiên bản). Xem case 3.

## Chẩn đoán

**Chữ ký nhận diện** — phân biệt với các case khác:

| Đặc điểm | Case 4 (pool lồng pool) | Case 1 (downstream chậm) |
|---|---|---|
| CPU | ~0% | thấp nhưng > 0 |
| Downstream | **khoẻ mạnh** | chậm/lỗi |
| DB | **rảnh** | có thể bận |
| Tự hồi phục | **không bao giờ** (biến thể 2, 4) | có, khi downstream khoẻ lại |
| Liên hệ với tải | **treo khi tải cao, ổn khi tải thấp** | tuỳ downstream |
| Thread dump | thread chờ nhau **vòng tròn** | thread chờ socket |

**Thread dump — dấu hiệu cụ thể**:

```text
"taskExecutor-3" #45 waiting on condition
   java.lang.Thread.State: WAITING (parking)
        at jdk.internal.misc.Unsafe.park(Native Method)
        at java.util.concurrent.CompletableFuture$Signaller.block(...)
        at java.util.concurrent.CompletableFuture.waitingGet(...)
        at java.util.concurrent.CompletableFuture.join(...)          ← ĐANG CHỜ
        at com.shop.ReportService.buildReport(ReportService.java:34)
```

Điểm nhận biết: **thread mang tên của chính executor đó** (`taskExecutor-3`) lại đang `join()` chờ một tác vụ khác. Nếu thấy tất cả thread của một pool đều đang `join`/`get` — đó là deadlock pool.

Đếm nhanh:

```bash
# Bao nhiêu thread của pool "taskExecutor" đang chờ?
jstack <pid> | grep -A3 '"taskExecutor-' | grep -c "CompletableFuture.*join\|waitingGet"
# Nếu con số này = corePoolSize → deadlock
```

**Kiểm tra bằng metric**:

```promql
executor_pool_size_threads{name="taskExecutor"}
executor_active_threads{name="taskExecutor"}     # = pool_size và không đổi
executor_queued_tasks{name="taskExecutor"}       # tăng mãi, không giảm
```

Hàng đợi tăng mãi trong khi số thread active đứng yên bằng max → **chắc chắn deadlock**.

## Bảng tổng hợp và cách sửa

| Biến thể | Nguyên nhân | Cách sửa |
|---|---|---|
| `REQUIRES_NEW` lồng nhau | 1 tác vụ giữ 2 connection | `@TransactionalEventListener(AFTER_COMMIT)` |
| `@Async` gọi `@Async` cùng pool | Chờ tác vụ trên chính pool mình chạy | Tách 2 pool riêng |
| `parallelStream()` + I/O | `commonPool` toàn cục, rất nhỏ | Executor riêng + `CompletableFuture` |
| `supplyAsync` không truyền executor | Cũng dùng `commonPool` | Luôn truyền executor tường minh |
| Đệ quy trên pool thường | Nhu cầu thread tăng theo cấp số nhân | `ForkJoinPool` + `RecursiveTask` |
| Pool HTTP client nhỏ hơn thread | Nút thắt ẩn | Tăng `maxPerRoute` + đặt `connectionRequestTimeout` |

## Năm quy tắc phòng ngừa

1. **Không bao giờ chờ kết quả của tác vụ được submit vào pool mà bạn đang chạy trên đó.**
2. **Mỗi tầng một pool riêng.** Chờ chỉ được đi một chiều: tầng trên chờ tầng dưới.
3. **Luôn truyền executor tường minh** cho `supplyAsync`, `runAsync`, `thenApplyAsync`. Đừng để mặc định.
4. **Không dùng `parallelStream()` khi bên trong có I/O.**
5. **Mọi phép chờ đều phải có timeout**: `future.get(2, SECONDS)` chứ không phải `future.get()`.

Quy tắc 5 đáng nhấn mạnh: `join()` và `get()` không tham số sẽ chờ vô hạn. Đổi sang bản có timeout thì deadlock ít nhất cũng **biến thành exception** — bạn có log để lần ra, và hệ thống có cơ hội hồi phục.

```java
// Thay vì
Report r = future.join();

// Dùng
Report r = future.get(3, TimeUnit.SECONDS);   // ném TimeoutException
```

## Cấu hình executor an toàn cho Spring Boot

```java
@Configuration
@EnableAsync
public class ExecutorConfig {

    @Bean("ioExecutor")
    public ThreadPoolTaskExecutor ioExecutor(MeterRegistry registry) {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        ex.setCorePoolSize(50);
        ex.setMaxPoolSize(50);
        ex.setQueueCapacity(500);                 // CÓ GIỚI HẠN, không để mặc định vô hạn
        ex.setThreadNamePrefix("io-");
        ex.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        ex.setTaskDecorator(new MdcTaskDecorator());   // giữ trace ID qua thread
        ex.initialize();
        // Bọc để có metric executor_* trong Prometheus
        return ex;
    }

    @Bean("cpuExecutor")
    public ThreadPoolTaskExecutor cpuExecutor() {
        ThreadPoolTaskExecutor ex = new ThreadPoolTaskExecutor();
        int cores = Runtime.getRuntime().availableProcessors();
        ex.setCorePoolSize(cores);
        ex.setMaxPoolSize(cores);
        ex.setQueueCapacity(100);
        ex.setThreadNamePrefix("cpu-");
        ex.initialize();
        return ex;
    }
}
```

Hai chi tiết quan trọng:

- **`setQueueCapacity` bắt buộc phải đặt.** Mặc định của `ThreadPoolTaskExecutor` là `Integer.MAX_VALUE` — hàng đợi vô hạn, dẫn tới `OutOfMemoryError` (case 7).
- **`CallerRunsPolicy`** khi hàng đầy: thread gọi tự chạy tác vụ. Tạo ra **backpressure tự nhiên** — bên gửi bị chậm lại, không dồn thêm việc. Đây là lựa chọn tốt hơn `AbortPolicy` trong hầu hết trường hợp.

## Tóm tắt case 4

- Deadlock pool xảy ra khi **một tác vụ giữ tài nguyên rồi lại xin thêm tài nguyên từ chính pool đó**.
- **Chỉ lộ ra khi tải cao** — chạy hoàn hảo trên máy dev, treo ở production.
- Chữ ký: **CPU ~0%, downstream khoẻ, DB rảnh, không bao giờ tự hồi phục**.
- 5 biến thể: `REQUIRES_NEW` lồng nhau, `@Async` gọi `@Async`, `parallelStream()` + I/O, đệ quy, pool HTTP nhỏ.
- `ForkJoinPool.commonPool` chỉ có **`số core − 1`** thread và dùng chung toàn JVM.
- Quy tắc sống còn: **không chờ trên pool mình đang chạy**, mỗi tầng một pool, luôn truyền executor tường minh.
- Mọi `join()`/`get()` phải có **timeout** — biến deadlock thành exception có thể chẩn đoán.

**Bài kế tiếp** → [Case 5: Bulkhead — vách ngăn kín nước cho ứng dụng](05-case-bulkhead-co-lap-tai-nguyen.md)

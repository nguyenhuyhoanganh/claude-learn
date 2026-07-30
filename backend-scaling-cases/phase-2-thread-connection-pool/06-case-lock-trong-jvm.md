# Case 6: `synchronized` và lock trong JVM — khi thread chặn nhau ngay trong bộ nhớ

Các case trước đều là "chờ ai đó bên ngoài": chờ mạng, chờ database. Case này thì thread chặn nhau **ngay trong RAM**, không có I/O nào cả. Máy vẫn rảnh, mạng vẫn tốt, nhưng 199 thread đứng xếp hàng chờ 1 thread.

Điều đáng nói: những đoạn code gây ra chuyện này thường chỉ dài 3 dòng và trông rất hợp lý.

## Hiện tượng

```text
   Tải tăng từ 100 lên 300 RPS.
   Kỳ vọng: latency tăng nhẹ.
   Thực tế: latency từ 50 ms lên 4 giây, throughput chỉ lên tới 180 RPS
            rồi ĐỨNG YÊN dù tăng tải thêm.

   CPU: 25% (8 core, chỉ 2 core bận)
   Không có I/O nào chậm.
   Thêm pod: KHÔNG cải thiện (mỗi pod vẫn nghẽn y hệt).
```

Chữ ký đặc trưng: **throughput chạm trần và không tăng nữa dù thêm tài nguyên**. Đây chính là hệ số `α` (contention) trong Universal Scalability Law ở phase-1 bài 5.

## Cơ chế: thread bị chặn ở `synchronized`

**Lock (khoá)** — cơ chế đảm bảo chỉ một thread được vào một đoạn code tại một thời điểm. Trong Java, `synchronized` là cách phổ biến nhất.

**Monitor** — đối tượng khoá mà JVM dùng để cài đặt `synchronized`. Mỗi object trong Java đều có một monitor.

**Contention (tranh chấp)** — tình trạng nhiều thread cùng muốn vào một lock. Contention càng cao, càng nhiều thread phải chờ.

```text
   Đoạn code có synchronized, mất 5 ms để chạy:

   Thread 1  ████ (đang giữ lock, chạy 5ms)
   Thread 2  ░░░░████                    ← chờ 5ms rồi mới chạy
   Thread 3  ░░░░░░░░████                ← chờ 10ms
   Thread 4  ░░░░░░░░░░░░████            ← chờ 15ms
   ...
   Thread 200 ░░░░░░░░░░░░...░░░░████    ← chờ 995ms!

   ⇒ Throughput tối đa = 1 / 0,005 = 200 thao tác/giây
      DÙ CÓ 64 CORE. Đoạn synchronized là điểm tuần tự hoá.
```

Đây là **định luật Amdahl** thể hiện dưới dạng cụ thể nhất: phần code tuần tự đặt trần cho toàn hệ thống, bất kể bạn có bao nhiêu CPU.

## Bảy đoạn code trông vô hại nhưng giết hệ thống

### 1. `SimpleDateFormat` dùng chung — kinh điển nhất

```java
@Service
public class OrderService {
    // SAI: SimpleDateFormat KHÔNG thread-safe
    private static final SimpleDateFormat SDF = new SimpleDateFormat("yyyy-MM-dd");

    public String format(Date d) {
        synchronized (SDF) {        // "sửa" bằng cách đồng bộ hoá
            return SDF.format(d);
        }
    }
}
```

Bản không `synchronized` cho **kết quả sai** (ngày tháng lộn xộn, thỉnh thoảng `NumberFormatException`) vì `SimpleDateFormat` giữ trạng thái nội bộ. Bản có `synchronized` thì đúng nhưng **tuần tự hoá mọi request**.

```java
// ĐÚNG — DateTimeFormatter (Java 8+) bất biến và thread-safe
private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

public String format(LocalDate d) {
    return d.format(FMT);           // không lock, chạy song song hoàn toàn
}
```

Cùng họ với `SimpleDateFormat`: `Calendar`, `NumberFormat`, `DecimalFormat` — tất cả đều không thread-safe. Java 8 trở đi luôn có bản thay thế bất biến.

### 2. `Collections.synchronizedMap` hoặc `Hashtable`

```java
// SAI — mọi thao tác đều lock toàn bộ map
private final Map<String, Product> cache =
        Collections.synchronizedMap(new HashMap<>());
```

Mỗi lần `get()` cũng lock toàn bộ map. Với 200 thread đọc cache liên tục, đây là điểm nghẽn khủng khiếp.

```java
// ĐÚNG
private final Map<String, Product> cache = new ConcurrentHashMap<>();
```

`ConcurrentHashMap` không lock khi đọc, và khi ghi chỉ lock **một bucket** (từ Java 8, dùng CAS + `synchronized` trên từng node). Với 200 thread đọc, nó nhanh hơn hàng chục lần.

> Nhưng cẩn thận: `ConcurrentHashMap` **không** làm cho chuỗi thao tác trở nên nguyên tử. `if (!map.containsKey(k)) map.put(k, v)` vẫn có race condition. Dùng `computeIfAbsent`, `putIfAbsent`, `merge` thay thế.

### 3. Lazy initialization sai cách

```java
// SAI — lock mọi lần gọi, kể cả sau khi đã khởi tạo xong
public synchronized Config getConfig() {
    if (config == null) {
        config = loadFromDatabase();     // chỉ chạy 1 lần
    }
    return config;                       // nhưng lock thì chạy 1 triệu lần
}
```

```java
// ĐÚNG — holder idiom, JVM đảm bảo thread-safe, KHÔNG có lock nào
private static class Holder {
    static final Config INSTANCE = loadFromDatabase();
}
public Config getConfig() {
    return Holder.INSTANCE;
}
```

Cách này lợi dụng cơ chế nạp class của JVM: class `Holder` chỉ được nạp lần đầu khi truy cập, và JVM tự đảm bảo an toàn. Sau đó không còn lock nào.

### 4. Bộ đếm dùng chung

```java
// SAI
private long requestCount = 0;
public synchronized void increment() { requestCount++; }
```

```java
// TỐT HƠN — CAS, không lock
private final AtomicLong counter = new AtomicLong();
public void increment() { counter.incrementAndGet(); }

// TỐT NHẤT khi ghi RẤT nhiều, đọc ít
private final LongAdder counter = new LongAdder();
public void increment() { counter.increment(); }
public long get() { return counter.sum(); }
```

`AtomicLong` dùng **CAS (Compare-And-Swap)** — một lệnh CPU nguyên tử, không cần lock. Nhưng khi 200 thread cùng ghi, chúng vẫn giành nhau **cùng một ô nhớ**, CAS liên tục thất bại và phải thử lại. Hiện tượng gọi là **CAS contention**.

`LongAdder` giải quyết bằng cách chia thành **nhiều ô riêng biệt** (một ô cho mỗi nhóm thread), chỉ cộng lại khi cần đọc:

```text
   AtomicLong:  200 thread → [1 ô nhớ]        ← giành nhau dữ dội
   LongAdder:   200 thread → [ô1][ô2][ô3][ô4] ← ít giành nhau
                              đọc = ô1+ô2+ô3+ô4
```

Benchmark điển hình với 64 thread ghi liên tục: `LongAdder` nhanh hơn `AtomicLong` khoảng **10 lần**. Đổi lại, đọc chậm hơn chút và không có thao tác `compareAndSet`.

### 5. `synchronized` bọc quá rộng

```java
// SAI — lock cả phần gọi database (chậm)
public synchronized Order process(OrderRequest req) {
    Order order = repository.findById(req.getId());     // 20 ms — lock bị giữ
    validate(order);                                     // 1 ms
    order.setStatus(PROCESSED);
    repository.save(order);                              // 15 ms — lock bị giữ
    return order;
}
// Lock giữ 36 ms → throughput tối đa 27 request/giây!
```

```java
// ĐÚNG — chỉ lock đúng phần cần bảo vệ
public Order process(OrderRequest req) {
    Order order = repository.findById(req.getId());
    validate(order);

    synchronized (lockFor(req.getId())) {     // lock theo TỪNG ĐƠN, không toàn cục
        order.setStatus(PROCESSED);
    }

    repository.save(order);
    return order;
}
```

Hai cải tiến: **thu hẹp phạm vi lock**, và **chia nhỏ lock theo khoá** (lock striping).

Nhưng thật ra ở ví dụ này, cách đúng nhất là **bỏ lock hoàn toàn** và dùng optimistic locking của database (`@Version`) — phase-3 bài 5. Lock trong JVM chỉ bảo vệ được trong **một** tiến trình; khi bạn chạy 5 pod thì nó vô dụng.

> Đây là điểm cực kỳ quan trọng: **`synchronized` không có tác dụng gì khi ứng dụng chạy nhiều instance.** Rất nhiều bug "chỉ xảy ra trên production" là vì code được viết với giả định một instance duy nhất.

### 6. Logging đồng bộ

```xml
<!-- SAI — mọi thread ghi log đều phải xếp hàng -->
<appender name="FILE" class="ch.qos.logback.core.FileAppender">
    <file>app.log</file>
</appender>
```

Logback `FileAppender` mặc định `synchronized` khi ghi. Với log ở mức DEBUG và 200 thread, đây là điểm nghẽn thật sự.

```xml
<!-- ĐÚNG — ghi qua hàng đợi, thread ứng dụng không chờ -->
<appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
    <queueSize>8192</queueSize>
    <discardingThreshold>0</discardingThreshold>  <!-- 0 = không bỏ log WARN/ERROR -->
    <neverBlock>true</neverBlock>                 <!-- hàng đầy thì BỎ, không chặn -->
    <appender-ref ref="FILE"/>
</appender>
```

`neverBlock=true` là lựa chọn quan trọng: khi hàng đợi log đầy, thà mất vài dòng log còn hơn chặn cả ứng dụng. Xem thêm phase-6.

### 7. `Math.random()` và `Random` dùng chung

```java
// Kém — Random dùng chung một seed nguyên tử, CAS contention cao
int x = new Random().nextInt(100);   // hoặc Math.random()

// Tốt — mỗi thread một trạng thái riêng, không giành nhau
int x = ThreadLocalRandom.current().nextInt(100);
```

Ít ai ngờ nhưng `Math.random()` gọi trong vòng lặp nóng với nhiều thread có thể chiếm tỉ lệ CPU đáng kể chỉ vì CAS thất bại liên tục.

## False sharing — case tinh vi nhất

Đây là trường hợp **không có lock nào** mà vẫn chậm, và gần như không ai nghĩ tới.

CPU không đọc từng byte từ RAM — nó đọc theo khối **64 byte** gọi là **cache line**. Nếu hai biến độc lập nằm cùng một cache line và hai core cùng ghi vào chúng, mỗi lần ghi làm **vô hiệu hoá** bản cache của core kia.

```text
   Cache line 64 byte:
   ┌──────────────────────────────────────────┐
   │ counterA (8B) │ counterB (8B) │  ...     │
   └──────────────────────────────────────────┘
       ↑ core 1 ghi      ↑ core 2 ghi

   Core 1 ghi counterA → cache line bị đánh dấu bẩn
                       → core 2 phải nạp lại toàn bộ line từ RAM
   Core 2 ghi counterB → ngược lại

   ⇒ Hai biến CHẲNG LIÊN QUAN GÌ NHAU nhưng làm chậm nhau
      tới 5-10 lần. Gọi là "false sharing" (chia sẻ giả).
```

```java
// Java 8+: @Contended buộc JVM chèn đệm để tách cache line
@jdk.internal.vm.annotation.Contended
public class Counters {
    volatile long a;
    volatile long b;
}
// Chạy với: -XX:-RestrictContended
```

Trong thực tế, bạn hiếm khi phải tự xử lý false sharing — nhưng biết nó tồn tại giúp giải thích những kết quả benchmark "vô lý". Và các lớp như `LongAdder` đã xử lý sẵn bên trong bằng chính kỹ thuật này.

## Chẩn đoán lock contention

### Bước 1 — Nhìn trạng thái thread

```bash
jstack <pid> | grep "java.lang.Thread.State" | sort | uniq -c
```

```text
   156 java.lang.Thread.State: BLOCKED (on object monitor)   ← DẤU HIỆU RÕ RÀNG
    30 java.lang.Thread.State: RUNNABLE
    14 java.lang.Thread.State: WAITING
```

`BLOCKED` là trạng thái **chỉ xuất hiện khi chờ `synchronized`**. Nếu số này lớn, bạn đã tìm đúng hướng.

### Bước 2 — Tìm lock nào và ai đang giữ

```bash
jstack <pid> | grep -B5 "waiting to lock" | head -30
```

```text
"http-nio-8080-exec-88" #188 BLOCKED
   java.lang.Thread.State: BLOCKED (on object monitor)
        at com.shop.OrderService.process(OrderService.java:42)
        - waiting to lock <0x00000007161a2b40> (a com.shop.OrderService)
        ↑ đang chờ                ↑ ID của monitor

# Tìm ai đang GIỮ monitor đó
jstack <pid> | grep -A10 "locked <0x00000007161a2b40>"
```

Đếm nhanh xem lock nào bị tranh chấp nhiều nhất:

```bash
jstack <pid> | grep "waiting to lock" | sort | uniq -c | sort -rn | head
#  156  - waiting to lock <0x00000007161a2b40> (a com.shop.OrderService)
#    3  - waiting to lock <0x00000007161b1120> (a java.util.Hashtable)
```

### Bước 3 — Metric

```promql
jvm_threads_states_threads{state="blocked"}
```

Nếu tỉ lệ `blocked / live` vượt 10% kéo dài, có vấn đề contention.

### Bước 4 — Đo chính xác bằng JFR

**JFR (Java Flight Recorder)** có sẵn trong JDK, chi phí rất thấp (~1% CPU), dùng được trên production:

```bash
# Ghi 60 giây
jcmd <pid> JFR.start duration=60s filename=/tmp/rec.jfr settings=profile

# Phân tích: xem các sự kiện chờ monitor
jfr summary /tmp/rec.jfr
jfr print --events jdk.JavaMonitorEnter /tmp/rec.jfr | head -50
```

Kết quả cho biết chính xác: lock nào, ở dòng code nào, thread chờ tổng cộng bao nhiêu mili-giây. Đây là công cụ chính xác nhất, hơn hẳn việc đoán từ thread dump.

Hoặc dùng async-profiler ở chế độ lock:

```bash
./profiler.sh -e lock -d 30 -f /tmp/lock.html <pid>
```

Cho ra flame graph riêng cho lock contention — nhìn phát ra ngay chỗ nghẽn.

## Bảng thay thế nhanh

| Đang dùng | Thay bằng | Lý do |
|---|---|---|
| `SimpleDateFormat` | `DateTimeFormatter` | Bất biến, thread-safe, không lock |
| `Hashtable`, `synchronizedMap` | `ConcurrentHashMap` | Không lock khi đọc |
| `Vector`, `synchronizedList` | `CopyOnWriteArrayList` (đọc nhiều ghi ít) | Đọc hoàn toàn không lock |
| `synchronized` counter | `AtomicLong` → `LongAdder` | CAS thay lock; `LongAdder` khi ghi rất nhiều |
| `synchronized` cache | `Caffeine` / `ConcurrentHashMap` | Thiết kế cho truy cập song song |
| `Math.random()` | `ThreadLocalRandom.current()` | Không có trạng thái dùng chung |
| `synchronized` đọc nhiều | `StampedLock` / `ReadWriteLock` | Nhiều reader chạy song song |
| `synchronized` toàn cục | Lock theo khoá (striping) | Giảm phạm vi tranh chấp |
| `synchronized` giữa nhiều pod | **Lock phân tán** (Redis) hoặc DB lock | `synchronized` chỉ có tác dụng trong 1 JVM |
| `FileAppender` | `AsyncAppender` + `neverBlock` | Ghi log không chặn thread |

## Trường hợp thực tế: cache tự viết giết cả hệ thống

Code trông rất bình thường, tồn tại 3 năm không ai để ý:

```java
@Component
public class ProductCache {
    private final Map<Long, Product> cache = new HashMap<>();

    public synchronized Product get(Long id) {
        Product p = cache.get(id);
        if (p == null) {
            p = repository.findById(id).orElseThrow();   // 30 ms query DB
            cache.put(id, p);
        }
        return p;
    }
}
```

Hai lỗi chồng lên nhau:

1. **`synchronized` bọc cả query database.** Khi cache miss, lock bị giữ 30 ms. Throughput tối đa của toàn bộ ứng dụng: **33 request/giây**.
2. **Cache miss đồng loạt sau khi restart.** 200 thread cùng gọi `get(1L)`, thread đầu query DB, 199 thread còn lại xếp hàng. Đây cũng là **cache stampede** (phase-4 bài 2) — nhưng ở đây lock lại vô tình "chữa" được stampede, đổi lấy việc giết throughput.

```java
// ĐÚNG — Caffeine xử lý cả hai vấn đề
@Component
public class ProductCache {
    private final LoadingCache<Long, Product> cache = Caffeine.newBuilder()
        .maximumSize(10_000)
        .expireAfterWrite(Duration.ofMinutes(10))
        .refreshAfterWrite(Duration.ofMinutes(5))   // làm mới nền, không chặn
        .recordStats()
        .build(id -> repository.findById(id).orElseThrow());

    public Product get(Long id) {
        return cache.get(id);
    }
}
```

Caffeine đảm bảo: với cùng một khoá, **chỉ một thread nạp dữ liệu**, các thread khác chờ đúng khoá đó — **không chặn các khoá khác**. Kết quả đo được sau khi đổi:

```text
   Trước:  throughput trần 33 RPS,  p99 = 6 giây
   Sau:    throughput trần 4.200 RPS, p99 = 45 ms
```

Cải thiện **127 lần** chỉ bằng cách đổi một lớp cache. Không thêm một máy nào.

## Bẫy thường gặp

| Bẫy | Vì sao sai |
|---|---|
| Dùng `synchronized` để "cho an toàn" | Mỗi lock là một điểm tuần tự hoá, đặt trần cho throughput |
| Nghĩ `synchronized` bảo vệ được khi chạy nhiều pod | Chỉ có tác dụng trong **một JVM**. Nhiều instance thì vô dụng |
| `synchronized` bọc cả I/O | Giữ lock trong lúc chờ mạng/DB — tệ nhất trong mọi cách |
| `ConcurrentHashMap` nhưng dùng `containsKey` rồi `put` | Vẫn race condition. Dùng `computeIfAbsent` |
| Lock trên `String` hoặc `Integer` | Chúng được intern/cache → vô tình lock chung với code khác |
| Lock trên object có thể thay đổi tham chiếu | Lock lên object khác nhau, không bảo vệ được gì |
| Không đo, chỉ đoán | Dùng JFR hoặc async-profiler để biết chắc |

Bẫy `synchronized (someString)` đáng nói riêng: Java gộp các chuỗi hằng vào một bể chung (string pool), nên `synchronized("user-" + id)` có thể vô tình khoá chung với một đoạn code hoàn toàn khác dùng cùng chuỗi. Luôn khoá trên một object riêng tư:

```java
private final Object lock = new Object();
// hoặc lock theo khoá, có kiểm soát:
private final Striped<Lock> locks = Striped.lock(64);   // Guava
Lock l = locks.get(userId);
```

## Tóm tắt case 6

- `synchronized` tạo **điểm tuần tự hoá**: throughput tối đa = `1 / thời_gian_giữ_lock`, bất kể bao nhiêu core.
- Chữ ký nhận diện: **throughput chạm trần, CPU thấp, thêm pod không giúp gì, nhiều thread `BLOCKED`**.
- Thủ phạm hay gặp: `SimpleDateFormat`, `synchronizedMap`, lazy init sai, counter dùng chung, logging đồng bộ.
- **`synchronized` chỉ có tác dụng trong một JVM** — chạy nhiều pod thì phải dùng lock phân tán hoặc DB.
- `AtomicLong` → `LongAdder` khi ghi rất nhiều (nhanh hơn ~10 lần ở mức tranh chấp cao).
- **False sharing**: hai biến không liên quan nằm chung cache line cũng làm chậm nhau 5-10 lần.
- Công cụ chẩn đoán chính xác: **JFR** (`jdk.JavaMonitorEnter`) và **async-profiler `-e lock`**.
- Tuyệt đối không `synchronized` bọc quanh I/O.

**Bài kế tiếp** → [Case 7: Hàng đợi vô hạn — con đường êm ái tới OutOfMemoryError](07-case-queue-vo-han-oom.md)

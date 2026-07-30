# Case 6: Head-of-line blocking — một phần tử chặn cả hàng

Bạn xếp hàng ở siêu thị. Người đầu tiên có một xe đầy hàng và trả bằng tiền lẻ. Bạn chỉ mua một chai nước.

Bạn phải chờ. Không phải vì hệ thống chậm, mà vì **thứ tự**.

Đây là **head-of-line blocking (HOL blocking)** — chặn ở đầu hàng — và nó xuất hiện ở nhiều tầng của hệ thống hơn bạn nghĩ.

## Định nghĩa

**Head-of-line blocking**: phần tử đầu hàng bị chặn làm **mọi phần tử phía sau** bị chặn theo, kể cả những phần tử hoàn toàn có thể xử lý ngay.

```text
   Hàng đợi FIFO:
   [ Việc chậm 30 giây ][ 1ms ][ 1ms ][ 1ms ][ 1ms ]
            ↑
      Đang chặn 4 việc nhanh phía sau

   Tổng thời gian: 30,004 giây
   Nếu xử lý song song hoặc bỏ qua được: 30 giây cho 1 việc,
                                          4 ms cho 4 việc còn lại
```

Điểm quan trọng: **HOL blocking không phải vấn đề công suất**. Hệ thống có thể đang rảnh rỗi. Vấn đề nằm ở ràng buộc thứ tự.

## Tầng 1: HTTP/1.1

```text
   HTTP/1.1 dùng một kết nối cho một request tại một thời điểm.

   Client → [request A] ────→ Server
            (chờ response A hoàn toàn)
   Client → [request B] ────→ Server

   Nếu A mất 5 giây, B không thể bắt đầu.
```

HTTP/1.1 có **pipelining** (gửi nhiều request liên tiếp không chờ), nhưng response vẫn phải trả về **đúng thứ tự** — nên HOL blocking vẫn còn. Vì lý do này, hầu hết trình duyệt đã tắt pipelining.

Cách khắc phục thực tế của trình duyệt: **mở nhiều kết nối song song** (thường 6 kết nối mỗi domain).

```text
   6 kết nối → 6 request song song
   Nhưng: trang web hiện đại có 50-100 tài nguyên
   → Vẫn phải xếp hàng theo lô 6
```

Đây cũng là lý do có kỹ thuật "domain sharding" thời HTTP/1.1 (chia tài nguyên qua nhiều tên miền để có nhiều kết nối hơn) — một cách vá tạm.

## Tầng 2: HTTP/2 — giải quyết một nửa

HTTP/2 giới thiệu **multiplexing**: nhiều luồng (stream) trên **một** kết nối TCP.

```text
   Một kết nối TCP:
   ├─ Stream 1: request A  ┐
   ├─ Stream 3: request B  ├─ đan xen nhau ở tầng ứng dụng
   └─ Stream 5: request C  ┘

   ⇒ A chậm không chặn B và C.  HOL blocking ở tầng HTTP: ĐÃ GIẢI QUYẾT
```

**Nhưng HOL blocking vẫn còn ở tầng TCP:**

```text
   TCP đảm bảo gửi ĐÚNG THỨ TỰ. Nếu một gói tin bị mất:

   Gói: [1][2][X][4][5][6]      ← gói 3 bị mất
                ↑
   TCP giữ lại gói 4,5,6 trong bộ đệm, KHÔNG giao cho ứng dụng
   cho tới khi gói 3 được truyền lại.

   ⇒ Nếu gói 3 thuộc stream A, thì stream B và C cũng bị chặn
     dù dữ liệu của chúng ĐÃ TỚI NƠI.
```

Nghịch lý: trên mạng có tỉ lệ mất gói cao (di động, WiFi kém), **HTTP/2 có thể chậm hơn HTTP/1.1** — vì HTTP/1.1 dùng nhiều kết nối TCP, mất gói ở kết nối này không ảnh hưởng kết nối kia.

## Tầng 3: HTTP/3 và QUIC — giải quyết triệt để

HTTP/3 bỏ TCP, dùng **QUIC** (chạy trên UDP):

```text
   QUIC quản lý thứ tự ĐỘC LẬP CHO TỪNG STREAM.

   Gói mất ở stream A → chỉ stream A phải chờ
   Stream B, C tiếp tục bình thường.

   ⇒ HOL blocking ở tầng vận chuyển: ĐÃ GIẢI QUYẾT
```

Lợi ích khác của QUIC:

| Tính năng | Lợi ích |
|---|---|
| Bắt tay 0-RTT (kết nối lại) | Không tốn round-trip cho lần kết nối sau |
| Bắt tay 1-RTT (lần đầu, gồm cả TLS) | Nhanh hơn TCP+TLS (2-3 RTT) |
| Connection ID độc lập với IP | Chuyển WiFi ↔ 4G không đứt kết nối |
| Điều khiển tắc nghẽn ở không gian người dùng | Cải tiến nhanh hơn, không cần đổi kernel |

Đánh đổi: QUIC chạy trên UDP nên tốn CPU hơn (xử lý ở không gian người dùng thay vì kernel), và một số tường lửa doanh nghiệp chặn UDP.

**Khi nào nên bật HTTP/3**: client là di động hoặc mạng không ổn định, hoặc bạn phục vụ người dùng ở xa về địa lý. Với giao tiếp nội bộ trong datacenter (mất gói gần như bằng 0), lợi ích rất nhỏ.

## Tầng 4: Kafka partition

Đây là nơi HOL blocking gây đau đớn nhất trong hệ thống backend.

```text
   Một partition được xử lý TUẦN TỰ bởi một consumer.

   Partition 0: [msg A][msg B][msg C][msg D]
                   ↑
              Xử lý thất bại, retry 3 lần, mỗi lần chờ 5 giây

   ⇒ B, C, D bị chặn 15 giây, dù chúng hoàn toàn xử lý được.
```

Tệ hơn — **poison message**:

```text
   msg A có dữ liệu hỏng, KHÔNG BAO GIỜ xử lý được.
   Consumer retry vô hạn.
   ⇒ Partition đó DỪNG VĨNH VIỄN.
   ⇒ Nếu partition được chia theo khách hàng, một khách hàng
     làm treo toàn bộ luồng của họ.
```

### Giải pháp cho Kafka

**1. Retry topic riêng — cách chuẩn**

```java
@RetryableTopic(
    attempts = "4",
    backoff = @Backoff(delay = 1000, multiplier = 3),
    dltTopicSuffix = "-dlt",
    // Quan trọng: message lỗi được CHUYỂN sang topic khác,
    // không giữ trong partition gốc
    fixedDelayTopicStrategy = FixedDelayStrategy.SINGLE_TOPIC
)
@KafkaListener(topics = "orders")
public void handle(OrderEvent event) { ... }
```

```text
   Message lỗi → chuyển sang orders-retry-0 → partition gốc TIẾP TỤC ngay
   Thử lại ở topic retry → vẫn lỗi → orders-retry-1 → ... → orders-dlt
```

Đây là cơ chế quan trọng nhất: **tách việc retry ra khỏi luồng chính**.

**2. Xử lý song song trong một partition** (khi thứ tự không quan trọng)

```java
@KafkaListener(topics = "analytics-events", concurrency = "1")
public void handle(List<ConsumerRecord<String, Event>> records) {
    // Xử lý song song, chấp nhận mất thứ tự
    records.parallelStream().forEach(this::process);
    // Chỉ commit offset sau khi TẤT CẢ xong
}
```

Chỉ dùng khi thứ tự thật sự không quan trọng (sự kiện phân tích, ghi log). Với sự kiện thay đổi trạng thái, thứ tự là bắt buộc.

**3. Nhận biết lỗi vĩnh viễn và bỏ qua ngay**

```java
try {
    process(event);
} catch (DataFormatException | ValidationException e) {
    // Lỗi VĨNH VIỄN — retry vô ích, đẩy thẳng DLQ
    dltProducer.send("orders-dlt", record.key(), record.value());
} catch (TransientException e) {
    throw e;      // để cơ chế retry xử lý
}
```

**4. Tăng số partition** — mỗi partition là một hàng riêng, nên message chậm chỉ chặn phần nhỏ hơn.

Nhưng nhớ: `số consumer ≤ số partition`, và tăng partition sau khi tạo topic sẽ **phá vỡ đảm bảo thứ tự theo khoá** (vì `hash(key) % số_partition` thay đổi).

## Tầng 5: Thread pool và hàng đợi ứng dụng

```java
// Một pool dùng chung cho mọi loại tác vụ
ExecutorService pool = new ThreadPoolExecutor(
    10, 10, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(1000));

pool.submit(() -> generateMonthlyReport());    // 5 phút
pool.submit(() -> sendEmail());                // 50 ms  ← chờ phía sau
```

Đây chính là lý do tồn tại của **bulkhead** (phase-2 case 5): tách pool theo loại tác vụ để tác vụ chậm không chặn tác vụ nhanh.

Ngoài ra có thể dùng **hàng đợi ưu tiên**:

```java
ExecutorService pool = new ThreadPoolExecutor(
    10, 10, 0L, TimeUnit.MILLISECONDS,
    new PriorityBlockingQueue<>(1000, Comparator.comparingInt(Task::getPriority)));
```

Cẩn thận: hàng đợi ưu tiên có thể gây **starvation** — tác vụ ưu tiên thấp không bao giờ được chạy nếu luôn có tác vụ ưu tiên cao. Cần cơ chế tăng ưu tiên theo thời gian chờ (aging).

## Tầng 6: Database connection pool

```text
   Pool 10 connection.
   Một query báo cáo chạy 5 phút chiếm 1 connection.
   9 connection còn lại phục vụ hàng nghìn query nhanh.

   Nếu có 10 query báo cáo → pool cạn → mọi query nhanh bị chặn.
```

Giải pháp: **pool riêng cho batch/báo cáo** (phase-2 case 2) và `statement_timeout` (phase-3 case 2).

## Tầng 7: Message queue thông thường

RabbitMQ với một hàng đợi và nhiều consumer:

```text
   Nếu prefetch = 100, mỗi consumer nhận trước 100 message.
   Consumer A nhận 100 message, message đầu tiên xử lý mất 10 phút
   ⇒ 99 message kia nằm chờ ở consumer A, dù consumer B đang rảnh.
```

```java
// Giảm prefetch để message được phân phối động hơn
factory.setPrefetchCount(1);        // mỗi consumer chỉ giữ 1 message
```

Đánh đổi: `prefetch=1` giảm thông lượng (nhiều round-trip hơn) nhưng phân phối công bằng hơn. Với tác vụ có thời gian xử lý biến động lớn, đây là lựa chọn đúng.

Với tác vụ đều nhau và nhanh, `prefetch` cao hơn (50-250) cho thông lượng tốt hơn.

## Bảng tổng hợp

| Tầng | Nguyên nhân HOL | Giải pháp |
|---|---|---|
| HTTP/1.1 | Một request mỗi kết nối | Nhiều kết nối, hoặc nâng lên HTTP/2 |
| HTTP/2 | TCP đảm bảo thứ tự | HTTP/3 (QUIC) |
| Kafka partition | Xử lý tuần tự | Retry topic riêng, tăng partition |
| Thread pool | Hàng đợi FIFO chung | **Bulkhead** — tách pool |
| Connection pool | Query dài chiếm chỗ | Pool riêng + `statement_timeout` |
| RabbitMQ | Prefetch quá cao | Giảm prefetch |
| Hàng đợi ứng dụng | FIFO cứng nhắc | Ưu tiên, hoặc LIFO khi quá tải |

Nhìn bảng này thấy một mẫu hình chung: **giải pháp cho HOL blocking gần như luôn là "tách hàng" hoặc "cho phép vượt hàng"**.

## Trường hợp thực tế: một khách hàng làm treo toàn hệ thống

Bối cảnh: hệ thống xử lý đơn hàng nhiều khách hàng (multi-tenant), dùng Kafka với 12 partition, khoá phân vùng là `tenant_id`.

**Diễn biến**:

```text
   09:00  Khách hàng "MEGA-CORP" gửi một đơn hàng có 50.000 dòng sản phẩm.
   09:00  Message này rơi vào partition 7.
   09:00  Xử lý mất 45 phút (vòng lặp qua 50.000 dòng, mỗi dòng một query).

   09:00-09:45:
   ├─ Partition 7 hoàn toàn dừng
   ├─ Mọi khách hàng khác có hash rơi vào partition 7 cũng bị kẹt
   ├─ Đó là khoảng 8% tổng số khách hàng
   └─ Họ không xử lý được đơn hàng nào trong 45 phút
```

**Các biện pháp và kết quả**:

| Biện pháp | Tác dụng |
|---|---|
| Tách message lớn thành nhiều message nhỏ (mỗi cái 500 dòng) | Không còn message chạy 45 phút |
| Tách topic riêng cho đơn hàng lớn (`orders-bulk`) | Đơn lớn không đi chung đường với đơn thường |
| Thêm `max.poll.interval.ms` phù hợp | Consumer không bị coi là chết khi xử lý lâu |
| Sửa vòng lặp N+1 → batch insert | 45 phút → 90 giây cho cùng đơn hàng đó |
| Cảnh báo khi thời gian xử lý một message > 30 giây | Phát hiện sớm |

Biện pháp thứ hai đáng chú ý và là mẫu hình chung: **tách luồng nhanh và luồng chậm ra hai đường riêng**.

```text
   Đơn thường (< 100 dòng)  → topic "orders"       → 12 partition, xử lý nhanh
   Đơn lớn    (> 100 dòng)  → topic "orders-bulk"  →  3 partition, xử lý chậm

   ⇒ Không bao giờ chặn nhau.
```

Đây chính là bulkhead áp dụng cho message queue — cùng một nguyên lý với việc tách thread pool (phase-2 case 5) và tách connection pool (phase-2 case 2).

## Nguyên tắc thiết kế rút ra

1. **Tách luồng nhanh và luồng chậm.** Đây là giải pháp cho HOL blocking ở mọi tầng.
2. **Đảm bảo thứ tự có giá.** Chỉ yêu cầu thứ tự ở nơi thật sự cần, và ở phạm vi hẹp nhất có thể (theo khoá, không phải toàn cục).
3. **Giới hạn kích thước đơn vị công việc.** Message 50.000 dòng là dấu hiệu thiết kế sai; chia nhỏ ngay từ đầu.
4. **Retry phải nằm ngoài luồng chính.** Retry tại chỗ luôn gây HOL blocking.
5. **Cho phép vượt hàng khi quá tải.** LIFO hoặc ưu tiên tốt hơn FIFO cứng nhắc trong tình huống tắc nghẽn (phase-4 case 4).

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Retry ngay tại chỗ trong Kafka consumer | Chặn cả partition |
| Không xử lý poison message | Partition dừng vĩnh viễn |
| Message quá lớn | Một message chặn hàng nghìn message khác |
| Dùng chung pool cho tác vụ nhanh và chậm | HOL blocking ở tầng ứng dụng |
| Prefetch quá cao trong RabbitMQ | Message dồn vào consumer đang bận |
| Bật HTTP/2 mà mạng mất gói cao | Có thể chậm hơn HTTP/1.1 |
| Yêu cầu thứ tự toàn cục khi không cần | Mất hết khả năng song song |
| Hàng đợi ưu tiên không có aging | Tác vụ ưu tiên thấp không bao giờ chạy |

## Tóm tắt case 6

- **HOL blocking**: phần tử đầu hàng bị chặn làm mọi phần tử phía sau chặn theo — **không phải vấn đề công suất mà là vấn đề thứ tự**.
- Xuất hiện ở 7 tầng: HTTP/1.1, HTTP/2 (tầng TCP), Kafka partition, thread pool, connection pool, RabbitMQ prefetch, hàng đợi ứng dụng.
- **HTTP/2 giải quyết HOL ở tầng HTTP nhưng không ở tầng TCP**; chỉ **HTTP/3 (QUIC)** giải quyết triệt để.
- Kafka: **retry phải ở topic riêng**, và phân biệt lỗi vĩnh viễn để đẩy thẳng DLQ.
- Giải pháp chung ở mọi tầng: **tách luồng nhanh và luồng chậm** (bulkhead).
- **Giới hạn kích thước đơn vị công việc** — message khổng lồ luôn là dấu hiệu thiết kế sai.
- Đảm bảo thứ tự có giá; chỉ yêu cầu nó ở phạm vi hẹp nhất cần thiết.

**Bài kế tiếp** → [Case 7: JIT warmup và cold start — vì sao pod mới luôn chậm](07-case-jit-warmup-cold-start.md)

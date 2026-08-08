# Bài 10: Hành trình một message — từ `send()` tới tay consumer

Bạn gọi một dòng code:

```java
kafkaTemplate.send("order-events", "KH-042", order);
```

Giữa dòng đó và lúc consumer in ra màn hình có khoảng **mười ba thành phần** cùng làm việc, ba luồng khác nhau, hai lần đổi định dạng, và ít nhất bốn chỗ có thể hỏng.

Bài này đi hết chặng đường đó, dừng lại ở từng thành phần để trả lời ba câu: **nó là gì, nó giải bài toán gì, và hỏng thì biểu hiện ra sao.**

## Bản đồ toàn tuyến

```text
 ┌── TIẾN TRÌNH ỨNG DỤNG (producer) ─────────────────────────────────┐
 │                                                                    │
 │  [1] Luồng ứng dụng      send() — TRẢ VỀ NGAY, không chờ          │
 │       │                                                            │
 │  [2] Interceptor         móc để sửa/ghi nhận record                │
 │  [3] Serializer          đối tượng Java → mảng byte                │
 │  [4] Partitioner         chọn partition                            │
 │  [5] RecordAccumulator   gom vào lô theo partition                 │
 │       │                            ▲ hàng đợi trong bộ nhớ         │
 │  ─────┼────────── ranh giới luồng ─┼───────────────────────────    │
 │       ▼                            │                               │
 │  [6] Sender thread       lấy lô ra, đóng gói ProduceRequest        │
 │  [7] NetworkClient       quản kết nối, giới hạn request đang bay   │
 └───────────────────────────┬────────────────────────────────────────┘
                             │  TCP, giao thức nhị phân riêng của Kafka
 ┌───────────────────────────▼────────────────────────────────────────┐
 │ BROKER (leader của partition)                                      │
 │  [8]  Network thread     đọc byte từ socket, đẩy vào hàng đợi      │
 │  [9]  Request handler    kiểm tra quyền, kiểm tra ISR, ghi log     │
 │  [10] Log / page cache   nối lô vào cuối segment                   │
 │  [11] Purgatory          giữ request acks=all lại, chờ nhân bản    │
 │  [12] Replica fetcher    (ở follower) kéo dữ liệu về               │
 └───────────────────────────┬────────────────────────────────────────┘
                             │
 ┌───────────────────────────▼────────────────────────────────────────┐
 │ TIẾN TRÌNH ỨNG DỤNG (consumer)                                     │
 │  [13] Fetcher            gửi FetchRequest, nhận lô byte            │
 │  [14] Deserializer       mảng byte → đối tượng Java                │
 │  [15] poll()             trả về cho code của bạn                   │
 │  [16] Offset commit      ghi vị trí đã xử lý vào __consumer_offsets│
 └────────────────────────────────────────────────────────────────────┘
```

Đi từng chặng.

---

## Chặng 1 — bên trong producer

### `send()` là bất đồng bộ, và đây là nguồn gốc của hiểu lầm lớn nhất

```java
Future<RecordMetadata> future = producer.send(record);
// Dòng này chạy tới đây sau khoảng vài chục MICROGIÂY.
// Message CHƯA hề rời khỏi tiến trình của bạn.
```

`send()` chỉ làm ba việc: tuần tự hoá, chọn partition, bỏ vào bộ nhớ đệm. Rồi trả về. Việc gửi thật do **một luồng khác** (Sender thread) làm.

Hệ quả rất thực tế mà nhiều người vấp:

```java
// SAI — thoát chương trình trước khi Sender kịp gửi
producer.send(record);
System.exit(0);          // message BIẾN MẤT, không lỗi, không cảnh báo

// ĐÚNG — flush() chờ mọi lô trong bộ đệm được gửi xong
producer.send(record);
producer.flush();
producer.close();        // close() cũng tự flush
```

Trong Spring Boot, `KafkaTemplate` và vòng đời bean lo việc này giúp bạn khi tắt ứng dụng đúng cách. Nhưng nếu bạn viết một tác vụ chạy một lần rồi thoát, đây là bẫy số một.

### [3] Serializer — biên giới giữa thế giới Java và thế giới byte

> **Serializer** biến đối tượng Java thành **mảng byte**. Kafka broker **không biết gì** về kiểu dữ liệu — với nó mọi thứ chỉ là byte.

| Lựa chọn | Kích thước | Ưu | Nhược |
|---|---|---|---|
| `StringSerializer` | Lớn | Đọc được bằng mắt, dễ debug | Tốn băng thông |
| **JSON** | Lớn | Ai cũng đọc được, không cần công cụ | Không kiểm soát schema, tốn chỗ |
| **Avro** + Schema Registry | Nhỏ nhất | **Kiểm soát tiến hoá schema**, rất gọn | Cần chạy thêm Schema Registry |
| **Protobuf** | Nhỏ | Gọn, sinh code sẵn | Cần file `.proto` |

Vì sao Schema Registry quan trọng — đây là cơn đau gốc của LinkedIn ở [Bài 1](01-vi-sao-kafka-ra-doi-tai-linkedin.md) quay lại:

```text
   KHÔNG có kiểm soát schema
   ═════════════════════════
   Hôm nay:  {"orderId":"OD-1", "amount":250000}
   Ngày mai: team producer đổi "amount" thành "totalAmount"
   → MỌI consumer vỡ cùng lúc, giữa đêm, không ai báo trước

   CÓ Schema Registry
   ══════════════════
   Producer đăng ký schema mới → Registry kiểm tra tính tương thích
   → Đổi kiểu phá vỡ tương thích thì BỊ TỪ CHỐI NGAY LÚC GỬI
   → Lỗi xuất hiện ở phía người gây ra, không phải phía nạn nhân
```

### [4] Partitioner — chọn partition

Ba đường đi, theo thứ tự ưu tiên:

```text
   1. Có chỉ định partition tường minh?
      new ProducerRecord<>("topic", 2, key, value)
      → dùng partition 2. Hết.

   2. Có key?
      → murmur2(key_bytes) % số_partition
      → CÙNG KEY LUÔN VÀO CÙNG PARTITION (điều kiện: số partition không đổi)

   3. Không key?
      → PHÂN VÙNG DÍNH (sticky partitioning)
```

### Đính chính: null key KHÔNG phải round-robin

Transcript gốc nói: *"`linger.ms = 100` giúp gom batch nhỏ và chuyển đổi luồng gửi giữa các Partition theo cơ chế Round-Robin khi không truyền Key"*.

Vế **round-robin là sai** kể từ Kafka 2.4 (KIP-480). Hành vi thật là **phân vùng dính**:

```text
   ROUND-ROBIN (cách CŨ, trước Kafka 2.4)
   ══════════════════════════════════════
   msg1→P0  msg2→P1  msg3→P2  msg4→P0  msg5→P1 ...

   Vấn đề: mỗi partition chỉ gom được 1 message mỗi vòng
   → lô nhỏ xíu → nhiều request → độ trễ CAO HƠN


   STICKY (từ Kafka 2.4 trở đi)
   ════════════════════════════
   msg1..msg50 → P0   (dính vào P0 cho tới khi lô đầy hoặc hết linger.ms)
   msg51..msg98 → P2  (đổi sang partition khác)
   msg99..msg150 → P1

   → Lô LỚN → ít request → độ trễ THẤP HƠN và thông lượng cao hơn
   → Về lâu dài các partition vẫn nhận đều nhau
```

Điều thú vị: **transcript chính thức của khoá này đã mô tả đúng hành vi đó** ([Phase 3 bài 6](../phase-3-kafka-fundamentals/06-partitions-keys.md)) — consumer thứ nhất nhận một loạt message, im lặng một lúc, rồi consumer thứ hai mới bắt đầu nhận. Đó chính là dấu vết của sticky partitioning, không phải round-robin.

Kafka 3.3 (KIP-794) cải tiến thêm thành **uniform sticky**: khi chọn partition tiếp theo, ưu tiên partition mà broker đang xử lý nhanh hơn — tự động né broker đang chậm.

### [5] RecordAccumulator — nơi `linger.ms` và `batch.size` thật sự sống

```text
   ┌─── RecordAccumulator (bộ nhớ đệm trong tiến trình ứng dụng) ────┐
   │                                                                  │
   │  Hàng đợi P0: [ lô đang mở: 12 KB / 16 KB ]  [ lô đã đóng ]     │
   │  Hàng đợi P1: [ lô đang mở:  3 KB / 16 KB ]                     │
   │  Hàng đợi P2: [ lô đang mở: 15 KB / 16 KB ]  [ lô ] [ lô ]      │
   │                                                                  │
   │  Tổng bộ đệm bị chặn bởi buffer.memory (mặc định 32 MB)         │
   └──────────────────────────────────────────────────────────────────┘

   Một lô được ĐÓNG và cho gửi khi:
     • đầy batch.size (mặc định 16384 byte), HOẶC
     • lô đã mở đủ linger.ms (mặc định 0)
```

| Tham số | Mặc định | Tăng lên thì |
|---|---|---|
| `batch.size` | 16384 (16 KB) | Lô lớn hơn → nén tốt hơn, ít request hơn, độ trễ có thể tăng |
| `linger.ms` | 0 | Chờ gom lô → thông lượng tăng rõ, độ trễ tăng đúng bằng giá trị này |
| `buffer.memory` | 33554432 (32 MB) | Chịu được đợt cao điểm lâu hơn trước khi chặn |
| `compression.type` | `none` | `lz4`/`zstd` giảm băng thông rất nhiều, tốn thêm CPU |

`linger.ms=0` **không** có nghĩa "gửi từng message một". Nó nghĩa là "gửi ngay khi Sender thread rảnh". Nếu Sender đang bận gửi lô trước, các message tới trong lúc đó vẫn được gom lại tự nhiên. Đây là cơ chế tự điều chỉnh khá đẹp: **tải càng cao thì lô càng tự động lớn**.

> **Bẫy `buffer.memory` đầy**: khi bộ đệm đầy, `send()` **chặn luồng gọi** tối đa `max.block.ms` (mặc định 60 giây) rồi ném `TimeoutException`. Trong ứng dụng web, điều này biểu hiện thành *"API đột nhiên treo 60 giây"* — và gần như không ai đoán ra thủ phạm là Kafka producer.

### [7] Số request đang bay và cái bẫy thứ tự

```properties
max.in.flight.requests.per.connection = 5     # mặc định
```

Producer cho phép **5 request chưa nhận phản hồi** cùng bay tới một broker. Điều này tốt cho thông lượng nhưng sinh ra một cái bẫy nếu không có idempotence:

```text
   KHÔNG có idempotence, max.in.flight = 5
   ═══════════════════════════════════════
   Gửi lô A (offset dự kiến 100)  ─┐
   Gửi lô B (offset dự kiến 101)  ─┼─ cả hai đang bay
                                    │
   Lô A LỖI (mạng chập) → thử lại  │
   Lô B THÀNH CÔNG, ghi vào offset 100
   Lô A thử lại thành công, ghi vào offset 101

   → THỨ TỰ BỊ ĐẢO. B nằm trước A trên đĩa.
```

**`enable.idempotence=true` (mặc định từ Kafka 3.0) chặn hoàn toàn chuyện này**: broker theo dõi số thứ tự `sequence` của từng producer và **từ chối lô sai thứ tự**, buộc producer gửi lại đúng trật tự. Đây là lý do bạn có thể vừa giữ `max.in.flight=5` (nhanh) vừa được đảm bảo thứ tự.

---

## Chặng 2 — bên trong broker

### [8][9] Kiến trúc hai tầng luồng

Đây là thiết kế mà rất ít tài liệu tiếng Việt nói tới, nhưng nó giải thích hai tham số tuning quan trọng nhất của broker:

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  MẠNG ──► [Acceptor]  nhận kết nối mới                       │
   │              │                                                │
   │              ▼                                                │
   │  ┌─────────────────────────────────────┐                     │
   │  │ NETWORK THREADS (num.network.threads)│  mặc định 3         │
   │  │ Chỉ đọc/ghi byte từ socket.          │                     │
   │  │ KHÔNG xử lý nghiệp vụ, KHÔNG chạm đĩa│                     │
   │  └───────────────┬─────────────────────┘                     │
   │                  ▼                                            │
   │        ┌──────────────────────┐                              │
   │        │  HÀNG ĐỢI REQUEST    │  queued.max.requests = 500   │
   │        └──────────┬───────────┘                              │
   │                   ▼                                           │
   │  ┌─────────────────────────────────────┐                     │
   │  │ IO THREADS (num.io.threads)          │  mặc định 8         │
   │  │ Kiểm tra quyền, kiểm tra ISR,        │                     │
   │  │ GHI VÀO LOG, đọc từ log              │                     │
   │  └───────────────┬─────────────────────┘                     │
   │                  ▼                                            │
   │        ┌──────────────────────┐                              │
   │        │  HÀNG ĐỢI PHẢN HỒI   │                              │
   │        └──────────┬───────────┘                              │
   │                   ▼  network thread gửi trả                   │
   └──────────────────────────────────────────────────────────────┘
```

Vì sao tách hai tầng: thao tác mạng (chờ byte) và thao tác đĩa (chờ ghi) có đặc tính chờ hoàn toàn khác nhau. Gộp chung thì một request ghi đĩa chậm sẽ chặn luôn việc đọc byte của các kết nối khác.

Cách chẩn đoán khi broker chậm:

| Chỉ số | Ý nghĩa | Nếu cao thì |
|---|---|---|
| `RequestQueueSize` | Hàng đợi request đang dồn | **Tăng `num.io.threads`** — IO thread không kịp xử lý |
| `NetworkProcessorAvgIdlePercent` | Network thread rảnh bao nhiêu % | Dưới 30% → **tăng `num.network.threads`** |
| `RequestHandlerAvgIdlePercent` | IO thread rảnh bao nhiêu % | Dưới 30% → **tăng `num.io.threads`** hoặc thêm broker |

Quy tắc khởi điểm: `num.io.threads` khoảng **bằng số lõi CPU**, `num.network.threads` khoảng **số lõi / 2**.

### [11] Purgatory — cái tên hay nhất trong mã nguồn Kafka

**Purgatory** (luyện ngục) là nơi broker **giữ lại** những request chưa thể trả lời ngay:

```text
   ProduceRequest với acks=all tới
        │
        ├─ ghi vào log xong (nhanh, ~0,2 ms)
        │
        └─ nhưng CHƯA thể trả lời — phải chờ follower kéo về
             │
             ▼
        ┌─────────────────────────────────────────────┐
        │  PRODUCE PURGATORY                          │
        │  Request nằm chờ ở đây, KHÔNG chiếm IO thread│
        │  Điều kiện thoát: HW vượt qua offset của lô │
        │  Hết giờ: request.timeout.ms (30 giây)      │
        └─────────────────────────────────────────────┘
```

Tương tự có **Fetch Purgatory** cho consumer: consumer hỏi "cho tôi dữ liệu mới", chưa có gì mới, request nằm chờ tới khi có dữ liệu hoặc hết `fetch.max.wait.ms` (mặc định 500 ms).

Đây chính là cơ chế **long polling** khiến Kafka vừa có độ trễ thấp vừa không đốt CPU:

```text
   POLLING NGÂY THƠ (như LinkedIn năm 2010!)
   Consumer hỏi mỗi 100 ms → phần lớn lần hỏi trả về rỗng
   → tốn CPU và mạng vô ích, độ trễ vẫn tới 100 ms

   LONG POLLING (Kafka)
   Consumer hỏi một lần, broker GIỮ request lại tối đa 500 ms
   → có dữ liệu là trả về NGAY (độ trễ ~0)
   → không có dữ liệu thì chỉ một request mỗi 500 ms
```

Vòng tròn khép lại: bài toán polling mở đầu [Bài 1](01-vi-sao-kafka-ra-doi-tai-linkedin.md) được chính Kafka giải bằng purgatory.

---

## Chặng 3 — bên trong consumer

### [13] Consumer group và Group Coordinator

> **Group Coordinator** (điều phối viên nhóm) là **một broker** được giao nhiệm vụ quản lý một consumer group cụ thể: ai đang trong nhóm, ai giữ partition nào, offset tới đâu.

Broker nào làm coordinator được xác định bằng công thức:

```text
   partition_của__consumer_offsets = |hash(group.id)| % 50
   coordinator = LEADER của partition đó
```

(50 là `offsets.topic.num.partitions` mặc định.)

Nghĩa là **các consumer group khác nhau được điều phối bởi các broker khác nhau** — tải điều phối tự động trải đều cả cụm. Không có điểm nghẽn trung tâm.

### Quy trình một consumer tham gia nhóm

```text
   1. FindCoordinator     "group.id của tôi thì ai điều phối?"
                          → broker trả về địa chỉ coordinator
   2. JoinGroup           "cho tôi vào nhóm"
                          → coordinator chọn MỘT consumer làm GROUP LEADER
   3. SyncGroup           Group leader TỰ TÍNH cách chia partition,
                          gửi kết quả cho coordinator,
                          coordinator phát lại cho mọi thành viên
   4. Fetch               Bắt đầu đọc partition được giao
   5. Heartbeat           Gửi nhịp tim đều đặn để giữ chỗ trong nhóm
```

Chi tiết bước 3 rất đáng chú ý: **việc chia partition do một CONSUMER tính, không phải broker.** Thiết kế này cho phép thay đổi thuật toán chia (`partition.assignment.strategy`) mà **không cần nâng cấp broker** — chỉ cần đổi thư viện client.

### Ba đồng hồ của consumer — và đây là nơi sinh ra lỗi rebalance vô tận

Đây là phần gây nhiều sự cố production nhất trong toàn bộ Kafka:

| Tham số | Mặc định | Đo cái gì | Vượt quá thì |
|---|---|---|---|
| `heartbeat.interval.ms` | 3000 | Gửi nhịp tim mỗi bao lâu | — |
| `session.timeout.ms` | 45000 | Không nghe nhịp tim bao lâu thì coi là chết | Bị đá khỏi nhóm |
| **`max.poll.interval.ms`** | **300000 (5 phút)** | Khoảng cách giữa **hai lần gọi `poll()`** | **Bị đá khỏi nhóm** |

Điểm mấu chốt: **nhịp tim do một luồng nền gửi, còn `poll()` do luồng chính của bạn gọi.** Hai thứ này độc lập.

```text
   KỊCH BẢN GÂY REBALANCE VÔ TẬN
   ═════════════════════════════

   poll() trả về 500 bản ghi (max.poll.records mặc định 500)
   Mỗi bản ghi cần gọi một API bên ngoài mất 1 giây
   → xử lý hết 500 bản ghi mất 500 giây

   Trong lúc đó:
     Luồng nền VẪN gửi nhịp tim đều → coordinator tưởng consumer khoẻ
     Nhưng poll() KHÔNG được gọi lại trong 500 giây > 300 giây

   t=300s  Coordinator: "consumer này quá hạn poll" → ĐÁ KHỎI NHÓM
           → REBALANCE, partition giao cho consumer khác
   t=500s  Consumer xử lý xong, gọi commit
           → LỖI CommitFailedException (không còn giữ partition nữa)
   t=500s  Consumer xin vào nhóm lại → REBALANCE lần nữa
   t=500s  Nhận partition, poll ra ĐÚNG 500 BẢN GHI ĐÓ (chưa commit)
           → lặp lại từ đầu, MÃI MÃI
```

Triệu chứng ở production: consumer group liên tục rebalance, lag tăng đều, cùng một message được xử lý đi xử lý lại.

Ba cách chữa, theo thứ tự nên thử:

| Cách | Làm gì | Khi nào dùng |
|---|---|---|
| **Giảm `max.poll.records`** | 500 → 50 → mỗi vòng poll chỉ xử lý 50 giây | **Ưu tiên số một**, dễ và an toàn nhất |
| **Tăng `max.poll.interval.ms`** | 5 phút → 15 phút | Khi xử lý thật sự lâu và không chia nhỏ được |
| **Đưa xử lý sang luồng khác** | poll() nhanh, đẩy việc vào thread pool | Khi cần thông lượng cao — xem [Phase 11](../phase-11-concurrent-processing/02-unordered-concurrency.md) |

Cách thứ ba mạnh nhất nhưng phải tự quản việc commit offset — nếu không sẽ mất message khi consumer chết giữa chừng.

### [16] Offset commit — chỗ quyết định "ít nhất một lần" hay "nhiều nhất một lần"

```text
   THỨ TỰ A — commit TRƯỚC khi xử lý
   ═════════════════════════════════
   poll() → commit offset → xử lý
   Chết giữa chừng → offset đã commit → message KHÔNG BAO GIỜ xử lý lại
   → NHIỀU NHẤT MỘT LẦN (at-most-once) — có thể MẤT

   THỨ TỰ B — commit SAU khi xử lý  (mặc định, và gần như luôn đúng)
   ═════════════════════════════════════════════════════════════════
   poll() → xử lý → commit offset
   Chết giữa chừng → offset chưa commit → message ĐƯỢC XỬ LÝ LẠI
   → ÍT NHẤT MỘT LẦN (at-least-once) — có thể TRÙNG
```

Vì "ít nhất một lần" là mặc định, **mọi consumer nghiêm túc phải xử lý được việc nhận trùng**. Cách chuẩn là làm **idempotent** — xử lý lại cho cùng kết quả:

```java
@Transactional
public void handle(OrderEvent event) {
    // Khoá tự nhiên từ dữ liệu nghiệp vụ, không phải UUID sinh mới
    String eventId = event.getOrderId() + ":" + event.getVersion();

    if (processedEventRepository.existsById(eventId)) {
        return;                       // đã xử lý rồi, bỏ qua im lặng
    }
    inventoryService.reserve(event.getProductId(), event.getQuantity());
    processedEventRepository.save(new ProcessedEvent(eventId));
}
```

Điểm then chốt: `existsById` và `save` phải nằm **trong cùng một transaction database** với công việc nghiệp vụ. Tách ra là mất tác dụng — chết giữa hai bước thì vẫn trùng.

---

## Toàn bộ dòng thời gian, có số

Cụm 3 broker trong cùng một AZ, message 1 KB, `linger.ms=5`, `acks=all`:

```text
   t = 0,00 ms   send() trả về            ← luồng ứng dụng đã rảnh
   t = 0,02 ms   serialize + chọn partition
   t = 0,03 ms   vào RecordAccumulator
   t = 5,00 ms   linger.ms hết → đóng lô  ← CHỜ LÂU NHẤT, do bạn cấu hình
   t = 5,10 ms   Sender gửi ProduceRequest
   t = 5,40 ms   broker nhận, vào hàng đợi
   t = 5,60 ms   IO thread ghi vào page cache
   t = 5,65 ms   vào Produce Purgatory chờ nhân bản
   t = 6,30 ms   follower 1 fetch về xong
   t = 6,50 ms   follower 2 fetch về xong
   t = 6,80 ms   HW nhích lên → thoát purgatory → trả lời producer
   t = 6,80 ms   ✓ PRODUCER NHẬN XÁC NHẬN
   t = 7,00 ms   consumer đang chờ trong Fetch Purgatory được đánh thức
   t = 7,40 ms   dữ liệu tới consumer, deserialize
   t = 7,50 ms   ✓ poll() TRẢ VỀ CHO CODE CỦA BẠN

   ĐỘ TRỄ ĐẦU-CUỐI ≈ 7,5 ms
   Trong đó 5 ms là linger.ms — tức là do BẠN CHỌN.
```

Bảng phân bổ thời gian, để biết chỉnh chỗ nào có tác dụng:

| Chặng | Thời gian | Chỉnh được không |
|---|---|---|
| Gom lô (`linger.ms`) | 5,00 ms | **Có** — giảm `linger.ms` |
| Mạng producer → broker | 0,40 ms | Chỉ bằng cách đặt gần hơn |
| Ghi vào page cache | 0,20 ms | Gần như không |
| **Chờ nhân bản (purgatory)** | **1,15 ms** | Giảm bằng `acks=1` (đánh đổi độ bền) |
| Giao cho consumer | 0,70 ms | Chỉnh `fetch.min.bytes` |

Kết luận thực dụng: **nếu độ trễ chưa đạt yêu cầu, chỉnh `linger.ms` trước.** Nó thường chiếm phần lớn thời gian và là thứ bạn kiểm soát hoàn toàn.

---

## Cùng một hành trình, viết bằng Spring

Cấu hình producer đầy đủ cho production:

```yaml
spring:
  kafka:
    bootstrap-servers: kafka1:9092,kafka2:9092,kafka3:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      acks: all
      properties:
        enable.idempotence: true
        max.in.flight.requests.per.connection: 5
        linger.ms: 5
        compression.type: lz4
        delivery.timeout.ms: 120000
    consumer:
      group-id: inventory-service
      auto-offset-reset: earliest
      enable-auto-commit: false          # để Spring quản việc commit
      max-poll-records: 50               # chống lỗi max.poll.interval
      properties:
        max.poll.interval.ms: 300000
        isolation.level: read_committed  # chỉ đọc dữ liệu đã commit
    listener:
      ack-mode: record                   # commit sau MỖI bản ghi xử lý xong
      concurrency: 3                     # 3 luồng, khớp số partition
```

Producer:

```java
@Service
@RequiredArgsConstructor
public class OrderEventPublisher {

    private final KafkaTemplate<String, OrderEvent> kafkaTemplate;

    public void publish(OrderEvent event) {
        // Key quyết định partition, và do đó quyết định thứ tự.
        // Dùng customerId để mọi sự kiện của một khách giữ đúng trình tự.
        kafkaTemplate.send("order-events", event.getCustomerId(), event)
            .whenComplete((result, ex) -> {
                if (ex != null) {
                    log.error("Gửi thất bại: orderId={}", event.getOrderId(), ex);
                    return;
                }
                RecordMetadata md = result.getRecordMetadata();
                log.debug("Đã gửi: partition={} offset={}", md.partition(), md.offset());
            });
    }
}
```

Consumer:

```java
@Component
public class InventoryConsumer {

    @KafkaListener(topics = "order-events")
    public void onOrderEvent(
            @Payload OrderEvent event,
            @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
            @Header(KafkaHeaders.OFFSET) long offset) {

        log.info("Nhận partition={} offset={} orderId={}",
                 partition, offset, event.getOrderId());

        // Ném exception ở đây sẽ kích hoạt error handler của Spring
        // (retry rồi đẩy sang DLQ) — xem Phase 13.
        inventoryService.reserve(event);
    }
}
```

Đối chiếu code với sơ đồ đầu bài:

| Dòng code | Thành phần trong sơ đồ |
|---|---|
| `kafkaTemplate.send(...)` | [1] luồng ứng dụng |
| `value-serializer` | [3] Serializer |
| Tham số key `event.getCustomerId()` | [4] Partitioner |
| `linger.ms`, `compression.type` | [5] RecordAccumulator |
| `acks: all` | [11] Purgatory ở broker |
| `@KafkaListener` | [13][14][15] Fetcher, Deserializer, poll |
| `ack-mode: record` | [16] Offset commit |
| `concurrency: 3` | Ba consumer trong cùng group |

---

## Bảng tra: hỏng ở đâu thì biểu hiện thế nào

| Triệu chứng | Hỏng ở chặng nào | Kiểm tra gì |
|---|---|---|
| `send()` treo rồi ném `TimeoutException` sau 60 giây | [5] bộ đệm đầy | `buffer.memory`, `max.block.ms`, broker có nhận kịp không |
| Message "gửi rồi" mà consumer không thấy | [1] thoát chương trình trước khi flush | Gọi `flush()` hoặc `close()` |
| Thứ tự bị đảo | [7] thử lại khi không có idempotence | Bật `enable.idempotence=true` |
| `NotEnoughReplicasException` | [9] ISR không đủ | `min.insync.replicas` so với ISR thật |
| Producer thành công, consumer chờ mãi | [11] HW chưa nhích | Kiểm tra follower có tụt không |
| Rebalance liên tục, xử lý lặp lại | [15] quá hạn `max.poll.interval.ms` | Giảm `max.poll.records` |
| Lag tăng đều không giảm | [13] consumer ít hơn partition, hoặc xử lý chậm | Tăng `concurrency`, kiểm tra thời gian xử lý |
| Cùng message xử lý hai lần | [16] "ít nhất một lần" | Đây là **hành vi đúng** — làm consumer idempotent |
| Message biến mất sau khi broker chết | `acks=1` hoặc RF=1 | Đặt `acks=all` + RF=3 + minISR=2 |
| Consumer nhận `RecordDeserializationException` | [14] schema đổi | Dùng `ErrorHandlingDeserializer`, xem [Phase 13](../phase-13-error-handling/03-deserialization-pause-resume.md) |

## Tóm tắt bài 10

- **`send()` là bất đồng bộ** — nó chỉ tuần tự hoá, chọn partition, bỏ vào bộ đệm rồi trả về. Việc gửi thật do **Sender thread** làm. Thoát chương trình mà không `flush()` là mất message, im lặng.
- **Serializer** là biên giới Java ↔ byte. Broker không biết kiểu dữ liệu. **Schema Registry** đẩy lỗi schema về phía người gây ra thay vì phía nạn nhân.
- **Đính chính**: null key **không** dùng round-robin từ Kafka 2.4 — nó dùng **phân vùng dính (sticky)**: dồn một loạt message vào một partition rồi mới đổi, để lô lớn hơn và độ trễ thấp hơn.
- **`linger.ms` và `batch.size` sống trong RecordAccumulator**, phía client, không phải phía broker. `linger.ms=0` không có nghĩa gửi từng cái — tải cao thì lô tự lớn lên.
- Broker dùng **kiến trúc hai tầng luồng**: network thread chỉ đọc/ghi byte, IO thread mới chạm đĩa. Chẩn đoán bằng `RequestHandlerAvgIdlePercent` và `NetworkProcessorAvgIdlePercent`.
- **Purgatory** giữ request chưa trả lời được mà không chiếm luồng — đây là cơ chế **long polling** khiến Kafka vừa độ trễ thấp vừa không đốt CPU. Chính là lời giải cho bài toán polling đã mở đầu ở [Bài 1](01-vi-sao-kafka-ra-doi-tai-linkedin.md).
- **Group Coordinator** được chọn bằng `hash(group.id) % 50` → các group khác nhau do các broker khác nhau điều phối, không có điểm nghẽn.
- **Việc chia partition do một CONSUMER tính**, không phải broker — nên đổi thuật toán chia chỉ cần đổi thư viện client.
- Bẫy sự cố số một: **`max.poll.interval.ms`**. Nhịp tim do luồng nền gửi nên consumer "trông vẫn khoẻ" trong khi `poll()` quá hạn → bị đá khỏi nhóm → rebalance vô tận. Chữa bằng **giảm `max.poll.records`** trước tiên.
- Mặc định của Kafka là **"ít nhất một lần"**, nên **mọi consumer phải idempotent** — kiểm tra khoá nghiệp vụ trong **cùng transaction** với việc nghiệp vụ.
- Trong độ trễ đầu-cuối ~7,5 ms thì **5 ms là `linger.ms` do bạn chọn**. Muốn giảm độ trễ thì chỉnh chỗ đó trước.

**Bài kế tiếp** → [Bài 11: Từ điển mọi thành phần Kafka — làm gì, giải quyết gì, hỏng ra sao](11-tu-dien-moi-thanh-phan-kafka.md)

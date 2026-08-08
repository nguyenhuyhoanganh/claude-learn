# Bài 4: Gửi và đọc partition chỉ định — custom partitioner, assign và seek

Mặc định, Kafka tự quyết định message của bạn vào partition nào, và tự chia partition cho consumer. 95% trường hợp cứ để nó tự làm là đúng.

Nhưng có 5% cần can thiệp: gom dữ liệu liên quan vào một chỗ, cấp năng lực xử lý khác nhau cho các nhóm dữ liệu, hoặc đọc lại một partition cụ thể để điều tra sự cố. Bài này trình bày toàn bộ công cụ để làm điều đó — **và cả những thứ bạn mất khi dùng chúng**.

## Bốn đường vào partition, theo thứ tự ưu tiên

Đây là logic của `DefaultPartitioner`, chạy đúng theo thứ tự:

```text
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. Có chỉ định partition tường minh trong ProducerRecord?   │
   │    new ProducerRecord<>("orders", 2, key, value)            │
   │              → dùng partition 2. DỪNG.                      │
   ├─────────────────────────────────────────────────────────────┤
   │ 2. Có partitioner tuỳ chỉnh (partitioner.class)?            │
   │              → gọi partitioner đó. DỪNG.                    │
   ├─────────────────────────────────────────────────────────────┤
   │ 3. Có key (key != null)?                                    │
   │    murmur2(keyBytes) % soPartition                          │
   │              → cùng key luôn cùng partition. DỪNG.          │
   ├─────────────────────────────────────────────────────────────┤
   │ 4. Không có gì cả (key == null)?                            │
   │              → PHÂN VÙNG DÍNH (sticky), từ Kafka 2.4        │
   │              → round-robin, với Kafka ≤ 2.3                 │
   └─────────────────────────────────────────────────────────────┘
```

### Đính chính quan trọng: công thức băm key

Nhiều tài liệu (kể cả tài liệu nguồn của bài này) ghi công thức như sau:

```java
// SAI — chú ý dấu trừ 1
targetPartition = Math.abs(Utils.murmur2(keyBytes)) % (numPartitions - 1);
```

Công thức này **sai**, và sai theo cách rất khó phát hiện. Hai lỗi:

**Lỗi 1 — `numPartitions - 1` làm partition cuối cùng không bao giờ nhận được dữ liệu.**

```text
   Topic có 3 partition: P0, P1, P2

   Với công thức SAI:  x % (3 - 1) = x % 2  →  chỉ ra 0 hoặc 1
                       → P2 VĨNH VIỄN RỖNG

   Với 10 partition:   x % 9  →  P9 vĩnh viễn rỗng
                       → mất 10% năng lực, và consumer của P9 ngồi không
```

**Lỗi 2 — `Math.abs()` không an toàn với `Integer.MIN_VALUE`.**

```java
Math.abs(Integer.MIN_VALUE) == Integer.MIN_VALUE   // vẫn ÂM!
// → số âm % n cho kết quả âm → ArrayIndexOutOfBoundsException
```

Công thức đúng mà Kafka thật sự dùng:

```java
// ĐÚNG — theo mã nguồn Kafka
partition = Utils.toPositive(Utils.murmur2(keyBytes)) % numPartitions;

// Utils.toPositive(x) thực chất là:  x & 0x7fffffff
// → xoá bit dấu, luôn cho số không âm, KHÔNG có trường hợp biên như Math.abs
```

Nếu bạn tự viết partitioner, hãy dùng `Utils.toPositive(...)` và **không trừ 1**.

## Cách 1 — chỉ định partition tường minh

```java
ProducerRecord<String, Order> record =
        new ProducerRecord<>("orders", 2, order.getCustomerId(), order);
producer.send(record);
```

Trong Spring:

```java
kafkaTemplate.send("orders", 2, order.getCustomerId(), order);
//                          ▲
//                    partition
```

| Ưu | Nhược |
|---|---|
| Kiểm soát tuyệt đối | **Code phải biết topic có bao nhiêu partition** |
| Đơn giản, không cần lớp mới | Tăng số partition thì logic có thể sai |
| | Gửi vào partition không tồn tại → `TimeoutException` khó hiểu |

Bẫy thật hay gặp:

```java
// SAI — hard-code số partition
int p = order.getRegionId() % 3;        // giả định topic có đúng 3 partition
kafkaTemplate.send("orders", p, key, order);

// Ai đó tăng topic lên 6 partition → P3, P4, P5 vĩnh viễn rỗng, không ai biết
```

Cách chữa: đọc số partition lúc chạy thay vì hard-code:

```java
int soPartition = kafkaTemplate.partitionsFor("orders").size();
int p = order.getRegionId() % soPartition;
```

## Cách 2 — custom partitioner

Khi logic định tuyến phức tạp hơn "băm key", viết một lớp cài `Partitioner`:

```java
public class VipOrderPartitioner implements Partitioner {

    // Dành riêng partition 0 cho khách VIP.
    // Các partition còn lại chia đều cho khách thường.
    private static final int PARTITION_VIP = 0;

    @Override
    public int partition(String topic, Object key, byte[] keyBytes,
                         Object value, byte[] valueBytes, Cluster cluster) {

        List<PartitionInfo> partitions = cluster.partitionsForTopic(topic);
        int soPartition = partitions.size();

        if (soPartition < 2) {
            throw new IllegalStateException(
                "Topic " + topic + " cần ít nhất 2 partition cho VipOrderPartitioner");
        }

        if (value instanceof Order order && order.isVip()) {
            return PARTITION_VIP;
        }

        if (keyBytes == null) {
            // Không key: chia đều trong các partition KHÔNG phải VIP
            return ThreadLocalRandom.current().nextInt(1, soPartition);
        }

        // Có key: băm trong phạm vi partition 1..n-1, giữ được đảm bảo
        // "cùng key thì cùng partition"
        return 1 + Utils.toPositive(Utils.murmur2(keyBytes)) % (soPartition - 1);
    }

    @Override public void configure(Map<String, ?> configs) { }
    @Override public void close() { }
}
```

```yaml
spring:
  kafka:
    producer:
      properties:
        partitioner.class: com.acme.VipOrderPartitioner
```

Chú ý một điểm dễ nhầm: ở dòng cuối cùng có `soPartition - 1`, nhưng lần này **là đúng** — vì ta cố ý loại partition 0 ra khỏi dải, nên dải còn lại thật sự có `soPartition - 1` phần tử, rồi cộng 1 để dịch về đúng chỗ. Khác hoàn toàn với công thức sai ở đầu bài.

### Bốn lý do chính đáng để viết custom partitioner

| Lý do | Ví dụ cụ thể |
|---|---|
| **Gom dữ liệu liên quan** | Mọi đơn của một khách vào cùng partition để tính tổng chi tiêu không cần join |
| **Cân tải khi key lệch** | Một khách chiếm 40% lưu lượng → tách riêng để không làm nóng một partition |
| **Ưu tiên** | Bucket Priority ở [bài 2](02-uu-tien-message-trong-kafka.md) |
| **Tuân thủ dữ liệu** | Dữ liệu khách EU vào partition nằm trên broker đặt tại EU (kèm `broker.rack`) |

### Khi nào KHÔNG nên viết

> Tài liệu Kafka khuyến nghị rõ: **tốt nhất là không ghi đè hành vi partitioner mặc định.**

Ba lý do:

1. **Partitioner sai làm lệch tải mà không báo lỗi.** Không có cảnh báo nào khi một partition nhận 90% dữ liệu — bạn chỉ phát hiện khi consumer đó lag.
2. **Partitioner chạy trên đường nóng (hot path)** — mọi message đều đi qua. Một lời gọi database hay một `synchronized` trong đó là thảm hoạ hiệu năng.
3. **Đảm bảo thứ tự dễ vỡ.** Nếu logic phụ thuộc trạng thái thay đổi được (ví dụ khách hôm nay VIP, mai hết VIP), thì message của cùng một khách đổi partition → **thứ tự bị phá**.

Điểm 3 là bẫy tinh vi nhất của ví dụ `VipOrderPartitioner` ở trên. Nếu khách rớt hạng VIP giữa chừng, đơn cũ nằm ở P0 còn đơn mới ở P3, và consumer P3 có thể xử lý đơn mới trước khi consumer P0 xử lý xong đơn cũ.

## Cách 3 — consumer đọc partition chỉ định

Mặc định consumer dùng `subscribe()` và để Kafka chia partition. Cách còn lại là `assign()` — **tự gán tường minh**.

```java
// subscribe — Kafka chia, có rebalance tự động
consumer.subscribe(List.of("orders"));

// assign — bạn tự gán, KHÔNG có rebalance, KHÔNG thuộc consumer group
consumer.assign(List.of(
        new TopicPartition("orders", 0),
        new TopicPartition("orders", 1)
));
```

Trong Spring:

```java
@KafkaListener(
    topicPartitions = @TopicPartition(
        topic = "orders",
        partitions = {"0", "1", "2"}
    )
)
public void onVipOrder(Order order) {
    orderService.xuLy(order);
}
```

Đọc từ một offset cụ thể:

```java
@KafkaListener(
    topicPartitions = @TopicPartition(
        topic = "orders",
        partitionOffsets = {
            @PartitionOffset(partition = "0", initialOffset = "1500"),
            @PartitionOffset(partition = "1", initialOffset = "0")
        }
    )
)
public void onOrder(Order order) { ... }
```

### Bảng đánh đổi — đọc kỹ trước khi dùng `assign`

| | `subscribe()` | `assign()` |
|---|---|---|
| Ai chia partition | **Kafka** | **Bạn** |
| Rebalance tự động | **Có** | **Không** |
| Consumer chết thì partition đó | **Được giao cho consumer khác** | **KHÔNG AI NHẬN — dữ liệu tồn đọng** |
| Thêm partition vào topic | Tự động được giao | **Bị bỏ qua hoàn toàn** |
| Có thuộc consumer group không | Có | Không (nhưng vẫn commit offset được nếu đặt `group.id`) |
| Dùng khi | Gần như mọi trường hợp | Ưu tiên theo bucket, công cụ điều tra, xử lý một partition riêng |

Hai dòng in đậm là toàn bộ rủi ro:

```text
   BẪY 1 — không có rebalance
   ══════════════════════════
   Consumer gán cứng P0, P1, P2. Tiến trình chết.
   → P0, P1, P2 KHÔNG ai đọc.
   → Lag tăng vô hạn cho tới khi có người phát hiện và khởi động lại.
   → subscribe() thì partition tự chuyển sang consumer khác trong vài giây.

   BẪY 2 — partition mới bị bỏ quên
   ════════════════════════════════
   Topic tăng từ 3 lên 6 partition.
   Consumer gán cứng {"0","1","2"} → P3, P4, P5 KHÔNG ai đọc.
   → Producer vẫn gửi vào đó bình thường. Dữ liệu tích tụ im lặng.
```

Nếu buộc phải dùng `assign()`, tối thiểu phải có:

- Cảnh báo lag **cho từng partition**, không chỉ cho cả group.
- Kiểm tra lúc khởi động: số partition thật của topic có khớp với danh sách gán không.
- Chạy nhiều bản sao có giám sát, hoặc dùng cơ chế phát hiện chết bên ngoài.

## Cách 4 — seek: nhảy tới vị trí bất kỳ

`seek()` cho phép đọc lại lịch sử hoặc nhảy qua dữ liệu hỏng — công cụ cứu hoả quan trọng nhất khi có sự cố.

```java
@Component
public class OrderConsumer implements ConsumerSeekAware {

    @Override
    public void onPartitionsAssigned(Map<TopicPartition, Long> assignments,
                                     ConsumerSeekCallback callback) {
        // Chạy MỖI LẦN partition được giao (kể cả sau rebalance)
        assignments.forEach((tp, offset) ->
                callback.seekToBeginning(tp.topic(), tp.partition()));
    }

    @KafkaListener(topics = "orders")
    public void onOrder(Order order) { ... }
}
```

Bốn kiểu nhảy:

| Lời gọi | Nhảy tới | Dùng khi |
|---|---|---|
| `seekToBeginning(topic, partition)` | Offset sớm nhất còn giữ | Dựng lại toàn bộ trạng thái từ đầu |
| `seekToEnd(topic, partition)` | Offset mới nhất | Bỏ qua toàn bộ tồn đọng, chỉ xử lý dữ liệu mới |
| `seek(topic, partition, offset)` | Một offset cụ thể | Nhảy qua đúng bản ghi gây lỗi |
| `seekToTimestamp(topic, partition, ts)` | Bản ghi đầu tiên tại/sau mốc thời gian | **Hữu ích nhất khi điều tra sự cố** |

`seekToTimestamp` đáng nói riêng vì đây là thứ bạn dùng lúc 2 giờ sáng:

```java
// "Có sự cố từ 14:30 hôm qua, xử lý lại toàn bộ từ mốc đó"
long moc = LocalDateTime.of(2025, 8, 7, 14, 30)
        .atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
callback.seekToTimestamp(tp.topic(), tp.partition(), moc);
```

Nó hoạt động được nhờ file `.timeindex` đã thấy ở [Phase 20 bài 4](../phase-20-kafka-internals/04-giai-phau-broker-topic-partition-replica.md) — ánh xạ timestamp sang offset.

### Cách an toàn hơn: dùng CLI thay vì sửa code

Với sự cố ở production, thường **không nên** sửa code và triển khai lại. Dùng lệnh:

```bash
# BẮT BUỘC: dừng toàn bộ consumer của group trước, nếu không lệnh sẽ bị từ chối
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group inventory-service --topic orders \
  --reset-offsets --to-datetime 2025-08-07T14:30:00.000 --execute
```

```text
GROUP              TOPIC   PARTITION  NEW-OFFSET
inventory-service  orders  0          18437
inventory-service  orders  1          17902
inventory-service  orders  2          18101
```

Các tuỳ chọn khác:

| Tuỳ chọn | Ý nghĩa |
|---|---|
| `--to-earliest` | Về đầu |
| `--to-latest` | Nhảy tới cuối, bỏ qua tồn đọng |
| `--to-offset 5000` | Tới offset cụ thể |
| `--to-datetime <ISO>` | Tới mốc thời gian |
| `--shift-by -1000` | **Lùi 1000 bản ghi** — hay dùng nhất |
| `--dry-run` | **Chỉ in ra, không thực hiện** — luôn chạy cái này trước |

> **Luôn chạy `--dry-run` trước `--execute`.** Đặt lại offset sai ở production nghĩa là xử lý lại hàng triệu bản ghi, hoặc bỏ qua vĩnh viễn hàng triệu bản ghi. Không có nút hoàn tác.

## Bảng quyết định

| Nhu cầu | Dùng |
|---|---|
| Bình thường, không có yêu cầu đặc biệt | **Key + partitioner mặc định** |
| Cùng khách hàng phải đúng thứ tự | **Key = customerId**, không cần gì thêm |
| Một key chiếm quá nhiều lưu lượng | **Custom partitioner** tách riêng |
| Ưu tiên theo mức | **Bucket Priority** ([bài 2](02-uu-tien-message-trong-kafka.md)) |
| Công cụ nội bộ đọc một partition để điều tra | **`assign()`** — chấp nhận không rebalance |
| Đọc lại lịch sử một lần | **CLI `--reset-offsets`**, không sửa code |
| Bỏ qua bản ghi hỏng đang chặn partition | **CLI `--shift-by 1`** hoặc DLQ ([Phase 13](../phase-13-error-handling/02-retryable-nonretryable-dlq.md)) |
| Cần xử lý lại từ một mốc thời gian | **`--to-datetime`** hoặc `seekToTimestamp` |

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng công thức `% (numPartitions - 1)` | **Partition cuối vĩnh viễn rỗng**, mất năng lực và consumer ngồi không |
| Dùng `Math.abs()` thay `Utils.toPositive()` | Sập với `Integer.MIN_VALUE` |
| Hard-code số partition trong code | Tăng partition là logic sai âm thầm |
| `assign()` mà không giám sát lag từng partition | Consumer chết → **partition đó không ai đọc** |
| `assign()` rồi tăng partition topic | Partition mới **bị bỏ quên hoàn toàn** |
| Partitioner phụ thuộc trạng thái thay đổi được (VIP/thường) | Cùng key đổi partition → **thứ tự bị phá** |
| Gọi I/O trong partitioner | Nằm trên đường nóng — giết thông lượng |
| `--reset-offsets` mà chưa dừng consumer | Lệnh bị từ chối, hoặc kết quả khó lường |
| `--execute` mà không `--dry-run` trước | Xử lý lại hoặc bỏ qua hàng triệu bản ghi, không hoàn tác được |

## Tóm tắt bài 4

- Bốn đường vào partition theo thứ tự ưu tiên: **partition tường minh → custom partitioner → băm key → sticky (key null)**.
- **Đính chính công thức**: nhiều tài liệu ghi `Math.abs(murmur2(key)) % (numPartitions - 1)`. **Sai hai chỗ** — dấu `- 1` làm partition cuối vĩnh viễn rỗng, và `Math.abs` sập với `Integer.MIN_VALUE`. Đúng là `Utils.toPositive(Utils.murmur2(keyBytes)) % numPartitions`.
- **Chỉ định partition tường minh** thì đơn giản nhưng đừng hard-code số partition — đọc bằng `partitionsFor()`.
- **Custom partitioner** hợp lý cho: gom dữ liệu liên quan, cân tải khi key lệch, ưu tiên, tuân thủ dữ liệu theo vùng. Nhưng Kafka khuyến nghị **tốt nhất là không ghi đè** — partitioner sai làm lệch tải mà không báo lỗi, nằm trên đường nóng, và dễ phá vỡ đảm bảo thứ tự nếu phụ thuộc trạng thái thay đổi được.
- **`assign()` đánh đổi rất nặng**: mất rebalance tự động (consumer chết thì partition đó **không ai đọc**) và **bỏ quên partition mới thêm**. Chỉ dùng khi thật sự cần, và phải giám sát lag theo từng partition.
- **`seek`** có bốn kiểu; `seekToTimestamp` là công cụ điều tra sự cố mạnh nhất, dựa trên file `.timeindex`.
- Ở production, ưu tiên **CLI `--reset-offsets`** hơn là sửa code. Phải **dừng consumer trước**, và **luôn `--dry-run` trước `--execute`** — không có nút hoàn tác.

**Bài kế tiếp** → [Bài 5: Bao nhiêu partition là đủ — giới hạn vật lý và công thức tính](05-gioi-han-vat-ly-cua-partition.md)

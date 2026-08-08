# Bài 3: Offset commit toàn tập — commitSync, commitAsync và 7 AckMode của Spring

Offset commit là chỗ **quyết định hệ thống của bạn mất message hay xử lý trùng message**. Không có lựa chọn thứ ba: Kafka không cho bạn "đúng một lần" miễn phí.

[Phase 12](../phase-12-reliability/01-acknowledgement-intro.md) đã giới thiệu ack ở tầng Spring Cloud Stream. Bài này đi xuống tầng dưới — API thô của Kafka consumer — rồi đi lên lại để xem Spring Kafka gói nó thành **bảy chiến lược** như thế nào, và chọn cái nào cho tình huống nào.

## Offset nào được commit — chi tiết mà 99% người bỏ qua

Câu hỏi tưởng thừa: khi bạn gọi `commitSync()`, Kafka ghi lại số nào?

```text
   poll() trả về các bản ghi có offset: 100, 101, 102, 103, 104
                                                            ▲
                                              offset cuối cùng nhận được

   commitSync() ghi vào __consumer_offsets:   105
                                               ▲
                              KHÔNG phải 104 — mà là 104 + 1
```

> **Offset được commit là "offset kế tiếp cần đọc", không phải "offset cuối cùng đã đọc".**

Vì sao thiết kế vậy: khi consumer khởi động lại, nó chỉ cần đọc thẳng từ số đã commit, không phải cộng trừ gì. Nếu commit 104 thì lúc khởi động lại phải nhớ "+1", và chỗ nào quên +1 là xử lý trùng một bản ghi.

Chi tiết này chỉ quan trọng khi bạn **tự commit offset cụ thể** — và đó là lúc lỗi hay xảy ra nhất:

```java
// SAI — sẽ xử lý lại chính bản ghi này sau khi khởi động lại
currentOffsets.put(new TopicPartition(r.topic(), r.partition()),
                   new OffsetAndMetadata(r.offset()));

// ĐÚNG
currentOffsets.put(new TopicPartition(r.topic(), r.partition()),
                   new OffsetAndMetadata(r.offset() + 1));
```

## Cách 1 — commit tự động

Cách đơn giản nhất, và là cách mặc định của Kafka consumer thuần:

```java
props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "true");
props.put(ConsumerConfig.AUTO_COMMIT_INTERVAL_MS_CONFIG, "5000");   // mặc định
```

Cơ chế thật — và đây là chỗ hay hiểu sai:

```text
   Commit tự động KHÔNG chạy bằng một luồng đếm giờ riêng.
   Nó được KÍCH HOẠT BỞI CHÍNH poll().

   Mỗi lần gọi poll(), consumer tự hỏi:
     "Đã quá 5 giây kể từ lần commit trước chưa?"
       Rồi  → commit offset của lần poll TRƯỚC ĐÓ
       Chưa → không làm gì
```

Hệ quả rất quan trọng: **nếu bạn không gọi `poll()` thì không có commit nào xảy ra**, dù đã quá 5 giây.

### Vì sao commit tự động luôn có thể sinh bản trùng

```text
   t=0s   commit tự động chạy → ghi offset 1000
   t=1s   xử lý bản ghi 1000, 1001, ..., 1300
   t=3s   CONSUMER CHẾT

   → Offset đã commit vẫn là 1000
   → Sau rebalance, consumer khác đọc lại từ 1000
   → 300 bản ghi được xử lý LẦN THỨ HAI
```

Giảm `auto.commit.interval.ms` xuống 1 giây thì cửa sổ trùng nhỏ hơn, nhưng **không bao giờ về 0**. Đây là giới hạn cấu trúc, không phải chuyện tinh chỉnh.

### Bẫy nguy hiểm hơn: mất message

Nhiều người tưởng commit tự động chỉ gây trùng. Sai — nó **có thể làm mất message**:

```text
   poll() trả về 500 bản ghi (offset 1000..1499)
        │
        ├─ xử lý 1000..1200  ✓
        ├─ bản ghi 1201 ném exception → code bắt và LOG rồi ĐI TIẾP
        │                                (hoặc `break` ra khỏi vòng lặp)
        └─ gọi poll() lần nữa
                │
                ▼
        poll() COMMIT offset 1500 — vì đó là offset cuối của lần poll trước

   → Bản ghi 1201..1499 CHƯA HỀ ĐƯỢC XỬ LÝ nhưng đã bị đánh dấu xong.
   → MẤT VĨNH VIỄN, im lặng.
```

> **Quy tắc sống còn khi dùng commit tự động**: phải xử lý **hết sạch** mọi bản ghi của lần poll trước khi gọi `poll()` lần tiếp theo. Thoát vòng lặp sớm hay nuốt exception đều làm mất dữ liệu. Lưu ý thêm: **`close()` cũng tự commit**.

## Cách 2 — commitSync

```java
props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");

while (dangChay) {
    ConsumerRecords<Long, Order> records = consumer.poll(Duration.ofSeconds(10));
    for (ConsumerRecord<Long, Order> r : records) {
        orderService.xuLy(r.value());
    }
    consumer.commitSync();          // commit SAU KHI xử lý xong toàn bộ lô
}
```

| Đặc điểm | Chi tiết |
|---|---|
| Chặn luồng | **Có** — chờ broker trả lời |
| Tự thử lại | **Có** — thử tới khi thành công hoặc gặp lỗi không thử lại được |
| Ném exception khi lỗi | **Có** |
| Đảm bảo | **Ít nhất một lần** (at-least-once) |

Điểm cần nhớ: `commitSync()` không tham số sẽ commit **offset cuối của lần poll gần nhất**. Nên gọi nó **giữa chừng** khi chưa xử lý hết lô là tự bắn vào chân:

```java
// SAI — commit cả lô trong khi mới xử lý được một bản ghi
for (ConsumerRecord<Long, Order> r : records) {
    orderService.xuLy(r.value());
    consumer.commitSync();          // ← commit offset CUỐI LÔ, không phải offset của r
}
```

Vòng lặp này commit offset cuối lô ngay từ bản ghi đầu tiên. Chết ở bản ghi thứ hai là mất toàn bộ phần còn lại.

## Cách 3 — commitAsync và cái bẫy thứ tự

`commitSync()` chặn luồng, làm giảm thông lượng. `commitAsync()` gửi rồi đi tiếp:

```java
consumer.commitAsync();             // không chờ broker trả lời
```

Nhanh hơn, nhưng có một khác biệt then chốt: **`commitAsync()` KHÔNG tự thử lại.**

Và đây là lý do — không phải vì lười, mà vì thử lại sẽ **sai**:

```text
   t=0    Gửi commit offset 2000
          → mạng chập, broker KHÔNG nhận được, không phản hồi

   t=1    Đã xử lý xong lô kế tiếp
          Gửi commit offset 3000 → THÀNH CÔNG

   t=2    Phản hồi lỗi của commit 2000 mới về tới nơi
          NẾU thử lại → ghi đè offset đã commit từ 3000 XUỐNG 2000
                                                        ▲
                                            OFFSET ĐI LÙI!

   t=3    Rebalance xảy ra
          → consumer đọc lại từ 2000
          → 1000 bản ghi đã xử lý bị xử lý LẠI
```

Kafka chọn "không thử lại" thay vì "thử lại và có thể làm offset đi lùi". Đó là lựa chọn đúng.

### Nếu vẫn muốn thử lại — dùng số thứ tự tăng dần

```java
private final AtomicLong soThuTuCommit = new AtomicLong(0);

private void commitVoiKhaNangThuLai(KafkaConsumer<Long, Order> consumer) {
    long soHienTai = soThuTuCommit.incrementAndGet();

    consumer.commitAsync((offsets, ex) -> {
        if (ex == null) return;

        // Chỉ thử lại nếu KHÔNG có commit nào mới hơn được gửi đi sau lần này.
        // Nếu đã có, commit mới hơn sẽ tự đóng vai trò "thử lại" — và đúng hơn.
        if (soHienTai == soThuTuCommit.get()) {
            log.warn("Commit lỗi, thử lại. offsets={}", offsets, ex);
            consumer.commitAsync();
        } else {
            log.warn("Commit lỗi nhưng đã có commit mới hơn, BỎ QUA. offsets={}", offsets);
        }
    });
}
```

Logic: nếu `soThuTuCommit` đã tăng lên sau lần gọi này, nghĩa là đã có commit mới hơn được gửi → **không thử lại**, vì commit mới hơn đã bao trùm.

## Mẫu chuẩn — kết hợp async và sync

Đây là mẫu được khuyến nghị trong sách *Kafka: The Definitive Guide*, và đáng thuộc lòng:

```java
try {
    while (dangChay) {
        ConsumerRecords<Long, Order> records = consumer.poll(Duration.ofSeconds(10));
        for (ConsumerRecord<Long, Order> r : records) {
            orderService.xuLy(r.value());
        }
        // Lúc chạy bình thường: dùng ASYNC cho nhanh.
        // Lần commit sau tự đóng vai trò "thử lại" nếu lần này hỏng.
        consumer.commitAsync();
    }
} catch (WakeupException e) {
    // tín hiệu dừng — không phải lỗi
} catch (Exception e) {
    log.error("Lỗi ngoài dự kiến", e);
} finally {
    try {
        // Lúc ĐÓNG: dùng SYNC, vì sẽ KHÔNG CÒN "lần commit sau" nào để cứu.
        // commitSync tự thử lại tới khi chắc chắn thành công.
        consumer.commitSync();
    } finally {
        consumer.close();
    }
}
```

Toàn bộ tinh thần nằm ở hai dòng bình luận:

| Giai đoạn | Dùng | Lý do |
|---|---|---|
| Chạy bình thường | `commitAsync()` | Nhanh; commit sau đóng vai trò thử lại |
| Sắp đóng / sắp rebalance | `commitSync()` | **Không còn "commit sau"** — phải chắc chắn |

## Commit offset cụ thể — khi lô quá lớn

Nếu một lần poll trả về 500 bản ghi và mỗi bản mất 1 giây, đợi hết lô rồi mới commit là quá rủi ro. Giải pháp: tự quản offset và commit theo mốc.

```java
Map<TopicPartition, OffsetAndMetadata> offsetHienTai = new HashMap<>();
int daXuLy = 0;

while (dangChay) {
    ConsumerRecords<Long, Order> records = consumer.poll(Duration.ofSeconds(10));

    for (ConsumerRecord<Long, Order> r : records) {
        orderService.xuLy(r.value());
        daXuLy++;

        offsetHienTai.put(
            new TopicPartition(r.topic(), r.partition()),
            new OffsetAndMetadata(r.offset() + 1)      // +1 — xem đầu bài
        );

        if (daXuLy % 50 == 0) {
            consumer.commitSync(offsetHienTai);        // commit ĐÚNG những gì đã xử lý
        }
    }
}
```

Khác biệt so với `commitSync()` không tham số: **bạn quyết định offset nào được commit, không phải Kafka.** Chết giữa chừng thì chỉ mất tối đa 50 bản ghi công sức, không phải 500.

Ba điểm cần chú ý khi dùng cách này:

| Điểm | Vì sao |
|---|---|
| Phải cộng `+ 1` | Nếu không sẽ xử lý lại chính bản ghi đó |
| `Map` phải theo `TopicPartition` | Một lần poll có thể trả về bản ghi từ **nhiều partition** |
| Nên xoá `Map` khi rebalance | Partition đã bị lấy đi mà vẫn commit sẽ ném `CommitFailedException` |

Điểm cuối xử lý bằng `ConsumerRebalanceListener`:

```java
consumer.subscribe(List.of("orders"), new ConsumerRebalanceListener() {
    @Override
    public void onPartitionsRevoked(Collection<TopicPartition> partitions) {
        // Commit LẦN CUỐI trước khi partition bị lấy đi — chống xử lý trùng
        consumer.commitSync(offsetHienTai);
    }
    @Override
    public void onPartitionsAssigned(Collection<TopicPartition> partitions) {
        offsetHienTai.clear();
    }
});
```

`onPartitionsRevoked` là móc quan trọng bậc nhất mà rất ít người dùng. Không có nó, mọi lần rebalance đều sinh một cụm bản ghi trùng.

## Spring Kafka — bảy AckMode

Spring Kafka đặt `enable.auto.commit=false` **mặc định** (từ phiên bản 2.3). Framework tự quản việc commit, và cho bạn bảy chiến lược.

> Lưu ý phân biệt: đây là `AckMode` của **Spring Kafka** (`spring.kafka.listener.ack-mode`). [Phase 12](../phase-12-reliability/02-manual-ack-nack.md) nói về `ack-mode` ở tầng **Spring Cloud Stream binder** (`spring.cloud.stream.kafka.bindings.*.consumer.ack-mode`) — cùng tên nhưng khác chỗ đặt.

```yaml
spring:
  kafka:
    listener:
      ack-mode: RECORD        # mặc định là BATCH
```

| AckMode | Commit khi nào | Nguy cơ trùng | Thông lượng | Dùng cho |
|---|---|---|---|---|
| **RECORD** | Sau **mỗi** bản ghi xử lý xong | **Thấp nhất** (tối đa 1 bản) | **Thấp nhất** | Nghiệp vụ quan trọng, mỗi bản ghi đắt giá |
| **BATCH** *(mặc định)* | Sau khi xử lý hết lô của một lần `poll()` | Bằng kích thước lô | Cao | Mặc định hợp lý cho phần lớn trường hợp |
| **TIME** | Khi đã quá `ackTime` từ lần commit trước | Theo thời gian | Cao | Luồng đều, chấp nhận trùng theo cửa sổ thời gian |
| **COUNT** | Khi đã đủ `ackCount` bản ghi | Bằng `ackCount` | Cao | Kiểm soát trùng bằng con số cụ thể |
| **COUNT_TIME** | Đủ `ackCount` **hoặc** quá `ackTime` | Nhỏ hơn hai cái trên | Cao | Luồng không đều — an toàn hơn TIME hay COUNT đơn lẻ |
| **MANUAL** | Bạn gọi `ack.acknowledge()`, Spring **gom lại** rồi commit theo lô | Bạn kiểm soát | Cao | Cần kiểm soát mà vẫn muốn nhanh |
| **MANUAL_IMMEDIATE** | Bạn gọi `ack.acknowledge()`, commit **ngay lập tức** | **Bạn kiểm soát, thấp nhất** | Thấp | Cần chắc chắn từng bản ghi đã được ghi nhận |

### MANUAL và MANUAL_IMMEDIATE khác nhau thế nào

Đây là cặp hay bị nhầm nhất:

```text
   MANUAL
   ══════
   ack.acknowledge()  →  Spring ĐƯA VÀO HÀNG ĐỢI nội bộ
   ack.acknowledge()  →  đưa vào hàng đợi
   ack.acknowledge()  →  đưa vào hàng đợi
   ...hết lô của lần poll →  Spring commit MỘT LẦN cho cả cụm

   → Nhanh. Nhưng chết giữa chừng thì mất phần đã ack chưa commit.


   MANUAL_IMMEDIATE
   ════════════════
   ack.acknowledge()  →  COMMIT NGAY về Kafka
   ack.acknowledge()  →  COMMIT NGAY
   ack.acknowledge()  →  COMMIT NGAY

   → Chậm hơn (mỗi ack là một lần đi mạng).
   → Nhưng ack xong là chắc chắn đã ghi nhận.
```

```java
@KafkaListener(topics = "orders")
public void onOrder(Order order, Acknowledgment ack) {
    try {
        orderService.xuLy(order);
        ack.acknowledge();                  // chỉ ack KHI đã xử lý thành công
    } catch (LoiKhongThuLaiDuoc e) {
        log.error("Bỏ qua bản ghi hỏng: {}", order.getId(), e);
        ack.acknowledge();                  // ack để đi tiếp, đã đẩy sang DLQ
    }
    // Ném exception mà KHÔNG ack → Spring xử lý theo error handler
}
```

### Chọn AckMode nào

```text
   Mỗi bản ghi rất quan trọng, xử lý trùng gây thiệt hại thật
       (trừ tiền, gửi email, trừ kho không idempotent)
       → RECORD hoặc MANUAL_IMMEDIATE

   Xử lý đã idempotent, ưu tiên thông lượng
       → BATCH (mặc định) — hợp lý cho hầu hết trường hợp

   Cần logic quyết định khi nào coi là xong (ví dụ ghi database rồi mới ack)
       → MANUAL

   Luồng dữ liệu không đều, lúc dồn dập lúc thưa
       → COUNT_TIME
```

## Bảng nối: ba mức đảm bảo

Toàn bộ bài này quy về một bảng:

| Thứ tự thao tác | Đảm bảo | Rủi ro | Cách dùng |
|---|---|---|---|
| **Commit → xử lý** | Nhiều nhất một lần (at-most-once) | **Mất message** | `enable.auto.commit=true` với interval ngắn, hoặc ack trước khi xử lý |
| **Xử lý → commit** | **Ít nhất một lần** (at-least-once) | **Trùng message** | Mặc định, và gần như luôn đúng |
| Xử lý + commit trong **cùng một transaction** | Đúng một lần **trong phạm vi Kafka** | Chậm hơn, phức tạp hơn | Kafka transaction — xem [Phase 14](../phase-14-transactions/01-transactions-intro.md) |

Điểm cần nhấn: dòng thứ ba **chỉ đúng khi cả nguồn lẫn đích đều là Kafka**. Nếu consumer ghi vào database bên ngoài thì transaction của Kafka không bao trùm được, và bạn quay về "ít nhất một lần" + **consumer idempotent**:

```java
@Transactional
public void xuLy(Order order) {
    String eventId = order.getId() + ":" + order.getVersion();
    if (daXuLyRepository.existsById(eventId)) {
        return;                                  // đã xử lý, bỏ qua
    }
    khoService.truKho(order);
    daXuLyRepository.save(new DaXuLy(eventId));  // CÙNG transaction với việc nghiệp vụ
}
```

## Đính chính từ tài liệu nguồn

Tài liệu gốc viết: *"Với cấu hình mặc định này, khi gặp lỗi Spring Kafka sẽ thử lại cho đến khi thành công hoặc đạt tới giới hạn thời gian chờ 100ms"*.

Câu này **nhầm vai trò của hai tham số**:

| Tham số | Mặc định | Vai trò thật |
|---|---|---|
| `retries` | `2147483647` | Số lần thử lại tối đa — gần như vô hạn |
| `retry.backoff.ms` | `100` | **Thời gian chờ GIỮA hai lần thử lại**, không phải giới hạn tổng |
| **`delivery.timeout.ms`** | **`120000`** | **Trần thật sự** — quá 2 phút thì bỏ cuộc dù `retries` còn |

```text
   Thử lần 1 → lỗi → chờ 100 ms
   Thử lần 2 → lỗi → chờ 100 ms
   Thử lần 3 → lỗi → chờ 100 ms
   ...lặp lại...
   ĐẾN KHI: thành công, HOẶC tổng thời gian vượt delivery.timeout.ms (120 giây)
                              ▲
                     ĐÂY mới là giới hạn, không phải 100 ms
```

Vì sao chi tiết này quan trọng: `delivery.timeout.ms` là tham số **quyết định ứng dụng có sống sót qua một lần failover hay không**. Failover mất khoảng 9–15 giây ([Phase 20 bài 9](../phase-20-kafka-internals/09-failover-thuc-hanh-va-so-lieu.md)); mặc định 120 giây thừa sức che. Nhưng nếu ai đó "tối ưu" nó xuống 5 giây thì mọi lần broker chết là một loạt exception ném vào ứng dụng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Commit offset `r.offset()` thay vì `r.offset() + 1` | Bản ghi cuối bị xử lý hai lần mỗi lần khởi động lại | Luôn `+ 1` |
| `commitSync()` trong vòng lặp từng bản ghi | Commit offset **cuối lô** ngay từ bản đầu → mất phần còn lại nếu chết | Dùng `commitSync(offsetHienTai)` với map |
| Thử lại `commitAsync()` vô điều kiện | **Offset đi lùi** → xử lý trùng hàng loạt | Dùng số thứ tự tăng dần, hoặc đừng thử lại |
| Chỉ dùng `commitAsync()`, kể cả lúc đóng | Commit cuối cùng hỏng mà không ai cứu | `commitAsync` lúc chạy, **`commitSync` trong `finally`** |
| Commit tự động + nuốt exception / `break` sớm | **Mất message im lặng** | Xử lý hết lô, hoặc tắt commit tự động |
| Không cài `onPartitionsRevoked` | Mỗi lần rebalance sinh một cụm bản ghi trùng | Commit lần cuối trong `onPartitionsRevoked` |
| Nhầm `retry.backoff.ms` là giới hạn tổng | Hiểu sai hành vi khi failover | Trần thật là `delivery.timeout.ms` |
| Dùng `MANUAL` mà tưởng commit ngay | Chết giữa chừng mất phần đã ack | Cần commit ngay thì dùng `MANUAL_IMMEDIATE` |
| Tin rằng transaction Kafka bao trùm database | Vẫn trùng dữ liệu ở database | Consumer phải **idempotent** |

## Tóm tắt bài 3

- **Offset được commit là "offset kế tiếp cần đọc"** — tức `offset cuối cùng + 1`. Quên `+ 1` là xử lý trùng một bản ghi mỗi lần khởi động lại.
- **Commit tự động được kích hoạt bởi `poll()`**, không phải bởi đồng hồ riêng. Nó **luôn** có thể sinh bản trùng, và **có thể làm mất message** nếu bạn thoát vòng lặp sớm hoặc nuốt exception.
- **`commitSync()`** chặn luồng, **tự thử lại**, ném exception khi lỗi. **`commitAsync()`** nhanh hơn nhưng **cố ý không thử lại** — vì thử lại có thể làm **offset đi lùi**.
- Mẫu chuẩn: **`commitAsync()` lúc chạy bình thường, `commitSync()` trong khối `finally` lúc đóng** — vì lúc đóng không còn "commit sau" để cứu.
- Với lô lớn, tự quản `Map<TopicPartition, OffsetAndMetadata>` và commit theo mốc. Nhớ cài **`onPartitionsRevoked`** để commit lần cuối trước rebalance — móc quan trọng mà rất ít người dùng.
- Spring Kafka tắt commit tự động **mặc định** và cho **bảy AckMode**. Cặp hay nhầm nhất: **MANUAL gom lại rồi commit theo lô**, **MANUAL_IMMEDIATE commit ngay**.
- Chọn AckMode: **RECORD / MANUAL_IMMEDIATE** khi mỗi bản ghi đắt giá; **BATCH** (mặc định) khi xử lý đã idempotent; **COUNT_TIME** khi luồng không đều.
- Ba mức đảm bảo do **thứ tự thao tác** quyết định: commit trước = mất message; xử lý trước = trùng message; transaction = đúng một lần **chỉ trong phạm vi Kafka**.
- **Đính chính**: `retry.backoff.ms=100` là **thời gian chờ giữa hai lần thử**, không phải giới hạn tổng. Trần thật là **`delivery.timeout.ms=120000`**.

**Bài kế tiếp** → [Bài 4: Gửi và đọc partition chỉ định — custom partitioner, assign và seek](04-gui-va-doc-partition-chi-dinh.md)

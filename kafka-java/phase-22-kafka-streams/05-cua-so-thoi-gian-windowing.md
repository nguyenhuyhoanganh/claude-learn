# Bài 5: Cửa sổ thời gian — tumbling, hopping, sliding, session

Yêu cầu nghiệp vụ: *"cảnh báo nếu một thẻ tín dụng có quá 5 giao dịch trong 1 phút"*.

Ở [bài 4](04-trang-thai-state-store-va-changelog.md), `count()` đếm **từ đầu tới mãi mãi** — con số chỉ tăng, không bao giờ giảm. Nó không trả lời được câu hỏi có chữ *"trong 1 phút"*.

Cần thêm chiều thời gian. Và ngay khi thêm chiều đó, một câu hỏi tưởng đơn giản trở nên rất khó: **"trong 1 phút" là theo đồng hồ nào?**

## Ba loại thời gian — chọn sai là sai kết quả

```text
   ┌─────────────────────────────────────────────────────────────┐
   │ EVENT TIME (thời gian sự kiện)                              │
   │ Lúc chuyện THẬT SỰ XẢY RA ở thế giới thực.                  │
   │ Ví dụ: người dùng quẹt thẻ lúc 14:30:22                     │
   ├─────────────────────────────────────────────────────────────┤
   │ INGESTION TIME (thời gian nạp)                              │
   │ Lúc broker Kafka GHI bản ghi vào log.                       │
   │ Ví dụ: 14:30:25 (chậm 3 giây vì mạng)                       │
   ├─────────────────────────────────────────────────────────────┤
   │ PROCESSING TIME (thời gian xử lý)                           │
   │ Lúc ứng dụng Streams ĐỌC được bản ghi.                      │
   │ Ví dụ: 14:35:00 (chậm 5 phút vì consumer đang tồn đọng)     │
   └─────────────────────────────────────────────────────────────┘
```

Vì sao khác biệt này quan trọng:

```text
   Điện thoại người dùng MẤT MẠNG lúc 14:30, giao dịch lưu offline.
   14:50 có mạng lại → gửi lên.

   Theo EVENT TIME:      giao dịch thuộc cửa sổ 14:30–14:31   ← ĐÚNG
   Theo PROCESSING TIME: giao dịch thuộc cửa sổ 14:50–14:51   ← SAI
```

Với phát hiện gian lận, đối soát tài chính, hay bất cứ thứ gì liên quan tới thứ tự nghiệp vụ, **event time là lựa chọn duy nhất đúng**.

**Kafka Streams mặc định dùng event time**, lấy từ trường timestamp của bản ghi. Nhưng có một chi tiết ẩn:

```properties
# Cấu hình BROKER, đặt ở cấp topic
log.message.timestamp.type=CreateTime      # mặc định: timestamp do PRODUCER đặt
# hoặc
log.message.timestamp.type=LogAppendTime   # timestamp do BROKER đặt khi ghi
```

| Giá trị | Timestamp là gì | Kết quả |
|---|---|---|
| `CreateTime` (mặc định) | Lúc producer tạo bản ghi | **Event time** — đúng thứ ta muốn |
| `LogAppendTime` | Lúc broker ghi vào log | **Ingestion time** — mất khả năng xử lý sự kiện tới muộn |

> **Bẫy**: ai đó đặt `LogAppendTime` cho topic (thường vì lý do vận hành nào đó) sẽ **âm thầm vô hiệu hoá** toàn bộ ngữ nghĩa event time của ứng dụng Streams. Không có cảnh báo.

Nếu timestamp nghiệp vụ nằm **trong payload** chứ không phải header, hãy khai báo bộ trích xuất riêng:

```java
public class OrderTimestampExtractor implements TimestampExtractor {
    @Override
    public long extract(ConsumerRecord<Object, Object> record, long partitionTime) {
        if (record.value() instanceof Order order && order.getOccurredAt() != null) {
            return order.getOccurredAt().toEpochMilli();
        }
        return partitionTime;      // dự phòng — KHÔNG trả về -1, sẽ bị bỏ bản ghi
    }
}
```

```properties
default.timestamp.extractor=com.acme.OrderTimestampExtractor
```

## Bốn loại cửa sổ

### 1. Tumbling — cửa sổ lăn, không chồng lấn

```text
   Kích thước 5 phút, KHÔNG chồng lấn, KHÔNG hở

   10:00────10:05────10:10────10:15────10:20
     │  W1   │  W2    │  W3    │  W4    │
     └───────┴────────┴────────┴────────┘

   Mỗi bản ghi thuộc ĐÚNG MỘT cửa sổ.
```

```java
KTable<Windowed<String>, Long> demTheoPhut = transactions
        .groupByKey()
        .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(1)))
        .count();
```

Dùng cho: báo cáo theo khung giờ cố định, đếm theo phút/giờ/ngày, chỉ số vận hành.

### 2. Hopping — cửa sổ nhảy, có chồng lấn

```text
   Kích thước 5 phút, nhảy mỗi 1 phút → mỗi bản ghi thuộc 5 CỬA SỔ

   10:00─────────10:05
    10:01─────────10:06
     10:02─────────10:07
      10:03─────────10:08
       10:04─────────10:09
```

```java
.windowedBy(TimeWindows
        .ofSizeWithNoGrace(Duration.ofMinutes(5))
        .advanceBy(Duration.ofMinutes(1)))
```

Dùng cho: trung bình trượt, xu hướng mượt, cảnh báo nhạy.

> **Cảnh báo chi phí**: số cửa sổ mỗi bản ghi thuộc về = `kích thước ÷ bước nhảy`. Cửa sổ 1 giờ nhảy mỗi 1 phút = **60 cửa sổ cho mỗi bản ghi** → state store phình 60 lần, lưu lượng changelog gấp 60 lần. Đây là cách dễ nhất để làm sập một ứng dụng Kafka Streams.

### 3. Sliding — cửa sổ trượt theo sự kiện

```text
   Tumbling/Hopping: ranh giới CỐ ĐỊNH theo đồng hồ
   Sliding:          cửa sổ chỉ SINH RA khi có sự kiện,
                     và chỉ chứa các sự kiện cách nhau ≤ khoảng cho phép
```

```java
.windowedBy(SlidingWindows.ofTimeDifferenceWithNoGrace(Duration.ofMinutes(5)))
```

Khác biệt then chốt: sliding **chỉ tạo cửa sổ ở nơi thật sự có dữ liệu**, nên hiệu quả hơn hopping rất nhiều khi cần cùng độ chính xác.

```text
   Câu hỏi: "có 5 giao dịch nào trong BẤT KỲ khoảng 5 phút nào không?"

   Hopping (nhảy 10 giây): 30 cửa sổ mỗi bản ghi → tốn kém
   Sliding:                chỉ tạo cửa sổ quanh sự kiện thật → rẻ hơn nhiều
                           và KHÔNG bỏ sót trường hợp nào
```

Dùng cho: phát hiện gian lận, phát hiện bất thường — nơi câu hỏi là *"trong bất kỳ khoảng N phút nào"* chứ không phải *"trong khung giờ chẵn"*.

### 4. Session — cửa sổ phiên, ranh giới do dữ liệu quyết định

```text
   Khoảng tĩnh (inactivity gap) = 30 phút

   Sự kiện:  ●  ●  ●        ●  ●              ●  ●  ●
             └─ phiên 1 ─┘  └phiên 2┘         └─ phiên 3 ─┘
                          ▲              ▲
                   hở > 30 phút    hở > 30 phút → cắt phiên mới

   Cửa sổ KHÔNG có kích thước cố định.
   Nó dài bao lâu là do HÀNH VI người dùng quyết định.
```

```java
KTable<Windowed<String>, Long> phienDuyetWeb = pageViews
        .groupByKey()
        .windowedBy(SessionWindows.ofInactivityGapWithNoGrace(Duration.ofMinutes(30)))
        .count();
```

Dùng cho: phiên duyệt web, phiên chơi game, hành trình người dùng — bất cứ thứ gì mà "một lần dùng" không có độ dài cố định.

> **Đặc điểm riêng của session window**: hai phiên có thể **hợp nhất** khi một sự kiện tới muộn lấp vào khoảng hở giữa chúng. Kafka Streams xử lý bằng cách phát ra tombstone xoá hai phiên cũ rồi phát ra phiên mới đã hợp nhất. Consumer hạ nguồn phải chịu được điều này.

### Bảng chọn

| Loại | Kích thước | Chồng lấn | Chi phí | Dùng cho |
|---|---|---|---|---|
| **Tumbling** | Cố định | Không | **Thấp nhất** | Báo cáo theo khung giờ |
| **Hopping** | Cố định | **Có** | **Cao** (nhân theo số cửa sổ) | Trung bình trượt |
| **Sliding** | Cố định | Có, nhưng chỉ quanh dữ liệu | Trung bình | Phát hiện bất thường |
| **Session** | **Động** | Không | Trung bình | Phân tích hành vi người dùng |

## Sự kiện tới muộn và grace period

Đây là phần khó nhất của windowing, và cũng là phần sinh ra nhiều lỗi nhất.

### Vấn đề

```text
   Cửa sổ 10:00–10:05 (theo event time)

   10:05:01  Kafka Streams thấy một bản ghi có timestamp 10:05:30
             → "cửa sổ 10:00–10:05 chắc xong rồi" → phát ra kết quả

   10:05:40  MỘT BẢN GHI TỚI MUỘN với timestamp 10:04:55
             → nó THUỘC cửa sổ đã phát ra rồi!
             → làm gì bây giờ?
```

### Grace period — khoảng ân hạn

```java
.windowedBy(TimeWindows
        .ofSizeAndGrace(Duration.ofMinutes(5), Duration.ofMinutes(1)))
//                                              ▲
//                             giữ cửa sổ mở thêm 1 phút để đón bản ghi muộn
```

```text
   ┌────────────────────────────────────────────────────────────┐
   │  Cửa sổ 10:00–10:05, grace = 1 phút                        │
   │                                                             │
   │  10:00────────10:05────────10:06                            │
   │    │  cửa sổ    │  ân hạn   │                               │
   │    └────────────┴───────────┘                               │
   │                              ▲                              │
   │              Sau mốc này, bản ghi thuộc cửa sổ đó bị BỎ QUA │
   │              (im lặng — chỉ tăng một chỉ số)                │
   └────────────────────────────────────────────────────────────┘
```

Đánh đổi rất rõ ràng:

| Grace dài | Grace ngắn |
|---|---|
| Bắt được nhiều sự kiện tới muộn hơn | Bỏ sót sự kiện tới muộn |
| **Kết quả cuối ra chậm hơn** | Kết quả ra sớm |
| **State store giữ nhiều cửa sổ hơn** → tốn bộ nhớ | Ít tốn hơn |

> **Thay đổi từ Kafka 3.0**: mặc định grace **đổi từ 24 giờ xuống 0**. Trước đây `TimeWindows.of(...)` ngầm cho 24 giờ ân hạn; giờ phải khai báo tường minh bằng `ofSizeAndGrace(...)` hoặc `ofSizeWithNoGrace(...)`. **Nâng cấp Kafka mà không sửa code sẽ khiến sự kiện tới muộn bị bỏ im lặng.** Đây là một trong những thay đổi gây bất ngờ nhất khi nâng cấp.

### Đo mức độ tới muộn thật của hệ thống

Đừng đoán grace period — hãy đo:

```java
orders.peek((key, order) -> {
    long treMs = System.currentTimeMillis() - order.getOccurredAt().toEpochMilli();
    metrics.recordLateness(treMs);
});
```

Rồi đặt `grace = p99 của độ trễ`. Với hệ thống có ứng dụng di động hoạt động ngoại tuyến, p99 có thể tới hàng giờ.

### Theo dõi bản ghi bị bỏ

```text
   Chỉ số JMX:
   kafka.streams:type=stream-task-metrics,...
     dropped-records-total
     dropped-records-rate
```

Đây là chỉ số **bắt buộc phải giám sát** khi dùng windowing. Nó lớn hơn 0 nghĩa là bạn đang **mất dữ liệu im lặng**.

## Đọc kết quả có cửa sổ

Kết quả gộp theo cửa sổ có key kiểu `Windowed<K>`, không phải `K`:

```java
KTable<Windowed<String>, Long> dem = /* ... */;

dem.toStream()
   .map((windowedKey, count) -> {
       String cardId  = windowedKey.key();
       Instant batDau = windowedKey.window().startTime();
       Instant ketThuc = windowedKey.window().endTime();
       return KeyValue.pair(cardId,
               new WindowedCount(cardId, batDau, ketThuc, count));
   })
   .filter((cardId, wc) -> wc.getCount() > 5)
   .to("fraud-alerts");
```

`Windowed<K>` gói **hai** thông tin: key gốc và biên cửa sổ. Đưa thẳng nó ra topic sẽ cho key nhị phân khó đọc — luôn `map` về dạng có nghĩa trước khi ghi ra.

### Suppress — chỉ phát kết quả CUỐI CÙNG

Mặc định, mỗi lần cửa sổ đổi là một bản ghi ra:

```text
   KHÔNG suppress — cửa sổ 10:00–10:05 phát ra:
   (KH-042@10:00-10:05, 1)
   (KH-042@10:00-10:05, 2)
   (KH-042@10:00-10:05, 3)
   ... mỗi giao dịch một bản ghi
   → Hạ nguồn nhận HÀNG LOẠT kết quả trung gian
```

```java
.suppress(Suppressed.untilWindowCloses(Suppressed.BufferConfig.unbounded()))
```

```text
   CÓ suppress — chỉ phát MỘT bản ghi khi cửa sổ đóng hẳn:
   (KH-042@10:00-10:05, 17)
```

| | Không suppress | Có suppress |
|---|---|---|
| Số bản ghi ra | Nhiều (mỗi lần đổi) | **Một cho mỗi cửa sổ** |
| Độ trễ | Thấp — thấy ngay | **Cao — chờ cửa sổ đóng + grace** |
| Bộ nhớ | Thấp | **Cao — giữ mọi cửa sổ chưa đóng** |
| Dùng cho | Bảng điều khiển thời gian thực | **Gửi cảnh báo, báo cáo** |

Suppress rất hợp với cảnh báo: bạn không muốn gửi 17 email khi con số leo từ 1 lên 17.

> **Bẫy `unbounded()`**: cấu hình này cho bộ đệm dùng **bộ nhớ không giới hạn**. Nếu có nhiều cửa sổ đang mở, ứng dụng OOM. Cân nhắc `BufferConfig.maxBytes(...).emitEarlyWhenFull()` để có trần an toàn — đổi lại là có thể phát ra kết quả sớm.

## Dọn cửa sổ cũ

State store có cửa sổ giữ dữ liệu lâu hơn bạn tưởng:

```text
   Mặc định retention của windowed store = kích thước cửa sổ + grace period,
   nhưng TỐI THIỂU 24 GIỜ.

   Cửa sổ 1 phút, grace 0 → vẫn giữ 24 giờ dữ liệu!
   → 1.440 cửa sổ mỗi key nằm trong store
```

```java
Materialized.<String, Long, WindowStore<Bytes, byte[]>>as("card-counts")
            .withRetention(Duration.ofHours(2));     // giảm xuống 2 giờ
```

Ràng buộc: `retention` phải **≥ kích thước cửa sổ + grace**. Đặt nhỏ hơn sẽ ném exception lúc khởi động.

Giảm retention là cách đơn giản nhất để cắt giảm dung lượng state store khi dùng cửa sổ ngắn.

## Ví dụ hoàn chỉnh — phát hiện gian lận thẻ

```java
@Bean
public Function<KStream<String, Transaction>, KStream<String, FraudAlert>> fraudDetector() {
    return transactions -> transactions

            .filter((k, tx) -> tx != null && tx.getAmount() != null)

            // Key phải là số thẻ để đếm theo thẻ
            .selectKey((k, tx) -> tx.getCardNumber())
            .groupByKey(Grouped.with(Serdes.String(), txSerde))

            // Sliding window: "trong BẤT KỲ khoảng 1 phút nào", không phải khung giờ chẵn
            // Grace 10 giây cho độ trễ mạng của thiết bị POS
            .windowedBy(SlidingWindows.ofTimeDifferenceAndGrace(
                    Duration.ofMinutes(1), Duration.ofSeconds(10)))

            .count(Materialized.<String, Long, WindowStore<Bytes, byte[]>>as("card-tx-count")
                    .withRetention(Duration.ofMinutes(10)))   // không cần giữ 24 giờ

            // Chỉ phát MỘT cảnh báo cho mỗi cửa sổ, không phát mỗi lần đếm tăng
            .suppress(Suppressed.untilWindowCloses(
                    Suppressed.BufferConfig.maxBytes(50 * 1024 * 1024).emitEarlyWhenFull()))

            .toStream()
            .filter((windowedKey, count) -> count > 5)
            .map((windowedKey, count) -> KeyValue.pair(
                    windowedKey.key(),
                    new FraudAlert(
                            windowedKey.key(),
                            count,
                            windowedKey.window().startTime(),
                            windowedKey.window().endTime())));
}
```

Bảy quyết định thiết kế trong đoạn code này, mỗi cái đều có lý do:

| Quyết định | Vì sao |
|---|---|
| `SlidingWindows` chứ không `TimeWindows` | Gian lận không tôn trọng khung giờ chẵn |
| Grace 10 giây | Đo được p99 độ trễ của thiết bị POS |
| `withRetention(10 phút)` | Không cần giữ mặc định 24 giờ |
| `suppress` | Một cảnh báo cho mỗi cửa sổ, không phải 6 cảnh báo khi đếm từ 6 lên 11 |
| `maxBytes` chứ không `unbounded` | Chặn OOM |
| `map` trước khi ra | `Windowed<String>` làm key nhị phân khó đọc ở hạ nguồn |
| `filter` null ở đầu | Tombstone gây NPE làm chết luồng |

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng processing time thay event time | Sự kiện ngoại tuyến vào **sai cửa sổ** |
| Topic đặt `log.message.timestamp.type=LogAppendTime` | **Âm thầm vô hiệu hoá** ngữ nghĩa event time |
| `TimestampExtractor` trả về `-1` | Bản ghi **bị bỏ im lặng** |
| Nâng lên Kafka 3.0+ mà không đặt grace | Grace từ 24 giờ về **0** → sự kiện muộn bị bỏ |
| Không theo dõi `dropped-records` | **Mất dữ liệu im lặng** |
| Hopping window bước nhảy quá nhỏ | Cửa sổ 1 giờ nhảy 1 phút = **60× state store** |
| `Suppressed.BufferConfig.unbounded()` | **OOM** khi nhiều cửa sổ mở |
| Quên `withRetention` | Giữ mặc định **24 giờ** dù cửa sổ chỉ 1 phút |
| Ghi thẳng `Windowed<K>` ra topic | Key nhị phân, hạ nguồn không đọc được |
| `retention` nhỏ hơn `size + grace` | Ném exception lúc khởi động |
| Không lường session window hợp nhất | Hạ nguồn nhận tombstone bất ngờ |

## Tóm tắt bài 5

- **Ba loại thời gian**: event time (lúc chuyện xảy ra), ingestion time (lúc broker ghi), processing time (lúc ứng dụng đọc). Với nghiệp vụ thật, **event time là lựa chọn duy nhất đúng** — và Kafka Streams mặc định dùng nó.
- Topic đặt **`log.message.timestamp.type=LogAppendTime`** sẽ **âm thầm vô hiệu hoá** ngữ nghĩa event time. Nếu timestamp nghiệp vụ nằm trong payload, phải viết **`TimestampExtractor`** riêng (và **đừng trả về `-1`** — bản ghi sẽ bị bỏ).
- **Bốn loại cửa sổ**: **Tumbling** (cố định, không chồng lấn, rẻ nhất), **Hopping** (chồng lấn, **rất tốn** — nhân theo `size ÷ advance`), **Sliding** (chỉ tạo cửa sổ quanh dữ liệu thật, hợp phát hiện bất thường), **Session** (kích thước động theo hành vi, phiên có thể **hợp nhất**).
- **Grace period** quyết định giữ cửa sổ mở thêm bao lâu để đón sự kiện tới muộn. **Từ Kafka 3.0 mặc định đổi từ 24 giờ xuống 0** — nâng cấp mà không sửa code sẽ mất dữ liệu im lặng.
- Đừng đoán grace — **đo p99 độ trễ thật** của hệ thống rồi đặt theo đó.
- **Bắt buộc giám sát `dropped-records`**. Lớn hơn 0 nghĩa là đang mất dữ liệu.
- Key của kết quả là **`Windowed<K>`** (key gốc + biên cửa sổ). Luôn `map` về dạng có nghĩa trước khi ghi ra topic.
- **`suppress`** chỉ phát kết quả cuối cùng khi cửa sổ đóng — rất hợp với cảnh báo. Nhưng **`unbounded()` gây OOM**; dùng `maxBytes(...).emitEarlyWhenFull()`.
- **Windowed store giữ mặc định tối thiểu 24 giờ** dù cửa sổ chỉ 1 phút. Đặt `withRetention` để cắt giảm dung lượng.

**Bài kế tiếp** → [Bài 6: Join trong Kafka Streams — bốn kiểu và yêu cầu đồng phân vùng](06-join-trong-kafka-streams.md)

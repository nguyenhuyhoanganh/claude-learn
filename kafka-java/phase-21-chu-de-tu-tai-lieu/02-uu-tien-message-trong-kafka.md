# Bài 2: Ưu tiên message trong Kafka — ba mẫu thiết kế và cái giá của từng mẫu

Yêu cầu nghe rất bình thường: *"đơn hàng của khách VIP phải được xử lý trước đơn thường"*. Trong RabbitMQ bạn đặt `x-max-priority` là xong.

Trong Kafka thì **không có tính năng đó**. Không phải vì đội Kafka quên, mà vì **cấu trúc dữ liệu của Kafka không cho phép**. Bài này giải thích vì sao không cho phép, rồi trình bày ba mẫu thiết kế để đạt được hiệu quả tương đương — kèm cái giá của từng mẫu.

## Vì sao Kafka không thể có hàng đợi ưu tiên

Quay lại bản chất của partition:

```text
   Partition = MỘT FILE CHỈ ĐƯỢC GHI THÊM VÀO CUỐI
   ═══════════════════════════════════════════════

   ┌──────┬──────┬──────┬──────┬──────┐
   │ off0 │ off1 │ off2 │ off3 │ off4 │ ◄── chỉ ghi được vào ĐÂY
   └──────┴──────┴──────┴──────┴──────┘

   KHÔNG thể: sửa message đã ghi
   KHÔNG thể: xoá một message ở giữa
   KHÔNG thể: CHÈN message vào giữa
   KHÔNG thể: SẮP XẾP LẠI thứ tự
```

Hàng đợi ưu tiên đòi hỏi đúng thứ Kafka không có: **chèn message ưu tiên cao lên trước những message đã nằm sẵn trong hàng**. Với một file chỉ ghi thêm, điều đó bất khả thi về mặt vật lý.

```text
   Điều hàng đợi ưu tiên CẦN            Điều Kafka LÀM ĐƯỢC
   ═══════════════════════════           ═══════════════════

   Hàng: [thấp][thấp][thấp]              Log: [thấp][thấp][thấp]
   Tới message ƯU TIÊN CAO                Tới message ƯU TIÊN CAO
   → CHÈN lên đầu                         → nối vào CUỐI, như mọi message khác
   Hàng: [CAO][thấp][thấp][thấp]          Log: [thấp][thấp][thấp][CAO]
              ▲                                                    ▲
        lấy ra trước                                    lấy ra SAU CÙNG
```

Đây là hệ quả trực tiếp của đánh đổi mà Kafka chọn: **bỏ khả năng sửa dữ liệu để đổi lấy tốc độ ghi tuần tự** ([Phase 20 bài 4](../phase-20-kafka-internals/04-giai-phau-broker-topic-partition-replica.md)). Không có bữa trưa miễn phí.

Thêm một điểm nữa: Kafka chỉ đảm bảo thứ tự **trong một partition**, không phải toàn topic. Nên kể cả nếu sắp xếp được trong một partition thì cũng không có "thứ tự ưu tiên toàn cục" nào cả.

> **Kết luận cần nắm trước khi đọc tiếp**: mọi giải pháp dưới đây đều là **mô phỏng gần đúng**, không phải hàng đợi ưu tiên thật. Nếu nghiệp vụ của bạn đòi hỏi ưu tiên nghiêm ngặt tuyệt đối, **RabbitMQ là lựa chọn đúng hơn** — và nói được điều đó trong phỏng vấn là điểm cộng lớn.

## Mẫu 1 — mỗi mức ưu tiên một topic

Cách trực tiếp nhất, và cũng là cách được dùng nhiều nhất trong thực tế.

```text
                          ┌────────────────────────┐
                          │  Producer              │
                          │  phân loại theo        │
                          │  logic nghiệp vụ       │
                          └───┬────────┬────────┬──┘
                              │        │        │
              ┌───────────────┘        │        └───────────────┐
              ▼                        ▼                        ▼
   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
   │ orders-HIGH      │   │ orders-MEDIUM    │   │ orders-LOW       │
   └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
            │                      │                      │
            └──────────────────────┼──────────────────────┘
                                   ▼
                     ┌──────────────────────────────┐
                     │  Consumer                    │
                     │  vòng lặp:                   │
                     │   1. hút CẠN topic HIGH      │
                     │   2. rồi mới tới MEDIUM      │
                     │   3. rồi mới tới LOW         │
                     └──────────────────────────────┘
```

### Cài đặt bằng Spring

```java
@Component
public class PriorityBasedConsumer {

    private static final List<String> TOPICS_THEO_UU_TIEN =
            List.of("orders-high", "orders-medium", "orders-low");

    private final List<KafkaConsumer<String, Order>> consumers = new ArrayList<>();
    private final OrderService orderService;
    private volatile boolean dangChay = true;

    @PostConstruct
    void init() {
        // Thứ tự trong danh sách CHÍNH LÀ thứ tự ưu tiên.
        for (String topic : TOPICS_THEO_UU_TIEN) {
            KafkaConsumer<String, Order> c = new KafkaConsumer<>(props());
            c.subscribe(List.of(topic));
            consumers.add(c);
        }
    }

    @EventListener(ApplicationReadyEvent.class)
    public void startConsumers() {
        Executors.newSingleThreadExecutor().submit(() -> {
            while (dangChay) {
                boolean coViec = false;
                for (KafkaConsumer<String, Order> c : consumers) {
                    ConsumerRecords<String, Order> records = c.poll(Duration.ofMillis(100));
                    if (records.isEmpty()) {
                        continue;               // mức này rỗng, xuống mức thấp hơn
                    }
                    coViec = true;
                    records.forEach(r -> orderService.xuLy(r.value()));
                    c.commitSync();
                    break;                      // quay LẠI từ đầu — luôn ưu tiên mức cao nhất
                }
                if (!coViec) {
                    Thread.sleep(200);          // mọi mức đều rỗng, đừng quay CPU vô ích
                }
            }
        });
    }

    @PreDestroy
    void stop() {
        dangChay = false;
        consumers.forEach(KafkaConsumer::close);
    }
}
```

Chi tiết quan trọng nhất trong code là chữ **`break`**: sau khi xử lý xong một lô ở bất kỳ mức nào, vòng lặp quay lại **từ mức cao nhất**. Nếu thiếu `break`, bạn chỉ đang duyệt vòng tròn chứ không phải ưu tiên.

### Vấn đề chí mạng: đói tài nguyên (starvation)

```text
   Nếu topic HIGH LUÔN LUÔN có message
   ═══════════════════════════════════

   Vòng 1: HIGH có việc → xử lý → break
   Vòng 2: HIGH có việc → xử lý → break
   Vòng 3: HIGH có việc → xử lý → break
   ...
   → MEDIUM và LOW KHÔNG BAO GIỜ được đọc.
   → Đơn hàng thường tồn đọng vĩnh viễn.
```

Trong hệ thống thật đây không phải khả năng lý thuyết — nếu 30% lưu lượng là HIGH và consumer chỉ vừa đủ sức xử lý 30% đó, thì 70% còn lại **chết đứng**.

### Chữa bằng hạn ngạch (quota)

```java
// Thay vì "hút cạn mức cao rồi mới xuống", cấp hạn ngạch cho từng mức:
private static final Map<String, Integer> HAN_NGACH = Map.of(
        "orders-high",   8,     // mỗi vòng lấy tối đa 8 lô
        "orders-medium", 3,
        "orders-low",    1      // mức thấp LUÔN được ít nhất 1 lô mỗi vòng
);
```

Đây chính là ý tưởng của thư viện **`priority-kafka-client`** (Flipkart phát triển): thay vì ưu tiên tuyệt đối, nó cấp **tỉ lệ băng thông** cho từng mức. Mức thấp chạy chậm hơn nhưng **không bao giờ chết đói**.

| Kiểu | Mức thấp có được xử lý không | Độ trễ mức cao |
|---|---|---|
| Ưu tiên tuyệt đối (`break`) | **Có thể không bao giờ** | Thấp nhất |
| Hạn ngạch theo tỉ lệ | **Luôn luôn có, chỉ chậm hơn** | Hơi cao hơn |

Gần như mọi hệ thống production nên chọn **hạn ngạch**.

### Đánh giá mẫu 1

| Ưu | Nhược |
|---|---|
| Dễ hiểu, dễ cài, dễ giải thích cho người mới | **Đói tài nguyên** nếu dùng ưu tiên tuyệt đối |
| Mỗi mức scale độc lập (số partition khác nhau) | Số topic nhân lên theo số mức ưu tiên |
| Giám sát rõ ràng — nhìn lag từng mức là biết ngay | Producer phải biết logic phân loại |
| Không cần thư viện ngoài | Thêm mức ưu tiên mới = tạo topic + sửa cả hai phía |

## Mẫu 2 — Resequencer (bộ sắp xếp lại)

Ý tưởng: chèn một dịch vụ ở giữa, **gom message vào bộ đệm, sắp xếp, rồi phát lại** sang topic khác.

```text
   Producer ──► ┌────────────────┐
                │ incoming_topic │  (thứ tự lộn xộn)
                └───────┬────────┘
                        ▼
        ┌───────────────────────────────────┐
        │  RESEQUENCER SERVICE              │
        │  ┌─────────────────────────────┐  │
        │  │ Bộ đệm (buffer)             │  │
        │  │ Gom tới khi:                │  │
        │  │   • đủ 100 message,  HOẶC   │  │
        │  │   • hết 5000 ms             │  │
        │  │ → SẮP XẾP theo độ ưu tiên   │  │
        │  └─────────────────────────────┘  │
        └───────────────┬───────────────────┘
                        ▼
                ┌────────────────┐
                │ outgoing_topic │  (đã sắp xếp)
                └───────┬────────┘
                        ▼
                   Consumer thật
```

### Cài đặt bằng Apache Camel

```java
public class CustomPriorityComparator implements ExpressionResultComparator {

    @Override
    public int compare(Exchange o1, Exchange o2) {
        Integer p1 = o1.getIn().getHeader("priority", Integer.class);
        Integer p2 = o2.getIn().getHeader("priority", Integer.class);
        return Integer.compare(p2, p1);      // số lớn = ưu tiên cao = ra trước
    }

    @Override public void setExpression(Expression e) { }
    @Override public boolean isAsBatchResequence() { return true; }
}
```

```java
@Component
public class ResequenceRoute extends RouteBuilder {

    @Override
    public void configure() {
        from("kafka:incoming_channel?brokers=localhost:9092")
            .resequence()
                .body()
                .batch()
                    .size(100)                                    // sức chứa bộ đệm
                    .timeout(5000)                                // thời gian chờ tối đa
                .comparator(new CustomPriorityComparator())
            .to("kafka:outgoing_channel?brokers=localhost:9092");
    }
}
```

### Vì sao mẫu này thường là lựa chọn tệ nhất

Nhìn kỹ vào cơ chế bộ đệm sẽ thấy một mâu thuẫn không giải được:

```text
   Message ƯU TIÊN CAO tới lúc t=0
        │
        ▼
   Vào bộ đệm... và NẰM CHỜ ở đó
        │
        ├─ chờ đủ 100 message, HOẶC
        └─ chờ hết 5000 ms
        │
        ▼
   t=5000ms mới được phát đi

   → Message ƯU TIÊN CAO NHẤT bị TRỄ 5 GIÂY
     chỉ để nó có thể đi trước những message ưu tiên thấp!
```

Đây là **nghịch lý trung tâm** của Resequencer: để sắp xếp thì phải gom, mà gom thì phải chờ, mà chờ thì chính message ưu tiên cao bị trễ.

Muốn giảm độ trễ thì phải giảm `timeout` — nhưng giảm timeout thì bộ đệm ít message, mà bộ đệm ít message thì **sắp xếp gần như vô nghĩa** (sắp xếp 3 message thì được gì?).

Muốn sắp xếp hiệu quả thì phải tăng sức chứa bộ đệm — nhưng như vậy độ trễ càng cao.

| Mục tiêu | Cần | Nhưng gây ra |
|---|---|---|
| Ưu tiên chính xác | Bộ đệm lớn | Độ trễ cao |
| Độ trễ thấp | Bộ đệm nhỏ, timeout ngắn | Ưu tiên gần như vô tác dụng |

Và hiệu quả còn phụ thuộc **thông lượng message đến** — thứ bạn không kiểm soát được. Lưu lượng thấp thì bộ đệm luôn timeout ở mức lấp đầy một phần, ưu tiên vô nghĩa.

Thêm ba nhược điểm nữa: **thêm một dịch vụ phải vận hành**, **thêm một topic**, và **bộ đệm nằm trong bộ nhớ** nên dịch vụ chết là mất phần chưa phát (trừ khi tự cài đặt bền vững).

> **Khi nào mẫu này hợp lý**: khi bài toán thật của bạn là **sắp xếp lại thứ tự bị đảo do mạng** (ví dụ gom sự kiện từ nhiều nguồn rồi sắp theo timestamp), chứ không phải ưu tiên nghiệp vụ. Đó mới đúng là mục đích gốc của mẫu Resequencer.

## Mẫu 3 — Bucket Priority (ưu tiên theo nhóm partition)

Đây là mẫu tốt nhất trong ba mẫu, và là mẫu **thuận theo kiến trúc Kafka** thay vì chống lại nó.

Ý tưởng: **chia partition của một topic thành các nhóm (bucket), nhóm ưu tiên cao được cấp nhiều partition hơn.**

```text
   Topic "orders" có 10 partition, một topic duy nhất
   ═════════════════════════════════════════════════

   ┌─────────── BUCKET "HIGH" — 6 partition ────────────┐
   │  P0    P1    P2    P3    P4    P5                   │
   │  │     │     │     │     │     │                    │
   │  ▼     ▼     ▼     ▼     ▼     ▼                    │
   │  c1    c2    c3    c4    c5    c6   ← 6 consumer   │
   └─────────────────────────────────────────────────────┘

   ┌─────────── BUCKET "MEDIUM" — 3 partition ──────────┐
   │  P6    P7    P8                                     │
   │  ▼     ▼     ▼                                      │
   │  c7    c8    c9                     ← 3 consumer   │
   └─────────────────────────────────────────────────────┘

   ┌─────────── BUCKET "LOW" — 1 partition ─────────────┐
   │  P9                                                 │
   │  ▼                                                  │
   │  c10                                ← 1 consumer   │
   └─────────────────────────────────────────────────────┘

   Ưu tiên = TỈ LỆ NĂNG LỰC XỬ LÝ, không phải thứ tự trong hàng.
   HIGH được 6/10 năng lực, MEDIUM 3/10, LOW 1/10.
```

### Vì sao mẫu này thanh lịch

Nó dựa trên một sự thật đã học ở [Phase 3](../phase-3-kafka-fundamentals/05-consumer-groups.md): **một partition chỉ được giao cho một consumer trong một group**. Suy ra: **số partition trong bucket = số consumer chạy song song tối đa cho bucket đó = năng lực xử lý của bucket đó**.

Ba tính chất khiến nó vượt trội:

| Tính chất | Ý nghĩa |
|---|---|
| **Không bao giờ đói tài nguyên** | Bucket LOW luôn có 1 partition và 1 consumer riêng — nó chậm hơn, nhưng **không bao giờ dừng** |
| **Không thêm độ trễ nhân tạo** | Không có bộ đệm, không chờ. Message vào là được xử lý ngay bởi consumer của bucket đó |
| **Một topic duy nhất** | Không nhân số topic theo số mức ưu tiên. Cấu hình retention, ACL, giám sát đều ở một chỗ |

### Cài đặt phía producer

Producer định tuyến message vào đúng dải partition của bucket:

```java
public class BucketPriorityPartitioner implements Partitioner {

    // Tổng phải bằng số partition của topic
    private static final Map<String, int[]> BUCKET = Map.of(
            "HIGH",   new int[]{0, 1, 2, 3, 4, 5},
            "MEDIUM", new int[]{6, 7, 8},
            "LOW",    new int[]{9}
    );

    @Override
    public int partition(String topic, Object key, byte[] keyBytes,
                         Object value, byte[] valueBytes, Cluster cluster) {

        String bucket = ((Order) value).getPriority();
        int[] dai = BUCKET.getOrDefault(bucket, BUCKET.get("LOW"));

        // Băm key TRONG PHẠM VI dải partition của bucket
        // → vẫn giữ được đảm bảo "cùng key thì cùng partition"
        int idx = Math.abs(Utils.murmur2(keyBytes)) % dai.length;
        return dai[idx];
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
        partitioner.class: com.acme.BucketPriorityPartitioner
```

Chi tiết đáng chú ý: băm key **trong phạm vi dải** chứ không phải toàn bộ topic. Nhờ vậy vẫn giữ được đảm bảo *"mọi sự kiện của một khách hàng luôn vào cùng một partition"* — miễn là khách đó không đổi mức ưu tiên.

### Cài đặt phía consumer

Mỗi bucket là một nhóm consumer riêng, **gán thẳng partition** thay vì để Kafka chia:

```java
@Component
public class HighPriorityConsumer {

    @KafkaListener(
        topicPartitions = @TopicPartition(
            topic = "orders",
            partitions = {"0", "1", "2", "3", "4", "5"}   // chỉ dải HIGH
        ),
        concurrency = "6"
    )
    public void onHighPriority(Order order) {
        orderService.xuLy(order);
    }
}

@Component
public class LowPriorityConsumer {

    @KafkaListener(
        topicPartitions = @TopicPartition(
            topic = "orders",
            partitions = {"9"}                             // chỉ dải LOW
        ),
        concurrency = "1"
    )
    public void onLowPriority(Order order) {
        orderService.xuLy(order);
    }
}
```

Cơ chế gán partition tường minh này được nói kỹ ở [bài 4](04-gui-va-doc-partition-chi-dinh.md).

### Nhược điểm — có thật, cần biết trước

| Nhược điểm | Chi tiết |
|---|---|
| **Đổi tỉ lệ ưu tiên rất khó** | Muốn HIGH từ 6 lên 8 partition thì phải đổi cả partitioner lẫn danh sách partition ở consumer, và triển khai đồng bộ |
| **Không tăng partition thoải mái được** | Tăng số partition của topic phá vỡ mọi ánh xạ bucket |
| **Không đảm bảo thứ tự tuyệt đối giữa các mức** | Một message LOW tới lúc t=0 có thể xong trước một message HIGH tới lúc t=1 nếu consumer HIGH đang bận |
| **Mất tính năng tự cân bằng** | Gán partition tường minh nghĩa là **không có rebalance tự động**; consumer chết thì partition đó **không ai nhận** |

Dòng cuối là bẫy vận hành lớn nhất và phải xử lý bằng cách chạy nhiều bản sao có giám sát, hoặc dùng thư viện quản lý bucket thay vì gán tay. Ricardo Ferreira có bản cài đặt sẵn cho mẫu này (bucket priority pattern) đáng tham khảo trước khi tự viết.

## So sánh ba mẫu

| Tiêu chí | Mẫu 1: nhiều topic | Mẫu 2: Resequencer | Mẫu 3: Bucket Priority |
|---|---|---|---|
| Độ khó cài đặt | **Thấp** | Trung bình | Cao |
| Nguy cơ đói tài nguyên | **Cao** (nếu ưu tiên tuyệt đối) | Không | **Không** |
| Độ trễ thêm vào | Không | **Cao** (bằng timeout bộ đệm) | **Không** |
| Số topic | Nhiều (một mức một topic) | 2 | **1** |
| Thành phần phải vận hành thêm | Không | **Một dịch vụ** | Không |
| Đổi tỉ lệ ưu tiên | **Dễ** (chỉnh hạn ngạch) | Dễ | **Khó** |
| Giữ được thứ tự theo key | Có | **Không** (bị sắp xếp lại) | Có |
| Có rebalance tự động | **Có** | Có | **Không** |
| Đề xuất | Mặc định tốt, **kèm hạn ngạch** | Chỉ khi bài toán thật là sắp xếp lại thứ tự | Khi tỉ lệ ưu tiên **ổn định** và cần độ trễ thấp |

Khuyến nghị thực dụng:

```text
   Bắt đầu bằng MẪU 1 + HẠN NGẠCH.
   Nó giải quyết 80% nhu cầu, dễ hiểu, dễ vận hành, dễ đổi.

   Chuyển sang MẪU 3 khi:
     • tỉ lệ ưu tiên đã ổn định (không đổi hàng tháng), VÀ
     • độ trễ của mức thấp cũng quan trọng, VÀ
     • đội có đủ năng lực vận hành việc gán partition tường minh

   Chỉ dùng MẪU 2 khi bài toán thật là "sắp xếp lại thứ tự bị đảo",
   KHÔNG phải "ưu tiên nghiệp vụ".
```

## Và câu trả lời thẳng thắn nhất

Trước khi cài bất kỳ mẫu nào, hãy hỏi hai câu:

**Câu 1: bạn có thật sự cần ưu tiên, hay chỉ cần đủ năng lực xử lý?**

Rất nhiều yêu cầu "cần ưu tiên" thực chất là "consumer đang không theo kịp". Nếu lag bằng 0 thì mọi message đều được xử lý trong vài mili giây, và **ưu tiên trở thành vô nghĩa**. Thêm partition và thêm consumer thường rẻ hơn nhiều so với xây hệ ưu tiên.

**Câu 2: ưu tiên có phải là yêu cầu nghiêm ngặt không?**

Nếu nghiệp vụ nói *"đơn VIP PHẢI xử lý trước, không có ngoại lệ"* — thì Kafka là công cụ sai. Hãy dùng RabbitMQ cho luồng đó, hoặc tách hẳn thành hệ thống riêng. Ép Kafka làm việc nó không được thiết kế để làm sẽ tạo ra một hệ thống phức tạp mà vẫn không đảm bảo được điều đã hứa.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Ưu tiên tuyệt đối không có hạn ngạch | Mức thấp **chết đói vĩnh viễn** |
| Quên `break` trong vòng lặp mẫu 1 | Không phải ưu tiên, chỉ là duyệt vòng tròn |
| Resequencer với timeout dài | Chính message ưu tiên cao bị trễ nhất |
| Bucket Priority rồi tăng số partition | Phá vỡ toàn bộ ánh xạ bucket |
| Gán partition tường minh mà không giám sát | Consumer chết thì **partition đó không ai nhận** |
| Xây hệ ưu tiên khi vấn đề thật là lag | Tốn công vô ích — thêm consumer là xong |
| Hứa "ưu tiên nghiêm ngặt" trên Kafka | Không giữ được lời hứa. Nói thẳng và đề xuất RabbitMQ |

## Tóm tắt bài 2

- **Kafka không có hàng đợi ưu tiên**, và không thể có: partition là file **chỉ ghi thêm**, không chèn được message vào giữa, không sắp xếp lại được.
- **Mẫu 1 — mỗi mức một topic**: dễ nhất, phổ biến nhất. Nhược điểm chí mạng là **đói tài nguyên** nếu dùng ưu tiên tuyệt đối. **Bắt buộc kèm hạn ngạch** để mức thấp luôn có phần.
- **Mẫu 2 — Resequencer**: gom vào bộ đệm rồi sắp xếp. Có **nghịch lý trung tâm**: muốn sắp xếp tốt thì bộ đệm phải lớn, mà bộ đệm lớn thì chính message ưu tiên cao bị trễ. Chỉ hợp khi bài toán thật là **sắp xếp lại thứ tự bị đảo**, không phải ưu tiên nghiệp vụ.
- **Mẫu 3 — Bucket Priority**: chia partition thành nhóm, nhóm ưu tiên cao được nhiều partition hơn. **Ưu tiên = tỉ lệ năng lực xử lý**, không phải thứ tự trong hàng. Không đói tài nguyên, không thêm độ trễ, một topic duy nhất. Đổi lại: **khó đổi tỉ lệ** và **mất rebalance tự động**.
- Khuyến nghị: bắt đầu bằng **mẫu 1 + hạn ngạch**; chuyển sang mẫu 3 khi tỉ lệ ưu tiên đã ổn định và cần độ trễ thấp.
- Hai câu hỏi trước khi làm bất cứ gì: **có thật sự cần ưu tiên hay chỉ cần đủ năng lực xử lý?** và **ưu tiên có nghiêm ngặt không?** Nếu nghiêm ngặt thì **RabbitMQ là công cụ đúng hơn** — nói thẳng điều đó là dấu hiệu của người hiểu việc.

**Bài kế tiếp** → [Bài 3: Offset commit toàn tập — commitSync, commitAsync và 7 AckMode của Spring](03-offset-commit-toan-tap.md)

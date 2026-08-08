# Bài 4: Trạng thái — state store, RocksDB và changelog topic

Đây là bài quan trọng nhất của cả phase. Trạng thái là **lý do tồn tại** của Kafka Streams — mọi thứ khác (filter, map) bạn viết bằng consumer thường cũng được.

Câu hỏi cần trả lời: *"Ứng dụng đếm được 1.847 đơn hàng của khách KH-042. Con số đó nằm ở đâu? Khởi động lại thì sao? Đổi máy thì sao?"*

## Ba phép gộp cơ bản

```java
KGroupedStream<String, Order> grouped = orders
        .selectKey((k, o) -> o.getCustomerId())
        .groupByKey();                       // hoặc groupBy((k,v) -> ...)

// count — đếm số bản ghi mỗi key
KTable<String, Long> soDon = grouped.count();

// reduce — gộp hai giá trị CÙNG KIỂU thành một
KTable<String, Order> donLonNhat = grouped.reduce(
        (a, b) -> a.getAmount().compareTo(b.getAmount()) >= 0 ? a : b);

// aggregate — gộp thành kiểu KHÁC, linh hoạt nhất
KTable<String, CustomerStats> thongKe = grouped.aggregate(
        CustomerStats::new,                                  // giá trị khởi tạo
        (key, order, stats) -> stats.cong(order),            // hàm gộp
        Materialized.<String, CustomerStats, KeyValueStore<Bytes, byte[]>>as("customer-stats")
                    .withKeySerde(Serdes.String())
                    .withValueSerde(statsSerde));
```

| Phép | Kiểu ra | Dùng khi |
|---|---|---|
| `count()` | `Long` | Chỉ cần đếm |
| `reduce(f)` | **Cùng kiểu vào** | Max, min, hoặc "lấy cái mới nhất" |
| `aggregate(init, f, mat)` | **Kiểu bất kỳ** | Tổng, trung bình, gom danh sách, thống kê phức hợp |

Chú ý: **kết quả của gộp luôn là `KTable`**, không phải `KStream`. Điều đó hợp lý — "số đơn của KH-042" là một **trạng thái** bị ghi đè, không phải sự kiện cộng dồn.

### Hàm gộp phải thuần và giao hoán

```java
// SAI — phụ thuộc thời gian hệ thống, không tái lập được
(key, order, stats) -> stats.cong(order, System.currentTimeMillis());

// SAI — gọi ra ngoài, chậm và có thể lỗi
(key, order, stats) -> stats.cong(order, exchangeRateApi.get());

// ĐÚNG — thuần, chỉ dùng dữ liệu đầu vào
(key, order, stats) -> stats.cong(order);
```

Lý do: khi khôi phục sau sự cố, Kafka Streams **phát lại** dữ liệu qua hàm gộp. Nếu hàm phụ thuộc thời gian hoặc hệ thống ngoài, kết quả sau khôi phục sẽ **khác** kết quả trước đó.

## State store — trạng thái nằm ở đâu

```text
   ┌───────────────── MỘT INSTANCE ỨNG DỤNG ─────────────────┐
   │                                                          │
   │   Task 0 (xử lý partition 0)                            │
   │   ┌────────────────────────────────────────┐            │
   │   │  State store "customer-stats"          │            │
   │   │  ┌──────────────────────────────────┐  │            │
   │   │  │ RocksDB — CƠ SỞ DỮ LIỆU NHÚNG    │  │            │
   │   │  │ nằm trên ĐĨA CỤC BỘ của máy này  │  │            │
   │   │  │                                   │  │            │
   │   │  │  KH-001 → {don:12, tong:5.2tr}   │  │            │
   │   │  │  KH-013 → {don:3,  tong:890k}    │  │            │
   │   │  └──────────────────────────────────┘  │            │
   │   └────────────────────────────────────────┘            │
   │                                                          │
   │   Task 1 (xử lý partition 1) — state store RIÊNG        │
   │   Task 2 (xử lý partition 2) — state store RIÊNG        │
   └──────────────────────────────────────────────────────────┘

   Đường dẫn thật:
   ${state.dir}/${application.id}/<task-id>/rocksdb/<tên-store>/
   mặc định state.dir = /tmp/kafka-streams
```

Ba điều quan trọng đọc ra từ hình:

**Một — trạng thái nằm CỤC BỘ, trên đĩa của chính máy đang xử lý.** Không phải Redis, không phải database chung. Mỗi lần đọc/ghi trạng thái là một thao tác **đĩa cục bộ**, đo bằng micro giây, không có vòng mạng nào.

**Hai — mỗi task có store riêng.** Task 0 hoàn toàn không biết gì về dữ liệu của task 1. Đây là lý do **đồng phân vùng** quan trọng đến vậy.

**Ba — RocksDB là cơ sở dữ liệu nhúng key-value**, do Facebook phát triển, dựa trên **LSM tree**. Nó cho phép state store **lớn hơn RAM** — dữ liệu nóng nằm trong bộ nhớ, phần còn lại trên đĩa.

> **Bẫy production nghiêm trọng**: `state.dir` mặc định là **`/tmp/kafka-streams`**. Nhiều hệ điều hành **dọn `/tmp` khi khởi động lại**, và container thì mất `/tmp` mỗi lần tạo lại. Kết quả: mỗi lần khởi động lại là một lần **khôi phục toàn bộ trạng thái từ đầu** — có thể mất hàng chục phút với store lớn.
> ```yaml
> spring.cloud.stream.kafka.streams.binder.configuration:
>   state.dir: /var/lib/kafka-streams
> ```
> Trên Kubernetes: dùng **StatefulSet** với PersistentVolumeClaim, không dùng Deployment.

## Changelog topic — vì sao trạng thái không mất

Câu hỏi hiển nhiên: đĩa cục bộ thì máy chết là mất. Vậy sao lại nói trạng thái bền vững?

```text
   Mỗi lần state store thay đổi
        │
        ├──► ghi vào RocksDB cục bộ    (nhanh, phục vụ đọc)
        │
        └──► ghi vào CHANGELOG TOPIC   (bền vững, nhân bản trên cụm Kafka)
             tên: <application.id>-<tên-store>-changelog
```

```text
   ┌──────────────────────────────────────────────────────────┐
   │  changelog topic được cấu hình cleanup.policy=compact    │
   │                                                           │
   │  → chỉ giữ GIÁ TRỊ MỚI NHẤT của mỗi key                  │
   │  → kích thước tỉ lệ với SỐ KEY, không phải số bản ghi    │
   │  → chính là bảng KTable dưới dạng log                    │
   └──────────────────────────────────────────────────────────┘
```

Đây lại là **tính hai mặt luồng–bảng** từ [bài 2](02-kstream-ktable-globalktable.md): RocksDB là *bảng*, changelog là *log thay đổi* của bảng đó.

### Khôi phục khi máy chết

```text
   t=0    Instance 2 chết. Nó đang giữ task 1 với state store 4 GB.

   t=9s   Rebalance. Task 1 được giao cho instance 3.

   t=9s   Instance 3 CHƯA CÓ dữ liệu của task 1.
          → Đọc toàn bộ topic <app-id>-customer-stats-changelog,
            partition 1, từ đầu
          → Dựng lại RocksDB cục bộ

   t=?    Chỉ khi khôi phục XONG, task 1 mới bắt đầu xử lý bản ghi mới.

   Thời gian khôi phục ≈ kích thước store ÷ tốc độ đọc Kafka
                       ≈ 4 GB ÷ 50 MB/s ≈ 80 giây
```

**Trong 80 giây đó, partition 1 không xử lý gì cả.** Đây là chi phí thật của trạng thái, và là điều phải tính vào SLA.

### Standby replica — rút ngắn thời gian khôi phục

```properties
num.standby.replicas=1
```

```text
   KHÔNG có standby
   ════════════════
   Instance 2 chết → instance 3 đọc changelog từ đầu → 80 giây

   CÓ standby (num.standby.replicas=1)
   ═══════════════════════════════════
   Instance 3 ĐÃ LIÊN TỤC đọc changelog của task 1 suốt thời gian qua
   và giữ sẵn một bản sao RocksDB "nguội"

   Instance 2 chết → instance 3 chỉ cần bắt kịp phần đuôi → VÀI GIÂY
```

| | Không standby | `num.standby.replicas=1` |
|---|---|---|
| Thời gian khôi phục | Phút | **Giây** |
| Đĩa tiêu tốn | 1× | **2×** |
| Lưu lượng mạng | 1× | **2×** (standby liên tục đọc changelog) |

Với ứng dụng có trạng thái lớn và yêu cầu sẵn sàng cao, `num.standby.replicas=1` gần như bắt buộc.

### Tắt changelog — khi nào và vì sao không nên

```java
Materialized.<String, Stats, KeyValueStore<Bytes, byte[]>>as("stats")
            .withLoggingDisabled()          // TẮT changelog
```

Chỉ hợp lý khi trạng thái **dựng lại được từ nguồn khác dễ dàng** và bạn chấp nhận mất. Trong hầu hết trường hợp, tắt changelog nghĩa là **máy chết là mất trạng thái vĩnh viễn** — không có cách nào lấy lại.

## Topic nội bộ Kafka Streams tự tạo

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --list | grep order-analytics
```

```text
order-analytics-customer-stats-changelog
order-analytics-customer-stats-repartition
order-analytics-KSTREAM-AGGREGATE-STATE-STORE-0000000004-changelog
```

| Hậu tố | Mục đích | `cleanup.policy` | Kích thước tỉ lệ với |
|---|---|---|---|
| `-changelog` | Sao lưu state store | **`compact`** | **Số key** |
| `-repartition` | Chia lại theo key mới ([bài 3](03-phep-bien-doi-khong-trang-thai.md)) | **`delete`**, retention rất ngắn | Thông lượng |

Ba điều phải biết về chúng:

**Chúng là topic thật, chiếm đĩa thật.** Đưa vào tính toán dung lượng cụm. Changelog của một store 4 GB × 3 bản sao = 12 GB trên cụm.

**Chúng KHÔNG tự xoá khi bạn xoá ứng dụng.** Đổi `application.id` để lại một bộ topic mồ côi vĩnh viễn. Dọn bằng:

```bash
kafka-streams-application-reset.sh --bootstrap-server localhost:9092 \
  --application-id order-analytics --input-topics orders
```

**Nên đặt tên store tường minh.** Tên tự sinh (`KSTREAM-AGGREGATE-STATE-STORE-0000000004`) phụ thuộc **thứ tự các phép trong topology**. Chèn thêm một `filter` ở giữa là số thứ tự đổi, và Kafka Streams sẽ **tạo store mới, mất toàn bộ trạng thái cũ**.

```java
// KÉM — tên tự sinh, đổi khi topology đổi
grouped.count();

// TỐT — tên cố định, sống sót qua thay đổi topology
grouped.count(Materialized.as("customer-order-count"));
```

Đây là một trong những bẫy tốn kém nhất của Kafka Streams: refactor một dòng code vô hại rồi mất sạch trạng thái ở production.

## Interactive Query — đọc trạng thái từ REST

Trạng thái nằm trong RocksDB không chỉ để tính toán — bạn **truy vấn được nó trực tiếp**, biến ứng dụng Streams thành một kho dữ liệu đọc.

```java
@RestController
@RequiredArgsConstructor
public class StatsController {

    private final InteractiveQueryService queryService;

    @GetMapping("/stats/{customerId}")
    public ResponseEntity<CustomerStats> get(@PathVariable String customerId) {

        // Trạng thái bị chia theo partition → key này có thể nằm ở INSTANCE KHÁC
        HostInfo host = queryService.getHostInfo("customer-stats", customerId, Serdes.String().serializer());

        if (!queryService.getCurrentHostInfo().equals(host)) {
            // Chuyển tiếp request sang instance đang giữ key đó
            return restTemplate.getForEntity(
                    "http://%s:%d/stats/%s".formatted(host.host(), host.port(), customerId),
                    CustomerStats.class);
        }

        ReadOnlyKeyValueStore<String, CustomerStats> store =
                queryService.getQueryableStore("customer-stats",
                        QueryableStoreTypes.keyValueStore());

        return ResponseEntity.ofNullable(store.get(customerId));
    }
}
```

```properties
# Mỗi instance khai báo địa chỉ để các instance khác chuyển tiếp request tới
application.server=${HOSTNAME}:8080
```

```text
   Client ──► Instance 1 ──┬─► key nằm ở đây? → trả lời ngay
                            │
                            └─► không? → chuyển tiếp sang Instance 2 ──► trả lời
```

| Ưu | Nhược |
|---|---|
| **Không cần database ngoài** cho dữ liệu đã tính sẵn | Phải **tự viết logic chuyển tiếp** giữa các instance |
| Độ trễ đọc rất thấp (đĩa cục bộ) | **Không đọc được** trong lúc rebalance hoặc khôi phục |
| Luôn nhất quán với luồng xử lý | Chỉ tra được **theo key**, không truy vấn tuỳ ý |

Interactive Query hợp với: bảng điều khiển thời gian thực, API tra cứu tổng hợp đã tính sẵn, kiểm tra hạn mức. **Không** hợp với: truy vấn phức tạp, báo cáo tuỳ biến, dữ liệu cần join nhiều nguồn.

## Tinh chỉnh RocksDB

Mặc định RocksDB cấp bộ nhớ **cho từng store**, nên nhiều partition là bộ nhớ nhân lên rất nhanh:

```text
   Mặc định mỗi store: ~50 MB block cache + ~64 MB write buffer

   Ứng dụng có 3 store × 12 partition = 36 store
   → 36 × 114 MB ≈ 4 GB bộ nhớ NGOÀI HEAP

   Trên Kubernetes: heap 2 GB nhưng container bị OOMKilled ở 3 GB
   → RẤT khó chẩn đoán, vì heap dump trông hoàn toàn bình thường
```

Đây là nguyên nhân số một của `OOMKilled` ở ứng dụng Kafka Streams. Cách chữa là dùng chung một khối bộ nhớ có trần:

```java
public class BoundedMemoryRocksDBConfig implements RocksDBConfigSetter {

    private static final long TONG_CACHE  = 128L * 1024 * 1024;   // 128 MB dùng chung
    private static final long TONG_BUFFER =  64L * 1024 * 1024;

    private static final Cache CACHE = new LRUCache(TONG_CACHE);
    private static final WriteBufferManager BUFFER =
            new WriteBufferManager(TONG_BUFFER, CACHE);

    @Override
    public void setConfig(String storeName, Options options, Map<String, Object> configs) {
        BlockBasedTableConfig table = (BlockBasedTableConfig) options.tableFormatConfig();
        table.setBlockCache(CACHE);                  // MỌI store dùng CHUNG cache
        table.setCacheIndexAndFilterBlocks(true);
        options.setTableFormatConfig(table);
        options.setWriteBufferManager(BUFFER);       // và chung write buffer
    }

    @Override
    public void close(String storeName, Options options) {
        // CACHE và BUFFER là static, dùng chung — không đóng ở đây
    }
}
```

```properties
rocksdb.config.setter=com.acme.BoundedMemoryRocksDBConfig
```

Giờ tổng bộ nhớ ngoài heap bị chặn ở ~192 MB bất kể có bao nhiêu store.

## Bộ đệm ghi — vì sao kết quả không ra ngay

Kafka Streams gom kết quả gộp lại trước khi đẩy xuống bước sau:

```properties
cache.max.bytes.buffering=10485760     # 10 MB, mặc định
commit.interval.ms=30000               # 30 giây (hoặc 100 ms nếu bật EOS)
```

```text
   Nhận 100 đơn của KH-042 trong 5 giây
        │
        ▼
   Store cập nhật 100 lần trong RocksDB
        │
        ▼
   Nhưng CHỈ ĐẨY XUỐNG bước sau khi:
     • bộ đệm đầy 10 MB, HOẶC
     • tới kỳ commit (30 giây)
        │
        ▼
   → Bước sau chỉ thấy 1 bản ghi: (KH-042, 100)
   → KHÔNG thấy 100 bản ghi trung gian 1, 2, 3, ..., 99
```

Đây thường là điều bạn muốn (giảm mạnh lưu lượng ra), nhưng nó gây bối rối khi test:

> **"Tôi gửi một message mà không thấy kết quả ra"** — nguyên nhân số một là bộ đệm chưa được đẩy. Trong test, đặt `cache.max.bytes.buffering=0` để thấy mọi bản ghi trung gian ngay lập tức.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Để `state.dir=/tmp` ở production | Mất trạng thái mỗi lần khởi động lại → khôi phục hàng chục phút | Đặt đường dẫn bền vững + StatefulSet |
| Không đặt tên store tường minh | Đổi topology → **tạo store mới, mất trạng thái cũ** | `Materialized.as("ten-ro-rang")` |
| Đổi `application.id` | **Mất toàn bộ trạng thái** + để lại topic nội bộ mồ côi | Giữ nguyên; nếu buộc đổi thì chạy `application-reset.sh` |
| Không đặt `num.standby.replicas` | Khôi phục hàng phút mỗi lần rebalance | Đặt `1` cho ứng dụng có trạng thái lớn |
| Không giới hạn bộ nhớ RocksDB | **OOMKilled** mà heap dump trông bình thường | `RocksDBConfigSetter` dùng chung cache |
| Hàm gộp phụ thuộc thời gian hoặc API ngoài | Kết quả sau khôi phục **khác** trước đó | Hàm gộp phải **thuần** |
| Tắt changelog để "tiết kiệm" | Máy chết là **mất trạng thái vĩnh viễn** | Giữ changelog |
| Ngạc nhiên vì không thấy kết quả ngay | Bộ đệm chưa đẩy | Test với `cache.max.bytes.buffering=0` |
| Quên tính đĩa cho topic nội bộ | Cụm hết đĩa | Store 4 GB × RF 3 = 12 GB changelog |
| Dùng Deployment trên K8s cho app có trạng thái | Mỗi lần pod tạo lại là khôi phục từ đầu | **StatefulSet** + PVC |

## Tóm tắt bài 4

- Ba phép gộp: **`count`** (đếm), **`reduce`** (gộp cùng kiểu), **`aggregate`** (gộp thành kiểu bất kỳ). Kết quả **luôn là `KTable`**.
- Hàm gộp phải **thuần** — không phụ thuộc thời gian hệ thống hay API ngoài — vì Kafka Streams **phát lại** dữ liệu qua nó khi khôi phục.
- **State store nằm cục bộ** trên đĩa của máy đang xử lý, dùng **RocksDB** (cơ sở dữ liệu nhúng LSM tree). Đọc/ghi trạng thái là thao tác đĩa cục bộ, **không có vòng mạng**.
- Bền vững nhờ **changelog topic** (`<app-id>-<store>-changelog`, `cleanup.policy=compact`). Đây lại chính là **tính hai mặt luồng–bảng**: RocksDB là bảng, changelog là log thay đổi.
- Máy chết → task chuyển sang máy khác → **đọc lại toàn bộ changelog để dựng lại RocksDB**. Store 4 GB mất khoảng 80 giây, và **partition đó không xử lý gì trong suốt thời gian đó**.
- **`num.standby.replicas=1`** rút thời gian khôi phục từ phút xuống giây, đổi lại **gấp đôi đĩa và lưu lượng mạng**.
- **`state.dir` mặc định là `/tmp`** — bẫy production nghiêm trọng. Đặt đường dẫn bền vững, và dùng **StatefulSet + PVC** trên Kubernetes.
- **Luôn đặt tên store tường minh.** Tên tự sinh phụ thuộc thứ tự phép trong topology; thêm một `filter` là mất sạch trạng thái.
- **Interactive Query** cho phép đọc state store qua REST, biến ứng dụng thành kho dữ liệu đọc — nhưng phải **tự viết logic chuyển tiếp** giữa các instance vì trạng thái bị chia theo partition.
- **RocksDB cấp bộ nhớ cho từng store** → nhiều partition là nguyên nhân số một của `OOMKilled` với heap dump trông bình thường. Chữa bằng `RocksDBConfigSetter` dùng chung cache có trần.
- Kết quả không ra ngay là do **bộ đệm ghi** (`cache.max.bytes.buffering`, mặc định 10 MB). Trong test đặt về `0`.

**Bài kế tiếp** → [Bài 5: Cửa sổ thời gian — tumbling, hopping, sliding, session](05-cua-so-thoi-gian-windowing.md)

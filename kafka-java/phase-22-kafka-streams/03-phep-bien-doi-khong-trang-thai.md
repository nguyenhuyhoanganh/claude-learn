# Bài 3: Phép biến đổi không trạng thái — và bẫy repartition ẩn

Nhóm phép biến đổi này dễ tới mức người ta bỏ qua ngay: `filter`, `map`, `flatMap` — ai viết Java cũng biết.

Nhưng có một chi tiết ẩn khiến một dòng code vô hại tạo ra **một topic mới trong cụm Kafka của bạn**, kèm thêm một vòng ghi–đọc qua mạng cho mọi bản ghi. Rất nhiều đội chỉ phát hiện điều này khi nhìn thấy topic lạ và hiệu năng tụt một nửa.

Bài này đi qua từng phép biến đổi, rồi chỉ rõ chi tiết ẩn đó.

## Nhóm 1 — lọc

```java
KStream<String, Order> orders = builder.stream("orders");

// Giữ lại bản ghi thoả điều kiện
KStream<String, Order> donLon = orders.filter((key, order) -> order.getAmount() > 1_000_000);

// Loại bỏ bản ghi thoả điều kiện — ngược lại
KStream<String, Order> donThuong = orders.filterNot((key, order) -> order.getAmount() > 1_000_000);
```

| Phép | Giữ lại khi |
|---|---|
| `filter(predicate)` | Điều kiện **đúng** |
| `filterNot(predicate)` | Điều kiện **sai** |

Cả hai đều nhận `(key, value)` — không chỉ value. Đây là điểm khác với `Stream` của Java.

> **Bẫy `null`**: `filter` chạy trước khi bạn kiểm tra gì cả. Nếu topic có tombstone (`value = null`) thì `order.getAmount()` ném `NullPointerException` và **làm chết cả luồng xử lý**. Luôn đề phòng:
> ```java
> .filter((key, order) -> order != null && order.getAmount() > 1_000_000)
> ```

## Nhóm 2 — biến đổi

Đây là nhóm có bẫy repartition, nên cần phân biệt kỹ.

```java
// mapValues — đổi VALUE, GIỮ NGUYÊN key          ← AN TOÀN
KStream<String, BigDecimal> amounts =
        orders.mapValues(order -> order.getAmount());

// map — đổi CẢ key LẪN value                      ← GÂY REPARTITION
KStream<String, BigDecimal> byProduct =
        orders.map((key, order) -> KeyValue.pair(order.getProductId(), order.getAmount()));

// selectKey — chỉ đổi key                          ← GÂY REPARTITION
KStream<String, Order> byProductKey =
        orders.selectKey((key, order) -> order.getProductId());

// flatMapValues — một vào, NHIỀU ra, giữ key      ← AN TOÀN
KStream<String, OrderLine> lines =
        orders.flatMapValues(order -> order.getLines());

// flatMap — một vào, nhiều ra, đổi cả key         ← GÂY REPARTITION
KStream<String, Integer> productQty =
        orders.flatMap((key, order) -> order.getLines().stream()
                .map(l -> KeyValue.pair(l.getProductId(), l.getQuantity()))
                .toList());
```

Bảng phân loại — **cột cuối là cột quan trọng nhất của cả bài**:

| Phép | Đổi key | Đổi value | Số bản ghi ra | Gây repartition |
|---|---|---|---|---|
| `filter` / `filterNot` | Không | Không | 0 hoặc 1 | **Không** |
| `mapValues` | **Không** | Có | 1 | **Không** |
| `flatMapValues` | **Không** | Có | 0..n | **Không** |
| `peek` | Không | Không | 1 | **Không** |
| `map` | **Có** | Có | 1 | **CÓ** |
| `selectKey` | **Có** | Không | 1 | **CÓ** |
| `flatMap` | **Có** | Có | 0..n | **CÓ** |
| `groupBy` | **Có** | Không | 1 | **CÓ** |

## Bẫy repartition — chi tiết ẩn quan trọng nhất

### Vì sao đổi key lại đắt

Nhắc lại từ [Phase 3](../phase-3-kafka-fundamentals/06-partitions-keys.md): **partition của một bản ghi được tính từ key**. Kafka Streams dựa vào bất biến đó để đảm bảo *"mọi bản ghi cùng key đều do cùng một task xử lý"* — nền tảng của mọi phép có trạng thái.

```text
   TRƯỚC khi đổi key — key = customerId
   ════════════════════════════════════
   P0 → task 0 → xử lý KH-001, KH-013
   P1 → task 1 → xử lý KH-042, KH-055
   P2 → task 2 → xử lý KH-077, KH-099

   SAU khi selectKey(order -> order.getProductId())
   ════════════════════════════════════════════════
   Bản ghi vẫn nằm ở P1 (vì nó được ghi vào đó theo customerId)
   nhưng key giờ là SP-999.

   Một bản ghi SP-999 khác lại đang nằm ở P2.

   → HAI bản ghi cùng key SP-999 ở HAI task khác nhau
   → Đếm theo SP-999 sẽ cho HAI kết quả riêng biệt, đều SAI
```

### Kafka Streams tự sửa — nhưng có giá

Nó chèn một bước ngầm:

```text
   ...luồng xử lý...
        │
        ▼
   selectKey(productId)
        │
        ▼
   ┌──────────────────────────────────────────────────┐
   │  GHI vào topic nội bộ:                           │
   │  <application.id>-<tên-node>-repartition         │
   │  (băm lại theo key MỚI)                          │
   └──────────────────────┬───────────────────────────┘
                          ▼
   ┌──────────────────────────────────────────────────┐
   │  ĐỌC lại từ topic đó                             │
   │  → giờ bản ghi cùng key đã về cùng partition     │
   └──────────────────────┬───────────────────────────┘
                          ▼
   ...tiếp tục xử lý...
```

Giá phải trả cho **mỗi bản ghi**:

| Chi phí | Chi tiết |
|---|---|
| **Một lần ghi qua mạng** | Ghi vào topic repartition |
| **Một lần đọc qua mạng** | Đọc lại từ topic đó |
| **Ghi đĩa trên broker** | Topic thật, chiếm dung lượng thật |
| **Tuần tự hoá hai chiều** | Serialize khi ghi, deserialize khi đọc |
| **Độ trễ tăng** | Thêm một chặng Kafka đầy đủ |

Thông lượng thường **giảm khoảng một nửa**, và đó là con số nhiều đội đo được khi vô tình thêm một `selectKey`.

### Tối ưu quan trọng: `mapValues` thay vì `map`

```java
// SAI — dùng map dù KHÔNG hề đổi key
.map((key, order) -> KeyValue.pair(key, order.getAmount()))
//   → Kafka Streams thấy `map` là ĐÁNH DẤU "key có thể đã đổi"
//   → chèn repartition, dù thực tế key không đổi

// ĐÚNG
.mapValues(order -> order.getAmount())
//   → Kafka Streams BIẾT CHẮC key không đổi → không repartition
```

Kafka Streams **không phân tích code của bạn**. Nó chỉ nhìn **bạn gọi phép nào**. Gọi `map` là tự nhận "tôi có thể đã đổi key", và nó tin bạn.

> **Quy tắc**: **luôn dùng `mapValues` / `flatMapValues` khi không đổi key.** Đây là tối ưu hiệu năng rẻ nhất trong Kafka Streams — sửa một chữ, thông lượng gấp đôi.

### Cách phát hiện repartition trong ứng dụng của bạn

**Cách 1 — in ra topology:**

```java
Topology topology = streamsBuilder.build();
System.out.println(topology.describe());
```

```text
Topologies:
   Sub-topology: 0
    Source: KSTREAM-SOURCE-0000000000 (topics: [orders])
      --> KSTREAM-FILTER-0000000001
    Processor: KSTREAM-KEY-SELECT-0000000002 (stores: [])
      --> KSTREAM-FILTER-0000000005
    Sink: KSTREAM-SINK-0000000004 (topic: counts-repartition)   ← ĐÂY
      <-- KSTREAM-FILTER-0000000005

   Sub-topology: 1
    Source: KSTREAM-SOURCE-0000000006 (topics: [counts-repartition])
```

Hai dấu hiệu: xuất hiện topic có hậu tố **`-repartition`**, và topology bị **chẻ thành nhiều sub-topology**. Mỗi ranh giới sub-topology là một lần đi vòng qua Kafka.

**Cách 2 — liệt kê topic trong cụm:**

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --list | grep repartition
```

```text
order-analytics-KSTREAM-AGGREGATE-STATE-STORE-0000000003-repartition
```

Nếu bạn không cố ý tạo ra chúng, đó là dấu hiệu cần xem lại code.

### Khi nào repartition là cần thiết

Không phải lúc nào cũng tránh được — và không phải lúc nào cũng nên tránh:

```java
// Bài toán: đếm doanh thu theo SẢN PHẨM, nhưng topic đang có key là customerId
orders
    .selectKey((k, order) -> order.getProductId())     // BẮT BUỘC đổi key
    .groupByKey()
    .aggregate(...)
```

Ở đây repartition là **đúng và cần thiết** — không có nó thì kết quả sai. Điều cần làm là:

| Việc | Cách |
|---|---|
| **Lọc trước, đổi key sau** | `filter` bỏ 90% bản ghi rồi mới `selectKey` → repartition ít dữ liệu hơn 10 lần |
| **Chỉ đổi key một lần** | Đừng `selectKey` rồi lại `selectKey` — mỗi lần là một topic |
| **Cân nhắc đổi key ở producer** | Nếu luôn cần key là `productId`, hãy để producer gửi đúng key ngay từ đầu |

Việc thứ nhất là tối ưu dễ nhất và hiệu quả nhất:

```java
// KÉM — repartition toàn bộ 100% bản ghi
orders.selectKey((k, o) -> o.getProductId())
      .filter((k, o) -> o.getAmount() > 1_000_000)

// TỐT — lọc còn 10% rồi mới repartition
orders.filter((k, o) -> o.getAmount() > 1_000_000)
      .selectKey((k, o) -> o.getProductId())
```

Hai đoạn cho **cùng kết quả**, nhưng đoạn sau đẩy qua mạng ít hơn mười lần.

## Nhóm 3 — chẻ nhánh và gộp

### `split` — chia một luồng thành nhiều

```java
Map<String, KStream<String, Order>> branches = orders
        .split(Named.as("order-"))
        .branch((k, o) -> o.getAmount() > 10_000_000, Branched.as("vip"))
        .branch((k, o) -> o.getAmount() > 1_000_000,  Branched.as("lon"))
        .defaultBranch(Branched.as("thuong"));

branches.get("order-vip").to("orders-vip");
branches.get("order-lon").to("orders-lon");
branches.get("order-thuong").to("orders-thuong");
```

Hai điều phải nhớ:

**Thứ tự nhánh quyết định kết quả.** Bản ghi đi vào **nhánh đầu tiên khớp** rồi dừng. Đơn 20 triệu khớp cả hai điều kiện, nhưng chỉ vào `vip`. Đảo thứ tự hai `branch` là kết quả khác hẳn.

**Không có `defaultBranch` thì bản ghi không khớp nhánh nào sẽ **bị bỏ im lặng**.** Không lỗi, không log. Luôn có nhánh mặc định, kể cả chỉ để đếm chỉ số.

> `split()` thay cho `branch()` cũ (trả về mảng `KStream[]`) đã bị đánh dấu lỗi thời từ Kafka 2.8. Mảng khiến code khó đọc vì phải nhớ chỉ số nào là nhánh nào.

### `merge` — gộp nhiều luồng thành một

```java
KStream<String, Order> tatCa = donWeb.merge(donMobile).merge(donPos);
```

Ràng buộc: các luồng phải **cùng kiểu key và value**. Và **không có đảm bảo thứ tự giữa các luồng** — bản ghi từ `donMobile` có thể ra trước bản ghi cũ hơn từ `donWeb`.

## Nhóm 4 — tác dụng phụ

```java
// peek — nhìn mà không đổi. Dùng để log, đếm chỉ số.
orders.peek((key, order) -> log.debug("Nhận đơn {}", order.getId()))

// foreach — điểm cuối, KHÔNG trả về KStream nữa
orders.foreach((key, order) -> metrics.increment("orders.received"));

// to — ghi ra topic
orders.to("processed-orders", Produced.with(Serdes.String(), orderSerde));

// through / repartition — ghi ra topic RỒI đọc lại (dùng khi muốn chủ động chia lại)
KStream<String, Order> daChiaLai = orders.repartition(
        Repartitioned.<String, Order>as("orders-by-product")
                     .withNumberOfPartitions(12));
```

| Phép | Trả về `KStream` | Dùng để |
|---|---|---|
| `peek` | **Có** | Log, đếm chỉ số giữa chuỗi |
| `foreach` | **Không** — kết thúc | Tác dụng phụ ở cuối |
| `to` | **Không** — kết thúc | Ghi ra topic |
| `repartition` | **Có** | Chủ động chia lại, đặt số partition riêng |

> **Cảnh báo về `peek` và `foreach`**: đừng gọi database hay HTTP trong đó. Chúng chạy **đồng bộ trên luồng xử lý chính**; một lời gọi chậm sẽ chặn toàn bộ task và có thể gây quá hạn `max.poll.interval.ms` → rebalance vô tận (xem [Phase 20 bài 10](../phase-20-kafka-internals/10-hanh-trinh-mot-message.md)).

## Ví dụ hoàn chỉnh — có tối ưu

Bài toán: từ topic `orders` (key = `customerId`), tính doanh thu theo sản phẩm, chỉ tính đơn đã thanh toán trên 1 triệu.

```java
@Bean
public Function<KStream<String, Order>, KStream<String, BigDecimal>> productRevenue() {
    return orders -> orders

            // 1. Chặn tombstone trước tiên — tránh NPE làm chết luồng
            .filter((key, order) -> order != null)

            // 2. LỌC TRƯỚC, đổi key SAU — giảm mạnh dữ liệu qua repartition
            .filter((key, order) -> "PAID".equals(order.getStatus()))
            .filter((key, order) -> order.getAmount().compareTo(NGUONG) > 0)

            // 3. Một đơn có nhiều dòng hàng — flatMapValues GIỮ key, không repartition
            .flatMapValues(Order::getLines)

            // 4. Giờ mới đổi key. ĐÂY là chỗ duy nhất repartition xảy ra.
            .selectKey((key, line) -> line.getProductId())

            // 5. mapValues (KHÔNG phải map) — key đã đúng, đừng gây repartition lần hai
            .mapValues(line -> line.getUnitPrice().multiply(
                    BigDecimal.valueOf(line.getQuantity())))

            .peek((productId, revenue) ->
                    log.debug("Doanh thu {}: {}", productId, revenue));
}
```

Năm bước, **đúng một lần repartition**, và nó nằm sau khi dữ liệu đã bị lọc bớt.

Đối chiếu với cách viết ngây thơ:

```java
// KÉM — repartition 100% bản ghi, rồi mới lọc
orders.map((k, o) -> KeyValue.pair(o.getProductId(), o))   // repartition TẤT CẢ
      .filter((k, o) -> "PAID".equals(o.getStatus()))
      .filter((k, o) -> o.getAmount().compareTo(NGUONG) > 0)
```

Nếu 90% đơn không phải `PAID`, cách kém đẩy qua mạng **gấp mười lần** dữ liệu.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Dùng `map` khi không đổi key | **Repartition vô ích**, thông lượng giảm một nửa | `mapValues` |
| Dùng `flatMap` khi không đổi key | Như trên | `flatMapValues` |
| `selectKey` trước khi `filter` | Repartition toàn bộ dữ liệu rồi mới vứt phần lớn đi | **Lọc trước, đổi key sau** |
| `selectKey` nhiều lần | Mỗi lần một topic repartition | Đổi key **một lần duy nhất** |
| Không kiểm tra `null` trong `filter` | NPE **làm chết cả luồng xử lý** | `order != null &&` |
| `split` không có `defaultBranch` | Bản ghi không khớp bị **bỏ im lặng** | Luôn có nhánh mặc định |
| Đảo thứ tự `branch` | Kết quả khác hẳn — bản ghi vào nhánh khớp **đầu tiên** | Đặt điều kiện hẹp nhất lên trước |
| Gọi database/HTTP trong `peek`/`foreach` | Chặn luồng xử lý → quá hạn poll → rebalance vô tận | Đưa ra consumer riêng ở cuối chuỗi |
| Không xem `topology.describe()` | Không biết mình đang tạo bao nhiêu topic nội bộ | In ra và đọc lúc phát triển |

## Tóm tắt bài 3

- Bốn nhóm phép không trạng thái: **lọc** (`filter`, `filterNot`), **biến đổi** (`map`, `mapValues`, `flatMap`, `flatMapValues`), **chẻ/gộp** (`split`, `merge`), **tác dụng phụ** (`peek`, `foreach`, `to`).
- **Chi tiết ẩn quan trọng nhất**: mọi phép **có thể đổi key** (`map`, `selectKey`, `flatMap`, `groupBy`) đều khiến Kafka Streams chèn một **topic repartition** ngầm — thêm một vòng ghi–đọc qua mạng cho **mỗi bản ghi**, thường làm thông lượng **giảm một nửa**.
- Kafka Streams **không phân tích code**, nó chỉ nhìn bạn gọi phép nào. Gọi `map` là tự nhận "key có thể đã đổi".
- **Tối ưu rẻ nhất trong Kafka Streams**: dùng **`mapValues` / `flatMapValues`** thay cho `map` / `flatMap` khi không đổi key. Sửa một chữ, thông lượng gấp đôi.
- Khi buộc phải đổi key: **lọc trước, đổi key sau**, và chỉ đổi **một lần**. Lọc bỏ 90% trước khi repartition thì lượng dữ liệu qua mạng giảm mười lần.
- Phát hiện repartition bằng **`topology.describe()`** (tìm topic hậu tố `-repartition` và ranh giới sub-topology) hoặc `kafka-topics.sh --list | grep repartition`.
- `split()` thay cho `branch()` cũ. Bản ghi vào **nhánh khớp đầu tiên**, nên **thứ tự nhánh quyết định kết quả**; **không có `defaultBranch` thì bản ghi không khớp bị bỏ im lặng**.
- **Đừng gọi database hay HTTP trong `peek`/`foreach`** — chúng chạy đồng bộ trên luồng xử lý và có thể gây rebalance vô tận.
- Luôn chặn `null` (tombstone) ở đầu chuỗi — một NPE làm chết cả luồng.

**Bài kế tiếp** → [Bài 4: Trạng thái — state store, RocksDB và changelog topic](04-trang-thai-state-store-va-changelog.md)

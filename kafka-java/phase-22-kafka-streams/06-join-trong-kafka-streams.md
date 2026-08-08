# Bài 6: Join trong Kafka Streams — bốn kiểu và yêu cầu đồng phân vùng

Join trong SQL là chuyện thường ngày: `SELECT * FROM orders JOIN customers ON ...`. Database quét cả hai bảng, ghép lại, xong.

Join trong luồng dữ liệu khó hơn nhiều, vì có một câu hỏi mà SQL không bao giờ phải trả lời:

> **Bản ghi bên kia CHƯA TỚI. Chờ bao lâu thì bỏ cuộc?**

Bài này đi qua bốn kiểu join, quy tắc chọn, và **yêu cầu đồng phân vùng** — điều kiện mà nếu thiếu, Kafka Streams sẽ cho ra kết quả thiếu bản ghi **mà không báo lỗi gì cả**.

## Điều kiện tiên quyết: đồng phân vùng

Trước khi nói về bất kỳ kiểu join nào, phải nắm điều này. Nó là nguồn của phần lớn lỗi join trong thực tế.

### Vì sao cần

Nhắc lại từ [bài 4](04-trang-thai-state-store-va-changelog.md): **mỗi task chỉ thấy state store của riêng nó**.

```text
   Topic "orders"     3 partition, key = customerId
   Topic "customers"  3 partition, key = customerId

   Task 0 xử lý:  orders-P0  +  customers-P0
   Task 1 xử lý:  orders-P1  +  customers-P1
   Task 2 xử lý:  orders-P2  +  customers-P2

   murmur2("KH-042") % 3 = 1
   → đơn của KH-042 vào orders-P1
   → hồ sơ KH-042 vào customers-P1
   → CẢ HAI cùng ở task 1  →  JOIN ĐƯỢC ✓
```

Bây giờ nếu số partition khác nhau:

```text
   Topic "orders"     3 partition
   Topic "customers"  6 partition        ← KHÁC

   murmur2("KH-042") % 3 = 1  →  orders-P1     →  task 1
   murmur2("KH-042") % 6 = 4  →  customers-P4  →  task 4

   → HAI TASK KHÁC NHAU. Task 1 KHÔNG BAO GIỜ thấy hồ sơ KH-042.
   → Join ra RỖNG cho khách này.
   → KHÔNG có exception. KHÔNG có cảnh báo. Chỉ là thiếu dữ liệu.
```

### Ba điều kiện đồng phân vùng

```text
   ┌─────────────────────────────────────────────────────────────┐
   │ 1. CÙNG SỐ PARTITION                                        │
   │ 2. CÙNG KIỂU KEY và cùng cách tuần tự hoá key               │
   │ 3. CÙNG CHIẾN LƯỢC PHÂN VÙNG (partitioner mặc định cả hai)  │
   └─────────────────────────────────────────────────────────────┘
```

Điều kiện 2 có một cái bẫy tinh vi: `Long` 42 và `String` "42" băm ra **hoàn toàn khác nhau**, dù nhìn bằng mắt thì giống.

```java
// Topic A: key kiểu Long     → Serdes.Long().serializer().serialize(42L)   → 8 byte
// Topic B: key kiểu String   → Serdes.String().serializer().serialize("42") → 2 byte
// murmur2 của hai mảng byte này KHÁC NHAU → partition khác nhau
```

Điều kiện 3 hay bị vi phạm khi một producer dùng custom partitioner ([Phase 21 bài 4](../phase-21-chu-de-tu-tai-lieu/04-gui-va-doc-partition-chi-dinh.md)) còn producer kia dùng mặc định.

### Cách kiểm tra và sửa

```bash
kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic orders | head -1
kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic customers | head -1
```

```text
Topic: orders     PartitionCount: 3   ReplicationFactor: 3
Topic: customers  PartitionCount: 6   ReplicationFactor: 3
                                 ▲
                          KHÔNG KHỚP → join sẽ thiếu dữ liệu
```

Ba cách sửa:

| Cách | Làm gì | Đánh đổi |
|---|---|---|
| **Sửa số partition** | Tạo lại topic với đúng số partition | Đúng nhất về lâu dài, nhưng phải chép dữ liệu |
| **`repartition()` tường minh** | Chủ động chia lại một luồng | Thêm topic nội bộ + một vòng mạng |
| **Dùng `GlobalKTable`** | Bỏ hẳn yêu cầu đồng phân vùng | Chỉ hợp với bảng nhỏ |

```java
// Cách 2 — buộc luồng khớp với bên kia
KStream<String, Order> daChiaLai = orders.repartition(
        Repartitioned.<String, Order>as("orders-copartitioned")
                     .withNumberOfPartitions(6));      // khớp với customers
```

> **Kafka Streams có kiểm tra số partition khi khởi động** và sẽ ném `TopologyException` nếu phát hiện lệch ở phép join yêu cầu đồng phân vùng. Nhưng nó **không** kiểm tra được điều kiện 2 và 3 — kiểu key và chiến lược phân vùng thì bạn phải tự đảm bảo.

## Bốn kiểu join

### 1. KStream ⋈ KTable — làm giàu dữ liệu

Kiểu phổ biến nhất, chiếm phần lớn nhu cầu thực tế.

```java
KStream<String, Order> orders = builder.stream("orders");
KTable<String, Customer> customers = builder.table("customers");

KStream<String, EnrichedOrder> enriched = orders.join(
        customers,
        (order, customer) -> EnrichedOrder.of(order, customer),
        Joined.with(Serdes.String(), orderSerde, customerSerde));
```

```text
   Ngữ nghĩa: MỖI bản ghi của luồng tra vào trạng thái HIỆN TẠI của bảng.

   Luồng:  ──●──────●───────────●──►
   Bảng:   ═══v1════════v2═══════════

   Bản ghi 1 ghép với v1
   Bản ghi 2 ghép với v1     (bảng chưa đổi)
   Bản ghi 3 ghép với v2     (bảng đã đổi)

   → Chỉ có LUỒNG kích hoạt join. Bảng đổi KHÔNG sinh kết quả mới.
```

Điểm cuối rất quan trọng và hay bị hiểu nhầm: **cập nhật bảng không phát ra kết quả join**. Nếu bạn muốn "khi khách đổi hạng thì tính lại mọi đơn cũ", đây **không phải** công cụ đúng.

Biến thể `leftJoin`:

```java
orders.leftJoin(customers,
        (order, customer) -> customer != null
                ? EnrichedOrder.of(order, customer)
                : EnrichedOrder.withoutCustomer(order));   // PHẢI đề phòng null
```

| | `join` (inner) | `leftJoin` |
|---|---|---|
| Không tìm thấy trong bảng | **Bỏ bản ghi** | Vẫn phát ra, tham số phải là `null` |
| Nguy cơ | **Mất dữ liệu im lặng** | NPE nếu quên kiểm tra null |

Với `join` thường, đơn hàng của một khách chưa có trong bảng sẽ **biến mất không dấu vết**. Trong hầu hết bài toán nghiệp vụ, `leftJoin` là lựa chọn an toàn hơn.

### 2. KStream ⋈ KStream — join hai luồng, bắt buộc có cửa sổ

```java
KStream<String, Order>   orders   = builder.stream("orders");
KStream<String, Payment> payments = builder.stream("payments");

KStream<String, OrderPayment> matched = orders.join(
        payments,
        (order, payment) -> new OrderPayment(order, payment),
        JoinWindows.ofTimeDifferenceAndGrace(
                Duration.ofMinutes(30), Duration.ofMinutes(5)),
        StreamJoined.with(Serdes.String(), orderSerde, paymentSerde));
```

**Cửa sổ là bắt buộc**, không có mặc định. Lý do:

```text
   Không có cửa sổ = phải nhớ MỌI bản ghi của cả hai luồng MÃI MÃI,
   phòng khi bản ghi khớp tới sau 3 năm.
   → State store phình vô hạn. Không khả thi.
```

Cửa sổ **đối xứng hai chiều**:

```text
   JoinWindows.ofTimeDifferenceAndGrace(30 phút, ...)

   Order lúc 10:00 ghép được với Payment trong khoảng 09:30 – 10:30
                                                      ▲         ▲
                                            30 phút TRƯỚC   30 phút SAU
```

Muốn lệch một chiều (ví dụ thanh toán luôn tới **sau** đơn hàng):

```java
JoinWindows.ofTimeDifferenceAndGrace(Duration.ofMinutes(30), Duration.ofMinutes(5))
           .before(Duration.ZERO)          // không nhìn về quá khứ
           .after(Duration.ofMinutes(30));  // chỉ nhìn 30 phút tới
```

Điều này **giảm một nửa** kích thước state store — đáng làm khi ngữ nghĩa nghiệp vụ cho phép.

Ba biến thể:

| Kiểu | Phát ra khi | Dùng cho |
|---|---|---|
| `join` (inner) | **Cả hai** bên đều có | Đối chiếu đơn hàng ↔ thanh toán |
| `leftJoin` | Bên trái có (phải có thể `null`) | **Tìm đơn CHƯA thanh toán** |
| `outerJoin` | **Bên nào** có cũng phát | Đối soát hai chiều |

`leftJoin` giữa hai luồng đặc biệt hữu ích và hay bị bỏ quên:

```java
// Tìm đơn hàng KHÔNG có thanh toán trong 30 phút
orders.leftJoin(payments, (order, payment) -> payment == null ? order : null,
                JoinWindows.ofTimeDifferenceAndGrace(Duration.ofMinutes(30), Duration.ofMinutes(5)))
      .filter((k, v) -> v != null)
      .to("orders-unpaid");
```

> **Lưu ý về thời điểm phát**: `leftJoin` giữa hai luồng **không** phát ra ngay khi cửa sổ đóng. Nó có thể phát ra cả bản ghi có cặp lẫn bản ghi `null` cho cùng một đơn (nếu thanh toán tới muộn hơn). Hạ nguồn phải chịu được điều đó — hoặc dùng `suppress`.

### 3. KTable ⋈ KTable — join hai bảng

```java
KTable<String, Customer> customers = builder.table("customers");
KTable<String, Address>  addresses = builder.table("addresses");

KTable<String, CustomerProfile> profiles = customers.join(
        addresses,
        (customer, address) -> new CustomerProfile(customer, address));
```

```text
   Ngữ nghĩa: KHÔNG có cửa sổ. Bên NÀO đổi cũng kích hoạt join lại.

   customers đổi → phát ra kết quả mới
   addresses đổi → phát ra kết quả mới

   → Đây là hành vi giống SQL nhất trong bốn kiểu.
```

Khác biệt then chốt so với KStream ⋈ KTable: ở đây **cả hai bên đều kích hoạt** join. Đây chính là công cụ cho bài toán *"khách đổi hạng thì tính lại"*.

### 4. KStream ⋈ GlobalKTable — tra cứu tự do

```java
GlobalKTable<String, Province> provinces = builder.globalTable("provinces");

KStream<String, EnrichedOrder> enriched = orders.join(
        provinces,
        (orderKey, order) -> order.getProvinceId(),        // HÀM RÚT KEY
        (order, province) -> order.withProvince(province));
```

Hai đặc quyền so với KTable thường:

| | KTable | GlobalKTable |
|---|---|---|
| Đồng phân vùng | **Bắt buộc** | **Không cần** |
| Key để tra | Bắt buộc là key của luồng | **Bất kỳ trường nào** rút ra được |

Cái giá đã nói ở [bài 2](02-kstream-ktable-globalktable.md): **nhân dữ liệu theo số instance**, và **không tôn trọng thời gian sự kiện** — luôn dùng trạng thái mới nhất.

## Bảng tổng hợp bốn kiểu

| | Cần cửa sổ | Cần đồng phân vùng | Bên nào kích hoạt | Có state store |
|---|---|---|---|---|
| **KStream ⋈ KTable** | Không | **Có** | Chỉ luồng | Bảng |
| **KStream ⋈ KStream** | **BẮT BUỘC** | **Có** | Cả hai | **Cả hai** — tốn nhất |
| **KTable ⋈ KTable** | Không | **Có** | Cả hai | Cả hai |
| **KStream ⋈ GlobalKTable** | Không | **Không** | Chỉ luồng | Bảng (đầy đủ, mọi instance) |

Bảng hỗ trợ inner/left/outer:

| | `join` | `leftJoin` | `outerJoin` |
|---|---|---|---|
| KStream ⋈ KTable | Có | Có | **Không** |
| KStream ⋈ KStream | Có | Có | **Có** |
| KTable ⋈ KTable | Có | Có | **Có** |
| KStream ⋈ GlobalKTable | Có | Có | **Không** |

Không có `outerJoin` cho KStream ⋈ KTable vì nó vô nghĩa: "bảng có mà luồng không có" không phải một sự kiện — không có gì kích hoạt nó.

## Foreign-key join — join theo khoá ngoài

Từ Kafka 2.4, KTable ⋈ KTable hỗ trợ join theo **khoá ngoài**, không cần cùng key:

```java
KTable<String, Order>    orders    = builder.table("orders");      // key = orderId
KTable<String, Customer> customers = builder.table("customers");   // key = customerId

KTable<String, EnrichedOrder> enriched = orders.join(
        customers,
        order -> order.getCustomerId(),                    // rút khoá ngoại
        (order, customer) -> EnrichedOrder.of(order, customer));
```

Đây là kiểu join gần với SQL nhất, và nó rất mạnh: **không cần đồng phân vùng, không cần GlobalKTable, hoạt động với bảng lớn.**

Cái giá: Kafka Streams phải tạo **nhiều topic nội bộ** để duy trì bảng ánh xạ ngược (customerId → những orderId nào đang trỏ tới). Một lời gọi `join` sinh ra bốn năm topic nội bộ.

```bash
kafka-topics.sh --list | grep enriched
```

```text
app-KTABLE-FK-JOIN-SUBSCRIPTION-REGISTRATION-0000000006-topic
app-KTABLE-FK-JOIN-SUBSCRIPTION-RESPONSE-0000000014-topic
app-KTABLE-FK-JOIN-SUBSCRIPTION-STATE-STORE-0000000008-changelog
...
```

| Ưu | Nhược |
|---|---|
| Không cần đồng phân vùng | **Nhiều topic nội bộ**, khó theo dõi |
| Hoạt động với bảng lớn | Độ trễ cao hơn (nhiều chặng qua Kafka) |
| Cả hai bên đổi đều kích hoạt | Tốn đĩa đáng kể |

## Bảng quyết định

```text
   Làm giàu sự kiện bằng dữ liệu tham chiếu NHỎ (tỉnh, tỉ giá)
        → KStream ⋈ GlobalKTable

   Làm giàu sự kiện bằng dữ liệu tham chiếu LỚN, cùng key
        → KStream ⋈ KTable

   Ghép hai loại SỰ KIỆN xảy ra gần nhau về thời gian
        → KStream ⋈ KStream, có cửa sổ

   Ghép hai BẢNG trạng thái, cùng key, cả hai đổi đều phải tính lại
        → KTable ⋈ KTable

   Ghép hai BẢNG theo KHOÁ NGOẠI (khác key)
        → foreign-key join
```

## Ví dụ hoàn chỉnh — đối soát đơn hàng và thanh toán

```java
@Bean
public BiFunction<KStream<String, Order>,
                  KStream<String, Payment>,
                  KStream<String, Reconciliation>> reconcile() {

    return (orders, payments) -> orders

            // Cả hai topic phải cùng key = orderId. Kiểm tra ở đây cho chắc.
            .selectKey((k, order) -> order.getOrderId())

            .leftJoin(
                payments.selectKey((k, p) -> p.getOrderId()),

                (order, payment) -> payment != null
                        ? Reconciliation.matched(order, payment)
                        : Reconciliation.unpaid(order),

                // Thanh toán chỉ tới SAU đơn hàng → lệch một chiều,
                // giảm một nửa state store
                JoinWindows.ofTimeDifferenceAndGrace(
                                Duration.ofMinutes(30), Duration.ofMinutes(5))
                           .before(Duration.ZERO)
                           .after(Duration.ofMinutes(30)),

                StreamJoined.with(Serdes.String(), orderSerde, paymentSerde)
                            .withStoreName("order-payment-join"))   // tên tường minh

            .peek((k, r) -> {
                if (r.isUnpaid()) {
                    log.warn("Đơn chưa thanh toán sau 30 phút: {}", r.getOrderId());
                }
            });
}
```

Bốn quyết định đáng chú ý:

| Quyết định | Vì sao |
|---|---|
| `selectKey` cả hai bên về `orderId` | Đảm bảo đồng phân vùng, không phụ thuộc producer đặt key đúng |
| `leftJoin` chứ không `join` | Mục tiêu là **tìm đơn chưa thanh toán** — `join` sẽ bỏ mất chúng |
| Cửa sổ lệch một chiều | Thanh toán không bao giờ tới trước đơn → **giảm nửa state store** |
| `withStoreName` tường minh | Đổi topology không mất trạng thái ([bài 4](04-trang-thai-state-store-va-changelog.md)) |

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Hai topic khác số partition | Join thiếu bản ghi — Kafka Streams bắt được và ném lỗi lúc khởi động |
| Hai topic cùng số partition nhưng **khác kiểu key** (`Long` vs `String`) | **Không bị bắt lỗi** — join ra rỗng, im lặng |
| Một bên dùng custom partitioner | **Không bị bắt lỗi** — join thiếu dữ liệu |
| Dùng `join` khi cần `leftJoin` | **Mất dữ liệu im lặng** — bản ghi không khớp biến mất |
| `leftJoin` mà quên kiểm tra `null` | NPE làm chết luồng xử lý |
| Cửa sổ join quá rộng | State store phình, tốn bộ nhớ và đĩa |
| Không dùng `.before()/.after()` khi ngữ nghĩa lệch một chiều | State store **lớn gấp đôi** cần thiết |
| Mong cập nhật KTable kích hoạt lại KStream ⋈ KTable | **Không xảy ra** — chỉ luồng kích hoạt. Cần KTable ⋈ KTable |
| Foreign-key join mà không tính topic nội bộ | Cụm phát sinh 4–5 topic cho mỗi lời gọi join |
| Không đặt `withStoreName` | Đổi topology → mất trạng thái join |
| GlobalKTable cho bảng lớn | Nhân theo số instance → hết đĩa |

## Tóm tắt bài 6

- **Đồng phân vùng là điều kiện tiên quyết** của mọi join trừ GlobalKTable: **cùng số partition, cùng kiểu key, cùng chiến lược phân vùng**. Kafka Streams chỉ bắt được điều kiện đầu — hai điều kiện sau sai thì **join ra rỗng, im lặng**.
- **KStream ⋈ KTable** (làm giàu): chỉ **luồng** kích hoạt. Cập nhật bảng **không** phát ra kết quả mới.
- **KStream ⋈ KStream**: **bắt buộc có cửa sổ**, vì không có cửa sổ thì phải nhớ mọi bản ghi mãi mãi. Cửa sổ đối xứng hai chiều — dùng `.before()/.after()` để lệch một chiều và **giảm một nửa state store**.
- **KTable ⋈ KTable**: không cửa sổ, **cả hai bên đổi đều kích hoạt** — gần SQL nhất, và là công cụ đúng cho "bảng đổi thì tính lại".
- **KStream ⋈ GlobalKTable**: bỏ hẳn yêu cầu đồng phân vùng và cho tra bằng **key bất kỳ** nhờ hàm rút key. Cái giá: nhân dữ liệu theo instance, không tôn trọng event time.
- **`join` bỏ bản ghi không khớp một cách im lặng.** Trong hầu hết bài toán nghiệp vụ, **`leftJoin` an toàn hơn** — nhưng phải kiểm tra `null`.
- **Không có `outerJoin` cho KStream ⋈ KTable** vì "bảng có mà luồng không có" không phải một sự kiện.
- **Foreign-key join** (Kafka 2.4+) cho KTable ⋈ KTable theo khoá ngoại, không cần đồng phân vùng và hoạt động với bảng lớn — đổi lại **sinh 4–5 topic nội bộ** cho mỗi lời gọi.
- Luôn đặt **`withStoreName`** tường minh để đổi topology không mất trạng thái.

**Bài kế tiếp** → [Bài 7: Topology, task, thread và vận hành ứng dụng Streams](07-topology-task-thread-va-van-hanh.md)

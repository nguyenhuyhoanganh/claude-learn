# Bài 2: KStream, KTable, GlobalKTable — ba trừu tượng cốt lõi

Nếu chỉ được nhớ một điều về Kafka Streams, hãy nhớ điều này:

> **Cùng một topic Kafka có thể được đọc theo hai cách hoàn toàn khác nhau: như một DÒNG SỰ KIỆN, hoặc như một BẢNG TRẠNG THÁI. Bạn chọn cách nào là quyết định thiết kế quan trọng nhất.**

Chọn sai thì kết quả sai — mà sai một cách âm thầm, không có exception nào cả. Bài này làm rõ khi nào chọn cái nào.

## Cùng dữ liệu, hai cách diễn giải

Giả sử topic `user-locations` nhận bốn bản ghi:

```text
   (KH-042, "Hà Nội")
   (KH-042, "Đà Nẵng")
   (KH-077, "Sài Gòn")
   (KH-042, "Cần Thơ")
```

### Đọc như KStream — dòng sự kiện

```text
   KStream = "những chuyện ĐÃ XẢY RA"
   ═══════════════════════════════════

   ┌────────────────────────────────────────────────────────┐
   │ KH-042 đã tới Hà Nội                                   │
   │ KH-042 đã tới Đà Nẵng                                  │
   │ KH-077 đã tới Sài Gòn                                  │
   │ KH-042 đã tới Cần Thơ                                  │
   └────────────────────────────────────────────────────────┘
              4 BẢN GHI — mỗi bản ghi là một SỰ KIỆN độc lập
              Bản ghi mới KHÔNG ghi đè bản ghi cũ
```

### Đọc như KTable — bảng trạng thái

```text
   KTable = "hiện tại đang thế nào"
   ════════════════════════════════

   Sau bản ghi 1:  KH-042 → Hà Nội
   Sau bản ghi 2:  KH-042 → Đà Nẵng     ← GHI ĐÈ, "Hà Nội" biến mất
   Sau bản ghi 3:  KH-042 → Đà Nẵng
                   KH-077 → Sài Gòn
   Sau bản ghi 4:  KH-042 → Cần Thơ     ← GHI ĐÈ tiếp
                   KH-077 → Sài Gòn

   ┌────────────────────────────────────────────────────────┐
   │  KH-042  →  Cần Thơ                                    │
   │  KH-077  →  Sài Gòn                                    │
   └────────────────────────────────────────────────────────┘
              2 DÒNG — key là khoá chính, bản ghi mới GHI ĐÈ
```

Cùng một topic. Cùng bốn bản ghi. **Bốn kết quả so với hai kết quả.**

## Bảng đối chiếu

| | **KStream** | **KTable** |
|---|---|---|
| Ý nghĩa | Dòng sự kiện — chuyện đã xảy ra | Bảng trạng thái — hiện tại thế nào |
| Bản ghi cùng key | **Cộng dồn**, cái sau không xoá cái trước | **Ghi đè**, chỉ giữ cái mới nhất |
| Value là `null` nghĩa là | Một sự kiện bình thường có giá trị rỗng | **XOÁ key đó** (tombstone) |
| Tương ứng trong SQL | `INSERT INTO` liên tục | Bảng có `PRIMARY KEY`, `UPSERT` |
| Ví dụ phù hợp | Click, giao dịch, đo lường cảm biến, đơn hàng | Hồ sơ khách hàng, tồn kho, giá hiện tại, cấu hình |
| Bao nhiêu bản ghi ra | **Mọi** bản ghi vào | Chỉ trạng thái mới nhất mỗi key |
| Có state store không | Không (trừ khi làm phép có trạng thái) | **Có** — phải nhớ giá trị hiện tại |

### Quy tắc chọn — một câu hỏi

```text
   "Bản ghi mới có làm bản ghi cũ cùng key TRỞ NÊN VÔ NGHĨA không?"

   CÓ  → KTable
         (địa chỉ mới thì địa chỉ cũ không còn đúng)

   KHÔNG → KStream
           (đơn hàng mới KHÔNG làm đơn hàng cũ biến mất)
```

Ví dụ để kiểm tra hiểu:

| Dữ liệu | Chọn | Vì sao |
|---|---|---|
| Đơn hàng | **KStream** | Đơn thứ hai không xoá đơn thứ nhất |
| Tồn kho hiện tại của sản phẩm | **KTable** | Số mới thay hoàn toàn số cũ |
| Giao dịch thẻ | **KStream** | Mỗi giao dịch tồn tại độc lập |
| Hạng thành viên | **KTable** | Lên hạng Vàng thì hạng Bạc không còn đúng |
| Vị trí GPS của tài xế | **Tuỳ** — KStream nếu cần vẽ lộ trình, KTable nếu chỉ cần vị trí hiện tại |
| Tỉ giá ngoại tệ | **KTable** | Chỉ tỉ giá mới nhất có ý nghĩa |

Dòng "vị trí GPS" là ví dụ hay nhất: **cùng một topic, chọn khác nhau tuỳ mục đích nghiệp vụ**.

## Tombstone — cách KTable xoá dữ liệu

Đây là hệ quả rất quan trọng của mô hình KTable:

```java
// Gửi một bản ghi có value = null
kafkaTemplate.send("customers", "KH-042", null);
```

```text
   Trong KStream: một bản ghi bình thường có value rỗng
                  → hàm xử lý của bạn nhận được null, phải tự đề phòng

   Trong KTable:  LỆNH XOÁ key "KH-042" khỏi bảng
                  → dòng đó biến mất khỏi state store
                  → mọi phép join dùng bảng này sẽ không tìm thấy KH-042 nữa
```

Bản ghi `value = null` gọi là **tombstone** (bia mộ). Nó cũng chính là cơ chế mà **log compaction** dùng để thật sự xoá dữ liệu khỏi Kafka.

> **Bẫy thực tế**: một producer vô tình gửi `null` (ví dụ đối tượng chưa khởi tạo, hoặc lỗi tuần tự hoá trả về null) vào một topic đang được đọc như KTable → **xoá mất một dòng dữ liệu** mà không có lỗi nào được ghi lại. Rất khó truy nguyên. Nên có kiểm tra ở phía producer.

## Tính hai mặt luồng–bảng (stream-table duality)

Đây là ý tưởng nền tảng, và nó giải thích vì sao Kafka Streams đơn giản đến vậy:

```text
   ┌─────────────────────────────────────────────────────────────┐
   │                                                              │
   │   BẢNG  =  ảnh chụp của LUỒNG tại một thời điểm             │
   │   LUỒNG =  nhật ký MỌI THAY ĐỔI của BẢNG                    │
   │                                                              │
   │   Hai thứ này chứa CÙNG MỘT LƯỢNG THÔNG TIN.                │
   │   Chuyển qua lại được, không mất mát.                        │
   └─────────────────────────────────────────────────────────────┘

   LUỒNG ──────► BẢNG        phát lại mọi thay đổi từ đầu
                              (gọi là "cuộn lại" — aggregate)

   BẢNG ───────► LUỒNG       ghi lại mỗi lần bảng đổi
                              (gọi là "changelog")
```

Nếu bạn thấy quen thì đúng vậy: đây chính là quan hệ giữa **binlog và bảng MySQL** đã bàn ở [Phase 20 bài 3](../phase-20-kafka-internals/03-doi-chieu-mysql-de-hieu-kafka.md). Bảng MySQL là trạng thái hiện tại; binlog là dòng thay đổi. Debezium chỉ đơn giản là biến chiều "bảng → luồng" thành sự kiện Kafka.

### Chuyển đổi trong code

```java
// KStream → KTable: gộp lại, chỉ giữ bản mới nhất mỗi key
KTable<String, Long> table = stream
        .groupByKey()
        .reduce((cu, moi) -> moi);          // luôn lấy giá trị mới

// Cách gọn hơn khi topic đã có key đúng:
KTable<String, Customer> customers = builder.table("customers");

// KTable → KStream: mỗi lần bảng đổi sinh một bản ghi
KStream<String, Customer> changes = customers.toStream();
```

`toStream()` rất hữu ích: nó biến "trạng thái" thành "sự kiện thay đổi trạng thái", để bạn phản ứng với **mỗi lần đổi** thay vì chỉ biết giá trị cuối.

## GlobalKTable — bản sao đầy đủ trên mọi instance

Khái niệm thứ ba, sinh ra để giải một vấn đề rất cụ thể.

### Vấn đề: KTable bị phân mảnh theo partition

```text
   Topic "customers" có 3 partition. Ứng dụng chạy 3 bản sao.

   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ Instance 1   │  │ Instance 2   │  │ Instance 3   │
   │ KTable phần  │  │ KTable phần  │  │ KTable phần  │
   │ của P0       │  │ của P1       │  │ của P2       │
   │              │  │              │  │              │
   │ KH-001       │  │ KH-042       │  │ KH-077       │
   │ KH-013       │  │ KH-055       │  │ KH-099       │
   └──────────────┘  └──────────────┘  └──────────────┘

   → Instance 1 KHÔNG BIẾT GÌ về KH-042.
   → Muốn join thì luồng bên kia PHẢI cùng partition với bảng.
```

Yêu cầu này gọi là **đồng phân vùng (co-partitioning)**, và nó khá phiền: hai topic phải cùng số partition, cùng chiến lược băm, cùng kiểu key. Chi tiết ở [bài 6](06-join-trong-kafka-streams.md).

### Lời giải: GlobalKTable

```text
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ Instance 1   │  │ Instance 2   │  │ Instance 3   │
   │ TOÀN BỘ bảng │  │ TOÀN BỘ bảng │  │ TOÀN BỘ bảng │
   │              │  │              │  │              │
   │ KH-001       │  │ KH-001       │  │ KH-001       │
   │ KH-013       │  │ KH-013       │  │ KH-013       │
   │ KH-042       │  │ KH-042       │  │ KH-042       │
   │ KH-055       │  │ KH-055       │  │ KH-055       │
   │ KH-077       │  │ KH-077       │  │ KH-077       │
   │ KH-099       │  │ KH-099       │  │ KH-099       │
   └──────────────┘  └──────────────┘  └──────────────┘

   Mọi instance đọc MỌI partition của topic đó.
   → Join được với BẤT KỲ key nào, KHÔNG cần đồng phân vùng.
```

```java
GlobalKTable<String, Customer> customers =
        builder.globalTable("customers",
                Materialized.with(Serdes.String(), customerSerde));
```

### So sánh KTable và GlobalKTable

| | KTable | GlobalKTable |
|---|---|---|
| Mỗi instance giữ | **Một phần** (partition được giao) | **Toàn bộ** |
| Bộ nhớ / đĩa tiêu tốn | Chia đều theo instance | **Nhân lên theo số instance** |
| Cần đồng phân vùng khi join | **Có** | **Không** |
| Join theo key gì | Chỉ key của bảng | **Bất kỳ trường nào** của luồng bên kia |
| Có tham gia rebalance không | Có | **Không** — mỗi instance tự đọc hết |
| Ngữ nghĩa thời gian khi join | Đồng bộ theo thời gian sự kiện | **Không đồng bộ** — luôn dùng trạng thái mới nhất |
| Hợp với | Dữ liệu lớn, đổi thường xuyên | **Dữ liệu nhỏ, ít đổi** |

Hai dòng cuối cần giải thích thêm.

**Về kích thước.** GlobalKTable nhân dữ liệu lên theo số instance. Bảng 10 GB × 6 instance = 60 GB đĩa. Nó chỉ hợp với **bảng tra cứu nhỏ**: danh mục tỉnh thành, mã sản phẩm, tỉ giá, cấu hình, danh sách quốc gia. Đừng dùng cho bảng khách hàng vài triệu dòng.

**Về ngữ nghĩa thời gian.** KTable join tôn trọng thời gian sự kiện — nếu bản ghi luồng có timestamp lúc 10:00 thì nó ghép với trạng thái bảng **tại lúc 10:00**. GlobalKTable thì **luôn dùng trạng thái mới nhất**, bất kể timestamp. Với dữ liệu ít đổi thì khác biệt không đáng kể; với dữ liệu đổi nhanh thì đây là nguồn của kết quả sai khó hiểu.

## Bảng chọn ba trừu tượng

```text
   Dữ liệu là SỰ KIỆN, cộng dồn                         → KStream
   Dữ liệu là TRẠNG THÁI, ghi đè theo key               → KTable
   Bảng TRA CỨU nhỏ, cần join với key bất kỳ            → GlobalKTable
```

Bảng chi tiết hơn:

| Tình huống | Chọn | Vì sao |
|---|---|---|
| Đơn hàng, thanh toán, click | KStream | Sự kiện độc lập |
| Tồn kho, hạng thành viên, giá | KTable | Trạng thái ghi đè |
| Danh mục tỉnh thành (63 dòng) | **GlobalKTable** | Nhỏ, ít đổi, cần join theo `provinceId` |
| Bảng khách hàng 5 triệu dòng | **KTable** | Quá lớn cho GlobalKTable |
| Tỉ giá ngoại tệ (30 cặp tiền) | **GlobalKTable** | Nhỏ, và mọi instance đều cần |
| Cấu hình theo tenant | **GlobalKTable** | Nhỏ, tra cứu bằng key bất kỳ |

## Ví dụ hoàn chỉnh — làm giàu đơn hàng

Bài toán: mỗi đơn hàng chỉ có `customerId` và `provinceId`. Cần bổ sung tên khách và tên tỉnh.

```java
@Configuration
public class OrderEnrichment {

    @Bean
    public BiFunction<KStream<String, Order>,
                      GlobalKTable<String, Province>,
                      KStream<String, EnrichedOrder>> enrichOrder(
            @Qualifier("customerTable") KTable<String, Customer> customers) {

        return (orders, provinces) -> orders
                // Bước 1: join với KTable khách hàng.
                // Cả hai đều dùng customerId làm key → đã đồng phân vùng.
                .join(customers,
                      (order, customer) -> EnrichedOrder.from(order, customer))

                // Bước 2: join với GlobalKTable tỉnh thành.
                // Key của luồng là customerId, KHÔNG phải provinceId —
                // nhưng GlobalKTable cho phép rút key từ chính bản ghi.
                .join(provinces,
                      (key, enriched) -> enriched.getProvinceId(),   // rút key
                      (enriched, province) -> enriched.withProvinceName(province.getName()));
    }
}
```

Chú ý sự khác biệt ở hai lời gọi `join`:

| | Join với KTable | Join với GlobalKTable |
|---|---|---|
| Số tham số | 2 (bảng, hàm ghép) | **3** (bảng, **hàm rút key**, hàm ghép) |
| Key dùng để tra | **Bắt buộc là key của luồng** | **Bất kỳ trường nào** rút ra được |
| Yêu cầu | Phải đồng phân vùng | Không |

Chính "hàm rút key" là thứ làm GlobalKTable linh hoạt hơn hẳn — bạn tra cứu bằng `provinceId` trong khi luồng đang dùng key `customerId`.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng KStream cho dữ liệu trạng thái | Kết quả cộng dồn sai — đếm ra 4 thay vì 2 |
| Dùng KTable cho dữ liệu sự kiện | **Mất dữ liệu** — đơn hàng sau ghi đè đơn hàng trước |
| Producer vô tình gửi `value = null` vào topic đọc như KTable | **Xoá mất một dòng**, im lặng, rất khó truy nguyên |
| GlobalKTable cho bảng lớn | Nhân dữ liệu theo số instance → hết đĩa, khởi động rất lâu |
| Quên rằng KTable join cần **đồng phân vùng** | Kết quả thiếu bản ghi, không có lỗi nào |
| Tưởng GlobalKTable tôn trọng thời gian sự kiện | Kết quả sai khi dữ liệu tra cứu đổi nhanh |
| Đọc topic không có key làm KTable | Mọi bản ghi coi như cùng key `null` → bảng chỉ có một dòng |
| Không đặt Serde cho KTable | Lỗi tuần tự hoá lúc chạy, khó đọc |

Dòng "topic không có key" đáng nói thêm: `builder.table("topic")` trên một topic mà producer gửi key `null` sẽ tạo ra một bảng **chỉ có đúng một dòng**, liên tục bị ghi đè. Không có cảnh báo nào. Luôn đảm bảo topic dùng làm KTable có key nghiệp vụ rõ ràng.

## Tóm tắt bài 2

- **Cùng một topic đọc được theo hai cách**: **KStream** (dòng sự kiện, cộng dồn) hoặc **KTable** (bảng trạng thái, ghi đè theo key). Đây là quyết định thiết kế quan trọng nhất, và chọn sai thì **sai âm thầm, không có exception**.
- Câu hỏi để chọn: *"bản ghi mới có làm bản ghi cũ cùng key trở nên vô nghĩa không?"* Có → KTable. Không → KStream.
- Trong KTable, **`value = null` nghĩa là XOÁ key đó** (tombstone). Một producer vô tình gửi `null` sẽ xoá mất dữ liệu mà không báo gì.
- **Tính hai mặt luồng–bảng**: bảng là ảnh chụp của luồng, luồng là nhật ký thay đổi của bảng. Hai thứ chứa cùng lượng thông tin và chuyển qua lại được — đúng quan hệ giữa **bảng MySQL và binlog**.
- **GlobalKTable** giữ **toàn bộ** bảng trên **mọi** instance. Đổi lại: không cần đồng phân vùng, join được bằng **key bất kỳ** nhờ hàm rút key.
- GlobalKTable **nhân dữ liệu theo số instance** → chỉ dùng cho **bảng tra cứu nhỏ, ít đổi** (tỉnh thành, tỉ giá, cấu hình). Và nó **không tôn trọng thời gian sự kiện** — luôn dùng trạng thái mới nhất.
- Join với KTable nhận **2 tham số**; join với GlobalKTable nhận **3** — thêm **hàm rút key**, và đó chính là thứ làm nó linh hoạt.
- Topic dùng làm KTable **bắt buộc phải có key nghiệp vụ**. Key `null` sẽ tạo ra bảng chỉ có một dòng.

**Bài kế tiếp** → [Bài 3: Phép biến đổi không trạng thái — và bẫy repartition ẩn](03-phep-bien-doi-khong-trang-thai.md)

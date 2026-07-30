# Case 3: Tách service theo nút thắt — không phải theo sơ đồ đẹp

Đội kiến trúc vẽ sơ đồ 15 microservice: `user-service`, `product-service`, `order-service`, `payment-service`, `notification-service`... Trông rất chuyên nghiệp, rất "đúng sách".

Sáu tháng sau:

```text
   ├─ Mỗi thay đổi nghiệp vụ phải sửa 4 service và deploy đồng bộ
   ├─ Latency tăng từ 80 ms lên 400 ms
   ├─ Không ai debug được vì log nằm rải rác 15 nơi
   ├─ 15 service vẫn dùng chung MỘT database
   └─ Thời gian đưa tính năng ra thị trường chậm gấp 3 lần
```

Đây là **distributed monolith** (monolith phân tán) — kiến trúc tệ nhất trong mọi lựa chọn: bạn có đủ độ phức tạp của hệ phân tán mà không có lợi ích nào của nó.

Bài này nói về cách tách service cho đúng: **tách vì lý do cụ thể, không phải vì sơ đồ đẹp**.

## Bốn lý do chính đáng để tách service

Chỉ tách khi có ít nhất một trong bốn lý do sau, và lý do đó **đo được**:

### Lý do 1: Nhu cầu tài nguyên khác biệt rõ rệt

```text
   Module xử lý video : 8 CPU, 16 GB RAM, chạy 20 phút mỗi tác vụ
   Module API đơn hàng: 0,5 CPU, 512 MB, chạy 50 ms mỗi request

   Chung một deployment ⇒ phải cấp 8 CPU cho MỌI instance
                        ⇒ lãng phí khủng khiếp
```

Đây là lý do rõ ràng nhất và dễ chứng minh nhất bằng con số chi phí.

### Lý do 2: Nhu cầu scale khác biệt

```text
   Tìm kiếm sản phẩm: 10.000 RPS  → cần 40 instance
   Quản trị viên    : 5 RPS       → cần 2 instance

   Chung ⇒ 40 instance đều chứa cả code quản trị (không sao)
        ⇒ nhưng mỗi lần deploy code quản trị phải deploy 40 instance
```

### Lý do 3: Cách ly sự cố cho chức năng sống còn

Thanh toán không được phép chết vì module gợi ý sản phẩm lỗi.

Nhưng lưu ý: **bulkhead trong monolith giải quyết được 80% vấn đề này** (phase-2 case 5) với chi phí thấp hơn nhiều. Chỉ tách khi cần cách ly ở mức tiến trình — ví dụ module hay gây `OutOfMemoryError` hoặc dùng thư viện native hay crash.

### Lý do 4: Ranh giới đội và tốc độ phát triển

```text
   4 đội cùng làm trên một codebase:
   ├─ Xung đột merge liên tục
   ├─ Deploy phải phối hợp giữa các đội
   ├─ Lỗi của đội A chặn release của đội B
   └─ Bộ test chạy 45 phút cho mọi thay đổi
```

Đây là **lý do phổ biến nhất trong thực tế** — và nó hoàn toàn chính đáng. Chỉ cần gọi đúng tên: bạn tách vì lý do tổ chức, không phải vì hiệu năng.

Quy luật Conway nói rằng cấu trúc hệ thống sẽ phản ánh cấu trúc tổ chức. Tách service theo ranh giới đội là làm điều đó một cách có chủ ý.

## Bốn lý do KHÔNG chính đáng

| Lý do | Vì sao sai |
|---|---|
| "Microservice là kiến trúc hiện đại" | Không phải lý do kỹ thuật. Độ phức tạp phải có ai đó trả giá |
| "Để dễ scale hơn" | Monolith stateless scale ngang rất tốt. Nút thắt thường là database |
| "Để nhanh hơn" | Chậm hơn: lời gọi mạng chậm hơn lời gọi hàm 100.000 lần |
| "Để dùng nhiều ngôn ngữ" | Hiếm khi là nhu cầu thật; và làm tăng chi phí vận hành rất nhiều |

## Cách chọn ranh giới — sai lầm phổ biến nhất

### Sai: tách theo tầng kỹ thuật

```text
   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
   │ api-service  │→ │ logic-service│→ │  dao-service │
   └──────────────┘  └──────────────┘  └──────────────┘

   Mọi thay đổi nghiệp vụ đều phải sửa cả 3 service.
   Đây là monolith bị cắt ngang — tệ nhất trong mọi cách cắt.
```

### Sai: tách theo thực thể dữ liệu

```text
   user-service, product-service, order-service, address-service, ...

   Nghe hợp lý, nhưng: đặt một đơn hàng cần gọi 5 service.
   Và "đơn hàng" cần biết thông tin sản phẩm, người dùng, địa chỉ
   ⇒ chatty (nói chuyện quá nhiều), latency cao, khó đảm bảo nhất quán.
```

Đây là bẫy tinh vi: tách theo bảng dữ liệu **có vẻ** đúng nhưng tạo ra rất nhiều lời gọi chéo.

### Đúng: tách theo năng lực nghiệp vụ

```text
   Hỏi: "Nếu tách cái này ra, nó có tự hoàn thành được một việc
         có ý nghĩa với người dùng không?"

   ┌─────────────────────────────────────────────────────┐
   │ ĐẶT HÀNG (Order)                                    │
   │ Sở hữu: đơn hàng, giỏ hàng, chi tiết đơn            │
   │ Tự làm được: nhận đơn, tính tổng, theo dõi trạng thái│
   ├─────────────────────────────────────────────────────┤
   │ KHO (Inventory)                                     │
   │ Sở hữu: tồn kho, đặt trước, nhập/xuất               │
   │ Tự làm được: giữ hàng, trừ kho, cảnh báo hết hàng   │
   ├─────────────────────────────────────────────────────┤
   │ THANH TOÁN (Payment)                                │
   │ Sở hữu: giao dịch, hoàn tiền, phương thức thanh toán│
   │ Tự làm được: thu tiền, hoàn tiền, đối soát          │
   └─────────────────────────────────────────────────────┘
```

Kiểm tra ranh giới đúng bằng ba câu hỏi:

| Câu hỏi | Nếu trả lời "không" thì |
|---|---|
| Service có **sở hữu dữ liệu** của mình không? | Ranh giới sai — dữ liệu bị chia đôi |
| Một thay đổi nghiệp vụ điển hình có nằm gọn trong **một** service không? | Ranh giới sai — cắt qua giữa một khái niệm |
| Service có deploy độc lập được không? | Ranh giới sai — có phụ thuộc chặt |

Câu hỏi thứ hai là thước đo tốt nhất. Hãy nhìn lại 20 thay đổi gần nhất trong dự án: nếu phần lớn chỉ đụng một module, ranh giới đó tốt. Nếu mỗi thay đổi đụng 4 module, đó không phải ranh giới.

## Chống chỉ định tuyệt đối: dùng chung database

```text
   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
   │order-service │   │inventory-svc │   │payment-svc   │
   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             ▼
                    ┌─────────────────┐
                    │  MỘT DATABASE   │   ← ĐÂY LÀ MONOLITH PHÂN TÁN
                    └─────────────────┘
```

Vì sao đây là điều tệ nhất:

| Vấn đề | Chi tiết |
|---|---|
| Không deploy độc lập được | Đổi schema phải phối hợp mọi service |
| Không scale độc lập được | Vẫn chung một nút thắt |
| Không cách ly sự cố | Database chết là tất cả chết |
| Coupling ẩn | Service A đọc bảng của B, B đổi cột → A hỏng, không ai biết trước |
| Vẫn có lock chung | Toàn bộ phase-3 vẫn áp dụng |

**Nếu các service dùng chung database, bạn có tất cả nhược điểm của microservice và không có ưu điểm nào.** Thà giữ monolith còn hơn.

Nguyên tắc: **mỗi service sở hữu dữ liệu của mình, và service khác chỉ truy cập qua API**.

### Nhưng làm sao JOIN dữ liệu giữa các service?

Đây là câu hỏi đầu tiên ai cũng hỏi, và câu trả lời quyết định thành bại.

**Cách 1: Gọi API và gộp ở tầng ứng dụng**

```java
public OrderView getOrderView(Long orderId) {
    Order order = orderRepository.findById(orderId).orElseThrow();
    Product product = productClient.get(order.getProductId());     // gọi mạng
    return new OrderView(order, product);
}
```

Đơn giản nhưng chậm và mong manh (mọi vấn đề phase-4 áp dụng).

**Cách 2: Sao chép dữ liệu cần thiết (data replication)**

```java
@Entity
public class Order {
    private Long productId;

    // Sao chép các trường CẦN THIẾT tại thời điểm đặt hàng
    private String productNameSnapshot;
    private BigDecimal priceSnapshot;
}
```

Nghe có vẻ "vi phạm chuẩn hoá", nhưng thực ra **đúng về mặt nghiệp vụ**: đơn hàng phải giữ giá tại thời điểm mua, không phải giá hiện tại. Sản phẩm đổi tên hay đổi giá thì đơn hàng cũ không được thay đổi.

Rất nhiều trường hợp "cần JOIN" thực ra là "cần bản chụp tại thời điểm giao dịch" — và bản chụp thì không cần JOIN.

**Cách 3: Materialized view qua sự kiện**

```java
@KafkaListener(topics = "product-events")
public void onProductChanged(ProductEvent e) {
    productViewRepository.upsert(new ProductView(
        e.getId(), e.getName(), e.getPrice(), e.getImageUrl()));
}
```

Mỗi service giữ một bản sao chỉ đọc của dữ liệu nó cần, cập nhật qua sự kiện. Đọc thì nhanh, không gọi mạng.

Đánh đổi: **nhất quán cuối cùng** (eventual consistency) — bản sao trễ vài trăm mili-giây tới vài giây. Với hầu hết nghiệp vụ đọc, hoàn toàn chấp nhận được.

**Cách 4: API Composition / BFF**

Một tầng riêng (Backend For Frontend) gọi nhiều service và gộp kết quả, có cache. Giữ cho các service lõi sạch sẽ.

## Strangler Fig — cách tách an toàn

Đặt tên theo loài cây si bóp nghẹt: nó mọc quanh cây chủ, dần thay thế, cuối cùng cây chủ biến mất.

```text
   Giai đoạn 1: Đặt proxy trước monolith
   [Client] → [Proxy] → [Monolith]

   Giai đoạn 2: Tách một chức năng, proxy định tuyến một phần nhỏ
   [Client] → [Proxy] ─┬─ 95% ─→ [Monolith]
                       └─  5% ─→ [inventory-service]  (mới)

   Giai đoạn 3: Tăng dần tỉ lệ, theo dõi kỹ
   [Client] → [Proxy] ─┬─ 50% ─→ [Monolith]
                       └─ 50% ─→ [inventory-service]

   Giai đoạn 4: Chuyển hết, xoá code cũ khỏi monolith
   [Client] → [Proxy] ──100% ──→ [inventory-service]
```

```yaml
# Spring Cloud Gateway: định tuyến theo trọng số
spring:
  cloud:
    gateway:
      routes:
        - id: inventory-new
          uri: lb://inventory-service
          predicates:
            - Path=/api/inventory/**
            - Weight=inventory-group, 5
        - id: inventory-old
          uri: lb://monolith
          predicates:
            - Path=/api/inventory/**
            - Weight=inventory-group, 95
```

Ưu điểm quyết định của cách này: **quay lại được bất cứ lúc nào** bằng cách đổi trọng số về 0. Không có "ngày trọng đại" mà mọi thứ chuyển cùng lúc và cầu nguyện.

### Chuyển dữ liệu — phần khó nhất

Tách code dễ; tách dữ liệu mới khó. Quy trình an toàn:

```text
   Bước 1: Service mới ghi vào database mới, ĐỒNG THỜI ghi vào database cũ
           (dual write — tạm thời chấp nhận trùng lặp)
   Bước 2: Sao chép dữ liệu lịch sử sang database mới (backfill)
   Bước 3: Đối soát — so sánh hai bên, sửa lệch
   Bước 4: Chuyển đọc sang database mới, vẫn ghi cả hai
   Bước 5: Theo dõi 1-2 tuần
   Bước 6: Ngừng ghi vào database cũ
   Bước 7: Xoá bảng cũ (sau khi backup)
```

Bước 3 (đối soát) là bước hay bị bỏ qua nhất và quan trọng nhất:

```java
@Scheduled(cron = "0 */10 * * * *")
public void reconcile() {
    List<Long> ids = sampleIds(1000);
    for (Long id : ids) {
        var oldData = legacyRepository.findById(id);
        var newData = newRepository.findById(id);
        if (!Objects.equals(normalize(oldData), normalize(newData))) {
            reconciliationMismatchCounter.increment();
            log.error("Dữ liệu lệch tại id={}: cũ={} mới={}", id, oldData, newData);
        }
    }
}
```

Cảnh báo về **dual write**: ghi vào hai nơi không phải thao tác nguyên tử. Nếu ghi database mới thành công mà database cũ thất bại, bạn có dữ liệu lệch. Với dữ liệu quan trọng, dùng **CDC (Change Data Capture)** thay vì dual write — đọc binlog/WAL của database cũ và đồng bộ sang mới. Nó chậm hơn vài trăm mili-giây nhưng không bao giờ mất bản ghi.

## Chi phí của việc tách — nói thẳng

Đây là phần các bài viết về microservice thường bỏ qua. Sau khi tách, bạn **phải** có:

| Hạng mục | Vì sao bắt buộc | Nếu không có |
|---|---|---|
| Distributed tracing | Theo dấu request qua nhiều service | Không debug được |
| Log tập trung | Log nằm rải rác | Mất hàng giờ mỗi lần điều tra |
| Service discovery | Service tìm nhau | Hard-code địa chỉ IP |
| CI/CD cho từng service | Deploy độc lập | Vẫn phải deploy đồng bộ |
| Quản lý phiên bản API | Service tiến hoá độc lập | Đổi API là hỏng service khác |
| Circuit breaker, retry, timeout | Mạng không đáng tin | Cascading failure (phase-4) |
| Saga / xử lý giao dịch phân tán | Không còn ACID xuyên service | Dữ liệu không nhất quán |
| Môi trường phát triển cục bộ | Lập trình viên cần chạy được | Không phát triển được |

Ước lượng thực tế: **chi phí vận hành tăng 2-3 lần** với hệ vài chục service. Nếu đội của bạn chưa có nền tảng này, tách service sẽ làm tốc độ phát triển **chậm lại**, không nhanh lên.

Đây là lý do khuyến nghị phổ biến là **bắt đầu bằng monolith có module rõ ràng** (modular monolith), và chỉ tách khi đau đớn thực sự xuất hiện.

## Modular monolith — bước trung gian bị đánh giá thấp

```text
   src/main/java/com/shop/
   ├── order/
   │   ├── api/          ← chỉ đây được gọi từ module khác
   │   ├── domain/       ← private
   │   ├── infra/        ← private
   │   └── OrderModule.java
   ├── inventory/
   │   ├── api/
   │   └── ...
   └── payment/
       └── ...
```

Quy tắc: module chỉ được gọi nhau **qua package `api`**, không bao giờ chạm vào `domain` hay `infra` của module khác. Kiểm tra tự động bằng ArchUnit:

```java
@ArchTest
static final ArchRule modulesShouldOnlyUseApi = classes()
    .that().resideInAPackage("..order..")
    .should().onlyDependOnClassesThat()
    .resideInAnyPackage("..order..", "..inventory.api..", "..payment.api..", "java..");
```

Với Spring Modulith, việc này còn được hỗ trợ sẵn: kiểm tra ranh giới, sinh tài liệu, và giao tiếp giữa module bằng sự kiện.

Lợi ích: bạn có **ranh giới rõ ràng** (lợi ích chính của microservice) mà **không có chi phí mạng và vận hành**. Và khi cần tách thật, module đã sẵn sàng — chỉ việc chuyển lời gọi hàm thành lời gọi HTTP.

## Trường hợp thực tế: tách đúng một service

Bối cảnh: sàn thương mại điện tử, monolith 400.000 dòng code, 25 lập trình viên.

**Vấn đề đo được**:

```text
   Module xử lý ảnh sản phẩm:
   ├─ Chiếm 70% CPU của toàn hệ thống
   ├─ Gây OutOfMemoryError 2-3 lần/tuần (dùng thư viện native)
   ├─ Mỗi lần OOM làm chết cả instance → mất mọi chức năng khác
   └─ Chỉ 3 người trong đội làm việc với module này
```

Bốn lý do chính đáng đều thoả mãn: **tài nguyên khác biệt, scale khác biệt, cần cách ly ở mức tiến trình, đội riêng**.

**Cách làm**:

```text
   Tuần 1-2 : Tách thành module riêng trong monolith, ranh giới rõ ràng
              (ArchUnit kiểm tra không ai gọi vào bên trong)
   Tuần 3-4 : Đưa vào service riêng, giao tiếp qua Kafka
              (ảnh tải lên → sự kiện → image-service xử lý → sự kiện kết quả)
   Tuần 5   : Chuyển 10% lưu lượng, theo dõi
   Tuần 6-7 : Tăng dần lên 100%
   Tuần 8   : Xoá code cũ khỏi monolith
```

Chọn giao tiếp bất đồng bộ qua Kafka (không phải HTTP đồng bộ) là quyết định quan trọng: xử lý ảnh mất 5-30 giây, không thể để người dùng chờ. Người dùng tải ảnh lên, nhận `202 Accepted`, ảnh xuất hiện sau vài giây.

**Kết quả sau 3 tháng**:

| Chỉ số | Trước | Sau |
|---|---|---|
| Instance monolith | 20 × (8 CPU/16 GB) | 20 × (2 CPU/4 GB) |
| Instance image-service | — | 4 × (8 CPU/16 GB) |
| Chi phí hạ tầng | 100% | **58%** |
| Sự cố OOM ảnh hưởng người dùng | 2-3/tuần | **0** |
| Thời gian deploy monolith | 25 phút | 18 phút |

**Và họ dừng ở đó.** Không tách thêm service nào trong 2 năm tiếp theo, vì không có module nào khác thoả mãn các tiêu chí trên.

Đây là bài học lớn nhất: **microservice không phải mục tiêu, nó là công cụ cho vấn đề cụ thể**. Tách một service vì lý do rõ ràng có giá trị hơn tách mười lăm service vì sơ đồ đẹp.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Tách theo tầng kỹ thuật | Mọi thay đổi đụng nhiều service |
| Dùng chung database | Distributed monolith — tệ nhất |
| Tách nhiều service cùng lúc | Không đo được cái nào có tác dụng, không quay lại được |
| Không có tracing/log tập trung trước khi tách | Không debug được |
| Gọi đồng bộ theo chuỗi dài | Tail latency amplification (phase-1 bài 3) |
| Dual write cho dữ liệu quan trọng | Lệch dữ liệu khi một bên lỗi — dùng CDC |
| Không có bước đối soát | Lệch dữ liệu âm thầm |
| Bỏ qua modular monolith | Trả chi phí phân tán mà chưa cần |
| Tách vì "hiện đại" | Độ phức tạp tăng, tốc độ phát triển giảm |

## Tóm tắt case 3

- Chỉ tách khi có **lý do đo được**: tài nguyên khác biệt, scale khác biệt, cần cách ly tiến trình, hoặc ranh giới đội.
- **Distributed monolith** (nhiều service dùng chung database) là kiến trúc tệ nhất — mọi nhược điểm, không ưu điểm nào.
- Tách theo **năng lực nghiệp vụ**, không theo tầng kỹ thuật hay bảng dữ liệu.
- Thước đo ranh giới tốt: **một thay đổi nghiệp vụ điển hình chỉ đụng một service**.
- Thay JOIN bằng: **sao chép bản chụp** (thường đúng về nghiệp vụ), materialized view qua sự kiện, hoặc BFF.
- Dùng **Strangler Fig** — chuyển dần theo trọng số, quay lại được bất cứ lúc nào.
- Chuyển dữ liệu: **CDC thay vì dual write**, và luôn có bước **đối soát**.
- **Modular monolith** cho bạn ranh giới rõ ràng mà không có chi phí phân tán — thường là điểm dừng đúng.

**Bài kế tiếp** → [Case 4: Async hoá bằng hàng đợi — đổi tính tức thời lấy khả năng chịu tải](04-case-async-hoa-queue.md)

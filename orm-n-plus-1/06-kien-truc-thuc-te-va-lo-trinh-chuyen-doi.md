# Bài 6: Kiến trúc thực tế — cách các đội triển khai và chuyển đổi dần

Bài 4 nói **nên làm gì** (ORM cho ghi, SQL cho đọc). Bài 5 nói **viết bằng gì**. Bài này trả lời câu khó nhất:

> *"Codebase của tôi đã có 300 repository JPA và chạy 4 năm rồi. Làm sao đi tới đó mà không dừng phát triển tính năng 6 tháng?"*

Đây là câu hỏi mà mọi kỹ sư senior phải trả lời được, và nó **không phải câu hỏi kỹ thuật thuần tuý** — nó là câu hỏi về lộ trình, ranh giới, và cách giữ cho đội không quay lại thói quen cũ.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **CQRS-lite** | xi-kiu-a-ét-ét | **Tách đọc–ghi nhẹ** — hai tầng truy cập trong **một** ứng dụng, **một** database |
| **Command** | com-mần | **Lệnh** — thao tác **thay đổi** dữ liệu |
| **Query** | qua-ri | **Truy vấn** — thao tác **chỉ đọc** |
| **Aggregate** | ắc-gri-gợt | **Cụm** — nhóm entity được lưu/đọc như một khối, có một gốc |
| **Bounded context** | bao-nhịt | **Ngữ cảnh giới hạn** — một vùng nghiệp vụ có mô hình riêng |
| **Strangler Fig** | strang-lơ | **Mẫu cây bóp nghẹt** — thay thế hệ cũ **từng phần**, không viết lại một lần |
| **ADR** (*Architecture Decision Record*) | ây-đi-a | **Bản ghi quyết định kiến trúc** — văn bản ghi lại *vì sao* chọn cách này |
| **ArchUnit** | ác-kiu-nít | Thư viện viết **test cho kiến trúc** (ai được gọi ai) |
| **Fitness function** | phít-nít | **Hàm đo sức khoẻ kiến trúc** — test tự động chống xói mòn |
| **`readOnly = true`** | | Cờ báo transaction **chỉ đọc** — Hibernate bỏ dirty checking |
| **Open Session In View** | | Giữ Persistence Context **mở tới lúc render** — mặc định bật trong Spring Boot |
| **Anti-corruption layer** | | **Lớp chống nhiễm** — ngăn mô hình tầng này rò sang tầng khác |
| **`@Version`** | | Cột đếm phiên bản cho **khoá lạc quan** |

## Kiến trúc đích: một database, hai đường đi

```text
┌──────────────────────────────────────────────────────────────────────┐
│                          TẦNG WEB (Controller)                        │
│    POST /orders          GET /orders?page=0        GET /reports/rev   │
└────────┬───────────────────────┬──────────────────────┬──────────────┘
         │                       │                      │
         ▼                       ▼                      ▼
┌──────────────────┐  ┌────────────────────┐  ┌─────────────────────┐
│  OrderCommand    │  │   OrderQuery       │  │  RevenueReport      │
│  Service         │  │   Service          │  │  Service            │
│                  │  │                    │  │                     │
│ @Transactional   │  │ @Transactional(    │  │ @Transactional(     │
│                  │  │    readOnly=true)  │  │    readOnly=true)   │
│ · nghiệp vụ      │  │ · không nghiệp vụ  │  │ · thuần SQL         │
│ · bất biến       │  │ · chỉ định dạng    │  │ · window function   │
│ · sự kiện        │  │                    │  │                     │
└────────┬─────────┘  └─────────┬──────────┘  └──────────┬──────────┘
         │                      │                        │
         ▼                      ▼                        ▼
┌──────────────────┐  ┌────────────────────┐  ┌─────────────────────┐
│ JpaRepository    │  │ OrderQueryDao      │  │ ReportDao           │
│ <Order, Long>    │  │  (JdbcClient/jOOQ) │  │  (JdbcClient/jOOQ)  │
│                  │  │                    │  │                     │
│ TRẢ VỀ: Entity   │  │ TRẢ VỀ: record DTO │  │ TRẢ VỀ: record DTO  │
│ CÓ: dirty check, │  │ KHÔNG: entity,     │  │ KHÔNG: entity       │
│  @Version,       │  │  lazy loading,     │  │                     │
│  cascade         │  │  Persistence Ctx   │  │                     │
└────────┬─────────┘  └─────────┬──────────┘  └──────────┬──────────┘
         │                      │                        │
         └──────────────────────┴────────────────────────┘
                                │
                          ┌─────▼──────┐
                          │  DataSource │   ← MỘT nguồn, MỘT transaction manager
                          └─────┬──────┘
                                ▼
                          ┌──────────────┐
                          │  PostgreSQL  │   ← MỘT database. KHÔNG đồng bộ, KHÔNG event.
                          └──────────────┘
```

```text
   ĐIỀU QUAN TRỌNG NHẤT PHẢI HIỂU VỀ SƠ ĐỒ NÀY:

   ĐÂY KHÔNG PHẢI CQRS "ĐẦY ĐỦ".
      Không có database đọc riêng.
      Không có event sourcing.
      Không có đồng bộ, không có độ trễ, không có nhất quán cuối cùng.

   Chỉ là HAI CÁCH ĐỌC CÙNG MỘT BẢNG.
      → Rủi ro gần bằng không.
      → Có thể áp dụng cho MỘT màn hình rồi dừng lại.
      → Không cần xin duyệt kiến trúc lớn.

   ⚠ ĐỪNG NHẦM với CQRS đầy đủ. Nếu ai hỏi trong phỏng vấn,
     hãy gọi đúng tên: "tách tầng đọc, không phải CQRS đầy đủ".
```

## Cấu trúc thư mục — ranh giới phải nhìn thấy được

```text
com.shop.order
├── OrderController.java              ← gọi CẢ HAI tầng
│
├── command/                          ← TẦNG GHI: được dùng entity
│   ├── OrderCommandService.java
│   ├── OrderRepository.java          (extends JpaRepository)
│   └── dto/
│       ├── CreateOrderRequest.java
│       └── CancelOrderRequest.java
│
├── query/                            ← TẦNG ĐỌC: CẤM chạm entity
│   ├── OrderQueryService.java
│   ├── OrderQueryDao.java            (JdbcClient / jOOQ)
│   └── view/
│       ├── OrderCard.java            (record)
│       ├── OrderDetailView.java      (record)
│       └── OrderLineView.java        (record)
│
└── domain/                           ← MÔ HÌNH NGHIỆP VỤ
    ├── Order.java                    (@Entity)
    ├── OrderItem.java                (@Entity)
    └── OrderStatus.java
```

```text
   VÌ SAO TÁCH BẰNG THƯ MỤC CHỨ KHÔNG PHẢI QUY ƯỚC MIỆNG:

   ① Nhìn đường dẫn file là biết đang ở tầng nào
   ② ArchUnit ép được ranh giới (test đỏ nếu vi phạm)
   ③ Người mới vào đội hiểu ngay không cần ai giải thích
   ④ Code review dễ: PR động vào query/ mà import entity → từ chối ngay
```

## Code đầy đủ hai tầng

### Tầng ghi — giữ nguyên sức mạnh của JPA

```java
@Service
@RequiredArgsConstructor
@Transactional
public class OrderCommandService {

    private final OrderRepository orderRepository;
    private final InventoryClient inventory;
    private final ApplicationEventPublisher events;

    public Long create(CreateOrderRequest req) {
        Order order = Order.create(req.customerId());
        req.items().forEach(i ->
                order.addItem(i.sku(), i.quantity(), i.unitPrice()));

        order.validate();                       // ← bất biến nghiệp vụ nằm TRONG entity
        orderRepository.save(order);            // ← cascade lưu luôn order_items

        events.publishEvent(new OrderCreated(order.getId()));
        return order.getId();
    }

    public void cancel(Long orderId, String reason) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new OrderNotFound(orderId));

        order.cancel(reason);
        // KHÔNG gọi save() — dirty checking tự sinh UPDATE.
        // @Version tự tăng → nếu ai đó sửa đồng thời sẽ nhận OptimisticLockException.
    }
}
```

```java
@Entity
@Table(name = "orders")
public class Order {

    @Id @GeneratedValue private Long id;
    @Version private Long version;                     // ← khoá lạc quan, gần như miễn phí

    @Enumerated(EnumType.STRING) private OrderStatus status;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @BatchSize(size = 25)                              // ← lưới an toàn cho lazy load
    private List<OrderItem> items = new ArrayList<>();

    public void cancel(String reason) {
        if (status == OrderStatus.SHIPPED) {
            throw new IllegalStateException("Đơn đã giao không huỷ được");
        }
        this.status = OrderStatus.CANCELLED;
        this.cancelReason = reason;
    }
}
```

```text
   ĐÂY LÀ CHỖ ORM TOẢ SÁNG VÀ KHÔNG CÓ GÌ THAY THẾ ĐƯỢC:

   ✅ order.cancel() — quy tắc nghiệp vụ nằm trong đối tượng, có thể unit test
   ✅ Không viết UPDATE — dirty checking chỉ sinh UPDATE cho cột đã đổi
   ✅ @Version — chống ghi đè đồng thời bằng một dòng
   ✅ cascade + orphanRemoval — thêm/xoá dòng hàng tự đồng bộ
   ✅ Rollback trọn vẹn nếu bất kỳ bước nào lỗi

   Viết tay từng thứ này ĐÚNG ở mọi đường code là việc rất dễ sai.
   ĐÂY LÀ LÝ DO KHÔNG NÊN BỎ ORM Ở TẦNG GHI.
```

### Tầng đọc — không entity, không lazy loading, không bất ngờ

```java
public record OrderCard(
        Long id, String code, BigDecimal total,
        String status, Instant createdAt, int itemCount) {}

public record OrderLineView(Long orderId, String sku, int quantity, BigDecimal price) {}

public record OrderDetailView(OrderCard header, List<OrderLineView> lines) {}
```

```java
@Repository
@RequiredArgsConstructor
public class OrderQueryDao {

    private final JdbcClient jdbc;

    public Page<OrderCard> search(OrderSearchCriteria c, Pageable pageable) {

        // Đếm tổng — chỉ COUNT, không kéo dữ liệu
        long total = jdbc.sql("""
                SELECT count(*) FROM orders o
                WHERE (:status IS NULL OR o.status = :status)
                  AND o.created_at >= :from AND o.created_at < :to
                """)
                .param("status", c.status()).param("from", c.from()).param("to", c.to())
                .query(Long.class).single();

        if (total == 0) return Page.empty(pageable);

        // Trang dữ liệu — LIMIT chạy ĐÚNG ở tầng database
        List<OrderCard> rows = jdbc.sql("""
                SELECT o.id, o.code, o.total_amount AS total, o.status, o.created_at,
                       (SELECT count(*) FROM order_items oi WHERE oi.order_id = o.id)
                           AS item_count
                FROM orders o
                WHERE (:status IS NULL OR o.status = :status)
                  AND o.created_at >= :from AND o.created_at < :to
                ORDER BY o.created_at DESC
                LIMIT :limit OFFSET :offset
                """)
                .param("status", c.status()).param("from", c.from()).param("to", c.to())
                .param("limit", pageable.getPageSize())
                .param("offset", pageable.getOffset())
                .query(OrderCard.class).list();

        return new PageImpl<>(rows, pageable, total);
    }

    public Optional<OrderDetailView> findDetail(Long id) {
        Optional<OrderCard> header = jdbc.sql("""
                SELECT o.id, o.code, o.total_amount AS total, o.status, o.created_at, 0
                FROM orders o WHERE o.id = :id
                """).param("id", id).query(OrderCard.class).optional();

        if (header.isEmpty()) return Optional.empty();

        List<OrderLineView> lines = jdbc.sql("""
                SELECT order_id, sku, quantity, unit_price AS price
                FROM order_items WHERE order_id = :id ORDER BY id
                """).param("id", id).query(OrderLineView.class).list();

        return Optional.of(new OrderDetailView(header.get(), lines));
    }
}
```

```java
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)          // ← quan trọng, xem giải thích bên dưới
public class OrderQueryService {

    private final OrderQueryDao dao;

    public Page<OrderCard> search(OrderSearchCriteria c, Pageable p) {
        return dao.search(c, p);
    }
}
```

### `@Transactional(readOnly = true)` làm gì — không chỉ là "để cho đẹp"

```text
   ① HIBERNATE BỎ DIRTY CHECKING
      Không tạo snapshot cho entity → tiết kiệm ~50% RAM ở tầng đọc.
      (Chỉ có tác dụng khi tầng đọc còn nạp entity — với DTO thì không cần.)

   ② FLUSH MODE CHUYỂN SANG MANUAL
      Không quét entity để tìm thay đổi trước mỗi truy vấn.

   ③ SPRING ĐÁNH DẤU JDBC CONNECTION LÀ READ-ONLY
      → PostgreSQL: chạy SET TRANSACTION READ ONLY
      → Mọi INSERT/UPDATE/DELETE lọt vào đây sẽ BỊ TỪ CHỐI ở tầng database.
      → Đây là LƯỚI AN TOÀN THẬT, không phải trang trí.

   ④ ĐỊNH TUYẾN TỚI READ REPLICA
      Nếu có replica, cấu hình routing datasource dựa trên cờ readOnly
      → tầng đọc tự động đi replica mà KHÔNG sửa một dòng code nào.
```

```java
// Định tuyến tự động sang replica — chỉ cần cấu hình một lần
public class RoutingDataSource extends AbstractRoutingDataSource {
    @Override
    protected Object determineCurrentLookupKey() {
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                ? "replica" : "primary";
    }
}
```

## Ép ranh giới bằng máy — vì quy ước miệng luôn thất bại

```java
@AnalyzeClasses(packages = "com.shop", importOptions = DoNotIncludeTests.class)
public class KienTrucTest {

    // ① Tầng đọc KHÔNG được chạm entity
    @ArchTest
    static final ArchRule query_khong_dung_entity =
        noClasses().that().resideInAPackage("..query..")
            .should().dependOnClassesThat().areAnnotatedWith(Entity.class)
            .because("Tầng đọc phải trả DTO — chạm entity là mở cửa cho N+1");

    // ② Tầng đọc KHÔNG được dùng JpaRepository
    @ArchTest
    static final ArchRule query_khong_dung_jpa_repository =
        noClasses().that().resideInAPackage("..query..")
            .should().dependOnClassesThat().areAssignableTo(JpaRepository.class);

    // ③ Entity KHÔNG được rò ra khỏi tầng service
    @ArchTest
    static final ArchRule entity_khong_ro_ra_controller =
        noClasses().that().resideInAPackage("..controller..")
            .should().dependOnClassesThat().areAnnotatedWith(Entity.class)
            .because("Trả entity ra API = N+1 lúc serialize + lộ dữ liệu");

    // ④ Mọi @ManyToOne phải LAZY
    @ArchTest
    static final ArchRule many_to_one_phai_lazy = fields()
        .that().areAnnotatedWith(ManyToOne.class)
        .should(khaiLazy())
        .because("@ManyToOne mặc định EAGER — nguồn N+1 vô hình (bài 1)");

    // ⑤ Mọi @OneToOne phải LAZY
    @ArchTest
    static final ArchRule one_to_one_phai_lazy = fields()
        .that().areAnnotatedWith(OneToOne.class)
        .should(khaiLazyOneToOne());

    private static ArchCondition<JavaField> khaiLazy() {
        return new ArchCondition<>("khai fetch = FetchType.LAZY") {
            @Override public void check(JavaField f, ConditionEvents ev) {
                if (f.getAnnotationOfType(ManyToOne.class).fetch() != FetchType.LAZY) {
                    ev.add(SimpleConditionEvent.violated(f,
                        f.getFullName() + " đang là EAGER"));
                }
            }
        };
    }
}
```

```properties
# ⑥ Lưới an toàn toàn cục — một dòng, hiệu quả cao nhất trong cả khoá
spring.jpa.properties.hibernate.default_batch_fetch_size=25

# ⑦ Tắt open-in-view — lazy load ngoài transaction sẽ NỔ thay vì âm thầm chạy
spring.jpa.open-in-view=false
```

Mục ⑦ đặc biệt quan trọng và bài 8 sẽ giải thích kỹ: **Spring Boot mặc định bật `open-in-view=true`**, giữ Persistence Context mở tới lúc render HTTP response. Điều đó khiến lazy loading **âm thầm chạy được ở tầng controller và tầng serialize**, tức là N+1 xảy ra ở nơi bạn không nhìn. Tắt nó đi thì lỗi lộ ra **ngay trên máy dev**.

## Lộ trình chuyển đổi — mẫu Strangler Fig, không viết lại

```text
   ❌ CÁCH SAI (thất bại ở gần như mọi công ty đã thử):
   ┌────────────────────────────────────────────────────────┐
   │ "Chúng ta dừng tính năng 6 tháng để viết lại sang jOOQ" │
   │  → Không ra giá trị nào trong 6 tháng                   │
   │  → Business mất kiên nhẫn ở tháng thứ 3                 │
   │  → Dự án bị huỷ giữa chừng, để lại HAI hệ thống nửa vời │
   └────────────────────────────────────────────────────────┘

   ✅ CÁCH ĐÚNG: bóp nghẹt dần, mỗi bước ra giá trị đo được
```

### Tuần 0 — đo trước, đừng đoán

```sql
-- Bật thu thập nếu chưa có
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT pg_stat_statements_reset();
-- ...chạy production 24 giờ...

SELECT round(100 * total_exec_time / sum(total_exec_time) OVER ()::numeric, 1)
           AS phan_tram_tong,
       calls,
       round((total_exec_time/1000)::numeric)   AS tong_giay,
       round(mean_exec_time::numeric, 2)        AS tb_ms,
       left(query, 60)                          AS cau_lenh
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;
```

```text
   KẾT QUẢ ĐIỂN HÌNH — và đây là lý do KHÔNG cần viết lại:

   phan_tram | calls    | tong_giay | cau_lenh
   ----------+----------+-----------+---------------------------------
      38.4   | 12840000 |     3120  | select ... order_items where order_id=$1
      14.1   |  4210000 |     1146  | select ... products where category_id=$1
       8.9   |   184000 |      723  | select ... from orders where status=$1
       ...
                                    (16 câu còn lại: 38.6%)

   → 61% THỜI GIAN DATABASE ĐẾN TỪ 3 TRUY VẤN.
     Và hai câu đầu có `calls` hàng triệu → CHỮ KÝ CỦA N+1.

   BẠN KHÔNG CẦN SỬA 300 REPOSITORY. BẠN CẦN SỬA 3 CHỖ.
```

### Tuần 1 — thắng nhanh, không sửa code

```properties
spring.jpa.properties.hibernate.default_batch_fetch_size=25
spring.jpa.open-in-view=false
spring.jpa.properties.hibernate.generate_statistics=true
```

```text
   RỦI RO: THẤP (một dòng cấu hình, rollback tức thì)
   CÔNG SỨC: 1 giờ + 1 ngày kiểm thử
   HIỆU QUẢ ĐIỂN HÌNH: giảm 30–60% thời gian database

   ⚠ CẢNH BÁO VỀ open-in-view=false:
     Nó sẽ làm LỘ RA những chỗ đang lazy load ngoài transaction
     → có thể có LazyInitializationException ở vài màn hình.
     → ĐÂY LÀ ĐIỀU TỐT (bug vốn đã tồn tại, chỉ là bị che).
     → Nhưng hãy bật ở STAGING trước, chạy hết test hồi quy.
```

### Tuần 2–3 — dựng lưới chắn

```java
// Test đếm query cho 10 API nóng nhất (chi tiết ở bài 8)
@Test
void tim_kiem_don_hang_khong_vuot_qua_3_query() {
    statistics.clear();
    mockMvc.perform(get("/api/orders?page=0&size=20")).andExpect(status().isOk());
    assertThat(statistics.getPrepareStatementCount()).isLessThanOrEqualTo(3);
}
```

```text
   TỪ ĐÂY TRỞ ĐI, N+1 MỚI KHÔNG THỂ LỌT VÀO CODEBASE.
   Đây là bước quan trọng hơn cả việc sửa N+1 hiện có —
   vì không có nó, bạn sẽ sửa mãi mà vấn đề vẫn quay lại.
```

### Tuần 4–6 — viết lại đúng 3 truy vấn nóng nhất

```text
   Chọn 3 câu chiếm 61% ở bước đo.
   Viết lại bằng JdbcClient (hoặc jOOQ nếu đội đã chọn).
   Giữ nguyên chữ ký method để không đụng vào controller.

   → Đây là nơi đội HỌC công cụ mới với RỦI RO THẤP NHẤT:
     phạm vi nhỏ, có test bao quanh, có số liệu trước/sau để chứng minh.
```

```java
// Chiến thuật: giữ interface, đổi ruột
public interface OrderSearchPort {                      // ← controller chỉ biết cái này
    Page<OrderCard> search(OrderSearchCriteria c, Pageable p);
}

@Component @Primary
class OrderSearchJdbc implements OrderSearchPort { ... }   // ← bản mới

@Component
class OrderSearchJpa implements OrderSearchPort { ... }    // ← bản cũ, giữ để so sánh
```

### Tuần 7+ — quy tắc cho code mới

```markdown
<!-- docs/adr/012-chien-luoc-truy-cap-du-lieu.md -->
# ADR-012: Chiến lược truy cập dữ liệu

## Bối cảnh
Đo 24h production: 61% thời gian database đến từ 3 truy vấn, đều là N+1
do lazy loading ở tầng đọc. Viết lại toàn bộ sang jOOQ ước tính 6 tháng,
không khả thi.

## Quyết định
1. Tầng GHI giữ nguyên Spring Data JPA (dirty checking, @Version, cascade).
2. Màn hình đọc MỚI viết ở package `query/` dùng JdbcClient, trả record DTO.
3. Màn hình đọc CŨ chỉ viết lại khi (a) nằm trong top 10 pg_stat_statements,
   hoặc (b) đang sửa vì lý do khác.
4. KHÔNG có sprint riêng cho việc chuyển đổi.

## Ràng buộc bắt buộc
- default_batch_fetch_size=25, open-in-view=false
- Mọi @ManyToOne/@OneToOne khai LAZY (ArchUnit KienTrucTest)
- Mọi API danh sách có test đếm query
- Package `query/` không được import entity (ArchUnit)
- Không trả entity ra controller (ArchUnit)

## Hệ quả
+ Không dừng phát triển tính năng.
+ Đội học công cụ mới dần, rủi ro thấp.
− Tồn tại hai kiểu truy cập dữ liệu trong codebase một thời gian dài.
  → Chấp nhận được vì ranh giới rõ ràng bằng package + ArchUnit.
```

```text
   SAU 3 THÁNG, KHÔNG CÓ SPRINT NÀO DÀNH RIÊNG CHO CHUYỂN ĐỔI:
      · Đường nóng đã nhanh
      · N+1 mới không lọt được nữa
      · Đội biết cả hai công cụ
      · Codebase tự dịch chuyển theo hướng đúng
```

## Bảng quyết định theo giai đoạn công ty

| Giai đoạn | Ưu tiên | Nên dùng | KHÔNG nên |
|---|---|---|---|
| **Tìm PMF, < 10 kỹ sư** | Tốc độ ra tính năng | ORM đầy đủ + `default_batch_fetch_size` | Tách tầng sớm — chưa biết màn hình nào nóng |
| **Tăng trưởng, 10–50** | Chặn xói mòn | Tách `query/`, test đếm query, ArchUnit | Viết lại toàn bộ |
| **Quy mô lớn, 50+** | Kiểm soát và audit | CQRS-lite đầy đủ, có thể thêm jOOQ | Để mỗi đội tự chọn công cụ khác nhau |
| **Kế thừa hệ thống cũ** | Không làm hỏng | Đo trước, sửa 3 chỗ nóng nhất | Đụng vào tầng ghi |
| **Fintech / ngân hàng** | Audit từng câu lệnh | MyBatis/jOOQ cho hầu hết, JPA cho aggregate | ORM cho báo cáo và đối soát |
| **Sản phẩm dữ liệu / BI** | SQL là ngôn ngữ chính | SQL thuần từ đầu, không entity | Ép ORM vào bài toán phân tích |

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bạn được giao "cải thiện hiệu năng hệ thống" trong 2 tuần. Codebase 4 năm tuổi, 300 repository JPA, không ai còn nhớ tại sao code viết thế.

**Chẩn đoán — tuyệt đối không đọc code trước. Đo trước.**

```sql
-- ① Đo ở tầng database: query nào tốn tổng thời gian nhiều nhất?
SELECT round(100*total_exec_time/sum(total_exec_time) OVER ()::numeric,1) AS pct,
       calls, round(mean_exec_time::numeric,2) AS tb_ms, left(query,60)
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 10;
```

```bash
# ② Đo ở tầng ứng dụng: API nào chậm nhất và gọi nhiều nhất?
# (từ APM: Datadog, New Relic, Elastic APM, hoặc Micrometer + Grafana)
# Tìm giao của hai tập: CHẬM × GỌI NHIỀU = ưu tiên cao nhất
```

```java
// ③ Với API đứng đầu, đếm query của đúng nó
@Test
void do_so_query_cua_api_nong_nhat() {
    statistics.clear();
    mockMvc.perform(get("/api/orders?page=0&size=20"));
    System.out.println("Số query: " + statistics.getPrepareStatementCount());
    // → 47 query cho 20 bản ghi = N+1 xác nhận
}
```

**Cách xử lý — thứ tự theo tỉ lệ hiệu quả trên công sức:**

```text
   NGÀY 1     : default_batch_fetch_size=25          → thường −30..60%
   NGÀY 2–3   : open-in-view=false + sửa lỗi lộ ra    → lộ N+1 ẩn
   NGÀY 4–5   : test đếm query cho 10 API nóng nhất   → chặn tái diễn
   TUẦN 2     : viết lại 3 truy vấn nóng nhất bằng JdbcClient
   BÁO CÁO    : biểu đồ p99 trước/sau, số query trước/sau, chi phí DB trước/sau
```

**Chặn tái diễn — điều quan trọng nhất của cả 2 tuần:**

```text
   Nếu bạn chỉ sửa 3 truy vấn mà không dựng lưới chắn,
   6 tháng sau sẽ có 3 truy vấn N+1 MỚI và ai đó lại được giao
   "cải thiện hiệu năng trong 2 tuần".

   → GIÁ TRỊ LỚN NHẤT BẠN TẠO RA LÀ TEST ĐẾM QUERY + ARCHUNIT,
     KHÔNG PHẢI 3 TRUY VẤN ĐÃ SỬA.
```

> **Tình huống 2:** Sau khi tách tầng `query/`, một lập trình viên trong đội hỏi: *"Sao phải viết hai lần? `OrderCard` và `Order` gần giống nhau, DRY ở đâu?"*

**Chẩn đoán — đây là phản đối chính đáng và cần trả lời tử tế, không phải bác bỏ.**

```text
   CÂU TRẢ LỜI: HAI THỨ ĐÓ TRÔNG GIỐNG NHAU NHƯNG THAY ĐỔI VÌ LÝ DO KHÁC NHAU.

   Order (entity)          thay đổi khi NGHIỆP VỤ đổi
                           → thêm trạng thái, thêm quy tắc huỷ đơn

   OrderCard (DTO)         thay đổi khi MÀN HÌNH đổi
                           → thiết kế muốn thêm cột "số ngày còn lại"

   Ép chúng dùng chung một lớp nghĩa là MỖI LẦN đổi giao diện
   phải sửa mô hình nghiệp vụ. Đó không phải DRY — đó là GHÉP CHẶT.

   DRY nói về TRI THỨC lặp lại, không phải về HÌNH DẠNG giống nhau.
   Hai lớp có cùng trường nhưng khác lý do thay đổi thì KHÔNG phải lặp.
```

**Cách xử lý — cho thấy chi phí thật của việc dùng chung:**

```java
// Nếu dùng chung entity cho API, đây là những thứ bạn nhận:
@GetMapping("/orders")
public List<Order> list() {            // ❌
    return orderRepository.findAll();
}
// ① Jackson duyệt getItems() → N+1 lúc serialize
// ② Lộ mọi cột, kể cả internalNote, costPrice, createdBy
// ③ Đổi tên field trong entity → VỠ HỢP ĐỒNG API của client
// ④ Thêm quan hệ mới vào entity → API tự nhiên trả thêm dữ liệu
// ⑤ Không thể có hai phiên bản API (v1, v2) trên cùng entity
```

> **Tình huống 3:** Đội đã tách tầng `query/`, nhưng 3 tháng sau kiểm tra lại thì thấy 8 file trong `query/` đang import entity và gọi `getItems()`.

**Chẩn đoán — đây là **xói mòn kiến trúc**, và nó là điều tất yếu nếu ranh giới chỉ tồn tại trong tài liệu.**

```bash
grep -rln "import com.shop.domain" src/main/java/com/shop/*/query/
#   8 file — quy ước miệng đã thất bại đúng như dự đoán
```

**Cách xử lý — quy ước phải trở thành test:**

```java
@ArchTest
static final ArchRule query_khong_dung_entity =
    noClasses().that().resideInAPackage("..query..")
        .should().dependOnClassesThat().areAnnotatedWith(Entity.class);
```

```text
   ĐÂY GỌI LÀ "FITNESS FUNCTION" — HÀM ĐO SỨC KHOẺ KIẾN TRÚC.

   Nguyên tắc: MỌI QUYẾT ĐỊNH KIẾN TRÚC KHÔNG CÓ TEST BẢO VỆ
              SẼ BỊ XÓI MÒN TRONG VÒNG 6 THÁNG.

   Không phải vì đội cẩu thả — mà vì:
      · người mới không biết quy ước
      · deadline gấp, "làm tạm rồi sửa sau"
      · IDE tự động import
      · code review bỏ sót
```

**Xử lý 8 file đang vi phạm mà không chặn CI cả đội:**

```java
// Ghi nợ kỹ thuật rõ ràng, có hạn, không để trôi vô thời hạn
@ArchTest
static final ArchRule query_khong_dung_entity =
    noClasses().that().resideInAPackage("..query..")
        .should().dependOnClassesThat().areAnnotatedWith(Entity.class)
        .as("Tầng query không được chạm entity")
        // 8 ngoại lệ tạm — hạn xử lý ghi trong ticket ARCH-142
        .ignoreDependency(nameMatching(".*ReportQueryDao"), alwaysTrue());
```

> **Tình huống 4:** Quản lý hỏi: *"Chuyển sang cách này tốn bao nhiêu, và được gì? Nói bằng tiền."*

**Cách trả lời — quy đổi ra số liệu vận hành:**

```text
   ĐO TRƯỚC (production, 24 giờ):
      · p99 API danh sách đơn      : 3.400 ms
      · Query database/giây        : 18.400
      · CPU database trung bình    : 78%
      · Instance database          : db.r6g.4xlarge
      · Số pod ứng dụng            : 12 (scale vì chờ I/O, không phải vì CPU)

   ĐO SAU (sửa 3 truy vấn + default_batch_fetch_size):
      · p99 API danh sách đơn      : 190 ms      (−94%)
      · Query database/giây        : 2.100       (−89%)
      · CPU database trung bình    : 21%
      · Hạ được xuống              : db.r6g.xlarge
      · Số pod ứng dụng            : 5

   QUY RA TIỀN (con số minh hoạ, thay bằng giá thật của bạn):
      · Hạ cấp database  : tiết kiệm ~70% chi phí instance đó
      · Giảm 7 pod       : tiết kiệm chi phí compute tương ứng
      · p99 3,4s → 0,19s : tỉ lệ rời bỏ ở màn hình danh sách giảm

   CÔNG SỨC BỎ RA: 2 tuần của 1 kỹ sư.

   → ĐÂY LÀ CÁCH TRÌNH BÀY KHIẾN VIỆC NÀY ĐƯỢC DUYỆT.
     Đừng nói "chúng ta có N+1". Hãy nói "chúng ta trả tiền cho 16.300
     query thừa mỗi giây".
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Đề xuất "viết lại toàn bộ" | 6 tháng không ra tính năng, thường bị huỷ giữa chừng | Strangler Fig: sửa 3 chỗ nóng nhất |
| Đọc code trước khi đo | Sửa nhầm chỗ, tốn công vô ích | `pg_stat_statements` trước, luôn luôn |
| Tách tầng nhưng chỉ bằng quy ước miệng | Xói mòn trong 6 tháng, 8 file vi phạm | ArchUnit làm fitness function |
| Bỏ ORM ở cả tầng ghi | Mất dirty checking, `@Version`, cascade | Chỉ tách **tầng đọc** |
| Gọi đây là "CQRS" | Bị hỏi về event sourcing, đồng bộ, nhất quán cuối | Gọi đúng: "tách tầng đọc" |
| Quên `@Transactional(readOnly = true)` | Mất lưới an toàn `SET TRANSACTION READ ONLY` | Đặt ở lớp `QueryService` |
| Bật `open-in-view=false` thẳng lên production | `LazyInitializationException` hàng loạt | Staging trước, chạy hết hồi quy |
| Sửa N+1 nhưng không dựng lưới chắn | 6 tháng sau có 3 N+1 mới | Test đếm query là deliverable chính |
| Dùng chung một lớp cho entity và API response | N+1 lúc serialize, lộ dữ liệu, vỡ hợp đồng API | DTO riêng cho tầng đọc |
| Báo cáo bằng thuật ngữ kỹ thuật | Không được duyệt ngân sách/thời gian | Quy ra p99, số pod, chi phí instance |

## Câu hỏi phỏng vấn hay gặp

**H: Kiến trúc truy cập dữ liệu em thường dùng là gì?**
Một database, hai đường đi. Tầng ghi dùng Spring Data JPA với entity, `@Transactional`, `@Version` và cascade — vì đó là chỗ ORM thật sự có giá trị. Tầng đọc dùng `JdbcClient` hoặc jOOQ trả về `record` DTO, `@Transactional(readOnly = true)`, không chạm entity. Hai tầng nằm ở hai package riêng và có ArchUnit ép ranh giới. Em gọi đây là **tách tầng đọc** chứ không gọi là CQRS, vì không có database riêng, không event sourcing, không nhất quán cuối cùng — chỉ là hai cách đọc cùng một bảng, nên rủi ro gần bằng không và áp dụng được cho một màn hình rồi dừng.

**H: `@Transactional(readOnly = true)` thật sự làm gì?**
Bốn thứ. Hibernate bỏ dirty checking nên không tạo snapshot, tiết kiệm khoảng một nửa RAM khi còn nạp entity. Flush mode chuyển sang manual nên không quét entity trước mỗi truy vấn. Spring đánh dấu connection là read-only, và với PostgreSQL thì nó chạy `SET TRANSACTION READ ONLY` — mọi `INSERT`/`UPDATE` lọt vào đây sẽ **bị database từ chối**, đây là lưới an toàn thật chứ không phải trang trí. Và nếu có read replica, chỉ cần một `AbstractRoutingDataSource` đọc cờ `readOnly` là tầng đọc tự động đi replica mà không sửa dòng code nào.

**H: Được giao cải thiện hiệu năng hệ thống cũ trong 2 tuần, em làm gì trước?**
Đo, không đọc code. Chạy `pg_stat_statements` sắp theo `total_exec_time` trong 24 giờ production. Kết quả điển hình là **60% thời gian database đến từ 3 truy vấn**, và những câu có `calls` hàng triệu chính là chữ ký N+1. Ngày đầu em bật `default_batch_fetch_size=25` — một dòng cấu hình, rollback tức thì, thường giảm ngay 30–60%. Vài ngày sau tắt `open-in-view` để lộ ra những chỗ lazy load ngoài transaction. Rồi thêm test đếm query cho 10 API nóng nhất, sau đó mới viết lại 3 truy vấn nóng nhất. Nhưng em nghĩ **giá trị lớn nhất của 2 tuần đó là test đếm query và ArchUnit, không phải 3 truy vấn đã sửa** — vì không có lưới chắn thì 6 tháng sau sẽ có 3 N+1 mới và ai đó lại được giao đúng nhiệm vụ này.

**H: Đội muốn viết lại toàn bộ sang jOOQ, em phản hồi thế nào?**
Em sẽ đưa số liệu thay vì tranh luận. Nếu 61% thời gian database đến từ 3 truy vấn thì không cần viết lại 300 repository, chỉ cần sửa 3 chỗ. Em đề xuất mẫu **Strangler Fig**: giữ JPA cho tầng ghi, viết mọi màn hình đọc **mới** ở package `query/`, và chỉ viết lại màn hình cũ khi nó nằm trong top 10 hoặc đang phải sửa vì lý do khác. Sau ba tháng codebase tự dịch chuyển sang kiến trúc đích mà **không có sprint nào dành riêng cho việc chuyển công nghệ** — và không có rủi ro dự án bị huỷ giữa chừng để lại hai hệ thống nửa vời.

**H: Có người trong đội nói tách DTO riêng là vi phạm DRY, em trả lời sao?**
Em nghĩ đó là hiểu nhầm về DRY. DRY nói về **tri thức** bị lặp lại, không phải về **hình dạng** giống nhau. `Order` và `OrderCard` có thể có cùng vài trường, nhưng chúng thay đổi vì lý do khác nhau: entity đổi khi nghiệp vụ đổi, DTO đổi khi màn hình đổi. Ép dùng chung nghĩa là mỗi lần thiết kế muốn thêm một cột hiển thị thì phải sửa mô hình nghiệp vụ — đó là ghép chặt, không phải DRY. Và chi phí thực tế của việc dùng chung rất cụ thể: Jackson duyệt collection lúc serialize gây N+1, lộ những cột như `costPrice` hay `internalNote`, đổi tên field trong entity làm vỡ hợp đồng API, và không thể có `v1`/`v2` trên cùng một lớp.

**H: Làm sao giữ cho kiến trúc không bị xói mòn?**
Bằng **fitness function** — test tự động cho kiến trúc. Nguyên tắc em rút ra là: mọi quyết định kiến trúc không có test bảo vệ sẽ bị xói mòn trong khoảng 6 tháng, và không phải vì đội cẩu thả mà vì người mới không biết quy ước, deadline gấp, IDE tự động import, code review bỏ sót. Cụ thể em dùng ArchUnit để chặn package `query/` import entity, chặn controller phụ thuộc entity, và bắt mọi `@ManyToOne`/`@OneToOne` phải khai `LAZY`. Cộng thêm test đếm query cho mọi API danh sách. Quy ước nằm trong tài liệu thì thất bại; quy ước làm CI đỏ thì tồn tại.

**H: Làm sao thuyết phục quản lý duyệt việc này?**
Nói bằng số liệu vận hành, không bằng thuật ngữ kỹ thuật. Thay vì "chúng ta có N+1", em nói "chúng ta đang trả tiền cho 16.300 query thừa mỗi giây". Rồi trình bày đo trước và sau: p99 từ 3.400 ms xuống 190 ms, query mỗi giây từ 18.400 xuống 2.100, CPU database từ 78% xuống 21% nên hạ được một cấp instance, số pod từ 12 xuống 5. Với công sức hai tuần của một kỹ sư. Con số hạ tầng và p99 là ngôn ngữ mà quản lý ra quyết định được.

## Tóm tắt bài 6

- Kiến trúc đích: **một database, hai đường đi** — JPA cho ghi, `JdbcClient`/jOOQ cho đọc. Gọi đúng tên là **tách tầng đọc**, không phải CQRS đầy đủ.
- Ranh giới phải **nhìn thấy được**: tách bằng package `command/` và `query/`, không bằng quy ước miệng.
- `@Transactional(readOnly = true)` cho 4 lợi ích thật, gồm `SET TRANSACTION READ ONLY` ở tầng database và **định tuyến replica miễn phí**.
- Ba dòng cấu hình có tỉ lệ hiệu quả cao nhất: `default_batch_fetch_size=25`, `open-in-view=false`, `generate_statistics=true`.
- Chuyển đổi bằng **Strangler Fig**, không viết lại: đo → cấu hình → lưới chắn → sửa 3 chỗ nóng nhất → quy tắc cho code mới.
- **Luôn đo `pg_stat_statements` trước khi đọc code.** Thường 60% thời gian đến từ dưới 5 truy vấn.
- **Mọi quyết định kiến trúc không có test bảo vệ sẽ bị xói mòn trong 6 tháng** → ArchUnit là fitness function bắt buộc.
- Giá trị lớn nhất của một đợt tối ưu là **lưới chắn chống tái diễn**, không phải các truy vấn đã sửa.
- Tách DTO riêng **không vi phạm DRY** — DRY nói về tri thức lặp, không phải hình dạng giống nhau.
- Trình bày với quản lý bằng **p99, số pod, cấp instance**, không bằng thuật ngữ kỹ thuật.

**Bài kế tiếp** → [Bài 7: N+1 không chỉ ở database](07-n-cong-1-khong-chi-o-database.md)

**Quay lại** → [Bài 5: Không dùng ORM thì dùng gì](05-khong-dung-orm-thi-dung-gi.md)

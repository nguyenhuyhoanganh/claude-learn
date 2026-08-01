# Bài 8: Phát hiện N+1 trước khi khách hàng phát hiện

Bảy bài trước dạy bạn **hiểu** và **chữa** N+1. Bài này là bài quan trọng nhất, vì nó trả lời câu hỏi mà mọi đội đều bỏ qua:

> *"Làm sao để nó không bao giờ quay lại?"*

Kinh nghiệm thực tế rất rõ ràng: **một đội sửa hết N+1 hôm nay sẽ có N+1 mới trong vòng sáu tháng** — trừ khi họ dựng lưới chắn. Không phải vì đội cẩu thả, mà vì N+1 là loại lỗi **không có triệu chứng cho tới khi quá muộn**: test xanh, code sạch, máy dev nhanh.

Bài này biến việc phát hiện N+1 từ *"nhớ kiểm tra"* thành *"máy tự chặn"*.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **`show-sql`** | | Cờ Hibernate in câu SQL ra màn hình |
| **`Statistics`** | sờ-tơ-tít-tíc | **Bộ thống kê** của Hibernate — đếm query, cache, entity |
| **`SessionFactory`** | | **Nhà máy phiên** — đối tượng gốc của Hibernate, nơi lấy `Statistics` |
| **datasource-proxy** | | Thư viện **bọc DataSource** để chặn và đếm mọi câu lệnh JDBC |
| **p6spy** | pi-síc-spai | Thư viện tương tự, **thay driver JDBC** để log mọi câu lệnh |
| **Open Session In View** | | Giữ Persistence Context **mở tới lúc render** — Spring Boot **mặc định bật** |
| **`LazyInitializationException`** | | Lỗi khi chạm quan hệ lazy **ngoài** phạm vi phiên |
| **Regression test** | ri-gre-sần | **Test hồi quy** — chặn lỗi cũ quay lại |
| **Fitness function** | | **Hàm đo sức khoẻ kiến trúc** — test tự động chống xói mòn |
| **APM** (*Application Performance Monitoring*) | ây-pi-em | **Giám sát hiệu năng ứng dụng** |
| **Span** | span | **Đoạn** — một đơn vị công việc trong distributed tracing |
| **`pg_stat_statements`** | | Extension PostgreSQL **thống kê mọi câu lệnh** |
| **Flyway / Liquibase** | | Công cụ **quản lý phiên bản lược đồ** database |
| **Testcontainers** | | Thư viện chạy **database thật trong Docker** khi test |

## Tầng phát hiện: năm lớp, mỗi lớp bắt lỗi ở một giai đoạn

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ LỚP 1 — LÚC VIẾT CODE                        chi phí: 0      │
   │   open-in-view=false  →  lazy load sai chỗ NỔ NGAY trên máy  │
   │   ArchUnit            →  @ManyToOne EAGER không compile qua   │
   ├──────────────────────────────────────────────────────────────┤
   │ LỚP 2 — LÚC CHẠY TEST                        chi phí: thấp   │
   │   Test đếm query      →  CI ĐỎ nếu vượt ngưỡng               │
   │   ★ ĐÂY LÀ LỚP QUAN TRỌNG NHẤT ★                            │
   ├──────────────────────────────────────────────────────────────┤
   │ LỚP 3 — LÚC CHẠY LOCAL                       chi phí: thấp   │
   │   datasource-proxy    →  cảnh báo ngay khi thấy query lặp    │
   ├──────────────────────────────────────────────────────────────┤
   │ LỚP 4 — TRÊN STAGING/PROD                    chi phí: TB     │
   │   Hibernate Statistics + Micrometer → biểu đồ query/request  │
   │   APM span count      →  thấy 200 span DB trong 1 trace      │
   ├──────────────────────────────────────────────────────────────┤
   │ LỚP 5 — Ở TẦNG DATABASE                      chi phí: thấp   │
   │   pg_stat_statements  →  câu nào bị gọi hàng triệu lần       │
   └──────────────────────────────────────────────────────────────┘

   ⚠ MỘT MÌNH LỚP NÀO CŨNG KHÔNG ĐỦ.
     Lớp 5 phát hiện SAU KHI đã lên production.
     Lớp 2 chặn TRƯỚC KHI merge.  → Ưu tiên đầu tư vào lớp 1–2.
```

## Vì sao `show-sql` không đủ — và còn gây hại

Đây là thứ đầu tiên ai cũng bật, và là thứ **kém hiệu quả nhất**.

```properties
spring.jpa.show-sql=true
spring.jpa.properties.hibernate.format_sql=true
```

```text
   NĂM LÝ DO show-sql KHÔNG PHẢI CÔNG CỤ PHÁT HIỆN:

   ① NÓ IN, NÓ KHÔNG ĐẾM.
      201 câu trôi qua terminal. Bạn phải TỰ ĐẾM bằng mắt.
      Với 20 câu bạn còn thấy. Với 2.000 câu bạn không thấy gì.

   ② NÓ IN RA System.out, KHÔNG QUA LOGGER.
      → Không lọc được, không định tuyến được, không tắt theo package.
      → Trên production nó ghi thẳng vào stdout của container.

   ③ NÓ KHÔNG HIỆN THAM SỐ.
      "where author_id=?"  ← không biết ? là 7 hay 4.000
      → Không phân biệt được "20 câu khác nhau" với "20 câu giống hệt".

   ④ NÓ KHÔNG CHO BIẾT DÒNG CODE NÀO GÂY RA.
      Bạn thấy câu SQL nhưng không biết nó từ service nào.

   ⑤ NÓ LÀM CHẬM ỨNG DỤNG ĐÁNG KỂ.
      Bật trên production = mỗi query thêm một lần ghi I/O đồng bộ.
      Đã có sự cố thật vì đội bật show-sql để debug rồi quên tắt.

   → show-sql hữu ích khi bạn ĐÃ BIẾT có vấn đề và muốn xem câu lệnh.
     Nó VÔ DỤNG trong việc PHÁT HIỆN vấn đề.
```

**Nếu vẫn muốn xem SQL khi phát triển, hãy dùng logger thay vì `show-sql`:**

```properties
# ✅ Qua logger — lọc được, tắt được, không dùng System.out
logging.level.org.hibernate.SQL=DEBUG
logging.level.org.hibernate.orm.jdbc.bind=TRACE     # Hibernate 6: hiện tham số
# Hibernate 5 dùng: logging.level.org.hibernate.type.descriptor.sql=TRACE
```

## Công cụ ① — Hibernate Statistics: đếm, không phải in

```properties
spring.jpa.properties.hibernate.generate_statistics=true
```

```text
Session Metrics {
    28741 nanoseconds spent acquiring 1 JDBC connections;
    1284700 nanoseconds spent preparing 201 JDBC statements;   ◄── SỐ CẦN TÌM
    4187293811 nanoseconds spent executing 201 JDBC statements;
    0 nanoseconds spent executing 0 JDBC batches;
    0 nanoseconds spent performing 0 L2C puts;
    892341 nanoseconds spent executing 1 flushes (flushing 201 entities);
}
```

**Nhưng đừng chỉ đọc log — hãy đưa nó vào biểu đồ:**

```java
@Configuration
public class HibernateMetricsConfig {

    @Bean
    public MeterBinder hibernateQueryMetrics(EntityManagerFactory emf) {
        SessionFactory sf = emf.unwrap(SessionFactory.class);
        return registry -> Gauge
            .builder("hibernate.statements.prepared",
                     () -> sf.getStatistics().getPrepareStatementCount())
            .description("Tổng số câu lệnh JDBC đã chuẩn bị")
            .register(registry);
    }
}
```

```promql
# Cảnh báo khi số query trên mỗi request tăng bất thường
rate(hibernate_statements_prepared_total[5m])
  / rate(http_server_requests_seconds_count[5m])
> 20
```

```text
   ⚠ LƯU Ý VỀ CHI PHÍ:
      generate_statistics có overhead nhỏ nhưng KHÔNG bằng 0
      (Hibernate cập nhật bộ đếm nguyên tử cho mỗi thao tác).

      · Trên dev và test: BẬT LUÔN.
      · Trên production: bật được, nhiều đội để bật thường xuyên,
        nhưng hãy đo trước trên staging nếu hệ thống cực nhạy độ trễ.
```

## Công cụ ② — Test đếm query: lớp phòng thủ quan trọng nhất

Đây là thứ có giá trị cao nhất trong cả bài. Nó biến N+1 từ **sự cố production** thành **CI đỏ**.

### Cách 1 — dùng Hibernate Statistics trực tiếp

```java
@SpringBootTest
@Testcontainers
class AuthorQueryCountTest {

    @Container
    static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16");

    @Autowired EntityManagerFactory emf;
    @Autowired AuthorService authorService;

    private Statistics stats;

    @BeforeEach
    void setUp() {
        stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();
    }

    @Test
    void danh_sach_tac_gia_khong_duoc_vuot_qua_3_query() {
        seed(20, 30);                                  // 20 tác giả, mỗi người 30 sách

        List<AuthorDto> result = authorService.listWithBookCount();

        assertThat(result).hasSize(20);
        assertThat(stats.getPrepareStatementCount())
            .as("N+1 quay lại — kiểm tra @BatchSize hoặc JOIN FETCH")
            .isLessThanOrEqualTo(3);
    }

    @Test
    void so_query_KHONG_DUOC_TANG_THEO_SO_BAN_GHI() {
        seed(10, 5);
        authorService.listWithBookCount();
        long với10 = stats.getPrepareStatementCount();

        stats.clear();
        seed(100, 5);
        authorService.listWithBookCount();
        long với100 = stats.getPrepareStatementCount();

        assertThat(với100)
            .as("Số query tăng theo số bản ghi = ĐỊNH NGHĨA CỦA N+1")
            .isLessThanOrEqualTo(với10 + 2);
    }
}
```

```text
   TEST THỨ HAI LÀ TEST HAY NHẤT TRONG BÀI NÀY.

   Nó không kiểm tra một ngưỡng tuỳ tiện — nó kiểm tra ĐÚNG ĐỊNH NGHĨA:
   "số query có tăng theo số phần tử không?"

   → Không phụ thuộc vào con số ma thuật (3? 5? 10?)
   → Bắt được N+1 dù bạn dùng cách chữa nào
   → Không vỡ khi ai đó thêm một truy vấn hợp lệ
```

### Cách 2 — dùng datasource-proxy, hoạt động với MỌI công nghệ

Cách trên chỉ chạy với Hibernate. Nếu bạn dùng jOOQ, MyBatis, hay `JdbcTemplate` (bài 5), hãy đếm ở tầng JDBC:

```xml
<dependency>
    <groupId>net.ttddyy</groupId>
    <artifactId>datasource-proxy</artifactId>
    <scope>test</scope>
</dependency>
```

```java
@TestConfiguration
public class QueryCountingConfig {

    @Bean
    public BeanPostProcessor dataSourceProxy() {
        return new BeanPostProcessor() {
            @Override public Object postProcessAfterInitialization(Object bean, String n) {
                if (bean instanceof DataSource ds && !(bean instanceof ProxyDataSource)) {
                    return ProxyDataSourceBuilder.create(ds)
                            .name("test-ds")
                            .countQuery()                 // ← bật đếm
                            .logQueryBySlf4j(INFO)
                            .build();
                }
                return bean;
            }
        };
    }
}
```

```java
@Test
void tim_kiem_don_hang_chi_chay_2_query() {
    QueryCountHolder.clear();

    orderQueryService.search(criteria, PageRequest.of(0, 20));

    QueryCount count = QueryCountHolder.getGrandTotal();

    assertThat(count.getSelect()).isEqualTo(2);
    assertThat(count.getTotal()).isEqualTo(2);
    // Bắt được cả UPDATE ngoài ý muốn ở tầng đọc:
    assertThat(count.getUpdate()).isZero();
    assertThat(count.getInsert()).isZero();
}
```

```text
   ƯU ĐIỂM CỦA datasource-proxy SO VỚI Hibernate Statistics:

   ✅ Hoạt động với MỌI thư viện (JPA, jOOQ, MyBatis, JdbcTemplate)
   ✅ Đếm riêng SELECT / INSERT / UPDATE / DELETE
   ✅ Bắt được UPDATE bất ngờ ở tầng "chỉ đọc"
   ✅ Log kèm tham số thật và thời gian thực thi
   ✅ Có thể bắt query CHẬM riêng, không chỉ query NHIỀU
```

### Cách 3 — biến ngưỡng thành annotation, dùng lại khắp nơi

```java
@Target(METHOD) @Retention(RUNTIME)
@ExtendWith(QueryCountExtension.class)
public @interface AssertMaxQueries {
    int value();
}

public class QueryCountExtension implements BeforeEachCallback, AfterEachCallback {

    @Override public void beforeEach(ExtensionContext ctx) {
        QueryCountHolder.clear();
    }

    @Override public void afterEach(ExtensionContext ctx) {
        int max = ctx.getRequiredTestMethod()
                     .getAnnotation(AssertMaxQueries.class).value();
        int actual = QueryCountHolder.getGrandTotal().getTotal();

        if (actual > max) {
            throw new AssertionError(String.format(
                "Chạy %d query, tối đa cho phép %d. Nghi ngờ N+1.%n%s",
                actual, max, QueryCountHolder.getGrandTotal()));
        }
    }
}
```

```java
// Dùng cực gọn — mỗi API danh sách một dòng
@Test @AssertMaxQueries(3)
void danh_sach_don_hang() { orderQueryService.search(c, page); }

@Test @AssertMaxQueries(2)
void chi_tiet_don_hang() { orderQueryService.findDetail(1L); }

@Test @AssertMaxQueries(5)
void bao_cao_doanh_thu() { reportService.monthlyRevenue(2026, 8); }
```

```text
   QUY TẮC ÁP DỤNG:

   ① MỌI API TRẢ VỀ DANH SÁCH đều phải có test đếm query. Không ngoại lệ.
   ② Ngưỡng đặt bằng "số query hiện tại", KHÔNG phải số lý tưởng.
      → Mục tiêu là CHẶN TĂNG, không phải ép hoàn hảo ngay.
   ③ Ai muốn nâng ngưỡng phải giải thích trong mô tả PR.
      → Biến quyết định ngầm thành quyết định có ý thức.
```

## Công cụ ③ — tắt `open-in-view`: một dòng, hiệu quả nhất

Đây là cấu hình quan trọng nhất mà **99% dự án Spring Boot để mặc định sai**.

```text
   SPRING BOOT MẶC ĐỊNH: spring.jpa.open-in-view = true

   Và nó CÓ IN CẢNH BÁO lúc khởi động — nhưng gần như không ai đọc:

   WARN JpaBaseConfiguration$JpaWebConfiguration :
     spring.jpa.open-in-view is enabled by default. Therefore, database
     queries may be performed during view rendering. Explicitly configure
     spring.jpa.open-in-view to disable this warning
```

### `open-in-view = true` làm gì

```text
   ┌─────────────────────────────────────────────────────────────┐
   │  HTTP request đến                                            │
   │       │                                                      │
   │       ▼                                                      │
   │  ╔═══════════════════════════════════════════════════════╗  │
   │  ║ MỞ PERSISTENCE CONTEXT  ← ngay từ đầu, ở tầng Filter  ║  │
   │  ║                                                        ║  │
   │  ║   Controller                                           ║  │
   │  ║     ↓                                                  ║  │
   │  ║   Service  [@Transactional mở/đóng Ở ĐÂY]             ║  │
   │  ║     ↓                                                  ║  │
   │  ║   Controller trả về entity                             ║  │
   │  ║     ↓                                                  ║  │
   │  ║   Jackson serialize  ← ⚠ LAZY LOAD CHẠY ĐƯỢC Ở ĐÂY   ║  │
   │  ║     ↓                       và nó CHẠY LẶNG LẼ         ║  │
   │  ║   Thymeleaf render   ← ⚠ LAZY LOAD CHẠY ĐƯỢC Ở ĐÂY   ║  │
   │  ╚═══════════════════════════════════════════════════════╝  │
   │  ĐÓNG PERSISTENCE CONTEXT                                    │
   └─────────────────────────────────────────────────────────────┘

   HẬU QUẢ:
   ① N+1 xảy ra TRONG LÚC SERIALIZE — nơi bạn không nhìn, không có test
   ② Kết nối database bị GIỮ suốt vòng đời request, kể cả lúc render HTML
      → pool cạn sớm hơn nhiều so với dự tính
   ③ Truy vấn chạy NGOÀI transaction → không có đảm bảo nhất quán
   ④ Lỗi lộ ra ở tầng view, stack trace không chỉ tới nguyên nhân
```

```properties
# ✅ Tắt đi
spring.jpa.open-in-view=false
```

```text
   ĐIỀU GÌ XẢY RA SAU KHI TẮT:

   Mọi chỗ đang lazy load ngoài @Transactional sẽ ném:
      org.hibernate.LazyInitializationException:
        could not initialize proxy [com.shop.Author#7] - no Session

   NGHE NHƯ ĐANG LÀM HỎNG MỌI THỨ. THỰC RA ĐANG PHƠI BÀY BUG CÓ SẴN.

   Những chỗ đó VỐN ĐÃ chạy query ngoài transaction, âm thầm, không ai biết.
   Tắt open-in-view chỉ chuyển chúng từ "N+1 im lặng" thành "lỗi ồn ào".

   → LỖI ỒN ÀO LÚC PHÁT TRIỂN TỐT HƠN LỖI IM LẶNG TRÊN PRODUCTION.
```

**Quy trình tắt an toàn — đừng đẩy thẳng lên production:**

```text
   BƯỚC 1: Bật ở môi trường DEV trước
           application-dev.properties: spring.jpa.open-in-view=false

   BƯỚC 2: Chạy toàn bộ test tích hợp
           → Mỗi LazyInitializationException là một chỗ cần sửa

   BƯỚC 3: Sửa từng chỗ theo đúng cách
           ✅ Nạp đủ dữ liệu TRONG service bằng JOIN FETCH/@EntityGraph
           ✅ Hoặc chuyển hẳn sang DTO projection (cách tốt nhất)
           ❌ ĐỪNG mở rộng @Transactional lên tận controller để "chữa"

   BƯỚC 4: Lên staging, chạy hồi quy đầy đủ

   BƯỚC 5: Lên production
```

```java
// ❌ CÁCH CHỮA SAI — đẩy transaction lên controller
@Transactional                        // giữ transaction suốt request
@GetMapping("/orders")
public List<Order> list() { ... }

// ✅ CÁCH CHỮA ĐÚNG — nạp đủ trong service, trả DTO
@GetMapping("/orders")
public List<OrderCard> list(Pageable p) {
    return orderQueryService.search(p);      // trả record, không có proxy nào
}
```

## Công cụ ④ — phát hiện trên production

### `pg_stat_statements` — nhìn từ phía database

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

```sql
-- Chữ ký của N+1: gọi RẤT NHIỀU nhưng mỗi lần RẤT NHANH
SELECT calls,
       round(mean_exec_time::numeric, 3)                AS tb_ms,
       round((total_exec_time / 1000)::numeric)         AS tong_giay,
       round(100 * total_exec_time
             / sum(total_exec_time) OVER ()::numeric, 1) AS pct,
       left(query, 60)                                   AS cau_lenh
FROM pg_stat_statements
WHERE calls > 100000 AND mean_exec_time < 5      -- ← nhanh nhưng gọi nhiều
ORDER BY total_exec_time DESC
LIMIT 10;
```

```text
   calls    | tb_ms | tong_giay |  pct | cau_lenh
   ---------+-------+-----------+------+----------------------------------
   12840000 | 0.243 |      3120 | 38.4 | select ... order_items where order_id=$1
    4210000 | 0.272 |      1146 | 14.1 | select ... products where category_id=$1

   ⚠ LƯU Ý CÁCH ĐỌC — ĐÂY LÀ PHẦN NGƯỜI MỚI HAY LÀM SAI:

   Hai câu này đều chạy DƯỚI 0,3 ms — chúng là những câu NHANH NHẤT.
   Nhưng chúng chiếm 52% TỔNG thời gian database.

   → ĐỪNG TÌM CÂU CHẬM NHẤT. HÃY TÌM CÂU TỐN TỔNG THỜI GIAN NHIỀU NHẤT.
     Sắp theo `mean_exec_time` sẽ KHÔNG BAO GIỜ tìm ra N+1.
```

### APM và distributed tracing — nhìn từ phía ứng dụng

```text
   MỘT TRACE BÌNH THƯỜNG:
   ├─ GET /api/orders                          230 ms
   │  ├─ SELECT orders                          12 ms
   │  └─ SELECT order_items WHERE order_id IN   18 ms
   → 2 span database

   MỘT TRACE CÓ N+1:
   ├─ GET /api/orders                         3.400 ms
   │  ├─ SELECT orders                          12 ms
   │  ├─ SELECT order_items WHERE order_id=1     2 ms
   │  ├─ SELECT order_items WHERE order_id=2     2 ms
   │  ├─ ... (198 span nữa) ...
   → 201 span database  ◄── CHỮ KÝ RẤT DỄ NHẬN

   → Trong Datadog/Jaeger/Elastic APM, hãy tạo dashboard theo
     SỐ SPAN DATABASE MỖI REQUEST, không chỉ theo thời gian.
```

```yaml
# Alert dựa trên số span, không phải độ trễ
- alert: SoQueryMoiRequestCao
  expr: |
    sum by (route) (rate(db_query_total[5m]))
      / sum by (route) (rate(http_server_requests_seconds_count[5m])) > 15
  for: 10m
  annotations:
    summary: "{{ $labels.route }} chạy > 15 query mỗi request — nghi N+1"
```

## AI sinh code và N+1 — vấn đề mới, rất thật

Đây là nguồn N+1 phổ biến nhất hiện nay, và nó xứng đáng có mục riêng.

```text
   VÌ SAO CODE DO AI SINH RA HAY DÍNH N+1:

   ① AI TỐI ƯU CHO "CODE CHẠY ĐÚNG VÀ ĐỌC DỄ",
      KHÔNG PHẢI "CODE CHẠY ÍT QUERY".
      Vòng lặp gọi getter là cách diễn đạt TỰ NHIÊN NHẤT của ý định.

   ② DỮ LIỆU HUẤN LUYỆN ĐẦY TUTORIAL.
      Tutorial dạy khái niệm nên dùng ví dụ đơn giản nhất:
      `for (Author a : authors) { a.getBooks(); }`
      → Đúng về mặt dạy học, sai về mặt production.

   ③ AI KHÔNG THẤY CẤU HÌNH CỦA BẠN.
      Nó không biết @ManyToOne của bạn có LAZY không,
      không biết default_batch_fetch_size bật chưa,
      không biết bảng này có 3 dòng hay 3 triệu dòng.

   ④ CODE TRÔNG RẤT SẠCH → QUA CODE REVIEW DỄ DÀNG.
      Đây là điểm nguy hiểm nhất: N+1 do AI sinh ra
      thường ĐẸP HƠN code người viết, nên ít bị soi.
```

```java
// Ví dụ điển hình — yêu cầu: "viết API trả danh sách đơn hàng kèm tên khách"
// Code sinh ra thường có dạng:
@GetMapping("/orders")
public List<OrderDto> getOrders() {
    return orderRepository.findAll().stream()
            .map(order -> new OrderDto(
                    order.getId(),
                    order.getCustomer().getName(),        // ☠ N+1 #1
                    order.getItems().size(),              // ☠ N+1 #2
                    order.getItems().stream()             // ☠ N+1 #3 (đã nạp, nhưng)
                         .map(OrderItem::getProduct)      // ☠ N+1 #4 — lồng nhau
                         .map(Product::getName).toList()))
            .toList();
}
// Sạch, dễ đọc, dùng stream API hiện đại, và chạy hàng nghìn query.
```

**Cách làm việc với AI mà không dính N+1:**

```text
   ① ĐƯA RÀNG BUỘC VÀO YÊU CẦU, ĐỪNG CHỈ MÔ TẢ CHỨC NĂNG

      ❌ "Viết API trả danh sách đơn hàng kèm tên khách"
      ✅ "Viết API trả danh sách đơn hàng kèm tên khách.
          Ràng buộc: tối đa 2 query, dùng DTO projection,
          không nạp entity, có phân trang."

   ② YÊU CẦU NÓ TỰ ĐẾM
      "Liệt kê chính xác các câu SQL đoạn code này sinh ra,
       theo đúng thứ tự, với 20 bản ghi."
      → Rất hiệu quả: buộc nó suy nghĩ về I/O thay vì cú pháp.

   ③ ĐƯA NGỮ CẢNH THẬT
      Dán entity kèm annotation, dán application.properties,
      nói rõ bảng có bao nhiêu dòng.

   ④ LUÔN CÓ TEST ĐẾM QUERY
      Đây là lớp bảo vệ DUY NHẤT không phụ thuộc vào việc
      người review có tinh mắt hay không.
```

```text
   ⚠ NGUYÊN TẮC CHUNG:
      AI làm tăng TỐC ĐỘ SINH CODE nhưng không làm tăng
      tốc độ PHÁT HIỆN LỖI HIỆU NĂNG.

      → Khoảng cách giữa hai tốc độ đó chính là chỗ N+1 sinh sôi.
      → Bù lại bằng TỰ ĐỘNG HOÁ VIỆC PHÁT HIỆN, không bằng
        "review kỹ hơn" — vì con người không scale, còn test thì có.
```

## Danh sách kiểm tra — dán vào dự án của bạn

```text
   ┌─ CẤU HÌNH (làm một lần, 30 phút) ────────────────────────────┐
   │ ☐ spring.jpa.open-in-view=false                              │
   │ ☐ hibernate.default_batch_fetch_size=25                      │
   │ ☐ hibernate.generate_statistics=true (ít nhất ở dev/test)    │
   │ ☐ logging.level.org.hibernate.SQL=DEBUG (chỉ dev)            │
   │ ☐ TẮT spring.jpa.show-sql (dùng logger thay thế)             │
   ├─ KIẾN TRÚC (làm một lần, 1 ngày) ────────────────────────────┤
   │ ☐ ArchUnit: mọi @ManyToOne/@OneToOne khai LAZY               │
   │ ☐ ArchUnit: controller không phụ thuộc entity                │
   │ ☐ ArchUnit: package query/ không import entity               │
   │ ☐ Tách package command/ và query/                            │
   ├─ TEST (liên tục) ────────────────────────────────────────────┤
   │ ☐ @AssertMaxQueries cho MỌI API danh sách                    │
   │ ☐ Test "số query không tăng theo số bản ghi"                 │
   │ ☐ Test không có cảnh báo HHH90003004                         │
   │ ☐ WireMock verify số lời gọi HTTP (bài 7)                    │
   │ ☐ Testcontainers — database thật, không phải H2              │
   ├─ GIÁM SÁT (làm một lần, nửa ngày) ───────────────────────────┤
   │ ☐ Metric: query mỗi request, theo route                      │
   │ ☐ Alert: > 15 query/request trong 10 phút                    │
   │ ☐ Alert: xuất hiện HHH90003004                               │
   │ ☐ Alert: tỉ lệ toè HTTP > 5 (bài 7)                          │
   │ ☐ Xem pg_stat_statements hằng tuần, sắp theo total_exec_time │
   └───────────────────────────────────────────────────────────────┘
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Bạn thêm test đếm query cho 30 API. **19 test đỏ ngay lập tức.** Đội hoảng và muốn bỏ luôn ý tưởng này.

**Chẩn đoán:** đây là kết quả **bình thường và tốt** — bạn vừa phát hiện 19 vấn đề đã tồn tại từ lâu. Vấn đề là cách triển khai, không phải ý tưởng.

**Cách xử lý — đặt ngưỡng bằng hiện trạng, rồi siết dần:**

```java
// ① BƯỚC 1: ghi nhận hiện trạng, KHÔNG ép lý tưởng
@Test @AssertMaxQueries(47)      // ← số query HIỆN TẠI, không phải số mong muốn
void danh_sach_don_hang() { ... }
```

```text
   → CI XANH NGAY. Và từ giờ, số query KHÔNG THỂ TĂNG THÊM.
     Đây đã là 80% giá trị: bạn chặn được sự xói mòn.
```

```java
// ② BƯỚC 2: xếp hạng theo mức độ tệ, sửa dần theo sprint
@Test @AssertMaxQueries(47)  // TODO ORD-231: mục tiêu 3 — sprint 12
@Test @AssertMaxQueries(12)  // TODO ORD-232: mục tiêu 2 — sprint 13
@Test @AssertMaxQueries(3)   // ✅ đã sửa xong
```

```java
// ③ BƯỚC 3: chặn API MỚI ở ngưỡng nghiêm
// Quy ước: mọi endpoint mới bắt buộc ≤ 5 query, không có ngoại lệ.
```

```text
   THÔNG ĐIỆP GỬI ĐỘI:
   "19 test đỏ không phải là 19 lỗi mới — đó là 19 lỗi ĐÃ CÓ
    mà chúng ta vừa mới NHÌN THẤY được. Trước đây chúng ta không đỏ
    vì chúng ta không đo, chứ không phải vì không có vấn đề."
```

> **Tình huống 2:** Test đếm query xanh trên CI nhưng production vẫn N+1.

**Chẩn đoán — bốn nguyên nhân, kiểm tra theo thứ tự:**

```java
// ① TEST DÙNG H2 THAY VÌ DATABASE THẬT
//    → SQL phương ngữ khác, kế hoạch khác, hành vi batch fetch có thể khác
// ✅ Testcontainers, luôn luôn
@Container static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16");
```

```java
// ② DỮ LIỆU TEST QUÁ NHỎ
//    3 tác giả → @BatchSize(25) gom hết trong 1 lô → 2 query → test xanh
//    500 tác giả trên production → 20 lô → 21 query
// ✅ Seed đủ lớn để VƯỢT kích thước lô
@Test void voi_du_lieu_lon() {
    seed(500, 10);                        // > default_batch_fetch_size
    assertThat(queryCount()).isLessThanOrEqualTo(25);
}
```

```java
// ③ TEST GỌI SERVICE, KHÔNG QUA HTTP
//    → Bỏ qua tầng serialize, nơi Jackson gây N+1
// ✅ Test qua MockMvc để đi hết vòng đời request
mockMvc.perform(get("/api/orders?size=50")).andExpect(status().isOk());
```

```properties
# ④ CẤU HÌNH TEST KHÁC PRODUCTION
#    application-test.properties có open-in-view=false
#    nhưng application.properties (production) thì không
# ✅ Kiểm tra bằng test:
```

```java
@Test
void cau_hinh_production_phai_dung() {
    assertThat(env.getProperty("spring.jpa.open-in-view")).isEqualTo("false");
    assertThat(env.getProperty("spring.jpa.properties.hibernate.default_batch_fetch_size"))
        .isNotNull();
}
```

> **Tình huống 3:** Sau khi tắt `open-in-view`, 12 màn hình lỗi `LazyInitializationException`. Sếp bảo bật lại.

**Chẩn đoán — cần trình bày đúng bản chất, không tranh cãi kỹ thuật:**

```text
   ĐIỀU CẦN NÓI RÕ:

   "12 màn hình này KHÔNG PHẢI vừa hỏng. Chúng vốn đã chạy truy vấn
    database trong lúc render, ngoài transaction, suốt từ trước tới nay.
    Chúng ta chỉ vừa mới NHÌN THẤY điều đó.

    Nếu bật lại, 12 màn hình đó vẫn tiếp tục chạy query ẩn như cũ —
    chúng ta chỉ tắt đèn đi thôi."
```

**Cách xử lý — đề xuất lộ trình có kiểm soát thay vì chọn bật/tắt:**

```text
   TUẦN 1: bật open-in-view=false CHỈ ở môi trường dev
           → Đội thấy lỗi khi phát triển, production không ảnh hưởng

   TUẦN 2: sửa 12 màn hình — ưu tiên theo lưu lượng
           Mỗi màn hình: nạp đủ trong service, chuyển sang DTO

   TUẦN 3: bật ở staging, chạy hồi quy đầy đủ

   TUẦN 4: bật ở production

   → Không phải quyết định "bật hay tắt" mà là "tắt theo lộ trình".
     Cách trình bày này thường được chấp nhận, còn "tắt ngay" thì không.
```

**Chặn tái diễn:**

```java
@Test
void open_in_view_phai_tat_o_moi_moi_truong() {
    for (String profile : List.of("dev", "staging", "prod")) {
        assertThat(loadProperties(profile).get("spring.jpa.open-in-view"))
            .as("Profile %s", profile)
            .isEqualTo("false");
    }
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dựa vào `show-sql` để phát hiện | Nó **in** chứ không **đếm**; 201 câu trôi qua không ai thấy | `generate_statistics` + test đếm |
| Để `show-sql` bật trên production | Ghi I/O đồng bộ mỗi query → chậm đáng kể | Dùng logger, tắt ở production |
| Không tắt `open-in-view` | N+1 xảy ra lúc serialize — nơi không có test | `open-in-view=false` |
| Mở rộng `@Transactional` lên controller để chữa | Giữ kết nối suốt request, quay lại vấn đề cũ | Nạp đủ trong service, trả DTO |
| Test dùng H2 thay database thật | Phương ngữ khác, hành vi khác → test xanh giả | Testcontainers |
| Dữ liệu test quá nhỏ | 3 bản ghi < kích thước lô → không lộ N+1 | Seed vượt `batch_fetch_size` |
| Test gọi thẳng service | Bỏ qua tầng serialize | Test qua `MockMvc` |
| Đặt ngưỡng lý tưởng ngay từ đầu | 19 test đỏ → đội bỏ luôn ý tưởng | Ngưỡng = hiện trạng, siết dần |
| Sắp `pg_stat_statements` theo `mean_exec_time` | **Không bao giờ** tìm ra N+1 | Sắp theo `total_exec_time` |
| Chỉ giám sát độ trễ | N+1 nhẹ không đủ chậm để báo động, nhưng vẫn tốn tiền | Giám sát **query/request** |
| Tin code do AI sinh vì "trông sạch" | N+1 do AI sinh thường đẹp hơn code người | Test đếm query, không dựa vào review |
| Sửa hết N+1 nhưng không dựng lưới chắn | 6 tháng sau có N+1 mới | Lưới chắn là deliverable chính |

## Câu hỏi phỏng vấn hay gặp

**H: Làm sao phát hiện N+1?**
Em dùng năm lớp. Lúc viết code thì `open-in-view=false` để lazy load sai chỗ nổ ngay trên máy dev, cộng ArchUnit bắt `@ManyToOne` phải khai `LAZY`. Lúc chạy test thì **test đếm query** — đây là lớp quan trọng nhất vì nó biến N+1 từ sự cố production thành CI đỏ. Lúc chạy local thì datasource-proxy log kèm tham số. Trên production thì Hibernate Statistics đẩy vào Micrometer, cộng số span database mỗi trace trên APM. Và ở tầng database thì `pg_stat_statements`. Nhưng em đầu tư nhiều nhất vào hai lớp đầu, vì lớp cuối chỉ phát hiện **sau khi** đã lên production.

**H: Vì sao `show-sql` không đủ?**
Vì nó **in** chứ không **đếm** — 201 câu trôi qua terminal và bạn phải tự đếm bằng mắt. Ngoài ra nó ghi thẳng ra `System.out` chứ không qua logger nên không lọc hay định tuyến được, không hiện tham số nên không phân biệt được "20 câu khác nhau" với "20 câu giống hệt", không cho biết dòng code nào gây ra, và bật trên production thì thêm một lần ghi I/O đồng bộ cho mỗi query. Em dùng `logging.level.org.hibernate.SQL=DEBUG` khi cần xem câu lệnh, và `generate_statistics` cộng test đếm query khi cần **phát hiện**.

**H: Test đếm query viết thế nào?**
Cách đơn giản là lấy `Statistics` từ `SessionFactory`, gọi `clear()` trước rồi khẳng định `getPrepareStatementCount()` sau. Nhưng em thích cách phổ quát hơn là dùng datasource-proxy đếm ở tầng JDBC, vì nó hoạt động với cả jOOQ, MyBatis, `JdbcTemplate` chứ không riêng Hibernate, và đếm riêng được `SELECT`/`INSERT`/`UPDATE` nên bắt được cả `UPDATE` bất ngờ ở tầng chỉ-đọc. Em gói lại thành annotation `@AssertMaxQueries(3)` cho gọn. Và test hay nhất không phải kiểm tra một ngưỡng cố định mà là **"số query có tăng theo số bản ghi không"** — chạy với 10 bản ghi rồi 100 bản ghi và so sánh, vì đó đúng là định nghĩa của N+1 và không phụ thuộc vào con số ma thuật nào.

**H: `open-in-view` là gì và vì sao nên tắt?**
Spring Boot mặc định bật nó, tức là giữ Persistence Context mở từ đầu request tới lúc render xong response. Hậu quả là lazy loading **chạy được ở tầng serialize và tầng view** — nơi bạn không nhìn và không có test, nên N+1 xảy ra lặng lẽ; kết nối database bị giữ suốt vòng đời request kể cả lúc render HTML nên pool cạn sớm; và truy vấn chạy ngoài transaction nên không có đảm bảo nhất quán. Tắt đi thì những chỗ đó ném `LazyInitializationException`, nghe như đang làm hỏng mọi thứ nhưng thực ra là **phơi bày bug có sẵn** — chúng vốn đã chạy query ngoài transaction từ trước. Lỗi ồn ào lúc phát triển tốt hơn lỗi im lặng trên production. Nhưng em tắt theo lộ trình: dev trước, sửa hết, staging, rồi mới production.

**H: Test đếm query xanh nhưng production vẫn N+1, vì sao?**
Bốn nguyên nhân em kiểm tra theo thứ tự. Test dùng H2 thay vì database thật nên phương ngữ và hành vi khác — em luôn dùng Testcontainers. Dữ liệu test quá nhỏ: với 3 tác giả thì `@BatchSize(25)` gom hết trong một lô nên chỉ 2 query, còn 500 tác giả trên production là 21 query — nên phải seed vượt kích thước lô. Test gọi thẳng service nên bỏ qua tầng serialize, chỗ Jackson gây N+1 — phải test qua `MockMvc`. Và cấu hình test khác production, ví dụ `open-in-view=false` chỉ có trong `application-test.properties`.

**H: Vì sao code do AI sinh ra hay dính N+1?**
Vì AI tối ưu cho code **chạy đúng và đọc dễ**, không phải code **chạy ít query** — và vòng lặp gọi getter là cách diễn đạt tự nhiên nhất của ý định. Thêm nữa dữ liệu huấn luyện đầy tutorial, mà tutorial dùng ví dụ đơn giản nhất để dạy khái niệm. AI cũng không thấy cấu hình của bạn: không biết `@ManyToOne` có `LAZY` không, không biết bảng có 3 dòng hay 3 triệu dòng. Nguy hiểm nhất là code đó **trông rất sạch** nên qua code review dễ dàng. Cách em xử lý là đưa ràng buộc vào yêu cầu — "tối đa 2 query, dùng DTO projection, không nạp entity" — và yêu cầu nó tự liệt kê các câu SQL sẽ sinh ra với 20 bản ghi. Nhưng lớp bảo vệ thật sự vẫn là test đếm query, vì nó không phụ thuộc vào việc người review có tinh mắt hay không.

**H: Thêm test đếm query mà 19 test đỏ ngay, xử lý sao?**
Đó là kết quả tốt — vừa phát hiện 19 vấn đề đã tồn tại từ lâu. Em đặt ngưỡng bằng **số query hiện tại** chứ không phải số lý tưởng, ví dụ `@AssertMaxQueries(47)`. CI xanh ngay, và từ giờ số query **không thể tăng thêm** — đó đã là 80% giá trị vì bạn chặn được xói mòn. Sau đó xếp hạng theo mức độ tệ, gắn ticket và mục tiêu cho từng cái, sửa dần theo sprint. Riêng endpoint **mới** thì áp ngưỡng nghiêm ngay, tối đa 5 query, không ngoại lệ. Thông điệp gửi đội là: 19 test đỏ không phải 19 lỗi mới, đó là 19 lỗi đã có mà giờ ta mới nhìn thấy — trước đây xanh vì không đo, không phải vì không có vấn đề.

## Tóm tắt bài 8

- **`show-sql` là công cụ xem, không phải công cụ phát hiện** — nó in chứ không đếm, không hiện tham số, và làm chậm production.
- Năm lớp phát hiện: cấu hình lúc code → **test đếm query** → local proxy → APM/metrics → `pg_stat_statements`. Đầu tư nhiều nhất vào hai lớp đầu.
- **Test đếm query là lớp phòng thủ quan trọng nhất** — nó biến N+1 từ sự cố production thành CI đỏ.
- Test hay nhất là **"số query không tăng theo số bản ghi"** — đúng định nghĩa N+1, không phụ thuộc con số ma thuật.
- datasource-proxy đếm ở **tầng JDBC** nên hoạt động với mọi thư viện và bắt được `UPDATE` bất ngờ ở tầng chỉ-đọc.
- **`open-in-view=false`** là một dòng cấu hình có hiệu quả cao nhất — nó biến N+1 im lặng thành lỗi ồn ào. Tắt theo lộ trình: dev → sửa → staging → production.
- Sắp `pg_stat_statements` theo **`total_exec_time`**, không phải `mean_exec_time` — thủ phạm là câu **nhanh nhất nhưng gọi nhiều nhất**.
- Giám sát **số query mỗi request** và **số span database mỗi trace**, không chỉ giám sát độ trễ.
- **Code do AI sinh hay dính N+1** vì nó tối ưu cho tính dễ đọc và trông quá sạch để bị soi — bù bằng tự động hoá phát hiện, không bằng "review kỹ hơn".
- Khi thêm test vào hệ thống cũ: **đặt ngưỡng bằng hiện trạng, siết dần** — chặn tăng trước, hoàn hảo sau.

**Quay lại** → [Bài 7: N+1 không chỉ ở database](07-n-cong-1-khong-chi-o-database.md)

**Về mục lục** → [README khoá học](README.md)

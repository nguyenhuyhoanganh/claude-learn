# Case 8: N+1 query — một request sinh 500 câu SQL

```java
@GetMapping("/orders")
public List<OrderDto> list() {
    return orderRepository.findAll().stream()
        .map(o -> new OrderDto(o.getId(), o.getCustomer().getName(), o.getItems().size()))
        .toList();
}
```

Bốn dòng code. Trông sạch sẽ, dễ đọc, review qua ngay. Nó sinh ra **201 câu SQL** cho 100 đơn hàng, và là nguyên nhân phổ biến nhất của "API chậm không hiểu tại sao" trong thế giới Java.

## Cơ chế

```text
   1 câu:  SELECT * FROM orders                            ← "1"

   Rồi với MỖI đơn hàng:
   100 câu: SELECT * FROM customer WHERE id = ?            ← "N"
   100 câu: SELECT * FROM order_item WHERE order_id = ?    ← "N" nữa

   Tổng: 201 câu SQL
```

Tên gọi "N+1" đến từ mẫu 1 + N. Trong thực tế thường là 1 + N + N + N — mỗi quan hệ lazy là một N.

### Vì sao Hibernate làm vậy

**Lazy loading (nạp lười)** — mặc định của JPA cho quan hệ `@OneToMany` và `@ManyToMany`: không nạp dữ liệu liên quan cho tới khi bạn thật sự truy cập nó.

```java
@Entity
public class Order {
    @ManyToOne(fetch = FetchType.EAGER)      // ← mặc định của @ManyToOne là EAGER!
    private Customer customer;

    @OneToMany(mappedBy = "order")            // ← mặc định của @OneToMany là LAZY
    private List<OrderItem> items;
}
```

Ý tưởng ban đầu tốt: đừng nạp thứ không dùng. Vấn đề: khi bạn duyệt một danh sách và truy cập quan hệ của **từng phần tử**, mỗi lần truy cập là một câu SQL.

> Chú ý điểm dễ nhầm: `@ManyToOne` và `@OneToOne` mặc định là **EAGER** — nghĩa là chúng gây N+1 **ngay cả khi bạn không đụng tới**. Nhiều người tưởng "mặc định là lazy" và ngạc nhiên khi thấy hàng trăm query. Luôn đặt `fetch = FetchType.LAZY` tường minh cho mọi quan hệ.

### Chi phí thật

```text
   201 câu SQL × 1 ms round-trip (cùng datacenter) = 201 ms
   201 câu SQL × 5 ms (cloud, khác AZ)            = 1.005 ms

   So với 1 câu JOIN: 8 ms

   ⇒ Chậm gấp 25-125 lần.
```

Và tệ hơn nữa, nhớ lại phase-2 case 2: mỗi câu SQL giữ connection lâu hơn, nên **thông lượng của cả pool giảm 25-125 lần**. Một endpoint N+1 có thể làm chết toàn bộ hệ thống.

## Bảy cách sửa, kèm đánh đổi

### 1. `JOIN FETCH` — cách trực tiếp nhất

```java
@Query("SELECT DISTINCT o FROM Order o " +
       "LEFT JOIN FETCH o.customer " +
       "LEFT JOIN FETCH o.items " +
       "WHERE o.status = :status")
List<Order> findWithDetails(@Param("status") OrderStatus status);
```

Một câu SQL duy nhất, nạp hết mọi thứ.

**Ba cạm bẫy của `JOIN FETCH`**:

**a) Nhân bản dòng.** JOIN với quan hệ một-nhiều làm số dòng nhân lên: 100 đơn × 5 item = 500 dòng trả về. Cần `DISTINCT` (hoặc `Set` thay vì `List`) để Hibernate gộp lại. Với hai quan hệ một-nhiều thì nhân đôi lần nữa: 100 × 5 × 3 = 1.500 dòng — gọi là **tích Descartes**.

**b) `MultipleBagFetchException`.** Hibernate từ chối `JOIN FETCH` hai `List` cùng lúc:

```text
org.hibernate.loader.MultipleBagFetchException:
cannot simultaneously fetch multiple bags
```

Cách sửa: đổi `List` thành `Set`, hoặc tách thành hai query.

**c) Phân trang bị hỏng.** Đây là cạm bẫy nghiêm trọng nhất:

```java
@Query("SELECT o FROM Order o LEFT JOIN FETCH o.items")
Page<Order> findAll(Pageable pageable);      // NGUY HIỂM
```

```text
WARN HHH000104: firstResult/maxResults specified with collection fetch;
                applying in memory!
```

Hibernate **nạp TOÀN BỘ bảng vào bộ nhớ** rồi mới phân trang trong Java. Với 2 triệu đơn hàng, đây là `OutOfMemoryError` chắc chắn. Cảnh báo này chỉ là dòng WARN trong log — rất dễ bỏ qua cho tới ngày production sập.

Giải pháp cho phân trang: dùng cách số 2.

### 2. Hai bước: lấy ID trước, nạp chi tiết sau

```java
public Page<OrderDto> list(Pageable pageable) {
    Page<Long> idPage = orderRepository.findIds(pageable);      // query 1: phân trang trên ID
    List<Order> orders = orderRepository.findByIdsWithDetails(idPage.getContent());  // query 2
    return idPage.map(id -> toDto(findInList(orders, id)));
}
```

```java
@Query("SELECT o.id FROM Order o WHERE o.status = :status ORDER BY o.createdAt DESC")
Page<Long> findIds(@Param("status") OrderStatus status, Pageable pageable);

@Query("SELECT DISTINCT o FROM Order o " +
       "LEFT JOIN FETCH o.customer LEFT JOIN FETCH o.items " +
       "WHERE o.id IN :ids")
List<Order> findByIdsWithDetails(@Param("ids") List<Long> ids);
```

Hai query, phân trang đúng ở tầng database, không nhân bản dòng. Đây là mẫu chuẩn cho **danh sách có phân trang kèm quan hệ**.

### 3. `@EntityGraph` — sạch sẽ hơn JPQL

```java
@EntityGraph(attributePaths = { "customer", "items", "items.product" })
List<Order> findByStatus(OrderStatus status);
```

Tương đương `JOIN FETCH` nhưng tách khỏi câu query — dùng lại được với nhiều method, dễ đọc hơn.

### 4. Batch fetching — giảm N thành N/batch_size

```yaml
spring:
  jpa:
    properties:
      hibernate:
        default_batch_fetch_size: 100
```

Thay vì 100 câu `WHERE id = ?`, Hibernate gộp thành:

```sql
SELECT * FROM customer WHERE id IN (1,2,3,...,100);
```

```text
   Trước: 1 + 100 + 100 = 201 câu
   Sau:   1 + 1 + 1     = 3 câu
```

**Đây là cấu hình đáng giá nhất trong bài.** Một dòng YAML, áp dụng cho toàn bộ ứng dụng, không phải sửa code nào, và giảm N+1 xuống mức chấp nhận được ở mọi nơi.

Nó không thay thế `JOIN FETCH` (vẫn có 3 round-trip thay vì 1), nhưng nó là **lưới an toàn** cho những chỗ bạn quên tối ưu. Nên bật ở mọi dự án JPA.

Có thể chỉ định riêng cho từng quan hệ:

```java
@BatchSize(size = 50)
@OneToMany(mappedBy = "order")
private List<OrderItem> items;
```

### 5. DTO projection — chỉ lấy đúng cái cần

Cách nhanh nhất, và thường là cách đúng nhất cho API đọc:

```java
public interface OrderSummary {
    Long getId();
    String getCustomerName();
    Integer getItemCount();
}

@Query("""
    SELECT o.id AS id,
           c.name AS customerName,
           COUNT(i.id) AS itemCount
    FROM Order o
    JOIN o.customer c
    LEFT JOIN o.items i
    WHERE o.status = :status
    GROUP BY o.id, c.name
    """)
List<OrderSummary> findSummaries(@Param("status") OrderStatus status);
```

Một câu SQL, chỉ lấy 3 cột, **không tạo entity nào** (nên không có persistence context, không có dirty checking, không có lazy loading).

```text
   Entity đầy đủ: 1 đơn hàng ≈ 500 byte trong bộ nhớ + chi phí theo dõi thay đổi
   DTO projection: 1 dòng ≈ 60 byte

   Với 10.000 dòng: 5 MB vs 0,6 MB, và nhanh hơn ~3 lần
```

**Nguyên tắc quan trọng**: entity JPA sinh ra để **ghi** (có dirty checking, có quản lý trạng thái). Với **đọc**, DTO projection gần như luôn tốt hơn. Đây cũng là ý tưởng nền của CQRS — tách mô hình đọc và mô hình ghi.

### 6. `@Fetch(FetchMode.SUBSELECT)`

```java
@OneToMany(mappedBy = "order")
@Fetch(FetchMode.SUBSELECT)
private List<OrderItem> items;
```

Hibernate sinh:

```sql
SELECT * FROM order_item WHERE order_id IN (SELECT id FROM orders WHERE status = ?);
```

Một câu cho tất cả collection. Hữu ích khi tập kết quả lớn và bạn không muốn danh sách ID quá dài trong `IN`.

### 7. Cache tầng hai (dùng thận trọng)

```java
@Entity
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
public class Product { ... }
```

Với dữ liệu ít thay đổi (danh mục, cấu hình), cache tầng hai loại bỏ hẳn query. Nhưng nó thêm vấn đề về nhất quán khi chạy nhiều instance — cần cache phân tán (Hazelcast, Infinispan) hoặc chấp nhận dữ liệu cũ.

Đừng dùng cache để che giấu N+1. Sửa query trước, cache sau.

## Phát hiện N+1 tự động

Đừng chờ tới lúc production chậm. Ba lớp phòng thủ:

### Lớp 1: Bật thống kê trong môi trường phát triển

```yaml
spring:
  jpa:
    properties:
      hibernate:
        generate_statistics: true
logging:
  level:
    org.hibernate.stat: DEBUG
    org.hibernate.SQL: DEBUG
```

```text
Session Metrics {
    1234567 nanoseconds spent preparing 201 JDBC statements;   ← 201!
    ...
}
```

Con số `201 JDBC statements` cho một request là dấu hiệu không thể rõ ràng hơn.

### Lớp 2: Đếm query trong test tự động

Đây là cách hiệu quả nhất — **biến N+1 thành lỗi build**:

```java
@Test
void listOrdersShouldNotHaveNPlusOne() {
    Statistics stats = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
    stats.clear();

    orderService.list(PageRequest.of(0, 100));

    assertThat(stats.getPrepareStatementCount())
        .as("Số câu SQL phải không đổi theo số bản ghi")
        .isLessThanOrEqualTo(3);
}
```

Test này bắt được N+1 ngay khi ai đó thêm một quan hệ lazy mới. Rất đáng viết cho mọi endpoint danh sách.

### Lớp 3: Chặn ở runtime

Thư viện **datasource-proxy** hoặc **QuickPerf** có thể ném exception khi một transaction vượt ngưỡng số query:

```java
@Bean
public DataSource dataSource(DataSource original) {
    return ProxyDataSourceBuilder.create(original)
        .countQuery()
        .logQueryBySlf4j(SLF4JLogLevel.DEBUG)
        .afterQuery((execInfo, queryInfoList) -> {
            if (queryCounter.incrementAndGet() > 50) {
                log.warn("Request sinh > 50 query — nghi ngờ N+1", new Exception("stack"));
            }
        })
        .build();
}
```

Bật ở staging, ghi log kèm stack trace — bạn sẽ tìm ra mọi chỗ N+1 trong vài ngày.

## Trường hợp thực tế: API danh sách đơn hàng

Trạng thái ban đầu:

```text
   GET /api/orders?page=0&size=50
   Thời gian: 3.200 ms
   Số query: 253
   Cấu trúc: 1 (orders) + 50 (customer) + 50 (items) + 150 (product của từng item)
```

Quá trình tối ưu từng bước:

| Bước | Thay đổi | Query | Thời gian |
|---|---|---|---|
| 0 | Ban đầu | 253 | 3.200 ms |
| 1 | Bật `default_batch_fetch_size: 100` | 4 | 210 ms |
| 2 | Đổi sang hai bước (ID rồi chi tiết) | 2 | 95 ms |
| 3 | Đổi sang DTO projection | 1 | **38 ms** |
| 4 | Thêm index trên `(status, created_at)` | 1 | **11 ms** |

**Từ 3.200 ms xuống 11 ms — nhanh gấp 290 lần.**

Điều đáng chú ý: bước 1 chỉ là **một dòng cấu hình** và đã giải quyết 93% vấn đề. Nếu bạn chỉ làm được một việc sau khi đọc bài này, hãy làm việc đó.

Và hệ quả dây chuyền: thời gian giữ connection giảm từ 3,2 giây xuống 11 ms → thông lượng của connection pool tăng **290 lần** (phase-2 case 2). Một endpoint được sửa làm cả hệ thống khoẻ lên.

## Vấn đề anh em: `SELECT *` và OFFSET pagination

Hai vấn đề cùng họ, hay xuất hiện cạnh N+1:

### `SELECT *` lấy cả cột lớn

```java
@Entity
public class Article {
    private String title;

    @Lob
    private String content;        // 500 KB mỗi bài
}
```

`findAll()` lấy cả `content`. Danh sách 100 bài = 50 MB truyền qua mạng chỉ để hiển thị tiêu đề.

Sửa: DTO projection, hoặc `@Basic(fetch = FetchType.LAZY)` cho cột lớn (cần bytecode enhancement mới hoạt động).

### OFFSET pagination chậm dần

```sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 100000;
```

Database phải **đọc và bỏ 100.000 dòng** rồi mới lấy 20 dòng cần. Trang 1 nhanh, trang 5.000 mất vài giây.

```text
   OFFSET 0      →  2 ms
   OFFSET 10000  →  45 ms
   OFFSET 100000 →  480 ms
   OFFSET 1000000→  4.800 ms
```

Sửa bằng **keyset pagination** (còn gọi là cursor pagination):

```sql
-- Thay vì OFFSET, dùng giá trị của dòng cuối trang trước
SELECT * FROM orders
WHERE (created_at, id) < (:lastCreatedAt, :lastId)
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

Thời gian **không đổi** dù ở trang nào, vì database nhảy thẳng tới vị trí nhờ index.

Đánh đổi: không nhảy được tới "trang 500" bất kỳ, chỉ đi tuần tự tiến/lùi. Với giao diện cuộn vô hạn (infinite scroll) thì hoàn hảo; với bảng có số trang thì phải thiết kế lại giao diện.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Để `@ManyToOne` mặc định (EAGER) | N+1 ngay cả khi không dùng quan hệ đó |
| `JOIN FETCH` + `Pageable` | Hibernate nạp cả bảng vào RAM → OOM |
| `JOIN FETCH` hai `List` | `MultipleBagFetchException` |
| Quên `DISTINCT` khi fetch collection | Kết quả nhân bản |
| Dùng entity cho API chỉ đọc | Tốn bộ nhớ, chậm, kéo theo lazy loading |
| Không bật `default_batch_fetch_size` | Bỏ lỡ cải thiện lớn nhất với chi phí nhỏ nhất |
| OFFSET pagination cho bảng lớn | Trang sau chậm dần tới vài giây |
| Không có test đếm query | N+1 mới lặng lẽ lọt vào mỗi lần thêm quan hệ |

## Tóm tắt case 8

- N+1 = 1 query cha + N query con, thường **200+ câu SQL cho một request**.
- `@ManyToOne`/`@OneToOne` mặc định **EAGER** — luôn đặt `LAZY` tường minh.
- Cải thiện lớn nhất với chi phí nhỏ nhất: **`hibernate.default_batch_fetch_size: 100`**.
- `JOIN FETCH` + phân trang = **nạp cả bảng vào RAM**. Dùng mẫu **hai bước (ID rồi chi tiết)**.
- **DTO projection** là lựa chọn đúng cho mọi API chỉ đọc — entity sinh ra để ghi.
- Viết **test đếm số query** để biến N+1 thành lỗi build.
- Vấn đề anh em: `SELECT *` với cột lớn, và **OFFSET pagination** chậm dần → dùng **keyset pagination**.
- Hệ quả dây chuyền: sửa N+1 làm giảm thời gian giữ connection → **tăng thông lượng cả hệ thống**.

**Bài kế tiếp** → [Case 9: Thiếu index — khi một query chậm khoá gần như cả bảng](09-case-thieu-index.md)

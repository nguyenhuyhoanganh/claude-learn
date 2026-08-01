# Bài 9: Bốn bài toán đọc kinh điển trong production

Tám bài trước dùng ví dụ Author/Book vì nó gọn và dễ theo dõi. Nhưng trong công việc thật bạn không gặp "tác giả và sách" — bạn gặp:

```text
   · Màn hình danh sách đơn hàng có 8 bộ lọc, sắp xếp được, phân trang tới trang 500
   · Feed sản phẩm phải hiện "bạn đã thích cái này chưa"
   · Sidebar hiện 6 con số: đơn chờ, tin nhắn chưa đọc, thông báo mới...
   · Nút "Xuất Excel" trên bảng 3 triệu dòng
```

Bốn màn hình này chiếm phần lớn lưu lượng đọc của gần như mọi sản phẩm. Và **cả bốn đều có một dạng N+1 riêng, với cách chữa riêng**.

Bài này làm end-to-end từng bài toán: SQL sinh ra, con số đo được, và code sửa.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Keyset pagination** | ki-sét | **Phân trang theo mốc** — dùng `WHERE id < ?` thay `OFFSET` |
| **Offset pagination** | óp-sét | **Phân trang theo vị trí** — `LIMIT 20 OFFSET 10000` |
| **Deep offset** | | **Offset sâu** — trang thứ vài trăm; database vẫn phải quét bỏ hết dòng trước |
| **Seek method** | sịc | Tên gọi khác của keyset pagination |
| **`Specification`** | | API của Spring Data để **dựng điều kiện động** bằng Java |
| **Criteria API** | crai-ti-ri-a | API JPA dựng truy vấn bằng đối tượng thay vì chuỗi |
| **Counter cache** | | **Cột đếm sẵn** — lưu số lượng vào bảng cha thay vì `COUNT` mỗi lần |
| **Denormalization** | đi-noọc-ma-lai | **Phi chuẩn hoá** — cố ý lặp dữ liệu để đọc nhanh hơn |
| **Materialized view** | ma-tê-ri-ơ-lai | **Khung nhìn vật chất hoá** — kết quả truy vấn được lưu sẵn thành bảng |
| **`EXISTS`** | ếch-dít | Toán tử SQL kiểm tra *"có tồn tại dòng nào không"*, dừng ngay khi thấy dòng đầu |
| **Semi join** | xê-mi | **Nối một nửa** — kế hoạch tối ưu mà planner chọn cho `EXISTS`/`IN` |
| **Cursor** | cơ-xơ | **Con trỏ** — đọc kết quả từng phần thay vì tải hết về |
| **`fetchSize`** | phét-sai | Số dòng driver JDBC lấy về **mỗi lượt** |
| **Streaming** | strim-ming | **Đọc dòng chảy** — xử lý từng dòng, không giữ hết trong RAM |
| **`StatelessSession`** | | Phiên Hibernate **không có Persistence Context** — không cache, không dirty checking |

---

## Bài toán 1 — Màn hình danh sách có bộ lọc động

Đây là màn hình phổ biến nhất trong mọi sản phẩm, và cũng là nơi tích tụ nhiều vấn đề nhất cùng lúc.

```text
   YÊU CẦU THỰC TẾ:
   GET /api/orders?status=PENDING&from=2026-01-01&to=2026-08-01
                  &customerName=nguyen&minTotal=500000&channel=WEB
                  &sort=createdAt,desc&page=487&size=20

   · 8 bộ lọc, mỗi cái có thể có hoặc không
   · Sắp xếp theo 5 cột khác nhau
   · Phân trang, và người dùng THẬT SỰ bấm tới trang 487
   · Mỗi dòng hiện: mã đơn, tên khách, tổng tiền, số món, trạng thái
```

### Cách viết đầu tiên ai cũng làm — và ba vấn đề của nó

```java
// ❌ Specification + entity — trông rất "Spring", và rất chậm
public Page<OrderDto> search(OrderCriteria c, Pageable pageable) {
    Specification<Order> spec = Specification.where(null);
    if (c.status() != null)  spec = spec.and(statusEq(c.status()));
    if (c.from() != null)    spec = spec.and(createdAfter(c.from()));
    if (c.customerName()!=null) spec = spec.and(customerNameLike(c.customerName()));

    return orderRepository.findAll(spec, pageable)
            .map(o -> new OrderDto(
                    o.getId(), o.getCode(),
                    o.getCustomer().getName(),      // ☠ N+1 #1
                    o.getTotal(),
                    o.getItems().size(),            // ☠ N+1 #2
                    o.getStatus()));
}
```

```text
   BA VẤN ĐỀ CÙNG LÚC — và chỉ một trong ba là N+1:

   ① N+1: 20 dòng → 41 query (customer + items cho từng đơn)

   ② CÂU COUNT ĐẮT NGANG CÂU DỮ LIỆU:
      Page<> luôn chạy 2 query. Câu COUNT phải quét ĐÚNG bằng
      lượng dữ liệu câu chính, nhưng KHÔNG được hưởng lợi từ LIMIT.
      → Với bộ lọc phức tạp, COUNT thường CHẬM HƠN câu lấy dữ liệu.

   ③ OFFSET SÂU:
      LIMIT 20 OFFSET 9740  → database vẫn phải ĐỌC VÀ BỎ 9.740 dòng
      trước khi trả về 20 dòng bạn cần.
```

**Đo thật trên bảng 4 triệu đơn:**

```sql
EXPLAIN ANALYZE
SELECT * FROM orders WHERE status='PENDING'
ORDER BY created_at DESC LIMIT 20 OFFSET 9740;
```

```text
 Limit  (actual time=842.311..844.209 rows=20 loops=1)
   ->  Index Scan Backward using idx_orders_created  (actual rows=9760)
         Filter: (status = 'PENDING')
         Rows Removed by Filter: 184203      ← đọc 194.000 dòng để lấy 20
 Execution Time: 844.887 ms

 -- Cùng câu đó với OFFSET 0:
 Execution Time: 1.204 ms          ← NHANH GẤP 700 LẦN

 → OFFSET KHÔNG PHẢI "NHẢY TỚI". NÓ LÀ "ĐỌC RỒI VỨT".
   Chi phí tăng TUYẾN TÍNH theo số trang.
```

### Cách viết đúng — giải quyết cả ba

```java
@Repository
@RequiredArgsConstructor
public class OrderSearchDao {

    private final JdbcClient jdbc;

    public Page<OrderCard> search(OrderCriteria c, Pageable pageable) {

        // Điều kiện dựng một lần, dùng cho CẢ HAI câu
        String where = """
            WHERE (:status IS NULL OR o.status = :status)
              AND (CAST(:from AS timestamptz) IS NULL OR o.created_at >= :from)
              AND (CAST(:to   AS timestamptz) IS NULL OR o.created_at <  :to)
              AND (:minTotal IS NULL OR o.total_amount >= :minTotal)
              AND (:channel IS NULL OR o.channel = :channel)
              AND (:customerName IS NULL
                   OR o.customer_name_normalized LIKE :customerName || '%')
            """;

        List<OrderCard> rows = jdbc.sql("""
                SELECT o.id, o.code, o.customer_name, o.total_amount,
                       o.item_count, o.status, o.created_at
                FROM orders o
                """ + where + """
                ORDER BY o.created_at DESC, o.id DESC
                LIMIT :limit OFFSET :offset
                """)
                .params(c.toParamMap())
                .param("limit", pageable.getPageSize())
                .param("offset", pageable.getOffset())
                .query(OrderCard.class).list();

        return PageableExecutionUtils.getPage(rows, pageable,
                () -> countMatching(where, c));      // ← chỉ COUNT KHI CẦN
    }
}
```

```text
   BA QUYẾT ĐỊNH TRONG ĐOẠN CODE TRÊN:

   ① customer_name VÀ item_count NẰM SẴN TRONG BẢNG orders
      → không JOIN, không N+1, không subquery.
      Đây là PHI CHUẨN HOÁ CÓ CHỦ ĐÍCH (nói kỹ ở bài toán 3).

   ② PageableExecutionUtils.getPage() CHỈ CHẠY COUNT KHI THẬT SỰ CẦN
      Bỏ qua COUNT nếu: trang đầu và số dòng < pageSize,
      hoặc trang cuối. → Tiết kiệm ~40% số lần chạy COUNT.

   ③ ORDER BY có THÊM o.id DESC làm mốc phá hoà
      Không có nó, hai đơn cùng created_at có thể đổi thứ tự giữa
      các trang → người dùng thấy CÙNG MỘT ĐƠN Ở HAI TRANG,
      hoặc MẤT HẲN một đơn. Đây là bug rất khó tái hiện.
```

### Chữa offset sâu — keyset pagination

```text
   OFFSET (❌ chi phí tăng theo số trang)          KEYSET (✅ chi phí HẰNG SỐ)
   ─────────────────────────────────────           ────────────────────────────
   LIMIT 20 OFFSET 9740                            WHERE (created_at, id)
                                                        < (:lastCreatedAt, :lastId)
   → đọc 9.760 dòng, vứt 9.740                     ORDER BY created_at DESC, id DESC
   → 845 ms ở trang 487                            LIMIT 20

                                                    → nhảy THẲNG vào index
                                                    → 1,2 ms ở MỌI trang
```

```java
public List<OrderCard> searchAfter(OrderCriteria c, Instant lastCreatedAt, Long lastId) {
    return jdbc.sql("""
            SELECT o.id, o.code, o.customer_name, o.total_amount,
                   o.item_count, o.status, o.created_at
            FROM orders o
            WHERE (:status IS NULL OR o.status = :status)
              AND (CAST(:lastCreatedAt AS timestamptz) IS NULL
                   OR (o.created_at, o.id) < (:lastCreatedAt, :lastId))
            ORDER BY o.created_at DESC, o.id DESC
            LIMIT :limit
            """)
            .param("lastCreatedAt", lastCreatedAt).param("lastId", lastId)
            .query(OrderCard.class).list();
}
```

```sql
-- Index bắt buộc phải KHỚP THỨ TỰ ORDER BY
CREATE INDEX idx_orders_keyset ON orders (created_at DESC, id DESC);
```

```text
   ⚠ ĐÁNH ĐỔI CỦA KEYSET — phải nói rõ với đội thiết kế:

   ✅ Chi phí HẰNG SỐ ở mọi trang
   ✅ Không bị "trôi dòng" khi có bản ghi mới chèn vào
   ❌ KHÔNG nhảy tới trang bất kỳ được (chỉ "trang sau"/"trang trước")
   ❌ Không hiện được "trang 12 / 340"

   → HỢP: cuộn vô hạn, feed, API cho mobile, export
   → KHÔNG HỢP: bảng admin cần nhảy tới trang cụ thể

   GIẢI PHÁP THỰC TẾ CỦA NHIỀU SẢN PHẨM:
   Dùng offset cho 20 trang đầu (đủ cho 95% người dùng),
   và GIỚI HẠN CỨNG offset tối đa để tránh trang 5.000.
```

---

## Bài toán 2 — Feed và trạng thái của người đang xem

Đây là N+1 kinh điển nhất của social và thương mại điện tử, và nó **không xuất hiện trong bất kỳ tutorial nào** vì tutorial không có khái niệm "người dùng hiện tại".

```text
   YÊU CẦU: hiện 20 sản phẩm, mỗi sản phẩm phải biết:
      · Người đang xem ĐÃ THÍCH chưa?
      · ĐÃ LƯU vào danh sách chưa?
      · ĐÃ MUA bao giờ chưa?
      · Người bán có đang được NGƯỜI XEM THEO DÕI không?
```

```java
// ❌ Cách viết tự nhiên nhất — và là 81 query
public List<ProductCard> feed(Long viewerId) {
    List<Product> products = productRepository.findFeed(20);

    return products.stream().map(p -> new ProductCard(
            p.getId(), p.getName(), p.getPrice(),
            likeRepository.existsByUserIdAndProductId(viewerId, p.getId()),   // ☠ 20
            saveRepository.existsByUserIdAndProductId(viewerId, p.getId()),   // ☠ 20
            orderRepository.existsByUserIdAndProductId(viewerId, p.getId()),  // ☠ 20
            followRepository.existsByUserIdAndSellerId(viewerId, p.getSellerId()) // ☠ 20
    )).toList();
}
// 1 + 20 + 20 + 20 + 20 = 81 QUERY cho MỘT màn hình
```

```text
   VÌ SAO DẠNG NÀY ĐẶC BIỆT KHÓ THẤY:

   Không có lazy loading nào ở đây. Không có @OneToMany nào.
   Mỗi lời gọi repository đều TƯỜNG MINH, do người viết cố ý gọi.

   → ArchUnit không bắt được. Đọc entity không thấy gì.
     Chỉ TEST ĐẾM QUERY mới lộ ra (bài 8).
```

### Cách chữa ① — một truy vấn `IN` cho mỗi loại trạng thái

```java
public List<ProductCard> feed(Long viewerId) {
    List<Product> products = productRepository.findFeed(20);
    List<Long> productIds = products.stream().map(Product::getId).toList();
    List<Long> sellerIds  = products.stream().map(Product::getSellerId).distinct().toList();

    // 4 query, mỗi query trả về một TẬP ID — không phụ thuộc số sản phẩm
    Set<Long> liked  = likeDao.findLikedProductIds(viewerId, productIds);
    Set<Long> saved  = saveDao.findSavedProductIds(viewerId, productIds);
    Set<Long> bought = orderDao.findPurchasedProductIds(viewerId, productIds);
    Set<Long> follow = followDao.findFollowedSellerIds(viewerId, sellerIds);

    return products.stream().map(p -> new ProductCard(
            p.getId(), p.getName(), p.getPrice(),
            liked.contains(p.getId()),
            saved.contains(p.getId()),
            bought.contains(p.getId()),
            follow.contains(p.getSellerId())
    )).toList();
}
// → 1 + 4 = 5 QUERY, bất kể 20 hay 200 sản phẩm
```

```java
@Query(value = """
    SELECT product_id FROM product_likes
    WHERE user_id = :viewerId AND product_id = ANY(:productIds)
    """, nativeQuery = true)
Set<Long> findLikedProductIds(Long viewerId, Long[] productIds);
```

```text
   ⚠ CHI TIẾT QUAN TRỌNG: TRẢ VỀ Set<Long>, KHÔNG TRẢ VỀ List<Entity>.

   Bạn chỉ cần biết CÓ hay KHÔNG.
   · Trả entity Like đầy đủ  → 20 đối tượng vào Persistence Context
   · Trả Set<Long>           → 20 số long, tra cứu O(1), không cache gì
```

### Cách chữa ② — gộp vào truy vấn chính bằng `EXISTS`

Khi số cờ trạng thái nhiều và feed nhỏ, gộp hết vào một query thường tốt hơn:

```sql
SELECT p.id, p.name, p.price, p.seller_id,
       EXISTS (SELECT 1 FROM product_likes l
               WHERE l.product_id = p.id AND l.user_id = :viewerId)   AS liked,
       EXISTS (SELECT 1 FROM product_saves s
               WHERE s.product_id = p.id AND s.user_id = :viewerId)   AS saved,
       EXISTS (SELECT 1 FROM follows f
               WHERE f.seller_id = p.seller_id AND f.user_id = :viewerId) AS following
FROM products p
WHERE p.status = 'ACTIVE'
ORDER BY p.boosted_at DESC NULLS LAST, p.id DESC
LIMIT 20;
```

```text
 -- EXPLAIN ANALYZE, bảng product_likes 180 triệu dòng:
 Limit  (actual time=0.412..2.118 rows=20 loops=1)
   SubPlan 1 (EXISTS)
     ->  Index Only Scan using idx_likes_user_product  (actual rows=1 loops=20)
 Execution Time: 2.284 ms

 ✅ 1 QUERY, 2,3 ms.

 VÌ SAO NHANH DÙ BẢNG 180 TRIỆU DÒNG:
 · EXISTS DỪNG NGAY khi tìm thấy dòng đầu tiên — không đếm, không quét tiếp
 · Index Only Scan → đọc thẳng từ index, không chạm bảng
 · Subplan chỉ chạy 20 lần (đúng bằng LIMIT), KHÔNG chạy trên cả bảng

 ⚠ ĐIỀU KIỆN BẮT BUỘC: phải có index đúng chiều
    CREATE UNIQUE INDEX idx_likes_user_product
        ON product_likes (user_id, product_id);
    (user_id đứng TRƯỚC vì nó lọc mạnh hơn)
```

**Chọn cách nào?**

| | Cách ① — `IN` riêng | Cách ② — `EXISTS` gộp |
|---|---|---|
| Số query | 1 + số loại cờ | **1** |
| Dữ liệu qua mạng | ít nhất | ít |
| Thêm một cờ mới | thêm 1 query | sửa 1 câu SQL |
| Feed lớn (100+ dòng) | ✅ tốt hơn | ⚠ subplan chạy 100 lần |
| Trạng thái đến từ **dịch vụ khác** | ✅ **bắt buộc dùng** | ❌ không JOIN được |
| Cache lại được? | ✅ cache `Set` theo người dùng | ❌ khó |

> **Quy tắc:** cùng database và feed nhỏ → `EXISTS`. Feed lớn, hoặc trạng thái nằm ở microservice khác → `IN` riêng (và lúc đó nó thành bài toán bulk endpoint của [bài 7](07-n-cong-1-khong-chi-o-database.md)).

---

## Bài toán 3 — Đếm số: badge, unread, số món

Đây là biến thể N+1 mà **ít người gọi đúng tên**, vì nó không liên quan gì tới quan hệ hay lazy loading.

```java
// ❌ Sidebar hiện 6 con số → 6 query COUNT trên bảng lớn
public SidebarBadges badges(Long userId) {
    return new SidebarBadges(
        orderRepo.countByUserIdAndStatus(userId, PENDING),      // COUNT trên 4tr dòng
        messageRepo.countByUserIdAndReadFalse(userId),
        notificationRepo.countByUserIdAndSeenFalse(userId),
        cartRepo.countByUserId(userId),
        ticketRepo.countByUserIdAndStatus(userId, OPEN),
        reviewRepo.countByUserIdAndRepliedFalse(userId));
}
```

```java
// ❌ Và biến thể tệ hơn: COUNT cho TỪNG DÒNG trong danh sách
orders.stream().map(o -> new OrderCard(
        o.getId(),
        itemRepository.countByOrderId(o.getId())     // ☠ N câu COUNT
));
```

```text
   VÌ SAO COUNT ĐẮT HƠN BẠN NGHĨ:

   PostgreSQL KHÔNG lưu sẵn số dòng ở đâu cả (khác MyISAM của MySQL).
   COUNT(*) luôn phải QUÉT — index scan hoặc seq scan.

   EXPLAIN ANALYZE SELECT count(*) FROM orders
   WHERE user_id = 4211 AND status = 'PENDING';
     Aggregate  (actual time=48.221..48.222 rows=1)
       ->  Index Scan using idx_orders_user_status  (actual rows=12847)
     Execution Time: 48.301 ms
                     ▲
     48 ms để đếm ra một con số. × 6 badge = 290 ms cho một sidebar.
```

### Bốn cách chữa, xếp theo độ phức tạp

```java
// ✅ CÁCH 1 — GỘP THÀNH MỘT QUERY (rẻ nhất, làm ngay được)
@Query(value = """
    SELECT
      (SELECT count(*) FROM orders WHERE user_id=:uid AND status='PENDING') AS pending_orders,
      (SELECT count(*) FROM messages WHERE user_id=:uid AND read_at IS NULL) AS unread_messages,
      (SELECT count(*) FROM notifications WHERE user_id=:uid AND seen=false) AS new_notifs,
      (SELECT count(*) FROM cart_items WHERE user_id=:uid) AS cart_items
    """, nativeQuery = true)
SidebarBadges loadBadges(@Param("uid") Long userId);
// 6 query → 1 query. Tổng thời gian vẫn là tổng, nhưng bỏ được 5 RTT.
```

```sql
-- ✅ CÁCH 2 — COUNTER CACHE: cột đếm sẵn trên bảng cha
ALTER TABLE orders ADD COLUMN item_count INT NOT NULL DEFAULT 0;

-- Giữ đồng bộ bằng trigger (an toàn nhất — không phụ thuộc ứng dụng)
CREATE OR REPLACE FUNCTION sync_order_item_count() RETURNS TRIGGER AS $$
BEGIN
    UPDATE orders SET item_count = (
        SELECT count(*) FROM order_items WHERE order_id =
            COALESCE(NEW.order_id, OLD.order_id))
    WHERE id = COALESCE(NEW.order_id, OLD.order_id);
    RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_item_count
AFTER INSERT OR DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION sync_order_item_count();
```

```text
   ⚠ ĐÁNH ĐỔI CỦA COUNTER CACHE:
   ✅ Đọc còn 0 chi phí — cột nằm ngay trong dòng cha
   ❌ Mỗi lần thêm/xoá con → thêm một UPDATE lên dòng cha
   ❌ Dòng cha thành ĐIỂM NÓNG nếu ghi nhiều đồng thời
      (nhiều transaction cùng UPDATE một dòng → chờ khoá)
   → HỢP với đọc-nhiều-ghi-ít (số món trong đơn: ghi 1 lần, đọc triệu lần)
   → KHÔNG HỢP với đếm lượt xem, lượt thích trên bài viết viral
```

```java
// ✅ CÁCH 3 — REDIS COUNTER cho thứ ghi quá nhiều
// Lượt xem, lượt thích: tăng trong Redis, đồng bộ về DB định kỳ
redis.opsForValue().increment("product:views:" + productId);
// → Không chạm database ở đường nóng.
//   Chấp nhận sai lệch nhỏ và mất vài giây dữ liệu khi Redis restart.
```

```sql
-- ✅ CÁCH 4 — MATERIALIZED VIEW cho dashboard/báo cáo
CREATE MATERIALIZED VIEW mv_user_badges AS
SELECT u.id AS user_id,
       count(*) FILTER (WHERE o.status='PENDING')      AS pending_orders,
       count(*) FILTER (WHERE o.created_at > now() - interval '30 days') AS recent_orders
FROM users u LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id;

CREATE UNIQUE INDEX ON mv_user_badges (user_id);
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_badges;   -- không khoá bảng
```

```text
   CHỌN CÁCH NÀO:

   Cần chính xác tuyệt đối, đọc ít     → gộp thành 1 query (cách 1)
   Đọc nhiều, ghi ít                    → counter cache (cách 2)
   Ghi cực nhiều, chấp nhận sai lệch    → Redis (cách 3)
   Dashboard, chấp nhận cũ vài phút     → materialized view (cách 4)
```

---

## Bài toán 4 — Export: khi 3 triệu dòng gặp 2 GB heap

Nút "Xuất Excel" là tính năng bị đánh giá thấp nhất và gây sự cố nhiều nhất.

```java
// ❌ Cách viết này làm sập pod, không phải "có thể" mà là "chắc chắn"
@GetMapping("/export")
public ResponseEntity<byte[]> export(OrderCriteria c) {
    List<Order> orders = orderRepository.findAll(toSpec(c));   // ☠ 3 triệu entity
    byte[] csv = CsvWriter.write(orders);                       // ☠ toàn bộ trong RAM
    return ResponseEntity.ok(csv);
}
```

```text
   BA TẦNG TÍCH LUỸ BỘ NHỚ CÙNG LÚC:
   ① List<Order>              3.000.000 × ~800 byte  = 2,4 GB
   ② Persistence Context      snapshot cho dirty checking ≈ +2,4 GB
   ③ byte[] của file CSV      ~600 MB
   ────────────────────────────────────────────────────────────
   TỔNG                       ≈ 5,4 GB cho MỘT request
   → OutOfMemoryError, hoặc OOMKilled, hoặc GC quét liên tục làm treo cả pod
```

### Cách đúng — stream từ database thẳng ra HTTP response

```java
@GetMapping(value = "/export", produces = "text/csv")
public void export(OrderCriteria c, HttpServletResponse response) throws IOException {

    response.setHeader("Content-Disposition", "attachment; filename=orders.csv");
    // KHÔNG set Content-Length → dùng chunked transfer encoding

    try (PrintWriter out = response.getWriter()) {
        out.println("ma_don,khach_hang,tong_tien,trang_thai,ngay_tao");

        jdbc.sql("""
                SELECT o.code, o.customer_name, o.total_amount, o.status, o.created_at
                FROM orders o
                WHERE (:status IS NULL OR o.status = :status)
                ORDER BY o.id
                """)
            .params(c.toParamMap())
            .query((RowCallbackHandler) rs -> {          // ← xử lý TỪNG DÒNG
                out.printf("%s,%s,%s,%s,%s%n",
                        rs.getString("code"),
                        escapeCsv(rs.getString("customer_name")),
                        rs.getBigDecimal("total_amount"),
                        rs.getString("status"),
                        rs.getTimestamp("created_at").toInstant());
            });
    }
}
```

```text
   BỘ NHỚ DÙNG: vài MB, KHÔNG ĐỔI dù 3 triệu hay 30 triệu dòng.
```

### Bẫy chết người: PostgreSQL vẫn tải hết về nếu thiếu hai điều kiện

Đây là chi tiết mà **rất nhiều đội bị dính** và mất hàng giờ để hiểu.

```text
   DRIVER JDBC CỦA POSTGRESQL CHỈ DÙNG CURSOR KHI ĐỦ CẢ HAI:

      ① autoCommit = false        (phải nằm trong transaction)
      ② statement.setFetchSize(n) với n > 0

   THIẾU MỘT TRONG HAI → driver TẢI TOÀN BỘ KẾT QUẢ VỀ RAM TRƯỚC,
   rồi mới cho bạn duyệt từng dòng.

   → Bạn viết code streaming đẹp đẽ, và vẫn OOM.
     Và bạn sẽ không hiểu vì sao, vì code "rõ ràng là đang stream".
```

```java
// ✅ Cấu hình đúng cho PostgreSQL
@Transactional(readOnly = true)          // ← ĐIỀU KIỆN ①: autoCommit = false
public void export(OrderCriteria c, PrintWriter out) {
    jdbc.sql(sql)
        .params(c.toParamMap())
        .query(new RowCallbackHandler() { ... });
}

@Bean
public JdbcTemplate streamingJdbcTemplate(DataSource ds) {
    JdbcTemplate t = new JdbcTemplate(ds);
    t.setFetchSize(1000);                // ← ĐIỀU KIỆN ②
    return t;
}
```

```java
// Với JPA, dùng Stream — nhưng vẫn cần hint và vẫn phải clear thủ công
@Query("SELECT o FROM Order o WHERE o.status = :status")
@QueryHints({
    @QueryHint(name = HINT_FETCH_SIZE, value = "1000"),
    @QueryHint(name = HINT_CACHEABLE,  value = "false"),
    @QueryHint(name = HINT_READ_ONLY,  value = "true")
})
Stream<Order> streamByStatus(@Param("status") OrderStatus status);
```

```java
@Transactional(readOnly = true)
public void exportViaJpa(OrderStatus status, PrintWriter out) {
    try (Stream<Order> stream = orderRepository.streamByStatus(status)) {
        AtomicInteger n = new AtomicInteger();
        stream.forEach(o -> {
            out.println(toCsv(o));
            // ⚠ BẮT BUỘC: Persistence Context VẪN giữ mọi entity đã duyệt.
            //   Không clear() → vẫn OOM dù đã stream.
            if (n.incrementAndGet() % 1000 == 0) {
                entityManager.clear();
            }
        });
    }
}
```

```text
   ⚠ ĐÂY LÀ ĐIỀU NGƯỜI TA HAY BỎ SÓT NHẤT:

   Stream<T> giải quyết việc "không tải hết về một lúc",
   NHƯNG Persistence Context vẫn TÍCH LUỸ mọi entity đã đi qua.

   → Sau 3 triệu dòng, Persistence Context giữ 3 triệu entity.
     OOM y như cũ, chỉ chậm hơn một chút.

   → Vì vậy với export, cách TỐT NHẤT là bỏ hẳn entity:
     JdbcClient + RowCallbackHandler, không có Persistence Context nào.
```

### Với file thật sự lớn — đừng làm đồng bộ

```text
   GIỚI HẠN THỰC TẾ CỦA EXPORT ĐỒNG BỘ:
   · Timeout của load balancer (thường 60s)
   · Timeout của trình duyệt
   · Người dùng bấm F5 → chạy lại từ đầu, nhân đôi tải
   · Deploy giữa chừng → mất hết

   → NGƯỠNG THỰC TẾ: trên ~30 giây hoặc ~500.000 dòng thì chuyển sang BẤT ĐỒNG BỘ.

   ┌──────────────────────────────────────────────────────────┐
   │ ① POST /exports         → tạo job, trả về jobId (202)   │
   │ ② Worker chạy nền       → stream ra S3/MinIO             │
   │ ③ GET /exports/{jobId}  → trạng thái + link tải          │
   │ ④ Gửi email/thông báo khi xong                           │
   └──────────────────────────────────────────────────────────┘
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Người dùng báo *"tôi thấy cùng một đơn hàng ở trang 3 và trang 4"*, và đôi khi *"có đơn biến mất"*. Không tái hiện được trên máy dev.

**Chẩn đoán — đây không phải bug hiển thị, mà là `ORDER BY` không xác định:**

```sql
-- Câu đang chạy
SELECT * FROM orders WHERE status='PENDING'
ORDER BY created_at DESC LIMIT 20 OFFSET 40;
```

```text
   VẤN ĐỀ: có 380 đơn cùng created_at (nhập hàng loạt lúc 00:00:00).

   SQL KHÔNG ĐẢM BẢO THỨ TỰ giữa các dòng có cùng giá trị sắp xếp.
   Lần chạy này planner trả A trước B; lần sau có thể B trước A
   (do parallel scan, do buffer cache khác, do bảng vừa VACUUM).

   → Trang 3 lấy dòng 40–59 theo MỘT thứ tự,
     trang 4 lấy dòng 60–79 theo THỨ TỰ KHÁC
     → trùng lặp và mất dòng.

   VÌ SAO KHÔNG TÁI HIỆN TRÊN DEV: dữ liệu nhỏ, một worker,
   planner luôn chọn cùng kế hoạch → thứ tự tình cờ ổn định.
```

**Cách xử lý — luôn có mốc phá hoà duy nhất:**

```sql
ORDER BY created_at DESC, id DESC        -- ← id là khoá chính, luôn duy nhất
```

**Chặn tái diễn:**

```java
@ArchTest
static final ArchRule moi_query_phan_trang_phai_co_moc_pha_hoa =
    methods().that().areAnnotatedWith(Query.class)
        .should(chuaOrderByCoKhoaChinh());

// Hoặc đơn giản hơn: test tích hợp duyệt hết các trang và kiểm tra không trùng ID
@Test
void duyet_het_cac_trang_khong_duoc_trung_hoac_thieu() {
    Set<Long> seen = new HashSet<>();
    for (int page = 0; page < 50; page++) {
        for (OrderCard c : dao.search(criteria, PageRequest.of(page, 20))) {
            assertThat(seen.add(c.id())).as("ID %s xuất hiện 2 lần", c.id()).isTrue();
        }
    }
    assertThat(seen).hasSize(1000);
}
```

> **Tình huống 2:** Trang chủ hiện 20 sản phẩm. p99 là 1,8 giây. Bật đếm query thì thấy **5 query** — đã tối ưu rồi. Nhưng vẫn chậm.

**Chẩn đoán — ít query không có nghĩa là query rẻ:**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT product_id FROM product_likes
WHERE user_id = 4211 AND product_id = ANY(ARRAY[1,2,...,20]);
```

```text
 Seq Scan on product_likes  (actual time=0.03..1642.8 rows=7 loops=1)
   Filter: ((user_id = 4211) AND (product_id = ANY (...)))
   Rows Removed by Filter: 184203821
   Buffers: shared read=1284302
 Execution Time: 1644.2 ms
                  ▲
 QUÉT TOÀN BỘ 184 TRIỆU DÒNG. Không có index phù hợp.
```

```sql
-- Index hiện có:
\d product_likes
--  "idx_likes_product" btree (product_id)      ← sai chiều
```

**Cách xử lý:**

```sql
CREATE UNIQUE INDEX CONCURRENTLY idx_likes_user_product
    ON product_likes (user_id, product_id);
-- user_id đứng TRƯỚC vì nó lọc mạnh nhất (1 người / 184 triệu dòng)
```

```text
 -- Sau khi tạo index:
 Index Only Scan using idx_likes_user_product  (actual time=0.021..0.043 rows=7)
 Execution Time: 0.068 ms          ← từ 1.644 ms xuống 0,068 ms (24.000 lần)
```

**Bài học rút ra:**

```text
   TỐI ƯU N+1 VÀ TỐI ƯU INDEX LÀ HAI VIỆC KHÁC NHAU.

   Bạn có thể có 5 query hoàn hảo về mặt thiết kế
   mà một trong số đó quét cả bảng.

   → Sau khi giảm số query, BƯỚC TIẾP THEO LUÔN LÀ
     EXPLAIN ANALYZE từng câu còn lại.
```

> **Tình huống 3:** Nút "Xuất Excel" chạy được với 50.000 dòng nhưng pod chết ở 500.000 dòng — dù đã dùng `Stream<Order>`.

**Chẩn đoán — hai nguyên nhân có thể, kiểm tra cả hai:**

```java
// ① Persistence Context không được clear
try (Stream<Order> s = repo.streamAll()) {
    s.forEach(o -> out.println(toCsv(o)));     // ☠ tích luỹ 500.000 entity
}
```

```bash
# ② Driver không dùng cursor — kiểm tra bằng cách xem RAM tăng NGAY LẬP TỨC
#    hay tăng DẦN DẦN
jcmd 1 GC.heap_info
# Nếu heap nhảy vọt trong 2 giây đầu → driver đang tải hết về, chưa stream thật
```

**Cách xử lý — bỏ hẳn entity cho export:**

```java
@Transactional(readOnly = true)                   // điều kiện autoCommit=false
public void export(HttpServletResponse res) throws IOException {
    try (PrintWriter out = res.getWriter()) {
        streamingJdbc.query(SQL, rs -> {          // fetchSize đã set ở bean
            out.println(toCsvRow(rs));
        });
    }
}
```

**Chặn tái diễn:**

```java
@Test
void export_khong_duoc_tang_heap_theo_so_dong() {
    seed(500_000);
    long before = usedHeap();

    exportService.export(new NullWriter());

    assertThat(usedHeap() - before)
        .as("Export phải chạy ở bộ nhớ hằng số")
        .isLessThan(200 * 1024 * 1024);          // < 200 MB
}
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `ORDER BY` không có mốc phá hoà duy nhất | Dòng **trùng giữa các trang** hoặc **mất dòng** | Luôn thêm `, id DESC` |
| `OFFSET` sâu | Trang 487 chậm gấp **700 lần** trang 1 | Keyset pagination hoặc giới hạn cứng offset |
| `Page<>` luôn chạy `COUNT` | `COUNT` thường **đắt hơn** câu lấy dữ liệu | `PageableExecutionUtils.getPage()` hoặc `Slice<>` |
| Kiểm tra "đã thích chưa" trong vòng lặp | N+1 **tường minh**, ArchUnit không bắt được | Một `IN` trả `Set<Long>`, hoặc `EXISTS` |
| Trả `List<Entity>` khi chỉ cần biết có/không | Nạp entity thừa vào Persistence Context | Trả `Set<Long>` |
| `EXISTS` thiếu index đúng chiều | Quét cả bảng 184 triệu dòng | Index `(user_id, product_id)` — cột lọc mạnh đứng trước |
| `COUNT(*)` cho từng dòng | N câu COUNT, mỗi câu 48 ms | Counter cache hoặc gộp một query |
| Counter cache trên dòng ghi nhiều | Dòng cha thành **điểm nóng khoá** | Redis cho lượt xem/thích |
| Export bằng `findAll()` | 5,4 GB heap cho một request | Stream + `RowCallbackHandler` |
| `Stream<T>` nhưng không `clear()` | Persistence Context tích luỹ → **vẫn OOM** | `entityManager.clear()` mỗi 1.000 dòng |
| Thiếu `autoCommit=false` hoặc `fetchSize` | PostgreSQL **tải hết về RAM** dù code trông như stream | `@Transactional` + `setFetchSize(1000)` |
| Export đồng bộ với file lớn | Timeout LB, F5 nhân đôi tải, deploy mất hết | Trên 30s → job bất đồng bộ + S3 |
| Giảm query xong là dừng | 5 query hoàn hảo, một câu quét cả bảng | `EXPLAIN ANALYZE` từng câu còn lại |

## Câu hỏi phỏng vấn hay gặp

**H: Vì sao phân trang bằng `OFFSET` chậm ở trang sâu?**
Vì `OFFSET` không phải "nhảy tới" mà là "đọc rồi vứt". Với `LIMIT 20 OFFSET 9740`, database vẫn phải đọc và loại bỏ 9.740 dòng trước khi trả về 20 dòng bạn cần — em đo trên bảng 4 triệu đơn thì trang 1 mất 1,2 ms còn trang 487 mất 845 ms, chậm gấp 700 lần. Cách chữa là **keyset pagination**: thay `OFFSET` bằng `WHERE (created_at, id) < (:last, :lastId)`, nhảy thẳng vào index nên chi phí là **hằng số ở mọi trang**. Đánh đổi là không nhảy tới trang bất kỳ được, nên nó hợp với cuộn vô hạn và API mobile; với bảng admin cần "trang 12/340" thì em giữ offset nhưng đặt giới hạn cứng để không ai đi tới trang 5.000.

**H: Người dùng báo thấy cùng một bản ghi ở hai trang, nguyên nhân gì?**
Gần như chắc chắn là `ORDER BY` không có mốc phá hoà duy nhất. SQL **không đảm bảo thứ tự** giữa các dòng có cùng giá trị sắp xếp, nên nếu có 380 đơn cùng `created_at` thì mỗi lần chạy planner có thể trả về thứ tự khác — do parallel scan, do buffer cache khác, do bảng vừa `VACUUM`. Trang 3 và trang 4 lấy theo hai thứ tự khác nhau nên vừa trùng vừa mất dòng. Cách chữa là luôn thêm khoá chính vào cuối: `ORDER BY created_at DESC, id DESC`. Bug này không tái hiện trên máy dev vì dữ liệu nhỏ nên thứ tự tình cờ ổn định.

**H: Feed cần hiện "người dùng đã thích sản phẩm này chưa", làm sao tránh N+1?**
Hai cách. Một là chạy **một query `IN` trả về `Set<Long>`** các sản phẩm đã thích rồi tra `contains()` trong Java — chú ý trả `Set<Long>` chứ đừng trả `List<Like>`, vì bạn chỉ cần biết có hay không. Hai là gộp vào truy vấn chính bằng **`EXISTS`** — nó dừng ngay khi tìm thấy dòng đầu tiên và chỉ chạy đúng bằng số dòng trong `LIMIT`, nên vẫn nhanh dù bảng likes có 180 triệu dòng, miễn là có index `(user_id, product_id)` đúng chiều. Em chọn `EXISTS` khi feed nhỏ và cùng database, chọn `IN` riêng khi feed lớn hoặc khi trạng thái nằm ở dịch vụ khác. Điểm đáng nói là dạng N+1 này **không có lazy loading nào cả** — mọi lời gọi đều tường minh — nên ArchUnit không bắt được, chỉ test đếm query mới lộ.

**H: Sidebar hiện 6 badge thì làm sao cho nhanh?**
Trước hết cần biết `COUNT(*)` trong PostgreSQL **luôn phải quét**, không có số đếm lưu sẵn như MyISAM — em đo một badge trên bảng 4 triệu dòng mất 48 ms, sáu badge là gần 300 ms. Cách rẻ nhất làm ngay được là **gộp sáu `COUNT` thành một query** bằng scalar subquery, bỏ được 5 chuyến đi mạng. Xa hơn thì tuỳ tỉ lệ đọc/ghi: đọc nhiều ghi ít thì dùng **counter cache** — cột đếm sẵn trên bảng cha, giữ đồng bộ bằng trigger; ghi cực nhiều như lượt xem thì đếm trong **Redis** rồi đồng bộ định kỳ, vì counter cache sẽ biến dòng cha thành điểm nóng khoá; còn dashboard chấp nhận cũ vài phút thì **materialized view** với `REFRESH CONCURRENTLY`.

**H: Export 3 triệu dòng ra CSV thế nào cho không sập?**
Stream thẳng từ database ra HTTP response, không bao giờ giữ cả danh sách trong RAM — dùng `RowCallbackHandler` xử lý từng dòng và ghi thẳng vào `response.getWriter()`, bộ nhớ dùng vài MB và không đổi dù 3 triệu hay 30 triệu dòng. Có hai bẫy phải biết. Thứ nhất, với JPA thì `Stream<T>` vẫn để **Persistence Context tích luỹ mọi entity đã duyệt**, nên vẫn OOM nếu không gọi `entityManager.clear()` định kỳ — vì vậy em bỏ hẳn entity cho export. Thứ hai, **driver PostgreSQL chỉ dùng cursor khi có đủ cả `autoCommit=false` và `setFetchSize(n>0)`**; thiếu một trong hai thì nó tải toàn bộ kết quả về RAM trước, và bạn sẽ OOM dù code trông như đang stream. Với file thật lớn thì trên khoảng 30 giây em chuyển sang job bất đồng bộ ghi ra S3, vì export đồng bộ sẽ chết vì timeout của load balancer và vì người dùng bấm F5.

**H: Đã giảm từ 81 query xuống 5 query mà vẫn chậm, làm gì tiếp?**
`EXPLAIN ANALYZE` từng câu trong 5 câu đó. Tối ưu N+1 và tối ưu index là hai việc khác nhau — em từng gặp trường hợp 5 câu hoàn hảo về thiết kế nhưng một câu quét toàn bộ 184 triệu dòng vì index đặt sai chiều: có `(product_id)` trong khi truy vấn lọc theo `user_id` trước. Tạo lại index `(user_id, product_id)` với cột lọc mạnh nhất đứng trước thì câu đó từ 1.644 ms xuống 0,068 ms. Nguyên tắc em rút ra là **giảm số query xong thì bước tiếp theo luôn là `EXPLAIN` các câu còn lại**, chứ không dừng ở con số query.

## Tóm tắt bài 9

- **Danh sách có bộ lọc** có ba vấn đề cùng lúc, chỉ một là N+1: `COUNT` đắt ngang câu chính, và `OFFSET` sâu chậm gấp **700 lần**.
- `ORDER BY` **phải có mốc phá hoà duy nhất** (`, id DESC`) — thiếu nó gây trùng dòng và mất dòng giữa các trang, và không tái hiện được trên máy dev.
- **Keyset pagination** cho chi phí hằng số ở mọi trang, đổi lại không nhảy tới trang bất kỳ được.
- **Feed + trạng thái người xem** là N+1 tường minh, không có lazy loading, nên **chỉ test đếm query mới bắt được**. Chữa bằng `IN` trả `Set<Long>` hoặc `EXISTS` gộp.
- `EXISTS` nhanh vì **dừng ngay ở dòng đầu** — nhưng bắt buộc có index đúng chiều, cột lọc mạnh đứng trước.
- **`COUNT(*)` luôn phải quét** trong PostgreSQL. Bốn cách chữa theo tỉ lệ đọc/ghi: gộp một query → counter cache → Redis → materialized view.
- **Export bằng `findAll()` tốn 5,4 GB** cho một request. Stream + `RowCallbackHandler`, bỏ hẳn entity.
- Hai bẫy export: `Stream<T>` vẫn tích luỹ Persistence Context; và **PostgreSQL chỉ dùng cursor khi có đủ `autoCommit=false` + `fetchSize>0`**.
- Trên ~30 giây hoặc ~500.000 dòng → chuyển export sang **job bất đồng bộ**.
- **Giảm số query xong, bước tiếp theo luôn là `EXPLAIN ANALYZE`** — 5 query hoàn hảo vẫn có thể chứa một câu quét cả bảng.

**Bài kế tiếp** → [Bài 10: Ba bài toán ghi và vận hành](10-ba-bai-toan-ghi-va-van-hanh.md)

**Quay lại** → [Bài 8: Phát hiện N+1](08-phat-hien-n-cong-1.md)

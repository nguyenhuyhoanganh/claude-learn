# Case 5: Optimistic vs Pessimistic locking — chọn sai là hỏng cả hệ thống

Hai chiến lược, hai triết lý đối lập:

```text
   PESSIMISTIC (bi quan): "Chắc chắn sẽ có người tranh với tôi.
                           Tôi khoá trước cho chắc."

   OPTIMISTIC (lạc quan): "Chắc không ai đụng đâu. Cứ làm,
                           lúc ghi mới kiểm tra xem có ai chen ngang không."
```

Chọn đúng thì hệ thống chạy mượt. Chọn sai thì hoặc là nghẽn cổ chai, hoặc là 90% giao dịch phải thử lại. Bài này cho bạn tiêu chí chọn dựa trên số liệu chứ không phải cảm tính.

## Vấn đề gốc: lost update

```java
// Hai người cùng sửa hồ sơ sản phẩm
public void updatePrice(Long id, BigDecimal newPrice) {
    Product p = repo.findById(id).orElseThrow();    // đọc
    p.setPrice(newPrice);                            // sửa
    repo.save(p);                                    // ghi
}
```

```text
   Sản phẩm ban đầu: { price: 100, stock: 50 }

   Nhân viên A                    Nhân viên B
   ───────────                    ───────────
   đọc {price:100, stock:50}
                                  đọc {price:100, stock:50}
   sửa price = 120
   ghi {price:120, stock:50}
                                  sửa stock = 30
                                  ghi {price:100, stock:30}   ← GHI ĐÈ giá mới!

   Kết quả: { price: 100, stock: 30 }
   ⇒ Thay đổi giá của A BIẾN MẤT không dấu vết.
```

Đây là **lost update** (mất cập nhật). Không có exception, không có log, không ai biết. Nhân viên A tưởng đã đổi giá thành công.

Cả hai chiến lược lock đều nhằm ngăn chuyện này, bằng hai cách khác nhau.

## Pessimistic locking

Khoá dòng ngay khi đọc, giữ tới khi transaction kết thúc.

```sql
SELECT * FROM product WHERE id = 1 FOR UPDATE;
```

```java
// JPA
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT p FROM Product p WHERE p.id = :id")
Optional<Product> findByIdForUpdate(@Param("id") Long id);

@Transactional
public void updatePrice(Long id, BigDecimal newPrice) {
    Product p = repo.findByIdForUpdate(id).orElseThrow();   // KHOÁ ở đây
    p.setPrice(newPrice);
    repo.save(p);
}                                                            // nhả khi commit
```

```text
   Nhân viên A                    Nhân viên B
   ───────────                    ───────────
   SELECT FOR UPDATE  ✓ khoá
                                  SELECT FOR UPDATE  ⏳ CHỜ
   sửa, ghi, commit   → nhả khoá
                                  ✓ được khoá, đọc {price:120, stock:50}
                                  sửa stock = 30
                                  ghi {price:120, stock:30}   ← ĐÚNG
```

### Các biến thể `FOR UPDATE`

Đây là phần ít người biết nhưng cực kỳ hữu ích:

| Cú pháp | Hành vi khi dòng đang bị khoá |
|---|---|
| `FOR UPDATE` | Chờ cho tới khi được (hoặc `lock_timeout`) |
| `FOR UPDATE NOWAIT` | **Lỗi ngay lập tức** |
| `FOR UPDATE SKIP LOCKED` | **Bỏ qua dòng đó**, lấy dòng tiếp theo |
| `FOR NO KEY UPDATE` | Khoá nhẹ hơn, cho phép FK tham chiếu (PostgreSQL) |
| `FOR SHARE` | Khoá đọc, nhiều người cùng giữ được |

`NOWAIT` hữu ích khi bạn muốn báo ngay cho người dùng "bản ghi đang được người khác chỉnh sửa" thay vì để họ chờ.

`SKIP LOCKED` là công cụ tuyệt vời để làm **hàng đợi công việc bằng database** — nhiều worker cùng lấy việc mà không giẫm chân nhau:

```sql
-- Mỗi worker lấy 10 việc chưa ai làm, bỏ qua việc đang bị worker khác giữ
UPDATE job
SET status = 'PROCESSING', worker_id = :workerId, started_at = now()
WHERE id IN (
    SELECT id FROM job
    WHERE status = 'PENDING'
    ORDER BY priority DESC, created_at
    LIMIT 10
    FOR UPDATE SKIP LOCKED        -- ← mấu chốt
)
RETURNING *;
```

Không có `SKIP LOCKED`, 10 worker sẽ xếp hàng chờ nhau trên cùng những dòng đầu bảng. Có nó, mỗi worker lấy được một tập việc khác nhau ngay lập tức. Đây là cách các thư viện job queue hiện đại (như `pg-boss`, hoặc Rails ActiveJob với backend PostgreSQL) hoạt động.

### Ưu và nhược

| Ưu | Nhược |
|---|---|
| Đảm bảo tuyệt đối, không bao giờ mất cập nhật | Giảm tính đồng thời — người khác phải chờ |
| Không cần retry | Nguy cơ deadlock (case 3) |
| Dễ hiểu, dễ suy luận | Không dùng được qua nhiều request (xem dưới) |
| Có `SKIP LOCKED` cho hàng đợi | Giữ connection lâu hơn |

## Optimistic locking

Không khoá gì. Mỗi dòng có một cột `version`; khi ghi thì kiểm tra version có đổi không.

```sql
CREATE TABLE product (
    id BIGINT PRIMARY KEY,
    price NUMERIC,
    stock INT,
    version BIGINT NOT NULL DEFAULT 0
);
```

```java
@Entity
public class Product {
    @Id private Long id;
    private BigDecimal price;
    private Integer stock;

    @Version                       // JPA tự quản lý cột này
    private Long version;
}
```

Hibernate tự sinh SQL:

```sql
UPDATE product
SET price = 120, stock = 50, version = 43
WHERE id = 1 AND version = 42;         -- ← kiểm tra ở đây
```

Nếu ai đó đã sửa trước, `version` đã thành 43, câu UPDATE khớp 0 dòng → Hibernate ném `OptimisticLockException`.

```text
   Nhân viên A                       Nhân viên B
   ───────────                       ───────────
   đọc {price:100, version:42}
                                     đọc {price:100, version:42}
   UPDATE ... WHERE version=42  ✓
   (version → 43)
                                     UPDATE ... WHERE version=42
                                     → khớp 0 dòng → EXCEPTION

   ⇒ B biết mình bị chen ngang. Không mất dữ liệu âm thầm.
```

### Xử lý xung đột — ba lựa chọn

**1. Thử lại tự động** (khi có thể tính lại):

```java
@Retryable(retryFor = ObjectOptimisticLockingFailureException.class,
           maxAttempts = 3,
           backoff = @Backoff(delay = 50, multiplier = 2, random = true))
public void decreaseStock(Long id, int qty) {
    Product p = repo.findById(id).orElseThrow();
    p.setStock(p.getStock() - qty);
    repo.save(p);
}
```

**2. Báo lỗi cho người dùng** (khi cần con người quyết định):

```java
catch (ObjectOptimisticLockingFailureException e) {
    throw new ConflictException(
        "Sản phẩm vừa được người khác cập nhật. Vui lòng tải lại và thử lại.");
    // Trả HTTP 409 Conflict
}
```

**3. Hợp nhất thay đổi** (phức tạp nhưng trải nghiệm tốt nhất):

So sánh thay đổi của A và B, nếu không đụng cùng trường thì gộp lại. Đây là cách Git hoạt động, và cách các ứng dụng cộng tác (Google Docs) làm.

### Ưu điểm bị đánh giá thấp: dùng được qua nhiều request

Đây là điểm mạnh quan trọng nhất của optimistic locking mà nhiều người bỏ qua.

```text
   Kịch bản: người dùng mở form sửa sản phẩm, ngồi 5 phút rồi bấm Lưu.

   PESSIMISTIC: không thể khoá suốt 5 phút — transaction không thể
                kéo dài qua nhiều request HTTP. Không có cách nào bảo vệ.

   OPTIMISTIC:  gửi version xuống form, gửi ngược lên khi lưu.
                Nếu ai đó sửa trong 5 phút đó → phát hiện được.
```

```html
<form>
  <input type="hidden" name="version" value="42"/>
  <input name="price" value="100"/>
</form>
```

Đây gọi là **offline optimistic lock** và là cách duy nhất bảo vệ dữ liệu trong luồng làm việc kéo dài qua nhiều request. Trong REST API, cơ chế tương đương là header `ETag` + `If-Match`.

## So sánh trực diện

| Tiêu chí | Pessimistic | Optimistic |
|---|---|---|
| Cơ chế | Khoá trước | Kiểm tra khi ghi |
| Người khác phải chờ | **Có** | Không |
| Cần retry | Không | **Có** |
| Nguy cơ deadlock | **Có** | Không |
| Dùng qua nhiều request | **Không** | **Có** |
| Khi xung đột thấp (< 5%) | Chậm không cần thiết | **Tốt hơn nhiều** |
| Khi xung đột cao (> 30%) | **Tốt hơn** | Retry liên tục, lãng phí |
| Khi hot row (~100%) | **Bắt buộc dùng** (hoặc đổi kiến trúc) | Thảm hoạ |
| Chi phí khi không xung đột | Vẫn tốn lock | **Gần bằng 0** |
| Độ phức tạp code | Thấp | Trung bình (phải xử lý exception) |

### Toán học của điểm hoà vốn

Gọi `p` là xác suất xung đột, `T` là thời gian một giao dịch:

```text
   Pessimistic: mọi giao dịch tuần tự hoá trên dòng đó
                thời gian trung bình ≈ T × (số người chờ)

   Optimistic:  giao dịch thành công mất T
                giao dịch thất bại mất T rồi làm lại
                thời gian kỳ vọng ≈ T / (1 − p)

   p = 0,05  →  optimistic tốn 1,05T   ← rẻ hơn nhiều
   p = 0,30  →  optimistic tốn 1,43T
   p = 0,50  →  optimistic tốn 2,00T
   p = 0,90  →  optimistic tốn 10,0T   ← thảm hoạ
```

Điểm hoà vốn thực tế nằm quanh **p ≈ 20-30%**. Dưới ngưỡng đó chọn optimistic, trên ngưỡng đó chọn pessimistic.

### Đo `p` trên hệ thống của bạn

Đừng đoán. Thêm metric:

```java
@Around("@annotation(org.springframework.transaction.annotation.Transactional)")
public Object measure(ProceedingJoinPoint pjp) throws Throwable {
    try {
        Object result = pjp.proceed();
        conflictCounter.increment("success");
        return result;
    } catch (ObjectOptimisticLockingFailureException e) {
        conflictCounter.increment("conflict");
        throw e;
    }
}
```

```promql
rate(optimistic_conflicts_total{result="conflict"}[5m])
  / rate(optimistic_conflicts_total[5m])
```

Nếu tỉ lệ này vượt 20% kéo dài, chuyển sang pessimistic hoặc áp dụng kỹ thuật hot row (case 4).

## Cây quyết định

```text
   Thao tác của bạn là gì?
   │
   ├─ Người dùng sửa form, có thời gian suy nghĩ
   │    → OPTIMISTIC (bắt buộc — pessimistic không làm được)
   │
   ├─ Cập nhật trong một transaction ngắn
   │    ├─ Xung đột hiếm (< 20%)?           → OPTIMISTIC
   │    ├─ Xung đột thường xuyên (> 30%)?   → PESSIMISTIC
   │    └─ Hot row (~100%)?                 → Kỹ thuật case 4
   │
   ├─ Nhiều worker lấy việc từ hàng đợi
   │    → PESSIMISTIC với SKIP LOCKED
   │
   ├─ Chuyển tiền, trừ kho (cần đúng tuyệt đối, xung đột trung bình)
   │    → PESSIMISTIC + lock ordering (chống deadlock)
   │
   └─ Đếm số (view, like)
        → KHÔNG DÙNG LOCK NÀO — atomic UPDATE hoặc gom lô (case 4)
```

Nhánh cuối cùng đáng nhấn mạnh: rất nhiều trường hợp **không cần lock gì cả**.

```java
// SAI — dùng optimistic locking cho counter
@Version private Long version;
p.setViewCount(p.getViewCount() + 1);

// ĐÚNG — atomic UPDATE, database tự lo, không xung đột
@Modifying
@Query("UPDATE Product p SET p.viewCount = p.viewCount + 1 WHERE p.id = :id")
void incrementView(@Param("id") Long id);
```

Câu UPDATE nguyên tử không cần version, không cần khoá tường minh, không bao giờ xung đột. Chỉ dùng lock khi bạn thật sự cần **đọc giá trị rồi quyết định dựa trên nó**.

## Cạm bẫy của `@Version` trong JPA

### 1. `save()` không phải lúc nào cũng UPDATE

```java
Product p = new Product();
p.setId(1L);                    // set ID thủ công
p.setVersion(42L);
repo.save(p);                   // Hibernate có thể coi là INSERT hoặc UPDATE
```

Với entity **detached** (không thuộc persistence context), hành vi phụ thuộc vào việc `version` có null không. Luôn đọc entity từ repository rồi sửa, đừng tự dựng entity.

### 2. Version chỉ tăng khi có thay đổi thật

Nếu bạn `save()` một entity không đổi gì, Hibernate không sinh UPDATE và version không tăng. Muốn tăng cưỡng bức:

```java
@Lock(LockModeType.OPTIMISTIC_FORCE_INCREMENT)
```

Hữu ích khi sửa entity con nhưng muốn đánh dấu entity cha đã đổi (ví dụ sửa `order_item` thì bump version của `order`).

### 3. Xung đột chỉ phát hiện lúc flush

Hibernate gom các thay đổi và flush vào cuối transaction. Nghĩa là `OptimisticLockException` có thể ném ra ở chỗ bạn không ngờ — kể cả sau khi method đã chạy xong. Đây là lý do `@Retryable` phải bọc **ngoài** transaction.

### 4. `@Version` không bảo vệ khi bạn dùng JPQL/native UPDATE

```java
@Modifying
@Query("UPDATE Product p SET p.price = :price WHERE p.id = :id")
void updatePriceDirectly(...);      // BỎ QUA hoàn toàn cơ chế version
```

Nếu một phần code dùng entity còn phần khác dùng bulk update, bạn có hai cơ chế không biết nhau. Phải nhất quán trong toàn dự án.

## Trường hợp thực tế: hệ thống đặt phòng khách sạn

Yêu cầu: không được đặt trùng phòng. Đặc điểm: **xung đột hiếm** (mỗi phòng ít người tranh) nhưng **hậu quả nghiêm trọng** (hai khách cùng phòng).

**Lựa chọn ban đầu: optimistic**

```java
@Entity
public class Room {
    @Id private Long id;
    private boolean booked;
    @Version private Long version;
}
```

Chạy tốt 6 tháng. Rồi một sự cố: hai người đặt cùng phòng thành công.

**Nguyên nhân**: code kiểm tra và ghi ở hai chỗ khác nhau, không cùng transaction.

```java
// SAI — kiểm tra và ghi tách rời
if (roomService.isAvailable(roomId)) {       // transaction 1
    bookingService.book(roomId, userId);      // transaction 2 — ĐÃ MUỘN
}
```

`@Version` chỉ bảo vệ trong phạm vi **một transaction**. Giữa hai transaction có khe hở.

**Sửa: chuyển sang ràng buộc ở tầng database** — cách chắc chắn nhất:

```sql
CREATE TABLE booking (
    id BIGSERIAL PRIMARY KEY,
    room_id BIGINT NOT NULL,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    EXCLUDE USING gist (
        room_id WITH =,
        daterange(check_in, check_out) WITH &&
    )
);
```

`EXCLUDE` constraint của PostgreSQL đảm bảo **không thể tồn tại hai booking cùng phòng có khoảng ngày chồng lấn**. Database tự từ chối ở tầng thấp nhất, không phụ thuộc vào code ứng dụng viết đúng hay sai.

```java
try {
    bookingRepo.save(new Booking(roomId, checkIn, checkOut));
} catch (DataIntegrityViolationException e) {
    throw new RoomNotAvailableException("Phòng đã được đặt");
}
```

Bài học quan trọng: **ràng buộc ở tầng database mạnh hơn mọi cơ chế lock ở tầng ứng dụng**. Nó đúng kể cả khi có nhiều instance, kể cả khi ai đó viết code mới quên kiểm tra, kể cả khi có người sửa dữ liệu thủ công. Case 6 sẽ đào sâu chủ đề này.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Optimistic cho hot row | Retry gần 100%, throughput sụp |
| Pessimistic cho form người dùng | Không khả thi — transaction không kéo dài qua nhiều request |
| Kiểm tra và ghi ở hai transaction khác nhau | Có khe hở, lock không bảo vệ được |
| Retry `OptimisticLockException` bên trong transaction | Vô nghĩa, transaction đã hỏng |
| Không có jitter khi retry | Xung đột lặp lại |
| Dùng lock cho counter | Không cần thiết, dùng atomic UPDATE |
| Trộn `@Version` với bulk UPDATE | Hai cơ chế không biết nhau |
| Không đo tỉ lệ xung đột thật | Chọn chiến lược theo cảm tính |

## Tóm tắt case 5

- **Pessimistic**: khoá trước, người khác chờ. **Optimistic**: không khoá, kiểm tra `version` khi ghi.
- Điểm hoà vốn ở tỉ lệ xung đột **~20-30%**. Dưới thì optimistic, trên thì pessimistic.
- **Phải đo tỉ lệ xung đột thật**, đừng đoán.
- Optimistic là **lựa chọn duy nhất** cho luồng kéo dài qua nhiều request (form, ETag/If-Match).
- `FOR UPDATE SKIP LOCKED` = công cụ làm **hàng đợi công việc bằng database**, rất đáng biết.
- Rất nhiều trường hợp **không cần lock nào** — dùng atomic UPDATE.
- `@Version` chỉ bảo vệ **trong một transaction**; kiểm tra và ghi phải nằm cùng transaction.
- **Ràng buộc ở tầng database (unique, EXCLUDE) mạnh hơn mọi lock ở tầng ứng dụng.**

**Bài kế tiếp** → [Case 6: Double booking và race condition kiểu "kiểm tra rồi hành động"](06-case-double-booking-race.md)

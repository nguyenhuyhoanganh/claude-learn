# Case 6: Double booking — race condition kiểu "kiểm tra rồi hành động"

Đoạn code này xuất hiện trong mọi dự án, và nó **luôn sai**:

```java
public void register(String email) {
    if (userRepository.existsByEmail(email)) {          // KIỂM TRA
        throw new EmailAlreadyExistsException();
    }
    userRepository.save(new User(email));                // HÀNH ĐỘNG
}
```

Nó chạy đúng 99,99% thời gian. 0,01% còn lại tạo ra hai tài khoản cùng email, hai booking cùng phòng, hai lần trừ tiền. Và 0,01% ở quy mô lớn nghĩa là **hàng chục ca mỗi ngày**.

## Cơ chế: khe hở giữa kiểm tra và hành động

```text
   Request A                          Request B
   ─────────                          ─────────
   existsByEmail("a@x.com")
   → false  ✓
                                      existsByEmail("a@x.com")
                                      → false  ✓     ← B cũng thấy chưa tồn tại!
   save(User("a@x.com"))  ✓
                                      save(User("a@x.com"))  ✓

   ⇒ HAI tài khoản cùng email.
```

Khoảng thời gian giữa "kiểm tra" và "hành động" — dù chỉ 2 mili-giây — là **khe hở** để request khác chen vào.

Lỗi này có tên riêng: **TOCTOU (Time-Of-Check to Time-Of-Use)** — thời điểm kiểm tra khác thời điểm sử dụng. Nó là một trong những lớp lỗi phổ biến nhất trong cả lập trình đồng thời lẫn bảo mật.

### Vì sao `@Transactional` KHÔNG cứu được

```java
@Transactional                                 // vẫn SAI
public void register(String email) {
    if (userRepository.existsByEmail(email)) { ... }
    userRepository.save(new User(email));
}
```

Với isolation level mặc định (`READ COMMITTED`), transaction A **không nhìn thấy** dữ liệu chưa commit của B. Cả hai đều đọc "chưa tồn tại", cả hai đều insert. Transaction không phải là lock.

Chỉ isolation level `SERIALIZABLE` mới ngăn được — nhưng nó rất đắt (xem case 7).

## Bảy biến thể trong đời thực

| Biến thể | Code sai | Hậu quả |
|---|---|---|
| Đăng ký trùng email | `if (!exists) save()` | Hai tài khoản |
| Đặt phòng/vé trùng | `if (available) book()` | Hai khách một chỗ |
| Trừ kho | `if (stock > 0) stock--` | Bán quá số lượng |
| Rút tiền | `if (balance >= amt) balance -= amt` | Số dư âm |
| Tạo mã đơn hàng | `max(code) + 1` | Trùng mã |
| Xử lý webhook trùng | `if (!processed) process()` | Cộng tiền hai lần |
| Nâng cấp gói dịch vụ | `if (!hasPlan) createPlan()` | Hai subscription |

Nhìn danh sách này ra được quy luật: **mọi chỗ có `if (điều_kiện_về_dữ_liệu) { ghi_dữ_liệu }` đều là ứng viên của race condition.**

## Giải pháp — xếp theo độ mạnh

### Giải pháp 1: Ràng buộc ở tầng database (mạnh nhất, rẻ nhất)

Để **database** đảm bảo tính duy nhất, thay vì tin vào code ứng dụng.

```sql
ALTER TABLE users ADD CONSTRAINT uk_users_email UNIQUE (email);
```

```java
public void register(String email) {
    try {
        userRepository.save(new User(email));
    } catch (DataIntegrityViolationException e) {
        throw new EmailAlreadyExistsException();
    }
}
```

Đây là mẫu **"cứ làm rồi xin lỗi"** thay vì **"xin phép trước khi làm"**. Nó đúng tuyệt đối vì unique index được database đảm bảo ở mức thấp nhất — không có khe hở nào.

Vì sao đây là giải pháp tốt nhất:

- **Đúng kể cả khi có 100 instance ứng dụng.**
- **Đúng kể cả khi ai đó viết code mới quên kiểm tra.**
- **Đúng kể cả khi có người sửa dữ liệu bằng tay.**
- Nhanh hơn: bỏ được một câu SELECT.

Các dạng ràng buộc mạnh mà ít người dùng hết:

```sql
-- Unique có điều kiện: chỉ một địa chỉ mặc định cho mỗi người dùng
CREATE UNIQUE INDEX uk_default_address
ON address (user_id) WHERE is_default = true;

-- Unique trên biểu thức: email không phân biệt hoa thường
CREATE UNIQUE INDEX uk_email_lower ON users (lower(email));

-- Không cho khoảng thời gian chồng lấn (PostgreSQL)
ALTER TABLE booking ADD CONSTRAINT no_overlap
EXCLUDE USING gist (room_id WITH =, daterange(check_in, check_out) WITH &&);

-- Ràng buộc giá trị
ALTER TABLE inventory ADD CONSTRAINT stock_non_negative CHECK (stock >= 0);
```

`CHECK (stock >= 0)` đáng chú ý: nó biến "bán quá kho" từ một lỗi âm thầm thành một exception rõ ràng. Kể cả khi logic ứng dụng sai, database vẫn không cho phép dữ liệu xấu tồn tại.

> **Nguyên tắc**: mọi bất biến (invariant) của dữ liệu nên được thể hiện bằng ràng buộc database nếu có thể. Code ứng dụng là tuyến phòng thủ thứ hai, không phải thứ nhất.

### Giải pháp 2: Atomic UPSERT

Khi muốn "tạo nếu chưa có, bỏ qua nếu đã có":

```sql
-- PostgreSQL
INSERT INTO users (email, name) VALUES ('a@x.com', 'Alice')
ON CONFLICT (email) DO NOTHING
RETURNING id;

-- Hoặc cập nhật nếu đã tồn tại
INSERT INTO daily_stats (date, views) VALUES (CURRENT_DATE, 1)
ON CONFLICT (date) DO UPDATE SET views = daily_stats.views + 1;

-- MySQL
INSERT INTO users (email, name) VALUES ('a@x.com', 'Alice')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT IGNORE INTO users (email, name) VALUES ('a@x.com', 'Alice');
```

Một câu lệnh, nguyên tử, không có khe hở. Đây là cách viết đúng cho mọi thao tác "tạo-hoặc-cập-nhật".

### Giải pháp 3: Atomic UPDATE có điều kiện

Cho các trường hợp trừ kho, rút tiền:

```sql
UPDATE inventory
SET stock = stock - :qty
WHERE sku = :sku AND stock >= :qty;      -- điều kiện nằm TRONG câu lệnh
```

```java
int updated = jdbc.update(sql, qty, sku, qty);
if (updated == 0) {
    throw new OutOfStockException();       // không đủ hàng
}
```

Điểm mấu chốt: **điều kiện và hành động nằm trong cùng một câu lệnh**, database khoá dòng trong lúc thực thi nên không có khe hở. Số dòng bị ảnh hưởng cho biết kết quả.

So sánh với cách sai:

```java
// SAI — hai bước
Inventory inv = repo.findBySku(sku);
if (inv.getStock() >= qty) {              // ← khe hở ở đây
    inv.setStock(inv.getStock() - qty);
    repo.save(inv);
}
```

### Giải pháp 4: `SELECT ... FOR UPDATE`

Khi logic phức tạp, không gói được vào một câu UPDATE:

```java
@Transactional
public void book(Long roomId, LocalDate date, Long userId) {
    Room room = repo.findByIdForUpdate(roomId).orElseThrow();   // KHOÁ

    if (bookingRepo.existsByRoomAndDate(roomId, date)) {         // an toàn vì đã khoá
        throw new RoomNotAvailableException();
    }

    bookingRepo.save(new Booking(roomId, date, userId));
}
```

Vì dòng `room` bị khoá, request thứ hai phải chờ tới khi request đầu commit — lúc đó nó sẽ thấy booking mới và từ chối đúng.

**Lưu ý tinh vi**: bạn đang khoá dòng `room` để bảo vệ bảng `booking`. Đây là kỹ thuật **lock trên đối tượng đại diện** — hợp lệ và phổ biến, nhưng phải nhất quán: **mọi** đoạn code đụng tới booking của phòng đó đều phải khoá qua cùng dòng `room` đó. Chỉ cần một chỗ quên là thủng.

### Giải pháp 5: Advisory lock (khoá tự đặt tên)

PostgreSQL cho phép khoá trên một con số tuỳ ý, không cần dòng dữ liệu thật:

```sql
-- Khoá theo phạm vi transaction, tự nhả khi commit
SELECT pg_advisory_xact_lock(hashtext('booking:room:42'));
```

```java
@Transactional
public void book(Long roomId, ...) {
    jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtext(?))",
                        Long.class, "booking:room:" + roomId);
    // Từ đây chỉ một transaction chạy cho phòng này
    ...
}
```

Hữu ích khi không có dòng nào tự nhiên để khoá (ví dụ: đảm bảo chỉ một job chạy tại một thời điểm).

Cẩn thận với `hashtext` — nó băm về 32-bit nên **có thể va chạm**. Hai chuỗi khác nhau ra cùng số → khoá nhầm nhau. Với hệ thống lớn, dùng dạng hai tham số (`pg_advisory_xact_lock(int, int)`) với tham số đầu là mã loại tài nguyên.

### Giải pháp 6: Distributed lock bằng Redis

Khi cần khoá **xuyên qua nhiều hệ thống**, không chỉ database:

```java
public boolean tryLock(String key, String token, Duration ttl) {
    Boolean ok = redis.opsForValue()
        .setIfAbsent("lock:" + key, token, ttl);      // SET NX EX
    return Boolean.TRUE.equals(ok);
}

public void unlock(String key, String token) {
    // PHẢI dùng Lua để kiểm tra token và xoá nguyên tử
    String lua = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
            return redis.call('DEL', KEYS[1])
        else
            return 0
        end
        """;
    redis.execute(RedisScript.of(lua, Long.class), List.of("lock:" + key), token);
}
```

Ba chi tiết bắt buộc, thiếu một là sai:

1. **TTL** — nếu tiến trình giữ khoá chết, khoá phải tự hết hạn. Không có TTL thì khoá kẹt vĩnh viễn.
2. **Token ngẫu nhiên** — để chỉ chủ sở hữu mới mở được khoá.
3. **Xoá bằng Lua** — nếu dùng `GET` rồi `DEL` riêng thì có khe hở: khoá có thể hết hạn giữa hai lệnh và bạn xoá nhầm khoá của người khác.

**Cảnh báo quan trọng về distributed lock**: nó **không an toàn tuyệt đối**. Kịch bản hỏng:

```text
   t=0   : A lấy khoá, TTL 10 giây
   t=1   : A bị GC pause 15 giây (phase-6)
   t=10  : khoá hết hạn, B lấy được khoá
   t=16  : A tỉnh dậy, TƯỞNG mình vẫn giữ khoá, tiếp tục ghi dữ liệu
   ⇒ A và B cùng ghi. Khoá thất bại.
```

Đây là hạn chế cố hữu, không sửa được bằng cách chọn thư viện tốt hơn. Kết luận thực dụng:

- Dùng Redis lock cho việc **tối ưu** (tránh làm trùng công việc tốn kém) — chấp nhận đôi khi trùng.
- **Không** dùng nó làm cơ chế duy nhất bảo vệ tính đúng đắn của dữ liệu. Luôn có thêm một ràng buộc ở database (unique key, fencing token) làm lưới an toàn cuối.

**Fencing token** là giải pháp đúng về mặt lý thuyết: mỗi lần cấp khoá kèm một số tăng dần, tài nguyên đích từ chối mọi ghi có token nhỏ hơn token đã thấy. Nhưng nó đòi hỏi tài nguyên đích hỗ trợ — thường không có sẵn.

### Giải pháp 7: Idempotency key — chống lặp ở tầng API

Khác với các giải pháp trên (chống hai request khác nhau), cái này chống **cùng một request bị gửi hai lần** (người dùng bấm hai lần, client retry, mạng chập chờn).

```java
@PostMapping("/orders")
public ResponseEntity<Order> create(
        @RequestHeader("Idempotency-Key") String key,
        @RequestBody OrderRequest req) {

    Optional<IdempotencyRecord> existing = idempotencyRepo.findByKey(key);
    if (existing.isPresent()) {
        return ResponseEntity.ok(existing.get().getResponse());   // trả lại kết quả cũ
    }

    try {
        Order order = orderService.place(req);
        idempotencyRepo.save(new IdempotencyRecord(key, order));   // unique key trên `key`
        return ResponseEntity.ok(order);
    } catch (DataIntegrityViolationException e) {
        // Request song song đã tạo trước — đọc lại kết quả của nó
        return ResponseEntity.ok(idempotencyRepo.findByKey(key).orElseThrow().getResponse());
    }
}
```

Điểm quan trọng: bản ghi idempotency phải được lưu **trong cùng transaction** với hành động nghiệp vụ. Nếu tách ra, lại có khe hở.

Đây là chuẩn của mọi API thanh toán nghiêm túc. Phase-5 bài 7 sẽ đào sâu.

## Bảng chọn giải pháp

| Tình huống | Giải pháp nên dùng |
|---|---|
| Trùng email, username, mã sản phẩm | **Unique constraint** + bắt exception |
| Tạo-hoặc-cập-nhật | **UPSERT** (`ON CONFLICT`) |
| Trừ kho, rút tiền | **Atomic UPDATE có điều kiện** + `CHECK` |
| Đặt phòng theo khoảng ngày | **EXCLUDE constraint** (PostgreSQL) |
| Logic phức tạp trong một DB | **`SELECT FOR UPDATE`** |
| Không có dòng nào để khoá | **Advisory lock** |
| Xuyên nhiều hệ thống | **Redis lock** + ràng buộc DB làm lưới an toàn |
| Client gửi trùng request | **Idempotency key** |

## Chẩn đoán: tìm race condition trong code có sẵn

Race condition khó tìm vì nó hiếm khi tái hiện. Ba cách hiệu quả:

**1. Tìm mẫu code nguy hiểm**

```bash
# Tìm các đoạn kiểm tra rồi ghi
grep -rn "if.*exists\|if.*findBy.*isPresent\|if.*count() ==" src/main/java \
  | grep -v test
```

Với mỗi kết quả, hỏi: "nếu hai request chạy đồng thời tới đây thì sao?"

**2. Kiểm tra ràng buộc database**

```sql
-- PostgreSQL: liệt kê mọi unique constraint hiện có
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype IN ('u', 'x', 'c')
ORDER BY 1;
```

So sánh với các bất biến nghiệp vụ. Bất biến nào không có ràng buộc tương ứng là một lỗ hổng tiềm tàng.

**3. Kiểm tra dữ liệu đã bị hỏng chưa**

```sql
-- Có bản ghi trùng không?
SELECT email, count(*) FROM users GROUP BY email HAVING count(*) > 1;

-- Có tồn kho âm không?
SELECT * FROM inventory WHERE stock < 0;

-- Có booking chồng lấn không?
SELECT a.id, b.id FROM booking a JOIN booking b
  ON a.room_id = b.room_id AND a.id < b.id
 AND daterange(a.check_in, a.check_out) && daterange(b.check_in, b.check_out);
```

Chạy các truy vấn này trên production ngay hôm nay. Nếu có kết quả, bạn đã có race condition đang hoạt động.

**4. Viết test đồng thời**

```java
@Test
void concurrentRegistrationShouldCreateOnlyOneUser() throws Exception {
    int threads = 20;
    var latch = new CountDownLatch(1);
    var pool = Executors.newFixedThreadPool(threads);
    var errors = new AtomicInteger();

    for (int i = 0; i < threads; i++) {
        pool.submit(() -> {
            latch.await();                     // tất cả cùng xuất phát
            try { service.register("race@test.com"); }
            catch (Exception e) { errors.incrementAndGet(); }
            return null;
        });
    }
    latch.countDown();                          // bắn!
    pool.shutdown();
    pool.awaitTermination(10, TimeUnit.SECONDS);

    assertThat(userRepo.countByEmail("race@test.com")).isEqualTo(1);
    assertThat(errors.get()).isEqualTo(threads - 1);
}
```

`CountDownLatch` đảm bảo 20 thread cùng bắt đầu tại một thời điểm, tối đa hoá khả năng đụng độ. Đây là cách duy nhất kiểm chứng được các sửa chữa ở trên thật sự hoạt động.

## Bẫy thường gặp

| Bẫy | Vì sao sai |
|---|---|
| `if (!exists) save()` | Kinh điển, luôn có khe hở |
| Nghĩ `@Transactional` là lock | `READ COMMITTED` không ngăn được |
| Chỉ kiểm tra ở tầng ứng dụng | Nhiều instance là thủng ngay |
| Redis lock không có TTL | Khoá kẹt vĩnh viễn khi tiến trình chết |
| Redis unlock bằng `GET` rồi `DEL` | Có khe hở, xoá nhầm khoá người khác |
| Tin Redis lock là an toàn tuyệt đối | GC pause / mạng chậm phá vỡ nó |
| Không có test đồng thời | Không bao giờ biết mình đã sửa đúng chưa |
| Khoá qua đối tượng đại diện không nhất quán | Một chỗ quên là thủng cả hệ thống |

## Tóm tắt case 6

- **`if (kiểm tra) { hành động }` luôn có race condition** — đây là lỗi TOCTOU.
- `@Transactional` **không** phải lock; `READ COMMITTED` không ngăn được.
- Giải pháp mạnh nhất và rẻ nhất: **ràng buộc ở tầng database** (`UNIQUE`, `CHECK`, `EXCLUDE`) + bắt exception.
- Mẫu tư duy: **"cứ làm rồi xin lỗi"** thay vì **"xin phép trước khi làm"**.
- **Atomic UPDATE có điều kiện** cho trừ kho/rút tiền — điều kiện nằm trong câu lệnh.
- **UPSERT** (`ON CONFLICT`) cho tạo-hoặc-cập-nhật.
- **Redis distributed lock không an toàn tuyệt đối** — luôn cần ràng buộc DB làm lưới an toàn.
- Luôn viết **test đồng thời với `CountDownLatch`**, và chạy truy vấn tìm dữ liệu trùng trên production.

**Bài kế tiếp** → [Case 7: Isolation level và gap lock — những cái khoá bạn không hề viết ra](07-case-isolation-gap-lock.md)

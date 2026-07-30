# Case 7: Idempotency — nền tảng của mọi hệ thống phân tán đáng tin

Xuyên suốt khoá học, một câu đã lặp lại nhiều lần: **"chỉ retry được nếu thao tác idempotent"**. Bài này giải thích trọn vẹn khái niệm đó, vì nó là nền móng mà mọi kỹ thuật khác đứng lên.

Bắt đầu bằng một sự thật khó chịu về hệ phân tán:

> **Timeout không cho bạn biết thao tác đã xảy ra hay chưa.**

```text
   [App] ──── POST /charge ────→ [Payment]
                                     │ trừ tiền THÀNH CÔNG
   [App] ←──── (response mất) ───────┘

   App thấy: TIMEOUT
   Thực tế:  Tiền ĐÃ BỊ TRỪ

   App retry → TRỪ TIỀN LẦN THỨ HAI.
```

Không có cách nào phân biệt "request chưa tới" với "response không về". Đây là giới hạn cơ bản của mạng máy tính, không phải lỗi lập trình.

## Định nghĩa

**Idempotent (bất biến khi lặp)** — thực hiện thao tác nhiều lần cho kết quả **giống hệt** thực hiện một lần.

```text
   IDEMPOTENT:
   x = 5                    → chạy 100 lần vẫn x = 5
   DELETE /orders/123       → chạy 100 lần vẫn xoá đúng đơn đó
   SET stock = 10           → vẫn là 10

   KHÔNG IDEMPOTENT:
   x = x + 1                → chạy 100 lần thì x tăng 100
   POST /orders             → tạo 100 đơn hàng
   UPDATE stock = stock - 1 → trừ 100 lần
```

Bảng cho các phương thức HTTP (theo đặc tả):

| Method | Idempotent theo chuẩn | Thực tế trong ứng dụng |
|---|---|---|
| `GET` | Có | Có (nếu không có tác dụng phụ) |
| `PUT` | **Có** | Có, nếu ghi giá trị tuyệt đối |
| `DELETE` | **Có** | Có |
| `HEAD`, `OPTIONS` | Có | Có |
| `POST` | **Không** | Không — cần cơ chế bổ sung |
| `PATCH` | Không đảm bảo | Tuỳ nội dung |

Chú ý: `PUT` chỉ idempotent nếu bạn ghi **giá trị tuyệt đối**. `PUT /counter` với body `{"increment": 1}` không idempotent dù dùng `PUT`.

## Ba mức đảm bảo gửi tin

| Mức | Nghĩa | Khi nào xảy ra |
|---|---|---|
| **At-most-once** | Nhiều nhất một lần — có thể **mất** | Gửi rồi quên, không retry |
| **At-least-once** | Ít nhất một lần — có thể **trùng** | Có retry, không dedup |
| **Exactly-once** | Đúng một lần | **Không tồn tại ở tầng mạng** |

### Sự thật về "exactly-once"

Đây là điểm gây hiểu lầm nhiều nhất trong hệ phân tán:

```text
   Exactly-once DELIVERY (gửi đúng một lần)   → BẤT KHẢ THI
   Exactly-once PROCESSING (xử lý đúng một lần) → khả thi

   Cách đạt được:  at-least-once delivery  +  xử lý idempotent
                   (gửi có thể trùng)        (trùng cũng không sao)
```

Khi Kafka quảng cáo "exactly-once semantics", nó nói về vế thứ hai — và chỉ trong phạm vi Kafka (đọc từ topic, ghi vào topic, cùng một transaction). Ngay khi bạn gọi ra một hệ thống bên ngoài (database khác, API bên thứ ba), đảm bảo đó không còn.

**Kết luận thực dụng: đừng cố tránh trùng lặp. Hãy thiết kế để trùng lặp vô hại.**

## Bảy kỹ thuật làm cho idempotent

### 1. Idempotency key — chuẩn của ngành thanh toán

Client sinh một khoá duy nhất cho mỗi ý định thao tác, gửi kèm request.

```java
@PostMapping("/payments")
public ResponseEntity<PaymentResult> charge(
        @RequestHeader("Idempotency-Key") String key,
        @RequestBody ChargeRequest req) {

    // Kiểm tra đã xử lý chưa
    Optional<IdempotencyRecord> existing = repository.findByKey(key);
    if (existing.isPresent()) {
        IdempotencyRecord rec = existing.get();
        if (rec.getStatus() == IN_PROGRESS) {
            return ResponseEntity.status(409)
                .header("Retry-After", "1")
                .build();                          // đang xử lý, thử lại sau
        }
        return ResponseEntity.ok(rec.getResponse());   // trả lại kết quả cũ
    }

    try {
        repository.save(new IdempotencyRecord(key, IN_PROGRESS, hash(req)));
    } catch (DataIntegrityViolationException e) {
        // Request song song đã chèn trước — đọc lại kết quả của nó
        return ResponseEntity.status(409).header("Retry-After", "1").build();
    }

    PaymentResult result = paymentService.charge(req);
    repository.complete(key, COMPLETED, result);
    return ResponseEntity.ok(result);
}
```

```sql
CREATE TABLE idempotency_record (
    key           VARCHAR(255) PRIMARY KEY,      -- UNIQUE là mấu chốt
    status        VARCHAR(20) NOT NULL,
    request_hash  VARCHAR(64) NOT NULL,
    response      JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_idem_expires ON idempotency_record (expires_at);
```

Bốn chi tiết quyết định tính đúng đắn:

**a) Bản ghi idempotency và hành động nghiệp vụ phải ở CÙNG transaction.**

```java
// SAI — có khe hở giữa hai transaction
paymentService.charge(req);              // transaction 1
repository.complete(key, result);        // transaction 2 — nếu chết ở đây thì sao?

// ĐÚNG
@Transactional
public PaymentResult chargeIdempotent(String key, ChargeRequest req) {
    PaymentResult result = paymentService.charge(req);
    repository.complete(key, COMPLETED, result);
    return result;
}
```

Nếu tách hai transaction và tiến trình chết ở giữa, tiền đã trừ mà bản ghi vẫn `IN_PROGRESS` — retry sẽ trừ lần nữa.

**b) Kiểm tra `request_hash`** — cùng khoá nhưng nội dung khác nghĩa là client có lỗi:

```java
if (!rec.getRequestHash().equals(hash(req))) {
    throw new IdempotencyKeyReusedException(
        "Khoá đã được dùng cho một request khác");     // HTTP 422
}
```

**c) Xử lý trạng thái `IN_PROGRESS`.** Nếu hai request cùng khoá tới đồng thời, cái thứ hai không được chạy — trả `409` và bảo client thử lại.

**d) TTL và dọn dẹp.** Bảng này lớn rất nhanh. Giữ 24-48 giờ là đủ cho hầu hết trường hợp retry.

```sql
DELETE FROM idempotency_record WHERE expires_at < now();
```

### Ai sinh khoá?

```text
   Client sinh (khuyến nghị):
   ├─ UUID sinh khi người dùng mở form thanh toán
   ├─ Bấm nút 5 lần → cùng một khoá → chỉ 1 giao dịch  ✓
   └─ Retry của thư viện HTTP cũng dùng lại khoá đó   ✓

   Server sinh: KHÔNG bảo vệ được — mỗi request là một khoá mới.
```

Điểm quan trọng: khoá phải được sinh khi **hình thành ý định**, không phải khi gửi request. Nếu sinh khoá ngay trước mỗi lần gửi, bạn không chống được việc bấm nút hai lần.

### 2. Ràng buộc unique tự nhiên

Đôi khi không cần khoá riêng — dữ liệu đã có sẵn thứ duy nhất:

```sql
-- Một người dùng chỉ đăng ký một khoá học một lần
ALTER TABLE enrollment ADD CONSTRAINT uk_user_course UNIQUE (user_id, course_id);

-- Một đơn hàng chỉ có một giao dịch thanh toán thành công
CREATE UNIQUE INDEX uk_payment_order ON payment (order_id) WHERE status = 'SUCCESS';
```

```java
try {
    enrollmentRepository.save(new Enrollment(userId, courseId));
} catch (DataIntegrityViolationException e) {
    return alreadyEnrolled();          // idempotent một cách tự nhiên
}
```

Đây là cách rẻ nhất và mạnh nhất — database đảm bảo, không cần code gì thêm. Luôn tìm cách này trước.

### 3. Ghi giá trị tuyệt đối thay vì tương đối

```java
// KHÔNG idempotent
UPDATE account SET balance = balance - 100 WHERE id = 1;

// Idempotent — ghi giá trị cuối
UPDATE account SET balance = 900, version = 43 WHERE id = 1 AND version = 42;
```

Câu thứ hai chạy hai lần thì lần thứ hai khớp 0 dòng (vì `version` đã là 43) — vô hại.

Nguyên tắc rộng hơn: **thiết kế API nhận trạng thái mong muốn, không nhận thao tác**. `PUT /order/123 {status: "SHIPPED"}` idempotent; `POST /order/123/advance-status` thì không.

### 4. Bảng khử trùng lặp cho consumer

```java
@KafkaListener(topics = "orders")
@Transactional
public void handle(ConsumerRecord<String, OrderEvent> record) {
    String eventId = record.value().getEventId();

    try {
        processedEventRepository.save(new ProcessedEvent(eventId, now()));
    } catch (DataIntegrityViolationException e) {
        log.debug("Sự kiện {} đã xử lý, bỏ qua", eventId);
        return;                                    // trùng lặp — bỏ qua
    }

    doBusinessLogic(record.value());               // cùng transaction
}
```

Điều kiện bắt buộc: **bảng khử trùng và logic nghiệp vụ phải cùng transaction, cùng database**. Nếu nghiệp vụ ghi vào database A còn bảng khử trùng ở Redis, bạn quay lại vấn đề dual write (case 4).

### 5. Máy trạng thái — chỉ chuyển tiếp hợp lệ

```java
public void markShipped(Long orderId) {
    Order order = repository.findByIdForUpdate(orderId).orElseThrow();

    if (order.getStatus() == SHIPPED) {
        return;                                    // đã ở trạng thái đích — không sao
    }
    if (order.getStatus() != PAID) {
        throw new InvalidStateTransitionException(order.getStatus(), SHIPPED);
    }
    order.setStatus(SHIPPED);
}
```

Máy trạng thái làm cho mọi thao tác chuyển trạng thái tự nhiên idempotent: gọi lại khi đã ở trạng thái đích thì không làm gì.

Cách viết bằng SQL còn gọn hơn:

```sql
UPDATE orders SET status = 'SHIPPED', shipped_at = now()
WHERE id = :id AND status = 'PAID';
-- Chạy lần hai: khớp 0 dòng, vô hại
```

### 6. Khoá tự nhiên từ nội dung

```java
// Thay vì ID ngẫu nhiên, dùng khoá suy ra từ dữ liệu
String transferId = DigestUtils.sha256Hex(
    fromAccount + ":" + toAccount + ":" + amount + ":" + requestDate);
```

Hai request giống hệt nhau sinh cùng ID → unique constraint chặn cái thứ hai.

Cẩn thận: nếu người dùng **thật sự** muốn chuyển hai lần cùng số tiền trong cùng ngày, cách này sẽ chặn nhầm. Thêm yếu tố phân biệt (thời điểm chính xác, mã ghi chú) hoặc dùng idempotency key do client sinh.

### 7. Điều kiện thời gian (fencing)

```sql
-- Chỉ cập nhật nếu dữ liệu đến MỚI HƠN cái đang có
UPDATE device_status
SET temperature = :temp, updated_at = :eventTime
WHERE device_id = :id AND updated_at < :eventTime;
```

Hữu ích cho dữ liệu cảm biến/sự kiện đến không đúng thứ tự: sự kiện cũ tới muộn sẽ bị bỏ qua thay vì ghi đè dữ liệu mới.

## Bảng tra cứu: kỹ thuật nào cho tình huống nào

| Tình huống | Kỹ thuật |
|---|---|
| API thanh toán, tạo đơn hàng | **Idempotency key** (client sinh) |
| Đăng ký, ghi danh, follow | **Unique constraint tự nhiên** |
| Cập nhật hồ sơ, cấu hình | **Ghi giá trị tuyệt đối** + optimistic lock |
| Consumer Kafka/RabbitMQ | **Bảng khử trùng** cùng transaction |
| Chuyển trạng thái đơn hàng | **Máy trạng thái** |
| Dữ liệu cảm biến, sự kiện | **Điều kiện thời gian** |
| Webhook từ đối tác | **Idempotency key** từ header của họ |
| Gửi email/SMS | Bảng khử trùng + chấp nhận rủi ro nhỏ |

Dòng cuối đáng nói: gửi email không thể idempotent tuyệt đối (bạn không thu hồi được email đã gửi). Thực tế: kiểm tra bảng khử trùng trước khi gửi, chấp nhận xác suất rất nhỏ gửi trùng nếu tiến trình chết đúng giữa hai bước.

## Webhook — trường hợp bắt buộc phải idempotent

Mọi nhà cung cấp webhook đều gửi lại nếu không nhận được `200`. Và họ có thể gửi trùng ngay cả khi bạn đã trả `200`.

```java
@PostMapping("/webhooks/payment")
public ResponseEntity<Void> handleWebhook(
        @RequestHeader("X-Signature") String signature,
        @RequestHeader("X-Event-Id") String eventId,
        @RequestBody String rawBody) {

    if (!signatureVerifier.verify(rawBody, signature)) {
        return ResponseEntity.status(401).build();
    }

    try {
        webhookEventRepository.save(new WebhookEvent(eventId, rawBody, now()));
    } catch (DataIntegrityViolationException e) {
        return ResponseEntity.ok().build();      // đã nhận rồi — vẫn trả 200
    }

    // Xử lý BẤT ĐỒNG BỘ — trả 200 nhanh để đối tác không retry
    eventPublisher.publish(new WebhookReceivedEvent(eventId));
    return ResponseEntity.ok().build();
}
```

Ba nguyên tắc cho webhook:

1. **Xác minh chữ ký trước tiên** — nếu không, bất kỳ ai cũng gửi webhook giả được.
2. **Trả `200` thật nhanh**, xử lý bất đồng bộ. Nếu bạn xử lý đồng bộ mất 5 giây, đối tác có thể timeout và gửi lại.
3. **Trả `200` cho cả sự kiện trùng** — nếu trả lỗi, đối tác sẽ retry mãi.

## Kiểm thử idempotency

Không kiểm thử thì bạn không biết mình đã làm đúng chưa:

```java
@Test
void chargingTwiceWithSameKeyShouldChargeOnce() {
    String key = UUID.randomUUID().toString();
    ChargeRequest req = new ChargeRequest("acc-1", new BigDecimal("100"));

    PaymentResult r1 = api.charge(key, req);
    PaymentResult r2 = api.charge(key, req);

    assertThat(r1.getTransactionId()).isEqualTo(r2.getTransactionId());
    assertThat(accountRepository.findById("acc-1").getBalance())
        .isEqualByComparingTo("900");           // chỉ trừ MỘT lần
}

@Test
void concurrentSameKeyShouldChargeOnce() throws Exception {
    String key = UUID.randomUUID().toString();
    int threads = 20;
    var latch = new CountDownLatch(1);
    var pool = Executors.newFixedThreadPool(threads);
    var successes = new AtomicInteger();

    for (int i = 0; i < threads; i++) {
        pool.submit(() -> {
            latch.await();
            try { api.charge(key, req); successes.incrementAndGet(); }
            catch (Exception ignored) {}
            return null;
        });
    }
    latch.countDown();
    pool.shutdown();
    pool.awaitTermination(10, TimeUnit.SECONDS);

    assertThat(transactionRepository.countByAccount("acc-1")).isEqualTo(1);
}
```

Test thứ hai (đồng thời) quan trọng hơn test thứ nhất — nó phát hiện được các khe hở mà test tuần tự bỏ qua.

Nâng cao hơn: chèn lỗi có chủ ý ở từng bước để kiểm tra mọi điểm chết đều an toàn.

```java
@Test
void crashAfterChargeBeforeRecordShouldNotDoubleCharge() {
    // Giả lập tiến trình chết sau khi trừ tiền, trước khi ghi bản ghi
    doThrow(new RuntimeException("crash"))
        .when(idempotencyRepository).complete(any(), any(), any());

    assertThrows(RuntimeException.class, () -> api.charge(key, req));

    // Retry sau khi "khởi động lại"
    reset(idempotencyRepository);
    api.charge(key, req);

    assertThat(transactionRepository.countByAccount("acc-1")).isEqualTo(1);
}
```

Nếu test này thất bại, nghĩa là bản ghi idempotency và hành động nghiệp vụ **không** cùng transaction.

## Trường hợp thực tế: sự cố trừ tiền hai lần

Bối cảnh: ví điện tử, 12 khách hàng báo bị trừ tiền hai lần trong một ngày.

**Điều tra**:

```text
   Log cho thấy: client mobile gửi POST /transfer
                 → timeout 10 giây phía client
                 → thư viện HTTP tự động retry
                 → server xử lý CẢ HAI lần

   Vì sao server không phát hiện trùng?
   → Có idempotency key, NHƯNG:
     ├─ Khoá được sinh Ở SERVER (mỗi request một khoá mới)  ← lỗi 1
     └─ Bản ghi idempotency ghi ở transaction RIÊNG          ← lỗi 2
```

**Sửa**:

| Lỗi | Cách sửa |
|---|---|
| Khoá sinh ở server | Client sinh UUID khi mở màn hình chuyển tiền, giữ nguyên qua mọi lần retry |
| Bản ghi khác transaction | Gộp vào một `@Transactional` |
| Không có trạng thái `IN_PROGRESS` | Thêm, và trả `409` cho request song song |
| Không có test đồng thời | Thêm test 20 thread cùng khoá |
| Không có đối soát | Job hàng giờ đối chiếu giao dịch với sao kê ngân hàng |

**Kết quả**: 6 tháng tiếp theo không có ca trừ tiền trùng nào, dù tỉ lệ timeout mạng không đổi.

Điểm đáng học nhất: hệ thống **đã có** idempotency key nhưng cài đặt sai ở hai chỗ. Idempotency là thứ mà "có làm" không đủ — phải làm đúng từng chi tiết, và phải có test chứng minh.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Server sinh idempotency key | Không bảo vệ được gì |
| Bản ghi idempotency khác transaction với nghiệp vụ | Trừ tiền hai lần khi tiến trình chết đúng lúc |
| Không xử lý trạng thái `IN_PROGRESS` | Hai request đồng thời cùng chạy |
| Không kiểm tra `request_hash` | Client tái dùng khoá cho nội dung khác mà không bị phát hiện |
| Không có TTL | Bảng phình vô hạn |
| Tin vào "exactly-once" của message broker | Vẫn trùng khi ra khỏi phạm vi broker |
| Retry thao tác chưa idempotent | Nhân đôi tác dụng |
| Webhook trả lỗi cho sự kiện trùng | Đối tác retry mãi mãi |
| Không có test đồng thời | Không biết mình sai cho tới khi mất tiền |
| Không có đối soát | Sai lệch tích luỹ âm thầm |

## Tóm tắt case 7

- **Timeout không cho biết thao tác đã xảy ra hay chưa** — đây là giới hạn cơ bản của mạng.
- **Exactly-once delivery không tồn tại.** Cách đúng: **at-least-once + xử lý idempotent**.
- Bảy kỹ thuật: idempotency key, unique constraint tự nhiên, ghi giá trị tuyệt đối, bảng khử trùng, máy trạng thái, khoá từ nội dung, điều kiện thời gian.
- **Unique constraint tự nhiên là cách rẻ nhất** — luôn tìm nó trước.
- Idempotency key: **client sinh**, lưu **cùng transaction** với nghiệp vụ, có trạng thái `IN_PROGRESS`, kiểm tra `request_hash`, có TTL.
- Webhook: **xác minh chữ ký → trả 200 nhanh → xử lý bất đồng bộ → trả 200 cả cho sự kiện trùng**.
- Thiết kế API nhận **trạng thái mong muốn**, không nhận thao tác tương đối.
- Bắt buộc có **test đồng thời** và **test chèn lỗi**; và với dữ liệu tiền bạc, thêm **đối soát định kỳ**.

**Bài kế tiếp** → [Phase 6 - Case 1: GC pause — khi JVM dừng cả thế giới](../phase-6-runtime-ha-tang/01-case-gc-pause.md)

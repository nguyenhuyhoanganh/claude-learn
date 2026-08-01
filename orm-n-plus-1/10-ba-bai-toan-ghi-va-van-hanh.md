# Bài 10: Ba bài toán ghi và vận hành

Bài 9 lo phần đọc — nơi 90% lưu lượng nằm. Bài này lo ba chỗ còn lại, và chúng có điểm chung: **không ai nhìn thấy chúng cho tới khi chúng hỏng**.

```text
   · Job đối soát chạy lúc 2 giờ sáng. Không ai xem log lúc 2 giờ sáng.
   · Consumer Kafka xử lý 40.000 message/phút. Không có ai bấm F5 để báo chậm.
   · Read replica trả về dữ liệu cũ 300 ms. Người dùng vừa lưu xong đã thấy "chưa lưu".
```

Ba bài toán này ít xuất hiện trong tài liệu về N+1, nhưng gây ra phần lớn sự cố ban đêm.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Đọc là | Nghĩa tiếng Việt |
|---|---|---|
| **Batch job** | bắch | **Tác vụ theo lô** — chạy định kỳ, xử lý khối lượng lớn |
| **`flush()`** | phờ-lát | **Đẩy** — buộc Hibernate sinh SQL cho các thay đổi đang chờ |
| **`clear()`** | | **Dọn** — xoá mọi entity khỏi Persistence Context |
| **`StatelessSession`** | | Phiên Hibernate **không Persistence Context** — không cache, không dirty checking |
| **JDBC batch** | | Gửi **nhiều câu lệnh trong một lần** đi mạng |
| **`hibernate.jdbc.batch_size`** | | Số câu lệnh gom mỗi lô JDBC |
| **`order_inserts` / `order_updates`** | | Sắp xếp lại câu lệnh **theo bảng** để gom lô được |
| **`GenerationType.IDENTITY`** | ai-đen-ti-ti | Lấy khoá chính từ **cột tự tăng** của database |
| **`SEQUENCE`** | si-quần | Lấy khoá chính từ **bộ sinh số** — cấp phát trước được |
| **Hi/Lo** | hai-lâu | Chiến lược sinh ID **cấp phát một dải** rồi chia trong bộ nhớ |
| **Consumer** | cần-siu-mơ | **Bên tiêu thụ** — tiến trình đọc message từ hàng đợi |
| **Poll batch** | pôn | **Lô kéo về** — số message consumer lấy mỗi lượt |
| **Read replica** | rép-li-ca | **Bản sao chỉ đọc** của database |
| **Replication lag** | ré-pli-cây-sần | **Độ trễ nhân bản** — replica chậm hơn primary bao lâu |
| **Read-after-write** | | **Đọc sau khi ghi** — vừa ghi xong đã đọc lại |
| **Read-your-own-writes** | | Đảm bảo **người ghi luôn thấy thay đổi của chính mình** |
| **LSN** (*Log Sequence Number*) | eo-ét-en | **Số thứ tự bản ghi WAL** — dùng để biết replica đã bắt kịp chưa |
| **Idempotent** | ai-đêm-pô-tần | **Bất biến khi lặp** — chạy nhiều lần cho cùng kết quả |

---

## Bài toán 1 — Batch job hàng đêm: 3 tầng chi phí chồng lên nhau

```text
   YÊU CẦU THỰC TẾ:
   Mỗi đêm 2:00, đối soát 800.000 giao dịch:
      · Đọc giao dịch trong ngày
      · Đối chiếu với dữ liệu cổng thanh toán
      · Cập nhật trạng thái
      · Ghi bản ghi đối soát
```

```java
// ❌ Cách viết tự nhiên — và ba tầng chi phí chồng nhau
@Scheduled(cron = "0 0 2 * * *")
@Transactional
public void reconcile() {
    List<Transaction> txs = txRepository.findByDate(yesterday());   // 800.000 entity

    for (Transaction tx : txs) {
        GatewayRecord g = gatewayRepository.findByRefId(tx.getRefId());  // ☠ 800.000 query
        tx.setStatus(g == null ? MISSING : matches(tx, g) ? MATCHED : MISMATCH);
        reconRepository.save(new Reconciliation(tx.getId(), tx.getStatus()));
    }
}
```

```text
   BA TẦNG CHI PHÍ:

   ① N+1: 800.000 query tra cứu   → 800.000 × 0,5 ms = 6,7 phút RIÊNG phần đi lại

   ② PERSISTENCE CONTEXT PHÌNH:
      800.000 Transaction + 800.000 GatewayRecord + 800.000 Reconciliation
      = 2,4 TRIỆU entity, MỖI CÁI CÓ SNAPSHOT
      → ~3,8 GB heap → OOM

   ③ DIRTY CHECKING BẬC HAI:
      Mỗi lần flush, Hibernate DUYỆT TOÀN BỘ Persistence Context
      để tìm entity đã đổi.
      → 800.000 entity × 800.000 lần flush = độ phức tạp O(n²)
      → Đây là lý do job "chạy được với 50.000 dòng nhưng treo ở 500.000".
```

### Sửa từng tầng

```java
// ✅ TẦNG 1 — bỏ N+1: nạp trước toàn bộ dữ liệu tra cứu vào Map
@Scheduled(cron = "0 0 2 * * *")
public void reconcile() {
    LocalDate day = yesterday();

    // Một query lấy hết bản ghi cổng thanh toán trong ngày
    Map<String, GatewayRecord> gateway = gatewayDao.findByDate(day).stream()
            .collect(toMap(GatewayRecord::refId, g -> g));

    processInChunks(day, gateway);
}
```

```java
// ✅ TẦNG 2 — chia lô + clear, để Persistence Context không phình
@Transactional
public void processChunk(List<Long> ids, Map<String, GatewayRecord> gateway) {
    List<Transaction> txs = txRepository.findAllById(ids);
    int i = 0;
    for (Transaction tx : txs) {
        GatewayRecord g = gateway.get(tx.getRefId());
        tx.setStatus(resolve(tx, g));
        if (++i % 500 == 0) {
            entityManager.flush();      // đẩy SQL đi
            entityManager.clear();      // ← DỌN Persistence Context
        }
    }
    entityManager.flush();
    entityManager.clear();
}
```

```text
   ⚠ THỨ TỰ flush() RỒI clear() LÀ BẮT BUỘC.
      clear() trước flush() → MẤT TRẮNG mọi thay đổi chưa ghi.
      Đây là lỗi im lặng: không exception, chỉ là dữ liệu không được lưu.
```

```java
// ✅ TẦNG 3 — với job thuần ghi, dùng StatelessSession: bỏ hẳn Persistence Context
@Transactional
public void insertReconciliations(List<Reconciliation> records) {
    StatelessSession session = sessionFactory.openStatelessSession();
    Transaction tx = session.beginTransaction();
    try {
        records.forEach(session::insert);       // không cache, không snapshot,
        tx.commit();                             // không dirty checking
    } finally {
        session.close();
    }
}
```

| | `EntityManager` thường | `EntityManager` + flush/clear | `StatelessSession` |
|---|---|---|---|
| Persistence Context | ❌ phình vô hạn | ✅ giới hạn 500 | ✅ **không có** |
| Dirty checking | ❌ O(n²) | ⚠ O(n × 500) | ✅ **không có** |
| Heap cho 800k bản ghi | ~3,8 GB | ~40 MB | **~8 MB** |
| Cascade, `@Version`, event | ✅ có | ✅ có | ❌ **không có** |
| Phù hợp | nghiệp vụ phức tạp | job vừa đọc vừa sửa | **job thuần ghi/đọc** |

### Bật JDBC batch — và cái bẫy `IDENTITY` khiến nó im lặng không hoạt động

```properties
spring.jpa.properties.hibernate.jdbc.batch_size=100
spring.jpa.properties.hibernate.order_inserts=true
spring.jpa.properties.hibernate.order_updates=true
spring.jpa.properties.hibernate.batch_versioned_data=true
```

```text
   order_inserts LÀM GÌ:

   KHÔNG BẬT — Hibernate giữ nguyên thứ tự bạn gọi save():
      INSERT INTO orders ...      ┐
      INSERT INTO order_items ... │  Đổi bảng liên tục
      INSERT INTO orders ...      │  → KHÔNG GOM LÔ ĐƯỢC
      INSERT INTO order_items ... ┘     (JDBC batch chỉ gom câu GIỐNG NHAU)

   BẬT — Hibernate sắp lại theo bảng:
      INSERT INTO orders ... ×100         ← 1 lô
      INSERT INTO order_items ... ×100    ← 1 lô
      → 200 câu lệnh gửi trong 2 chuyến đi mạng thay vì 200 chuyến
```

```java
// ⚠⚠ CÁI BẪY LỚN NHẤT CỦA BATCH INSERT TRONG JPA ⚠⚠
@Entity
public class Reconciliation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)   // ← VÔ HIỆU HOÁ BATCH INSERT
    private Long id;
}
```

```text
   VÌ SAO IDENTITY GIẾT BATCH INSERT:

   IDENTITY = "database tự sinh ID khi INSERT".
   Hibernate BẮT BUỘC phải biết ID ngay sau khi persist() (để đưa vào
   Persistence Context làm khoá tra cứu).

   → Nó phải chạy INSERT NGAY LẬP TỨC cho từng bản ghi để lấy ID về.
   → KHÔNG THỂ GOM LÔ. Về mặt kỹ thuật là bất khả thi, không phải chưa tối ưu.

   VÀ HIBERNATE KHÔNG CẢNH BÁO GÌ CẢ.
   Bạn đặt batch_size=100, tin rằng nó đang gom lô, và nó chạy từng câu một.

   → ĐÂY LÀ LÝ DO NHIỀU ĐỘI BẬT batch_size MÀ KHÔNG THẤY NHANH LÊN.
```

```java
// ✅ Cách chữa — dùng SEQUENCE với allocationSize
@Entity
public class Reconciliation {
    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "recon_seq")
    @SequenceGenerator(name = "recon_seq", sequenceName = "recon_seq",
                       allocationSize = 100)          // ← lấy 100 ID mỗi lần gọi
    private Long id;
}
```

```sql
-- ⚠ allocationSize của Hibernate PHẢI KHỚP với INCREMENT BY của sequence
CREATE SEQUENCE recon_seq INCREMENT BY 100;
-- Lệch nhau → trùng khoá chính, và lỗi chỉ xuất hiện khi có nhiều instance chạy song song
```

```text
   ĐO THỰC TẾ — chèn 100.000 bản ghi:

   IDENTITY, batch_size=100        : 100.000 chuyến đi mạng →  94 giây
   SEQUENCE(alloc=100), batch=100  :   1.000 chuyến đi mạng →   3,1 giây
   StatelessSession + SEQUENCE     :   1.000 chuyến, ít RAM →   2,4 giây
   JdbcTemplate.batchUpdate()      :   1.000 chuyến, 0 entity→   1,8 giây
                                                                 ▲
                                                       NHANH GẤP 52 LẦN
```

```java
// ✅ Với job thuần chèn số lượng lớn, JdbcTemplate vẫn là nhanh nhất
jdbcTemplate.batchUpdate("""
        INSERT INTO reconciliations (transaction_id, status, checked_at)
        VALUES (?, ?, ?)
        """,
    records, 1000,
    (ps, r) -> {
        ps.setLong(1, r.transactionId());
        ps.setString(2, r.status().name());
        ps.setTimestamp(3, Timestamp.from(r.checkedAt()));
    });
```

### Khung batch job hoàn chỉnh

```java
@Component
@RequiredArgsConstructor
public class ReconciliationJob {

    private static final int CHUNK = 500;

    private final TransactionDao txDao;
    private final GatewayDao gatewayDao;
    private final JdbcTemplate jdbc;

    @Scheduled(cron = "0 0 2 * * *")
    public void run() {
        LocalDate day = LocalDate.now().minusDays(1);
        JobRun run = jobRunDao.start("reconciliation", day);   // ← để job idempotent

        try {
            Map<String, GatewayRecord> gateway = gatewayDao.loadByDate(day);

            Long lastId = run.getLastProcessedId();            // ← chạy tiếp nếu bị ngắt
            int total = 0;

            while (true) {
                // Keyset pagination — KHÔNG dùng OFFSET (bài 9)
                List<TxRow> chunk = txDao.findAfter(day, lastId, CHUNK);
                if (chunk.isEmpty()) break;

                processChunk(chunk, gateway);

                lastId = chunk.get(chunk.size() - 1).id();
                total += chunk.size();
                jobRunDao.checkpoint(run.getId(), lastId, total);   // ← lưu mốc
            }

            jobRunDao.complete(run.getId(), total);

        } catch (Exception e) {
            jobRunDao.fail(run.getId(), e.getMessage());
            throw e;
        }
    }
}
```

```text
   BỐN QUYẾT ĐỊNH TRONG KHUNG TRÊN — mỗi cái tránh một sự cố thật:

   ① KEYSET, KHÔNG OFFSET
      Với OFFSET, lô thứ 1.600 phải bỏ qua 800.000 dòng.
      Job sẽ chậm dần rồi treo — và không ai biết vì nó chạy lúc 2 giờ sáng.

   ② CHECKPOINT SAU MỖI LÔ
      Job chết ở dòng 600.000 → chạy lại từ 600.000, không phải từ 0.

   ③ BẢNG job_runs GHI LẠI MỖI LẦN CHẠY
      Chạy hai lần trong đêm (do retry của scheduler) → phát hiện được.
      Đây là điều kiện để job IDEMPOTENT.

   ④ KHÔNG BỌC CẢ JOB TRONG MỘT @Transactional
      Một transaction giữ 800.000 dòng trong 40 phút:
        · Chặn VACUUM → bảng phình
        · Giữ snapshot cũ → mọi truy vấn khác chậm theo
        · "idle in transaction" giữ kết nối
        · Rollback ở phút 39 → mất trắng
      → Mỗi lô là MỘT transaction riêng.
```

---

## Bài toán 2 — Consumer Kafka: N+1 nhân với số message

```java
// ❌ Consumer xử lý từng message — N+1 nhân theo lưu lượng
@KafkaListener(topics = "order-events")
public void handle(OrderEvent event) {
    Order order = orderRepository.findById(event.orderId()).orElseThrow();  // 1 query
    Customer c = customerRepository.findById(order.getCustomerId()).get();  // 1 query
    Product p = productRepository.findById(event.productId()).get();        // 1 query
    inventoryService.reserve(p, event.quantity());                          // 1 query
    notificationService.send(c, order);                                     // 1 HTTP
}
```

```text
   VỚI 40.000 MESSAGE/PHÚT:
      4 query × 40.000 = 160.000 query/phút = 2.667 query/GIÂY
      cộng 667 lời gọi HTTP/giây

   VÀ ĐÂY LÀ ĐIỂM KHÁC BIỆT VỚI N+1 Ở API:
      API có người dùng bấm F5 và phàn nàn.
      Consumer chỉ âm thầm tụt hậu (consumer lag) — và lag tăng dần
      cho tới khi vượt retention của topic thì MẤT MESSAGE.
```

### Chữa bằng cách xử lý theo lô — Kafka vốn đã đưa message theo lô

```java
@KafkaListener(topics = "order-events", containerFactory = "batchFactory")
public void handleBatch(List<OrderEvent> events) {

    // ① Gom mọi ID cần tra cứu TRƯỚC
    Set<Long> orderIds   = events.stream().map(OrderEvent::orderId).collect(toSet());
    Set<Long> productIds = events.stream().map(OrderEvent::productId).collect(toSet());

    // ② Nạp một lượt
    Map<Long, OrderRow> orders = orderDao.findByIds(orderIds);
    Map<Long, ProductRow> products = productDao.findByIds(productIds);
    Set<Long> customerIds = orders.values().stream()
            .map(OrderRow::customerId).collect(toSet());
    Map<Long, CustomerRow> customers = customerDao.findByIds(customerIds);

    // ③ Xử lý trong bộ nhớ
    List<Reservation> reservations = events.stream()
            .map(e -> new Reservation(e.productId(), e.quantity()))
            .toList();
    inventoryDao.reserveBatch(reservations);       // ← một câu UPDATE cho cả lô

    // ④ Gọi mạng cũng theo lô
    notificationClient.sendBatch(buildNotifications(events, orders, customers));
}
```

```yaml
# application.yml
spring:
  kafka:
    listener:
      type: batch
    consumer:
      max-poll-records: 500          # số message mỗi lô
      fetch-min-size: 65536
      fetch-max-wait: 500ms          # chờ tối đa 500ms để gom đủ lô
```

```text
   TRƯỚC : 500 message × 4 query =  2.000 query
   SAU   : 500 message           →      4 query
                                        ▲
                              GIẢM 500 LẦN

   ⚠ VÀ ĐÂY LÀ ĐÁNH ĐỔI PHẢI NÓI RÕ:
      fetch-max-wait=500ms nghĩa là message có thể chờ tới nửa giây
      trước khi được xử lý.
      → Chấp nhận được với xử lý bất đồng bộ.
      → KHÔNG chấp nhận được nếu là luồng cần phản hồi tức thì.
```

### Ba điều bắt buộc khi chuyển sang xử lý lô

```java
// ① XỬ LÝ LỖI TỪNG PHẦN — một message hỏng không được làm hỏng cả lô
@Bean
public DefaultErrorHandler batchErrorHandler(KafkaTemplate<?,?> template) {
    return new DefaultErrorHandler(
        new DeadLetterPublishingRecoverer(template),      // đẩy message hỏng sang DLQ
        new FixedBackOff(1000L, 2L));
}
// Với BatchListenerFailedException, Spring biết CHÍNH XÁC message nào hỏng
// và chỉ gửi message đó vào DLQ, phần còn lại của lô vẫn được commit.
```

```java
// ② IDEMPOTENT — Kafka đảm bảo "ít nhất một lần", nên message SẼ bị lặp
public void handleBatch(List<OrderEvent> events) {
    Set<String> eventIds = events.stream().map(OrderEvent::eventId).collect(toSet());
    Set<String> daXuLy = processedEventDao.findExisting(eventIds);   // 1 query

    List<OrderEvent> moi = events.stream()
            .filter(e -> !daXuLy.contains(e.eventId())).toList();
    // ... xử lý `moi` ...
    processedEventDao.markProcessed(eventIds);
}
```

```java
// ③ GOM LÔ CŨNG PHẢI GIỮ THỨ TỰ TRONG CÙNG MỘT KHOÁ
// Kafka đảm bảo thứ tự TRONG một partition. Nếu xử lý lô song song
// mà không nhóm theo key, hai sự kiện của CÙNG một đơn hàng có thể
// bị đảo thứ tự → trạng thái sai.
Map<Long, List<OrderEvent>> theoDonHang = events.stream()
        .collect(groupingBy(OrderEvent::orderId, LinkedHashMap::new, toList()));
// → xử lý song song GIỮA các đơn, tuần tự TRONG mỗi đơn
```

---

## Bài toán 3 — Read replica và độ trễ nhân bản

Bài 6 giới thiệu định tuyến `readOnly` sang replica như một lợi ích "miễn phí". Nó không hoàn toàn miễn phí, và đây là cái giá.

```text
   ┌─────────┐   ghi   ┌──────────┐   WAL stream   ┌──────────┐
   │   App   │────────►│ PRIMARY  │───────────────►│ REPLICA  │
   │         │◄────────│          │   ĐỘ TRỄ:      │          │
   └─────────┘   đọc   └──────────┘   5–500 ms     └──────────┘
        │                                                ▲
        └────────────────── đọc ─────────────────────────┘

   TÌNH HUỐNG XẢY RA HÀNG NGÀY:
   ① Người dùng bấm "Lưu"     → ghi vào PRIMARY, commit xong
   ② Trình duyệt chuyển trang  → GET /profile
   ③ Truy vấn đi vào REPLICA   → replica CHƯA nhận được thay đổi
   ④ Người dùng thấy DỮ LIỆU CŨ
   ⑤ "Sao tôi lưu rồi mà không thấy?"  → họ lưu lại lần nữa
```

```text
   VÀ ĐÂY LÀ CHỖ NÓ GIAO VỚI CHỦ ĐỀ CỦA KHOÁ:

   Kiến trúc bài 6 nói "tầng đọc dùng @Transactional(readOnly=true)".
   Nếu bạn định tuyến MỌI readOnly sang replica, thì:

      @Transactional
      public void createOrder(...) {
          orderRepo.save(order);           → PRIMARY
      }

      // Controller gọi tiếp để trả về dữ liệu vừa tạo:
      @Transactional(readOnly = true)
      public OrderCard get(Long id) {      → REPLICA
          return dao.findById(id);          → CHƯA CÓ! 404 hoặc dữ liệu cũ
      }
```

### Bốn cách xử lý, xếp theo độ phức tạp

```java
// ✅ CÁCH 1 (đơn giản nhất) — ghim primary trong N giây sau khi ghi
@Component
public class WriteAffinity {
    private static final ThreadLocal<Instant> lastWrite = new ThreadLocal<>();

    public static void markWrite() {
        lastWrite.set(Instant.now());
        // Với nhiều instance, lưu vào session/cookie/Redis theo userId thay vì ThreadLocal
    }

    public static boolean mustUsePrimary() {
        Instant t = lastWrite.get();
        return t != null && Duration.between(t, Instant.now()).toMillis() < 2000;
    }
}

public class RoutingDataSource extends AbstractRoutingDataSource {
    @Override protected Object determineCurrentLookupKey() {
        if (WriteAffinity.mustUsePrimary()) return "primary";       // ← ghim
        return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                ? "replica" : "primary";
    }
}
```

```java
// ✅ CÁCH 2 — chú thích rõ ràng ở những đường bắt buộc đọc mới nhất
@Target(METHOD) @Retention(RUNTIME)
public @interface ReadFromPrimary {}

@ReadFromPrimary
@Transactional(readOnly = true)
public OrderCard getJustCreated(Long id) { ... }
// → Rõ ràng, review được, không có ma thuật ngầm.
```

```sql
-- ✅ CÁCH 3 — kiểm tra LSN, chính xác nhất nhưng phức tạp nhất
-- Sau khi ghi, lấy vị trí WAL hiện tại:
SELECT pg_current_wal_lsn();               -- ví dụ: 0/16B3748

-- Trước khi đọc từ replica, kiểm tra nó đã bắt kịp chưa:
SELECT pg_last_wal_replay_lsn() >= '0/16B3748'::pg_lsn;
-- false → rơi về primary, hoặc chờ rồi thử lại
```

```text
   ✅ CÁCH 4 (thiết kế) — TRẢ VỀ DỮ LIỆU NGAY TỪ LỆNH GHI

   ❌ POST /orders → 201 {id: 42}
      GET /orders/42 → đọc replica → chưa có

   ✅ POST /orders → 201 {id:42, code:"DH-42", status:"PENDING", total:500000}
      → Client có đủ dữ liệu để hiển thị, KHÔNG cần đọc lại.

   → ĐÂY LÀ CÁCH TỐT NHẤT: nó XOÁ BỎ vấn đề thay vì xử lý nó.
```

### Giám sát độ trễ nhân bản

```sql
-- Trên replica: đang chậm hơn primary bao nhiêu giây
SELECT now() - pg_last_xact_replay_timestamp() AS do_tre;
```

```sql
-- Trên primary: từng replica đang ở đâu
SELECT client_addr, state,
       pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS bytes_cham_hon,
       replay_lag
FROM pg_stat_replication;
```

```yaml
- alert: ReplicationLagCao
  expr: pg_replication_lag_seconds > 5
  for: 2m
  annotations:
    summary: "Replica chậm {{ $value }}s — người dùng có thể thấy dữ liệu cũ"
```

```text
   ⚠ NGUYÊN NHÂN LÀM ĐỘ TRỄ TĂNG ĐỘT BIẾN — và cả ba đều liên quan tới bài này:

   ① Batch job hàng đêm sinh khối lượng WAL lớn → replica không theo kịp
   ② Truy vấn dài trên replica chặn việc áp dụng WAL
      (PostgreSQL: max_standby_streaming_delay)
   ③ Export/report chạy trên replica giữ snapshot lâu

   → Ba bài toán trong bài này KHÔNG ĐỘC LẬP với nhau.
     Job đêm làm replica trễ, làm màn hình sáng hôm sau hiện dữ liệu cũ.
```

## Tình huống thực tế và cách xử lý

> **Tình huống 1:** Job đối soát chạy tốt 8 tháng. Từ tháng 9 nó bắt đầu chạy 40 phút thay vì 6 phút, rồi tuần này bị `OOMKilled` lúc 2:47 sáng.

**Chẩn đoán:**

```sql
-- ① Khối lượng có tăng không?
SELECT date_trunc('month', created_at) AS thang, count(*)
FROM transactions GROUP BY 1 ORDER BY 1 DESC LIMIT 6;
--  2026-08  |  812043
--  2026-07  |  634211
--  2026-02  |  118402       ← tăng 7 lần trong 6 tháng
```

```java
// ② Job có dùng OFFSET không?
// grep -n "OFFSET\|setFirstResult" src/main/java/**/ReconciliationJob.java
//   → txRepository.findByDate(day, PageRequest.of(page++, 500))
//     ☠ Page 1.600 phải bỏ qua 800.000 dòng
```

```bash
# ③ Heap dump lúc job chạy
jcmd 1 GC.heap_dump /tmp/job.hprof
# MAT → StatefulPersistenceContext giữ 2,1 triệu entity
```

**Cách xử lý — ba sửa đổi, mỗi cái giải quyết một tầng:**

```java
// ① OFFSET → KEYSET
List<TxRow> chunk = txDao.findAfter(day, lastId, 500);
// SQL: WHERE created_at::date = ? AND id > ? ORDER BY id LIMIT 500

// ② Thêm flush + clear mỗi lô, mỗi lô một transaction riêng
// ③ Phần thuần chèn chuyển sang jdbcTemplate.batchUpdate()
```

**Kết quả đo được:** thời gian từ 40 phút xuống 3 phút 10 giây; heap đỉnh từ 1,9 GB xuống 180 MB.

**Chặn tái diễn — job phải tự báo khi nó xấu đi:**

```java
@Scheduled(cron = "0 0 2 * * *")
public void run() {
    long t0 = System.currentTimeMillis();
    int total = doReconcile();
    long ms = System.currentTimeMillis() - t0;

    meterRegistry.timer("job.reconciliation.duration").record(ms, MILLISECONDS);
    meterRegistry.gauge("job.reconciliation.records", total);

    // Chỉ số quan trọng nhất: THỜI GIAN TRÊN MỖI BẢN GHI
    // Nếu nó tăng → job có vấn đề về ĐỘ PHỨC TẠP, không phải về khối lượng
    double msPerRecord = (double) ms / total;
    if (msPerRecord > 0.5) {
        log.warn("Job chậm bất thường: {} ms/bản ghi — nghi N+1 hoặc OFFSET sâu",
                 msPerRecord);
    }
}
```

```yaml
- alert: JobChamDanTheoThoiGian
  expr: |
    job_reconciliation_duration_seconds
      / job_reconciliation_records > 0.0005
  for: 2h
  annotations:
    summary: "Thời gian mỗi bản ghi tăng — độ phức tạp xấu đi, không phải do khối lượng"
```

> **Tình huống 2:** Consumer Kafka có lag tăng đều 2.000 message/phút. Scale từ 3 lên 12 pod nhưng lag vẫn tăng.

**Chẩn đoán — scale không giúp vì nút thắt không nằm ở consumer:**

```bash
# ① Lag theo partition
kafka-consumer-groups --describe --group order-processor
#  PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
#  0          8421039         9284712         863673
#  1          8419922         9283201         863279
#  ...        (đều nhau trên mọi partition)
```

```text
   ⚠ LAG ĐỀU TRÊN MỌI PARTITION = nút thắt KHÔNG phải phân bố lệch.
     Nếu chỉ một partition lag → dữ liệu lệch khoá.
     Lag đều → mỗi message xử lý quá chậm.
```

```bash
# ② Số partition có đủ cho 12 pod không?
kafka-topics --describe --topic order-events
#  PartitionCount: 6          ← ☠ 6 partition, 12 pod
#  → 6 pod XỬ LÝ, 6 pod NGỒI KHÔNG.
#    Đây là lý do scale từ 6 lên 12 không cải thiện gì.
```

```sql
-- ③ Nút thắt thật ở đâu?
SELECT calls, round(mean_exec_time::numeric,2) AS tb_ms, left(query,50)
FROM pg_stat_statements ORDER BY calls DESC LIMIT 3;
--  184920384 | 0.31 | select ... from products where id = $1
--  184920384 | 0.28 | select ... from customers where id = $1
--   → 4 query mỗi message × 40.000 message/phút
```

**Cách xử lý:**

```text
   ① CHUYỂN SANG BATCH LISTENER (max-poll-records=500)
      → 4 query/message thành 4 query/500 message

   ② TĂNG SỐ PARTITION lên ≥ số pod
      kafka-topics --alter --topic order-events --partitions 24
      ⚠ Chỉ TĂNG được, không giảm. Và nó làm THAY ĐỔI PHÂN BỔ KHOÁ
        → message của cùng một khoá có thể sang partition khác
        → THỨ TỰ bị phá vỡ trong giai đoạn chuyển tiếp.
        → Phải lên kế hoạch, không làm bừa lúc đang sự cố.

   ③ GỬI THÔNG BÁO THEO LÔ thay vì từng cái
```

**Kết quả:** throughput từ 12.000 lên 380.000 message/phút; lag về 0 trong 20 phút.

**Chặn tái diễn:**

```yaml
- alert: ConsumerLagTang
  expr: |
    deriv(kafka_consumergroup_lag[15m]) > 0
      and kafka_consumergroup_lag > 50000
  for: 15m
  annotations:
    summary: "Lag đang TĂNG (không chỉ cao) — consumer không theo kịp producer"
```

```java
@Test
void consumer_xu_ly_500_message_khong_qua_10_query() {
    QueryCountHolder.clear();
    handler.handleBatch(generate(500));
    assertThat(QueryCountHolder.getGrandTotal().getTotal()).isLessThanOrEqualTo(10);
}
```

> **Tình huống 3:** Sau khi bật định tuyến replica, bộ phận CSKH báo *"khách sửa địa chỉ xong, tải lại trang thì vẫn thấy địa chỉ cũ, nhưng vài giây sau lại đúng"*.

**Chẩn đoán — đây là read-after-write kinh điển, không phải bug ứng dụng:**

```sql
-- Trên replica
SELECT now() - pg_last_xact_replay_timestamp();
--  00:00:00.284          ← trễ 284 ms
```

```text
   TRÌNH TỰ THỰC TẾ:
   t=0ms    POST /profile     → ghi PRIMARY, commit
   t=15ms   302 redirect
   t=40ms   GET /profile      → đọc REPLICA (mới trễ 284ms) → DỮ LIỆU CŨ
   t=300ms  người dùng F5     → replica đã bắt kịp → đúng

   → "Vài giây sau lại đúng" chính là CHỮ KÝ của replication lag.
     Không phải cache, không phải bug logic.
```

**Cách xử lý — làm cả hai:**

```java
// ① NGẮN HẠN: ghim primary 2 giây sau mỗi thao tác ghi của cùng người dùng
@Around("@annotation(org.springframework.transaction.annotation.Transactional)")
public Object markWriteIfNeeded(ProceedingJoinPoint pjp) throws Throwable {
    Object result = pjp.proceed();
    if (!isReadOnly(pjp)) {
        WriteAffinity.markWrite(currentUserId());     // lưu vào Redis, TTL 2s
    }
    return result;
}
```

```java
// ② DÀI HẠN (tốt hơn): API ghi trả về dữ liệu sau khi ghi
@PutMapping("/profile")
public ProfileView update(@RequestBody UpdateProfileRequest req) {
    Long id = profileCommandService.update(req);
    return profileCommandService.viewOf(id);    // ← đọc từ PRIMARY, cùng transaction
    // Client dùng luôn kết quả này, KHÔNG gọi GET nữa → vấn đề biến mất
}
```

**Chặn tái diễn:**

```java
@Test
void doc_ngay_sau_khi_ghi_phai_thay_du_lieu_moi() {
    Long id = commandService.update(req);
    ProfileView v = queryService.get(id);         // đi qua routing như production
    assertThat(v.address()).isEqualTo(req.address());
}
```

```yaml
- alert: ReplicationLagVuotNguongGhimPrimary
  expr: pg_replication_lag_seconds > 2      # phải KHỚP với TTL của WriteAffinity
  for: 1m
  annotations:
    summary: "Lag vượt cửa sổ ghim primary — người dùng sẽ thấy dữ liệu cũ"
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Bọc cả batch job trong một `@Transactional` | Chặn `VACUUM`, giữ snapshot, rollback mất trắng | Mỗi lô một transaction |
| Batch job dùng `OFFSET` | Chậm dần rồi treo — không ai biết vì chạy 2 giờ sáng | Keyset pagination |
| Không `clear()` Persistence Context | Dirty checking thành **O(n²)**, rồi OOM | `flush()` **rồi** `clear()` mỗi 500 |
| `clear()` trước `flush()` | **Mất trắng** thay đổi, không có exception | Đúng thứ tự |
| `GenerationType.IDENTITY` + batch insert | **Batch bị vô hiệu hoá lặng lẽ**, chậm 52 lần | `SEQUENCE` với `allocationSize` |
| `allocationSize` lệch `INCREMENT BY` | **Trùng khoá chính** khi chạy nhiều instance | Hai giá trị phải khớp |
| Bật `batch_size` nhưng không `order_inserts` | Đổi bảng liên tục → không gom lô được | Bật cả hai |
| Job không có checkpoint | Chết ở dòng 600.000 → chạy lại từ 0 | Lưu `lastProcessedId` mỗi lô |
| Consumer xử lý từng message | N+1 nhân với lưu lượng; lag tăng tới khi **mất message** | Batch listener |
| Scale pod > số partition | Pod thừa **ngồi không** | Số partition ≥ số pod |
| Batch listener không xử lý lỗi từng phần | Một message hỏng làm hỏng cả lô 500 | `BatchListenerFailedException` + DLQ |
| Consumer không idempotent | Kafka giao "ít nhất một lần" → **xử lý trùng** | Bảng `processed_events` |
| Xử lý lô song song không nhóm theo khoá | **Đảo thứ tự** sự kiện cùng một đơn | `groupingBy(orderId)` |
| Định tuyến mọi `readOnly` sang replica | **Read-after-write** — người dùng thấy dữ liệu cũ | Ghim primary sau ghi, hoặc trả dữ liệu từ lệnh ghi |
| Giám sát lag "cao" thay vì lag "đang tăng" | Cảnh báo muộn, hoặc báo động giả | `deriv()` trên lag |
| Chỉ giám sát tổng thời gian job | Không phân biệt "nhiều dữ liệu hơn" với "code xấu đi" | Đo **ms trên mỗi bản ghi** |

## Câu hỏi phỏng vấn hay gặp

**H: Batch job xử lý 800.000 bản ghi bị OOM, em xử lý thế nào?**
Có ba tầng chi phí chồng lên nhau và phải sửa cả ba. Tầng một là N+1 — nạp trước dữ liệu tra cứu vào `Map` thay vì query trong vòng lặp. Tầng hai là Persistence Context phình: 800.000 entity kèm snapshot là gần 4 GB, nên phải `flush()` rồi `clear()` mỗi 500 bản ghi, và **đúng thứ tự đó** vì `clear()` trước `flush()` sẽ mất trắng thay đổi mà không có exception nào. Tầng ba tinh vi hơn: mỗi lần flush Hibernate **duyệt toàn bộ** Persistence Context để tìm entity đã đổi, nên dirty checking thành **O(n²)** — đây chính là lý do job chạy tốt với 50.000 dòng nhưng treo ở 500.000. Với phần thuần ghi thì em dùng `StatelessSession` hoặc `jdbcTemplate.batchUpdate()`, bỏ hẳn Persistence Context.

**H: Vì sao bật `hibernate.jdbc.batch_size` mà không thấy nhanh lên?**
Nguyên nhân phổ biến nhất là entity dùng `GenerationType.IDENTITY`. `IDENTITY` nghĩa là database sinh ID lúc `INSERT`, mà Hibernate **bắt buộc** phải biết ID ngay sau `persist()` để đưa vào Persistence Context — nên nó phải chạy `INSERT` ngay lập tức cho từng bản ghi. Batch insert bị vô hiệu hoá về mặt kỹ thuật, và **Hibernate không cảnh báo gì cả**. Cách chữa là chuyển sang `SEQUENCE` với `allocationSize`, nhớ để `allocationSize` khớp `INCREMENT BY` của sequence nếu không sẽ trùng khoá chính khi chạy nhiều instance. Nguyên nhân thứ hai là quên bật `order_inserts` — nếu câu lệnh đổi bảng liên tục thì JDBC không gom lô được vì nó chỉ gom các câu giống nhau. Em đo chèn 100.000 bản ghi: `IDENTITY` mất 94 giây, `SEQUENCE` + batch mất 3,1 giây, `batchUpdate` mất 1,8 giây.

**H: Vì sao không nên bọc cả batch job trong một transaction?**
Vì một transaction giữ 800.000 dòng trong 40 phút gây bốn vấn đề: nó **chặn `VACUUM`** nên bảng phình; nó giữ một snapshot cũ khiến mọi truy vấn khác phải đọc qua nhiều phiên bản dòng hơn; nó giữ kết nối ở trạng thái `idle in transaction`; và nếu lỗi ở phút thứ 39 thì **mất trắng toàn bộ**. Em làm mỗi lô một transaction riêng, kèm checkpoint lưu `lastProcessedId` sau mỗi lô để job chết ở dòng 600.000 thì chạy lại từ 600.000 chứ không phải từ đầu.

**H: Consumer Kafka bị lag, scale pod lên gấp đôi mà không cải thiện, vì sao?**
Hai khả năng và phải kiểm tra cả hai. Thứ nhất, **số pod vượt số partition** — Kafka chỉ cho một consumer trong nhóm đọc một partition, nên 12 pod trên 6 partition nghĩa là 6 pod ngồi không. Thứ hai và thường gặp hơn: nút thắt nằm ở **số query mỗi message**, không phải ở năng lực consumer. Nếu mỗi message chạy 4 query thì scale pod chỉ nhân số query lên chứ không giải quyết gì. Cách chữa là chuyển sang batch listener: gom `max-poll-records=500`, nạp mọi ID cần tra cứu trong một lượt, thì 2.000 query thành 4 query. Dấu hiệu phân biệt là **lag đều trên mọi partition** — nếu lệch thì là vấn đề phân bố khoá, còn đều thì là mỗi message xử lý quá chậm.

**H: Chuyển consumer sang xử lý lô cần lưu ý gì?**
Ba điều. **Xử lý lỗi từng phần** — dùng `BatchListenerFailedException` để Spring biết chính xác message nào hỏng và chỉ đẩy message đó vào DLQ, không làm hỏng cả lô 500. **Idempotent** — Kafka đảm bảo "ít nhất một lần" nên message sẽ bị lặp, em kiểm tra bảng `processed_events` bằng một query cho cả lô. Và **giữ thứ tự trong cùng một khoá** — Kafka chỉ đảm bảo thứ tự trong một partition, nên nếu xử lý lô song song mà không nhóm theo `orderId` thì hai sự kiện của cùng một đơn có thể bị đảo, dẫn tới trạng thái sai. Đánh đổi phải nói rõ với đội là `fetch-max-wait` khiến message chờ tới nửa giây trước khi được xử lý — chấp nhận được với xử lý bất đồng bộ, không chấp nhận được với luồng cần phản hồi tức thì.

**H: Định tuyến readOnly sang replica có rủi ro gì?**
Read-after-write. Người dùng bấm "Lưu" thì ghi vào primary, nhưng request tiếp theo đọc từ replica đang trễ vài trăm mili giây nên thấy dữ liệu cũ — rồi vài giây sau F5 lại thấy đúng, và "vài giây sau lại đúng" chính là chữ ký của replication lag chứ không phải bug cache. Em xử lý hai lớp. Ngắn hạn là **ghim primary khoảng 2 giây** sau mỗi thao tác ghi của cùng người dùng, lưu mốc vào Redis theo `userId` chứ không phải `ThreadLocal` vì có nhiều instance. Dài hạn và tốt hơn là **API ghi trả luôn dữ liệu sau khi ghi**, để client không cần gọi `GET` nữa — cách này **xoá bỏ** vấn đề thay vì xử lý nó. Quan trọng là ngưỡng alert cho lag phải **khớp với cửa sổ ghim primary**, nếu lag vượt 2 giây thì cơ chế ghim không còn bảo vệ được.

**H: Ba bài toán này có liên quan gì tới nhau không?**
Có, và đây là điều dễ bỏ sót. Batch job hàng đêm sinh khối lượng WAL lớn khiến **replica không theo kịp**, nên độ trễ nhân bản tăng vọt lúc rạng sáng — và màn hình của người dùng đầu tiên vào buổi sáng hiện dữ liệu cũ. Tương tự, một truy vấn export chạy lâu trên replica sẽ **chặn việc áp dụng WAL** (`max_standby_streaming_delay` của PostgreSQL) và làm mọi người khác thấy dữ liệu cũ. Nên khi điều tra replication lag, em luôn kiểm tra xem có job nặng hay truy vấn dài nào đang chạy không, chứ không chỉ nhìn vào cấu hình replica.

## Tóm tắt bài 10

- Batch job có **ba tầng chi phí**: N+1, Persistence Context phình, và **dirty checking O(n²)** — tầng ba giải thích vì sao job chạy tốt với 50.000 dòng nhưng treo ở 500.000.
- `flush()` **rồi** `clear()` mỗi 500 bản ghi. Sai thứ tự = **mất dữ liệu im lặng**.
- **`GenerationType.IDENTITY` vô hiệu hoá batch insert** một cách lặng lẽ — chậm gấp **52 lần**. Dùng `SEQUENCE` với `allocationSize` khớp `INCREMENT BY`.
- Bật `batch_size` phải kèm **`order_inserts`/`order_updates`**, nếu không câu lệnh đổi bảng liên tục và không gom lô được.
- Batch job: **keyset không offset**, **mỗi lô một transaction**, **checkpoint sau mỗi lô**, và **không bao giờ bọc cả job trong một `@Transactional`**.
- Consumer Kafka: N+1 **nhân với lưu lượng**, và nó âm thầm tụt hậu tới khi vượt retention thì **mất message**.
- Batch listener giảm query **500 lần**; đổi lại cần **xử lý lỗi từng phần**, **idempotent**, và **nhóm theo khoá để giữ thứ tự**.
- **Số pod không được vượt số partition** — pod thừa ngồi không. Lag **đều** trên mọi partition = mỗi message chậm; lag **lệch** = phân bố khoá lệch.
- Định tuyến replica gây **read-after-write**. Chữa bằng ghim primary sau ghi, hoặc tốt hơn là **API ghi trả luôn dữ liệu**.
- Đo **ms trên mỗi bản ghi**, không chỉ đo tổng thời gian — để phân biệt "nhiều dữ liệu hơn" với "code xấu đi".
- **Ba bài toán không độc lập**: job đêm và export dài làm replica trễ, khiến màn hình sáng hôm sau hiện dữ liệu cũ.

**Quay lại** → [Bài 9: Bốn bài toán đọc kinh điển](09-bon-bai-toan-doc-kinh-dien.md)

**Về mục lục** → [README khoá học](README.md)

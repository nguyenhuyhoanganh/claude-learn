# Case 5: Read replica và replication lag — đọc phải dữ liệu vừa ghi

Bạn thêm read replica để giảm tải database chính. Latency giảm, mọi thứ tuyệt vời. Rồi bộ phận chăm sóc khách hàng báo:

```text
   "Khách hàng đổi số điện thoại, bấm Lưu, thấy thông báo thành công,
    nhưng trang hiện ra vẫn là số cũ. Họ sửa lại 3 lần rồi gọi lên phàn nàn."
```

Không có lỗi nào trong log. Dữ liệu trong database hoàn toàn đúng. Nhưng người dùng thấy sai.

## Cơ chế: replication lag

**Replication (nhân bản)** — sao chép dữ liệu từ node chính (primary/master) sang các node phụ (replica/standby/slave).

```text
   [App] ── ghi ──→ [PRIMARY] ── luồng WAL/binlog ──→ [REPLICA 1]
                        │                          └─→ [REPLICA 2]
                        │
   [App] ── đọc ────────┼──────────────────────────→ [REPLICA 1]
```

Sao chép **không tức thời**. Có độ trễ:

```text
   t=0 ms    : App ghi "phone=0912345678" vào PRIMARY
   t=1 ms    : PRIMARY commit, trả về "thành công" cho App
   t=2 ms    : App chuyển hướng, đọc lại từ REPLICA
   t=2 ms    : REPLICA vẫn chưa nhận được thay đổi → trả về SỐ CŨ
   t=15 ms   : REPLICA nhận và áp dụng thay đổi

   ⇒ Trong 13 mili-giây đó, người dùng thấy dữ liệu cũ.
```

Trong điều kiện bình thường, lag chỉ vài mili-giây. Nhưng nó có thể tăng lên hàng phút:

| Nguyên nhân lag tăng | Mức độ điển hình |
|---|---|
| Ghi ồ ạt trên primary (batch import) | Vài giây đến vài phút |
| Replica chạy query nặng (báo cáo) | Vài giây |
| Mạng giữa các vùng địa lý | 50-200 ms cơ bản |
| Replica cấu hình yếu hơn primary | Tích luỹ dần |
| Transaction dài trên replica (PostgreSQL) | Có thể tạm dừng replay |
| Khoá xung đột khi replay (PostgreSQL) | Vài giây |

## Ba mức đảm bảo nhất quán

Hiểu ba khái niệm này giúp bạn nói chuyện chính xác với đồng nghiệp:

| Mức | Nghĩa | Ví dụ vi phạm |
|---|---|---|
| **Eventual consistency** | Cuối cùng mọi replica sẽ giống nhau | Đọc thấy dữ liệu cũ |
| **Read-your-own-writes** | Bạn luôn thấy được thay đổi của **chính mình** | Sửa số điện thoại xong vẫn thấy số cũ |
| **Monotonic reads** | Đọc lần sau không được cũ hơn lần trước | Refresh trang thấy dữ liệu "quay ngược thời gian" |

Vi phạm **monotonic reads** đặc biệt khó chịu và hay bị bỏ qua:

```text
   Request 1 → Replica A (lag 5 ms)  → thấy comment mới
   Request 2 → Replica B (lag 3 giây) → comment BIẾN MẤT
   Request 3 → Replica A              → comment xuất hiện lại

   Người dùng: "App này bị lỗi gì vậy?"
```

## Bảy giải pháp, theo độ mạnh

### 1. Ghi xong thì đọc từ primary trong một khoảng thời gian

Đơn giản và hiệu quả nhất cho vấn đề read-your-own-writes:

```java
@Component
public class ReadWriteRouter {
    private static final Duration STICKY = Duration.ofSeconds(5);

    public void markWrite(String userId) {
        redis.set("recent-write:" + userId, "1", STICKY);
    }

    public boolean shouldReadPrimary(String userId) {
        return redis.hasKey("recent-write:" + userId);
    }
}
```

```java
@Transactional
public void updateProfile(String userId, ProfileRequest req) {
    userRepository.save(...);
    readWriteRouter.markWrite(userId);      // 5 giây tới, đọc từ primary
}
```

```text
   Người dùng vừa ghi     → đọc từ primary (luôn đúng)
   Người dùng khác        → đọc từ replica (giảm tải)

   ⇒ Với hệ thống mà tỉ lệ ghi thấp, 95%+ lượt đọc vẫn đi vào replica.
```

Đây thường là giải pháp tốt nhất về tỉ lệ hiệu quả trên công sức.

### 2. Định tuyến theo loại thao tác — nền tảng của mọi cách

```java
@Configuration
public class DataSourceConfig {

    @Bean
    public DataSource routingDataSource(
            @Qualifier("primary") DataSource primary,
            @Qualifier("replica") DataSource replica) {

        AbstractRoutingDataSource router = new AbstractRoutingDataSource() {
            @Override
            protected Object determineCurrentLookupKey() {
                return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                    ? "replica" : "primary";
            }
        };
        router.setTargetDataSources(Map.of("primary", primary, "replica", replica));
        router.setDefaultTargetDataSource(primary);
        return router;
    }
}
```

```java
@Transactional(readOnly = true)      // → tự động đi vào replica
public List<Product> search(String keyword) { ... }

@Transactional                        // → đi vào primary
public Order createOrder(...) { ... }
```

Chỉ cần đánh dấu `readOnly = true` đúng chỗ. Nhưng cẩn thận: **mọi thứ trong transaction readOnly sẽ đọc replica**, kể cả những chỗ cần dữ liệu mới nhất.

### 3. Phân loại theo yêu cầu độ tươi của dữ liệu

Cách rõ ràng và dễ suy luận nhất — quyết định tường minh cho từng truy vấn:

```java
public enum Freshness {
    STRONG,      // bắt buộc mới nhất → primary
    BOUNDED,     // chấp nhận cũ tối đa N giây → replica có kiểm tra lag
    EVENTUAL     // sao cũng được → replica bất kỳ
}
```

| Loại dữ liệu | Mức yêu cầu | Đọc từ |
|---|---|---|
| Số dư tài khoản trước khi trừ | STRONG | Primary |
| Tồn kho trước khi bán | STRONG | Primary |
| Hồ sơ vừa được chính mình sửa | STRONG | Primary |
| Danh sách đơn hàng của tôi | BOUNDED (5s) | Replica |
| Tìm kiếm sản phẩm | EVENTUAL | Replica |
| Báo cáo, thống kê | EVENTUAL | Replica chuyên dụng |
| Trang chi tiết sản phẩm | EVENTUAL | Replica + cache |

Bài tập đáng làm: liệt kê các truy vấn chính trong hệ thống và gán mức cho từng cái. Bạn sẽ ngạc nhiên vì bao nhiêu truy vấn thực ra chỉ cần EVENTUAL.

### 4. Kiểm tra lag trước khi đọc

```java
public DataSource selectForRead(Duration maxLag) {
    Duration lag = replicaLagMonitor.currentLag();
    return lag.compareTo(maxLag) <= 0 ? replicaDataSource : primaryDataSource;
}
```

```sql
-- PostgreSQL: đo lag trên replica
SELECT EXTRACT(EPOCH FROM (now() - pg_last_xact_replay_timestamp())) AS lag_seconds;

-- MySQL
SHOW REPLICA STATUS;    -- cột Seconds_Behind_Source
```

Khi lag vượt ngưỡng, tự động chuyển toàn bộ đọc về primary. Đây là cơ chế bảo vệ tự động — nếu replica tụt hậu vì bất kỳ lý do gì, hệ thống vẫn đúng (chỉ chậm hơn).

Nhớ cảnh báo khi lag cao:

```promql
pg_replication_lag_seconds > 10
```

### 5. Đợi replica bắt kịp (LSN / GTID)

Cách chính xác nhất: ghi xong lấy vị trí trong log, đọc thì đợi replica tới vị trí đó.

```java
@Transactional
public void updateProfile(...) {
    userRepository.save(...);
    String lsn = jdbcTemplate.queryForObject(
        "SELECT pg_current_wal_lsn()::text", String.class);
    requestContext.setWriteLsn(lsn);      // truyền qua header/session
}

public User getProfile(String userId, String writeLsn) {
    if (writeLsn != null) {
        // Đợi replica bắt kịp, tối đa 500 ms
        Boolean ok = replicaJdbc.queryForObject(
            "SELECT pg_wal_lsn_diff(pg_last_wal_replay_lsn(), ?::pg_lsn) >= 0",
            Boolean.class, writeLsn);
        if (!Boolean.TRUE.equals(ok)) {
            return primaryJdbc.query(...);       // chưa kịp → đọc primary
        }
    }
    return replicaJdbc.query(...);
}
```

Chính xác nhưng phức tạp: phải truyền LSN qua các tầng (header HTTP, session, hoặc cookie). Chỉ dùng khi thật sự cần độ chính xác cao mà vẫn muốn tận dụng replica.

MySQL có cơ chế tương đương với GTID:

```sql
SELECT WAIT_FOR_EXECUTED_GTID_SET('uuid:1-1234', 0.5);
```

### 6. Nhân bản đồng bộ (synchronous replication)

```sql
-- PostgreSQL: primary chờ replica xác nhận trước khi commit
ALTER SYSTEM SET synchronous_commit = 'on';
ALTER SYSTEM SET synchronous_standby_names = 'ANY 1 (replica1, replica2)';
```

Lag về 0, nhưng cái giá rất đắt:

```text
   Latency ghi = latency mạng tới replica + thời gian replica ghi đĩa
   Cùng datacenter : +1-3 ms
   Khác vùng địa lý: +50-200 ms

   Và: nếu replica chết, PRIMARY CŨNG DỪNG GHI (chờ xác nhận không bao giờ tới)
   ⇒ Giảm khả dụng thay vì tăng.
```

`ANY 1` (chờ bất kỳ một replica nào) an toàn hơn `FIRST 1` — nếu một replica chết, replica kia vẫn xác nhận được.

Chỉ dùng nhân bản đồng bộ cho dữ liệu tài chính hoặc khi mất dữ liệu là không thể chấp nhận. Với đa số nghiệp vụ, mất vài trăm mili-giây dữ liệu cuối khi primary sập là chấp nhận được.

### 7. Che giấu ở tầng giao diện

Giải pháp rẻ nhất và hay bị quên: **đừng đọc lại**.

```javascript
// Thay vì: gửi PUT rồi GET lại
await api.updateProfile(data);
const fresh = await api.getProfile();     // ← có thể đọc replica cũ
setProfile(fresh);

// Dùng: server trả về trạng thái mới ngay trong response của PUT
const updated = await api.updateProfile(data);
setProfile(updated);                       // ← không cần đọc lại
```

Rất nhiều vấn đề read-your-own-writes biến mất chỉ bằng cách **API trả về trạng thái sau khi ghi**. Đây nên là thiết kế mặc định của mọi endpoint ghi.

## Bảng so sánh

| Giải pháp | Độ chính xác | Độ phức tạp | Giảm tải primary |
|---|---|---|---|
| Trả về trạng thái trong response ghi | Cao (cho trường hợp cụ thể) | **Rất thấp** | Cao |
| Sticky primary sau khi ghi | Cao | Thấp | Cao (95%+) |
| `@Transactional(readOnly)` | Trung bình | **Rất thấp** | Cao |
| Phân loại theo độ tươi | Cao | Trung bình | Cao |
| Kiểm tra lag | Cao | Trung bình | Trung bình |
| Đợi LSN/GTID | **Rất cao** | Cao | Cao |
| Nhân bản đồng bộ | **Tuyệt đối** | Thấp (cấu hình) | Cao nhưng **latency ghi tăng** |

**Khuyến nghị kết hợp**: trả về trạng thái trong response ghi (mặc định) + sticky primary 5 giây + kiểm tra lag để tự bảo vệ. Ba cái này rẻ và giải quyết 95% vấn đề.

## Các bẫy khác của read replica

### Bẫy 1: Replica dùng để backup và để phục vụ đọc

```text
   Replica chạy pg_dump lúc 2 giờ sáng
   ⇒ I/O bão hoà, replay chậm lại
   ⇒ Lag tăng lên 15 phút
   ⇒ Người dùng thấy dữ liệu cũ 15 phút
```

Tách riêng: replica cho backup, replica cho đọc. Đừng dùng chung.

### Bẫy 2: Query báo cáo trên replica gây xung đột replay

Ở PostgreSQL, một query dài trên replica có thể xung đột với việc replay WAL:

```text
   ERROR: canceling statement due to conflict with recovery
```

Hai lựa chọn:

```sql
-- Cách A: cho phép replica trễ để query chạy xong
ALTER SYSTEM SET max_standby_streaming_delay = '30s';

-- Cách B: replica báo ngược cho primary biết đang có query dài
ALTER SYSTEM SET hot_standby_feedback = on;
```

Cách B ngăn được xung đột nhưng **khiến primary không VACUUM được** những dòng mà replica còn cần — dẫn tới bloat trên primary (phase-3 case 2). Đánh đổi thật, phải chọn có ý thức.

### Bẫy 3: Failover và mất dữ liệu

Khi primary chết và một replica được nâng lên làm primary mới:

```text
   Primary chết lúc t=100
   Replica mới nhất đã nhận tới t=98
   ⇒ MẤT 2 đơn vị thời gian dữ liệu (những giao dịch đã commit
     trên primary nhưng chưa kịp gửi sang replica)
```

Đây là lý do có nhân bản đồng bộ. Với nhân bản bất đồng bộ, bạn phải chấp nhận **RPO (Recovery Point Objective) > 0** — có thể mất vài trăm mili-giây tới vài giây dữ liệu cuối.

Và cạm bẫy nguy hiểm hơn: **split-brain** — primary cũ sống lại và tưởng mình vẫn là primary, trong khi replica đã được nâng cấp. Hai node cùng nhận ghi → dữ liệu phân kỳ. Cần cơ chế **fencing** (chặn node cũ) trong công cụ quản lý failover (Patroni, Orchestrator, RDS Multi-AZ).

### Bẫy 4: Kết nối tới replica đã bị nâng cấp thành primary

Sau failover, ứng dụng vẫn giữ kết nối cũ tới địa chỉ cũ. Cần:

- Dùng **DNS/endpoint có failover tự động** (RDS reader endpoint) hoặc **proxy** (PgBouncer, ProxySQL, HAProxy).
- Đặt `max-lifetime` cho connection pool để kết nối được làm mới định kỳ (phase-2 case 2).

## Giám sát

```promql
# Lag của từng replica
pg_replication_lag_seconds{instance="replica-1"}

# Tỉ lệ truy vấn đi vào replica (mục tiêu > 70%)
rate(db_queries_total{target="replica"}[5m]) / rate(db_queries_total[5m])

# Số lần fallback về primary vì lag cao
rate(replica_fallback_total[5m])
```

Ba cảnh báo cần có:

| Cảnh báo | Ngưỡng | Ý nghĩa |
|---|---|---|
| Lag cao | > 10 giây | Người dùng thấy dữ liệu cũ |
| Replica ngắt kết nối | `pg_stat_replication` thiếu node | Mất khả năng chịu lỗi |
| Tỉ lệ đọc replica thấp | < 50% | Đang lãng phí replica |

Cảnh báo thứ ba hay bị bỏ qua: nhiều đội dựng replica xong mà 90% truy vấn vẫn đi vào primary vì quên đánh dấu `readOnly`. Tiền bỏ ra không mang lại gì.

## Trường hợp thực tế: mạng xã hội nội bộ

Bối cảnh: primary PostgreSQL quá tải, tỉ lệ đọc/ghi là 95/5.

**Bước 1** — thêm 2 replica, định tuyến bằng `@Transactional(readOnly = true)`:

```text
   Tải primary: 100% → 22%
   Nhưng: 47 báo cáo lỗi/ngày về "dữ liệu không cập nhật"
```

**Bước 2** — thêm sticky primary 5 giây sau khi ghi:

```text
   Báo cáo lỗi: 47 → 3/ngày
   Tải primary: 22% → 28%  (chấp nhận được)
```

**Bước 3** — sửa API để trả về trạng thái sau khi ghi:

```text
   Báo cáo lỗi: 3 → 0/ngày
```

**Bước 4** — thêm kiểm tra lag tự động:

```text
   Trong đợt nhập dữ liệu hàng loạt (lag lên 40 giây),
   hệ thống tự chuyển đọc về primary. Người dùng không nhận ra gì.
```

Tổng kết: primary chỉ còn 28% tải, không còn báo cáo lỗi, và hệ thống tự bảo vệ khi lag tăng.

Điều đội tiếc nhất: **bước 3 lẽ ra nên làm đầu tiên** — nó rẻ nhất, hiệu quả nhất, và nếu làm trước thì bước 2 có thể không cần thiết.

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Đọc lại từ replica ngay sau khi ghi | Người dùng thấy dữ liệu cũ |
| Không kiểm tra lag | Lag 15 phút mà vẫn đọc replica |
| Dùng chung replica cho backup và phục vụ đọc | Backup làm lag tăng vọt |
| `hot_standby_feedback = on` mà không theo dõi bloat | Primary phình dần |
| Nhân bản đồng bộ với `FIRST 1` | Replica chết là primary dừng ghi |
| Không có fencing khi failover | Split-brain, dữ liệu phân kỳ |
| Quên đánh dấu `readOnly` | Replica ngồi không, tiền bỏ phí |
| Kiểm tra tồn kho/số dư trên replica | **Bán quá kho, chi quá số dư** |

Bẫy cuối cùng là bẫy nghiêm trọng nhất về mặt nghiệp vụ: **mọi kiểm tra ràng buộc trước khi ghi đều phải đọc từ primary**. Đọc tồn kho từ replica rồi quyết định bán là công thức chắc chắn để bán quá số lượng.

## Tóm tắt case 5

- Replica có **lag** — bình thường vài mili-giây, nhưng có thể lên hàng phút khi ghi ồ ạt hoặc replica bận.
- Ba mức nhất quán cần phân biệt: **eventual, read-your-own-writes, monotonic reads**.
- Giải pháp rẻ nhất và nên làm đầu tiên: **API ghi trả về trạng thái mới**, không đọc lại.
- Tiếp theo: **sticky primary 5 giây** sau khi ghi — giữ được 95%+ lượt đọc trên replica.
- **Luôn có kiểm tra lag** để tự động chuyển về primary khi replica tụt hậu.
- Nhân bản đồng bộ cho nhất quán tuyệt đối, nhưng **tăng latency ghi và giảm khả dụng**.
- Tách replica cho backup và replica phục vụ đọc.
- **Mọi kiểm tra ràng buộc trước khi ghi (tồn kho, số dư) phải đọc từ primary.**

**Bài kế tiếp** → [Case 6: Sharding — chia database và những gì bạn mất](06-case-sharding.md)

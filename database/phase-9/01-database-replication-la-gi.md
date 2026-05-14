# Bài 1: Database Replication là gì?

## Vấn đề: Single Point of Failure

Khi chỉ có một database server:
```
Client → [Database Server] ← Toàn bộ phụ thuộc vào 1 server này

Vấn đề:
  - Server down → Toàn bộ ứng dụng down
  - Server quá tải (nhiều reads) → Chậm cho tất cả
  - Server ở US → Users ở Asia phải chờ ~200ms mỗi query
  - Backup khó: Phải lock hoặc accept inconsistency
```

**Giải pháp:** Database Replication - nhân bản database ra nhiều instances.

---

## Replication là gì?

**Database Replication** là quá trình chia sẻ và đồng bộ dữ liệu giữa nhiều database instances để đảm bảo:
- **Reliability**: Một instance down, các instance khác vẫn hoạt động
- **Fault tolerance**: Không có single point of failure
- **Accessibility**: Users ở nhiều regions có thể đọc từ server gần nhất

```
Mô hình cơ bản:

              ┌────────────┐
    Writes →  │   Master   │  ← Primary node
              │  (Leader)  │
              └──────┬─────┘
                     │  Replication
         ┌───────────┼───────────┐
         ▼           ▼           ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Standby 1│ │ Standby 2│ │ Standby 3│
   │ (Asia)   │ │ (Europe) │ │ (US)     │
   └──────────┘ └──────────┘ └──────────┘
     ↑ Reads      ↑ Reads      ↑ Reads
```

---

## Master/Standby Replication (Phổ biến nhất)

### Cách hoạt động

```
1. Client ghi vào Master (và CHỈ Master)
   → INSERT, UPDATE, DELETE, CREATE TABLE...

2. Master sync changes sang Standby nodes
   → Qua WAL (Write-Ahead Log)
   → TCP connection liên tục giữa master và standby

3. Client đọc từ Master HOẶC bất kỳ Standby nào
   → Master: Luôn có data mới nhất
   → Standby: Có thể hơi trễ (eventual consistency)
```

### Ưu điểm của Master/Standby

```
Đơn giản:
  → Không có write conflicts
  → 1 nguồn sự thật (Master)
  → Database quản lý đồng bộ tự động

Scale reads:
  → 80% workload thường là reads
  → Thêm standby = thêm read capacity

Geographic distribution:
  → Standby ở US, EU, Asia
  → Users đọc từ server gần nhất
  → Latency giảm đáng kể
```

---

## Multi-Master Replication

**Multi-master** cho phép **nhiều nodes đều nhận writes**.

```
┌──────────────┐    Sync     ┌──────────────┐
│   Master 1   │ ←────────→  │   Master 2   │
│   (US)       │             │   (Europe)   │
└──────────────┘             └──────────────┘
       ↑                            ↑
    Writes                       Writes
```

### Vấn đề: Write Conflicts

```
T1 (US Master):     UPDATE users SET balance = 500 WHERE id = 1;
T2 (EU Master):     UPDATE users SET balance = 300 WHERE id = 1;

→ Cả hai commit gần như đồng thời
→ Giá trị cuối là gì? 500 hay 300?
→ CONFLICT! Ai thắng?

Phải có conflict resolution strategy:
  - Last Write Wins (LWW): Timestamp quyết định
  - Custom merge logic
  - Application-level conflict resolution
```

**Khuyến nghị:** Tránh multi-master khi có thể. Conflict resolution cực kỳ phức tạp. Ưu tiên tối ưu writes trên single master + nhiều standbys cho reads.

---

## Synchronous vs Asynchronous Replication

### Synchronous Replication

```
Client gửi write request
         │
         ▼
    [Master DB]
         │ Commit locally
         │
    Sync to Standby(s)
         │
         │ Wait for ACK...
         │ ← Standby ACK!
         │
    Return success to client
```

```sql
-- PostgreSQL: Cấu hình synchronous standby
-- Trong postgresql.conf trên Master:
synchronous_standby_names = 'FIRST 1 (standby1, standby2)'
-- → Phải được ACK bởi ít nhất 1 trong 2 standbys trước khi commit
```

**Ưu điểm:** Không mất data nếu master fail  
**Nhược điểm:** Latency tăng (phải chờ standby ACK)

### Asynchronous Replication (Mặc định PostgreSQL)

```
Client gửi write request
         │
         ▼
    [Master DB]
         │ Commit locally
         │
    Return success to client ← Ngay lập tức!
         │
    (Background job sync to standby)
```

**Ưu điểm:** Write latency thấp  
**Nhược điểm:** Có thể mất data nếu master fail trước khi sync xong

### So sánh

```
┌─────────────────┬────────────────────┬────────────────────┐
│ Tiêu chí        │ Synchronous        │ Asynchronous       │
├─────────────────┼────────────────────┼────────────────────┤
│ Data safety     │ ✅ Không mất data   │ ❌ Có thể mất data  │
│ Write latency   │ ❌ Chậm hơn         │ ✅ Nhanh hơn        │
│ Consistency     │ ✅ Luôn consistent  │ ❌ Eventual         │
│ Standby offline │ ❌ Write bị block   │ ✅ Write vẫn OK     │
│ Use case        │ Banking, critical  │ Analytics, social  │
└─────────────────┴────────────────────┴────────────────────┘
```

---

## WAL - Cơ Chế Đằng Sau Replication

**Write-Ahead Log (WAL)** là file ghi lại tất cả changes trong database, được dùng cho cả durability và replication.

```
Quy trình replication qua WAL:

1. Client insert row
2. Master ghi WAL entry trước khi ghi vào heap
3. WAL được stream sang Standby
4. Standby apply WAL entries → "Replay" transactions
5. Standby's data = Master's data (với độ trễ nhỏ)
```

```
WAL entry ví dụ:
  LSN=0/1234ABC  Type=INSERT  Table=orders  Row=(...data...)
  LSN=0/1234ABD  Type=UPDATE  Table=users   Row=id=1,balance=500
  LSN=0/1234ABE  Type=DELETE  Table=logs    Row=id=99
```

**Lợi ích:** Standby không cần full table scan; chỉ cần apply WAL từ vị trí cuối cùng.

---

## Ưu và Nhược điểm của Replication

### Ưu điểm

```
1. Horizontal Read Scaling:
   → Thêm standby = thêm read capacity
   → Không cần upsize master server

2. High Availability:
   → Master down → Promote standby lên làm master mới
   → Downtime tính bằng giây/phút, không phải giờ

3. Geographic Distribution:
   → Standby ở nhiều regions
   → Reads latency giảm 10-100x cho users ở xa

4. Backup không gián đoạn:
   → Backup từ Standby, không ảnh hưởng Master
   → Không cần lock Master để backup

5. Analytics workloads:
   → Queries phân tích nặng → Chạy trên Standby
   → Không ảnh hưởng production reads/writes
```

### Nhược điểm

```
1. Eventual Consistency:
   → Standby có thể trễ vài giây/phút
   → Đọc từ Standby: Không đảm bảo data mới nhất
   
   Ví dụ:
     User update profile → Ghi vào Master
     User ngay lập tức GET profile → Đọc từ Standby
     → Thấy profile cũ! (Chưa sync)
   
   Giải pháp: "Read your own writes" → Route writes/immediate reads to Master

2. Writes vẫn là bottleneck:
   → Tất cả writes phải đi qua 1 Master
   → Nếu write-heavy workload: Replication không giải quyết được
   → Cần xem xét Sharding hoặc tối ưu writes

3. Slow writes (Synchronous mode):
   → Phải chờ standby ACK
   → Với nhiều standbys ở xa: Latency tăng

4. Complexity:
   → Setup và maintain replication
   → Failover process
   → Monitoring replication lag
   → Schema changes cần apply trên tất cả nodes
```

---

## Replication Lag - Vấn đề Quan Trọng

**Replication lag** = Độ trễ giữa Master và Standby

```sql
-- Kiểm tra replication lag trong PostgreSQL
SELECT 
    client_addr,
    application_name,
    state,
    sent_lsn,
    replay_lsn,
    (sent_lsn - replay_lsn) AS bytes_behind,
    sync_state
FROM pg_stat_replication;
```

```
Replication lag có thể tăng do:
  - Standby chậm (CPU, I/O bound)
  - Network latency cao (cross-region)
  - Heavy write workload trên Master
  - Lock contention trên Standby

Monitoring thường xuyên:
  → Alert nếu lag > X seconds
  → Investigate nguyên nhân ngay
```

---

## Khi nào dùng Replication?

```
✅ Nên dùng khi:
  - Cần High Availability (HA)
  - Read-heavy workload (> 60% reads)
  - Cần geographic distribution
  - Cần backup không gián đoạn
  - Analytics queries ảnh hưởng production

❌ Không giải quyết được:
  - Write-heavy workload bottleneck → Cần Sharding
  - Dataset quá lớn → Cần Partitioning
  - Single server capacity → Cần Vertical Scale trước

Thứ tự nên thử:
  Optimize queries → Indexing → Partitioning → Replication → Sharding
```

---

**Tiếp theo:** 02-replication-demo-postgres.md →

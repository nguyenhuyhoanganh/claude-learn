# Bài 3: CAP Theorem - Giới Hạn Của Distributed Systems

## Giới thiệu

**CAP Theorem** (hay Brewer's Theorem, 2000) là một trong những lý thuyết quan trọng nhất trong distributed systems. Nó giải thích **tại sao không thể có tất cả mọi thứ** khi thiết kế distributed database.

---

## 1. Ba Tính Chất CAP

### C - Consistency (Nhất quán)

```
Consistency trong CAP ≠ Consistency trong ACID!

CAP Consistency (Strong Consistency):
  Mọi node trong cluster đều trả về cùng một giá trị
  tại mọi thời điểm.

  Node 1: x = 5
  Node 2: x = 5  ← Luôn luôn giống Node 1

Ví dụ vi phạm Consistency:
  Write x=5 lên Node 1
  Node 2 chưa sync
  Read từ Node 2: x=3 (giá trị cũ!)
  → Not consistent!
```

### A - Availability (Sẵn sàng)

```
Mọi request đến bất kỳ node nào cũng được trả lời
(không bị timeout hay error), kể cả khi một số nodes bị down.

Ví dụ:
  3 nodes: A, B, C
  Node C bị down
  Request đến A → Vẫn được trả lời ✅
  Request đến B → Vẫn được trả lời ✅

Vi phạm Availability:
  Node C bị down
  Request đến A → Error "Cannot connect to all nodes" ❌
```

### P - Partition Tolerance (Chịu phân vùng)

```
Network partition = Một số nodes không thể liên lạc với nhau
(network failure, không phải node down)

Partition Tolerance: Hệ thống vẫn hoạt động khi có partition

        [Node A] -- network cut -- [Node B]
          ↑                           ↑
     Cluster side 1            Cluster side 2
     
Nếu không có P: Hệ thống dừng khi xảy ra network partition
```

---

## 2. Tại Sao "Chọn 2 trong 3"?

Trong thực tế **P luôn luôn phải có** (network failures là tất yếu). Do đó, câu hỏi thực sự là: **Khi partition xảy ra, bạn chọn C hay A?**

```
Tình huống: Network partition giữa Node 1 và Node 2
  Client ghi x=5 vào Node 1
  Node 1 không thể sync với Node 2 (partition!)

Chọn CA (CP - Partition xảy ra → chọn C):
  → Node 2 từ chối đọc/ghi cho đến khi partition hết
  → Availability bị hy sinh
  → Ví dụ: HBase, ZooKeeper, Postgres với sync replication

Chọn AP (Partition xảy ra → chọn A):
  → Node 2 vẫn phục vụ requests với data cũ (x=3)
  → Consistency bị hy sinh (stale reads)
  → Ví dụ: DynamoDB, Cassandra, CouchDB, DNS
```

---

## 3. Các Loại Database theo CAP

### CP Databases (Consistent + Partition Tolerant)

```
Hy sinh: Availability
Khi partition: System blocks cho đến khi partition resolved

Ví dụ:
  HBase:        Từ chối operations khi không đủ majority
  ZooKeeper:    Strict quorum, refuses when can't achieve
  MongoDB:      Primary election khi primary down (window of unavailability)
  Redis Cluster:Automatic failover với window downtime

Use case:
  Khi data correctness quan trọng hơn availability
  Tài chính, healthcare, accounting
```

### AP Databases (Available + Partition Tolerant)

```
Hy sinh: Consistency (eventual consistency)
Khi partition: Tất cả nodes vẫn phục vụ với data có thể stale

Ví dụ:
  Cassandra:  "Tunable consistency" - mặc định eventual
  DynamoDB:   Eventual consistency (có option strong consistency)
  CouchDB:    Eventual consistency với conflict resolution
  DNS:        Updates propagate slowly (minutes to hours!)

Use case:
  Khi availability quan trọng hơn instant consistency
  Social media, shopping carts, analytics
  "Amazon không muốn mất đơn hàng dù replica down"
```

---

## 4. Eventual Consistency - Hiểu Đúng

```
Eventual Consistency KHÔNG có nghĩa là "eventually maybe":

Định nghĩa: Nếu không có writes mới, sau một khoảng thời gian
            tất cả nodes SẼ hội tụ đến cùng một giá trị.

Ví dụ Amazon DynamoDB:
  Write: item.price = 10.99 → Node 1, Node 2, Node 3
  Ngay lập tức: Node 1 = 10.99, Node 2 = 9.99 (old), Node 3 = 9.99 (old)
  Sau 100ms: Node 2 = 10.99, Node 3 = 10.99
  → Tất cả nodes nhất quán sau vài ms-seconds

Amazon Shopping Cart:
  Chính sách: "Thà hiện thị giỏ hàng cũ còn hơn lỗi 503"
  → Chọn AP: Luôn trả về response, có thể stale
```

---

## 5. PACELC Model - Mở Rộng CAP

CAP chỉ mô tả khi có partition. **PACELC** bổ sung behavior khi **không có partition**:

```
PACELC: Partition → (A vs C); Else → (L vs C)

P = Partition tolerance
A = Availability
C = Consistency
E = Else (no partition)
L = Latency
C = Consistency

Ví dụ:
  Cassandra:  PA/EL = Trong partition chọn A, bình thường chọn L (thấp)
  DynamoDB:   PA/EL = Tương tự
  PostgreSQL: PC/EC = Trong partition chọn C, bình thường chọn C
  Spanner:    PC/EC = Luôn ưu tiên Consistency (nhưng dùng atomic clock!)
```

---

## 6. Cassandra - AP Database Deep Dive

```
Cassandra Replication Factor = 3 (mỗi data lưu trên 3 nodes):

     Node1 ─── Node2
      │    \  /   │
      │     \/    │
      │     /\    │
     Node4 ─── Node3

Consistency Level (tunable per query!):
  ONE:    Đọc/ghi thành công với 1 node → Nhanh nhất, least consistent
  QUORUM: Đọc/ghi thành công với majority (2/3) → Balanced
  ALL:    Đọc/ghi thành công với tất cả (3/3) → Nhất quán nhất, chậm nhất

Trick: Write QUORUM + Read QUORUM = Strong consistency!
  Write: 2/3 nodes confirm
  Read:  2/3 nodes respond
  → Ít nhất 1 node có latest version
  → Đọc luôn thấy write mới nhất
```

---

## 7. Tóm Tắt Thực Chiến

```
Câu hỏi khi thiết kế distributed system:

1. Có thể chấp nhận stale reads không?
   Không → CP (PostgreSQL, HBase)
   Có    → AP (Cassandra, DynamoDB)

2. Data có "merge-able" khi conflict không?
   Có (shopping cart: merge items) → AP với CRDT
   Không (bank balance) → CP

3. Requirement về latency?
   Low latency globally → AP (ghi local, sync sau)
   Consistent latency → CP (quorum writes)

Ví dụ thực tế:
  Ngân hàng: CP (không thể chấp nhận stale balance)
  Facebook Like count: AP (ai cần like count chính xác đến từng ms?)
  DNS: AP (stale IP tolerable, availability crucial)
  Booking.com: CP cho thanh toán, AP cho search/listing
```

---

**Tiếp theo:** Phase 14 - Database Security →

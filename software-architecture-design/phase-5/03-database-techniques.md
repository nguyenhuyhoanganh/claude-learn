# Bài 3: Database Techniques — Indexing, Replication, Sharding (Kỹ thuật tối ưu database)

Bài 1 và 2 đã giới thiệu SQL và NoSQL. Nhưng dù chọn loại nào, khi data và traffic tăng lên, bạn vẫn cần đến 3 kỹ thuật **căn bản** sau để hệ thống tiếp tục hoạt động tốt. Cả 3 đều áp dụng cho cả SQL lẫn NoSQL.

## Ba kỹ thuật chính giải quyết ba bài toán khác nhau

```text
Database Techniques (3 trụ cột):
├── 1. Indexing       → Cải thiện PERFORMANCE   (đọc nhanh hơn)
├── 2. Replication    → Cải thiện AVAILABILITY  (chịu lỗi)
└── 3. Partitioning   → Cải thiện SCALABILITY    (lưu được nhiều data hơn)
```

Đặc điểm: 3 kỹ thuật này **orthogonal** (vuông góc, không phụ thuộc nhau) — bạn có thể (và nên) dùng cả 3 cùng lúc trong hệ thống production.

---

## 1. Indexing (Đánh chỉ mục)

### Vấn đề: tìm kiếm trong bảng lớn rất chậm

Khi bảng có hàng triệu hàng, việc tìm kiếm không có index = **full table scan** = duyệt từng row → cực kỳ chậm.

```sql
-- Bảng có 10 triệu user, không có index trên cột city:
SELECT * FROM users WHERE city = 'Hanoi';

→ Database phải đọc TẤT CẢ 10 triệu rows để check từng row có city = 'Hanoi' hay không
→ Complexity O(n), có thể mất nhiều giây
```

### Index là gì?

> **Database Index** = Một cấu trúc dữ liệu **phụ trợ** ánh xạ giá trị của một cột (column) → vị trí record trong bảng.

Index giống như **mục lục của một cuốn sách**: thay vì lật từng trang để tìm chương "Redis", bạn xem mục lục → biết ngay chương đó ở trang 142.

**Các cấu trúc phổ biến cho index:**

| Cấu trúc | Phù hợp nhất với | Độ phức tạp |
|-----------|----------|------------|
| **Hash Map** | Tìm chính xác (`WHERE city = 'Hanoi'`) | O(1) |
| **B-Tree** | Tìm trong khoảng + sắp xếp (`WHERE age BETWEEN 20 AND 30`) | O(log n) |

Trong thực tế, B-Tree (và biến thể B+Tree) là cấu trúc được dùng rộng rãi nhất vì nó hỗ trợ cả tìm chính xác lẫn tìm khoảng, lại tối ưu cho việc lưu trên đĩa.

**Ví dụ minh hoạ index:**

```text
Index trên cột "city" (B-Tree):
  'Berlin' → [row 45, row 892, row 1203]
  'Hanoi'  → [row 12, row 456, row 789]
  'Paris'  → [row 34, row 567]

Truy vấn: SELECT * FROM users WHERE city = 'Hanoi'
→ Lookup 'Hanoi' trong index → biết ngay rows [12, 456, 789]
→ Fetch 3 rows này từ disk (rất nhanh) ✅
```

Thay vì duyệt 10 triệu rows, database chỉ cần duyệt index (B-Tree ~24 bước cho 10 triệu entries) → tìm thấy → fetch 3 rows.

### Composite Index (Chỉ mục kết hợp nhiều cột)

Có thể tạo index trên nhiều cột cùng lúc, tối ưu cho query lọc theo nhiều điều kiện:

```sql
-- Index kết hợp city + last_name:
CREATE INDEX idx_city_lastname ON users (city, last_name);

-- Tìm users vừa ở Hanoi vừa có họ Nguyen:
SELECT * FROM users WHERE city = 'Hanoi' AND last_name = 'Nguyen';
→ Lookup cặp ('Hanoi', 'Nguyen') trong index → kết quả ngay ✅
```

Lưu ý: composite index chỉ hữu ích khi query lọc theo các cột **theo đúng thứ tự** index. `WHERE city = 'Hanoi'` dùng được index trên (city, last_name), nhưng `WHERE last_name = 'Nguyen'` thì không.

### Trade-offs của Indexing

```text
Reads  (đọc):   ✅ Nhanh hơn rất nhiều (O(log n) thay vì O(n))
Writes (ghi):   ❌ Chậm hơn (mỗi INSERT/UPDATE phải cập nhật index)
Space  (dung lượng): ❌ Tốn thêm disk cho cấu trúc index
```

**Rule of thumb** (kinh nghiệm): Chỉ tạo index trên các cột **thường được dùng trong WHERE/JOIN/ORDER BY**, không phải tất cả cột. Tạo index bừa bãi sẽ làm chậm writes mà không tăng tốc query.

---

## 2. Database Replication (Sao chép database)

### Vấn đề: Database là Single Point of Failure (điểm chịu lỗi duy nhất)

Nếu chỉ có 1 instance database, server đó chết → toàn hệ thống ngừng hoạt động. Đây là **rủi ro cực lớn** với mọi business.

### Replication là gì?

> Chạy **nhiều bản sao (replicas)** của database trên các máy khác nhau, đồng bộ dữ liệu giữa chúng.

**Lợi ích:**

- **High Availability** (tính sẵn sàng cao): Một replica chết → traffic tự động chuyển sang replica khác.
- **Throughput**: Nhiều máy → xử lý nhiều query đồng thời.
- **Read scaling**: Phân phối read queries lên nhiều replicas → giảm tải cho instance chính.

### Hai mô hình Replication

**Active-Active** (tất cả replica đều nhận read + write):

```text
[Replica 1] ←──sync──→ [Replica 2] ←──sync──→ [Replica 3]
    ↑                        ↑                        ↑
Reads + Writes          Reads + Writes          Reads + Writes
```

**Active-Passive** (1 primary nhận write, các passive chỉ phục vụ đọc / standby):

```text
[Primary (Read + Write)] ──snapshot / stream──> [Passive 1]
                                              > [Passive 2]
        ↑                                          ↑
Mọi write + read chính                  Read-only hoặc chờ failover
```

| | Active-Active | Active-Passive |
|--|--------------|----------------|
| **Throughput** | Cao (load chia đều) | Vừa phải |
| **Availability** | Failover tức thì | Cần promote passive lên primary |
| **Consistency** | Khó hơn (cần resolve conflict) | Dễ hơn (chỉ có 1 leader ghi) |
| **Complexity** | Cao | Thấp |

→ Active-Passive đơn giản hơn, dùng cho hầu hết tình huống. Active-Active dùng khi cần đa region hoặc throughput cực cao.

### Trade-offs

```text
✅ High availability (chịu lỗi tốt)
✅ Read throughput cao hơn
❌ Tăng complexity (sync, xử lý conflict khi data lệch)
❌ Write overhead (mỗi write phải nhân bản sang các replica)
```

Đặc biệt: nếu sync diễn ra **asynchronous** (không đồng bộ), có thể có **replication lag** — replica chậm hơn primary vài giây. Read từ replica có thể trả về data cũ. Cần cân nhắc kỹ với các use case nhạy cảm (vd: sau khi user update profile rồi reload, có thể vẫn thấy data cũ).

---

## 3. Database Partitioning (Sharding — Chia mảnh database)

### Vấn đề: Data quá lớn để lưu trên 1 máy, hoặc quá nhiều concurrent query

Khi data đạt vài TB hoặc traffic vượt quá khả năng xử lý của 1 server (kể cả khi đã có index và replication), bạn cần **chia data ra nhiều server**.

### Sharding là gì?

> **Sharding** = Chia dữ liệu thành nhiều phần (gọi là **shard**), lưu trên các database instance riêng biệt, chạy trên các máy khác nhau.

```text
Tổng: 100 triệu users

Shard 1: user_id 1     - 25M    [Máy A]
Shard 2: user_id 25M+1 - 50M    [Máy B]
Shard 3: user_id 50M+1 - 75M    [Máy C]
Shard 4: user_id 75M+1 - 100M   [Máy D]
```

Mỗi shard chỉ chứa **một phần** data → bảng nhỏ hơn → query nhanh hơn.

**Lợi ích:**

- **Scalability**: Không còn giới hạn về tổng dung lượng data (cứ thêm shard mới khi cần).
- **Parallel processing**: Query trên các shard khác nhau chạy song song.
- **Performance**: Mỗi shard nhỏ → index nhỏ → query nhanh.

### Các chiến lược Sharding

| Chiến lược | Cách làm | Ưu điểm | Nhược điểm |
|----------|----------|----------|-----------|
| **Range-based** (theo khoảng) | user_id 1-1M → Shard 1, 1M+1 - 2M → Shard 2 | Đơn giản, dễ hiểu | Phân bố không đều (shard có user mới ít hơn) |
| **Hash-based** (theo hàm băm) | hash(user_id) % N → shard nào | Phân bố đều | Khó thêm shard (phải re-hash hết) |
| **Directory-based** (theo bảng tra cứu) | Một lookup table riêng lưu user nào ở shard nào | Linh hoạt nhất | Lookup overhead, lookup table là SPOF |

Hash-based là phổ biến nhất. Để giải quyết vấn đề rebalancing khi thêm shard, kỹ thuật **consistent hashing** được dùng — chỉ cần di chuyển 1/N data thay vì re-hash toàn bộ.

### Trade-offs của Sharding

```text
✅ Horizontal scalability cực lớn
✅ Query song song trên nhiều shard
❌ Complexity tăng vọt (phải route query đến đúng shard)
❌ Cross-shard queries rất khó (không thể JOIN trực tiếp 2 shard)
❌ Rebalancing tốn kém khi thêm/bớt shard
❌ Transactions xuyên shard cực kỳ khó (cần 2-phase commit, distributed transaction)
```

→ Chỉ nên shard khi **thực sự cần thiết** — sharding làm hệ thống phức tạp hơn rất nhiều.

---

## Ba kỹ thuật là Orthogonal — kết hợp được hết

Trong hệ thống production thật, bạn dùng cả 3 cùng nhau:

```text
Database Architecture trong Production:

Shard 1 [Primary + Replica 1 + Replica 2] + Index
Shard 2 [Primary + Replica 1 + Replica 2] + Index
Shard 3 [Primary + Replica 1 + Replica 2] + Index
    ↑              ↑              ↑
Sharding      Replication      Indexing
(Scalability) (Availability)  (Performance)
```

Đây là kiến trúc chuẩn của các hệ thống lớn như Facebook, Twitter, Instagram.

## Khi nào áp dụng kỹ thuật nào?

| Vấn đề bạn gặp | Giải pháp |
|--------|----------|
| Query chậm dù database còn nhỏ | Index |
| Database là SPOF | Replication |
| Data quá lớn cho 1 máy | Sharding |
| Read traffic cực cao | Replication (thêm read replica) |
| Write traffic cực cao | Sharding (chia write load) |

Đi theo thứ tự: **Index trước, Replication tiếp theo, Sharding cuối cùng**. Sharding là biện pháp cuối cùng — phức tạp nhất, đắt nhất.

## NoSQL vs SQL trong bối cảnh này

- **NoSQL**: Replication và Sharding là **first-class features** (tính năng built-in từ ngày đầu) — MongoDB, Cassandra, DynamoDB tự xử lý replication + sharding cho bạn.
- **SQL**: Replication / Sharding hỗ trợ tuỳ engine — PostgreSQL, MySQL đều có, nhưng cần config cẩn thận và có nhiều ràng buộc (vd: cross-shard JOIN không tự động).

Đây là một trong những lý do NoSQL được ưa chuộng ở quy mô lớn.

## Tóm tắt bài 3

```text
3 Database Techniques (Orthogonal — dùng kết hợp):

1. Indexing → Performance (đọc nhanh)
   ├── HashMap: O(1) cho tìm chính xác
   └── B-Tree: O(log n) cho range queries + sorting
   Trade-off: writes chậm hơn, tốn dung lượng

2. Replication → Availability + Read Throughput
   ├── Active-Active: tất cả replica nhận traffic, failover tức thì
   └── Active-Passive: primary + standby, đơn giản hơn
   Trade-off: write overhead, sync complexity, replication lag

3. Sharding → Scalability (data lớn vô hạn)
   ├── Range-based: đơn giản, có thể không đều
   ├── Hash-based: đều, khó thêm shard
   └── Directory-based: linh hoạt nhất, có overhead
   Trade-off: complexity rất cao, cross-shard query khó
```

Bài kế tiếp sẽ về **CAP Theorem** — định lý vàng giải thích vì sao không thể có cả 3: Consistency, Availability, Partition tolerance cùng lúc.

---
**Bài kế tiếp**: [Bài 4 - CAP Theorem](04-cap-theorem.md) →

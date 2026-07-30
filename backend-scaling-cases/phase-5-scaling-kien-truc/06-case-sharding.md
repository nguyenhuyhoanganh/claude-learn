# Case 6: Sharding — chia database và những gì bạn mất

Sharding là bước cuối cùng trong hành trình scale dữ liệu, và cũng là bước **khó quay đầu nhất**. Trước khi làm, hãy chắc chắn bạn đã dùng hết mọi cách rẻ hơn:

```text
   ✓ Đã tối ưu query và thêm index?          (phase-3 case 9)
   ✓ Đã có cache?                            (phase-4 case 2)
   ✓ Đã có read replica?                     (case 5)
   ✓ Đã async hoá các thao tác ghi phụ?      (case 4)
   ✓ Đã thử scale dọc tới máy lớn nhất?      (case 1)
   ✓ Đã phân vùng (partition) bảng lớn?

   Nếu còn một dấu ✗ nào — làm cái đó trước.
```

Vì sao khắt khe vậy? Vì sharding **lấy đi những thứ bạn coi là hiển nhiên**: JOIN, transaction, `ORDER BY` toàn cục, `COUNT(*)`, khoá ngoại. Và lấy đi vĩnh viễn.

## Phân vùng vs Sharding — phân biệt trước

| | Partitioning (phân vùng) | Sharding |
|---|---|---|
| Dữ liệu nằm ở | **Một** database | **Nhiều** database/server |
| Ai quản lý | Database tự làm | **Ứng dụng hoặc middleware** |
| JOIN giữa các phần | Được | **Không** |
| Transaction xuyên phần | Được | **Không** (cần 2PC/saga) |
| Độ phức tạp | Thấp | **Rất cao** |
| Giải quyết được | Bảng quá lớn, query chậm | Vượt giới hạn một máy |

**Partition trước, shard sau.** Rất nhiều trường hợp "cần shard" thực ra chỉ cần partition:

```sql
-- PostgreSQL: phân vùng theo tháng
CREATE TABLE orders (
    id BIGSERIAL,
    created_at TIMESTAMPTZ NOT NULL,
    ...
) PARTITION BY RANGE (created_at);

CREATE TABLE orders_2026_07 PARTITION OF orders
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE orders_2026_08 PARTITION OF orders
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
```

Lợi ích của partition mà nhiều người không biết:

- Query có điều kiện thời gian chỉ quét đúng partition cần (**partition pruning**).
- Xoá dữ liệu cũ bằng `DROP TABLE orders_2025_01` — **tức thì**, thay vì `DELETE` chạy hàng giờ và sinh bloat.
- Index nhỏ hơn, vừa bộ nhớ hơn.
- `VACUUM` chạy trên từng partition, nhanh hơn nhiều.

Riêng việc xoá dữ liệu cũ đã đủ lý do để phân vùng mọi bảng log/sự kiện.

## Ba chiến lược sharding

### 1. Range sharding (theo khoảng)

```text
   Shard 1: user_id  1 –  1.000.000
   Shard 2: user_id  1.000.001 – 2.000.000
   Shard 3: user_id  2.000.001 – 3.000.000
```

| Ưu | Nhược |
|---|---|
| Query theo khoảng hiệu quả | **Hot shard**: người dùng mới đều vào shard cuối |
| Dễ hiểu, dễ thêm shard | Phân bố không đều |

Với ID tự tăng, shard cuối cùng luôn nhận toàn bộ ghi mới — đây là hot shard kinh điển.

### 2. Hash sharding (theo băm)

```text
   shard = hash(user_id) % số_shard
```

| Ưu | Nhược |
|---|---|
| **Phân bố rất đều** | Query theo khoảng phải hỏi mọi shard |
| Đơn giản | **Thêm shard = phải chuyển gần như toàn bộ dữ liệu** |

Vấn đề thứ hai nghiêm trọng hơn vẻ ngoài:

```text
   4 shard → 5 shard:  hash % 4  →  hash % 5
   ⇒ ~80% dữ liệu phải chuyển sang shard khác.
```

### 3. Consistent hashing (băm nhất quán)

Giải quyết chính xác vấn đề trên:

```text
   Vòng tròn băm 0 → 2^32

        Node A (nhiều node ảo)
       ╱                    ╲
   Node D                  Node B
       ╲                    ╱
        Node C ──────────────

   Mỗi khoá đi theo chiều kim đồng hồ tới node đầu tiên gặp.

   Thêm node E → chỉ khoá nằm giữa E và node trước đó phải chuyển
   ⇒ chỉ ~1/N dữ liệu di chuyển thay vì 80%.
```

**Virtual node (node ảo)** là chi tiết quan trọng: mỗi node vật lý được đặt ở nhiều vị trí trên vòng (thường 100-200 vị trí). Không có node ảo, phân bố rất lệch — một node có thể nhận gấp 5 lần node khác.

Đây là cơ chế mà Cassandra, DynamoDB, Redis Cluster đều dùng.

### 4. Directory-based sharding (bảng tra cứu)

```sql
CREATE TABLE shard_map (
    tenant_id VARCHAR(50) PRIMARY KEY,
    shard_id  INT NOT NULL
);
```

| Ưu | Nhược |
|---|---|
| **Linh hoạt tuyệt đối** — chuyển tenant giữa shard tuỳ ý | Bảng tra cứu là điểm hỏng đơn |
| Tách riêng tenant lớn được | Thêm một lần tra cứu (cần cache) |
| Rebalance dễ | Phải quản lý bảng này |

Đây là lựa chọn tốt nhất cho hệ thống **multi-tenant**, vì nó cho phép "khách hàng lớn có shard riêng" — giải pháp cho hot shard (phase-4 case 5).

## Chọn shard key — quyết định quan trọng nhất

Shard key quyết định gần như mọi thứ về sau, và **rất khó đổi**. Bốn tiêu chí:

| Tiêu chí | Vì sao | Ví dụ tốt | Ví dụ xấu |
|---|---|---|---|
| **Độ chọn lọc cao** | Chia đều được | `user_id` | `country` (Việt Nam chiếm 90%) |
| **Có trong hầu hết query** | Tránh phải hỏi mọi shard | `user_id` với hệ thống hướng người dùng | `created_at` |
| **Không đổi** | Đổi = phải di chuyển dữ liệu | `user_id` | `status`, `city` |
| **Gom dữ liệu liên quan** | Giữ được JOIN cục bộ | `tenant_id` | ID ngẫu nhiên |

Tiêu chí thứ hai đáng phân tích kỹ:

```text
   Shard theo user_id:

   "Lấy đơn hàng của user X"        → 1 shard   ✓ nhanh
   "Lấy đơn hàng hôm nay"           → MỌI shard ✗ chậm
   "Tìm đơn theo mã vận đơn"        → MỌI shard ✗ chậm

   ⇒ Query không chứa shard key phải hỏi TẤT CẢ shard (scatter-gather),
     và chậm bằng shard chậm nhất.
```

Với các truy vấn không theo shard key, giải pháp là **bảng tra cứu ngược** hoặc **chỉ mục toàn cục**:

```sql
-- Bảng nhỏ, không shard (hoặc shard theo tracking_code)
CREATE TABLE order_lookup (
    tracking_code VARCHAR(50) PRIMARY KEY,
    user_id       BIGINT NOT NULL,      -- để biết đơn nằm ở shard nào
    order_id      BIGINT NOT NULL
);
```

Tra bảng này trước để biết shard, rồi mới query đúng shard. Đánh đổi: thêm một round-trip, và phải giữ hai bảng đồng bộ.

Hoặc: đẩy dữ liệu sang **Elasticsearch** cho các truy vấn tìm kiếm đa chiều — đây là cách phổ biến nhất trong thực tế.

## Những gì bạn mất — danh sách đầy đủ

### 1. JOIN xuyên shard

```sql
-- Không chạy được nếu users và orders nằm khác shard
SELECT u.name, o.total
FROM users u JOIN orders o ON u.id = o.user_id;
```

Giải pháp:
- **Shard cùng khoá** (`user_id`) để dữ liệu liên quan nằm cùng shard — gọi là **colocation**.
- Sao chép bảng nhỏ sang mọi shard (**reference table**), ví dụ bảng danh mục, bảng cấu hình.
- JOIN ở tầng ứng dụng (chậm, nhiều round-trip).

Colocation là kỹ thuật quan trọng nhất: thiết kế để **mọi dữ liệu của một người dùng/tenant nằm trên cùng một shard**. Khi đó phần lớn query vẫn chạy trong một shard như bình thường.

### 2. Transaction xuyên shard

```java
// Không có ACID nếu hai tài khoản khác shard
@Transactional
public void transfer(Long fromUserId, Long toUserId, BigDecimal amount) {
    accountRepo.decrease(fromUserId, amount);     // shard 1
    accountRepo.increase(toUserId, amount);       // shard 2
}
```

Ba lựa chọn:

| Cách | Mô tả | Đánh đổi |
|---|---|---|
| **Thiết kế tránh** | Chọn shard key sao cho giao dịch nằm trong một shard | Không phải lúc nào cũng được |
| **Saga** | Chuỗi bước + hành động bù trừ (case 4) | Nhất quán cuối cùng, phức tạp |
| **2PC** (two-phase commit) | Điều phối viên đảm bảo tất cả commit hoặc tất cả rollback | Chậm, và **treo nếu điều phối viên chết** |

2PC hiếm khi được dùng trong hệ thống hiện đại vì nó làm giảm khả dụng: nếu điều phối viên chết giữa hai pha, các shard bị khoá và không ai biết nên commit hay rollback.

Saga là lựa chọn thực tế trong đa số trường hợp.

### 3. Khoá tự tăng toàn cục

```sql
-- Mỗi shard có sequence riêng → ID trùng nhau!
CREATE TABLE orders (id BIGSERIAL PRIMARY KEY, ...);
```

Giải pháp:

| Cách | Ưu | Nhược |
|---|---|---|
| **UUID v4** | Đơn giản, không phối hợp | Ngẫu nhiên → phân mảnh index nặng |
| **UUID v7 / ULID** | Sắp xếp được theo thời gian, thân thiện với B-tree | 16 byte |
| **Snowflake ID** | 64-bit, sắp xếp được, chứa thông tin shard | Cần quản lý machine ID, nhạy với đồng hồ |
| **Sequence có offset** | Shard 1: 1,101,201...; shard 2: 2,102,202... | Khó thêm shard |

**UUID v7 là lựa chọn mặc định tốt nhất hiện nay**: nó có tiền tố timestamp nên chèn tuần tự (không phân mảnh index như v4), vẫn duy nhất toàn cục, và không cần phối hợp giữa các node.

Snowflake ID (64-bit: timestamp + machine ID + sequence) tiết kiệm hơn về dung lượng và là lựa chọn tốt khi ID xuất hiện trong nhiều index.

### 4. Các thao tác toàn cục

```sql
SELECT COUNT(*) FROM orders;                      -- phải cộng mọi shard
SELECT * FROM orders ORDER BY created_at LIMIT 10; -- phải lấy từ mọi shard rồi trộn
```

**Sắp xếp và phân trang xuyên shard** đặc biệt khó:

```text
   Muốn 10 đơn mới nhất trên toàn hệ thống, có 8 shard:
   ⇒ Phải lấy 10 đơn mới nhất từ MỖI shard (80 bản ghi)
   ⇒ Trộn, sắp xếp, lấy 10 đầu

   Muốn trang thứ 100 (OFFSET 1000)?
   ⇒ Phải lấy 1010 bản ghi từ MỖI shard = 8.080 bản ghi
   ⇒ Càng sâu càng đắt — không khả thi.
```

Giải pháp: dùng **keyset pagination** (phase-3 case 8), hoặc đẩy dữ liệu sang một hệ thống chuyên cho truy vấn tổng hợp (Elasticsearch, ClickHouse, data warehouse).

### 5. Thay đổi schema

```text
   ALTER TABLE trên 64 shard = 64 lần thực thi
   ⇒ Cần công cụ điều phối, và phải xử lý trường hợp một shard thất bại giữa chừng
   ⇒ Trong lúc đó, các shard có schema khác nhau — code phải chịu được cả hai.
```

Nguyên tắc bắt buộc: **mọi thay đổi schema phải tương thích ngược**. Thêm cột nullable, không xoá cột ngay, đổi tên bằng cách thêm mới rồi bỏ cũ sau.

## Rebalancing — bài toán khó nhất

Thêm shard nghĩa là phải chuyển dữ liệu, **trong khi hệ thống vẫn chạy**.

```text
   Quy trình an toàn:

   1. Thêm shard mới (rỗng)
   2. Ghi kép: dữ liệu thuộc phạm vi mới ghi vào CẢ shard cũ và mới
   3. Sao chép dữ liệu lịch sử sang shard mới (backfill, có giới hạn tốc độ)
   4. Đối soát: so sánh hai bên
   5. Chuyển đọc sang shard mới
   6. Ngừng ghi vào shard cũ
   7. Xoá dữ liệu ở shard cũ (sau khi backup)
```

Cách giảm đau: **shard ảo (virtual shard)**.

```text
   Tạo sẵn 1024 shard ảo ngay từ đầu, ánh xạ vào 4 shard vật lý:

   shard ảo   0-255  → máy 1
   shard ảo 256-511  → máy 2
   shard ảo 512-767  → máy 3
   shard ảo 768-1023 → máy 4

   Thêm máy thứ 5 → chỉ cần chuyển một số shard ảo sang máy mới.
   KHÔNG cần tính lại hàm băm, không cần chuyển 80% dữ liệu.
```

Đây là kỹ thuật quan trọng nhất cần áp dụng **ngay từ ngày đầu sharding**. Nếu không làm, mỗi lần thêm máy sẽ là một dự án hàng tháng.

## Công cụ thay vì tự viết

Tự cài đặt sharding rất tốn kém. Cân nhắc các giải pháp có sẵn:

| Công cụ | Loại | Phù hợp |
|---|---|---|
| **Vitess** | Middleware cho MySQL | Quy mô rất lớn (YouTube, Slack dùng) |
| **Citus** | Extension cho PostgreSQL | Phân tán PostgreSQL, giữ được SQL |
| **CockroachDB / YugabyteDB** | Database phân tán | Muốn SQL + phân tán tự động |
| **MongoDB sharding** | Tích hợp sẵn | Đã dùng MongoDB |
| **Cassandra / ScyllaDB** | Phân tán từ thiết kế | Ghi rất nhiều, mô hình truy vấn đơn giản |
| **ShardingSphere** | Middleware JDBC | Java, muốn giữ database hiện tại |

Citus đáng chú ý cho hệ sinh thái PostgreSQL: nó cho phép phân tán bảng theo cột phân phối, và **giữ lại phần lớn cú pháp SQL** kể cả JOIN (nếu colocation đúng). Chi phí học tập thấp hơn nhiều so với tự viết.

Với hệ thống mới và quy mô lớn, database phân tán native (CockroachDB, YugabyteDB) đáng cân nhắc: chúng cho bạn SQL, transaction phân tán, và tự động rebalance — đổi lại latency cao hơn và chi phí lớn hơn.

## Trường hợp thực tế: shard một bảng, không shard cả database

Bối cảnh: nền tảng giáo dục, bảng `submission` (bài nộp của học viên) có 2 tỉ dòng, chiếm 85% dung lượng và 70% lượng ghi. Các bảng khác đều nhỏ.

**Quyết định**: chỉ shard **một bảng đó**, giữ nguyên mọi thứ khác.

```text
   ┌──────────────────────────────────────────────┐
   │ PostgreSQL chính (không shard)               │
   │ users, courses, lessons, enrollments...      │
   │ → JOIN bình thường, transaction bình thường  │
   └──────────────────────────────────────────────┘

   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ shard 0  │ │ shard 1  │ │ shard 2  │ │ shard 3  │
   │submission│ │submission│ │submission│ │submission│
   └──────────┘ └──────────┘ └──────────┘ └──────────┘
        shard key = course_id (dùng 256 shard ảo)
```

Vì sao chọn `course_id` chứ không phải `user_id`:

```text
   Query phổ biến nhất: "lấy tất cả bài nộp của khoá X" (giáo viên chấm bài)
   → nếu shard theo course_id: 1 shard  ✓
   → nếu shard theo user_id:   mọi shard ✗

   Query "bài nộp của tôi": có kèm course_id trong ngữ cảnh → vẫn 1 shard ✓
```

**Kết quả**:

| Chỉ số | Trước | Sau |
|---|---|---|
| Kích thước bảng lớn nhất | 2 tỉ dòng / 4 TB | 500 triệu / 1 TB mỗi shard |
| p99 truy vấn bài nộp | 2.400 ms | 85 ms |
| Thời gian VACUUM | 14 giờ | 3 giờ mỗi shard, chạy song song |
| Độ phức tạp code | — | Chỉ tăng ở **một** repository |

Điểm quan trọng nhất: **độ phức tạp chỉ tăng ở một chỗ**. Mọi truy vấn khác trong hệ thống vẫn viết như bình thường, vẫn JOIN được, vẫn có transaction ACID.

Đây là chiến lược nên cân nhắc trước tiên: **tìm bảng nóng nhất và chỉ shard nó**, thay vì shard cả database.

## Checklist trước khi shard

```text
□ Đã dùng hết index, cache, replica, async, partition chưa?
□ Đã thử máy lớn nhất có thể mua chưa?
□ Đã xác định được shard key thoả 4 tiêu chí chưa?
□ Đã liệt kê MỌI query và kiểm tra query nào không có shard key chưa?
□ Có thể chỉ shard MỘT bảng thay vì cả database không?
□ Đã thiết kế shard ảo (virtual shard) chưa?
□ Đã chọn chiến lược sinh ID toàn cục chưa?
□ Đã có kế hoạch cho transaction xuyên shard (saga) chưa?
□ Đã có công cụ chạy migration trên mọi shard chưa?
□ Đã cân nhắc dùng Citus/Vitess/CockroachDB thay vì tự viết chưa?
□ Đã có kế hoạch rebalance khi thêm shard chưa?
□ Đã có giám sát phân bố tải giữa các shard chưa?
```

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Shard quá sớm | Độ phức tạp gấp 10 lần mà chưa cần |
| Chọn shard key không có trong query phổ biến | Mọi query đều scatter-gather |
| Shard key thay đổi được (`status`, `city`) | Phải di chuyển dữ liệu khi giá trị đổi |
| Không dùng shard ảo | Thêm máy = chuyển 80% dữ liệu |
| Dùng UUID v4 làm khoá chính | Index phân mảnh nặng, ghi chậm |
| Không có bảng tra cứu ngược | Không tìm được bản ghi theo khoá phụ |
| Quên rằng schema migration phải chạy N lần | Shard lệch schema |
| Không giám sát phân bố | Hot shard mà không biết |
| Shard cả database khi chỉ cần shard một bảng | Mất JOIN và transaction ở những chỗ không cần |

## Tóm tắt case 6

- **Partition trước, shard sau.** Partition giải quyết được nhiều vấn đề với chi phí thấp hơn nhiều.
- Sharding lấy đi vĩnh viễn: **JOIN xuyên shard, transaction ACID, ID tự tăng, thao tác toàn cục, migration đơn giản**.
- **Shard key là quyết định khó đảo ngược nhất**: phải có độ chọn lọc cao, xuất hiện trong hầu hết query, không đổi, và gom được dữ liệu liên quan (colocation).
- **Consistent hashing + virtual node** là bắt buộc nếu muốn thêm shard mà không chuyển gần hết dữ liệu.
- **UUID v7 / Snowflake ID** cho khoá toàn cục; tránh UUID v4 làm khoá chính.
- Truy vấn không theo shard key: dùng **bảng tra cứu ngược** hoặc đẩy sang Elasticsearch.
- Cân nhắc **Citus / Vitess / CockroachDB** thay vì tự cài đặt.
- Chiến lược tốt nhất thường là: **chỉ shard một bảng nóng nhất**, giữ nguyên phần còn lại.

**Bài kế tiếp** → [Case 7: Idempotency — nền tảng của mọi hệ thống phân tán đáng tin](07-case-idempotency.md)

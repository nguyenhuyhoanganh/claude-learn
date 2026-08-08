# Bài 6: Indexing — PostgreSQL vs MySQL InnoDB

Cùng một câu lệnh `CREATE INDEX`, hai hệ, hai cấu trúc trên đĩa hoàn toàn khác nhau. Bài này đặt chúng cạnh nhau và giải thích hệ quả của từng khác biệt.

## Khác biệt gốc: lá của cây chứa gì

```text
   POSTGRESQL — HEAP + INDEX RIENG
   ═══════════════════════════════
   Index primary key           Index phụ (trên name)
   ┌──────────────────┐        ┌──────────────────────┐
   │ 42 → ctid(1204,7)│        │ 'An' → ctid(1204,7)  │
   └────────┬─────────┘        └──────────┬───────────┘
            │                             │
            └──────────┬──────────────────┘
                       ▼
   HEAP (bảng, RỜI RẠC, không sắp xếp)
   ┌────────────────────────────────────────┐
   │ page 1204, khe 7:  42│An│1990-01-02│15000│
   └────────────────────────────────────────┘

   → CẢ HAI index đều trỏ THẲNG tới vị trí vật lý
   → Cả hai đều tốn 2 chặng


   MYSQL INNODB — CLUSTERED INDEX
   ══════════════════════════════
   Clustered index (CHÍNH LÀ BẢNG)     Index phụ (trên name)
   ┌──────────────────────────────┐    ┌──────────────────┐
   │ LA: 42│An│1990-01-02│15000   │    │ 'An' → 42        │
   │     43│Binh│...              │    └────────┬─────────┘
   └──────────────────────────────┘             │ trỏ tới KHOÁ CHÍNH
              ▲                                 │
              └─────────────────────────────────┘
                     phải tra CLUSTERED INDEX lần nữa

   → Tra khoá chính: 1 chặng  ✔
   → Tra index phụ : 3 chặng  ✘
```

Từ một khác biệt này sinh ra **tám** hệ quả.

---

## Hệ quả 1 — Số chặng tra cứu

```sql
-- Tra theo KHOÁ CHÍNH
SELECT * FROM users WHERE id = 42;
```

```text
   PostgreSQL : index → ctid → heap                    2 CHẶNG
   InnoDB     : clustered index → LÁ CÓ SẴN DỮ LIỆU    1 CHẶNG   ✔ nhanh hơn
```

```sql
-- Tra theo INDEX PHỤ
SELECT * FROM users WHERE name = 'An';
```

```text
   PostgreSQL : index phụ → ctid → heap                2 CHẶNG   ✔ nhanh hơn
   InnoDB     : index phụ → khoá chính → clustered     3 CHẶNG
```

Không bên nào thắng tuyệt đối. Bên nào thắng phụ thuộc **truy vấn của bạn đi qua đường nào nhiều hơn**.

## Hệ quả 2 — Kích thước khoá chính lan toả

```text
   INNODB: index phụ chứa GIÁ TRỊ KHOÁ CHÍNH.
   → khoá chính lớn → MỌI index phụ phình theo

   Bảng 100 triệu dòng, 5 index phụ:
     PK = BIGINT (8 byte)   :  100tr × 8  × 5 =  4,0 GB
     PK = UUID CHAR(36)     :  100tr × 36 × 5 = 18,0 GB
                                                 ────────
                                       THÊM 14 GB

   POSTGRESQL: index phụ chứa `ctid` (6 byte, CỐ ĐỊNH)
   → kích thước khoá chính KHÔNG ảnh hưởng index phụ
```

Đây là lý do lời khuyên "khoá chính phải nhỏ" **quan trọng hơn nhiều** trên InnoDB.

## Hệ quả 3 — `UPDATE` đụng vào đâu

```sql
UPDATE users SET last_login = now() WHERE id = 42;
-- 5 index, không cái nào chứa cột `last_login`
```

```text
   POSTGRESQL: tạo PHIÊN BẢN MỚI → ctid đổi
               → PHẢI cập nhật CẢ 5 index
               → kể cả index trên cột không đổi
               (trừ khi đạt HOT update)

   INNODB    : sửa TẠI CHỖ, khoá chính không đổi
               → KHÔNG đụng index phụ nào   ✔
```

Đây là lý do chính trong bài viết của Uber ([bài 3](02-thao-luan-uuid-pk-va-postgres-vs-mysql.md)).

Kiểm tra mức độ giảm nhẹ trên PostgreSQL:

```sql
SELECT relname, n_tup_upd, n_tup_hot_upd,
       round(100.0*n_tup_hot_upd/NULLIF(n_tup_upd,0),1) AS ti_le_hot
FROM pg_stat_user_tables WHERE n_tup_upd > 1000 ORDER BY n_tup_upd DESC;
```

Tỉ lệ HOT dưới 50% trên bảng ghi nhiều là dấu hiệu cần `fillfactor = 80` hoặc bỏ bớt index trên cột hay thay đổi.

## Hệ quả 4 — Quét theo thứ tự khoá chính

```sql
SELECT * FROM users ORDER BY id LIMIT 1000;
```

```text
   INNODB    : dòng đã SẮP XẾP VẬT LÝ theo khoá chính
               → đọc TUẦN TỰ, cực nhanh                    ✔

   POSTGRESQL: heap không sắp xếp
               → index cho thứ tự, nhưng nhảy NGẪU NHIÊN vào heap
```

Đo mức độ "còn sắp xếp" của bảng PostgreSQL:

```sql
SELECT attname, correlation FROM pg_stats
WHERE tablename = 'users' AND attname = 'id';
```

```text
 attname | correlation
---------+-------------
 id      |        0.98     ← gần 1 → vẫn sắp xếp tốt (bảng chỉ nối thêm)
```

Sắp xếp lại một lần:

```sql
CLUSTER users USING users_pkey;   -- ⚠ KHOÁ TOÀN BẢNG
```

Nhưng thứ tự này **không được duy trì** — dòng chèn sau đó lại nhét vào chỗ trống bất kỳ.

## Hệ quả 5 — Covering index

```sql
-- PostgreSQL 11+
CREATE INDEX idx ON users (name) INCLUDE (email, phone);

-- MySQL: không có INCLUDE, phải đưa vào KHOÁ
CREATE INDEX idx ON users (name, email, phone);
```

```text
   POSTGRESQL: `INCLUDE` để cột phụ CHỈ Ở LÁ
     → nút trong nhẹ → cây THẤP hơn
     → cột phụ có thể là KIỂU BẤT KỲ (không cần so sánh được)

   MYSQL: phải đưa hết vào khoá
     → cột phụ nằm ở MỌI TẦNG → cây CAO hơn
     → nhưng BÙ LẠI: index phụ vốn đã chứa khoá chính
       → `SELECT id FROM users WHERE name='An'` là index-only scan MIỄN PHÍ
```

Dòng cuối là một ưu điểm ẩn của InnoDB: mọi index phụ đều **tự động covering cho khoá chính**.

## Hệ quả 6 — Index-Only Scan và visibility map

```text
   POSTGRESQL: index KHÔNG lưu thông tin MVCC
     → phải kiểm tra VISIBILITY MAP
     → chưa VACUUM → `Heap Fetches` cao → mất tác dụng

   INNODB: thông tin phiên bản nằm trong CLUSTERED INDEX
     → index phụ vẫn phải tra clustered để kiểm tra
     → trừ khi đọc ở mức READ UNCOMMITTED
```

```sql
-- PostgreSQL: kiểm tra
EXPLAIN (ANALYZE) SELECT name FROM users WHERE name = 'An';
```

```text
Index Only Scan using idx_name on users
  Heap Fetches: 0          ← tốt; nếu > 0 thì cần VACUUM
```

## Hệ quả 7 — Các loại index có sẵn

| Loại | PostgreSQL | MySQL InnoDB |
|---|---|---|
| B-Tree | ✔ | ✔ |
| Hash | ✔ | ✔ (chỉ engine MEMORY) |
| **GIN** (mảng, jsonb, toàn văn) | **✔** | ✘ |
| **GiST** (hình học, khoảng) | **✔** | ✘ |
| **BRIN** (bảng rất lớn, tương quan) | **✔** | ✘ |
| **SP-GiST** | **✔** | ✘ |
| Không gian (R-Tree) | ✔ (PostGIS) | ✔ |
| Toàn văn | ✔ | ✔ |
| **Index bộ phận** (`WHERE`) | **✔** | ✘ |
| **Index trên biểu thức** | **✔** | ✔ (từ 8.0.13, qua cột ảo) |
| **Index giảm dần** | ✔ | ✔ (từ 8.0, trước đó chỉ là cú pháp) |
| **`INCLUDE`** | **✔** | ✘ |

Hai dòng in đậm nhất đáng chú ý:

```text
   INDEX BỘ PHẬN — PostgreSQL có, MySQL KHÔNG
     CREATE INDEX idx ON jobs (created_at) WHERE status = 'pending';
     → 1,8 MB thay vì 2,1 GB  (nhỏ hơn ~1.200 lần)
     → đây là một trong những khác biệt có giá trị thực tế lớn nhất

   BRIN — cho bảng rất lớn có dữ liệu tương quan thứ tự vật lý
     Bảng 1 tỷ dòng: B-Tree ~30 GB, BRIN ~3 MB  (nhỏ hơn 10.000 lần)
```

MySQL có thể mô phỏng index bộ phận bằng cột ảo:

```sql
ALTER TABLE jobs ADD COLUMN pending_at DATETIME
  GENERATED ALWAYS AS (IF(status='pending', created_at, NULL)) VIRTUAL;
CREATE INDEX idx ON jobs (pending_at);
-- NULL không được đánh index → gần giống index bộ phận
```

Nhưng đây là cách vòng, và không linh hoạt bằng.

## Hệ quả 8 — Tạo index không chặn ghi

```sql
-- PostgreSQL
CREATE INDEX CONCURRENTLY idx ON t (col);
DROP INDEX CONCURRENTLY idx;
REINDEX INDEX CONCURRENTLY idx;
```

```sql
-- MySQL: online DDL
ALTER TABLE t ADD INDEX idx (col), ALGORITHM=INPLACE, LOCK=NONE;
```

```text
   MySQL: khai báo TƯỜNG MINH ALGORITHM và LOCK
     → nếu không làm online được, nó BÁO LỖI NGAY
     → "thất bại sớm" — rất đáng giá

   PostgreSQL: CONCURRENTLY có thể THẤT BẠI GIỮA CHỪNG
     → để lại index INVALID: không được dùng, nhưng VẪN làm chậm ghi
     → phải rà soát định kỳ
```

---

## Bảng tổng kết

| | PostgreSQL | MySQL InnoDB |
|---|---|---|
| Tổ chức bảng | **Heap** (không sắp) | **Clustered** theo PK |
| Index phụ trỏ tới | `ctid` (6 byte) | **Khoá chính** |
| Tra khoá chính | 2 chặng | **1 chặng** |
| Tra index phụ | **2 chặng** | 3 chặng |
| Kích thước PK ảnh hưởng index phụ | **Không** | **Có, mạnh** |
| `UPDATE` cột không index | Đụng mọi index (trừ HOT) | **Không đụng index phụ** |
| Quét theo thứ tự PK | Ngẫu nhiên | **Tuần tự** |
| Chèn khoá ngẫu nhiên | Chỉ index bị tách page | **Cả dữ liệu** bị tách page |
| Loại index | **Rất phong phú** | Cơ bản |
| Index bộ phận | **Có** | Không (chỉ mô phỏng) |
| `INCLUDE` | **Có** | Không |
| Index-only scan | Cần visibility map sạch | Tự nhiên hơn |
| Tạo index không chặn | `CONCURRENTLY` (có thể để lại INVALID) | `LOCK=NONE` (**thất bại sớm**) |

---

## Áp dụng: cùng bài toán, hai cách tối ưu

### Bài toán: bảng đơn hàng, truy vấn theo `user_id` + `created_at`

```sql
-- Truy vấn nóng
SELECT id, total, status FROM orders
 WHERE user_id = 42 ORDER BY created_at DESC LIMIT 20;
```

**Trên PostgreSQL:**

```sql
CREATE INDEX idx_orders_user_time
    ON orders (user_id, created_at DESC)
    INCLUDE (total, status);
```

```text
   → Index Only Scan, KHÔNG chạm heap
   → `INCLUDE` để total/status chỉ ở lá → cây thấp
   → nhớ VACUUM để giữ Heap Fetches = 0
```

**Trên MySQL:**

```sql
CREATE INDEX idx_orders_user_time ON orders (user_id, created_at DESC, total, status);
```

```text
   → Covering index, không tra clustered index
   → `id` (khoá chính) ĐÃ CÓ SẴN trong mọi index phụ → không cần thêm
   → nên đảm bảo khoá chính NHỎ
```

### Bài toán: bảng hàng đợi công việc

```sql
-- Truy vấn nóng: lấy việc đang chờ
SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 10;
```

**Trên PostgreSQL:**

```sql
CREATE INDEX idx_jobs_pending ON jobs (created_at) WHERE status = 'pending';
```

```text
   → Index BỘ PHẬN: chỉ chứa ~5.000 dòng đang chờ
   → 1,8 MB thay vì 2,1 GB
   → và nó TỰ NHỎ LẠI khi công việc được xử lý xong
```

**Trên MySQL:**

```sql
CREATE INDEX idx_jobs_status_time ON jobs (status, created_at);
```

```text
   → Index ĐẦY ĐỦ trên cả 100 triệu dòng
   → 2,1 GB
   → hoặc mô phỏng bằng cột ảo (phức tạp hơn)
```

Đây là ví dụ rõ nhất cho thấy **index bộ phận là ưu thế thực tế lớn nhất của PostgreSQL** trong lĩnh vực index.

---

## Bảng chọn khi thiết kế

| Nếu tải của bạn... | Nghiêng về |
|---|---|
| `UPDATE` rất nhiều trên bảng nhiều index | **MySQL** |
| Đọc qua index phụ rất nhiều | **PostgreSQL** |
| Quét khoảng theo khoá chính rất nhiều | **MySQL** |
| Cần index bộ phận (cột lệch phân bố mạnh) | **PostgreSQL** |
| Cần jsonb, mảng, địa lý, toàn văn nâng cao | **PostgreSQL** |
| Bảng rất lớn, dữ liệu tương quan thời gian | **PostgreSQL** (BRIN) |
| Khoá chính buộc phải lớn | **PostgreSQL** (không lan sang index phụ) |

## Bẫy thường gặp

| Bẫy | Hệ | Hậu quả | Cách tránh |
|---|---|---|---|
| Khoá chính lớn (UUID chuỗi) | **MySQL** | Phình mọi index phụ, tốn hàng GB | `BIGINT` hoặc `BINARY(16)` |
| Nhiều index trên bảng `UPDATE` nhiều | **PostgreSQL** | Mọi `UPDATE` đụng mọi index | `fillfactor = 80`; bỏ index thừa; theo dõi tỉ lệ HOT |
| Kỳ vọng Index Only Scan mà không `VACUUM` | **PostgreSQL** | `Heap Fetches` cao, mất tác dụng | Chỉnh autovacuum cho bảng ghi nhiều |
| Bỏ quên index INVALID sau `CONCURRENTLY` lỗi | **PostgreSQL** | Không giúp truy vấn nhưng vẫn làm chậm ghi | Rà `pg_index WHERE NOT indisvalid` |
| `ALTER TABLE ADD INDEX` không khai `LOCK=NONE` | **MySQL** | Có thể âm thầm khoá bảng | Luôn khai tường minh để **thất bại sớm** |
| Dùng chung một chiến lược index cho cả hai hệ | Cả hai | Bỏ lỡ ưu thế của từng hệ | Index bộ phận cho PG; covering theo khoá cho MySQL |
| Chèn khoá ngẫu nhiên | **MySQL** nặng hơn | Tách page kéo theo **cả dữ liệu** | Khoá tăng dần hoặc UUID v7 |

## Tóm tắt bài 6

- Khác biệt gốc: **PostgreSQL là heap + index rời** (mọi index trỏ `ctid`); **InnoDB là clustered index** (bảng chính là cây, index phụ trỏ tới khoá chính).
- Từ một khác biệt đó sinh ra **tám hệ quả**, và **không bên nào thắng tuyệt đối** — bên nào thắng phụ thuộc truy vấn của bạn đi qua đường nào nhiều hơn.
- **InnoDB nhanh hơn khi tra khoá chính** (1 chặng vs 2) và **quét theo thứ tự khoá chính**; **PostgreSQL nhanh hơn khi tra index phụ** (2 chặng vs 3).
- **Kích thước khoá chính lan toả vào mọi index phụ trên InnoDB** nhưng **không lan trên PostgreSQL** — nên lời khuyên "khoá chính phải nhỏ" quan trọng hơn nhiều với MySQL.
- **`UPDATE` một cột không được đánh index**: InnoDB không đụng index phụ nào; PostgreSQL đụng **mọi** index trừ khi đạt HOT update.
- **Index bộ phận là ưu thế thực tế lớn nhất của PostgreSQL** — cho hàng đợi công việc, nó nhỏ hơn tới **1.200 lần** và **tự nhỏ lại** khi công việc được xử lý.
- **`INCLUDE` của PostgreSQL** cho cây thấp hơn và nhận kiểu bất kỳ; nhưng **mọi index phụ của InnoDB đã tự động covering cho khoá chính**.
- MySQL `LOCK=NONE` **thất bại sớm** nếu không làm online được — an toàn hơn `CONCURRENTLY` của PostgreSQL, thứ có thể để lại **index INVALID** cần rà soát.

**Bài kế tiếp** → [Bài 7: NULLs trong Database và Write Amplification](06-nulls-va-write-amplification.md)

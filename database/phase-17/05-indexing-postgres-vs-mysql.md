# Bài 6: Indexing — PostgreSQL vs MySQL InnoDB

Cùng một câu lệnh `CREATE INDEX`, hai hệ, hai cấu trúc trên đĩa hoàn toàn khác nhau. Bài này đặt chúng cạnh nhau và giải thích hệ quả của từng khác biệt.

## Khác biệt gốc: lá của cây chứa gì

```text
   POSTGRESQL — HEAP + INDEX RIENG
   ═══════════════════════════════
   Index primary key           Index phu (tren name)
   ┌──────────────────┐        ┌──────────────────────┐
   │ 42 → ctid(1204,7)│        │ 'An' → ctid(1204,7)  │
   └────────┬─────────┘        └──────────┬───────────┘
            │                             │
            └──────────┬──────────────────┘
                       ▼
   HEAP (bang, ROI RAC, khong sap xep)
   ┌────────────────────────────────────────┐
   │ page 1204, khe 7:  42│An│1990-01-02│15000│
   └────────────────────────────────────────┘

   → CA HAI index deu tro THANG toi vi tri vat ly
   → Ca hai deu ton 2 chang


   MYSQL INNODB — CLUSTERED INDEX
   ══════════════════════════════
   Clustered index (CHINH LA BANG)     Index phu (tren name)
   ┌──────────────────────────────┐    ┌──────────────────┐
   │ LA: 42│An│1990-01-02│15000   │    │ 'An' → 42        │
   │     43│Binh│...              │    └────────┬─────────┘
   └──────────────────────────────┘             │ tro toi KHOA CHINH
              ▲                                 │
              └─────────────────────────────────┘
                     phai tra CLUSTERED INDEX lan nua

   → Tra khoa chinh: 1 chang  ✔
   → Tra index phu : 3 chang  ✘
```

Từ một khác biệt này sinh ra **tám** hệ quả.

---

## Hệ quả 1 — Số chặng tra cứu

```sql
-- Tra theo KHOA CHINH
SELECT * FROM users WHERE id = 42;
```

```text
   PostgreSQL : index → ctid → heap                    2 CHANG
   InnoDB     : clustered index → LA CO SAN DU LIEU    1 CHANG   ✔ nhanh hon
```

```sql
-- Tra theo INDEX PHU
SELECT * FROM users WHERE name = 'An';
```

```text
   PostgreSQL : index phu → ctid → heap                2 CHANG   ✔ nhanh hon
   InnoDB     : index phu → khoa chinh → clustered     3 CHANG
```

Không bên nào thắng tuyệt đối. Bên nào thắng phụ thuộc **truy vấn của bạn đi qua đường nào nhiều hơn**.

## Hệ quả 2 — Kích thước khoá chính lan toả

```text
   INNODB: index phu chua GIA TRI KHOA CHINH.
   → khoa chinh lon → MOI index phu phinh theo

   Bang 100 trieu dong, 5 index phu:
     PK = BIGINT (8 byte)   :  100tr × 8  × 5 =  4,0 GB
     PK = UUID CHAR(36)     :  100tr × 36 × 5 = 18,0 GB
                                                 ────────
                                       THEM 14 GB

   POSTGRESQL: index phu chua `ctid` (6 byte, CO DINH)
   → kich thuoc khoa chinh KHONG anh huong index phu
```

Đây là lý do lời khuyên "khoá chính phải nhỏ" **quan trọng hơn nhiều** trên InnoDB.

## Hệ quả 3 — `UPDATE` đụng vào đâu

```sql
UPDATE users SET last_login = now() WHERE id = 42;
-- 5 index, khong cai nao chua cot `last_login`
```

```text
   POSTGRESQL: tao PHIEN BAN MOI → ctid doi
               → PHAI cap nhat CA 5 index
               → ke ca index tren cot khong doi
               (tru khi dat HOT update)

   INNODB    : sua TAI CHO, khoa chinh khong doi
               → KHONG dung index phu nao   ✔
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
   INNODB    : dong da SAP XEP VAT LY theo khoa chinh
               → doc TUAN TU, cuc nhanh                    ✔

   POSTGRESQL: heap khong sap xep
               → index cho thu tu, nhung nhay NGAU NHIEN vao heap
```

Đo mức độ "còn sắp xếp" của bảng PostgreSQL:

```sql
SELECT attname, correlation FROM pg_stats
WHERE tablename = 'users' AND attname = 'id';
```

```text
 attname | correlation
---------+-------------
 id      |        0.98     ← gan 1 → van sap xep tot (bang chi noi them)
```

Sắp xếp lại một lần:

```sql
CLUSTER users USING users_pkey;   -- ⚠ KHOA TOAN BANG
```

Nhưng thứ tự này **không được duy trì** — dòng chèn sau đó lại nhét vào chỗ trống bất kỳ.

## Hệ quả 5 — Covering index

```sql
-- PostgreSQL 11+
CREATE INDEX idx ON users (name) INCLUDE (email, phone);

-- MySQL: khong co INCLUDE, phai dua vao KHOA
CREATE INDEX idx ON users (name, email, phone);
```

```text
   POSTGRESQL: `INCLUDE` de cot phu CHI O LA
     → nut trong nhe → cay THAP hon
     → cot phu co the la KIEU BAT KY (khong can so sanh duoc)

   MYSQL: phai dua het vao khoa
     → cot phu nam o MOI TANG → cay CAO hon
     → nhung BU LAI: index phu von da chua khoa chinh
       → `SELECT id FROM users WHERE name='An'` la index-only scan MIEN PHI
```

Dòng cuối là một ưu điểm ẩn của InnoDB: mọi index phụ đều **tự động covering cho khoá chính**.

## Hệ quả 6 — Index-Only Scan và visibility map

```text
   POSTGRESQL: index KHONG luu thong tin MVCC
     → phai kiem tra VISIBILITY MAP
     → chua VACUUM → `Heap Fetches` cao → mat tac dung

   INNODB: thong tin phien ban nam trong CLUSTERED INDEX
     → index phu van phai tra clustered de kiem tra
     → tru khi doc o muc READ UNCOMMITTED
```

```sql
-- PostgreSQL: kiem tra
EXPLAIN (ANALYZE) SELECT name FROM users WHERE name = 'An';
```

```text
Index Only Scan using idx_name on users
  Heap Fetches: 0          ← tot; neu > 0 thi can VACUUM
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
   INDEX BO PHAN — PostgreSQL co, MySQL KHONG
     CREATE INDEX idx ON jobs (created_at) WHERE status = 'pending';
     → 1,8 MB thay vi 2,1 GB  (nho hon ~1.200 lan)
     → day la mot trong nhung khac biet co gia tri thuc te lon nhat

   BRIN — cho bang rat lon co du lieu tuong quan thu tu vat ly
     Bang 1 ty dong: B-Tree ~30 GB, BRIN ~3 MB  (nho hon 10.000 lan)
```

MySQL có thể mô phỏng index bộ phận bằng cột ảo:

```sql
ALTER TABLE jobs ADD COLUMN pending_at DATETIME
  GENERATED ALWAYS AS (IF(status='pending', created_at, NULL)) VIRTUAL;
CREATE INDEX idx ON jobs (pending_at);
-- NULL khong duoc danh index → gan giong index bo phan
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
   MySQL: khai bao TUONG MINH ALGORITHM va LOCK
     → neu khong lam online duoc, no BAO LOI NGAY
     → "that bai som" — rat dang gia

   PostgreSQL: CONCURRENTLY co the THAT BAI GIUA CHUNG
     → de lai index INVALID: khong duoc dung, nhung VAN lam cham ghi
     → phai ra soat dinh ky
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
-- Truy van nong
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
   → Index Only Scan, KHONG cham heap
   → `INCLUDE` de total/status chi o la → cay thap
   → nho VACUUM de giu Heap Fetches = 0
```

**Trên MySQL:**

```sql
CREATE INDEX idx_orders_user_time ON orders (user_id, created_at DESC, total, status);
```

```text
   → Covering index, khong tra clustered index
   → `id` (khoa chinh) DA CO SAN trong moi index phu → khong can them
   → nen dam bao khoa chinh NHO
```

### Bài toán: bảng hàng đợi công việc

```sql
-- Truy van nong: lay viec dang cho
SELECT * FROM jobs WHERE status = 'pending' ORDER BY created_at LIMIT 10;
```

**Trên PostgreSQL:**

```sql
CREATE INDEX idx_jobs_pending ON jobs (created_at) WHERE status = 'pending';
```

```text
   → Index BO PHAN: chi chua ~5.000 dong dang cho
   → 1,8 MB thay vi 2,1 GB
   → va no TU NHO LAI khi cong viec duoc xu ly xong
```

**Trên MySQL:**

```sql
CREATE INDEX idx_jobs_status_time ON jobs (status, created_at);
```

```text
   → Index DAY DU tren ca 100 trieu dong
   → 2,1 GB
   → hoac mo phong bang cot ao (phuc tap hon)
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

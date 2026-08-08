# Bài 2: Lưu trữ dữ liệu trên đĩa và kiến trúc PostgreSQL

Bài này mở nắp máy: xem chính xác PostgreSQL để những file gì ở đâu, tiến trình nào làm việc gì, và bộ nhớ được chia thế nào. Sau bài này, khi có sự cố bạn sẽ biết **nhìn vào đâu**.

## Kiến trúc tiến trình

PostgreSQL là **đa tiến trình**, không phải đa luồng:

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  POSTMASTER  (tiến trình cha)                                │
   │   • lắng nghe cổng 5432                                      │
   │   • fork() một tiến trình con cho MỖI kết nối                │
   │   • khởi động và giám sát các tiến trình nền                 │
   └──────────┬───────────────────────────────────────────────────┘
              │
     ┌────────┼────────────────────────────────────────────┐
     ▼        ▼                                            ▼
   ┌──────┐ ┌──────┐                              ┌─────────────────┐
   │BACKEND│ │BACKEND│  ... 1 tiến trình          │ TIẾN TRÌNH NỀN  │
   │ #1   │ │ #2   │      mỗi kết nối             ├─────────────────┤
   └──────┘ └──────┘                              │ • checkpointer  │
                                                  │ • background    │
                                                  │   writer        │
                                                  │ • WAL writer    │
                                                  │ • autovacuum    │
                                                  │   launcher      │
                                                  │ • stats collector│
                                                  │ • WAL sender ×N │
                                                  │ • logger        │
                                                  └─────────────────┘
```

Xem chúng trên máy thật:

```bash
ps -ef | grep postgres
```

```text
postgres  1284     1  postgres
postgres  1291  1284  postgres: checkpointer
postgres  1292  1284  postgres: background writer
postgres  1293  1284  postgres: walwriter
postgres  1294  1284  postgres: autovacuum launcher
postgres  1295  1284  postgres: logical replication launcher
postgres  8842  1284  postgres: app mydb 10.0.1.5(52118) idle
postgres  8843  1284  postgres: app mydb 10.0.1.6(52119) SELECT
```

Hai dòng cuối là **kết nối của ứng dụng** — mỗi cái là một tiến trình hệ điều hành riêng, tốn 5-10 MB. Đây là lý do connection pool quan trọng đến vậy ([phase-8 bài 3](../phase-8/03-connection-pooling.md)).

### Từng tiến trình nền làm gì

| Tiến trình | Nhiệm vụ | Chỉnh bằng |
|---|---|---|
| **checkpointer** | Định kỳ dồn page bẩn xuống đĩa, đánh dấu điểm phục hồi | `checkpoint_timeout`, `max_wal_size` |
| **background writer** | Ghi dần page bẩn ra để backend không phải tự ghi | `bgwriter_delay`, `bgwriter_lru_maxpages` |
| **WAL writer** | Đẩy WAL từ bộ đệm xuống đĩa | `wal_writer_delay` |
| **autovacuum launcher** | Khởi động các worker dọn tuple chết | `autovacuum_max_workers` |
| **WAL sender** | Gửi WAL cho replica (một tiến trình mỗi replica) | `max_wal_senders` |
| **archiver** | Chép file WAL sang nơi lưu trữ (cho PITR) | `archive_command` |

Điểm đáng chú ý về **background writer**: nếu nó không kịp, các tiến trình backend phải **tự ghi page bẩn** trước khi lấy được page trống — và đó là lúc truy vấn của người dùng đột nhiên chậm đi.

```sql
SELECT buffers_checkpoint, buffers_clean, buffers_backend
FROM pg_stat_bgwriter;
```

```text
 buffers_checkpoint | buffers_clean | buffers_backend
--------------------+---------------+-----------------
           12849302 |       4118822 |         8842119
                                              ▲
                    BACKEND tự ghi 8,8 triệu page — QUÁ CAO
```

`buffers_backend` cao nghĩa là background writer không theo kịp. Chỉnh:

```sql
ALTER SYSTEM SET bgwriter_lru_maxpages = 500;   -- mặc định 100
ALTER SYSTEM SET bgwriter_delay = '100ms';      -- mặc định 200ms
```

---

## Bố cục thư mục dữ liệu

```bash
ls -la /var/lib/postgresql/data/
```

```text
base/              ← DỮ LIỆU THẬT (mỗi database một thư mục)
global/            ← catalog dùng chung toàn cụm (pg_database, pg_authid)
pg_wal/            ← file WAL
pg_xact/           ← trạng thái commit của từng transaction
pg_multixact/      ← khoá nhiều transaction trên một dòng
pg_subtrans/       ← sub-transaction (SAVEPOINT)
pg_tblspc/         ← liên kết tới các tablespace ngoài
pg_stat/           ← thống kê lưu bền
pg_logical/        ← trạng thái nhân bản logic
postgresql.conf    ← cấu hình chính
pg_hba.conf        ← quy tắc xác thực
postmaster.pid     ← PID và thông tin tiến trình đang chạy
```

### Tìm file của một bảng cụ thể

```sql
SELECT pg_relation_filepath('orders');
```

```text
 pg_relation_filepath
----------------------
 base/16384/24576
      ▲     ▲
      │     └ OID của bảng (filenode)
      └ OID của database
```

```bash
ls -la /var/lib/postgresql/data/base/16384/24576*
```

```text
-rw------- 1 postgres postgres 1073741824 Aug  8 10:31 24576
-rw------- 1 postgres postgres  742391808 Aug  8 10:31 24576.1
-rw------- 1 postgres postgres     262144 Aug  8 10:31 24576_fsm
-rw------- 1 postgres postgres      65536 Aug  8 10:31 24576_vm
```

Bốn file, mỗi cái một vai trò:

```text
   24576       →  dữ liệu chính.  Tối đa 1 GB mỗi file.
   24576.1     →  phần tiếp theo (bảng 1,7 GB → hai file)
   24576_fsm   →  FREE SPACE MAP: page nào còn chỗ trống
                  → INSERT dùng để tìm chỗ nhanh
   24576_vm    →  VISIBILITY MAP: page nào "mọi dòng đều nhìn thấy được"
                  → INDEX ONLY SCAN dựa vào đây  ← nhớ [phase-4 bài 2]
                  → VACUUM cũng dựa vào đây để bỏ qua page sạch
```

Giới hạn 1 GB mỗi file là chủ đích: nó tương thích với các hệ tập tin cũ có giới hạn 2 GB, và làm việc sao chép/di chuyển dễ hơn.

### Vì sao `_vm` quan trọng đến vậy

```text
   Index KHÔNG lưu thông tin MVCC.
   → Index Only Scan phải kiểm tra dòng còn sống không

   Visibility map cho phép TRẢ LỜI MÀ KHÔNG VÀO HEAP:
     bit bật  →  "mọi dòng trong page này đều nhìn thấy được" → tin index
     bit tắt  →  phải vào heap kiểm tra

   CHỈ `VACUUM` mới bật bit đó.
   → Vừa ghi nhiều mà chưa VACUUM → Heap Fetches cao → Index Only Scan mất tác dụng
```

---

## Bố cục bộ nhớ

```text
   ┌─ BỘ NHỚ DÙNG CHUNG (mọi tiến trình đều thấy) ─────────────┐
   │                                                          │
   │  shared_buffers            (mặc định 128 MB → đặt 25% RAM)│
   │    └ cache page dữ liệu và index                         │
   │                                                          │
   │  wal_buffers               (mặc định 1/32 shared_buffers) │
   │    └ đệm WAL trước khi ghi xuống đĩa                     │
   │                                                          │
   │  Bảng khoá, bảng tiến trình, thống kê                    │
   └──────────────────────────────────────────────────────────┘

   ┌─ BỘ NHỚ RIÊNG (MỖI KẾT NỐI một bản) ─────────────────────┐
   │                                                          │
   │  work_mem            (mặc định 4 MB)                     │
   │    └ sắp xếp, bảng băm                                   │
   │    ⚠ MỖI THAO TÁC, MỖI KẾT NỐI — không phải tổng         │
   │                                                          │
   │  maintenance_work_mem (mặc định 64 MB)                   │
   │    └ CREATE INDEX, VACUUM, ALTER TABLE                   │
   │                                                          │
   │  temp_buffers        (mặc định 8 MB)                     │
   │    └ bảng tạm                                            │
   └──────────────────────────────────────────────────────────┘
```

### Cái bẫy `work_mem`

Đây là tham số gây sự cố hết bộ nhớ nhiều nhất:

```text
   `work_mem` KHÔNG phải giới hạn tổng.
   Nó là giới hạn cho MỖI THAO TÁC SẮP XẾP/BĂM, trong MỖI KẾT NỐI.

   Một truy vấn có 4 phép sắp xếp + 3 phép hash join = 7 thao tác.
   50 kết nối cùng chạy truy vấn đó:

      50 × 7 × work_mem

   Với work_mem = 512 MB  →  50 × 7 × 512 MB = 179 GB
   → OOM killer giet PostgreSQL
```

Cách an toàn: giữ mặc định thấp, nâng **theo từng truy vấn**:

```sql
BEGIN;
SET LOCAL work_mem = '512MB';     -- chỉ cho truy vấn báo cáo này
SELECT ... ORDER BY ...;
COMMIT;
```

Phát hiện `work_mem` không đủ:

```sql
ALTER SYSTEM SET log_temp_files = 0;   -- ghi log MỌI file tạm
SELECT pg_reload_conf();
```

```sql
SELECT datname, temp_files, pg_size_pretty(temp_bytes) AS tong_tam
FROM pg_stat_database WHERE temp_files > 0 ORDER BY temp_bytes DESC;
```

Và trong `EXPLAIN`:

```text
Sort Method: external merge  Disk: 27912kB     ← TRÀN RA ĐĨA, work_mem không đủ
Sort Method: quicksort  Memory: 4218kB         ← vừa trong RAM, tốt
```

### `shared_buffers` — vì sao chỉ 25%?

```text
   PostgreSQL DỰA VÀO CACHE CỦA HỆ ĐIỀU HÀNH như một lớp thứ hai.
   Đặt shared_buffers quá cao (> 40%) gây CACHE HAI LẦN:
     cùng một page nằm cả trong shared_buffers LẪN trong page cache của HĐH
   → lang phi RAM

   MySQL InnoDB thì ngược lại: đặt 50-75% VÀ dùng O_DIRECT
   để BỎ QUA cache HĐH hoàn toàn.
```

Đây là khác biệt thiết kế, không phải một bên đúng một bên sai.

```sql
ALTER SYSTEM SET shared_buffers = '8GB';           -- 25% của 32 GB
ALTER SYSTEM SET effective_cache_size = '24GB';    -- 75% — chỉ là GỢI Ý cho planner
```

`effective_cache_size` **không cấp phát gì cả** — nó chỉ nói với planner "khoảng ngần này dữ liệu có thể đang nằm trong cache", để planner ước lượng chi phí index scan chính xác hơn.

---

## Đường đi của một truy vấn qua các tầng

```text
   ┌─ 1. KẾT NỐI ────────────────────────────────────────────────┐
   │  postmaster nhận kết nối → fork() một backend mới           │
   │  → 1-5 ms, và ~5-10 MB RAM                                  │
   └────────────────────────────┬────────────────────────────────┘
   ┌─ 2. PARSER ────────────────▼────────────────────────────────┐
   │  Kiểm tra cú pháp → cây cú pháp                             │
   │  Tra catalog: bảng có tồn tại? cột có đúng kiểu?            │
   └────────────────────────────┬────────────────────────────────┘
   ┌─ 3. REWRITER ──────────────▼────────────────────────────────┐
   │  Thay VIEW bằng định nghĩa của nó                           │
   │  Áp dụng quy tắc RULE, và điều kiện Row Level Security      │
   └────────────────────────────┬────────────────────────────────┘
   ┌─ 4. PLANNER ───────────────▼────────────────────────────────┐
   │  Đọc pg_statistic → ước lượng số dòng                       │
   │  Sinh các phương án, tính cost, chọn cái rẻ nhất            │
   │  → đây là bước `EXPLAIN` cho bạn xem                        │
   └────────────────────────────┬────────────────────────────────┘
   ┌─ 5. EXECUTOR ──────────────▼────────────────────────────────┐
   │  Chạy cây kế hoạch                                          │
   │  Xin page từ shared_buffers → không có thì đọc đĩa          │
   │  Kiểm tra MVCC: phiên bản này có thuộc snapshot của tôi?    │
   │  Lấy khoá nếu cần ghi                                       │
   │  Ghi WAL nếu có thay đổi                                    │
   └────────────────────────────┬────────────────────────────────┘
                                ▼
                       Trả kết quả qua giao thức
```

Bước 3 chứa một chi tiết ít người biết: **Row Level Security được áp ở tầng rewriter**, nghĩa là điều kiện chính sách được **thêm vào câu truy vấn** trước khi lập kế hoạch — nên nó cũng ảnh hưởng tới kế hoạch được chọn.

---

## Tablespace — đặt dữ liệu ở ổ đĩa khác

```sql
CREATE TABLESPACE fast_ssd LOCATION '/mnt/nvme/pgdata';
CREATE TABLESPACE cold_hdd LOCATION '/mnt/hdd/pgdata';

-- Bảng nóng trên NVMe
ALTER TABLE orders SET TABLESPACE fast_ssd;

-- Dữ liệu cũ trên HDD rẻ
ALTER TABLE events_2024 SET TABLESPACE cold_hdd;

-- Index trên ổ riêng
CREATE INDEX idx_orders_user ON orders (user_id) TABLESPACE fast_ssd;
```

Ba cách dùng thực tế:

```text
   1. PHÂN TẦNG LƯU TRỮ
      Mảnh gần đây → NVMe;  mảnh cũ → HDD
      → kết hợp với partitioning ([phase-6])

   2. TACH WAL RA O RIENG
      WAL là ghi TUẦN TỰ liên tục;  dữ liệu là ghi NGẪU NHIÊN
      → để chung nhau thì chúng tranh đầu đọc/hàng đợi I/O

   3. TÁCH INDEX KHỎI DỮ LIỆU
      Trong một truy vấn, index và heap được đọc GẦN NHƯ ĐỒNG THỜI
      → ổ riêng cho phép song song thật
```

Cảnh báo:

```text
   ⚠ ALTER TABLE ... SET TABLESPACE KHOÁ BẢNG và CHÉP TOÀN BỘ dữ liệu.
     Bảng 500 GB → hàng giờ không dùng được.
     → Làm trong cửa sổ bảo trì, hoặc dùng pg_repack --tablespace
```

---

## Bảng chỉnh cấu hình theo dung lượng RAM

| Tham số | 8 GB RAM | 32 GB RAM | 128 GB RAM |
|---|---|---|---|
| `shared_buffers` | 2 GB | 8 GB | 32 GB |
| `effective_cache_size` | 6 GB | 24 GB | 96 GB |
| `work_mem` | 8 MB | 32 MB | 64 MB |
| `maintenance_work_mem` | 512 MB | 2 GB | 4 GB |
| `max_wal_size` | 2 GB | 8 GB | 16 GB |
| `max_connections` | 100 | 200 | 300 |
| `random_page_cost` | **1.1** (SSD) | **1.1** | **1.1** |
| `checkpoint_completion_target` | 0.9 | 0.9 | 0.9 |
| `wal_compression` | zstd | zstd | zstd |

Hai lưu ý về bảng này:

```text
   • `max_connections` cao KHÔNG phải lựa chọn tốt ([phase-8 bài 3]).
     Con số trên giả định CÓ connection pool phía trước.
     Không có pool thì phải tính lại theo (lõi × 2) + số đĩa.

   • `work_mem` phải nhân với (số kết nối × số thao tác mỗi truy vấn).
     Con số trên là BẢO THỦ có chủ đích.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Đặt `work_mem` cao toàn cục | `50 kết nối × 7 thao tác × 512 MB = 179 GB` → OOM | Giữ thấp; nâng bằng `SET LOCAL` cho truy vấn cụ thể |
| Đặt `shared_buffers` > 40% RAM | Cache hai lần với page cache của HĐH | 25% cho PostgreSQL (khác MySQL) |
| Nhầm `effective_cache_size` là cấp phát | Nó chỉ là gợi ý cho planner | Đặt 50-75% RAM, không lo tốn |
| Bỏ qua `buffers_backend` cao | Backend tự ghi page bẩn → truy vấn người dùng chậm bất chợt | Tăng `bgwriter_lru_maxpages` |
| `ALTER TABLE SET TABLESPACE` trên bảng lớn giờ cao điểm | Khoá bảng hàng giờ | Cửa sổ bảo trì, hoặc `pg_repack --tablespace` |
| Không theo dõi `temp_files` | `work_mem` không đủ, sắp xếp tràn ra đĩa âm thầm | `log_temp_files = 0`; xem `pg_stat_database.temp_bytes` |
| Để `_vm` cũ (không `VACUUM`) | `Index Only Scan` mất tác dụng | Chỉnh autovacuum cho bảng ghi nhiều |
| Để WAL cùng ổ với dữ liệu ở tải cao | Ghi tuần tự và ghi ngẫu nhiên tranh nhau | Tablespace riêng cho `pg_wal` |

## Tóm tắt bài 2

- PostgreSQL là **đa tiến trình**: mỗi kết nối là một tiến trình hệ điều hành riêng tốn 5-10 MB — lý do connection pool quan trọng đến vậy.
- Sáu tiến trình nền, trong đó **background writer** đáng theo dõi nhất: `buffers_backend` cao nghĩa là backend phải tự ghi page bẩn, và đó là lúc truy vấn người dùng chậm bất chợt.
- Mỗi bảng có **bốn file**: dữ liệu (tối đa 1 GB mỗi phần), **`_fsm`** (chỗ trống), **`_vm`** (visibility map — nền tảng của `Index Only Scan` và của `VACUUM`).
- **`work_mem` là bẫy bộ nhớ nguy hiểm nhất**: nó áp cho **mỗi thao tác, mỗi kết nối**, nên `50 × 7 × 512 MB = 179 GB`. Giữ thấp toàn cục, nâng bằng `SET LOCAL`.
- **`shared_buffers` chỉ 25%** vì PostgreSQL dựa thêm vào page cache của hệ điều hành — ngược với InnoDB (50-75% + `O_DIRECT`). Đây là khác biệt thiết kế, không phải một bên sai.
- **`effective_cache_size` không cấp phát gì** — nó chỉ là gợi ý giúp planner ước lượng chi phí index scan chính xác hơn.
- **Row Level Security được áp ở tầng rewriter**, trước khi lập kế hoạch — nên nó ảnh hưởng tới kế hoạch được chọn.
- **Tablespace** cho phép phân tầng lưu trữ, tách WAL và tách index sang ổ riêng — nhưng `SET TABLESPACE` **khoá bảng và chép toàn bộ dữ liệu**.

**Bài kế tiếp** → [Bài 3: Thảo luận - UUID làm Primary Key và PostgreSQL vs MySQL](02-thao-luan-uuid-pk-va-postgres-vs-mysql.md)

# Bài 2: Lưu trữ dữ liệu trên đĩa và kiến trúc PostgreSQL

Bài này mở nắp máy: xem chính xác PostgreSQL để những file gì ở đâu, tiến trình nào làm việc gì, và bộ nhớ được chia thế nào. Sau bài này, khi có sự cố bạn sẽ biết **nhìn vào đâu**.

## Kiến trúc tiến trình

PostgreSQL là **đa tiến trình**, không phải đa luồng:

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  POSTMASTER  (tien trinh cha)                                │
   │   • lang nghe cong 5432                                      │
   │   • fork() mot tien trinh con cho MOI ket noi                │
   │   • khoi dong va giam sat cac tien trinh nen                 │
   └──────────┬───────────────────────────────────────────────────┘
              │
     ┌────────┼────────────────────────────────────────────┐
     ▼        ▼                                            ▼
   ┌──────┐ ┌──────┐                              ┌─────────────────┐
   │BACKEND│ │BACKEND│  ... 1 tien trinh          │ TIEN TRINH NEN  │
   │ #1   │ │ #2   │      moi ket noi             ├─────────────────┤
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
                    BACKEND tu ghi 8,8 trieu page — QUA CAO
```

`buffers_backend` cao nghĩa là background writer không theo kịp. Chỉnh:

```sql
ALTER SYSTEM SET bgwriter_lru_maxpages = 500;   -- mac dinh 100
ALTER SYSTEM SET bgwriter_delay = '100ms';      -- mac dinh 200ms
```

---

## Bố cục thư mục dữ liệu

```bash
ls -la /var/lib/postgresql/data/
```

```text
base/              ← DU LIEU THAT (moi database mot thu muc)
global/            ← catalog dung chung toan cum (pg_database, pg_authid)
pg_wal/            ← file WAL
pg_xact/           ← trang thai commit cua tung transaction
pg_multixact/      ← khoa nhieu transaction tren mot dong
pg_subtrans/       ← sub-transaction (SAVEPOINT)
pg_tblspc/         ← lien ket toi cac tablespace ngoai
pg_stat/           ← thong ke luu ben
pg_logical/        ← trang thai nhan ban logic
postgresql.conf    ← cau hinh chinh
pg_hba.conf        ← quy tac xac thuc
postmaster.pid     ← PID va thong tin tien trinh dang chay
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
      │     └ OID cua bang (filenode)
      └ OID cua database
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
   24576       →  du lieu chinh.  Toi da 1 GB moi file.
   24576.1     →  phan tiep theo (bang 1,7 GB → hai file)
   24576_fsm   →  FREE SPACE MAP: page nao con cho trong
                  → INSERT dung de tim cho nhanh
   24576_vm    →  VISIBILITY MAP: page nao "moi dong deu nhin thay duoc"
                  → INDEX ONLY SCAN dua vao day  ← nho [phase-4 bai 2]
                  → VACUUM cung dua vao day de bo qua page sach
```

Giới hạn 1 GB mỗi file là chủ đích: nó tương thích với các hệ tập tin cũ có giới hạn 2 GB, và làm việc sao chép/di chuyển dễ hơn.

### Vì sao `_vm` quan trọng đến vậy

```text
   Index KHONG luu thong tin MVCC.
   → Index Only Scan phai kiem tra dong con song khong

   Visibility map cho phep TRA LOI MA KHONG VAO HEAP:
     bit bat  →  "moi dong trong page nay deu nhin thay duoc" → tin index
     bit tat  →  phai vao heap kiem tra

   CHI `VACUUM` moi bat bit do.
   → Vua ghi nhieu ma chua VACUUM → Heap Fetches cao → Index Only Scan mat tac dung
```

---

## Bố cục bộ nhớ

```text
   ┌─ BO NHO DUNG CHUNG (moi tien trinh deu thay) ─────────────┐
   │                                                          │
   │  shared_buffers            (mac dinh 128 MB → dat 25% RAM)│
   │    └ cache page du lieu va index                         │
   │                                                          │
   │  wal_buffers               (mac dinh 1/32 shared_buffers) │
   │    └ dem WAL truoc khi ghi xuong dia                     │
   │                                                          │
   │  Bang khoa, bang tien trinh, thong ke                    │
   └──────────────────────────────────────────────────────────┘

   ┌─ BO NHO RIENG (MOI KET NOI mot ban) ─────────────────────┐
   │                                                          │
   │  work_mem            (mac dinh 4 MB)                     │
   │    └ sap xep, bang bam                                   │
   │    ⚠ MOI THAO TAC, MOI KET NOI — khong phai tong         │
   │                                                          │
   │  maintenance_work_mem (mac dinh 64 MB)                   │
   │    └ CREATE INDEX, VACUUM, ALTER TABLE                   │
   │                                                          │
   │  temp_buffers        (mac dinh 8 MB)                     │
   │    └ bang tam                                            │
   └──────────────────────────────────────────────────────────┘
```

### Cái bẫy `work_mem`

Đây là tham số gây sự cố hết bộ nhớ nhiều nhất:

```text
   `work_mem` KHONG phai gioi han tong.
   No la gioi han cho MOI THAO TAC SAP XEP/BAM, trong MOI KET NOI.

   Mot truy van co 4 phep sap xep + 3 phep hash join = 7 thao tac.
   50 ket noi cung chay truy van do:

      50 × 7 × work_mem

   Voi work_mem = 512 MB  →  50 × 7 × 512 MB = 179 GB
   → OOM killer giet PostgreSQL
```

Cách an toàn: giữ mặc định thấp, nâng **theo từng truy vấn**:

```sql
BEGIN;
SET LOCAL work_mem = '512MB';     -- chi cho truy van bao cao nay
SELECT ... ORDER BY ...;
COMMIT;
```

Phát hiện `work_mem` không đủ:

```sql
ALTER SYSTEM SET log_temp_files = 0;   -- ghi log MOI file tam
SELECT pg_reload_conf();
```

```sql
SELECT datname, temp_files, pg_size_pretty(temp_bytes) AS tong_tam
FROM pg_stat_database WHERE temp_files > 0 ORDER BY temp_bytes DESC;
```

Và trong `EXPLAIN`:

```text
Sort Method: external merge  Disk: 27912kB     ← TRAN RA DIA, work_mem khong du
Sort Method: quicksort  Memory: 4218kB         ← vua trong RAM, tot
```

### `shared_buffers` — vì sao chỉ 25%?

```text
   PostgreSQL DUA VAO CACHE CUA HE DIEU HANH nhu mot lop thu hai.
   Dat shared_buffers qua cao (> 40%) gay CACHE HAI LAN:
     cung mot page nam ca trong shared_buffers LAN trong page cache cua HDH
   → lang phi RAM

   MySQL InnoDB thi nguoc lai: dat 50-75% VA dung O_DIRECT
   de BO QUA cache HDH hoan toan.
```

Đây là khác biệt thiết kế, không phải một bên đúng một bên sai.

```sql
ALTER SYSTEM SET shared_buffers = '8GB';           -- 25% cua 32 GB
ALTER SYSTEM SET effective_cache_size = '24GB';    -- 75% — chi la GOI Y cho planner
```

`effective_cache_size` **không cấp phát gì cả** — nó chỉ nói với planner "khoảng ngần này dữ liệu có thể đang nằm trong cache", để planner ước lượng chi phí index scan chính xác hơn.

---

## Đường đi của một truy vấn qua các tầng

```text
   ┌─ 1. KET NOI ────────────────────────────────────────────────┐
   │  postmaster nhan ket noi → fork() mot backend moi           │
   │  → 1-5 ms, va ~5-10 MB RAM                                  │
   └────────────────────────────┬────────────────────────────────┘
   ┌─ 2. PARSER ────────────────▼────────────────────────────────┐
   │  Kiem tra cu phap → cay cu phap                             │
   │  Tra catalog: bang co ton tai? cot co dung kieu?            │
   └────────────────────────────┬────────────────────────────────┘
   ┌─ 3. REWRITER ──────────────▼────────────────────────────────┐
   │  Thay VIEW bang dinh nghia cua no                           │
   │  Ap dung quy tac RULE, va dieu kien Row Level Security      │
   └────────────────────────────┬────────────────────────────────┘
   ┌─ 4. PLANNER ───────────────▼────────────────────────────────┐
   │  Doc pg_statistic → uoc luong so dong                       │
   │  Sinh cac phuong an, tinh cost, chon cai re nhat            │
   │  → day la buoc `EXPLAIN` cho ban xem                        │
   └────────────────────────────┬────────────────────────────────┘
   ┌─ 5. EXECUTOR ──────────────▼────────────────────────────────┐
   │  Chay cay ke hoach                                          │
   │  Xin page tu shared_buffers → khong co thi doc dia          │
   │  Kiem tra MVCC: phien ban nay co thuoc snapshot cua toi?    │
   │  Lay khoa neu can ghi                                       │
   │  Ghi WAL neu co thay doi                                    │
   └────────────────────────────┬────────────────────────────────┘
                                ▼
                       Tra ket qua qua giao thuc
```

Bước 3 chứa một chi tiết ít người biết: **Row Level Security được áp ở tầng rewriter**, nghĩa là điều kiện chính sách được **thêm vào câu truy vấn** trước khi lập kế hoạch — nên nó cũng ảnh hưởng tới kế hoạch được chọn.

---

## Tablespace — đặt dữ liệu ở ổ đĩa khác

```sql
CREATE TABLESPACE fast_ssd LOCATION '/mnt/nvme/pgdata';
CREATE TABLESPACE cold_hdd LOCATION '/mnt/hdd/pgdata';

-- Bang nong tren NVMe
ALTER TABLE orders SET TABLESPACE fast_ssd;

-- Du lieu cu tren HDD re
ALTER TABLE events_2024 SET TABLESPACE cold_hdd;

-- Index tren o rieng
CREATE INDEX idx_orders_user ON orders (user_id) TABLESPACE fast_ssd;
```

Ba cách dùng thực tế:

```text
   1. PHAN TANG LUU TRU
      Manh gan day → NVMe;  manh cu → HDD
      → ket hop voi partitioning ([phase-6])

   2. TACH WAL RA O RIENG
      WAL la ghi TUAN TU lien tuc;  du lieu la ghi NGAU NHIEN
      → de chung nhau thi chung tranh dau doc/hang doi I/O

   3. TACH INDEX KHOI DU LIEU
      Trong mot truy van, index va heap duoc doc GAN NHU DONG THOI
      → o rieng cho phep song song that
```

Cảnh báo:

```text
   ⚠ ALTER TABLE ... SET TABLESPACE KHOA BANG va CHEP TOAN BO du lieu.
     Bang 500 GB → hang gio khong dung duoc.
     → Lam trong cua so bao tri, hoac dung pg_repack --tablespace
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
   • `max_connections` cao KHONG phai lua chon tot ([phase-8 bai 3]).
     Con so tren gia dinh CO connection pool phia truoc.
     Khong co pool thi phai tinh lai theo (loi × 2) + so dia.

   • `work_mem` phai nhan voi (so ket noi × so thao tac moi truy van).
     Con so tren la BAO THU co chu dich.
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

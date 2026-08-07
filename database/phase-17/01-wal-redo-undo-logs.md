# Bài 1: WAL, Redo và Undo Logs — nền tảng của Durability

Ba từ này hay bị dùng lẫn lộn, và chúng **không phải là một**:

```text
   WAL   →  TEN GOI CUA CO CHE  (Write-Ahead Logging): ghi nhat ky TRUOC khi sua
   REDO  →  thong tin de LAM LAI  thay doi sau su co
   UNDO  →  thong tin de HOAN TAC thay doi khi rollback
```

Một hệ có thể có cả ba, hoặc gộp chúng lại. Bài này tách bạch chúng, rồi cho thấy PostgreSQL và MySQL giải cùng bài toán bằng hai cách hoàn toàn khác nhau.

## Vấn đề gốc

```text
   Ban muon sua 4 dong nam o 4 page khac nhau, roi COMMIT.

   CACH NGAY THO: ghi ca 4 page xuong dia truoc khi tra ve "da commit"
     → 4 lan ghi NGAU NHIEN + 4 lan fsync
     → tren SSD: ~4 × 100 µs = 400 µs, chua ke tim kiem
     → va neu mat dien giua chung: 2 page moi, 2 page cu → DU LIEU NUA VOI
```

Hai vấn đề: **chậm**, và **không nguyên tử**.

## Lời giải: ghi nhật ký trước

```text
   QUY TAC WAL (bat di bat dich):
     Ban ghi nhat ky mo ta mot thay doi phai NAM YEN TREN DIA
     TRUOC KHI page chua thay doi do duoc phep xuong dia.
```

```text
   ┌─ COMMIT ────────────────────────────────────────────────────┐
   │  1. Ghi vao cuoi file WAL (GHI TUAN TU):                    │
   │       [LSN 0/15A3B] page 4201: byte 128, 'new' → 'paid'     │
   │       [LSN 0/15A5C] page  887: them khoa index              │
   │       [LSN 0/15A6D] COMMIT XID 12345                        │
   │  2. fsync MOT LAN                                           │
   │  3. Tra ve "da commit"       ← XONG, RAT NHANH              │
   │                                                             │
   │  Cac page du lieu that? Cu nam BAN trong RAM.               │
   │  CHECKPOINT sau nay se don.                                 │
   └─────────────────────────────────────────────────────────────┘
```

Hai tính chất làm mẹo này hoạt động:

```text
   1. GHI TUAN TU nhanh hon GHI NGAU NHIEN rat nhieu
      HDD: chenh hang tram lan.  SSD: van chenh vai lan.

   2. BAN GHI WAL NHO HON PAGE nhieu
      "doi o nay tu X sang Y" = vai chuc byte
      ghi ca page = 8.192 byte
```

---

## Redo vs Undo — hai loại thông tin khác nhau

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ REDO — "gia tri MOI la gi"                                   │
   │   Dung khi: khoi dong lai sau su co                          │
   │   Muc dich: LAM LAI cac thay doi DA COMMIT nhung page chua   │
   │             kip xuong dia                                    │
   │   Vi du:  "page 4201, byte 128 = 'paid'"                     │
   ├──────────────────────────────────────────────────────────────┤
   │ UNDO — "gia tri CU la gi"                                    │
   │   Dung khi: ROLLBACK, hoac doc phien ban cu (MVCC)           │
   │   Muc dich: HOAN TAC cac thay doi CHUA COMMIT                │
   │   Vi du:  "page 4201, byte 128 truoc do la 'pending'"        │
   └──────────────────────────────────────────────────────────────┘
```

### Quá trình phục hồi sau sự cố

```text
   MAT DIEN. KHOI DONG LAI.

   GIAI DOAN 1 — PHAN TICH
     Doc WAL tu CHECKPOINT gan nhat
     Xac dinh: transaction nao DA commit, transaction nao DANG DO

   GIAI DOAN 2 — REDO
     Lam lai MOI thay doi tu checkpoint tro di
     (ke ca cua transaction chua commit — se hoan tac o giai doan 3)
     → dua database ve dung trang thai luc mat dien

   GIAI DOAN 3 — UNDO
     Hoan tac cac transaction DANG DO
     → dua ve trang thai NHAT QUAN
```

Điểm phản trực giác ở giai đoạn 2: **nó làm lại cả những thay đổi chưa commit**. Lý do là để dựng lại chính xác trạng thái tại thời điểm sự cố, rồi mới hoàn tác — đơn giản hơn nhiều so với việc vừa đọc vừa lọc.

Nhìn thấy quá trình này trong log:

```bash
docker kill pg-lab && docker start pg-lab && sleep 3 && docker logs pg-lab --tail 8
```

```text
LOG:  database system was not properly shut down; automatic recovery in progress
LOG:  redo starts at 0/1573C48
LOG:  invalid record length at 0/15764A0: wanted 24, got 0
LOG:  redo done at 0/1576468 system usage: CPU: ... elapsed: 0.01 s
LOG:  database system is ready to accept connections
```

---

## PostgreSQL: WAL chứa cả redo, undo nằm trong bảng

Đây là điểm khác biệt kiến trúc lớn nhất so với MySQL:

```text
   POSTGRESQL KHONG CO UNDO LOG.

   Vi sao khong can?  Vi no KHONG SUA TAI CHO:
     UPDATE = tao mot PHIEN BAN MOI cua dong, ngay trong bang
     → phien ban CU van nam do
     → "undo" chinh la: bo qua phien ban moi

   ROLLBACK = ghi mot dau "XID 12345 da huy"
     → moi phien ban do XID do tao ra tu dong VO HINH
     → GAN NHU TUC THI, bat ke da sua bao nhieu dong
```

```text
   BANG SAU MOT UPDATE:
   ┌────┬─────────┬─────────┬─────────┐
   │ id │ balance │  xmin   │  xmax   │
   ├────┼─────────┼─────────┼─────────┤
   │  1 │ 1000000 │   50    │   77    │  ← phien ban CU (bi XID 77 thay)
   │  1 │  900000 │   77    │    —    │  ← phien ban MOI
   └────┴─────────┴─────────┴─────────┘

   Neu XID 77 COMMIT   → doc thay dong thu hai
   Neu XID 77 ROLLBACK → doc thay dong thu nhat (dong thu hai vo hinh)
```

Cái giá của thiết kế này:

```text
   ✔ ROLLBACK gan nhu tuc thi
   ✔ Doc du lieu cu RE (nam ngay trong bang)
   ✘ Bang PHINH ra chua ca phien ban chet
   ✘ Can VACUUM don dep
   ✘ MOI index phai cap nhat khi UPDATE (vi ctid doi)
```

### Cấu trúc file WAL

```bash
ls -la /var/lib/postgresql/data/pg_wal/
```

```text
-rw------- 1 postgres postgres 16777216 Aug  8 10:31 000000010000000000000042
-rw------- 1 postgres postgres 16777216 Aug  8 10:33 000000010000000000000043
drwx------ 2 postgres postgres     4096 Aug  8 09:00 archive_status
```

```text
   TEN FILE: 24 ky tu hex, chia ba phan
     00000001  → timeline (tang len sau moi lan thang cap replica)
     00000000  → so hieu file cao
     00000042  → so hieu file thap

   Moi file: 16 MB (doi duoc bang --wal-segsize luc initdb)
```

### `LSN` — địa chỉ trong dòng WAL

```sql
SELECT pg_current_wal_lsn();
```

```text
 pg_current_wal_lsn
--------------------
 0/1B4C7A8
   ▲    ▲
   │    └ vi tri byte trong file (hex)
   └ so hieu file cao (hex)
```

Đo lượng WAL sinh ra bởi một thao tác:

```sql
SELECT pg_current_wal_lsn() AS truoc \gset
UPDATE orders SET status = 'paid' WHERE id < 100000;
SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), :'truoc')) AS wal_sinh_ra;
```

```text
 wal_sinh_ra
-------------
 42 MB
```

100.000 dòng nhỏ sinh 42 MB WAL. Đây là **khuếch đại ghi** — chủ đề của [bài 6](06-nulls-va-write-amplification.md).

### Ghi cả page — cái giá của trang rách

```sql
SHOW full_page_writes;   -- on
```

```text
   Page 8 KB, nhung don vi ghi NGUYEN TU cua dia chi 512 byte hoac 4 KB.
   Mat dien giua chung → PAGE RACH: nua moi, nua cu.
   → ban ghi WAL kieu "doi byte 128" khong ap duoc len page rach

   GIAI PHAP: lan DAU TIEN mot page bi sua SAU MOI CHECKPOINT,
              chep CA PAGE 8 KB vao WAL.
```

Hệ quả quan sát được:

```text
   Ngay sau checkpoint  → WAL PHINH MANH (moi page dau tien deu ghi ca page)
   Xa checkpoint        → WAL nho lai (chi ghi delta)

   → Checkpoint QUA DAY lam luong WAL tang dang ke
```

Cách giảm:

```sql
ALTER SYSTEM SET checkpoint_timeout = '15min';      -- mac dinh 5min
ALTER SYSTEM SET max_wal_size = '8GB';              -- mac dinh 1GB
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_compression = 'zstd';          -- nen ca page (PG15+)
```

`wal_compression` đáng chú ý: nó nén riêng các bản ghi ghi-cả-page, thường **giảm 40-70% lượng WAL** với chi phí CPU nhỏ.

---

## MySQL InnoDB: hai log riêng biệt

```text
   REDO LOG  (ib_logfile0, ib_logfile1)
     • Vong tron, kich thuoc co dinh
     • Ghi thay doi vat ly muc page
     • Dung de phuc hoi sau su co

   UNDO LOG  (undo tablespace)
     • Ghi gia tri CU
     • Dung cho ROLLBACK
     • VA cho MVCC: doc du lieu cu thi dung lai tu day
```

```text
   INNODB SUA TAI CHO:

   BANG:                      UNDO LOG:
   ┌────┬─────────┐           ┌──────────────────────────┐
   │  1 │  900000 │  ← MOI    │ XID 77: id=1 cu la 1000000│
   └────┴─────────┘           └──────────────────────────┘

   ROLLBACK → doc undo log, GHI 1.000.000 tro lai vao bang
            → PHAI HOAN TAC THAT tung dong
```

### So sánh hai kiến trúc

| | PostgreSQL | MySQL InnoDB |
|---|---|---|
| Sửa dữ liệu | **Không tại chỗ** — phiên bản mới | **Tại chỗ** |
| Undo log | Không có | **Có, riêng** |
| `ROLLBACK` | **Gần như tức thì** (ghi một dấu) | Phải hoàn tác **từng dòng** |
| Kích thước bảng | **Phình** vì chứa phiên bản chết | Ổn định |
| Dọn rác | **`VACUUM`** trên bảng | *purge* trên undo log |
| Đọc dữ liệu cũ | **Nhanh** (nằm trong bảng) | Chậm hơn (dựng lại từ undo) |
| `UPDATE` một cột | **Cập nhật mọi index** (trừ HOT) | Index phụ **không cần đổi** |
| Transaction dài | Bảng phình | **Undo log phình** |

Dòng cuối đáng chú ý: cả hai đều bị transaction dài làm hại, chỉ khác **chỗ nào phình**.

```sql
-- MySQL: kiem tra undo log co phinh khong
SELECT * FROM information_schema.innodb_metrics
WHERE name LIKE '%undo%' AND status = 'enabled';
```

### Redo log của InnoDB là vòng tròn

```text
   POSTGRESQL WAL: file MOI lien tuc, file cu duoc XOA hoac LUU TRU
   INNODB REDO   : kich thuoc CO DINH, ghi vong lai tu dau

   → Neu redo log QUA NHO:
       ghi vong quanh nhanh → phai FLUSH page ban gap gap
       → hien tuong "async flush", thong luong ghi SUP
```

```ini
innodb_redo_log_capacity = 4G      # MySQL 8.0.30+
# ban cu: innodb_log_file_size × innodb_log_files_in_group
```

Mặc định chỉ 100 MB — quá nhỏ cho tải ghi nặng. Đây là một trong những chỉnh sửa hiệu quả nhất trên MySQL.

---

## Ba ứng dụng khác của WAL

WAL sinh ra cho durability, nhưng nó trở thành nền của ba tính năng khác:

### 1. Nhân bản

```text
   Replica CHINH LA mot may lien tuc AP DUNG WAL cua primary.
   → khong can co che rieng, tai su dung dung thu da co
```

### 2. Phục hồi theo thời điểm (PITR)

```sql
ALTER SYSTEM SET archive_mode = on;
ALTER SYSTEM SET archive_command = 'cp %p /backup/wal/%f';
```

```text
   Ban sao luu day du (Chu nhat)  +  moi file WAL sau do
   → phuc hoi ve BAT KY THOI DIEM NAO
   → vi du: ngay TRUOC khi ai do chay DELETE nham luc 14:32
```

```bash
# recovery.conf / postgresql.conf
restore_command = 'cp /backup/wal/%f %p'
recovery_target_time = '2026-08-08 14:31:00'
```

Đây là điều **replica không làm được**: replica đã nhân bản lệnh `DELETE` nhầm rồi. Chỉ PITR mới quay ngược thời gian được.

### 3. Thu thập thay đổi (CDC)

```sql
SELECT pg_create_logical_replication_slot('cdc_slot', 'pgoutput');
```

```text
   Giai ma WAL thanh cac su kien muc hang:
     INSERT vao bang orders: {id: 1, total: 500000}
     UPDATE bang users: truoc {...}, sau {...}

   → Debezium, Kafka Connect dung dung co che nay
   → Dong bo du lieu sang Elasticsearch, kho phan tich, cache
   → KHONG can them cot `updated_at` hay them trigger
```

Đây là ứng dụng hiện đại nhất của WAL, và nó thay thế được rất nhiều kiến trúc "polling bảng để tìm thay đổi".

---

## Theo dõi WAL

```sql
-- Luong WAL sinh ra (PG14+)
SELECT wal_records, wal_bytes, wal_fpi,
       pg_size_pretty(wal_bytes) AS tong
FROM pg_stat_wal;
```

```text
 wal_records | wal_bytes  | wal_fpi |  tong
-------------+------------+---------+---------
    88412993 | 4.2884e+11 | 1284993 | 399 GB
                             ▲
                 so lan GHI CA PAGE — cao nghia la checkpoint qua day
```

```sql
-- Dung luong thu muc WAL
SELECT pg_size_pretty(sum(size)) FROM pg_ls_waldir();

-- Khe nhan ban dang giu bao nhieu WAL  ← NGUY HIEM NHAT
SELECT slot_name, active, wal_status,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_giu
FROM pg_replication_slots;
```

```sql
-- Tan suat checkpoint
SELECT checkpoints_timed, checkpoints_req,
       round(100.0*checkpoints_req/NULLIF(checkpoints_timed+checkpoints_req,0),1) AS pct_ep_buoc
FROM pg_stat_bgwriter;
```

```text
   checkpoints_req cao (> 10%) nghia la checkpoint bi EP BUOC
   vi WAL day `max_wal_size`, khong phai vi het thoi gian
   → nen TANG max_wal_size
```

Bốn cảnh báo nên đặt:

| Cảnh báo | Ngưỡng | Vì sao |
|---|---|---|
| Khe nhân bản không hoạt động | Bất kỳ | **Giữ WAL mãi → đầy đĩa → database dừng** |
| WAL giữ bởi một khe | > 5 GB | Sắp đầy đĩa |
| `checkpoints_req / tổng` | > 10% | `max_wal_size` quá nhỏ |
| Thư mục `pg_wal` | > 80% đĩa | Khẩn cấp |

Cảnh báo đầu tiên là quan trọng nhất — nó là nguyên nhân số một khiến PostgreSQL dừng vì đầy đĩa.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tạo khe nhân bản rồi để replica chết | Primary giữ WAL mãi → **đầy đĩa → database dừng** | `max_slot_wal_keep_size`; cảnh báo khe không hoạt động |
| Tắt `full_page_writes` để tăng tốc | Mất điện đúng lúc ghi page → **hỏng dữ liệu không sửa được** | Chỉ tắt nếu tầng lưu trữ đảm bảo ghi nguyên tử |
| `max_wal_size` mặc định 1 GB | Checkpoint bị ép buộc liên tục, WAL phình vì ghi cả page | Tăng lên 4-16 GB tuỳ tải |
| `innodb_redo_log_capacity` mặc định | Ghi vòng quanh nhanh → flush gấp → thông lượng sụp | Tăng lên 2-8 GB |
| Coi replica là bản sao lưu | Lệnh xoá nhầm được nhân bản trong 200 ms | **PITR** với `archive_mode = on` |
| Bật `archive_mode` nhưng `archive_command` lỗi âm thầm | WAL tích tụ mãi vì chưa lưu trữ được | Theo dõi `pg_stat_archiver.failed_count` |
| Transaction dài | PostgreSQL: bảng phình. InnoDB: undo log phình | `idle_in_transaction_session_timeout` |
| Đặt WAL cùng ổ đĩa với dữ liệu | Ghi tuần tự và ghi ngẫu nhiên tranh nhau | Tách WAL sang ổ riêng nếu tải cao |

## Tóm tắt bài 1

- **WAL là tên cơ chế, REDO và UNDO là hai loại thông tin** — chúng không phải một. Quy tắc bất di bất dịch: **bản ghi WAL phải xuống đĩa trước page dữ liệu**.
- Mẹo hoạt động nhờ hai tính chất: **ghi tuần tự nhanh hơn ghi ngẫu nhiên rất nhiều**, và **bản ghi WAL nhỏ hơn page rất nhiều**.
- Phục hồi có **ba giai đoạn**: phân tích → **redo** (làm lại **cả** thay đổi chưa commit) → **undo** (hoàn tác transaction dang dở).
- **PostgreSQL không có undo log** — nó giữ nhiều phiên bản ngay trong bảng, nên `ROLLBACK` gần như tức thì nhưng bảng phình và cần `VACUUM`. **InnoDB sửa tại chỗ** nên bảng gọn nhưng `ROLLBACK` phải hoàn tác từng dòng.
- Transaction dài làm hại **cả hai**, chỉ khác chỗ phình: PostgreSQL phình bảng, InnoDB phình undo log.
- **Ghi cả page** (`full_page_writes`) chống trang rách, và nó khiến WAL **phình mạnh ngay sau mỗi checkpoint** — nên checkpoint quá dày làm tăng đáng kể lượng WAL. `wal_compression = zstd` giảm 40-70%.
- WAL sinh ra cho durability nhưng trở thành nền của **ba tính năng khác**: nhân bản, **PITR** (thứ replica không làm được), và **CDC** (Debezium).
- Cảnh báo quan trọng nhất: **khe nhân bản không hoạt động** — đây là nguyên nhân số một khiến PostgreSQL dừng vì đầy đĩa.

**Bài kế tiếp** → [Bài 2: Lưu trữ dữ liệu trên đĩa và kiến trúc PostgreSQL](01-luu-tru-du-lieu-va-kien-truc-postgres.md)

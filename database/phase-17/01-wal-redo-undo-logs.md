# Bài 1: WAL, Redo và Undo Logs — nền tảng của Durability

Ba từ này hay bị dùng lẫn lộn, và chúng **không phải là một**:

```text
   WAL   →  TÊN GỌI CỦA CƠ CHẾ  (Write-Ahead Logging): ghi nhật ký TRƯỚC khi sửa
   REDO  →  thông tin để LÀM LẠI  thay đổi sau sự cố
   UNDO  →  thông tin để HOÀN TÁC thay đổi khi rollback
```

Một hệ có thể có cả ba, hoặc gộp chúng lại. Bài này tách bạch chúng, rồi cho thấy PostgreSQL và MySQL giải cùng bài toán bằng hai cách hoàn toàn khác nhau.

## Vấn đề gốc

```text
   Bạn muốn sửa 4 dòng nằm ở 4 page khác nhau, rồi COMMIT.

   CÁCH NGÂY THƠ: ghi cả 4 page xuống đĩa trước khi trả về "đã commit"
     → 4 lần ghi NGẪU NHIÊN + 4 lần fsync
     → trên SSD: ~4 × 100 µs = 400 µs, chưa kể tìm kiếm
     → và nếu mất điện giữa chừng: 2 page mới, 2 page cũ → DỮ LIỆU NỬA VỜI
```

Hai vấn đề: **chậm**, và **không nguyên tử**.

## Lời giải: ghi nhật ký trước

```text
   QUY TẮC WAL (bất di bất dịch):
     Bản ghi nhật ký mô tả một thay đổi phải NẰM YÊN TRÊN ĐĨA
     TRƯỚC KHI page chứa thay đổi đó được phép xuống đĩa.
```

```text
   ┌─ COMMIT ────────────────────────────────────────────────────┐
   │  1. Ghi vào cuối file WAL (GHI TUẦN TỰ):                    │
   │       [LSN 0/15A3B] page 4201: byte 128, 'new' → 'paid'     │
   │       [LSN 0/15A5C] page  887: thêm khoá index              │
   │       [LSN 0/15A6D] COMMIT XID 12345                        │
   │  2. fsync MỘT LẦN                                           │
   │  3. Trả về "đã commit"       ← XONG, RẤT NHANH              │
   │                                                             │
   │  Các page dữ liệu thật? Cứ nằm BẨN trong RAM.               │
   │  CHECKPOINT sau này sẽ dọn.                                 │
   └─────────────────────────────────────────────────────────────┘
```

Hai tính chất làm mẹo này hoạt động:

```text
   1. GHI TUẦN TỰ nhanh hơn GHI NGẪU NHIÊN rất nhiều
      HDD: chênh hàng trăm lần.  SSD: vẫn chênh vài lần.

   2. BẢN GHI WAL NHỎ HƠN PAGE nhiều
      "đổi ô này từ X sang Y" = vài chục byte
      ghi cả page = 8.192 byte
```

---

## Redo vs Undo — hai loại thông tin khác nhau

```text
   ┌──────────────────────────────────────────────────────────────┐
   │ REDO — "giá trị MỚI là gì"                                   │
   │   Dùng khi: khởi động lại sau sự cố                          │
   │   Mục đích: LÀM LẠI các thay đổi ĐÃ COMMIT nhưng page chưa   │
   │             kịp xuống đĩa                                    │
   │   Ví dụ:  "page 4201, byte 128 = 'paid'"                     │
   ├──────────────────────────────────────────────────────────────┤
   │ UNDO — "giá trị CŨ là gì"                                    │
   │   Dùng khi: ROLLBACK, hoặc đọc phiên bản cũ (MVCC)           │
   │   Mục đích: HOÀN TÁC các thay đổi CHƯA COMMIT                │
   │   Ví dụ:  "page 4201, byte 128 trước đó là 'pending'"        │
   └──────────────────────────────────────────────────────────────┘
```

### Quá trình phục hồi sau sự cố

```text
   MẤT ĐIỆN. KHỞI ĐỘNG LẠI.

   GIAI ĐOẠN 1 — PHÂN TÍCH
     Đọc WAL từ CHECKPOINT gần nhất
     Xác định: transaction nào ĐÃ commit, transaction nào ĐANG DỞ

   GIAI ĐOẠN 2 — REDO
     Làm lại MỌI thay đổi từ checkpoint trở đi
     (kể cả của transaction chưa commit — sẽ hoàn tác ở giai đoạn 3)
     → đưa database về đúng trạng thái lúc mất điện

   GIAI ĐOẠN 3 — UNDO
     Hoàn tác các transaction DANG DỞ
     → đưa về trạng thái NHẤT QUÁN
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
   POSTGRESQL KHÔNG CÓ UNDO LOG.

   Vì sao không cần?  Vì nó KHÔNG SỬA TẠI CHỖ:
     UPDATE = tạo một PHIÊN BẢN MỚI của dòng, ngay trong bảng
     → phiên bản CŨ vẫn nằm đó
     → "undo" chính là: bỏ qua phiên bản mới

   ROLLBACK = ghi một dấu "XID 12345 đã huỷ"
     → mọi phiên bản do XID đó tạo ra tự động VÔ HÌNH
     → GẦN NHƯ TỨC THÌ, bất kể đã sửa bao nhiêu dòng
```

```text
   BẢNG SAU MỘT UPDATE:
   ┌────┬─────────┬─────────┬─────────┐
   │ id │ balance │  xmin   │  xmax   │
   ├────┼─────────┼─────────┼─────────┤
   │  1 │ 1000000 │   50    │   77    │  ← phiên bản CŨ (bị XID 77 thay)
   │  1 │  900000 │   77    │    —    │  ← phiên bản MỚI
   └────┴─────────┴─────────┴─────────┘

   Nếu XID 77 COMMIT   → đọc thấy dòng thứ hai
   Nếu XID 77 ROLLBACK → đọc thấy dòng thứ nhất (dòng thứ hai vô hình)
```

Cái giá của thiết kế này:

```text
   ✔ ROLLBACK gần như tức thì
   ✔ Đọc dữ liệu cũ RẺ (nằm ngay trong bảng)
   ✘ Bảng PHÌNH ra chứa cả phiên bản chết
   ✘ Cần VACUUM dọn dẹp
   ✘ MỌI index phải cập nhật khi UPDATE (vì ctid đổi)
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
   TÊN FILE: 24 ký tự hex, chia ba phần
     00000001  → timeline (tăng lên sau mỗi lần thăng cấp replica)
     00000000  → số hiệu file cao
     00000042  → số hiệu file thấp

   Mỗi file: 16 MB (đổi được bằng --wal-segsize lúc initdb)
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
   │    └ vị trí byte trong file (hex)
   └ số hiệu file cao (hex)
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
   Page 8 KB, nhưng đơn vị ghi NGUYÊN TỬ của đĩa chỉ 512 byte hoặc 4 KB.
   Mất điện giữa chừng → PAGE RÁCH: nửa mới, nửa cũ.
   → bản ghi WAL kiểu "đổi byte 128" không áp được lên page rách

   GIẢI PHÁP: lần ĐẦU TIÊN một page bị sửa SAU MỖI CHECKPOINT,
              chép CẢ PAGE 8 KB vào WAL.
```

Hệ quả quan sát được:

```text
   Ngay sau checkpoint  → WAL PHÌNH MẠNH (mọi page đầu tiên đều ghi cả page)
   Xa checkpoint        → WAL nhỏ lại (chỉ ghi delta)

   → Checkpoint QUÁ DÀY làm lượng WAL tăng đáng kể
```

Cách giảm:

```sql
ALTER SYSTEM SET checkpoint_timeout = '15min';      -- mặc định 5min
ALTER SYSTEM SET max_wal_size = '8GB';              -- mặc định 1GB
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_compression = 'zstd';          -- nén cả page (PG15+)
```

`wal_compression` đáng chú ý: nó nén riêng các bản ghi ghi-cả-page, thường **giảm 40-70% lượng WAL** với chi phí CPU nhỏ.

---

## MySQL InnoDB: hai log riêng biệt

```text
   REDO LOG  (ib_logfile0, ib_logfile1)
     • Vòng tròn, kích thước cố định
     • Ghi thay đổi vật lý mức page
     • Dùng để phục hồi sau sự cố

   UNDO LOG  (undo tablespace)
     • Ghi giá trị CŨ
     • Dùng cho ROLLBACK
     • VÀ cho MVCC: đọc dữ liệu cũ thì dựng lại từ đây
```

```text
   INNODB SỬA TẠI CHỖ:

   BẢNG:                      UNDO LOG:
   ┌────┬─────────┐           ┌──────────────────────────┐
   │  1 │  900000 │  ← MỚI    │ XID 77: id=1 cũ là 1000000│
   └────┴─────────┘           └──────────────────────────┘

   ROLLBACK → đọc undo log, GHI 1.000.000 trở lại vào bảng
            → PHẢI HOÀN TÁC THẬT từng dòng
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
-- MySQL: kiểm tra undo log có phình không
SELECT * FROM information_schema.innodb_metrics
WHERE name LIKE '%undo%' AND status = 'enabled';
```

### Redo log của InnoDB là vòng tròn

```text
   POSTGRESQL WAL: file MỚI liên tục, file cũ được XOÁ hoặc LƯU TRỮ
   INNODB REDO   : kích thước CỐ ĐỊNH, ghi vòng lại từ đầu

   → Nếu redo log QUÁ NHỎ:
       ghi vòng quanh nhanh → phải FLUSH page bẩn gấp gáp
       → hiện tượng "async flush", thông lượng ghi SỤP
```

```ini
innodb_redo_log_capacity = 4G      # MySQL 8.0.30+
# bản cũ: innodb_log_file_size × innodb_log_files_in_group
```

Mặc định chỉ 100 MB — quá nhỏ cho tải ghi nặng. Đây là một trong những chỉnh sửa hiệu quả nhất trên MySQL.

---

## Ba ứng dụng khác của WAL

WAL sinh ra cho durability, nhưng nó trở thành nền của ba tính năng khác:

### 1. Nhân bản

```text
   Replica CHÍNH LÀ một máy liên tục ÁP DỤNG WAL của primary.
   → không cần cơ chế riêng, tái sử dụng đúng thứ đã có
```

### 2. Phục hồi theo thời điểm (PITR)

```sql
ALTER SYSTEM SET archive_mode = on;
ALTER SYSTEM SET archive_command = 'cp %p /backup/wal/%f';
```

```text
   Bản sao lưu đầy đủ (Chủ nhật)  +  mọi file WAL sau đó
   → phục hồi về BẤT KỲ THỜI ĐIỂM NÀO
   → ví dụ: ngay TRƯỚC khi ai đó chạy DELETE nhầm lúc 14:32
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
   Giải mã WAL thành các sự kiện mức hàng:
     INSERT vào bảng orders: {id: 1, total: 500000}
     UPDATE bảng users: trước {...}, sau {...}

   → Debezium, Kafka Connect dùng đúng cơ chế này
   → Đồng bộ dữ liệu sang Elasticsearch, kho phân tích, cache
   → KHÔNG cần thêm cột `updated_at` hay thêm trigger
```

Đây là ứng dụng hiện đại nhất của WAL, và nó thay thế được rất nhiều kiến trúc "polling bảng để tìm thay đổi".

---

## Theo dõi WAL

```sql
-- Lượng WAL sinh ra (PG14+)
SELECT wal_records, wal_bytes, wal_fpi,
       pg_size_pretty(wal_bytes) AS tong
FROM pg_stat_wal;
```

```text
 wal_records | wal_bytes  | wal_fpi |  tổng
-------------+------------+---------+---------
    88412993 | 4.2884e+11 | 1284993 | 399 GB
                             ▲
                 số lần GHI CẢ PAGE — cao nghĩa là checkpoint quá dày
```

```sql
-- Dung lượng thư mục WAL
SELECT pg_size_pretty(sum(size)) FROM pg_ls_waldir();

-- Khe nhân bản đang giữ bao nhiêu WAL  ← NGUY HIỂM NHẤT
SELECT slot_name, active, wal_status,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_giu
FROM pg_replication_slots;
```

```sql
-- Tần suất checkpoint
SELECT checkpoints_timed, checkpoints_req,
       round(100.0*checkpoints_req/NULLIF(checkpoints_timed+checkpoints_req,0),1) AS pct_ep_buoc
FROM pg_stat_bgwriter;
```

```text
   checkpoints_req cao (> 10%) nghĩa là checkpoint bị ÉP BUỘC
   vì WAL đầy `max_wal_size`, không phải vì hết thời gian
   → nên TĂNG max_wal_size
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

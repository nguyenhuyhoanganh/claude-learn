# Bài 12: Bộ đếm 32 bit và cánh cửa ghi tự đóng

Nửa đêm. Không ai deploy. Không có lưu lượng đột biến. Một database PostgreSQL đang chạy ngon lành, rồi **mọi lệnh ghi bắt đầu fail**.

Thêm dòng mới: fail. Sửa dòng cũ: fail. Mấy job vốn chạy trăm lần một ngày cũng đứng hình.

Log hiện đúng một dòng lạ hoắc:

```text
ERROR: database is not accepting commands to avoid wraparound data loss
       in database "prod"
HINT:  Stop the postmaster and vacuum that database in single-user mode.
```

Không phải đầy đĩa. Không ai xoá nhầm. **PostgreSQL vừa tự khoá cửa ghi của chính nó để tự cứu mình.**

Bài này mổ ra vì sao một cỗ máy đang khoẻ mạnh lại tự dừng, và vì sao đây là quả bom hẹn giờ mà **dashboard mặc định của bạn không có ô nào để nhìn thấy nó**.

## Giải nghĩa thuật ngữ

| Thuật ngữ | Nghĩa kỹ thuật | Hình dung cho dễ |
|---|---|---|
| **MVCC** (Multi-Version Concurrency Control) | Cách PostgreSQL cho nhiều người đọc/ghi cùng lúc: **sửa một dòng thì đẻ bản mới, giữ nguyên bản cũ** | Không tẩy xoá, mà viết dòng mới rồi ghi chú "dòng cũ hết hiệu lực từ lúc X" |
| **Transaction ID / XID** | Số thứ tự tăng dần cấp cho **mỗi giao dịch có ghi** | Số thứ tự cấp cho từng lượt vào quầy |
| **`xmin` / `xmax`** | Hai cột ẩn trong **mọi dòng dữ liệu**: giao dịch nào tạo ra dòng này, giao dịch nào xoá nó | Ghi chú bên lề: "viết bởi lượt 128, xoá bởi lượt 340" |
| **Visibility** (khả kiến) | Việc quyết định giao dịch của bạn được nhìn thấy bản nào của mỗi dòng | Bạn chỉ được đọc những gì đã có trước khi bạn bước vào phòng |
| **Wraparound** (quay vòng) | Bộ đếm 32 bit chạy hết vòng rồi quay về đầu | Đồng hồ đo quãng đường chạy hết số rồi về 000000 |
| **`VACUUM`** | Tiến trình dọn các bản cũ không còn ai cần | Người dọn dẹp thu gom bản nháp đã hết hiệu lực |
| **Freeze** (đóng băng) | Đánh dấu một dòng là **"cũ tuyệt đối"** — ai cũng thấy, miễn nhiễm với vòng quay | Đóng dấu "vĩnh viễn có hiệu lực" lên tờ giấy |
| **`relfrozenxid`** | Với mỗi bảng: mốc XID mà **mọi dòng cũ hơn nó đều đã được đóng băng** | Vạch mốc: "từ đây trở về trước đã dọn xong" |
| **`age()`** | Khoảng cách từ mốc đó tới XID hiện tại — **tuổi** của bảng tính bằng số giao dịch | Đã bao nhiêu lượt trôi qua kể từ lần dọn cuối |
| **Snapshot** (ảnh chụp) | Bức ảnh "ai được thấy gì" mà mỗi giao dịch chốt lúc bắt đầu | Danh sách những gì đã có lúc bạn bước vào phòng |
| **Replication slot** | Cơ chế giữ nhật ký ghi lại cho một bản sao chưa đọc kịp | Giữ báo cũ lại vì có người chưa đọc |

## Bản chất MVCC: vì sao PostgreSQL cần một bộ đếm

Muốn hiểu vụ này thì phải nhìn cách PostgreSQL lưu dữ liệu.

**Mỗi lần bạn sửa một dòng, nó không hề sửa đè lên chỗ cũ.** Nó **đẻ hẳn một bản mới**, còn bản cũ để nguyên tại chỗ:

```text
   UPDATE san_pham SET gia = 120000 WHERE id = 42;

   ┌──────────────────────────────────────────────────────────┐
   │ TRƯỚC:                                                   │
   │   [id=42, gia=100000, xmin=500, xmax=0    ]  ← bản duy nhất│
   │                                                          │
   │ SAU (giao dịch số 780 thực hiện):                        │
   │   [id=42, gia=100000, xmin=500, xmax=780 ]  ← bản CŨ,    │
   │                                                giờ có hạn│
   │   [id=42, gia=120000, xmin=780, xmax=0   ]  ← bản MỚI    │
   └──────────────────────────────────────────────────────────┘
```

Nhờ vậy, **người đang đọc không phải chờ người đang ghi**. Ai bắt đầu giao dịch trước số 780 thì vẫn thấy giá cũ; ai bắt đầu sau thì thấy giá mới. Không ai phải xếp hàng.

Nhưng làm sao nó biết ai được thấy bản nào? Bằng cách so sánh **số thứ tự giao dịch**:

```text
   "Giao dịch của tôi mang số 800.
    Dòng này có xmin=780 → 780 < 800 → nó có TRƯỚC tôi → tôi THẤY.
    Dòng kia có xmin=850 → 850 > 800 → nó có SAU tôi   → tôi KHÔNG THẤY."
```

Con số đó gọi là **Transaction ID (XID)**. Và nó chỉ có **32 bit**.

## Vấn đề: 32 bit, và một vòng tròn

```text
   32 bit  →  khoảng 4,29 tỷ giá trị  →  rồi QUAY VÒNG VỀ ĐẦU.
```

PostgreSQL không thể so hai XID theo kiểu đường thẳng, vì sau khi quay vòng thì "số nhỏ hơn" chưa chắc là "cũ hơn". Nên nó so theo kiểu **vòng tròn**:

```text
                        XID hiện tại
                             │
                             ▼
              ╭──────────────●──────────────╮
             ╱                               ╲
            │   2 tỷ số PHÍA SAU              │   2 tỷ số PHÍA TRƯỚC
            │   = QUÁ KHỨ                     │   = TƯƠNG LAI
            │   (tôi thấy)                    │   (tôi không thấy)
             ╲                               ╱
              ╰───────────────────────────────╯

   KHÔNG CÓ "cũ hơn tuyệt đối".
   Chỉ có nửa vòng bên này và nửa vòng bên kia.
```

Và đây là chỗ chết người:

```text
   Một dòng cũ nằm yên, không ai dọn.
   Bộ đếm chạy tiếp... 1 tỷ... 2 tỷ nhịp...

   Cái số từng sinh ra nó ĐỘT NHIÊN RƠI SANG NỬA TƯƠNG LAI.

   → Dòng đang hiển thị bình thường BỖNG BIẾN MẤT.
   → Dữ liệu vẫn còn nguyên trên đĩa. Không ai xoá gì.
     Nhưng không ai NHÌN THẤY nó nữa.
```

**Đó chính là Wraparound.** Và nó không phải "chậm" hay "lỗi" — nó là **mất dữ liệu âm thầm**, kiểu tệ nhất, vì không có thông báo nào cả.

## Lá chắn: VACUUM và việc đóng băng

PostgreSQL chống bằng tiến trình nền tên **VACUUM**. Ngoài việc dọn các bản cũ, nó còn làm một việc nữa: **đóng băng (freeze)** những dòng đủ già.

```text
   Đóng băng = đánh dấu dòng đó là "CŨ TUYỆT ĐỐI".

   Dòng đã đóng băng thì AI CŨNG THẤY, không cần so số nữa,
   → MIỄN NHIỄM HOÀN TOÀN với vòng quay.
```

Cơ chế này chạy tự động, và trong 99% trường hợp bạn không bao giờ phải nghĩ tới nó. Vấn đề chỉ nổ ra khi **VACUUM tụt lại phía sau** — tức là dòng mới đến nhanh hơn tốc độ dọn.

### Ba ngưỡng cảnh báo, và ngưỡng cuối là cánh cửa đóng lại

```text
   ┌──────────────────────────────────────────────────────────────────┐
   │  age(relfrozenxid) đạt 200 TRIỆU  (autovacuum_freeze_max_age)   │
   │  → Postgres tự khởi động một lượt VACUUM CƯỠNG BỨC cho bảng đó, │
   │    kể cả khi autovacuum đang bị tắt.                            │
   │  → Đây là mức BÌNH THƯỜNG, không phải báo động.                 │
   ├──────────────────────────────────────────────────────────────────┤
   │  age(datfrozenxid) đạt ~1,6 TỶ  (vacuum_failsafe_age, PG14+)     │
   │  → Chế độ CỨU HOẢ: VACUUM bỏ qua bước dọn index, chạy hết tốc.  │
   ├──────────────────────────────────────────────────────────────────┤
   │  Còn ~40 TRIỆU số nữa là cạn                                    │
   │  → Ghi CẢNH BÁO vào log:                                        │
   │    "WARNING: database must be vacuumed within N transactions"    │
   ├──────────────────────────────────────────────────────────────────┤
   │  Còn dưới ~3 TRIỆU                                              │
   │  → THÔI CẢNH BÁO, ĐÓNG LUÔN CỬA GHI.                            │
   │    Chỉ cho phép đọc. Mọi lệnh ghi bị từ chối.                   │
   └──────────────────────────────────────────────────────────────────┘
```

> **Thà đứng hình còn hơn để mất dữ liệu trong âm thầm.**

Đây là một quyết định thiết kế đáng nể: PostgreSQL chọn **gây ra một sự cố ồn ào và rõ ràng** thay vì để dữ liệu biến mất mà không ai biết. Dòng lỗi ở đầu bài không phải dấu hiệu hệ đang hỏng — nó là **lá chắn cuối cùng vừa bật lên**.

Một chi tiết an ủi khi bạn đang ở trong tình huống đó: **các giao dịch đang chạy dở vẫn chạy tiếp được, và lệnh `VACUUM` vẫn chạy được bình thường**. Bạn không nhất thiết phải dừng máy chủ và vào chế độ một người dùng như dòng `HINT` gợi ý — dòng đó là lời khuyên bảo thủ từ thời trước.

## Sự cố thật: Sentry, tháng 7/2015

Sentry là dịch vụ thu thập lỗi ứng dụng — một hệ **ghi cực nặng**, với những bảng khổng lồ cả về số dòng lẫn dung lượng đĩa.

```text
   ① App ghi rất nặng, bảng rất lớn → VACUUM đuổi không kịp.
   ② Bộ đếm chạm ngưỡng → database NGỪNG NHẬN GHI.
   ③ Ngay khi phát hiện, họ chuyển sang phần cứng mạnh hơn
      để VACUUM dọn cho kịp.
   ④ Nó dọn xong mọi bảng — TRỪ MỘT bảng ánh xạ quá lớn.
   ⑤ Cuối cùng họ chấp nhận TRUNCATE bảng ánh xạ đó.
   ⑥ 5 phút sau, hệ thống hồi phục.
```

**Con số đáng sợ nhất:** sau sự cố, họ chạy thử lại `VACUUM` trên chính phần cứng cũ — **gần 24 tiếng vẫn chưa xong**.

Bài học rút ra không phải "VACUUM chậm". Bài học là:

> **Khi cửa ghi đã đóng, bạn không còn thời gian để dọn nữa.** VACUUM trên một bảng khổng lồ đã tích rác nhiều tháng có thể mất hàng chục giờ — trong lúc hệ thống của bạn đang chết.
>
> **Thứ cứu bạn là việc theo dõi từ nhiều tuần trước, không phải phản ứng lúc sập.**

## Cái giá của MVCC, và ba kẻ thù vô hình

Cái giá của cách lưu này rất rõ ràng: **đọc không chặn ghi thì sướng, nhưng đổi lại phải nuôi một ông lao công chạy mãi mãi ở nền.**

```text
   Tune NHẸ TAY  →  bảng phình lên (bloat) và tiến gần Wraparound
   Tune MẠNH TAY →  ngốn I/O của production
```

Nhưng nguy hiểm hơn cả việc tune sai là **ba thứ khiến VACUUM không được phép dọn gì cả**. Đây là phần quan trọng nhất bài, vì gần như mọi vụ wraparound thật đều bắt nguồn từ một trong ba thứ này.

### Nguyên tắc chung

VACUUM chỉ được dọn một bản cũ khi **chắc chắn không còn ai có thể cần nhìn thấy nó**. Bất cứ thứ gì giữ khư khư một **ảnh chụp cũ** đều khiến VACUUM bó tay — **trên toàn bộ database**, không chỉ trên bảng liên quan.

### Kẻ thù 1 — Giao dịch mở quá lâu

```sql
-- Ai đó gõ BEGIN từ 3 tiếng trước rồi đi ăn trưa
-- Hoặc: một job có bug, mở transaction rồi chờ một lệnh gọi mạng không timeout
SELECT pid,
       now() - xact_start   AS giao_dich_da_mo,
       now() - state_change AS im_lang_bao_lau,
       state,
       substring(query, 1, 60) AS cau_lenh
  FROM pg_stat_activity
 WHERE xact_start IS NOT NULL
   AND now() - xact_start > interval '5 minutes'
 ORDER BY xact_start;
```

Trạng thái nguy hiểm nhất là **`idle in transaction`**: kết nối đã `BEGIN` nhưng không làm gì cả. Nó giữ ảnh chụp mà không hề chạy việc gì.

```sql
-- Phòng ngừa: tự cắt các giao dịch ngồi không quá lâu
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';

-- PostgreSQL 17+: cắt cả giao dịch đang chạy nhưng quá dài
ALTER SYSTEM SET transaction_timeout = '30min';
```

### Kẻ thù 2 — Replication slot bị bỏ quên

```sql
SELECT slot_name,
       active,
       age(xmin)                     AS tuoi_xid_dang_giu,
       pg_size_pretty(
         pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS wal_dang_giu
  FROM pg_replication_slots
 ORDER BY age(xmin) DESC NULLS LAST;
```

Một replica bị tắt mà **slot không bị xoá** là cái bẫy kinh điển: slot đó giữ mãi một mốc XID cũ, và VACUUM không bao giờ vượt qua được mốc đó. Cột `active = false` mà `age(xmin)` lớn là dấu hiệu chết người.

```sql
-- Đặt trần cho lượng WAL một slot được giữ (PG13+)
ALTER SYSTEM SET max_slot_wal_keep_size = '100GB';
-- Vượt trần thì slot bị vô hiệu hoá — mất replica còn hơn mất cả database
```

### Kẻ thù 3 — Giao dịch hai pha bị treo

Ít gặp hơn nhưng độc hơn, vì nó **không xuất hiện trong `pg_stat_activity`**:

```sql
SELECT gid, prepared, owner, database, age(transaction) AS tuoi
  FROM pg_prepared_xacts
 ORDER BY prepared;
```

Một giao dịch `PREPARE TRANSACTION` mà không ai `COMMIT PREPARED` sẽ nằm đó **mãi mãi**, kể cả sau khi khởi động lại máy chủ. Nếu bạn dùng giao dịch phân tán (XA) mà không dọn, đây là nguồn wraparound rất khó tìm.

### Chi tiết an ủi: giao dịch chỉ đọc không tiêu XID

```text
   Giao dịch CHỈ ĐỌC không tiêu một con số XID thật nào.
   Nó chỉ mượn tạm một số ảo (Virtual XID) rồi trả lại.

   → Một bản sao chỉ đọc (Replica) chạy báo cáo cả ngày
     KHÔNG đẩy bạn tới gần Wraparound nhịp nào.
```

Nhưng cẩn thận: một giao dịch chỉ đọc **vẫn giữ ảnh chụp**, nên nó vẫn **chặn VACUUM dọn**. Nó không tiêu XID, nhưng nó vẫn là kẻ thù số 1 ở trên. Đây là chỗ rất hay bị nhầm.

## Vì sao không dùng XID 64 bit cho xong?

Câu hỏi hiển nhiên. Câu trả lời nằm ở chỗ **XID nằm ngay trong từng dòng trên đĩa** (`xmin`, `xmax`):

```text
   Đổi XID sang 64 bit nghĩa là:
      • MỖI DÒNG dữ liệu phình thêm 8 byte
      • Định dạng lưu trữ trên đĩa thay đổi → phải chuyển đổi toàn bộ dữ liệu cũ
      • Định dạng index thay đổi
      • Định dạng nhật ký ghi (WAL) thay đổi
      • Toàn bộ logic nhân bản và tính khả kiến đang dựa trên số học 32 bit
```

Một bản thử nghiệm cho PostgreSQL 15 cho thấy **làm được**, nhưng ảnh hưởng lan quá rộng.

Có một chỗ hay gây hiểu nhầm: PostgreSQL **đã có** kiểu `xid8` 64 bit — nhưng đó chỉ là kiểu dữ liệu để **bạn nhìn thấy và lưu trữ** số giao dịch có kèm epoch. **Kiểu `xid` bên trong máy vẫn là 32 bit và vẫn quay vòng.** Có `xid8` không có nghĩa là hết wraparound.

## Kẻ thù thứ tư ít ai nhắc: MultiXact wraparound

PostgreSQL còn một bộ đếm 32 bit **thứ hai** cũng có thể gây ra đúng sự cố này, và gần như không ai theo dõi nó.

Khi **nhiều giao dịch cùng khoá một dòng ở chế độ chia sẻ** (ví dụ: nhiều lệnh `INSERT` con cùng tham chiếu một dòng cha qua khoá ngoại — xem [Bài 4](../phase-1-cau-hoi-co-tang-duoi/04-khoa-ngoai-co-lam-cham-khong.md)), PostgreSQL không nhét được nhiều XID vào một ô `xmax`. Nó tạo một **MultiXact ID** đại diện cho cả nhóm.

MultiXact ID cũng là **32 bit**, cũng quay vòng, và cũng có ngưỡng đóng cửa ghi riêng.

```sql
-- Theo dõi CẢ HAI bộ đếm, không chỉ một
SELECT c.relname                       AS bang,
       age(c.relfrozenxid)             AS tuoi_xid,
       mxid_age(c.relminmxid)          AS tuoi_multixact,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS kich_thuoc
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r', 'm')
   AND n.nspname NOT IN ('pg_catalog', 'information_schema')
 ORDER BY GREATEST(age(c.relfrozenxid), mxid_age(c.relminmxid)) DESC
 LIMIT 20;
```

Bảng có rất nhiều dòng con trỏ tới ít dòng cha, hoặc dùng nhiều `SELECT ... FOR SHARE`, là ứng viên số một cho MultiXact wraparound.

## Theo dõi: đơn vị mà dashboard mặc định không có

Một database đang chạy tốt — CPU ổn, RAM ổn, đĩa ổn — **không có nghĩa là nó an toàn**. Có những quả bom hẹn giờ đang đếm ngược rất âm thầm, và chúng đếm bằng **thứ đơn vị mà dashboard mặc định không có: tuổi XID**.

### Câu lệnh tự soi (chạy ngay hôm nay)

```sql
-- ① Mức DATABASE: còn bao xa tới cửa đóng?
SELECT datname,
       age(datfrozenxid)                        AS tuoi_xid,
       round(100.0 * age(datfrozenxid) / 2147483648, 1) AS phan_tram_toi_han,
       2147483648 - age(datfrozenxid)           AS con_lai_bao_nhieu_giao_dich
  FROM pg_database
 ORDER BY age(datfrozenxid) DESC;

-- ② Mức BẢNG: bảng nào già nhất?
SELECT c.relname,
       age(c.relfrozenxid) AS tuoi_xid,
       CASE
         WHEN age(c.relfrozenxid) > 1500000000 THEN 'BÁO ĐỘNG ĐỎ'
         WHEN age(c.relfrozenxid) >  500000000 THEN 'CẢNH BÁO'
         WHEN age(c.relfrozenxid) >  200000000 THEN 'bình thường (đang cưỡng bức vacuum)'
         ELSE 'ổn'
       END AS trang_thai
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind IN ('r','m','t')
   AND n.nspname NOT IN ('pg_catalog','information_schema')
 ORDER BY 2 DESC
 LIMIT 20;
```

### Ngưỡng cảnh báo nên đặt

| `age(datfrozenxid)` | Mức | Việc cần làm |
|---|---|---|
| < 200 triệu | Bình thường | Không làm gì |
| 200 triệu – 500 triệu | Bình thường | Autovacuum đang làm việc của nó |
| 500 triệu – 1 tỷ | **Cảnh báo** | Kiểm ba kẻ thù; xem autovacuum có bị chặn không |
| 1 tỷ – 1,5 tỷ | **Khẩn cấp** | Xử lý ngay trong ngày |
| > 1,5 tỷ | **Báo động đỏ** | Còn vài ngày là đóng cửa ghi |

### Playbook khi đã dính

```text
   ① ĐỪNG khởi động lại máy chủ theo phản xạ. Nó không giúp gì
      và bạn mất luôn khả năng nhìn pg_stat_activity.

   ② TÌM VÀ GỠ BA KẺ THÙ TRƯỚC — đây là bước quan trọng nhất:
        • pg_stat_activity: giao dịch mở lâu → huỷ (pg_terminate_backend)
        • pg_replication_slots: slot chết → pg_drop_replication_slot
        • pg_prepared_xacts: giao dịch treo → ROLLBACK PREPARED
      Không gỡ xong bước này thì VACUUM chạy cũng không dọn được gì.

   ③ CHẠY VACUUM (FREEZE) cho các bảng già nhất trước, không phải
      cho cả database. Ưu tiên theo age(relfrozenxid) giảm dần.

   ④ Trong lúc đó, nới tài nguyên cho autovacuum:
        SET maintenance_work_mem = '2GB';
        ALTER SYSTEM SET autovacuum_vacuum_cost_delay = 0;
        SELECT pg_reload_conf();

   ⑤ SAU KHI SỐNG LẠI: dựng cảnh báo trên age(datfrozenxid).
      Đây mới là thứ ngăn lần sau.
```

## Bẫy thường gặp

| Bẫy | Vì sao hỏng | Cách sửa |
|---|---|---|
| Không theo dõi `age(relfrozenxid)` | Dashboard mặc định không có ô này | Dựng cảnh báo ở mốc 500 triệu và 1 tỷ |
| Tin "Autovacuum lo hết rồi" | Autovacuum bị chặn bởi ba kẻ thù thì nó chạy mà không dọn được gì | Theo dõi cả nguyên nhân lẫn kết quả |
| Tắt autovacuum để "đỡ tốn I/O" | Đây là cách chắc chắn nhất để tới wraparound | Không bao giờ tắt; chỉ điều chỉnh tốc độ |
| `idle in transaction` không có timeout | Một `BEGIN` bị quên chặn VACUUM trên **cả database** | `idle_in_transaction_session_timeout` |
| Replication slot của replica đã tắt | Slot giữ mãi mốc XID cũ | Xoá slot chết; đặt `max_slot_wal_keep_size` |
| Chỉ theo dõi XID, quên MultiXact | Bộ đếm thứ hai cũng đóng cửa ghi được | Theo dõi thêm `mxid_age(relminmxid)` |
| Nghĩ replica chỉ đọc gây wraparound | Giao dịch chỉ đọc dùng XID ảo, không tiêu XID thật | Nhưng nó **vẫn chặn VACUUM dọn** — vẫn phải giới hạn thời lượng |
| Tưởng có `xid8` là hết wraparound | `xid` bên trong vẫn 32 bit | Vẫn phải theo dõi như thường |
| Đợi tới lúc sập mới dọn | VACUUM trên bảng khổng lồ mất hàng chục giờ | Theo dõi từ nhiều tuần trước |
| Khởi động lại máy chủ khi thấy lỗi | Không giúp gì, còn mất thông tin chẩn đoán | Gỡ ba kẻ thù rồi chạy VACUUM |

## Nguồn và kiểm chứng

- **Sentry**, *"Transaction ID Wraparound in Postgres"* — bài mổ sự cố công bố **23/07/2015**. Hệ ghi nặng, bảng lớn, VACUUM không kịp, database ngừng nhận ghi; khôi phục bằng cách chuyển phần cứng mạnh hơn và cuối cùng `TRUNCATE` một bảng ánh xạ quá lớn.
- Ngưỡng: cảnh báo ở **~40 triệu** XID còn lại, ngừng nhận lệnh ghi ở **~3 triệu**. `autovacuum_freeze_max_age` mặc định **200 triệu**. `vacuum_failsafe_age` mặc định **1,6 tỷ** (từ PostgreSQL 14).
- XID nội bộ **vẫn là 32 bit** tính tới các bản PostgreSQL hiện hành. Kiểu `xid8` là kiểu dữ liệu 64 bit có epoch dành cho người dùng, **không thay thế** `xid` bên trong.
- Ở trạng thái từ chối lệnh ghi, **`VACUUM` vẫn chạy được ở chế độ bình thường**; dòng `HINT` gợi ý chế độ một người dùng là lời khuyên bảo thủ, không bắt buộc.

## Tóm tắt bài 12

- **MVCC**: sửa một dòng là đẻ bản mới, giữ bản cũ. Nhờ vậy đọc không chặn ghi — và cái giá là phải nuôi `VACUUM` mãi mãi.
- **XID chỉ có 32 bit** (~4,29 tỷ) và so sánh theo **vòng tròn**: 2 tỷ phía sau là quá khứ, 2 tỷ phía trước là tương lai.
- Dòng cũ không được đóng băng, khi bộ đếm chạy qua 2 tỷ nhịp, **rơi sang nửa tương lai và biến mất** — dữ liệu vẫn trên đĩa nhưng không ai thấy.
- PostgreSQL **tự đóng cửa ghi ở mốc ~3 triệu XID còn lại**. Đây là **lá chắn đang hoạt động đúng**, không phải hệ thống hỏng.
- **Ba kẻ thù chặn VACUUM**: giao dịch mở quá lâu (nhất là `idle in transaction`), replication slot bị bỏ quên, và giao dịch hai pha treo. Không gỡ chúng thì VACUUM chạy cũng vô ích.
- Giao dịch **chỉ đọc không tiêu XID thật**, nhưng **vẫn giữ ảnh chụp và vẫn chặn VACUUM**.
- Còn một bộ đếm 32 bit thứ hai — **MultiXact** — cũng gây ra đúng sự cố này và gần như không ai theo dõi.
- Không dùng XID 64 bit được vì **XID nằm trong từng dòng trên đĩa**; đổi nó là đổi cả định dạng lưu trữ, index và WAL. Có kiểu `xid8` **không** nghĩa là hết wraparound.
- **Thứ cứu bạn là theo dõi `age(datfrozenxid)` từ nhiều tuần trước**, không phải phản ứng lúc sập — vì lúc sập, VACUUM có thể mất hàng chục giờ.

**Bài kế tiếp** → [Bài 13: Cắt bớt kết nối để chạy nhanh hơn](../phase-3-tai-nguyen-va-vong-doi/01-cat-bot-ket-noi-de-chay-nhanh-hon.md)

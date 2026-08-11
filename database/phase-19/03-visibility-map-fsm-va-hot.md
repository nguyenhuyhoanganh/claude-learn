# Bài 3: Visibility Map, Free Space Map và HOT Update

Bạn tạo covering index hoàn hảo, `EXPLAIN` báo `Index Only Scan` — đúng thứ bạn muốn. Nhưng truy vấn vẫn chậm. Nhìn kỹ dòng cuối:

```text
 Index Only Scan using idx_orders_user ON orders  (cost=0.43..8942.11 rows=98422 width=16)
                                                  (actual time=0.089..842.331 rows=98422 loops=1)
   Index Cond: (user_id = 42)
   Heap Fetches: 98422        ◀── "Index ONLY" mà đọc heap 98.422 lần?!
```

`Heap Fetches` bằng đúng số dòng nghĩa là **index only scan không hề "only"** — nó vào heap từng dòng một, chậm hơn cả index scan thường (vì tốn thêm phần kiểm tra). Nguyên nhân nằm ở một file phụ 32 KB mà hầu như không ai để ý: **visibility map**.

Bài này nói về ba cấu trúc phụ trợ nhỏ nhưng quyết định rất nhiều: **visibility map**, **free space map**, và cơ chế **HOT update**.

## Một bảng gồm nhiều file, không phải một

```sql
SELECT pg_relation_filepath('orders');
```

```text
 base/16384/24576
```

Nhưng trên đĩa:

```bash
ls -la /var/lib/postgresql/data/base/16384/24576*
```

```text
-rw------- 1 postgres 1073741824  24576        ← MAIN FORK: dữ liệu thật (1 GB)
-rw------- 1 postgres  106881024  24576.1      ← đoạn thứ 2 (mỗi đoạn tối đa 1 GB)
-rw------- 1 postgres     319488  24576_fsm    ← FREE SPACE MAP (312 KB)
-rw------- 1 postgres      40960  24576_vm     ← VISIBILITY MAP (40 KB)
```

Bốn loại **fork**:

| Fork | Hậu tố | Nội dung | Kích thước tương đối |
|---|---|---|---|
| **main** | *(không có)* | Dữ liệu thật, chia thành đoạn 1 GB | 100% |
| **fsm** | `_fsm` | Mỗi page heap còn trống bao nhiêu | ~0,03% |
| **vm** | `_vm` | 2 bit mỗi page: "sạch chưa", "đóng băng chưa" | ~0,003% |
| **init** | `_init` | Ảnh khởi tạo cho bảng `UNLOGGED` | vài KB |

```text
   ┌──────────────────────── BẢNG orders ────────────────────────┐
   │                                                             │
   │  MAIN FORK  1,1 GB                                          │
   │  ┌────┬────┬────┬────┬────┬────┬────┬────┬────┬────┐        │
   │  │p0  │p1  │p2  │p3  │p4  │p5  │p6  │p7  │p8  │... │        │
   │  └────┴────┴────┴────┴────┴────┴────┴────┴────┴────┘        │
   │     ▲    ▲    ▲                                             │
   │     │    │    │  mỗi page 8 KB                              │
   │  ───┼────┼────┼──────────────────────────────────────────   │
   │  VM │    │    │   2 bit mỗi page                            │
   │  ┌──┴─┬──┴─┬──┴─┬────┬────┐                                 │
   │  │11  │10  │00  │11  │11  │  ...  chỉ 40 KB cho cả 1,1 GB  │
   │  └────┴────┴────┴────┴────┘                                 │
   │  ───────────────────────────────────────────────────────    │
   │  FSM  1 byte mỗi page: còn trống bao nhiêu                  │
   │  ┌────┬────┬────┬────┬────┐                                 │
   │  │ 0  │ 96 │224 │ 0  │ 0  │  ...                            │
   │  └────┴────┴────┴────┴────┘                                 │
   └─────────────────────────────────────────────────────────────┘
```

---

## Visibility Map — hai bit đắt giá

### Cấu trúc

```text
   MỖI PAGE HEAP TỐN ĐÚNG 2 BIT TRONG VM

   bit 0 — ALL_VISIBLE : "MỌI tuple trong page này đều nhìn thấy được
                          với MỌI transaction — không có tuple chết,
                          không có tuple đang dở"
   bit 1 — ALL_FROZEN  : "MỌI tuple trong page này đã ĐÓNG BĂNG —
                          vacuum không cần đụng tới nữa"

   MỘT PAGE VM (8 KB) THEO DÕI:
     (8192 − 24 byte header) × 8 bit ÷ 2 bit = 32.672 page heap
                                             = ~255 MB dữ liệu

   → bảng 100 GB chỉ cần VM ~3 MB. VM gần như luôn nằm trong RAM.
```

Quan hệ giữa hai bit là một chiều: `ALL_FROZEN` bật thì `ALL_VISIBLE` chắc chắn cũng bật. Ngược lại thì không.

### Ai bật, ai tắt

Đây là phần quan trọng nhất và là gốc của mọi sự cố `Heap Fetches`:

```text
   BẬT bit:  CHỈ VACUUM (thủ công hoặc autovacuum)
             ────────────────────────────────────
             không có cách nào khác. Không lệnh nào khác bật được.

   TẮT bit:  BẤT KỲ lệnh ghi nào chạm vào page
             INSERT / UPDATE / DELETE  →  bit về 0 NGAY LẬP TỨC
```

```text
   VÒNG ĐỜI MỘT BIT VM

   VACUUM chạy ──▶ [1] all-visible ──── INSERT vào page ──▶ [0] ──┐
      ▲                                                            │
      └────────────────────  VACUUM chạy lại  ◀────────────────────┘

   Bảng ghi liên tục mà autovacuum không theo kịp
   → phần lớn bit ở trạng thái 0
   → Index Only Scan mất tác dụng hoàn toàn
```

### Index Only Scan hoạt động thế nào

```text
   TRUY VẤN: SELECT user_id, total FROM orders WHERE user_id = 42;
   INDEX   : (user_id, total)          ← index đã chứa đủ mọi cột cần

   VẤN ĐỀ CỐT LÕI: index KHÔNG lưu xmin/xmax.
   Một mục index tồn tại KHÔNG có nghĩa là dòng đó còn sống với BẠN.

   ┌─── với mỗi mục index tìm được ───────────────────────────────┐
   │                                                              │
   │  mục index trỏ tới ctid = (page 87, offset 12)               │
   │                    │                                         │
   │                    ▼                                         │
   │        Tra VM: bit all-visible của page 87 = ?               │
   │                    │                                         │
   │        ┌───────────┴────────────┐                            │
   │        ▼                        ▼                            │
   │     BẬT (1)                  TẮT (0)                         │
   │  "page sạch"              "page có thể bẩn"                  │
   │  → tin index luôn         → PHẢI ĐỌC PAGE 87 TỪ HEAP         │
   │  → KHÔNG đọc heap         → kiểm tra xmin/xmax của tuple      │
   │  → Heap Fetches += 0      → Heap Fetches += 1     ⚠          │
   └──────────────────────────────────────────────────────────────┘
```

### Nhìn thấy nó bằng số

```sql
CREATE EXTENSION IF NOT EXISTS pg_visibility;

CREATE TABLE orders (id bigserial PRIMARY KEY, user_id int, total numeric);
INSERT INTO orders (user_id, total)
SELECT (random()*1000)::int, random()*500 FROM generate_series(1, 500000);
CREATE INDEX idx_ord ON orders (user_id, total);

-- Ngay sau khi nạp: chưa vacuum
SELECT count(*) FILTER (WHERE all_visible) AS page_sach,
       count(*)                            AS tong_page
FROM pg_visibility_map('orders');
```

```text
 page_sach | tong_page
-----------+-----------
         0 |      3922      ← KHÔNG page nào được đánh dấu sạch
```

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id, total FROM orders WHERE user_id = 42;
```

```text
 Index Only Scan using idx_ord on orders  (actual time=0.052..3.918 rows=507 loops=1)
   Heap Fetches: 507                                   ◀ đọc heap 507 lần
   Buffers: shared hit=511
 Execution Time: 3.964 ms
```

Bây giờ chạy vacuum:

```sql
VACUUM (ANALYZE) orders;

SELECT count(*) FILTER (WHERE all_visible) AS page_sach,
       count(*) FILTER (WHERE all_frozen)  AS page_dong_bang,
       count(*)                            AS tong_page
FROM pg_visibility_map('orders');
```

```text
 page_sach | page_dong_bang | tong_page
-----------+----------------+-----------
      3922 |              0 |      3922      ← đã sạch hết
```

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT user_id, total FROM orders WHERE user_id = 42;
```

```text
 Index Only Scan using idx_ord on orders  (actual time=0.031..0.412 rows=507 loops=1)
   Heap Fetches: 0                                     ◀ KHÔNG đọc heap
   Buffers: shared hit=6
 Execution Time: 0.443 ms
```

```text
   TRƯỚC VACUUM:  511 buffer,  3,96 ms
   SAU  VACUUM:     6 buffer,  0,44 ms
   ─────────────────────────────────────
   Nhanh hơn 9 lần. Cùng một index, cùng một truy vấn.
   Khác biệt duy nhất: 3.922 bit trong một file 8 KB.
```

### Chẩn đoán trong production

```sql
-- Bảng nào có Index Only Scan bị hỏng vì VM lạc hậu
SELECT relname,
       n_live_tup,
       n_dead_tup,
       round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS pct_chet,
       last_vacuum, last_autovacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC LIMIT 10;
```

Nếu một bảng bị `Index Only Scan` với `Heap Fetches` cao mà không giảm, cách chữa theo thứ tự:

```sql
-- 1. Dọn ngay
VACUUM (VERBOSE, ANALYZE) orders;

-- 2. Làm autovacuum quyết liệt hơn CHO RIÊNG bảng đó
ALTER TABLE orders SET (
  autovacuum_vacuum_scale_factor = 0.02,   -- mặc định 0.2 (20%!)
  autovacuum_vacuum_threshold    = 1000,
  autovacuum_analyze_scale_factor = 0.01
);

-- 3. Kiểm tra không có transaction dài chặn vacuum (bài 2)
SELECT pid, age(backend_xmin), now() - xact_start
FROM pg_stat_activity WHERE backend_xmin IS NOT NULL
ORDER BY age(backend_xmin) DESC LIMIT 3;
```

Bước 3 quan trọng nhất: nếu có transaction dài, chạy `VACUUM` bao nhiêu lần cũng vô ích.

### Bit `ALL_FROZEN` — vì sao nó tiết kiệm hàng giờ

```text
   VACUUM THƯỜNG:
     bit all-visible bật  → BỎ QUA page (dọn tuple chết thì không cần)
     bit all-frozen  bật  → cũng bỏ qua

   VACUUM QUYẾT LIỆT (aggressive, để chống wraparound):
     bit all-visible bật  → VẪN PHẢI QUÉT (phải kiểm tra tuổi XID)
     bit all-frozen  bật  → BỎ QUA THẬT SỰ            ◀ khác biệt nằm ở đây

   → Bảng 2 TB lưu trữ, chỉ ghi thêm, ĐÃ đóng băng:
       aggressive vacuum chạy trong VÀI GIÂY
   → Cùng bảng đó nhưng CHƯA đóng băng:
       aggressive vacuum quét 2 TB → HÀNG GIỜ, chiếm hết I/O
```

Với bảng lưu trữ chỉ ghi thêm, chạy một lần `VACUUM FREEZE` sau khi nạp xong là khoản đầu tư rất lời.

---

## Free Space Map — tìm chỗ trống ở đâu

Khi `INSERT` một dòng, PostgreSQL cần một page còn đủ chỗ. Quét lần lượt từ page 0 sẽ là thảm hoạ với bảng 100 GB. FSM là bản đồ giải bài toán đó.

```text
   CẤU TRÚC FSM — CÂY BA TẦNG TRONG CHÍNH CÁC PAGE 8 KB

           ┌─────────── FSM tầng 2 (gốc) ───────────┐
           │  max của các nhánh con                 │
           └────────────┬───────────────────────────┘
                ┌───────┴───────┐
        ┌───────▼──────┐ ┌──────▼───────┐
        │ FSM tầng 1   │ │ FSM tầng 1   │      mỗi nút giữ MAX của con
        └───────┬──────┘ └──────┬───────┘
        ┌───────┴───────────────┴───────┐
        ▼                               ▼
   ┌─────────── FSM tầng 0 (lá) ────────────────────────┐
   │  1 BYTE cho MỖI page heap                          │
   │  giá trị 0-255, mỗi bậc = 32 byte trống            │
   │  ví dụ: 96 → còn ~3.072 byte trống                 │
   └────────────────────────────────────────────────────┘

   TÌM CHỖ CHO MỘT DÒNG 200 BYTE:
     đi từ gốc xuống, mỗi tầng chọn nhánh có max >= 200
     → 3 lần đọc page là tìm ra, dù bảng có 13 triệu page
```

Ba đặc điểm cần biết:

| Đặc điểm | Chi tiết | Hệ quả thực tế |
|---|---|---|
| **Độ chính xác thô** | Làm tròn xuống bội số 32 byte | Không dùng để đo bloat chính xác |
| **Không đảm bảo an toàn khi crash** | FSM không được ghi WAL đầy đủ | Sau crash có thể sai; `VACUUM` sửa lại |
| **Chỉ `VACUUM` cập nhật** | `DELETE` **không** báo cho FSM biết chỗ vừa trống | `DELETE` xong mà chưa vacuum thì `INSERT` vẫn nối vào cuối bảng → bảng tiếp tục phình |

Dòng cuối giải thích một hiện tượng hay gặp:

```text
   Bảng hàng đợi: INSERT rồi DELETE liên tục, 1.000 dòng/giây

   Không vacuum kịp:
     DELETE giải phóng chỗ ở page 1..500
     nhưng FSM không biết → INSERT vẫn nối vào page 5.000, 5.001, ...
     → bảng phình lên 10 GB dù lúc nào cũng chỉ có ~2.000 dòng sống   ⚠
```

Xem FSM tận mắt:

```sql
CREATE EXTENSION IF NOT EXISTS pg_freespacemap;

SELECT blkno, avail
FROM pg_freespace('orders')
WHERE avail > 0 ORDER BY blkno LIMIT 5;
```

```text
 blkno | avail
-------+-------
     0 |     0
    12 |  2016
    13 |  4064
  3921 |  5344      ← page cuối, đang được ghi vào
```

---

## HOT Update — cách né toàn bộ chi phí index

Nhắc lại chi phí từ [bài 1](01-mvcc-tuple-header-va-phien-ban.md): một `UPDATE` bình thường tạo tuple mới ở `ctid` mới, nên **mọi index** phải thêm một mục trỏ tới `ctid` đó. Bảng có 5 index thì một `UPDATE` sinh 6 lần ghi.

**HOT** (*Heap-Only Tuple*) là đường tắt né hoàn toàn phần index.

### Hai điều kiện

```text
   ┌───────────────────────────────────────────────────────────┐
   │  1. KHÔNG cột nào bị sửa nằm trong BẤT KỲ index nào        │
   │  2. Tuple mới VỪA CHỖ trong CÙNG page với tuple cũ         │
   └───────────────────────────────────────────────────────────┘
        Thoả CẢ HAI  →  HOT update
        Thiếu một    →  update thường (đắt)
```

### Cơ chế: con trỏ chuyển hướng

```text
   TRƯỚC — update thường (không HOT)
   ═════════════════════════════════
   INDEX A ───────┐        INDEX B ───────┐
                  ▼                       ▼
   page 5: lp[1]→tupleV1        page 9: lp[1]→tupleV2
                                          ▲
                        cả hai index phải THÊM mục trỏ tới (9,1)


   SAU — HOT update
   ════════════════
   INDEX A ───────┐   INDEX B ───────┐
                  ▼                  ▼
   page 5:  ┌──────────────────────────────────────┐
            │ lp[1]  cờ = REDIRECT ──┐             │  ◀ index vẫn trỏ (5,1)
            │                        ▼             │    KHÔNG PHẢI SỬA GÌ
            │ lp[2]  → tuple V2  (HEAP_ONLY_TUPLE) │
            └──────────────────────────────────────┘

   • Index KHÔNG biết gì về V2 và không cần biết
   • Đi từ index → lp[1] → chuyển hướng → lp[2] → tuple hiện hành
   • Chuỗi HOT có thể dài nhiều mắt: lp[1]→lp[2]→lp[3]→...
```

Ba cờ liên quan trong header (đã liệt kê ở [bài 1](01-mvcc-tuple-header-va-phien-ban.md)):

```text
   HEAP_HOT_UPDATED (0x4000 trong infomask2)
       "tuple này đã được HOT-update, phiên bản kế tiếp ở ctid của tôi"
   HEAP_ONLY_TUPLE  (0x8000 trong infomask2)
       "không index nào trỏ tới tôi, chỉ tới được từ heap"
   lp_flags = 2 (REDIRECT)
       con trỏ này không trỏ tuple, nó trỏ sang con trỏ khác
```

### Phần thưởng thứ hai: dọn dẹp không cần vacuum

Đây là lợi ích ít người biết nhưng rất lớn:

```text
   CHUỖI HOT DỌN ĐƯỢC MÀ KHÔNG CẦN VACUUM
   ══════════════════════════════════════

   Vì không index nào trỏ tới các mắt giữa chuỗi, PostgreSQL có thể
   cắt bỏ chúng NGAY TRONG một lần đọc page bình thường
   (gọi là "page pruning" — heap_page_prune).

   TRƯỚC pruning              SAU pruning
   ┌────────────────┐         ┌────────────────┐
   │ lp1 → REDIRECT │         │ lp1 → REDIRECT │──┐
   │ lp2 → V2 (chết)│   ───▶  │ lp2   UNUSED   │  │  trỏ thẳng tới lp4
   │ lp3 → V3 (chết)│         │ lp3   UNUSED   │  │
   │ lp4 → V4 (sống)│         │ lp4 → V4 (sống)│◀─┘
   └────────────────┘         └────────────────┘

   • Xảy ra khi một backend đọc page và thấy page gần đầy
   • Ngay cả SELECT cũng kích hoạt được
   • → bảng chỉ-HOT-update gần như KHÔNG bao giờ phình
```

### Đo tỉ lệ HOT của bạn

```sql
SELECT relname,
       n_tup_upd            AS tong_update,
       n_tup_hot_upd        AS hot_update,
       round(100.0 * n_tup_hot_upd / NULLIF(n_tup_upd, 0), 1) AS ty_le_hot
FROM pg_stat_user_tables
WHERE n_tup_upd > 1000
ORDER BY n_tup_upd DESC LIMIT 10;
```

```text
    relname     | tong_update | hot_update | ty_le_hot
----------------+-------------+------------+-----------
 sessions       |     8492013 |      82011 |       1.0   ⚠ gần như không HOT
 orders         |     1204882 |     998221 |      82.9   ✔ tốt
 user_profiles  |      442019 |     441002 |      99.8   ✔ rất tốt
```

Dòng `sessions` là dấu hiệu của một trong hai vấn đề: hoặc có index trên cột hay đổi, hoặc page không còn chỗ.

### `fillfactor` — chừa chỗ để HOT có đất sống

Mặc định PostgreSQL nhồi page đầy 100%. Với bảng hay `UPDATE`, đó là lựa chọn sai:

```text
   fillfactor = 100 (mặc định)        fillfactor = 80
   ══════════════════════════        ═══════════════
   ┌──────────────────────┐          ┌──────────────────────┐
   │██████████████████████│          │████████████████      │
   │██████████████████████│          │████████████████      │
   │████████████ đầy ─────│          │██ 20% để dành ───────│
   └──────────────────────┘          └──────────────────────┘
   UPDATE → không đủ chỗ             UPDATE → vừa chỗ
   → tuple mới sang page khác        → HOT update ✔
   → KHÔNG HOT được    ✘             → không đụng index
   → mọi index bị ghi                → dọn được bằng pruning
```

Đặt và áp dụng:

```sql
ALTER TABLE sessions SET (fillfactor = 80);
VACUUM FULL sessions;   -- hoặc pg_repack; fillfactor chỉ áp cho page GHI MỚI
```

Số liệu tham khảo trên bảng 1 triệu dòng, mỗi dòng `UPDATE` 20 lần, không có index trên cột bị sửa:

| `fillfactor` | Tỉ lệ HOT | Kích thước bảng sau | WAL sinh ra |
|---|---|---|---|
| 100 | 31% | 1,9 GB | 2,7 GB |
| 90 | 88% | 780 MB | 1,1 GB |
| **80** | **97%** | **610 MB** | **840 MB** |
| 70 | 98% | 690 MB | 830 MB |

Từ 70 trở xuống, chỗ để dành nhiều hơn lợi ích thu được. **80–90 là vùng hợp lý** cho bảng ghi nhiều; giữ 100 cho bảng chỉ đọc hoặc chỉ thêm.

### Cái bẫy lớn nhất: một index phá HOT cho cả bảng

```text
   Bảng users, cột last_seen_at cập nhật mỗi request.

   KHÔNG có index trên last_seen_at
     → UPDATE last_seen_at là HOT  ✔  (rẻ)

   Ai đó thêm:  CREATE INDEX ON users (last_seen_at);
     → cột đó bây giờ ĐÃ ĐƯỢC INDEX
     → MỌI UPDATE chạm nó không còn HOT được nữa
     → mỗi UPDATE ghi thêm vào TẤT CẢ index của bảng, không riêng index mới
     → bảng và 6 index cùng phình

   Một lệnh CREATE INDEX làm hỏng đường ghi của cả bảng.
```

Đây là điều đã nhắc ở [phase-17 bài 7](../phase-17/06-nulls-va-write-amplification.md) và đáng nhắc lại: **trước khi tạo index trên một cột, hãy hỏi cột đó có bị `UPDATE` thường xuyên không.**

> **Giảm nhẹ từ PostgreSQL 14:** cơ chế *bottom-up index deletion* dọn các mục index trỏ tới phiên bản cũ ngay khi page index sắp phải tách, giúp index bớt phình rất nhiều trong đúng kịch bản này. Nó **không** khôi phục HOT, chỉ giảm hậu quả.

---

## Ba cấu trúc, nhìn cùng lúc

```text
   MỘT LỆNH  UPDATE orders SET total = 99 WHERE id = 7;

   ┌─ Cột total có index không? ────────────────────────────────┐
   │  CÓ  → không HOT được                                      │
   │  KHÔNG → xét tiếp                                          │
   └────────────────┬───────────────────────────────────────────┘
                    ▼
   ┌─ Page chứa dòng còn chỗ không? (hỏi chính page, và FSM)     │
   │  KHÔNG → tuple mới sang page khác → không HOT               │
   │  CÓ    → HOT UPDATE ✔                                       │
   └────────────────┬───────────────────────────────────────────┘
                    ▼
   ┌─ Dù đường nào: page bị GHI ────────────────────────────────┐
   │  → bit VM của page đó TẮT ngay                             │
   │  → Index Only Scan trên page đó mất tác dụng               │
   │  → cho tới khi VACUUM chạy lại                             │
   └────────────────────────────────────────────────────────────┘
```

Ba cấu trúc buộc chặt vào nhau, và **`VACUUM` là sợi dây nối cả ba**: nó bật lại bit VM, cập nhật FSM, và dọn các tuple chết mà pruning không xử lý được.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Tin `Index Only Scan` là đã tối ưu | `Heap Fetches` cao khiến nó **chậm hơn** index scan thường | Luôn đọc dòng `Heap Fetches` trong `EXPLAIN (ANALYZE)` |
| Nạp dữ liệu lớn rồi chạy ngay | VM toàn bit 0, mọi index only scan vào heap | `VACUUM (ANALYZE)` ngay sau khi nạp |
| Bảng hàng đợi `INSERT`/`DELETE` liên tục, dùng autovacuum mặc định | FSM lạc hậu → bảng phình dù chỉ có vài nghìn dòng sống | `autovacuum_vacuum_scale_factor = 0.01` cho riêng bảng đó |
| Để `fillfactor = 100` cho bảng ghi nhiều | Tỉ lệ HOT thấp, index phình, WAL gấp 3 | `fillfactor = 80..90` + `pg_repack` |
| Tạo index trên cột `updated_at`/`last_seen` | Phá HOT cho **toàn bộ** bảng | Cân nhắc index bộ phận, hoặc tách cột sang bảng riêng |
| `ALTER TABLE SET (fillfactor=80)` rồi tưởng xong | Chỉ áp dụng cho page **ghi mới** | Chạy `pg_repack`/`VACUUM FULL` để viết lại |
| Dùng `pg_freespace` để đo bloat | FSM làm tròn 32 byte và có thể lạc hậu | Dùng `pgstattuple` hoặc truy vấn ước lượng bloat |

---

## Tóm tắt bài 3

- **Một bảng là nhiều file**: main fork (dữ liệu), `_vm` (visibility map), `_fsm` (free space map), `_init` (bảng unlogged). VM chỉ chiếm ~0,003% kích thước bảng nhưng quyết định rất nhiều.
- **Visibility map dùng 2 bit mỗi page**: `all-visible` và `all-frozen`. Một page VM 8 KB theo dõi ~255 MB heap.
- **Chỉ `VACUUM` bật được bit VM; bất kỳ lệnh ghi nào cũng tắt nó ngay.** Đây là lý do `Index Only Scan` với `Heap Fetches` cao xuất hiện trên bảng ghi nhiều.
- Đo được: cùng một truy vấn, trước vacuum 511 buffer / 3,96 ms → sau vacuum **6 buffer / 0,44 ms**. Khác biệt chỉ nằm ở mấy nghìn bit trong file VM.
- **Bit `all-frozen` giúp aggressive vacuum bỏ qua page thật sự** — biến một lượt quét 2 TB thành vài giây trên bảng lưu trữ. Chạy `VACUUM FREEZE` sau khi nạp dữ liệu là khoản đầu tư rất lời.
- **FSM là cây ba tầng, 1 byte mỗi page heap**, làm tròn theo bậc 32 byte. Nó chỉ được `VACUUM` cập nhật — **`DELETE` không báo cho FSM**, nên bảng hàng đợi chưa vacuum vẫn phình dù dòng sống rất ít.
- **HOT update né toàn bộ chi phí index**, với hai điều kiện: không sửa cột được index, và tuple mới vừa chỗ trong cùng page. Nó dùng con trỏ `REDIRECT` để index không phải biết gì.
- **Chuỗi HOT dọn được bằng page pruning, không cần `VACUUM`** — ngay cả `SELECT` cũng kích hoạt được. Bảng chỉ-HOT-update gần như không phình.
- **`fillfactor = 80` đưa tỉ lệ HOT từ 31% lên 97%** trong phép đo ở trên, giảm kích thước bảng 3 lần và WAL 3 lần. Nhớ `pg_repack` sau khi đổi, vì nó chỉ áp cho page ghi mới.
- **Một `CREATE INDEX` trên cột hay đổi phá HOT cho cả bảng** — mọi `UPDATE` từ đó phải ghi vào mọi index. Đây là chi phí ẩn lớn nhất của việc thêm index.

**Bài kế tiếp** → [Bài 4: VACUUM — cơ chế đầy đủ](04-vacuum-co-che-day-du.md) — cỗ máy bật lại bit VM, cập nhật FSM và dọn xác chết, mổ xẻ từng pha.

# Bài 2: Transaction ID, Snapshot và quy tắc nhìn thấy

[Bài 1](01-mvcc-tuple-header-va-phien-ban.md) cho thấy trên đĩa có nhiều phiên bản của cùng một dòng, mỗi phiên bản mang hai con số `xmin` và `xmax`. Bài này trả lời câu hỏi còn lại — và là câu hỏi khó hơn:

> Khi bạn chạy `SELECT`, PostgreSQL **quyết định thế nào** rằng bạn được thấy phiên bản nào?

Cơ chế đó gọn hơn bạn tưởng: **ba con số** trong một cấu trúc gọi là *snapshot*, đem so với hai con số trong header tuple. Nhưng nó có vài ngóc ngách sinh ra những sự cố rất khó đoán — hint bit làm `SELECT` ghi đĩa, subtransaction tràn làm hệ thống chậm đi 10 lần, `REPEATABLE READ` chụp ảnh muộn hơn bạn nghĩ.

## Transaction ID — cái đồng hồ đếm của database

Mỗi transaction **có ghi dữ liệu** được cấp một số nguyên 32 bit, tăng dần, không lặp lại (cho tới khi tràn — [bài 5](05-autovacuum-freeze-va-wraparound.md)):

```sql
BEGIN;
SELECT pg_current_xact_id();     -- PostgreSQL 13+ ; bản cũ: txid_current()
COMMIT;
```

```text
 pg_current_xact_id
--------------------
             784512
```

Ba XID đặc biệt được dành riêng, không bao giờ cấp cho transaction thật:

```text
   0  InvalidTransactionId    "không có"
   1  BootstrapTransactionId  transaction tạo ra catalog lúc initdb
   2  FrozenTransactionId     "cũ hơn mọi thứ" — dùng cho tuple đã đóng băng
   3+ ...                     XID thật bắt đầu từ đây
```

### Virtual XID — vì sao `SELECT` không tốn XID

Đây là chi tiết mà nhiều người bỏ qua và nó giải thích khá nhiều hành vi:

```text
   MỌI transaction đều có VIRTUAL XID ngay khi BEGIN:
        vxid = (backendID / localXID)   ví dụ  4/1729
        → không tốn tài nguyên toàn cục, chỉ tồn tại trong bộ nhớ

   XID THẬT chỉ được cấp KHI transaction ghi lần đầu:
        INSERT / UPDATE / DELETE / SELECT FOR UPDATE / DDL
        → mới ghi vào bộ đếm toàn cục

   ┌──────────────────────────────────────────────────────────┐
   │ BEGIN;                    → vxid = 4/1729,  xid = 0      │
   │ SELECT * FROM t;          → vẫn xid = 0                  │
   │ SELECT * FROM t;          → vẫn xid = 0                  │
   │ UPDATE t SET x = 1;       → CẤP xid = 784512  ◀ tại đây  │
   │ COMMIT;                                                   │
   └──────────────────────────────────────────────────────────┘
```

Vì sao thiết kế vậy: một hệ thống đọc nhiều có thể chạy hàng triệu `SELECT` mỗi phút. Nếu mỗi cái tốn một XID, bộ đếm 32 bit sẽ cạn trong vài giờ. Cấp lười (*lazy*) giúp bộ đếm chỉ nhích khi thật sự có thay đổi cần theo dõi.

Kiểm chứng:

```sql
BEGIN;
SELECT pg_current_xact_id_if_assigned();   -- → NULL (chưa ghi gì)
SELECT count(*) FROM pg_class;
SELECT pg_current_xact_id_if_assigned();   -- → vẫn NULL
CREATE TEMP TABLE tmp(x int);
SELECT pg_current_xact_id_if_assigned();   -- → 784513  (đã có XID)
ROLLBACK;
```

> **Hệ quả thực tế:** một transaction chỉ đọc **vẫn chặn `VACUUM`** (vì nó giữ một snapshot), nhưng **không** làm bộ đếm XID nhích lên. Hai vấn đề khác nhau, hay bị gộp làm một.

---

## `pg_xact` — cuốn sổ ghi transaction nào đã commit

`xmin = 1050` không nói cho bạn biết transaction 1050 đã commit hay đã abort. Thông tin đó nằm ở nơi khác: thư mục **`pg_xact`** (tên cũ: `pg_clog`, viết tắt của *commit log*).

```text
   MỖI TRANSACTION TỐN ĐÚNG 2 BIT

   00  IN_PROGRESS   đang chạy
   01  COMMITTED     đã commit
   10  ABORTED       đã huỷ
   11  SUB_COMMITTED sub-transaction đã commit, chờ cha quyết

   MỘT PAGE 8 KB CHỨA:
     8192 byte × 4 transaction/byte = 32.768 transaction
   MỘT FILE SEGMENT 256 KB CHỨA:
     1.048.576 transaction

   ls /var/lib/postgresql/data/pg_xact/
   0000  0001  0002  0003  ...
      ▲ mỗi file ≈ 1 triệu transaction
```

Toàn bộ lịch sử commit của 2 tỉ transaction chỉ tốn **512 MB**. Đây là một thiết kế rất tiết kiệm.

`pg_xact` được đọc qua bộ đệm **SLRU** (*Simple Least Recently Used*) trong bộ nhớ chung. Từ PostgreSQL 17 kích thước bộ đệm này chỉnh được:

```sql
SHOW transaction_buffers;    -- PG17+; trước đó tự tính theo shared_buffers
```

Khi hệ thống có rất nhiều transaction đang chạy trên khoảng XID trải rộng, bộ đệm SLRU bị thrash — biểu hiện là `wait_event = 'SLRU'` hoặc `TransactionSLRU` trong `pg_stat_activity`.

### Hint bit — vì sao `SELECT` đầu tiên lại ghi đĩa

Nếu mỗi lần kiểm tra khả kiến đều phải tra `pg_xact`, chi phí sẽ rất lớn. PostgreSQL dùng mẹo: **lần đầu tra được kết quả, nó ghi luôn kết quả vào tuple** dưới dạng cờ trong `t_infomask`.

```text
   LẦN ĐỌC ĐẦU TIÊN sau khi tuple được ghi
   ═══════════════════════════════════════
   tuple: xmin=1050, infomask không có HEAP_XMIN_COMMITTED
      │
      ├─▶ phải tra pg_xact: "1050 commit chưa?"  → RỒI
      │
      └─▶ GHI cờ HEAP_XMIN_COMMITTED vào tuple   ◀── page thành BẨN

   CÁC LẦN ĐỌC SAU
   ═══════════════
   tuple: xmin=1050, infomask CÓ HEAP_XMIN_COMMITTED
      └─▶ tin luôn, KHÔNG tra pg_xact nữa   → nhanh hơn nhiều
```

Hệ quả rất phản trực giác, và là một câu hỏi phỏng vấn kinh điển:

```text
   COPY 10 triệu dòng vào bảng                    → ghi 1,3 GB
   SELECT count(*) FROM bang;   (lần đầu)
        → không sửa dữ liệu gì cả
        → NHƯNG làm bẩn TOÀN BỘ page vì đặt hint bit
        → checkpointer phải GHI LẠI CẢ 1,3 GB xuống đĩa   ⚠

   "Vì sao SELECT của tôi gây bão I/O ghi?"  ← đây là câu trả lời
```

Nếu bật `data_checksums` hoặc `wal_log_hints` (bắt buộc khi dùng `pg_rewind`), việc đặt hint bit còn có thể sinh **full page write vào WAL** — biến một `SELECT` thành nguồn ghi WAL thật sự.

> **Cách làm êm:** chạy `VACUUM` (hoặc `VACUUM FREEZE`) ngay sau khi nạp dữ liệu lớn. Nó đặt hint bit, đóng băng tuple và bật bit visibility map trong một lượt có kiểm soát tốc độ, thay vì để người dùng đầu tiên gánh.

---

## Snapshot — ba con số định nghĩa "thời điểm của bạn"

Snapshot là ảnh chụp trạng thái *"những transaction nào đang chạy vào lúc này"*. Nó gồm đúng ba thành phần:

```sql
BEGIN;
SELECT pg_current_snapshot();
```

```text
 pg_current_snapshot
----------------------------
 784500:784510:784503,784507
 ─┬────  ─┬────  ─┬──────────
  │       │       └── xip[]  : danh sách XID ĐANG CHẠY trong khoảng
  │       └────────── xmax   : XID đầu tiên CHƯA ĐƯỢC CẤP
  └────────────────── xmin   : XID nhỏ nhất còn đang chạy
```

Đọc theo hình:

```text
   TRỤC XID  ─────────────────────────────────────────────────▶

        784499      784500 ..... 784509      784510      784511
   ┌──────────┬─────────────────────────┬────────────────────────┐
   │ ĐÃ XONG  │   VÙNG XÁM              │  TƯƠNG LAI             │
   │ hết rồi  │   phải tra xip[]        │  chưa tồn tại          │
   └──────────┴─────────────────────────┴────────────────────────┘
        ◀ xmin = 784500                  xmax = 784510 ▶

   • XID < xmin           → chắc chắn ĐÃ KẾT THÚC (commit hoặc abort)
   • XID >= xmax          → chắc chắn CHƯA BẮT ĐẦU khi tôi chụp ảnh → VÔ HÌNH
   • xmin <= XID < xmax   → phải xem có trong xip[] không:
                              CÓ  → đang chạy → VÔ HÌNH với tôi
                              KHÔNG → đã kết thúc → tra pg_xact xem commit hay abort
```

Ba con số này là **toàn bộ** định nghĩa về "hiện tại" của một transaction. Chúng không liên quan gì tới đồng hồ tường.

---

## Thuật toán quyết định khả kiến

Đây là trái tim của MVCC — hàm `HeapTupleSatisfiesMVCC` trong mã nguồn. Diễn giải thành sơ đồ:

```text
   ┌─────────────────────────────────────────────────────────────────┐
   │  BƯỚC 1 — TUPLE NÀY ĐÃ THẬT SỰ SINH RA CHƯA?  (xét t_xmin)      │
   └─────────────────────────────────────────────────────────────────┘
                                 │
        xmin có phải CHÍNH TÔI không? ──YES──▶ so cmin với command hiện tại
                                 │              (xem mục "tự thấy mình")
                                 NO
                                 ▼
        xmin đã abort (tra pg_xact / hint bit)? ──YES──▶ ✘ VÔ HÌNH
                                 │                        (chưa từng tồn tại)
                                 NO
                                 ▼
        xmin >= snapshot.xmax ? ──YES──▶ ✘ VÔ HÌNH  (sinh sau khi tôi chụp ảnh)
                                 │
                                 NO
                                 ▼
        xmin nằm trong snapshot.xip[] ? ──YES──▶ ✘ VÔ HÌNH (đang chạy dở)
                                 │
                                 NO
                                 ▼
                    ✔ TUPLE ĐÃ SINH RA VÀ TÔI THẤY ĐƯỢC
                                 │
   ┌─────────────────────────────▼───────────────────────────────────┐
   │  BƯỚC 2 — NÓ CHẾT CHƯA?  (xét t_xmax)                           │
   └─────────────────────────────────────────────────────────────────┘
                                 │
        xmax = 0  hoặc  cờ HEAP_XMAX_INVALID ? ──YES──▶ ✔ NHÌN THẤY
                                 │
                                 NO
                                 ▼
        cờ HEAP_XMAX_LOCK_ONLY ? ──YES──▶ ✔ NHÌN THẤY
                                 │           (chỉ bị KHOÁ, không bị xoá)
                                 NO
                                 ▼
        xmax đã abort ? ──YES──▶ ✔ NHÌN THẤY  (lệnh xoá đã bị huỷ)
                                 │
                                 NO
                                 ▼
        xmax >= snapshot.xmax  HOẶC  nằm trong xip[] ? ──YES──▶ ✔ NHÌN THẤY
                                 │        (người xoá chưa xong với tôi)
                                 NO
                                 ▼
                          ✘ VÔ HÌNH — đã bị xoá xong
```

Gọn lại thành một câu:

> **Một tuple nhìn thấy được khi: người TẠO ra nó đã commit trước ảnh chụp của tôi, VÀ người XOÁ nó thì chưa (hoặc không có, hoặc chỉ khoá chứ không xoá).**

### Ví dụ chạy tay

Bốn transaction, một dòng:

```text
   THỜI GIAN ───────────────────────────────────────────────────▶

   T100  ├──INSERT(id=1,v='A')──COMMIT┤
   T105                    ├──UPDATE v='B'──COMMIT┤
   T110                                  ├──UPDATE v='C'── (ĐANG CHẠY) ─▶
   T112                                        ├─ SELECT * FROM t ─?

   Trên đĩa lúc T112 chạy:
     tuple#1  xmin=100  xmax=105  v='A'
     tuple#2  xmin=105  xmax=110  v='B'
     tuple#3  xmin=110  xmax=0    v='C'

   Snapshot của T112:  xmin=110  xmax=113  xip=[110]

   Xét tuple#1: xmin=100 < 110 và đã commit  → sinh rồi ✔
                xmax=105, đã commit, 105 < 110, không trong xip → CHẾT ✘
   Xét tuple#2: xmin=105 đã commit, < 110    → sinh rồi ✔
                xmax=110, nằm TRONG xip[]    → người xoá CHƯA XONG → SỐNG ✔
   Xét tuple#3: xmin=110 nằm TRONG xip[]     → chưa sinh với tôi   ✘

   → T112 thấy v='B'.  Đúng như mong đợi: nó không thấy việc làm dở của T110.
```

Nếu T110 `COMMIT` rồi T112 chạy lại `SELECT`:
- Ở **`READ COMMITTED`**: T112 lấy **snapshot mới** cho mỗi câu lệnh → thấy `v='C'`.
- Ở **`REPEATABLE READ`**: T112 giữ **snapshot cũ** → vẫn thấy `v='B'`.

Toàn bộ khác biệt giữa hai mức isolation nằm ở **thời điểm chụp ảnh**, không nằm ở khoá.

---

## Isolation level = thời điểm chụp ảnh

```text
   READ COMMITTED  (mặc định)
   ══════════════════════════
   BEGIN;
     SELECT ...;   ← chụp ảnh #1  ─┐
     SELECT ...;   ← chụp ảnh #2   ├─ MỖI CÂU LỆNH một ảnh
     UPDATE ...;   ← chụp ảnh #3  ─┘
   COMMIT;
   → thấy dữ liệu người khác commit ở giữa transaction
   → hiện tượng: non-repeatable read, phantom read


   REPEATABLE READ  /  SERIALIZABLE
   ════════════════════════════════
   BEGIN;
     SELECT ...;   ← chụp ảnh MỘT LẦN ở đây ──┐
     SELECT ...;                              ├─ DÙNG CHUNG một ảnh
     UPDATE ...;                              ┘
   COMMIT;
   → toàn bộ transaction nhìn database ở một thời điểm duy nhất
```

Một điểm tinh tế mà rất nhiều người hiểu sai:

> **Ảnh chụp được lấy ở câu lệnh ĐẦU TIÊN, không phải ở `BEGIN`.**

```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
-- ở đây CHƯA có snapshot nào cả
-- người khác vẫn có thể commit và bạn SẼ thấy thay đổi đó
SELECT 1;                     -- ◀ SNAPSHOT ĐƯỢC CHỤP TẠI ĐÂY
-- từ giờ mới thật sự "đóng băng"
```

Nếu code của bạn `BEGIN` rồi đi làm việc khác 3 giây rồi mới query, thì "ảnh chụp lúc bắt đầu" của bạn thật ra là ảnh chụp 3 giây sau. Muốn chốt sớm, hãy chạy một câu lệnh ngay.

### `READ COMMITTED` và cái bẫy "đọc lại"

Ở `READ COMMITTED`, một `UPDATE` gặp dòng đang bị người khác khoá sẽ làm việc kỳ lạ:

```text
   A: BEGIN; UPDATE t SET v = v + 1 WHERE id = 1;   (chưa commit)
   B: BEGIN; UPDATE t SET v = v * 2 WHERE id = 1;   → CHỜ A

   A: COMMIT;

   B tỉnh dậy và làm gì?
     KHÔNG phải "huỷ vì dữ liệu đã đổi"
     mà là: ĐỌC LẠI phiên bản mới nhất (EPQ — EvalPlanQual),
            kiểm tra lại điều kiện WHERE trên phiên bản đó,
            rồi áp dụng thay đổi lên đó
   → kết quả cuối: (v+1)*2

   Ở REPEATABLE READ, B sẽ nhận:
     ERROR: could not serialize access due to concurrent update
```

Hành vi "đọc lại giữa chừng" này là lý do `READ COMMITTED` có thể cho kết quả **không tương ứng với bất kỳ thứ tự tuần tự nào** — điều mà `REPEATABLE READ` từ chối làm bằng cách báo lỗi.

---

## Tự thấy chính mình — `cmin`, `cmax` và command counter

Một transaction phải thấy thay đổi của **chính nó**, nhưng không phải lúc nào cũng thấy. Xét:

```sql
BEGIN;
INSERT INTO t VALUES (1);     -- lệnh số 0
SELECT * FROM t;              -- lệnh số 1 → PHẢI thấy dòng vừa chèn
UPDATE t SET v = v + 1;       -- lệnh số 2 → ?
COMMIT;
```

Nếu `UPDATE` thấy được các dòng mà **chính nó** vừa tạo, nó sẽ tự cập nhật chồng lên vô hạn. Nên PostgreSQL có **bộ đếm lệnh** (*command id*) trong transaction:

```text
   t_cid trong header tuple lưu:
     • cmin — tuple này được TẠO ở lệnh thứ mấy
     • cmax — tuple này bị XOÁ ở lệnh thứ mấy

   QUY TẮC: tôi thấy tuple do chính tôi tạo NẾU cmin < command id hiện tại

   lệnh 0: INSERT  → tuple có cmin=0
   lệnh 1: SELECT  → 0 < 1  → THẤY   ✔
   lệnh 2: UPDATE  → quét thấy tuple cmin=0 (0 < 2 → thấy), sửa nó,
                     tạo tuple mới cmin=2 → 2 < 2 sai → KHÔNG tự thấy ✔
```

`cmin` và `cmax` **dùng chung một trường 4 byte**. Khi một tuple vừa được tạo vừa bị xoá trong cùng transaction (cần cả hai giá trị), PostgreSQL lưu một **combo CID** — chỉ số vào một bảng tra cứu trong bộ nhớ cục bộ của backend, và bật cờ `HEAP_COMBOCID`.

> **Vì sao chi tiết này quan trọng:** combo CID chỉ tồn tại trong bộ nhớ của tiến trình đó. Sau khi transaction kết thúc, không ai giải mã lại được — nhưng cũng không cần, vì lúc đó chỉ còn quan tâm `xmin`/`xmax`.

---

## Sub-transaction — `SAVEPOINT` và cái vực 64

Mỗi `SAVEPOINT` mở một **sub-transaction** với XID riêng:

```sql
BEGIN;                        -- xid 900
  INSERT INTO t VALUES (1);
  SAVEPOINT sp1;              -- xid 901 (con của 900)
    INSERT INTO t VALUES (2);
  ROLLBACK TO sp1;            -- 901 → ABORTED, nhưng 900 vẫn sống
  INSERT INTO t VALUES (3);   -- xid 902
COMMIT;                       -- 900 và 902 commit; 901 vẫn abort
```

Quan hệ cha–con lưu trong `pg_subtrans`, cùng dạng SLRU như `pg_xact`. Kiểm tra khả kiến cho một tuple do sub-transaction tạo phải **lần ngược lên cha** để biết cuối cùng nó có commit không.

Điểm quan trọng nhất, và là một trong những "vực hiệu năng" khó chẩn đoán nhất của PostgreSQL:

```text
   MỖI BACKEND CÓ BỘ NHỚ ĐỆM 64 SUB-XID trong cấu trúc PGPROC
   ═════════════════════════════════════════════════════════

   ≤ 64 sub-transaction đang mở
     → mọi sub-xid nằm trong bộ đệm chung
     → kiểm tra khả kiến chỉ đọc bộ nhớ         → NHANH

   > 64 sub-transaction đang mở
     → PGPROC bị đánh dấu "OVERFLOWED"
     → snapshot của MỌI backend bị đánh dấu suboverflowed
     → mỗi lần kiểm tra khả kiến với XID lạ phải TRA pg_subtrans (SLRU, có khoá)
     → toàn hệ thống chậm đi, không chỉ phiên gây ra           ⚠ VỰC

   Triệu chứng: wait_event = SubtransSLRU / SubtransBuffer,
                CPU tăng vọt mà không có truy vấn nặng nào
```

Nguồn sinh sub-transaction ngoài `SAVEPOINT` tường minh — đây là chỗ hay bị bất ngờ:

| Nguồn | Có tạo sub-transaction không |
|---|---|
| `SAVEPOINT` | Có (hiển nhiên) |
| Khối `BEGIN ... EXCEPTION WHEN ... END` trong PL/pgSQL | **Có** — mỗi lần vào khối |
| `@Transactional` lồng nhau kiểu `NESTED` (JPA/Spring) | **Có** |
| Django `atomic()` lồng nhau | **Có** |
| Vòng lặp có `EXCEPTION` bên trong, chạy 10.000 vòng | **10.000 sub-transaction** ⚠ |
| `FOR` loop thường trong PL/pgSQL | Không |

Đoạn code trông vô hại sau đây là một quả bom:

```sql
-- BOM: mỗi vòng lặp mở một sub-transaction
DO $$
BEGIN
  FOR i IN 1..100000 LOOP
    BEGIN
      INSERT INTO t VALUES (i);
    EXCEPTION WHEN unique_violation THEN
      NULL;   -- bỏ qua
    END;      -- ◀ khối EXCEPTION này = 1 sub-transaction
  END LOOP;
END $$;
```

Cách chữa: dùng `INSERT ... ON CONFLICT DO NOTHING` thay cho khối `EXCEPTION`, hoặc gom lô và bắt lỗi ở ngoài.

Theo dõi:

```sql
SELECT pid, backend_xid, backend_xmin,
       (SELECT count(*) FROM pg_stat_activity a2
        WHERE a2.wait_event LIKE 'Subtrans%') AS dang_cho_subtrans
FROM pg_stat_activity WHERE state = 'active';
```

---

## `xmin horizon` — con số quyết định vacuum dọn được gì

Từ snapshot của các transaction đang chạy, PostgreSQL tính ra một giá trị toàn cục:

```text
   xmin horizon = XID nhỏ nhất trong số:
       • xmin của mọi snapshot đang mở
       • backend_xmin của mọi kết nối
       • xmin của các khe nhân bản (replication slot)
       • backend_xmin do replica gửi lên (nếu hot_standby_feedback = on)
       • xmin của các prepared transaction

   ┌────────────────────────────────────────────────────────────┐
   │  Tuple chết có xmax < xmin horizon   →  DỌN ĐƯỢC   ✔       │
   │  Tuple chết có xmax >= xmin horizon  →  PHẢI GIỮ   ✘       │
   └────────────────────────────────────────────────────────────┘

   → MỘT transaction cũ kéo horizon lùi lại
   → VACUUM chạy nhưng dọn được 0 tuple, trên TOÀN BỘ database
```

Xem nó bằng mắt:

```sql
SELECT pid, state,
       age(backend_xmin) AS tuoi_xmin,
       now() - xact_start AS da_mo_bao_lau,
       left(query, 50) AS cau_lenh
FROM pg_stat_activity
WHERE backend_xmin IS NOT NULL
ORDER BY age(backend_xmin) DESC
LIMIT 5;
```

```text
  pid  |        state        | tuoi_xmin | da_mo_bao_lau |        cau_lenh
-------+---------------------+-----------+---------------+-------------------------
 21874 | idle in transaction |  18492013 | 05:41:22      | SELECT * FROM orders...
 22015 | active              |     14822 | 00:00:03      | SELECT count(*) FROM ...
```

Dòng đầu là thủ phạm điển hình: một phiên `idle in transaction` mở 5 tiếng 41 phút, giữ 18,5 triệu XID. Mọi tuple chết sinh ra trong 5 tiếng đó **không dọn được**.

Phòng thủ tiêu chuẩn — nên đặt trên mọi hệ thống production:

```sql
ALTER SYSTEM SET idle_in_transaction_session_timeout = '5min';
ALTER SYSTEM SET statement_timeout = '60s';           -- theo vai trò/ứng dụng
SELECT pg_reload_conf();
```

Ba nguồn khác kéo horizon lùi, được mổ xẻ ở [bài 5](05-autovacuum-freeze-va-wraparound.md): khe nhân bản bỏ quên, prepared transaction bị treo, và `hot_standby_feedback` trên replica chạy truy vấn dài.

---

## So sánh XID theo vòng tròn — nền tảng của wraparound

XID là số 32 bit, tức chỉ có ~4,29 tỉ giá trị. Nó **sẽ** tràn. Cách PostgreSQL xử lý:

```text
   XID KHÔNG so sánh theo kiểu số thường, mà theo VÒNG TRÒN modulo 2³²

                        0 / 2³²
                    ┌───────────┐
             2³¹    │           │   XID hiện tại = X
        (quá khứ ▼) │     ●     │
                    │    /│\    │   • 2³¹ XID phía TRƯỚC X  = "quá khứ"
                    │   / │ \   │   • 2³¹ XID phía SAU  X   = "tương lai"
                    └───────────┘
                        2³¹

   → mỗi lúc chỉ "nhìn thấy" được nửa vòng tròn
   → nếu để bộ đếm chạy quá 2³¹ mà không đóng băng tuple cũ,
     tuple cũ đột nhiên rơi vào "tương lai" → BIẾN MẤT KHỎI TẦM NHÌN ⚠
```

Đó là **transaction ID wraparound**, và cách chống là **freeze** — đóng băng tuple đủ cũ để chúng luôn nằm ở "quá khứ". Toàn bộ cơ chế ở [bài 5](05-autovacuum-freeze-va-wraparound.md).

Kiểm tra sức khoẻ ngay bây giờ:

```sql
SELECT datname,
       age(datfrozenxid) AS tuoi_xid,
       round(100.0 * age(datfrozenxid) / 2000000000, 1) AS phan_tram_toi_han
FROM pg_database ORDER BY 2 DESC;
```

```text
 datname  | tuoi_xid  | phan_tram_toi_han
----------+-----------+-------------------
 appdb    | 187492013 |               9.4     ← bình thường
 postgres |  50281922 |               2.5
```

Trên 50% là đáng lo, trên 90% là báo động đỏ.

---

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| "`REPEATABLE READ` chụp ảnh lúc `BEGIN`" | Chụp ở **câu lệnh đầu tiên** | Chạy ngay một câu lệnh sau `BEGIN` nếu cần chốt thời điểm |
| "`SELECT` không ghi gì cả" | Hint bit làm bẩn page → checkpointer phải ghi lại | `VACUUM` sau khi nạp dữ liệu lớn |
| "Transaction chỉ đọc thì vô hại" | Nó giữ snapshot → kéo `xmin horizon` → chặn vacuum toàn database | `idle_in_transaction_session_timeout` |
| Dùng khối `EXCEPTION` trong vòng lặp PL/pgSQL | Mỗi vòng = 1 sub-transaction; quá 64 → cả cụm chậm | `ON CONFLICT DO NOTHING`, bắt lỗi ngoài vòng lặp |
| So sánh XID bằng `>` `<` như số thường | XID so theo vòng tròn modulo 2³² | Dùng `age(xid)` và `txid_current()` cho so sánh an toàn |
| Tin `xmin`/`xmax` cho biết commit hay chưa | Chúng chỉ là **số**; trạng thái nằm ở `pg_xact` | Đọc cờ `t_infomask`, hoặc dùng `pg_visibility`/`pageinspect` |
| Cho rằng `READ COMMITTED` cho kết quả tuần tự hoá được | Cơ chế EPQ đọc lại giữa chừng có thể tạo kết quả không thứ tự nào giải thích được | Dùng `REPEATABLE READ`/`SERIALIZABLE` cho nghiệp vụ có bất biến |

---

## Tóm tắt bài 2

- **Chỉ transaction có ghi mới tốn XID.** Trước đó nó chỉ có *virtual XID*. Nhờ vậy hệ thống đọc nhiều không làm cạn bộ đếm 32 bit.
- **`xmin`/`xmax` chỉ là con số** — trạng thái commit/abort nằm ở `pg_xact`, **2 bit mỗi transaction**, 32.768 transaction trong một page 8 KB.
- **Hint bit là bộ nhớ đệm của kết quả tra `pg_xact`**, ghi thẳng vào tuple. Đây là lý do `SELECT` đầu tiên sau khi nạp dữ liệu lớn **làm bẩn cả bảng và gây bão ghi**.
- **Snapshot có đúng ba thành phần**: `xmin` (nhỏ nhất đang chạy), `xmax` (chưa cấp), `xip[]` (danh sách đang chạy ở giữa). Mọi quyết định khả kiến chỉ so hai số của tuple với ba số này.
- **Isolation level khác nhau ở đúng một chỗ: thời điểm chụp ảnh.** `READ COMMITTED` chụp mỗi câu lệnh, `REPEATABLE READ`/`SERIALIZABLE` chụp một lần — **ở câu lệnh đầu tiên, không phải ở `BEGIN`**.
- **`cmin`/`cmax` (command id)** cho phép transaction thấy việc mình đã làm mà không tự thấy việc đang làm — nếu không có nó, `UPDATE t SET v = v+1` sẽ chạy vô hạn.
- **Quá 64 sub-transaction đang mở là một vực hiệu năng**: snapshot bị đánh dấu tràn, mọi kiểm tra khả kiến phải tra `pg_subtrans` qua SLRU có khoá, và **cả cụm chậm đi** chứ không riêng phiên gây lỗi. Khối `EXCEPTION` trong vòng lặp PL/pgSQL là nguồn phổ biến nhất.
- **`xmin horizon` là con số quyết định `VACUUM` dọn được gì.** Một transaction cũ — kể cả chỉ đọc — kéo nó lùi và làm vacuum vô dụng **trên toàn bộ database**.
- **XID so sánh theo vòng tròn modulo 2³²**, chỉ nhìn được nửa vòng. Đó là lý do phải freeze, và là gốc rễ của sự cố wraparound.

**Bài kế tiếp** → [Bài 3: Visibility Map, Free Space Map và HOT Update](03-visibility-map-fsm-va-hot.md) — ba cấu trúc phụ nhỏ xíu quyết định `Index Only Scan` có thật sự "only" hay không.

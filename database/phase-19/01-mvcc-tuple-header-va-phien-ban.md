# Bài 1: MVCC — dòng dữ liệu không bao giờ bị sửa

Bạn chạy `UPDATE users SET email = 'moi@x.com' WHERE id = 42`. Câu hỏi nghe ngây thơ: **dòng cũ đi đâu?**

Câu trả lời của PostgreSQL làm nhiều người ngạc nhiên: nó **vẫn nằm nguyên đó**, không mất một byte nào. Dòng mới được ghi vào chỗ khác. Trên đĩa bây giờ có **hai** phiên bản của cùng một dòng logic.

Đó là **MVCC** — *Multi-Version Concurrency Control*, điều khiển đồng thời bằng nhiều phiên bản. Toàn bộ hành vi kỳ lạ của PostgreSQL mà bạn từng gặp — bảng phình to sau khi `DELETE`, `VACUUM` phải chạy, transaction dài làm đầy đĩa, `COUNT(*)` chậm — đều bắt nguồn từ một quyết định kiến trúc duy nhất này.

Bài này mổ xẻ nó tới tận byte.

## Ý tưởng cốt lõi trong một hình

```text
   CÁCH SỬA TẠI CHỖ                    CÁCH NHIỀU PHIÊN BẢN (PostgreSQL)
   ════════════════                    ═════════════════════════════════

   ┌──────────────────┐                ┌──────────────────┐
   │ id=42            │                │ id=42            │  ← phiên bản CŨ
   │ email=cu@x.com   │                │ email=cu@x.com   │    vẫn còn nguyên
   └──────────────────┘                │ [chết từ tx 105] │
            │ UPDATE                   ├──────────────────┤
            ▼                          │ id=42            │  ← phiên bản MỚI
   ┌──────────────────┐                │ email=moi@x.com  │
   │ id=42            │                │ [sống từ tx 105] │
   │ email=moi@x.com  │                └──────────────────┘
   └──────────────────┘
   Giá trị cũ ĐÃ MẤT                   Cả hai cùng tồn tại
   → muốn rollback phải chép           → mỗi transaction NHÌN THẤY
     ra undo log trước                   phiên bản hợp với thời điểm của nó
```

Từ đó suy ra nguyên tắc quan trọng nhất của toàn bài:

> **Trong PostgreSQL, `UPDATE` = `DELETE` + `INSERT`.** Không có ngoại lệ. Ngay cả khi bạn chỉ sửa một cột `boolean`, cả dòng vẫn được chép ra chỗ mới.

Và hệ quả trực tiếp:

> **`DELETE` không xoá byte nào.** Nó chỉ ghi một con số vào header của dòng, nói rằng "từ transaction này trở đi, đừng nhìn tôi nữa".

---

## Bố cục một page heap

Trước khi nói tới dòng, phải nói tới **page** — đơn vị 8 KB mà PostgreSQL đọc/ghi (đã học ở [phase-3 bài 1](../phase-3/01-page-heap-va-io.md)). Bên trong nó trông thế này:

```text
   MỘT PAGE HEAP = 8192 BYTE
   ┌──────────────────────────────────────────────────────────────────┐ 0
   │ PageHeaderData — 24 byte                                         │
   │  • pd_lsn      : vị trí WAL của lần sửa cuối (dùng cho recovery)  │
   │  • pd_checksum : tổng kiểm tra (nếu bật data_checksums)           │
   │  • pd_flags    : cờ, có PD_HAS_FREE_LINES / PD_PAGE_FULL /        │
   │                  PD_ALL_VISIBLE                                   │
   │  • pd_lower    : offset cuối mảng con trỏ  ─────────┐             │
   │  • pd_upper    : offset đầu vùng tuple      ────────┼──┐          │
   │  • pd_special, pd_pagesize_version, pd_prune_xid    │  │          │
   ├─────────────────────────────────────────────────────┼──┼─────────┤ 24
   │ MẢNG CON TRỎ DÒNG (line pointer / ItemId) — 4 byte/cái           │
   │  [1] → offset 8100, dài 60, cờ NORMAL                            │
   │  [2] → offset 8040, dài 60, cờ NORMAL                            │
   │  [3] → offset 7980, dài 60, cờ DEAD                              │
   │  ...                            ▼ mảng này MỌC XUỐNG              │
   ├──────────────────────────pd_lower───────────────────────────────┤
   │                                                                  │
   │                    KHOẢNG TRỐNG (free space)                     │
   │                                                                  │
   ├──────────────────────────pd_upper───────────────────────────────┤
   │                                 ▲ vùng dữ liệu MỌC LÊN            │
   │ tuple #3  [header 23B][dữ liệu]                                  │
   │ tuple #2  [header 23B][dữ liệu]                                  │
   │ tuple #1  [header 23B][dữ liệu]                                  │
   └──────────────────────────────────────────────────────────────────┘ 8192
```

Hai chi tiết đáng nhớ:

1. **Mảng con trỏ mọc xuống, vùng dữ liệu mọc lên.** Chúng gặp nhau ở giữa; khi `pd_lower` chạm `pd_upper` thì page đầy.
2. **Địa chỉ của một dòng là `(số page, số thứ tự con trỏ)`** — gọi là **`ctid`**. Ví dụ `(0,3)` = page 0, con trỏ thứ 3. Index không trỏ thẳng vào byte, nó trỏ vào `ctid`. Nhờ vậy PostgreSQL dồn dòng trong page mà **không phải sửa index** — chỉ cần đổi con trỏ.

> **Vì sao có lớp con trỏ:** nếu index trỏ thẳng vào byte offset, thì mỗi lần dọn page phải cập nhật mọi index. Lớp con trỏ 4 byte biến việc đó thành sửa một số nguyên trong chính page đó.

---

## Bố cục header của một tuple

Mỗi dòng vật lý (gọi là **tuple**) mang một header **23 byte** trước dữ liệu thật:

```text
   HEADER TUPLE — 23 byte (bị đệm lên 24 cho thẳng hàng)

   byte  0 ─ 3    t_xmin        ID transaction đã TẠO tuple này
   byte  4 ─ 7    t_xmax        ID transaction đã XOÁ/KHOÁ tuple này (0 = chưa)
   byte  8 ─ 11   t_cid         số thứ tự lệnh trong transaction (cmin/cmax)
   byte 12 ─ 17   t_ctid        địa chỉ (page, offset) — TRỎ TỚI PHIÊN BẢN MỚI HƠN
   byte 18 ─ 19   t_infomask2   số cột + cờ HOT
   byte 20 ─ 21   t_infomask    16 cờ trạng thái  ← trường quan trọng nhất
   byte 22        t_hoff        dữ liệu bắt đầu ở byte thứ mấy
   byte 23...     null bitmap   1 bit mỗi cột (chỉ có nếu dòng chứa NULL)
   ─────────────  DỮ LIỆU THẬT của các cột
```

**Bốn trường quyết định tất cả:**

| Trường | Vai trò | Ví dụ giá trị |
|---|---|---|
| `t_xmin` | "Tôi sinh ra ở transaction số mấy" | `1050` |
| `t_xmax` | "Tôi chết ở transaction số mấy" — `0` nghĩa là còn sống | `0` hoặc `1077` |
| `t_ctid` | Trỏ tới **chính mình** nếu là bản mới nhất; trỏ tới **bản kế tiếp** nếu đã bị `UPDATE` | `(0,1)` hoặc `(0,5)` |
| `t_infomask` | 16 cờ: đã commit chưa, có bị khoá không, `xmax` là multixact hay không… | `0x0902` |

Các cờ `t_infomask` hay gặp — bạn sẽ đọc chúng nhiều lần trong các bài sau:

```text
   0x0001  HEAP_HASNULL           dòng có cột NULL → có null bitmap
   0x0002  HEAP_HASVARWIDTH       có cột độ dài thay đổi (text, varchar)
   0x0004  HEAP_HASEXTERNAL       có cột đẩy ra TOAST
   0x0010  HEAP_XMAX_KEYSHR_LOCK  xmax là khoá FOR KEY SHARE
   0x0040  HEAP_XMAX_EXCL_LOCK    xmax là khoá độc quyền
   0x0080  HEAP_XMAX_LOCK_ONLY    xmax CHỈ khoá, KHÔNG xoá  ← rất quan trọng
   0x0100  HEAP_XMIN_COMMITTED    "xmin đã commit" — HINT BIT
   0x0200  HEAP_XMIN_INVALID      "xmin đã abort"  — HINT BIT
   0x0300  HEAP_XMIN_FROZEN       tuple đã ĐÓNG BĂNG (cả hai bit trên)
   0x0400  HEAP_XMAX_COMMITTED    "xmax đã commit" — HINT BIT
   0x0800  HEAP_XMAX_INVALID      "xmax đã abort / không có"
   0x1000  HEAP_XMAX_IS_MULTI     xmax là MultiXactId, không phải XID thường
   0x2000  HEAP_UPDATED           tuple này là kết quả của một UPDATE
```

Và `t_infomask2`:

```text
   0x07FF  HEAP_NATTS_MASK    11 bit thấp = số cột của dòng
   0x2000  HEAP_KEYS_UPDATED  UPDATE có đụng tới cột khoá
   0x4000  HEAP_HOT_UPDATED   tuple này đã được UPDATE kiểu HOT
   0x8000  HEAP_ONLY_TUPLE    tuple này CHỈ tới được từ heap, index không trỏ
```

Hai cờ cuối là nền tảng của **HOT update** — chủ đề của [bài 3](03-visibility-map-fsm-va-hot.md).

---

## Ba lệnh ghi, nhìn ở mức byte

Dùng một bảng ví dụ để theo dõi xuyên suốt:

```sql
CREATE TABLE tk (id INT PRIMARY KEY, so_du INT);
INSERT INTO tk VALUES (1, 100);
```

### `INSERT` — ghi một tuple mới

```text
   Transaction 1050 chạy: INSERT INTO tk VALUES (1, 100);

   PAGE 0
   ┌─────────────────────────────────────────────────────────┐
   │ lp[1] → tuple A                                         │
   ├─────────────────────────────────────────────────────────┤
   │ tuple A:  xmin=1050  xmax=0  ctid=(0,1)  data={1,100}   │
   │                              ▲                          │
   │                    trỏ vào CHÍNH NÓ = "tôi là bản mới nhất"│
   └─────────────────────────────────────────────────────────┘

   Giải nghĩa:  "sinh ra ở 1050, chưa chết, không có bản nào mới hơn"
```

### `UPDATE` — ghi tuple mới, đánh dấu tuple cũ

```text
   Transaction 1077 chạy: UPDATE tk SET so_du = 90 WHERE id = 1;

   PAGE 0
   ┌─────────────────────────────────────────────────────────┐
   │ lp[1] → tuple A        lp[2] → tuple B                  │
   ├─────────────────────────────────────────────────────────┤
   │ tuple A:  xmin=1050  xmax=1077  ctid=(0,2)  data={1,100}│
   │                      ▲▲▲▲▲▲▲▲▲  ▲▲▲▲▲▲▲▲▲               │
   │                      "chết ở 1077"  "bản mới ở (0,2)"   │
   │                                                          │
   │ tuple B:  xmin=1077  xmax=0     ctid=(0,2)  data={1,90} │
   └─────────────────────────────────────────────────────────┘

   Hai tuple, một dòng logic. Chuỗi phiên bản: A ──ctid──▶ B
```

Chú ý ba việc xảy ra cùng lúc:
- Tuple A **không bị sửa dữ liệu**, chỉ header bị ghi thêm `xmax` và `ctid`.
- Tuple B là **bản sao đầy đủ** của cả dòng, kể cả các cột không đổi.
- Nếu cột được sửa **có index**, index phải thêm một mục trỏ tới `(0,2)` — đây là nguồn khuếch đại ghi lớn ([phase-17 bài 7](../phase-17/06-nulls-va-write-amplification.md)).

### `DELETE` — chỉ ghi một con số

```text
   Transaction 1090 chạy: DELETE FROM tk WHERE id = 1;

   │ tuple B:  xmin=1077  xmax=1090  ctid=(0,2)  data={1,90} │
   │                      ▲▲▲▲▲▲▲▲▲            ▲▲▲▲▲▲▲▲▲     │
   │                  "chết ở 1090"       ctid vẫn trỏ chính nó
   │                                      (không có bản mới hơn)

   Dữ liệu {1,90} VẪN CÒN NGUYÊN trên đĩa.
   Không gian chỉ được trả lại khi VACUUM chạy.
```

Đây là câu trả lời cho câu hỏi kinh điển *"tôi vừa `DELETE` 10 triệu dòng, sao bảng không nhỏ đi?"*

### `ROLLBACK` — không làm gì cả

Đây là điểm đẹp nhất của thiết kế này:

```text
   Transaction 1077 chạy UPDATE rồi ROLLBACK.

   PostgreSQL làm gì?   ──▶   GHI 1 BIT vào pg_xact: "1077 = ABORTED".  HẾT.

   Tuple A: xmax=1077 → nhưng 1077 đã abort → xmax KHÔNG TÍNH → A vẫn sống ✔
   Tuple B: xmin=1077 → nhưng 1077 đã abort → B chưa từng tồn tại   ✔

   ROLLBACK của 10 triệu dòng cũng nhanh bằng ROLLBACK của 1 dòng.
```

So sánh với InnoDB, nơi rollback phải **đọc undo log và hoàn tác từng dòng một** — thời gian tỉ lệ với số dòng đã sửa. Một `ROLLBACK` sau khi lỡ `UPDATE` 50 triệu dòng trong MySQL có thể chạy hàng chục phút, và **không huỷ được**.

Đánh đổi: PostgreSQL trả giá ở phía sau — bằng `VACUUM`.

---

## Nhìn tận mắt bằng `pageinspect`

Đây không phải lý thuyết. Bạn xem được từng byte:

```sql
CREATE EXTENSION IF NOT EXISTS pageinspect;

CREATE TABLE tk (id INT PRIMARY KEY, so_du INT);
INSERT INTO tk VALUES (1, 100);
UPDATE tk SET so_du = 90 WHERE id = 1;
UPDATE tk SET so_du = 80 WHERE id = 1;

SELECT lp, lp_off, lp_flags, t_xmin, t_xmax, t_ctid,
       lpad(to_hex(t_infomask), 4, '0') AS infomask_hex
FROM heap_page_items(get_raw_page('tk', 0));
```

```text
 lp | lp_off | lp_flags | t_xmin | t_xmax | t_ctid | infomask_hex
----+--------+----------+--------+--------+--------+--------------
  1 |   8160 |        1 |   1050 |   1077 | (0,2)  | 0500          ← chết, trỏ tới (0,2)
  2 |   8120 |        1 |   1077 |   1090 | (0,3)  | 2500          ← chết, trỏ tới (0,3)
  3 |   8080 |        1 |   1090 |      0 | (0,3)  | 2900          ← SỐNG, trỏ chính mình
```

Giải mã ba giá trị `infomask` đó theo bảng cờ ở trên:

```text
   0x0500 = 0x0100 XMIN_COMMITTED + 0x0400 XMAX_COMMITTED
            → "người tạo đã commit, người xoá cũng đã commit"  → CHẾT

   0x2500 = 0x0100 XMIN_COMMITTED + 0x0400 XMAX_COMMITTED + 0x2000 UPDATED
            → như trên, và tuple này SINH RA TỪ MỘT UPDATE

   0x2900 = 0x0100 XMIN_COMMITTED + 0x0800 XMAX_INVALID + 0x2000 UPDATED
            → "không có ai xoá tôi"                            → SỐNG
```

Đọc bảng này như đọc một danh sách liên kết:

```text
   lp=1  ──▶  lp=2  ──▶  lp=3  ──▶  (chính nó = hết chuỗi)
   xmin  1050      1077      1090
   xmax  1077      1090         0
        (chết)    (chết)     (SỐNG)

   Một dòng logic  =  ba tuple vật lý  =  ba lần bạn UPDATE
```

Ý nghĩa `lp_flags`:

| Giá trị | Tên | Nghĩa |
|---|---|---|
| `0` | `UNUSED` | Con trỏ trống, dùng lại được |
| `1` | `NORMAL` | Trỏ tới một tuple thật |
| `2` | `REDIRECT` | Trỏ sang con trỏ khác (chuỗi HOT — [bài 3](03-visibility-map-fsm-va-hot.md)) |
| `3` | `DEAD` | Tuple đã bị dọn, nhưng con trỏ còn giữ vì index có thể còn trỏ tới |

Xem kích thước bảng phình lên theo từng `UPDATE`:

```sql
SELECT pg_size_pretty(pg_relation_size('tk')) AS kich_thuoc,
       (SELECT count(*) FROM heap_page_items(get_raw_page('tk',0))
        WHERE t_xmax <> 0) AS tuple_chet;
```

```text
 kich_thuoc | tuple_chet
------------+------------
 8192 bytes |          2
```

Chạy `UPDATE tk SET so_du = so_du - 1;` 200 lần rồi đo lại: bảng một-dòng của bạn sẽ chiếm nhiều page. Đó chính là **bloat**, sinh ra một cách hoàn toàn bình thường.

---

## Năm hệ quả bạn phải sống chung

### 1. Đọc không bao giờ chặn ghi, ghi không bao giờ chặn đọc

Đây là phần thưởng lớn nhất, và là lý do người ta chấp nhận mọi phiền toái còn lại:

```text
   TRANSACTION A (đọc)                TRANSACTION B (ghi)
   ═══════════════════                ═══════════════════
   BEGIN;                             BEGIN;
   SELECT * FROM tk;                  UPDATE tk SET so_du=90;
     → thấy phiên bản CŨ                → tạo phiên bản MỚI
     → KHÔNG CHỜ                        → KHÔNG CHỜ A
   SELECT * FROM tk;                  COMMIT;
     → VẪN thấy phiên bản cũ
       (nếu ở REPEATABLE READ)
   COMMIT;

   Không ai chặn ai. Hai bên đọc/ghi hai vùng byte KHÁC NHAU.
```

Trong hệ chỉ dùng khoá (SQL Server ở mức mặc định, hoặc bất kỳ hệ 2PL thuần nào), báo cáo chạy 5 phút sẽ chặn mọi lệnh ghi trong 5 phút đó. Với MVCC, nó không chặn gì cả.

> **Nhưng** hai lệnh **ghi** vào cùng một dòng vẫn phải chờ nhau. MVCC giải quyết xung đột đọc-ghi, **không** giải quyết xung đột ghi-ghi. Ghi-ghi vẫn phải dùng khoá — chủ đề của [bài 7](07-ban-do-day-du-cac-loai-khoa.md).

### 2. Bảng phình, và ai đó phải dọn

```text
   Bảng 1 triệu dòng, mỗi giờ UPDATE mỗi dòng một lần, KHÔNG vacuum:

   giờ 0:  1 triệu tuple sống                          → 130 MB
   giờ 1:  1 triệu sống + 1 triệu chết                 → 260 MB
   giờ 5:  1 triệu sống + 5 triệu chết                 → 780 MB
   giờ 24: 1 triệu sống + 24 triệu chết                → 3,2 GB

   Truy vấn "SELECT * FROM t WHERE id = ?" vẫn nhanh (có index).
   Nhưng "SELECT count(*)" phải quét 3,2 GB thay vì 130 MB → chậm 25 lần.
```

Đây là lý do `VACUUM` không phải "việc bảo trì tuỳ chọn" mà là **một phần bắt buộc của cơ chế**. Toàn bộ [bài 4](04-vacuum-co-che-day-du.md) và [bài 5](05-autovacuum-freeze-va-wraparound.md) nói về nó.

### 3. Index trỏ tới **tuple**, không trỏ tới **dòng**

```text
   Bảng có 3 index. UPDATE một dòng (không HOT được):

   heap:    + 1 tuple mới
   index 1: + 1 mục trỏ (0,2)      ← mục cũ trỏ (0,1) VẪN CÒN
   index 2: + 1 mục trỏ (0,2)
   index 3: + 1 mục trỏ (0,2)

   → 1 lệnh UPDATE = 4 lần ghi vật lý
   → càng nhiều index, UPDATE càng đắt (khác hẳn với SELECT)
```

Và vì index không lưu thông tin MVCC, một mục index **không tự biết** tuple nó trỏ tới còn sống hay không. Đây chính là lý do phải có **visibility map** ([bài 3](03-visibility-map-fsm-va-hot.md)).

### 4. `COUNT(*)` phải đếm thật

```text
   MyISAM lưu sẵn số dòng  →  SELECT count(*) tức thì
   InnoDB, PostgreSQL      →  phải ĐẾM

   Vì sao PostgreSQL không lưu sẵn được?
     Vì "số dòng" KHÔNG PHẢI một con số duy nhất!
     Transaction A (snapshot cũ)  thấy 1.000 dòng
     Transaction B (snapshot mới) thấy 1.005 dòng
     → cùng một thời điểm, hai câu trả lời ĐỀU ĐÚNG
```

Cách chữa thực dụng khi chỉ cần con số áng chừng:

```sql
SELECT reltuples::bigint AS uoc_luong
FROM pg_class WHERE relname = 'orders';
```

Con số này do `ANALYZE`/`VACUUM` cập nhật, sai số vài phần trăm, nhưng **tức thì** thay vì quét cả bảng.

### 5. Một transaction dài giữ chân cả hệ thống

```text
   Transaction #900 mở lúc 9h00 và... quên commit.
   Bây giờ là 15h00.

   PostgreSQL phải tự hỏi: "#900 có thể vẫn cần thấy tuple nào?"
   Câu trả lời an toàn duy nhất: MỌI tuple chết từ 9h00 tới giờ.

   → VACUUM chạy nhưng KHÔNG DỌN ĐƯỢC GÌ suốt 6 tiếng
   → bảng phình không kiểm soát
   → và điều tệ nhất: chuyện này xảy ra trên TOÀN BỘ database,
     kể cả các bảng mà #900 chưa bao giờ chạm tới
```

Khái niệm này gọi là **xmin horizon** (chân trời xmin) — mổ xẻ đầy đủ ở [bài 5](05-autovacuum-freeze-va-wraparound.md). Đây là nguyên nhân số một của sự cố bloat trong thực tế.

---

## PostgreSQL và InnoDB — hai lời giải cho cùng bài toán

InnoDB cũng có MVCC, nhưng cài đặt ngược hẳn:

```text
   POSTGRESQL — phiên bản nằm TRONG bảng
   ═════════════════════════════════════
   ┌─────────── bảng orders ───────────┐
   │  tuple v1 (chết)                  │
   │  tuple v2 (chết)                  │  Muốn đọc bản cũ:
   │  tuple v3 (SỐNG) ◀────────────────┼── đọc thẳng, nó nằm ngay đây
   └───────────────────────────────────┘
   → bảng to lên, cần VACUUM
   → đọc bản cũ RẺ, rollback RẺ


   INNODB — bản mới nằm trong bảng, bản cũ nằm trong UNDO LOG
   ═════════════════════════════════════════════════════════
   ┌──── bảng orders ────┐      ┌──── undo log (rollback segment) ────┐
   │  dòng (bản MỚI NHẤT)│─────▶│ v2 ──▶ v1 ──▶ v0                     │
   └─────────────────────┘      └──────────────────────────────────────┘
   → bảng gọn, không cần VACUUM bảng
   → nhưng đọc bản cũ phải LẦN NGƯỢC chuỗi undo (càng cũ càng chậm)
   → và undo log phình thay cho bảng
```

| | **PostgreSQL** | **InnoDB (MySQL)** |
|---|---|---|
| Phiên bản cũ để ở đâu | Ngay trong bảng | Undo log riêng |
| `UPDATE` một cột | Chép **cả dòng** | Sửa tại chỗ + ghi undo cho **cột đổi** |
| Index có phải sửa không | **Có**, mọi index (trừ HOT) | Chỉ index chứa cột bị sửa |
| `ROLLBACK` | **Tức thì** (ghi 1 bit) | Chậm, tỉ lệ số dòng đã sửa |
| Đọc dữ liệu cũ | Rẻ, đọc thẳng | Phải lần chuỗi undo |
| Chỗ phình khi có tx dài | **Bảng và index** | **Undo tablespace** |
| Việc dọn dẹp | `VACUUM` | Purge thread |
| Lỗi kinh điển | Bảng phình, wraparound | `History list length` tăng vô hạn |

Điểm quan trọng: **cả hai đều bị transaction dài làm hại**, chỉ khác chỗ nó làm phình. Không có bên nào thoát.

> **Một khác biệt nữa ít người biết:** trong InnoDB, index phụ trỏ tới **khoá chính** chứ không trỏ tới địa chỉ vật lý. Nên khi dòng dịch chuyển, index phụ không cần sửa — nhưng mỗi lần đọc qua index phụ lại tốn thêm một lần tra cứu vào index chính. Chi tiết ở [phase-17 bài 6](../phase-17/05-indexing-postgres-vs-mysql.md).

---

## Vì sao PostgreSQL chọn cách này

Câu hỏi công bằng: nếu MVCC-trong-bảng gây bloat, sao không đổi?

```text
   ĐƯỢC                                 MẤT
   ════                                 ═══
   ✔ Đọc không bao giờ chặn ghi         ✘ Bảng phình, phải VACUUM
   ✔ ROLLBACK tức thì, không giới hạn   ✘ UPDATE chép cả dòng
   ✔ Không có "undo tablespace đầy"     ✘ Mọi index phải cập nhật
   ✔ Không có giới hạn số phiên bản     ✘ XID 32 bit → nguy cơ wraparound
   ✔ Cài đặt đơn giản, ít điểm hỏng     ✘ COUNT(*) phải quét
   ✔ Recovery sau crash đơn giản hơn
     (không phải hoàn tác undo)
```

Đây là một đánh đổi có chủ đích, không phải thiếu sót. Cộng đồng PostgreSQL đã bàn nhiều lần về "zheap" (engine kiểu undo) — dự án tồn tại nhưng chưa vào nhân, vì cái giá về độ phức tạp quá cao so với lợi ích.

**Điều cần rút ra không phải "cách nào tốt hơn", mà là: nếu bạn dùng PostgreSQL, bạn phải hiểu và chăm sóc `VACUUM`.** Nó không phải tuỳ chọn.

---

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách đúng |
|---|---|---|
| "`DELETE` giải phóng đĩa" | `DELETE` chỉ ghi `xmax`; đĩa không giảm một byte | `VACUUM` để tái dùng chỗ; `pg_repack`/`VACUUM FULL` để trả đĩa về hệ điều hành |
| "Sửa một cột `boolean` thì rẻ" | Cả dòng bị chép, mọi index bị cập nhật | Tách cột hay đổi ra bảng riêng; hoặc bỏ index trên cột đó để bật HOT |
| "`UPDATE` liên tục vào một dòng thì không phình" | Mỗi lần sinh một tuple mới; một dòng có thể chiếm hàng nghìn page | Đặt `fillfactor` thấp + autovacuum quyết liệt cho bảng đó |
| Dùng `SELECT count(*)` để hiển thị số bản ghi trên UI | Quét toàn bảng, gồm cả tuple chết | `reltuples` từ `pg_class`, hoặc bảng đếm riêng |
| "Bảng nhỏ nên không cần quan tâm vacuum" | Bảng nhỏ ghi nhiều (hàng đợi, session) là nơi bloat tệ nhất | Chính các bảng đó cần `autovacuum_vacuum_scale_factor` rất thấp |
| Mở transaction rồi chờ API bên ngoài trả lời | Chặn vacuum trên **toàn database** suốt thời gian chờ | Gọi API **ngoài** transaction; đặt `idle_in_transaction_session_timeout` |
| Tin rằng `ctid` là định danh ổn định của dòng | `ctid` đổi sau mỗi `UPDATE` và sau `VACUUM FULL` | Dùng khoá chính; `ctid` chỉ để chẩn đoán |

---

## Kiểm chứng nhanh trên máy bạn

```sql
-- 1. Tạo bảng và làm bẩn nó
CREATE TABLE demo (id INT PRIMARY KEY, v INT);
INSERT INTO demo SELECT i, 0 FROM generate_series(1, 10000) i;
SELECT pg_size_pretty(pg_total_relation_size('demo'));   -- ~ 752 kB

-- 2. UPDATE toàn bảng 5 lần
DO $$ BEGIN FOR i IN 1..5 LOOP UPDATE demo SET v = v + 1; END LOOP; END $$;
SELECT pg_size_pretty(pg_total_relation_size('demo'));   -- ~ 3.3 MB  (gấp 4,4 lần!)

-- 3. Đếm xác chết
CREATE EXTENSION IF NOT EXISTS pgstattuple;
SELECT tuple_count, dead_tuple_count,
       round(dead_tuple_percent::numeric, 1) AS phan_tram_chet
FROM pgstattuple('demo');
--  tuple_count | dead_tuple_count | phan_tram_chet
--        10000 |            50000 |           83.3

-- 4. Dọn
VACUUM demo;
SELECT pg_size_pretty(pg_total_relation_size('demo'));   -- vẫn ~3.3 MB!
--    ▲ VACUUM thường KHÔNG trả đĩa về HĐH, nó chỉ đánh dấu chỗ để TÁI DÙNG

VACUUM FULL demo;
SELECT pg_size_pretty(pg_total_relation_size('demo'));   -- ~ 752 kB  (đã trả đĩa)
```

Bước 4 là bài học quan trọng nhất trong cả đoạn: **`VACUUM` và `VACUUM FULL` là hai việc khác nhau**, và 99% thời gian bạn muốn cái đầu tiên. Vì sao — ở [bài 4](04-vacuum-co-che-day-du.md).

---

## Tóm tắt bài 1

- **PostgreSQL không bao giờ sửa dòng tại chỗ.** `UPDATE` = ghi tuple mới + đánh dấu tuple cũ. `DELETE` = chỉ ghi `xmax`. Không byte dữ liệu nào bị ghi đè.
- **Mỗi tuple mang header 23 byte**, trong đó bốn trường quyết định tất cả: `xmin` (sinh ở transaction nào), `xmax` (chết ở transaction nào), `ctid` (trỏ tới phiên bản mới hơn), `t_infomask` (16 cờ trạng thái).
- **`ctid = (số page, số con trỏ)`** là địa chỉ vật lý mà index trỏ tới. Lớp con trỏ trong page cho phép dồn dòng mà không phải sửa index.
- **`ROLLBACK` chỉ ghi một bit** vào `pg_xact` — nên rollback 10 triệu dòng nhanh bằng rollback 1 dòng. InnoDB thì phải hoàn tác từng dòng qua undo log.
- **Cái giá là bloat**: mỗi `UPDATE` sinh một tuple chết, và không ai dọn thì bảng phình vô hạn. `VACUUM` không phải bảo trì tuỳ chọn — nó là **một nửa của cơ chế**.
- **Phần thưởng là đọc không chặn ghi và ghi không chặn đọc.** Báo cáo chạy 5 phút không làm treo hệ thống. Nhưng ghi-ghi vào cùng một dòng thì vẫn phải khoá.
- **`UPDATE` một cột chép cả dòng và cập nhật mọi index** — nên chi phí `UPDATE` tỉ lệ với **số index của bảng**, không phải số cột bạn sửa.
- **Transaction dài là kẻ thù số một**: nó khiến `VACUUM` không dọn được gì trên **toàn bộ database**, kể cả các bảng nó chưa hề đụng tới.
- Xem tận mắt bằng `pageinspect`: `SELECT * FROM heap_page_items(get_raw_page('t', 0));` — mọi thứ trong bài này đều nhìn thấy được.

**Bài kế tiếp** → [Bài 2: Transaction ID, Snapshot và quy tắc nhìn thấy](02-transaction-id-snapshot-va-quy-tac-nhin-thay.md) — `xmin`/`xmax` chỉ là con số; bài sau giải thích PostgreSQL **quyết định** bạn thấy phiên bản nào.

# Bài 1: Shared Lock, Exclusive Lock và Deadlock

Hai người cùng bấm "Đặt ghế A12" trong cùng một mili-giây. Chỉ một người được ghế. Ai?

Câu trả lời nằm ở **khoá** (*lock*) — cơ chế database dùng để quyết định ai chạy tiếp và ai phải chờ. Bài này mổ xẻ cơ chế đó: các loại khoá, chúng xung khắc với nhau ra sao, deadlock sinh ra thế nào, và vì sao **thứ tự** quan trọng hơn **số lượng**.

## Vì sao cần khoá

[Phase-2 bài 3](../phase-2/03-isolation-va-read-phenomena.md) đã cho thấy bốn hiện tượng đọc bất thường. Khoá là một trong hai cách chống chúng (cách kia là MVCC).

```text
   KHÔNG CÓ KHOÁ                       CÓ KHOÁ
   ═════════════                       ═══════
   A: đọc số ghế còn = 1               A: 🔒 khoá dòng ghế A12
   B: đọc số ghế còn = 1               B: xin khoá → CHỜ
   A: ghi "đã đặt, tên A"              A: ghi "đã đặt, tên A" → COMMIT → 🔓
   B: ghi "đã đặt, tên B"              B: được khoá → đọc lại → "đã đặt rồi"
   → HAI người cùng một ghế               → B nhận lỗi, chỉ MỘT người có ghế
```

## Hai loại khoá cơ bản

| | **Shared (S)** — khoá chia sẻ | **Exclusive (X)** — khoá độc quyền |
|---|---|---|
| Dùng cho | Đọc | Ghi |
| Bao nhiêu người giữ được | **Nhiều** | **Đúng một** |
| Hình dung | Nhiều người cùng đọc chung một tấm bảng thông báo | Một người gỡ bảng xuống mang đi sửa |

Bảng tương thích — thứ quyết định ai phải chờ ai:

```text
                    NGƯỜI ĐẾN SAU MUỐN
                    ┌──────────┬──────────┐
                    │   S      │    X     │
   ┌────────────────┼──────────┼──────────┤
   │ Đang giữ  S    │  ✔ OK    │  ✘ CHỜ   │
   │ Đang giữ  X    │  ✘ CHỜ   │  ✘ CHỜ   │
   └────────────────┴──────────┴──────────┘

   Chỉ có ĐÚNG MỘT ô cho phép đi tiếp: đọc gặp đọc.
```

Đây là toàn bộ lý thuyết cơ bản. Phần còn lại là chi tiết về **khoá cái gì** và **khoá bao lâu**.

---

## Mức độ khoá: dòng, page, hay cả bảng

```text
   KHOÁ DÒNG (row)              KHOÁ PAGE              KHOÁ BẢNG (table)
   ═══════════════              ═════════              ═════════════════
   ┌───┬───┬───┬───┐            ┌───────────┐          ┌───────────────┐
   │███│   │   │   │            │███████████│          │███████████████│
   │   │   │   │   │            │███████████│          │███████████████│
   └───┴───┴───┴───┘            └───────────┘          └───────────────┘
   Chi tiết nhất                Trung bình              Thô nhất
   Song song cao nhất           Vừa                     Song song = 0
   Quản lý TỐN NHẤT             Vừa                     Rẻ nhất
```

Đánh đổi rất trực tiếp: khoá càng chi tiết thì càng nhiều người chạy song song được, nhưng database phải **theo dõi nhiều khoá hơn** — mà mỗi khoá tốn bộ nhớ và CPU để quản lý.

### Leo thang khoá — và vì sao PostgreSQL không có

Một số hệ (điển hình là SQL Server) tự động **leo thang khoá**: khi một transaction giữ quá nhiều khoá dòng (mặc định ~5.000), hệ đổi chúng thành **một khoá bảng** cho rẻ.

```text
   SQL SERVER
   ═══════════
   UPDATE 10.000 dòng
     → 10.000 khoá dòng → tốn quá nhiều bộ nhớ
     → LEO THANG thành 1 khoá bảng
     → MỌI transaction khác đụng bảng đó đều BỊ CHẶN
     → hệ thống "tự nhiên đứng" mà không rõ lý do

   POSTGRESQL
   ══════════
   Không leo thang. Thông tin khoá dòng được lưu NGAY TRONG chính dòng đó
   (trong header của tuple), nên không tốn bộ nhớ riêng.
     → UPDATE 10 triệu dòng vẫn chỉ là khoá dòng
     → nhưng bù lại: mỗi dòng bị khoá là một lần GHI vào page
```

Đây là một khác biệt kiến trúc đáng nhớ: PostgreSQL đổi **bộ nhớ quản lý khoá** lấy **I/O ghi**. Không có bên nào miễn phí.

---

## Khoá mức bảng trong PostgreSQL

PostgreSQL có **tám** kiểu khoá bảng. Không cần thuộc hết, nhưng cần biết cái nào chặn cái nào:

| Kiểu khoá | Lệnh nào lấy | Chặn gì |
|---|---|---|
| `ACCESS SHARE` | `SELECT` | Chỉ chặn `ACCESS EXCLUSIVE` |
| `ROW SHARE` | `SELECT FOR UPDATE/SHARE` | `EXCLUSIVE`, `ACCESS EXCLUSIVE` |
| `ROW EXCLUSIVE` | `INSERT`, `UPDATE`, `DELETE` | `SHARE` trở lên |
| `SHARE UPDATE EXCLUSIVE` | `VACUUM`, `ANALYZE`, `CREATE INDEX CONCURRENTLY` | Chính nó và cao hơn |
| `SHARE` | `CREATE INDEX` (không CONCURRENTLY) | **Mọi lệnh ghi** |
| `SHARE ROW EXCLUSIVE` | `CREATE TRIGGER`, một số `ALTER` | Gần như mọi thứ |
| `EXCLUSIVE` | `REFRESH MATERIALIZED VIEW CONCURRENTLY` | Mọi thứ trừ `SELECT` |
| `ACCESS EXCLUSIVE` | `ALTER TABLE`, `DROP`, `TRUNCATE`, `VACUUM FULL`, `REINDEX` | **MỌI THỨ, kể cả `SELECT`** |

Dòng cuối là dòng gây sự cố nhiều nhất trong thực tế:

```text
   ALTER TABLE orders ADD COLUMN note TEXT;

   Nghe vô hại. Nhưng nó lấy ACCESS EXCLUSIVE:
     → chặn cả SELECT
     → nếu có một transaction dài đang đọc bảng → ALTER phải CHỜ
     → và trong lúc ALTER chờ, MỌI truy vấn đến sau cũng bị chặn
       (hàng đợi khoá theo thứ tự — như đã nói ở [phase-4 bài 5])
     → toàn hệ thống đứng
```

Cách phòng thủ tiêu chuẩn:

```sql
SET lock_timeout = '3s';
ALTER TABLE orders ADD COLUMN note TEXT;
```

Nếu không lấy được khoá trong 3 giây thì thất bại ngay, thay vì ngồi chặn cả hàng đợi.

> **Tin tốt:** từ PostgreSQL 11, `ADD COLUMN ... DEFAULT <hằng>` **không** còn phải viết lại cả bảng — nó chỉ sửa metadata. Nhưng nó **vẫn lấy `ACCESS EXCLUSIVE`** trong khoảnh khắc đó, nên vẫn cần `lock_timeout`.

---

## Khoá mức dòng trong PostgreSQL

Bốn mức, từ mạnh tới nhẹ:

| Cú pháp | Ý nghĩa | Chặn ai |
|---|---|---|
| `FOR UPDATE` | "Tôi sẽ sửa hoặc xoá dòng này" | Mọi khoá dòng khác |
| `FOR NO KEY UPDATE` | "Tôi sẽ sửa, nhưng không đụng cột khoá" | `FOR UPDATE`, `FOR NO KEY UPDATE` |
| `FOR SHARE` | "Tôi đọc và không muốn nó đổi" | `FOR UPDATE`, `FOR NO KEY UPDATE` |
| `FOR KEY SHARE` | "Tôi chỉ cần khoá không đổi" (dùng cho khoá ngoại) | `FOR UPDATE` |

Mức `FOR KEY SHARE` đáng chú ý vì nó xuất hiện **tự động**: mỗi khi bạn `INSERT` một dòng con có khoá ngoại, PostgreSQL lấy `FOR KEY SHARE` trên dòng cha. Đây là lý do khoá ngoại có thể gây tranh chấp bất ngờ trên các bảng cha "nóng".

### Nhìn thấy khoá bằng mắt

**Phiên A:**

```sql
CREATE TABLE seats (id INT PRIMARY KEY, is_booked BOOLEAN DEFAULT false, name TEXT);
INSERT INTO seats SELECT i, false, NULL FROM generate_series(1, 20) AS i;

BEGIN;
SELECT * FROM seats WHERE id = 14 FOR UPDATE;
-- giữ nguyên, chưa commit
```

**Phiên B:**

```sql
BEGIN;
SELECT * FROM seats WHERE id = 14 FOR UPDATE;
-- ...treo. Đang chờ.
```

**Phiên C** — chẩn đoán:

```sql
SELECT pid, state, wait_event_type, wait_event,
       pg_blocking_pids(pid) AS bi_chan_boi, left(query, 45) AS cau_lenh
FROM pg_stat_activity WHERE state <> 'idle' AND datname = 'postgres';
```

```text
 pid | state  | wait_event_type | wait_event | bi_chan_boi |          cau_lenh
-----+--------+-----------------+------------+-------------+------------------------------
 112 | idle in transaction |    |            |     {}      | SELECT * FROM seats WHERE ...
 118 | active | Lock            | transactionid |  {112}   | SELECT * FROM seats WHERE ...
```

Và xem chi tiết khoá:

```sql
SELECT locktype, relation::regclass, mode, granted, pid
FROM pg_locks WHERE relation = 'seats'::regclass OR locktype = 'transactionid'
ORDER BY pid;
```

```text
   locktype    | relation |       mode       | granted | pid
---------------+----------+------------------+---------+-----
 relation      | seats    | RowShareLock     | t       | 112
 transactionid |          | ExclusiveLock    | t       | 112
 relation      | seats    | RowShareLock     | t       | 118
 transactionid |          | ShareLock        | f       | 118    ← đang chờ
```

Dòng cuối `granted = f` là bằng chứng: tiến trình 118 đang xin khoá trên **id giao dịch** của 112 — nghĩa là nó đang chờ 112 kết thúc.

---

## Khoá hai pha (2PL)

**Two-Phase Locking** là giao thức mà database dùng để đảm bảo tính tuần tự hoá. Quy tắc rất gọn:

```text
   PHA 1 — MỞ RỘNG (growing)        PHA 2 — THU HẸP (shrinking)
   ═══════════════════════          ════════════════════════════
   Chỉ được LẤY khoá                Chỉ được TRẢ khoá
   Không được trả                   Không được lấy thêm

   số khoá
   giữ    ▲
          │        ┌─────────┐
          │       ╱           ╲
          │      ╱             ╲
          │     ╱               ╲
          └────╱─────────────────╲──────▶ thời gian
              PHA 1            PHA 2
                     ▲
              ĐIỂM KHOÁ (lock point)
              sau điểm này KHÔNG được lấy thêm khoá nữa
```

Vì sao quy tắc "trả rồi thì không được lấy nữa" lại đảm bảo tính tuần tự hoá: nó khiến mọi transaction có một **thời điểm duy nhất** mà nó giữ tất cả khoá cần thiết. Thứ tự các thời điểm đó chính là thứ tự tuần tự tương đương.

Trong thực tế, database dùng biến thể **2PL nghiêm ngặt** (*strict 2PL*): **giữ mọi khoá ghi cho tới khi `COMMIT` hoặc `ROLLBACK`**.

```text
   Vì sao phải nghiêm ngặt?

   Nếu trả khoá TRƯỚC khi commit:
      A: sửa dòng, trả khoá
      B: đọc dòng (giá trị mới của A)
      A: ROLLBACK
      → B đã đọc phải dữ liệu KHÔNG BAO GIỜ TỒN TẠI = DIRTY READ
      → và nếu B đã ghi dựa trên đó thì phải rollback B luôn = ROLLBACK DÂY CHUYỀN

   Giữ tới commit thì không có chuyện đó.
```

Đây là lý do **transaction dài giữ khoá lâu** — khoá không được trả sớm, dù bạn đã "làm xong" với dòng đó từ lâu.

---

## Deadlock

### Nó sinh ra thế nào

```text
   THỜI GIAN    TRANSACTION A              TRANSACTION B
   ────────────────────────────────────────────────────────────
   t1           🔒 khoá ghế 14
   t2                                      🔒 khoá ghế 15
   t3           xin khoá ghế 15 → CHỜ B
   t4                                      xin khoá ghế 14 → CHỜ A

                        ┌─────┐
                        │  A  │
                        └──┬──┘
                     chờ  │   ▲  giữ
                           ▼   │
                        ┌─────┐
                        │  B  │
                        └─────┘
                   VÒNG TRÒN CHỜ — không ai đi được
```

Hình dung: hai người ở hai đầu một cây cầu một làn, cùng đi vào giữa, không ai chịu lùi.

### Database xử lý thế nào

Database **không** để hai bên đứng mãi. Nó dò tìm vòng tròn trong đồ thị chờ, rồi **giết một transaction** làm vật tế:

```text
ERROR:  deadlock detected
DETAIL:  Process 118 waits for ShareLock on transaction 745; blocked by process 112.
         Process 112 waits for ShareLock on transaction 746; blocked by process 118.
HINT:  See server log for query details.
CONTEXT:  while updating tuple (0,14) in relation "seats"
```

Khác biệt giữa hai hệ:

| | PostgreSQL | MySQL InnoDB |
|---|---|---|
| Cách phát hiện | Chờ `deadlock_timeout` (mặc định **1 giây**) rồi mới dò | **Dò ngay lập tức** khi phát hiện chờ vòng |
| Hệ quả | Deadlock làm treo ~1 giây trước khi báo lỗi | Báo lỗi gần như tức thì |
| Chọn nạn nhân | Transaction phát hiện ra vòng | Transaction đã làm **ít việc nhất** |

PostgreSQL chờ 1 giây trước khi dò vì việc dò vòng tốn CPU, và phần lớn việc chờ khoá là chờ bình thường chứ không phải deadlock. Đánh đổi hợp lý, nhưng nó nghĩa là **mỗi deadlock trên PostgreSQL tốn ít nhất một giây**.

### Cách phòng: thứ tự, không phải số lượng

Đây là điểm quan trọng nhất và hay bị hiểu sai:

```text
   ❌ HIỂU SAI: "giảm số khoá đi thì hết deadlock"
   ✔ ĐÚNG    : "khoá theo CÙNG MỘT THỨ TỰ thì không thể có deadlock"
```

```text
   GÂY DEADLOCK                          KHÔNG THỂ DEADLOCK
   ════════════                          ══════════════════
   A: khoá 14 → khoá 15                  A: khoá 14 → khoá 15
   B: khoá 15 → khoá 14                  B: khoá 14 → khoá 15
       ▲ thứ tự NGƯỢC nhau                   ▲ CÙNG thứ tự
                                             B chỉ chờ A, A không chờ B
```

Áp dụng trong code:

```python
# SAI — thứ tự phụ thuộc đầu vào
def chuyen_tien(tu_id, sang_id, so_tien):
    khoa_va_tru(tu_id)
    khoa_va_cong(sang_id)

# ĐÚNG — luôn khoá theo thứ tự ID tăng dần
def chuyen_tien(tu_id, sang_id, so_tien):
    thu_nhat, thu_hai = sorted([tu_id, sang_id])
    cur.execute("SELECT * FROM accounts WHERE id IN (%s,%s) ORDER BY id FOR UPDATE",
                (thu_nhat, thu_hai))
    # bây giờ mới trừ/cộng
```

Chỉ cần **một dòng `sorted()`** là loại bỏ hoàn toàn một lớp lỗi.

### Deadlock trong một câu lệnh duy nhất

Điều làm nhiều người bối rối: deadlock xảy ra được ngay cả khi mỗi transaction chỉ có **một** câu lệnh.

```sql
-- A:
UPDATE seats SET is_booked = true WHERE id IN (14, 15);
-- B:
UPDATE seats SET is_booked = true WHERE id IN (14, 15);
```

Cùng câu lệnh, cùng thứ tự viết. Nhưng **thứ tự khoá dòng thật sự do engine quyết định**, dựa trên kế hoạch thực thi — và hai lần chạy có thể ra hai thứ tự khác nhau. Cách chữa: thêm `ORDER BY id` vào truy vấn khoá, hoặc dùng `SELECT ... ORDER BY id FOR UPDATE` trước rồi mới `UPDATE`.

### Bốn quy tắc khi thử lại sau deadlock

Deadlock **không thể loại bỏ hoàn toàn**, nên ứng dụng phải xử lý được:

```python
import time, random
from psycopg2 import errors

def chay_co_thu_lai(conn, cong_viec, so_lan_toi_da=3):
    for lan in range(so_lan_toi_da):
        try:
            with conn:                      # QUY TẮC 1: thử lại CẢ transaction
                with conn.cursor() as cur:
                    cong_viec(cur)
            return
        except errors.DeadlockDetected:     # QUY TẮC 2: bắt ĐÚNG loại lỗi
            if lan == so_lan_toi_da - 1:
                raise
            # QUY TẮC 3: backoff luỹ thừa + QUY TẮC 4: nhiễu ngẫu nhiên
            time.sleep((2 ** lan) * 0.05 * (1 + random.random()))
```

| Quy tắc | Vì sao |
|---|---|
| 1. Thử lại **cả transaction** | Transaction đã bị huỷ; chạy lại một câu lệnh là vô nghĩa |
| 2. Bắt **đúng** loại lỗi | Bắt `Exception` chung sẽ nuốt cả lỗi nghiệp vụ thật |
| 3. **Backoff luỹ thừa** | Thử lại ngay lập tức sẽ đâm vào đúng transaction vừa xung đột |
| 4. **Nhiễu ngẫu nhiên** | Không có nó, mọi client thử lại cùng lúc, tạo sóng xung đột mới |

---

## Bi quan hay lạc quan

Hai triết lý xử lý tranh chấp:

```text
   BI QUAN (pessimistic)                LẠC QUAN (optimistic)
   ═════════════════════                ═════════════════════
   "Chắc chắn sẽ có người tranh."       "Chắc chẳng ai tranh đâu."
   → khoá TRƯỚC khi làm                 → cứ làm, KIỂM TRA lúc commit
   → người khác CHỜ                     → nếu có tranh thì HUỶ và thử lại

   SELECT ... FOR UPDATE                UPDATE ... WHERE version = 5
   Chi phí: chờ đợi                     Chi phí: làm lại việc đã làm
   Hợp khi: tranh chấp CAO              Hợp khi: tranh chấp THẤP
```

Khoá lạc quan cài bằng một cột phiên bản:

```sql
-- Đọc
SELECT id, so_luong, version FROM inventory WHERE id = 7;
-- → so_luong=10, version=5

-- Ghi: chỉ thành công nếu KHÔNG AI sửa trong lúc đó
UPDATE inventory
   SET so_luong = 9, version = 6
 WHERE id = 7 AND version = 5;
-- → nếu trả về 0 dòng: có người đã sửa trước → THỬ LẠI
```

Quy tắc chọn:

```text
   Tỉ lệ xung đột < 5%   →  LẠC QUAN  (không ai phải chờ)
   Tỉ lệ xung đột > 20%  →  BI QUAN   (làm lại quá nhiều thì tệ hơn chờ)
```

---

## `NOWAIT` và `SKIP LOCKED`

Hai biến thể rất hữu dụng nhưng ít được biết:

```sql
-- NOWAIT: không chờ, thất bại ngay
SELECT * FROM seats WHERE id = 14 FOR UPDATE NOWAIT;
```

```text
ERROR:  could not obtain lock on row in relation "seats"
```

Dùng khi bạn muốn trả lời người dùng "ghế này đang có người xử lý, thử lại sau" thay vì để họ chờ 30 giây.

```sql
-- SKIP LOCKED: bỏ qua dòng đang bị khoá, lấy dòng khác
SELECT * FROM jobs
 WHERE status = 'pending'
 ORDER BY created_at
 LIMIT 10
 FOR UPDATE SKIP LOCKED;
```

Đây là **nền tảng của mọi hàng đợi công việc xây trên database**. Nhiều worker cùng chạy câu này sẽ nhận **các tập công việc khác nhau**, không ai chờ ai, không ai lấy trùng.

```text
   KHÔNG CÓ SKIP LOCKED               CÓ SKIP LOCKED
   ══════════════════════             ═══════════════
   worker 1: lay job 1-10             worker 1: lay job 1-10
   worker 2: CHỜ worker 1             worker 2: bỏ qua 1-10, lấy 11-20
   worker 3: CHO                      worker 3: lay 21-30
   → chỉ 1 worker làm việc            → mọi worker đều làm việc
```

## Khoá tư vấn (advisory lock)

Khoá không gắn với dòng hay bảng nào — bạn tự đặt nghĩa cho nó:

```sql
-- Khoá theo một con số tự chọn, giữ tới khi COMMIT
SELECT pg_advisory_xact_lock(hashtext('job:gui-bao-cao-thang'));
```

Dùng cho: đảm bảo chỉ một tiến trình chạy một job định kỳ, dù có 10 máy chủ cùng chạy cron.

```python
cur.execute("SELECT pg_try_advisory_xact_lock(%s)", (hash_job,))
if not cur.fetchone()[0]:
    return    # máy khác đang chạy job này rồi
chay_job()
```

`pg_try_advisory_xact_lock` trả về ngay `false` nếu không lấy được, thay vì chờ.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Khoá theo thứ tự khác nhau ở các đường code khác nhau | Deadlock ngẫu nhiên, khó tái hiện | **Luôn sắp xếp** khoá theo một tiêu chí cố định |
| Gọi API bên ngoài trong lúc giữ khoá | API treo 30 giây = khoá bị giữ 30 giây | Gọi API trước hoặc sau transaction |
| `ALTER TABLE` không có `lock_timeout` | Kẹt hàng đợi khoá, cả hệ thống đứng | `SET lock_timeout = '3s'` |
| Không xử lý lỗi deadlock trong ứng dụng | Lỗi ném thẳng vào mặt người dùng | Vòng lặp thử lại có backoff + jitter |
| Dùng khoá bi quan khi xung đột hiếm | Mọi người chờ vô ích | Khoá lạc quan bằng cột `version` |
| Xây hàng đợi công việc không có `SKIP LOCKED` | Chỉ một worker làm việc, số còn lại xếp hàng | `FOR UPDATE SKIP LOCKED` |
| Transaction dài | Giữ khoá suốt thời gian đó (2PL nghiêm ngặt) | Giữ transaction ngắn; đặt `idle_in_transaction_session_timeout` |
| Tưởng giảm số khoá là hết deadlock | Deadlock do **thứ tự**, không do số lượng | Thống nhất thứ tự khoá |

## Tóm tắt bài 1

- **Shared (S)** cho đọc, nhiều người giữ được; **Exclusive (X)** cho ghi, chỉ một người. Chỉ **một ô** trong bảng tương thích cho đi tiếp: đọc gặp đọc.
- Mức khoá càng chi tiết thì song song càng cao nhưng quản lý càng tốn. **SQL Server leo thang khoá dòng thành khoá bảng**; **PostgreSQL không**, vì nó lưu thông tin khoá ngay trong tuple — đổi bộ nhớ lấy I/O ghi.
- `ACCESS EXCLUSIVE` (từ `ALTER TABLE`, `DROP`, `VACUUM FULL`) chặn **cả `SELECT`**, và nếu nó phải chờ thì nó **chặn cả hàng đợi phía sau**. Luôn đặt `lock_timeout`.
- **2PL nghiêm ngặt**: giữ mọi khoá ghi **tới tận `COMMIT`** — đó là lý do transaction dài giữ khoá lâu, và là lý do dirty read không xảy ra.
- **Deadlock do THỨ TỰ, không do SỐ LƯỢNG.** Một dòng `sorted()` trước khi khoá loại bỏ hoàn toàn một lớp lỗi. Deadlock xảy ra được ngay cả với **một câu lệnh duy nhất**, vì engine tự chọn thứ tự khoá dòng.
- PostgreSQL chờ `deadlock_timeout` (**1 giây**) rồi mới dò; MySQL dò **ngay lập tức**.
- Bốn quy tắc thử lại: thử lại **cả transaction** · bắt **đúng** loại lỗi · **backoff luỹ thừa** · **nhiễu ngẫu nhiên**.
- **`FOR UPDATE SKIP LOCKED`** là nền tảng của mọi hàng đợi công việc trên database — nhiều worker nhận các tập việc khác nhau mà không ai chờ ai.

**Bài kế tiếp** → [Bài 2: Giải quyết Double Booking và Pagination](02-double-booking-va-pagination.md)

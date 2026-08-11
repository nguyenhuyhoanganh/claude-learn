# Bài 8: SERIALIZABLE và Serializable Snapshot Isolation

Bệnh viện có quy tắc: **luôn phải có ít nhất một bác sĩ trực**. Bảng `truc` ghi ai đang trực.

Hai bác sĩ, Anh và Bình, cùng đang trực. Cả hai cùng muốn xin nghỉ, cùng bấm nút trong cùng một mili-giây:

```sql
-- Phiên của Anh                        -- Phiên của Bình
BEGIN;                                  BEGIN;
SELECT count(*) FROM truc               SELECT count(*) FROM truc
 WHERE dang_truc = true;                 WHERE dang_truc = true;
-- → 2, "còn Bình trực, mình nghỉ được"  -- → 2, "còn Anh trực, mình nghỉ được"

UPDATE truc SET dang_truc = false        UPDATE truc SET dang_truc = false
 WHERE ten = 'Anh';                       WHERE ten = 'Bình';
COMMIT;                                  COMMIT;

-- Kết quả: KHÔNG CÒN AI TRỰC. Bệnh viện không có bác sĩ.
```

Không có khoá nào ngăn được chuyện này, vì **hai người sửa hai dòng khác nhau**. Không có xung đột ghi-ghi. Không có dòng nào bị đọc rồi bị sửa. `REPEATABLE READ` cũng không cứu được.

Hiện tượng này gọi là **write skew** (lệch ghi), và chỉ có `SERIALIZABLE` chặn được. Điều đáng nói là PostgreSQL chặn nó **mà không khoá bất cứ thứ gì** — bằng một thuật toán tên là **SSI** (*Serializable Snapshot Isolation*), có từ phiên bản 9.1.

Bài này mổ xẻ thuật toán đó.

## "Tuần tự hoá được" nghĩa là gì

```text
   ĐỊNH NGHĨA CHUẨN

   Một lịch trình thực thi đồng thời là TUẦN TỰ HOÁ ĐƯỢC (serializable)
   nếu kết quả của nó GIỐNG với kết quả của MỘT thứ tự chạy lần lượt nào đó.

   Với hai transaction A và B, chỉ có hai thứ tự tuần tự hợp lệ:
       A rồi B     hoặc     B rồi A

   Kiểm tra ví dụ bệnh viện:
     • "Anh rồi Bình": Anh nghỉ → còn 1 người → Bình xem thấy 1 → KHÔNG được nghỉ
     • "Bình rồi Anh": Bình nghỉ → còn 1 người → Anh xem thấy 1 → KHÔNG được nghỉ

   → Không thứ tự tuần tự NÀO cho ra "cả hai cùng nghỉ".
   → Kết quả thực tế KHÔNG tuần tự hoá được.  ✘
```

Có ba cách để một database đảm bảo tính chất này:

```text
   ┌─ CÁCH 1: KHOÁ HAI PHA NGHIÊM NGẶT (2PL) ───────────────────┐
   │ Khoá mọi thứ đã đọc VÀ đã ghi, giữ tới COMMIT               │
   │ ✔ không bao giờ sai                                         │
   │ ✘ ĐỌC CHẶN GHI — mất toàn bộ lợi ích của MVCC               │
   │ → MySQL SERIALIZABLE làm thế này (thêm khoá S vào mọi SELECT)│
   ├─ CÁCH 2: THỰC THI TUẦN TỰ THẬT ────────────────────────────┤
   │ Một luồng, chạy lần lượt                                    │
   │ ✔ đơn giản tuyệt đối    ✘ không mở rộng được                │
   │ → Redis, VoltDB làm thế này                                 │
   ├─ CÁCH 3: SSI — SNAPSHOT + PHÁT HIỆN XUNG ĐỘT ──────────────┤
   │ Cứ chạy trên snapshot như REPEATABLE READ, KHÔNG khoá gì.   │
   │ Theo dõi ai đọc gì; lúc commit kiểm tra có tạo ra           │
   │ "cấu trúc nguy hiểm" không; nếu có thì HUỶ một bên.         │
   │ ✔ đọc không chặn ghi   ✘ có báo động giả, phải thử lại      │
   │ → PostgreSQL làm thế này                                    │
   └─────────────────────────────────────────────────────────────┘
```

---

## Ba loại phụ thuộc giữa transaction

Để hiểu SSI, cần một khái niệm: **đồ thị phụ thuộc**. Hai transaction có quan hệ khi chúng đụng cùng một dữ liệu:

```text
   1. wr — ĐỌC SAU GHI  (T1 ghi, T2 đọc giá trị đó)
      T1 ──wr──▶ T2        nghĩa: T1 phải đứng TRƯỚC T2

   2. ww — GHI SAU GHI  (T1 ghi, T2 ghi đè)
      T1 ──ww──▶ T2        nghĩa: T1 phải đứng TRƯỚC T2

   3. rw — GHI SAU ĐỌC  (T1 đọc, T2 ghi đè cái T1 đã đọc)   ⭐
      T1 ──rw──▶ T2        nghĩa: T1 phải đứng TRƯỚC T2
                           (vì T1 nhìn thấy thế giới TRƯỚC khi T2 ghi)

   Nếu đồ thị có VÒNG → không xếp được thứ tự tuần tự nào → KHÔNG serializable
```

Loại thứ ba, **rw-antidependency**, là loại quan trọng nhất và cũng là loại mà snapshot isolation thông thường **không thấy được** — vì T1 chỉ đọc, nó không để lại dấu vết gì trên dữ liệu.

Vẽ ví dụ bệnh viện:

```text
   Anh  đọc "có 2 người trực"  →  Bình ghi đè (Bình nghỉ)   ⇒ Anh ──rw──▶ Bình
   Bình đọc "có 2 người trực"  →  Anh  ghi đè (Anh nghỉ)    ⇒ Bình ──rw──▶ Anh

              ┌──────┐  rw   ┌──────┐
              │ Anh  │ ────▶ │ Bình │
              └──────┘ ◀──── └──────┘
                         rw

              CÓ VÒNG  →  KHÔNG SERIALIZABLE  ✘
```

---

## Định lý làm nền cho SSI

Kiểm tra vòng trong một đồ thị đầy đủ là rất đắt. May thay, có một kết quả lý thuyết (Fekete và cộng sự, 2005) thu hẹp việc phải làm:

```text
   ĐỊNH LÝ
   Dưới snapshot isolation, MỌI vòng trong đồ thị phụ thuộc đều chứa
   HAI CẠNH rw LIÊN TIẾP:

              ┌────┐  rw   ┌────┐  rw   ┌────┐
              │ Tin│ ────▶ │ T  │ ────▶ │Tout│
              └────┘       └────┘       └────┘
                            ▲▲▲
                          "PIVOT"
                    (transaction bản lề)

   Và thêm điều kiện: Tout phải là transaction COMMIT ĐẦU TIÊN trong ba.

   ⇒ KHÔNG CẦN dò vòng.
     Chỉ cần tìm cấu trúc ba nút này — việc kiểm tra CỤC BỘ, rất rẻ.
```

Đó chính là điều PostgreSQL làm: theo dõi các cạnh `rw` **vào** và **ra** của mỗi transaction; khi thấy một transaction có **cả hai**, nó là pivot và một trong ba bị huỷ.

```text
   Ví dụ bệnh viện với hai transaction (Tin và Tout trùng nhau):

              ┌──────┐  rw   ┌──────┐
              │ Anh  │ ────▶ │ Bình │ ──rw──┐
              └──────┘       └──────┘       │
                  ▲                          │
                  └──────────────────────────┘

   Bình có cạnh rw VÀO (từ Anh) và cạnh rw RA (tới Anh) → Bình là pivot
   → khi Bình commit sau Anh, PostgreSQL huỷ Bình:

   ERROR:  could not serialize access due to read/write dependencies
           among transactions
   DETAIL: Reason code: Canceled on identification as a pivot, during commit
           attempt.
   HINT:   The transaction might succeed if retried.
```

---

## SIREAD lock — dấu vết của việc đọc

Muốn biết "T1 đã đọc cái mà T2 vừa ghi đè", PostgreSQL phải **ghi nhớ T1 đã đọc gì**. Nó làm bằng **predicate lock**, hiện trong `pg_locks` với mode `SIReadLock`.

```text
   ⚠ ĐỪNG ĐỂ CHỮ "LOCK" ĐÁNH LỪA

   SIReadLock KHÔNG CHẶN AI CẢ.
   Nó không phải khoá. Nó là một TẤM VÉ GHI CHÚ:
     "transaction 900 đã đọc vùng dữ liệu này"

   Không có ai phải chờ vì nó. Không có deadlock vì nó.
   Nó chỉ tồn tại để lúc có người GHI vào vùng đó, PostgreSQL
   biết mà vẽ một cạnh rw vào đồ thị.
```

Vòng đời:

```text
   T1: SELECT ... WHERE dang_truc = true
       → đặt SIReadLock lên các tuple/page mà nó QUÉT QUA
         (kể cả tuple không khớp điều kiện, nếu đã phải đọc)

   T2: UPDATE truc SET dang_truc = false WHERE ten = 'Anh'
       → PostgreSQL thấy tuple này CÓ SIReadLock của T1
       → vẽ cạnh  T1 ──rw──▶ T2

   SIReadLock được giữ cho tới khi MỌI transaction có thể chồng lấn
   với T1 đã kết thúc — nên nó sống LÂU HƠN cả T1.
```

Xem tận mắt:

```sql
-- Phiên A
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM truc WHERE dang_truc = true;

-- Phiên B (quan sát)
SELECT pid, locktype, relation::regclass AS bang, page, tuple, mode
FROM pg_locks WHERE mode = 'SIReadLock';
```

```text
  pid  | locktype | bang | page | tuple |    mode
-------+----------+------+------+-------+-------------
 28455 | tuple    | truc |    0 |     1 | SIReadLock
 28455 | tuple    | truc |    0 |     2 | SIReadLock
```

### Hạt khoá và sự leo thang

Ghi nhớ từng tuple sẽ tốn quá nhiều bộ nhớ với truy vấn quét lớn. Nên predicate lock **tự leo thang**:

```text
   TUPLE ──▶ PAGE ──▶ TOÀN BẢNG

   ┌──────────────────────────────────────────────────────────────┐
   │ quá max_pred_locks_per_page tuple trong một page (mặc định 2) │
   │   → gộp thành MỘT khoá cấp PAGE                              │
   ├──────────────────────────────────────────────────────────────┤
   │ quá max_pred_locks_per_relation page trong một bảng           │
   │ (mặc định -2 = max_pred_locks_per_transaction / 2 = 32)       │
   │   → gộp thành MỘT khoá cấp BẢNG                              │
   └──────────────────────────────────────────────────────────────┘

   Đánh đổi:
     hạt MỊN  → tốn bộ nhớ, ít báo động giả
     hạt THÔ  → tiết kiệm bộ nhớ, NHIỀU BÁO ĐỘNG GIẢ            ⚠
```

Đây là nguồn gốc của **báo động giả** (false positive) — SSI huỷ một transaction lẽ ra không có xung đột thật:

```text
   T1 đọc dòng id = 1.  T2 ghi dòng id = 999.
   Hai dòng KHÁC NHAU → không xung đột thật.

   Nhưng nếu predicate lock của T1 đã leo thang lên cấp BẢNG:
     → PostgreSQL thấy "T2 ghi vào bảng mà T1 đã đọc"
     → vẽ cạnh rw
     → có thể huỷ oan T1 hoặc T2                                ⚠
```

Cách giảm báo động giả:

```sql
-- 1. Cho phép giữ hạt mịn lâu hơn (tốn bộ nhớ hơn)
ALTER SYSTEM SET max_pred_locks_per_transaction = 256;   -- mặc định 64
ALTER SYSTEM SET max_pred_locks_per_page = 8;            -- mặc định 2
ALTER SYSTEM SET max_pred_locks_per_relation = -4;       -- mặc định -2
-- (cần restart)

-- 2. QUAN TRỌNG HƠN: dùng index để truy vấn đọc ÍT dòng
--    Seq Scan → predicate lock CẢ BẢNG → gần như chắc chắn xung đột
--    Index Scan → chỉ khoá vài tuple
CREATE INDEX ON truc (dang_truc) WHERE dang_truc;
```

> **Điều quan trọng nhất về hiệu năng của SSI:** nó phụ thuộc rất nhiều vào **kế hoạch truy vấn**. Một truy vấn dùng `Seq Scan` đặt predicate lock lên cả bảng, khiến mọi lệnh ghi vào bảng đó thành xung đột tiềm tàng. **Đánh index tốt là cách chỉnh SSI hiệu quả nhất** — hơn mọi tham số cấu hình.

---

## Vòng lặp thử lại — điều kiện bắt buộc

`SERIALIZABLE` **không** hứa transaction của bạn sẽ thành công. Nó hứa: *nếu thành công thì kết quả đúng như chạy tuần tự*. Đổi lại, bạn **phải** xử lý được việc bị huỷ.

```text
   DÙNG SERIALIZABLE MÀ KHÔNG CÓ VÒNG LẶP THỬ LẠI = LỖI THIẾT KẾ.
   Nó sẽ ném lỗi 40001 vào mặt người dùng vào một ngày tải cao.
```

```python
import time, random, psycopg2
from psycopg2 import errors

def chay_serializable(conn, cong_viec, so_lan_toi_da=5):
    """Chạy một khối công việc ở mức SERIALIZABLE, thử lại khi xung đột."""
    for lan in range(so_lan_toi_da):
        try:
            with conn:                              # tự COMMIT/ROLLBACK
                conn.set_session(isolation_level='SERIALIZABLE')
                with conn.cursor() as cur:
                    return cong_viec(cur)
        except errors.SerializationFailure:         # SQLSTATE 40001
            if lan == so_lan_toi_da - 1:
                raise
            # lùi luỹ thừa + nhiễu ngẫu nhiên: không đâm lại đúng đối thủ cũ
            time.sleep((2 ** lan) * 0.02 * (1 + random.random()))
    raise RuntimeError("Không thành công sau nhiều lần thử")
```

Bốn quy tắc giống hệt phần deadlock ở [phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md), nhưng có một điểm **khác biệt then chốt**:

```text
   VỚI DEADLOCK:
     thử lại thường thành công ngay lần 2

   VỚI SERIALIZATION FAILURE:
     nếu tranh chấp cao, có thể thất bại NHIỀU LẦN LIÊN TIẾP
     → PHẢI có giới hạn số lần thử
     → PHẢI có nhiễu ngẫu nhiên, nếu không mọi client sẽ đồng bộ
       và tạo sóng xung đột mới
     → và phải GIÁM SÁT tỉ lệ thất bại; nếu > vài phần trăm thì
       SSI không phải công cụ đúng cho bài toán đó
```

Phân biệt hai mã lỗi cùng thuộc lớp `40001`:

| Thông báo | Xuất hiện ở mức | Nghĩa |
|---|---|---|
| `could not serialize access due to concurrent update` | `REPEATABLE READ` và `SERIALIZABLE` | Hai transaction cùng sửa **một dòng** |
| `could not serialize access due to read/write dependencies among transactions` | Chỉ `SERIALIZABLE` | **SSI phát hiện cấu trúc nguy hiểm** |

Cả hai đều xử lý bằng cùng một vòng lặp thử lại.

---

## `READ ONLY DEFERRABLE` — báo cáo không bao giờ bị huỷ

Một transaction chỉ đọc ở mức `SERIALIZABLE` **vẫn có thể bị huỷ** (nó có thể là `Tin` trong cấu trúc nguy hiểm). Với báo cáo chạy 20 phút thì đó là thảm hoạ.

PostgreSQL có lối thoát:

```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY DEFERRABLE;
  -- ... các truy vấn báo cáo ...
COMMIT;
```

```text
   DEFERRABLE làm gì:

   Nó CHỜ cho tới khi lấy được một snapshot ĐƯỢC BẢO ĐẢM AN TOÀN —
   tức là không tồn tại transaction đang chạy nào có thể tạo ra
   cấu trúc nguy hiểm với nó.

   ĐỔI LẠI:
     ✔ KHÔNG BAO GIỜ bị huỷ vì serialization failure
     ✔ KHÔNG BAO GIỜ làm transaction khác bị huỷ
     ✔ kết quả nhất quán tuyệt đối, đúng như một thời điểm tuần tự
     ✘ có thể phải CHỜ (không xác định trước bao lâu) ở đầu

   Đây là công cụ đúng cho: báo cáo tài chính, đối soát cuối ngày,
   xuất dữ liệu, sao lưu logic.
```

---

## Đo và giám sát

```sql
-- 1. Số predicate lock đang tồn tại và ở hạt nào
SELECT locktype, count(*) FROM pg_locks
WHERE mode = 'SIReadLock' GROUP BY 1;
```

```text
 locktype | count
----------+-------
 tuple    |  8241
 page     |   412
 relation |     3     ← đã leo thang lên cả bảng: nguồn báo động giả
```

```sql
-- 2. Tỉ lệ transaction bị huỷ do xung đột tuần tự hoá
SELECT datname, xact_commit, xact_rollback,
       round(100.0 * xact_rollback / NULLIF(xact_commit + xact_rollback, 0), 2)
         AS pct_rollback
FROM pg_stat_database WHERE datname = current_database();
```

```sql
-- 3. Bật log để đếm chính xác 40001
ALTER SYSTEM SET log_min_error_statement = 'error';
SELECT pg_reload_conf();
-- rồi đếm trong log:  grep -c "could not serialize access" postgresql.log
```

Ngưỡng đánh giá:

```text
   tỉ lệ 40001 < 0,1%   → SSI đang hoạt động tốt, cứ dùng
   0,1% - 1%            → chấp nhận được nếu có retry; xem lại index
   1% - 5%              → tranh chấp cao: thu hẹp phạm vi transaction,
                          hoặc chuyển sang khoá tường minh
   > 5%                 → SSI KHÔNG phải công cụ đúng cho bài toán này
```

---

## Khi nào dùng SSI, khi nào dùng cách khác

Với chính bài toán bệnh viện, có **ba** cách giải đúng — và SSI không phải lúc nào cũng là cách tốt nhất:

```sql
-- CÁCH 1: SERIALIZABLE  (khai báo, không phải nghĩ về khoá)
BEGIN ISOLATION LEVEL SERIALIZABLE;
  SELECT count(*) FROM truc WHERE dang_truc;
  UPDATE truc SET dang_truc = false WHERE ten = 'Anh';
COMMIT;   -- có thể ném 40001, phải retry

-- CÁCH 2: KHOÁ TƯỜNG MINH  (bi quan, không bao giờ retry)
BEGIN;
  SELECT count(*) FROM truc WHERE dang_truc FOR UPDATE;  -- khoá MỌI dòng đang trực
  UPDATE truc SET dang_truc = false WHERE ten = 'Anh';
COMMIT;   -- người thứ hai CHỜ, rồi thấy count = 1, tự từ chối

-- CÁCH 3: RÀNG BUỘC TRONG DATABASE  (mạnh nhất, không phụ thuộc code)
CREATE TABLE trang_thai_truc (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  so_nguoi_truc INT NOT NULL CHECK (so_nguoi_truc >= 1)   -- ◀ bất biến
);
-- mọi lần nghỉ đều UPDATE bảng này → xung đột ghi-ghi thật → tự tuần tự hoá
```

Bảng chọn:

| Tình huống | Nên dùng |
|---|---|
| Bất biến phức tạp trải nhiều bảng, tranh chấp **thấp** | **`SERIALIZABLE`** |
| Bất biến quy về **một dòng đếm được** | **Ràng buộc `CHECK` + xung đột ghi-ghi** |
| Tranh chấp **cao** trên một tập dòng biết trước | **`FOR UPDATE`** tường minh |
| Báo cáo/xuất dữ liệu cần ảnh chụp nhất quán | **`SERIALIZABLE READ ONLY DEFERRABLE`** |
| Không thể sửa ứng dụng để retry | **Không dùng `SERIALIZABLE`** |
| Chỉ cần chống lost update trên một dòng | `REPEATABLE READ` hoặc cột `version` |

---

## Ba giới hạn phải biết

```text
   1. KHÔNG DÙNG ĐƯỢC TRÊN REPLICA
      ERROR: cannot use serializable mode in a hot standby
      HINT:  You can use REPEATABLE READ instead.
      → SSI cần thấy toàn bộ đồ thị phụ thuộc, mà replica không có.
      → Truy vấn phân tải sang replica KHÔNG có bảo đảm tuần tự hoá.

   2. CHỈ ÁP DỤNG TRONG MỘT DATABASE, MỘT MÁY
      Không có bảo đảm nào xuyên qua postgres_fdw, dblink,
      hay giữa các shard. Distributed serializability là bài toán khác
      ([phase-17 bài 4](../phase-17/03-quic-va-distributed-transaction.md)).

   3. MỌI TRANSACTION LIÊN QUAN PHẢI CÙNG DÙNG SERIALIZABLE
      Nếu A dùng SERIALIZABLE còn B dùng READ COMMITTED,
      B KHÔNG bị theo dõi và có thể phá bất biến một cách hợp lệ.
      → phải đặt ở mức database hoặc role, không đặt rải rác:

         ALTER DATABASE appdb SET default_transaction_isolation = 'serializable';
```

Giới hạn thứ ba là cái bẫy tinh vi nhất trong thực tế: một endpoint quên đặt isolation level là đủ để vô hiệu hoá toàn bộ bảo đảm.

---

## Phòng thí nghiệm: nhìn thấy write skew bị chặn

```sql
-- Chuẩn bị
CREATE TABLE truc (ten TEXT PRIMARY KEY, dang_truc BOOLEAN NOT NULL);
INSERT INTO truc VALUES ('Anh', true), ('Binh', true);
```

**Thí nghiệm 1 — `REPEATABLE READ` KHÔNG chặn được:**

| Phiên A | Phiên B |
|---|---|
| `BEGIN ISOLATION LEVEL REPEATABLE READ;` | |
| `SELECT count(*) FROM truc WHERE dang_truc;` → **2** | |
| | `BEGIN ISOLATION LEVEL REPEATABLE READ;` |
| | `SELECT count(*) FROM truc WHERE dang_truc;` → **2** |
| `UPDATE truc SET dang_truc=false WHERE ten='Anh';` | |
| `COMMIT;` ✔ | |
| | `UPDATE truc SET dang_truc=false WHERE ten='Binh';` |
| | `COMMIT;` ✔ ← **thành công!** |
| `SELECT count(*) FROM truc WHERE dang_truc;` → **0** ⚠ | |

**Thí nghiệm 2 — `SERIALIZABLE` chặn được:**

```sql
UPDATE truc SET dang_truc = true;   -- đặt lại
```

| Phiên A | Phiên B |
|---|---|
| `BEGIN ISOLATION LEVEL SERIALIZABLE;` | |
| `SELECT count(*) FROM truc WHERE dang_truc;` → **2** | |
| | `BEGIN ISOLATION LEVEL SERIALIZABLE;` |
| | `SELECT count(*) FROM truc WHERE dang_truc;` → **2** |
| `UPDATE truc SET dang_truc=false WHERE ten='Anh';` | |
| `COMMIT;` ✔ | |
| | `UPDATE truc SET dang_truc=false WHERE ten='Binh';` |
| | `COMMIT;` → **ERROR 40001** ✘ |

```text
ERROR:  could not serialize access due to read/write dependencies among transactions
DETAIL: Reason code: Canceled on identification as a pivot, during commit attempt.
HINT:   The transaction might succeed if retried.
```

Chú ý ba điều trong thí nghiệm 2:

```text
   1. Phiên B KHÔNG BỊ CHẶN ở bất kỳ bước nào. Nó chạy hết bình thường.
      SSI không khoá — nó chỉ ghi chú rồi kiểm tra lúc commit.

   2. Lỗi xuất hiện ở COMMIT, không phải ở UPDATE.
      → mọi công việc B đã làm đều bị vứt đi. Đây là cái giá của lạc quan.

   3. Nếu B thử lại, lần này nó đọc thấy count = 1 → logic ứng dụng
      tự từ chối cho nghỉ → KẾT QUẢ ĐÚNG.
      Vòng lặp thử lại không phải "vá lỗi" — nó là MỘT PHẦN của thuật toán.
```

---

## SSI so với `SERIALIZABLE` của MySQL

| | PostgreSQL (SSI) | MySQL InnoDB |
|---|---|---|
| Cơ chế | Snapshot + phát hiện xung đột (lạc quan) | Thêm khoá chia sẻ vào **mọi `SELECT`** (2PL, bi quan) |
| Đọc có chặn ghi không | **Không** | **Có** |
| Chặn được write skew | **Có** | Có |
| Thất bại kiểu gì | `ERROR 40001`, phải retry | **Chờ**, hoặc deadlock, hoặc lock wait timeout |
| Ảnh hưởng khi tranh chấp thấp | Gần như bằng 0 | Vẫn tốn chi phí khoá cho mọi lần đọc |
| Ảnh hưởng khi tranh chấp cao | Nhiều lần huỷ và thử lại | Nhiều lần chờ dài và deadlock |
| Báo động giả | **Có** (do leo thang hạt khoá) | Không, nhưng chặn nhiều hơn |

Nói ngắn: PostgreSQL đặt cược rằng **xung đột hiếm** và trả giá bằng việc làm lại khi đoán sai; MySQL đặt cược rằng **xung đột thường xảy ra** và trả giá bằng việc chờ ngay cả khi không cần.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Dùng `SERIALIZABLE` không có vòng lặp thử lại | Lỗi 40001 lọt tới người dùng vào ngày tải cao | Vòng lặp retry với lùi luỹ thừa + nhiễu, giới hạn 3-5 lần |
| Đặt `SERIALIZABLE` rải rác ở vài endpoint | Endpoint dùng `READ COMMITTED` phá bất biến hợp lệ | `ALTER DATABASE ... SET default_transaction_isolation` |
| Truy vấn trong SSI dùng `Seq Scan` | Predicate lock leo lên cấp bảng → báo động giả liên tục | Đánh index cho **mọi** truy vấn trong transaction serializable |
| Chạy báo cáo dài ở `SERIALIZABLE` thường | Báo cáo 20 phút bị huỷ ở phút 19 | `SERIALIZABLE READ ONLY DEFERRABLE` |
| Tưởng `SIReadLock` chặn ai đó | Nó **không chặn gì cả**, chỉ là ghi chú | Tìm nguyên nhân chờ ở `locktype = transactionid` |
| Đưa truy vấn `SERIALIZABLE` sang replica | `ERROR: cannot use serializable mode in a hot standby` | Dùng `REPEATABLE READ` trên replica, và biết mình mất gì |
| Dùng `SERIALIZABLE` để chống lost update một dòng | Quá nặng cho bài toán đó | Cột `version` (lạc quan) hoặc `FOR UPDATE` (bi quan) |
| Không giám sát tỉ lệ 40001 | Ứng dụng âm thầm retry nhiều lần, độ trễ tăng dần | Đếm 40001 trong log; > 1% là dấu hiệu chọn sai công cụ |

---

## Tóm tắt bài 8

- **Write skew là bất thường mà `REPEATABLE READ` không chặn được**: hai transaction đọc cùng một điều kiện rồi sửa **hai dòng khác nhau**, mỗi cái đúng riêng lẻ nhưng cùng nhau phá vỡ bất biến.
- **PostgreSQL cài `SERIALIZABLE` bằng SSI — không khoá gì cả.** Nó chạy trên snapshot như `REPEATABLE READ`, ghi chú lại việc đọc, và kiểm tra xung đột lúc `COMMIT`.
- **Nền tảng lý thuyết**: mọi vòng phụ thuộc dưới snapshot isolation đều chứa **hai cạnh `rw` liên tiếp** với một transaction **pivot** ở giữa. Nhờ vậy không cần dò vòng — chỉ cần kiểm tra cục bộ, rất rẻ.
- **`SIReadLock` không phải khoá.** Nó là tấm vé ghi chú "tôi đã đọc vùng này", **không chặn ai** và không gây deadlock. Đừng nhầm khi chẩn đoán.
- **Predicate lock tự leo thang tuple → page → bảng**, và đó là nguồn gốc của **báo động giả**. Một truy vấn `Seq Scan` khoá vị từ cả bảng, biến mọi lệnh ghi thành xung đột tiềm tàng.
- **Cách chỉnh SSI hiệu quả nhất không phải tham số, mà là index.** Truy vấn đọc ít dòng thì predicate lock mịn, xung đột giả ít.
- **Vòng lặp thử lại là bắt buộc, không phải tuỳ chọn.** Dùng `SERIALIZABLE` mà không retry là lỗi thiết kế. Phải có lùi luỹ thừa **và nhiễu ngẫu nhiên**, nếu không mọi client sẽ đồng bộ và tạo sóng xung đột mới.
- **`SERIALIZABLE READ ONLY DEFERRABLE` không bao giờ bị huỷ và không làm ai bị huỷ** — đổi lại nó có thể chờ ở đầu. Đây là công cụ đúng cho báo cáo tài chính và đối soát.
- **Ba giới hạn**: không dùng được trên **replica**, không có tác dụng **xuyên máy/xuyên shard**, và **mọi transaction liên quan phải cùng ở mức `SERIALIZABLE`** — một endpoint quên là đủ vô hiệu hoá toàn bộ.
- **Tỉ lệ lỗi 40001 là chỉ số quyết định**: dưới 0,1% thì SSI rất hợp; trên 5% thì bài toán của bạn cần khoá tường minh hoặc thiết kế lại bất biến thành ràng buộc trong database.
- **Đối chiếu với MySQL**: PostgreSQL đặt cược xung đột **hiếm** và trả giá bằng làm lại; MySQL đặt cược xung đột **thường** và trả giá bằng chờ ngay cả khi không cần.

**Bài kế tiếp** → [Bài 9: Phòng thí nghiệm và bảng tra cứu tổng hợp](09-phong-thi-nghiem-va-tong-ket.md) — bảy thí nghiệm tái hiện mọi cơ chế trong phase này bằng tay, cùng bộ truy vấn giám sát hoàn chỉnh.

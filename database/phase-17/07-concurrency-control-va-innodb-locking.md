# Bài 8: Optimistic vs Pessimistic và InnoDB Locking nâng cao

Bài cuối của phase 17 gồm hai phần: khung tư duy để chọn giữa hai triết lý xử lý tranh chấp, và các kiểu khoá của InnoDB — chủ đề gây bối rối nhiều nhất khi chuyển từ PostgreSQL sang MySQL.

---

# Phần I — Bi quan hay lạc quan

## Hai triết lý

```text
   BI QUAN (pessimistic)                LAC QUAN (optimistic)
   ═════════════════════                ═════════════════════
   "Chac chan se co nguoi tranh."       "Chac chang ai tranh dau."
   → KHOA TRUOC khi lam                 → cu lam, KIEM TRA luc commit
   → nguoi khac CHO                     → neu co tranh thi HUY va THU LAI

   Chi phi: THOI GIAN CHO                Chi phi: LAM LAI VIEC DA LAM
```

## Cách cài đặt

### Bi quan

```sql
BEGIN;
SELECT * FROM seats WHERE id = 14 FOR UPDATE;   -- 🔒 khoa ngay
-- ... kiem tra nghiep vu ...
UPDATE seats SET is_booked = true WHERE id = 14;
COMMIT;                                          -- 🔓 mo khoa
```

Biến thể hữu ích:

```sql
SELECT ... FOR UPDATE NOWAIT;        -- that bai NGAY neu dang bi khoa
SELECT ... FOR UPDATE SKIP LOCKED;   -- BO QUA dong dang bi khoa, lay dong khac
SELECT ... FOR SHARE;                -- khoa doc: nguoi khac doc duoc, khong ghi duoc
```

### Lạc quan

```sql
ALTER TABLE seats ADD COLUMN version INT NOT NULL DEFAULT 0;
```

```python
# Doc — KHONG khoa gi
cur.execute("SELECT is_booked, version FROM seats WHERE id = %s", (seat_id,))
da_dat, phien_ban = cur.fetchone()
if da_dat:
    raise GheDaCoNguoi()

# ... logic nghiep vu co the DAI, khong giu khoa nao ...

# Ghi — chi thanh cong neu KHONG AI sua trong luc do
cur.execute("""UPDATE seats SET is_booked=true, version=version+1
               WHERE id=%s AND version=%s""", (seat_id, phien_ban))
if cur.rowcount == 0:
    raise XungDotPhienBan()      # → thu lai tu dau
```

Biến thể không cần cột thêm — dùng chính giá trị cũ:

```sql
UPDATE inventory SET so_luong = so_luong - 1
 WHERE id = 7 AND so_luong = 10;      -- gia tri toi vua doc
-- rowcount = 0 → co nguoi da sua → thu lai
```

Cách này gọn hơn nhưng chỉ đúng khi giá trị không quay về đúng số cũ (bài toán ABA).

## Chọn cái nào

```text
   TI LE XUNG DOT = so lan xung dot / tong so thao tac

   < 5%   →  LAC QUAN
             (khong ai phai cho, va hiem khi phai lam lai)

   > 20%  →  BI QUAN
             (lam lai qua nhieu con te hon la cho)

   5-20%  →  DO CA HAI, chon theo so lieu
```

Đo tỉ lệ xung đột thực tế:

```sql
-- PostgreSQL: dem so lan huy do xung dot serializable
SELECT datname, conflicts, deadlocks FROM pg_stat_database;
```

```python
# Hoac dem trong ung dung
so_thanh_cong = 0
so_xung_dot   = 0
# ... tang trong ham thu lai ...
print(f"Ti le xung dot: {so_xung_dot/(so_thanh_cong+so_xung_dot)*100:.1f}%")
```

## Bảng so sánh đầy đủ

| | Bi quan | Lạc quan |
|---|---|---|
| Khi tranh chấp thấp | Chờ vô ích | **Tối ưu** |
| Khi tranh chấp cao | **Tốt hơn** | Làm lại quá nhiều |
| Deadlock | **Có thể** | Không |
| Logic nghiệp vụ dài | Giữ khoá lâu → tệ | **Tốt** — không giữ khoá |
| Nhiều dịch vụ cùng ghi | Hoạt động | Cần **mọi** nơi tuân thủ |
| Độ phức tạp ứng dụng | Thấp | Cần vòng lặp thử lại |
| Xuyên database/dịch vụ | Khó | **Dễ hơn** |
| Hoạt động khi mất kết nối giữa chừng | Khoá được giải phóng khi transaction chết | Không có gì để dọn |

Dòng "logic nghiệp vụ dài" đáng chú ý: nếu giữa đọc và ghi có một lời gọi API bên ngoài mất 2 giây, khoá bi quan giữ dòng đó 2 giây — và với dòng nóng, đó là thảm hoạ. Lạc quan không giữ gì cả.

## Vòng lặp thử lại — bắt buộc với lạc quan

```python
import time, random

def chay_co_thu_lai(ham, so_lan_toi_da=3):
    for lan in range(so_lan_toi_da):
        try:
            return ham()
        except XungDotPhienBan:
            if lan == so_lan_toi_da - 1:
                raise
            # backoff luy thua + nhieu ngau nhien
            time.sleep((2 ** lan) * 0.05 * (1 + random.random()))
```

Bốn quy tắc (giống với thử lại sau deadlock ở [phase-8 bài 1](../phase-8/01-shared-lock-va-exclusive-lock.md)):

| Quy tắc | Vì sao |
|---|---|
| Thử lại **cả transaction** | Trạng thái đã đọc không còn hợp lệ |
| Bắt **đúng** loại lỗi | Bắt `Exception` chung nuốt luôn lỗi nghiệp vụ thật |
| **Backoff luỹ thừa** | Thử lại ngay đâm vào đúng transaction vừa xung đột |
| **Nhiễu ngẫu nhiên** | Không có nó, mọi client thử lại cùng lúc → sóng xung đột mới |

---

# Phần II — Các kiểu khoá của InnoDB

Đây là phần gây bối rối nhất khi chuyển từ PostgreSQL sang MySQL, vì InnoDB có những kiểu khoá mà PostgreSQL không có.

## Ba kiểu khoá dòng

```text
   BANG `orders` co index tren `id`, cac gia tri: 10, 20, 30, 40

   ┌────┬────────┬────┬────────┬────┬────────┬────┬────────┬────┐
   │ 10 │ khe    │ 20 │ khe    │ 30 │ khe    │ 40 │ khe    │ ∞  │
   └────┴────────┴────┴────────┴────┴────────┴────┴────────┴────┘
     ▲      ▲
     │      └ KHOANG TRONG giua cac gia tri
     └ ban ghi

   1. RECORD LOCK   →  khoa DUNG mot ban ghi (vi du: 20)
   2. GAP LOCK      →  khoa KHOANG TRONG (vi du: giua 20 va 30)
                       → chan CHEN gia tri moi vao khoang do
   3. NEXT-KEY LOCK →  RECORD + GAP LIEN TRUOC no
                       = (10, 20]  — khoa ban ghi 20 VA khoang truoc no
```

**Next-key lock là mặc định** ở mức `REPEATABLE READ` — và đó là lý do MySQL chặn được phantom read.

## Vì sao gap lock tồn tại

```text
   VAN DE PHANTOM:
     Transaction A: SELECT count(*) FROM orders WHERE id BETWEEN 15 AND 25;  → 1
     Transaction B: INSERT INTO orders (id) VALUES (22);
     Transaction A: SELECT count(*) FROM orders WHERE id BETWEEN 15 AND 25;  → 2

   PostgreSQL chan bang SNAPSHOT (loc bo dong sinh sau).
   MySQL chan bang GAP LOCK (chan luon viec CHEN).
```

```sql
-- Transaction A
BEGIN;
SELECT * FROM orders WHERE id BETWEEN 15 AND 25 FOR UPDATE;
-- → khoa cac khe: (10,20], (20,30]

-- Transaction B
INSERT INTO orders (id) VALUES (22);   -- ← BI CHAN
```

## Cái bẫy: gap lock chặn nhiều hơn bạn nghĩ

```sql
-- Bang chi co id = 10, 20, 30, 40
BEGIN;
SELECT * FROM orders WHERE id = 25 FOR UPDATE;   -- KHONG CO dong nao khop!
```

```text
   Ban tuong khong khoa gi ca vi khong co dong nao id = 25.
   THUC TE: InnoDB khoa KHOANG TRONG (20, 30).

   → MOI lenh INSERT voi id trong khoang (20, 30) DEU BI CHAN
   → 21, 22, ..., 29 deu khong chen duoc
```

Đây là nguồn của rất nhiều deadlock khó hiểu trên MySQL mà người quen PostgreSQL không lường trước.

### Deadlock do gap lock

```text
   Transaction A: SELECT * FROM t WHERE id = 25 FOR UPDATE;  → khoa khe (20,30)
   Transaction B: SELECT * FROM t WHERE id = 27 FOR UPDATE;  → khoa khe (20,30)
                  → GAP LOCK KHONG XUNG KHAC voi nhau, ca hai deu duoc

   Transaction A: INSERT INTO t VALUES (25);   → cho GAP LOCK cua B
   Transaction B: INSERT INTO t VALUES (27);   → cho GAP LOCK cua A
   → DEADLOCK
```

Điểm tinh vi: **gap lock không xung khắc với gap lock khác** (chúng chỉ chặn `INSERT`), nên cả hai transaction đều lấy được — rồi cùng kẹt khi chèn.

## Tắt gap lock

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
```

```text
   O muc READ COMMITTED, InnoDB KHONG dung gap lock
   (tru truong hop kiem tra khoa ngoai va khoa trung lap)

   ✔ It deadlock hon nhieu
   ✔ Song song cao hon
   ✘ CO PHANTOM READ
```

Đây là lý do rất nhiều hệ thống lớn chạy MySQL ở `READ COMMITTED` thay vì mặc định `REPEATABLE READ` — và đó thường là quyết định đúng.

## Insert Intention Lock

```text
   Mot dang gap lock dac biet, dat khi INSERT.

   Hai INSERT vao CUNG mot khe nhung KHAC gia tri
   → KHONG chan nhau

   INSERT 22 va INSERT 25, ca hai vao khe (20,30) → ca hai chay duoc  ✔
```

Không có cơ chế này, mọi `INSERT` vào cùng một khoảng sẽ xếp hàng — và thông lượng chèn sẽ sụp.

## Auto-Increment Lock

```sql
SHOW VARIABLES LIKE 'innodb_autoinc_lock_mode';
```

| Chế độ | Tên | Hành vi |
|---|---|---|
| `0` | Truyền thống | Khoá bảng suốt câu lệnh `INSERT` |
| `1` | Liên tiếp (mặc định trước 8.0) | Khoá nhẹ; `INSERT ... SELECT` vẫn khoá |
| **`2`** | **Xen kẽ** (mặc định từ 8.0) | Không khoá; **nhưng ID có thể không liên tiếp** |

```text
   Che do 2 nhanh nhat, nhung:
     ✘ ID sinh ra co the KHONG LIEN TIEP giua cac transaction
     ✘ Voi nhan ban dang STATEMENT → co the KHONG NHAT QUAN
       (voi ROW-based thi khong sao — va do la mac dinh tu MySQL 5.7)
```

Nhắc lại từ [phase-3 bài 3](../phase-3/03-primary-key-vs-secondary-key.md): **khoảng trống trong ID là bình thường và không nên coi là lỗi**.

## Bảng đối chiếu khoá: PostgreSQL vs InnoDB

| | PostgreSQL | InnoDB |
|---|---|---|
| Khoá dòng | ✔ | ✔ |
| **Gap lock** | **Không có** | **Có** (ở `REPEATABLE READ`) |
| Next-key lock | Không có | **Có** |
| Chặn phantom ở `REPEATABLE READ` | Bằng **snapshot** | Bằng **gap lock** |
| Nơi lưu thông tin khoá | **Trong chính tuple** | Bảng khoá trong bộ nhớ |
| Leo thang khoá | **Không** | Không (nhưng bảng khoá có thể đầy) |
| Phát hiện deadlock | Sau `deadlock_timeout` (**1 giây**) | **Ngay lập tức** |
| Chọn nạn nhân deadlock | Transaction phát hiện ra vòng | Transaction **làm ít việc nhất** |
| `SKIP LOCKED` | ✔ | ✔ (từ 8.0) |
| `NOWAIT` | ✔ | ✔ (từ 8.0) |

Dòng "nơi lưu thông tin khoá" giải thích vì sao PostgreSQL **không cần leo thang khoá**: thông tin khoá nằm ngay trong header của tuple nên không tốn bộ nhớ riêng. InnoDB dùng bảng khoá trong bộ nhớ, và bảng đó có thể đầy.

## Chẩn đoán khoá trên InnoDB

```sql
-- Ai dang cho ai (MySQL 8.0+)
SELECT r.trx_id AS cho_id, r.trx_mysql_thread_id AS cho_thread,
       LEFT(r.trx_query, 50) AS cho_query,
       b.trx_id AS chan_id, b.trx_mysql_thread_id AS chan_thread,
       LEFT(b.trx_query, 50) AS chan_query
FROM performance_schema.data_lock_waits w
JOIN information_schema.innodb_trx r ON r.trx_id = w.requesting_engine_transaction_id
JOIN information_schema.innodb_trx b ON b.trx_id = w.blocking_engine_transaction_id;
```

```sql
-- Chi tiet tung khoa dang giu
SELECT ENGINE_TRANSACTION_ID, OBJECT_NAME, INDEX_NAME,
       LOCK_TYPE, LOCK_MODE, LOCK_STATUS, LOCK_DATA
FROM performance_schema.data_locks;
```

```text
 ENGINE_TRANSACTION_ID | OBJECT_NAME | INDEX_NAME | LOCK_TYPE | LOCK_MODE      | LOCK_DATA
-----------------------+-------------+------------+-----------+----------------+-----------
                  4218 | orders      | PRIMARY    | RECORD    | X,GAP          | 30
                  4218 | orders      | PRIMARY    | RECORD    | X,REC_NOT_GAP  | 20
```

Đọc cột `LOCK_MODE`:

```text
   X               →  khoa doc quyen, NEXT-KEY (ban ghi + khe truoc)
   X,GAP           →  chi khoa KHE, khong khoa ban ghi
   X,REC_NOT_GAP   →  chi khoa BAN GHI, khong khoa khe
   S,...           →  tuong tu nhung la khoa chia se
```

```sql
-- Deadlock gan nhat
SHOW ENGINE INNODB STATUS\G
-- → tim phan "LATEST DETECTED DEADLOCK"
```

## Chọn chiến lược theo bài toán

| Bài toán | Chiến lược |
|---|---|
| Đặt chỗ, bán vé (tranh chấp cao trên ít dòng) | **Bi quan** (`FOR UPDATE`) |
| Sửa hồ sơ người dùng (tranh chấp rất thấp) | **Lạc quan** (`version`) |
| Trừ kho | **Cập nhật có điều kiện** một câu lệnh |
| Hàng đợi công việc | **`FOR UPDATE SKIP LOCKED`** |
| Logic nghiệp vụ dài, có gọi API ngoài | **Lạc quan** (không giữ khoá) |
| Nhiều dịch vụ cùng ghi | **Bi quan** hoặc ràng buộc database |
| Bất biến giữa nhiều dòng (write skew) | **`SERIALIZABLE`** hoặc khoá dòng cha |

## Bẫy thường gặp

| Bẫy | Hệ | Hậu quả | Cách tránh |
|---|---|---|---|
| Dùng lạc quan mà không có vòng lặp thử lại | Cả hai | Lỗi ném vào mặt người dùng | Retry + backoff + jitter |
| Thử lại ngay lập tức không có backoff | Cả hai | Đâm vào đúng transaction vừa xung đột | Backoff luỹ thừa |
| Không lường gap lock | **MySQL** | Deadlock khó hiểu; `INSERT` bị chặn dù không trùng | `READ COMMITTED`, hoặc hiểu rõ gap lock |
| `SELECT ... FOR UPDATE` trên điều kiện không khớp dòng nào | **MySQL** | Vẫn khoá cả khoảng trống | Kiểm tra `data_locks` |
| Giữ khoá trong lúc gọi API ngoài | Cả hai | Khoá bị giữ hàng giây | Gọi API ngoài transaction; hoặc dùng lạc quan |
| Dùng bi quan khi tranh chấp rất thấp | Cả hai | Mọi người chờ vô ích | Đo tỉ lệ xung đột trước |
| Dùng lạc quan khi tranh chấp cao | Cả hai | Làm lại liên tục, tệ hơn chờ | Đo, và chuyển sang bi quan nếu > 20% |
| Coi khoảng trống ID là lỗi | Cả hai | Đi tìm bug không tồn tại | Khoảng trống là bình thường |

## Tóm tắt bài 8

- **Bi quan trả bằng thời gian chờ; lạc quan trả bằng việc làm lại.** Ngưỡng thực dụng: tranh chấp **dưới 5% → lạc quan**, **trên 20% → bi quan**.
- Lạc quan đặc biệt tốt khi **logic nghiệp vụ dài** (có gọi API ngoài) — vì nó không giữ khoá nào trong suốt thời gian đó.
- Vòng lặp thử lại có **bốn quy tắc**: thử lại cả transaction · bắt đúng loại lỗi · backoff luỹ thừa · nhiễu ngẫu nhiên.
- InnoDB có **ba kiểu khoá dòng** mà PostgreSQL không có tương đương: **record lock**, **gap lock**, **next-key lock** (mặc định ở `REPEATABLE READ`).
- **PostgreSQL chặn phantom bằng snapshot; MySQL chặn bằng gap lock** — cùng kết quả, hai cơ chế hoàn toàn khác nhau.
- Cái bẫy lớn nhất: **`SELECT ... FOR UPDATE` trên điều kiện không khớp dòng nào vẫn khoá cả khoảng trống**, chặn mọi `INSERT` vào khoảng đó. Đây là nguồn của nhiều deadlock khó hiểu.
- **Gap lock không xung khắc với gap lock khác** — cả hai transaction đều lấy được rồi cùng kẹt khi chèn, tạo ra deadlock.
- Chuyển sang **`READ COMMITTED` tắt gap lock**, giảm deadlock rõ rệt và tăng song song — đổi lại có phantom read. Rất nhiều hệ thống lớn chọn cách này.
- **PostgreSQL phát hiện deadlock sau 1 giây; MySQL phát hiện ngay lập tức** và chọn nạn nhân là transaction **làm ít việc nhất**.

**Bài kế tiếp** → [Phase 18: ACID - Ôn tập và chi tiết triển khai](../phase-18/01-acid-review-va-implementation-details.md)

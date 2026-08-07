# Bài 7: NULL và Write Amplification

Hai chủ đề không liên quan gì nhau về mặt khái niệm, nhưng chúng chung một tính chất: **cả hai đều là chi phí ẩn mà bạn không nhìn thấy cho tới khi đo**.

---

# Phần I — NULL

## `NULL` không phải một giá trị

Đây là điểm khởi đầu, và hiểu sai nó là gốc của mọi bẫy sau:

```text
   NULL nghia la "KHONG BIET", khong phai "rong" hay "khong co gi".

   → Moi phep so sanh voi NULL cho ra NULL, KHONG phai TRUE hay FALSE.
```

```sql
SELECT NULL = NULL       AS a,
       NULL <> NULL      AS b,
       NULL > 5          AS c,
       NULL + 1          AS d,
       'abc' || NULL     AS e;
```

```text
 a | b | c | d | e
---+---+---+---+---
   |   |   |   |          ← TAT CA deu la NULL, khong phai true/false
```

SQL dùng **logic ba giá trị**: `TRUE`, `FALSE`, `NULL`.

```text
   AND    │ TRUE  │ FALSE │ NULL          OR     │ TRUE │ FALSE │ NULL
   ───────┼───────┼───────┼──────         ───────┼──────┼───────┼──────
   TRUE   │ TRUE  │ FALSE │ NULL          TRUE   │ TRUE │ TRUE  │ TRUE
   FALSE  │ FALSE │ FALSE │ FALSE         FALSE  │ TRUE │ FALSE │ NULL
   NULL   │ NULL  │ FALSE │ NULL          NULL   │ TRUE │ NULL  │ NULL
```

Hai ô đáng nhớ: `FALSE AND NULL = FALSE` (đã sai rồi thì không cần biết vế kia), và `TRUE OR NULL = TRUE` (đã đúng rồi thì không cần biết vế kia).

## Bốn cái bẫy

### Bẫy 1 — `WHERE` âm thầm bỏ sót dòng

```sql
SELECT * FROM users WHERE status <> 'active';
```

```text
   `WHERE` chi giu dong co dieu kien TRUE.
   NULL <> 'active'  →  NULL  →  KHONG duoc giu

   → Dong co status = NULL BI BO QUA AM THAM
```

```sql
-- Cach dung
WHERE status IS DISTINCT FROM 'active';
-- hoac
WHERE status <> 'active' OR status IS NULL;
```

`IS DISTINCT FROM` xử lý `NULL` như một giá trị bình thường — đó là công cụ đúng cho tình huống này, và rất ít người dùng.

### Bẫy 2 — `NOT IN` với subquery chứa `NULL`

Đây là bẫy gây bug âm thầm nhiều nhất:

```sql
SELECT * FROM orders WHERE user_id NOT IN (SELECT id FROM banned_users);
```

```text
   Neu `banned_users.id` co DU MOT gia tri NULL:
     user_id NOT IN (1, 2, NULL)
     ≡ user_id <> 1 AND user_id <> 2 AND user_id <> NULL
     ≡ TRUE AND TRUE AND NULL
     ≡ NULL
   → KHONG dong nao duoc giu
   → KET QUA LUON RONG, khong bao gio bao loi
```

```sql
-- AN TOAN
SELECT * FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM banned_users b WHERE b.id = o.user_id);
```

`NOT EXISTS` không bị ảnh hưởng bởi `NULL`, và thường còn nhanh hơn.

### Bẫy 3 — `UNIQUE` cho phép nhiều `NULL`

```sql
CREATE TABLE users (email TEXT UNIQUE);
INSERT INTO users VALUES (NULL), (NULL), (NULL);   -- CHAP NHAN CA BA
```

```text
   Vi NULL <> NULL, nen cac NULL KHONG duoc coi la trung nhau.
   → dung theo chuan SQL, nhung thuong khong phai y dinh cua ban
```

PostgreSQL 15 thêm cách kiểm soát:

```sql
CREATE TABLE users (
    email TEXT,
    UNIQUE NULLS NOT DISTINCT (email)      -- chi cho MOT NULL
);
```

### Bẫy 4 — Hàm tổng hợp bỏ qua `NULL`

```sql
SELECT count(*), count(email), avg(age) FROM users;
```

```text
 count | count | avg
-------+-------+------
  1000 |   842 | 34.2
    ▲      ▲      ▲
    │      │      └ trung binh cua 842 dong CO tuoi, khong phai 1.000
    │      └ dem dong co email KHAC NULL
    └ dem MOI dong
```

Đây thường là hành vi bạn muốn, nhưng phải biết nó xảy ra — nếu không, `AVG` sẽ cho con số khác với `SUM / COUNT(*)`.

## Vì sao `NULL` lại tốt cho hiệu năng

Trái với trực giác, `NULL` **tiết kiệm** chỗ:

```text
   POSTGRESQL luu mot BITMAP NULL o dau moi tuple: 1 bit moi cot.
   → cot NULL KHONG chiem byte du lieu nao

   Bang 20 cot, trung binh 15 cot NULL:
     Dung NULL      : 23 byte header + 3 byte bitmap + 5 cot du lieu
     Dung chuoi rong: 23 byte header + 20 cot du lieu
   → NULL GON HON dang ke
```

Và quan trọng hơn — **index bỏ qua `NULL` được**:

```sql
-- Bang 100 trieu dong, chi 50.000 dong co `deleted_at` khac NULL
CREATE INDEX idx_deleted ON orders (deleted_at) WHERE deleted_at IS NOT NULL;
```

```text
   Index day du  : 2,1 GB
   Index bo phan : 1,8 MB      → NHO HON ~1.200 LAN
```

Ba cột rất hợp với kỹ thuật này: `deleted_at`, `error_message`, `cancelled_at` — những cột "hiếm khi có giá trị".

## Nên dùng `NULL` hay giá trị mặc định?

| Tình huống | Nên |
|---|---|
| Giá trị thật sự **không biết** | **`NULL`** |
| Giá trị **chưa có** (chưa xảy ra) | **`NULL`** |
| Giá trị **bằng không** có nghĩa | `0` |
| Chuỗi rỗng có nghĩa (người dùng cố ý để trống) | `''` |
| Cột dùng trong tính toán thường xuyên | Mặc định, tránh `NULL` lan truyền |
| Cột hiếm khi có giá trị | **`NULL`** + index bộ phận |

Quy tắc gọn:

```text
   NULL khi thieu du lieu la CO NGHIA.
   Mac dinh khi thieu du lieu chi la PHIEN PHUC.
```

---

# Phần II — Write Amplification

## Định nghĩa

```text
   khuech_dai_ghi = so_byte_GHI_THAT_XUONG_DIA / so_byte_DU_LIEU_LOGIC

   Ban UPDATE mot cot 4 byte.
   Dia phai ghi bao nhieu?  → thuong la HANG NGHIN byte.
```

## Sáu tầng khuếch đại

```text
   ┌─ TANG 1: UNG DUNG ─────────────────────────────────────────┐
   │  UPDATE users SET last_login = now() WHERE id = 42;        │
   │  Du lieu logic: 8 byte                                     │
   ├─ TANG 2: MVCC ─────────────────────────────────────────────┤
   │  PostgreSQL tao PHIEN BAN MOI cua CA DONG                  │
   │  → ~200 byte (ca dong, khong chi cot doi)                  │
   ├─ TANG 3: INDEX ────────────────────────────────────────────┤
   │  ctid doi → cap nhat 5 index × ~40 byte                    │
   │  → ~200 byte                                               │
   ├─ TANG 4: WAL ──────────────────────────────────────────────┤
   │  Ghi ban ghi WAL cho dong + cho moi index                  │
   │  → ~400 byte                                               │
   │  VA neu la lan dau page bi sua sau checkpoint:              │
   │  → GHI CA PAGE 8 KB × (1 heap + 5 index) = 48 KB   ⚠       │
   ├─ TANG 5: HE DIEU HANH ─────────────────────────────────────┤
   │  Ghi theo don vi 4 KB                                      │
   ├─ TANG 6: SSD ──────────────────────────────────────────────┤
   │  Ghi theo don vi 16 KB, va COLLECT GARBAGE ben trong       │
   │  → khuech dai them 1,5-4 lan                               │
   └────────────────────────────────────────────────────────────┘

   TONG: 8 byte logic  →  co the thanh 50-200 KB ghi that
                          KHUECH DAI 6.000 - 25.000 LAN
```

Con số này nghe khó tin, nhưng đo được.

## Đo trên máy thật

```sql
-- Do WAL sinh ra boi mot thao tac
SELECT pg_current_wal_lsn() AS truoc \gset
UPDATE users SET last_login = now() WHERE id < 100000;
SELECT pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), :'truoc')) AS wal;
```

```text
 wal
-------
 47 MB
```

```text
   100.000 dong × 8 byte du lieu logic = 800 KB
   WAL sinh ra                          =  47 MB
   → KHUECH DAI ~60 LAN (chi rieng tang WAL)
```

Thống kê tổng thể:

```sql
SELECT wal_records, wal_fpi,
       pg_size_pretty(wal_bytes) AS tong_wal,
       round(100.0*wal_fpi/NULLIF(wal_records,0), 1) AS pct_ghi_ca_page
FROM pg_stat_wal;
```

```text
 wal_records | wal_fpi | tong_wal | pct_ghi_ca_page
-------------+---------+----------+-----------------
    88412993 | 1284993 | 399 GB   |             1.5
```

`pct_ghi_ca_page` cao (> 5%) nghĩa là checkpoint quá dày — mỗi checkpoint làm mọi page bị sửa lần đầu phải ghi cả 8 KB vào WAL.

## Vì sao nó quan trọng

```text
   1. TUOI THO SSD
      SSD chi chiu duoc so lan ghi HUU HAN moi o.
      Khuech dai 50 lan → SSD mon nhanh hon 50 lan.
      → 5 nam thanh 1 nam

   2. BANG THONG DIA
      SSD 500 MB/s ghi, khuech dai 50 lan
      → chi ghi duoc 10 MB/s DU LIEU LOGIC

   3. BANG THONG NHAN BAN
      WAL duoc gui NGUYEN VEN cho replica.
      Khuech dai cao → luu luong nhan ban cao
      → dat khi xuyen trung tam du lieu

   4. DUNG LUONG SAO LUU
      Sao luu tang dan dua tren WAL → cang lon
```

## Tám cách giảm

### 1. Bỏ index không cần thiết

```sql
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes WHERE idx_scan = 0 AND relname = 'users';
```

Mỗi index bỏ đi là một tầng khuếch đại bỏ đi.

### 2. Tăng tỉ lệ HOT update

```sql
ALTER TABLE users SET (fillfactor = 80);
```

```text
   HOT update: neu phien ban moi nam CUNG PAGE va KHONG cot duoc danh index
   bi doi → KHONG cap nhat index nao
   → xoa bo TANG 3 hoan toan
```

### 3. Đừng đánh index cột hay thay đổi

```text
   Index tren `last_login` (cap nhat moi lan dang nhap)
   → PHA VO HOT cho MOI `UPDATE` cua bang do
   → ke ca cac UPDATE khong lien quan gi toi last_login
```

Đây là điều phản trực giác nhất trong danh sách: **một index sai chỗ làm hỏng HOT cho toàn bảng**.

### 4. Giãn checkpoint

```sql
ALTER SYSTEM SET checkpoint_timeout = '15min';   -- mac dinh 5min
ALTER SYSTEM SET max_wal_size = '8GB';           -- mac dinh 1GB
```

```text
   Checkpoint THUA → moi page chi phai ghi ca page MOT LAN
   trong khoang thoi gian dai hon
   → giam manh `wal_fpi`
```

### 5. Bật nén WAL

```sql
ALTER SYSTEM SET wal_compression = 'zstd';   -- PG15+
```

```text
   Nen rieng cac ban ghi GHI CA PAGE
   → thuong giam 40-70% luong WAL
   → chi phi CPU nho
```

### 6. Gộp lô lệnh ghi

```python
# CHAM: 10.000 transaction → 10.000 lan fsync
for row in rows:
    cur.execute("INSERT INTO logs VALUES (%s)", (row,))
    conn.commit()

# NHANH: 1 transaction
cur.executemany("INSERT INTO logs VALUES (%s)", rows)
conn.commit()
```

### 7. Tách cột lớn ra bảng riêng

```text
   Cot TEXT 5 KB nam cung bang nong:
     moi UPDATE bat ky cot nao → tao phien ban moi CUA CA DONG
     → 5 KB duoc ghi lai du khong doi

   Tach ra bang rieng → bang nong gon → khuech dai giam manh
```

> PostgreSQL đã tự làm một phần bằng **TOAST** (giá trị > ~2 KB tự đẩy sang bảng phụ, và **không ghi lại nếu không đổi**). Nhưng tách tay vẫn tốt hơn khi bạn biết rõ cột nào hiếm dùng.

### 8. Cân nhắc engine LSM cho tải ghi cực nặng

```text
   MyRocks o Facebook: khuech dai ghi GIAM ~10 LAN so voi InnoDB
   → doi lai doc cham hon mot chut
   → xem [phase-11 bai 3]
```

## Khuếch đại ghi ở tầng SSD

Tầng cuối cùng thường bị bỏ qua:

```text
   SSD KHONG GHI DE TAI CHO. Muon sua mot o, phai:
     1. Doc ca KHOI (thuong 256 KB - 4 MB)
     2. Xoa ca khoi
     3. Ghi lai ca khoi

   → COLLECT GARBAGE ben trong SSD gay khuech dai 1,5-4 lan
   → SSD doanh nghiep co "over-provisioning" (du dung luong an)
     de giam chuyen nay
```

Hai điều làm giảm:

```text
   • TRIM/discard: bao cho SSD biet khoi nao khong con dung
     → mount voi tuy chon `discard`, hoac chay `fstrim` dinh ky
   • Giu SSD khong day qua 80%
     → con nhieu khoi trong → it phai gom rac
```

## Bảng tổng kết các nguồn khuếch đại

| Tầng | Nguồn | Mức | Giảm bằng |
|---|---|---|---|
| MVCC | Tạo phiên bản mới cả dòng | 5-50× | Tách cột lớn; `fillfactor` |
| Index | Cập nhật mọi index | ×(số index) | Bỏ index thừa; tăng HOT |
| WAL | Ghi nhật ký | 2-5× | `wal_compression` |
| **Ghi cả page** | Chống trang rách | **có thể ×1.000** | Giãn checkpoint; `wal_compression` |
| Hệ điều hành | Ghi theo khối 4 KB | 1-2× | — |
| SSD | Gom rác bên trong | 1,5-4× | TRIM; không để đầy quá 80% |

Dòng in đậm là nguồn lớn nhất và cũng dễ giảm nhất.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| `NOT IN` với subquery có `NULL` | **Kết quả luôn rỗng, không báo lỗi** | `NOT EXISTS` |
| `WHERE x <> 'y'` bỏ sót dòng `NULL` | Thiếu dữ liệu âm thầm | `IS DISTINCT FROM` |
| Tưởng `UNIQUE` chặn nhiều `NULL` | Nhiều `NULL` đều được chấp nhận | `UNIQUE NULLS NOT DISTINCT` (PG15+) |
| Dùng `''` hoặc `0` thay `NULL` để "tránh rắc rối" | Mất khả năng phân biệt "không biết" với "bằng không"; và tốn chỗ hơn | `NULL` khi thiếu dữ liệu là có nghĩa |
| Đánh index cột hay thay đổi | **Phá vỡ HOT cho toàn bảng** | Cân nhắc kỹ; đo tỉ lệ HOT trước/sau |
| Để `max_wal_size = 1GB` mặc định | Checkpoint bị ép buộc liên tục → `wal_fpi` cao | Tăng lên 4-16 GB |
| Cột TEXT lớn nằm cùng bảng nóng | Mọi `UPDATE` ghi lại cả dòng | Tách bảng, hoặc để TOAST xử lý |
| Bỏ qua khuếch đại ở tầng SSD | SSD mòn nhanh hơn dự kiến nhiều lần | TRIM; giữ dưới 80% dung lượng |
| Không theo dõi `wal_fpi` | Không biết checkpoint đang quá dày | Cảnh báo khi `wal_fpi/wal_records > 5%` |

## Tóm tắt bài 7

- **`NULL` nghĩa là "không biết"**, nên mọi so sánh với nó cho ra `NULL` chứ không phải `TRUE`/`FALSE` — SQL dùng **logic ba giá trị**.
- Bốn bẫy: `WHERE x <> 'y'` **bỏ sót dòng `NULL`** · **`NOT IN` với subquery chứa `NULL` luôn trả về rỗng** · `UNIQUE` cho phép nhiều `NULL` · hàm tổng hợp bỏ qua `NULL`.
- Bẫy nguy hiểm nhất là `NOT IN` — nó **không bao giờ báo lỗi**, chỉ âm thầm trả về rỗng. Dùng `NOT EXISTS`.
- Trái trực giác, **`NULL` tiết kiệm chỗ** (bitmap 1 bit mỗi cột) và cho phép **index bộ phận nhỏ hơn ~1.200 lần** với các cột hiếm có giá trị.
- **Khuếch đại ghi** có **sáu tầng**: MVCC → index → WAL → ghi cả page → hệ điều hành → SSD. Một `UPDATE` 8 byte có thể thành hàng chục KB ghi thật.
- Đo thật: cập nhật 100.000 dòng sinh **47 MB WAL** cho 800 KB dữ liệu logic — khuếch đại **~60 lần** chỉ riêng tầng WAL.
- Nguồn lớn nhất và dễ giảm nhất là **ghi cả page**: giãn checkpoint (`max_wal_size = 8GB`) và bật **`wal_compression = zstd`** (giảm 40-70%).
- Điều phản trực giác nhất: **một index trên cột hay thay đổi phá vỡ HOT update cho toàn bảng** — kể cả các `UPDATE` không liên quan gì tới cột đó.
- Tầng SSD thường bị bỏ qua: gom rác bên trong gây khuếch đại thêm **1,5-4 lần**. Giảm bằng **TRIM** và **giữ ổ dưới 80% dung lượng**.

**Bài kế tiếp** → [Bài 8: Optimistic vs Pessimistic Concurrency Control và MySQL InnoDB Locking](07-concurrency-control-va-innodb-locking.md)

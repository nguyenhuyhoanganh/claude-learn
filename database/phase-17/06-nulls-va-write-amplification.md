# Bài 7: NULL và Write Amplification

Hai chủ đề không liên quan gì nhau về mặt khái niệm, nhưng chúng chung một tính chất: **cả hai đều là chi phí ẩn mà bạn không nhìn thấy cho tới khi đo**.

---

# Phần I — NULL

## `NULL` không phải một giá trị

Đây là điểm khởi đầu, và hiểu sai nó là gốc của mọi bẫy sau:

```text
   NULL nghĩa là "KHÔNG BIẾT", không phải "rỗng" hay "không có gì".

   → Mọi phép so sánh với NULL cho ra NULL, KHÔNG phải TRUE hay FALSE.
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
   |   |   |   |          ← TẤT CẢ đều là NULL, không phải true/false
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
   `WHERE` chỉ giữ dòng có điều kiện TRUE.
   NULL <> 'active'  →  NULL  →  KHÔNG được giữ

   → Dòng có status = NULL BỊ BỎ QUA ÂM THẦM
```

```sql
-- Cách đúng
WHERE status IS DISTINCT FROM 'active';
-- hoặc
WHERE status <> 'active' OR status IS NULL;
```

`IS DISTINCT FROM` xử lý `NULL` như một giá trị bình thường — đó là công cụ đúng cho tình huống này, và rất ít người dùng.

### Bẫy 2 — `NOT IN` với subquery chứa `NULL`

Đây là bẫy gây bug âm thầm nhiều nhất:

```sql
SELECT * FROM orders WHERE user_id NOT IN (SELECT id FROM banned_users);
```

```text
   Nếu `banned_users.id` có DÙ MỘT giá trị NULL:
     user_id NOT IN (1, 2, NULL)
     ≡ user_id <> 1 AND user_id <> 2 AND user_id <> NULL
     ≡ TRUE AND TRUE AND NULL
     ≡ NULL
   → KHÔNG dòng nào được giữ
   → KẾT QUẢ LUÔN RỖNG, không bao giờ báo lỗi
```

```sql
-- AN TOÀN
SELECT * FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM banned_users b WHERE b.id = o.user_id);
```

`NOT EXISTS` không bị ảnh hưởng bởi `NULL`, và thường còn nhanh hơn.

### Bẫy 3 — `UNIQUE` cho phép nhiều `NULL`

```sql
CREATE TABLE users (email TEXT UNIQUE);
INSERT INTO users VALUES (NULL), (NULL), (NULL);   -- CHẤP NHẬN CẢ BA
```

```text
   Vì NULL <> NULL, nên các NULL KHÔNG được coi là trùng nhau.
   → đúng theo chuẩn SQL, nhưng thường không phải ý định của bạn
```

PostgreSQL 15 thêm cách kiểm soát:

```sql
CREATE TABLE users (
    email TEXT,
    UNIQUE NULLS NOT DISTINCT (email)      -- chỉ cho MỘT NULL
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
    │      │      └ trung bình của 842 dòng CÓ tuổi, không phải 1.000
    │      └ đếm dòng có email KHÁC NULL
    └ đếm MỌI dòng
```

Đây thường là hành vi bạn muốn, nhưng phải biết nó xảy ra — nếu không, `AVG` sẽ cho con số khác với `SUM / COUNT(*)`.

## Vì sao `NULL` lại tốt cho hiệu năng

Trái với trực giác, `NULL` **tiết kiệm** chỗ:

```text
   POSTGRESQL lưu một BITMAP NULL ở đầu mỗi tuple: 1 bit mỗi cột.
   → cột NULL KHÔNG chiếm byte dữ liệu nào

   Bảng 20 cột, trung bình 15 cột NULL:
     Dùng NULL      : 23 byte header + 3 byte bitmap + 5 cột dữ liệu
     Dùng chuỗi rỗng: 23 byte header + 20 cột dữ liệu
   → NULL GỌN HƠN đáng kể
```

Và quan trọng hơn — **index bỏ qua `NULL` được**:

```sql
-- Bảng 100 triệu dòng, chỉ 50.000 dòng có `deleted_at` khác NULL
CREATE INDEX idx_deleted ON orders (deleted_at) WHERE deleted_at IS NOT NULL;
```

```text
   Index đầy đủ  : 2,1 GB
   Index bộ phận : 1,8 MB      → NHỎ HƠN ~1.200 LẦN
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
   NULL khi thiếu dữ liệu là CÓ NGHĨA.
   Mặc định khi thiếu dữ liệu chỉ là PHIỀN PHỨC.
```

---

# Phần II — Write Amplification

## Định nghĩa

```text
   khuech_dai_ghi = so_byte_GHI_THAT_XUONG_DIA / so_byte_DU_LIEU_LOGIC

   Bạn UPDATE một cột 4 byte.
   Đĩa phải ghi bao nhiêu?  → thường là HÀNG NGHÌN byte.
```

## Sáu tầng khuếch đại

```text
   ┌─ TẦNG 1: ỨNG DỤNG ─────────────────────────────────────────┐
   │  UPDATE users SET last_login = now() WHERE id = 42;        │
   │  Dữ liệu logic: 8 byte                                     │
   ├─ TẦNG 2: MVCC ─────────────────────────────────────────────┤
   │  PostgreSQL tạo PHIÊN BẢN MỚI của CẢ DÒNG                  │
   │  → ~200 byte (cả dòng, không chỉ cột đổi)                  │
   ├─ TẦNG 3: INDEX ────────────────────────────────────────────┤
   │  ctid đổi → cập nhật 5 index × ~40 byte                    │
   │  → ~200 byte                                               │
   ├─ TẦNG 4: WAL ──────────────────────────────────────────────┤
   │  Ghi bản ghi WAL cho dòng + cho mọi index                  │
   │  → ~400 byte                                               │
   │  VÀ nếu là lần đầu page bị sửa sau checkpoint:              │
   │  → GHI CA PAGE 8 KB × (1 heap + 5 index) = 48 KB   ⚠       │
   ├─ TẦNG 5: HỆ ĐIỀU HÀNH ─────────────────────────────────────┤
   │  Ghi theo đơn vị 4 KB                                      │
   ├─ TẦNG 6: SSD ──────────────────────────────────────────────┤
   │  Ghi theo đơn vị 16 KB, và GOM RÁC bên trong               │
   │  → khuếch đại thêm 1,5-4 lần                               │
   └────────────────────────────────────────────────────────────┘

   TỔNG: 8 byte logic  →  có thể thành 50-200 KB ghi thật
                          KHUẾCH ĐẠI 6.000 - 25.000 LẦN
```

Con số này nghe khó tin, nhưng đo được.

## Đo trên máy thật

```sql
-- Đo WAL sinh ra bởi một thao tác
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
   100.000 dòng × 8 byte dữ liệu logic = 800 KB
   WAL sinh ra                          =  47 MB
   → KHUẾCH ĐẠI ~60 LẦN (chỉ riêng tầng WAL)
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
      SSD chỉ chịu được số lần ghi HỮU HẠN mỗi ô.
      Khuếch đại 50 lần → SSD mòn nhanh hơn 50 lần.
      → 5 năm thành 1 năm

   2. BĂNG THÔNG ĐĨA
      SSD 500 MB/s ghi, khuếch đại 50 lần
      → chỉ ghi được 10 MB/s DỮ LIỆU LOGIC

   3. BĂNG THÔNG NHÂN BẢN
      WAL được gửi NGUYÊN VẸN cho replica.
      Khuếch đại cao → lưu lượng nhân bản cao
      → đắt khi xuyên trung tâm dữ liệu

   4. DUNG LƯỢNG SAO LƯU
      Sao lưu tăng dần dựa trên WAL → càng lớn
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
   HOT update: nếu phiên bản mới nằm CÙNG PAGE và KHÔNG cột được đánh index
   bị đổi → KHÔNG cập nhật index nào
   → xoá bỏ TẦNG 3 hoàn toàn
```

### 3. Đừng đánh index cột hay thay đổi

```text
   Index trên `last_login` (cập nhật mỗi lần đăng nhập)
   → PHÁ VỠ HOT cho MỌI `UPDATE` của bảng đó
   → kể cả các UPDATE không liên quan gì tới last_login
```

Đây là điều phản trực giác nhất trong danh sách: **một index sai chỗ làm hỏng HOT cho toàn bảng**.

### 4. Giãn checkpoint

```sql
ALTER SYSTEM SET checkpoint_timeout = '15min';   -- mặc định 5min
ALTER SYSTEM SET max_wal_size = '8GB';           -- mặc định 1GB
```

```text
   Checkpoint THƯA → mỗi page chỉ phải ghi cả page MỘT LẦN
   trong khoảng thời gian dài hơn
   → giảm mạnh `wal_fpi`
```

### 5. Bật nén WAL

```sql
ALTER SYSTEM SET wal_compression = 'zstd';   -- PG15+
```

```text
   Nén riêng các bản ghi GHI CẢ PAGE
   → thường giảm 40-70% lượng WAL
   → chi phí CPU nhỏ
```

### 6. Gộp lô lệnh ghi

```python
# CHẬM: 10.000 transaction → 10.000 lần fsync
for row in rows:
    cur.execute("INSERT INTO logs VALUES (%s)", (row,))
    conn.commit()

# NHANH: 1 transaction
cur.executemany("INSERT INTO logs VALUES (%s)", rows)
conn.commit()
```

### 7. Tách cột lớn ra bảng riêng

```text
   Cột TEXT 5 KB nằm cùng bảng nóng:
     mọi UPDATE bất kỳ cột nào → tạo phiên bản mới CỦA CẢ DÒNG
     → 5 KB được ghi lại dù không đổi

   Tách ra bảng riêng → bảng nóng gọn → khuếch đại giảm mạnh
```

> PostgreSQL đã tự làm một phần bằng **TOAST** (giá trị > ~2 KB tự đẩy sang bảng phụ, và **không ghi lại nếu không đổi**). Nhưng tách tay vẫn tốt hơn khi bạn biết rõ cột nào hiếm dùng.

### 8. Cân nhắc engine LSM cho tải ghi cực nặng

```text
   MyRocks ở Facebook: khuếch đại ghi GIẢM ~10 LẦN so với InnoDB
   → đổi lại đọc chậm hơn một chút
   → xem [phase-11 bài 3]
```

## Khuếch đại ghi ở tầng SSD

Tầng cuối cùng thường bị bỏ qua:

```text
   SSD KHÔNG GHI ĐÈ TẠI CHỖ. Muốn sửa một ô, phải:
     1. Đọc cả KHỐI (thường 256 KB - 4 MB)
     2. Xoá cả khối
     3. Ghi lại cả khối

   → GOM RÁC bên trong SSD gây khuếch đại 1,5-4 lần
   → SSD doanh nghiệp có "over-provisioning" (dư dung lượng ẩn)
     để giảm chuyện này
```

Hai điều làm giảm:

```text
   • TRIM/discard: báo cho SSD biết khối nào không còn dùng
     → mount với tuỳ chọn `discard`, hoặc chạy `fstrim` định kỳ
   • Giữ SSD không đầy quá 80%
     → còn nhiều khối trống → ít phải gom rác
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

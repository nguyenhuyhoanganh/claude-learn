# Bài 2: MyISAM và InnoDB — hai engine, hai thế giới

Cùng một câu SQL, hai engine, hai kết quả hoàn toàn khác nhau:

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
ROLLBACK;
```

```text
   Bảng dùng InnoDB  →  cả hai lệnh bị hoàn tác.  Dữ liệu nguyên vẹn.  ✔
   Bảng dùng MyISAM  →  ROLLBACK không làm gì cả.  Tiền đã bị trừ.     ✘
```

Không có lỗi nào được báo. MySQL chỉ đưa ra một cảnh báo mà hầu như không ai đọc. Bài này giải thích vì sao, và vì sao MyISAM vẫn đáng học dù gần như không nên dùng nữa.

## MyISAM — engine của thời đầu

**MyISAM** viết tắt của *Indexed Sequential Access Method*. Nó là engine mặc định của MySQL cho tới phiên bản **5.5** (năm 2010).

### Cấu trúc trên đĩa

Mỗi bảng MyISAM là **ba file riêng biệt**:

```text
   users.frm   →  định nghĩa cấu trúc bảng (cột, kiểu dữ liệu)
   users.MYD   →  MyData — dữ liệu thật
   users.MYI   →  MyIndex — mọi index
```

Có thể **chép ba file này sang máy khác** và bảng hoạt động ngay. Đây từng là một ưu điểm lớn — sao lưu chỉ là chép file.

### Index trỏ thẳng tới vị trí vật lý

```text
   INDEX (users.MYI)              DỮ LIỆU (users.MYD)
   ┌──────────────────┐           ┌──────────────────────────────┐
   │ 'An'    → 0      │──────────▶│ offset 0:   1│An  │25│HN     │
   │ 'Binh'  → 128    │──────────▶│ offset 128: 2│Binh│30│HCM    │
   │ 'Chi'   → 256    │──────────▶│ offset 256: 3│Chi │28│DN     │
   └──────────────────┘           └──────────────────────────────┘
                                   ▲ VỊ TRÍ BYTE trong file
```

**Mọi index đều trỏ thẳng tới offset byte.** Kể cả khoá chính — trong MyISAM, khoá chính chỉ là một index duy nhất, không có gì đặc biệt.

```text
   ƯU: tra index xong là NHẢY THẲNG tới dữ liệu — một bước duy nhất.
       Không có "clustered vs secondary" như InnoDB.
```

### Vì sao `UPDATE` và `DELETE` gây phân mảnh

Đây là điểm yếu chí mạng:

```text
   TRƯỚC
   ┌────────────────────────────────────────────┐
   │ [0] An,25,HN │ [128] Binh,30,HCM │ [256] ..│
   └────────────────────────────────────────────┘

   UPDATE users SET city='Ho Chi Minh City' WHERE id=2;
     → dòng dài ra, KHÔNG vừa chỗ cũ nữa

   SAU
   ┌────────────────────────────────────────────┐
   │ [0] An,25,HN │ [128] LỖ TRỐNG │ [256] .. │ [512] Binh,30,Ho Chi... │
   └────────────────────────────────────────────┘
                        ▲                              ▲
              vùng chết, phải theo dõi        dòng chuyển ra CUỐI FILE

   → VÀ MỌI INDEX trỏ tới offset 128 phải cập nhật thành 512
```

Hai hậu quả:

```text
   1. PHÂN MẢNH: file phình lên, đầy lỗ trống
      → phải chạy OPTIMIZE TABLE định kỳ (KHOÁ TOÀN BẢNG)

   2. CẬP NHẬT MỌI INDEX cho một lần sửa
      → dù cột được sửa không hề nằm trong index đó
```

### Ba thiếu sót lớn

**Thiếu sót 1 — Không có transaction**

```sql
CREATE TABLE t (id INT, val INT) ENGINE = MyISAM;
INSERT INTO t VALUES (1, 100);

START TRANSACTION;
UPDATE t SET val = 999 WHERE id = 1;
ROLLBACK;

SELECT * FROM t;
```

```text
+----+-----+
| id | val |
+----+-----+
|  1 | 999 |     ← ROLLBACK KHÔNG LÀM GÌ CẢ
+----+-----+
```

MySQL có đưa ra cảnh báo:

```text
Warning: Some non-transactional changed tables couldn't be rolled back
```

Nhưng đó chỉ là **cảnh báo**, không phải lỗi. Ứng dụng chạy tiếp như không có gì xảy ra, và dữ liệu đã sai.

**Thiếu sót 2 — Chỉ có khoá mức bảng**

```text
   MỘT lệnh UPDATE → khoá TOÀN BẢNG

   Kết quả: chỉ MỘT người ghi được tại một thời điểm.
   Với 100 người dùng cùng ghi:
     → 99 người xếp hàng
     → thông lượng ghi = thông lượng của MỘT luồng
```

Đây là lý do MyISAM không dùng được cho tải ghi đồng thời, dù ghi tuần tự của nó rất nhanh.

**Thiếu sót 3 — Sự cố làm hỏng bảng**

```text
   Mất điện giữa lúc UPDATE:
     • dữ liệu đã ghi một phần
     • index chưa cập nhật xong
     → INDEX VÀ DỮ LIỆU KHÔNG KHỚP NHAU
     → bảng bị đánh dấu "crashed"

   Phải chạy tay:  REPAIR TABLE users;
     → có thể mất hàng giờ với bảng lớn
     → và có thể MẤT DỮ LIỆU
```

Không có WAL, không có phục hồi tự động. Đây là nguyên nhân của rất nhiều đêm mất ngủ trong kỷ nguyên LAMP.

### Điểm mạnh còn lại

Công bằng mà nói, MyISAM có hai thứ InnoDB không có:

```text
   1. COUNT(*) TỨC THÌ
      MyISAM lưu sẵn số dòng trong metadata.
      SELECT COUNT(*) FROM t;  →  đọc một con số, ~0 ms

      InnoDB PHẢI ĐẾM THẬT vì MVCC — mỗi transaction thấy số dòng khác nhau.

   2. GỌN HƠN
      Không có thông tin MVCC, không có undo log
      → file nhỏ hơn ~20-30% cho cùng dữ liệu
```

Điểm 1 giải thích một hiện tượng hay được nhắc: *"MySQL đếm nhanh hơn PostgreSQL"* — thực ra là *"MyISAM đếm nhanh hơn mọi engine có MVCC"*, và cái giá là không có transaction.

---

## InnoDB — engine của hiện tại

Trở thành mặc định từ MySQL **5.5**, và là lựa chọn đúng cho gần như mọi trường hợp.

### Bảng chính là cây B+Tree

Như đã phân tích ở [phase-3 bài 3](../phase-3/03-primary-key-vs-secondary-key.md) và [phase-5 bài 2](../phase-5/02-btree-plus-va-ung-dung-thuc-te.md):

```text
   CLUSTERED INDEX (= chính bảng)
   ┌────────────────────────┐
   │   NÚT TRONG: khoá chính │
   └───────────┬─────────────┘
               ▼
   ┌──────────────────────────────────────┐
   │ LÁ: 1│An │25│HN   2│Binh│30│HCM  ... │  ← CẢ DÒNG nằm ở lá
   └──────────────────────────────────────┘

   INDEX PHỤ trên `name`
   ┌────────────────────────┐
   │ 'An'   → khoá chính 1  │  ← trỏ tới KHOÁ CHÍNH, không phải vị trí
   │ 'Binh' → khoá chính 2  │
   └────────────────────────┘
```

Hệ quả nhắc lại:

```text
   • Tra khoá chính: MỘT bước (dữ liệu ở ngay lá)
   • Tra index phụ:  BA bước (index phụ → khoá chính → clustered)
   • Khoá chính lớn → PHÌNH MỌI index phụ
   • Chèn khoá ngẫu nhiên → TÁCH PAGE liên tục
```

### Bốn thứ InnoDB có mà MyISAM không

| | Cơ chế | Lợi ích |
|---|---|---|
| **Transaction ACID** | Redo log + undo log | `ROLLBACK` hoạt động thật |
| **Khoá mức dòng** | Khoá lưu trong header của bản ghi | Nhiều người ghi song song |
| **MVCC** | Undo log giữ phiên bản cũ | Người đọc không chặn người ghi |
| **Khoá ngoại** | Ràng buộc tham chiếu | Database tự giữ toàn vẹn |

### Kiến trúc bộ nhớ và đĩa

```text
   TRONG BỘ NHỚ                        TRÊN ĐĨA
   ════════════                        ════════
   ┌──────────────────────┐            ┌─────────────────────────┐
   │  BUFFER POOL         │            │  ibdata1 / *.ibd        │
   │  (thường 50-75% RAM) │◀──────────▶│  dữ liệu + index        │
   │  page dữ liệu+index  │            └─────────────────────────┘
   └──────────┬───────────┘            ┌─────────────────────────┐
   ┌──────────▼───────────┐            │  ib_logfile0/1          │
   │  LOG BUFFER          │───────────▶│  REDO LOG (làm lại)     │
   └──────────────────────┘            └─────────────────────────┘
   ┌──────────────────────┐            ┌─────────────────────────┐
   │  CHANGE BUFFER       │            │  UNDO TABLESPACE        │
   │  (hoãn cập nhật      │            │  (giá trị cũ, cho MVCC  │
   │   index phụ)         │            │   và ROLLBACK)          │
   └──────────────────────┘            └─────────────────────────┘
                                       ┌─────────────────────────┐
                                       │  DOUBLEWRITE BUFFER     │
                                       │  (chống trang rách)     │
                                       └─────────────────────────┘
```

Hai thành phần đáng nói riêng:

**Change buffer** — khi bạn `INSERT` một dòng, các index phụ cần cập nhật có thể đang không nằm trong RAM. Thay vì đọc chúng lên ngay (I/O ngẫu nhiên), InnoDB **ghi nhớ việc cần làm** rồi gộp lại xử lý sau. Đây là lý do InnoDB chèn nhanh hơn nhiều so với dự đoán.

**Doublewrite buffer** — mọi page được ghi **hai lần**: lần đầu vào một vùng liền mạch riêng, lần sau vào chỗ thật. Nếu mất điện làm rách page ở chỗ thật, phục hồi lấy bản nguyên từ vùng riêng. Đây là giải pháp của InnoDB cho vấn đề trang rách ([phase-2 bài 2](../phase-2/02-atomicity-va-durability.md)), tương đương `full_page_writes` của PostgreSQL.

### Ba tham số quan trọng nhất

```ini
# 1. Kích thước buffer pool — QUAN TRỌNG NHẤT
innodb_buffer_pool_size = 12G        # 50-75% RAM máy

# 2. Mức độ bền vững khi commit
innodb_flush_log_at_trx_commit = 1   # 1 = ACID đầy đủ (mặc định)
                                     # 2 = fsync mỗi giây, mất tối đa 1s khi MÁY chết
                                     # 0 = nhanh nhất, mất tối đa 1s kể cả khi MySQL chết

# 3. Phương thức ghi
innodb_flush_method = O_DIRECT       # bỏ qua cache của hệ điều hành
                                     # → tránh cache HAI LẦN (buffer pool + OS)
```

`innodb_buffer_pool_size` là tham số có tác động lớn nhất trong toàn bộ MySQL. Mặc định chỉ **128 MB** — con số từ thời máy chủ có 1 GB RAM.

---

## Bảng đối chiếu đầy đủ

| | MyISAM | InnoDB |
|---|---|---|
| Cấu trúc | B-Tree, index trỏ vị trí vật lý | **B+Tree gom cụm** |
| Transaction | **Không** | **Có, ACID đầy đủ** |
| Mức khoá | **Bảng** | **Dòng** |
| MVCC | Không | **Có** |
| Khoá ngoại | Không | **Có** |
| Phục hồi sau sự cố | Không — phải `REPAIR TABLE` tay | **Tự động qua redo log** |
| `COUNT(*)` | **Tức thì** (lưu sẵn) | Phải đếm thật |
| Toàn văn | Có (từ lâu) | Có (từ MySQL 5.6) |
| Bộ nhớ đệm | Chỉ cache **index** | Cache **cả dữ liệu và index** |
| Kích thước file | Nhỏ hơn ~20-30% | Lớn hơn |
| Chèn tuần tự thuần | Rất nhanh | Nhanh |
| Ghi đồng thời | **Rất tệ** (khoá bảng) | **Tốt** |
| Nên dùng | Gần như không bao giờ | **Mặc định cho mọi thứ** |

Dòng "bộ nhớ đệm" đáng chú ý: MyISAM chỉ cache index, còn dữ liệu thì dựa vào cache của hệ điều hành. InnoDB cache cả hai trong buffer pool của nó — kiểm soát tốt hơn nhiều.

---

## Thử tận mắt

```bash
docker run --name mysql-lab -e MYSQL_ROOT_PASSWORD=lab -p 3306:3306 -d mysql:8
sleep 20
docker exec -it mysql-lab mysql -uroot -plab
```

```sql
CREATE DATABASE lab; USE lab;

CREATE TABLE t_myisam (id INT PRIMARY KEY, val INT) ENGINE = MyISAM;
CREATE TABLE t_innodb (id INT PRIMARY KEY, val INT) ENGINE = InnoDB;

INSERT INTO t_myisam VALUES (1, 100);
INSERT INTO t_innodb VALUES (1, 100);
```

### Thí nghiệm 1 — `ROLLBACK`

```sql
START TRANSACTION;
UPDATE t_myisam SET val = 999 WHERE id = 1;
UPDATE t_innodb SET val = 999 WHERE id = 1;
ROLLBACK;

SELECT 'myisam' AS engine, val FROM t_myisam
UNION ALL
SELECT 'innodb', val FROM t_innodb;
```

```text
+--------+------+
| engine | val  |
+--------+------+
| myisam |  999 |    ← ROLLBACK BỊ BỎ QUA
| innodb |  100 |    ← hoàn tác đúng
+--------+------+
```

### Thí nghiệm 2 — Khoá bảng vs khoá dòng

**Phiên A:**

```sql
START TRANSACTION;
UPDATE t_innodb SET val = 1 WHERE id = 1;
-- giữ nguyên
```

**Phiên B:**

```sql
INSERT INTO t_innodb VALUES (2, 200);   -- CHẠY NGAY, không bị chặn
```

Bây giờ với MyISAM:

**Phiên A:**

```sql
LOCK TABLES t_myisam WRITE;
```

**Phiên B:**

```sql
SELECT * FROM t_myisam;   -- BỊ CHẶN — kể cả lệnh ĐỌC
```

### Thí nghiệm 3 — `COUNT(*)`

```sql
INSERT INTO t_myisam SELECT n, n FROM
  (SELECT ROW_NUMBER() OVER () AS n FROM information_schema.columns
   LIMIT 1000000) x;
-- tương tự cho t_innodb

SELECT BENCHMARK(1, (SELECT COUNT(*) FROM t_myisam));
SELECT BENCHMARK(1, (SELECT COUNT(*) FROM t_innodb));
```

```text
   MyISAM :  0,00 sec   (đọc metadata)
   InnoDB :  0,18 sec   (quet index)
```

Và cách né trên InnoDB khi chỉ cần con số xấp xỉ:

```sql
SELECT table_rows FROM information_schema.tables
WHERE table_schema = 'lab' AND table_name = 't_innodb';
```

Con số này là ước lượng (sai số có thể tới vài chục phần trăm) nhưng trả về tức thì — tương đương `reltuples` của PostgreSQL.

---

## Chuyển bảng từ MyISAM sang InnoDB

```sql
-- Tìm mọi bảng còn dùng MyISAM
SELECT table_schema, table_name, engine,
       ROUND(data_length/1024/1024) AS data_mb
FROM information_schema.tables
WHERE engine = 'MyISAM' AND table_schema NOT IN ('mysql','information_schema')
ORDER BY data_length DESC;
```

```sql
ALTER TABLE users ENGINE = InnoDB;
```

Bốn điều phải kiểm tra trước:

| Kiểm tra | Vì sao |
|---|---|
| **Bảng có khoá chính không** | Không có thì InnoDB tự tạo khoá ẩn 6 byte bạn không kiểm soát. **Thêm khoá chính trước** |
| **Dung lượng đĩa** | InnoDB tốn thêm 20-40%, và `ALTER` cần chỗ cho bảng tạm |
| **Có dựa vào `COUNT(*)` nhanh không** | Sẽ chậm đi; đổi sang `information_schema.table_rows` |
| **Có dùng toàn văn của MyISAM không** | InnoDB hỗ trợ từ 5.6 nhưng hành vi khác |

Trên bảng lớn, `ALTER TABLE` khoá bảng rất lâu — dùng công cụ chuyên dụng:

```bash
pt-online-schema-change --alter "ENGINE=InnoDB" D=lab,t=users --execute
# hoặc
gh-ost --table=users --alter="ENGINE=InnoDB" --execute
```

## Khi nào MyISAM vẫn hợp lý

Rất hiếm, nhưng có:

```text
   ✔ Bảng tra cứu CHỈ ĐỌC, không bao giờ đổi sau khi nạp
     (mã bưu chính, danh mục địa lý)
   ✔ Cần COUNT(*) tức thì trên bảng tĩnh
   ✔ Hệ thống cũ không thể đổi và đang chạy ổn

   ✘ MỌI trường hợp khác → InnoDB
```

Và cần biết: **MariaDB đã thay MyISAM bằng Aria** (xem [bài 4](04-xtradb-sqlite-aria.md)), một engine giữ ưu điểm của MyISAM nhưng có phục hồi sau sự cố. Nếu bạn dùng MariaDB, Aria luôn tốt hơn MyISAM.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Dùng transaction trên bảng MyISAM | `ROLLBACK` im lặng không làm gì → dữ liệu sai | Kiểm tra engine của mọi bảng nghiệp vụ |
| Trộn MyISAM và InnoDB trong một transaction | Chỉ phần InnoDB được hoàn tác | Dùng InnoDB cho tất cả |
| Để `innodb_buffer_pool_size` mặc định 128 MB | Gần như mọi truy vấn phải xuống đĩa | Đặt 50-75% RAM máy |
| Chuyển sang InnoDB mà bảng không có khoá chính | InnoDB tạo khoá ẩn không kiểm soát được | Thêm khoá chính **trước** khi chuyển |
| Dựa vào `COUNT(*)` nhanh sau khi chuyển sang InnoDB | Truy vấn chậm đi hàng trăm lần | `information_schema.table_rows` cho số xấp xỉ |
| `ALTER TABLE ENGINE=InnoDB` trên bảng lớn giờ cao điểm | Khoá bảng rất lâu | `pt-online-schema-change` hoặc `gh-ost` |
| Nghĩ MyISAM luôn nhanh hơn vì "nhẹ hơn" | Chỉ nhanh hơn ở chèn tuần tự một luồng và `COUNT(*)` | Đo với tải đồng thời thật |

## Tóm tắt bài 2

- **MyISAM** ra đời trước, index **trỏ thẳng tới offset byte** — nhanh khi tra, nhưng `UPDATE`/`DELETE` gây **phân mảnh** và bắt **mọi index** cập nhật theo.
- Ba thiếu sót chí mạng của MyISAM: **không có transaction** (`ROLLBACK` im lặng không làm gì), **chỉ khoá mức bảng** (một người ghi tại một thời điểm), **sự cố làm hỏng bảng** (phải `REPAIR TABLE` tay).
- Hai điểm mạnh còn lại: **`COUNT(*)` tức thì** (lưu sẵn số dòng) và file nhỏ hơn 20-30%.
- **InnoDB** để **cả dòng ở lá** của clustered index; index phụ trỏ tới **khoá chính** nên tra tốn ba bước, và **khoá chính lớn làm phình mọi index phụ**.
- Hai cơ chế đáng biết của InnoDB: **change buffer** (hoãn cập nhật index phụ để gộp lô) và **doublewrite buffer** (chống trang rách).
- Tham số quan trọng nhất là **`innodb_buffer_pool_size`** — mặc định chỉ 128 MB, nên đặt 50-75% RAM.
- Chuyển sang InnoDB phải **thêm khoá chính trước**, dự trù thêm 20-40% đĩa, và dùng `pt-online-schema-change`/`gh-ost` trên bảng lớn.
- Trên MariaDB, **Aria luôn tốt hơn MyISAM** — cùng đặc tính nhưng có phục hồi sau sự cố.

**Bài kế tiếp** → [Bài 3: LevelDB, RocksDB và Demo đổi Engine](03-leveldb-rocksdb-va-demo.md)

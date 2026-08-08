# Bài 5: BerkeleyDB, tổng kết Engines và chuyển đổi Engine

Bài cuối của phase này gồm ba phần: một engine có lịch sử đáng học, một bảng tổng kết để tra cứu, và một quy trình chuyển đổi engine an toàn trên MySQL.

---

# Phần I — BerkeleyDB

## Engine của thời kỳ trước

BerkeleyDB (thường viết tắt **BDB**) ra đời năm 1991 tại Đại học California, Berkeley. Nó là **kho khoá-giá trị nhúng** — cùng ý tưởng với LevelDB nhưng sớm hơn hai mươi năm.

```text
   BDB CUNG CẤP BA CẤU TRÚC LƯU TRỮ, CHỌN LÚC TẠO
   ═══════════════════════════════════════════════
   BTREE   →  có sắp xếp, hỗ trợ quét khoảng       (giống InnoDB)
   HASH    →  tra chính xác cực nhanh, không sắp   (giống bảng băm)
   QUEUE   →  bản ghi kích thước cố định, FIFO     (giống hàng đợi)
   RECNO   →  đánh số bản ghi tuần tự
```

Đây là điểm khác biệt lớn nhất so với các engine hiện đại: **bạn chọn cấu trúc dữ liệu phù hợp với bài toán**, thay vì nhận một cấu trúc cố định.

Và nó có ACID đầy đủ:

```text
   • Transaction với commit/rollback
   • Ghi nhật ký trước (WAL)
   • Phục hồi sau sự cố
   • Khoá mức dòng hoặc mức page
   • Nhân bản
```

Một kho khoá-giá trị nhúng có ACID đầy đủ — vào năm 1991. Rất nhiều ý tưởng ngày nay coi là hiển nhiên đã có ở đây từ trước.

## Nó từng ở đâu

```text
   • Backend của MySQL (engine BDB, đến MySQL 5.1)
   • Backend của OpenLDAP
   • Backend của Subversion (đến phiên bản 1.4)
   • Bitcoin Core (ví tiền, đến nay vẫn còn dấu vết)
   • Postfix, Sendmail, Cyrus IMAP
   • Rất nhiều hệ thống Unix
```

## Vì sao nó biến mất

Đây là phần đáng học nhất, và nó **không phải** một câu chuyện kỹ thuật.

```text
   1996  Sleepycat Software thành lập, bán BDB thương mại
   2006  Oracle mua Sleepycat
   2013  Oracle ĐỔI GIẤY PHÉP từ Sleepycat License sang AGPLv3
```

Điều đó nghĩa là gì:

```text
   AGPLv3: nếu phần mềm của bạn dùng BDB VÀ được truy cập qua MẠNG,
           bạn PHẢI công khai toàn bộ mã nguồn của mình
           — hoặc mua giấy phép thương mại của Oracle.

   → Mọi ứng dụng web dùng BDB đột ngột đối mặt:
       "mở mã nguồn" hoặc "trả tiền"
```

Phản ứng của cộng đồng diễn ra rất nhanh:

```text
   Debian, Ubuntu, Red Hat  →  giữ lại bản 5.3 (giấy phép cũ) VĨNH VIỄN
                                không bao giờ nâng cấp nữa
   OpenLDAP                 →  chuyển sang LMDB (tự viết)
   Subversion               →  chuyển hẳn sang FSFS
   Bitcoin Core             →  ghim mãi ở bản 4.8 (2010)
   MySQL                    →  bỏ engine BDB từ 5.1
```

Trong vòng vài năm, một engine từng chạy trên hàng triệu máy chủ gần như biến mất hoàn toàn.

Bài học vượt ra ngoài chuyện database:

> **Giấy phép là một rủi ro kỹ thuật.** Một thay đổi giấy phép có thể giết một công nghệ nhanh hơn bất kỳ khiếm khuyết kỹ thuật nào.

Câu chuyện này lặp lại nhiều lần sau đó: **MongoDB** đổi sang SSPL (2018) → Amazon tạo DocumentDB; **Elasticsearch** đổi sang SSPL (2021) → AWS tạo OpenSearch; **Redis** đổi sang RSAL/SSPL (2024) → Linux Foundation tạo **Valkey**.

Đó là lý do khi chọn công nghệ nền tảng, câu hỏi *"giấy phép là gì, và ai kiểm soát nó?"* quan trọng ngang với *"nó nhanh không?"*.

## Người kế thừa: LMDB

Khi OpenLDAP cần thay BDB, họ viết **LMDB** (*Lightning Memory-Mapped Database*):

| | BerkeleyDB | LMDB |
|---|---|---|
| Cách truy cập | Đọc/ghi file thường | **Ánh xạ bộ nhớ** (mmap) |
| Đọc | Nhanh | **Cực nhanh** — không sao chép byte nào |
| Kích thước mã | ~200.000 dòng | **~10.000 dòng** |
| Giấy phép | AGPLv3 | **OpenLDAP (kiểu BSD)** |
| Điều khiển đồng thời | Khoá | **MVCC, không khoá cho người đọc** |
| Ghi đồng thời | Nhiều | **Một người ghi tại một thời điểm** |

LMDB dùng kỹ thuật **copy-on-write B+Tree**: mỗi transaction ghi tạo ra một cây mới dùng chung phần lớn nút với cây cũ. Nhờ đó người đọc **không bao giờ cần khoá** và **không bao giờ thấy dữ liệu nửa vời**.

Nó đang chạy trong OpenLDAP, Monero, và nhiều hệ thống cần đọc cực nhanh.

---

# Phần II — Bảng tổng kết các engine

## Bảng đối chiếu đầy đủ

| Engine | Cấu trúc | Transaction | Khoá | Nhúng | Dùng ở |
|---|---|---|---|---|---|
| **InnoDB** | B+Tree gom cụm | ACID | Dòng | Không | MySQL (mặc định) |
| **MyISAM** | B-Tree | Không | Bảng | Không | MySQL (cũ) |
| **Aria** | B-Tree | Không (có phục hồi) | Bảng | Không | MariaDB |
| **XtraDB** | B+Tree gom cụm | ACID | Dòng | Không | Percona (đã ngừng) |
| **MyRocks** | **LSM** | ACID | Dòng | Không | MySQL (ghi nặng) |
| **SQLite** | B+Tree | ACID | File | **Có** | Khắp mọi nơi |
| **LevelDB** | **LSM** | Không | — | **Có** | Chrome, Bitcoin Core |
| **RocksDB** | **LSM** | Có | — | **Có** | CockroachDB, TiKV, Kafka |
| **BerkeleyDB** | B-Tree/Hash/Queue | ACID | Dòng/page | **Có** | Hệ thống cũ |
| **LMDB** | B+Tree copy-on-write | ACID | Một người ghi | **Có** | OpenLDAP, Monero |
| **WiredTiger** | B+Tree + LSM | ACID | Tài liệu | Không | MongoDB (mặc định) |
| **PostgreSQL** | Heap + B+Tree | ACID | Dòng | Không | PostgreSQL (không đổi được) |

## Chọn engine theo bài toán

| Bài toán | Engine |
|---|---|
| Ứng dụng web thông thường trên MySQL | **InnoDB** |
| Ghi cực nhiều, dung lượng đĩa là chi phí lớn | **MyRocks / RocksDB** |
| Ứng dụng di động, để bàn, nhúng | **SQLite** |
| Kho khoá-giá trị trong ứng dụng, ghi nặng | **RocksDB** |
| Kho khoá-giá trị, đọc cực nhiều, ghi ít | **LMDB** |
| Bảng tra cứu chỉ đọc trên MariaDB | **Aria** |
| Cần index mở rộng, kiểu dữ liệu phức tạp | **PostgreSQL** |
| Dữ liệu dạng tài liệu | **WiredTiger** (MongoDB) |

## Bốn câu hỏi để chọn engine

```text
   1. TỈ LỆ ĐỌC/GHI?
        Ghi ≫ Đọc  → LSM (RocksDB, MyRocks)
        Đọc ≫ Ghi  → B+Tree (InnoDB, LMDB)

   2. CÓ CẦN TRANSACTION KHÔNG?
        Có   → InnoDB, SQLite, RocksDB, BDB
        Không→ LevelDB, MyISAM (nhưng hãy hỏi lại: THẬT SỰ không cần?)

   3. CÓ TRUY VẤN KHOẢNG KHÔNG?
        Có   → B+Tree
        Chỉ tra theo khoá → LSM hoặc Hash

   4. NHÚNG HAY CLIENT-SERVER?
        Nhúng      → SQLite, RocksDB, LMDB
        Nhiều máy  → MySQL, PostgreSQL
```

---

# Phần III — Chuyển đổi engine trên MySQL

## Xem engine hiện tại

```sql
-- Các engine máy này hỗ trợ
SHOW ENGINES;
```

```text
+--------------------+---------+------------+--------------+------+
| Engine             | Support | Transactions | XA         | Savepoints |
+--------------------+---------+------------+--------------+------+
| InnoDB             | DEFAULT | YES        | YES          | YES  |
| MyISAM             | YES     | NO         | NO           | NO   |
| MEMORY             | YES     | NO         | NO           | NO   |
| CSV                | YES     | NO         | NO           | NO   |
| ARCHIVE            | YES     | NO         | NO           | NO   |
| BLACKHOLE          | YES     | NO         | NO           | NO   |
+--------------------+---------+------------+--------------+------+
```

```sql
-- Engine của từng bảng, kèm kích thước
SELECT table_name, engine,
       ROUND(data_length/1024/1024)  AS data_mb,
       ROUND(index_length/1024/1024) AS index_mb,
       table_rows
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY data_length DESC;
```

## Ba engine đặc biệt đáng biết

```sql
-- MEMORY: toàn bộ trong RAM, MẤT KHI KHỞI ĐỘNG LẠI
CREATE TABLE session_tmp (...) ENGINE = MEMORY;

-- ARCHIVE: nén mạnh, CHỈ cho INSERT và SELECT (không UPDATE/DELETE)
CREATE TABLE audit_2025 (...) ENGINE = ARCHIVE;

-- BLACKHOLE: nhận mọi thứ rồi VỨT ĐI, nhưng VẪN ghi binlog
CREATE TABLE relay (...) ENGINE = BLACKHOLE;
```

`BLACKHOLE` nghe vô nghĩa nhưng có công dụng thật: làm **máy chuyển tiếp nhân bản**. Nó nhận binlog từ primary rồi chuyển tiếp cho hàng chục replica mà **không tốn một byte đĩa nào** cho dữ liệu.

`ARCHIVE` nén tới **~10 lần** so với InnoDB — rất hợp cho nhật ký kiểm toán phải giữ nhiều năm nhưng gần như không bao giờ đọc.

## Quy trình chuyển đổi an toàn

### Bước 1 — Kiểm tra điều kiện

```sql
-- Bảng nào KHÔNG có khoá chính?  (bắt buộc phải có trước khi sang InnoDB)
SELECT t.table_name
FROM information_schema.tables t
LEFT JOIN information_schema.table_constraints c
       ON t.table_schema = c.table_schema
      AND t.table_name = c.table_name
      AND c.constraint_type = 'PRIMARY KEY'
WHERE t.table_schema = DATABASE()
  AND t.engine = 'MyISAM'
  AND c.constraint_name IS NULL;
```

Bảng nào lọt vào danh sách này phải **thêm khoá chính trước**:

```sql
ALTER TABLE bang_thieu_khoa ADD COLUMN id BIGINT AUTO_INCREMENT PRIMARY KEY FIRST;
```

### Bước 2 — Ước lượng dung lượng

```text
   InnoDB tốn thêm 20-40% so với MyISAM cho CÙNG dữ liệu
   (vì có thông tin MVCC, undo log, và page đầy khoảng 90%)

   VÀ: ALTER TABLE tạo BẢN SAO TẠM
   → cần đủ chỗ cho CẢ BẢNG CŨ LẪN BẢNG MỚI cùng lúc

   Ví dụ: bảng MyISAM 100 GB
     → InnoDB ~130 GB
     → trong lúc ALTER cần 100 + 130 = 230 GB trống
```

Đây là nguyên nhân thất bại phổ biến nhất khi chuyển đổi.

### Bước 3 — Chuyển, có phanh

```sql
-- Bảng nhỏ (< 1 GB): làm trực tiếp
ALTER TABLE users ENGINE = InnoDB;
```

```bash
# Bảng lớn: dùng công cụ, KHÔNG khoá bảng
pt-online-schema-change \
  --alter "ENGINE=InnoDB" \
  D=mydb,t=big_table \
  --execute

# Hoặc
gh-ost --database=mydb --table=big_table \
       --alter="ENGINE=InnoDB" --execute
```

Cách hai công cụ này hoạt động (cùng nguyên lý với chiến lược 3 ở [phase-6 bài 2](../phase-6/02-partitioning-thuc-hanh-postgres.md)):

```text
   1. Tạo bảng mới với cấu trúc đích
   2. Chép dữ liệu theo LÔ, chạy nền
   3. Bắt mọi thay đổi mới (pt dùng TRIGGER, gh-ost đọc BINLOG)
   4. Khi bắt kịp: đổi tên hai bảng trong một giao dịch NGẮN
   → Thời gian dừng dịch vụ: vài GIÂY
```

Khác biệt giữa hai công cụ: `pt-online-schema-change` dùng trigger (đơn giản hơn nhưng thêm tải lên bảng gốc); `gh-ost` đọc binlog (không đụng gì vào bảng gốc, an toàn hơn với bảng rất nóng).

### Bước 4 — Kiểm tra sau khi chuyển

```sql
-- Xác nhận đã đổi
SELECT table_name, engine FROM information_schema.tables
WHERE table_schema = DATABASE();

-- Xác nhận số dòng không đổi
SELECT COUNT(*) FROM users;

-- Xác nhận transaction hoạt động
START TRANSACTION;
UPDATE users SET name = 'test' WHERE id = 1;
ROLLBACK;
SELECT name FROM users WHERE id = 1;   -- PHẢI là giá trị cũ
```

### Bước 5 — Chỉnh cấu hình sau khi chuyển

```ini
# MyISAM dùng key_buffer_size; InnoDB thì KHÔNG DÙNG NÓ
key_buffer_size = 64M                 # giảm xuống, không còn cần nhiều

# InnoDB cần buffer pool lớn
innodb_buffer_pool_size = 12G         # 50-75% RAM
innodb_flush_log_at_trx_commit = 1
innodb_flush_method = O_DIRECT
innodb_file_per_table = ON            # mỗi bảng một file .ibd
```

Bước này rất hay bị quên: sau khi chuyển sang InnoDB mà vẫn để `key_buffer_size` chiếm phần lớn RAM thì InnoDB không còn chỗ cho buffer pool, và hệ thống **chậm hơn cả trước khi chuyển**.

`innodb_file_per_table = ON` cũng quan trọng: không có nó, mọi bảng dồn vào một file `ibdata1` khổng lồ **không bao giờ nhỏ lại** kể cả khi bạn xoá bảng.

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Chuyển sang InnoDB mà bảng không có khoá chính | InnoDB tạo khoá ẩn 6 byte không kiểm soát được | Thêm khoá chính **trước** |
| Không dự trù đủ đĩa | `ALTER` thất bại giữa chừng | Cần chỗ cho **cả bảng cũ lẫn bảng mới** |
| `ALTER TABLE` trực tiếp trên bảng lớn | Khoá bảng rất lâu | `pt-online-schema-change` hoặc `gh-ost` |
| Quên chỉnh `key_buffer_size` và `innodb_buffer_pool_size` | InnoDB không có RAM → **chậm hơn cả trước** | Chỉnh cấu hình ngay sau khi chuyển |
| Không bật `innodb_file_per_table` | `ibdata1` phình vô hạn, không bao giờ nhỏ lại | Bật trước khi tạo bảng InnoDB |
| Bỏ qua giấy phép khi chọn công nghệ nền tảng | BDB, MongoDB, Elasticsearch, Redis đều đã đổi giấy phép | Hỏi "giấy phép gì, ai kiểm soát?" khi chọn |
| Dùng `MEMORY` cho dữ liệu quan trọng | Mất sạch khi khởi động lại | Chỉ dùng cho dữ liệu tạm |
| Dùng `ARCHIVE` rồi cần `UPDATE` | `ARCHIVE` chỉ cho `INSERT` và `SELECT` | Kiểm tra mẫu truy cập trước |

## Tóm tắt bài 5

- **BerkeleyDB** (1991) là kho khoá-giá trị nhúng có **ACID đầy đủ** và cho **chọn cấu trúc lưu trữ** (B-Tree / Hash / Queue) — rất nhiều ý tưởng hiện đại đã có ở đây từ ba mươi năm trước.
- Nó biến mất **không vì lý do kỹ thuật** mà vì **đổi giấy phép sang AGPLv3 năm 2013**. Bài học: **giấy phép là một rủi ro kỹ thuật**, và câu chuyện này đã lặp lại với MongoDB, Elasticsearch, Redis.
- **LMDB** là người kế thừa: dùng **ánh xạ bộ nhớ** và **copy-on-write B+Tree**, cho đọc cực nhanh không cần khoá — đổi lại chỉ một người ghi tại một thời điểm.
- Bốn câu hỏi để chọn engine: **tỉ lệ đọc/ghi** · **có cần transaction không** · **có truy vấn khoảng không** · **nhúng hay client-server**.
- Ba engine MySQL ít biết nhưng hữu dụng: **`MEMORY`** (mất khi khởi động lại), **`ARCHIVE`** (nén ~10 lần, chỉ chèn và đọc), **`BLACKHOLE`** (máy chuyển tiếp nhân bản, không tốn đĩa).
- Chuyển đổi engine cần **năm bước**: kiểm tra khoá chính → ước lượng đĩa (cần chỗ cho **cả hai** bảng) → chuyển bằng `gh-ost`/`pt-osc` → kiểm tra → **chỉnh lại cấu hình bộ nhớ**.
- Bước bị quên nhiều nhất là bước cuối: không chuyển RAM từ `key_buffer_size` sang `innodb_buffer_pool_size` sẽ khiến hệ thống **chậm hơn cả trước khi chuyển**.

**Bài kế tiếp** → [Phase 12 — Bài 1: Database Cursors](../phase-12/01-database-cursors.md)

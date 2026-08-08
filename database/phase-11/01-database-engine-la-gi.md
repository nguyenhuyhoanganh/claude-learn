# Bài 1: Database Engine là gì — lớp thư viện dưới đáy

Bạn gõ:

```sql
INSERT INTO users (name) VALUES ('An');
```

Giữa câu lệnh đó và các byte nằm trên chip nhớ có **rất nhiều tầng**. Tầng dưới cùng — cái thật sự sắp xếp byte trên đĩa và tìm chúng lại — gọi là **database engine** (bộ máy lưu trữ).

Bài này tách bạch hai khái niệm hay bị gộp làm một: **DBMS** và **engine**. Hiểu ranh giới đó giải thích được vì sao cùng một câu SQL lại cho hành vi khác nhau trên các hệ khác nhau, và vì sao MySQL cho phép đổi engine còn PostgreSQL thì không.

## Hai tầng, hai trách nhiệm

```text
   ┌────────────────────────────────────────────────────────────────┐
   │  DBMS — HỆ QUẢN TRỊ CƠ SỞ DỮ LIỆU                              │
   │                                                                │
   │   • Nói chuyện mạng với client (giao thức riêng của từng hệ)   │
   │   • Phân tích cú pháp SQL                                      │
   │   • Lập kế hoạch và tối ưu truy vấn                            │
   │   • Xác thực, phân quyền                                       │
   │   • Nhân bản, sao lưu                                          │
   │   • Trigger, stored procedure, view                            │
   └───────────────────────────┬────────────────────────────────────┘
                               │  "hãy lưu bản ghi này"
                               │  "hãy tìm bản ghi có khoá = 42"
                               ▼
   ┌────────────────────────────────────────────────────────────────┐
   │  DATABASE ENGINE — BỘ MÁY LƯU TRỮ                              │
   │                                                                │
   │   • Sắp xếp byte trên đĩa (page, heap, B+Tree, LSM)            │
   │   • Thêm / đọc / sửa / xoá bản ghi                             │
   │   • Quản lý bộ nhớ đệm                                         │
   │   • Khoá và điều khiển đồng thời (tuỳ engine)                  │
   │   • Transaction, WAL, phục hồi sau sự cố (tuỳ engine)          │
   └───────────────────────────┬────────────────────────────────────┘
                               ▼
                          ┌─────────┐
                          │   ĐĨA   │
                          └─────────┘
```

Cụm "tuỳ engine" ở hai dòng cuối là điểm mấu chốt: **không phải engine nào cũng có transaction**. Có engine chỉ biết lưu và lấy, không biết gì về ACID.

## Engine đơn giản nhất có thể

Về bản chất, engine chỉ cần trả lời ba câu hỏi:

```text
   put(khoá, giá_trị)   →  lưu xuống đĩa
   get(khoá)            →  đọc lên
   delete(khoá)         →  xoá đi
```

Đó là toàn bộ giao diện của **LevelDB** — một engine hoàn chỉnh, được dùng trong sản phẩm thật.

Từ ba phép toán đó, tầng DBMS xây lên mọi thứ còn lại:

```text
   ENGINE CHỈ BIẾT              DBMS XÂY LÊN
   ══════════════               ════════════
   put/get/delete               → bảng (khoá = mã bảng + khoá chính)
                                → index (khoá = giá trị cột, giá trị = khoá chính)
                                → JOIN (nhiều lần get rồi ghép)
                                → SQL (dịch câu lệnh thành chuỗi put/get)
```

Đây là lý do khái niệm engine tồn tại: **tách phần khó nhất và ít thay đổi nhất (lưu trữ) ra khỏi phần nhiều tính năng và hay đổi (SQL, mạng, quyền)**. Muốn viết một database mới thì không cần viết lại phần lưu trữ.

## Phổ năng lực của engine

```text
   ĐƠN GIẢN ─────────────────────────────────────────────▶ ĐẦY ĐỦ

   Kho khoá-giá trị      Có index      Có transaction     ACID đầy đủ
   ─────────────────     ─────────     ──────────────     + khoá ngoại
   LevelDB               MyISAM        BerkeleyDB         InnoDB
   RocksDB (cơ bản)      Aria          SQLite             WiredTiger

   Nhanh nhất                                            Nhiều đảm bảo nhất
   Ít đảm bảo nhất                                       Chậm hơn
```

Nguyên tắc quen thuộc lại xuất hiện: **mỗi đảm bảo đều có giá**. Engine hứa ít thì chạy nhanh; hứa nhiều thì phải làm thêm việc.

## Đổi được engine hay không

Đây là khác biệt kiến trúc lớn giữa các hệ:

| Hệ | Đổi engine được? | Ghi chú |
|---|---|---|
| **MySQL / MariaDB / Percona** | **Được, theo từng bảng** | InnoDB, MyISAM, MEMORY, ARCHIVE, CSV, Aria... |
| **MongoDB** | Được (lịch sử) | WiredTiger mặc định; MMAPv1 đã bỏ |
| **PostgreSQL** | **Không** | Engine gắn liền; có API bảng ngoài nhưng không phải đổi engine |
| **SQLite** | Không | Một engine duy nhất |
| **Oracle / SQL Server** | Không | Nhưng có kiểu bảng khác nhau (IOT, columnstore) |

Trong MySQL, mỗi bảng chọn engine riêng:

```sql
CREATE TABLE orders     (...) ENGINE = InnoDB;    -- can transaction
CREATE TABLE page_views (...) ENGINE = MyISAM;    -- chỉ đọc, đếm nhanh
CREATE TABLE cache_tmp  (...) ENGINE = MEMORY;    -- trong RAM, mất khi restart
CREATE TABLE audit_log  (...) ENGINE = ARCHIVE;   -- nén mạnh, chỉ nối thêm
```

Nghe rất linh hoạt. Nhưng có ba cái bẫy:

```text
   1. KHÔNG JOIN được hợp lý giữa bảng InnoDB và bảng MyISAM
      → transaction chỉ bao được phần InnoDB; phần MyISAM nằm ngoài
      → dữ liệu có thể nửa vời

   2. Sao lưu phức tạp hơn
      → mỗi engine có cách sao lưu nhất quán khác nhau

   3. Trên thực tế, gần như mọi người dùng InnoDB cho mọi thứ
      → khả năng đổi engine giá trị hơn ở LÝ THUYẾT so với thực tế
```

Điểm 3 đáng nhớ khi phỏng vấn: nói được rằng **khả năng đổi engine ít được dùng trong thực tế** cho thấy bạn có kinh nghiệm thật, không chỉ đọc tài liệu.

## Engine nhúng — không có client, không có server

Một số engine chạy **ngay trong tiến trình ứng dụng**, không qua mạng:

```text
   DATABASE CLIENT-SERVER               DATABASE NHÚNG
   ══════════════════════               ══════════════
   ┌──────────┐    TCP    ┌──────────┐  ┌────────────────────┐
   │ ỨNG DỤNG │ ────────▶ │ POSTGRES │  │   ỨNG DỤNG         │
   └──────────┘           └──────────┘  │  ┌──────────────┐  │
                                        │  │ SQLite/LevelDB│  │
   • Có độ trễ mạng                     │  │  (thư viện)  │  │
   • Nhiều tiến trình dùng chung        │  └──────┬───────┘  │
   • Phải vận hành một dịch vụ          └─────────┼──────────┘
                                                  ▼ file trên đĩa

                                        • Độ trễ ~microgiây
                                        • Chỉ một tiến trình
                                        • Không phải vận hành gì
```

Ví dụ: SQLite (điện thoại, trình duyệt, thiết bị nhúng), LevelDB/RocksDB (trong lòng các hệ lớn hơn), DuckDB (phân tích ngay trong tiến trình).

## Hai họ cấu trúc lưu trữ

Mọi engine đều thuộc một trong hai họ, và lựa chọn này quyết định gần như mọi đặc tính:

```text
   HỌ B+TREE                          HỌ LSM TREE
   ═════════                          ═══════════
   Sửa TẠI CHỖ trên đĩa               Chỉ NỐI THÊM, không sửa tại chỗ

   Ghi: tìm page → sửa → ghi lại      Ghi: vào RAM, đầy thì đổ xuống
        (ghi NGẪU NHIÊN)                   thành file bất biến
                                            (ghi TUẦN TỰ)

   Đọc: 3-4 lần I/O, ổn định          Đọc: phải tìm qua NHIỀU tầng file
   Đọc khoảng: rất nhanh (lá nối nhau) Đọc khoảng: phải trộn nhiều tầng
   Khuếch đại ghi: cao                Khuếch đại ghi: thấp hơn
   Nén: kém                           Nén: rất tốt
   Việc nền: VACUUM/purge             Việc nền: COMPACTION (nặng)

   InnoDB, MyISAM, Aria,              LevelDB, RocksDB, Cassandra,
   Postgres, Oracle, SQL Server       HBase, ScyllaDB, TiDB
```

Quy tắc chọn:

```text
   Đọc nhiều, có truy vấn khoảng   →  B+Tree
   Ghi cực nhiều, đọc theo khoá    →  LSM Tree
```

Chi tiết ở [bài 3](03-leveldb-rocksdb-va-demo.md).

## Vì sao PostgreSQL không cho đổi engine

Câu hỏi hay gặp, và câu trả lời cho thấy một triết lý thiết kế khác:

```text
   POSTGRESQL GẮN CHẶT ENGINE VÀO DBMS, VÀ ĐƯỢC:

   • MVCC được cài ngay trong tầng lưu trữ (xmin/xmax trong tuple)
     → mọi tính năng phía trên đều dựa vào đó
   • Index tuỳ biến sâu (GIN, GiST, BRIN, SP-GiST) — chỉ khả thi khi
     tầng lưu trữ và tầng truy vấn hiểu nhau
   • Kiểu dữ liệu mở rộng được (PostGIS, jsonb, vector)
   • Tối ưu vượt qua ranh giới hai tầng
```

Đánh đổi: không thể thay tầng lưu trữ bằng một cái LSM khi cần ghi thật nhiều. Đó là lý do có các dự án như **OrioleDB** và **Neon** — họ dùng API bảng tuỳ biến (từ PostgreSQL 12) để thử đưa engine khác vào, nhưng đó vẫn là công việc rất nặng.

## Vì sao khái niệm này đáng quan tâm

Ba tình huống thực tế mà hiểu về engine thay đổi quyết định của bạn:

### 1. Chọn database cho một tải cụ thể

```text
   "Ghi 500.000 bản ghi đo lường mỗi giây, đọc rất ít"
     → B+Tree sẽ vật lộn với khuếch đại ghi
     → chọn hệ dựa trên LSM (Cassandra, ScyllaDB, TimescaleDB nén)

   "Đọc rất nhiều, nhiều truy vấn khoảng, cần JOIN và transaction"
     → LSM sẽ chậm ở đọc khoảng
     → chọn hệ B+Tree (PostgreSQL, MySQL InnoDB)
```

### 2. Giải thích được hành vi khó hiểu

```text
   "Vì sao MySQL đếm COUNT(*) nhanh hơn PostgreSQL nhiều?"
     → MyISAM lưu sẵn số dòng trong metadata (nhưng InnoDB thì không)
     → PostgreSQL phải đếm thật vì MVCC: mỗi transaction thấy số dòng khác nhau

   "Vì sao Cassandra ghi nhanh kinh khủng nhưng thỉnh thoảng khựng?"
     → LSM ghi tuần tự nên rất nhanh
     → nhưng compaction chạy nền thỉnh thoảng chiếm hết I/O
```

### 3. Xây hệ thống của riêng bạn

Cần một kho khoá-giá trị bền vững trong ứng dụng? Đừng viết từ đầu — nhúng RocksDB hoặc SQLite. Chúng đã giải quyết hàng nghìn trường hợp biên mà bạn sẽ mất nhiều năm để gặp hết.

## Bảng tổng quan các engine sẽ học

| Engine | Cấu trúc | Transaction | Khoá | Học ở |
|---|---|---|---|---|
| **MyISAM** | B-Tree | Không | Bảng | [Bài 2](02-myisam-va-innodb.md) |
| **InnoDB** | B+Tree gom cụm | **Có, ACID** | Dòng | [Bài 2](02-myisam-va-innodb.md) |
| **XtraDB** | B+Tree (nhánh InnoDB) | Có | Dòng | [Bài 4](04-xtradb-sqlite-aria.md) |
| **Aria** | B-Tree (MyISAM an toàn hơn) | Không (có phục hồi sự cố) | Bảng | [Bài 4](04-xtradb-sqlite-aria.md) |
| **SQLite** | B+Tree | **Có, ACID** | File | [Bài 4](04-xtradb-sqlite-aria.md) |
| **LevelDB** | **LSM** | Không | — | [Bài 3](03-leveldb-rocksdb-va-demo.md) |
| **RocksDB** | **LSM** | Có (giới hạn) | — | [Bài 3](03-leveldb-rocksdb-va-demo.md) |
| **BerkeleyDB** | B-Tree / Hash / Queue | **Có, ACID** | Dòng/page | [Bài 5](05-berkeleydb-va-tong-ket-engines.md) |

## Bẫy thường gặp

| Bẫy | Vì sao sai | Cách nghĩ đúng |
|---|---|---|
| Gộp "database" và "engine" làm một | Chúng là hai tầng, và tầng dưới quyết định phần lớn hành vi | Hỏi "engine nào?" trước khi so sánh hai hệ |
| Nghĩ mọi engine đều có transaction | MyISAM, LevelDB thì không | Kiểm tra trước khi dựa vào ACID |
| Trộn nhiều engine trong một database | Transaction không bao được xuyên engine | Dùng một engine (InnoDB) cho mọi bảng nghiệp vụ |
| Chọn LSM cho tải nhiều truy vấn khoảng | LSM phải trộn nhiều tầng khi quét khoảng | Đối chiếu cấu trúc engine với mẫu truy vấn |
| Tự viết kho lưu trữ | Hàng nghìn trường hợp biên đã được giải | Nhúng RocksDB/SQLite |
| Nghĩ PostgreSQL "kém" vì không đổi được engine | Đó là đánh đổi có chủ đích, đổi lấy MVCC và index mở rộng | Hiểu lý do đằng sau lựa chọn |

## Tóm tắt bài 1

- **DBMS** lo SQL, mạng, quyền, tối ưu, nhân bản. **Engine** lo sắp xếp byte trên đĩa và tìm chúng lại. Ranh giới này giải thích rất nhiều hành vi khác nhau giữa các hệ.
- Engine đơn giản nhất chỉ cần **`put` / `get` / `delete`** — đó là toàn bộ giao diện của LevelDB, và DBMS xây bảng, index, JOIN, SQL lên trên đó.
- Phổ năng lực trải từ **kho khoá-giá trị** tới **ACID đầy đủ có khoá ngoại**; hứa càng nhiều thì càng chậm.
- **MySQL đổi được engine theo từng bảng**, PostgreSQL thì không — và trong thực tế gần như mọi người dùng InnoDB cho mọi thứ, nên khả năng này giá trị ở lý thuyết hơn ở thực tế.
- **Engine nhúng** (SQLite, LevelDB, DuckDB) chạy ngay trong tiến trình ứng dụng — độ trễ micro-giây, không phải vận hành dịch vụ nào.
- Hai họ cấu trúc: **B+Tree** (sửa tại chỗ, đọc nhanh và ổn định, đọc khoảng rất nhanh) và **LSM** (chỉ nối thêm, ghi cực nhanh, nén tốt, nhưng đọc phải trộn nhiều tầng và compaction nặng).
- PostgreSQL cố ý gắn chặt engine để có **MVCC trong tầng lưu trữ** và **index mở rộng được** — một đánh đổi có chủ đích.

**Bài kế tiếp** → [Bài 2: MyISAM và InnoDB](02-myisam-va-innodb.md)

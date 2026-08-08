# Bài 4: XtraDB, SQLite và Aria — ba engine ít nói tới nhưng đáng biết

Ba engine trong bài này ít xuất hiện trong các cuộc thảo luận về "database nào tốt nhất", nhưng một trong số chúng có lẽ đang chạy trên chính chiếc điện thoại bạn cầm — **SQLite là engine database được triển khai nhiều nhất trên thế giới**, với ước tính hơn một nghìn tỷ bản đang hoạt động.

---

# XtraDB — nhánh InnoDB của Percona

## Vì sao nó ra đời

Năm 2008 Sun mua MySQL; năm 2010 Oracle mua Sun. Cộng đồng lo ngại Oracle sẽ để MySQL chết dần để bảo vệ sản phẩm chính của họ. Kết quả là hàng loạt nhánh ra đời — MariaDB, Percona Server — và XtraDB là engine của Percona.

**XtraDB là nhánh của InnoDB**, giữ nguyên **100% tương thích** nhưng tối ưu cho máy chủ nhiều lõi và tải cao.

## Nó cải thiện gì

| Lĩnh vực | Cải thiện |
|---|---|
| **Buffer pool** | Chia thành nhiều phần độc lập → giảm tranh chấp khoá nội bộ |
| **Thống kê** | Nhiều chỉ số chi tiết hơn cho việc chẩn đoán |
| **Đọc trước** | Thuật toán đọc trước thông minh hơn |
| **Undo log** | Dọn dẹp bằng nhiều luồng |
| **Điều chỉnh** | Nhiều tham số hơn để tinh chỉnh |

```sql
-- Tương thích hoàn toàn: cú pháp này vẫn chạy
CREATE TABLE t (id INT PRIMARY KEY) ENGINE = InnoDB;
-- Trên Percona Server, MySQL tự dùng XtraDB
```

Cú pháp không đổi, ứng dụng không cần biết. Đó là toàn bộ ý đồ thiết kế.

## Tình trạng hiện nay

```text
   MariaDB 10.1-10.3:  XtraDB là engine mặc định
   MariaDB 10.4+    :  QUAY VỀ InnoDB
   Percona Server 8.0: Bỏ XtraDB, dùng InnoDB của MySQL 8

   Lý do: MySQL 8 đã tiếp thu phần lớn cải tiến của XtraDB.
          Duy trì một nhánh riêng không còn đáng công nữa.
```

Bài học rút ra vượt ra ngoài chuyện engine:

> **Cạnh tranh giữa các nhánh làm sản phẩm gốc tốt lên.** XtraDB đã hoàn thành sứ mệnh của nó — không phải bằng cách chiến thắng, mà bằng cách buộc InnoDB phải cải thiện.

Với người dùng hôm nay: **không cần quan tâm tới XtraDB nữa**. Dùng InnoDB.

---

# SQLite — database phổ biến nhất thế giới

## Nó khác mọi thứ khác ở đâu

```text
   DATABASE THÔNG THƯỜNG               SQLITE
   ═════════════════════               ══════
   Một tiến trình máy chủ              KHÔNG có tiến trình nào cả
   Giao tiếp qua mạng                  Chỉ là một THƯ VIỆN bạn nhúng vào
   Phải cài đặt, cấu hình, vận hành    Một file .c, không phụ thuộc gì
   Dữ liệu ở nhiều file                Toàn bộ database = MỘT FILE
   Người dùng, quyền, vai trò          Không có — quyền là quyền của FILE
```

Nó đang chạy ở:

```text
   • Mọi điện thoại Android và iOS (danh bạ, tin nhắn, ứng dụng)
   • Mọi trình duyệt (lịch sử, cookie, IndexedDB)
   • macOS, Windows 10+ (nhiều thành phần hệ thống)
   • Ô tô, TV, thiết bị y tế, máy bay (Airbus dùng trong hệ thống bay)
   • Định dạng file của nhiều phần mềm (thay cho định dạng tự chế)
```

## Kiến trúc

```text
   ┌─────────────────────────────────────────┐
   │   ỨNG DỤNG CỦA BẠN                      │
   │  ┌───────────────────────────────────┐  │
   │  │  Thư viện SQLite (~700 KB)        │  │
   │  │   • Bộ phân tích SQL              │  │
   │  │   • Máy ảo bytecode (VDBE)        │  │
   │  │   • B+Tree engine                 │  │
   │  │   • Pager (bộ nhớ đệm + khoá)     │  │
   │  └────────────────┬──────────────────┘  │
   └───────────────────┼─────────────────────┘
                       ▼
              ┌─────────────────┐
              │  app.db         │  ← MỘT FILE
              │  app.db-wal     │  ← WAL (nếu bật chế độ WAL)
              └─────────────────┘
```

Điểm thú vị: SQLite biên dịch SQL thành **bytecode** rồi chạy trên một máy ảo riêng. Xem được:

```sql
EXPLAIN SELECT * FROM users WHERE id = 5;
```

```text
addr  opcode         p1    p2    p3    p4
----  -------------  ----  ----  ----  --------------
0     Init           0     7     0
1     OpenRead       0     2     0     3
2     Integer        5     1     0
3     SeekRowid      0     6     1
4     Copy           1     2     0
5     ResultRow      2     3     0
6     Halt           0     0     0
```

## Mô hình khoá — điểm mạnh và điểm yếu

```text
   CHẾ ĐỘ MẶC ĐỊNH (rollback journal)
     Một người GHI → khoá TOÀN BỘ FILE
     → mọi người đọc bị chặn trong lúc đó

   CHẾ ĐỘ WAL (nên bật)
     PRAGMA journal_mode = WAL;
     → người ĐỌC không chặn người GHI
     → người GHI không chặn người ĐỌC
     → nhưng VẪN CHỈ MỘT người ghi tại một thời điểm
```

```text
   → SQLite phù hợp: nhiều người đọc, MỘT người ghi
   → SQLite không phù hợp: nhiều người ghi đồng thời
```

Đây là ranh giới quyết định khi nào nên dùng nó.

## Cấu hình nên dùng cho sản phẩm thật

```sql
PRAGMA journal_mode = WAL;        -- đọc và ghi không chặn nhau
PRAGMA synchronous  = NORMAL;     -- cân bằng bền vững/tốc độ ở chế độ WAL
PRAGMA foreign_keys = ON;         -- MẶC ĐỊNH LÀ TẮT!  ← rất hay bị quên
PRAGMA busy_timeout = 5000;       -- chờ 5 giây thay vì báo lỗi ngay
PRAGMA cache_size   = -64000;     -- 64 MB bộ nhớ đệm (số âm = KB)
PRAGMA temp_store   = MEMORY;
```

Dòng `foreign_keys = ON` là cái bẫy lớn nhất của SQLite: **khoá ngoại mặc định bị TẮT** vì lý do tương thích ngược. Bạn khai báo `REFERENCES` và SQLite chấp nhận cú pháp, nhưng **không thực thi gì cả** — cho tới khi bạn bật.

Và `busy_timeout` giải quyết lỗi phổ biến nhất khi dùng SQLite:

```text
   SQLITE_BUSY: database is locked
```

Mặc định SQLite báo lỗi ngay khi không lấy được khoá. Đặt `busy_timeout` khiến nó chờ và thử lại.

## Kiểu dữ liệu linh hoạt — bất ngờ khó chịu

```sql
CREATE TABLE t (id INTEGER, name TEXT);
INSERT INTO t VALUES ('day khong phai so', 12345);
SELECT * FROM t;
```

```text
id                  name
------------------  -----
day khong phai so   12345
```

SQLite **chấp nhận**. Kiểu cột chỉ là "gợi ý ưu tiên", không phải ràng buộc.

Từ phiên bản **3.37 (2021)** có thể bật kiểm tra nghiêm ngặt:

```sql
CREATE TABLE t (id INTEGER, name TEXT) STRICT;
INSERT INTO t VALUES ('abc', 123);
```

```text
Error: cannot store TEXT value in INTEGER column t.id
```

Nên luôn dùng `STRICT` cho bảng mới.

## Khi nào dùng, khi nào không

| Dùng SQLite | Không dùng SQLite |
|---|---|
| Ứng dụng di động, để bàn | Ứng dụng web nhiều người ghi đồng thời |
| Thiết bị nhúng, IoT | Cần truy cập từ nhiều máy |
| Cache cục bộ | Dữ liệu vượt vài trăm GB |
| Định dạng file của phần mềm | Cần phân quyền theo người dùng |
| Kiểm thử tự động | Cần nhân bản, sẵn sàng cao |
| Website đọc nhiều, ghi ít | Ghi trên 100 giao dịch/giây liên tục |

Dòng cuối cùng bên trái đáng chú ý: **rất nhiều website nhỏ chạy SQLite hoàn toàn ổn**. Với tải đọc là chính, một file SQLite trên SSD phục vụ được hàng nghìn lượt đọc mỗi giây. Đừng mặc định là cần PostgreSQL.

---

# Aria — MyISAM có phục hồi sau sự cố

## Vì sao MariaDB tạo ra nó

Nhắc lại vấn đề của MyISAM ([bài 2](02-myisam-va-innodb.md)): **mất điện làm hỏng bảng, phải `REPAIR TABLE` bằng tay, và có thể mất dữ liệu**.

Aria giải quyết đúng chuyện đó, giữ nguyên mọi thứ khác.

```text
   MyISAM  +  ghi nhật ký để phục hồi  =  Aria
```

## Nó thêm gì

| Tính năng | MyISAM | Aria |
|---|---|---|
| Phục hồi sau sự cố | Không — `REPAIR` tay | **Có, tự động** |
| Transaction | Không | Không (nhưng có lệnh đơn nguyên tử) |
| Mức khoá | Bảng | Bảng |
| Bộ nhớ đệm dữ liệu | Không (chỉ index) | **Có** |
| `COUNT(*)` nhanh | Có | **Có** |
| Định dạng dòng | Cố định / động | Thêm định dạng **PAGE** (an toàn hơn) |

Định dạng `PAGE` là chỗ tạo ra khác biệt: dữ liệu được tổ chức theo trang cố định giống InnoDB, cho phép ghi nhật ký và phục hồi.

```sql
CREATE TABLE t (id INT PRIMARY KEY, val TEXT)
  ENGINE = Aria
  TRANSACTIONAL = 1;              -- bật ghi nhật ký phục hồi
```

## Vai trò thật của Aria trong MariaDB

Điều ít người biết: **MariaDB dùng Aria cho các bảng hệ thống và bảng tạm bên trong**.

```text
   Trước: bảng tạm nội bộ dùng MyISAM
          → truy vấn có GROUP BY/ORDER BY lớn tạo bảng tạm
          → mất điện giữa chừng → bảng tạm hỏng

   Sau  : dùng Aria
          → an toàn hơn, và nhanh hơn nhờ có bộ nhớ đệm dữ liệu
```

Nghĩa là ngay cả khi bạn không bao giờ khai `ENGINE = Aria`, nó vẫn đang chạy trong mọi truy vấn phức tạp của bạn trên MariaDB.

## Khi nào dùng

```text
   ✔ Bảng tra cứu chỉ đọc, cần COUNT(*) tức thì
   ✔ Đang dùng MyISAM trên MariaDB → đổi sang Aria, gần như không mất gì
   ✔ Bảng tạm, bảng trung gian trong quy trình ETL

   ✘ Cần transaction → InnoDB
   ✘ Nhiều người ghi đồng thời → InnoDB (Aria vẫn khoá mức bảng)
```

Quy tắc gọn: **trên MariaDB, không bao giờ có lý do để chọn MyISAM thay vì Aria.**

---

## Bảng đối chiếu ba engine

| | XtraDB | SQLite | Aria |
|---|---|---|---|
| Cấu trúc | B+Tree gom cụm | B+Tree | B-Tree |
| Transaction | **Có, ACID** | **Có, ACID** | Không (có phục hồi) |
| Mức khoá | Dòng | **File** | Bảng |
| Kiến trúc | Client-server | **Nhúng** | Client-server |
| Nơi dùng | Percona, MariaDB (cũ) | Khắp mọi nơi | MariaDB |
| Tình trạng | **Đã ngừng** — dùng InnoDB | Rất sống động | Sống động trong MariaDB |
| Nên dùng khi | Không còn lý do | Ứng dụng nhúng, đọc nhiều ghi ít | Thay MyISAM trên MariaDB |

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách tránh |
|---|---|---|
| Quên `PRAGMA foreign_keys = ON` trong SQLite | Khoá ngoại **không được thực thi** — dữ liệu mồ côi âm thầm | Bật ở **mỗi kết nối** (không lưu vào file) |
| Không bật chế độ WAL trong SQLite | Người đọc và người ghi chặn nhau | `PRAGMA journal_mode = WAL` (lưu vĩnh viễn) |
| Không đặt `busy_timeout` | Lỗi `database is locked` liên tục | `PRAGMA busy_timeout = 5000` |
| Dùng SQLite cho web nhiều người ghi | Chỉ một người ghi tại một thời điểm | PostgreSQL/MySQL cho tải ghi đồng thời |
| Dựa vào kiểu cột SQLite để kiểm tra dữ liệu | Kiểu chỉ là gợi ý; chuỗi lọt vào cột số | Dùng `STRICT` cho mọi bảng mới |
| Vẫn tìm cách cài XtraDB | Đã ngừng phát triển | Dùng InnoDB của MySQL 8 |
| Dùng MyISAM trên MariaDB | Aria có mọi thứ MyISAM có, cộng phục hồi sự cố | `ALTER TABLE ... ENGINE = Aria` |
| Nghĩ Aria có transaction | `TRANSACTIONAL = 1` chỉ bật **ghi nhật ký phục hồi** | Cần transaction thì dùng InnoDB |

## Tóm tắt bài 4

- **XtraDB** là nhánh InnoDB của Percona, sinh ra từ lo ngại sau khi Oracle mua MySQL. Nó đã **hoàn thành sứ mệnh** — MySQL 8 tiếp thu phần lớn cải tiến, và XtraDB nay đã ngừng. Bài học: **cạnh tranh giữa các nhánh làm sản phẩm gốc tốt lên.**
- **SQLite là engine được triển khai nhiều nhất thế giới** — mọi điện thoại, mọi trình duyệt, rất nhiều thiết bị nhúng. Nó không có tiến trình máy chủ, chỉ là một thư viện và **một file**.
- Mô hình khoá của SQLite: **nhiều người đọc, một người ghi**. Chế độ WAL giúp đọc và ghi không chặn nhau, nhưng vẫn chỉ một người ghi.
- Cái bẫy lớn nhất của SQLite: **khoá ngoại mặc định TẮT**, và phải bật lại ở **mỗi kết nối**. Cái bẫy thứ hai: **kiểu cột chỉ là gợi ý** — dùng `STRICT`.
- Rất nhiều website đọc nhiều ghi ít chạy SQLite hoàn toàn ổn. Đừng mặc định là cần PostgreSQL.
- **Aria = MyISAM + phục hồi sau sự cố.** Nó cũng thêm bộ nhớ đệm cho dữ liệu (MyISAM chỉ cache index). Trên MariaDB nó chạy ngầm trong mọi bảng tạm nội bộ.
- Quy tắc gọn: **trên MariaDB không bao giờ có lý do chọn MyISAM thay vì Aria.**

**Bài kế tiếp** → [Bài 5: BerkeleyDB, tổng quan Engines phổ biến và chuyển đổi Engine](05-berkeleydb-va-tong-ket-engines.md)

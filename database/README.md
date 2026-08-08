# Database — đi xuống dưới lớp SQL

> Database **thật sự** lưu và tìm dữ liệu thế nào.

Khoá về **nội tại database engine**: page và I/O, B-Tree và B+Tree, indexing, ACID, partitioning, sharding, locking, replication, các storage engine (InnoDB, RocksDB, LevelDB…), cursor, bảo mật kết nối, và cả homomorphic encryption. Xen kẽ là các phiên hỏi đáp và bài system design.

**56 bài** trong 18 phần. Mỗi bài có mô hình tư duy, diễn giải trên dữ liệu thật, con số đo được, bảng bẫy thường gặp và tóm tắt.

## Mục lục

### Phase 1 — Nhập môn và từ vựng

| Bài | Nội dung |
|---|---|
| [00](phase-1/00-tu-dien-thuat-ngu-database-cho-nguoi-moi.md) | Từ điển thuật ngữ Database cho người mới |
| [01](phase-1/01-gioi-thieu-khoa-hoc.md) | Vì sao phải đi xuống dưới lớp SQL |
| [02](phase-1/02-lo-trinh-hoc-database.md) | Lộ trình học Database Engineering |

### Phase 2 — ACID

| Bài | Nội dung |
|---|---|
| [01](phase-2/01-acid-va-transaction.md) | ACID và Transaction — 100 nghìn đồng bốc hơi thế nào |
| [02](phase-2/02-atomicity-va-durability.md) | Atomicity và Durability — cỗ máy chống mất dữ liệu |
| [03](phase-2/03-isolation-va-read-phenomena.md) | Isolation và bốn hiện tượng đọc bất thường |
| [04](phase-2/04-consistency-va-eventual-consistency.md) | Consistency — hai loại nhất quán mà ai cũng nhầm thành một |
| [05](phase-2/05-acid-thuc-hanh-voi-postgres.md) | ACID thực hành — nhìn thấy bốn chữ cái bằng mắt |

### Phase 3 — Lưu trữ trên đĩa

| Bài | Nội dung |
|---|---|
| [01](phase-3/01-page-heap-va-io.md) | Page, Heap và I/O — đổi đơn vị suy nghĩ từ "dòng" sang "trang" |
| [02](phase-3/02-row-based-vs-column-based.md) | Row-Based vs Column-Based — cùng một bảng, hai cách xếp byte |
| [03](phase-3/03-primary-key-vs-secondary-key.md) | Primary Key vs Secondary Key — điều bạn chưa biết về hai chữ "khoá chính" |

### Phase 4 — Indexing

| Bài | Nội dung |
|---|---|
| [01](phase-4/01-co-ban-ve-indexing.md) | Cơ bản về Indexing — từ 3 giây xuống 0,1 mili-giây |
| [02](phase-4/02-index-scan-va-covering-index.md) | Index Scan, Index Only Scan và Bitmap Scan |
| [03](phase-4/03-composite-index-va-optimizer.md) | Composite Index và Optimizer — vì sao index `(a, b)` vô dụng với `WHERE b = ?` |
| [04](phase-4/04-bloom-filter-va-uuid-performance.md) | Bloom Filter và cái giá của UUID trong B+Tree |
| [05](phase-4/05-create-index-concurrently-va-best-practices.md) | `CREATE INDEX CONCURRENTLY` và quy trình đánh index an toàn |

### Phase 5 — B-Tree và B+Tree

| Bài | Nội dung |
|---|---|
| [01](phase-5/01-btree-co-ban.md) | B-Tree — vì sao tìm 1 dòng trong 1 tỷ dòng chỉ tốn 4 lần đọc |
| [02](phase-5/02-btree-plus-va-ung-dung-thuc-te.md) | B+Tree — một thay đổi nhỏ sửa được cả ba hạn chế |

### Phase 6 — Partitioning

| Bài | Nội dung |
|---|---|
| [01](phase-6/01-database-partitioning-la-gi.md) | Database Partitioning — xoá 200 triệu dòng trong 40 mili-giây |
| [02](phase-6/02-partitioning-thuc-hanh-postgres.md) | Partitioning thực hành với PostgreSQL |

### Phase 7 — Sharding

| Bài | Nội dung |
|---|---|
| [01](phase-7/01-database-sharding-la-gi.md) | Database Sharding — chia dữ liệu ra nhiều máy và mất những gì |
| [02](phase-7/02-sharding-thuc-hanh-nodejs-postgres.md) | Sharding thực hành — dựng 3 shard bằng Docker và Node.js |
| [03](phase-7/03-pros-cons-va-khi-nao-dung-sharding.md) | Khi nào thật sự nên shard — và chín việc nên làm trước |

### Phase 8 — Concurrency Control

| Bài | Nội dung |
|---|---|
| [01](phase-8/01-shared-lock-va-exclusive-lock.md) | Shared Lock, Exclusive Lock và Deadlock |
| [02](phase-8/02-double-booking-va-pagination.md) | Double Booking và Pagination — hai bài toán kinh điển |
| [03](phase-8/03-connection-pooling.md) | Connection Pooling — vì sao ít kết nối lại nhanh hơn nhiều kết nối |

### Phase 9 — Replication

| Bài | Nội dung |
|---|---|
| [01](phase-9/01-database-replication-la-gi.md) | Database Replication — nhân bản dữ liệu và cái giá của độ trễ |
| [02](phase-9/02-replication-demo-postgres.md) | Demo Replication với PostgreSQL — dựng, đo, và chuyển đổi |

### Phase 10 — System Design

| Bài | Nội dung |
|---|---|
| [01](phase-10/01-system-design-twitter-database.md) | Thiết kế database cho Twitter |
| [02](phase-10/02-system-design-url-shortener.md) | URL Shortener |

### Phase 11 — Database Engines

| Bài | Nội dung |
|---|---|
| [01](phase-11/01-database-engine-la-gi.md) | Database Engine là gì — lớp thư viện dưới đáy |
| [02](phase-11/02-myisam-va-innodb.md) | MyISAM và InnoDB — hai engine, hai thế giới |
| [03](phase-11/03-leveldb-rocksdb-va-demo.md) | LevelDB, RocksDB và LSM Tree — engine cho tải ghi cực nặng |
| [04](phase-11/04-xtradb-sqlite-aria.md) | XtraDB, SQLite và Aria — ba engine ít nói tới nhưng đáng biết |
| [05](phase-11/05-berkeleydb-va-tong-ket-engines.md) | BerkeleyDB, tổng kết Engines và chuyển đổi Engine |

### Phase 12 — Cursors

| Bài | Nội dung |
|---|---|
| [01](phase-12/01-database-cursors.md) | Database Cursors — xử lý 100 triệu dòng mà không nổ RAM |
| [02](phase-12/02-cursor-nang-cao-va-use-cases.md) | Cursor nâng cao — bốn mẫu thực chiến |

### Phase 13 — NoSQL

| Bài | Nội dung |
|---|---|
| [01](phase-13/01-nosql-vs-sql-va-mongodb.md) | NoSQL vs SQL và kiến trúc MongoDB |
| [02](phase-13/02-memcached-architecture.md) | Kiến trúc Memcached — sự đơn giản có chủ đích |
| [03](phase-13/03-redis-va-cap-theorem.md) | Redis Internals và định lý CAP |

### Phase 14 — Bảo mật

| Bài | Nội dung |
|---|---|
| [01](phase-14/01-bao-mat-ket-noi-database-tls.md) | Bảo mật kết nối Database với TLS/SSL |
| [02](phase-14/02-database-permissions-va-best-practices.md) | Database Permissions — lớp phòng thủ cuối cùng |

### Phase 15 — Homomorphic Encryption

| Bài | Nội dung |
|---|---|
| [01](phase-15/01-homomorphic-encryption.md) | Truy vấn trên dữ liệu đã mã hoá |
| [02](phase-15/02-homomorphic-encryption-demo-va-code.md) | Demo, đo đạc và giới hạn thật |

### Phase 16 — Hỏi & Đáp

| Bài | Nội dung |
|---|---|
| [01](phase-16/01-hoi-dap-indexing-va-query-planning.md) | Indexing và Query Planning |
| [02](phase-16/02-hoi-dap-transactions-connections-va-misc.md) | Transactions, Connections và Isolation |
| [03](phase-16/03-hoi-dap-database-internals.md) | Database Internals và Best Practices |

### Phase 17 — Thảo luận sâu

| Bài | Nội dung |
|---|---|
| [01](phase-17/01-wal-redo-undo-logs.md) | WAL, Redo và Undo Logs — nền tảng của Durability |
| [02](phase-17/01-luu-tru-du-lieu-va-kien-truc-postgres.md) | Lưu trữ dữ liệu trên đĩa và kiến trúc PostgreSQL |
| [03](phase-17/02-thao-luan-uuid-pk-va-postgres-vs-mysql.md) | UUID làm Primary Key, và câu chuyện Uber |
| [04](phase-17/03-quic-va-distributed-transaction.md) | QUIC cho Database và Distributed Transaction |
| [05](phase-17/04-hash-tables-va-consistent-hashing.md) | Hash Tables và Consistent Hashing |
| [06](phase-17/05-indexing-postgres-vs-mysql.md) | Indexing — PostgreSQL vs MySQL InnoDB |
| [07](phase-17/06-nulls-va-write-amplification.md) | NULL và Write Amplification |
| [08](phase-17/07-concurrency-control-va-innodb-locking.md) | Optimistic vs Pessimistic và InnoDB Locking nâng cao |

### Phase 18 — Tổng kết

| Bài | Nội dung |
|---|---|
| [01](phase-18/01-acid-review-va-implementation-details.md) | ACID — Ôn tập và chi tiết triển khai |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Mới, chưa quen thuật ngữ | [phase-1 bài 0](phase-1/00-tu-dien-thuat-ngu-database-cho-nguoi-moi.md) — riêng phần *"Đường đi của một câu SELECT"* |
| Hệ thống đang chậm, cần chữa ngay | phase-3 bài 1 → phase-4 bài 1-3 → phase-8 bài 3 |
| Muốn hiểu vì sao index nhanh | phase-3 → phase-4 → phase-5 |
| Chuẩn bị phỏng vấn database | phase-2 (ACID) → phase-4 (index) → phase-8 (lock) → phase-16 (hỏi đáp) |
| Đang scale database | phase-7 bài 3 (thang 9 nấc) → phase-6 → phase-9 |
| Tò mò về engine internals | phase-11 và phase-17 |
| Muốn ôn nhanh toàn bộ | [phase-18](phase-18/01-acid-review-va-implementation-details.md) — phần *"Ba mươi giây tổng kết"* |

## Sáu điều đáng mang theo

1. **Database đếm page, không đếm dòng.** Mọi câu hỏi hiệu năng quy về "phải đọc bao nhiêu page?"
2. **Index là bản sao đã sắp xếp — và nó có giá.** Chỉ đáng khi lọc ra dưới ~10% số dòng.
3. **Mọi đảm bảo đều có nút vặn**, và vặn được theo từng transaction.
4. **Tranh chấp giải bằng thứ tự, không bằng số lượng.** Deadlock sinh từ thứ tự khoá khác nhau.
5. **Mỗi đặc tính kiến trúc là một đánh đổi** — không cái nào "tốt hơn", chỉ có "hợp hơn với tải của bạn".
6. **Leo hết chín nấc thang trước khi nghĩ tới sharding.** Chín nấc đầu quay đầu được; nấc thứ mười thì không.

## Khoá liên quan

| Khoá | Quan hệ |
|---|---|
| [sql-interview](../sql-interview/README.md) | Tầng trên: **viết** SQL cho đúng và nhanh |
| [database-su-co-va-phong-van](../database-su-co-va-phong-van/README.md) | Cùng tầng, khác góc: đi từ **sự cố thật** ngược về nguyên nhân |
| [orm-n-plus-1](../orm-n-plus-1/README.md) | Áp dụng: vì sao ORM sinh N+1 và mỗi query thừa tốn bao nhiêu page |
| [backend-scaling-cases](../backend-scaling-cases/README.md) | Áp dụng ở tầng hệ thống: pool, khoá, hàng đợi |
| [redis](../redis/README.md) | Đối chiếu: hệ lưu trữ **trong RAM** đánh đổi khác hẳn |

---

> **Đối chiếu nguồn:** bảng ánh xạ đầy đủ **153 file transcript → 56 bài học** nằm ở [DOI-CHIEU-TRANSCRIPT.md](DOI-CHIEU-TRANSCRIPT.md), kèm danh sách phần cố ý bỏ và phần bổ sung ngoài transcript.

*Nội dung tham chiếu transcript `transcripts/database-engines-crash-course`, được kiểm chứng lại và bổ sung chiều sâu, con số đo được, và các trường hợp thực tế.*

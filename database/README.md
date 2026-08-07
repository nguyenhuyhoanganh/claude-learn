# Database

> Đi xuống dưới lớp SQL: database **thật sự** lưu và tìm dữ liệu thế nào.

Khoá về **nội tại database engine**: ACID và từng thuộc tính, page/heap/IO, B-Tree và B+Tree, indexing, partitioning, sharding, locking, replication, các storage engine (InnoDB, RocksDB, LevelDB…), cursor, bảo mật kết nối, và cả homomorphic encryption. Xen kẽ là các phiên hỏi đáp và bài system design.

**55 bài** trong 18 phần.

## Mục lục

### Phase 1

| Bài | Nội dung |
|---|---|
| [00](phase-1/00-tu-dien-thuat-ngu-database-cho-nguoi-moi.md) | Bài 0: Từ điển thuật ngữ Database cho người mới |
| [01](phase-1/01-gioi-thieu-khoa-hoc.md) | Bài 1: Vì sao phải đi xuống dưới lớp SQL |
| [02](phase-1/02-lo-trinh-hoc-database.md) | Bài 2: Lộ trình học Database Engineering |

### Phase 2

| Bài | Nội dung |
|---|---|
| [01](phase-2/01-acid-va-transaction.md) | Bài 1: ACID và Transaction — 100 nghìn đồng bốc hơi thế nào |
| [02](phase-2/02-atomicity-va-durability.md) | Bài 2: Atomicity và Durability — cỗ máy chống mất dữ liệu |
| [03](phase-2/03-isolation-va-read-phenomena.md) | Bài 3: Isolation và bốn hiện tượng đọc bất thường |
| [04](phase-2/04-consistency-va-eventual-consistency.md) | Bài 4: Consistency — hai loại nhất quán mà ai cũng nhầm thành một |
| [05](phase-2/05-acid-thuc-hanh-voi-postgres.md) | Bài 5: ACID thực hành — nhìn thấy bốn chữ cái bằng mắt |

### Phase 3

| Bài | Nội dung |
|---|---|
| [01](phase-3/01-page-heap-va-io.md) | Bài 1: Page, Heap và I/O - Cách Database lưu trữ dữ liệu |
| [02](phase-3/02-row-based-vs-column-based.md) | Bài 2: Row-Based vs Column-Based Databases |
| [03](phase-3/03-primary-key-vs-secondary-key.md) | Bài 3: Primary Key vs Secondary Key - Điều bạn có thể chưa biết |

### Phase 4

| Bài | Nội dung |
|---|---|
| [01](phase-4/01-co-ban-ve-indexing.md) | Bài 1: Cơ bản về Database Indexing |
| [02](phase-4/02-index-scan-va-covering-index.md) | Bài 2: Index Scan vs Index Only Scan và Covering Index |
| [03](phase-4/03-composite-index-va-optimizer.md) | Bài 3: Composite Index và Database Optimizer |
| [04](phase-4/04-bloom-filter-va-uuid-performance.md) | Bài 4: Bloom Filters và UUID Performance |
| [05](phase-4/05-create-index-concurrently-va-best-practices.md) | Bài 5: Create Index Concurrently và Best Practices |

### Phase 5

| Bài | Nội dung |
|---|---|
| [01](phase-5/01-btree-co-ban.md) | Bài 1: B-Tree - Cấu trúc dữ liệu nền tảng của Database Index |
| [02](phase-5/02-btree-plus-va-ung-dung-thuc-te.md) | Bài 2: B+Tree và Ứng dụng trong Database Systems |

### Phase 6

| Bài | Nội dung |
|---|---|
| [01](phase-6/01-database-partitioning-la-gi.md) | Bài 1: Database Partitioning là gì? |
| [02](phase-6/02-partitioning-thuc-hanh-postgres.md) | Bài 2: Partitioning Thực hành với PostgreSQL |

### Phase 7

| Bài | Nội dung |
|---|---|
| [01](phase-7/01-database-sharding-la-gi.md) | Bài 1: Database Sharding là gì? |
| [02](phase-7/02-sharding-thuc-hanh-nodejs-postgres.md) | Bài 2: Sharding Thực hành với Node.js và PostgreSQL |
| [03](phase-7/03-pros-cons-va-khi-nao-dung-sharding.md) | Bài 3: Ưu Nhược Điểm và Khi Nào Dùng Sharding |

### Phase 8

| Bài | Nội dung |
|---|---|
| [01](phase-8/01-shared-lock-va-exclusive-lock.md) | Bài 1: Shared Lock và Exclusive Lock |
| [02](phase-8/02-double-booking-va-pagination.md) | Bài 2: Giải quyết Double Booking và Pagination |
| [03](phase-8/03-connection-pooling.md) | Bài 3: Database Connection Pooling |

### Phase 9

| Bài | Nội dung |
|---|---|
| [01](phase-9/01-database-replication-la-gi.md) | Bài 1: Database Replication là gì? |
| [02](phase-9/02-replication-demo-postgres.md) | Bài 2: Demo Replication với PostgreSQL 13 |

### Phase 10

| Bài | Nội dung |
|---|---|
| [01](phase-10/01-system-design-twitter-database.md) | Bài 1: System Design - Database Design cho Twitter |
| [02](phase-10/02-system-design-url-shortener.md) | Bài 2: System Design - URL Shortener |

### Phase 11

| Bài | Nội dung |
|---|---|
| [01](phase-11/01-database-engine-la-gi.md) | Bài 1: Database Engine là gì? |
| [02](phase-11/02-myisam-va-innodb.md) | Bài 2: MyISAM, InnoDB và các B-Tree Engines |
| [03](phase-11/03-leveldb-rocksdb-va-demo.md) | Bài 3: LevelDB, RocksDB và Demo Đổi Engine MySQL |
| [04](phase-11/04-xtradb-sqlite-aria.md) | Bài 3: XtraDB, SQLite và Aria - Các Storage Engine Thay Thế |
| [05](phase-11/05-berkeleydb-va-tong-ket-engines.md) | Bài 5: BerkeleyDB, Tổng Quan Engines Phổ Biến và Chuyển Đổi Engine |

### Phase 12

| Bài | Nội dung |
|---|---|
| [01](phase-12/01-database-cursors.md) | Bài 1: Database Cursors |
| [02](phase-12/02-cursor-nang-cao-va-use-cases.md) | Bài 2: Cursor Nâng Cao - Patterns và Thực Chiến |

### Phase 13

| Bài | Nội dung |
|---|---|
| [01](phase-13/01-nosql-vs-sql-va-mongodb.md) | Bài 1: NoSQL vs SQL và Kiến trúc MongoDB |
| [02](phase-13/02-memcached-architecture.md) | Bài 2: Kiến trúc Memcached |
| [03](phase-13/03-redis-va-cap-theorem.md) | Bài 3: Redis Internals và CAP Theorem |

### Phase 14

| Bài | Nội dung |
|---|---|
| [01](phase-14/01-bao-mat-ket-noi-database-tls.md) | Bài 1: Bảo Mật Kết Nối Database với TLS/SSL |
| [02](phase-14/02-database-permissions-va-best-practices.md) | Bài 2: Database Permissions và Best Practices cho REST API |

### Phase 15

| Bài | Nội dung |
|---|---|
| [01](phase-15/01-homomorphic-encryption.md) | Bài 1: Homomorphic Encryption - Mã Hóa Đồng Cấu |
| [02](phase-15/02-homomorphic-encryption-demo-va-code.md) | Bài 2: Homomorphic Encryption - Demo và Phân Tích Code |

### Phase 16

| Bài | Nội dung |
|---|---|
| [01](phase-16/01-hoi-dap-indexing-va-query-planning.md) | Bài 1: Hỏi & Đáp - Indexing và Query Planning |
| [02](phase-16/02-hoi-dap-transactions-connections-va-misc.md) | Bài 2: Hỏi & Đáp - Transactions, Connections và Miscellaneous |
| [03](phase-16/03-hoi-dap-database-internals.md) | Bài 3: Hỏi Đáp - Database Internals và Best Practices |

### Phase 17

| Bài | Nội dung |
|---|---|
| [01](phase-17/01-luu-tru-du-lieu-va-kien-truc-postgres.md) | Bài 1: Lưu Trữ Dữ Liệu trên Disk và Kiến Trúc PostgreSQL |
| [01](phase-17/01-wal-redo-undo-logs.md) | Bài 1: WAL, Redo và Undo Logs - Nền Tảng của Durability |
| [02](phase-17/02-thao-luan-uuid-pk-va-postgres-vs-mysql.md) | Bài 2: Thảo Luận - UUID làm Primary Key và PostgreSQL vs MySQL |
| [03](phase-17/03-quic-va-distributed-transaction.md) | Bài 3: QUIC Protocol cho Database và Distributed Transaction |
| [04](phase-17/04-hash-tables-va-consistent-hashing.md) | Bài 4: Hash Tables và Consistent Hashing |
| [05](phase-17/05-indexing-postgres-vs-mysql.md) | Bài 5: Indexing - PostgreSQL vs MySQL (InnoDB) |
| [06](phase-17/06-nulls-va-write-amplification.md) | Bài 6: NULLs trong Database và Write Amplification |
| [07](phase-17/07-concurrency-control-va-innodb-locking.md) | Bài 7: Optimistic vs Pessimistic Concurrency Control và MySQL InnoDB Locking |

### Phase 18

| Bài | Nội dung |
|---|---|
| [01](phase-18/01-acid-review-va-implementation-details.md) | Phase 18: ACID - Ôn Tập và Chi Tiết Triển Khai |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Muốn hiểu vì sao index nhanh | phase-3 → phase-4 → phase-5 |
| Chuẩn bị phỏng vấn database | phase-2 (ACID), phase-8 (locking), phase-16 (hỏi đáp) |
| Đang scale database | phase-6 (partitioning), phase-7 (sharding), phase-9 (replication) |
| Tò mò về engine internals | phase-11 và phase-17 |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*

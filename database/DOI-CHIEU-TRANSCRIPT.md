# Bảng đối chiếu transcript → bài học

Tài liệu này ánh xạ **từng file** trong `transcripts/database-engines-crash-course/` (153 file `.txt`, 18 section) sang bài học tương ứng trong `database/` (56 bài, 18 phase). Mục đích: chứng minh không có nội dung nào của transcript bị bỏ sót.

Quy ước: dấu `→` chỉ bài học chứa nội dung đó. Một file transcript có thể ánh xạ tới nhiều bài; nhiều file nhỏ có thể gộp vào một bài (theo nguyên tắc gộp bài nhập môn ngắn và tách bài chứa nhiều khái niệm).

---

## Section 01 — Course Updates (4 file) → phase-1

| # | Transcript | Bài học |
|---|---|---|
| 001 | Welcome to the Course | [01-gioi-thieu-khoa-hoc](phase-1/01-gioi-thieu-khoa-hoc.md) — hook, "vì sao công nghệ này tồn tại", thang scale 10 nấc |
| 002 | Course Note 1 | [01-gioi-thieu-khoa-hoc](phase-1/01-gioi-thieu-khoa-hoc.md) — phạm vi khoá, cái gì KHÔNG có trong khoá |
| 003 | Course Note 2 | [02-lo-trinh-hoc-database](phase-1/02-lo-trinh-hoc-database.md) — thứ tự học, hai nhánh song song |
| 004 | Course Note 3 | [02-lo-trinh-hoc-database](phase-1/02-lo-trinh-hoc-database.md) + [00-tu-dien-thuat-ngu](phase-1/00-tu-dien-thuat-ngu-database-cho-nguoi-moi.md) — từ điển thuật ngữ cho người mới (bổ sung ngoài transcript) |

## Section 02 — ACID (10 file) → phase-2

| # | Transcript | Bài học |
|---|---|---|
| 005 | Introduction to ACID | [01-acid-va-transaction](phase-2/01-acid-va-transaction.md) |
| 006 | What is a Transaction | [01-acid-va-transaction](phase-2/01-acid-va-transaction.md) — vòng đời transaction, `BEGIN`/`COMMIT`/`ROLLBACK` |
| 007 | Atomicity | [02-atomicity-va-durability](phase-2/02-atomicity-va-durability.md) — bốn kiểu thất bại, crash recovery |
| 008 | Isolation | [03-isolation-va-read-phenomena](phase-2/03-isolation-va-read-phenomena.md) |
| 009 | Consistency | [04-consistency-va-eventual-consistency](phase-2/04-consistency-va-eventual-consistency.md) — nhất quán dữ liệu vs nhất quán đọc, toàn vẹn tham chiếu |
| 010 | Durability | [02-atomicity-va-durability](phase-2/02-atomicity-va-durability.md) — WAL, fsync, torn page, full-page write |
| 011 | ACID by Practical Examples | [05-acid-thuc-hanh-voi-postgres](phase-2/05-acid-thuc-hanh-voi-postgres.md) — lab Docker ba terminal |
| 012 | Phantom Reads | [03-isolation-va-read-phenomena](phase-2/03-isolation-va-read-phenomena.md) — phantom + gap lock vs snapshot |
| 013 | Serializable vs Repeatable Read | [03-isolation-va-read-phenomena](phase-2/03-isolation-va-read-phenomena.md) — SSI, write skew |
| 014 | Eventual Consistency | [04-consistency-va-eventual-consistency](phase-2/04-consistency-va-eventual-consistency.md) — thang nhất quán, đọc-được-cái-mình-vừa-ghi |

## Section 03 — Understanding Database Internals (3 file) → phase-3

| # | Transcript | Bài học |
|---|---|---|
| 015 | How tables and indexes are stored on disk | [01-page-heap-va-io](phase-3/01-page-heap-va-io.md) — page 8 KB, heap, `ctid`, HOT update, dead tuple |
| 016 | Row-Based vs Column-Based Databases | [02-row-based-vs-column-based](phase-3/02-row-based-vs-column-based.md) — RLE/dictionary/delta, OLTP vs OLAP |
| 017 | Primary Key vs Secondary Key | [03-primary-key-vs-secondary-key](phase-3/03-primary-key-vs-secondary-key.md) — heap-organized vs index-organized |

## Section 04 — Database Indexing (12 file) → phase-4

| # | Transcript | Bài học |
|---|---|---|
| 018 | Create Postgres Table with a million Rows | [01-co-ban-ve-indexing](phase-4/01-co-ban-ve-indexing.md) — `generate_series` dựng bảng thử |
| 019 | Getting Started with Indexing | [01-co-ban-ve-indexing](phase-4/01-co-ban-ve-indexing.md) |
| 020 | Understanding The SQL Query Planner and Optimizer | [03-composite-index-va-optimizer](phase-4/03-composite-index-va-optimizer.md) |
| 021 | Bitmap Index Scan vs Index Scan vs Table Scan | [02-index-scan-va-covering-index](phase-4/02-index-scan-va-covering-index.md) |
| 022 | Key vs Non-Key Column Database Indexing | [02-index-scan-va-covering-index](phase-4/02-index-scan-va-covering-index.md) — `INCLUDE` vs cột khoá |
| 023 | Index Scan vs Index Only Scan | [02-index-scan-va-covering-index](phase-4/02-index-scan-va-covering-index.md) — visibility map, `Heap Fetches` |
| 024 | Combining Database Indexes | [03-composite-index-va-optimizer](phase-4/03-composite-index-va-optimizer.md) — `BitmapAnd`, quy tắc tiền tố trái |
| 025 | How Database Optimizers Decide to Use Indexes | [03-composite-index-va-optimizer](phase-4/03-composite-index-va-optimizer.md) — `pg_stats`, `n_distinct`, `random_page_cost` |
| 026 | Create Index Concurrently | [05-create-index-concurrently-va-best-practices](phase-4/05-create-index-concurrently-va-best-practices.md) — 4 giai đoạn, bẫy hàng đợi khoá, index INVALID |
| 027 | Bloom Filters | [04-bloom-filter-va-uuid-performance](phase-4/04-bloom-filter-va-uuid-performance.md) |
| 028 | Working with Billion-Row Table | [05-create-index-concurrently-va-best-practices](phase-4/05-create-index-concurrently-va-best-practices.md) + [phase-6](phase-6/01-database-partitioning-la-gi.md) |
| 029 | How UUIDs in B+Tree Indexes affect performance | [04-bloom-filter-va-uuid-performance](phase-4/04-bloom-filter-va-uuid-performance.md) — UUID v4 vs v7/ULID |

## Section 05 — B-Tree vs B+Tree (9 file) → phase-5

| # | Transcript | Bài học |
|---|---|---|
| 030 | Section's Introduction & Agenda | [01-btree-co-ban](phase-5/01-btree-co-ban.md) — gộp vào hook |
| 031 | Full Table Scans | [01-btree-co-ban](phase-5/01-btree-co-ban.md) |
| 032 | Original B-Tree | [01-btree-co-ban](phase-5/01-btree-co-ban.md) — phần tử = khoá + con trỏ, nút = page |
| 033 | How the Original B-Tree Helps Performance | [01-btree-co-ban](phase-5/01-btree-co-ban.md) — fan-out, số tầng |
| 034 | Original B-Tree Limitations | [01-btree-co-ban](phase-5/01-btree-co-ban.md) — quét khoảng phải leo lại cây |
| 035 | B+Tree | [02-btree-plus-va-ung-dung-thuc-te](phase-5/02-btree-plus-va-ung-dung-thuc-te.md) — con trỏ lá là **lựa chọn** (WiredTiger bỏ) |
| 036 | B+Tree DBMS Considerations | [02-btree-plus-va-ung-dung-thuc-te](phase-5/02-btree-plus-va-ung-dung-thuc-te.md) |
| 037 | B+Tree Storage Cost in MySQL vs Postgres | [02-btree-plus-va-ung-dung-thuc-te](phase-5/02-btree-plus-va-ung-dung-thuc-te.md) — `pgstatindex`, `bt_metap` |
| 038 | Section's Summary | [02-btree-plus-va-ung-dung-thuc-te](phase-5/02-btree-plus-va-ung-dung-thuc-te.md) — tóm tắt |

## Section 06 — Database Partitioning (14 file) → phase-6

| # | Transcript | Bài học |
|---|---|---|
| 039 | Introduction to Database Partitioning | [01-database-partitioning-la-gi](phase-6/01-database-partitioning-la-gi.md) |
| 040 | What is Partitioning | [01-database-partitioning-la-gi](phase-6/01-database-partitioning-la-gi.md) |
| 041 | Vertical vs Horizontal Partitioning | [01-database-partitioning-la-gi](phase-6/01-database-partitioning-la-gi.md) |
| 042 | Partitioning Types | [01-database-partitioning-la-gi](phase-6/01-database-partitioning-la-gi.md) — RANGE / LIST / HASH |
| 043 | The Difference Between Partitioning and Sharding | [01-database-partitioning-la-gi](phase-6/01-database-partitioning-la-gi.md) |
| 044 | Preparing Postgres, Database, Table, Indexes | [02-partitioning-thuc-hanh-postgres](phase-6/02-partitioning-thuc-hanh-postgres.md) |
| 045 | Execute Multiple Queries on the Table | [02-partitioning-thuc-hanh-postgres](phase-6/02-partitioning-thuc-hanh-postgres.md) |
| 046 | Create and Attach Partitioned Tables | [02-partitioning-thuc-hanh-postgres](phase-6/02-partitioning-thuc-hanh-postgres.md) — `ATTACH` kèm `CHECK` |
| 047 | Populate the Partitions and Create Indexes | [02-partitioning-thuc-hanh-postgres](phase-6/02-partitioning-thuc-hanh-postgres.md) — index CONCURRENTLY 3 bước |
| 048 | Class Project — Querying and Checking the Size | [02-partitioning-thuc-hanh-postgres](phase-6/02-partitioning-thuc-hanh-postgres.md) |
| 049 | The Advantages of Partitioning | [01-database-partitioning-la-gi](phase-6/01-database-partitioning-la-gi.md) |
| 050 | The Disadvantages of Partitioning | [01-database-partitioning-la-gi](phase-6/01-database-partitioning-la-gi.md) |
| 051 | Section Summary | [02-partitioning-thuc-hanh-postgres](phase-6/02-partitioning-thuc-hanh-postgres.md) |
| 052 | How to Automate Partitioning in Postgres | [02-partitioning-thuc-hanh-postgres](phase-6/02-partitioning-thuc-hanh-postgres.md) — hàm tự sinh mảnh, `pg_partman` |

## Section 07 — Database Sharding (12 file) → phase-7

| # | Transcript | Bài học |
|---|---|---|
| 053 | Introduction to Database Sharding | [01-database-sharding-la-gi](phase-7/01-database-sharding-la-gi.md) |
| 054 | What is Database Sharding | [01-database-sharding-la-gi](phase-7/01-database-sharding-la-gi.md) |
| 055 | Consistent Hashing | [01-database-sharding-la-gi](phase-7/01-database-sharding-la-gi.md) + [phase-17/04](phase-17/04-hash-tables-va-consistent-hashing.md) — nút ảo |
| 056 | Horizontal partitioning vs Sharding | [01-database-sharding-la-gi](phase-7/01-database-sharding-la-gi.md) |
| 057 | Sharding with Postgres | [02-sharding-thuc-hanh-nodejs-postgres](phase-7/02-sharding-thuc-hanh-nodejs-postgres.md) |
| 058 | Spin up Docker Postgres Shards | [02-sharding-thuc-hanh-nodejs-postgres](phase-7/02-sharding-thuc-hanh-nodejs-postgres.md) |
| 059 | Writing to a Shard | [02-sharding-thuc-hanh-nodejs-postgres](phase-7/02-sharding-thuc-hanh-nodejs-postgres.md) |
| 060 | Reading from a Shard | [02-sharding-thuc-hanh-nodejs-postgres](phase-7/02-sharding-thuc-hanh-nodejs-postgres.md) — scatter-gather, độ trễ đuôi |
| 061 | Advantages of Database Sharding | [03-pros-cons-va-khi-nao-dung-sharding](phase-7/03-pros-cons-va-khi-nao-dung-sharding.md) |
| 062 | Disadvantages of Database Sharding | [03-pros-cons-va-khi-nao-dung-sharding](phase-7/03-pros-cons-va-khi-nao-dung-sharding.md) |
| 063 | Section Summary | [03-pros-cons-va-khi-nao-dung-sharding](phase-7/03-pros-cons-va-khi-nao-dung-sharding.md) |
| 064 | When Should you consider Sharding | [03-pros-cons-va-khi-nao-dung-sharding](phase-7/03-pros-cons-va-khi-nao-dung-sharding.md) — thang 9 nấc + trục "giảm việc vs chia việc" |

## Section 08 — Concurrency Control (7 file) → phase-8

| # | Transcript | Bài học |
|---|---|---|
| 065 | Shared vs Exclusive Locks | [01-shared-lock-va-exclusive-lock](phase-8/01-shared-lock-va-exclusive-lock.md) — 8 chế độ khoá bảng, leo thang khoá |
| 066 | Dead Locks | [01-shared-lock-va-exclusive-lock](phase-8/01-shared-lock-va-exclusive-lock.md) — chữa bằng thứ tự khoá |
| 067 | Two-phase Locking | [01-shared-lock-va-exclusive-lock](phase-8/01-shared-lock-va-exclusive-lock.md) |
| 068 | Solving the Double Booking Problem | [02-double-booking-va-pagination](phase-8/02-double-booking-va-pagination.md) — `FOR UPDATE` |
| 069 | Double Booking Problem Part 2 | [02-double-booking-va-pagination](phase-8/02-double-booking-va-pagination.md) — cập nhật có điều kiện, khoá lạc quan, ràng buộc |
| 070 | SQL Pagination With Offset is Very Slow | [02-double-booking-va-pagination](phase-8/02-double-booking-va-pagination.md) — keyset pagination |
| 071 | Database Connection Pooling | [03-connection-pooling](phase-8/03-connection-pooling.md) — `(cores×2)+spindles`, định luật Little, PgBouncer |

## Section 09 — Database Replication (6 file) → phase-9

| # | Transcript | Bài học |
|---|---|---|
| 072 | Introduction to Database Replication | [01-database-replication-la-gi](phase-9/01-database-replication-la-gi.md) — kèm phần "giao thức database rất nói nhiều" |
| 073 | Master/Standby Replication | [01-database-replication-la-gi](phase-9/01-database-replication-la-gi.md) |
| 074 | Multi-master Replication | [01-database-replication-la-gi](phase-9/01-database-replication-la-gi.md) |
| 075 | Synchronous vs Asynchronous Replication | [01-database-replication-la-gi](phase-9/01-database-replication-la-gi.md) — 5 mức `synchronous_commit` |
| 076 | Replication Demo with Postgres 13 | [02-replication-demo-postgres](phase-9/02-replication-demo-postgres.md) — khe nhân bản, `pg_promote`, `pg_rewind` |
| 077 | Pros and Cons of Replication | [01-database-replication-la-gi](phase-9/01-database-replication-la-gi.md) + [02](phase-9/02-replication-demo-postgres.md) — não phân đôi |

## Section 10 — Database System Design (2 file) → phase-10

| # | Transcript | Bài học |
|---|---|---|
| 078 | Twitter System Design | [01-system-design-twitter-database](phase-10/01-system-design-twitter-database.md) — toè khi đọc/ghi/lai |
| 079 | Building a Short URL System | [02-system-design-url-shortener](phase-10/02-system-design-url-shortener.md) — 4 lược đồ sinh mã |

## Section 11 — Database Engines (12 file) → phase-11

| # | Transcript | Bài học |
|---|---|---|
| 080 | Introduction | [01-database-engine-la-gi](phase-11/01-database-engine-la-gi.md) |
| 081 | What is a Database Engine | [01-database-engine-la-gi](phase-11/01-database-engine-la-gi.md) |
| 082 | MyISAM | [02-myisam-va-innodb](phase-11/02-myisam-va-innodb.md) — `.frm`/`.MYD`/`.MYI`, khoá bảng |
| 083 | InnoDB | [02-myisam-va-innodb](phase-11/02-myisam-va-innodb.md) — clustered index, tham số chỉnh |
| 084 | XtraDB | [04-xtradb-sqlite-aria](phase-11/04-xtradb-sqlite-aria.md) |
| 085 | SQLite | [04-xtradb-sqlite-aria](phase-11/04-xtradb-sqlite-aria.md) — PRAGMA cần bật, type affinity |
| 086 | Aria | [04-xtradb-sqlite-aria](phase-11/04-xtradb-sqlite-aria.md) |
| 087 | BerkeleyDB | [05-berkeleydb-va-tong-ket-engines](phase-11/05-berkeleydb-va-tong-ket-engines.md) — cú sốc giấy phép AGPLv3 |
| 088 | LevelDB | [03-leveldb-rocksdb-va-demo](phase-11/03-leveldb-rocksdb-va-demo.md) — LSM, **dòng họ từ Google BigTable** |
| 089 | RocksDB | [03-leveldb-rocksdb-va-demo](phase-11/03-leveldb-rocksdb-va-demo.md) — MyRocks, ba loại khuếch đại |
| 090 | Popular Database Engines | [05-berkeleydb-va-tong-ket-engines](phase-11/05-berkeleydb-va-tong-ket-engines.md) — **bản đồ B-Tree vs LSM toàn ngành**, CouchDB/Couchbase |
| 091 | Switching Database Engines with MySQL | [05-berkeleydb-va-tong-ket-engines](phase-11/05-berkeleydb-va-tong-ket-engines.md) — `pt-online-schema-change`, `gh-ost` |

## Section 12 — Database Cursors (6 file) → phase-12

| # | Transcript | Bài học |
|---|---|---|
| 092 | What are Database Cursors | [01-database-cursors](phase-12/01-database-cursors.md) |
| 093 | Server Side vs Client Side Cursors | [01-database-cursors](phase-12/01-database-cursors.md) — `itersize`, `cursor_tuple_fraction` |
| 094 | Inserting Million Rows with Python | [01-database-cursors](phase-12/01-database-cursors.md) |
| 095 | Querying with Client Side Cursor | [01-database-cursors](phase-12/01-database-cursors.md) — đo RAM 4218 MB |
| 096 | Querying with Server Side Cursor | [01-database-cursors](phase-12/01-database-cursors.md) |
| 097 | Pros and Cons of Server vs Client Side | [01-database-cursors](phase-12/01-database-cursors.md) + [02-cursor-nang-cao](phase-12/02-cursor-nang-cao-va-use-cases.md) — **rò rỉ cursor làm sập database**, `COPY`, keyset |

## Section 13 — NoSQL Architecture (5 file) → phase-13

| # | Transcript | Bài học |
|---|---|---|
| 098 | SQL vs NoSQL and MongoDB | [01-nosql-vs-sql-va-mongodb](phase-13/01-nosql-vs-sql-va-mongodb.md) — nhúng vs tham chiếu, `writeConcern`/`readConcern` |
| 099 | MongoDB Clustered Collections | [01-nosql-vs-sql-va-mongodb](phase-13/01-nosql-vs-sql-va-mongodb.md) |
| 100 | Memcached NoSQL Architecture | [02-memcached-architecture](phase-13/02-memcached-architecture.md) — slab allocator, vôi hoá slab, thundering herd |
| 101 | NoSQL Redis Internals | [03-redis-va-cap-theorem](phase-13/03-redis-va-cap-theorem.md) — một luồng, mã hoá nội bộ một chiều |
| 102 | CAP Theorem Explained | [03-redis-va-cap-theorem](phase-13/03-redis-va-cap-theorem.md) — CAP + PACELC, ba hiểu lầm |

## Section 14 — Database Security (6 file) → phase-14

| # | Transcript | Bài học |
|---|---|---|
| 103 | Secure Your Postgres by Enabling TLS/SSL | [01-bao-mat-ket-noi-database-tls](phase-14/01-bao-mat-ket-noi-database-tls.md) — 6 mức `sslmode`, tấn công hạ cấp |
| 104 | Deep Look into Postgres Wire Protocol (Wireshark) | [01-bao-mat-ket-noi-database-tls](phase-14/01-bao-mat-ket-noi-database-tls.md) — kèm cảnh báo `SSLKEYLOGFILE` |
| 105 | Deep Look Into MongoDB Wire Protocol | [01-bao-mat-ket-noi-database-tls](phase-14/01-bao-mat-ket-noi-database-tls.md) — mục "wire protocol của hệ khác" |
| 106 | Largest SQL Statement You can Send | [01-bao-mat-ket-noi-database-tls](phase-14/01-bao-mat-ket-noi-database-tls.md) — 1 MB = 960 gói TCP, 14 MB sập server, 3 cách thay thế |
| 107 | Best Practices Working with REST & Databases | [02-database-permissions-va-best-practices](phase-14/02-database-permissions-va-best-practices.md) — không cho trình duyệt nối thẳng |
| 108 | Database Permissions & Best Practices for REST API | [02-database-permissions-va-best-practices](phase-14/02-database-permissions-va-best-practices.md) — vai trò, `ALTER DEFAULT PRIVILEGES`, RLS + `WITH CHECK`, IDOR, audit |

## Section 15 — Homomorphic Encryption (9 file) → phase-15

| # | Transcript | Bài học |
|---|---|---|
| 109 | Introduction to Homomorphic Encryption | [01-homomorphic-encryption](phase-15/01-homomorphic-encryption.md) |
| 110 | What is Encryption | [01-homomorphic-encryption](phase-15/01-homomorphic-encryption.md) — đối xứng vs bất đối xứng |
| 111 | Why Can't we always Encrypt | [01-homomorphic-encryption](phase-15/01-homomorphic-encryption.md) — lỗ hổng "khi đang dùng", TLS termination |
| 112 | What is Homomorphic Encryption | [01-homomorphic-encryption](phase-15/01-homomorphic-encryption.md) — PHE / SHE / FHE |
| 113 | Homomorphic Encryption Demo | [02-homomorphic-encryption-demo-va-code](phase-15/02-homomorphic-encryption-demo-va-code.md) |
| 114 | Clone and Build the Code | [02-homomorphic-encryption-demo-va-code](phase-15/02-homomorphic-encryption-demo-va-code.md) — dựng bằng `phe`/`tenseal` |
| 115 | Going Through the Code and the Database | [02-homomorphic-encryption-demo-va-code](phase-15/02-homomorphic-encryption-demo-va-code.md) — bản mã phình 77× |
| 116 | Searching The Encrypted Database | [02-homomorphic-encryption-demo-va-code](phase-15/02-homomorphic-encryption-demo-va-code.md) — vì sao `WHERE`/`ORDER BY` không làm được |
| 117 | Is Homomorphic Encryption Ready | [02-homomorphic-encryption-demo-va-code](phase-15/02-homomorphic-encryption-demo-va-code.md) — ba xu hướng, TEE thay thế |

## Section 16 — Answering your Questions (15 file) → phase-16

| # | Transcript | Bài học |
|---|---|---|
| 118 | Heap Index scan instead of Index only scan why | [01-hoi-dap-indexing-va-query-planning](phase-16/01-hoi-dap-indexing-va-query-planning.md) |
| 119 | What is the unit of the Cost in Postgres Planner | [01-hoi-dap-indexing-va-query-planning](phase-16/01-hoi-dap-indexing-va-query-planning.md) — `seq_page_cost` = 1,0 |
| 120 | All Isolation Levels — Explained | [02-hoi-dap-transactions-connections-va-misc](phase-16/02-hoi-dap-transactions-connections-va-misc.md) |
| 121 | Snapshot and Repeatable Read difference | [02-hoi-dap-transactions-connections-va-misc](phase-16/02-hoi-dap-transactions-connections-va-misc.md) |
| 122 | I have an Index why full table scan | [01-hoi-dap-indexing-va-query-planning](phase-16/01-hoi-dap-indexing-va-query-planning.md) |
| 123 | Why Databases Read Pages instead of Rows | [01-hoi-dap-indexing-va-query-planning](phase-16/01-hoi-dap-indexing-va-query-planning.md) |
| 124 | Indexing a column with duplicate values | [01-hoi-dap-indexing-va-query-planning](phase-16/01-hoi-dap-indexing-va-query-planning.md) |
| 125 | Should I drop unused indexes | [01-hoi-dap-indexing-va-query-planning](phase-16/01-hoi-dap-indexing-va-query-planning.md) — 3 kiểm tra, bẫy replica |
| 126 | Why serializable when we have SELECT FOR UPDATE | [02-hoi-dap-transactions-connections-va-misc](phase-16/02-hoi-dap-transactions-connections-va-misc.md) |
| 127 | Same database connection for multiple clients | [02-hoi-dap-transactions-connections-va-misc](phase-16/02-hoi-dap-transactions-connections-va-misc.md) |
| 128 | Do I need a transaction if I'm only reading | [02-hoi-dap-transactions-connections-va-misc](phase-16/02-hoi-dap-transactions-connections-va-misc.md) |
| 129 | Why does an update touch all indexes | [02-hoi-dap-transactions-connections-va-misc](phase-16/02-hoi-dap-transactions-connections-va-misc.md) — HOT update |
| 130 | What is the value of bitmap index scan | [01-hoi-dap-indexing-va-query-planning](phase-16/01-hoi-dap-indexing-va-query-planning.md) |
| 131 | What does Explain Analyze actually do | [01-hoi-dap-indexing-va-query-planning](phase-16/01-hoi-dap-indexing-va-query-planning.md) — cảnh báo `EXPLAIN ANALYZE DELETE` |
| 132 | Does Create Index block writes and Why | [01-hoi-dap-indexing-va-query-planning](phase-16/01-hoi-dap-indexing-va-query-planning.md) + [phase-4/05](phase-4/05-create-index-concurrently-va-best-practices.md) |

Câu hỏi phát sinh ngoài transcript nhưng cùng mạch được gom vào [03-hoi-dap-database-internals](phase-16/03-hoi-dap-database-internals.md): `DELETE` không giảm dung lượng, cột NULL, `CHAR(36)` vs `UUID`, xoá mềm, logic nghiệp vụ đặt ở đâu, phi chuẩn hoá.

## Section 17 — Database Discussions (14 file) → phase-17

| # | Transcript | Bài học |
|---|---|---|
| 133 | WAL, Redo and Undo logs | [01-wal-redo-undo-logs](phase-17/01-wal-redo-undo-logs.md) — 3 giai đoạn phục hồi, PostgreSQL không có undo log |
| 134 | SELECT COUNT() impacts Backend performance | [02-hoi-dap-transactions-connections-va-misc](phase-16/02-hoi-dap-transactions-connections-va-misc.md) — `COUNT(*)` vs `COUNT(cột)`, huyền thoại `COUNT(1)` |
| 135 | How Shopify Switched from UUID as Primary Key | [02-thao-luan-uuid-pk-va-postgres-vs-mysql](phase-17/02-thao-luan-uuid-pk-va-postgres-vs-mysql.md) |
| 136 | How does the Database Store Data On Disk | [01-luu-tru-du-lieu-va-kien-truc-postgres](phase-17/01-luu-tru-du-lieu-va-kien-truc-postgres.md) |
| 137 | Postgres Architecture | [01-luu-tru-du-lieu-va-kien-truc-postgres](phase-17/01-luu-tru-du-lieu-va-kien-truc-postgres.md) — postmaster + tiến trình nền, hành trình một câu lệnh |
| 138 | Is QUIC a Good Protocol for Databases | [03-quic-va-distributed-transaction](phase-17/03-quic-va-distributed-transaction.md) — 3 câu hỏi trước khi đổi giao thức |
| 139 | What is a Distributed Transaction | [03-quic-va-distributed-transaction](phase-17/03-quic-va-distributed-transaction.md) — 2PC, saga, outbox |
| 140 | Hash Tables and Consistent Hashing | [04-hash-tables-va-consistent-hashing](phase-17/04-hash-tables-va-consistent-hashing.md) — nối chuỗi vs địa chỉ mở, nút ảo |
| 141 | Indexing in PostgreSQL vs MySQL | [05-indexing-postgres-vs-mysql](phase-17/05-indexing-postgres-vs-mysql.md) — 3 chặng của InnoDB, `INCLUDE` |
| 142 | Why Uber Moved from Postgres to MySQL | [02-thao-luan-uuid-pk-va-postgres-vs-mysql](phase-17/02-thao-luan-uuid-pk-va-postgres-vs-mysql.md) |
| 143 | Can NULLs Improve Query Performance | [06-nulls-va-write-amplification](phase-17/06-nulls-va-write-amplification.md) — bitmap NULL, index bộ phận |
| 144 | Write Amplification Explained | [06-nulls-va-write-amplification](phase-17/06-nulls-va-write-amplification.md) — 6 tầng khuếch đại, TRIM, tuổi thọ SSD |
| 145 | Optimistic vs Pessimistic Concurrency Control | [07-concurrency-control-va-innodb-locking](phase-17/07-concurrency-control-va-innodb-locking.md) — ngưỡng 5% / 20% |
| 146 | MySQL InnoDB Advanced Locking Techniques | [07-concurrency-control-va-innodb-locking](phase-17/07-concurrency-control-va-innodb-locking.md) — record / gap / next-key lock |

## Section 18 — Archived Lectures (7 file) → phase-18

| # | Transcript | Bài học |
|---|---|---|
| 147 | Introduction to ACID (Archived) | [01-acid-review-va-implementation-details](phase-18/01-acid-review-va-implementation-details.md) |
| 148 | What is a Transaction (Archived) | [01-acid-review-va-implementation-details](phase-18/01-acid-review-va-implementation-details.md) |
| 149 | Atomicity (Archived 2022) | [01-acid-review-va-implementation-details](phase-18/01-acid-review-va-implementation-details.md) |
| 150 | Isolation (Archived 2022) | [01-acid-review-va-implementation-details](phase-18/01-acid-review-va-implementation-details.md) — bảng isolation chuẩn vs hệ thật |
| 151 | Consistency (Archived 2022) | [01-acid-review-va-implementation-details](phase-18/01-acid-review-va-implementation-details.md) — 4 tầng bảo vệ nhất quán |
| 152 | Durability (Archived 2022) | [01-acid-review-va-implementation-details](phase-18/01-acid-review-va-implementation-details.md) |
| 153 | Atomicity (Archived 2024) | [01-acid-review-va-implementation-details](phase-18/01-acid-review-va-implementation-details.md) |

Bốn bài archived trùng nội dung với Section 02 nên được gộp thành **một bài tổng kết** thay vì viết lại — đúng nguyên tắc "gộp bài nhập môn ngắn".

---

## Ba mục cố ý không viết thành nội dung riêng

| Nội dung transcript | Lý do bỏ |
|---|---|
| MySQL engine `CSV` (nhắc thoáng ở 090) | Chỉ là một dòng liệt kê; đã có trong bảng engine đặc biệt ở [phase-11/05](phase-11/05-berkeleydb-va-tong-ket-engines.md) cùng `MEMORY`/`ARCHIVE`/`BLACKHOLE` |
| `VACUUM VERBOSE` in ra gì (091) | Chi tiết đầu ra công cụ; nội dung cốt lõi về VACUUM đã có ở [phase-3/01](phase-3/01-page-heap-va-io.md) và [phase-16/03](phase-16/03-hoi-dap-database-internals.md) |
| Tên gọi "IBM FHE Toolkit" (117) | Tên sản phẩm đã ngừng; phần thay thế thực dụng (TEE, thư viện `phe`/`tenseal`) đã viết đầy đủ ở [phase-15/02](phase-15/02-homomorphic-encryption-demo-va-code.md) |

## Nội dung có trong khoá nhưng KHÔNG có trong transcript

Đây là phần bổ sung để đạt độ sâu yêu cầu — mỗi mục đều gắn với một câu hỏi thực tế mà transcript đặt ra nhưng không trả lời:

- [phase-1/00](phase-1/00-tu-dien-thuat-ngu-database-cho-nguoi-moi.md) — từ điển 60+ thuật ngữ và bản đồ "đường đi của một câu `SELECT`"
- Con số đo được thật (thời gian, dung lượng, tỉ lệ) ở hầu hết các bài
- Bảng "bẫy thường gặp" và mục "khi nào KHÔNG dùng" ở mọi bài
- BRIN, index bộ phận, `pg_trgm`, bloom filter extension ([phase-4](phase-4/01-co-ban-ve-indexing.md))
- Citus / Vitess, colocation, thang 9 nấc ([phase-7/03](phase-7/03-pros-cons-va-khi-nao-dung-sharding.md))
- `SKIP LOCKED`, `NOWAIT`, advisory lock ([phase-8/01](phase-8/01-shared-lock-va-exclusive-lock.md))
- PgBouncer transaction mode làm hỏng cái gì ([phase-8/03](phase-8/03-connection-pooling.md))
- Nhân bản logic, `pg_rewind`, não phân đôi ([phase-9/02](phase-9/02-replication-demo-postgres.md))
- Bản đồ B-Tree vs LSM toàn ngành, CouchDB nói HTTP ([phase-11/05](phase-11/05-berkeleydb-va-tong-ket-engines.md))
- Điểm dừng bền vững cho job ETL nhiều giờ ([phase-12/02](phase-12/02-cursor-nang-cao-va-use-cases.md))
- PACELC ([phase-13/03](phase-13/03-redis-va-cap-theorem.md))
- RLS `WITH CHECK`, IDOR, bảng audit ([phase-14/02](phase-14/02-database-permissions-va-best-practices.md))

---

## Cách tự kiểm chứng

```bash
# Đếm file transcript
find transcripts/database-engines-crash-course -name '*.txt' | wc -l      # → 153

# Đếm bài học
find database -name '*.md' -not -name 'README.md' \
     -not -name 'DOI-CHIEU-TRANSCRIPT.md' | wc -l                        # → 56

# Kiểm tra link nội bộ trong database/
grep -roh '](\.\./\?[^)]*\.md)' database/ | sort -u | wc -l
```

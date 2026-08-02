# Redis

> Redis không phải "cache nhanh" — nó là một hộp công cụ cấu trúc dữ liệu.

111 bài, khoá sâu nhất repo về một công nghệ. Đi qua từng kiểu dữ liệu (string, hash, list, set, sorted set, stream, bitmap, HyperLogLog), từng nhóm lệnh với đầy đủ tuỳ chọn và độ phức tạp, cơ chế bên trong (single-thread event loop, lazy expiration, encoding), và các bài toán thực tế: caching, session, hàng đợi, bảng xếp hạng, tìm kiếm, rate limit.

**111 bài** trong 20 phần.

## Mục lục

### Phase 1

| Bài | Nội dung |
|---|---|
| [01](phase-1/01-redis-la-gi.md) | Bài 1: Redis là gì? |
| [02](phase-1/02-vi-sao-redis-nhanh.md) | Bài 2: Vì sao Redis nhanh đến vậy? |
| [03](phase-1/03-cac-loai-deployment.md) | Bài 3: Các cách triển khai Redis |
| [04](phase-1/04-setup-redis-cloud.md) | Bài 4: Setup Redis Cloud từ A đến Z |
| [05](phase-1/05-cong-cu-tuong-tac.md) | Bài 5: Các công cụ tương tác với Redis |

### Phase 2

| Bài | Nội dung |
|---|---|
| [01](phase-2/01-mo-hinh-key-value.md) | Bài 1: Mô hình key-value và các kiểu dữ liệu Redis |
| [02](phase-2/02-set-get-co-ban.md) | Bài 2: SET và GET — hai lệnh cơ bản nhất |
| [03](phase-2/03-set-options.md) | Bài 3: Các option của SET — NX, XX, GET, KEEPTTL, EX/PX/EXAT/PXAT |
| [04](phase-2/04-expiration-deep-dive.md) | Bài 4: Đào sâu về Expiration — TTL, PERSIST, Active/Lazy expiration |
| [05](phase-2/05-mset-mget-batch.md) | Bài 5: MSET & MGET — thao tác nhiều key cùng lúc |
| [06](phase-2/06-string-ranges-bitops.md) | Bài 6: String ranges và Bitmap — sức mạnh ẩn của Redis String |
| [07](phase-2/07-lam-viec-voi-so.md) | Bài 7: Làm việc với số — INCR, DECR, INCRBY và bài học về concurrency |
| [08](phase-2/08-bai-tap-va-loi-giai.md) | Bài 8: Bài tập tổng kết & các bẫy thường gặp |

### Phase 3

| Bài | Nội dung |
|---|---|
| [01](phase-3/01-app-tong-quan.md) | Bài 1: Tổng quan app E-Commerce — sân chơi cho phần còn lại của khoá |
| [02](phase-3/02-redis-client-libraries.md) | Bài 2: Redis client library — vì sao chúng khác ORM SQL |
| [03](phase-3/03-redis-design-methodology.md) | Bài 3: Redis Design Methodology — bài học cốt lõi nhất khoá học |
| [04](phase-3/04-key-naming-convention.md) | Bài 4: Key naming convention — quy tắc đặt tên key chuyên nghiệp |
| [05](phase-3/05-implement-page-caching.md) | Bài 5: Implement page caching — viết code thực tế |
| [06](phase-3/06-cache-key-generation.md) | Bài 6: Cache key generation — chống typo bằng helper function |

### Phase 4

| Bài | Nội dung |
|---|---|
| [01](phase-4/01-hash-la-gi.md) | Bài 1: Hash — kiểu dữ liệu lý tưởng cho object/record |
| [02](phase-4/02-hset-hget-hgetall.md) | Bài 2: HSET, HGET, HGETALL — đọc/ghi cơ bản của Hash |
| [03](phase-4/03-hdel-dieu-quan-ly.md) | Bài 3: HDEL, expiration cho hash & dọn dẹp |
| [04](phase-4/04-hincrby-counter-trong-hash.md) | Bài 4: HINCRBY, HINCRBYFLOAT — counter trong hash |

### Phase 5

| Bài | Nội dung |
|---|---|
| [01](phase-5/01-hset-quirks.md) | Bài 1: HSET có những quirk gì khi gọi từ code |
| [02](phase-5/02-hgetall-empty-object.md) | Bài 2: HGETALL trả empty object — bẫy existence check |
| [03](phase-5/03-tong-hop-gotchas.md) | Bài 3: Tổng hợp gotchas Redis & checklist trước khi đi prod |

### Phase 6

| Bài | Nội dung |
|---|---|
| [01](phase-6/01-app-overview-va-queries.md) | Bài 1: Tổng quan app & liệt kê queries cần trả lời |
| [02](phase-6/02-chon-data-type-cho-tung-resource.md) | Bài 2: Chọn data type Redis cho từng resource |
| [03](phase-6/03-create-user.md) | Bài 3: Implement create user — HSET object syntax |
| [04](phase-6/04-serialize-deserialize-pattern.md) | Bài 4: Serialize / Deserialize pattern — vì sao luôn cần |
| [05](phase-6/05-fetch-user-deserialize.md) | Bài 5: Fetch user — deserialize và thêm id vào object |
| [06](phase-6/06-session-authentication.md) | Bài 6: Session — authentication pattern hoàn chỉnh |
| [07](phase-6/07-luu-items-datetime.md) | Bài 7: Lưu items — serialize datetime |
| [08](phase-6/08-fetch-item-deserialize.md) | Bài 8: Fetch item — deserialize phức tạp |

### Phase 7

| Bài | Nội dung |
|---|---|
| [01](phase-7/01-pipelining-la-gi.md) | Bài 1: Pipelining là gì và vì sao cần? |
| [02](phase-7/02-pipeline-trong-node-redis.md) | Bài 2: Pipeline trong node-redis — Promise.all vs multi() |
| [03](phase-7/03-getitems-thuc-chien.md) | Bài 3: Áp dụng pipeline — getItems thực chiến + tips production |

### Phase 8

| Bài | Nội dung |
|---|---|
| [01](phase-8/01-set-la-gi.md) | Bài 1: Set là gì — kiểu dữ liệu thứ 4 |
| [02](phase-8/02-union-inter-diff.md) | Bài 2: Set operations — UNION, INTER, DIFF |
| [03](phase-8/03-store-variants.md) | Bài 3: STORE variants và cache kết quả phép toán set |
| [04](phase-8/04-sismember-sscan.md) | Bài 4: SISMEMBER, SSCAN — single-set operation an toàn |
| [05](phase-8/05-use-cases-va-app-rb.md) | Bài 5: Use case kinh điển của Set + áp vào app RB |

### Phase 9

| Bài | Nội dung |
|---|---|
| [01](phase-9/01-username-unique.md) | Bài 1: Implement username uniqueness trong app RB |
| [02](phase-9/02-like-system.md) | Bài 2: Like system — bi-directional set & atomic count |
| [03](phase-9/03-liked-items-intersection.md) | Bài 3: Liked items + Common likes (intersection trên app) |
| [04](phase-9/04-unique-view.md) | Bài 4: Unique view counter với Set |

### Phase 10

| Bài | Nội dung |
|---|---|
| [01](phase-10/01-sorted-set-la-gi.md) | Bài 1: Sorted Set là gì — kiểu mạnh nhất của Redis |
| [02](phase-10/02-zrange-chi-tiet.md) | Bài 2: ZRANGE chi tiết — index, score, lex, limit |
| [03](phase-10/03-zincrby-leaderboard.md) | Bài 3: ZINCRBY và update score — leaderboard real-time |
| [04](phase-10/04-zunion-zinter-store.md) | Bài 4: ZUNIONSTORE/ZINTERSTORE — kết hợp nhiều sorted set |
| [05](phase-10/05-use-cases-sorted-set.md) | Bài 5: Use case kinh điển + sorted set trong app RB |

### Phase 11

| Bài | Nội dung |
|---|---|
| [01](phase-11/01-use-cases-mo-rong.md) | Bài 1: Sorted Set use cases mở rộng |
| [02](phase-11/02-storing-usernames-hex.md) | Bài 2: Lưu usernames trong sorted set + hex-decimal conversion |
| [03](phase-11/03-most-viewed-items.md) | Bài 3: Most viewed items — tracking pattern hoàn chỉnh |
| [04](phase-11/04-items-ending-soonest.md) | Bài 4: Items by ending soonest — time-based sorted set |
| [05](phase-11/05-loading-relational.md) | Bài 5: Loading relational data sau ZRANGE |
| [06](phase-11/06-tong-ket-multi-sort.md) | Bài 6: Tổng kết phase-11 + multiple sort indexes pattern |

### Phase 12

| Bài | Nội dung |
|---|---|
| [01](phase-12/01-loading-relational-2-cach.md) | Bài 1: 2 cách load relational data trong Redis |
| [02](phase-12/02-sort-step-by-step.md) | Bài 2: SORT command — phân tích step-by-step |
| [03](phase-12/03-sort-options-day-du.md) | Bài 3: SORT options đầy đủ — LIMIT, STORE, ALPHA, ASC/DESC |
| [04](phase-12/04-sort-trong-app-rb.md) | Bài 4: Implement SORT trong app RB — getMostViewedItems |
| [05](phase-12/05-tong-ket-redisearch-preview.md) | Bài 5: Tổng kết phase-12 + RediSearch preview |

### Phase 13

| Bài | Nội dung |
|---|---|
| [01](phase-13/01-hyperloglog-la-gi.md) | Bài 1: HyperLogLog là gì? |
| [02](phase-13/02-pfadd-pfcount-pfmerge.md) | Bài 2: PFADD, PFCOUNT, PFMERGE chi tiết + thuật toán |
| [03](phase-13/03-hll-trong-app-rb.md) | Bài 3: HLL trong app RB — unique view counter siêu tiết kiệm memory |

### Phase 14

| Bài | Nội dung |
|---|---|
| [01](phase-14/01-list-la-gi.md) | Bài 1: List là gì — kiểu dữ liệu thứ 7 |
| [02](phase-14/02-lpush-rpush-lrange.md) | Bài 2: LPUSH/RPUSH/LRANGE/LPOP/RPOP — operation cơ bản |
| [03](phase-14/03-lset-ltrim-linsert-lrem.md) | Bài 3: LSET, LTRIM, LINSERT, LREM, LPOS — modify operations |
| [04](phase-14/04-list-use-cases.md) | Bài 4: Use cases của List — khi nào nên/không nên dùng |
| [05](phase-14/05-bid-history-app-rb.md) | Bài 5: Bid history trong app RB — List in action |
| [06](phase-14/06-tong-ket-list.md) | Bài 6: Tổng kết phase-14 — bước nhảy sang phần advanced |

### Phase 15

| Bài | Nội dung |
|---|---|
| [01](phase-15/01-bid-validation.md) | Bài 1: Bid validation — check trước khi append |
| [02](phase-15/02-pipeline-va-bug-cu-the.md) | Bài 2: Pipeline cho update + concurrency bug chi tiết |
| [03](phase-15/03-atomic-primitives.md) | Bài 3: Atomic primitives — giải race condition cấp 1 |
| [04](phase-15/04-multi-exec-transaction.md) | Bài 4: MULTI/EXEC — transaction trong Redis |
| [05](phase-15/05-watch-optimistic-locking.md) | Bài 5: WATCH + optimistic locking |
| [06](phase-15/06-items-by-price.md) | Bài 6: Items by price + tổng kết phase-15 |

### Phase 16

| Bài | Nội dung |
|---|---|
| [01](phase-16/01-lua-scripting-la-gi.md) | Bài 1: Lua scripting là gì — extend Redis với logic server-side |
| [02](phase-16/02-lua-basics.md) | Bài 2: Lua basics — syntax cần biết cho dev Redis |
| [03](phase-16/03-lua-tables.md) | Bài 3: Lua tables — array và dict patterns trong Redis script |
| [04](phase-16/04-script-load-evalsha.md) | Bài 4: SCRIPT LOAD + EVALSHA — caching và performance |
| [05](phase-16/05-keys-va-argv.md) | Bài 5: KEYS và ARGV — passing data into script |
| [06](phase-16/06-when-to-use-lua-app-rb.md) | Bài 6: When to use Lua + áp dụng app RB hoàn chỉnh |

### Phase 17

| Bài | Nội dung |
|---|---|
| [01](phase-17/01-concurrency-revisited.md) | Bài 1: Concurrency revisited — vấn đề với WATCH ở traffic cao |
| [02](phase-17/02-overview-distributed-lock.md) | Bài 2: Overview Distributed Lock — anatomy + acquire/release |
| [03](phase-17/03-with-lock-helper.md) | Bài 3: Implementing withLock helper — production-grade |
| [04](phase-17/04-lock-ttl-auto-expiration.md) | Bài 4: Lock TTL + auto-expiration — bẫy và mitigation |
| [05](phase-17/05-verify-owner-lua-unlock.md) | Bài 5: Verify owner — Lua unlock script chi tiết |
| [06](phase-17/06-lock-signal.md) | Bài 6: Lock signal — defensive operation cho long task |
| [07](phase-17/07-tong-ket-concurrency.md) | Bài 7: Tổng kết phase-17 + tổng hợp 4 approach concurrency |

### Phase 18

| Bài | Nội dung |
|---|---|
| [01](phase-18/01-modules-redisearch-overview.md) | Bài 1: Redis Modules + RediSearch overview |
| [02](phase-18/02-tao-index-field-types.md) | Bài 2: Tạo index + field types |
| [03](phase-18/03-numeric-queries.md) | Bài 3: Numeric queries — range, comparison, sort |
| [04](phase-18/04-tag-queries.md) | Bài 4: Tag queries — categorical filter |
| [05](phase-18/05-text-queries.md) | Bài 5: Text queries — full-text search |
| [06](phase-18/06-fuzzy-prefix.md) | Bài 6: Fuzzy + prefix search |
| [07](phase-18/07-pre-processing.md) | Bài 7: Pre-processing search input — sanitize + escape |

### Phase 19

| Bài | Nội dung |
|---|---|
| [01](phase-19/01-search-implementation-plan.md) | Bài 1: Plan implement search trong app RB |
| [02](phase-19/02-create-index-function.md) | Bài 2: Implement createIndex function |
| [03](phase-19/03-search-parsing.md) | Bài 3: Search parsing — từ raw input tới RediSearch query |
| [04](phase-19/04-execute-search.md) | Bài 4: Execute search + parse results |
| [05](phase-19/05-tf-idf-weights.md) | Bài 5: TF-IDF + field weights — hiểu BM25 ranking |
| [06](phase-19/06-sorting-searching.md) | Bài 6: Sorting + searching kết hợp + EXPLAIN/PROFILE |
| [07](phase-19/07-updating-index-tong-ket.md) | Bài 7: Update index + tổng kết phase-19 |

### Phase 20

| Bài | Nội dung |
|---|---|
| [01](phase-20/01-streams-la-gi.md) | Bài 1: Streams là gì — event-driven messaging trong Redis |
| [02](phase-20/02-xadd-xread.md) | Bài 2: XADD, XREAD — basic ops |
| [03](phase-20/03-xrange-replay.md) | Bài 3: XRANGE + replay history |
| [04](phase-20/04-streams-issues.md) | Bài 4: Issues với standard streams — vì sao cần Consumer Groups |
| [05](phase-20/05-consumer-groups.md) | Bài 5: Consumer Groups overview |
| [06](phase-20/06-consumer-groups-implementation.md) | Bài 6: Consumer Group thực chiến — code patterns |
| [07](phase-20/07-tong-ket-khoa-hoc.md) | Bài 7: Tổng kết phase-20 + khoá học Redis hoàn thành |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Mới dùng Redis | phase-1 → phase-2, nắm string và các tuỳ chọn SET trước |
| Chỉ dùng Redis làm cache | phase-3 — phương pháp thiết kế khoá và caching pattern |
| Cần cấu trúc dữ liệu phức tạp | phase-4 trở đi theo từng kiểu |
| Đang gặp lỗi lạ | các bài "gotcha" — ví dụ HGETALL trả object rỗng |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*

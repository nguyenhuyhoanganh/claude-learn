# Bài 1: Redis Modules + RediSearch overview

App RB cần search bar: gõ "vintage piano" → trả items match. Hash/Set/Sorted Set không làm được full-text search. **Modules** mở rộng Redis với features mới — **RediSearch** giải bài toán search/index/query phức tạp. Phase này dạy RediSearch từ căn bản.

## Modules là gì?

> **Module** = chương trình C compile thành .so library, load vào Redis runtime. Module add **commands** và **data types** mới.

Module phổ biến:
- **RedisJSON**: lưu JSON document, support path query.
- **RediSearch**: index + full-text + multi-field search.
- **RedisTimeSeries**: time-series data optimized.
- **RedisGraph**: graph database.
- **RedisBloom**: probabilistic data structures (Bloom filter, Cuckoo filter).
- **RedisGears**: server-side functions (như AWS Lambda).

Khoá học cover **RediSearch** + bonus **RedisJSON**. Đây là 2 module phổ biến nhất.

## Redis Core vs Redis Stack

| | Redis Core | Redis Stack |
|---|---|---|
| Modules | KHÔNG (chỉ core types) | Có (JSON, Search, TS, Bloom, Gears) |
| Distribution | redis.io binary | Redis Stack bundle |
| License | RSALv2/SSPLv1 (Redis 7.4+) | Tương tự |
| Use case | Cache, simple data structures | Full-featured database |

**Redis Stack** = Redis Core + popular modules pre-installed. Recommend cho dev mới.

Cloud:
- **Redis Cloud** (paid): có Stack option.
- **Redis Cloud Free**: thường có sẵn Stack.
- **Self-host**: cài Redis Stack image (Docker) hoặc load modules manually.

## Cài Redis Stack

### Docker (recommended)

```bash
docker run -d --name redis-stack -p 6379:6379 -p 8001:8001 redis/redis-stack:latest
```

- Port 6379: Redis protocol.
- Port 8001: RedisInsight UI (browser).

### Cài module manual

Nếu đã có Redis chạy:
```bash
redis-server --loadmodule /path/to/redisearch.so
```

Hoặc trong `redis.conf`:
```conf
loadmodule /path/to/redisearch.so
```

Restart Redis. Verify:
```text
MODULE LIST
1) 1) "name"
   2) "search"
   3) "ver"
   4) (integer) 20810
```

## Vấn đề mà RediSearch giải

App RB hiện có:
- Items as Hash.
- Sort indexes (price, views, ending soon) as Sorted Set.
- Tag indexes (vd `items:tag:vintage`) as Set.

**Hạn chế**:
1. Search by name: chỉ exact match (`HGET items#42 name` = "Piano"). Không tìm "pian", "pianos", "PIANO".
2. Multi-criteria: filter price 100-500 AND tag vintage AND name có "piano" — phải intersection nhiều set, không scale.
3. Fuzzy match: typo "piamo" → match "piano"? Không.
4. Ranking: kết quả nào relevant nhất?

→ **RediSearch giải tất cả**. Index full-text + numeric + tag + geo, support fuzzy, prefix, BM25 scoring.

## Concept cốt lõi: Index

> **Index** = một structure RediSearch tự maintain, ánh xạ field hash/json → searchable tokens.

Khác Sorted Set/Set (bạn maintain thủ công), **index của RediSearch tự update** khi data thay đổi.

```text
FT.CREATE idx:items
  ON HASH                           # data type
  PREFIX 1 items#                   # áp cho keys items#*
  SCHEMA
    name      TEXT
    price     NUMERIC SORTABLE
    tags      TAG SEPARATOR ","
    location  GEO
```

→ Sau lệnh này, RediSearch tự index mọi key `items#*` theo schema.

Khi `HSET items#42 name "Vintage Piano" price 150 tags "vintage,music"`:
- RediSearch tự update index.
- Search `FT.SEARCH idx:items "piano"` trả về items#42.

## Cú pháp lệnh RediSearch

Bắt đầu bằng **`FT.`** (Full-Text):

```text
FT.CREATE      Tạo index
FT.DROPINDEX   Xoá index
FT.SEARCH      Search
FT.AGGREGATE   Aggregate (group by, count, sum, ...)
FT.EXPLAIN     Show execution plan
FT.PROFILE     Profile query performance
FT.INFO        Index info
FT.ALTER       Modify index
FT._LIST       List all indexes
```

## Search hoạt động ra sao?

```text
FT.SEARCH idx:items "@name:piano @price:[100 500]"
```

1. Parse query.
2. Lookup tokens trong inverted index.
3. Intersect/union theo operator.
4. Score results (BM25 by default).
5. Return paginated.

→ Mượt mà, fast. RediSearch dùng C native code.

## Performance characteristics

- **Indexing**: indexing 1 document ~50μs. Background indexing không block writes.
- **Search**: 1 query với 1M document ~5-50ms (depend complexity).
- **Memory**: index ~30-50% size of data. Cần memory budget.

Production usable cho app medium-scale (1-100M documents).

## RediSearch in production

Major users:
- StackOverflow (search).
- Hipster (e-commerce search).
- Nice (financial query).
- Many SaaS apps.

→ Tested at scale.

## So với Elasticsearch

| | RediSearch | Elasticsearch |
|---|---|---|
| Setup | Module trong Redis | Separate cluster |
| Latency | Sub-ms | 10-100ms |
| Features | Search, aggregate, vector | Full-featured (logs, metrics, traces) |
| Operational complexity | Như Redis | Hihger (JVM, Java) |
| License | RSALv2/SSPLv1 | Elastic License (proprietary) |

RediSearch lợi:
- Cùng infrastructure với cache → 1 less component.
- Sub-ms latency.
- Đủ feature cho 90% e-commerce search.

ES lợi:
- Mature ecosystem.
- Logs/metrics analytics.
- Geo-distributed cluster.

App RB scale nhỏ → RediSearch đủ.

## Khi nào KHÔNG dùng RediSearch?

1. **Logs/metrics analytics** với 1B+ document — ES purpose-built.
2. **Real-time analytics complex** — ClickHouse, Druid.
3. **Đơn giản hash lookup** — Hash + secondary index OK, không cần RediSearch overhead.

## Roadmap phase-18

7 bài tới:
- Bài 2: Tạo index, schema, field types overview.
- Bài 3: Numeric queries (range, comparison).
- Bài 4: Tag queries (categorical).
- Bài 5: Text queries (full-text).
- Bài 6: Fuzzy + prefix search.
- Bài 7: Pre-processing input (escape, sanitize).

Phase 19 sẽ apply RediSearch vào app RB cho search bar.

## Tóm tắt bài 1

- Module = extend Redis với commands + data types.
- Redis Stack = Redis Core + popular modules.
- RediSearch giải: full-text, multi-field index, range query, fuzzy match.
- Cú pháp `FT.*`. Index tự maintain trên hash/JSON.
- Performance: sub-ms cho query đơn, 5-50ms cho complex.
- Đủ cho 90% e-commerce search use case.

**Bài kế tiếp** → [Bài 2: Tạo index + field types](02-tao-index-field-types.md)

# Bài 2: Non-Relational Databases (NoSQL)

## Tại sao NoSQL ra đời?

NoSQL (mid-2000s) giải quyết các nhược điểm của relational DB:

| Vấn đề của SQL | Giải pháp NoSQL |
|---------------|-----------------|
| Rigid schema (tất cả records cùng structure) | Flexible schema (mỗi record có structure khác nhau) |
| Chỉ hỗ trợ table structure | Native data structures: lists, maps, documents |
| Designed for storage efficiency | Designed for **faster queries** |

**Trade-off khi dùng NoSQL:**
- ❌ Mất khả năng complex SQL queries
- ❌ JOIN operations khó hoặc không hỗ trợ
- ❌ ACID transactions hiếm khi được hỗ trợ đầy đủ
- ✅ Faster reads, flexible schema, horizontal scale

## Ba loại NoSQL Database

### 1. Key-Value Store

> Structure: `key → value` (value có thể là bất kỳ thứ gì)

```
key: "user:123:profile"
value: {"name": "Alice", "email": "alice@example.com", "age": 30}

key: "product:456:inventory"  
value: 42  (còn 42 cái)

key: "session:abc789"
value: binary blob (serialized session data)
```

**Giống hashtable/dictionary khổng lồ** — lookup O(1).

**Use cases:**
- **Caching**: Cache kết quả query phổ biến → tránh roundtrip đến DB
- **Session storage**: Lưu user sessions
- **Counters**: Like count, view count (multiple services read/write)
- **Feature flags, config**

**Popular:** Redis, DynamoDB, Memcached

### 2. Document Store

> Lưu collections of **documents** — mỗi document là object với attributes khác nhau.

```json
// Collection: users
{
    "id": "user123",
    "name": "Alice",
    "email": "alice@example.com",
    "preferences": {
        "theme": "dark",
        "language": "vi"
    },
    "tags": ["premium", "early-adopter"]
}

{
    "id": "user456",
    "name": "Bob",
    "email": "bob@example.com",
    "phone": "+84912345678",  ← Alice không có field này → OK!
    "company": "Tech Corp"    ← Flexible schema
}
```

Documents dễ map với objects trong programming languages (no ORM needed).

**Formats:** JSON, YAML, XML, BSON

**Use cases:**
- **User profiles**: khác nhau về structure
- **Content management**: articles, videos, images (different attributes)
- **Product catalogs**: products khác nhau có attributes khác nhau
- **Real-time analytics**: khi SQL quá chậm

**Popular:** MongoDB, Firestore, CouchDB, DynamoDB (also document store)

### 3. Graph Database

> Extension của document store với khả năng traverse và analyze **relationships** giữa records.

```
(Alice) --[FRIENDS_WITH]--> (Bob)
(Alice) --[BOUGHT]--> (Product A)
(Bob) --[BOUGHT]--> (Product A)
(Bob) --[BOUGHT]--> (Product B)

Query: "Recommend products to Alice based on friends' purchases"
→ Alice → friends → Bob → bought → Product B (Alice chưa mua)
```

**Use cases:**
- **Fraud detection**: Nhiều accounts dùng cùng IP/email/device → cùng người
- **Recommendation engines**: "Users similar to you also bought..."
- **Social networks**: Friend suggestions, mutual connections
- **Knowledge graphs**: Relationships between concepts

**Popular:** Neo4j, Amazon Neptune, ArangoDB

## Khi nào dùng NoSQL?

### Key-Value: Caching

```
Application → Cache miss → SQL DB (chậm)
                               ↓ cache result
Application → Cache hit → Redis (nhanh) ← 
```

### Document Store: Flexible Data

```
E-commerce products:
Phone:    {name, brand, OS, battery, camera_specs}
T-shirt:  {name, brand, size_chart, material, colors}
Book:     {name, author, ISBN, pages, genre}

→ Document store: mỗi document có structure riêng → OK
→ Relational DB: phải có column cho tất cả attributes → lãng phí, null
```

### Chọn SQL hay NoSQL?

```
Use SQL khi:
├── Data có inherent relationships
├── Cần ACID transactions
├── Cần complex analytics/reporting
└── Schema ổn định, ít thay đổi

Use NoSQL khi:
├── Cần query speed tối đa (caching)
├── Data unstructured hoặc semi-structured
├── Schema thay đổi thường xuyên
└── Need extreme horizontal scale
```

## Kết hợp SQL + NoSQL trong Production

```
PostgreSQL (source of truth)
    ↓ Real-time sync
Redis (cache layer)
    ↓ Read from cache first
Application → Cache hit: fast!
            → Cache miss: query PostgreSQL, store in Redis

→ Best of both worlds!
```

## Tóm tắt

```
NoSQL databases:
├── Key-Value: Fastest lookups, caching, counters
│   Popular: Redis, Memcached, DynamoDB
├── Document: Flexible schema, OOP-friendly
│   Popular: MongoDB, Firestore
└── Graph: Relationship traversal, recommendations
    Popular: Neo4j, Neptune

Trade-offs vs SQL:
├── ✅ Faster reads, flexible schema, easy horizontal scale
└── ❌ No complex queries, limited/no ACID, harder to join
```

---
**Tiếp theo:** Bài 3 - Techniques to Improve Database Performance →

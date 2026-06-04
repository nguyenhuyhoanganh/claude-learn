# Bài 2: Non-Relational Databases — NoSQL (Cơ sở dữ liệu phi quan hệ)

## Tại sao NoSQL ra đời?

Đầu thập niên 2000, các công ty như Google, Amazon, Facebook gặp phải vấn đề mà relational DB truyền thống không giải quyết được: data quá lớn (hàng petabyte), traffic quá cao (hàng triệu req/s), schema thay đổi quá nhanh. SQL trở thành **nút thắt cổ chai**.

NoSQL (Not Only SQL) sinh ra để giải quyết các điểm yếu cụ thể của relational DB:

| Vấn đề của SQL | Giải pháp NoSQL |
|---------------|-----------------|
| Schema cứng nhắc (mọi record phải có cùng cấu trúc) | Schema linh hoạt (mỗi record có cấu trúc khác nhau cũng được) |
| Chỉ hỗ trợ cấu trúc bảng (table) | Hỗ trợ nhiều cấu trúc tự nhiên: list, map, document, graph |
| Tối ưu cho **lưu trữ tiết kiệm** | Tối ưu cho **truy vấn nhanh** |
| Khó scale theo chiều ngang | Sinh ra để scale ngang hàng nghìn node |

**Trade-off (đánh đổi) khi chọn NoSQL:**

- ❌ Mất khả năng truy vấn SQL phức tạp (không có JOIN nhiều bảng, không có aggregation mạnh).
- ❌ Thao tác JOIN khó thực hiện hoặc không được hỗ trợ.
- ❌ ACID transactions hiếm khi được hỗ trợ đầy đủ (một số NoSQL có "ACID-lite").
- ✅ Đọc nhanh hơn rất nhiều, schema linh hoạt, scale ngang dễ dàng.

→ NoSQL **không thay thế** SQL. Hai bên có vai trò khác nhau, thường dùng **song song** trong hệ thống lớn.

## Ba loại NoSQL Database chính

NoSQL không phải là một thứ duy nhất — có nhiều họ database khác nhau, mỗi loại tối ưu cho một dạng truy cập dữ liệu.

### 1. Key-Value Store (Lưu theo cặp khoá-giá trị)

> **Cấu trúc**: `key → value` — value có thể là bất kỳ thứ gì (string, number, object, binary).

```text
key: "user:123:profile"
value: {"name": "Alice", "email": "alice@example.com", "age": 30}

key: "product:456:inventory"  
value: 42  (còn 42 cái trong kho)

key: "session:abc789"
value: binary blob (dữ liệu session đã serialize)
```

Bản chất giống một **hashtable / dictionary khổng lồ** — lookup theo key có độ phức tạp O(1), tức là cực kỳ nhanh dù có hàng tỉ key.

**Trường hợp sử dụng:**

- **Caching** (bộ nhớ đệm): Cache kết quả của các query phổ biến → tránh phải gọi database chính.
- **Session storage**: Lưu phiên đăng nhập của user (sau khi login, lưu session ID → user data).
- **Counters**: Like count, view count — nhiều service đọc/ghi đồng thời cực nhanh.
- **Feature flags, config**: Bật/tắt tính năng, lưu cấu hình động.

**Các sản phẩm phổ biến:** Redis, Memcached, Amazon DynamoDB, Riak.

### 2. Document Store (Lưu theo document)

> Lưu các **collection** chứa các **document** — mỗi document là một object có các attribute tự do.

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
    "phone": "+84912345678",  // Alice không có field này → OK
    "company": "Tech Corp"    // → schema linh hoạt
}
```

Document có thể chứa nested objects và array — map trực tiếp với object trong các ngôn ngữ lập trình. Không cần ORM (Object-Relational Mapper) phức tạp như khi dùng SQL.

**Định dạng phổ biến:** JSON, BSON (Binary JSON, MongoDB dùng), YAML, XML.

**Trường hợp sử dụng:**

- **User profiles**: Mỗi user có thể có set field khác nhau (admin có roles, customer có loyalty_points, ...).
- **Content management**: Articles, video, image — mỗi loại có attribute khác nhau.
- **Product catalogs**: Catalog đa dạng (điện thoại, áo, sách) — schema mỗi loại sản phẩm khác nhau.
- **Real-time analytics**: Khi SQL aggregation quá chậm cho dataset lớn.

**Các sản phẩm phổ biến:** MongoDB, Google Firestore, CouchDB, Amazon DynamoDB (cũng có chế độ document).

### 3. Graph Database (Cơ sở dữ liệu đồ thị)

> Mở rộng của document store, **chuyên xử lý mối quan hệ (relationship)** giữa các node — duyệt và phân tích graph cực nhanh.

Data được biểu diễn dưới dạng **node** (đỉnh) và **edge** (cạnh — quan hệ giữa các node):

```text
(Alice) --[FRIENDS_WITH]--> (Bob)
(Alice) --[BOUGHT]--> (Product A)
(Bob)   --[BOUGHT]--> (Product A)
(Bob)   --[BOUGHT]--> (Product B)

Truy vấn: "Recommend (gợi ý) sản phẩm cho Alice dựa trên việc mua của bạn bè"
→ Bắt đầu từ Alice → tìm friends → đến Bob → tìm các sản phẩm Bob mua
→ Lọc bỏ những sản phẩm Alice đã mua → còn Product B
→ Gợi ý Product B cho Alice
```

Trong relational DB, query này sẽ là chuỗi JOIN cực dài và chậm. Trong graph DB, đây là phép duyệt vài bước (graph traversal) — rất nhanh.

**Trường hợp sử dụng:**

- **Fraud detection (phát hiện gian lận)**: Nhiều tài khoản dùng cùng IP / email / device → có thể là cùng một người gian lận.
- **Recommendation engines** (hệ thống gợi ý): "Users tương tự bạn cũng đã mua...".
- **Social network**: Gợi ý bạn bè, mutual connections, second-degree connections.
- **Knowledge graphs**: Quan hệ giữa các khái niệm — Google Search dùng knowledge graph để hiểu ngữ cảnh truy vấn.

**Các sản phẩm phổ biến:** Neo4j, Amazon Neptune, ArangoDB, TigerGraph.

## Khi nào dùng NoSQL? (qua các ví dụ thực tế)

### Key-Value Store cho Caching

```text
Application → query cache trước
              ├── Cache miss → query SQL DB (chậm) → lưu vào Redis → trả về user
              └── Cache hit  → trả về từ Redis (nhanh!)
```

Pattern này có thể giảm 90%+ tải lên database chính. Sẽ học chi tiết trong bài 3 (database techniques).

### Document Store cho Data linh hoạt

```text
E-commerce products có cấu trúc rất khác nhau:

Phone:    {name, brand, OS, battery, camera_specs}
T-shirt:  {name, brand, size_chart, material, colors}
Book:     {name, author, ISBN, pages, genre}

→ Document store: mỗi document có structure riêng → tự nhiên
→ Relational DB: phải có column cho TẤT CẢ attribute của mọi loại
                 → bảng có hàng trăm cột, đa số là NULL → lãng phí + xấu
```

### Bảng quyết định: SQL hay NoSQL?

```text
Dùng SQL khi:
├── Data có quan hệ tự nhiên (orders ↔ users ↔ products)
├── Cần ACID transactions (tài chính, đặt hàng, kho)
├── Cần truy vấn phức tạp / analytics / reporting
└── Schema ổn định, ít thay đổi

Dùng NoSQL khi:
├── Cần tốc độ truy vấn tối đa (caching)
├── Data phi cấu trúc hoặc semi-structured (JSON tự do)
├── Schema thay đổi liên tục
└── Cần scale ngang cực lớn (petabyte+)
```

## Kết hợp SQL + NoSQL trong Production — Pattern phổ biến nhất

Trong hệ thống thật, hầu hết các công ty không chọn "SQL **hoặc** NoSQL" mà chọn **cả hai**, mỗi loại làm việc nó giỏi nhất:

```text
PostgreSQL (source of truth — nguồn dữ liệu chính)
    │
    │  Real-time sync (đồng bộ)
    ▼
Redis (cache layer — tầng cache)
    │
    │  Đọc từ cache trước
    ▼
Application
    ├── Cache hit:  trả về siêu nhanh từ Redis
    └── Cache miss: query PostgreSQL → lưu kết quả vào Redis → trả về user
```

Sự kết hợp này gọi là **polyglot persistence** (đa dạng lưu trữ) — best of both worlds (tận dụng ưu điểm của cả hai).

Ví dụ thực tế từ các công ty lớn:
- **Facebook**: MySQL (source of truth) + Memcached (cache) + Cassandra (timeline).
- **Netflix**: Cassandra (viewer activity) + MySQL (billing) + DynamoDB (session).
- **Uber**: Postgres (trips) + Redis (cache) + Cassandra (driver location).

## Tóm tắt bài 2

```text
3 loại NoSQL database chính:
├── Key-Value (Redis, Memcached, DynamoDB)
│       Lookup O(1) cực nhanh
│       → caching, session, counter
│
├── Document (MongoDB, Firestore)
│       Schema linh hoạt, OOP-friendly
│       → user profile, content, catalog
│
└── Graph (Neo4j, Neptune)
        Truy vấn quan hệ cực nhanh
        → fraud detection, recommendation, social

Trade-offs so với SQL:
├── ✅ Đọc nhanh, schema linh hoạt, scale ngang dễ
└── ❌ Không có truy vấn phức tạp, ACID hạn chế, khó JOIN

Production: thường kết hợp cả SQL + NoSQL (polyglot persistence)
```

Bài kế tiếp sẽ đi sâu vào các **kỹ thuật để cải thiện database performance** — indexing, partitioning, replication, caching — áp dụng được cho cả SQL và NoSQL.

---
**Bài kế tiếp**: [Bài 3 - Database Techniques (Kỹ thuật tối ưu database)](03-database-techniques.md) →

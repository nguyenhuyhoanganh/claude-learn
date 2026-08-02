# Bài 3: REST API

## REST là gì?

> **REST** (Representational State Transfer — Chuyển trạng thái biểu diễn) = Một tập hợp các **ràng buộc kiến trúc (architectural constraints)** và **best practices** để định nghĩa API cho ứng dụng web.

Một số đặc điểm:
- Được giới thiệu bởi **Roy Fielding** trong luận án tiến sĩ năm 2000.
- **KHÔNG phải standard hay protocol** — chỉ là một phong cách kiến trúc (architectural style).
- API tuân theo REST được gọi là **RESTful API**.

REST không phải bắt buộc — bạn có thể design API không theo REST cũng được. Nhưng REST đã trở thành **mặc định** của web API vì nó tận dụng HTTP một cách rất tự nhiên.

## REST khác RPC ở đâu?

| Tiêu chí | RPC | REST |
|---|---|---|
| **Trừu tượng hoá theo** | Methods / Actions (hành động) | **Resources** (tài nguyên có tên) |
| **Số lượng operation** | Vô hạn (đặt tên method tuỳ ý) | Bị giới hạn bởi HTTP verbs |
| **Focus chính** | WHAT to DO (làm cái gì) | WHAT (danh từ — tài nguyên là gì) |

Phép ẩn dụ:
- **RPC** = "Tôi muốn **làm** việc X" (động từ).
- **REST** = "Tôi muốn **tác động** lên đối tượng Y" (danh từ + cách tác động).

## 4 khái niệm cốt lõi

### Khái niệm 1: Resources (Tài nguyên)

Trong REST, **mọi thứ đều là resource (tài nguyên)** — không phải actions:

```text
✅ REST style — dùng danh từ (tài nguyên):
   /users, /movies, /orders

❌ RPC-style — dùng động từ (hành động):
   /getUser, /createOrder, /updateProfile
```

Resources có **cấu trúc phân cấp**, dùng dấu `/` để phân tầng:

```text
/movies                    ← Collection (tập hợp): tất cả phim
/movies/123                ← Single (1 cá thể): phim ID 123
/movies/123/reviews        ← Sub-collection: các review của phim 123
/movies/123/actors/456     ← Nested simple: diễn viên 456 trong phim 123
```

Cách đặt URI phải nhất quán — collection dùng số nhiều, single dùng ID.

### Khái niệm 2: HTTP Methods = Operations (HTTP verb chính là hành động)

REST dùng các động từ HTTP có sẵn để biểu diễn các thao tác CRUD:

| HTTP Method | Tác dụng CRUD | Idempotent? | Safe? (không thay đổi state) |
|---|---|---|---|
| **GET** | Read (đọc) | ✅ Có | ✅ Có |
| **POST** | Create (tạo) | ❌ Không | ❌ Không |
| **PUT** | Update / Replace (cập nhật toàn bộ) | ✅ Có | ❌ Không |
| **DELETE** | Delete (xoá) | ✅ Có | ❌ Không |
| **PATCH** | Partial Update (cập nhật một phần) | Tuỳ implementation | ❌ Không |

Quy tắc đặt:
- Đọc dữ liệu → GET.
- Tạo mới → POST.
- Cập nhật toàn bộ → PUT.
- Cập nhật vài field → PATCH.
- Xoá → DELETE.

### Khái niệm 3: Stateless Server (Server không lưu state phiên)

Server **KHÔNG lưu session state** về client giữa các request:
- Mỗi request phải **chứa đủ thông tin** để server xử lý.
- Cho phép **horizontal scaling tự do** — bất kỳ server nào cũng có thể xử lý bất kỳ request nào.
- Client có thể gửi request đến server khác nhau → không quan trọng (vì server không nhớ gì).

⚠️ Stateless **không có nghĩa là không có authentication**. Authentication được gửi kèm trong mỗi request (vd: JWT token trong header). Server chỉ không lưu trạng thái phiên (session) thôi.

Lợi ích của stateless:
- Dễ scale (thêm server tuỳ ý).
- Dễ recover khi server chết (request tiếp theo bay sang server khác).
- Đơn giản hoá load balancer (không cần sticky session).

### Khái niệm 4: Cacheability (Khả năng cache)

Response **phải explicit** chỉ ra là cacheable hay không (được cache hay không):

```text
Cache-Control: max-age=3600       ← Cache được trong 1 giờ
Cache-Control: no-cache           ← Không cache
Cache-Control: private            ← Chỉ client cache, không CDN
Cache-Control: public, max-age=86400  ← Public, cache 1 ngày (cho CDN)
```

Cache đúng cách giúp:
- Giảm tải server (request đã cache không cần gọi lại).
- Giảm latency cho user (CDN gần user hơn server).
- Tăng availability (CDN còn dữ liệu cũ khi server down).

## REST API Design — Quy trình 4 bước

### Bước 1: Xác định Entities (Thực thể)

Liệt kê các thực thể chính của business domain.

**Ví dụ Movie Streaming Service:**
```text
Entities: Users, Movies, Reviews, Actors, Subscriptions
```

### Bước 2: Map Entities → URIs

Mỗi entity → URI tương ứng. Dùng số nhiều cho collection:

```text
/users                  ← Collection: tất cả user
/users/{id}             ← Single: user cụ thể
/movies                 ← Collection: tất cả phim
/movies/{id}            ← Single: phim cụ thể
/movies/{id}/reviews    ← Sub-collection: review của phim đó
/actors                 ← Collection: tất cả diễn viên
```

### Bước 3: Chọn Representation (Cách biểu diễn dữ liệu)

Thường dùng **JSON** (gần như là tiêu chuẩn de facto):

```json
// GET /movies — danh sách
{
    "movies": [
        {"id": 1, "title": "Inception", "year": 2010},
        {"id": 2, "title": "Interstellar", "year": 2014}
    ],
    "total": 2,
    "links": {
        "next": "/movies?page=2"
    }
}

// GET /movies/1 — chi tiết
{
    "id": 1,
    "title": "Inception",
    "year": 2010,
    "director": "Christopher Nolan",
    "links": {
        "reviews": "/movies/1/reviews",
        "actors": "/movies/1/actors",
        "stream": "/stream/movies/1"
    }
}
```

Ngoài JSON có thể dùng XML, MessagePack, Protocol Buffers — nhưng JSON phổ biến nhất vì human-readable và dễ debug.

### Bước 4: Assign HTTP Methods (Gán phương thức HTTP cho từng endpoint)

```text
POST    /users              → Đăng ký user mới
GET     /users/{id}         → Lấy thông tin user
PUT     /users/{id}         → Cập nhật toàn bộ user
PATCH   /users/{id}         → Cập nhật vài field của user
DELETE  /users/{id}         → Xoá user

GET     /movies             → Danh sách phim (có pagination)
POST    /movies             → Thêm phim mới (admin)
GET     /movies/{id}        → Chi tiết phim
DELETE  /movies/{id}        → Xoá phim (admin)

POST    /movies/{id}/reviews   → Gửi review cho phim
GET     /movies/{id}/reviews   → Lấy danh sách review của phim
```

## Best Practices về đặt tên (Naming)

```text
✅ Chỉ dùng danh từ:          /users, /orders, /products
❌ Không dùng động từ:        /getUser, /createOrder

✅ Số nhiều cho collection:   /users, /movies, /actors
✅ Singular cho simple field: /users/{id}, /movies/{id}/profile

✅ Có ý nghĩa rõ:             /products, /categories, /reviews
❌ Quá chung:                 /items, /entities, /objects

✅ ID URL-friendly:           /users/abc123 (không space, không ký tự đặc biệt)
❌ ID có ký tự đặc biệt:      /users/abc 123 (cần encode)
```

## HATEOAS (Hypermedia as the Engine of Application State)

Một nguyên lý cao cấp của REST: **response nên kèm theo các link để hướng dẫn client làm gì tiếp**.

```json
{
    "user_id": 42,
    "name": "Alice",
    "_links": {
        "self": "/users/42",
        "orders": "/users/42/orders",
        "update": {"method": "PUT", "href": "/users/42"},
        "delete": {"method": "DELETE", "href": "/users/42"}
    }
}
```

→ Client **không cần hardcode URL** — chỉ cần follow các link trong response.

→ Server có thể đổi URL pattern mà client vẫn chạy được (decoupling).

HATEOAS là phần "tinh hoa" của REST nhưng ít implementation thực tế nào theo đầy đủ. Hầu hết REST API hiện đại chỉ dừng ở mức "RESTful" cơ bản (không HATEOAS).

## REST giúp đạt được Quality Attributes nào?

| Quality Attribute | Cơ chế REST cung cấp |
|---|---|
| **Scalability** | Stateless server → horizontal scaling dễ dàng (thêm server tuỳ ý) |
| **Performance** | Caching response giảm tải server, giảm latency |
| **Availability** | Stateless → bất kỳ instance nào cũng phục vụ được, không cần sticky session |
| **Interoperability** | HTTP được hỗ trợ rộng rãi (browser, mobile, IoT, command line) |
| **Cacheability** | Tích hợp sẵn vào HTTP, có CDN hỗ trợ |

## Tóm tắt bài 3

```text
REST = Resource-oriented API style chạy trên HTTP

4 khái niệm cốt lõi:
├── Resources (danh từ):    /users, /movies/{id}/reviews
├── HTTP Methods (động từ): GET, POST, PUT, DELETE, PATCH
├── Stateless server:       Mỗi request tự chứa đủ thông tin
└── Cacheable:              Explicit chỉ định cache → giảm tải, tăng tốc

Quy trình thiết kế REST API (4 bước):
1. Identify entities          (xác định thực thể)
2. Map entities → URIs        (hierarchy với /)
3. Choose representation       (JSON là phổ biến nhất)
4. Assign HTTP methods         (CRUD → verbs)

Naming: noun (số nhiều cho collection), meaningful, URL-friendly
```

Hoàn thành Phase 3. Bạn đã hiểu 2 phong cách API chính (RPC và REST), khi nào dùng cái nào. Phase 4 sẽ bắt đầu chuyển sang **Architectural Building Blocks** — các thành phần lego để xây dựng hệ thống.

---
**Bài kế tiếp**: [Phase 4 - Architectural Building Blocks](../phase-4/01-dns-load-balancing-gslb.md) →

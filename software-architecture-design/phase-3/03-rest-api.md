# Bài 3: REST API

## REST là gì?

> **REST** (Representational State Transfer) = Một tập hợp các architectural constraints và best practices để định nghĩa API cho web.

- Được giới thiệu bởi Roy Fielding trong dissertation năm 2000
- Không phải standard hay protocol — chỉ là architectural style
- API tuân theo REST gọi là **RESTful API**

## REST vs RPC

| | RPC | REST |
|--|-----|------|
| **Abstraction** | Methods/Actions | **Resources** (named entities) |
| **Operations** | Vô hạn methods | Giới hạn HTTP verbs |
| **Focus** | What to DO | WHAT (noun, resource) |

## Core Concepts

### 1. Resources

Mọi thứ đều là resource — không phải actions:

```
✅ REST resources:    /users, /movies, /orders
❌ RPC-style:         /getUser, /createOrder, /updateProfile
```

Resources có hierarchy, dùng `/` để phân cấp:

```
/movies                    ← Collection resource
/movies/123                ← Single resource (movie #123)
/movies/123/reviews        ← Sub-collection (reviews of movie 123)
/movies/123/actors/456     ← Nested simple resource
```

### 2. HTTP Methods = Operations

REST dùng HTTP verbs để express operations:

| HTTP Method | CRUD | Idempotent | Safe |
|------------|------|-----------|------|
| **GET** | Read | ✅ | ✅ |
| **POST** | Create | ❌ | ❌ |
| **PUT** | Update/Replace | ✅ | ❌ |
| **DELETE** | Delete | ✅ | ❌ |
| **PATCH** | Partial Update | Depends | ❌ |

### 3. Stateless Server

Server **không lưu session state** về client:
- Mỗi request phải chứa đủ thông tin để xử lý
- Cho phép horizontal scaling tự do (any server can handle any request)
- Client có thể send request đến server khác nhau → không quan trọng

### 4. Cacheability

Response phải explicitly chỉ ra cacheable hay không:
```
Cache-Control: max-age=3600    ← Cacheable 1 giờ
Cache-Control: no-cache        ← Không cache
```

## REST API Design Step by Step

### Bước 1: Xác định Entities

Ví dụ Movie Streaming Service:
```
Entities: Users, Movies, Reviews, Actors
```

### Bước 2: Map Entities → URIs

```
/users              ← Collection: all users
/users/{id}         ← Single: specific user
/movies             ← Collection: all movies
/movies/{id}        ← Single: specific movie
/movies/{id}/reviews    ← Sub-collection: reviews of movie
/actors             ← Collection: all actors
```

### Bước 3: Chọn Representation

Thường dùng JSON:
```json
// GET /movies
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

// GET /movies/1
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

### Bước 4: Assign HTTP Methods

```
POST   /users              → Register new user
GET    /users/{id}         → Get user profile
PUT    /users/{id}         → Update user profile
DELETE /users/{id}         → Delete user

GET    /movies             → List movies
POST   /movies             → Add new movie (admin)
GET    /movies/{id}        → Get movie details
DELETE /movies/{id}        → Remove movie (admin)

POST   /movies/{id}/reviews → Submit review
GET    /movies/{id}/reviews → Get all reviews
```

## Naming Best Practices

```
✅ Nouns only:       /users, /orders, /products
❌ Verbs:           /getUser, /createOrder

✅ Plural collections: /users, /movies, /actors
✅ Singular simple:    /users/{id}, /movies/{id}/profile

✅ Meaningful:      /products, /categories, /reviews
❌ Generic:         /items, /entities, /objects

✅ URL-friendly ID: /users/abc123 (không có spaces, special chars)
```

## HATEOAS (Hypermedia as Engine of Application State)

REST responses nên kèm links để guide client:

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

→ Client không cần hardcode URLs — follow links từ response.

## REST giúp đạt Quality Attributes gì?

| Quality Attribute | Cơ chế |
|------------------|--------|
| **Scalability** | Stateless server → horizontal scaling dễ dàng |
| **Performance** | Caching responses reduce load |
| **Availability** | Stateless → any instance can serve |
| **Interoperability** | HTTP widely supported |

## Tóm tắt

```
REST = Resource-oriented API style trên HTTP

Key concepts:
├── Resources (nouns): /users, /movies/{id}/reviews
├── HTTP Methods (verbs): GET, POST, PUT, DELETE
├── Stateless: mọi request self-contained
└── Cacheable: reduce load, improve performance

Design steps:
1. Identify entities
2. Map to URIs (hierarchy with /)
3. Choose representation (JSON)
4. Assign HTTP methods
```

---
**Tiếp theo:** Phase 4 - Architectural Building Blocks →

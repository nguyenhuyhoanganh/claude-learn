# Bài 1: GraphQL với gqlgen — Schema-first API alternative

REST có vấn đề: over-fetching (lấy thừa data) và under-fetching (cần N request để có data đủ). GraphQL fix bằng cho client **mô tả chính xác** data cần. Một query, một response, đủ field. Bài này: GraphQL fundamentals, dùng `gqlgen` của Go (schema-first, type-safe), build E-Commerce GraphQL trên cùng service layer Phase 14.

## REST vs GraphQL

```text
[REST]
GET /users/42         → toàn bộ user (id, name, email, address, profile, ...)
GET /users/42/orders  → 1 request nữa
GET /orders/123/items → 1 nữa
=> 3 round-trip, mỗi response chứa thừa field

[GraphQL]
POST /graphql
{
    user(id: 42) {
        name
        email
        orders {
            total
            items { name, price }
        }
    }
}
=> 1 round-trip, chỉ field cần
```

## GraphQL concepts

```text
[Type]              Định nghĩa structure data
[Query]             Read operation (giống GET)
[Mutation]          Write operation (POST/PUT/DELETE)
[Subscription]      Real-time (WebSocket)
[Resolver]          Function trả data cho field
[Schema]            Type + Query + Mutation declaration
[Scalar]            Primitive: Int, Float, String, Boolean, ID
[Directive]         @auth, @deprecated, ...
```

## Schema example

```graphql
# schema.graphql

type User {
    id: ID!
    email: String!
    name: String!
    orders: [Order!]!
}

type Product {
    id: ID!
    name: String!
    price: Float!
    stock: Int!
    category: Category!
}

type Order {
    id: ID!
    user: User!
    items: [OrderItem!]!
    total: Float!
    status: OrderStatus!
    createdAt: Time!
}

type OrderItem {
    product: Product!
    quantity: Int!
    price: Float!
}

enum OrderStatus {
    PENDING
    PAID
    SHIPPED
    DELIVERED
    CANCELLED
}

input CreateOrderInput {
    items: [OrderItemInput!]!
}

input OrderItemInput {
    productId: ID!
    quantity: Int!
}

type Query {
    me: User
    product(id: ID!): Product
    products(category: String, page: Int = 1, limit: Int = 20): [Product!]!
    order(id: ID!): Order
    myOrders: [Order!]!
}

type Mutation {
    register(email: String!, password: String!, name: String!): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    createOrder(input: CreateOrderInput!): Order!
    cancelOrder(id: ID!): Order!
}

type AuthPayload {
    token: String!
    user: User!
}

scalar Time
```

Notes:
- `!` = non-null (required).
- `[T!]!` = non-null array của non-null T.
- `enum` = type-safe constant.
- `input` cho mutation argument.
- `scalar Time` custom type.

## gqlgen — Code generation

```bash
go install github.com/99designs/gqlgen@latest

mkdir graphql-api && cd graphql-api
go mod init github.com/yourname/graphql-api

gqlgen init
# Creates: schema.graphql, gqlgen.yml, server.go, generated/ scaffold
```

`gqlgen.yml`:
```yaml
schema:
  - schema.graphql

exec:
  filename: generated/generated.go
  package: generated

model:
  filename: generated/models_gen.go
  package: generated

resolver:
  layout: follow-schema
  dir: graph
  package: graph

autobind:
  - "github.com/yourname/graphql-api/models"
```

Generate:
```bash
go run github.com/99designs/gqlgen generate
```

→ Sinh code resolver interface, marshaler, unmarshaler. Bạn implement resolver.

## Implement resolver

```go
// graph/resolver.go
package graph

type Resolver struct {
    userSvc    services.UserService
    productSvc services.ProductService
    orderSvc   services.OrderService
    jwt        *auth.JWTManager
}

// graph/query.resolvers.go (auto-generated stub)
func (r *queryResolver) Me(ctx context.Context) (*models.User, error) {
    claims, ok := auth.UserFromContext(ctx)
    if !ok { return nil, errUnauthenticated }
    return r.userSvc.GetByID(ctx, claims.UserID)
}

func (r *queryResolver) Product(ctx context.Context, id string) (*models.Product, error) {
    pid, _ := strconv.Atoi(id)
    return r.productSvc.GetByID(ctx, pid)
}

func (r *queryResolver) Products(ctx context.Context, category *string, page *int, limit *int) ([]*models.Product, error) {
    p, l := 1, 20
    if page != nil { p = *page }
    if limit != nil { l = *limit }
    return r.productSvc.List(ctx, category, p, l)
}

// graph/mutation.resolvers.go
func (r *mutationResolver) Register(ctx context.Context, email, password, name string) (*models.AuthPayload, error) {
    user, err := r.userSvc.Register(ctx, email, password, name)
    if err != nil {
        if errors.Is(err, services.ErrEmailTaken) {
            return nil, gqlerror.Errorf("email already taken")
        }
        return nil, gqlerror.Errorf("registration failed")
    }
    
    token, _ := r.jwt.Generate(user.ID, user.Email, user.Role)
    return &models.AuthPayload{
        Token: token,
        User:  user,
    }, nil
}
```

## Type resolver — Nested fields

Field `User.orders` không lưu trực tiếp trên User. Tách resolver:

```go
// graph/user.resolvers.go
func (r *userResolver) Orders(ctx context.Context, obj *models.User) ([]*models.Order, error) {
    return r.orderSvc.ListByUser(ctx, obj.ID)
}

// graph/order.resolvers.go
func (r *orderResolver) User(ctx context.Context, obj *models.Order) (*models.User, error) {
    return r.userSvc.GetByID(ctx, obj.UserID)
}

func (r *orderResolver) Items(ctx context.Context, obj *models.Order) ([]*models.OrderItem, error) {
    return r.orderSvc.GetItems(ctx, obj.ID)
}
```

→ Khi client query `user { orders { items } }` → gọi nested resolver.

## N+1 problem — DataLoader

Naive nested resolver tạo bug N+1:
```graphql
query { products { category { name } } }
```
→ 1 query list products + N query category (mỗi product 1 query).

Fix: **batch loading** với DataLoader:
```bash
go get github.com/graph-gophers/dataloader/v7
```

```go
type CategoryLoader struct {
    *dataloader.Loader[int, *models.Category]
}

func NewCategoryLoader(svc CategoryService) *CategoryLoader {
    batchFn := func(ctx context.Context, ids []int) []*dataloader.Result[*models.Category] {
        cats, _ := svc.GetByIDs(ctx, ids)
        catMap := map[int]*models.Category{}
        for _, c := range cats { catMap[c.ID] = c }
        
        results := make([]*dataloader.Result[*models.Category], len(ids))
        for i, id := range ids {
            if c, ok := catMap[id]; ok {
                results[i] = &dataloader.Result[*models.Category]{Data: c}
            } else {
                results[i] = &dataloader.Result[*models.Category]{Error: errNotFound}
            }
        }
        return results
    }
    return &CategoryLoader{dataloader.NewBatchedLoader(batchFn)}
}

// Resolver dùng
func (r *productResolver) Category(ctx context.Context, obj *models.Product) (*models.Category, error) {
    loader := loaders.FromContext(ctx).Category
    return loader.Load(ctx, obj.CategoryID)()
}
```

→ Tất cả category request trong cùng "tick" được batch thành 1 query SQL.

## Authentication middleware

```go
func GraphQLAuthMiddleware(jm *auth.JWTManager) func(http.Handler) http.Handler {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            token := r.Header.Get("Authorization")
            if strings.HasPrefix(token, "Bearer ") {
                claims, err := jm.Verify(strings.TrimPrefix(token, "Bearer "))
                if err == nil {
                    ctx := context.WithValue(r.Context(), userKey, claims)
                    r = r.WithContext(ctx)
                }
            }
            // Note: KHÔNG fail nếu không có token — query public OK
            next.ServeHTTP(w, r)
        })
    }
}
```

Resolver tự check auth:
```go
func (r *queryResolver) Me(ctx context.Context) (*models.User, error) {
    claims, ok := auth.UserFromContext(ctx)
    if !ok { return nil, gqlerror.Errorf("unauthenticated") }
    return r.userSvc.GetByID(ctx, claims.UserID)
}
```

## Setup HTTP server

```go
import (
    "github.com/99designs/gqlgen/graphql/handler"
    "github.com/99designs/gqlgen/graphql/playground"
)

func main() {
    // Init service layer (như Phase 14)
    r := &graph.Resolver{
        userSvc:    userSvc,
        productSvc: productSvc,
        orderSvc:   orderSvc,
        jwt:        jm,
    }
    
    srv := handler.NewDefaultServer(generated.NewExecutableSchema(
        generated.Config{Resolvers: r},
    ))
    
    // Playground UI cho dev
    http.Handle("/", playground.Handler("GraphQL Playground", "/graphql"))
    http.Handle("/graphql", GraphQLAuthMiddleware(jm)(srv))
    
    log.Println("listening on :8080")
    http.ListenAndServe(":8080", nil)
}
```

→ Browse `http://localhost:8080/` → GraphQL Playground tương tác.

## Test query

```graphql
mutation Register {
    register(email: "alice@x.com", password: "secret123", name: "Alice") {
        token
        user { id name }
    }
}

mutation Login {
    login(email: "alice@x.com", password: "secret123") {
        token
        user { id name email }
    }
}

# Set Authorization: Bearer <token> trong header

query Me {
    me {
        id
        email
        name
        orders {
            id
            total
            items { product { name } quantity price }
        }
    }
}

query Products {
    products(category: "shoes", limit: 5) {
        id name price stock
    }
}

mutation CreateOrder {
    createOrder(input: {
        items: [
            { productId: "1", quantity: 2 }
            { productId: "5", quantity: 1 }
        ]
    }) {
        id total status
    }
}
```

## REST vs GraphQL — Khi nào dùng gì?

| Use case | REST | GraphQL |
|---|---|---|
| Internal microservice | ✓ | |
| Public API consumed by various clients | | ✓ |
| Mobile app (giảm bandwidth) | | ✓ |
| CDN cache HTTP response | ✓ | (khó cache) |
| Simple CRUD | ✓ | overkill |
| Complex nested data | | ✓ |
| File upload | ✓ | hỗ trợ nhưng phức tạp |
| WebSocket subscription | (SSE) | ✓ |
| Versioning | URL versioning | Schema evolution |

## Bẫy thường gặp với GraphQL

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| N+1 query | Slow | DataLoader |
| Không giới hạn query depth | DoS với nested loop | Max depth middleware |
| Không giới hạn query complexity | DoS với 1000 field | Query complexity analyzer |
| Auth check thiếu nhiều resolver | Data leak | Middleware + directive |
| Error message leak internal | Security | Sanitize error |
| Mutation không idempotent | Duplicate | Idempotency key |
| Cache GET request | GraphQL POST → khó | Persisted queries |
| Versioning schema | Break client | Deprecation warnings |

## Auth directive

```graphql
directive @auth on FIELD_DEFINITION

type Query {
    me: User @auth
    myOrders: [Order!]! @auth
}
```

Implement directive:
```go
func AuthDirective(ctx context.Context, obj any, next graphql.Resolver) (any, error) {
    if _, ok := auth.UserFromContext(ctx); !ok {
        return nil, gqlerror.Errorf("unauthenticated")
    }
    return next(ctx)
}
```

→ Reusable, declarative auth.

## Tóm tắt bài 1

- GraphQL fix REST over/under-fetching: client mô tả field cần.
- gqlgen = schema-first + code generation Go.
- Type, Query, Mutation, Subscription, Resolver, Scalar, Directive.
- Nested field resolved bằng type resolver (`UserResolver.Orders`).
- **N+1 problem** → DataLoader batch load.
- Auth: middleware inject context + directive `@auth`.
- Playground UI dev: `http://localhost:8080/`.
- Trade-off REST vs GraphQL: cache, file upload (REST mạnh) vs flexibility (GraphQL).

**Bài kế tiếp** → [Bài 2: Mocking với testify/mock + Full-text search](02-mocking-search.md)

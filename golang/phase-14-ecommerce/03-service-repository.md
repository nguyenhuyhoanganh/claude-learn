# Bài 3: Service layer + Repository pattern + Dependency Injection

Tách logic thành **layer** là chìa khoá maintainability cho project lớn. Handler không gọi SQL trực tiếp, Service không biết HTTP, Repository không chứa business logic. Mỗi layer phụ thuộc **interface** — test mock dễ, đổi implementation dễ. Bài này build pattern hoàn chỉnh cho e-commerce.

## 3-layer architecture

```text
HTTP Request
    │
    ▼
[Handler]                          ← parse req, call service, write resp
    │ (depends on Service interface)
    ▼
[Service]                          ← business logic, validate, orchestrate
    │ (depends on Repository interface)
    ▼
[Repository]                       ← raw SQL, DB access
    │
    ▼
PostgreSQL
```

Each layer:
- Phụ thuộc **interface** của layer dưới (DI).
- Có **test** riêng (mock layer dưới).
- Có thể swap implementation (real DB ↔ mock DB).

## Repository interface + impl

```go
// internal/repository/user_repo.go
package repository

import "context"

type UserRepository interface {
    Create(ctx context.Context, u *User) error
    GetByID(ctx context.Context, id int) (*User, error)
    GetByEmail(ctx context.Context, email string) (*User, error)
    Update(ctx context.Context, u *User) error
    Delete(ctx context.Context, id int) error
    List(ctx context.Context, limit, offset int) ([]*User, int, error)
}

// Implementation Postgres
type userRepo struct {
    db *sqlx.DB
}

func NewUserRepo(db *sqlx.DB) UserRepository {
    return &userRepo{db: db}
}

func (r *userRepo) Create(ctx context.Context, u *User) error {
    return r.db.QueryRowxContext(ctx, `
        INSERT INTO users (email, password_hash, name)
        VALUES ($1, $2, $3)
        RETURNING id, created_at
    `, u.Email, u.PasswordHash, u.Name).Scan(&u.ID, &u.CreatedAt)
}

func (r *userRepo) GetByID(ctx context.Context, id int) (*User, error) {
    var u User
    err := r.db.GetContext(ctx, &u, `
        SELECT id, email, password_hash, name, role, created_at, updated_at
        FROM users WHERE id = $1
    `, id)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrNotFound
    }
    return &u, err
}

func (r *userRepo) GetByEmail(ctx context.Context, email string) (*User, error) {
    var u User
    err := r.db.GetContext(ctx, &u, `
        SELECT id, email, password_hash, name, role, created_at, updated_at
        FROM users WHERE email = $1
    `, email)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, ErrNotFound
    }
    return &u, err
}

// ... List, Update, Delete
```

Pattern:
- **Interface** define contract.
- **Constructor** `New*` return interface (caller không biết struct concrete).
- **Sentinel error** `ErrNotFound` cho map → HTTP 404.

## Service layer

```go
// internal/services/user_service.go
package services

import "context"

var (
    ErrEmailTaken = errors.New("email already taken")
    ErrInvalidPwd = errors.New("password too weak")
)

type UserService interface {
    Register(ctx context.Context, email, password, name string) (*User, error)
    Login(ctx context.Context, email, password string) (*User, string, error)
    GetProfile(ctx context.Context, id int) (*User, error)
    UpdateProfile(ctx context.Context, id int, updates UpdateUserInput) error
}

type userService struct {
    repo   repository.UserRepository
    jwt    *auth.JWTManager
    log    *slog.Logger
}

func NewUserService(repo repository.UserRepository, jwt *auth.JWTManager, log *slog.Logger) UserService {
    return &userService{repo: repo, jwt: jwt, log: log}
}

func (s *userService) Register(ctx context.Context, email, password, name string) (*User, error) {
    // Business validation
    if len(password) < 8 {
        return nil, ErrInvalidPwd
    }
    
    // Check exists
    if _, err := s.repo.GetByEmail(ctx, email); err == nil {
        return nil, ErrEmailTaken
    }
    
    // Hash password
    hash, err := auth.HashPassword(password)
    if err != nil {
        return nil, fmt.Errorf("hash password: %w", err)
    }
    
    user := &User{
        Email:        email,
        PasswordHash: hash,
        Name:         name,
        Role:         "user",
    }
    
    if err := s.repo.Create(ctx, user); err != nil {
        return nil, fmt.Errorf("create user: %w", err)
    }
    
    s.log.Info("user registered", "id", user.ID, "email", email)
    return user, nil
}

func (s *userService) Login(ctx context.Context, email, password string) (*User, string, error) {
    user, err := s.repo.GetByEmail(ctx, email)
    if err != nil {
        return nil, "", ErrNotFound
    }
    
    if err := auth.VerifyPassword(user.PasswordHash, password); err != nil {
        return nil, "", ErrNotFound   // same error
    }
    
    token, err := s.jwt.Generate(user.ID, user.Email, user.Role)
    if err != nil {
        return nil, "", fmt.Errorf("gen token: %w", err)
    }
    
    return user, token, nil
}
```

Pattern:
- Service **wrap** repo + thêm business logic.
- Validate + hash + orchestrate trong service.
- Repository chỉ CRUD.

## Handler layer

```go
// internal/handlers/user_handler.go
package handlers

type UserHandler struct {
    svc services.UserService
    log *slog.Logger
}

func NewUserHandler(svc services.UserService, log *slog.Logger) *UserHandler {
    return &UserHandler{svc: svc, log: log}
}

func (h *UserHandler) Register(w http.ResponseWriter, r *http.Request) {
    var req dto.RegisterRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, 400, "invalid json")
        return
    }
    if err := validate.Struct(req); err != nil {
        writeError(w, 400, err.Error())
        return
    }
    
    user, err := h.svc.Register(r.Context(), req.Email, req.Password, req.Name)
    if err != nil {
        switch {
        case errors.Is(err, services.ErrEmailTaken):
            writeError(w, 409, "email already taken")
        case errors.Is(err, services.ErrInvalidPwd):
            writeError(w, 400, "password too weak")
        default:
            h.log.Error("register", "error", err)
            writeError(w, 500, "internal error")
        }
        return
    }
    
    writeJSON(w, 201, dto.UserResponse{
        ID: user.ID, Email: user.Email, Name: user.Name,
    })
}
```

Pattern:
- Handler **không** biết DB, không biết bcrypt.
- Switch error sentinel → HTTP code.
- Map model → DTO trước khi response.

## DTO — Data Transfer Object

Tách model domain vs JSON response:

```go
// internal/models/user.go
type User struct {
    ID           int
    Email        string
    PasswordHash string    // ← KHÔNG bao giờ expose
    Name         string
    Role         string
    CreatedAt    time.Time
    UpdatedAt    time.Time
}

// internal/dto/user_dto.go
type RegisterRequest struct {
    Email    string `json:"email" validate:"required,email"`
    Password string `json:"password" validate:"required,min=8"`
    Name     string `json:"name" validate:"required,max=100"`
}

type UserResponse struct {
    ID        int       `json:"id"`
    Email     string    `json:"email"`
    Name      string    `json:"name"`
    Role      string    `json:"role"`
    CreatedAt time.Time `json:"created_at"`
}
```

→ User model có `PasswordHash`; UserResponse không. Compiler không cho leak.

## Wire — DI bằng tay

```go
// cmd/api/main.go
func main() {
    cfg, err := config.Load()
    if err != nil { log.Fatal(err) }
    
    log := logger.New(cfg.Env)
    
    db, err := database.Open(cfg)
    if err != nil { log.Error("db", "error", err); os.Exit(1) }
    defer db.Close()
    
    // Wire dependencies
    jm := auth.NewJWTManager(cfg.JWTSecret, cfg.JWTLifetime)
    
    userRepo := repository.NewUserRepo(db)
    productRepo := repository.NewProductRepo(db)
    cartRepo := repository.NewCartRepo(db)
    orderRepo := repository.NewOrderRepo(db)
    
    userSvc := services.NewUserService(userRepo, jm, log)
    productSvc := services.NewProductService(productRepo, log)
    cartSvc := services.NewCartService(cartRepo, productRepo, log)
    orderSvc := services.NewOrderService(orderRepo, cartRepo, log)
    
    userH := handlers.NewUserHandler(userSvc, log)
    productH := handlers.NewProductHandler(productSvc, log)
    cartH := handlers.NewCartHandler(cartSvc, log)
    orderH := handlers.NewOrderHandler(orderSvc, log)
    
    // Routes
    r := chi.NewRouter()
    setupMiddleware(r, log)
    setupRoutes(r, jm, userH, productH, cartH, orderH)
    
    // Server
    srv := &http.Server{
        Addr: fmt.Sprintf(":%d", cfg.Port),
        Handler: r,
        ReadTimeout: 5 * time.Second,
        WriteTimeout: 10 * time.Second,
    }
    
    // Graceful shutdown
    go func() {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            log.Error("server", "error", err)
            os.Exit(1)
        }
    }()
    log.Info("server started", "port", cfg.Port)
    
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit
    
    log.Info("shutting down")
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()
    srv.Shutdown(ctx)
}
```

→ Wire bằng tay rõ ràng, không "magic". Caveat: `main.go` dài.

Alternative: `google/wire` (codegen DI). Trade-off complexity.

## Setup routes

```go
func setupRoutes(r chi.Router, jm *auth.JWTManager,
    userH *UserHandler, productH *ProductHandler,
    cartH *CartHandler, orderH *OrderHandler) {
    
    // Public
    r.Post("/api/auth/register", userH.Register)
    r.Post("/api/auth/login", userH.Login)
    
    r.Get("/api/products", productH.List)
    r.Get("/api/products/{id}", productH.Get)
    
    // Authenticated
    r.Group(func(r chi.Router) {
        r.Use(AuthMiddleware(jm))
        
        r.Get("/api/me", userH.Profile)
        r.Put("/api/me", userH.UpdateProfile)
        
        r.Get("/api/cart", cartH.Get)
        r.Post("/api/cart/items", cartH.AddItem)
        r.Delete("/api/cart/items/{id}", cartH.RemoveItem)
        
        r.Post("/api/orders", orderH.Create)
        r.Get("/api/orders", orderH.List)
        r.Get("/api/orders/{id}", orderH.Get)
    })
    
    // Admin only
    r.Group(func(r chi.Router) {
        r.Use(AuthMiddleware(jm))
        r.Use(RequireRole("admin"))
        
        r.Post("/api/admin/products", productH.Create)
        r.Put("/api/admin/products/{id}", productH.Update)
        r.Delete("/api/admin/products/{id}", productH.Delete)
    })
}
```

→ Routes config tập trung 1 nơi. Dễ audit.

## Test với mock

Vì layer phụ thuộc **interface**, mock dễ:

```go
// internal/services/user_service_test.go
type mockUserRepo struct {
    users map[int]*User
    byEmail map[string]*User
    nextID int
}

func (m *mockUserRepo) Create(ctx context.Context, u *User) error {
    u.ID = m.nextID
    m.nextID++
    m.users[u.ID] = u
    m.byEmail[u.Email] = u
    return nil
}

func (m *mockUserRepo) GetByEmail(ctx context.Context, email string) (*User, error) {
    u, ok := m.byEmail[email]
    if !ok { return nil, ErrNotFound }
    return u, nil
}

// ... GetByID, Update, Delete, List

func TestUserService_Register_Success(t *testing.T) {
    repo := &mockUserRepo{
        users: map[int]*User{},
        byEmail: map[string]*User{},
        nextID: 1,
    }
    jm := auth.NewJWTManager("test-secret", time.Hour)
    svc := NewUserService(repo, jm, slog.Default())
    
    user, err := svc.Register(context.Background(),
        "alice@x.com", "password123", "Alice")
    
    require.NoError(t, err)
    assert.Equal(t, 1, user.ID)
    assert.Equal(t, "Alice", user.Name)
    assert.NotEqual(t, "password123", user.PasswordHash)   // hashed
}

func TestUserService_Register_EmailTaken(t *testing.T) {
    repo := &mockUserRepo{...}
    repo.byEmail["taken@x.com"] = &User{Email: "taken@x.com"}
    
    svc := NewUserService(repo, jm, log)
    _, err := svc.Register(ctx, "taken@x.com", "password", "X")
    
    assert.ErrorIs(t, err, ErrEmailTaken)
}
```

→ Test business logic không cần DB.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Handler query SQL trực tiếp | Mix layer | Service layer |
| Service biết HTTP | Coupling | Service nhận ctx, không `*http.Request` |
| Repository business logic | Hard to test | Move lên service |
| Concrete type cho dep | Test khó | Interface |
| Model = JSON response | Leak data | Tách DTO |
| God service 1000 dòng | Hard maintain | Split theo domain |
| Circular dep (service → service) | Compile fail | Move shared lên `pkg/` |
| `main.go` 500 dòng wire | Khó đọc | Split `setupX()` helpers |

## Khi nào "tách layer" thật sự cần?

Layered architecture phù hợp khi:
- Project > 5 endpoints.
- Multiple developer.
- Cần test offline (mock DB).
- Có khả năng đổi DB/auth/storage.

Project nhỏ (< 5 endpoint, 1 dev, prototype):
- Có thể "fat handler" (handler chứa logic + SQL).
- Refactor khi grow.

Quy tắc: **start simple, refactor khi pain xuất hiện**.

## Quick reference

```go
// Layer pattern
type UserRepository interface { ... }      // contract
type userRepo struct { db *sqlx.DB }       // impl
func NewUserRepo(db *sqlx.DB) UserRepository { ... }

type UserService interface { ... }
type userService struct {
    repo UserRepository      // ← depends on interface
    log  *slog.Logger
}
func NewUserService(repo UserRepository, log *slog.Logger) UserService { ... }

type UserHandler struct {
    svc UserService          // ← depends on interface
}

// Sentinel error
var ErrNotFound = errors.New("not found")
errors.Is(err, ErrNotFound)

// Wire
func main() {
    repo := NewUserRepo(db)
    svc := NewUserService(repo, log)
    h := NewUserHandler(svc)
    r.Post("/api/users", h.Create)
}
```

## Tóm tắt bài 3

- 3 layer: Handler → Service → Repository.
- Mỗi layer phụ thuộc **interface** của layer dưới.
- Constructor `NewX(...) Interface` return interface.
- Sentinel error cho map → HTTP code.
- DTO tách khỏi domain model — không leak `PasswordHash`.
- Wire bằng tay trong `main.go` — rõ ràng, không magic.
- Test service mock repo qua interface — không cần DB.
- Tách layer **khi cần** — start simple, refactor khi pain.
- Quy tắc: handler không SQL, service không HTTP, repository không business.

**Bài kế tiếp** → [Bài 4: File upload S3 + CDN](04-file-upload-s3.md)

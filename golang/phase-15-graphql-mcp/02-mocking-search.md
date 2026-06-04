# Bài 2: Advanced Mocking + PostgreSQL Full-text Search

Test với mock manual (Phase 12) đủ cho project nhỏ. Project lớn cần lib chuyên: testify/mock, mockery, gomock — auto-generate mock từ interface. Bài này so sánh, dạy pattern. Phần 2: PostgreSQL **tsvector + GIN index** cho full-text search hiệu năng — feature bắt buộc cho e-commerce.

## Phần 1: Mocking advanced

### Hard dependency anti-pattern

```go
// Service hard-coded reference
type AuthService struct {
    db *sqlx.DB     // ← concrete type, không mock được
}

func (s *AuthService) Login(email, password string) error {
    var hash string
    s.db.Get(&hash, "SELECT password_hash FROM users WHERE email=$1", email)
    return auth.VerifyPassword(hash, password)
}
```

→ Test phải có DB thật. Slow, flaky.

### Refactor: extract interface

```go
type UserRepository interface {
    GetByEmail(ctx context.Context, email string) (*User, error)
}

type AuthService struct {
    repo UserRepository    // ← interface, mock được
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*User, error) {
    user, err := s.repo.GetByEmail(ctx, email)
    if err != nil { return nil, err }
    if err := auth.VerifyPassword(user.PasswordHash, password); err != nil {
        return nil, ErrInvalid
    }
    return user, nil
}
```

### Manual mock với call count

```go
type mockUserRepo struct {
    GetByEmailCalls int
    GetByEmailFn    func(ctx context.Context, email string) (*User, error)
}

func (m *mockUserRepo) GetByEmail(ctx context.Context, email string) (*User, error) {
    m.GetByEmailCalls++
    if m.GetByEmailFn != nil {
        return m.GetByEmailFn(ctx, email)
    }
    return nil, nil
}

func TestLogin_Success(t *testing.T) {
    repo := &mockUserRepo{
        GetByEmailFn: func(ctx context.Context, email string) (*User, error) {
            return &User{Email: email, PasswordHash: hashFor("secret123")}, nil
        },
    }
    svc := NewAuthService(repo)
    
    user, err := svc.Login(ctx, "alice@x.com", "secret123")
    
    require.NoError(t, err)
    assert.Equal(t, 1, repo.GetByEmailCalls)
    assert.Equal(t, "alice@x.com", user.Email)
}
```

→ Pure Go, không lib. OK cho project nhỏ.

### Table-driven test với mock

```go
func TestLogin(t *testing.T) {
    tests := []struct {
        name      string
        email     string
        password  string
        setupMock func(*mockUserRepo)
        wantErr   error
    }{
        {
            name:     "success",
            email:    "alice@x.com",
            password: "secret123",
            setupMock: func(m *mockUserRepo) {
                m.GetByEmailFn = func(ctx context.Context, email string) (*User, error) {
                    return &User{Email: email, PasswordHash: hashFor("secret123")}, nil
                }
            },
            wantErr: nil,
        },
        {
            name:     "wrong password",
            email:    "alice@x.com",
            password: "wrong",
            setupMock: func(m *mockUserRepo) {
                m.GetByEmailFn = func(ctx context.Context, email string) (*User, error) {
                    return &User{Email: email, PasswordHash: hashFor("secret123")}, nil
                }
            },
            wantErr: ErrInvalid,
        },
        {
            name:     "user not found",
            email:    "ghost@x.com",
            password: "x",
            setupMock: func(m *mockUserRepo) {
                m.GetByEmailFn = func(ctx context.Context, email string) (*User, error) {
                    return nil, ErrNotFound
                }
            },
            wantErr: ErrNotFound,
        },
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            repo := &mockUserRepo{}
            tt.setupMock(repo)
            svc := NewAuthService(repo)
            
            _, err := svc.Login(ctx, tt.email, tt.password)
            
            if tt.wantErr != nil {
                assert.ErrorIs(t, err, tt.wantErr)
            } else {
                assert.NoError(t, err)
            }
        })
    }
}
```

### testify/mock

```bash
go get github.com/stretchr/testify/mock
```

```go
import "github.com/stretchr/testify/mock"

type MockUserRepo struct {
    mock.Mock
}

func (m *MockUserRepo) GetByEmail(ctx context.Context, email string) (*User, error) {
    args := m.Called(ctx, email)
    if args.Get(0) == nil {
        return nil, args.Error(1)
    }
    return args.Get(0).(*User), args.Error(1)
}

func TestLogin_Testify(t *testing.T) {
    repo := new(MockUserRepo)
    
    user := &User{Email: "alice@x.com", PasswordHash: hashFor("secret")}
    repo.On("GetByEmail", mock.Anything, "alice@x.com").Return(user, nil).Once()
    
    svc := NewAuthService(repo)
    _, err := svc.Login(ctx, "alice@x.com", "secret")
    
    require.NoError(t, err)
    repo.AssertExpectations(t)   // verify all On() được gọi
}
```

API:
- `.On(method, args).Return(values)`.
- `.Once()`, `.Times(n)` — expected call count.
- `mock.Anything`, `mock.AnythingOfType("string")`.
- `.AssertExpectations(t)`, `.AssertCalled(t, ...)`, `.AssertNotCalled(t, ...)`.

### mockery — Auto-generate mock

```bash
go install github.com/vektra/mockery/v2@latest

# .mockery.yaml
mockname: "Mock{{.InterfaceName}}"
dir: "mocks"
filename: "{{.InterfaceName | snakecase}}_mock.go"
outpkg: mocks
inpackage: false
all: true
recursive: true
with-expecter: true
packages:
  github.com/yourname/app/services:
    interfaces:
      UserRepository:
      ProductRepository:

mockery
```

→ Sinh `mocks/user_repository_mock.go` từ interface. Update khi interface đổi → rerun mockery.

Type-safe expecter:
```go
repo := mocks.NewMockUserRepository(t)
repo.EXPECT().
    GetByEmail(mock.Anything, "alice@x.com").
    Return(user, nil).
    Once()
```

→ Compile-time check. Đổi interface → mock break — phát hiện ngay.

### Khi nào dùng cái nào?

| Tool | Khi nào |
|---|---|
| Manual mock | Project nhỏ, 2-3 interface, học |
| testify/mock | Project trung, dynamic expectation |
| mockery + testify/mock | Project lớn, nhiều interface, CI/CD |
| gomock + protobuf | Project gRPC, code gen từ proto |

## Phần 2: PostgreSQL Full-text search

### Vì sao không LIKE?

```sql
-- Slow + không ranking + miss stemming
SELECT * FROM products WHERE name ILIKE '%running shoe%';
```

Vấn đề:
- `%word%` không dùng được index thường → full scan.
- Không hiểu "shoes" = "shoe".
- Không rank theo độ liên quan.

### tsvector + tsquery

```sql
-- tsvector: lexemes (tokenized + normalized)
SELECT to_tsvector('english', 'Running Shoes for Athletes');
-- 'athlet':4 'run':1 'shoe':2

-- tsquery: search expression
SELECT to_tsquery('english', 'running & shoes');
-- 'run' & 'shoe'

-- Match
SELECT to_tsvector('english', 'Running Shoes') @@ to_tsquery('english', 'shoe');
-- true
```

→ Stemmer (run = running), stopword (the, for) removal.

### Schema với search vector

```sql
-- migrations/000005_add_search.up.sql
ALTER TABLE products
ADD COLUMN search_vector tsvector;

CREATE INDEX products_search_idx ON products USING GIN(search_vector);

-- Trigger auto-update khi insert/update
CREATE FUNCTION update_product_search() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', coalesce(NEW.name, '')),        'A') ||
        setweight(to_tsvector('english', coalesce(NEW.brand, '')),       'B') ||
        setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(NEW.tags, '')),        'D');
    RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_search_update
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION update_product_search();

-- Backfill existing rows
UPDATE products SET name = name;
```

Weight `A` > `B` > `C` > `D` — name match quan trọng hơn description.

### Search query với ranking

```sql
SELECT
    id, name, brand, price,
    ts_rank_cd(search_vector, query) AS rank
FROM products,
     plainto_tsquery('english', 'running shoes') AS query
WHERE search_vector @@ query
ORDER BY rank DESC
LIMIT 20;
```

`plainto_tsquery` parse natural language ("running shoes" → `'run' & 'shoe'`).

`ts_rank_cd` rank theo:
- Số match.
- Vị trí (đầu cao hơn cuối).
- Weight (A > B > C > D).

### Phrase search

```sql
-- Exact phrase
WHERE search_vector @@ phraseto_tsquery('english', 'leather running shoes')

-- Mix
WHERE search_vector @@ to_tsquery('english', 'running & (shoes | sneakers)')
```

### Highlighting

```sql
SELECT
    name,
    ts_headline('english', description, query,
        'StartSel=<mark>, StopSel=</mark>') AS highlight
FROM products,
     plainto_tsquery('english', 'comfortable') AS query
WHERE search_vector @@ query;
```

→ Snippet với highlight `<mark>` quanh keyword. UI dùng.

### Service implementation

```go
// internal/services/product_service.go
type ProductSearchRequest struct {
    Query    string  `json:"q"`
    Category *string `json:"category,omitempty"`
    MinPrice *float64 `json:"min_price,omitempty"`
    MaxPrice *float64 `json:"max_price,omitempty"`
    Page     int     `json:"page"`
    Limit    int     `json:"limit"`
}

type ProductSearchResult struct {
    Products []*Product `json:"products"`
    Total    int        `json:"total"`
    Page     int        `json:"page"`
    HasMore  bool       `json:"has_more"`
}

func (s *productService) Search(ctx context.Context, req ProductSearchRequest) (*ProductSearchResult, error) {
    if req.Limit == 0 || req.Limit > 100 { req.Limit = 20 }
    if req.Page == 0 { req.Page = 1 }
    offset := (req.Page - 1) * req.Limit
    
    // Build query
    query := `
        SELECT id, name, brand, price, image_url,
               ts_rank_cd(search_vector, q) AS rank
        FROM products,
             plainto_tsquery('english', $1) q
        WHERE search_vector @@ q
    `
    
    args := []any{req.Query}
    argN := 2
    
    if req.Category != nil {
        query += fmt.Sprintf(" AND category = $%d", argN)
        args = append(args, *req.Category)
        argN++
    }
    if req.MinPrice != nil {
        query += fmt.Sprintf(" AND price >= $%d", argN)
        args = append(args, *req.MinPrice)
        argN++
    }
    if req.MaxPrice != nil {
        query += fmt.Sprintf(" AND price <= $%d", argN)
        args = append(args, *req.MaxPrice)
        argN++
    }
    
    query += fmt.Sprintf(" ORDER BY rank DESC LIMIT $%d OFFSET $%d", argN, argN+1)
    args = append(args, req.Limit, offset)
    
    products := []*Product{}
    if err := s.db.SelectContext(ctx, &products, query, args...); err != nil {
        return nil, fmt.Errorf("search: %w", err)
    }
    
    // Count total
    var total int
    countQuery := `SELECT COUNT(*) FROM products, plainto_tsquery('english', $1) q WHERE search_vector @@ q`
    s.db.GetContext(ctx, &total, countQuery, req.Query)
    
    return &ProductSearchResult{
        Products: products,
        Total:    total,
        Page:     req.Page,
        HasMore:  offset+len(products) < total,
    }, nil
}
```

### Handler

```go
// GET /api/products/search?q=running+shoes&category=footwear&min_price=50
func (h *ProductHandler) Search(w http.ResponseWriter, r *http.Request) {
    q := r.URL.Query().Get("q")
    if q == "" {
        writeError(w, 400, "missing query parameter 'q'")
        return
    }
    
    req := ProductSearchRequest{Query: q}
    if c := r.URL.Query().Get("category"); c != "" { req.Category = &c }
    if p, _ := strconv.Atoi(r.URL.Query().Get("page")); p > 0 { req.Page = p }
    if l, _ := strconv.Atoi(r.URL.Query().Get("limit")); l > 0 { req.Limit = l }
    
    result, err := h.svc.Search(r.Context(), req)
    if err != nil {
        writeError(w, 500, "search failed")
        return
    }
    
    writeJSON(w, 200, result)
}
```

### Multi-language

```sql
-- Vietnamese: dùng config "simple" (không stemmer) hoặc cài unaccent
CREATE EXTENSION unaccent;

CREATE FUNCTION normalize_vi(text) RETURNS text AS $$
    SELECT lower(unaccent($1));
$$ LANGUAGE SQL IMMUTABLE;

UPDATE products SET search_vector =
    to_tsvector('simple', normalize_vi(name || ' ' || coalesce(description, '')));

-- Query
WHERE search_vector @@ plainto_tsquery('simple', normalize_vi('giày chạy bộ'));
```

→ Strip dấu trước khi tokenize.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `LIKE '%word%'` | Slow | tsvector + GIN index |
| Quên backfill khi add column | Old data không search được | `UPDATE products SET name = name` trigger trigger |
| GIN index không có | Search vẫn full scan | Tạo index `USING GIN(search_vector)` |
| Search query không sanitize | Inject (ít risk hơn SQL) | tsquery escape tự động |
| Không pagination | Slow + memory cao | LIMIT + OFFSET |
| Mọi field weight A | Mất ranking | Weight per importance |
| Không multi-language | Vietnamese fail | `simple` + `unaccent` |
| Update product không update vector | Stale search | Trigger BEFORE UPDATE |

## Tóm tắt bài 2

**Mocking**:
- Manual mock: pure Go, OK cho project nhỏ.
- testify/mock: dynamic expectation, AssertExpectations.
- mockery: auto-generate mock từ interface, type-safe expecter.
- Refactor service → interface dependency để mock.

**Full-text search**:
- PostgreSQL `tsvector` + `tsquery` + GIN index = fast search.
- Weight A>B>C>D cho ranking field importance.
- Trigger auto-update `search_vector` khi insert/update.
- `plainto_tsquery` parse natural language.
- `ts_rank_cd` ranking, `ts_headline` highlighting.
- Multi-language: `simple` config + `unaccent` extension cho Vietnamese.

**Bài kế tiếp** → [Bài 3: MCP Server cho AI Integration](03-mcp-server.md)

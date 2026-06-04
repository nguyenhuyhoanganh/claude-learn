# Bài 1: Testing — table-driven, subtest, benchmark, mock

Go có testing **built-in stdlib** — không cần JUnit, pytest, mocha. Chỉ `go test`. Pattern table-driven test là idiom đặc trưng Go, subtest cho phép isolation, benchmark đo performance đúng cách. Bài này dạy đủ pattern production để bạn không bao giờ ship code không test.

## Test file convention

```text
mypackage/
├── user.go
└── user_test.go     ← suffix _test.go
```

Test file trong cùng package, suffix `_test.go`. Compiler bỏ qua trong build production.

```go
// user_test.go
package mypackage

import "testing"

func TestUserCreate(t *testing.T) {
    u := NewUser("Alice")
    if u.Name != "Alice" {
        t.Errorf("got %q, want Alice", u.Name)
    }
}
```

Rules:
- Function bắt đầu `Test`.
- Receive `*testing.T`.
- No return value.

## Run test

```bash
go test                    # current package
go test ./...              # all packages
go test -v ./...           # verbose
go test -run TestUserCreate    # specific test
go test -run "TestUser/sub"    # match subtest
go test -count=10              # run 10 times
go test -race ./...            # race detector
go test -cover ./...           # coverage
go test -coverprofile=c.out
go tool cover -html=c.out      # visualize coverage
```

## Test helper API

```go
func TestX(t *testing.T) {
    t.Log("info")              // chỉ in nếu -v
    t.Logf("got %d", x)
    
    t.Error("failed")           // fail nhưng tiếp
    t.Errorf("got %d, want %d", got, want)
    
    t.Fatal("stop")             // fail và STOP
    t.Fatalf("setup failed: %v", err)
    
    t.Skip("not implemented")   // skip test
    t.SkipNow()
    
    if testing.Short() {
        t.Skip("skipping in short mode")
    }
}
```

`Error*` vs `Fatal*`:
- `Error*` — log fail, tiếp test (multiple errors).
- `Fatal*` — log fail, dừng test ngay.

→ Dùng `Fatal` khi precondition setup fail (không tiếp được).

## Table-driven test — Idiom Go

```go
func TestDivide(t *testing.T) {
    tests := []struct {
        name    string
        a, b    float64
        want    float64
        wantErr bool
    }{
        {"normal", 10, 2, 5, false},
        {"negative", -10, 2, -5, false},
        {"zero numerator", 0, 5, 0, false},
        {"div by zero", 10, 0, 0, true},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Divide(tt.a, tt.b)
            if tt.wantErr {
                if err == nil { t.Error("expected error") }
                return
            }
            if err != nil { t.Fatal(err) }
            if got != tt.want {
                t.Errorf("got %f, want %f", got, tt.want)
            }
        })
    }
}
```

Lợi ích:
- DRY: 1 logic test, nhiều case.
- Subtest mỗi case (run riêng được: `go test -run TestDivide/div_by_zero`).
- Add case mới = add row.

## Subtest

```go
func TestUser(t *testing.T) {
    t.Run("create", func(t *testing.T) {
        // ...
    })
    
    t.Run("update", func(t *testing.T) {
        // ...
    })
    
    t.Run("delete", func(t *testing.T) {
        // ...
    })
}
```

Mỗi `t.Run` isolation. `Fatal` trong subtest không stop sibling subtest.

## Setup/Teardown

```go
func TestMain(m *testing.M) {
    // Setup
    setupDB()
    defer teardownDB()
    
    code := m.Run()      // run tests
    
    // Cleanup
    os.Exit(code)
}
```

`TestMain` chạy thay test default. Hữu ích cho:
- Setup test database.
- Init shared resource.
- Cleanup sau.

Per-test setup:
```go
func TestX(t *testing.T) {
    db := newTestDB(t)
    t.Cleanup(func() { db.Close() })
    
    // ... test với db
}
```

`t.Cleanup` chạy khi test (hoặc subtest) xong. Cleaner than `defer`.

## Test helper với t.Helper()

```go
func assertEqual(t *testing.T, got, want any) {
    t.Helper()           // ← report caller line, không phải helper line
    if got != want {
        t.Errorf("got %v, want %v", got, want)
    }
}

func TestX(t *testing.T) {
    assertEqual(t, 1+1, 2)
    assertEqual(t, "go", "rust")    // báo dòng này, không phải dòng trong helper
}
```

`t.Helper()` quan trọng cho assertion helper. Stack trace point đúng line.

## Test parallel

```go
func TestX(t *testing.T) {
    t.Parallel()    // chạy song song với test khác cùng có Parallel()
    // ...
}
```

Tăng tốc test suite. Cẩn thận với shared state.

```go
for _, tt := range tests {
    tt := tt          // capture loop var (Go < 1.22)
    t.Run(tt.name, func(t *testing.T) {
        t.Parallel()
        // ...
    })
}
```

## Benchmark

```go
func BenchmarkSum(b *testing.B) {
    nums := []int{1, 2, 3, 4, 5}
    b.ResetTimer()
    
    for i := 0; i < b.N; i++ {
        Sum(nums)
    }
}
```

`b.N` được runtime quyết — chạy đủ lâu để đo chính xác.

Run:
```bash
go test -bench=. -benchmem
# BenchmarkSum-8   100000000   12.3 ns/op   0 B/op   0 allocs/op
```

Output:
- `ns/op` — ns per operation.
- `B/op` — byte allocated per op.
- `allocs/op` — số alloc per op.

## Benchmark optimization tips

```go
func BenchmarkX(b *testing.B) {
    // Setup
    data := generateData()
    
    b.ResetTimer()              // reset sau setup
    b.ReportAllocs()            // luôn report alloc
    
    for i := 0; i < b.N; i++ {
        result := Process(data)
        runtime.KeepAlive(result)   // tránh compiler eliminate
    }
}
```

Compare 2 implementation:
```bash
go test -bench=. -count=10 > old.txt
# implement change
go test -bench=. -count=10 > new.txt
benchstat old.txt new.txt
```

`benchstat` tool đo statistical significance:
```bash
go install golang.org/x/perf/cmd/benchstat@latest
```

## Example function — Living documentation

```go
func ExampleSum() {
    fmt.Println(Sum([]int{1, 2, 3}))
    // Output: 6
}
```

`go test` chạy Example, compare stdout với comment `// Output:`. Nếu khác → fail.

Hiện trên godoc tự động. **Documentation + test** combo.

## Mocking với interface

```go
// Production code dùng interface
type EmailSender interface {
    Send(to, subject, body string) error
}

type Service struct {
    sender EmailSender
}

func (s *Service) Welcome(email string) error {
    return s.sender.Send(email, "Welcome", "Thanks for joining")
}

// Test với mock
type MockSender struct {
    sent []string
}

func (m *MockSender) Send(to, subject, body string) error {
    m.sent = append(m.sent, fmt.Sprintf("%s|%s|%s", to, subject, body))
    return nil
}

func TestService_Welcome(t *testing.T) {
    mock := &MockSender{}
    s := &Service{sender: mock}
    
    if err := s.Welcome("alice@x.com"); err != nil {
        t.Fatal(err)
    }
    
    if len(mock.sent) != 1 {
        t.Errorf("got %d sent, want 1", len(mock.sent))
    }
    if !strings.Contains(mock.sent[0], "Welcome") {
        t.Error("missing welcome message")
    }
}
```

→ Pattern Go-idiomatic mocking — không cần lib (Mockito, sinon).

## Testify — Assertion library (optional)

```go
import "github.com/stretchr/testify/assert"
import "github.com/stretchr/testify/require"

func TestX(t *testing.T) {
    u := getUser()
    
    require.NotNil(t, u)             // stop nếu nil
    assert.Equal(t, "Alice", u.Name) // log, tiếp
    assert.Contains(t, u.Tags, "admin")
    assert.NoError(t, err)
}
```

Trade-off:
- Pro: gọn, đẹp.
- Con: dependency, cộng đồng Go split (stdlib purist vs testify users).

Hầu hết project Go production dùng testify. Stdlib OK nếu prefer.

## HTTP test với httptest

```go
import "net/http/httptest"

func TestHandler(t *testing.T) {
    req := httptest.NewRequest("GET", "/users/42", nil)
    rec := httptest.NewRecorder()
    
    handler(rec, req)
    
    resp := rec.Result()
    if resp.StatusCode != 200 {
        t.Errorf("status: %d", resp.StatusCode)
    }
    
    body, _ := io.ReadAll(resp.Body)
    if !strings.Contains(string(body), "Alice") {
        t.Errorf("body: %s", body)
    }
}
```

`httptest.NewRecorder` mock `http.ResponseWriter`. Test handler không cần start server.

Test server:
```go
ts := httptest.NewServer(http.HandlerFunc(handler))
defer ts.Close()

resp, _ := http.Get(ts.URL + "/users/42")
```

## Fuzz test (Go 1.18+)

```go
func FuzzReverse(f *testing.F) {
    f.Add("hello")           // seed
    f.Add("")
    
    f.Fuzz(func(t *testing.T, s string) {
        r := Reverse(s)
        rr := Reverse(r)
        if rr != s {
            t.Errorf("Reverse twice: got %q, want %q", rr, s)
        }
    })
}
```

Run:
```bash
go test -fuzz=FuzzReverse -fuzztime=30s
```

Go runtime generate random input → test invariant. Find edge case automatically.

## Coverage

```bash
go test -coverprofile=cover.out ./...
go tool cover -func=cover.out
go tool cover -html=cover.out
```

Production target: 70-80% (không cần 100%). Focus on:
- Business logic.
- Error path.
- Edge case.

Skip: trivial getter/setter, generated code.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Test phụ thuộc thứ tự | Flaky | Mỗi test isolate |
| Test phụ thuộc network/DB real | Slow, fragile | Mock hoặc testcontainer |
| Quên `t.Helper()` | Stack trace sai | Helper functions add `t.Helper()` |
| Loop var capture | Bug subtest | `tt := tt` shadow (< 1.22) |
| Mutate shared state trong parallel | Race | Cleanup, separate fixtures |
| `time.Sleep` trong test | Slow + flaky | `chan`, retry với timeout |
| Test private function | Tight coupling | Test qua public API |
| Coverage 100% obsession | Wasted effort | Focus business logic |
| Mock everything | Test mock không test code | Integration test khi cần |

## Pattern production

### testify pattern phổ biến

```go
type UserServiceSuite struct {
    suite.Suite
    svc  *UserService
    repo *MockUserRepo
}

func (s *UserServiceSuite) SetupTest() {
    s.repo = &MockUserRepo{}
    s.svc = NewUserService(s.repo)
}

func (s *UserServiceSuite) TestCreate() {
    user, err := s.svc.Create(context.Background(), "Alice")
    s.Require().NoError(err)
    s.Equal("Alice", user.Name)
}

func TestUserServiceSuite(t *testing.T) {
    suite.Run(t, new(UserServiceSuite))
}
```

### Integration test với testcontainers

```go
import "github.com/testcontainers/testcontainers-go"

func TestUserRepo(t *testing.T) {
    ctx := context.Background()
    pgC, err := postgres.Run(ctx, "postgres:15")
    require.NoError(t, err)
    t.Cleanup(func() { pgC.Terminate(ctx) })
    
    dsn, _ := pgC.ConnectionString(ctx)
    db, _ := sqlx.Open("pgx", dsn)
    
    repo := NewUserRepo(db)
    // ... test với real Postgres
}
```

→ Spin up real DB trong container cho test. Slow nhưng confident.

## Quick reference

```go
// Test
func TestX(t *testing.T) {
    t.Error / Errorf / Fatal / Fatalf / Log / Skip
    t.Helper()
    t.Cleanup(func)
    t.Parallel()
    t.Run(name, func(t *testing.T) { ... })
}

// Benchmark
func BenchmarkX(b *testing.B) {
    b.ResetTimer(); b.ReportAllocs()
    for i := 0; i < b.N; i++ { ... }
}

// Example
func ExampleX() {
    fmt.Println(...)
    // Output: expected
}

// Fuzz
func FuzzX(f *testing.F) {
    f.Add(seed)
    f.Fuzz(func(t *testing.T, input T) { ... })
}

// HTTP
req := httptest.NewRequest("GET", "/path", body)
rec := httptest.NewRecorder()
handler(rec, req)
resp := rec.Result()

ts := httptest.NewServer(handler); defer ts.Close()
```

## Tóm tắt bài 1

- `_test.go` cùng package, function `TestX(t *testing.T)`.
- `t.Run` cho subtest. `t.Helper()` cho assertion helper.
- **Table-driven** = idiom Go: `[]struct` + loop subtest.
- `TestMain` cho global setup/teardown. `t.Cleanup` per-test.
- Benchmark với `b.N`, đo `ns/op`, `B/op`, `allocs/op`.
- Fuzz test (Go 1.18+) tìm edge case tự động.
- HTTP test với `httptest.NewRecorder` + `httptest.NewServer`.
- Mock = interface implementation đơn giản, không cần lib.
- testify (assert/require/suite/mock) phổ biến nhưng optional.
- Integration test với testcontainers cho real DB.

**Bài kế tiếp** → Course core hoàn thành. Phase 13-15 là project E-Commerce (Section 19-26 gốc) — học tốt nhất bằng cách đọc khoá gốc trực tiếp + áp dụng kiến thức Phase 1-12.

---

🎉 **CHÚC MỪNG — Bạn đã hoàn thành Golang core curriculum!**

Sau 12 phases, bạn đã có toàn bộ foundation Go production developer cần:
- **Phase 1**: Setup, toolchain, hello world.
- **Phase 2**: Values, variables, constants, iota.
- **Phase 3**: Control flow (for, if, switch).
- **Phase 4**: Arrays, slices, maps, pointers, memory.
- **Phase 5**: Functions, errors, defer, panic/recover.
- **Phase 6**: Struct, method, interface, embedding, generics.
- **Phase 7**: Strings, runes, UTF-8, modules.
- **Phase 8**: Goroutines, channels, mutex, concurrency project.
- **Phase 9**: File IO, JSON encoding.
- **Phase 10**: SQL với database/sql.
- **Phase 11**: net/http web server.
- **Phase 12**: Testing, benchmark, mock.

**Phase 13-15 (E-Commerce, GraphQL, MCP Server)** là project lớn — best learning là tự build với reference từ Joseph Arbour course gốc. Toàn bộ pattern bạn cần đã ở đây.

Học tiếp:
- Build pet project: blog, todo API, URL shortener.
- Đọc source code: `kubernetes/kubernetes`, `docker/docker`, `prometheus/prometheus`.
- Theo dõi blog: go.dev/blog, Dave Cheney.
- Conference: GopherCon talks trên YouTube.

Chúc bạn viết Go thành công! 🚀

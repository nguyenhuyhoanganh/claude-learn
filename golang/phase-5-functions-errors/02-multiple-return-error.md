# Bài 2: Multiple return + error là first-class value

Java có `try/catch`. Python có `raise`. Rust có `Result<T, E>`. Go có **error là value bình thường**, return cùng với kết quả qua **multiple return**. Mới nhìn thấy verbose ("phải check `err != nil` mọi nơi!"), nhưng sau khi làm thì thấy: **không có hidden flow**, không có "ngoại lệ bay xa", code trở nên predictable. Bài này là chìa khoá viết Go "đúng kiểu".

## Multiple return — Cú pháp

```go
func divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("division by zero")
    }
    return a / b, nil
}

result, err := divide(10, 2)
if err != nil {
    log.Fatal(err)
}
fmt.Println(result)   // 5
```

Idiom: function trả `(value, error)`. Error luôn ở **cuối**.

## Error là interface đơn giản

```go
// Trong stdlib:
type error interface {
    Error() string
}
```

Bất kỳ type nào có method `Error() string` → là `error`. Không cần `extends`, `implements`.

```go
type NotFoundError struct {
    Key string
}

func (e *NotFoundError) Error() string {
    return fmt.Sprintf("key %q not found", e.Key)
}

// Dùng
return nil, &NotFoundError{Key: "user-123"}
```

## Tạo error nhanh

```go
// errors.New — error không có format
err := errors.New("something failed")

// fmt.Errorf — error với format
err := fmt.Errorf("failed to open %s: %d retries", path, retries)

// fmt.Errorf với %w — wrap error gốc
err := fmt.Errorf("read config: %w", origErr)
```

`%w` (Go 1.13+) wrap error gốc → giữ chuỗi nguyên nhân. Critical cho debug.

## Pattern check error

```go
file, err := os.Open(path)
if err != nil {
    return fmt.Errorf("open %s: %w", path, err)
}
defer file.Close()

data, err := io.ReadAll(file)
if err != nil {
    return fmt.Errorf("read %s: %w", path, err)
}
```

Pattern lặp **rất nhiều** trong code Go. Quen rồi không thấy verbose nữa — thấy minh bạch.

## Discard return value

```go
_, err := db.Exec("DELETE FROM users WHERE id = $1", id)
// _ vứt rowsAffected vì không cần

result, _ := divide(10, 2)
// _ vứt error vì biết chắc b != 0 (NHƯNG đây là bẫy — xem dưới)
```

→ **Cảnh báo**: `_, _ := f()` = ignore error. Chỉ làm khi:
- Function không có failure mode thực sự (rare).
- Bạn vừa check input → chắc chắn no error.
- Test code.

Production code phải **handle error**. Linter (`errcheck`) báo warning nếu ignore.

## Multiple return — Common idioms

### `value, ok` cho lookup

```go
// Map
v, ok := m[key]
if !ok { ... }

// Type assertion
v, ok := i.(string)
if !ok { ... }

// Channel receive
v, ok := <-ch
if !ok { ... }  // channel closed
```

### `value, error` cho operation có failure

```go
n, err := strconv.Atoi("42")
data, err := os.ReadFile(path)
conn, err := net.Dial("tcp", addr)
```

### Multiple values khác

```go
func minMax(s []int) (int, int) { ... }
min, max := minMax(nums)

func parseCoord(s string) (x, y float64, err error) { ... }
```

## Wrap error với `%w`

```go
func loadConfig(path string) (*Config, error) {
    data, err := os.ReadFile(path)
    if err != nil {
        return nil, fmt.Errorf("read config from %s: %w", path, err)
    }
    
    var cfg Config
    if err := json.Unmarshal(data, &cfg); err != nil {
        return nil, fmt.Errorf("parse config: %w", err)
    }
    return &cfg, nil
}

// Caller
cfg, err := loadConfig("app.yaml")
if err != nil {
    log.Println(err)
    // Output: read config from app.yaml: open app.yaml: no such file or directory
}
```

→ Chuỗi cause được giữ. Tools (`errors.Is`, `errors.As`) unwrap được.

## `errors.Is` — Check error type

```go
var ErrNotFound = errors.New("not found")

func find(key string) (Item, error) {
    return Item{}, fmt.Errorf("repo: %w", ErrNotFound)
}

item, err := find("X")
if errors.Is(err, ErrNotFound) {
    // handle not found
}
```

`errors.Is` unwrap chuỗi để check. Tốt hơn `err == ErrNotFound` (chỉ work khi không wrap).

## `errors.As` — Lấy type cụ thể

```go
type ValidationError struct {
    Field string
    Msg   string
}

func (e *ValidationError) Error() string { ... }

func save(u User) error {
    return fmt.Errorf("save: %w", &ValidationError{
        Field: "email",
        Msg:   "invalid",
    })
}

// Caller
err := save(u)
var ve *ValidationError
if errors.As(err, &ve) {
    fmt.Println("field:", ve.Field)
    fmt.Println("msg:",   ve.Msg)
}
```

`errors.As` unwrap đến khi tìm type match → assign vào `&ve`.

## Sentinel error

Định nghĩa error constant cho compare:
```go
package myrepo

var (
    ErrNotFound  = errors.New("not found")
    ErrDuplicate = errors.New("duplicate")
    ErrTimeout   = errors.New("timeout")
)
```

Caller:
```go
err := repo.Find(id)
switch {
case errors.Is(err, myrepo.ErrNotFound):
    // 404
case errors.Is(err, myrepo.ErrDuplicate):
    // 409
case err != nil:
    // 500
}
```

Pattern Go stdlib: `io.EOF`, `sql.ErrNoRows`, `os.ErrNotExist`.

## Error chain — When to wrap

```text
[Library bottom]                     [Top: HTTP handler]
io.EOF ──┐
         ├─ "scan row: io.EOF" ──┐
                                  ├─ "fetch user: scan row: io.EOF"
                                                                 ▼
                                                          Handler check
                                                          errors.Is(err, io.EOF)
                                                          → 404
```

Quy tắc:
- **Wrap** khi add context (caller cần biết context này).
- **Không wrap** khi muốn re-export error type cho caller match.

## Pattern: Sentinel + custom error

```go
package user

var ErrNotFound = errors.New("user not found")

type ValidationError struct {
    Field string
}

func (e *ValidationError) Error() string {
    return fmt.Sprintf("invalid %s", e.Field)
}

// Service
func (s *Service) Get(id string) (*User, error) {
    u, err := s.db.Find(id)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, fmt.Errorf("user %s: %w", id, ErrNotFound)
    }
    if err != nil {
        return nil, fmt.Errorf("db: %w", err)
    }
    return u, nil
}

// Handler
func (h *Handler) GetUser(w http.ResponseWriter, r *http.Request) {
    u, err := h.svc.Get(id)
    switch {
    case errors.Is(err, user.ErrNotFound):
        http.Error(w, "not found", 404)
    case err != nil:
        log.Println(err)
        http.Error(w, "internal", 500)
    default:
        json.NewEncoder(w).Encode(u)
    }
}
```

→ Pattern production phổ biến.

## Error message style

```go
// SAI: capitalized + có period
errors.New("Could not read file.")

// ĐÚNG: lowercase + không period
errors.New("could not read file")
```

Lý do: error được wrap → message ghép chuỗi: `"open config: could not read file"`. Capital giữa câu trông xấu.

Convention từ Go team.

## Pattern: Wrap với operation name

```go
// SAI: error chỉ nói "no such file" → khó debug
data, err := os.ReadFile(path)
if err != nil {
    return err
}

// ĐÚNG: add context
data, err := os.ReadFile(path)
if err != nil {
    return fmt.Errorf("read config %s: %w", path, err)
}
```

→ Log cuối: `"start server: load config: read config /etc/app.yaml: open /etc/app.yaml: no such file or directory"`. Đọc xong biết toàn bộ chain.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `_, _ := f()` ignore error | Silent fail | Handle hoặc log |
| `err == ErrFoo` không unwrap | Miss wrapped | `errors.Is` |
| `fmt.Errorf("%v", err)` thay `%w` | Mất chain | Dùng `%w` |
| Message capital + period | Style không Go | lowercase, no period |
| Wrap nhiều layer mà không add context | Noise | Wrap khi có info mới |
| Return `nil, nil` | Caller confuse | Hoặc value hoặc error |
| Return error type concrete trong API | Khó mock | Return `error` interface |
| Nil pointer trong interface error | Interface != nil | Explicit `return nil` |
| Panic thay vì return error | Crash app | Return error, panic chỉ programmer bug |

### Bẫy nil pointer trong error interface

```go
type MyError struct{ msg string }
func (e *MyError) Error() string { return e.msg }

func do() error {
    var err *MyError
    return err     // ← interface không nil!
}

if err := do(); err != nil {
    fmt.Println("error")   // IN, dù value nil
}
```

Vì interface = (type, value). `(*MyError, nil)` ≠ `nil interface`.

Fix:
```go
func do() error {
    var err *MyError
    if cond {
        err = &MyError{...}
    }
    if err == nil {
        return nil   // explicit nil interface
    }
    return err
}
```

## Performance

Error creation:
- `errors.New("...")` — alloc string + struct, ~few ns.
- `fmt.Errorf("...: %w", err)` — alloc string format + wrap, ~vài chục ns.

Production thường OK. Nếu trong hot path (1M req/s) thì xem xét reuse sentinel.

## So sánh với exception

```java
// Java
try {
    file = open(path);
    data = read(file);
} catch (IOException e) {
    log(e);
    return null;
}
```

```go
// Go
file, err := open(path)
if err != nil {
    log.Println(err)
    return nil, err
}
data, err := read(file)
if err != nil {
    log.Println(err)
    return nil, err
}
```

Trade-off:
- Java: ít boilerplate. Nhưng error path ẩn — code nhìn linear nhưng có thể bay đi bất kỳ chỗ nào.
- Go: verbose. Nhưng mọi error path explicit. Linter (`errcheck`) bắt missed handle.

Một số developer Java mới chuyển Go gọi đây là "error handling fatigue". Sau 2-3 tháng quen.

## Quick reference

```go
// Tạo error
errors.New("msg")
fmt.Errorf("ctx %d: %w", x, baseErr)

// Sentinel
var ErrFoo = errors.New("foo")

// Custom type
type MyError struct{ F string }
func (e *MyError) Error() string { return e.F }

// Check
errors.Is(err, ErrFoo)
var me *MyError
errors.As(err, &me)

// Wrap chain
return fmt.Errorf("op: %w", err)

// Style
"lowercase, no period"

// Patterns
return value, fmt.Errorf("...: %w", err)
return nil, ErrSentinel
```

## Tóm tắt bài 2

- Error là **interface** `{ Error() string }`. Bất kỳ type implement là error.
- Convention: `func() (value, error)`. Error luôn cuối.
- Pattern `if err != nil { return ... }` lặp khắp Go code.
- `fmt.Errorf("...: %w", err)` wrap để giữ chain.
- `errors.Is(err, ErrFoo)` check sentinel. `errors.As(err, &v)` lấy type cụ thể.
- Message lowercase, no period — convention.
- Bẫy nil pointer → interface != nil. Explicit `return nil`.
- Wrap khi add context, không wrap nếu không có info mới.

**Bài kế tiếp** → [Bài 3: defer — Cleanup tự động và đảm bảo thực thi](03-defer.md)

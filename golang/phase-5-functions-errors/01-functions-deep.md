# Bài 1: Functions — Function value, closure, named return

Function trong Go nhìn qua giống Java/C, nhưng đào sâu thì rất khác: function là **first-class citizen** (gán biến, pass arg, return), Go có **closure**, **named return**, **multiple return**, **variadic**. Hiểu hết là một bước lớn để viết code Go đúng "Go-way".

## Khai báo cơ bản

```go
func greet(name string) {
    fmt.Println("Hello,", name)
}

greet("Alice")
```

Anatomy:
```go
func greet(name string) {
//  ↑    ↑      ↑     
//  kw   tên    parameter (name + type)
}
```

## Multiple parameter

```go
// Cùng type — gộp được
func add(a, b int) int {
    return a + b
}

// Khác type
func describe(name string, age int) string {
    return fmt.Sprintf("%s is %d", name, age)
}
```

## Return value

```go
// Không return
func print(s string) { ... }

// Return 1 value
func square(x int) int { return x * x }

// Return nhiều
func divmod(a, b int) (int, int) {
    return a / b, a % b
}

q, r := divmod(17, 5)   // q=3, r=2
```

Multiple return là idiom phổ biến nhất: `(result, error)`, `(value, ok)`.

## Named return values

```go
func divide(a, b float64) (result float64, err error) {
    if b == 0 {
        err = errors.New("division by zero")
        return     // naked return — trả result, err
    }
    result = a / b
    return
}
```

Đặc điểm:
- Variable được khai báo + zero-value sẵn.
- `return` (naked) trả về tất cả named return.
- Hữu ích cho doc (`(success bool, err error)` self-document).

**Cảnh báo**: Naked return chỉ nên dùng cho function ngắn. Function dài → khó đọc:
```go
// Đẹp cho function ngắn
func divide(a, b float64) (result float64, err error) {
    if b == 0 {
        err = errors.New("div by zero")
        return
    }
    result = a / b
    return
}

// Function dài → return explicit
func parse(s string) (User, error) {
    // 30 dòng logic
    return user, nil    // explicit dễ đọc hơn
}
```

## Function là first-class

```go
// Function gán vào biến
greet := func(name string) {
    fmt.Println("Hi,", name)
}
greet("Alice")

// Function pass vào function khác
func apply(nums []int, f func(int) int) []int {
    out := make([]int, len(nums))
    for i, n := range nums {
        out[i] = f(n)
    }
    return out
}

doubled := apply([]int{1,2,3}, func(x int) int { return x * 2 })
// [2 4 6]

// Function return từ function
func multiplier(factor int) func(int) int {
    return func(x int) int { return x * factor }
}

double := multiplier(2)
triple := multiplier(3)
fmt.Println(double(5))   // 10
fmt.Println(triple(5))   // 15
```

→ Đây là functional programming. Java/Python cũng có (lambda, Function<>). Go không cần class wrap.

## Function type

```go
// Khai báo type cho function signature
type Transform func(int) int

func apply(nums []int, f Transform) []int { ... }

// Function value gán cho type
var inc Transform = func(x int) int { return x + 1 }
```

Pattern: define `Handler`, `Middleware`, `Predicate` type cho code rõ:
```go
type Handler func(w http.ResponseWriter, r *http.Request)
type Middleware func(Handler) Handler
type Predicate[T any] func(T) bool
```

## Closure — Function nhớ biến outer

```go
func counter() func() int {
    count := 0
    return func() int {
        count++
        return count
    }
}

c1 := counter()
c2 := counter()
fmt.Println(c1())   // 1
fmt.Println(c1())   // 2
fmt.Println(c1())   // 3
fmt.Println(c2())   // 1 — c2 độc lập state
```

Function bên trong "capture" biến `count` từ scope outer. Mỗi lần gọi `counter()` → tạo `count` mới + return closure mới.

→ Đây là cách Go tạo "object có state" không cần class.

### Closure capture by reference

```go
x := 10
f := func() {
    x++
}
f()
fmt.Println(x)   // 11 — closure modify x
```

→ Closure giữ tham chiếu đến biến gốc.

### Bẫy closure trong loop (Go < 1.22)

```go
funcs := []func(){}
for i := 0; i < 3; i++ {
    funcs = append(funcs, func() { fmt.Println(i) })
}
for _, f := range funcs {
    f()
}
// Go < 1.22: in 3, 3, 3 (tất cả capture cùng i)
// Go >= 1.22: in 0, 1, 2 (mỗi iteration i mới)
```

Fix < 1.22:
```go
for i := 0; i < 3; i++ {
    i := i   // shadow tạo biến mới
    funcs = append(funcs, func() { fmt.Println(i) })
}
```

## Variadic function

```go
func sum(nums ...int) int {
    total := 0
    for _, n := range nums {
        total += n
    }
    return total
}

fmt.Println(sum(1, 2, 3))         // 6
fmt.Println(sum(1, 2, 3, 4, 5))   // 15
fmt.Println(sum())                 // 0

// Pass slice — dùng ...
nums := []int{1, 2, 3}
fmt.Println(sum(nums...))   // 6
```

`...T` chỉ ở **last parameter**:
```go
func log(level string, args ...any) { ... }
```

## Recursive function

```go
func factorial(n int) int {
    if n <= 1 {
        return 1
    }
    return n * factorial(n-1)
}

fmt.Println(factorial(5))   // 120
```

Go support recursion bình thường, nhưng **không tail-call optimize**. Recursion sâu (10000+) → stack overflow. Thay bằng iteration.

## Anonymous function — IIFE

```go
// Gọi ngay
func() {
    fmt.Println("immediate")
}()

// Pass arg
func(x int) {
    fmt.Println("got", x)
}(42)
```

Hiếm dùng — hầu hết case dùng goroutine pattern.

## Method vs function

```go
// Function — đứng riêng
func area(r float64) float64 { return math.Pi * r * r }
area(5)

// Method — gắn với type
type Circle struct{ Radius float64 }
func (c Circle) Area() float64 { return math.Pi * c.Radius * c.Radius }
Circle{5}.Area()
```

Khác biệt chỉ là syntax + receiver. Phase 6 (OOP) đào sâu.

## Function pass-by-value

Mọi argument đều **copy** khi truyền. Đã thấy:
- Primitive → copy value.
- Struct → copy toàn bộ.
- Slice/map/channel → copy header (nhưng share underlying).
- Pointer → copy pointer (cùng trỏ).

```go
func incValue(x int)    { x++ }
func incPointer(x *int) { *x++ }

n := 10
incValue(n);    fmt.Println(n)   // 10
incPointer(&n); fmt.Println(n)   // 11
```

## Pattern production

### 1. Option pattern (functional options)

```go
type Server struct {
    port    int
    timeout time.Duration
    verbose bool
}

type Option func(*Server)

func WithPort(p int) Option {
    return func(s *Server) { s.port = p }
}

func WithTimeout(d time.Duration) Option {
    return func(s *Server) { s.timeout = d }
}

func NewServer(opts ...Option) *Server {
    s := &Server{
        port:    8080,
        timeout: 30 * time.Second,
    }
    for _, opt := range opts {
        opt(s)
    }
    return s
}

// Dùng
s := NewServer(
    WithPort(9000),
    WithTimeout(60 * time.Second),
)
```

→ Pattern này thay constructor có nhiều param. Đẹp + extensible.

### 2. Middleware chain (web framework)

```go
type Handler func(w http.ResponseWriter, r *http.Request)
type Middleware func(Handler) Handler

func Logging(next Handler) Handler {
    return func(w http.ResponseWriter, r *http.Request) {
        log.Println(r.Method, r.URL)
        next(w, r)
    }
}

func Auth(next Handler) Handler {
    return func(w http.ResponseWriter, r *http.Request) {
        if r.Header.Get("Token") == "" {
            http.Error(w, "unauthorized", 401)
            return
        }
        next(w, r)
    }
}

func Chain(h Handler, mws ...Middleware) Handler {
    for i := len(mws) - 1; i >= 0; i-- {
        h = mws[i](h)
    }
    return h
}

// Dùng
final := Chain(myHandler, Logging, Auth)
```

→ Gin, Echo, Chi đều dựa trên pattern này.

### 3. Function as callback

```go
func ReadFile(path string, onLine func(line string)) error {
    f, err := os.Open(path)
    if err != nil { return err }
    defer f.Close()
    
    scanner := bufio.NewScanner(f)
    for scanner.Scan() {
        onLine(scanner.Text())
    }
    return scanner.Err()
}

// Dùng
ReadFile("log.txt", func(line string) {
    fmt.Println(line)
})
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Closure capture loop var | Bug Go < 1.22 | Shadow `i := i` hoặc update Go ≥ 1.22 |
| Named return dài + naked | Khó đọc | Return explicit |
| Recursion sâu | Stack overflow | Iteration |
| Pass struct lớn by value | Slow | Pointer receiver/parameter |
| Modify slice trong func, mong giữ append | Header local | Return slice mới |
| Function returns local pointer mong stack | OK (Go escape lên heap) | Hiểu escape analysis |
| Public function nhận `interface{}` | Mất type safety | Cụ thể type hoặc generic |
| Quên return | Compile error | Compiler bắt |

## Best practice

1. **Tên function ngắn, rõ**: `Save`, `Find`, không `SaveUserToDatabase` (đã rõ context).
2. **Receiver pointer cho mutate, value cho read-only**.
3. **Multiple return** thay vì tuple/struct cho 2-3 value đơn giản.
4. **Error là return cuối**: `(value, error)`.
5. **Variadic** ở cuối, hiếm khi cần thứ 2.
6. **Closure** cho callback, factory, option pattern.
7. **Named return** cho function ngắn + doc; explicit cho function dài.

## Quick reference

```go
// Khai báo
func name(p1 type1, p2 type2) returnType { }
func name(p1, p2 type) (r1, r2 type) { }    // multiple return
func name(args ...type) type { }             // variadic

// Function value
f := func(x int) int { return x * 2 }
type Transform func(int) int
var t Transform = func(x int) int { return x }

// Closure
func make() func() int {
    n := 0
    return func() int { n++; return n }
}

// Method
func (r Receiver) Method() { }
func (r *Receiver) Method() { }

// Patterns
type Option func(*Config)
type Middleware func(Handler) Handler
```

## Tóm tắt bài 1

- `func name(params) returns { body }` — anatomy cơ bản.
- Multiple return `(int, error)` là idiom Go.
- Named return + naked: gọn cho func ngắn, tránh cho func dài.
- Function là first-class: gán biến, pass arg, return.
- Closure capture biến outer by reference. Bẫy loop var fix bằng shadow hoặc Go 1.22+.
- Variadic `...T` ở last param.
- Patterns: functional options, middleware chain, callback.
- Pass-by-value mọi argument — pointer cần explicit `&`.

**Bài kế tiếp** → [Bài 2: Multiple return + error là first-class value](02-multiple-return-error.md)

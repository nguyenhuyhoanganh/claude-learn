# Bài 5: Safe Math Lib — Project áp dụng function, error, defer, recover

Tổng kết Phase 5 bằng một **thư viện math safe** — wrap operations thường panic (divide by zero, sqrt âm, overflow) thành function trả error. Áp dụng: function value, variadic, multiple return, custom error type, sentinel error, defer, panic + recover. Đây là pattern thật của thư viện như `shopspring/decimal`, `gonum`.

## Yêu cầu

```text
[API]
- Add(a, b) → (result, error)              // check overflow
- Divide(a, b) → (result, error)           // check div by zero
- Sqrt(x) → (result, error)                // check negative
- Average(nums ...float64) → (result, error)  // check empty
- SafeCall(f func()) → error               // recover panic
- Calculate(expr string) → (result, error) // mini parser

[Error]
- Sentinel: ErrDivideByZero, ErrEmpty, ErrInvalidInput
- Custom: OverflowError với context
```

## Step 1: Setup

```bash
mkdir safemath
cd safemath
go mod init github.com/yourname/safemath
```

## Step 2: Define error type

`errors.go`:
```go
package safemath

import "errors"

var (
    ErrDivideByZero  = errors.New("division by zero")
    ErrEmpty         = errors.New("empty input")
    ErrInvalidInput  = errors.New("invalid input")
    ErrNegativeSqrt  = errors.New("square root of negative")
)

type OverflowError struct {
    Operation string
    A, B      int64
}

func (e *OverflowError) Error() string {
    return fmt.Sprintf("overflow in %s(%d, %d)", e.Operation, e.A, e.B)
}
```

Phân loại:
- **Sentinel**: case đơn giản, không cần thêm thông tin.
- **Custom struct**: case cần lưu context (operation, value).

## Step 3: Add với overflow detection

`int.go`:
```go
package safemath

import "math"

func Add(a, b int64) (int64, error) {
    if b > 0 && a > math.MaxInt64-b {
        return 0, &OverflowError{Operation: "Add", A: a, B: b}
    }
    if b < 0 && a < math.MinInt64-b {
        return 0, &OverflowError{Operation: "Add", A: a, B: b}
    }
    return a + b, nil
}

func Multiply(a, b int64) (int64, error) {
    if a == 0 || b == 0 {
        return 0, nil
    }
    result := a * b
    if result/b != a {
        return 0, &OverflowError{Operation: "Multiply", A: a, B: b}
    }
    return result, nil
}
```

→ Test logic overflow tinh tế, nhưng tránh được bug silent overflow.

## Step 4: Divide với div-by-zero

```go
func Divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, ErrDivideByZero
    }
    if math.IsNaN(a) || math.IsNaN(b) {
        return 0, fmt.Errorf("%w: NaN input", ErrInvalidInput)
    }
    return a / b, nil
}
```

Wrap `ErrInvalidInput` với context "NaN input". Caller có thể `errors.Is(err, ErrInvalidInput)`.

## Step 5: Sqrt với check negative

```go
func Sqrt(x float64) (float64, error) {
    if x < 0 {
        return 0, fmt.Errorf("%w: input=%f", ErrNegativeSqrt, x)
    }
    return math.Sqrt(x), nil
}
```

## Step 6: Variadic Average

```go
func Average(nums ...float64) (float64, error) {
    if len(nums) == 0 {
        return 0, ErrEmpty
    }
    
    var sum float64
    for _, n := range nums {
        sum += n
    }
    return sum / float64(len(nums)), nil
}
```

Pattern variadic + multiple return + sentinel error.

## Step 7: SafeCall với recover

```go
func SafeCall(name string, f func()) (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("panic in %s: %v", name, r)
        }
    }()
    
    f()
    return nil
}
```

Wrap function nguy hiểm. Demo:
```go
err := SafeCall("risky", func() {
    panic("oh no")
})
fmt.Println(err)   // panic in risky: oh no
```

→ Defer + recover + named return modify. Cả 3 idiom combine.

## Step 8: Calculator — Closure + first-class function

```go
type Operation func(a, b float64) (float64, error)

var ops = map[string]Operation{
    "+": func(a, b float64) (float64, error) { return a + b, nil },
    "-": func(a, b float64) (float64, error) { return a - b, nil },
    "*": func(a, b float64) (float64, error) { return a * b, nil },
    "/": Divide,
}

func Calculate(a float64, op string, b float64) (float64, error) {
    fn, ok := ops[op]
    if !ok {
        return 0, fmt.Errorf("%w: unknown op %q", ErrInvalidInput, op)
    }
    return fn(a, b)
}
```

→ Map `string → function value`. Pattern dispatcher đẹp.

```go
r, _ := Calculate(10, "+", 5)   // 15
r, _ := Calculate(10, "/", 0)   // err: ErrDivideByZero
r, _ := Calculate(10, "%", 5)   // err: ErrInvalidInput
```

## Step 9: Track — defer instrumentation

```go
import (
    "log"
    "time"
)

func Track(name string) func() {
    start := time.Now()
    return func() {
        log.Printf("%s took %s", name, time.Since(start))
    }
}

func SlowAverage(nums ...float64) (float64, error) {
    defer Track("SlowAverage")()
    time.Sleep(100 * time.Millisecond)   // giả lập I/O
    return Average(nums...)
}
```

`Track("SlowAverage")` → closure capture `start`. `defer Track(...)()`:
1. `Track("SlowAverage")` chạy → return closure.
2. `defer` register closure.
3. Function return → closure chạy → print time.

## Step 10: Test

`safemath_test.go`:
```go
package safemath

import (
    "errors"
    "math"
    "testing"
)

func TestDivide(t *testing.T) {
    tests := []struct {
        name    string
        a, b    float64
        want    float64
        wantErr error
    }{
        {"normal", 10, 2, 5, nil},
        {"div by zero", 10, 0, 0, ErrDivideByZero},
        {"NaN", math.NaN(), 1, 0, ErrInvalidInput},
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got, err := Divide(tt.a, tt.b)
            if tt.wantErr != nil {
                if !errors.Is(err, tt.wantErr) {
                    t.Errorf("err: got %v, want %v", err, tt.wantErr)
                }
                return
            }
            if err != nil {
                t.Errorf("unexpected err: %v", err)
            }
            if got != tt.want {
                t.Errorf("got %f, want %f", got, tt.want)
            }
        })
    }
}

func TestSafeCall(t *testing.T) {
    err := SafeCall("test", func() {
        panic("boom")
    })
    if err == nil {
        t.Error("expected error from panic")
    }
}
```

Table-driven test = idiom Go. Phase 12 (Testing) đào sâu.

## Step 11: `main.go` demo

```go
package main

import (
    "fmt"
    "log"
    "github.com/yourname/safemath"
)

func main() {
    // Divide
    if r, err := safemath.Divide(10, 2); err == nil {
        fmt.Println("10/2 =", r)
    }
    if _, err := safemath.Divide(10, 0); err != nil {
        fmt.Println("error:", err)
    }
    
    // Average
    if r, err := safemath.Average(1, 2, 3, 4, 5); err == nil {
        fmt.Println("avg =", r)
    }
    if _, err := safemath.Average(); err != nil {
        fmt.Println("error:", err)
    }
    
    // Calculate
    operations := []struct{ a, b float64; op string }{
        {10, 3, "+"}, {10, 3, "-"}, {10, 3, "*"}, {10, 0, "/"},
    }
    for _, x := range operations {
        if r, err := safemath.Calculate(x.a, x.op, x.b); err != nil {
            log.Printf("%v %s %v: %v", x.a, x.op, x.b, err)
        } else {
            log.Printf("%v %s %v = %v", x.a, x.op, x.b, r)
        }
    }
    
    // SafeCall demo
    err := safemath.SafeCall("dangerous", func() {
        var s []int
        _ = s[100]   // panic
    })
    fmt.Println("recovered:", err)
}
```

Chạy:
```bash
go run .
go test ./...
```

## Patterns rút ra

### 1. Sentinel + custom error

```go
var (
    ErrFoo = errors.New("foo")
    ErrBar = errors.New("bar")
)
type ContextError struct{ ... }
```

Sentinel: case đơn giản. Custom: case có context.

### 2. Wrap sentinel với fmt.Errorf

```go
return fmt.Errorf("%w: NaN input", ErrInvalidInput)
```

→ Caller `errors.Is(err, ErrInvalidInput)` vẫn match.

### 3. Map function value cho dispatcher

```go
var ops = map[string]func(a, b float64) (float64, error){
    "+": func(...) {...},
    "/": Divide,
}
```

Hơn switch chuỗi 20+ case.

### 4. Track timing với closure + defer

```go
defer Track("name")()
```

Pattern instrumentation chuẩn.

### 5. Named return + recover

```go
func SafeCall(...) (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("panic: %v", r)
        }
    }()
    ...
}
```

Modify return từ defer.

### 6. Table-driven test

```go
tests := []struct{ ... }{...}
for _, tt := range tests {
    t.Run(tt.name, func(t *testing.T) { ... })
}
```

DRY test code. Subtest tách biệt.

## Bài tập mở rộng

1. Generic version `Sum[T Number](nums ...T) T` (Go 1.18+).
2. Big number safe: dùng `math/big` cho operation không overflow.
3. Decimal support: integrate `shopspring/decimal`.
4. Calculator expression parser: `"10 + 5 * 2"`.
5. Cached operations: memoize Sqrt.
6. Concurrent safe operation queue.
7. Benchmark Add native vs safe Add overhead.

## Bẫy production cần biết

| Bẫy | Tránh bằng |
|---|---|
| Float comparison `==` | `math.Abs(a-b) < epsilon` |
| Money tính bằng float | Dùng `int64` (cents) hoặc `decimal` |
| Overflow check int silent | Explicit check như Add() ở trên |
| Sqrt input NaN | Check `math.IsNaN` |
| Divide tower | Wrap `ErrDivideByZero` |
| Panic in goroutine | Recover top-level mỗi goroutine |

## Tóm tắt bài 5

- Build thư viện math safe áp dụng toàn bộ Phase 5.
- Pattern: `(value, error)` return, sentinel error, custom error type, `%w` wrap.
- Variadic `Average(nums ...float64)`.
- First-class function: `map[string]Operation` cho dispatcher.
- Defer + closure `defer Track("...")()` cho timing.
- Recover trong `SafeCall` cho catastrophic panic.
- Table-driven test với subtests.
- Production-ready pattern cho mọi library Go.

🎉 **Hoàn thành Phase 5**. Bạn đã master function + error + defer + recover — toolset chính của Go developer hằng ngày.

**Bài kế tiếp** → [Phase 6 - Bài 1: Struct và Method — OOP "kiểu Go"](../phase-6-oop-composition/01-struct-method.md)

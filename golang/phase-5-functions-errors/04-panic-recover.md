# Bài 4: Panic và Recover — Cơ chế cuối cùng cho lỗi catastrophic

Go khuyến nghị "error là value, return rõ ràng" — nhưng cũng có **panic** cho trường hợp "không thể tiếp tục". Khác `throw` của Java/Python: panic Go không phải tool xử lý error chung — chỉ dành cho **bug programmer**, **invariant broken**, hoặc **trạng thái không thể recovery cục bộ**. Hiểu nhầm là viết code khó duy trì.

## Panic là gì?

```go
package main

func main() {
    x := []int{1, 2, 3}
    fmt.Println(x[10])    // PANIC: index out of range
}
```

Output:
```text
panic: runtime error: index out of range [10] with length 3

goroutine 1 [running]:
main.main()
    /tmp/main.go:5 +0x39
exit status 2
```

Khi panic xảy ra:
1. Runtime stop execution của function hiện tại.
2. Run defer stack (theo LIFO).
3. Propagate lên caller.
4. Lặp lại 1-3 cho mỗi caller cho đến main.
5. Crash program với stack trace.

## Khi nào panic xảy ra?

### 1. Runtime error

- Index out of range: `s[100]` khi len < 100.
- Nil pointer dereference: `*p` khi p nil.
- Map nil write: `m[k] = v` khi m nil.
- Division by zero (int): `1/0`.
- Type assertion fail: `i.(string)` khi i không phải string.
- Concurrent map write.
- Goroutine deadlock toàn cục.

### 2. Explicit panic

```go
func mustOpen(path string) *os.File {
    f, err := os.Open(path)
    if err != nil {
        panic(fmt.Sprintf("cannot open %s: %v", path, err))
    }
    return f
}
```

## Khi nào DÙNG panic?

Quy tắc Go community:

| Tình huống | Hành động |
|---|---|
| User input sai | Return error |
| Network/IO fail | Return error |
| DB not found | Return error |
| Config sai → app không start được | Panic at init |
| Programmer bug (logic invariant) | Panic |
| Internal state corrupt | Panic |
| Library API misuse | Panic |

→ **Default: return error**. Panic chỉ khi:
- Code khác đã violate contract.
- Không có cách tiếp tục có ý nghĩa.

## `recover()` — Bắt panic

```go
func safeCall(f func()) (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("panic: %v", r)
        }
    }()
    
    f()
    return nil
}

err := safeCall(func() {
    panic("oh no")
})
fmt.Println(err)   // panic: oh no
```

`recover()`:
- Chỉ có effect khi gọi **trong defer**.
- Return `nil` nếu không có panic.
- Return panic value (thường là string hoặc error).
- Sau recover, panic stop propagate.

## Pattern: HTTP handler recovery middleware

```go
func RecoveryMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if rec := recover(); rec != nil {
                log.Printf("PANIC %s %s: %v\n%s",
                    r.Method, r.URL.Path, rec, debug.Stack())
                http.Error(w, "internal error", 500)
            }
        }()
        next.ServeHTTP(w, r)
    })
}
```

→ Tránh 1 handler panic crash cả server. **Mỗi web framework đều có middleware tương tự** (Gin, Echo, Chi).

## Pattern: goroutine recovery

```go
func safeGoroutine(f func()) {
    go func() {
        defer func() {
            if r := recover(); r != nil {
                log.Printf("goroutine panic: %v", r)
            }
        }()
        f()
    }()
}
```

**Cực kỳ quan trọng**: panic trong goroutine **không** propagate lên main goroutine. Nếu không recover → CRASH PROGRAM.

```go
// BẪY
go func() {
    panic("oh no")   // crash toàn bộ program
}()
```

Mọi goroutine production phải có defer recover top-level.

## Re-panic — Khi recover xong thấy không xử lý được

```go
defer func() {
    if r := recover(); r != nil {
        if isExpected(r) {
            handleGracefully(r)
        } else {
            panic(r)   // re-throw
        }
    }
}()
```

Re-panic = throw lại. Caller cần thấy panic này.

## `panic` với custom type

```go
type FatalError struct {
    Code int
    Msg  string
}

func (e FatalError) Error() string {
    return fmt.Sprintf("[%d] %s", e.Code, e.Msg)
}

panic(FatalError{Code: 1, Msg: "config missing"})

// Recover:
defer func() {
    if r := recover(); r != nil {
        if fe, ok := r.(FatalError); ok {
            log.Printf("fatal %d: %s", fe.Code, fe.Msg)
            os.Exit(fe.Code)
        }
        panic(r)
    }
}()
```

→ Khác Java/Python: panic value bất kỳ type. Không bắt buộc Exception class.

## "Must" pattern — Panic cho lỗi không xảy ra

Stdlib có nhiều `Must*` function:
```go
template.Must(template.New("x").Parse(`{{.}}`))
regexp.MustCompile(`^[a-z]+$`)
```

→ Panic nếu parse fail. Chỉ dùng khi **chắc chắn input đúng** (hardcoded, init time).

Tạo `Must` của riêng:
```go
func Must[T any](v T, err error) T {
    if err != nil {
        panic(err)
    }
    return v
}

regex := Must(regexp.Compile(`^[a-z]+$`))   // gọn hơn nếu sure
```

→ Pattern OK ở init time, init test. Không dùng cho dynamic input.

## Anti-pattern: dùng panic thay error

```go
// SAI: panic cho user input
func parseAge(s string) int {
    n, err := strconv.Atoi(s)
    if err != nil {
        panic(err)   // ← anti-pattern
    }
    return n
}

// ĐÚNG: return error
func parseAge(s string) (int, error) {
    n, err := strconv.Atoi(s)
    if err != nil {
        return 0, err
    }
    return n, nil
}
```

→ Panic không phải tool replace cho error. Là escape hatch cho catastrophic.

## Anti-pattern: panic-and-recover làm control flow

```go
// SAI — Python-style exception
type NotFoundPanic struct{ ID string }

func find(id string) User {
    if !exists(id) {
        panic(NotFoundPanic{id})
    }
    return User{...}
}

func handler() {
    defer func() {
        if r := recover(); r != nil {
            if n, ok := r.(NotFoundPanic); ok {
                // 404
            }
        }
    }()
    user := find(id)
}
```

→ Anti Go style. Dùng `(value, error)` thay vì.

## Stack trace từ panic

```go
import "runtime/debug"

defer func() {
    if r := recover(); r != nil {
        fmt.Printf("PANIC: %v\n", r)
        fmt.Println(string(debug.Stack()))
    }
}()
```

`debug.Stack()` return stack trace tại thời điểm gọi. Hữu ích log + send to Sentry/Bugsnag.

## Performance

- Panic + recover: **chậm**, ~1000ns.
- Vì runtime phải unwind stack, run defer.
- KHÔNG dùng cho normal flow.

Đo: handle error qua return value nhanh hơn panic 100-1000x.

## Pattern production: graceful crash

```go
func main() {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("FATAL: %v", r)
            log.Printf("Stack: %s", debug.Stack())
            
            // Báo monitoring
            sentry.CaptureException(fmt.Errorf("fatal: %v", r))
            
            // Cleanup minimal
            db.Close()
            
            os.Exit(1)
        }
    }()
    
    run()
}
```

→ Last-line defense. Production phải có để crash log được.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Dùng panic thay error | Code khó maintain | Return `(value, error)` |
| Recover ngoài defer | Không bắt được | Recover trong defer |
| Goroutine không recover | Crash program | Mọi goroutine `defer recover()` |
| Re-panic không re-wrap | Mất context | Panic với info |
| `Must*` cho dynamic input | Crash khi run | Chỉ Must khi sure |
| Recover swallow lỗi quan trọng | Bug âm thầm | Log + re-panic nếu unknown |
| Panic trong init() | App không start | Tốt — fail fast |

## So sánh với try/catch

```java
// Java
try {
    risky();
} catch (IOException e) {
    handle(e);
} finally {
    cleanup();
}
```

```go
// Go
func wrapper() (err error) {
    defer cleanup()
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("panic: %v", r)
        }
    }()
    return risky()
}
```

Khác biệt:
- Java: try/catch là cách handle error CHÍNH. 
- Go: recover là **escape hatch**, dùng cho catastrophic. Error chính là return value.
- Java: hierarchy Exception. Go: panic value bất kỳ.

## Quick reference

```go
// Trigger panic
panic("msg")
panic(fmt.Errorf("ctx: %w", err))
panic(CustomType{...})

// Recover
defer func() {
    if r := recover(); r != nil {
        // r là value panic gửi
    }
}()

// Must pattern
func MustX[T any](v T, err error) T {
    if err != nil { panic(err) }
    return v
}

// Goroutine wrapper
go func() {
    defer func() {
        if r := recover(); r != nil {
            log.Println("goroutine panic:", r)
        }
    }()
    work()
}()

// Stack trace
debug.Stack()
runtime.Stack(buf, all)
```

## Tóm tắt bài 4

- **Panic**: dừng execution, run defer stack, propagate lên caller, crash nếu không recover.
- Runtime panic: index out of range, nil deref, nil map write, type assert fail.
- Explicit panic chỉ cho: **bug programmer**, **invariant broken**, **init time fatal**.
- **Recover**: chỉ trong defer, bắt panic, return panic value.
- HTTP middleware + goroutine wrapper PHẢI có recover — tránh crash.
- `Must*` pattern: panic nếu fail. Chỉ dùng input chắc chắn (hardcoded).
- KHÔNG dùng panic làm control flow — dùng error.
- Performance: panic ~1000ns, chậm. Không dùng hot path.

**Bài kế tiếp** → [Bài 5: Safe Math Lib — Project áp dụng function, error, defer, recover](05-project-math-lib.md)

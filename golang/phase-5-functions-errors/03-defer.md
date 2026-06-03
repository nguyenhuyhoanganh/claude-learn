# Bài 3: defer — Cleanup tự động và đảm bảo thực thi

`defer` là một trong những keyword đặc trưng nhất của Go — không có tương đương trực tiếp ở Java/Python (chỉ có `try-with-resources` gần). Bạn dùng `defer` cho **file close, mutex unlock, panic recovery, logging metrics** — bất cứ thứ gì cần chạy **trước khi function return**, **dù return bằng cách nào** (normal, error, panic).

## Defer cơ bản

```go
func main() {
    fmt.Println("start")
    defer fmt.Println("end")
    fmt.Println("middle")
}
// Output:
// start
// middle
// end
```

`defer fmt.Println("end")` schedule statement chạy **khi function return**.

## Pattern phổ biến #1: Close resource

```go
func readFile(path string) ([]byte, error) {
    file, err := os.Open(path)
    if err != nil {
        return nil, err
    }
    defer file.Close()    // ← schedule close TRƯỚC khi quay về caller
    
    return io.ReadAll(file)
}
```

`Close()` chạy dù:
- `ReadAll` thành công → close + return.
- `ReadAll` lỗi → close + return error.
- Panic giữa chừng → close + propagate panic.

→ Đây là siêu năng lực: 1 dòng đảm bảo cleanup mọi path.

## Pattern phổ biến #2: Unlock mutex

```go
var mu sync.Mutex

func (s *Store) Set(k, v string) {
    mu.Lock()
    defer mu.Unlock()
    
    s.data[k] = v
    if v == "panic" {
        panic("uh oh")    // Unlock vẫn chạy!
    }
}
```

→ Tránh deadlock khi panic. Cực kỳ phổ biến.

## LIFO order

Nhiều defer → chạy **ngược thứ tự khai báo** (LIFO):

```go
func main() {
    defer fmt.Println("1")
    defer fmt.Println("2")
    defer fmt.Println("3")
    fmt.Println("start")
}
// Output:
// start
// 3
// 2
// 1
```

Tại sao LIFO? Cleanup ngược chiều với setup:
```go
db, _ := openDB()
defer db.Close()

tx, _ := db.Begin()
defer tx.Rollback()        // chạy trước Close — đúng thứ tự

// ... work
```

## Defer evaluate argument NGAY, exec sau

```go
i := 10
defer fmt.Println("deferred:", i)   // capture i = 10
i = 99
fmt.Println("current:", i)
// Output:
// current: 99
// deferred: 10
```

**Argument** được evaluate ngay khi gặp `defer`, nhưng **statement** chạy sau. Đây là rule quan trọng.

Workaround: dùng closure để defer biến hiện tại:
```go
i := 10
defer func() {
    fmt.Println("deferred:", i)   // đọc i tại lúc chạy
}()
i = 99
// Output: deferred: 99
```

## Defer trong loop — Bẫy

```go
// SAI: defer dồn đến cuối func main
func processAll(paths []string) {
    for _, p := range paths {
        f, _ := os.Open(p)
        defer f.Close()    // ← KHÔNG close sau mỗi iter, dồn đến cuối main
        // process f
    }
}
```

Với 1000 file → mở 1000 file cùng lúc → "too many open files".

Fix: tách hàm con:
```go
func processOne(p string) {
    f, _ := os.Open(p)
    defer f.Close()       // close khi processOne return
    // process
}

func processAll(paths []string) {
    for _, p := range paths {
        processOne(p)
    }
}
```

Hoặc close explicit:
```go
for _, p := range paths {
    f, _ := os.Open(p)
    // process
    f.Close()
}
```

## Defer + named return — Modify return value

```go
func divide(a, b float64) (result float64, err error) {
    defer func() {
        if err != nil {
            log.Printf("divide failed: %v", err)
        }
    }()
    
    if b == 0 {
        return 0, errors.New("div by zero")
    }
    return a / b, nil
}
```

Defer chạy **sau** `return` evaluate value vào named return, **trước** function trả về caller. Defer thấy được + modify được named return:

```go
func process() (result int) {
    defer func() {
        result += 100   // modify return value!
    }()
    return 10
}
// Trả về 110, không phải 10
```

→ Hữu ích cho: instrumentation, recovery, transform output.

## Defer cho panic recovery

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

`recover()` **chỉ work trong defer**. Bài Phase 5 bài 4 deep dive.

## Defer cho metrics / timing

```go
func track(name string) func() {
    start := time.Now()
    return func() {
        log.Printf("%s took %s", name, time.Since(start))
    }
}

func slowOp() {
    defer track("slowOp")()
    time.Sleep(2 * time.Second)
}
```

`track("slowOp")` chạy ngay → return closure → `defer ...()` schedule closure → in time khi return.

Trick: 2 lần `()` — 1 lúc defer evaluate, 1 lúc chạy lúc return.

## Performance

Defer cost (~50ns mỗi defer). Trong hot path 1M call/s → đáng kể.

Go 1.14+ tối ưu: defer trong simple function ~0 cost (compiler inline). Nhưng defer trong loop, conditional vẫn cost.

Production: dùng defer thoải mái cho safety. Nếu bench thấy bottleneck → unrolled cleanup.

## Defer ≠ try-finally

```java
// Java
try {
    file = open(path);
    // ...
} finally {
    file.close();
}
```

```go
// Go
file, _ := open(path)
defer file.Close()
// ...
```

Khác biệt:
- Java: nested scope, phải indent.
- Go: linear, đặt defer ngay sau open.

Go đẹp hơn cho nhiều cleanup:
```go
db, _ := openDB(); defer db.Close()
tx, _ := db.Begin(); defer tx.Rollback()
file, _ := os.Create("out"); defer file.Close()
// 1 dòng mỗi resource — sạch
```

Java tương đương phải lồng try-finally 3 lần.

## Defer trong HTTP handler

```go
func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
    start := time.Now()
    defer func() {
        metrics.RequestDuration.Observe(time.Since(start).Seconds())
    }()
    
    user, err := h.svc.Find(id)
    // ...
}
```

→ Metrics ghi nhận dù handler success hay error.

## Defer chain pattern

```go
func setup() (cleanup func(), err error) {
    db, err := openDB()
    if err != nil {
        return nil, err
    }
    
    cache, err := openCache()
    if err != nil {
        db.Close()    // explicit clean db nếu cache fail
        return nil, err
    }
    
    queue, err := openQueue()
    if err != nil {
        db.Close()
        cache.Close()
        return nil, err
    }
    
    return func() {
        queue.Close()
        cache.Close()
        db.Close()
    }, nil
}

// Dùng
cleanup, err := setup()
if err != nil { return }
defer cleanup()
```

→ Pattern cho graceful shutdown nhiều resource.

## Defer + panic interaction

```go
func main() {
    defer fmt.Println("1")
    defer fmt.Println("2")
    panic("uh oh")
    defer fmt.Println("never")
}
// Output:
// 2
// 1
// panic: uh oh
```

Panic → run defer stack đã setup → propagate. `defer "never"` chưa register nên không chạy.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Defer trong loop, file resource | Quá nhiều file open | Tách func con |
| Quên `defer` sau open resource | Leak | `defer` ngay sau open |
| Defer evaluate `arg` ngay → giá trị cũ | Print sai | Dùng closure |
| Defer modify named return | "Magic" khó debug | Explicit nếu phức tạp |
| Defer trong hot path | Performance cost | Bench + tối ưu nếu cần |
| Defer + nil pointer call | Vẫn panic | Check nil trước defer |
| Recover ngoài defer | Không work | Recover chỉ trong defer |
| Defer trong goroutine không có recover | Crash app | `defer recover()` mỗi goroutine |

## Pattern production: graceful shutdown

```go
func main() {
    ctx, cancel := signal.NotifyContext(context.Background(),
        syscall.SIGINT, syscall.SIGTERM)
    defer cancel()
    
    db, err := openDB()
    if err != nil { log.Fatal(err) }
    defer db.Close()
    
    srv := &http.Server{Addr: ":8080", Handler: router}
    go func() {
        if err := srv.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()
    
    <-ctx.Done()
    log.Println("shutting down...")
    
    shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer shutdownCancel()
    if err := srv.Shutdown(shutdownCtx); err != nil {
        log.Println("shutdown:", err)
    }
}
```

→ SIGTERM → cancel → main thoát → defer chain close DB. Container/K8s pod terminate đẹp.

## Quick reference

```go
// Resource cleanup
f, _ := os.Open(p); defer f.Close()
mu.Lock();          defer mu.Unlock()
tx, _ := db.Begin(); defer tx.Rollback()

// Argument evaluate ngay
x := 10
defer fmt.Println(x)   // print 10
x = 99

// Closure để evaluate lúc chạy
defer func() { fmt.Println(x) }()   // print value tại lúc chạy

// LIFO order
defer A(); defer B(); defer C()   // chạy C, B, A

// Modify named return
func f() (r int) {
    defer func() { r += 1 }()
    return 0    // r = 0, defer cộng → return 1
}

// Recover
defer func() {
    if r := recover(); r != nil {
        // handle panic
    }
}()
```

## Tóm tắt bài 3

- `defer` schedule statement chạy **khi function return** — dù bằng cách nào.
- Pattern phổ biến: close file, unlock mutex, rollback tx, recover panic, log metrics.
- **LIFO order** — nhiều defer chạy ngược chiều khai báo.
- **Argument evaluate ngay**, statement chạy sau. Closure capture biến current.
- Defer trong loop bẫy → tách func con.
- Defer thấy + modify named return → instrument hoặc recovery.
- Recover chỉ work trong defer.
- Go 1.14+ tối ưu defer cost — dùng thoải mái cho safety.

**Bài kế tiếp** → [Bài 4: Panic và Recover — Cơ chế cuối cùng cho lỗi catastrophic](04-panic-recover.md)

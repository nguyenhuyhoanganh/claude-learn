# Bài 1: Goroutines — Concurrency cơ bản của Go

Đây là lý do **đa số developer chọn Go**. Goroutine là **lightweight thread** quản lý bởi Go runtime, không phải OS thread. Bạn có thể chạy **100,000+ goroutines** trong 1 process mà Java/Python thread không làm được. Bài này dạy goroutine basics + WaitGroup + bẫy thường gặp.

## Goroutine là gì?

```go
go someFunc()    // chạy someFunc song song, không block
```

Đó là tất cả syntax. Keyword `go` trước function call → goroutine mới.

```go
package main

import (
    "fmt"
    "time"
)

func sayHello() {
    fmt.Println("Hello from goroutine!")
}

func main() {
    go sayHello()              // launch goroutine
    fmt.Println("main")
    time.Sleep(100 * time.Millisecond)   // chờ goroutine chạy
}
// Output có thể:
// main
// Hello from goroutine!
```

## Goroutine vs OS Thread

| | OS Thread | Goroutine |
|---|---|---|
| Stack size | 1-8 MB cố định | 2 KB ban đầu, tự grow |
| Create cost | ~1ms, ~64KB | < 1μs, ~2KB |
| Context switch | ~1μs (kernel) | ~100ns (Go runtime) |
| Max practical | 1,000-10,000 | 1,000,000+ |
| Quản lý bởi | OS kernel | Go runtime (M:N scheduler) |

→ Tạo 1M goroutine = ~2GB RAM. Tạo 1M Java thread = 8TB (không khả thi).

## Go runtime M:N scheduler

```text
[Goroutines: G1, G2, G3, ..., G100000]
                    ↓
                Go scheduler
                    ↓
[Logical processors: P1, P2, ..., PN (NumCPU)]
                    ↓
[OS threads: M1, M2, M3, ...]
                    ↓
                Kernel
```

- N goroutines mapped to M OS threads (M:N).
- Go runtime quyết định goroutine nào chạy.
- Yield khi: I/O wait, channel ops, time.Sleep, sync ops.

## Main goroutine

`main()` chạy trong **main goroutine**. Khi main return → toàn bộ program exit, kill mọi goroutine khác.

```go
func main() {
    go func() {
        time.Sleep(1 * time.Second)
        fmt.Println("never runs")    // main exit trước
    }()
}
```

→ Phải đợi goroutine. Cách tệ: `time.Sleep`. Cách đúng: WaitGroup hoặc channel.

## sync.WaitGroup — Chờ goroutines

```go
import "sync"

func main() {
    var wg sync.WaitGroup
    
    for i := 0; i < 5; i++ {
        wg.Add(1)
        go func(id int) {
            defer wg.Done()
            fmt.Println("worker", id)
        }(i)
    }
    
    wg.Wait()
    fmt.Println("all done")
}
```

API:
- `wg.Add(n)` — increment counter.
- `wg.Done()` — decrement counter (= `Add(-1)`).
- `wg.Wait()` — block tới khi counter = 0.

Pattern PHẢI nhớ:
- `Add` **trước** goroutine, không trong.
- `Done` qua `defer` ngay đầu goroutine.

## Bẫy 1: Quên `Add(1)` ngoài

```go
// SAI
for i := 0; i < 5; i++ {
    go func() {
        wg.Add(1)        // ← race: main có thể Wait trước Add
        defer wg.Done()
        // ...
    }()
}
wg.Wait()
```

→ Race condition. `Wait` có thể đọc counter = 0 trước goroutine `Add`. Đúng:
```go
for i := 0; i < 5; i++ {
    wg.Add(1)            // ← TRƯỚC go
    go func() {
        defer wg.Done()
        // ...
    }()
}
```

## Bẫy 2: Loop variable capture (Go < 1.22)

```go
for i := 0; i < 5; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        fmt.Println(i)    // có thể in 5, 5, 5, 5, 5
    }()
}
```

Fix < 1.22:
```go
for i := 0; i < 5; i++ {
    wg.Add(1)
    go func(i int) {     // pass i as arg
        defer wg.Done()
        fmt.Println(i)
    }(i)
}
// Hoặc:
go func() {
    i := i               // shadow
    // ...
}()
```

Go 1.22+ tự fix.

## Bẫy 3: Goroutine leak

```go
func leaky() {
    go func() {
        for {            // infinite loop
            // không có exit
        }
    }()
}
```

Goroutine chạy mãi → leak. Mỗi call `leaky()` thêm 1 leak. Bug khó debug.

Fix: dùng context để cancel:
```go
func nonLeaky(ctx context.Context) {
    go func() {
        for {
            select {
            case <-ctx.Done():
                return    // thoát khi cancel
            default:
                // work
            }
        }
    }()
}
```

## Bẫy 4: Panic trong goroutine

```go
func main() {
    go func() {
        panic("uh oh")   // CRASH toàn bộ program
    }()
    
    time.Sleep(time.Second)
}
```

Panic trong goroutine **không** propagate lên main. Crash program.

Fix: defer recover top-level:
```go
go func() {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("goroutine panic: %v", r)
        }
    }()
    // work
}()
```

→ Pattern bắt buộc cho mỗi goroutine production.

## Pattern: Goroutine pool

```go
func worker(id int, jobs <-chan int, results chan<- int) {
    for j := range jobs {
        time.Sleep(100 * time.Millisecond)   // giả lập work
        results <- j * 2
    }
}

func main() {
    jobs := make(chan int, 100)
    results := make(chan int, 100)
    
    // 3 workers
    for w := 1; w <= 3; w++ {
        go worker(w, jobs, results)
    }
    
    // Send jobs
    for j := 1; j <= 9; j++ {
        jobs <- j
    }
    close(jobs)
    
    // Collect results
    for r := 1; r <= 9; r++ {
        fmt.Println(<-results)
    }
}
```

→ Pattern phổ biến: HTTP server, batch processor, ETL pipeline.

## Pattern: Concurrent map operations

```go
func processItems(items []Item) []Result {
    results := make([]Result, len(items))
    var wg sync.WaitGroup
    
    for i, item := range items {
        wg.Add(1)
        go func(i int, item Item) {
            defer wg.Done()
            results[i] = process(item)
        }(i, item)
    }
    
    wg.Wait()
    return results
}
```

→ Process N item song song. Safe vì mỗi goroutine viết index khác nhau.

**Cảnh báo**: nếu cần dynamic append → cần mutex hoặc channel.

## Concurrency vs Parallelism

```text
Concurrency: nhiều task interleaved (có thể trên 1 CPU).
Parallelism: nhiều task chạy đồng thời (cần nhiều CPU).
```

Go default chạy goroutine trên `GOMAXPROCS` = NumCPU. Điều khiển:
```go
import "runtime"
runtime.GOMAXPROCS(4)   // hardcode 4 CPU
fmt.Println(runtime.NumCPU())
fmt.Println(runtime.NumGoroutine())   // số goroutine đang chạy
```

Hầu hết không cần touch.

## Race detector

```bash
go run -race main.go
go test -race ./...
go build -race -o app
```

→ Phát hiện data race lúc run. Slow ~10x. Chỉ chạy CI/test, không production.

```go
// Có race
var counter int
for i := 0; i < 100; i++ {
    go func() { counter++ }()    // race!
}
```

Race detector output:
```text
==================
WARNING: DATA RACE
Read at 0x... by goroutine X:
  main.func1
Previous write at 0x... by goroutine Y:
  main.func1
==================
```

Phase 8 bài 4 (Mutex) sẽ fix.

## Real-world: Concurrent HTTP fetcher

```go
func fetchAll(urls []string) []string {
    results := make([]string, len(urls))
    var wg sync.WaitGroup
    
    for i, url := range urls {
        wg.Add(1)
        go func(i int, url string) {
            defer wg.Done()
            
            defer func() {
                if r := recover(); r != nil {
                    results[i] = fmt.Sprintf("PANIC: %v", r)
                }
            }()
            
            resp, err := http.Get(url)
            if err != nil {
                results[i] = "ERR: " + err.Error()
                return
            }
            defer resp.Body.Close()
            
            body, _ := io.ReadAll(resp.Body)
            results[i] = string(body)
        }(i, url)
    }
    
    wg.Wait()
    return results
}
```

→ Fetch 100 URLs song song. Production phải thêm:
- Timeout (`http.Client{Timeout}`).
- Rate limit (semaphore).
- Context cancel.

## Semaphore — Giới hạn concurrency

```go
import "golang.org/x/sync/semaphore"

func processWithLimit(items []Item, maxConcurrent int) {
    sem := semaphore.NewWeighted(int64(maxConcurrent))
    var wg sync.WaitGroup
    ctx := context.Background()
    
    for _, item := range items {
        wg.Add(1)
        if err := sem.Acquire(ctx, 1); err != nil {
            wg.Done()
            continue
        }
        go func(item Item) {
            defer wg.Done()
            defer sem.Release(1)
            process(item)
        }(item)
    }
    
    wg.Wait()
}
```

→ Tối đa N goroutine cùng lúc. Tránh nổ memory/network.

## Bẫy thường gặp tổng hợp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên đợi goroutine | Goroutine bị kill khi main exit | WaitGroup hoặc channel |
| `wg.Add` trong goroutine | Race | `Add` trước `go` |
| Loop var capture (< 1.22) | Wrong value | Pass arg hoặc shadow |
| Panic trong goroutine | Crash | Defer recover |
| Goroutine leak (infinite) | Memory grow | Context cancel |
| Concurrent map write | Panic | `sync.Map` hoặc Mutex |
| Race condition trên shared var | Behavior random | Mutex hoặc channel |
| Quá nhiều goroutine | OOM | Semaphore/pool |
| `time.Sleep` đợi goroutine | Fragile | WaitGroup/channel |

## Quick reference

```go
// Launch
go someFunc()
go func() { ... }()
go func(x int) { ... }(42)

// WaitGroup
var wg sync.WaitGroup
wg.Add(1)
go func() { defer wg.Done(); ... }()
wg.Wait()

// Recovery
defer func() {
    if r := recover(); r != nil { ... }
}()

// Race check
go test -race ./...
go run -race main.go

// Runtime info
runtime.NumGoroutine()
runtime.NumCPU()
runtime.GOMAXPROCS(n)

// Semaphore (golang.org/x/sync)
sem := semaphore.NewWeighted(10)
sem.Acquire(ctx, 1)
defer sem.Release(1)
```

## Tóm tắt bài 1

- Goroutine = lightweight thread (2KB stack, < 1μs create).
- Keyword `go` trước function call → spawn goroutine.
- `sync.WaitGroup` chờ tất cả xong: `Add` → `Done` → `Wait`.
- Main exit kill mọi goroutine — phải đợi explicit.
- Panic trong goroutine không propagate → defer recover top-level.
- Loop var capture: Go 1.22+ tự fix, < 1.22 pass arg.
- Goroutine leak: context cancel để exit.
- Race detector: `-race` flag, chỉ dev/CI.
- Semaphore giới hạn concurrency, tránh nổ resource.

**Bài kế tiếp** → [Bài 2: Channels — Communication giữa goroutines](02-channels.md)

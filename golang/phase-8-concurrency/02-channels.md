# Bài 2: Channels — Communication giữa goroutines

Channel là **đường ống type-safe** để goroutine trao đổi data. Quote nổi tiếng của Rob Pike: **"Don't communicate by sharing memory; share memory by communicating."** Đó là triết lý concurrency của Go: thay vì lock biến shared, dùng channel pass data. Bài này dạy đủ channel pattern để bạn build concurrent system robust.

## Channel basics

```go
// Tạo
ch := make(chan int)

// Send
ch <- 42

// Receive
v := <-ch

// Receive với comma-ok
v, ok := <-ch       // ok = false nếu channel close
```

Operator `<-`:
- `ch <- v` — send v vào ch.
- `<-ch` — receive từ ch.

## Unbuffered channel — Sync

```go
ch := make(chan int)   // unbuffered

go func() {
    ch <- 42           // block tới khi có receiver
}()

v := <-ch              // block tới khi có sender
fmt.Println(v)         // 42
```

→ Unbuffered = **synchronous handshake**. Send block tới khi receive (và ngược lại).

## Buffered channel — Async tới buffer size

```go
ch := make(chan int, 3)   // buffer 3

ch <- 1                   // không block
ch <- 2                   // không block
ch <- 3                   // không block
ch <- 4                   // BLOCK — buffer đầy
```

→ Buffered cho phép sender đi tiếp nếu chưa đầy. Hữu ích cho throughput.

## Close channel

```go
ch := make(chan int, 3)
ch <- 1; ch <- 2; ch <- 3
close(ch)

// Receive sau close
v, ok := <-ch
fmt.Println(v, ok)   // 1 true
v, ok = <-ch
fmt.Println(v, ok)   // 2 true
v, ok = <-ch
fmt.Println(v, ok)   // 3 true
v, ok = <-ch
fmt.Println(v, ok)   // 0 false (zero value + ok=false)
```

Rules:
- Send vào channel closed → PANIC.
- Receive từ channel closed → zero value, ok=false.
- Close channel closed → PANIC.

**Convention**: **chỉ sender close**. Receiver không close. Nhiều sender → cần coordination.

## Range channel

```go
ch := make(chan int)

go func() {
    for i := 0; i < 5; i++ {
        ch <- i
    }
    close(ch)          // ← phải close để range exit
}()

for v := range ch {
    fmt.Println(v)     // 0, 1, 2, 3, 4
}
// Exit khi channel close
```

`for v := range ch` loop tới khi channel close. Pattern phổ biến cho worker.

## Channel direction

```go
// Bidirectional
ch := make(chan int)

// Send-only
var sendOnly chan<- int = ch    // chỉ send
sendOnly <- 1                    // OK
v := <-sendOnly                  // COMPILE ERROR

// Receive-only
var recvOnly <-chan int = ch
v := <-recvOnly                  // OK
recvOnly <- 1                    // COMPILE ERROR
```

→ Document intent trong function signature:
```go
func producer(out chan<- int) { ... }
func consumer(in <-chan int)  { ... }
```

## Pattern: Worker pool với channel

```go
func worker(id int, jobs <-chan int, results chan<- int) {
    for j := range jobs {
        result := j * 2
        results <- result
    }
}

func main() {
    jobs := make(chan int, 100)
    results := make(chan int, 100)
    
    // Start 3 workers
    for w := 1; w <= 3; w++ {
        go worker(w, jobs, results)
    }
    
    // Send jobs
    for j := 1; j <= 9; j++ {
        jobs <- j
    }
    close(jobs)        // không có job mới
    
    // Collect results
    for r := 1; r <= 9; r++ {
        fmt.Println(<-results)
    }
}
```

→ Classic worker pool. Scale workers, distribute jobs, collect results.

## `select` — Multi-channel

```go
select {
case v := <-ch1:
    fmt.Println("from ch1:", v)
case v := <-ch2:
    fmt.Println("from ch2:", v)
case ch3 <- 42:
    fmt.Println("sent to ch3")
default:
    fmt.Println("no channel ready")
}
```

Behavior:
- Mỗi case là channel op (send hoặc receive).
- Chạy case nào **ready** trước. Nếu nhiều case ready → chọn random.
- `default` chạy khi không case nào ready (non-blocking).
- Không `default` → block tới khi có case ready.

## Pattern: Timeout

```go
ch := make(chan int)
go slowOp(ch)

select {
case v := <-ch:
    fmt.Println("got:", v)
case <-time.After(2 * time.Second):
    fmt.Println("timeout!")
}
```

`time.After(d)` return channel emit value sau d. Combine với `select` cho timeout.

## Pattern: Context cancel

```go
func worker(ctx context.Context, jobs <-chan int) {
    for {
        select {
        case <-ctx.Done():
            fmt.Println("cancelled:", ctx.Err())
            return
        case j, ok := <-jobs:
            if !ok {
                return     // channel closed
            }
            process(j)
        }
    }
}

ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

go worker(ctx, jobs)
```

→ Context = cancellation signal. Standard pattern cho:
- HTTP request lifecycle.
- DB query timeout.
- Long-running background job.

## Pattern: Fan-out / Fan-in

### Fan-out: distribute work

```go
func fanOut(in <-chan Task, n int) []<-chan Result {
    outs := make([]<-chan Result, n)
    for i := 0; i < n; i++ {
        out := make(chan Result)
        outs[i] = out
        go func() {
            defer close(out)
            for task := range in {
                out <- process(task)
            }
        }()
    }
    return outs
}
```

### Fan-in: merge channels

```go
func fanIn(channels ...<-chan Result) <-chan Result {
    out := make(chan Result)
    var wg sync.WaitGroup
    
    for _, ch := range channels {
        wg.Add(1)
        go func(c <-chan Result) {
            defer wg.Done()
            for v := range c {
                out <- v
            }
        }(ch)
    }
    
    go func() {
        wg.Wait()
        close(out)
    }()
    
    return out
}
```

Pipeline:
```go
in := generateTasks()
workers := fanOut(in, 10)
results := fanIn(workers...)
for r := range results {
    save(r)
}
```

→ Pattern cho ETL, image processing, bulk operations.

## Pattern: Pipeline

```go
func gen(nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for _, n := range nums {
            out <- n
        }
    }()
    return out
}

func square(in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        defer close(out)
        for n := range in {
            out <- n * n
        }
    }()
    return out
}

// Compose
nums := gen(1, 2, 3, 4)
squared := square(nums)
for v := range squared {
    fmt.Println(v)   // 1, 4, 9, 16
}
```

→ Mỗi stage là goroutine + channel. Stream data qua pipeline.

## Pattern: Done signal

```go
done := make(chan struct{})

go func() {
    // long work
    close(done)
}()

select {
case <-done:
    fmt.Println("finished")
case <-time.After(5 * time.Second):
    fmt.Println("timeout")
}
```

`chan struct{}` — channel chỉ để signal, không cần value. `struct{}` = zero byte.

## Pattern: Heartbeat

```go
func worker(done <-chan struct{}, heartbeat chan<- struct{}) {
    pulse := time.NewTicker(1 * time.Second)
    defer pulse.Stop()
    
    for {
        select {
        case <-done:
            return
        case <-pulse.C:
            select {
            case heartbeat <- struct{}{}:
            default:
                // skip nếu monitor không listen
            }
        }
    }
}
```

→ Worker emit heartbeat mỗi giây. Monitor detect hang.

## Channel as semaphore

```go
sem := make(chan struct{}, 5)   // max 5 concurrent

for _, item := range items {
    sem <- struct{}{}            // acquire
    go func(item Item) {
        defer func() { <-sem }() // release
        process(item)
    }(item)
}
```

→ Buffered channel size N = "permit pool". Đơn giản hơn `sync.Semaphore`.

## Nil channel — Disable case

```go
var ch chan int = nil

ch <- 1       // block forever
<-ch          // block forever
```

→ Send/receive trên nil channel block mãi. Hữu ích trong `select` để **disable case**:

```go
var inboxCh <-chan Msg
if subscribed {
    inboxCh = realInbox
}

select {
case msg := <-inboxCh:
    handle(msg)
case <-quit:
    return
}
// Nếu not subscribed, inboxCh nil → case không trigger
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Send vào closed channel | Panic | Convention: chỉ sender close |
| Close 2 lần | Panic | Track ownership |
| Receive từ nil channel | Block forever | Init channel |
| Quên close trong `range` | Deadlock | Close sau khi done |
| Channel leak | Goroutine không exit | Context hoặc done signal |
| Send unbuffered không có receiver | Deadlock | Buffered hoặc goroutine sender |
| `select` không default + no ready | Block | Cẩn thận pattern |
| Buffered quá nhỏ | Slow | Tune buffer size |
| Buffered quá lớn | Memory pressure | Trade-off |

### Bẫy deadlock kinh điển

```go
func main() {
    ch := make(chan int)
    ch <- 1            // main block — không ai receive
    fmt.Println(<-ch)
}
// fatal error: all goroutines are asleep - deadlock!
```

Fix:
```go
ch := make(chan int, 1)   // buffer 1
ch <- 1                    // không block
fmt.Println(<-ch)
```

Hoặc dùng goroutine:
```go
ch := make(chan int)
go func() { ch <- 1 }()
fmt.Println(<-ch)
```

## Performance

- Unbuffered channel send/receive: ~100ns.
- Buffered channel (not full/empty): ~30ns.
- Mutex Lock/Unlock: ~30ns.

→ Channel chậm hơn mutex chút. Trade-off: code rõ ràng hơn.

Khi nào dùng channel vs mutex:
- **Pass data ownership** → channel.
- **Protect shared resource** → mutex.
- **Coordinate goroutine** → channel.
- **Atomic counter** → `sync/atomic`.

## Real-world: Crawler

```go
func crawl(seed string, depth int) {
    visited := sync.Map{}
    queue := make(chan job, 1000)
    var wg sync.WaitGroup
    
    work := func(j job) {
        defer wg.Done()
        if j.depth > depth { return }
        if _, found := visited.LoadOrStore(j.url, true); found {
            return
        }
        
        links := fetch(j.url)
        for _, l := range links {
            wg.Add(1)
            queue <- job{url: l, depth: j.depth + 1}
        }
    }
    
    // Worker pool
    for w := 0; w < 10; w++ {
        go func() {
            for j := range queue {
                work(j)
            }
        }()
    }
    
    wg.Add(1)
    queue <- job{url: seed, depth: 0}
    wg.Wait()
    close(queue)
}
```

→ Pattern: bounded concurrency với worker pool + queue channel.

## Quick reference

```go
// Tạo
ch := make(chan T)         // unbuffered
ch := make(chan T, N)      // buffered N

// Send/Receive
ch <- v
v := <-ch
v, ok := <-ch              // ok=false if closed

// Close
close(ch)

// Direction
chan<- T                   // send-only
<-chan T                   // receive-only

// Select
select {
case v := <-ch1: ...
case ch2 <- v: ...
case <-time.After(d): ...
default: ...
}

// Range
for v := range ch { ... }

// Patterns
done := make(chan struct{})    // signal
sem := make(chan struct{}, N)  // semaphore
```

## Tóm tắt bài 2

- Channel = typed pipe. Send `ch <- v`, receive `v := <-ch`.
- **Unbuffered** = sync handshake. **Buffered N** = async tới N.
- Close: convention chỉ sender close. Send sau close → panic.
- `for v := range ch` loop tới channel close.
- `select` multi-channel — random nếu nhiều ready.
- Patterns: worker pool, fan-out/fan-in, pipeline, timeout (`time.After`), done signal, semaphore.
- Context cancel chuẩn cho cancellation.
- Nil channel → block forever (dùng để disable select case).
- Channel chậm hơn mutex ~3x — trade-off cho code rõ ràng.

**Bài kế tiếp** → [Bài 3: select, context và pattern cancel](03-mutex-sync.md)

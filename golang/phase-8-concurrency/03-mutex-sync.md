# Bài 3: Mutex và sync package — Khi channel không đủ

Channel là **default** tool cho concurrency Go, nhưng có lúc bạn thật sự cần **shared mutable state**: counter, cache, lookup map. Đây là lúc `sync.Mutex`, `sync.RWMutex`, `sync.Once`, `sync/atomic` xuất hiện. Bài này dạy đúng khi nào dùng cái nào.

## Race condition demo

```go
var counter int

func main() {
    var wg sync.WaitGroup
    for i := 0; i < 1000; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            counter++          // RACE!
        }()
    }
    wg.Wait()
    fmt.Println(counter)        // có thể 800, 950, không phải 1000
}
```

`counter++` không atomic:
1. Read counter.
2. Add 1.
3. Write counter.

2 goroutine có thể read cùng value → mất update.

Phát hiện:
```bash
go run -race main.go
# WARNING: DATA RACE
```

## sync.Mutex — Lock thường

```go
var (
    mu      sync.Mutex
    counter int
)

func inc() {
    mu.Lock()
    defer mu.Unlock()
    counter++
}

for i := 0; i < 1000; i++ {
    wg.Add(1)
    go func() {
        defer wg.Done()
        inc()
    }()
}
wg.Wait()
fmt.Println(counter)   // 1000 ✓
```

Rules:
- `Lock()` — block tới khi acquire.
- `Unlock()` — release. **Bắt buộc** unlock (dùng `defer`).
- Mutex zero value usable — không cần init.
- KHÔNG copy Mutex (`go vet` bắt).

## sync.RWMutex — Read-Write lock

```go
var (
    mu    sync.RWMutex
    cache map[string]string
)

func get(k string) string {
    mu.RLock()
    defer mu.RUnlock()
    return cache[k]
}

func set(k, v string) {
    mu.Lock()
    defer mu.Unlock()
    cache[k] = v
}
```

- `RLock` / `RUnlock` — nhiều reader cùng lúc.
- `Lock` / `Unlock` — writer độc quyền (block mọi reader).

Khi nào dùng RWMutex:
- Read >> Write (10:1, 100:1).
- Read operation đắt (không phải pointer deref đơn giản).

Trade-off: RWMutex chậm hơn Mutex (overhead). Read nhanh → dùng Mutex.

## sync.Once — Init 1 lần

```go
var (
    once sync.Once
    cfg  *Config
)

func GetConfig() *Config {
    once.Do(func() {
        cfg = loadConfig()    // chạy đúng 1 lần
    })
    return cfg
}
```

`once.Do(f)`:
- `f` chạy đúng 1 lần dù gọi `Do` nhiều lần concurrent.
- Thread-safe.
- Block goroutine khác tới khi `f` xong.

Pattern: lazy init, singleton, init expensive resource.

## sync.WaitGroup recap

Đã học bài 1:
```go
var wg sync.WaitGroup
wg.Add(n)
go func() { defer wg.Done(); ... }()
wg.Wait()
```

## sync/atomic — Atomic operation

Khi chỉ cần atomic counter/flag, không cần Mutex:

```go
import "sync/atomic"

var counter atomic.Int64

func inc() {
    counter.Add(1)
}

func read() int64 {
    return counter.Load()
}
```

Go 1.19+ có atomic type:
- `atomic.Int32`, `Int64`, `Uint32`, `Uint64`.
- `atomic.Bool`.
- `atomic.Pointer[T]`.

Method:
- `Add(n)`, `Load()`, `Store(v)`, `CompareAndSwap(old, new)`, `Swap(v)`.

Performance: ~10x faster than Mutex cho counter.

## CAS — Compare-And-Swap

```go
var state atomic.Int32

func transition(from, to int32) bool {
    return state.CompareAndSwap(from, to)
}

// State machine
if transition(0, 1) {
    fmt.Println("moved 0 -> 1")
}
```

CAS: atomic swap nếu current value match expected. Foundation cho lock-free data structure.

## sync.Map — Concurrent map

Đã đề cập Phase 4 bài 3:
```go
var m sync.Map

m.Store("k", "v")
v, ok := m.Load("k")
m.Delete("k")

m.Range(func(k, v any) bool {
    fmt.Println(k, v)
    return true
})

// LoadOrStore — atomic
actual, loaded := m.LoadOrStore("k", "default")
// loaded = true nếu key đã có (actual = current value)
// loaded = false nếu mới store (actual = "default")
```

Trade-off:
- `sync.Map` tối ưu cho: nhiều key tăng giảm, read >> write per key.
- `map + Mutex` thường nhanh hơn cho key set ổn định.

Đo benchmark thực tế. Mặc định `map + Mutex` đến khi đo thấy chậm.

## sync.Pool — Object reuse

```go
var bufPool = sync.Pool{
    New: func() any {
        return new(bytes.Buffer)
    },
}

func handler() {
    buf := bufPool.Get().(*bytes.Buffer)
    defer func() {
        buf.Reset()
        bufPool.Put(buf)
    }()
    
    // use buf
}
```

→ Reuse object thay alloc mới. Giảm GC pressure.

**Cảnh báo**:
- Pool object có thể bị GC bất kỳ lúc nào.
- Không dùng cho stateful object cần persistence.
- Dùng cho: buffer, temp slice, parser context.

## sync.Cond — Condition variable

Hiếm dùng — channel thường thay thế. Nhưng có lúc cần:
```go
var (
    mu   sync.Mutex
    cond = sync.NewCond(&mu)
    queue []int
)

// Producer
mu.Lock()
queue = append(queue, item)
cond.Signal()              // wake up 1 waiter
mu.Unlock()

// Consumer
mu.Lock()
for len(queue) == 0 {
    cond.Wait()            // release mu + wait
}
item := queue[0]; queue = queue[1:]
mu.Unlock()
```

→ Phức tạp. 99% case dùng channel thay.

## Pattern: Thread-safe cache

```go
type Cache struct {
    mu sync.RWMutex
    m  map[string]string
}

func New() *Cache {
    return &Cache{m: make(map[string]string)}
}

func (c *Cache) Get(k string) (string, bool) {
    c.mu.RLock()
    defer c.mu.RUnlock()
    v, ok := c.m[k]
    return v, ok
}

func (c *Cache) Set(k, v string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    c.m[k] = v
}

func (c *Cache) Delete(k string) {
    c.mu.Lock()
    defer c.mu.Unlock()
    delete(c.m, k)
}
```

→ Reusable pattern. Add TTL, max size, LRU = enterprise cache.

## Pattern: Singleton

```go
var (
    once     sync.Once
    instance *Database
)

func GetDB() *Database {
    once.Do(func() {
        instance = connectDB()
    })
    return instance
}
```

Thread-safe lazy init.

## Pattern: Rate limiter

```go
import "golang.org/x/time/rate"

limiter := rate.NewLimiter(10, 1)   // 10/sec, burst 1

func handle() error {
    if !limiter.Allow() {
        return errors.New("rate limited")
    }
    // do work
    return nil
}

// Block til allowed
limiter.Wait(ctx)
```

Stdlib `x/time/rate` token-bucket implementation.

## Anti-pattern: Lock contention

```go
var mu sync.Mutex
mu.Lock()
// 100 dòng code, gồm cả IO chậm
mu.Unlock()
```

→ 1 goroutine giữ lock lâu → block tất cả others.

Fix: chỉ lock đoạn cần, không IO:
```go
mu.Lock()
data := sharedData
mu.Unlock()

result := slowProcess(data)   // không hold lock

mu.Lock()
results[key] = result
mu.Unlock()
```

## Anti-pattern: Double-locking

```go
mu.Lock()
defer mu.Unlock()

// ...
mu.Lock()    // DEADLOCK — re-entrant Mutex KHÔNG SUPPORT
```

→ Go Mutex không re-entrant. Cẩn thận khi gọi function khác trong lock — function đó không được Lock lại.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên Unlock | Deadlock | `defer Unlock` ngay sau Lock |
| Copy Mutex | Race | Pass *Mutex hoặc embed |
| Re-lock Mutex same goroutine | Deadlock | Refactor không cần re-lock |
| Hold lock + IO | Contention | Lock minimal scope |
| RWMutex cho hot lookup | Slower vs Mutex | Bench |
| sync.Map cho ít key | Slow vs map+Mutex | Bench |
| Atomic + Mutex mix | Confusing | Chọn 1 |
| Pool stateful object | Bug | Pool chỉ cho stateless temp |
| Cond mà có thể channel | Over-complex | Dùng channel |

## Performance ranking (typical)

```text
Fastest                        Slowest
atomic > Mutex > RWMutex > channel > sync.Map
~5ns    ~30ns   ~50ns      ~100ns     varies
```

Nhưng **đừng tối ưu sớm**. Đo benchmark trước khi quyết.

## Pattern: Atomic config swap

```go
var current atomic.Pointer[Config]

func init() {
    current.Store(loadConfig())
}

func GetConfig() *Config {
    return current.Load()
}

func ReloadConfig() {
    new := loadConfig()
    current.Store(new)
}
```

→ Lock-free config reload. Reader cực nhanh.

## Quick reference

```go
// Mutex
var mu sync.Mutex
mu.Lock(); defer mu.Unlock()

// RWMutex
var mu sync.RWMutex
mu.RLock(); defer mu.RUnlock()       // read
mu.Lock(); defer mu.Unlock()         // write

// Once
var once sync.Once
once.Do(func() { ... })

// WaitGroup
var wg sync.WaitGroup
wg.Add(n); go func() { defer wg.Done() }; wg.Wait()

// Atomic (Go 1.19+)
var c atomic.Int64
c.Add(1); c.Load(); c.Store(v); c.CompareAndSwap(old, new)

// Map
var m sync.Map
m.Store, Load, Delete, LoadOrStore, Range

// Pool
var p sync.Pool
buf := p.Get().(*Buf); defer p.Put(buf)

// Cond — hiếm dùng
cond := sync.NewCond(&mu)
cond.Wait(); cond.Signal(); cond.Broadcast()
```

## Tóm tắt bài 3

- Race condition khi nhiều goroutine viết shared var không sync.
- `sync.Mutex` cho mutual exclusion. Zero value usable. KHÔNG copy.
- `sync.RWMutex` cho read >> write. Trade-off overhead.
- `sync.Once` init 1 lần thread-safe.
- `sync/atomic` cho atomic counter/flag — nhanh hơn Mutex.
- `sync.Map` cho concurrent map — đo bench, map+Mutex thường nhanh hơn.
- `sync.Pool` reuse object giảm GC pressure.
- Pattern: cache, singleton, rate limiter.
- Anti-pattern: hold lock + IO, double-lock, copy Mutex.
- Go Mutex KHÔNG re-entrant.

**Bài kế tiếp** → [Bài 4: Concurrent File Downloader — Project applying goroutine + channel + WaitGroup + Mutex](04-project-downloader.md)

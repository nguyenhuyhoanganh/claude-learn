# Bài 1: time.Time, format date, Timer/Ticker, random

`time` package nhìn đơn giản nhưng có vài quirk lớn: format string không phải `YYYY-MM-DD`, timezone handling phức tạp, Timer/Ticker dễ leak goroutine. Bài này dạy đủ để xử lý ngày giờ chuẩn production + random generation (Go 1.20+ đã đổi API).

## time.Time — Đại diện 1 instant

```go
now := time.Now()
fmt.Println(now)             // 2026-06-03 10:23:45.123456789 +0700 +07
fmt.Println(now.Year())      // 2026
fmt.Println(now.Month())     // June
fmt.Println(now.Day())       // 3
fmt.Println(now.Hour())      // 10
fmt.Println(now.Unix())      // 1780000000
fmt.Println(now.UnixMilli()) // 1780000000123
fmt.Println(now.UnixNano())  // 1780000000123456789
```

`time.Time` chứa:
- Wall clock (tường) — UTC nanosecond + timezone.
- Monotonic clock — dùng cho diff (không jump khi NTP sync).

## Format — Reference date đặc biệt

```text
Mon Jan 2 15:04:05 MST 2006
    │  │  │   │      │  │
    1  2  3   4      5  6
```

Cách nhớ: 1 2 3 4 5 6 7 = January 2 day, 3 PM hour, 4 min, 5 sec, year 6, timezone 7.

```go
now := time.Now()
now.Format("2006-01-02")                          // 2026-06-03
now.Format("2006-01-02 15:04:05")                 // 2026-06-03 10:23:45
now.Format("02/01/2006")                          // 03/06/2026
now.Format(time.RFC3339)                          // 2026-06-03T10:23:45+07:00
now.Format("Mon, 02 Jan 2006 15:04:05 MST")       // RFC1123
now.Format("2006-01-02T15:04:05.000Z")            // ISO 8601 millis
```

Layout constant trong stdlib:
- `time.RFC3339` — `2006-01-02T15:04:05Z07:00`.
- `time.RFC1123` — `Mon, 02 Jan 2006 15:04:05 MST`.
- `time.DateOnly` (Go 1.20+) — `2006-01-02`.
- `time.TimeOnly` — `15:04:05`.

## Parse string → Time

```go
t, err := time.Parse("2006-01-02", "2026-06-03")
if err != nil { return err }

// With timezone
loc, _ := time.LoadLocation("Asia/Ho_Chi_Minh")
t, _ := time.ParseInLocation("2006-01-02 15:04:05", "2026-06-03 10:00:00", loc)
```

## Now() vs time literal

```go
// Hardcode
t := time.Date(2026, time.June, 3, 10, 0, 0, 0, time.UTC)

// From Unix epoch
t := time.Unix(1780000000, 0)
t := time.UnixMilli(1780000000123)

// Now
now := time.Now()
nowUTC := time.Now().UTC()
```

## Duration

```go
d := 5 * time.Second
d := 2 * time.Hour + 30 * time.Minute

// Multiplier
time.Nanosecond, time.Microsecond, time.Millisecond,
time.Second, time.Minute, time.Hour

// Operations
d.Seconds()          // float64
d.Milliseconds()     // int64
d.String()           // "2h30m0s"

// Add
future := now.Add(5 * time.Minute)
past := now.Add(-1 * time.Hour)

// Diff
elapsed := time.Since(start)
remaining := time.Until(deadline)
```

## Timezone

```go
utc, _ := time.LoadLocation("UTC")
vn, _ := time.LoadLocation("Asia/Ho_Chi_Minh")
ny, _ := time.LoadLocation("America/New_York")

now := time.Now()
inVN := now.In(vn)
inNY := now.In(ny)

fmt.Println(now)    // local timezone
fmt.Println(inVN)
fmt.Println(inNY)
```

`time.Time` lưu UTC internal + tz info. `.In(loc)` đổi cách hiển thị, không đổi instant.

**Cảnh báo**: timezone data load từ system. Docker `alpine` thiếu tzdata:
```dockerfile
RUN apk add tzdata    # alpine
```

## Compare time

```go
t1 := time.Now()
time.Sleep(1 * time.Second)
t2 := time.Now()

t1.Before(t2)        // true
t1.After(t2)         // false
t1.Equal(t2)         // false — so monotonic clock
t1 == t2             // KHÔNG nên dùng (so cả monotonic + tz info)
```

→ Dùng `.Equal()` thay vì `==`.

## Sleep và Timer

```go
// Block
time.Sleep(5 * time.Second)

// Timer — channel fire sau duration
timer := time.NewTimer(5 * time.Second)
<-timer.C
fmt.Println("5 seconds passed")

// Cancel
timer := time.NewTimer(5 * time.Second)
if !timer.Stop() {
    <-timer.C    // drain channel
}

// After — one-shot timer return channel
select {
case <-time.After(5 * time.Second):
    fmt.Println("timeout")
case result := <-resultCh:
    fmt.Println("done", result)
}
```

**Cảnh báo**: `time.After` trong loop = goroutine leak (timer giữ ref tới channel). Production hot loop dùng `NewTimer` + reset:

```go
timer := time.NewTimer(d)
defer timer.Stop()

for {
    select {
    case <-timer.C:
        // ...
        timer.Reset(d)
    case <-ctx.Done():
        return
    }
}
```

## Ticker — Periodic

```go
ticker := time.NewTicker(1 * time.Second)
defer ticker.Stop()

for {
    select {
    case t := <-ticker.C:
        fmt.Println("tick:", t)
    case <-ctx.Done():
        return
    }
}
```

→ **Luôn** `defer ticker.Stop()` — không stop sẽ leak.

## Random — Go 1.20+ API mới

Cũ (deprecated):
```go
rand.Seed(time.Now().UnixNano())   // ← deprecated 1.20+
r := rand.Intn(100)
```

Mới (Go 1.20+):
```go
import "math/rand/v2"

// Auto-seed mỗi run (random uint64)
r := rand.IntN(100)          // 0-99
r := rand.Float64()          // 0.0-1.0
r := rand.Uint64()
r := rand.N[int](100)        // generic
```

`math/rand/v2`:
- Auto-seed (không cần Seed thủ công).
- Generic API.
- Faster (ChaCha8).

## Shuffle

```go
nums := []int{1, 2, 3, 4, 5}
rand.Shuffle(len(nums), func(i, j int) {
    nums[i], nums[j] = nums[j], nums[i]
})
fmt.Println(nums)   // [3 1 5 4 2] (random)
```

## Crypto-secure random

`math/rand` **không** crypto-safe. Cho password, token, ID:
```go
import "crypto/rand"

b := make([]byte, 32)
_, err := rand.Read(b)
token := base64.URLEncoding.EncodeToString(b)
```

→ UUID, session token, CSRF token dùng `crypto/rand`.

## Project: Task Scheduler

```go
type Task struct {
    Name     string
    Run      func(ctx context.Context) error
    Schedule time.Duration
}

type Scheduler struct {
    tasks  []Task
    cancel context.CancelFunc
}

func (s *Scheduler) Start(ctx context.Context) {
    ctx, s.cancel = context.WithCancel(ctx)
    
    for _, t := range s.tasks {
        go s.runTask(ctx, t)
    }
}

func (s *Scheduler) runTask(ctx context.Context, t Task) {
    ticker := time.NewTicker(t.Schedule)
    defer ticker.Stop()
    
    log.Printf("started %s every %v", t.Name, t.Schedule)
    
    for {
        select {
        case <-ctx.Done():
            log.Printf("stopped %s", t.Name)
            return
        case <-ticker.C:
            go func() {
                defer func() {
                    if r := recover(); r != nil {
                        log.Printf("task %s panic: %v", t.Name, r)
                    }
                }()
                if err := t.Run(ctx); err != nil {
                    log.Printf("task %s error: %v", t.Name, err)
                }
            }()
        }
    }
}

func (s *Scheduler) Stop() { s.cancel() }
```

→ Pattern cron-like cho background job. Production dùng `robfig/cron` cho cron expression.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Format với `YYYY-MM-DD` | Wrong | Layout `2006-01-02` |
| `time.Now() == t` | False unexpected | Dùng `.Equal()` |
| `time.After` trong loop | Goroutine leak | `NewTimer` + Reset |
| Quên `ticker.Stop()` | Leak | `defer ticker.Stop()` |
| `math/rand` cho token | Predictable | `crypto/rand` |
| Hardcode timezone "Asia/HCM" | DB | Load với `LoadLocation` |
| Docker alpine no tzdata | tz fail | `apk add tzdata` |
| Sub time keep monotonic | Bug khi serialize | `.Round(0)` strip monotonic |

## Quick reference

```go
// Now
time.Now(); time.Now().UTC()

// Construct
time.Date(y, m, d, h, mi, s, ns, loc)
time.Unix(sec, nsec)

// Format / Parse
t.Format("2006-01-02 15:04:05")
time.Parse(layout, s)
time.RFC3339, time.DateOnly, time.TimeOnly

// Duration
5 * time.Second
time.Since(start)
time.Until(deadline)
t1.Sub(t2)

// Timezone
time.LoadLocation("Asia/Ho_Chi_Minh")
t.In(loc)

// Sleep / Timer
time.Sleep(d)
timer := time.NewTimer(d); <-timer.C
time.After(d)        // careful in loop

// Ticker
ticker := time.NewTicker(d); defer ticker.Stop()
<-ticker.C

// Random (1.20+)
import "math/rand/v2"
rand.IntN(n); rand.Float64(); rand.Shuffle(n, swap)

// Crypto random
import "crypto/rand"
rand.Read(b)
```

## Tóm tắt bài 1

- `time.Time` = wall clock + monotonic + tz.
- Format reference: **`2006-01-02 15:04:05`** (không phải YYYY-MM-DD).
- Layout constants: `RFC3339`, `DateOnly`, `TimeOnly`.
- Timezone: `LoadLocation` + `.In(loc)`. Docker alpine cần tzdata.
- Compare bằng `.Before/After/Equal`, không `==`.
- Timer/Ticker phải `Stop()` để tránh leak.
- `time.After` trong loop → leak — dùng `NewTimer` + Reset.
- `math/rand/v2` (Go 1.20+): auto-seed, generic.
- `crypto/rand` cho token/password/ID — KHÔNG dùng `math/rand`.

**Bài kế tiếp** → [Bài 2: Web app classic — Router, template, session](02-web-classic-app.md)

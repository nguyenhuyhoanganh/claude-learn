# Bài 4: Concurrent File Downloader — Project gốc Go concurrency

Project tổng hợp Phase 8: goroutine + channel + WaitGroup + Mutex + context cancel. Build **concurrent file downloader** download nhiều file song song, có rate limit, retry, progress tracking. Đây là pattern thật của curl wrapper, mirror tool, backup software.

## Yêu cầu

```text
[Input]
- List URLs để download
- Output directory
- Max concurrent downloads (semaphore)
- Timeout per download
- Max retries with exponential backoff

[Output]
- File downloaded vào outDir/<filename>
- Progress: total/done/failed
- Summary: thời gian total, tốc độ avg

[Pattern]
- Worker pool với goroutine
- Channel cho job queue + result
- Context cho cancellation
- WaitGroup cho synchronization
- Mutex cho stats counter
- Semaphore cho concurrency limit
```

## Step 1: Setup

```bash
mkdir downloader
cd downloader
go mod init github.com/yourname/downloader
```

## Step 2: Define types

`downloader.go`:
```go
package downloader

import (
    "context"
    "fmt"
    "io"
    "net/http"
    "os"
    "path/filepath"
    "sync"
    "time"
)

type Config struct {
    URLs          []string
    OutputDir     string
    MaxConcurrent int
    Timeout       time.Duration
    MaxRetries    int
}

type Result struct {
    URL      string
    File     string
    Size     int64
    Duration time.Duration
    Err      error
}

type Stats struct {
    mu      sync.Mutex
    Total   int
    Done    int
    Failed  int
    Bytes   int64
}

func (s *Stats) Inc(success bool, bytes int64) {
    s.mu.Lock()
    defer s.mu.Unlock()
    if success {
        s.Done++
        s.Bytes += bytes
    } else {
        s.Failed++
    }
}
```

→ Stats với Mutex — counter thread-safe.

## Step 3: Download one file (with retry)

```go
func downloadOne(ctx context.Context, url, outDir string, timeout time.Duration, retries int) (Result, error) {
    result := Result{URL: url}
    start := time.Now()
    
    fileName := filepath.Base(url)
    if fileName == "" || fileName == "/" {
        fileName = fmt.Sprintf("file-%d", time.Now().UnixNano())
    }
    result.File = filepath.Join(outDir, fileName)
    
    var lastErr error
    for attempt := 0; attempt <= retries; attempt++ {
        if attempt > 0 {
            // Exponential backoff
            wait := time.Duration(1<<uint(attempt-1)) * time.Second
            select {
            case <-ctx.Done():
                return result, ctx.Err()
            case <-time.After(wait):
            }
        }
        
        size, err := fetch(ctx, url, result.File, timeout)
        if err == nil {
            result.Size = size
            result.Duration = time.Since(start)
            return result, nil
        }
        lastErr = err
    }
    
    result.Duration = time.Since(start)
    result.Err = lastErr
    return result, lastErr
}

func fetch(ctx context.Context, url, outFile string, timeout time.Duration) (int64, error) {
    ctx, cancel := context.WithTimeout(ctx, timeout)
    defer cancel()
    
    req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
    if err != nil {
        return 0, err
    }
    
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return 0, fmt.Errorf("http: %w", err)
    }
    defer resp.Body.Close()
    
    if resp.StatusCode >= 400 {
        return 0, fmt.Errorf("status %d", resp.StatusCode)
    }
    
    out, err := os.Create(outFile)
    if err != nil {
        return 0, fmt.Errorf("create file: %w", err)
    }
    defer out.Close()
    
    n, err := io.Copy(out, resp.Body)
    if err != nil {
        os.Remove(outFile)   // cleanup partial
        return 0, fmt.Errorf("copy: %w", err)
    }
    return n, nil
}
```

Pattern:
- `context.WithTimeout` per request.
- `http.NewRequestWithContext` cho cancel.
- Exponential backoff (1s, 2s, 4s, 8s, ...).
- `os.Remove` cleanup partial file khi fail.

## Step 4: Worker pool main logic

```go
func Run(ctx context.Context, cfg Config) ([]Result, *Stats) {
    if err := os.MkdirAll(cfg.OutputDir, 0755); err != nil {
        return nil, &Stats{}
    }
    
    stats := &Stats{Total: len(cfg.URLs)}
    results := make([]Result, 0, len(cfg.URLs))
    var resultsMu sync.Mutex
    
    // Semaphore — limit concurrency
    sem := make(chan struct{}, cfg.MaxConcurrent)
    
    var wg sync.WaitGroup
    for _, url := range cfg.URLs {
        wg.Add(1)
        
        // Acquire semaphore (block nếu đầy)
        select {
        case sem <- struct{}{}:
        case <-ctx.Done():
            wg.Done()
            continue
        }
        
        go func(url string) {
            defer wg.Done()
            defer func() { <-sem }()    // release
            defer func() {
                if r := recover(); r != nil {
                    log.Printf("panic downloading %s: %v", url, r)
                }
            }()
            
            res, _ := downloadOne(ctx, url, cfg.OutputDir, cfg.Timeout, cfg.MaxRetries)
            
            resultsMu.Lock()
            results = append(results, res)
            resultsMu.Unlock()
            
            stats.Inc(res.Err == nil, res.Size)
            
            // Progress
            log.Printf("[%d/%d] %s — %v (%d bytes, %v)",
                stats.Done+stats.Failed, stats.Total,
                statusEmoji(res.Err), filepath.Base(url),
                res.Size, res.Duration)
        }(url)
    }
    
    wg.Wait()
    return results, stats
}

func statusEmoji(err error) string {
    if err == nil { return "OK" }
    return "FAIL"
}
```

Pattern:
- Channel `chan struct{}` size N = semaphore.
- `select` acquire với context cancel.
- Defer release semaphore.
- Defer recover panic per goroutine.
- Mutex cho slice + stats.

## Step 5: Print summary

```go
func PrintSummary(results []Result, stats *Stats, totalTime time.Duration) {
    fmt.Println("\n══════════ SUMMARY ══════════")
    fmt.Printf("Total:    %d files\n", stats.Total)
    fmt.Printf("Done:     %d ✓\n", stats.Done)
    fmt.Printf("Failed:   %d ✗\n", stats.Failed)
    fmt.Printf("Bytes:    %.2f MB\n", float64(stats.Bytes)/1024/1024)
    fmt.Printf("Time:     %v\n", totalTime)
    if totalTime > 0 {
        speed := float64(stats.Bytes) / totalTime.Seconds() / 1024 / 1024
        fmt.Printf("Speed:    %.2f MB/s\n", speed)
    }
    fmt.Println("════════════════════════════")
    
    if stats.Failed > 0 {
        fmt.Println("\nFailures:")
        for _, r := range results {
            if r.Err != nil {
                fmt.Printf("  - %s: %v\n", r.URL, r.Err)
            }
        }
    }
}
```

## Step 6: main.go

```go
package main

import (
    "context"
    "log"
    "os/signal"
    "syscall"
    "time"
    
    "github.com/yourname/downloader/downloader"
)

func main() {
    urls := []string{
        "https://www.gutenberg.org/files/2701/2701-0.txt",
        "https://www.gutenberg.org/files/1342/1342-0.txt",
        "https://www.gutenberg.org/files/84/84-0.txt",
        "https://www.gutenberg.org/files/11/11-0.txt",
    }
    
    cfg := downloader.Config{
        URLs:          urls,
        OutputDir:     "./downloads",
        MaxConcurrent: 3,
        Timeout:       30 * time.Second,
        MaxRetries:    2,
    }
    
    // Context with Ctrl+C handler
    ctx, stop := signal.NotifyContext(context.Background(),
        syscall.SIGINT, syscall.SIGTERM)
    defer stop()
    
    start := time.Now()
    results, stats := downloader.Run(ctx, cfg)
    duration := time.Since(start)
    
    downloader.PrintSummary(results, stats, duration)
    
    if stats.Failed > 0 {
        log.Fatalf("%d downloads failed", stats.Failed)
    }
}
```

Chạy:
```bash
go run .
```

Output mẫu:
```text
[1/4] OK — pride-and-prejudice.txt (785432 bytes, 1.2s)
[2/4] OK — frankenstein.txt (462011 bytes, 1.5s)
[3/4] OK — alice.txt (174355 bytes, 0.8s)
[4/4] OK — moby-dick.txt (1276251 bytes, 2.3s)

══════════ SUMMARY ══════════
Total:    4 files
Done:     4 ✓
Failed:   0 ✗
Bytes:    2.57 MB
Time:     2.4s
Speed:    1.07 MB/s
════════════════════════════
```

## Patterns rút ra

### 1. Semaphore via buffered channel

```go
sem := make(chan struct{}, N)
sem <- struct{}{}              // acquire
defer func() { <-sem }()       // release
```

Đơn giản, type-safe, integrated với select context.

### 2. Per-request timeout với context

```go
ctx, cancel := context.WithTimeout(parent, timeout)
defer cancel()
http.NewRequestWithContext(ctx, ...)
```

Propagate cancel xuống IO operation.

### 3. Exponential backoff retry

```go
for attempt := 0; attempt <= max; attempt++ {
    if attempt > 0 {
        wait := time.Duration(1<<uint(attempt-1)) * time.Second
        select { case <-ctx.Done(): return ctx.Err(); case <-time.After(wait): }
    }
    err := tryOnce()
    if err == nil { return nil }
}
```

Pattern chuẩn cho network operation.

### 4. Atomic stats via Mutex

```go
type Stats struct {
    mu sync.Mutex
    Done, Failed int
}
func (s *Stats) Inc() { s.mu.Lock(); defer s.mu.Unlock(); ... }
```

Hoặc atomic:
```go
type Stats struct {
    Done   atomic.Int64
    Failed atomic.Int64
}
```

Atomic nhanh hơn ~10x cho counter đơn giản.

### 5. Per-goroutine panic recovery

```go
go func() {
    defer func() {
        if r := recover(); r != nil { log.Println(r) }
    }()
    // work
}()
```

Bắt buộc cho production.

### 6. Signal context cho Ctrl+C

```go
ctx, stop := signal.NotifyContext(parent, syscall.SIGINT, syscall.SIGTERM)
defer stop()
```

Graceful shutdown.

## Bài tập mở rộng

1. Progress bar real-time (terminal cursor).
2. Resume partial download (HTTP Range header).
3. Checksum verify (SHA-256).
4. Rate limit bytes/sec (token bucket).
5. Mirror website: parse HTML extract links recursive.
6. Bandwidth allocation: split N concurrent into priority high/low.
7. Persistent queue: save state to disk, resume after crash.

## Bẫy gặp trong project

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Không close `resp.Body` | Connection leak | `defer resp.Body.Close()` |
| Quên `os.Remove` partial file | Disk garbage | Cleanup khi fail |
| `http.Get` không timeout | Hang forever | Context timeout |
| Append slice không Mutex | Race | Mutex hoặc channel |
| Goroutine không recover | Crash app | Defer recover |
| Quá nhiều goroutine | OOM, network exhausted | Semaphore |
| Retry infinite | DDoS bản thân | Max retries |
| Hardcode timeout | Inflexible | Config |

## Comparison với alternatives

| Tool | Concurrency | Pro | Con |
|---|---|---|---|
| `curl` | 1 file at a time | Standard | Slow nhiều file |
| `xargs -P` | Parallel processes | Đơn giản | Process overhead |
| `aria2c` | Multi-conn per file | Fast | Setup complex |
| Go program | Goroutines | Customizable, single binary | Phải code |

Go win khi cần custom logic (auth, retry, checksum, etc) trong 1 binary deploy dễ.

## Tóm tắt bài 4

- Build concurrent downloader áp dụng toàn bộ Phase 8.
- Patterns: worker pool, semaphore (buffered channel), context cancel, exponential backoff retry, mutex stats, per-goroutine recover.
- Signal context cho Ctrl+C graceful shutdown.
- HTTP với timeout: `NewRequestWithContext`.
- Cleanup partial file khi fail.
- Real-world: downloader, mirror, backup, ETL pipeline đều cùng pattern.

🎉 **Hoàn thành Phase 8** — Concurrency Go mastery. Bạn đã có toolkit đầy đủ để viết hệ thống concurrent production.

**Bài kế tiếp** → [Phase 9 - Bài 1: File IO và bufio](../phase-9-io-encoding/01-file-io.md)

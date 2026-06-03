# Bài 3: Custom Logger — Project đầu tiên áp dụng iota + Stringer

Lý thuyết là nền. Project là cơ. Bài này build một **logger nhỏ** dùng những gì vừa học: `type`, `const`, `iota`, `Stringer`, function. Cuối bài bạn có thư viện log dùng được trong project thật. Không phải toy code.

## Mục tiêu logger

```go
log := NewLogger(LevelInfo)
log.Trace("connecting to db")     // bị filter ra
log.Info("server started", "port", 8080)
log.Warn("slow query", "duration_ms", 1200)
log.Error("db connection lost", "err", err)
```

Yêu cầu:
- 5 level: Trace < Debug < Info < Warn < Error.
- Filter theo min level (set Info → bỏ Trace, Debug).
- Format đẹp: `[2026-06-03 10:23:11] INFO  server started port=8080`.
- Color theo level (terminal hỗ trợ ANSI).
- Type-safe — không truyền `int` random làm level.

## Step 1: Khai báo type và const

Tạo project:
```bash
mkdir custom-logger
cd custom-logger
go mod init github.com/yourname/custom-logger
```

Tạo `logger.go`:
```go
package logger

import (
    "fmt"
    "os"
    "strings"
    "time"
)

type Level int

const (
    LevelTrace Level = iota
    LevelDebug
    LevelInfo
    LevelWarn
    LevelError
)

var levelNames = [...]string{
    LevelTrace: "TRACE",
    LevelDebug: "DEBUG",
    LevelInfo:  "INFO",
    LevelWarn:  "WARN",
    LevelError: "ERROR",
}

func (l Level) String() string {
    if int(l) < 0 || int(l) >= len(levelNames) {
        return "UNKNOWN"
    }
    return levelNames[l]
}
```

Giải thích từng phần:
- `type Level int` — tạo enum type. Function nhận `Level` không nhận `int`.
- `const (... = iota)` — sinh 5 value 0-4.
- `levelNames` là array (`[...]string{...}`) — compiler tự đếm size. Index bằng `Level` để lookup tên.
- `String()` implement `fmt.Stringer`. `fmt.Println(LevelInfo)` → "INFO".

## Step 2: Struct Logger

```go
type Logger struct {
    minLevel Level
    out      *os.File   // mặc định os.Stdout
}

func New(minLevel Level) *Logger {
    return &Logger{
        minLevel: minLevel,
        out:      os.Stdout,
    }
}
```

`*Logger` (pointer) — để khi gọi method có thể đổi state (nếu sau này thêm `SetLevel`).

Bài Phase 4 sẽ kỹ về pointer.

## Step 3: Method log core

```go
// log là method private (chữ thường) — chỉ dùng trong package
func (l *Logger) log(level Level, msg string, fields ...any) {
    if level < l.minLevel {
        return
    }

    ts := time.Now().Format("2006-01-02 15:04:05")
    var sb strings.Builder
    sb.WriteString(fmt.Sprintf("[%s] %-5s %s", ts, level, msg))

    // Format fields key=value
    for i := 0; i < len(fields); i += 2 {
        key := fmt.Sprintf("%v", fields[i])
        var val any = "<missing>"
        if i+1 < len(fields) {
            val = fields[i+1]
        }
        sb.WriteString(fmt.Sprintf(" %s=%v", key, val))
    }

    sb.WriteString("\n")
    fmt.Fprint(l.out, sb.String())
}
```

Vài point quan trọng:
- `fields ...any` — variadic, nhận 0+ argument bất kỳ type. Bài Function sẽ kỹ.
- `time.Format("2006-01-02 15:04:05")` — Go format date đặc biệt. **Đây là format string mặc định**, không phải `YYYY-MM-DD`. Số `2006` = year ref, `01` = month, `02` = day, `15` = hour, `04` = minute, `05` = second. Học thuộc.
- `%-5s` — left-align string trong 5 ký tự → cột thẳng hàng.
- `strings.Builder` — concat string hiệu năng (không tạo nhiều string trung gian).

## Step 4: Method public

```go
func (l *Logger) Trace(msg string, fields ...any) {
    l.log(LevelTrace, msg, fields...)
}

func (l *Logger) Debug(msg string, fields ...any) {
    l.log(LevelDebug, msg, fields...)
}

func (l *Logger) Info(msg string, fields ...any) {
    l.log(LevelInfo, msg, fields...)
}

func (l *Logger) Warn(msg string, fields ...any) {
    l.log(LevelWarn, msg, fields...)
}

func (l *Logger) Error(msg string, fields ...any) {
    l.log(LevelError, msg, fields...)
}
```

5 method này chỉ là syntactic sugar cho `log()`. Nhưng API user-facing đẹp:
```go
log.Info("hi")        // gọn
log.log(LevelInfo, "hi")   // dài, lộ implementation
```

## Step 5: Color theo level

```go
const (
    colorReset  = "\033[0m"
    colorGray   = "\033[90m"
    colorBlue   = "\033[34m"
    colorGreen  = "\033[32m"
    colorYellow = "\033[33m"
    colorRed    = "\033[31m"
)

func (l Level) Color() string {
    return [...]string{
        LevelTrace: colorGray,
        LevelDebug: colorBlue,
        LevelInfo:  colorGreen,
        LevelWarn:  colorYellow,
        LevelError: colorRed,
    }[l]
}
```

Cập nhật `log()`:
```go
sb.WriteString(fmt.Sprintf("[%s] %s%-5s%s %s",
    ts, level.Color(), level, colorReset, msg))
```

→ Terminal hỗ trợ ANSI (Linux, Mac, Windows Terminal mới) sẽ in màu. CI/CD log file thì sẽ thấy raw `\033[...]`.

## Step 6: Sử dụng

`main.go`:
```go
package main

import "github.com/yourname/custom-logger/logger"

func main() {
    log := logger.New(logger.LevelInfo)

    log.Trace("connecting to db")           // bị filter
    log.Debug("query plan", "rows", 100)    // bị filter
    log.Info("server started", "port", 8080, "env", "prod")
    log.Warn("slow query", "duration_ms", 1200)
    log.Error("db lost", "err", "EOF")
}
```

Output:
```text
[2026-06-03 10:23:11] INFO  server started port=8080 env=prod
[2026-06-03 10:23:11] WARN  slow query duration_ms=1200
[2026-06-03 10:23:11] ERROR db lost err=EOF
```

(Mỗi level có màu khác trong terminal.)

## Step 7: Test (peek)

```go
// logger_test.go
package logger

import (
    "bytes"
    "strings"
    "testing"
)

func TestLogger_FilterByLevel(t *testing.T) {
    var buf bytes.Buffer
    l := &Logger{minLevel: LevelWarn, out: nil}
    // (tạm thời đổi out cho test — phase test sẽ kỹ)
    
    l.Info("info msg")
    l.Warn("warn msg")
    l.Error("error msg")

    out := buf.String()
    if strings.Contains(out, "info msg") {
        t.Error("expected info to be filtered")
    }
    if !strings.Contains(out, "warn msg") {
        t.Error("expected warn to be logged")
    }
}
```

Chạy:
```bash
go test ./...
```

Logger giờ chạy được, có test. Phase 12 (Testing) deep dive.

## Hiểu sâu: Variadic argument

```go
func (l *Logger) Info(msg string, fields ...any) { ... }
```

`fields ...any` nghĩa là:
- Có thể 0 argument: `log.Info("hi")`.
- 1 argument: `log.Info("hi", "a")`.
- 100 argument: `log.Info("hi", k1, v1, k2, v2, ...)`.

Bên trong function, `fields` là `[]any` (slice). Pass tiếp:
```go
l.log(LevelInfo, msg, fields...)
```

Toán tử `...` unpack slice back về variadic.

## Hiểu sâu: Method receiver

```go
func (l *Logger) Info(...) { ... }
//   ─────────
//   receiver — l là instance
```

So với function thường:
```go
func Info(l *Logger, ...) { ... }
```

Method cho phép gọi `log.Info(...)` thay vì `Info(log, ...)`. Đó là **toàn bộ** OOP "syntax" của Go. Không có class, chỉ có method bind vào type.

Phase 6 (OOP) deep dive.

## Bẫy phổ biến khi build logger

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Log với `fmt.Println` không filter | Spam, không control level | Implement min-level filter |
| Concat string với `+` trong hot path | GC thrash | `strings.Builder` |
| Format time với `YYYY-MM-DD` | Sai format Go | Dùng layout reference `2006-01-02` |
| Receiver bằng value `(l Logger)` thay pointer | Đổi state không lưu | Dùng `*Logger` |
| Quên `level.String()` | Print `2` thay vì `INFO` | Implement Stringer |
| Hardcode `os.Stdout` | Không test được | Dùng `io.Writer` field |
| Lock thread chia sẻ | Race condition | Mutex hoặc dùng channel (phase concurrency) |
| Log object lớn — JSON | Memory + IO chậm | Log key=value, hoặc structured (slog) |

## Pattern production: standard library `log/slog`

Go 1.21+ có sẵn `log/slog` (structured logger):

```go
import "log/slog"

logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
    Level: slog.LevelInfo,
}))

logger.Info("server started", "port", 8080, "env", "prod")
// {"time":"2026-06-03T10:23:11","level":"INFO","msg":"server started","port":8080,"env":"prod"}
```

Production thường dùng `slog` thay vì viết logger custom. Nhưng project nhỏ học Go, build từ scratch dạy nhiều hơn.

## Mở rộng tự làm

Bài tập cho bạn (giải pháp ở GitHub course):
1. Thêm method `SetLevel(Level)` đổi min level runtime.
2. Thêm `WithField(k, v)` — return Logger mới có context: `log.WithField("user_id", 1).Info("login")`.
3. Output JSON: thêm method `NewJSONLogger()`.
4. Multi output: cùng lúc viết stdout + file.
5. Thread-safe: thêm `sync.Mutex`.
6. Benchmark so với `fmt.Println`.

## Tóm tắt bài 3

- Combine `type` + `const iota` + `String()` cho Level enum type-safe.
- `*Logger` pointer receiver để method có thể đổi state.
- Variadic `...any` cho field key-value linh hoạt.
- `time.Format("2006-01-02 15:04:05")` — Go layout reference đặc biệt.
- `strings.Builder` cho concat hiệu năng.
- ANSI color cho terminal output.
- Filter min level — early return.
- Production thật dùng `log/slog` (Go 1.21+), nhưng build từ scratch dạy chắc.

**Bài kế tiếp** → [Phase 3 - Bài 1: For loop, cách duy nhất Go cho phép lặp](../phase-3-control-flow/01-for-loop.md)

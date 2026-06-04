# Bài 3: Chương trình Go đầu tiên — Hello World + cấu trúc package

Hello World trong mọi ngôn ngữ là 3 dòng, nhưng riêng với Go, Hello World **dạy bạn được** vài nguyên lý nền tảng mà sau này áp dụng cho mọi file Go bạn viết: `package`, `import`, `func main()`, và lý do mỗi thứ nằm đúng chỗ đó.

## File hello.go đầu tiên

Tạo file `hello.go`:

```go
package main

import "fmt"

func main() {
    fmt.Println("Hello, Go!")
}
```

Chạy:
```bash
go run hello.go
# Hello, Go!
```

Có vẻ đơn giản, nhưng mỗi dòng có vai trò bắt buộc. Bỏ một dòng → compile fail.

## Mổ xẻ từng dòng

### 1. `package main`

```go
package main
```

- **Mọi file Go bắt đầu bằng khai báo package**. Không có ngoại lệ.
- `main` là package đặc biệt: cho biết file này là **entry point của executable**.
- Package khác (`package mylib`) là library, không chạy được bằng `go run`.

So sánh với Java:
```java
// Java: class Main { public static void main(String[] args) {} }
//        ↑ class wrap entry point
```

Go: chỉ cần `package main` + `func main()`. Không class. Không OOP overhead.

### 2. `import "fmt"`

```go
import "fmt"
```

- `fmt` (formatted I/O) là package standard library chứa `Println`, `Printf`, `Sprintf`, ...
- Đường dẫn import là **package path**, không phải tên file.
- Standard library: chỉ tên ngắn (`fmt`, `os`, `io`).
- Third-party: full URL (`github.com/gin-gonic/gin`).

Import multiple:
```go
import (
    "fmt"
    "os"
    "github.com/gin-gonic/gin"
)
```

→ Convention: dùng block `()` cho nhiều import. `gofmt` tự sắp xếp alphabet, tách nhóm stdlib vs third-party.

**Quan trọng**: Go cấm import không dùng. Code này compile fail:
```go
import (
    "fmt"
    "os"     // ← unused, COMPILE ERROR
)

func main() {
    fmt.Println("hi")
}
```

→ Đây là design intent: code sạch, không rác. Nhiều người mới khó chịu, nhưng sau quen sẽ thấy lợi.

### 3. `func main()`

```go
func main() {
    fmt.Println("Hello, Go!")
}
```

- `func` keyword khai báo function.
- `main()` không nhận argument, không return value.
- **Phải nằm trong `package main`**. Nếu file là `package foo` thì `main()` không được gọi là entry point.
- Khi binary chạy, OS gọi runtime Go → runtime gọi `main()`.

### 4. `fmt.Println(...)`

```go
fmt.Println("Hello, Go!")
```

- Gọi function `Println` từ package `fmt`.
- Cú pháp **`package.Identifier`** — chữ cái đầu **viết hoa = exported (public)**. `fmt.println` (chữ thường) sẽ fail vì không exported.

→ Đây là cách Go control visibility:
- `Println` → public, dùng ngoài package được.
- `println` → private, chỉ dùng trong cùng package.

Không có `public/private` keyword. Quy ước hoa/thường.

## Cấu trúc thư mục Go điển hình

Hello World 1 file là đủ. Project thật phức tạp hơn:

```text
my-app/
├── go.mod                   ← module manifest (giống package.json)
├── go.sum                   ← lock file (giống package-lock.json)
├── main.go                  ← entry point (package main)
├── README.md
├── cmd/                     ← multiple binaries
│   ├── server/
│   │   └── main.go
│   └── cli/
│       └── main.go
├── internal/                ← package private, không export ngoài module
│   ├── auth/
│   │   ├── jwt.go
│   │   └── jwt_test.go
│   └── storage/
│       └── postgres.go
├── pkg/                     ← package public, có thể import bởi module khác
│   └── logger/
│       └── logger.go
└── api/                     ← OpenAPI/Proto definitions
    └── openapi.yaml
```

Convention quan trọng:
- `cmd/<binary-name>/main.go`: 1 binary per subfolder. Cho phép `go build ./cmd/server` + `go build ./cmd/cli`.
- `internal/`: Go compiler enforce **không import từ ngoài module**. Encapsulation thật sự.
- `pkg/`: ngược lại — designed để external project import.

## Tạo project hello-go đầy đủ

```bash
mkdir hello-go
cd hello-go

# Init module — bắt buộc cho project mới
go mod init github.com/yourname/hello-go
# → tạo file go.mod:
#   module github.com/yourname/hello-go
#   go 1.24

# Tạo main.go
cat > main.go <<'EOF'
package main

import "fmt"

func main() {
    fmt.Println("Hello, Go!")
}
EOF

# Run
go run .
# Hello, Go!

# Build binary
go build -o hello
./hello
# Hello, Go!
```

→ Path `github.com/yourname/hello-go` không cần thật. Đó chỉ là **module path** — định danh module trong import. Nếu publish lên GitHub thật, path phải khớp URL.

## Multiple file trong cùng package

Tách function logic ra file riêng:

```text
hello-go/
├── go.mod
├── main.go
└── greet.go
```

`greet.go`:
```go
package main         // ← cùng package main

import "fmt"

func greet(name string) {
    fmt.Printf("Hello, %s!\n", name)
}
```

`main.go`:
```go
package main

func main() {
    greet("Alice")   // ← gọi function trong file khác cùng package
    greet("Bob")
}
```

Chạy:
```bash
go run .
# Hello, Alice!
# Hello, Bob!
```

Hoặc liệt kê file:
```bash
go run main.go greet.go
```

→ Trong **cùng package**, không cần import. Tất cả identifier (hoa hay thường) đều dùng được.

## Khi nào tách package?

```text
[Quy tắc]
- File ngắn, 1 chủ đề    →  cùng file
- File 200-400 dòng       →  tách file mới cùng package
- File 500+ dòng          →  chia package
- Tính năng độc lập       →  package riêng (internal/auth, internal/storage)
```

Tách package quá sớm → over-engineering. Tách muộn → file dài khó đọc.

## `fmt.Println` vs `Printf` vs `Print`

```go
fmt.Print("hi")             // không xuống dòng
fmt.Print("hi", "you")      // "hiyou" — không space giữa
fmt.Println("hi")           // xuống dòng
fmt.Println("hi", "you")    // "hi you\n" — auto space
fmt.Printf("hi %s\n", "you") // format string

// Format verb phổ biến:
// %s   string
// %d   integer (decimal)
// %f   float
// %v   bất kỳ value (đa năng)
// %+v  value kèm tên field
// %T   type
// %q   string trong dấu nháy
// %x   hex
// %t   bool
```

```go
name := "Alice"
age := 30
fmt.Printf("%s is %d years old\n", name, age)
// Alice is 30 years old

fmt.Printf("%v %T\n", age, age)
// 30 int
```

Bài Phase 2 sẽ dùng `Printf` rất nhiều.

## Comment trong Go

```go
// Single-line comment

/*
Multi-line comment.
Hiếm dùng — convention là dùng nhiều dòng //
*/

// Comment đặt trên type/function/var được export → doc string
// Bắt đầu bằng tên identifier theo convention godoc

// Greet prints a greeting to stdout.
func Greet(name string) {
    fmt.Println("Hello,", name)
}
```

`godoc` đọc comment trên function export → sinh tài liệu tự động. Chuẩn cộng đồng:
- Comment bắt đầu bằng **tên identifier**.
- Câu hoàn chỉnh, hết bằng dấu chấm.

## Run vs Build — bài học thực tế

```bash
# Dev — chạy nhanh, không cần binary
go run .

# Local build để test
go build -o app && ./app

# Production build
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o app .
# Binary tĩnh, stripped, nhỏ nhất

# Đo size
ls -lh app
# hello-go: -rwxr-xr-x  1 user  staff  2.1M  app
```

Một binary 2MB chứa: code của bạn + runtime Go + GC + scheduler. Chạy được trên mọi Linux x86_64 không cần cài thêm gì.

## Bẫy thường gặp với chương trình đầu tiên

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên `package main` | "expected 'package'" | Mọi .go file bắt đầu bằng `package` |
| `package` không phải `main` cho file có `func main()` | Không phải executable | Dùng `package main` cho entry point |
| Import package không dùng | Compile error | Xoá import, hoặc dùng `_` (blank import) |
| Tên function viết thường khi cần export | Package khác không import được | Viết hoa chữ đầu |
| Quên `go mod init` | "go.mod file not found" | `go mod init module-path` |
| `func main` viết thành `func Main` | Compile fail (entry point phải `main`) | Đặt đúng `func main()` |
| File `.go` trong nhiều package cùng folder | Compile fail | 1 folder = 1 package |
| Format thủ công thay vì gofmt | Inconsistent code | `gofmt -w .` hoặc IDE auto-format |

## So sánh với Hello World các ngôn ngữ

| Ngôn ngữ | Hello World |
|---|---|
| Go | `fmt.Println("Hello")` (3 dòng + import) |
| Python | `print("Hello")` (1 dòng) |
| Java | 5+ dòng (class, main, System.out.println) |
| C | 4 dòng (include, main, return) |
| Rust | `println!("Hello")` (3 dòng) |
| Node.js | `console.log("Hello")` (1 dòng) |

Go nằm giữa: compile, type-safe (như C/Java/Rust) nhưng syntax gọn (như Python/Node).

## Pattern phổ biến trong file `main.go` production

```go
package main

import (
    "context"
    "log/slog"
    "os"
    "os/signal"
    "syscall"
)

func main() {
    // 1. Setup logger
    logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

    // 2. Setup context với graceful shutdown
    ctx, stop := signal.NotifyContext(context.Background(),
        syscall.SIGINT, syscall.SIGTERM)
    defer stop()

    // 3. Run app
    if err := run(ctx, logger); err != nil {
        logger.Error("app failed", "error", err)
        os.Exit(1)
    }
}

func run(ctx context.Context, logger *slog.Logger) error {
    // Logic chính ở đây
    return nil
}
```

Đây là pattern bạn sẽ gặp ở 90% project Go production:
- `func main()` chỉ setup + delegate.
- `func run()` return error → testable.
- `os.Exit(1)` khi fail (không panic).
- `context.Context` chuyển xuống các layer.

Phase 5-7 sẽ dạy chi tiết từng pattern.

## Tóm tắt bài 3

- Mọi file Go bắt đầu bằng `package X`. Executable dùng `package main`.
- `func main()` là entry point của binary. Nhận 0 arg, return 0 value.
- Import chỉ những gì dùng — Go compile fail với unused import (design intent).
- Visibility: chữ hoa đầu = exported (public), chữ thường = unexported (private).
- 1 folder = 1 package. Nhiều file trong cùng folder share identifier không cần import.
- `go mod init` trước khi viết code (module mới).
- Pattern production: `main()` setup → `run()` logic → trả error.
- Convention thư mục: `cmd/` (binaries), `internal/` (private), `pkg/` (public lib).

**Bài kế tiếp** → [Bài 4: Variables, Constants và type system của Go](../phase-2-core-language/01-values-variables.md)

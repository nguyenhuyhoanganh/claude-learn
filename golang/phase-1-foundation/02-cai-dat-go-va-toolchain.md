# Bài 2: Cài đặt Go và làm chủ Go toolchain

Mọi project Go đều bắt đầu bằng 2 thứ: **Go runtime** trên máy và **kiến thức về toolchain** (`go run`, `go build`, `go fmt`, ...). Cài thì dễ, nhưng nhiều người học Go cả tháng vẫn chỉ biết `go run` và nghĩ đó là tất cả. Bài này gỡ rối toàn bộ.

## Yêu cầu version

Course này dùng **Go 1.23 trở lên** (tại thời điểm record là 1.24.3). Lý do:
- 1.18 có **generics** (lần đầu).
- 1.21 có `slices`, `maps` standard library mới.
- 1.22 sửa loop variable scoping (bug nổi tiếng).
- 1.23 có range-over-func, weak pointer.

Version cũ hơn vẫn chạy được phần lớn code, nhưng vài chỗ sẽ lệch syntax. Cập nhật là an toàn nhất.

## Cài Go trên macOS

```bash
# Cách 1: Tải binary từ go.dev/dl
# Vào https://go.dev/dl/
# Mac M1/M2/M3 → "Apple Silicon" (arm64)
# Mac Intel    → "x86-64"
# Mở .pkg → next next done

# Cách 2: Homebrew (khuyên dùng — dễ update)
brew install go

# Verify
go version
# go version go1.24.3 darwin/arm64
```

## Cài Go trên Linux

```bash
# Cách 1: apt (Ubuntu/Debian) — thường version cũ
sudo apt update
sudo apt install golang-go

# Cách 2: snap — version mới
sudo snap install go --classic

# Cách 3: tarball official — mới nhất
wget https://go.dev/dl/go1.24.3.linux-amd64.tar.gz
sudo rm -rf /usr/local/go
sudo tar -C /usr/local -xzf go1.24.3.linux-amd64.tar.gz

# Add to PATH
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

go version
```

## Cài Go trên Windows

```text
1. Tải .msi từ https://go.dev/dl/  (chọn windows-amd64)
2. Run installer — next next done
3. Mở PowerShell mới (cần restart để PATH cập nhật)
4. Verify: go version
```

Nếu `go: command not found` → restart terminal, hoặc thêm thủ công `C:\Program Files\Go\bin` vào PATH.

## Các biến môi trường Go phải biết

```bash
go env
# GOPATH      = workspace cũ (legacy, vẫn dùng làm cache)
# GOROOT      = nơi cài Go (/usr/local/go hoặc /opt/homebrew/go)
# GOBIN       = nơi `go install` đặt binary
# GOPROXY     = proxy tải module (mặc định https://proxy.golang.org)
# GOMODCACHE  = cache module ($GOPATH/pkg/mod)
# GOOS        = OS đích (darwin, linux, windows)
# GOARCH      = CPU arch (amd64, arm64)
```

Thiết lập:
```bash
# Đặt GOBIN để binary install nằm trong PATH
export GOBIN=$HOME/go/bin
export PATH=$PATH:$GOBIN

# Set GOPROXY (China dùng goproxy.cn vì firewall)
export GOPROXY=https://proxy.golang.org,direct
```

→ Add vào `~/.zshrc` / `~/.bashrc` / Windows env var.

## Go toolchain — 7 lệnh phải thuộc

```text
go run     →  compile + chạy trong /tmp
go build   →  compile thành binary, không chạy
go fmt     →  format code theo chuẩn Go
go mod     →  quản lý dependencies
go test    →  chạy test
go vet     →  static analysis
go install →  build + cài binary vào $GOBIN
```

### `go run` — Compile + Run (dev mode)

```bash
go run main.go
# Compile main.go ra binary tạm trong /tmp/go-build*
# Chạy binary đó
# Xoá binary khi exit
```

Dùng khi: thử nhanh, không cần file binary.

```bash
# Multi-file
go run main.go helper.go

# Run cả package
go run .

# Run package có nhiều file
go run ./cmd/server
```

### `go build` — Compile to Binary

```bash
go build main.go
# Sinh ra binary `main` (Mac/Linux) hoặc `main.exe` (Windows)
./main

# Đặt tên output
go build -o server main.go
./server

# Build cả package
go build .
go build ./cmd/server

# Build cross-compile (đỉnh của Go)
GOOS=linux GOARCH=amd64 go build -o app-linux main.go
GOOS=windows GOARCH=amd64 go build -o app.exe main.go
GOOS=darwin GOARCH=arm64 go build -o app-mac main.go
```

→ Cross-compile **không cần Docker hay VM** — đây là điểm khác biệt lớn với Java/Python.

### `go fmt` — Format chuẩn

```bash
# Format 1 file
gofmt -w main.go

# Format cả package (cách phổ biến)
go fmt ./...

# Format toàn project
gofmt -w -s .
```

→ **Mọi dự án Go production đều chạy `gofmt`** trước commit. VSCode + Go extension tự động format on save.

`gofmt` không có config (cố ý). Không tranh cãi tab/space, brace style. Tất cả Go code trên thế giới trông giống nhau.

### `go mod` — Module + Dependencies

```bash
# Khởi tạo module mới
go mod init github.com/yourname/projectname

# Sinh file go.mod:
# module github.com/yourname/projectname
# go 1.24

# Tải dependency
go get github.com/gin-gonic/gin
# Tự update go.mod + go.sum

# Tải version cụ thể
go get github.com/gin-gonic/gin@v1.10.0

# Update dependency
go get -u github.com/gin-gonic/gin

# Xoá dependency không dùng
go mod tidy

# Download tất cả deps vào cache
go mod download

# Vendor (copy deps vào folder vendor/)
go mod vendor
```

Bài Phase 7 đào sâu modules. Tạm thời nhớ: **mọi project mới đều bắt đầu bằng `go mod init`**.

### `go test` — Test

```bash
# Run test trong package hiện tại
go test

# Run test trong toàn workspace
go test ./...

# Verbose
go test -v ./...

# Run 1 test cụ thể
go test -run TestUserCreate

# Coverage
go test -cover ./...
go test -coverprofile=cover.out
go tool cover -html=cover.out

# Benchmark
go test -bench=.

# Race detector — phát hiện data race
go test -race ./...
```

`-race` cực kỳ quan trọng cho code concurrency. Bài Phase 8 sẽ deep dive.

### `go vet` — Static Analysis

```bash
go vet ./...
# Báo các vấn đề tiềm ẩn:
# - format string sai (Printf %d nhận string)
# - mutex copy
# - struct tag sai
# - unreachable code
```

→ CI/CD chuẩn luôn chạy `go vet`. Free quality check, không cài thêm gì.

### `go install` — Cài CLI tool

```bash
# Cài tool từ remote
go install github.com/swaggo/swag/cmd/swag@latest
# Binary vào $GOBIN, có thể gõ `swag` từ shell

# Trước Go 1.16: dùng `go get` để install
# Sau 1.16: dùng `go install` (rõ nghĩa hơn)
```

Khác `go get`:
- `go get`: thêm/update dependency vào go.mod.
- `go install`: build binary và cài vào `$GOBIN`.

## Compile flow nội bộ

```text
[main.go source]
      │
      ▼
[Parser]                 → AST (Abstract Syntax Tree)
      │
      ▼
[Type checker]           → kiểm tra type, kiểm tra unused import
      │
      ▼
[SSA generator]          → Static Single Assignment IR
      │
      ▼
[Optimizer]              → inline, escape analysis, dead code
      │
      ▼
[Code generator]         → machine code cho GOARCH
      │
      ▼
[Linker]                 → kết hợp runtime + GC + binary tĩnh
      │
      ▼
[Binary tĩnh]            → chạy ngay, không cần JVM/interpreter
```

Đặc biệt: **escape analysis** quyết định biến nào nằm stack, biến nào nằm heap. Hiểu nó giúp viết code ít allocate, GC nhẹ — Phase 4 sẽ chi tiết.

## `go run` vs `go build` — bài học subtle

```bash
# Thử
echo 'package main
import "fmt"
func main() { fmt.Println("hi") }' > main.go

# go run — không có binary
go run main.go
ls -la            # không có "main"

# go build — sinh binary
go build main.go
ls -la            # có "main" (size ~2MB)
./main
```

→ Dev loop dùng `go run`. Production deploy build binary 1 lần, ship binary đi.

## Build flag quan trọng

```bash
# Stripped binary (nhỏ hơn ~30%)
go build -ldflags="-s -w" -o app main.go

# Inject version từ git tag
VERSION=$(git describe --tags)
go build -ldflags="-X main.Version=$VERSION" -o app

# Static binary cho Alpine Docker (CGO disabled)
CGO_ENABLED=0 GOOS=linux go build -o app main.go

# Race detector binary (chạy production để debug)
go build -race -o app main.go
```

CGO disable rất quan trọng cho Docker:
```dockerfile
FROM golang:1.24 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /app

FROM alpine:3.20          # hoặc scratch (0MB)
COPY --from=builder /app /app
ENTRYPOINT ["/app"]
```

→ Image final ~10MB chứa binary tĩnh. Đây là siêu năng lực của Go cho cloud.

## Bẫy thường gặp khi setup

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| `go: command not found` sau install | PATH chưa cập nhật | Restart terminal, kiểm tra `$PATH` |
| Project ngoài `$GOPATH/src` không build | Code legacy (trước module) | Dùng module: `go mod init` |
| `GOPROXY` block (Trung Quốc) | `go get` fail | `GOPROXY=https://goproxy.cn,direct` |
| Cài 2 version Go cùng lúc | Version mix | Dùng `gvm` hoặc `asdf` để switch |
| VSCode không hiểu code | Thiếu Go extension | Cài `golang.go` extension + `gopls` |
| `gofmt` sửa code tự động lúc khó chịu | Conflict với editor format | Tắt format-on-save khi đang debug |
| Build to Docker bị lỗi glibc | CGO enable | `CGO_ENABLED=0` |

## Setup VSCode (khuyên dùng)

```text
1. Cài VSCode
2. Cài extension: "Go" (golang.go)
3. Mở .go file → bottom-right có prompt "Install Tools" → cài hết:
   - gopls (language server)
   - goimports (auto import)
   - dlv (debugger)
   - staticcheck (advanced lint)
4. Setting: format on save ON
```

Vài shortcut:
- `F12`: go to definition
- `Shift+F12`: find references
- `Ctrl+Shift+P → Go: Test File`: chạy test
- `F5`: debug

## Tóm tắt bài 2

- Cài Go: brew (Mac), apt/snap/tarball (Linux), .msi (Windows). Version ≥ 1.23.
- Verify: `go version`.
- 7 lệnh toolchain: `run`, `build`, `fmt`, `mod`, `test`, `vet`, `install`.
- `go run`: dev. `go build`: production. `gofmt`: format chuẩn — không bàn cãi.
- Cross-compile bằng `GOOS=X GOARCH=Y go build` — không cần Docker.
- Static binary: `CGO_ENABLED=0` cho image Docker scratch/alpine.
- `go vet` + `go test -race`: free quality check.
- VSCode + extension `golang.go` + `gopls` = setup tối ưu.

**Bài kế tiếp** → [Bài 3: Chương trình Go đầu tiên — Hello World + cấu trúc package](03-chuong-trinh-go-dau-tien.md)

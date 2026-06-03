# Bài 2: Go Modules — Quản lý dependency

Go modules ra mắt từ 1.11 (2018), chuẩn hóa từ 1.16 — kết thúc thời "GOPATH chaos" + vendor folder. Hôm nay mọi project Go bắt đầu bằng `go mod init`. Không có module = lạc hậu. Bài này clear modules đủ cho production: tạo, add dependency, version, replace, private repo, vendor.

## Module là gì?

```text
[Module]
- Collection of Go packages
- Có file go.mod
- Có version (semver tag)
- Có path duy nhất (URL-like)
```

```text
module github.com/yourname/myapp
│
├── go.mod                       ← manifest
├── go.sum                       ← lock file
├── main.go                      (package main)
├── api/                         (package api)
│   └── server.go
└── internal/auth/               (package auth)
    └── jwt.go
```

## `go mod init`

```bash
mkdir myapp
cd myapp
go mod init github.com/yourname/myapp
```

Sinh `go.mod`:
```text
module github.com/yourname/myapp

go 1.24
```

→ Module path = URL-like. Nếu publish lên GitHub thì path khớp URL repo. Internal project có thể dùng path bất kỳ (`mycompany.com/myteam/myapp`).

## Thêm dependency

```bash
go get github.com/gin-gonic/gin
```

`go.mod` được update:
```text
module github.com/yourname/myapp

go 1.24

require github.com/gin-gonic/gin v1.10.0
```

`go.sum` được tạo (lock file):
```text
github.com/gin-gonic/gin v1.10.0 h1:hash...
github.com/gin-gonic/gin v1.10.0/go.mod h1:hash...
```

→ `go.sum` chứa checksum của mỗi module + version. Đảm bảo build reproducible.

## Version selection

```bash
# Latest version (theo semver)
go get github.com/lib/pq

# Specific version
go get github.com/lib/pq@v1.10.9

# Latest minor patch
go get github.com/lib/pq@latest

# Specific commit (pseudo-version)
go get github.com/lib/pq@a1b2c3d
# → tự generate version v0.0.0-20240101120000-a1b2c3d

# Branch (lấy commit HEAD)
go get github.com/lib/pq@master

# Tag prerelease
go get github.com/foo/bar@v2.0.0-beta.1
```

## Semver trong Go modules

```text
v1.2.3
│ │ │
│ │ └── PATCH — bug fix backward-compat
│ └──── MINOR — new feature backward-compat
└────── MAJOR — breaking change

v0.x.x — pre-stable, breaking allowed
v1.0.0+ — stable, breaking = bump MAJOR
```

## Major version 2+ — Special

Khi module bump v2+, path **phải có suffix /v2**:

```text
github.com/foo/bar       (v0.x, v1.x)
github.com/foo/bar/v2    (v2.x.x)
github.com/foo/bar/v3    (v3.x.x)
```

```go
import "github.com/foo/bar/v2"
```

→ Cho phép project import nhiều version song song. Quirk của Go.

## `go mod tidy`

```bash
go mod tidy
```

Cleanup `go.mod`:
- Remove unused dependency.
- Add missing dependency (import nhưng chưa khai báo).
- Update `go.sum` đúng.

Chạy trước commit. CI/CD thường check `go mod tidy && git diff --exit-code`.

## `go mod download`

```bash
go mod download
```

Download mọi dependency vào module cache (`$GOMODCACHE`). Useful cho:
- CI/CD pre-warm cache.
- Docker build cache layer.

```dockerfile
# Docker pattern
COPY go.mod go.sum ./
RUN go mod download         # cache layer
COPY . .
RUN go build -o app
```

## `go mod vendor`

```bash
go mod vendor
```

Copy mọi dependency vào folder `vendor/`. Compile sẽ dùng vendor thay vì download.

Use case:
- Build offline.
- Audit code dependency.
- Đảm bảo dependency không bị xóa khỏi internet (Google removed packages incident).

Trade-off: tăng repo size + commit nhiều file vendor.

## `replace` directive — Local override

```text
// go.mod
module github.com/yourname/myapp

go 1.24

require github.com/foo/bar v1.0.0

replace github.com/foo/bar => ../mybar
```

→ Khi import `github.com/foo/bar`, Go dùng folder `../mybar` thay vì download.

Use case:
- Phát triển song song 2 module.
- Test fix bug local trước khi publish.
- Fork temporary.

**Cảnh báo**: production không nên `replace` to local — break reproducibility. Replace to fork khác:
```text
replace github.com/foo/bar => github.com/yourname/bar v1.0.1-fix
```

## `exclude` directive

```text
exclude github.com/foo/bar v1.2.0
```

→ Không cho phép version cụ thể này (vd có security bug).

## Private repository

Mặc định Go module proxy qua `proxy.golang.org`. Private repo cần:

```bash
# Bypass proxy cho private path
export GOPRIVATE=github.com/mycompany/*

# Hoặc bypass cho mọi auth (không recommend)
export GONOSUMCHECK=*
export GOFLAGS=-insecure
```

Auth thường qua Git SSH hoặc token:
```bash
# Git config dùng token
git config --global url."https://oauth2:TOKEN@github.com".insteadOf "https://github.com"
```

## Workspace mode (Go 1.18+)

Nhiều module liên kết trong 1 workspace:
```bash
mkdir myws
cd myws
go work init ./app ./lib
```

`go.work`:
```text
go 1.24

use (
    ./app
    ./lib
)
```

→ Hot reload dev với multi-module. Không cần `replace`.

## Module cache

```bash
# Xem cache
go env GOMODCACHE
# /Users/x/go/pkg/mod

# Clean cache
go clean -modcache

# Cache size
du -sh $(go env GOMODCACHE)
```

Cache global → share giữa projects → tiết kiệm bandwidth.

## Pattern Docker build

```dockerfile
FROM golang:1.24 AS builder
WORKDIR /src

# Tận dụng Docker layer cache cho deps
COPY go.mod go.sum ./
RUN go mod download

# Code thay đổi → chỉ rebuild stage này
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /app

FROM alpine:3.20
COPY --from=builder /app /app
ENTRYPOINT ["/app"]
```

→ Mỗi `COPY` là 1 layer. `go.mod` ít đổi → cache layer download deps lâu.

## Tìm dependency

```bash
# Search Go packages
go install golang.org/x/tools/cmd/godoc@latest

# Hoặc dùng web
# pkg.go.dev/search?q=postgres

# Khi import package, IDE auto suggest
```

Tin cậy:
- Stdlib trước (đủ 70% case).
- Package có nhiều star, active maintain.
- Check vulnerability: `govulncheck ./...`.

## `govulncheck` — Security scan

```bash
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...
```

Scan code + dependency có known CVE. Production phải chạy.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên `go mod init` | Compile fail "no go.mod" | `go mod init` đầu |
| Import path không khớp module | Compile fail | Đúng path |
| Commit `vendor/` không cần | Repo lớn | Chỉ vendor khi cần |
| Quên `go mod tidy` | go.mod thừa dep | Run trước commit |
| Major v2+ không suffix `/v2` | Import fail | Add suffix |
| `replace` to local commit | Reproduce fail elsewhere | Tránh commit replace local |
| Private repo proxy fail | "module not found" | Set `GOPRIVATE` |
| Old `GOPATH` workflow | Lạc hậu | Modern: modules |

## Pattern production

### CI/CD check

```yaml
- name: Verify modules
  run: |
    go mod download
    go mod verify
    go mod tidy
    git diff --exit-code go.mod go.sum
```

→ Đảm bảo `go.mod` clean trước merge.

### Multi-stage development

```bash
# Bug trong upstream X
git clone https://github.com/upstream/X /tmp/X
go mod edit -replace github.com/upstream/X=/tmp/X

# Fix + test local
# Khi xong → push fork + remove replace
go mod edit -dropreplace github.com/upstream/X
go get github.com/yourfork/X@latest
```

### Internal package proxy

Production lớn: chạy internal Go proxy (Athens, JFrog).
```bash
export GOPROXY=https://proxy.mycompany.com,https://proxy.golang.org,direct
```

→ Cache + audit + reproducible.

## Quick reference

```bash
# Init / dep
go mod init <path>
go get <pkg>
go get <pkg>@<version>
go get -u                    # update all
go mod tidy                  # cleanup
go mod download              # download to cache
go mod vendor                # vendor folder
go mod verify                # check integrity
go list -m all               # list deps

# Edit go.mod
go mod edit -require=pkg@v1.0.0
go mod edit -replace=foo=bar
go mod edit -dropreplace=foo
go mod edit -exclude=pkg@v1.0.0

# Workspace
go work init ./app ./lib
go work use ./newmod
go work sync

# Env
GOPRIVATE=github.com/mycompany/*
GOPROXY=https://proxy.golang.org,direct
GONOSUMCHECK=*       (insecure, dev only)

# Security
govulncheck ./...
```

## Tóm tắt bài 2

- Module = collection of packages với `go.mod` + version + path.
- `go mod init` cho mọi project mới.
- `go get pkg@version` thêm dep. `go mod tidy` cleanup.
- `go.sum` lock checksum — commit cùng `go.mod`.
- Semver: v1.x stable, v2+ phải có suffix `/v2` trong path.
- `replace` cho local dev. `exclude` cấm version có bug.
- Private repo: `GOPRIVATE` env var.
- Docker: copy `go.mod` riêng → cache deps layer.
- `govulncheck` scan CVE — phải có trong CI.
- Workspace mode (1.18+) cho multi-module dev.

**Bài kế tiếp** → [Phase 8 - Bài 1: Goroutines — Concurrency cơ bản](../phase-8-concurrency/01-goroutines.md)

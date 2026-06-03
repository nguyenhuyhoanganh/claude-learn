# Bài 1: E-Commerce REST API — Architecture & Project Setup

E-Commerce REST API là **project flagship** của khoá Joseph Arbour — production-grade, 60+ lessons trong section gốc. Phase 14 condense lại thành **6 bài deep-dive** vào architecture patterns. Bài này: kiến trúc tổng thể, project structure, Docker setup, Makefile, linter, config — toolkit khởi đầu mọi project Go production.

## Tổng quan project

Build REST API cho e-commerce backend:
- User registration / login (JWT)
- Product catalog (CRUD + image upload S3)
- Shopping cart
- Order processing
- Event-driven (AWS SQS) cho notification
- Email service (SMTP)
- Swagger documentation
- Docker compose + multi-binary deploy

```text
[Client (Web/Mobile)]
        │ HTTPS
        ▼
[Load Balancer]
        │
        ▼
[API Server (Go)]──────┬──────┬──────┐
   │                   │      │      │
   │  reads/writes     │      │      │ publishes events
   ▼                   ▼      ▼      ▼
[Postgres]      [Redis]  [S3]   [SQS]
                              │
                              ▼
                       [Email Worker (Go)]
                              │
                              ▼
                          [SMTP]
```

## Project structure — Layout chuẩn

```text
ecommerce/
├── cmd/
│   ├── api/main.go                 ← API server binary
│   └── worker/main.go              ← Email worker binary
├── internal/
│   ├── auth/                       ← JWT, password
│   │   ├── jwt.go
│   │   ├── password.go
│   │   └── middleware.go
│   ├── config/                     ← env config
│   │   └── config.go
│   ├── database/                   ← DB connection + migrations
│   │   ├── postgres.go
│   │   └── migrations/
│   ├── dto/                        ← request/response DTOs
│   │   ├── auth_dto.go
│   │   ├── product_dto.go
│   │   └── order_dto.go
│   ├── handlers/                   ← HTTP handlers
│   │   ├── auth_handler.go
│   │   ├── product_handler.go
│   │   └── ...
│   ├── models/                     ← domain entities
│   │   ├── user.go
│   │   ├── product.go
│   │   └── order.go
│   ├── repository/                 ← DB access layer
│   │   ├── user_repo.go
│   │   └── product_repo.go
│   ├── services/                   ← business logic
│   │   ├── auth_service.go
│   │   ├── product_service.go
│   │   └── order_service.go
│   ├── events/                     ← event publisher/subscriber
│   │   └── publisher.go
│   ├── email/                      ← email lib
│   │   └── sender.go
│   └── storage/                    ← S3 file upload
│       └── s3.go
├── pkg/                            ← shared utils (logger, errors)
│   └── logger/
├── docs/                           ← Swagger
│   └── swagger.yaml
├── migrations/                     ← SQL migrations
│   ├── 000001_init.up.sql
│   └── 000001_init.down.sql
├── docker-compose.yml
├── Dockerfile
├── Makefile
├── .golangci.yml
├── go.mod
└── go.sum
```

→ Pattern chuẩn Go community: `cmd/`, `internal/`, `pkg/`. Phase 1 đã giới thiệu — đây là instance đầy đủ.

## Layered architecture

```text
[Handler]   — Parse request, call service, return response
    │
    ▼
[Service]   — Business logic, validate, orchestrate
    │
    ▼
[Repository]— DB query, raw SQL
    │
    ▼
[Model]     — Domain entity
```

Quy tắc:
- Handler **không** truy cập DB trực tiếp.
- Service **không** biết HTTP.
- Repository **không** chứa business logic.
- Mỗi layer phụ thuộc interface, không concrete (DI).

→ Đổi DB Postgres → MySQL? Sửa Repository, không sửa Service/Handler.

## Makefile — Developer UX

```makefile
.PHONY: help build test lint run clean docker-up docker-down migrate

help:
	@echo "make build         - build binaries"
	@echo "make test          - run tests"
	@echo "make lint          - run linter"
	@echo "make run           - run API server"
	@echo "make migrate       - run DB migrations"
	@echo "make docker-up     - start docker compose"

build:
	@mkdir -p bin
	@go build -o bin/api ./cmd/api
	@go build -o bin/worker ./cmd/worker

test:
	@go test -race -cover ./...

lint:
	@golangci-lint run

run:
	@go run ./cmd/api

migrate:
	@migrate -database $(DB_URL) -path migrations up

docker-up:
	@docker-compose up -d

docker-down:
	@docker-compose down -v

clean:
	@rm -rf bin/
```

→ Standard commands. `make help` cho onboarding.

## golangci-lint

```yaml
# .golangci.yml
run:
  timeout: 5m
  tests: true

linters:
  enable:
    - errcheck       # check return error
    - govet          # standard vet
    - ineffassign    # unused assignment
    - staticcheck    # advanced static
    - unused         # unused code
    - gosimple       # simplification
    - gofmt
    - goimports
    - revive         # replacement for golint
    - gosec          # security
    - bodyclose      # http.Body.Close()
    - sqlclosecheck  # rows.Close()
    - errorlint      # %w errors

issues:
  exclude-rules:
    - path: _test\.go
      linters:
        - errcheck
```

Run:
```bash
golangci-lint run
```

→ Catch 100+ classes of bug. Production phải có trong CI.

## Config — 12-factor app

```go
package config

import (
    "github.com/caarlos0/env/v10"
    _ "github.com/joho/godotenv/autoload"   // load .env
)

type Config struct {
    Env       string `env:"ENV" envDefault:"dev"`
    Port      int    `env:"PORT" envDefault:"8080"`
    
    DBHost     string `env:"DB_HOST" envDefault:"localhost"`
    DBPort     int    `env:"DB_PORT" envDefault:"5432"`
    DBUser     string `env:"DB_USER,required"`
    DBPassword string `env:"DB_PASSWORD,required"`
    DBName     string `env:"DB_NAME,required"`
    
    JWTSecret    string `env:"JWT_SECRET,required"`
    JWTLifetime  time.Duration `env:"JWT_LIFETIME" envDefault:"24h"`
    
    S3Bucket    string `env:"S3_BUCKET"`
    S3Region    string `env:"S3_REGION"`
    AWSKey      string `env:"AWS_KEY"`
    AWSSecret   string `env:"AWS_SECRET"`
    
    SMTPHost     string `env:"SMTP_HOST"`
    SMTPPort     int    `env:"SMTP_PORT"`
    SMTPUser     string `env:"SMTP_USER"`
    SMTPPassword string `env:"SMTP_PASSWORD"`
    
    SQSQueue string `env:"SQS_QUEUE"`
}

func Load() (*Config, error) {
    var cfg Config
    if err := env.Parse(&cfg); err != nil {
        return nil, fmt.Errorf("parse env: %w", err)
    }
    return &cfg, nil
}
```

```text
# .env (dev only — KHÔNG commit)
DB_USER=postgres
DB_PASSWORD=secret
DB_NAME=ecommerce
JWT_SECRET=super-secret-change-in-prod
```

→ 12-factor: config qua env, không hardcode. Default cho dev, required cho prod.

## Logger với slog (Go 1.21+)

```go
package logger

import (
    "log/slog"
    "os"
)

func New(env string) *slog.Logger {
    var handler slog.Handler
    if env == "prod" {
        handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelInfo,
        })
    } else {
        handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
            Level: slog.LevelDebug,
        })
    }
    return slog.New(handler)
}
```

Usage:
```go
log.Info("server started", "port", 8080, "env", "prod")
log.Error("db failed", "error", err, "retry", true)

// Structured: JSON output in prod
// {"time":"2026-06-03T10:23","level":"INFO","msg":"server started","port":8080}
```

## Docker compose dev

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: ecommerce
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s
  
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  
  localstack:
    image: localstack/localstack
    environment:
      SERVICES: s3,sqs
    ports: ["4566:4566"]
  
  mailhog:
    image: mailhog/mailhog
    ports: ["1025:1025", "8025:8025"]   # SMTP + Web UI

volumes:
  pgdata:
```

→ 1 command `docker-compose up` = full dev environment.

## Dockerfile multi-stage build

```dockerfile
FROM golang:1.24-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.Version=$VERSION" \
    -o /bin/api ./cmd/api

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /bin/api /app
ENTRYPOINT ["/app"]
```

→ Image final ~15MB. Static binary, alpine base.

## Multi-binary build

```makefile
build:
	@mkdir -p bin
	@for cmd in api worker; do \
		go build -o bin/$$cmd ./cmd/$$cmd; \
	done
```

Hoặc Dockerfile build cả 2:
```dockerfile
RUN go build -o /bin/api ./cmd/api
RUN go build -o /bin/worker ./cmd/worker
```

Compose riêng container cho mỗi binary:
```yaml
api:
  build: .
  entrypoint: /bin/api

worker:
  build: .
  entrypoint: /bin/worker
```

## Health check endpoint

```go
r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
    if err := db.PingContext(r.Context()); err != nil {
        w.WriteHeader(503)
        json.NewEncoder(w).Encode(map[string]string{"status": "db_down"})
        return
    }
    
    json.NewEncoder(w).Encode(map[string]string{
        "status":  "ok",
        "version": Version,
    })
})
```

→ K8s, load balancer, monitoring đều check `/health`.

## CI/CD pipeline outline

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.24' }
      
      - name: Lint
        uses: golangci/golangci-lint-action@v6
      
      - name: Test
        run: go test -race -coverprofile=coverage.out ./...
      
      - name: Coverage
        uses: codecov/codecov-action@v4
```

→ Lint + test + race + coverage. PR gate.

## Bẫy thường gặp setup

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Hardcode config | Khó deploy | env var + `.env` (dev) |
| Commit `.env` với secret | Lộ key | `.gitignore` `.env` |
| Đặt tất cả code trong main | Khó test | Layered + DI |
| Không có Makefile | Onboarding khó | `make help` |
| Không lint | Bug âm thầm | golangci-lint từ ngày 1 |
| Single binary multi-mode | Phức tạp | Multi-binary `cmd/` |
| Docker image lớn | Slow pull | Multi-stage + alpine |
| Không healthcheck | LB không biết | `/health` endpoint |

## Tóm tắt bài 1

- Project layout: `cmd/`, `internal/`, `pkg/`, `migrations/`, `docs/`.
- Layered architecture: Handler → Service → Repository → DB.
- DI qua interface giữa layer — testable.
- Makefile cho dev UX (`build`, `test`, `lint`, `run`).
- golangci-lint từ ngày đầu, fail CI nếu có warning.
- Config qua env (12-factor app). Lib `caarlos0/env`.
- Logger với `log/slog` (Go 1.21+), JSON cho prod.
- Docker compose dev: Postgres + Redis + LocalStack + MailHog.
- Multi-stage Dockerfile → image 15MB.
- Multi-binary build cho microservice.
- Health endpoint cho K8s/LB.

**Bài kế tiếp** → [Bài 2: JWT authentication + middleware](02-jwt-auth.md)

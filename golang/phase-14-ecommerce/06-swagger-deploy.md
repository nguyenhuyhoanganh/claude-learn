# Bài 6: Swagger docs + Production deploy + Observability

API không có docs = API không dùng được. Bài này dạy Swagger/OpenAPI auto-generated từ comment Go, Postman cho test thủ công, Docker production deploy, observability cơ bản (metrics, traces, logs) cho khi system chạy thật.

## Swagger với swag

```bash
go install github.com/swaggo/swag/cmd/swag@latest
go get github.com/swaggo/http-swagger/v2
go get github.com/swaggo/swag
```

## Annotation API

```go
// @title E-Commerce REST API
// @version 1.0
// @description Production-grade e-commerce backend
// @termsOfService http://swagger.io/terms/
// @contact.name API Support
// @contact.email support@mysite.com
// @license.name MIT
// @host api.mysite.com
// @BasePath /api
// @schemes https
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
func main() {
    // ...
}
```

Đặt ở `cmd/api/main.go` đầu file. `swag init` parse → generate `docs/`.

## Handler annotation

```go
// RegisterUser godoc
// @Summary Register new user
// @Description Create a new user account
// @Tags auth
// @Accept json
// @Produce json
// @Param request body dto.RegisterRequest true "Register request"
// @Success 201 {object} dto.UserResponse
// @Failure 400 {object} dto.ErrorResponse "Invalid input"
// @Failure 409 {object} dto.ErrorResponse "Email taken"
// @Router /auth/register [post]
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
    // ...
}

// GetProfile godoc
// @Summary Get current user profile
// @Tags user
// @Security BearerAuth
// @Produce json
// @Success 200 {object} dto.UserResponse
// @Failure 401 {object} dto.ErrorResponse
// @Router /me [get]
func (h *UserHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
    // ...
}

// ListProducts godoc
// @Summary List products
// @Tags product
// @Param page query int false "Page" default(1)
// @Param limit query int false "Items per page" default(20)
// @Param category query string false "Filter by category"
// @Success 200 {object} dto.ProductListResponse
// @Router /products [get]
func (h *ProductHandler) List(w http.ResponseWriter, r *http.Request) {
    // ...
}
```

## Generate + serve

```bash
swag init -g cmd/api/main.go -o docs
```

→ Sinh `docs/docs.go`, `docs/swagger.json`, `docs/swagger.yaml`.

Serve UI:
```go
import (
    _ "github.com/yourname/ecommerce/docs"   // import generated
    httpSwagger "github.com/swaggo/http-swagger/v2"
)

r.Get("/swagger/*", httpSwagger.Handler(
    httpSwagger.URL("/swagger/doc.json"),
))

r.Get("/swagger/doc.json", func(w http.ResponseWriter, r *http.Request) {
    http.ServeFile(w, r, "./docs/swagger.json")
})
```

→ Browse `http://localhost:8080/swagger/` → Swagger UI tương tác.

## Makefile target

```makefile
docs:
	@swag init -g cmd/api/main.go -o docs --parseDependency

dev-up: docs docker-up run

build: docs
	@go build -o bin/api ./cmd/api
```

→ Mỗi build re-generate docs.

## Postman collection

Postman cho test thủ công + share team:
```text
1. New Collection: E-Commerce API
2. Add Environment: dev (baseUrl=http://localhost:8080)
3. Add request:
   - Auth: Register, Login
   - User: Get profile, Update
   - Product: List, Get, Create (admin)
   - Cart: Get, Add item, Remove
   - Order: Create, List
4. Set Authorization: Bearer {{token}}
5. Add Test script lưu token:
   pm.environment.set("token", pm.response.json().token);
6. Export collection.json → commit vào /docs/postman/
```

Pattern: từng request có `Tests` tab lưu/verify variable → chain request (login → save token → use).

## Production Dockerfile final

```dockerfile
# syntax=docker/dockerfile:1.6
FROM golang:1.24-alpine AS builder

WORKDIR /src
RUN apk add --no-cache git

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/root/go go mod download

COPY . .

ARG VERSION=dev
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w -X main.Version=$VERSION -X main.BuildTime=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    -o /bin/api ./cmd/api

# Final stage
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /bin/api /bin/api
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/bin/api"]
```

Distroless:
- Image ~5MB.
- Non-root user.
- Không có shell → harder to compromise.

## Docker compose production

```yaml
services:
  api:
    image: ecommerce-api:latest
    restart: unless-stopped
    environment:
      - DB_HOST=postgres
      - DB_USER=app
      - DB_PASSWORD_FILE=/run/secrets/db_password
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
    secrets:
      - db_password
      - jwt_secret
    deploy:
      resources:
        limits: { cpus: '1', memory: 256M }
        reservations: { cpus: '0.5', memory: 128M }
      replicas: 3
    healthcheck:
      test: ["CMD", "/bin/api", "health"]
      interval: 30s
      timeout: 5s
      retries: 3

secrets:
  db_password:
    external: true
  jwt_secret:
    external: true
```

→ Secret qua Docker secret, không hardcode.

## Observability — Prometheus metrics

```bash
go get github.com/prometheus/client_golang/prometheus
go get github.com/prometheus/client_golang/prometheus/promhttp
```

```go
import "github.com/prometheus/client_golang/prometheus"
import "github.com/prometheus/client_golang/prometheus/promauto"

var (
    httpRequests = promauto.NewCounterVec(
        prometheus.CounterOpts{
            Name: "http_requests_total",
            Help: "Total HTTP requests",
        },
        []string{"method", "path", "status"},
    )
    
    httpDuration = promauto.NewHistogramVec(
        prometheus.HistogramOpts{
            Name: "http_request_duration_seconds",
            Help: "HTTP request duration",
            Buckets: prometheus.DefBuckets,
        },
        []string{"method", "path"},
    )
)

func MetricsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        
        rw := &statusRecorder{ResponseWriter: w, status: 200}
        next.ServeHTTP(rw, r)
        
        path := chi.RouteContext(r.Context()).RoutePattern()
        if path == "" { path = r.URL.Path }
        
        httpRequests.WithLabelValues(
            r.Method, path, strconv.Itoa(rw.status),
        ).Inc()
        
        httpDuration.WithLabelValues(r.Method, path).
            Observe(time.Since(start).Seconds())
    })
}

// Expose endpoint
r.Handle("/metrics", promhttp.Handler())
```

Prometheus scrape `/metrics` → Grafana dashboard.

## Tracing — OpenTelemetry

```bash
go get go.opentelemetry.io/otel
go get go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc
go get go.opentelemetry.io/otel/sdk/trace
```

```go
tp, _ := otelinit.SetupOTelSDK(ctx, "ecommerce-api", "1.0")
defer tp.Shutdown(ctx)

tracer := otel.Tracer("ecommerce-api")

func (s *orderService) Create(ctx context.Context, ...) (*Order, error) {
    ctx, span := tracer.Start(ctx, "OrderService.Create")
    defer span.End()
    
    span.SetAttributes(attribute.Int("user.id", userID))
    
    // ... 
    if err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, "create failed")
        return nil, err
    }
    
    span.SetAttributes(attribute.Int("order.id", order.ID))
    return order, nil
}
```

→ Jaeger UI hiển thị trace cross-service: HTTP → service → DB → SQS.

## Structured logging với slog

```go
log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
    Level: slog.LevelInfo,
    ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
        if a.Key == slog.TimeKey {
            a.Key = "@timestamp"
        }
        return a
    },
}))

log.Info("user registered",
    slog.Int("user_id", 42),
    slog.String("email", email),
    slog.String("request_id", reqID),
)
// {"@timestamp":"2026-06-03T10:23:11Z","level":"INFO","msg":"user registered","user_id":42,"email":"alice@x.com","request_id":"abc"}
```

→ Ship to ELK, Loki, Datadog.

## Request ID middleware

```go
func RequestIDMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        reqID := r.Header.Get("X-Request-ID")
        if reqID == "" {
            reqID = uuid.NewString()
        }
        
        ctx := context.WithValue(r.Context(), "request_id", reqID)
        w.Header().Set("X-Request-ID", reqID)
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

→ Correlate log + trace + frontend error.

## Deploy checklist

```text
[Pre-deploy]
✓ All tests pass (CI)
✓ Lint clean (golangci-lint)
✓ Vulnerability scan (govulncheck)
✓ Docker image build OK
✓ Image scan (trivy)
✓ Migration ready

[Config]
✓ Secrets in vault/secret manager (not env var)
✓ HTTPS only (HSTS header)
✓ CORS configured
✓ Rate limit on auth endpoint
✓ Body size limit
✓ Timeout (read/write/idle)

[Observability]
✓ Structured log JSON
✓ Metrics /metrics endpoint
✓ Tracing OpenTelemetry
✓ Health endpoint /health
✓ Readiness endpoint /ready
✓ Request ID middleware

[Resilience]
✓ Graceful shutdown (SIGTERM handler)
✓ Connection pool tuned
✓ Retry policy
✓ Circuit breaker (cho external API)
✓ DLQ cho queue

[Security]
✓ Non-root user trong container
✓ Distroless / minimal base image
✓ No secret in code/log
✓ Auth middleware on protected routes
✓ Input validation
✓ SQL parameterized
✓ Password bcrypt
✓ HTTPS only
```

## Bẫy production hay gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên migration trước deploy | App crash | CI run migration |
| Default config dev → prod | Secret leak | Env var + validate |
| Log password/PII | Compliance violation | Filter sensitive |
| No health check | LB stale | `/health` endpoint |
| Slow query no index | DB CPU 100% | Index + EXPLAIN ANALYZE |
| No connection pool tune | Connection exhausted | SetMax* |
| No graceful shutdown | Mất request | `srv.Shutdown(ctx)` |
| Wide-open CORS | CSRF surface | Whitelist origins |
| Log to stdout không structured | Hard search | JSON + ELK |
| No monitoring | Outage không biết | Prometheus + alerts |

## Roadmap nâng cao

```text
[Phase 1 — Current]
- Monolith binary
- Single Postgres
- Simple SQS
- Basic monitoring

[Phase 2 — Scale]
- Split: Auth, Catalog, Cart, Order services
- Service mesh (Istio/Linkerd)
- Distributed tracing
- Multi-region read replica
- CDN

[Phase 3 — Resilience]
- Circuit breaker
- Rate limiter Redis
- Caching layer
- Database sharding
- Event sourcing

[Phase 4 — Optimization]
- gRPC inter-service
- GraphQL gateway
- Protobuf
- Read model (CQRS)
```

→ E-commerce thực tế phát triển dần qua nhiều giai đoạn. Đừng over-engineer Phase 1.

## Tóm tắt bài 6

- Swagger auto-gen từ comment Go với `swag` — Swagger UI tương tác.
- Postman collection cho test thủ công + chain request.
- Production Dockerfile: multi-stage, distroless, non-root, ~5MB.
- Docker secret thay env var cho prod.
- Observability 3 trụ: **metrics** (Prometheus), **traces** (OpenTelemetry), **logs** (slog JSON).
- Request ID middleware → correlate log + trace.
- Health + Readiness endpoint cho K8s/LB.
- Deploy checklist: tests, secrets, observability, security.
- Roadmap nâng cao: monolith → microservice → resilience → optimization.

🎉 **Hoàn thành Phase 14** — E-Commerce REST API production-ready blueprint.

**Bài kế tiếp** → [Phase 15 - Bài 1: GraphQL với gqlgen](../phase-15-graphql-mcp/01-graphql.md)

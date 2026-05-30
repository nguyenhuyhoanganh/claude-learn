# Bài 1: Docker deep-dive — Dockerfile production-grade

Phase 10 giới thiệu Docker. Bài này viết Dockerfile **production-grade**: nhỏ, an toàn, build nhanh, cache hiệu quả.

## Dockerfile anatomy

```dockerfile
# Comment
FROM ubuntu:22.04                    # Base image (mandatory đầu tiên)

LABEL maintainer="me@acme.com"       # Metadata

ARG VERSION=1.0                      # Build-time variable

ENV PATH="/app/bin:${PATH}"          # Run-time env

WORKDIR /app                         # cd /app

COPY requirements.txt .              # Host → container
ADD https://example.com/file.tar.gz /tmp/   # ADD = COPY + URL + auto-extract

RUN pip install -r requirements.txt && \
    rm -rf ~/.cache                  # Each RUN = new layer

USER 1000                            # Drop root (security)

EXPOSE 8000                          # Document port (not actually publish)

HEALTHCHECK --interval=30s --timeout=3s \
    CMD curl -f http://localhost:8000/health || exit 1

VOLUME ["/data"]                     # Mount point

CMD ["python", "app.py"]              # Default command
```

## 5 best practices

### 1. Multi-stage build — image nhỏ

❌ Single stage:

```dockerfile
FROM golang:1.22
WORKDIR /src
COPY . .
RUN go build -o app
CMD ["./app"]
```

Image ~1 GB (chứa Go compiler).

✓ Multi-stage:

```dockerfile
# Build stage
FROM golang:1.22 AS builder
WORKDIR /src
COPY go.* ./
RUN go mod download                    # Cache deps separate
COPY . .
RUN CGO_ENABLED=0 go build -o /app

# Runtime stage
FROM gcr.io/distroless/static-debian12
COPY --from=builder /app /app
USER 65532:65532
ENTRYPOINT ["/app"]
```

Image ~10 MB. Production-ready.

### 2. Order layer cho cache

Docker cache layer top-down. Order: **ít đổi → nhiều đổi**.

❌:

```dockerfile
COPY . .                              # Copy code (đổi mỗi commit)
RUN pip install -r requirements.txt   # Re-install mỗi commit
```

✓:

```dockerfile
COPY requirements.txt .               # Đổi ít
RUN pip install -r requirements.txt   # Cache hit nếu req không đổi
COPY . .                              # Đổi mỗi commit
```

Build time: 10x faster.

### 3. Combine RUN, cleanup cache

❌ — 5 layer + cache lớn:

```dockerfile
RUN apt update
RUN apt install -y curl
RUN apt install -y nginx
RUN apt clean
```

✓ — 1 layer, cleanup:

```dockerfile
RUN apt update && \
    apt install -y --no-install-recommends \
        curl \
        nginx && \
    apt clean && \
    rm -rf /var/lib/apt/lists/*
```

`--no-install-recommends`: chỉ cài hard deps, không recommended packages.

### 4. Non-root user

```dockerfile
RUN useradd -r -u 1001 -g 0 appuser
USER 1001
```

Hoặc distroless image — không có shell, không có root.

Container compromise → attacker chỉ có quyền non-root, không escalate được.

### 5. .dockerignore

`.dockerignore`:

```text
.git
.gitignore
.github/
node_modules
.env
*.log
Dockerfile.dev
docker-compose.yml
README.md
docs/
tests/
.vscode/
.idea/
```

Tránh copy file rác vào image. Build nhanh hơn (Docker context nhỏ).

## CMD vs ENTRYPOINT

```dockerfile
# Pattern 1: ENTRYPOINT cố định + CMD args mặc định
ENTRYPOINT ["python", "app.py"]
CMD ["--port=8000"]

# docker run image          → python app.py --port=8000
# docker run image --port=9000  → python app.py --port=9000

# Pattern 2: CMD chứa command đầy đủ
CMD ["python", "app.py", "--port=8000"]

# docker run image          → python app.py --port=8000
# docker run image sh       → sh (override CMD)

# Pattern 3: Shell form (avoid)
CMD python app.py           # → /bin/sh -c "python app.py"
```

**Recommend**: dùng `exec form` (JSON array) — handle signal đúng.

```dockerfile
# Exec form (recommend) — SIGTERM reaches app
CMD ["python", "app.py"]

# Shell form (avoid) — SIGTERM goes to sh, not app
CMD python app.py
```

## ARG vs ENV

| | ARG | ENV |
|---|---|---|
| Available at build time | ✓ | ✓ |
| Available at runtime | ✗ | ✓ |
| Set via | `--build-arg` | `-e` hoặc `Dockerfile ENV` |

```dockerfile
ARG VERSION=1.0
ARG BUILD_DATE

ENV APP_VERSION=$VERSION
ENV PORT=8000

RUN echo "Building $VERSION on $BUILD_DATE"
```

```bash
docker build --build-arg VERSION=1.2 --build-arg BUILD_DATE=$(date) -t app .
```

## Volume — persistent data

```dockerfile
VOLUME ["/data"]
```

`VOLUME` declare mount point. Tự create anonymous volume khi run.

Better: control bên ngoài:

```bash
# Named volume
docker run -v mydata:/data app

# Bind mount
docker run -v $(pwd)/data:/data app
```

## Healthcheck

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1
```

Docker engine check periodically. Status: `healthy` / `unhealthy` / `starting`.

K8s sẽ override với liveness/readiness probe.

## Production Dockerfile vProfile

```dockerfile
# Stage 1: Build .war
FROM maven:3.9-eclipse-temurin-17-alpine AS builder
WORKDIR /build

# Cache deps
COPY pom.xml .
RUN mvn dependency:go-offline -B

# Build
COPY src ./src
RUN mvn package -DskipTests -B

# Stage 2: Runtime — Tomcat
FROM tomcat:10.1-jdk17-temurin-jammy

# Remove default apps
RUN rm -rf /usr/local/tomcat/webapps/*

# Copy WAR as ROOT (context /)
COPY --from=builder /build/target/vprofile-v2.war /usr/local/tomcat/webapps/ROOT.war

# Non-root
RUN groupadd -r tomcat && useradd -r -g tomcat tomcat && \
    chown -R tomcat:tomcat /usr/local/tomcat
USER tomcat

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s \
    CMD curl -f http://localhost:8080/ || exit 1

CMD ["catalina.sh", "run"]
```

Build:

```bash
docker build -t vprofile:v1.0 .
docker run -d -p 8080:8080 --name app vprofile:v1.0

# Verify
curl http://localhost:8080
```

Image ~250 MB. Production-ready.

## BuildKit — modern builder

Default từ Docker 23+. Faster, parallel build, better cache:

```bash
# Enable globally
export DOCKER_BUILDKIT=1

# Or use buildx
docker buildx build .

# Multi-platform
docker buildx build --platform linux/amd64,linux/arm64 -t app:v1 --push .
```

### Cache mount

```dockerfile
# syntax=docker/dockerfile:1.6

FROM golang:1.22
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -o /app
```

Cache persist across build = nhanh nhiều lần.

### Secret mount

```dockerfile
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm install
```

```bash
docker build --secret id=npmrc,src=$HOME/.npmrc .
```

Secret không bao giờ commit vào image layer.

## Image scanning

```bash
# Docker Scout (built-in)
docker scout cves vprofile:v1.0

# Trivy
trivy image vprofile:v1.0

# Grype
grype vprofile:v1.0
```

Tích hợp CI:

```yaml
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: vprofile:${{ github.sha }}
    severity: 'CRITICAL,HIGH'
    exit-code: '1'        # Fail build if critical found
```

## Push lên registry

```bash
# Tag
docker tag vprofile:v1.0 ghcr.io/acme/vprofile:v1.0
docker tag vprofile:v1.0 ghcr.io/acme/vprofile:latest

# Login
docker login ghcr.io -u USERNAME -p $GITHUB_TOKEN

# Push
docker push ghcr.io/acme/vprofile:v1.0
docker push ghcr.io/acme/vprofile:latest
```

## Image tag strategy

| Tag | When |
|---|---|
| `latest` | Mới nhất stable (avoid for prod) |
| `v1.2.3` | Semantic version |
| `main` | Latest main branch |
| `sha-abc1234` | Specific commit |
| `nightly` | Daily build |

Production: dùng commit SHA hoặc version cụ thể. **Tránh `latest`** — không reproducible.

## Distroless — Google's tiny images

```dockerfile
FROM gcr.io/distroless/java17-debian12
COPY --from=builder /app/app.jar /app.jar
USER 65532:65532
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

Distroless = chỉ runtime + lib. **No shell, no package manager, no anything**. Tối ưu security + size.

Variants: java, python, nodejs, static (Go binary).

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `apt install` không clean | Image phình | `rm -rf /var/lib/apt/lists/*` |
| Copy `.git`, `node_modules` | Image lớn | `.dockerignore` |
| Run as root | Security risk | `USER 1000` |
| `latest` tag mọi nơi | Bug khó reproduce | Pin SHA/version |
| Single-stage with build tools | Image MB | Multi-stage |
| Order layer sai | Cache miss | Deps trước code |
| Quên healthcheck | Orchestrator không biết status | Add HEALTHCHECK |
| Hardcode secret | Lộ | BuildKit secret mount hoặc env runtime |
| Shell form CMD | Signal không reach app | Exec form JSON array |

## Tóm tắt bài 1

- **Multi-stage build** — image nhỏ 10-100x.
- Order layer **ít đổi → nhiều đổi** cho cache hiệu quả.
- **`--no-install-recommends` + cleanup** trong cùng RUN.
- **Non-root user** mandatory.
- **`.dockerignore`** tránh copy rác.
- **Exec form** `CMD ["python", "app.py"]` cho signal handling.
- **HEALTHCHECK** + status visible.
- **BuildKit** với cache mount + secret mount.
- **Distroless** = security + size tối ưu.
- **Scan image** mọi build với Trivy/Scout.
- Tag với SHA/version, **không `latest`** cho prod.

**Bài kế tiếp** → [Bài 2: Docker Compose và networking nâng cao](../phase-28-containerization/01-containerization.md)

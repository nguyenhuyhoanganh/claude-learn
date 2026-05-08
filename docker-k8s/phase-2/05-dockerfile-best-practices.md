# Bài 5: Dockerfile Best Practices & Patterns

## Cấu trúc Dockerfile chuẩn

```dockerfile
# 1. Base image — cụ thể version
FROM node:18.17.0-alpine3.18

# 2. Metadata (optional)
LABEL maintainer="your@email.com"

# 3. Working directory
WORKDIR /app

# 4. Dependencies trước (tận dụng cache)
COPY package*.json ./
RUN npm ci --only=production

# 5. Source code sau
COPY . .

# 6. Build step (nếu cần)
RUN npm run build

# 7. Expose port (documentation)
EXPOSE 3000

# 8. Chạy ứng dụng
CMD ["node", "server.js"]
```

---

## FROM — Chọn Base Image đúng

### Tránh dùng `latest`

```dockerfile
# ❌ Bad — không predictable
FROM node:latest
FROM ubuntu:latest

# ✅ Good — reproducible build
FROM node:18.17.0
FROM node:18-alpine
```

### Ưu tiên Alpine cho production

| Base | Kích thước | Khi nào dùng |
|---|---|---|
| `node:18` | ~1GB | Dev, cần nhiều tools |
| `node:18-slim` | ~200MB | Production, muốn nhỏ hơn |
| `node:18-alpine` | ~50MB | Production, nhỏ nhất |

Alpine dùng `apk` thay vì `apt-get`:
```dockerfile
FROM node:18-alpine
RUN apk add --no-cache curl
```

### Multi-stage: kết hợp nhiều FROM

Dùng một image đầy đủ để build, sau đó copy sang image nhỏ để chạy:

```dockerfile
# Stage 1: Build
FROM node:18 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # Compile TypeScript, build React, etc.

# Stage 2: Production (chỉ copy artifacts)
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

→ Image cuối cùng chỉ có compiled code, không có source TypeScript, devDependencies...

---

## COPY vs ADD

```dockerfile
# COPY: đơn giản, chỉ copy files/dirs từ host
COPY ./src /app/src
COPY package.json .

# ADD: như COPY nhưng thêm features
# - Tự động extract .tar.gz
# - Hỗ trợ URL (không nên dùng!)
ADD archive.tar.gz /app/    # tự extract
```

**Quy tắc:** Luôn dùng `COPY` trừ khi cần extract tar file. `ADD` với URL là anti-pattern.

---

## RUN — Tối ưu số layers

```dockerfile
# ❌ Nhiều layers, nhiều lần cache
RUN apt-get update
RUN apt-get install -y curl
RUN apt-get install -y wget
RUN rm -rf /var/lib/apt/lists/*

# ✅ Một layer, gộp && để giảm size
RUN apt-get update && \
    apt-get install -y curl wget && \
    rm -rf /var/lib/apt/lists/*
```

### Xóa cache sau khi install

```dockerfile
# Alpine
RUN apk add --no-cache curl wget

# Debian/Ubuntu
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl wget && \
    rm -rf /var/lib/apt/lists/*
```

---

## CMD vs ENTRYPOINT

Cả hai đều chỉ định lệnh chạy khi container start.

### CMD — có thể override

```dockerfile
CMD ["node", "server.js"]
```

```bash
# Override CMD khi run
docker run myapp                    # chạy: node server.js
docker run myapp node other.js      # chạy: node other.js
docker run myapp /bin/sh            # mở shell
```

### ENTRYPOINT — không thể override dễ dàng

```dockerfile
ENTRYPOINT ["node"]
CMD ["server.js"]    # default argument cho ENTRYPOINT
```

```bash
docker run myapp              # chạy: node server.js
docker run myapp other.js     # chạy: node other.js
docker run myapp --version    # chạy: node --version
```

### Kết hợp ENTRYPOINT + CMD

```dockerfile
# Ví dụ: image cho tool command line
ENTRYPOINT ["npm"]
CMD ["start"]

# docker run → npm start
# docker run run test → npm run test
# docker run install → npm install
```

**Quy tắc:**
- Dùng `CMD` cho web servers và long-running processes → linh hoạt
- Dùng `ENTRYPOINT` khi image là wrapper cho một command cụ thể

---

## ENV — Biến môi trường

```dockerfile
# Khai báo default value
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_HOST=localhost

# Trong code Node.js
# process.env.NODE_ENV → "production"
# process.env.PORT → "3000"
```

```bash
# Override khi run container
docker run -e NODE_ENV=development -e PORT=8080 myapp

# Hoặc load từ file .env
docker run --env-file .env myapp
```

> **Không bao giờ** để secrets (password, API keys) trong Dockerfile ENV — vì chúng sẽ bị lưu vào image history. Dùng runtime `-e` hoặc Docker Secrets.

---

## ARG — Build Arguments

Khác với `ENV`, `ARG` chỉ tồn tại lúc **build**, không có trong container runtime.

```dockerfile
ARG NODE_VERSION=18
FROM node:${NODE_VERSION}-alpine

ARG APP_VERSION=1.0
LABEL version=${APP_VERSION}
```

```bash
# Override ARG khi build
docker build --build-arg NODE_VERSION=20 -t myapp .
docker build --build-arg APP_VERSION=2.0 -t myapp .
```

---

## .dockerignore — Giảm build context

Tương tự `.gitignore`, file `.dockerignore` loại bỏ files/dirs không cần thiết khi build.

```
# .dockerignore
node_modules/       # Dependencies (sẽ được install trong container)
.git/               # Git history
.env                # Secrets
*.log               # Log files
dist/               # Build artifacts (nếu build trong container)
.DS_Store           # macOS metadata
README.md
tests/
coverage/
```

**Tại sao quan trọng?**

```bash
# Build context = tất cả files gửi đến Docker daemon
# Nếu có node_modules (1GB+), build sẽ rất chậm
# .dockerignore loại bỏ chúng → build nhanh hơn nhiều
```

---

## Security Best Practices

### Không chạy với root user

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm ci

# Tạo user non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Switch sang user đó
USER appuser

CMD ["node", "server.js"]
```

### Dùng npm ci thay npm install

```dockerfile
# npm install: có thể update packages (không deterministic)
RUN npm install

# npm ci: cài ĐÚNG version trong package-lock.json (reproducible)
RUN npm ci --only=production
```

---

## HEALTHCHECK — Kiểm tra Container health

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1
```

```bash
docker ps
# STATUS: Up 5 minutes (healthy)   ← Container healthy
# STATUS: Up 5 minutes (unhealthy) ← Container unhealthy
```

---

## Template Dockerfile đầy đủ cho Node.js

```dockerfile
FROM node:18-alpine AS base
WORKDIR /app

# Dependencies layer (cached khi package.json không đổi)
FROM base AS deps
COPY package*.json ./
RUN npm ci --only=production

# Build layer (nếu có TypeScript hay build step)
FROM base AS builder
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production image
FROM base AS production
ENV NODE_ENV=production

# Copy chỉ production deps và build output
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q -O /dev/null http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]
```

---

## Tóm tắt Best Practices

| Practice | Tại sao |
|---|---|
| Dùng tag cụ thể (không `latest`) | Reproducible builds |
| Dùng Alpine khi có thể | Image nhỏ hơn nhiều |
| COPY package.json trước, RUN install, rồi COPY code | Tận dụng cache |
| Gộp RUN commands với `&&` | Giảm số layers |
| Dùng `.dockerignore` | Build nhanh, tránh leak secrets |
| Không để secrets trong ENV | Bảo mật |
| Chạy với non-root user | Bảo mật |
| Thêm HEALTHCHECK | Orchestrator biết container có healthy không |
| Dùng multi-stage build | Image production nhỏ gọn |

---

**Tiếp theo:** Phase 3 — Quản lý Data & Volumes trong Docker →

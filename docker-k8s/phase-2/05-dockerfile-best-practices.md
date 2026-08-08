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

### Dạng mảng và dạng chuỗi — khác biệt gây mất dữ liệu

Cả `CMD` lẫn `ENTRYPOINT` viết được theo hai dạng, và chúng **không tương đương**:

```dockerfile
CMD ["node", "server.js"]      # dạng exec (mảng)   ← LUÔN DÙNG DẠNG NÀY
CMD node server.js             # dạng shell (chuỗi)
```

Khác biệt nằm ở chỗ **tiến trình nào trở thành PID 1** trong container:

```text
   DẠNG EXEC — CMD ["node", "server.js"]
   ═════════════════════════════════════
   PID 1 = node
   docker stop → SIGTERM gửi tới PID 1 = node
   → Node nhận được tín hiệu, đóng kết nối, ghi nốt dữ liệu, thoát sạch ✓


   DẠNG SHELL — CMD node server.js
   ═══════════════════════════════
   Docker biến nó thành:  /bin/sh -c "node server.js"

   PID 1 = /bin/sh
     └── PID 7 = node

   docker stop → SIGTERM gửi tới PID 1 = /bin/sh
   → sh KHÔNG chuyển tín hiệu cho tiến trình con
   → node KHÔNG BIẾT GÌ, vẫn chạy
   → sau 10 giây, Docker gửi SIGKILL giết cứng ✗
```

Hậu quả thực tế của dạng shell:

| Hậu quả | Ví dụ |
|---|---|
| Mất dữ liệu chưa ghi | Bộ đệm ghi log, transaction dở dang |
| Request đang xử lý bị cắt giữa chừng | Người dùng nhận lỗi khi bạn deploy |
| Mỗi lần `docker stop` mất đúng 10 giây | Vì luôn phải chờ hết hạn rồi mới `SIGKILL` |
| Kết nối database không đóng sạch | Để lại kết nối treo ở phía server |

Kiểm chứng bằng thời gian dừng:

```bash
# Dạng shell
time docker stop container-dang-shell
```

```text
real    0m10.3s      ← phải chờ hết hạn 10 giây
```

```bash
# Dạng exec
time docker stop container-dang-exec
```

```text
real    0m0.4s       ← thoát ngay khi nhận tín hiệu
```

> **Quy tắc**: **luôn dùng dạng mảng** cho `CMD` và `ENTRYPOINT`. Nếu thật sự cần tính năng của shell (biến môi trường, ống lệnh), viết tường minh: `CMD ["sh", "-c", "exec node server.js"]` — chú ý từ khoá `exec` để `node` **thay thế** tiến trình `sh` và trở thành PID 1.

### Khi ứng dụng sinh tiến trình con: cần init

Nếu ứng dụng của bạn tự sinh tiến trình con (worker, trình duyệt không giao diện), PID 1 phải biết dọn **tiến trình mồ côi** — việc mà ứng dụng thường không làm:

```bash
docker run --init myapp
```

```dockerfile
# Hoặc nhúng tini vào image
RUN apk add --no-cache tini
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
```

Không có nó, container tích tụ dần tiến trình "xác sống" (zombie) cho tới khi hết bảng tiến trình.

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

```text
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
| Dùng dạng mảng cho CMD/ENTRYPOINT | Ứng dụng nhận được tín hiệu dừng, thoát sạch |

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| `CMD node server.js` (dạng chuỗi) | Ứng dụng **không nhận được `SIGTERM`**, bị giết cứng sau 10 giây, mất dữ liệu chưa ghi | `CMD ["node", "server.js"]` |
| `RUN apt install` và `RUN rm` ở **hai lệnh riêng** | Image **không nhỏ đi** — xem [bài 2](02-image-layers-va-caching.md) | Gộp bằng `&&` |
| Đặt `ENV` hay đổi lên đầu Dockerfile | Đổi biến là **mất cache toàn bộ** phía sau | Đặt xuống thấp nhất có thể |
| Truyền bí mật qua `ARG` | `docker history` **đọc lại được** giá trị `ARG` | Dùng BuildKit secret mount |
| Truyền bí mật qua `ENV` | Nằm luôn trong image, và mọi tiến trình con đều thấy | Truyền lúc chạy, hoặc dùng Secret |
| Quên `USER` — chạy bằng root | Thoát container là chiếm quyền máy chủ | `USER node` hoặc tạo user riêng |
| `COPY . .` mà không có `.dockerignore` | `node_modules`, `.git`, `.env` vào thẳng image | Luôn có `.dockerignore` |
| Dùng `ADD` thay `COPY` cho file thường | `ADD` tự giải nén và tải URL — hành vi bất ngờ | Dùng `COPY`, chỉ dùng `ADD` khi cần giải nén |
| `HEALTHCHECK` gọi vào phụ thuộc bên ngoài | Database chậm → container bị đánh dấu hỏng oan | Chỉ kiểm tra chính tiến trình đó |
| `npm install` ở production | Có thể cài phiên bản khác `package-lock.json` | `npm ci --omit=dev` |
| Ứng dụng sinh tiến trình con mà không có init | Tích tụ tiến trình xác sống | `docker run --init` hoặc nhúng `tini` |
| Build một image dùng chung cho cả dev và production | Image production mang theo công cụ dev | Multi-stage build |

---

## Tóm tắt bài 5

- Thứ tự Dockerfile quyết định tốc độ build: **ít đổi lên trên, hay đổi xuống dưới**.
- **`FROM` phải ghim phiên bản cụ thể**, không dùng `latest` — xem [bài 4](04-naming-tagging-va-chia-se-images.md).
- **Gộp `RUN` bằng `&&`** vì lớp chỉ cộng thêm, không trừ đi. Xoá ở lệnh sau không làm image nhỏ lại.
- **`CMD`/`ENTRYPOINT` phải viết dạng mảng.** Dạng chuỗi làm `/bin/sh` thành PID 1, ứng dụng **không nhận được `SIGTERM`** và bị giết cứng sau 10 giây — mất dữ liệu chưa ghi và cắt request đang xử lý.
- Cần tính năng shell thì viết `CMD ["sh", "-c", "exec node server.js"]` — từ khoá **`exec`** để ứng dụng thay thế `sh` và trở thành PID 1.
- Ứng dụng sinh tiến trình con thì cần **`--init`** hoặc **`tini`**, nếu không sẽ tích tụ tiến trình xác sống.
- **`ARG` và `ENV` đều không giữ được bí mật** — `docker history` đọc ra được. Dùng BuildKit secret mount.
- **Multi-stage build** cho image production nhỏ và không mang theo công cụ build.
- **`.dockerignore` và `USER` non-root** là hai dòng rẻ nhất mà hiệu quả bảo mật cao nhất.

---

**Phase kế tiếp** → [Bài 1: Data trong Docker — Ba loại và vấn đề cần giải quyết](../phase-3/01-data-trong-docker.md)

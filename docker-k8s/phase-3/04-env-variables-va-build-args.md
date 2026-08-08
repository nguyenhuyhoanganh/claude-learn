# Bài 4: Environment Variables & Build Arguments

## Environment Variables trong Docker

Environment variables (biến môi trường) cho phép cấu hình ứng dụng mà **không cần thay đổi code hay rebuild image**.

### Khai báo trong Dockerfile

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install

# Khai báo với giá trị mặc định
ENV PORT=80
ENV NODE_ENV=production

EXPOSE $PORT     # Dùng variable trong Dockerfile

CMD ["node", "server.js"]
```

Trong code ứng dụng:
```javascript
// Node.js
const port = process.env.PORT || 80;
const env = process.env.NODE_ENV;

app.listen(port, () => {
  console.log(`Running on port ${port} in ${env} mode`);
});
```

---

## Override ENV khi run container

```bash
# Override một biến
docker run -e PORT=3000 myapp

# Override nhiều biến
docker run -e PORT=3000 -e NODE_ENV=development myapp

# Kết hợp với port mapping
docker run -p 3000:3000 -e PORT=3000 myapp
```

---

## Dùng file .env

Thay vì gõ nhiều `-e` flags, tạo file `.env`:

```bash
# .env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PASSWORD=mypassword
```

```bash
# Load toàn bộ file .env
docker run --env-file .env myapp
```

### Bảo mật: .env trong .dockerignore

**Không bao giờ COPY .env vào image:**

```dockerfile
# ❌ NGUY HIỂM — secrets bị baked vào image!
COPY . .    # Copy cả .env

# ✅ Dùng .dockerignore
```

```bash
# .dockerignore
.env
*.env
.env.local
secrets/
```

Truyền env vars tại **runtime** (khi run), không phải build time.

---

## Bảng phân biệt: ENV trong Dockerfile vs runtime

| | Dockerfile ENV | -e flag / --env-file |
|---|---|---|
| Khi nào set | Build time | Run time |
| Có trong image | Có (default values) | Không |
| Override được | Có (qua -e) | Không áp dụng |
| Phù hợp cho | Default values | Production secrets |

---

## Build Arguments (ARG)

`ARG` khác `ENV` ở chỗ chỉ tồn tại **lúc build**, không có trong container runtime.

```dockerfile
# Khai báo ARG với default value
ARG NODE_VERSION=18
ARG APP_VERSION=1.0.0

FROM node:${NODE_VERSION}-alpine

# ARG chỉ có hiệu lực trong layer khai báo nó
# Nếu cần dùng sau FROM, phải khai báo lại
ARG APP_VERSION=1.0.0

WORKDIR /app
COPY . .
RUN npm install

# Gán ARG vào LABEL (metadata) hoặc dùng trong RUN
LABEL version=${APP_VERSION}
RUN echo "Building version ${APP_VERSION}"

CMD ["node", "server.js"]
```

### Override ARG khi build

```bash
# Dùng giá trị mặc định
docker build -t myapp .

# Override
docker build --build-arg NODE_VERSION=20 -t myapp .
docker build --build-arg APP_VERSION=2.0.0 -t myapp .
docker build \
  --build-arg NODE_VERSION=20 \
  --build-arg APP_VERSION=2.0.0 \
  -t myapp:2.0.0 .
```

---

## ARG vs ENV — Khi nào dùng cái nào?

| | ARG | ENV |
|---|---|---|
| Tồn tại | Build time only | Build time + Runtime |
| Trong container | Không | Có |
| Dùng để | Tham số hóa Dockerfile (version, config lúc build) | Cấu hình app lúc chạy |
| Override | `--build-arg` khi build | `-e` khi run |
| Bảo mật | Tốt hơn ENV | Có thể inspect qua `docker image inspect` |

```dockerfile
# ARG: dùng để chọn version base image
ARG NODE_VERSION=18
FROM node:${NODE_VERSION}-alpine

# ENV: dùng cho config runtime của app
ENV PORT=3000
ENV NODE_ENV=production
```

---

## Kết hợp ARG và ENV

Chuyển ARG thành ENV để dùng cả lúc build lẫn runtime:

```dockerfile
ARG DEFAULT_PORT=80

# Set ENV từ ARG
ENV PORT=${DEFAULT_PORT}

EXPOSE ${PORT}
```

```bash
# Build với port khác
docker build --build-arg DEFAULT_PORT=3000 -t myapp .

# ENV PORT=3000 sẽ có sẵn khi container chạy
docker run myapp   # PORT=3000
```

---

## Best Practices

### 1. Không đưa secrets vào Dockerfile ENV

```dockerfile
# ❌ Bad — DB password lộ trong image history
ENV DB_PASSWORD=mysecretpassword

# ✅ Good — truyền lúc runtime
# docker run -e DB_PASSWORD=mysecretpassword myapp
```

### 2. Dùng .env cho development, secrets manager cho production

```bash
# Development
docker run --env-file .env.development myapp

# Production (AWS Secrets Manager, HashiCorp Vault, Kubernetes Secrets...)
# Secrets được inject bởi orchestration platform
```

### 3. ARG cho build-time config, ENV cho runtime config

```dockerfile
# Version của dependencies → ARG (build-time)
ARG PYTHON_VERSION=3.11

# Config app → ENV (runtime)
ENV MAX_UPLOAD_SIZE=10mb
ENV LOG_LEVEL=info
```

---

## Ví dụ hoàn chỉnh: Node.js với ENV và ARG

```dockerfile
ARG NODE_VERSION=18
FROM node:${NODE_VERSION}-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# Default environment variables
ENV PORT=80
ENV NODE_ENV=production
ENV LOG_LEVEL=info

EXPOSE ${PORT}

CMD ["node", "server.js"]
```

```bash
# Build
docker build \
  --build-arg NODE_VERSION=20 \
  -t myapp:1.0 .

# Development run
docker run -d \
  -p 3000:80 \
  --env-file .env.development \
  --name myapp-dev \
  myapp:1.0

# Production run
docker run -d \
  -p 80:80 \
  -e NODE_ENV=production \
  -e LOG_LEVEL=warn \
  -e DB_URL=postgres://prod-server/mydb \
  --name myapp-prod \
  myapp:1.0
```

---

## Tóm tắt

```text
ENV (Runtime Variables):
├── Khai báo trong Dockerfile với default value
├── Override bằng: docker run -e KEY=VALUE
├── Load từ file: docker run --env-file .env
└── Tránh để secrets trong Dockerfile → dùng runtime -e

ARG (Build-time Variables):
├── Khai báo: ARG NAME=default
├── Override bằng: docker build --build-arg NAME=value
├── KHÔNG có trong container runtime
└── Dùng cho: version selection, build config

.env file:
├── Liệt kê KEY=VALUE một dòng một biến
├── Truyền vào: docker run --env-file .env
└── PHẢI thêm vào .dockerignore (không copy vào image)
```

---

## `ARG` không giữ được bí mật — xem tận mắt

Nhiều người tưởng `ARG` an toàn hơn `ENV` vì nó "chỉ tồn tại lúc build". Sự thật là **cả hai đều lộ**, chỉ khác chỗ lộ.

```dockerfile
FROM alpine
ARG NPM_TOKEN
RUN echo "dang dung token: $NPM_TOKEN" > /tmp/log.txt
```

```bash
docker build --build-arg NPM_TOKEN=npm_sieubimat123 -t thu-nghiem .
docker history --no-trunc thu-nghiem | grep -i token
```

```text
|1 NPM_TOKEN=npm_sieubimat123 /bin/sh -c echo "dang dung token: ..."
              ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲
     TOKEN NẰM NGUYÊN VĂN trong lịch sử image
     Ai pull được image này đều đọc được
```

Với `ENV` thì còn tệ hơn — giá trị nằm luôn trong siêu dữ liệu image và **mọi tiến trình trong container đều thấy**:

```bash
docker inspect thu-nghiem --format '{{json .Config.Env}}'
```

Ba cách làm đúng, theo thứ tự ưu tiên:

| Cách | Khi nào | Bí mật có vào image không |
|---|---|---|
| **BuildKit secret mount** | Cần bí mật **lúc build** (token tải thư viện riêng) | **Không** |
| Truyền lúc **chạy** (`-e`, `--env-file`) | Cần bí mật **lúc chạy** (mật khẩu database) | Không |
| Kubernetes Secret / kho bí mật ngoài | Production | Không |

```dockerfile
# syntax=docker/dockerfile:1
FROM node:18-alpine
# Token chỉ tồn tại trong đúng lệnh RUN này, KHÔNG vào layer nào
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci --omit=dev
```

```bash
DOCKER_BUILDKIT=1 docker build --secret id=npmrc,src=$HOME/.npmrc -t myapp .
docker history --no-trunc myapp | grep -i token    # → không có gì
```

> **Quy tắc gọn**: `ARG` dùng cho **cấu hình build** (chọn phiên bản, bật/tắt tính năng). `ENV` dùng cho **cấu hình chạy không nhạy cảm** (`NODE_ENV`, `PORT`, `LOG_LEVEL`). **Bí mật thì không dùng cái nào trong hai cái đó.**

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách đúng |
|---|---|---|
| Đưa mật khẩu vào `ENV` trong Dockerfile | Nằm vĩnh viễn trong image, ai pull cũng đọc được | Truyền lúc chạy |
| Tưởng `ARG` an toàn hơn `ENV` | `docker history` đọc được | BuildKit secret mount |
| Quên `.env` trong `.dockerignore` | `COPY . .` đưa cả file bí mật vào image | Luôn có trong `.dockerignore` |
| Commit `.env` lên Git | Lộ vĩnh viễn — **xoá commit không đủ** | `.gitignore`, và coi như đã lộ thì phải đổi mật khẩu |
| Dùng `ARG` rồi thắc mắc sao container không thấy biến | `ARG` **không tồn tại lúc chạy** | `ARG X` + `ENV X=$X` nếu thật sự cần |
| Đặt `ARG`/`ENV` hay đổi lên **đầu** Dockerfile | Đổi giá trị là **mất cache toàn bộ** phía sau | Đặt xuống thấp nhất có thể |
| `--env-file` với file có dấu nháy | Docker giữ nguyên cả dấu nháy thành một phần giá trị | Viết `KEY=giatri`, **không** `KEY="giatri"` |
| Tưởng `-e` ghi đè được `ENV` trong Dockerfile | Đúng là ghi đè được — nhưng **chỉ với `-e`, không phải sửa Dockerfile rồi quên build lại** | Nhớ thứ tự ưu tiên: `-e` > `--env-file` > `ENV` |

---

## Tóm tắt bài 4

- **`ENV`** tạo biến tồn tại **lúc chạy**, nằm trong image, ghi đè được bằng `-e` hoặc `--env-file`.
- **`ARG`** chỉ tồn tại **lúc build**, không có trong container. Truyền bằng `--build-arg`.
- Thứ tự ưu tiên lúc chạy: **`-e`** > **`--env-file`** > **`ENV` trong Dockerfile**.
- **Cả `ARG` lẫn `ENV` đều không giữ được bí mật.** `docker history` đọc được `ARG`; `docker inspect` đọc được `ENV`. Dùng **BuildKit secret mount** cho bí mật lúc build, và truyền lúc chạy cho bí mật lúc chạy.
- **`.env` phải nằm trong cả `.dockerignore` lẫn `.gitignore`.**
- Đặt `ARG`/`ENV` hay đổi **xuống cuối** Dockerfile để không phá bộ nhớ đệm build.

---

**Bài kế tiếp** → [Bài 5: Tổng kết Volumes & Storage Patterns](05-volumes-tong-ket-va-patterns.md)

# Bài 3: Tự build Docker image với Dockerfile

Pipeline hiện tại mỗi build mất 30-60 giây để `npm install netlify-cli` + `npm install node-jq`. Lặp lại N lần/ngày = lãng phí. Giải pháp: **build sẵn 1 image có Netlify CLI + jq**, dùng image đó cho stage Deploy → bỏ qua bước install runtime.

## Vấn đề cụ thể

Stage Deploy Phase 3:

```groovy
sh '''
    npm install netlify-cli node-jq        # ← 30-60s mỗi lần
    node_modules/.bin/netlify deploy ...
'''
```

Mỗi build mất 30-60s này. 50 build/ngày = ~40 phút lãng phí.

Pattern lý tưởng:

```groovy
agent { docker { image 'my-playwright:latest' } }   // ← Image custom có sẵn tool
steps {
    sh 'netlify deploy ...'                          // Không cần install
}
```

→ Lập tức dùng `netlify` command vì image đã có.

## Dockerfile — recipe build image

**Dockerfile** = file text mô tả các bước build image. Đặt ở **root** project, tên đúng `Dockerfile` (D hoa, không đuôi).

### Dockerfile tối thiểu

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

RUN npm install -g netlify-cli node-jq
```

Giải nghĩa:

- **`FROM <image>`** — bắt buộc, **dòng đầu tiên**. Image base để mở rộng. Ở đây: Playwright image (có Node.js + browsers).
- **`RUN <command>`** — chạy lệnh trong khi build image. Output lưu vào image. Ở đây: cài Netlify CLI + node-jq global.

### Vì sao `-g` được dùng được ở đây?

Bài 2 (Phase 3) ta nói **không `-g`** trong CI. Vì sao Dockerfile lại dùng?

- Trong **runtime CI**: container chạy với user thường (`node`, UID 1000) → không có quyền `/usr/lib`.
- Trong **Dockerfile build time**: build chạy với **root** → có quyền cài global. Sau khi cài, tool available ở `/usr/local/bin/` → user thường vẫn execute được.

→ Cài global vào image **đúng**. Trong pipeline runtime mới sai.

### Vị trí file

```text
learn-jenkins-app/
├── Dockerfile          ← Đặt ở root, ngang Jenkinsfile
├── Jenkinsfile
├── package.json
├── src/
└── ...
```

## Lệnh `docker build`

Trong terminal (hoặc Jenkinsfile):

```bash
docker build -t my-playwright .
```

Giải nghĩa:

- **`docker build`** — đọc Dockerfile, build image.
- **`-t my-playwright`** — tag image với tên `my-playwright` (= `my-playwright:latest`).
- **`.`** (dấu chấm) — **build context** = thư mục hiện tại. Docker đọc Dockerfile ở đây.

Output:

```text
[+] Building 25.3s (6/6) FINISHED
 => [internal] load build definition from Dockerfile               0.0s
 => [internal] load .dockerignore                                  0.0s
 => [internal] load metadata for mcr.microsoft.com/playwright...   0.5s
 => [1/2] FROM mcr.microsoft.com/playwright:v1.40.0-jammy          0.0s
 => [2/2] RUN npm install -g netlify-cli node-jq                  24.1s
 => exporting to image                                             0.6s
 => => writing image sha256:abc123...
 => => naming to docker.io/library/my-playwright
```

→ Image `my-playwright` đã có sẵn local. List bằng `docker images`:

```text
REPOSITORY                       TAG        SIZE
my-playwright                    latest     1.4GB
mcr.microsoft.com/playwright    v1.40.0-jammy   1.3GB
```

→ Image mới 1.4 GB (base 1.3 GB + 100 MB tool mới).

## Thêm stage Docker build vào Jenkinsfile

```groovy
stage('Docker') {
    steps {
        sh 'docker build -t my-playwright .'
    }
}
```

Đặt **đầu pipeline** (trước Build/Test) để image sẵn sàng khi cần.

> **Không** cần `agent { docker { ... } }` cho stage này — chính nó **gọi** `docker build`, không cần chạy bên trong container.

Push + Build Now → log:

```text
[Pipeline] { (Docker)
+ docker build -t my-playwright .
Sending build context to Docker daemon  ...
Step 1/2 : FROM mcr.microsoft.com/playwright:v1.40.0-jammy
...
Step 2/2 : RUN npm install -g netlify-cli node-jq
... (20-30s lần đầu, vài giây lần sau do cache)
Successfully built abc123
Successfully tagged my-playwright:latest
```

→ Image `my-playwright` build xong, có thể dùng ở stage sau.

## Dùng image custom trong pipeline

Stage Deploy giờ dùng image mới:

```groovy
stage('Deploy & Test Staging') {
    agent {
        docker {
            image 'my-playwright'              // ← Image mới
            reuseNode true
        }
    }
    steps {
        sh '''
            set -euo pipefail
            netlify deploy --dir=build --json > deploy-output.json
            export CI_ENVIRONMENT_URL=$(node-jq -r '.deploy_url' deploy-output.json)
            npx playwright test
        '''
    }
    ...
}
```

So với trước:
- ❌ Bỏ `npm install netlify-cli node-jq`.
- ❌ Bỏ `node_modules/.bin/` prefix.
- ✓ Gọi trực tiếp `netlify`, `node-jq` vì đã global trong image.

## Đo cải thiện

| Stage         | Trước (image gốc + install) | Sau (image custom) |
|---------------|-----------------------------|---------------------|
| Deploy Staging| 80s                          | 35s                  |
| Deploy Prod   | 45s                          | 15s                  |
| Stage Docker (1 lần đầu) | -                | +25s                 |

→ **Tiết kiệm ~50-60s mỗi pipeline run** (sau Stage Docker đầu).

> Lần sau `docker build` chạy lại, Docker **cache** layer `RUN npm install ...` → chỉ vài giây. Cache chỉ invalid khi Dockerfile thay đổi.

## Cấu trúc Dockerfile chi tiết

Có nhiều **instructions** khác `FROM` và `RUN`:

```dockerfile
FROM node:18-alpine

# Set working directory bên trong container
WORKDIR /app

# Copy file từ build context vào image
COPY package*.json ./
COPY src ./src

# Chạy lệnh build time (cài deps)
RUN npm ci

# Set environment variable
ENV NODE_ENV=production

# Expose port (informational, không tự bind)
EXPOSE 3000

# User chạy (security: tránh root)
USER node

# Lệnh mặc định khi container start
CMD ["node", "src/index.js"]
```

Bảng tóm tắt instructions:

| Instruction | Mục đích                                       |
|-------------|------------------------------------------------|
| `FROM`      | Base image (bắt buộc đầu file)                 |
| `WORKDIR`   | Thư mục làm việc trong container               |
| `COPY`      | Copy file từ host vào image                    |
| `ADD`       | Như COPY + tự extract tar + tải URL (ít dùng)  |
| `RUN`       | Chạy lệnh build time, kết quả lưu vào image     |
| `ENV`       | Set env var runtime                            |
| `ARG`       | Set build-time variable                        |
| `EXPOSE`    | Document port (không bind tự)                  |
| `USER`      | User chạy lệnh sau và CMD                      |
| `CMD`       | Lệnh mặc định khi container start              |
| `ENTRYPOINT`| Như CMD nhưng strict hơn                       |
| `HEALTHCHECK`| Lệnh check container healthy                  |

Khoá học chỉ dùng `FROM`, `RUN`. Còn lại advanced — học khi cần build app riêng.

## Layer caching

Mỗi instruction Dockerfile = 1 **layer** (immutable, hashed). Docker cache layer → nếu **không đổi** thì rebuild dùng cache (siêu nhanh).

```dockerfile
FROM node:18                # Layer 1 (cached)
COPY package.json ./        # Layer 2 (cached nếu package.json không đổi)
RUN npm ci                  # Layer 3 (cached nếu Layer 2 cached)
COPY src ./src              # Layer 4 (đổi mỗi commit thường)
RUN npm run build           # Layer 5
```

→ **Best practice**: đặt instruction **ít đổi** ở trên, **hay đổi** ở dưới. Khi sửa code trong `src/`, chỉ rebuild Layer 4 + 5; Layer 1-3 dùng cache → nhanh.

Counter-example xấu:

```dockerfile
FROM node:18
COPY . .                    # ← Copy hết, đổi mọi commit
RUN npm ci                  # ← Mỗi commit phải cài lại deps (chậm)
```

→ Lúc nào cũng cài lại deps, không tận dụng cache.

## `.dockerignore`

Khi `docker build .`, Docker **tải toàn bộ thư mục hiện tại** vào daemon (build context). Nếu có `node_modules/` 500 MB → tải mất phút.

Tạo file **`.dockerignore`** ở root project để exclude:

```text
node_modules
build
.git
*.log
.env
.vscode
```

→ Tương tự `.gitignore`. Tốc độ build tăng đáng kể.

## Pitfall

### Pitfall 1: Dockerfile sai tên

```text
dockerfile          ← SAI (lowercase d)
Dockerfile.txt      ← SAI (có đuôi)
Dockerfile          ← ĐÚNG
```

Hoặc dùng `docker build -f <path>` chỉ định file:

```bash
docker build -f Dockerfile.dev -t my-image .
```

### Pitfall 2: `RUN` chia thành nhiều dòng = nhiều layer

```dockerfile
RUN apt-get update                     # Layer riêng
RUN apt-get install -y curl            # Layer riêng
RUN apt-get install -y jq              # Layer riêng
```

→ Nhiều layer = image lớn + lỗi cache (apt-get install có thể dùng cache cũ).

Best practice:

```dockerfile
RUN apt-get update && \
    apt-get install -y curl jq && \
    rm -rf /var/lib/apt/lists/*        # Cleanup cache, giảm size
```

→ 1 layer, sạch sẽ. Bài 6 sẽ dùng pattern này.

### Pitfall 3: Quên `WORKDIR`

```dockerfile
FROM node:18
COPY . .                # Copy vào / (root) — bừa bộn
RUN npm ci              # Chạy ở / — lỗi vì không có package.json
```

→ Luôn `WORKDIR /app` trước khi `COPY`/`RUN`.

### Pitfall 4: Build context khổng lồ

```bash
docker build .          # Thư mục hiện tại 10 GB → tải 10 GB
```

→ Dùng `.dockerignore`. Hoặc build từ thư mục con:

```bash
docker build ./app/     # Build context = app/
```

### Pitfall 5: Hard-code secret

```dockerfile
ENV API_KEY=secretkey123     # ❌ Lộ trong image
RUN curl -H "Auth: secretkey123" ...
```

→ Image có chứa env → ai pull image cũng đọc được. Dùng **build args + Docker secrets** cho secret.

## Tóm tắt

- **Dockerfile** = file text mô tả build image. Đặt root, tên đúng `Dockerfile`.
- Instructions cơ bản: `FROM` (base image), `RUN` (lệnh build time).
- **`docker build -t <name> .`** build image từ Dockerfile.
- Pre-cài tool vào image custom → bỏ install runtime trong pipeline → tiết kiệm 30-60s mỗi build.
- **Layer caching**: đặt instructions ít đổi lên trên, hay đổi xuống dưới.
- **`.dockerignore`** exclude file khỏi build context.
- Pitfall: tên file sai, nhiều `RUN` không cần, quên `WORKDIR`, hard-code secret.

---

→ [Bài tiếp theo: Dùng image custom trong pipeline](04-custom-image-trong-pipeline.md)

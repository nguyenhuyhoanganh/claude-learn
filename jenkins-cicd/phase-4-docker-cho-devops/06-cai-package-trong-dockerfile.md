# Bài 6: Cài Linux package trong Dockerfile và tổng kết Phase 4

Image hiện tại dùng `npm install` cài tool — nhưng có tool không có trên npm (vd `curl`, `git`, `imagemagick`, `ffmpeg`, `awscli`...). Bài này dạy cài tool Linux gốc bằng package manager của distro (apt, apk, yum...).

## Vấn đề: tool không trên npm

Muốn pipeline có `curl` để kiểm tra HTTP, hoặc `awscli` để upload S3, hoặc `jq` (binary native nhanh hơn node-jq). Không thể `npm install curl`.

→ Cài qua **package manager OS**:
- **Alpine** → `apk`
- **Ubuntu / Debian** → `apt` / `apt-get`
- **RHEL / CentOS / Fedora** → `yum` / `dnf`

## Pattern 1: Cài runtime (anti-pattern!)

Stage trong pipeline, dùng `args '-u root'`:

```groovy
stage('Test') {
    agent {
        docker {
            image 'python:3-alpine'
            args  '-u root'                    // ← Cần root để cài
            reuseNode true
        }
    }
    steps {
        sh '''
            apk add jq                          # Alpine package manager
            jq --version
        '''
    }
}
```

**Lý do anti-pattern**:

- Container chạy root → file tạo trong workspace thuộc root.
- Sau khi container exit, Jenkins (user thường) **không xoá** được file root.
- Build kế tiếp `cleanWs()` → fail.

→ **Tránh** trừ khi gấp.

## Pattern 2: Cài trong Dockerfile (best practice)

Build sẵn image có tool:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Cập nhật package list + cài jq + dọn cache cùng 1 RUN
RUN apt-get update && \
    apt-get install -y jq && \
    rm -rf /var/lib/apt/lists/*

# Cài tool npm global
RUN npm install -g netlify-cli serve
```

Build image:

```bash
docker build -t my-playwright .
```

Trong pipeline (không cần `-u root`):

```groovy
agent { docker { image 'my-playwright' } }
steps {
    sh '''
        jq --version          # Có sẵn, không cài runtime
        netlify --version
    '''
}
```

→ Clean, không root, fast.

## Package manager cho từng distro

### Alpine: `apk`

```dockerfile
FROM node:18-alpine

RUN apk add --no-cache curl git jq
```

- **`--no-cache`** — không cache index → image nhỏ hơn.
- Apk không cần `update` separate (đã update khi cài).

Search package: <https://pkgs.alpinelinux.org/packages>.

### Ubuntu / Debian: `apt-get`

```dockerfile
FROM node:18

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        git \
        jq && \
    rm -rf /var/lib/apt/lists/*
```

- **`apt-get update`** bắt buộc trước `install` để fresh package index.
- **`-y`** auto-confirm (CI không thể trả lời prompt).
- **`--no-install-recommends`** bỏ qua optional deps → image nhỏ.
- **`rm -rf /var/lib/apt/lists/*`** dọn cache → image nhỏ hơn ~50 MB.
- **Combine vào 1 `RUN`** với `&&` → 1 layer, không bị cache vô tình.

Search package: <https://packages.ubuntu.com>.

### Khoá học dùng image gì?

`mcr.microsoft.com/playwright:v1.40.0-jammy` based on Ubuntu 22.04 (`jammy`) → dùng `apt-get`.

## Tránh trap: 1 RUN cho `apt-get update` + `install`

**Sai**:

```dockerfile
RUN apt-get update                # Layer 1
RUN apt-get install -y jq         # Layer 2
```

Vì sao tệ?

1. Layer 1 cache (apt index ngày X).
2. Sau 1 tuần, sửa Dockerfile thêm package mới.
3. Layer 1 vẫn cache (index cũ ngày X).
4. Layer 2 install package mới — nhưng index outdated → có thể fail hoặc cài version cũ.

→ **Pattern đúng**: combine vào 1 `RUN`, `update` và `install` cùng nhau:

```dockerfile
RUN apt-get update && \
    apt-get install -y jq curl
```

→ Mỗi rebuild đều fresh index.

## Pattern: cài AWS CLI (chuẩn bị Phase 5)

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        unzip \
        jq && \
    rm -rf /var/lib/apt/lists/*

# Cài AWS CLI v2
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscli.zip" && \
    unzip awscli.zip && \
    ./aws/install && \
    rm -rf awscli.zip aws/

RUN npm install -g netlify-cli serve
```

Verify:

```bash
docker build -t my-playwright .
docker run --rm my-playwright aws --version
# Output: aws-cli/2.x.x
```

→ Phase 5 sẽ dùng `aws s3 cp ...` ngay trong pipeline.

## Updated Dockerfile cho khoá học (cuối Phase 4)

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Linux packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        jq \
        curl \
        unzip && \
    rm -rf /var/lib/apt/lists/*

# AWS CLI v2 (cho Phase 5)
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscli.zip" && \
    unzip -q awscli.zip && \
    ./aws/install && \
    rm -rf awscli.zip aws/

# Global npm tools
RUN npm install -g netlify-cli serve
```

→ Image này có Node + Playwright browsers + jq + curl + AWS CLI + Netlify CLI + serve. Dùng cho mọi stage Phase 5.

## Tổng kết Phase 4

### Khái niệm đã nắm

- **Container** = process cô lập ở mức OS, nhẹ hơn VM nhiều.
- **Image** = blueprint, **Container** = instance.
- **Dockerfile** = recipe build image, đặt root project.
- **`FROM`** chọn base. **`RUN`** chạy lệnh build time. **`COPY`** copy file.
- **Layer caching** — đặt instruction ít đổi trên đầu.
- **`.dockerignore`** giảm build context.
- **Docker Hub** — registry default cho image public.
- Custom image pre-cài tool → pipeline runtime nhanh hơn.
- **Nightly build** image — tách khỏi pipeline app.
- Cài Linux package: `apt-get` (Ubuntu/Debian), `apk` (Alpine), `yum`/`dnf` (RHEL).

### Kỹ năng đã hành

- Viết Dockerfile cơ bản (`FROM` + `RUN`).
- `docker build -t name .` build image local.
- Tag + version image.
- Dùng image custom trong `agent { docker { image '...' } }`.
- Tách Jenkinsfile + Jenkinsfile-nightly cho 2 mục đích khác nhau.
- Tạo job Jenkins thứ 2 cho nightly với cron trigger.
- Combine `apt-get update && install` trong 1 RUN để tránh cache trap.

### Pipeline + Image kết quả

**`Jenkinsfile`** (main, chạy mỗi commit):

```text
Build → Run Tests (parallel) → Deploy & Test Staging → Deploy & Test Prod
```

**`Jenkinsfile-nightly`** (chạy 2 AM mỗi đêm):

```text
Build Docker Image (push to local Docker daemon)
```

**`Dockerfile`**:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy
RUN apt-get ... && rm ...
RUN curl awscli ... && rm ...
RUN npm install -g netlify-cli serve
```

### Phase 4 → Phase 5

Tới giờ deploy lên Netlify — đơn giản, ít kiểm soát. Phase 5 deploy lên **AWS** (cloud provider lớn nhất thế giới):

- Đăng ký AWS, hiểu IAM.
- Cài AWS CLI (đã sẵn trong image rồi!).
- Upload static site lên **Amazon S3**.
- Host website từ S3 với feature **Static Website Hosting**.
- Auto sync mỗi build qua `aws s3 sync`.
- (Optional) Tạo EC2 instance, host Nginx.

→ AWS phức tạp hơn Netlify nhưng đầy đủ enterprise. Học AWS = mở cửa vào DevOps thật sự.

## Đọc thêm

- Docker docs: <https://docs.docker.com/get-started/>
- Dockerfile best practices: <https://docs.docker.com/develop/develop-images/dockerfile_best-practices/>
- "Docker Deep Dive" — Nigel Poulton (sách rất tốt).

## Bạn đã sẵn sàng cho Phase 5 nếu...

- [ ] Tự viết Dockerfile cho project Node/Python/Java cơ bản.
- [ ] Hiểu khác biệt `FROM`, `RUN`, `COPY`.
- [ ] Build image local bằng `docker build -t name .`.
- [ ] Dùng image custom trong Jenkinsfile.
- [ ] Phân biệt Alpine apk vs Debian apt.
- [ ] Hiểu vì sao combine `apt-get update && install` trong 1 RUN.

---

→ **Sẵn sàng?** [Phase 5: Deploy lên AWS](../phase-5-deploy-len-aws/01-cloud-computing-va-aws.md)

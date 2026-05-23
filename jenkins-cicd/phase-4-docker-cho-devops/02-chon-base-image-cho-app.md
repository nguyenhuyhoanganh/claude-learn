# Bài 2: Chọn base image cho project

Khi viết `agent { docker { image '...' } }`, image đó từ đâu ra? Bài này dạy cách **chọn image phù hợp** cho từng ngôn ngữ + framework.

## Image phải có gì?

Image dùng cho CI cần:

1. **Runtime của ngôn ngữ** (Node.js, Python, JDK, .NET runtime…).
2. **Package manager** (npm, pip, maven, dotnet…).
3. **Đủ Linux tool cơ bản** (sh, curl, git).
4. **Càng nhỏ càng tốt** → pull nhanh, tiết kiệm disk.

May mắn: **đa số ngôn ngữ phổ biến đều có official image** trên Docker Hub.

## Tìm image trên Docker Hub

Quy trình tìm image **chuẩn**:

1. Mở <https://hub.docker.com>.
2. Search tên ngôn ngữ/tool (`node`, `python`, `openjdk`, `php`…).
3. Tìm checkbox **"Docker Official Image"** — luôn ưu tiên image official.
4. Click vào → **đọc README** (không phải skip).
5. Vào tab **Tags** → chọn version phù hợp.

> **Lý do** ưu tiên official: bảo trì bởi Docker hoặc nhà phát triển ngôn ngữ. Security update, ổn định, đáng tin cậy. Image không-official có thể chứa malware hoặc backdoor.

## Anatomy của tên image

```text
node:18-alpine
 ↑    ↑    ↑
 │    │    └─ variant (alpine/slim/debian/bullseye)
 │    └─ version (18, 18.18.2, latest)
 └─ repository name
```

Đầy đủ hơn:

```text
docker.io/library/node:18-alpine
 ↑          ↑       ↑    ↑
 │          │       │    └─ tag
 │          │       └─ image name
 │          └─ namespace (library = official)
 └─ registry (mặc định = docker.io = Docker Hub)
```

Khi viết `node:18-alpine` trong Jenkinsfile, Docker hiểu = `docker.io/library/node:18-alpine`.

## Ví dụ: Node.js

Vào <https://hub.docker.com/_/node>:

```text
Node.js Official Image
═══════════════════════
Image variants:
  node:<version>           ← Default: Debian-based, ~400 MB
  node:<version>-alpine    ← Alpine Linux, ~40 MB  ⭐
  node:<version>-slim      ← Debian slim, ~150 MB
  node:<version>-bullseye  ← Debian 11 specific
  node:<version>-buster    ← Debian 10 specific
```

Version:
- `node:18` — Node 18, latest patch (auto update).
- `node:18.18.2` — pinned exact.
- `node:18-alpine` — Node 18 + Alpine (tiny).
- `node:latest` — bất kỳ version mới nhất ⚠️ **TRÁNH**.

→ **Khoá học chọn `node:18-alpine`**: nhỏ (~40 MB), pull nhanh.

### Alpine Linux là gì?

- **Linux distro** rất nhỏ (~5 MB base), dùng `musl` libc thay vì `glibc`.
- Package manager: **`apk`** (Alpine Package Keeper).
- **Trade-off**: 1 số native binary build cho glibc không chạy được trên musl. Hiếm nhưng có (vd 1 số npm package có native bindings).

→ Khi nghi ngờ → đổi sang `node:18-slim` (Debian-based).

## Ví dụ: Python

<https://hub.docker.com/_/python>:

```text
Image variants:
  python:<version>          ← Debian, ~900 MB
  python:<version>-slim     ← Debian slim, ~120 MB
  python:<version>-alpine   ← Alpine, ~50 MB
  python:<version>-bullseye ← Debian 11
```

Version examples:
- `python:3` — Python 3 latest.
- `python:3.11` — Python 3.11 latest patch.
- `python:3.11.5` — exact.
- `python:3-alpine` — Python 3 + Alpine.

Khuyến nghị: `python:3.11-slim` (cân bằng size + compatibility). `-alpine` có thể gặp lỗi vài package (vd `cryptography`, `numpy` cần compile từ source trên Alpine → chậm).

## Ví dụ: Java (OpenJDK)

`openjdk` image **deprecated** từ 2023. Thay vào dùng:

- **Eclipse Temurin** (`eclipse-temurin:17`) — community-led OpenJDK distribution.
- **Amazon Corretto** (`amazoncorretto:17`) — Amazon's OpenJDK.
- **Microsoft OpenJDK** (`mcr.microsoft.com/openjdk/jdk:17`) — Microsoft.

→ Đọc warning trên page `openjdk` để biết alternatives mới nhất.

Maven + Java:

```text
maven:3.9-eclipse-temurin-17    ← Maven 3.9 + JDK 17
gradle:8-jdk17                  ← Gradle 8 + JDK 17
```

## Ví dụ: PHP

<https://hub.docker.com/_/php>:

```text
php:<version>                 ← CLI only
php:<version>-apache          ← + Apache web server
php:<version>-fpm             ← + PHP-FPM (Nginx companion)
php:<version>-cli-alpine      ← Alpine, CLI only
```

→ Tuỳ use case: build CLI tool dùng `php:8-cli`, web app dùng `php:8-apache`.

## Ví dụ: .NET (không trên Docker Hub!)

Search `dotnet` trên Docker Hub → không có official image. **.NET host trên Microsoft Artifact Registry** (mcr.microsoft.com).

URL: <https://mcr.microsoft.com> → **Catalog** → `dotnet`.

```text
mcr.microsoft.com/dotnet/sdk:8.0           ← Full SDK (build)
mcr.microsoft.com/dotnet/runtime:8.0       ← Runtime only (run)
mcr.microsoft.com/dotnet/aspnet:8.0        ← ASP.NET runtime
mcr.microsoft.com/dotnet/runtime-deps:8.0  ← Minimal, cho self-contained app
```

→ Dùng:

```groovy
agent { docker { image 'mcr.microsoft.com/dotnet/sdk:8.0' } }
```

→ Path đầy đủ vì không phải Docker Hub.

> **Pattern**: image không trên Docker Hub → cần **fully qualified path** (`<registry>/<namespace>/<image>:<tag>`). Image trên Docker Hub thì viết tắt được.

Phase 2 đã dùng `mcr.microsoft.com/playwright:v1.40.0-jammy` — Playwright cũng host trên MCR.

## Patterns: image cho từng giai đoạn pipeline

```groovy
stage('Lint') {
    agent { docker { image 'node:18-alpine' } }
    steps { sh 'npm run lint' }
}

stage('Build') {
    agent { docker { image 'node:18-alpine' } }
    steps { sh 'npm ci && npm run build' }
}

stage('E2E') {
    agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy' } }
    // ↑ Khác image vì cần browsers preinstalled
    steps { sh 'npx playwright test' }
}

stage('Deploy') {
    agent { docker { image 'amazon/aws-cli' } }
    // ↑ Image AWS CLI có sẵn
    steps { sh 'aws s3 cp ...' }
}
```

→ Mỗi stage chọn image **vừa đủ** cho stage đó. Không one-size-fits-all.

## Best practice chọn image

### 1. Đọc README trên Docker Hub

Mất 2 phút đọc README → tiết kiệm hàng giờ debug. README giải thích variants, env vars, exposed ports, default user.

### 2. Pin version

```text
node:18                ← OK (major)
node:18.18             ← OK (minor)
node:18.18.2           ← Best (patch)
node:latest            ← ❌ Tránh (không reproducible)
```

→ Trade-off:
- Pin chặt (`18.18.2`): reproducible 100% nhưng phải update tay khi có patch.
- Pin lỏng (`18`): tự nhận patch nhưng có thể break đột ngột.

→ Production thường pin chặt + auto-update theo schedule (Dependabot, Renovate).

### 3. Ưu tiên small image

Image nhỏ:
- Pull nhanh hơn → CI nhanh hơn.
- Tiết kiệm registry storage cost.
- Ít attack surface (ít package = ít CVE).

Thứ tự nhỏ → lớn (Node ví dụ):

```text
node:18-alpine  (~40 MB)   ← Nhỏ nhất, alpine quirks
node:18-slim    (~150 MB)  ← Debian slim, ổn
node:18         (~400 MB)  ← Full, dev tools đầy đủ
```

### 4. Tránh image bí ẩn

```text
random-user/super-node:latest   ← ❌ Ai biết bên trong là gì?
```

→ Chỉ dùng official, hoặc image bạn tự build.

### 5. Image vendor: nguồn tin cậy

| Vendor                          | Use case                       |
|---------------------------------|--------------------------------|
| `library/*` (Docker Hub)        | Ngôn ngữ phổ biến              |
| `mcr.microsoft.com/*`           | .NET, SQL Server, Playwright   |
| `amazoncorretto`, `amazon/*`    | AWS-managed                    |
| `nvcr.io/nvidia/*`              | NVIDIA GPU/AI                  |
| `ghcr.io/<gh-org>/*`            | Open source projects           |

## Pitfall

### Pitfall 1: `latest` tag

```groovy
agent { docker { image 'node:latest' } }
```

→ Sáng nay pipeline pass, tối Node phát hành major mới → break. **Luôn pin version** trong CI.

### Pitfall 2: Image không exist cho platform

Trên Apple Silicon (ARM), image build cho `x86_64` không chạy:

```text
WARNING: The requested image's platform (linux/amd64) does not match
the detected host platform (linux/arm64/v8)
```

→ Tìm tag có `-arm64` hoặc dùng `--platform linux/amd64` (chậm vì emulation).

### Pitfall 3: Alpine với native package

Build npm package có native binding (`bcrypt`, `node-sass`, `sharp`...) trên Alpine → fail vì thiếu compiler:

```text
make: not found
```

→ Đổi sang `node:18-slim` hoặc thêm build tools vào Dockerfile (bài 6).

### Pitfall 4: Quên prefix `mcr.microsoft.com/`

```groovy
agent { docker { image 'playwright:v1.40.0-jammy' } }   // ❌
agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy' } }   // ✓
```

→ Docker default registry = Docker Hub → không tìm thấy → fail. Image không-Docker-Hub luôn cần full path.

## Tóm tắt

- **Docker Hub** là registry default, search image official tại đây.
- Đọc README image trước khi dùng — tiết kiệm hàng giờ debug.
- **Variants**: `-alpine` (nhỏ), `-slim` (cân bằng), full (mặc định).
- **Pin version** trong CI: tránh `latest`. Best: pin patch (`18.18.2`).
- Image .NET / Playwright / SQL Server: trên **`mcr.microsoft.com`**, cần full path.
- Trade-off Alpine vs Slim: nhỏ vs compatibility. Đụng native binding → đổi slim.
- Đa số CI pipeline dùng nhiều image khác nhau cho từng stage (build, test, deploy).

---

→ [Bài tiếp theo: Tự build Docker image với Dockerfile](03-build-docker-image.md)

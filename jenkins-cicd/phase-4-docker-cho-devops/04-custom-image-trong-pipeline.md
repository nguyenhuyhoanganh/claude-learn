# Bài 4: Dùng image custom trong pipeline + Assignment

Bài 3 build image `my-playwright`. Bài này áp dụng vào **mọi stage cần Node.js/Playwright** trong pipeline, đo cải thiện, và làm assignment.

## Migration: stage by stage

Pipeline cuối Phase 3 dùng 2 image:

- `node:18-alpine` cho Build, Unit Test, Deploy Staging, Deploy Prod.
- `mcr.microsoft.com/playwright:v1.40.0-jammy` cho Local E2E, Staging E2E, Production E2E.

Image custom `my-playwright` đã có Node.js (vì base là Playwright, mà Playwright cài Node) + Netlify CLI + node-jq. Có thể replace **mọi stage**.

### Stage Deploy Staging

Trước:

```groovy
stage('Deploy & Test Staging') {
    agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
    steps {
        sh '''
            npm install netlify-cli node-jq             # ← Bỏ
            node_modules/.bin/netlify deploy ...        # ← Bỏ prefix
            node_modules/.bin/node-jq ...               # ← Bỏ prefix
            npx playwright test
        '''
    }
}
```

Sau:

```groovy
stage('Deploy & Test Staging') {
    agent { docker { image 'my-playwright'; reuseNode true } }   // ← Đổi
    steps {
        sh '''
            set -euo pipefail
            netlify deploy --dir=build --json > deploy-output.json
            export CI_ENVIRONMENT_URL=$(node-jq -r '.deploy_url' deploy-output.json)
            npx playwright test
        '''
    }
}
```

→ Sạch hơn. Tool gọi trực tiếp (vì cài global trong image).

### Stage Deploy Prod

Tương tự:

```groovy
stage('Deploy & Test Prod') {
    agent { docker { image 'my-playwright'; reuseNode true } }
    environment {
        CI_ENVIRONMENT_URL = 'https://golden-pavlova-xyz.netlify.app'
    }
    steps {
        sh '''
            set -euo pipefail
            netlify deploy --dir=build --prod
            sleep 10
            npx playwright test
        '''
    }
}
```

## Pipeline sau migration

```groovy
pipeline {
    agent any
    environment { ... }
    stages {
        stage('Docker') {
            steps {
                sh 'docker build -t my-playwright .'
            }
        }
        stage('Build') {
            agent { docker { image 'node:18-alpine'; reuseNode true } }
            steps { sh 'npm ci && npm run build' }
        }
        stage('Run Tests') {
            parallel {
                stage('Unit Tests') {
                    agent { docker { image 'node:18-alpine'; reuseNode true } }
                    steps { sh '...' }
                }
                stage('Local E2E') {
                    agent { docker { image 'my-playwright'; reuseNode true } }   // ← MỚI
                    steps { sh '...' }
                }
            }
        }
        stage('Deploy & Test Staging') { ... }
        stage('Deploy & Test Prod')    { ... }
    }
}
```

→ Vấn đề: stage `Build` và `Unit Tests` vẫn dùng `node:18-alpine`. Tại sao không dùng `my-playwright` luôn?

**Trade-off**:

- `my-playwright` = 1.4 GB (có Playwright + browsers).
- `node:18-alpine` = 40 MB.

→ Cho stage chỉ cần Node (Build, Unit), dùng Alpine **nhỏ + nhanh**. Cho stage cần Playwright (E2E, Deploy), dùng `my-playwright`.

→ Tuỳ chiến lược: **đa dạng image cho từng stage** vs **1 image cho mọi stage**.

## Assignment: tự migrate stage Local E2E

### Đề bài

Pipeline gốc:

```groovy
stage('Local E2E') {
    agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
    steps {
        sh '''
            npm install serve
            node_modules/.bin/serve -s build &
            sleep 10
            npx playwright test
        '''
    }
}
```

→ Stage này cài `serve` mỗi lần. Bạn cần:

1. Sửa `Dockerfile` để image custom có sẵn `serve`.
2. Migrate stage `Local E2E` dùng `my-playwright`.
3. Bỏ `npm install serve` + `node_modules/.bin/` trong stage.

Stop lại đây, tự làm. Đọc tiếp khi đã thử.

### Solution

#### Bước 1: Sửa Dockerfile

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

RUN npm install -g netlify-cli node-jq serve     # ← Thêm serve
```

#### Bước 2: Sửa pipeline

```groovy
stage('Local E2E') {
    agent { docker { image 'my-playwright'; reuseNode true } }
    steps {
        sh '''
            set -euo pipefail
            serve -s build &              # ← Trực tiếp, không node_modules/.bin/
            sleep 10
            npx playwright test
        '''
    }
}
```

#### Bước 3: Commit + push

→ Stage Docker build lại image (mất ~25s vì có thêm `serve`).
→ Stage Local E2E giờ chạy nhanh hơn (~10s tiết kiệm vì bỏ `npm install serve`).

### Quan sát

```text
Trước:                          Sau:
Local E2E: 28s                  Local E2E: 17s
                                Docker build: +5s (do cache)
```

→ Tiết kiệm 11s/build, trade off 5s build image (cache hit).

→ Pipeline càng phức tạp (nhiều stage cùng dùng tool), pre-install vào image càng đáng. **Cost up-front, benefit long-term**.

## Vấn đề mới: Stage Docker chạy mỗi build

```text
Mỗi pipeline:
Docker build  (~25s lần đầu / ~5s cache hit) → ...
```

Image **không thay đổi** giữa các commit (Dockerfile không đổi) → cache hit → 5s. Nhưng vẫn tốn ~5s. Có cách bỏ qua không?

→ Bài 5: **tách build image ra job riêng**, chạy 1 lần/đêm. Pipeline chính dùng image đã build sẵn → không tốn 5s.

## Trade-off: custom image vs image gốc

### Custom image (`my-playwright`)

**Ưu**:
- Nhanh pipeline runtime (tool có sẵn).
- Image tự kiểm soát version tool.
- Reproducible — image identical cho mọi build.

**Nhược**:
- Phải maintain Dockerfile.
- Cần infrastructure để build/host image (Phase 6 lên ECR).
- Image lớn dần khi thêm tool.

### Image gốc (`node:18-alpine`)

**Ưu**:
- Không phải maintain Dockerfile.
- Image official, security update tự động (nếu pin major).
- Nhỏ gọn.

**Nhược**:
- Cài tool runtime → chậm mỗi build.
- Phụ thuộc network npm/pip ổn định.

→ **Khi nào custom?** Khi tool install nhiều hoặc chậm (>30s). Khi cần Linux package custom (apt-get).

## Lưu ý: tag image custom

```bash
docker build -t my-playwright .             # = my-playwright:latest
docker build -t my-playwright:1.0 .         # Tag version
docker build -t my-playwright:nightly .     # Tag nhánh
docker build -t my-playwright:$BUILD_ID .   # Tag theo Jenkins build
```

Khi nhiều version coexist, Jenkinsfile chỉ định rõ tag:

```groovy
agent { docker { image 'my-playwright:1.0' } }
```

→ Test compatibility, rollback nếu tag mới broken.

## Khi image cần thay đổi runtime

Đôi khi cần thêm tool tạm, không muốn rebuild image. Có thể thêm `apt-get install` trong stage:

```groovy
stage('Special') {
    agent { docker { image 'my-playwright'; args '-u root' } }
    steps {
        sh '''
            apt-get update && apt-get install -y some-tool
            # ... dùng some-tool
        '''
    }
}
```

→ Cẩn thận `args '-u root'` (bài Phase 3 đã cảnh báo). Chỉ dùng cho test 1 lần.

## Tóm tắt

- Replace `agent { docker { image '<gốc>' } }` bằng image custom → bỏ install runtime.
- Custom image phù hợp khi tool install lâu hoặc nhiều stage cùng dùng.
- Pipeline có thể **mix**: stage nặng tool dùng custom, stage nhẹ dùng image gốc.
- Trade-off: custom = phải maintain, vs gốc = official maintained.
- Tag rõ ràng (`my-playwright:1.0`) thay vì `latest` để rollback dễ.
- Vấn đề còn lại: Stage Docker chạy mỗi build → bài 5 fix.

---

→ [Bài tiếp theo: Nightly image build job](05-nightly-image-build.md)

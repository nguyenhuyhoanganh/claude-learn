# Bài 8: aws s3 sync và pipeline hoàn chỉnh

`aws s3 cp --recursive` upload mọi file nhưng **không xoá file thừa** trong bucket. Khi commit cũ có file mới đã xoá → S3 vẫn còn file orphan. Giải pháp: **`aws s3 sync`**.

## `aws s3 sync` là gì?

> `sync` recursively copies new and updated files from source to destination. **Only creates folders in the destination if they contain one or more files.**

→ Hành vi:

- File mới ở source → upload.
- File **đã sửa** ở source → upload (so sánh size + timestamp + ETag).
- File **giống** → skip.
- File **chỉ ở destination** (orphan) → vẫn giữ. Trừ khi thêm `--delete`.

## Cú pháp

```bash
aws s3 sync <source> <destination> [--options]
```

3 chế độ:

```bash
# Local → S3 (upload)
aws s3 sync ./build s3://bucket/

# S3 → Local (download)
aws s3 sync s3://bucket/ ./local-folder

# S3 → S3 (copy giữa bucket)
aws s3 sync s3://bucket-a/ s3://bucket-b/
```

## Khoá học dùng: sync `build/` lên bucket

Thay `aws s3 cp build/ s3://bucket/ --recursive` bằng:

```bash
aws s3 sync ./build s3://$AWS_S3_BUCKET --delete
```

→ `--delete` xoá file ở bucket mà source không có.

```text
Build commit cũ:                Build commit mới:
build/                          build/
├── index.html                  ├── index.html
├── old.html        ← bỏ        └── new.html       ← thêm

Sau sync với --delete:
S3 bucket:
├── index.html (updated)
├── new.html (added)
└── (old.html bị xoá)
```

→ Bucket **luôn match build folder** chính xác.

> ⚠️ **`--delete` mạnh** — kiểm tra source path đúng trước. Sync `./empty` → bucket bị xoá hết.

## So sánh `cp --recursive` vs `sync`

| Behavior                | `cp --recursive`     | `sync`                          |
|-------------------------|----------------------|---------------------------------|
| Upload new file         | ✅                    | ✅                              |
| Update changed file     | ✅                    | ✅ (chỉ khi changed)            |
| Skip unchanged file     | ❌ (vẫn upload)       | ✅                              |
| Delete extra in dest    | ❌                    | ✅ (with `--delete`)            |
| Speed (large dir)       | Chậm hơn             | Nhanh hơn (skip unchanged)      |
| Use case                | First upload         | Recurring deploy                |

→ **`sync` luôn tốt hơn cho deploy pipeline**.

## Stage Deploy hoàn chỉnh

```groovy
stage('Deploy to AWS') {
    agent { docker { image 'my-playwright' } }
    steps {
        withCredentials([usernamePassword(
            credentialsId: 'my-aws',
            usernameVariable: 'AWS_ACCESS_KEY_ID',
            passwordVariable: 'AWS_SECRET_ACCESS_KEY'
        )]) {
            sh '''
                set -euo pipefail
                aws s3 sync ./build s3://$AWS_S3_BUCKET --delete
            '''
        }
    }
}
```

Push + Build Now → log:

```text
+ aws s3 sync ./build s3://learn-jenkins-20260105 --delete
upload: build/index.html to s3://learn-jenkins-20260105/index.html
upload: build/static/css/main.abc.css to s3://...
upload: build/static/js/main.xyz.js to s3://...
upload: build/favicon.ico to s3://...
delete: s3://learn-jenkins-20260105/old.html
```

→ Upload mới, delete orphan. Build folder = bucket.

Truy cập website endpoint → thấy bản mới deploy.

## Integration: replace Netlify Prod bằng AWS

Pipeline cuối Phase 3 có 2 Deploy: Netlify staging + Netlify prod. Giờ thay prod bằng AWS:

```groovy
pipeline {
    agent any
    environment {
        NETLIFY_SITE_ID    = '...'
        NETLIFY_AUTH_TOKEN = credentials('netlify-token')
        REACT_APP_VERSION  = "1.0.${BUILD_ID}"
        AWS_DEFAULT_REGION = 'us-east-1'
        AWS_S3_BUCKET      = 'learn-jenkins-20260105'
        CI_ENVIRONMENT_URL = 'http://learn-jenkins-20260105.s3-website-us-east-1.amazonaws.com'
    }
    stages {
        stage('Build') { ... }
        stage('Run Tests') { parallel { ... } }

        stage('Deploy & Test Staging') {
            // Vẫn dùng Netlify cho staging
            agent { docker { image 'my-playwright'; reuseNode true } }
            steps {
                sh '''
                    netlify deploy --dir=build --json > deploy-output.json
                    export CI_ENVIRONMENT_URL=$(node-jq -r '.deploy_url' deploy-output.json)
                    npx playwright test
                '''
            }
            post { ... }
        }

        stage('Deploy to AWS Prod') {                   // ← THAY
            agent { docker { image 'my-playwright'; reuseNode true } }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'my-aws',
                    usernameVariable: 'AWS_ACCESS_KEY_ID',
                    passwordVariable: 'AWS_SECRET_ACCESS_KEY'
                )]) {
                    sh '''
                        set -euo pipefail
                        aws s3 sync ./build s3://$AWS_S3_BUCKET --delete
                        sleep 10
                        npx playwright test
                    '''
                }
            }
            post {
                always {
                    publishHTML([
                        reportDir: 'playwright-report', reportFiles: 'index.html',
                        reportName: 'AWS Prod E2E', keepAll: true,
                        allowMissing: false, alwaysLinkToLastBuild: false
                    ])
                }
            }
        }
    }
}
```

→ Mỗi commit: build → test → staging (Netlify preview) → AWS S3 prod.

## Pitfall

### Pitfall 1: `--delete` xoá nhầm

Source path sai:

```bash
aws s3 sync ./build-typo s3://bucket --delete    # build-typo không tồn tại
# → Sync 0 file, xoá hết trong bucket
```

→ Test với `--dryrun` trước:

```bash
aws s3 sync ./build s3://bucket --delete --dryrun
# In ra "(dryrun) upload: ..." và "(dryrun) delete: ..."
# Không upload thật.
```

### Pitfall 2: workspace không có build folder

```text
+ aws s3 sync ./build s3://bucket
warning: Skipping file ./build/... File/Directory does not exist.
```

→ Stage không có `reuseNode true` hoặc Build stage chưa chạy → workspace trống.

Check `reuseNode true` trong Docker agent → workspace mounted từ Jenkins.

### Pitfall 3: CloudFront cache không invalidate

Production với CloudFront: sau sync, CloudFront vẫn serve bản cũ vài giờ.

→ Cần `aws cloudfront create-invalidation` sau sync:

```bash
aws s3 sync ./build s3://bucket --delete
aws cloudfront create-invalidation --distribution-id ABC --paths "/*"
```

### Pitfall 4: file lớn timeout

`sync` upload tuần tự với multipart cho file >5 MB. File >5 GB cần split manual.

→ Khoá học không gặp (build < 10 MB).

## ✨ Tổng kết Phase 5

Bạn đi từ chưa biết cloud đến pipeline tự động deploy lên AWS.

### Khái niệm đã nắm

- **Cloud computing** trade-off vs self-host.
- **AWS** lớn nhất, 200+ services. Region + AZ.
- **S3** = object storage, bucket + object + key.
- **AWS CLI** = tool gọi mọi service AWS qua command line.
- **IAM** = identity & access management. User, Group, Role, Policy.
- **Access Key + Secret Key** = credentials cho CLI (vs password cho UI).
- Static website hosting với S3: enable hosting + off block public + bucket policy.
- **`s3 sync --delete`** = idempotent deploy, bucket = source folder.

### Kỹ năng đã hành

- Đăng ký AWS account, bật MFA.
- Tạo S3 bucket qua UI.
- Cài AWS CLI vào Docker image custom.
- Tạo IAM user `jenkins` + policy `AmazonS3FullAccess`.
- Generate Access Key, lưu vào Jenkins Credentials.
- Dùng `withCredentials` block trong pipeline.
- Upload file qua `aws s3 cp`.
- Bật static website hosting + cấu hình bucket policy.
- Pipeline tự sync `build/` lên S3 mỗi commit.

### Pipeline kết quả

```text
Build → Run Tests (parallel) → Deploy & Test Staging (Netlify)
                              → Deploy & Test Prod (AWS S3)
```

Mỗi commit → tự động qua mọi stage, deploy lên AWS S3 production.

### Phase 5 → Phase 6

Phase 5 deploy **static website** (HTML/CSS/JS). Còn **app dynamic** (Node.js server, Python backend, microservices)?

→ Phase 6: deploy **Docker container** lên **AWS ECS** (Elastic Container Service):
- Push image lên **AWS ECR** (registry).
- Định nghĩa **Task Definition** + **Service** trong ECS.
- Pipeline build + push + update ECS service.
- Rolling update + rollback.

→ Hiểu Phase 6 = biết cách deploy hầu hết app modern lên production.

## Đọc thêm

- AWS Skill Builder: <https://skillbuilder.aws> — free training official.
- "AWS for the Busy IT Manager" — sách overview ngắn gọn.
- AWS Well-Architected Framework: 5 pillars cho production-grade AWS deployment.

---

→ **Sẵn sàng?** [Phase 6: Deploy container lên AWS ECS](../phase-6-deploy-len-aws-ecs/01-ecs-tong-quan.md)

(Bài 9 dưới là **optional** — EC2 + Nginx demo, không cần cho Phase 6.)

---

→ [Bài 9 (optional): EC2 và Nginx web server](09-ec2-va-nginx-optional.md)

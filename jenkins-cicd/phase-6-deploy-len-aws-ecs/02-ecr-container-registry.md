# Bài 2: ECR và AWS CLI Docker image

ECS chạy container nhưng phải có **image** trước. Image private — đẩy ở đâu? **ECR** (Elastic Container Registry). Bài này: setup ECR, custom AWS CLI image cho pipeline.

## Flow tổng quan deploy app riêng

```text
1. Viết Dockerfile cho project app
2. Build Docker image trong pipeline
3. Tag image với version cụ thể
4. Login ECR + push image
5. Update task definition reference image mới
6. Update ECS service → rolling deploy
```

→ Bài này lo bước 0 (chuẩn bị ECR + image cho CI), bài 3 lo bước 1-2 (Dockerfile + build), bài 4 lo bước 3-6.

## Vì sao cần ECR (không dùng Docker Hub)?

| Aspect           | Docker Hub             | ECR                            |
|------------------|------------------------|--------------------------------|
| Visibility       | Public mặc định        | Private mặc định               |
| Auth             | Username/password      | IAM (integrate AWS)            |
| Pull limit       | 200 pull/6h cho free   | Không giới hạn                  |
| Cost             | Free public, $5/user private | $0.10/GB/tháng + free 500 MB |
| Speed (from AWS) | OK                     | Faster (cùng region)           |

→ Phase 6 dùng **ECR** vì:
- Image private (app proprietary).
- Free tier 500 MB đủ học.
- Pull từ ECS region nhanh hơn Docker Hub.

## Tạo ECR repository

1. Console → search `ECR` → click.
2. Click **Get started** hoặc **Create repository**.

```text
Visibility:          ● Private   ○ Public
Repository name:     [learn-jenkins-app]    ← match tên app
Tag immutability:    ☐ Disabled (default)
Encryption:          AES-256 (default)
```

Best practice naming: 1 repo per app/service.

Click **Create repository**.

→ Repository created. URL có format:

```text
<aws-account-id>.dkr.ecr.us-east-1.amazonaws.com/learn-jenkins-app
```

Vd: `123456789012.dkr.ecr.us-east-1.amazonaws.com/learn-jenkins-app`.

**Copy URL** → sẽ paste vào Jenkinsfile.

## Cấu trúc URL ECR

```text
123456789012.dkr.ecr.us-east-1.amazonaws.com/learn-jenkins-app:1.0.42
↑               ↑       ↑          ↑                          ↑
account ID      service region    full account hostname       repo name + tag
```

Khác Docker Hub (`docker.io/library/<image>`). ECR phải dùng **full hostname**.

## Cấu trúc Dockerfile cho dự án (preview)

Bài 3 sẽ viết Dockerfile cho app. Preview:

```dockerfile
FROM nginx:1.26-alpine

COPY build/ /usr/share/nginx/html/
```

- Base = nginx (web server).
- Copy `build/` (output `npm run build`) vào folder nginx serve.

→ Image này = nginx + content website. Chạy → website lên port 80.

## Vấn đề: pipeline cần Docker để build + AWS CLI để push

```groovy
sh '''
    docker build -t my-image .       # Cần Docker CLI
    aws ecr get-login-password ...   # Cần AWS CLI
    docker push ...                  # Cần Docker CLI lại
'''
```

→ Pipeline stage cần **cả Docker và AWS CLI**. Image `amazon/aws-cli` chỉ có AWS CLI.

Có 3 lựa chọn:

### Lựa chọn 1: Cài Docker vào AWS CLI image runtime

```groovy
agent { docker { image 'amazon/aws-cli'; args '-u root --entrypoint=""' } }
steps {
    sh 'amazon-linux-extras install -y docker'    // Cài runtime mỗi build
    sh 'docker build ...'
}
```

→ Chậm (~30s cài Docker mỗi build).

### Lựa chọn 2: Cài AWS CLI vào Docker-in-Docker image

Image có sẵn cả 2. Phổ biến: `amazon/aws-cli + docker`. Nhưng official không có.

### Lựa chọn 3: Build custom image (Phase 4 style)

Tự build image có Docker + AWS CLI + JQ — push vào local Docker daemon.

→ **Khoá học chọn lựa chọn 3**. Một lần build, dùng mãi.

## Custom AWS CLI Docker image

Tạo file `ci/Dockerfile-aws-cli`:

```dockerfile
FROM amazon/aws-cli

RUN amazon-linux-extras install -y docker && \
    yum install -y jq

# Override entrypoint default = aws → để chạy lệnh shell bất kỳ
ENTRYPOINT [""]
```

Giải nghĩa:

- Base `amazon/aws-cli` (đã có AWS CLI v2).
- `amazon-linux-extras install -y docker` — cài Docker client trên Amazon Linux 2.
- `yum install -y jq` — JSON parser (sẽ dùng bài 4).
- `ENTRYPOINT [""]` — clear entrypoint default (xóa lệnh `aws` mặc định) để chạy `sh` bình thường.

> Image này chỉ có **Docker client**, không có **Docker daemon**. Pipeline sẽ mount `/var/run/docker.sock` để dùng daemon của Jenkins host (giống Phase 4 đã setup).

## Tổ chức Dockerfile

Project có 2 Dockerfile:

```text
project-root/
├── Dockerfile                  ← APP dockerfile (nginx + build)
├── ci/
│   ├── Dockerfile-playwright   ← Image cho CI test (Playwright + Netlify)
│   └── Dockerfile-aws-cli      ← Image cho CI AWS (Docker + AWS CLI + jq)
└── Jenkinsfile-nightly
```

- **Root** `Dockerfile` = build **app image** (deploy ECS).
- **`ci/`** chứa Dockerfile cho **CI tools** (không deploy).

→ Tách rõ purpose, dễ maintain.

## Update Jenkinsfile-nightly để build 2 image

```groovy
pipeline {
    agent any
    stages {
        stage('Build CI images') {
            steps {
                sh '''
                    docker build -t my-playwright -f ci/Dockerfile-playwright .
                    docker build -t my-aws-cli   -f ci/Dockerfile-aws-cli .
                '''
            }
        }
    }
}
```

- **`-f <path>`** chỉ định Dockerfile (vì không phải root + tên `Dockerfile`).
- **`.`** ở cuối = build context (root project).

Commit + push + trigger nightly job manual lần đầu để có image.

## Dùng `my-aws-cli` trong pipeline chính

Stage Deploy thay `amazon/aws-cli` bằng:

```groovy
stage('Deploy to AWS') {
    agent {
        docker {
            image 'my-aws-cli'
            args  '-u root -v /var/run/docker.sock:/var/run/docker.sock'
            reuseNode true
        }
    }
    steps {
        withCredentials([usernamePassword(
            credentialsId: 'my-aws',
            usernameVariable: 'AWS_ACCESS_KEY_ID',
            passwordVariable: 'AWS_SECRET_ACCESS_KEY'
        )]) {
            sh '''
                aws --version
                docker --version
                jq --version
            '''
        }
    }
}
```

Lưu ý quan trọng:

- **`-u root`** — Docker daemon cần root mount socket. Trade-off: file workspace tạo trong container thuộc root. Khoá chấp nhận.
- **`-v /var/run/docker.sock:/var/run/docker.sock`** — mount Docker socket host → container dùng Docker daemon host. Giống Phase 4.
- **`reuseNode true`** — sync workspace.

Push + Build Now → log:

```text
+ aws --version
aws-cli/2.15.30 ...
+ docker --version
Docker version 24.0.7
+ jq --version
jq-1.6
```

✓ 3 tool cùng có trong 1 container.

## Permission cần thêm cho ECR

IAM user `jenkins` Phase 5 chỉ có `AmazonS3FullAccess`. Push ECR cần thêm policy.

1. IAM Console → User `jenkins` → **Add permissions** → **Attach policies directly**.
2. Search `ECR` → tick **`AmazonEC2ContainerRegistryFullAccess`** + **`AmazonECS_FullAccess`** (cần luôn cho bài 4).
3. Save.

User `jenkins` giờ có 3 policies:

```text
AmazonS3FullAccess
AmazonEC2ContainerRegistryFullAccess
AmazonECS_FullAccess
```

→ Đủ cho mọi việc Phase 5-6.

> Production: hẹp hơn — chỉ cấp PUT/PULL cho **bucket cụ thể**, **repo cụ thể**. Khoá đơn giản hoá.

## Login + push ECR (chuẩn bị bài 3)

Pattern login ECR:

```bash
# 1. Lấy temporary password
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com

# 2. Tag image local với ECR URL
docker tag my-app:1.0.42 <account>.dkr.ecr.us-east-1.amazonaws.com/my-app:1.0.42

# 3. Push
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/my-app:1.0.42
```

3 lệnh:
1. `aws ecr get-login-password` — lấy temp password (12 giờ hiệu lực).
2. Pipe vào `docker login` qua stdin.
3. Tag image với full ECR URL.
4. Push.

→ Bài 3 implement full flow này.

## Pitfall

### Pitfall 1: Docker socket permission denied

```text
permission denied: /var/run/docker.sock
```

→ Quên `-u root` trong args. Add `-u root`.

### Pitfall 2: ENTRYPOINT không clear

Image `amazon/aws-cli` có ENTRYPOINT = `aws`. Build custom phải `ENTRYPOINT [""]` để chạy `sh` được.

### Pitfall 3: yum không tìm Docker

`amazon-linux-extras install docker` chỉ work trên Amazon Linux 2 (base của `amazon/aws-cli`). Nếu đổi base sang Ubuntu → khác cách cài.

### Pitfall 4: Tag image cho ECR

```bash
docker push my-app:1.0.42                          # ❌ Push đi đâu?
docker push <account>.dkr.ecr.../my-app:1.0.42     # ✓ Full URL
```

Docker biết push ECR vì URL có ECR hostname.

## Tóm tắt

- **ECR** = registry Docker private của AWS, tích hợp IAM.
- Tạo repository qua console → URL = `<account>.dkr.ecr.<region>.amazonaws.com/<repo>`.
- Pipeline cần cả Docker CLI + AWS CLI → build **custom image** `my-aws-cli`.
- Custom image phải `ENTRYPOINT [""]` để chạy `sh` được.
- Mount `/var/run/docker.sock` + `-u root` để container dùng Docker daemon host.
- Add policy **`AmazonEC2ContainerRegistryFullAccess`** + **`AmazonECS_FullAccess`** cho IAM user `jenkins`.
- Login ECR: `aws ecr get-login-password | docker login --username AWS --password-stdin <ecr-url>`.

---

→ [Bài tiếp theo: Cluster, Task Definition và Service](03-task-definition-va-service.md)

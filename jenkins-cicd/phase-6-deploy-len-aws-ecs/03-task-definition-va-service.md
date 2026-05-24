# Bài 3: Cluster, Task Definition và Service

Bài này deploy `nginx` (image public) lên ECS **manual qua UI** để hiểu flow. Sau đó viết Dockerfile cho app, build image, tag, push ECR.

## Phần 1: Deploy nginx lên ECS (warm-up manual)

Mục tiêu: hiểu **Cluster → Task Definition → Service** trước khi automation.

### Bước 1: Tạo Cluster

1. Console → ECS → **Clusters** → **Create cluster**.
2. Form:

```text
Cluster name:    learn-jenkins-app-cluster-prod
Infrastructure:  ● AWS Fargate (serverless)   ← chọn
                 ○ Amazon EC2 instances
                 ○ External instances using ECS Anywhere
```

3. **Create**.

→ Đợi 1-2 phút. Cluster status = **ACTIVE**.

Click vào cluster → tabs **Services** (0), **Tasks** (0), **Infrastructure**, **Metrics**, **Logs**. Empty.

### Bước 2: Tạo Task Definition

1. Sidebar **Task definitions** → **Create new task definition with JSON** (chọn JSON thay vì wizard để dễ versioning).

→ Form với JSON template. Edit:

```json
{
    "family": "learn-jenkins-app-task-definition-prod",
    "containerDefinitions": [
        {
            "name": "learn-jenkins-app",
            "image": "nginx:1.26-alpine",
            "portMappings": [
                {
                    "name": "nginx-80-tcp",
                    "containerPort": 80,
                    "hostPort": 80,
                    "protocol": "tcp",
                    "appProtocol": "http"
                }
            ],
            "essential": true
        }
    ],
    "requiresCompatibilities": ["FARGATE"],
    "networkMode": "awsvpc",
    "cpu": "256",
    "memory": "512"
}
```

Phần quan trọng:

- **`family`** — tên task definition. Mỗi revision dùng cùng family.
- **`containerDefinitions[]`** — list container. 1 task có thể có nhiều container.
  - **`name`** — tên container (logical).
  - **`image`** — Docker image. Phase này dùng `nginx:1.26-alpine` (public).
  - **`portMappings`** — port nào expose.
  - **`essential: true`** — nếu container này die, cả task die.
- **`requiresCompatibilities: ["FARGATE"]`** — chỉ chạy trên Fargate.
- **`networkMode: "awsvpc"`** — mỗi task có ENI (network interface) riêng (Fargate yêu cầu).
- **`cpu/memory`** — resource. Combo nhỏ nhất Fargate: 256 CPU + 512 MB.

> Memory phải có **đơn vị MB hoặc số** (không "0.5GB"). Nếu sai → error "Memory is invalid".

2. **Save** JSON này vào project: tạo folder `aws/`, file `aws/task-definition-prod.json` (sẽ dùng ở bài 4).

3. **Create** trong UI → task def created, revision 1.

### Bước 3: Tạo Service

Vào cluster `learn-jenkins-app-cluster-prod` → tab **Services** → **Create**.

```text
Compute options:        Capacity provider strategy (default)
Application type:       ● Service
Task definition family: learn-jenkins-app-task-definition-prod
Revision:               LATEST
Service name:           learn-jenkins-app-service-prod
Desired tasks:          1
```

**Create**. Đợi 1-2 phút → service status **ACTIVE** + 1 running task.

### Bước 4: Verify deployment

1. Click vào service → tab **Tasks** → click task ID.
2. Tab **Networking** → **Public IP** (vd `54.123.45.67`).
3. Click **Open address** trên browser → expect thấy "Welcome to nginx!".

→ Không thấy gì. Sao?

### Bước 5: Mở Security Group

→ Default Security Group block port 80 từ internet.

1. Trong task → **Networking** → click **Security group** → **Edit inbound rules** → **Add rule**.

```text
Type:        HTTP
Protocol:    TCP (auto)
Port range:  80 (auto)
Source:      Anywhere-IPv4 (0.0.0.0/0)
Description: Allow HTTP from anywhere
```

**Save rules**.

2. Refresh browser → thấy **Welcome to nginx!** ✅

→ Deploy thành công. ECS chạy container `nginx`, mở port 80 cho internet.

## Phần 2: Viết Dockerfile cho app

Giờ thay `nginx:1.26-alpine` bằng image chứa **app của bạn**.

### Dockerfile root project

Tạo `Dockerfile` (ở root, ngang `package.json`):

```dockerfile
FROM nginx:1.26-alpine

COPY build/ /usr/share/nginx/html/
```

Giải nghĩa:

- **Base** = `nginx:1.26-alpine` — nhỏ, có sẵn web server.
- **`COPY build/ /usr/share/nginx/html/`** — copy output của `npm run build` vào folder nginx serve.

→ Khi nginx start, serve content tại `/usr/share/nginx/html` lên port 80.

### Build local thử

```bash
npm ci
npm run build              # Tạo build/
docker build -t learn-jenkins-app:test .
docker run -p 8080:80 learn-jenkins-app:test
```

→ Mở `http://localhost:8080` → thấy website. ✓

## Phần 3: Build + tag + push trong pipeline

### Stage Build Docker image

```groovy
stage('Build Docker image') {
    agent {
        docker {
            image 'my-aws-cli'
            args  '-u root -v /var/run/docker.sock:/var/run/docker.sock'
            reuseNode true
        }
    }
    steps {
        sh '''
            set -euo pipefail
            docker build -t $APP_NAME:$REACT_APP_VERSION .
        '''
    }
}
```

Tag = `learn-jenkins-app:1.0.42` (kèm version từ build number).

> `APP_NAME` + `REACT_APP_VERSION` = env vars Phase 3-5 đã có. Bài này thêm `APP_NAME = 'learn-jenkins-app'`.

### Stage Push ECR

Thêm sau Build:

```groovy
stage('Push to ECR') {
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
                set -euo pipefail

                # Login ECR
                aws ecr get-login-password --region $AWS_DEFAULT_REGION | \
                    docker login --username AWS --password-stdin $AWS_DOCKER_REGISTRY

                # Tag image với ECR URL
                docker tag $APP_NAME:$REACT_APP_VERSION \
                           $AWS_DOCKER_REGISTRY/$APP_NAME:$REACT_APP_VERSION

                # Push
                docker push $AWS_DOCKER_REGISTRY/$APP_NAME:$REACT_APP_VERSION
            '''
        }
    }
}
```

### Env vars cần thêm

```groovy
environment {
    APP_NAME           = 'learn-jenkins-app'
    AWS_DOCKER_REGISTRY = '123456789012.dkr.ecr.us-east-1.amazonaws.com'   // ← Account ID của bạn
}
```

`AWS_DOCKER_REGISTRY` = **không có** repo name cuối (chỉ hostname). Repo name = `$APP_NAME` (vì tạo ECR repo trùng tên app).

## Phần 4: Update Task Definition tham chiếu image ECR

Update `aws/task-definition-prod.json`:

```json
{
    "family": "learn-jenkins-app-task-definition-prod",
    "executionRoleArn": "arn:aws:iam::123456789012:role/ecsTaskExecutionRole",
    "containerDefinitions": [
        {
            "name": "learn-jenkins-app",
            "image": "123456789012.dkr.ecr.us-east-1.amazonaws.com/learn-jenkins-app:#APP_VERSION#",
            "portMappings": [...]
        }
    ],
    ...
}
```

Thay đổi:

1. **`executionRoleArn`** — IAM role cho ECS pull image từ ECR. Tự sinh khi tạo task def đầu tiên qua UI; copy ARN từ revision cũ.
2. **`image`** = full ECR URL với **placeholder `#APP_VERSION#`** — bài 4 dùng `sed` thay bằng version thật trong pipeline.

> Placeholder pattern `#APP_VERSION#` (có ký tự đặc biệt) → unique, không nhầm với text khác trong JSON.

## Lưu ý trade-off: tag image

Cách hiện tại: tag = build number Jenkins (`1.0.42`). Trade-off:

- ✓ Unique mỗi build.
- ✓ Trace được build nào sinh image nào.
- ✗ Không tận dụng được "rebuild same code = same image" (mỗi build = tag mới dù code không đổi).

Production thường:
- Tag bằng **git commit SHA** (`abc123def`) → unique mà reproducible.
- Hoặc tag bằng **semver** (`v1.2.3`) + commit hash.

Khoá học giữ build number cho đơn giản.

## Pitfall

### Pitfall 1: ECR repo chưa tồn tại

```text
denied: repository does not exist
```

→ Tạo ECR repo trước (Phase 6 bài 2) với tên trùng `APP_NAME`.

### Pitfall 2: Permission ECR push

```text
no basic auth credentials
```

→ Quên `aws ecr get-login-password | docker login`. Login phải chạy **trước** push trong cùng shell session.

### Pitfall 3: Network mode

```text
RequiresCompatibilitiesError
```

→ Fargate yêu cầu `networkMode: "awsvpc"` + `requiresCompatibilities: ["FARGATE"]` trong task def.

### Pitfall 4: Memory format

```text
Memory is invalid for this task
```

→ Memory chỉ chấp nhận **số** ("512"), không "512MB" / "0.5GB".

### Pitfall 5: Security Group block

Deploy xong nhưng browser 404 / timeout. → Security Group default block. Add inbound rule HTTP 80.

## Tóm tắt

- ECS cluster cấp **Fargate** đơn giản hơn EC2.
- Task Definition là **JSON blueprint** — versioned, family + revision.
- Service ensure N task chạy, auto-restart.
- Tạo qua UI lần đầu để hiểu UI; production dùng JSON file + CLI.
- App Dockerfile: `FROM nginx + COPY build/`. Đơn giản nhưng đủ.
- Pipeline: Build image → Login ECR → Tag với full URL → Push.
- Task Definition image = full ECR URL với placeholder `#APP_VERSION#`.
- Cần policy `AmazonEC2ContainerRegistryFullAccess` cho user IAM.

---

→ [Bài tiếp theo: Pipeline tự động deploy ECS](04-pipeline-deploy-ecs.md)

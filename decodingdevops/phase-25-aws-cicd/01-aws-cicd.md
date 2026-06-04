# Bài 1: AWS CI/CD project — Pipeline end-to-end trên AWS

Đây là capstone project (dự án tổng kết): build pipeline **GitHub → Test → SonarCloud → Build → ECR → ECS** dùng CodePipeline native AWS.

## Architecture (Sơ đồ kiến trúc)

```text
                Developer
                    │
                    │ git push
                    ▼
                 GitHub
                    │ webhook
                    ▼
              CodePipeline
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
   CodeBuild   CodeBuild    CodeDeploy
   (test)      (build .war)  (deploy ECS)
                    │
                    ▼
             ECR (image)
                    │
                    ▼
              ECS Service
                (Fargate)
                    │
                    ▼
                 ALB (HTTPS)
                    │
                    ▼
                  Users
```

## Các service AWS CodePipeline

| Service | Mục đích | Equivalent ngoài AWS |
|---|---|---|
| **CodeCommit** | Git host | GitHub, GitLab |
| **CodeBuild** | Build server | Jenkins build agent |
| **CodeArtifact** | Artifact repo | Nexus, Artifactory |
| **CodeDeploy** | Deploy automation (Blue/Green, Rolling) | Custom script |
| **CodePipeline** | Orchestrator | Jenkins pipeline |

→ Có thể replace từng phần (vd: dùng GitHub thay CodeCommit, Jenkins thay CodeBuild — kết hợp tuỳ ý).

## Bước 1: Source stage — GitHub

CodePipeline trigger từ GitHub qua webhook.

CodePipeline UI → Create pipeline → Source:
- Provider: **GitHub (Version 2)**.
- Connect GitHub account.
- Repository: `acme/vprofile`.
- Branch: `main`.
- Output artifact: source code.

Mỗi push lên main → pipeline tự chạy.

## Bước 2: Build stage — CodeBuild

CodeBuild = Jenkins build agent nhưng được AWS quản hộ.

### buildspec.yml

```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      java: corretto17
    commands:
      - echo "Installing dependencies..."

  pre_build:
    commands:
      - echo "Running tests..."
      - mvn test
      - mvn sonar:sonar \
          -Dsonar.host.url=https://sonarcloud.io \
          -Dsonar.organization=acme \
          -Dsonar.projectKey=vprofile \
          -Dsonar.login=$SONAR_TOKEN

  build:
    commands:
      - echo "Building .war..."
      - mvn package -DskipTests

      - echo "Logging into ECR..."
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI

      - echo "Building Docker image..."
      - docker build -t vprofile:$CODEBUILD_RESOLVED_SOURCE_VERSION .
      - docker tag vprofile:$CODEBUILD_RESOLVED_SOURCE_VERSION $ECR_URI/vprofile:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker tag vprofile:$CODEBUILD_RESOLVED_SOURCE_VERSION $ECR_URI/vprofile:latest

      - echo "Pushing to ECR..."
      - docker push $ECR_URI/vprofile:$CODEBUILD_RESOLVED_SOURCE_VERSION
      - docker push $ECR_URI/vprofile:latest

  post_build:
    commands:
      - echo "Creating image definitions..."
      - printf '[{"name":"tomcat","imageUri":"%s"}]' $ECR_URI/vprofile:$CODEBUILD_RESOLVED_SOURCE_VERSION > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
    - appspec.yml

reports:
  surefire:
    files:
      - target/surefire-reports/*.xml
    file-format: JUNITXML
```

### Setup CodeBuild project

Console → CodeBuild → Create:
- Name: `vprofile-build`.
- Source: do CodePipeline cung cấp.
- Environment: Amazon Linux 2, Standard runtime, bật **privileged mode** (cho Docker build).
- Service role: cấp quyền push ECR, read/write S3.
- Buildspec: lấy từ source code.

Env variables cần set:
- `SONAR_TOKEN` (encrypted, lấy từ Parameter Store).
- `ECR_URI`: `123.dkr.ecr.us-east-1.amazonaws.com`.

## Bước 3: ECR — Image registry

```bash
# Tạo repo
aws ecr create-repository --repository-name vprofile

# Lấy URI
aws ecr describe-repositories --repository-names vprofile \
    --query 'repositories[0].repositoryUri' --output text
# 123.dkr.ecr.us-east-1.amazonaws.com/vprofile
```

ECR có vulnerability scan built-in:

```bash
aws ecr put-image-scanning-configuration \
    --repository-name vprofile \
    --image-scanning-configuration scanOnPush=true
```

→ Mỗi lần push image → scan tự động → kết quả hiển thị trong ECR console.

## Bước 4: ECS — Target deploy

### Task definition

`taskdef.json`:

```json
{
    "family": "vprofile",
    "networkMode": "awsvpc",
    "executionRoleArn": "arn:aws:iam::123:role/ecsTaskExecutionRole",
    "taskRoleArn": "arn:aws:iam::123:role/vprofile-task",
    "containerDefinitions": [{
        "name": "tomcat",
        "image": "123.dkr.ecr.us-east-1.amazonaws.com/vprofile:latest",
        "portMappings": [{"containerPort": 8080}],
        "essential": true,
        "environment": [
            {"name": "DB_HOST", "value": "vprofile-rds.xxx.rds.amazonaws.com"}
        ],
        "secrets": [
            {
                "name": "DB_PASSWORD",
                "valueFrom": "arn:aws:secretsmanager:us-east-1:123:secret:prod/db/password"
            }
        ],
        "logConfiguration": {
            "logDriver": "awslogs",
            "options": {
                "awslogs-group": "/ecs/vprofile",
                "awslogs-region": "us-east-1",
                "awslogs-stream-prefix": "ecs"
            }
        },
        "healthCheck": {
            "command": ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"],
            "interval": 30,
            "timeout": 5,
            "retries": 3,
            "startPeriod": 60
        }
    }],
    "requiresCompatibilities": ["FARGATE"],
    "cpu": "512",
    "memory": "1024"
}
```

Register:

```bash
aws ecs register-task-definition --cli-input-json file://taskdef.json
```

### Service

```bash
aws ecs create-service \
    --cluster vprofile-cluster \
    --service-name vprofile \
    --task-definition vprofile \
    --desired-count 2 \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx,subnet-yyy],securityGroups=[sg-xxx]}" \
    --load-balancers "targetGroupArn=arn:...,containerName=tomcat,containerPort=8080" \
    --deployment-controller type=ECS \
    --health-check-grace-period-seconds 120
```

ECS service làm:
- Maintain 2 task chạy liên tục.
- Auto-restart task bị unhealthy.
- ALB ở phía trước (target group).
- Rolling deploy khi update.

## Bước 5: Deploy stage — CodePipeline

CodePipeline stage:
- Provider: **Amazon ECS**.
- Cluster: `vprofile-cluster`.
- Service: `vprofile`.
- Image definitions file: `imagedefinitions.json` (output từ buildspec).

Khi deploy:
1. CodePipeline đọc `imagedefinitions.json`.
2. Update ECS service với image mới.
3. ECS rolling deploy: launch task mới → chờ healthy → kill task cũ.

## Bước 6: Blue/Green deploy với CodeDeploy

Rolling deploy có thể gây partial outage (một số request lỗi). Blue/Green an toàn hơn:

```text
Trước khi deploy:
  ALB → Target Group Blue (current) ← 100% traffic

Trong khi deploy:
  Launch task mới vào Target Group Green
  Chờ green healthy
  ALB switch → Green
  Drain blue (5 phút)
  Terminate blue
```

`appspec.yml`:

```yaml
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: <TASK_DEFINITION>
        LoadBalancerInfo:
          ContainerName: "tomcat"
          ContainerPort: 8080
```

CodeDeploy hỗ trợ các chiến lược:
- **Linear**: shift % traffic dần dần.
- **Canary**: 10% → chờ → 100%.
- **All-at-once**: switch ngay lập tức.

## Bước 7: Pipeline hoàn chỉnh

CodePipeline cuối cùng:

```text
[Source]
GitHub: acme/vprofile main
        │
        ▼
[Build]
CodeBuild: vprofile-build
  - Test
  - Sonar
  - Build .war + Docker
  - Push ECR
        │
        ▼
[Approval] ← review thủ công cho prod
        │
        ▼
[Deploy-Staging]
CodeDeploy → ECS staging service
        │
        ▼
[SmokeTest]
CodeBuild: curl /health
        │
        ▼
[Approval-Prod] ← thủ công
        │
        ▼
[Deploy-Production]
CodeDeploy → ECS prod service (Blue/Green)
```

## Monitoring pipeline

CloudWatch dashboards:
- Pipeline success/fail rate.
- Build duration.
- Deploy frequency (DORA metric — Deployment Frequency).

CloudWatch alarms:
- Build fail → SNS → Slack.
- Deploy fail → PagerDuty.

CloudWatch Events:
- Pipeline state change → Lambda → update ticket (Jira, Linear).

## Cost breakdown (ước tính)

| Service | Cost / tháng |
|---|---|
| CodePipeline | $1/pipeline/tháng + free các stage cơ bản |
| CodeBuild | $0.005/phút (Linux) ≈ $10-20 |
| ECR | $0.10/GB/tháng |
| ECS Fargate | 2 task × 0.5 vCPU × 1 GB ≈ $25 |
| ALB | $20 |
| RDS Multi-AZ | $30 |
| ElastiCache | $12 |
| CloudWatch logs | $0.50/GB/tháng |
| **Total** | **~$110/tháng** |

So với Jenkins self-host: cost tương đương nhưng zero ops (không phải tự vận hành Jenkins server).

## So sánh các option CI/CD

| | CodePipeline | Jenkins | GitHub Actions |
|---|---|---|---|
| Setup time | 30 phút | 2 giờ | 10 phút |
| Cost | Trả theo build | EC2 + chi phí ops | Free 2000 phút |
| AWS integration | Native | Plugin | OIDC role |
| Lock-in | AWS | Không | GitHub |
| UI | OK | Cũ | Modern |
| Marketplace | AWS native | 1800 plugin | 20000+ action |

AWS CodePipeline phù hợp khi:
- Toàn bộ stack đã trên AWS.
- Team không muốn quản Jenkins (no-ops).
- Compliance yêu cầu audit trail AWS-native.

## IaC Pipeline với Terraform

Terraform module `aws-cicd`:

```hcl
module "vprofile_cicd" {
  source = "./modules/cicd"

  app_name     = "vprofile"
  github_repo  = "acme/vprofile"
  github_branch = "main"

  ecs_cluster  = aws_ecs_cluster.main.name
  ecs_service  = aws_ecs_service.app.name

  build_env_vars = {
    SONAR_TOKEN = aws_ssm_parameter.sonar_token.arn
    ECR_URI     = aws_ecr_repository.app.repository_url
  }
}
```

Sau `terraform apply` → toàn bộ pipeline + ECR + IAM role + permission được tạo tự động.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Buildspec sai syntax | Build fail | Validate locally trước khi commit |
| CodeBuild thiếu IAM permission | Push ECR fail | Attach role đầy đủ |
| Privileged mode chưa bật | Docker build fail | Enable trong environment config |
| ECS service không có health grace period | Task bị kill trước khi ready | `--health-check-grace-period-seconds 60+` |
| Manual approval không timeout | Pipeline stuck mãi | Set timeout hợp lý (1h, 24h) |
| Dùng tag `latest` | Không rollback được | Tag bằng git SHA |
| Quên CloudWatch log retention | Disk đầy + cost lớn | Set retention 30 ngày |

## Tổng kết phase 25

Đã build được:
- End-to-end CI/CD pipeline AWS-native.
- Flow: GitHub → Test → Sonar → Build → ECR → ECS deploy.
- Blue/Green deployment với CodeDeploy.
- Monitoring + alerting CloudWatch.
- IaC qua Terraform.

vProfile sau section này = **production-grade SaaS** trên AWS.

## Tóm tắt bài 1

- **CodePipeline** orchestrate các stage: Source → Build → Deploy.
- **CodeBuild** = managed build server với `buildspec.yml`.
- **ECR** registry với image scan built-in.
- **ECS Fargate** = serverless container, ALB ở phía trước.
- **CodeDeploy Blue/Green** = zero-downtime deploy.
- Cost ~$110/tháng cho stack production-grade.
- Có thể replace từng phần với Jenkins / GitHub Actions tuỳ preference.

**Phase kế tiếp** → [Phase 26 — Bài 1: GCP và multi-cloud](../phase-26-gcp/01-gcp-overview.md)

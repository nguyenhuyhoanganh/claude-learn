# Bài 1: AWS CI/CD project — end-to-end pipeline trên AWS

Capstone project: build pipeline **GitHub → Test → SonarCloud → Build → ECR → ECS** với CodePipeline native AWS.

## Architecture

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

## AWS CodePipeline services

| Service | Mục đích |
|---|---|
| **CodeCommit** | Git host (alternative GitHub) |
| **CodeBuild** | Build server (alternative Jenkins build agent) |
| **CodeArtifact** | Artifact repo (alternative Nexus) |
| **CodeDeploy** | Deploy automation (Blue/Green, Rolling) |
| **CodePipeline** | Orchestrator |

Có thể replace tool-by-tool: pipeline tổng hợp dùng cái nào tuỳ thuộc.

## Bước 1: Source stage — GitHub

CodePipeline trigger từ GitHub via webhook.

CodePipeline UI → Create pipeline → Source:
- Provider: **GitHub (Version 2)**.
- Connect GitHub account.
- Repository: `acme/vprofile`.
- Branch: `main`.
- Output artifact: source code.

Mỗi push main → pipeline auto-run.

## Bước 2: Build stage — CodeBuild

CodeBuild = Jenkins build agent managed.

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
- Source: CodePipeline managed.
- Environment: Amazon Linux 2, Standard runtime, **privileged** (cho Docker).
- Service role: cho phép ECR push, S3 read/write.
- Buildspec: từ source code.

Env variables:
- `SONAR_TOKEN` (encrypted, from Parameter Store).
- `ECR_URI`: `123.dkr.ecr.us-east-1.amazonaws.com`.

## Bước 3: ECR — image registry

```bash
# Create repo
aws ecr create-repository --repository-name vprofile

# Get URI
aws ecr describe-repositories --repository-names vprofile \
    --query 'repositories[0].repositoryUri' --output text
# 123.dkr.ecr.us-east-1.amazonaws.com/vprofile
```

ECR scan vulnerability built-in:

```bash
aws ecr put-image-scanning-configuration \
    --repository-name vprofile \
    --image-scanning-configuration scanOnPush=true
```

Push image → scan tự động → results visible in ECR console.

## Bước 4: ECS — deploy target

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

ECS service:
- Maintain 2 task running.
- Auto-restart unhealthy.
- ALB front (target group).
- Rolling deploy on update.

## Bước 5: Deploy stage — CodePipeline

CodePipeline stage:
- Provider: **Amazon ECS**.
- Cluster: `vprofile-cluster`.
- Service: `vprofile`.
- Image definitions file: `imagedefinitions.json` (từ buildspec output).

Khi deploy:
1. CodePipeline đọc `imagedefinitions.json`.
2. Update ECS service với image mới.
3. ECS rolling deploy: launch task mới → wait healthy → kill task cũ.

## Bước 6: Blue/Green với CodeDeploy

Rolling deploy có thể gây partial outage. Blue/Green tốt hơn:

```text
Before:
  ALB → Target Group Blue (current) ← 100% traffic

Deploy:
  Launch task mới vào Target Group Green
  Wait green healthy
  ALB switch → Green
  Drain blue (5 min)
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

CodeDeploy support:
- **Linear**: gradually shift % traffic.
- **Canary**: 10% → wait → 100%.
- **All-at-once**: instant switch.

## Bước 7: Pipeline complete

CodePipeline final:

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
[Approval] ← manual review for prod
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
[Approval-Prod] ← manual
        │
        ▼
[Deploy-Production]
CodeDeploy → ECS prod service (Blue/Green)
```

## Monitoring pipeline

CloudWatch dashboards:
- Pipeline success/fail rate.
- Build duration.
- Deploy frequency (DORA metric).

CloudWatch alarms:
- Build fail → SNS Slack.
- Deploy fail → PagerDuty.

CloudWatch Events:
- Pipeline state change → Lambda → update ticket.

## Cost breakdown approximation

| Service | Cost (monthly) |
|---|---|
| CodePipeline | $1/pipeline/month + free ops |
| CodeBuild | $0.005/minute (Linux) ≈ $10-20 |
| ECR | $0.10/GB/month |
| ECS Fargate | 2 task × 0.5 vCPU × 1 GB ≈ $25 |
| ALB | $20 |
| RDS Multi-AZ | $30 |
| ElastiCache | $12 |
| CloudWatch logs | $0.50/GB/month |
| **Total** | **~$110/month** |

So với Jenkins self-host: tương đương cost nhưng zero ops.

## Comparison CI/CD options

| | CodePipeline | Jenkins | GitHub Actions |
|---|---|---|---|
| Setup time | 30 min | 2 hours | 10 min |
| Cost | Pay per build | EC2 + ops | Free 2k min |
| AWS integration | Native | Plugin | OIDC role |
| Lock-in | AWS | None | GitHub |
| UI | OK | Old | Modern |
| Marketplace | AWS native | 1800 plugin | 20000+ action |

AWS CodePipeline tốt khi:
- Toàn stack AWS.
- Team không muốn quản Jenkins.
- Compliance cần audit trail AWS native.

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

`terraform apply` → toàn bộ pipeline + ECR + IAM role + permission.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Buildspec lỗi syntax | Build fail | Validate locally trước commit |
| CodeBuild thiếu IAM permission | Build fail (push ECR) | Attach proper role |
| Privileged mode tắt | Docker build fail | Enable trong environment |
| ECS service không có health grace | Task killed before ready | `--health-check-grace-period-seconds 60+` |
| Manual approval timeout | Pipeline stuck | Set timeout reasonable (1h, 24h) |
| Image tag `latest` mãi | Không rollback được | Tag với git SHA |
| Quên CloudWatch log retention | Disk + cost | Set 30d retention |

## Tổng kết phase 25

Đã build:
- End-to-end CI/CD pipeline AWS-native.
- GitHub → Test → Sonar → Build → ECR → ECS deploy.
- Blue/Green deployment với CodeDeploy.
- Monitoring + alerting CloudWatch.
- IaC qua Terraform.

vProfile sau section này = **production-grade SaaS** trên AWS.

## Tóm tắt bài 1

- **CodePipeline** orchestrate stage: Source → Build → Deploy.
- **CodeBuild** = managed build server với `buildspec.yml`.
- **ECR** registry với image scan built-in.
- **ECS Fargate** = serverless container, ALB front.
- **CodeDeploy Blue/Green** = zero-downtime deploy.
- Cost ~$110/month cho stack production-grade.
- Replace từng phần với Jenkins/GitHub Actions tùy preference.

**Phase kế tiếp** → [Phase 26 — Bài 1: GCP và multi-cloud](../phase-26-gcp/01-gcp-overview.md)

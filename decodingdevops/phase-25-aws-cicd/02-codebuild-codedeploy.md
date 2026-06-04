# Bài 2: CodeBuild + CodeDeploy chi tiết

Bài 1 đã overview AWS CI/CD stack. Bài này deep-dive vào **CodeBuild** (build server được AWS quản lý hộ) và **CodeDeploy** (các chiến lược triển khai).

## CodeBuild

### Khái niệm

> CodeBuild = build server **managed** (do AWS vận hành hộ). Không cần tự maintain Jenkins. Trả phí theo phút build.

Đặc điểm chính:
- Container-based (chạy build trong container).
- Hỗ trợ Linux và Windows.
- Cho phép dùng custom Docker image làm môi trường build.
- Cho phép concurrent build (chạy nhiều build song song).
- Lambda-backed cho job nhỏ (rẻ hơn nhiều so với EC2-backed).

### buildspec.yml — định nghĩa các bước build

Đây là file declare toàn bộ quy trình build cho project:

```yaml
version: 0.2

env:
  variables:
    ENVIRONMENT: production
  parameter-store:
    NEXUS_USER: /vprofile/prod/nexus/user
    NEXUS_PASS: /vprofile/prod/nexus/password
  secrets-manager:
    SONAR_TOKEN: prod/sonar:token
  exported-variables:
    - BUILD_VERSION

phases:
  install:
    runtime-versions:
      java: corretto17
    commands:
      - echo "Installing dependencies..."
      - apt-get update && apt-get install -y jq

  pre_build:
    commands:
      - export BUILD_VERSION=$(date +%Y%m%d)-${CODEBUILD_RESOLVED_SOURCE_VERSION:0:7}
      - echo "Building version $BUILD_VERSION"
      - aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI

  build:
    commands:
      - echo "Running tests..."
      - mvn test
      - echo "Building artifact..."
      - mvn package -DskipTests
      - echo "Building Docker image..."
      - docker build -t vprofile:$BUILD_VERSION .
      - docker tag vprofile:$BUILD_VERSION $ECR_URI/vprofile:$BUILD_VERSION
      - docker tag vprofile:$BUILD_VERSION $ECR_URI/vprofile:latest

  post_build:
    commands:
      - echo "Pushing image..."
      - docker push $ECR_URI/vprofile:$BUILD_VERSION
      - docker push $ECR_URI/vprofile:latest
      - printf '[{"name":"tomcat","imageUri":"%s"}]' "$ECR_URI/vprofile:$BUILD_VERSION" > imagedefinitions.json

reports:
  junit_reports:
    files:
      - 'target/surefire-reports/*.xml'
    file-format: JUNITXML

artifacts:
  files:
    - imagedefinitions.json
    - appspec.yml
    - taskdef.json
  discard-paths: yes

cache:
  paths:
    - '/root/.m2/**/*'
```

### Cấu hình biến môi trường (Environment variables)

```yaml
env:
  variables:                 # Plain — giá trị trực tiếp
    KEY: value
  parameter-store:           # Pull từ AWS SSM Parameter Store khi build bắt đầu
    DB_HOST: /prod/db/host
  secrets-manager:           # Pull từ AWS Secrets Manager
    API_KEY: prod/api:key
```

→ Không hardcode secret vào buildspec — luôn lấy từ SSM hoặc Secrets Manager.

### Build environment (Môi trường build)

Khi tạo CodeBuild project trong Console → CodeBuild → Project → Environment, cấu hình:

- **Image**: Image managed sẵn (vd: `aws/codebuild/standard:7.0`) hoặc custom image từ ECR.
- **Compute** (tài nguyên): Small (3 GB RAM), Medium (7 GB), Large (15 GB), hoặc Lambda.
- **Service role**: IAM role cấp quyền truy cập ECR, S3, SSM.
- **Privileged mode**: bật khi cần Docker build (vì Docker-in-Docker yêu cầu).

### CodeBuild custom image — tăng tốc build

Tạo image build có sẵn các tool cần thiết để không phải cài lại mỗi build:

```dockerfile
FROM public.ecr.aws/codebuild/amazonlinux2-x86_64-standard:5.0

RUN yum install -y jq curl docker-buildx \
    && curl -fsSL https://get.docker.com | sh

USER codebuild-user
```

```bash
docker build -t my-codebuild-image .
docker push 123.dkr.ecr.us-east-1.amazonaws.com/my-codebuild:latest
```

Cách dùng:
- Trong Project → Environment → chọn "Custom image" → trỏ vào ECR URI.
- Build nhanh hơn (vì tool đã được pre-installed).

### Local build với codebuild-agent

Cho phép test buildspec ngay tại máy local — không cần tạo CodeBuild project và chờ pipeline:

```bash
# Cài codebuild-local agent
curl -fsSL https://raw.githubusercontent.com/aws/aws-codebuild-docker-images/master/local_builds/codebuild_build.sh -o codebuild_build.sh
chmod +x codebuild_build.sh

# Chạy build cục bộ
./codebuild_build.sh \
    -i aws/codebuild/standard:7.0 \
    -a /tmp/artifacts \
    -s . \
    -e .env
```

Debug buildspec ngay tại local trước khi commit lên repo — tiết kiệm rất nhiều thời gian.

### Lambda compute (nhanh + rẻ)

Cho build nhỏ (< 15 phút, < 10 GB RAM):

```yaml
ComputeType: BUILD_LAMBDA_2GB    # hoặc 4GB, 8GB, 10GB
```

Cold start ~1 giây, rẻ hơn nhiều so với EC2-backed CodeBuild. Phù hợp cho build nhỏ chạy thường xuyên.

### Concurrency + queue + cache

**Service quota mặc định**: 1 concurrent build/project. Cần request tăng quota nếu muốn nhiều build song song.

**Các loại cache** giúp tăng tốc build:
- **S3 cache**: Download file đã cache khi build bắt đầu.
- **Local cache** (trong container): Khai báo qua `cache: paths:` trong buildspec.
- **EFS** cho cache lớn cần persist lâu dài.

## CodeDeploy

### Khái niệm

> CodeDeploy = service tự động hoá deployment. Hỗ trợ deploy lên EC2, ECS, Lambda.

### Deployment groups (Nhóm máy được deploy)

```bash
aws deploy create-deployment-group \
    --application-name vprofile \
    --deployment-group-name production \
    --service-role-arn arn:aws:iam::123:role/CodeDeployRole \
    --auto-scaling-groups vprofile-asg \
    --deployment-config-name CodeDeployDefault.OneAtATime \
    --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM
```

### Deployment configurations (Cấu hình triển khai)

**Cho EC2 / On-Premises:**
- `OneAtATime` — deploy từng instance một (an toàn nhất, chậm nhất).
- `HalfAtATime` — deploy 50% instance cùng lúc.
- `AllAtOnce` — deploy song song toàn bộ (nhanh nhất, rủi ro cao nhất).
- Custom: theo % tuỳ chọn.

**Cho Lambda:**
- `Linear10PercentEvery1Minute` — chuyển 10% traffic mỗi phút.
- `Canary10Percent5Minutes` — 10% trong 5 phút đầu, sau đó 100%.
- `AllAtOnce`.

**Cho ECS:**
- `Linear10PercentEvery1Minute`.
- `Canary10Percent5Minutes`.
- `AllAtOnce`.

### appspec.yml — EC2

```yaml
version: 0.0
os: linux
files:
  - source: /target/vprofile.war
    destination: /opt/tomcat/webapps/
permissions:
  - object: /opt/tomcat/webapps/vprofile.war
    owner: tomcat
    group: tomcat
    mode: 644
hooks:
  ApplicationStop:
    - location: scripts/stop_tomcat.sh
      timeout: 60
      runas: root
  BeforeInstall:
    - location: scripts/backup.sh
      timeout: 30
  AfterInstall:
    - location: scripts/configure.sh
  ApplicationStart:
    - location: scripts/start_tomcat.sh
  ValidateService:
    - location: scripts/health_check.sh
      timeout: 300
```

Các hook chạy **theo thứ tự**. Nếu 1 hook fail → CodeDeploy tự động rollback toàn bộ.

`scripts/health_check.sh` — ví dụ health check script:

```bash
#!/bin/bash
for i in {1..30}; do
    if curl -fsS http://localhost:8080/health > /dev/null; then
        echo "Service healthy"
        exit 0
    fi
    sleep 10
done
echo "Health check failed"
exit 1
```

### appspec.yml — ECS Blue/Green

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
        PlatformVersion: "LATEST"
Hooks:
  - BeforeInstall: "BeforeInstallHookFn"
  - AfterInstall: "AfterInstallHookFn"
  - AfterAllowTestTraffic: "TestTrafficHookFn"
  - BeforeAllowTraffic: "BeforeProductionHookFn"
  - AfterAllowTraffic: "AfterProductionHookFn"
```

**ECS Blue/Green flow:**
1. Deploy task definition mới → green ECS service (môi trường mới).
2. Test traffic vào green (qua test listener — không ảnh hưởng prod).
3. Chuyển production traffic sang green.
4. Drain (rút) traffic khỏi blue (môi trường cũ).
5. Optionally terminate blue (hoặc giữ lại để rollback nhanh).

### appspec.yml — Lambda

```yaml
version: 0.0
Resources:
  - myFunction:
      Type: AWS::Lambda::Function
      Properties:
        Name: hello
        Alias: live
        CurrentVersion: 1
        TargetVersion: 2
Hooks:
  - BeforeAllowTraffic: "preTrafficHookFn"
  - AfterAllowTraffic: "postTrafficHookFn"
```

CodeDeploy shift dần traffic của alias sang version mới. Pre-traffic hook là Lambda function test version mới trước khi chuyển traffic.

### Triggers + monitoring (Cảnh báo và monitor)

```bash
aws deploy create-deployment-group ... \
    --trigger-configurations '[{
        "triggerName": "DeploymentEvents",
        "triggerTargetArn": "arn:aws:sns:us-east-1:123:deployments",
        "triggerEvents": [
            "DeploymentStart",
            "DeploymentSuccess",
            "DeploymentFailure",
            "DeploymentRollback"
        ]
    }]' \
    --alarm-configuration '{
        "enabled": true,
        "alarms": [{
            "name": "vprofile-high-error-rate"
        }]
    }'
```

Khi CloudWatch alarm trigger (vd: error rate cao đột biến) → CodeDeploy auto-rollback. Đây là cơ chế bảo vệ production cực kỳ hiệu quả.

## CodeDeploy + Lambda canary — ví dụ thực tế

```python
# preTrafficHook.py — test version mới trước khi chuyển traffic
import boto3
import json

codedeploy = boto3.client("codedeploy")
lambda_client = boto3.client("lambda")

def handler(event, context):
    deployment_id = event["DeploymentId"]
    lifecycle_event_hook_execution_id = event["LifecycleEventHookExecutionId"]

    try:
        # Invoke version mới với test payload
        new_version = "vprofile-app:2"
        resp = lambda_client.invoke(
            FunctionName=new_version,
            InvocationType="RequestResponse",
            Payload=json.dumps({"test": True})
        )

        if resp["StatusCode"] != 200:
            raise Exception("Test invocation failed")

        # Báo CodeDeploy: test thành công → tiếp tục
        codedeploy.put_lifecycle_event_hook_execution_status(
            deploymentId=deployment_id,
            lifecycleEventHookExecutionId=lifecycle_event_hook_execution_id,
            status="Succeeded"
        )
    except Exception as e:
        codedeploy.put_lifecycle_event_hook_execution_status(
            deploymentId=deployment_id,
            lifecycleEventHookExecutionId=lifecycle_event_hook_execution_id,
            status="Failed"
        )
        raise
```

## Pipeline đầy đủ cho vProfile — tích hợp toàn stack

### Stack diagram

```text
GitHub push
    │ webhook
    ▼
CodePipeline
    │
    ▼
Source stage: GitHub action
    │
    ▼
Build stage: CodeBuild
  - mvn test
  - mvn package
  - docker build + push ECR
  - Output: imagedefinitions.json
    │
    ▼
Test stage: CodeBuild (smoke + integration test)
    │
    ▼
Deploy Staging stage: ECS deploy action
  - Update ECS service ở staging
    │
    ▼
Manual Approval (cần phê duyệt thủ công)
    │
    ▼
Deploy Production stage: CodeDeploy Blue/Green
  - Deploy lên green ECS
  - Chạy pre-traffic hook
  - Shift 10% → đợi 5 phút → 100%
  - Drain blue
    │
    ▼
Post-deploy stage: Verify CloudWatch alarm
```

### CodePipeline YAML (qua CloudFormation)

```yaml
Resources:
  Pipeline:
    Type: AWS::CodePipeline::Pipeline
    Properties:
      RoleArn: !GetAtt PipelineRole.Arn
      ArtifactStore:
        Type: S3
        Location: !Ref ArtifactBucket
      Stages:
        - Name: Source
          Actions:
            - Name: GitHub
              ActionTypeId:
                Category: Source
                Owner: AWS
                Provider: CodeStarSourceConnection
                Version: '1'
              Configuration:
                ConnectionArn: !Ref GitHubConnection
                FullRepositoryId: acme/vprofile
                BranchName: main
              OutputArtifacts:
                - Name: source

        - Name: Build
          Actions:
            - Name: Build
              ActionTypeId:
                Category: Build
                Owner: AWS
                Provider: CodeBuild
                Version: '1'
              Configuration:
                ProjectName: !Ref BuildProject
              InputArtifacts:
                - Name: source
              OutputArtifacts:
                - Name: build_output

        - Name: DeployStaging
          Actions:
            - Name: DeployStaging
              ActionTypeId:
                Category: Deploy
                Owner: AWS
                Provider: ECS
                Version: '1'
              Configuration:
                ClusterName: vprofile-staging
                ServiceName: vprofile
                FileName: imagedefinitions.json
              InputArtifacts:
                - Name: build_output

        - Name: Approval
          Actions:
            - Name: ManualApproval
              ActionTypeId:
                Category: Approval
                Owner: AWS
                Provider: Manual
                Version: '1'
              Configuration:
                NotificationArn: !Ref ApprovalTopic
                CustomData: "Review staging at https://staging.vprofile.acme.com"

        - Name: DeployProduction
          Actions:
            - Name: BlueGreenDeploy
              ActionTypeId:
                Category: Deploy
                Owner: AWS
                Provider: CodeDeployToECS
                Version: '1'
              Configuration:
                ApplicationName: vprofile
                DeploymentGroupName: production
                TaskDefinitionTemplateArtifact: build_output
                AppSpecTemplateArtifact: build_output
              InputArtifacts:
                - Name: build_output
```

## Best practices

### Build

- Cache Maven `.m2` vào S3 — giảm thời gian download dependency.
- Dùng Lambda compute cho build nhỏ, build nhanh.
- Custom image với tool đã pre-installed sẵn.
- Bật privileged mode khi cần Docker build.
- Buildspec lưu trong repo (không định nghĩa qua console — version control mới track được).

### Deploy

- Luôn dùng Blue/Green cho production.
- Pre-traffic hook chạy synthetic test (mô phỏng request thật).
- Auto-rollback theo CloudWatch alarm.
- Notification qua SNS → Slack.
- Yêu cầu manual approval cho deploy prod.
- Health check grace period 60-300s cho app khởi động chậm (vd Tomcat, JVM warmup).

### Security

- KMS encrypt artifact bucket trên S3.
- IAM least privilege (quyền tối thiểu) cho từng stage.
- VPC endpoint cho ECR pull → không cần NAT Gateway (tiết kiệm cost).
- Branch protection cho main branch (yêu cầu PR review).

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Buildspec inline trong console | Khó track thay đổi | Luôn lưu trong repo |
| Docker build không bật privileged | Build fail | Enable privileged mode |
| Không có cache | Build chậm | S3 + local cache |
| imagedefinitions.json sai format | Deploy fail | Format đúng: `[{"name":"X","imageUri":"..."}]` |
| Health check grace period quá ngắn | App bị kill sớm | Tăng lên 300s |
| Không config alarm | Auto-rollback không trigger | Attach CloudWatch alarm |
| Approval không có timeout | Pipeline kẹt vĩnh viễn | Set timeout (default 7 ngày quá dài) |

## Tóm tắt bài 2

- **CodeBuild** là managed build service. `buildspec.yml` định nghĩa các phase.
- Dùng Lambda compute cho build nhỏ và nhanh.
- Custom image pre-install tool để tăng tốc build.
- **CodeDeploy** hỗ trợ EC2 / ECS / Lambda với Blue/Green + Canary deployment.
- `appspec.yml` định nghĩa các hook + cấu hình traffic shift.
- Pre-traffic hook validate version mới trước khi chuyển production traffic.
- Auto-rollback dựa vào CloudWatch alarm.
- Pipeline đầy đủ: Source → Build → Test → DeployStaging → Approval → DeployProd Blue/Green.

**Bài kế tiếp** → [Bài 3: GitHub Actions + AWS OIDC (modern alternative)](03-github-aws-oidc.md)

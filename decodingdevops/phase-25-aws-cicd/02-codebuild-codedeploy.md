# Bài 2: CodeBuild + CodeDeploy chi tiết

Bài 1 overview. Bài này deep-dive **CodeBuild** (build server managed) và **CodeDeploy** (deployment strategies).

## CodeBuild

### Concept

> CodeBuild = managed build server. No Jenkins to maintain. Pay per minute.

Specifications:
- Container-based.
- Linux/Windows.
- Custom Docker image.
- Concurrent builds.
- Lambda-backed for small jobs (cheaper).

### buildspec.yml

Define build steps:

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

### Local environment variables

```yaml
env:
  variables:                 # Plain
    KEY: value
  parameter-store:           # Pull from SSM at build start
    DB_HOST: /prod/db/host
  secrets-manager:           # Pull from Secrets Manager
    API_KEY: prod/api:key
```

### Build environment

Console → CodeBuild → Project → Environment:
- **Image**: managed (aws/codebuild/standard:7.0) or custom ECR image.
- **Compute**: Small (3 GB), Medium (7 GB), Large (15 GB), Lambda.
- **Service role**: IAM cho ECR, S3, SSM access.
- **Privileged**: enable cho Docker build.

### CodeBuild custom image

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

Use:
- Project → Environment → "Custom image" → ECR URI.
- Faster build (pre-installed tools).

### Local build with codebuild-agent

Test buildspec locally without spinning up CodeBuild project:

```bash
# Install codebuild-local
curl -fsSL https://raw.githubusercontent.com/aws/aws-codebuild-docker-images/master/local_builds/codebuild_build.sh -o codebuild_build.sh
chmod +x codebuild_build.sh

# Run
./codebuild_build.sh \
    -i aws/codebuild/standard:7.0 \
    -a /tmp/artifacts \
    -s . \
    -e .env
```

Debug buildspec locally before commit.

### Lambda compute (fast + cheap)

For small build (< 15 phút, < 10 GB RAM):

```yaml
ComputeType: BUILD_LAMBDA_2GB    # or 4GB, 8GB, 10GB
```

Cold start ~1s, much cheaper than EC2-backed CodeBuild.

### Concurrency + queue

Service quota: default 1 concurrent build/project. Request increase.

Cache:
- **S3 cache**: download cached files start.
- **Local cache** (in container): `cache: paths:`.
- **EFS** for large persistent cache.

## CodeDeploy

### Concept

> CodeDeploy = deployment automation. Support EC2, ECS, Lambda.

### Deployment groups

```bash
aws deploy create-deployment-group \
    --application-name vprofile \
    --deployment-group-name production \
    --service-role-arn arn:aws:iam::123:role/CodeDeployRole \
    --auto-scaling-groups vprofile-asg \
    --deployment-config-name CodeDeployDefault.OneAtATime \
    --auto-rollback-configuration enabled=true,events=DEPLOYMENT_FAILURE,DEPLOYMENT_STOP_ON_ALARM
```

### Deployment configurations

EC2/On-Premises:
- `OneAtATime`: 1 instance at a time.
- `HalfAtATime`: 50% at once.
- `AllAtOnce`: parallel.
- Custom: percentage.

Lambda:
- `Linear10PercentEvery1Minute`: shift 10% every minute.
- `Canary10Percent5Minutes`: 10% first 5 min, then 100%.
- `AllAtOnce`.

ECS:
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

Hooks execute in order. Failed hook → automatic rollback.

`scripts/health_check.sh`:

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

ECS Blue/Green flow:
1. Deploy task definition new → green ECS service.
2. Test traffic → green (via test listener).
3. Switch production traffic → green.
4. Drain blue.
5. Optionally terminate blue.

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

CodeDeploy shift alias traffic gradually. Pre-traffic hook test new version.

### Triggers + monitoring

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

CloudWatch alarm trigger → CodeDeploy auto-rollback.

## CodeDeploy + Lambda canary example

```python
# preTrafficHook.py — test new version before traffic
import boto3
import json

codedeploy = boto3.client("codedeploy")
lambda_client = boto3.client("lambda")

def handler(event, context):
    deployment_id = event["DeploymentId"]
    lifecycle_event_hook_execution_id = event["LifecycleEventHookExecutionId"]

    try:
        # Invoke new version with test payload
        new_version = "vprofile-app:2"
        resp = lambda_client.invoke(
            FunctionName=new_version,
            InvocationType="RequestResponse",
            Payload=json.dumps({"test": True})
        )

        if resp["StatusCode"] != 200:
            raise Exception("Test invocation failed")

        # Notify success → CodeDeploy proceed
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

## Full vProfile pipeline integration

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
Test stage: CodeBuild (smoke + integration)
    │
    ▼
Deploy Staging stage: ECS deploy action
  - Update ECS service
    │
    ▼
Manual Approval
    │
    ▼
Deploy Production stage: CodeDeploy Blue/Green
  - Deploy to green ECS
  - Pre-traffic hook
  - Shift 10% → wait 5min → 100%
  - Drain blue
    │
    ▼
Post-deploy stage: CloudWatch alarm verify
```

### CodePipeline YAML (CloudFormation)

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

- Cache Maven `.m2` to S3.
- Use Lambda compute for small fast builds.
- Custom image with pre-installed tools.
- Privileged mode for Docker build.
- Buildspec in repo (not console-defined).

### Deploy

- Always Blue/Green for production.
- Pre-traffic hook with synthetic test.
- Auto-rollback CloudWatch alarm.
- Notification SNS → Slack.
- Manual approval for prod.
- Health check grace period 60-300s for slow boot.

### Security

- KMS encrypt artifact bucket.
- IAM least privilege per stage.
- VPC endpoint cho ECR pull (no NAT).
- Branch protection main.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Buildspec inline console | Hard to track | Always in repo |
| Docker build no privileged | Build fail | Enable privileged |
| No cache | Slow build | S3 + local cache |
| imagedefinitions.json wrong format | Deploy fail | `[{"name":"X","imageUri":"..."}]` |
| Health check grace too short | Premature kill | Increase to 300s |
| No alarm config | Rollback not trigger | Attach CloudWatch alarm |
| Approval timeout | Pipeline stuck | Set timeout (default 7 days too long) |

## Tóm tắt bài 2

- **CodeBuild** managed build, `buildspec.yml` define phases.
- Lambda compute cho small fast builds.
- Custom image pre-install tools for speed.
- **CodeDeploy** EC2/ECS/Lambda với Blue/Green + Canary.
- `appspec.yml` define hooks + traffic shift config.
- Pre-traffic hook validate new version.
- Auto-rollback CloudWatch alarm.
- Full pipeline: Source → Build → Test → DeployStaging → Approval → DeployProd Blue/Green.

**Bài kế tiếp** → [Bài 3: GitHub Actions + AWS OIDC (modern alternative)](03-github-aws-oidc.md)

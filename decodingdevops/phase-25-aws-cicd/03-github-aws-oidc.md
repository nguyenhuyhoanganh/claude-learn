# Bài 3: GitHub Actions + AWS OIDC — modern alternative

Bài 1-2 dùng CodePipeline. Bài này dùng **GitHub Actions** orchestrate, **AWS service** execute — modern hybrid.

## Vì sao hybrid?

| | All-AWS (CodePipeline) | Hybrid (GitHub Actions + AWS) |
|---|---|---|
| Source | GitHub (via CodeStar) | GitHub native |
| Pipeline view | CodePipeline UI | GitHub Actions UI (better) |
| Logs | CloudWatch | GitHub UI |
| Cost | Pipeline + Build + Deploy | Actions minutes + AWS service usage |
| Marketplace | AWS-only | 20000+ actions |
| Learning curve | AWS console | Engineer already knows GitHub |
| Self-hosted runner | N/A | Yes (cost saving) |

Modern team: GitHub Actions for orchestration, AWS for compute/deploy.

## OIDC trust setup

GitHub Actions OIDC → AWS IAM role → temporary credentials. **No static access key**.

### Step 1: Create OIDC provider

```bash
aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

One-time setup per AWS account.

### Step 2: IAM role with trust policy

```json
{
    "Version": "2012-10-17",
    "Statement": [{
        "Effect": "Allow",
        "Principal": {
            "Federated": "arn:aws:iam::123456789:oidc-provider/token.actions.githubusercontent.com"
        },
        "Action": "sts:AssumeRoleWithWebIdentity",
        "Condition": {
            "StringEquals": {
                "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
            },
            "StringLike": {
                "token.actions.githubusercontent.com:sub": "repo:acme/vprofile:*"
            }
        }
    }]
}
```

Strict condition:
- `repo:acme/vprofile:ref:refs/heads/main` — only main branch.
- `repo:acme/vprofile:environment:production` — only when workflow uses production environment.
- `repo:acme/*` — any repo in acme org.

### Step 3: Permissions policy

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:BatchGetImage",
                "ecr:PutImage",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload"
            ],
            "Resource": "arn:aws:ecr:us-east-1:123:repository/vprofile"
        },
        {
            "Effect": "Allow",
            "Action": [
                "ecs:UpdateService",
                "ecs:DescribeServices",
                "ecs:DescribeTaskDefinition",
                "ecs:RegisterTaskDefinition"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "arn:aws:iam::123:role/ecsTaskExecutionRole"
        }
    ]
}
```

Least privilege — only what pipeline needs.

## Workflow assume role

```yaml
permissions:
  id-token: write     # MANDATORY cho OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123:role/github-actions-vprofile
          aws-region: us-east-1

      - run: aws sts get-caller-identity
      # Shows assumed role, temp credentials valid 1 hour
```

## ECR build + push

```yaml
- name: Login ECR
  id: ecr
  uses: aws-actions/amazon-ecr-login@v2

- name: Setup Buildx
  uses: docker/setup-buildx-action@v3

- name: Build + push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: |
      ${{ steps.ecr.outputs.registry }}/vprofile:${{ github.sha }}
      ${{ steps.ecr.outputs.registry }}/vprofile:${{ github.ref_name }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
    provenance: mode=max
    sbom: true
```

`provenance` + `sbom` = supply chain security attestations.

## ECS deploy

```yaml
- name: Download current task definition
  run: |
    aws ecs describe-task-definition \
        --task-definition vprofile \
        --query taskDefinition > taskdef.json

- name: Update image in task definition
  id: render-task
  uses: aws-actions/amazon-ecs-render-task-definition@v1
  with:
    task-definition: taskdef.json
    container-name: tomcat
    image: ${{ steps.ecr.outputs.registry }}/vprofile:${{ github.sha }}

- name: Deploy
  uses: aws-actions/amazon-ecs-deploy-task-definition@v1
  with:
    task-definition: ${{ steps.render-task.outputs.task-definition }}
    service: vprofile
    cluster: vprofile-prod
    wait-for-service-stability: true
    wait-for-minutes: 15
```

CodeDeploy alternative:

```yaml
- name: Deploy via CodeDeploy Blue/Green
  uses: aws-actions/amazon-ecs-deploy-task-definition@v1
  with:
    task-definition: ${{ steps.render-task.outputs.task-definition }}
    service: vprofile
    cluster: vprofile-prod
    codedeploy-appspec: appspec.yml
    codedeploy-application: vprofile
    codedeploy-deployment-group: production
    wait-for-service-stability: true
```

## EKS deploy

```yaml
- uses: azure/setup-kubectl@v4
  with:
    version: 'v1.28.0'

- name: Configure kubeconfig
  run: aws eks update-kubeconfig --name vprofile-prod --region us-east-1

- name: Deploy
  run: |
    kubectl -n vprofile-prod \
        set image deployment/vprofile \
        tomcat=${{ steps.ecr.outputs.registry }}/vprofile:${{ github.sha }}

    kubectl -n vprofile-prod \
        rollout status deployment/vprofile --timeout=15m
```

Or Helm:

```yaml
- uses: azure/setup-helm@v3
- run: |
    helm upgrade --install vprofile ./charts/vprofile \
        --namespace vprofile-prod \
        --set image.tag=${{ github.sha }} \
        --wait --timeout 15m
```

## Lambda deploy

```yaml
- name: Package
  run: |
    cd src/
    zip -r ../function.zip .

- name: Deploy
  run: |
    aws lambda update-function-code \
        --function-name hello \
        --zip-file fileb://function.zip

    aws lambda wait function-updated --function-name hello

    # Publish version + update alias
    VERSION=$(aws lambda publish-version --function-name hello --query Version --output text)
    aws lambda update-alias \
        --function-name hello \
        --name prod \
        --function-version $VERSION
```

Hoặc SAM deploy:

```yaml
- uses: aws-actions/setup-sam@v2
- run: |
    sam build
    sam deploy --no-confirm-changeset --no-fail-on-empty-changeset \
        --stack-name vprofile \
        --capabilities CAPABILITY_IAM
```

## CodeArtifact (artifact repo)

Alternative to Nexus on AWS:

```bash
# Create domain
aws codeartifact create-domain --domain acme

# Create repo
aws codeartifact create-repository \
    --domain acme \
    --repository maven-releases \
    --description "Maven release artifacts"

# Upstream: Maven Central
aws codeartifact associate-external-connection \
    --domain acme \
    --repository maven-releases \
    --external-connection "public:maven-central"
```

Maven settings.xml use CodeArtifact:

```bash
aws codeartifact login --tool maven --domain acme --repository maven-releases
```

Cost: $0.05/GB-month + $0.0005/request.

## Cost comparison

For 100 build/day:

| | Pure CodePipeline | GitHub Actions + AWS |
|---|---|---|
| Pipeline | $1/pipeline/month | Free (GitHub) |
| Build | $0.005/min × ~5 min × 100 = $75 | $0.008/min × ~5 min × 100 = $120 |
| But GitHub free tier | N/A | -$80 (first 2000 min free) |
| Deploy | Free (CodeDeploy EC2/ECS) | Free |
| **Total** | **~$80** | **~$40** |

GitHub Actions cheaper for small team. Self-hosted runner makes it nearly free.

## Self-hosted runner trên AWS

EKS Actions Runner Controller:

```yaml
apiVersion: actions.summerwind.dev/v1alpha1
kind: RunnerDeployment
metadata:
  name: vprofile-runners
spec:
  replicas: 3
  template:
    spec:
      organization: acme
      labels: [self-hosted, linux, aws]

---
apiVersion: actions.summerwind.dev/v1alpha1
kind: HorizontalRunnerAutoscaler
metadata:
  name: vprofile-runners-hpa
spec:
  scaleTargetRef:
    name: vprofile-runners
  minReplicas: 1
  maxReplicas: 20
  metrics:
    - type: PercentageRunnersBusy
      scaleUpThreshold: '0.75'
      scaleDownThreshold: '0.3'
```

Runner pod chạy K8s → cost = EC2 (cheap với Spot).

```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, aws]
```

## Tổng kết phase 25

3 bài cover:
1. CodePipeline + CodeBuild + CodeDeploy overview.
2. CodeBuild deep + CodeDeploy strategies.
3. GitHub Actions + OIDC modern alternative.

Skills:
- Setup CI/CD AWS-native.
- GitHub Actions deploy AWS with OIDC.
- Blue/Green + Canary deployment.
- Self-hosted runner trên EKS.

## Tóm tắt bài 3

- **OIDC** = GitHub Actions → AWS IAM role assume, no static credential.
- Trust policy with `sub` condition restrict by repo/branch/environment.
- `aws-actions/configure-aws-credentials@v4` set up temporary creds.
- `amazon-ecr-login` + `docker/build-push-action` cho ECR.
- `amazon-ecs-render-task-definition` + `amazon-ecs-deploy-task-definition` cho ECS.
- Self-hosted runner trên EKS với ARC → near-free build.
- Cost: GitHub Actions thường rẻ hơn CodePipeline cho team nhỏ.

**Phase kế tiếp** → [Phase 26 — GCP](../phase-26-gcp/01-gcp-overview.md)

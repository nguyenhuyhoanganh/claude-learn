# Bài 3: GitHub Actions + AWS OIDC — Phương án hiện đại

Bài 1-2 dùng CodePipeline. Bài này dùng **GitHub Actions để orchestrate**, **AWS service để execute** — pattern hybrid hiện đại.

## Vì sao chọn hybrid?

| | All-AWS (CodePipeline) | Hybrid (GitHub Actions + AWS) |
|---|---|---|
| Source | GitHub (qua CodeStar) | GitHub native |
| Pipeline view | CodePipeline UI | GitHub Actions UI (tốt hơn) |
| Logs | CloudWatch | GitHub UI |
| Cost | Pipeline + Build + Deploy | Actions minutes + AWS service usage |
| Marketplace | Chỉ của AWS | 20000+ actions |
| Learning curve | AWS console | Engineer đã biết GitHub |
| Self-hosted runner | Không có | Có (tiết kiệm chi phí) |

Modern team thường chọn: GitHub Actions cho orchestration, AWS cho compute/deploy.

## OIDC trust setup (Cấu hình tin cậy)

GitHub Actions OIDC → AWS IAM role → nhận credential tạm thời. **Không cần lưu access key tĩnh**.

### Step 1: Tạo OIDC provider

```bash
aws iam create-open-id-connect-provider \
    --url https://token.actions.githubusercontent.com \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

Chỉ làm 1 lần cho mỗi AWS account.

### Step 2: IAM role với trust policy

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

Strict condition (điều kiện chặt chẽ):
- `repo:acme/vprofile:ref:refs/heads/main` — chỉ branch main mới assume được.
- `repo:acme/vprofile:environment:production` — chỉ khi workflow dùng environment "production".
- `repo:acme/*` — bất kỳ repo nào trong organization "acme".

### Step 3: Permissions policy (Quyền role được phép làm)

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

Theo nguyên tắc least privilege — chỉ cấp quyền pipeline thực sự cần.

## Workflow assume role

```yaml
permissions:
  id-token: write     # BẮT BUỘC cho OIDC
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
      # Output: role đã assume, credential tạm thời valid trong 1 giờ
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

`provenance` + `sbom` = supply chain security attestation.

## ECS deploy

```yaml
- name: Download current task definition
  run: |
    aws ecs describe-task-definition \
        --task-definition vprofile \
        --query taskDefinition > taskdef.json

- name: Update image trong task definition
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

Alternative với CodeDeploy:

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

Hoặc dùng Helm:

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

Hoặc dùng SAM deploy:

```yaml
- uses: aws-actions/setup-sam@v2
- run: |
    sam build
    sam deploy --no-confirm-changeset --no-fail-on-empty-changeset \
        --stack-name vprofile \
        --capabilities CAPABILITY_IAM
```

## CodeArtifact (artifact repo)

Alternative cho Nexus trên AWS:

```bash
# Tạo domain
aws codeartifact create-domain --domain acme

# Tạo repo
aws codeartifact create-repository \
    --domain acme \
    --repository maven-releases \
    --description "Maven release artifacts"

# Upstream proxy Maven Central
aws codeartifact associate-external-connection \
    --domain acme \
    --repository maven-releases \
    --external-connection "public:maven-central"
```

Maven settings.xml dùng CodeArtifact:

```bash
aws codeartifact login --tool maven --domain acme --repository maven-releases
```

Cost: $0.05 / GB-tháng + $0.0005 / request.

## Cost comparison (Cho 100 build/ngày)

| | Pure CodePipeline | GitHub Actions + AWS |
|---|---|---|
| Pipeline | $1/pipeline/tháng | Free (GitHub) |
| Build | $0.005/phút × ~5 phút × 100 = $75 | $0.008/phút × ~5 phút × 100 = $120 |
| GitHub free tier | Không có | -$80 (2000 phút đầu free) |
| Deploy | Free (CodeDeploy EC2/ECS) | Free |
| **Total** | **~$80** | **~$40** |

GitHub Actions rẻ hơn cho team nhỏ. Self-hosted runner còn rẻ hơn nữa (gần như free).

## Self-hosted runner trên AWS

Dùng EKS với Actions Runner Controller (ARC):

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

Runner pod chạy trên K8s → cost chỉ là EC2 (rẻ nếu dùng Spot).

```yaml
jobs:
  build:
    runs-on: [self-hosted, linux, aws]
```

## Tổng kết phase 25

3 bài cover:
1. CodePipeline + CodeBuild + CodeDeploy overview.
2. CodeBuild deep + CodeDeploy strategies.
3. GitHub Actions + OIDC = modern alternative.

Skill đạt được:
- Setup CI/CD AWS-native.
- Deploy AWS từ GitHub Actions qua OIDC.
- Blue/Green + Canary deployment.
- Self-hosted runner trên EKS.

## Tóm tắt bài 3

- **OIDC** = GitHub Actions → assume AWS IAM role, không cần lưu credential tĩnh.
- Trust policy với điều kiện `sub` để giới hạn theo repo / branch / environment.
- `aws-actions/configure-aws-credentials@v4` setup credential tạm thời.
- `amazon-ecr-login` + `docker/build-push-action` cho ECR.
- `amazon-ecs-render-task-definition` + `amazon-ecs-deploy-task-definition` cho ECS.
- Self-hosted runner trên EKS với ARC → build gần như miễn phí.
- Cost: GitHub Actions thường rẻ hơn CodePipeline cho team nhỏ.

**Phase kế tiếp** → [Phase 26 — GCP](../phase-26-gcp/01-gcp-overview.md)

# Bài 2: Workflow nâng cao — reusable, composite, matrix, environments

Bài 1 đã đi qua phần cơ bản. Bài này deep-dive các **tính năng nâng cao**: reusable workflow, composite action, matrix optimization, environments + protection rule.

## Reusable workflow

1 workflow duy nhất được gọi từ nhiều repo khác nhau.

### Định nghĩa reusable workflow

`.github/workflows/build-java.yml` (trong repo `acme/ci-workflows`):

```yaml
name: Build Java App

on:
  workflow_call:
    inputs:
      java-version:
        type: string
        default: '17'
      maven-args:
        type: string
        default: 'clean package'
      run-tests:
        type: boolean
        default: true
    secrets:
      NEXUS_USER:
        required: true
      NEXUS_PASSWORD:
        required: true
    outputs:
      version:
        description: "Built version"
        value: ${{ jobs.build.outputs.version }}

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.meta.outputs.version }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: ${{ inputs.java-version }}
          distribution: temurin
          cache: maven
          server-id: nexus
          server-username: NEXUS_USER
          server-password: NEXUS_PASSWORD

      - name: Test
        if: ${{ inputs.run-tests }}
        run: mvn test
        env:
          NEXUS_USER: ${{ secrets.NEXUS_USER }}
          NEXUS_PASSWORD: ${{ secrets.NEXUS_PASSWORD }}

      - name: Build
        run: mvn ${{ inputs.maven-args }}
        env:
          NEXUS_USER: ${{ secrets.NEXUS_USER }}
          NEXUS_PASSWORD: ${{ secrets.NEXUS_PASSWORD }}

      - id: meta
        run: echo "version=$(mvn help:evaluate -Dexpression=project.version -q -DforceStdout)" >> $GITHUB_OUTPUT

      - uses: actions/upload-artifact@v4
        with:
          name: jar
          path: target/*.jar
```

### Gọi reusable workflow

`.github/workflows/ci.yml` (trong repo app):

```yaml
name: CI

on:
  push:
    branches: [main]

jobs:
  build:
    uses: acme/ci-workflows/.github/workflows/build-java.yml@main
    with:
      java-version: '17'
      maven-args: 'clean package -DskipITs'
    secrets:
      NEXUS_USER: ${{ secrets.NEXUS_USER }}
      NEXUS_PASSWORD: ${{ secrets.NEXUS_PASSWORD }}

  notify:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: echo "Built version ${{ needs.build.outputs.version }}"
```

Lợi ích:
- 50 app dùng chung 1 workflow → maintain 1 chỗ.
- Version reusable workflow theo tag (`@v1.2.0`).
- Tập trung security scan, quality gate.

## Composite Action

Đóng gói nhiều step thành 1 step có thể tái sử dụng:

### Định nghĩa composite action

`.github/actions/deploy-k8s/action.yml`:

```yaml
name: 'Deploy to K8s'
description: 'Update K8s deployment with new image'

inputs:
  namespace:
    required: true
  deployment:
    required: true
  image:
    required: true
  kubeconfig:
    required: true
  timeout:
    default: '10m'

outputs:
  url:
    description: 'Deployed URL'
    value: ${{ steps.deploy.outputs.url }}

runs:
  using: 'composite'
  steps:
    - name: Setup kubectl
      shell: bash
      run: |
        curl -LO https://dl.k8s.io/release/v1.28.0/bin/linux/amd64/kubectl
        chmod +x kubectl
        sudo mv kubectl /usr/local/bin/

    - name: Configure kubeconfig
      shell: bash
      run: |
        mkdir -p ~/.kube
        echo "${{ inputs.kubeconfig }}" > ~/.kube/config
        chmod 600 ~/.kube/config

    - name: Deploy
      id: deploy
      shell: bash
      run: |
        kubectl -n ${{ inputs.namespace }} \
          set image deployment/${{ inputs.deployment }} \
          app=${{ inputs.image }}

        kubectl -n ${{ inputs.namespace }} \
          rollout status deployment/${{ inputs.deployment }} \
          --timeout=${{ inputs.timeout }}

        URL=$(kubectl -n ${{ inputs.namespace }} \
          get ingress ${{ inputs.deployment }} \
          -o jsonpath='{.spec.rules[0].host}')
        echo "url=https://$URL" >> $GITHUB_OUTPUT

    - name: Verify
      shell: bash
      run: |
        for i in {1..30}; do
          if curl -fsS ${{ steps.deploy.outputs.url }}/health > /dev/null; then
            echo "✓ Deployed"
            exit 0
          fi
          sleep 10
        done
        echo "✗ Health check failed"
        exit 1
```

### Dùng composite

```yaml
- uses: ./.github/actions/deploy-k8s
  with:
    namespace: vprofile-prod
    deployment: vprofile
    image: ${{ env.ECR_URI }}/vprofile:${{ github.sha }}
    kubeconfig: ${{ secrets.KUBE_CONFIG_PROD }}
    timeout: '15m'

- run: echo "Deployed to ${{ steps.deploy.outputs.url }}"
```

### Composite vs Reusable workflow

| | Composite Action | Reusable Workflow |
|---|---|---|
| Phạm vi | Nhóm các step | Cả workflow với nhiều job |
| Mức caller | step level | job level |
| Nhiều job | Không | Có |
| Matrix | Kế thừa từ caller | Tự define |
| Phù hợp | Chuỗi step phổ biến | Template pipeline đầy đủ |

## Matrix strategy nâng cao

### Matrix cơ bản

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest]
    java: ['11', '17', '21']
```

2 × 3 = 6 job chạy song song.

### Include / Exclude (Loại trừ / thêm trường hợp đặc biệt)

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    java: ['11', '17', '21']
    exclude:
      - os: macos-latest
        java: '11'
      - os: windows-latest
        java: '21'
    include:
      - os: ubuntu-latest
        java: '17'
        special: true
```

### Fail fast control

```yaml
strategy:
  fail-fast: false      # Tiếp tục các matrix job khác kể cả khi 1 job fail
  max-parallel: 4       # Giới hạn số matrix job chạy song song
  matrix: ...
```

`fail-fast: false` quan trọng cho test matrix — biết được **tất cả** test case nào pass/fail (không bị cắt sớm).

### Dynamic matrix (Sinh matrix động từ script)

```yaml
jobs:
  setup:
    runs-on: ubuntu-latest
    outputs:
      matrix: ${{ steps.set-matrix.outputs.matrix }}
    steps:
      - uses: actions/checkout@v4
      - id: set-matrix
        run: |
          MATRIX=$(jq -c '.modules | map({module: .})' modules.json)
          echo "matrix={\"include\":$MATRIX}" >> $GITHUB_OUTPUT

  build:
    needs: setup
    runs-on: ubuntu-latest
    strategy:
      matrix: ${{ fromJSON(needs.setup.outputs.matrix) }}
    steps:
      - run: echo "Building ${{ matrix.module }}"
```

Sinh matrix động → flexibility cao (vd: dựa trên file config thay đổi).

## Environments + Protection rule

Cấu hình environment (dev/staging/prod) với rule khác nhau:

### Define environment

Settings → Environments → New environment "production":
- **Required reviewers**: 2 người (alice, bob).
- **Wait timer**: 5 phút.
- **Deployment branches**: chỉ `main`.
- **Environment secrets**: scoped (chỉ truy cập được từ environment này).

### Dùng trong workflow

```yaml
jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    needs: [test, build]
    environment:
      name: production
      url: https://vprofile.acme.com

    steps:
      - name: Deploy
        env:
          DB_PASSWORD: ${{ secrets.PROD_DB_PASSWORD }}      # Secret scoped theo environment
        run: ./deploy.sh prod
```

Khi workflow đến job `deploy-prod` → chờ reviewer approve → chờ wait timer → chạy.

## OIDC — Auth không cần lưu cloud credential

Thay vì lưu AWS access key trong GitHub secret:

```yaml
permissions:
  id-token: write    # OIDC bắt buộc quyền này
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123:role/github-actions-deploy
          aws-region: us-east-1

      - run: aws s3 cp build/ s3://acme-deploy/ --recursive
```

AWS IAM role trust GitHub Actions OIDC provider:

```json
{
    "Effect": "Allow",
    "Principal": {
        "Federated": "arn:aws:iam::123:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
        "StringEquals": {
            "token.actions.githubusercontent.com:sub": "repo:acme/vprofile:ref:refs/heads/main"
        }
    }
}
```

Workflow assume role → nhận credential tạm thời. **Không lưu AWS key tĩnh** ở đâu cả.

Pattern này áp dụng tương tự cho GCP, Azure.

## Concurrency control (Kiểm soát chạy song song)

```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true
```

- `group`: định danh để giới hạn concurrency.
- `cancel-in-progress`: cancel workflow đang chạy khi có push mới.

Use case:
- Deploy job: chỉ cho 1 deploy mỗi branch chạy cùng lúc.
- PR check: cancel check cũ khi push commit mới.

```yaml
# Production deploy queue (xếp hàng) thay vì cancel
concurrency:
  group: production-deploy
  # cancel-in-progress: false  → queue thay vì cancel
```

## Artifacts + caching

### Cache dependency

```yaml
- uses: actions/cache@v4
  with:
    path: |
      ~/.m2/repository
      ~/.gradle/caches
    key: ${{ runner.os }}-maven-${{ hashFiles('**/pom.xml', '**/*.gradle*') }}
    restore-keys: |
      ${{ runner.os }}-maven-
```

`restore-keys` = fallback khi exact key miss (vẫn lấy cache cũ tương đối phù hợp).

### Pass artifact giữa các job

```yaml
jobs:
  build:
    steps:
      - run: mvn package
      - uses: actions/upload-artifact@v4
        with:
          name: jar
          path: target/*.jar
          retention-days: 7

  deploy:
    needs: build
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: jar
          path: ./
      - run: scp *.jar user@server:/opt/
```

## workflow_run trigger (Trigger từ workflow khác)

Trigger workflow khi workflow khác kết thúc:

```yaml
# .github/workflows/notify.yml
on:
  workflow_run:
    workflows: [CI]
    types: [completed]

jobs:
  notify:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    steps:
      - name: Send Slack alert
        ...
```

Pattern: tách CI nhanh + security scan chậm chạy sau qua `workflow_run`.

## Self-hosted runner nâng cao

### Auto-scaling self-hosted runner

Dùng EKS + Actions Runner Controller (ARC):

```yaml
# RunnerDeployment
apiVersion: actions.summerwind.dev/v1alpha1
kind: RunnerDeployment
metadata:
  name: vprofile-runners
spec:
  replicas: 3
  template:
    spec:
      organization: acme
      labels: [self-hosted, linux, k8s]
      resources:
        requests: {cpu: 500m, memory: 1Gi}
        limits: {cpu: 2, memory: 4Gi}
```

HPA tự động scale theo độ dài queue.

### Security cho self-hosted runner

- Public repo + self-hosted = **NGUY HIỂM**: bất kỳ PR nào cũng có thể chạy code tuỳ ý trên runner.
- Hạn chế workflow chạy trên fork PR:

```yaml
on:
  pull_request_target:    # Chạy trên base commit, không phải PR commit (an toàn hơn)
```

- Dùng ephemeral runner (tạo mới sau mỗi job).

## Kết hợp Reusable + Composite

```text
acme/ci-workflows (repo)
├── .github/workflows/ci.yml              ← Reusable workflow
└── .github/actions/
    ├── lint/action.yml                    ← Composite
    ├── security-scan/action.yml
    └── deploy/action.yml
```

App workflow:

```yaml
jobs:
  ci:
    uses: acme/ci-workflows/.github/workflows/ci.yml@v1
    with:
      lang: java
```

Bên trong reusable workflow:

```yaml
- uses: acme/ci-workflows/.github/actions/lint@v1
- uses: acme/ci-workflows/.github/actions/security-scan@v1
- uses: acme/ci-workflows/.github/actions/deploy@v1
```

Hierarchy 3 tầng: app → reusable workflow → composite action.

## Performance tips

- **Cache aggressively** (dependency, Docker layer).
- **Parallel** với matrix + needs.
- **Skip khi không thay đổi**: dùng `paths-ignore`, hoặc `changed-files` action.
- **Concurrency cancel-in-progress** cho PR check.
- **Dùng runner lớn hơn** cho job chạy chậm ($0.008/phút cho 4-core).
- **Tránh dùng `ubuntu-latest`**: pin major version để cache ổn định.

```yaml
# Runner mạnh hơn (trả phí)
runs-on: ubuntu-22.04-large    # 4-core
runs-on: macos-13-large
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Hardcode secret trong YAML | Lộ secret | Luôn dùng `${{ secrets.X }}` |
| GITHUB_TOKEN có permission mặc định quá rộng | Quyền vượt mức cần | Set `permissions:` block strict |
| `pull_request` cho fork không restrict | Chạy code không tin cậy | Dùng `pull_request_target` cẩn thận |
| OIDC role trust * (không limit sub) | Bất kỳ ai cũng assume được | Strict điều kiện `sub` |
| Cache key không có lockfile hash | Cache cũ, sai dependency | Dùng `hashFiles` |
| Reusable workflow không pin version | Bị break khi reusable update | Pin `@v1.2.0` cụ thể |
| Artifact không set retention | Storage tốn nhiều | Set `retention-days: 7` |

## Tóm tắt bài 2

- **Reusable workflow** (`workflow_call`): cấp job, template pipeline đầy đủ.
- **Composite action** (`uses: composite`): cấp step, nhóm các step.
- **Matrix include/exclude** + `fail-fast: false` cho test matrix.
- **Dynamic matrix** từ JSON output.
- **Environments** + reviewer + wait timer + scoped secret cho production.
- **OIDC** → AWS IAM role assume, không cần lưu credential tĩnh.
- **Concurrency** group: cancel-in-progress hoặc queue.
- **Cache** với `restore-keys` fallback.
- **Self-hosted runner** với ARC scale trên K8s.

**Bài kế tiếp** → [Bài 3: vProfile CI/CD với GitHub Actions](03-vprofile-actions.md)

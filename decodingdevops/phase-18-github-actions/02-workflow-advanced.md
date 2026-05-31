# Bài 2: Workflow nâng cao — reusable, composite, matrix, environments

Bài 1 cơ bản. Bài này deep-dive **advanced features**: reusable workflow, composite action, matrix optimization, environments + protection rules.

## Reusable workflow

Single workflow gọi từ nhiều repo:

### Define reusable workflow

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

### Call reusable workflow

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

Lợi:
- 50 app dùng cùng workflow → maintain 1 chỗ.
- Version reusable workflow (`@v1.2.0`).
- Centralized security scan, quality gate.

## Composite Action

Đóng gói nhiều step thành 1 step reusable:

### Define composite action

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

### Use composite

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
| Scope | Group of steps | Full workflow with jobs |
| Caller | step level | job level |
| Multiple jobs | No | Yes |
| Matrix | Inherit caller | Define own |
| Best for | Common step sequence | Full pipeline template |

## Matrix strategy nâng cao

### Basic matrix

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest]
    java: ['11', '17', '21']
```

2 × 3 = 6 jobs parallel.

### Include / Exclude

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
  fail-fast: false      # Continue other matrix even if 1 fails
  max-parallel: 4       # Limit concurrent matrix jobs
  matrix: ...
```

`fail-fast: false` quan trọng cho test matrix — biết tất cả cái nào pass/fail.

### Dynamic matrix from script

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

Dynamic generate matrix → flexible.

## Environments + protection

Environments cho dev/staging/prod với rules khác nhau:

### Define environment

Settings → Environments → New environment "production":
- **Required reviewers**: 2 reviewers (alice, bob).
- **Wait timer**: 5 min.
- **Deployment branches**: only `main`.
- **Environment secrets**: scoped to environment only.

### Use trong workflow

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
          DB_PASSWORD: ${{ secrets.PROD_DB_PASSWORD }}      # Env-scoped secret
        run: ./deploy.sh prod
```

Workflow đến `deploy-prod` job → wait reviewer approve → wait timer → run.

## OIDC — cloudless credential

Thay vì lưu AWS access key:

```yaml
permissions:
  id-token: write    # OIDC mandatory
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

AWS IAM role trust GitHub Actions OIDC:

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

Workflow assume role → temporary credential. No static AWS key.

Apply pattern cho GCP, Azure tương tự.

## Concurrency control

```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true
```

- `group`: identifier for concurrency limit.
- `cancel-in-progress`: cancel running workflow nếu new push.

Use case:
- Deploy job: chỉ 1 deploy/branch cùng lúc.
- PR check: cancel old check khi push mới.

```yaml
# Production deploy serial (queue)
concurrency:
  group: production-deploy
  # cancel-in-progress: false  (queue thay vì cancel)
```

## Artifacts + caching

### Cache deps

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

`restore-keys` fallback nếu exact key miss.

### Artifacts pass

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

## Workflow_run trigger

Trigger workflow từ workflow khác kết thúc:

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

Pattern: separate quick check workflow + slow security scan workflow_run.

## Self-hosted runner advanced

### Auto-scaling self-hosted

EKS + Actions Runner Controller (ARC):

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

HPA auto-scale theo queue length.

### Security cho self-hosted

- Public repo + self-hosted = **DANGEROUS**: any PR can run arbitrary code on runner.
- Restrict workflow run trên fork PR:

```yaml
on:
  pull_request_target:    # Run on base commit, not PR commit (safer)
```

- Use ephemeral runner (re-create after each job).

## Reusable + Composite combined

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

Inside reusable workflow:

```yaml
- uses: acme/ci-workflows/.github/actions/lint@v1
- uses: acme/ci-workflows/.github/actions/security-scan@v1
- uses: acme/ci-workflows/.github/actions/deploy@v1
```

Hierarchy: app → reusable workflow → composite actions.

## Performance tips

- **Cache aggressively** (deps, Docker layers).
- **Parallel** với matrix + needs.
- **Skip unchanged**: `paths-ignore`, `changed-files` action.
- **Concurrency cancel-in-progress** cho PR check.
- **Use larger runner** for slow jobs ($0.008/min for 4-core).
- **Avoid `ubuntu-latest`**: pin major version để cache stable.

```yaml
# Faster runner
runs-on: ubuntu-22.04-large    # 4-core, paid
runs-on: macos-13-large
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Secret in workflow YAML | Lộ | Always `${{ secrets.X }}` |
| Default GITHUB_TOKEN permissions | Excessive | Set `permissions:` block strict |
| `pull_request` for fork without restriction | Run untrusted code | Use `pull_request_target` cẩn thận |
| OIDC role trust * | Anyone assume role | Strict sub condition |
| Cache key without lockfile hash | Stale cache | Include `hashFiles` |
| Reusable workflow without version | Break when update | Pin `@v1.2.0` |
| No retention for artifact | Storage full | Set `retention-days: 7` |

## Tóm tắt bài 2

- **Reusable workflow** (`workflow_call`): job-level, full pipeline template.
- **Composite action** (`uses: composite`): step-level, group steps.
- **Matrix include/exclude** + `fail-fast: false` cho test matrix.
- **Dynamic matrix** from JSON output.
- **Environments** + reviewer + wait timer + scoped secret cho production.
- **OIDC** → AWS IAM role assume, no static credential.
- **Concurrency** group cancel-in-progress hoặc queue.
- **Cache** với restore-keys fallback.
- **Self-hosted runner** với ARC scale K8s.

**Bài kế tiếp** → [Bài 3: vProfile CI/CD với GitHub Actions](03-vprofile-actions.md)

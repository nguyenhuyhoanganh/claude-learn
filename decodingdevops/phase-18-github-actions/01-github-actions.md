# Bài 1: GitHub Actions — CI/CD tích hợp GitHub

GitHub Actions = CI/CD **built-in GitHub**. Không cần server riêng, free tier rộng (2000 phút/tháng cho public repo unlimited).

## Vì sao GitHub Actions?

So với Jenkins:

| | Jenkins | GitHub Actions |
|---|---|---|
| Server | Self-host | SaaS (GitHub-hosted runner free) |
| Config | Jenkinsfile (Groovy) | YAML workflow |
| UI | Cũ | Modern |
| Marketplace | 1800 plugin | 20000+ action |
| Learning curve | Cao | Thấp |
| Cost | Free + ops effort | 2000 phút free/month private, unlimited public |
| Lock-in | Tự host = portable | Tied to GitHub |

**Recommend**: dự án trên GitHub → dùng Actions. Không lý do gì self-host Jenkins.

## Workflow basics

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Build
        run: mvn clean package

      - name: Test
        run: mvn test

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: jar
          path: target/*.jar
```

## Concepts

| Term | Mô tả |
|---|---|
| **Workflow** | File YAML trong `.github/workflows/` |
| **Event** | Trigger (push, PR, schedule, manual) |
| **Job** | Set of steps chạy trên 1 runner |
| **Step** | Individual task — shell command hoặc action |
| **Action** | Reusable unit (vd checkout, setup-java) |
| **Runner** | Server chạy job (GitHub-hosted hoặc self-hosted) |

## Events

```yaml
on:
  push:
    branches: [main]
    paths: ['src/**', 'pom.xml']     # Chỉ trigger khi file match

  pull_request:
    types: [opened, synchronize, reopened]

  schedule:
    - cron: '0 2 * * *'              # Mỗi ngày 2am UTC

  workflow_dispatch:                  # Manual trigger
    inputs:
      environment:
        type: choice
        options: [dev, staging, prod]

  release:
    types: [published]

  issue_comment:
    types: [created]
```

## Runner

### GitHub-hosted (default)

Free 2000 phút/tháng (private repo). Public repo unlimited.

```yaml
runs-on: ubuntu-latest       # Ubuntu 22.04
runs-on: ubuntu-22.04
runs-on: macos-latest
runs-on: windows-latest
runs-on: ubuntu-latest-arm64 # M-series compatible
```

### Self-hosted

Chạy trên server bạn (EC2, on-prem) — control + free unlimited.

```yaml
runs-on: [self-hosted, linux, x64]
```

Setup: Settings → Actions → Runners → New self-hosted runner → cài binary trên server.

Use case:
- Job dài (> 6 giờ hard limit GitHub-hosted).
- Cần access internal network.
- Spec lớn hơn GitHub-hosted (4 core).
- GPU build.

## Jobs

Multiple jobs **chạy song song** mặc định:

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Test"

  lint:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Lint"

  build:
    runs-on: ubuntu-latest
    needs: [test, lint]              # Chạy SAU test + lint
    steps:
      - run: echo "Build"
```

`needs` define dependency → DAG.

## Matrix strategy — multi-version

```yaml
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest]
        java: ['11', '17', '21']
        exclude:
          - os: macos-latest
            java: '11'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: ${{ matrix.java }}
      - run: mvn test
```

Tạo 2 × 3 - 1 = 5 job chạy song song.

## Action marketplace

Reuse action có sẵn:

```yaml
- uses: actions/checkout@v4                # Official: checkout code
- uses: actions/setup-node@v4              # Setup Node
- uses: actions/setup-python@v5            # Setup Python
- uses: actions/setup-java@v4              # Setup Java
- uses: actions/cache@v4                   # Cache deps
- uses: actions/upload-artifact@v4         # Upload build output
- uses: docker/build-push-action@v5        # Build + push Docker
- uses: aws-actions/configure-aws-credentials@v4
- uses: azure/login@v1
- uses: hashicorp/setup-terraform@v3
- uses: SonarSource/sonarcloud-github-action@master
```

20000+ action trên [github.com/marketplace](https://github.com/marketplace?type=actions).

## Secrets

Settings → Secrets and variables → Actions → New repository secret.

```yaml
- name: Deploy to AWS
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: aws s3 cp build/ s3://bucket/
```

Hoặc OIDC (recommended cho AWS):

```yaml
permissions:
  id-token: write
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: arn:aws:iam::123:role/github-actions
      aws-region: us-east-1
```

OIDC = không cần lưu credential lâu dài.

## Environments

Define environment (staging, production) với protection rules:

Settings → Environments → New environment:
- Required reviewers (PR approval).
- Wait timer.
- Deployment branch restriction.

```yaml
jobs:
  deploy-prod:
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://app.acme.com
    steps:
      - run: ./deploy.sh
```

Production environment → reviewer phải approve trước job chạy.

## Cache dependencies

```yaml
- name: Cache Maven
  uses: actions/cache@v4
  with:
    path: ~/.m2/repository
    key: ${{ runner.os }}-maven-${{ hashFiles('**/pom.xml') }}
    restore-keys: ${{ runner.os }}-maven-

- name: Cache npm
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
```

Hoặc dùng setup action có cache built-in:

```yaml
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm                       # Auto-cache npm

- uses: actions/setup-java@v4
  with:
    java-version: 17
    cache: maven
```

## Full pipeline cho vProfile

```yaml
name: vProfile CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: vprofile

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: 17
          distribution: temurin
          cache: maven

      - name: Unit test
        run: mvn test

      - name: Code coverage
        run: mvn jacoco:report

      - name: Upload coverage
        uses: codecov/codecov-action@v4

  build:
    runs-on: ubuntu-latest
    needs: test
    outputs:
      version: ${{ steps.meta.outputs.version }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: 17
          distribution: temurin
          cache: maven

      - name: Build
        run: mvn package -DskipTests

      - name: Upload WAR
        uses: actions/upload-artifact@v4
        with:
          name: war
          path: target/*.war

      - id: meta
        run: echo "version=$(date +%Y%m%d)-${GITHUB_SHA::7}" >> $GITHUB_OUTPUT

  sonar:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - uses: actions/setup-java@v4
        with:
          java-version: 17
          distribution: temurin

      - name: SonarCloud scan
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        run: |
          mvn -B verify org.sonarsource.scanner.maven:sonar-maven-plugin:sonar \
            -Dsonar.organization=acme \
            -Dsonar.host.url=https://sonarcloud.io

  docker:
    runs-on: ubuntu-latest
    needs: [build, sonar]
    if: github.ref == 'refs/heads/main'
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/download-artifact@v4
        with: { name: war, path: target/ }

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123:role/github-actions
          aws-region: ${{ env.AWS_REGION }}

      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr

      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ${{ steps.ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:${{ needs.build.outputs.version }}
            ${{ steps.ecr.outputs.registry }}/${{ env.ECR_REPOSITORY }}:latest

  deploy-staging:
    runs-on: ubuntu-latest
    needs: docker
    environment:
      name: staging
      url: https://staging.acme.com
    steps:
      - name: Deploy to ECS
        run: |
          aws ecs update-service --cluster staging --service vprofile --force-new-deployment

  deploy-production:
    runs-on: ubuntu-latest
    needs: deploy-staging
    environment:
      name: production
      url: https://app.acme.com
    steps:
      - name: Deploy to ECS
        run: |
          aws ecs update-service --cluster production --service vprofile --force-new-deployment
```

Đây là **enterprise-grade pipeline**: test → build → SonarCloud → Docker → ECR → ECS staging → manual approval → ECS production.

## So sánh Jenkins vs Actions

| | Jenkins Pipeline | GitHub Actions Workflow |
|---|---|---|
| Lang | Groovy | YAML |
| File location | `Jenkinsfile` repo root | `.github/workflows/*.yml` |
| Marketplace | Plugin | Action |
| Reusable code | Shared library Groovy | Composite action, reusable workflow |
| Secrets | Credentials Store | Repository/org secrets |
| Concurrency | Limited | Matrix + workflow concurrency |
| Server cost | EC2 host | Free 2000 min/month, $0.008/min after |
| Cost dev experience | Setup hours | 5 minutes |

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `secrets.X` trong fork PR | Không access (security) | Trigger limited workflow |
| Default GITHUB_TOKEN scope | Permission denied | Set `permissions:` block |
| Cache key không hash version | Cache stale | Include `hashFiles()` |
| Matrix khổng lồ | Free minute hết nhanh | Limit matrix với `if:` |
| `if: failure()` default | Step có thể skip | `if: always()` cho cleanup |
| Self-hosted runner public | Anyone PR trigger | Allowed list workflow |
| Action không pin version | Supply chain attack | Pin commit SHA cho production |

## Migration Jenkins → Actions

Convert pattern:

| Jenkins | Actions |
|---|---|
| `pipeline { agent any }` | `runs-on: ubuntu-latest` |
| `stages { stage('X') { ... } }` | `jobs: x:` |
| `steps { sh 'cmd' }` | `steps: - run: cmd` |
| `tools { maven 'Maven-3.9' }` | `actions/setup-java@v4 with cache: maven` |
| `withCredentials(...)` | `env: TOKEN: ${{ secrets.X }}` |
| `post { success { slack } }` | `if: success()` step + slack action |

Tool **gh-act**: chạy GitHub Actions locally để test.

## Tóm tắt bài 1

- **GitHub Actions** = CI/CD built-in, YAML workflow.
- File: `.github/workflows/*.yml`. Event → Job → Step → Action.
- Runner: GitHub-hosted (free 2k min) hoặc self-hosted.
- **Marketplace 20k+ action** reusable.
- **Matrix strategy** = test multi-version song song.
- **Environments** + approval cho production.
- **OIDC** cho AWS = không lưu credential lâu dài.
- Cache với `actions/cache` hoặc setup-* action.

**Phase kế tiếp** → [Phase 19 — Bài 1: GitLab CI/CD](../phase-19-gitlab/01-gitlab-overview.md)

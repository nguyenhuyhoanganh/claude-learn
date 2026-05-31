# Bài 2: GitLab CI/CD pipeline — vProfile end-to-end

Implement vProfile pipeline trên GitLab CI/CD. So sánh với Jenkins (phase 17) và GitHub Actions (phase 18).

## Pipeline cấu trúc

GitLab dùng `stages` (như Jenkins) + jobs:

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - build
  - test
  - quality
  - package
  - deploy-staging
  - integration
  - deploy-production
  - notify
```

Mỗi stage chạy tuần tự; jobs trong cùng stage chạy song song.

## Full pipeline

```yaml
include:
  - template: Security/SAST.gitlab-ci.yml
  - template: Security/Secret-Detection.gitlab-ci.yml
  - template: Security/Dependency-Scanning.gitlab-ci.yml
  - template: Security/Container-Scanning.gitlab-ci.yml

stages:
  - validate
  - build
  - test
  - quality
  - package
  - deploy-staging
  - integration
  - deploy-production
  - notify

variables:
  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2/repository -Dorg.slf4j.simpleLogger.log.org.apache.maven.cli.transfer.Slf4jMavenTransferListener=warn"
  MAVEN_CLI_OPTS: "--batch-mode --errors --fail-at-end --show-version"
  IMAGE: $CI_REGISTRY_IMAGE
  TAG: $CI_COMMIT_REF_SLUG-$CI_COMMIT_SHORT_SHA
  AWS_REGION: us-east-1
  ECR_REPO: vprofile

cache:
  key:
    files:
      - pom.xml
  paths:
    - .m2/repository/
    - target/

default:
  image: maven:3.9-eclipse-temurin-17

# ============================================
# VALIDATE
# ============================================
lint:
  stage: validate
  script:
    - mvn $MAVEN_CLI_OPTS checkstyle:check
  artifacts:
    when: on_failure
    paths:
      - target/checkstyle-result.xml
    expire_in: 1 week

# ============================================
# BUILD
# ============================================
compile:
  stage: build
  script:
    - mvn $MAVEN_CLI_OPTS compile
  artifacts:
    paths:
      - target/classes/
    expire_in: 1 hour

# ============================================
# TEST (parallel)
# ============================================
unit-test:
  stage: test
  script:
    - mvn $MAVEN_CLI_OPTS test
  artifacts:
    when: always
    reports:
      junit: target/surefire-reports/TEST-*.xml
    paths:
      - target/site/jacoco/
    expire_in: 1 week
  coverage: '/Total.*?([0-9]{1,3})%/'

# ============================================
# QUALITY
# ============================================
sonar:
  stage: quality
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_BRANCH == "develop"'
    - if: '$CI_MERGE_REQUEST_IID'
  variables:
    SONAR_USER_HOME: "${CI_PROJECT_DIR}/.sonar"
  cache:
    key: "${CI_JOB_NAME}"
    paths:
      - .sonar/cache/
  script:
    - mvn $MAVEN_CLI_OPTS verify sonar:sonar
        -Dsonar.qualitygate.wait=true
        -Dsonar.host.url=$SONAR_HOST_URL
        -Dsonar.login=$SONAR_TOKEN
        -Dsonar.projectKey=acme_vprofile

# ============================================
# PACKAGE
# ============================================
build-jar:
  stage: package
  script:
    - mvn $MAVEN_CLI_OPTS package -DskipTests
  artifacts:
    paths:
      - target/*.war
    expire_in: 1 week
    name: "vprofile-${TAG}"

build-docker:
  stage: package
  needs: [build-jar]
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_BRANCH == "develop"'
  image: docker:24
  services:
    - docker:24-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  before_script:
    - apk add --no-cache aws-cli
    - aws ecr get-login-password --region $AWS_REGION |
        docker login --username AWS --password-stdin $ECR_URI
  script:
    - docker build
        --build-arg VERSION=$TAG
        -t $ECR_URI/$ECR_REPO:$TAG
        -t $ECR_URI/$ECR_REPO:$CI_COMMIT_REF_SLUG-latest
        .
    - docker push $ECR_URI/$ECR_REPO:$TAG
    - docker push $ECR_URI/$ECR_REPO:$CI_COMMIT_REF_SLUG-latest

# Trivy scan
trivy-scan:
  stage: package
  needs: [build-docker]
  image:
    name: aquasec/trivy:latest
    entrypoint: [""]
  variables:
    TRIVY_NO_PROGRESS: "true"
    TRIVY_CACHE_DIR: ".trivycache/"
  script:
    - trivy image
        --severity HIGH,CRITICAL
        --format json
        --output trivy-report.json
        $ECR_URI/$ECR_REPO:$TAG
  artifacts:
    when: always
    paths:
      - trivy-report.json
    reports:
      container_scanning: trivy-report.json

# ============================================
# DEPLOY STAGING
# ============================================
deploy-staging:
  stage: deploy-staging
  rules:
    - if: '$CI_COMMIT_BRANCH == "main" || $CI_COMMIT_BRANCH == "develop"'
  image:
    name: bitnami/kubectl:1.28
    entrypoint: [""]
  environment:
    name: staging
    url: https://staging.vprofile.acme.com
    deployment_tier: staging
  before_script:
    - apk add --no-cache aws-cli
    - aws eks update-kubeconfig --name vprofile-staging --region $AWS_REGION
  script:
    - kubectl -n vprofile-staging
        set image deployment/vprofile
        tomcat=$ECR_URI/$ECR_REPO:$TAG
    - kubectl -n vprofile-staging
        rollout status deployment/vprofile --timeout=10m
  after_script:
    - sleep 30
    - for i in {1..30}; do
        if curl -fsS https://staging.vprofile.acme.com/login > /dev/null; then
          echo "Healthy"; exit 0;
        fi;
        sleep 10;
      done;
      exit 1

# ============================================
# INTEGRATION TEST
# ============================================
integration-test:
  stage: integration
  needs: [deploy-staging]
  rules:
    - if: '$CI_COMMIT_BRANCH == "main" || $CI_COMMIT_BRANCH == "develop"'
  script:
    - mvn $MAVEN_CLI_OPTS failsafe:integration-test failsafe:verify
        -Dintegration.url=https://staging.vprofile.acme.com
  artifacts:
    when: always
    reports:
      junit: target/failsafe-reports/TEST-*.xml

# ============================================
# DEPLOY PRODUCTION (manual)
# ============================================
deploy-production:
  stage: deploy-production
  needs: [integration-test]
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual
      allow_failure: false
  image:
    name: bitnami/kubectl:1.28
    entrypoint: [""]
  environment:
    name: production
    url: https://vprofile.acme.com
    deployment_tier: production
    on_stop: rollback-production
  before_script:
    - apk add --no-cache aws-cli
    - aws eks update-kubeconfig --name vprofile-prod --region $AWS_REGION
  script:
    - kubectl -n vprofile-prod
        set image deployment/vprofile-green
        tomcat=$ECR_URI/$ECR_REPO:$TAG
    - kubectl -n vprofile-prod
        rollout status deployment/vprofile-green --timeout=15m
    - sleep 60
    - curl -fsS http://internal-green-elb/login > /dev/null
    - kubectl patch service vprofile -n vprofile-prod
        -p '{"spec":{"selector":{"color":"green"}}}'
  after_script:
    - sleep 60
    - curl -fsS https://vprofile.acme.com/ > /dev/null || (echo "FAIL"; exit 1)

# Rollback (manual)
rollback-production:
  stage: deploy-production
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual
  image:
    name: bitnami/kubectl:1.28
    entrypoint: [""]
  environment:
    name: production
    action: stop
  before_script:
    - apk add --no-cache aws-cli
    - aws eks update-kubeconfig --name vprofile-prod --region $AWS_REGION
  script:
    - kubectl patch service vprofile -n vprofile-prod
        -p '{"spec":{"selector":{"color":"blue"}}}'

# ============================================
# NOTIFY
# ============================================
notify:
  stage: notify
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: always
  image: curlimages/curl:latest
  script:
    - |
      STATUS="${CI_JOB_STATUS}"
      if [ "$STATUS" = "success" ]; then EMOJI="✅"; COLOR="good"; fi
      if [ "$STATUS" = "failed" ]; then EMOJI="❌"; COLOR="danger"; fi

      curl -X POST $SLACK_WEBHOOK \
        -H 'Content-Type: application/json' \
        -d "{
          \"attachments\": [{
            \"color\": \"$COLOR\",
            \"title\": \"$EMOJI vProfile pipeline $STATUS\",
            \"text\": \"Branch: $CI_COMMIT_REF_NAME\nVersion: $TAG\nPipeline: $CI_PIPELINE_URL\"
          }]
        }"
```

## CI Variables setup

Settings → CI/CD → Variables:

| Variable | Type | Masked | Protected |
|---|---|---|---|
| `SONAR_TOKEN` | Variable | ✓ | ✓ |
| `SONAR_HOST_URL` | Variable | ✗ | ✗ |
| `AWS_ACCESS_KEY_ID` | Variable | ✓ | ✓ |
| `AWS_SECRET_ACCESS_KEY` | Variable | ✓ | ✓ |
| `ECR_URI` | Variable | ✗ | ✓ |
| `SLACK_WEBHOOK` | Variable | ✓ | ✓ |
| `KUBE_CONFIG_PROD` | File | ✓ | ✓ |

`Masked` = không xuất hiện trong log. `Protected` = chỉ apply cho protected branch (main, prod tags).

## Runner setup

### Shared (GitLab.com SaaS)

Free 400 phút/tháng cho private project. Default `image: docker:dind` work.

### Self-hosted

Setup runner trên EC2:

```bash
# Install gitlab-runner
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
sudo apt install -y gitlab-runner

# Register
sudo gitlab-runner register \
    --url https://gitlab.com \
    --token glrt-xxx \
    --executor docker \
    --docker-image alpine:latest \
    --docker-privileged \
    --description "vProfile runner EC2"
```

Tags trong job:

```yaml
build:
  tags:
    - docker
    - linux
```

### Kubernetes runner

```bash
helm repo add gitlab https://charts.gitlab.io
helm install gitlab-runner gitlab/gitlab-runner \
    -n gitlab-runner --create-namespace \
    --set gitlabUrl=https://gitlab.com \
    --set runnerRegistrationToken=xxx \
    --set rbac.create=true
```

Mỗi job spawn pod K8s riêng.

## DAG pipeline (parallel optimization)

Mặc định pipeline stage tuần tự. DAG cho phép parallel theo dependency:

```yaml
lint:
  stage: validate
  needs: []          # No dependency, start immediately

unit-test:
  stage: test
  needs: [compile]   # Start khi compile xong (không đợi cả test stage)

sonar:
  stage: quality
  needs: [unit-test]
```

Pipeline render thành DAG diagram → tối ưu critical path.

## Multi-project pipeline

Pipeline gọi pipeline khác:

```yaml
deploy-downstream:
  stage: deploy
  trigger:
    project: acme/infrastructure
    branch: main
    strategy: depend           # Wait downstream done
```

Use case:
- App pipeline trigger infra deploy.
- Monorepo: project root trigger sub-project pipeline.

## Review apps

Auto-deploy mỗi MR vào temporary environment:

```yaml
review-app:
  stage: deploy
  rules:
    - if: '$CI_MERGE_REQUEST_IID'
  environment:
    name: review/$CI_COMMIT_REF_SLUG
    url: https://$CI_COMMIT_REF_SLUG.review.acme.com
    auto_stop_in: 7 days
    on_stop: stop-review-app
  script:
    - ./deploy-review-app.sh

stop-review-app:
  stage: deploy
  rules:
    - if: '$CI_MERGE_REQUEST_IID'
      when: manual
  environment:
    name: review/$CI_COMMIT_REF_SLUG
    action: stop
  script:
    - ./teardown-review-app.sh
```

Reviewer click link trong MR → xem app live → approve.

## Merge train

Pipeline auto-merge khi green:

```yaml
# Settings: Merge requests → Pipelines must succeed
# Enable: Merge train
```

Khi PR ready merge → GitLab queue → chạy pipeline → merge nếu green.

Multiple PR queue serial → tránh broken main.

## Environment specific job

```yaml
.deploy-template:
  image: bitnami/kubectl
  before_script:
    - aws eks update-kubeconfig --name $CLUSTER --region $AWS_REGION
  script:
    - kubectl -n $NAMESPACE set image deployment/$APP $APP=$IMAGE:$TAG
    - kubectl -n $NAMESPACE rollout status deployment/$APP

deploy:dev:
  extends: .deploy-template
  variables:
    CLUSTER: dev-cluster
    NAMESPACE: dev
    APP: vprofile

deploy:staging:
  extends: .deploy-template
  variables:
    CLUSTER: staging-cluster
    NAMESPACE: staging
    APP: vprofile
```

`extends` = template reuse (như Jenkins `parent` Job DSL).

## So sánh 3 tools

| | Jenkins | GitHub Actions | GitLab CI |
|---|---|---|---|
| Config | Groovy | YAML | YAML |
| Lang power | High | Medium | Medium |
| UI | Average | Great | Great |
| Plugin ecosystem | 1800+ | 20000+ | Less |
| Self-host | ✓ | Enterprise | ✓ (CE) |
| SaaS | ✗ | ✓ | ✓ |
| Free CI minutes | Self-host | 2000/mo | 400/mo |
| Container Registry | Via Nexus | GHCR | Built-in |
| Auto DevOps | ✗ | ✗ | **✓** |
| Review apps | Manual | Manual | **Built-in** |
| Merge train | Plugin | ✗ | **Built-in** |
| Security scan | Plugin | Action | **Templates** |
| Multi-project | Manual | workflow_run | trigger |
| Learning | Steep | Easy | Easy |

GitLab CI: best **all-in-one** experience nếu dùng GitLab.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Variable không `masked` | Lộ trong log | Always mask secret |
| `protected` job chạy fork | Security risk | Restrict protected |
| Docker-in-docker không TLS | Connection fail | `DOCKER_TLS_CERTDIR: "/certs"` |
| No cache | Slow build | Cache `.m2`, `node_modules` |
| Pipeline minute hết | Block | Self-host runner |
| Review app forget stop | Resource leak | `auto_stop_in` |
| Manual job timeout | Hang | Set `when: manual` + reviewer |

## Tóm tắt bài 2

- GitLab CI/CD = stages → jobs YAML, gần Jenkins structure.
- **`include` templates** cho built-in security scan.
- **`extends`** template reuse jobs.
- **DAG `needs:`** parallel optimization.
- **`environment` + `on_stop`** + **review apps** mỗi MR.
- **Merge train** auto-merge queue.
- **Multi-project pipeline** trigger downstream.
- Self-host runner trên K8s scale infinite.

**Phase kế tiếp** → [Phase 20 — Python](../phase-20-python/01-python-cho-devops.md)

# Bài 1: GitLab — all-in-one DevOps platform

GitLab = Git host + CI/CD + container registry + monitoring + security — **mọi thứ DevOps trong 1 tool**. Self-host được, on-prem-friendly.

## Vì sao GitLab?

So với GitHub:

| | GitHub | GitLab |
|---|---|---|
| Host | SaaS + GitHub Enterprise | SaaS + **self-host free** |
| CI/CD | Actions (free 2k min) | CI built-in (free 400 min) |
| Container Registry | GHCR free | Built-in, free |
| Wiki, Issues | ✓ | ✓ |
| Built-in security scan | Dependabot, CodeQL | SAST, DAST, container scan |
| K8s integration | Manual | Native auto-deploy |
| Cost (private) | $4/user/mo | $0 (CE) / $19/user (Premium) |
| Best for | OSS community | Enterprise self-host |

GitLab CE (Community Edition) **free, open source** — self-host được full feature core.

## Setup GitLab tự host

### Docker

```bash
docker run -d \
    --name gitlab \
    --hostname gitlab.example.com \
    -p 80:80 -p 443:443 -p 22:22 \
    -v gitlab-config:/etc/gitlab \
    -v gitlab-logs:/var/log/gitlab \
    -v gitlab-data:/var/opt/gitlab \
    gitlab/gitlab-ce:latest
```

5-10 phút khởi tạo. Browser: `http://localhost` → login `root` + password trong:

```bash
docker exec -it gitlab cat /etc/gitlab/initial_root_password
```

### Cài trực tiếp Ubuntu

```bash
curl -s https://packages.gitlab.com/install/repositories/gitlab/gitlab-ce/script.deb.sh | sudo bash
sudo apt install -y gitlab-ce
sudo gitlab-ctl reconfigure
```

Resource requirement: **4 GB RAM minimum**.

## Projects và Groups

```text
GitLab instance
├── Group: acme
│   ├── Subgroup: backend
│   │   ├── Project: user-service
│   │   └── Project: payment-service
│   └── Subgroup: frontend
│       ├── Project: web-app
│       └── Project: mobile-app
└── Group: opensource
    └── Project: vprofile
```

Group = namespace, share permission. Subgroup nested.

## .gitlab-ci.yml — pipeline as code

```yaml
stages:
  - test
  - build
  - deploy

variables:
  MAVEN_OPTS: "-Dmaven.repo.local=.m2/repository"

cache:
  paths:
    - .m2/repository/

test:
  stage: test
  image: maven:3.9-eclipse-temurin-17
  script:
    - mvn test
  artifacts:
    reports:
      junit: target/surefire-reports/*.xml

build:
  stage: build
  image: maven:3.9-eclipse-temurin-17
  script:
    - mvn package -DskipTests
  artifacts:
    paths:
      - target/*.war
    expire_in: 7 days

deploy_staging:
  stage: deploy
  image: alpine
  script:
    - apk add openssh-client
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | ssh-add -
    - scp target/*.war user@staging:/opt/tomcat/webapps/ROOT.war
    - ssh user@staging "sudo systemctl restart tomcat"
  environment:
    name: staging
    url: https://staging.acme.com
  only:
    - main

deploy_production:
  stage: deploy
  image: alpine
  script:
    - apk add openssh-client
    - eval $(ssh-agent -s)
    - echo "$SSH_PRIVATE_KEY" | ssh-add -
    - scp target/*.war user@prod:/opt/tomcat/webapps/ROOT.war
    - ssh user@prod "sudo systemctl restart tomcat"
  environment:
    name: production
    url: https://app.acme.com
  when: manual
  only:
    - main
```

Concepts giống Jenkins/Actions: stages → jobs → script.

## Concepts

| Term | Mô tả |
|---|---|
| **Stage** | Logical group jobs (test, build, deploy) |
| **Job** | Unit of work, chạy trong stage |
| **Script** | Shell command trong job |
| **Image** | Docker image làm runtime |
| **Runner** | Server chạy job |
| **Artifact** | File pass giữa job |
| **Cache** | Reusable files between pipelines |
| **Environment** | Deploy target (staging, prod) |

## Runners

### Shared (GitLab.com SaaS)

Free 400 phút/month private project. Public unlimited.

### Specific (self-hosted)

Setup runner trên VM:

```bash
# Add GitLab repo
curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash

# Install
sudo apt install -y gitlab-runner

# Register
sudo gitlab-runner register \
    --url https://gitlab.com \
    --token YOUR_TOKEN \
    --executor docker \
    --docker-image alpine
```

Tags để pipeline target runner cụ thể:

```yaml
job:
  tags:
    - docker
    - linux
```

### Kubernetes runner

```bash
helm install gitlab-runner gitlab/gitlab-runner -f values.yaml
```

Runner spawn pod K8s per job.

## Variables

CI/CD → Variables → Add:
- **Variable**: plain (env name).
- **File**: file content (vd kubeconfig).
- **Masked**: hide trong log.
- **Protected**: chỉ protected branch.

```yaml
deploy:
  script:
    - aws configure set aws_access_key_id $AWS_KEY
    - aws s3 cp build/ s3://$BUCKET/
```

Built-in vars: `$CI_COMMIT_SHA`, `$CI_PIPELINE_ID`, `$CI_ENVIRONMENT_NAME`, ...

## Auto DevOps

GitLab tự generate pipeline cho project mới:
- Detect ngôn ngữ → suggest stages.
- Auto build container.
- Auto scan SAST/DAST.
- Auto deploy K8s nếu có cluster connect.

Disable nếu muốn custom.

## Container Registry

GitLab built-in registry. URL: `registry.gitlab.com/group/project`.

```yaml
build_docker:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
```

`$CI_REGISTRY*` variables auto-set.

## GitLab Pages

Host static site free:

```yaml
pages:
  stage: deploy
  script:
    - mkdir public
    - cp -r build/* public/
  artifacts:
    paths:
      - public
  only:
    - main
```

URL: `https://group.gitlab.io/project`.

## Security scan built-in

```yaml
include:
  - template: Security/SAST.gitlab-ci.yml
  - template: Security/Container-Scanning.gitlab-ci.yml
  - template: Security/Dependency-Scanning.gitlab-ci.yml
  - template: Security/DAST.gitlab-ci.yml
```

Tự generate report trong UI MR (merge request).

## Merge Request (MR)

Tương đương Pull Request. Pipeline chạy trên MR:

```yaml
test:
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

MR có:
- Approval requirement.
- Status check.
- Discussion thread.
- Merge train (queue auto-merge khi CI green).

## Compare to GitHub Actions / Jenkins

| Use case | Tool |
|---|---|
| GitHub host, simple project | GitHub Actions |
| Self-host critical | GitLab CE |
| Enterprise on-prem | GitLab Premium / Jenkins |
| Heavy plugin needs | Jenkins |
| Multi-language matrix | GitHub Actions / GitLab |
| Open source contribution | GitHub Actions (free unlimited public) |

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Quên cache | Build chậm | `cache: paths:` |
| Runner shared bị queue | Build chờ | Self-host runner |
| Image pull rate limit | Build fail | Cache layer, mirror |
| Secret trong .gitlab-ci.yml | Lộ | CI Variable masked |
| Production deploy auto | Risk | `when: manual` |
| Single runner | SPOF | Multiple runner |
| Disk space exhausted | Pipeline fail | Cleanup artifact + cache |

## Tóm tắt bài 1

- **GitLab** = all-in-one DevOps platform (Git + CI/CD + Registry + Pages + Security).
- **CE** self-host **free**, full core feature.
- `.gitlab-ci.yml` ở repo root, stages → jobs → script.
- Runner: shared GitLab.com hoặc self-host (Docker/K8s executor).
- CI Variables masked + protected cho secret.
- **Container Registry built-in** free.
- **GitLab Pages** host static site free.
- **Security scan** built-in (SAST/DAST/dependency/container).
- **Auto DevOps** auto-generate pipeline cho project mới.

**Phase kế tiếp** → [Phase 20 — Bài 1: Python cho DevOps](../phase-20-python/01-python-cho-devops.md)

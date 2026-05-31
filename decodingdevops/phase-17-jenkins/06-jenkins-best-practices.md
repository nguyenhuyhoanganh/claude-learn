# Bài 6: Jenkins best practices — security, scaling, observability

Bài cuối phase 17. Tổng hợp **best practices production-grade** + alternative khi rời Jenkins.

## Security checklist

### Authentication

- [ ] Disable anonymous read.
- [ ] LDAP / SAML / OAuth integration (no local accounts).
- [ ] MFA cho admin user (qua reverse proxy hoặc plugin).
- [ ] Service accounts cho CI integration (Slack, Jira, ...).

### Authorization

- [ ] **Role-based** authorization (RBAC plugin).
- [ ] Project-based permission cho folder.
- [ ] Build user identity propagate (Build User Vars plugin).
- [ ] Restrict `script` step (sandboxed Groovy).

```groovy
// Block tag: allow only safe methods
@Library('shared-lib@main') _
// Sandbox prevent malicious code in pipeline
```

### Credentials

- [ ] Use Credentials Store, never inline.
- [ ] Mask password trong log (`maskPasswords` plugin).
- [ ] External secret store: Vault, AWS Secrets Manager.
- [ ] Rotate credential 90 ngày.

```groovy
withCredentials([usernamePassword(credentialsId: 'nexus', usernameVariable: 'USER', passwordVariable: 'PASS')]) {
    sh 'mvn deploy -Dnexus.user=$USER -Dnexus.pass=$PASS'
}
```

### Plugin

- [ ] Auto-update plugin định kỳ.
- [ ] Monitor security advisory (jenkins.io/security).
- [ ] Remove unused plugin.
- [ ] Test plugin upgrade trên staging.

### Network

- [ ] HTTPS only (reverse proxy nginx).
- [ ] Jenkins behind VPN/SSO gateway (Pomerium, Cloudflare Access).
- [ ] Restrict agent connection (firewall rule).
- [ ] Disable JNLP if not needed.

### Audit

- [ ] Audit log mọi action (Audit Trail plugin).
- [ ] Forward log → SIEM (Splunk, ELK).
- [ ] Alert on:
  - Failed login attempts.
  - Plugin install.
  - Credential changes.
  - Pipeline modify.

## Scaling

### Master capacity

Master = orchestrator. Avoid build trên master.

```text
Master config:
- Number of executors: 0
- Java heap: -Xmx2g cho < 500 job
- -Xmx4g cho 500-2000 job
- -Xmx8g cho > 2000 job
```

### Static agents

| Workload | Agent count |
|---|---|
| < 50 build/day | 2-3 agent |
| 50-500 build/day | 5-10 agent |
| > 500 build/day | K8s dynamic |

Static agent on EC2 → Auto Scaling Group:

```bash
# Launch template với agent.jar + auto-connect
# ASG: min 2, max 10, target tracking CPU 70%
```

### Kubernetes dynamic agents

Modern best practice:

```yaml
# casc.yaml
clouds:
  - kubernetes:
      name: k8s
      serverUrl: https://kubernetes.default
      namespace: jenkins
      jenkinsUrl: http://jenkins.jenkins.svc:8080
      maxRequestsPerHost: 100
      retentionTimeout: 5
      templates:
        - name: maven-builder
          label: maven
          instanceCap: 50          # Max 50 concurrent pods
          idleMinutes: 1
          ...
```

Spawn pod khi job queue → terminate sau 1 phút idle.

Scale infinite mà không tốn cost idle.

### Job throttling

```groovy
options {
    throttle(['deploy-prod'])      // Max 1 build cùng lúc với tag này
}
```

Plugin Throttle Concurrent Builds.

### Pipeline performance

Speedup:
- **Cache deps**: PVC for `~/.m2`, `node_modules`.
- **Parallel stages**.
- **Skip stages** với `when` conditional.
- **Shallow clone**: `git fetch --depth 1`.
- **Layer Docker cache**.

```groovy
checkout([$class: 'GitSCM',
    extensions: [[$class: 'CloneOption', depth: 1, shallow: true]]
])
```

## Observability

### Prometheus metrics

Plugin "Prometheus metrics":

```text
GET /prometheus/

# HELP jenkins_executor_count_value
jenkins_executor_count_value 50
jenkins_queue_size_value{type="buildable"} 3
jenkins_builds_duration_milliseconds{jobName="vprofile"} 245000
```

Scrape Prometheus → Grafana dashboard:
- Build duration trend.
- Queue size.
- Executor utilization.
- Plugin update.

### Log aggregation

Jenkins log:
- `/var/log/jenkins/jenkins.log`.
- Per-build log trong `/var/lib/jenkins/jobs/<job>/builds/<n>/log`.

Forward log → ELK:

```bash
# Filebeat config
filebeat.inputs:
  - type: log
    paths:
      - /var/log/jenkins/*.log
      - /var/lib/jenkins/jobs/*/builds/*/log
    fields:
      service: jenkins
```

Query failed build error pattern trong Kibana.

### Health check

```bash
# Jenkins JSON status
curl -u user:token http://jenkins.acme.com/api/json?tree=jobs[name,color]

# Or built-in health
curl http://jenkins.acme.com/login
# 200 = healthy
```

Uptime monitor: Pingdom, UptimeRobot.

## Backup & Disaster Recovery

### Backup strategy

3-2-1 rule:
- **3** copies of data.
- **2** different storage media.
- **1** offsite.

```text
Daily backup:
  ├── Local /var/backup (7 ngày)
  ├── S3 (90 ngày, lifecycle Glacier sau 30d)
  └── Cross-region S3 (90 ngày, DR)
```

### What to backup

Critical:
- `/var/lib/jenkins/config.xml`
- `/var/lib/jenkins/jobs/*/config.xml`
- `/var/lib/jenkins/users/`
- `/var/lib/jenkins/secrets/`
- `/var/lib/jenkins/credentials.xml`

Skip:
- `/var/lib/jenkins/workspace/` (build workspace, recreate được).
- `/var/lib/jenkins/jobs/*/builds/` (log cũ, optional keep).
- `/var/lib/jenkins/caches/`.

### Disaster Recovery test

Quarterly:
1. Spin up Jenkins instance từ backup.
2. Verify mọi job restorable.
3. Verify credential decrypt được.
4. Restore time = RTO.

## Job DSL — programmatic job creation

Plugin "Job DSL" → Groovy script tạo job:

```groovy
// jobs.groovy
job('vprofile-build') {
    description('Build vProfile from main')
    scm {
        git {
            remote {
                url('git@github.com:acme/vprofile.git')
                credentials('github-ssh')
            }
            branch('main')
        }
    }
    triggers {
        scm('H/5 * * * *')
    }
    steps {
        maven('clean package', 'pom.xml')
    }
    publishers {
        archiveJunit('target/surefire-reports/*.xml')
        archiveArtifacts('target/*.war')
        slackNotifier {
            room('#ci')
            notifyFailure(true)
        }
    }
}

// Tạo 5 job tương tự
['api', 'web', 'mobile', 'admin', 'worker'].each { name ->
    job("vprofile-${name}") {
        // ... template
    }
}
```

DSL job:
- "Process Job DSLs" step trong seed job.
- Run seed job → create/update tất cả jobs.
- DSL script in Git → version control.

## Folder organization

```text
Jenkins/
├── vprofile/
│   ├── build (Pipeline)
│   ├── deploy (Pipeline)
│   └── nightly (Pipeline)
├── shared-services/
│   ├── infra-update (Pipeline)
│   └── backup-rotate (Pipeline)
└── seed/
    └── job-dsl-seed (Freestyle)
```

Folder = namespace + permission scope.

## Alternative khi rời Jenkins

| Reason | Alternative |
|---|---|
| Tired of plugin ops | **GitHub Actions** (SaaS) |
| GitLab user | **GitLab CI/CD** |
| K8s-native | **Tekton**, **Argo Workflows** |
| GitOps | **Argo CD**, **Flux** |
| Cloud-native AWS | **CodePipeline + CodeBuild** |
| Modern UI | **CircleCI**, **Buildkite** |

Migration strategy:
1. Audit existing pipeline.
2. Convert 1-2 simple pipelines → new tool.
3. Run parallel 1-3 tháng.
4. Migrate critical pipeline.
5. Decommission Jenkins.

## Comparison

| | Jenkins | GitHub Actions | GitLab CI | Tekton |
|---|---|---|---|---|
| Self-host | ✓ | Enterprise | ✓ | ✓ |
| SaaS | ✗ | ✓ | ✓ | ✗ |
| Plugin | 1800+ | 20000+ actions | Less | Tasks |
| Pipeline language | Groovy | YAML | YAML | YAML |
| K8s-native | Via plugin | No | Limited | **Yes** |
| Learning curve | Steep | Easy | Easy | Steep |
| Modern UI | Old (Blue Ocean better) | Modern | Modern | CLI mostly |
| Free tier | Free (self-host) | 2000 min | 400 min | Free (self-host) |
| Best for | Legacy, complex | Modern, GitHub | GitLab user | Cloud-native |

## Pipeline maturity model

| Level | Characteristics |
|---|---|
| **0** | No CI/CD. Manual deploy. |
| **1** | CI: build + test on commit. Manual deploy. |
| **2** | CI/CD: auto-deploy to staging. Manual prod. |
| **3** | Continuous Delivery: 1-click prod deploy. |
| **4** | Continuous Deployment: auto prod on green. |
| **5** | GitOps: declarative deploy, observability. |

Phase 17 + 25 → bạn ở level 4. Argo CD/GitOps → level 5.

## Final checklist

Production Jenkins:

- [ ] HTTPS + reverse proxy.
- [ ] Configuration as Code.
- [ ] Plugin auto-update.
- [ ] LDAP/SAML auth.
- [ ] RBAC.
- [ ] Credentials Store (no inline).
- [ ] Audit log.
- [ ] Backup daily + S3.
- [ ] DR test quarterly.
- [ ] K8s dynamic agents.
- [ ] Prometheus metrics.
- [ ] Log → ELK.
- [ ] Multi-branch pipeline.
- [ ] Pipeline in repo.
- [ ] Shared library.
- [ ] Quality gate (Sonar).
- [ ] Security scan (Trivy, OWASP).
- [ ] Notification (Slack/email).
- [ ] Deploy strategy (Blue/Green, Canary).
- [ ] Smoke test.
- [ ] Approval cho prod.

## Tổng kết phase 17

6 bài cover:
1. Jenkins basics.
2. Installation + JCasC + agents.
3. Declarative Pipeline syntax.
4. vProfile CI/CD end-to-end.
5. Shared Library.
6. Best practices + alternatives.

Skills:
- Setup production Jenkins.
- Viết pipeline cho mọi tech stack.
- Reusable code shared library.
- Security hardening.
- Migration path khi cần.

## Tóm tắt bài 6

- **Security**: HTTPS, RBAC, Credentials Store, audit log, plugin update.
- **Scaling**: K8s dynamic agents, ASG static agent, throttle.
- **Observability**: Prometheus + Grafana + ELK.
- **Backup 3-2-1** + quarterly DR test.
- **Job DSL** programmatic job creation.
- **Folder** organization + permission.
- **Alternatives**: GitHub Actions, GitLab CI, Tekton.
- Pipeline maturity: aim level 4-5 (Continuous Deployment + GitOps).

**Phase kế tiếp** → [Phase 18 — GitHub Actions](../phase-18-github-actions/01-github-actions.md)

# Bài 3: Declarative Pipeline syntax đầy đủ

Pipeline = trái tim của Jenkins modern. Bài này cover **mọi section + directive** của Declarative Pipeline.

## Cấu trúc tổng thể

```groovy
pipeline {
    agent { ... }                  // Where to run
    environment { ... }             // Env variables
    options { ... }                 // Pipeline options
    parameters { ... }              // User inputs
    triggers { ... }                // Auto trigger
    tools { ... }                   // Auto-install tool
    stages {                        // Main work
        stage('Name') {
            agent { ... }           // Stage-level override
            environment { ... }
            when { ... }            // Conditional execution
            input { ... }           // Manual approval
            options { ... }
            steps { ... }           // Actions
            post { ... }            // Post-stage
        }
    }
    post { ... }                   // Post-pipeline
}
```

## `agent` — runtime environment

```groovy
// Any available
agent any

// Specific node label
agent { label 'linux && docker' }

// No agent at top, define per-stage
agent none

// Docker container
agent {
    docker {
        image 'maven:3.9-eclipse-temurin-17'
        args '-v /var/run/docker.sock:/var/run/docker.sock'
    }
}

// Docker file in repo
agent {
    dockerfile {
        filename 'Dockerfile.build'
        args '--privileged'
    }
}

// Kubernetes
agent {
    kubernetes {
        yamlFile 'jenkins-pod.yaml'
    }
}
```

`agent none` = pipeline không có default agent, mỗi stage tự khai báo.

## `environment` — biến môi trường

```groovy
environment {
    APP_NAME = 'vprofile'
    BUILD_VERSION = "${env.BUILD_NUMBER}"

    // Credential binding
    AWS_CREDS = credentials('aws-prod')
    // → AWS_CREDS_USR + AWS_CREDS_PSW auto-set

    SONAR_TOKEN = credentials('sonar-token')
    // → SONAR_TOKEN = secret string
}
```

Access trong steps:

```groovy
steps {
    sh 'echo "Building $APP_NAME version $BUILD_VERSION"'
    sh '''
        aws s3 cp build/ s3://bucket/
        # AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY set từ AWS_CREDS
    '''
}
```

## `options` — pipeline options

```groovy
options {
    // Timeout cả pipeline
    timeout(time: 30, unit: 'MINUTES')

    // Retry pipeline nếu fail
    retry(2)

    // Build discarder (keep last 10)
    buildDiscarder(logRotator(numToKeepStr: '10'))

    // Disable concurrent build
    disableConcurrentBuilds()

    // Skip default checkout
    skipDefaultCheckout()

    // ANSI color output
    ansiColor('xterm')

    // Timestamp on log
    timestamps()

    // Quiet period before trigger
    quietPeriod(5)

    // Don't fail fast for parallel
    parallelsAlwaysFailFast()

    // Lock resource cho serial
    lock('shared-resource')
}
```

## `parameters` — user input

```groovy
parameters {
    string(name: 'VERSION', defaultValue: '1.0.0', description: 'Version to deploy')
    booleanParam(name: 'RUN_TESTS', defaultValue: true)
    choice(name: 'ENV', choices: ['dev', 'staging', 'prod'], description: 'Target env')
    password(name: 'DB_PASSWORD', defaultValue: '')
    text(name: 'RELEASE_NOTES', defaultValue: '')
    file(name: 'CONFIG_FILE', description: 'Custom config')
}
```

Access:

```groovy
steps {
    echo "Deploying ${params.VERSION} to ${params.ENV}"
    sh "./deploy.sh ${params.ENV} ${params.VERSION}"
}
```

UI tự generate form parameter khi click "Build with parameters".

## `triggers` — auto trigger

```groovy
triggers {
    // Cron schedule
    cron('H 2 * * *')                     // Daily ~2am (H = hash for distributed)

    // Poll SCM (avoid, use webhook)
    pollSCM('H/15 * * * *')               // Every 15 min

    // Upstream trigger
    upstream(upstreamProjects: 'job-a', threshold: hudson.model.Result.SUCCESS)
}
```

Modern: webhook từ GitHub/GitLab thay polling.

## `tools` — auto-install

Pre-config trong Manage Jenkins → Tools:

```groovy
tools {
    maven 'Maven-3.9'
    jdk 'JDK-17'
    nodejs 'Node-20'
}
```

Tools tự download + add vào PATH.

## `stages` & `stage` & `steps`

Khung skeleton:

```groovy
stages {
    stage('Checkout') {
        steps {
            git url: 'https://github.com/acme/vprofile.git', branch: 'main'
        }
    }

    stage('Build') {
        steps {
            sh 'mvn clean package -DskipTests'
        }
    }

    stage('Test') {
        steps {
            sh 'mvn test'
        }
        post {
            always {
                junit 'target/surefire-reports/*.xml'
            }
        }
    }
}
```

Stage chạy tuần tự. Trong stage, steps cũng tuần tự.

## Parallel stages

```groovy
stage('Tests') {
    parallel {
        stage('Unit') {
            steps { sh 'mvn test' }
        }
        stage('Integration') {
            steps { sh 'mvn verify' }
        }
        stage('Lint') {
            steps { sh 'mvn checkstyle:check' }
        }
    }
}
```

3 stage chạy đồng thời → faster pipeline.

`parallelsAlwaysFailFast()` option → 1 fail → cancel còn lại.

## `when` — conditional

```groovy
stage('Deploy Production') {
    when {
        branch 'main'
        // Hoặc
        allOf {
            branch 'main'
            environment name: 'DEPLOY_ENV', value: 'prod'
        }
        anyOf {
            branch 'main'
            branch 'release/*'
        }
        not { branch 'develop' }
        expression { return params.DEPLOY == true }
        buildingTag()
        tag 'v*'
        changeRequest()           // PR
        changelog '.*\\[deploy\\].*'
    }
    steps { ... }
}
```

## `input` — manual approval

```groovy
stage('Approval') {
    input {
        message "Deploy to production?"
        ok "Deploy"
        submitter "alice,bob"
        parameters {
            string(name: 'CHANGE_REASON', defaultValue: '', description: 'Why?')
        }
    }
    steps {
        echo "Approved by ${env.CHANGE_REASON}"
        sh './deploy-prod.sh'
    }
}
```

`submitter` = restrict user được approve. Audit log.

## `post` — after stage/pipeline

```groovy
post {
    always {
        // Always run, even on failure
        archiveArtifacts artifacts: 'target/*.war', fingerprint: true
        cleanWs()
    }
    success {
        slackSend channel: '#deploys', color: 'good',
                  message: "Build #${BUILD_NUMBER} succeeded"
    }
    failure {
        emailext to: 'team@acme.com',
                 subject: "Build #${BUILD_NUMBER} FAILED",
                 body: "${BUILD_URL}"
    }
    unstable {
        // Tests failed but build ok
    }
    changed {
        // Status changed from previous
    }
    fixed {
        // Failure → success
    }
    regression {
        // Success → failure
    }
    aborted {
        // Manually aborted
    }
    unsuccessful {
        // Anything not success
    }
    cleanup {
        // Run after all post conditions
    }
}
```

## Step library

Built-in steps:

| Step | Mục đích |
|---|---|
| `sh 'cmd'` | Shell command |
| `bat 'cmd'` | Windows batch |
| `powershell` | PowerShell |
| `echo 'msg'` | Print |
| `git url: ..., branch: ...` | Git checkout |
| `checkout scm` | Checkout multibranch |
| `archiveArtifacts artifacts: '...'` | Archive build output |
| `junit 'report.xml'` | Parse test report |
| `publishHTML` | Publish HTML report |
| `stash`, `unstash` | Share files between stages |
| `script { ... }` | Groovy block trong declarative |
| `input message: '...'` | Pause for user |
| `sleep time: 5, unit: 'SECONDS'` | Pause |
| `timeout(time: 5) { ... }` | Wrap with timeout |
| `retry(3) { ... }` | Retry block |
| `withCredentials([...]) { ... }` | Inject credential |
| `withEnv(['K=V']) { ... }` | Inject env |
| `dir('subdir') { ... }` | Change directory |
| `parallel(a: { ... }, b: { ... })` | Parallel block |
| `error 'msg'` | Fail with message |
| `unstable 'msg'` | Mark unstable |
| `currentBuild.result = 'UNSTABLE'` | Set result |

## `script` — Groovy escape

Declarative restrictive — `script {}` block cho phép Groovy thật:

```groovy
stage('Dynamic') {
    steps {
        script {
            def versions = ['v1', 'v2', 'v3']
            versions.each { v ->
                sh "echo Processing ${v}"
            }

            // Conditional
            if (env.BRANCH_NAME == 'main') {
                env.DEPLOY = 'true'
            }

            // Read JSON
            def config = readJSON file: 'config.json'
            echo "Port: ${config.port}"

            // Set build name
            currentBuild.displayName = "${BUILD_NUMBER}-${env.BRANCH_NAME}"
            currentBuild.description = "Deploy ${params.VERSION}"
        }
    }
}
```

Avoid `script` when possible — declarative cleaner.

## Stash & unstash

Share file giữa stage (đặc biệt across agents):

```groovy
stage('Build') {
    steps {
        sh 'mvn package'
        stash name: 'app-jar', includes: 'target/*.jar'
    }
}

stage('Deploy') {
    agent { label 'deploy-agent' }
    steps {
        unstash 'app-jar'
        sh 'scp target/*.jar prod:/opt/app/'
    }
}
```

## Shared file across builds

`archiveArtifacts` — bound to build:

```groovy
post {
    success {
        archiveArtifacts artifacts: 'target/*.war',
                         fingerprint: true,
                         onlyIfSuccessful: true
    }
}
```

Other build có thể download qua:

```groovy
copyArtifacts(projectName: 'upstream-job', filter: 'target/*.war')
```

## Notification examples

### Slack

```groovy
post {
    success {
        slackSend channel: '#ci',
                  color: 'good',
                  message: "Build #${BUILD_NUMBER} succeeded\n${BUILD_URL}"
    }
    failure {
        slackSend channel: '#alerts',
                  color: 'danger',
                  message: "Build #${BUILD_NUMBER} failed\n${BUILD_URL}"
    }
}
```

### Email

```groovy
emailext to: 'devops@acme.com',
         subject: "Jenkins: ${currentBuild.fullDisplayName}",
         body: '''
${SCRIPT, template="groovy-html.template"}
''',
         attachLog: true,
         mimeType: 'text/html'
```

### Microsoft Teams

```groovy
office365ConnectorSend webhookUrl: 'https://outlook.office.com/...',
                        message: "Build ${env.BUILD_NUMBER}: ${currentBuild.currentResult}"
```

## Multi-branch pipeline

Job type "Multibranch Pipeline" auto:
- Detect branch + PR.
- Run Jenkinsfile per branch.
- Auto-cleanup branch khi delete remote.

Setup:
1. Source: GitHub.
2. Credentials: PAT.
3. Behaviors: discover branches, discover pull requests from origin.
4. Build configuration: by Jenkinsfile.

Pipeline cùng codebase nhưng `env.BRANCH_NAME` khác → behavior khác:

```groovy
when {
    branch 'main'
}
steps {
    sh './deploy-prod.sh'
}
```

## Replay / Restart

Failed pipeline → Replay → modify Jenkinsfile → re-run.
Long pipeline fail step 5 → Restart from Stage → resume từ stage.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `sh` không quote variable | Inject vulnerability | Use single quote hoặc proper escape |
| Forget `cleanWs()` | Disk grow | Always cleanup in post |
| No timeout | Pipeline hang | `options { timeout(time: 30, unit: 'MINUTES') }` |
| Inline credential | Lộ | Always credentials() |
| Test fail → pipeline marked unstable | Continue when shouldn't | Decide unstable vs failure |
| Parallel chia sẻ workspace | Race condition | Use stash/unstash hoặc dir() |
| `def` trong declarative | Need script block | Use script {} |

## Tóm tắt bài 3

- Pipeline structure: agent → environment → options → stages → post.
- `agent` cấp pipeline hoặc per-stage (Docker, K8s, label).
- `environment.credentials()` auto-inject secret.
- `options` timeout, retry, buildDiscarder, ansiColor.
- `parameters` cho user input.
- `parallel` stages cho speedup.
- `when` conditional, `input` manual approval, `post` per-condition action.
- `script {}` escape sang Groovy khi declarative không đủ.
- `stash`/`unstash` chia sẻ file giữa stage.

**Bài kế tiếp** → [Bài 4: vProfile CI/CD pipeline đầy đủ](04-vprofile-cicd-pipeline.md)

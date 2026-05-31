# Bài 5: Shared Library — DRY code cho nhiều pipeline

10 pipeline copy-paste 200 dòng giống nhau = nightmare maintenance. **Shared Library** = Groovy code reusable, version control, test được.

## Cấu trúc Shared Library

```text
shared-lib/                       (Git repo riêng)
├── src/
│   └── com/acme/                 (Groovy classes)
│       ├── Build.groovy
│       └── Deploy.groovy
├── vars/                          (Pipeline steps)
│   ├── buildJavaApp.groovy
│   ├── deployK8s.groovy
│   └── notifySlack.groovy
├── resources/                     (Static files)
│   └── templates/
│       └── deploy.yaml.tmpl
└── README.md
```

3 loại file:
- **`vars/*.groovy`** = global variable / step (callable từ pipeline).
- **`src/com/acme/*.groovy`** = Groovy class (object-oriented).
- **`resources/*`** = file static (template, script).

## Setup Library

Manage Jenkins → System → Global Pipeline Libraries → Add:

| Field | Value |
|---|---|
| Name | `shared-lib` |
| Default version | `main` |
| Retrieval method | Modern SCM |
| Source: Git | URL: `git@github.com:acme/jenkins-shared-lib.git` |
| Credentials | github-ssh |

## Use trong Jenkinsfile

```groovy
@Library('shared-lib') _              // Load default version

// Hoặc specific version
@Library('shared-lib@v1.2.0') _

pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                buildJavaApp(version: env.BUILD_VERSION)
            }
        }
    }
}
```

## `vars/` — global step

`vars/buildJavaApp.groovy`:

```groovy
def call(Map config = [:]) {
    def version = config.version ?: 'latest'
    def skipTests = config.skipTests ?: false

    sh """
        mvn -B clean package ${skipTests ? '-DskipTests' : ''} \
            -Dbuild.version=${version}
    """

    archiveArtifacts artifacts: 'target/*.war', fingerprint: true
}
```

Call:

```groovy
buildJavaApp(version: '1.2.3')
buildJavaApp(version: '1.2.3', skipTests: true)
buildJavaApp()                              // default
```

`def call(...)` = function được expose. Method khác trong file = helper internal.

### Step phức tạp — multi-method

`vars/deployK8s.groovy`:

```groovy
def call(Map config) {
    validateConfig(config)
    updateImage(config)
    waitRollout(config)
    runSmokeTest(config)
}

def validateConfig(config) {
    assert config.namespace, "namespace required"
    assert config.deployment, "deployment required"
    assert config.image, "image required"
}

def updateImage(config) {
    sh """
        kubectl -n ${config.namespace} \
            set image deployment/${config.deployment} \
            ${config.container ?: config.deployment}=${config.image}
    """
}

def waitRollout(config) {
    def timeout = config.timeout ?: '10m'
    sh """
        kubectl -n ${config.namespace} \
            rollout status deployment/${config.deployment} \
            --timeout=${timeout}
    """
}

def runSmokeTest(config) {
    if (!config.healthCheck) return

    def maxAttempts = config.smokeAttempts ?: 30
    sh """
        for i in \$(seq 1 ${maxAttempts}); do
            if curl -fsS ${config.healthCheck} > /dev/null; then
                echo "Smoke test passed"
                exit 0
            fi
            sleep 10
        done
        echo "Smoke test FAILED"
        exit 1
    """
}
```

Call:

```groovy
deployK8s(
    namespace: 'vprofile-prod',
    deployment: 'vprofile',
    container: 'tomcat',
    image: "${env.ECR_URI}/vprofile:${env.BUILD_VERSION}",
    timeout: '15m',
    healthCheck: 'https://vprofile.acme.com/health',
    smokeAttempts: 30
)
```

## `vars/` block style

```groovy
// vars/withMavenCache.groovy
def call(Closure body) {
    def cacheDir = "/var/jenkins_home/maven-cache"
    sh "mkdir -p ${cacheDir}"
    withEnv(["MAVEN_REPO_LOCAL=${cacheDir}"]) {
        body()
    }
}
```

Call:

```groovy
withMavenCache {
    sh "mvn -B clean package -Dmaven.repo.local=\$MAVEN_REPO_LOCAL"
}
```

Block style ergonomic cho wrapper.

## `src/` — Groovy class

`src/com/acme/Build.groovy`:

```groovy
package com.acme

class Build implements Serializable {
    def steps                       // Pipeline context (sh, echo, ...)
    String version
    Map config

    Build(steps, Map config) {
        this.steps = steps
        this.config = config
        this.version = config.version ?: 'SNAPSHOT'
    }

    def compile() {
        steps.sh "mvn compile -Dbuild.version=${version}"
    }

    def test() {
        steps.sh "mvn test"
        steps.junit 'target/surefire-reports/*.xml'
    }

    def package_() {
        steps.sh "mvn package -DskipTests"
        steps.archiveArtifacts artifacts: 'target/*.war'
    }

    def runAll() {
        compile()
        test()
        package_()
    }
}
```

Sử dụng:

```groovy
@Library('shared-lib') _
import com.acme.Build

pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                script {
                    def b = new Build(this, version: env.BUILD_VERSION)
                    b.runAll()
                }
            }
        }
    }
}
```

`Serializable` mandatory — pipeline có thể pause/resume → state phải serialize được.

## `resources/` — static file

`resources/templates/k8s-deploy.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{NAME}}
  namespace: {{NAMESPACE}}
spec:
  replicas: {{REPLICAS}}
  template:
    spec:
      containers:
        - name: app
          image: {{IMAGE}}
          ports:
            - containerPort: {{PORT}}
```

Load trong pipeline:

```groovy
def template = libraryResource 'templates/k8s-deploy.yaml'
def manifest = template
    .replace('{{NAME}}', 'vprofile')
    .replace('{{NAMESPACE}}', 'vprofile-prod')
    .replace('{{REPLICAS}}', '3')
    .replace('{{IMAGE}}', env.IMAGE)
    .replace('{{PORT}}', '8080')

writeFile file: 'deploy.yaml', text: manifest
sh 'kubectl apply -f deploy.yaml'
```

## Real-world vars

### `vars/sendSlackNotification.groovy`

```groovy
def call(Map config) {
    def color = config.status == 'SUCCESS' ? 'good' : 'danger'
    def emoji = config.status == 'SUCCESS' ? '✅' : '❌'

    def message = """${emoji} *${config.app}* ${config.status}
Branch: ${env.BRANCH_NAME}
Build: <${env.BUILD_URL}|#${env.BUILD_NUMBER}>
Commit: ${env.GIT_COMMIT_SHORT ?: 'unknown'}
${config.extraMessage ?: ''}"""

    slackSend(
        channel: config.channel ?: '#ci',
        color: color,
        message: message
    )
}
```

```groovy
sendSlackNotification(
    app: 'vprofile',
    status: 'SUCCESS',
    channel: '#deploys',
    extraMessage: "Deployed to ${params.ENV}"
)
```

### `vars/dockerBuildPush.groovy`

```groovy
def call(Map config) {
    def image = "${config.registry}/${config.name}:${config.tag}"

    sh """
        docker build \
            --build-arg VERSION=${config.tag} \
            ${config.buildArgs ?: ''} \
            -t ${image} \
            ${config.latestTag ? "-t ${config.registry}/${config.name}:latest" : ''} \
            ${config.context ?: '.'}
    """

    if (config.scan) {
        sh "trivy image --severity HIGH,CRITICAL --exit-code 0 ${image}"
    }

    sh """
        docker push ${image}
        ${config.latestTag ? "docker push ${config.registry}/${config.name}:latest" : ''}
    """
}
```

```groovy
dockerBuildPush(
    registry: env.ECR_URI,
    name: 'vprofile',
    tag: env.BUILD_VERSION,
    latestTag: env.BRANCH_NAME == 'main',
    scan: true
)
```

## Library versioning

Pipeline pin version:

```groovy
@Library('shared-lib@v1.2.0') _      // Specific tag
@Library('shared-lib@main') _         // Branch tip
@Library('shared-lib@feature-xyz') _  // Feature branch (test)
```

Bump library version = bump release tag → pipeline opt-in.

## Test shared library

Test framework: **JenkinsPipelineUnit**.

`build.gradle`:

```groovy
plugins {
    id 'groovy'
}

dependencies {
    testImplementation 'com.lesfurets:jenkins-pipeline-unit:1.18'
    testImplementation 'org.junit.jupiter:junit-jupiter:5.10.0'
}
```

`test/BuildSpec.groovy`:

```groovy
import com.lesfurets.jenkins.unit.BasePipelineTest
import org.junit.jupiter.api.Test

class BuildSpec extends BasePipelineTest {

    @Test
    void should_build_with_default_version() {
        def script = loadScript('vars/buildJavaApp.groovy')
        script.call(version: '1.0.0')

        assert helper.callStack.find { c ->
            c.methodName == 'sh' && c.args[0].contains('mvn -B clean package')
        }
    }
}
```

CI/CD shared library = library cũng có pipeline test, version, release.

## Multiple libraries

```groovy
@Library(['shared-lib@v1.2.0', 'monitoring-lib@v0.5.0']) _

pipeline {
    stages {
        stage('Build') {
            steps {
                buildJavaApp(...)           // from shared-lib
                pushMetrics(...)             // from monitoring-lib
            }
        }
    }
}
```

## Dynamic library load

```groovy
library identifier: 'shared-lib@main',
        retriever: modernSCM([
            $class: 'GitSCMSource',
            remote: 'git@github.com:acme/jenkins-shared-lib.git',
            credentialsId: 'github-ssh'
        ])
```

Load library trong pipeline mà không cần Manage Jenkins config.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Not `Serializable` class | Pipeline pause fail | `implements Serializable` |
| `def` thay `String` type | Hard to maintain | Type hint mọi method |
| Global state | Race condition | Stateless functions |
| Library main branch | Break mọi pipeline khi push | Version + pin |
| No test | Bug hidden | JenkinsPipelineUnit |
| Hardcode credential | Lộ | Use credentials() in pipeline |
| Cycle dependency | Library load fail | Single responsibility |

## Tóm tắt bài 5

- **Shared Library** = code reuse cho nhiều pipeline.
- 3 folder: `vars/` (steps), `src/com/acme/` (classes), `resources/` (files).
- `def call(Map config)` = callable step.
- Block style: `def call(Closure body) { ... body() }`.
- Class trong `src/` phải `Serializable`.
- `libraryResource` load static file template.
- **Version library** với tag → pipeline pin version.
- Test với **JenkinsPipelineUnit**.

**Bài kế tiếp** → [Bài 6: Best practices + security + scaling](06-jenkins-best-practices.md)

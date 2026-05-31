# Bài 4: vProfile CI/CD pipeline đầy đủ end-to-end

Project capstone phase 17. Build pipeline production-grade cho vProfile: **Checkout → Build → Test → Sonar → Quality Gate → Artifact → Deploy → Smoke → Approval → Production**.

## Pipeline architecture

```text
GitHub push
    │ webhook
    ▼
Jenkins multi-branch
    │
    ▼
Checkout → Build .war → Unit test → Coverage → Sonar → Quality Gate
    │
    ▼
Build Docker image → Push ECR → Update task definition
    │
    ▼
Deploy ECS staging → Smoke test → Integration test
    │
    ▼
Manual approval (production)
    │
    ▼
Deploy ECS production (Blue/Green) → Smoke test → Notify
```

## Full Jenkinsfile

```groovy
@Library('shared-lib') _

pipeline {
    agent {
        kubernetes {
            yaml '''
                apiVersion: v1
                kind: Pod
                spec:
                  containers:
                    - name: maven
                      image: maven:3.9-eclipse-temurin-17
                      command: ["sleep"]
                      args: ["9999999"]
                      resources:
                        requests: {memory: 1Gi, cpu: 500m}
                        limits: {memory: 2Gi, cpu: 1000m}
                      volumeMounts:
                        - name: maven-cache
                          mountPath: /root/.m2
                    - name: docker
                      image: docker:24-cli
                      command: ["sleep"]
                      args: ["9999999"]
                      volumeMounts:
                        - name: docker-sock
                          mountPath: /var/run/docker.sock
                    - name: kubectl
                      image: bitnami/kubectl:1.28
                      command: ["sleep"]
                      args: ["9999999"]
                  volumes:
                    - name: maven-cache
                      persistentVolumeClaim:
                        claimName: jenkins-maven-cache
                    - name: docker-sock
                      hostPath:
                        path: /var/run/docker.sock
            '''
        }
    }

    options {
        timeout(time: 60, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))
        disableConcurrentBuilds()
        timestamps()
        ansiColor('xterm')
    }

    environment {
        APP_NAME = 'vprofile'
        ECR_URI = '123456789.dkr.ecr.us-east-1.amazonaws.com'
        SONAR_HOST = 'https://sonarcloud.io'
        SONAR_ORG = 'acme'
        AWS_REGION = 'us-east-1'
        SLACK_CHANNEL = '#deployments'
    }

    parameters {
        booleanParam(name: 'SKIP_TESTS', defaultValue: false, description: 'Skip tests')
        booleanParam(name: 'DEPLOY_PRODUCTION', defaultValue: false, description: 'Auto-deploy prod (skip approval)')
        choice(name: 'DEPLOY_STRATEGY', choices: ['blue-green', 'rolling', 'canary'], description: 'Production strategy')
    }

    stages {
        // ============================================
        // STAGE 1: Checkout
        // ============================================
        stage('Checkout') {
            steps {
                container('maven') {
                    checkout scm
                    script {
                        env.GIT_COMMIT_SHORT = sh(returnStdout: true, script: 'git rev-parse --short HEAD').trim()
                        env.GIT_COMMIT_MSG = sh(returnStdout: true, script: 'git log -1 --pretty=%B').trim()
                        env.BUILD_VERSION = "${env.BRANCH_NAME}-${env.BUILD_NUMBER}-${env.GIT_COMMIT_SHORT}"
                    }
                    echo "Building version: ${env.BUILD_VERSION}"
                }
            }
        }

        // ============================================
        // STAGE 2: Build
        // ============================================
        stage('Build') {
            steps {
                container('maven') {
                    sh '''
                        mvn -B clean package -DskipTests \
                            -Dmaven.repo.local=/root/.m2/repository
                    '''
                }
            }
        }

        // ============================================
        // STAGE 3: Quality (parallel)
        // ============================================
        stage('Quality') {
            when {
                expression { !params.SKIP_TESTS }
            }
            parallel {
                stage('Unit Tests') {
                    steps {
                        container('maven') {
                            sh 'mvn -B test'
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'target/surefire-reports/*.xml'
                        }
                    }
                }

                stage('Code Coverage') {
                    steps {
                        container('maven') {
                            sh 'mvn -B jacoco:report'
                            publishHTML target: [
                                allowMissing: false,
                                alwaysLinkToLastBuild: true,
                                keepAll: false,
                                reportDir: 'target/site/jacoco',
                                reportFiles: 'index.html',
                                reportName: 'Coverage Report'
                            ]
                        }
                    }
                }

                stage('Dependency Check') {
                    steps {
                        container('maven') {
                            sh 'mvn -B org.owasp:dependency-check-maven:check'
                            publishHTML target: [
                                allowMissing: true,
                                reportDir: 'target',
                                reportFiles: 'dependency-check-report.html',
                                reportName: 'OWASP Dependency Check'
                            ]
                        }
                    }
                }

                stage('Lint') {
                    steps {
                        container('maven') {
                            sh 'mvn -B checkstyle:check'
                        }
                    }
                }
            }
        }

        // ============================================
        // STAGE 4: SonarQube
        // ============================================
        stage('SonarCloud Scan') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                    changeRequest()
                }
            }
            environment {
                SONAR_TOKEN = credentials('sonar-token')
            }
            steps {
                container('maven') {
                    sh '''
                        mvn -B sonar:sonar \
                            -Dsonar.projectKey=${SONAR_ORG}_${APP_NAME} \
                            -Dsonar.organization=${SONAR_ORG} \
                            -Dsonar.host.url=${SONAR_HOST} \
                            -Dsonar.token=${SONAR_TOKEN} \
                            -Dsonar.branch.name=${BRANCH_NAME}
                    '''
                }
            }
        }

        stage('Quality Gate') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                timeout(time: 5, unit: 'MINUTES') {
                    waitForQualityGate abortPipeline: true
                }
            }
        }

        // ============================================
        // STAGE 5: Build Docker Image
        // ============================================
        stage('Docker Build & Push') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                container('docker') {
                    withCredentials([[
                        $class: 'AmazonWebServicesCredentialsBinding',
                        credentialsId: 'aws-ecr',
                        accessKeyVariable: 'AWS_ACCESS_KEY_ID',
                        secretKeyVariable: 'AWS_SECRET_ACCESS_KEY'
                    ]]) {
                        sh '''
                            apk add --no-cache aws-cli
                            aws ecr get-login-password --region ${AWS_REGION} | \
                                docker login --username AWS --password-stdin ${ECR_URI}

                            docker build \
                                --build-arg VERSION=${BUILD_VERSION} \
                                -t ${APP_NAME}:${BUILD_VERSION} \
                                -t ${ECR_URI}/${APP_NAME}:${BUILD_VERSION} \
                                -t ${ECR_URI}/${APP_NAME}:${BRANCH_NAME}-latest \
                                .

                            docker push ${ECR_URI}/${APP_NAME}:${BUILD_VERSION}
                            docker push ${ECR_URI}/${APP_NAME}:${BRANCH_NAME}-latest
                        '''
                    }
                }
            }
        }

        // ============================================
        // STAGE 6: Image Vulnerability Scan
        // ============================================
        stage('Trivy Scan') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                container('docker') {
                    sh '''
                        apk add --no-cache curl
                        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | \
                            sh -s -- -b /usr/local/bin

                        trivy image \
                            --severity HIGH,CRITICAL \
                            --exit-code 0 \
                            --format json \
                            --output trivy-report.json \
                            ${APP_NAME}:${BUILD_VERSION}
                    '''
                    archiveArtifacts artifacts: 'trivy-report.json', fingerprint: true
                }
            }
        }

        // ============================================
        // STAGE 7: Deploy Staging
        // ============================================
        stage('Deploy Staging') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                container('kubectl') {
                    withCredentials([file(credentialsId: 'kubeconfig-staging', variable: 'KUBECONFIG')]) {
                        sh '''
                            kubectl --kubeconfig=$KUBECONFIG -n vprofile-staging \
                                set image deployment/vprofile \
                                tomcat=${ECR_URI}/${APP_NAME}:${BUILD_VERSION}

                            kubectl --kubeconfig=$KUBECONFIG -n vprofile-staging \
                                rollout status deployment/vprofile --timeout=10m
                        '''
                    }
                }
            }
        }

        // ============================================
        // STAGE 8: Smoke Test Staging
        // ============================================
        stage('Smoke Test Staging') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                container('maven') {
                    sh '''
                        sleep 30   # Wait DNS propagate
                        for i in {1..30}; do
                            if curl -fsS https://staging.vprofile.acme.com/ > /dev/null; then
                                echo "✓ Staging healthy"
                                exit 0
                            fi
                            echo "Waiting... ($i/30)"
                            sleep 10
                        done
                        echo "✗ Staging not healthy"
                        exit 1
                    '''
                }
            }
        }

        // ============================================
        // STAGE 9: Integration Test
        // ============================================
        stage('Integration Test') {
            when {
                anyOf {
                    branch 'main'
                    branch 'develop'
                }
            }
            steps {
                container('maven') {
                    sh '''
                        mvn -B failsafe:integration-test failsafe:verify \
                            -Dintegration.url=https://staging.vprofile.acme.com
                    '''
                }
            }
            post {
                always {
                    junit 'target/failsafe-reports/*.xml'
                }
            }
        }

        // ============================================
        // STAGE 10: Approval
        // ============================================
        stage('Approval Production') {
            when {
                allOf {
                    branch 'main'
                    expression { !params.DEPLOY_PRODUCTION }
                }
            }
            steps {
                timeout(time: 1, unit: 'HOURS') {
                    input message: "Deploy to production?",
                          ok: "Deploy",
                          submitter: "alice,bob,charlie"
                }
            }
        }

        // ============================================
        // STAGE 11: Deploy Production
        // ============================================
        stage('Deploy Production') {
            when {
                branch 'main'
            }
            steps {
                container('kubectl') {
                    withCredentials([file(credentialsId: 'kubeconfig-prod', variable: 'KUBECONFIG')]) {
                        script {
                            if (params.DEPLOY_STRATEGY == 'blue-green') {
                                sh './scripts/deploy-blue-green.sh ${BUILD_VERSION}'
                            } else if (params.DEPLOY_STRATEGY == 'canary') {
                                sh './scripts/deploy-canary.sh ${BUILD_VERSION}'
                            } else {
                                sh '''
                                    kubectl --kubeconfig=$KUBECONFIG -n vprofile-prod \
                                        set image deployment/vprofile \
                                        tomcat=${ECR_URI}/${APP_NAME}:${BUILD_VERSION}

                                    kubectl --kubeconfig=$KUBECONFIG -n vprofile-prod \
                                        rollout status deployment/vprofile --timeout=15m
                                '''
                            }
                        }
                    }
                }
            }
        }

        // ============================================
        // STAGE 12: Smoke Production
        // ============================================
        stage('Smoke Production') {
            when { branch 'main' }
            steps {
                container('maven') {
                    sh '''
                        sleep 60
                        for endpoint in /login /api/health; do
                            curl -fsS https://vprofile.acme.com${endpoint} > /dev/null \
                                && echo "✓ $endpoint OK" \
                                || (echo "✗ $endpoint FAIL"; exit 1)
                        done
                    '''
                }
            }
        }

        // ============================================
        // STAGE 13: Tag Release
        // ============================================
        stage('Tag Release') {
            when { branch 'main' }
            steps {
                container('maven') {
                    withCredentials([sshUserPrivateKey(credentialsId: 'github-ssh', keyFileVariable: 'SSH_KEY')]) {
                        sh '''
                            git config user.name "Jenkins"
                            git config user.email "jenkins@acme.com"

                            git tag -a "v${BUILD_VERSION}" -m "Release ${BUILD_VERSION}"

                            export GIT_SSH_COMMAND="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
                            git push origin "v${BUILD_VERSION}"
                        '''
                    }
                }
            }
        }
    }

    // ============================================
    // POST ACTIONS
    // ============================================
    post {
        success {
            slackSend channel: env.SLACK_CHANNEL,
                      color: 'good',
                      message: """✅ *${APP_NAME}* deploy success
Branch: ${env.BRANCH_NAME}
Version: ${env.BUILD_VERSION}
Build: <${env.BUILD_URL}|#${env.BUILD_NUMBER}>
Commit: ${env.GIT_COMMIT_MSG}"""
        }

        failure {
            slackSend channel: env.SLACK_CHANNEL,
                      color: 'danger',
                      message: """❌ *${APP_NAME}* build/deploy FAILED
Branch: ${env.BRANCH_NAME}
Build: <${env.BUILD_URL}|#${env.BUILD_NUMBER}>
Failed stage: ${currentBuild.currentResult}"""

            emailext to: 'devops@acme.com',
                     subject: "[Jenkins] ${APP_NAME} FAILED #${env.BUILD_NUMBER}",
                     body: '${SCRIPT, template="groovy-html.template"}',
                     attachLog: true,
                     mimeType: 'text/html'
        }

        always {
            // Archive
            archiveArtifacts artifacts: 'target/*.war', allowEmptyArchive: true, fingerprint: true

            // Cleanup
            cleanWs(cleanWhenAborted: true,
                    cleanWhenFailure: true,
                    cleanWhenNotBuilt: true,
                    cleanWhenSuccess: true,
                    cleanWhenUnstable: true,
                    deleteDirs: true,
                    notFailBuild: true)
        }
    }
}
```

## Time breakdown

Production-grade pipeline:

| Stage | Duration |
|---|---|
| Checkout | 30s |
| Build | 2 min (cache deps) |
| Quality parallel | 3 min (max) |
| Sonar | 2 min |
| Quality Gate | 1 min wait |
| Docker build + push | 3 min |
| Trivy | 1 min |
| Deploy staging | 2 min |
| Smoke staging | 1 min |
| Integration test | 5 min |
| Approval | 0-60 min (human) |
| Deploy prod | 2 min |
| Smoke prod | 1 min |
| Tag | 10s |
| **Total automated** | **~20 min** |
| **+ Approval** | **+ 0-60 min** |

DORA elite: < 1 hour lead time. Pipeline này đạt.

## Scripts deploy-blue-green.sh

```bash
#!/bin/bash
set -e

VERSION=$1
ECR_URI=123456789.dkr.ecr.us-east-1.amazonaws.com
APP_NAME=vprofile
NAMESPACE=vprofile-prod

# Update green deployment
kubectl set image deployment/vprofile-green \
    tomcat=${ECR_URI}/${APP_NAME}:${VERSION} \
    -n ${NAMESPACE}

kubectl rollout status deployment/vprofile-green -n ${NAMESPACE} --timeout=10m

# Health check green
GREEN_SVC=$(kubectl get svc vprofile-green -n ${NAMESPACE} -o jsonpath='{.spec.clusterIP}')
for i in {1..30}; do
    if kubectl run -i --rm --restart=Never curl-test --image=curlimages/curl -n ${NAMESPACE} -- \
        curl -fsS http://${GREEN_SVC}:8080/login > /dev/null; then
        break
    fi
    sleep 10
done

# Switch service: blue → green
kubectl patch service vprofile -n ${NAMESPACE} \
    -p '{"spec":{"selector":{"color":"green"}}}'

# Wait 5 min for traffic settle + monitor errors
sleep 60
ERROR_COUNT=$(kubectl logs -l color=green -n ${NAMESPACE} --tail=1000 | grep -c "ERROR" || true)
if [ $ERROR_COUNT -gt 100 ]; then
    # Rollback
    kubectl patch service vprofile -n ${NAMESPACE} \
        -p '{"spec":{"selector":{"color":"blue"}}}'
    echo "Rolled back due to high error rate"
    exit 1
fi

echo "Blue-Green deploy success. New version: ${VERSION}"
```

## Webhook trigger

GitHub → Settings → Webhook:
- URL: `https://jenkins.acme.com/github-webhook/`.
- Content type: application/json.
- Events: Just push + Pull request.

Multi-branch pipeline auto-detect → trigger correct branch.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Pipeline trong main only | Branch dev không CI | Multi-branch pipeline |
| Docker socket mount | Privilege escalation | Use rootless Docker hoặc Kaniko |
| No timeout per stage | Hang infinite | `timeout(time: 30) { }` |
| Approval timeout không có | Block forever | `timeout` wrapper |
| Smoke test ngắn | False positive healthy | Multiple retry + sleep |
| Cache không persist | Build chậm | PVC for `.m2`, `npm cache` |
| Slack notify mỗi commit | Noise | Only on failure hoặc release |

## Tóm tắt bài 4

- Pipeline 13 stage end-to-end: Checkout → Build → Quality parallel → Sonar → Docker → Trivy → Staging → Smoke → Integration → Approval → Prod → Smoke → Tag.
- **K8s agent** với 3 container: maven, docker, kubectl.
- **Maven PVC cache** across builds.
- **Quality Gate** từ SonarCloud abort nếu fail.
- **Blue-green deploy** script auto-rollback nếu high error.
- **Webhook** GitHub trigger multi-branch.
- DORA elite < 1 hour lead time đạt được.

**Bài kế tiếp** → [Bài 5: Shared library cho reusable code](05-shared-library.md)

# Bài 3: vProfile CI/CD với GitHub Actions

Implement pipeline vProfile (giống Jenkins phase 17) bằng GitHub Actions. So sánh syntax + experience.

## Full workflow

`.github/workflows/cicd.yml`:

```yaml
name: vProfile CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      deploy_env:
        type: choice
        options: [staging, production]

permissions:
  contents: read
  id-token: write
  packages: write
  pull-requests: write
  security-events: write

env:
  APP_NAME: vprofile
  AWS_REGION: us-east-1
  ECR_REPO: vprofile
  JAVA_VERSION: '17'

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  # ============================================
  # JOB 1: Build + Unit Test
  # ============================================
  build:
    name: Build & Test
    runs-on: ubuntu-latest
    timeout-minutes: 30
    outputs:
      version: ${{ steps.meta.outputs.version }}
      should-deploy: ${{ steps.check.outputs.deploy }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0          # Cho Sonar full history

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          java-version: ${{ env.JAVA_VERSION }}
          distribution: temurin
          cache: maven

      - id: meta
        name: Generate version
        run: |
          VERSION="${GITHUB_REF_NAME}-$(git rev-parse --short HEAD)"
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "Building version: $VERSION"

      - id: check
        name: Check if should deploy
        run: |
          if [[ "$GITHUB_REF" == "refs/heads/main" || "$GITHUB_REF" == "refs/heads/develop" ]]; then
            echo "deploy=true" >> $GITHUB_OUTPUT
          else
            echo "deploy=false" >> $GITHUB_OUTPUT
          fi

      - name: Build
        run: mvn -B clean package -DskipTests

      - name: Test
        run: mvn -B test

      - name: Code coverage
        run: mvn -B jacoco:report

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: |
            target/surefire-reports/
            target/site/jacoco/

      - name: Publish test results
        if: always()
        uses: dorny/test-reporter@v1
        with:
          name: JUnit Tests
          path: 'target/surefire-reports/*.xml'
          reporter: java-junit

      - name: Upload artifact
        if: steps.check.outputs.deploy == 'true'
        uses: actions/upload-artifact@v4
        with:
          name: war-file
          path: target/*.war
          retention-days: 7

  # ============================================
  # JOB 2: Code Quality (parallel với 1)
  # ============================================
  sonar:
    name: SonarCloud Analysis
    runs-on: ubuntu-latest
    if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.fork == false

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-java@v4
        with:
          java-version: ${{ env.JAVA_VERSION }}
          distribution: temurin
          cache: maven

      - name: Cache SonarCloud packages
        uses: actions/cache@v4
        with:
          path: ~/.sonar/cache
          key: ${{ runner.os }}-sonar

      - name: Run SonarCloud
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
        run: |
          mvn -B verify org.sonarsource.scanner.maven:sonar-maven-plugin:sonar \
            -Dsonar.organization=acme \
            -Dsonar.projectKey=acme_vprofile \
            -Dsonar.host.url=https://sonarcloud.io

  # ============================================
  # JOB 3: Security Scan
  # ============================================
  security:
    name: Security Scan
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: OWASP Dependency Check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: vprofile
          path: '.'
          format: 'HTML SARIF'
          args: --failOnCVSS 7

      - name: Upload SARIF
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: reports/dependency-check-report.sarif

      - name: Upload HTML report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: dependency-check
          path: reports/

  # ============================================
  # JOB 4: Docker Build & Push
  # ============================================
  docker:
    name: Docker Build & Push
    runs-on: ubuntu-latest
    needs: [build, sonar, security]
    if: needs.build.outputs.should-deploy == 'true'

    steps:
      - uses: actions/checkout@v4

      - name: Download WAR
        uses: actions/download-artifact@v4
        with:
          name: war-file
          path: target/

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-vprofile
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Setup Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build & push image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ${{ steps.ecr.outputs.registry }}/${{ env.ECR_REPO }}:${{ needs.build.outputs.version }}
            ${{ steps.ecr.outputs.registry }}/${{ env.ECR_REPO }}:${{ github.ref_name }}-latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
          platforms: linux/amd64

      - name: Trivy vulnerability scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ steps.ecr.outputs.registry }}/${{ env.ECR_REPO }}:${{ needs.build.outputs.version }}
          severity: HIGH,CRITICAL
          format: sarif
          output: trivy-results.sarif

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-results.sarif

  # ============================================
  # JOB 5: Deploy Staging
  # ============================================
  deploy-staging:
    name: Deploy Staging
    runs-on: ubuntu-latest
    needs: [build, docker]
    if: github.ref == 'refs/heads/develop' || github.ref == 'refs/heads/main'
    environment:
      name: staging
      url: https://staging.vprofile.acme.com

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-vprofile
          aws-region: ${{ env.AWS_REGION }}

      - name: Setup kubectl
        uses: azure/setup-kubectl@v4
        with:
          version: 'v1.28.0'

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name vprofile-staging --region ${{ env.AWS_REGION }}

      - name: Deploy to K8s
        run: |
          IMAGE="$(aws ecr describe-repositories --repository-names ${{ env.ECR_REPO }} --query 'repositories[0].repositoryUri' --output text):${{ needs.build.outputs.version }}"

          kubectl -n vprofile-staging \
            set image deployment/vprofile \
            tomcat=$IMAGE

          kubectl -n vprofile-staging \
            rollout status deployment/vprofile \
            --timeout=10m

      - name: Smoke test
        run: |
          sleep 30
          for i in {1..30}; do
            if curl -fsS https://staging.vprofile.acme.com/login > /dev/null; then
              echo "✓ Staging healthy"
              exit 0
            fi
            sleep 10
          done
          exit 1

  # ============================================
  # JOB 6: Integration Test
  # ============================================
  integration:
    name: Integration Tests
    runs-on: ubuntu-latest
    needs: deploy-staging

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: ${{ env.JAVA_VERSION }}
          distribution: temurin
          cache: maven

      - name: Run integration tests
        run: |
          mvn -B failsafe:integration-test failsafe:verify \
            -Dintegration.url=https://staging.vprofile.acme.com

      - name: Publish results
        if: always()
        uses: dorny/test-reporter@v1
        with:
          name: Integration Tests
          path: 'target/failsafe-reports/*.xml'
          reporter: java-junit

  # ============================================
  # JOB 7: Deploy Production
  # ============================================
  deploy-production:
    name: Deploy Production
    runs-on: ubuntu-latest
    needs: [build, integration]
    if: github.ref == 'refs/heads/main'
    environment:
      name: production
      url: https://vprofile.acme.com

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-vprofile-prod
          aws-region: ${{ env.AWS_REGION }}

      - uses: azure/setup-kubectl@v4
        with:
          version: 'v1.28.0'

      - name: Update kubeconfig
        run: aws eks update-kubeconfig --name vprofile-prod --region ${{ env.AWS_REGION }}

      - name: Blue-Green deploy
        run: |
          IMAGE="$(aws ecr describe-repositories --repository-names ${{ env.ECR_REPO }} --query 'repositories[0].repositoryUri' --output text):${{ needs.build.outputs.version }}"

          # Deploy to green
          kubectl -n vprofile-prod \
            set image deployment/vprofile-green \
            tomcat=$IMAGE

          kubectl -n vprofile-prod \
            rollout status deployment/vprofile-green --timeout=15m

          # Health check green
          sleep 30
          GREEN_IP=$(kubectl get svc vprofile-green -n vprofile-prod -o jsonpath='{.spec.clusterIP}')
          for i in {1..30}; do
            if kubectl run curl-test --rm -i --restart=Never \
                --image=curlimages/curl -n vprofile-prod -- \
                curl -fsS http://$GREEN_IP:8080/login > /dev/null 2>&1; then
              break
            fi
            sleep 10
          done

          # Switch traffic
          kubectl patch service vprofile -n vprofile-prod \
            -p '{"spec":{"selector":{"color":"green"}}}'

      - name: Smoke test production
        run: |
          sleep 60
          for endpoint in / /login; do
            curl -fsS https://vprofile.acme.com$endpoint > /dev/null \
              && echo "✓ $endpoint OK" \
              || (echo "✗ $endpoint FAIL"; exit 1)
          done

      - name: Create release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: v${{ needs.build.outputs.version }}
          name: Release ${{ needs.build.outputs.version }}
          generate_release_notes: true
          files: target/*.war

  # ============================================
  # JOB 8: Notify
  # ============================================
  notify:
    name: Notify
    runs-on: ubuntu-latest
    needs: [build, deploy-production]
    if: always() && github.ref == 'refs/heads/main'

    steps:
      - name: Slack notification
        uses: slackapi/slack-github-action@v1
        with:
          channel-id: '#deployments'
          payload: |
            {
              "text": "${{ needs.deploy-production.result == 'success' && '✅' || '❌' }} vProfile deploy",
              "blocks": [
                {
                  "type": "section",
                  "fields": [
                    {"type": "mrkdwn", "text": "*Version:*\n${{ needs.build.outputs.version }}"},
                    {"type": "mrkdwn", "text": "*Status:*\n${{ needs.deploy-production.result }}"},
                    {"type": "mrkdwn", "text": "*Branch:*\n${{ github.ref_name }}"},
                    {"type": "mrkdwn", "text": "*Run:*\n<${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}|#${{ github.run_number }}>"}
                  ]
                }
              ]
            }
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

## Time comparison Jenkins vs Actions

| Stage | Jenkins | GitHub Actions |
|---|---|---|
| Setup runtime | 2 phút (PVC cache) | 30s (action cache) |
| Build | 2 phút | 2 phút |
| Test | 3 phút | 3 phút |
| Sonar | 2 phút | 2 phút |
| Docker build | 3 phút | 2 phút (Buildx cache) |
| Deploy | 2 phút | 2 phút |
| **Total** | **~20 phút** | **~15 phút** |

Actions slightly faster do action ecosystem mature + Buildx cache mạnh.

## So sánh syntax

### Jenkins
```groovy
stage('Build') {
    when { branch 'main' }
    steps {
        sh 'mvn package'
    }
}
```

### Actions
```yaml
build:
  if: github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  steps:
    - run: mvn package
```

Actions YAML cleaner, ít boilerplate.

## Cost comparison

Same workload 100 build/day:

| | Cost |
|---|---|
| Jenkins (EC2 t3.medium) | $30/month + ops time |
| Jenkins (EKS + K8s agents) | $80/month + ops time |
| GitHub Actions free tier | $0 (2000 min/month) |
| GitHub Actions paid | $0.008/min = $80/month |

GitHub Actions thường rẻ hơn cho team < 10 dev.

Self-host alternative cho enterprise: cost variable.

## Workflow visualization

GitHub UI:
- DAG visualization rất tốt.
- Job dependency arrows.
- Live log streaming.
- Re-run failed jobs only.
- Cancel selective jobs.

Jenkins:
- Stage View plugin.
- Blue Ocean (deprecated 2024).
- Less polished UI.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Job too long > 6h | Auto-cancel | Self-hosted runner |
| Workflow secret in PR fork | Lộ | `pull_request_target` cẩn thận |
| OIDC role too broad | Anyone assume | Strict condition |
| No timeout per job | Hang | `timeout-minutes: 30` |
| Default permissions excessive | Security risk | Explicit `permissions:` |
| Cache too aggressive | Stale results | Include lockfile hash |
| Manual approval blocking | Pipeline stuck | Wait timer + reviewer rotation |

## Tổng kết phase 18

3 bài cover:
1. GitHub Actions basics + concepts + events + jobs.
2. Advanced: reusable workflow, composite, matrix, environments, OIDC.
3. vProfile end-to-end production-grade pipeline.

Skills:
- Setup CI/CD trên GitHub Actions.
- Reusable workflow + composite action.
- OIDC integrate AWS không lưu key.
- Environment + protection rule cho production.
- Blue-green deploy K8s.

## Tóm tắt bài 3

- Pipeline 8 job: build → sonar → security → docker → staging → integration → prod → notify.
- **Concurrency** cancel-in-progress cho PR check.
- **OIDC + IAM role** thay AWS access key.
- **Buildx cache** với `cache-from/cache-to: type=gha`.
- **Environment + reviewer + wait timer** cho production.
- **Blue-green** deploy K8s với traffic switch.
- **Trivy + SARIF + CodeQL** upload security results.
- **Slack** notification với blocks rich format.

**Phase kế tiếp** → [Phase 19 — GitLab](../phase-19-gitlab/01-gitlab-overview.md)

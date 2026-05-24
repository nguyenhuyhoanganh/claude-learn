# Bài 8: Post-deployment tests và combining stages

Pipeline có 2 lần deploy (staging, prod). Bài 7 đã verify staging bằng E2E. Bài này:

1. Thêm **post-deployment test cho production** (= production smoke test).
2. **Combine stages** — gộp Deploy + E2E thành 1 → đơn giản hơn, nhanh hơn.

## Phần 1: Tại sao cần E2E trên production?

Bài 7 đã test staging. Vì sao **production** cũng cần?

Scenarios xấu sau khi deploy prod:

1. **CDN cache** — Netlify CDN giữ bản cũ → user vẫn thấy version cũ vài phút.
2. **DNS propagation** — nếu deploy đổi DNS, có người vẫn vào IP cũ.
3. **Region difference** — Netlify deploy thành công ở 1 region, fail ở region khác.
4. **Production config khác staging** — môi trường biến không đồng bộ.

→ **Smoke test** = test cực nhỏ trên production sau deploy → confirm "site thực sự online + content đúng".

## Reuse stage E2E cho production

Stage `Staging E2E` (bài 7) đã có sẵn. Copy → đổi URL → có production E2E:

```groovy
stage('Production E2E') {
    agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
    environment {
        CI_ENVIRONMENT_URL = 'https://golden-pavlova-xyz.netlify.app'
    }
    steps {
        sh '''
            set -euo pipefail
            echo "Testing PROD: $CI_ENVIRONMENT_URL"
            npx playwright test
        '''
    }
    post {
        always {
            publishHTML([
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright Production E2E',
                keepAll: true, allowMissing: false, alwaysLinkToLastBuild: false
            ])
        }
    }
}
```

Đặt **sau** `Deploy Prod`. Tổng pipeline:

```text
Build → Tests → Deploy Staging → Staging E2E → [Approval] → Deploy Prod → Production E2E
```

→ Lúc này pipeline rất an toàn: mỗi lần deploy đều có test ngay sau, lỗi bị catch.

## Note quan trọng: rename report tránh đè

3 stage cùng publish HTML report → đặt **3 tên khác nhau**:

```text
Run Tests (parallel)
  - Local E2E              → reportName: "Playwright Local E2E"
Staging E2E                → reportName: "Playwright Staging E2E"
Production E2E             → reportName: "Playwright Production E2E"
```

→ UI Jenkins job side menu sẽ có 3 link riêng. Click vào từng cái xem report tương ứng.

> Nếu đặt cùng tên `"Playwright Report"`, stage sau **đè** stage trước → mất report.

## Test the tests — verify E2E thực sự catch lỗi

Test pass mà thực ra không kiểm tra gì → mất công vô ích. **Trick để verify**:

1. Vào Netlify dashboard → site → **Deploys**.
2. Upload **manually** một build khác (vd build dummy không có text mong đợi).
3. Quay lại Jenkins → vào build cuối cùng → click **Restart from Stage** → chọn `Production E2E`.
4. Stage chạy lại → fail vì content trên prod đã khác.

→ Verify rằng E2E thực sự **đọc** production URL, không chỉ "luôn pass".

Sau khi test test xong, deploy lại bản đúng để fix production.

## Phần 2: Combining stages

Pipeline 7 stages hiện tại:

```text
Build
Run Tests (parallel)
Deploy Staging
Staging E2E
Approval
Deploy Prod
Production E2E
```

Khá dài. Quan sát: `Deploy Staging` + `Staging E2E` là **1 logical unit** ("deploy + verify"). Tương tự `Deploy Prod` + `Production E2E`.

→ **Combine** giúp:
- Pipeline gọn hơn (5 stage thay vì 7).
- Tiết kiệm **1 lần spin Docker container** (mỗi stage Docker tốn ~5-10s startup).
- Logic deploy+verify khó tách → gộp logic.

### Cách combine: chạy nhiều command trong 1 stage

Trước:

```groovy
stage('Deploy Prod') {
    agent { docker { image 'node:18-alpine'; reuseNode true } }
    steps {
        sh 'netlify deploy --dir=build --prod'
    }
}
stage('Production E2E') {
    agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
    steps {
        sh 'npx playwright test'
    }
}
```

Sau:

```groovy
stage('Deploy & Test Prod') {
    agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
    environment {
        CI_ENVIRONMENT_URL = 'https://golden-pavlova-xyz.netlify.app'
    }
    steps {
        sh '''
            set -euo pipefail
            # Deploy
            npm install netlify-cli
            node_modules/.bin/netlify deploy --dir=build --prod
            # Đợi CDN cache flush
            sleep 10
            # Verify
            npx playwright test
        '''
    }
    post {
        always {
            publishHTML([
                reportDir: 'playwright-report', reportFiles: 'index.html',
                reportName: 'Production E2E', keepAll: true,
                allowMissing: false, alwaysLinkToLastBuild: false
            ])
        }
    }
}
```

→ 1 container Playwright cho cả deploy lẫn test. **Lưu ý**: Playwright image cũng có Node.js → cài Netlify CLI bên trong vẫn được.

Nếu không chắc Playwright image có Node, debug bằng:

```bash
node --version       # In version
```

→ Image `mcr.microsoft.com/playwright:v1.40.0-jammy` based on Ubuntu 22.04 + Node 20. OK.

## Combine staging với syntax đặc biệt

Stage staging có dynamic URL → khó combine hơn. Cách clean:

```groovy
stage('Deploy & Test Staging') {
    agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
    steps {
        sh '''
            set -euo pipefail
            npm install netlify-cli node-jq
            node_modules/.bin/netlify deploy --dir=build --json > deploy-output.json
            export CI_ENVIRONMENT_URL=$(node_modules/.bin/node-jq -r '.deploy_url' deploy-output.json)
            echo "Testing staging at $CI_ENVIRONMENT_URL"
            npx playwright test
        '''
    }
    post {
        always {
            publishHTML([
                reportDir: 'playwright-report', reportFiles: 'index.html',
                reportName: 'Staging E2E', keepAll: true,
                allowMissing: false, alwaysLinkToLastBuild: false
            ])
        }
    }
}
```

Trick: dùng `export CI_ENVIRONMENT_URL=$(...)` trong **cùng shell** → biến available cho `npx playwright test` ngay sau.

→ **Không cần** `script { env.STAGING_URL = ... }` block + `environment { CI_ENVIRONMENT_URL = STAGING_URL }`. Gọn hơn.

### Trade-off khi combine

**Ưu**:
- Pipeline gọn (4-5 stage).
- Tiết kiệm spin container.
- Variable scope trong shell (không cần cross-stage).

**Nhược**:
- Stage View **không tách deploy vs test** → khó thấy ai fail.
- Logic 1 stage nhiều việc → khó maintain.
- Khi fail, không biết deploy fail hay test fail mà không đọc log.

→ Combine **chỉ khi** 2 stage có dependency mạnh và bạn OK với log gộp. Tách khi cần visibility.

## Pipeline sau bài 8 (chọn combine)

```groovy
pipeline {
    agent any
    environment {
        NETLIFY_SITE_ID    = '12345-abcd-...'
        NETLIFY_AUTH_TOKEN = credentials('netlify-token')
    }
    stages {
        stage('Build') { ... }
        stage('Run Tests') { parallel { ... } }

        stage('Deploy & Test Staging') {
            agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
            steps {
                sh '''
                    set -euo pipefail
                    npm install netlify-cli node-jq
                    node_modules/.bin/netlify deploy --dir=build --json > deploy-output.json
                    export CI_ENVIRONMENT_URL=$(node_modules/.bin/node-jq -r '.deploy_url' deploy-output.json)
                    npx playwright test
                '''
            }
            post {
                always {
                    publishHTML([
                        reportDir: 'playwright-report', reportFiles: 'index.html',
                        reportName: 'Staging E2E', keepAll: true,
                        allowMissing: false, alwaysLinkToLastBuild: false
                    ])
                }
            }
        }

        stage('Approval') {
            steps {
                timeout(time: 15, unit: 'MINUTES') {
                    input message: 'Deploy to PRODUCTION?', ok: 'Yes, deploy'
                }
            }
        }

        stage('Deploy & Test Prod') {
            agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
            environment {
                CI_ENVIRONMENT_URL = 'https://golden-pavlova-xyz.netlify.app'
            }
            steps {
                sh '''
                    set -euo pipefail
                    npm install netlify-cli
                    node_modules/.bin/netlify deploy --dir=build --prod
                    sleep 10
                    npx playwright test
                '''
            }
            post {
                always {
                    publishHTML([
                        reportDir: 'playwright-report', reportFiles: 'index.html',
                        reportName: 'Production E2E', keepAll: true,
                        allowMissing: false, alwaysLinkToLastBuild: false
                    ])
                }
            }
        }
    }
}
```

→ 5 stage chính. Pipeline rõ ràng, có CI lẫn CD đầy đủ.

## Lưu ý: deploy phải đợi server propagate

```bash
netlify deploy --prod
# Netlify nói "Done!" nhưng CDN có thể chưa flush
sleep 10
npx playwright test
```

→ `sleep 10` cho CDN cache update. Có khi cần `sleep 30`. Một số tool deploy tự `wait until live` — Netlify CLI hiện tại chưa có flag này, nên `sleep` đơn giản.

Best practice production: poll URL với `curl`:

```bash
for i in {1..30}; do
    if curl -s -f "$CI_ENVIRONMENT_URL" > /dev/null; then
        echo "Site is up!"
        break
    fi
    echo "Waiting for site... ($i/30)"
    sleep 2
done
```

→ Đợi max 60s, exit ngay khi site up.

## Tóm tắt

- **Production E2E test** = smoke test sau deploy prod → catch CDN cache, DNS, region issues.
- **Test the tests** bằng cách upload bản dummy → restart stage → verify test fail đúng cách.
- Multiple stage publish HTML → đặt **`reportName`** khác nhau để tránh đè.
- **Combine stages** (Deploy + Test) khi có dependency mạnh → tiết kiệm container.
- Combine: dùng `export VAR=$(...)` trong cùng shell, hoặc `environment {}` cấp stage.
- Trade-off: combine = gọn nhưng giảm visibility khi debug.
- Dùng `sleep` hoặc `curl` poll để đợi CDN flush trước khi test prod.

---

→ [Bài tiếp theo: CD vs CD, build version và tổng kết Phase 3](09-build-version-va-cd-vs-cd.md)

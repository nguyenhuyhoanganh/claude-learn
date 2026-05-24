# Bài 7: Manual approval và truyền dynamic data giữa stage

Bài 6 thêm staging nhưng pipeline vẫn đi tự động → prod. Bài này:

1. Thêm **manual approval** giữa staging và prod (= Continuous Delivery).
2. Truyền **dynamic staging URL** từ stage Deploy sang stage E2E để verify staging.

## Phần 1: Manual approval bằng `input` step

### Cú pháp `input`

Jenkins có step `input` để **dừng pipeline**, đợi human approve:

```groovy
stage('Approval') {
    steps {
        input(message: 'Deploy to production?', ok: 'Yes, deploy')
    }
}
```

→ Khi pipeline đến stage này, dừng lại. UI hiện 2 nút:
- **Yes, deploy** → continue, vào stage tiếp theo.
- **Abort** → dừng pipeline.

### Tạo experiment pipeline để học

**Khoá học khuyên**: với feature mới, **tạo pipeline mini riêng** để học, không thử ngay pipeline production lớn. Lý do:
- Pipeline production chạy 3-5 phút mỗi lần — chậm cho thử nghiệm.
- Có thể break pipeline thật → lo lắng không cần thiết.

Tạo job `learning` với pipeline đơn giản:

```groovy
pipeline {
    agent any
    stages {
        stage('Build')    { steps { echo 'Building' } }
        stage('Approval') {
            steps {
                input(message: 'Ready to deploy?', ok: 'Proceed')
            }
        }
        stage('Deploy')   { steps { echo 'Deploying' } }
    }
}
```

Build Now → stage Build chạy → đến stage Approval, pipeline **pause**.

Trong UI:
- Stage View: cột Approval có spinner xoay.
- Hover vào cột → tooltip `"Proceed"` hoặc `"Abort"`.

Click **Proceed** → Deploy stage chạy. Click **Abort** → pipeline status = ABORTED (khác FAILURE).

### Snippet generator giúp khám phá tham số

Jenkins có **Snippet Generator** (Pipeline Syntax helper) để biết các option của step:

1. Vào job → cuộn xuống cuối **Configure** → link **Pipeline Syntax**.
2. Trong dropdown **Sample Step**, chọn `input`.
3. Form xuất hiện cho phép tinker:

```text
┌─ Input ──────────────────────────────────────────┐
│ Message:           [Deploy to production?]       │
│ Optional ID:       [                  ]          │
│ OK button caption: [Yes, I'm sure]               │
│ Submitter:         [                  ]          │
│ Submitter parameter: [                ]          │
│ Parameters:        [(none)            ]          │
│ ☐ Advanced                                       │
└──────────────────────────────────────────────────┘
```

4. Click **Generate Pipeline Script** → copy snippet:

```groovy
input message: 'Deploy to production?', ok: "Yes, I'm sure"
```

→ Bookmark `<jenkins>/pipeline-syntax` — cứu cánh khi quên syntax.

### Vấn đề: pipeline chờ forever

`input` mặc định không có timeout → đợi mãi. Build Queue đầy → kẹt khi không ai online click.

Fix bằng `timeout`:

```groovy
stage('Approval') {
    steps {
        timeout(time: 15, unit: 'MINUTES') {
            input(message: 'Deploy to production?', ok: 'Yes, deploy')
        }
    }
}
```

→ Nếu sau 15 phút không ai click → pipeline auto-abort. Đỡ kẹt queue.

> **Best practice unit**: luôn ghi rõ `MINUTES`, `HOURS`, không dùng số trần. `timeout(time: 15)` → mặc định là MINUTES nhưng đọc xong 6 tháng không nhớ → confusion. Verbose = clear.

### Lưu ý security cho approval

Mặc định **ai có quyền vào job** đều click được Approve. Trong production:

```groovy
input(
    message: 'Deploy to production?',
    ok: 'Approve',
    submitter: 'tech-lead,manager'         // ← Chỉ user/group này click được
)
```

→ Nếu user khác mở approval dialog, thấy disabled. Cần plugin Role-based Access.

## Phần 2: Áp dụng approval cho pipeline thật

Thêm stage giữa `Deploy Staging` và `Deploy Prod`:

```groovy
stages {
    stage('Build') { ... }
    stage('Run Tests') { ... }
    stage('Deploy Staging') { ... }

    stage('Approval') {                          // ← NEW
        steps {
            timeout(time: 15, unit: 'MINUTES') {
                input(
                    message: 'Danger! Deploying to PRODUCTION. Sure?',
                    ok: 'Yes, I am sure'
                )
            }
        }
    }

    stage('Deploy Prod') { ... }
}
```

Pipeline mới:

```text
Build → Tests → Deploy Staging → [⏸ APPROVAL] → Deploy Prod
                                       ↑
                          Human click 'Yes, I am sure'
                          → tiếp tục
```

→ **Đây chính là Continuous Delivery**.

## Phần 3: Vấn đề — staging URL là random

Sau Deploy Staging, ta muốn chạy **E2E test trên staging** để verify staging OK. Nhưng URL staging là random (preview deploy):

```text
https://65abc--golden-pavlova-xyz.netlify.app
            ↑
       random mỗi lần
```

→ Không hardcode được vào Playwright config. Phải **extract URL từ output `netlify deploy`** rồi truyền sang stage E2E.

## Bước 1: Lấy output dưới dạng JSON

`netlify deploy` mặc định output dạng human-readable. Thêm `--json` cho dạng machine-readable:

```bash
netlify deploy --dir=build --json
```

Output:

```json
{
  "site_id": "12345-abcd-...",
  "site_name": "golden-pavlova-xyz",
  "deploy_id": "65abc...",
  "deploy_url": "https://65abc--golden-pavlova-xyz.netlify.app",
  "logs": "https://app.netlify.com/sites/.../deploys/65abc..."
}
```

→ Cần extract `deploy_url`.

## Bước 2: Lưu output vào file

Dùng **redirection operator** `>` (Phase 1 bài 4 đã học):

```bash
netlify deploy --dir=build --json > deploy-output.json
```

→ File `deploy-output.json` chứa toàn bộ JSON. Stdout không in gì nữa.

## Bước 3: Parse JSON bằng `jq` (hoặc `node-jq`)

`jq` là CLI tool parse JSON. Cài qua `npm`:

```bash
npm install node-jq                          # Wrapper Node cho jq
```

(Hoặc cài `jq` trực tiếp qua `apt-get install jq` nếu image có quyền root.)

Dùng `jq` extract field:

```bash
node_modules/.bin/node-jq -r '.deploy_url' deploy-output.json
```

→ In ra `https://65abc--golden-pavlova-xyz.netlify.app` (không quote vì `-r` = raw).

## Bước 4: Set vào env var Jenkins

Đây là phần tricky. Trong Declarative Pipeline, gán biến từ output shell cần `script { ... }` block + `sh(script: ..., returnStdout: true)`:

```groovy
stage('Deploy Staging') {
    agent { docker { image 'node:18-alpine'; reuseNode true } }
    steps {
        sh '''
            set -euo pipefail
            npm install netlify-cli node-jq
            node_modules/.bin/netlify deploy --dir=build --json > deploy-output.json
        '''
        script {
            env.STAGING_URL = sh(
                script: "node_modules/.bin/node-jq -r '.deploy_url' deploy-output.json",
                returnStdout: true
            ).trim()
        }
    }
}
```

Giải nghĩa:

- **`script { ... }`** — escape khỏi Declarative, viết Groovy thuần.
- **`env.STAGING_URL = ...`** — set env var **toàn pipeline** (mọi stage sau đều thấy).
- **`sh(script: ..., returnStdout: true)`** — chạy shell, **return output** thay vì in.
- **`.trim()`** — bỏ newline/whitespace cuối.

→ Sau stage này, biến `STAGING_URL` available cho mọi stage sau.

## Bước 5: Dùng STAGING_URL trong stage E2E staging

Thêm stage `Staging E2E` sau Deploy Staging:

```groovy
stage('Staging E2E') {
    agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
    environment {
        CI_ENVIRONMENT_URL = "${STAGING_URL}"          // ← Đọc biến từ stage trước
    }
    steps {
        sh '''
            set -euo pipefail
            echo "Testing against staging: $CI_ENVIRONMENT_URL"
            npx playwright test
        '''
    }
    post {
        always {
            publishHTML([
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright Staging E2E',
                keepAll: true,
                allowMissing: false,
                alwaysLinkToLastBuild: false
            ])
        }
    }
}
```

> **Phía Playwright**: file `playwright.config.js` đọc env var `CI_ENVIRONMENT_URL` để biết test URL nào:
>
> ```javascript
> module.exports = {
>     use: {
>         baseURL: process.env.CI_ENVIRONMENT_URL || 'http://localhost:3000',
>     },
> };
> ```
>
> Nếu env var có → test URL đó. Không có → fallback localhost.

## Pipeline đầy đủ sau bài 7

```groovy
pipeline {
    agent any
    environment {
        NETLIFY_SITE_ID    = '12345-abcd-...'
        NETLIFY_AUTH_TOKEN = credentials('netlify-token')
    }
    stages {
        stage('Build') {
            agent { docker { image 'node:18-alpine'; reuseNode true } }
            steps {
                sh '''
                    set -euo pipefail
                    npm ci
                    npm run build
                '''
            }
        }
        stage('Run Tests') {
            parallel {
                stage('Unit Tests') { ... }
                stage('Local E2E')  { ... }
            }
        }

        stage('Deploy Staging') {
            agent { docker { image 'node:18-alpine'; reuseNode true } }
            steps {
                sh '''
                    set -euo pipefail
                    npm install netlify-cli node-jq
                    node_modules/.bin/netlify deploy --dir=build --json > deploy-output.json
                '''
                script {
                    env.STAGING_URL = sh(
                        script: "node_modules/.bin/node-jq -r '.deploy_url' deploy-output.json",
                        returnStdout: true
                    ).trim()
                }
            }
        }

        stage('Staging E2E') {
            agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
            environment {
                CI_ENVIRONMENT_URL = "${STAGING_URL}"
            }
            steps {
                sh '''
                    set -euo pipefail
                    npx playwright test
                '''
            }
            post {
                always {
                    publishHTML([
                        reportDir: 'playwright-report',
                        reportFiles: 'index.html',
                        reportName: 'Playwright Staging E2E',
                        keepAll: true, allowMissing: false, alwaysLinkToLastBuild: false
                    ])
                }
            }
        }

        stage('Approval') {
            steps {
                timeout(time: 15, unit: 'MINUTES') {
                    input message: 'Deploy to PRODUCTION?', ok: 'Yes, I am sure'
                }
            }
        }

        stage('Deploy Prod') {
            agent { docker { image 'node:18-alpine'; reuseNode true } }
            steps {
                sh '''
                    set -euo pipefail
                    npm install netlify-cli
                    node_modules/.bin/netlify deploy --dir=build --prod
                '''
            }
        }
    }
}
```

## Phần 4: Dynamic data — pattern chung

Pattern truyền data giữa stage tổng quát:

```groovy
stage('Stage A: produce data') {
    steps {
        script {
            env.MY_VAR = sh(
                script: 'some-command-that-prints-value',
                returnStdout: true
            ).trim()
        }
    }
}
stage('Stage B: consume data') {
    steps {
        echo "Value from Stage A: ${env.MY_VAR}"
        sh 'echo "Using $MY_VAR"'
    }
}
```

Khác `environment { ... }` cấp pipeline (giá trị **biết trước**), pattern này set **runtime**.

### Khi nào dùng?

- Lấy version từ `package.json` hoặc `git describe`.
- Build artifact path động.
- API response info (URL, token tạm…).
- Timestamps.

## Pitfall

### Pitfall 1: `script { ... }` đặt sai chỗ

```groovy
stage('Deploy') {
    script { env.MY = '...' }      // ← SAI: phải trong steps
    steps { ... }
}
```

→ `script` phải trong `steps`.

### Pitfall 2: quote khi build chuỗi shell có quote

```bash
node_modules/.bin/node-jq -r '.deploy_url' deploy-output.json
```

Trong Groovy script string `sh(script: ...)`:

```groovy
sh(script: '''node_modules/.bin/node-jq -r '.deploy_url' deploy-output.json''', ...)   // SAI: nhiều single quote
sh(script: """node_modules/.bin/node-jq -r '.deploy_url' deploy-output.json""", ...)   // ĐÚNG: dùng triple double
```

→ Triple-double-quote `"""..."""` trong Groovy cho phép single quote bên trong.

### Pitfall 3: quên `.trim()`

```groovy
env.STAGING_URL = sh(script: '...', returnStdout: true)
// Output: "https://...\n"     ← có \n cuối
```

→ Khi dùng `STAGING_URL` lần sau, có newline cuối → URL hỏng. **Luôn `.trim()`**.

### Pitfall 4: env var trong single-quote sh

```groovy
sh 'echo $STAGING_URL'                  // OK: shell tự expand
sh "echo ${STAGING_URL}"                // OK: Groovy interpolate
sh 'echo ${STAGING_URL}'                // OK: shell expand (vì $ giữ nguyên)
echo 'My URL: ${STAGING_URL}'           // SAI: single quote không interpolate
echo "My URL: ${STAGING_URL}"           // ĐÚNG
```

## Tóm tắt

- **`input(message:, ok:)`** trong stage = pause pipeline đợi human click.
- Bọc `input` trong **`timeout`** để tránh kẹt forever.
- **Snippet Generator** (`<jenkins>/pipeline-syntax`) cho mọi step.
- Để **truyền data giữa stage**:
  1. Stage A: `sh ... > output-file` hoặc `sh(returnStdout: true)`.
  2. `script { env.MY_VAR = sh(...).trim() }`.
  3. Stage B: `echo "${env.MY_VAR}"` hoặc `sh 'echo $MY_VAR'`.
- **`jq`** / **`node-jq`** parse JSON từ output API.
- Quote cẩn thận khi build shell command có quote bên trong.
- **`.trim()`** luôn cần khi `returnStdout: true`.

---

→ [Bài tiếp theo: Post-deployment tests và combining stages](08-post-deployment-tests.md)

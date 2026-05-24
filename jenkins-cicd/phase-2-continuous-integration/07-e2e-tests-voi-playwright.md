# Bài 7: E2E test với Playwright

Unit test (bài 5) chạy nhanh, kiểm tra logic nội bộ — nhưng **không đảm bảo** website thực sự hoạt động trên browser. Cần **E2E test** (End-to-End): mở browser thật, click button, kiểm tra hành vi. Bài này dùng **Playwright** — framework E2E hot nhất hiện tại.

## E2E test khác unit test thế nào?

```text
┌─────────────────────────────────────────────────────────────┐
│                      Application                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            UI Layer (HTML/CSS/JS)                      │  │
│  │            ▲                                           │  │
│  │            │ <-- E2E test (Playwright/Cypress)         │  │
│  │            │     mở browser thật, click, scroll        │  │
│  ├────────────┼───────────────────────────────────────────┤  │
│  │            │                                           │  │
│  │   Business Logic Layer                                 │  │
│  │   ▲                                                    │  │
│  │   │ <-- Integration test (test các module phối hợp)   │  │
│  ├───┼──────────────────────────────────────────────────┐ │  │
│  │   │                                                  │ │  │
│  │   ▼                                                  │ │  │
│  │   Individual Functions                               │ │  │
│  │   ▲                                                  │ │  │
│  │   │ <-- Unit test (test 1 hàm/class)                │ │  │
│  └───┴──────────────────────────────────────────────────┘ │  │
└──────────────────────────────────────────────────────────────┘
```

| Tiêu chí          | Unit Test                  | E2E Test                            |
|-------------------|----------------------------|-------------------------------------|
| Scope             | 1 function/component       | Toàn ứng dụng (UI + backend)        |
| Tốc độ            | Mili-giây                  | Vài giây — vài phút mỗi test        |
| Cần app chạy?     | Không                      | **Có** — cần server đang chạy       |
| Cần browser?      | Không                      | **Có** — headless Chromium/Firefox  |
| Bắt được gì       | Logic lỗi                  | UX lỗi, integration lỗi             |
| Khi nào fail?     | Code break                 | Config break, network break, race condition |

→ E2E **chậm hơn nhiều** nhưng **bắt được lỗi mà unit test bỏ sót**: button gửi request sai endpoint, popup không hiện, form submit không validate.

→ **Best practice**: kim tự tháp test — nhiều unit, vừa phải integration, ít E2E nhưng cover happy path quan trọng.

## Playwright là gì?

**Playwright** = framework E2E do Microsoft phát triển (2020), kế thừa Puppeteer (Google). Đặc điểm:

- Chạy được trên **Chromium, Firefox, WebKit** (cùng API).
- Tốc độ nhanh, parallel by default.
- Auto-wait — không phải `sleep` tự chế.
- Trace viewer cực mạnh để debug.
- Có **Docker image official** sẵn → dễ dùng trong CI.

Cạnh tranh chính: **Cypress** (mạnh hơn về DX nhưng chỉ Chromium).

## Setup Playwright trong project

Trong project local:

```bash
npm init playwright@latest
```

Wizard hỏi vài câu (TypeScript / JavaScript, thư mục test, GitHub Actions...). Cứ default → Playwright tự cài + tạo `tests/example.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');

test('homepage has title', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await expect(page).toHaveTitle(/React App/);
});

test('renders learn react link', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await expect(page.getByRole('link', { name: 'Learn React' })).toBeVisible();
});
```

→ 2 test mẫu. Chạy local:

```bash
# Tab 1: chạy server
npm start          # Server ở port 3000

# Tab 2: chạy playwright
npx playwright test
```

→ Browser headless mở, click các thứ, kết quả ra terminal.

Commit + push.

## Phải hiểu vấn đề: server phải chạy trước test

Đây là **điểm khác** so với unit test. Pipeline phải:

1. Build production → `build/`
2. **Start một server** serve `build/` ở port nào đó.
3. Chờ server up.
4. **Run Playwright** trỏ vào server đó.
5. Sau test, **stop server**.

Server cho production build dùng tool **`serve`**:

```bash
npm install -g serve
serve -s build           # Serve thư mục build/ ở port 3000
```

→ Bài này dạy cách thực thi step trên trong Jenkins.

## Stage E2E đầu tiên — sai cách

Thử cách "ngây thơ":

```groovy
stage('E2E') {
    agent {
        docker {
            image 'mcr.microsoft.com/playwright:v1.40.0-jammy'
            reuseNode true
        }
    }
    steps {
        sh '''
            set -euo pipefail
            npm install -g serve         # Cài serve
            serve -s build               # Start server
            npx playwright test          # Run test
        '''
    }
}
```

→ Đây là **Docker image Playwright official** (`mcr.microsoft.com/playwright:v1.40.0-jammy`). Có sẵn Node.js + browsers + Playwright.

Push + Build Now → log:

```text
+ npm install -g serve
npm ERR! code EACCES
npm ERR! syscall mkdir
npm ERR! path /usr/lib/node_modules
npm ERR! errno -13
npm ERR! Error: EACCES: permission denied, mkdir '/usr/lib/node_modules'
```

→ **Lỗi 1**: Không có quyền cài global. Container đang chạy là user thường, không root.

### Sai lầm phổ biến: dùng `args '-u root'`

Tra Google → có suggestion thêm `args '-u root'` để chạy root. **Đừng làm vậy** vì:

- Container ghi file vào workspace với user root → host (Jenkins user 1000) không quyền sửa/xoá.
- Build kế tiếp `cleanWs()` sẽ fail vì không xoá được file root.

### Cách đúng: cài serve **local** (không global)

```groovy
sh '''
    npm install serve                          # Cài local vào node_modules/
    node_modules/.bin/serve -s build           # Gọi bằng path trực tiếp
'''
```

→ `node_modules/.bin/serve` là binary của package sau khi cài local. Không cần global → không cần root.

Push + Build Now → log:

```text
+ npm install serve
added 1 package in 5s
+ node_modules/.bin/serve -s build
INFO  Accepting connections at http://localhost:3000
... (TREO mãi)
```

→ **Lỗi 2**: Server đang chạy **forever**, không bao giờ kết thúc → step không trả về → pipeline kẹt vô tận.

→ Phải vào Jenkins UI bấm **abort** thủ công.

## Fix: chạy server ở background

Thêm `&` cuối lệnh để chạy nền:

```groovy
sh '''
    npm install serve
    node_modules/.bin/serve -s build &       # & = chạy background
    sleep 10                                  # Đợi server start
    npx playwright test
'''
```

→ `&` đẩy `serve` chạy nền, shell tiếp tục đến `sleep`. `sleep 10` cho server 10 giây để bind port. Sau đó chạy `npx playwright test`.

Push + Build Now → tất cả stage xanh! Nhưng có **vấn đề ngầm** sẽ phát hiện ở dưới.

## Pitfall: post action recording fail

Sau khi E2E pass, post action `junit 'test-results/junit.xml'` báo:

```text
[Pipeline] junit
Recording test results
ERROR: No test report files were found. Configuration error?
```

**Tại sao?** Stage Test (unit test) ghi `test-results/junit.xml`. Stage E2E **cũng** ghi `test-results/junit.xml` (do Playwright cấu hình default cùng path) → **đè lên** file của Test stage.

Khi Playwright chạy thành công, default config thường **không** sinh JUnit (chỉ sinh khi fail) → cuối build không có file → post fail.

### Fix 1: thay đổi tên file output unit test

Trong `package.json`, đổi tên cho jest:

```json
{
  "jest-junit": {
    "outputDirectory": "jest-results",       // ← Thư mục khác
    "outputName": "junit.xml"
  }
}
```

Update Jenkinsfile:

```groovy
post {
    always {
        junit 'jest-results/junit.xml'        // Unit test report
    }
}
```

### Fix 2: cấu hình Playwright xuất JUnit riêng

Trong `playwright.config.js`:

```javascript
module.exports = {
    reporter: [
        ['html'],
        ['junit', { outputFile: 'test-results/junit.xml' }]
    ],
};
```

→ Playwright xuất 2 report: HTML + JUnit. Tách path khỏi unit test.

### Fix 3: post block per-stage

Có thể đặt `post { ... }` **bên trong** stage:

```groovy
stage('Test') {
    steps { ... }
    post {
        always {
            junit 'test-results/junit.xml'      // ← Chỉ unit test
        }
    }
}
stage('E2E') {
    steps { ... }
    post {
        always {
            junit 'test-results-e2e/junit.xml'  // ← Chỉ E2E
            publishHTML([
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright HTML Report',
                keepAll: true,
                allowMissing: false,
                alwaysLinkToLastBuild: false
            ])
        }
    }
}
```

→ Cách này gọn — mỗi stage tự chịu trách nhiệm publish report của nó. **Khoá học dùng cách này** (sẽ thấy trong Jenkinsfile cuối bài).

## Stage E2E hoàn chỉnh

```groovy
stage('E2E') {
    agent {
        docker {
            image 'mcr.microsoft.com/playwright:v1.40.0-jammy'
            reuseNode true
        }
    }
    steps {
        sh '''
            set -euo pipefail
            npm install serve
            node_modules/.bin/serve -s build &
            sleep 10
            npx playwright test
        '''
    }
    post {
        always {
            publishHTML([
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright HTML Report',
                keepAll: true,
                allowMissing: false,
                alwaysLinkToLastBuild: false
            ])
        }
    }
}
```

## Jenkinsfile sau bài 7

```groovy
pipeline {
    agent any
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
        stage('Test') {
            agent { docker { image 'node:18-alpine'; reuseNode true } }
            steps {
                sh '''
                    set -euo pipefail
                    test -f build/index.html
                    CI=true npm test
                '''
            }
            post {
                always {
                    junit 'jest-results/junit.xml'
                }
            }
        }
        stage('E2E') {
            agent { docker { image 'mcr.microsoft.com/playwright:v1.40.0-jammy'; reuseNode true } }
            steps {
                sh '''
                    set -euo pipefail
                    npm install serve
                    node_modules/.bin/serve -s build &
                    sleep 10
                    npx playwright test
                '''
            }
            post {
                always {
                    publishHTML([
                        reportDir: 'playwright-report',
                        reportFiles: 'index.html',
                        reportName: 'Playwright HTML Report',
                        keepAll: true,
                        allowMissing: false,
                        alwaysLinkToLastBuild: false
                    ])
                }
            }
        }
    }
}
```

## Vấn đề chưa giải quyết: server không tự shutdown

Sau stage E2E, server `serve` vẫn chạy ngầm trong container. Container Docker bị stop sau stage → kéo theo server chết. **Tạm OK** cho khoá học.

Trong production-grade pipeline, nên có:

```bash
serve -s build &
SERVER_PID=$!         # Lưu PID
npx playwright test
kill $SERVER_PID      # Kill server tường minh
```

Hoặc dùng tool **`start-server-and-test`** — tự start server, đợi up, run test, kill server:

```bash
npm install -D start-server-and-test
npx start-server-and-test "serve -s build" 3000 "npx playwright test"
```

→ Gọn hơn, không cần `sleep` mò.

## Tóm tắt

- **E2E test** mở browser thật, kiểm tra UX. Chậm hơn nhưng bắt được nhiều lỗi unit miss.
- **Playwright** là framework E2E hiện đại, có Docker image official `mcr.microsoft.com/playwright:...`.
- Pattern E2E trong CI: **build → start server background → sleep → run test**.
- **Không** cài global package trong CI (cần root). Cài local, gọi qua `node_modules/.bin/<tool>`.
- Chạy server với `&` để không block; thêm `sleep` để chờ server lên.
- Khi có nhiều stage publish report, tách thành **post block per-stage** hoặc dùng file path khác nhau, tránh đè report.
- Production: dùng `start-server-and-test` hoặc kill PID tường minh.

---

→ [Bài tiếp theo: Parallel stages, Blue Ocean và cấu trúc pipeline](08-parallel-blue-ocean-va-cau-truc.md)

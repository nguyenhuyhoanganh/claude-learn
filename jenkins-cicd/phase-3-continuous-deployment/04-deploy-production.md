# Bài 4: Deploy production lần đầu

3 bài trước đã chuẩn bị: Netlify CLI cài được, env var có Site ID + token. Giờ **deploy thật**.

## Lệnh `netlify deploy`

Tham khảo Netlify CLI docs:

```bash
netlify deploy [options]
```

Các flag quan trọng:

| Flag             | Ý nghĩa                                                   |
|------------------|-----------------------------------------------------------|
| `--dir=<path>`   | Thư mục chứa file deploy (mặc định = current dir)         |
| `--prod`         | Deploy lên **production** (không có = draft / preview)     |
| `--json`         | Output kết quả ở format JSON (cho script parse, bài 7)    |
| `--message=<m>`  | Commit message cho deploy này (xuất hiện trên dashboard)   |
| `--site=<id>`    | Override Site ID (mặc định lấy từ env var)                |
| `--auth=<token>` | Override Auth Token (mặc định lấy từ env var)             |

→ Vì đã set env var, chỉ cần: `netlify deploy --dir=build --prod`.

## Stage Deploy hoàn chỉnh

```groovy
stage('Deploy') {
    agent {
        docker {
            image 'node:18-alpine'
            reuseNode true
        }
    }
    steps {
        sh '''
            set -euo pipefail
            npm install netlify-cli
            node_modules/.bin/netlify --version
            echo "Deploying to production. Site ID: $NETLIFY_SITE_ID"
            node_modules/.bin/netlify status
            node_modules/.bin/netlify deploy --dir=build --prod
        '''
    }
}
```

Commit + push + Build Now.

## Log khi deploy thành công

```text
[Pipeline] { (Deploy)
$ docker run -t -d ... node:18-alpine cat
+ npm install netlify-cli
... (cài 30s)
+ node_modules/.bin/netlify --version
netlify-cli/16.x.x linux-x64 node-v18.18.2
+ echo Deploying to production. Site ID: 12345-abcd-...
Deploying to production. Site ID: 12345-abcd-...
+ node_modules/.bin/netlify status
─── Current Netlify User ───
Name: ...
Email: ...
─── Netlify Site ───
Site Name: golden-pavlova-abc123
Site ID:   12345-abcd-...
Site URL:  https://golden-pavlova-abc123.netlify.app

+ node_modules/.bin/netlify deploy --dir=build --prod
Deploy path:           /var/jenkins_home/workspace/learn-jenkins-app/build
Configuration path:    None
Deploying to main site URL...
✔ Finished hashing 8 files
✔ CDN requesting 8 files
✔ Finished uploading 8 assets
✔ Deploy is live!

Logs:              https://app.netlify.com/sites/.../deploys/abc123
Unique Deploy URL: https://abc123--golden-pavlova-abc123.netlify.app
Website URL:       https://golden-pavlova-abc123.netlify.app
```

✓ **Production URL đã cập nhật**. Mở browser → website mới sửa của bạn online.

## Cấu trúc Netlify deploy output

Quan trọng cho bài 7 (parse output):

- **Deploy path**: thư mục được upload.
- **Logs URL**: trang dashboard Netlify cho deploy này (xem rollback, file list).
- **Unique Deploy URL**: URL có prefix random — luôn trỏ về **bản deploy này cụ thể**. Lưu lại làm "lịch sử".
- **Website URL**: URL chính thức (custom domain hoặc `.netlify.app`). Cập nhật mỗi lần `--prod` deploy.

`--prod` vs không `--prod`:

```text
netlify deploy --prod
   → Update Website URL (production).
   → Vẫn có Unique Deploy URL riêng.

netlify deploy           (không --prod)
   → CHỈ tạo Unique Deploy URL (random prefix).
   → Website URL KHÔNG bị update.
   → Đây là "preview" / "draft" / "staging".
```

Bài 6 sẽ dùng không `--prod` cho staging.

## Verify thủ công

Mở browser URL → website lên với bản mới nhất (commit gần nhất từ Git).

Nếu cần verify một vài lần build trước:

- Vào Netlify dashboard → site → **Deploys** tab.
- Danh sách mọi deploy + commit message + timestamp.
- Click **Published deploy** → xem URL chính thức tại thời điểm đó.
- Có nút **Publish deploy** trên từng row → click để **rollback** về bản cũ.

## Jenkinsfile sau bài 4

```groovy
pipeline {
    agent any
    environment {
        NETLIFY_SITE_ID    = '12345-abcd-ef00-1234-567890abcdef'
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
                stage('Unit Tests') {
                    agent { docker { image 'node:18-alpine'; reuseNode true } }
                    steps {
                        sh '''
                            set -euo pipefail
                            test -f build/index.html
                            CI=true npm test
                        '''
                    }
                    post { always { junit 'jest-results/junit.xml' } }
                }
                stage('E2E Tests') {
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
                                reportName: 'Playwright Local',
                                keepAll: true,
                                allowMissing: false,
                                alwaysLinkToLastBuild: false
                            ])
                        }
                    }
                }
            }
        }
        stage('Deploy') {
            agent { docker { image 'node:18-alpine'; reuseNode true } }
            steps {
                sh '''
                    set -euo pipefail
                    npm install netlify-cli
                    node_modules/.bin/netlify --version
                    echo "Deploying to production. Site ID: $NETLIFY_SITE_ID"
                    node_modules/.bin/netlify status
                    node_modules/.bin/netlify deploy --dir=build --prod
                '''
            }
        }
    }
}
```

→ Đây là **pipeline đầy đủ** CI → CD đến production. Mỗi push code = pipeline tự build + test + deploy. Tuyệt vời.

Nhưng có **3 vấn đề** sẽ giải quyết bài tiếp theo:

1. Vẫn phải **click "Build Now" thủ công** mỗi lần. Cần trigger tự động (bài 5).
2. Deploy **thẳng production** = rủi ro cao. Cần staging trước (bài 6).
3. Không **verify** website sau deploy. Cần post-deployment test (bài 7).

## Pitfall khi deploy lần đầu

### Lỗi: "Not logged in" hoặc "Unauthorized"

→ Token sai/hết hạn. Vào credential Jenkins → Update → paste token mới.

### Lỗi: "Site not found"

→ Site ID sai. Check lại trên Netlify dashboard → Site Configuration → Site ID. Copy paste cẩn thận.

### Lỗi: "Empty deploy"

→ Path `--dir=build` không có file. Build stage có thật sự tạo `build/index.html`? Kiểm tra `ls -la build/`.

### Lỗi: command not found `netlify`

→ Quên prefix `node_modules/.bin/`. Hoặc `npm install netlify-cli` fail. Check log của step trước.

### Deploy thành công nhưng website không update

→ Browser cache. Hard refresh (`Ctrl+Shift+R` / `Cmd+Shift+R`) hoặc dùng incognito.

→ Hoặc Netlify CDN cache. Mất 30-60s để propagate. Đợi 1 phút.

## Quan sát: pipeline duration tăng

Trước:
```text
Build (1m) → Tests parallel (1m) = ~2 phút
```

Sau:
```text
Build (1m) → Tests parallel (1m) → Deploy (40s) = ~3 phút
```

Mỗi push code mất ~3 phút mới online. Acceptable cho hầu hết project. Tối ưu nếu muốn:

- Cache `node_modules` qua các build → giảm Build từ 1m về 20s.
- Chỉ build/test lại file thay đổi → incremental build.
- Skip stage trên branch dev (chỉ chạy đủ trên main).

Đây là tối ưu cấp **advanced**, khoá học không đi sâu.

## Bảo mật cuối cùng

Token Netlify quyền cao — bị lộ là deploy được tuỳ ý. Khi pipeline đã chạy ổn:

1. **Limit token scope** trên Netlify (nếu support — hiện token Netlify là full-scope, chưa chia nhỏ được).
2. **Rotate token** mỗi 60-90 ngày.
3. **Monitor deploys** — đăng ký email/Slack notification cho deploy.
4. **Bật 2FA** trên tài khoản Netlify chính.

## Tóm tắt

- `netlify deploy --dir=build --prod` deploy lên production.
- Bỏ `--prod` = chỉ tạo preview URL (không update site chính).
- Verify auth bằng `netlify status` trước khi deploy.
- Đầy đủ pipeline CI/CD: Build → Test → E2E → Deploy. Mỗi push = pipeline chạy.
- Deploy thẳng production = rủi ro → bài 6 sẽ thêm staging.
- Verify sau deploy bằng E2E test → bài 8.
- Trigger tự động (không click Build Now) → bài 5.
- Bảo mật token: rotation, monitor, 2FA.

---

→ [Bài tiếp theo: Build triggers — Pipeline tự động chạy](05-build-triggers.md)

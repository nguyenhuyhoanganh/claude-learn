# Bài 2: Cài CLI tool và lưu config trong environment variables

Bài 1 bạn deploy thủ công qua browser. Giờ thay browser bằng **CLI** để Jenkins script được.

## Vì sao phải dùng CLI?

Jenkins **không thể** mở browser, click button, drag file. Mọi automation đều qua command line. Cách duy nhất nói chuyện với Netlify từ Jenkins là dùng tool **Netlify CLI**.

```text
Manual (browser):                  Automated (CLI):
─────────────────                  ─────────────────

Mở netlify.com                     ─►  netlify deploy
Login                                  --dir=./build
Click "Add new site"                   --prod
Drag folder build/
Click upload
Đợi
Mở URL kiểm tra
```

→ 5 thao tác chuột thay bằng 1 dòng lệnh. **Reproducible**, **scriptable**, **logged**.

CLI tương tự tồn tại cho mọi platform DevOps: AWS CLI, gcloud CLI, kubectl, Heroku CLI, Docker CLI... Học pattern này → dùng được hết.

## Cài Netlify CLI trong pipeline

Netlify CLI phân phối qua **npm** (vì viết bằng Node.js). May mắn project của ta cũng dùng Node → chỉ cần thêm 1 lệnh.

### Cách SAI: cài global

Theo docs Netlify, lệnh cài "chính thức" là:

```bash
npm install -g netlify-cli
```

`-g` = global → cài vào `/usr/lib/node_modules/`. Trong container Docker chạy với user thường (`node`, UID 1000), **không có quyền** vào `/usr/lib/`:

```text
+ npm install -g netlify-cli
npm ERR! code EACCES
npm ERR! syscall mkdir
npm ERR! path /usr/lib/node_modules
npm ERR! errno -13
npm ERR! Error: EACCES: permission denied, mkdir '/usr/lib/node_modules'
```

Bài học Phase 2 đã gặp khi cài `serve`. **Đừng dùng `-g`** trong CI.

### Cách ĐÚNG: cài local

Bỏ `-g`, cài vào `node_modules/`:

```bash
npm install netlify-cli
```

→ Cài vào `node_modules/netlify-cli/`. Binary có ở `node_modules/.bin/netlify`. Gọi bằng path đầy đủ:

```bash
node_modules/.bin/netlify --version
```

→ Không cần root.

### Thêm stage Deploy vào Jenkinsfile

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
        '''
    }
}
```

→ Đặt stage này **sau** Test/E2E của Phase 2. Commit + push + Build Now.

Log mong đợi:

```text
[Pipeline] { (Deploy)
+ npm install netlify-cli
... (cài trong 20-30 giây)
+ node_modules/.bin/netlify --version
netlify-cli/16.x.x linux-x64 node-v18.18.2
```

✓ Có Netlify CLI. Tiếp theo: cấu hình "deploy vào site nào".

## Vì sao cần environment variables?

Trong manual flow bài 1, Netlify biết bạn deploy site nào nhờ bạn **click chuột** vào site đó. Với CLI, làm sao Netlify biết?

**Cách 1**: thêm flag mỗi lệnh:

```bash
netlify deploy --site=12345-abcd-... --dir=./build --prod
```

→ Dài, dễ typo, lặp lại nhiều chỗ.

**Cách 2** (chuẩn): Netlify CLI **tự đọc environment variables** `NETLIFY_SITE_ID` và `NETLIFY_AUTH_TOKEN`. Chỉ cần set 1 lần, các lệnh sau dùng tự động:

```bash
export NETLIFY_SITE_ID=12345-abcd-...
export NETLIFY_AUTH_TOKEN=secret-token

netlify deploy --dir=./build --prod    # CLI tự lấy site + auth
netlify status                          # Cũng dùng env var
```

→ Gọn hơn, **chuẩn 12-factor app** (config qua env vars).

> Convention `NETLIFY_*` là **fixed** — Netlify CLI hardcode tên biến. Bạn không đặt tên khác được.

## Set environment variable trong Jenkinsfile

Phase 1 bài 8 đã giới thiệu block `environment { ... }`:

```groovy
pipeline {
    agent any
    environment {
        NETLIFY_SITE_ID = '12345-abcd-ef00-1234-567890abcdef'   // ← Site ID của bạn
    }
    stages {
        ...
    }
}
```

→ Biến này available cho **mọi stage**. Vì là cấp pipeline.

Cập nhật stage Deploy để dùng:

```groovy
stage('Deploy') {
    agent { docker { image 'node:18-alpine'; reuseNode true } }
    steps {
        sh '''
            set -euo pipefail
            echo "Deploying to site: $NETLIFY_SITE_ID"
            npm install netlify-cli
            node_modules/.bin/netlify --version
        '''
    }
}
```

→ Trong shell, biến `NETLIFY_SITE_ID` tự inject sẵn từ env Jenkins.

Push + Build Now → log:

```text
+ echo Deploying to site: 12345-abcd-ef00-1234-567890abcdef
Deploying to site: 12345-abcd-ef00-1234-567890abcdef
+ npm install netlify-cli
```

✓ Biến hoạt động.

## Lấy Site ID ở đâu?

Đã đề cập ở bài 1, nhắc lại cho rõ:

1. Vào Netlify dashboard.
2. Chọn site bạn đã tạo.
3. **Site Configuration** (menu trái).
4. Section **Site information** → field **Site ID**.

Copy chuỗi UUID đó → paste vào `environment` Jenkinsfile.

> **Cảnh báo nhẹ**: Site ID **không phải secret** — không ai deploy được vào site bạn chỉ vì biết ID (cần thêm token). Vì thế OK commit vào Git. Token mới là secret thực sự → bài 3 sẽ xử lý.

## Pattern: env var cấp pipeline vs cấp stage

`environment` đặt ở 2 chỗ:

### Cấp pipeline (toàn bộ stage thấy)

```groovy
pipeline {
    environment {
        NETLIFY_SITE_ID = '...'
        BUILD_FILE      = 'laptop.txt'
    }
    stages { ... }
}
```

### Cấp stage (chỉ stage đó thấy)

```groovy
stages {
    stage('Build') {
        environment {
            DEBUG = 'true'         // Chỉ Build thấy
        }
        steps { ... }
    }
}
```

**Khi nào dùng cấp nào?**

- Biến **dùng nhiều stage** (như site ID) → cấp pipeline.
- Biến **chỉ một stage cần** (như debug flag riêng) → cấp stage.

Nguyên tắc: **scope nhỏ nhất có thể**. Nếu chỉ Build cần, đừng expose ra cả pipeline (giảm nhầm lẫn).

## Lưu ý: command line vs UI env vars

Jenkins có 2 cách set env var:

1. **Trong Jenkinsfile**: `environment { ... }` — như trên.
2. **Global qua UI**: Manage Jenkins → System → Global properties → Environment variables.

→ Cách 1 **luôn ưu tiên** vì là code, versioned, repeatable. Cách 2 chỉ dùng cho biến **toàn server** (proxy URL, region…) hiếm khi đổi.

## Mở rộng: dynamic env vars

Đôi khi giá trị env var không cố định, mà tính từ kết quả lệnh:

```groovy
environment {
    BUILD_ID  = "${env.BUILD_NUMBER}"          // Built-in của Jenkins
    GIT_SHORT = "${env.GIT_COMMIT.take(7)}"    // SHA ngắn 7 ký tự
    TIMESTAMP = "${new Date().format('yyyy-MM-dd-HH-mm')}"
}
```

→ Hữu ích tag image Docker, đặt tên artifact, log thông tin trace. Bài 9 sẽ dùng để tag application version.

## Tóm tắt

- **Đừng `npm install -g`** trong CI → cài local, gọi qua `node_modules/.bin/<tool>`.
- Netlify CLI đọc 2 env var **cố định**: `NETLIFY_SITE_ID` + `NETLIFY_AUTH_TOKEN`. Đặt tên khác = không work.
- **Site ID** **không phải secret** → OK đặt thẳng trong Jenkinsfile + Git.
- **Auth token** mới là secret thật → bài 3 xử lý qua Jenkins Credentials.
- `environment { ... }` ở cấp pipeline hoặc stage. Scope nhỏ nhất có thể.
- Dynamic env var: dùng `"${...}"` Groovy interpolation.

---

→ [Bài tiếp theo: Secrets và Credentials trong Jenkins](03-secrets-va-credentials.md)

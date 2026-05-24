# Bài 6: Staging environment

Hiện tại pipeline đi thẳng từ test sang production. Code lỗi → user thấy ngay. Bài này thêm **staging environment** — bước đệm để test deploy trước khi đụng production.

## Vấn đề với deploy thẳng production

Pipeline hiện tại:

```text
Build → Test → E2E (local) → Deploy Production
                                       │
                                  Lỗi? → user thấy
```

Đầu mỗi day, scenarios xấu:

1. **Test pass nhưng deploy fail** — code OK, nhưng config Netlify lỗi, Site ID sai → website bị 404.
2. **Test pass nhưng integration fail** — code OK với mock, nhưng connect production DB fail.
3. **Visual regression** — text bị thiếu vì font không load, layout vỡ trên mobile — unit test không phát hiện.
4. **Slow rollout** — bug performance chỉ thấy trên production traffic, không tái hiện local.

→ Cần một môi trường **gần giống production**, deploy trước, test trước → nếu hỏng chỉ affect dev, không affect user.

## Staging environment là gì?

```text
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  PRODUCTION (Public)                                         │
│  ├── URL: https://yourapp.com                                │
│  ├── User: thực                                              │
│  ├── Data: thực                                              │
│  ├── Traffic: real                                           │
│  └── Lỗi → ảnh hưởng business                                │
│                                                              │
│  STAGING (Internal)                                          │
│  ├── URL: https://staging-xyz.yourapp.com                    │
│  ├── User: dev team, QA                                      │
│  ├── Data: giống production (clone) hoặc dummy               │
│  ├── Traffic: chỉ test                                       │
│  └── Lỗi → chỉ dev/QA biết                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Staging** = bản sao gần như identical production, nhưng:

- Không public (internal-only).
- Đôi khi data ít hơn.
- Dùng để test deploy + smoke test + manual review.

**Pre-production** là tên gọi khác cho staging.

## Vì sao staging giúp?

1. **Test deploy itself** — nếu Netlify config sai, staging fail trước, production an toàn.
2. **Manual review** — manager / PM mở staging URL kiểm tra UX trước khi go-live.
3. **Catch integration issues** — nếu staging connect cùng API/DB như prod, lỗi tích hợp sẽ thấy.
4. **Performance test** — load test trên staging không impact user thực.
5. **Compliance** — nhiều industry (medical, finance) yêu cầu "test environment" tách biệt prod.

## Pattern môi trường

```text
Dev → Local            (machine của Dev)
   ↓
Dev → Feature branch   (mỗi PR có preview riêng)
   ↓
QA → Staging           (QA test trước release)
   ↓
PM → UAT               (User Acceptance Testing, optional)
   ↓
Prod                   (user thật)
```

Số tầng tuỳ tổ chức:
- Startup nhỏ: chỉ Dev + Prod.
- Mid-size: Dev + Staging + Prod (khoá học theo pattern này).
- Enterprise: Dev + QA + UAT + Staging + Prod.

## Infrastructure as Code

Staging phải **giống production**. Nếu tạo thủ công 2 môi trường khác nhau → drift dần dần → mục đích staging biến mất.

→ **Infrastructure as Code (IaC)**: định nghĩa môi trường bằng code (Terraform, Pulumi, CloudFormation…), apply cho cả staging và production → giống nhau 100%.

```text
# infra.tf (Terraform)
resource "netlify_site" "app" {
  name = var.env       # "staging" hoặc "prod"
  ...
}

# Deploy:
terraform apply -var="env=staging"    → tạo staging
terraform apply -var="env=prod"       → tạo prod (config y nhau)
```

→ Phase 5 sẽ chạm đến khái niệm này khi deploy AWS.

## Staging với Netlify: dùng preview deploys

Khoá học dùng **trick của Netlify**: gọi `netlify deploy` **không có `--prod`** → tạo **preview URL** random — đây làm staging luôn.

```bash
netlify deploy --dir=build              # KHÔNG --prod → preview
# → Output URL: https://abc123--golden-pavlova-xyz.netlify.app
```

**Đặc tính preview URL**:

- **Random prefix** (`abc123`) → khác mỗi deploy.
- **Vẫn public** nhưng URL ẩn → ai không có link không truy cập được.
- **Không update production URL** → an toàn.
- Lưu trong **Netlify Deploys history**, có thể "Publish" sau.

→ Pattern: deploy staging trước, test → nếu OK → deploy production (lệnh khác có `--prod`).

> Trong setup thật, staging và production thường là **2 site Netlify riêng** với 2 Site ID khác nhau. Khoá học đơn giản hoá: 1 site, dùng preview cho staging.

## Thêm stage `Deploy Staging`

Trước stage `Deploy` (production), thêm `Deploy Staging`:

```groovy
stage('Deploy Staging') {
    agent { docker { image 'node:18-alpine'; reuseNode true } }
    steps {
        sh '''
            set -euo pipefail
            npm install netlify-cli
            node_modules/.bin/netlify --version
            echo "Deploying to STAGING"
            node_modules/.bin/netlify status
            node_modules/.bin/netlify deploy --dir=build
        '''
    }
}
```

→ Chú ý: **không có `--prod`**.

Rename stage cũ thành `Deploy Prod` cho rõ:

```groovy
stage('Deploy Prod') {
    agent { docker { image 'node:18-alpine'; reuseNode true } }
    steps {
        sh '''
            set -euo pipefail
            npm install netlify-cli
            echo "Deploying to PRODUCTION"
            node_modules/.bin/netlify status
            node_modules/.bin/netlify deploy --dir=build --prod
        '''
    }
}
```

## Pipeline sau khi thêm staging

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
        stage('Deploy Staging') { ... }     // ← NEW
        stage('Deploy Prod')    { ... }
    }
}
```

Push + Build Now. Log mới có 2 deploy:

```text
[Pipeline] { (Deploy Staging)
+ netlify deploy --dir=build
✔ Deploy is live!
Website draft URL: https://65abc--golden-pavlova-xyz.netlify.app

[Pipeline] { (Deploy Prod)
+ netlify deploy --dir=build --prod
✔ Deploy is live!
Website URL: https://golden-pavlova-xyz.netlify.app
```

→ Mở **draft URL** (random) — đó là staging. Mở **Website URL** (chính) — đó là production. Cả 2 hiện cùng nội dung (vì cùng build).

## Pipeline có lỗi gì?

Bây giờ pipeline đi thẳng staging → prod, **không** verify staging có ok hay không. Nếu staging bị lỗi vì lý do gì đó, prod vẫn deploy.

→ Hai cải tiến cần (bài 7, 8):

- **Bài 7**: E2E test trên staging URL → verify staging OK trước → mới đến prod.
- **Bài 7**: thêm **Manual Approval** giữa staging và prod (chuyển sang Continuous Delivery).
- **Bài 8**: E2E test trên production URL → verify deploy thật sự ok.

## Mở rộng: staging riêng (production-grade)

Trong dự án thật, thường tạo **2 Netlify site riêng** cho staging và prod:

```groovy
environment {
    NETLIFY_AUTH_TOKEN = credentials('netlify-token')
    // Site ID khác nhau cho staging và prod
    NETLIFY_SITE_ID_STAGING = '11111-aaaa-...'
    NETLIFY_SITE_ID_PROD    = '22222-bbbb-...'
}

stage('Deploy Staging') {
    environment {
        NETLIFY_SITE_ID = "${NETLIFY_SITE_ID_STAGING}"     // Override
    }
    steps { sh 'netlify deploy --dir=build --prod' }       // --prod nhưng SITE_ID staging
}

stage('Deploy Prod') {
    environment {
        NETLIFY_SITE_ID = "${NETLIFY_SITE_ID_PROD}"
    }
    steps { sh 'netlify deploy --dir=build --prod' }
}
```

→ Staging có URL ổn định (như `staging-yourapp.netlify.app`). Test dễ hơn (không phải parse random URL).

Đây là setup **đúng** cho production. Khoá học dùng preview URL để giản lược, không cần tạo nhiều site.

## Pitfall

### Pitfall 1: lẫn lộn `--prod` flag

```bash
# SAI: deploy lên production khi tưởng là staging
netlify deploy --dir=build --prod
```

→ Mỗi lần đụng `--prod`, hỏi: "thực sự muốn lên prod chưa?"

### Pitfall 2: staging có credential prod

Nếu staging dùng cùng database / API key như prod, một bug ở staging → corrupt prod data.

→ Best practice: **staging có DB / API key riêng**. Hoặc dùng **read-only** copy của prod data.

### Pitfall 3: staging quên cập nhật

Nếu staging chạy version cũ hơn prod 1 tuần → test không cover scenario mới của prod. Phải **deploy staging đầu mỗi commit** (như pipeline ta đang làm).

### Pitfall 4: drift config

Sau 6 tháng, staging và prod khác biệt vì có người sửa staging mà quên sửa prod (hoặc ngược lại). → IaC giải quyết.

## Tóm tắt

- **Staging** = môi trường gần giống production, internal-only, để test deploy/E2E/UAT trước khi go-live.
- Lý do: catch deploy bug, catch integration bug, manual review trước release, performance test, compliance.
- Khoá dùng **Netlify preview deploy** (không `--prod`) làm staging — simple nhưng OK demo.
- Production-grade: **2 Netlify site riêng** cho staging/prod, có Site ID khác nhau.
- **IaC** (Infrastructure as Code) đảm bảo staging và prod identical.
- Bài tiếp theo: E2E test trên staging URL + manual approval → đúng nghĩa **Continuous Delivery**.

---

→ [Bài tiếp theo: Manual approval và truyền dynamic data giữa stage](07-manual-approval-va-dynamic-data.md)

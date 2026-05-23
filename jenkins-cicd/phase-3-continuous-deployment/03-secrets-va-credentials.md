# Bài 3: Secrets và Credentials trong Jenkins

Bài 2 đã set Site ID vào Jenkinsfile. Còn **auth token** thì sao? Không thể commit lên Git như Site ID — bị lộ là **mất tài khoản**.

## Vì sao token là bí mật?

Auth token của bạn cho phép:

- Deploy bất kỳ site nào bạn sở hữu.
- Xem account info, billing.
- Đổi config, xoá site.

Nếu bạn paste token vào Jenkinsfile rồi push lên Git public — **hacker scan repo trong vài giờ** sẽ tìm thấy:

```text
NETLIFY_AUTH_TOKEN = 'abc123secrettoken'      ← ← ← Ai cũng đọc được!
```

Các bot thường xuyên scrape GitHub public repos tìm secret. Có nhiều **dataset huấn luyện AI** chứa token bị lộ này. Lộ rồi → coi như mất.

→ **Nguyên tắc vàng**: **không bao giờ** commit secret vào Git, kể cả private repo.

## Tạo Personal Access Token trên Netlify

Trước khi cấu hình Jenkins, tạo token:

1. Netlify dashboard → góc phải trên (avatar) → **User Settings**.
2. Menu trái → **Applications** → tab **Personal access tokens**.
3. Click **New access token**.
4. **Description**: `Jenkins CI` (để biết token đó dùng cho cái gì).
5. **Expiration**: **chọn có expiry** — 30/60/90 ngày tuỳ rủi ro. **Đừng** chọn no-expiry trừ khi thật sự cần.
6. Click **Generate token**.
7. **Copy ngay** — Netlify chỉ hiển thị token **1 lần duy nhất**. Đóng tab = mất, phải tạo mới.

Token có dạng:

```text
nfp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Vì sao token có expiration?

**Rotation** (đổi định kỳ) là best practice security:

- Lỡ token bị lộ → tự động hết hạn sau N ngày → impact giới hạn.
- Buộc bạn kiểm tra "có còn cần token này không" định kỳ.
- Tuân thủ compliance (PCI, SOC2, HIPAA).

**Trade-off**: phải nhớ tạo token mới + update Jenkins khi token cũ hết hạn. Dán reminder lịch.

## Lưu token vào Jenkins Credentials

**Đừng** paste token vào Jenkinsfile. Dùng **Jenkins Credentials Store** — kho lưu secret được encrypt + access control.

### Bước 1: Tạo credential mới

1. Dashboard → **Manage Jenkins** → **Credentials**.
2. Click **System** (default).
3. Click **Global credentials (unrestricted)**.
4. Click **+ Add Credentials** (góc phải).

Form xuất hiện:

```text
┌──────────────────────────────────────────────────┐
│  Kind:       [Secret text          ▼]            │
│  Scope:      [Global               ▼]            │
│  Secret:     [Paste token here     ]             │
│  ID:         [netlify-token        ]             │
│  Description:[Netlify Auth Token   ]             │
│                                                    │
│                                       [Create]    │
└──────────────────────────────────────────────────┘
```

Điền:

- **Kind**: `Secret text` (không phải `Username with password`).
- **Scope**: `Global` (mọi job dùng được).
- **Secret**: paste token từ Netlify.
- **ID**: `netlify-token` — tên gọi để Jenkinsfile reference. **Đặt cố định**, sau khó đổi.
- **Description**: free text, ghi giúp nhớ "token này là gì".

Click **Create**.

### Bước 2: Verify credential đã lưu

Quay lại danh sách credentials → thấy entry mới:

```text
┌─────────────────────────────────────────────────────┐
│  ID              │  Type        │  Description       │
├─────────────────────────────────────────────────────┤
│  netlify-token   │  Secret text │  Netlify Auth Token│
└─────────────────────────────────────────────────────┘
```

Click vào netlify-token → **Update** form mở ra → nút **Concealed** (token bị che ` ******* `). Bạn **không xem được** token từ UI — đúng spec. Chỉ pipeline đọc được.

### Các loại credentials khác

`Secret text` là loại đơn giản nhất. Jenkins còn:

| Kind                          | Use case                                  |
|-------------------------------|-------------------------------------------|
| Secret text                   | Token đơn (Netlify, Slack, GitHub PAT)   |
| Username with password        | Auth basic (FTP, registry private)        |
| SSH Username with private key | Login server qua SSH                      |
| Certificate                   | Client cert cho mutual TLS               |
| AWS Credentials (qua plugin)  | AWS Access Key + Secret                   |
| File                          | Upload nguyên file (k8s kubeconfig, etc.) |

→ Phase 5 sẽ dùng **AWS Credentials**.

## Dùng credential trong Jenkinsfile

Cú pháp `credentials('<id>')`:

```groovy
pipeline {
    environment {
        NETLIFY_SITE_ID    = '12345-abcd-...'
        NETLIFY_AUTH_TOKEN = credentials('netlify-token')   // ← Reference credential
    }
    stages { ... }
}
```

Khi pipeline chạy:

1. Jenkins decrypt token từ credential store.
2. Inject vào env var `NETLIFY_AUTH_TOKEN`.
3. Stage Deploy có biến này, Netlify CLI tự dùng.

### Test với `netlify status`

Thêm verify command:

```groovy
stage('Deploy') {
    agent { docker { image 'node:18-alpine'; reuseNode true } }
    steps {
        sh '''
            set -euo pipefail
            npm install netlify-cli
            node_modules/.bin/netlify --version
            node_modules/.bin/netlify status
        '''
    }
}
```

`netlify status` không deploy gì, chỉ in info: current user + site ID. Đây là cách verify token + site config đều ok trước khi `deploy` thật.

Push + Build Now → log:

```text
+ node_modules/.bin/netlify status
──────────────────────────────────┐
 Current Netlify User              │
──────────────────────────────────┘
Name:    Your Name
Email:   you@example.com
Teams:
 - <Your team> (Owner)

──────────────────────────────────┐
 Netlify Site                      │
──────────────────────────────────┘
Site Name: golden-pavlova-abc123
Site ID:   12345-abcd-...
Site URL:  https://golden-pavlova-abc123.netlify.app
```

✓ Auth thành công, site config đúng.

Nếu thấy:

```text
Error: Not logged in
```

→ Token sai/hết hạn. Tạo mới, update credential, build lại.

## Quan trọng: token KHÔNG hiện trong log

Khi pipeline dùng `credentials(...)`, Jenkins **tự động mask** token trong log. Bạn có thể test:

```groovy
sh 'echo "Token = $NETLIFY_AUTH_TOKEN"'
```

Log:

```text
+ echo Token = ****
Token = ****
```

→ Token được thay bằng `****`. Hacker xem log build cũng không lấy được.

Nhưng **đừng tin 100%**. Có vài cách bypass:

- `echo $NETLIFY_AUTH_TOKEN | base64` — log sẽ in base64 không bị mask.
- `curl -H "Authorization: $TOKEN" ...` — log có thể leak qua URL.

→ Nguyên tắc: ngay cả khi Jenkins mask, vẫn cẩn thận không gửi token đi đâu không cần thiết.

## Best practice quản lý credentials

### 1. Đặt tên có hệ thống

```text
netlify-token             ← OK
aws-prod-deploy-key       ← OK (rõ env)
slack-webhook-builds      ← OK (rõ mục đích)
my-token                  ← Tệ — bao nhiêu token tên này?
```

### 2. Description đầy đủ

```text
Netlify Auth Token         ← OK
Token for deploying website project to Netlify. Owner: DevOps team. Rotates every 60 days.  ← Tốt hơn
```

→ 6 tháng sau, ai đó kế thừa Jenkins sẽ cảm ơn bạn.

### 3. Scope phù hợp

- `Global` — mọi job dùng được. Mặc định, OK cho cá nhân.
- `System` — chỉ Jenkins core dùng (không pipeline).
- **Folder-level credentials** (qua plugin) — restrict theo project. Production-grade.

### 4. Audit định kỳ

Mỗi quý review:
- Token nào không còn dùng → xoá.
- Token nào sắp expire → tạo mới.
- Ai có quyền xem credential page → giảm xuống minimal.

### 5. Không share credential giữa team

Mỗi người/dịch vụ có token riêng → nếu ai đó nghỉ việc, chỉ revoke token của họ, không impact người khác.

### 6. Lưu ý compliance

Trong tổ chức lớn, dùng **HashiCorp Vault**, **AWS Secrets Manager**, hay **Azure Key Vault** — Jenkins chỉ "pull tạm" khi cần, không lưu lâu dài. Plugin có sẵn cho các giải pháp này.

## Pitfall thường gặp

### Pitfall 1: token nhưng nhập sai field

```groovy
NETLIFY_AUTH_TOKEN = credentials('netlify-token')
```

Nếu credential ID là `Netlify-Token` (Hoa T), pipeline fail:

```text
ERROR: Cannot find credential with ID 'netlify-token'
```

→ Tên credential **case-sensitive**. Đặt cẩn thận, copy paste để tránh typo.

### Pitfall 2: `credentials()` chỉ trong block `environment`

```groovy
stage('Deploy') {
    steps {
        sh "netlify deploy --auth=${credentials('netlify-token')}"   // ← SAI
    }
}
```

→ `credentials()` chỉ dùng được trong `environment { ... }`. Trong `steps`, dùng `withCredentials { ... }` (xem dưới).

### Pitfall 3: token trong URL

```bash
curl https://api.example.com/?token=$SECRET
```

→ Tool log có thể ghi URL → leak token. Đặt token trong header:

```bash
curl -H "Authorization: Bearer $SECRET" https://api.example.com/
```

## `withCredentials` cho use case phức tạp

Khi credential là username+password hoặc cần scope hẹp hơn:

```groovy
steps {
    withCredentials([usernamePassword(
        credentialsId: 'docker-hub',
        usernameVariable: 'DOCKER_USER',
        passwordVariable: 'DOCKER_PASS'
    )]) {
        sh '''
            docker login -u "$DOCKER_USER" -p "$DOCKER_PASS"
            docker push ...
        '''
    }
}
```

→ 2 biến `DOCKER_USER` và `DOCKER_PASS` chỉ available **trong block** `withCredentials`. Sau khi exit block, biến biến mất.

Phase 4-6 sẽ dùng pattern này nhiều.

## Tóm tắt

- **Không commit secret vào Git**. Bot scan repo public trong vài giờ.
- Tạo Personal Access Token trên Netlify, **đặt expiration**, **copy ngay**.
- Lưu vào Jenkins: **Manage Jenkins → Credentials → Global → + Add → Secret text**.
- ID credential **không đổi**, đặt cẩn thận (vd `netlify-token`).
- Dùng trong Jenkinsfile: `environment { NETLIFY_AUTH_TOKEN = credentials('netlify-token') }`.
- Jenkins **mask token** trong log → an toàn nhưng đừng tin 100%.
- Best practice: rotation định kỳ, tên có hệ thống, scope nhỏ, audit quarterly.
- `withCredentials { ... }` cho use case phức tạp (username+password, file).

---

→ [Bài tiếp theo: Deploy production lần đầu](04-deploy-production.md)

# Bài 5: AWS credentials trong Jenkins

Bài 4 có Access Key + Secret Key. Bài này lưu vào Jenkins Credentials và dùng trong pipeline.

## Cách 1: dùng credential type "Username with password"

AWS credentials có 2 phần (Access Key ID + Secret Access Key) → tương đương username + password.

### Lưu vào Jenkins

1. Dashboard → **Manage Jenkins** → **Credentials** → **System** → **Global credentials** → **+ Add Credentials**.
2. Form:

```text
Kind:        [Username with password ▼]
Scope:       [Global ▼]
Username:    [AKIA1234567890ABCDEF]                 ← Access Key ID
Password:    [abcdef...secret]                       ← Secret Access Key
ID:          [my-aws]                                 ← Tên gọi
Description: [AWS credentials for Jenkins user]
```

Click **Create**.

→ Credential `my-aws` trong store.

> AWS cho phép treat Access Key ID **như secret** (mask trong log). Nhưng technically nó "username".

## Cách 2: AWS Credentials plugin (chuẩn hơn)

Có plugin **CloudBees AWS Credentials** chuyên cho AWS. Cài qua Manage Jenkins → Plugins.

Sau khi cài, có thêm credential type `AWS Credentials`:

```text
Kind:                 [AWS Credentials ▼]
Access Key ID:        [AKIA...]
Secret Access Key:    [secret]
ID:                   [my-aws]
```

→ Cùng kết quả, syntax pipeline khác chút.

Khoá học dùng **Cách 1** (Username with password) — chuẩn hơn cho khoá.

## Dùng credential trong pipeline: `withCredentials`

Trong Phase 3 ta dùng `credentials('id')` trong `environment { }` cho Netlify. Vì sao không làm tương tự cho AWS?

→ Vì AWS có **2 biến** (key + secret). `credentials('id')` chỉ bind 1 biến. Cần `withCredentials` block:

```groovy
stage('AWS') {
    agent { docker { image 'my-playwright' } }
    steps {
        withCredentials([usernamePassword(
            credentialsId: 'my-aws',
            usernameVariable: 'AWS_ACCESS_KEY_ID',
            passwordVariable: 'AWS_SECRET_ACCESS_KEY'
        )]) {
            sh '''
                aws --version
                aws s3 ls
            '''
        }
    }
}
```

Giải nghĩa:

- **`withCredentials([...])`** wrapper block.
- **`usernamePassword(...)`** — credential type.
- **`credentialsId: 'my-aws'`** — ID trong store.
- **`usernameVariable: 'AWS_ACCESS_KEY_ID'`** — name của env var sẽ chứa username.
- **`passwordVariable: 'AWS_SECRET_ACCESS_KEY'`** — name env var chứa password.

→ Trong block, 2 env var `AWS_ACCESS_KEY_ID` và `AWS_SECRET_ACCESS_KEY` available. **Phải đặt đúng tên này** vì AWS CLI tự đọc.

## Snippet generator giúp

Quên syntax `withCredentials`?

1. Vào job → **Configure** → cuộn xuống cuối → **Pipeline Syntax**.
2. **Sample Step**: `withCredentials: Bind credentials to variables`.
3. **Bindings** → Add → `Username and password (separated)`.
4. Điền form → **Generate Pipeline Script**.

Copy snippet → paste.

## Tại sao AWS CLI tự đọc 2 biến này?

AWS CLI có **credential resolution chain**:

1. CLI flag `--profile` / explicit credentials.
2. Env vars `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + (optional) `AWS_SESSION_TOKEN`.
3. File `~/.aws/credentials`.
4. IAM Role (nếu chạy trên EC2/ECS).
5. SSO session.

→ Khi set env var → CLI tự nhận.

> **AWS Lab environment**: temporary credentials cần thêm **session token**:
> ```groovy
> withCredentials([
>     string(credentialsId: 'aws-session-token', variable: 'AWS_SESSION_TOKEN'),
>     usernamePassword(credentialsId: 'my-aws', ...)
> ]) { ... }
> ```

## Test pipeline

Push + Build Now → log:

```text
[Pipeline] withCredentials
Masking supported pattern matches of $AWS_ACCESS_KEY_ID or $AWS_SECRET_ACCESS_KEY
[Pipeline] {
+ aws --version
aws-cli/2.15.30 ...

+ aws s3 ls
2026-01-05 10:00:00 learn-jenkins-20260105
[Pipeline] }
[Pipeline] // withCredentials
```

✓ Cuối list có bucket bạn tạo bài 2. Auth thành công.

Log có dòng:

```text
Masking supported pattern matches of $AWS_ACCESS_KEY_ID or $AWS_SECRET_ACCESS_KEY
```

→ Jenkins **auto-mask** giá trị 2 biến trong log → kể cả user xem được log build cũng không thấy key.

## Region: thêm env var

AWS CLI cần biết **region** mặc định. Thêm:

```groovy
environment {
    AWS_DEFAULT_REGION = 'us-east-1'      // ← Default region
}
```

→ CLI không cần `--region` mỗi lệnh.

Có thể combine với `withCredentials`:

```groovy
stage('AWS') {
    agent { docker { image 'my-playwright' } }
    environment {
        AWS_DEFAULT_REGION = 'us-east-1'
    }
    steps {
        withCredentials([usernamePassword(
            credentialsId: 'my-aws',
            usernameVariable: 'AWS_ACCESS_KEY_ID',
            passwordVariable: 'AWS_SECRET_ACCESS_KEY'
        )]) {
            sh 'aws s3 ls'
        }
    }
}
```

## Scope của withCredentials

Quan trọng: 2 biến **chỉ available trong block** `withCredentials { ... }`:

```groovy
steps {
    sh 'echo $AWS_ACCESS_KEY_ID'                  // ← undefined

    withCredentials([usernamePassword(...)]) {
        sh 'echo $AWS_ACCESS_KEY_ID'              // ← defined (masked)
    }

    sh 'echo $AWS_ACCESS_KEY_ID'                  // ← undefined lại
}
```

→ Sau exit block, env var **bị clear**. Đây là security feature: tránh leak qua step không cần.

## Multiple AWS account

Khi có nhiều account (staging, prod):

```groovy
// Credential staging
withCredentials([usernamePassword(
    credentialsId: 'aws-staging',
    usernameVariable: 'AWS_ACCESS_KEY_ID',
    passwordVariable: 'AWS_SECRET_ACCESS_KEY'
)]) {
    sh 'aws s3 sync ./build s3://staging-bucket/'
}

// Credential prod (sau approval)
withCredentials([usernamePassword(
    credentialsId: 'aws-prod',
    usernameVariable: 'AWS_ACCESS_KEY_ID',
    passwordVariable: 'AWS_SECRET_ACCESS_KEY'
)]) {
    sh 'aws s3 sync ./build s3://prod-bucket/'
}
```

→ Mỗi `withCredentials` block dùng credential khác. Block lồng nhau cẩn thận tránh override.

## Pitfall

### Pitfall 1: tên biến sai

```groovy
usernameVariable: 'AWS_KEY'         // ❌ CLI không nhận
passwordVariable: 'AWS_SECRET'
```

→ Phải đúng `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`. Else AWS CLI báo "Unable to locate credentials".

### Pitfall 2: dùng ngoài block

```groovy
withCredentials([...]) {
    sh 'echo $AWS_ACCESS_KEY_ID > /tmp/key.txt'   // Save vào file
}
sh 'aws s3 ls'   // Fail — env var đã clear
sh 'cat /tmp/key.txt | aws ...'   // Workaround xấu — file vẫn có key
```

→ Đừng cố lưu key ra file. Mọi command cần auth → đặt **trong** withCredentials.

### Pitfall 3: log echo key

```groovy
sh 'echo "Key is: $AWS_ACCESS_KEY_ID"'      // Jenkins mask
sh 'echo "Key is: $AWS_ACCESS_KEY_ID" | base64'   // ❌ Base64 bypass mask!
```

→ Đừng manipulate key qua echo/transform. Mask không phải bullet-proof.

### Pitfall 4: multiple region inconsistent

```groovy
environment { AWS_DEFAULT_REGION = 'us-east-1' }
steps {
    sh 'aws --region eu-west-1 s3 ls'      // Override → query EU không thấy bucket US
}
```

→ Nhất quán region trong pipeline.

## Pipeline cập nhật

```groovy
pipeline {
    agent any
    environment {
        NETLIFY_SITE_ID    = '...'
        NETLIFY_AUTH_TOKEN = credentials('netlify-token')
        REACT_APP_VERSION  = "1.0.${BUILD_ID}"
        AWS_DEFAULT_REGION = 'us-east-1'
        AWS_S3_BUCKET      = 'learn-jenkins-20260105'   // ← Sẽ dùng bài 6
    }
    stages {
        stage('Build') { ... }
        stage('Run Tests') { ... }
        stage('Deploy & Test Staging') { ... }

        stage('AWS') {
            agent { docker { image 'my-playwright' } }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'my-aws',
                    usernameVariable: 'AWS_ACCESS_KEY_ID',
                    passwordVariable: 'AWS_SECRET_ACCESS_KEY'
                )]) {
                    sh '''
                        aws --version
                        aws s3 ls
                    '''
                }
            }
        }

        stage('Deploy & Test Prod') { ... }
    }
}
```

→ Stage AWS hiện chỉ list bucket. Bài 6 thực sự upload file.

## Tóm tắt

- AWS có 2 phần credentials → dùng **`usernamePassword`** credential trong Jenkins.
- Pipeline syntax: **`withCredentials([usernamePassword(...)]) { ... }`**.
- Env var **bắt buộc đúng tên**: `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`.
- Thêm `AWS_DEFAULT_REGION` để khỏi `--region` mỗi lệnh.
- Biến chỉ available **trong block** `withCredentials` — đúng spec security.
- Jenkins **auto-mask** giá trị 2 biến trong log (nhưng không bullet-proof).
- AWS Lab dùng temporary creds cần thêm `AWS_SESSION_TOKEN`.

---

→ [Bài tiếp theo: Upload file lên S3](06-upload-file-len-s3.md)

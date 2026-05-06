# Bài 4: OpenID Connect — Xác thực với Dịch vụ Bên ngoài

## Vấn đề với Access Keys

Khi workflow cần tương tác với dịch vụ bên ngoài (AWS, Azure, GCP...), cách thông thường là dùng **access keys** lưu trong secrets:

```yaml
steps:
  - name: Deploy
    env:
      AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    run: aws s3 sync ./dist s3://my-bucket
```

Vấn đề với cách này:

| Vấn đề | Giải thích |
|---|---|
| Keys tồn tại lâu dài | Nếu bị lộ, kẻ tấn công dùng được mãi cho đến khi bạn revoke |
| Quyền quá rộng | AWS access key thường có full access, không phải chỉ upload S3 |
| Setup thủ công | Phải tạo key, copy vào GitHub Secrets, repeat cho mỗi repo |
| Nguy cơ lộ qua script injection | Env vars có thể bị stolen qua injected code |

---

## OpenID Connect (OIDC) giải quyết thế nào?

OIDC cho phép GitHub **tự động xin cấp phép** từ dịch vụ bên ngoài **khi job đang chạy**. Token này:
- Chỉ hợp lệ trong lúc job chạy
- Chỉ có quyền bạn đã cấu hình sẵn trên AWS/Azure/GCP
- Không cần lưu key dài hạn trong Secrets

```
Workflow job bắt đầu
    ↓
GitHub cấp OIDC token cho job
    ↓
Job gửi token đến AWS
    ↓
AWS xác minh token và cấp AWS credentials tạm thời
    ↓
Job dùng credentials tạm thời để làm việc
    ↓
Job kết thúc → credentials hết hạn tự động
```

---

## Thiết lập trên AWS (ví dụ)

### Bước 1: Thêm Identity Provider trên AWS IAM

1. Vào AWS Console → IAM → Identity providers
2. Add provider → OpenID Connect
3. Provider URL: `https://token.actions.githubusercontent.com`
4. Audience: `sts.amazonaws.com`
5. Click "Get thumbprint" → Add provider

### Bước 2: Tạo IAM Role gắn với Identity Provider

1. IAM → Roles → Create role
2. Trusted entity: Web identity → chọn provider vừa tạo
3. Thêm permissions (ví dụ: `AmazonS3FullAccess`)
4. Đặt tên role (ví dụ: `GitHubActionsDeployRole`)
5. Copy ARN của role (dạng: `arn:aws:iam::123456789:role/GitHubActionsDeployRole`)

### Bước 3: (Tùy chọn) Giới hạn role chỉ cho repo cụ thể

Trong Trust relationship của role, thêm điều kiện:

```json
{
  "Condition": {
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:*"
    }
  }
}
```

---

## Cập nhật Workflow để dùng OIDC

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write       # ← BẮT BUỘC để dùng OIDC
      contents: read        # ← cần để checkout code
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS credentials via OIDC
        uses: aws-actions/configure-aws-credentials@v1
        with:
          role-to-assume: arn:aws:iam::123456789:role/GitHubActionsDeployRole
          aws-region: us-east-1
      
      - name: Deploy to S3
        run: aws s3 sync ./dist s3://my-bucket
      
      # Không cần AWS_ACCESS_KEY_ID hay AWS_SECRET_ACCESS_KEY nữa!
```

`id-token: write` là bắt buộc — mặc định quyền này bị tắt hoàn toàn. Nếu không có dòng này, bước OIDC sẽ fail.

---

## So sánh Access Keys vs OIDC

| | Access Keys | OIDC |
|---|---|---|
| Lưu trong Secrets | Có (key dài hạn) | Không |
| Thời hạn | Vô hạn cho đến khi revoke | Chỉ trong lúc job chạy |
| Quyền | Thường rộng | Giới hạn theo role AWS |
| Setup | Tạo key, copy vào Secrets | Tạo Identity Provider + Role |
| An toàn hơn | Ít hơn | Hơn |

---

## OIDC với các dịch vụ khác

OIDC không chỉ dùng với AWS:

| Dịch vụ | Documentation |
|---|---|
| AWS | [docs.github.com/aws](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services) |
| Azure | [docs.github.com/azure](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-azure) |
| Google Cloud | [docs.github.com/gcp](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-google-cloud-platform) |
| HashiCorp Vault | [docs.github.com/vault](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-hashicorp-vault) |

---

## Tóm tắt Phase 8

✅ **Script Injection**: Không dùng `${{ user.input }}` trực tiếp trong `run:` — luôn qua `env:` var  
✅ **Third-party Actions**: Ưu tiên verified creators, xem xét commit SHA thay vì tag  
✅ **Permissions**: Dùng `permissions:` để giới hạn quyền GITHUB_TOKEN — least privilege  
✅ **GITHUB_TOKEN**: Token tự động, tồn tại chỉ trong lúc workflow chạy  
✅ **OIDC**: Xác thực với AWS/Azure/GCP không cần lưu access keys dài hạn  

---

## Tài liệu tham khảo thêm về Security

- [Security hardening for GitHub Actions](https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions)
- [Encrypted secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Automatic token authentication (GITHUB_TOKEN)](https://docs.github.com/en/actions/security-guides/automatic-token-authentication)
- [Preventing pwn requests (Fork PR attacks)](https://securitylab.github.com/research/github-actions-preventing-pwn-requests/)
- [Security hardening with OpenID Connect](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)

---

## Tổng kết toàn khoá học

| Phase | Chủ đề | Nội dung chính |
|---|---|---|
| 1 | Nền tảng | Workflow, Jobs, Steps, Actions, CI cơ bản |
| 2 | Events | Triggers, Activity Types, Filters, Skip CI |
| 3 | Dữ liệu | Artifacts, Job Outputs, Caching |
| 4 | Configuration | Environment Variables, Secrets, Environments |
| 5 | Luồng thực thi | Conditional (`if`), continue-on-error, Matrix, Reusable Workflows |
| 6 | Containers | Job containers, Service containers |
| 7 | Custom Actions | Composite, JavaScript, Docker actions |
| 8 | Bảo mật | Script injection, Permissions, GITHUB_TOKEN, OIDC |

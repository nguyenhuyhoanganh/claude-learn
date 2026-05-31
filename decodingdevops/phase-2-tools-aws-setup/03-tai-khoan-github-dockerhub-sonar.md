# Bài 3: Tạo tài khoản GitHub, Docker Hub, SonarCloud và (tùy chọn) mua domain

DevOps không chỉ là tool trên máy bạn. Bạn còn cần **tài khoản ở 4-5 dịch vụ cloud** để host source code, image, scan code, mua tên miền. Mỗi tài khoản có **role bảo mật riêng** — biết cách setup từ đầu sẽ tránh phiền sau này.

## Bốn tài khoản trong phase này

| Dịch vụ | Vai trò | Bắt buộc? | Phí |
|---|---|---|---|
| **GitHub** | Host source code | Có | Free (public repo, 2000 phút CI/tháng) |
| **Docker Hub** | Host container image | Có | Free (1 private repo, public không giới hạn) |
| **SonarCloud** | Static code analysis | Có (CI bài sau) | Free cho public repo |
| **Domain** (GoDaddy, Namecheap) | Tên miền cho production demo | Tùy chọn | ~$2-15/năm |

Bài này đi qua từng cái, kèm **best practice bảo mật** (SSH key, PAT, MFA) ngay từ đầu.

## 1. GitHub — nhà của source code

### Tại sao chọn GitHub?

- **De facto standard** trong ngành. ~95% dự án open-source ở đây.
- **Tích hợp** với Jenkins, AWS, K8s, mọi tool DevOps.
- **GitHub Actions** built-in cho CI/CD (section 18 sẽ học).
- **Codespaces** — dev environment trong cloud.

Đối thủ: **GitLab** (self-host mạnh, CI tích hợp), **Bitbucket** (gắn Jira). Khoá này dùng GitHub làm chính, nhắc 2 cái kia sau.

### Đăng ký

1. Vào **github.com** → "Sign up".
2. Username — chọn cẩn thận, **sẽ xuất hiện trong URL repo** (vd `github.com/yourname/...`). Không đổi dễ.
3. Email — dùng email **lâu dài**, sẽ nhận notification, security alert.
4. Password — strong, đừng tái dùng.
5. Chọn plan **Free** (đủ cho khoá).

### Bật MFA (Multi-Factor Authentication) — BẮT BUỘC

GitHub yêu cầu MFA cho mọi user contribute từ 2024. Không bật → tài khoản có thể bị khoá.

**Cách bật**:
1. Avatar → Settings → "Password and authentication" → "Two-factor authentication".
2. Chọn **Authenticator app** (Google Authenticator, Authy, 1Password) — KHÔNG dùng SMS (SIM swap attack).
3. Scan QR, nhập 6 số.
4. **In recovery codes ra giấy** hoặc lưu vào password manager — mất authenticator vẫn login được.

### SSH key — cách đúng để authenticate Git

Có 3 cách Git authenticate với GitHub:

| Cách | Bảo mật | Khi nào dùng |
|---|---|---|
| **Password** | KHÔNG còn được hỗ trợ (deprecated 2021) | Đừng dùng |
| **Personal Access Token (PAT)** | OK | Khi cần HTTPS, vd CI script |
| **SSH key** | Tốt nhất | Local development, push thường xuyên |

#### Tạo SSH key

```bash
# Tạo key Ed25519 (modern, an toàn hơn RSA cũ)
ssh-keygen -t ed25519 -C "your-email@example.com"

# Mặc định: ~/.ssh/id_ed25519 (private) + id_ed25519.pub (public)
# Passphrase: nên đặt (mất key vẫn an toàn)
```

#### Thêm public key vào GitHub

```bash
# Copy public key
cat ~/.ssh/id_ed25519.pub

# Hoặc trên macOS:
pbcopy < ~/.ssh/id_ed25519.pub

# Windows Git Bash:
clip < ~/.ssh/id_ed25519.pub
```

Vào GitHub → Settings → "SSH and GPG keys" → "New SSH key" → paste public key → Save.

#### Test

```bash
ssh -T git@github.com
# Hi <username>! You've successfully authenticated...
```

#### Clone bằng SSH thay vì HTTPS

```bash
# HTTPS — yêu cầu PAT mỗi push
git clone https://github.com/acme/repo.git

# SSH — dùng key tự động
git clone git@github.com:acme/repo.git
```

### Personal Access Token (PAT)

PAT dùng khi:
- CI script clone repo (Jenkins, GitHub Actions từ outside).
- Tool tự động (Renovate, Dependabot) cần API access.
- HTTPS push từ máy không có SSH key.

**Cách tạo**:
1. Settings → Developer settings → Personal access tokens → "Fine-grained tokens" (mới, recommend) hoặc "Tokens (classic)".
2. Đặt expiration **không quá 90 ngày** (security best practice).
3. Chọn scope tối thiểu cần thiết (vd chỉ `repo`).
4. Copy token NGAY — chỉ hiện 1 lần.
5. Lưu vào password manager hoặc Secret Manager (vd AWS Secrets Manager).

**Tuyệt đối không commit PAT vào git**. Có tool tự rotate nếu lỡ (GitHub auto-revoke nếu phát hiện trong public commit).

## 2. Docker Hub — registry cho container image

Sau khi build Docker image (section 27-28), bạn cần đẩy lên **registry** để server khác pull về chạy. Docker Hub là registry mặc định.

### Đăng ký

1. **hub.docker.com** → "Sign up".
2. Username — sẽ là namespace image của bạn (`username/myapp:v1`).
3. Email + password.
4. Bật MFA tương tự GitHub.

### Tier Free

- **Public repos**: không giới hạn.
- **Private repos**: 1 free, thêm phải trả.
- **Pull limit**: 200 pull/6h cho user free authenticated, 100 pull/6h cho anonymous. Server CI hay bị giới hạn này → cân nhắc trả phí hoặc dùng registry khác.

### Đối thủ

| Registry | Đặc điểm |
|---|---|
| **GitHub Container Registry (GHCR)** | Tích hợp GitHub, free cho public, có private |
| **AWS ECR** | Cùng AWS, integrate với EKS, IAM |
| **Google Artifact Registry (GAR)** | Cùng GCP |
| **Harbor** | Self-hosted, enterprise feature |
| **Quay.io** | Của Red Hat, security scan tích hợp |

Khoá này dùng Docker Hub (đơn giản nhất), section AWS sẽ chuyển sang ECR.

### Personal Access Token cho Docker Hub

Tương tự GitHub, không nên dùng password trong CI:

1. Docker Hub → Account Settings → "Security" → "New Access Token".
2. Đặt scope `Read & Write`.
3. Copy token, dùng trong `docker login`:

```bash
docker login -u <username>
# Password: <PAT, không phải password thật>
```

## 3. SonarCloud — static code analysis

**SonarCloud** scan code tìm:
- **Bug** — null pointer, off-by-one, unhandled exception.
- **Code smell** — code dài, complexity cao, duplicate.
- **Vulnerability** — SQL injection, XSS, hardcoded credential.
- **Test coverage** — % code có test.

Sản phẩm cùng dòng: **SonarQube** (self-host, free + paid) và **SonarCloud** (SaaS, free cho public repo). Khoá này dùng SonarCloud.

### Đăng ký

1. **sonarcloud.io** → "Sign up".
2. Chọn **GitHub** (đăng nhập qua GitHub OAuth → không cần password riêng).
3. Authorize SonarCloud.
4. Tạo organization (free) → import 1 repo để bắt đầu scan.

### Tích hợp với CI (section 17 sẽ làm)

```bash
mvn sonar:sonar \
  -Dsonar.projectKey=acme_payment-service \
  -Dsonar.organization=acme \
  -Dsonar.host.url=https://sonarcloud.io \
  -Dsonar.token=$SONAR_TOKEN
```

`SONAR_TOKEN` lưu trong Jenkins credentials, GitHub Secret, hoặc AWS Secrets Manager.

### Bonus: Quality Gate

SonarCloud có **Quality Gate** — pipeline fail nếu code mới không đạt chuẩn (vd coverage < 80%, có new bug). Đây là **shift-left** — bắt lỗi sớm trong pipeline thay vì để lên production.

## 4. Domain (tùy chọn) — tên miền cho production demo

Sau khi học AWS (section 14-15), bạn deploy app lên EC2/EKS. AWS sẽ cho bạn URL kiểu `ec2-3-45-67-89.compute.amazonaws.com` — xấu, dài, đổi mỗi lần restart.

Có **domain** giúp:
- URL đẹp: `payment.myinfo.xyz`.
- Cấu hình **HTTPS** (cần domain để Let's Encrypt / AWS ACM cấp cert).
- Demo CV real-life cho người tuyển dụng xem.

### Mua domain rẻ

| Provider | Giá .xyz/năm | Đặc điểm |
|---|---|---|
| **GoDaddy** | ~$2 (năm 1), ~$15 (renew) | Phổ biến nhất, UI dễ |
| **Namecheap** | ~$1-3 năm đầu | Rẻ, không upsell nhiều |
| **Porkbun** | ~$3 | Cộng đồng dev thích |
| **Cloudflare** | At-cost (~$8) | Không markup, kèm CDN free |
| **AWS Route 53** | ~$12 | Tích hợp AWS, dễ setup |

**Tip rẻ**:
- Chọn TLD lạ (`.xyz`, `.online`, `.tech`) → rẻ hơn `.com` nhiều.
- Tên domain không cần đẹp — đây là demo, không phải brand.
- Mua 1 năm thôi.

### Verification (cho SSL Certificate)

Sau khi mua, bạn sẽ cần thêm **DNS record** để verify ownership (bài 5 sẽ làm). Phổ biến nhất:
- **CNAME record**: trỏ subdomain đến giá trị do AWS / Let's Encrypt cấp.
- **TXT record**: chứa chuỗi random để chứng minh.

Đăng nhập panel của provider (GoDaddy) → DNS settings → Add Record. UI mỗi provider khác nhau nhưng concept như nhau.

## Tổng kết: trạng thái tài khoản cuối bài

Sau bài này bạn có:

```text
┌─────────────────────────────────────────────────┐
│ ✓ GitHub account + MFA + SSH key               │
│ ✓ Docker Hub account + MFA + PAT               │
│ ✓ SonarCloud account (OAuth qua GitHub)        │
│ ✓ (Tùy chọn) Domain trên GoDaddy/Cloudflare    │
└─────────────────────────────────────────────────┘
                       │
                       ▼
            Sẵn sàng cho AWS Setup
                (bài 4-5)
```

## Bảng so sánh ổ chứa code

| Provider | Cấu hình | Strength |
|---|---|---|
| **GitHub** | SaaS | Cộng đồng lớn, Actions tích hợp |
| **GitLab.com** | SaaS | Self-host miễn phí + CI mạnh |
| **Bitbucket** | SaaS | Tích hợp Jira/Confluence |
| **AWS CodeCommit** | SaaS (AWS) | Tích hợp AWS pipeline |
| **Gitea / Forgejo** | Self-host | Open-source, light |

## Bẫy bảo mật cần tránh

| Lỗi | Hậu quả | Cách tránh |
|---|---|---|
| Push file `.env` chứa AWS key | Bot scan public repo → bill $5000 trong 1 đêm | `.gitignore` `.env` ngay từ đầu |
| PAT có toàn quyền `admin:org` | 1 lần lộ = mất control toàn org | Fine-grained PAT, scope tối thiểu |
| Dùng SMS MFA | SIM swap attack | Dùng authenticator app |
| Tái dùng password GitHub + Gmail + bank | Pass dump 1 site → mất tất cả | Password manager + unique pass mỗi site |
| Token expired → đổi sang token toàn quyền tạm | Quên rotate | Set lịch rotate 90 ngày |
| Public repo có code internal | IP company lộ | Default private, public phải approve |

## Production: GitOps + Secrets Management

Trong môi trường thực sự, secrets không lưu thủ công mà dùng tool chuyên:

| Tool | Mục đích |
|---|---|
| **HashiCorp Vault** | Secret store đa cloud, audit, rotate auto |
| **AWS Secrets Manager** | Secret native AWS, integrate IAM |
| **GCP Secret Manager** | Tương đương cho GCP |
| **1Password Connect** | Team password manager + API |
| **Doppler** | SaaS multi-env config |
| **sealed-secrets** (K8s) | Encrypt secret commit vào git |

Bắt đầu với password manager cá nhân cũng được. Khi vào team production, sẽ chuyển sang một trong các tool trên.

## Tóm tắt bài 3

- **GitHub** + MFA + SSH key — đăng ký từ đầu đúng cách tiết kiệm thời gian sau.
- **Docker Hub** + MFA + PAT thay password trong `docker login`.
- **SonarCloud** OAuth qua GitHub, scan code chất lượng + bảo mật.
- **Domain** tùy chọn, mua TLD lạ (.xyz) rẻ.
- **Không bao giờ** commit secret vào git — dùng `.gitignore`, password manager, secret manager.

**Bài kế tiếp** → [Bài 4: AWS Free Tier — đăng ký, root user, IAM user, MFA bảo mật](04-aws-account-iam-mfa.md)

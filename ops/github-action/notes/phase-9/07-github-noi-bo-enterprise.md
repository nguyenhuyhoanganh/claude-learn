# Bài 7: GitHub Enterprise — Dùng GitHub trong Mạng Nội bộ

## GitHub Enterprise là gì?

Thay vì dùng `github.com` (public cloud), các tổ chức lớn có thể triển khai **GitHub Enterprise Server (GHES)** — một instance GitHub riêng chạy hoàn toàn trong hạ tầng nội bộ.

```
github.com  (public)          github.company.internal  (GHES — riêng)
───────────────────           ─────────────────────────────────────────
Ai cũng truy cập được         Chỉ truy cập được từ mạng nội bộ / VPN
Code lưu trên server GitHub   Code lưu trên server của công ty
Runners do GitHub quản lý     Runners phải tự host
```

Samsung, nhiều công ty tài chính, quân sự, chính phủ dùng GHES vì:
- **Compliance** — dữ liệu không rời khỏi hạ tầng công ty
- **Security** — không expose code ra internet
- **Control** — kiểm soát hoàn toàn version, uptime, policy

---

## Điểm khác biệt với github.com

### 1. URL thay đổi — nhưng cú pháp giống hệt

Workflow YAML viết giống 100%. Chỉ URL thay đổi:

| | GitHub.com | GHES |
|---|---|---|
| Web UI | `github.com` | `github.company.com` |
| API | `api.github.com` | `github.company.com/api/v3` |
| Actions checkout | `actions/checkout@v3` | (xem bên dưới) |
| Git clone | `github.com/org/repo.git` | `github.company.com/org/repo.git` |

### 2. Actions từ Marketplace không tự có

GHES không kết nối ra `github.com` để tải actions. Khi workflow dùng `actions/checkout@v3`, GHES phải tìm action đó **trong chính instance nội bộ**.

Có 3 cách xử lý (chọn một):

---

## Cách 1: GitHub Connect (Mirror tự động)

Nếu GHES được cấu hình **GitHub Connect**, admin có thể bật tính năng tự động mirror actions từ `github.com` về GHES. Người dùng dùng như bình thường:

```yaml
- uses: actions/checkout@v3      # ← admin đã mirror về GHES, dùng bình thường
```

**Yêu cầu:** GHES phải có kết nối ra internet (có kiểm soát). Admin bật cài đặt trong GHES Admin Console.

---

## Cách 2: Tự mirror actions vào GHES

Admin tạo organization `actions` trong GHES và mirror các actions cần dùng:

```bash
# Clone action từ github.com
git clone https://github.com/actions/checkout.git

# Push vào GHES internal
git remote add ghes https://github.company.com/actions/checkout.git
git push ghes --all --tags
```

Người dùng dùng bình thường vì GHES tìm `actions/checkout` → tìm repo `actions/checkout` trong instance nội bộ.

**Lưu ý:** Phải cập nhật thủ công khi actions có version mới.

---

## Cách 3: Dùng đường dẫn đầy đủ đến GHES

Khi action không mirror, chỉ định URL đầy đủ:

```yaml
- uses: github.company.com/my-team/my-action@v1
```

Phù hợp với **custom actions nội bộ** viết riêng cho công ty, không cần lấy từ Marketplace.

---

## Self-hosted Runners là bắt buộc với GHES

GHES không có GitHub-hosted runners. Mọi workflow phải chạy trên **self-hosted runners** do tự host.

### Cài đặt runner kết nối với GHES

```bash
# Trên máy sẽ chạy runner
mkdir actions-runner && cd actions-runner

# Tải runner binary từ GHES (không phải github.com)
curl -o actions-runner.tar.gz \
  https://github.company.com/actions/runner/releases/download/v2.x.x/actions-runner-linux-x64-2.x.x.tar.gz

tar xzf actions-runner.tar.gz

# Đăng ký runner với GHES (không phải github.com)
./config.sh \
  --url https://github.company.com/my-org/my-repo \
  --token <TOKEN_FROM_GHES_UI>

# Chạy runner
./run.sh
# hoặc cài thành service
sudo ./svc.sh install && sudo ./svc.sh start
```

Token lấy từ: **Repository Settings → Actions → Runners → New self-hosted runner** trong GHES UI.

---

## Workflow trên GHES — Ví dụ thực tế

```yaml
name: Internal CI/CD

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: self-hosted           # ← bắt buộc với GHES
    steps:
      # Checkout từ GHES (không phải github.com)
      - uses: actions/checkout@v3  # ← hoạt động nếu đã mirror

      # Hoặc dùng action nội bộ công ty
      - uses: github.company.com/platform-team/setup-internal-tools@v2

      - run: npm ci
      - run: npm test
      - run: npm run build

      # Deploy đến server nội bộ (runner đã có quyền vì cùng mạng)
      - name: Deploy
        run: |
          rsync -avz dist/ deploy@app-server.internal:/srv/myapp/
          ssh deploy@app-server.internal "systemctl restart myapp"
```

---

## GHES API — Gọi từ Workflow

`GITHUB_TOKEN` trên GHES hoạt động giống github.com nhưng endpoint API khác:

```yaml
steps:
  - name: Create issue via API
    env:
      GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    run: |
      curl -X POST \
        -H "Authorization: Bearer $GH_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{"title":"Deploy failed","body":"See run ${{ github.run_id }}"}' \
        "https://github.company.com/api/v3/repos/${{ github.repository }}/issues"
        # ↑ khác github.com — thêm /api/v3
```

Hoặc dùng `gh` CLI (GitHub CLI hỗ trợ GHES):

```yaml
- name: Use gh CLI with GHES
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GH_HOST: github.company.com      # ← chỉ định GHES host
  run: |
    gh issue create --title "Deploy done" --body "SHA: ${{ github.sha }}"
```

---

## Runner Groups — Phân quyền Runners

GHES và GitHub.com Enterprise đều hỗ trợ **Runner Groups** — phân nhóm runners theo quyền truy cập:

```
Runner Group: production-runners
  ├── Chỉ các repo trong org "payment-team" được dùng
  ├── runner-prod-1 (10.0.1.20)
  └── runner-prod-2 (10.0.1.21)

Runner Group: dev-runners
  ├── Tất cả repos trong org được dùng
  ├── runner-dev-1 (10.0.2.10)
  └── runner-dev-2 (10.0.2.11)
```

Workflow chỉ định runner group:

```yaml
jobs:
  deploy-prod:
    runs-on: [self-hosted, production]    # ← label của runner group
```

Runners có nhiều labels, workflow dùng list labels để chọn đúng runner.

---

## Labels trên Runners — Routing linh hoạt

Khi đăng ký runner, thêm labels mô tả capability:

```bash
./config.sh \
  --url https://github.company.com/my-org \
  --token TOKEN \
  --labels "self-hosted,linux,x64,gpu,seoul-dc"
```

Workflow routing:

```yaml
jobs:
  ml-training:
    runs-on: [self-hosted, gpu]          # ← chạy trên runner có GPU

  frontend-build:
    runs-on: [self-hosted, linux, x64]   # ← bất kỳ linux runner nào

  seoul-deploy:
    runs-on: [self-hosted, seoul-dc]     # ← chỉ runner ở Seoul DC
```

---

## Kết hợp GHES + nhiều cụm máy chủ

Sơ đồ tổng thể môi trường enterprise điển hình:

```
MẠNG NỘI BỘ CÔNG TY
─────────────────────────────────────────────────────────────
  GHES Server                    Runners
  github.company.com             ├── runner-group: dev
  │                              │     runner-dev-1, runner-dev-2
  │   Push/PR event              │
  └──────────────────────────────┤── runner-group: staging
            (HTTPS nội bộ)       │     runner-stg-1, runner-stg-2
                                 │
                                 └── runner-group: production
                                       runner-prod-1 ... runner-prod-5
                                       │
                                       └──SSH──► App Servers
                                                  node-1 ... node-10
─────────────────────────────────────────────────────────────
```

Không có gì rời khỏi mạng nội bộ — code, runners, servers đều nằm trong.

---

## Reusable Actions nội bộ — Thư viện Actions chung

Tạo repository nội bộ chứa các actions dùng chung:

```
github.company.com/
  platform-team/
    actions/                       ← repo chứa actions
      setup-java-internal/
        action.yml                 ← cài Java từ artifactory nội bộ
      deploy-k8s/
        action.yml                 ← deploy lên Kubernetes nội bộ
      notify-slack-internal/
        action.yml                 ← gửi notification qua Slack nội bộ
```

Dùng trong workflow:

```yaml
steps:
  - uses: github.company.com/platform-team/actions/setup-java-internal@v1
  
  - uses: github.company.com/platform-team/actions/deploy-k8s@v2
    with:
      cluster: production
      namespace: payment-service
      image: registry.company.com/myapp:${{ github.sha }}
```

---

## Lưu ý khi chuyển từ github.com sang GHES

| Điểm cần kiểm tra | Hành động |
|---|---|
| `uses: actions/xxx@v3` | Đảm bảo actions đã được mirror vào GHES |
| API calls đến `api.github.com` | Đổi thành `github.company.com/api/v3` |
| `gh` CLI commands | Thêm `GH_HOST: github.company.com` |
| Docker images trong workflow | Đổi sang internal registry nếu không có internet |
| npm/pip packages | Trỏ vào Artifactory/Nexus nội bộ nếu runner không có internet |
| Secrets | Tạo lại trong GHES — secrets không di chuyển được |

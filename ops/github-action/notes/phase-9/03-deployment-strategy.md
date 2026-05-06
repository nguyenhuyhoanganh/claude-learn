# Bài 3: Deployment Strategy — Quản lý nhiều môi trường

## Pattern chuẩn: Dev → Staging → Production

```
push to any branch   → deploy to dev (preview)
merge to main        → deploy to staging (auto)
manual approve       → deploy to production
```

---

## Implement với Environments và Protection Rules

```yaml
name: Full Pipeline

on:
  push:
    branches: [main, 'feature/**']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci && npm test

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci && npm run build
      - uses: actions/upload-artifact@v3
        with:
          name: dist
          path: dist

  deploy-staging:
    needs: build
    if: github.ref == 'refs/heads/main'     # ← chỉ deploy staging từ main
    runs-on: ubuntu-latest
    environment: staging                     # ← environment secrets + protection rules
    steps:
      - uses: actions/download-artifact@v3
        with: { name: dist }
      - run: echo "Deploy to staging..."

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production                  # ← production có required reviewers
    steps:                                   #   → workflow dừng chờ approve
      - uses: actions/download-artifact@v3
        with: { name: dist }
      - run: echo "Deploy to production..."
```

Thiết lập trong **Settings → Environments → production**:
- Thêm **Required reviewers** → workflow dừng tại `deploy-production`, chờ người được chỉ định approve

---

## Phân biệt deploy theo branch

Dùng expression để quyết định deploy đến đâu:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Determine target
        id: target
        run: |
          if [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
            echo "env=production" >> $GITHUB_OUTPUT
            echo "url=https://myapp.com" >> $GITHUB_OUTPUT
          elif [[ "${{ github.ref }}" == "refs/heads/staging" ]]; then
            echo "env=staging" >> $GITHUB_OUTPUT
            echo "url=https://staging.myapp.com" >> $GITHUB_OUTPUT
          else
            echo "env=preview" >> $GITHUB_OUTPUT
            echo "url=https://pr-${{ github.event.pull_request.number }}.preview.myapp.com" >> $GITHUB_OUTPUT
          fi

      - name: Deploy
        run: echo "Deploying to ${{ steps.target.outputs.url }}"
```

---

## Rollback — Deploy lại version cũ

Khi production có vấn đề, cần rollback nhanh. Cách phổ biến:

### Dùng `workflow_dispatch` với input

```yaml
on:
  workflow_dispatch:
    inputs:
      version:
        description: Version to deploy (git tag or commit SHA)
        required: true
        type: string

jobs:
  rollback:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
        with:
          ref: ${{ inputs.version }}    # ← checkout đúng version
      - run: npm ci && npm run build
      - run: ./deploy.sh
```

Vào Actions → Run workflow → nhập version cần rollback.

---

## Deployment Status trong GitHub

Dùng **Deployments** API để GitHub UI hiển thị trạng thái deploy cho từng môi trường:

```yaml
- name: Create deployment
  uses: actions/github-script@v6
  with:
    script: |
      await github.rest.repos.createDeployment({
        owner: context.repo.owner,
        repo: context.repo.repo,
        ref: context.sha,
        environment: 'production',
        auto_merge: false,
        required_contexts: []
      });
```

Kết quả: repository sẽ hiển thị "Environments" section với trạng thái latest deployment cho từng môi trường.

---

## Vấn đề: Artifact hết hạn giữa pipeline

Mặc định artifact tồn tại 90 ngày. Nếu pipeline chạy lâu hoặc cần deploy lại từ artifact cũ, cần tăng retention hoặc đổi chiến lược:

```yaml
- uses: actions/upload-artifact@v3
  with:
    name: dist
    path: dist
    retention-days: 7         # ← tùy chỉnh (1-90 ngày)
```

Hoặc lưu artifact vào nơi bền vững hơn (S3, Container Registry) thay vì GitHub Artifacts.

---

**Tiếp theo:** Monorepo Strategy — Chỉ chạy job liên quan khi file thay đổi →

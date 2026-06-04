# Bài 4: CI/CD cho Terraform, Atlantis, security scan, best practices

Bài cuối của phase 21. Tổng hợp **Terraform workflow ở production**: hiển thị plan trên PR, security scan, drift detection (phát hiện thay đổi ngoài Terraform), workflow cho team lớn.

## CI workflow cơ bản

File `.github/workflows/terraform.yml`:

```yaml
name: Terraform

on:
  push:
    branches: [main]
    paths: ['environments/**', 'modules/**']
  pull_request:
    branches: [main]
    paths: ['environments/**', 'modules/**']

permissions:
  contents: read
  pull-requests: write
  id-token: write

env:
  TF_VERSION: '1.6.6'

jobs:
  validate:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        env: [dev, staging, production]
    defaults:
      run:
        working-directory: environments/${{ matrix.env }}
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Format check
        run: terraform fmt -check -recursive

      - name: Init
        run: terraform init -backend=false

      - name: Validate
        run: terraform validate

      - name: tflint
        uses: terraform-linters/setup-tflint@v4
      - run: tflint --init && tflint -f compact

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Checkov scan
        uses: bridgecrewio/checkov-action@master
        with:
          directory: environments/
          framework: terraform
          output_format: sarif
          output_file_path: checkov-results.sarif

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: checkov-results.sarif

      - name: tfsec
        uses: aquasecurity/tfsec-action@v1.0.3
        with:
          working_directory: environments/

  plan:
    runs-on: ubuntu-latest
    needs: [validate, security]
    if: github.event_name == 'pull_request'
    strategy:
      matrix:
        env: [dev, staging]
    defaults:
      run:
        working-directory: environments/${{ matrix.env }}
    environment:
      name: ${{ matrix.env }}
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}
          terraform_wrapper: false

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - name: Init
        run: terraform init

      - name: Plan
        id: plan
        run: |
          set -o pipefail
          terraform plan -no-color -input=false -out=tfplan 2>&1 | tee plan.txt

      - name: Cost estimate
        run: infracost diff --path . --terraform-plan-path tfplan
        env:
          INFRACOST_API_KEY: ${{ secrets.INFRACOST_API_KEY }}

      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('environments/${{ matrix.env }}/plan.txt', 'utf8').slice(0, 60000);

            const body = `### Terraform Plan: ${{ matrix.env }}

<details>
<summary>Plan output</summary>

\`\`\`hcl
${plan}
\`\`\`

</details>`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });

      - uses: actions/upload-artifact@v4
        with:
          name: tfplan-${{ matrix.env }}
          path: environments/${{ matrix.env }}/tfplan
          retention-days: 7

  apply:
    runs-on: ubuntu-latest
    needs: [validate, security]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    strategy:
      matrix:
        env: [dev, staging]
      max-parallel: 1
    defaults:
      run:
        working-directory: environments/${{ matrix.env }}
    environment:
      name: ${{ matrix.env }}-apply
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - run: terraform init
      - run: terraform apply -auto-approve -input=false

  apply-production:
    runs-on: ubuntu-latest
    needs: [apply]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    defaults:
      run:
        working-directory: environments/production
    environment:
      name: production-apply
      url: https://vprofile.acme.com
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN_PROD }}
          aws-region: us-east-1

      - run: terraform init
      - run: terraform apply -auto-approve -input=false
```

`environment: production-apply` → bắt buộc reviewer approve trên GitHub UI trước khi job chạy.

## Atlantis — Workflow tích hợp ngay trong PR

Atlantis = service lắng nghe webhook từ GitHub, chạy Terraform thông qua các comment trên PR.

### Setup

```bash
# Chạy Atlantis trên EC2 hoặc K8s
docker run -d --name atlantis \
    -p 4141:4141 \
    -e ATLANTIS_GH_USER=acme-bot \
    -e ATLANTIS_GH_TOKEN=$GH_TOKEN \
    -e ATLANTIS_GH_WEBHOOK_SECRET=$WEBHOOK_SECRET \
    -e ATLANTIS_REPO_ALLOWLIST="github.com/acme/*" \
    -e AWS_ACCESS_KEY_ID=... \
    -e AWS_SECRET_ACCESS_KEY=... \
    runatlantis/atlantis:latest
```

### Workflow Atlantis (luồng hoạt động)

1. Dev tạo PR thay đổi Terraform code.
2. Atlantis tự động comment kết quả `atlantis plan` lên PR.
3. Reviewer xem plan, comment review.
4. Dev gõ `atlantis apply` → Atlantis chạy apply.
5. Log apply được post ngược lại lên PR.

→ Toàn bộ workflow Terraform diễn ra ngay trong giao diện PR — không cần CI riêng.

File `atlantis.yaml` cấu hình project:

```yaml
version: 3
projects:
  - name: vprofile-dev
    dir: environments/dev
    workspace: default
    autoplan:
      when_modified: ["*.tf", "../../modules/**/*.tf"]
      enabled: true
    apply_requirements: [approved, mergeable]

  - name: vprofile-prod
    dir: environments/production
    apply_requirements: [approved, mergeable, undiverged]
    workflow: production
```

Custom workflow:

```yaml
workflows:
  production:
    plan:
      steps:
        - init
        - plan
    apply:
      steps:
        - apply
        - run: ./post-apply.sh
```

## Security scan tools (Công cụ quét bảo mật)

### Checkov

```bash
pip install checkov
checkov -d . --framework terraform
```

Kiểm tra 200+ rule, bao gồm:
- S3 bucket có public access.
- RDS không có encryption.
- Security group mở quá rộng (vd: 0.0.0.0/0 cho mọi port).
- IAM policy quá permissive (cấp quyền quá rộng).

### tfsec

```bash
brew install tfsec
tfsec .
```

Lightweight, viết bằng Go, các check tương tự Checkov.

### Terrascan

```bash
brew install terrascan
terrascan scan -t aws
```

### Snyk IaC

Commercial product (tính phí), tích hợp với Snyk dashboard cho enterprise.

## Cost estimation (Ước tính chi phí)

### Infracost — Tính chi phí trước khi apply

```bash
brew install infracost
infracost auth login

# Static analysis (không cần gọi AWS API)
infracost breakdown --path .

# Với plan file (chính xác hơn)
terraform plan -out=plan.tfplan
infracost diff --path . --terraform-plan-path plan.tfplan
```

Comment chi phí thay đổi lên PR — reviewer thấy ngay PR này tốn thêm bao nhiêu tiền:

```yaml
- name: Infracost
  uses: infracost/actions/setup@v3
  with:
    api-key: ${{ secrets.INFRACOST_API_KEY }}

- run: |
    infracost breakdown --path environments/production \
        --format json --out-file infracost-base.json

- uses: infracost/actions/comment@v3
  with:
    path: infracost-base.json
```

PR sẽ hiện:

```text
+-----+---+-------+
| Service | Monthly |
+-----+---+-------+
| RDS     | +$50    |
| EC2     | +$20    |
| Total   | +$70    |
+-----+---+-------+
```

→ Cost discussion trở thành phần của code review.

## Policy as Code (Chính sách dưới dạng code)

### OPA (Open Policy Agent)

Viết policy bằng ngôn ngữ Rego:

```rego
# policies/no-public-s3.rego
package terraform

deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket"
    resource.change.after.acl == "public-read"
    msg := sprintf("S3 bucket %s must not be public-read", [resource.address])
}
```

Chạy bằng conftest:

```bash
terraform show -json plan.tfplan > plan.json
conftest test plan.json --policy policies/
```

### Sentinel (Terraform Cloud Enterprise)

Ngôn ngữ policy của HashiCorp. Chỉ có trong bản SaaS (Terraform Cloud Enterprise).

### Checkov custom check

Viết check tuỳ chỉnh bằng Python:

```python
# checks/no_public_s3.py
from checkov.terraform.checks.resource.base_resource_check import BaseResourceCheck
from checkov.common.models.enums import CheckCategories, CheckResult

class NoPublicS3(BaseResourceCheck):
    def __init__(self):
        super().__init__(
            name="S3 bucket must not be public",
            id="CUSTOM_001",
            categories=[CheckCategories.GENERAL_SECURITY],
            supported_resources=["aws_s3_bucket_acl"]
        )

    def scan_resource_conf(self, conf):
        acl = conf.get("acl", [None])[0]
        if acl in ["public-read", "public-read-write"]:
            return CheckResult.FAILED
        return CheckResult.PASSED
```

## Drift detection (Phát hiện thay đổi ngoài Terraform)

Khi có người sửa infrastructure thủ công qua AWS Console — Terraform state sẽ lệch (drift). Cần detect tự động:

Schedule chạy hàng ngày:

```yaml
on:
  schedule:
    - cron: '0 6 * * *'

jobs:
  drift:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        env: [production]
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - run: terraform init
        working-directory: environments/${{ matrix.env }}

      - id: plan
        run: terraform plan -detailed-exitcode -no-color
        working-directory: environments/${{ matrix.env }}
        continue-on-error: true

      - if: steps.plan.outputs.exitcode == '2'
        uses: slackapi/slack-github-action@v1
        with:
          channel-id: '#alerts'
          payload: |
            {
              "text": "⚠️ Terraform drift detected in ${{ matrix.env }}",
              "blocks": [...]
            }
        env:
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

Khi `terraform plan` exit code 2 = có thay đổi cần apply → drift đã xảy ra → gửi alert lên Slack → team điều tra ai đã thay đổi thủ công.

## Best practices tổng kết

### Code organization (Tổ chức code)

- 1 module cho mỗi component logic (vpc, ecs, rds).
- 1 directory cho mỗi environment (dev, staging, prod).
- Shared state lưu remote (S3 + DynamoDB lock).
- Pin (cố định) version mọi thứ: module, provider, Terraform.

### Workflow

- PR bắt buộc khi merge vào main.
- Plan output hiển thị ngay trong PR.
- Approve bắt buộc cho production.
- Atlantis hoặc CI auto-plan.
- Drift detection chạy hàng ngày.

### Security

- Checkov / tfsec / Terrascan tích hợp trong CI.
- Policy as Code (OPA / Sentinel).
- Không bao giờ hardcode secret trong HCL (dùng Secrets Manager + data source).
- Least privilege IAM cho CI service account.
- OIDC thay vì static credential (bài 1 phase 25).

### Testing

- Module unit test (Terratest).
- Plan như một PR check bắt buộc.
- Cost diff hiển thị (Infracost).
- Manual smoke test sau khi apply.

### Operational

- Backup state (bật S3 versioning).
- Audit log (CloudTrail).
- Monitor cost (AWS Budgets + Cost Explorer).
- Document mọi thứ — README cho mỗi module.

## Tổng kết phase 21

4 bài cover:
1. Terraform basics + workflow.
2. State + backend + workspaces.
3. Modules + composition + Terratest.
4. CI/CD + Atlantis + security + cost.

Skill đạt được:
- IaC production-grade với Terraform.
- Quản lý multi-environment.
- Module versioning + sharing.
- PR-based workflow.
- Drift detection + tối ưu chi phí.

## Tóm tắt bài 4

- **CI hiển thị plan trên PR** = bắt buộc.
- **Atlantis** = automation Terraform native trong PR.
- **Checkov + tfsec + Terrascan** security scan.
- **Infracost** hiển thị cost diff trong PR comment.
- **OPA / Sentinel** policy as code.
- **Drift detection** chạy theo lịch + alert Slack.
- **OIDC** assume AWS role thay cho static credential.
- Best practices: pin version, tách environment, dùng secret manager, audit log đầy đủ.

**Phase kế tiếp** → [Phase 22 — Ansible](../phase-22-ansible/01-ansible-basics.md)

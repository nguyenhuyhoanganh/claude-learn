# Bài 4: CI/CD cho Terraform, Atlantis, security scan, best practices

Bài cuối phase 21. Tổng hợp **Terraform production workflow**: PR plan visible, security scan, drift detection, scale team.

## CI workflow cơ bản

`.github/workflows/terraform.yml`:

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

`environment: production-apply` → require reviewer approve trên GitHub UI.

## Atlantis — PR-native workflow

Atlantis = service listen GitHub webhook, run Terraform với PR commands.

### Setup

```bash
# Run Atlantis trên EC2 hoặc K8s
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

### Workflow

1. Dev tạo PR đổi Terraform code.
2. Atlantis auto-comment `atlantis plan` output.
3. Reviewer thấy plan, comment.
4. Dev `atlantis apply` → Atlantis run apply.
5. Apply log post lại PR.

`atlantis.yaml`:

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

## Security scan tools

### Checkov

```bash
pip install checkov
checkov -d . --framework terraform
```

Check 200+ rules:
- S3 bucket public.
- RDS not encrypted.
- Security group too open.
- IAM policy too permissive.

### tfsec

```bash
brew install tfsec
tfsec .
```

Lightweight, Go binary, similar checks.

### Terrascan

```bash
brew install terrascan
terrascan scan -t aws
```

### Snyk IaC

Commercial, integrate Snyk dashboard.

## Cost estimation

### Infracost

```bash
brew install infracost
infracost auth login

# Static analysis (no AWS API call)
infracost breakdown --path .

# With plan
terraform plan -out=plan.tfplan
infracost diff --path . --terraform-plan-path plan.tfplan
```

PR comment với cost change:

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

PR shows:

```text
+-----+---+-------+
| Service | Monthly |
+-----+---+-------+
| RDS     | +$50    |
| EC2     | +$20    |
| Total   | +$70    |
+-----+---+-------+
```

## Policy as Code

### OPA (Open Policy Agent)

Write policy in Rego:

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

Run với conftest:

```bash
terraform show -json plan.tfplan > plan.json
conftest test plan.json --policy policies/
```

### Sentinel (Terraform Cloud Enterprise)

HashiCorp's policy language. SaaS feature.

### Checkov custom check

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

## Drift detection

Schedule daily:

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

Drift → Slack alert → investigate manual change.

## Best practices summary

### Code organization

- Module per logical component (vpc, ecs, rds).
- Environment per directory (dev, staging, prod).
- Shared state remote (S3 + DynamoDB lock).
- Pin version everything (module, provider, Terraform).

### Workflow

- PR mandatory cho main.
- Plan visible PR.
- Approve required for prod.
- Atlantis hoặc CI auto-plan.
- Drift detection daily.

### Security

- Checkov / tfsec / Terrascan in CI.
- Policy as Code (OPA / Sentinel).
- No secret in HCL (Secrets Manager + data source).
- Least privilege IAM for CI.
- OIDC instead of static credentials.

### Testing

- Module unit tests (Terratest).
- Plan as PR check.
- Cost diff visible (Infracost).
- Manual smoke test post-apply.

### Operational

- Backup state (S3 versioning).
- Audit log (CloudTrail).
- Monitor cost (AWS Budgets).
- Document everything.

## Tổng kết phase 21

4 bài cover:
1. Terraform basics + workflow.
2. State + backend + workspaces.
3. Modules + composition + Terratest.
4. CI/CD + Atlantis + security + cost.

Skills:
- Production-grade IaC với Terraform.
- Multi-environment management.
- Module versioning + sharing.
- PR-based workflow.
- Drift detection + cost optimization.

## Tóm tắt bài 4

- **CI plan visible PR** = mandatory.
- **Atlantis** = native Terraform PR automation.
- **Checkov + tfsec + Terrascan** security scan.
- **Infracost** cost diff PR comment.
- **OPA / Sentinel** policy as code.
- **Drift detection** scheduled + Slack alert.
- **OIDC** AWS role assume thay static credential.
- Best practices: pin version, environment separation, secret manager, audit log.

**Phase kế tiếp** → [Phase 22 — Ansible](../phase-22-ansible/01-ansible-basics.md)

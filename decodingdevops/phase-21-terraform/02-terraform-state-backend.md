# Bài 2: Terraform state, backend, locking, workspaces

State = nơi Terraform track resource đã tạo. **Quản state đúng** = production-grade IaC. Sai → conflict, mất data, security leak.

## State file — bên trong

```json
{
  "version": 4,
  "terraform_version": "1.6.0",
  "serial": 42,
  "lineage": "abc123-def456",
  "outputs": {
    "alb_dns": {
      "value": "vprofile-alb-xxx.elb.amazonaws.com",
      "type": "string"
    }
  },
  "resources": [
    {
      "mode": "managed",
      "type": "aws_instance",
      "name": "web",
      "provider": "provider[\"registry.terraform.io/hashicorp/aws\"]",
      "instances": [{
        "schema_version": 1,
        "attributes": {
          "id": "i-xxx",
          "ami": "ami-xxx",
          "private_ip": "10.0.1.5",
          ...
        }
      }]
    }
  ]
}
```

State chứa:
- Mapping config → real resource.
- Metadata (version, dependencies).
- **Có thể chứa secret** (RDS password, private key).

## Local state — dev only

```bash
terraform init
# Tạo terraform.tfstate + terraform.tfstate.backup local
```

Vấn đề local state:
- **Không share** giữa team.
- Mất laptop → mất state → infrastructure orphan.
- Conflict khi 2 dev apply cùng lúc.
- Commit Git → expose secret.

**Production = remote backend mandatory**.

## Remote backend — S3 + DynamoDB

### S3 bucket

```hcl
resource "aws_s3_bucket" "tf_state" {
  bucket = "acme-tf-state-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "Terraform State"
    Environment = "shared"
  }
}

# Versioning
resource "aws_s3_bucket_versioning" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "tf_state" {
  bucket = aws_s3_bucket.tf_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public
resource "aws_s3_bucket_public_access_block" "tf_state" {
  bucket                  = aws_s3_bucket.tf_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

### DynamoDB cho lock

```hcl
resource "aws_dynamodb_table" "tf_locks" {
  name         = "terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}
```

### Configure backend

```hcl
terraform {
  backend "s3" {
    bucket         = "acme-tf-state-123456789"
    key            = "vprofile/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}
```

```bash
terraform init
# Initializing the backend...
# Successfully configured the backend "s3"
```

Mỗi `apply` Terraform:
1. Lock DynamoDB.
2. Read state S3.
3. Plan + apply.
4. Write state S3.
5. Unlock.

2 dev `apply` cùng lúc → 1 block lock, đợi xong mới đến lượt.

## Backend cho team — partial config

Hard-code backend → mỗi env cần file riêng. Use partial:

```hcl
# main.tf
terraform {
  backend "s3" {}        # Empty, fill via init
}
```

```bash
# Dev
terraform init -backend-config="bucket=acme-tf-dev" \
               -backend-config="key=vprofile/dev/terraform.tfstate" \
               -backend-config="region=us-east-1"

# Prod
terraform init -backend-config="backend-prod.hcl"
```

`backend-prod.hcl`:
```hcl
bucket = "acme-tf-prod"
key    = "vprofile/prod/terraform.tfstate"
region = "us-east-1"
```

## Workspaces — multi-environment

```bash
# List
terraform workspace list

# Create
terraform workspace new dev
terraform workspace new staging
terraform workspace new production

# Switch
terraform workspace select production
```

Mỗi workspace → state file riêng (cùng backend, key prefix khác).

```hcl
resource "aws_instance" "web" {
  count = terraform.workspace == "production" ? 3 : 1
  # ...
}
```

> Workspace dùng cho **environments tương đối giống nhau**. Khác hoàn toàn → separate state file (recommend).

## State operations

### Inspect state

```bash
# List resource trong state
terraform state list

# Show 1 resource
terraform state show aws_instance.web

# Pull state ra JSON
terraform state pull > current-state.json
```

### Move resource

Refactor code → rename resource. Terraform sẽ destroy + create thay vì rename:

```bash
# Old name → new name (preserve resource)
terraform state mv aws_instance.web aws_instance.app_server
```

### Remove from state (không destroy)

```bash
# Stop manage resource (still exists in cloud)
terraform state rm aws_instance.web
```

Use case: migrate resource sang module hoặc state file khác.

### Import existing resource

```bash
# Existing AWS resource → bring under Terraform
terraform import aws_instance.web i-xxxxx
```

Sau import, write HCL match → `terraform plan` clean.

### Replace resource

```bash
# Force destroy + recreate
terraform apply -replace="aws_instance.web"
```

## Sensitive data trong state

State chứa **mọi attribute** → password, key. **State file = secret**.

Protection:
- S3 bucket private + encryption + versioning.
- DynamoDB lock.
- IAM policy strict on bucket.
- Don't commit `*.tfstate` (`.gitignore`).

```text
# .gitignore
*.tfstate
*.tfstate.*
.terraform/
.terraform.lock.hcl   # Optional commit
*.auto.tfvars
terraform.tfvars      # If contains secret
```

### Read state pattern

```hcl
# Read state output từ project khác
data "terraform_remote_state" "vpc" {
  backend = "s3"
  config = {
    bucket = "acme-tf-prod"
    key    = "network/vpc/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_instance" "web" {
  subnet_id = data.terraform_remote_state.vpc.outputs.public_subnet_ids[0]
}
```

Project A export output. Project B read state để dùng. Pattern modular IaC.

### Encrypt secret trong state

Resource sensitive output → mark sensitive:

```hcl
output "db_password" {
  value     = aws_db_instance.main.password
  sensitive = true        # Hide trong plan/apply output
}
```

> Sensitive chỉ hide output display, **không encrypt** trong state file. State vẫn plain.

Production: store secret trong AWS Secrets Manager, reference qua data source:

```hcl
data "aws_secretsmanager_secret_version" "db_pass" {
  secret_id = "prod/db/password"
}

resource "aws_db_instance" "main" {
  password = data.aws_secretsmanager_secret_version.db_pass.secret_string
}
```

Secret value vào state nhưng marked sensitive.

## Drift detection

State expected vs real cloud — drift xảy ra khi:
- Manual change console.
- Auto-scaling event.
- Lambda modify.

```bash
# Show drift
terraform plan

# Output:
# aws_instance.web has changed
#   ~ instance_type = "t3.small" → "t3.large"
```

`terraform plan -detailed-exitcode`:
- 0 = no change.
- 1 = error.
- 2 = drift detected.

CI: schedule daily `plan` → alarm nếu drift.

```yaml
# Schedule drift detection
- cron: '0 6 * * *'
- run: terraform plan -detailed-exitcode
- if: failure()
  run: send-slack-alert.sh
```

## State backup + recovery

S3 versioning bật → mỗi state save = new version. Rollback:

```bash
# List versions
aws s3api list-object-versions \
    --bucket acme-tf-prod \
    --prefix vprofile/terraform.tfstate

# Download specific version
aws s3api get-object \
    --bucket acme-tf-prod \
    --key vprofile/terraform.tfstate \
    --version-id xxx \
    state-backup.tfstate

# Push back
terraform state push state-backup.tfstate
```

Disaster recovery: state corrupt → restore previous version.

## Pull state into PR

```yaml
# CI: comment plan vào PR
- name: Plan
  run: terraform plan -no-color -out=plan.tfplan
- name: Comment PR
  uses: actions/github-script@v7
  with:
    script: |
      const plan = require('fs').readFileSync('plan.txt', 'utf8');
      github.rest.issues.createComment({
        issue_number: context.issue.number,
        owner: context.repo.owner,
        repo: context.repo.repo,
        body: `### Terraform Plan\n\`\`\`\n${plan}\n\`\`\``
      });
```

Reviewer see plan trong PR → review trước approve merge.

## Atlantis — PR automation

```bash
# Atlantis listens GitHub webhook
# PR comment: atlantis plan → CI run plan
# PR comment: atlantis apply → run apply
# Plan output visible in PR
```

Self-host Atlantis or use Terraform Cloud.

## Terraform Cloud / Enterprise

HashiCorp SaaS:
- Hosted state.
- Run plan/apply trong cloud.
- Policy as Code (Sentinel).
- Cost estimation.
- Private module registry.
- Free tier: < 500 resources.

Hoặc self-host enterprise version.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Local state team dùng | Conflict | S3 backend mandatory |
| State commit Git | Secret expose | `.gitignore` + remote backend |
| No DynamoDB lock | 2 apply race condition | Always lock table |
| Manual edit state | Corrupt | Use `terraform state` commands |
| Workspace cho prod | State mix risk | Separate state file per env |
| State migration broken | Stuck | Backup before migration |
| Sensitive in state | Lộ | Encrypt bucket + IAM strict |

## Tóm tắt bài 2

- **State file** = mapping config → real resource + secret.
- **Local state** dev only; **S3 + DynamoDB** production backend mandatory.
- **Versioning S3** + encryption + private bucket cho state.
- **DynamoDB lock** prevent concurrent apply.
- **Workspaces** for similar env, **separate state file** for different env.
- `terraform state mv/rm/import` cho refactor.
- **Drift detection** = scheduled plan.
- **Atlantis / Terraform Cloud** automate PR workflow.

**Bài kế tiếp** → [Bài 3: Modules - reusable infrastructure components](03-terraform-modules.md)

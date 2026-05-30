# Bài 1: Terraform — Infrastructure as Code (IaC)

Click chuột tạo 50 EC2 = lãng phí thời gian + không reproducible. **Terraform** = code mô tả infra, apply tạo resource. Standard ngành cho multi-cloud IaC.

## IaC là gì?

> **Infrastructure as Code** = mô tả infra (server, network, DB) trong **file text**, version control, apply tự động.

Giống application code:
- Commit Git.
- Code review.
- CI/CD test/apply.
- Rollback bằng git revert.

Tool:
- **Terraform** (HashiCorp) — multi-cloud, market leader.
- **OpenTofu** — fork Terraform sau khi HashiCorp đổi license 2023.
- **Pulumi** — code thật (TS/Python) thay HCL.
- **AWS CloudFormation** — chỉ AWS, JSON/YAML.
- **Azure Bicep** — chỉ Azure.
- **GCP Deployment Manager** — chỉ GCP.

Khoá này dùng **Terraform** (hoặc OpenTofu — cú pháp giống).

## Setup Terraform

```bash
# Linux
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# macOS
brew install terraform

# Windows
choco install terraform -y

# Verify
terraform version
```

OpenTofu alternative:

```bash
brew install opentofu
# Hoặc:
curl -fsSL https://get.opentofu.org/install-opentofu.sh | sudo bash -s -- --install-method standalone
tofu version
```

## HCL — HashiCorp Configuration Language

```hcl
# main.tf
provider "aws" {
  region = "us-east-1"
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"

  tags = {
    Name = "web-server"
  }
}
```

Cú pháp:
- **Block**: `type "label1" "label2" { ... }`.
- **Argument**: `key = value`.
- **Comment**: `#`, `//`, `/* ... */`.

## Workflow 5 lệnh

```bash
# 1. Init — download provider
terraform init

# 2. Format
terraform fmt

# 3. Validate
terraform validate

# 4. Plan — preview thay đổi
terraform plan

# 5. Apply — thực thi
terraform apply

# Destroy
terraform destroy
```

`plan` luôn chạy trước `apply` — preview để tránh surprise.

## Providers

Provider = "plugin" cho mỗi platform.

```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.20"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

provider "kubernetes" {
  config_path = "~/.kube/config"
}
```

Providers nổi tiếng: aws, azurerm, google, kubernetes, helm, github, datadog, cloudflare, ...

## Resources

```hcl
resource "aws_vpc" "main" {
  cidr_block = "10.0.0.0/16"
  tags = {
    Name = "main-vpc"
  }
}

resource "aws_subnet" "public" {
  vpc_id     = aws_vpc.main.id      # Reference resource khác
  cidr_block = "10.0.1.0/24"
  availability_zone = "us-east-1a"
  tags = {
    Name = "public-subnet"
  }
}

resource "aws_instance" "web" {
  ami           = "ami-xxx"
  instance_type = "t3.micro"
  subnet_id     = aws_subnet.public.id
}
```

`aws_vpc.main.id` = output `id` của resource `aws_vpc.main`. Terraform tự build dependency graph.

## Variables

```hcl
# variables.tf
variable "region" {
  type    = string
  default = "us-east-1"
}

variable "instance_count" {
  type    = number
  default = 3
}

variable "tags" {
  type = map(string)
  default = {
    Project     = "vprofile"
    Environment = "production"
  }
}

variable "subnets" {
  type = list(string)
}
```

```hcl
# main.tf
provider "aws" {
  region = var.region
}

resource "aws_instance" "web" {
  count         = var.instance_count
  ami           = "ami-xxx"
  instance_type = "t3.micro"
  subnet_id     = var.subnets[count.index % length(var.subnets)]
  tags          = var.tags
}
```

### Pass variable value

```bash
# CLI flag
terraform apply -var="region=us-west-2" -var="instance_count=5"

# File
terraform apply -var-file="prod.tfvars"

# Env variable (TF_VAR_X)
export TF_VAR_region=us-west-2
terraform apply

# Auto-loaded: terraform.tfvars hoặc *.auto.tfvars
```

`prod.tfvars`:

```hcl
region         = "us-west-2"
instance_count = 5
subnets        = ["subnet-xxx", "subnet-yyy"]
```

## Outputs

```hcl
output "instance_ips" {
  value = aws_instance.web[*].public_ip
}

output "alb_dns" {
  value       = aws_lb.main.dns_name
  description = "Load balancer DNS"
}
```

```bash
terraform output
# instance_ips = ["1.2.3.4", "5.6.7.8"]
# alb_dns = "alb-xxx.us-east-1.elb.amazonaws.com"

terraform output -raw alb_dns
# Plain value (no quote) — useful cho script
```

## Data sources — query existing resource

```hcl
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.amazon_linux.id    # Dùng latest AMI
  instance_type = "t3.micro"
}
```

## State file

Terraform lưu trạng thái ở `terraform.tfstate` (local JSON file). Track resource đã tạo → biết diff khi plan.

**Không commit state vào Git** — chứa secret + binary.

### Remote state — production must

```hcl
terraform {
  backend "s3" {
    bucket         = "acme-tf-state"
    key            = "vprofile/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "acme-tf-locks"
  }
}
```

S3 = storage, DynamoDB = lock (tránh 2 người apply cùng lúc).

Alternative backend: Terraform Cloud, Azure Storage, GCS, etcd.

## Module — reusable component

```text
project/
├── main.tf              # Root module
├── variables.tf
├── outputs.tf
└── modules/
    └── vpc/
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

`modules/vpc/main.tf`:

```hcl
resource "aws_vpc" "this" {
  cidr_block = var.cidr
}

resource "aws_subnet" "public" {
  count      = length(var.azs)
  vpc_id     = aws_vpc.this.id
  cidr_block = cidrsubnet(var.cidr, 8, count.index)
  availability_zone = var.azs[count.index]
}
```

`modules/vpc/variables.tf`:

```hcl
variable "cidr" { type = string }
variable "azs"  { type = list(string) }
```

`modules/vpc/outputs.tf`:

```hcl
output "vpc_id" { value = aws_vpc.this.id }
output "subnet_ids" { value = aws_subnet.public[*].id }
```

`main.tf` (root):

```hcl
module "vpc" {
  source = "./modules/vpc"
  cidr   = "10.0.0.0/16"
  azs    = ["us-east-1a", "us-east-1b"]
}

resource "aws_instance" "web" {
  subnet_id = module.vpc.subnet_ids[0]
  # ...
}
```

### Terraform Registry — module có sẵn

[registry.terraform.io](https://registry.terraform.io) có hàng nghìn module:

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.4.0"

  name = "vprofile-vpc"
  cidr = "10.0.0.0/16"
  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}
```

1 module → toàn bộ VPC pattern best-practice. **Đừng reinvent**.

## Loop với count + for_each

### count

```hcl
resource "aws_instance" "web" {
  count         = 3
  ami           = "ami-xxx"
  instance_type = "t3.micro"
  tags = {
    Name = "web-${count.index}"
  }
}

# web[0], web[1], web[2]
```

### for_each (recommend cho stable)

```hcl
variable "users" {
  type = map(object({
    role = string
  }))
  default = {
    alice = { role = "admin" }
    bob   = { role = "developer" }
  }
}

resource "aws_iam_user" "users" {
  for_each = var.users
  name     = each.key
  tags = {
    Role = each.value.role
  }
}

# users["alice"], users["bob"]
```

`for_each` stable hơn `count`: thêm/xoá item không di chuyển resource khác.

## vProfile infra với Terraform

```hcl
# vpc + subnets
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  name    = "vprofile"
  cidr    = "10.0.0.0/16"
  azs     = ["us-east-1a", "us-east-1b"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24"]
  enable_nat_gateway = true
}

# RDS
resource "aws_db_instance" "mariadb" {
  identifier        = "vprofile-rds"
  engine            = "mariadb"
  instance_class    = "db.t3.micro"
  allocated_storage = 20
  db_name           = "accounts"
  username          = "admin"
  password          = var.db_password
  vpc_security_group_ids = [aws_security_group.backend.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name
  multi_az          = true
  backup_retention_period = 7
  skip_final_snapshot = true
}

# Security group
resource "aws_security_group" "backend" {
  name   = "vprofile-backend"
  vpc_id = module.vpc.vpc_id

  ingress {
    from_port       = 3306
    to_port         = 3306
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }
}

# EC2 ASG cho app
resource "aws_launch_template" "app" {
  name_prefix   = "vprofile-app-"
  image_id      = data.aws_ami.amazon_linux.id
  instance_type = "t3.small"
  user_data     = base64encode(file("scripts/app-userdata.sh"))
}

resource "aws_autoscaling_group" "app" {
  name                = "vprofile-asg"
  min_size            = 2
  max_size            = 5
  desired_capacity    = 2
  vpc_zone_identifier = module.vpc.private_subnets

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  target_group_arns = [aws_lb_target_group.app.arn]
}

# ALB
resource "aws_lb" "main" {
  name               = "vprofile-alb"
  internal           = false
  load_balancer_type = "application"
  subnets            = module.vpc.public_subnets
  security_groups    = [aws_security_group.alb.id]
}

output "alb_dns" {
  value = aws_lb.main.dns_name
}
```

`terraform apply` → toàn bộ AWS infra trong 5-10 phút.

## CI/CD cho Terraform

```yaml
# .github/workflows/terraform.yml
on:
  pull_request:
  push: { branches: [main] }

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - run: terraform fmt -check
      - run: terraform init
      - run: terraform validate

      - name: Plan
        run: terraform plan -out=plan.out
        if: github.event_name == 'pull_request'

      - name: Apply
        run: terraform apply -auto-approve
        if: github.ref == 'refs/heads/main'
```

PR → plan visible. Merge → apply.

## Tools đi kèm

| Tool | Mục đích |
|---|---|
| **terraform-docs** | Auto-generate doc từ module |
| **tflint** | Lint |
| **tfsec** | Security scan |
| **terragrunt** | DRY wrapper |
| **Atlantis** | PR automation |
| **Infracost** | Cost estimate trong PR |

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Commit state file | Lộ secret | `.gitignore` state, remote backend |
| Manual edit state | Conflict | KHÔNG edit, dùng `terraform state` |
| Apply không plan | Surprise change | Luôn `plan` trước |
| `count` cho dynamic items | Resource drift | Dùng `for_each` |
| Hardcode credential | Lộ | Var sensitive + secret manager |
| Module không pin version | Break khi update | `version = "~> 5.4"` |
| Local backend production | Mất state = mất control | S3 + DynamoDB lock |
| No tag cost allocation | Bill không track | Tag mandatory |

## Tóm tắt bài 1

- **Terraform** = IaC standard multi-cloud, HCL syntax.
- Workflow: `init → fmt → validate → plan → apply`.
- **Provider** = plugin cho mỗi platform (aws, gcp, azure, k8s, ...).
- **Resource** = thứ tạo (EC2, S3, VPC...). **Data source** = query existing.
- **Variable** input, **Output** export, **Module** reusable.
- **Remote state** (S3 + DynamoDB) bắt buộc cho team.
- **Registry** có module best-practice — đừng reinvent.
- CI/CD: plan trong PR, apply khi merge main.

**Phase kế tiếp** → [Phase 22 — Bài 1: Ansible — configuration management](../phase-22-ansible/01-ansible-basics.md)

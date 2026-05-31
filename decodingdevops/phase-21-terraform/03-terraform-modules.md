# Bài 3: Terraform Modules — reusable infrastructure components

Module = Terraform của Terraform. **Module tốt** = production-grade IaC. Bài này dạy viết, test, version module.

## Module là gì?

> **Module** = bộ HCL files đóng gói thành 1 unit reusable với `variables`, `outputs`, optional `resources`.

Use case:
- VPC pattern (3 module trong khoá: VPC, EC2, ALB).
- DRY — viết 1 lần, dùng nhiều nơi.
- Abstraction — hide complexity.
- Versioning + sharing.

## Cấu trúc

```text
modules/
└── vpc/
    ├── main.tf              # Resources
    ├── variables.tf          # Inputs
    ├── outputs.tf            # Outputs
    ├── versions.tf           # Required Terraform/provider versions
    ├── README.md             # Documentation
    └── examples/             # Usage example
        └── simple/
            ├── main.tf
            └── README.md
```

## Module example — VPC

`modules/vpc/main.tf`:

```hcl
locals {
  azs = length(var.availability_zones) > 0 ? var.availability_zones : data.aws_availability_zones.available.names
  tags = merge(
    var.tags,
    {
      "ManagedBy" = "terraform"
      "Module"    = "vpc"
    }
  )
}

data "aws_availability_zones" "available" {
  state = "available"
}

resource "aws_vpc" "main" {
  cidr_block           = var.cidr_block
  enable_dns_hostnames = var.enable_dns_hostnames
  enable_dns_support   = true

  tags = merge(local.tags, { Name = var.name })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = merge(local.tags, { Name = "${var.name}-igw" })
}

resource "aws_subnet" "public" {
  count = length(local.azs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.cidr_block, 8, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.tags, {
    Name                     = "${var.name}-public-${local.azs[count.index]}"
    Tier                     = "public"
    "kubernetes.io/role/elb" = "1"
  })
}

resource "aws_subnet" "private" {
  count = length(local.azs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.cidr_block, 8, count.index + 100)
  availability_zone = local.azs[count.index]

  tags = merge(local.tags, {
    Name                              = "${var.name}-private-${local.azs[count.index]}"
    Tier                              = "private"
    "kubernetes.io/role/internal-elb" = "1"
  })
}

# NAT (1 per AZ for HA, or single for cost saving)
resource "aws_eip" "nat" {
  count = var.single_nat_gateway ? 1 : length(local.azs)

  domain = "vpc"
  tags   = merge(local.tags, { Name = "${var.name}-nat-${count.index}" })
}

resource "aws_nat_gateway" "main" {
  count = var.single_nat_gateway ? 1 : length(local.azs)

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.tags, { Name = "${var.name}-nat-${count.index}" })
}

# Route tables
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id
  tags   = merge(local.tags, { Name = "${var.name}-public-rt" })
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  count  = var.single_nat_gateway ? 1 : length(local.azs)
  vpc_id = aws_vpc.main.id
  tags   = merge(local.tags, { Name = "${var.name}-private-rt-${count.index}" })
}

resource "aws_route" "private_nat" {
  count = var.single_nat_gateway ? 1 : length(local.azs)

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[count.index].id
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[var.single_nat_gateway ? 0 : count.index].id
}
```

`modules/vpc/variables.tf`:

```hcl
variable "name" {
  description = "VPC name prefix"
  type        = string
  validation {
    condition     = length(var.name) > 0 && length(var.name) <= 32
    error_message = "Name 1-32 characters."
  }
}

variable "cidr_block" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of AZs (empty = auto-detect)"
  type        = list(string)
  default     = []
}

variable "enable_dns_hostnames" {
  type    = bool
  default = true
}

variable "single_nat_gateway" {
  description = "Single NAT (cost saving) vs per-AZ (HA)"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
```

`modules/vpc/outputs.tf`:

```hcl
output "vpc_id" {
  value       = aws_vpc.main.id
  description = "VPC ID"
}

output "vpc_cidr" {
  value = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  value = aws_subnet.private[*].id
}

output "nat_gateway_ips" {
  value = aws_eip.nat[*].public_ip
}

output "igw_id" {
  value = aws_internet_gateway.main.id
}
```

`modules/vpc/versions.tf`:

```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}
```

## Use module

```hcl
# main.tf
module "vpc" {
  source = "./modules/vpc"

  name               = "vprofile"
  cidr_block         = "10.0.0.0/16"
  availability_zones = ["us-east-1a", "us-east-1b"]
  single_nat_gateway = true     # Dev cost saving

  tags = {
    Project     = "vprofile"
    Environment = "production"
  }
}

resource "aws_instance" "web" {
  subnet_id = module.vpc.public_subnet_ids[0]
  # ...
}
```

`module.vpc.<output_name>` access output.

## Module sources

```hcl
# Local
source = "./modules/vpc"
source = "../shared-modules/vpc"

# Git
source = "git::https://github.com/acme/terraform-aws-modules.git//vpc?ref=v1.2.0"
source = "git::ssh://git@github.com/acme/modules.git//vpc?ref=v1.2.0"

# Terraform Registry
source = "terraform-aws-modules/vpc/aws"
version = "5.5.0"

# HTTP archive
source = "https://example.com/vpc.zip"

# S3
source = "s3::https://s3.amazonaws.com/bucket/vpc.zip"
```

Production: Git tag pin version mandatory.

## Public registry — đừng reinvent

```hcl
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.4"

  name = "vprofile-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  public_subnets  = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  private_subnets = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = false      # HA
  enable_vpn_gateway = false

  tags = {
    Environment = "production"
  }
}
```

[terraform-aws-modules](https://registry.terraform.io/namespaces/terraform-aws-modules) có module battle-tested cho:
- vpc, security-group, ec2, eks, rds, alb, autoscaling, ...

> **Dùng community module** thay vì viết từ đầu trừ khi yêu cầu custom.

## Module composition

```hcl
module "vpc" {
  source = "./modules/vpc"
  # ...
}

module "rds" {
  source = "./modules/rds"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnet_ids
  # ...
}

module "alb" {
  source = "./modules/alb"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.public_subnet_ids
  # ...
}

module "ecs" {
  source = "./modules/ecs"

  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnet_ids
  alb_target_group_arn = module.alb.target_group_arn
  db_endpoint    = module.rds.endpoint
  # ...
}
```

Module pass output → input dependency tree.

## Versioning module

Tag Git repo:

```bash
cd modules-repo
git tag v1.2.0
git push --tags
```

Consumer pin:

```hcl
source = "git::https://github.com/acme/modules.git//vpc?ref=v1.2.0"
```

SemVer:
- v1.0.0 → v1.0.1: bug fix.
- v1.0.0 → v1.1.0: new feature backward-compatible.
- v1.0.0 → v2.0.0: breaking change.

Module có CHANGELOG.md.

## Test module với Terratest

`tests/vpc_test.go`:

```go
package test

import (
    "testing"

    "github.com/gruntwork-io/terratest/modules/aws"
    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/stretchr/testify/assert"
)

func TestVPC(t *testing.T) {
    opts := &terraform.Options{
        TerraformDir: "../examples/simple",
        Vars: map[string]interface{}{
            "name": "test-vpc-" + random.UniqueId(),
        },
    }

    defer terraform.Destroy(t, opts)
    terraform.InitAndApply(t, opts)

    vpcId := terraform.Output(t, opts, "vpc_id")
    assert.NotEmpty(t, vpcId)

    // Verify VPC exists trong AWS
    vpc := aws.GetVpcById(t, vpcId, "us-east-1")
    assert.Equal(t, "10.0.0.0/16", *vpc.CidrBlock)
}
```

```bash
cd tests/
go test -v -timeout 30m
```

Terratest actually create resources → verify → destroy. Real integration test.

## Multi-environment với module

```text
infrastructure/
├── modules/
│   ├── vpc/
│   ├── rds/
│   └── alb/
└── environments/
    ├── dev/
    │   ├── main.tf
    │   └── terraform.tfvars
    ├── staging/
    │   ├── main.tf
    │   └── terraform.tfvars
    └── production/
        ├── main.tf
        └── terraform.tfvars
```

`environments/production/main.tf`:

```hcl
terraform {
  backend "s3" {
    bucket = "acme-tf-state"
    key    = "production/terraform.tfstate"
    region = "us-east-1"
  }
}

module "vpc" {
  source = "../../modules/vpc"

  name               = "vprofile-prod"
  cidr_block         = "10.0.0.0/16"
  single_nat_gateway = false       # HA prod
}

module "rds" {
  source = "../../modules/rds"

  identifier        = "vprofile-prod"
  instance_class    = "db.t3.small"
  multi_az          = true
  backup_retention  = 30
  # ...
}
```

`environments/dev/main.tf` — similar nhưng different vars:

```hcl
module "vpc" {
  source = "../../modules/vpc"

  name               = "vprofile-dev"
  cidr_block         = "10.10.0.0/16"
  single_nat_gateway = true        # Cost saving dev
}

module "rds" {
  source = "../../modules/rds"

  identifier       = "vprofile-dev"
  instance_class   = "db.t3.micro"
  multi_az         = false
  backup_retention = 1
}
```

Apply each env separately:

```bash
cd environments/dev
terraform apply

cd ../production
terraform apply
```

## Best practices

| Practice | Why |
|---|---|
| Pin version | Avoid surprise breaking change |
| README per module | Document interface |
| Examples folder | Show usage |
| Validation in variables | Catch error early |
| Sensible defaults | Easier consumer |
| Tag all resources | Cost allocation |
| Output IDs, ARNs | Composability |
| No hardcoded secret | Security |
| Test với Terratest | Confidence |
| Lint với tflint | Best practice |
| Format `terraform fmt` | Consistency |

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `count` cho dynamic | Resource recreation | Use `for_each` |
| Module phụ thuộc local file | Break khi share | Self-contained |
| Output không pin | Module update break | Stable output schema |
| Nested module sâu | Hard to debug | Flat composition |
| Version pin `>= 1.0` | Auto upgrade break | Pin specific version |
| Provider trong module | Conflict consumer | Define provider trong consumer |

## Tóm tắt bài 3

- **Module** = HCL package reusable với input/output/resources.
- Source: local, Git tag, Terraform Registry.
- **`terraform-aws-modules`** registry battle-tested — dùng thay tự viết.
- **Composition** = module pass output → input.
- **SemVer** versioning + CHANGELOG.
- **Terratest** Go test framework với real AWS.
- **Multi-environment** với separate state file + reuse module.
- Pin version + validation + README mandatory production.

**Bài kế tiếp** → [Bài 4: CI/CD cho Terraform + Atlantis + best practices](04-terraform-cicd.md)

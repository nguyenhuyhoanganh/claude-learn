# Bài 3: Container registry, image lifecycle, supply chain security

Bài cuối phase 28. **Quản lý registry** + image lifecycle + supply chain security cho production.

## Container registries (Các registry phổ biến)

| Registry | Pros | Cost |
|---|---|---|
| **Docker Hub** | Universal, công cộng phổ biến | Free public, $$ private |
| **GitHub Container Registry (GHCR)** | Tích hợp GitHub | Free public, paid private |
| **AWS ECR** | Tích hợp AWS, IAM | $0.10/GB-tháng |
| **Google Artifact Registry** | Tích hợp GCP | $0.10/GB-tháng |
| **Azure Container Registry** | Tích hợp Azure | $5/ngày (basic) |
| **Nexus** | Self-host, hỗ trợ nhiều format | Free self-host |
| **Harbor** | OSS, có vuln scan built-in | Free self-host |
| **Quay** | RedHat, security tốt | Free public |

## AWS ECR deep dive

### Create + lifecycle policy

```bash
aws ecr create-repository \
    --repository-name vprofile \
    --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability IMMUTABLE \
    --encryption-configuration encryptionType=KMS

# Lifecycle policy — tự động cleanup
cat > lifecycle.json <<EOF
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 30 tagged images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["v"],
        "countType": "imageCountMoreThan",
        "countNumber": 30
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 2,
      "description": "Expire untagged > 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": {"type": "expire"}
    }
  ]
}
EOF

aws ecr put-lifecycle-policy \
    --repository-name vprofile \
    --lifecycle-policy-text file://lifecycle.json
```

`IMMUTABLE` = không cho overwrite tag → đảm bảo reproducibility (cùng tag luôn cho cùng image).

### Cross-account replication (Nhân bản giữa các account)

```bash
aws ecr put-replication-configuration \
    --replication-configuration '{
        "rules": [{
            "destinations": [
                {"region": "us-west-2", "registryId": "123"},
                {"region": "eu-west-1", "registryId": "123"}
            ],
            "repositoryFilters": [
                {"filter": "vprofile", "filterType": "PREFIX_MATCH"}
            ]
        }]
    }'
```

Multi-region replication cho disaster recovery.

### Pull through cache (Cache trung gian)

ECR đóng vai trò proxy cho Docker Hub:

```bash
aws ecr create-pull-through-cache-rule \
    --ecr-repository-prefix dockerhub \
    --upstream-registry-url registry-1.docker.io
```

Pull `123.dkr.ecr.us-east-1.amazonaws.com/dockerhub/library/nginx:1.25`
→ ECR check cache → fetch từ Docker Hub nếu miss → cache lại.

Lợi ích:
- Bypass Docker Hub rate limit (200 pull / 6h cho anonymous).
- Pull nhanh hơn (cùng region với ECR).
- VPC endpoint cho phép route private.

## Image tagging strategy

| Pattern | Pros | Cons |
|---|---|---|
| `latest` | Dễ | Không reproducible |
| `v1.0.0` (SemVer) | Rõ ràng | Manual update |
| `git-abc1234` (commit SHA) | Reproducible | Dài |
| `2026-05-31-abc1234` | Time + commit | Dài |
| Branch name (`main`, `dev`) | Deploy theo branch | Mutable (có thể đổi) |
| Multiple tags | Linh hoạt | Có thể confusing |

### Recommended (Khuyến nghị)

Build với nhiều tag:

```bash
SHA=$(git rev-parse --short HEAD)
VERSION="v1.2.0"
BRANCH="main"

docker tag vprofile $REGISTRY/vprofile:$SHA
docker tag vprofile $REGISTRY/vprofile:$VERSION
docker tag vprofile $REGISTRY/vprofile:$BRANCH-latest

docker push --all-tags $REGISTRY/vprofile
```

Production deploy dùng `$SHA` → reproducible 100%.
Tag `latest` cho branch `main` chỉ dùng để tiện.

### Immutable tag

```bash
# ECR immutable mode
aws ecr put-image-tag-mutability \
    --repository-name vprofile \
    --image-tag-mutability IMMUTABLE
```

Sau khi push `:v1.0.0` rồi → không thể overwrite. Tránh accidentally overwrite (lỗi vô tình thay image).

## Image scanning + policy

### ECR scan on push

```bash
# Enable
aws ecr put-image-scanning-configuration \
    --repository-name vprofile \
    --image-scanning-configuration scanOnPush=true

# Hoặc Enhanced scanning (qua Inspector v2)
aws inspector2 enable --resource-types ECR
```

Findings: lỗ hổng + CVE references.

### Cross-tool scan trong CI

Dùng nhiều scanner song song để tăng coverage:

```yaml
# .github/workflows/security.yml
on: [push, schedule]

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Trivy
      - uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/acme/vprofile:latest
          format: sarif
          output: trivy.sarif
          severity: HIGH,CRITICAL
          exit-code: 1

      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy.sarif

      # Grype
      - uses: anchore/scan-action@v3
        with:
          image: ghcr.io/acme/vprofile:latest
          severity-cutoff: high
          fail-build: true

      # Snyk
      - uses: snyk/actions/docker@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          image: ghcr.io/acme/vprofile:latest
```

3 tool → coverage cao, giảm false positive (cảnh báo nhầm).

## SBOM — Software Bill of Materials (Danh mục thành phần phần mềm)

Generate khi build:

```bash
# Qua Buildx
docker buildx build \
    --sbom=true \
    --provenance=mode=max \
    -t ghcr.io/acme/vprofile:v1.0 \
    --push .

# Hoặc Syft riêng
syft ghcr.io/acme/vprofile:v1.0 -o spdx-json > sbom.json
```

SBOM = JSON liệt kê mọi component có trong image:

```json
{
    "packages": [
        {"name": "openjdk", "version": "17.0.5", "license": "GPL-2.0-with-classpath-exception"},
        {"name": "tomcat", "version": "10.1.17", "license": "Apache-2.0"},
        {"name": "log4j-core", "version": "2.20.0", "license": "Apache-2.0"},
        ...
    ]
}
```

Compliance: regulator yêu cầu SBOM (vd: Executive Order 14028 của Mỹ).

## Cosign — Image signing (Ký số image)

### Generate keys

```bash
# Local key
cosign generate-key-pair
# cosign.key (private), cosign.pub (public)

# Hoặc dùng KMS-backed key
cosign generate-key-pair --kms awskms:///alias/cosign-key
```

### Sign image

```bash
COSIGN_PASSWORD=xxx cosign sign \
    --key cosign.key \
    ghcr.io/acme/vprofile:v1.0

# Hoặc keyless (qua OIDC)
cosign sign --identity-token $OIDC_TOKEN ghcr.io/acme/vprofile:v1.0
```

### Verify signature

```bash
cosign verify --key cosign.pub ghcr.io/acme/vprofile:v1.0

# Output: trust validated, image attestations
```

### Sign attestations (Chữ ký kèm metadata)

```bash
# Sign SBOM kèm image
cosign attest --predicate sbom.json --key cosign.key ghcr.io/acme/vprofile:v1.0

# Sign vulnerability report kèm image
cosign attest --predicate vuln-report.json --key cosign.key ...
```

### Policy enforcement K8s — Kyverno

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-image-signature
spec:
  validationFailureAction: enforce
  rules:
    - name: verify-cosign
      match:
        any:
          - resources:
              kinds: [Pod]
      verifyImages:
        - imageReferences:
            - "ghcr.io/acme/*"
          attestors:
            - entries:
                - keys:
                    publicKeys: |-
                      -----BEGIN PUBLIC KEY-----
                      MFkwEw...
                      -----END PUBLIC KEY-----
```

Pod dùng image chưa ký → admission webhook reject (không cho deploy).

## Sigstore + Keyless signing (Ký không cần lưu key)

Dùng OIDC identity thay vì key tĩnh:

```bash
# Sign qua GitHub OIDC (không cần file key)
cosign sign --identity-token $(curl -H "Authorization: Bearer $ACTIONS_RUNTIME_TOKEN" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sigstore" | jq -r .value) \
    ghcr.io/acme/vprofile:v1.0
```

Signature được lưu vào **Rekor** transparency log (sổ cái công khai, không thể sửa).

Verify:

```bash
cosign verify \
    --certificate-identity "https://github.com/acme/vprofile/.github/workflows/build.yml@refs/heads/main" \
    --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
    ghcr.io/acme/vprofile:v1.0
```

Đây là **best practice hiện đại nhất** — không cần quản lý key.

## Slim images — Giảm thiểu attack surface

### Distroless

```dockerfile
# Builder
FROM golang:1.22 AS builder
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -o /app

# Runtime
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /app /app
USER nonroot:nonroot
ENTRYPOINT ["/app"]
```

Image ~5 MB. **Không có shell**, **không có apt**, **không có gì cả** → kẻ tấn công có vào được container cũng không làm gì được.

### Alpine

```dockerfile
FROM alpine:3.19
RUN apk add --no-cache nginx
```

~10 MB. Dùng musl libc (khác với glibc — một số app có thể không tương thích).

### Scratch (Cho Go static binary)

```dockerfile
FROM scratch
COPY ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app /app
CMD ["/app"]
```

~5 MB. Không thể exec vào container (không có shell).

## CI/CD with hardening (Pipeline hardened đầy đủ)

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: read
  id-token: write
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=sha,format=long

      - name: Build + push
        uses: docker/build-push-action@v5
        id: build
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          sbom: true
          provenance: mode=max
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/${{ github.repository }}@${{ steps.build.outputs.digest }}
          severity: HIGH,CRITICAL
          exit-code: 1

      - name: Sign with cosign (keyless)
        env:
          COSIGN_EXPERIMENTAL: 1
        run: |
          cosign sign --yes ghcr.io/${{ github.repository }}@${{ steps.build.outputs.digest }}

      - name: Attest SBOM
        uses: actions/attest-sbom@v1
        with:
          subject-name: ghcr.io/${{ github.repository }}
          subject-digest: ${{ steps.build.outputs.digest }}
          sbom-path: ./sbom.spdx.json
```

Pipeline này produce:
- Tagged image (semver + SHA).
- SBOM attestation.
- Provenance attestation.
- Cosign signature (keyless OIDC).
- Trivy scan result.

## Supply chain — SLSA framework

SLSA = Supply-chain Levels for Software Artifacts (Mức bảo mật cho artifact phần mềm):

| Level | Requirements |
|---|---|
| **L1** | Process build được document |
| **L2** | Build trên service hosted, provenance authenticated |
| **L3** | Build platform hardened, source verified |
| **L4** | Two-person review, hermetic build (build trong môi trường cô lập tuyệt đối) |

GitHub Actions + cosign + SBOM = đạt được SLSA L3.

## Tổng kết phase 28

3 bài cover:
1. Compose basics + networking + volume.
2. Containerize vProfile mỗi service với multi-stage build.
3. Registry + lifecycle + supply chain security.

Skill đạt được:
- Container ecosystem trưởng thành.
- Hardening image production-grade.
- Supply chain security với SBOM + cosign.

## Tóm tắt bài 3

- **ECR + lifecycle policy** tự động cleanup image cũ.
- **IMMUTABLE tag** ngăn ngừa overwrite.
- **Pull through cache** bypass Docker Hub rate limit.
- **Tag strategy**: SHA + SemVer + branch — nhiều tag song song.
- **Trivy + Grype + Snyk** scan multi-tool.
- **SBOM** = compliance + transparency.
- **Cosign keyless** ký số image với OIDC + Rekor log.
- **Kyverno** K8s policy enforce signature.
- **Distroless / scratch** giảm tối đa attack surface.
- **SLSA** maturity model cho supply chain security.

**Phase kế tiếp** → [Phase 29 — Kubernetes](../phase-29-kubernetes/01-k8s-basics.md)

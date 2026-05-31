# Bài 3: Container registry, image lifecycle, supply chain security

Bài cuối phase 28. **Registry management** + image lifecycle + supply chain security cho production.

## Container registries

| Registry | Pros | Cost |
|---|---|---|
| **Docker Hub** | Universal | Free public, $$ private |
| **GitHub Container Registry (GHCR)** | Tích hợp GitHub | Free public, paid private |
| **AWS ECR** | AWS integrated, IAM | $0.10/GB-month |
| **Google Artifact Registry** | GCP integrated | $0.10/GB-month |
| **Azure Container Registry** | Azure | $5/day basic |
| **Nexus** | Self-host, multi-format | Free self-host |
| **Harbor** | OSS, vuln scan built-in | Free self-host |
| **Quay** | RedHat, security | Free public |

## AWS ECR deep

### Create + lifecycle policy

```bash
aws ecr create-repository \
    --repository-name vprofile \
    --image-scanning-configuration scanOnPush=true \
    --image-tag-mutability IMMUTABLE \
    --encryption-configuration encryptionType=KMS

# Lifecycle policy — auto-cleanup
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

`IMMUTABLE` = can't overwrite tag → reproducibility.

### Cross-account replication

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

Multi-region replication cho DR.

### Pull through cache

ECR proxy cho Docker Hub:

```bash
aws ecr create-pull-through-cache-rule \
    --ecr-repository-prefix dockerhub \
    --upstream-registry-url registry-1.docker.io
```

Pull `123.dkr.ecr.us-east-1.amazonaws.com/dockerhub/library/nginx:1.25`
→ ECR check cache → fetch from Docker Hub if miss → store locally.

Benefits:
- Bypass Docker Hub rate limit.
- Faster pull (same region as ECR).
- VPC endpoint route private.

## Image tagging strategy

| Pattern | Pros | Cons |
|---|---|---|
| `latest` | Easy | Not reproducible |
| `v1.0.0` (SemVer) | Clear | Manual update |
| `git-abc1234` (commit SHA) | Reproducible | Long |
| `2026-05-31-abc1234` | Time + commit | Long |
| Branch name (`main`, `dev`) | Branch-based deploy | Mutable |
| Multiple tags | Flexible | Confusing |

### Recommended

Build with multiple tags:

```bash
SHA=$(git rev-parse --short HEAD)
VERSION="v1.2.0"
BRANCH="main"

docker tag vprofile $REGISTRY/vprofile:$SHA
docker tag vprofile $REGISTRY/vprofile:$VERSION
docker tag vprofile $REGISTRY/vprofile:$BRANCH-latest

docker push --all-tags $REGISTRY/vprofile
```

Production deploy use `$SHA` → reproducible.
Latest tag for `main` branch convenience.

### Immutable tag

```bash
# ECR immutable mode
aws ecr put-image-tag-mutability \
    --repository-name vprofile \
    --image-tag-mutability IMMUTABLE
```

Can't overwrite `:v1.0.0` once pushed. Avoid accidental overwrite.

## Image scanning + policy

### ECR scan on push

```bash
# Enable
aws ecr put-image-scanning-configuration \
    --repository-name vprofile \
    --image-scanning-configuration scanOnPush=true

# Or Enhanced scanning (Inspector v2)
aws inspector2 enable --resource-types ECR
```

Findings: vulnerabilities + CVE references.

### Cross-tool scan in CI

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

3 tool → high coverage, false positive reduction.

## SBOM — Software Bill of Materials

Generate at build:

```bash
# Buildx
docker buildx build \
    --sbom=true \
    --provenance=mode=max \
    -t ghcr.io/acme/vprofile:v1.0 \
    --push .

# Or Syft separate
syft ghcr.io/acme/vprofile:v1.0 -o spdx-json > sbom.json
```

SBOM = JSON list mọi component:

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

Compliance: regulators require SBOM (EO 14028).

## Cosign — image signing

### Generate keys

```bash
# Local key
cosign generate-key-pair
# cosign.key (private), cosign.pub (public)

# Or KMS-backed
cosign generate-key-pair --kms awskms:///alias/cosign-key
```

### Sign

```bash
COSIGN_PASSWORD=xxx cosign sign \
    --key cosign.key \
    ghcr.io/acme/vprofile:v1.0

# Or keyless (OIDC)
cosign sign --identity-token $OIDC_TOKEN ghcr.io/acme/vprofile:v1.0
```

### Verify

```bash
cosign verify --key cosign.pub ghcr.io/acme/vprofile:v1.0

# Output: trust validated, image attestations
```

### Sign attestations

```bash
# Sign SBOM
cosign attest --predicate sbom.json --key cosign.key ghcr.io/acme/vprofile:v1.0

# Sign vulnerability report
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

Pod with unsigned image → admission webhook reject.

## Sigstore + keyless signing

Use OIDC identity instead of static key:

```bash
# Sign via GitHub OIDC (no key file)
cosign sign --identity-token $(curl -H "Authorization: Bearer $ACTIONS_RUNTIME_TOKEN" \
    "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sigstore" | jq -r .value) \
    ghcr.io/acme/vprofile:v1.0
```

Signature stored in **Rekor** transparency log (immutable public ledger).

Verify:

```bash
cosign verify \
    --certificate-identity "https://github.com/acme/vprofile/.github/workflows/build.yml@refs/heads/main" \
    --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
    ghcr.io/acme/vprofile:v1.0
```

Modern best practice — no key management.

## Slim images — minimize attack surface

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

~5 MB image. No shell, no apt, no anything.

### Alpine

```dockerfile
FROM alpine:3.19
RUN apk add --no-cache nginx
```

~10 MB. musl libc (different from glibc — some apps incompatible).

### Scratch (Go static binary)

```dockerfile
FROM scratch
COPY ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /app /app
CMD ["/app"]
```

~5 MB. Cannot exec into.

## CI/CD with hardening

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

Pipeline produce:
- Tagged image (semver + SHA).
- SBOM attestation.
- Provenance attestation.
- Cosign signature (keyless OIDC).
- Trivy scan result.

## Supply chain — SLSA framework

Supply-chain Levels for Software Artifacts:

| Level | Requirements |
|---|---|
| **L1** | Documented build process |
| **L2** | Hosted build service, provenance authenticated |
| **L3** | Hardened build platform, source verified |
| **L4** | Two-person review, hermetic build |

GitHub Actions + cosign + SBOM = SLSA L3 achievable.

## Tổng kết phase 28

3 bài cover:
1. Compose basics + networking + volume.
2. Containerize vProfile mỗi service multi-stage.
3. Registry + lifecycle + supply chain security.

Skills:
- Container ecosystem mature.
- Production-grade image hardening.
- Supply chain security với SBOM + cosign.

## Tóm tắt bài 3

- **ECR + lifecycle policy** auto-cleanup old images.
- **IMMUTABLE tag** prevent overwrite.
- **Pull through cache** bypass Docker Hub rate limit.
- **Tag strategy**: SHA + SemVer + branch multi-tag.
- **Trivy + Grype + Snyk** multi-tool scan.
- **SBOM** = compliance + transparency.
- **Cosign keyless** signing với OIDC + Rekor log.
- **Kyverno** K8s policy enforce signature.
- **Distroless / scratch** minimum attack surface.
- **SLSA** supply chain maturity model.

**Phase kế tiếp** → [Phase 29 — Kubernetes](../phase-29-kubernetes/01-k8s-basics.md)

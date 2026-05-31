# Bài 3: Docker Swarm, Buildx, security scanning

Bài cuối phase 27. Multi-host orchestration, advanced build, image security.

## Docker Swarm

Native cluster mode of Docker. Simpler than K8s, less features.

### Init swarm

```bash
# Manager
docker swarm init --advertise-addr 10.0.0.10

# Output:
docker swarm join --token SWMTKN-1-xxx 10.0.0.10:2377

# Run trên worker nodes
```

```bash
docker node ls
# ID        STATUS  AVAILABILITY  MANAGER STATUS
# xxx       Ready   Active        Leader
# yyy       Ready   Active
# zzz       Ready   Active
```

### Deploy stack

`docker-stack.yml` (subset of Compose):

```yaml
version: '3.9'
services:
  web:
    image: nginx:1.25
    ports:
      - "80:80"
    deploy:
      replicas: 6
      placement:
        constraints:
          - node.role == worker
      update_config:
        parallelism: 2
        delay: 10s
        order: start-first
      rollback_config:
        parallelism: 2
        delay: 5s
      restart_policy:
        condition: on-failure
        max_attempts: 3
    networks: [overlay]

networks:
  overlay:
    driver: overlay
    attachable: true
```

```bash
docker stack deploy -c docker-stack.yml vprofile

docker stack ls
docker stack services vprofile
docker stack ps vprofile
```

### Service update + rollback

```bash
# Update image
docker service update --image nginx:1.26 vprofile_web

# Rollback
docker service rollback vprofile_web
```

### Secrets in Swarm

```bash
echo "MySecret123" | docker secret create db_password -

docker service create \
    --name app \
    --secret db_password \
    -e DB_PASSWORD_FILE=/run/secrets/db_password \
    my-app
```

Encrypted at rest in Raft, only on nodes need it.

### Swarm vs K8s

| | Swarm | K8s |
|---|---|---|
| Setup | 1 command | Complex |
| Learning curve | Low | High |
| Features | Basic | Comprehensive |
| Community | Declining | Massive |
| Production | Small-medium | Any scale |

Modern recommend K8s. Swarm OK cho small team không cần K8s features.

## Buildx — modern build

### Multi-platform build

```bash
# Setup builder (one-time)
docker buildx create --name multibuilder --use --bootstrap

# Build cho amd64 + arm64
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t myregistry/app:v1 \
    --push .
```

Single command build cho cả x86 + ARM (Mac M1, AWS Graviton, Raspberry Pi).

### Cache backends

```bash
# Local cache
docker buildx build \
    --cache-from type=local,src=/tmp/.buildx-cache \
    --cache-to type=local,dest=/tmp/.buildx-cache,mode=max \
    .

# GitHub Actions cache
docker buildx build \
    --cache-from type=gha \
    --cache-to type=gha,mode=max \
    .

# Registry cache (ECR, Docker Hub)
docker buildx build \
    --cache-from type=registry,ref=myregistry/app:cache \
    --cache-to type=registry,ref=myregistry/app:cache,mode=max \
    .

# S3 (Buildx 0.10+)
docker buildx build \
    --cache-from type=s3,region=us-east-1,bucket=my-cache \
    --cache-to type=s3,region=us-east-1,bucket=my-cache,mode=max \
    .
```

`mode=max` = cache all layers (vs `min` = only final).

### Bake — Dockerfile + Compose hybrid

`docker-bake.hcl`:

```hcl
group "default" {
  targets = ["app", "worker", "api"]
}

target "app" {
  context = "./app"
  dockerfile = "Dockerfile"
  tags = ["myregistry/app:${VERSION}"]
  platforms = ["linux/amd64", "linux/arm64"]
  cache-from = ["type=gha"]
  cache-to = ["type=gha,mode=max"]
}

target "worker" {
  context = "./worker"
  tags = ["myregistry/worker:${VERSION}"]
  inherits = ["app"]      # Inherit settings
}
```

```bash
docker buildx bake --push
# Build cả 3 targets parallel
```

### BuildKit cache mounts

```dockerfile
# syntax=docker/dockerfile:1.6

FROM golang:1.22 AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -o /app
```

Cache persist across builds. Build go app: first 60s, subsequent 5s.

### Secret mount

```dockerfile
# syntax=docker/dockerfile:1.6

FROM node:20
WORKDIR /app
COPY package*.json ./

RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm install
```

```bash
docker buildx build \
    --secret id=npmrc,src=$HOME/.npmrc \
    -t app .
```

Private npm registry credential never end up in image layer.

### SSH mount

```dockerfile
# syntax=docker/dockerfile:1.6

FROM golang:1.22
RUN --mount=type=ssh \
    git clone git@github.com:acme/private-lib.git
```

```bash
docker buildx build --ssh default -t app .
```

Use SSH agent for private git access during build.

## Image scanning

### Docker Scout (built-in)

```bash
# Scan local image
docker scout cves myapp:v1.0

# Quick view
docker scout quickview myapp:v1.0

# Compare vs base image
docker scout compare myapp:v1.0 --to myapp:v0.9

# Recommendations
docker scout recommendations myapp:v1.0
```

### Trivy

```bash
# Install
brew install aquasecurity/trivy/trivy
# Or via Docker
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy image myapp:v1.0

# Scan + SARIF output (cho CI)
trivy image --severity CRITICAL,HIGH \
    --format sarif --output trivy-report.sarif \
    myapp:v1.0

# Scan filesystem (pre-build)
trivy fs --severity CRITICAL,HIGH .

# Scan Kubernetes manifests
trivy config k8s-manifest.yaml

# Scan IaC (Terraform)
trivy config terraform/
```

### Grype + Syft

```bash
# Syft = generate SBOM (Software Bill of Materials)
syft myapp:v1.0 -o spdx-json > sbom.json

# Grype = scan vulnerabilities
grype myapp:v1.0
grype sbom:sbom.json     # Scan from SBOM
```

### Snyk

```bash
# Install
brew tap snyk/tap && brew install snyk

# Scan
snyk container test myapp:v1.0
snyk container monitor myapp:v1.0    # Continuous monitor
```

Commercial dashboard.

## SBOM + Provenance

### Generate at build

```bash
docker buildx build \
    --sbom=true \
    --provenance=mode=max \
    -t myregistry/app:v1 \
    --push .
```

`--sbom` = software components list.
`--provenance` = build attestation (who/where/how built).

Inspect:

```bash
docker buildx imagetools inspect myregistry/app:v1 --format '{{json .SBOM}}'
docker buildx imagetools inspect myregistry/app:v1 --format '{{json .Provenance}}'
```

### Sign image với cosign

```bash
# Generate keypair
cosign generate-key-pair

# Sign
cosign sign --key cosign.key myregistry/app:v1

# Verify
cosign verify --key cosign.pub myregistry/app:v1
```

Supply chain security: only deploy signed images.

K8s policy:

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-images
spec:
  rules:
    - name: verify-cosign
      match:
        resources:
          kinds: [Pod]
      verifyImages:
        - imageReferences:
            - "myregistry.com/*"
          attestors:
            - entries:
                - keys:
                    publicKeys: "ssh-rsa AAAA..."
```

Pod with unsigned image → reject.

## Rootless Docker

Run Docker without root (security):

```bash
# Install
dockerd-rootless-setuptool.sh install

# Configure
systemctl --user enable docker
loginctl enable-linger $USER

# Use
docker run hello-world
```

Slightly slower, some network limits, but much safer.

## Podman — Docker alternative

Drop-in replacement, daemonless:

```bash
podman run hello-world
podman pull alpine
podman build -t myapp .

# Compose-compatible
podman-compose up -d

# Pod (multi-container)
podman pod create --name vprofile
podman run -d --pod vprofile --name db mariadb
podman run -d --pod vprofile --name app my-app
```

Pros: rootless default, no daemon, K8s YAML support.

RedHat default container engine.

## Best practices summary

### Dockerfile

- Multi-stage build.
- Layer order (ít đổi → nhiều đổi).
- `--no-install-recommends` + cleanup.
- Non-root user.
- HEALTHCHECK.
- Exec form CMD.
- Pin base image SHA digest.

### Build

- Buildx multi-platform.
- Cache mounts (deps, build).
- Secret mounts (npm token, SSH).
- SBOM + Provenance.
- Sign with cosign.

### Registry

- Scan on push (ECR scan, Docker Scout).
- Cleanup old images (lifecycle policy).
- Pull-through cache (no rate limit).
- Private repository default.

### Deploy

- Pin version (not :latest).
- Resource limits.
- Readiness/liveness probe.
- Verify signature before deploy.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `apt install` no `-y` | Build hang waiting input | Always `-y` |
| Copy `.git` | Image size + secret leak | `.dockerignore` |
| Multi-arch không buildx | Wrong arch | Use `--platform` |
| Cache không persist | Build slow | Cache mount |
| `latest` tag | Reproducibility | Pin SHA digest |
| Scan only on registry | Late find vuln | Scan pre-push |
| Sign optional | Supply chain attack | Mandatory cosign |
| Root container | Privilege escalation | USER 1000 |

## Tóm tắt bài 3

- **Swarm** simple cluster, less features than K8s.
- **Buildx** multi-platform + cache backends (local, gha, registry, s3).
- **Bake** group multiple builds with shared config.
- **Cache mounts + secret mounts + SSH mounts** in Dockerfile.
- **Docker Scout** built-in scan; **Trivy/Grype/Snyk** alternatives.
- **SBOM + Provenance + cosign** supply chain security.
- **Rootless Docker** + **Podman** modern alternatives.

**Phase kế tiếp** → [Phase 28 — Containerization](../phase-28-containerization/01-containerization.md)

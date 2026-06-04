# Bài 3: Docker Swarm, Buildx, security scanning

Bài cuối phase 27. Multi-host orchestration, build nâng cao, image security.

## Docker Swarm

Cluster mode native của Docker. Đơn giản hơn K8s, nhưng ít feature hơn.

### Init swarm

```bash
# Trên manager node
docker swarm init --advertise-addr 10.0.0.10

# Output:
docker swarm join --token SWMTKN-1-xxx 10.0.0.10:2377

# Chạy lệnh trên trên các worker node để join
```

```bash
docker node ls
# ID        STATUS  AVAILABILITY  MANAGER STATUS
# xxx       Ready   Active        Leader
# yyy       Ready   Active
# zzz       Ready   Active
```

### Deploy stack

`docker-stack.yml` (subset của Compose):

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

# Rollback về version trước
docker service rollback vprofile_web
```

### Secrets trong Swarm

```bash
echo "MySecret123" | docker secret create db_password -

docker service create \
    --name app \
    --secret db_password \
    -e DB_PASSWORD_FILE=/run/secrets/db_password \
    my-app
```

Secret được encrypt at rest trong Raft store, chỉ có sẵn ở những node thực sự cần.

### Swarm vs K8s

| | Swarm | K8s |
|---|---|---|
| Setup | 1 command | Phức tạp |
| Learning curve | Thấp | Cao |
| Feature | Cơ bản | Toàn diện |
| Community | Đang giảm | Khổng lồ |
| Production | Small-medium | Mọi quy mô |

Modern khuyến nghị K8s. Swarm vẫn OK cho team nhỏ không cần feature K8s.

## Buildx — Modern build (Build hiện đại)

### Multi-platform build (Build cho nhiều kiến trúc CPU)

```bash
# Setup builder (chỉ làm 1 lần)
docker buildx create --name multibuilder --use --bootstrap

# Build cho cả amd64 + arm64
docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t myregistry/app:v1 \
    --push .
```

1 command build cho cả x86 + ARM (Mac M1, AWS Graviton, Raspberry Pi).

### Cache backends (Nơi lưu cache)

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

`mode=max` = cache tất cả layer (vs `min` = chỉ final).

### Bake — Hybrid Dockerfile + Compose

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
  inherits = ["app"]      # Kế thừa settings từ target "app"
}
```

```bash
docker buildx bake --push
# Build cả 3 target song song
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

Cache persist giữa các build. Build Go app: lần đầu 60s, lần sau 5s.

### Secret mount (Mount secret tạm thời lúc build)

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

Credential private npm registry **không bao giờ end up trong image layer** — chỉ tồn tại trong RAM lúc RUN.

### SSH mount (Mount SSH agent lúc build)

```dockerfile
# syntax=docker/dockerfile:1.6

FROM golang:1.22
RUN --mount=type=ssh \
    git clone git@github.com:acme/private-lib.git
```

```bash
docker buildx build --ssh default -t app .
```

Dùng SSH agent để access private git repo trong lúc build.

## Image scanning

### Docker Scout (built-in)

```bash
# Scan local image
docker scout cves myapp:v1.0

# Quick view (tổng quan)
docker scout quickview myapp:v1.0

# So sánh với base image
docker scout compare myapp:v1.0 --to myapp:v0.9

# Recommendations (gợi ý fix)
docker scout recommendations myapp:v1.0
```

### Trivy

```bash
# Cài đặt
brew install aquasecurity/trivy/trivy
# Hoặc qua Docker
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy image myapp:v1.0

# Scan + xuất SARIF (cho CI)
trivy image --severity CRITICAL,HIGH \
    --format sarif --output trivy-report.sarif \
    myapp:v1.0

# Scan filesystem (trước khi build)
trivy fs --severity CRITICAL,HIGH .

# Scan Kubernetes manifest
trivy config k8s-manifest.yaml

# Scan IaC (Terraform)
trivy config terraform/
```

### Grype + Syft (Anchore)

```bash
# Syft = generate SBOM (Software Bill of Materials)
syft myapp:v1.0 -o spdx-json > sbom.json

# Grype = scan vulnerability
grype myapp:v1.0
grype sbom:sbom.json     # Scan trực tiếp từ SBOM
```

### Snyk

```bash
# Cài đặt
brew tap snyk/tap && brew install snyk

# Scan
snyk container test myapp:v1.0
snyk container monitor myapp:v1.0    # Monitor liên tục
```

Commercial product với dashboard riêng.

## SBOM + Provenance (Bằng chứng nguồn gốc)

### Generate khi build

```bash
docker buildx build \
    --sbom=true \
    --provenance=mode=max \
    -t myregistry/app:v1 \
    --push .
```

- `--sbom` = liệt kê software component có trong image.
- `--provenance` = build attestation (ai/ở đâu/như thế nào build).

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

Supply chain security: chỉ deploy image đã được sign.

K8s policy enforce:

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

Pod dùng image chưa sign → reject.

## Rootless Docker (Chạy Docker không cần root)

Tăng bảo mật bằng cách chạy Docker daemon dưới user thường:

```bash
# Cài đặt
dockerd-rootless-setuptool.sh install

# Cấu hình
systemctl --user enable docker
loginctl enable-linger $USER

# Sử dụng bình thường
docker run hello-world
```

Hơi chậm hơn một chút, một số network bị giới hạn, nhưng **an toàn hơn nhiều**.

## Podman — Alternative cho Docker

Drop-in replacement, không cần daemon:

```bash
podman run hello-world
podman pull alpine
podman build -t myapp .

# Tương thích Compose
podman-compose up -d

# Pod (multi-container — giống K8s Pod)
podman pod create --name vprofile
podman run -d --pod vprofile --name db mariadb
podman run -d --pod vprofile --name app my-app
```

Ưu điểm: rootless mặc định, không daemon, hỗ trợ K8s YAML.

Đây là container engine mặc định của RedHat.

## Best practices summary

### Dockerfile

- Multi-stage build.
- Order layer (ít đổi → nhiều đổi).
- `--no-install-recommends` + cleanup.
- Non-root user.
- HEALTHCHECK.
- Exec form CMD.
- Pin base image bằng SHA digest.

### Build

- Buildx multi-platform.
- Cache mount (cho dependency, build artifact).
- Secret mount (cho npm token, SSH key).
- SBOM + Provenance.
- Sign với cosign.

### Registry

- Scan khi push (ECR scan, Docker Scout).
- Cleanup image cũ (lifecycle policy).
- Pull-through cache (tránh rate limit).
- Private repository mặc định.

### Deploy

- Pin version cụ thể (không dùng `:latest`).
- Resource limit.
- Readiness/liveness probe.
- Verify signature trước khi deploy.

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| `apt install` thiếu `-y` | Build treo chờ input | Luôn dùng `-y` |
| Copy `.git` vào image | Image lớn + lộ secret | Dùng `.dockerignore` |
| Multi-arch không dùng buildx | Sai architecture | Dùng `--platform` |
| Cache không persist | Build chậm | Dùng cache mount |
| Tag `latest` | Không reproducible | Pin SHA digest |
| Scan chỉ trên registry | Phát hiện vuln muộn | Scan trước khi push |
| Sign optional | Supply chain attack | Cosign bắt buộc |
| Container chạy root | Privilege escalation | `USER 1000` |

## Tóm tắt bài 3

- **Swarm** cluster đơn giản, ít feature hơn K8s.
- **Buildx** multi-platform + nhiều cache backend (local, gha, registry, s3).
- **Bake** group nhiều build với shared config.
- **Cache mount + secret mount + SSH mount** trong Dockerfile.
- **Docker Scout** built-in scan; **Trivy/Grype/Snyk** alternative.
- **SBOM + Provenance + cosign** supply chain security.
- **Rootless Docker** + **Podman** = modern alternative an toàn hơn.

**Phase kế tiếp** → [Phase 28 — Containerization](../phase-28-containerization/01-containerization.md)

# Bài 2: Containers — package microservice một lần, chạy mọi nơi

"Works on my machine" — classic dev excuse. Trong microservices, parity giữa dev/staging/prod là **mandatory**. VM giải nhưng quá nặng. **Container** = giải pháp ưu việt.

Bài này: tại sao container thắng VM cho microservices, lợi ích production, và 1 challenge lớn (cần orchestration — bài tiếp).

## Vấn đề: dev-prod parity

```text
Dev:
  - Laptop macOS Sonoma.
  - Postgres 14 local, single instance.
  - Node 18.10 via brew.
  - Config in /Users/dev/config.json.
  - Test passes ✓.

Prod:
  - Ubuntu 22.04.
  - Postgres 16 RDS cluster.
  - Node 18.17 via apt.
  - Config in /etc/app/config.json.
  - Deploy → break.
```

Differences:
- OS (Mac vs Linux).
- DB version + topology (single vs cluster).
- Runtime version subtle differences.
- Config file paths.
- Filesystem permissions.
- Environment variables.

Result: bug visible only in prod. Stress.

## Failed solution 1: VM trên laptop

```text
Run Linux VM on Mac via VirtualBox/Parallels.
Install Postgres 16 + Node 18.17 + app.
→ Dev environment matches prod.
```

Vấn đề:

```text
Mac laptop:
  +─────────────────────────────────+
  │ macOS (host)                     │
  │ ┌─────────────────────────────┐ │
  │ │ Hypervisor (VirtualBox)     │ │
  │ │ ┌─────────────────────────┐ │ │
  │ │ │ Guest OS: Ubuntu        │ │ │
  │ │ │ - Full kernel           │ │ │
  │ │ │ - All system processes  │ │ │
  │ │ │ - Postgres + Node + app │ │ │
  │ │ │ Uses 2GB RAM, 4 CPU     │ │ │
  │ │ └─────────────────────────┘ │ │
  │ └─────────────────────────────┘ │
  +─────────────────────────────────+
```

Overhead lớn:
- Full OS kernel duplicate.
- Hypervisor consumes CPU/RAM.
- 1 VM = 2-4 GB RAM minimum.
- Boot time: 30-60 giây.

For 10 microservices = 10 VMs = 20-40 GB RAM. Laptop dies.

## Container = isolated app + shared kernel

> **Container** = package code + dependencies + runtime config trong **isolated layer trên top of host kernel**. Không có duplicate kernel.

```text
Single Linux host (laptop or server):
  +─────────────────────────────────────────+
  │ Host OS (Linux kernel — SHARED)         │
  │ ┌────────────┐ ┌────────────┐ ┌────────┐│
  │ │ Container1 │ │ Container2 │ │ Cont 3 ││
  │ │ Service A  │ │ Postgres   │ │ Service││
  │ │ +deps      │ │ +deps      │ │ B +deps││
  │ │ own FS,    │ │ own FS,    │ │ own FS,││
  │ │ network    │ │ network    │ │ network││
  │ └────────────┘ └────────────┘ └────────┘│
  +─────────────────────────────────────────+
```

Kernel shared. Each container has isolated:
- **Filesystem** (chroot-like).
- **Network namespace** (own IP).
- **Process namespace** (PID 1 inside).
- **User namespace** (UID mapping).
- **cgroups** (CPU/memory limits).

OS kernel features (namespaces + cgroups) make isolation efficient.

### Container vs VM diagram

```text
VM:                              Container:

App                              App
Bins/Libs                        Bins/Libs
Guest OS (full)                  Container runtime
Hypervisor
Host OS                          Host OS (kernel shared)
Hardware                         Hardware

VM = duplicate OS, heavy.        Container = thin layer, light.
```

### Numbers

| Aspect | VM | Container |
|---|---|---|
| Boot time | 30-60s | < 1s (often ms) |
| Disk image | 1-10 GB | 50-500 MB |
| RAM overhead | 1-2 GB / VM | 5-50 MB / container |
| Density | 5-10 / host | 50-200 / host |

For microservice fleet → container wins on every dimension.

## Docker — de facto container tech

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 8080
CMD ["node", "server.js"]
```

```bash
# Build
docker build -t my-service:v1.0 .

# Run
docker run -p 8080:8080 my-service:v1.0
```

Image = template. Container = running instance.

### Layers + caching

Docker images = stack of layers. Each `RUN`, `COPY` = new layer.

```text
Layer 5: COPY . .                    (your code, changes often)
Layer 4: RUN npm ci                  (deps, changes occasionally)
Layer 3: COPY package*.json ./       (lock file)
Layer 2: WORKDIR /app
Layer 1: FROM node:18-alpine         (base image, cached)
```

Layers immutable. Change code → only top layer rebuild. Build = fast.

### Multi-stage build

Production image lean:

```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/server.js"]
```

Final image: chỉ runtime + built artifacts. No source, no dev deps. 200 MB → 80 MB.

## Container registries

Store images centrally:

| Registry | Note |
|---|---|
| **Docker Hub** | Public default |
| **AWS ECR** | AWS managed |
| **Google Container Registry / Artifact Registry** | GCP |
| **Azure Container Registry** | Azure |
| **GitHub Packages** | Tied to GitHub |
| **Harbor** | Self-hosted OSS |
| **Quay** | Red Hat |

```bash
docker tag my-service:v1.0 registry.acme.com/my-service:v1.0
docker push registry.acme.com/my-service:v1.0

# On any machine:
docker pull registry.acme.com/my-service:v1.0
docker run registry.acme.com/my-service:v1.0
```

Build once, deploy anywhere.

## Benefits cho dev/test

### Dev environment parity

```yaml
# docker-compose.yml
services:
  app:
    image: my-service:dev
    build: .
    ports: ["8080:8080"]
    environment:
      DATABASE_URL: postgres://postgres@db:5432/app
  
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: dev
  
  kafka:
    image: confluentinc/cp-kafka:7.5.0
    # ...
```

```bash
docker-compose up
# → app + Postgres 16 + Kafka all running locally.
# Exact same images as prod.
```

10 containers = 100MB RAM each = 1GB total. Manageable on laptop.

### CI pipeline

```yaml
# .github/workflows/ci.yml
- name: Build image
  run: docker build -t my-service:${{ github.sha }} .
- name: Run tests
  run: docker run my-service:${{ github.sha }} npm test
- name: Push
  run: docker push registry.acme.com/my-service:${{ github.sha }}
```

CI uses same image. No "works in CI but not local" mystery.

## Benefits cho production

### Benefit 1: Portability + no vendor lock-in

```text
Build image once.
Run on:
- AWS EC2.
- GCP Compute Engine.
- Azure VM.
- DigitalOcean.
- On-premise.
- Dev laptop.

Multi-cloud / hybrid cloud = trivial.
```

VM images (AMI, GCE image) are cloud-specific. Container image = universal.

### Benefit 2: Faster startup

```text
VM boot: 30-60s.
Container start: < 1s.

Implication for autoscaling:
  Traffic spike → spin new instance:
  - VM: takes 30-60s → some requests fail during ramp-up.
  - Container: < 1s → smooth scaling.

Implication for rolling deploy:
  - VM: 50 instances × 60s = 50 min rollout.
  - Container: 50 × 1s = 50s rollout.
```

### Benefit 3: Hardware utilization

VM model: 1 microservice / VM. Each VM has OS overhead.

Container model: many containers / host.

```text
Server with 16 cores / 64 GB RAM:
  VM approach: 8 VMs × 8 GB RAM = 4 VMs (after OS overhead).
  Container approach: 30-50 containers comfortably.
```

→ For same hardware, **3-10× more service instances**.

→ Lower infrastructure cost.

### Benefit 4: Easy CI/CD

Image built in CI. Same artifact runs in staging + prod. Immutable. Reproducible.

## Challenges in production

### Challenge: Manual management impossible at scale

10 containers on 1 host = OK manually.

100 microservices × 5 instances = 500 containers across N hosts.

Need to handle:
- **Scheduling**: which container runs on which host?
- **Service discovery**: how does container A find container B?
- **Load balancing** across instances.
- **Health checks** + restart on crash.
- **Rolling updates** (new version without downtime).
- **Auto-scaling** (more instances during spike).
- **Resource limits** (don't let 1 container hog host).
- **Networking** (container-to-container, container-to-external).
- **Secrets management** (DB passwords, API keys).
- **Persistent storage** (containers ephemeral by default).
- **Logging aggregation**.

Doing manually for 500 containers = impossible.

**Solution**: container orchestration platform — bài tiếp (Kubernetes).

## Container ecosystem

| Component | Purpose | Examples |
|---|---|---|
| **Container runtime** | Run containers | Docker, containerd, CRI-O |
| **Image registry** | Store images | Docker Hub, ECR, Harbor |
| **Orchestrator** | Manage many containers | Kubernetes, ECS, Nomad |
| **Service mesh** | Inter-service networking | Istio, Linkerd, Consul Connect |
| **Build tools** | Build images | Docker, Kaniko, Buildpacks |
| **Security scanning** | Vulnerability detection | Trivy, Clair, Snyk |

## Image best practices

### Use specific tags, not `latest`

```dockerfile
FROM node:18-alpine   ✓
FROM node:latest      ✗ (non-reproducible)
```

### Smallest base image

```text
node:18           — 1 GB
node:18-slim      — 250 MB
node:18-alpine    — 50 MB (musl libc, smaller but quirks)
distroless        — 20 MB (no shell, no package manager — secure)
```

### Don't run as root

```dockerfile
RUN useradd -m -u 1000 app
USER app
CMD ["node", "server.js"]
```

Containers nested as root → host root if escape. Run as non-root.

### Health check inside image

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1
```

Orchestrator uses to know if container alive.

### Minimal attack surface

Don't install ssh, debugging tools in prod images. Strip dev dependencies.

### Scan for CVEs

```bash
trivy image my-service:v1.0
# Reports known vulnerabilities in base + deps.
```

Block deploy if critical CVE.

## Anti-patterns

### Stateful container without persistent volume

```text
Container restart → data inside container = gone.
Don't store DB data inside container filesystem.
Use mounted persistent volume (PV).
```

### Logging to file inside container

```text
Container logs to /var/log/app.log inside container.
Container killed → logs lost.
Best practice: log to stdout/stderr → orchestrator collect.
```

### Huge images

```text
Image 5 GB → slow pull → slow scaling.
Multi-stage build, minimal base, .dockerignore → small images.
```

### Running 1 container with multiple processes

```text
1 container running app + cron + cleanup script + ...
Hard to monitor, debug, scale independently.
Better: 1 process per container. Multiple containers if needed.
```

## Tóm tắt bài 2

- Containers solve **dev-prod parity** + heavy VM overhead.
- VM = full OS duplicate per instance. Container = isolated app, shared kernel.
- Container numbers: < 1s start, 50-500 MB image, 5-50 MB RAM overhead.
- **Docker** = de facto. Dockerfile → image → registry → run anywhere.
- Production benefits: **portability** (no vendor lock-in), **fast startup** (autoscaling smooth), **3-10× density** (lower cost), **immutable artifacts** (reproducible deploy).
- Challenge: 500+ containers cannot be managed manually → need **orchestrator** (next lesson).
- Image best practices: specific tags, minimal base, non-root, healthcheck, CVE scan.
- Anti-patterns: stateful without PV, log to file, huge images, multi-process per container.

**Bài kế tiếp** → [Bài 3: Container orchestration + Kubernetes](03-kubernetes.md)

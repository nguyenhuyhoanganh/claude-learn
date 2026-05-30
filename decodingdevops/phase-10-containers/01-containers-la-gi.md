# Bài 1: Containers là gì? Khác biệt với VM

Containers là **công nghệ deploy quan trọng nhất 2015-2026**. Docker, Kubernetes — đều container. Bài này giải thích từ gốc.

## Vấn đề "It works on my machine"

```text
Dev:    "App chạy ngon trên laptop tôi!"
Ops:    "Server staging fail. Python 3.9 thay 3.11. Missing lib X."
Dev:    "Sao lại thiếu? Tôi cài rồi."
Ops:    "..."
```

Đây là **dependency hell**. Mỗi server có:
- OS version khác.
- Library version khác.
- Config khác.

App chạy dev = chạy prod là **may mắn**, không phải guarantee.

## Container — package mọi thứ

> **Container** = đóng gói **app + dependencies + config + runtime** vào 1 đơn vị standalone, chạy giống nhau **mọi nơi**.

```text
+──────────────────────────────────+
│         Container                │
│  +─────────────────────────+    │
│  │  App (Tomcat + .war)    │    │
│  +─────────────────────────+    │
│  │  Runtime (JDK 17)       │    │
│  +─────────────────────────+    │
│  │  Libs (libc, openssl)   │    │
│  +─────────────────────────+    │
│  │  Config files           │    │
│  +─────────────────────────+    │
+──────────────────────────────────+
```

Chạy container trên Linux host → app behavior **identical** giữa laptop dev, CI runner, staging, production.

## Container vs VM

Cùng goal: isolation. Khác cách:

```text
VM:
+────────+ +────────+ +────────+
│  App   │ │  App   │ │  App   │
│  Libs  │ │  Libs  │ │  Libs  │
│ Guest  │ │ Guest  │ │ Guest  │
│  OS    │ │  OS    │ │  OS    │  ← Full OS mỗi VM
+────────+ +────────+ +────────+
│       Hypervisor              │
+───────────────────────────────+
│       Host OS                 │
+───────────────────────────────+
│       Hardware                │
+───────────────────────────────+


Container:
+────────+ +────────+ +────────+
│  App   │ │  App   │ │  App   │
│  Libs  │ │  Libs  │ │  Libs  │  ← Không có OS riêng
+────────+ +────────+ +────────+
│  Container Engine (Docker)    │
+───────────────────────────────+
│  Host OS (Linux kernel)       │  ← Share kernel
+───────────────────────────────+
│  Hardware                     │
+───────────────────────────────+
```

| | VM | Container |
|---|---|---|
| Boot time | Phút | **Giây** |
| Disk size | GB | MB |
| RAM overhead | GB | MB |
| Isolation | Mạnh (OS riêng) | Yếu hơn (share kernel) |
| Run different OS | ✓ | ✗ (Linux container chỉ chạy trên Linux kernel) |
| Density per host | 10-50 | **100-1000** |
| Use case | Multi-tenant, full OS | Microservice, scale fast |

Hệ quả: container **nhẹ hơn 10-100x** VM.

## Bên trong container — Linux features

Container **không phải magic** — chỉ là quá trình Linux dùng 3 feature kernel:

### 1. Namespaces — isolation

Mỗi container có "view" riêng:

| Namespace | Isolate |
|---|---|
| **PID** | Process ID — container thấy PID 1 là init của nó |
| **Net** | Network interface, IP, route |
| **Mount** | Filesystem |
| **UTS** | Hostname |
| **IPC** | Inter-process communication |
| **User** | UID/GID mapping |
| **Cgroup** | Cgroup hierarchy |

Container `A` không thấy process container `B`, dù chạy cùng host.

### 2. cgroups — resource control

**Control groups** limit tài nguyên:

```bash
# Container A: max 512 MB RAM, 50% 1 CPU
# Container B: max 1 GB RAM, 100% 1 CPU
```

Host phân tài nguyên fairly, ngăn container "ăn" hết.

### 3. Union filesystem

Container image gồm **layers** chồng lên:

```text
Layer 4: App code (50 MB)
Layer 3: pip install (200 MB)
Layer 2: python3 install (40 MB)
Layer 1: Ubuntu 22.04 base (30 MB)
─────────────────────────────────
Total image: 320 MB
```

Layer immutable, chia sẻ giữa các container. Container thứ 2 dùng cùng base Ubuntu → chỉ tải 1 lần.

Tool: **OverlayFS**, **AUFS**, **Btrfs**.

## Image vs Container

| Khái niệm | Tương đương |
|---|---|
| **Image** | "Blueprint" — file đọc-only | Class trong OOP |
| **Container** | "Instance" — running từ image | Object trong OOP |

```bash
# Pull image (download)
docker pull nginx:1.25

# Run container (instance từ image)
docker run nginx:1.25

# Có thể run nhiều container từ 1 image
docker run nginx:1.25      # Container A
docker run nginx:1.25      # Container B
docker run nginx:1.25      # Container C
```

3 container, dùng chung 1 image trên disk.

## Container registry — kho image

Image **publish** lên **registry** (giống GitHub cho code):

| Registry | URL |
|---|---|
| **Docker Hub** | hub.docker.com |
| **GitHub Container Registry (GHCR)** | ghcr.io |
| **AWS ECR** | account.dkr.ecr.region.amazonaws.com |
| **Google Artifact Registry** | gcr.io / asia-docker.pkg.dev |
| **Harbor** | Self-host |
| **Quay** | quay.io (RedHat) |

```bash
docker pull nginx:1.25                       # Docker Hub default
docker pull ghcr.io/owner/image:tag
docker pull 123.dkr.ecr.us-east-1.amazonaws.com/app:v1
```

## Container = process

Khái niệm cực quan trọng: **container == process**.

Khi `docker run nginx`:
1. Docker tạo namespace mới.
2. Docker mount image layers.
3. Docker exec process `nginx` trong namespace đó.
4. Bạn nhìn từ host: chỉ là process nginx thường, có namespace gắn.

`docker stop` = SIGTERM cho process đó. Không "tắt VM".

Hệ quả:
- Container không có **systemd** mặc định. Chỉ 1 process foreground.
- App phải log ra **stdout/stderr** (Docker capture, không phải `/var/log/`).
- Restart container = restart process, KHÔNG phải reboot OS.

## Lịch sử container

```text
1979: Unix chroot          — Đầu tiên isolate filesystem.
2000: FreeBSD Jails        — Process + filesystem isolation.
2002: Linux namespaces     — Bắt đầu add vào kernel.
2007: cgroups              — Google add resource control.
2008: LXC (Linux Containers) — Tool đầu tiên dễ dùng.
2013: Docker               — Wrap LXC + image format → boom.
2015: Open Container Initiative (OCI) — Standardize format.
2016: containerd, runc     — Modular Docker.
2017: Kubernetes mainstream — Orchestration standard.
2020: Podman, Buildah      — Daemonless alternative.
```

Docker = popularize container, không phải invent. Concept có từ 1979.

## Container use cases

### 1. Microservices

App lớn → tách thành nhiều service nhỏ, mỗi service = 1 container. Scale độc lập.

### 2. CI/CD

Build/test trong container clean mỗi lần → reproducible.

### 3. Local dev

Database, cache, mock service chạy container — không cài bừa máy.

### 4. Multi-tenant SaaS

Mỗi customer 1 container — isolated, resource-limited.

### 5. Batch job / serverless

AWS Lambda, GCP Cloud Run dùng container under the hood.

## Container không thay thế VM

| | Container | VM |
|---|---|---|
| Cùng OS family | ✓ | ✓ |
| Cross OS (Linux + Windows) | ✗ | ✓ |
| Full isolation | Trung bình | Mạnh |
| Boot time | Giây | Phút |
| Density | 1000+ per host | 10-50 |

Production thường **VM trong cloud chạy container**:
- EC2 instance (VM) → ECS/EKS task (container).
- GCP Compute Engine (VM) → GKE pod (container).

## Trade-off của container

### Pros
- Lightweight, density cao.
- Boot nhanh.
- Portable across env.
- Image versioning với tag.
- Ecosystem khổng lồ.

### Cons
- Share kernel → security boundary yếu hơn VM.
- Linux container không chạy Windows app native.
- Persistent storage cần volume riêng.
- Networking phức tạp hơn.
- Stateful workload (DB) khó hơn stateless.

### Khi nào KHÔNG dùng container?
- App cần access hardware đặc biệt (GPU passthrough phức tạp).
- Compliance yêu cầu kernel-level isolation.
- Legacy app monolith không refactor được.
- DB stateful cần performance peak (consider VM/bare-metal).

## Bonus — Kata Containers, Firecracker

Hybrid container + lightweight VM:
- **Kata Containers**: container chạy trong micro-VM riêng → mạnh isolation.
- **Firecracker** (AWS): VMM siêu nhẹ cho Lambda, ECS Fargate.

Lý do: cloud cần multi-tenant + security mạnh hơn container thường.

## Bẫy thường gặp với container

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Run `systemd` trong container | Anti-pattern | 1 process / container |
| Lưu data trong container | Mất khi container restart | Volume mount |
| Log vào file trong container | Khó access | Log stdout/stderr |
| Cài quá nhiều trong base | Image phình | Multi-stage build, alpine |
| Run as root | Security risk | Define `USER` non-root |
| Latest tag mãi | Bug reproduce khó | Pin version chính xác |
| Build cache không hiệu quả | Build chậm | Order layers từ ít đổi → nhiều đổi |
| Bind port host quá nhiều | Conflict | Dùng orchestrator gán port |

## Tóm tắt bài 1

- **Container** = đóng gói app + deps + runtime + config thành 1 đơn vị portable.
- Không phải VM — share **kernel** Linux host, chỉ isolate qua **namespaces + cgroups + union filesystem**.
- **Image** = blueprint, **container** = instance.
- **Registry** = kho image (Docker Hub, ECR, GHCR).
- Container = process Linux thường, chỉ thêm namespace.
- Use cases: microservices, CI/CD, local dev, multi-tenant.
- Container **bổ sung**, không thay thế VM. Production thường VM chạy container.

**Bài kế tiếp** → [Bài 2: Docker overview — engine, image, registry](02-docker-la-gi.md)

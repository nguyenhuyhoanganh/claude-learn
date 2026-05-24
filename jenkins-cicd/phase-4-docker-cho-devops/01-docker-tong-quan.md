# Bài 1: Docker tổng quan cho DevOps

3 phase trước đã **dùng** Docker (chỉ định image trong `agent { docker { image '...' } }`). Phase 4 đi sâu: hiểu Docker, **tự viết Dockerfile**, build và push image, dùng image tự build trong pipeline.

Đây là chuẩn bị cho Phase 6 — deploy container production lên AWS ECS.

## Vì sao Docker quan trọng cho DevOps?

### Bối cảnh: từ monolith → microservices

Trước 2010, software thường là **monolith** — toàn bộ code trong 1 codebase, deploy như 1 khối:

```text
┌─────────────────────────────────────┐
│       Monolithic Application         │
│  ┌─────────┐  ┌─────────┐           │
│  │  Users   │  │  Orders │           │
│  ├─────────┤  ├─────────┤           │
│  │ Catalog  │  │ Payments│           │
│  └─────────┘  └─────────┘           │
│  ┌──────────────────────┐           │
│  │  Shared database     │           │
│  └──────────────────────┘           │
└─────────────────────────────────────┘
```

Vấn đề:
- Code khổng lồ, thay đổi 1 dòng phải re-deploy cả khối.
- Release cycle 1-3 tháng.
- 1 module crash → cả app crash.

Hiện đại: **microservices** — chia thành các service nhỏ độc lập, mỗi service có codebase, deploy, database riêng:

```text
┌────────────┐  ┌────────────┐  ┌────────────┐
│   Users    │  │  Orders    │  │  Catalog   │
│  Service   │  │  Service   │  │  Service   │
│  (Node.js) │  │  (Python)  │  │   (Java)   │
└────────────┘  └────────────┘  └────────────┘
       ↕            ↕                 ↕
  ─────────────────────────────────────── 
              API Gateway
```

Lợi ích: scale từng service riêng, dùng ngôn ngữ phù hợp từng service, release độc lập, fault isolation.

**Vấn đề mới**:
- Mỗi service có **runtime khác nhau** (Node 18, Python 3.11, Java 17, Go 1.21...).
- Server vật lý không thể có **mọi version** của mọi runtime.
- Conflicts: Node 18 và Node 20 không cùng sống trên 1 máy dễ dàng.

→ Cần cách **gói gọn từng service + runtime của nó**. **Docker giải bài toán này**.

### Virtual Machines: trước Docker

Virtual Machine (VM) là **máy tính ảo trong máy tính thật**. Mỗi VM có OS riêng, dedicated CPU + RAM + Disk:

```text
┌─────────────────────────────────────────────┐
│           Physical Server (Host)             │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   VM 1   │  │   VM 2   │  │   VM 3   │  │
│  │          │  │          │  │          │  │
│  │ Ubuntu   │  │ CentOS   │  │ Windows  │  │
│  │          │  │          │  │          │  │
│  │ Node 18  │  │ Python   │  │   .NET   │  │
│  │   App    │  │   App    │  │   App    │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│  └─────── Hypervisor (VMware, KVM) ─────┘  │
│  ┌────────── Host OS (Linux) ───────────┐  │
└─────────────────────────────────────────────┘
```

**Ưu**: cách ly hoàn toàn, mỗi VM tự do làm gì cũng được.

**Nhược**:
- Mỗi VM = 1 OS đầy đủ → tốn vài GB ổ đĩa, vài GB RAM khi chạy.
- Boot lâu (vài chục giây).
- Server vật lý 32 GB chỉ chạy được ~10 VM → đắt.
- Quản lý phức tạp (patch OS, update kernel...).

### Container: cách ly nhẹ hơn

**Container** = process bị **cô lập** ở mức OS bằng kernel feature (Linux namespaces + cgroups). Không có OS riêng — share kernel với host:

```text
┌─────────────────────────────────────────────┐
│           Physical Server (Host)             │
│                                              │
│  ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐   │
│  │ Cntr1 │ │ Cntr2 │ │ Cntr3 │ │ Cntr4 │   │
│  │       │ │       │ │       │ │       │   │
│  │ Node  │ │Python │ │ Java  │ │  Go   │   │
│  │  App  │ │  App  │ │  App  │ │  App  │   │
│  └───────┘ └───────┘ └───────┘ └───────┘   │
│  └────────── Docker Engine ─────────────┐  │
│  ┌────────── Host OS (Linux) ───────────┐  │
└─────────────────────────────────────────────┘
```

**Ưu so với VM**:
- Không có OS riêng → mỗi container ~10-100 MB (vs vài GB).
- Boot trong **mili-giây** (vs giây).
- Server 32 GB chạy 500+ container thoải mái.
- File configuration dạng text → versioning được.

**Trade-off**: ít cô lập hơn VM (share kernel). Nhưng đủ cho 99% use case.

### So sánh nhanh

| Aspect              | VM                          | Container                   |
|---------------------|----------------------------|----------------------------|
| OS                  | OS riêng (full)             | Share kernel với host       |
| Size                | GB                          | MB                          |
| Boot time           | giây / chục giây            | mili-giây                   |
| Density (per host)  | ~10                          | hàng trăm — nghìn           |
| Isolation           | Mạnh nhất                    | Mạnh, đủ dùng               |
| Use case            | Multi-tenant, OS khác       | Microservices, dev env      |

→ Hai công nghệ **không thay thế** — thường dùng cùng nhau: VM để chia hardware cho team, container chạy app bên trong VM.

## Docker = container + tools

**Container** là khái niệm Linux. **Docker** là **set tools** giúp container dễ dùng:

- **Docker Engine** — runtime chạy container.
- **Docker CLI** — `docker run`, `docker build`, `docker push`.
- **Docker Hub** — registry chia sẻ image public.
- **Docker Compose** — chạy nhiều container cùng nhau (như Jenkins setup ở Phase 1).
- **Docker Desktop** — UI cho Mac/Windows.

Container technology trước Docker tồn tại từ 2008 (LXC, Solaris Zones...) nhưng khó dùng. Docker (2013) đơn giản hoá nên phổ biến.

## Khái niệm cốt lõi

### Image vs Container

Hai khái niệm thường nhầm:

```text
┌──────────────────┐                ┌──────────────────┐
│     IMAGE        │   docker run   │    CONTAINER     │
│                  │ ─────────────► │                  │
│  • Blueprint     │                │  • Running app   │
│  • Read-only     │                │  • Has state     │
│  • Versioned     │                │  • Can crash     │
│  • Stored on disk│                │  • Has logs      │
└──────────────────┘                └──────────────────┘
       ↑
       │ docker build
       │
┌──────────────────┐
│   Dockerfile     │
│  (recipe)        │
└──────────────────┘
```

Ví von IKEA:
- **Dockerfile** = hướng dẫn lắp.
- **Image** = bộ ván + ốc vít.
- **Container** = bàn ghế đã lắp xong, đang dùng.

1 image → tạo được N container. Container chết, image vẫn còn.

### Registry

**Registry** = nơi lưu trữ image, share giữa các máy. Như GitHub cho code, registry cho image:

- **Docker Hub** (<https://hub.docker.com>) — public, default. Free tier không giới hạn.
- **GitHub Container Registry** — public/private.
- **AWS ECR** — private, AWS-managed (Phase 6 dùng).
- **Self-hosted** — Nexus, Harbor, GitLab Registry.

Lệnh:
- `docker pull <image>` — tải từ registry về local.
- `docker push <image>` — đẩy lên.
- `docker run` tự pull nếu local chưa có.

### Lifecycle

```text
Dockerfile     ──build──►   Image     ──run──►   Container
                              │                       │
                              │ push                  │ stop/rm
                              ▼                       ▼
                          Registry              (xoá process)
                              │
                              │ pull (máy khác)
                              ▼
                          Image
                              │
                              ▼
                          Container
```

## Trong khoá Jenkins, ta đã làm gì với Docker?

Tóm tắt Phase 1-3:

1. **Jenkins chạy bằng Docker** (`docker-compose up`).
2. **Mỗi stage dùng Docker image** làm build environment (`agent { docker { image '...' } }`).
3. **Jenkins gọi `docker run` ra host** (qua mount Docker socket).
4. **Workspace sync** giữa container và Jenkins (`reuseNode true`).

→ Tất cả đều **dùng image có sẵn** (`node:18-alpine`, `playwright:...`). Chưa tự build image bao giờ.

Phase 4 sẽ:
- **Bài 2**: chọn image phù hợp cho từng tech stack.
- **Bài 3**: viết Dockerfile build image riêng.
- **Bài 4**: dùng image tự build trong pipeline.
- **Bài 5**: nightly build image — tách khỏi main pipeline.
- **Bài 6**: cài Linux package trong Dockerfile.

## Một cảnh báo

Phase 4 chỉ là **giới thiệu**. Docker là chủ đề **lớn** — có thể học cả khoá riêng. Khoá này chỉ chạm:

- Dockerfile cơ bản (`FROM`, `RUN`).
- Build + push image cơ bản.
- Dùng image trong Jenkins.

**Không cover**:
- Multi-stage build (giảm size image).
- Volumes (lưu data persistent).
- Networking (container giao tiếp với nhau).
- Docker Compose advanced.
- Security scanning, signing.
- Container orchestration (Kubernetes — đề tài cả khoá riêng).

→ Khuyến khích bạn học thêm Docker sau Phase 4. Tài liệu official rất tốt: <https://docs.docker.com/get-started/>.

## Tóm tắt

- **Microservices** thay thế monolith → mỗi service có runtime khác → cần cách isolate runtime.
- **VM** isolate mạnh nhưng nặng. **Container** isolate đủ và nhẹ → phù hợp microservices.
- **Docker** = tools làm container dễ dùng (Engine + CLI + Hub + Compose + Desktop).
- **Image** = blueprint (read-only). **Container** = process đang chạy từ image.
- **Registry** = nơi lưu/chia sẻ image. Docker Hub default.
- Khoá Jenkins đã dùng image có sẵn ở Phase 1-3. Phase 4 tự build image.

---

→ [Bài tiếp theo: Chọn base image cho project](02-chon-base-image-cho-app.md)

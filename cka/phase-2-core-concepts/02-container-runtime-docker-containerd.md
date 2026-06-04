# Bài 2: Docker vs ContainerD — Vì sao Docker bị deprecated khỏi K8s

## Câu hỏi gây hoang mang nhất khi học K8s mới

> "Docker đã bị deprecated khỏi K8s rồi, vậy tôi vẫn cần học Docker không? Container của tôi build bằng `docker build` có còn chạy trên K8s mới được không?"

Câu trả lời ngắn: **Docker image vẫn chạy bình thường**. Docker bị remove khỏi K8s **với tư cách runtime**, không phải với tư cách build tool. Bài này giải thích đầy đủ vì sao có sự nhập nhằng này — và bạn nên dùng tool nào.

## Lịch sử: Vì sao K8s từng phụ thuộc Docker

```text
2013-2014: Container era bắt đầu
    └── Docker xuất hiện với UX cực dễ → thống trị thị trường
        Các runtime khác (rkt, lxc) lép vế

2014: K8s ra đời
    └── Được thiết kế chỉ để orchestrate Docker
        Code K8s gọi thẳng Docker API

2015-2016: K8s phổ biến
    └── Cộng đồng muốn dùng runtime khác (rkt, ...)
        K8s phải thay đổi
```

Vấn đề: K8s code có **lời gọi Docker API trực tiếp**. Muốn support runtime khác → phải viết lại nhiều chỗ. Không scale được.

## Giải pháp: CRI — Container Runtime Interface

K8s định nghĩa **chuẩn API** mà mọi runtime phải tuân thủ:

```text
┌──────────────────────┐
│      kubelet         │  Kubelet không quan tâm runtime cụ thể
└──────────┬───────────┘  → chỉ gọi qua chuẩn CRI
           │
           │ CRI gRPC interface
           │ (chuẩn)
           ▼
┌──────────────────────┐
│  Container Runtime   │  ↑ Bất cứ runtime nào implement CRI
│  (containerd, CRI-O, │    đều plug-in được
│   rkt, ...)          │
└──────────────────────┘
```

→ Từ K8s 1.5 (2016), **CRI** ra đời. Runtime muốn được K8s support thì phải implement CRI gRPC interface.

## OCI — Tiêu chuẩn khác liên quan

Đừng nhầm CRI với OCI:

| | CRI (Container Runtime Interface) | OCI (Open Container Initiative) |
|---|---|---|
| Ai định nghĩa | Kubernetes community | Linux Foundation (industry-wide) |
| Vai trò | API mà kubelet gọi runtime | Format image + runtime spec |
| Phạm vi | Chỉ K8s | Toàn ngành container |
| 2 spec | Chỉ 1 spec (API gRPC) | **Image spec** + **Runtime spec** |

**OCI Image Spec**: Định nghĩa cấu trúc của một container image (layers, manifest, config). Mọi image bạn build bằng `docker build` đều tuân OCI Image Spec → chạy được mọi nơi.

**OCI Runtime Spec**: Định nghĩa cách runtime chạy container từ image. `runc` là runtime implementation chuẩn nhất.

Tóm: OCI = chuẩn **container**. CRI = chuẩn **K8s ↔ runtime**.

## Docker là một stack, không phải runtime đơn

Đây là điểm nhiều người không biết:

```text
                  Docker stack
        ┌─────────────────────────┐
        │  Docker CLI             │  ← Command bạn gõ (docker run, ...)
        ├─────────────────────────┤
        │  Docker API + Daemon    │  ← Server xử lý request
        ├─────────────────────────┤
        │  Build tools (Buildkit) │  ← docker build
        ├─────────────────────────┤
        │  Volume + Auth + ...    │  ← Quản lý volume, login registry
        ├─────────────────────────┤
        │  containerd             │  ← Runtime layer (đây mới là phần chạy
        ├─────────────────────────┤    container thật)
        │  runc                   │  ← Low-level: gọi syscall Linux
        └─────────────────────────┘
```

**containerd** là phần thực sự chạy container. Docker chỉ là **wrapper user-friendly** cho containerd + thêm CLI, API, build tools.

→ K8s thực ra chỉ cần phần **containerd**. Các phần khác (Docker CLI, API, build) **K8s không cần** vì kubelet không gõ `docker run` — nó cần API level thấp hơn.

## Dockershim — Giải pháp tạm thời

Khi CRI ra đời, **Docker không implement CRI** (vì Docker có trước CRI). K8s vẫn muốn support Docker → tạo **dockershim**:

```text
kubelet → CRI → dockershim → Docker API → containerd → runc → container
              ↑
              "Adapter" để convert CRI call sang Docker API
```

Dockershim là **hack tạm**. K8s team phải maintain thêm 1 lớp adapter mỗi khi Docker đổi API. Phiền phức, không bền vững.

## Năm 2020: Quyết định bỏ Dockershim

K8s 1.20 (12/2020): Announce sẽ **deprecate dockershim**.
K8s 1.24 (5/2022): **Remove dockershim** hoàn toàn.

Lý do:
1. **Containerd có thể dùng trực tiếp** — không cần qua Docker stack.
2. Maintain dockershim tốn effort không cần thiết.
3. **Docker image vẫn tuân OCI** → containerd chạy được.

→ K8s 1.24+ **không support Docker** với tư cách runtime, nhưng **vẫn chạy Docker image bình thường** qua containerd.

## Tại sao tin đồn "Docker bị remove" gây hoảng?

Tin đồn lan rộng vì truyền tải sai. Sự thật chia làm 4 phần — cần phân biệt rõ:

| Phần | Bị deprecated khỏi K8s? | Bạn vẫn dùng được? |
|---|---|---|
| **Docker image** (tệp .tar layer) | **KHÔNG** | ✓ Chạy bình thường trên K8s (containerd hiểu được) |
| **`docker build`** trên dev machine | **KHÔNG** | ✓ Build image như cũ |
| **`docker run`** trên dev machine | **KHÔNG** | ✓ Test container như cũ |
| **Docker engine** làm runtime cho K8s | **CÓ** (từ 1.24) | ✗ Phải đổi sang containerd hoặc CRI-O |

→ Developer build image bằng Docker **không bị ảnh hưởng**. Sysadmin quản K8s cluster phải đổi runtime → đa số đã làm trước 2024.

## So sánh các runtime hiện tại

| Runtime | Trạng thái 2025 | Use case |
|---|---|---|
| **containerd** | **Mặc định** trong kubeadm, EKS, GKE | Production K8s |
| **CRI-O** | Default trong OpenShift | Production K8s, đặc biệt RedHat |
| **gVisor** | Sandbox security cao | Multi-tenant, workload không tin cậy |
| **Kata Containers** | VM-based isolation | Workload cần isolation tuyệt đối |
| **Docker (qua cri-dockerd)** | Có thể vẫn dùng nhưng hiếm | Legacy cluster chưa migrate |

## CLI tool nào dùng cho cái gì?

Đây là phần gây nhầm lẫn nhất. Có 3 CLI cần phân biệt:

```text
┌────────────┬──────────────┬────────────────────┬──────────────────┐
│  Tool      │  Maintained by│  Mục đích chính    │  Khuyến nghị     │
├────────────┼──────────────┼────────────────────┼──────────────────┤
│  ctr       │  containerd  │  Debug containerd  │  Hiếm dùng       │
│            │  community   │  internal          │  (low-level)     │
├────────────┼──────────────┼────────────────────┼──────────────────┤
│  nerdctl   │  containerd  │  Docker-like CLI   │  Dùng để chạy    │
│            │  community   │  cho containerd    │  container thay  │
│            │              │                    │  docker run      │
├────────────┼──────────────┼────────────────────┼──────────────────┤
│  crictl    │  Kubernetes  │  Debug bất kỳ CRI- │  Dùng trên K8s   │
│            │  community   │  compatible runtime│  worker node để  │
│            │              │                    │  troubleshoot    │
└────────────┴──────────────┴────────────────────┴──────────────────┘
```

### ctr — Debug containerd low-level

```bash
# Pull image
ctr images pull docker.io/library/redis:latest

# List images
ctr images list

# Run container
ctr run docker.io/library/redis:latest redis-test
```

Hiếm khi dùng. Chỉ debug containerd nội bộ.

### nerdctl — Docker-like CLI cho containerd

Build bởi containerd team, **giao diện gần giống `docker`**:

```bash
# Run container (giống docker run)
nerdctl run -d -p 8080:80 nginx

# List containers (giống docker ps)
nerdctl ps

# Build image (giống docker build)
nerdctl build -t myapp .

# Compose
nerdctl compose up -d
```

→ Nếu dev machine không có Docker mà có containerd → dùng nerdctl thay thế.

**Bonus của nerdctl**:
- Support **lazy pulling** (pull image theo layer lúc cần, không pull toàn bộ).
- Support **encrypted image**.
- Support **K8s namespace** (xem container của K8s).

### crictl — Debug runtime từ góc nhìn K8s

Đây là CLI **bạn phải biết cho CKA**. Dùng để debug pod/container trên worker node:

```bash
# List Pod (giống kubectl get pods nhưng ở level CRI)
crictl pods

# List container (mỗi pod có thể có nhiều container)
crictl ps

# Logs của container
crictl logs <container-id>

# Exec vào container
crictl exec -it <container-id> bash

# Inspect chi tiết
crictl inspect <container-id>
```

**Quan trọng**: 
- `crictl` **không tạo pod mới**. Nếu bạn `crictl run` tạo container, **kubelet sẽ xoá** vì không khớp với spec apiserver lưu.
- `crictl` chỉ để **debug** — view, exec, log.

## Cấu hình endpoint cho crictl

`crictl` cần biết runtime ở đâu (socket nào). Default check theo thứ tự:

```text
1. /var/run/dockershim.sock     (legacy, không còn)
2. /run/containerd/containerd.sock
3. /var/run/crio/crio.sock
4. /var/run/cri-dockerd.sock
```

Nếu cluster của bạn dùng containerd:

```bash
# Option 1: Config file
cat /etc/crictl.yaml
# runtime-endpoint: unix:///run/containerd/containerd.sock
# image-endpoint: unix:///run/containerd/containerd.sock
# timeout: 10
# debug: false

# Option 2: Env variable
export CONTAINER_RUNTIME_ENDPOINT=unix:///run/containerd/containerd.sock

# Option 3: Flag mỗi lệnh
crictl --runtime-endpoint unix:///run/containerd/containerd.sock ps
```

## Bảng dịch lệnh Docker → crictl

Trong exam CKA, bạn sẽ debug container trên worker node. Vì cluster mới dùng containerd → phải biết crictl thay docker:

| Mục đích | Docker | crictl |
|---|---|---|
| List container chạy | `docker ps` | `crictl ps` |
| List image | `docker images` | `crictl images` |
| Pull image | `docker pull nginx` | `crictl pull nginx` |
| Xem log container | `docker logs <id>` | `crictl logs <id>` |
| Exec vào container | `docker exec -it <id> bash` | `crictl exec -it <id> bash` |
| Inspect container | `docker inspect <id>` | `crictl inspect <id>` |
| Xem thông tin runtime | `docker info` | `crictl info` |
| Stats CPU/RAM | `docker stats` | `crictl stats` |
| List pod (K8s level) | (không có — Docker không hiểu pod) | `crictl pods` |

→ Hầu hết command **giống nhau** — chỉ đổi `docker` thành `crictl`. Học 1 lần xong.

## Workflow điển hình của developer 2025

```text
[Dev machine]
├── docker build -t myapp:v1 .       (vẫn dùng Docker)
├── docker run -p 8080:8080 myapp:v1  (test local)
└── docker push registry.com/myapp:v1  (push lên registry)
        │
        │  Image OCI-compliant
        ▼
[Production K8s cluster — chạy containerd]
└── kubectl run myapp --image=registry.com/myapp:v1
        │
        ▼
    Kubelet → CRI → containerd → runc → container chạy
        │
        ▼ (Debug khi cần)
    SSH worker node → crictl logs <id> / crictl exec -it <id> bash
```

→ Docker vẫn quan trọng cho dev. Containerd + crictl quan trọng cho ops.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Dùng `docker ps` trên worker node K8s mới | Báo "command not found" | Dùng `crictl ps` |
| `crictl run` tạo container debug | Kubelet sẽ xoá | Dùng `kubectl run` hoặc chỉ exec vào pod có sẵn |
| Tưởng "Docker bị remove" = image cũ không dùng được | Hoảng, đi build lại | Image OCI vẫn dùng — chỉ runtime đổi |
| Chưa config crictl endpoint | `crictl ps` báo lỗi connection | Set `/etc/crictl.yaml` hoặc env var |
| Quên `nerdctl` chỉ chạy được trên máy có containerd | Lệnh không chạy | Kiểm tra `containerd --version` trước |

## Tóm tắt bài 2

- **Docker image OCI-compliant** vẫn chạy bình thường trên K8s mới. Chỉ **Docker engine** bị bỏ với tư cách runtime từ K8s 1.24.
- **containerd** = mặc định hiện tại. CRI-O = alternative phổ biến (OpenShift).
- **CRI** = chuẩn API K8s ↔ runtime. **OCI** = chuẩn image + runtime của ngành.
- 3 CLI: `ctr` (low-level debug), `nerdctl` (Docker-like cho dev), **`crictl` (debug K8s — phải biết cho exam)**.
- Bảng dịch lệnh: hầu hết `docker XYZ` → `crictl XYZ`. Học 1 lần.

**Bài kế tiếp** → [Bài 3: ETCD — database của toàn bộ cluster](03-etcd-trong-kubernetes.md)

# Bài 1: Setup Kubernetes Local — kubectl & Minikube

## Cần Cài Gì?

```text
Để làm việc với Kubernetes, cần 2 tools:

1. kubectl (Kube Control)
   → CLI tool giao tiếp với cluster
   → Dùng để gửi lệnh đến Master Node
   → Cần dù deploy local hay cloud

2. minikube
   → Tạo cluster local để test/develop
   → Dùng Virtual Machine trên laptop
   → Chỉ cho development, không phải production
```

---

## kubectl — Công Cụ Giao Tiếp

```text
kubectl create deployment ...  → Tạo deployment
kubectl get pods               → Liệt kê pods
kubectl apply -f config.yaml   → Apply config file

kubectl chạy trên local machine → Gửi lệnh đến cluster
```

**Không nhầm lẫn:**
- `kubectl` = Công cụ bạn dùng (như TV remote)
- `API Server` trong Master Node = Bộ nhận lệnh (như TV)

---

## minikube — Cluster Local

```text
minikube tạo 1 Virtual Machine trên laptop
  → VM này chứa toàn bộ Kubernetes cluster
  → Master Node + Worker Node gộp vào 1 VM
  → Đủ để develop và test

Không dùng cho production!
  → Production: dùng AWS EKS, Azure AKS, Google GKE
```

---

## Cài Đặt

### macOS

```bash
# Cài kubectl (dùng Homebrew)
brew install kubectl
kubectl version --client     # Verify

# Cài VirtualBox (hypervisor)
# → Download từ virtualbox.org → macOS Hosts

# Cài minikube
brew install minikube

# Tạo cluster
minikube start --driver=virtualbox
```

### Windows

```powershell
# Cài Chocolatey (package manager)
# → Xem chocolatey.org

# Cài kubectl
choco install kubernetes-cli

# Cài VirtualBox hoặc dùng Hyper-V (built-in)

# Cài minikube
choco install minikube

# Tạo cluster (VirtualBox)
minikube start --driver=virtualbox

# Hoặc dùng Hyper-V (Windows 10 Pro)
minikube start --driver=hyperv
```

---

## Kiểm Tra Cluster

```bash
# Xem trạng thái cluster
minikube status
# → minikube: Running
# → cluster: Running
# → kubectl: Correctly Configured

# Xem dashboard trực quan
minikube dashboard
# → Mở browser tab với web dashboard
# → Ctrl+C để stop

# Restart cluster nếu cần
minikube start --driver=virtualbox
```

---

## Luồng Làm Việc

```text
Developer
  │ kubectl apply -f deployment.yaml
  ▼
kubectl (local tool)
  │ gửi request đến
  ▼
Master Node (API Server) trong minikube VM
  │ Scheduler chọn Node
  ▼
Worker Node (trong cùng VM)
  │ kubelet → Docker
  ▼
Pod → Container running!
```

---

## Ba lệnh cấu hình `kubectl` đáng biết ngay từ đầu

Chúng tiết kiệm rất nhiều thời gian gõ và rất nhiều lần thao tác nhầm cụm.

```bash
# Đang trỏ vào cụm nào?  ← gõ trước MỌI thao tác nguy hiểm
kubectl config current-context
```

```text
minikube
```

```bash
# Có những cụm nào trong ~/.kube/config
kubectl config get-contexts
```

```text
CURRENT   NAME              CLUSTER           NAMESPACE
*         minikube          minikube          default
          production-eks    prod.eks.acme     payments
```

```bash
# Đổi namespace mặc định — hết phải gõ -n mỗi lệnh
kubectl config set-context --current --namespace=my-namespace
```

> **Thói quen đáng hình thành**: gõ `kubectl config current-context` trước khi chạy bất cứ lệnh nào có `delete`. Sự cố "xoá nhầm ở production vì tưởng đang ở minikube" xảy ra nhiều hơn bạn nghĩ, và nó không có nút hoàn tác.
>
> Nhiều người cài thêm công cụ hiển thị cụm hiện tại ngay trên dòng nhắc lệnh (`kube-ps1`, hoặc plugin của Starship) — đáng làm nếu bạn làm việc với nhiều cụm.

### Bí danh nên có

```bash
# Thêm vào ~/.zshrc hoặc ~/.bashrc
alias k=kubectl
source <(kubectl completion zsh)      # hoặc bash
complete -o default -F __start_kubectl k
```

Tự động hoàn thành tên Pod và tên tài nguyên tiết kiệm rất nhiều thời gian — vì tên Pod có hậu tố ngẫu nhiê̛n mà không ai nhớ nổi.

### Khác biệt cần biết giữa minikube và cụm thật

| | minikube | Cụm thật (EKS/GKE/AKS) |
|---|---|---|
| Số node | **1** (mặc định) | Nhiều |
| `LoadBalancer` | Kẹt `<pending>` — cần `minikube tunnel` | Tự tạo LB thật |
| Ổ đĩa | `hostPath` cục bộ | EBS, PD, Azure Disk |
| Kiểm tra HA và failover | **Không được** — chỉ có một node | Được |
| `metrics-server` | Phải bật: `minikube addons enable metrics-server` | Thường có sẵn |
| Chi phí | Miễn phí | Có phí |

Điểm quan trọng nhất là dòng thứ tư: **cụm một node không kiểm tra được hành vi khi node chết** — thứ mà phần lớn giá trị của Kubernetes nằm ở đó. Muốn thử thì dùng `minikube start --nodes 3`, hoặc dùng **kind** (Kubernetes in Docker) vốn tạo cụm nhiều node dễ hơn.

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Chạy lệnh nhầm cụm | Xoá nhầm ở production | `kubectl config current-context` trước mọi thao tác nguy hiểm |
| `LoadBalancer` kẹt `<pending>` trên minikube | Không lấy được EXTERNAL-IP | `minikube tunnel` (chạy ở cửa sổ riêng), hoặc dùng `NodePort` |
| `kubectl top` báo lỗi Metrics API | — | `minikube addons enable metrics-server` |
| Build image trên máy rồi Pod báo `ImagePullBackOff` | minikube dùng Docker daemon **riêng** | `eval $(minikube docker-env)` rồi build lại, hoặc `minikube image load <ten>` |
| Quên `-n` rồi thao tác nhầm namespace | Không thấy tài nguyên, hoặc sửa nhầm chỗ | `kubectl config set-context --current --namespace=...` |
| minikube ăn hết RAM máy | Máy chậm | `minikube start --memory=4096 --cpus=2` |
| Test HA trên cụm một node | Không kiểm được gì về failover | `minikube start --nodes 3`, hoặc dùng kind |

Dòng "ImagePullBackOff" đáng nói vì nó làm người mới mất nhiều thời gian:

```text
   Bạn: docker build -t myapp:v1 .        → image nằm ở Docker của MÁY BẠN
   minikube: chạy trong máy ảo RIÊNG      → nó KHÔNG thấy image đó
   → Pod báo ImagePullBackOff vì đi tìm myapp:v1 trên Docker Hub

   Cách chữa 1 — trỏ CLI của bạn vào Docker bên trong minikube
   eval $(minikube docker-env)
   docker build -t myapp:v1 .

   Cách chữa 2 — nạp image có sẵn vào minikube
   minikube image load myapp:v1
```

Nhớ thêm `imagePullPolicy: IfNotPresent` trong manifest, nếu không Kubernetes vẫn cố tải từ registry.

---

## Tóm tắt bài 1

- **`kubectl`** là client nói chuyện với API server; **minikube** dựng một cụm Kubernetes trên máy bạn để học.
- **`kubectl config current-context` trước mọi thao tác nguy hiểm** — xoá nhầm cụm không có nút hoàn tác.
- Đổi namespace mặc định bằng `kubectl config set-context --current --namespace=...` để hết phải gõ `-n`.
- Cài **bí danh `k` và tự động hoàn thành** — tên Pod có hậu tố ngẫu nhiên không ai nhớ nổi.
- **minikube dùng Docker daemon riêng** — image build trên máy bạn nó không thấy. Dùng `eval $(minikube docker-env)` hoặc `minikube image load`, kèm `imagePullPolicy: IfNotPresent`.
- `LoadBalancer` trên minikube kẹt `<pending>` cho tới khi chạy **`minikube tunnel`**.
- **Cụm một node không kiểm tra được failover** — thứ mà phần lớn giá trị của Kubernetes nằm ở đó. Dùng `minikube start --nodes 3` hoặc kind khi cần.

---

**Bài kế tiếp** → [Bài 2: Kubernetes Objects — Pod, Deployment, Service](02-kubernetes-objects.md)

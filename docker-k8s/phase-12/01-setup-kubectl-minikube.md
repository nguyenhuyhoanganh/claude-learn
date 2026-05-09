# Bài 1: Setup Kubernetes Local — kubectl & Minikube

## Cần Cài Gì?

```
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

```
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

```
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

```
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

**Tiếp theo:** Kubernetes Objects — Pod, Deployment, Service →

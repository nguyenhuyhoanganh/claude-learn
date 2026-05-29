# Bài thực chiến: Dựng server tự build & deploy — K8s + GitHub Actions Runner + Docker Registry trên Ubuntu

> Mục tiêu: Từ **một máy Ubuntu trắng**, dựng được một cụm Kubernetes (master + worker), một **Docker Registry riêng**, một **GitHub Actions self-hosted runner**, rồi cấu hình workflow để mỗi lần `git push` → tự động **build image → push lên registry → deploy vào K8s**.

Đây không phải bài lý thuyết. Đây là **runbook** — đọc tới đâu chạy lệnh tới đó. Mọi lệnh đều chạy được trên Ubuntu 22.04/24.04. Đọc kỹ phần "vì sao" trước mỗi bước để khi gặp lỗi bạn biết đường sửa, chứ không copy-paste mù.

Thời gian: lần đầu làm trọn vẹn khoảng **2–4 tiếng**. Làm lần 2 chỉ còn ~30 phút.

### Làm theo đúng thứ tự này — làm hết là chạy

Bài viết là một chuỗi bước **tuần tự**. Làm đúng thứ tự, đến cuối bạn `git push` là tự động deploy. Đừng nhảy cóc.

```text
 Bước 1  Chuẩn bị máy (mọi node)        ──┐
 Bước 2  Cài containerd (mọi node)        │  Dựng hạ tầng K8s
 Bước 3  Cài kubeadm/kubelet/kubectl      │
 Bước 4  Init cụm trên MASTER + CNI       │
 Bước 5  Join WORKER (nếu có 2 máy)     ──┘
 Bước 6  Dựng Docker Registry           ──┐
 Bước 7  Dạy Docker & containerd tin cert │  Dựng kho image
 Bước 8  Tạo imagePullSecret            ──┘
 Bước 9  Cài GitHub Actions runner      ──┐
 Bước 10 Manifest + Dockerfile trong repo │  Nối CI/CD
 Bước 11 Viết workflow + KIỂM CHỨNG     ──┘
            │
            ▼
   git push  →  tự động build → push → deploy ✅
```

Mỗi bước đều có lệnh **kiểm tra ngay tại chỗ** (`kubectl get nodes`, `docker push`...). **Chỉ qua bước sau khi bước hiện tại "xanh"** — nếu không, lỗi sẽ dồn lại và rất khó truy.

---

## 0. Bức tranh tổng thể — hiểu trước khi gõ

Chúng ta đang tự tay thay thế cả một pipeline DevOps thương mại (GitHub-hosted runner + Docker Hub + cloud K8s) bằng đồ "cây nhà lá vườn" chạy trên **một (hoặc hai) máy của bạn**. Có 4 mảnh ghép:

```text
        Developer
            │ git push
            ▼
┌───────────────────────────────────────────────────────────┐
│                        GitHub (cloud)                       │
│   - Repo + source code                                      │
│   - Workflow .github/workflows/deploy.yml                   │
│   - Gửi job xuống self-hosted runner (qua long-poll HTTPS)  │
└───────────────────────────┬─────────────────────────────────┘
                            │  Runner chủ động kết nối RA GitHub
                            │  (không cần mở port vào máy bạn)
                            ▼
┌───────────────────────────────────────────────────────────┐
│              Máy Ubuntu của bạn (server)                    │
│                                                             │
│  ┌──────────────────┐   build image   ┌──────────────────┐ │
│  │ GitHub Actions   │ ───────────────► │  Docker Engine   │ │
│  │ self-hosted      │                  │  (chỉ để BUILD)  │ │
│  │ runner (service) │                  └────────┬─────────┘ │
│  └────────┬─────────┘            docker push     │          │
│           │ kubectl apply                        ▼          │
│           │                          ┌──────────────────┐   │
│           │                          │ Docker Registry  │   │
│           │                          │ (registry:2)     │   │
│           │                          │ chứa image riêng │   │
│           │                          └────────┬─────────┘   │
│           ▼                       containerd pull│          │
│  ┌────────────────────────────────────────────▼─────────┐ │
│  │           Kubernetes cluster (kubeadm)                │ │
│  │   master node (control-plane) + worker node(s)        │ │
│  │   runtime = containerd, CNI = Flannel                 │ │
│  │   chạy Deployment app của bạn                          │ │
│  └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

**Vì sao bố trí như vậy?**

| Thành phần | Vai trò | Vì sao chọn |
|---|---|---|
| **kubeadm** | Dựng cụm K8s | Cách chính thống, gần production nhất, không "ảo thuật" như minikube/k3s |
| **containerd** | Container runtime cho K8s | K8s đã bỏ Docker (dockershim) từ 1.24. containerd là runtime thật mà K8s dùng để **chạy** pod |
| **Docker Engine** | Chỉ dùng để **build** image | `docker build` quen tay, dễ debug. K8s **không** dùng Docker để chạy — chỉ runner dùng để build |
| **Docker Registry (registry:2)** | Kho image riêng | Không phụ thuộc Docker Hub, không lo rate-limit, image không ra ngoài internet |
| **Self-hosted runner** | Chạy job CI/CD trên máy bạn | Runner có sẵn `kubectl` + truy cập được registry nội bộ + cluster. GitHub-hosted runner không vào được mạng nội bộ của bạn |

> **Điểm dễ nhầm nhất ngay từ đầu**: "K8s bỏ Docker rồi mà sao còn cài Docker?" — Vì có **2 việc khác nhau**: *build* image và *run* container. Runner dùng **Docker** để build (tùy chọn, có thể thay bằng buildah/nerdctl). K8s dùng **containerd** để run. Hai thằng này độc lập, chỉ gặp nhau ở chỗ: cả hai cùng nói chuyện với **Registry**.

### Single-node hay 2 máy?

Bạn nói "có worker và master". Có 2 kịch bản, bài này cover cả hai:

- **Kịch bản A — 1 máy duy nhất (lab/homelab)**: máy đó vừa là master vừa chạy workload (gỡ taint của control-plane). Runner + Docker + Registry cũng nằm luôn trên máy đó. Đơn giản nhất.
- **Kịch bản B — 2+ máy (gần production)**: 1 máy master, 1+ máy worker `join` vào. Phần 5 sẽ chỉ cách `join`.

Trong toàn bài, máy chính (chạy `kubeadm init`) gọi là **MASTER**, máy phụ gọi là **WORKER**.

---

## 1. Chuẩn bị máy Ubuntu (làm trên TẤT CẢ các node)

> K8s rất kén môi trường: nó **từ chối chạy** nếu còn swap, thiếu kernel module, hoặc sai cấu hình network. Bước này tẻ nhạt nhưng bỏ qua là `kubeadm init` fail ngay.

### 1.1. Cập nhật & đặt hostname

```bash
sudo apt-get update && sudo apt-get upgrade -y

# Đặt hostname rõ ràng cho từng máy (đổi tên tùy node)
sudo hostnamectl set-hostname k8s-master      # trên máy master
# sudo hostnamectl set-hostname k8s-worker-1   # trên máy worker

# Cho các node thấy nhau qua tên (nếu chưa có DNS nội bộ)
# Thay IP bằng IP LAN thật của các máy
sudo tee -a /etc/hosts <<EOF
192.168.1.10  k8s-master
192.168.1.11  k8s-worker-1
EOF
```

> **Vì sao cần `/etc/hosts`?** Các node gọi nhau bằng hostname. Nếu DNS không phân giải được `k8s-master`, kubelet/kubeadm sẽ treo ở bước join. Trên cloud có DNS nội bộ thì bỏ qua phần này.

### 1.2. Tắt swap (BẮT BUỘC)

```bash
sudo swapoff -a
# Tắt vĩnh viễn: comment dòng swap trong /etc/fstab để reboot không bật lại
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab
```

> **Vì sao?** kubelet mặc định **panic và không start** nếu phát hiện swap đang bật. Lý do triết học: K8s muốn quản lý bộ nhớ chính xác (OOM, limits/requests), swap làm scheduler "nói dối" về RAM còn trống.

### 1.3. Bật kernel module & sysctl cho network

```bash
# Hai module này cần cho container networking (bridge + overlay)
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter

# Cho phép iptables "nhìn thấy" traffic đi qua bridge, và bật IP forwarding
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sudo sysctl --system   # áp dụng ngay, không cần reboot
```

> **Vì sao 3 dòng sysctl này?** Pod-to-pod traffic đi qua một Linux bridge. Mặc định iptables (mà kube-proxy dùng để định tuyến Service) **không thấy** traffic qua bridge → Service không hoạt động. `ip_forward=1` cho phép máy route packet giữa các pod khác node. Thiếu chúng → "pod ping được nhau nhưng Service/ClusterIP chết".

---

## 2. Cài containerd — runtime cho K8s (làm trên TẤT CẢ các node)

```bash
# Cài containerd từ repo Docker (bản này ổn định và có sẵn config chuẩn)
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y containerd.io
```

Cấu hình containerd dùng **systemd cgroup driver** — đây là lỗi kinh điển khiến node `NotReady`:

```bash
# Sinh file config mặc định
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml > /dev/null

# Bật SystemdCgroup = true
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

sudo systemctl restart containerd
sudo systemctl enable containerd
```

> **Vì sao `SystemdCgroup = true`?** Ubuntu dùng `systemd` làm cgroup manager. Nếu kubelet và containerd dùng driver khác nhau (systemd vs cgroupfs), việc quản lý tài nguyên xung đột → node bị `NotReady` hoặc pod restart loạn xạ. Cả kubelet (mặc định) và containerd phải cùng dùng `systemd`. Đây là bug số 1 khi tự dựng kubeadm.

---

## 3. Cài kubeadm, kubelet, kubectl (làm trên TẤT CẢ các node)

> Dùng repo cộng đồng mới `pkgs.k8s.io` (repo cũ `apt.kubernetes.io` đã ngừng hoạt động). Repo này tách theo từng minor version — ví dụ dưới dùng `v1.30`.

```bash
K8S_VERSION=v1.30

sudo apt-get install -y apt-transport-https ca-certificates curl gpg

curl -fsSL https://pkgs.k8s.io/core:/stable:/${K8S_VERSION}/deb/Release.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
https://pkgs.k8s.io/core:/stable:/${K8S_VERSION}/deb/ /" | \
  sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl

# Ghim version, tránh apt upgrade vô tình nâng cấp làm vỡ cluster
sudo apt-mark hold kubelet kubeadm kubectl
```

> **Vì sao `apt-mark hold`?** Nâng cấp K8s phải làm có chủ đích theo từng minor version (1.30 → 1.31), không bao giờ để `apt upgrade` tự nhảy. Một lần nhảy nhầm version có thể làm control-plane không khởi động lại được.

Kiểm tra:

```bash
kubeadm version
kubectl version --client
```

---

## 4. Khởi tạo cụm trên MASTER

Chạy **chỉ trên máy master**:

```bash
# --pod-network-cidr phải khớp với CNI sẽ cài. Flannel mặc định dùng 10.244.0.0/16
# --apiserver-advertise-address = IP LAN của master (để worker join được)
sudo kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --apiserver-advertise-address=192.168.1.10
```

Sau vài phút, output sẽ cho 2 thứ quan trọng:

1. **Lệnh cấu hình kubectl cho user thường** — chạy ngay:

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

2. **Lệnh `kubeadm join ...`** (có token + hash) — **copy lại, để dành** cho bước join worker (Phần 5). Token hết hạn sau 24h; cách tạo lại ở phần đó.

> **Vì sao phải copy `admin.conf`?** `kubectl` tìm credential ở `~/.kube/config`. File `admin.conf` chứa chứng chỉ admin của cluster. Không copy → mọi lệnh `kubectl` báo `connection refused localhost:8080`.

### 4.1. Cài CNI (Flannel) — cluster mới "sống"

```bash
kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml
```

> **Vì sao bắt buộc?** Vừa `init` xong, node ở trạng thái `NotReady` và CoreDNS `Pending` — vì **chưa có mạng cho pod**. CNI (Container Network Interface) là plugin cấp IP và định tuyến cho pod. Không cài → không pod nào chạy được. Flannel đơn giản nhất; production hay dùng Calico/Cilium.

Chờ ~1 phút rồi kiểm tra — node phải `Ready`:

```bash
kubectl get nodes
kubectl get pods -A     # CoreDNS, flannel, kube-proxy... đều Running
```

### 4.2. (Chỉ kịch bản A — single node) Gỡ taint control-plane

```bash
# Mặc định master bị "bôi đen" (taint) để KHÔNG chạy workload thường.
# Nếu chỉ có 1 máy, phải gỡ taint thì app mới schedule được lên master.
kubectl taint nodes --all node-role.kubernetes.io/control-plane-

# Có thể báo "not found" trên 1 trong 2 key tùy version — bình thường.
```

> **Vì sao có taint này?** Trong production, master chỉ lo điều phối, không chạy app (để bảo vệ control-plane khỏi pod "ăn" hết RAM/CPU). Lab 1 máy thì phải gỡ, nếu không pod mãi `Pending` với lý do `untolerated taint`.

---

## 5. Join WORKER vào cụm (kịch bản B — bỏ qua nếu chỉ 1 máy)

Trên **máy worker** (đã làm xong Phần 1–3), chạy lệnh `kubeadm join` lấy từ output của `kubeadm init`. Dạng:

```bash
sudo kubeadm join 192.168.1.10:6443 \
  --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

Nếu **token đã hết hạn (>24h)**, tạo lại trên **master**:

```bash
# In ra nguyên lệnh join mới
kubeadm token create --print-join-command
```

Quay lại **master** kiểm tra:

```bash
kubectl get nodes
# NAME           STATUS   ROLES           AGE   VERSION
# k8s-master     Ready    control-plane   10m   v1.30.x
# k8s-worker-1   Ready    <none>          1m    v1.30.x
```

> **Bẫy thường gặp khi join**: worker `NotReady` hoài → 99% là (a) chưa cài CNI (CNI cài 1 lần trên master, nó tự rải DaemonSet xuống worker — chờ pod flannel trên worker `Running`), hoặc (b) firewall chặn port `6443` (API) / `8472` (Flannel VXLAN UDP) giữa hai máy. Mở port hoặc tạm tắt `ufw` để test.

---

## 6. Dựng Docker Registry riêng

Đây là kho chứa image. Có 2 cách deploy; chọn **một**.

### Cách 1 (khuyến nghị cho lab) — chạy registry bằng Docker, có auth + TLS

Trước hết cài **Docker Engine** (cũng chính là cái runner dùng để build sau này) trên máy master:

```bash
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
sudo usermod -aG docker $USER   # để chạy docker không cần sudo (logout/login lại)
```

Tạo chứng chỉ TLS tự ký và tài khoản đăng nhập:

```bash
sudo mkdir -p /opt/registry/{certs,auth,data}
cd /opt/registry

# 1) Chứng chỉ self-signed (CN = hostname dùng để push/pull)
#    Đặt registry domain, ví dụ registry.local trỏ về IP master trong /etc/hosts
sudo openssl req -newkey rsa:4096 -nodes -sha256 \
  -keyout certs/domain.key -x509 -days 3650 \
  -out certs/domain.crt \
  -subj "/CN=registry.local" \
  -addext "subjectAltName=DNS:registry.local,IP:192.168.1.10"

# 2) Tài khoản (user: deployer)
sudo apt-get install -y apache2-utils
htpasswd -Bbn deployer 'Str0ngP@ss' | sudo tee auth/htpasswd
```

Chạy registry container:

```bash
docker run -d --restart=always --name registry \
  -p 5000:5000 \
  -v /opt/registry/data:/var/lib/registry \
  -v /opt/registry/certs:/certs \
  -v /opt/registry/auth:/auth \
  -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/domain.crt \
  -e REGISTRY_HTTP_TLS_KEY=/certs/domain.key \
  -e "REGISTRY_AUTH=htpasswd" \
  -e "REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm" \
  -e REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd \
  registry:2
```

Cho cả máy biết `registry.local` (thêm vào `/etc/hosts` mọi node):

```bash
echo "192.168.1.10  registry.local" | sudo tee -a /etc/hosts
```

Test push:

```bash
docker login registry.local:5000 -u deployer -p 'Str0ngP@ss'
docker pull hello-world
docker tag hello-world registry.local:5000/hello-world:test
docker push registry.local:5000/hello-world:test
```

> Nếu push báo lỗi TLS `x509: certificate signed by unknown authority` → xem Phần 7 (phải dạy Docker **và** containerd tin chứng chỉ tự ký này).

### Cách 2 — deploy registry vào trong K8s

Phù hợp nếu không muốn cài Docker Engine. Lưu image dùng `hostPath` (lab) hoặc PVC (production):

```yaml
# registry-in-k8s.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: registry
  namespace: registry
spec:
  replicas: 1
  selector: { matchLabels: { app: registry } }
  template:
    metadata: { labels: { app: registry } }
    spec:
      containers:
        - name: registry
          image: registry:2
          ports: [{ containerPort: 5000 }]
          volumeMounts:
            - { name: data, mountPath: /var/lib/registry }
      volumes:
        - name: data
          hostPath: { path: /opt/registry/data, type: DirectoryOrCreate }
---
apiVersion: v1
kind: Service
metadata:
  name: registry
  namespace: registry
spec:
  type: NodePort
  selector: { app: registry }
  ports:
    - { port: 5000, targetPort: 5000, nodePort: 30500 }
```

```bash
kubectl create namespace registry
kubectl apply -f registry-in-k8s.yaml
# Truy cập tại <IP-node>:30500 — cần cấu hình insecure/TLS tương tự
```

> **Khuyến nghị**: dùng **Cách 1** cho bài này. Nó tách bạch — registry không chết theo cluster, và Docker Engine sẵn sàng cho việc build.

---

## 7. Dạy Docker & containerd TIN Registry tự ký (cực kỳ hay vấp)

Có **hai** client cần tin registry của bạn, và chúng cấu hình **khác nhau**:

| Client | Dùng để | Cấu hình ở đâu |
|---|---|---|
| **Docker Engine** | `docker push` (build & đẩy image) | `/etc/docker/...` hoặc copy CA |
| **containerd** | K8s `pull` image về chạy pod | `/etc/containerd/certs.d/...` |

### 7.1. Cho Docker tin (để push)

```bash
# Cách sạch: cài CA tự ký vào trust store của Docker
sudo mkdir -p /etc/docker/certs.d/registry.local:5000
sudo cp /opt/registry/certs/domain.crt \
  /etc/docker/certs.d/registry.local:5000/ca.crt
sudo systemctl restart docker
```

### 7.2. Cho containerd tin (để K8s pull) — làm trên MỌI node

```bash
sudo mkdir -p /etc/containerd/certs.d/registry.local:5000

sudo tee /etc/containerd/certs.d/registry.local:5000/hosts.toml <<EOF
server = "https://registry.local:5000"

[host."https://registry.local:5000"]
  capabilities = ["pull", "resolve"]
  ca = "/opt/registry/certs/domain.crt"
EOF
```

Bật cơ chế đọc thư mục `certs.d` trong containerd (sửa `config.toml`):

```bash
# Đảm bảo có dòng config_path trỏ tới certs.d
sudo sed -i '/\[plugins."io.containerd.grpc.v1.cri".registry\]/a\    config_path = "/etc/containerd/certs.d"' \
  /etc/containerd/config.toml

sudo systemctl restart containerd
```

> **Vì sao tách Docker và containerd?** Nhiều người cấu hình cho Docker tin rồi tưởng xong, nhưng pod vẫn `ErrImagePull` với lỗi `x509`. Lý do: **K8s không dùng Docker để pull**, nó dùng **containerd**. Hai thằng có trust store riêng. Phải làm **cả hai**. Đây là một trong những lỗi tốn thời gian nhất khi tự host registry.
>
> **Lối tắt cho lab thật sự nhanh (KHÔNG dùng production)**: thay vì TLS, chạy registry HTTP thuần và khai báo `insecure`. Với containerd, trong `hosts.toml` thêm `skip_verify = true`; với Docker thêm `"insecure-registries": ["registry.local:5000"]` vào `/etc/docker/daemon.json`. Nhanh nhưng image truyền không mã hóa.

---

## 8. Tạo imagePullSecret để K8s đăng nhập registry

Registry của ta có auth (htpasswd), nên K8s cần credential để pull:

```bash
kubectl create secret docker-registry regcred \
  --docker-server=registry.local:5000 \
  --docker-username=deployer \
  --docker-password='Str0ngP@ss'
# tạo trong namespace nơi app sẽ chạy (mặc định: default)
```

> **Vì sao cần dù đã `docker login`?** `docker login` chỉ lưu credential cho **Docker CLI trên máy đó**. Pod chạy bởi **containerd** không thấy file đó. `imagePullSecret` là cách K8s-native để kubelet truyền credential cho containerd khi pull. Thiếu nó → pod `ImagePullBackOff` với lỗi `401 Unauthorized`.

---

## 9. Cài GitHub Actions self-hosted runner

> **Self-hosted runner** = một tiến trình chạy trên máy bạn, **chủ động kết nối ra** GitHub qua HTTPS để xin job. Vì runner gọi RA ngoài, bạn **không cần mở port nào vào** máy — rất an toàn về mặt network.

### 9.1. Lấy token & cài runner

Trên GitHub: **repo → Settings → Actions → Runners → New self-hosted runner → Linux**. GitHub đưa các lệnh có sẵn token (token chỉ sống ~1h, dùng để đăng ký). Đại khái:

```bash
# Tạo user riêng cho runner (đừng chạy bằng root)
sudo useradd -m -s /bin/bash gh-runner
sudo usermod -aG docker gh-runner          # cho phép runner gọi docker build
sudo su - gh-runner

mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.317.0/actions-runner-linux-x64-2.317.0.tar.gz
tar xzf actions-runner-linux-x64.tar.gz

# Cấu hình (URL + TOKEN lấy từ trang GitHub). Đặt label để workflow chọn đúng runner
./config.sh --url https://github.com/<owner>/<repo> \
  --token <REGISTRATION_TOKEN> \
  --labels self-hosted,linux,k8s-deployer \
  --name k8s-master-runner --unattended
```

### 9.2. Chạy runner như service (tự bật khi reboot)

```bash
exit   # thoát khỏi user gh-runner, về user có sudo
cd /home/gh-runner/actions-runner
sudo ./svc.sh install gh-runner
sudo ./svc.sh start
sudo ./svc.sh status
```

### 9.3. Cho runner quyền chạy kubectl

Runner sẽ chạy `kubectl apply`, nên nó cần kubeconfig. Cách đơn giản (lab) — copy kubeconfig cho user `gh-runner`:

```bash
sudo mkdir -p /home/gh-runner/.kube
sudo cp /etc/kubernetes/admin.conf /home/gh-runner/.kube/config
sudo chown -R gh-runner:gh-runner /home/gh-runner/.kube
```

> **Cảnh báo bảo mật**: `admin.conf` là quyền **admin toàn cluster**. Trên hệ thống thật, hãy tạo `ServiceAccount` + `Role/RoleBinding` giới hạn runner chỉ được `apply` trong đúng namespace của app, rồi sinh kubeconfig từ token của ServiceAccount đó. Xem Phần 12.

Quay lại GitHub → Settings → Actions → Runners, bạn sẽ thấy runner **Idle (xanh)**. Đã sẵn sàng nhận job.

---

## 10. Manifest Kubernetes cho ứng dụng

Để trong repo, ví dụ `k8s/deployment.yaml`. Đây là app demo (thay bằng app của bạn):

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  labels: { app: myapp }
spec:
  replicas: 2
  selector: { matchLabels: { app: myapp } }
  template:
    metadata: { labels: { app: myapp } }
    spec:
      imagePullSecrets:
        - name: regcred                       # <- secret tạo ở Phần 8
      containers:
        - name: myapp
          image: registry.local:5000/myapp:latest   # workflow sẽ ghi đè tag
          ports: [{ containerPort: 8080 }]
          readinessProbe:                      # K8s chỉ route traffic khi app sẵn sàng
            httpGet: { path: /, port: 8080 }
            initialDelaySeconds: 3
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: myapp
spec:
  type: NodePort
  selector: { app: myapp }
  ports:
    - { port: 80, targetPort: 8080, nodePort: 30080 }
```

Và một `Dockerfile` ở gốc repo (ví dụ app Node):

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8080
CMD ["node", "server.js"]
```

> **Vì sao có `readinessProbe`?** Khi deploy bản mới, K8s làm **rolling update**: chỉ tắt pod cũ sau khi pod mới đã `Ready`. Không có readinessProbe, K8s coi pod "sống" ngay khi container start (dù app chưa nghe port) → traffic vào pod chưa sẵn sàng → user thấy 502 lúc deploy. Probe = deploy không downtime.

---

## 11. Workflow GitHub Actions — build, push, deploy tự động

Đây là mảnh ghép cuối: `.github/workflows/deploy.yml`. Mỗi `git push` lên `main` → runner build image, push lên registry, rồi cập nhật Deployment.

```yaml
# .github/workflows/deploy.yml
name: Build & Deploy to K8s

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    # Chạy trên CHÍNH runner của bạn, chọn bằng label đã đặt ở Phần 9
    runs-on: [self-hosted, linux, k8s-deployer]

    env:
      REGISTRY: registry.local:5000
      IMAGE: myapp

    steps:
      - name: Checkout source
        uses: actions/checkout@v4

      # Dùng commit SHA làm tag => mỗi build 1 tag bất biến, dễ rollback
      - name: Set image tag
        id: vars
        run: echo "tag=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

      - name: Login to private registry
        # Credential lưu trong repo Secrets (Settings → Secrets → Actions)
        run: |
          echo "${{ secrets.REGISTRY_PASSWORD }}" | \
            docker login $REGISTRY -u "${{ secrets.REGISTRY_USERNAME }}" --password-stdin

      - name: Build image
        run: |
          docker build -t $REGISTRY/$IMAGE:${{ steps.vars.outputs.tag }} \
                       -t $REGISTRY/$IMAGE:latest .

      - name: Push image
        run: |
          docker push $REGISTRY/$IMAGE:${{ steps.vars.outputs.tag }}
          docker push $REGISTRY/$IMAGE:latest

      - name: Deploy to Kubernetes
        run: |
          # Áp manifest (idempotent — tạo mới hoặc cập nhật cấu hình)
          kubectl apply -f k8s/deployment.yaml
          # Cập nhật image sang tag vừa build => kích hoạt rolling update
          kubectl set image deployment/myapp \
            myapp=$REGISTRY/$IMAGE:${{ steps.vars.outputs.tag }}
          # Chờ rollout xong; nếu pod mới không Ready trong 120s => fail build
          kubectl rollout status deployment/myapp --timeout=120s
```

Tạo secrets cho workflow: **repo → Settings → Secrets and variables → Actions → New repository secret**:

- `REGISTRY_USERNAME` = `deployer`
- `REGISTRY_PASSWORD` = `Str0ngP@ss`

> **Vì sao tag bằng commit SHA chứ không chỉ `latest`?**
> - `latest` "trôi" — không biết version nào đang chạy, rollback mù.
> - SHA `a1b2c3d` là **bất biến**: mỗi commit ↔ một image cố định. Muốn rollback chỉ cần `kubectl set image ... myapp=...:<sha-cũ>`.
> - `kubectl set image` với cùng `latest` thường **không trigger** rolling update (manifest không đổi → K8s nghĩ "không có gì mới"). Đổi tag mới mỗi lần ép K8s thực sự deploy.

> **Vì sao `rollout status --timeout`?** Để workflow **biết deploy thất bại**. Nếu image lỗi/crash, pod mới không bao giờ `Ready`; lệnh này hết giờ và trả exit code ≠ 0 → job đỏ → bạn được báo ngay, thay vì tưởng deploy thành công.

### Luồng đầy đủ khi bạn `git push`

```text
git push origin main
   │
   ▼
GitHub nhận push → trigger workflow → đẩy job xuống runner (label k8s-deployer)
   │
   ▼  (trên máy Ubuntu của bạn)
checkout → docker build → docker push registry.local:5000/myapp:<sha>
   │
   ▼
kubectl set image → K8s thấy tag mới → tạo pod mới (containerd PULL từ registry)
   │
   ▼
pod mới Ready (readinessProbe) → K8s tắt pod cũ → rollout status OK → job xanh ✅
```

### 11.1. Kiểm chứng end-to-end — "làm hết là chạy được"

Đây là bài test cuối cùng. Nếu bước này xanh, **toàn bộ pipeline đã hoạt động**.

```bash
# 1) Trên máy dev: sửa 1 dòng code bất kỳ rồi push
git commit -am "test: trigger pipeline"
git push origin main
```

Theo dõi trên GitHub (**repo → Actions**): job chạy trên runner của bạn, lần lượt build → push → deploy, kết thúc **xanh**.

```bash
# 2) Trên máy master: xác nhận K8s đã chạy image mới
kubectl get pods -l app=myapp        # 2 pod Running, AGE mới (vài giây/phút)
kubectl get deployment myapp -o jsonpath='{.spec.template.spec.containers[0].image}'
# => registry.local:5000/myapp:<sha-vừa-commit>  (đúng commit vừa push)

# 3) Gọi thử app qua NodePort (đặt ở manifest, 30080)
curl http://localhost:30080
# hoặc từ máy khác: curl http://192.168.1.10:30080
```

Bảng "đã xong" — nếu cả 4 đều đúng thì coi như hoàn thành:

| Kiểm tra | Lệnh | Kỳ vọng |
|---|---|---|
| Cụm khỏe | `kubectl get nodes` | tất cả `Ready` |
| Registry chạy | `curl -k -u deployer:Str0ngP@ss https://registry.local:5000/v2/_catalog` | trả JSON danh sách repo |
| Runner online | repo → Settings → Actions → Runners | `Idle`/`Active` (xanh) |
| App live | `curl http://localhost:30080` | trả response của app |

Từ giờ, **mỗi `git push origin main`** sẽ tự build image mới (tag = SHA), đẩy lên registry, và rolling-update vào K8s — không cần thao tác tay.

---

## 12. Bảo mật & best practices (đừng bỏ qua nếu chạy thật)

1. **Đừng cho runner quyền admin cluster.** Tạo ServiceAccount giới hạn:

   ```yaml
   # rbac-deployer.yaml — runner chỉ được sửa workload trong namespace "production"
   apiVersion: v1
   kind: ServiceAccount
   metadata: { name: ci-deployer, namespace: production }
   ---
   apiVersion: rbac.authorization.k8s.io/v1
   kind: Role
   metadata: { name: deployer, namespace: production }
   rules:
     - apiGroups: ["apps"]
       resources: ["deployments"]
       verbs: ["get", "list", "patch", "update", "create"]
     - apiGroups: [""]
       resources: ["services", "pods"]
       verbs: ["get", "list"]
   ---
   apiVersion: rbac.authorization.k8s.io/v1
   kind: RoleBinding
   metadata: { name: deployer, namespace: production }
   subjects: [{ kind: ServiceAccount, name: ci-deployer, namespace: production }]
   roleRef: { kind: Role, name: deployer, apiGroup: rbac.authorization.k8s.io }
   ```

   Rồi sinh kubeconfig từ token của `ci-deployer` thay cho `admin.conf`.

2. **Secret không nằm trong code.** Mọi password/token để trong GitHub Actions Secrets, không hardcode trong YAML.

3. **Self-hosted runner + public repo = nguy hiểm.** Bất kỳ ai fork và mở PR có thể chạy code tùy ý **trên máy bạn**. Chỉ dùng self-hosted runner cho **private repo**, hoặc bật "require approval for all outside collaborators".

4. **Đừng chạy runner bằng `root`.** Dùng user riêng (`gh-runner`) + chỉ thêm vào group `docker`.

5. **Backup `/etc/kubernetes/pki` và etcd.** Mất chứng chỉ control-plane = dựng lại cluster từ đầu.

6. **TLS thật khi có thể.** Self-signed ổn cho lab; production nên dùng cert do CA nội bộ ký, hoặc đặt registry sau ingress + cert-manager.

---

## 13. Sổ tay gỡ lỗi (tra nhanh khi kẹt)

| Triệu chứng | Nguyên nhân thường gặp | Cách sửa |
|---|---|---|
| `kubeadm init` fail ở preflight | Còn swap / thiếu module / sai cgroup | Làm lại Phần 1 & 2; `SystemdCgroup=true` |
| Node `NotReady` mãi | Chưa cài CNI, hoặc containerd cgroup sai | `kubectl get pods -A` xem flannel; check Phần 2 |
| `kubectl` báo `localhost:8080 refused` | Chưa copy kubeconfig | Làm lại Phần 4 (copy `admin.conf`) |
| Pod `ImagePullBackOff` + `x509` | containerd chưa tin cert registry | Phần 7.2 trên **mọi** node |
| Pod `ImagePullBackOff` + `401` | Thiếu/sai `imagePullSecret` | Phần 8; kiểm tra user/pass |
| Pod `Pending` + `untolerated taint` | Single-node chưa gỡ taint | Phần 4.2 |
| Worker join xong vẫn `NotReady` | Firewall chặn 6443/8472, hoặc flannel chưa lên | Mở port; `kubectl get pods -A -o wide` |
| Push `docker` báo `x509` | Docker chưa tin cert | Phần 7.1; restart docker |
| Workflow `kubectl: command not found` | Runner không có kubectl trong PATH | Cài kubectl cho user gh-runner / dùng đường dẫn tuyệt đối |
| Deploy "thành công" nhưng app cũ | Vẫn tag `latest`, K8s không thấy thay đổi | Tag bằng SHA (Phần 11) |
| `rollout status` timeout | Image crash / readinessProbe fail | `kubectl logs`, `kubectl describe pod` |

Lệnh debug hay dùng:

```bash
kubectl get pods -A -o wide          # nhìn toàn cảnh, ở node nào
kubectl describe pod <pod>           # xem Events (lý do pull fail, schedule fail)
kubectl logs <pod> [--previous]      # log app; --previous xem pod vừa crash
sudo journalctl -u kubelet -f        # log kubelet khi node có vấn đề
sudo crictl ps                       # liệt kê container do containerd quản lý
```

---

## 14. Tóm tắt — checklist từ máy trắng tới CI/CD

1. **Mọi node**: update → tắt swap → bật module/sysctl (Phần 1).
2. **Mọi node**: cài containerd, đặt `SystemdCgroup=true` (Phần 2).
3. **Mọi node**: cài kubeadm/kubelet/kubectl từ `pkgs.k8s.io`, `apt-mark hold` (Phần 3).
4. **Master**: `kubeadm init` → copy kubeconfig → cài Flannel → (1 máy thì gỡ taint) (Phần 4).
5. **Worker**: `kubeadm join` bằng token từ master (Phần 5).
6. Dựng **Docker Registry** có TLS + auth, cài Docker Engine để build (Phần 6).
7. Dạy **Docker và containerd** tin cert registry — làm **cả hai**, **mọi node** (Phần 7).
8. Tạo **imagePullSecret** `regcred` cho K8s pull (Phần 8).
9. Cài **self-hosted runner** (user riêng, vào group docker, có kubeconfig), chạy as service (Phần 9).
10. Để **manifest + Dockerfile** trong repo (Phần 10).
11. Viết **workflow** build → push (tag = SHA) → `kubectl set image` → `rollout status` (Phần 11).
12. Siết **RBAC**, secret, runner trên private repo (Phần 12).

Sau khi xong, mỗi `git push origin main` sẽ tự động build và deploy. Bạn đã có một pipeline CI/CD hoàn chỉnh chạy trên hạ tầng của chính mình.

> **3 bài học cốt lõi cần nhớ mãi:**
> 1. *Build* (Docker) và *Run* (containerd) là hai việc khác nhau — chúng chỉ gặp nhau ở **Registry**.
> 2. Trust cho registry phải cấu hình **hai lần** (Docker để push, containerd để pull) trên **mọi node** — đây là lỗi tốn thời gian nhất.
> 3. Tag image bằng **commit SHA bất biến**, không bằng `latest` — để rollout thực sự chạy và rollback được.

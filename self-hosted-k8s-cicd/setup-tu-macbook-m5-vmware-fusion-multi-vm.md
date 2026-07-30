# Dựng hệ thống thực tế từ MacBook Pro M5 — VMware Fusion + nhiều VM Ubuntu (K8s master/worker + Registry riêng + Runner riêng + CI/CD cho BE & FE)

> Bối cảnh: Bạn có **một MacBook Pro M5**, trong IDE đang có **code backend + frontend** chạy được ở chế độ dev. Chưa có gì khác. Mục tiêu: dựng **nguyên một hệ thống nhiều máy** (giả lập bằng VM) giống production — master, worker, registry riêng, runner riêng — rồi nối CI/CD để `git push` là tự động build & deploy cả BE lẫn FE vào cụm.

Bài này là **người anh em "đa máy, môi trường thật"** của bài [`setup-k8s-cicd-mot-may-ubuntu.md`](./setup-k8s-cicd-mot-may-ubuntu.md). Những giải thích **"vì sao"** sâu (vì sao tắt swap, vì sao `SystemdCgroup`, vì sao tag SHA...) và **toàn bộ chương troubleshooting (Phần 13)** ở bài đó **dùng chung** — ở đây tôi tập trung vào thứ *khác*: VMware Fusion, mạng nhiều VM, ARM64, tách registry/runner, và deploy 2 service BE + FE.

---

## 0. Điều PHẢI biết trước khi gõ phím: M5 = ARM64

> **MacBook Pro M5 dùng chip Apple Silicon (kiến trúc ARM64/aarch64).** VMware Fusion trên Apple Silicon **chỉ chạy được máy ảo ARM64** — không chạy được Ubuntu/Windows x86. Hệ quả dây chuyền:

- Phải tải **Ubuntu Server cho ARM64** (không phải bản amd64).
- Mọi gói (containerd, kubeadm, Docker) cài từ repo **arm64** — may là `pkgs.k8s.io` và repo Docker đều có arm64.
- **Mọi container image phải là `linux/arm64`.** Image multi-arch phổ biến (`node`, `nginx`, `registry`, `redis`, `postgres`...) đều có sẵn arm64 nên thường "chạy luôn". Nhưng nếu lỡ pull/build một image chỉ có amd64 → pod chết với lỗi **`exec format error`**. Nhớ kỹ triệu chứng này.
- **Lợi thế**: runner cũng là VM ARM64, nên `docker build` cho ra image arm64 **native, không cần giả lập QEMU** → build nhanh, khớp y hệt cụm. (Chỉ khi nào cần image amd64 mới phải dùng `buildx` + QEMU.)

### Topology — 5 VM, tách bạch như production

```text
                 ┌──────────────────────────────────────────────┐
   MacBook M5    │  macOS (host)                                 │
   (ARM64)       │   - IDE: code BE + FE (chạy dev ở đây)        │
                 │   - VMware Fusion quản lý 5 VM ARM64          │
                 │   - kubectl trên Mac trỏ vào cụm (tùy chọn)   │
                 └───────────────────────┬──────────────────────┘
                                         │ Fusion NAT network (vmnet)
   ┌─────────────┬─────────────┬─────────┴───────┬──────────────┬─────────────┐
   ▼             ▼             ▼                 ▼              ▼
┌────────┐  ┌────────┐  ┌────────┐        ┌────────────┐  ┌────────────┐
│vm-master│  │vm-work1│  │vm-work2│        │ vm-registry│  │  vm-runner │
│ control │  │workload│  │workload│        │ registry:2 │  │ Docker(buil│
│ -plane  │  │ BE/FE  │  │ BE/FE  │        │ TLS + auth │  │ d)+GH runner│
│.10      │  │.11     │  │.12     │        │ .20        │  │ +kubectl .30│
└────┬────┘  └───┬────┘  └───┬────┘        └─────┬──────┘  └──────┬─────┘
     └───────────┴───────────┴── K8s cluster ────┘                │
                  (containerd PULL image từ .20)        push image │
                                                        ───────────┘
```

| VM | Vai trò | vCPU | RAM | Disk | IP (ví dụ) | Hostname |
|---|---|---|---|---|---|---|
| `vm-master` | Control-plane (không chạy app) | 4 | 6 GB | 40 GB | 192.168.184.10 | k8s-master |
| `vm-worker-1` | Chạy pod BE + FE | 4 | 8 GB | 40 GB | 192.168.184.11 | k8s-worker-1 |
| `vm-worker-2` | Chạy pod BE + FE | 4 | 8 GB | 40 GB | 192.168.184.12 | k8s-worker-2 |
| `vm-registry` | Docker Registry riêng | 2 | 4 GB | 60 GB | 192.168.184.20 | registry |
| `vm-runner` | Build image + GitHub runner | 4 | 8 GB | 60 GB | 192.168.184.30 | gh-runner |

> Tổng ~34 GB RAM cho VM, để lại ~14 GB cho macOS — thoải mái với 48 GB. Disk registry/runner để lớn vì chứa nhiều image. **IP ở trên là ví dụ** — subnet thật do Fusion cấp, bạn sẽ xác nhận ở Phần 1.4.

---

## 1. Tạo VM trong VMware Fusion (ARM64)

### 1.1. Tải Ubuntu Server ARM64

Tải **Ubuntu Server 24.04 LTS — ARM64** (`.iso` cho `arm64`/`aarch64`) từ trang Ubuntu (mục "Ubuntu Server for ARM"). **Đừng tải bản amd64** — Fusion trên M5 sẽ không boot được.

> Dùng **Server** (không GUI) để nhẹ. 5 VM chạy nền, không cần desktop.

### 1.2. Tạo "base VM" rồi clone (mẹo tiết kiệm thời gian)

Thay vì cài OS 5 lần, cài **1 VM gốc** rồi nhân bản:

1. Fusion → **File → New → Install from disc or image** → chọn ISO ARM64.
2. Cấu hình ban đầu: 2 vCPU, 2 GB (sẽ chỉnh lại sau khi clone), disk 40 GB.
3. Trong trình cài Ubuntu: đặt user (vd `ubuntu`), **bật "Install OpenSSH server"** (để SSH từ Mac).
4. Cài xong, `sudo apt update && sudo apt upgrade -y`, rồi **tắt máy**.
5. Fusion → chuột phải VM gốc → **Create Full Clone** ra 5 bản, đặt tên `vm-master`, `vm-worker-1`, ... 

> **Vì sao Full Clone (không Linked Clone)?** Linked clone chia sẻ disk gốc — nhẹ nhưng các node phụ thuộc nhau, không giống máy thật và dễ vỡ khi xóa VM gốc. Full clone độc lập, giống 5 máy vật lý.

Sau khi clone, với **mỗi VM** chỉnh: **Settings → Processors & Memory** đặt đúng vCPU/RAM theo bảng ở Phần 0.

### 1.3. Chọn kiểu mạng: NAT (Share with my Mac)

Fusion có vài kiểu mạng. Với cụm nhiều VM + cần ra internet (GitHub) + Mac truy cập được:

| Kiểu mạng | VM ra internet? | VM thấy nhau? | Mac thấy VM? | Khuyến nghị |
|---|---|---|---|---|
| **Share with my Mac (NAT)** | ✅ | ✅ | ✅ (qua vmnet) | ⭐ Dùng cái này — ổn định mọi mạng |
| Bridged | ✅ | ✅ | ✅ | OK ở mạng nhà; mạng công ty/wifi khách hay chặn |
| Private to my Mac (host-only) | ❌ | ✅ | ✅ | Không ra internet → runner không gọi được GitHub |

→ Đặt **mọi VM** dùng **Share with my Mac (NAT)**: Settings → Network Adapter → "Share with my Mac".

> **Vì sao NAT chứ không Bridged?** Bridged phụ thuộc router/wifi hiện tại — đổi mạng (về nhà / ra quán) là IP đổi, cụm vỡ. NAT tạo một mạng ảo cố định *do Fusion quản lý*, không phụ thuộc wifi → IP ổn định, mang máy đi đâu cũng chạy.

### 1.4. Xác nhận subnet NAT & đặt IP tĩnh (netplan)

Bật `vm-master` lên, xem subnet Fusion cấp:

```bash
ip -4 addr show           # ví dụ thấy 192.168.184.128/24 → subnet 192.168.184.0/24
ip route | grep default   # ví dụ default via 192.168.184.2 → đây là gateway
```

> Subnet của bạn có thể là `192.168.x.0/24` khác con số. **Lấy đúng subnet + gateway máy bạn** rồi thay vào bên dưới. (Mặc định Fusion NAT: gateway thường là `.2`, DNS cũng `.2`.)

Đặt **IP tĩnh** trên từng VM bằng netplan (để IP không nhảy theo DHCP — cụm rất ghét IP đổi). Trên `vm-master`:

```bash
sudo tee /etc/netplan/99-static.yaml >/dev/null <<'EOF'
network:
  version: 2
  ethernets:
    ens160:                       # tên card: kiểm tra bằng `ip -4 addr` (có thể là ens33/eth0)
      dhcp4: no
      addresses: [192.168.184.10/24]
      routes:
        - to: default
          via: 192.168.184.2      # gateway NAT của bạn
      nameservers:
        addresses: [192.168.184.2, 8.8.8.8]
EOF
sudo chmod 600 /etc/netplan/99-static.yaml
sudo netplan apply
```

Lặp lại cho từng VM với IP tương ứng (`.11`, `.12`, `.20`, `.30`). Đổi luôn hostname mỗi máy:

```bash
sudo hostnamectl set-hostname k8s-master    # đổi theo từng VM
```

### 1.5. Đặt `/etc/hosts` trên TẤT CẢ VM (và cả Mac)

Để các máy gọi nhau bằng tên. Trên **mọi VM**:

```bash
sudo tee -a /etc/hosts >/dev/null <<'EOF'
192.168.184.10  k8s-master
192.168.184.11  k8s-worker-1
192.168.184.12  k8s-worker-2
192.168.184.20  registry.local
192.168.184.30  gh-runner
EOF
```

Trên **Mac** (để sau này truy cập app & registry từ macOS) — sửa `/etc/hosts`:

```bash
# Trên macOS Terminal:
sudo sh -c 'cat >> /etc/hosts' <<'EOF'
192.168.184.10  k8s-master
192.168.184.11  k8s-worker-1
192.168.184.20  registry.local
192.168.184.30  gh-runner
EOF
```

Kiểm tra liên thông (từ Mac):

```bash
ssh ubuntu@192.168.184.10    # vào được là mạng OK
ping -c2 192.168.184.20      # các VM thấy nhau
```

> **Mẹo SSH không mật khẩu**: `ssh-copy-id ubuntu@192.168.184.10` cho từng VM. Quản 5 máy bằng mật khẩu rất mệt.

---

## 2. Chuẩn bị node K8s (chạy trên `vm-master`, `vm-worker-1`, `vm-worker-2`)

> Phần này **chỉ làm trên 3 VM K8s**. `vm-registry` và `vm-runner` KHÔNG cần (chúng không phải node K8s). Giải thích "vì sao" từng dòng xem [bài 1 — Phần 1](./setup-k8s-cicd-mot-may-ubuntu.md).

```bash
# Tắt swap
sudo swapoff -a
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab

# Kernel modules + sysctl
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF
sudo modprobe overlay && sudo modprobe br_netfilter

cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sudo sysctl --system
```

---

## 3. Cài containerd (trên 3 VM K8s)

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
# Lưu ý: $(dpkg --print-architecture) trên M5 sẽ trả "arm64" — repo tự lấy đúng gói ARM
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y containerd.io

# Bật systemd cgroup driver — bắt buộc
sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml > /dev/null
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
sudo systemctl restart containerd && sudo systemctl enable containerd
```

---

## 4. Cài kubeadm/kubelet/kubectl (trên 3 VM K8s)

```bash
K8S_VERSION=v1.30
sudo apt-get install -y apt-transport-https
curl -fsSL https://pkgs.k8s.io/core:/stable:/${K8S_VERSION}/deb/Release.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
https://pkgs.k8s.io/core:/stable:/${K8S_VERSION}/deb/ /" | \
  sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl
```

> `pkgs.k8s.io` phục vụ cả arm64 — `apt` tự chọn đúng gói cho M5, không cần làm gì thêm.

---

## 5. Khởi tạo cụm trên `vm-master`

```bash
sudo kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --apiserver-advertise-address=192.168.184.10    # IP tĩnh của master
```

Cấu hình kubectl cho user trên master:

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config
```

Cài CNI Flannel:

```bash
kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml
```

> **KHÔNG gỡ taint master ở đây.** Đây là cụm nhiều máy — master chỉ làm control-plane, để 2 worker chạy app (đúng kiểu production). Đây là khác biệt so với bài 1 (single-node thì mới gỡ taint).

**Copy lại lệnh `kubeadm join ...`** trong output để dùng ở Phần 6.

---

## 6. Join 2 worker

Trên `vm-worker-1` và `vm-worker-2`, dán lệnh join (lấy từ output `kubeadm init`):

```bash
sudo kubeadm join 192.168.184.10:6443 --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

Token hết hạn? Trên master: `kubeadm token create --print-join-command`.

Kiểm tra trên master (chờ ~1 phút cho flannel rải xuống worker):

```bash
kubectl get nodes -o wide
# k8s-master    Ready   control-plane   ...   192.168.184.10
# k8s-worker-1  Ready   <none>          ...   192.168.184.11
# k8s-worker-2  Ready   <none>          ...   192.168.184.12
```

---

## 7. Dựng Docker Registry trên `vm-registry`

Trên **vm-registry**, cài Docker (chỉ để chạy container registry) + tạo TLS/auth:

```bash
# Cài Docker Engine (arm64)
sudo apt-get update
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io
sudo usermod -aG docker $USER    # logout/login lại

# Thư mục dữ liệu/cert/auth
sudo mkdir -p /opt/registry/{certs,auth,data}
cd /opt/registry

# Cert tự ký — SAN phải gồm hostname + IP của vm-registry
sudo openssl req -newkey rsa:4096 -nodes -sha256 \
  -keyout certs/domain.key -x509 -days 3650 -out certs/domain.crt \
  -subj "/CN=registry.local" \
  -addext "subjectAltName=DNS:registry.local,IP:192.168.184.20"

# Tài khoản
sudo apt-get install -y apache2-utils
htpasswd -Bbn deployer 'Str0ngP@ss' | sudo tee auth/htpasswd

# Chạy registry (image registry:2 là multi-arch → tự lấy bản arm64)
docker run -d --restart=always --name registry -p 5000:5000 \
  -v /opt/registry/data:/var/lib/registry \
  -v /opt/registry/certs:/certs -v /opt/registry/auth:/auth \
  -e REGISTRY_HTTP_TLS_CERTIFICATE=/certs/domain.crt \
  -e REGISTRY_HTTP_TLS_KEY=/certs/domain.key \
  -e "REGISTRY_AUTH=htpasswd" -e "REGISTRY_AUTH_HTPASSWD_REALM=Registry Realm" \
  -e REGISTRY_AUTH_HTPASSWD_PATH=/auth/htpasswd \
  registry:2
```

Test ngay trên vm-registry:

```bash
curl -k -u deployer:Str0ngP@ss https://registry.local:5000/v2/_catalog
# {"repositories":[]}  ← registry sống
```

> **Copy `domain.crt` ra để phát cho các máy khác** (master, 2 worker, runner đều cần tin cert này). Cách nhanh: từ mỗi máy `scp ubuntu@192.168.184.20:/opt/registry/certs/domain.crt /tmp/`.

---

## 8. Cho các máy TIN cert registry

Cert tự ký → phải cài thủ công ở 2 nhóm client (xem [bài 1 — Phần 7](./setup-k8s-cicd-mot-may-ubuntu.md) để hiểu vì sao tách Docker vs containerd):

### 8.1. containerd trên 3 VM K8s (để pod PULL được)

Làm trên `vm-master`, `vm-worker-1`, `vm-worker-2`:

```bash
scp ubuntu@192.168.184.20:/opt/registry/certs/domain.crt /tmp/domain.crt
sudo mkdir -p /etc/containerd/certs.d/registry.local:5000 /opt/registry/certs
sudo cp /tmp/domain.crt /opt/registry/certs/domain.crt
sudo tee /etc/containerd/certs.d/registry.local:5000/hosts.toml >/dev/null <<EOF
server = "https://registry.local:5000"
[host."https://registry.local:5000"]
  capabilities = ["pull", "resolve"]
  ca = "/opt/registry/certs/domain.crt"
EOF
sudo sed -i '/\[plugins."io.containerd.grpc.v1.cri".registry\]/a\    config_path = "/etc/containerd/certs.d"' \
  /etc/containerd/config.toml
sudo systemctl restart containerd

# Test bằng đúng runtime của K8s:
sudo crictl pull registry.local:5000/hello || echo "(chưa có image cũng không sao, miễn không lỗi x509)"
```

### 8.2. Docker trên `vm-runner` (để PUSH được) — làm ở Phần 10.

---

## 9. Tạo imagePullSecret (trên master)

```bash
kubectl create secret docker-registry regcred \
  --docker-server=registry.local:5000 \
  --docker-username=deployer --docker-password='Str0ngP@ss'
# (tạo trong namespace app — ở đây dùng namespace mặc định 'default')
```

---

## 10. Dựng `vm-runner`: Docker (build) + GitHub Actions runner + kubectl

Trên **vm-runner**:

### 10.1. Docker Engine (để build image arm64) + tin cert

```bash
# Cài Docker (như Phần 7)
sudo apt-get update && sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin

# Cho Docker tin cert registry
scp ubuntu@192.168.184.20:/opt/registry/certs/domain.crt /tmp/domain.crt
sudo mkdir -p /etc/docker/certs.d/registry.local:5000
sudo cp /tmp/domain.crt /etc/docker/certs.d/registry.local:5000/ca.crt
sudo systemctl restart docker

# Test push
sudo docker login registry.local:5000 -u deployer -p 'Str0ngP@ss'
```

### 10.2. kubectl + kubeconfig (để runner deploy được vào cụm)

```bash
# Cài kubectl trên runner
sudo apt-get install -y apt-transport-https
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] \
https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /" | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update && sudo apt-get install -y kubectl

# Lấy kubeconfig từ master (lab — production nên dùng ServiceAccount RBAC, xem bài 1 Phần 12)
mkdir -p ~/.kube
scp ubuntu@192.168.184.10:/home/ubuntu/.kube/config ~/.kube/config
# QUAN TRỌNG: sửa server trong kubeconfig trỏ tới IP master (không phải 127.0.0.1)
sed -i 's#server: https://.*:6443#server: https://192.168.184.10:6443#' ~/.kube/config
kubectl get nodes     # phải thấy 3 node Ready từ vm-runner
```

> **Bẫy hay gặp**: kubeconfig từ master ghi `server: https://127.0.0.1:6443` hoặc tên nội bộ. Từ máy runner, `127.0.0.1` là chính nó → fail. Phải đổi sang IP thật của master như trên.

### 10.3. Cài GitHub Actions runner

Trên GitHub: **repo → Settings → Actions → Runners → New self-hosted runner → Linux → ARM64** (nhớ chọn **ARM64**, GitHub sẽ đưa link tarball arm64).

```bash
sudo usermod -aG docker ubuntu     # cho user chạy runner build được; logout/login lại
mkdir actions-runner && cd actions-runner
# URL tarball ARM64 lấy từ trang GitHub (…-linux-arm64-….tar.gz)
curl -o runner.tar.gz -L https://github.com/actions/runner/releases/download/v2.317.0/actions-runner-linux-arm64-2.317.0.tar.gz
tar xzf runner.tar.gz
./config.sh --url https://github.com/<owner>/<repo> --token <REGISTRATION_TOKEN> \
  --labels self-hosted,linux,arm64,k8s-deployer --name vm-runner --unattended
sudo ./svc.sh install ubuntu
sudo ./svc.sh start
sudo ./svc.sh status
```

> Vì user chạy runner là `ubuntu` và kubeconfig nằm ở `/home/ubuntu/.kube/config`, runner dùng `kubectl` được luôn. Đảm bảo `ubuntu` đã ở group `docker` *trước khi* start service (group mới chỉ áp dụng sau khi restart service).

---

## 11. App BE + FE — Dockerfile & manifest (đặt trong repo)

Bạn đang có code BE + FE chạy dev trong IDE. Giờ đóng gói thành 2 image arm64 và deploy.

### 11.1. Dockerfile Backend — ví dụ Node/Express (`backend/Dockerfile`)

```dockerfile
FROM node:20-alpine          # node:20-alpine là multi-arch → arm64 OK
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### 11.2. Dockerfile Frontend — build tĩnh rồi serve bằng nginx (`frontend/Dockerfile`)

```dockerfile
# --- build stage ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # ra thư mục dist/ (Vite) hoặc build/ (CRA)

# --- runtime stage: nginx phục vụ file tĩnh + proxy /api sang backend ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`frontend/nginx.conf` — FE gọi `/api/...`, nginx chuyển tới Service backend trong cụm:

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  location / {
    try_files $uri $uri/ /index.html;     # SPA routing
  }
  location /api/ {
    proxy_pass http://backend:3000/;      # 'backend' = tên Service K8s (DNS nội bộ)
    proxy_set_header Host $host;
  }
}
```

> **Vì sao FE proxy `/api` qua nginx?** FE build tĩnh không biết IP backend lúc runtime. Cho nginx trong pod FE proxy sang Service `backend` (K8s tự phân giải DNS `backend.default.svc`) → FE chỉ cần gọi đường dẫn tương đối `/api`, không hardcode IP. Đây là cách gọn nhất khi cả hai cùng trong cụm.

### 11.3. Manifest K8s (`k8s/app.yaml`)

```yaml
# ---------- Backend ----------
apiVersion: apps/v1
kind: Deployment
metadata: { name: backend, labels: { app: backend } }
spec:
  replicas: 2
  selector: { matchLabels: { app: backend } }
  template:
    metadata: { labels: { app: backend } }
    spec:
      imagePullSecrets: [{ name: regcred }]
      containers:
        - name: backend
          image: registry.local:5000/backend:latest   # workflow ghi đè tag SHA
          ports: [{ containerPort: 3000 }]
          readinessProbe: { httpGet: { path: /health, port: 3000 }, initialDelaySeconds: 3, periodSeconds: 5 }
---
apiVersion: v1
kind: Service
metadata: { name: backend }
spec:
  selector: { app: backend }
  ports: [{ port: 3000, targetPort: 3000 }]      # ClusterIP — chỉ gọi nội bộ (FE proxy tới)
---
# ---------- Frontend ----------
apiVersion: apps/v1
kind: Deployment
metadata: { name: frontend, labels: { app: frontend } }
spec:
  replicas: 2
  selector: { matchLabels: { app: frontend } }
  template:
    metadata: { labels: { app: frontend } }
    spec:
      imagePullSecrets: [{ name: regcred }]
      containers:
        - name: frontend
          image: registry.local:5000/frontend:latest
          ports: [{ containerPort: 80 }]
          readinessProbe: { httpGet: { path: /, port: 80 }, initialDelaySeconds: 3, periodSeconds: 5 }
---
apiVersion: v1
kind: Service
metadata: { name: frontend }
spec:
  type: NodePort
  selector: { app: frontend }
  ports: [{ port: 80, targetPort: 80, nodePort: 30080 }]   # entrypoint ra ngoài cụm
```

> Chỉ **frontend** mở ra ngoài (NodePort 30080). **backend** để ClusterIP (kín) vì user không gọi thẳng BE — chỉ FE (nginx) gọi nội bộ. Đây là pattern phổ biến và an toàn.

---

## 12. Workflow CI/CD — build cả BE + FE, push, deploy (`.github/workflows/deploy.yml`)

```yaml
name: Build & Deploy (BE + FE) to K8s

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: [self-hosted, linux, arm64, k8s-deployer]   # chạy trên vm-runner ARM64
    env:
      REGISTRY: registry.local:5000
    steps:
      - uses: actions/checkout@v4

      - name: Tag = commit SHA
        id: vars
        run: echo "tag=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"

      - name: Login registry
        run: echo "${{ secrets.REGISTRY_PASSWORD }}" | \
             docker login $REGISTRY -u "${{ secrets.REGISTRY_USERNAME }}" --password-stdin

      # --- Backend ---
      - name: Build & push backend
        run: |
          docker build -t $REGISTRY/backend:${{ steps.vars.outputs.tag }} ./backend
          docker push   $REGISTRY/backend:${{ steps.vars.outputs.tag }}

      # --- Frontend ---
      - name: Build & push frontend
        run: |
          docker build -t $REGISTRY/frontend:${{ steps.vars.outputs.tag }} ./frontend
          docker push   $REGISTRY/frontend:${{ steps.vars.outputs.tag }}

      # --- Deploy ---
      - name: Deploy to K8s
        run: |
          kubectl apply -f k8s/app.yaml
          kubectl set image deployment/backend  backend=$REGISTRY/backend:${{ steps.vars.outputs.tag }}
          kubectl set image deployment/frontend frontend=$REGISTRY/frontend:${{ steps.vars.outputs.tag }}
          kubectl rollout status deployment/backend  --timeout=120s
          kubectl rollout status deployment/frontend --timeout=120s
```

Tạo secrets trong repo: `REGISTRY_USERNAME=deployer`, `REGISTRY_PASSWORD=Str0ngP@ss`.

> **Build native arm64**: vì runner là VM ARM64, `docker build` cho ra image arm64 đúng kiến trúc cụm — không cần `--platform` hay QEMU. Nếu sau này thêm runner amd64 hoặc deploy lên cloud x86, mới cần `docker buildx build --platform linux/arm64,linux/amd64 --push`.

---

## 13. Truy cập app từ MacBook & vòng lặp dev hằng ngày

### 13.1. Mở app trên trình duyệt Mac

FE expose ở NodePort 30080 trên **mọi** node. Từ Mac (đã thêm `/etc/hosts` ở Phần 1.5):

```text
http://192.168.184.11:30080      hoặc   http://k8s-worker-1:30080
```

> NodePort mở trên mọi node, nên gọi IP của bất kỳ node nào (kể cả master) đều vào được FE. FE tự proxy `/api` → backend trong cụm.

### 13.2. Vòng lặp làm việc thực tế

```text
Trên Mac (IDE):  sửa code BE/FE, chạy dev server để code nhanh (hot reload)
        │  hài lòng → git commit && git push origin main
        ▼
GitHub  → đẩy job xuống vm-runner
        ▼
vm-runner: docker build BE + FE (arm64) → push registry.local:5000
        ▼
kubectl set image → worker-1/2 pull image mới từ registry → rolling update
        ▼
Mở http://k8s-worker-1:30080 trên Mac → thấy bản vừa deploy ✅
```

> Bạn vẫn **code và chạy dev trên Mac** như cũ (FE dev server, BE nodemon...) cho nhanh. Cụm VM là **môi trường giống production để kiểm thử bản đóng gói** trước khi lên thật. Hai thứ song song, không xung đột.

### 13.3. (Tùy chọn) Điều khiển cụm thẳng từ Mac

Cài `kubectl` trên macOS (`brew install kubectl`), rồi copy kubeconfig:

```bash
scp ubuntu@192.168.184.10:/home/ubuntu/.kube/config ~/.kube/config
sed -i '' 's#server: https://.*:6443#server: https://192.168.184.10:6443#' ~/.kube/config   # cú pháp sed của macOS
kubectl get pods -o wide
```

---

## 14. Nâng cấp cho "giống cloud" hơn (tùy chọn, có 48GB nên dư sức)

NodePort hơi thô (phải nhớ port, gọi IP node). Muốn giống production thật:

- **MetalLB** (LoadBalancer cho bare-metal): cấp một IP "ảo" trong dải NAT (vd `192.168.184.200-210`) cho Service kiểu `LoadBalancer`. App có IP cố định đẹp thay vì `:30080`.
- **ingress-nginx**: một entrypoint duy nhất, định tuyến theo domain (`app.local`, `api.local`). Thêm vào `/etc/hosts` của Mac.

Đây là bước nâng cao — khi cụm cơ bản đã chạy ngon, bạn có thể thêm sau. (Có thể tách thành bài riêng nếu cần.)

---

## 15. Troubleshooting đặc thù môi trường Fusion + ARM

> Các lỗi K8s/registry/runner chung → tra **[bài 1 — Phần 13](./setup-k8s-cicd-mot-may-ubuntu.md)** (quy trình chẩn đoán 13.0, rollback 13.6, đầy đĩa 13.9, cert hết hạn 13.11...). Dưới đây chỉ là lỗi **riêng của môi trường này**.

| Tình huống | Triệu chứng | Xử lý |
|---|---|---|
| **Pull/chạy nhầm image amd64** | Pod `CrashLoopBackOff`, log `exec format error` / `standard_init... no such file` | Image không phải arm64. Build lại trên runner ARM, hoặc dùng base image multi-arch. Kiểm tra: `docker manifest inspect <image>` xem có `arm64`. |
| **IP VM nhảy sau reboot** | Cụm vỡ, node `NotReady`, SSH sai IP | Quên đặt IP tĩnh (Phần 1.4). Đặt netplan static cho mọi VM. |
| **Đổi mạng (nhà↔quán) làm mất kết nối** | VM không ra internet / không thấy nhau | Đang dùng Bridged. Chuyển sang **NAT** (Phần 1.3) — NAT độc lập wifi. |
| **`kubectl` trên runner/Mac báo `127.0.0.1:6443 refused`** | Sao chép kubeconfig của master nguyên xi | Sửa `server:` thành IP thật của master (Phần 10.2 / 13.3). |
| **Clock skew sau khi VM ngủ/suspend** | Lỗi TLS `certificate not valid yet`, token lỗi | VM ngủ làm lệch giờ. `sudo timedatectl set-ntp true` và bật lại; cài `chrony` cho 5 VM. |
| **Snapshot khi VM đang chạy → etcd hỏng** | Sau khi restore, control-plane loạn | Snapshot/clone **khi VM đã tắt** (xem Phần 16). |
| **Runner offline** | GitHub báo runner Offline | `sudo ./svc.sh status`; kiểm tra vm-runner ra được internet (`curl https://github.com`). |
| **Build chậm/hết RAM trên runner** | Job treo, OOM khi `npm run build` | Tăng RAM vm-runner (bạn có 48GB), hoặc thêm swap *riêng cho runner* (runner không phải node K8s nên swap OK). |

```bash
# Đồng bộ giờ cho mọi VM (chống clock skew sau suspend) — chạy trên từng VM:
sudo apt-get install -y chrony && sudo systemctl enable --now chrony
timedatectl status     # System clock synchronized: yes
```

---

## 16. Lợi thế VM: snapshot trước mỗi bước rủi ro

Đây là thứ máy vật lý không có. **Tắt VM rồi snapshot** ở các mốc quan trọng:

- Sau Phần 1 (OS + mạng xong) → snapshot `"base-clean"`.
- Sau Phần 6 (cụm K8s chạy) → snapshot `"cluster-ready"`.
- Trước khi thử nghiệm gì nguy hiểm (nâng cấp K8s, đổi CNI).

Fusion → chọn VM → **Snapshots → Take Snapshot**. Hỏng thì **Restore** về mốc gần nhất, đỡ phải dựng lại từ đầu.

> **Lưu ý**: snapshot khi VM **đang chạy** có thể bắt etcd ở trạng thái dở → restore xong control-plane lỗi. An toàn nhất: `sudo shutdown now` rồi mới snapshot. Với cả cụm, snapshot **đồng thời** cả 3 node K8s (cùng thời điểm) để trạng thái nhất quán.

---

## 17. Tóm tắt — checklist dựng hệ thống đa máy từ M5

1. **Nhớ ARM64**: tải Ubuntu Server **arm64**, mọi image phải arm64 (Phần 0).
2. **Fusion**: cài 1 base VM → Full Clone ra 5 VM → đặt vCPU/RAM (Phần 1.1–1.2).
3. **Mạng NAT + IP tĩnh** (netplan) + `/etc/hosts` trên mọi VM **và Mac** (Phần 1.3–1.5).
4. **3 VM K8s**: chuẩn bị node → containerd (`SystemdCgroup`) → kube tools (Phần 2–4).
5. **Master**: `kubeadm init` + Flannel, **giữ taint** (cụm đa máy) (Phần 5).
6. **Join 2 worker** (Phần 6).
7. **vm-registry**: Docker + registry:2 (TLS + auth) riêng một máy (Phần 7).
8. **Trust cert**: containerd trên 3 node K8s + Docker trên runner (Phần 8, 10.1).
9. **imagePullSecret** `regcred` (Phần 9).
10. **vm-runner**: Docker (build arm64) + kubectl (sửa `server:` IP master) + GitHub runner **ARM64** (Phần 10).
11. **App**: Dockerfile BE + FE (FE nginx proxy `/api`→backend), manifest (BE ClusterIP, FE NodePort) (Phần 11).
12. **Workflow**: build BE+FE → push SHA → `set image` → `rollout status` (Phần 12).
13. **Truy cập từ Mac** qua `http://<node>:30080`; vẫn code/dev trên Mac như cũ (Phần 13).

> **3 điều "đặc sản" của môi trường này phải khắc cốt:**
> 1. **Tất cả là ARM64** — lệch kiến trúc = `exec format error`. Runner ARM build ra arm64 native là điểm cộng lớn.
> 2. **IP tĩnh + mạng NAT** — VM K8s cực ghét IP đổi; NAT giúp mang máy đi đâu cụm vẫn sống.
> 3. **Snapshot khi VM tắt** — "nút hoàn tác" mà máy thật không có; nhưng snapshot lúc đang chạy có thể làm hỏng etcd.

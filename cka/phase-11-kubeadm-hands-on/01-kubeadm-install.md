# Bài 1: kubeadm — Install Kubernetes step-by-step

## Vì sao kubeadm quan trọng cho CKA?

CKA test trực tiếp kubeadm:
- Cài cluster mới.
- Join worker.
- Upgrade cluster.
- Troubleshoot khi setup fail.

→ Phải biết từng step + flag.

## Prerequisites

### OS support

- Ubuntu 20.04/22.04, Debian 11/12.
- RHEL/CentOS/Rocky 8/9.

### Hardware

```text
Master: 2 CPU, 2 GB RAM, 20 GB disk (minimum)
Worker: 1 CPU, 1 GB RAM, 10 GB disk
```

### Network

- Hostname unique per node.
- Static IP (DHCP có thể đổi → cluster broken).
- Mọi node reach được nhau qua TCP port 6443, 2379-2380, 10250-10259.
- Pod CIDR + Service CIDR plan trước.

### Swap MUST be OFF

```bash
sudo swapoff -a
sudo sed -i '/swap/d' /etc/fstab            # disable permanent
free -h                                       # verify swap = 0
```

→ Kubelet không khởi nếu swap on.

## Step-by-step install

### Phần 1: Setup mọi node (master + worker)

#### 1. Enable IP forwarding

```bash
cat > /etc/sysctl.d/k8s.conf <<EOF
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
EOF

sudo modprobe br_netfilter
sudo modprobe overlay
sudo sysctl --system
```

#### 2. Cài containerd

```bash
sudo apt update
sudo apt install -y containerd

# Generate default config
sudo mkdir -p /etc/containerd
sudo containerd config default | sudo tee /etc/containerd/config.toml

# Enable SystemdCgroup (quan trọng cho K8s)
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml

sudo systemctl restart containerd
sudo systemctl enable containerd
```

#### 3. Cài kubeadm, kubelet, kubectl

```bash
sudo apt update
sudo apt install -y apt-transport-https ca-certificates curl gpg

curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /' | \
  sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt update
sudo apt install -y kubelet=1.30.0-1.1 kubeadm=1.30.0-1.1 kubectl=1.30.0-1.1

# Hold version (kubeadm sẽ control khi upgrade)
sudo apt-mark hold kubelet kubeadm kubectl

# Enable kubelet (sẽ start sau khi join cluster)
sudo systemctl enable kubelet
```

### Phần 2: Init master

```bash
sudo kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --apiserver-advertise-address=192.168.1.10 \
  --upload-certs
```

Flag quan trọng:
- `--pod-network-cidr`: CIDR cho Pod (phải match CNI plugin).
- `--apiserver-advertise-address`: IP master.
- `--upload-certs`: upload cert để join master khác (HA).

Output cuối:
```text
Your Kubernetes control-plane has initialized successfully!

To start using your cluster, you need to run the following as a regular user:

  mkdir -p $HOME/.kube
  sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
  sudo chown $(id -u):$(id -g) $HOME/.kube/config

Then you can join any number of worker nodes by running the following on each as root:

kubeadm join 192.168.1.10:6443 --token abcdef.1234567890abcdef \
        --discovery-token-ca-cert-hash sha256:xxxxxxxxxxxx
```

→ **Save lệnh `kubeadm join`** — cần để add worker.

### Phần 3: Setup kubectl trên master

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Verify
kubectl get nodes
# NAME     STATUS     ROLES           AGE   VERSION
# master   NotReady   control-plane   2m    v1.30.0
                    ────────
                    NotReady vì chưa cài CNI
```

### Phần 4: Cài CNI plugin

#### Calico (recommend cho exam)

```bash
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml
```

Đợi 1-2 phút:
```bash
kubectl get pods -n kube-system
# ...
# calico-kube-controllers-xxx   1/1   Running
# calico-node-yyy                1/1   Running

kubectl get nodes
# master   Ready   control-plane   3m   v1.30.0
                  ─────
                  Ready
```

#### Alternative: Flannel

```bash
kubectl apply -f https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml
```

#### Alternative: Weave

```bash
kubectl apply -f "https://github.com/weaveworks/weave/releases/download/v2.8.1/weave-daemonset-k8s.yaml"
```

### Phần 5: Join worker nodes

#### Trên mỗi worker

Setup giống master (containerd, kubeadm, ...). Sau đó join:

```bash
sudo kubeadm join 192.168.1.10:6443 \
  --token abcdef.1234567890abcdef \
  --discovery-token-ca-cert-hash sha256:xxxxxxxxxxxx
```

Output:
```text
This node has joined the cluster
```

#### Verify trên master

```bash
kubectl get nodes
# NAME       STATUS   ROLES           AGE   VERSION
# master     Ready    control-plane   10m   v1.30.0
# worker-1   Ready    <none>          2m    v1.30.0
# worker-2   Ready    <none>          1m    v1.30.0
```

→ Cluster ready.

## Khi quên token

Token kubeadm valid 24h. Token hết hạn:

```bash
# Trên master, regenerate
sudo kubeadm token create
# abcdef.0123456789abcdef

# Lấy CA hash
openssl x509 -pubkey -in /etc/kubernetes/pki/ca.crt | \
  openssl rsa -pubin -outform der 2>/dev/null | \
  openssl dgst -sha256 -hex | sed 's/^.* //'
# xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Hoặc combo
sudo kubeadm token create --print-join-command
# kubeadm join 192.168.1.10:6443 --token ... --discovery-token-ca-cert-hash ...
```

→ Run output trên worker.

## Reset cluster

Sai → reset clean:

```bash
sudo kubeadm reset -f

# Clean up
sudo rm -rf /etc/cni/net.d
sudo rm -rf $HOME/.kube
sudo iptables -F
sudo iptables -t nat -F
sudo iptables -t mangle -F
sudo iptables -X
```

→ Sau đó init lại.

## HA Setup (3 master)

### 1. Setup LoadBalancer

HAProxy trên 1 server riêng:
```text
frontend k8s-api
    bind *:6443
    mode tcp
    default_backend k8s-api

backend k8s-api
    mode tcp
    balance roundrobin
    server master-1 192.168.1.10:6443 check
    server master-2 192.168.1.11:6443 check
    server master-3 192.168.1.12:6443 check
```

### 2. Init master-1 với control plane endpoint

```bash
sudo kubeadm init \
  --control-plane-endpoint="lb.example.com:6443" \
  --pod-network-cidr=10.244.0.0/16 \
  --upload-certs
```

Output cuối có:
```text
You can now join any number of the control-plane node by running the following command on each:

kubeadm join lb.example.com:6443 --token ... \
    --discovery-token-ca-cert-hash sha256:... \
    --control-plane --certificate-key xxxxx
```

### 3. Join master-2, master-3

```bash
sudo kubeadm join lb.example.com:6443 --token ... \
  --discovery-token-ca-cert-hash sha256:... \
  --control-plane --certificate-key xxxxx
```

→ 3 master sync. 1 master die → cluster vẫn hoạt động.

## Common errors

### `[ERROR Swap]: running with swap on is not supported`

```bash
sudo swapoff -a
sudo sed -i '/swap/d' /etc/fstab
```

### `[ERROR FileContent--proc-sys-net-bridge-bridge-nf-call-iptables]`

```bash
sudo modprobe br_netfilter
echo 'net.bridge.bridge-nf-call-iptables = 1' | sudo tee -a /etc/sysctl.d/k8s.conf
sudo sysctl --system
```

### Kubelet không start

```bash
sudo systemctl status kubelet
sudo journalctl -u kubelet --since "5 minutes ago"
```

Common reasons:
- Cgroup driver mismatch (containerd `SystemdCgroup` phải = `true`).
- Swap on.
- CNI chưa cài.

### Node NotReady sau cài CNI

```bash
kubectl describe node worker-1
kubectl get pods -n kube-system
# Check CNI pod log
kubectl logs -n kube-system calico-node-xxx
```

### Pod không reach Pod khác

CNI vấn đề:
```bash
kubectl get pods -n kube-system | grep calico
# Tất cả Running?

# Check IPIP/VXLAN trên node
ip route
# 10.244.0.0/24 via 192.168.1.10 dev tunl0 (Calico IPIP)
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Swap on | kubelet fail | swapoff + remove fstab |
| Cgroup mismatch | Pod không start | Set SystemdCgroup=true |
| Quên `--pod-network-cidr` | CNI có thể fail | Match với CNI plugin |
| Init mà chưa setup IP forward | Pod-to-Pod fail | enable trong sysctl |
| Worker không reach apiserver | Join fail | Check firewall, port 6443 |
| Token hết hạn | Worker không join | Regenerate token |
| Reset không cleanup iptables | Init lại lỗi | `iptables -F` |

## Quick reference

```bash
# Prereq
sudo swapoff -a
sudo modprobe br_netfilter

# Install
sudo apt install containerd kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl

# Init master
sudo kubeadm init --pod-network-cidr=10.244.0.0/16

# Setup kubectl
mkdir -p $HOME/.kube
sudo cp /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Cài CNI
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml

# Token
sudo kubeadm token create --print-join-command

# Join
sudo kubeadm join <master>:6443 --token X --discovery-token-ca-cert-hash sha256:Y

# Reset
sudo kubeadm reset -f
```

## Tóm tắt bài 1

- Cài kubeadm: setup containerd + IP forward + apt install + swap off.
- `kubeadm init` master: `--pod-network-cidr` + `--apiserver-advertise-address`.
- Setup kubectl: copy `/etc/kubernetes/admin.conf` → `~/.kube/config`.
- Cài CNI ngay sau init (Calico/Flannel) — node Ready.
- Join worker: dùng output `kubeadm join` từ init, hoặc regenerate token.
- HA: `--control-plane-endpoint` + LoadBalancer trước 3 master.
- Reset cluster: `kubeadm reset -f` + clean iptables.
- Debug: `journalctl -u kubelet`, check CNI Pod log.

**Bài kế tiếp** → [Phase 12 - Bài 1: Helm Basics](../phase-12-helm/01-helm-basics.md)

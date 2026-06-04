# Bài 1: Design + Install Kubernetes Cluster

## Vì sao bài này cần?

Cài K8s cluster có nhiều cách (Minikube, Kind, kubeadm, kops, GKE, EKS, ...). Mỗi cách phù hợp use case khác:
- Lab học: Minikube, Kind.
- Production self-hosted: kubeadm, kubespray, Rancher RKE.
- Production cloud: EKS, GKE, AKS (managed).
- Production on-prem advanced: kops, Cluster API.

Bài này design decision + tổng quan options. Bài kế tiếp deep-dive **kubeadm** (CKA test).

## Cluster Design Decisions

### 1. Số master node

| Setup | Master node | Use case |
|---|---|---|
| **Single master** | 1 | Lab, dev. Single Point of Failure |
| **HA (3 master)** | 3 | Production. Có thể chịu 1 master die |
| **HA (5 master)** | 5 | Critical production, multi-region |

→ Production: ít nhất **3 master**. etcd quorum 2/3.

### 2. Số worker node

Phụ thuộc workload:
- Lab: 1-2.
- Production: theo capacity (CPU/RAM aggregate Pod cần).

Quy tắc:
- Mỗi node max ~110 Pod (default).
- Reserve 10-20% capacity cho system Pod + buffer.

### 3. Pod CIDR + Service CIDR

```text
Pod CIDR:    Không overlap với node network
             Vd: 10.244.0.0/16 (kubeadm default)
             
Service CIDR: Không overlap với Pod CIDR + node network
             Vd: 10.96.0.0/12 (kubeadm default)
```

Plan kỹ — đổi sau khi cluster chạy = đập đi xây lại.

### 4. CNI plugin

| Plugin | Khi nào chọn |
|---|---|
| **Calico** | Production phổ biến. NetworkPolicy ✓. BGP support. |
| **Cilium** | Modern, eBPF, observability tốt. Cloud-native. |
| **Flannel** | Đơn giản nhất. Lab/test. Không NetworkPolicy. |
| **AWS VPC CNI** | EKS native. Pod IP = VPC IP. |

### 5. Container Runtime

| Runtime | Status 2025 |
|---|---|
| **containerd** | **Mặc định, recommend** |
| **CRI-O** | Alternative, OpenShift |
| **Docker (cri-dockerd)** | Legacy. Avoid |

### 6. Storage

- Lab: `hostPath`, `emptyDir`.
- Production: CSI driver theo cloud (EBS, GCP PD, NFS, ...).

### 7. Ingress

Cài Ingress Controller theo nhu cầu (nginx-ingress phổ biến).

## Hardware requirements

### Minimum (lab)

```text
Master: 2 CPU, 2 GB RAM, 20 GB disk
Worker: 1 CPU, 1 GB RAM, 10 GB disk
Network: 1 Gbps
```

### Recommended (production)

```text
Master: 4 CPU, 8 GB RAM, 100 GB SSD (etcd cần fast disk)
Worker: theo workload (vd 8 CPU, 16 GB)
Network: 10 Gbps
```

→ etcd cực nhạy với disk I/O. Dùng SSD/NVMe.

## Installation methods

### 1. Minikube (lab single-node)

```bash
brew install minikube
minikube start --driver=docker --cpus=4 --memory=8g
kubectl get nodes
# minikube  Ready  control-plane  ...
```

→ Setup 1 lệnh. Dev local.

### 2. Kind — K8s in Docker

```bash
brew install kind

# Multi-node cluster
cat > kind-config.yaml <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF

kind create cluster --config kind-config.yaml
```

→ Multi-node trong Docker container. CI testing.

### 3. kubeadm (production, self-hosted)

**Cách CKA test**. Bài kế tiếp deep-dive.

```bash
# Trên mỗi node
sudo apt install kubeadm kubelet kubectl

# Trên master
sudo kubeadm init --pod-network-cidr=10.244.0.0/16

# Trên worker
sudo kubeadm join <master-ip>:6443 --token <token> --discovery-token-ca-cert-hash <hash>
```

### 4. kubespray (Ansible)

```bash
git clone https://github.com/kubernetes-sigs/kubespray.git
# Edit inventory
ansible-playbook -i inventory/cluster.yml playbooks/cluster.yml
```

→ Production multi-node, declarative. Phù hợp on-prem.

### 5. kops (AWS)

```bash
kops create cluster --cloud=aws --zones=us-east-1a \
  --node-count=3 --node-size=t3.medium ...
kops update cluster --yes
```

→ Production AWS, không quá managed như EKS.

### 6. Cluster API

```bash
# Provider-based (AWS, Azure, GCP, vSphere)
clusterctl init --infrastructure aws
kubectl apply -f cluster.yaml
```

→ Modern, declarative cluster lifecycle.

### 7. Managed K8s

| Service | Provider |
|---|---|
| **EKS** | AWS |
| **GKE** | Google |
| **AKS** | Azure |
| **DigitalOcean K8s** | DO |
| **Linode K8s** | Akamai |

```bash
# EKS qua eksctl
eksctl create cluster --name my-cluster --nodes 3
```

→ Provider manage control plane. Bạn quản worker + app.

## HA Setup

### Stacked etcd (etcd cùng master)

```text
[Master 1: apiserver, etcd, scheduler, controller]
[Master 2: apiserver, etcd, scheduler, controller]
[Master 3: apiserver, etcd, scheduler, controller]
       │
       ▼
[Load Balancer trước 3 apiserver]
       │
       ▼
[Worker nodes]
```

→ Kubeadm default. Đơn giản. Master die = mất 1 etcd member.

### External etcd

```text
[etcd cluster: dedicated 3-5 node]
       ▲
       │ (3 master gọi vào)
[Master 1: apiserver, scheduler, controller]
[Master 2: ...]
[Master 3: ...]
```

→ Etcd lifecycle độc lập với master. Phức tạp hơn. Phù hợp scale lớn.

## Network considerations cho HA

Cần **Load Balancer** trước apiserver. Options:
- Cloud LB (AWS NLB, GCP LB).
- HAProxy/keepalived self-hosted.
- kube-vip (Pod-based VIP).

```text
Client: https://kube-vip.internal:6443
              │
              ▼ DNS resolve → VIP
              ▼
         [Load Balancer]
              │
       ┌──────┼──────┐
       ▼      ▼      ▼
   apiserver-1, 2, 3
```

→ apiserver cert phải có SAN cho VIP/LB DNS.

## Etcd backup strategy

Production HA cluster:
- Snapshot mỗi 4-6h.
- Upload S3/GCS.
- Retention 30 ngày.
- Test restore mỗi quý.

Phase 6 đã chi tiết.

## Cluster upgrade strategy

```text
Production: upgrade 1 minor/quý

[Step 1] Upgrade kubeadm trên master
[Step 2] kubeadm upgrade plan + apply
[Step 3] Drain master → upgrade kubelet → uncordon
[Step 4] Lặp cho worker (rolling)

→ Phase 6 đã detail
```

## Monitoring + Logging stack

Production cluster nên có:
- **Metrics Server** (built-in HPA, kubectl top).
- **Prometheus + Grafana** (historical metric).
- **Loki / Elasticsearch** (log aggregation).
- **Jaeger / Tempo** (distributed tracing).
- **Alertmanager** (alerting).

Cài qua Helm:
```bash
helm install kube-prometheus-stack prometheus-community/kube-prometheus-stack
```

## Production checklist

```text
✓ HA setup (3 master + 3 etcd)
✓ Load Balancer trước apiserver
✓ CNI hỗ trợ NetworkPolicy (Calico/Cilium)
✓ Storage CSI driver
✓ Ingress Controller + TLS (Cert-Manager)
✓ RBAC strict (least privilege)
✓ ResourceQuota + LimitRange per namespace
✓ Monitoring stack
✓ Logging stack
✓ Backup etcd định kỳ
✓ Disaster recovery plan + test
✓ Security: PodSecurityStandards, NetworkPolicy, image scan
✓ Multiple cloud zone (multi-AZ)
✓ Capacity planning + autoscaling
```

## Distros và Releases khác

Ngoài vanilla K8s:

| Distro | Đặc điểm |
|---|---|
| **OpenShift** (RedHat) | Enterprise, có thêm UI + CI/CD |
| **Rancher** | Multi-cluster management |
| **k3s** | Lightweight (Edge, IoT) |
| **k0s** | Minimal, zero-friction |
| **MicroK8s** | Ubuntu, snap install |
| **EKS Anywhere** | AWS on-prem |
| **Anthos** | GCP on-prem/multi-cloud |

## Tóm tắt bài 1

- Design decision: số master/worker, CIDR, CNI, runtime, storage.
- Production: tối thiểu **3 master HA + 3 etcd quorum**.
- Cài: Minikube/Kind (lab), **kubeadm** (CKA + production self-hosted), kubespray, kops, managed (EKS/GKE/AKS).
- HA setup: stacked etcd (kubeadm default) vs external etcd (advanced).
- Load Balancer trước apiserver bắt buộc HA.
- Production checklist: HA, monitoring, backup, security, capacity planning.
- Distros: OpenShift, Rancher, k3s, MicroK8s.

**Bài kế tiếp** → [Phase 11 - Bài 1: kubeadm install hands-on](../phase-11-kubeadm-hands-on/01-kubeadm-install.md)

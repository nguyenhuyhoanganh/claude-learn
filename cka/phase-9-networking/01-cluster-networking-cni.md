# Bài 1: Cluster Networking & CNI

## Vì sao bài này phức tạp?

K8s networking là **phần khó nhất** trong CKA. Có nhiều layer:
1. Mạng giữa các node (cluster network).
2. Pod-to-Pod (qua CNI plugin).
3. Service routing (kube-proxy + iptables/IPVS).
4. DNS (CoreDNS).
5. Ingress (HTTP routing).

Phase 9 sẽ dạy lần lượt. Bài này foundation: cluster network + CNI.

## K8s Network Model — 4 yêu cầu

K8s định nghĩa **4 yêu cầu** cho mọi cluster:

```text
1. Pod ↔ Pod giao tiếp KHÔNG NAT (mỗi Pod thấy IP thật của Pod khác)
2. Node ↔ Pod giao tiếp KHÔNG NAT
3. Pod thấy chính IP của mình giống Pod khác thấy
4. Mọi container trong Pod share IP (cùng network namespace)
```

→ CNI plugin (vd Calico, Cilium, Flannel) implement các yêu cầu này.

## 4 loại "mạng" trong K8s

```text
┌──────────────────────────────────────────────────┐
│  1. NODE NETWORK (Physical / Cloud VPC)          │
│     Node IP: 192.168.1.10, .11, .12              │
│     - SSH vào node                                │
│     - Cluster join (kubeadm join)                 │
│     - apiserver listen ở đây (6443)               │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│  2. POD NETWORK (CNI plugin)                     │
│     Pod IP: 10.244.0.0/16 (default kubeadm)      │
│     - Pod-to-Pod traffic                          │
│     - Flat: mọi Pod gọi được mọi Pod              │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│  3. SERVICE NETWORK (kube-proxy iptables)        │
│     Service IP: 10.96.0.0/12 (default kubeadm)   │
│     - Virtual IP (không có card mạng)             │
│     - Iptables rule DNAT về Pod IP                │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│  4. EXTERNAL ACCESS                              │
│     NodePort (30000-32767), LoadBalancer,        │
│     Ingress                                       │
└──────────────────────────────────────────────────┘
```

3 dải IP **không overlap**:
- Node CIDR: vd 192.168.1.0/24
- Pod CIDR: vd 10.244.0.0/16
- Service CIDR: vd 10.96.0.0/12

## Pod Network — Cốt lõi

Mọi Pod có IP duy nhất từ Pod CIDR. **Cùng node** hoặc **khác node** đều phải gọi được nhau.

```text
[Node-1: 192.168.1.10]              [Node-2: 192.168.1.11]
├── [Pod A: 10.244.0.5]      ───►   ├── [Pod B: 10.244.1.7]
│                                    │
└── [Pod C: 10.244.0.6]      ───►   └── [Pod D: 10.244.1.8]
```

Pod A (node-1) → Pod B (node-2): **làm sao**?

→ CNI plugin lo. K8s không tự làm.

## CNI (Container Network Interface)

> **CNI** = chuẩn plugin networking cho container. K8s không tự implement Pod network — đẩy cho CNI plugin.

```text
[Pod tạo ra]
   Kubelet → CRI → containerd: tạo container
                                │
                                ▼
                        Cần network namespace
                                │
                                ▼
                        Kubelet gọi CNI plugin
                        binary trong /opt/cni/bin/
                                │
                                ▼
                CNI plugin:
                - Tạo veth pair (pair virtual ethernet)
                - 1 end trong Pod network namespace
                - 1 end trên host (bridge / hoặc cấu trúc khác)
                - Cấp IP cho Pod
                - Setup routing
                                │
                                ▼
                Pod có IP, có network
```

CNI plugin binary nằm:
```bash
ls /opt/cni/bin/
# bridge   calico   flannel   host-local   loopback   ...
```

Config:
```bash
ls /etc/cni/net.d/
# 10-calico.conflist
```

## CNI plugin phổ biến

| Plugin | Đặc điểm | NetworkPolicy |
|---|---|---|
| **Calico** | Production phổ biến nhất, BGP routing | ✓ |
| **Cilium** | eBPF-based, modern, performance cao | ✓✓ |
| **Flannel** | Đơn giản, VXLAN overlay | ✗ |
| **Weave Net** | Encryption built-in | ✓ |
| **Antrea** | OVS-based, VMware | ✓ |
| **AWS VPC CNI** | EKS native, Pod IP từ VPC | ✓ (limited) |

→ Lab Practice CKA dùng Calico hoặc Weave. Production: Calico/Cilium.

## Cách CNI route giữa node

### Overlay network (Flannel, Calico VXLAN)

```text
Pod A (10.244.0.5) @ node-1 → Pod B (10.244.1.7) @ node-2

1. Pod A gửi packet:
   src: 10.244.0.5
   dst: 10.244.1.7

2. CNI agent trên node-1:
   - Encapsulate packet trong UDP/VXLAN
   - Outer:
     src: 192.168.1.10 (node-1 IP)
     dst: 192.168.1.11 (node-2 IP)
   - Inner: original Pod packet

3. Packet đi qua node network → node-2

4. CNI agent trên node-2:
   - Decapsulate
   - Deliver Pod B
```

→ **Overlay** = "mạng ảo trên mạng thật". Đơn giản, hoạt động trên mọi infra. Nhược: latency thêm.

### Native routing (Calico BGP)

```text
Pod A (10.244.0.0/24) ở node-1
Pod B (10.244.1.0/24) ở node-2

Calico cấu hình BGP:
- Node-1 announce: "Pods 10.244.0.0/24 ở tôi"
- Node-2 announce: "Pods 10.244.1.0/24 ở tôi"
- Router học routing

Pod A → Pod B:
- Packet đi straight (không encapsulate)
- Router/Switch route theo BGP table
```

→ Performance cao hơn overlay. Yêu cầu network infra support routing.

## Cài CNI plugin

Sau `kubeadm init`, cluster chưa có CNI. Node ở status `NotReady`:

```bash
kubectl get nodes
# NAME     STATUS     ROLES
# master   NotReady   control-plane     ← chưa Ready vì no CNI
```

Cài CNI (vd Calico):
```bash
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml
# Hoặc Operator
```

Sau 1-2 phút:
```bash
kubectl get nodes
# NAME     STATUS   ROLES
# master   Ready    control-plane     ← Ready sau khi CNI deploy
```

```bash
# Verify CNI Pod
kubectl get pods -n kube-system | grep calico
# calico-kube-controllers-xxx    Running
# calico-node-yyy                 Running (DaemonSet)
```

## kube-proxy + iptables

`kube-proxy` chạy DaemonSet trên mỗi node — setup iptables rule cho Service.

3 mode:

| Mode | Cách | Use case |
|---|---|---|
| `iptables` | Mỗi Service rule iptables | **Default**, OK đến vài nghìn service |
| `ipvs` | IPVS table (kernel module) | Service nhiều (>5000), faster |
| `userspace` | Proxy traffic qua process | DEPRECATED |

Xem mode hiện tại:
```bash
kubectl -n kube-system get configmap kube-proxy -o yaml | grep mode
# mode: ""        # empty = iptables (default)
```

### Iptables rule cho Service

```bash
# Trên node
sudo iptables -t nat -L KUBE-SERVICES -n
# Chain KUBE-SERVICES (2 references)
# target           prot opt source     destination          
# KUBE-SVC-XXXX    tcp  --  0.0.0.0/0  10.96.0.5            tcp dpt:80
#                              ↑                    ↑
#                              Service IP           Service port

sudo iptables -t nat -L KUBE-SVC-XXXX -n
# Chain KUBE-SVC-XXXX (1 references)
# target           prot opt
# KUBE-SEP-AAA     statistic mode random probability 0.50000  ← 50% Pod 1
# KUBE-SEP-BBB                                                ← 50% Pod 2
```

→ Iptables random pick endpoint, DNAT về Pod IP.

## Pod-to-Service traffic flow

```text
[Pod A]
   curl http://my-svc:80
        │
        ▼
[CoreDNS]                           ← resolve "my-svc" → 10.96.0.5
        │
        ▼
[Pod A network namespace]
   src: 10.244.0.5 (Pod A IP)
   dst: 10.96.0.5:80 (Service IP)
        │
        ▼
[Kernel iptables — qua kube-proxy rule]
   Match: dst 10.96.0.5:80 → DNAT
   src: 10.244.0.5
   dst: 10.244.1.7:80 (Pod B IP — endpoint)
        │
        ▼
[CNI: route packet to node-2]
        │
        ▼
[Pod B]
   nhận packet, response
```

→ Service IP **virtual** — không tồn tại trên card mạng. Chỉ là iptables rule.

## Service CIDR + Pod CIDR config

Set lúc `kubeadm init`:
```bash
kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --service-cidr=10.96.0.0/12 \
  --apiserver-advertise-address=192.168.1.10
```

Hoặc check sau:
```bash
# Service CIDR
sudo cat /etc/kubernetes/manifests/kube-apiserver.yaml | grep service-cluster-ip-range
# - --service-cluster-ip-range=10.96.0.0/12

# Pod CIDR
sudo cat /etc/kubernetes/manifests/kube-controller-manager.yaml | grep cluster-cidr
# - --cluster-cidr=10.244.0.0/16
```

## Troubleshoot Network

### Pod NotReady

```bash
kubectl describe pod my-pod
# Events: ContainerCreating: failed to find network info...
```

→ CNI chưa cài hoặc cài sai. Check CNI Pod:
```bash
kubectl get pods -n kube-system | grep -E 'calico|flannel|weave'
```

### Pod-to-Pod không reach

```bash
# Pod A
kubectl exec pod-a -- ping 10.244.1.7
# fail
```

Debug:
```bash
# Check route trên node
ip route
# Mở rộng:
kubectl exec pod-a -- traceroute 10.244.1.7
```

Possible cause:
- CNI agent crash.
- Firewall (iptables) chặn.
- Cloud security group.

### Service unreachable

```bash
kubectl exec pod-a -- curl http://my-svc
# connection refused
```

Debug:
```bash
# Check endpoint
kubectl get endpoints my-svc
# Nếu empty → selector không match Pod label

# Check kube-proxy
kubectl logs -n kube-system kube-proxy-xxx

# Check iptables
sudo iptables -t nat -L KUBE-SERVICES | grep my-svc
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên cài CNI sau `kubeadm init` | Node NotReady | Apply CNI YAML |
| Pod CIDR / Service CIDR overlap | Routing fail | Check trước init |
| Pod CIDR / Node network overlap | Pod IP conflict | Plan IP careful |
| Cài 2 CNI plugin | Conflict | Chỉ 1 CNI |
| Firewall chặn Pod CIDR | Pod-to-Pod fail | Open inter-node traffic |
| CoreDNS down | DNS resolve fail | Check CoreDNS Pod |
| kube-proxy mode iptables với service nhiều | Slow | Switch IPVS |
| Quên `--apiserver-advertise-address` | apiserver bind sai IP | Set explicit |

## Quick reference

```bash
# Cluster network info
kubectl cluster-info
kubectl get nodes -o wide                            # node IP

# CNI
ls /opt/cni/bin/
ls /etc/cni/net.d/
kubectl get pods -n kube-system | grep -E 'calico|flannel'

# Service IP range
sudo cat /etc/kubernetes/manifests/kube-apiserver.yaml | grep service-cluster-ip-range

# Pod CIDR
sudo cat /etc/kubernetes/manifests/kube-controller-manager.yaml | grep cluster-cidr

# Kube-proxy
kubectl get configmap -n kube-system kube-proxy -o yaml | grep mode

# Iptables (trên node)
sudo iptables -t nat -L KUBE-SERVICES -n
```

## Tóm tắt bài 1

- K8s network model: 4 yêu cầu (Pod-to-Pod no NAT, ...).
- 4 mạng: Node, Pod, Service, External.
- **CNI plugin** implement Pod network. Cài sau `kubeadm init`.
- Popular: Calico (BGP/IPIP), Cilium (eBPF), Flannel (VXLAN).
- Overlay vs Native routing — performance vs simplicity.
- kube-proxy setup iptables/IPVS cho Service. Service IP virtual.
- 3 CIDR không overlap: node, pod, service.
- Debug: CNI Pod, endpoints, iptables.

**Bài kế tiếp** → [Bài 2: DNS trong Kubernetes — CoreDNS](02-dns-coredns.md)

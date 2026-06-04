# Bài 7: Kubelet & Kube-Proxy — Agent trên mỗi worker node

## Hai component này quan trọng đến mức nào?

Mọi worker node **bắt buộc** có 2 component này. Không có = node không thể tham gia cluster:

- **Kubelet** = "captain" trên node, manage Pod lifecycle.
- **Kube-proxy** = thiết lập network rule cho Service.

Trong CKA, hiểu rõ 2 component này giúp debug 80% lỗi worker node thường gặp (NotReady, network unreachable, ...).

## Phần 1: Kubelet

### Vai trò chính của Kubelet

```text
Kubelet làm 5 việc:

1. ĐĂNG KÝ node với cluster khi start
   └── Tự gửi "Hi, tôi là worker-2, có 8 CPU 16GB RAM" lên apiserver

2. WATCH apiserver xem có Pod nào được assign cho node mình không
   └── Khi scheduler set nodeName="worker-2" cho Pod X
       → kubelet trên worker-2 thấy event này

3. CHẠY Pod được assigned
   └── Gọi container runtime (containerd) qua CRI gRPC
       → Pull image, tạo container, mount volume, network

4. CHẠY probes (liveness/readiness/startup) cho Pod
   └── Periodic check Pod còn healthy không
       → Pod fail liveness → restart container

5. BÁO CÁO trạng thái Pod + Node lên apiserver
   └── Pod Running/Failed/Pending, Node Ready/NotReady,
       Node resource usage, ...
```

→ Kubelet là **người thực thi** ở mỗi node. Apiserver, scheduler, controller chỉ ra quyết định — kubelet làm thật.

### Kubelet không phải là Pod

**Khác** với control plane component (apiserver, scheduler, controller-manager chạy như Pod), kubelet **bắt buộc chạy như systemd service trên OS host**.

Vì sao? Pattern "gà và trứng":
- Pod cần kubelet để chạy.
- Nếu kubelet là Pod → cần ai chạy Pod kubelet? → Cần một kubelet khác → vô tận.

→ Kubelet chạy thẳng trên OS, manage Pod.

```bash
systemctl status kubelet
# ● kubelet.service - kubelet: The Kubernetes Node Agent
#    Loaded: loaded (/etc/systemd/system/kubelet.service)
#    Active: active (running)
#    Memory: 250M
#    CPU: 12min
```

### Kubeadm không tự cài Kubelet

Đây là **gotcha lớn nhất** khi setup cluster bằng kubeadm:

```text
kubeadm tự cài:                 Bạn phải cài tay:
- apiserver (static Pod)         - kubelet (systemd service)
- controller-manager (Pod)       - container runtime (containerd)
- scheduler (Pod)                - kubeadm CLI
- etcd (static Pod)              - kubectl
```

Vì sao? Kubeadm là **tool boostrap cluster** — phải có kubelet sẵn trước. Quy trình chuẩn:

```bash
# Trên mỗi worker node:
1. Cài container runtime: containerd
2. Cài kubelet (apt install kubelet)
3. Cài kubeadm
4. Gọi: kubeadm join <master>:6443 --token <token>
   → kubeadm config kubelet → kubelet đăng ký với master
   → node thành member của cluster
```

### Workflow chạy Pod chi tiết

```text
[1] User: kubectl create pod nginx
        ▼
[2] apiserver lưu Pod object (nodeName="")
        ▼
[3] Scheduler set nodeName="worker-2"
        ▼
[4] Kubelet trên worker-2 WATCH apiserver:
    Nhận event "Pod nginx assigned to worker-2"
        ▼
[5] Kubelet xử lý:
    a. Kiểm tra image local có chưa
    b. Nếu chưa → gọi containerd qua CRI: PullImage
    c. Tạo Pod sandbox (network namespace)
    d. Tạo container: RunContainerInPodSandbox
    e. Setup volume mount, secret mount, env var
    f. Network setup (CNI plugin gọi đây)
        ▼
[6] Pod Running
        ▼
[7] Kubelet liên tục:
    - Check liveness probe → restart container nếu fail
    - Check readiness probe → update Pod status (Ready/NotReady)
    - Report Pod status lên apiserver
    - Send Node heartbeat (mỗi 10s)
```

### Static Pod — Đặc biệt với Kubelet

Kubelet có thể chạy Pod **không qua apiserver/scheduler**. Đặt YAML file vào folder `staticPodPath`:

```bash
# Folder mặc định
ls /etc/kubernetes/manifests/
# etcd.yaml
# kube-apiserver.yaml
# kube-controller-manager.yaml
# kube-scheduler.yaml
```

Kubelet **liên tục watch** folder này. Mỗi khi:
- File mới → tạo Pod ngay.
- File sửa → recreate Pod.
- File xoá → xoá Pod.

→ Đây là cách kubeadm cluster chạy control plane: control plane là **static Pod** của master node.

Static Pod không xoá được bằng `kubectl delete pod` — vì kubelet sẽ tạo lại từ file. Phải xoá file.

### Cấu hình Kubelet

File config chính:
```bash
cat /var/lib/kubelet/config.yaml
```

```yaml
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration

# === Identity ===
clusterDNS:
  - 10.96.0.10              # DNS server (CoreDNS Service IP)
clusterDomain: cluster.local

# === Authentication / Authorization ===
authentication:
  anonymous:
    enabled: false
  webhook:
    enabled: true
  x509:
    clientCAFile: /etc/kubernetes/pki/ca.crt

authorization:
  mode: Webhook

# === Static Pod ===
staticPodPath: /etc/kubernetes/manifests

# === Container runtime ===
containerRuntimeEndpoint: unix:///run/containerd/containerd.sock

# === Cgroup driver ===
cgroupDriver: systemd       # phải match với runtime

# === Network ===
maxPods: 110                # số Pod tối đa trên node này

# === Eviction (Pod bị đẩy khi node hết tài nguyên) ===
evictionHard:
  memory.available: "100Mi"
  nodefs.available: "10%"
  imagefs.available: "15%"

# === Probes ===
nodeStatusUpdateFrequency: 10s
nodeStatusReportFrequency: 5m

# === Logs ===
containerLogMaxSize: 10Mi
containerLogMaxFiles: 5
```

Restart sau khi sửa:
```bash
sudo systemctl restart kubelet
```

### Kubelet log — Nơi debug đầu tiên

```bash
journalctl -u kubelet -f
# Hoặc:
journalctl -u kubelet --since "10 minutes ago"
```

Nhiều lỗi K8s xuất phát từ kubelet. Log thường thấy:
- `Failed to pull image` → registry vấn đề hoặc cred sai.
- `Failed to create CRI` → containerd not running.
- `Volume mount failed` → PV/PVC vấn đề.
- `CNI plugin not initialized` → network plugin chưa cài.

### Khi node "NotReady"

Triệu chứng phổ biến nhất. Theo các bước debug:

```bash
# 1. Check kubelet running không
ssh worker-node
sudo systemctl status kubelet

# 2. Nếu kubelet down → start lại
sudo systemctl start kubelet
sudo systemctl enable kubelet

# 3. Nếu kubelet crash liên tục → đọc log
sudo journalctl -u kubelet -n 200

# 4. Check container runtime
sudo systemctl status containerd

# 5. Check cgroup driver match
sudo cat /var/lib/kubelet/config.yaml | grep cgroupDriver
sudo cat /etc/containerd/config.toml | grep SystemdCgroup
# Cả 2 phải = systemd (hoặc cả 2 = cgroupfs)
```

`cgroupDriver` mismatch là lỗi cực phổ biến với kubeadm cluster mới.

## Phần 2: Kube-Proxy

### Vấn đề kube-proxy giải quyết

Pod có IP, nhưng:
- IP Pod thay đổi mỗi khi Pod tạo lại.
- Có nhiều replica → Pod nào nhận traffic?
- Service phải có IP cố định → nhưng Service không phải process thật, không có IP card mạng.

```text
[Client]
   │
   │ "Tôi muốn gọi 10.96.0.5 (Service IP)"
   ▼
[Kube-proxy] ←── tạo iptables rule trên node
   │
   │ Rule: traffic đến 10.96.0.5:80 → forward đến
   │       10.244.0.10:8080 hoặc 10.244.1.5:8080 (Pod IP)
   ▼
[Pod A] hoặc [Pod B] hoặc [Pod C]   ← random theo iptables
```

### Kube-proxy chính xác làm gì?

```text
1. WATCH apiserver xem Service + Endpoint thay đổi
2. Cập nhật iptables rules (hoặc IPVS) trên host
3. KHÔNG forward traffic thực — đó là OS kernel làm

Khi packet đến Service IP:
- Kernel iptables check rules
- Rule match → DNAT (đổi destination IP) sang Pod IP
- Pod nhận packet, xử lý
```

→ Kube-proxy là **người setup rules**, OS kernel mới làm load balancing.

### 3 mode hoạt động

| Mode | Cách thực hiện | Use case |
|---|---|---|
| **iptables** | Tạo iptables rule cho mọi Service | **Mặc định**, phù hợp đa số cluster |
| **IPVS** | Tạo IPVS table (hiệu quả hơn cho cluster lớn) | Cluster > 1000 service |
| **userspace** | Proxy traffic qua process kube-proxy | Cực cũ, không dùng nữa |

Switch mode:
```yaml
# /var/lib/kube-proxy/config.conf
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration
mode: ipvs   # hoặc "iptables"
```

### Ví dụ iptables thực tế

Sau khi tạo Service:
```bash
# Trên worker node
sudo iptables -t nat -L KUBE-SERVICES -n
# Chain KUBE-SERVICES
# target  prot opt source  destination
# KUBE-SVC-XXX  tcp  --  0.0.0.0/0  10.96.0.5  /* default/nginx cluster IP */ tcp dpt:80

# Theo dõi chain KUBE-SVC-XXX
sudo iptables -t nat -L KUBE-SVC-XXX -n
# target  prot opt
# KUBE-SEP-AAA  ... statistic mode random probability 0.33333    ← random Pod 1
# KUBE-SEP-BBB  ... statistic mode random probability 0.50000    ← random Pod 2
# KUBE-SEP-CCC  ...                                              ← random Pod 3
```

→ Kube-proxy tự generate rules này. Khi Pod scale up/down → rules cập nhật.

### Kube-proxy chạy ở đâu?

```text
Trong cluster kubeadm:
└── kube-proxy chạy như DAEMONSET → 1 Pod trên MỖI NODE
    (cả master và worker)

Trong cluster scratch:
└── kube-proxy là systemd service trên mỗi worker
```

Check:
```bash
kubectl get pods -n kube-system -o wide | grep kube-proxy
# kube-proxy-aaaaa   1/1   Running   master      10.244.0.1
# kube-proxy-bbbbb   1/1   Running   worker-1    10.244.1.1
# kube-proxy-ccccc   1/1   Running   worker-2    10.244.2.1
```

Mỗi node có 1 instance.

### Cấu hình kube-proxy

ConfigMap:
```bash
kubectl get cm -n kube-system kube-proxy -o yaml
```

```yaml
apiVersion: kubeproxy.config.k8s.io/v1alpha1
kind: KubeProxyConfiguration

clusterCIDR: 10.244.0.0/16
mode: iptables   # hoặc "ipvs"

# Conntrack
conntrack:
  maxPerCore: 32768
  min: 131072

# IPVS specific
ipvs:
  scheduler: rr    # round-robin, hoặc lc (least connection), sh, ...

# Iptables specific
iptables:
  masqueradeAll: false
  syncPeriod: 30s
```

### Troubleshoot kube-proxy

| Triệu chứng | Có thể do |
|---|---|
| Pod cùng node gọi nhau OK, khác node fail | CNI plugin lỗi (network giữa node), không phải kube-proxy |
| Service IP không reach được | kube-proxy down hoặc rules sai |
| Service trả về Pod đã chết | endpoint chưa update (controller-manager + kube-proxy chậm) |
| Service load balance không đều | iptables mode bị "sticky" (kernel cache TCP connection) |

Debug:
```bash
# 1. Kube-proxy Pod chạy không
kubectl get pods -n kube-system | grep kube-proxy

# 2. Log
kubectl logs -n kube-system kube-proxy-xxxxx

# 3. iptables rule có Service đó không
sudo iptables -t nat -L KUBE-SERVICES -n | grep <service-ip>

# 4. Endpoint có healthy không
kubectl get endpoints <service-name>
```

## Bảng so sánh Kubelet vs Kube-Proxy

| | Kubelet | Kube-Proxy |
|---|---|---|
| Mục đích | Manage Pod lifecycle | Setup network rules cho Service |
| Chạy ở đâu | Mọi node (systemd service) | Mọi node (DaemonSet hoặc systemd) |
| Giao tiếp với | Container runtime, apiserver | Kernel iptables/IPVS, apiserver |
| Tác động | Pod up/down/restart | Service routing |
| Trong kubeadm | systemd service trên host | DaemonSet Pod |
| Nếu chết | Pod không tạo được, Node NotReady | Service IP không reach được |
| Quan trọng cho | Toàn bộ workload | Service-based traffic |

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Quên cài kubelet trên worker | Node không join được | Cài kubelet + kubeadm trước `kubeadm join` |
| Cgroup driver mismatch | Kubelet crash liên tục | Set cả containerd + kubelet = systemd |
| Static Pod manifest sai syntax | Pod không chạy, không có log rõ | Test YAML offline trước |
| Tưởng `kubectl delete pod` xoá được static Pod | Pod tự tạo lại | Xoá file trong `/etc/kubernetes/manifests/` |
| Kube-proxy chạy nhưng iptables vẫn cũ | Service mới không reach | Restart kube-proxy Pod |
| Conntrack table đầy | Connection drop | Tăng `conntrack.maxPerCore` |

## Tóm tắt bài 7

- **Kubelet**: agent trên mọi node. Manage Pod (chạy, monitor, report). Chạy như **systemd service** (không phải Pod).
- **Kubelet không tự cài bởi kubeadm** — phải cài tay trước khi join cluster.
- **Static Pod**: kubelet đọc file YAML trong `/etc/kubernetes/manifests/` và tạo Pod local — bypass apiserver/scheduler.
- **Kube-proxy**: setup iptables/IPVS rules cho Service. Chạy như DaemonSet trên mọi node.
- Kube-proxy **không forward traffic** — kernel làm. Kube-proxy chỉ setup rules.
- 3 mode kube-proxy: iptables (default), IPVS (cluster lớn), userspace (deprecated).
- Cluster `NotReady` → debug kubelet log. Service không reach → debug kube-proxy + endpoint.

**Bài kế tiếp** → [Bài 8: Pods — Đơn vị nhỏ nhất của K8s](08-pods.md)

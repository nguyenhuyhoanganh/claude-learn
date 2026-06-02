# Bài 4: Kube-API Server — Cổng vào duy nhất của cluster

## Vì sao API server là trái tim của K8s?

Mọi thao tác trong cluster đều **đi qua kube-apiserver**. Không có ngoại lệ:

- `kubectl get pods` → apiserver.
- Scheduler chọn node cho Pod → apiserver.
- Controller manager đảm bảo state → apiserver.
- Kubelet báo cáo Pod status → apiserver.
- User dùng dashboard, GitOps tool, monitoring → đều qua apiserver.

→ **apiserver chết = cluster không tương tác được** (Pod đang chạy vẫn chạy, nhưng không thể tạo mới, scale, debug).

→ Trong CKA, troubleshoot apiserver là **kỹ năng số 1**. Khi gõ `kubectl` báo `connection refused` → luôn nghi vấn đầu tiên là apiserver.

## Vai trò chính của apiserver

```text
┌──────────────────────────────────────────────────┐
│             Mọi client (kubectl, dashboard,      │
│             scheduler, controller, kubelet, ...) │
└────────────────────┬─────────────────────────────┘
                     │ HTTPS (port 6443)
                     ▼
        ┌────────────────────────────────┐
        │       kube-apiserver           │
        │                                │
        │  1. Authenticate (xác thực)    │  ← Anh là ai?
        │  2. Authorize (cấp quyền)      │  ← Anh được phép làm gì?
        │  3. Admission Control          │  ← Có vi phạm policy không?
        │  4. Validate (validate spec)   │  ← Spec đúng schema không?
        │  5. Persist to etcd            │  ← Lưu vào etcd
        │  6. Notify watchers            │  ← Báo cho component khác
        │                                │
        └──────────────┬─────────────────┘
                       │
                       ▼
                  ┌─────────┐
                  │  etcd   │  Chỉ apiserver được nói chuyện với etcd
                  └─────────┘
```

**Quan trọng**: Chỉ apiserver giao tiếp với etcd. Scheduler, controller, kubelet **không bao giờ đọc etcd trực tiếp** → đều qua apiserver.

## Workflow: Khi bạn `kubectl create pod nginx`

Theo dõi từng bước:

```text
1. User gõ: kubectl run nginx --image=nginx
        │
        ▼
2. kubectl đóng gói thành HTTP POST request:
   POST /api/v1/namespaces/default/pods
   Body: {Pod spec}
        │
        ▼
3. apiserver nhận request:
   a. AUTH: Đọc cert hoặc token từ user → verify
   b. AUTHZ: Check RBAC — user có quyền create pod không?
   c. ADMISSION: Apply admission controllers (vd: PodSecurity)
   d. VALIDATE: Check spec hợp lệ
        │
        ▼
4. apiserver ghi vào etcd:
   key: /registry/pods/default/nginx
   value: {spec đầy đủ, status: Pending, nodeName: ""}
        │
        ▼
5. apiserver trả response cho kubectl: "Pod created"
        │
        ▼
6. Kube-scheduler đang WATCH apiserver:
   - Nhận event "new pod, no nodeName"
   - Chạy thuật toán chọn node phù hợp
   - PATCH apiserver: "set nodeName=worker-2 for Pod nginx"
        │
        ▼
7. apiserver update etcd với nodeName=worker-2
        │
        ▼
8. Kubelet trên worker-2 đang WATCH apiserver:
   - Nhận event "có Pod được assign cho mình"
   - Gọi container runtime (containerd) để pull image + chạy container
   - PATCH apiserver: "Pod status = Running, IP = 10.244.1.5"
        │
        ▼
9. apiserver update etcd với status mới
        │
        ▼
10. User gõ "kubectl get pods" → apiserver query etcd → trả về:
    NAME    STATUS    NODE
    nginx   Running   worker-2
```

→ apiserver là **trung gian cho mọi event**. Tất cả component dùng pattern **watch** (long-polling HTTP) để nhận thay đổi real-time.

## REST API thay vì kubectl

`kubectl` chỉ là wrapper cho REST API. Bạn có thể dùng `curl` thay được:

```bash
# Get token
TOKEN=$(kubectl create token default)

# List pods qua REST
curl -k -H "Authorization: Bearer $TOKEN" \
  https://localhost:6443/api/v1/namespaces/default/pods

# Tạo pod qua REST
curl -k -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"apiVersion":"v1","kind":"Pod","metadata":{"name":"nginx"},"spec":{"containers":[{"name":"nginx","image":"nginx"}]}}' \
  https://localhost:6443/api/v1/namespaces/default/pods
```

Đây là cách **CI/CD pipeline, dashboard, operator** tương tác K8s — không qua kubectl mà gọi API thẳng (qua client library Go/Python).

## API Groups (Nhóm API)

K8s có **hàng trăm resource type**. Để tổ chức, chia thành **API groups**:

```text
/api/v1                        ← Core group (Pod, Service, ConfigMap, ...)
/apis/apps/v1                  ← Deployment, ReplicaSet, StatefulSet, DaemonSet
/apis/batch/v1                 ← Job, CronJob
/apis/networking.k8s.io/v1     ← Ingress, NetworkPolicy
/apis/rbac.authorization.k8s.io/v1  ← Role, RoleBinding, ClusterRole, ...
/apis/storage.k8s.io/v1        ← StorageClass, VolumeAttachment
/apis/policy/v1                ← PodDisruptionBudget
/apis/autoscaling/v2           ← HorizontalPodAutoscaler
```

Trong YAML, `apiVersion` cho biết resource thuộc group nào:

```yaml
apiVersion: v1                  # Core group
kind: Pod
---
apiVersion: apps/v1             # Apps group
kind: Deployment
---
apiVersion: networking.k8s.io/v1  # Networking group
kind: Ingress
```

Xem nhanh group nào có resource nào:

```bash
kubectl api-resources
# NAME           SHORTNAMES   APIVERSION    NAMESPACED   KIND
# pods           po           v1            true         Pod
# services       svc          v1            true         Service
# deployments    deploy       apps/v1       true         Deployment
# ingresses      ing          networking.k8s.io/v1   true   Ingress
# nodes          no           v1            false        Node
# ...
```

## Các flag quan trọng khi cấu hình apiserver

Trong cluster kubeadm, config file ở:

```bash
cat /etc/kubernetes/manifests/kube-apiserver.yaml
```

Đây là **static Pod manifest** — kubelet tự tạo Pod từ file này khi boot. Một số flag quan trọng:

```yaml
spec:
  containers:
  - command:
    - kube-apiserver
    # === Etcd connection ===
    - --etcd-servers=https://127.0.0.1:2379
    - --etcd-cafile=/etc/kubernetes/pki/etcd/ca.crt
    - --etcd-certfile=/etc/kubernetes/pki/apiserver-etcd-client.crt
    - --etcd-keyfile=/etc/kubernetes/pki/apiserver-etcd-client.key
    
    # === Listening ===
    - --advertise-address=192.168.1.10
    - --secure-port=6443
    
    # === TLS server ===
    - --tls-cert-file=/etc/kubernetes/pki/apiserver.crt
    - --tls-private-key-file=/etc/kubernetes/pki/apiserver.key
    
    # === Authentication ===
    - --client-ca-file=/etc/kubernetes/pki/ca.crt
    - --service-account-key-file=/etc/kubernetes/pki/sa.pub
    - --service-account-signing-key-file=/etc/kubernetes/pki/sa.key
    
    # === Authorization ===
    - --authorization-mode=Node,RBAC
    
    # === Admission controllers ===
    - --enable-admission-plugins=NodeRestriction
    
    # === Service ===
    - --service-cluster-ip-range=10.96.0.0/12
    
    # === Network ===
    - --kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname
    
    # === API extension ===
    - --requestheader-client-ca-file=/etc/kubernetes/pki/front-proxy-ca.crt
```

Đây là **manifest dài nhất** trong cluster — apiserver có hàng chục flag. Trong CKA, bạn không cần nhớ hết — chỉ cần biết **đâu là file config** để debug khi cần.

## Tìm apiserver process trên master

### Trường hợp 1: Cluster kubeadm (phổ biến nhất)

apiserver chạy như **static Pod**:

```bash
# Trên master node
kubectl get pods -n kube-system | grep apiserver
# kube-apiserver-master   1/1   Running   2 (5d ago)   30d

# Config file
ls /etc/kubernetes/manifests/
# etcd.yaml
# kube-apiserver.yaml          ← static Pod manifest
# kube-controller-manager.yaml
# kube-scheduler.yaml

# Log
kubectl logs -n kube-system kube-apiserver-master

# Hoặc trực tiếp từ file Pod log
sudo cat /var/log/pods/kube-system_kube-apiserver-master_<uid>/kube-apiserver/0.log
```

### Trường hợp 2: Cluster scratch (cài tay)

apiserver chạy như **systemd service**:

```bash
systemctl status kube-apiserver
journalctl -u kube-apiserver -f

# Config
cat /etc/systemd/system/kube-apiserver.service

# Process
ps -ef | grep kube-apiserver
```

→ **Khác biệt**: kubeadm dùng static Pod, scratch dùng systemd. Cùng trên 1 cluster có thể chỉ 1 trong 2.

## High Availability apiserver

Production cluster nên có **nhiều master node** + **load balancer** đứng trước:

```text
              ┌─────────────────────┐
   kubectl ──►│  Load Balancer       │
              │ (HAProxy, nginx,    │
              │  cloud LB)          │
              └──┬──────┬──────────┬─┘
                 │      │          │
        ┌────────▼──┐ ┌─▼────────┐ ┌▼─────────┐
        │ Master 1 │ │ Master 2 │ │ Master 3 │
        │ apiserver│ │ apiserver│ │ apiserver│
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             └────────────┼────────────┘
                          ▼
                  ┌──────────────┐
                  │ etcd cluster │
                  │ (3 hoặc 5    │
                  │  node)       │
                  └──────────────┘
```

apiserver là **stateless** (state ở etcd) → có thể scale ngang dễ dàng. Tất cả master apiserver kết nối cùng etcd cluster.

Load balancer phân tải request → mỗi master nhận 1/N traffic. Nếu 1 master down → LB tự route sang master khác.

Phase 10-11 sẽ chi tiết về setup HA cluster.

## Troubleshoot apiserver

Khi `kubectl` báo lỗi, theo thứ tự check:

### 1. apiserver Pod có chạy không?

```bash
# SSH vào master
sudo crictl ps -a | grep apiserver
# CONTAINER ID   IMAGE                                    STATE     NAME
# abc123         registry.k8s.io/kube-apiserver:v1.30.0   Running   kube-apiserver
```

Nếu State `Exited` → đọc log:
```bash
sudo crictl logs <container-id>
```

### 2. Manifest file có lỗi syntax không?

```bash
sudo cat /etc/kubernetes/manifests/kube-apiserver.yaml
# Check indentation, syntax YAML
```

Kubelet tự đọc file này. Nếu YAML sai → kubelet không tạo được Pod. Check kubelet log:
```bash
sudo journalctl -u kubelet -n 100 | grep apiserver
```

### 3. Port 6443 có listen không?

```bash
sudo netstat -tlnp | grep 6443
# tcp   0   0   192.168.1.10:6443   *:*   LISTEN   12345/kube-apiserve
```

Không thấy → apiserver chưa start hoặc fail.

### 4. Certificate có valid không?

```bash
sudo openssl x509 -in /etc/kubernetes/pki/apiserver.crt -noout -dates
# notBefore=...
# notAfter=...     ← kiểm tra ngày hết hạn
```

Cert expire là lỗi rất phổ biến — Phase 7 sẽ chi tiết.

### 5. etcd có healthy không?

apiserver phụ thuộc etcd. Nếu etcd down → apiserver không hoạt động.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Sửa `/etc/kubernetes/manifests/kube-apiserver.yaml` sai cú pháp | apiserver không restart, cluster down | Test YAML syntax trước, có backup |
| Quên backup manifest trước khi sửa | Khó rollback | Luôn `cp file file.bak` trước |
| Restart apiserver Pod bằng `kubectl delete` | Không hoạt động (apiserver tự manage Pod của mình) | Sửa manifest → kubelet auto-recreate Pod |
| Cert apiserver hết hạn | Cluster đột nhiên down | Monitor cert expiry, renew trước hạn |
| Đổi `--service-cluster-ip-range` trên cluster đang chạy | Services bị break | Chỉ set lúc cài cluster, đừng đổi |
| Disable RBAC để debug | Lỗ hổng security khổng lồ | Học RBAC, không tắt |

## Tóm tắt bài 4

- **kube-apiserver** = entry point duy nhất cho mọi tương tác với cluster.
- Workflow: Authenticate → Authorize → Admission → Validate → Persist to etcd → Notify watchers.
- Chỉ apiserver được phép giao tiếp với etcd.
- **REST API** + `kubectl` là wrapper trên cùng API.
- **API groups**: `/api/v1` (core), `/apis/apps/v1` (Deployment), ...
- Config trong cluster kubeadm: `/etc/kubernetes/manifests/kube-apiserver.yaml` (static Pod).
- HA: nhiều master + LB phía trước. apiserver stateless.
- Debug: check Pod status → manifest syntax → port 6443 → certs → etcd.

**Bài kế tiếp** → [Bài 5: Controller Manager — người gác quy luật của cluster](05-controller-manager.md)

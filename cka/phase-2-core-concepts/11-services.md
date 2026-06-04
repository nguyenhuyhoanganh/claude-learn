# Bài 11: Services — Stable network endpoint cho Pod

## Vì sao Pod cần Service?

Pod có IP riêng. Pod chết → IP biến mất. Pod mới tạo → IP khác hoàn toàn.

```text
[Frontend Pod] ──HTTP──► [Backend Pod IP: 10.244.0.5]
                                                 │
                                                 ▼ (Pod crash)
                                            [Pod chết]
                                                 │
                                                 ▼
[Frontend Pod] ──HTTP──► 10.244.0.5: connection refused
                         (IP cũ không còn)

Pod mới được tạo:
[Backend Pod IP: 10.244.0.99]  ← IP khác
                ▲
                │
Frontend phải biết IP mới? Hard-code lại? Reload mọi lần?
```

**Vấn đề**: Frontend không thể dùng IP Pod trực tiếp.

**Giải pháp**: **Service** — IP cố định (virtual) + DNS name ổn định. Service tự route traffic đến Pod đang sống.

## Định nghĩa Service

> **Service** = abstraction cung cấp **stable network identity** + **load balancing** cho một group Pod.

```text
[Client] ──► Service "backend" (10.96.0.5:80)
                       │
                       ├──► Pod A (10.244.0.5:8080)
                       ├──► Pod B (10.244.1.7:8080)    ← load balance
                       └──► Pod C (10.244.2.3:8080)

Pod chết, Pod mới tạo → Service tự cập nhật endpoint
```

Service link Pod qua **label selector** (giống ReplicaSet, Deployment).

## 4 loại Service

| Type | Mục đích | Use case |
|---|---|---|
| **ClusterIP** | IP nội bộ cluster, không expose ra ngoài | Backend-to-backend, default |
| **NodePort** | Expose qua port trên mọi node | Dev/test, dễ truy cập từ ngoài |
| **LoadBalancer** | Cloud LB tự provision | Production trên cloud |
| **ExternalName** | DNS CNAME alias | Trỏ tới service ngoài cluster |

Trong CKA, biết kỹ **ClusterIP, NodePort, LoadBalancer**. ExternalName ít gặp.

## ClusterIP — Mặc định, dùng nhiều nhất

```text
Mục đích: frontend Pod gọi backend Pod, không cần expose ra ngoài
```

### YAML

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
spec:
  type: ClusterIP                 # default, có thể bỏ
  selector:
    app: backend                  # match Pod có label này
  ports:
    - port: 80                    # port của Service
      targetPort: 8080            # port trên Pod
      protocol: TCP               # default
```

Tạo:
```bash
kubectl apply -f svc.yaml

kubectl get svc
# NAME      TYPE        CLUSTER-IP    EXTERNAL-IP   PORT(S)   AGE
# backend   ClusterIP   10.96.45.1    <none>        80/TCP    5s
```

### Cách Pod khác dùng Service

```text
Trong cluster, từ Pod khác:
$ curl http://backend          # qua DNS name
$ curl http://10.96.45.1       # qua ClusterIP

# Đầy đủ DNS
$ curl http://backend.default.svc.cluster.local
```

→ K8s tự setup DNS (CoreDNS) cho mọi Service: `<service-name>.<namespace>.svc.cluster.local`.

### Workflow cụ thể

```text
1. Frontend Pod gọi: curl http://backend:80
        │
        ▼
2. CoreDNS resolve "backend" → 10.96.45.1 (ClusterIP)
        │
        ▼
3. Packet ra interface Pod, đi đến node
        │
        ▼
4. Iptables (do kube-proxy setup):
   - Match: dest 10.96.45.1:80
   - Action: DNAT random pick Pod A/B/C
        │
        ▼
5. Packet đến Pod thực (vd Pod B: 10.244.1.7:8080)
        │
        ▼
6. Backend Pod xử lý, trả response
```

→ Service IP **không tồn tại trên card mạng**. Chỉ là iptables rule. "Virtual IP".

## NodePort — Expose ra ngoài qua port node

```text
Mục đích: external user truy cập app, không qua cloud LB
```

NodePort = ClusterIP **plus** thêm port trên mọi node:

```text
[External user]
    │
    │ http://<bất kỳ node IP>:30080
    ▼
[Worker Node A: 192.168.1.10:30080]
    │ (port 30080 trên mọi node đều forward)
    ▼
[Service "frontend": ClusterIP 10.96.5.5:80]
    │
    ├──► [Pod A: 10.244.0.3:80]
    ├──► [Pod B: 10.244.1.4:80]
    └──► [Pod C: 10.244.2.5:80]
```

### YAML

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
spec:
  type: NodePort
  selector:
    app: frontend
  ports:
    - port: 80                   # ClusterIP port
      targetPort: 8080           # Pod port
      nodePort: 30080            # port trên mỗi node (range 30000-32767)
                                 # bỏ → K8s tự allocate
```

```bash
kubectl get svc
# NAME       TYPE       CLUSTER-IP   EXTERNAL-IP   PORT(S)         AGE
# frontend   NodePort   10.96.5.5    <none>        80:30080/TCP    5s

# Test
curl http://<node-IP>:30080
```

### Đặc điểm

- Range NodePort: **30000-32767** (cấu hình được).
- Port mở **trên mọi node trong cluster**, không chỉ node có Pod.
- External user dùng `<node-IP>:<nodePort>` để truy cập.

### Nhược điểm

- Node IP **không ổn định** (node có thể bị thay).
- Bạn phải biết IP node nào → khó share URL cho user.
- Không có DNS friendly URL như `app.example.com`.
- Không có HTTPS auto.

→ NodePort phù hợp **dev/test**. Production cần LoadBalancer + Ingress.

## LoadBalancer — Cloud LB tự động

```text
Mục đích: expose app ra Internet với 1 URL/IP ổn định
```

Khi tạo Service type LoadBalancer trên cloud (AWS/GCP/Azure), K8s **tự provision** cloud LB:

```text
[External user]
       │
       │ http://api.example.com
       ▼
[Cloud Load Balancer]      ← AWS ELB / GCP LB / Azure LB
       │  (external IP)
       ▼
[Node 1] [Node 2] [Node 3]  ← LB forward tới NodePort
       │
       ▼
[Service backend (ClusterIP)]
       │
       ├──► [Pod A] [Pod B] [Pod C]
```

### YAML

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api
spec:
  type: LoadBalancer
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 8080
```

```bash
kubectl get svc
# NAME   TYPE           CLUSTER-IP    EXTERNAL-IP                       PORT(S)        AGE
# api    LoadBalancer   10.96.30.1    a1b2c3.us-east-1.elb.amazonaws... 80:31234/TCP   2m
```

EXTERNAL-IP là cloud LB DNS — share cho user.

### Yêu cầu

- Cluster phải chạy trên **cloud platform** hỗ trợ (AWS, GCP, Azure, DigitalOcean, ...).
- Cloud Controller Manager component cài trong cluster.
- Có quyền tạo LB trên cloud (IAM permission).

**Trên cluster on-premise** (Minikube, kubeadm bare-metal):
- Service tạo nhưng EXTERNAL-IP `<pending>` mãi.
- Pod vẫn truy cập được qua NodePort.
- Phải dùng **MetalLB** (LB controller cho bare-metal) hoặc fallback Ingress + NodePort.

### Cost

Mỗi LoadBalancer Service = 1 cloud LB = $15-30/tháng. 10 service = 10 LB.

→ Production thường dùng **1 LoadBalancer + Ingress** route nhiều service qua 1 LB.

## ExternalName — Alias DNS

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  type: ExternalName
  externalName: db.external-corp.com    # DNS bên ngoài
```

```bash
# Trong Pod
curl http://external-db
# CoreDNS resolve external-db → db.external-corp.com → IP thật
```

→ Service không link Pod, chỉ là CNAME wrapper. Hữu ích khi migrate dần từ external DB sang K8s.

## Endpoint — Object ẩn đằng sau Service

Khi tạo Service, K8s tự tạo object `Endpoints` (hoặc `EndpointSlice` mới hơn):

```bash
kubectl get endpoints backend
# NAME      ENDPOINTS                                    AGE
# backend   10.244.0.5:8080,10.244.1.7:8080,10.244.2.3:8080   5m
```

→ List IP:port của Pod thực sự đang chạy. Kube-proxy đọc endpoint này để setup iptables.

Khi Pod thay đổi:
- Controller-manager update endpoint.
- Kube-proxy update iptables rule.
- Traffic chuyển sang Pod mới.

### Headless Service — Bỏ Service IP

```yaml
spec:
  clusterIP: None         # ← headless
  selector:
    app: db
  ports:
    - port: 6379
```

→ DNS resolve trả về **IP của tất cả Pod**, không phải Service IP:

```bash
nslookup db
# db has 3 addresses:
# 10.244.0.5
# 10.244.1.7
# 10.244.2.3
```

Use case: StatefulSet (DB cluster) cần client biết IP từng Pod cụ thể.

## Tạo Service nhanh

### Cách 1: `kubectl expose`

```bash
# Expose Deployment thành Service
kubectl expose deployment nginx-deploy \
  --port=80 \
  --target-port=8080 \
  --type=ClusterIP
# Hoặc:
kubectl expose deployment nginx-deploy --port=80 --type=NodePort
```

K8s tự copy label selector từ Deployment.

### Cách 2: `kubectl create service`

```bash
kubectl create service clusterip backend --tcp=80:8080
kubectl create service nodeport frontend --tcp=80:8080 --node-port=30080
```

### Cách 3: YAML + `apply`

Recommended cho production.

### Generate YAML

```bash
kubectl expose deployment nginx --port=80 --target-port=8080 --dry-run=client -o yaml
```

## Truy xuất Service từ Pod

```bash
# Trong Pod, env variable tự được set
echo $BACKEND_SERVICE_HOST    # 10.96.45.1
echo $BACKEND_SERVICE_PORT    # 80

# DNS (recommend)
curl http://backend
curl http://backend.default.svc.cluster.local
```

→ DNS-based prefer environment-based vì hỗ trợ Service tạo sau Pod.

## Selector mismatch — Lỗi phổ biến

Service không return data → 1 trong các nguyên nhân:

```bash
# 1. Endpoint trống?
kubectl get endpoints backend
# NAME      ENDPOINTS   AGE
# backend   <none>      5m       ← selector không match Pod nào

# 2. Check Pod label
kubectl get pods --show-labels
# nginx-abc12   1/1   Running   app=nginx-app,tier=backend

# 3. Check Service selector
kubectl get svc backend -o yaml | grep -A 2 selector
# selector:
#   app: backend                ← không match Pod label app=nginx-app

# Sửa: hoặc đổi selector trong Service, hoặc đổi label Pod
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Service selector không match Pod label | Endpoint trống, không reach | Verify selector match label |
| `targetPort` sai (không phải port Pod thật) | Connect refused | Check container `containerPort` |
| NodePort ngoài range 30000-32767 | Tạo fail | Trong range hoặc bỏ để auto |
| LoadBalancer trên on-prem | EXTERNAL-IP pending | Dùng MetalLB hoặc NodePort |
| Quên `protocol: UDP` cho DNS service | Default TCP, không hoạt động | Set protocol đúng |
| Dùng Service IP trực tiếp trong code | Restart cluster → IP đổi | Dùng DNS name |
| 2 Service có selector overlap | Endpoint share, behavior khó hiểu | Selector unique |

## Tóm tắt bài 11

- **Service** = stable network endpoint cho group Pod. IP + DNS name không đổi khi Pod đổi.
- **4 loại**:
  - **ClusterIP** (default): internal cluster only.
  - **NodePort**: expose port trên mọi node (30000-32767).
  - **LoadBalancer**: cloud LB tự provision (cần cloud).
  - **ExternalName**: DNS CNAME alias.
- Link Pod qua **label selector**.
- DNS name: `<svc-name>.<namespace>.svc.cluster.local`.
- **Endpoint** object liệt kê Pod IP — auto cập nhật khi Pod đổi.
- **Headless Service** (`clusterIP: None`): DNS trả về Pod IP, không phải Service IP. Cho StatefulSet.
- Service IP **virtual** — chỉ là iptables rule, không có card mạng.
- Phase 9 (Networking) sẽ deep-dive thêm Ingress, NetworkPolicy.

**Bài kế tiếp** → [Bài 12: Namespaces — Cô lập resource trong cluster](12-namespaces.md)

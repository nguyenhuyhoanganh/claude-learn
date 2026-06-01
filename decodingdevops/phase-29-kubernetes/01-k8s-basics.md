# Bài 1: Kubernetes — Kiến trúc và các object cốt lõi

**Kubernetes (K8s)** = container orchestrator chuẩn của ngành. Khi số container vượt 5, app cần scale + HA → cần K8s. Bài này học fundamentals.

## Vì sao cần K8s?

Docker Compose có giới hạn:
- Chỉ chạy trên single host.
- Không auto-recover.
- Không hỗ trợ rolling deploy.
- Không scale qua nhiều node.

K8s giải quyết:
- **Multi-host cluster** — hàng trăm node.
- **Auto-scaling** pod + node.
- **Self-healing** — restart pod crash, reschedule pod khi node fail.
- **Rolling deploy** + rollback.
- **Service discovery** + load balancing.
- **Storage orchestration**.
- **Secret + config management**.

K8s đóng vai trò như **operating system cho cluster**.

## Architecture (Kiến trúc)

```text
+──────────────────────────────────────────────────────+
│  Control Plane (master)                              │
│                                                      │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ API     │ │ Sched    │ │ ctrl     │ │ etcd     │ │
│  │ Server  │ │ -uler    │ │ -manager │ │ (DB)     │ │
│  └─────────┘ └──────────┘ └──────────┘ └──────────┘ │
+───────────────────────────────────────────────────────+
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
    +──────────────+ +──────────────+ +──────────────+
    │ Worker Node 1│ │ Worker Node 2│ │ Worker Node N│
    │              │ │              │ │              │
    │ ┌──────────┐ │ │              │ │              │
    │ │ kubelet  │ │ │   kubelet    │ │   kubelet    │
    │ │ kube-    │ │ │   kube-      │ │   kube-      │
    │ │  proxy   │ │ │    proxy     │ │    proxy     │
    │ │ container│ │ │   container  │ │   container  │
    │ │  runtime │ │ │    runtime   │ │    runtime   │
    │ └──────────┘ │ │              │ │              │
    │              │ │              │ │              │
    │   Pods       │ │    Pods      │ │    Pods      │
    +──────────────+ +──────────────+ +──────────────+
```

### Control plane components (Thành phần control plane)

| Component | Vai trò |
|---|---|
| **kube-apiserver** | REST API endpoint duy nhất, mọi tương tác đi qua đây |
| **etcd** | Distributed key-value store, "source of truth" lưu state cluster |
| **kube-scheduler** | Quyết định pod chạy trên node nào |
| **kube-controller-manager** | Chạy các controller (Deployment, ReplicaSet, ...) |
| **cloud-controller-manager** | Tích hợp cloud provider (LB, volume) |

### Node components (Thành phần trên worker node)

| Component | Vai trò |
|---|---|
| **kubelet** | Agent, quản pod trên node |
| **kube-proxy** | Network rule cho Service |
| **container runtime** | containerd / cri-o (Docker engine đã deprecated từ K8s 1.24+) |

## Setup K8s local

### Minikube

```bash
brew install minikube
minikube start --driver=docker --cpus=2 --memory=4096

kubectl get nodes
# NAME       STATUS   ROLES    AGE
# minikube   Ready    control-plane   1m
```

### Kind (K8s chạy trong Docker)

```bash
brew install kind

cat <<EOF | kind create cluster --config=-
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
EOF
```

### k3s — K8s nhẹ

```bash
# Trên server
curl -sfL https://get.k3s.io | sh -

# Trên worker
curl -sfL https://get.k3s.io | K3S_URL=https://server:6443 K3S_TOKEN=xxx sh -
```

k3s = full K8s nhưng chỉ ~50 MB. Phù hợp cho edge / IoT.

### Cloud

```bash
# EKS
eksctl create cluster --name vprofile --region us-east-1 --nodes 3

# GKE
gcloud container clusters create vprofile --num-nodes 3 --zone us-central1-a

# AKS
az aks create --resource-group myRG --name vprofile --node-count 3
```

## kubectl — Vũ khí chính

```bash
# Thông tin cluster
kubectl cluster-info
kubectl get nodes
kubectl get componentstatuses

# Namespace
kubectl get ns
kubectl create ns vprofile
kubectl config set-context --current --namespace=vprofile

# Shortcut cho resource
kubectl get pods
kubectl get po                # = pods
kubectl get svc               # = services
kubectl get deploy            # = deployments
kubectl get all               # Các resource thông thường
kubectl get all -A            # Tất cả namespace

# Describe (chi tiết)
kubectl describe pod my-pod

# Log
kubectl logs my-pod
kubectl logs -f my-pod
kubectl logs my-pod -c container-name

# Exec vào pod
kubectl exec -it my-pod -- bash

# Apply manifest
kubectl apply -f deployment.yaml
kubectl delete -f deployment.yaml

# Edit trực tiếp resource đang chạy
kubectl edit deploy my-app

# Port forward (test local)
kubectl port-forward svc/my-app 8080:80
```

Cheatsheet: search "kubectl cheatsheet" trên Google để có bảng tham khảo đầy đủ.

## Core objects (Các object cốt lõi)

### Pod — Đơn vị nhỏ nhất

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx-pod
  labels:
    app: nginx
spec:
  containers:
    - name: nginx
      image: nginx:1.25
      ports:
        - containerPort: 80
      resources:
        requests:
          memory: "64Mi"
          cpu: "100m"
        limits:
          memory: "128Mi"
          cpu: "200m"
```

Pod = 1 hoặc nhiều container cùng chia sẻ network + storage. **Hiếm khi tạo Pod trực tiếp** — luôn dùng Deployment để manage hộ.

### Deployment — Quản lý pod replica + rolling deploy

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          ports:
            - containerPort: 80
```

Hierarchy: **Deployment → quản lý → ReplicaSet → quản lý → Pod**. **Luôn dùng Deployment cho app stateless**.

```bash
kubectl apply -f deployment.yaml
kubectl scale deploy/nginx-deployment --replicas=5
kubectl rollout status deploy/nginx-deployment
kubectl rollout history deploy/nginx-deployment
kubectl rollout undo deploy/nginx-deployment
```

### Service — Endpoint mạng ổn định

Pod có IP nhưng đổi mỗi khi recreate. Service cung cấp **IP + DNS ổn định** cho client:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx-service
spec:
  selector:
    app: nginx              # Match pod theo label
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP           # Mặc định: internal only
```

Các loại Service:

| Type | Mục đích |
|---|---|
| **ClusterIP** | Chỉ internal, mặc định |
| **NodePort** | Expose port trên mọi node (30000-32767) |
| **LoadBalancer** | Cloud LB (AWS ALB/NLB, GCP LB) |
| **ExternalName** | DNS CNAME alias đến tên ngoài cluster |

DNS tự động: `nginx-service.default.svc.cluster.local`.

### Ingress — HTTP routing

ALB cho cluster:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: vprofile-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: vprofile.acme.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: vprofile-service
                port:
                  number: 80
  tls:
    - hosts:
        - vprofile.acme.com
      secretName: vprofile-tls
```

Cần **Ingress controller** được cài trước: nginx-ingress, Traefik, AWS Load Balancer Controller.

### ConfigMap + Secret

ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: vprofile-config
data:
  app.properties: |
    db.host=db
    cache.host=cache
  DB_PORT: "3306"
```

Secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: vprofile-secrets
type: Opaque
data:
  db-password: YWRtaW4xMjM=         # đã encode base64
```

Mount vào pod:

```yaml
spec:
  containers:
    - name: app
      envFrom:
        - configMapRef:
            name: vprofile-config
        - secretRef:
            name: vprofile-secrets
      volumeMounts:
        - name: config
          mountPath: /etc/app
  volumes:
    - name: config
      configMap:
        name: vprofile-config
```

Secret chỉ encode base64, **KHÔNG encrypt**. Production cần: SealedSecrets, External Secrets Operator, Vault.

### PersistentVolume + PersistentVolumeClaim

Storage tách rời khỏi pod (pod ephemeral, nhưng data phải persist):

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: db-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
  storageClassName: gp3
```

Cloud StorageClass tự provision EBS / Persistent Disk / Azure Disk.

Mount vào pod:

```yaml
spec:
  containers:
    - name: db
      volumeMounts:
        - name: data
          mountPath: /var/lib/mysql
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: db-pvc
```

### StatefulSet — App có state

Deployment dành cho stateless. StatefulSet dành cho DB, message queue, bất kỳ thứ gì cần **stable identity + ordered start**:

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mariadb
spec:
  serviceName: mariadb
  replicas: 3
  selector:
    matchLabels:
      app: mariadb
  template:
    metadata:
      labels:
        app: mariadb
    spec:
      containers:
        - name: mariadb
          image: mariadb:11
          volumeMounts:
            - name: data
              mountPath: /var/lib/mysql
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: [ReadWriteOnce]
        resources:
          requests:
            storage: 10Gi
```

Tên pod ổn định: `mariadb-0`, `mariadb-1`, `mariadb-2`. Mỗi pod có PVC riêng.

### DaemonSet — 1 pod trên mỗi node

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-exporter
spec:
  selector:
    matchLabels:
      app: node-exporter
  template:
    spec:
      hostNetwork: true
      containers:
        - name: exporter
          image: prom/node-exporter
```

Use case: log collector (Fluentd), metric exporter (node_exporter), network plugin.

### Job + CronJob

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
spec:
  template:
    spec:
      containers:
        - name: migrate
          image: vprofile-migrate:v1
          command: ["migrate", "up"]
      restartPolicy: Never
  backoffLimit: 3
```

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: backup-db
spec:
  schedule: "0 2 * * *"            # Hàng ngày 2h sáng
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: backup-tool:v1
          restartPolicy: OnFailure
```

CronJob = cron job nhưng được K8s manage hộ.

## Labels và Selectors

Label = cặp key-value gắn vào object:

```yaml
metadata:
  labels:
    app: nginx
    env: production
    tier: frontend
```

Service select pod theo label:

```yaml
selector:
  app: nginx
  env: production
```

Filter:

```bash
kubectl get pods -l app=nginx
kubectl get pods -l 'env in (prod,staging)'
kubectl get pods --show-labels
```

## Namespace — Cô lập logic

```bash
kubectl create ns vprofile-prod
kubectl create ns vprofile-staging

# Apply resource vào namespace cụ thể
kubectl apply -f deploy.yaml -n vprofile-prod

# Set namespace mặc định
kubectl config set-context --current --namespace=vprofile-prod
```

Namespace có sẵn: `default`, `kube-system`, `kube-public`.

ResourceQuota + LimitRange áp dụng per-namespace cho mô hình multi-tenant (nhiều team chia chung cluster).

## Quick reference

```text
# Cluster
kubectl cluster-info
kubectl get nodes

# Resource
kubectl get all -n NS
kubectl describe POD NAME
kubectl logs -f POD NAME
kubectl exec -it POD -- bash

# Quản lý
kubectl apply -f FILE
kubectl delete -f FILE
kubectl scale deploy NAME --replicas=N
kubectl rollout undo deploy NAME

# Debug
kubectl get events --sort-by='.lastTimestamp'
kubectl top nodes
kubectl top pods

# Forward
kubectl port-forward svc/NAME 8080:80
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Fix |
|---|---|---|
| Pod không có resource limit | OOM, ảnh hưởng pod khác trên node | Luôn set limit |
| Không có readiness probe | Traffic đến pod chưa ready | Define probe |
| Single-node cluster | Single Point of Failure | Multi-node + multi-AZ |
| Tưởng Secret base64 = encrypted | Lộ trong etcd | Sealed Secret, Vault |
| Dùng Deployment cho DB | DB cần StatefulSet | StatefulSet + PVC |
| Tag `latest` | Khó rollback chính xác | Pin SHA |
| Backup etcd thủ công, hay quên | Không restore được khi mất | Automated etcd snapshot |

## Tóm tắt bài 1

- **K8s** = orchestrator container, control plane (API + etcd + scheduler + controller-manager) + worker (kubelet + container runtime).
- **Pod** = đơn vị nhỏ nhất. **Deployment** = quản lý pod stateless.
- **Service** = endpoint mạng ổn định, các loại: ClusterIP / NodePort / LoadBalancer.
- **Ingress** = HTTP routing (cần controller).
- **ConfigMap + Secret** cho config / credential.
- **PVC + StatefulSet** cho workload có state.
- **DaemonSet** = 1 pod trên mỗi node, **Job/CronJob** = batch task.
- **Label + selector** = cơ chế chính để liên kết các object.
- **Namespace** = cô lập logic.

**Phase kế tiếp** → [Phase 30 — Bài 1: Deploy vProfile lên Kubernetes](../phase-30-app-on-k8s/01-deploy-vprofile-k8s.md)

# Bài 1: Kubernetes — architecture và core objects

**Kubernetes (K8s)** = container orchestrator chuẩn ngành. Khi container > 5, app cần scale + HA → K8s. Bài này learn fundamentals.

## Vì sao K8s?

Docker Compose limit:
- Single host.
- No auto-recover.
- No rolling deploy.
- No multi-node scaling.

K8s solves:
- **Multi-host cluster** — 100s node.
- **Auto-scaling** pods + nodes.
- **Self-healing** — restart crashed pod, reschedule failed node.
- **Rolling deploy** + rollback.
- **Service discovery** + load balancing.
- **Storage orchestration**.
- **Secret + config management**.

K8s = **operating system for cluster**.

## Architecture

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

### Control plane components

| Component | Role |
|---|---|
| **kube-apiserver** | REST API endpoint, single entry point |
| **etcd** | Distributed key-value store, "source of truth" cluster state |
| **kube-scheduler** | Decide pod nào chạy node nào |
| **kube-controller-manager** | Run controllers (Deployment, ReplicaSet, ...) |
| **cloud-controller-manager** | Integrate cloud provider (LB, volume) |

### Node components

| Component | Role |
|---|---|
| **kubelet** | Agent, manage pod trên node |
| **kube-proxy** | Network rules cho Service |
| **container runtime** | containerd / cri-o (Docker engine deprecated K8s 1.24+) |

## Setup K8s local

### Minikube

```bash
brew install minikube
minikube start --driver=docker --cpus=2 --memory=4096

kubectl get nodes
# NAME       STATUS   ROLES    AGE
# minikube   Ready    control-plane   1m
```

### Kind (K8s in Docker)

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

### k3s — lightweight K8s

```bash
# Server
curl -sfL https://get.k3s.io | sh -

# Worker
curl -sfL https://get.k3s.io | K3S_URL=https://server:6443 K3S_TOKEN=xxx sh -
```

K3s = full K8s ~50 MB. Edge/IoT-friendly.

### Cloud

```bash
# EKS
eksctl create cluster --name vprofile --region us-east-1 --nodes 3

# GKE
gcloud container clusters create vprofile --num-nodes 3 --zone us-central1-a

# AKS
az aks create --resource-group myRG --name vprofile --node-count 3
```

## kubectl — vũ khí chính

```bash
# Cluster info
kubectl cluster-info
kubectl get nodes
kubectl get componentstatuses

# Namespace
kubectl get ns
kubectl create ns vprofile
kubectl config set-context --current --namespace=vprofile

# Resource shortcut
kubectl get pods
kubectl get po                # = pods
kubectl get svc               # = services
kubectl get deploy            # = deployments
kubectl get all               # Common types
kubectl get all -A            # All namespaces

# Describe (detailed)
kubectl describe pod my-pod

# Logs
kubectl logs my-pod
kubectl logs -f my-pod
kubectl logs my-pod -c container-name

# Exec
kubectl exec -it my-pod -- bash

# Apply manifest
kubectl apply -f deployment.yaml
kubectl delete -f deployment.yaml

# Edit live
kubectl edit deploy my-app

# Port forward (test local)
kubectl port-forward svc/my-app 8080:80
```

Cheatsheet: `kubectl cheatsheet` — search Google.

## Core objects

### Pod — smallest unit

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

Pod = 1+ container chia sẻ network + storage. Hiếm khi tạo Pod trực tiếp — dùng Deployment.

### Deployment — manage pod replicas + rolling deploy

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

Deployment manages ReplicaSet manages Pods. **Always use Deployment for stateless app**.

```bash
kubectl apply -f deployment.yaml
kubectl scale deploy/nginx-deployment --replicas=5
kubectl rollout status deploy/nginx-deployment
kubectl rollout history deploy/nginx-deployment
kubectl rollout undo deploy/nginx-deployment
```

### Service — stable network endpoint

Pod có IP nhưng đổi khi recreate. Service cung cấp **stable IP + DNS**:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx-service
spec:
  selector:
    app: nginx              # Match pod label
  ports:
    - port: 80
      targetPort: 80
  type: ClusterIP           # Default: internal only
```

Service types:

| Type | Mục đích |
|---|---|
| **ClusterIP** | Internal only, default |
| **NodePort** | Expose port trên mọi node (30000-32767) |
| **LoadBalancer** | Cloud LB (AWS ALB/NLB, GCP LB) |
| **ExternalName** | DNS CNAME alias |

DNS auto: `nginx-service.default.svc.cluster.local`.

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

Need **Ingress controller** installed: nginx-ingress, Traefik, AWS Load Balancer Controller.

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
  db-password: YWRtaW4xMjM=         # base64 encoded
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

Secret encode base64 nhưng **không encrypt**. Production: SealedSecrets, External Secrets Operator, Vault.

### PersistentVolume + PersistentVolumeClaim

Storage tách khỏi pod (pod ephemeral, data persist):

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

Cloud StorageClass auto-provision EBS/PD/Azure Disk.

Mount:

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

### StatefulSet — stateful app

Deployment cho stateless. StatefulSet cho DB, message queue, anything với stable identity + ordered:

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

Pod name stable: `mariadb-0`, `mariadb-1`, `mariadb-2`. Each gets own PVC.

### DaemonSet — 1 pod per node

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

Use case: log collector (Fluentd), metrics exporter (node_exporter), network plugin.

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
  schedule: "0 2 * * *"            # Daily 2am
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: backup-tool:v1
          restartPolicy: OnFailure
```

CronJob = managed cron for K8s.

## Labels và selectors

Label = key-value gắn object:

```yaml
metadata:
  labels:
    app: nginx
    env: production
    tier: frontend
```

Service select pod by label:

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

## Namespace — isolation

```bash
kubectl create ns vprofile-prod
kubectl create ns vprofile-staging

# Apply resource to ns
kubectl apply -f deploy.yaml -n vprofile-prod

# Set default ns
kubectl config set-context --current --namespace=vprofile-prod
```

Built-in: `default`, `kube-system`, `kube-public`.

ResourceQuota + LimitRange per namespace cho multi-tenant.

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

# Manage
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
| Pod no resource limit | OOM, noisy neighbor | Always limit |
| No readiness probe | Traffic to non-ready pod | Define probe |
| Single-node cluster | SPOF | Multi-node + multi-AZ |
| Secret base64 = encrypted | Lộ trong etcd | Sealed Secret, Vault |
| Deployment cho DB | StatefulSet needed | StatefulSet + PVC |
| Latest tag | Rollback khó | Pin SHA |
| Manual etcd backup miss | Restore không được | Automated etcd snapshot |

## Tóm tắt bài 1

- **K8s** = orchestrator container, control plane (API + etcd + scheduler + ctrl-mgr) + worker (kubelet + container runtime).
- **Pod** = smallest unit. **Deployment** = manage stateless pod.
- **Service** = stable network endpoint, types ClusterIP / NodePort / LoadBalancer.
- **Ingress** = HTTP routing (need controller).
- **ConfigMap + Secret** cho config/credential.
- **PVC + StatefulSet** cho stateful workload.
- **DaemonSet** = pod per node, **Job/CronJob** = batch.
- **Label + selector** = primary mechanism connecting objects.
- **Namespace** = isolation logical.

**Phase kế tiếp** → [Phase 30 — Bài 1: Deploy vProfile lên Kubernetes](../phase-30-app-on-k8s/01-deploy-vprofile-k8s.md)

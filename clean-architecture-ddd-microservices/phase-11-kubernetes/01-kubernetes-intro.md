# Bài 45: Kubernetes — chạy 4 microservice + Kafka + Postgres

> Đến giờ ta chạy thủ công 4 service Java + Postgres + Kafka stack. Production cần tự động: tự restart khi crash, scale theo tải, rolling update không downtime, load balance. **Kubernetes** giải tất cả. Bài này dạy Kubernetes cơ bản đủ để chạy food-ordering-system local.

## Kubernetes là gì?

**Kubernetes (K8s)** = container orchestrator. Quản lý containerized application ở scale:
- Tự deploy container.
- Tự restart khi crash.
- Auto-scale theo CPU/memory.
- Load balance giữa replica.
- Rolling update không downtime.
- Self-healing — node die → tự move workload sang node khác.

Sinh từ Google's internal Borg (2014). Mainstream sau 2017.

## Kiến trúc K8s

```text
┌──────────────────────────────────────────────────────────────────────┐
│                          Kubernetes Cluster                            │
│                                                                         │
│  ┌────────────────────┐                                                │
│  │  Control Plane      │                                                │
│  │  ┌──────────────┐  │                                                │
│  │  │ API Server    │  │  ← kubectl gọi vào                            │
│  │  ├──────────────┤  │                                                │
│  │  │ Scheduler     │  │  ← chọn node cho pod                          │
│  │  ├──────────────┤  │                                                │
│  │  │ etcd          │  │  ← key-value store (state)                    │
│  │  ├──────────────┤  │                                                │
│  │  │ Controller    │  │  ← reconcile loop (desired vs actual)         │
│  │  │ Manager       │  │                                                │
│  │  └──────────────┘  │                                                │
│  └────────────────────┘                                                │
│                                                                         │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                       │
│  │   Node 1    │  │   Node 2    │  │   Node 3    │  ← worker node       │
│  │            │  │            │  │            │                       │
│  │  ┌──────┐  │  │  ┌──────┐  │  │  ┌──────┐  │                       │
│  │  │ Pod  │  │  │  │ Pod  │  │  │  │ Pod  │  │  ← 1 pod = 1+ container│
│  │  └──────┘  │  │  └──────┘  │  │  └──────┘  │                       │
│  │  ┌──────┐  │  │            │  │  ┌──────┐  │                       │
│  │  │ Pod  │  │  │            │  │  │ Pod  │  │                       │
│  │  └──────┘  │  │            │  │  └──────┘  │                       │
│  │  kubelet   │  │  kubelet   │  │  kubelet   │  ← agent trên mỗi node│
│  └────────────┘  └────────────┘  └────────────┘                       │
└──────────────────────────────────────────────────────────────────────┘
```

## Khái niệm cốt lõi

### Pod
**Pod** = đơn vị nhỏ nhất K8s deploy. 1 pod chứa 1+ container (thường 1). Container trong cùng pod share network + storage.

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: order-service-pod
spec:
  containers:
    - name: order-service
      image: food-ordering/order-service:1.0
      ports:
        - containerPort: 8181
```

Pod có IP riêng trong cluster. Nhưng pod **ephemeral** — chết là mất.

### Deployment
**Deployment** quản lý nhiều pod cùng template. Đảm bảo n replica chạy.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service-deployment
spec:
  replicas: 3                          # luôn duy trì 3 pod
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
        - name: order-service
          image: food-ordering/order-service:1.0
          ports:
            - containerPort: 8181
```

Pod crash → Deployment recreate. Scale `replicas=10` → tạo 7 pod mới.

### Service
**Service** = stable network endpoint cho pod. Vì pod IP đổi, Service cho hostname/IP cố định.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
spec:
  selector:
    app: order-service
  ports:
    - port: 8181
      targetPort: 8181
  type: ClusterIP                       # internal only
```

Type:
- **ClusterIP** — chỉ truy cập trong cluster.
- **NodePort** — expose port trên mỗi node.
- **LoadBalancer** — cloud provider tạo external LB.
- **Ingress** — gateway HTTPS route nhiều service.

### ConfigMap + Secret
**ConfigMap** lưu config (như application.yml). **Secret** lưu password.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service-config
data:
  application.yml: |
    server.port: 8181
    spring.datasource.url: jdbc:postgresql://postgres-service:5432/postgres
```

Pod mount ConfigMap as volume hoặc env var.

### StatefulSet
**StatefulSet** cho stateful workload (Postgres, Kafka). Giống Deployment nhưng pod có **identity ổn định** (postgres-0, postgres-1) và **persistent storage**.

### PersistentVolume + Claim
Pod ephemeral → cần PV để lưu data lâu dài.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 10Gi
```

## Tools để chạy K8s local

### minikube
Single-node cluster trong VM. Phổ biến nhất.

```text
$ brew install minikube
$ minikube start --cpus=4 --memory=8192 --driver=docker
$ kubectl get nodes
NAME       STATUS   ROLES           AGE   VERSION
minikube   Ready    control-plane   1m    v1.29.0
```

### kind (Kubernetes in Docker)
Chạy cluster trong Docker container. Nhẹ hơn minikube.

### Docker Desktop K8s
Bật toggle "Enable Kubernetes" → cluster auto. Đơn giản nhất.

### k3d / k3s
Lightweight K8s cho edge/dev.

Khoá học dùng **minikube** — quen thuộc, doc nhiều.

## kubectl — CLI điều khiển cluster

```text
$ kubectl get pods                    # list pod
$ kubectl get pods -n kube-system     # specific namespace
$ kubectl describe pod order-pod      # chi tiết
$ kubectl logs order-pod              # log
$ kubectl logs -f order-pod           # follow log
$ kubectl exec -it order-pod -- bash  # ssh vào pod
$ kubectl apply -f deployment.yaml    # apply file
$ kubectl delete pod order-pod        # xoá
$ kubectl scale deployment order-service --replicas=5
$ kubectl rollout status deployment/order-service
$ kubectl rollout undo deployment/order-service   # rollback
```

## Plan chạy food-ordering trên K8s

```text
namespace: food-ordering-system

Deployments:
  - zookeeper                 (1 replica)
  - kafka-broker-1/2/3        (3 replicas StatefulSet)
  - schema-registry            (1 replica)
  - postgres                  (1 replica StatefulSet)
  - order-service              (1 replica, scale to 3)
  - payment-service            (1 replica)
  - restaurant-service         (1 replica)
  - customer-service           (1 replica)

Services:
  - zookeeper-service          ClusterIP
  - kafka-service              ClusterIP (headless cho StatefulSet)
  - schema-registry-service    ClusterIP
  - postgres-service           ClusterIP
  - order-service              ClusterIP (port 8181)
  - payment-service            ClusterIP
  - restaurant-service         ClusterIP
  - customer-service           ClusterIP
  - order-ingress              NodePort hoặc LoadBalancer (expose REST cho Postman)

ConfigMaps:
  - order-service-config       (application.yml)
  - payment-service-config
  - restaurant-service-config
  - customer-service-config

PersistentVolumeClaims:
  - postgres-pvc               (10Gi)
  - zookeeper-pvc              (1Gi)
  - kafka-broker-1-pvc         (5Gi)
  - kafka-broker-2-pvc         (5Gi)
  - kafka-broker-3-pvc         (5Gi)
```

## Confluent Kafka Helm Chart — easy mode

Setup Kafka thủ công 3 broker + Zookeeper + Schema Registry trong K8s rất rườm rà. **Helm** = package manager cho K8s. Confluent công bố `cp-helm-charts`:

```text
$ helm repo add confluentinc https://confluentinc.github.io/cp-helm-charts/
$ helm install kafka-cluster confluentinc/cp-helm-charts \
    --namespace food-ordering-system \
    --set cp-zookeeper.servers=1 \
    --set cp-kafka.brokers=3 \
    --set cp-kafka-rest.enabled=false \
    --set cp-kafka-connect.enabled=false \
    --set cp-ksql-server.enabled=false \
    --set cp-control-center.enabled=false
```

1 lệnh → Kafka cluster lên trong K8s. Bài 46 sẽ chi tiết.

## Performance consideration trên K8s local

minikube với 8GB RAM:

| Workload | RAM est. |
|---|---|
| K8s control plane | ~1 GB |
| Zookeeper | ~150 MB |
| Kafka 3 broker | ~1.5 GB (500 MB/broker) |
| Schema Registry | ~250 MB |
| Postgres | ~300 MB |
| 4 service Spring Boot | ~2 GB (500 MB/service) |
| Buffer | ~2 GB |

Cần 8GB ít nhất. 16GB thoải mái.

## Bẫy thường gặp khi vào K8s lần đầu

| Bẫy | Sửa |
|---|---|
| Pod CrashLoopBackOff | `kubectl logs pod-name` xem stack trace. Thường là port conflict, missing config, image fail. |
| Image pull error | minikube tải image từ Docker Hub. Nếu image local → `minikube image load food-ordering/order:1.0`. |
| Service không expose từ ngoài cluster | Type ClusterIP chỉ internal. Dùng NodePort hoặc port-forward. |
| Pod cannot connect Postgres | DNS resolution. Hostname phải là Service name, không IP. |
| OOM kill pod | Tăng resource limit hoặc giảm replica. |
| ConfigMap update không reflect vào pod | Pod phải restart để load lại. Hoặc dùng tool reload-config. |
| Persistent data mất khi delete StatefulSet | PVC retain phải explicit. |

## Tóm tắt bài 45

- K8s = container orchestrator, quản lý deploy/scale/restart/load balance tự động.
- Khái niệm chính: Pod, Deployment, Service, ConfigMap, Secret, PersistentVolume, StatefulSet.
- 3 cách chạy K8s local: minikube, kind, Docker Desktop K8s.
- Confluent cp-helm-charts deploy Kafka cluster trong 1 lệnh.
- Plan: 4 microservice + Kafka cluster + Postgres + Schema Registry, dùng 1 namespace.
- minikube cần ít nhất 8GB RAM cho full stack.

**Bài kế tiếp** → [Bài 46: Deploy Kafka stack vào K8s qua Helm](02-deploy-kafka-helm.md)

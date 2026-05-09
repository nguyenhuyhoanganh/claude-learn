# Bài 5: EFS Volumes trên AWS EKS

## Tại Sao Cần EFS (Không Dùng hostPath)?

```
Trên minikube:
  hostPath → Chạy OK (chỉ 1 node)

Trên EKS với 2+ nodes:
  hostPath → KHÔNG DÙNG ĐƯỢC!
  → Pod A chạy trên Node 1 → data ở Node 1:/data/
  → Pod B chạy trên Node 2 → Node 2:/data/ TRỐNG!
  → Kubernetes không biết pod sẽ chạy node nào

Giải pháp: AWS EFS (Elastic File System)
  → Storage độc lập với nodes
  → Tất cả nodes đều kết nối được
  → Data luôn nhất quán
```

---

## Bước 1: Cài AWS EFS CSI Driver vào Cluster

```bash
kubectl apply -k \
  "github.com/kubernetes-sigs/aws-efs-csi-driver/deploy/kubernetes/overlays/stable/?ref=release-1.3"

# Verify
kubectl get pods -n kube-system | grep efs
```

Driver này cho phép Kubernetes hiểu và dùng EFS.

---

## Bước 2: Tạo Security Group cho EFS

```
EC2 Console → Security Groups → Create security group

Name: eks-efs
VPC: chọn eksVpc (VPC của cluster)

Inbound rules → Add rule:
  Type: NFS
  Port: 2049  (tự điền)
  Source: Custom → paste IPv4 CIDR của eksVpc

(Lấy CIDR: VPC Console → VPCs → chọn eksVpc → copy IPv4 CIDR)

Outbound rules: giữ mặc định
→ Create security group
```

---

## Bước 3: Tạo EFS File System

```
EFS Console → Create file system

Name: eks-efs
VPC: chọn eksVpc
→ Click "Customize" (không phải Create)

Network access:
  → Xóa default security groups
  → Thêm eks-efs security group cho cả 2 Availability Zones
→ Next → Next → Create

Sau khi tạo xong: Copy File System ID (dạng fs-xxxxxxxx)
```

---

## Bước 4: Config Kubernetes YAML

### StorageClass (từ EFS driver examples)

```yaml
kind: StorageClass
apiVersion: storage.k8s.io/v1
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com
```

### PersistentVolume

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: efs-pv
spec:
  capacity:
    storage: 5Gi          # EFS thực ra không giới hạn, nhưng phải khai báo
  volumeMode: Filesystem
  accessModes:
    - ReadWriteMany        # Nhiều nodes đều ghi được
  storageClassName: efs-sc
  csi:
    driver: efs.csi.aws.com
    volumeHandle: fs-xxxxxxxx   # ← ID của EFS file system vừa tạo
```

### PersistentVolumeClaim

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: efs-pvc
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: efs-sc
  resources:
    requests:
      storage: 5Gi
```

### Deployment — Dùng PVC

```yaml
spec:
  template:
    spec:
      volumes:
        - name: efs-vol
          persistentVolumeClaim:
            claimName: efs-pvc

      containers:
        - name: users
          image: USERNAME/users-image
          volumeMounts:
            - name: efs-vol
              mountPath: /app/users    # Path trong container
```

---

## Bước 5: Apply

```bash
# Apply theo thứ tự (quan trọng!)
kubectl apply -f storageclass.yaml    # StorageClass trước
kubectl apply -f users.yaml           # PV + PVC + Deployment

# Verify
kubectl get pv
# NAME    CAPACITY  ACCESS MODES  STATUS  STORAGECLASS
# efs-pv  5Gi       RWX           Bound   efs-sc

kubectl get pvc
# NAME     STATUS  VOLUME  CAPACITY  ACCESS MODES
# efs-pvc  Bound   efs-pv  5Gi       RWX
```

---

## Test Data Persistence

```bash
# 1. Ghi data qua API
POST /users/signup → user được tạo, log được ghi vào EFS

# 2. Scale down về 0 pod
# Edit replicas: 0 trong YAML
kubectl apply -f users.yaml

# 3. Scale up lại
# Edit replicas: 2
kubectl apply -f users.yaml

# 4. Kiểm tra data còn không
GET /users/logs → data vẫn còn! (stored trên EFS, không mất)
```

---

## EFS Monitoring

```
EFS Console → File system → Monitoring tab
  → Thấy client connections (số pods kết nối)
  → Thấy data written (bytes ghi)
  → Metered size tăng dần khi có data
```

---

## Toàn Bộ Flow

```
Kubernetes Pods
  ↓ dùng
PVC (efs-pvc)
  ↓ claim
PV (efs-pv) với CSI driver
  ↓ kết nối qua
AWS EFS File System
  → Data lưu ở đây, không phụ thuộc Pod/Node nào
  → Survive khi Pod xóa và tạo lại
  → Accessible từ tất cả nodes trong VPC
```

---

**Tiếp theo:** Tổng kết Phase 15 →

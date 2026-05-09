# Bài 3: CSI Volume Type và Persistent Volumes

## CSI — Container Storage Interface

### Vấn Đề CSI Giải Quyết

Kubernetes có nhiều built-in volume types: `awsElasticBlockStore`, `azureDisk`, `azureFile`, `nfs`... Nhưng mỗi lần muốn hỗ trợ storage mới lại phải thêm code vào Kubernetes core.

**CSI = Giải pháp:**

```
Kubernetes định nghĩa CSI interface
  ↓
Third-party providers (AWS, Azure, etc.) implement driver cho interface đó
  ↓
Bất kỳ storage nào cũng có thể tích hợp với Kubernetes

Ví dụ: AWS EFS CSI Driver
  → AWS viết driver implement CSI interface
  → Kubernetes dùng driver đó để kết nối với EFS
  → Không cần sửa Kubernetes core
```

### Cài CSI Driver

```bash
# Ví dụ cài AWS EFS CSI Driver
kubectl apply -k "github.com/kubernetes-sigs/aws-efs-csi-driver/deploy/kubernetes/overlays/stable/?ref=release-1.X"
```

### Dùng CSI trong PersistentVolume

```yaml
spec:
  csi:
    driver: efs.csi.aws.com        # Tên driver
    volumeHandle: fs-xxxxxxxx      # ID của EFS file system
```

---

## Persistent Volumes (PV) — Khái Niệm

### Vấn Đề với Normal Volumes

```
Normal volumes (emptyDir, hostPath):
  → Được định nghĩa bên trong Pod spec
  → Phụ thuộc vào Pod lifecycle
  → Pod xóa → Volume mất (emptyDir)
  → Node-specific (hostPath)
  → Phải config lại cho mỗi Deployment YAML file
```

### PersistentVolume = Giải Pháp

```
Cluster
  ├── Node 1
  │   └── Pod A  ──── PVC ──── PersistentVolume (EFS/cloud storage)
  ├── Node 2
  │   └── Pod B  ──── PVC ──┘
  └── PersistentVolume (standalone resource)
         → Không thuộc về Node nào
         → Không thuộc về Pod nào
         → Data luôn tồn tại dù Pod/Node thay đổi
```

### 3 Tầng: PV → PVC → Pod

```
PersistentVolume (PV):
  → Admin định nghĩa: "Có storage này sẵn sàng"
  → Standalone Kubernetes resource

PersistentVolumeClaim (PVC):
  → Developer định nghĩa: "Pod cần dùng storage với specs này"
  → Kết nối Pod với PV

Pod:
  → Dùng PVC như 1 volume
  → Không biết/cần biết PV cụ thể nào đằng sau
```

---

## Định Nghĩa PersistentVolume

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: host-pv            # Tên PV (admin đặt)
spec:
  capacity:
    storage: 1Gi           # Tổng dung lượng có sẵn

  volumeMode: Filesystem   # Filesystem hoặc Block

  accessModes:
    - ReadWriteOnce        # Ai có thể access

  storageClassName: standard  # Storage class (cần khớp với PVC)

  hostPath:                # Type: hostPath (chỉ cho dev!)
    path: /data
    type: DirectoryOrCreate
```

### accessModes Options

```
ReadWriteOnce (RWO):
  → Nhiều Pods trên CÙNG 1 Node có thể đọc/ghi
  → Chỉ 1 Node access tại 1 thời điểm

ReadOnlyMany (ROX):
  → Nhiều Nodes có thể đọc
  → Không ai ghi được

ReadWriteMany (RWX):
  → Nhiều Nodes đều có thể đọc VÀ ghi
  → Cần storage hỗ trợ (EFS, NFS...)
  → awsElasticBlockStore không hỗ trợ loại này
```

### Availability Matrix

| Volume Type | RWO | ROX | RWX |
|---|---|---|---|
| hostPath | ✓ | - | - |
| awsElasticBlockStore | ✓ | - | - |
| AWS EFS (CSI) | ✓ | ✓ | ✓ |
| NFS | ✓ | ✓ | ✓ |

---

## Xem PersistentVolumes

```bash
kubectl get pv                # Liệt kê tất cả PVs
kubectl describe pv host-pv   # Chi tiết 1 PV
```

```
NAME     CAPACITY  ACCESS MODES  STATUS  CLAIM        STORAGECLASS
host-pv  1Gi       RWO           Bound   default/pvc  standard
```

---

**Tiếp theo:** PersistentVolumeClaims — Cách Pod dùng PV →

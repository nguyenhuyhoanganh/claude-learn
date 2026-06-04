# Bài 2: StorageClass + Dynamic Provisioning + CSI

## Vấn đề với static PV

Bài 1: admin **tạo PV trước**, user claim qua PVC.

Production K8s cluster lớn:
- 100 dev tạo PVC mỗi tuần.
- Admin phải tạo 100 PV tay → không scale.
- Mỗi PV cần biết detail storage backend.

→ Cần **dynamic provisioning**: K8s tự tạo PV khi PVC được tạo.

## StorageClass

> **StorageClass** = template để dynamic provision PV.

Cluster admin tạo StorageClass:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/aws-ebs       # ai tạo PV
parameters:                              # config cho provisioner
  type: gp3
  iops: "3000"
  throughput: "125"
  encrypted: "true"
reclaimPolicy: Delete                    # khi PVC xoá → PV xoá
allowVolumeExpansion: true               # cho phép expand PVC sau
volumeBindingMode: WaitForFirstConsumer  # đợi Pod schedule rồi mới tạo PV
```

User chỉ tạo PVC + reference StorageClass:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
spec:
  accessModes: [ReadWriteOnce]
  resources: { requests: { storage: 50Gi } }
  storageClassName: fast-ssd             # ← StorageClass nào
```

Workflow:
```text
[User] kubectl apply -f pvc.yaml
        │
        ▼
[apiserver]
        │
        ▼
[Provisioner (EBS controller)]
   - Đọc PVC + StorageClass
   - Call AWS API: tạo EBS volume gp3, 50Gi
   - Tạo PV trong K8s
   - Bind PVC ↔ PV
        │
        ▼
PVC status: Bound
```

→ Hoàn toàn automatic. User không cần biết EBS, gp3.

## Provisioner types

| Provisioner | Backend |
|---|---|
| `kubernetes.io/aws-ebs` | AWS EBS (deprecated, dùng `ebs.csi.aws.com`) |
| `kubernetes.io/gce-pd` | GCP Persistent Disk |
| `kubernetes.io/azure-disk` | Azure Disk |
| `kubernetes.io/no-provisioner` | Static — không tự tạo, dùng cho local volume |
| `ebs.csi.aws.com` | AWS EBS via CSI (recommend) |
| `efs.csi.aws.com` | AWS EFS (RWX) |
| `pd.csi.storage.gke.io` | GCP PD via CSI |
| `disk.csi.azure.com` | Azure Disk via CSI |
| `rook-ceph.cephfs.csi.ceph.com` | Ceph |

→ Modern: **CSI** (Container Storage Interface) — chuẩn plugin storage cho K8s.

## Volume Binding Mode

```yaml
volumeBindingMode: Immediate              # default
# hoặc:
volumeBindingMode: WaitForFirstConsumer
```

### Immediate (default)

PVC tạo → PV tạo ngay → bound.

Vấn đề:
- Multi-zone cluster: PV tạo ở zone X.
- Pod schedule lên node zone Y → Pod stuck (volume zone mismatch).

### WaitForFirstConsumer

PV **không tạo** khi PVC tạo. Đợi:
- Pod consume PVC.
- Scheduler chọn node cho Pod.
- → Sau đó tạo PV ở **đúng zone của node**.

→ Tránh zone mismatch. **Recommend cho cloud cluster**.

## Default StorageClass

Cluster có thể có 1 default StorageClass:

```yaml
metadata:
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
```

→ PVC không khai `storageClassName` → dùng default.

```bash
kubectl get sc
# NAME              PROVISIONER         RECLAIM   DEFAULT   AGE
# standard (default) kubernetes.io/...  Delete    true      30d
# fast-ssd           ebs.csi.aws.com    Retain    false     5m
```

Đổi default:
```bash
# Remove default từ class hiện tại
kubectl patch sc standard -p '{"metadata": {"annotations": {"storageclass.kubernetes.io/is-default-class": "false"}}}'

# Set class khác làm default
kubectl patch sc fast-ssd -p '{"metadata": {"annotations": {"storageclass.kubernetes.io/is-default-class": "true"}}}'
```

## Volume Expansion

Cho phép tăng size PVC sau khi tạo (không thể giảm):

```yaml
# StorageClass
allowVolumeExpansion: true
```

```bash
# Tăng size PVC từ 10Gi → 50Gi
kubectl edit pvc my-pvc
# spec:
#   resources:
#     requests:
#       storage: 50Gi          # đổi từ 10Gi

# K8s sẽ:
# 1. Resize backend volume (EBS modify-volume)
# 2. Resize filesystem trong Pod (qua filesystem-resize)
```

→ Hữu ích khi DB ngày càng lớn.

## CSI (Container Storage Interface)

> **CSI** = chuẩn API cho storage plugin trong K8s.

Tránh hardcode storage logic vào K8s core:

```text
Trước CSI:
[K8s core code] → AWS EBS code (in-tree)
                → GCP PD code
                → Azure Disk code
                → ... (hardcode N backend)

CSI:
[K8s core code] → CSI interface
                       │
                       ▼
        [CSI Driver Pod] (external)
        ├── AWS EBS CSI Driver
        ├── GCP PD CSI Driver
        └── ... (run như Pod trong cluster)
```

→ CSI driver chạy như Pod (DaemonSet + StatefulSet). Cài qua Helm.

### Cài CSI driver (vd AWS EBS)

```bash
# Helm
helm install aws-ebs-csi-driver aws-ebs-csi-driver/aws-ebs-csi-driver \
  --namespace kube-system

# Verify
kubectl get pod -n kube-system | grep ebs-csi
# ebs-csi-controller-xxx     Running
# ebs-csi-node-yyy            Running (mỗi node)
```

Sau khi cài, tạo StorageClass:
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-gp3
provisioner: ebs.csi.aws.com             # CSI driver
parameters:
  type: gp3
  encrypted: "true"
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

→ Dùng như StorageClass thường.

## Static volume với StorageClass

Khi storage tạo manual (vd NFS server), vẫn dùng StorageClass:

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: local-storage
provisioner: kubernetes.io/no-provisioner   # không auto provision
volumeBindingMode: WaitForFirstConsumer
```

Admin tạo PV manual:
```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: local-pv-1
spec:
  capacity: { storage: 50Gi }
  accessModes: [ReadWriteOnce]
  storageClassName: local-storage
  local:
    path: /mnt/disks/disk1
  nodeAffinity:
    required:
      nodeSelectorTerms:
        - matchExpressions:
            - { key: kubernetes.io/hostname, operator: In, values: [worker-1] }
```

→ Local volume — Pod schedule lên `worker-1` để dùng.

## VolumeSnapshot (CSI feature)

Backup PVC bằng snapshot:

```yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshotClass
metadata:
  name: csi-aws-vsc
driver: ebs.csi.aws.com
deletionPolicy: Delete
parameters:
  encrypted: "true"

---
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata:
  name: my-snapshot
spec:
  volumeSnapshotClassName: csi-aws-vsc
  source:
    persistentVolumeClaimName: my-pvc
```

Restore từ snapshot:
```yaml
kind: PersistentVolumeClaim
spec:
  storageClassName: ebs-gp3
  dataSource:
    name: my-snapshot
    kind: VolumeSnapshot
    apiGroup: snapshot.storage.k8s.io
  resources: { requests: { storage: 50Gi } }
```

→ Tạo PVC từ snapshot. Backup/restore database dễ.

## Tổng hợp Workflow Storage

```text
[Cluster admin] tạo StorageClass
         │
         ▼
[CSI Driver Pod] đang chạy
         │
[User] tạo PVC
   spec.storageClassName: fast-ssd
         │
         ▼
[Provisioner watch PVC]
         │
         ▼
[Provisioner gọi cloud API]
   Tạo EBS volume
         │
         ▼
[Provisioner tạo PV trong K8s]
         │
         ▼
[K8s bind PVC ↔ PV]
         │
         ▼
[Pod] consume PVC
   spec.volumes.persistentVolumeClaim.claimName: my-pvc
         │
         ▼
[Kubelet] mount volume vào Pod
   /var/lib/kubelet/pods/<uid>/volumes/...
         │
         ▼
[Container] thấy /data có dữ liệu
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Không cài CSI driver | PVC stuck Pending | Cài driver trước StorageClass |
| `volumeBindingMode: Immediate` + multi-zone | Zone mismatch | `WaitForFirstConsumer` |
| Default reclaim `Delete` cho prod DB | Mất data khi xoá PVC | Set `Retain` |
| Quên `allowVolumeExpansion: true` | Không resize được | Add flag |
| Local PV nhưng quên nodeAffinity | Pod schedule sai node | Add nodeAffinity |
| 2 StorageClass cùng `is-default-class: true` | Behavior không predictable | Chỉ 1 default |
| Cài CSI driver version cũ | Bug, feature thiếu | Update CSI khi K8s upgrade |
| PVC xoá khi PV `Retain` | PV status Released, không reuse được | Manually clean + tạo PV mới |

## Quick reference

```yaml
# StorageClass
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
reclaimPolicy: Delete | Retain
volumeBindingMode: WaitForFirstConsumer | Immediate
allowVolumeExpansion: true

# PVC reference SC
spec:
  storageClassName: fast
  accessModes: [ReadWriteOnce]
  resources: { requests: { storage: 10Gi } }
```

```bash
# List
kubectl get sc
kubectl get pv
kubectl get pvc

# Set default
kubectl patch sc <name> -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}'

# Resize PVC (cần allowVolumeExpansion)
kubectl edit pvc my-pvc        # sửa storage value

# Verify CSI driver
kubectl get pods -n kube-system | grep csi
```

## Tóm tắt bài 2

- **StorageClass** = template dynamic provision PV.
- Admin tạo SC + cài provisioner. User chỉ tạo PVC + reference SC.
- **CSI (Container Storage Interface)** = chuẩn plugin storage. Cài qua Helm.
- `volumeBindingMode: WaitForFirstConsumer` cho cloud cluster multi-zone.
- `allowVolumeExpansion: true` để resize PVC sau.
- Default SC: annotation `storageclass.kubernetes.io/is-default-class: "true"`.
- Static PV với SC `kubernetes.io/no-provisioner` (local storage).
- VolumeSnapshot + dataSource cho backup/restore PVC.

Phase 8 (Storage) hoàn thành! Bạn đã biết Volume, PV, PVC, StorageClass, CSI, dynamic provisioning.

**Bài kế tiếp** → [Phase 9 - Bài 1: Cluster Networking + CNI](../phase-9-networking/01-cluster-networking-cni.md)

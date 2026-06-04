# Bài 1: Volumes, PV, PVC

## Vì sao cần Volume?

Container có filesystem **ephemeral** (tạm thời):
- Container restart → data trong container **mất**.
- Pod chết → data trong Pod **mất**.

Vấn đề:
```text
[Pod database (PostgreSQL)]
   /var/lib/postgresql/data  (data lưu trong container)
        │
        │ Pod restart vì OOM
        ▼
   [Pod database mới]
   /var/lib/postgresql/data  (EMPTY — data mất!)
```

→ Cần **Volume**: storage tách rời lifecycle container.

## Volume trong K8s

### Pod-level volume (basic)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  containers:
    - name: app
      image: nginx
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:                          # định nghĩa volume cho Pod
    - name: data
      emptyDir: {}
```

→ Volume `data` mount tại `/data` trong container. Multi-container Pod → mount cùng volume = share data.

### Volume types (built-in)

| Volume type | Use case |
|---|---|
| **emptyDir** | Temp storage, share giữa container trong Pod. Mất khi Pod xoá |
| **hostPath** | Mount path từ node OS. Risky |
| **configMap** | Mount ConfigMap thành file |
| **secret** | Mount Secret thành file |
| **persistentVolumeClaim** | Mount PVC (recommend cho persistent data) |
| **downwardAPI** | Mount Pod metadata (vd label, IP) thành file |
| **projected** | Combine nhiều source thành 1 volume |

Legacy (tránh dùng trực tiếp, nên qua PV):
- `awsElasticBlockStore`, `gcePersistentDisk`, `azureDisk`, `nfs`, `cephfs`, `glusterfs`, ...

### emptyDir — Temp share

```yaml
spec:
  containers:
    - name: app
      image: nginx
      volumeMounts:
        - { name: cache, mountPath: /cache }
    - name: log-shipper
      image: fluentd
      volumeMounts:
        - { name: cache, mountPath: /cache, readOnly: true }   # share read
  volumes:
    - name: cache
      emptyDir: {}
      # emptyDir:
      #   medium: Memory                  # tmpfs (RAM-backed)
      #   sizeLimit: 1Gi
```

→ App + log-shipper share `/cache`. Mất khi Pod xoá.

### hostPath — Node OS path

```yaml
volumes:
  - name: logs
    hostPath:
      path: /var/log/myapp
      type: DirectoryOrCreate         # tạo nếu chưa có
```

| `type` | Behavior |
|---|---|
| `(empty)` | Không check |
| `DirectoryOrCreate` | Tạo dir nếu chưa có |
| `Directory` | Phải tồn tại |
| `FileOrCreate` | Tạo file nếu chưa có |
| `File` | Phải tồn tại |
| `Socket` | Phải là Unix socket |
| `CharDevice`, `BlockDevice` | Device file |

→ hostPath nguy hiểm:
- Pod schedule lên node khác → path khác, data khác.
- Container có thể access /etc, /var/lib/... của host.

**Chỉ dùng** cho:
- DaemonSet system (log shipper đọc /var/log).
- Monitoring agent (đọc /proc, /sys).

→ App user → dùng PV/PVC.

## Vấn đề với volume inline trong Pod

```yaml
# Pod 1
volumes:
  - name: data
    awsElasticBlockStore:
      volumeID: vol-abc123
      fsType: ext4

# Pod 2 (sau khi Pod 1 chết, muốn re-attach)
# → phải copy y nguyên config volume — error-prone
```

Vấn đề:
- Dev phải biết storage detail (AWS, GCP, ...).
- Mỗi cloud một type → app YAML không portable.
- Quản lý volume manual.

→ Cần abstraction. **Persistent Volume (PV)** + **Persistent Volume Claim (PVC)**.

## Persistent Volume (PV) — Cluster-scoped resource

> **PV** = storage resource trong cluster, tách rời Pod lifecycle.

Cluster admin tạo PV trước (hoặc auto qua StorageClass — bài sau):

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: my-pv
spec:
  capacity:
    storage: 10Gi
  volumeMode: Filesystem               # hoặc Block
  accessModes:
    - ReadWriteOnce                    # vd
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""                 # cho manual
  awsElasticBlockStore:                # backend
    volumeID: vol-abc123
    fsType: ext4
```

→ Tạo PV → vào pool resource. Pod **không reference trực tiếp** PV. Pod request qua PVC.

### Access Modes

| Mode | Mô tả |
|---|---|
| **ReadWriteOnce (RWO)** | 1 node mount RW (default) |
| **ReadOnlyMany (ROX)** | Nhiều node mount read-only |
| **ReadWriteMany (RWX)** | Nhiều node mount RW (cần backend support: NFS, CephFS, ...) |
| **ReadWriteOncePod (RWOP)** | Chỉ 1 Pod mount RW (1.22+, stricter than RWO) |

→ Block storage (AWS EBS, GCP PD) chỉ RWO. File storage (NFS, EFS) hỗ trợ RWX.

### Reclaim Policy

Khi PVC xoá → PV xử lý ra sao?

| Policy | Hành vi |
|---|---|
| `Retain` | Giữ PV + data. Admin manual clean. |
| `Delete` | Xoá PV + xoá backend storage (cloud disk). |
| `Recycle` | DEPRECATED. Format và reuse. |

→ Production critical: `Retain` (cẩn thận, không mất data).

## Persistent Volume Claim (PVC) — Namespace-scoped

> **PVC** = "đơn đăng ký" cho PV. Pod claim storage qua PVC.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-pvc
  namespace: dev
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
  storageClassName: ""                 # match PV
```

K8s match PVC với PV phù hợp:
- accessMode match.
- Storage size >= PVC request.
- StorageClass match.
- Selector match (nếu có).

→ Bound. PVC dùng được.

### Pod consume PVC

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: app
      image: nginx
      volumeMounts:
        - { name: data, mountPath: /data }
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: my-pvc
```

→ Pod nhìn thấy `/data` chứa data từ PV (qua PVC).

## Lifecycle PV ↔ PVC

```text
[1. Cluster admin: create PV]
   apiVersion: v1
   kind: PersistentVolume
   ...
        │
        ▼ status: Available

[2. User: create PVC]
   apiVersion: v1
   kind: PersistentVolumeClaim
   ...
        │
        ▼ K8s binder tìm PV match
        │
        ▼ PV bound to PVC
   PV status: Bound
   PVC status: Bound

[3. Pod consume PVC]
   spec:
     volumes:
       - persistentVolumeClaim:
           claimName: my-pvc

[4. PVC delete]
        │
        ▼ Reclaim policy:
        - Retain: PV ở status "Released" — data còn
        - Delete: PV xoá luôn + backend storage xoá
```

### Status

```bash
kubectl get pv
# NAME    CAPACITY   ACCESS MODES   RECLAIM    STATUS      CLAIM         AGE
# my-pv   10Gi       RWO            Retain     Bound       dev/my-pvc    5m

kubectl get pvc -n dev
# NAME     STATUS   VOLUME   CAPACITY   ACCESS MODES   AGE
# my-pvc   Bound    my-pv    10Gi       RWO            5m
```

| Status PVC | Mô tả |
|---|---|
| `Pending` | Chưa bind với PV |
| `Bound` | Đã bind PV |
| `Lost` | PV bị xoá nhưng PVC còn |

| Status PV | Mô tả |
|---|---|
| `Available` | Chưa bind |
| `Bound` | Bound với PVC |
| `Released` | PVC đã xoá, data còn (Retain policy) |
| `Failed` | Reclaim fail |

## Use case: Database persistent

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 50Gi
  storageClassName: fast-ssd

---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels: { app: postgres }
  template:
    metadata:
      labels: { app: postgres }
    spec:
      containers:
        - name: postgres
          image: postgres:16
          volumeMounts:
            - { name: data, mountPath: /var/lib/postgresql/data }
          env:
            - { name: POSTGRES_PASSWORD, value: pass }
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: postgres-data
```

→ Pod restart, node fail → re-attach volume → data còn.

## Multiple Pod cùng volume

ReadWriteMany cần backend support:

```yaml
# PV NFS
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-pv
spec:
  capacity: { storage: 100Gi }
  accessModes: [ReadWriteMany]
  nfs:
    server: nfs.example.com
    path: /exports/shared

---
# PVC + Deployment multi Pod
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: shared-pvc
spec:
  accessModes: [ReadWriteMany]
  resources: { requests: { storage: 100Gi } }
  storageClassName: ""

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3                          # 3 Pod cùng mount
  template:
    spec:
      containers:
        - name: nginx
          image: nginx
          volumeMounts:
            - { name: shared, mountPath: /usr/share/nginx/html }
      volumes:
        - name: shared
          persistentVolumeClaim:
            claimName: shared-pvc
```

→ 3 Pod share content. Update file → mọi Pod thấy.

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| PV/PVC `accessMode` không match | PVC stuck Pending | Verify match |
| PVC request > PV capacity | PVC stuck Pending | PVC request <= PV |
| StorageClass mismatch | PVC stuck Pending | Match storageClassName |
| Reclaim Delete cho prod DB | Mất data khi xoá PVC | Set `Retain` cho critical |
| hostPath trong cluster nhiều node | Pod schedule node khác = data khác | Dùng PV |
| Multi-Pod mount ReadWriteOnce PV | Pod sau stuck | Cần ReadWriteMany |
| Quên `volumeMounts` trong container | Volume không có hiệu lực | Add volumeMounts |
| PVC trong namespace khác Pod | Pod stuck Pending | Cùng namespace |

## Quick reference

```yaml
# PV
apiVersion: v1
kind: PersistentVolume
metadata: { name: X }
spec:
  capacity: { storage: 10Gi }
  accessModes: [ReadWriteOnce]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  hostPath: { path: /data }            # demo
  # awsElasticBlockStore: { volumeID: vol-X }   # cloud

# PVC
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: X, namespace: dev }
spec:
  accessModes: [ReadWriteOnce]
  resources: { requests: { storage: 5Gi } }
  storageClassName: ""

# Pod use PVC
spec:
  containers:
    - volumeMounts:
        - { name: data, mountPath: /data }
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: X
```

```bash
kubectl get pv
kubectl get pvc -A
kubectl describe pvc my-pvc -n dev
```

## Tóm tắt bài 1

- Container filesystem **ephemeral**. Cần Volume cho data persist.
- **Volume types**: emptyDir (temp share), hostPath (node FS), PVC (recommend), configMap/secret (config).
- **PV** = storage resource (cluster-scoped). **PVC** = đăng ký storage (namespace-scoped).
- **Access mode**: RWO, ROX, RWX, RWOP. Cloud block storage chỉ RWO.
- **Reclaim policy**: Retain (giữ), Delete (xoá data), Recycle (deprecated).
- PV match PVC qua: accessMode + capacity + storageClass + selector.
- Pod consume PVC qua `volumes.persistentVolumeClaim.claimName`.
- Production: `Retain` cho critical, dùng StorageClass (bài sau) để dynamic.

**Bài kế tiếp** → [Bài 2: StorageClass + Dynamic Provisioning + CSI](02-storageclass-csi.md)

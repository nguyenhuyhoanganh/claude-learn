# Bài 4: PersistentVolumeClaims — Kết Nối Pod với PV

## PVC là Gì?

```text
PersistentVolume    → Admin tạo: "Storage này có sẵn"
PersistentVolumeClaim → Developer tạo: "Pod cần storage như này"
→ Kubernetes tự match PVC với PV phù hợp
```

---

## Tạo StorageClass

StorageClass cung cấp thông tin cho Kubernetes về cách provision storage. Phải dùng trước khi tạo PV/PVC.

```bash
# Xem storage classes hiện có
kubectl get sc

# minikube: có sẵn "standard" storage class
# NAME      PROVISIONER   RECLAIMPOLICY   VOLUMEBINDINGMODE
# standard  docker.io/...  Delete         Immediate
```

Khi dùng cloud storage (như AWS EFS), cần tạo StorageClass riêng:

```yaml
kind: StorageClass
apiVersion: storage.k8s.io/v1
metadata:
  name: efs-sc
provisioner: efs.csi.aws.com   # CSI driver
```

---

## Tạo PVC

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: host-pvc               # Tên PVC (dùng trong Pod)
spec:
  volumeName: host-pv          # PV cụ thể muốn claim (optional)

  accessModes:
    - ReadWriteOnce             # Cách access (phải match với PV)

  storageClassName: standard   # Phải match với PV

  resources:
    requests:
      storage: 1Gi             # Lượng storage muốn request
```

### Apply PVC

```bash
kubectl apply -f host-pv.yaml    # Tạo PV trước
kubectl apply -f host-pvc.yaml   # Rồi mới tạo PVC
kubectl get pvc                  # Kiểm tra status
```

```text
NAME      STATUS  VOLUME   CAPACITY  ACCESS MODES  STORAGECLASS
host-pvc  Bound   host-pv  1Gi       RWO           standard
```

**Bound** = PVC đã được matched với PV thành công.

---

## Dùng PVC trong Pod (Deployment)

```yaml
spec:
  volumes:
    - name: my-volume
      persistentVolumeClaim:     # Type = PVC
        claimName: host-pvc      # Tên PVC đã tạo

  containers:
    - name: my-app
      image: my-image
      volumeMounts:
        - name: my-volume
          mountPath: /app/story   # Path trong container
```

---

## Toàn Bộ Flow — Master File

```yaml
# host-pv.yaml (hoặc gộp vào 1 file với ---)

apiVersion: v1
kind: PersistentVolume
metadata:
  name: host-pv
spec:
  capacity:
    storage: 1Gi
  volumeMode: Filesystem
  accessModes:
    - ReadWriteOnce
  storageClassName: standard
  hostPath:
    path: /data
    type: DirectoryOrCreate

---

apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: host-pvc
spec:
  volumeName: host-pv
  accessModes:
    - ReadWriteOnce
  storageClassName: standard
  resources:
    requests:
      storage: 1Gi

---

apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      volumes:
        - name: my-volume
          persistentVolumeClaim:
            claimName: host-pvc    # ← Dùng PVC

      containers:
        - name: my-app-container
          image: my-image
          volumeMounts:
            - name: my-volume
              mountPath: /app/story
```

---

## Normal Volumes vs Persistent Volumes

| | Normal Volume (emptyDir/hostPath) | PersistentVolume |
|---|---|---|
| **Định nghĩa** | Trong Pod spec | Standalone resource |
| **Lifetime** | Phụ thuộc Pod | Độc lập với Pod |
| **Pod independence** | Không | Có |
| **Node independence** | Không | Có (với cloud types) |
| **Reuse** | Chỉ trong 1 Pod | Nhiều Pods khác nhau |
| **Use case** | Temp data | Production data |

---

## Commands

```bash
# Quản lý PV
kubectl get pv
kubectl describe pv NAME
kubectl delete pv NAME

# Quản lý PVC
kubectl get pvc
kubectl describe pvc NAME
kubectl delete pvc NAME
```

---

## Chẩn đoán PVC kẹt ở `Pending`

Đây là sự cố lưu trữ phổ biến nhất trong Kubernetes, và nguyên nhân luôn nằm trong bốn khả năng.

```bash
kubectl describe pvc du-lieu-app | tail -12
```

```text
Events:
  Type     Reason              Age   From                Message
  ----     ------              ----  ----                -------
  Warning  ProvisioningFailed  30s   persistentvolume-controller
    storageclass.storage.k8s.io "fast-ssd" not found
```

| Thông báo | Nguyên nhân | Cách xử lý |
|---|---|---|
| `storageclass ... not found` | Tên StorageClass sai, hoặc cụm không có class đó | `kubectl get storageclass` xem tên đúng |
| `no persistent volumes available for this claim` | Không có PV nào khớp, và cụm **không có cấp phát động** | Tạo PV thủ công, hoặc cài CSI driver |
| Không có sự kiện nào cả | StorageClass dùng `volumeBindingMode: WaitForFirstConsumer` | **Bình thường** — PVC chờ tới khi có Pod dùng nó |
| `exceeded quota` | Namespace đã chạm hạn mức lưu trữ | Kiểm tra `kubectl describe resourcequota` |

Trường hợp thứ ba đáng nói vì nó **không phải lỗi**:

```bash
kubectl get storageclass gp3 -o jsonpath='{.volumeBindingMode}'
```

```text
WaitForFirstConsumer
```

```text
   Immediate            → tạo PV NGAY khi PVC được tạo
   WaitForFirstConsumer → CHỜ tới khi có Pod dùng PVC, rồi mới tạo PV
                          Ở ĐÚNG vùng sẵn sàng (AZ) mà Pod được xếp lên
```

Chế độ chờ tồn tại để tránh một lỗi rất khó chịu trên cloud: PV được tạo ở AZ `a`, nhưng scheduler lại xếp Pod lên node ở AZ `b` → Pod kẹt `Pending` vĩnh viễn với thông báo `volume node affinity conflict`.

### Ba chế độ truy cập — và hiểu nhầm phổ biến

| Chế độ | Nghĩa | Ai hỗ trợ |
|---|---|---|
| **`ReadWriteOnce` (RWO)** | Gắn được vào **một node** (nhiều Pod trên node đó vẫn dùng chung được) | Gần như mọi loại ổ đĩa khối: EBS, GCE PD, Azure Disk |
| `ReadOnlyMany` (ROX) | Nhiều node đọc, không ghi | NFS, EFS |
| `ReadWriteMany` (RWX) | **Nhiều node cùng đọc ghi** | **Chỉ hệ thống file chia sẻ**: EFS, NFS, CephFS. **EBS KHÔNG hỗ trợ** |

> **Hiểu nhầm phổ biến**: `ReadWriteOnce` không phải "một Pod duy nhất" mà là "**một node duy nhất**". Nhiều Pod trên cùng node vẫn gắn chung được. Nhưng nếu Deployment có 3 bản sao trải trên 3 node và dùng PVC `RWO`, thì **chỉ Pod ở node giữ ổ đĩa mới chạy được**, hai Pod kia kẹt `Pending`.
>
> Đây là lý do chạy Deployment nhiều bản sao với ổ đĩa dùng chung là **sai thiết kế**. Cần mỗi Pod một ổ đĩa riêng thì dùng **StatefulSet** với `volumeClaimTemplates` ([Phase 17 bài 1](../phase-17/01-statefulset.md)).

### `reclaimPolicy` — điều gì xảy ra khi xoá PVC

```bash
kubectl get pv -o custom-columns=NAME:.metadata.name,POLICY:.spec.persistentVolumeReclaimPolicy,STATUS:.status.phase
```

```text
NAME       POLICY   STATUS
pvc-a1b2   Delete   Bound
```

| Giá trị | Xoá PVC thì |
|---|---|
| **`Delete`** (mặc định của hầu hết StorageClass) | **Ổ đĩa thật bị xoá — MẤT DỮ LIỆU** |
| `Retain` | PV còn lại ở trạng thái `Released`; dữ liệu **vẫn nguyên**, nhưng phải xử lý tay mới dùng lại được |

> Với dữ liệu quan trọng, hãy tạo một StorageClass riêng đặt `reclaimPolicy: Retain`. Mặc định `Delete` nghĩa là **một lệnh `kubectl delete pvc` gõ nhầm là mất database**.

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng `ReadWriteOnce` cho Deployment nhiều bản sao trải nhiều node | Chỉ **một** Pod chạy được, các Pod khác kẹt `Pending` |
| Tưởng `RWO` là "một Pod" | Nó là "**một node**" |
| Để `reclaimPolicy: Delete` cho dữ liệu quan trọng | `kubectl delete pvc` là **mất ổ đĩa thật** |
| Tưởng PVC `Pending` luôn là lỗi | Với `WaitForFirstConsumer` thì đó là **hành vi đúng** |
| Xoá namespace chứa PVC | Xoá luôn PVC → xoá luôn ổ đĩa nếu policy là `Delete` |
| Muốn mở rộng dung lượng nhưng StorageClass không cho | Kiểm tra `allowVolumeExpansion: true` |
| Dùng PVC cho dữ liệu tạm | Tốn tiền ổ đĩa vô ích — `emptyDir` là đủ |
| Không đặt `storageClassName` | Dùng class mặc định của cụm, có thể không phải thứ bạn muốn |

---

## Tóm tắt bài 4

- **PVC là "đơn xin ổ đĩa"**, PV là ổ đĩa thật. Ứng dụng chỉ khai PVC; PV do quản trị viên hoặc **cấp phát động** lo.
- PVC kẹt `Pending` có **bốn nguyên nhân**: sai tên StorageClass, không có PV khớp, đang chờ Pod (`WaitForFirstConsumer` — **bình thường**), hoặc chạm hạn mức.
- **`WaitForFirstConsumer` tồn tại để tránh lỗi `volume node affinity conflict`** — PV bị tạo ở AZ khác với nơi Pod được xếp lên.
- **`ReadWriteOnce` nghĩa là "một NODE", không phải "một Pod".** Deployment nhiều bản sao trải nhiều node mà dùng PVC RWO thì chỉ một Pod chạy được. Cần mỗi Pod một ổ đĩa thì dùng **StatefulSet**.
- **`ReadWriteMany` chỉ có ở hệ thống file chia sẻ** (EFS, NFS). Ổ đĩa khối như EBS **không hỗ trợ**.
- **`reclaimPolicy` mặc định là `Delete`** — xoá PVC là **xoá ổ đĩa thật**. Dữ liệu quan trọng nên dùng StorageClass có `Retain`.

---

**Bài kế tiếp** → [Bài 5: Environment Variables & ConfigMaps](05-environment-variables-configmaps.md)

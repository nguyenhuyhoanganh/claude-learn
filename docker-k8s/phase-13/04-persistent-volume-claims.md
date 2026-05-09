# Bài 4: PersistentVolumeClaims — Kết Nối Pod với PV

## PVC là Gì?

```
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

```
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

**Tiếp theo:** Environment Variables & ConfigMaps →

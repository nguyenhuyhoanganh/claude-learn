# Tổng Kết Phase 13 — Volumes & Persistent Data trong Kubernetes

## Những Gì Đã Học

### 1. State và Volumes
```text
State = Data không được phép mất
  → User-generated data (accounts, files, orders)
  → Intermediate results (temp, cache)

Volumes = Giải pháp persist data
  → Gắn vào Pod, không phải container
  → Survive container restarts
  → Mất khi Pod bị xóa (với normal volumes)
```

### 2. Các Loại Volume

```text
emptyDir:
  → Folder rỗng tạo mới khi Pod start
  → Survive container restart
  → Mất khi Pod xóa
  → Không share giữa multiple pods

hostPath:
  → Bind mount từ Node
  → Data còn sau Pod restart
  → Node-specific (không cross-node)
  → Chỉ tốt cho development/single-node

CSI:
  → Container Storage Interface
  → Third-party drivers (AWS EFS, etc.)
  → Linh hoạt, extensible

PersistentVolume:
  → Standalone resource
  → Pod và Node independent
  → Production-ready
```

### 3. PV/PVC Pattern

```yaml
# 1. Admin tạo PV
kind: PersistentVolume
spec:
  capacity:
    storage: 1Gi
  accessModes: [ReadWriteOnce]
  storageClassName: standard
  hostPath:
    path: /data
    type: DirectoryOrCreate

# 2. Developer tạo PVC
kind: PersistentVolumeClaim
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: standard
  resources:
    requests:
      storage: 1Gi

# 3. Pod dùng PVC
spec:
  volumes:
    - name: my-vol
      persistentVolumeClaim:
        claimName: host-pvc
  containers:
    - volumeMounts:
        - name: my-vol
          mountPath: /app/data
```

### 4. Environment Variables

```yaml
# Direct value
env:
  - name: MY_VAR
    value: my-value

# From ConfigMap
env:
  - name: MY_VAR
    valueFrom:
      configMapKeyRef:
        name: my-configmap
        key: my-key
```

### 5. ConfigMap

```yaml
kind: ConfigMap
metadata:
  name: my-config
data:
  key1: value1
  key2: value2
```

---

## Cheat Sheet — Khi Nào Dùng Gì?

```text
Tạm thời, 1 Pod, không cần share:
  → emptyDir

Development, 1 Node, share giữa pods:
  → hostPath

Production, nhiều Nodes, data không được mất:
  → PersistentVolume + PVC + CSI driver (AWS EFS, v.v.)

Config data (non-sensitive):
  → ConfigMap + valueFrom.configMapKeyRef

Sensitive data (passwords, keys):
  → Secret + valueFrom.secretKeyRef
```

---

## Commands

```bash
# Storage Classes
kubectl get sc

# Persistent Volumes
kubectl get pv
kubectl describe pv NAME

# Persistent Volume Claims
kubectl get pvc
kubectl describe pvc NAME

# ConfigMaps
kubectl get configmap
kubectl describe configmap NAME
```

---

---

## Tự kiểm tra

**1. `emptyDir` mất khi nào?**

<details><summary>Đáp án</summary>

Chỉ mất khi **Pod** bị xoá. Container trong Pod crash rồi khởi động lại thì `emptyDir` **vẫn còn** — đó là lý do nó hợp cho bộ nhớ đệm cần sống sót qua lần crash. Chi tiết: [bài 2](02-emptydir-va-hostpath.md).
</details>

**2. Vì sao `hostPath` gần như luôn sai cho ứng dụng thường?**

<details><summary>Đáp án</summary>

Vì Pod có thể bị xếp lên **bất kỳ node nào**, và `hostPath` gắn dữ liệu vào **một node cụ thể**. Pod chuyển node là thấy thư mục rỗng — hoặc tệ hơn, thấy dữ liệu của Pod khác. Với Deployment nhiều bản sao thì mỗi Pod thấy một tập dữ liệu khác nhau. Nó chỉ đúng cho **DaemonSet đọc dữ liệu của chính node đó**.
</details>

**3. PVC kẹt `Pending` và `describe` không có sự kiện nào. Hỏng hay bình thường?**

<details><summary>Đáp án</summary>

Nhiều khả năng là **bình thường**. StorageClass dùng `volumeBindingMode: WaitForFirstConsumer` sẽ **chờ tới khi có Pod dùng PVC** rồi mới tạo ổ đĩa — ở đúng vùng sẵn sàng mà Pod được xếp lên. Cơ chế này tránh lỗi `volume node affinity conflict`. Chi tiết: [bài 4](04-persistent-volume-claims.md).
</details>

**4. Deployment 3 bản sao dùng chung một PVC `ReadWriteOnce`. Chuyện gì xảy ra?**

<details><summary>Đáp án</summary>

Chỉ **một** Pod chạy được — Pod nằm trên node đang giữ ổ đĩa. Hai Pod kia kẹt `Pending`. Vì `ReadWriteOnce` nghĩa là **một NODE**, không phải "một Pod". Cần mỗi Pod một ổ đĩa riêng thì dùng **StatefulSet** với `volumeClaimTemplates` ([Phase 17 bài 1](../phase-17/01-statefulset.md)).
</details>

**5. Bạn đổi ConfigMap. Pod đang chạy có nhận giá trị mới không?**

<details><summary>Đáp án</summary>

Tuỳ cách gắn. **Biến môi trường: không bao giờ** — biến được đặt một lần lúc tiến trình khởi động. **Volume: file đổi sau ~60 giây**, nhưng ứng dụng phải **tự đọc lại** — mà đa số chỉ đọc lúc khởi động. Chữa bằng `kubectl rollout restart`, checksum annotation, hoặc Reloader. Chi tiết: [bài 5](05-environment-variables-configmaps.md).
</details>

**6. `kubectl delete pvc` có xoá ổ đĩa thật không?**

<details><summary>Đáp án</summary>

**Có, nếu `reclaimPolicy: Delete`** — và đó là mặc định của hầu hết StorageClass. Không có hoàn tác. Dữ liệu quan trọng nên dùng StorageClass riêng đặt `Retain`.
</details>

---

**Phase kế tiếp** → [Bài 1: Services & Giao Tiếp Pod](../phase-14/01-services-va-pod-communication.md)

# Tổng Kết Phase 13 — Volumes & Persistent Data trong Kubernetes

## Những Gì Đã Học

### 1. State và Volumes
```
State = Data không được phép mất
  → User-generated data (accounts, files, orders)
  → Intermediate results (temp, cache)

Volumes = Giải pháp persist data
  → Gắn vào Pod, không phải container
  → Survive container restarts
  → Mất khi Pod bị xóa (với normal volumes)
```

### 2. Các Loại Volume

```
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

```
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

**Tiếp theo:** Phase 14 — Kubernetes Networking →

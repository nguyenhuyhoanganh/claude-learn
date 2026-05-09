# Bài 2: emptyDir và hostPath Volumes

## emptyDir — Volume Đơn Giản Nhất

### Cách Hoạt Động

```
Khi Pod start:
  → Kubernetes tạo một folder MỚI và RỖNG
  → Tất cả containers trong Pod có thể dùng folder này

Khi container restart:
  → Data trong folder vẫn CÒN (vì Pod chưa bị xóa)

Khi Pod bị xóa:
  → folder bị xóa theo
```

### YAML Config

```yaml
spec:
  volumes:
    - name: story-volume
      emptyDir: {}         # {} = dùng default config

  containers:
    - name: my-app
      image: my-image
      volumeMounts:
        - name: story-volume
          mountPath: /app/story   # Folder trong container
```

### Hạn Chế của emptyDir

```
Vấn đề với nhiều replicas:
  Pod 1 (replica 1)  →  emptyDir A (data của Pod 1)
  Pod 2 (replica 2)  →  emptyDir B (data của Pod 2)

  Request đến Pod 1 → lưu data vào A
  Request tiếp theo đến Pod 2 → KHÔNG thấy data của A!
  → Dữ liệu không được chia sẻ giữa các pods
```

---

## hostPath — Bind Mount vào Node

### Cách Hoạt Động

```
Node (máy vật lý/VM chạy Kubernetes):
  /data/                   ← hostPath trỏ vào đây
  └── my-story.txt

  Pod 1 → mountPath:/app/story → Node:/data/
  Pod 2 → mountPath:/app/story → Node:/data/

  → Cả 2 pods chia sẻ cùng 1 folder trên Node!
```

### YAML Config

```yaml
spec:
  volumes:
    - name: story-volume
      hostPath:
        path: /data                # Đường dẫn trên Node
        type: DirectoryOrCreate    # Tạo nếu chưa tồn tại

  containers:
    - name: my-app
      image: my-image
      volumeMounts:
        - name: story-volume
          mountPath: /app/story
```

### type Options cho hostPath

```
DirectoryOrCreate  → Tạo folder nếu chưa tồn tại
Directory          → Folder phải đã tồn tại
FileOrCreate       → Tạo file nếu chưa tồn tại
File               → File phải đã tồn tại
```

### Hạn Chế của hostPath

```
Multi-node cluster:
  Node 1 → /data/ (có data)
  Node 2 → /data/ (KHÔNG có data, hoặc data khác)

  Pod A → chạy trên Node 1 → đọc được data
  Pod B → chạy trên Node 2 → KHÔNG thấy data của Node 1!

  Kubernetes tự quyết định Pod chạy trên Node nào
  → Không đảm bảo pod luôn ở cùng 1 node
```

**hostPath chỉ tốt cho:**
- Development với minikube (1 node duy nhất)
- Chia sẻ dữ liệu giữa pods trên cùng 1 node
- Pre-existing data cần đưa vào container

---

## So Sánh emptyDir vs hostPath

| | emptyDir | hostPath |
|---|---|---|
| **Data khi Pod xóa** | Mất | Còn (ở Node) |
| **Multi-pod sharing** | Không (mỗi Pod riêng) | Có (cùng Node) |
| **Multi-node** | N/A | Không (node-specific) |
| **Production** | Không (chỉ temp data) | Không khuyến khích |
| **Use case** | Temp cache, single pod | Dev, single-node |

---

## Khi Nào Dùng?

```
emptyDir:
  ✓ Data tạm thời trong 1 Pod
  ✓ Chỉ cần survive container restarts (không phải pod restarts)
  ✓ Simple development, try-out

hostPath:
  ✓ Development với minikube
  ✓ Chia sẻ data giữa pods trên cùng node
  ✓ Inject existing data vào container
  ✗ Không dùng production multi-node cluster

→ Cho production: dùng Persistent Volumes!
```

---

**Tiếp theo:** CSI Volume Type và Persistent Volumes →

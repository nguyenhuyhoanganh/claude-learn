# Bài 1: Volumes trong Kubernetes — Lý Thuyết & So Sánh

## State và Data trong Ứng Dụng

**State** = Dữ liệu được tạo ra và sử dụng bởi app mà không được phép mất.

```
Loại 1: User-generated data
  → User accounts, orders, files người dùng upload
  → Thường lưu trong database hoặc file
  → PHẢI persist qua container restarts

Loại 2: Intermediate results (tạm thời)
  → Cache, session data, temp calculations
  → Có thể lưu in-memory hoặc temporary files
  → Cũng cần survive container restarts

→ Dù loại nào, đều cần VOLUMES!
```

---

## Tại Sao Cần Volume trong Kubernetes?

Với Docker đơn lẻ, ta dùng `-v` hoặc Docker Compose volumes. Nhưng với Kubernetes:

```
Ta không chạy "docker run" trực tiếp
→ Kubernetes tạo và quản lý containers
→ Ta cần cấu hình Kubernetes để gắn volumes vào containers

Thêm vào đó:
→ App chạy trên NHIỀU nodes
→ Nhiều pod replicas
→ Data cần được chia sẻ hoặc persist
```

---

## Kubernetes Volumes vs Docker Volumes

| Đặc điểm | Docker Volumes | Kubernetes Volumes |
|---|---|---|
| **Lifetime** | Tồn tại cho đến khi xóa thủ công | Gắn với Pod → mất khi Pod bị xóa |
| **Types** | Chỉ local machine | Nhiều loại: local, cloud, CSI... |
| **Scope** | 1 machine | Multi-node cluster |
| **Config** | docker run -v hoặc compose | YAML trong pod spec |
| **Persistence** | Luôn persist (cho đến khi rm) | Phụ thuộc vào type |

---

## Nguyên Tắc Cơ Bản

```
Volume gắn vào POD (không phải container):
  Pod
  ├── Container A → có thể dùng volume
  ├── Container B → có thể dùng cùng volume
  └── Volume ──────────────────────────┘

Ý nghĩa:
  ✓ Container restart → Data trong volume CÒN
  ✓ Container removed → Data trong volume CÒN
  ✗ Pod bị xóa → Volume bị xóa (với normal volumes)
  ✗ Pod được tạo mới → Volume mới (trống)
```

---

## Cấu Hình Volume trong YAML

Có 2 bước:
1. **Khai báo volume** ở cấp Pod (`.spec.volumes`)
2. **Mount vào container** (`.spec.containers[].volumeMounts`)

```yaml
spec:
  volumes:                          # 1. Khai báo volumes
    - name: my-data-volume
      emptyDir: {}                  # Loại volume

  containers:
    - name: my-app
      image: my-image
      volumeMounts:                 # 2. Mount vào container
        - name: my-data-volume      # Tên khớp với volumes bên trên
          mountPath: /app/data      # Đường dẫn trong container
```

---

## Các Loại Volume (Overview)

```
emptyDir:
  → Tạo folder rỗng khi Pod start
  → Xóa khi Pod bị xóa
  → Tốt cho: single-pod, temporary data

hostPath:
  → Bind mount từ Node (máy chủ)
  → Data tồn tại ngay cả khi Pod bị xóa
  → Vẫn node-specific (không share cross-node)
  → Tốt cho: development, single-node setup

CSI (Container Storage Interface):
  → Interface mở cho third-party storage drivers
  → AWS EFS, Azure Disk, v.v.
  → Rất linh hoạt

PersistentVolume (PV):
  → Standalone resource, độc lập với Pod và Node
  → Luôn persist dù Pod bị xóa
  → Cho production data
```

---

**Tiếp theo:** emptyDir và hostPath chi tiết →

# Bài 1: Volumes trong Kubernetes — Lý Thuyết & So Sánh

## State và Data trong Ứng Dụng

**State** = Dữ liệu được tạo ra và sử dụng bởi app mà không được phép mất.

```text
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

```text
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

```text
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

```text
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

## Volume của Kubernetes khác volume của Docker chỗ nào

Cùng tên gọi nhưng khác nhau ở một điểm cốt lõi, và không nắm điểm này thì mọi thứ về sau đều mơ hồ:

```text
   DOCKER VOLUME
   ═════════════
   Gắn với MỘT MÁY. Container chuyển sang máy khác → không thấy volume nữa.
   Nhưng Docker cũng không tự chuyển container sang máy khác, nên không sao.

   KUBERNETES VOLUME
   ═════════════════
   Pod CÓ THỂ bị xếp lên BẤT KỲ node nào trong cụm — và chuyện đó
   xảy ra thường xuyên (node chết, nâng cấp, cân bằng lại).

   → Volume gắn với MỘT máy (như hostPath) trở nên VÔ DỤNG
   → cần một lớp lưu trữ mà MỌI node đều truy cập được
```

Đây chính là lý do Kubernetes có tới ba tầng khái niệm (`Volume` → `PersistentVolume` → `PersistentVolumeClaim`) trong khi Docker chỉ có một. Sự phức tạp thêm vào không phải vô cớ — nó giải bài toán *"dữ liệu phải đi theo Pod, kể cả khi Pod nhảy sang máy khác"*.

### Ba câu hỏi để chọn đúng loại

```text
   1. Dữ liệu có cần sống sót khi POD bị xoá không?
        KHÔNG → emptyDir       (cache, file tạm, chia sẻ giữa container trong Pod)
        CÓ    → câu hỏi 2

   2. Dữ liệu có cần sống sót khi NODE chết không?
        KHÔNG → hostPath       (gần như chỉ dùng cho agent hệ thống)
        CÓ    → câu hỏi 3

   3. Nhiều Pod trên NHIỀU NODE có cần ghi cùng lúc không?
        KHÔNG → PVC với ReadWriteOnce  (EBS, GCE PD — phổ biến nhất)
        CÓ    → PVC với ReadWriteMany  (EFS, NFS — đắt và chậm hơn)
```

Câu hỏi thứ hai đáng lưu ý: **`hostPath` gần như không bao giờ đúng cho ứng dụng thường**. Nó gắn dữ liệu vào một node cụ thể, nên Pod chuyển node là mất dữ liệu — mà Pod chuyển node là chuyện Kubernetes làm thường xuyên. `hostPath` chỉ hợp lý cho DaemonSet cần đọc dữ liệu **của chính node đó** (log, chỉ số) — xem [Phase 17 bài 2](../phase-17/02-daemonset.md).

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng `hostPath` cho dữ liệu ứng dụng | Pod chuyển node là **mất dữ liệu**; và trên cụm nhiều node thì mỗi Pod thấy dữ liệu khác nhau |
| Tưởng `emptyDir` sống sót qua khởi động lại container | Nó sống sót khi **container** khởi động lại, nhưng mất khi **Pod** bị xoá |
| Dùng volume cho dữ liệu lẽ ra thuộc về database | Tự dựng lưu trữ phức tạp thay vì dùng dịch vụ quản lý sẵn |
| Chạy Deployment nhiều bản sao với một PVC `ReadWriteOnce` | Chỉ **một** Pod chạy được, số còn lại kẹt `Pending` |
| Không đặt giới hạn dung lượng cho `emptyDir` | Ứng dụng ghi tràn làm **đầy đĩa node**, ảnh hưởng mọi Pod khác |

Dòng cuối có cách chữa đơn giản mà ít người biết:

```yaml
volumes:
  - name: cache
    emptyDir:
      sizeLimit: 1Gi        # Pod bị đuổi nếu vượt quá
```

---

## Tóm tắt bài 1

- Khác biệt cốt lõi so với Docker: **Pod có thể bị xếp lên bất kỳ node nào**, nên volume gắn với một máy trở nên vô dụng. Đó là lý do Kubernetes có ba tầng khái niệm thay vì một.
- Ba câu hỏi để chọn: **sống sót qua Pod bị xoá?** → `emptyDir` hay không; **sống sót qua node chết?** → `hostPath` hay không; **nhiều node cùng ghi?** → `RWO` hay `RWX`.
- **`hostPath` gần như không bao giờ đúng cho ứng dụng thường** — chỉ hợp cho DaemonSet đọc dữ liệu của chính node đó.
- **`emptyDir` mất khi Pod bị xoá**, nhưng sống sót khi container trong Pod khởi động lại. Nên đặt **`sizeLimit`** để không làm đầy đĩa node.

---

**Bài kế tiếp** → [Bài 2: emptyDir và hostPath Volumes](02-emptydir-va-hostpath.md)

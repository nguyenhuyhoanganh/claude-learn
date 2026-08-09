# Bài 3: CSI Volume Type và Persistent Volumes

## CSI — Container Storage Interface

### Vấn Đề CSI Giải Quyết

Kubernetes có nhiều built-in volume types: `awsElasticBlockStore`, `azureDisk`, `azureFile`, `nfs`... Nhưng mỗi lần muốn hỗ trợ storage mới lại phải thêm code vào Kubernetes core.

**CSI = Giải pháp:**

```text
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

```text
Normal volumes (emptyDir, hostPath):
  → Được định nghĩa bên trong Pod spec
  → Phụ thuộc vào Pod lifecycle
  → Pod xóa → Volume mất (emptyDir)
  → Node-specific (hostPath)
  → Phải config lại cho mỗi Deployment YAML file
```

### PersistentVolume = Giải Pháp

```text
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

```text
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

```text
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

```text
NAME     CAPACITY  ACCESS MODES  STATUS  CLAIM        STORAGECLASS
host-pv  1Gi       RWO           Bound   default/pvc  standard
```

---

## Ba tầng lưu trữ — ai chịu trách nhiệm phần nào

Đây là chỗ gây bối rối nhất của lưu trữ Kubernetes: vì sao cần tới ba khái niệm cho một việc nghe đơn giản?

```text
   ┌──────────────────────────────────────────────────────────┐
   │  StorageClass                          AI LO: quản trị    │
   │  "loại ổ đĩa nào có sẵn ở cụm này"                        │
   │  gp3 (SSD thường) / io2 (SSD nhanh) / st1 (HDD rẻ)        │
   ├──────────────────────────────────────────────────────────┤
   │  PersistentVolume (PV)                 AI LO: hệ thống    │
   │  "một ổ đĩa THẬT, dung lượng cụ thể"                      │
   │  → thường được TẠO TỰ ĐỘNG từ StorageClass                │
   ├──────────────────────────────────────────────────────────┤
   │  PersistentVolumeClaim (PVC)           AI LO: lập trình viên│
   │  "tôi cần 20Gi, đọc ghi được"                             │
   │  → KHÔNG cần biết ổ đĩa đến từ đâu                        │
   └──────────────────────────────────────────────────────────┘
```

Lý do tách ba tầng: **người viết ứng dụng không nên phải biết cụm đang chạy trên AWS hay Azure hay máy chủ riêng.** Cùng một file PVC chạy được ở mọi nơi; chỉ `storageClassName` đổi.

```yaml
# File này giống hệt nhau ở AWS, GCP, on-premise
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 20Gi
  storageClassName: fast        # tên do đội hạ tầng quy ước
```

### Cấp phát tĩnh so với cấp phát động

```text
   TĨNH (cách cũ, giờ hiếm dùng)
   ═════════════════════════════
   Quản trị viên tạo SẴN 10 PV
        │
        ▼
   Lập trình viên tạo PVC → Kubernetes tìm PV nào KHỚP
        │
        ▼
   Không có PV nào khớp → PVC kẹt Pending vĩnh viễn
   Có PV 100Gi nhưng PVC xin 20Gi → vẫn gán, LÃNG PHÍ 80Gi


   ĐỘNG (mặc định ngày nay)
   ════════════════════════
   Lập trình viên tạo PVC
        │
        ▼
   StorageClass GỌI CSI driver → tạo ổ đĩa thật ĐÚNG 20Gi
        │
        ▼
   PV được tạo tự động và gán ngay
```

```bash
kubectl get storageclass
```

```text
NAME            PROVISIONER             RECLAIMPOLICY   VOLUMEBINDINGMODE
gp3 (default)   ebs.csi.aws.com         Delete          WaitForFirstConsumer
efs-sc          efs.csi.aws.com         Retain          Immediate
```

Chữ `(default)` nghĩa là PVC **không khai `storageClassName`** sẽ dùng class này.

### CSI là gì và vì sao nó quan trọng

**CSI** (Container Storage Interface) là **giao diện chuẩn** giữa Kubernetes và các hệ lưu trữ.

```text
   TRƯỚC CSI
   Mã hỗ trợ EBS, GCE PD, Azure Disk... nằm TRONG lõi Kubernetes
   → thêm loại lưu trữ mới = phải sửa và phát hành lại Kubernetes
   → nhà cung cấp lưu trữ phụ thuộc lịch phát hành của Kubernetes

   CÓ CSI
   Kubernetes chỉ nói chuyện qua một giao diện chuẩn
   → nhà cung cấp viết driver riêng, cài như một add-on
   → cập nhật driver không cần nâng cấp cụm
```

Hệ quả thực tế bạn sẽ gặp: trên EKS, **driver EBS CSI phải cài riêng** (nó không còn nằm trong lõi từ Kubernetes 1.23). Quên cài thì mọi PVC kẹt `Pending` với thông báo không có provisioner.

```bash
# Kiểm tra driver đã cài chưa
kubectl get csidrivers
```

```text
NAME              ATTACHREQUIRED   MODES        AGE
ebs.csi.aws.com   true             Persistent   45d
```

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Chưa cài CSI driver trên EKS | Mọi PVC kẹt `Pending`, không có sự kiện provisioning | `kubectl get csidrivers`; cài EBS CSI add-on |
| Tạo PV thủ công rồi thắc mắc sao lãng phí | PVC 20Gi gán vào PV 100Gi → mất 80Gi | Dùng **cấp phát động** |
| Quên `storageClassName` | Dùng class mặc định của cụm — có thể không phải thứ bạn muốn | Khai tường minh |
| Dùng `hostPath` PV trên cụm nhiều node | Pod chuyển node là không thấy dữ liệu | Dùng CSI driver thật |
| Tưởng xoá PVC là ổ đĩa còn nguyên | `reclaimPolicy: Delete` **xoá ổ đĩa thật** | StorageClass riêng với `Retain` cho dữ liệu quan trọng |
| Đặt `storageClassName: ""` (chuỗi rỗng) | **Tắt cấp phát động** — chỉ tìm PV tạo sẵn | Bỏ hẳn trường đó nếu muốn dùng class mặc định |
| Mong mở rộng dung lượng nhưng không được | StorageClass thiếu `allowVolumeExpansion: true` | Kiểm tra trước khi chọn class |

---

## Tóm tắt bài 3

- Ba tầng chia trách nhiệm rõ ràng: **StorageClass** (quản trị định nghĩa loại ổ đĩa), **PV** (ổ đĩa thật, thường tạo tự động), **PVC** (lập trình viên xin dung lượng).
- Lý do tách: **người viết ứng dụng không cần biết cụm chạy trên AWS hay Azure**. Cùng một PVC chạy được mọi nơi.
- **Cấp phát động là mặc định ngày nay** — tạo ổ đĩa đúng dung lượng xin. Cấp phát tĩnh gây lãng phí vì PVC 20Gi vẫn gán được vào PV 100Gi.
- **CSI** là giao diện chuẩn cho phép nhà cung cấp viết driver riêng mà không cần sửa lõi Kubernetes.
- Trên EKS, **driver EBS CSI phải cài riêng** từ Kubernetes 1.23 — quên là mọi PVC kẹt `Pending`.
- **`storageClassName: ""` khác với bỏ trống trường đó**: chuỗi rỗng **tắt cấp phát động**.

---

**Bài kế tiếp** → [Bài 4: PersistentVolumeClaims — Kết Nối Pod với PV](04-persistent-volume-claims.md)

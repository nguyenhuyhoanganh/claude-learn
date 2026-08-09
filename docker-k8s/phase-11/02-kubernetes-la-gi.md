# Bài 2: Kubernetes Là Gì?

## Định Nghĩa Chính Thức

> "Kubernetes is an open-source system for automating deployment, scaling, and management of containerized applications."
> — kubernetes.io

Nhưng quan trọng hơn là **hiểu thực sự** nó làm gì.

---

## Kubernetes = Docker Compose cho Multi-Machine

```text
Docker Compose:
  - Quản lý nhiều containers trên 1 máy (local)
  - Viết docker-compose.yml → docker compose up
  - Tự động networking giữa containers
  - Chủ yếu cho development

Kubernetes:
  - Quản lý nhiều containers trên NHIỀU máy (cloud)
  - Viết kubernetes config → kubectl apply
  - Tự động distribute containers trên nhiều servers
  - Thiết kế cho production deployment
  + Thêm: auto-restart, auto-scaling, load balancing
```

---

## Kubernetes Giải Quyết Vendor Lock-in

### Vấn đề với AWS ECS

```text
Học ECS → Biết dùng ECS trên AWS
Chuyển sang Azure → Phải học lại từ đầu
Chuyển sang Google Cloud → Lại học từ đầu

Config cho ECS:
  Clusters, Tasks, Services, Fargate
  → Không portable

Config cho Azure ACI:
  Container Groups, Azure CLI...
  → Khác hoàn toàn
```

### Kubernetes: Chuẩn Thống Nhất

```text
Học Kubernetes → Dùng được ở mọi nơi!

Kubernetes config (YAML):
  Deployments, Pods, Services
  → Hoạt động với AWS EKS, Azure AKS, Google GKE
  → Hoạt động với bất kỳ máy nào cài Kubernetes
```

**Ví dụ Kubernetes config:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  replicas: 3        # Chạy 3 instances
  selector:
    matchLabels:
      app: my-app
  template:
    spec:
      containers:
        - name: my-app
          image: my-image:latest
```

Config này chạy được trên AWS, Azure, GCP, hoặc bất kỳ cluster nào.

---

## Kubernetes là gì và KHÔNG phải gì

| Kubernetes LÀ | Kubernetes KHÔNG PHẢI |
|---|---|
| Open-source project (miễn phí) | Cloud service provider |
| Cloud-agnostic standard | Alternative cho AWS/Azure |
| Container orchestration system | Chỉ hoạt động với 1 provider |
| Collection of concepts + tools | Phần mềm duy nhất |
| Hoạt động với Docker containers | Thay thế cho Docker |

---

## Kubernetes Làm Gì?

```text
Bạn viết:  "Tôi muốn 3 instances của app X luôn chạy"
           "Nếu traffic cao, scale lên 10 instances"
           "Nếu container crash, tự restart"

Kubernetes thực hiện:
  → Tạo và quản lý containers/pods
  → Distribute chúng trên các machines
  → Monitor health, restart nếu cần
  → Scale up/down tự động
  → Load balance traffic
```

## Kubernetes KHÔNG Làm Gì?

```text
Kubernetes KHÔNG:
  → Tạo remote servers/machines cho bạn
  → Cài Docker trên các servers
  → Setup network infrastructure
  → Quản lý cloud resources (EC2, VPC, v.v.)

→ BẠN phải setup cluster trước
→ Kubernetes sau đó sẽ SỬ DỤNG cluster đó
```

---

## Vòng lặp điều hoà — cơ chế duy nhất cần hiểu

Nếu chỉ được nhớ một điều về cách Kubernetes hoạt động, hãy nhớ điều này. Mọi thứ khác đều là hệ quả.

```text
   Bạn KHÔNG ra lệnh "hãy tạo 3 Pod".
   Bạn KHAI BÁO "tôi muốn luôn có 3 Pod".

   Rồi Kubernetes chạy MÃI MÃI vòng lặp này:

   ┌─────────────────────────────────────────────┐
   │  1. Trạng thái MONG MUỐN là gì?  (3 Pod)    │
   │  2. Trạng thái THỰC TẾ là gì?    (2 Pod)    │
   │  3. Khác nhau → LÀM GÌ ĐÓ để thu hẹp        │
   │  4. Quay lại bước 1                          │
   └─────────────────────────────────────────────┘
        lặp lại vài giây một lần, không bao giờ dừng
```

Đây gọi là **vòng lặp điều hoà** (reconciliation loop), và nó giải thích những hành vi ban đầu trông rất lạ:

| Hiện tượng | Vì sao |
|---|---|
| Xoá Pod xong nó **tự hiện lại** | Trạng thái mong muốn vẫn là 3. Vòng lặp thấy còn 2 → tạo bù |
| Sửa Pod bằng tay xong bị **ghi đè lại** | Deployment vẫn giữ bản mô tả gốc và liên tục đưa thực tế về khớp |
| Node chết, Pod **tự xuất hiện ở máy khác** | Vòng lặp không quan tâm Pod ở đâu, chỉ quan tâm **có đủ 3 cái không** |
| Sửa YAML là đủ, **không cần lệnh "áp dụng thay đổi"** riêng | Đổi trạng thái mong muốn là vòng lặp tự lo phần còn lại |

Muốn thật sự xoá một Pod thì phải đổi **trạng thái mong muốn**:

```bash
kubectl delete pod myapp-x7k2p        # ✗ Pod mới hiện lại ngay
kubectl scale deployment myapp --replicas=0    # ✓ đổi ý muốn thành 0
kubectl delete deployment myapp                # ✓ hoặc xoá hẳn bản mô tả
```

> **Cách nhớ**: Kubernetes không phải công cụ nhận lệnh. Nó là **một hệ thống theo đuổi mục tiêu**. Bạn nói mục tiêu, nó lo cách đạt tới — kể cả khi bạn đang ngủ và một máy chủ vừa cháy.

Hệ quả cho cách làm việc: **đừng dùng `kubectl` để sửa trực tiếp ở production**. Mọi thay đổi nên đi qua file YAML trong Git, vì file đó mới là "ý muốn" thật sự.

---

## Bẫy thường gặp

| Bẫy | Sự thật |
|---|---|
| "Kubernetes thay thế Docker" | Kubernetes **điều phối** container; Docker **tạo ra** chúng. Từ Kubernetes 1.24, nó dùng **containerd** để chạy container — nhưng image bạn build bằng Docker vẫn chạy bình thường vì cùng chuẩn OCI |
| Xoá Pod để "gỡ" ứng dụng | Pod tự hiện lại. Phải xoá **Deployment** |
| Sửa Pod bằng `kubectl edit` | Bị ghi đè ở vòng lặp tiếp theo. Sửa Deployment |
| Nghĩ Kubernetes tự dựng cụm cho mình | **Không** — nó dùng cụm đã có. Dựng cụm là việc riêng (hoặc dùng EKS/GKE/AKS) |
| Nghĩ Kubernetes làm ứng dụng nhanh hơn | Nó làm ứng dụng **tự phục hồi và mở rộng được**. Còn thêm một lớp mạng nên thường chậm hơn chút |
| Trộn sửa tay với file YAML | Lần `apply` sau ghi đè thay đổi tay, thường vào lúc bất ngờ nhất |

---

## Tóm tắt bài 2

- Kubernetes là **hệ điều phối container trên nhiều máy** — thứ Docker Compose không làm được vì Compose chỉ chạy trên một máy.
- Cơ chế duy nhất cần hiểu là **vòng lặp điều hoà**: bạn khai báo **trạng thái mong muốn**, Kubernetes liên tục so với **thực tế** rồi thu hẹp khoảng cách.
- Vòng lặp đó giải thích mọi hành vi ban đầu trông lạ: xoá Pod thì nó hiện lại, sửa tay thì bị ghi đè, node chết thì Pod xuất hiện ở máy khác.
- Muốn xoá thật thì phải **đổi trạng thái mong muốn** (`scale --replicas=0` hoặc xoá Deployment), không phải xoá Pod.
- **Kubernetes không dựng cụm cho bạn** — nó dùng cụm đã có sẵn.
- Hệ quả cho cách làm việc: **file YAML trong Git là "ý muốn" thật sự**, đừng sửa trực tiếp bằng `kubectl` ở production.

---

**Bài kế tiếp** → [Bài 3: Kiến Trúc Kubernetes](03-kien-truc-kubernetes.md)

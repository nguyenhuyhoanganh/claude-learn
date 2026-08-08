# Bài 4: Thuật Ngữ Quan Trọng & Tổng Kết Phase 11

## Bảng Thuật Ngữ Kubernetes

| Thuật Ngữ | Định Nghĩa | Tương Đương |
|---|---|---|
| **Cluster** | Toàn bộ hệ thống: Master + Worker Nodes | Toàn bộ infrastructure |
| **Node** | 1 máy (physical hoặc virtual) trong cluster | EC2 instance |
| **Master Node** | Node chứa Control Plane, điều khiển cluster | Bộ não |
| **Worker Node** | Node chạy Pods và containers | Máy thực sự chạy app |
| **Pod** | Unit nhỏ nhất: chứa 1+ containers | `docker run` |
| **Container** | Docker container bên trong Pod | Container thông thường |
| **kubelet** | Agent trên Worker Node, nhận lệnh từ Master | Nhân viên |
| **kube-proxy** | Network manager trên Worker Node | Router |
| **API Server** | Gateway của Master Node | Manager |
| **Scheduler** | Quyết định Pod chạy ở Node nào | Dispatcher |
| **Service** | Nhóm Pods với IP cố định, expose ra ngoài | Load Balancer/DNS |

---

## Tóm Tắt Sơ Đồ

```text
Người dùng
  │
  ▼
kubectl (CLI tool)
  │
  ▼
Master Node (API Server)
  │
  ├──▶ Worker Node 1
  │      └── Pod (Container)
  │      └── Pod (Container)
  │
  └──▶ Worker Node 2
         └── Pod (Container)
         └── Pod (Container)
```

---

## Tại Sao Học Kubernetes?

```text
1. Auto-restart khi container crash
   → Không cần monitor 24/7

2. Auto-scaling
   → Tự thêm/bớt containers theo traffic

3. Load Balancing
   → Phân phối traffic đều giữa containers

4. Cloud-agnostic
   → 1 config file → AWS, Azure, GCP, anywhere

5. Industry standard
   → Kỹ năng có giá trị cao
   → Hầu hết big tech dùng Kubernetes
```

---

## Sáu hiểu nhầm phổ biến trước khi bắt đầu học

Nắm trước những điều này sẽ tránh được rất nhiều bối rối ở các phase sau.

| Hiểu nhầm | Sự thật |
|---|---|
| "Kubernetes thay thế Docker" | Kubernetes **điều phối** container; Docker **tạo ra** chúng. Thực ra từ Kubernetes 1.24, Kubernetes dùng **containerd** để chạy container, không dùng Docker Engine — nhưng image Docker bạn build vẫn chạy bình thường vì cùng chuẩn OCI |
| "Học Kubernetes là học một công cụ" | Nó là **một hệ thống phân tán** với hàng chục thành phần. Kỳ vọng đúng: mất vài tuần chứ không phải vài giờ |
| "Kubernetes làm hệ thống nhanh hơn" | **Không.** Nó làm hệ thống **tự phục hồi và mở rộng được**. Còn thêm một lớp mạng, thường chậm hơn một chút |
| "Có Kubernetes là hết lo vận hành" | Nó **chuyển** gánh nặng chứ không xoá: từ "quản lý máy chủ" sang "quản lý cụm Kubernetes" |
| "Kubernetes hợp với mọi dự án" | Với một dịch vụ trên một máy chủ, Kubernetes **đắt hơn giá trị nó mang lại**. Ngưỡng hợp lý thường là **nhiều dịch vụ, nhiều máy, nhiều đội** |
| "Pod = container" | Pod có thể chứa **nhiều container** dùng chung mạng và ổ đĩa. Đơn vị nhỏ nhất Kubernetes quản là **Pod**, không phải container |

### Khi nào KHÔNG nên dùng Kubernetes

Phần này ít tài liệu nói, nhưng nó tiết kiệm được rất nhiều thời gian:

```text
   Một ứng dụng, một máy chủ, ít traffic
        → docker compose trên một VM là đủ. Kubernetes là quá mức.

   Đội dưới 5 người, chưa có ai từng vận hành hệ phân tán
        → chi phí học và vận hành lớn hơn lợi ích

   Ứng dụng chạy theo lịch, vài lần một ngày
        → dịch vụ serverless (Lambda, Cloud Run) rẻ và đơn giản hơn nhiều

   Cần đưa sản phẩm ra thị trường thật nhanh
        → dùng nền tảng quản lý sẵn (Cloud Run, App Runner, Render, Fly.io)
          rồi chuyển sang Kubernetes khi thật sự cần
```

Ngưỡng thường thấy trong thực tế: Kubernetes bắt đầu **đáng công** khi bạn có **từ 5–10 dịch vụ trở lên**, nhiều môi trường (dev/staging/production), và một đội đủ người để có người chịu trách nhiệm hạ tầng.

---

## Tổng Kết Phase 11

Bạn đã học:

1. **Vấn đề manual deployment**: Container crashes, scaling, load balancing đều khó làm thủ công
2. **Tại sao Kubernetes**: Cloud-agnostic, giải quyết vendor lock-in của ECS/managed services
3. **Kubernetes là gì**: Open-source container orchestration, như Docker Compose cho nhiều machines
4. **Kubernetes KHÔNG LÀ**: Không phải cloud provider, không phải thay thế Docker, không miễn phí infrastructure
5. **Kiến trúc**: Cluster → Master Node (Control Plane) → Worker Nodes → Pods → Containers
6. **Master Node components**: API Server, Scheduler, Controller Manager, Cloud Controller Manager
7. **Worker Node components**: Pods, Docker, kubelet, kube-proxy
8. **Phân công trách nhiệm**: Bạn setup cluster; Kubernetes manage Pods

---

**Phase kế tiếp** → [Bài 1: Setup Kubernetes Local — kubectl & Minikube](../phase-12/01-setup-kubectl-minikube.md)

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

```
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

```
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

**Tiếp theo:** Phase 12 — Kubernetes trong thực tế: Deployments, Services, kubectl →

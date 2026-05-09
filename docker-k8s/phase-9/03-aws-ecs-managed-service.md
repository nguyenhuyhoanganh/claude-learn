# Bài 3: AWS ECS — Managed Container Service

## ECS là gì?

**ECS (Elastic Container Service)** = Dịch vụ AWS quản lý containers thay bạn.

```
DIY (EC2):
  Bạn → SSH → Install Docker → docker run
  Bạn chịu trách nhiệm mọi thứ

ECS (Managed):
  Bạn → Cấu hình ECS → AWS lo toàn bộ
  AWS chịu trách nhiệm server, OS, Docker
```

---

## 4 Khái Niệm Cốt Lõi trong ECS

```
┌─────────────────────────────────────────────────┐
│                  CLUSTER                        │
│  (Mạng tổng thể, grouping của containers)       │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │              SERVICE                     │   │
│  │  (Quản lý execution của tasks)           │   │
│  │                                          │   │
│  │  ┌────────────────────────────────────┐  │   │
│  │  │              TASK                  │  │   │
│  │  │  (Blueprint: 1 hoặc nhiều containers│  │   │
│  │  │   chạy trên 1 virtual machine)     │  │   │
│  │  │                                    │  │   │
│  │  │  ┌─────────────┐ ┌─────────────┐  │  │   │
│  │  │  │  CONTAINER  │ │  CONTAINER  │  │  │   │
│  │  │  │  (config of │ │  (config of │  │  │   │
│  │  │  │  docker run)│ │  docker run)│  │  │   │
│  │  │  └─────────────┘ └─────────────┘  │  │   │
│  │  └────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Giải thích từng tầng

| Khái niệm | Tương đương | Vai trò |
|---|---|---|
| **Container** | `docker run` settings | Cấu hình 1 container |
| **Task** | 1 EC2 instance + docker run | Blueprint chạy containers |
| **Service** | Process manager | Quản lý task lifecycle |
| **Cluster** | Network/VPC | Nhóm các services lại |

---

## Fargate — Serverless Containers

ECS dùng **Fargate** để chạy containers:

```
Truyền thống (EC2):
  → AWS tạo EC2 instance
  → Instance chạy 24/7
  → Bạn trả tiền cho cả thời gian idle

Fargate (Serverless):
  → AWS không tạo EC2 instance
  → Khi có request → start container
  → Xử lý xong → stop container
  → Chỉ trả tiền khi container đang thực sự chạy
  → Tự động scale
```

---

## Workflow Tạo ECS Deployment

### Bước 1: Tạo Cluster

```
ECS → Create Cluster
→ Networking only (Fargate)
→ Cluster name: goals-app
→ Check "Create VPC"
→ Create
```

### Bước 2: Tạo Task Definition

```
Task Definitions → Create new Task Definition
→ Launch type: FARGATE
→ Task definition name: goals
→ Task role: ecsTaskExecutionRole
→ Memory: 0.5GB (tối thiểu cho demo)
→ CPU: 0.25 vCPU (tối thiểu cho demo)
```

### Bước 3: Thêm Container vào Task

```
Container Definitions → Add container
→ Container name: node-demo
→ Image: YOUR_USERNAME/node-example-1
→ Port mappings: 80 (container port)
→ Environment variables (nếu cần)
→ Logging: Auto-configure CloudWatch
→ Update
```

### Bước 4: Tạo Service

```
Cluster → Services → Create
→ Launch type: FARGATE
→ Task definition: goals:1
→ Service name: goals-service
→ Number of tasks: 1
→ (Load Balancer: None cho demo đơn giản)
→ Create Service
```

### Bước 5: Tìm Public IP

```
Cluster → Tasks → Click Task ID
→ Tìm Public IP
→ Truy cập trên browser
```

---

## Cấu hình Container = Cấu hình `docker run`

Mọi thứ trong ECS Container Definition đều tương đương với `docker run` flags:

| ECS Setting | docker run equivalent |
|---|---|
| Image | `docker run <image>` |
| Port Mappings | `-p 80:80` |
| Environment | `--env KEY=VALUE` |
| Entry Point | `--entrypoint` |
| Working Directory | `--workdir` |
| Mount Points | `-v` |
| Memory Limit | `--memory` |

---

## Update Image trong ECS

```
1. Sửa code local + rebuild image:
   docker build -t YOUR_USERNAME/your-image .
   docker push YOUR_USERNAME/your-image

2. Trên AWS ECS:
   Task Definitions → [your task] → Create new revision
   (Giữ nguyên tất cả settings → Create)

3. Update service:
   [Task revision] → Actions → Update Service
   → Skip to review → Update Service

4. ECS tự động pull image mới và restart container
```

**Lưu ý:** Mỗi lần tạo task revision mới, AWS gán Public IP mới. Dùng Load Balancer để có stable domain (xem Bài 4).

---

## Ưu Điểm của ECS vs EC2

```
ECS (Managed):
  ✓ Không cần cài Docker thủ công
  ✓ AWS lo OS updates
  ✓ AWS lo security patching
  ✓ Tự động scale với Fargate
  ✓ Pay-per-use với Fargate
  ✓ Chỉ cần cấu hình containers
  ✓ Không cần kỹ năng sysadmin

Nhược điểm:
  ✗ Phải học AWS-specific concepts
  ✗ Phải follow AWS rules
  ✗ Ít control hơn EC2
  ✗ Vendor lock-in
  ✗ Một số services có thể tốn tiền
```

---

**Tiếp theo:** Multi-Container trong ECS — Localhost, EFS, và MongoDB Atlas →

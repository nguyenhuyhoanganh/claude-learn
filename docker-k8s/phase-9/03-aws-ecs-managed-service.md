# Bài 3: AWS ECS — Managed Container Service

## ECS là gì?

**ECS (Elastic Container Service)** = Dịch vụ AWS quản lý containers thay bạn.

```text
DIY (EC2):
  Bạn → SSH → Install Docker → docker run
  Bạn chịu trách nhiệm mọi thứ

ECS (Managed):
  Bạn → Cấu hình ECS → AWS lo toàn bộ
  AWS chịu trách nhiệm server, OS, Docker
```

---

## 4 Khái Niệm Cốt Lõi trong ECS

```text
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

```text
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

```text
ECS → Create Cluster
→ Networking only (Fargate)
→ Cluster name: goals-app
→ Check "Create VPC"
→ Create
```

### Bước 2: Tạo Task Definition

```text
Task Definitions → Create new Task Definition
→ Launch type: FARGATE
→ Task definition name: goals
→ Task role: ecsTaskExecutionRole
→ Memory: 0.5GB (tối thiểu cho demo)
→ CPU: 0.25 vCPU (tối thiểu cho demo)
```

### Bước 3: Thêm Container vào Task

```text
Container Definitions → Add container
→ Container name: node-demo
→ Image: YOUR_USERNAME/node-example-1
→ Port mappings: 80 (container port)
→ Environment variables (nếu cần)
→ Logging: Auto-configure CloudWatch
→ Update
```

### Bước 4: Tạo Service

```text
Cluster → Services → Create
→ Launch type: FARGATE
→ Task definition: goals:1
→ Service name: goals-service
→ Number of tasks: 1
→ (Load Balancer: None cho demo đơn giản)
→ Create Service
```

### Bước 5: Tìm Public IP

```text
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

```text
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

```text
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

## Bốn khái niệm ECS ánh xạ sang Kubernetes như thế nào

Nếu sau này bạn học Kubernetes (từ phase-11), bảng này giúp chuyển đổi mô hình tư duy mà không phải học lại từ đầu:

| ECS | Kubernetes tương đương | Khác biệt cần lưu ý |
|---|---|---|
| **Cluster** | Cluster | Giống nhau về vai trò |
| **Task Definition** | **Pod template** (trong Deployment) | Đều là "bản mô tả cách chạy container" |
| **Task** | **Pod** | Một lần chạy thật của bản mô tả |
| **Service** | **Deployment + Service** | ECS gộp hai việc; Kubernetes tách ra |
| Target Group | Endpoints | Danh sách đích thật đang khoẻ |

Điểm khác biệt quan trọng nhất về hành vi: **trong một ECS Task, các container gọi nhau qua `localhost`** — giống hệt các container trong một Pod Kubernetes. Đây là lý do bài sau nhấn mạnh "không dùng tên container trong ECS".

Nói cách khác, **Task của ECS chính là Pod của Kubernetes**. Nắm được điều này thì phần lớn kiến thức ECS chuyển thẳng sang Kubernetes.

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Dùng tên container để gọi nhau trong Task | Không phân giải được | Trong cùng Task dùng **`localhost`** |
| Quên gán IAM role cho Task | Container không gọi được S3/Secrets Manager | Task Role khác Task Execution Role — xem dưới |
| Nhầm **Task Role** với **Task Execution Role** | Kéo image thất bại, hoặc ứng dụng không gọi được AWS | **Execution Role** để ECS kéo image và ghi log; **Task Role** cho **ứng dụng của bạn** gọi AWS |
| Cập nhật image nhưng giữ nguyên tag | Task mới vẫn chạy image cũ | Tạo **revision mới** của Task Definition, hoặc ép deploy lại |
| Không đặt `awslogs` | Không có log để đọc khi container chết | Cấu hình log driver `awslogs` ngay từ đầu |
| Task dừng ngay không rõ lý do | `Essential container in task exited` | Xem `stoppedReason` trong Console, và log CloudWatch |
| Quên xoá Service khi dọn | Service tự tạo lại Task → **vẫn tính tiền** | Đặt desired count về 0, xoá Service, rồi xoá Cluster |

Dòng thứ ba là chỗ nhầm phổ biến nhất và đáng làm rõ:

```text
   TASK EXECUTION ROLE   → ECS DÙNG để chuẩn bị task
                           kéo image từ ECR, ghi log lên CloudWatch,
                           đọc secret để truyền vào biến môi trường

   TASK ROLE             → ỨNG DỤNG CỦA BẠN dùng lúc chạy
                           gọi S3, DynamoDB, SQS, Secrets Manager

   Thiếu Execution Role → task không khởi động được (kéo image lỗi)
   Thiếu Task Role      → task chạy nhưng ứng dụng nhận AccessDenied
```

Triệu chứng khác nhau rõ ràng, nên nhớ được cặp này thì chẩn đoán rất nhanh.

---

## Tóm tắt bài 3

- ECS là dịch vụ điều phối container **quản lý sẵn của AWS** — bạn không phải dựng control plane.
- Bốn khái niệm: **Cluster** (nhóm tài nguyên), **Task Definition** (bản mô tả), **Task** (một lần chạy thật), **Service** (giữ đúng số Task và nối vào Load Balancer).
- **Task của ECS ≈ Pod của Kubernetes**: container trong cùng Task gọi nhau qua **`localhost`**, không dùng tên container.
- **Fargate** bỏ luôn việc quản lý máy chủ — trả tiền theo CPU/RAM mà task dùng.
- Phân biệt hai IAM role: **Execution Role** (ECS dùng để kéo image, ghi log) và **Task Role** (ứng dụng dùng để gọi AWS). Thiếu cái đầu thì task **không khởi động**; thiếu cái sau thì task chạy nhưng nhận **AccessDenied**.
- Cập nhật image phải tạo **revision mới** của Task Definition — giữ nguyên tag không đủ.
- Dọn dẹp theo thứ tự: **desired count về 0 → xoá Service → xoá Cluster**, nếu không Service sẽ tự tạo lại Task.

---

**Bài kế tiếp** → [Bài 4: Multi-Container trong ECS — Localhost, EFS, và MongoDB Atlas](04-multi-container-ecs.md)

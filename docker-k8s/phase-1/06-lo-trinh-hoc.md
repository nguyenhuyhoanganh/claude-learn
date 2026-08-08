# Bài 6: Lộ Trình Học Docker & Kubernetes

## Bức tranh tổng thể

Khóa học này chia làm 3 phần lớn:

```text
Phần 1: Docker Foundation (Section 2-7)
    ├── Images & Containers
    ├── Volumes & Data Management
    └── Networking

Phần 2: Docker Thực chiến (Section 8-10)
    ├── Multi-Container Projects
    ├── Docker Compose
    ├── Utility Containers
    └── Deployment lên AWS

Phần 3: Kubernetes (Section 11-15)
    ├── Kubernetes Basics
    ├── Volumes trong Kubernetes
    ├── Networking trong Kubernetes
    └── Deployment với Kubernetes (AWS EKS)
```

---

## Chi tiết từng phase học

### Phase 1 — Getting Started (bài này)
**Bạn sẽ học:**
- Docker là gì và tại sao cần
- Container vs Virtual Machine
- Cài đặt Docker
- Hệ sinh thái công cụ Docker
- Chạy container đầu tiên

---

### Phase 2 — Images & Containers (Section 2)

Đây là nền tảng quan trọng nhất. Bạn sẽ học sâu về:
- **Layered filesystem**: Docker images được xây dựng theo lớp (layer) — hiểu cách hoạt động giúp bạn tối ưu build time
- **Image caching**: Docker cache từng layer, chỉ rebuild những layer thay đổi
- **Interactive containers**: Chạy container với terminal interactive
- **Container lifecycle**: Running, Stopped, Removed
- **Dockerfile best practices**: Thứ tự instructions, COPY vs ADD, CMD vs ENTRYPOINT

---

### Phase 3 — Data & Volumes (Section 3)

Containers là ephemeral (tạm thời) — khi container bị xóa, data bên trong mất. Volumes giải quyết vấn đề này:
- **Named Volumes**: Docker quản lý, data persist dù container bị xóa
- **Bind Mounts**: Map thư mục từ host vào container (dùng cho development)
- **Read-only mounts**: Bảo vệ data
- **tmpfs mounts**: Lưu trong memory, không persist

---

### Phase 4 — Networking (Section 4)

Containers communicate với nhau như thế nào:
- **Container → Internet**: Hoạt động ngay (outgoing requests)
- **Container → Host machine**: Dùng special hostname
- **Container → Container**: Docker Networks
- **Bridge, Host, None networks**

---

### Phase 5 — Multi-Container Apps (Section 5)

Ứng dụng thực tế thường gồm nhiều service:
- Frontend (React/Vue)
- Backend API (Node.js/Python)
- Database (MongoDB/PostgreSQL)
- Cache (Redis)

Học cách chạy và kết nối tất cả với nhau.

---

### Phase 6 — Docker Compose (Section 6)

**Docker Compose** là bước nhảy vọt về productivity:
- Định nghĩa toàn bộ stack trong 1 file `docker-compose.yml`
- `docker-compose up` để start tất cả
- `docker-compose down` để stop và cleanup
- Quản lý dependencies giữa services

---

### Phase 7 — Utility Containers & Lệnh nâng cao (Section 7)

- **Utility containers**: Container không chạy app, chỉ cung cấp tool
  - Ví dụ: Chạy `npm init` trong container Node.js mà không cài Node.js trên máy
- `docker exec`: Chạy lệnh trong container đang chạy
- `ENTRYPOINT` vs `CMD`

---

### Phase 8 — Laravel & PHP Project phức tạp (Section 8)

Áp dụng thực tế với Laravel/PHP:
- PHP-FPM container
- Nginx container
- MySQL container
- Composer (dependency manager) container

---

### Phase 9 — Deployment Docker Containers (Section 9)

Deploy lên cloud:
- **AWS EC2**: Deploy Docker container trên single VM
- **AWS ECS**: Managed container service của AWS
- Automated deployment pipelines

---

### Phase 10 — Docker Summary (Section 10)

Ôn tập toàn bộ Docker — sẵn sàng cho Kubernetes.

---

### Phase 11 — Getting Started with Kubernetes (Section 11)

Giới thiệu Kubernetes:
- Tại sao cần Kubernetes sau khi đã có Docker?
- Kubernetes architecture: Control Plane, Worker Nodes, Pods
- `kubectl` — CLI cho Kubernetes
- minikube — Kubernetes local development

---

### Phase 12 — Kubernetes Core Concepts (Section 12)

- **Pods**: Đơn vị nhỏ nhất trong Kubernetes
- **Deployments**: Quản lý Pods, rolling updates
- **Services**: Expose Pods ra ngoài

---

### Phase 13 — Kubernetes Data & Volumes (Section 13)

Data persistence trong Kubernetes:
- **PersistentVolume (PV)**: Storage resource
- **PersistentVolumeClaim (PVC)**: Request storage
- **StorageClasses**

---

### Phase 14 — Kubernetes Networking (Section 14)

- Services: ClusterIP, NodePort, LoadBalancer
- Ingress: HTTP routing
- Service discovery trong cluster

---

### Phase 15 — Kubernetes Deployment (AWS EKS) (Section 15)

Deploy Kubernetes cluster trên AWS:
- **EKS (Elastic Kubernetes Service)**: Managed Kubernetes trên AWS
- Deployment configurations
- Production best practices

---

### Phase 16 — Tổng kết khoá học (Section 16)

Nhìn lại toàn bộ chặng đường và định hướng học tiếp.

### Phase 17 — Workload đầy đủ (bổ sung ngoài transcript)

**StatefulSet, DaemonSet, Job, CronJob** — ba loại workload mà Phase 12 chưa chạm tới. Cần khi bạn phải chạy database trong cụm, chạy agent trên mọi node, hoặc chạy tác vụ theo lịch.

### Phase 18 — Tài nguyên và autoscaling (bổ sung)

`requests`/`limits`, lớp QoS, vì sao Pod bị **OOMKilled**, ba loại probe, và tự động scale (HPA, Cluster Autoscaler). Đây là phần quyết định hệ thống có sống nổi ở production không.

### Phase 19 — Bảo mật (bổ sung)

Quét lỗ hổng image, chạy non-root, distroless, RBAC, Secret, NetworkPolicy. Sáu tầng phòng thủ.

### Phase 20 — Quan sát và gỡ lỗi (bổ sung)

Log, Event, `kubectl debug`, chỉ số giám sát, và **sổ tay chẩn đoán** tra từ triệu chứng ra nguyên nhân.

> **Lưu ý**: bốn phase 17–20 không có trong transcript gốc. Chúng được bổ sung vì đó là những thứ bạn **chắc chắn cần** khi đưa hệ thống lên production, mà khoá gốc dừng lại ở mức triển khai được lên EKS.

---

## Nên đọc theo thứ tự nào

Không phải ai cũng cần đọc tuần tự từ đầu tới cuối.

| Bạn đang ở đâu | Đọc |
|---|---|
| Mới hoàn toàn | Phase 1 → 10 (Docker), rồi 11 → 16 (Kubernetes) |
| Đã dùng Docker, chưa dùng Kubernetes | Lướt phase 1–10, học kỹ từ phase 11 |
| Đã dùng cả hai ở mức cơ bản, sắp lên production | **Phase 18 → 19 → 20**, rồi quay lại 17 khi cần |
| Đang có sự cố cần tra ngay | [Phase 20 bài 3](../phase-20/03-chi-so-giam-sat-va-so-tay.md) — sổ tay chẩn đoán |
| Chuẩn bị phỏng vấn | Phase 2 (image/layer), phase 12 (core concept), phase 14 (networking), phase 18 (tài nguyên) |

---

## Lời khuyên học hiệu quả

### 1. Code along — Làm theo cùng
Đừng chỉ xem passively. Mỗi lệnh Docker, mỗi Dockerfile — hãy tự gõ và chạy thử.

### 2. Thử trước khi xem đáp án
Khi bắt đầu một bài học mới, thử tự làm trước rồi mới xem giải thích.

### 3. Hiểu "tại sao" trước "làm thế nào"
Docker giải quyết vấn đề gì? Tại sao cần Volumes? Tại sao cần Kubernetes? Hiểu "tại sao" giúp nhớ lâu hơn.

### 4. Ôn lại sections cũ
Sau khi học section mới, dành 10 phút xem lại section trước. Connections giữa các concept rất quan trọng.

### 5. Google và Docker docs
- **docs.docker.com**: Reference chính thức đầy đủ nhất
- **hub.docker.com**: Xem documentation của các official images
- **Stackoverflow**: Hỏi khi bị stuck

---

## Prereqs và Không phải prereqs

### CẦN biết:
- Terminal/command line cơ bản (cd, ls, mkdir...)
- Một ngôn ngữ lập trình bất kỳ (để hiểu các ví dụ)

### KHÔNG CẦN biết trước:
- Node.js, Python hay bất kỳ ngôn ngữ cụ thể nào (chỉ cần đọc hiểu cơ bản)
- Cloud (AWS, GCP, Azure) — sẽ học trong khóa
- Kubernetes — sẽ học từ đầu

---

## Mindset khi học DevOps/Infrastructure

Khác với học lập trình, học Docker/Kubernetes đòi hỏi:
- **Tư duy hệ thống**: Hiểu cả hệ thống, không chỉ từng component
- **Chấp nhận lỗi**: Lỗi là bình thường, đọc error message cẩn thận
- **Thực hành nhiều**: Không có gì thay thế được việc tự tay chạy commands

---

**Bắt đầu học thực chất từ Phase 2:** Images & Containers — nền tảng của mọi thứ →

**Phase kế tiếp** → [Bài 1: Images & Containers — Nền tảng cốt lõi](../phase-2/01-images-va-containers-concepts.md)

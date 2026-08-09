# Docker K8S

> Container và điều phối container — từ `docker run` tới cụm Kubernetes production.

91 bài đi từ kiến thức nền cho người chưa biết gì, qua Docker cơ bản (image, layer, volume, network, Compose) sang Kubernetes (pod, workload, service, ingress, config, storage, RBAC) và các chủ đề vận hành thật: workload đầy đủ (StatefulSet, DaemonSet, Job/CronJob), giới hạn tài nguyên và autoscaling, bảo mật image và cụm, quan sát hệ thống và sổ tay chẩn đoán sự cố.

**91 bài** trong 21 phần.

## Mục lục

### Phase 0 — nền tảng cho người mới hoàn toàn

> Dành cho người **chưa biết gì**. Giải nghĩa các khái niệm mà mọi tài liệu Docker đều giả định bạn đã biết. Đã quen backend/DevOps thì bỏ qua được.

| Bài | Nội dung |
|---|---|
| [01](phase-0/01-kien-thuc-nen-truoc-khi-hoc-docker.md) | Bài 0.1: Kiến thức nền trước khi học Docker — tiến trình, cổng, đường dẫn, biến môi trường, nhân, YAML |
| [02](phase-0/02-tu-dien-thuat-ngu-docker.md) | Bài 0.2: Từ điển thuật ngữ Docker cho người mới |
| [03](phase-0/03-tu-dien-thuat-ngu-kubernetes.md) | Bài 0.3: Từ điển thuật ngữ Kubernetes cho người mới |

### Phase 1

| Bài | Nội dung |
|---|---|
| [01](phase-1/01-docker-la-gi-va-tai-sao-can.md) | Bài 1: Docker là gì và tại sao cần dùng? |
| [02](phase-1/02-containers-vs-virtual-machines.md) | Bài 2: Containers vs Virtual Machines |
| [03](phase-1/03-cai-dat-docker.md) | Bài 3: Cài đặt Docker |
| [04](phase-1/04-he-sinh-thai-cong-cu-docker.md) | Bài 4: Hệ sinh thái công cụ Docker |
| [05](phase-1/05-container-dau-tien.md) | Bài 5: Chạy Container Đầu Tiên |
| [06](phase-1/06-lo-trinh-hoc.md) | Bài 6: Lộ Trình Học Docker & Kubernetes |

### Phase 2

| Bài | Nội dung |
|---|---|
| [01](phase-2/01-images-va-containers-concepts.md) | Bài 1: Images & Containers — Nền tảng cốt lõi |
| [02](phase-2/02-image-layers-va-caching.md) | Bài 2: Image Layers & Caching |
| [03](phase-2/03-quan-ly-containers.md) | Bài 3: Quản lý Containers |
| [04](phase-2/04-naming-tagging-va-chia-se-images.md) | Bài 4: Đặt tên, Tag và Chia sẻ Images |
| [05](phase-2/05-dockerfile-best-practices.md) | Bài 5: Dockerfile Best Practices & Patterns |

### Phase 3

| Bài | Nội dung |
|---|---|
| [01](phase-3/01-data-trong-docker.md) | Bài 1: Data trong Docker — Ba loại và vấn đề cần giải quyết |
| [02](phase-3/02-volumes-anonymous-va-named.md) | Bài 2: Volumes — Anonymous và Named |
| [03](phase-3/03-bind-mounts-va-dev-workflow.md) | Bài 3: Bind Mounts & Development Workflow |
| [04](phase-3/04-env-variables-va-build-args.md) | Bài 4: Environment Variables & Build Arguments |
| [05](phase-3/05-volumes-tong-ket-va-patterns.md) | Bài 5: Tổng kết Volumes & Storage Patterns |

### Phase 4

| Bài | Nội dung |
|---|---|
| [01](phase-4/01-ba-loai-giao-tiep-trong-docker.md) | Bài 1: Ba loại giao tiếp trong Dockerized App |
| [02](phase-4/02-docker-networks.md) | Bài 2: Docker Networks — Kết nối Containers với nhau |

### Phase 5

| Bài | Nội dung |
|---|---|
| [01](phase-5/01-ung-dung-3-tier-voi-docker.md) | Bài 1: Ứng Dụng 3-Tier với Docker |
| [02](phase-5/02-dockerize-tung-service.md) | Bài 2: Dockerize Từng Service |
| [03](phase-5/03-ket-noi-containers-voi-networks.md) | Bài 3: Kết nối Containers với Docker Networks |
| [04](phase-5/04-persistence-va-hot-reload.md) | Bài 4: Data Persistence và Hot-Reload |
| [05](phase-5/05-tong-ket-multi-container.md) | Bài 5: Tổng kết Multi-Container Applications |

### Phase 6

| Bài | Nội dung |
|---|---|
| [01](phase-6/01-docker-compose-la-gi.md) | Bài 1: Docker Compose là gì và Tại sao Cần? |
| [02](phase-6/02-cau-truc-docker-compose-yml.md) | Bài 2: Cấu trúc File docker-compose.yml |
| [03](phase-6/03-cau-hinh-services-chi-tiet.md) | Bài 3: Cấu hình Services Chi tiết |
| [04](phase-6/04-docker-compose-up-va-down.md) | Bài 4: docker-compose up và down |
| [05](phase-6/05-tong-ket-docker-compose.md) | Bài 5: Tổng kết Docker Compose |

### Phase 7

| Bài | Nội dung |
|---|---|
| [01](phase-7/01-utility-containers-la-gi.md) | Bài 1: Utility Containers là gì và Tại sao Cần? |
| [02](phase-7/02-chay-lenh-trong-containers.md) | Bài 2: Các Cách Chạy Lệnh trong Containers |
| [03](phase-7/03-entrypoint-va-bind-mounts.md) | Bài 3: ENTRYPOINT và Bind Mounts |
| [04](phase-7/04-utility-containers-voi-compose.md) | Bài 4: Utility Containers với Docker Compose |

### Phase 8

| Bài | Nội dung |
|---|---|
| [01](phase-8/01-setup-muc-tieu-laravel-php.md) | Bài 1: Setup Mục tiêu — Laravel & PHP Project |
| [02](phase-8/02-application-containers.md) | Bài 2: Application Containers — Nginx, PHP, MySQL |
| [03](phase-8/03-utility-containers.md) | Bài 3: Utility Containers — Composer, Artisan, NPM |
| [04](phase-8/04-chay-services-co-chon-loc.md) | Bài 4: Chạy Services Có Chọn lọc |
| [05](phase-8/05-copy-vs-bind-mount-production.md) | Bài 5: COPY vs Bind Mounts — Development & Production |

### Phase 9

| Bài | Nội dung |
|---|---|
| [01](phase-9/01-tu-development-den-production.md) | Bài 1: Từ Development đến Production |
| [02](phase-9/02-deploy-voi-ec2.md) | Bài 2: Deploy với EC2 — DIY Approach |
| [03](phase-9/03-aws-ecs-managed-service.md) | Bài 3: AWS ECS — Managed Container Service |
| [04](phase-9/04-multi-container-ecs.md) | Bài 4: Multi-Container trong ECS — Localhost, EFS, và MongoDB Atlas |
| [05](phase-9/05-multi-stage-builds.md) | Bài 5: Multi-Stage Builds — React Production Deployment |
| [06](phase-9/06-tong-ket-deployment.md) | Bài 6: Tổng Kết — Docker Deployment |

### Phase 10

| Bài | Nội dung |
|---|---|
| [01](phase-10/01-tong-ket-toan-khoa.md) | Tổng Kết: Docker & Containers — Toàn Bộ Khóa Học |

### Phase 11

| Bài | Nội dung |
|---|---|
| [01](phase-11/01-van-de-voi-deployment-thu-cong.md) | Bài 1: Vấn Đề với Manual Deployment |
| [02](phase-11/02-kubernetes-la-gi.md) | Bài 2: Kubernetes Là Gì? |
| [03](phase-11/03-kien-truc-kubernetes.md) | Bài 3: Kiến Trúc Kubernetes |
| [04](phase-11/04-thuat-ngu-va-tong-ket.md) | Bài 4: Thuật Ngữ Quan Trọng & Tổng Kết Phase 11 |

### Phase 12

| Bài | Nội dung |
|---|---|
| [01](phase-12/01-setup-kubectl-minikube.md) | Bài 1: Setup Kubernetes Local — kubectl & Minikube |
| [02](phase-12/02-kubernetes-objects.md) | Bài 2: Kubernetes Objects — Pod, Deployment, Service |
| [03](phase-12/03-imperative-approach.md) | Bài 3: Imperative Approach — kubectl Commands |
| [04](phase-12/04-declarative-approach.md) | Bài 4: Declarative Approach — YAML Config Files |
| [05](phase-12/05-configuration-advanced.md) | Bài 5: Cấu Hình Nâng Cao — Liveness Probes & Image Pull Policy |
| [06](phase-12/06-tong-ket.md) | Tổng Kết Phase 12 — Kubernetes Core Concepts |

### Phase 13

| Bài | Nội dung |
|---|---|
| [01](phase-13/01-volumes-trong-kubernetes.md) | Bài 1: Volumes trong Kubernetes — Lý Thuyết & So Sánh |
| [02](phase-13/02-emptydir-va-hostpath.md) | Bài 2: emptyDir và hostPath Volumes |
| [03](phase-13/03-csi-va-persistent-volumes.md) | Bài 3: CSI Volume Type và Persistent Volumes |
| [04](phase-13/04-persistent-volume-claims.md) | Bài 4: PersistentVolumeClaims — Kết Nối Pod với PV |
| [05](phase-13/05-environment-variables-configmaps.md) | Bài 5: Environment Variables & ConfigMaps |
| [06](phase-13/06-tong-ket.md) | Tổng Kết Phase 13 — Volumes & Persistent Data trong Kubernetes |

### Phase 14

| Bài | Nội dung |
|---|---|
| [01](phase-14/01-services-va-pod-communication.md) | Bài 1: Services & Giao Tiếp Pod |
| [02](phase-14/02-pod-internal-communication.md) | Bài 2: Giao Tiếp Bên Trong Pod (Pod-internal) |
| [03](phase-14/03-pod-to-pod-communication.md) | Bài 3: Giao Tiếp Giữa Các Pods (Pod-to-Pod) |
| [04](phase-14/04-dns-va-env-vars.md) | Bài 4: CoreDNS và Auto-generated Environment Variables |
| [05](phase-14/05-frontend-va-reverse-proxy.md) | Bài 5: Frontend & Reverse Proxy trong Kubernetes |
| [06](phase-14/06-tong-ket.md) | Tổng Kết Phase 14 — Kubernetes Networking |

### Phase 15

| Bài | Nội dung |
|---|---|
| [01](phase-15/01-eks-vs-ecs.md) | Bài 1: AWS EKS vs AWS ECS — Chọn Gì? |
| [02](phase-15/02-tao-cluster-eks.md) | Bài 2: Tạo EKS Cluster Từng Bước |
| [03](phase-15/03-node-groups.md) | Bài 3: Thêm Worker Nodes (Node Groups) |
| [04](phase-15/04-deploy-kubernetes-config.md) | Bài 4: Deploy Kubernetes Config lên EKS |
| [05](phase-15/05-efs-volumes-tren-eks.md) | Bài 5: EFS Volumes trên AWS EKS |
| [06](phase-15/06-tong-ket.md) | Tổng Kết Phase 15 — Kubernetes trên AWS EKS |

### Phase 16

| Bài | Nội dung |
|---|---|
| [01](phase-16/01-tong-ket-khoa-hoc.md) | Phase 16 — Tổng Kết Khóa Học Docker & Kubernetes |

### Phase 17 — workload đầy đủ

| Bài | Nội dung |
|---|---|
| [01](phase-17/01-statefulset.md) | Bài 1: StatefulSet — khi Pod không thể thay thế lẫn nhau |
| [02](phase-17/02-daemonset.md) | Bài 2: DaemonSet — chạy đúng một Pod trên mỗi node |
| [03](phase-17/03-job-va-cronjob.md) | Bài 3: Job và CronJob — công việc có điểm kết thúc |
| [04](phase-17/04-chon-workload-va-tong-ket.md) | Bài 4: Chọn workload nào — bảng quyết định và tổng kết |

### Phase 18 — tài nguyên và autoscaling

| Bài | Nội dung |
|---|---|
| [01](phase-18/01-requests-limits-va-qos.md) | Bài 1: Requests, Limits và QoS — vì sao Pod bị OOMKilled |
| [02](phase-18/02-probes-va-bay-liveness.md) | Bài 2: Ba loại probe — và vì sao livenessProbe nguy hiểm |
| [03](phase-18/03-hpa-tu-dong-scale.md) | Bài 3: HorizontalPodAutoscaler — tự động scale theo tải |
| [04](phase-18/04-cluster-autoscaler-va-tong-ket.md) | Bài 4: Cluster Autoscaler, VPA và tổng kết |

### Phase 19 — bảo mật

| Bài | Nội dung |
|---|---|
| [01](phase-19/01-bao-mat-image.md) | Bài 1: Bảo mật image — quét lỗ hổng, non-root, distroless |
| [02](phase-19/02-rbac-va-serviceaccount.md) | Bài 2: RBAC và ServiceAccount — ai được làm gì trong cụm |
| [03](phase-19/03-secret-that-su-an-toan.md) | Bài 3: Secret không hề bí mật — mã hoá, xoay vòng, quản lý bên ngoài |
| [04](phase-19/04-networkpolicy-va-tong-ket.md) | Bài 4: NetworkPolicy và Pod Security — tổng kết |

### Phase 20 — quan sát và gỡ lỗi

| Bài | Nội dung |
|---|---|
| [01](phase-20/01-log-va-event.md) | Bài 1: Log và Event — hai nguồn thông tin đầu tiên khi có sự cố |
| [02](phase-20/02-bo-cong-cu-go-loi.md) | Bài 2: Bộ công cụ gỡ lỗi — kubectl debug và các trạng thái hỏng |
| [03](phase-20/03-chi-so-giam-sat-va-so-tay.md) | Bài 3: Chỉ số, giám sát và sổ tay chẩn đoán |

## Nên bắt đầu từ đâu

| Bạn đang ở tình huống | Đọc từ |
|---|---|
| Chưa từng dùng Docker | bắt đầu từ phase đầu, làm theo từng lệnh |
| Đã dùng Docker, chuyển sang K8s | nhảy tới phase Kubernetes |
| Chuẩn bị đưa hệ thống lên production | phase-18 (tài nguyên), phase-19 (bảo mật), phase-20 (quan sát) |
| Pod bị OOMKilled hoặc chạy chậm bất thường | phase-18 bài 1 |
| Cần chạy database hoặc Kafka trong cụm | phase-17 bài 1 (StatefulSet) |
| Đang có sự cố, cần tra nhanh | phase-20 bài 3 — sổ tay chẩn đoán |

---

*Mục lục này sinh từ cấu trúc thư mục và tiêu đề thật của từng bài. Thêm bài mới thì cập nhật lại bảng tương ứng.*

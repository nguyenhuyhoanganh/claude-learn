# Bài 1: AWS EKS vs AWS ECS — Chọn Gì?

## Recap: Các Lựa Chọn Deploy Kubernetes

```text
Option 1: DIY (tự làm tất cả)
  → Tạo EC2 instances thủ công
  → SSH vào từng máy, cài Kubernetes software
  → Tự setup network, load balancers
  → Khó, tốn thời gian, dễ sai

Option 2: Dùng tool hỗ trợ (Kops)
  → Tool giúp tạo và quản lý cluster AWS resources
  → Vẫn nhiều bước cần config

Option 3: Managed Service (EKS) ← Chúng ta dùng
  → AWS tạo cluster, install K8s software tự động
  → Bạn chỉ cần config, không lo infrastructure
  → Tốn ít thời gian nhất
```

---

## EKS vs ECS — Sự Khác Biệt Quan Trọng

| | AWS ECS | AWS EKS |
|---|---|---|
| **Tên đầy đủ** | Elastic Container Service | Elastic Kubernetes Service |
| **Kubernetes?** | Không biết về Kubernetes | Được build cho Kubernetes |
| **Config format** | ECS-specific (Task, Service, Cluster) | Standard Kubernetes YAML |
| **Vendor lock-in** | Cao (chỉ dùng được trên AWS) | Thấp (config dùng được ở đâu cũng được) |
| **Learning curve** | Học lại từ đầu nếu đổi provider | Kiến thức K8s áp dụng ở mọi nơi |
| **Dùng khi** | Chỉ cần deploy containers, không cần K8s | Muốn dùng Kubernetes trên AWS |

```text
ECS: AWS-specific container service
  → Không cần biết Kubernetes
  → Concepts riêng: Task Definition, Task, Service, Cluster (ECS)
  → Dù có tên giống nhau, KHÁC HOÀN TOÀN với K8s

EKS: Kubernetes trên AWS
  → Dùng đúng YAML files bạn đã viết với minikube
  → kubectl apply -f deployment.yaml → hoạt động y chang
  → Không cần thay đổi config khi migrate
```

---

## Tại Sao Dùng EKS?

```text
Học Kubernetes rồi → Apply ngay trên EKS
  → Không cần học lại ECS-specific concepts
  → Config files portable (dùng được Azure AKS, GKE...)
  → kubectl commands y chang như với minikube

EKS = minikube nhưng thật sự trên cloud
  → Nhiều nodes thật
  → External IP thật (không cần minikube service)
  → Load balancer thật từ AWS
```

---

## Chi Phí EKS

```text
⚠ EKS không miễn phí!
  → EKS cluster: ~$0.10/giờ (~$73/tháng)
  → EC2 instances (worker nodes): tùy loại
  → Load Balancers, data transfer, EFS storage: thêm phí

→ Luôn xóa cluster sau khi test xong!
  → kubectl delete ... + xóa node group + xóa cluster trên AWS Console
```

---

## Ba lựa chọn, không phải hai

Bài này so sánh EKS với ECS, nhưng thực tế có ba nhóm lựa chọn — và nhóm thứ ba thường bị bỏ qua:

| | ECS | EKS | Nền tảng đơn giản (App Runner, Cloud Run, Render, Fly.io) |
|---|---|---|---|
| Độ phức tạp | Trung bình | **Cao** | **Thấp nhất** |
| Khoá nhà cung cấp | **Cao** (chỉ AWS) | Thấp (chuẩn Kubernetes) | Cao |
| Chi phí cố định | 0 | **~72 USD/tháng** cho control plane | 0 |
| Cần người chuyên trách | Không | **Có** | Không |
| Kỹ năng dùng lại được ở nơi khác | Ít | **Nhiều** | Ít |
| Hợp với | Đã ở sâu trong AWS | Nhiều dịch vụ, nhiều đội, cần chuẩn chung | **Ít dịch vụ, đội nhỏ, cần ra sản phẩm nhanh** |

Cột cuối đáng cân nhắc nghiêm túc: nếu bạn có 2–3 dịch vụ và một đội bốn người, một nền tảng quản lý sẵn cho bạn triển khai được trong một buổi chiều, còn EKS thì mất vài tuần để dựng cho tử tế (mạng, RBAC, giám sát, sao lưu, quy trình nâng cấp).

Cách chuyển đổi hợp lý: **bắt đầu đơn giản, chuyển sang Kubernetes khi đã có lý do cụ thể** — chứ không phải vì nó là thứ đang thịnh hành.

### Cảnh báo chi phí — thứ dễ gây bất ngờ nhất

```text
   Control plane EKS:  0,10 USD/giờ  ≈  72 USD/THÁNG
                       → tính tiền NGAY CẢ KHI KHÔNG CÓ POD NÀO CHẠY
                       → tính tiền cả khi bạn đã ngủ

   Worker node (2× t3.medium):        ≈  60 USD/tháng
   NAT Gateway (nếu node ở subnet riêng): ≈ 32 USD/tháng + phí dữ liệu
   Application Load Balancer:         ≈  16 USD/tháng
   EBS volume, EFS, truyền dữ liệu:   thêm nữa
   ─────────────────────────────────────────────────
   Một cụm học tập bỏ quên một tháng: dễ vượt 180 USD
```

Hai điều nên làm ngay khi học:

```bash
# 1. Đặt cảnh báo ngân sách TRƯỚC khi tạo cụm
#    AWS Console → Billing → Budgets → tạo budget 20 USD, cảnh báo qua email

# 2. Xoá SẠCH khi học xong — theo đúng thứ tự này
kubectl delete svc --all          # xoá Load Balancer TRƯỚC (nếu không nó ở lại và vẫn tính tiền)
eksctl delete cluster --name ten-cum --wait
```

> **Bẫy tốn tiền phổ biến nhất**: xoá cụm mà quên xoá Service kiểu `LoadBalancer`. Load Balancer do AWS tạo **không bị xoá theo cụm** — nó ở lại và tính tiền âm thầm hàng tháng. Luôn `kubectl delete svc --all` trước.

---

## Tóm tắt bài 1

- **ECS** đơn giản hơn nhưng khoá chặt vào AWS. **EKS** là Kubernetes chuẩn, chạy được ở đâu cũng vậy, nhưng phức tạp và tốn kém hơn nhiều.
- Còn một **nhóm lựa chọn thứ ba** hay bị bỏ qua: nền tảng quản lý sẵn (App Runner, Cloud Run, Render, Fly.io) — hợp với đội nhỏ, ít dịch vụ, cần ra sản phẩm nhanh.
- Cách tiếp cận hợp lý: **bắt đầu đơn giản, chuyển sang Kubernetes khi có lý do cụ thể**, không phải vì nó đang thịnh hành.
- **Control plane EKS tính 72 USD/tháng kể cả khi không chạy Pod nào.** Cộng node, NAT Gateway và Load Balancer thì một cụm học tập bỏ quên dễ vượt 180 USD/tháng.
- **Đặt cảnh báo ngân sách TRƯỚC khi tạo cụm**, và khi xoá thì **`kubectl delete svc --all` trước** — Load Balancer không bị xoá theo cụm và sẽ tính tiền âm thầm.

---

**Bài kế tiếp** → [Bài 2: Tạo EKS Cluster Từng Bước](02-tao-cluster-eks.md)

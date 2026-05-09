# Bài 1: AWS EKS vs AWS ECS — Chọn Gì?

## Recap: Các Lựa Chọn Deploy Kubernetes

```
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

```
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

```
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

```
⚠ EKS không miễn phí!
  → EKS cluster: ~$0.10/giờ (~$73/tháng)
  → EC2 instances (worker nodes): tùy loại
  → Load Balancers, data transfer, EFS storage: thêm phí

→ Luôn xóa cluster sau khi test xong!
  → kubectl delete ... + xóa node group + xóa cluster trên AWS Console
```

---

**Tiếp theo:** Tạo EKS Cluster bước-bước →

# Bài 3: Thêm Worker Nodes (Node Groups)

## Tại Sao Cần Node Group?

```
EKS Cluster vừa tạo:
  → Chỉ có "bộ não" (Control Plane / Master Node)
  → Chưa có máy thực sự chạy containers

Node Group:
  → Tập hợp các EC2 instances = Worker Nodes
  → Kubernetes sẽ tự phân phối Pods vào các nodes này
  → EKS tự động cài K8s software trên từng node
```

---

## Bước 1: Tạo IAM Role cho Worker Nodes

Worker nodes (EC2 instances) cũng cần quyền để:
- Pull images từ ECR (Amazon Container Registry)
- Ghi logs
- Connect với cluster network

```
AWS Console → IAM → Roles → Create role

1. Select: AWS service
2. Use case: EC2 (common use cases)
3. Attach policies (tìm và chọn 3 cái này):
   ✓ AmazonEKSWorkerNodePolicy
   ✓ AmazonEKS_CNI_Policy        (CNI = Container Network Interface)
   ✓ AmazonEC2ContainerRegistryReadOnly

4. Role name: EKSNodeGroupRole
5. Create role
```

---

## Bước 2: Tạo Node Group

```
AWS Console → EKS → Cluster → Compute tab
→ Add node group

1. Name: demo-dep-nodes (tùy chọn)
2. Node IAM role: EKSNodeGroupRole (vừa tạo)
3. Click Next
```

### Config EC2 Instance Type

```
AMI type: Amazon Linux 2 (default)
Instance type: t3.small (MINIMUM!)
  ⚠ KHÔNG dùng t3.micro — quá nhỏ, pods sẽ bị pending
  → t3.small: 2 vCPU, 2GB RAM → đủ cho demo
  → t3.medium: nếu cần chạy nhiều pods hơn

Disk size: 20GB (default)
```

### Scaling Config

```
Minimum: 1 node
Maximum: 3 nodes  
Desired: 2 nodes   ← 2 nodes thật, phân tán Pods tự động
```

### Remote Access

```
→ Disable (không cần SSH vào nodes)
→ EKS quản lý nodes, ta không cần SSH trực tiếp
```

```
Click Next → Next → Create
```

**Đợi Node Group tạo xong (~3-5 phút)**

---

## Kiểm Tra

```bash
# Verify nodes đã sẵn sàng
kubectl get nodes
# NAME                         STATUS  AGE
# ip-xxx-xxx-xxx.compute.intr  Ready   2m
# ip-yyy-yyy-yyy.compute.intr  Ready   2m

# Xem EC2 instances trong AWS Console
# EC2 → Instances → thấy 2 instances đang chạy
```

---

## Hiểu Pods vs Nodes

```
Nodes (EC2 instances):
  → Máy thật (physical/virtual computers)
  → Được config trong Node Group
  → 2 nodes = 2 EC2 instances

Pods:
  → Containers chạy trên nodes
  → Kubernetes tự quyết pod nào chạy trên node nào
  → replicas: 3 = 3 pods, phân phối trên 2 nodes

Scale nodes ≠ Scale pods:
  → kubectl scale deployment: tăng pods (trên nodes sẵn có)
  → Tăng nodes: phải update Node Group config
```

---

## Xóa Cluster Khi Không Cần (Tiết Kiệm Chi Phí)

```
Thứ tự xóa:
1. Delete Node Group (EC2 instances)
2. Delete Cluster
3. Delete CloudFormation stack (VPC)
4. Delete Load Balancers (nếu còn)
5. Delete EFS file system (nếu có)

⚠ Xóa ngược thứ tự sẽ gây lỗi!
⚠ Kiểm tra AWS Billing sau để đảm bảo không còn resources
```

---

**Tiếp theo:** Deploy Kubernetes config lên EKS →

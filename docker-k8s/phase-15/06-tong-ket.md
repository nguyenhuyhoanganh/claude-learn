# Tổng Kết Phase 15 — Kubernetes trên AWS EKS

## Những Gì Đã Học

### 1. EKS vs ECS

```text
ECS = AWS-specific container service
  → Không biết Kubernetes
  → Config khác hoàn toàn

EKS = Kubernetes trên AWS
  → Dùng đúng YAML files đã viết
  → kubectl commands y chang
  → Portable sang Azure AKS, GKE, v.v.
```

### 2. Setup Cluster EKS

```text
Bước 1: IAM Role cho Cluster (eksClusterRole)
  → AmazonEKSClusterPolicy

Bước 2: VPC via CloudFormation
  → Network có public + private subnets

Bước 3: Tạo EKS Cluster
  → Chọn VPC, endpoint access: Public and private

Bước 4: AWS CLI + update kubectl config
  aws configure
  aws eks --region REGION update-kubeconfig --name CLUSTER-NAME
```

### 3. Worker Nodes

```text
IAM Role cho Nodes (EKSNodeGroupRole):
  → AmazonEKSWorkerNodePolicy
  → AmazonEKS_CNI_Policy
  → AmazonEC2ContainerRegistryReadOnly

Node Group:
  → Instance type: t3.small minimum (KHÔNG dùng t3.micro!)
  → 2 nodes cho production demo
  → EKS tự install K8s software trên nodes
```

### 4. Deploy YAML Files

```bash
# Y chang như minikube!
kubectl apply -f auth.yaml
kubectl apply -f users.yaml
kubectl get services
# → External IP thật (không phải <pending>)
# → AWS tự tạo Load Balancer
```

### 5. EFS Volumes

```text
Cài CSI Driver → kubectl apply -k [github URL]
Tạo Security Group (NFS port 2049)
Tạo EFS File System trong cùng VPC

StorageClass: efs-sc (provisioner: efs.csi.aws.com)
PV: accessModes: ReadWriteMany, csi.volumeHandle: fs-xxxxxxxx
PVC: request storage từ PV
Deployment: dùng PVC qua persistentVolumeClaim
```

---

## Checklist Deploy Production

```text
□ Images built và pushed lên Docker Hub
□ YAML files có image names đúng
□ EKS cluster đang chạy
□ Node Group active
□ kubectl config trỏ vào EKS cluster
□ Apply YAML files
□ Kiểm tra External IP của LoadBalancer services
□ Test API endpoints
□ (Nếu cần volume) EFS CSI driver cài xong, PV/PVC created
```

---

## Checklist Xóa Cluster (Tiết Kiệm Chi Phí)

```text
1. kubectl delete -f kubernetes/      # Xóa K8s resources
2. AWS Console → EKS → Node Groups → Delete
3. AWS Console → EKS → Cluster → Delete
4. AWS Console → CloudFormation → Stack → Delete
5. AWS Console → EC2 → Load Balancers → Delete (nếu còn)
6. AWS Console → EFS → File Systems → Delete (nếu có)
7. Kiểm tra AWS Billing đảm bảo không còn resources
```

---

## Cheat Sheet Commands

```bash
# Config kubectl cho EKS
aws configure
aws eks --region REGION update-kubeconfig --name CLUSTER-NAME

# Deploy
kubectl apply -f FILE.yaml

# Kiểm tra
kubectl get nodes
kubectl get deployments
kubectl get pods
kubectl get services           # Xem External IP
kubectl get pv
kubectl get pvc

# Scale
kubectl scale deployment/NAME --replicas=N
# hoặc edit YAML + kubectl apply

# Xóa
kubectl delete -f FILE.yaml
kubectl delete deployment NAME
kubectl delete service NAME
```

---

## Key Takeaways

```text
1. EKS = Kubernetes, không phải ECS
2. YAML files giống hoàn toàn với minikube
3. LoadBalancer service → AWS tạo real LB tự động
4. External IP thật (không cần minikube service)
5. hostPath không work multi-node → dùng EFS CSI
6. EFS CSI driver = bridge giữa K8s PV và AWS EFS
7. ReadWriteMany = nhiều nodes đọc/ghi cùng lúc
8. Luôn xóa cluster sau khi test xong!
```

---

---

## Tự kiểm tra

**1. Manifest chạy tốt trên minikube. Đưa lên EKS thì Pod báo `ImagePullBackOff`. Vì sao?**

<details><summary>Đáp án</summary>

Image chỉ nằm trên Docker của **máy bạn** (hoặc trong minikube). Node EKS không thấy nó. Phải **đẩy lên registry** (ECR, Docker Hub) trước. Và nếu build trên Mac chip ARM thì thêm `--platform linux/amd64`, nếu không sẽ gặp `exec format error`. Chi tiết: [bài 4](04-deploy-kubernetes-config.md).
</details>

**2. Service `LoadBalancer` kẹt `<pending>` quá 5 phút trên EKS. Ba nguyên nhân?**

<details><summary>Đáp án</summary>

**Thiếu quyền IAM** cho node group tạo Load Balancer; **subnet chưa gắn nhãn** `kubernetes.io/role/elb`; hoặc **hết hạn mức Load Balancer** của tài khoản. Chi tiết: [bài 2](02-tao-cluster-eks.md).
</details>

**3. Pod kẹt `Pending` với `Too many pods` nhưng `kubectl top node` cho thấy RAM còn thừa 60%. Vì sao?**

<details><summary>Đáp án</summary>

**Hết địa chỉ IP**, không phải hết tài nguyên. AWS VPC CNI cấp cho mỗi Pod một IP thật trong VPC, và số IP mỗi máy bị giới hạn theo **loại máy** — `t3.medium` chỉ chứa được **17 Pod**. Chữa bằng máy lớn hơn hoặc bật prefix delegation. Chi tiết: [bài 3](03-node-groups.md).
</details>

**4. Bạn xoá cụm EKS xong nhưng hoá đơn tháng sau vẫn có phí. Chỗ nào?**

<details><summary>Đáp án</summary>

Nhiều khả năng là **Load Balancer** do Service `LoadBalancer` tạo — nó **không bị xoá theo cụm**. Luôn `kubectl delete svc --all` **trước** khi xoá cụm. Ngoài ra kiểm tra node group, EBS volume mồ côi, và NAT Gateway.
</details>

**5. Vì sao nên dùng một Ingress thay vì mỗi service một `LoadBalancer`?**

<details><summary>Đáp án</summary>

**Mỗi Load Balancer tốn khoảng 16 USD/tháng.** Mười service là 160 USD/tháng chỉ cho phần vào. Một Ingress định tuyến được nhiều service qua **một** Load Balancer.
</details>

**6. Node đặt ở subnet riêng thì cần thêm gì, và nó tốn bao nhiêu?**

<details><summary>Đáp án</summary>

Cần **NAT Gateway** để node ra được Internet (kéo image, gọi API). Khoảng **32 USD/tháng mỗi cái** cộng phí dữ liệu; ba AZ là ~96 USD/tháng. Giảm mạnh bằng **VPC Endpoint cho ECR và S3** — image không đi qua NAT nữa.
</details>

---

**Phase kế tiếp** → [Phase 16 — Tổng Kết Khóa Học Docker & Kubernetes](../phase-16/01-tong-ket-khoa-hoc.md)

# Tổng Kết Phase 15 — Kubernetes trên AWS EKS

## Những Gì Đã Học

### 1. EKS vs ECS

```
ECS = AWS-specific container service
  → Không biết Kubernetes
  → Config khác hoàn toàn

EKS = Kubernetes trên AWS
  → Dùng đúng YAML files đã viết
  → kubectl commands y chang
  → Portable sang Azure AKS, GKE, v.v.
```

### 2. Setup Cluster EKS

```
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

```
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

```
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

```
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

```
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

```
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

**Tiếp theo:** Phase 16 — Tổng Kết Khóa Học →

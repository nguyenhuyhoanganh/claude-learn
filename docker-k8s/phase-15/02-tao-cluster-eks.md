# Bài 2: Tạo EKS Cluster Từng Bước

## Tổng Quan Các Bước

```
1. Tạo IAM Role cho EKS Cluster
2. Tạo VPC Network (dùng CloudFormation template)
3. Tạo EKS Cluster
4. Cài AWS CLI & update kubectl config
5. (Sau đó) Tạo Node Group (worker nodes)
```

---

## Bước 1: Tạo IAM Role cho Cluster

EKS cần quyền tạo các AWS resources khác (EC2, Load Balancer...) thay mặt bạn.

```
AWS Console → IAM → Roles → Create role

1. Select: AWS service
2. Use case: EKS → EKS - Cluster
3. Permissions: (tự động thêm AmazonEKSClusterPolicy)
4. Role name: eksClusterRole
5. Create role
```

**Tại sao cần?**
```
EKS muốn tạo EC2 instances → cần quyền
EKS muốn tạo Load Balancers → cần quyền
EKS muốn manage networking → cần quyền
→ IAM Role = "chứng chỉ ủy quyền" cho EKS
```

---

## Bước 2: Tạo VPC Network (CloudFormation)

EKS cần một VPC (Virtual Private Cloud) được config đặc biệt — vừa accessible từ internet, vừa có internal network.

```
AWS Console → CloudFormation → Create stack

1. Template source: Amazon S3 URL
2. Paste URL từ AWS EKS docs:
   https://s3.us-west-2.amazonaws.com/amazon-eks/cloudformation/2020-10-29/amazon-eks-vpc-private-subnets.yaml

3. Stack name: eksVpc
4. Click Next → Next → Create stack
```

**Đợi CloudFormation tạo xong (~2 phút), sau đó:**
- VPC mới với public + private subnets đã sẵn sàng
- Network config phù hợp cho EKS cluster

---

## Bước 3: Tạo EKS Cluster

```
AWS Console → EKS → Create cluster

1. Name: kub-dep-demo (tên tùy chọn)
2. Kubernetes version: chọn version mới nhất
3. Cluster service role: eksClusterRole (vừa tạo)
4. Networking:
   - VPC: chọn eksVpc (vừa tạo)
   - Cluster endpoint access: Public and private
5. Click Create
```

**Đợi cluster tạo xong (~5-10 phút)**

---

## Bước 4: Cài AWS CLI & Kết Nối kubectl

### Cài AWS CLI

```bash
# macOS
brew install awscli

# Windows: download installer từ aws.amazon.com/cli
# Linux: pip install awscli
```

### Tạo Access Key

```
AWS Console → Account name → Security Credentials
→ Access Keys → Create Access Key
→ Download .csv file (lưu kỹ, chỉ hiển thị 1 lần!)
```

### Configure AWS CLI

```bash
aws configure

# AWS Access Key ID: [paste từ .csv]
# AWS Secret Access Key: [paste từ .csv]
# Default region name: us-east-2  (region của cluster)
# Default output format: [Enter]
```

### Update kubectl Config

```bash
# Lệnh này update ~/.kube/config để kubectl nói chuyện với EKS
aws eks --region us-east-2 update-kubeconfig --name kub-dep-demo

# Verify
kubectl get pods
# (sẽ trả về "No resources found" vì chưa có gì — bình thường!)
```

### Backup minikube Config (Optional)

```bash
# Backup config minikube để có thể quay lại sau
cp ~/.kube/config ~/.kube/config.minikube

# Sau khi update: kubectl tự động nói chuyện với EKS
# Để quay về minikube: copy lại config.minikube
```

---

## Kiểm Tra Kết Nối

```bash
kubectl get nodes
# Ban đầu: No resources found (chưa có worker nodes)

kubectl get namespaces
# Sẽ thấy: default, kube-system, kube-public, kube-node-lease
```

---

## Lưu Ý Quan Trọng

```
⚠ Region phải nhất quán!
  → Cluster tạo ở us-east-2
  → aws configure: region = us-east-2
  → aws eks update-kubeconfig: --region us-east-2

⚠ Chưa deploy được gì nếu chưa có Worker Nodes
  → Bước tiếp theo: tạo Node Group
```

---

**Tiếp theo:** Thêm Worker Nodes vào Cluster →

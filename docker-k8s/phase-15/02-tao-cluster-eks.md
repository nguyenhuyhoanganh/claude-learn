# Bài 2: Tạo EKS Cluster Từng Bước

## Tổng Quan Các Bước

```text
1. Tạo IAM Role cho EKS Cluster
2. Tạo VPC Network (dùng CloudFormation template)
3. Tạo EKS Cluster
4. Cài AWS CLI & update kubectl config
5. (Sau đó) Tạo Node Group (worker nodes)
```

---

## Bước 1: Tạo IAM Role cho Cluster

EKS cần quyền tạo các AWS resources khác (EC2, Load Balancer...) thay mặt bạn.

```text
AWS Console → IAM → Roles → Create role

1. Select: AWS service
2. Use case: EKS → EKS - Cluster
3. Permissions: (tự động thêm AmazonEKSClusterPolicy)
4. Role name: eksClusterRole
5. Create role
```

**Tại sao cần?**
```text
EKS muốn tạo EC2 instances → cần quyền
EKS muốn tạo Load Balancers → cần quyền
EKS muốn manage networking → cần quyền
→ IAM Role = "chứng chỉ ủy quyền" cho EKS
```

---

## Bước 2: Tạo VPC Network (CloudFormation)

EKS cần một VPC (Virtual Private Cloud) được config đặc biệt — vừa accessible từ internet, vừa có internal network.

```text
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

```text
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

```text
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

```text
⚠ Region phải nhất quán!
  → Cluster tạo ở us-east-2
  → aws configure: region = us-east-2
  → aws eks update-kubeconfig: --region us-east-2

⚠ Chưa deploy được gì nếu chưa có Worker Nodes
  → Bước tiếp theo: tạo Node Group
```

---

## Vì sao EKS bắt bạn dựng mạng trước

Bước tạo VPC và subnet nghe như thủ tục hành chính, nhưng nó quyết định những thứ rất thật về sau. Đây là ý nghĩa của từng lựa chọn.

```text
   ┌────────────────── VPC ──────────────────────────────────┐
   │                                                          │
   │  ┌── Subnet CÔNG KHAI (public) ────────────────────┐    │
   │  │  Có đường ra Internet trực tiếp                 │    │
   │  │  → Load Balancer đặt ở đây                      │    │
   │  └─────────────────────────────────────────────────┘    │
   │                                                          │
   │  ┌── Subnet RIÊNG (private) ───────────────────────┐    │
   │  │  KHÔNG ai từ Internet gọi thẳng vào được        │    │
   │  │  → Worker node đặt ở đây                        │    │
   │  │  → ra Internet qua NAT Gateway                  │    │
   │  └─────────────────────────────────────────────────┘    │
   └──────────────────────────────────────────────────────────┘
```

Đặt worker node ở subnet riêng là **cách làm chuẩn**: node không có địa chỉ công khai, nên kẻ tấn công không quét thấy. Traffic vào đi qua Load Balancer ở subnet công khai.

Cái giá của lựa chọn đó là **NAT Gateway**, và đây là khoản tiền hay gây bất ngờ nhất:

```text
   NAT Gateway:  ~0,045 USD/giờ  ≈  32 USD/tháng MỖI CÁI
                 + 0,045 USD cho MỖI GB dữ liệu đi qua

   Ba AZ, mỗi AZ một NAT Gateway (khuyến nghị cho tính sẵn sàng)
   → ~96 USD/tháng chỉ riêng NAT, chưa tính dữ liệu

   Kéo image 500 MB × 20 lần/ngày × 30 ngày = 300 GB
   → thêm ~13,5 USD/tháng
```

Ba cách giảm, theo mức độ:

| Cách | Tiết kiệm | Đánh đổi |
|---|---|---|
| Dùng **một** NAT Gateway cho cả ba AZ | ~64 USD/tháng | Mất AZ đó là node ở AZ khác mất đường ra Internet |
| Dùng **VPC Endpoint** cho ECR và S3 | Phần lớn phí dữ liệu | Cấu hình thêm, nhưng gần như luôn đáng làm |
| Đặt node ở **subnet công khai** (chỉ cho môi trường học) | Toàn bộ phí NAT | **Kém an toàn** — chỉ dùng khi học |

VPC Endpoint đáng nói riêng: nó cho phép node kéo image từ ECR **không đi qua NAT Gateway**, mà đi qua đường nội bộ của AWS. Với cụm kéo image thường xuyên, đây là khoản tiết kiệm lớn nhất.

### Nhãn subnet — thứ quên là Load Balancer không tạo được

EKS tìm subnet để đặt Load Balancer dựa vào **nhãn**, và thiếu nhãn thì Service `LoadBalancer` kẹt `<pending>` mãi mãi mà không có thông báo rõ ràng:

```bash
# Subnet công khai — cho Load Balancer hướng Internet
kubernetes.io/role/elb = 1

# Subnet riêng — cho Load Balancer nội bộ
kubernetes.io/role/internal-elb = 1

# Cả hai (với Kubernetes < 1.19 thì bắt buộc)
kubernetes.io/cluster/<ten-cum> = shared
```

```bash
# Kiểm tra
aws ec2 describe-subnets --filters "Name=vpc-id,Values=vpc-xxx" \
  --query 'Subnets[].{ID:SubnetId,Tags:Tags}' --output table
```

> Nếu dùng **eksctl** hoặc module Terraform chính thức thì các nhãn này được đặt tự động. Chỉ khi dựng VPC bằng tay mới phải nhớ.

### Ba cách dựng cụm

| Cách | Thời gian | Hợp với |
|---|---|---|
| **AWS Console** (bấm chuột) | ~20 phút | Học lần đầu — thấy rõ từng lựa chọn |
| **eksctl** | ~15 phút, một lệnh | Dựng nhanh, môi trường thử nghiệm |
| **Terraform / CDK** | Lâu hơn lúc đầu | **Production** — hạ tầng là mã nguồn, tái lập được |

```bash
# eksctl — gọn nhất
eksctl create cluster \
  --name hoc-tap \
  --region ap-southeast-1 \
  --nodegroup-name workers \
  --node-type t3.medium \
  --nodes 2 --nodes-min 2 --nodes-max 4 \
  --managed
```

Một lệnh này tạo VPC, subnet, nhãn, IAM role, control plane và node group — đúng những gì bạn làm thủ công qua Console, nhưng tái lập được và xoá sạch được bằng `eksctl delete cluster`.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách xử lý |
|---|---|---|
| Quên nhãn subnet | Service `LoadBalancer` kẹt `<pending>` mãi, không rõ lý do | Đặt `kubernetes.io/role/elb` |
| Không tính NAT Gateway vào chi phí | Bất ngờ ~96 USD/tháng cho ba AZ | Dùng một NAT, hoặc VPC Endpoint |
| Kéo image qua NAT Gateway | Phí dữ liệu tăng theo số lần deploy | **VPC Endpoint cho ECR và S3** |
| Đặt node ở subnet công khai ở production | Node phơi ra Internet | Subnet riêng + NAT |
| Dựng cụm bằng Console rồi cần dựng lại | Không nhớ đã bấm gì | Dùng eksctl hoặc Terraform |
| Chọn một AZ cho gọn | Mất AZ là mất cả cụm | Tối thiểu hai AZ |
| Quên xoá cụm sau khi học | **72 USD/tháng** cho control plane dù không chạy gì | `eksctl delete cluster` và kiểm tra Billing |
| Dùng IAM user cá nhân tạo cụm | Chỉ user đó truy cập được cụm | Cấu hình `aws-auth` hoặc EKS Access Entry cho cả đội |

Dòng cuối là sự cố "tôi tạo cụm nhưng đồng nghiệp không vào được": danh tính tạo cụm được cấp quyền quản trị **tự động**, mọi danh tính khác phải thêm tay.

---

## Tóm tắt bài 2

- EKS bắt dựng **VPC và subnet trước** vì mạng quyết định nơi đặt node và Load Balancer.
- Cách chuẩn: **worker node ở subnet riêng** (không phơi ra Internet), **Load Balancer ở subnet công khai**.
- Cái giá là **NAT Gateway ~32 USD/tháng mỗi cái** cộng phí dữ liệu. Ba AZ là ~96 USD/tháng. Giảm bằng **VPC Endpoint cho ECR và S3** — khoản tiết kiệm lớn nhất với cụm kéo image thường xuyên.
- **Quên nhãn subnet `kubernetes.io/role/elb` thì Service `LoadBalancer` kẹt `<pending>` mãi** mà không có thông báo rõ ràng.
- Ba cách dựng: **Console** (học lần đầu), **eksctl** (nhanh, một lệnh), **Terraform** (production).
- **Danh tính tạo cụm được cấp quyền tự động; người khác phải thêm tay** qua `aws-auth` hoặc EKS Access Entry.
- Nhớ **`eksctl delete cluster`** khi học xong — control plane tính **72 USD/tháng** kể cả khi không chạy gì.

---

**Bài kế tiếp** → [Bài 3: Thêm Worker Nodes (Node Groups)](03-node-groups.md)

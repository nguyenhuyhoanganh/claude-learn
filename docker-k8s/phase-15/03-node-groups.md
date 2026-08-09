# Bài 3: Thêm Worker Nodes (Node Groups)

## Tại Sao Cần Node Group?

```text
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

```text
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

```text
AWS Console → EKS → Cluster → Compute tab
→ Add node group

1. Name: demo-dep-nodes (tùy chọn)
2. Node IAM role: EKSNodeGroupRole (vừa tạo)
3. Click Next
```

### Config EC2 Instance Type

```text
AMI type: Amazon Linux 2 (default)
Instance type: t3.small (MINIMUM!)
  ⚠ KHÔNG dùng t3.micro — quá nhỏ, pods sẽ bị pending
  → t3.small: 2 vCPU, 2GB RAM → đủ cho demo
  → t3.medium: nếu cần chạy nhiều pods hơn

Disk size: 20GB (default)
```

### Scaling Config

```text
Minimum: 1 node
Maximum: 3 nodes  
Desired: 2 nodes   ← 2 nodes thật, phân tán Pods tự động
```

### Remote Access

```text
→ Disable (không cần SSH vào nodes)
→ EKS quản lý nodes, ta không cần SSH trực tiếp
```

```text
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

```text
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

```text
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

## Chọn loại và số lượng node — bốn ràng buộc

Đây là quyết định tốn tiền nhất khi dựng cụm, và có bốn ràng buộc ít người tính đủ.

**1. Node nhỏ mất tỉ lệ tài nguyên nhiều hơn.**

Mỗi node phải chừa phần cho hệ điều hành, kubelet, và container runtime:

```text
   t3.medium  (2 vCPU, 4 GiB)
   → dành riêng ~0,5 vCPU + ~1,0 GiB cho hệ thống
   → còn cho Pod: ~1,5 vCPU + ~3,0 GiB      → mất 25% RAM

   m5.2xlarge (8 vCPU, 32 GiB)
   → dành riêng ~0,9 vCPU + ~3,0 GiB
   → còn cho Pod: ~7,1 vCPU + ~29 GiB       → mất 9% RAM
```

```bash
# Xem con số thật của node
kubectl describe node <ten-node> | grep -A6 "Allocatable"
```

**2. Nhưng node lớn thì "hỏng một cái mất nhiều".**

```text
   10 node nhỏ  → mất 1 node = mất 10% năng lực
    2 node lớn  → mất 1 node = mất 50% năng lực
```

Điểm cân bằng thường gặp: **node đủ lớn để chứa 15–30 Pod**, và **ít nhất 3 node** để chịu được một node chết mà không quá tải hai node còn lại.

**3. Giới hạn số Pod trên mỗi node — riêng AWS rất chặt.**

Đây là ràng buộc bất ngờ nhất trên EKS, vì nó phụ thuộc **loại máy** chứ không phải RAM:

```bash
kubectl get nodes -o custom-columns=NAME:.metadata.name,PODS:.status.allocatable.pods
```

```text
NAME                 PODS
ip-10-0-1-45         17        ← t3.medium chỉ chứa được 17 Pod!
```

Lý do: AWS VPC CNI cấp cho mỗi Pod **một địa chỉ IP thật trong VPC**, và số IP mỗi máy bị giới hạn bởi số card mạng nhân số IP mỗi card. `t3.medium` chỉ được 17 — kể cả khi RAM còn thừa nhiều.

```text
   Bạn chạy 20 Pod nhỏ trên t3.medium (RAM còn thừa 60%)
   → 3 Pod cuối kẹt Pending: "Too many pods"
   → tưởng thiếu tài nguyên, thực ra HẾT ĐỊA CHỈ IP
```

Cách chữa: dùng máy lớn hơn, hoặc bật **chế độ tiền tố (prefix delegation)** của VPC CNI để tăng số IP mỗi node lên nhiều lần.

**4. Nhiều vùng sẵn sàng — và cái bẫy đi kèm.**

Node group nên trải ít nhất **hai AZ** để chịu được sự cố một vùng. Nhưng nhớ điều đã nói ở [Phase 13 bài 4](../phase-13/04-persistent-volume-claims.md): **ổ đĩa EBS gắn với một AZ**. Pod dùng PVC không chuyển sang AZ khác được — đó chính là lý do StorageClass mặc định dùng `WaitForFirstConsumer`.

### Node theo yêu cầu, spot, hay dành riêng

| Loại | Giá | Rủi ro | Hợp với |
|---|---|---|---|
| On-Demand | 100% | Không | Dịch vụ quan trọng |
| **Spot** | **~30%** | **AWS thu hồi với 2 phút báo trước** | Batch, worker, môi trường dev |
| Reserved / Savings Plan | ~60% | Cam kết 1–3 năm | Phần tải nền ổn định |

Mẫu tiết kiệm hay dùng: **một node group On-Demand nhỏ cho phần tải nền, cộng một node group Spot lớn cho phần co giãn**. Kèm nhãn và taint để chỉ workload chịu được gián đoạn mới chạy trên Spot:

```yaml
      nodeSelector:
        node-type: spot
      tolerations:
        - key: spot
          operator: Exists
          effect: NoSchedule
```

Với Spot thì **`PodDisruptionBudget` là bắt buộc** ([Phase 17 bài 4](../phase-17/04-chon-workload-va-tong-ket.md)), nếu không AWS thu hồi nhiều node cùng lúc là dịch vụ gián đoạn.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách xử lý |
|---|---|---|
| Pod `Pending` với `Too many pods` dù RAM còn thừa | **Hết địa chỉ IP** trên node, không phải hết tài nguyên | Máy lớn hơn, hoặc bật prefix delegation |
| Dùng node quá nhỏ | Mất 25% RAM cho hệ thống, và trần Pod rất thấp | Cân bằng ở mức 15–30 Pod mỗi node |
| Chỉ 1–2 node | Mất một node là mất 50% năng lực | Tối thiểu 3 |
| Dùng Spot cho dịch vụ quan trọng | Gián đoạn khi AWS thu hồi | Tách node group; dùng taint |
| Spot mà không có PodDisruptionBudget | Thu hồi nhiều node cùng lúc → dịch vụ chết | Luôn có PDB |
| Node group một AZ | Mất AZ là mất cả cụm | Trải ít nhất 2 AZ |
| Quên rằng EBS gắn với một AZ | Pod dùng PVC kẹt `volume node affinity conflict` | `WaitForFirstConsumer` |
| Xoá cụm mà quên node group | **Node vẫn chạy và vẫn tính tiền** | Xoá node group trước, rồi mới xoá cụm |
| Không đặt giới hạn tối đa cho node group | Một sự cố scale lên 50 node → hoá đơn rất lớn | Đặt `maxSize` hợp lý |

---

## Tóm tắt bài 3

- **Node nhỏ mất tỉ lệ tài nguyên nhiều hơn** cho hệ thống (25% RAM với `t3.medium` so với 9% với `m5.2xlarge`), nhưng **node lớn thì hỏng một cái mất nhiều**. Điểm cân bằng: node chứa **15–30 Pod**, và **ít nhất 3 node**.
- **Ràng buộc bất ngờ nhất trên EKS: giới hạn số Pod theo loại máy.** `t3.medium` chỉ chứa **17 Pod** vì AWS VPC CNI cấp mỗi Pod một IP thật trong VPC. Pod kẹt `Too many pods` là **hết IP**, không phải hết RAM.
- **Node Spot rẻ ~70%** nhưng bị thu hồi với 2 phút báo trước — tách thành node group riêng, dùng taint, và **bắt buộc có PodDisruptionBudget**.
- Trải node ra **ít nhất 2 AZ**, nhưng nhớ **EBS gắn với một AZ** nên Pod dùng PVC không chuyển vùng được.
- **Xoá node group trước khi xoá cụm** — nếu không node vẫn chạy và vẫn tính tiền.

---

**Bài kế tiếp** → [Bài 4: Deploy Kubernetes Config lên EKS](04-deploy-kubernetes-config.md)

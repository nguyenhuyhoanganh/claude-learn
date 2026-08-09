# Bài 4: Deploy Kubernetes Config lên EKS

## Điểm Mạnh Lớn Nhất của Kubernetes

**Cùng một YAML file, dùng được ở mọi nơi:**

```bash
# Trên minikube (local)
kubectl apply -f users.yaml

# Trên AWS EKS (production)
kubectl apply -f users.yaml   # ← Y CHANG! Không cần thay đổi gì!
```

Đây chính là lý do dùng Kubernetes thay vì ECS.

---

## Chuẩn Bị Trước Khi Deploy

### 1. Push Images lên Docker Hub

```bash
# Build và push users API
cd users-api
docker build -t USERNAME/kub-dep-users .
docker push USERNAME/kub-dep-users

# Build và push auth API
cd ../auth-api
docker build -t USERNAME/kub-dep-auth .
docker push USERNAME/kub-dep-auth
```

### 2. Update Image Names trong YAML

```yaml
# users.yaml
spec:
  containers:
    - name: users
      image: USERNAME/kub-dep-users   # Thay USERNAME thật
```

---

## Deploy lên EKS

```bash
# Đảm bảo kubectl đang trỏ vào EKS (không phải minikube)
kubectl config current-context
# → arn:aws:eks:us-east-2:xxxxx:cluster/kub-dep-demo

# Apply configs
kubectl apply -f kubernetes/auth.yaml
kubectl apply -f kubernetes/users.yaml

# Kiểm tra
kubectl get deployments
kubectl get pods
kubectl get services
```

---

## External IP Thật (Khác với minikube!)

Trên minikube:
```bash
kubectl get services
# NAME          TYPE          CLUSTER-IP    EXTERNAL-IP
# users-service LoadBalancer  10.96.x.x     <pending>  ← Pending!

minikube service users-service  # Cần lệnh này để truy cập
```

Trên EKS:
```bash
kubectl get services
# NAME          TYPE          CLUSTER-IP    EXTERNAL-IP
# users-service LoadBalancer  10.96.x.x     abc123.us-east-2.elb.amazonaws.com ← URL thật!
```

**Dùng URL đó trực tiếp:**
```bash
curl http://abc123.us-east-2.elb.amazonaws.com/signup \
  -d '{"email":"test@test.com","password":"tester1"}' \
  -H "Content-Type: application/json"
```

---

## AWS Tự Động Tạo Load Balancer

```text
EC2 Console → Load Balancers
→ Thấy 1 Load Balancer được tạo tự động bởi EKS
→ URL này = EXTERNAL-IP trong kubectl get services
```

Khi bạn `kubectl delete service users-service`:
- EKS tự xóa Load Balancer trên AWS

---

## Scaling vẫn Hoạt Động Bình Thường

```bash
# Thay đổi replicas
# Edit users.yaml: replicas: 3

kubectl apply -f kubernetes/users.yaml

kubectl get pods
# Kubernetes phân phối 3 pods vào 2 nodes tự động
```

---

## ClusterIP và CoreDNS vẫn Hoạt Động

```yaml
# auth.yaml - service type ClusterIP
spec:
  type: ClusterIP
  selector:
    app: auth
```

```yaml
# users.yaml - gọi auth qua CoreDNS domain
env:
  - name: AUTH_API_ADDRESS
    value: auth-service.default  # ← Không đổi gì!
```

```bash
# Verify: users API gọi được auth API
# Send signup request → thấy users-created response
# Proves internal communication works on EKS too
```

---

## Tóm Tắt: minikube vs EKS

| | minikube | EKS |
|---|---|---|
| **Môi trường** | Local VM | AWS Cloud |
| **YAML files** | Dùng y chang | Dùng y chang |
| **kubectl** | Dùng y chang | Dùng y chang |
| **External IP** | `<pending>` | URL thật |
| **Access** | `minikube service` | URL trực tiếp |
| **Nodes** | 1 VM node | EC2 instances |
| **Load Balancer** | Không có thật | AWS LB tự tạo |
| **Chi phí** | Miễn phí | Có phí |

---

## Cùng một file YAML, hai kết quả khác nhau

Điều làm Kubernetes có giá trị: **manifest chạy trên minikube chạy được luôn trên EKS**. Nhưng có bốn chỗ hành xử khác nhau, và không biết trước thì rất bối rối.

| Trong manifest | Trên minikube | Trên EKS |
|---|---|---|
| `type: LoadBalancer` | Kẹt `<pending>` cho tới khi chạy `minikube tunnel` | AWS tạo **Load Balancer thật**, có phí, mất 2–4 phút |
| `storageClassName` không khai | Dùng `standard` (hostPath cục bộ) | Dùng `gp2`/`gp3` — **ổ đĩa EBS thật, có phí** |
| Không khai `resources` | Không sao, một node một mình | Scheduler xếp bừa, dễ gây tranh chấp |
| `imagePullPolicy` với tag `latest` | Có thể dùng image cục bộ | **Luôn tải từ registry** — image cục bộ vô nghĩa |

Dòng cuối là bẫy hay gặp nhất khi chuyển từ minikube lên EKS:

```text
   Trên minikube:  bạn đã minikube image load myapp:v1  →  Pod chạy được
   Trên EKS:       node KHÔNG CÓ image đó
                   → ImagePullBackOff
                   → phải PUSH lên registry (ECR/Docker Hub) trước
```

```bash
# Đẩy image lên ECR
aws ecr get-login-password --region ap-southeast-1 \
  | docker login --username AWS --password-stdin <tai-khoan>.dkr.ecr.ap-southeast-1.amazonaws.com

docker tag myapp:v1 <tai-khoan>.dkr.ecr.ap-southeast-1.amazonaws.com/myapp:v1
docker push <tai-khoan>.dkr.ecr.ap-southeast-1.amazonaws.com/myapp:v1
```

Nhớ điều đã nói ở [Phase 9 bài 2](../phase-9/02-deploy-voi-ec2.md): build trên máy Mac chip ARM rồi chạy trên node x86 sẽ ra `exec format error`. Thêm `--platform linux/amd64`.

### Theo dõi Load Balancer được tạo

```bash
kubectl get svc frontend -w
```

```text
NAME       TYPE           CLUSTER-IP      EXTERNAL-IP                          PORT(S)
frontend   LoadBalancer   10.100.45.12    <pending>                            80:31234/TCP
frontend   LoadBalancer   10.100.45.12    a1b2c3-1234.ap-southeast-1.elb...    80:31234/TCP
                                           ▲
                            xuất hiện sau 2-4 phút
```

Nếu sau 5 phút vẫn `<pending>`:

```bash
kubectl describe svc frontend | tail -12
```

Ba nguyên nhân thường gặp: **thiếu quyền IAM** cho node group tạo Load Balancer, **subnet chưa gắn nhãn** `kubernetes.io/role/elb`, hoặc **hết hạn mức Load Balancer** của tài khoản.

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Image chỉ có ở máy cục bộ | `ImagePullBackOff` trên EKS | Đẩy lên ECR/Docker Hub trước |
| Build trên Mac ARM, chạy trên node x86 | `exec format error` | `docker build --platform linux/amd64` |
| `LoadBalancer` kẹt `<pending>` quá 5 phút | Không có EXTERNAL-IP | Kiểm tra quyền IAM, nhãn subnet, hạn mức tài khoản |
| Mỗi Service một `LoadBalancer` | **Mỗi LB ~16 USD/tháng** — 10 service là 160 USD | Dùng **một Ingress** cho nhiều service |
| Quên `resources` khi lên cụm thật | Pod tranh chấp tài nguyên, khó chẩn đoán | Đặt `requests`/`limits` — [Phase 18 bài 1](../phase-18/01-requests-limits-va-qos.md) |
| Dùng `storageClass` mặc định mà không biết | Tạo ổ đĩa EBS thật, tính tiền | Khai tường minh, biết mình đang dùng gì |
| Xoá cụm mà quên `kubectl delete svc --all` | **Load Balancer ở lại và vẫn tính tiền** | Xoá Service trước khi xoá cụm |
| Áp dụng manifest mà không `kubectl diff` trước | Thay đổi ngoài dự tính ở production | `kubectl diff -f` trước mỗi lần apply |

---

## Tóm tắt bài 4

- **Cùng một manifest chạy được trên cả minikube lẫn EKS** — đó là giá trị lớn nhất của Kubernetes so với ECS.
- Bốn chỗ hành xử khác nhau: **`LoadBalancer`** (minikube kẹt `<pending>`, EKS tạo LB thật có phí), **StorageClass** (hostPath so với EBS thật), **`resources`** (một node so với nhiều node), và **image** (cục bộ so với phải push lên registry).
- **Bẫy số một khi lên EKS: image chỉ có ở máy cục bộ** → `ImagePullBackOff`. Phải đẩy lên ECR/Docker Hub, và nhớ `--platform linux/amd64` nếu build trên Mac ARM.
- **Mỗi Service `LoadBalancer` tốn khoảng 16 USD/tháng.** Mười service là 160 USD — dùng **một Ingress** thay vì mười LB.
- **Xoá Service trước khi xoá cụm**, nếu không Load Balancer ở lại và tính tiền âm thầm.

---

**Bài kế tiếp** → [Bài 5: EFS Volumes trên AWS EKS](05-efs-volumes-tren-eks.md)

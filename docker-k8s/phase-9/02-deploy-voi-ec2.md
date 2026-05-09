# Bài 2: Deploy với EC2 — DIY Approach

## EC2 là gì?

**EC2 (Elastic Compute Cloud)** = Máy tính ảo chạy trong cloud của AWS.

```
EC2 Instance = Remote computer
  - Chạy hệ điều hành (Amazon Linux, Ubuntu, etc.)
  - Bạn có toàn quyền truy cập qua SSH
  - Cài đặt bất kỳ phần mềm nào
  - Chúng ta sẽ cài Docker trên đó
```

---

## Quy Trình Deploy 3 Bước

```
┌─────────────────────────────────────────────────────┐
│  BƯỚC 1: Tạo EC2 Instance                           │
│  → Chọn OS (Amazon Linux)                           │
│  → Chọn instance type (t2.micro — free tier)        │
│  → Tạo key pair (.pem file) để SSH                  │
│  → Configure Security Group                         │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│  BƯỚC 2: Setup Docker trên Remote Machine           │
│  SSH → Install Docker → Start Docker                │
└─────────────────────────┬───────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────┐
│  BƯỚC 3: Run Container                              │
│  Local: docker build + docker push (to Docker Hub)  │
│  Remote: docker pull + docker run                   │
└─────────────────────────────────────────────────────┘
```

---

## Bước 1: Tạo EC2 Instance

### Trong AWS Console

```
1. Vào EC2 Dashboard → Launch Instance
2. Chọn: Amazon Linux AMI (64-bit x86)
3. Chọn: t2.micro (Free tier eligible)
4. Click: Next: Configure Instance Details
   → Đảm bảo có VPC (Virtual Private Cloud)
   → Giữ các settings mặc định
5. Click: Review and Launch
6. Tạo Key Pair:
   → Create new key pair
   → Đặt tên (e.g., "example-1")
   → Download Key Pair → Lưu file .pem cẩn thận!
   → KHÔNG share file này với ai
7. Click: Launch Instances
```

### Key Pair — Quan trọng!

```
File .pem = "Chìa khóa" để mở cửa SSH
  → Chỉ download được 1 lần
  → Mất file = Mất quyền SSH vào instance
  → Phải tạo instance mới nếu mất

Không bao giờ:
  → Commit .pem file lên Git
  → Share với người khác
  → Thêm vào Docker image
```

Thêm vào `.dockerignore`:
```
*.pem
```

---

## Bước 2: Kết Nối SSH và Cài Docker

### Kết nối qua SSH

**macOS / Linux:**
```bash
# Cấp quyền cho key file (bắt buộc)
chmod 400 example-1.pem

# SSH vào instance (lấy địa chỉ từ AWS Console)
ssh -i "example-1.pem" ec2-user@<PUBLIC_IP>
```

**Windows:** Dùng PuTTY hoặc WSL2.

### Cài Docker trên Remote Machine

Sau khi SSH thành công (terminal hiện `ec2-user@...`):

```bash
# Cập nhật packages trên remote machine
sudo yum update -y

# Cài Docker (đặc biệt của Amazon Linux)
sudo amazon-linux-extras install docker

# Khởi động Docker
sudo service docker start

# Kiểm tra Docker đã hoạt động
sudo docker --version
```

---

## Bước 3: Đưa Image lên và Chạy

### Chuẩn bị image trên máy local

```bash
# Tạo .dockerignore để tránh copy file nhạy cảm
echo "node_modules
*.pem
Dockerfile" > .dockerignore

# Build image
docker build -t node-dep-example-1 .

# Tạo repository trên Docker Hub trước
# docker.io/YOUR_USERNAME/node-example-1

# Tag image với repository name
docker tag node-dep-example-1 YOUR_USERNAME/node-example-1

# Login Docker Hub
docker login

# Push image
docker push YOUR_USERNAME/node-example-1
```

### Chạy container trên EC2

```bash
# Trở lại terminal đang SSH vào EC2
sudo docker run -d --rm -p 80:80 YOUR_USERNAME/node-example-1

# Kiểm tra container đang chạy
sudo docker ps
```

---

## Security Groups — Mở Port cho Traffic

Mặc định EC2 chỉ cho phép SSH (port 22). Cần thêm rule cho HTTP:

```
AWS Console → EC2 → Security Groups
→ Chọn security group của instance (Launch-Wizard-X)
→ Inbound Rules → Edit Inbound Rules
→ Add Rule:
   Type: HTTP
   Port: 80
   Source: Anywhere (0.0.0.0/0)
→ Save Rules
```

Sau đó truy cập bằng Public IPv4 Address của instance.

---

## Update Container — Quy Trình

```bash
# 1. Sửa code trên local machine

# 2. Rebuild image
docker build -t node-dep-example-1 .
docker tag node-dep-example-1 YOUR_USERNAME/node-example-1

# 3. Push updated image
docker push YOUR_USERNAME/node-example-1

# 4. Trên EC2 (SSH terminal):
# Stop container cũ
sudo docker stop <container_name>

# Pull image mới (bắt buộc! docker run không tự pull)
sudo docker pull YOUR_USERNAME/node-example-1

# Run container mới (dùng image mới nhất)
sudo docker run -d --rm -p 80:80 YOUR_USERNAME/node-example-1
```

**Lưu ý quan trọng:** `docker run` không tự kiểm tra image mới hơn. Phải `docker pull` trước.

---

## Tắt Instance

```bash
# Stop container (app không còn accessible)
sudo docker stop <container_name>

# Terminate instance hoàn toàn (xóa hết):
AWS Console → Instances → Actions → Instance State → Terminate
```

---

## Nhược Điểm của DIY Approach

```
Bạn phải tự quản lý:
  ✗ Tạo và cấu hình server
  ✗ Security groups và firewall
  ✗ Cập nhật OS và packages
  ✗ Đảm bảo server đủ mạnh khi có nhiều traffic
  ✗ Scaling khi cần
  ✗ Security của toàn bộ server

→ Cần kỹ năng sysadmin/DevOps chuyên sâu
→ Dễ cấu hình sai → Security vulnerabilities
→ Toàn bộ trách nhiệm thuộc về bạn
```

**Khi nào dùng EC2?**
- Bạn có kinh nghiệm quản lý server
- Cần toàn quyền kiểm soát môi trường
- Có đội DevOps chuyên nghiệp

---

**Tiếp theo:** AWS ECS — Managed Container Service →

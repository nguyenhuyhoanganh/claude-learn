# Bài 2: Deploy với EC2 — DIY Approach

## EC2 là gì?

**EC2 (Elastic Compute Cloud)** = Máy tính ảo chạy trong cloud của AWS.

```text
EC2 Instance = Remote computer
  - Chạy hệ điều hành (Amazon Linux, Ubuntu, etc.)
  - Bạn có toàn quyền truy cập qua SSH
  - Cài đặt bất kỳ phần mềm nào
  - Chúng ta sẽ cài Docker trên đó
```

---

## Quy Trình Deploy 3 Bước

```text
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

```text
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

```text
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
```text
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

```text
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

```text
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

## Bẫy thường gặp khi deploy lên EC2

| Bẫy | Thông báo lỗi | Cách xử lý |
|---|---|---|
| Quyền file khoá SSH quá rộng | `WARNING: UNPROTECTED PRIVATE KEY FILE!` | `chmod 400 khoa.pem` |
| Security Group không mở cổng | Trình duyệt treo rồi timeout | Mở cổng 80/443 cho `0.0.0.0/0`; cổng 22 **chỉ cho IP của bạn** |
| Gõ `docker` mà chưa thoát đăng nhập | `permission denied ... docker.sock` | `sudo usermod -aG docker $USER` rồi **đăng xuất và đăng nhập lại** |
| Build image trên máy Mac M-series rồi chạy trên EC2 x86 | `exec format error` | Build với `--platform linux/amd64`, hoặc dùng `docker buildx` đa kiến trúc |
| Container chết là hết, không tự chạy lại | Dịch vụ ngừng sau một lỗi vặt | Thêm `--restart unless-stopped` |
| Khởi động lại EC2 thì container không lên | Dịch vụ chết sau bảo trì | `--restart unless-stopped` + bật `systemctl enable docker` |
| Đĩa EC2 đầy sau vài tuần | `no space left on device` | `docker system prune -a` định kỳ; giám sát dung lượng |
| Dùng IP công khai của EC2 làm địa chỉ cố định | IP **đổi mỗi lần khởi động lại** instance | Gắn **Elastic IP**, hoặc dùng tên miền |
| Đưa mật khẩu database qua `-e` trên dòng lệnh | Nằm trong lịch sử shell và `docker inspect` | Dùng `--env-file`, hoặc AWS Secrets Manager |

Ba dòng đáng nói kỹ hơn.

**Lỗi `exec format error`** là bẫy rất hay gặp từ khi máy Mac dùng chip ARM:

```bash
# Trên máy Mac M1-M4, build mặc định ra image ARM
docker build -t myapp .
docker push myuser/myapp

# Trên EC2 (x86_64)
docker run myuser/myapp
```

```text
exec /usr/local/bin/docker-entrypoint.sh: exec format error
```

```bash
# Cách chữa
docker build --platform linux/amd64 -t myapp .

# Hoặc build cho cả hai kiến trúc một lần
docker buildx build --platform linux/amd64,linux/arm64 -t myuser/myapp --push .
```

**Chính sách khởi động lại** — bảng bốn giá trị:

| Giá trị | Hành vi |
|---|---|
| `no` (mặc định) | Không bao giờ tự chạy lại |
| `on-failure` | Chỉ chạy lại khi thoát với mã khác 0 |
| **`unless-stopped`** | Chạy lại trừ khi **bạn** chủ động dừng. Sống sót qua khởi động lại máy |
| `always` | Luôn chạy lại, kể cả khi bạn đã `docker stop` rồi máy khởi động lại |

`unless-stopped` gần như luôn là lựa chọn đúng — nó tôn trọng ý định của bạn khi bạn cố ý dừng container.

**Dọn đĩa** là việc phải làm định kỳ, vì EC2 mặc định chỉ có 8 GB:

```bash
# Xem đang dùng bao nhiêu
docker system df

# Dọn tự động mỗi tuần
echo '0 3 * * 0 /usr/bin/docker system prune -af --filter "until=168h"' | crontab -
```

---

## Tóm tắt bài 2

- Deploy lên EC2 gồm ba bước: **tạo máy**, **cài Docker**, **đưa image lên rồi chạy**.
- Đưa image lên nên qua **registry** (Docker Hub, ECR), không nên `scp` mã nguồn rồi build trên server — build trên máy nhỏ vừa chậm vừa dễ hết bộ nhớ.
- **Security Group là tường lửa**: mở 80/443 cho tất cả, nhưng **cổng 22 chỉ cho IP của bạn**.
- **Máy Mac chip ARM build ra image không chạy được trên EC2 x86** — dùng `--platform linux/amd64` hoặc `docker buildx`.
- Luôn thêm **`--restart unless-stopped`**, nếu không container sẽ không tự lên sau khi máy khởi động lại.
- **IP công khai của EC2 đổi mỗi lần khởi động lại** — gắn Elastic IP hoặc dùng tên miền.
- Đĩa EC2 mặc định chỉ 8 GB — đặt lịch **`docker system prune`** hằng tuần.
- EC2 cho toàn quyền kiểm soát, nhưng **bạn tự chịu trách nhiệm** vá hệ điều hành, giám sát, sao lưu, và tự phục hồi khi máy chết.

---

**Bài kế tiếp** → [Bài 3: AWS ECS — Managed Container Service](03-aws-ecs-managed-service.md)

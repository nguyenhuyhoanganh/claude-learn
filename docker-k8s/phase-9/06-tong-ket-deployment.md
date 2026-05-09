# Bài 6: Tổng Kết — Docker Deployment

## Hai Triết Lý Deployment

```
┌──────────────────────────────┬──────────────────────────────────┐
│   DIY (EC2, tự quản lý)      │   Managed Service (ECS, v.v.)    │
├──────────────────────────────┼──────────────────────────────────┤
│ Bạn tạo server               │ Provider tạo server              │
│ Bạn cài Docker               │ Provider lo Docker               │
│ Bạn cập nhật OS              │ Provider cập nhật OS             │
│ Bạn quản lý security         │ Provider lo security             │
│ Bạn setup scaling            │ Auto scaling (có cấu hình)       │
├──────────────────────────────┼──────────────────────────────────┤
│ Toàn quyền kiểm soát         │ Ít quyền kiểm soát hơn          │
│ Trách nhiệm cao              │ Trách nhiệm thấp hơn             │
│ Cần kỹ năng sysadmin         │ Chỉ cần biết cấu hình service    │
│ Phù hợp: experts             │ Phù hợp: developers              │
└──────────────────────────────┴──────────────────────────────────┘
```

---

## Những Điểm Quan Trọng Cần Nhớ

### 1. Không dùng Bind Mounts trong Production

```
Development:  docker run -v $(pwd)/src:/app my-image
              → Live code sync, hot-reload

Production:   docker run my-image
              → Không có -v → dùng COPY trong Dockerfile
              → Container tự đủ (self-contained)
```

### 2. Multi-Container: localhost vs container names

```
Local (Docker Compose):
  → Container names hoạt động (Docker DNS)
  → mongodb://mongo:27017

AWS ECS (cùng Task):
  → Container names KHÔNG hoạt động
  → Dùng localhost: mongodb://localhost:27017

AWS ECS (khác Task):
  → Dùng Load Balancer URL hoặc DNS
```

### 3. Browser Code vs Server Code

```
Server-side code (Node.js, PHP):
  → Chạy trong container
  → Container names hoạt động (same network)
  → Docker env vars hoạt động

Browser-side code (React, Vue, Angular):
  → Chạy trên máy của USER, không trong container
  → Container names KHÔNG hoạt động
  → Docker env vars KHÔNG inject vào đây
  → Dùng process.env.NODE_ENV (từ build tool)
```

### 4. Databases trong Production: Consider Managed Services

```
Self-managed MongoDB container:
  ✗ Scaling phức tạp
  ✗ Backup phải tự lo
  ✗ High availability khó setup
  ✗ Security phải tự cấu hình

MongoDB Atlas / AWS RDS (managed):
  ✓ Tự động scaling
  ✓ Backup tự động
  ✓ High availability built-in
  ✓ Security được lo
  ✓ Bạn chỉ cần connect string
```

### 5. Multi-Stage Builds cho Apps có Build Step

```
Frontend (React, Angular, Vue):
  Development: npm start → dev server
  Production: npm run build → static files + nginx serve

Dockerfile.prod:
  Stage 1: node → npm run build → /app/build/
  Stage 2: nginx → COPY /app/build → /usr/share/nginx/html
```

---

## Cheat Sheet: EC2 Deployment

```bash
# 1. Tạo EC2 Instance (AWS Console)
#    - Amazon Linux AMI, t2.micro (free tier)
#    - Download key pair (.pem)

# 2. Kết nối SSH
chmod 400 my-key.pem
ssh -i "my-key.pem" ec2-user@<PUBLIC_IP>

# 3. Cài Docker trên EC2
sudo yum update -y
sudo amazon-linux-extras install docker
sudo service docker start

# 4. Build + Push image (local machine)
docker build -t my-image .
docker tag my-image USERNAME/my-repo
docker login
docker push USERNAME/my-repo

# 5. Run trên EC2
sudo docker run -d --rm -p 80:80 USERNAME/my-repo

# 6. Mở port trong Security Group (AWS Console)
#    Inbound: HTTP port 80 → Anywhere

# 7. Update: rebuild + push + pull + rerun
sudo docker pull USERNAME/my-repo
sudo docker stop <old-container>
sudo docker run -d --rm -p 80:80 USERNAME/my-repo
```

---

## Cheat Sheet: ECS Deployment

```
1. Push image đến Docker Hub
   docker build → docker tag → docker push

2. Tạo Cluster (ECS)
   Networking only → Create VPC

3. Tạo Task Definition
   FARGATE → Add Containers:
     - Image: Docker Hub repo name
     - Ports: container port (e.g. 80)
     - Env vars: key-value pairs
     - Command: production command (e.g. node,app.js)

4. Tạo Service
   Fargate → Task Definition → Number of tasks: 1
   VPC + Subnets + Auto-assign public IP
   (Optional) Load Balancer

5. Update: Create new Task revision → Update Service

6. Volumes: Add EFS volume → Mount vào container path

7. Multi-container cùng Task:
   - Chỉ 1 container được expose port ra ngoài
   - Giao tiếp nội bộ qua localhost
```

---

## Cheat Sheet: Multi-Stage Dockerfile

```dockerfile
# Dockerfile.prod

# Stage 1: Build
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build         # tạo /app/build/

# Stage 2: Production
FROM nginx:stable-alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
# Build toàn bộ
docker build -f Dockerfile.prod -t my-app:prod .

# Build đến stage cụ thể
docker build -f Dockerfile.prod --target build -t my-app:build .
```

---

## Tổng Kết Phase 9

Bạn đã học:

1. **Dev vs Prod**: Không dùng bind mounts trong production; dùng COPY
2. **EC2 DIY**: SSH → install Docker → push/pull → run; tự quản lý security
3. **AWS ECS**: Cluster/Task/Service/Container với Fargate (serverless)
4. **Container names**: Chỉ hoạt động local; trong ECS dùng `localhost` (cùng task)
5. **Load Balancer**: Stable domain không thay đổi khi deploy
6. **EFS Volumes**: Persistent storage cho ECS containers
7. **MongoDB Atlas**: Managed database thay thế self-hosted container
8. **Multi-Stage Builds**: Build step + production server trong 1 Dockerfile
9. **Browser vs Server code**: React code chạy trong browser → không dùng container names
10. **Trade-offs**: Control & responsibility vs ease-of-use

---

**Tiếp theo:** Phase 10 — Docker Summary →

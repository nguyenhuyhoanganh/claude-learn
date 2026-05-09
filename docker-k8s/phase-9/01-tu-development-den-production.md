# Bài 1: Từ Development đến Production

## Tại sao cần một bài học riêng về Deployment?

Containers giải quyết vấn đề "works on my machine" — môi trường bên trong container giống nhau ở mọi nơi Docker chạy. Nhưng việc **di chuyển container từ máy local lên server thật** vẫn có những điểm cần chú ý.

```
Development:
  Laptop → Docker → Container chạy local
  → Bạn test trên localhost

Production:
  Remote Server → Docker → Container chạy trên server
  → Users trên toàn thế giới truy cập
```

---

## Sự Khác Biệt Chính: Development vs Production

### 1. Bind Mounts — KHÔNG dùng trong Production

```
Development:
  Container có source code từ bind mount
  → ./src trên laptop → /app trong container
  → Live reload, thay đổi code ngay lập tức

Production:
  Container phải tự đủ (self-contained)
  → Không có ./src trên server
  → Dùng COPY trong Dockerfile
```

**Nguyên tắc:** Image = single source of truth. Mọi thứ container cần phải nằm trong image.

### 2. Build Step (React và các framework tương tự)

```
Development:
  Chạy dev server → Hot reload
  Code chưa được optimize

Production:
  npm run build → Static files đã optimize
  Nginx serve static files
```

### 3. Multi-Container: Có thể split qua nhiều hosts

```
Development (Docker Compose trên 1 máy):
  frontend + backend + database → cùng 1 laptop
  → Docker Compose xử lý network tự động

Production (nhiều machines):
  frontend → Server A
  backend  → Server B (hoặc container service)
  database → Managed database service
  → Phức tạp hơn về networking
```

---

## Bind Mounts trong Production — Tại Sao Không?

```
Vấn đề nếu dùng bind mount trong production:

  1. Mount path phụ thuộc vào host machine
     -v ./src:/app → ./src phải tồn tại trên server
     
  2. Source code phải có sẵn trên server
     → Phải copy code lên server trước
     → Phải đảm bảo đúng folder structure
     
  3. Nếu server có 5 instance (scaling):
     → Phải copy code lên cả 5 servers
     → Khó quản lý, dễ không đồng bộ
     
  4. Mất đi ưu điểm chính của Docker:
     → Container không còn tự đủ
     → Phụ thuộc vào cấu trúc folder của host
```

**Giải pháp đúng:**

```dockerfile
# Dockerfile — dùng COPY, không có bind mount
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .             ← Code được bake vào image
CMD ["node", "server.js"]
```

```bash
# Development: thêm bind mount qua docker run hoặc compose
docker run -v $(pwd)/src:/app/src my-image

# Production: không có -v → dùng COPY trong image
docker run my-image
```

---

## Trade-offs trong Deployment

| | DIY (EC2) | Managed Service (ECS) |
|---|---|---|
| Control | Toàn quyền | Hạn chế bởi service |
| Responsibility | Bạn quản lý tất cả | Provider quản lý |
| Security | Bạn phải tự lo | Provider lo |
| Complexity | Cao | Thấp hơn |
| Scaling | Manual | Auto (có cấu hình) |
| Cost | Trả cho server chạy 24/7 | Trả cho thực tế dùng |

---

## Tổng quan Module Deployment

```
Bài 2: EC2 (DIY)
  → Remote server, SSH, install Docker
  → Push/pull image, run container
  → Security groups

Bài 3: AWS ECS (Managed)
  → Cluster/Task/Service/Container
  → Fargate (serverless containers)

Bài 4: Multi-Container + Databases
  → localhost vs container names trong ECS
  → EFS Volumes
  → MongoDB Atlas (managed DB)

Bài 5: Multi-Stage Builds
  → Build stage + Production stage
  → React production deployment

Bài 6: Tổng kết
```

---

**Tiếp theo:** Deploy với EC2 — Self-Managed Approach →

# Bài 1: Từ Development đến Production

## Tại sao cần một bài học riêng về Deployment?

Containers giải quyết vấn đề "works on my machine" — môi trường bên trong container giống nhau ở mọi nơi Docker chạy. Nhưng việc **di chuyển container từ máy local lên server thật** vẫn có những điểm cần chú ý.

```text
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

```text
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

```text
Development:
  Chạy dev server → Hot reload
  Code chưa được optimize

Production:
  npm run build → Static files đã optimize
  Nginx serve static files
```

### 3. Multi-Container: Có thể split qua nhiều hosts

```text
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

```text
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

```text
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

## Danh sách kiểm tra trước khi đưa image lên production

Đây là bảng rà nhanh, mỗi dòng đều dẫn tới bài giải thích chi tiết:

| Mục | Kiểm tra | Chi tiết |
|---|---|---|
| Không có bind mount trong `docker-compose.prod.yml` | `grep -n "\.:/" docker-compose.prod.yml` | Bài này |
| Code được `COPY` vào image | Đọc Dockerfile | Bài này |
| Ghim tag cụ thể, không dùng `latest` | `grep FROM Dockerfile` | [Phase 2 bài 4](../phase-2/04-naming-tagging-va-chia-se-images.md) |
| `CMD` viết dạng mảng | `grep CMD Dockerfile` | [Phase 2 bài 5](../phase-2/05-dockerfile-best-practices.md) |
| Chạy bằng non-root | `docker inspect --format '{{.Config.User}}'` | [Phase 19 bài 1](../phase-19/01-bao-mat-image.md) |
| Không có bí mật trong image | `docker history --no-trunc \| grep -i -E "pass\|token\|key"` | [Phase 3 bài 4](../phase-3/04-env-variables-va-build-args.md) |
| Có `.dockerignore` | `cat .dockerignore` | [Phase 2 bài 5](../phase-2/05-dockerfile-best-practices.md) |
| Dữ liệu cần giữ nằm ở volume hoặc dịch vụ ngoài | Đọc compose file | [Phase 3](../phase-3/05-volumes-tong-ket-va-patterns.md) |
| Ứng dụng ghi log ra **stdout** | `docker logs <container>` có nội dung | [Phase 20 bài 1](../phase-20/01-log-va-event.md) |
| Ứng dụng chịu được database khởi động lại | Đọc code kết nối | [Phase 5 bài 3](../phase-5/03-ket-noi-containers-voi-networks.md) |

Hai dòng cuối là thứ hay bị bỏ sót nhất, và cả hai đều chỉ lộ ra khi đã ở production.

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng chung một `docker-compose.yml` cho cả dev và production | Bind mount đi theo lên production → server phải có sẵn mã nguồn |
| Đưa `NODE_ENV=development` lên production | Thư viện dev bị cài, log chi tiết quá mức, hiệu năng kém |
| Quên bước build của frontend | Đẩy mã nguồn React lên thay vì file tĩnh đã build |
| Tự chạy database trong container ở production mà không có volume và sao lưu | Mất dữ liệu ở lần deploy tiếp theo |
| Đặt mật khẩu database trong `docker-compose.yml` rồi commit | Lộ bí mật vĩnh viễn |
| Publish cổng database ra ngoài | Database phơi ra Internet |
| Không có giới hạn tài nguyên | Một container rò rỉ bộ nhớ làm sập cả máy chủ |
| Không có chiến lược khởi động lại | Container chết là dịch vụ chết luôn — thêm `restart: unless-stopped` |

---

## Tóm tắt bài 1

- Ba khác biệt cốt lõi giữa dev và production: **không dùng bind mount**, **phải có bước build cho frontend**, và **các container có thể nằm trên nhiều máy chủ khác nhau**.
- Bind mount ở production **phá bỏ chính lý do dùng Docker** — image lẽ ra phải chứa đủ mọi thứ để chạy.
- Nên tách **`docker-compose.yml`** (dev) và **`docker-compose.prod.yml`** (production) thay vì dùng chung một file.
- Danh sách kiểm tra 10 mục ở trên nên chạy trước **mỗi lần** đưa image mới lên production.
- Hai thứ hay bị bỏ sót nhất: **ứng dụng ghi log ra stdout** và **ứng dụng chịu được database khởi động lại** — cả hai chỉ lộ ra khi đã ở production.

---

**Bài kế tiếp** → [Bài 2: Deploy với EC2 — DIY Approach](02-deploy-voi-ec2.md)

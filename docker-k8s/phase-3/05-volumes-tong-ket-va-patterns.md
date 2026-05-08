# Bài 5: Tổng kết Volumes & Storage Patterns

## Bảng so sánh toàn diện

| | Container Layer | Anonymous Volume | Named Volume | Bind Mount |
|---|---|---|---|---|
| Khai báo | Mặc định | `VOLUME` hoặc `-v /path` | `-v name:/path` | `-v /host:/container` |
| Quản lý bởi | Docker | Docker | Docker | Bạn |
| Vị trí | Container filesystem | `/var/lib/docker/volumes/` | `/var/lib/docker/volumes/` | Bất kỳ path host |
| Persist khi rm | ❌ Mất | Phụ thuộc | ✅ Còn | ✅ Còn |
| Truy cập từ host | Không | Khó | Khó | Trực tiếp |
| Dùng cho | Temp data | Protect subdirs | Production data | Development |

---

## Pattern 1: Production Web App

```bash
docker run -d \
  --name webapp \
  -p 80:80 \
  -v user_uploads:/app/uploads \      # Named volume — user files
  -v app_logs:/app/logs \             # Named volume — log files
  -e NODE_ENV=production \
  -e DB_URL=postgres://db/myapp \
  webapp:latest
```

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
EXPOSE 80
CMD ["node", "server.js"]
```

---

## Pattern 2: Development Workflow

```bash
docker run -d \
  --name webapp-dev \
  -p 3000:80 \
  -v $(pwd):/app \                    # Bind mount — code sync
  -v /app/node_modules \              # Anonymous — protect deps
  -e NODE_ENV=development \
  --env-file .env.development \
  webapp-dev
```

```dockerfile
# Dockerfile.dev
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install                        # Cài cả devDependencies
COPY . .
ENV NODE_ENV=development
EXPOSE 80
CMD ["npm", "run", "dev"]              # nodemon
```

---

## Pattern 3: Database Container

```bash
# PostgreSQL với named volume để persist data
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=mypassword \
  -e POSTGRES_DB=myapp \
  -v pgdata:/var/lib/postgresql/data \  # Named volume — DB files
  -p 5432:5432 \
  postgres:15-alpine
```

---

## Pattern 4: Share Data giữa Containers

```bash
# Container 1: App ghi data
docker run -d \
  --name app \
  -v shared_data:/app/data \
  myapp

# Container 2: Worker đọc data
docker run -d \
  --name worker \
  -v shared_data:/worker/input \
  myworker
```

---

## Quản lý Volumes — Lệnh CLI đầy đủ

```bash
# Tạo volume thủ công
docker volume create myvolume

# Liệt kê volumes
docker volume ls

# Chi tiết volume
docker volume inspect myvolume
# Cho biết: Mountpoint, Labels, Scope...

# Xóa volume cụ thể (container phải không dùng)
docker volume rm myvolume

# Xóa tất cả volumes không dùng
docker volume prune

# Xóa volume kèm khi xóa container
docker rm -v mycontainer     # -v xóa anonymous volumes gắn với container
```

---

## .dockerignore — Bảo vệ và Tối ưu

`.dockerignore` loại bỏ files khỏi **build context** (không copy vào image):

```
# .dockerignore
node_modules/           # Deps — cài trong container
.git/                   # Git history
.env                    # Secrets
.env.*                  # Tất cả .env files
*.log                   # Log files
dist/                   # Build output (nếu build trong container)
coverage/               # Test coverage
.nyc_output/
.DS_Store               # macOS
Thumbs.db               # Windows
docker-compose*.yml     # Không cần trong image
Dockerfile*             # Không cần copy Dockerfile vào image
README.md
CHANGELOG.md
tests/
```

**Lợi ích:**
1. **Build nhanh hơn**: Giảm size build context được gửi đến Docker daemon
2. **Image nhỏ hơn**: Không copy files thừa
3. **Bảo mật**: Không leak secrets vào image

---

## COPY vs Bind Mount — Khi nào dùng gì?

| | COPY trong Dockerfile | Bind Mount |
|---|---|---|
| Code trong image | Có (snapshot) | Không (read từ host) |
| Thay đổi code | Cần rebuild | Ngay lập tức |
| Portable | Có (chia sẻ được image) | Không (phụ thuộc host path) |
| Production | ✅ Dùng COPY | ❌ Không dùng |
| Development | ❌ Chậm (rebuild) | ✅ Dùng Bind Mount |

```
Production flow:
Code → docker build → Image (code baked in) → docker run

Development flow:
Code (live) ←→ Bind Mount ←→ Container (không có COPY)
               (sync realtime)
```

---

## Checklist Storage quyết định

```
1. Data này có cần persist không?
   NO  → Container layer (mặc định, không cần gì thêm)
   YES → Volumes hoặc Bind Mount

2. Môi trường production hay development?
   Production → Named Volume
   Development → Bind Mount (code), Named Volume (data)

3. Data này có cần share giữa nhiều containers?
   YES → Named Volume (một volume, nhiều containers mount)
   NO  → Named Volume hoặc Bind Mount tùy case

4. Cần truy cập trực tiếp từ host IDE/tools?
   YES → Bind Mount
   NO  → Named Volume

5. Có thư mục con cần bảo vệ (như node_modules)?
   YES → Anonymous Volume cho thư mục đó
```

---

## Tổng kết Phase 3

Bạn đã học:

1. **Ba loại data**: Application (image), Temporary (container layer), Permanent (volumes)
2. **Anonymous Volumes**: Docker quản lý, tên random, dùng chủ yếu để protect subdirs
3. **Named Volumes**: Docker quản lý, tên đặt sẵn, persist sau container rm, dùng cho production data
4. **Bind Mounts**: Bạn quản lý, map host path, sync two-way, dùng cho development
5. **ENV và ARG**: Biến môi trường (runtime config) và build arguments (build-time config)
6. **.dockerignore**: Loại bỏ files không cần thiết khỏi image
7. **Storage patterns**: Production, development, database, shared data

---

**Tiếp theo:** Phase 4 — Networking trong Docker (Container-to-Container, Container-to-Internet) →

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

```text
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

```text
Production flow:
Code → docker build → Image (code baked in) → docker run

Development flow:
Code (live) ←→ Bind Mount ←→ Container (không có COPY)
               (sync realtime)
```

---

## Checklist Storage quyết định

```text
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

## Cây quyết định: dữ liệu này để ở đâu

```text
   Dữ liệu này là gì?
        │
        ├─ Code, thư viện, tài nguyên tĩnh
        │     → COPY vào IMAGE
        │       (bất biến, đi cùng phiên bản)
        │
        ├─ File tạm, cache trong một phiên chạy
        │     → LỚP CONTAINER, không cần làm gì
        │       (mất cũng không sao)
        │
        ├─ Dữ liệu người dùng, database, file tải lên
        │     → NAMED VOLUME
        │       (sống sót qua docker rm)
        │
        ├─ Code đang sửa, muốn thấy đổi ngay khi dev
        │     → BIND MOUNT
        │       (chỉ dùng ở dev, KHÔNG ở production)
        │
        ├─ Thư mục cần CHE khỏi bind mount (node_modules)
        │     → ANONYMOUS VOLUME
        │
        └─ Cấu hình, mật khẩu
              → BIẾN MÔI TRƯỜNG lúc chạy, hoặc kho bí mật
                (KHÔNG bao giờ nhét vào image)
```

Ba câu hỏi để tự kiểm tra một thiết kế lưu trữ:

| Câu hỏi | Nếu trả lời sai |
|---|---|
| Xoá container rồi tạo lại, còn dữ liệu không? | Thiếu volume cho dữ liệu quan trọng |
| Chuyển sang máy chủ khác, chạy được ngay không? | Đang phụ thuộc bind mount hoặc trạng thái cục bộ |
| Có bí mật nào nằm trong image không? | `docker history` và `docker inspect` sẽ cho câu trả lời |

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Dùng bind mount ở production | Máy chủ phải có sẵn đúng thư mục code — image mất hết ý nghĩa |
| Chạy database production trong container mà không có volume | Mất toàn bộ dữ liệu ở lần deploy tiếp theo |
| `docker system prune --volumes` để dọn đĩa | **Xoá sạch dữ liệu** trong volume không có container gắn |
| Gắn volume đè lên thư mục chứa code của image | Docker chỉ chép dữ liệu image vào volume ở **lần đầu** — sau đó file mới thêm vào image không bao giờ xuất hiện |
| Không sao lưu volume | Máy hỏng là mất hết; volume không tự sao lưu |
| Để bí mật trong `ENV` hoặc `ARG` | Nằm vĩnh viễn trong image |
| Quên `.dockerignore` | `.env`, `.git`, `node_modules` vào thẳng image |
| Nhiều container cùng ghi vào một volume | Hỏng dữ liệu, đặc biệt với database |

---

## Tóm tắt Phase 3

- **Container không giữ dữ liệu.** `docker stop` thì còn, **`docker rm` thì mất** — và ở production, xoá rồi tạo lại container là chuyện hằng ngày.
- Ba nơi chứa dữ liệu, ba mục đích khác nhau: **image** (code, bất biến), **lớp container** (tạm, mất cũng được), **volume/bind mount** (cần giữ).
- **Named volume** cho dữ liệu production. **Bind mount** cho dev. **Anonymous volume** chủ yếu để **che thư mục** khỏi bị bind mount đè (`node_modules`).
- Quy tắc đè: **đường dẫn dài hơn thắng**. Đó là toàn bộ cơ chế của mẹo `node_modules`.
- Bind mount trên `docker run` **bắt buộc đường dẫn tuyệt đối** (Compose thì không). Trên Linux còn sinh file thuộc `root` — chữa bằng `-u $(id -u):$(id -g)`.
- **Volume không có lệnh sao lưu.** Cách chuẩn: gắn vào container tạm rồi `tar`.
- **`docker volume prune` và `docker system prune --volumes` xoá dữ liệu thật, không hoàn tác được.**
- **`ARG` và `ENV` đều không giữ được bí mật** — dùng BuildKit secret mount lúc build, biến môi trường lúc chạy, và kho bí mật ở production.

---

**Phase kế tiếp** → [Bài 1: Ba loại giao tiếp trong Dockerized App](../phase-4/01-ba-loai-giao-tiep-trong-docker.md)

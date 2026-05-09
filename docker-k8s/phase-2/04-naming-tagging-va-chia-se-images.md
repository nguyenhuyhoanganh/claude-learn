# Bài 4: Đặt tên, Tag và Chia sẻ Images

## Naming Containers

Mặc định Docker tự tạo tên ngẫu nhiên cho container (ví dụ: `eloquent_brown`, `happy_tesla`). Bạn có thể đặt tên riêng:

```bash
# Đặt tên khi run
docker run -d --rm --name goalsapp -p 3000:80 my-node-app

# Bây giờ có thể dùng tên thay vì ID
docker stop goalsapp
docker logs goalsapp
docker exec -it goalsapp /bin/sh
```

> Tên container phải **unique** — không thể có 2 containers cùng tên đang tồn tại.

---

## Image Tags — Hệ thống đặt tên cho Images

### Cấu trúc tên image

```
name:tag
────┬──── ────┬────
   │          │
   │          └── Phiên bản / biến thể cụ thể (optional)
   └──────────── Tên nhóm image (repository name)
```

**Ví dụ:**
```
node          → tên là "node", tag mặc định là "latest"
node:14       → node version 14
node:18       → node version 18
node:18-slim  → node 18, phiên bản slim (nhỏ gọn hơn)
node:alpine   → node dùng Alpine Linux (rất nhỏ)

nginx:latest  → nginx mới nhất
nginx:1.24    → nginx version 1.24
```

### Tags quan trọng cần biết

| Tag | Ý nghĩa |
|---|---|
| `latest` | Mới nhất (mặc định nếu không chỉ tag) |
| `<version>` | Phiên bản cụ thể, ví dụ `node:18` |
| `alpine` | Dựa trên Alpine Linux, rất nhỏ (~5MB base) |
| `slim` | Bản tinh gọn, bỏ bớt tools không cần |
| `buster`, `bullseye` | Dựa trên Debian (ổn định, tương thích tốt) |

**Nên dùng tag cụ thể trong production:**
```dockerfile
# ❌ Tránh — sẽ tự động upgrade, có thể gây breaking changes
FROM node:latest

# ✅ Tốt — version cố định, reproducible
FROM node:18.17.0-alpine3.18
```

---

## Đặt Tag khi Build Image

```bash
# Cú pháp: docker build -t <name>:<tag> <build_context>
docker build -t goals:latest .
docker build -t goals:1.0 .
docker build -t myusername/goals:latest .
```

```bash
# Xem images với tags
docker images
# REPOSITORY    TAG      IMAGE ID       CREATED         SIZE
# goals         latest   abc123def456   2 minutes ago   950MB
# goals         1.0      abc123def456   2 minutes ago   950MB
# node          18       xyz789abc123   3 days ago      910MB
```

---

## Retag Image đã có

```bash
# Tạo alias mới cho image đã có (không xóa image cũ)
docker tag source_image:tag new_image:tag

# Ví dụ: tạo tên phù hợp với Docker Hub
docker tag goals:latest myusername/goals:latest

# Sau đó docker images sẽ có cả hai
```

---

## Xóa Images

```bash
# Xóa một image (không thể xóa nếu còn container dùng nó)
docker rmi <image_id_or_name>
docker rmi goals:latest

# Xóa nhiều images cùng lúc
docker rmi image1 image2 image3

# Xóa tất cả images không dùng (không có container nào reference)
docker image prune

# Xóa kể cả images được tag nhưng không có container nào chạy
docker image prune -a
```

---

## Inspect Image

```bash
# Xem thông tin chi tiết về image
docker image inspect <image_id_or_name>
```

Output JSON chứa:
- `Id`: Full image ID
- `Created`: Thời điểm tạo
- `Config.ExposedPorts`: Ports được khai báo
- `Config.Env`: Environment variables
- `Config.Cmd`: CMD instruction
- `Os`: Hệ điều hành
- `RootFS.Layers`: Danh sách tất cả layers (hash)

---

## Chia sẻ Images — Hai cách

### Cách 1: Chia sẻ Dockerfile + Source Code

```
[Người chia sẻ]                    [Người nhận]
Dockerfile + source code ──▶ Build image ──▶ Run container
```

- Người nhận phải build image
- Cần có source code đầy đủ
- Build time có thể lâu
- Phù hợp cho: open source, học tập

### Cách 2: Chia sẻ Built Image (qua Registry)

```
[Người chia sẻ]                    [Người nhận]
docker push ──▶ Registry ──▶ docker pull ──▶ docker run
```

- Người nhận chỉ cần pull và run
- Không cần source code
- **Đây là cách phổ biến trong thực tế**

---

## Docker Hub — Push và Pull

### Đăng nhập

```bash
# Đăng nhập Docker Hub (chỉ cần làm một lần)
docker login
# Username: your_dockerhub_username
# Password: your_password

# Đăng xuất
docker logout
```

### Push Image lên Docker Hub

```bash
# Bước 1: Image phải có tên theo format: <username>/<repository>:<tag>
docker build -t myusername/my-node-app:latest .
# HOẶC retag image đã có
docker tag my-node-app:latest myusername/my-node-app:latest

# Bước 2: Push lên Hub
docker push myusername/my-node-app:latest
```

Docker Hub sẽ chỉ upload các layers **chưa có trên Hub**. Nếu bạn dùng `FROM node:18`, layer của node image không cần upload vì đã có sẵn.

### Pull và Run Image

```bash
# Pull image về local
docker pull myusername/my-node-app:latest

# Hoặc docker run tự động pull nếu chưa có local
docker run -p 3000:80 myusername/my-node-app

# Public image: ai cũng pull được không cần login
# Private image: chỉ user có quyền mới pull được
```

### Lưu ý quan trọng về Auto-pull

```bash
# docker run tự động pull nếu image không có local
docker run myusername/my-node-app   # ✓ Tự pull

# Nhưng KHÔNG tự kiểm tra version mới hơn!
# Nếu bạn push bản mới lên Hub, cần pull thủ công:
docker pull myusername/my-node-app  # Lấy bản mới nhất
docker run myusername/my-node-app   # Chạy bản mới
```

---

## Private Registry

Ngoài Docker Hub, còn có nhiều registry khác:
- **AWS ECR** (Elastic Container Registry)
- **Google Container Registry (GCR)**
- **Azure Container Registry (ACR)**
- **GitHub Container Registry (GHCR)**
- **Self-hosted** (Harbor, Nexus...)

Khi dùng private registry, prefix URL vào tên image:

```bash
# Push lên AWS ECR
docker tag my-app:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/my-app:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/my-app:latest

# Pull từ private registry
docker pull 123456789.dkr.ecr.us-east-1.amazonaws.com/my-app:latest
```

---

## Cheat Sheet — Tất cả lệnh Image Management

```bash
# Build
docker build -t <name>:<tag> .           # Build image
docker build -t <name>:<tag> -f <file> . # Chỉ định Dockerfile khác

# Tag
docker tag <src>:<tag> <new_name>:<new_tag>  # Retag image

# List & Inspect
docker images                             # Liệt kê images
docker image inspect <name>              # Chi tiết image

# Remove
docker rmi <image>                        # Xóa image
docker image prune                        # Xóa unused images
docker image prune -a                     # Xóa tất cả kể cả tagged

# Share
docker login                              # Đăng nhập Hub
docker push <username>/<name>:<tag>       # Push lên Hub
docker pull <username>/<name>:<tag>       # Pull từ Hub
docker logout                             # Đăng xuất
```

---

## Tóm tắt

- Container: dùng `--name` khi run để dễ quản lý
- Image: dùng `-t name:tag` khi build để có tên rõ ràng
- Tags gồm 2 phần: `name:tag` — name là nhóm, tag là phiên bản cụ thể
- Luôn dùng **tag cụ thể** (không phải `latest`) trong production
- Chia sẻ image qua Docker Hub: push với `username/image:tag`
- `docker run` tự pull nếu chưa có local, nhưng không tự check update

---

**Tiếp theo:** Phase 3 — Quản lý Data với Volumes →

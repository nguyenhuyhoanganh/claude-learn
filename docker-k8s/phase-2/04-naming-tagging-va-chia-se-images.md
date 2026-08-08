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

```text
name:tag
────┬──── ────┬────
   │          │
   │          └── Phiên bản / biến thể cụ thể (optional)
   └──────────── Tên nhóm image (repository name)
```

**Ví dụ:**
```text
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

### Hiểu đúng về `latest` — nó KHÔNG có nghĩa là "mới nhất"

Đây là hiểu nhầm phổ biến nhất trong toàn bộ Docker, và tên gọi chính là thủ phạm.

```text
   Người ta TƯỞNG:  latest = phiên bản mới nhất, Docker tự biết
   SỰ THẬT:         latest chỉ là MỘT CÁI TÊN TAG, không hơn không kém

   Nó chỉ là tag MẶC ĐỊNH khi bạn không ghi tag nào:
        docker build -t myapp .     ==  docker build -t myapp:latest .
        docker pull nginx           ==  docker pull nginx:latest
```

Hệ quả: **`latest` hoàn toàn có thể là bản CŨ.**

```bash
docker build -t myapp:v2 .        # build bản mới, gắn tag v2
# Không ai gắn lại tag latest → latest vẫn trỏ vào bản v1 từ tháng trước
docker run myapp                  # chạy v1, tưởng đang chạy v2
```

Hai vấn đề thật ở production:

**Một — không tái lập được.** Cùng một `Dockerfile` với `FROM node:18`, build hôm nay và build tháng sau cho ra **hai image khác nhau**, vì tag `18` được đẩy đè khi Node phát hành bản vá.

```text
   Tháng 1:  node:18  →  18.17.0
   Tháng 6:  node:18  →  18.20.4     ← cùng tag, image KHÁC
```

**Hai — không biết mình đang chạy gì.** Khi có sự cố, câu hỏi đầu tiên là *"bản nào đang chạy?"*. Nếu mọi thứ đều là `latest`, không ai trả lời được.

Ba mức ghim phiên bản, chọn theo mức độ nghiêm túc:

| Mức | Cách viết | Tái lập được | Nhận bản vá bảo mật |
|---|---|---|---|
| Yếu | `FROM node:latest` | **Không** | Có, nhưng bất ngờ |
| Trung bình | `FROM node:18` | Không | Có, tự động |
| **Tốt** | `FROM node:18.20.4-alpine3.20` | **Gần như có** | Phải cập nhật tay |
| **Mạnh nhất** | `FROM node:18.20.4-alpine3.20@sha256:f2dc6e...` | **Tuyệt đối** | Phải cập nhật tay |

`@sha256:...` là **mã băm nội dung** — nó không thể trỏ tới thứ khác, kể cả khi tag bị đẩy đè. Dùng công cụ như Renovate hoặc Dependabot để tự tạo pull request cập nhật mã băm, giữ được cả tính tái lập lẫn tính cập nhật.

### Quy ước đặt tag hay dùng ở production

```bash
# Gắn NHIỀU tag cho cùng một image
docker build \
  -t myregistry.io/myapp:1.4.2 \
  -t myregistry.io/myapp:1.4 \
  -t myregistry.io/myapp:$(git rev-parse --short HEAD) \
  -t myregistry.io/myapp:latest \
  .
```

```text
   1.4.2        ← phiên bản chính xác, KHÔNG BAO GIỜ đẩy đè
   1.4          ← trỏ tới bản vá mới nhất của nhánh 1.4
   a3f2b8c      ← mã commit Git, truy được về đúng dòng code
   latest       ← tiện cho dev, KHÔNG dùng ở production
```

Tag theo **mã commit Git** đáng giá nhất khi có sự cố: nhìn tag là biết chính xác code nào đang chạy, không phải đoán.

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

```text
[Người chia sẻ]                    [Người nhận]
Dockerfile + source code ──▶ Build image ──▶ Run container
```

- Người nhận phải build image
- Cần có source code đầy đủ
- Build time có thể lâu
- Phù hợp cho: open source, học tập

### Cách 2: Chia sẻ Built Image (qua Registry)

```text
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

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách đúng |
|---|---|---|
| Tưởng `latest` là "bản mới nhất" | Chạy nhầm bản cũ mà không biết | `latest` chỉ là **tên tag mặc định**. Ghim phiên bản cụ thể |
| `docker tag` rồi tưởng đã tạo image mới | `docker images` thấy hai dòng nhưng dung lượng không tăng | Tag chỉ là **cái nhãn** trỏ vào **cùng một image ID** |
| `docker rmi myapp:v1` khi image còn tag khác | Chỉ gỡ nhãn, image vẫn còn | Muốn xoá thật thì gỡ hết tag, hoặc xoá theo image ID |
| Push mà quên tiền tố tài khoản | `denied: requested access to the resource is denied` | Tên phải là `<tài-khoản>/<image>:<tag>` |
| Tưởng `docker run` tự kiểm tra bản mới | Chạy mãi image cũ trên máy | `docker run` chỉ tải khi **chưa có**. Phải `docker pull` để cập nhật |
| Đẩy đè lên tag phiên bản đã phát hành (`1.4.2`) | Không ai tái lập được bản build cũ | Tag phiên bản là **bất biến**. Chỉ đẩy đè `latest` và tag nhánh |
| Để image có thông tin nhạy cảm rồi push lên registry công khai | Lộ vĩnh viễn | Kiểm tra `docker history` trước khi push; xem [Phase 19 bài 1](../phase-19/01-bao-mat-image.md) |
| Dùng `latest` trong Kubernetes manifest | Pod tạo lại có thể nhận image khác → khó chẩn đoán | Ghim tag cụ thể, và đặt `imagePullPolicy` phù hợp |

Hai dòng đầu đáng xem tận mắt:

```bash
docker tag myapp:v1 myapp:production
docker images | grep myapp
```

```text
REPOSITORY   TAG          IMAGE ID       CREATED        SIZE
myapp        production   a3f2b8c1d4e5   2 hours ago    142MB
myapp        v1           a3f2b8c1d4e5   2 hours ago    142MB
             ▲            ▲▲▲▲▲▲▲▲▲▲▲▲
        hai tag khác nhau  CÙNG MỘT IMAGE ID → chỉ tốn 142 MB, không phải 284 MB
```

```bash
docker rmi myapp:v1
```

```text
Untagged: myapp:v1
       ▲
   chỉ "gỡ nhãn", KHÔNG xoá image — vì tag production vẫn trỏ vào nó
```

---

## Tóm tắt bài 4

- Container: dùng `--name` khi run để dễ quản lý
- Image: dùng `-t name:tag` khi build để có tên rõ ràng
- Tags gồm 2 phần: `name:tag` — name là nhóm, tag là phiên bản cụ thể
- Luôn dùng **tag cụ thể** (không phải `latest`) trong production
- Chia sẻ image qua Docker Hub: push với `username/image:tag`
- `docker run` tự pull nếu chưa có local, nhưng không tự check update
- **`latest` không có nghĩa là "mới nhất"** — nó chỉ là **tên tag mặc định**, và hoàn toàn có thể trỏ vào bản cũ.
- Cùng một `FROM node:18` build ở hai thời điểm có thể cho **hai image khác nhau**. Muốn tái lập tuyệt đối thì ghim **`@sha256:...`**.
- **Tag chỉ là cái nhãn** — hai tag trỏ cùng image ID chỉ tốn dung lượng một lần, và `docker rmi` một tag chỉ **gỡ nhãn** chứ không xoá image.
- Quy ước production: gắn đồng thời `1.4.2` (bất biến), `1.4` (nhánh), **mã commit Git** (truy được về code), và `latest` (chỉ cho dev).

---

**Bài kế tiếp** → [Bài 5: Dockerfile Best Practices & Patterns](05-dockerfile-best-practices.md)

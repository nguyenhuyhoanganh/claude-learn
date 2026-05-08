# Bài 1: Images & Containers — Nền tảng cốt lõi

## Mô hình tổng quan

Docker xoay quanh hai khái niệm trung tâm: **Image** và **Container**. Hiểu rõ sự khác biệt và mối quan hệ giữa hai thứ này là nền tảng cho mọi thứ còn lại.

```
Image                          Container
─────────────────────          ─────────────────────
Template / Blueprint           Running instance
Chứa code + environment        Chạy code đó
Read-only, bất biến            Có thể ghi (extra layer)
Lưu trên disk                  Chạy trong memory
Không chạy gì cả               Là ứng dụng đang hoạt động
Chia sẻ được dễ dàng           Độc lập, cách ly
```

---

## Images — "Bản thiết kế"

Image là **template khép kín** chứa:
- Source code của ứng dụng
- Runtime cần thiết (Node.js, Python, PHP...)
- Libraries và dependencies
- Cấu hình môi trường
- Các instructions để setup

Image là **read-only** — khi đã build xong, nội dung bên trong không thể thay đổi. Nếu muốn cập nhật (ví dụ code mới), bạn phải **build lại image mới**.

### Hai nguồn để có image

**1. Pull từ Docker Hub (registry):**
```bash
docker pull node          # Pull image Node.js mới nhất
docker pull node:18       # Pull image Node.js version 18
docker pull nginx         # Pull image Nginx web server
```

**2. Build từ Dockerfile:**
```bash
docker build -t myapp .   # Build image từ Dockerfile trong thư mục hiện tại
```

---

## Containers — "Ngôi nhà đang có người ở"

Container là **running instance** được tạo từ một image. Container:
- Thêm một **layer ghi được** mỏng lên trên tất cả các layer của image
- Chạy code được định nghĩa bởi image
- **Cách ly** với các container khác và với host machine
- Có thể **start, stop, restart, xóa**

### Quan hệ Image → Container

```
Image: node:18
    │
    ├──▶ Container 1 (chạy app A trên port 3000)
    ├──▶ Container 2 (chạy app B trên port 3001)
    └──▶ Container 3 (testing environment)

Code trong image: tồn tại 1 lần
Code trong container: 3 containers dùng chung code từ image
```

> **Quan trọng:** Container không copy code từ image vào một file mới. Nhiều containers có thể **chia sẻ cùng một image** và đọc code từ đó. Điều này rất hiệu quả về mặt storage.

---

## Sử dụng Pre-Built Images từ Docker Hub

Docker Hub là registry công khai chứa hàng trăm nghìn images.

```bash
# Chạy container Node.js interactive
docker run node

# Nhưng bạn sẽ thấy container exit ngay — vì interactive shell
# không được expose ra ngoài theo mặc định
# Thêm -it để expose interactive terminal
docker run -it node
```

Khi `docker run node`:
1. Docker tìm image `node` trên local machine → không thấy
2. Tự động pull từ Docker Hub
3. Tạo container và chạy

```bash
# Kiểm tra container vừa tạo (kể cả đã stop)
docker ps -a
```

---

## Dockerfile — Bản hướng dẫn build Image

Mỗi dòng trong Dockerfile là một **instruction** để Docker thực hiện khi build image.

### Ví dụ Dockerfile hoàn chỉnh cho Node.js app

```dockerfile
# Bắt đầu từ image Node.js version 14 (official)
FROM node:14

# Đặt thư mục làm việc bên trong container
WORKDIR /app

# Copy package.json TRƯỚC để tận dụng layer caching
COPY package.json .

# Cài dependencies
RUN npm install

# Copy toàn bộ source code
COPY . .

# Khai báo port mà container sẽ lắng nghe (documentation only)
EXPOSE 80

# Lệnh thực thi khi container START (không phải khi BUILD)
CMD ["node", "server.js"]
```

### Bảng giải thích từng instruction

| Instruction | Khi nào chạy | Mục đích |
|---|---|---|
| `FROM` | Build time | Chỉ định base image |
| `WORKDIR` | Build time | Đặt thư mục làm việc |
| `COPY` | Build time | Copy file từ host vào image |
| `RUN` | Build time | Chạy lệnh trong quá trình build |
| `EXPOSE` | Documentation | Khai báo port (không mở port) |
| `CMD` | Container start | Lệnh chạy khi container được start |

### Sự khác biệt quan trọng: RUN vs CMD

```dockerfile
# RUN: chạy khi BUILD image (một lần duy nhất khi tạo image)
RUN npm install

# CMD: chạy khi START container (mỗi lần container khởi động)
CMD ["node", "server.js"]
```

---

## Build và Run

```bash
# Build image, đặt tên là "my-node-app"
docker build -t my-node-app .

# Chạy container với port mapping
# -p 3000:80 → localhost:3000 trỏ vào container port 80
docker run -p 3000:80 my-node-app

# Truy cập: http://localhost:3000
```

### Tại sao cần -p khi run?

Container có **network riêng biệt** với host. Dù `EXPOSE 80` trong Dockerfile, cổng đó chỉ mở bên trong container network, không tự động mở ra ngoài.

Flag `-p (publish)` tạo "cổng nối" từ host vào container:

```
localhost:3000  ──[-p 3000:80]──▶  container:80
```

---

## Tóm tắt

```
Docker Hub / Dockerfile
        │
        ▼
    docker build -t name .
        │
        ▼
      IMAGE (read-only template)
        │
        ├─── docker run -p host:container name ──▶ Container 1 (running)
        ├─── docker run -p host:container name ──▶ Container 2 (running)
        └─── docker run -p host:container name ──▶ Container 3 (running)
```

- Image = blueprint, bất biến, read-only
- Container = running instance, thêm write layer mỏng lên trên
- Nhiều containers chia sẻ cùng một image (không copy)
- `-p` bắt buộc phải có để truy cập container từ host

---

**Tiếp theo:** Hiểu Image Layers & Caching để tối ưu quá trình build →

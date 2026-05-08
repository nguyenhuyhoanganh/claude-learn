# Bài 5: Chạy Container Đầu Tiên

## Chuẩn bị

Trước khi bắt đầu, hãy đảm bảo:
1. Docker đã được cài đặt (xem bài 3)
2. Docker đang chạy (thấy icon Docker hoặc kiểm tra bằng `docker info`)

---

## Image và Container — Hai khái niệm cốt lõi

Trước khi chạy container, cần hiểu mối quan hệ giữa **Image** và **Container**:

```
Image                    Container
──────────               ──────────
"Bản thiết kế"           "Ngôi nhà thực tế"
File tĩnh, chỉ đọc       Đang chạy, có trạng thái
Lưu trên disk            Chạy trong memory
Dùng để tạo container    Tạo từ image
```

- **Image**: Là template chứa mọi thứ cần thiết (OS layer, runtime, code, config...)
- **Container**: Là instance đang chạy được tạo từ image

Một image có thể tạo ra **nhiều container** chạy đồng thời.

```
Image: node:18
    │
    ├──▶ Container 1 (chạy app A)
    ├──▶ Container 2 (chạy app B)
    └──▶ Container 3 (testing)
```

---

## Ví dụ thực tế: Dockerize ứng dụng Node.js

Giả sử chúng ta có ứng dụng Node.js đơn giản:

### app.mjs
```javascript
import express from 'express';
import { createConnection } from './db.mjs';

const app = express();

// Simulate DB connection (requires Node.js 14.3+ for top-level await)
await createConnection();

app.get('/', (req, res) => {
  res.send('<h1>Hi there!</h1>');
});

app.listen(3000);
```

### package.json
```json
{
  "name": "my-app",
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

**Không có Docker:** Phải cài Node.js 14.3+, chạy `npm install`, rồi `node app.mjs`

**Với Docker:** Chỉ cần Dockerfile và hai lệnh

---

## Dockerfile — Bản thiết kế của Image

**Dockerfile** là file văn bản mô tả cách build image. Mỗi dòng là một instruction.

```dockerfile
# Bắt đầu từ image Node.js official (Node 14 Alpine - nhỏ gọn)
FROM node:14

# Đặt thư mục làm việc bên trong container
WORKDIR /app

# Copy package.json vào container trước (để cache layer)
COPY package.json .

# Cài dependencies
RUN npm install

# Copy toàn bộ source code
COPY . .

# Khai báo port mà app sẽ lắng nghe
EXPOSE 3000

# Lệnh chạy khi container khởi động
CMD ["node", "app.mjs"]
```

### Giải thích từng instruction

| Instruction | Ý nghĩa |
|---|---|
| `FROM` | Base image để bắt đầu. Mọi Dockerfile đều phải có |
| `WORKDIR` | Đặt thư mục làm việc trong container |
| `COPY` | Copy file từ host vào container |
| `RUN` | Chạy lệnh trong quá trình **build** image |
| `EXPOSE` | Khai báo port (chỉ là documentation, không tự mở port) |
| `CMD` | Lệnh chạy khi **container khởi động** |

---

## Build Image

```bash
# Build image từ Dockerfile trong thư mục hiện tại
# -t: đặt tên (tag) cho image
docker build -t my-node-app .

# Output:
# [1/5] FROM node:14
# [2/5] WORKDIR /app
# [3/5] COPY package.json .
# [4/5] RUN npm install
# [5/5] COPY . .
# Successfully built abc123def456
# Successfully tagged my-node-app:latest
```

**Dấu `.` ở cuối** là build context — thư mục Docker sẽ dùng để tìm Dockerfile và các file cần copy.

---

## Chạy Container

```bash
# Chạy container từ image
# -p: map port host:container
# --name: đặt tên cho container
docker run -p 3000:3000 --name my-app my-node-app

# Truy cập: http://localhost:3000
```

### Giải thích `-p 3000:3000`

```
-p <host_port>:<container_port>
-p 3000:3000

localhost:3000 ──────▶ container_port:3000
```

Container có network riêng, không tự expose port ra ngoài. Flag `-p` tạo "cổng nối" từ máy host vào container.

Bạn có thể dùng port khác nhau:
```bash
# Truy cập qua localhost:8080, container dùng port 3000
docker run -p 8080:3000 my-node-app
```

---

## Quản lý Containers

```bash
# Xem containers đang chạy
docker ps

# Xem tất cả containers (kể cả đã dừng)
docker ps -a

# Dừng container (graceful shutdown)
docker stop my-app

# Xóa container (phải dừng trước)
docker rm my-app

# Dừng và xóa cùng lúc
docker rm -f my-app

# Chạy container ở background (detached mode)
docker run -d -p 3000:3000 --name my-app my-node-app
```

### Chế độ chạy: Attached vs Detached

```bash
# Attached (mặc định): container chạy ở foreground, ctrl+C để dừng
docker run my-node-app

# Detached (-d): container chạy ở background
docker run -d my-node-app
```

---

## Xem logs và tương tác với Container

```bash
# Xem logs của container
docker logs my-app

# Xem logs realtime (follow)
docker logs -f my-app

# Chạy lệnh trong container đang chạy
docker exec -it my-app /bin/sh

# Hoặc bash nếu có
docker exec -it my-app /bin/bash
```

**`-it` flag:** `-i` (interactive) + `-t` (tty) — mở terminal tương tác trong container

---

## Quản lý Images

```bash
# Xem tất cả images trên máy
docker images

# Xóa image
docker rmi my-node-app

# Xóa tất cả images không dùng
docker image prune

# Pull image từ Docker Hub
docker pull node:18
```

---

## Workflow thực tế

```
1. Viết code
        │
        ▼
2. Tạo/cập nhật Dockerfile
        │
        ▼
3. docker build -t myapp .
        │
        ▼
4. docker run -p 3000:3000 myapp
        │
        ▼
5. Test ứng dụng tại localhost:3000
        │
        ▼
6. Nếu cần sửa: quay lại bước 1
```

---

## Hello World với Docker

Test Docker cài thành công:

```bash
docker run hello-world
```

Output:
```
Hello from Docker!
This message shows that your installation appears to be working correctly.
...
```

Docker đã:
1. Pull image `hello-world` từ Docker Hub (vì chưa có trên máy)
2. Tạo container từ image đó
3. Chạy container — in ra thông báo
4. Container tự dừng sau khi xong

---

## Tóm tắt lệnh cơ bản

```bash
# Build
docker build -t <name> .

# Run
docker run -p <host>:<container> --name <name> <image>
docker run -d -p <host>:<container> <image>   # background

# Manage
docker ps            # containers đang chạy
docker ps -a         # tất cả containers
docker stop <name>   # dừng
docker rm <name>     # xóa
docker logs <name>   # xem logs

# Images
docker images        # liệt kê images
docker pull <image>  # tải từ Hub
docker rmi <image>   # xóa image
```

---

**Tiếp theo:** Học sâu hơn về Images & Containers — cách hoạt động, layered filesystem, và nhiều lệnh hơn →

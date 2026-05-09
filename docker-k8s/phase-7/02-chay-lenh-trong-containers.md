# Bài 2: Các Cách Chạy Lệnh trong Containers

## Cách 1: `docker exec` — Lệnh thêm trong container đang chạy

```bash
# Container đã đang chạy
docker run -d -it --name mynode node

# Chạy thêm lệnh trong container đó (không interrupt main process)
docker exec mynode npm --version

# Cần interactive mode cho lệnh cần input
docker exec -it mynode npm init
```

**`docker exec` dùng khi nào:**
- Debug: đọc logs, xem files trong container đang chạy
- Admin tasks: không muốn stop container chính

---

## Cách 2: Override Default Command — Thêm lệnh sau image name

Cú pháp:
```bash
docker run [OPTIONS] IMAGE [COMMAND]
#                           ↑
#                    Command này ghi đè CMD trong Dockerfile
```

### Ví dụ

```bash
# Image node — default command: chạy REPL (node interactive mode)
docker run -it node
# → Vào node REPL, gõ JavaScript

# Override: chạy npm init thay vì REPL
docker run -it node npm init
# → Chạy npm init, hỏi các câu hỏi, xong → dừng container

# Override với bind mount để kết quả xuất hiện trên host
docker run -it \
  -v $(pwd):/app \
  node npm init
# → package.json được tạo trong /app trong container
# → Bind mount → package.json xuất hiện trên host machine
```

### CMD bị ghi đè hoàn toàn

```
Dockerfile:  CMD ["node"]           ← Default: chạy node REPL
docker run node npm init            ← Override: chạy npm init
Kết quả:     node REPL bị bỏ qua, npm init chạy
```

---

## So sánh: `exec` vs Override

| | `docker exec` | Override CMD |
|---|---|---|
| Container state | Phải đang chạy | Khởi động mới |
| Main process | Vẫn chạy | Không có |
| Khi nào dùng | Debug container đang chạy | Utility task |

---

## Xây dựng Utility Image cơ bản

Dockerfile đơn giản nhất cho utility container:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Không có CMD — người dùng truyền lệnh khi run
```

```bash
# Build
docker build -t node-util .

# Run với bất kỳ lệnh nào
docker run -it -v $(pwd):/app node-util npm init
docker run -it -v $(pwd):/app node-util npm install express
docker run -it -v $(pwd):/app node-util node --version
```

**Linh hoạt nhưng thiếu giới hạn** — ai cũng có thể chạy bất kỳ lệnh gì, kể cả `rm -rf /app`.

→ Giải pháp: dùng `ENTRYPOINT` để giới hạn.

---

**Tiếp theo:** ENTRYPOINT và Bind Mounts →

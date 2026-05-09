# Bài 3: ENTRYPOINT và Bind Mounts

## ENTRYPOINT vs CMD

| | CMD | ENTRYPOINT |
|---|---|---|
| Khi override (thêm lệnh sau image name) | Bị **ghi đè hoàn toàn** | Lệnh mới **nối thêm vào sau** |
| Mục đích | Default command | Fixed prefix, append arguments |

### Ví dụ so sánh

**Với CMD:**
```dockerfile
CMD ["node"]
```
```bash
docker run myimage npm init
# → Chạy: npm init    (node bị bỏ qua)
```

**Với ENTRYPOINT:**
```dockerfile
ENTRYPOINT ["npm"]
```
```bash
docker run myimage init
# → Chạy: npm init   (npm từ ENTRYPOINT + init từ argument)

docker run myimage install express
# → Chạy: npm install express
```

---

## Xây dựng npm Utility Container với ENTRYPOINT

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

ENTRYPOINT ["npm"]
# Người dùng chỉ cần truyền npm sub-command: init, install, run...
```

### Build và sử dụng

```bash
# Build
docker build -t mynpm .

# Init project (thêm "init" sau image name → chạy "npm init")
docker run -it \
  -v $(pwd):/app \
  mynpm init

# Install dependency
docker run -it \
  -v $(pwd):/app \
  mynpm install express --save

# Cài devDependency
docker run \
  -v $(pwd):/app \
  mynpm install nodemon --save-dev

# Run script
docker run \
  -v $(pwd):/app \
  mynpm run start
```

**Lợi ích ENTRYPOINT:**
- Chỉ có thể chạy npm commands, không chạy được `rm -rf /app`
- Interface rõ ràng hơn: `docker run mynpm [npm-subcommand]`
- Giảm lỗi người dùng

---

## Bind Mounts — Chìa khóa của Utility Containers

Bind mount cho phép commands trong container **tác động lên host machine**:

```
Host: /home/user/project/
          ↕ Bind Mount
Container: /app/

Khi container chạy "npm init" trong /app/:
→ package.json được tạo trong /app/ (container)
→ /home/user/project/package.json xuất hiện (host)
```

### Cú pháp

```bash
# Absolute path (truyền thống)
docker run -it \
  -v /absolute/path/to/project:/app \
  mynpm init

# $(pwd) shortcut (Linux/macOS)
docker run -it \
  -v $(pwd):/app \
  mynpm init
```

### Toàn bộ workflow: Tạo Node project không cần cài Node

```bash
# 1. Tạo empty folder
mkdir my-new-project && cd my-new-project

# 2. Init project (không cần npm trên host)
docker run -it -v $(pwd):/app mynpm init
# → Trả lời câu hỏi → package.json xuất hiện

# 3. Cài express
docker run -v $(pwd):/app mynpm install express --save
# → node_modules/ và package-lock.json xuất hiện

# 4. Tạo file app.js thủ công (hoặc dùng editor)
# 5. Chạy app
docker run -v $(pwd):/app mynpm run start
```

**Không cần cài Node.js, npm hay bất kỳ gì trên host machine!**

---

## ENTRYPOINT kết hợp CMD

Có thể dùng cả hai để có default argument:

```dockerfile
ENTRYPOINT ["npm"]
CMD ["--help"]    # Default khi không truyền argument
```

```bash
docker run mynpm          # → npm --help
docker run mynpm init     # → npm init   (CMD bị override, ENTRYPOINT giữ nguyên)
docker run mynpm install  # → npm install
```

---

**Tiếp theo:** Sử dụng Utility Containers với Docker Compose →

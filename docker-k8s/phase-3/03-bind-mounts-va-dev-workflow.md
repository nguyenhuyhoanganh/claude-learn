# Bài 3: Bind Mounts & Development Workflow

## Bind Mount là gì?

Bind Mount **map một thư mục cụ thể trên host** vào bên trong container. Thay đổi ở host ngay lập tức có mặt trong container và ngược lại.

```
Host: /home/user/myapp/src/   ←──── hai chiều ────→  Container: /app/src/
     (bạn edit ở đây)                                  (container đọc từ đây)
```

---

## Tại sao Bind Mount là game-changer cho Development?

**Vấn đề với workflow không dùng Bind Mount:**

```
Sửa code → docker build → docker run → Test → Sửa code → docker build → ...
           (30-60 giây)                                   (30-60 giây)
```

**Với Bind Mount:**

```
docker run (1 lần) → Sửa code → Test ngay (0 giây delay) → Sửa code → Test ngay → ...
```

Code thay đổi được phản ánh ngay trong container vì container đọc trực tiếp từ host filesystem.

---

## Cú pháp Bind Mount

```bash
# -v <absolute_host_path>:<container_path>
docker run -v /absolute/path/on/host:/container/path myapp

# macOS/Linux — dùng $(pwd) để lấy thư mục hiện tại
docker run -v $(pwd):/app myapp

# Windows PowerShell
docker run -v ${PWD}:/app myapp

# Windows Command Prompt
docker run -v %cd%:/app myapp
```

---

## Ví dụ thực tế: Node.js Development Setup

### Dockerfile (không thay đổi so với production)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### Chạy container với Bind Mount

```bash
docker run -d \
  -p 3000:80 \
  --name myapp-dev \
  -v $(pwd):/app \                    # Bind mount source code
  -v /app/node_modules \              # Protect node_modules bằng anonymous volume
  myapp
```

**Giải thích:**
- `-v $(pwd):/app`: Mount thư mục project vào `/app` trong container
- `-v /app/node_modules`: Anonymous volume "bảo vệ" node_modules khỏi bị override

### Thứ tự ưu tiên (longer path wins)

```
/app           → từ bind mount (host directory)
/app/node_modules → từ anonymous volume (được bảo vệ)

Docker ưu tiên path dài hơn (specific hơn)
→ /app/node_modules không bị ghi đè bởi bind mount
```

---

## Nodemon — Hot Reload cho Node.js

Dù code thay đổi tức thì có mặt trong container, Node.js server vẫn phải restart để đọc code mới.

**Giải pháp: Nodemon** — tự động restart Node.js khi file thay đổi.

```bash
npm install nodemon --save-dev
```

### package.json

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
```

### Dockerfile cho Development

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install            # Cài cả devDependencies (nodemon)
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]  # Dùng nodemon cho dev
```

```bash
# Chạy dev container
docker run -d \
  -p 3000:80 \
  --name myapp-dev \
  -v $(pwd):/app \
  -v /app/node_modules \
  myapp-dev

# Giờ sửa code → nodemon tự restart Node.js → thấy thay đổi ngay!
```

---

## Read-Only Bind Mounts

Đôi khi bạn muốn container chỉ đọc code, không ghi lại:

```bash
# Thêm :ro (read-only) vào cuối
docker run -v $(pwd):/app:ro myapp

# Nếu container cố ghi vào /app → permission error
```

**Kết hợp read-only bind mount với named volume:**

```bash
docker run \
  -v $(pwd):/app:ro \              # Code: read-only
  -v /app/node_modules \           # node_modules: anonymous volume (writable)
  -v feedback:/app/feedback \      # Data: named volume (writable)
  myapp
```

---

## Docker Compose cho Development (Preview)

Thay vì gõ lệnh dài dòng, dùng `docker-compose.yml`:

```yaml
# docker-compose.yml
version: "3"
services:
  app:
    build: .
    ports:
      - "3000:80"
    volumes:
      - ./:/app          # bind mount
      - /app/node_modules   # anonymous volume
    environment:
      - NODE_ENV=development
```

```bash
docker-compose up
```

(Docker Compose sẽ được học chi tiết ở phase-6)

---

## So sánh: Bind Mount vs Named Volume

| | Bind Mount | Named Volume |
|---|---|---|
| Quản lý bởi | Bạn (filesystem host) | Docker |
| Vị trí | Path bạn chỉ định | `/var/lib/docker/volumes/` |
| Truy cập trực tiếp | Có (mở bằng IDE, Explorer) | Khó (cần container hoặc inspect) |
| Sync hai chiều | Có | Không (chỉ container ghi) |
| Use case chính | **Development** (hot reload) | **Production** (persist data) |
| Performance | Hơi chậm hơn trên macOS | Nhanh hơn |

---

## Workflow thực tế: Dev vs Production

### Development

```bash
# Dockerfile.dev
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install          # Cài cả devDependencies
CMD ["npm", "run", "dev"]  # nodemon

# Run
docker run -v $(pwd):/app -v /app/node_modules myapp-dev
```

### Production

```bash
# Dockerfile (default)
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "server.js"]

# Run
docker run -v feedback:/app/feedback myapp
```

---

## Tóm tắt

```
Bind Mount (-v /host/path:/container/path):
├── Host path → Container path (hai chiều)
├── Dùng $(pwd) để map thư mục project
├── Thêm :ro để read-only
├── Phải dùng anonymous volume để protect node_modules
└── IDEAL cho development, không dùng production

Kết hợp tối ưu cho dev:
docker run \
  -v $(pwd):/app \              # bind mount code
  -v /app/node_modules \        # protect node_modules
  -v feedback:/app/feedback \   # persist user data
  myapp
```

---

**Tiếp theo:** Environment Variables, .env files và Build Arguments →

# Bài 2: Dockerize Từng Service

## Service 1: MongoDB

MongoDB có **official image** trên Docker Hub, không cần Dockerfile.

```bash
# Bước 1: Chạy MongoDB container cơ bản
docker run -d \
  --name mongodb \
  --rm \
  mongo
```

### Publish port khi chưa Dockerize backend

Trong giai đoạn đầu, khi backend vẫn chạy trực tiếp trên host machine (chưa Dockerize), cần publish port để backend kết nối được:

```bash
# Publish port 27017 cho local backend kết nối
docker run -d \
  --name mongodb \
  --rm \
  -p 27017:27017 \
  mongo

# Backend code (chạy trên host) có thể connect:
mongoose.connect('mongodb://localhost:27017/swfavorites');
```

**Sau khi Dockerize backend**, không cần publish port nữa — dùng Docker Network.

---

## Service 2: Node.js Backend

Cần Dockerfile riêng cho custom app.

### Dockerfile (backend/)

```dockerfile
FROM node:18

WORKDIR /app

COPY package.json .

RUN npm install

COPY . .

EXPOSE 80

CMD ["node", "app.js"]
```

### Build và Run (giai đoạn đầu)

```bash
# Build image
docker build -t goals-node ./backend

# Run container
docker run -d \
  --name goals-backend \
  --rm \
  -p 80:80 \
  goals-node
```

### Vấn đề: localhost không hoạt động từ trong container

```javascript
// ❌ Fails khi chạy trong container
mongoose.connect('mongodb://localhost:27017/mydb');
// "localhost" trong container = bên trong chính container đó
// MongoDB không chạy ở đó!

// ✅ Khi MongoDB vẫn trên host machine
mongoose.connect('mongodb://host.docker.internal:27017/mydb');

// ✅ Khi MongoDB trong cùng Docker Network
mongoose.connect('mongodb://mongodb:27017/mydb');
// "mongodb" = tên container, Docker tự resolve IP
```

---

## Service 3: React Frontend

React cần Dockerfile riêng nhưng **không phải vì nó là Node app** — mà vì React project dùng Node để chạy dev server và build code.

### Dockerfile (frontend/)

```dockerfile
FROM node:18

WORKDIR /app

COPY package.json .

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### Vấn đề đặc biệt: React container tự dừng

```bash
# ❌ Container dừng ngay sau khi dev server khởi động
docker run -d \
  --name goals-frontend \
  -p 3000:3000 \
  goals-react

# Tại sao? React dev server mong đợi input (-i flag)
# Nếu không có input connection, nó tự tắt

# ✅ Giải pháp: chạy với -it (interactive + TTY)
docker run -it \
  --name goals-frontend \
  --rm \
  -p 3000:3000 \
  goals-react
```

### Vì sao React cần `-it`?

```
React dev server được thiết kế để chạy interactive:
- Nó lắng nghe keyboard input (Ctrl+C để dừng)
- Nếu không có input stream → nó tự assume "không ai quan tâm"
- → Tự tắt ngay lập tức

Docker -i: giữ STDIN mở
Docker -t: attach pseudo-TTY
→ React dev server "nghĩ" nó đang chạy interactively → tiếp tục chạy
```

---

## Kiểm tra ở giai đoạn này

Sau khi chạy cả 3 containers (với port publishing):

```bash
# Kiểm tra containers đang chạy
docker ps

# Kết quả mong đợi:
# CONTAINER ID   IMAGE        PORTS                  NAMES
# abc123         goals-react  0.0.0.0:3000->3000/tcp goals-frontend
# def456         goals-node   0.0.0.0:80->80/tcp     goals-backend
# ghi789         mongo        0.0.0.0:27017->27017   mongodb
```

Tất cả đang giao tiếp qua **localhost** (host machine). Bước tiếp theo là tối ưu bằng **Docker Networks** để containers giao tiếp trực tiếp với nhau.

---

**Tiếp theo:** Kết nối containers với Docker Networks →

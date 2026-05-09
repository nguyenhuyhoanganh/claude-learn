# Bài 5: Tổng kết Multi-Container Applications

## Toàn bộ Setup — Final State

### Dockerfiles

**backend/Dockerfile:**

```dockerfile
FROM node:18

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

ENV MONGODB_USERNAME=root
ENV MONGODB_PASSWORD=secret

EXPOSE 80

CMD ["npm", "start"]
```

**frontend/Dockerfile:**

```dockerfile
FROM node:18

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

### .dockerignore (cho cả backend và frontend)

```
node_modules
Dockerfile
.git
```

### app.js (backend — connection string hoàn chỉnh)

```javascript
const mongoose = require('mongoose');

mongoose.connect(
  `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@mongodb:27017/goals?authSource=admin`
);

app.listen(80);
```

### App.js (frontend — dùng localhost)

```javascript
// React code chạy trong browser → dùng localhost
const response = await fetch('http://localhost/goals');
```

---

## Tất cả Commands cần chạy

```bash
# === BUILD IMAGES ===
docker build -t goals-node ./backend
docker build -t goals-react ./frontend

# === SETUP ===
docker network create goals-net

# === START CONTAINERS ===

# 1. MongoDB
docker run -d \
  --name mongodb \
  --rm \
  --network goals-net \
  -v mongo-data:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=secret \
  mongo

# 2. Node Backend
docker run -d \
  --name goals-backend \
  --rm \
  -p 80:80 \
  --network goals-net \
  -v logs:/app/logs \
  -v $(pwd)/backend:/app \
  -v /app/node_modules \
  -e MONGODB_USERNAME=admin \
  goals-node

# 3. React Frontend
docker run -it \
  --name goals-frontend \
  --rm \
  -p 3000:3000 \
  -v $(pwd)/frontend/src:/app/src \
  goals-react
```

**Vấn đề:** Phải nhớ và gõ 3 lệnh dài này mỗi lần khởi động. Dễ quên flag, dễ nhầm.

---

## Bảng tổng hợp — What & Why

| Yếu tố | MongoDB | Node Backend | React Frontend |
|---|---|---|---|
| Image | `mongo` (official) | Custom Dockerfile | Custom Dockerfile |
| Base image | (N/A) | `node:18` | `node:18` (build tooling) |
| Network | `goals-net` | `goals-net` | Không cần |
| Port published | Không | `80:80` | `3000:3000` |
| Data volume | Named: `/data/db` | Named: `/app/logs` | Không cần |
| Code volume | Không | Bind: `./backend:/app` | Bind: `./frontend/src:/app/src` |
| Protect volume | Không | Anon: `/app/node_modules` | Không cần |
| Auth/Config | `MONGO_INITDB_*` env | `MONGODB_*` env | Không |
| Hot-reload | N/A | nodemon | Built-in (dev server) |
| Interactive | Không | Không | Có (`-it`) |

---

## Key Insights từ Phase này

### 1. Browser code ≠ Container code

```
Node.js code → chạy TRONG container
  → Docker resolve container names
  → "mongodb" → 172.18.0.2

React code → chạy TRONG BROWSER
  → Browser không trong container
  → Phải dùng "localhost" + published port
```

### 2. Volume precedence (path dài hơn thắng)

```
-v ./backend:/app         → mount /app từ host
-v /app/node_modules      → mount /app/node_modules anonymous

Kết quả: /app/* từ host, NGOẠI TRỪ /app/node_modules
→ node_modules được cài trong container, không bị overwrite
```

### 3. MongoDB authentication connection string

```
mongodb://username:password@hostname:port/database?authSource=admin
          ↑                 ↑               ↑
          Credentials       Container name  Bắt buộc khi dùng
                            (trong network) INITDB credentials
```

### 4. React cần `-it` để không tự tắt

```
-i: giữ STDIN mở
-t: attach pseudo-TTY
React dev server expects interactive input → nếu không có sẽ tự exit
```

---

## Hạn chế của Setup Hiện Tại

```
1. Phải nhớ và gõ nhiều lệnh dài
   → Giải pháp: Docker Compose (Phase 6)

2. Phải build images thủ công trước
   → Docker Compose có thể tự build

3. Phải quản lý thứ tự khởi động (MongoDB trước, Backend sau)
   → Docker Compose: depends_on

4. Đây là Development Setup — chưa tối ưu cho Production
   → Deployment section sau
```

---

## Tổng kết Phase 5

Bạn đã học:

1. **Kiến trúc 3-tier**: MongoDB + Node.js + React trong 3 containers riêng
2. **Dockerize từng service**: Official image cho DB, custom Dockerfile cho app
3. **React `-it` requirement**: Dev server cần interactive mode
4. **Browser vs Container code**: React chạy trong browser, không thể dùng container name
5. **Networks + Volumes kết hợp**: Internal network cho backend-DB, published port cho frontend-backend
6. **nodemon**: Hot-reload cho Node.js development
7. **Authentication**: MONGO_INITDB_* env vars + connection string với credentials
8. **`.dockerignore`**: Loại bỏ `node_modules` khỏi build context

---

**Tiếp theo:** Phase 6 — Docker Compose: Quản lý multi-container với 1 lệnh →

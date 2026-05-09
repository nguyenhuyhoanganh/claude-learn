# Bài 5: Multi-Stage Builds — React Production Deployment

## Vấn đề: React App Không Thể Deploy Trực Tiếp

### Development Setup (hiện tại)

```
Dockerfile:
  CMD ["npm", "start"]
  → Chạy React development server (port 3000)
  → Hot-reload, real-time compilation
  → NOT optimized, NOT production-ready
```

### Production Requirements

```
npm run build
  → Compile JSX → browser-compatible JS
  → Minify và optimize code
  → Tạo folder build/ với static files (HTML, JS, CSS)
  → KHÔNG khởi động server!

Cần 2 thứ để serve production React app:
  1. Static files từ npm run build
  2. Web server để serve những files đó (nginx)
```

### Tại Sao `CMD ["npm", "run", "build"]` Không Đủ?

```
RUN npm run build → Tạo static files → Image chứa files
CMD ["npm", "run", "build"] → Build xong → Container exit
  → Không có process nào chạy liên tục
  → Không có server → Container dừng ngay
```

---

## Multi-Stage Builds — Giải Pháp

### Khái niệm

```
Dockerfile thông thường:
  FROM base-image
  ... instructions ...
  CMD [...]

Multi-Stage Dockerfile:
  FROM image-1 AS stage-name-1
  ... instructions ...   ← Stage 1

  FROM image-2 AS stage-name-2
  COPY --from=stage-name-1 /path .   ← Copy từ stage 1
  ... instructions ...   ← Stage 2
  CMD [...]
```

**Mỗi `FROM` = 1 stage mới.** Final image = stage cuối cùng.

---

## Dockerfile.prod cho React App

```dockerfile
# === STAGE 1: Build ===
FROM node:18-alpine AS build

WORKDIR /app

COPY package.json .
RUN npm install

COPY . .

# Build optimized files → tạo /app/build/
RUN npm run build


# === STAGE 2: Serve ===
FROM nginx:stable-alpine

# Copy từ stage "build": chỉ lấy /app/build/
# → Bỏ qua node_modules, source code, etc.
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Kết quả:**
```
Final image chứa:
  ✓ nginx web server
  ✓ Optimized static files trong /usr/share/nginx/html
  ✗ Node.js (không cần nữa)
  ✗ Source code gốc
  ✗ node_modules
  → Image rất nhỏ và production-ready
```

---

## React Code: URL Problem trong Production

### Vấn đề với `localhost` trong Browser Code

```
React code chạy trong BROWSER của user, không trong container!

Frontend container → serve HTML/JS → Browser của user
Browser của user → gửi request đến backend

→ "localhost" trong React code = máy của user, không phải server!
→ Mọi request sẽ đến máy của user → FAIL!
```

### Giải pháp: Environment Variable từ React Build Process

React dùng `process.env.NODE_ENV` tự động:
- `development` khi chạy `npm start`
- `production` khi chạy `npm run build`

```javascript
// src/App.js hoặc component file
const backendUrl =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost'              // Container name trong dev
    : 'http://your-ecs-lb.amazonaws.com';  // Load Balancer URL

// Dùng trong requests:
fetch(`${backendUrl}/goals`)
fetch(`${backendUrl}/goals/${id}`)
```

**Lưu ý:** `process.env.NODE_ENV` là của React build tool, KHÔNG phải Docker environment variables. Docker env vars không inject vào browser-executed code.

### Nếu Frontend và Backend cùng domain

Nếu deploy cả 2 trên cùng 1 server (cùng domain):
```javascript
// Bỏ qua domain, chỉ dùng path
fetch('/goals')         // Browser tự dùng current domain
fetch(`/goals/${id}`)
```

---

## Build và Deploy Multi-Stage Image

```bash
# Build với Dockerfile.prod (không phải Dockerfile mặc định)
docker build \
  -f frontend/Dockerfile.prod \  # Chỉ định file
  -t YOUR_USERNAME/goals-react \  # Tag với Docker Hub name
  ./frontend                      # Build context

# Push lên Docker Hub
docker push YOUR_USERNAME/goals-react
```

---

## Frontend và Backend: Cùng Task hay Khác Task?

### Cùng Task (cùng machine, cùng URL)
```
Điều kiện: Chỉ 1 container expose port 80!

❌ KHÔNG được:
  - Node.js backend: port 80
  - Nginx frontend: port 80
  → Conflict! Không thể 2 web servers cùng port

✓ Có thể nếu:
  - Backend: port 80
  - Frontend: serve static files, không phải web server riêng
```

### Khác Task (khác machine, khác URL)
```
Task 1 (Backend): Node.js API → Load Balancer A
Task 2 (Frontend): Nginx + React → Load Balancer B

Hai Load Balancers → Hai URLs:
  Backend: http://ecs-lb-backend.amazonaws.com
  Frontend: http://ecs-lb-frontend.amazonaws.com

Frontend code phải dùng backend URL tuyệt đối:
  fetch('http://ecs-lb-backend.amazonaws.com/goals')
```

---

## `--target` Flag: Build Một Phần của Multi-Stage

```bash
# Build toàn bộ (mặc định)
docker build -f Dockerfile.prod .

# Build chỉ đến stage "build" (stop sau stage 1)
docker build -f Dockerfile.prod --target build .
# → Dùng để test, debug, hoặc chạy tests trong CI
```

**Use case thực tế:**
```dockerfile
FROM node AS dependencies    # Stage 1: Install deps
FROM dependencies AS test    # Stage 2: Run tests
FROM dependencies AS build   # Stage 3: Build production
FROM nginx AS production     # Stage 4: Serve
```

```bash
# CI: Chỉ chạy tests
docker build --target test .

# Production: Toàn bộ
docker build .  # Chạy qua tất cả stages
```

---

## So Sánh: Development vs Production Docker Files

### Dockerfile (Development)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]      ← Development server
```

### Dockerfile.prod (Production — Multi-Stage)
```dockerfile
# Stage 1: Build
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build          ← Build optimized files

# Stage 2: Serve
FROM nginx:stable-alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Cả 2 files có cùng:**
- Node version (18-alpine)
- Source code (COPY . .)
- Dependencies (npm install)

**Khác nhau:**
- Dev: start server + live code via bind mount
- Prod: build code + nginx serve static files

---

## Tổng Hợp: Quy Trình Deploy React App

```bash
# 1. Chuẩn bị code: Fix URLs cho production
# src/App.js: dùng process.env.NODE_ENV để set backend URL

# 2. Build production image
docker build -f frontend/Dockerfile.prod \
  -t YOUR_USERNAME/goals-react ./frontend

# 3. Push lên Docker Hub
docker push YOUR_USERNAME/goals-react

# 4. Trên AWS ECS:
# Task Definitions → Create → Add Container:
#   Image: YOUR_USERNAME/goals-react
#   Port: 80

# 5. Create Service + Load Balancer cho frontend
# 6. Test bằng Load Balancer URL
```

---

**Tiếp theo:** Tổng Kết Deployment →

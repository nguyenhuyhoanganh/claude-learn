# Bài 4: Data Persistence và Hot-Reload

## Vấn đề hiện tại

```
1. MongoDB: Data bị mất mỗi khi container bị xóa/restart
   → Cần: Named Volume cho /data/db

2. Node Backend: Log files bị mất, code changes cần rebuild
   → Cần: Named Volume cho logs, Bind Mount cho code, nodemon

3. React Frontend: Code changes cần rebuild image
   → Cần: Bind Mount cho src folder
```

---

## MongoDB: Persist Data + Authentication

### Named Volume cho database

MongoDB lưu data tại `/data/db` bên trong container:

```bash
docker run -d \
  --name mongodb \
  --rm \
  --network goals-net \
  -v mongo-data:/data/db \          # Named volume — persist database files
  mongo
```

### Thêm Authentication

Official Mongo image hỗ trợ 2 environment variables để tạo user có authentication:

```bash
docker run -d \
  --name mongodb \
  --rm \
  --network goals-net \
  -v mongo-data:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=secret \
  mongo
```

### Cập nhật connection string trong backend

```javascript
// Khi có authentication, connection string phải có username:password
mongoose.connect(
  `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@mongodb:27017/mydb?authSource=admin`
);
// ?authSource=admin → bắt buộc khi dùng INITDB credentials
```

---

## Node Backend: Volumes + Environment Variables + nodemon

### 3 volumes cần thiết

```bash
docker run -d \
  --name goals-backend \
  --rm \
  -p 80:80 \
  --network goals-net \
  -v logs:/app/logs \               # Named volume — persist log files
  -v /path/to/backend:/app \        # Bind mount — live code sync
  -v /app/node_modules \            # Anonymous volume — protect node_modules
  -e MONGODB_USERNAME=admin \
  goals-node
```

**Giải thích 3 volumes:**

```
1. -v logs:/app/logs
   Named volume → log files không mất khi container xóa

2. -v /path/to/backend:/app
   Bind mount → code thay đổi ngay lập tức vào container
   (Không cần rebuild image)

3. -v /app/node_modules
   Anonymous volume → bảo vệ node_modules trong container
   Bind mount ở trên map /path/to/backend → /app
   Nhưng /path/to/backend/node_modules có thể không đủ/khác
   → Anonymous volume tại /app/node_modules "wins" (path dài hơn)
   → node_modules trong container được giữ nguyên
```

### Volume precedence (path dài hơn thắng)

```
-v /host/backend:/app           → map /app
-v /app/node_modules            → map /app/node_modules (path dài hơn)

Kết quả: /app được map từ host NGOẠI TRỪ /app/node_modules
         /app/node_modules là anonymous volume, không bị overwrite
```

### Thêm nodemon để hot-reload

**package.json** (thêm devDependencies và script):

```json
{
  "dependencies": {
    "express": "^4.17.1",
    "mongoose": "^6.0.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.4"
  },
  "scripts": {
    "start": "nodemon app.js"
  }
}
```

**Dockerfile** (dùng `npm start` thay vì `node app.js`):

```dockerfile
FROM node:18

WORKDIR /app

COPY package.json .

RUN npm install        # Cài cả devDependencies vì không có --only=production

COPY . .

EXPOSE 80

CMD ["npm", "start"]   # Chạy nodemon qua npm start
```

**Kết quả:** Khi bạn sửa file `.js` trong `backend/`, nodemon tự detect và restart Node server → không cần rebuild image.

### Environment Variables trong Dockerfile

```dockerfile
FROM node:18
WORKDIR /app

COPY package.json .
RUN npm install
COPY . .

# Khai báo ENV với default values
ENV MONGODB_USERNAME=root
ENV MONGODB_PASSWORD=secret

EXPOSE 80
CMD ["npm", "start"]
```

```bash
# Override khi run (quan trọng nếu default != actual MongoDB password)
docker run -d \
  --name goals-backend \
  -e MONGODB_USERNAME=admin \      # Override default "root"
  # MONGODB_PASSWORD dùng default "secret" nếu match
  goals-node
```

---

## React Frontend: Bind Mount cho hot-reload

React dev server đã tự có hot-reload khi file thay đổi. Chỉ cần bind mount `src/` folder:

```bash
docker run -it \
  --name goals-frontend \
  --rm \
  -p 3000:3000 \
  -v /path/to/frontend/src:/app/src \   # Bind mount chỉ src folder
  goals-react
```

**Tại sao chỉ bind `src/` chứ không phải cả folder?**

```
/path/to/frontend/
├── src/           ← Code ta viết, cần sync
├── public/        ← Static files, ít thay đổi
├── node_modules/  ← Không muốn sync (chậm, có thể conflict)
└── package.json   ← Không thay đổi thường xuyên

→ Bind mount src/ là đủ cho development workflow
```

---

## `.dockerignore` để tăng tốc build

### backend/.dockerignore

```
node_modules
Dockerfile
.git
.gitignore
*.md
```

### frontend/.dockerignore

```
node_modules
Dockerfile
.git
.gitignore
build/
```

**Tại sao quan trọng?**

```
Không có .dockerignore:
  COPY . .  → Copy cả node_modules (hàng trăm MB)
  → Build chậm vì copy nhiều file thừa
  → Image lớn hơn cần thiết

Có .dockerignore:
  COPY . .  → Bỏ qua node_modules
  → npm install cài đúng dependencies trong container
  → Build nhanh hơn nhiều
```

---

## Full Commands Summary

```bash
# 1. Tạo network
docker network create goals-net

# 2. MongoDB với auth + persistence
docker run -d \
  --name mongodb \
  --rm \
  --network goals-net \
  -v mongo-data:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=secret \
  mongo

# 3. Node Backend với volumes + env vars + network
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

# 4. React Frontend với bind mount (interactive)
docker run -it \
  --name goals-frontend \
  --rm \
  -p 3000:3000 \
  -v $(pwd)/frontend/src:/app/src \
  goals-react
```

---

**Tiếp theo:** Tóm tắt Phase 5 và giới thiệu Docker Compose →

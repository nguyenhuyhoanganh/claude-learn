# Bài 4: Multi-Container trong ECS — Localhost, EFS, và MongoDB Atlas

## Multi-Container trong ECS: Không Dùng Container Names

### Vấn đề: Container Names không hoạt động trong ECS

Locally với Docker Compose:
```
backend container → kết nối đến "mongo" → Docker resolve IP tự động
```

Trên AWS ECS:
```
backend container → kết nối đến "mongo" → KHÔNG hoạt động!

Lý do: Containers có thể chạy trên các server khác nhau
trong data center của AWS (không đảm bảo cùng machine).
Docker network không tồn tại ở đây.
```

### Giải pháp: Dùng `localhost` trong cùng Task

Khi các containers cùng thuộc 1 **Task** trong ECS:
- Được đảm bảo chạy trên cùng 1 machine
- Giao tiếp với nhau qua `localhost` (không phải container name)

```
Docker Compose (local):     AWS ECS (production):
  mongodb://mongo:27017  →    mongodb://localhost:27017
```

**Dùng Environment Variable để linh hoạt:**

```javascript
// app.js
const mongoUrl = process.env.MONGODB_URL;
mongoose.connect(`mongodb://${mongoUrl}:27017/goals-dev`);
```

```bash
# backend.env (development)
MONGODB_URL=mongo          # Container name

# ECS Environment Variables (production)
MONGODB_URL=localhost      # localhost trong cùng task
```

---

## Thêm MongoDB vào ECS Task

### Cấu hình MongoDB Container trong ECS

```
Task Definition → Add Container:
  Name: mongodb
  Image: mongo         (official Docker Hub image)
  Port: 27017
  Environment Variables:
    MONGO_INITDB_ROOT_USERNAME=max
    MONGO_INITDB_ROOT_PASSWORD=secret
```

### Cấu hình Backend Container trong ECS

```
Container: goals-backend (Node.js)
Image: YOUR_USERNAME/goals-node
Port: 80
Command: node,app.js   (production: không dùng nodemon)
Environment Variables:
  MONGODB_URL=localhost
  MONGODB_USERNAME=max
  MONGODB_PASSWORD=secret
```

**Lưu ý về Command trong production:**

```dockerfile
# Dockerfile có npm start → dùng nodemon (development only)
CMD ["npm", "start"]

# ECS Command override cho production:
Command: node,app.js   # Chạy trực tiếp với node
```

---

## Load Balancer — Stable Domain

### Vấn đề: IP thay đổi mỗi lần deploy

```
Lần 1 deploy: http://54.12.34.56/goals
Lần 2 deploy: http://54.67.89.01/goals  ← IP mới!
```

### Giải pháp: Application Load Balancer

```
Load Balancer DNS: ecs-lb-xxxx.us-east-1.elb.amazonaws.com
  → Không bao giờ thay đổi
  → Có thể map custom domain lên đây
  → Forward requests đến containers đang chạy
```

**Tạo Load Balancer trong EC2:**
```
EC2 → Load Balancers → Create Application Load Balancer
  Name: ecs-lb
  Scheme: Internet-facing
  Listeners: Port 80
  VPC: cùng VPC với ECS cluster
  Target Group: goals-tg (type: IP)
  Health Check Path: /goals
```

**Gắn Load Balancer vào ECS Service:**
```
Service → Load Balancing: Application Load Balancer
  → Choose: ecs-lb
  → Container: goals-backend 80:80
  → Target Group: goals-tg
```

---

## EFS Volumes — Persistent Storage trong ECS

### Vấn đề: Data mất khi Container Restart

```
Scenario:
  1. User thêm goal vào MongoDB
  2. Deploy image mới → Task restart
  3. Mọi data trong MongoDB container bị xóa!

Lý do: Fargate containers là stateless
  → Không có permanent storage
  → Container filesystem mất khi container stop
```

### Giải pháp: EFS (Elastic File System)

```
EFS = "Hard drive ảo" gắn vào containers
  → Tồn tại độc lập với containers
  → Data không mất khi container restart
  → Giống Named Volumes trong Docker nhưng cho cloud
```

**Tạo EFS:**
```
AWS EFS → Create File System:
  Name: db-storage
  VPC: cùng VPC với ECS

Security Group cho EFS:
  Inbound: NFS (port 2049) 
  Source: Security group của ECS tasks
  → Cho phép containers giao tiếp với EFS
```

**Gắn EFS vào Task Definition:**
```yaml
# Task Definition → Volumes → Add Volume:
  Name: data
  Type: EFS
  File System ID: fs-xxxxxxxx (ID của EFS vừa tạo)
  
# MongoDB Container → Storage/Logging → Mount Points:
  Source Volume: data
  Container Path: /data/db  (MongoDB lưu data ở đây)
```

**Lưu ý quan trọng với Rolling Deployment:**
```
Vấn đề khi update service:
  Old task: MongoDB đang dùng /data/db trên EFS
  New task: Cũng cố gắng dùng /data/db → CONFLICT!
  
  "Unable to lock the lock file: /data/db/mongod.lock"
  
Workaround tạm thời: Manually stop old task trước
Giải pháp tốt hơn: Dùng managed database (MongoDB Atlas)
```

---

## MongoDB Atlas — Managed Database

### Tại Sao Không Dùng MongoDB Container trong Production?

```
Thách thức khi tự quản lý database container:
  ✗ Scaling: Cần nhiều replicas → Phức tạp để sync
  ✗ Performance: Traffic spikes → Container overwhelmed
  ✗ Backup: Bạn phải tự setup backup strategy
  ✗ Security: Bạn tự lo encryption, access control
  ✗ High Availability: Container downtime = data unavailable
```

### MongoDB Atlas — Cloud Managed MongoDB

```
atlas.mongodb.com → Cluster → Connect → Connect your Application
  Connection String: mongodb+srv://username:password@cluster.mongodb.net/dbname
```

**Cập nhật connection string:**
```javascript
// Trước (dùng container):
mongoose.connect(`mongodb://localhost:27017/goals`)

// Sau (dùng Atlas):
mongoose.connect(`mongodb+srv://${user}:${pass}@cluster.xyz.net/${dbname}`)
```

**Môi trường Development vs Production:**
```javascript
// Dùng env var để linh hoạt
const MONGODB_URL = process.env.MONGODB_URL;
const MONGODB_NAME = process.env.MONGODB_NAME;
// development: MONGODB_NAME=goals-dev
// production:  MONGODB_NAME=goals
```

**Xóa MongoDB container khỏi docker-compose.yml:**
```yaml
# TRƯỚC:
services:
  mongodb:           ← Xóa bỏ
    image: mongo
  backend:
    depends_on:
      - mongodb      ← Xóa bỏ

# SAU:
services:
  backend:           ← Không còn depends_on mongodb
    environment:
      - MONGODB_URL=<atlas-cluster-url>
```

**Cấu hình Atlas Security:**
```
MongoDB Atlas → Network Access:
  → Allow access from anywhere (0.0.0.0/0)
  → Hoặc IP cụ thể của AWS servers

MongoDB Atlas → Database Access:
  → Add user với username + password
  → Read/Write permissions
```

---

## Kiến Trúc Cuối Cùng

```
Internet
  │
  ▼
Load Balancer (stable URL)
  │
  ▼
ECS Task (Node.js Backend)
  │
  ▼ (connection string)
MongoDB Atlas (cloud managed)
```

---

**Tiếp theo:** Multi-Stage Builds và React Production →

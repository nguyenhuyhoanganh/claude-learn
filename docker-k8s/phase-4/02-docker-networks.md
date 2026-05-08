# Bài 2: Docker Networks — Kết nối Containers với nhau

## Vấn đề với việc dùng IP address thủ công

Cách cơ bản nhất để container A gọi container B: tìm IP của B và dùng nó.

```bash
# Tìm IP của MongoDB container
docker container inspect mongodb
# NetworkSettings.IPAddress: 172.17.0.2  ← IP này

# Dùng IP trong code
mongoose.connect('mongodb://172.17.0.2:27017/mydb');
```

**Vấn đề:**
- IP có thể thay đổi mỗi lần restart container
- Phải inspect để tìm IP → rebuild image → chạy lại
- Không portable, không clean

→ **Giải pháp: Docker Networks**

---

## Docker Networks là gì?

Docker Network tạo ra một **mạng nội bộ** cho các containers. Các containers trong cùng network có thể:
- Giao tiếp với nhau bằng **tên container** (không cần biết IP)
- Docker tự động resolve tên → IP address

```
favorites-net (Docker Network)
├── node-app container    → có thể gọi "mongodb"
└── mongodb container     → có thể gọi "node-app"
```

---

## Tạo và Dùng Docker Network

### Bước 1: Tạo Network

```bash
# Tạo custom bridge network
docker network create favorites-net

# Xem tất cả networks
docker network ls
# NETWORK ID     NAME            DRIVER    SCOPE
# abc123def456   bridge          bridge    local   ← default
# xyz789abc123   favorites-net   bridge    local   ← vừa tạo
# ...            host            host      local
# ...            none            null      local
```

### Bước 2: Chạy Containers trong Network

```bash
# Chạy MongoDB trong network
docker run -d \
  --name mongodb \
  --network favorites-net \
  mongo

# Chạy Node.js app trong cùng network
docker run -d \
  -p 3000:3000 \
  --name favorites \
  --network favorites-net \
  my-node-app
```

### Bước 3: Dùng tên container trong code

```javascript
// Thay vì IP address, dùng tên container
mongoose.connect('mongodb://mongodb:27017/mydb');
//                       ↑
//                       Tên của MongoDB container
//                       Docker tự resolve thành IP
```

---

## Docker tự resolve IP như thế nào?

Docker **không sửa source code**. Nó can thiệp ở tầng network:

```
1. Code gọi: mongoose.connect('mongodb://mongodb:27017')
2. Request rời khỏi container
3. Docker intercepts request, thấy hostname "mongodb"
4. Docker lookup: "mongodb" = container nào trong network?
5. Docker tìm thấy: "mongodb" → 172.17.0.3
6. Request được chuyển đến 172.17.0.3:27017
```

→ Code không biết gì về IP, Docker xử lý hết.

---

## Port Publishing và Networks

### Khi nào cần `-p` (publish port)?

```bash
# node-app: cần -p vì client (browser/Postman) ở ngoài network
docker run -p 3000:3000 --network favorites-net node-app

# mongodb: KHÔNG cần -p vì chỉ node-app (cùng network) connect đến
docker run --network favorites-net mongo
# Không cần -p! Internal container communication không cần expose port
```

**Quy tắc:**
- `-p` cần thiết để **bên ngoài** (host machine, Internet) truy cập container
- **Trong cùng network**, containers tự do giao tiếp mà không cần `-p`

---

## Các Network Drivers

| Driver | Mô tả | Khi nào dùng |
|---|---|---|
| `bridge` | Mặc định cho user-defined networks | Hầu hết trường hợp |
| `host` | Container dùng mạng của host | Linux, hiệu năng cao |
| `none` | Không có network | Hoàn toàn isolated |
| `overlay` | Multi-host networking | Kubernetes/Swarm |

```bash
# Tạo network với driver cụ thể
docker network create --driver bridge my-bridge-net
```

---

## Default Bridge Network vs User-Defined Network

Docker tự động tạo một `bridge` network mặc định. Containers tự động tham gia nếu không chỉ định `--network`.

| | Default Bridge | User-Defined Network |
|---|---|---|
| Tự động join | Có | Không (phải chỉ định) |
| DNS resolution (tên container) | ❌ Không hỗ trợ | ✅ Hỗ trợ |
| Isolation | Kém hơn | Tốt hơn |
| Recommendation | Không dùng | **Luôn dùng** |

**Luôn tạo user-defined network** thay vì dùng default bridge!

---

## Quản lý Networks

```bash
# Tạo network
docker network create my-network

# Liệt kê networks
docker network ls

# Chi tiết network (thấy containers đang kết nối)
docker network inspect my-network

# Xóa network (không có containers nào đang dùng)
docker network rm my-network

# Xóa tất cả networks không dùng
docker network prune

# Thêm container đang chạy vào network
docker network connect my-network my-container

# Ngắt container khỏi network
docker network disconnect my-network my-container
```

---

## Ví dụ hoàn chỉnh: Node.js + MongoDB

### app.js (Node.js)

```javascript
const mongoose = require('mongoose');

// Dùng tên container MongoDB ("mongodb") như hostname
mongoose.connect('mongodb://mongodb:27017/mydb');

app.listen(3000);
```

### Khởi động toàn bộ stack

```bash
# Bước 1: Tạo network
docker network create app-network

# Bước 2: Chạy MongoDB (không publish port — chỉ dùng nội bộ)
docker run -d \
  --name mongodb \
  --network app-network \
  -v mongo-data:/data/db \
  mongo

# Bước 3: Chạy Node.js app (publish port vì client cần truy cập)
docker run -d \
  --name node-api \
  --network app-network \
  -p 3000:3000 \
  my-node-app

# Kiểm tra
curl http://localhost:3000/health  # ✓
```

---

## Tóm tắt

```
Container → Internet:
  Hoạt động ngay, không cần gì thêm

Container → Host Machine:
  Dùng: host.docker.internal

Container → Container (cùng network):
  1. docker network create my-network
  2. docker run --network my-network --name service-b ...
  3. docker run --network my-network --name service-a ...
  4. Trong code service-a: gọi "service-b" (tên container)

Lưu ý:
  - Không cần publish port (-p) cho container-to-container
  - Luôn dùng user-defined network (không dùng default bridge)
  - Docker auto-resolve container names → IP addresses trong network
```

---

**Tiếp theo:** Phase 5 — Multi-Container Applications thực tế →

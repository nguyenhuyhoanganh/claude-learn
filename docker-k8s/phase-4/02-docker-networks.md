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

```text
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

```text
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

### Chứng minh khác biệt bằng hai phút

Dòng "DNS resolution: không hỗ trợ" ở bảng trên là khác biệt quan trọng nhất. Xem tận mắt:

```bash
# THÍ NGHIỆM 1 — mạng bridge MẶC ĐỊNH
docker run -d --name db-mac-dinh alpine sleep 300
docker run --rm alpine ping -c1 db-mac-dinh
```

```text
ping: bad address 'db-mac-dinh'
             ▲
   Không phân giải được tên — dù cả hai container đều ở bridge mặc định
```

```bash
# THÍ NGHIỆM 2 — mạng do bạn tạo
docker network create mang-thu
docker run -d --name db-cua-toi --network mang-thu alpine sleep 300
docker run --rm --network mang-thu alpine ping -c1 db-cua-toi
```

```text
PING db-cua-toi (172.19.0.2): 56 data bytes
64 bytes from 172.19.0.2: seq=0 ttl=64 time=0.089 ms
                ▲
        Phân giải được ngay, không cấu hình gì thêm
```

```bash
docker rm -f db-mac-dinh db-cua-toi && docker network rm mang-thu
```

Vì sao lại vậy: mạng do bạn tạo có một **máy chủ DNS nội bộ** ở địa chỉ `127.0.0.11` bên trong mỗi container, tự động ánh xạ tên container sang IP. Bridge mặc định thì không.

```bash
docker run --rm --network mang-thu alpine cat /etc/resolv.conf
```

```text
nameserver 127.0.0.11
options ndots:0
```

### Một container ở nhiều mạng cùng lúc

Đây là cách cách ly dịch vụ theo tầng — mẫu rất hay dùng ở production:

```bash
docker network create mang-ngoai
docker network create mang-trong

# Backend nằm ở CẢ HAI mạng
docker run -d --name api --network mang-ngoai my-api
docker network connect mang-trong api

# Database CHỈ nằm ở mạng trong
docker run -d --name db --network mang-trong mongo
```

```text
   ┌─── mang-ngoai ───┐        ┌─── mang-trong ───┐
   │                  │        │                  │
   │   nginx ──► api ─┼────────┼─► api ──► db     │
   │                  │        │                  │
   └──────────────────┘        └──────────────────┘

   nginx KHÔNG gọi thẳng được db → giảm bề mặt tấn công
```

Đây chính là ý tưởng mà Kubernetes gọi là **NetworkPolicy** ([Phase 19 bài 4](../phase-19/04-networkpolicy-va-tong-ket.md)), chỉ ở quy mô một máy.

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

```text
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

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Dùng bridge **mặc định** rồi gọi nhau bằng tên | `bad address` / `getaddrinfo ENOTFOUND` | **Luôn tạo network riêng** — bridge mặc định không có DNS |
| Quên `--network` khi chạy container thứ hai | Container ở hai mạng khác nhau, không thấy nhau | Cả hai phải cùng `--network` |
| Gọi bằng IP thay vì tên | Hỏng sau mỗi lần tạo lại container | IP đổi liên tục, tên thì không |
| Gọi **cổng đã publish** thay vì cổng thật | `27017:27017` thì trùng nên không lộ, nhưng `-p 8080:3000` thì gọi `api:8080` sẽ hỏng | Trong network, dùng **cổng bên trong container** (`api:3000`) |
| Thêm `-p` cho database "cho chắc" | **Lộ database ra ngoài máy** | Chỉ `-p` cho thứ cần truy cập từ máy thật |
| Đổi tên container mà quên sửa code | Không kết nối được | Tên container **chính là tên máy chủ** trong network |
| Network không xoá được | `network has active endpoints` | Xoá hoặc ngắt hết container trước |
| Tạo quá nhiều network rác | `all predefined address pools have been fully subnetted` | `docker network prune` |
| Container không có tên (`--name`) | Không ai gọi được nó | Luôn đặt `--name` cho container cần được gọi |

Dòng thứ tư là bẫy tinh vi nhất, đáng vẽ ra:

```text
   docker run -d --name api --network mang -p 8080:3000 my-api

   TỪ MÁY THẬT:        http://localhost:8080     ← cổng đã publish
   TỪ CONTAINER KHÁC:  http://api:3000           ← cổng THẬT bên trong

   Gọi http://api:8080 từ container khác → KHÔNG kết nối được
   vì -p chỉ tạo đường từ MÁY THẬT vào, không đổi cổng bên trong.
```

---

## Tóm tắt bài 2

- Gọi container bằng **IP là sai** — IP đổi mỗi lần tạo lại. Gọi bằng **tên container**.
- **Bridge mặc định KHÔNG có DNS.** Đây là khác biệt quan trọng nhất, và là lý do luôn phải `docker network create` mạng riêng.
- Mạng do bạn tạo có **DNS nội bộ ở `127.0.0.11`**, tự ánh xạ tên container sang IP — không cấu hình gì thêm.
- Hai container trong cùng network **không cần `-p`** để gọi nhau. `-p` chỉ mở đường từ **máy thật** vào.
- Trong network, phải dùng **cổng thật bên trong container**, không phải cổng đã publish.
- Một container **gắn được vào nhiều network** — đó là cách cách ly tầng dịch vụ (nginx thấy api, api thấy db, nginx **không** thấy db).
- Đừng `-p` cho database. Nó chỉ cần được gọi từ trong network.

---

**Phase kế tiếp** → [Bài 1: Ứng Dụng 3-Tier với Docker](../phase-5/01-ung-dung-3-tier-voi-docker.md)

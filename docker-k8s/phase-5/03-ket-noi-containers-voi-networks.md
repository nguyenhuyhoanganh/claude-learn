# Bài 3: Kết nối Containers với Docker Networks

## Tại sao cần Network?

Dùng IP/localhost để các containers giao tiếp qua host machine hoạt động được, nhưng không tối ưu:
- Phải publish port của tất cả containers
- MongoDB lộ ra ngoài (security risk)
- Mọi traffic đi qua host machine thay vì trực tiếp

**Giải pháp:** Tạo một Docker Network, đặt tất cả containers vào đó.

---

## Tạo Network và Chạy Containers

```bash
# Bước 1: Tạo network
docker network create goals-net

# Bước 2: MongoDB — KHÔNG cần publish port
docker run -d \
  --name mongodb \
  --rm \
  --network goals-net \
  mongo
# Không có -p 27017:27017 vì chỉ backend cần kết nối
# và backend cùng network → tự giao tiếp được

# Bước 3: Node Backend — vẫn cần publish port vì React (browser) cần gọi đến
docker run -d \
  --name goals-backend \
  --rm \
  -p 80:80 \
  --network goals-net \
  goals-node

# Bước 4: React Frontend — publish port cho browser, KHÔNG cần network
docker run -it \
  --name goals-frontend \
  --rm \
  -p 3000:3000 \
  goals-react
# Không cần --network vì React code chạy trong browser, không trong container
```

---

## Cập nhật Code để Dùng Container Names

### Backend (Node.js) → MongoDB

```javascript
// ❌ Trước: dùng host.docker.internal (khi MongoDB trên host)
mongoose.connect('mongodb://host.docker.internal:27017/mydb');

// ✅ Sau: dùng container name (cùng network)
mongoose.connect('mongodb://mongodb:27017/mydb');
//                       ↑
//                  Tên container MongoDB
//                  Docker resolve → IP tự động
```

### Backend cần rebuild sau khi đổi code

```bash
# Rebuild image sau khi đổi connection string
docker build -t goals-node ./backend

# Chạy lại container
docker run -d \
  --name goals-backend \
  --rm \
  -p 80:80 \
  --network goals-net \
  goals-node
```

---

## Cái bẫy với React: Browser vs Container

### Lần thử đầu (sai)

```javascript
// Frontend App.js — thử dùng container name
fetch('http://goals-backend/goals')
//         ↑
//  Tưởng sẽ work như Node backend
```

```
Kết quả: ERR_NAME_NOT_RESOLVED
```

### Lý do tại sao không hoạt động

```
Node Backend (chạy TRONG container):
  Container → Docker Network → Resolve "mongodb" → Connect
  ✓ Docker xử lý DNS resolution

React Frontend:
  Dev server chạy trong container (chỉ serve files)
  ↓
  Browser download JavaScript
  ↓
  JavaScript chạy TRONG BROWSER (không trong container)
  Browser không biết "goals-backend" là gì
  ✗ Docker không thể giúp ở đây
```

```
┌────────────────────────────────────────────────────────┐
│  Docker Container (React dev server)                   │
│  ┌─────────────────────────────────────────────────┐  │
│  │  npm start → serves index.html + bundle.js      │  │
│  └─────────────────────────────────────────────────┘  │
└────────────────┬───────────────────────────────────────┘
                 │ HTTP (port 3000 published)
                 ▼
┌────────────────────────────────────────────────────────┐
│  Browser                                               │
│  ┌─────────────────────────────────────────────────┐  │
│  │  bundle.js chạy ở đây                           │  │
│  │  fetch('http://goals-backend/goals')            │  │
│  │  ← Browser không hiểu "goals-backend"!          │  │
│  └─────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Giải pháp đúng cho React

```javascript
// ✅ Dùng localhost — browser hiểu, backend đã publish port 80
fetch('http://localhost/goals')
//          ↑
//     Backend publish -p 80:80
//     Browser → localhost:80 → Docker → Backend container
```

**Quy tắc:**
- Code chạy **trong container** (Node, Python, etc.) → dùng container name
- Code chạy **trong browser** (React, Vue, Angular) → dùng `localhost` + published port

---

## Sơ đồ giao tiếp cuối cùng

```
Browser (user's machine)
   │
   │ localhost:3000 (React frontend)
   ▼
┌──────────────────┐
│  React Container │  ← --network KHÔNG cần
│  (dev server)    │
└──────────────────┘

Browser JavaScript
   │
   │ localhost:80 (Backend API)    ← Phải publish port 80
   ▼
┌──────────────────┐     goals-net     ┌──────────────────┐
│  Node Backend    │ ───────────────▶  │    MongoDB       │
│  Container       │   "mongodb:27017" │    Container     │
│  --network       │   (container name)│  --network       │
│  goals-net       │                   │  goals-net       │
└──────────────────┘                   └──────────────────┘
   Port 80 published                   Port 27017 NOT published
```

---

## Tóm tắt: Khi nào publish port?

```
MongoDB container:  KHÔNG publish
  → Chỉ backend cần, cùng network, giao tiếp nội bộ

Node Backend:       CÓ publish (-p 80:80)
  → Browser (React) cần gọi vào đây

React Frontend:     CÓ publish (-p 3000:3000)
  → Browser cần tải React app từ đây
```

---

**Tiếp theo:** Thêm Data Persistence và Hot-Reload →

# Bài 1: Ứng Dụng 3-Tier với Docker

## Kiến trúc mục tiêu

Chúng ta sẽ Dockerize một ứng dụng web hiện đại gồm 3 thành phần riêng biệt:

```
┌──────────────────────────────────────────────────────────────┐
│                         Browser                              │
│                    (user's machine)                          │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP (localhost:3000)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              React Frontend Container                        │
│              (Node dev server, port 3000)                    │
│              JavaScript runs IN THE BROWSER                  │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP (localhost:80)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              Node.js Backend Container                       │
│              (Express REST API, port 80)                     │
│              Runs inside container — Docker helps here       │
└───────────────────────────┬──────────────────────────────────┘
                            │ Docker Network (mongodb:27017)
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              MongoDB Container                               │
│              (Official mongo image, port 27017)              │
│              Data stored in named volume                     │
└──────────────────────────────────────────────────────────────┘
```

## Ba Building Blocks

### 1. MongoDB Database
- Dùng **official image** từ Docker Hub: `mongo`
- Không cần Dockerfile riêng
- Data phải **persist** khi container bị xóa → Named Volume
- Nên có **authentication** (username/password)

### 2. Node.js REST API (Backend)
- Cần **Dockerfile riêng** (custom app)
- Nhận request từ React frontend
- Nói chuyện với MongoDB qua **container name** trong network
- Log files cần persist → Named Volume
- Cần **hot-reload** khi code thay đổi → nodemon + Bind Mount

### 3. React SPA (Frontend)
- Cần **Dockerfile riêng** (dùng Node làm dev server)
- Code React **chạy trong browser**, không trong container
- Cần **interactive mode** (`-it`) để React dev server không tự tắt
- Hot-reload → Bind Mount cho source folder

---

## Điểm khác biệt quan trọng: React vs Node

Đây là điều **quan trọng nhất** cần hiểu trong bài này:

```
Node.js Backend:
  Code chạy trong container
  → Docker có thể resolve "mongodb" → IP address
  → Dùng container name được ✓

React Frontend:
  Dev server chạy trong container (chỉ phục vụ file)
  Code JavaScript THỰC SỰ chạy trong browser của user
  → Browser không biết "goals-backend" là gì
  → PHẢI dùng "localhost" ✗ không dùng container name
```

**Hệ quả:**
- Backend → MongoDB: dùng `mongodb` (container name trong network)
- Browser → Backend: phải publish port và dùng `localhost`

---

## Yêu cầu cho từng container

| Container | Image | Network | Volumes | Port Published |
|---|---|---|---|---|
| MongoDB | `mongo` (official) | goals-net | Named: `/data/db` | Không (chỉ internal) |
| Node Backend | Custom Dockerfile | goals-net | Named: `/app/logs`<br>Bind: `/app`<br>Anon: `/app/node_modules` | Có: `80:80` |
| React Frontend | Custom Dockerfile | Không cần | Bind: `/app/src` | Có: `3000:3000` |

---

## Tại sao tách riêng 3 containers?

```
❌ Nhét tất cả vào 1 container:
┌─────────────────────────────────┐
│  MongoDB + Node.js + React     │
│  → Khó scale                   │
│  → Khó update từng phần        │
│  → Không dùng được official    │
│    images có sẵn               │
└─────────────────────────────────┘

✅ Tách riêng:
┌──────────┐  ┌───────────┐  ┌─────────┐
│ MongoDB  │  │  Node.js  │  │  React  │
│ official │  │  custom   │  │  custom │
│  image   │  │  image    │  │  image  │
└──────────┘  └───────────┘  └─────────┘
  Scale DB      Scale API      Scale FE
  độc lập       độc lập        độc lập
```

---

**Tiếp theo:** Dockerize từng service →

# Bài 1: Ứng Dụng 3-Tier với Docker

## Kiến trúc mục tiêu

Chúng ta sẽ Dockerize một ứng dụng web hiện đại gồm 3 thành phần riêng biệt:

```text
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

```text
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

```text
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

## Bốn lý do tách container, xếp theo mức quan trọng

Sơ đồ trên nêu ba lý do. Đây là bức tranh đầy đủ, và lý do quan trọng nhất lại là cái ít được nhắc:

**1. Vòng đời khác nhau** — đây mới là lý do nền tảng.

```text
   Frontend:  deploy 5 lần/ngày (sửa giao diện liên tục)
   Backend:   deploy 2 lần/tuần
   Database:  deploy 2 lần/năm (nâng cấp phiên bản)

   Nhét chung một container → mỗi lần sửa nút bấm phải KHỞI ĐỘNG LẠI DATABASE
   → mất kết nối, mất phiên làm việc, rủi ro không cần thiết
```

**2. Tài nguyên khác nhau**

```text
   Database:  cần nhiều RAM và đĩa nhanh
   Backend:   cần nhiều CPU
   Frontend:  gần như không cần gì (chỉ phục vụ file tĩnh)

   Chung một container → phải cấp tài nguyên theo thành phần "đói" nhất
   → lãng phí, và không giới hạn riêng được
```

**3. Scale khác nhau**

Giờ cao điểm cần 10 bản backend nhưng vẫn chỉ **một** database. Chung container thì scale lên 10 nghĩa là 10 database — vừa lãng phí vừa hỏng dữ liệu.

**4. Dùng lại được image có sẵn**

MongoDB, Redis, PostgreSQL đều có image chính thức đã được tối ưu và vá lỗi bảo mật. Nhét chúng vào Dockerfile riêng nghĩa là bạn tự nhận việc bảo trì đó.

### Nguyên tắc gọn: một tiến trình một container

```text
   ✗ SAI:  container chạy nginx + php-fpm + cron + supervisor
   ✓ ĐÚNG: mỗi cái một container

   Vì sao:
   ├─ Docker theo dõi sức khoẻ của ĐÚNG MỘT tiến trình (PID 1)
   ├─ Log của mỗi dịch vụ tách riêng, không lẫn vào nhau
   ├─ Một dịch vụ chết thì khởi động lại đúng nó, không kéo theo cái khác
   └─ Scale được từng cái độc lập
```

Ngoại lệ hợp lý duy nhất là **sidecar** — một tiến trình phụ phục vụ trực tiếp tiến trình chính (thu thập log, proxy). Đó là mẫu chuẩn ở Kubernetes, sẽ gặp ở [Phase 12](../phase-12/02-kubernetes-objects.md).

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Nhét cả ba tầng vào một container | Sửa giao diện phải khởi động lại database |
| Dùng `supervisord` để chạy nhiều tiến trình trong một container | Docker chỉ thấy `supervisord` khoẻ, không biết dịch vụ bên trong đã chết |
| Tự viết Dockerfile cho MongoDB thay vì dùng image chính thức | Tự nhận việc vá lỗi bảo mật |
| Tưởng frontend React chạy trong container giống backend | **Code React chạy ở TRÌNH DUYỆT**, không chạy trong container — đây là bẫy lớn nhất của phase này, xem [bài 3](03-ket-noi-containers-voi-networks.md) |
| Scale cả stack thay vì scale từng tầng | Nhân bản database → hỏng dữ liệu |

---

## Tóm tắt bài 1

- Kiến trúc ba tầng: **MongoDB** (dữ liệu), **Node.js API** (nghiệp vụ), **React SPA** (giao diện) — mỗi tầng một container.
- Lý do tách quan trọng nhất là **vòng đời khác nhau**: frontend deploy hằng ngày, database vài lần một năm. Chung container thì mỗi lần sửa giao diện phải khởi động lại database.
- Ba lý do còn lại: **tài nguyên khác nhau**, **scale khác nhau**, và **dùng được image chính thức**.
- Nguyên tắc: **một tiến trình một container**. Ngoại lệ duy nhất là mẫu sidecar.
- Điểm khác biệt cần nhớ trước khi sang bài sau: **React chạy ở trình duyệt của người dùng**, không chạy bên trong container — nên nó **không** gọi được tên container.

---

**Bài kế tiếp** → [Bài 2: Dockerize Từng Service](02-dockerize-tung-service.md)

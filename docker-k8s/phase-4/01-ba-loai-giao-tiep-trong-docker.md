# Bài 1: Ba loại giao tiếp trong Dockerized App

## Tổng quan

Khi ứng dụng chạy trong container, nó có thể cần giao tiếp với:

```text
┌─────────────────────────────────────────────────────────┐
│                    Container Network                     │
│                                                          │
│  ┌────────────────┐         ┌──────────────────────┐    │
│  │   Your App     │ ─────▶  │  External API/Website│    │
│  │  (Node.js API) │         │  (Star Wars API...)  │    │
│  │                │         └──────────────────────┘    │
│  │                │         ┌──────────────────────┐    │
│  │                │ ─────▶  │   Host Machine       │    │
│  │                │         │   (MongoDB local)    │    │
│  │                │         └──────────────────────┘    │
│  │                │         ┌──────────────────────┐    │
│  │                │ ─────▶  │  Other Container     │    │
│  │                │         │  (MongoDB container) │    │
│  └────────────────┘         └──────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

Ba loại giao tiếp:
1. **Container → Internet (WWW)**: Gọi API bên ngoài
2. **Container → Host Machine**: Gọi service chạy trực tiếp trên máy bạn
3. **Container → Container**: Gọi service trong container khác

---

## Case 1: Container → Internet (WWW)

**Hoạt động ngay, không cần cấu hình thêm!**

```javascript
// Node.js code trong container
const response = await axios.get('https://swapi.dev/api/films');
// → HTTP request đi ra Internet từ bên trong container
// → Hoạt động bình thường, giống như chạy ngoài container
```

Container có quyền truy cập mạng outbound theo mặc định. Mọi HTTP request, HTTPS request, API call đến bên ngoài đều hoạt động mà không cần cấu hình gì thêm.

```bash
# Chạy container → gọi external API hoạt động ngay
docker run -p 3000:3000 myapp
# GET /movies → call swapi.dev → thành công ✓
```

---

## Case 2: Container → Host Machine

**Cần dùng special hostname: `host.docker.internal`**

```javascript
// ❌ KHÔNG hoạt động từ bên trong container
mongoose.connect('mongodb://localhost:27017/mydb');

// ✅ Hoạt động — Docker dịch sang IP của host machine
mongoose.connect('mongodb://host.docker.internal:27017/mydb');
```

`host.docker.internal` là hostname đặc biệt mà Docker hiểu và tự động dịch sang IP address của host machine **nhìn từ bên trong container**.

```bash
# MongoDB chạy trực tiếp trên host (không phải container)
# Node app trong container cần connect đến đó

docker run -p 3000:3000 myapp
# GET /favorites → connect MongoDB at host.docker.internal:27017 → thành công ✓
```

**Hoạt động trên:**
- macOS: Có sẵn
- Windows: Có sẵn
- Linux: Cần thêm `--add-host=host.docker.internal:host-gateway` khi run

---

## Case 3: Container → Container

**Cần Docker Networks (sẽ học ở bài tiếp theo)**

```javascript
// Nếu biết IP của MongoDB container (cách cũ, không khuyến nghị)
mongoose.connect('mongodb://172.17.0.2:27017/mydb');

// Nếu dùng Docker Networks (cách đúng)
mongoose.connect('mongodb://mongodb:27017/mydb');
// "mongodb" = tên container (Docker tự resolve IP)
```

---

## Best Practice: Mỗi container làm một việc

Thay vì nhét cả Node.js app và MongoDB vào một container:

```text
❌ Bad: 1 container chứa tất cả
┌─────────────────────────────────┐
│  Node.js App + MongoDB          │
│  (khó scale, khó maintain)      │
└─────────────────────────────────┘

✅ Good: Tách riêng từng service
┌──────────────────┐   ┌──────────────────┐
│  Node.js App     │   │  MongoDB         │
│  Container       │◀──│  Container       │
│  (logic/API)     │   │  (data storage)  │
└──────────────────┘   └──────────────────┘
```

**Lợi ích:**
- Scale độc lập (scale API mà không scale DB)
- Update độc lập
- Fault isolation (DB crash không kéo API down)
- Reuse (MongoDB container dùng cho nhiều apps)
- Official images (dùng `mongo` từ Docker Hub thay vì tự cài)

---

## Dùng Official Images cho Databases

Bạn không cần viết Dockerfile cho MongoDB, PostgreSQL, Redis... — đã có official images:

```bash
# Chạy MongoDB container
docker run -d --name mongodb mongo

# Chạy PostgreSQL container
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=mypassword \
  postgres:15

# Chạy Redis container
docker run -d --name redis redis:alpine
```

---

## Tóm tắt

| Giao tiếp | Cách thực hiện | Cần cấu hình? |
|---|---|---|
| Container → Internet | Gọi URL bình thường | ❌ Không |
| Container → Host Machine | Dùng `host.docker.internal` | Thay đổi URL trong code |
| Container → Container | Docker Networks (bài tiếp) | Cần tạo network |

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Dùng `localhost` trong container để gọi máy thật | `ECONNREFUSED 127.0.0.1:5432` | Trong container, `localhost` là **chính container đó**. Dùng `host.docker.internal` |
| **`host.docker.internal` không chạy trên Linux** | Không phân giải được tên | Nó chỉ có sẵn trên macOS/Windows. Trên Linux phải thêm `--add-host=host.docker.internal:host-gateway` |
| Dùng `localhost` để gọi container khác | Không kết nối được | Mỗi container có mạng riêng. Dùng **tên container** trong cùng network |
| Gọi container khác bằng IP | Chạy được hôm nay, hỏng ngày mai | IP đổi mỗi lần container tạo lại. Dùng tên |
| Quên `-p` rồi tưởng ứng dụng lỗi | Trình duyệt không vào được | Container chạy đúng, chỉ là chưa mở đường vào |
| Tưởng phải `-p` để hai container nói chuyện với nhau | Mở cổng ra ngoài không cần thiết | Trong cùng network thì gọi thẳng nhau, **không cần `-p`** |
| Container gọi Internet không được | Timeout | Hiếm khi do Docker. Kiểm tra DNS của máy chủ, tường lửa, hoặc proxy công ty |

Dòng thứ hai đáng nói thêm vì nó làm nhiều dự án chạy trên Mac nhưng gãy trên Linux:

```bash
# macOS / Windows — dùng được ngay
docker run --rm alpine ping -c1 host.docker.internal

# Linux — phải khai báo tường minh
docker run --rm --add-host=host.docker.internal:host-gateway \
  alpine ping -c1 host.docker.internal
```

Trong `docker-compose.yml`:

```yaml
services:
  api:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

---

## Tóm tắt bài 1

- Ba hướng giao tiếp cần ba cách xử lý khác nhau: **ra Internet** (không cần làm gì), **vào máy thật** (dùng `host.docker.internal`), **giữa các container** (dùng Docker network).
- **`localhost` trong container luôn là chính container đó** — đây là gốc của phần lớn lỗi kết nối khi mới học.
- **`host.docker.internal` chỉ có sẵn trên macOS/Windows.** Trên Linux phải thêm `--add-host=host.docker.internal:host-gateway`, nếu không dự án sẽ chạy trên máy này mà gãy trên máy khác.
- **Hai container trong cùng network gọi nhau không cần `-p`.** Cờ `-p` chỉ để mở đường từ **máy thật** vào container.
- Mỗi container làm **một việc** — đó là điều kiện để scale, cập nhật và thay thế từng phần độc lập.

---

**Bài kế tiếp** → [Bài 2: Docker Networks — Kết nối Containers với nhau](02-docker-networks.md)

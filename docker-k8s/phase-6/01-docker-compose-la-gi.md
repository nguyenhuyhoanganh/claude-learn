# Bài 1: Docker Compose là gì và Tại sao Cần?

## Vấn đề với nhiều `docker run` commands

Ứng dụng Phase 5 cần chạy 3 lệnh dài để khởi động:

```bash
# Lệnh 1 — MongoDB
docker run -d --name mongodb --rm --network goals-net \
  -v mongo-data:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=secret \
  mongo

# Lệnh 2 — Node Backend
docker run -d --name goals-backend --rm -p 80:80 \
  --network goals-net \
  -v logs:/app/logs \
  -v $(pwd)/backend:/app \
  -v /app/node_modules \
  -e MONGODB_USERNAME=admin \
  goals-node

# Lệnh 3 — React Frontend
docker run -it --name goals-frontend --rm -p 3000:3000 \
  -v $(pwd)/frontend/src:/app/src \
  goals-react
```

**Vấn đề:**
- Phải nhớ và gõ 3 lệnh dài mỗi lần
- Dễ quên một flag → ứng dụng lỗi khó debug
- Phải chạy đúng thứ tự (MongoDB trước)
- Tear down: phải stop từng container một

---

## Docker Compose là gì?

Docker Compose là tool giúp bạn **thay thế nhiều `docker build` và `docker run` commands bằng một file cấu hình** và **một lệnh duy nhất**.

```text
Thay vì:
  docker build + docker run (lần 1)
  docker build + docker run (lần 2)
  docker build + docker run (lần 3)
  ...

Dùng Docker Compose:
  docker-compose up    ← Khởi động TẤT CẢ
  docker-compose down  ← Dừng TẤT CẢ
```

### Docker Compose KHÔNG phải là:

| Điều này | Thực tế |
|---|---|
| Thay thế Dockerfile | **Không.** Compose hoạt động **cùng với** Dockerfile |
| Thay thế Images/Containers | **Không.** Vẫn dùng images và containers như bình thường |
| Công cụ để deploy lên nhiều servers | **Không.** Compose cho một host machine |
| Tạo ra tool mới hoàn toàn | **Không.** Vẫn dùng `docker build`/`docker run` dưới hood |

---

## Sơ đồ hoạt động

```text
docker-compose.yml
┌──────────────────────────────────────────────┐
│  services:                                   │
│    mongodb:                                  │
│      image: mongo                            │
│      volumes: [...]                          │
│      environment: [...]                      │
│                                              │
│    backend:                                  │
│      build: ./backend                        │  ←── Tham chiếu Dockerfile
│      ports: [...]                            │
│      volumes: [...]                          │
│                                              │
│    frontend:                                 │
│      build: ./frontend                       │  ←── Tham chiếu Dockerfile
│      ports: [...]                            │
└──────────────────────────────────────────────┘
           │
           ▼
    docker-compose up
           │
           ▼
┌──────────────────────────────────────────────┐
│  Docker tự động:                             │
│  1. Tạo network cho tất cả services          │
│  2. Build images (nếu cần)                   │
│  3. Pull images (nếu cần)                    │
│  4. Start containers theo thứ tự             │
└──────────────────────────────────────────────┘
```

---

## Docker Compose tỏa sáng nhất khi nào?

```text
1 container:    Docker Compose vẫn hữu ích
  → Không cần gõ lại lệnh dài
  → File cấu hình dễ đọc, dễ chia sẻ với team

2+ containers:  Docker Compose rất mạnh
  → Một lệnh khởi động tất cả
  → Tự động tạo network
  → Quản lý volumes và dependencies

5+ containers:  Docker Compose gần như bắt buộc
  → Không thể quản lý thủ công được nữa
```

---

## Docker Compose có sẵn ở đâu?

- **macOS**: Đã có sẵn trong Docker Desktop
- **Windows**: Đã có sẵn trong Docker Desktop
- **Linux**: Cần cài riêng: `sudo apt install docker-compose-plugin`

```bash
# Kiểm tra version
docker compose version
# hoặc với compose plugin cũ
docker-compose version
```

### `docker compose` (v2) khác `docker-compose` (v1) chỗ nào

Bạn sẽ gặp cả hai cách viết trong tài liệu trên mạng, và chúng **không hoàn toàn giống nhau**:

| | `docker-compose` (có gạch nối) | `docker compose` (có dấu cách) |
|---|---|---|
| Phiên bản | v1 — viết bằng Python | **v2 — viết bằng Go, tích hợp vào Docker CLI** |
| Trạng thái | **Đã ngừng hỗ trợ từ 7/2023** | Hiện hành |
| Tên container sinh ra | `duan_service_1` (gạch dưới) | `duan-service-1` (**gạch nối**) |
| Trường `version:` trong file | Bắt buộc | **Không cần, đã lỗi thời** |
| Tốc độ | Chậm hơn | Nhanh hơn rõ rệt |

Hai hệ quả thực tế:

**Một — trường `version: "3.8"` ở đầu file giờ đã thừa.** Compose v2 bỏ qua nó và thậm chí cảnh báo:

```text
WARN[0000] the attribute `version` is obsolete, it will be ignored
```

Giữ lại cũng không sao (để tương thích ngược), nhưng file mới thì không cần viết nữa.

**Hai — script cũ dựa vào tên container có thể hỏng.** Nếu bạn có script gọi `docker exec myapp_backend_1`, nó sẽ không tìm thấy nữa vì v2 đặt tên là `myapp-backend-1`.

```bash
# Cách viết KHÔNG phụ thuộc quy ước đặt tên — nên dùng
docker compose exec backend sh
docker compose logs -f backend
```

Dùng `docker compose exec <tên service>` thay vì `docker exec <tên container>` là thói quen đáng hình thành: nó đúng ở mọi phiên bản và không phụ thuộc cách Compose sinh tên.

---

## Bẫy thường gặp

| Bẫy | Hậu quả |
|---|---|
| Copy tài liệu cũ dùng `docker-compose` (gạch nối) trên máy chỉ có v2 | `command not found` |
| Tưởng Compose thay thế được Kubernetes | Compose chỉ chạy trên **một máy**, không có tự phục hồi, không scale qua nhiều máy |
| Tưởng Compose là công cụ production | Nó **dùng được** ở production quy mô nhỏ (một máy chủ), nhưng không có HA |
| Giữ `version: "3.8"` rồi lo lắng vì cảnh báo | Vô hại, chỉ là đã lỗi thời |
| Script gọi container theo tên `duan_service_1` | v2 đặt tên bằng **gạch nối** — dùng `docker compose exec <service>` |

---

## Tóm tắt bài 1

- Docker Compose thay **nhiều lệnh `docker run` dài dòng** bằng **một file YAML** kiểm soát được bằng Git — đúng tinh thần "môi trường là mã nguồn" ở [Phase 1](../phase-1/01-docker-la-gi-va-tai-sao-can.md).
- Nó **không phải** công cụ điều phối nhiều máy chủ, **không** thay Kubernetes, và **không** tự phục hồi khi máy chết.
- **`docker compose` (v2, dấu cách) là bản hiện hành**; `docker-compose` (v1, gạch nối) đã ngừng hỗ trợ từ 7/2023.
- Trường **`version:` đã lỗi thời** — file mới không cần viết.
- Ưu tiên **`docker compose exec <tên service>`** thay vì `docker exec <tên container>` để không phụ thuộc quy ước đặt tên.

---

**Bài kế tiếp** → [Bài 2: Cấu trúc File docker-compose.yml](02-cau-truc-docker-compose-yml.md)

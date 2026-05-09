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

```
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

```
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

```
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

---

**Tiếp theo:** Cấu trúc file `docker-compose.yml` →

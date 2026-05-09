# Bài 2: Cấu trúc File docker-compose.yml

## YAML Format

`docker-compose.yml` dùng định dạng **YAML** (Yet Another Markup Language):
- Dùng **indentation** (khoảng cách) để thể hiện hierarchy
- 2 spaces per level (không dùng tab)
- Case-sensitive

```yaml
# Ví dụ YAML structure
parent:
  child1: value1        # child của parent
  child2: value2
  nested:
    deep: value3        # child của nested, grandchild của parent
```

---

## Skeleton của docker-compose.yml

```yaml
version: "3.8"          # Compose specification version

services:               # Danh sách các containers
  mongodb:              # Tên service (tùy chọn)
    # ... config cho mongodb container

  backend:
    # ... config cho backend container

  frontend:
    # ... config cho frontend container

volumes:                # Khai báo named volumes (ở top level)
  mongo-data:
  logs:
```

---

## Vị trí file

Tạo file `docker-compose.yml` tại **root của project**:

```
my-project/
├── docker-compose.yml    ← File Compose ở đây
├── backend/
│   ├── Dockerfile
│   ├── app.js
│   └── package.json
├── frontend/
│   ├── Dockerfile
│   ├── src/
│   └── package.json
└── env/
    ├── mongo.env
    └── backend.env
```

---

## `version` — Compose Specification Version

```yaml
version: "3.8"
```

- Không phải version của app hay file
- Xác định **Compose specification** nào được dùng
- Ảnh hưởng đến features có thể dùng
- Version mới hơn = nhiều features hơn (nhưng thường backward compatible)

**Lưu ý:** Với Docker Compose v2+ (plugin), bạn có thể bỏ qua `version` field — nó đã bị deprecated nhưng vẫn hoạt động.

---

## `services` — Định nghĩa Containers

`services` là phần quan trọng nhất. Mỗi service = 1 container:

```yaml
services:
  # Tên service (bạn đặt tùy ý)
  # Docker dùng tên này để DNS resolution trong network
  mongodb:
    # config ...

  backend:
    # config ...

  frontend:
    # config ...
```

**Quan trọng:** Tên service trong Compose = hostname để các service gọi nhau trong network.

---

## `image` vs `build` — Chọn Image

### `image`: Dùng image sẵn có

```yaml
services:
  mongodb:
    image: mongo          # Pull từ Docker Hub
    
  database:
    image: postgres:15    # Với tag cụ thể
    
  cache:
    image: redis:alpine
```

### `build`: Build từ Dockerfile

```yaml
services:
  backend:
    build: ./backend      # Path đến folder chứa Dockerfile
    # Tương đương: docker build ./backend
    
  frontend:
    build: ./frontend
```

**Form dài của `build`** (khi Dockerfile có tên khác hoặc context đặc biệt):

```yaml
services:
  backend:
    build:
      context: ./backend           # Folder build context
      dockerfile: Dockerfile.dev   # Tên Dockerfile (nếu không phải "Dockerfile")
      args:                        # Build arguments
        NODE_VERSION: "18"
```

---

## `volumes` — Top-level vs Per-Service

### Named Volumes phải khai báo ở 2 chỗ

```yaml
services:
  mongodb:
    volumes:
      - mongo-data:/data/db      # Dùng named volume "mongo-data"
  
  backend:
    volumes:
      - logs:/app/logs            # Dùng named volume "logs"

# PHẢI khai báo named volumes ở đây
volumes:
  mongo-data:            # Tên volume, không cần value
  logs:
```

### Bind Mounts và Anonymous Volumes

```yaml
services:
  backend:
    volumes:
      - logs:/app/logs            # Named — cần khai báo ở top-level
      - ./backend:/app            # Bind mount — KHÔNG cần khai báo
      - /app/node_modules         # Anonymous — KHÔNG cần khai báo
```

**Quy tắc top-level volumes:**
- Named volumes → phải khai báo
- Bind mounts → không cần khai báo  
- Anonymous volumes → không cần khai báo

---

## `networks` — Thường không cần khai báo

Docker Compose tự động tạo một **default network** và thêm tất cả services vào đó:

```yaml
# Không cần khai báo network — Docker Compose tự tạo
services:
  mongodb:
    image: mongo          # Tự động trong default network

  backend:
    build: ./backend      # Cũng trong cùng network
    # backend có thể gọi "mongodb" như là hostname
```

**Khi nào cần khai báo network thủ công?**

```yaml
# Chỉ cần khi muốn isolate services hoặc dùng nhiều networks
services:
  frontend:
    networks:
      - frontend-net
  
  backend:
    networks:
      - frontend-net
      - backend-net
  
  mongodb:
    networks:
      - backend-net

networks:
  frontend-net:
  backend-net:
```

---

## Template đầy đủ

```yaml
version: "3.8"

services:

  mongodb:
    image: mongo
    volumes:
      - mongo-data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: secret

  backend:
    build: ./backend
    ports:
      - "80:80"
    volumes:
      - logs:/app/logs
      - ./backend:/app
      - /app/node_modules
    env_file:
      - ./env/backend.env
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    volumes:
      - ./frontend/src:/app/src
    stdin_open: true
    tty: true
    depends_on:
      - backend

volumes:
  mongo-data:
  logs:
```

---

**Tiếp theo:** Chi tiết cấu hình từng service →

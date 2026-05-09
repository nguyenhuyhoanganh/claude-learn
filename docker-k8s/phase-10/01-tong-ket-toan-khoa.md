# Tổng Kết: Docker & Containers — Toàn Bộ Khóa Học

## 1. Concepts Cốt Lõi: Images & Containers

```
IMAGE                          CONTAINER
  ├── Dockerfile → build         ├── Thin read-write layer
  ├── Chứa code + environment    ├── Chạy code trong image
  ├── Read-only                  ├── Isolated từ host
  ├── Layered (cache)            ├── Có thể có nhiều từ 1 image
  ├── Shareable (Docker Hub)     └── Stateless by default
  └── Blueprint cho containers
```

### Containers tập trung vào 1 nhiệm vụ
```
✓ 1 container = 1 web server
✓ 1 container = 1 database
✗ Không: 1 container = web server + database + cache
```

### Images là Immutable
```
Image được build → không thay đổi
Container tạo mới → fresh layer mỗi lần
Data trong container → mất khi container remove
```

---

## 2. Key Commands

### Image Commands

```bash
# Build image
docker build -t name:tag .
docker build -t name:tag -f path/to/Dockerfile .

# List images
docker images

# Remove image
docker rmi image-name

# Push/Pull từ Docker Hub
docker login
docker tag local-name USERNAME/repo-name
docker push USERNAME/repo-name
docker pull USERNAME/repo-name
```

### Container Commands

```bash
# Run container
docker run image-name                     # Foreground
docker run -d image-name                  # Detached
docker run --rm image-name               # Auto-remove khi stop
docker run --name my-app image-name      # Đặt tên
docker run -p 3000:80 image-name         # Port mapping (host:container)
docker run -e KEY=VALUE image-name       # Environment variable
docker run -v /host/path:/container/path image-name  # Bind mount
docker run -v volume-name:/container/path image-name # Named volume

# Lifecycle
docker ps                  # List running containers
docker ps -a               # List all containers
docker stop container-name
docker start container-name
docker rm container-name

# Exec inside container
docker exec -it container-name bash
docker exec container-name command
```

---

## 3. Data, Volumes & Networking

### Volumes — 3 Loại

```bash
# 1. Anonymous Volume (tạm thời, mất khi container remove)
docker run -v /container/path image-name
# → Dùng để bảo vệ folder trong container không bị override

# 2. Named Volume (persist, Docker quản lý location)
docker run -v data:/container/path image-name
# → Dùng để persist database, user uploads

# 3. Bind Mount (sync folder host ↔ container)
docker run -v $(pwd)/src:/container/path image-name
# → Dùng trong development để live-reload code
```

### Networking — Container Communication

```bash
# Tạo network
docker network create my-network

# Thêm container vào network
docker run --network my-network --name mongo mongo
docker run --network my-network my-app
# → my-app có thể dùng "mongo" làm hostname
```

```
Container types:
  → World (internet): Mặc định, container gửi được request ra ngoài
  → Host machine: localhost KHÔNG work; dùng host.docker.internal
  → Other containers: Cần cùng network; dùng container name làm hostname
```

---

## 4. Docker Compose

```yaml
# docker-compose.yml
version: "3.8"

services:
  # Application containers (chạy với docker compose up)
  web:
    build: .                    # hoặc image: nginx
    ports:
      - "3000:80"
    environment:
      - NODE_ENV=development
    env_file:
      - ./config.env
    volumes:
      - ./src:/app/src           # Bind mount
      - data:/app/data           # Named volume
    depends_on:
      - db
    stdin_open: true             # -i
    tty: true                    # -t

  db:
    image: mongo:5
    volumes:
      - mongo-data:/data/db

volumes:
  data:
  mongo-data:
```

```bash
# Commands
docker compose up              # Start all services (foreground)
docker compose up -d           # Detached
docker compose up --build      # Force rebuild images
docker compose up service-name # Start specific service + dependencies

docker compose down            # Stop và remove containers
docker compose down -v         # + Remove volumes

docker compose run --rm service-name command  # Run one-off command
```

---

## 5. Utility Containers

```yaml
# Containers chạy 1 lần, không chạy liên tục
composer:
  build: ./dockerfiles/composer.dockerfile
  volumes:
    - ./src:/var/www/html
  entrypoint: ["composer"]

npm:
  image: node:18-alpine
  working_dir: /var/www/html
  entrypoint: ["npm"]
  volumes:
    - ./src:/var/www/html
```

```bash
docker compose run --rm composer install
docker compose run --rm npm run build
```

---

## 6. Local Development vs Production

| Aspect | Development | Production |
|---|---|---|
| Code source | Bind mount (live) | COPY trong image |
| Config | Bind mount hoặc env file | Env vars hoặc secrets |
| Hot-reload | Bind mount + nodemon | Không cần |
| Database | Local container | Managed service (Atlas, RDS) |
| Server | Dev server (npm start) | Production server (nginx, node) |
| Rebuild | Khi Dockerfile thay đổi | Khi code thay đổi |

---

## 7. Multi-Stage Builds

```dockerfile
# Dockerfile.prod

# Stage 1: Build code
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build           # → /app/build/

# Stage 2: Serve (final image)
FROM nginx:stable-alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
docker build -f Dockerfile.prod .           # Full build
docker build --target build .               # Build đến stage "build"
```

---

## 8. Deployment

### Phương pháp 1: DIY (EC2)

```bash
# Remote machine
ssh -i key.pem ec2-user@PUBLIC_IP
sudo amazon-linux-extras install docker
sudo service docker start
sudo docker run -d -p 80:80 USERNAME/my-app
```

### Phương pháp 2: Managed Service (ECS)

```
ECS Hierarchy:
  Cluster
    └── Service
          └── Task (runs on 1 machine)
                ├── Container A
                └── Container B (communicate via localhost)
```

### Key Rules

```
✓ COPY thay vì bind mounts trong production
✓ localhost (không phải container name) trong ECS cùng task
✓ Load Balancer cho stable URL
✓ EFS hoặc managed DB cho persistent data
✓ Multi-stage builds cho apps cần build step
✗ Browser code KHÔNG thể dùng container names
✗ Docker env vars KHÔNG inject vào React/browser code
```

---

## 9. Trade-offs Summary

```
Control ←──────────────────────────────────→ Ease-of-use
High                                          High
  │                                             │
EC2 (DIY)     ECS (Managed)    MongoDB Atlas   │
Full control  Less control     No DB management │
Full          AWS manages      Provider manages │
responsibility OS/security      everything      │
```

---

## 10. Khi Nào Dùng Gì?

| Tình huống | Tool |
|---|---|
| Development live-reload | Bind mount + nodemon |
| Persist user data | Named volume |
| Prevent bind mount overwrite | Anonymous volume |
| Run Node.js PHP app locally | docker run / compose |
| Multiple containers local | Docker Compose |
| One-off commands (composer, artisan) | docker compose run --rm |
| Deploy đơn giản, có DevOps | EC2 |
| Deploy nhanh, không có DevOps | ECS/Managed service |
| Database production | MongoDB Atlas / AWS RDS |
| React/Vue production | Multi-stage + nginx |
| Stable production URL | Load Balancer |
| Persistent data in cloud | EFS (ECS) / Managed volumes |

---

**Tiếp theo:** Phase 11 — Getting Started with Kubernetes →

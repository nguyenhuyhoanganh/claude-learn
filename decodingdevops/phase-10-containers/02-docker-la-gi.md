# Bài 2: Docker overview — engine, image, registry

Docker là **tool dùng nhiều nhất** để work với container. Bài này giới thiệu architecture và workflow. Section 27-28 sẽ deep-dive.

## Docker là gì?

> **Docker** = platform xây dựng + chạy + share container. Bao gồm CLI (`docker`), daemon (`dockerd`), image format, hub registry.

Docker không **invent** container, nhưng **popularize**. Trước Docker, dùng LXC phức tạp. Docker đơn giản hoá: 1 lệnh `docker run` → container chạy.

## Docker architecture

```text
           +────────────+
           │  docker    │  ← CLI tool
           │  (client)  │
           +─────┬──────+
                 │ REST API
                 ▼
           +────────────────────+
           │  Docker Daemon     │  ← Server, manage container
           │  (dockerd)         │
           +─────┬──────────────+
                 │
        ┌────────┼────────────┐
        ▼        ▼            ▼
   +────────+ +─────────+ +───────────+
   │ Image  │ │Container│ │ Network   │
   │ Cache  │ │ Runtime │ │ Volume    │
   +────────+ +─────────+ +───────────+
                 │
                 ▼
           +────────────────+
           │ containerd     │ ← Lower-level runtime
           +────────────────+
                 │
                 ▼
           +────────────────+
           │ runc           │ ← Spawn process với namespaces
           +────────────────+
                 │
                 ▼
           Linux kernel (namespaces, cgroups)
```

### Docker Client (CLI)

```bash
docker run nginx
docker ps
docker pull alpine
docker build .
```

Lệnh gửi REST API request đến Docker daemon.

### Docker Daemon (`dockerd`)

Background process listen Unix socket `/var/run/docker.sock`. Nhận request, manage container.

**Mặc định cần root** → cẩn thận. Modern alternative: **Podman** rootless.

### Image registry

Image lưu ở:
- Local cache (`/var/lib/docker/image/`).
- Remote registry (Docker Hub, ECR, GHCR).

## Cài Docker

### Ubuntu

```bash
# Official method
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user vào group docker (không cần sudo)
sudo usermod -aG docker $USER
newgrp docker
```

### CentOS/RHEL

```bash
sudo dnf install -y dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

### macOS / Windows

Download **Docker Desktop**: docker.com/products/docker-desktop. GUI app.

### Verify

```bash
docker --version
# Docker version 27.x.x

docker info
# Server info

docker run hello-world
# Hello from Docker!
```

## Docker workflow cơ bản

```text
1. Write Dockerfile          (describe image build)
2. docker build → image      (build image)
3. docker push → registry    (upload)
4. docker pull               (download trên server khác)
5. docker run → container    (chạy)
```

## 5 lệnh quan trọng nhất

```bash
docker run IMAGE                   # Tạo + chạy container
docker ps                          # List container đang chạy
docker images                      # List image local
docker pull IMAGE                  # Tải image từ registry
docker build -t NAME .             # Build image từ Dockerfile
```

## Run container — `docker run`

```bash
# Basic
docker run nginx

# Detached (background)
docker run -d nginx

# Named
docker run -d --name web nginx

# Port forward (host:container)
docker run -d -p 8080:80 nginx
# Truy cập http://localhost:8080 → nginx port 80

# Env variable
docker run -d -e MYSQL_ROOT_PASSWORD=secret mysql:8

# Volume mount
docker run -d -v /host/path:/container/path nginx
docker run -d -v mydata:/data alpine          # Named volume

# Interactive shell
docker run -it ubuntu bash                    # -i interactive, -t TTY

# Resource limit
docker run -d --memory 512m --cpus 0.5 nginx

# Auto-remove khi stop
docker run --rm -it alpine sh

# Restart policy
docker run -d --restart always nginx
docker run -d --restart unless-stopped nginx
```

## List + inspect container

```bash
docker ps                          # Running
docker ps -a                       # Tất cả (kể cả stopped)
docker ps -q                       # Chỉ ID

docker inspect CONTAINER           # JSON detailed info
docker stats                       # Real-time CPU/RAM
docker top CONTAINER               # Process inside
docker logs CONTAINER              # Stdout/stderr
docker logs -f CONTAINER           # Follow (live tail)
docker logs --tail 100 CONTAINER
```

## Control container

```bash
docker stop CONTAINER              # SIGTERM rồi SIGKILL (10s)
docker kill CONTAINER              # SIGKILL ngay
docker restart CONTAINER
docker pause CONTAINER             # Freeze (SIGSTOP)
docker unpause CONTAINER
docker rm CONTAINER                # Xoá (phải stop trước)
docker rm -f CONTAINER             # Force xoá
docker rm $(docker ps -aq)         # Xoá MỌI container
```

## Vào trong container

```bash
docker exec -it CONTAINER bash     # Mở shell mới
docker exec -it CONTAINER sh       # Alpine không có bash, dùng sh
docker exec CONTAINER ls /app      # Chạy 1 lệnh

# Attach vào TTY chính (cẩn thận!)
docker attach CONTAINER
# Ctrl+P, Ctrl+Q để detach mà không stop
```

## Image management

```bash
docker images                      # List local image
docker pull nginx:1.25             # Tải
docker rmi nginx:1.25              # Xoá image
docker rmi -f nginx                # Force

docker image prune                 # Xoá dangling
docker image prune -a              # Xoá tất cả không dùng
docker system prune -a --volumes   # Xoá HẾT mọi unused (cẩn thận)
```

## Build image — `docker build`

`Dockerfile`:

```dockerfile
FROM ubuntu:22.04

LABEL maintainer="me@acme.com"

RUN apt update && apt install -y curl

WORKDIR /app

COPY app.sh .

RUN chmod +x app.sh

ENV PORT=8080

EXPOSE 8080

CMD ["./app.sh"]
```

```bash
docker build -t myapp:v1 .
docker build -t myapp:v1 -f Dockerfile.prod .
docker build --no-cache -t myapp:v1 .

# Multi-platform
docker buildx build --platform linux/amd64,linux/arm64 -t myapp:v1 .
```

Section 27 sẽ deep-dive Dockerfile.

## Tag và push lên registry

```bash
# Tag image
docker tag myapp:v1 username/myapp:v1
docker tag myapp:v1 ghcr.io/owner/myapp:v1

# Login
docker login                                    # Docker Hub
docker login ghcr.io -u USERNAME -p TOKEN
docker login -u AWS -p $(aws ecr get-login-password) ACCOUNT.dkr.ecr.REGION.amazonaws.com

# Push
docker push username/myapp:v1
```

## Network

Docker tự tạo network. Container cùng network reach nhau bằng tên:

```bash
docker network create mynet

docker run -d --name db --network mynet mariadb:11
docker run -d --name web --network mynet \
       -e DB_HOST=db                              # Reach DB bằng tên
       myapp

# Built-in network
docker network ls
# bridge      ← Default
# host        ← Share network host
# none        ← Không có network
```

## Volume — persistent storage

Container data **mất khi xoá container**. Dùng volume để giữ:

```bash
# Named volume (Docker manage)
docker volume create mydata
docker run -d -v mydata:/data alpine
docker volume ls
docker volume inspect mydata

# Bind mount (folder host)
docker run -d -v /host/path:/data alpine
docker run -d -v $(pwd)/code:/app node       # Live reload dev

# Anonymous volume (Docker tạo tự động)
docker run -d -v /data alpine
```

Production DB: dùng **named volume**, hoặc cloud storage (AWS EBS).

## Docker Compose — multi-container

`docker-compose.yml`:

```yaml
version: '3.9'
services:
  db:
    image: mariadb:11
    environment:
      MYSQL_ROOT_PASSWORD: secret
      MYSQL_DATABASE: app
    volumes:
      - dbdata:/var/lib/mysql

  cache:
    image: memcached:1.6-alpine

  web:
    image: nginx:1.25
    ports:
      - "8080:80"
    depends_on:
      - db
      - cache

volumes:
  dbdata:
```

```bash
docker compose up -d                # Up tất cả service
docker compose ps                   # Status
docker compose logs -f
docker compose down                 # Stop + remove
docker compose down -v              # + volumes (xoá data)
```

Compose = mini-orchestrator, tốt cho dev local.

## Production = Kubernetes

Docker giải bài "run 1 container". Production cần:
- Scale 100s container.
- Health check + auto-restart.
- Rolling deploy.
- Service discovery.
- Multi-host.

→ **Kubernetes** (section 29-30).

Docker vẫn dùng — chỉ là K8s schedule containers, runtime vẫn containerd/cri-o.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| `docker run` mà không `--rm` | Container stopped tích lại | `--rm` tự xoá khi stop |
| Image latest tag | Bug reproduce khó | Pin version `:1.25.3` |
| Cài `apt update` không clean cache | Image phình | `&& rm -rf /var/lib/apt/lists/*` |
| COPY toàn folder | Layer cache fail | COPY chính xác cái cần |
| Multiple RUN | Nhiều layer | `&&` chain |
| Run as root trong container | Security | `USER 1000` |
| Log vào file in container | Khó access | Log stdout/stderr |
| Persistent data trong container | Mất | Volume mount |

## Quick reference

```text
# Container
docker run [-d --name -p -v -e -it --rm] IMAGE [CMD]
docker ps [-a -q]
docker exec -it CONTAINER bash
docker logs [-f --tail N] CONTAINER
docker stop / kill / restart / rm CONTAINER

# Image
docker images
docker pull IMAGE[:TAG]
docker build -t NAME[:TAG] [-f Dockerfile] PATH
docker tag SRC DST
docker push DST
docker rmi IMAGE

# Network
docker network create NAME
docker network ls

# Volume
docker volume create NAME
docker volume ls

# System
docker stats
docker system prune [-a --volumes]
docker info
```

## Tóm tắt bài 2

- **Docker** = client (`docker`) + daemon (`dockerd`) + image format + registry.
- **`docker run -d -p host:container -v host:container --name X IMAGE`** = công thức cơ bản.
- **Image** local cache, tag để version. Pull từ Docker Hub / ECR / GHCR.
- **`docker compose`** quản multi-container stack cho dev local.
- Container = process; **không lưu data trong container** — dùng volume.
- Production scale = Kubernetes; Docker là runtime under it.

**Bài kế tiếp** → [Bài 3: Hands-on Docker — vProfile trong container](03-docker-hands-on.md)

# Bài 3: Hands-on Docker — chạy thực tế các container

Practice 5 container thực: nginx, MySQL, Redis, app Node, multi-container. Mỗi container 1 lesson, vài phút.

## Lab 1: nginx — first container

```bash
# Pull image
docker pull nginx:1.25

# Run
docker run -d -p 8080:80 --name web nginx:1.25

# Verify
docker ps
# CONTAINER ID   IMAGE        COMMAND  ...  PORTS                  NAMES
# abc123         nginx:1.25   "nginx"  ...  0.0.0.0:8080->80/tcp   web

# Test
curl http://localhost:8080
# <h1>Welcome to nginx!</h1>

# Logs
docker logs web

# Cleanup
docker stop web
docker rm web
```

## Lab 2: Custom HTML

```bash
# Tạo HTML
mkdir -p ~/docker-lab/html
echo "<h1>Hello Docker</h1>" > ~/docker-lab/html/index.html

# Mount vào nginx
docker run -d -p 8080:80 \
  -v ~/docker-lab/html:/usr/share/nginx/html \
  --name web2 \
  nginx:1.25

curl http://localhost:8080
# <h1>Hello Docker</h1>

# Sửa file local
echo "<h1>Updated</h1>" > ~/docker-lab/html/index.html
curl http://localhost:8080
# <h1>Updated</h1>
# → Volume mount = file đồng bộ ngay

docker rm -f web2
```

## Lab 3: MySQL với persistent data

```bash
# Tạo named volume
docker volume create mysqldata

# Run MySQL
docker run -d \
  --name db \
  -e MYSQL_ROOT_PASSWORD=secret \
  -e MYSQL_DATABASE=app \
  -v mysqldata:/var/lib/mysql \
  -p 3306:3306 \
  mariadb:11

# Đợi 10s cho MySQL startup
sleep 10
docker logs db | tail

# Connect từ host (cần mysql client)
mysql -h 127.0.0.1 -P 3306 -u root -psecret -e "SHOW DATABASES;"

# Tạo data
mysql -h 127.0.0.1 -P 3306 -u root -psecret app -e "
CREATE TABLE users (id INT, name VARCHAR(50));
INSERT INTO users VALUES (1, 'Alice');
SELECT * FROM users;
"

# Stop + remove container
docker rm -f db

# Run lại từ cùng volume
docker run -d --name db -e MYSQL_ROOT_PASSWORD=secret \
  -v mysqldata:/var/lib/mysql -p 3306:3306 mariadb:11

sleep 10

# Data vẫn còn
mysql -h 127.0.0.1 -P 3306 -u root -psecret app -e "SELECT * FROM users;"
# 1  Alice    ← Persist qua volume

docker rm -f db
```

## Lab 4: Exec vào container

```bash
docker run -d --name web nginx:1.25

# Mở shell
docker exec -it web bash
# root@abc:/#

# Trong container
cat /etc/nginx/nginx.conf
ls /usr/share/nginx/html
ps aux

exit

# Chạy 1 lệnh
docker exec web ls /etc/nginx/conf.d
# default.conf

docker rm -f web
```

## Lab 5: Container alpine — debug + tool

Alpine: image siêu nhỏ ~5 MB, dùng cho debug nhanh.

```bash
# Ephemeral shell
docker run --rm -it alpine sh
# / # apk add curl
# / # curl https://example.com
# / # exit

# Container debug network
docker run --rm -it --network host nicolaka/netshoot
# Trong container có nmap, dig, mtr, tcpdump, ...
```

## Lab 6: Build first image

```bash
mkdir ~/myapp && cd ~/myapp

# App đơn giản
cat > app.py <<'EOF'
from http.server import HTTPServer, BaseHTTPRequestHandler
import os

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(f"Hello from {os.uname().nodename}\n".encode())

if __name__ == '__main__':
    print("Server starting on port 8000")
    HTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
EOF

# Dockerfile
cat > Dockerfile <<'EOF'
FROM python:3.12-alpine
WORKDIR /app
COPY app.py .
EXPOSE 8000
CMD ["python", "app.py"]
EOF

# Build
docker build -t myapp:v1 .

# Run
docker run -d -p 8000:8000 --name api myapp:v1

# Test
curl http://localhost:8000
# Hello from abc123def456 (hostname = container ID)

# Stop
docker rm -f api
```

## Lab 7: Multi-container với network

```bash
# Tạo network
docker network create app-net

# DB
docker run -d --network app-net --name db \
  -e MYSQL_ROOT_PASSWORD=secret \
  -e MYSQL_DATABASE=app \
  mariadb:11

# Redis
docker run -d --network app-net --name cache redis:7-alpine

# Web (giả lập)
docker run -d --network app-net --name web \
  -p 8080:80 \
  -e DB_HOST=db \
  -e CACHE_HOST=cache \
  nginx:1.25

# Test reach từ web → db, cache
docker exec web sh -c "apt update && apt install -y iputils-ping mysql-client"
docker exec web ping -c 2 db
docker exec web ping -c 2 cache
docker exec web mysql -h db -u root -psecret -e "SHOW DATABASES;"

# Cleanup
docker rm -f web db cache
docker network rm app-net
```

Container reach nhau bằng **tên** (`db`, `cache`) — Docker DNS resolve.

## Lab 8: Docker Compose — vProfile clone

`docker-compose.yml`:

```yaml
version: '3.9'

services:
  db:
    image: mariadb:11
    container_name: db01
    environment:
      MYSQL_ROOT_PASSWORD: admin123
      MYSQL_DATABASE: accounts
    volumes:
      - dbdata:/var/lib/mysql
    networks:
      - vprofile-net

  cache:
    image: memcached:1.6-alpine
    container_name: mc01
    networks:
      - vprofile-net

  queue:
    image: rabbitmq:3.12-management
    container_name: rmq01
    environment:
      RABBITMQ_DEFAULT_USER: test
      RABBITMQ_DEFAULT_PASS: test
    ports:
      - "15672:15672"
    networks:
      - vprofile-net

  app:
    image: tomcat:10-jdk17
    container_name: app01
    depends_on:
      - db
      - cache
      - queue
    ports:
      - "8080:8080"
    networks:
      - vprofile-net

  web:
    image: nginx:1.25
    container_name: web01
    ports:
      - "80:80"
    depends_on:
      - app
    networks:
      - vprofile-net

networks:
  vprofile-net:

volumes:
  dbdata:
```

```bash
docker compose up -d
docker compose ps
docker compose logs -f app
docker compose down
docker compose down -v        # + xoá volume
```

5 container, 1 lệnh. So với vagrant up bài 8 (15 phút) → **30 giây**.

Section 27-28 sẽ build Dockerfile thật cho vProfile + Compose production.

## Lab 9: Image inspection

```bash
# Layer của image
docker history nginx:1.25

# Detail
docker inspect nginx:1.25 | jq '.[0].Config'

# Size
docker images
# nginx:1.25  ...  187MB
# alpine      ...  7MB

# Layer trên disk
docker system df
# TYPE      TOTAL  ACTIVE   SIZE     RECLAIMABLE
# Images    10     2        1.5GB    1.2GB
# Containers 5     1        50MB     45MB
# Volumes   3      1        500MB    300MB
```

## Lab 10: Cleanup

```bash
# Xoá container stopped
docker container prune

# Xoá image dangling
docker image prune

# Xoá tất cả unused
docker system prune

# Xoá HẾT (kể cả tagged image không dùng)
docker system prune -a

# + volumes
docker system prune -a --volumes
```

Cẩn thận `-a --volumes`: xoá luôn data DB nếu volume không attached container.

## Workflow daily

```bash
# Sáng
docker compose up -d              # Start local stack
docker compose logs -f web        # Watch log khi dev

# Trong day
docker compose restart web        # Restart 1 service
docker compose exec db mysql -u root -p     # Debug DB

# Build & test image mới
docker build -t myapp:dev .
docker run --rm -p 8000:8000 myapp:dev

# Tối
docker compose down               # Stop
# Hoặc:
docker compose stop               # Stop nhưng giữ container
```

## Tips production-grade

### Image nhỏ — multi-stage build

```dockerfile
# Stage 1: Build
FROM golang:1.22 AS builder
WORKDIR /src
COPY . .
RUN go build -o app

# Stage 2: Runtime (chỉ chứa binary)
FROM alpine:3.19
COPY --from=builder /src/app /app
CMD ["/app"]
```

Image cuối ~10 MB thay vì 1 GB.

### Healthcheck

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -f http://localhost:8000/health || exit 1
```

Docker auto-restart container fail healthcheck (với Swarm) hoặc K8s đọc.

### Run as non-root

```dockerfile
RUN useradd -r -u 1001 appuser
USER appuser
CMD ["./app"]
```

Bảo mật: container compromise → attacker chỉ có quyền non-root.

### .dockerignore

Giống `.gitignore`:

```text
.git
node_modules
*.log
.env
Dockerfile.dev
```

Tránh copy file rác vào image.

## Bẫy thường gặp lab

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| `-p 80:80` mà host port đã dùng | Bind fail | Đổi host port hoặc free |
| Quên `-d` | Container chiếm terminal | `-d` detach hoặc Ctrl+C để stop |
| `docker rm` quên `-f` | Stopped container vẫn block | `-f` force hoặc stop trước |
| Volume mount path không tồn tại | Docker tạo empty | Verify path host tồn tại |
| MySQL chưa ready khi web up | Web fail connect | `depends_on` + retry trong app |
| Mac/Win bind mount chậm | Dev lag | Dùng named volume hoặc Mutagen |
| Compose conflict tên container | Name conflict | `--remove-orphans` hoặc xoá tay |

## Tóm tắt bài 3

- 10 lab progressive: từ nginx → MySQL volume → multi-container compose.
- **`docker exec -it CONTAINER bash`** vào shell debug.
- **Network bridge** auto, reach container khác qua tên.
- **Named volume** persist data qua container restart.
- **Compose** quản multi-container stack 1 file.
- `docker system prune` cleanup khi disk đầy.
- Production: multi-stage build, healthcheck, non-root user.

**Bài kế tiếp** → [Bài 4: Microservices — khi monolith không đủ](04-microservices-intro.md)

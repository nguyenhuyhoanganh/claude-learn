# Phase 2: Chạy NGINX trong Docker - Tổng quan

## Tại sao dùng Docker?

Docker chạy trên mọi OS (Windows, Linux, Mac) → Không bị giới hạn bởi local machine setup.

**Docker là gì?**
```
Docker = Thin layer trên OS để tạo isolated containers
Container = Process isolated từ OS, có thể chạy trong "private namespace"
Image = Template để tạo containers (như Class trong OOP)
Container = Instance của Image (như Object)
```

---

## Chúng ta sẽ build gì?

### Bước 1: NGINX Web Server đơn giản
```
Host Machine (Port 80)
  ↓
NGINX Container (Port 80) - hostname: ng1
  → Serve HTML files từ volume mount
```

### Bước 2: 3 Node.js App Containers + NGINX
```
Host Machine (Port 8080)
  ↓
NGINX Container (Port 8080) - Load balancer (Layer 7)
  ├── NodeApp 1 (Port 8080) - hostname: nodeapp1
  ├── NodeApp 2 (Port 8080) - hostname: nodeapp2
  └── NodeApp 3 (Port 8080) - hostname: nodeapp3

Tất cả trong cùng Docker network: backend-net
```

### Bước 3: 2 NGINX Containers → Same Backends
```
Host Port 80  → NGINX Container 1 (ng1)
Host Port 81  → NGINX Container 2 (ng2)
Both pointing to same 3 Node.js backends
```

---

## Docker Concepts Cần Biết

### Image vs Container
```
Image (nginx:latest)
  ├── Container A (name: nginx1, port 80→80)
  ├── Container B (name: nginx2, port 81→80)
  └── Container C (name: nginx3, port 82→80)
```

### Ports: Host Port vs Container Port
```
docker run -p 8080:80 nginx
            ↑     ↑
        Host port  Container port
(Truy cập từ host)  (NGINX lắng nghe trong container)
```

### Volumes: Map thư mục Host → Container
```
docker run -v /host/html:/usr/share/nginx/html nginx
               ↑                    ↑
         Host directory      Container directory
```

### Hostnames: Tên trong Docker network
```
Containers trong cùng network có thể gọi nhau bằng hostname:
- NGINX config: proxy_pass http://nodeapp1:8080;
- Docker resolves "nodeapp1" → IP của container
```

---

## Docker Commands Cơ bản

```bash
# Spin up container
docker run --name nginx1 --hostname ng1 -p 80:80 -d nginx

# List running containers
docker ps

# Stop container
docker stop nginx1

# Remove container
docker rm nginx1

# Inspect container (xem IP, network, mounts)
docker inspect nginx1

# View logs
docker logs nginx1

# Create network
docker network create backend-net

# Connect container to network
docker network connect backend-net nginx1

# Bash into container
docker exec -it nginx1 bash
```

---
**Tiếp theo:** Bài 1 - NGINX WebServer Container →

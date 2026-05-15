# Bài 1: NGINX WebServer Container

## Mục tiêu

Spin up NGINX container và serve HTML page tùy chỉnh.

---

## Bước 1: Spin up NGINX container đơn giản

```bash
docker run \
  --name nginx \
  --hostname ng1 \
  -p 80:80 \
  -d \
  nginx
```

**Giải thích các flags:**
- `--name nginx`: Tên container (dùng để quản lý)
- `--hostname ng1`: Hostname trong Docker network (dùng để giao tiếp giữa containers)
- `-p 80:80`: Map host port 80 → container port 80
- `-d`: Detach (chạy background, không block terminal)
- `nginx`: Image name

**Test:**
```bash
curl http://localhost:80
# → "Welcome to nginx!"
```

---

## Bước 2: Serve HTML tùy chỉnh với Volume Mount

### Tạo HTML page
```bash
mkdir html
echo "<h1>Hello from my NGINX!</h1>" > html/index.html
```

### Spin up với volume mount
```bash
docker stop nginx && docker rm nginx

docker run \
  --name nginx \
  --hostname ng1 \
  -p 80:80 \
  -v $(pwd)/html:/usr/share/nginx/html \
  -d \
  nginx
```

**`-v $(pwd)/html:/usr/share/nginx/html`** nghĩa là:
- Thay vì dùng files trong container tại `/usr/share/nginx/html`
- Dùng files từ host tại `$(pwd)/html`

**Test:**
```bash
curl http://localhost:80
# → "<h1>Hello from my NGINX!</h1>"
```

---

## Cách hoạt động

```
Browser/curl
  ↓ HTTP request
Host machine (Port 80)
  ↓ Port forwarding (IP tables)
NGINX Container (Port 80)
  ↓ Serve file
/usr/share/nginx/html/index.html
  ↑ Volume mount
$(pwd)/html/index.html (Host filesystem)
```

---

## Container Networking

Khi spin up container, nó tự động join **default bridge network**:

```bash
docker inspect nginx
# Xem mục "Networks" → "IPAddress": "172.17.0.2"
```

**Lưu ý về Mac:**
- Mac Docker không bridge network từ host → container
- Phải expose port (`-p`) để truy cập từ host
- Linux có thể truy cập container trực tiếp bằng IP

---

## Volume là gì?

Container có **ephemeral storage** — khi container bị xóa, data mất.

Volumes giải quyết bằng cách map directory từ host:
```
Host filesystem  ←──── mount ────→  Container filesystem
/my/html/folder  ←──── volume ────→  /usr/share/nginx/html
```

Khi NGINX đọc `/usr/share/nginx/html/index.html` trong container → thực ra đọc file ở host.

---
**Tiếp theo:** Bài 2 - Three Node App Containers →

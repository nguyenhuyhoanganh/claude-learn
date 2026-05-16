# Bài 2: Three Node App Containers + NGINX Load Balancer

## Mục tiêu

Build Node.js app → Dockerize → Load balance với NGINX.

---

## Bước 1: Tạo Node.js App

```javascript
// app/index.js
const express = require('express');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`Hello from ${os.hostname()}`);
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT} on ${os.hostname()}`);
});
```

```bash
cd app
npm init -y
npm install express
```

**Test locally:**
```bash
node index.js
curl http://localhost:8080
# → "Hello from your-machine-name"
```

---

## Bước 2: Dockerfile cho Node.js App

```dockerfile
# Dockerfile
FROM node:12          # Inherit từ official node:12 image

WORKDIR /home/node/app  # Working directory trong container

COPY app /home/node/app  # Copy app/ từ host vào container

RUN npm install       # Chạy khi BUILD image (cài dependencies)

CMD node index.js     # Chạy khi START container
```

**Giải thích:**
- `FROM`: Kế thừa từ base image (có Node.js sẵn)
- `WORKDIR`: Đặt working directory (tạo nếu chưa có)
- `COPY`: Copy files vào image lúc build
- `RUN`: Chạy command lúc build (install packages)
- `CMD`: Chạy lúc container start

**Build image:**
```bash
docker build -t node-app .
```

---

## Bước 3: Tạo Docker Network

Để các containers thấy nhau bằng hostname, phải tạo **custom network**:

```bash
docker network create backend-net
```

Với custom network, Docker tự động cung cấp DNS resolution:
- Trong cùng network: `curl http://nodeapp1:8080` sẽ resolve hostname

> **Tại sao không dùng default bridge network?**
> Default bridge network không có DNS resolution — containers phải dùng IP address.

---

## Bước 4: Spin up 3 Node.js Containers

```bash
# NodeApp 1
docker run \
  --name nodeapp1 \
  --hostname nodeapp1 \
  --network backend-net \
  -d \
  node-app

# NodeApp 2
docker run \
  --name nodeapp2 \
  --hostname nodeapp2 \
  --network backend-net \
  -d \
  node-app

# NodeApp 3
docker run \
  --name nodeapp3 \
  --hostname nodeapp3 \
  --network backend-net \
  -d \
  node-app
```

**Không expose ports ra ngoài** — backend không cần public!

---

## Bước 5: NGINX Config cho Load Balancer

```nginx
# nginx.conf
events {
    worker_connections 1024;
}

http {
    upstream node-backend {
        server nodeapp1:8080;
        server nodeapp2:8080;
        server nodeapp3:8080;
    }

    server {
        listen 8080;

        location / {
            proxy_pass http://node-backend;
        }
    }
}
```

---

## Bước 6: Spin up NGINX Container

```bash
docker run \
  --name nginx \
  --hostname ng1 \
  --network backend-net \
  -p 8080:8080 \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf \
  -d \
  nginx
```

---

## Test Load Balancing

```bash
curl http://localhost:8080
# → "Hello from nodeapp1"

curl http://localhost:8080
# → "Hello from nodeapp2"

curl http://localhost:8080
# → "Hello from nodeapp3"

curl http://localhost:8080
# → "Hello from nodeapp1"  ← Round robin!
```

**Tại sao biết đây là load balancing?**
- Mỗi app trả về hostname của container nó đang chạy trên
- Refresh nhiều lần → hostname thay đổi = đang được load balance!

---

## Cách Round Robin hoạt động với TCP

```
Browser → TCP connection → NGINX
NGINX nhớ state: "Request này đi nodeapp1, next đi nodeapp2..."

Request 1 → nodeapp1
Request 2 → nodeapp2
Request 3 → nodeapp3
Request 4 → nodeapp1  (cycle lại)
```

> **Lưu ý:** Browser dùng HTTP/1.1 với keep-alive → giữ TCP connection.
> Các requests trong cùng TCP connection có thể đi cùng một backend!

---
**Tiếp theo:** Bài 3 - Two NGINX Load Balancers →

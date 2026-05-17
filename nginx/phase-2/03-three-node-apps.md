# Bài 3: 3 Node app + NGINX load balancer trong custom network

Bài này là **bài "ah-ha"** của phase-2. Bạn sẽ thấy NGINX load balance round-robin **real-time** — refresh trang, hostname đổi. Đụng đến: build custom image, custom network, override config NGINX, upstream block.

## Bức tranh cuối cùng

```text
                    [your laptop]
                          │
                     port 8080
                          ▼
                  ┌──────────────────┐
                  │   NGINX ng1      │
                  │   :8080 internal │
                  └──┬───────┬───────┘
                     │       │       │
        round-robin  │       │       │
                     ▼       ▼       ▼
              ┌─────────┐ ┌────────┐ ┌────────┐
              │ node1   │ │ node2  │ │ node3  │
              │ :8080   │ │ :8080  │ │ :8080  │
              └─────────┘ └────────┘ └────────┘
                  ↑           ↑           ↑
                  └──── docker network: backend-net ─────┘
```

Browser → `localhost:8080` → NGINX → 1 trong 3 Node app (round-robin) → trả về hostname.

## Bước 1 — Code Node.js app trả hostname

Tạo cấu trúc thư mục:

```text
project/
├── app/
│   ├── index.js
│   └── package.json
├── nginx.conf
└── Dockerfile
```

`app/index.js`:

```javascript
const express = require('express');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.send(`Hello from ${os.hostname()}\n`);
});

app.listen(PORT, () => {
  console.log(`Listening on ${PORT} on ${os.hostname()}`);
});
```

`app/package.json`:

```json
{
  "name": "node-app",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

App siêu đơn giản — return tên hostname của container. **Đây là chìa khoá để verify load balance**: mỗi container có hostname riêng, browser refresh thấy hostname khác = round-robin đang chạy.

> Không bắt buộc Node.js. Có thể là Python Flask, Go net/http, Java Spring — miễn là trả về một string định danh duy nhất theo container.

## Bước 2 — Dockerfile cho Node app

`Dockerfile` (ở thư mục project gốc):

```dockerfile
FROM node:18-alpine

WORKDIR /home/node/app

COPY app/package.json .
RUN npm install --omit=dev

COPY app/ .

EXPOSE 8080
CMD ["node", "index.js"]
```

Phân tích từng directive:

| Directive | Khi nào chạy | Mục đích |
|---|---|---|
| `FROM node:18-alpine` | Lúc build | Base image — Node 18 + Alpine Linux (~50MB) |
| `WORKDIR /home/node/app` | Lúc build | Tạo + cd vào thư mục làm việc trong image |
| `COPY app/package.json .` | Lúc build | Chỉ copy package.json trước → cache layer cho `npm install` |
| `RUN npm install` | Lúc build | Cài deps trong khi build image — KHÔNG phải lúc run container |
| `COPY app/ .` | Lúc build | Copy source code (sau cùng vì source thay đổi nhiều, deps ổn định) |
| `EXPOSE 8080` | Document only | Báo hiệu cho người đọc/tool, **không tự mở port** |
| `CMD ["node", "index.js"]` | Lúc run | Lệnh chạy khi container start |

### `RUN` vs `CMD` — sai lầm phổ biến

| Directive | Khi nào execute | Ví dụ đúng |
|---|---|---|
| `RUN ...` | **Lúc `docker build`** — bake vào image | `RUN npm install` — cài lib một lần |
| `CMD ...` | **Lúc `docker run`** — mỗi lần start container | `CMD ["node", "index.js"]` — start server |

**Đừng** đặt `RUN node index.js` — image build sẽ treo vì cố start server lúc build.

**Đừng** đặt `CMD npm install && node index.js` — mỗi lần start container đều cài lại deps, chậm và phụ thuộc network.

### Vì sao copy `package.json` riêng trước source code?

Docker cache **theo layer**. Mỗi instruction = 1 layer. Nếu source code thay đổi (rất thường) nhưng deps không đổi, Docker reuse layer `RUN npm install` → build cực nhanh.

```text
Layer 1: FROM node:18-alpine            [cached]
Layer 2: WORKDIR                         [cached]
Layer 3: COPY package.json              [cached if file unchanged]
Layer 4: RUN npm install                 [cached if Layer 3 cached]
Layer 5: COPY app/  ← source thay đổi   [rebuild only this and below]
```

Nếu COPY source trước rồi npm install sau → mỗi lần code thay đổi, install lại từ đầu. Chậm.

### Build image

```bash
docker build -t node-app:1 .
```

`.` = build context = thư mục hiện tại. Docker đọc Dockerfile và mọi file COPY tham chiếu đến.

```bash
docker images | grep node-app
# node-app   1   abc123...   2 minutes ago   170MB
```

## Bước 3 — Custom Docker network

Tại sao cần? **Default bridge network không có DNS resolution**:

```text
Default bridge:                Custom network:
   container A → 172.17.0.2       container A → "node1" → resolves
   container B → 172.17.0.3       container B → "node2" → resolves
   A gọi B bằng "B"?  ❌          A gọi B bằng hostname?  ✓
   A gọi B bằng IP?    ✓          IP cũng được nhưng không cần
```

Tạo network:

```bash
docker network create backend-net
```

Verify:

```bash
docker network ls
# NETWORK ID     NAME           DRIVER    SCOPE
# ...            backend-net    bridge    local
# ...            bridge         bridge    local  (default)
```

## Bước 4 — Spin up 3 Node app container

```bash
docker run -d \
  --name node1 \
  --hostname node1 \
  --network backend-net \
  node-app:1

docker run -d \
  --name node2 \
  --hostname node2 \
  --network backend-net \
  node-app:1

docker run -d \
  --name node3 \
  --hostname node3 \
  --network backend-net \
  node-app:1
```

Phân tích:
- `--name` = tên container để Docker quản lý (`docker stop node1`).
- `--hostname` = `os.hostname()` mà app sẽ thấy → đây là cái sẽ hiện ra trong response.
- `--network backend-net` = join custom network → resolve được hostname của container khác cùng network.
- **Không có `-p`** — 3 backend này chỉ talk nội bộ với NGINX, không cần phơi ra host.

Verify cả 3 đang chạy:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Networks}}"
# NAMES   STATUS         NETWORKS
# node1   Up 5 seconds   backend-net
# node2   Up 4 seconds   backend-net
# node3   Up 3 seconds   backend-net
```

Test internal resolution (chạy lệnh **từ trong** một container):

```bash
docker exec -it node1 sh
> wget -qO- http://node2:8080
Hello from node2
> wget -qO- http://node3:8080
Hello from node3
> exit
```

→ Hostname resolution hoạt động. Đây là điểm khác biệt **chính** giữa custom network và default bridge.

## Bước 5 — NGINX config làm Layer 7 LB

`nginx.conf` (ghi đè toàn bộ config NGINX):

```nginx
events {
    worker_connections 1024;
}

http {
    upstream node_backend {
        server node1:8080;
        server node2:8080;
        server node3:8080;
    }

    server {
        listen 8080;

        location / {
            proxy_pass http://node_backend;
        }
    }
}
```

Phân tích:

- `events { worker_connections 1024; }` — block **bắt buộc** trong NGINX config. Số connection tối đa / worker.
- `http { ... }` — context Layer 7. Tất cả HTTP-related directive ở trong.
- `upstream node_backend { ... }` — nhóm các backend lại, đặt tên `node_backend`. **Default thuật toán = round-robin**.
- `server { listen 8080; ... }` — virtual server lắng nghe port 8080 *bên trong container*.
- `proxy_pass http://node_backend` — chuyển request đến upstream group đã định nghĩa.

> Để ý dùng **hostname** `node1`, `node2`, `node3` — đúng tên `--hostname` lúc spin up container. NGINX resolve qua Docker DNS.

## Bước 6 — Spin up NGINX với config tự mount

```bash
docker run -d \
  --name ng1 \
  --hostname ng1 \
  --network backend-net \
  -p 8080:8080 \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf \
  nginx:1.25
```

Hai điểm mới so với Bài 2:

| Điểm | Vì sao |
|---|---|
| `--network backend-net` | Phải cùng network với 3 backend để resolve hostname |
| `-v $(pwd)/nginx.conf:/etc/nginx/nginx.conf` | Override toàn bộ file config — không chỉ HTML |
| `-p 8080:8080` (thay vì `8080:80`) | NGINX trong config nghe `8080`, không phải `80` mặc định |

Verify NGINX không crash:

```bash
docker logs ng1
# (không có lỗi → OK)
```

Nếu có lỗi `host not found in upstream`, nghĩa là NGINX **không resolve được** `node1` (bài 5 đi sâu vào lý do, thường là network sai).

## Test load balancing — moment of truth

```bash
curl http://localhost:8080
# Hello from node1

curl http://localhost:8080
# Hello from node2

curl http://localhost:8080
# Hello from node3

curl http://localhost:8080
# Hello from node1     ← quay vòng
```

→ Round-robin hoạt động. Mỗi request → backend tiếp theo trong upstream list.

Test stress nhỏ:

```bash
for i in {1..12}; do curl -s http://localhost:8080; done
# Hello from node1
# Hello from node2
# Hello from node3
# Hello from node1
# ... (lặp lại đều)
```

Tỉ lệ phân phối: 4-4-4 trong 12 request. **Đều tuyệt đối** vì 3 backend đồng cấp + round-robin default.

## Round-robin với HTTP keep-alive — cẩn thận

Trình duyệt mở **TCP keep-alive connection** với NGINX (HTTP/1.1 default). Hiểu nhầm phổ biến: "1 connection = 1 backend".

Thực tế:

```text
Client TCP conn #1                    NGINX                       Backend pool
   │  Request 1 ────────────────────────►  ────► node1            (round-robin
   │  Request 2 (cùng conn) ─────────────► ────► node2             theo REQUEST,
   │  Request 3 (cùng conn) ─────────────► ────► node3             KHÔNG theo conn)
```

→ Trong **cùng một TCP connection**, NGINX vẫn round-robin theo **từng request HTTP**. Đây là điểm khác biệt với Layer 4 (xem Phase 1 Bài 3).

> Có thể test bằng `curl -v` 3 lần với header `Connection: keep-alive` thấy mỗi request về node khác nhau, dù same conn.

## So sánh các thuật toán LB

| Cú pháp trong `upstream` | Hành vi |
|---|---|
| (không khai báo) | Round-robin — default |
| `least_conn;` | Backend có ít connection đang active nhất |
| `ip_hash;` | Hash IP client → cùng client luôn về cùng backend (sticky) |
| `hash $request_uri;` | Hash URL → cache locality |
| `server node1 weight=3;` | Node1 nhận gấp 3 lần request so với weight default 1 |

Ví dụ weighted:

```nginx
upstream node_backend {
    server node1:8080 weight=3;
    server node2:8080;
    server node3:8080;
}
```

→ Tỉ lệ 3:1:1. Test bằng 50 request, đếm phân phối.

## Bẫy thường gặp khi setup này

| Bẫy | Lỗi | Cách tránh |
|---|---|---|
| Containers không cùng network | NGINX log `host not found` | `--network backend-net` cho cả NGINX và backends |
| `--hostname` khác `--name` | Resolve thất bại theo hostname đã viết trong nginx.conf | Đặt `--hostname` = `--name` để đỡ nhầm |
| Backend chưa start xong khi NGINX start | NGINX crash hoặc retry | Đảm bảo backend chạy trước; production dùng `proxy_next_upstream` để retry |
| Quên `events {}` block | NGINX fail to start: `events directive is required` | Luôn có ít nhất `events { worker_connections 1024; }` |
| Config mount sai path | NGINX dùng config mặc định, không thấy upstream | Path mount phải đúng `/etc/nginx/nginx.conf` |
| Backend listen port khác 8080 | NGINX nối được nhưng app không trả lời | Kiểm tra PORT env và config khớp nhau |

## Cleanup tử tế

```bash
docker rm -f ng1 node1 node2 node3
docker network rm backend-net
```

Image vẫn còn. Lần sau có thể tái sử dụng:

```bash
docker images
# nginx       1.25   ...
# node-app    1      ...
```

## docker-compose — gọn hơn nhiều lệnh

Khi quen, bạn sẽ thay 5 lệnh `docker run` bằng 1 lệnh `docker-compose up` với file `docker-compose.yml`:

```yaml
version: "3.9"

services:
  ng1:
    image: nginx:1.25
    hostname: ng1
    ports:
      - "8080:8080"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    networks:
      - backend-net
    depends_on:
      - node1
      - node2
      - node3

  node1:
    build: .
    image: node-app:1
    hostname: node1
    networks:
      - backend-net

  node2:
    build: .
    image: node-app:1
    hostname: node2
    networks:
      - backend-net

  node3:
    build: .
    image: node-app:1
    hostname: node3
    networks:
      - backend-net

networks:
  backend-net:
```

```bash
docker-compose up -d           # spin up tất cả
docker-compose down            # tear down tất cả
```

Khoá học vẫn dùng `docker run` để bạn hiểu **từng lệnh làm gì**. Production thật thường dùng compose hoặc Kubernetes.

## Tóm tắt bài 3

- Build custom image Node.js bằng `Dockerfile` với `FROM node:18-alpine`.
- **Custom network** (`docker network create`) bật DNS resolution giữa container — bắt buộc cho hostname trong NGINX config.
- NGINX config với `upstream { ... }` + `proxy_pass http://upstream_name` = Layer 7 load balancer.
- Round-robin **theo request**, không theo TCP connection.
- Override config NGINX bằng bind mount `nginx.conf`.
- Bẫy lớn nhất: container không cùng network → `host not found`. Luôn check `--network` flag.

**Bài kế tiếp** → [Bài 4: 2 NGINX load balancer cùng pool — pattern và hạn chế](04-two-nginx-load-balancers.md)

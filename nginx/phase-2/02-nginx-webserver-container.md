# Bài 2: NGINX web server container đầu tiên — serve HTML tự custom

Mục tiêu bài này: trong **2 lệnh `docker run`**, bạn có một NGINX serve trang HTML do bạn viết. Đơn giản nhưng đụng đến **3 cơ chế cốt lõi**: port mapping, volume mount, default behavior của image NGINX. Hiểu kỹ ở đây = không lúng túng các bài sau.

## Bước 1 — NGINX vanilla, chưa custom gì

```bash
docker run \
  --name ng1 \
  --hostname ng1 \
  -p 8080:80 \
  -d \
  nginx:1.25
```

Phân tích từng flag — vì sao có nó:

| Flag | Ý nghĩa | Có bỏ được không? |
|---|---|---|
| `--name ng1` | Đặt tên container để dễ `stop`, `rm`, `logs` | Bỏ được, Docker auto-sinh tên kiểu `wonderful_einstein` — khó nhớ |
| `--hostname ng1` | Hostname **bên trong** container (= `uname -n`) | Bỏ được — mặc định = container ID |
| `-p 8080:80` | Map host port 8080 → container port 80 | **Bắt buộc** nếu muốn truy cập từ host |
| `-d` | Detach — chạy nền | Bỏ được, nhưng terminal sẽ bị block |
| `nginx:1.25` | Image | Bắt buộc — tham số cuối luôn là image |

> Tại sao chọn `-p 8080:80`, không `-p 80:80`? Hai lý do: (1) port < 1024 cần `sudo` trên macOS/Linux; (2) port 80 hay bị app khác chiếm. `8080` an toàn cho dev.

Sau khi chạy:

```bash
docker ps
# CONTAINER ID   IMAGE        ...   PORTS                  NAMES
# 7a8b9cd1234e   nginx:1.25         0.0.0.0:8080->80/tcp   ng1

curl http://localhost:8080
# <html><head><title>Welcome to nginx!</title></head>...
```

Trang welcome mặc định của NGINX = thành công. Lúc này NGINX đang chạy với:
- Config mặc định trong image (`/etc/nginx/nginx.conf` + `/etc/nginx/conf.d/default.conf`).
- HTML mặc định ở `/usr/share/nginx/html/index.html`.
- Lắng nghe port 80 trong container.

## Port mapping hoạt động ra sao?

```text
┌─────────────────────────────────────────────────────────┐
│  Your laptop (host)                                     │
│                                                         │
│   curl localhost:8080  ──┐                              │
│                          ▼                              │
│   ┌────────────────────────────────────────────────┐    │
│   │  Docker port forward (iptables / vpnkit)       │    │
│   │  host:8080 → container "ng1" → port 80         │    │
│   └────────────────────────────────────────────────┘    │
│                          │                              │
│   ┌──────────────────────▼──────────────────────────┐   │
│   │  Container ng1 (private namespace)              │   │
│   │   nginx process listening on :80                 │   │
│   │   /usr/share/nginx/html/index.html               │   │
│   └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

`docker run -p 8080:80` thực chất tạo một **NAT rule** trong kernel (Linux) hoặc thông qua **vpnkit** (macOS). Khi gói TCP đến `localhost:8080`, kernel forward đến cổng `80` của container.

> Trên Linux, bạn có thể `iptables -L -t nat | grep DOCKER` để thấy rule này. Trên macOS, Docker Desktop xử lý qua VM ẩn — không thấy iptables.

### Tại sao Mac không truy cập trực tiếp IP container?

Một container có IP nội bộ (`172.17.0.2`). Trên **Linux**, bạn `curl 172.17.0.2:80` được luôn nhờ bridge network kernel-level. Trên **macOS**, container chạy trong VM ẩn → host laptop không "thấy" được mạng container.

→ Trên Mac, **port mapping là cách duy nhất**. Trên Linux, port mapping tiện hơn nhưng không bắt buộc.

## Default HTML và cấu trúc image NGINX

Image `nginx:1.25` (dựa trên Debian slim) có cấu trúc:

```text
/etc/nginx/
├── nginx.conf                 # main config
├── conf.d/
│   └── default.conf           # server block mặc định, listen 80
├── mime.types
└── modules/

/usr/share/nginx/html/
├── index.html                 # trang welcome mặc định
└── 50x.html                   # trang lỗi mặc định
```

`default.conf` mặc định:

```nginx
server {
    listen       80;
    server_name  localhost;

    location / {
        root   /usr/share/nginx/html;
        index  index.html index.htm;
    }

    error_page   500 502 503 504  /50x.html;
    location = /50x.html {
        root   /usr/share/nginx/html;
    }
}
```

→ NGINX đọc từ `/usr/share/nginx/html`. Muốn serve nội dung khác, ta **mount thư mục host vào đó**.

## Bước 2 — Serve HTML tự custom bằng volume mount

Stop container cũ và làm lại:

```bash
docker stop ng1
docker rm ng1
```

Tạo thư mục với HTML của bạn:

```bash
mkdir html
cat > html/index.html <<'EOF'
<!DOCTYPE html>
<html>
<head><title>My NGINX</title></head>
<body>
  <h1>Hello from my NGINX!</h1>
  <p>Served from host file via Docker volume.</p>
</body>
</html>
EOF
```

Spin up với volume mount:

```bash
docker run \
  --name ng1 \
  --hostname ng1 \
  -p 8080:80 \
  -v $(pwd)/html:/usr/share/nginx/html \
  -d \
  nginx:1.25
```

`-v $(pwd)/html:/usr/share/nginx/html` — đè thư mục `/usr/share/nginx/html` của container bằng `<pwd>/html` của host.

```bash
curl http://localhost:8080
# <h1>Hello from my NGINX!</h1>
```

Sửa file `html/index.html` ở host → reload trình duyệt → nội dung đổi **ngay lập tức**. Không cần rebuild container.

## Volume mount — bind mount vs named volume

Docker có 2 loại volume chính:

| Loại | Cú pháp | Dùng cho |
|---|---|---|
| **Bind mount** | `-v /absolute/path:/container/path` | Dev — sync thư mục source code host vào container |
| **Named volume** | `-v myvol:/container/path` | Production — Docker tự quản lý, dữ liệu persist |
| **Anonymous volume** | `-v /container/path` (không có host) | Dùng tạm, hiếm khi cần |

Trong khoá học này ta dùng **bind mount** vì cần edit file trực tiếp từ host. Production thường dùng named volume cho DB data.

> Cú pháp dài cũng hợp lệ: `--mount type=bind,source=$(pwd)/html,target=/usr/share/nginx/html` — verbose hơn nhưng rõ ràng hơn.

## Vì sao "ephemeral storage" là một concept quan trọng?

Container có filesystem riêng (copy-on-write layer). Khi bạn:
- `docker rm <container>` → toàn bộ file ghi mới trong container **mất**.
- `docker stop` rồi `docker start` lại — file vẫn còn (container chỉ pause, không xoá).

```bash
docker exec -it ng1 sh
> echo "hello" > /tmp/data.txt    # ghi file vào container
> exit

docker rm -f ng1                   # destroy
# /tmp/data.txt - MẤT

docker run --name ng1 ... nginx:1.25
# Container mới, sạch tinh, không có /tmp/data.txt
```

Volume **bypass** ephemeral filesystem — dữ liệu nằm ở host hoặc named volume, không lệ thuộc vòng đời container.

## Container networking — cái nhìn đầu tiên

Container ở **default bridge network** khi không khai báo `--network`:

```bash
docker inspect ng1 --format '{{.NetworkSettings.IPAddress}}'
# 172.17.0.2

docker inspect ng1 --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool
# {
#   "bridge": {
#     "Gateway": "172.17.0.1",
#     "IPAddress": "172.17.0.2",
#     ...
#   }
# }
```

- Network mặc định tên là `bridge`.
- Gateway `172.17.0.1` = "Docker host" trong network nội bộ.
- Container có IP `172.17.0.2`.

> **Quan trọng**: trên default bridge network, container **không gọi nhau bằng hostname**. Bài 3 sẽ giải quyết bằng custom network.

## Xem log NGINX của container

```bash
# Log tức thời
docker logs ng1

# Follow (như tail -f)
docker logs -f ng1
```

Hai log file của NGINX:
- **access.log** — mỗi request một dòng. Mặc định: `/var/log/nginx/access.log` → đã symlink sang stdout.
- **error.log** — lỗi và warning. Mặc định: `/var/log/nginx/error.log` → đã symlink sang stderr.

> Image NGINX official có một thủ thuật: `access.log` được symlink `→ /dev/stdout` và `error.log` `→ /dev/stderr`. Vì vậy `docker logs ng1` hiển thị cả 2 luồng. Đây là **best practice** cho container app — không ghi log vào file mà đẩy ra stdout/stderr.

## Khi nào edit config NGINX (preview bài sau)?

Bạn có thể:

1. **Build image mới** từ `Dockerfile` `FROM nginx:1.25` + `COPY my.conf /etc/nginx/conf.d/default.conf`. Overkill cho dev.
2. **Mount config file** giống mount HTML — `-v $(pwd)/nginx.conf:/etc/nginx/nginx.conf`. Đây là cách bài 3 dùng.

→ Lựa chọn 2 nhanh hơn cho dev/demo. Production có thể bake config vào image cho immutable deployment.

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách tránh |
|---|---|---|
| Quên `-d` | Terminal bị khoá | Thêm `-d`, dùng `docker logs` xem output |
| Quên `-p` | `curl localhost:8080` báo connection refused | Phải có port mapping (trên Mac/Win bắt buộc) |
| Dùng port 80 không có `sudo` | "permission denied" hoặc "Address already in use" | Dùng port > 1024 cho dev |
| Path relative trong `-v` | Lỗi "mounts denied" hoặc bind không thấy file | Phải absolute path. Dùng `$(pwd)/html` |
| Mount đè cả config | Bị mất file `default.conf`, NGINX không khởi động | Mount đúng đường: thư mục HTML, không phải `/etc/nginx` |
| Browser cache cứng đầu | Sửa HTML nhưng vẫn thấy bản cũ | Hard reload (Cmd+Shift+R), hoặc query string `?v=2` |
| `--name ng1` đã tồn tại | Lỗi "name already in use" | `docker rm ng1` trước khi `docker run` lại |
| Quên stop container cũ trước khi rm | Lỗi "container running" | `docker rm -f <name>` (force) hoặc stop trước |

## Cleanup tử tế

Kết thúc bài, dọn dẹp:

```bash
docker stop ng1
docker rm ng1

# Hoặc gộp:
docker rm -f ng1
```

Image vẫn còn trên disk:

```bash
docker images | grep nginx
# nginx   1.25   ...   192MB
```

Muốn dọn cả image: `docker rmi nginx:1.25`. Lần sau chạy `docker run` sẽ tự pull lại — không cần xoá để học bài tiếp.

## Tóm tắt bài 2

- `docker run -p 8080:80 -d nginx:1.25` = NGINX vanilla trong 5 giây.
- **Port mapping** là cách duy nhất truy cập container trên macOS/Windows (Linux cũng nên dùng).
- **Bind mount** `-v $(pwd)/html:/usr/share/nginx/html` ghi đè HTML mặc định bằng file của host.
- Container **ephemeral storage** — phải dùng volume cho data cần persist.
- NGINX image official đã redirect log → stdout/stderr → `docker logs` xem được tất cả.
- Default bridge network có IP nhưng **không có hostname resolution** — bài sau sẽ fix.

**Bài kế tiếp** → [Bài 3: 3 Node app + NGINX load balancer trong custom network](03-three-node-apps.md)

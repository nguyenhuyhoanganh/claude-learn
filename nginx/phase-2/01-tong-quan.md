# Bài 1: Tổng quan phase-2 — chạy NGINX trên Docker

Phase 1 đã trả lời "NGINX là gì". Phase này trả lời "làm sao **tay tôi sờ vào** NGINX trong 5 phút, không cần thuê VPS, không cần đụng vào router". Câu trả lời: **Docker**.

## Vì sao Docker, không phải `apt install nginx` trực tiếp?

3 lý do thực dụng:

1. **Cross-platform 100%** — Docker chạy trên macOS, Windows, Linux. Lệnh học bài này y hệt nhau dù bạn ở OS nào. Không cần "Mac thì brew install, Linux thì apt install".
2. **Reset/destroy/recreate trong 1 lệnh** — phá tan config sai? `docker rm` xong làm lại. Không sợ "phá máy".
3. **Spin up nhiều instance cùng lúc** — 3 backend + 2 NGINX trong cùng laptop, không xung đột port, không cần 5 VM.

Trade-off: bạn phải biết Docker cơ bản. Bài này giả định bạn đã `docker run hello-world` thành công.

## Docker — refresher 3 phút

Nếu bạn đã quen Docker, skim mục này.

| Khái niệm | OOP analogy | Trong Docker |
|---|---|---|
| **Image** | Class (template) | `nginx:1.25`, `node:18-alpine` — file binary đóng gói sẵn |
| **Container** | Object (instance) | Một process chạy từ image; có IP, hostname, filesystem riêng |
| **Volume** | Mount filesystem | Map thư mục host vào container để chia sẻ file |
| **Network** | LAN ảo | Các container trong cùng network thấy nhau qua hostname |
| **Port mapping** | NAT rule | `-p 8080:80` = host:8080 → container:80 |

Một container **về bản chất** là một process bình thường trên OS host, nhưng được kernel **đóng kín** bằng:

- **Namespace** — process chỉ thấy filesystem/process/network của riêng nó.
- **Cgroup** — bị giới hạn tài nguyên (CPU, RAM, IO).

Không phải VM. **Nhẹ hơn VM rất nhiều** — vài MB RAM cho container idle, vs vài GB cho VM.

```text
   ┌──────────────────────────────────────┐
   │  Host OS (Linux kernel)               │
   │   ┌──────────┐  ┌──────────┐         │
   │   │ Container│  │ Container│  ...    │
   │   │  nginx   │  │  node    │         │
   │   │  PID 1   │  │  PID 1   │         │
   │   │ (isolated│  │ (isolated│         │
   │   │  ns)     │  │  ns)     │         │
   │   └──────────┘  └──────────┘         │
   └──────────────────────────────────────┘
```

## Lộ trình 5 bài phase-2

Ta đi từ **dễ → khó**, mỗi bài thêm 1 layer complexity:

### Bài 2 — Một NGINX container đơn giản

```text
   Browser ──:8080──► [Host Machine]
                          │
                          │ port forward
                          ▼
                     [NGINX container ng1]
                       (serve HTML từ volume)
```

Chỉ 1 container, không backend. Học `docker run`, port mapping, volume mount.

### Bài 3 — 3 Node app + NGINX load balancer

```text
   Browser ──:8080──► [Host]
                        │
                        ▼
                   [NGINX ng1]
                    │ │ │
              ┌─────┘ │ └─────┐
              ▼       ▼       ▼
        [node1]  [node2]  [node3]
              \      |      /
               docker network: backend-net
```

NGINX route round-robin giữa 3 backend Node.js. Học `docker network`, hostname resolution, NGINX config thay bằng volume.

### Bài 4 — 2 NGINX instance, cùng backend pool

```text
   Browser ──:80──► [NGINX ng1] ───┐
                                    ├──► node1, node2, node3
   Browser ──:81──► [NGINX ng2] ───┘
```

Vì sao 2 NGINX? Vì 1 NGINX = single point of failure. Bài này show pattern và **chỉ ra giới hạn** của làm thuần Docker (cần K8s/cloud LB để giải).

### Bài 5 — Docker networking sâu

```text
   [front-net]                  [back-net]
   ┌──────────┐ ┌─────────┐   ┌──────────┐ ┌──────────┐
   │ NGINX-1  │ │ NGINX-2 │   │  node-1  │ │  node-2  │
   └──────────┘ └─────────┘   └──────────┘ └──────────┘
         │             │            │             │
         └─────────────┴────────────┴─────────────┘
                       │
                  [gateway/router container]
                  (route giữa 2 network)
```

Bài bonus: hiểu sâu Docker network — bridge mặc định, custom network, multi-network, DNS resolver, vì sao container cùng bridge mặc định không gọi nhau bằng hostname.

## Đặt vấn đề "kiến trúc thực" sẽ build

Sau 4 bài đầu, bạn sẽ có một mini-deployment như sau, **chạy local trên laptop**:

```text
                      [your laptop]
                            │
        port 80 ────────────┘────────────── port 81
            │                                  │
            ▼                                  ▼
       [NGINX ng1] ◄──── shared ────► [NGINX ng2]
            │           backend pool       │
            └──────────┐    ┌──────────────┘
                       ▼    ▼
            ┌──────────────────────────┐
            │  Docker network: backend │
            │                          │
            │   [node1]:8080           │
            │   [node2]:8080           │
            │   [node3]:8080           │
            └──────────────────────────┘
```

Phía ngoài (browser của bạn) chỉ thấy 2 cổng: `:80` và `:81`. Phía trong, NGINX phân phối tới 3 Node app. Mọi thứ chạy bằng `docker-compose up` hoặc 1 dãy `docker run` cũng được.

Đây là **kiến trúc đặc trưng của một SME**, scale xuống laptop.

## Quy ước trong phase này

| Quy ước | Ví dụ |
|---|---|
| Tên container NGINX | `ng1`, `ng2` |
| Tên container app | `node1`, `node2`, `node3` |
| Image NGINX | `nginx:1.25` (pin version để course không vỡ khi NGINX bump major) |
| Image Node | `node:18-alpine` (Alpine ~50 MB, đủ cho demo) |
| Port external | 80, 81, 8080 |
| Port app internal | 8080 |
| Network | `backend-net`, `frontend-net` (bài 5) |
| Volume mount config | `./nginx.conf:/etc/nginx/nginx.conf` |
| Volume mount HTML | `./html:/usr/share/nginx/html` |

> ⚠️ **Pin version**: course này dùng `nginx:1.25`, không `nginx:latest`. Lý do — `:latest` có thể đổi major version và làm vỡ config cũ. Production cũng nên pin major (`:1.25`) hoặc thậm chí minor.

## Lệnh Docker cần thuộc cho phase này

```bash
# Tạo & chạy container
docker run -d --name <tên> --hostname <hostname> -p <host>:<container> <image>

# Volume mount
docker run -d -v $(pwd)/file:/container/file ...

# Network
docker network create <name>
docker network connect <network> <container>
docker network inspect <network>

# Lifecycle
docker ps               # liệt kê container chạy
docker ps -a            # cả container đã dừng
docker stop <name>
docker rm <name>        # phải stop trước

# Debug
docker logs <name>
docker logs -f <name>           # follow
docker exec -it <name> sh       # vào shell container (alpine không có bash, dùng sh)
docker inspect <name>           # JSON đầy đủ
```

Hai cờ quan trọng:

- `-d` (detach) — chạy background, không khoá terminal.
- `--rm` — tự xoá container khi dừng (tốt cho test, đỡ phải rm).

## Verify Docker hoạt động

Trước khi sang Bài 2:

```bash
docker --version
# Docker version 25.x.x, build ...

docker run --rm hello-world
# Hello from Docker!
# This message shows that your installation appears to be working correctly.
```

Nếu lỗi:
- macOS/Windows: kiểm tra Docker Desktop đang chạy.
- Linux: `sudo systemctl status docker`; thêm user vào group `docker` để khỏi cần `sudo`.

## Hạn chế cần biết của làm Docker trên macOS

Docker trên Mac/Windows **không native** — nó chạy qua một VM ẩn (Docker Desktop tự manage). Hệ quả:

| Hành vi | macOS | Linux |
|---|---|---|
| Truy cập IP container trực tiếp từ host | Không (cần port mapping) | Được |
| Bind mount performance | Chậm hơn (do filesystem layer) | Gần như native |
| `host.docker.internal` để gọi từ container về host | Có | Phải tự config |

Trong khoá này, ta luôn dùng **port mapping** (`-p`) để truy cập, không dựa vào "kết nối thẳng tới IP container". Vì vậy, OS nào cũng giống nhau.

## Khi nào KHÔNG dùng Docker trong production?

- Workload cần performance **gần native tuyệt đối** (database master, HPC). Container overhead nhỏ nhưng có.
- Compliance bắt buộc bare-metal hoặc VM.
- Đội không có DevOps know-how — Docker thì dễ, **vận hành** Docker production thì khó (image security, log/metric, restart policy, OOM).

Tuy nhiên, **trong phạm vi học** và đa số production hiện đại, Docker (đặc biệt qua Kubernetes) là chuẩn de facto.

## Tóm tắt bài 1

- Docker cho phép spin up/destroy NGINX setup trong vài giây, cross-platform.
- Concept cốt lõi: image / container / volume / network / port mapping.
- Lộ trình phase-2: 1 container → 1 NGINX + 3 backend → 2 NGINX → deep network.
- Pin version (`nginx:1.25`, không `latest`) để course không vỡ.
- macOS có vài hạn chế nhưng port mapping che hết — kiến thức áp dụng được mọi OS.

**Bài kế tiếp** → [Bài 2: Spin up NGINX web server đầu tiên trong Docker](02-nginx-webserver-container.md)

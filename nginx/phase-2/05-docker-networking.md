# Bài 5: Docker networking deep-dive — bridge, DNS, multi-network

Bài này không nói về NGINX. Nó nói về **lớp dưới NGINX** — Docker network. Bạn sẽ hiểu vì sao bài 3 cần custom network, container ở các network khác nhau giao tiếp ra sao, và **vì sao kiến trúc 2 network (frontend/backend) là production pattern**.

Đây là bài tham khảo — bạn có thể quay lại bất kỳ lúc nào.

## Container "có IP" — IP đó từ đâu?

Mỗi container chạy có (ít nhất) 1 network interface:

```bash
docker run -d --name srv1 nginx:1.25
docker exec srv1 hostname -I
# 172.17.0.2

docker exec srv1 ip route
# default via 172.17.0.1 dev eth0
# 172.17.0.0/16 dev eth0 proto kernel scope link src 172.17.0.2
```

- `172.17.0.2` = IP container, trong subnet `172.17.0.0/16`.
- `172.17.0.1` = gateway = "IP của Docker host trong bridge network".
- Mọi packet đi ra ngoài network → đi qua gateway → ra internet.

Subnet `172.17.0.0/16` là **default bridge network** — tự tạo khi cài Docker.

## Cấu trúc network — 4 layer

```text
┌──────────────────────────────────────────────────────────┐
│  Host kernel network stack                                │
│                                                            │
│   eth0 (interface ra internet)         lo (loopback)       │
│      │                                                     │
│      │  iptables NAT rules                                 │
│      ▼                                                     │
│   docker0 (bridge interface, 172.17.0.1)                   │
│      │                                                     │
│      ├── veth-A ─────┐                                     │
│      ├── veth-B ─────┤  ← virtual ethernet pairs           │
│      ├── veth-C ─────┤    nối container vào bridge         │
│      └── veth-D ─────┘                                     │
│                                                            │
└──────│────────│────────│────────│─────────────────────────┘
       │        │        │        │
   ┌───▼──┐ ┌───▼──┐ ┌───▼──┐ ┌───▼──┐
   │ ctr1 │ │ ctr2 │ │ ctr3 │ │ ctr4 │
   │ eth0 │ │ eth0 │ │ eth0 │ │ eth0 │
   └──────┘ └──────┘ └──────┘ └──────┘
```

- `docker0` là một **virtual bridge** (giống switch ảo) trên kernel host.
- Mỗi container có một **veth pair**: 1 đầu trong container (`eth0`), 1 đầu cắm vào bridge.
- Container gửi packet ra `eth0` → vào bridge → bridge route tới container khác hoặc ra internet qua iptables NAT.

> Trên macOS/Windows, layer này nằm trong VM ẩn của Docker Desktop, nhưng nguyên lý y hệt.

## 3 loại network driver phổ biến

| Driver | Đặc tính | Khi nào dùng |
|---|---|---|
| `bridge` | Default. Container có IP nội bộ, NAT ra internet | 99% case |
| `host` | Container **share** network stack với host (không có namespace riêng) | Performance cực cao, port không conflict được |
| `none` | Không có network — container isolated hoàn toàn | Batch job offline, sandbox |

Trong khoá học và đa số production: chỉ dùng **bridge**. Custom network luôn là bridge driver.

## Default bridge vs custom bridge — khác biệt then chốt

| Yếu tố | Default bridge (`bridge`) | Custom bridge (`docker network create`) |
|---|---|---|
| Auto-create khi cài Docker | Có | Không, phải tạo manual |
| Tên | `bridge` | Tự đặt |
| Subnet | `172.17.0.0/16` (mặc định) | Tự đặt hoặc auto |
| DNS resolution giữa container | **KHÔNG** | **CÓ** — Docker DNS resolver tự build |
| Container join | Mặc định khi không `--network` | Phải `--network <name>` hoặc `docker network connect` |
| Đặt link giữa container | Phải `--link` (legacy) | Tự nhiên qua DNS |
| Tách biệt giữa nhóm container | Không (tất cả chung 1 bridge) | Có (mỗi custom bridge isolated) |

> **Kết luận thực dụng**: **luôn dùng custom network**. Default bridge chỉ để cho lệnh `docker run` không bắt buộc khai báo network. Trong production, bỏ.

## DNS resolver của Docker (`127.0.0.11`)

Khi container join custom network, nó được cấp một **DNS server đặc biệt**:

```bash
docker network create mynet
docker run -d --name app --network mynet --hostname app nginx:1.25

docker exec app cat /etc/resolv.conf
# nameserver 127.0.0.11
# options ndots:0
```

`127.0.0.11` là **DNS server embedded** của Docker daemon. Nó:
- Biết hostname/name của mọi container trong cùng custom network.
- Resolve `app → 172.x.x.x` ngay.
- Cache rất ngắn → IP thay đổi nhanh.
- Forward DNS query bên ngoài (vd `google.com`) lên DNS thật của host.

```bash
docker exec app nslookup app
# Server:         127.0.0.11
# Address:        127.0.0.11:53
# Name:   app
# Address: 172.18.0.2
```

→ Đây là **thứ duy nhất khiến `proxy_pass http://node1:8080` chạy được** trong bài 3.

## Tạo custom network với subnet rõ ràng

```bash
docker network create \
  --driver bridge \
  --subnet 10.0.0.0/24 \
  --gateway 10.0.0.1 \
  backend-net
```

| Option | Ý nghĩa |
|---|---|
| `--driver bridge` | Loại network (mặc định bridge, có thể bỏ) |
| `--subnet 10.0.0.0/24` | IP range — tối đa 254 container |
| `--gateway 10.0.0.1` | IP gateway (lưu ý dành riêng, container nhận từ .2 trở đi) |
| `--internal` | Bonus — container không ra được internet (chỉ talk trong network) |

> Subnet `/24` chứa 256 IP — trừ network + broadcast + gateway = 253 IP cho container. Đủ cho đa số setup.

Đặt name kiểu `backend-net`, `frontend-net`, `db-net` — tự document mục đích.

## Container nhiều network — pattern frontend/backend

Container có thể join **nhiều network** đồng thời:

```bash
docker network create frontend-net
docker network create backend-net

# NGINX talk cả 2 network
docker run -d --name ng1 --hostname ng1 \
  --network frontend-net \
  -p 8080:8080 \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf \
  nginx:1.25

docker network connect backend-net ng1

# Backend chỉ ở backend-net
docker run -d --name node1 --hostname node1 \
  --network backend-net \
  node-app:1
```

`docker inspect ng1`:

```text
"Networks": {
    "frontend-net": { "IPAddress": "172.20.0.2" },
    "backend-net":  { "IPAddress": "172.21.0.2" }
}
```

→ NGINX có 2 interface (2 IP). Trong nginx.conf vẫn dùng `node1` — Docker DNS resolve qua network backend-net.

### Vì sao phân chia network như vậy?

```text
   Client (Internet) ──► [Cloud LB] ──┐
                                       │
                                  frontend-net
                                       │
                                  ┌────▼────┐
                                  │  NGINX  │  ← public facing
                                  └────┬────┘
                                       │
                                  backend-net
                                       │
                          ┌────────────┼─────────────┐
                          ▼            ▼             ▼
                       [node1]     [node2]       [node3]
                                       │
                                   db-net (3rd network)
                                       │
                                  ┌────▼────┐
                                  │PostgreSQL│  ← deepest
                                  └─────────┘
```

**Lợi ích**:

| Network | Ai trong đó | Lợi ích |
|---|---|---|
| `frontend-net` | NGINX | NGINX nhận traffic public; nếu compromise NGINX, attacker thấy frontend-net thôi |
| `backend-net` | NGINX + backend apps | App chỉ talk với NGINX, không direct với internet |
| `db-net` | backend apps + DB | DB không nằm cùng network với NGINX → compromise NGINX ≠ compromise DB |

Đây là **defense in depth** — nhiều layer bảo vệ. Một component bị thủng không = mất tất cả.

## Vì sao 2 container ở 2 network khác nhau **không** thấy nhau?

Mặc định, Docker không route giữa các custom network — mỗi network có gateway riêng, không học route của network khác:

```bash
docker network create net-a --subnet 10.0.1.0/24
docker network create net-b --subnet 10.0.2.0/24

docker run -d --name a1 --network net-a --hostname a1 alpine sleep 1d
docker run -d --name b1 --network net-b --hostname b1 alpine sleep 1d

docker exec a1 ping -c 2 b1
# ping: bad address 'b1'           ← DNS resolver không biết b1

docker exec a1 ping -c 2 10.0.2.2
# 2 packets transmitted, 0 received  ← route không tồn tại
```

→ a1 không thấy b1. Isolation tự động.

### Cách bridge 2 network — gateway container

Để 2 network talk được:

```text
   net-a              net-b
     │                  │
     │   ┌──────────┐   │
     ├──►│ gateway  │◄──┤    ← container join cả 2 network
         │ container│
         └──────────┘
```

```bash
docker run -d --name gw --network net-a alpine sleep 1d
docker network connect net-b gw
```

`gw` giờ có IP trong cả 2 network. Để forward packet, cần IP forwarding (sysctl `net.ipv4.ip_forward=1`) và thêm route trong container. Phức tạp — production thường dùng K8s NetworkPolicy hoặc istio thay vì làm tay.

> Trong khoá: không đi sâu vào IP forwarding manual. Hiểu rằng "Docker tự nhiên isolated, cần effort để bridge" là đủ.

## Bridge mặc định **không** có DNS — vì sao?

Câu hỏi nghe khô khan nhưng quan trọng để hiểu lịch sử Docker.

- Docker phiên bản cũ (pre-1.10): chỉ có default bridge. Để liên lạc giữa container, dùng `--link` — Docker tự ghi `/etc/hosts` của container nguồn:

```bash
docker run --name db -d postgres
docker run --name web --link db:database -d myweb
# Trong web, /etc/hosts có dòng: 172.17.0.2  database
```

- Docker 1.10+ (2016): custom network ra đời, kèm DNS embedded `127.0.0.11`. **Khuyến nghị bỏ `--link`**.

- Default bridge **giữ behavior cũ** để backward compat — không có DNS.

→ Lý do lịch sử thuần tuý, không phải lý do kỹ thuật. **Đừng dùng default bridge** trong code mới.

## Debug network — bộ công cụ phải biết

Container NGINX/Node official không cài sẵn `ping`, `dig`, `traceroute`. Phải bash vào với image debug:

```bash
docker exec -it ng1 sh
# /etc/nginx# (alpine) hoặc /# (debian)
> apt-get update && apt-get install -y iputils-ping dnsutils    # Debian
> apk add iputils bind-tools                                     # Alpine
```

Hoặc — production hơn — spawn 1 container có sẵn tool:

```bash
docker run --rm -it --network backend-net \
  nicolaka/netshoot \
  sh
> nslookup node1
> ping node1
> curl http://ng1:8080
> traceroute node3
```

`nicolaka/netshoot` là image debug nổi tiếng, có sẵn ~30 tool network.

### Lệnh debug thường dùng

| Lệnh | Mục đích |
|---|---|
| `nslookup <host>` | Resolve DNS — kiểm tra hostname có map IP không |
| `dig <host>` | Tương tự nslookup, verbose hơn |
| `ping <host/IP>` | ICMP probe — kiểm tra reachability |
| `traceroute <host>` | Xem qua những hop nào |
| `curl -v <url>` | Test HTTP request, xem header response |
| `ss -tnp` | Show listening port + process (Alpine cần `netstat`) |
| `ip addr` | Xem interfaces |
| `ip route` | Xem routing table |

## Bonus — pattern `--internal` cho DB network

Network không có internet access — cực kỳ an toàn cho DB:

```bash
docker network create --internal db-net

docker run -d --name pg --network db-net postgres:15
docker exec pg ping -c 2 google.com
# ping: bad address  ← KHÔNG ra được internet
```

DB chỉ talk được với container khác cùng `db-net`, không thể "phone home" hay làm crypto miner nếu bị compromise.

> Một số scenario cần internet (vd `apt-get update` lần đầu) — phải tạm join network có internet, install xong rồi disconnect.

## Limitations của Docker network (không tự làm thuần Docker giải được)

| Limitation | Pattern thay thế |
|---|---|
| Container ở host khác nhau không cùng network | Docker Swarm overlay network hoặc Kubernetes |
| Service discovery khi container scale động | Kubernetes Service, Consul, etcd |
| Load balance giữa nhiều replica của 1 service | Docker Swarm `replicas`, K8s Service |
| Network policy fine-grained (ai talk được ai) | Kubernetes NetworkPolicy + CNI plugin (Calico, Cilium) |
| Cross-region multi-cloud network | Cloud-specific (AWS VPC peering, GCP VPC) |

→ Đa số production lớn rời `docker run` để qua K8s khi đụng các limit này.

## Tóm tắt bài 5

- Mỗi container có 1+ network interface, IP cấp bởi Docker bridge.
- **Custom network** mới có DNS embedded `127.0.0.11` — `proxy_pass http://hostname` chạy được nhờ đây.
- Default bridge không có DNS — chỉ tồn tại vì backward compat, **không dùng**.
- Container có thể join nhiều network — pattern frontend/backend/db cho defense in depth.
- Container ở các custom network khác nhau **mặc định isolated** — phải có gateway container hoặc K8s NetworkPolicy để bridge.
- `--internal` network = không ra internet — pattern cho DB.
- Đa cluster, multi-host, service discovery động → vượt khả năng Docker thuần, cần K8s.

**Bài kế tiếp** → [Phase 3 — Bài 1: Tổng quan NGINX timeouts (frontend + backend)](../phase-3/01-tong-quan-timeouts.md)

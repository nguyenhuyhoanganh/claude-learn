# Bài 4: Docker Networking Deep Dive

## Default Bridge Network

Khi spin up container mà không chỉ định network, nó join **default bridge network**:

```bash
docker run -p 80:80 -d httpd
docker inspect <container-id>
# "Networks": {"bridge": {"IPAddress": "172.17.0.2", "Gateway": "172.17.0.1"}}
```

**Vấn đề với default bridge:**
- Không có DNS resolution giữa containers
- Containers chỉ thấy nhau bằng IP address
- IP address có thể thay đổi khi restart

---

## Custom Network

```bash
# Tạo network với custom subnet
docker network create \
  --subnet 10.0.0.0/24 \
  backend-net

# Connect containers
docker network connect backend-net container1
docker network connect backend-net container2
```

**Lợi ích:**
- DNS resolution tự động: `curl http://container1:80` hoạt động
- Cô lập: Containers trong network này không thể thấy containers khác
- Docker DNS server local → không resolve qua internet

---

## Tại sao cần Custom Network cho DNS?

**Default bridge network:**
```
DNS query "nodeapp1" → Đi ra ngoài → Docker host → Internet → Failed!
(Docker DNS của default bridge không biết về containers)
```

**Custom network:**
```
DNS query "nodeapp1" → Docker internal DNS (127.0.0.11) → Tìm thấy! → 10.0.0.2
(Docker DNS server cho custom network biết về tất cả containers trong network)
```

---

## Container có thể belong nhiều networks

```bash
# Container trong cả 2 networks
docker network connect backend-net nginx1
docker network connect frontend-net nginx1

docker inspect nginx1
# "Networks": {
#   "backend-net": {"IPAddress": "10.0.0.2"},
#   "frontend-net": {"IPAddress": "10.0.1.2"}
# }
```

---

## Isolation với Multiple Networks

**Production pattern:**

```
frontend-net:
  ├── nginx (load balancer, public facing)
  └── [web servers]

backend-net:
  ├── [web servers]
  └── [databases]

nginx biết cả 2 networks → bridge giữa frontend và backend
Database chỉ trong backend-net → không public accessible
```

**Tại sao quan trọng:**
- Attacker compromise NGINX → chỉ thấy frontend-net
- Database tách biệt → extra layer of defense
- Giảm attack surface

---

## Docker Network Cheat Sheet

```bash
# Tạo network
docker network create my-net

# List networks
docker network ls

# Inspect network (xem containers trong network)
docker network inspect my-net

# Connect container to network
docker network connect my-net container1

# Disconnect container from network
docker network disconnect my-net container1

# Tạo network isolated (no internet access)
docker network create --internal my-internal-net
```

---

## Ping Test trong Container

```bash
# Bash vào container để debug
docker exec -it container1 bash

# Test DNS resolution
nslookup container2

# Test connectivity
ping container2

# Test HTTP
curl http://container2:8080

# Check own IP
hostname -I

# Trace route
traceroute container2
```

---

## Tóm tắt Docker Networking

```
Default Bridge Network:
├── Containers có IP trong subnet 172.17.0.0/16
├── Không có DNS → phải dùng IP address
└── Tất cả containers trên host đều trong cùng network

Custom Network:
├── Containers có IP trong subnet bạn chỉ định
├── Có DNS resolution bằng container name/hostname
├── Cô lập từ containers ở networks khác
└── Multiple networks per container được hỗ trợ
```

---
**Tiếp theo:** Phase 3 - NGINX Timeouts →

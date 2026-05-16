# Bài 3: Two NGINX Containers Load Balancing

## Mục tiêu

Scale NGINX itself bằng cách chạy 2 NGINX instances load balancing đến cùng backends.

---

## Vấn đề: NGINX là Single Point of Failure

```
Client → NGINX (1 instance) → [3 Node backends]
         ↑
    If this dies → everything dies!
```

---

## Giải pháp: 2 NGINX Instances

```
Host Port 80 → NGINX Container 1 (ng1) ─┐
                                          ├→ [3 Node backends]
Host Port 81 → NGINX Container 2 (ng2) ─┘
```

---

## Thực hiện

NGINX Container 2 dùng **cùng config** như Container 1:

```bash
# Container 2 - tương tự Container 1 nhưng khác port và name
docker run \
  --name nginx2 \
  --hostname ng2 \
  --network backend-net \
  -p 81:8080 \         # Host port 81 → Container port 8080
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf \
  -d \
  nginx
```

---

## Test

```bash
# Port 80 → NGINX 1
curl http://localhost:80
# → "Hello from nodeapp1"

# Port 81 → NGINX 2
curl http://localhost:81
# → "Hello from nodeapp2"

# Cả 2 NGINX đều load balance đến cùng backends
curl http://localhost:80
# → "Hello from nodeapp3"
curl http://localhost:81
# → "Hello from nodeapp1"
```

---

## Scaling NGINX thực tế

### Option 1: DNS Round Robin
```
nginx-app.com → A record: 1.2.3.4 (Machine 1 - NGINX 1)
             → A record: 5.6.7.8 (Machine 2 - NGINX 2)
```

### Option 2: IP Tables (Linux)
```bash
# Bất kỳ request đến port 80 → load balance giữa port 80 và 81
iptables -t nat -A PREROUTING -p tcp --dport 80 -m statistic \
  --mode nth --every 2 --packet 0 -j REDIRECT --to-port 80
iptables -t nat -A PREROUTING -p tcp --dport 80 -m statistic \
  --mode nth --every 2 --packet 1 -j REDIRECT --to-port 81
```

### Option 3: Kubernetes
Kubernetes tự động orchestrate containers → không cần manual port management.

---

## Lưu ý về High Availability

```
Docker trên cùng 1 host machine:
├── NGINX 1 (Container)
├── NGINX 2 (Container)
└── 3 Node backends

⚠️ Nếu host machine die → TẤT CẢ die!
```

Để thực sự HA, cần multiple **Docker hosts** (multiple physical/virtual machines).

---
**Tiếp theo:** Bài 4 - Docker Networking Deep Dive →

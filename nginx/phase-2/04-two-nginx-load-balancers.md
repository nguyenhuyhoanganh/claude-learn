# Bài 4: 2 NGINX load balancer cùng pool — pattern và hạn chế

Bài này có vẻ trivial — "thêm một NGINX nữa, expose port khác". Thực chất nó mở ra một câu hỏi **lớn**: ai load balance giữa các NGINX? Câu trả lời cho thấy giới hạn của làm thuần Docker, và lý do Kubernetes/cloud LB tồn tại.

## Vấn đề: NGINX đã trở thành single point of failure

Bài 3 ta có 1 NGINX + 3 backend. Backend chết 1 → vẫn còn 2, NGINX tự skip backend chết. **HA cho backend tốt**.

```text
   Client ──► NGINX ──┬──► node1 ✓
                      ├──► node2 ✓
                      └──► node3 ✗  (chết, NGINX skip)
   → vẫn OK
```

Nhưng nếu **NGINX chết**:

```text
   Client ──► NGINX ✗  → KHÔNG có client nào tới được backend
```

→ 0% availability. NGINX trở thành **SPOF** (single point of failure).

## Pattern: thêm NGINX thứ 2

Giải pháp ngây thơ nhất:

```text
   port 80 ──► NGINX ng1 ──┐
                            ├──► 3 backend
   port 81 ──► NGINX ng2 ──┘
```

2 NGINX **chia sẻ cùng backend pool**. Mỗi NGINX có config **gần như y hệt** — chỉ khác name + hostname.

## Spin up NGINX thứ 2

Tiếp tục từ Bài 3 (NGINX `ng1` đã chạy, 3 backend đã chạy):

```bash
docker run -d \
  --name ng2 \
  --hostname ng2 \
  --network backend-net \
  -p 8081:8080 \
  -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf \
  nginx:1.25
```

Khác `ng1` chỉ ở:
- `--name ng2` thay `ng1`
- `--hostname ng2` thay `ng1`
- `-p 8081:8080` thay `8080:8080` (port host khác nhau, không xung đột)

**Config NGINX y hệt** — cả 2 NGINX đọc `./nginx.conf` mount từ host. Cùng `upstream` cùng `proxy_pass`.

## Test cả 2 NGINX

```bash
# Qua NGINX 1
curl http://localhost:8080
# Hello from node1
curl http://localhost:8080
# Hello from node2

# Qua NGINX 2
curl http://localhost:8081
# Hello from node1     ← ng2 cũng round-robin riêng từ đầu
curl http://localhost:8081
# Hello from node2
```

→ Cả 2 NGINX **đều load balance đến cùng pool**, **độc lập về state**.

> Để ý: `ng1` và `ng2` mỗi đứa có round-robin counter riêng. Không sync state với nhau. Nếu cả 2 cùng nhận traffic, phân phối tới backend vẫn đều (xác suất).

## Câu hỏi quan trọng: ai gọi NGINX nào?

Client (browser, mobile app) **không biết** có 2 NGINX. Vấn đề: làm sao client chia đều giữa `:8080` và `:8081`?

Có **5 cách** giải, từ thô tới production:

### Cách 1 — Client tự rotate (KHÔNG khuyến nghị)

Hard-code 2 URL trong client:

```javascript
const lbs = ['https://api.example.com:8080', 'https://api.example.com:8081'];
const url = lbs[Math.floor(Math.random() * lbs.length)];
fetch(url + '/users');
```

**Vấn đề**:
- Client phải biết mọi NGINX endpoint → không scale được khi thêm/bớt.
- Browser cache.
- Không health check — client gọi vào NGINX chết.

→ **Không ai làm production thế này**.

### Cách 2 — DNS round-robin

```text
api.example.com  →  A record: 1.2.3.4   (host chạy ng1)
                 →  A record: 5.6.7.8   (host chạy ng2)
```

DNS resolver trả luân phiên (hoặc random) 1 trong 2 IP. Client trên các máy khác nhau gọi vào IP khác nhau.

**Ưu**: client không thay đổi gì. Cấu hình ở DNS.

**Nhược**:
- **Không health check** — nếu host 1 chết, DNS vẫn trả IP đó cho 50% client → 50% timeout.
- **DNS cache** trong client (TTL) — đổi IP rồi vẫn có client gọi IP cũ tới khi cache hết.
- Phân phối **không đều** vì cache.

Một số DNS provider có "health-check DNS" (Route 53, Cloudflare DNS) — tự rút IP chết khỏi answer. Nhưng vẫn bị TTL cache.

### Cách 3 — IP tables / NAT load balance (Linux)

```bash
# Anyone connecting to port 80 → load balance giữa 8080 và 8081
iptables -t nat -A PREROUTING -p tcp --dport 80 \
  -m statistic --mode nth --every 2 --packet 0 \
  -j REDIRECT --to-port 8080

iptables -t nat -A PREROUTING -p tcp --dport 80 \
  -m statistic --mode nth --every 2 --packet 1 \
  -j REDIRECT --to-port 8081
```

→ Kernel chia connection theo statistic mode. Hoạt động tốt nhưng:
- Chỉ Linux.
- Cần root.
- Không health check.
- Stateless — packet 0 đi 8080, packet 1 đi 8081 — phá vỡ TCP connection.

Cần thêm `-m statistic --mode random` + `-m state --state NEW` để chỉ split **connection mới**, không phá connection đang chạy. Phức tạp.

### Cách 4 — Cloud LB (production thực tế)

AWS ELB / ALB, GCP Load Balancer, Azure Load Balancer:

```text
              Cloud LB (managed)
              public IP duy nhất
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
    Host 1 (ng1)            Host 2 (ng2)
        │                       │
        └────────► backend pool ◄────┘
```

Cloud LB:
- Một public IP duy nhất, client chỉ biết IP đó.
- **Active health check** — gửi probe HTTP đến từng host, tự rút host chết khỏi pool.
- Tự scale (auto-scaling group).
- TLS có thể terminate ở LB hoặc passthrough về NGINX.

→ Đây là **pattern chuẩn** ở mọi công ty trên AWS/GCP/Azure.

### Cách 5 — Kubernetes Service + Ingress

Trong K8s, **không tự `docker run` từng NGINX**:

```text
   Client ─► K8s Ingress (NGINX Ingress Controller)
                     │
              K8s Service (ảo, không thật)
                     │
                ┌────┴────┬─────────┐
                ▼         ▼         ▼
            Pod ng1    Pod ng2   Pod ng3
                │         │         │
                └─────────┴─────────┘
                          │
                  K8s Service (backend)
                          │
                ┌─────────┼─────────┐
                ▼         ▼         ▼
            node1     node2     node3
```

K8s tự:
- Scale số NGINX pod theo CPU/req.
- Health check liên tục.
- Service discovery — pod chết là rút khỏi pool ngay.
- Rolling update — không downtime.

→ **Hiện tại** đây là pattern cloud-native phổ biến nhất.

## Tại sao tự làm 2 NGINX trên cùng 1 Docker host **không** giải SPOF

Phản đề quan trọng:

```text
   [single laptop / single VM]
   ┌─────────────────────────────┐
   │   ng1                        │
   │   ng2                        │
   │   node1, node2, node3        │
   └─────────────────────────────┘
           │
   Host chết → tất cả chết
```

2 NGINX trên cùng 1 host vẫn **chung số phận**:
- Host kernel panic → cả 2 NGINX chết.
- Mất điện datacenter → cả 2 chết.
- Network card chết → cả 2 mất internet.

Để **thực sự HA**, NGINX phải nằm trên **các host khác nhau**, lý tưởng là **các availability zone khác nhau**:

```text
   Cloud LB (multi-AZ)
        │
   ┌────┴────┐
   ▼         ▼
 Host A    Host B
 (AZ-a)    (AZ-b)
 ng1       ng2
```

AZ-a chết (catastrophic) → AZ-b vẫn live → khách hàng vẫn dùng được.

> **Phase-6 Bài 1** sẽ trả lời "scale NGINX" chi tiết hơn.

## Khi nào pattern "2 NGINX cùng host" có nghĩa?

Dù không HA, vẫn có lý do thực dụng:

| Mục đích | Vì sao 2 NGINX cùng host vẫn hữu ích |
|---|---|
| Học/debug | Xem cách phân phối, test khi 1 NGINX restart |
| Blue/Green deploy NGINX config | ng1 = blue (old), ng2 = green (new) — switch routing từ DNS/iptables |
| Tách workload | ng1 phục vụ user, ng2 phục vụ admin/internal — config khác nhau |
| Tận dụng đa core nếu instance đơn không scale CPU đủ | Hiếm — NGINX worker đã đa-process, ít khi gặp giới hạn này |

→ Trong khoá học, pattern này có giá trị **giáo dục**. Trong production, dùng cloud LB hoặc K8s.

## Vấn đề "stateful" giữa các NGINX

Một câu hỏi tinh tế khi có > 1 NGINX:

- Round-robin counter — mỗi NGINX có riêng → không thực sự đều khi traffic phân lệch.
- Rate limit (`limit_req`) — mỗi NGINX có counter riêng → user gửi 5 req/s đến `ng1` và 5 req/s đến `ng2` = 10 req/s tổng dù mỗi NGINX limit 6 req/s.
- Cache (`proxy_cache`) — mỗi NGINX cache riêng → cùng URL hot, cache lần đầu ở `ng1` rồi lần sau ở `ng2` cũng phải miss → tốn backend.

**Mitigation**:
- Rate limit chính xác → cần Redis-backed shared counter (module `nginx-redis` / `redis-cell` cho OpenResty).
- Shared cache → Varnish/Redis cache layer trước/sau NGINX.
- NGINX Plus có **state sharing** giữa instance (paid feature).

→ NGINX Open Source mặc định **không share state**. Hiểu giới hạn này là kỹ năng kiến trúc.

## Bẫy thường gặp

| Bẫy | Vấn đề | Cách tránh |
|---|---|---|
| 2 NGINX `-p 8080:8080` | Port host xung đột | Dùng port khác nhau (`8081`, `8082`...) |
| Mount file config từ thư mục khác | 2 NGINX dùng config khác nhau | Mount cùng 1 file `./nginx.conf` để đảm bảo giống nhau |
| Không cùng `--network` | NGINX không thấy backend | Cả 2 NGINX phải join `backend-net` |
| Mong scale request thông qua 2 NGINX cùng host | CPU/network bị share | Phải multi-host để có hiệu quả scale thật |
| Test HA bằng `docker stop ng1` | Client phải tự chuyển port — không phản ánh production | Production phải có LB cấp trên (cloud LB/K8s) |

## Tóm tắt bài 4

- 1 NGINX = SPOF. Cần ≥ 2 instance cho HA.
- 5 cách phân phối client giữa NGINX: client rotate, DNS round-robin, iptables NAT, **cloud LB**, **Kubernetes** — sau cùng là cloud-native chuẩn.
- 2 NGINX trên cùng host **không phải HA** — host chết là cả 2 chết.
- Mỗi NGINX có state riêng (counter, cache) — open source không share, là một giới hạn cần biết.
- Pattern này có giá trị học/debug; production luôn cần LB cấp trên.

**Bài kế tiếp** → [Bài 5: Docker networking deep-dive — bridge, custom network, multi-network](05-docker-networking.md)

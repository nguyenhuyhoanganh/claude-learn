# Bài 1: Scale NGINX — bao giờ và bằng cách nào?

Câu hỏi cao trào: **NGINX của tôi chậm — scale thế nào?** Câu trả lời rất nuanced. Bài này đi qua **4 cách scale** với trade-off, và **nguyên tắc "không scale khi chưa cần"** — sai lầm phổ biến của junior engineer.

## Khi nào NGINX **thực sự** bị overload?

Trước khi scale, phải xác định bottleneck **chính xác** ở đâu. Đa số case "NGINX chậm" là **backend chậm**, không phải NGINX.

### Triệu chứng NGINX overload

| Triệu chứng | Khả năng cao là NGINX overload |
|---|---|
| `nginx_connections_active` gần `worker_processes × worker_connections` | ✓ |
| CPU NGINX ≥ 80% sustained | ✓ |
| `ListenDrops` trong `nstat` tăng nhanh | ✓ (accept queue đầy) |
| Latency NGINX (qua time_request_time log) > 5ms cho proxy | ✓ |
| Memory NGINX growing không stop | Memory leak (rare) hoặc cache phồng |
| Backend OK nhưng client timeout | NGINX không accept kịp |

### Triệu chứng backend overload (KHÔNG phải NGINX)

| Triệu chứng | Là backend |
|---|---|
| Backend CPU/RAM cao | ✓ |
| Slow query log DB nhiều | ✓ |
| NGINX 504 Gateway Timeout (read timeout) | ✓ |
| Latency log p99 backend cao, NGINX itself fast | ✓ |
| Scale backend → user thấy nhanh hơn | ✓ |

→ **Đo đúng trước khi scale**. Scale NGINX khi backend chết = sai bằng cấp.

## Tại sao 1 NGINX có giới hạn?

Mỗi connection chiếm:

```text
   Per-connection cost:
   ├── ~10-50 KB memory (TCP state + TLS session + buffer)
   ├── 1 file descriptor (kernel)
   ├── CPU cycles cho TLS decrypt + HTTP parse
   └── Bandwidth qua NIC

   1 NGINX instance limit:
   ├── worker_connections × workers (~250k concurrent typical)
   ├── ~80% NIC bandwidth (10 Gbps NIC → ~8 Gbps useful)
   ├── CPU cap = số core × ~100k req/s (TLS-heavy ~10-30k)
   └── ulimit fd (tune lên 65535+)
```

Khi đụng giới hạn, các approach scale:

## Approach 1 — Vertical scaling (scale up)

Cho NGINX nhiều CPU + RAM hơn trên cùng máy:

```text
   Trước: 4 core, 8 GB RAM
   Sau:   16 core, 32 GB RAM
```

NGINX với `worker_processes auto` **tự động** tạo 16 worker thay vì 4. Tăng throughput gần tuyến tính.

### Pros

- ✓ **Đơn giản nhất** — không thay đổi architecture.
- ✓ Không tăng complexity vận hành.
- ✓ Cùng config, không debug network.

### Cons

- ✗ **Giới hạn vật lý** — cloud có max instance size.
- ✗ **Single point of failure** vẫn còn.
- ✗ **Diminishing return** — gấp đôi RAM không gấp đôi throughput nếu bottleneck là NIC.
- ✗ Cost không tuyến tính — server 64 core đắt gấp 10 server 4 core, không phải 16.

→ Vertical là **lựa chọn đầu tiên**. 1 NGINX trên server tốt = 200k+ req/s — đủ cho 90% công ty.

## Approach 2 — Horizontal: DNS round-robin

Nhiều NGINX trên các máy khác nhau:

```text
   mysite.com.   A   1.2.3.4    (NGINX 1)
                 A   5.6.7.8    (NGINX 2)
                 A   9.0.1.2    (NGINX 3)
```

DNS server trả luân phiên (round-robin) hoặc random một IP cho mỗi DNS query.

### Pros

- ✓ Đơn giản, không cần LB cấp trên.
- ✓ Distributed nếu mỗi NGINX ở region khác nhau (geo-DNS).

### Cons

- ✗ **Không có active health check** — IP chết, DNS vẫn trả, 1/3 user fail.
- ✗ **DNS cache** trong client → đổi IP rồi vẫn có client gọi IP cũ vài giờ.
- ✗ **Phân phối không đều** vì cache + recursive resolver.
- ✗ Failover chậm (TTL DNS).

→ DNS round-robin là **safety net**, không nên là cơ chế chính.

## Approach 3 — Horizontal: cloud LB phía trước

```text
                  ┌─── Cloud LB (1 IP) ────┐
                  │   (AWS ALB, GCP HTTPS LB)│
                  └────────┬────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         NGINX-1       NGINX-2       NGINX-3
         (AZ-a)        (AZ-b)        (AZ-c)
```

### Pros

- ✓ **Active health check** — LB probe NGINX, tự rút node chết.
- ✓ Sticky session (cookie-based, ELB).
- ✓ Auto-scaling integration.
- ✓ TLS có thể terminate ở LB hoặc passthrough.
- ✓ Multi-AZ HA — AZ chết, LB chuyển traffic.

### Cons

- ✗ **Cost** — cloud LB tính phí theo throughput + connection.
- ✗ Phụ thuộc cloud (vendor lock-in).
- ✗ Thêm 1 hop latency (~1 ms).

→ Đây là **pattern chuẩn** ở mọi công ty trên AWS/GCP/Azure. **Khuyến nghị production**.

## Approach 4 — Anycast IP

```text
   Public IP: 198.51.100.1  (cùng 1 IP)
            ↑
   ┌────────┼────────────────┐
   │        │                │
   NGINX-1  NGINX-2          NGINX-3
   (US)     (EU)              (ASIA)
```

Cùng IP advertised từ **nhiều location** qua BGP. Client gửi packet đến IP đó → router chọn **path ngắn nhất** → đến NGINX gần nhất.

### Pros

- ✓ **Geo-routing tự nhiên** — user Asia về Asia, US về US.
- ✓ 1 IP duy nhất — DNS đơn giản.
- ✓ DDoS protection tự nhiên — attack split theo location.

### Cons

- ✗ **Phức tạp** — cần BGP + ASN + datacenter agreement.
- ✗ **Đắt** — chỉ doanh nghiệp lớn / CDN dùng.
- ✗ Stateful service khó (mỗi user có thể về node khác).

→ **Cloudflare, Google, Akamai** dùng anycast. Bạn dùng các CDN này tức là đã hưởng anycast gián tiếp.

## Approach 5 (advanced) — VRRP / Virtual IP

```text
       VRRP virtual IP: 10.0.0.100
                 ↓
   ┌─────────────┴─────────────┐
   │                            │
NGINX-A (master)        NGINX-B (standby)
   │                            │
   └── nhận traffic              └── passive, chờ
       (gửi keepalive heartbeat)

   Master chết → standby tiếp quản VIP tự động trong vài giây
```

VRRP (Virtual Router Redundancy Protocol) / Keepalived: 2 máy share 1 IP virtual. Active một lúc 1 máy, máy kia chờ. Master chết → standby tự take over.

### Pros

- ✓ Failover **nhanh** (1-3 giây).
- ✓ Không cần cloud LB — đặt được on-premise.
- ✓ Stateful service (database) cũng dùng được.

### Cons

- ✗ **Chỉ active-passive** — máy standby idle, lãng phí.
- ✗ Multi-master cần thêm tool phức tạp.
- ✗ Layer 2 (cùng subnet) — không cross-region.

→ Phổ biến trên-premise, datacenter. Cloud có cloud LB thay thế.

## Tối ưu trước khi scale — squeeze 1 instance

Nguyên tắc vàng:

> **Đừng scale NGINX vì "có thể". Squeeze 1 box trước.**

### Checklist tune

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 65535;
    use epoll;
    multi_accept on;
}

http {
    sendfile      on;
    tcp_nopush    on;
    tcp_nodelay   on;
    
    keepalive_timeout  30;
    keepalive_requests 10000;
    
    # Upstream keepalive (quan trọng nhất)
    upstream backend {
        server app1:8080;
        keepalive          64;
        keepalive_timeout  30s;
        keepalive_requests 10000;
    }
    
    server {
        listen 443 ssl http2 reuseport;     # reuseport cho multi-worker accept
        
        # TLS optimization
        ssl_protocols           TLSv1.2 TLSv1.3;
        ssl_session_cache       shared:SSL:50m;
        ssl_session_timeout     1h;
        ssl_session_tickets     off;
        ssl_stapling            on;
    }
}
```

### OS tuning

```bash
# /etc/sysctl.conf
net.core.somaxconn=65535               # accept queue
net.core.netdev_max_backlog=65535
net.ipv4.tcp_max_syn_backlog=65535
net.ipv4.ip_local_port_range=1024 65535
fs.file-max=200000

# /etc/security/limits.conf
nginx soft nofile 65535
nginx hard nofile 65535
```

→ Đa số NGINX "chậm" là do **chưa tune**. Default 1024 worker_connections = giới hạn nhanh.

## Load testing — đo lường trước khi quyết

```bash
# wrk — modern load tester
wrk -t12 -c400 -d30s --latency https://api.example.com/

# Output:
# Latency Distribution:
#   50%   12.34ms
#   75%   23.45ms
#   90%   45.67ms
#   99%  156.78ms
# Requests/sec: 12,345.67

# ab — Apache bench (simple)
ab -n 10000 -c 100 -k https://api.example.com/

# vegeta — flexible
echo "GET https://api.example.com/" | vegeta attack -duration=30s -rate=100 | vegeta report
```

Test ở:
- **1 NGINX tuned**: throughput max bao nhiêu?
- **Backend trực tiếp**: backend max bao nhiêu?
- **NGINX + backend**: bottleneck đâu? Latency thêm bao nhiêu?

So sánh:
- Nếu **NGINX maxed out trước backend** → scale NGINX.
- Nếu **backend maxed out trước** → scale backend, không phải NGINX.

## Tóm tắt approach

| Approach | Khi nào | Pros | Cons |
|---|---|---|---|
| **Vertical** | Đầu tiên, đơn giản | Không thay arch | Giới hạn vật lý, SPOF |
| **DNS round-robin** | Bổ trợ, không primary | Free, geo-DNS | No health check, cache TTL |
| **Cloud LB** | Production chuẩn | HA, active health check | Cost, vendor lock |
| **Anycast** | CDN scale toàn cầu | 1 IP, geo-natural | Phức tạp, đắt |
| **VRRP** | On-premise HA | Failover nhanh | Active-passive |

## Pattern thực tế cho 3 tier scale

```text
Tier 1 — Startup/SME (<1000 user/s):
   1 NGINX + tune kỹ + 3-5 backend
   Cloud LB optional

Tier 2 — Mid-size (1000-100k req/s):
   Cloud LB → 2-5 NGINX (auto-scale) → 10-100 backend
   Multi-AZ
   Cache layer (Varnish/Redis) phía trước nếu cần

Tier 3 — Hyperscale (>100k req/s):
   Anycast → CDN edges → regional NGINX/Envoy → backend
   Hoặc chuyển sang Envoy/Pingora/custom proxy
   Service mesh (Istio, Linkerd)
```

## Khi nào KHÔNG scale NGINX?

- CPU NGINX < 30% sustained — chưa cần.
- Backend rõ ràng là bottleneck — scale backend trước.
- Workload là static content nhỏ — NGINX dư sức.
- Budget hạn chế và 1 NGINX đủ — đừng over-engineer.

## Bẫy thường gặp khi scale

| Bẫy | Hệ quả |
|---|---|
| Scale NGINX khi backend mới là bottleneck | Vẫn slow, lãng phí tiền |
| 2 NGINX cùng host = không HA | Host chết là cả 2 chết |
| Auto-scale theo CPU NGINX (TLS-heavy) | Thuật toán scale-up sai khi TLS spike |
| Cache cross-NGINX không sync | Hit rate giảm khi scale ra nhiều node |
| Session state in NGINX worker memory | Sticky LB phải cứng |

## Tóm tắt bài 1

- **Đo trước, scale sau** — đa số "NGINX chậm" thực ra là backend.
- 4 approach scale: vertical (đầu tiên), DNS round-robin (bổ trợ), cloud LB (chuẩn), anycast (hyperscale).
- Squeeze 1 NGINX bằng tune `worker_connections`, `keepalive`, OS sysctl trước.
- Pattern thực: SME 1 NGINX tune kỹ; mid-size cloud LB + auto-scale; hyperscale CDN/anycast.
- Tránh: scale khi không cần, cùng host không HA, cache không sync.

**Bài kế tiếp** → [Bài 2: Bao nhiêu backend là vừa? Trade-off resource](02-how-many-backends.md)

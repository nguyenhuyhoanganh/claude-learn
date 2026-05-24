# Bài 3: Layer 4 vs Layer 7 proxy — chọn đúng tầng OSI

Đây là một trong những lựa chọn **gốc rễ** khi cấu hình NGINX. Chọn sai = cả hệ thống thiết kế sai. Hai khái niệm này là **bắt buộc** với mọi backend engineer, không phải kiến thức tuỳ chọn.

## OSI model — chỉ cần nhớ 4 và 7

OSI có 7 tầng, nhưng trong ngữ cảnh proxy/load balancer ta chỉ cần phân biệt rõ **Layer 4** (Transport) và **Layer 7** (Application):

```text
┌────────────────────────────────────────────────────────────┐
│ Layer 7 - Application                                      │
│   HTTP, HTTPS, WebSocket, gRPC, FTP, SMTP                  │
│   (URL, headers, cookies, body, method...)                 │
├────────────────────────────────────────────────────────────┤
│ Layer 6 - Presentation  (mã hoá, nén — ít quan tâm)        │
├────────────────────────────────────────────────────────────┤
│ Layer 5 - Session       (session ở mức OS — ít quan tâm)   │
├────────────────────────────────────────────────────────────┤
│ Layer 4 - Transport                                        │
│   TCP, UDP                                                 │
│   (source IP+port, dest IP+port, TCP flags)                │
├────────────────────────────────────────────────────────────┤
│ Layer 3 - Network       (IP routing — router lo)           │
├────────────────────────────────────────────────────────────┤
│ Layer 2 - Data Link     (Ethernet, MAC — switch lo)        │
├────────────────────────────────────────────────────────────┤
│ Layer 1 - Physical      (dây cáp, sóng radio)              │
└────────────────────────────────────────────────────────────┘
```

> Trong giao tiếp client ↔ server qua Internet, **OSI tầng 1-3 là router/switch lo**, tầng **4 là kernel lo**, tầng **5-7 là application lo**. Khi nói "Layer 4 proxy" hay "Layer 7 proxy", ta đang chỉ tầng mà NGINX **đọc và đưa ra quyết định**.

## Hình dung "kính lúp"

Tưởng tượng bạn cầm kính lúp xem một packet đang đi qua NGINX. Tuỳ bạn đặt kính ở tầng nào, bạn thấy **những thứ khác nhau**:

### Đặt kính ở Layer 4

```text
   ┌─────────────────────────────────────────────┐
   │  TCP segment / IP packet                    │
   │                                             │
   │  Source IP:    203.0.113.45                 │
   │  Source port:  54321 (random của client)    │
   │  Dest IP:      198.51.100.10  (server)      │
   │  Dest port:    443 (HTTPS) hoặc 5432 (PG)   │
   │  TCP flags:    SYN / ACK / FIN ...          │
   │  Payload:      [đống bytes — KHÔNG đọc nội dung] │
   └─────────────────────────────────────────────┘
```

NGINX **thấy được**: IP nguồn, IP đích, port, TCP flags (đặc biệt `SYN` để biết "client đang muốn bắt tay").

NGINX **không thấy**: URL, header HTTP, cookie, method, body. Toàn bộ payload đối với L4 chỉ là "đống bytes" — không quan tâm là HTTP, gRPC, hay binary protocol của database.

> ⚠️ **Lưu ý quan trọng về security**: thông tin Layer 4 (IP + port) **không bao giờ được mã hoá**. Sniffer trên router/ISP/WiFi đều thấy được "ai đang nói chuyện với ai trên port nào". Chỉ payload (Layer 7) mới được TLS mã hoá.

### Đặt kính ở Layer 7

```text
   ┌─────────────────────────────────────────────┐
   │  Toàn bộ Layer 4 +                          │
   │                                             │
   │  HTTP/1.1:                                  │
   │    GET /api/users/42 HTTP/1.1               │
   │    Host: api.example.com                    │
   │    Authorization: Bearer eyJhbGc...         │
   │    Cookie: session=abc123                   │
   │    User-Agent: Mozilla/5.0 ...              │
   │                                             │
   │  Body: { "name": "Alice", ... }             │
   └─────────────────────────────────────────────┘
```

NGINX **thấy được mọi thứ** — method, path, header, cookie, body. Có thể đưa ra quyết định cực thông minh.

**Cái giá**: phải **giải mã TLS** trước khi đọc được. Tức là NGINX phải có cert + private key, làm TLS termination, tiêu tốn CPU cho mỗi handshake.

## So sánh đầy đủ Layer 4 vs Layer 7 proxy

| Yếu tố | Layer 4 proxy | Layer 7 proxy |
|---|---|---|
| Tầng OSI quan sát | TCP/UDP | TCP/UDP **+** HTTP/WebSocket/gRPC... |
| Thông tin có thể đọc | IP, port, TCP state | Tất cả L4 + URL, header, method, body, cookie |
| TLS | Pass-through (không decrypt) | Phải terminate (decrypt) |
| Cần cert + private key ở NGINX? | Không | Có |
| Routing theo URL/header | Không thể | Có |
| Cache response | Không thể (không hiểu nội dung) | Có |
| Rewrite/inject header | Không | Có |
| Share backend connection giữa nhiều client | Không (1 client = 1 backend conn) | Có (HTTP/1.1 keep-alive + connection pool) |
| CPU cost / request | Thấp (không decrypt, không parse) | Cao hơn (decrypt + parse HTTP) |
| Latency thêm vào | Vài chục μs | Vài trăm μs đến ~1 ms |
| Protocol có thể proxy | Mọi TCP/UDP (Postgres, MySQL, gRPC, raw TCP, mail, DNS) | Chỉ HTTP-family (HTTP/1.1, HTTP/2, HTTP/3, WebSocket, gRPC) |
| NGINX context | `stream {}` | `http {}` |
| Sticky session | Tự nhiên (1 conn = 1 backend) | Cần `ip_hash`/`hash`/cookie module |
| WAF, rate limit theo URL | Không | Có |

## Hai context của NGINX

NGINX có **2 module xử lý** tương ứng:

### `http {}` context — Layer 7

```nginx
http {
    upstream api_backend {
        server backend1:8080;
        server backend2:8080;
    }

    server {
        listen 443 ssl;
        server_name api.example.com;

        ssl_certificate     /etc/nginx/cert.pem;
        ssl_certificate_key /etc/nginx/cert.key;

        location /api/ {
            proxy_pass http://api_backend;
        }

        location /admin/ {
            return 403;     # block path admin
        }
    }
}
```

Đặc trưng: dùng `server`, `location`, `proxy_pass http://...`, có thể `add_header`, `proxy_cache`, `limit_req`, ...

### `stream {}` context — Layer 4

```nginx
stream {
    upstream pg_backend {
        server pg1:5432;
        server pg2:5432;
    }

    server {
        listen 5432;
        proxy_pass pg_backend;
    }
}
```

Đặc trưng: dùng `server`, **không có `location`**, `proxy_pass <upstream>` (không có `http://`), không `add_header`, không cache. NGINX chỉ làm "ống dẫn" TCP/UDP.

> ⚠️ `stream {}` phải nằm **ngang hàng** với `http {}` ở top-level của `nginx.conf`, không lồng bên trong `http {}`.

## Khi nào chọn Layer 4?

### Case 1: NGINX không hiểu protocol backend

Postgres, MySQL, Redis, MongoDB, FTP, SMTP, gRPC (chế độ raw) — đều là application protocol, nhưng **NGINX không có code parse chúng**. Không có lựa chọn nào khác ngoài L4:

```nginx
stream {
    upstream postgres_cluster {
        server pg-primary:5432;
        server pg-replica1:5432 backup;
    }
    server {
        listen 5432;
        proxy_pass postgres_cluster;
    }
}
```

### Case 2: TLS passthrough — không muốn NGINX đụng vào cert của backend

Bạn cần **end-to-end encryption** (client → backend, NGINX không thấy nội dung):

```nginx
stream {
    upstream secure_backend {
        server app1:443;
    }
    server {
        listen 443;
        proxy_pass secure_backend;
    }
}
```

Backend tự xử lý TLS handshake. NGINX chỉ forward TCP segment.

### Case 3: WebSocket scaling cực cao

Mỗi WebSocket connection là **long-lived**. Layer 7 sẽ giữ 2 file descriptor (1 client + 1 backend), L4 cũng tương tự nhưng overhead parse HTTP/2 không có. Nếu chỉ cần proxy, L4 nhẹ hơn. Phase-5 sẽ so sánh kỹ.

### Case 4: Không cần routing/cache, ưu tiên hiệu năng

Microservice nội bộ talk sang nhau qua gRPC bidirectional stream, không cần URL routing — L4 sạch hơn L7.

## Khi nào chọn Layer 7?

### Case 1: Path/Host-based routing

```nginx
location /v1/ { proxy_pass http://api_v1; }
location /v2/ { proxy_pass http://api_v2; }
```

Quyết định dựa vào URL → chỉ có ở L7.

### Case 2: Cache HTTP response

Phải đọc method (cache `GET`, bỏ `POST`), URL (làm cache key), header (`Cache-Control`, `Vary`). Tất cả là L7.

### Case 3: Rewrite header / inject header

```nginx
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Real-IP       $remote_addr;
add_header       Strict-Transport-Security "max-age=31536000";
```

Đụng vào header HTTP → chỉ L7.

### Case 4: Share backend connection (efficient pooling)

L7 hiểu HTTP/1.1 stateless — một backend connection có thể phục vụ nhiều client request liên tiếp. L4 thì không: TCP connection của client A là của client A, không "chia" được cho client B vì L4 không biết "request" là gì.

```text
Layer 7 (keep-alive pool):
   Client A ─┐
   Client B ─┼─► NGINX ─┬─► Backend (chỉ ~10 conn, reuse cho mọi client)
   Client C ─┘          └─►
   (1000 client, 10 backend conn)

Layer 4:
   Client A ────► NGINX ────► Backend conn #1
   Client B ────► NGINX ────► Backend conn #2
   Client C ────► NGINX ────► Backend conn #3
   (1000 client = 1000 backend conn — tốn file descriptor)
```

→ Trên backend cao tải, L7 **scale tốt hơn** L4 nhờ connection sharing.

### Case 5: API gateway, WAF, rate limit theo URL

Tất cả đều cần đọc URL → bắt buộc L7.

## Lưu ý: HTTP có thể chạy qua L4

Câu hỏi thường gặp: *"App của tôi là HTTP — có bắt buộc dùng L7 không?"*

**Không bắt buộc**. Bạn có thể proxy HTTP qua `stream {}` (L4) — NGINX không quan tâm payload là gì. Lúc đó NGINX hoạt động như "ống TCP": không cache, không route theo URL, không inject header.

Khi nào "HTTP qua L4" có nghĩa:
- Cần sticky session đơn giản (1 client = 1 backend, không cần module sticky).
- TLS passthrough cho HTTPS mà không muốn NGINX có cert.
- Test, debug, hoặc protocol HTTP biến thể mà NGINX HTTP module không hiểu.

## "Sticky" — đặc tính tự nhiên của L4

```text
Layer 4 (TCP connection):
   Client TCP conn #1 ────► (pegged) Backend A
   Client TCP conn #1 ────► (pegged) Backend A
   Client TCP conn #1 ────► (pegged) Backend A
   ↑ Cùng connection = cùng backend (vì connection state ở mức TCP)
```

L4 LB chỉ chọn backend **một lần** khi TCP handshake hoàn tất. Sau đó, mọi byte trên connection đó đều về cùng backend. Đây là sticky **mặc định**, không cần cấu hình.

```text
Layer 7 (per-request):
   Client TCP conn #1 ──► Request 1 ──► Backend A
                     ──► Request 2 ──► Backend B    (round-robin!)
                     ──► Request 3 ──► Backend C
```

L7 chia theo **request**, không phải **connection**. Nếu cần sticky ở L7, phải dùng `ip_hash` hoặc cookie-based stickiness (module `sticky` — NGINX Plus).

## Bẫy thường gặp

| Bẫy | Vấn đề | Cách tránh |
|---|---|---|
| Dùng L7 cho Postgres | NGINX không hiểu protocol → break | Dùng `stream {}` L4 |
| Dùng L4 rồi mong route theo URL | URL không đọc được ở L4 | Phải L7 (cần cert) |
| Dùng L4 passthrough rồi mong NGINX cache HTTPS | Không thấy được content | L7 + TLS terminate |
| Quên `proxy_set_header X-Real-IP` ở L7 | Backend log thấy IP của NGINX, không phải client | Set header X-Real-IP và X-Forwarded-For |
| Đặt `stream {}` trong `http {}` | Config error | Đặt ở top-level, ngang hàng với `http {}` |
| Cache `POST` request | Cache sai logic | Default NGINX không cache POST; nếu force phải hiểu rõ |

## Tóm tắt bài 3

- **Layer 4**: chỉ thấy IP + port. Dùng `stream {}`. Không decrypt, không route theo URL, sticky tự nhiên.
- **Layer 7**: thấy mọi thứ HTTP. Dùng `http {}`. Có thể terminate TLS, route, cache, rewrite header.
- Chọn L4 khi: protocol không phải HTTP, cần TLS passthrough, ưu tiên đơn giản.
- Chọn L7 khi: cần routing/cache/header/rate-limit theo URL, hoặc cần share backend connection.
- NGINX có thể đồng thời chạy L4 và L7 trong cùng một config (stream {} + http {}).

**Bài kế tiếp** → [Bài 4: TLS termination vs TLS passthrough — đặt cert ở đâu](04-tls-termination-passthrough.md)

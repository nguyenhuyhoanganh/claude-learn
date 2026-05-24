# Bài 4: TLS termination vs TLS passthrough — đặt cert ở đâu

Hai khái niệm này quyết định **NGINX có thấy nội dung HTTPS hay không**. Sai một cái = lỗi kiến trúc rất khó sửa sau. Ngoài câu hỏi "đặt cert ở đâu", ta cũng phải đụng vào TLS hoạt động ra sao — kiến thức nền không thể bỏ qua.

## TLS — từ nhu cầu đến giao thức

**TLS (Transport Layer Security)** là phiên bản hiện đại của SSL — tiêu chuẩn de facto để mã hoá truyền thông trên Internet. Mỗi khi bạn thấy `https://` trên thanh địa chỉ trình duyệt, đó là TLS đang chạy.

Để hiểu termination vs passthrough, ta phải hiểu TLS giải quyết **3 vấn đề** cùng lúc:

| Vấn đề | TLS giải bằng |
|---|---|
| Bảo mật (confidentiality) | Mã hoá bằng symmetric encryption (AES, ChaCha20) |
| Toàn vẹn (integrity) | MAC / AEAD (gắn authentication tag vào ciphertext) |
| Xác thực (authentication) | Certificate ký bởi CA (Certificate Authority) |

### Vì sao TLS phải dùng **cả hai** loại encryption?

- **Symmetric encryption** (AES, ChaCha20): cả client và server dùng **cùng một key**. Cực nhanh, nén được megabyte/giây. Vấn đề: **làm sao cả 2 bên có cùng key** mà không lộ?
- **Asymmetric encryption** (RSA, ECDSA, ECDH): mỗi bên có cặp **public key + private key**. Public key mã hoá, private key giải mã (hoặc ngược lại). Có thể trao đổi qua mạng công khai mà không lộ. Vấn đề: **rất chậm**, không dùng được cho dữ liệu lớn.

→ Combo: dùng asymmetric **chỉ để trao đổi một symmetric key**. Sau đó toàn bộ dữ liệu mã hoá bằng symmetric key đó.

### TLS handshake (TLS 1.2) — bước cốt lõi

```text
Client                              Server
  │                                    │
  │──────── ClientHello ───────────────►│
  │  (TLS version, cipher suites,      │
  │   client random)                    │
  │                                    │
  │◄─────── ServerHello ────────────────│
  │  (chosen cipher, server random)    │
  │◄─────── Certificate ────────────────│
  │  (certificate chain, signed by CA) │
  │◄─────── ServerKeyExchange ──────────│
  │  (ECDH public params)               │
  │◄─────── ServerHelloDone ────────────│
  │                                    │
  │ [verify cert chain against CA store]│
  │                                    │
  │──────── ClientKeyExchange ─────────►│
  │  (client ECDH public)               │
  │  [both derive same master secret]   │
  │                                    │
  │──────── Finished (encrypted) ──────►│
  │◄─────── Finished (encrypted) ───────│
  │                                    │
  │═══════ Application data ═══════════ │
  │           (symmetric AES/ChaCha20)  │
```

> TLS 1.3 đơn giản hoá — chỉ **1 round-trip** (1-RTT), thậm chí 0-RTT cho session resumption. Phase-4 Bài 6 đi sâu.

### Vì sao cần certificate?

Symmetric + asymmetric vẫn **không đủ**: ai đó có thể đứng giữa, đóng giả server, gửi public key của họ thay vì server thật. Cái cần là **xác thực**: "đây có phải `example.com` thật không?"

Đó là việc của **certificate** — một file ký số bởi một **Certificate Authority (CA)** uy tín (Let's Encrypt, DigiCert, Sectigo...). Browser/OS sẵn có một danh sách **trusted CA root**. Cert chỉ hợp lệ nếu chain ký dẫn về một root đáng tin.

> Đây là single-sided authentication: server chứng minh mình là `example.com`, client thì ẩn danh. **mTLS** (mutual TLS) yêu cầu client cũng có cert — ngoài phạm vi bài này.

## TLS termination — NGINX giải mã, đọc, rồi xử lý

Đây là setup phổ biến nhất trong môi trường có NGINX:

```text
Client                       NGINX                         Backend
  │  HTTPS (encrypted)         │                              │
  │═══════════════════════════►│ [decrypt with NGINX cert]    │
  │                            │ [đọc HTTP headers, body]     │
  │                            │ [route, cache, modify]       │
  │                            │                              │
  │                            │  HTTP plain hoặc HTTPS       │
  │                            │─────────────────────────────►│
  │                            │                              │
  │                            │◄─────────────────────────────│
  │                            │ [đóng gói lại response]      │
  │◄═══════════════════════════│                              │
```

NGINX **terminate** (kết thúc) TLS — nghĩa là TLS handshake xảy ra giữa client và NGINX, không phải client và backend.

### Trường hợp 1.A: NGINX HTTPS + Backend HTTP

```text
Client ──HTTPS──► NGINX ──HTTP plain──► Backend
        (mã hoá)         (không mã hoá, cùng LAN/VPC)
```

**Hợp lý khi**:
- Backend nằm trong cùng VPC/private network đáng tin (cùng datacenter, cùng cloud account).
- Đường giữa NGINX và backend không vượt qua public internet.
- App backend không có TLS sẵn (Node.js Express, Flask...).

**Lưu ý**: nếu công ty bạn ở cloud, traffic giữa NGINX và backend đi qua "shared infrastructure" của cloud provider. Nhiều team strict bảo mật sẽ vẫn yêu cầu mã hoá ở cả 2 bên (xem 1.B).

### Trường hợp 1.B: NGINX HTTPS + Backend HTTPS (re-encrypt)

```text
Client ──HTTPS──► NGINX ──HTTPS──► Backend
        (encrypt A)    (decrypt A, re-encrypt B)
```

- 2 kênh TLS **hoàn toàn độc lập** — NGINX decrypt từ kênh A, đọc/sửa, rồi mã hoá lại kênh B.
- Cert giữa NGINX-backend có thể tự ký (self-signed) hoặc cert nội bộ.
- Trade-off: thêm latency cho mỗi request (decrypt + re-encrypt).

Cấu hình:

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    location / {
        proxy_pass https://backend_https;      # https:// — phía backend cũng TLS
        proxy_ssl_verify       on;
        proxy_ssl_trusted_certificate /etc/nginx/internal-ca.pem;
    }
}
```

### Lợi ích của TLS termination

- ✓ NGINX đọc được HTTP content → cache, route, rewrite header, rate limit, WAF — **toàn bộ tính năng L7 dùng được**.
- ✓ Chỉ một cert chính ở NGINX, dễ quản lý/renew (Let's Encrypt cron).
- ✓ Optimization tập trung: HTTP/2, OCSP stapling, session resumption — chỉ tune ở NGINX.
- ✓ Có thể terminate nhiều domain SNI khác nhau trên cùng IP.

### Vấn đề của TLS termination

- Phải có **private key của domain** ở NGINX → hostile-host của NGINX = lộ key.
- CPU overhead cho TLS handshake (giảm nhiều nhờ TLS 1.3 + hardware AES-NI).
- Logging plaintext có thể vô tình rò thông tin nhạy cảm.

> Vấn đề "private key phải share với NGINX" được giải quyết bằng cách dùng **một cert cho NGINX** (cấp cho `example.com`) và **một cert nội bộ riêng** cho backend (nếu chọn 1.B). NGINX không cần "share key của backend".

## TLS passthrough — NGINX là ống dẫn mù

```text
Client                       NGINX                         Backend
  │  TCP SYN                   │                              │
  │═══════════════════════════►│═════════════════════════════►│
  │                            │   (forward, không đọc)       │
  │                            │                              │
  │  TLS ClientHello           │                              │
  │═══════════════════════════►│═════════════════════════════►│
  │                            │   (forward, không đọc)       │
  │                            │                              │
  │           [TLS handshake giữa client và backend trực tiếp] │
  │           [encrypted application data bypass NGINX hoàn toàn] │
  │                            │                              │
  │  Encrypted bytes           │                              │
  │═══════════════════════════►│═════════════════════════════►│
  │◄═══════════════════════════│◄═════════════════════════════│
```

NGINX **không** terminate TLS. Nó nhận TCP segment, forward nguyên xi tới backend. Backend là bên thực sự handshake với client.

NGINX khi đó là **layer 4 proxy** (xem Bài 3) — chỉ thấy IP, port, không thấy nội dung.

### Cách cấu hình passthrough

Dùng `stream {}` context + `ssl_preread`:

```nginx
stream {
    map $ssl_preread_server_name $backend_pool {
        api.example.com    api_backend;
        admin.example.com  admin_backend;
        default            default_backend;
    }

    upstream api_backend {
        server api1:443;
        server api2:443;
    }

    upstream admin_backend {
        server admin:443;
    }

    server {
        listen 443;
        ssl_preread on;
        proxy_pass $backend_pool;
    }
}
```

`ssl_preread` cho phép NGINX **peek** vào ClientHello để đọc SNI (Server Name Indication) → biết client muốn về domain nào, route đúng backend pool. Sau đó NGINX **không decrypt** — forward bytes nguyên xi.

### Khi nào dùng passthrough?

| Tình huống | Lý do |
|---|---|
| End-to-end encryption tuyệt đối | Compliance (PCI-DSS, HIPAA), hoặc team không tin NGINX operator |
| Backend tự manage cert | Mỗi service tự sở hữu cert, không muốn share với NGINX |
| Protocol không phải HTTP | NGINX không hiểu, cũng không cần (Postgres TLS, raw TCP TLS) |
| Multi-tenant với tenant cert riêng | Mỗi tenant có cert, NGINX chỉ route theo SNI |

### Cái giá phải trả

| Mất gì? | Hệ quả |
|---|---|
| Không cache HTTP response | Backend phải xử lý mọi request |
| Không route theo URL/header | Chỉ route được theo SNI hoặc IP/port |
| Không rewrite header | `X-Forwarded-For`, `X-Real-IP` — không có (nếu cần, dùng PROXY protocol) |
| Không share backend connection | Mỗi client = 1 TCP conn riêng đến backend |
| Không WAF, không rate limit theo URL | Chỉ rate limit theo IP |

### PROXY protocol — cứu cánh cho passthrough

Khi passthrough, backend mất thông tin client IP (vì TCP conn đến từ NGINX). Giải pháp: **PROXY protocol** (do HAProxy nghĩ ra, NGINX hỗ trợ).

NGINX gửi 1 dòng metadata trước TCP payload:

```text
PROXY TCP4 203.0.113.45 198.51.100.10 54321 443\r\n
[rest of TLS bytes...]
```

Backend (nếu hiểu PROXY protocol) parse dòng đầu để lấy IP client thật. Cấu hình NGINX:

```nginx
stream {
    server {
        listen 443;
        proxy_pass backend_pool;
        proxy_protocol on;
    }
}
```

Và backend (ví dụ Node.js với module `proxy-protocol-v2`) phải bật parse.

## So sánh đầy đủ

| Yếu tố | TLS termination | TLS passthrough |
|---|---|---|
| TLS handshake xảy ra giữa | Client ↔ NGINX | Client ↔ Backend |
| NGINX cần cert + key? | Có | Không |
| NGINX đọc được HTTP content? | Có | Không |
| Tầng OSI | Layer 7 (`http {}`) | Layer 4 (`stream {}`) |
| Cache | Được | Không |
| Routing theo URL | Được | Chỉ theo SNI hoặc IP/port |
| Rewrite/inject header | Được | Không (chỉ PROXY protocol) |
| Share backend connection | Được | Không |
| End-to-end encryption | Không (NGINX là "trusted middleman") | Có |
| CPU cost trên NGINX | Cao hơn (decrypt + encrypt) | Thấp (chỉ forward bytes) |
| Backend phải có cert | Tuỳ chọn (chỉ khi 1.B) | **Bắt buộc** |
| Có thể terminate nhiều SNI | Có (cert riêng từng domain) | Có (route theo SNI) |
| Multi-tenant với tenant tự sở hữu cert | Khó | Tự nhiên |

## Quyết định nhanh

```text
                        Cần đọc/cache/route theo HTTP content?
                              │
                ┌─────────────┴─────────────┐
               YES                          NO
                │                            │
                ▼                            ▼
       Compliance bắt buộc          Backend tự sở hữu cert?
       end-to-end encryption?       hoặc protocol không phải HTTP?
                │                            │
        ┌───────┴────────┐                   │
       YES               NO                  ▼
        │                │            Có thể chọn termination
        │                │            cho đơn giản. Hoặc passthrough
        │                ▼            nếu prefer end-to-end.
        │      TLS Termination
        │      (recommended cho 90% case)
        ▼
   TLS Passthrough
   (Layer 4, stream {})
```

## Tóm tắt bài 4

- TLS dùng asymmetric (trao key) + symmetric (mã hoá dữ liệu) + certificate (xác thực).
- **TLS termination**: NGINX có cert, giải mã, đọc, xử lý L7 (cache, route...). Phổ biến nhất.
- **TLS passthrough**: NGINX không giải mã, chỉ forward — end-to-end encryption, mất khả năng L7.
- 90% case: termination. Chọn passthrough khi end-to-end là bắt buộc hoặc protocol không phải HTTP.
- PROXY protocol cứu cánh khi passthrough cần truyền IP client thật cho backend.

**Bài kế tiếp** → [Bài 5: Kiến trúc nội bộ NGINX — master, worker, event loop](05-internal-architecture.md)

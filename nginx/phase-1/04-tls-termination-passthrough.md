# Bài 4: TLS Termination vs TLS Passthrough

## TLS là gì?

**TLS (Transport Layer Security)** = Chuẩn mã hóa phổ biến nhất hiện nay.
- Mỗi lần bạn thấy HTTPS → đó là TLS đang chạy.

### Cách TLS hoạt động:

**Bước 1: Asymmetric Encryption** (Public/Private Key)
- Dùng để trao đổi symmetric key một cách an toàn
- Chậm, không phù hợp mã hóa dữ liệu lớn

**Bước 2: Symmetric Encryption** (cả 2 bên dùng chung key)
- Nhanh, dùng để mã hóa toàn bộ communication

**Bước 3: Certificate**
- Xác thực server là ai → tránh Man-in-the-Middle
- CA (Certificate Authority) ký certificate cho server

---

## TLS Termination

> NGINX **decrypt** traffic từ client, sau đó forward đến backend (có thể HTTP hoặc HTTPS).

### Trường hợp 1: NGINX + Backend HTTP

```
Client ──[HTTPS]──→ NGINX ──[HTTP]──→ Backend
        (encrypted)       (plain text)

NGINX: Terminate TLS, đọc content, forward plain text
```

- Ai sniff được đoạn NGINX → Backend thấy plaintext
- Acceptable nếu network này "private" (datacenter, VPC)
- Cần: Certificate + Private key ở NGINX

### Trường hợp 2: NGINX + Backend HTTPS (Recommended trên Cloud)

```
Client ──[HTTPS]──→ NGINX ──[HTTPS]──→ Backend
        (encrypted)        (re-encrypted)

NGINX: Decrypt từ client, re-encrypt gửi backend
```

- Hai kênh TLS hoàn toàn tách biệt
- Thêm latency (decrypt + re-encrypt)
- Khuyến nghị: Dùng các cipher nhanh (ChaCha20, AES)

### Vấn đề của TLS Termination

Để NGINX làm TLS Termination, nó cần **private key** của backend:
- Nếu 1 domain → phải share certificate với NGINX
- Nhiều engineer không thích điều này: "Private key phải LUÔN giữ bí mật"
- Solution: NGINX tự generate certificate riêng

---

## TLS Passthrough

> NGINX **không decrypt** traffic — forward nguyên xi từ client đến backend.

```
Client ──[TLS handshake]──→ NGINX ──[Forward TLS]──→ Backend
                           (dumb pipe)

NGINX: Không đọc được gì, chỉ forward TCP packets
```

### Cách NGINX làm Passthrough:
- Nhận TLS ClientHello → không respond
- Forward toàn bộ TLS packets đến backend
- Backend tự respond TLS handshake với client
- NGINX chỉ là "man in the middle" nhưng mù hoàn toàn

### Ưu điểm:
- **End-to-end encryption**: Không ai (kể cả NGINX) đọc được content
- NGINX không cần certificate của backend
- An toàn hơn với người không tin tưởng NGINX host

### Nhược điểm:
- NGINX chỉ thấy Layer 4 (IP/port) → không thể:
  - Cache responses
  - Rewrite headers
  - Smart routing theo URL
  - Share backend connections
- Mỗi client → 1 dedicated backend connection

---

## So sánh

| | TLS Termination | TLS Passthrough |
|--|----------------|-----------------|
| **Decrypt tại** | NGINX | Backend |
| **NGINX cần cert** | Có | Không |
| **Layer** | Layer 7 | Layer 4 |
| **Cache** | Có thể | Không |
| **Smart routing** | Có thể | Không |
| **End-to-end** | Không | Có |
| **Backend connections** | Shared pool | Dedicated per client |

---

## Khi nào chọn cái nào?

```
Chọn TLS Termination khi:
- Cần cache, routing, header rewriting
- Muốn share backend connections
- Trust NGINX operator
- Private network (datacenter, VPC)

Chọn TLS Passthrough khi:
- Cần end-to-end encryption tuyệt đối
- Không trust NGINX operator
- Backend protocol không phải HTTP (e.g., database)
- Compliance requirements (PCI, HIPAA)
```

---
**Tiếp theo:** Bài 5 - NGINX Internal Architecture →

# Bài 1: NGINX Timeouts - Frontend Timeouts

## Tại sao Timeouts quan trọng?

Timeouts là công cụ quan trọng để:
- **Bảo mật**: Ngăn các cuộc tấn công như Slow Loris
- **Tài nguyên hiệu quả**: Không để các tiến trình "ma" chạy mãi, chiếm tài nguyên
- **UX tốt hơn**: Client không chờ đợi vô hạn

```
Client ───────> NGINX (Frontend Timeouts) ───────> Backend (Backend Timeouts)
```

## Phân loại Timeouts

```
NGINX Timeouts
├── Frontend Timeouts (Client ↔ NGINX)
│   ├── client_header_timeout
│   ├── client_body_timeout
│   ├── send_timeout
│   ├── keepalive_timeout
│   ├── lingering_timeout
│   └── resolver_timeout
└── Backend Timeouts (NGINX ↔ Upstream)
    ├── proxy_connect_timeout
    ├── proxy_send_timeout
    ├── proxy_read_timeout
    ├── proxy_next_upstream_timeout
    └── keepalive_timeout (upstream)
```

---

## Frontend Timeouts

### 1. `client_header_timeout` (default: 60s)

> Timeout để đọc **HTTP request headers** từ client.

**Flow:**
```
Client → TCP connect → Send: "POST / HTTP/1.1"
                     → [start timer]
                     → Send: "Content-Type: application/json"
                     → [pause... pause... pause...]
                     ← 408 Request Timeout (nếu quá 60s)
```

**Mục đích: Chặn Slow Loris Attack**

```
Slow Loris: Kẻ tấn công gửi header từng byte một
            → mỗi lần gửi, timer reset
            → chiếm connection mãi mà không hoàn thành request

client_header_timeout = 60s → Nếu header không đầy đủ trong 60s → 408 → đóng
```

**Cấu hình:**
```nginx
http {
    client_header_timeout 10s;  # Stricter = safer
}
```

---

### 2. `client_body_timeout` (default: 60s)

> Timeout giữa **hai lần đọc body** liên tiếp từ client.

Không phải timeout cho toàn bộ body — chỉ giữa hai lần đọc thành công.

**Flow:**
```
Client → POST request (large file upload)
       → [body segment 1] → timer reset
       → [body segment 2] → timer reset
       → [pause > 60s]
       ← 408 Request Timeout
```

**Use case:**
```nginx
# Mạng nội bộ, bandwidth cao → strict timeout
client_body_timeout 5s;

# Upload file từ mobile → relax timeout
client_body_timeout 30s;
```

**Lưu ý:** Sau khi timeout, NGINX vẫn đọc data từ client nhưng **discard** (không gửi tới backend) — đây là một phần của `lingering_timeout`.

---

### 3. `send_timeout` (default: 60s)

> Timeout giữa **hai lần ghi response** liên tiếp tới client.

Xảy ra khi NGINX gửi response về cho client.

**Flow:**
```
Backend → Gửi response → NGINX → [write segment 1 to client]
                                → [write segment 2 to client]
                                → [pause > 60s]
                                → Close connection
```

**Khi nào cần điều chỉnh:**
```nginx
# Download file lớn
send_timeout 120s;

# API thông thường (response nhỏ)
send_timeout 10s;
```

---

### 4. `keepalive_timeout` (default: 75s)

> Thời gian NGINX giữ **idle connection** từ client trước khi đóng.

**HTTP Keep-Alive vs non-Keep-Alive:**
```
Không có Keep-Alive:
Client → [TCP handshake] → Request → Response → [Close] → [TCP handshake] → Request...
         (tốn kém!)

Có Keep-Alive:
Client → [TCP handshake] → Request → Response → [idle...] → Request → Response → [idle...]
         (1 connection, nhiều requests)
```

**Cấu hình theo use case:**

```nginx
# Website tương tác nhiều
keepalive_timeout 30s;

# API endpoint đơn giản
keepalive_timeout 5s;

# Disable keep-alive (hiếm gặp)
keepalive_timeout 0;
```

**Header trả về cho client:**
```nginx
keepalive_timeout 75s 60s;
# 75s: NGINX giữ connection
# 60s: Giá trị trong header "Keep-Alive: timeout=60" gửi cho client
```

---

### 5. `lingering_timeout` (default: 5s, `lingering_time` = 30s)

> Thời gian NGINX **chờ và discard data** sau khi quyết định đóng connection.

Khi NGINX muốn đóng connection (do timeout/lỗi), không thể RST ngay lập tức (gây bugs ở client). Thay vào đó:

```
NGINX quyết định đóng connection
    ↓
[lingering period]: Đọc data từ client → Discard (không gửi backend)
    ↓ (sau lingering_timeout giữa hai reads, hoặc lingering_time tổng cộng)
Đóng connection thực sự (clean TCP close)
```

**Tại sao cần lingering?**
- HTTP protocol: client có thể đang gửi dang dở
- RST ngay → client nhận lỗi kỳ lạ, connection reset errors
- Lingering → graceful close, TCP state sạch sẽ

```nginx
lingering_timeout 5s;   # Tối đa chờ 5s giữa hai reads
lingering_time    30s;  # Tổng thời gian tối đa cho lingering phase
```

---

### 6. `resolver_timeout` (default: 30s)

> Timeout để **resolve DNS** của upstream server.

```
NGINX cần connect tới backend1.example.com
    ↓
Hỏi DNS server: "IP của backend1.example.com là gì?"
    ↓ [resolver_timeout = 30s]
Nếu không có response → Timeout → Fail / try next upstream
```

**Khuyến nghị:** Giảm xuống thấp — DNS resolution nên rất nhanh:
```nginx
resolver 8.8.8.8;
resolver_timeout 5s;  # 30s mặc định là quá lâu
```

---

## Tóm tắt Frontend Timeouts

| Timeout | Default | Chiều | Mục đích |
|---------|---------|-------|---------|
| `client_header_timeout` | 60s | Client→NGINX | Nhận headers |
| `client_body_timeout` | 60s | Client→NGINX | Nhận body |
| `send_timeout` | 60s | NGINX→Client | Gửi response |
| `keepalive_timeout` | 75s | NGINX↔Client | Giữ idle connection |
| `lingering_timeout` | 5s | NGINX↔Client | Graceful close |
| `resolver_timeout` | 30s | NGINX→DNS | Resolve upstream DNS |

**Error codes:**
- Frontend timeout → **408 Request Timeout**

---
**Tiếp theo:** Bài 2 - Backend Timeouts →

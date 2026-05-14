# Bài 1: Bảo Mật Kết Nối Database với TLS/SSL

## Tại sao cần mã hóa kết nối Database?

```
Không có TLS - Mọi thứ đi qua mạng ở dạng plaintext:

  Web Server ─────────────── Network ──────────────── Database
              username=admin
              password=secret123
              query="SELECT * FROM users"
              data=[{id:1, email:...}]
  
  → Attacker có thể sniff network → Thấy tất cả!

Trong môi trường cloud/Kubernetes:
  - Pods chạy trên nhiều nodes khác nhau
  - Traffic đi qua nhiều switches, routers
  - Software-defined networking → Ít kiểm soát hơn on-premise
  - PHẢI mã hóa!
```

---

## TLS/SSL: Cơ bản

```
TLS (Transport Layer Security) = Phiên bản mới của SSL

Cung cấp:
  1. Encryption: Data được mã hóa, không đọc được nếu intercept
  2. Authentication: Xác minh server/client là ai họ claim
  3. Integrity: Phát hiện data bị tampered (HMAC)

TLS versions:
  TLS 1.0, 1.1 → Deprecated (cũ, có vulnerabilities)
  TLS 1.2 → Vẫn phổ biến, an toàn
  TLS 1.3 → Mới nhất, nhanh hơn, an toàn hơn

Mục tiêu:
  RSA key >= 4096 bits (2048 min acceptable)
  → 4096-bit RSA rất khó brute-force
```

---

## Cấu hình TLS cho PostgreSQL

### Bước 1: Tạo Self-Signed Certificate

```bash
# Tạo private key + self-signed certificate
openssl req -new -x509 \
    -newkey rsa:4096 \
    -nodes \
    -keyout private.pem \
    -out cert.pem

# Các trường điền vào:
# Country Name: US
# State: California
# City: San Francisco
# Organization: MyCompany
# Common Name: localhost  ← QUAN TRỌNG! (hostname của DB server)
# Email: admin@mycompany.com
```

```
Note:
  -x509: Tạo self-signed certificate (không cần CA)
  -newkey rsa:4096: Tạo RSA key 4096 bits
  -nodes: Không mã hóa private key file
    (PostgreSQL cần đọc key tự động, không thể nhập password)

Trong production:
  → Dùng certificate từ Let's Encrypt hoặc commercial CA
  → Self-signed chỉ cho development/testing
```

### Bước 2: Cấu hình PostgreSQL

```bash
# Copy files vào PostgreSQL data directory
# /var/lib/postgresql/data/ (trong Docker)

# Chỉnh sửa postgresql.conf:
ssl = on
ssl_cert_file = 'cert.pem'
ssl_key_file = 'private.pem'

# Tùy chọn nâng cao:
ssl_min_protocol_version = 'TLSv1.2'
ssl_ciphers = 'HIGH:MEDIUM:+3DES:!aNULL'
```

```bash
# Phân quyền cho private key (QUAN TRỌNG!)
chmod 600 private.pem
chown postgres:postgres private.pem
# → Chỉ user postgres mới đọc được private key!
```

```bash
# Restart PostgreSQL để áp dụng
docker stop postgres
docker start postgres
```

### Bước 3: Test kết nối SSL

```bash
# Kết nối yêu cầu SSL
psql -h localhost -U postgres \
     -d mydb \
     --set=sslmode=require

# Kiểm tra SSL status
SELECT ssl, version FROM pg_stat_ssl 
WHERE pid = pg_backend_pid();
# → ssl=t (true) = đang dùng SSL
```

---

## SSL Modes trong PostgreSQL

```
Kết nối PostgreSQL có nhiều mức bảo mật:

  sslmode=disable      → Không dùng SSL (plaintext)
  sslmode=allow        → Thử SSL trước, fallback plaintext
  sslmode=prefer       → Prefer SSL (default của nhiều clients)
  sslmode=require      → Bắt buộc SSL, không verify cert
  sslmode=verify-ca    → SSL + verify certificate authority
  sslmode=verify-full  → SSL + verify CA + verify hostname

Production recommendation:
  → sslmode=verify-full (bảo mật nhất)
  → Cần client có root CA certificate của server

Development:
  → sslmode=require (đơn giản hơn, không cần CA cert)
```

```javascript
// Node.js với SSL
const { Pool } = require('pg');

const pool = new Pool({
    host: 'db.example.com',
    port: 5432,
    user: 'app_user',
    password: process.env.DB_PASSWORD,
    database: 'myapp',
    ssl: {
        mode: 'verify-full',
        rejectUnauthorized: true,
        ca: fs.readFileSync('/path/to/server-cert.pem')
    }
});
```

---

## Postgres Wire Protocol: Bên trong kết nối

### Luồng kết nối không mã hóa (Wireshark)

```
TCP Three-way Handshake:
  Client → SYN → Server
  Client ← SYN+ACK ← Server
  Client → ACK → Server

Startup message (Client → Server):
  {
    protocol_version: "3.0",
    user: "postgres",
    database: "mydb",
    client_encoding: "UTF8"
  }
  ← Note: Password CHƯA được gửi!

Authentication request (Server → Client):
  {
    type: "AuthenticationMD5Password",
    salt: [4 bytes random]
  }
  ← Server không gửi password, gửi challenge!

Password hash (Client → Server):
  MD5(MD5(password + username) + salt)
  ← 40 character hex string

Auth success (Server → Client):
  { type: "AuthenticationOk" }

Ready for query (Server → Client):
  Server sends data types, version info...
  "ReadyForQuery" message

Query (Client → Server):
  "SELECT * FROM employees"

Result (Server → Client):
  Binary data → 300 bytes total

Connection termination:
  Client → FIN → Server
```

```
Vấn đề với không có TLS:
  - MD5 password hash bị expose trên network
  - MD5 đã bị crack, không còn an toàn
  - Query text visible (plaintext)
  - Result data visible (plaintext)
  
→ Cần TLS để mã hóa toàn bộ luồng này
```

### Với TLS: Không thể đọc được

```
TCP Three-way Handshake → TLS Handshake:
  Client Hello (cipher suites, TLS versions)
  ← Server Hello (chọn cipher, cert)
  Certificate Exchange
  Key Exchange (Diffie-Hellman)
  → Established shared secret

Tất cả data sau đó đều encrypted:
  ████████████████████ ← Không đọc được!
  ████████████████████
  ████████████████████
```

---

## MongoDB Wire Protocol

### Đặc điểm bảo mật MongoDB

```
MongoDB Atlas (cloud):
  ✅ Mặc định TLS (không thể tắt)
  ✅ Authentication: SCRAM (Salted Challenge Response)
  ✅ TLS 1.2/1.3
  ✅ Certificate pinning

SCRAM = Salted Challenge Response Authentication Mechanism:
  Client → SaslStart (authentication initiation)
  ← Server → Challenge
  Client → SaslContinue (response to challenge)
  ← Server → SaslContinue (server proof)
  Client → SaslContinue (client verification)
  ← Server → OK

→ 4 round-trips chỉ để authenticate!
→ Chi phí cao hơn PostgreSQL (1 round-trip)
→ Nhưng bảo mật hơn (mutual authentication)
```

### Kết nối MongoDB với SSL/TLS

```javascript
const { MongoClient } = require('mongodb');

const client = new MongoClient('mongodb://db.example.com:27017', {
    tls: true,
    tlsCAFile: '/path/to/ca-cert.pem',
    tlsCertificateKeyFile: '/path/to/client-cert.pem',
    // Mutual TLS: Server verify client certificate too!
    tlsCertificateKeyFilePassword: process.env.CERT_PASSWORD
});
```

---

## Giới hạn kích thước SQL Query

### Thực nghiệm với PostgreSQL

```
Test: Gửi query với nhiều điều kiện WHERE

1 KB query:     → OK ✅ (1 TCP segment)
125 KB query:   → OK ✅ (90 TCP segments)
1.3 MB query:   → OK ✅ (960 TCP segments)
14 MB query:    → Crash! ❌

→ PostgreSQL không có hard limit nhỏ,
  nhưng server memory sẽ là bottleneck
```

```
Hệ quả thực tế:
  - Câu query 14 MB có 1 triệu điều kiện WHERE
  - Gây 960+ TCP packets, retransmissions
  - Server overwhelmed → Crash
  
Best practice:
  ✅ Dùng IN clause với batch size hợp lý (100-1000)
  ✅ Dùng temporary table thay vì WHERE IN với list khổng lồ
  ✅ Dùng JOIN thay vì mega WHERE clause
  ❌ Không gửi query > 1 MB
```

```sql
-- Bad: 100,000 IDs trong WHERE IN
SELECT * FROM orders WHERE id IN (1, 2, 3, ..., 100000);

-- Better: Batch processing
-- Xử lý 1000 IDs mỗi lần

-- Best: JOIN với temp table
CREATE TEMP TABLE target_ids (id BIGINT);
INSERT INTO target_ids VALUES (1), (2), ..., (100000);
SELECT o.* FROM orders o JOIN target_ids t ON o.id = t.id;
DROP TABLE target_ids;
```

---

## Security Best Practices

```
1. TLS luôn được bật trong production
   → ssl = on trong postgresql.conf
   → sslmode=require hoặc verify-full trong client

2. TLS version tối thiểu 1.2
   ssl_min_protocol_version = 'TLSv1.2'
   
3. Strong ciphers
   ssl_ciphers = 'HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5'

4. Certificate rotation
   → Đặt reminder để renew cert trước khi expire
   → Let's Encrypt: 90 ngày, auto-renew

5. Error messages mơ hồ
   → Không để lộ thông tin như "user not found" vs "wrong password"
   → Luôn dùng: "Invalid credentials"
   
6. Không log password trong application logs
   → Dùng parameterized queries (không log values)
   → Mask sensitive data trong logs
```

---

**Tiếp theo:** 02-database-permissions-va-best-practices.md →

# Bài 2: Protocols, ports và firewall

Bài 1 giới thiệu khái niệm. Bài này đi sâu **protocols phổ biến** trong DevOps + firewall handling.

## HTTP / HTTPS

### HTTP request/response

```text
Request:
GET /api/users HTTP/1.1
Host: api.acme.com
User-Agent: curl/7.x
Accept: application/json
Authorization: Bearer xyz...

Response:
HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 1234
Server: nginx/1.x

{"users": [...]}
```

### HTTP methods

| Method | Use |
|---|---|
| **GET** | Lấy resource |
| **POST** | Tạo mới |
| **PUT** | Update toàn bộ |
| **PATCH** | Update một phần |
| **DELETE** | Xoá |
| **HEAD** | Như GET nhưng chỉ header |
| **OPTIONS** | CORS preflight |

### Status codes

| Range | Loại | Vd |
|---|---|---|
| 1xx | Informational | 100 Continue |
| 2xx | Success | 200 OK, 201 Created, 204 No Content |
| 3xx | Redirect | 301 Moved Permanently, 302 Found, 304 Not Modified |
| 4xx | Client error | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 429 Too Many Requests |
| 5xx | Server error | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout |

DevOps debug thường xuyên:
- **502** Bad Gateway → backend down hoặc unreachable.
- **504** Gateway Timeout → backend chậm vượt timeout.
- **503** Service Unavailable → overload hoặc maintenance.

### HTTPS = HTTP + TLS

TLS (Transport Layer Security) — successor của SSL — encrypt traffic.

```text
1. Client → Server: "Hello, TLS handshake?"
2. Server gửi certificate (chứa public key)
3. Client verify cert với CA → OK
4. Client + server agree shared session key (Diffie-Hellman)
5. Mọi data sau đó encrypted với session key
```

DevOps quan tâm:
- **Cert expiry** — set monitoring.
- **TLS version** — disable TLS 1.0/1.1 cũ.
- **Cipher suite** — disable weak.
- **HSTS header** — force HTTPS.

```bash
# Check TLS version + cert
openssl s_client -connect example.com:443 -servername example.com < /dev/null \
  | openssl x509 -noout -dates
```

## SSH (port 22)

Đã học phase 5. Bonus:

### SSH tunnel — port forward

```bash
# Local forward: localhost:8080 → remote:80 qua SSH
ssh -L 8080:internal-db:5432 user@bastion

# Reverse forward
ssh -R 9000:localhost:80 user@public-server

# SOCKS proxy
ssh -D 1080 user@server
# Cấu hình browser SOCKS5 localhost:1080
```

Use case:
- Truy cập DB internal qua bastion.
- VPN nhẹ không cần thiết bị.
- Expose dev server local cho người ngoài test.

### SSH config

```text
# ~/.ssh/config
Host bastion
    HostName bastion.acme.com
    User devops
    IdentityFile ~/.ssh/id_ed25519

Host db-internal
    HostName 10.0.10.5
    ProxyJump bastion
    User dbadmin
```

```bash
ssh db-internal
# Tự jump qua bastion → SSH thẳng vào DB
```

## DNS (port 53 — UDP + TCP)

### Cấu trúc query

```bash
# Manual query
dig @8.8.8.8 example.com A
# @8.8.8.8 = chỉ định resolver
# A = record type

# Trace từ root
dig +trace example.com

# Lấy nameserver authoritative
dig NS example.com
```

### `/etc/resolv.conf`

```text
nameserver 8.8.8.8        # Google DNS
nameserver 1.1.1.1        # Cloudflare
search acme.local         # Append domain khi resolve short name
```

### Local override `/etc/hosts`

```text
127.0.0.1   localhost
192.168.56.15  db01
```

Resolve check `/etc/hosts` **trước** DNS server.

### systemd-resolved

Modern Ubuntu/Fedora dùng systemd-resolved:

```bash
resolvectl status
resolvectl flush-caches      # Clear cache
```

## SMTP, IMAP, POP3 — email

| Protocol | Port | Mục đích |
|---|---|---|
| SMTP | 25 (server-server), 587 (submission) | Send |
| SMTPS | 465 | Send với TLS |
| IMAP | 143 | Đọc, sync giữ server |
| IMAPS | 993 | IMAP + TLS |
| POP3 | 110 | Đọc, download xoá server |
| POP3S | 995 | POP3 + TLS |

DevOps thường setup:
- App gửi mail qua SMTP (Postfix relay, SendGrid, AWS SES).
- Cron job alert qua email.

## DHCP — auto cấp IP

```text
1. Client (chưa có IP) broadcast: DHCP Discover
2. DHCP server reply: DHCP Offer (IP, lease, gateway, DNS)
3. Client request: DHCP Request
4. Server confirm: DHCP Ack
```

Home router là DHCP server cho LAN. AWS VPC tự cấp IP cho EC2 (via DHCP option set).

## ICMP — ping, traceroute

ICMP **không phải TCP/UDP** — layer 3 protocol riêng.

```bash
ping -c 4 8.8.8.8
# 4 packets sent, 4 received

# Đo MTU
ping -M do -s 1472 -c 1 8.8.8.8      # 1472 + 28 IP/ICMP header = 1500 MTU

# Block ping? → cloud firewall thường block ICMP. Ping fail không nghĩa server down.
```

## Firewall — `iptables`, `nftables`, `firewalld`, `ufw`

### Khái niệm

Firewall = filter packet vào/ra dựa rule. Mỗi packet đi qua chain:

```text
INPUT     ← Packet đích là máy này
OUTPUT    ← Packet gửi đi
FORWARD   ← Packet pass-through (router)
```

### iptables (low-level, legacy)

```bash
# List rule
iptables -L -n -v

# Allow SSH
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow HTTP
iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# Drop everything else
iptables -P INPUT DROP

# Save (Ubuntu)
iptables-save > /etc/iptables/rules.v4
```

iptables phức tạp. Modern thay bằng:

### firewalld (RHEL/CentOS modern)

```bash
# Zone-based (public, internal, dmz, ...)
firewall-cmd --get-zones
firewall-cmd --get-default-zone

# Add service permanent
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --permanent --add-port=8080/tcp

# Reload
firewall-cmd --reload

# List
firewall-cmd --list-all
```

### ufw (Ubuntu/Debian — easy)

```bash
ufw enable
ufw allow 22                   # SSH
ufw allow 80/tcp
ufw allow from 192.168.1.0/24 to any port 3306    # Subnet allow DB
ufw status verbose
ufw deny 23                    # Block telnet
ufw delete allow 80
```

ufw frontend → iptables backend. Easy to use.

### Cloud firewall

Cloud có **security group** thay vì firewall trên VM:

| Cloud | Tên |
|---|---|
| AWS | Security Group, NACL |
| GCP | Firewall Rule |
| Azure | Network Security Group (NSG) |

Lab production: **disable firewalld trong OS**, dùng cloud security group. Đơn giản + visible.

## Lệnh kiểm tra port

```bash
# Listening port
ss -tulnp                      # Modern
netstat -tulnp                 # Cũ

# Specific port
ss -tlnp | grep :80
lsof -i :80                    # Process nào nắm port

# Test remote port mở không
nc -zv example.com 443
# Connection to example.com 443 port [tcp/https] succeeded!

# Telnet (cũ nhưng dùng được)
telnet example.com 443

# nmap (scan, chỉ với authorization)
nmap -p 1-1000 example.com
```

## DevOps protocol patterns

### Reverse proxy chain

```text
User → CloudFront/Cloudflare (CDN)
     → ALB/nginx (Load Balancer)
     → App server (Tomcat/Node)
     → Database
```

Mỗi hop = 1 protocol/handshake. Debug 502 → check từng hop.

### Health check

LB check backend alive bằng HTTP probe:

```bash
curl -f http://app:8080/health
```

Endpoint `/health` trả 200 nếu OK, 503 nếu degraded. Backend kubernetes liveness/readiness probe cùng pattern.

### Heartbeat / keepalive

Connection idle quá lâu → router NAT timeout → connection chết. Set keepalive:

```bash
# TCP keepalive (Linux)
sysctl -w net.ipv4.tcp_keepalive_time=60
sysctl -w net.ipv4.tcp_keepalive_intvl=10
sysctl -w net.ipv4.tcp_keepalive_probes=6
```

App level: HTTP/2, gRPC, WebSocket có keepalive riêng.

## TLS troubleshooting

```bash
# Test connection
openssl s_client -connect host:443 -servername host

# Show cert chain
openssl s_client -showcerts -connect host:443

# Check expiry
echo | openssl s_client -connect host:443 -servername host 2>/dev/null | \
  openssl x509 -noout -dates

# Verify cert + chain valid
openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt server.crt

# Force TLS version
curl --tlsv1.2 https://host
curl --tlsv1.3 https://host
```

Online: [ssllabs.com/ssltest](https://www.ssllabs.com/ssltest/) — grade cert + cipher.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Port mở local nhưng firewall block | Connect timeout | Check `firewall-cmd --list-all` |
| DNS cache stale | Update không thấy | `resolvectl flush-caches` hoặc `systemctl restart systemd-resolved` |
| Cert expire | Browser warning, app fail | Monitor expiry với Prometheus, auto-renew Let's Encrypt |
| MTU mismatch | Random packet drop | `ping -M do -s 1472` test |
| TIME_WAIT đầy | Không kết nối được | Tune `tcp_tw_reuse` |
| Connection limit | "Too many open files" | Tăng `ulimit -n` |
| Wrong default gateway | No internet | `ip r` check, fix route |
| IPv6 cố gắng kết nối trước IPv4 | Slow | Disable IPv6 hoặc fix DNS |

## Quick reference

```text
# Inspect
ip a / ip r / ip n           Interface, route, ARP
ss -tulnp                    Listening
ss -tnp                      TCP connections
nc -zv HOST PORT             Test port
curl -v URL                  HTTP verbose

# DNS
dig DOMAIN                   Query
dig DOMAIN MX                Mail records
dig +trace DOMAIN            From root
nslookup DOMAIN              Legacy
resolvectl status            systemd-resolved

# TLS
openssl s_client -connect HOST:443
openssl x509 -in CERT -text -noout

# Firewall
ufw status                   Ubuntu
firewall-cmd --list-all      RHEL
iptables -L -n -v            Low-level

# Trace
ping HOST
traceroute HOST
mtr HOST
tcpdump -i eth0 host HOST
```

## Tóm tắt bài 2

- **HTTP**: GET/POST/PUT/DELETE; status 2xx success, 4xx client, 5xx server.
- **HTTPS** = HTTP + TLS; cert có expiry, cần monitor.
- **SSH** + tunnel = SOCKS/port-forward thay VPN nhẹ.
- **DNS** record types: A, CNAME, MX, TXT, NS; cache + `/etc/hosts` override.
- **DHCP** auto-cấp IP qua broadcast.
- **Firewall**: iptables (low), firewalld (RHEL), ufw (Ubuntu), cloud security group.
- **`nc -zv HOST PORT`** = vũ khí test port nhanh nhất.

**Bài kế tiếp** → [Bài 3: Networking commands và troubleshooting](03-networking-commands.md)

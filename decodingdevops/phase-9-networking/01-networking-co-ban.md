# Bài 1: Networking cơ bản — OSI model, TCP/IP, IP address

DevOps engineer **không thể tránh networking**. Debug "tại sao app không kết nối DB?", "vì sao load balancer trả 502?", "firewall block port nào?" — đều cần hiểu network.

## OSI 7-layer model

Mô hình lý thuyết chia network thành 7 tầng:

```text
Layer 7: Application       ← HTTP, HTTPS, FTP, SSH, DNS, SMTP
Layer 6: Presentation      ← TLS, encryption, format
Layer 5: Session           ← Connection management
Layer 4: Transport         ← TCP, UDP (port number)
Layer 3: Network           ← IP, ICMP (IP address, routing)
Layer 2: Data Link         ← Ethernet, Wi-Fi, ARP (MAC address)
Layer 1: Physical          ← Cable, radio, optical
```

Mnemonic: **A**ll **P**eople **S**eem **T**o **N**eed **D**ata **P**rocessing.

Thực tế dùng **TCP/IP 4-layer model** đơn giản hơn:

```text
Application    (gộp 7+6+5)
Transport      (4)
Internet       (3)
Link           (2+1)
```

## Vì sao quan trọng cho DevOps

| Layer | Vấn đề DevOps gặp |
|---|---|
| L7 (App) | nginx config, HTTP header, certificate, DNS query |
| L4 (TCP/UDP) | Port mở, firewall rule, load balancer |
| L3 (IP) | Routing, subnet, NAT, VPN |
| L2 (MAC) | VLAN, ARP table, hardware NIC |

Mỗi vấn đề thuộc 1 layer. Debug = xác định layer nào sai.

## IP Address

**IP** = địa chỉ unique trên network. 2 version:

### IPv4

`192.168.1.10` — 4 số (octet), mỗi số 0-255 → 32-bit.

Total IPv4: 2^32 ≈ 4.3 tỷ → **đã cạn**.

### IPv6

`2001:0db8:85a3:0000:0000:8a2e:0370:7334` — 8 nhóm hex, mỗi 16-bit → 128-bit.

Total IPv6: 2^128 ≈ vô hạn cho thực tiễn.

DevOps chủ yếu gặp IPv4. IPv6 đang dần phổ biến (cloud, mobile).

## IP class và private range

```text
Class A: 0.0.0.0     - 127.255.255.255   (8 bit network, 24 bit host)
Class B: 128.0.0.0   - 191.255.255.255   (16 bit network, 16 bit host)
Class C: 192.0.0.0   - 223.255.255.255   (24 bit network, 8 bit host)
Class D: 224.0.0.0   - 239.255.255.255   (multicast)
Class E: 240.0.0.0   - 255.255.255.255   (reserved)
```

### Private IP — không routable trên internet

```text
10.0.0.0/8         (10.0.0.0   - 10.255.255.255)        — Class A private
172.16.0.0/12      (172.16.0.0 - 172.31.255.255)        — Class B private
192.168.0.0/16     (192.168.0.0 - 192.168.255.255)      — Class C private
```

Home router thường cấp IP `192.168.x.x`. Lab Vagrant ta dùng `192.168.56.x`.

Cloud (AWS VPC, GCP, Azure) thường dùng `10.x.x.x` cho subnet lớn.

### Special IP

| IP | Ý nghĩa |
|---|---|
| `0.0.0.0` | Mọi địa chỉ / default route |
| `127.0.0.1` | Loopback (localhost) — chính máy mình |
| `255.255.255.255` | Broadcast — gửi mọi host trong subnet |
| `169.254.x.x` | APIPA / link-local — DHCP fail |

## Subnet và CIDR

CIDR (Classless Inter-Domain Routing): `IP/prefix`.

```text
192.168.1.0/24
            │
            └ 24 bit network → 8 bit host → 256 IP (254 usable)
```

### Bảng nhanh

| CIDR | Mask | Số IP | Host usable |
|---|---|---|---|
| /32 | 255.255.255.255 | 1 | 1 (single IP) |
| /30 | 255.255.255.252 | 4 | 2 |
| /29 | 255.255.255.248 | 8 | 6 |
| /28 | 255.255.255.240 | 16 | 14 |
| /27 | 255.255.255.224 | 32 | 30 |
| /26 | 255.255.255.192 | 64 | 62 |
| /25 | 255.255.255.128 | 128 | 126 |
| /24 | 255.255.255.0 | 256 | 254 |
| /16 | 255.255.0.0 | 65536 | 65534 |
| /8 | 255.0.0.0 | 16M | 16M-2 |

Usable = total - 2 (network + broadcast address).

### Tính nhanh — `ipcalc`

```bash
sudo apt install -y ipcalc
ipcalc 192.168.1.0/24
# Network:   192.168.1.0/24
# HostMin:   192.168.1.1
# HostMax:   192.168.1.254
# Broadcast: 192.168.1.255
# Hosts/Net: 254
```

## Subnet trong AWS VPC

VPC mặc định AWS: `172.31.0.0/16` (~65k IP).

Chia subnet:

```text
VPC: 10.0.0.0/16  (65536 IP)
├── Public subnet AZ-a:    10.0.1.0/24   (256 IP)
├── Public subnet AZ-b:    10.0.2.0/24
├── Private subnet AZ-a:   10.0.10.0/24
├── Private subnet AZ-b:   10.0.20.0/24
└── DB subnet:             10.0.100.0/24
```

Pattern này sẽ thấy ở section 13.

## MAC address — layer 2

**MAC** = unique hardware ID của NIC. Format 48-bit hex: `00:1A:2B:3C:4D:5E`.

```bash
# Linux
ip link show
# 2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> ...
#     link/ether 00:1a:2b:3c:4d:5e

# macOS
ifconfig en0 | grep ether

# Windows
ipconfig /all
```

DevOps ít dùng MAC trực tiếp. Quan trọng cho:
- DHCP reservation (cấp IP cố định theo MAC).
- ARP attack detection.
- VM bridged network mapping.

## TCP vs UDP

Cả 2 ở layer 4 (transport). Khác:

| | TCP | UDP |
|---|---|---|
| Connection | ✓ (handshake) | ✗ (connectionless) |
| Reliable | ✓ (retry, ordered) | ✗ |
| Speed | Chậm hơn | Nhanh hơn |
| Header size | 20-60 byte | 8 byte |
| Use case | HTTP, SSH, DB | DNS, video stream, VoIP |
| Port | 0-65535 | 0-65535 |

### TCP 3-way handshake

```text
Client                     Server
  │                          │
  │ ──── SYN ──────────────► │
  │                          │
  │ ◄── SYN-ACK ──────────── │
  │                          │
  │ ──── ACK ──────────────► │
  │                          │
  │ (connection established) │
  │                          │
  │ ──── data ──────────────►│
  │ ◄── ack ──────────────── │
```

DevOps debug: `tcpdump` hoặc `tshark` để xem handshake fail ở bước nào.

## Port number

Mỗi service trên 1 port (0-65535):

| Port | Protocol | Service |
|---|---|---|
| 22 | TCP | SSH |
| 25 | TCP | SMTP (email send) |
| 53 | UDP/TCP | DNS |
| 80 | TCP | HTTP |
| 110 | TCP | POP3 (email read) |
| 143 | TCP | IMAP |
| 443 | TCP | HTTPS |
| 465 | TCP | SMTPS |
| 587 | TCP | SMTP (submission) |
| 993 | TCP | IMAPS |
| 995 | TCP | POP3S |
| 3306 | TCP | MySQL |
| 5432 | TCP | PostgreSQL |
| 6379 | TCP | Redis |
| 8080 | TCP | HTTP alt (Tomcat default) |
| 9000 | TCP | PHP-FPM, SonarQube |
| 5672 | TCP | RabbitMQ AMQP |
| 11211 | TCP | Memcached |

Port ranges:
- **0-1023**: Well-known (cần root để bind).
- **1024-49151**: Registered.
- **49152-65535**: Ephemeral (client-side, dynamic).

## Default gateway và routing

```text
Máy bạn (192.168.1.10) cần gửi đến 8.8.8.8

1. Check routing table:
   192.168.1.0/24 → local interface eth0
   0.0.0.0/0 (default) → 192.168.1.1 (gateway)

2. Đích 8.8.8.8 không trong subnet local → gửi đến gateway.

3. Gateway (router) check routing table của nó → forward tiếp.

4. Hops nhiều lần → tới đích.
```

```bash
# Xem routing table
ip r
# default via 192.168.1.1 dev eth0
# 192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.10

# Trace path
traceroute 8.8.8.8
# 1   192.168.1.1 (1ms)
# 2   10.x.x.x (5ms)        ← ISP
# 3   ...
# 8   8.8.8.8 (15ms)
```

## NAT — Network Address Translation

Nhiều máy nội bộ chia sẻ 1 IP public.

```text
LAN máy bạn:
192.168.1.10  ─┐
192.168.1.11  ─┼── Router (NAT) ── 203.0.113.5 ─── Internet
192.168.1.12  ─┘     (1 IP public)
```

Khi máy `192.168.1.10` gửi request:
- Router thay source IP → `203.0.113.5`.
- Lưu mapping (10:port-A → 113.5:port-B).
- Response về → router map ngược → forward đúng máy.

Đây là vì sao **đa số IP nhà** đều giống nhau — đều là LAN sau NAT.

## DNS — name → IP

```text
1. Bạn gõ google.com vào browser.
2. Browser hỏi /etc/hosts trước (cache local).
3. Nếu không → hỏi DNS resolver (vd 8.8.8.8 Google).
4. Resolver hỏi root server → .com TLD server → ns.google.com authoritative.
5. Trả về IP: 142.250.179.78.
6. Browser TCP connect 142.250.179.78:443.
```

```bash
# Query DNS
dig google.com
# A record (IPv4)

dig google.com AAAA
# AAAA record (IPv6)

dig google.com MX
# Mail servers

dig google.com NS
# Authoritative nameserver

# Reverse: IP → name
dig -x 142.250.179.78
```

DNS record types:

| Type | Mục đích |
|---|---|
| **A** | Name → IPv4 |
| **AAAA** | Name → IPv6 |
| **CNAME** | Alias name → name |
| **MX** | Mail server |
| **TXT** | Free text (SPF, DKIM, verification) |
| **NS** | Nameserver |
| **PTR** | Reverse: IP → name |
| **SOA** | Start of authority |

## Bẫy thường gặp với network

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Subnet overlap | Routing conflict | Plan IP range trước |
| Quên `/etc/hosts` | App resolve fail | `getent hosts` test |
| DNS cache | Update không reflect | `systemd-resolve --flush-caches` |
| Default gateway sai | Không ra internet | `ip r` check, fix `/etc/network/` |
| Port chưa mở firewall | Connection refused | `nc -zv` test, fix firewall |
| MTU mismatch | Packet drop random | `ping -M do -s 1472` test |
| TCP keepalive timeout | Connection idle die | Tune `tcp_keepalive_*` sysctl |

## Tools nhanh check network

```bash
ip a                    # IP của interface
ip r                    # Routing table
ip n                    # ARP table (neighbor)
ss -tulnp               # Listening ports
ss -tnp                 # TCP connections
ping HOST               # ICMP test
traceroute HOST         # Hops
mtr HOST                # traceroute + ping liên tục
dig DOMAIN              # DNS query
nslookup DOMAIN         # DNS query (legacy)
nc -zv HOST PORT        # Test TCP port
curl -v URL             # HTTP verbose
tcpdump -i eth0         # Packet capture
nmap -p 1-1000 HOST     # Port scan (chỉ với authorization)
```

## Tóm tắt bài 1

- **OSI 7 layer** (lý thuyết) ≈ TCP/IP 4 layer (thực tế).
- **IPv4** 4 octet, IPv6 8 hex group. IPv4 cạn → cloud dùng nhiều IPv6.
- **Private IP**: 10.x, 172.16-31.x, 192.168.x. Không routable internet.
- **CIDR** `/N`: N bit network. `/24` = 256 IP, `/16` = 65K.
- **TCP** reliable (HTTP, SSH, DB) vs **UDP** fast (DNS, video).
- **Port 0-1023** privileged, **1024+** unprivileged.
- **NAT** chia sẻ 1 IP public cho nhiều LAN host.
- **DNS** name → IP, records: A, AAAA, CNAME, MX, TXT, NS, PTR.

**Bài kế tiếp** → [Bài 2: Protocols, ports, firewall](02-protocols-ports.md)

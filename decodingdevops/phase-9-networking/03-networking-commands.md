# Bài 3: Networking commands và troubleshooting

Bài cuối phase networking. Tổng hợp **toolkit** debug network DevOps engineer dùng hằng ngày.

## Pattern troubleshoot — top-down

Khi app không kết nối, đi từ application layer xuống:

```text
1. Application: "App throw exception gì?"
2. DNS: Resolve hostname OK?            → dig
3. Network: Reach được host không?      → ping, traceroute
4. Transport: Port có mở không?         → nc, ss
5. Service: Backend chạy không?         → curl, telnet
6. Firewall: Có rule block không?       → iptables/firewalld/ufw
```

Xác định layer fail → fix.

## ip — Swiss army knife

```bash
ip a                          # Show all interfaces
ip a show eth0                # Specific interface

ip link                       # Link layer info
ip link set eth0 up           # Up interface
ip link set eth0 down

ip r                          # Routing table
ip r add 10.0.0.0/24 via 192.168.1.1
ip r del 10.0.0.0/24

ip n                          # ARP / neighbor table
ip n flush all                # Clear ARP cache

# IPv6
ip -6 a
ip -6 r
```

`ip` thay `ifconfig`, `route` legacy.

## Test connectivity — `ping`, `traceroute`, `mtr`

```bash
ping -c 4 8.8.8.8             # 4 packet ICMP
ping -i 0.2 -c 100 host       # 100 packets, 200ms apart
ping -s 1472 -M do host       # Test MTU 1500

traceroute google.com         # Hops to dest
traceroute -T -p 443 host     # TCP traceroute thay ICMP (qua firewall)

mtr google.com                # Real-time traceroute + stats
mtr -r -c 100 google.com      # Report mode
```

**`mtr` là tool debug network # 1**: combine ping + traceroute, real-time, show packet loss mỗi hop.

## Port test — `nc`, `telnet`, `ss`

```bash
# Test port remote
nc -zv host port              # Zero-I/O scan + verbose
nc -zv example.com 443
# Connection to example.com 443 port [tcp/https] succeeded!

# Test multiple ports
nc -zv host 22 80 443

# Test UDP
nc -uvz host port

# Telnet (cũ, dùng được)
telnet host 443

# Local listening port
ss -tulnp                     # TCP + UDP + Listen + Numeric + Process
ss -tnp                       # TCP connection (established)
ss -tlnp                      # TCP listening only
ss state established '( dport = :443 or sport = :443 )'

# Specific port
ss -tlnp '( sport = :80 )'
lsof -i :80                   # Process nắm port
fuser 80/tcp                  # Tương tự lsof
```

## HTTP debug — `curl`, `wget`, `httpie`

```bash
# Basic
curl https://example.com
curl -I https://example.com           # Header only
curl -v https://example.com           # Verbose (TLS, header, body)
curl -L https://bit.ly/short          # Follow redirect

# Methods
curl -X POST https://api.acme.com/users -d '{"name":"a"}' \
     -H "Content-Type: application/json"

curl -X PUT https://api.acme.com/users/1 -d '{"name":"b"}'

# Auth
curl -u user:pass https://...
curl -H "Authorization: Bearer xyz" https://...

# Save response
curl -o file.json https://api.acme.com/data

# Show timing
curl -w "@-" -o /dev/null -s https://example.com <<'EOF'
       time_namelookup:  %{time_namelookup}s
          time_connect:  %{time_connect}s
       time_appconnect:  %{time_appconnect}s
      time_pretransfer:  %{time_pretransfer}s
         time_redirect:  %{time_redirect}s
    time_starttransfer:  %{time_starttransfer}s
                       ----------
            time_total:  %{time_total}s
EOF
```

Output:

```text
       time_namelookup:  0.012s          ← DNS
          time_connect:  0.034s          ← TCP
       time_appconnect:  0.123s          ← TLS
      time_pretransfer:  0.124s
    time_starttransfer:  0.245s          ← TTFB
            time_total:  0.398s
```

Đây là tool **phân tích performance per-stage**.

### httpie — alternative đẹp hơn

```bash
sudo apt install -y httpie

http https://example.com                              # GET
http POST api.acme.com/users name=alice               # POST JSON
http --auth user:pass api.acme.com
http --headers https://...                            # Header only
```

## DNS debug — `dig`, `host`, `nslookup`

```bash
# dig (best)
dig example.com                  # A record default
dig example.com A
dig example.com AAAA            # IPv6
dig example.com MX
dig example.com TXT
dig example.com NS

dig @8.8.8.8 example.com        # Query specific resolver
dig +short example.com           # Concise output
dig +trace example.com           # From root server

# Reverse lookup
dig -x 142.250.179.78

# host (simpler)
host example.com
host -t MX example.com

# nslookup (legacy)
nslookup example.com
```

### DNS troubleshoot pattern

```bash
# 1. Resolve qua /etc/hosts?
getent hosts example.com

# 2. Resolve qua DNS?
dig example.com

# 3. Resolve qua server cụ thể?
dig @8.8.8.8 example.com

# 4. Authoritative trả gì?
dig +trace example.com
```

Nếu manual query OK nhưng app fail → check `/etc/resolv.conf`, systemd-resolved, DNS cache.

## Packet capture — `tcpdump`, `wireshark`

```bash
# Capture mọi packet trên eth0
sudo tcpdump -i eth0

# Filter
sudo tcpdump -i eth0 host 8.8.8.8
sudo tcpdump -i eth0 port 443
sudo tcpdump -i eth0 'tcp port 80 and host example.com'
sudo tcpdump -i eth0 'src 192.168.1.10 and dst port 22'

# Save vào file (analyze offline với Wireshark)
sudo tcpdump -i eth0 -w capture.pcap port 80
# Stop: Ctrl+C

# Đọc lại
tcpdump -r capture.pcap

# Verbose
sudo tcpdump -i eth0 -A -s 0 port 80     # ASCII content
sudo tcpdump -i eth0 -X -s 0 port 80     # Hex + ASCII

# Count packets
sudo tcpdump -i eth0 -c 100              # Stop sau 100 packets
```

Đọc output:

```text
14:32:15.123  IP 192.168.1.10.45678 > 8.8.8.8.443: Flags [S], seq 12345, win 65535
14:32:15.145  IP 8.8.8.8.443 > 192.168.1.10.45678: Flags [S.], seq 67890, ack 12346
14:32:15.146  IP 192.168.1.10.45678 > 8.8.8.8.443: Flags [.], ack 67891
```

Đây là **TCP 3-way handshake** raw. Nếu chỉ thấy `[S]` mà không có `[S.]` → server không reply → firewall block.

Wireshark = GUI cho tcpdump — phân tích PCAP file dễ hơn.

## Network performance — `iperf3`, `nethogs`

```bash
# Throughput test
# Server side:
iperf3 -s

# Client side (test bandwidth):
iperf3 -c server-ip
iperf3 -c server-ip -t 30 -P 4         # 30s, 4 parallel streams
iperf3 -c server-ip -u                  # UDP

# Bandwidth per process
sudo nethogs
sudo nethogs eth0

# Stats
sudo iftop -i eth0                      # Real-time bandwidth per connection
vnstat -d                               # Daily stats
```

## Latency và packet loss

```bash
# Sustained ping
ping -i 0.5 -c 1000 host | tail -5
# rtt min/avg/max/mdev = 1.2/3.5/15.0/2.1 ms
# packet loss = 0%

# mtr cho real-time
mtr -r -c 100 google.com

# Lost packet network = bottleneck. Lost packet đầu cuối = app issue.
```

## DevOps troubleshoot scenarios

### "App không connect DB"

```bash
# Trên app server
ping db01                                    # Layer 3 OK?
nc -zv db01 3306                             # Layer 4 port mở?
mysql -h db01 -u user -p -e "SELECT 1;"      # Layer 7 auth + query?
```

3 step → biết layer nào fail.

### "Browser load chậm"

```bash
curl -w "@-" -o /dev/null -s https://example.com <<'EOF'
time_namelookup: %{time_namelookup}s
time_connect: %{time_connect}s
time_appconnect: %{time_appconnect}s
time_starttransfer: %{time_starttransfer}s
time_total: %{time_total}s
EOF

# DNS chậm? → check resolver, cache
# Connect chậm? → traceroute network hop
# TTFB chậm? → backend slow, check app log
```

### "Một số request fail random"

```bash
# Packet loss?
mtr -r -c 100 host
# Nếu loss > 0% → mạng có vấn đề

# Connection limit?
ss -s
# TCP: 1234 (estab 800, closed 400, ...)

# File descriptor limit?
ulimit -n
# 1024 ← Có thể không đủ
```

### "Server respond 502 Bad Gateway"

```bash
# Backend down?
systemctl status app
ss -tlnp | grep :8080                       # App listen không?

# Backend timeout?
curl -m 5 http://app:8080/                  # 5s timeout test

# nginx error log
tail -f /var/log/nginx/error.log
```

## Network configuration files

### Ubuntu — netplan

`/etc/netplan/01-netcfg.yaml`:

```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      dhcp4: false
      addresses:
        - 192.168.1.10/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
```

Apply: `sudo netplan apply`.

### RHEL/CentOS — NetworkManager

```bash
# CLI
nmcli con show
nmcli con add type ethernet con-name static ifname eth0 \
      ip4 192.168.1.10/24 gw4 192.168.1.1
nmcli con mod static ipv4.dns 8.8.8.8
nmcli con up static
```

Hoặc edit `/etc/sysconfig/network-scripts/ifcfg-eth0` (legacy).

## Cloud network — Security Group + NACL

Quick mental model:

| | Security Group | NACL |
|---|---|---|
| Level | Instance | Subnet |
| Stateful | ✓ | ✗ |
| Rule | Allow only | Allow + deny |
| Order | All eval | Numbered |
| Where | EC2, RDS, ELB | VPC subnet |

Bug debug AWS: thường là security group sai. Check inbound rule có allow source IP/SG.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| ICMP block, ping fail | Nghĩ server down | Dùng `nc -zv` thay |
| DNS cache | Update không thấy | Flush cache |
| `iptables` rule lưu chưa | Reboot mất rule | `iptables-save` + systemd |
| ARP table stale | Reach IP cũ máy đã đổi MAC | `ip n flush all` |
| MTU 1500 nhưng path 1400 | Random drop | Test với `ping -M do -s` |
| Keepalive default 7200s | Connection timeout | Tune sysctl |
| IPv6 disabled một bên | Slow vì retry | Disable nhất quán hoặc fix |
| Multiple default gateway | Routing inconsistent | Chỉ 1 default route |

## Tổng kết phase 9

3 bài đã cover:
1. Networking cơ bản — OSI, IP, subnet, CIDR.
2. Protocols + ports + firewall.
3. Commands + troubleshooting toolkit.

Kỹ năng đạt: hiểu khi app fail kết nối là layer nào, dùng tool nào debug, fix ở đâu.

## Quick reference toolkit

```text
# Layer 3 (IP, route)
ip a / ip r / ip n
ping HOST
traceroute HOST
mtr HOST

# Layer 4 (port)
ss -tulnp
nc -zv HOST PORT
lsof -i :PORT

# Layer 7
curl -v URL
curl -w "@-" timing-format URL
dig DOMAIN

# Capture
tcpdump -i eth0 port 80
wireshark capture.pcap

# Performance
iperf3 -s / -c HOST
nethogs
iftop

# Firewall
ufw status / iptables -L / firewall-cmd --list-all

# Network config
netplan apply (Ubuntu)
nmcli (RHEL)
```

## Tóm tắt bài 3

- Pattern troubleshoot: app → DNS → IP → port → service → firewall.
- **`mtr`** = tool debug network # 1.
- **`nc -zv HOST PORT`** = test port nhanh nhất.
- **`curl -w "@-"`** = timing per-stage (DNS, TCP, TLS, TTFB).
- **`tcpdump`** capture packet raw, **Wireshark** analyze.
- **`dig`** for DNS, **`ss`** for socket stat.
- Network config: netplan (Ubuntu), NetworkManager (RHEL), `/etc/network/interfaces` (legacy).
- Cloud: security group instance level, NACL subnet level.

**Phase kế tiếp** → [Phase 10 — Bài 1: Containers introduction](../phase-10-containers/01-containers-la-gi.md)

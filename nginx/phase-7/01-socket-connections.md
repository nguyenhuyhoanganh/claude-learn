# Bài 1: Socket connections — đào sâu kernel data structures

Bài bonus đi xuống tầng OS. Hiểu cách kernel quản lý socket, connection queue, file descriptor là chìa khoá để debug "NGINX hoạt động mà client connect không được" hoặc "accept queue full" — những bug mà 90% engineer không hiểu vì không học sâu networking stack.

Đây là phần ít liên quan NGINX trực tiếp, nhưng cực kỳ giá trị cho backend engineer.

## Socket — là gì thực ra?

Trong Linux, **socket** là một **struct trong kernel**, được expose ra user space như **file descriptor** (số nguyên).

```text
   Application (user space)
   ├── fd = 3  → socket struct trong kernel
   ├── fd = 4  → file đĩa
   └── fd = 5  → pipe
   
   Kernel
   └── struct sock { ... }   ← thực chất là data structure phức tạp
```

> "Trong Linux, tất cả là file" — kể cả socket. `read(fd, buf, size)` work với cả file đĩa và socket.

## Listening socket vs connection socket

Có **2 loại** socket khác nhau:

### Listening socket

Tạo bằng `socket() + bind() + listen()`. Là socket "sẵn sàng chấp nhận connection":

```c
int srv = socket(AF_INET, SOCK_STREAM, 0);
struct sockaddr_in addr = { .sin_family = AF_INET, .sin_port = htons(80), .sin_addr.s_addr = INADDR_ANY };
bind(srv, (struct sockaddr*)&addr, sizeof(addr));
listen(srv, 128);     // backlog = 128
```

Listening socket có:
- IP + port nó listen.
- Backlog queue (sẽ giải thích).
- **Không có** source/destination concrete — chỉ chờ.

### Connection socket

Tạo bằng `accept()` — đại diện cho 1 client cụ thể đã connect:

```c
int conn = accept(srv, ...);    // blocking cho đến khi có client
// conn là fd mới, đại diện cho connection
```

Connection socket có:
- IP + port server (= của listening).
- IP + port client (concrete).
- Send queue + receive queue cho data.

## Kernel queue — SYN queue + Accept queue

Khi `listen()`, kernel cấp 2 queue:

```text
   Client 1 ──SYN──►  ┌─────────────┐
                      │  SYN Queue   │   (incomplete handshakes)
                      └─────────────┘
                            │
                       (sau ACK cuối)
                            ▼
                      ┌─────────────┐
                      │ Accept Queue │   (completed, chờ accept)
                      └─────────────┘
                            ▲
                     (app `accept()` lấy ra)
```

### SYN queue

Connection đang ở giữa 3-way handshake:
1. Client gửi SYN → kernel **đưa entry vào SYN queue**.
2. Kernel gửi SYN-ACK về client.
3. Chờ ACK cuối từ client.

Khi ACK đến:
- Match với entry trong SYN queue.
- **Chuyển entry sang Accept queue**.

Size SYN queue = `net.ipv4.tcp_max_syn_backlog`.

### Accept queue

Connection đã handshake xong, **chờ application accept**.

Size = min(`listen(backlog)`, `net.core.somaxconn`).

→ Nếu app accept chậm hoặc treo, Accept queue **đầy** → kernel **drop SYN mới** → client thấy "Connection refused" hoặc timeout.

## Animation step-by-step

```text
   Client                   Kernel                   App (NGINX)
                                                      │ listen(srv, 128)
                                                      │
                            [SYN Q: 0]               │
                            [ACC Q: 0]               │
                                                      │
   SYN ────────────────────►│                          │
                            [SYN Q: 1]               │
   ◄────────── SYN-ACK ──── │                          │
                                                      │
   ACK ────────────────────►│                          │
                            [SYN Q: 0]               │
                            [ACC Q: 1]  ← handshake done│
                                                      │
                                                      │ accept(srv) → conn fd
                            [ACC Q: 0]               │
                                                      │ read(conn, ...)
                                                      │ ...
```

## ulimit & file descriptor

Mỗi connection = 1 fd. ulimit kernel default thường 1024 → max 1024 connection / process.

```bash
ulimit -n          # current limit
# 1024

ulimit -n 65535    # tune (cần root cho hard limit cao hơn)
```

Production NGINX **luôn tune lên 65535+**:

```bash
# /etc/security/limits.conf
nginx soft nofile 65535
nginx hard nofile 65535

# Kernel
echo 200000 > /proc/sys/fs/file-max
```

## Listen on `0.0.0.0` — security trap

`bind(0.0.0.0, port)` = listen trên **mọi interface** của host.

```text
   Server có 3 NIC:
   - eth0: 10.0.0.5 (private LAN)
   - eth1: 192.168.1.5 (corporate)
   - eth2: 203.0.113.5 (public internet!)
   
   listen(0.0.0.0:6379) = listen cả 3 interface
   → Redis accidentally phơi public!
```

Đây là **lý do MongoDB / Elasticsearch / Redis bị hack hàng triệu lần** — default config listen `0.0.0.0`.

**Best practice**:
```text
listen(127.0.0.1:6379)        # chỉ localhost
listen(10.0.0.5:6379)         # chỉ private NIC
listen(0.0.0.0:443)           # public, đã hardened TLS + auth
```

NGINX có `listen 80;` ngầm listen `0.0.0.0:80`. Có thể tường minh `listen 10.0.0.5:80;`.

## Connection queue full — symptom debug

```bash
# Xem trạng thái listen queue
ss -lnt sport = 80
# State  Recv-Q  Send-Q  Local Address:Port  Peer Address:Port
# LISTEN 0       128     0.0.0.0:80          0.0.0.0:*
#        ↑       ↑
#        |       Send-Q = backlog max
#        Recv-Q = số connection đang chờ accept

# Nếu Recv-Q gần Send-Q → accept queue đầy

# Đếm drop
nstat -az | grep -E "ListenDrops|ListenOverflows"
# TcpExtListenDrops               1234        ← syn drop (queue full)
# TcpExtListenOverflows           567         ← accept queue overflow
```

→ Drop > 0 = bug. Tăng `backlog`, `somaxconn`, hoặc accept nhanh hơn.

## SO_REUSEPORT — kernel-level LB giữa worker

NGINX hiện đại bật `reuseport`:

```nginx
server {
    listen 80 reuseport;
}
```

Mỗi worker có **listening socket riêng** cùng port 80. Kernel **load balance connection mới** giữa các listening socket → mỗi worker accept queue riêng → giảm contention.

```text
   Không reuseport:
   1 listening socket → shared accept queue → worker 1, 2, 3, 4 fight nhau accept
   → mutex contention, một worker overloaded có thể block others
   
   Reuseport:
   Worker 1: listening socket A → accept queue A
   Worker 2: listening socket B → accept queue B  ← kernel chia connection đều
   Worker 3: listening socket C → accept queue C
   Worker 4: listening socket D → accept queue D
   → mỗi worker không cạnh tranh
```

→ Throughput tăng 10-30% cho workload accept-heavy. **Khuyến nghị bật**.

## Socket sharding — `SO_REUSEPORT` bug lịch sử

Khi mới ra đời (Linux 3.9), `SO_REUSEPORT` có bug: connection imbalance khi socket được tạo/destroy. Vd worker 4 mới start → kernel có thể "thiên vị" worker 4, đẩy hết traffic về đó.

Đã fix ở các version kernel sau (~3.16+). Tuy nhiên đây là một bài học: **kernel feature mới = đợi vài năm trước khi dùng production**.

## Forking — file descriptor inherit

Khi `fork()`, child process **kế thừa toàn bộ fd** của parent:

```text
Parent:
   fd 3 → socket S (listening)
fork() → Child:
   fd 3 → cùng socket S (kế thừa, copy-on-write)
```

Đây là cách **NGINX worker** được tạo: master `fork()` ra worker, worker inherit listening socket → worker `accept()` được luôn.

```text
   Master              Worker 1            Worker 2
   ├── fd 3 → S        ├── fd 3 → S        ├── fd 3 → S
   │   (sau fork,      │   accept conn     │   accept conn
   │   không accept)   │   từ S            │   từ S
```

→ Tất cả worker share listening socket → cùng accept connection từ kernel queue.

## Khi accept() blocks

`accept(fd)` trên blocking socket = đợi đến khi có connection trong accept queue.

```c
while (1) {
    int conn = accept(srv, NULL, NULL);   // block!
    handle(conn);
}
```

Single-thread → blocked = không xử lý gì khác. NGINX dùng **non-blocking + epoll**:

```c
fcntl(srv, F_SETFL, O_NONBLOCK);    // non-blocking

while (1) {
    epoll_wait(epfd, ...);            // wait for event
    int conn = accept(srv, NULL, NULL);  // không block, có hoặc -1 EAGAIN
    // ...
}
```

→ Worker đa nhiệm: accept nhanh, đồng thời xử lý các connection đang có. Đây là event-driven model.

## Recap — listen() đến receive request

Tóm tắt full flow:

```text
1. socket(AF_INET, SOCK_STREAM) → fd
2. bind(fd, IP+port)
3. listen(fd, backlog)            ← kernel cấp SYN Q + Accept Q
4. Kernel:
   - SYN từ client → SYN Q
   - SYN-ACK gửi client
   - ACK từ client → match, move to Accept Q
5. App: accept(fd) → conn_fd
   - Kernel pop từ Accept Q
   - Cấp send queue + receive queue cho conn_fd
   - Trả conn_fd
6. App: read(conn_fd, buf, size)
   - Kernel chuyển data từ receive queue → user buf
   - Hoặc block / return EAGAIN nếu non-blocking và rỗng
7. App: write(conn_fd, ...)
   - Đẩy vào send queue
   - Kernel TCP push xuống NIC, ACK client
```

## Tóm tắt bài 1

- Socket = struct trong kernel, expose qua file descriptor user space.
- Listening socket khác connection socket — listening chờ, connection cụ thể.
- 2 queue: SYN (incomplete) + Accept (chờ app accept). Đầy = drop.
- `0.0.0.0` listen = mọi interface — security trap.
- `SO_REUSEPORT` = mỗi worker accept queue riêng, scale tốt.
- `fork()` inherit fd → master/worker NGINX share listening socket.
- NGINX dùng non-blocking + epoll để 1 worker xử lý vạn connection.

**Bài kế tiếp** → [Bài 2: Proxy vs Reverse Proxy — sâu hơn](02-proxy-vs-reverse-proxy.md)

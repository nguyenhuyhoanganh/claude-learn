# Bài 1: vProfile project — kiến trúc multi-tier baseline

vProfile là **dự án xương sống** chạy xuyên suốt khoá còn lại. Một web app Java social network với **5 tier** thực tế. Bạn sẽ deploy nó: trên local → AWS lift-shift → containerize → Kubernetes → CI/CD pipeline → monitoring. Mỗi lần phức tạp hơn 1 cấp.

## Vì sao dự án sample quan trọng?

DevOps thuần "concept" không đủ — bạn phải **deploy real app**. vProfile cung cấp:

- **Stack thực tế**: nginx + Tomcat + MySQL + Memcached + RabbitMQ — combo phổ biến enterprise.
- **Repeatable lab**: setup lại được nhiều lần khi học mỗi tool mới.
- **Source code Java sẵn**: không cần tự viết app, focus vào infra/deploy.
- **Đủ phức tạp**: 5 service tương tác = thấy được mọi failure mode.

Mỗi lần học tool mới (Docker, K8s, Terraform, Ansible...), bạn deploy lại vProfile bằng tool đó → so sánh experience → hiểu sâu.

## Kiến trúc vProfile

```text
                  +────────+
                  │ User   │
                  │ browser│
                  +────┬───+
                       │ HTTPS
                       ▼
              +──────────────────+
              │  nginx (web01)   │  ← Reverse proxy / load balancer
              │  192.168.56.11   │
              +────────┬─────────+
                       │ HTTP
                       ▼
              +──────────────────+
              │  Tomcat (app01)  │  ← Java app server (deploy .war)
              │  192.168.56.12   │
              +─┬──────────────┬─+
                │              │
        Cache?  │              │ Message
                ▼              ▼
       +─────────────+   +────────────+
       │ Memcached   │   │ RabbitMQ   │
       │ (mc01)      │   │ (rmq01)    │
       │.56.13:11211 │   │.56.14:5672 │
       +──────┬──────+   +────────────+
              │ Cache miss
              ▼
       +─────────────+
       │ MySQL/      │
       │ MariaDB     │
       │ (db01)      │
       │.56.15:3306  │
       +─────────────+
```

## Flow request — user login

```text
1. User vào http://192.168.56.11 (nginx)
2. nginx forward → Tomcat (192.168.56.12:8080)
3. Tomcat render trang login
4. User submit username + password
5. App check cache (Memcached) trước:
   - Hit cache → return user info ngay
   - Miss cache → query MySQL → cache lại → return
6. RabbitMQ nhận event (vd "user logged in") cho async processing
7. Response về user qua Tomcat → nginx → browser
```

5 service hoạt động cùng nhau = **stack**.

## Trách nhiệm từng service

| Service | Vai trò | Port | Distro được chọn |
|---|---|---|---|
| **nginx** | Reverse proxy, SSL termination, load balance | 80, 443 | Ubuntu 22.04 |
| **Tomcat** | Java app server, chạy file `.war` | 8080 | CentOS 9 |
| **MySQL/MariaDB** | Database chính (user, post, settings) | 3306 | CentOS 9 |
| **Memcached** | Cache key-value, giảm tải DB | 11211 | CentOS 9 |
| **RabbitMQ** | Message broker, async event | 5672 (AMQP), 15672 (UI) | CentOS 9 |

5 VM riêng biệt = production-like multi-tier.

## Vì sao mỗi service 1 VM riêng?

Đây là pattern thực tế nhất cho production:

- **Isolation**: MySQL crash không kéo theo Tomcat.
- **Scaling**: scale tier có bottleneck riêng (vd thêm web nodes).
- **Security**: DB chỉ accept connection từ app server.
- **Maintenance**: restart DB không downtime web.

Compromise: 5 VM = tốn RAM. Lab dev có thể giảm còn 2-3 VM bằng cách gộp service nhẹ.

## Vì sao chọn các tool này?

### nginx
- Light, nhanh hơn Apache cho static content.
- Reverse proxy + load balancer chuẩn ngành.
- Cấu hình declarative file rõ ràng.

### Tomcat
- Java app server phổ biến nhất.
- Free, mature, deploy `.war` trivial.
- vProfile là Java → Tomcat tự nhiên.

### MySQL/MariaDB
- RDBMS phổ biến nhất.
- Free, dễ install, document đầy đủ.
- MariaDB = drop-in replacement của MySQL, license rõ ràng.

### Memcached
- Distributed cache key-value.
- Đơn giản hơn Redis cho use case cache thuần.
- Tomcat có lib `XMemcached` tích hợp dễ.

### RabbitMQ
- Message broker mạnh, support nhiều protocol (AMQP, MQTT, STOMP).
- Web UI để debug.
- Dùng cho async task: send mail, process upload, notification.

## Source code

vProfile project source: **github.com/hkhcoder/vprofile-project**

Branches quan trọng:
- `main` — code app + Dockerfile mặc định.
- `local` — setup chạy local với Vagrant (phase này).
- `local-setup` — branch tài liệu setup.
- `awsrefactor` — phiên bản refactor AWS (section 15).
- `containers` — phiên bản Docker (section 27-28).
- `kubernetes` — manifest K8s (section 29-30).

```bash
git clone -b local https://github.com/hkhcoder/vprofile-project.git
cd vprofile-project
ls
# pom.xml  src/  vagrant/  ...
```

## Setup manual vs automated

Bài 2-5 sẽ làm **manual** từng service. Bài 6 chuyển sang **automated** với Vagrant provisioning.

| Manual | Automated |
|---|---|
| SSH vào từng VM, gõ lệnh | `vagrant up` chạy 1 lần |
| 60-90 phút setup | 10-15 phút |
| Sai chỗ nào debug chỗ đó | Script chạy lại sạch |
| Learn fundamental | Learn IaC |

**Làm manual trước** = hiểu mỗi bước script đang làm gì. Đây là **lý do phương pháp**, không phải lười.

## Tools cần (đã cài phase 2-3)

```bash
vagrant --version             # 2.4+
VBoxManage --version          # 7.0+
git --version
java -version                 # 17+ (cho build .war local nếu cần)
mvn --version                 # 3.9+
```

## Resource yêu cầu host

5 VM × ~1 GB RAM mỗi cái = **5-6 GB RAM**. Tổng:
- Host OS: ~3-4 GB.
- VM: 5-6 GB.
- **Min 12 GB RAM** trên host để chạy smooth.

Nếu host 8 GB → có thể giảm RAM VM (`vb.memory = 512` cho memcache, rmq).

## Plan setup manual (bài 2-5)

```text
Bài 2: Vagrant multi-VM setup
       └─ Up 5 VM, verify network

Bài 3: Data tier
       ├─ MySQL setup (db01)
       ├─ Memcached setup (mc01)
       └─ RabbitMQ setup (rmq01)

Bài 4: App tier
       ├─ Tomcat setup (app01)
       ├─ Build vProfile.war
       └─ Deploy + verify

Bài 5: Web tier + validate
       ├─ nginx config + reverse proxy
       └─ End-to-end test
```

Sau khi xong manual → bài 6 viết Vagrantfile có **provision script tự động** làm tất cả.

## Lab thực tế trong khoá

Khi bạn học mỗi tool tiếp theo, sẽ làm lại vProfile:

| Section | Tool | Làm gì với vProfile |
|---|---|---|
| 13-15 | AWS | Deploy lên EC2 (lift) → refactor PaaS (RDS, ElastiCache) |
| 17 | Jenkins | CI/CD pipeline build + test + deploy |
| 18 | GitHub Actions | Pipeline tương đương Jenkins |
| 22 | Ansible | Tự động hoá deployment 5 server |
| 21 | Terraform | Provision infra AWS bằng code |
| 27-28 | Docker | Container hoá từng service |
| 29-30 | Kubernetes | Deploy lên K8s cluster |

vProfile = **case study xuyên suốt**.

## Bẫy thường gặp với lab này

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Host < 8 GB RAM | OOM, máy lag | Giảm `vb.memory` từng VM |
| Network conflict 192.168.56.x | VM không reach nhau | Đổi range hoặc xoá conflict |
| Firewall block port giữa VM | Service không kết nối | Disable firewalld (lab) |
| SELinux block Tomcat | Tomcat không serve | `setenforce 0` (lab) |
| Build .war fail | Maven dependency | Check `pom.xml`, JDK version |
| Tomcat 9 vs 10 conflict | Servlet API khác | Stick 1 version, theo source code branch |

## Verification checklist

Sau khi setup xong (bài 5), verify:

- [ ] 5 VM all running (`vagrant status` show running)
- [ ] Network: ping được giữa các VM
- [ ] MySQL: `mysql -h db01 -u admin -p` connect được từ app01
- [ ] Memcached: `nc -zv mc01 11211` mở
- [ ] RabbitMQ: web UI ở `http://rmq01:15672` truy cập được
- [ ] Tomcat: `curl http://app01:8080` trả về welcome page
- [ ] vProfile.war deploy: `http://app01:8080/login` show form
- [ ] nginx proxy: `http://192.168.56.11` show login form
- [ ] End-to-end: login với `admin_vp` / `admin_vp` thành công

## Tóm tắt bài 1

- vProfile = web app Java multi-tier dùng làm **xương sống** cho mọi project về sau.
- 5 tier: nginx (web) → Tomcat (app) → Memcached + MySQL + RabbitMQ (data/cache/queue).
- Mỗi service VM riêng = production-like, isolation, scale độc lập.
- Branch `local` của repo `hkhcoder/vprofile-project` cho setup này.
- Min 12 GB host RAM cho 5 VM smooth.
- Manual trước (bài 2-5) để hiểu, automated sau (bài 6) để efficiency.
- vProfile sẽ deploy lại với mọi tool học sau (AWS, Docker, K8s, Jenkins, Ansible, Terraform).

**Bài kế tiếp** → [Bài 2: Vagrant multi-VM setup cho 5 tier](02-vagrant-multi-vm-setup.md)

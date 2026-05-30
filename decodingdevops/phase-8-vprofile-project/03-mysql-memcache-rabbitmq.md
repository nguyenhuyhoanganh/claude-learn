# Bài 3: Setup MySQL, Memcached, RabbitMQ — data tier

Setup 3 backend service: **MySQL** (database), **Memcached** (cache), **RabbitMQ** (message broker). Pattern Install → Configure → Deploy → Verify áp dụng cho từng cái.

## MySQL/MariaDB setup (db01)

```bash
vagrant ssh db01
sudo -i
```

### 1. Install

```bash
# Cập nhật + cài
dnf update -y
dnf install -y mariadb-server git wget
```

### 2. Configure

```bash
systemctl enable --now mariadb
systemctl status mariadb

# Disable firewall (lab)
systemctl stop firewalld
systemctl disable firewalld
```

### 3. Secure + tạo DB cho vProfile

```bash
mysql_secure_installation
```

- Current password: enter rỗng.
- Set root password: `admin123` (lab) hoặc strong cho production.
- Remove anonymous: Y
- Disallow remote root: Y
- Remove test DB: Y
- Reload privileges: Y

Login với root:

```bash
mysql -u root -padmin123
```

Trong MySQL:

```sql
CREATE DATABASE accounts;
GRANT ALL PRIVILEGES ON accounts.* TO 'admin'@'%' IDENTIFIED BY 'admin123';
FLUSH PRIVILEGES;
EXIT;
```

> Production: dùng password mạnh, hạn chế GRANT theo IP/hostname.

### 4. Deploy schema từ source code vProfile

```bash
cd /tmp
git clone -b local https://github.com/hkhcoder/vprofile-project.git
cd vprofile-project

# File schema ở src/main/resources/db_backup.sql
mysql -u root -padmin123 accounts < src/main/resources/db_backup.sql
```

### 5. Verify

```bash
mysql -u root -padmin123 -e "USE accounts; SHOW TABLES;"
# +────────────────────+
# │ Tables_in_accounts │
# +────────────────────+
# │ role               │
# │ user               │
# │ user_role          │
# +────────────────────+

mysql -u root -padmin123 -e "USE accounts; SELECT * FROM user;"
```

Phải có sẵn user `admin_vp` để app login.

### 6. Test remote connection từ app01

```bash
vagrant ssh app01
sudo -i
dnf install -y mariadb        # Client thôi
mysql -h db01 -u admin -padmin123 -e "USE accounts; SHOW TABLES;"
```

Nếu remote refuse → check:
- `bind-address` trong `/etc/my.cnf.d/mariadb-server.cnf` (đặt `0.0.0.0`).
- User `'admin'@'%'` (wildcard host) chứ không phải `'admin'@'localhost'`.
- Firewall mở port 3306.

## Memcached setup (mc01)

```bash
vagrant ssh mc01
sudo -i
```

### 1. Install + configure

```bash
dnf install -y memcached
systemctl start memcached
systemctl enable memcached
systemctl status memcached
```

Default lắng nghe **chỉ 127.0.0.1** — cần đổi để app01 reach được:

```bash
# Edit /etc/sysconfig/memcached
sed -i 's/OPTIONS="-l 127.0.0.1,::1"/OPTIONS=""/' /etc/sysconfig/memcached
sed -i 's/-U 11211/-U 11211 -l 0.0.0.0/' /etc/sysconfig/memcached

# Hoặc edit thủ công:
vim /etc/sysconfig/memcached
# OPTIONS=""              ← Xoá -l 127.0.0.1

# Restart
systemctl restart memcached
```

### 2. Open port 11211 và 11111 (UDP)

```bash
systemctl stop firewalld
systemctl disable firewalld
# Hoặc:
# firewall-cmd --add-port=11211/tcp --permanent
# firewall-cmd --reload
```

### 3. Verify

```bash
ss -tulnp | grep 11211
# tcp LISTEN *:11211

# Test từ app01:
vagrant ssh app01
sudo -i
echo stats | nc mc01 11211 | head
# STAT pid 1234
# STAT uptime 30
# ...
```

Memcached protocol siêu đơn giản — `echo stats | nc HOST 11211` test luôn.

## RabbitMQ setup (rmq01)

```bash
vagrant ssh rmq01
sudo -i
```

### 1. Install dependencies + EPEL

```bash
dnf install -y epel-release wget centos-release-rabbitmq-38
dnf update -y
```

### 2. Install RabbitMQ

```bash
dnf install -y rabbitmq-server
```

### 3. Start + enable

```bash
systemctl enable --now rabbitmq-server
systemctl status rabbitmq-server
```

### 4. Cấu hình cho phép remote

Tạo file `/etc/rabbitmq/rabbitmq.conf`:

```bash
echo "listeners.tcp.default = 5672" > /etc/rabbitmq/rabbitmq.conf
```

### 5. Tạo user cho vProfile

```bash
sudo rabbitmqctl add_user test test
sudo rabbitmqctl set_user_tags test administrator
sudo rabbitmqctl set_permissions -p / test ".*" ".*" ".*"

# Restart
systemctl restart rabbitmq-server
```

### 6. Enable web UI (optional, debug)

```bash
rabbitmq-plugins enable rabbitmq_management
systemctl restart rabbitmq-server
```

Browser: `http://192.168.56.14:15672` → login `test/test`.

### 7. Disable firewall

```bash
systemctl stop firewalld
systemctl disable firewalld
```

### 8. Verify

```bash
# Trên rmq01
rabbitmqctl status
rabbitmqctl list_users

# Trên app01: test port
vagrant ssh app01
nc -zv rmq01 5672
# Connection to rmq01 5672 port [tcp/amqp] succeeded!
```

## Tổng kết data tier

Cuối bài, 3 service hoạt động:

```text
+──────────────+      +──────────────+      +──────────────+
│ MySQL (db01) │      │ Memcache(mc01)│      │RabbitMQ(rmq01)│
│  port 3306   │      │  port 11211  │      │  port 5672   │
│  ✓ running   │      │  ✓ running   │      │  ✓ running   │
│  DB accounts │      │  ✓ remote OK │      │  user: test  │
│  ✓ schema    │      │              │      │  UI :15672   │
+──────────────+      +──────────────+      +──────────────+
       │                     │                     │
       └─────────────────────┼─────────────────────┘
                             ▼
                       App01 (Tomcat)
                       Sẽ setup bài 4
```

## Checklist trước sang bài 4

- [ ] `mysql -h db01 -u admin -padmin123` connect được.
- [ ] `SHOW TABLES` trong accounts DB hiện 3 bảng.
- [ ] `echo stats | nc mc01 11211` hiện STAT.
- [ ] `nc -zv rmq01 5672` succeeded.
- [ ] Web UI RabbitMQ `http://192.168.56.14:15672` login được.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| MySQL bind 127.0.0.1 | App01 không connect | `bind-address = 0.0.0.0` trong my.cnf |
| User `'admin'@'localhost'` | App01 (remote) refuse | Dùng `'admin'@'%'` cho lab |
| Memcached default localhost-only | App01 fail | Xoá `-l 127.0.0.1` trong sysconfig |
| Firewall block port | Connection timeout | Disable hoặc allow port |
| RabbitMQ default user `guest/guest` chỉ local | Auth fail | Tạo user mới với rabbitmqctl |
| SELinux block port | Service fail bind | `setsebool` hoặc `setenforce 0` (lab) |
| Schema không load | App fail SQL queries | Verify `SHOW TABLES` |

## Production hardening

| Service | Action |
|---|---|
| MySQL | TLS encrypt, IP whitelist, periodic backup, slow query log |
| Memcached | Bind LAN IP cụ thể (không 0.0.0.0), SASL auth |
| RabbitMQ | TLS, user per app, quota, mirror queues cho HA |

Lab skip để đơn giản. Production luôn dùng pattern này.

## Tóm tắt bài 3

- **MySQL/MariaDB**: install → secure → tạo DB `accounts` + user `admin@%` → load schema từ `db_backup.sql`.
- **Memcached**: install → xoá `-l 127.0.0.1` để remote → port 11211 TCP.
- **RabbitMQ**: install qua centos-release-rabbitmq-38 → tạo user `test/test` → enable web UI port 15672.
- Cả 3 service: disable firewalld trong lab; production phải hardening.
- Test connectivity từ app01 trước khi sang bài 4.

**Bài kế tiếp** → [Bài 4: Tomcat setup và deploy vProfile.war](04-tomcat-app-deploy.md)

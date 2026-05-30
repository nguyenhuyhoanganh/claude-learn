# Bài 6: Tự động hoá toàn bộ setup với Vagrant provisioning

Bài 2-5 setup manual. Cuối cùng: **1 lệnh `vagrant up` → 5 service ready**. Đây là **Infrastructure as Code** đầu tiên — prototype cho Ansible/Terraform sau này.

## Vì sao tự động?

Manual setup mất 60-90 phút. Provisioning 1 lần xong, dùng lại:
- Khi VM destroy + tạo mới.
- Khi onboard đồng nghiệp (clone repo + `vagrant up`).
- Test environment giống staging.
- Trước demo: reset clean.

Đây cũng là **mindset Infrastructure as Code (IaC)** — mọi setup viết thành script + version control.

## Cấu trúc folder

```text
~/vprofile-lab/
├── Vagrantfile
├── scripts/
│   ├── common.sh          ← /etc/hosts, hostname
│   ├── mysql.sh
│   ├── memcache.sh
│   ├── rabbitmq.sh
│   ├── tomcat.sh
│   └── nginx.sh
└── README.md
```

Script tách riêng → tái sử dụng + dễ test/debug.

## scripts/common.sh

```bash
#!/bin/bash
set -e

# Sync /etc/hosts trên mọi VM
cat > /etc/hosts <<EOF
127.0.0.1   localhost
192.168.56.11  web01
192.168.56.12  app01
192.168.56.13  mc01
192.168.56.14  rmq01
192.168.56.15  db01
EOF

# Disable firewall (lab)
systemctl stop firewalld 2>/dev/null || true
systemctl disable firewalld 2>/dev/null || true

# Disable SELinux trên RHEL family (lab)
if [ -f /etc/selinux/config ]; then
    sed -i 's/SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config
    setenforce 0 2>/dev/null || true
fi
```

## scripts/mysql.sh

```bash
#!/bin/bash
set -e

DB_NAME="accounts"
DB_USER="admin"
DB_PASS="admin123"
DB_ROOT_PASS="admin123"

# Install
dnf install -y mariadb-server git wget

# Start
systemctl enable --now mariadb

# Wait for MariaDB ready
sleep 5

# Setup root password (idempotent)
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${DB_ROOT_PASS}';" 2>/dev/null || true

# Create DB + user
mysql -u root -p${DB_ROOT_PASS} <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME};
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL

# Bind 0.0.0.0
sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/my.cnf.d/mariadb-server.cnf 2>/dev/null || true
systemctl restart mariadb

# Load schema
cd /tmp
if [ ! -d vprofile-project ]; then
    git clone -b local https://github.com/hkhcoder/vprofile-project.git
fi

mysql -u root -p${DB_ROOT_PASS} ${DB_NAME} < vprofile-project/src/main/resources/db_backup.sql

echo "MySQL setup complete"
```

## scripts/memcache.sh

```bash
#!/bin/bash
set -e

dnf install -y memcached

# Bind 0.0.0.0
sed -i 's/OPTIONS=.*/OPTIONS=""/' /etc/sysconfig/memcached

systemctl enable --now memcached
systemctl restart memcached

echo "Memcached setup complete"
```

## scripts/rabbitmq.sh

```bash
#!/bin/bash
set -e

dnf install -y epel-release wget
dnf install -y centos-release-rabbitmq-38
dnf install -y rabbitmq-server

systemctl enable --now rabbitmq-server

# Listen all
echo "listeners.tcp.default = 5672" > /etc/rabbitmq/rabbitmq.conf

# Tạo user (idempotent)
rabbitmqctl add_user test test 2>/dev/null || true
rabbitmqctl set_user_tags test administrator
rabbitmqctl set_permissions -p / test ".*" ".*" ".*"

# Enable management UI
rabbitmq-plugins enable rabbitmq_management

systemctl restart rabbitmq-server

echo "RabbitMQ setup complete"
```

## scripts/tomcat.sh

```bash
#!/bin/bash
set -e

TOMCAT_VERSION="10.1.17"

# Install Java 17 + Maven + Git
dnf install -y java-17-openjdk java-17-openjdk-devel git wget maven

# Tomcat user
id tomcat &>/dev/null || useradd -r -m -U -d /opt/tomcat -s /sbin/nologin tomcat

# Download & extract
if [ ! -f /opt/tomcat/bin/startup.sh ]; then
    cd /tmp
    wget -q "https://dlcdn.apache.org/tomcat/tomcat-10/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz"
    tar -xzf "apache-tomcat-${TOMCAT_VERSION}.tar.gz" -C /opt/tomcat --strip-components=1
    chown -R tomcat:tomcat /opt/tomcat/
    chmod +x /opt/tomcat/bin/*.sh
fi

# systemd unit
cat > /etc/systemd/system/tomcat.service <<'EOF'
[Unit]
Description=Apache Tomcat 10
After=network.target

[Service]
Type=forking
User=tomcat
Group=tomcat
Environment="JAVA_HOME=/usr/lib/jvm/jre"
Environment="CATALINA_PID=/opt/tomcat/temp/tomcat.pid"
Environment="CATALINA_HOME=/opt/tomcat"
Environment="CATALINA_BASE=/opt/tomcat"
ExecStart=/opt/tomcat/bin/startup.sh
ExecStop=/opt/tomcat/bin/shutdown.sh
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now tomcat

# Build & deploy vProfile (idempotent)
cd /tmp
if [ ! -d vprofile-project ]; then
    git clone -b local https://github.com/hkhcoder/vprofile-project.git
fi
cd vprofile-project

# Wait for backend services ready
echo "Waiting for backend services..."
until nc -zv db01 3306 &>/dev/null; do sleep 2; done
until nc -zv mc01 11211 &>/dev/null; do sleep 2; done
until nc -zv rmq01 5672 &>/dev/null; do sleep 2; done

# Build
mvn install -B -DskipTests

# Deploy
systemctl stop tomcat
rm -rf /opt/tomcat/webapps/ROOT*
cp target/vprofile-v2.war /opt/tomcat/webapps/ROOT.war
chown tomcat:tomcat /opt/tomcat/webapps/ROOT.war
systemctl start tomcat

echo "Tomcat + vProfile deployed"
```

## scripts/nginx.sh

```bash
#!/bin/bash
set -e

apt update
apt install -y nginx

systemctl enable --now nginx

# Config reverse proxy
cat > /etc/nginx/sites-available/vprofileapp <<'EOF'
upstream vprofile_backend {
    server app01:8080;
}

server {
    listen 80 default_server;
    server_name _;

    access_log /var/log/nginx/vprofile-access.log;
    error_log /var/log/nginx/vprofile-error.log;

    location / {
        proxy_pass http://vprofile_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/vprofileapp /etc/nginx/sites-enabled/vprofileapp
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "nginx reverse proxy configured"
```

## Vagrantfile — gắn provisioning

```ruby
Vagrant.configure("2") do |config|

  # Common provision cho mọi VM
  config.vm.provision "shell", path: "scripts/common.sh"

  config.vm.define "db01" do |db|
    db.vm.box = "eurolinux-vagrant/centos-stream-9"
    db.vm.hostname = "db01"
    db.vm.network "private_network", ip: "192.168.56.15"
    db.vm.provider "virtualbox" do |vb|
      vb.memory = 1024
    end
    db.vm.provision "shell", path: "scripts/mysql.sh"
  end

  config.vm.define "mc01" do |mc|
    mc.vm.box = "eurolinux-vagrant/centos-stream-9"
    mc.vm.hostname = "mc01"
    mc.vm.network "private_network", ip: "192.168.56.13"
    mc.vm.provider "virtualbox" do |vb|
      vb.memory = 512
    end
    mc.vm.provision "shell", path: "scripts/memcache.sh"
  end

  config.vm.define "rmq01" do |rmq|
    rmq.vm.box = "eurolinux-vagrant/centos-stream-9"
    rmq.vm.hostname = "rmq01"
    rmq.vm.network "private_network", ip: "192.168.56.14"
    rmq.vm.provider "virtualbox" do |vb|
      vb.memory = 768
    end
    rmq.vm.provision "shell", path: "scripts/rabbitmq.sh"
  end

  config.vm.define "app01" do |app|
    app.vm.box = "eurolinux-vagrant/centos-stream-9"
    app.vm.hostname = "app01"
    app.vm.network "private_network", ip: "192.168.56.12"
    app.vm.provider "virtualbox" do |vb|
      vb.memory = 1536
    end
    app.vm.provision "shell", path: "scripts/tomcat.sh"
  end

  config.vm.define "web01" do |web|
    web.vm.box = "ubuntu/jammy64"
    web.vm.hostname = "web01"
    web.vm.network "private_network", ip: "192.168.56.11"
    web.vm.network "forwarded_port", guest: 80, host: 8081
    web.vm.provider "virtualbox" do |vb|
      vb.memory = 1024
    end
    web.vm.provision "shell", path: "scripts/nginx.sh"
  end

end
```

**Thứ tự** quan trọng: data tier trước (db, mc, rmq) → app → nginx cuối.

Tomcat script có `until nc -zv ... ` để chờ data tier ready.

## Run + verify

```bash
cd ~/vprofile-lab
vagrant up
```

15-20 phút sau:

```bash
vagrant status
# 5 VM running

curl http://localhost:8081
# vProfile login page
```

Browser host: `http://localhost:8081` → vProfile login.

## Re-run / Re-provision

```bash
vagrant provision                # Re-run provision mọi VM
vagrant provision app01          # Chỉ 1 VM
vagrant reload --provision       # Restart + provision
```

Provision script cần **idempotent** — chạy lại không phá. Pattern:

```bash
# Check trước khi tạo
if ! id user &>/dev/null; then
    useradd user
fi

# Check trước khi append
grep -q "192.168.56.11 web01" /etc/hosts || echo "192.168.56.11 web01" >> /etc/hosts

# IF NOT EXISTS trong SQL
CREATE DATABASE IF NOT EXISTS accounts;
```

## Cross-platform — Mac M-series

```ruby
config.vm.provider "vmware_desktop" do |v|
  v.memory = 1024
end

# Hoặc khai báo cả 2:
config.vm.provider "virtualbox" do |vb|
  vb.memory = 1024
end
config.vm.provider "vmware_desktop" do |v|
  v.memory = 1024
end
```

Pick provider qua `--provider`:

```bash
VAGRANT_DEFAULT_PROVIDER=vmware_desktop vagrant up
```

## Commit lab vào Git

Folder lab là tài sản — push lên GitHub để team dùng:

```bash
cd ~/vprofile-lab
git init
echo ".vagrant/" > .gitignore
git add .
git commit -m "Initial vProfile multi-VM lab"
git remote add origin git@github.com:you/vprofile-lab.git
git push -u origin main
```

Đồng nghiệp setup:

```bash
git clone git@github.com:you/vprofile-lab.git
cd vprofile-lab
vagrant up
```

15 phút sau họ có lab y hệt. Đây là **DevOps power**.

## So với Ansible (preview phase 22)

Vagrant provisioning là **mini Ansible**. Ansible mạnh hơn:
- Modules thay shell script — `apt`, `service`, `mysql_db`, `template`.
- Idempotency built-in.
- Inventory & roles.
- Run remotely qua SSH, không chỉ Vagrant.

Phase 22 sẽ refactor vProfile setup này dùng Ansible playbook → so sánh experience.

## Tổng kết phase 8

6 bài đã cover:
1. Kiến trúc vProfile — 5 tier.
2. Vagrant multi-VM setup.
3. Data tier: MySQL + Memcached + RabbitMQ.
4. App tier: Tomcat + build + deploy .war.
5. Web tier: nginx reverse proxy.
6. Automation: provisioning toàn bộ.

vProfile sẽ tái xuất ở:
- Section 13-15: AWS lift-shift + refactor.
- Section 17: Jenkins CI/CD pipeline build + deploy.
- Section 22: Ansible playbook deploy.
- Section 27-28: Docker container hoá.
- Section 29-30: Kubernetes deploy.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Provision không idempotent | Re-run fail/phá | `IF NOT EXISTS`, `|| true` |
| Thứ tự VM sai | App start trước DB | Khai báo DB trước trong Vagrantfile |
| Tomcat build khi DB chưa ready | App crash | `until nc -zv` wait |
| Maven download chậm | Provision timeout | Increase timeout, hoặc pre-build .war |
| `.vagrant/` commit Git | Repo nặng | `.gitignore` |
| Script không executable | Provision fail | Vagrant tự handle (chạy với sh) |
| Memory tổng quá lớn | Host swap | Giảm `vb.memory` mỗi VM |

## Tóm tắt bài 6

- **Vagrant provisioning** = mini Infrastructure as Code.
- Tách script per VM trong `scripts/` folder.
- Script **idempotent** — pattern `IF NOT EXISTS`, `grep -q || cmd`, `|| true`.
- Thứ tự VM trong Vagrantfile = thứ tự up = thứ tự provision.
- Tomcat script `until nc -zv db01` chờ data tier ready.
- 15 phút `vagrant up` = full stack production-like.
- Commit lab vào Git → onboard team `git clone && vagrant up`.

**Phase kế tiếp** → [Phase 9 — Bài 1: Networking — TCP/IP, OSI, IP address](../phase-9-networking/01-networking-co-ban.md)

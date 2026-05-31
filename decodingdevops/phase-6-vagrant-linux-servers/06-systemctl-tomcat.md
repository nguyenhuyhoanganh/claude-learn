# Bài 6: Custom systemd unit file với Tomcat 10

Bài cuối phase 6. Đôi khi bạn cài app **từ source** hoặc tarball — không qua package manager. Không có systemd unit sẵn → bạn phải **tự viết**. Bài này dạy với ví dụ thực tế: Tomcat 10.

## Vì sao cần custom systemd unit?

App cài qua `apt`/`dnf` tự có unit file. App cài tay (tarball, custom build) **không có** → mỗi lần start phải chạy script thủ công, không enable boot được.

Solution: viết unit file vào `/etc/systemd/system/`, sau đó `systemctl` quản như service "chính thức".

## Tomcat là gì?

> **Apache Tomcat** = Java application server, chạy app Java (war/jar). Khác Apache httpd (cho HTML/PHP) — Tomcat cho **Java web app**.

Tomcat version đang dùng (2025): **Tomcat 10** (cho Jakarta EE 9+), **Tomcat 9** (cho Java EE 8 legacy).

Trong khoá này dùng Tomcat 10 cho **vProfile project** (section 8).

## Setup VM

```bash
mkdir ~/vagrant-vms/tomcat && cd ~/vagrant-vms/tomcat
vagrant init eurolinux-vagrant/centos-stream-9
```

Vagrantfile:

```ruby
Vagrant.configure("2") do |config|
  config.vm.box = "eurolinux-vagrant/centos-stream-9"
  config.vm.hostname = "tomcat"
  config.vm.network "private_network", ip: "192.168.56.50"
  config.vm.network "forwarded_port", guest: 8080, host: 8082
  config.vm.provider "virtualbox" do |vb|
    vb.memory = 2048
    vb.cpus = 2
  end
end
```

```bash
vagrant up
vagrant ssh
sudo -i
```

## Bước 1: Install Java

Tomcat 10 yêu cầu **Java 11+** (Java 17 LTS khuyên dùng):

```bash
yum install -y java-17-openjdk java-17-openjdk-devel wget vim
java -version
# openjdk version "17.0.x" ...
```

## Bước 2: Tạo user tomcat (không login)

Service user không nên là root:

```bash
useradd -r -m -U -d /opt/tomcat -s /sbin/nologin tomcat
#         │  │  │  │            │
#         │  │  │  │            └ Shell không cho login
#         │  │  │  └ Home dir
#         │  │  └ Tạo group cùng tên
#         │  └ Tạo home folder
#         └ System user (UID < 1000)
```

## Bước 3: Download và extract Tomcat 10

```bash
cd /tmp

# Lấy link mirror chính thức
TOMCAT_VERSION="10.1.17"
wget https://dlcdn.apache.org/tomcat/tomcat-10/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz

# Extract vào /opt/tomcat
tar -xzf apache-tomcat-${TOMCAT_VERSION}.tar.gz -C /opt/tomcat --strip-components=1
# --strip-components=1 = bỏ folder ngoài cùng, file vào /opt/tomcat trực tiếp

# Verify
ls /opt/tomcat/
# bin/  conf/  lib/  logs/  temp/  webapps/  work/
```

## Bước 4: Set permission

```bash
chown -R tomcat:tomcat /opt/tomcat/
chmod +x /opt/tomcat/bin/*.sh
```

## Bước 5: Test manual start

```bash
sudo -u tomcat /opt/tomcat/bin/startup.sh
```

Output:

```text
Using CATALINA_BASE:   /opt/tomcat
Using CATALINA_HOME:   /opt/tomcat
...
Tomcat started.
```

Check port 8080:

```bash
ss -tulnp | grep 8080
# tcp LISTEN *:8080 ... java
```

Browser host: `http://192.168.56.50:8080` → Tomcat welcome page.

Stop:

```bash
sudo -u tomcat /opt/tomcat/bin/shutdown.sh
```

OK, manual start được. Giờ tự động hoá với systemd.

## Bước 6: Tạo systemd unit file

File `/etc/systemd/system/tomcat.service`:

```bash
vim /etc/systemd/system/tomcat.service
```

Content:

```ini
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
Environment="CATALINA_OPTS=-Xms512M -Xmx1024M -server -XX:+UseParallelGC"
Environment="JAVA_OPTS=-Djava.awt.headless=true -Djava.security.egd=file:/dev/./urandom"

ExecStart=/opt/tomcat/bin/startup.sh
ExecStop=/opt/tomcat/bin/shutdown.sh

Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Bước 7: Reload systemd và start

```bash
# QUAN TRỌNG: reload systemd để nó đọc unit file mới
systemctl daemon-reload

# Enable + start
systemctl enable --now tomcat

# Verify
systemctl status tomcat
```

Output:

```text
● tomcat.service - Apache Tomcat 10
   Loaded: loaded (/etc/systemd/system/tomcat.service; enabled; ...)
   Active: active (running) since ...
```

Browser refresh → Tomcat welcome page hoạt động.

## Anatomy systemd unit file

Phân tích từng section:

### `[Unit]`

```ini
Description=Apache Tomcat 10        # Mô tả ngắn
After=network.target                # Start sau khi network ready
Requires=postgresql.service         # Bắt buộc service khác chạy
Wants=postgresql.service            # Mong muốn (không fail nếu thiếu)
```

`After` quan trọng cho service phụ thuộc — vd Tomcat cần network.

### `[Service]`

```ini
Type=forking                        # App fork thành daemon, parent thoát
# Type=simple                       # App chạy foreground (Node, Python, Go thường)
# Type=oneshot                      # Chạy 1 lần rồi exit (script setup)
# Type=notify                       # App tự báo systemd "tôi ready"
# Type=idle                         # Chờ job khác xong

User=tomcat                         # Chạy với user này
Group=tomcat
WorkingDirectory=/opt/tomcat

Environment="KEY=value"             # Env variable
EnvironmentFile=/etc/tomcat/env     # Hoặc đọc từ file

ExecStart=/opt/tomcat/bin/startup.sh
ExecStop=/opt/tomcat/bin/shutdown.sh
ExecReload=/bin/kill -HUP $MAINPID

Restart=on-failure                  # Restart khi crash
# Restart=always                    # Restart kể cả khi exit 0
# Restart=no                        # Không restart
RestartSec=10                       # Đợi 10s trước restart

StandardOutput=journal              # stdout → journalctl
StandardError=journal
# StandardOutput=append:/var/log/tomcat.log    # Hoặc file
```

### `[Install]`

```ini
WantedBy=multi-user.target          # Start ở runlevel multi-user (server)
# WantedBy=graphical.target         # Runlevel có GUI (desktop)
```

Section này dùng cho `systemctl enable` — quyết định khi nào auto-start.

## Lệnh quản tomcat service

```bash
systemctl start tomcat
systemctl stop tomcat
systemctl restart tomcat
systemctl reload tomcat              # Nếu app support reload
systemctl status tomcat
systemctl enable tomcat              # Auto-start boot
systemctl disable tomcat
systemctl is-active tomcat
systemctl is-enabled tomcat

# Log
journalctl -u tomcat
journalctl -u tomcat -f              # Live tail
journalctl -u tomcat --since "1 hour ago"
```

## Deploy app — WAR file

Tomcat serve WAR file (Web ARchive). Deploy:

```bash
# Tải WAR mẫu
cd /tmp
wget https://tomcat.apache.org/tomcat-10.1-doc/appdev/sample/sample.war

# Copy vào webapps/
cp sample.war /opt/tomcat/webapps/

# Tomcat auto-deploy — extract sample/ trong webapps/
ls /opt/tomcat/webapps/
# sample.war  sample/
```

Browser: `http://192.168.56.50:8080/sample/` → app sample chạy.

## Quản nhiều unit cùng lúc

```bash
# Reload tất cả khi sửa nhiều unit
systemctl daemon-reload

# List service đang chạy
systemctl list-units --type=service --state=running

# Disable tất cả service không cần
systemctl disable bluetooth cups       # Vd

# Mask = không thể start được nữa
systemctl mask snapd
systemctl unmask snapd
```

## Timer — cron thay thế của systemd

systemd có thể schedule task thay cron:

`/etc/systemd/system/backup.service`:

```ini
[Unit]
Description=Daily backup

[Service]
Type=oneshot
ExecStart=/usr/local/bin/backup.sh
```

`/etc/systemd/system/backup.timer`:

```ini
[Unit]
Description=Run backup daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
systemctl daemon-reload
systemctl enable --now backup.timer
systemctl list-timers
```

So với cron:
- Pros: log qua journal, retry, dependency.
- Cons: verbose hơn.

Production modern thường dùng timer thay cron.

## Bẫy thường gặp khi viết unit file

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Quên `daemon-reload` | systemctl thấy version cũ | `systemctl daemon-reload` |
| `Type=simple` nhưng app fork | systemd nghĩ app crash | Đổi `Type=forking` |
| `User=` không có | Service chạy root (nguy hiểm) | Tạo system user trước |
| Path không absolute | "Executable not found" | Luôn `/path/to/cmd` |
| Tomcat fail start, log không có | Không thấy lỗi | `journalctl -u tomcat -n 100` |
| JAVA_HOME sai | Tomcat fail | Verify `Environment="JAVA_HOME=..."` |
| Port 8080 đã bị chiếm | Tomcat fail bind | `ss -tulnp | grep 8080` check |
| Permission tomcat folder | Tomcat không ghi log | `chown -R tomcat:tomcat /opt/tomcat` |
| Restart=always cho oneshot | Loop vô hạn | Dùng `on-failure` |

## Provisioning toàn bộ với Vagrant

```bash
#!/bin/bash
# setup-tomcat.sh
set -euo pipefail

TOMCAT_VERSION="10.1.17"

# Install
yum install -y java-17-openjdk java-17-openjdk-devel wget

# User
id tomcat &>/dev/null || useradd -r -m -U -d /opt/tomcat -s /sbin/nologin tomcat

# Download + extract
if [ ! -f /opt/tomcat/bin/startup.sh ]; then
    cd /tmp
    wget -q https://dlcdn.apache.org/tomcat/tomcat-10/v${TOMCAT_VERSION}/bin/apache-tomcat-${TOMCAT_VERSION}.tar.gz
    tar -xzf apache-tomcat-${TOMCAT_VERSION}.tar.gz -C /opt/tomcat --strip-components=1
    chown -R tomcat:tomcat /opt/tomcat/
    chmod +x /opt/tomcat/bin/*.sh
fi

# Unit file
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
systemctl stop firewalld
systemctl disable firewalld

# Verify
sleep 5
curl -sf http://localhost:8080 > /dev/null && echo "✓ Tomcat ready"
```

Vagrantfile:

```ruby
config.vm.provision "shell", path: "setup-tomcat.sh"
```

`vagrant up` → Tomcat ready trong vài phút.

## Tổng kết phase 6

6 bài đã cover:
1. Vagrantfile syntax + network/RAM/CPU.
2. Synced folder + provisioning.
3. Website setup với httpd (CentOS).
4. LAMP + WordPress (Ubuntu).
5. Multi-VM Vagrantfile.
6. Custom systemd unit (Tomcat 10).

Kỹ năng đạt được:
- Quản lý multi-VM lab độc lập.
- Setup web server từ scratch theo pattern 4 bước.
- Hiểu khác biệt distro (Ubuntu vs CentOS).
- Viết systemd unit cho app custom.
- Automation provisioning với Vagrant.

## Tóm tắt bài 6

- App cài tay → cần **custom systemd unit file** ở `/etc/systemd/system/`.
- Unit có 3 section: `[Unit]` (description, dependency), `[Service]` (run command, user, restart policy), `[Install]` (when enable).
- `Type=forking` cho app daemon hoá; `Type=simple` cho foreground.
- **Luôn `daemon-reload`** sau khi sửa unit.
- `Restart=on-failure` cho production resilience.
- **System user không login** (`-s /sbin/nologin`) cho service.
- **systemd timer** modern alternative cho cron.

**Phase kế tiếp** → [Phase 7 — Bài 1: Variables, JSON, YAML — ngôn ngữ dữ liệu của DevOps](../phase-7-variables-json-yaml/01-variables.md)

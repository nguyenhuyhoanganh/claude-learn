# Bài 4: LAMP stack và WordPress trên Ubuntu

Bài trước chỉ static HTML. Bài này dựng **app động** đầu tiên: WordPress trên **LAMP stack**. Pattern này cover 90% website thế giới.

## LAMP là gì?

**LAMP** = **L**inux + **A**pache + **M**ySQL + **P**HP. 4 thành phần xếp tầng:

```text
+──────────────────+
│  PHP             │  ← Logic (xử lý request, query DB, render HTML)
+──────────────────+
│  Apache (httpd)  │  ← Web server (nhận HTTP request, gọi PHP)
+──────────────────+
│  MySQL/MariaDB   │  ← Database (lưu data: post, user, comment)
+──────────────────+
│  Linux           │  ← OS
+──────────────────+
```

Variant:
- **LEMP** — thay Apache bằng **n**ginx (nginx → "Engine X" → E).
- **LAPP** — thay MySQL bằng **P**ostgreSQL.
- **WAMP / MAMP** — Windows / macOS thay Linux.

App chạy trên LAMP: WordPress, Drupal, Joomla, Magento, phpBB, hàng triệu site khác.

## Setup VM Ubuntu

```bash
mkdir ~/vagrant-vms/wordpress && cd ~/vagrant-vms/wordpress
vagrant init ubuntu/jammy64        # Hoặc bento/ubuntu-22.04
```

Vagrantfile:

```ruby
Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/jammy64"
  config.vm.hostname = "wordpress"
  config.vm.network "private_network", ip: "192.168.56.30"
  config.vm.network "forwarded_port", guest: 80, host: 8081

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
apt update                          # Refresh package metadata
```

## Bước 1: Install Apache, MySQL, PHP

```bash
# Apache
apt install -y apache2

# MySQL (MariaDB free fork, compatible)
apt install -y mariadb-server

# PHP + module phổ biến
apt install -y php php-mysql libapache2-mod-php php-curl php-gd php-mbstring php-xml php-zip
```

Một dòng:

```bash
apt install -y apache2 mariadb-server php php-mysql libapache2-mod-php \
                php-curl php-gd php-mbstring php-xml php-zip wget unzip
```

> **Lưu ý**: Ubuntu **auto-start** service sau install. RHEL/CentOS **không** — phải `systemctl enable --now`.

## Bước 2: Verify từng layer

```bash
# Apache
systemctl status apache2
curl http://localhost
# → Ubuntu Apache2 default page

# PHP
php -v
# PHP 8.1.x ...

# MariaDB
systemctl status mariadb
mysql --version
```

### Test PHP qua web

```bash
echo "<?php phpinfo(); ?>" > /var/www/html/info.php
```

Browser: `http://192.168.56.30/info.php` → trang info PHP chi tiết.

> **Xoá `info.php` sau test** — chứa info system, không nên expose.

## Bước 3: Secure MySQL

```bash
mysql_secure_installation
```

Wizard hỏi:

1. **Enter current password for root** → Enter (chưa có).
2. **Switch to unix_socket authentication?** → N (giữ password-based cho lab).
3. **Change root password?** → Y → set password mạnh.
4. **Remove anonymous users?** → Y.
5. **Disallow root login remotely?** → Y.
6. **Remove test database?** → Y.
7. **Reload privilege tables?** → Y.

Production làm hết. Lab có thể skip (lựa chọn nhanh).

## Bước 4: Tạo database cho WordPress

```bash
mysql -u root -p
# Enter password
```

Trong MySQL shell:

```sql
CREATE DATABASE wordpress;
CREATE USER 'wpuser'@'localhost' IDENTIFIED BY 'wppassword';
GRANT ALL PRIVILEGES ON wordpress.* TO 'wpuser'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Verify:

```bash
mysql -u wpuser -p -e "SHOW DATABASES;"
# wordpress
```

## Bước 5: Download và deploy WordPress

```bash
cd /tmp
wget https://wordpress.org/latest.zip
unzip latest.zip

# Copy vào DocumentRoot
cp -rf wordpress/* /var/www/html/

# Xoá Apache default page
rm /var/www/html/index.html

# Set ownership cho Apache user (www-data trên Ubuntu)
chown -R www-data:www-data /var/www/html/
chmod -R 755 /var/www/html/
```

## Bước 6: Configure WordPress

Tạo file config từ template:

```bash
cd /var/www/html
cp wp-config-sample.php wp-config.php
vim wp-config.php
```

Edit credentials:

```php
define( 'DB_NAME', 'wordpress' );
define( 'DB_USER', 'wpuser' );
define( 'DB_PASSWORD', 'wppassword' );
define( 'DB_HOST', 'localhost' );
```

Save.

## Bước 7: Restart và verify

```bash
systemctl restart apache2
```

Browser: `http://192.168.56.30` → WordPress install wizard:

1. Chọn language.
2. Site title, admin username/password, admin email.
3. Install WordPress.
4. Login với admin user.

Bạn có WordPress blog hoạt động.

## Khác biệt Ubuntu vs CentOS — tổng hợp

Cả 2 bài (3 + 4) cho phép so sánh:

| Tác vụ | CentOS (bài 3) | Ubuntu (bài 4) |
|---|---|---|
| Package manager | `yum`/`dnf` | `apt` |
| Httpd package | `httpd` | `apache2` |
| Httpd config | `/etc/httpd/conf/` | `/etc/apache2/` |
| Httpd user | `apache` | `www-data` |
| Log path | `/var/log/httpd/` | `/var/log/apache2/` |
| Test config | `httpd -t` | `apache2ctl configtest` |
| MySQL package | `mysql-server` hoặc `mariadb-server` | `mariadb-server` |
| Firewall | `firewalld` | `ufw` |
| Service auto-start sau install | ✗ (phải enable) | ✓ (tự enable) |
| SELinux | Enforcing default | Không có (AppArmor thay) |

DevOps engineer **biết cả hai**.

## Script tự động — đồng thời tất cả bước

Lưu thành `setup-wordpress.sh`:

```bash
#!/bin/bash
set -euo pipefail

# === 1. INSTALL ===
apt update -y
apt install -y apache2 mariadb-server \
               php php-mysql libapache2-mod-php \
               php-curl php-gd php-mbstring php-xml php-zip \
               wget unzip

# === 2. CONFIGURE ===
systemctl enable --now apache2 mariadb

# Setup MySQL database (idempotent)
mysql -e "CREATE DATABASE IF NOT EXISTS wordpress;"
mysql -e "CREATE USER IF NOT EXISTS 'wpuser'@'localhost' IDENTIFIED BY 'wppassword';"
mysql -e "GRANT ALL PRIVILEGES ON wordpress.* TO 'wpuser'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# === 3. DEPLOY ===
cd /tmp
if [ ! -f latest.zip ]; then
    wget -q https://wordpress.org/latest.zip
fi
unzip -o latest.zip
cp -rf wordpress/* /var/www/html/
rm -f /var/www/html/index.html

# Configure
cd /var/www/html
if [ ! -f wp-config.php ]; then
    cp wp-config-sample.php wp-config.php
    sed -i "s/database_name_here/wordpress/" wp-config.php
    sed -i "s/username_here/wpuser/" wp-config.php
    sed -i "s/password_here/wppassword/" wp-config.php
fi

# Ownership
chown -R www-data:www-data /var/www/html/
chmod -R 755 /var/www/html/

# === 4. RESTART ===
systemctl restart apache2

# Verify
curl -sf http://localhost > /dev/null && echo "✓ WordPress ready"
```

Bind vào Vagrant provisioner (bài 5 tiếp):

```ruby
config.vm.provision "shell", path: "setup-wordpress.sh"
```

`vagrant up` → 5 phút sau có WordPress chạy.

## Connection string an toàn

Lab thì OK. Production:

- ❌ Password trong wp-config.php plain text.
- ✓ Dùng env variable.
- ✓ Hoặc secret manager (AWS Secrets Manager, Vault).
- ✓ DB nằm trên server riêng (không cùng web server).

## WordPress hardening (production)

```bash
# Disable XML-RPC nếu không cần
echo "Require all denied" >> /var/www/html/xmlrpc.php

# Limit login attempts (plugin)

# HTTPS với Let's Encrypt
apt install -y certbot python3-certbot-apache
certbot --apache -d example.com

# Backup tự động
crontab -e
# 0 2 * * * mysqldump -u root wordpress > /backup/wp-$(date +\%F).sql
```

## Permissions chuẩn cho WordPress

```bash
chown -R www-data:www-data /var/www/html/
find /var/www/html/ -type d -exec chmod 755 {} \;
find /var/www/html/ -type f -exec chmod 644 {} \;
chmod 600 /var/www/html/wp-config.php           # Bảo mật cao cho config
```

## Logs để debug

```bash
# Apache
tail -f /var/log/apache2/error.log
tail -f /var/log/apache2/access.log

# MariaDB
tail -f /var/log/mysql/error.log

# PHP
tail -f /var/log/apache2/error.log              # PHP fatal → Apache log
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| PHP install không có module mysql | WP không kết DB | `apt install php-mysql` |
| Forgot `libapache2-mod-php` | PHP file download thay chạy | Cài + `systemctl restart apache2` |
| Permission `/var/www/html/` sai | WP install fail | `chown -R www-data:www-data` |
| MySQL root password vô | Lab ngại — nhưng production phải | `mysql_secure_installation` |
| Quên xoá `index.html` Apache | WP không hiện | `rm /var/www/html/index.html` |
| `info.php` còn trên prod | Expose system info | Xoá sau test |
| WordPress upload limit thấp | Theme/plugin install fail | Edit `php.ini`: `upload_max_filesize`, `post_max_size` |
| MariaDB chiếm RAM cao | OOM trong VM nhỏ | Tune `/etc/mysql/mariadb.conf.d/50-server.cnf` |

## Quick reference

```text
# Install
apt install -y apache2 mariadb-server php php-mysql libapache2-mod-php

# Service
systemctl enable --now apache2 mariadb
systemctl restart apache2

# MySQL
mysql -u root -p
mysql -e "CREATE DATABASE wp;"

# WordPress
wget https://wordpress.org/latest.zip
unzip latest.zip
cp -rf wordpress/* /var/www/html/
chown -R www-data:www-data /var/www/html/

# Config
vim /var/www/html/wp-config.php

# Test
curl http://localhost
apache2ctl configtest

# Log
tail -f /var/log/apache2/error.log
```

## Tóm tắt bài 4

- **LAMP** = Linux + Apache + MySQL + PHP — stack web động phổ biến nhất.
- Ubuntu: `apt install apache2 mariadb-server php php-mysql libapache2-mod-php`.
- Apache **auto-start** trên Ubuntu, **không** trên RHEL.
- **DocumentRoot Ubuntu** = `/var/www/html/`, user = `www-data`.
- WordPress: tạo DB → copy code → edit `wp-config.php` → restart Apache.
- Quên `libapache2-mod-php` → PHP file bị download thay chạy.
- Script `setup-wordpress.sh` plug vào Vagrant provisioner = auto LAMP+WP.

**Bài kế tiếp** → [Bài 5: Multi-VM Vagrantfile — web + DB cluster trong một file](05-multi-vm-vagrantfile.md)

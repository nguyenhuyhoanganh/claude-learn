# Bài 3: Website setup trên CentOS với httpd — server đầu tiên

Setup web server đầu tiên. Học pattern **Install → Configure → Deploy → Verify** sẽ dùng lại cho mọi service từ giờ.

## Apache httpd là gì?

> **httpd** (Apache HTTP Server) = web server mã nguồn mở phổ biến nhất 1995-2015, vẫn dùng nhiều. Trên CentOS/RHEL package tên `httpd`, trên Ubuntu/Debian tên `apache2`.

Apache competes với:
- **nginx** — nhanh hơn, mặc định cho dự án mới.
- **Caddy** — modern, auto-HTTPS.
- **IIS** — Windows.

Khoá này dùng Apache cho lab (đơn giản, có sẵn mọi distro).

## Pattern triển khai server — 4 bước

Mỗi service deploy theo 4 bước:

```text
1. INSTALL    — Cài package + dependency
2. CONFIGURE  — Start service, enable boot, set config
3. DEPLOY     — Đẩy data (HTML, app code) vào đúng path
4. VERIFY     — Test service hoạt động
```

Học pattern này 1 lần, áp dụng được cho **mọi service** trong sự nghiệp.

## Tạo VM cho lab

```bash
mkdir ~/vagrant-vms/finance && cd ~/vagrant-vms/finance
vagrant init eurolinux-vagrant/centos-stream-9
```

Edit Vagrantfile:

```ruby
Vagrant.configure("2") do |config|
  config.vm.box = "eurolinux-vagrant/centos-stream-9"
  config.vm.hostname = "finance"
  config.vm.network "private_network", ip: "192.168.56.22"
  config.vm.network "forwarded_port", guest: 80, host: 8080

  config.vm.provider "virtualbox" do |vb|
    vb.memory = 1024
    vb.cpus = 1
    vb.gui = false
  end
end
```

```bash
vagrant up
vagrant ssh
sudo -i                              # Chuyển root
```

## Bước 1: Install dependencies

```bash
# Cài httpd + tool hỗ trợ
yum install -y httpd wget vim unzip zip
```

Vì sao mỗi tool:
- **httpd** — web server chính.
- **wget** — download HTML template từ internet.
- **vim** — edit file.
- **unzip/zip** — giải nén template.

Đây là **best practice**: cài đủ dependency trước khi configure/deploy.

## Bước 2: Configure service

```bash
# Start ngay
systemctl start httpd

# Enable boot — VM restart cũng tự start
systemctl enable httpd

# Hoặc cả 2 cùng lúc
systemctl enable --now httpd

# Kiểm tra
systemctl status httpd
```

Output:

```text
● httpd.service - The Apache HTTP Server
   Loaded: loaded (/usr/lib/systemd/system/httpd.service; enabled; ...)
   Active: active (running) since ...
```

`active (running)` = service đang chạy. `enabled` = sẽ start lại khi reboot.

### Kiểm tra port

```bash
ss -tulnp | grep :80
# tcp   LISTEN  *:80   ...   users:(("httpd",...))
```

Httpd lắng nghe port 80 → ready.

### Disable firewall (lab only)

```bash
systemctl stop firewalld
systemctl disable firewalld
```

> **Production**: KHÔNG disable firewall. Mở port cụ thể:
>
> ```bash
> firewall-cmd --permanent --add-service=http
> firewall-cmd --permanent --add-service=https
> firewall-cmd --reload
> ```

Trong lab này tắt cho đơn giản.

## Bước 3: Verify default page

Lấy IP VM:

```bash
ip addr show
# enp0s3: 10.0.2.15  (NAT, không truy cập từ host)
# enp0s8: 192.168.56.22  (private network)
```

Trên **browser host**: `http://192.168.56.22` hoặc `http://localhost:8080` (forwarded port).

Thấy:

```text
Test Page for the Apache HTTP Server on Red Hat...
```

→ httpd hoạt động. Default page tự generate khi không có content.

## Bước 4: Deploy custom content

httpd serve mặc định folder: `/var/www/html/`. Đặt file ở đây → expose qua HTTP.

### Test với index.html đơn giản

```bash
cd /var/www/html
ls                                   # Rỗng (CentOS default)

# Tạo file
cat > index.html <<EOF
<!DOCTYPE html>
<html>
<head><title>My Site</title></head>
<body>
  <h1>Hello from $(hostname)</h1>
  <p>Setup successful!</p>
</body>
</html>
EOF

# Restart service (thực ra không cần với static file, nhưng good habit)
systemctl restart httpd
```

Refresh browser → thấy "Hello from finance".

### Deploy template từ internet

Sites như **tooplate.com**, **html5up.net** có template HTML free.

```bash
# Trong VM
cd /tmp

# Download template
wget https://www.tooplate.com/zip-templates/2128_tween_agency.zip

# Giải nén
unzip 2128_tween_agency.zip

# Vào folder
cd 2128_tween_agency

# Copy mọi file/folder vào /var/www/html
cp -rf * /var/www/html/

# Restart
systemctl restart httpd
```

Refresh browser → thấy template chuyên nghiệp.

### Cách lấy URL download

Tooplate có link redirect — click button "Download" trên browser sẽ trigger script download. Lấy direct URL:

1. Mở Brave/Chrome DevTools (F12) → Network tab.
2. Click "Download" trên page.
3. Trong Network tab thấy request file `.zip`.
4. Right-click → "Copy as cURL" hoặc "Copy URL".
5. Paste URL vào `wget` trong VM.

## Verify cuối

```bash
# Service running?
systemctl status httpd

# Port 80 listen?
ss -tulnp | grep :80

# Content có?
ls /var/www/html/

# Curl từ trong VM
curl http://localhost
# <html>...</html>

# Curl từ host (nếu forwarded port)
# Trên máy host:
curl http://localhost:8080
```

Mọi cái pass → setup thành công.

## Apache config quan trọng

```bash
ls /etc/httpd/
# conf/        ← Main config
# conf.d/      ← Drop-in config (vd ssl.conf)
# conf.modules.d/  ← Module load
# logs/        ← Symlink → /var/log/httpd/
```

### `/etc/httpd/conf/httpd.conf` — main config

```apache
Listen 80                           # Port

ServerName www.example.com:80
DocumentRoot "/var/www/html"        # Folder chứa content

<Directory "/var/www/html">
    AllowOverride None
    Require all granted             # Cho phép truy cập
</Directory>

ErrorLog "logs/error_log"
CustomLog "logs/access_log" combined
```

### Virtual hosts — nhiều site 1 server

```apache
# /etc/httpd/conf.d/site1.conf
<VirtualHost *:80>
    ServerName site1.example.com
    DocumentRoot /var/www/site1
    ErrorLog /var/log/httpd/site1-error.log
</VirtualHost>

# /etc/httpd/conf.d/site2.conf
<VirtualHost *:80>
    ServerName site2.example.com
    DocumentRoot /var/www/site2
    ErrorLog /var/log/httpd/site2-error.log
</VirtualHost>
```

1 server, nhiều domain. Phổ biến cho web hosting.

### Test config trước reload

```bash
httpd -t                            # Check syntax
# Syntax OK

# Nếu OK
systemctl reload httpd              # Reload không downtime
```

**Luôn test trước reload** — sai config → service down.

## Logs

```bash
# Access log
tail -f /var/log/httpd/access_log

# Error log
tail -f /var/log/httpd/error_log
```

Format access log mặc định (combined):

```text
192.168.56.1 - - [10/Jan/2025:14:32:15 +0000] "GET / HTTP/1.1" 200 1234 "-" "Mozilla/5.0..."
   │           │                                  │       │   │     │
   │           └ remote user                      │       │   │     └ User-Agent
   │ remote IP                                    │       │   └ Referer
                                                  │       └ Bytes sent
                                                  │ Status code (200, 404, 500...)
                                                  └ HTTP method + path + version
```

Phân tích log với combo bài 5 phase 4:

```bash
# Top IP truy cập
awk '{print $1}' /var/log/httpd/access_log | sort | uniq -c | sort -rn | head

# Top URL
awk '{print $7}' /var/log/httpd/access_log | sort | uniq -c | sort -rn | head

# Error 5xx
awk '$9 ~ /^5/' /var/log/httpd/access_log
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Quên enable service | VM reboot → web down | `systemctl enable --now httpd` |
| Firewall block port 80 | Browser không vào được | Stop firewall hoặc allow port |
| Permission `/var/www/html` sai | 403 Forbidden | `chmod 755`, `chown apache:apache` |
| SELinux block (RHEL) | 403 dù permission đúng | `chcon -R -t httpd_sys_content_t /var/www/html` hoặc `setenforce 0` (lab) |
| Quên restart sau update config | Config cũ vẫn chạy | `httpd -t && systemctl reload httpd` |
| File index.html sai tên (Index.html) | Default page hiện | Case-sensitive — `index.html` lowercase |
| Port 80 đã bị nginx chiếm | httpd start fail | Check `ss -tulnp :80` |

## SELinux trên RHEL/CentOS

SELinux có thể block httpd serve file mới copy:

```bash
# Check SELinux
getenforce
# Enforcing  ← Có thể block

# Set context đúng
chcon -R -t httpd_sys_content_t /var/www/html

# Hoặc disable tạm (lab)
setenforce 0

# Permanent disable
sed -i 's/SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config
# Reboot để hiệu lực
```

> Production: **không disable SELinux**. Set context đúng.

## Manual setup → tự động hoá

Sau khi làm manual 1 lần, **viết script** để lần sau auto. Đây chuẩn bị cho bài 5 (provisioning):

```bash
#!/bin/bash
# setup-website.sh
set -euo pipefail

# 1. Install
yum install -y httpd wget unzip vim

# 2. Configure
systemctl enable --now httpd
systemctl stop firewalld
systemctl disable firewalld

# 3. Deploy
cd /tmp
wget -q https://www.tooplate.com/zip-templates/2128_tween_agency.zip
unzip -o 2128_tween_agency.zip
cp -rf 2128_tween_agency/* /var/www/html/

# 4. Restart
systemctl restart httpd

# Verify
curl -sf http://localhost > /dev/null && echo "✓ Setup OK"
```

Lưu, chmod +x, chạy. Hoặc plug vào Vagrant provisioner.

## Cleanup

```bash
# Trong VM
exit

# Trên host
vagrant halt                         # Tạm tắt
# Hoặc
vagrant destroy -f                   # Xoá hẳn
```

## Tóm tắt bài 3

- Pattern deploy server: **Install → Configure → Deploy → Verify**.
- `yum install -y httpd` + `systemctl enable --now httpd` cho CentOS.
- Content ở **`/var/www/html/`**, file `index.html` là default.
- `firewalld` cần stop hoặc allow port 80.
- **SELinux** có thể block — chcon hoặc setenforce 0 (lab).
- Log access tại `/var/log/httpd/access_log`, error tại `error_log`.
- **`httpd -t`** test config trước reload.

**Bài kế tiếp** → [Bài 4: LAMP stack và WordPress trên Ubuntu](04-lamp-wordpress-ubuntu.md)

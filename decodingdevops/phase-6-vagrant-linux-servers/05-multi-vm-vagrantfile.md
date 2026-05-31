# Bài 5: Multi-VM Vagrantfile — web + DB cluster trong một file

App thực tế **không chạy trên 1 server**. Web tier + DB tier + cache tier — mỗi tier 1 VM. Multi-VM Vagrantfile cho phép quản lý cả cụm bằng **1 file + 1 lệnh**.

## Vì sao multi-VM?

Single-VM:
- Mọi service chen chúc 1 VM.
- Nếu MySQL crash → web cũng đụng.
- Không phản ánh production thật.

Multi-VM:
- Mỗi service VM riêng — isolation thật.
- Test network giữa tier (latency, firewall).
- Simulate production architecture.
- Practice cluster operations.

```text
+──────────────+         +──────────────+         +──────────────+
│ web01        │ ◄─────► │ db01         │         │ cache01      │
│ 192.168.56.10│  TCP/IP │ 192.168.56.20│         │ 192.168.56.30│
│ httpd/nginx  │         │ MySQL/Maria  │         │ Redis        │
+──────────────+         +──────────────+         +──────────────+
```

## Cú pháp multi-VM

```ruby
Vagrant.configure("2") do |config|

  config.vm.define "web01" do |web|
    web.vm.box = "ubuntu/jammy64"
    web.vm.hostname = "web01"
    web.vm.network "private_network", ip: "192.168.56.10"
    web.vm.provider "virtualbox" do |vb|
      vb.memory = 1024
      vb.cpus = 1
    end
  end

  config.vm.define "db01" do |db|
    db.vm.box = "eurolinux-vagrant/centos-stream-9"
    db.vm.hostname = "db01"
    db.vm.network "private_network", ip: "192.168.56.20"
    db.vm.provider "virtualbox" do |vb|
      vb.memory = 1024
      vb.cpus = 1
    end
  end

end
```

Key: `config.vm.define "<name>" do |<var>| ... end` cho mỗi VM.

## Lệnh multi-VM

```bash
# Up tất cả
vagrant up

# Up 1 VM cụ thể
vagrant up web01

# SSH (BẮT BUỘC chỉ tên VM)
vagrant ssh web01
vagrant ssh db01

# Status
vagrant status                       # Status mọi VM trong folder
vagrant global-status                # Mọi VM Vagrant trên máy

# Halt
vagrant halt                         # Tắt tất cả
vagrant halt cache01                 # Tắt 1 VM

# Destroy
vagrant destroy -f                   # Xoá tất cả
vagrant destroy -f db01              # Xoá 1 VM
```

`vagrant ssh` không có tên VM → lỗi `multi-machine environment, specify VM name`.

## Lab production-like 3-tier

```ruby
Vagrant.configure("2") do |config|

  # === Web tier — Ubuntu + Apache + PHP ===
  config.vm.define "web01" do |web|
    web.vm.box = "ubuntu/jammy64"
    web.vm.hostname = "web01"
    web.vm.network "private_network", ip: "192.168.56.41"
    web.vm.network "forwarded_port", guest: 80, host: 8081
    web.vm.provider "virtualbox" do |vb|
      vb.memory = 1024
      vb.cpus = 1
    end
    web.vm.provision "shell", inline: <<-SHELL
      apt update
      apt install -y apache2 php php-mysql libapache2-mod-php
      systemctl enable --now apache2
    SHELL
  end

  # === Cache tier — Redis ===
  config.vm.define "cache01" do |cache|
    cache.vm.box = "ubuntu/jammy64"
    cache.vm.hostname = "cache01"
    cache.vm.network "private_network", ip: "192.168.56.42"
    cache.vm.provider "virtualbox" do |vb|
      vb.memory = 512
      vb.cpus = 1
    end
    cache.vm.provision "shell", inline: <<-SHELL
      apt update
      apt install -y redis-server
      sed -i 's/^bind 127.0.0.1/bind 0.0.0.0/' /etc/redis/redis.conf
      systemctl restart redis-server
      systemctl enable redis-server
    SHELL
  end

  # === DB tier — CentOS + MariaDB ===
  config.vm.define "db01" do |db|
    db.vm.box = "eurolinux-vagrant/centos-stream-9"
    db.vm.hostname = "db01"
    db.vm.network "private_network", ip: "192.168.56.43"
    db.vm.provider "virtualbox" do |vb|
      vb.memory = 1024
      vb.cpus = 1
    end
    db.vm.provision "shell", inline: <<-SHELL
      yum install -y mariadb-server
      systemctl enable --now mariadb
      systemctl stop firewalld
      systemctl disable firewalld
      mysql -e "CREATE DATABASE myapp;"
      mysql -e "CREATE USER 'appuser'@'%' IDENTIFIED BY 'apppass';"
      mysql -e "GRANT ALL ON myapp.* TO 'appuser'@'%';"
      mysql -e "FLUSH PRIVILEGES;"
    SHELL
  end

end
```

`vagrant up` → có 3 VM full stack trong ~5 phút.

## Verify connectivity giữa VM

```bash
vagrant ssh web01

# Trong web01
ping 192.168.56.43                   # Reach db01
nc -zv 192.168.56.43 3306            # Test MySQL port
nc -zv 192.168.56.42 6379            # Test Redis port

# Test MySQL connect từ web → db
sudo apt install -y mysql-client
mysql -h 192.168.56.43 -u appuser -papppass myapp -e "SHOW TABLES;"

# Test Redis từ web → cache
sudo apt install -y redis-tools
redis-cli -h 192.168.56.42 PING
# PONG
```

## /etc/hosts — đặt hostname thay IP

Thay vì nhớ IP, dùng hostname:

```ruby
# Vagrantfile — provision cả 3 VM
config.vm.provision "shell", inline: <<-SHELL
  cat >> /etc/hosts <<EOF
192.168.56.41  web01
192.168.56.42  cache01
192.168.56.43  db01
EOF
SHELL
```

Sau đó:

```bash
ping db01                            # = ping 192.168.56.43
mysql -h db01 -u appuser -p
redis-cli -h cache01 PING
```

Hoặc plugin **vagrant-hostmanager** auto-sync:

```bash
vagrant plugin install vagrant-hostmanager
```

Vagrantfile:

```ruby
config.hostmanager.enabled = true
config.hostmanager.manage_host = true
config.hostmanager.manage_guest = true
```

## Loop pattern — nhiều VM cùng cấu hình

Khi cần 5 web server giống nhau:

```ruby
Vagrant.configure("2") do |config|
  (1..5).each do |i|
    config.vm.define "web0#{i}" do |web|
      web.vm.box = "ubuntu/jammy64"
      web.vm.hostname = "web0#{i}"
      web.vm.network "private_network", ip: "192.168.56.#{10+i}"
      web.vm.provider "virtualbox" do |vb|
        vb.memory = 1024
        vb.cpus = 1
      end
    end
  end
end
```

`vagrant up` → 5 VM: web01 (192.168.56.11), web02 (.12), ..., web05 (.15).

## DRY với hash + loop

```ruby
servers = [
  { name: "web01", ip: "192.168.56.41", box: "ubuntu/jammy64", memory: 1024 },
  { name: "cache01", ip: "192.168.56.42", box: "ubuntu/jammy64", memory: 512 },
  { name: "db01", ip: "192.168.56.43", box: "eurolinux-vagrant/centos-stream-9", memory: 1024 },
]

Vagrant.configure("2") do |config|
  servers.each do |s|
    config.vm.define s[:name] do |srv|
      srv.vm.box = s[:box]
      srv.vm.hostname = s[:name]
      srv.vm.network "private_network", ip: s[:ip]
      srv.vm.provider "virtualbox" do |vb|
        vb.memory = s[:memory]
        vb.cpus = 1
      end
    end
  end
end
```

Thêm VM = thêm 1 dòng hash. Sạch và scalable.

## Thứ tự up — quan trọng cho dependencies

`vagrant up` start VM theo **thứ tự khai báo**. Nếu web cần DB sẵn:

```ruby
# DB define TRƯỚC
config.vm.define "db01" do |db|
  # ...
end

# Web define SAU (start sau DB)
config.vm.define "web01" do |web|
  # ...
end
```

Vagrant không auto chờ DB ready — chỉ start VM. Trong provision script web phải retry connect.

## Use case không chỉ lab

Multi-VM Vagrantfile hữu ích cho:

- **Project lab end-to-end**: web + db + cache + LB (vd vProfile section 8).
- **Test cluster**: K8s 1 master + 3 worker.
- **Migration test**: source server + target server cùng lúc.
- **Microservice dev**: mỗi service 1 VM nhẹ.

## Lưu ý phân chia file

- **1 Vagrantfile per project** — không nhồi tất cả lab vào 1 file.
- Project khác → folder khác → Vagrantfile khác.
- Common pattern: `~/vagrant-vms/{project-name}/Vagrantfile`.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| 2 VM cùng IP | DHCP conflict | Mỗi VM IP unique |
| Quên tên VM khi `vagrant ssh` | Lỗi multi-machine | `vagrant ssh <name>` |
| Tổng RAM > host | Host swap nặng | Tổng VM RAM ≤ 70% host |
| `vagrant destroy` không chỉ tên | Xoá HẾT VM | Cẩn thận, hoặc dùng `<name>` |
| Provision DB chưa xong, web đã up | Web fail connect | Provision script retry |
| Box khác nhau → tải mỗi cái GB | Disk đầy | Reuse cùng box khi có thể |
| Network mode public bridged cho lab | IP từ router, conflict | Dùng private_network cho lab |
| Boot lúc → bootloader Linux conflict | VM treo | Stagger start hoặc start tuần tự |

## Workflow lab điển hình

```bash
# Sáng
mkdir ~/lab/3tier && cd ~/lab/3tier
vim Vagrantfile                       # Define multi-VM

vagrant up                            # Start cluster (~5 phút lần đầu)

# Làm việc
vagrant ssh web01
# ...
exit
vagrant ssh db01
# ...

# Trưa nghỉ
vagrant halt                          # Tạm tắt cả cluster

# Chiều
vagrant up                            # Resume (~1 phút)

# Cuối ngày
vagrant halt                          # Tắt giữ disk
# Hoặc:
vagrant destroy -f                    # Xoá hẳn nếu xong project
```

## AI Copilot giúp viết multi-VM

ChatGPT prompt:

> "Generate a multi-VM Vagrantfile with 3 VMs: web01 (Ubuntu 22.04), cache01 (Ubuntu 22.04), db01 (CentOS Stream 9). Use private network with static IPs 192.168.56.41-43. Set hostnames. Each VM 1GB RAM 1 CPU. Provision db01 with MariaDB install."

Output Vagrantfile rất gần production-ready. Verify lại syntax + IP + box name.

> **Cảnh báo**: AI có thể dùng box cũ/deprecated. Check tên box trên Vagrant Cloud trước khi dùng.

## Quick reference

```text
# Multi-VM
config.vm.define "web01" do |web|
  web.vm.box = "..."
  web.vm.hostname = "web01"
  web.vm.network "private_network", ip: "..."
  web.vm.provider "virtualbox" do |vb|
    vb.memory = 1024
  end
  web.vm.provision "shell", inline: "..."
end

# Loop
(1..N).each do |i|
  config.vm.define "node#{i}" do |n|
    n.vm.hostname = "node#{i}"
    ...
  end
end

# CLI
vagrant up [name]            Up all hoặc 1 VM
vagrant halt [name]
vagrant destroy -f [name]
vagrant ssh <name>           BẮT BUỘC tên VM
vagrant status               Status từng VM
```

## Tóm tắt bài 5

- **Multi-VM** = 1 Vagrantfile quản lý nhiều VM bằng `config.vm.define`.
- `vagrant up [name]` to start specific VM; không name = tất cả.
- **`vagrant ssh <name>` BẮT BUỘC** trong multi-VM.
- **Loop + hash** trong Ruby cho scalable định nghĩa VM.
- **`/etc/hosts`** hoặc plugin **vagrant-hostmanager** đặt tên thay IP.
- Tổng RAM VM ≤ 70% host để tránh swap.
- 1 project = 1 Vagrantfile = 1 folder. Đừng nhồi.

**Bài kế tiếp** → [Bài 6: Custom systemd unit file với Tomcat 10](06-systemctl-tomcat.md)

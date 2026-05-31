# Bài 2: Vagrant multi-VM setup cho 5 tier

Tạo 5 VM cùng lúc bằng 1 Vagrantfile. Đây là lab cho phase còn lại.

## Vagrantfile cho vProfile

`~/vprofile-lab/Vagrantfile`:

```ruby
Vagrant.configure("2") do |config|

  # ===== nginx web tier =====
  config.vm.define "web01" do |web|
    web.vm.box = "ubuntu/jammy64"
    web.vm.hostname = "web01"
    web.vm.network "private_network", ip: "192.168.56.11"
    web.vm.network "forwarded_port", guest: 80, host: 8081
    web.vm.provider "virtualbox" do |vb|
      vb.memory = 1024
      vb.cpus = 1
    end
  end

  # ===== Tomcat app tier =====
  config.vm.define "app01" do |app|
    app.vm.box = "eurolinux-vagrant/centos-stream-9"
    app.vm.hostname = "app01"
    app.vm.network "private_network", ip: "192.168.56.12"
    app.vm.provider "virtualbox" do |vb|
      vb.memory = 1536
      vb.cpus = 1
    end
  end

  # ===== Memcached =====
  config.vm.define "mc01" do |mc|
    mc.vm.box = "eurolinux-vagrant/centos-stream-9"
    mc.vm.hostname = "mc01"
    mc.vm.network "private_network", ip: "192.168.56.13"
    mc.vm.provider "virtualbox" do |vb|
      vb.memory = 512
      vb.cpus = 1
    end
  end

  # ===== RabbitMQ =====
  config.vm.define "rmq01" do |rmq|
    rmq.vm.box = "eurolinux-vagrant/centos-stream-9"
    rmq.vm.hostname = "rmq01"
    rmq.vm.network "private_network", ip: "192.168.56.14"
    rmq.vm.provider "virtualbox" do |vb|
      vb.memory = 768
      vb.cpus = 1
    end
  end

  # ===== MySQL =====
  config.vm.define "db01" do |db|
    db.vm.box = "eurolinux-vagrant/centos-stream-9"
    db.vm.hostname = "db01"
    db.vm.network "private_network", ip: "192.168.56.15"
    db.vm.provider "virtualbox" do |vb|
      vb.memory = 1024
      vb.cpus = 1
    end
  end

end
```

## /etc/hosts trên mỗi VM

Để gọi service bằng tên thay vì IP, sync hostname:

Thêm provision shell vào **mỗi VM**:

```ruby
config.vm.provision "shell", inline: <<-SHELL
  cat >> /etc/hosts <<EOF
192.168.56.11  web01
192.168.56.12  app01
192.168.56.13  mc01
192.168.56.14  rmq01
192.168.56.15  db01
EOF
SHELL
```

Sau đó từ app01 `ping db01` thay `ping 192.168.56.15`.

Hoặc plugin **vagrant-hostmanager**:

```bash
vagrant plugin install vagrant-hostmanager
```

Vagrantfile thêm:

```ruby
config.hostmanager.enabled = true
config.hostmanager.manage_host = false      # Không sửa host /etc/hosts
config.hostmanager.manage_guest = true
```

## Bring up

```bash
cd ~/vprofile-lab
vagrant up
```

Lần đầu: tải box (~1.5 GB) + tạo 5 VM = **15-25 phút**. Lần sau: ~5 phút.

Output cuối:

```text
==> web01: Machine booted and ready!
==> app01: Machine booted and ready!
==> mc01: Machine booted and ready!
==> rmq01: Machine booted and ready!
==> db01: Machine booted and ready!
```

## Verify

```bash
vagrant status
# Current machine states:
# web01    running (virtualbox)
# app01    running (virtualbox)
# mc01     running (virtualbox)
# rmq01    running (virtualbox)
# db01     running (virtualbox)
```

### SSH thử mỗi VM

```bash
vagrant ssh web01
hostname                  # web01
ip a | grep 192.168.56
# inet 192.168.56.11/24
ping -c 3 192.168.56.15   # → reach db01
exit

vagrant ssh db01
hostname
ip a | grep 192.168.56
exit
```

### Network connectivity matrix

```bash
# Vào app01
vagrant ssh app01
sudo -i

# Test reach mọi VM khác
for h in web01 mc01 rmq01 db01; do
    if ping -c 1 -W 2 $h &>/dev/null; then
        echo "✓ $h reachable"
    else
        echo "✗ $h NOT reachable"
    fi
done
```

Expect 4 ✓. Nếu fail:
- Check `/etc/hosts` đã update đúng.
- Check VM up bằng `vagrant status`.
- VirtualBox network adapter active?

## Resource monitoring

VM ăn nhiều RAM. Theo dõi:

```bash
# Trên host
# macOS
top -o mem
# Linux
free -h
# Windows
Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10
```

VirtualBox UI cũng hiện RAM/CPU mỗi VM.

Nếu host swap quá nhiều → giảm RAM VM hoặc destroy bớt.

## Tổ chức folder lab

```text
~/vprofile-lab/
├── Vagrantfile
├── README.md                ← Note lab
├── scripts/                 ← Provision scripts (bài 6)
│   ├── mysql.sh
│   ├── memcache.sh
│   ├── rabbitmq.sh
│   ├── tomcat.sh
│   └── nginx.sh
└── application.properties   ← Config app dùng
```

Commit folder này vào Git → version control lab setup.

## Cleanup lúc cần

```bash
vagrant halt                  # Tắt cả 5 (giữ disk)
vagrant up                    # Bật lại (nhanh ~3 phút)

vagrant destroy -f            # Xoá hết (recover by `vagrant up` từ Vagrantfile)
vagrant destroy -f db01       # Xoá 1 VM
vagrant up db01               # Recreate 1 VM
```

## Tips tăng tốc

### Linked clone

Mỗi VM share base disk → tiết kiệm disk + tải nhanh:

```ruby
config.vm.provider "virtualbox" do |vb|
  vb.linked_clone = true
end
```

### Box cache

Lần đầu Vagrant tải box. Tải xong cache ở `~/.vagrant.d/boxes/`. Lần sau VM mới reuse → instant.

### SSD recommendation

5 VM disk I/O nặng. **SSD/NVMe** giảm thời gian boot 3-5×.

### Disable GUI

```ruby
vb.gui = false
```

Headless = nhanh + tiết kiệm RAM (~50MB/VM).

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| 1 VM fail up | Vagrant continue with khác | Check `vagrant status`, `vagrant up <name>` retry |
| IP 192.168.56.x đã dùng | VBox refuse | Đổi IP hoặc xoá VM cũ |
| Box version cũ deprecated | Download fail | Update Vagrantfile box name |
| Quá nhiều VM cùng tải box | Mạng nghẽn | Stagger với `vagrant up web01`, sau là kế |
| Box CentOS Stream 9 không thấy ARM | Mac M-series fail | Dùng provider VMware Fusion + box ARM-compatible |

## Pause khi không dùng

Chuyển VM sang state suspend (RAM dump xuống disk, không tốn RAM):

```bash
vagrant suspend           # Pause
vagrant resume            # Resume nhanh hơn halt+up
```

Vì sao không dùng `halt` mỗi lần?
- `halt` shutdown sạch (an toàn, nhưng restart 1 phút).
- `suspend` đông cứng (resume ngay, nhưng tốn disk).

## Verify lần cuối

Sau khi mọi VM up + connect:

```bash
vagrant ssh app01
sudo -i

# Test reach tất cả
ping -c 1 db01 && echo "DB OK"
ping -c 1 mc01 && echo "Cache OK"
ping -c 1 rmq01 && echo "MQ OK"
ping -c 1 web01 && echo "Web OK"
```

5 ✓ → bài 3 setup data tier.

## Tóm tắt bài 2

- 1 Vagrantfile cho 5 VM: web01, app01, mc01, rmq01, db01.
- Web tier Ubuntu, các tier khác CentOS Stream 9.
- IP range `192.168.56.11-15` private network.
- Tổng RAM ~5 GB — cần host ≥ 12 GB.
- `/etc/hosts` hoặc plugin **vagrant-hostmanager** để gọi tên thay IP.
- `linked_clone` + box cache + headless cho tốc độ.
- `vagrant suspend/resume` nhanh hơn `halt/up`.

**Bài kế tiếp** → [Bài 3: Setup MySQL, Memcached, RabbitMQ data tier](03-mysql-memcache-rabbitmq.md)

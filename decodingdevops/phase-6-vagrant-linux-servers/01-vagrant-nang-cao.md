# Bài 1: Vagrant nâng cao — IP, RAM, CPU và network

Phase 3 đã giới thiệu Vagrant cơ bản. Bài này đào sâu **Vagrantfile syntax**, **network mode**, **resource control** — chuẩn bị cho multi-VM lab và setup server thực tế.

## Cleanup VM cũ trước khi bắt đầu

```bash
vagrant global-status                # List mọi VM Vagrant
vagrant global-status --prune        # Dọn entry stale (VM đã xoá tay)

# Vào folder VM và xoá
cd ~/vagrant-vms/centos
vagrant destroy --force
```

`global-status` show tất cả VM Vagrant trên máy nhưng có thể stale → dùng `--prune` để refresh.

## Vagrantfile syntax — anatomy chi tiết

`vagrant init <box>` tạo file mặc định với **nhiều comment**. Bản clean:

```ruby
Vagrant.configure("2") do |config|

  # === Box ===
  config.vm.box = "eurolinux-vagrant/centos-stream-9"
  config.vm.box_version = "9.0.5"    # Pin version (optional)

  # === Hostname ===
  config.vm.hostname = "web01"

  # === Network ===
  config.vm.network "private_network", ip: "192.168.56.10"
  # Hoặc bridged:
  # config.vm.network "public_network", bridge: "en0: Wi-Fi"

  # === Forward port ===
  config.vm.network "forwarded_port", guest: 80, host: 8080

  # === Synced folder ===
  config.vm.synced_folder "./app", "/var/www/html"

  # === Provider (VirtualBox / VMware) ===
  config.vm.provider "virtualbox" do |vb|
    vb.name = "centos-web01"
    vb.memory = 2048
    vb.cpus = 2
    vb.gui = false
  end

  # === Provisioning ===
  config.vm.provision "shell", inline: <<-SHELL
    yum install -y httpd
    systemctl enable --now httpd
  SHELL

end
```

### Cú pháp Ruby cốt lõi

- `do |x| ... end` = block với biến `x`. Mọi setting trong block apply cho `x`.
- `=` = set value.
- `#` = comment.
- `<<-SHELL ... SHELL` = here-doc cho string đa dòng.

Bạn không cần biết Ruby. Chỉ cần follow pattern: setting → giá trị.

## Hash comment vs uncomment

```ruby
# config.vm.network "public_network"      ← Bị disable (comment)
config.vm.network "public_network"        ← Active
```

Xoá `#` đầu dòng = enable. Thêm `#` = disable.

## Network mode trong Vagrant

### 1. NAT (mặc định)

Không khai báo gì = NAT. VM ra internet được, host SSH qua `vagrant ssh` (tự forward).

```ruby
# Không có config.vm.network = chỉ NAT
```

### 2. Private network (host-only)

VM có IP cố định, host truy cập VM, nhưng VM **không** thấy LAN ngoài:

```ruby
# Static IP
config.vm.network "private_network", ip: "192.168.56.10"

# Hoặc DHCP
config.vm.network "private_network", type: "dhcp"
```

IP range chuẩn cho VirtualBox: **192.168.56.0/24** (default host-only network).

### 3. Public network (bridged)

VM nhận IP từ router thật, hoạt động như device LAN bình thường:

```ruby
config.vm.network "public_network", bridge: "en0: Wi-Fi"
# Hoặc:
config.vm.network "public_network"     # Vagrant hỏi chọn adapter lúc up
```

Tìm tên adapter:
- macOS: `ifconfig` (vd `en0`).
- Linux: `ip a` (vd `eth0`, `wlp3s0`).
- Windows: VirtualBox UI → File → Host Network Manager.

### 4. Forwarded port

Forward port host → guest:

```ruby
config.vm.network "forwarded_port", guest: 80, host: 8080
config.vm.network "forwarded_port", guest: 3306, host: 13306
```

Test: `curl http://localhost:8080` từ host → đến nginx VM port 80.

### So sánh nhanh

| Mode | VM IP | Host thấy VM | VM ra internet | VM thấy LAN | Use case |
|---|---|---|---|---|---|
| NAT | 10.0.2.15 | Qua port forward | ✓ | ✗ | Default, đơn giản |
| Private network | 192.168.56.x | ✓ | Qua NAT (nếu kèm) | ✗ | Lab multi-VM isolated |
| Public (bridged) | LAN IP | ✓ (như device LAN) | ✓ | ✓ | Test như server thật |
| Forwarded port | n/a | localhost:N | n/a | n/a | Test web app từ browser host |

**Pattern phổ biến**: kết hợp **NAT + private network**. NAT cho internet, private cho VM-to-VM lab.

## Resource — RAM, CPU, disk

```ruby
config.vm.provider "virtualbox" do |vb|
  vb.name = "web01"               # Tên hiện trong VirtualBox UI
  vb.memory = 2048                # MB
  vb.cpus = 2
  vb.gui = false                  # Không hiện cửa sổ VM (headless)
  vb.linked_clone = true          # Disk linked clone (tiết kiệm space)

  # Disable USB
  vb.customize ["modifyvm", :id, "--usb", "off"]

  # Network speed
  vb.customize ["modifyvm", :id, "--nictype1", "virtio"]

  # Resize disk (cần plugin vagrant-disksize)
  # config.disksize.size = "50GB"
end
```

### Resource cho VMware (Mac M-series)

```ruby
config.vm.provider "vmware_desktop" do |v|
  v.memory = 2048
  v.cpus = 2
  v.gui = false
end
```

### Cross-platform Vagrantfile

Hỗ trợ cả VirtualBox và VMware trong 1 file:

```ruby
config.vm.provider "virtualbox" do |vb|
  vb.memory = 2048
  vb.cpus = 2
end

config.vm.provider "vmware_desktop" do |v|
  v.memory = 2048
  v.cpus = 2
end
```

Vagrant pick provider dựa trên `--provider` flag hoặc env `VAGRANT_DEFAULT_PROVIDER`.

## Hostname

```ruby
config.vm.hostname = "web01"
```

Set hostname **trong** VM. Khác `vb.name` là tên hiện trong VirtualBox.

Vào VM kiểm tra:

```bash
hostname
# web01

cat /etc/hostname
# web01
```

## Test setup

```bash
mkdir ~/vagrant-vms/myvm && cd ~/vagrant-vms/myvm
vagrant init eurolinux-vagrant/centos-stream-9
vim Vagrantfile                       # Sửa theo nhu cầu
vagrant up
vagrant ssh

# Trong VM
ip addr show                          # Check IP
free -m                               # Check RAM
nproc                                 # Check CPU
cat /etc/hostname                     # Check hostname
exit
```

## Provider settings nâng cao

### Disable shared default folder

```ruby
config.vm.synced_folder ".", "/vagrant", disabled: true
```

Mặc định Vagrant mount folder chứa Vagrantfile vào `/vagrant`. Disable nếu không cần.

### Custom share folder

```ruby
config.vm.synced_folder "./app", "/var/www/html"
config.vm.synced_folder "./data", "/opt/data", create: true, owner: "vagrant", group: "vagrant"
config.vm.synced_folder ".", "/vagrant", type: "rsync",
                        rsync__exclude: [".git/", "node_modules/"]
```

Bài 2 sẽ deep-dive synced folder.

### SSH config

```ruby
config.ssh.username = "vagrant"
config.ssh.password = "vagrant"     # Mặc định
config.ssh.insert_key = true        # Tạo key riêng cho VM
config.ssh.forward_agent = true     # Forward agent từ host
```

### VM start options

```ruby
config.vm.boot_timeout = 600         # 10 phút thay vì 5
config.vm.graceful_halt_timeout = 60
```

## Vagrantfile cho production-like lab

```ruby
Vagrant.configure("2") do |config|
  config.vm.box = "eurolinux-vagrant/centos-stream-9"
  config.vm.box_check_update = false        # Đừng check update mỗi vagrant up
  config.vm.hostname = "web01"

  # NAT giữ default
  # Private network với static IP
  config.vm.network "private_network", ip: "192.168.56.10"

  # Forward port web
  config.vm.network "forwarded_port", guest: 80, host: 8080

  # Synced folder
  config.vm.synced_folder "./html", "/var/www/html", create: true

  config.vm.provider "virtualbox" do |vb|
    vb.name = "web01"
    vb.memory = 2048
    vb.cpus = 2
    vb.gui = false
    vb.linked_clone = true
    vb.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
  end

  # Auto-install package
  config.vm.provision "shell", inline: <<-SHELL
    set -e
    yum install -y httpd
    systemctl enable --now httpd
    systemctl stop firewalld
    systemctl disable firewalld
    echo "VM ready at $(hostname)" > /var/www/html/index.html
  SHELL
end
```

`vagrant up` → 2 phút sau có VM CentOS với httpd chạy, accessible từ:
- VM: `192.168.56.10`
- Host browser: `http://localhost:8080`

## Vagrant + AI Copilot

GitHub Copilot có thể **viết Vagrantfile** từ prompt:

```ruby
# Vagrantfile with Ubuntu 22.04, 2 GB RAM, 2 CPU, static IP 192.168.56.20, bridged adapter
```

Gõ comment trên → Copilot suggest cả block. Verify lại syntax, không trust mù.

Hoặc ChatGPT prompt: "Generate Vagrantfile for Ubuntu 22.04 with 2GB RAM, 2 CPU, private static IP 192.168.56.20, provision installing nginx."

Đây là **bài tập prompt engineering** — diễn đạt chính xác requirements.

## Vagrant plugin hữu ích

```bash
vagrant plugin install vagrant-vbguest        # Auto-update VirtualBox Guest Additions
vagrant plugin install vagrant-disksize       # Resize disk
vagrant plugin install vagrant-hostmanager    # Sync /etc/hosts giữa các VM
vagrant plugin install vagrant-reload         # Restart VM trong provision
vagrant plugin install vagrant-cachier        # Cache package download
```

```bash
vagrant plugin list                           # List installed
vagrant plugin uninstall vagrant-vbguest      # Gỡ
vagrant plugin update                         # Update tất cả
```

## Bẫy thường gặp

| Bẫy | Triệu chứng | Giải pháp |
|---|---|---|
| Quên uncomment | Setting không hiệu lực | Bỏ `#` đầu dòng |
| Indent sai | Vagrantfile parse error | Dùng space đều đặn, không tab |
| 2 VM cùng IP private | DHCP conflict | Mỗi VM IP riêng |
| `vagrant up` chậm | Box download lần đầu | Cache box dùng lại |
| IP private không trong 192.168.56.0/24 | VirtualBox refuse | Stick với 56.x default |
| Memory tổng VM > host | Host swap nặng | Giới hạn ≤ 70% host RAM |
| Quên `vagrant reload` sau sửa Vagrantfile | Setting cũ vẫn áp dụng | Reload sau mọi thay đổi |
| Provision chạy 1 lần rồi không | Default `run: "once"` | Thêm `run: "always"` hoặc `vagrant provision` |

## Quick reference

```text
Network:
  config.vm.network "private_network", ip: "192.168.56.10"
  config.vm.network "public_network", bridge: "en0"
  config.vm.network "forwarded_port", guest: 80, host: 8080

Resource:
  config.vm.provider "virtualbox" do |vb|
    vb.memory = 2048
    vb.cpus = 2
    vb.gui = false
  end

Hostname:
  config.vm.hostname = "web01"

Synced folder:
  config.vm.synced_folder "./app", "/var/www/html"

Provision shell:
  config.vm.provision "shell", inline: "yum install -y httpd"
  config.vm.provision "shell", path: "setup.sh"
```

## Tóm tắt bài 1

- Vagrantfile = Ruby DSL với `Vagrant.configure("2") do |config| ... end`.
- 4 network mode: NAT (default), private (host-only), public (bridged), forwarded_port.
- IP private chuẩn: `192.168.56.x`.
- Resource: `vb.memory`, `vb.cpus`, `vb.gui = false` cho headless.
- Plugin: vbguest, disksize, hostmanager hữu ích.
- Sau sửa Vagrantfile: `vagrant reload`.

**Bài kế tiếp** → [Bài 2: Synced folder và Provisioning — auto cài app khi VM up](02-synced-folder-provisioning.md)

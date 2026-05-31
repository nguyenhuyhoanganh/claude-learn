# Bài 4: Vagrant — tự động hoá toàn bộ vòng đời VM

Bài 3 bạn tạo 2 VM bằng tay, mất khoảng 1 giờ. Tưởng tượng cần 10 VM cho lab → 5 tiếng. Tưởng tượng đồng nghiệp cần lab giống bạn → bạn viết tài liệu 10 trang, họ vẫn sai bước. Đây là vấn đề Vagrant giải.

## Vagrant là gì?

> **Vagrant** = tool **declarative** mô tả VM trong **file text**, tự động tạo/cấu hình/xoá VM qua **lệnh CLI đơn giản**.

3 từ khoá:
- **Declarative**: bạn nói **"cái gì"** (Ubuntu 22, 2 GB RAM, IP `192.168.56.10`), Vagrant lo **"như thế nào"**.
- **Text file**: cấu hình version-controlled trong Git.
- **CLI**: `vagrant up`, `vagrant ssh`, `vagrant destroy` — 3 lệnh chính.

Vagrant **không** phải hypervisor. Nó **gọi** hypervisor (VirtualBox, VMware, Hyper-V, libvirt). Đây là điểm gây nhầm lẫn lớn nhất.

```text
                Bạn viết Vagrantfile
                       │
                       │ vagrant up
                       ▼
                +────────────+
                |  Vagrant   |
                +─────┬──────+
                      │ gọi API hypervisor
                      ▼
              +────────────────+
              |   VirtualBox   | (hoặc VMware Fusion/Hyper-V/KVM)
              +───────┬────────+
                      │ tạo VM
                      ▼
              +────────────────+
              |  Guest OS chạy |
              +────────────────+
```

## Vấn đề Vagrant giải

| Tạo thủ công | Tạo bằng Vagrant |
|---|---|
| Download ISO 1-2 GB | Dùng **box** ready-made (đã cài OS sẵn) |
| Click qua wizard 10 bước | 1 lệnh `vagrant init` + `vagrant up` |
| 30-60 phút/VM | **1-3 phút/VM** |
| Khó share | Push Vagrantfile lên Git → đồng nghiệp clone là chạy |
| Sai khi setup tay | Repeatable mỗi lần |
| Khó multi-VM | 1 file Vagrantfile mô tả 10 VM |
| Provision (cài app) thủ công | Vagrant tự chạy script provision |

## Box — viên gạch xây dựng

**Box** = file `.box` (thực chất `.tar.gz`) chứa:
- Disk image VM **đã cài OS sẵn**.
- Metadata (network, ssh user, default password).
- Hỗ trợ 1 hoặc nhiều hypervisor.

Box có ở **HashiCorp Vagrant Cloud** (`app.vagrantup.com` / `portal.cloud.hashicorp.com`):
- `ubuntu/jammy64` — Ubuntu 22.04 official.
- `bento/ubuntu-22.04` — community, có thêm tool.
- `eurolinux-vagrant/centos-stream-9` — CentOS Stream 9.
- `generic/centos9` — generic.
- `hashicorp/bionic64` — Ubuntu 18.04 (legacy).
- `windowsserver/2022` — Windows Server (cần Workstation/Hyper-V).

Cộng đồng có **thousands of boxes** — tìm theo OS + provider phù hợp.

### Lifecycle box

```text
vagrant box add <name>      ← Download về local (~/.vagrant.d/boxes/)
vagrant box list             ← Liệt kê
vagrant box update           ← Update version mới
vagrant box remove <name>    ← Xoá
vagrant box prune            ← Xoá version cũ
```

Box cache ở `~/.vagrant.d/boxes/` — dùng cho mọi project.

## Lệnh Vagrant cốt lõi

```text
vagrant init <box>           Tạo Vagrantfile mới với box chỉ định
vagrant up                   Tạo + start VM (theo Vagrantfile)
vagrant ssh                  SSH vào VM
vagrant halt                 Shutdown VM
vagrant reload               Restart + apply Vagrantfile mới
vagrant destroy              Xoá VM (KHÔNG xoá box)
vagrant status               Trạng thái VM trong folder hiện tại
vagrant global-status        Trạng thái MỌI VM Vagrant trên máy
vagrant global-status --prune  Dọn entry stale (VM đã xoá tay)
vagrant suspend / resume     Pause/resume VM (giữ RAM)
vagrant provision            Chạy lại script provision (không tạo VM mới)
vagrant snapshot save NAME   Tạo snapshot
vagrant snapshot restore NAME Restore snapshot
```

## Cài Vagrant (đã làm phase 2)

```bash
# Windows
choco install vagrant -y

# macOS Intel
brew install --cask vagrant

# macOS M-series (ARM)
brew install vagrant   # Vagrant CLI có sẵn cho ARM, dùng VMware Fusion provider
```

Verify:

```bash
vagrant --version
# Vagrant 2.4.x
```

## Workflow tạo VM đầu tiên

### Bước 1: Tạo folder project

```bash
mkdir -p ~/vagrant-vms/centos
cd ~/vagrant-vms/centos
```

Mỗi VM nên có **folder riêng**. Vagrantfile + state đều ở đó.

### Bước 2: Init box

```bash
vagrant init eurolinux-vagrant/centos-stream-9
```

Tạo file `Vagrantfile` trong folder hiện tại với mặc định.

### Bước 3: Up

```bash
vagrant up
```

Lần đầu: tải box ~500 MB → tạo VM → boot → cài VBoxGuestAdditions → ready.

Lần sau: dùng box đã cache → 1-2 phút.

### Bước 4: SSH

```bash
vagrant ssh
# Bạn đang ở trong VM với user `vagrant`
# Đã có sẵn key SSH, password mặc định "vagrant"
```

```bash
# Bên trong VM:
whoami       # vagrant
sudo -i      # chuyển sang root
exit         # về vagrant user
exit         # ra khỏi VM
```

### Bước 5: Halt / Destroy

```bash
vagrant halt       # tắt nhưng giữ disk
vagrant up         # bật lại

vagrant destroy    # xoá hẳn VM (không xoá box)
vagrant destroy -f # force, không hỏi y/n
```

## Anatomy of Vagrantfile

`vagrant init` tạo file mặc định với **rất nhiều comment**. Bản gọn:

```ruby
# Vagrantfile
Vagrant.configure("2") do |config|
  # 1. Box source
  config.vm.box = "eurolinux-vagrant/centos-stream-9"

  # 2. Hostname
  config.vm.hostname = "web01"

  # 3. Network
  config.vm.network "private_network", ip: "192.168.56.10"
  # Hoặc bridged:
  # config.vm.network "public_network", bridge: "en0: Wi-Fi"

  # 4. Forwarded port (host -> guest)
  config.vm.network "forwarded_port", guest: 80, host: 8080

  # 5. Shared folder
  config.vm.synced_folder "./app", "/var/www/html"

  # 6. Provider settings (CPU/RAM)
  config.vm.provider "virtualbox" do |vb|
    vb.name = "centos-web01"
    vb.memory = 2048
    vb.cpus = 2
  end

  # 7. Provisioning (chạy sau khi VM up lần đầu)
  config.vm.provision "shell", inline: <<-SHELL
    yum install -y httpd
    systemctl enable --now httpd
    echo "Hello from $(hostname)" > /var/www/html/index.html
  SHELL
end
```

Mỗi section có ý nghĩa:

| Section | Mục đích |
|---|---|
| `config.vm.box` | Image gốc |
| `config.vm.hostname` | Hostname trong guest |
| `config.vm.network` | NIC: private (host-only), public (bridged), forwarded_port |
| `config.vm.synced_folder` | Share folder giữa host và guest |
| `config.vm.provider` | CPU, RAM, settings hypervisor-specific |
| `config.vm.provision` | Script chạy sau provision lần đầu (shell, Ansible, Chef) |

## Network mode trong Vagrant

| Mode | Vagrantfile | Khi nào dùng |
|---|---|---|
| **NAT** (default) | (không khai báo) | VM ra internet, host SSH qua `vagrant ssh` |
| **Private network** | `private_network, ip: "192.168.56.10"` | VM-to-VM lab, host truy cập VM nhưng không lộ ra LAN |
| **Public network (bridged)** | `public_network, bridge: "en0"` | VM nhận IP từ router, như device thật |
| **Forwarded port** | `forwarded_port, guest: 80, host: 8080` | Test web app: localhost:8080 → VM:80 |

Khoá này dùng `private_network` chủ yếu (multi-VM lab) và `forwarded_port` (web test).

## Multi-VM Vagrantfile

Vagrant có thể quản nhiều VM trong **một file**:

```ruby
Vagrant.configure("2") do |config|

  # Web server
  config.vm.define "web01" do |web|
    web.vm.box = "eurolinux-vagrant/centos-stream-9"
    web.vm.hostname = "web01"
    web.vm.network "private_network", ip: "192.168.56.10"
    web.vm.provider "virtualbox" do |vb|
      vb.memory = 1024
    end
  end

  # Database server
  config.vm.define "db01" do |db|
    db.vm.box = "ubuntu/jammy64"
    db.vm.hostname = "db01"
    db.vm.network "private_network", ip: "192.168.56.11"
    db.vm.provider "virtualbox" do |vb|
      vb.memory = 2048
    end
  end

  # Cache server
  config.vm.define "cache01" do |cache|
    cache.vm.box = "ubuntu/jammy64"
    cache.vm.hostname = "cache01"
    cache.vm.network "private_network", ip: "192.168.56.12"
    cache.vm.provider "virtualbox" do |vb|
      vb.memory = 512
    end
  end

end
```

Lệnh:

```bash
vagrant up              # Tạo cả 3 VM
vagrant up web01        # Chỉ tạo web01
vagrant ssh db01        # SSH vào db01
vagrant halt cache01    # Tắt cache01
vagrant destroy -f      # Xoá cả 3
```

Đây là **template cho lab multi-tier** xuất hiện liên tục từ section 06 đến 08.

## Provisioning — cài app tự động

Một trong các sức mạnh lớn nhất của Vagrant: **provision script chạy tự động** sau khi VM lên. Ví dụ cài LAMP stack:

```ruby
config.vm.provision "shell", inline: <<-SHELL
  set -e
  apt-get update
  apt-get install -y apache2 mysql-server php libapache2-mod-php php-mysql
  systemctl enable --now apache2 mysql
  echo "<?php phpinfo(); ?>" > /var/www/html/info.php
SHELL
```

Hoặc dùng file riêng:

```ruby
config.vm.provision "shell", path: "scripts/setup-web.sh"
```

Vagrant cũng hỗ trợ **Ansible playbook**, **Chef recipe**, **Puppet manifest** trực tiếp:

```ruby
config.vm.provision "ansible_local", playbook: "playbook.yml"
```

## Vagrantfile chuyên nghiệp — best practices

```ruby
Vagrant.configure("2") do |config|

  # Plugin check
  required_plugins = %w(vagrant-vbguest)
  required_plugins.each do |plugin|
    unless Vagrant.has_plugin?(plugin)
      raise "Plugin #{plugin} chưa cài. Chạy: vagrant plugin install #{plugin}"
    end
  end

  # Box version pin
  config.vm.box = "ubuntu/jammy64"
  config.vm.box_version = "20240301.0.0"   # Pin version, tránh surprise update

  # Disable insecure default key (Vagrant tự tạo key SSH riêng)
  config.ssh.insert_key = true

  # Sync folder chỉ-rw cần thiết
  config.vm.synced_folder ".", "/vagrant", type: "rsync", rsync__exclude: [".git/", "node_modules/"]

  config.vm.provider "virtualbox" do |vb|
    vb.cpus = 2
    vb.memory = 2048
    vb.gui = false
    # Tăng tốc cho dev
    vb.linked_clone = true
    vb.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
  end

  # Provision idempotent
  config.vm.provision "shell", path: "provision.sh", run: "always"

end
```

## Workflow phổ biến

```text
1. mkdir myproject/  ;  cd myproject/
2. vagrant init <box>                  ← Vagrantfile mặc định
3. Edit Vagrantfile (CPU, RAM, network, provision script)
4. vagrant up                          ← Tạo VM
5. vagrant ssh                         ← Test
6. Sửa code/config trong VM, hoặc edit Vagrantfile
7. vagrant reload --provision          ← Apply config mới
8. Commit Vagrantfile vào Git
9. (đồng nghiệp) git clone + vagrant up → giống hệt
10. Xong việc:  vagrant halt  (tạm) hoặc  vagrant destroy  (xoá hẳn)
```

## Vagrant vs Terraform vs Ansible

Câu hỏi gây tranh cãi:

| Tool | Mục đích chính | Khi nào |
|---|---|---|
| **Vagrant** | Dev VM **local** | Lab cá nhân, demo, training |
| **Terraform** | Tạo infra **cloud** (AWS, GCP, Azure) | Production cloud |
| **Ansible** | **Cấu hình** server đã tồn tại (cài app) | Mọi nơi sau khi server có |

Cùng dùng được — trong khoá này:
- Lab cá nhân (section 03, 06, 08): Vagrant.
- Production cloud (section 21): Terraform.
- Cài app/middleware (section 22): Ansible.

Terraform có thể tạo VM trên VirtualBox không? Có (qua provider community) nhưng vụng. Vagrant tốt hơn cho local.

## Bẫy thường gặp với Vagrant

| Bẫy | Triệu chứng | Giải pháp |
|---|---|---|
| Quên `cd` vào folder Vagrantfile | `vagrant up` không thấy gì | `cd` vào đúng folder |
| 2 VM cùng IP private | Conflict | Đổi IP, IP phải unique trong subnet 192.168.56.0/24 |
| `vagrant up` báo "VBoxManage: not found" | VirtualBox không trong PATH | Add VirtualBox bin vào PATH |
| Provision chạy 1 lần rồi không bao giờ | Default `run: "once"` | Thêm `run: "always"` |
| Box ngày càng cũ | Default không auto-update | `vagrant box update` định kỳ |
| Disk VM đầy sau nhiều `up`/`destroy` | Snapshot/temp file rác | `vagrant destroy` + `vagrant box prune` |
| VM IP `0.0.0.0` mãi | DHCP không phản hồi | Restart, hoặc đổi sang private_network với IP cố định |
| Lỗi `schannel: InitializeSecurityContext` (Win) | Antivirus chặn TLS | Tắt antivirus tạm khi tải box |
| VPN làm `vagrant up` fail | VPN route đè bridged | Tắt VPN khi up box |

## Production: Khi nào KHÔNG dùng Vagrant?

Vagrant là tool **dev-time**. Không dùng cho:
- **Production VM** trên server thật — dùng Ansible + cloud-init.
- **Cluster K8s production** — dùng Terraform + K8s tooling.
- **CI/CD pipeline** chạy build — dùng container (Docker) thay vì VM.

Vagrant **chỉ** ưu thế cho **dev local** và **training**.

## Tóm tắt bài 4

- Vagrant = wrapper text-based quanh hypervisor → tạo VM declarative.
- **Box** = template VM cộng đồng đóng gói sẵn (Vagrant Cloud).
- 3 lệnh quan trọng nhất: `vagrant up`, `vagrant ssh`, `vagrant destroy`.
- Vagrantfile version-controlled → lab reproducible 100%.
- **Multi-VM** trong 1 file → lab phức tạp (web + DB + cache) một lệnh.
- Provision tự động cài app → idempotent với `run: "always"`.
- Tool **dev-time** — production dùng Terraform/Ansible.

**Bài kế tiếp** → [Bài 5: VM trên Mac M1/M2/M3 — VMware Fusion + Vagrant provider](05-vm-mac-m1-vmware-fusion.md)

# Bài 2: Synced folder và Provisioning — tự động cài app khi VM up

Vagrant **mạnh** không chỉ vì tạo VM nhanh. Sức mạnh thật ở **provisioning** — VM tự cài đặt app khi `vagrant up`. Đây là **prototype của Infrastructure as Code** mà Ansible/Terraform sau này làm scale lên.

## Synced folder — share file giữa host và VM

Mặc định Vagrant mount folder chứa Vagrantfile vào `/vagrant` trong VM:

```bash
# Trên host
mkdir myvm && cd myvm
echo "from host" > greeting.txt
vagrant init eurolinux-vagrant/centos-stream-9
vagrant up
vagrant ssh

# Trong VM
ls /vagrant
# Vagrantfile  greeting.txt   ← Cùng folder host!
```

Edit ở host → reflect VM ngay. Đây là **dev workflow tốt nhất**: code trên VS Code host, chạy trong VM.

### Custom synced folder

```ruby
config.vm.synced_folder "./app", "/var/www/html"
config.vm.synced_folder "../shared", "/opt/shared"
config.vm.synced_folder ".", "/code", create: true, owner: "vagrant", group: "vagrant"
```

Options:
- `create: true` — tạo folder host nếu chưa có.
- `owner` / `group` — set ownership trong VM.
- `mount_options: ["dmode=755","fmode=644"]` — set permission.

### Sync type

Mặc định **VirtualBox shared folder** — bidirectional realtime, có lag.

```ruby
config.vm.synced_folder "./code", "/code", type: "rsync"
```

| Type | Đặc điểm |
|---|---|
| **virtualbox** (default) | Bidirectional, real-time, slow với folder lớn |
| **rsync** | One-way (host → VM), nhanh, không bidirectional |
| **nfs** | Linux/Mac host, nhanh hơn virtualbox |
| **smb** | Windows host, cần admin |

`rsync` cần manual sync:

```bash
vagrant rsync               # Sync 1 lần
vagrant rsync-auto          # Watch & sync liên tục
```

### Disable default sync

```ruby
config.vm.synced_folder ".", "/vagrant", disabled: true
```

Hữu ích khi folder Vagrantfile có file lớn không cần trong VM.

## Provisioning — auto cài app

Provisioning chạy lệnh **trong VM** sau khi boot lần đầu (`vagrant up`).

### Shell inline

```ruby
config.vm.provision "shell", inline: <<-SHELL
  yum install -y httpd
  systemctl enable --now httpd
SHELL
```

Pros: ngắn, đơn giản.
Cons: khó test, syntax mixing.

### Shell file

`provision.sh`:

```bash
#!/bin/bash
set -euo pipefail

yum install -y httpd vim wget
systemctl enable --now httpd
systemctl stop firewalld
systemctl disable firewalld
echo "<h1>Hello from $(hostname)</h1>" > /var/www/html/index.html
```

Vagrantfile:

```ruby
config.vm.provision "shell", path: "provision.sh"
```

Pros: editor highlight, test được như script thường, version control sạch.

### Privileged vs non-privileged

```ruby
# Mặc định privileged (sudo)
config.vm.provision "shell", inline: "whoami"
# → root

# Không privileged
config.vm.provision "shell", privileged: false, inline: "whoami"
# → vagrant
```

### Run modes

```ruby
config.vm.provision "shell",
  inline: "echo hello",
  run: "always"          # Mỗi lần `vagrant up`/`reload`
  # run: "once"          # Default — chỉ lần đầu
  # run: "never"         # Manual qua `vagrant provision`
```

### Multi-provisioner

Vagrantfile có thể có **nhiều provision** chạy tuần tự:

```ruby
config.vm.provision "shell", inline: "yum install -y httpd"

config.vm.provision "file", source: "site/index.html", destination: "/tmp/index.html"

config.vm.provision "shell", inline: "cp /tmp/index.html /var/www/html/"

config.vm.provision "shell", inline: "systemctl restart httpd"
```

Chạy theo thứ tự khai báo.

### Named provisioner

```ruby
config.vm.provision "install", type: "shell", inline: "yum install -y httpd"
config.vm.provision "deploy", type: "shell", inline: "cp ..."

# Chạy chỉ 1 provisioner
vagrant provision --provision-with deploy
```

## File provisioner — copy file vào VM

```ruby
config.vm.provision "file",
  source: "./config/nginx.conf",
  destination: "/tmp/nginx.conf"
```

Sau đó `shell` copy vào nơi cần (vì `file` không có quyền sudo):

```ruby
config.vm.provision "shell", inline: "mv /tmp/nginx.conf /etc/nginx/nginx.conf"
```

## Ansible provisioner — bridge sang phase 22

```ruby
config.vm.provision "ansible_local",
  playbook: "playbook.yml"
```

`ansible_local` chạy Ansible **trong VM** (không cần cài Ansible trên host). Hữu ích cho cross-platform host.

Hoặc `ansible` chạy từ host:

```ruby
config.vm.provision "ansible",
  playbook: "playbook.yml",
  inventory_path: "inventory"
```

## Re-provision

```bash
vagrant provision                    # Chạy lại provisioner
vagrant provision --provision-with deploy
vagrant reload --provision           # Restart + provision
```

Hoặc:

```bash
vagrant destroy -f && vagrant up     # Recreate VM từ đầu — chắc chắn idempotent
```

## Idempotency — chạy nhiều lần không phá

Script provision nên **idempotent** — chạy 1 lần hay 100 lần, kết quả như nhau.

❌ Không idempotent:

```bash
echo "user vagrant ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
# Mỗi lần chạy → thêm 1 dòng → file phình
```

✓ Idempotent:

```bash
grep -q "user vagrant ALL=(ALL) NOPASSWD: ALL" /etc/sudoers \
  || echo "user vagrant ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers
```

Hoặc dùng tool chuyên (Ansible) — idempotent by design.

## Pattern: install + configure + deploy

Quy trình deploy server thành **4 bước** tách bạch trong provision:

```bash
#!/bin/bash
set -euo pipefail

# === 1. INSTALL ===
yum install -y httpd wget unzip vim

# === 2. CONFIGURE ===
systemctl enable --now httpd
systemctl stop firewalld
systemctl disable firewalld

# === 3. DEPLOY DATA ===
cd /tmp
wget -q https://example.com/template.zip
unzip -o template.zip
cp -r template/* /var/www/html/

# === 4. RESTART ===
systemctl restart httpd
```

Đây là pattern bạn sẽ thấy lại trong Ansible playbook (phase 22).

## Workflow đầy đủ

```bash
# 1. Tạo folder + Vagrantfile + script
mkdir my-website && cd my-website
vagrant init eurolinux-vagrant/centos-stream-9
vim Vagrantfile                       # Edit với provisioner
vim provision.sh                      # Script chi tiết

# 2. Up VM (auto provision)
vagrant up

# 3. Test
curl http://192.168.56.10
vagrant ssh                           # Vào kiểm tra

# 4. Sửa code/script → reload + reprovision
vim provision.sh
vagrant provision

# 5. Cleanup
vagrant destroy -f
```

## Trade-off: shell provision vs Ansible

| | Shell | Ansible |
|---|---|---|
| Học curve | Thấp | Cao hơn |
| Idempotency | Manual (grep `||`) | Built-in |
| Cross-OS | Khó | OS-agnostic modules |
| Order/dependency | Tuần tự | Tags, roles |
| Test | Khó | Molecule |
| Scale | Khó | Tốt |

**Lab học**: shell đủ.
**Production**: Ansible.

Khoá này dùng shell cho phase 6, sang phase 22 chuyển sang Ansible.

## Bẫy thường gặp

| Bẫy | Hậu quả | Giải pháp |
|---|---|---|
| Provision chạy 1 lần rồi quên | Sửa script không hiệu lực | `vagrant provision` hoặc `run: "always"` |
| Sửa Vagrantfile, quên reload | Setting cũ | `vagrant reload --provision` |
| Folder synced với permission sai | App không đọc được | `owner: "..." group: "..."` |
| Provision script không idempotent | Chạy lại fail/lặp | grep check trước, dùng Ansible |
| Synced folder NFS chậm trên Mac M-series | `vagrant up` lag | Dùng `rsync` thay |
| File trong synced folder bị Windows line ending | Script bash fail | Set Git autocrlf, dùng dos2unix |
| Provision dependency external mất kết nối | Build fail | Pin version, fallback CDN |
| Sửa provision rồi destroy + up | Reset hết data | Nếu cần giữ data → sync folder |

## Quick reference

```text
Synced folder:
  config.vm.synced_folder "./app", "/var/www/html"
  config.vm.synced_folder ".", "/vagrant", disabled: true
  config.vm.synced_folder "./src", "/code", type: "rsync"

Provision shell:
  config.vm.provision "shell", inline: "yum install -y httpd"
  config.vm.provision "shell", path: "provision.sh"
  config.vm.provision "shell", inline: "...", run: "always"
  config.vm.provision "shell", privileged: false, inline: "..."

Provision file:
  config.vm.provision "file", source: "./conf.ini", destination: "/tmp/conf.ini"

Provision Ansible:
  config.vm.provision "ansible_local", playbook: "play.yml"

CLI:
  vagrant up                          Tạo + provision
  vagrant provision                   Re-run provisioner
  vagrant reload --provision          Restart + provision
  vagrant rsync                       Manual sync rsync
  vagrant rsync-auto                  Watch + sync
```

## Tóm tắt bài 2

- **Synced folder** mặc định ở `/vagrant`. Custom với `config.vm.synced_folder`.
- 3 sync types: virtualbox (bidirectional), rsync (one-way), nfs (fast).
- **Provisioner** chạy script trong VM khi `vagrant up`. Default `run: "once"`.
- 3 loại provisioner phổ biến: **shell** (inline/path), **file** (copy), **ansible** (playbook).
- **Idempotent** = chạy nhiều lần kết quả như nhau. Manual với grep hoặc dùng Ansible.
- Pattern 4 bước: install → configure → deploy data → restart.

**Bài kế tiếp** → [Bài 3: Website setup trên CentOS với httpd](03-website-httpd-centos.md)

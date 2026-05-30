# Bài 5: VM trên Mac M1/M2/M3 — VMware Fusion + Vagrant provider

Bài này áp dụng riêng cho **Mac M1/M2/M3/M4 (Apple Silicon)**. Windows và Mac Intel đọc bài 3 (VirtualBox).

Mac Apple Silicon chạy CPU **ARM64**, khác với Windows/Mac Intel chạy **x86_64**. Khác biệt này ảnh hưởng **mọi quyết định virtualization**.

## Vì sao Mac M-series khác

### Kiến trúc CPU

```text
ARM64 (Apple Silicon)             x86_64 (Intel/AMD)

- Instruction set: ARM             - Instruction set: x86 (Intel/AMD)
- Apple M1/M2/M3/M4                 - Intel Core, AMD Ryzen
- Hiệu năng/watt cao               - Hiệu năng đỉnh cao
- Binary x86 KHÔNG chạy native     - Binary ARM KHÔNG chạy native
```

Một **binary** compile cho x86 **không chạy được** trên ARM (và ngược lại). VM cũng vậy — VM image x86 không boot được trên hypervisor ARM trừ khi có **emulation** (rất chậm).

### Hệ quả cho virtualization

| Hypervisor | Chạy trên Mac M-series? |
|---|---|
| VirtualBox | ❌ Chưa stable (đến đầu 2026) |
| VMware Fusion | ✅ Hỗ trợ chính thức từ Fusion 13 |
| Parallels Desktop | ✅ Trả phí ~$100/năm |
| UTM (QEMU + Apple Hypervisor) | ✅ Free, performance trung bình |

Khoá này dùng **VMware Fusion** vì:
- **Free** cho personal use từ 2024.
- **Stable**, integrate với Vagrant qua plugin chính thức.
- Performance tốt cho lab.

### Hệ quả cho Vagrant Box

Box trên Vagrant Cloud có 2 loại:
- **amd64 / x86_64**: cho VirtualBox/VMware/Hyper-V truyền thống.
- **arm64**: cho Apple Silicon, ngày càng nhiều.

Khi chọn box cho Mac M-series, **bắt buộc** chọn box ARM64. Ví dụ:
- `bento/ubuntu-22.04-arm64`
- `bento/centos-stream-9` (some support arm64)
- `gyptazy/ubuntu24.04-arm64`

Đây là **bẫy phổ biến nhất** — copy lệnh `vagrant init ubuntu/jammy64` từ tutorial cũ → fail trên M1 vì box là amd64.

## Setup từng bước

### Bước 1: Cài Rosetta 2 (cho compatibility)

**Rosetta 2** = công cụ Apple cho phép chạy binary x86_64 trên ARM. Nhiều tool dev (kể cả vài Vagrant plugin) vẫn dùng binary x86 → cần Rosetta.

```bash
softwareupdate --install-rosetta --agree-to-license
```

Đợi vài phút. Sau khi cài, hệ thống tự dùng Rosetta khi cần.

### Bước 2: Cài Vagrant

```bash
brew install vagrant
```

Verify:

```bash
vagrant --version
# Vagrant 2.4.x
```

### Bước 3: Đăng ký tài khoản Broadcom và tải VMware Fusion

VMware đã được **Broadcom** mua năm 2023. Tải Fusion phải qua portal Broadcom (không còn vmware.com).

1. Vào **support.broadcom.com**.
2. Click Register → điền email, xác thực.
3. Login.
4. Top dropdown chọn **VMware Cloud Foundation**.
5. **My Downloads** → search "VMware Fusion".
6. Chọn version mới nhất (13.x trở lên cho Apple Silicon).
7. Tick "Accept terms".
8. Có thể yêu cầu thêm thông tin (address, etc) → điền.
9. Download `.dmg` (~600 MB).

> Quy trình Broadcom có thể đổi theo thời gian — Google "VMware Fusion download Broadcom" để có hướng dẫn cập nhật.

### Bước 4: Cài VMware Fusion

1. Double-click file `.dmg`.
2. Drag VMware Fusion vào Applications.
3. Mở **VMware Fusion** từ Applications.
4. macOS hỏi: cho phép → **Open**.
5. Nhập password admin.
6. **License**: chọn **"I want to license VMware Fusion for personal use"** (free).
7. **Done**.
8. Đóng dialog "Create a New Virtual Machine" — ta dùng Vagrant thay.

### Bước 5: Cho phép VMware Fusion Accessibility

Một số tính năng (mouse capture, screen scaling) cần permission:

1. **System Settings → Privacy & Security → Accessibility**.
2. Tìm **VMware Fusion** trong danh sách → toggle ON.
3. Nếu không thấy → click `+` → tìm `VMware Fusion.app` trong Applications.

### Bước 6: Cài Vagrant VMware Utility (cầu nối Vagrant-Fusion)

Đây là **HashiCorp utility** cho phép Vagrant nói chuyện với VMware:

```bash
brew install --cask vagrant-vmware-utility
```

Quá trình cài có thể yêu cầu password sudo.

### Bước 7: Cài Vagrant Plugin cho VMware Fusion

```bash
vagrant plugin install vagrant-vmware-desktop
```

Plugin này dạy Vagrant về VMware Fusion API.

Verify:

```bash
vagrant plugin list
# vagrant-vmware-desktop (3.x.x, global)
```

### Bước 8: Tạo Vagrantfile cho ARM box

```bash
mkdir -p ~/vagrant-vms/ubuntu
cd ~/vagrant-vms/ubuntu
```

Tạo `Vagrantfile`:

```ruby
Vagrant.configure("2") do |config|
  # Box ARM64 cho Apple Silicon
  config.vm.box = "bento/ubuntu-22.04"

  # VMware Fusion provider
  config.vm.provider "vmware_desktop" do |v|
    v.gui = false
    v.memory = 2048
    v.cpus = 2
  end

  # Network — private
  config.vm.network "private_network", ip: "192.168.56.10"

  # Hostname
  config.vm.hostname = "ubuntu-vm"

  # Provision đơn giản
  config.vm.provision "shell", inline: <<-SHELL
    apt-get update
    echo "VM ready"
  SHELL
end
```

> **Lưu ý box**: `bento/ubuntu-22.04` hỗ trợ cả amd64 và arm64. Vagrant tự chọn ARM trên Apple Silicon. Nếu gặp lỗi "no compatible box found", thử box khác như `gyptazy/ubuntu22.04-arm64`.

### Bước 9: Up VM

```bash
vagrant up --provider=vmware_desktop
```

Lần đầu:
- Tải box (~500 MB-1 GB) → cache `~/.vagrant.d/boxes/`.
- Tạo VM → boot → provision.
- Tổng thời gian: ~3-5 phút.

Lần sau: ~1 phút.

### Bước 10: SSH

```bash
vagrant ssh
```

Đã trong VM Ubuntu trên Apple Silicon, chạy ARM64 native.

```bash
uname -m
# aarch64           ← ARM64 architecture

cat /etc/os-release
# Ubuntu 22.04
```

### Bước 11: Halt / Destroy

Như VirtualBox:

```bash
vagrant halt
vagrant destroy -f
```

## Tạo CentOS VM (ARM)

CentOS Stream 9 có box ARM:

```ruby
Vagrant.configure("2") do |config|
  # Box ARM cho CentOS
  config.vm.box = "eurolinux-vagrant/centos-stream-9"
  # Hoặc: config.vm.box = "generic/centos9"

  config.vm.provider "vmware_desktop" do |v|
    v.memory = 2048
    v.cpus = 2
  end

  config.vm.network "private_network", ip: "192.168.56.11"
  config.vm.hostname = "centos-vm"
end
```

```bash
mkdir -p ~/vagrant-vms/centos
cd ~/vagrant-vms/centos
# Lưu Vagrantfile
vagrant up
vagrant ssh
```

> Một số box CentOS chưa có ARM build → check trên Vagrant Cloud trước. Hoặc dùng **AlmaLinux/Rocky Linux** (compatible với CentOS) có nhiều ARM image hơn.

## Khác biệt cú pháp khi gặp box ARM

Hầu hết command Vagrant giống nhau trên Mac M-series và Mac Intel. Khác biệt chính:

| | Mac Intel + VirtualBox | Mac M-series + VMware Fusion |
|---|---|---|
| `vagrant up` | mặc định | `vagrant up --provider=vmware_desktop` |
| Default provider | VirtualBox | Phải khai báo VMware |
| Box | `*/jammy64` (amd64) | Box phải có arm64 |
| Network bridged | `bridge: "en0: Wi-Fi"` | Tương tự, tên interface có thể khác |
| GUI window | Mặc định mở | `v.gui = false` để headless |

### Đặt default provider cho session

Thay vì gõ `--provider` mỗi lần:

```bash
export VAGRANT_DEFAULT_PROVIDER=vmware_desktop
```

Lưu vào `~/.zshrc` để persist:

```bash
echo 'export VAGRANT_DEFAULT_PROVIDER=vmware_desktop' >> ~/.zshrc
source ~/.zshrc
```

## Multi-VM trên M-series

Vagrantfile multi-VM tương tự bài 4, chỉ thay provider:

```ruby
Vagrant.configure("2") do |config|

  config.vm.define "web01" do |web|
    web.vm.box = "bento/ubuntu-22.04"
    web.vm.hostname = "web01"
    web.vm.network "private_network", ip: "192.168.56.10"
    web.vm.provider "vmware_desktop" do |v|
      v.memory = 1024
      v.cpus = 1
    end
  end

  config.vm.define "db01" do |db|
    db.vm.box = "bento/ubuntu-22.04"
    db.vm.hostname = "db01"
    db.vm.network "private_network", ip: "192.168.56.11"
    db.vm.provider "vmware_desktop" do |v|
      v.memory = 2048
      v.cpus = 2
    end
  end

end
```

```bash
vagrant up
# Tạo cả 2 VM song song
```

## Performance considerations

Mac M-series có lợi thế:
- CPU mạnh, RAM unified memory cực nhanh.
- VM boot trong **giây**, không phải phút.
- Battery life tốt hơn — chạy 3-4 VM vẫn pin nhiều giờ.

Nhược điểm:
- Box ARM ít hơn box amd64 (~70% so với 100%).
- Software chỉ có x86 phải dùng Rosetta hoặc QEMU emulation → chậm.
- Một vài tool DevOps (vài plugin Ansible cũ, Docker image x86) cần lưu ý.

## Khi cần chạy x86 binary

Vài tình huống vẫn cần x86:
- Test binary product chỉ có amd64.
- Reproduce bug environment x86.
- Software vendor không support ARM.

Cách:
1. **Docker** với platform flag: `docker run --platform linux/amd64 ...` (chậm).
2. **UTM** với QEMU emulation x86 (chậm).
3. **Remote SSH** vào server x86 cloud (EC2) — thực dụng nhất.
4. **Parallels Desktop** với "x86 emulation" beta.

Nói chung: nếu công việc daily cần x86 native, có thể cân nhắc giữ Mac Intel cũ hoặc remote server. Đa số DevOps task chạy native ARM ổn.

## Provisioning với Ansible trên M-series

```ruby
config.vm.provision "ansible_local", playbook: "site.yml"
```

`ansible_local` chạy Ansible **bên trong VM** → không cần cài Ansible trên host. Tốt cho M-series vì tránh issue compat Ansible-host.

Nếu chạy Ansible trên host (Mac M-series):

```bash
brew install ansible
ansible-playbook site.yml
```

Ansible chính thức hỗ trợ ARM từ ~2022. Một vài collection của bên thứ ba có thể chưa — check khi cài.

## Bẫy thường gặp riêng Mac M-series

| Bẫy | Triệu chứng | Giải pháp |
|---|---|---|
| Quên `--provider=vmware_desktop` | "No usable default provider" | Set `VAGRANT_DEFAULT_PROVIDER` |
| Box không có ARM build | "No box compatible" | Tìm box khác (`bento/*`, `gyptazy/*`) |
| VMware Fusion chưa cấp Accessibility | Mouse/keyboard không vào VM | System Settings → Accessibility |
| Vagrant Utility chưa cài | "vagrant-vmware-utility required" | `brew install --cask vagrant-vmware-utility` |
| Box x86 boot trên ARM | Boot fail hoặc panic | Verify `uname -m` của box trước khi up |
| File `.dmg` Broadcom yêu cầu đăng ký lằng nhằng | Mất thời gian setup | Một lần duy nhất, xong dùng được |
| Rosetta crash khi chạy tool x86 | Tool exit code lạ | Update tool lên bản ARM native |

## Alternatives — không bắt buộc dùng VMware Fusion

| Tool | Pros | Cons |
|---|---|---|
| **Parallels Desktop** | Performance tốt nhất, UX đẹp | Trả phí $99/year |
| **UTM** | Free, GUI đẹp | Vagrant không hỗ trợ chính thức |
| **Lima** | CLI, tích hợp Docker tốt | Chỉ Linux, không Windows |
| **OrbStack** | Nhanh nhất, free | macOS only, không Vagrant |
| **Multipass** (Canonical) | Đơn giản cho Ubuntu | Chỉ Ubuntu, không phải multi-distro |
| **Docker Desktop** | Container, dùng thay VM cho nhiều use case | Không phải VM thật |

Trong khoá này dùng **VMware Fusion + Vagrant** để có workflow giống Windows/Mac Intel nhất → dễ học chung tài liệu.

## Tóm tắt bài 5

- Mac M-series chạy **ARM64**, khác x86 — virtualization phải có box ARM.
- **VirtualBox không hỗ trợ ổn định** đến 2026 — dùng **VMware Fusion**.
- Setup: Rosetta → Vagrant → Broadcom account → Fusion → Accessibility → vagrant-vmware-utility → plugin.
- Vagrant: thêm `provider "vmware_desktop"` block + chọn box ARM-compatible.
- Set `VAGRANT_DEFAULT_PROVIDER=vmware_desktop` để khỏi gõ flag.
- Vagrantfile + lệnh `vagrant up/ssh/halt/destroy` giống hệt Intel/Windows.
- Cần x86 native → SSH vào EC2 hoặc dùng `--platform linux/amd64` của Docker.

**Bài kế tiếp** → [Phase 4 — Bài 1: Linux nhập môn — vì sao DevOps engineer phải làm chủ Linux](../phase-4-linux/01-linux-nhap-mon.md)

> Phase 4 sẽ được viết trong session tiếp theo.

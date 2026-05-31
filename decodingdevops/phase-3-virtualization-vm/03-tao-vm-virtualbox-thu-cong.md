# Bài 3: Tạo VM thủ công với VirtualBox — CentOS và Ubuntu

Bài này áp dụng cho **Windows + macOS Intel chip**. Mac M1/M2/M3 đọc bài 5 (VMware Fusion).

Mục tiêu: tạo **2 VM** chạy 2 OS phổ biến nhất trong DevOps: **CentOS Stream 9** (RedHat family) và **Ubuntu 22.04** (Debian family). Sau khoá học, cả hai distro đều xuất hiện thường xuyên — biết cả hai là cần thiết.

## Prerequisites — Windows

### Bước 1: Bật VT-x / AMD-V trong BIOS

Đây là bước **bắt buộc nhất**. Không có VT-x → VirtualBox chỉ chạy guest 32-bit chậm, không chạy 64-bit.

**Cách vào BIOS**:
1. Khởi động lại máy.
2. Khi logo hãng hiện (HP, Lenovo, Dell, ASUS), bấm liên tục một phím:
   - HP: `F10` hoặc `Esc`.
   - Lenovo: `F1` hoặc `F2`.
   - Dell: `F2` hoặc `F12`.
   - ASUS: `F2` hoặc `Del`.
3. Vào BIOS → tab "Advanced" / "Configuration" / "CPU Configuration".
4. Tìm option có tên:
   - **Intel Virtualization Technology** (VT-x).
   - **AMD-V** / **SVM Mode** (AMD).
   - **Virtualization** (chung chung).
   - **Secure Virtual Machine** (vài máy).
5. Đổi từ `Disabled` → `Enabled`.
6. F10 → Save and Exit.

Nếu không thấy option → BIOS quá cũ, hoặc CPU không hỗ trợ (hiếm trên máy < 10 năm tuổi).

### Bước 2: Tắt Hyper-V và features liên quan

1. Start menu → search "Turn Windows features on or off".
2. **Bỏ tick** các mục:
   - ❌ **Hyper-V** (full block).
   - ❌ **Windows Hypervisor Platform**.
   - ❌ **Windows Subsystem for Linux**.
   - ❌ **Virtual Machine Platform**.
   - ❌ Docker Desktop (nếu cài, gỡ tạm).
3. OK → **Restart máy** (bắt buộc).

> Nếu sau này muốn dùng Docker Desktop / WSL2 → bật lại. Không thể chạy song song VirtualBox tốc độ cao + Hyper-V.

### Bước 3: Tắt antivirus tạm thời

McAfee, Avast, Kaspersky có thể block VirtualBox driver. Tạm tắt 15 phút khi cài/khởi VM lần đầu. Sau khi VM chạy ổn → bật lại.

## Prerequisites — Mac Intel

Mac Intel **không cần** BIOS setting — virtualization mặc định bật. Chỉ cần:

1. System Settings → Privacy & Security → cho phép kernel extension của Oracle nếu hỏi (cài VirtualBox sẽ trigger).
2. Restart Mac sau khi cho phép.

## Bước 4: Mở VirtualBox và tạo VM CentOS

### 4.1. Tạo VM mới

1. Open **Oracle VM VirtualBox**.
2. **New** (Ctrl+N hoặc click icon).
3. **Name**: `centosvm`.
4. **Folder**: chấp nhận default hoặc tự chọn.
5. **Type**: `Linux`.
6. **Subtype**: `Red Hat`.
7. **Version**: `Red Hat (64-bit)`.

> Nếu **không thấy `64-bit`** → VT-x chưa bật. Quay lại Bước 1.

8. Click **Hardware** tab:
   - **Base Memory**: `2048 MB` (2 GB). Nếu host < 8 GB RAM, chọn `1024 MB`.
   - **Processors**: `2`.
9. Click **Hard Disk** tab:
   - **Create a Virtual Hard Disk Now**.
   - Size: `20 GB`.
   - **KHÔNG** tick "Pre-allocate full size" (mặc định dynamic = chỉ chiếm khi cần).
10. **Finish**.

VM được tạo nhưng chưa có OS — như mua PC mới chưa cài Windows.

### 4.2. Tải ISO CentOS Stream 9

Google: **`CentOS Stream 9 ISO download`**.

Vào link chính thức (`mirror.centos.org` hoặc tương đương) → chọn file `CentOS-Stream-9-*-boot.iso` (~1 GB).

> File `boot.iso` là minimal installer — download OS từ internet khi cài. File `dvd1.iso` (~7 GB) chứa full package. Lab dùng `boot.iso` đủ.

### 4.3. Mount ISO vào VM

1. Trong VirtualBox, chọn VM `centosvm` → **Settings** (Ctrl+S).
2. **Storage** tab.
3. Top-right có dropdown `Basic / Expert` — chọn **Expert** để thấy đầy đủ option.
4. Section "Controller: IDE" → click icon CD trống → "Choose a disk file..." → browse đến file `CentOS-Stream-9-*-boot.iso` vừa tải.
5. Tick **Live CD/DVD** (cho phép VM boot từ ISO).
6. OK.

### 4.4. Cấu hình mạng — Bridged Adapter

Mặc định VirtualBox tạo VM với 1 NIC (network interface card) NAT. NAT hoạt động nhưng VM **không có IP cùng subnet router** → khó SSH từ host. Giải pháp: thêm **Bridged Adapter**.

#### Khái niệm network mode trong VirtualBox

| Mode | VM IP | Host thấy VM | VM thấy LAN | Khi nào dùng |
|---|---|---|---|---|
| **NAT** | 10.0.2.x (private) | Qua port forward | Có (qua NAT) | VM cần ra internet, không cần inbound |
| **Bridged** | Cùng subnet router (192.168.x.x) | Có (như device LAN) | Có | Lab — muốn SSH dễ |
| **Host-only** | Subnet riêng host-VM | Có | Không | Test isolated giữa host và VM |
| **Internal** | Tự định nghĩa | Không | Không | Test VM-to-VM, không lộ ra ngoài |

Cho lab này chọn **Bridged** vì SSH từ host vào VM dễ.

#### Tìm tên adapter của host

**Windows**: Open `cmd` hoặc PowerShell → `ipconfig`:

```text
Wireless LAN adapter Wi-Fi:
   IPv4 Address. . . . . . . . . . . : 192.168.1.10
   Default Gateway . . . . . . . . . : 192.168.1.1
```

→ Adapter WiFi tên có thể là `Intel(R) Wi-Fi 6 AX201`.

**Mac**: Open Terminal → `ifconfig`:

```text
en0: flags=8863<UP,BROADCAST,SMART,RUNNING,SIMPLEX,MULTICAST>
        inet 192.168.1.15 netmask 0xffffff00 broadcast 192.168.1.255
```

→ `en0` thường là WiFi.

#### Cấu hình trong VirtualBox

1. Settings VM → **Network** tab.
2. **Adapter 1**: giữ nguyên (NAT) — không đổi.
3. **Adapter 2**:
   - Tick **Enable Network Adapter**.
   - **Attached to**: `Bridged Adapter`.
   - **Name**: chọn adapter WiFi/Ethernet của bạn.
   - **Cable Connected**: tick.
4. OK.

### 4.5. Cấu hình mouse cho UX tốt hơn

Settings → **System** → **Motherboard** → **Pointing Device**: `USB Tablet`. Giúp con trỏ chuột mượt mà giữa host và VM, không bị "capture" cứng.

### 4.6. Power on VM và cài CentOS

1. Chọn `centosvm` → **Start**.
2. VM boot từ ISO. Màn hình installer hiện → chọn `Install CentOS Stream 9` → Enter.
3. Chờ vài phút.
4. Chọn ngôn ngữ: **English**.
5. **Installation Destination** → click vào disk 20 GB → Done.
6. **Network & Host Name**:
   - Toggle **Enabled** cả 2 adapter.
   - Hostname: `centosvm`.
   - Done.
7. **Root Password** → set password mạnh (nhớ kỹ — sẽ dùng nhiều).
8. **Begin Installation**.
9. Chờ 10-15 phút.
10. Khi xong → **không** click Reboot.

### 4.7. Detach ISO và boot lần đầu

1. Settings VM → Storage → ISO → **Remove disk from virtual drive**.
2. OK.
3. Power on VM bình thường (Start).

### 4.8. Lấy IP và SSH từ host

Trong VM CentOS (login với user vừa tạo hoặc root):

```bash
ip addr show
# enp0s3: 10.0.2.15      ← NAT adapter (internal)
# enp0s8: 192.168.1.20   ← Bridged adapter ← LẤY CÁI NÀY
```

Trên host (Git Bash trên Windows, hoặc Terminal trên Mac):

```bash
ssh centosuser@192.168.1.20
# yes (lần đầu)
# password
```

Login thành công → terminal vào VM. Đây là **cách bạn sẽ tương tác với mọi server Linux trong khoá** — không qua GUI VM.

### 4.9. Power off VM

Trong VM: `sudo shutdown now`.
Hoặc: VirtualBox → right-click VM → **Close → ACPI Shutdown**.

## Bước 5: Tạo VM Ubuntu

Lặp lại tương tự, khác:

### 5.1. New VM

- **Name**: `ubuntuvm`.
- **Type**: Linux.
- **Subtype**: Ubuntu.
- **Version**: Ubuntu (64-bit).
- **Memory**: 2048 MB.
- **CPU**: 2.
- **Disk**: mặc định 25 GB là OK.

### 5.2. Tải ISO Ubuntu Server 22.04

Google **`Ubuntu 22.04 LTS Jammy Jellyfish server ISO`**.

Chọn **Server** (không phải Desktop) — DevOps làm việc với server install, không cần GUI.

### 5.3. Mount + bridged adapter

Như CentOS.

### 5.4. Cài Ubuntu

1. Power on → installer.
2. Chọn ngôn ngữ.
3. "Continue without updating" (tiết kiệm thời gian).
4. Keyboard: default.
5. Network: dùng bridged adapter.
6. Storage: `Use entire disk` → Continue → Done.
7. **Profile setup**:
   - Name: bạn.
   - Server name: `ubuntuvm`.
   - Username: `devops`.
   - Password: mạnh, nhớ kỹ.
8. **QUAN TRỌNG: tick `Install OpenSSH Server`** (dùng spacebar). Không tick → không SSH được sau này.
9. Skip "Featured server snaps" (không chọn gì) → Continue.
10. Cài 10-15 phút.

### 5.5. Detach ISO, boot, SSH

Như CentOS.

```bash
# Trên VM
ip addr show
# enp0s8: 192.168.1.21

# Trên host
ssh devops@192.168.1.21
```

## Vấn đề thường gặp & giải

| Triệu chứng | Nguyên nhân | Giải pháp |
|---|---|---|
| Không thấy `64-bit` khi tạo VM | VT-x tắt trong BIOS | Bật VT-x |
| `VT-x is not available` | Hyper-V đang chiếm | Tắt Hyper-V |
| VM rất chậm | Hyper-V slow path | Tắt Hyper-V |
| Bridged không có IP | Router chưa nhận MAC mới | Restart router, hoặc thử adapter khác (Ethernet thay WiFi) |
| SSH timeout | Firewall chặn port 22 | Tạm tắt firewall test, hoặc check ssh service trên VM |
| VM boot lại installer | Quên detach ISO | Settings → Storage → remove disk |
| Antivirus chặn driver | McAfee/Defender | Tắt tạm, hoặc whitelist VirtualBox |
| BSOD khi start VM (Win) | Conflict Hyper-V driver | Tắt Hyper-V hoàn toàn + reboot |
| VM lock không vào được | Sai password root | Boot single-user mode + `passwd` reset |

## Hiểu sâu hơn — VM file gồm gì?

Mỗi VM trên disk có vài file chính:

```text
~/VirtualBox VMs/centosvm/
├── centosvm.vbox              ← Cấu hình XML (CPU, RAM, NIC, disk path)
├── centosvm.vbox-prev         ← Backup file vbox
├── centosvm.vdi               ← Virtual disk (Disk Image, dynamic)
├── Snapshots/
│   └── snapshot-uuid.vdi      ← Snapshot delta
└── Logs/
    └── VBox.log               ← Log khi VM chạy
```

- File `.vdi` chứa **toàn bộ filesystem** của guest OS.
- Copy folder này = copy VM. Move đến máy khác = chạy ngay (re-register trong VirtualBox).
- Snapshot là **delta** — phụ thuộc file gốc.

## Snapshot — backup trước khi nghịch

Trước khi làm experiment risky (cài package lạ, edit /etc/fstab...):

VirtualBox → chọn VM → **Snapshots** → **Take** → đặt tên `before-XXX-experiment`.

Hỏng → **Restore** snapshot → VM về trạng thái trước.

Quản lý snapshot:
- Càng nhiều snapshot → file VDI càng phân mảnh → chậm.
- Production không dùng snapshot — dùng backup full + replication.

## Vì sao tạo thủ công vẫn là **bài học cần có**?

Bạn sẽ nghĩ "có Vagrant rồi tạo thủ công làm gì?" Đúng — nhưng:

1. **Hiểu cơ chế** — Vagrant chỉ là wrapper. Khi Vagrant fail, bạn debug bằng cách hiểu thủ công đang làm gì.
2. **Cài OS lần đầu** trong đời (với người mới) — kỹ năng cần có.
3. **Production**: ESXi cluster, on-prem KVM thường tạo VM thủ công (qua UI hoặc Terraform).
4. **Troubleshooting**: network, BIOS, ISO — thủ công làm rõ vấn đề ở tầng nào.

Sau khi đã tạo thủ công 1 lần, ta sẽ **chuyển sang Vagrant** (bài 4) để tự động hoá mọi thứ.

## Tóm tắt bài 3

- BIOS bật **VT-x / AMD-V** là bước số 1, không thể bỏ qua.
- Windows: **tắt Hyper-V** để VirtualBox chạy nhanh.
- VM cần **2 NIC**: NAT (internet) + Bridged (LAN, SSH dễ).
- Cài `OpenSSH Server` trên Ubuntu — quên tick = không SSH được.
- Sau khi cài xong, **detach ISO** kẻo VM boot lại installer.
- VM = file `.vdi` + `.vbox` — copy folder = clone VM.
- Tạo thủ công 1 lần để hiểu, sau đó dùng **Vagrant** cho mọi VM tiếp theo.

**Bài kế tiếp** → [Bài 4: Vagrant — tự động hoá toàn bộ vòng đời VM](04-vagrant-tu-dong-hoa-vm.md)

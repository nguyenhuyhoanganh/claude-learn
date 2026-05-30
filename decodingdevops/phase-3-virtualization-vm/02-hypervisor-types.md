# Bài 2: Hypervisor Type 1 và Type 2 — đào sâu kiến trúc

Bài trước giới thiệu khái niệm hypervisor. Bài này phân loại 2 kiểu chính, so sánh chi tiết, và giải thích **khi nào dùng cái nào**. Hiểu sai có thể chọn nhầm tool cho lab/production.

## Hai loại hypervisor

```text
Type 1 (Bare-metal)              Type 2 (Hosted)

+----+ +----+ +----+              +----+ +----+
| VM | | VM | | VM |              | VM | | VM |
+----+ +----+ +----+              +----+ +----+
|   Hypervisor    |               |  Hypervisor  |
+-----------------+               +--------------+
|   Hardware      |               |   Host OS    |
+-----------------+               +--------------+
                                  |   Hardware   |
                                  +--------------+

Hypervisor CHẠY THẲNG          Hypervisor là APP
trên hardware                  trên OS có sẵn
```

| | Type 1 | Type 2 |
|---|---|---|
| Còn gọi là | Bare-metal, native | Hosted |
| Chạy trên | Phần cứng trực tiếp | Host OS (Win/Mac/Linux) |
| Mục tiêu | Production, data center | Dev, lab, demo |
| Performance | Cao nhất | Có overhead OS |
| Quản lý | Quản trị tập trung, cluster | Quản lý local |
| Ví dụ | VMware ESXi, Xen, KVM, Hyper-V | VirtualBox, VMware Fusion/Workstation, Parallels |
| Boot | Boot vào hypervisor (như OS) | Cài như app, mở từ host OS |
| Multi-user | Có (cluster, vCenter) | Không, chỉ user host |

## Type 1 — chi tiết

### VMware ESXi (vSphere)

Chuẩn vàng enterprise. Cài như một OS — boot từ USB/disk, không có gì khác trên máy.

```text
[Server vật lý]
       │
       │ boot
       ▼
[ESXi (kernel + management)]
       │
       │ chạy VM (vmx file, vmdk file)
       ▼
[Guest OS: Linux, Windows, Solaris...]
```

Đặc điểm:
- **Microkernel** ~150 MB.
- Quản trị qua web UI hoặc **vSphere Client**.
- **vCenter** quản 100s server cùng lúc.
- Tính năng: **vMotion** (migrate VM giữa host live), **HA** (failover khi host crash), **DRS** (cân bằng tải tự động).
- License: free cho phiên bản hạn chế, từ $1000+ cho full.

### Xen

Open-source, ra đời 2003 ở Cambridge. Là hypervisor đầu tiên của AWS EC2 (đến 2018 mới dần chuyển sang Nitro). Cấu trúc:

- **Dom0** — VM đặc biệt có quyền quản trị, chạy Linux.
- **DomU** — VM khách.

Vẫn được dùng ở Citrix Hypervisor, Oracle VM, một số nhà cung cấp VPS (Linode, OVH cũ).

### KVM (Kernel-based Virtual Machine)

KVM là **module kernel Linux**. Nghĩa là Linux **tự nó trở thành hypervisor Type 1**.

```text
Linux kernel + KVM module = hypervisor
                            ├── chạy được VM bằng /dev/kvm
                            └── dùng QEMU làm device emulation
```

Đặc điểm:
- **Mặc định trong mọi distro Linux** (Ubuntu, RHEL, CentOS).
- **Free, open-source**.
- Performance ngang ngửa ESXi.
- Dùng bởi **AWS, GCP, RedHat OpenShift, Proxmox**.
- Quản lý qua **libvirt** + `virt-manager` (GUI) hoặc `virsh` (CLI).

Đây là hypervisor **DevOps engineer hiện đại nên biết** vì nó ở mọi nơi.

### Microsoft Hyper-V

Hypervisor của Microsoft, có 2 dạng:
- **Hyper-V Server**: Type 1 thực thụ, free.
- **Hyper-V trên Windows 10/11 Pro**: tích hợp Windows nhưng vẫn là Type 1 (Windows chạy trên Hyper-V sau khi bật).

Đây là chỗ gây nhầm lẫn lớn nhất với người mới: **Hyper-V là Type 1**, không phải Type 2 như cảm giác. Nhưng vì conflict với Type 2 khác (VirtualBox) → khi bật Hyper-V, VirtualBox chạy chậm hoặc fail.

→ Bài 3 sẽ hướng dẫn **tắt Hyper-V để VirtualBox chạy đúng** trên Windows.

## Type 2 — chi tiết

### VirtualBox (Oracle)

Hypervisor Type 2 phổ biến nhất cho dev:
- **Free, open-source** (GPL).
- Chạy trên Windows, macOS (Intel), Linux.
- UI dễ dùng + CLI (`VBoxManage`).
- **Không hỗ trợ Apple Silicon (M1/M2/M3)** ổn định đến 2026 — đây là lý do macOS ARM phải dùng VMware Fusion.

Format đĩa: **VDI** (mặc định), cũng đọc/ghi được VMDK, VHD.

### VMware Workstation / Fusion / Player

- **VMware Workstation Pro** (Win/Linux): trả phí, full feature.
- **VMware Workstation Player** (Win/Linux): free, basic.
- **VMware Fusion** (macOS): trả phí, free từ 2024 cho personal use.
- **VMware Fusion Pro / Player Pro**: free for personal use từ 2024.

VMware Fusion **hỗ trợ Apple Silicon** (ARM) — tool chính cho M1/M2/M3 Mac.

### Parallels Desktop (macOS)

Premium, tối ưu Windows trên Mac. Performance Windows-on-Mac thường tốt nhất nhưng trả phí ~$100/năm.

### QEMU (mode user-space)

QEMU là **emulator** đa năng. Khi chạy KÈM KVM → trở thành hypervisor (Type 1). Khi chạy MỘT MÌNH → emulate đầy đủ phần cứng (chạy ARM trên x86 chậm hơn nhiều nhưng được).

Dùng nhiều trong:
- Test cross-architecture (chạy ARM binary trên x86 server).
- Embedded development.
- UTM (macOS wrapper trên QEMU) — alternative miễn phí cho Parallels.

### UTM (chỉ macOS)

Wrapper open-source quanh QEMU + Apple Hypervisor framework. **Free, hỗ trợ M-series Mac**. Performance thấp hơn VMware Fusion / Parallels nhưng đủ cho lab.

## Bảng so sánh hypervisor Type 2

| Hypervisor | Win | Mac Intel | Mac M-series | Linux | Phí | Performance | Vagrant support |
|---|---|---|---|---|---|---|---|
| **VirtualBox** | ✓ | ✓ | ✗ | ✓ | Free | Trung bình | ✓ (built-in) |
| **VMware Workstation Pro** | ✓ | ✗ | ✗ | ✓ | Free (personal) | Tốt | ✓ (plugin) |
| **VMware Fusion** | ✗ | ✓ | ✓ | ✗ | Free (personal) | Tốt | ✓ (plugin) |
| **Parallels Desktop** | ✗ | ✓ | ✓ | ✗ | Trả phí | Tốt nhất | ✓ (plugin) |
| **Hyper-V** | ✓ | ✗ | ✗ | ✗ | Free (Win Pro) | Tốt | ✓ (plugin) |
| **UTM (QEMU)** | ✗ | ✓ | ✓ | ✗ | Free | Trung bình-thấp | ✗ (chính thức) |

## Khi nào chọn Type 1 vs Type 2?

| Tiêu chí | Type 1 | Type 2 |
|---|---|---|
| Production data center | ✓ | ✗ |
| Dev/lab cá nhân | ✗ | ✓ |
| Multi-user, cluster | ✓ | ✗ |
| Latency / throughput tối đa | ✓ | ✗ |
| Cài đơn giản, không phải re-format máy | ✗ | ✓ |
| Hỗ trợ chạy bên cạnh OS hằng ngày | ✗ | ✓ |

**Khoá học này dùng Type 2** — VirtualBox (Win/Mac Intel) hoặc VMware Fusion (Mac ARM).

## Hyper-V conflict trên Windows — vì sao và cách giải

Windows 10/11 Pro+ có Hyper-V built-in. Nếu bật, các tính năng sau cũng bật theo:
- **Windows Subsystem for Linux 2 (WSL2)** — cũng dùng Hyper-V.
- **Docker Desktop for Windows** — dùng Hyper-V backend mặc định.
- **Virtual Machine Platform**.
- **Windows Hypervisor Platform** (cho phép third-party hypervisor dùng API mới).

Khi Hyper-V chiếm CPU virtualization features → VirtualBox không truy cập VT-x trực tiếp → hoặc **chậm 5-10 lần**, hoặc **fail "VT-x is not available"**.

Trước Win 10 1909: phải tắt hoàn toàn Hyper-V.

Từ Win 10 1909+: VirtualBox 6+ có thể dùng **Hyper-V API** (slow path) → chạy được nhưng chậm.

Cách **bài 3** giải quyết:
- Vào "Turn Windows features on or off".
- **Tắt**: Hyper-V, Windows Hypervisor Platform, Windows Subsystem for Linux, Virtual Machine Platform.
- Restart.
- VirtualBox chạy nhanh trở lại.

→ Trade-off: tắt Hyper-V → mất Docker Desktop, WSL2. Lựa chọn:
1. **Tắt Hyper-V** → VirtualBox nhanh, mất Docker Desktop/WSL2.
2. **Bật Hyper-V** → Docker/WSL2 work, VirtualBox chậm hoặc fail.
3. **Dùng WSL2 + Docker** thay VirtualBox cho lab Linux → option modern.
4. **Dùng Hyper-V Manager** thay VirtualBox.

Trong khoá này dùng option 1.

## Hypervisor trên cloud — không phải bạn quản lý

Khi chạy EC2 ở AWS, bạn KHÔNG thấy hypervisor. AWS dùng:
- **Xen** trước 2018 cho hầu hết instance.
- **Nitro** từ 2018 — hypervisor custom dựa trên KVM + chip riêng để handle network/storage offload.

Nitro cho phép EC2:
- Boot trong vài giây.
- Performance gần bare-metal (overhead < 1%).
- Cô lập an toàn cho multi-tenant.

GCP dùng **KVM custom**. Azure dùng **Hyper-V custom**.

Đây là vì sao **trong cloud, bạn không quản lý hypervisor** — đó là việc của cloud provider. Bạn chỉ chọn instance type và OS.

## Nested virtualization

"Chạy VM trong VM". Có 3 use case:
- Lab DevOps trên cloud (chạy VirtualBox trên EC2).
- CI build cần emulate môi trường client.
- Test hypervisor (VMware ESXi trong VMware Workstation).

Yêu cầu CPU hỗ trợ + hypervisor bật flag nested. Performance kém hơn nhiều — tránh trong production.

## Container engine có phải hypervisor?

Đây là câu hỏi gây tranh cãi trong phỏng vấn:

- **Docker / containerd** **không** phải hypervisor.
- Chúng dùng **Linux kernel features** (namespaces, cgroups, seccomp) để cô lập, không phải ảo hoá CPU.
- Container share kernel với host → cô lập yếu hơn VM nhưng nhẹ hơn nhiều.

Tuy nhiên **Kata Containers** và **Firecracker** (AWS Lambda) là "micro-VM" — chạy container nhưng dùng KVM bên dưới để cô lập kernel → kết hợp ưu điểm cả hai.

## Bẫy thường gặp khi chọn hypervisor

| Bẫy | Triệu chứng | Giải pháp |
|---|---|---|
| Cài VirtualBox trên Mac M1 | Crash khi tạo VM | Dùng VMware Fusion |
| Bật cả Hyper-V và VirtualBox | VirtualBox chậm/fail | Tắt Hyper-V hoặc dùng Hyper-V luôn |
| BIOS không bật VT-x | Tạo VM 64-bit không thấy | Vào BIOS bật VT-x / AMD-V |
| Network bridged không hoạt động | VM không có IP | Restart router, hoặc dùng NAT |
| VM treo sau khi sleep host | Cần restart VM | Disable USB autosuspend, save state trước sleep |
| Disk pre-allocate đầy | Host hết dung lượng | Dùng dynamic allocation |
| RAM VM tổng > RAM host | Host swap chậm khủng khiếp | Tổng RAM VM ≤ 70% host RAM |

## Tóm tắt bài 2

- **Type 1** = chạy thẳng phần cứng (ESXi, KVM, Xen) — production.
- **Type 2** = chạy như app trên OS (VirtualBox, VMware Workstation/Fusion) — dev/lab.
- **KVM** = module kernel Linux, chuẩn de facto modern (AWS, GCP, OpenShift dùng).
- **Hyper-V** là Type 1 nhưng tích hợp Windows — gây conflict với VirtualBox.
- **Mac M-series** không chạy được VirtualBox → dùng **VMware Fusion** hoặc Parallels/UTM.
- Cloud (EC2) chạy trên hypervisor custom (Nitro/KVM) — bạn không thấy nhưng nó luôn ở đó.

**Bài kế tiếp** → [Bài 3: Tạo VM thủ công với VirtualBox — CentOS và Ubuntu](03-tao-vm-virtualbox-thu-cong.md)

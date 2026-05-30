# Bài 1: Virtualization là gì? Vì sao nó là nền tảng của cloud computing

## Một máy tính chạy 10 hệ điều hành

Bạn đang dùng MacBook hay laptop Windows. Đó là **một** máy tính chạy **một** OS. Bây giờ tưởng tượng: trên cùng máy đó, bạn chạy thêm **Ubuntu Linux**, **CentOS**, **Windows Server**, mỗi cái như một máy riêng biệt — có IP riêng, ổ cứng riêng, network riêng. Đó là **virtualization** (ảo hoá).

Đây không phải multitasking (chạy nhiều app cùng OS). Đây là **multi-OS** trên cùng phần cứng.

> **Virtualization** = kỹ thuật **chia phần cứng vật lý thành nhiều "máy tính ảo"** (Virtual Machine — VM), mỗi VM có OS riêng và **bị cô lập** với VM khác.

Virtualization là phát minh **làm thay đổi ngành CNTT vĩnh viễn**. Cloud (AWS EC2, GCP Compute Engine), container (Docker, K8s), và mọi data center hiện đại đều dựa trên nó.

## Vì sao virtualization sinh ra? — Câu chuyện 2000s

Trước virtualization, mỗi server chạy **một service chính**:

```text
Server 1: Web server (Tomcat)        — CPU dùng 8%
Server 2: Database (MySQL)            — CPU dùng 12%
Server 3: Cache (Memcached)           — CPU dùng 4%
Server 4: Mail server (Postfix)       — CPU dùng 2%
Server 5: DNS                         — CPU dùng <1%
```

Vì sao tách? Vì **cô lập** (isolation):
- Sự cố ở web server không ảnh hưởng database.
- Update OS cho mail không cần dừng cache.
- An toàn: chỉ admin mail vào server mail.

Hệ quả:
- 1 service = 1 server vật lý.
- Server **over-provisioned** (mua dư phòng khi peak) → tài nguyên dùng < 20%.
- 80% CPU/RAM **bỏ phí**.
- Tiền: server $5000, điện ~$500/năm, cooling, network port, không gian rack. Một dự án 20 service → tối thiểu 20 server, HA → 40+.
- Mua trang bị server mới mất **vài tuần** (procurement → ship → rack → install OS → cấu hình).

**Đây là không scale được** với tốc độ web bùng nổ 2005-2010.

## VMware đến — ý tưởng đột phá

1998, **VMware** ra mắt sản phẩm thương mại đầu tiên cho phép chạy nhiều OS trên một PC. Đến 2001 họ có VMware ESX (server-class) — đột phá thực sự.

Ý tưởng: thêm một **lớp phần mềm mỏng** giữa phần cứng và OS, gọi là **hypervisor**. Hypervisor:
- Quản lý CPU, RAM, disk, network của máy thật.
- Cho mỗi VM "tưởng nó là máy thật".
- Phân chia tài nguyên giữa các VM.

```text
Trước virtualization:

   +-----------------+
   |   Application   |
   +-----------------+
   |   Operating     |
   |   System        |
   +-----------------+
   |   Hardware      |
   +-----------------+


Sau virtualization:

   +------+ +------+ +------+
   | App  | | App  | | App  |
   +------+ +------+ +------+
   | OS-A | | OS-B | | OS-C |   ← Mỗi VM có OS riêng
   +------+ +------+ +------+
   |  Hypervisor (VMware ESX) |  ← Lớp mỏng quản lý VM
   +-------------------------+
   |  Hardware (physical)    |
   +-------------------------+
```

Hệ quả ngay lập tức:
- 1 máy chạy 10-20 VM → tận dụng tài nguyên 60-80%.
- Tạo VM mới: **vài phút**, không phải vài tuần.
- VM là **file** trên disk → backup, copy, restore dễ dàng.
- Cô lập vẫn giữ — VM crash không ảnh hưởng VM khác.

VMware trở thành công ty $50B+ chỉ vì idea này.

## Khái niệm cốt lõi

| Term | Ý nghĩa |
|---|---|
| **Host machine** | Máy vật lý — phần cứng thật. |
| **Host OS** | OS đang chạy trên máy vật lý (Windows/macOS/Linux). |
| **Hypervisor** | Phần mềm cho phép chạy VM (VMware ESX, VirtualBox, KVM...). |
| **Guest machine** / **VM** | Máy tính ảo chạy trên hypervisor. |
| **Guest OS** | OS chạy trong VM (Ubuntu, CentOS, Windows Server...). |
| **VM image / Template** | File "snapshot" của một VM đã setup sẵn, có thể clone. |
| **Snapshot** | Bản backup trạng thái VM tại 1 thời điểm — quay lại được. |
| **Provisioning** | Cấu hình OS, cài app sau khi VM chạy. |

Một câu để nhớ: **"Hypervisor cho phép Guest OS chạy như máy thật trên Host machine"**.

## Vì sao VM "cô lập" được — kỹ thuật bên trong

Đây là phần thường bị bỏ qua. Hiểu nó giúp bạn debug khi có sự cố.

CPU hiện đại có **các vòng bảo vệ** (protection ring):
- **Ring 0** (kernel mode): toàn quyền với phần cứng.
- **Ring 3** (user mode): chạy app, không touch hardware trực tiếp.

OS thông thường chạy ở Ring 0. Khi chạy 2 OS, **không thể** cả hai cùng Ring 0 → conflict. Giải pháp:

### Trapping (binary translation) — VMware đầu

Hypervisor chiếm Ring 0. Guest OS chạy Ring 1. Mỗi khi guest gọi lệnh Ring-0 (ví dụ truy cập trang bộ nhớ vật lý), CPU sinh **trap** → hypervisor xử lý hộ.

Nhược: **chậm** (mỗi lệnh privileged tốn vài chục clock cycle).

### Hardware-assisted virtualization — Intel VT-x / AMD-V (2005+)

Intel và AMD thêm **vòng bảo vệ mới** chuyên cho hypervisor (gọi là "root mode" hoặc Ring -1). Guest OS chạy **thật ở Ring 0** trong "non-root mode", hypervisor ở "root mode" thật.

CPU tự xử lý chuyển ngữ cảnh khi cần → **nhanh hơn 10-100 lần**.

**Hệ quả thực tế cho bạn**: nếu BIOS tắt VT-x (Intel) / AMD-V (AMD) → hypervisor chạy rất chậm hoặc không chạy. **Bài 3 sẽ hướng dẫn bật**.

### Memory virtualization — EPT / NPT

Mỗi guest có "vật lý memory" giả mà thực ra là một phần memory thật của host. CPU có **Extended Page Tables (EPT)** giúp dịch địa chỉ 2 lớp nhanh.

### I/O virtualization — VT-d / SR-IOV

Network card, disk controller được chia "trực tiếp" cho VM mà không qua hypervisor → tăng tốc I/O.

## Snapshot — backup VM trong 1 click

Vì VM là **file trên disk**, hypervisor có thể "đóng băng" trạng thái:

```text
Trạng thái snapshot:
   - File ảo của disk (qcow2, vmdk, vdi)
   - State của RAM (file .vmem)
   - State của CPU register
```

Snapshot ≠ backup đầy đủ. Snapshot là **delta** từ trạng thái gốc → mất file gốc, snapshot vô dụng. Backup thật phải export full image ra ngoài.

Khi nào dùng snapshot:
- Trước khi update package risky → fail → revert.
- Trước khi demo → demo fail → revert nhanh.
- Test scenario destructive → revert sạch.

Khi nào KHÔNG:
- Long-term backup → dùng export full image.
- Production cluster → dùng replication, không phải snapshot.

## Các loại virtualization

Không chỉ "server virtualization":

| Loại | Mục tiêu | Ví dụ |
|---|---|---|
| **Server virt** | Chạy nhiều OS trên 1 server | VMware, KVM, Hyper-V |
| **Network virt** | Ảo hoá network layer | VMware NSX, Linux bridge, VLAN |
| **Storage virt** | Gom nhiều disk thành pool ảo | VMware vSAN, Ceph, LVM |
| **Desktop virt (VDI)** | Desktop chạy trên server, user kết nối qua thin client | VMware Horizon, Citrix |
| **OS-level virt (containers)** | Chia OS thành nhiều "container" share kernel | Docker, LXC |
| **App virt** | Đóng gói app chạy độc lập | Java JVM, Wine |

Khoá này tập trung **server virt** ở phase này và **OS-level (Docker, K8s)** ở phase sau.

## Container vs VM — khác biệt cốt lõi

Câu hỏi này gần như chắc chắn xuất hiện trong phỏng vấn DevOps:

```text
VM:
+----------+ +----------+
|   App    | |   App    |
+----------+ +----------+
|  Libs    | |  Libs    |
+----------+ +----------+
| Guest OS | | Guest OS |  ← Mỗi VM có full OS
+----------+ +----------+
|     Hypervisor        |
+-----------------------+
|     Host OS           |
+-----------------------+
|     Hardware          |
+-----------------------+


Container:
+----------+ +----------+ +----------+
|   App    | |   App    | |   App    |
+----------+ +----------+ +----------+
|  Libs    | |  Libs    | |  Libs    |  ← Container chỉ chứa app + libs
+----------+ +----------+ +----------+
|     Container Engine (Docker)     |
+-----------------------------------+
|     Host OS (Linux kernel)        |  ← Share kernel với host
+-----------------------------------+
|     Hardware                      |
+-----------------------------------+
```

| Tiêu chí | VM | Container |
|---|---|---|
| Boot time | Phút | Giây |
| Disk size | GB | MB |
| RAM overhead | GB | MB |
| Isolation | Mạnh (OS riêng) | Yếu hơn (share kernel) |
| Mỗi instance có OS riêng | Có | Không |
| Chạy OS khác host | Có | Không (Linux container chỉ chạy trên Linux kernel) |
| Use case | Workload đa OS, full isolation | Microservice, app dễ scale |

Trong production hiện đại: **VM + Container** kết hợp — chạy K8s **trong** VM cloud (EC2, GCP CE).

## Trade-off của virtualization

| Pros | Cons |
|---|---|
| Tận dụng hardware (60-80% thay vì <20%) | Mất ~5-15% performance vì overhead hypervisor |
| Isolation mạnh giữa workload | RAM phân chia cứng — không "share" được giữa VM |
| Tạo VM mới trong phút | Disk I/O có thể bottleneck khi nhiều VM |
| Snapshot, clone, migrate dễ | Cần CPU hỗ trợ (VT-x/AMD-V) |
| Backup là copy file | Phải quản lý lifecycle VM (sprawl) |
| Multi-tenant trên cùng phần cứng | Security boundary chưa bằng máy vật lý riêng |

Khi nào KHÔNG nên dùng VM?
- **Workload high-frequency trading** — cần latency dưới microsecond → bare-metal.
- **GPU training ML** — cần passthrough GPU, overhead ảnh hưởng → dùng container hoặc bare-metal.
- **Database OLTP siêu lớn** — đôi khi bare-metal tối ưu hơn (Oracle, SAP HANA).

## Mối liên kết với Cloud Computing

**Cloud = virtualization + automation + multi-tenancy + pay-per-use**.

AWS EC2 (Elastic Compute Cloud) khi tạo "instance" thực ra là **VM trên hypervisor riêng của AWS** (gọi là **Nitro** từ 2018, trước đó là Xen). GCP, Azure tương tự.

Không có virtualization → không có public cloud. Đây là vì sao **học virtualization là tiền đề học cloud**.

## Tóm tắt bài 1

- Virtualization = chia phần cứng thành nhiều VM cô lập, mỗi VM có OS riêng.
- Sinh ra từ vấn đề **server over-provisioned, tài nguyên bỏ phí** thời 2000s.
- Hypervisor là phần mềm trung gian quản lý VM. CPU **VT-x/AMD-V** giúp tăng tốc.
- Snapshot ≠ backup; container ≠ VM (share kernel, không có OS riêng).
- Cloud computing **dựa trên** virtualization.
- Trade-off: overhead 5-15%, nhưng đổi lại flexibility + utilization khổng lồ.

**Bài kế tiếp** → [Bài 2: Hypervisor Type 1 và Type 2 — đào sâu kiến trúc và khi nào dùng cái nào](02-hypervisor-types.md)

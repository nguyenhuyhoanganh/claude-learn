# Bài 3: Cài đặt Docker

## Tổng quan

Docker có thể cài trên ba hệ điều hành chính: macOS, Windows, và Linux. Cách cài đặt khác nhau tùy OS và yêu cầu hệ thống.

```text
macOS/Windows mới   → Docker Desktop (khuyến nghị)
macOS/Windows cũ    → Docker Toolbox (legacy)
Linux               → Docker Engine trực tiếp
```

---

## 1. Docker Desktop cho macOS

### Yêu cầu hệ thống
- Hardware: Mac từ 2010 trở về sau
- macOS 10.14 (Mojave) hoặc mới hơn
- RAM: ít nhất 4 GB

### Cài đặt

1. Truy cập **docker.com** → Developers → Docs → Download and Install → Docker Desktop for Mac
2. Tải về file `.dmg`
3. Mở file `.dmg`, kéo Docker vào Applications
4. Chạy Docker từ Applications

### Sau khi cài

- Biểu tượng con cá voi 🐳 sẽ hiện trên thanh menu (status bar)
- Docker cần **đang chạy** trước khi bạn dùng bất kỳ lệnh Docker nào
- Vào Preferences để cấu hình (memory, CPU, disk...)

> **Quan trọng:** Nếu thấy icon con cá voi trên menu bar → Docker đang chạy. Không có icon → Docker chưa được start.

---

## 2. Docker Desktop cho Windows

### Yêu cầu hệ thống
- Windows 10 Pro/Enterprise/Education: cần Hyper-V và Containers features
- Windows 10 Home: cần WSL 2 (Windows Subsystem for Linux 2)
- Windows 11: hỗ trợ tốt với cả hai phương thức

### Cài đặt trên Windows 10 Pro/Enterprise/Education

**Bước 1:** Kích hoạt Hyper-V (chạy PowerShell với quyền Administrator)
```powershell
Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V -All
```

**Bước 2:** Kích hoạt Containers feature
```powershell
Enable-WindowsOptionalFeature -Online -FeatureName Containers -All
```

**Bước 3:** Tải và chạy Docker Desktop installer từ docker.com

### Cài đặt trên Windows 10 Home (dùng WSL 2)

**Bước 1:** Kích hoạt WSL
```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
```

**Bước 2:** Kích hoạt Virtual Machine Platform
```powershell
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

**Bước 3:** Tải Linux kernel update package từ Microsoft

**Bước 4:** Set WSL 2 làm default
```powershell
wsl --set-default-version 2
```

**Bước 5:** Cài một Linux distribution (ví dụ: Ubuntu từ Microsoft Store)

**Bước 6:** Tải và chạy Docker Desktop installer

### Sau khi cài

- Icon Docker xuất hiện trên System Tray
- Mở terminal (Command Prompt hoặc PowerShell) và kiểm tra:
```bash
docker --version
```

---

## 3. Docker trên Linux

Linux là OS "native" của Docker — cài đặt đơn giản nhất, không cần VM hay các bước phức tạp.

### Ubuntu/Debian
```bash
# Cập nhật package index
sudo apt-get update

# Cài các package cần thiết
sudo apt-get install ca-certificates curl gnupg lsb-release

# Thêm Docker GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Thêm Docker repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Cài Docker Engine
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Thêm user vào docker group (để không cần sudo)
sudo usermod -aG docker $USER
newgrp docker
```

### CentOS/RHEL/Fedora
```bash
# Cài Docker qua dnf (Fedora)
sudo dnf install docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker
```

---

## 4. Docker Toolbox (cho hệ thống cũ)

Nếu không đáp ứng yêu cầu của Docker Desktop, dùng **Docker Toolbox** (công cụ legacy):

- Dùng VirtualBox tạo một VM Linux nhỏ
- Docker chạy bên trong VM đó
- Bạn tương tác qua **Docker Quickstart Terminal**

> **Lưu ý:** Docker Toolbox không còn được khuyến nghị. Nên nâng cấp OS nếu có thể để dùng Docker Desktop.

---

## 5. Kiểm tra cài đặt thành công

Sau khi cài, mở terminal và chạy:

```bash
# Kiểm tra version Docker
docker --version
# Output: Docker version 24.x.x, build xxxxxxx

# Kiểm tra Docker đang chạy
docker info

# Chạy container test đầu tiên
docker run hello-world
```

Nếu thấy thông báo `Hello from Docker!` → cài đặt thành công!

### Sáu lỗi cài đặt hay gặp

Bảng này giải quyết gần hết các trường hợp "cài xong mà không chạy được".

| Thông báo lỗi | Nguyên nhân | Cách xử lý |
|---|---|---|
| `Cannot connect to the Docker daemon at unix:///var/run/docker.sock` | **Docker chưa chạy** (không phải chưa cài) | macOS/Windows: mở Docker Desktop. Linux: `sudo systemctl start docker` |
| `permission denied while trying to connect to the Docker daemon socket` | Trên Linux, user chưa thuộc nhóm `docker` | `sudo usermod -aG docker $USER` rồi **đăng xuất và đăng nhập lại** |
| `WSL 2 installation is incomplete` | Windows thiếu nhân WSL2 | Chạy `wsl --update` trong PowerShell quyền quản trị |
| `Hardware assisted virtualization... not enabled` | Chưa bật ảo hoá trong BIOS | Vào BIOS bật `Intel VT-x` hoặc `AMD-V` |
| `no matching manifest for linux/arm64/v8` | Máy Apple Silicon (M1–M4) chạy image chỉ có bản x86 | Thêm `--platform linux/amd64` (chậm hơn vì phải giả lập) |
| `docker: 'compose' is not a docker command` | Docker Engine trên Linux không kèm Compose | Cài thêm gói `docker-compose-plugin` |

Riêng dòng thứ hai đáng nói kỹ, vì nó vừa là lỗi hay gặp nhất trên Linux vừa có ý nghĩa bảo mật:

```bash
# Cách chữa nhanh nhưng SAI về lâu dài
sudo docker run hello-world      # phải gõ sudo mọi lệnh, rất phiền

# Cách chuẩn
sudo usermod -aG docker $USER
newgrp docker                    # hoặc đăng xuất rồi đăng nhập lại
docker run hello-world           # không cần sudo nữa
```

> **Cần biết trước khi làm**: thêm user vào nhóm `docker` **tương đương cấp quyền root cho user đó**. Lý do: ai gọi được Docker daemon thì gắn được thư mục gốc `/` của máy vào một container rồi sửa bất cứ gì. Trên máy cá nhân thì chấp nhận được; trên máy chủ dùng chung thì cân nhắc kỹ, hoặc dùng **rootless mode** của Docker.

### Kiểm tra sâu hơn `docker --version`

`docker --version` chỉ cho biết **CLI** đã cài. Nó vẫn in ra kết quả kể cả khi daemon đang chết. Muốn chắc chắn thì:

```bash
docker info --format '{{.ServerVersion}} | {{.OperatingSystem}} | {{.Architecture}}'
```

```text
27.3.1 | Docker Desktop | aarch64
```

Lệnh này chỉ chạy được khi **daemon thật sự đang phục vụ** — đó mới là thứ cần xác nhận. Cột `Architecture` cũng cho bạn biết máy đang là ARM hay x86, thứ quyết định dòng lỗi thứ năm trong bảng trên.

---

## 6. IDE cho Docker

Khuyến nghị dùng **Visual Studio Code** với extension:
- **Docker** (ms-azuretools.vscode-docker): Hỗ trợ syntax highlighting cho Dockerfile, quản lý containers từ UI
- **Prettier**: Auto-format code

---

## Tóm tắt

| OS | Tool | Ghi chú |
|---|---|---|
| macOS mới | Docker Desktop | Kéo thả, đơn giản |
| Windows 10+ | Docker Desktop | Cần kích hoạt Hyper-V hoặc WSL2 |
| Linux | Docker Engine | Native, không cần Desktop |
| OS cũ | Docker Toolbox | Legacy, dùng VirtualBox |

---

**Bài kế tiếp** → [Bài 4: Hệ sinh thái công cụ Docker](04-he-sinh-thai-cong-cu-docker.md)

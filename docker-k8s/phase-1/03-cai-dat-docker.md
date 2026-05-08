# Bài 3: Cài đặt Docker

## Tổng quan

Docker có thể cài trên ba hệ điều hành chính: macOS, Windows, và Linux. Cách cài đặt khác nhau tùy OS và yêu cầu hệ thống.

```
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

**Tiếp theo:** Tổng quan các công cụ Docker và chạy container đầu tiên →

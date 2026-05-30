# Bài 2: Cài đặt công cụ DevOps cơ bản — VirtualBox, Vagrant, Git, JDK, Maven, AWS CLI

Bài này không chỉ "click rồi cài". Mỗi tool ta sẽ giải thích **tool đó là gì, vì sao phải có, version nào phù hợp, bẫy phổ biến**. Setup máy không hiểu công cụ → khi gặp lỗi sẽ tê liệt.

## Bộ tool xuyên suốt khoá

| Tool | Vai trò | Section sử dụng |
|---|---|---|
| **VirtualBox / VMware Fusion** | Hypervisor — tạo VM | 03 (VM Setup) trở đi |
| **Vagrant** | Tự động hoá VM | 03, 06, 08 |
| **Git Bash** (chỉ Windows) | Bash shell trên Windows | 04, 05 |
| **JDK 17** (Corretto) | Java runtime | 16, 17 (build + Jenkins) |
| **Maven** | Java build tool | 08, 16, 17 |
| **AWS CLI** | Quản lý AWS qua CLI | 13-15, 24-25 |
| **VS Code** | Code editor | Toàn bộ khoá |
| **IntelliJ IDEA** | IDE cho Java (optional) | 16, 17 |
| **Sublime Text** | Editor nhẹ (optional) | Tuỳ |

## Lệnh cài nhanh

### Windows (PowerShell admin)

```powershell
# Hypervisor + VM automation
choco install virtualbox -y
choco install vagrant -y

# Shell + version control
choco install git -y

# Java + Maven (build tools)
choco install corretto17jdk -y
choco install maven -y

# Cloud + Editor
choco install awscli -y
choco install vscode -y
choco install intellijidea-community -y
choco install sublimetext3 -y
```

### macOS (Terminal)

```bash
# Mac Intel chip
brew install --cask virtualbox

# Mac M1/M2/M3 (không có VirtualBox cho ARM)
brew install --cask vmware-fusion

# Tool còn lại — cả Intel và ARM dùng chung
brew install --cask vagrant
brew install git
brew install --cask corretto@17
brew install maven
brew install awscli
brew install --cask visual-studio-code
brew install --cask intellij-idea-ce
brew install --cask sublime-text
```

## Đi sâu vào từng tool

### 1. VirtualBox / VMware Fusion — Hypervisor Type 2

**Hypervisor** = phần mềm cho phép chạy nhiều OS song song trên một máy vật lý.

| Loại | Chạy trên | Ví dụ | Khi nào |
|---|---|---|---|
| Type 1 (bare-metal) | Phần cứng trần | VMware ESXi, Xen, Hyper-V, KVM | Production data center |
| **Type 2 (hosted)** | OS có sẵn | **VirtualBox**, VMware Workstation/Fusion, Parallels | Dev/lab |

Trong khoá này dùng Type 2 vì lab học tập.

**Lưu ý quan trọng cho Mac M1/M2/M3 (ARM)**: VirtualBox **chưa hỗ trợ Apple Silicon ổn định** đến đầu 2026. Mac M-series phải dùng:
- **VMware Fusion** (free for personal use từ 2024) — phổ biến nhất.
- **Parallels Desktop** — trả phí, mạnh nhất nhưng đắt.
- **UTM** — open-source, miễn phí.

### 2. Vagrant — VM tự động hoá

Vagrant **không phải hypervisor**. Vagrant là tool **viết script khai báo VM**. Nó nhờ hypervisor (VirtualBox/VMware) tạo VM thật.

```ruby
# Vagrantfile
Vagrant.configure("2") do |config|
  config.vm.box = "ubuntu/jammy64"
  config.vm.network "private_network", ip: "192.168.56.10"
  config.vm.provider "virtualbox" do |vb|
    vb.memory = 2048
    vb.cpus = 2
  end
  config.vm.provision "shell", inline: <<-SHELL
    apt-get update
    apt-get install -y nginx
  SHELL
end
```

```bash
vagrant up        # tạo VM, cài nginx, sẵn sàng
vagrant ssh       # SSH vào
vagrant halt      # tắt
vagrant destroy   # xoá
```

Tại sao Vagrant quan trọng cho khoá này: section 03, 06, 08 đều tạo multi-node lab (web + DB + cache + LB). Tạo tay 4 VM mất 30 phút. Với Vagrant chỉ vài giây cho `vagrant up`.

### 3. Git Bash (chỉ Windows) — Linux shell trên Windows

Mặc định Windows có:
- **CMD** — shell cũ, syntax khác hẳn Linux.
- **PowerShell** — shell hiện đại, nhưng vẫn không phải Bash.

DevOps engineer **bắt buộc** biết Bash vì:
- Đa số tutorial, blog, doc dùng Bash.
- Server production đa phần là Linux → Bash.
- Script CI/CD viết bằng Bash chiếm > 70%.

`choco install git -y` cài luôn **Git Bash** — một terminal có MinGW + Bash. Sau khi cài, search "Git Bash" trong Start menu.

Trong Git Bash, mọi lệnh `ls`, `grep`, `awk`, `sed` chạy như trên Linux. Đây là môi trường thực hành phase Linux (section 04).

> Lựa chọn khác: **WSL2** (Windows Subsystem for Linux) — chạy Ubuntu thật trong Windows, mạnh hơn Git Bash nhưng cài phức tạp hơn. Tham khảo nếu muốn full Linux experience.

### 4. JDK 17 (Amazon Corretto)

**JDK** (Java Development Kit) = bộ công cụ để **compile và chạy** Java. Khác **JRE** (Java Runtime Environment) chỉ chạy được, không compile.

Tại sao **17**? Đây là **LTS (Long-Term Support)** version phổ biến nhất 2024-2026. Trước đó là JDK 8 và 11. Project mới nên dùng 17 hoặc 21.

Tại sao **Corretto**? Đây là distribution của Amazon, **free, LTS support, an toàn để dùng commercial**. Lựa chọn khác:
- **Oracle JDK** — chính chủ nhưng license phức tạp cho commercial từ 2019.
- **OpenJDK** — bản open-source gốc, ai cũng build được.
- **Adoptium / Eclipse Temurin** — community build của OpenJDK.
- **Azul Zulu** — free + paid support.

Trong khoá này dùng Corretto 17 vì lab tích hợp AWS, Corretto là default AWS recommend.

Verify cài đúng:

```bash
java -version
# openjdk version "17.0.x"

javac -version
# javac 17.0.x

echo $JAVA_HOME   # macOS/Linux
echo %JAVA_HOME%  # Windows
```

`JAVA_HOME` biến môi trường **bắt buộc** đặt đúng cho Maven, Jenkins, Tomcat... Nếu không có:

```bash
# macOS
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc

# Linux
export JAVA_HOME=/usr/lib/jvm/java-17-amazon-corretto

# Windows (System Properties → Environment Variables)
JAVA_HOME = C:\Program Files\Amazon Corretto\jdk17.x.x_y
```

### 5. Maven — Java build tool

**Maven** = tool **build, dependency management, packaging** cho Java. Tương đương `npm` cho Node.js, `pip` cho Python, `cargo` cho Rust.

Mỗi project Java có file `pom.xml`:

```xml
<project>
    <modelVersion>4.0.0</modelVersion>
    <groupId>com.acme</groupId>
    <artifactId>payment-service</artifactId>
    <version>1.0.0</version>
    <packaging>jar</packaging>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
            <version>3.2.0</version>
        </dependency>
    </dependencies>
</project>
```

Lệnh hay dùng:

```bash
mvn compile           # Compile source
mvn test              # Compile + run test
mvn package           # Compile + test + tạo jar/war
mvn install           # Cài lên local repo (~/.m2)
mvn deploy            # Upload lên remote repo (Nexus, Artifactory)
mvn clean             # Xoá target/
mvn -DskipTests package   # Build nhưng skip test (chỉ dùng khi cần nhanh)
```

Đây là **một trong những tool quan trọng nhất** khoá này — phase CI/CD sẽ dùng liên tục.

Verify:

```bash
mvn --version
# Apache Maven 3.9.x
# Java version: 17.x.y
```

### 6. AWS CLI — quản lý AWS qua command line

AWS có **3 cách** tương tác:

| Cách | Dùng khi |
|---|---|
| **Console** (web UI) | Click chuột, học, demo |
| **CLI** | Script, automation, CI/CD |
| **SDK** (Python/Java/JS...) | Code trong app |

DevOps engineer dùng **CLI** chủ yếu vì:
- Script được — đưa vào pipeline.
- Audit được — log lệnh.
- Reproducible — chạy lại được.

Verify cài:

```bash
aws --version
# aws-cli/2.x.y Python/3.x.x ...
```

Cấu hình credential (làm sau khi có AWS account ở bài 4):

```bash
aws configure
# AWS Access Key ID: AKIA...
# AWS Secret Access Key: ...
# Default region name: us-east-1
# Default output format: json
```

Lệnh thử ngay:

```bash
aws sts get-caller-identity      # Tôi là ai trong AWS?
aws s3 ls                        # Danh sách bucket
aws ec2 describe-instances       # Danh sách EC2
```

### 7. VS Code — code editor

Lý do chọn VS Code làm primary editor:
- **Miễn phí**, mã nguồn mở (về cơ bản).
- **Extension cực phong phú** — mỗi ngôn ngữ + DevOps tool đều có ext.
- **Remote development** — SSH, container, WSL.
- **Tích hợp Git, Terminal, Docker, K8s** sẵn.

Extensions DevOps nên cài:

| Extension | Mục đích |
|---|---|
| Docker | Quản lý container, Dockerfile syntax |
| Kubernetes | YAML schema, kubectl integration |
| HashiCorp Terraform | Syntax + linting |
| YAML | JSON schema cho K8s, GitHub Actions |
| GitLens | Git blame, history nâng cao |
| Remote - SSH | Mở folder trên server từ xa |
| AWS Toolkit | Quản lý AWS từ editor |
| Ansible | Syntax + linting |
| Jenkinsfile Support | Jenkinsfile syntax |

### 8. IntelliJ IDEA — IDE cho Java

Cho phase build + Jenkins (section 16-17), IntelliJ tốt hơn VS Code vì:
- Refactor Java mạnh nhất ngành.
- Maven/Gradle integration sâu.
- Debug đa luồng chuyên nghiệp.

Bản **Community Edition** (CE) free đủ cho khoá này. Bản **Ultimate** (trả phí) thêm Spring, JPA, web framework support.

### 9. Sublime Text — editor nhẹ

Một editor cũ nhưng vẫn được dùng. Trong khoá này **không bắt buộc** — có VS Code là đủ. Cài nếu thích.

## Sơ đồ phụ thuộc

```text
              ┌─────────────┐
              │  Host OS    │ (Windows / macOS)
              └──────┬──────┘
                     │
        ┌────────────┼────────────────────┐
        │            │                    │
        ▼            ▼                    ▼
┌─────────────┐ ┌────────┐    ┌──────────────────────┐
│ Hypervisor  │ │ Git +  │    │ JDK + Maven          │
│ (VBox/VMW)  │ │ Bash   │    │  └─ pom.xml, deps    │
└──────┬──────┘ └────┬───┘    │  └─ build artifact   │
       │             │        └──────────────────────┘
       ▼             ▼
┌────────────┐  ┌──────────────┐  ┌──────────────┐
│ VM (lab)   │  │ Editor       │  │ AWS CLI      │
│ + Vagrant  │  │ (VS Code)    │  │ + creds      │
└────────────┘  └──────────────┘  └──────────────┘
       │
       ▼
  Linux training, multi-node, CI lab
```

## Verify một lần cuối — script kiểm tra toàn bộ

Lưu vào `verify-tools.sh` và chạy:

```bash
#!/bin/bash
# verify-tools.sh

set -e

echo "=== Verifying DevOps toolchain ==="

check() {
    if command -v "$1" &> /dev/null; then
        echo "✓ $1: $($2)"
    else
        echo "✗ $1 KHÔNG CÀI"
        exit 1
    fi
}

check git    "git --version"
check java   "java -version 2>&1 | head -n1"
check mvn    "mvn --version 2>&1 | head -n1"
check aws    "aws --version 2>&1"
check vagrant "vagrant --version"
check code   "code --version | head -n1"

echo "=== Tất cả OK! ==="
```

Trên Windows tương đương file `.ps1`:

```powershell
$tools = @("git", "java", "mvn", "aws", "vagrant", "code")
foreach ($t in $tools) {
    if (Get-Command $t -ErrorAction SilentlyContinue) {
        Write-Host "✓ $t OK"
    } else {
        Write-Host "✗ $t KHÔNG CÀI" -ForegroundColor Red
    }
}
```

## Bẫy thường gặp

| Bẫy | Triệu chứng | Giải pháp |
|---|---|---|
| Có nhiều version Java | `java -version` ra version cũ | Set lại `JAVA_HOME`, xoá Java cũ |
| Maven không thấy Java | `mvn -version` báo `JAVA_HOME not found` | Set biến môi trường + reload shell |
| AWS CLI v1 vs v2 | Lệnh khác nhau | Luôn dùng v2 (2024+) |
| VirtualBox conflict Hyper-V (Win) | VBox fail "VT-x disabled" | Tắt Hyper-V hoặc dùng VMware Workstation |
| Vagrant không tìm thấy provider | `vagrant up` báo "no provider" | Cài VirtualBox/VMware trước Vagrant |
| Git Bash + Windows path | Path có `C:\` không hiểu | Dùng `/c/Users/...` thay |
| M1 Mac cài VirtualBox | Crash/fail | Dùng VMware Fusion thay |
| AWS CLI lỗi `Unable to locate credentials` | Chưa configure | Chạy `aws configure` hoặc set biến môi trường |

## Khi nào KHÔNG dùng package manager?

Hiếm, nhưng có:
- **Tool offline-only**, không lên repo công cộng.
- **Cần version cực cụ thể** mà repo không có (vd patch nội bộ).
- **Compliance** yêu cầu binary từ vendor chính chủ, có chữ ký số riêng.
- **Build từ source** để tối ưu performance hoặc bật flag custom.

Phần lớn trường hợp, package manager là lựa chọn đúng.

## Tóm tắt bài 2

- 9 tool nền tảng cho toàn khoá. Mỗi tool đóng vai trò trong DevOps pipeline.
- **VirtualBox** không chạy Mac M1 → **VMware Fusion** thay.
- **JDK 17 Corretto** là chuẩn LTS — đặt `JAVA_HOME` bắt buộc.
- **Maven** = `pom.xml` + dependency + build artifact.
- **AWS CLI v2** + `aws configure` sau khi có account.
- Verify script đảm bảo môi trường ổn trước khi sang bài tiếp theo.

**Bài kế tiếp** → [Bài 3: Tạo tài khoản GitHub, Docker Hub, SonarCloud và (tùy chọn) mua domain](03-tai-khoan-github-dockerhub-sonar.md)

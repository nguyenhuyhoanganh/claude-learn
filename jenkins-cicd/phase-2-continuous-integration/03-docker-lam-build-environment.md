# Bài 3: Docker làm build environment cho pipeline

Bài 2 bạn chạy `npm install`, `npm run build`, `npm test` trên máy local. Giờ phải đưa các lệnh đó lên Jenkins. Nhưng Jenkins container (mặc định) **không có `npm`**. Bài này giải quyết: dùng **Docker image** cho từng stage để có đúng tool cần thiết.

## Vấn đề: Jenkins không có Node.js

Tạo nhanh pipeline thử:

```groovy
pipeline {
    agent any
    stages {
        stage('Check tools') {
            steps {
                sh 'npm --version'
            }
        }
    }
}
```

Build → **FAILURE**. Log:

```text
+ npm --version
/var/jenkins_home/workspace/...@tmp/durable-xxx/script.sh: npm: not found
script returned exit code 127
```

→ Container Jenkins chỉ có Java + tool cơ bản (bash, git, curl). Không có Node.js. Tương tự sẽ không có Python, Java JDK, Go, PHP...

## 2 cách giải quyết

### Cách 1: Cài Node.js trực tiếp vào container Jenkins

Sửa `Dockerfile` của Jenkins:

```dockerfile
FROM jenkins/jenkins:lts

USER root
RUN apt-get update && apt-get install -y nodejs npm
USER jenkins
```

→ Hoạt động nhưng **nhược điểm lớn**:

- Một version Node.js cho **tất cả** project. Project A cần Node 18, project B cần Node 20 → conflict.
- Mỗi lần đổi tool / version → rebuild Jenkins image, restart toàn bộ.
- Image Jenkins phình to (Java + Node + Python + Java JDK + ...).
- Khi cần thêm tool mới phải tìm package + cài + rebuild → chậm.

### Cách 2: Dùng Docker image riêng cho mỗi stage (Jenkins → Docker-in-Docker)

Trong Jenkinsfile, mỗi stage có thể chạy **bên trong một container Docker** riêng:

```groovy
stage('Build') {
    agent {
        docker { image 'node:18-alpine' }   // ← Stage này chạy trong container node:18-alpine
    }
    steps {
        sh 'npm --version'                   // ← Lệnh này chạy trong container đó
    }
}
```

→ Jenkins **tự pull image, spin up container, chạy lệnh, xoá container**. Bạn không phải cài gì.

**Ưu điểm**:

- Mỗi project / stage có version Node.js riêng.
- Tool nào cần → khai báo image tương ứng (`python:3.11`, `openjdk:17`, `golang:1.21`, `mcr.microsoft.com/dotnet/sdk:8.0`...).
- Jenkins image giữ mỏng manh, ít bảo trì.
- Reproducible 100% — môi trường build định nghĩa ngay trong code repo.

→ Đây là cách **chuẩn modern**. Khoá học dùng cách này.

## Setup: cài plugin Docker Pipeline

Để dùng `agent { docker { ... } }`, cần **Docker Pipeline plugin**. Cài qua UI:

1. **Manage Jenkins** → **Plugins** → tab **Available plugins**.
2. Search `Docker Pipeline`.
3. Tick → **Install** (và optionally tick "Restart after install").

> Plugin này tự pull Docker image từ Docker Hub, mount workspace, gửi lệnh vào container.

## Setup: Jenkins container phải biết Docker

Đây là chỗ tricky: bản thân **Jenkins đang chạy trong Docker container** (do `docker-compose.yml` Phase 1 bài 2). Giờ Jenkins muốn **gọi `docker`** để spin container con → cần **Docker socket** truy cập.

Trong `docker-compose.yml` (file Phase 1 dùng để cài Jenkins) đã có sẵn:

```yaml
services:
  jenkins:
    ...
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock     # ← Mount Docker socket
```

→ Container Jenkins **share Docker daemon** với host. Khi Jenkins gõ `docker run ...`, không tạo container **trong** Jenkins (Docker-in-Docker), mà gửi lệnh ra host → tạo container **cạnh** Jenkins.

```text
Host Machine (Mac/Windows/Linux)
├── Docker Daemon
│   ├── jenkins (container)            ← Jenkins chạy ở đây
│   │   └── share /var/run/docker.sock
│   │
│   ├── node:18-alpine (container)     ← Jenkins spin lên cho stage Build
│   ├── python:3.11 (container)        ← (Stage khác, project khác)
│   └── ...
```

→ Pattern này gọi là **Docker-out-of-Docker (DooD)** — container Jenkins gọi Docker host. Đơn giản hơn DinD và phổ biến hơn.

## Pipeline sử dụng Docker image

Sửa pipeline `test-npm`:

```groovy
pipeline {
    agent any
    stages {
        stage('Without Docker') {
            steps {
                sh 'echo "Stage chạy thẳng trên Jenkins"'
            }
        }
        stage('With Docker') {
            agent {
                docker { image 'node:18-alpine' }     // ← Spin container node:18-alpine
            }
            steps {
                sh 'echo "Stage chạy trong container Node.js"'
                sh 'npm --version'                     // ← Bây giờ chạy được!
                sh 'node --version'
            }
        }
    }
}
```

Build lần đầu → mất ~30-60 giây do **pull image** `node:18-alpine` (lần đầu). Log:

```text
[Pipeline] stage
[Pipeline] { (With Docker)
[Pipeline] withDockerContainer
$ docker pull node:18-alpine
...
$ docker run -t -d -u 1000:1000 --name <container_id> \
    -w /var/jenkins_home/workspace/test-npm \
    -v /var/jenkins_home/workspace/test-npm:/var/jenkins_home/workspace/test-npm \
    -e ...others... node:18-alpine cat
[Pipeline] sh
+ npm --version
9.6.7
+ node --version
v18.18.2
[Pipeline] }
$ docker stop <container_id>
$ docker rm <container_id>
```

**Quan trọng**: log cho thấy đầy đủ:

1. `docker pull node:18-alpine` — kéo image (cached lần sau).
2. `docker run -d ... cat` — start container background (chạy `cat` để giữ alive).
3. `+ npm --version`, `+ node --version` — exec lệnh **bên trong** container.
4. `docker stop`, `docker rm` — dọn container khi stage xong.

Lần build sau → bỏ qua `docker pull` (đã cache) → **rất nhanh** (~4s).

## Tag image: chọn version

Cú pháp `image: '<repo>:<tag>'`:

```groovy
docker { image 'node:18-alpine' }       // Node 18, Alpine Linux (~150MB)
docker { image 'node:20' }              // Node 20, Debian (~1GB)
docker { image 'node:18.18.2' }         // Pin chính xác version
docker { image 'python:3.11-slim' }     // Python 3.11
docker { image 'maven:3.9-eclipse-temurin-17' }  // Maven + JDK 17
```

**Best practice**:

- **Pin tag** (`18.18.2`) khi muốn reproducible tuyệt đối.
- **Tag major** (`18`) khi OK với patch update tự động.
- **Tránh `latest`** — không biết version nào → khó debug.
- Thích **Alpine** (`-alpine`) khi muốn image nhỏ, pull nhanh. Lưu ý: Alpine dùng `musl` libc, **có thể** lỗi với 1 số native binary (rare nhưng có).

Browse image tại <https://hub.docker.com>.

## Troubleshooting Docker trong Jenkins

Phần dưới giải quyết các lỗi **rất** hay gặp khi pipeline dùng Docker.

### Lỗi: `error during connect`

```text
error during connect: Get "http://%2Fvar%2Frun%2Fdocker.sock/v1.41/...":
  dial unix /var/run/docker.sock: connect: connection refused
```

→ Container Jenkins **không thấy** Docker daemon.

**Nguyên nhân thường gặp**: Docker Desktop **vẫn chạy** nhưng container Jenkins **mất connect** sau khi máy sleep/restart.

**Fix**: stop + start lại đúng cách:

```bash
cd install-jenkins-docker         # Thư mục Jenkins setup
docker compose down                # Dừng container Jenkins
docker compose up -d               # Khởi động lại
```

→ Sau đó vào Jenkins UI → reload trang → build lại → OK.

### Lỗi: container Jenkins-Docker bị "exited" treo

Mở Docker Desktop → tab **Containers**. Đôi khi thấy:

```text
install-jenkins-docker (group)
├── jenkins         Running
└── jenkins-docker  Exited        ← Bị treo
```

→ `docker compose down` + `docker compose up -d` để reset cả 2.

Nếu thấy một container **riêng lẻ ngoài group `install-jenkins-docker`** đang chạy → xoá đi (icon thùng rác). Đó là container ghost từ session cũ.

### Lỗi: `invalid agent type docker`

→ Plugin **Docker Pipeline** chưa cài. Vào Manage Jenkins → Plugins → cài.

### Lỗi: cú pháp `agent`

```groovy
agent {
    docker 'node:18-alpine'                  // ← SAI: thiếu wrap image
}

agent {
    docker { image: 'node:18-alpine' }       // ← SAI: dùng dấu : (Groovy map syntax)
}

agent {
    docker { image 'node:18-alpine' }        // ← ĐÚNG
}
```

→ Groovy DSL: nội bộ `docker { ... }` là block, mỗi property là `key value` (không có dấu `:`).

### Lỗi quote không nhất quán

```groovy
docker { image node:18-alpine }              // ← SAI: thiếu quote
docker { image 'node:18-alpine' }            // ← ĐÚNG: single quote
docker { image "node:18-alpine" }            // ← ĐÚNG: double quote
docker { image 'node:18 alpine' }            // ← SAI: có space trong tên image
```

## Hai mức `agent` trong pipeline

Có thể đặt `agent` ở **cấp pipeline** (apply cho tất cả stage) hoặc **cấp stage** (override cho stage cụ thể):

```groovy
pipeline {
    agent any                              // ← Default cho mọi stage
    stages {
        stage('Without Docker') {
            steps { sh 'echo "Default agent"' }     // Dùng `any`
        }
        stage('With Docker') {
            agent {                                  // ← Override cho stage này
                docker { image 'node:18-alpine' }
            }
            steps { sh 'npm --version' }
        }
    }
}
```

Hoặc apply Docker cho toàn pipeline:

```groovy
pipeline {
    agent {
        docker { image 'node:18-alpine' }     // ← Tất cả stage chạy trong container này
    }
    stages {
        stage('Build') { steps { sh 'npm ci' } }
        stage('Test')  { steps { sh 'npm test' } }
    }
}
```

→ Tuỳ project. Project đơn giản (1 ngôn ngữ) → set ở cấp pipeline. Project phức tạp (build C++ + test Python) → set ở cấp stage.

## Args bổ sung cho Docker

`agent { docker { ... } }` hỗ trợ nhiều option:

```groovy
agent {
    docker {
        image 'node:18-alpine'
        args  '-u root --network host'          // Truyền argument vào `docker run`
        reuseNode true                          // Chia sẻ workspace (Bài 4)
        registryUrl 'https://my-registry/'      // Private registry
        registryCredentialsId 'my-creds-id'
    }
}
```

### `args '-u root'` — dùng root user

Mặc định Jenkins start container với user `jenkins` (UID 1000). Đôi khi cần root để cài package global:

```groovy
args '-u root'
```

> **Cảnh báo** (bài 7 sẽ gặp): chạy root → file tạo ra trong workspace thuộc root → sau khi container exit, Jenkins (user 1000) không có quyền sửa/xoá. **Tránh** root trừ khi bắt buộc; thay vì cài global, hãy cài local vào `node_modules/.bin/` (bài 7).

## Tóm tắt

- Container Jenkins **không có** Node.js, Python, ... Cần cách bổ sung tool.
- **Cách tốt nhất**: `agent { docker { image '...' } }` cho từng stage → mỗi stage tự dùng image phù hợp.
- Cần cài plugin **Docker Pipeline** + container Jenkins phải mount `/var/run/docker.sock` (đã có sẵn trong khoá).
- Pattern này gọi là **Docker-out-of-Docker** — Jenkins gửi lệnh tới Docker daemon host, container con chạy cạnh Jenkins.
- Lỗi `error during connect` thường do Docker daemon mất kết nối → `docker compose down/up`.
- Tag image cẩn thận: pin major hoặc patch. Tránh `latest`.
- `agent` đặt ở pipeline-level hoặc stage-level. Override stage là pattern phổ biến.
- `args '-u root'` cấp quyền root cho container — dùng dè dặt.

---

→ [Bài tiếp theo: Git + Jenkins và Workspace Synchronization](04-git-jenkins-va-workspace-sync.md)

# Bài 4: Git + Jenkins và Workspace Synchronization

Bài 3 bạn đã hiểu cách Jenkins dùng Docker image làm build env. Còn 2 mảnh ghép cuối cùng trước khi build pipeline thật:

1. **Đưa Jenkinsfile vào Git repo** (thay vì textarea UI).
2. **Hiểu workspace sync** giữa stage không-Docker và stage Docker (đây là pitfall lớn).

## Phần 1: Đưa Jenkinsfile vào repo

### Bước 1: Tạo file `Jenkinsfile`

Trong project (Codespaces hoặc VS Code local), **ở root** của repo, tạo file mới tên **`Jenkinsfile`** (chính xác, không đuôi `.txt`, không lowercase):

```text
learn-jenkins-app/
├── src/
├── public/
├── package.json
├── README.md
└── Jenkinsfile         ← ← ← Tạo file này
```

Nội dung khởi đầu:

```groovy
pipeline {
    agent any
    stages {
        stage('Hello') {
            steps {
                echo 'Hello from Jenkinsfile in Git'
            }
        }
    }
}
```

### Bước 2: Commit & push

Trong terminal (project):

```bash
git add Jenkinsfile
git commit -m "Add initial Jenkinsfile"
git push
```

Trong Codespaces: dùng tab **Source Control** (icon 3 chấm bên trái) → stage file → commit message → ✓ Commit → click **Sync Changes** để push.

Lần đầu push, Codespaces có thể hỏi:
- *"Always stage all changes?"* → **Yes** (cho tiện).
- *"OK to authenticate?"* → **OK**.

### Bước 3: Tạo Jenkins job đọc từ Git

Trên Jenkins UI:

1. Dashboard → **+ New Item** → tên `learn-jenkins-app` → chọn **Pipeline** → **OK**.
2. Cuộn xuống section **Pipeline**.
3. Trong dropdown **Definition**, chọn **Pipeline script from SCM** (thay cho default *"Pipeline script"*).
4. **SCM**: chọn **Git**.
5. **Repository URL**: vào trang repo GitHub của bạn → nút **Code** → tab **Local** → **HTTPS** → copy URL (dạng `https://github.com/<your-username>/learn-jenkins-app.git`).
6. **Credentials**: để trống (repo public, không cần auth).
7. **Branch Specifier**: đổi `*/master` thành **`*/main`** (GitHub mặc định branch là `main`, không phải `master`).
8. **Script Path**: giữ `Jenkinsfile` (mặc định, đúng tên).
9. **Save**.

### Bước 4: Build

→ Click **Build Now**. Log sẽ có 1 stage **"Declarative: Checkout SCM"** mà bạn không viết — Jenkins tự thêm để clone repo:

```text
[Pipeline] node
Running on Jenkins in /var/jenkins_home/workspace/learn-jenkins-app
[Pipeline] {
[Pipeline] stage
[Pipeline] { (Declarative: Checkout SCM)
[Pipeline] checkout
Selected Git installation does not exist. Using Default
The recommended git tool is: NONE
No credentials specified
Cloning the remote Git repository
Cloning with configured refspecs honoured...
> git clone https://github.com/<you>/learn-jenkins-app.git
Fetching upstream changes from https://github.com/<you>/learn-jenkins-app.git
> git fetch --tags --force --progress
Checking out Revision abc123... (refs/remotes/origin/main)
> git checkout -f abc123
Commit message: "Add initial Jenkinsfile"
[Pipeline] }
[Pipeline] // stage
[Pipeline] stage
[Pipeline] { (Hello)
[Pipeline] echo
Hello from Jenkinsfile in Git
[Pipeline] }
```

→ **Workflow giờ là**:

```text
1. Sửa Jenkinsfile local
2. git commit + git push
3. Jenkins → Build Now
4. Jenkins pull Jenkinsfile mới + chạy pipeline
```

Phase 3 sẽ thêm **auto trigger** — push code Jenkins tự build, không cần click Build Now.

### Pitfall thường gặp

- **File tên `jenkinsfile.txt` hoặc `jenkinsFile`** → Jenkins không tìm thấy. Đúng tên: **`Jenkinsfile`** (J hoa, không đuôi).
- **Branch `master` vẫn để mặc định** → repo GitHub mới dùng `main` → checkout fail.
- **Sửa Jenkinsfile xong quên push** → Jenkins vẫn dùng version cũ.

---

## Phần 2: Workspace Synchronization

Đây là khái niệm **dễ nhầm**, ảnh hưởng hành vi pipeline khi mix stage Docker + non-Docker.

### Vấn đề

Mở Jenkinsfile, thử 2 stage tạo file ở 2 môi trường:

```groovy
pipeline {
    agent any
    stages {
        stage('Without Docker') {
            steps {
                sh '''
                    echo "=== Without Docker ==="
                    ls -la
                    touch container-no.txt
                '''
            }
        }
        stage('With Docker') {
            agent {
                docker { image 'node:18-alpine' }
            }
            steps {
                sh '''
                    echo "=== With Docker ==="
                    ls -la
                    touch container-yes.txt
                '''
            }
        }
    }
}
```

Commit + push + Build Now. Log:

```text
[Pipeline] { (Without Docker)
Running on Jenkins in /var/jenkins_home/workspace/learn-jenkins-app
+ ls -la
... (danh sách file repo)
+ touch container-no.txt

[Pipeline] { (With Docker)
$ docker run -t -d ... node:18-alpine cat
Running on Jenkins in /var/jenkins_home/workspace/learn-jenkins-app@2   ← chú ý @2
+ ls -la
... (rỗng, KHÔNG có container-no.txt)
+ touch container-yes.txt
```

→ Hai stage chạy ở **hai workspace khác nhau**:
- Stage Without Docker: `workspace/learn-jenkins-app/`
- Stage With Docker: `workspace/learn-jenkins-app@2/`

Vào Jenkins UI → trang job → **Workspaces** → thấy **2 workspace riêng biệt**. File `container-no.txt` chỉ ở workspace 1, `container-yes.txt` chỉ ở workspace 2. Cứ thêm stage Docker → có `@3`, `@4`...

### Tại sao Jenkins làm vậy?

Mặc định, Jenkins coi stage Docker là **isolated** — mỗi container có workspace riêng. Lý do:

- Lý thuyết: nếu 2 stage chạy parallel, dùng cùng workspace → race condition.
- Lý thuyết: stage Docker có thể chạy trên agent khác (không phải controller) → workspace controller không có sẵn.

Trong thực tế (đặc biệt khoá học gộp controller + agent + Docker socket), pattern này **gây phiền hà**: stage Build tạo `build/` ở workspace 1, stage E2E muốn dùng `build/` đó nhưng đang ở workspace 2 → không thấy.

### Fix: `reuseNode true`

Thêm option `reuseNode true` để **bắt buộc** stage Docker dùng workspace của agent đang chạy:

```groovy
stage('With Docker') {
    agent {
        docker {
            image 'node:18-alpine'
            reuseNode true                      // ← ← ← Quan trọng
        }
    }
    steps {
        sh '''
            ls -la
            touch container-yes.txt
        '''
    }
}
```

Push + Build Now. Log:

```text
[Pipeline] { (With Docker)
$ docker run -t -d ... \
    -v /var/jenkins_home/workspace/learn-jenkins-app:/.../workspace/learn-jenkins-app \
    node:18-alpine cat
Running on Jenkins in /var/jenkins_home/workspace/learn-jenkins-app   ← KHÔNG có @2
+ ls -la
container-no.txt                                                     ← Thấy file của stage trước!
+ touch container-yes.txt
```

→ Cả 2 stage giờ dùng **cùng một workspace**. Trong UI Workspaces chỉ còn 1 thư mục, có cả 2 file.

### Cơ chế phía dưới

Khi có `reuseNode true`, Jenkins gọi `docker run` với volume mount:

```bash
docker run \
  -v /var/jenkins_home/workspace/learn-jenkins-app:/var/jenkins_home/workspace/learn-jenkins-app \
  -w /var/jenkins_home/workspace/learn-jenkins-app \
  node:18-alpine cat
```

→ Workspace của Jenkins agent được **mount vào container** ở **cùng path**. Container đọc/ghi file ở path đó = đọc/ghi workspace agent. Khi container exit, file vẫn ở workspace.

```text
┌─────────────────────────────────────────────┐
│  Jenkins Agent (controller)                  │
│  /var/jenkins_home/workspace/learn-jenkins-app  │
│  ├── src/                                    │
│  ├── package.json                            │
│  ├── Jenkinsfile                             │
│  └── container-no.txt                        │
│                                              │
│        ▲                                     │
│        │ bind mount (cùng path)              │
│        ▼                                     │
│  ┌─────────────────────────────────────┐    │
│  │ Container node:18-alpine             │    │
│  │ /var/jenkins_home/workspace/...     │    │
│  │ (đọc/ghi cùng thư mục host)         │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

### Khi nào KHÔNG nên `reuseNode true`?

Trường hợp hiếm: bạn muốn stage Docker hoàn toàn **isolated**, không thấy file của stage trước. Ví dụ: stage scan security, stage test với clean state. Lúc đó bỏ `reuseNode` (mặc định false).

→ Trong khoá này (và 99% pipeline thực tế), **luôn dùng `reuseNode true`**.

## Quy ước: pattern Jenkinsfile chuẩn

Nhóm pattern lại thành template:

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            agent {
                docker {
                    image 'node:18-alpine'
                    reuseNode true
                }
            }
            steps {
                sh '''
                    set -euo pipefail
                    npm --version
                    npm ci
                    npm run build
                '''
            }
        }
        stage('Test') {
            agent {
                docker {
                    image 'node:18-alpine'
                    reuseNode true
                }
            }
            steps {
                sh '''
                    set -euo pipefail
                    npm test
                '''
            }
        }
    }
}
```

→ Khuôn mẫu này sẽ được mở rộng từ bài 5 trở đi.

## Mở rộng: vì sao "Declarative: Checkout SCM" có sẵn?

Khi bạn dùng "Pipeline script from SCM", Jenkins **luôn auto-thêm** stage Checkout đầu pipeline. Nó:

1. Clone repo (hoặc fetch nếu đã clone).
2. `git checkout <branch>` đúng SHA.
3. Lưu metadata: commit message, author, branch name vào biến môi trường (`GIT_COMMIT`, `GIT_BRANCH`).

Nếu pipeline dùng "Pipeline script" (textarea trực tiếp), stage Checkout này không có → bạn phải tự `checkout` nếu cần code.

> **Note**: với multibranch pipeline (sẽ bàn ở Phase 3), Jenkins tự phát hiện branch và checkout đúng nhánh.

## Tóm tắt

- Jenkinsfile nên được lưu **ngay trong repo**, ở root, đúng tên `Jenkinsfile` (J hoa, không đuôi).
- Tạo Jenkins job với **Pipeline script from SCM** → trỏ vào Git URL + branch + script path.
- Branch GitHub mới mặc định `main`, nhớ đổi từ `master`.
- Mặc định, stage Docker dùng **workspace riêng** (suffix `@2`, `@3`...). Đây là pitfall lớn.
- Thêm **`reuseNode true`** trong `docker { ... }` → stage Docker mount vào workspace của agent → mọi stage thấy file chung.
- Workflow update pipeline: sửa Jenkinsfile → commit → push → Build Now (Phase 3 sẽ tự động hoá).

---

→ [Bài tiếp theo: Stage Build và stage Test thật sự](05-build-va-test-stage.md)

# Bài 5: Stage Build và stage Test thật sự

Giờ bạn đã có đủ "đồ nghề": Jenkinsfile trong Git, Docker image làm build env, `reuseNode true` cho workspace sync. Bài này thay stage `Hello` bằng **Build thật** (npm ci + npm run build) và **Test thật** (npm test).

## Stage Build

### Lý thuyết: build phải làm gì?

Cho project Node.js/React:

1. **Cài dependencies**: đọc `package.json` + `package-lock.json` → tải `node_modules/`.
2. **Compile / bundle**: dùng webpack (qua `react-scripts`) → tạo `build/` chứa file production (HTML, CSS, JS minified).

→ Sau stage Build, workspace có thêm 2 thư mục: `node_modules/` (deps) và `build/` (output).

### Viết stage Build

```groovy
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

            ls -la                    # Trước build, xem có gì
            node --version            # Document version
            npm --version
            npm ci                    # Cài deps (lock file)
            npm run build             # Build production
            ls -la                    # Sau build, kiểm tra build/ có sinh ra
        '''
    }
}
```

Giải nghĩa từng phần:

- **`ls -la`** đầu và cuối — debug tool, xem workspace có gì trước và sau build.
- **`node --version` / `npm --version`** — log version Node thực sự. Hữu ích khi tương lai cần truy xuất: *"build #142 fail có lẽ do Node minor update từ 18.18.0 → 18.19.0"*.
- **`npm ci`** thay `npm install`:
  - `ci` = clean install, đọc `package-lock.json` **chính xác**, không sửa lock file.
  - Phù hợp CI vì deterministic. Nếu lock file lệch package.json → fail ngay (đúng hành vi mong muốn).
- **`npm run build`** — chạy script `build` trong `package.json`. React-scripts sẽ webpack thành `build/`.

### Commit + Build Now

Sửa Jenkinsfile, commit, push, Build Now. Log mong đợi:

```text
[Pipeline] { (Build)
$ docker run -t -d ... node:18-alpine cat
+ ls -la
total 56
drwxr-xr-x 4 jenkins jenkins 4096 ... .
drwxr-xr-x 5 jenkins jenkins 4096 ... ..
drwxr-xr-x 8 jenkins jenkins 4096 ... .git
-rw-r--r-- 1 jenkins jenkins   59 ... .gitignore
-rw-r--r-- 1 jenkins jenkins  ... Jenkinsfile
-rw-r--r-- 1 jenkins jenkins  ... README.md
-rw-r--r-- 1 jenkins jenkins  ... package-lock.json
-rw-r--r-- 1 jenkins jenkins  ... package.json
drwxr-xr-x 2 jenkins jenkins 4096 ... public
drwxr-xr-x 2 jenkins jenkins 4096 ... src
+ node --version
v18.18.2
+ npm --version
9.8.1
+ npm ci
... (1-2 phút lần đầu)
added 1500 packages in 80s
+ npm run build
Creating an optimized production build...
Compiled successfully.
...
The build folder is ready to be deployed.
+ ls -la
total 60
...
drwxr-xr-x 3 jenkins jenkins 4096 ... build         ← MỚI: build/
drwxr-xr-x ... jenkins jenkins ... node_modules     ← MỚI: node_modules/
```

→ Stage Build thành công. **Quan trọng**: `node_modules/` và `build/` **không** có trước khi build (vì gitignore). Stage Build tự sinh ra.

### Lần build tiếp theo: cache không tự có

Bạn có thể thắc mắc: lần 2 build cần `npm ci` lại không? **Có, mặc định**. Vì:

- Mỗi build → `docker run` container mới → `node_modules/` cũ vẫn còn ở workspace nhưng `npm ci` sẽ **xoá `node_modules/` rồi cài lại** (đúng spec của `npm ci`).
- Để cache npm thực sự → cần cài plugin **Pipeline Caching** hoặc lưu `~/.npm` qua Docker volume. Khoá học không đi sâu — đây là tối ưu advanced.

→ Trong khoá, mỗi build mất ~1 phút cho `npm ci`. Chấp nhận được.

---

## Stage Test (Assignment)

### Đề bài (tự làm trước khi đọc tiếp)

Tạo **stage Test** sau stage Build, làm 2 việc:

1. Kiểm tra file `build/index.html` có tồn tại.
2. Chạy `npm test` để execute unit tests.

Stop lại ở đây, mở Jenkinsfile, tự viết, push, build. Đọc tiếp khi đã thử.

### Giải pháp từng bước

#### Bước 1: stage Test với echo trước

Khi học mới, **luôn làm bước nhỏ**. Đầu tiên chỉ thêm stage rỗng + `echo`:

```groovy
stage('Test') {
    steps {
        echo 'Testing the new build'
    }
}
```

Push + Build Now. Mục đích: kiểm tra syntax đúng, stage được Jenkins recognize. Stage View phải hiển thị 3 cột: Checkout, Build, Test.

#### Bước 2: Test file exists

```groovy
stage('Test') {
    steps {
        sh 'test -f build/index.html'
    }
}
```

Build. Stage Test có chạy được nhưng **không có agent Docker**. Vẫn OK vì `test -f` là lệnh có sẵn shell, không cần Node.js.

> Tinh ý: stage này chạy trên Jenkins agent thẳng, vẫn thấy workspace có `build/index.html` vì stage Build (có `reuseNode true`) đã đẩy file vào workspace agent.

#### Bước 3: Thêm `npm test`

Để chạy `npm test`, cần Node.js → cần Docker:

```groovy
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
            test -f build/index.html
            npm test
        '''
    }
}
```

Push + Build Now. **Lần đầu có thể fail** với error:

```text
> learn-jenkins-app@0.1.0 test
> react-scripts test

No tests found related to files changed since last commit.
Press `a` to run all tests, or run Jest with `--watchAll`.

Watch Usage
 › Press a to run all tests.
 › Press q to quit watch mode.
```

→ React-scripts mặc định chạy test ở **watch mode**, đợi input user (`a` hoặc `q`). Trong CI không có ai gõ → treo / fail.

#### Bước 4: Fix watch mode bằng `CI=true`

Cách 1: set biến môi trường `CI=true`:

```groovy
sh '''
    set -euo pipefail
    test -f build/index.html
    CI=true npm test
'''
```

Khi `CI=true` (chuẩn convention), `react-scripts test` tự chuyển sang **single-run mode**, chạy 1 lần rồi exit.

Cách 2: thêm option `--watchAll=false`:

```groovy
sh 'npm test -- --watchAll=false'
```

→ Cả 2 đều work. Khoá dùng cách 1 vì gọn và áp dụng được cho cả script khác.

#### Stage Test hoàn chỉnh

```groovy
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
            test -f build/index.html
            CI=true npm test
        '''
    }
}
```

Push + Build Now → cả 3 stage xanh:

```text
[Pipeline] { (Test)
$ docker run ... node:18-alpine cat
+ test -f build/index.html
+ npm test

> learn-jenkins-app@0.1.0 test
> react-scripts test

PASS src/App.test.js
  ✓ renders learn react link (15ms)

Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

---

## Jenkinsfile đầy đủ sau bài 5

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
                    ls -la
                    node --version
                    npm --version
                    npm ci
                    npm run build
                    ls -la
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
                    test -f build/index.html
                    CI=true npm test
                '''
            }
        }
    }
}
```

## Quan hệ phụ thuộc giữa stages

Stage Build và Test có dependency rõ:

- Test cần `build/index.html` → cần Build chạy trước.
- Test cần `node_modules/` (cho `npm test`) → cần Build chạy `npm ci` trước.

→ **Không thể đảo thứ tự**. Nếu Test trước Build, `node_modules/` chưa có → `npm test` fail vì không tìm thấy `jest`.

> Lý thuyết: stage Test không **bắt buộc** Build chạy. Nếu chỉ chạy unit test mà không cần build artifact → Test có thể độc lập, cần `npm ci` riêng. Bài 8 sẽ bàn về parallel & dependencies.

## Local development: thử trước khi đẩy

Một lời khuyên vàng: **mọi lệnh trước khi nhét vào Jenkinsfile, hãy gõ tay trong terminal local**.

```bash
# Trên máy local hoặc Codespaces
npm ci
npm run build
test -f build/index.html
CI=true npm test
```

Nếu local fail → fix ở local. **Không bao giờ** debug `npm` lỗi trong Jenkins UI — tốc độ debug chậm hơn 10 lần.

→ Local OK → mới push → Jenkins build. 90% lúc đó pipeline pass.

## Mẹo debug nhanh

### Tạm thời log mọi env var

```groovy
sh 'env | sort'
```

→ Xem mọi biến môi trường có sẵn trong shell. Hữu ích khi nghi ngờ `PATH` hoặc `CI=true` không được set.

### Tạm thời pause sau lỗi để inspect workspace

Comment dòng fail, thêm `sleep 600` → vào Docker Desktop, exec vào container:

```bash
docker exec -it <container> sh
ls -la
cat package.json
```

→ Inspect "live" rất nhanh. Sau khi xong, kill container.

### Bật log npm chi tiết

```groovy
sh 'npm ci --verbose'
```

→ Khi `npm ci` lỗi mơ hồ, verbose mode in chi tiết.

---

## Tóm tắt

- **Stage Build**: `npm ci` (deterministic install) + `npm run build` (tạo `build/`).
- **Stage Test**: `test -f` kiểm tra artifact + `CI=true npm test` chạy unit tests 1 lần.
- Cả 2 stage cần `agent { docker { ... reuseNode true } }` để có Node.js + workspace sync.
- `CI=true` là convention chuẩn — nhiều tool (react-scripts, vitest, jest, playwright) tự bật mode "non-interactive" khi thấy.
- **Dependency**: Test cần `node_modules` từ Build → giữ Build trước Test.
- **Best practice**: test local trước khi đẩy Jenkinsfile, log version Node/npm, dùng `set -euo pipefail`.

---

→ [Bài tiếp theo: JUnit report, comments và HTML report](06-junit-comments-va-html-report.md)

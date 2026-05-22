# Bài 8: Environment Variables, Pipeline Graph và tổng kết Phase 1

Bài cuối Phase 1 đụng đến **biến** — chìa khoá để pipeline không lặp lại, dễ thay đổi config. Đồng thời lướt qua **Pipeline Graph View** (UI mới của Jenkins) và **tổng kết toàn bộ Phase 1**.

## Vì sao cần biến trong pipeline?

Mở pipeline laptop-assembly hiện tại — bạn đếm xem `build/laptop.txt` xuất hiện bao nhiêu lần:

```groovy
sh '''
    mkdir -p build
    touch build/laptop.txt                          # 1
    echo "mainboard" >> build/laptop.txt            # 2
    echo "display"   >> build/laptop.txt            # 3
    echo "keyboard"  >> build/laptop.txt            # 4
    cat build/laptop.txt                            # 5
'''

# Test
test -f build/laptop.txt                            # 6
grep "mainboard" build/laptop.txt                   # 7
grep "display"   build/laptop.txt                   # 8
grep "keyboard"  build/laptop.txt                   # 9
```

**9 lần**. Giờ bạn đổi ý — file phải tên là `notebook.txt` thay vì `laptop.txt`. Phải search & replace 9 chỗ. Sót 1 → pipeline fail.

→ Đây là vi phạm nguyên tắc **DRY** (Don't Repeat Yourself). Giải pháp: **biến**.

---

## Định nghĩa biến với block `environment`

Declarative Pipeline có block `environment { ... }` để khai báo biến:

```groovy
pipeline {
    agent any
    environment {
        BUILD_FILE_NAME = 'laptop.txt'
    }
    stages {
        ...
    }
}
```

**Quy ước** (không bắt buộc nhưng được khuyến nghị):

- Tên biến **UPPER_CASE**, từ ngăn cách bằng underscore.
- Giá trị bọc trong **single quote** `'...'`.

Block `environment` đặt ở **cấp pipeline** → biến available cho **mọi stage**. Có thể đặt trong stage cụ thể → chỉ available trong stage đó:

```groovy
stage('Build') {
    environment {
        DEBUG = 'true'      // Chỉ stage Build thấy
    }
    steps { ... }
}
```

---

## Dùng biến: dấu `$`

### Trong lệnh `sh`

Hai cách trích biến trong `sh`:

```groovy
environment {
    BUILD_FILE_NAME = 'laptop.txt'
}

steps {
    // Cách 1: dùng $VAR — Linux shell hiểu (vì env var Jenkins được inject vào shell)
    sh 'echo $BUILD_FILE_NAME'

    // Cách 2: dùng ${VAR} — chuẩn shell, an toàn hơn khi dính chữ
    sh 'echo ${BUILD_FILE_NAME}_v2'      // Output: laptop.txt_v2

    // Cách 3: dùng triple-double-quote — Groovy interpolate trước khi đẩy xuống shell
    sh "echo ${BUILD_FILE_NAME}"
}
```

> Bài 6 đã nhắc: `"""..."""` thay biến **Groovy** trước; `'''...'''` thì không. Khi dùng biến **`environment`**, cả 2 cách đều work vì Jenkins **inject biến vào env của shell** → shell tự thay khi gặp `$VAR`.
> Khi nào CẦN `"""`? Khi dùng **biến Groovy local** (định nghĩa bằng `def` hoặc lấy từ `script {}`), shell không thấy.

### Trong `echo` của Jenkins

`echo` step của Jenkins (Groovy) cần **`"..."`** với `${VAR}`:

```groovy
echo "Building file: ${BUILD_FILE_NAME}"
```

**Sai**: `echo 'Building file: ${BUILD_FILE_NAME}'` → in literal `${BUILD_FILE_NAME}` (single quote không interpolate).

---

## Áp dụng vào pipeline laptop-assembly

```groovy
pipeline {
    agent any
    environment {
        BUILD_DIR        = 'build'
        BUILD_FILE_NAME  = 'laptop.txt'
    }
    stages {
        stage('Clean') {
            steps {
                cleanWs()
            }
        }
        stage('Build') {
            steps {
                echo "Building file: ${BUILD_FILE_NAME}"
                sh '''
                    set -euo pipefail
                    mkdir -p $BUILD_DIR
                    echo "mainboard" >> $BUILD_DIR/$BUILD_FILE_NAME
                    echo "display"   >> $BUILD_DIR/$BUILD_FILE_NAME
                    echo "keyboard"  >> $BUILD_DIR/$BUILD_FILE_NAME
                    cat $BUILD_DIR/$BUILD_FILE_NAME
                '''
            }
        }
        stage('Test') {
            steps {
                echo 'Testing the new laptop'
                sh '''
                    set -euo pipefail
                    test -f $BUILD_DIR/$BUILD_FILE_NAME
                    grep "mainboard" $BUILD_DIR/$BUILD_FILE_NAME
                    grep "display"   $BUILD_DIR/$BUILD_FILE_NAME
                    grep "keyboard"  $BUILD_DIR/$BUILD_FILE_NAME
                '''
            }
        }
    }
    post {
        success {
            archiveArtifacts artifacts: "${BUILD_DIR}/**"   // ← Groovy interpolate
        }
    }
}
```

Save → Build Now. Log:

```text
+ mkdir -p build
+ echo mainboard
+ cat build/laptop.txt
mainboard
display
keyboard
```

→ Output vẫn y nguyên. Nhưng giờ đổi `BUILD_FILE_NAME = 'notebook.txt'` → mọi chỗ tự cập nhật. **Một chỗ sửa, toàn bộ thay đổi.**

---

## Biến môi trường có sẵn của Jenkins

Jenkins inject sẵn nhiều biến hữu ích vào mọi pipeline — bạn không cần khai báo:

| Biến                  | Ý nghĩa                                      | Ví dụ giá trị                       |
|-----------------------|----------------------------------------------|-------------------------------------|
| `BUILD_NUMBER`        | Số thứ tự build hiện tại                     | `42`                                |
| `BUILD_ID`            | Cùng với BUILD_NUMBER (legacy)               | `42`                                |
| `BUILD_URL`           | URL trang build                              | `http://localhost:8080/job/x/42/`   |
| `JOB_NAME`            | Tên job                                      | `laptop-assembly`                   |
| `JENKINS_URL`         | URL Jenkins                                  | `http://localhost:8080/`            |
| `WORKSPACE`           | Path tới workspace                           | `/var/jenkins_home/workspace/...`   |
| `NODE_NAME`           | Tên agent đang chạy                          | `built-in`                          |
| `GIT_BRANCH`          | Branch hiện tại (khi pull từ Git)            | `main`                              |
| `GIT_COMMIT`          | SHA commit                                   | `a1b2c3...`                         |

Ví dụ sử dụng:

```groovy
echo "Build #${BUILD_NUMBER} of ${JOB_NAME}"
echo "Triggered: ${BUILD_URL}"
sh '''
    echo "Running on $NODE_NAME"
    echo "Workspace: $WORKSPACE"
'''
```

→ Cực kỳ hữu ích cho logging, naming artifact (gắn version), gửi notification (Slack/email kèm link build).

Xem toàn bộ tại `${JENKINS_URL}/pipeline-syntax/globals` (vào URL này trên Jenkins của bạn).

---

## Định nghĩa biến runtime (không cố định ở môi trường)

Đôi khi giá trị biến không biết trước, phải tính trong pipeline:

```groovy
environment {
    TIMESTAMP = "${new Date().format('yyyy-MM-dd-HH-mm')}"
}

steps {
    sh "echo Build run at ${TIMESTAMP}"
}
```

Hoặc tính từ output shell:

```groovy
stage('Get version') {
    steps {
        script {
            env.APP_VERSION = sh(
                script: 'cat VERSION',
                returnStdout: true
            ).trim()
        }
    }
}
stage('Tag') {
    steps {
        echo "Building version ${APP_VERSION}"
    }
}
```

→ `script { ... }` cho phép viết Groovy thuần, escape khỏi Declarative syntax. Sẽ dùng nhiều ở Phase 3.

---

## Pipeline Graph View

Khi Jenkins phiên bản gần đây cài đầy đủ plugin, bạn có 2 cách xem pipeline:

### Stage View (truyền thống)

Bảng dạng spreadsheet — hàng = build, cột = stage:

```text
┌─────────┬────────┬────────┬────────┐
│ Build # │ Clean  │ Build  │ Test   │
├─────────┼────────┼────────┼────────┤
│ #15     │  1s    │  2s    │  3s ✓  │
│ #14     │  1s    │  2s    │ FAIL ✗ │
│ #13     │  1s    │  2s    │  3s ✓  │
└─────────┴────────┴────────┴────────┘
```

→ Tốt để **so sánh** lịch sử nhiều build.

### Pipeline Graph View (mới)

UI hiện đại hơn — vào trang **một build cụ thể** → tab **Stages** (hoặc menu **Pipeline Overview**):

```text
┌────────┐    ┌────────┐    ┌────────┐
│ Clean  │ ─► │ Build  │ ─► │ Test   │
│  1s ✓  │    │  2s ✓  │    │  3s ✓  │
└────────┘    └────────┘    └────────┘
```

Click vào từng stage → xem step bên trong, log realtime.

→ Tốt cho **deep dive** một build.

**Trong khoá học**, ta dùng Stage View nhiều hơn (so sánh lịch sử dễ hơn), nhưng biết Pipeline Graph View tồn tại cũng có lợi.

> Phase 2 sẽ giới thiệu **Blue Ocean** — UI thay thế hoàn toàn cho Jenkins, được nhiều team yêu thích vì đẹp và clear.

---

## Mini lab Linux (recap)

Để củng cố, đây là bài tập tự làm. **Đừng copy-paste** — gõ tay vào terminal local hoặc vào exec của Jenkins container:

```bash
# Task 1: Tạo directory build trong home, kiểm tra bằng ls
cd ~
mkdir -p build
ls -l

# Task 2: Tạo file build/computer.txt với nội dung "mainboard"
echo "mainboard" > build/computer.txt
cat build/computer.txt

# Task 3: Append "display"
echo "display" >> build/computer.txt
cat build/computer.txt

# Task 4: Kiểm tra file tồn tại (qua exit code)
test -f build/computer.txt
echo $?          # Mong đợi 0

test -f build/nonexistent.txt
echo $?          # Mong đợi 1

# Task 5: Tìm "display" trong file
grep "display" build/computer.txt
echo $?          # Mong đợi 0

grep "trackpad" build/computer.txt
echo $?          # Mong đợi 1
```

Sau khi quen với các command, Jenkinsfile sẽ không còn xa lạ — bản chất chỉ là **wrap command vào pipeline**.

---

## ✨ Tổng kết Phase 1

Bạn đã đi từ **không biết Jenkins là gì** đến **viết được pipeline 3 stage hoàn chỉnh với test + artifact**. Cụ thể:

### Khái niệm đã nắm

- **Jenkins** = automation server cho build/test/deploy. **DevOps** = văn hoá hợp tác + automation.
- Hai loại job: **Freestyle** (legacy, click UI) vs **Pipeline** (modern, code Groovy).
- **Controller** điều phối, **Agent** thực thi. Khoá học gộp trong 1 container.
- **Workspace** là thư mục riêng của job, không tự reset.
- **Post Actions** chạy sau stages, có conditions `always`, `success`, `failure`...
- **Archive Artifacts** lưu output gắn với build cụ thể.
- **Exit codes** là ngôn ngữ universal giữa CLI tool và Jenkins.
- **Environment variables** giảm duplication, dễ thay đổi config.

### Kỹ năng đã hành

- Cài Jenkins bằng Docker.
- Viết Declarative Pipeline cơ bản (`pipeline { agent stages { stage { steps } } }`).
- Debug pipeline qua Console Output.
- Dừng pipeline đang treo.
- Gộp nhiều `sh` thành triple-quote block.
- Thêm stage Test với `test`, `grep`.

### 9 lệnh Linux đã làm quen

`echo` · `mkdir -p` · `touch` · `cat` · `rm -f` · `test -f` · `grep` · `sleep` · `exit`

### Pipeline mẫu cuối Phase 1

```groovy
pipeline {
    agent any
    environment {
        BUILD_DIR        = 'build'
        BUILD_FILE_NAME  = 'laptop.txt'
    }
    stages {
        stage('Clean') {
            steps { cleanWs() }
        }
        stage('Build') {
            steps {
                echo "Building file: ${BUILD_FILE_NAME}"
                sh '''
                    set -euo pipefail
                    mkdir -p $BUILD_DIR
                    echo "mainboard" >> $BUILD_DIR/$BUILD_FILE_NAME
                    echo "display"   >> $BUILD_DIR/$BUILD_FILE_NAME
                    echo "keyboard"  >> $BUILD_DIR/$BUILD_FILE_NAME
                    cat $BUILD_DIR/$BUILD_FILE_NAME
                '''
            }
        }
        stage('Test') {
            steps {
                echo 'Testing the new laptop'
                sh '''
                    set -euo pipefail
                    test -f $BUILD_DIR/$BUILD_FILE_NAME
                    grep "mainboard" $BUILD_DIR/$BUILD_FILE_NAME
                    grep "display"   $BUILD_DIR/$BUILD_FILE_NAME
                    grep "keyboard"  $BUILD_DIR/$BUILD_FILE_NAME
                '''
            }
        }
    }
    post {
        success {
            archiveArtifacts artifacts: "${BUILD_DIR}/**"
        }
    }
}
```

→ Đây là khung sườn của **mọi pipeline CI** sau này. Phase 2 sẽ thay phần "tạo file text" bằng **build website thật + test thật**, nhưng kiến trúc vẫn y nguyên.

---

## Bạn đã sẵn sàng cho Phase 2 nếu...

- [ ] Bạn tự tay viết được pipeline laptop-assembly từ đầu (không nhìn file này).
- [ ] Khi xem Console Output, bạn biết dòng `+` là gì, dòng không prefix là gì.
- [ ] Bạn hiểu vì sao `mkdir -p` thay vì `mkdir` thường.
- [ ] Bạn biết phân biệt `>` và `>>`.
- [ ] Bạn biết khi nào artifact được archive (success block) vs khi nào ở workspace.
- [ ] Bạn biết exit code 0 vs ≠ 0 ảnh hưởng pipeline thế nào.

Nếu còn chỗ chưa chắc — đừng vội. Quay lại bài tương ứng, gõ lại pipeline, xem log, thử fail xem điều gì xảy ra. **Phase 2 dùng lại toàn bộ kiến thức này**, nếu nền tảng yếu sẽ rất khó theo.

---

## Đọc thêm

- Jenkins handbook (free): <https://www.jenkins.io/doc/book/>
- Continuous Delivery book (Jez Humble & David Farley) — kinh điển CI/CD.
- Site reliability engineering — sre.google/books/ (Google, free online).

---

→ **Sẵn sàng?** [Phase 2: Continuous Integration thật sự](../phase-2-continuous-integration/01-gioi-thieu-ci.md)

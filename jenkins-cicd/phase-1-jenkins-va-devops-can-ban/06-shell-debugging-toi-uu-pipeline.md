# Bài 6: Shell, debugging và tối ưu pipeline

Bài này là **bài thực dụng** — không thêm tính năng mới, mà tập trung vào: hiểu shell là gì, **đọc log để debug**, **dừng pipeline đang treo**, và **gộp nhiều `sh` thành một** cho hiệu quả hơn.

## Shell là gì?

Suốt 5 bài qua bạn đã gõ rất nhiều `sh '...'` mà chưa giải thích kỹ.

**Shell** = **lớp giao diện** giữa bạn và hệ điều hành, **dạng dòng lệnh** (CLI — Command Line Interface). Khi bạn gõ `mkdir build` trong terminal, shell **nhận**, **diễn dịch**, rồi **gọi** kernel của OS tạo thư mục.

```text
┌──────────────────────────────────┐
│  You: gõ "mkdir build"           │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│  Shell (bash / sh / zsh)         │
│  • Phân tích câu lệnh             │
│  • Tìm chương trình `mkdir`       │
│  • Truyền argument                │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│  Operating System Kernel         │
│  • Tạo directory entry            │
│  • Báo thành công / lỗi           │
└──────────────────────────────────┘
```

Vài tên shell phổ biến:
- **`sh`** — Bourne Shell, shell gốc Unix. Cú pháp đơn giản, có ở mọi distro.
- **`bash`** — Bourne **Again** Shell. Bản nâng cấp của `sh`, default trên Linux.
- **`zsh`** — Z Shell. Default trên macOS từ 2019. Tương thích bash gần 100% + tính năng đẹp.
- **`PowerShell`** — Windows. Cú pháp hoàn toàn khác.

Trong Jenkinsfile, `sh '...'` luôn dùng `/bin/sh` mặc định. Trên Docker image Jenkins (Debian/Alpine), `/bin/sh` thường là `bash` hoặc `dash`.

### Vì sao DevOps cần shell?

- Servers production thường **không có giao diện đồ hoạ** → mọi việc làm qua command line.
- Tự động hoá = **kết nối nhiều CLI tool** lại với nhau (git → docker → aws → curl…). Shell là chất keo.
- Đọc/sửa file config server, monitor process, xem log → đều qua shell.

Khoá này không dạy shell sâu (đó là một topic lớn), nhưng bạn sẽ làm quen với ~15 lệnh phổ biến nhất.

---

## Đọc log: kỹ năng tối quan trọng

Bạn sẽ dành **70-80% thời gian** với Jenkins để đọc log debug. Nói không quá — đây là kỹ năng **quan trọng nhất** bài này.

### Cấu trúc log Jenkins (Pipeline)

Mở Console Output của một build:

```text
Started by user valentin                            ← Ai trigger
[Pipeline] Start of Pipeline
[Pipeline] node                                     ← Allocate agent
Running on Jenkins in /var/jenkins_home/workspace/laptop-assembly
[Pipeline] {
[Pipeline] stage
[Pipeline] { (Clean)                                ← Vào stage Clean
[Pipeline] cleanWs
[WS-CLEANUP] Deleting project workspace...
[Pipeline] }
[Pipeline] // stage
[Pipeline] stage
[Pipeline] { (Build)                                ← Vào stage Build
[Pipeline] echo
Building a new laptop
[Pipeline] sh
+ mkdir -p build                                    ← Lệnh shell (dấu + ở đầu)
[Pipeline] sh
+ touch build/laptop.txt
[Pipeline] sh
+ echo mainboard
+ cat build/laptop.txt                              ← Output dưới đây
mainboard
[Pipeline] }
[Pipeline] // stage
...
Finished: SUCCESS                                   ← Kết quả cuối
```

**3 ký hiệu cần thuộc lòng**:

- `[Pipeline]` — output của Jenkins (về việc nó đang làm gì).
- `+` ở đầu dòng — lệnh shell **đang được chạy** (Jenkins in ra trước khi chạy).
- Dòng **không có prefix** — output của lệnh shell vừa chạy.

### Tips đọc log nhanh

1. **Cuộn xuống cuối trước**. Dòng cuối thường là `Finished: SUCCESS` hoặc `Finished: FAILURE`. Nếu FAILURE, vài dòng cuối thường có error message.
2. **Tìm dòng đầu tiên có chữ "ERROR" / "FATAL"**. Đôi khi error nằm giữa log, không phải cuối.
3. **Tìm `+ <command>` cuối cùng**. Đó là lệnh khiến pipeline fail.
4. **Browser `Ctrl+F`** để tìm keyword (tên file, tên dependency...).
5. **So sánh** log build success cũ với log build fail mới → tìm phần khác nhau.

### Ví dụ debug

Pipeline đang chạy ngon → bạn sửa code → fail. Log:

```text
+ npm install
npm WARN deprecated request@2.88.2
npm WARN deprecated har-validator@5.1.5
npm ERR! code E404
npm ERR! 404 Not Found - GET https://registry.npmjs.org/lodash-typo
npm ERR! 404 'lodash-typo@1.0.0' is not in this registry
...
+ npm test
script returned exit code 1
```

→ Tìm `ERR` đầu tiên: package `lodash-typo` không tồn tại trên registry. → Bạn typo. Sửa `package.json` → fix.

---

## Pipeline bị treo: cách dừng

Đôi khi pipeline **không fail nhưng cũng không kết thúc** — kẹt ở một bước nào đó. Ví dụ một command thực tế:

```groovy
sh 'curl https://server-slow.com/big-file.zip'   // Server chậm, treo
```

hoặc giả lập:

```groovy
sh 'sleep 600'                                    // Treo 10 phút
```

→ Build status hiển thị spinner xanh, nhưng không tiến triển. Sau 30 giây Jenkins đổi sang **vàng** cảnh báo "running for a long time".

### Cách dừng manually

**Cách 1** — Trong trang build, panel **Build History** bên trái, hover vào build đang chạy → xuất hiện **X đỏ** → click → confirm:

```text
Build History
  #15  ⏵ Running        [X]   ← Click X
  #14  ✓ Success
  #13  ✗ Failed
```

**Cách 2** — Vào trang job → ở Stage View, click chữ X ở cuối row build đang chạy.

**Cách 3** — REST API:

```bash
curl -X POST http://localhost:8080/job/laptop-assembly/15/stop \
  --user valentin:<api-token>
```

Hữu ích khi muốn kill từ script.

### Build sau khi abort sẽ có status

```text
Aborted by user valentin
```

→ Pipeline được đánh dấu **ABORTED** (khác với FAILURE) — vẫn coi là không thành công, nhưng do người dùng dừng chủ động.

### Tránh bị treo: dùng `timeout`

Best practice: bọc các step nguy hiểm trong `timeout`:

```groovy
stage('Download') {
    steps {
        timeout(time: 5, unit: 'MINUTES') {
            sh 'curl https://server-slow.com/big-file.zip -o file.zip'
        }
    }
}
```

→ Sau 5 phút, Jenkins tự kill và đánh fail. Không phải ngồi canh.

---

## Tối ưu: gộp nhiều `sh` thành một

Pipeline laptop-assembly hiện tại có rất nhiều `sh`:

```groovy
sh 'mkdir -p build'
sh 'touch build/laptop.txt'
sh 'echo "mainboard" >> build/laptop.txt'
sh 'echo "display"   >> build/laptop.txt'
sh 'echo "keyboard"  >> build/laptop.txt'
sh 'cat build/laptop.txt'
```

Mỗi `sh` là một **shell mới** được Jenkins controller spawn → mỗi lần có overhead nhỏ: tạo process, set env, chờ exit, gửi exit code về controller.

Trong ví dụ này (lệnh nhanh) overhead không đáng kể. Nhưng nếu có **50 lệnh shell** trong 1 stage → có thể tốn vài giây không cần thiết.

### Cách gộp: dùng triple-quote string

Groovy hỗ trợ chuỗi nhiều dòng bằng `'''...'''` (3 single quote) hoặc `"""..."""`:

```groovy
sh '''
    mkdir -p build
    touch build/laptop.txt
    echo "mainboard" >> build/laptop.txt
    echo "display"   >> build/laptop.txt
    echo "keyboard"  >> build/laptop.txt
    cat build/laptop.txt
'''
```

→ Toàn bộ block chạy trong **một shell** duy nhất. Nhanh hơn, log gọn hơn.

### So sánh log

**Nhiều `sh`** (cách cũ):

```text
[Pipeline] sh
+ mkdir -p build
[Pipeline] sh
+ touch build/laptop.txt
[Pipeline] sh
+ echo mainboard
[Pipeline] sh
+ echo display
[Pipeline] sh
+ echo keyboard
[Pipeline] sh
+ cat build/laptop.txt
mainboard
display
keyboard
```

**Một `sh` triple-quote**:

```text
[Pipeline] sh
+ mkdir -p build
+ touch build/laptop.txt
+ echo mainboard
+ echo display
+ echo keyboard
+ cat build/laptop.txt
mainboard
display
keyboard
```

→ Sạch hơn, dễ đọc hơn.

### Khi nào KHÔNG nên gộp?

Khi bạn muốn **mỗi lệnh hiển thị riêng** trong Stage View để dễ thấy lệnh nào fail. Trong pipeline phức tạp, một stage có thể tách thành nhiều `sh` để Stage View hiển thị tiến trình từng bước.

→ **Rule of thumb**: lệnh thuộc cùng một "logical step" → gộp. Lệnh khác phase → tách.

### Single quote `'''` vs double quote `"""`

Như nói ở bài trước (sẽ học sâu ở bài 8):

- `'''...'''` — Groovy **không** thay biến `${VAR}` bên trong. Lệnh chạy y nguyên trên shell.
- `"""..."""` — Groovy **thay biến `${VAR}`** (gọi là interpolation) **trước khi** đẩy xuống shell.

Khi bạn dùng biến **Jenkins/Groovy** → cần `"""`. Khi dùng biến **shell** (`$HOME`, `$USER`, biến env Linux) → nên dùng `'''` để Groovy không can thiệp.

---

## Một số lỗi shell phổ biến trong pipeline

### 1. Quên `-p` cho `mkdir`

```groovy
sh 'mkdir build'    // Fail nếu chạy build lần 2
```

→ Luôn dùng `mkdir -p`.

### 2. Path tương đối vs tuyệt đối

```groovy
sh 'cd /tmp; ls'      // OK
sh 'cd /tmp'          // Vô nghĩa — vì shell kết thúc sau lệnh
sh 'ls'               // ← Vẫn ở workspace, không phải /tmp
```

Mỗi `sh` là shell mới, không nhớ `cd` từ `sh` trước. Muốn change dir liên tục → gộp trong **1 `sh`** triple-quote.

### 3. Pipe và exit code

```groovy
sh 'cmd-fail | cat'
```

→ Pipeline **success** dù `cmd-fail` lỗi, vì exit code của `cat` (cuối pipe) là 0. Fix:

```groovy
sh 'set -o pipefail; cmd-fail | cat'
```

→ `pipefail` bật chế độ exit code = lệnh đầu tiên fail trong pipe. Sẽ bàn kỹ ở bài 7.

### 4. Trailing whitespace gây lỗi

```groovy
sh '''
    cd build  
    ls
'''
```

→ Nếu dòng `cd build  ` có **trailing space**, một số shell không quan tâm, nhưng vài tool (như `make`) thì có. Cẩn thận khi copy paste.

### 5. Encoding character lạ

```groovy
sh 'echo "🎉 done"'
```

→ Có thể OK trên Linux/Mac, fail trên Windows agent với code page khác. Tránh emoji/Unicode trong shell command nếu cross-platform.

---

## Pipeline sau khi tối ưu

```groovy
pipeline {
    agent any
    stages {
        stage('Clean') {
            steps {
                cleanWs()
            }
        }
        stage('Build') {
            steps {
                echo 'Building a new laptop'
                sh '''
                    mkdir -p build
                    touch build/laptop.txt
                    echo "mainboard" >> build/laptop.txt
                    echo "display"   >> build/laptop.txt
                    echo "keyboard"  >> build/laptop.txt
                    cat build/laptop.txt
                '''
            }
        }
    }
    post {
        success {
            archiveArtifacts artifacts: 'build/**'
        }
    }
}
```

Chỉ 1 `sh`, log gọn, vẫn đầy đủ chức năng. Build time giảm vài chục ms (không đáng kể với pipeline nhỏ, nhưng tích luỹ trên hàng trăm pipeline thì có giá trị).

---

## Tóm tắt

- **Shell** là CLI interface giữa user và OS — bash, sh, zsh là phổ biến.
- **Đọc log** là kỹ năng tối quan trọng: dòng đầu cho context, dòng cuối có lỗi, `+ <command>` cuối là lệnh fail.
- Pipeline treo → dừng bằng nút X (UI) hoặc REST API. Phòng tránh bằng `timeout`.
- Gộp nhiều `sh` thành **một `sh` triple-quote** → nhanh hơn, log sạch hơn. Nhưng tách nếu muốn Stage View hiển thị riêng từng bước.
- `'''...'''` không interpolation biến Groovy; `"""..."""` có. Dùng `'''` khi script dùng biến shell.
- Cẩn thận `mkdir` không `-p`, `cd` qua nhiều `sh`, pipe nuốt exit code (sẽ học pipefail ở bài 7).

---

## Đọc thêm

- BashGuide: <http://mywiki.wooledge.org/BashGuide> — giáo trình bash chính thống.
- Explainshell: <https://explainshell.com> — dán bất kỳ command nào, có giải thích từng phần.

---

→ [Bài tiếp theo: Stage test và exit codes](07-test-stage-va-exit-codes.md)

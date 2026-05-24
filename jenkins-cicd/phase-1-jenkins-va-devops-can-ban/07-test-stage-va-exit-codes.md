# Bài 7: Stage Test và Exit Codes

Bài này thêm **stage Test** vào pipeline — bước **kiểm tra artifact** mà build vừa tạo ra. Đây là khái niệm CI cốt lõi: build xong **phải có ai đó verify**, mà Jenkins là "ai đó" lý tưởng.

Đồng thời, bài này giải thích **exit codes** — "ngôn ngữ bí mật" giữa command line tools và Jenkins, quyết định pipeline pass hay fail.

## Vì sao cần stage Test?

Pipeline hiện tại:

```text
Clean → Build → (post) Archive
```

Sau Build, Jenkins báo SUCCESS. Nhưng làm sao biết file `laptop.txt` thực sự đầy đủ? Bài 4 ta phải **mở file qua UI** kiểm tra bằng mắt. Đây là **manual work**. Khi pipeline phức tạp, không thể mở 50 file kiểm tra mỗi lần.

→ Cần một bước **tự động verify** artifact đúng.

## Thêm stage Test

Stage Test nằm sau Build:

```groovy
pipeline {
    agent any
    stages {
        stage('Clean') { ... }
        stage('Build') { ... }
        stage('Test') {                          // ← Stage mới
            steps {
                echo 'Testing the new laptop'
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

Save → Build Now. Mở Stage View → bạn thấy 3 cột Clean, Build, Test. Mỗi cột có thời gian riêng.

Nhưng `echo` thì không "test" gì cả. Cần lệnh thực sự verify.

---

## Test 1: file có tồn tại không? (`test -f`)

Lệnh Linux `test` (có khi viết là `[ ... ]`) kiểm tra điều kiện về file:

```bash
test -f build/laptop.txt         # File tồn tại và là regular file?
test -d build                    # Là directory?
test -e build/laptop.txt         # Tồn tại bất kể loại?
test -s build/laptop.txt         # Tồn tại và size > 0?
```

→ Quan trọng: `test` **không in gì cả**. Kết quả chỉ thể hiện qua **exit code** (sẽ giải thích chi tiết bên dưới).

Thêm vào stage Test:

```groovy
stage('Test') {
    steps {
        echo 'Testing the new laptop'
        sh 'test -f build/laptop.txt'
    }
}
```

Save → Build Now → SUCCESS. Log:

```text
+ test -f build/laptop.txt
```

Không output, không lỗi. Test passed.

### Thử cho test fail

Tạm thêm `rm` ngay trước `test` để file biến mất:

```groovy
stage('Test') {
    steps {
        sh '''
            rm build/laptop.txt
            test -f build/laptop.txt
        '''
    }
}
```

Save → Build Now → **FAILURE**. Log:

```text
+ rm build/laptop.txt
+ test -f build/laptop.txt
script returned exit code 1
```

→ `test -f` không tìm thấy file → return exit code 1 → Jenkins thấy non-zero → mark FAILURE.

Đây là **đúng những gì ta muốn**: stage Test verify được rằng artifact phải tồn tại.

Xoá dòng `rm` đi.

---

## Exit codes giải thích chi tiết

Mọi chương trình command line khi kết thúc đều trả về một **exit code** — số nguyên 0–255:

- **`0`** — thành công (convention chung).
- **`1` đến `255`** — lỗi. Số cụ thể có nghĩa tuỳ chương trình.

Ví dụ exit codes một số tool:

| Tool / Lệnh           | Exit code                                          |
|-----------------------|----------------------------------------------------|
| `test`, `grep`        | 0 = match, 1 = no match, 2 = error syntax          |
| `curl`                | 0 = OK, 6 = couldn't resolve host, 22 = HTTP error |
| `ssh`                 | 0 = OK, 255 = unable to connect                    |
| `make`                | 0 = OK, 2 = error in Makefile, ... (project-defined) |
| Custom script         | bạn tự định nghĩa                                  |

### Jenkins dùng exit code thế nào?

Mỗi `sh '...'` step trong Jenkins:

1. Spawn shell.
2. Chạy lệnh.
3. Lấy exit code.
4. **Nếu 0 → step PASS, chạy step tiếp theo.**
5. **Nếu ≠ 0 → step FAIL, ngừng stage, mark build FAILURE.**

→ Đây là vì sao `test`, `grep`, mọi tool đều "tự động báo lỗi" với Jenkins, mà không cần Jenkins biết về tool đó. Cú pháp universal: **exit code**.

### Xem exit code trong shell

Sau khi chạy lệnh, kiểm tra biến đặc biệt `$?`:

```bash
ls /nonexistent
echo $?              # 2 (file not found)

mkdir build
echo $?              # 0 (success)
```

### Trả về exit code từ script tự viết

```bash
#!/bin/bash
if [ -f important.txt ]; then
    echo "OK"
    exit 0
else
    echo "Missing important.txt"
    exit 42          # Mã tự định nghĩa
fi
```

→ Khi script được gọi từ Jenkins, exit 42 → non-zero → Jenkins fail build. Mã 42 sẽ hiện trong log.

### `exit N` trong pipeline

Cú pháp giả lập fail trong Jenkinsfile:

```groovy
sh 'exit 2'
```

→ Pipeline fail ngay sau dòng này:

```text
+ exit 2
script returned exit code 2
```

Hữu ích cho:
- Test post action `failure { ... }` chạy đúng không.
- Force fail ở một điều kiện logic.

---

## Test 2: nội dung file đúng không? (`grep`)

`test -f` chỉ kiểm tra **tồn tại**. Còn nội dung? Nếu file `laptop.txt` rỗng hoặc thiếu `keyboard` thì sao?

Dùng `grep` — lệnh tìm kiếm chuỗi trong file:

```bash
grep "mainboard" build/laptop.txt
```

Hành vi:

- Nếu tìm thấy → in dòng chứa chuỗi, **exit 0**.
- Nếu không tìm thấy → không in gì, **exit 1**.
- Nếu file không tồn tại → in error, **exit 2**.

→ Hoàn hảo cho test: Jenkins chỉ cần check exit code.

Thêm vào stage Test:

```groovy
stage('Test') {
    steps {
        echo 'Testing the new laptop'
        sh '''
            test -f build/laptop.txt
            grep "mainboard" build/laptop.txt
            grep "display"   build/laptop.txt
            grep "keyboard"  build/laptop.txt
        '''
    }
}
```

Save → Build Now → log:

```text
+ test -f build/laptop.txt
+ grep mainboard build/laptop.txt
mainboard
+ grep display build/laptop.txt
display
+ grep keyboard build/laptop.txt
keyboard
```

Tất cả 3 grep tìm thấy → exit 0 → SUCCESS.

### Thử fail bằng cách comment out bước build

Sửa stage Build, dùng `#` comment dòng mainboard:

```groovy
sh '''
    mkdir -p build
    touch build/laptop.txt
    # echo "mainboard" >> build/laptop.txt
    echo "display"   >> build/laptop.txt
    echo "keyboard"  >> build/laptop.txt
'''
```

> Trong shell, `#` ở **đầu dòng** là comment. **Quan trọng**: phải dùng `#`, không phải `//` (đó là cú pháp comment của Groovy/Java/C). Bài học của tác giả khoá: nhầm `//` → shell coi đó là path absolute → error *"permission denied"*. Cẩn thận!

Save → Build Now → log:

```text
+ test -f build/laptop.txt
+ grep mainboard build/laptop.txt
script returned exit code 1
```

→ Build pass nhưng Test fail vì grep không tìm thấy mainboard. Bỏ comment đi để file đầy đủ trở lại.

---

## Một "lỗi giấu" thường gặp: `cat` không thay được `grep`

Có người nghĩ:

```bash
cat build/laptop.txt
```

→ "Nếu file thiếu mainboard thì sẽ hiển thị thiếu, mình thấy". Sai. `cat` chỉ **in nội dung** — exit code luôn 0 nếu file tồn tại, không quan tâm nội dung gì. Jenkins không "đọc nội dung" — nó chỉ nhìn exit code.

→ **Test luôn phải dùng tool có exit code rõ ràng** (`test`, `grep`, `diff`, `[ ... ]`...).

---

## Bonus: 7 lệnh Linux đã học trong Phase 1

| Lệnh             | Ý nghĩa                                            | Exit code phổ biến                            |
|------------------|----------------------------------------------------|-----------------------------------------------|
| `echo "text"`    | In `text` ra stdout                                | 0 luôn                                        |
| `mkdir -p <dir>` | Tạo directory (`-p` = không lỗi nếu đã có)         | 0 nếu thành công                              |
| `touch <file>`   | Tạo file rỗng / update timestamp                   | 0 nếu thành công                              |
| `cat <file>`     | In nội dung file                                   | 0 nếu file tồn tại                            |
| `rm [-f] <file>` | Xoá file (`-f` = không lỗi nếu không tồn tại)      | 0 nếu thành công                              |
| `test -f <file>` | Kiểm tra file tồn tại                              | 0 = có, 1 = không                             |
| `grep "x" <file>`| Tìm chuỗi `x` trong file                           | 0 = tìm thấy, 1 = không, 2 = error            |
| `sleep <sec>`    | Chờ `<sec>` giây                                   | 0 luôn (trừ khi bị interrupt)                 |
| `exit <code>`    | Thoát shell với exit code                          | code bạn truyền                                |

Bài 8 sẽ học thêm: `pwd`, `ls`, **biến môi trường**.

---

## Pipeline sau bài 7

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
        stage('Test') {
            steps {
                echo 'Testing the new laptop'
                sh '''
                    test -f build/laptop.txt
                    grep "mainboard" build/laptop.txt
                    grep "display"   build/laptop.txt
                    grep "keyboard"  build/laptop.txt
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

Pipeline đã có **3 stage**, **tự verify** kết quả. Đây là một pipeline CI mini hoàn chỉnh.

---

## Trao đổi nâng cao: vì sao test là "lưới an toàn"

Sau khi có stage Test, bạn có thể **mạnh dạn thay đổi** stage Build. Ví dụ xoá luôn `touch`:

```groovy
sh '''
    mkdir -p build
    # touch build/laptop.txt           ← Bỏ
    echo "mainboard" >> build/laptop.txt
    echo "display"   >> build/laptop.txt
    echo "keyboard"  >> build/laptop.txt
'''
```

Build → Test → **vẫn pass**! Vì `echo "x" >> file` tự tạo file nếu chưa có. → `touch` không cần thiết.

→ **Đây là sức mạnh của test**. Khi có test chắc chắn, bạn được **refactor / tối ưu code** mà không sợ break. Đây cũng là tinh thần của **TDD** (Test-Driven Development).

---

## Pitfall: pipefail

Bạn dùng pipe `|` để chain command:

```bash
cmd-fail | grep "x"
```

Default behavior: exit code của **lệnh cuối cùng** trong pipe — ở đây là `grep`. Nếu `cmd-fail` fail nhưng `grep` chạy được (vì có stdin), exit code = 0 → Jenkins nghĩ pass.

Fix:

```groovy
sh '''
    set -o pipefail
    cmd-fail | grep "x"
'''
```

→ `pipefail` bật chế độ: exit code của pipe = lệnh **đầu tiên** fail. Best practice cho mọi script CI có pipe.

---

## Pitfall: `set -e` (errexit)

Bash mặc định **không dừng** khi một lệnh fail trong script:

```bash
ls /nonexistent       # Fail, exit 2
echo "tiếp tục"      # Vẫn chạy!
```

→ Trong pipeline, mỗi `sh '<single line>'` chỉ chạy 1 lệnh nên không vấn đề. Nhưng với triple-quote multi-line, bạn nên bật `set -e`:

```groovy
sh '''
    set -e
    cmd1
    cmd2
    cmd3
'''
```

→ Nếu `cmd1` fail, không chạy `cmd2`, `cmd3`. Jenkins thấy exit non-zero → mark FAILURE.

**Best practice combo**:

```bash
set -euo pipefail
```

- `-e` — dừng khi có lỗi.
- `-u` — coi biến chưa định nghĩa là lỗi.
- `-o pipefail` — pipe fail nếu bất kỳ lệnh nào trong pipe fail.

Hầu hết Jenkinsfile production đều có dòng này ở đầu mỗi `sh` block.

---

## Tóm tắt

- **Stage Test** là bước verify artifact tự động — bạn đỡ phải manual check.
- **Exit code** là ngôn ngữ universal giữa command tool và Jenkins:
  - `0` = success → step pass.
  - `≠ 0` = fail → step fail → pipeline FAILURE.
- `test -f` kiểm tra tồn tại file. `grep` kiểm tra chuỗi trong file. Cả 2 đều dùng exit code.
- `cat` **không** thay được `grep` — vì `cat` luôn exit 0.
- Trong shell, comment là `#` (không phải `//`).
- Test có ý nghĩa: cho phép refactor build mà không sợ break.
- **Best practice** cho `sh` multi-line: `set -euo pipefail`.

---

## Đọc thêm

- Linux Documentation: <https://tldp.org/LDP/abs/html/exitcodes.html> — exit codes chi tiết.
- Bash man page: `set` builtin — `man set`.

---

→ [Bài tiếp theo: Environment variables, Pipeline Graph và tổng kết Phase 1](08-env-vars-graph-view-tong-ket.md)

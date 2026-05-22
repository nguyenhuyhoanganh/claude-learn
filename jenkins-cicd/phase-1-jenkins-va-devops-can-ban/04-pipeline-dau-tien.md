# Bài 4: Pipeline đầu tiên — "Laptop Assembly"

Bài trước bạn đã viết pipeline 1 dòng `echo 'Hello World'`. Bài này dựng một **pipeline thực sự**: nhiều bước, có tạo file, có lệnh shell. Đây cũng là pipeline mẫu xuyên suốt bài 4 → 7 — bạn sẽ liên tục mở rộng nó.

## Ý tưởng: lắp ráp laptop ảo

Bài 3 nhắc đến "assembly line" — dây chuyền lắp ráp. Hãy mô phỏng dây chuyền lắp laptop, nhưng thay vì linh kiện thật, **dùng file text**:

```text
Step 1: Tạo thư mục build/
Step 2: Tạo file build/laptop.txt (đại diện cho cái thân máy rỗng)
Step 3: Cho mainboard vào
Step 4: Cho display vào
Step 5: Cho keyboard vào
Step 6: Kiểm tra file đã đầy đủ chưa
```

Khi pipeline chạy xong, file `build/laptop.txt` sẽ chứa:

```text
mainboard
display
keyboard
```

Phương pháp này nghe đơn giản nhưng dạy bạn **toàn bộ pattern cốt lõi**: tạo workspace, chạy nhiều lệnh shell, sản sinh artifact, debug khi lỗi.

---

## Bước 1: Tạo pipeline job mới

Dashboard → **+ New Item** → tên `laptop-assembly` → chọn **Pipeline** → **OK** → cuộn xuống section **Pipeline** → chọn template **Hello World**:

```groovy
pipeline {
    agent any
    stages {
        stage('Hello') {
            steps {
                echo 'Hello World'
            }
        }
    }
}
```

Đổi `'Hello'` thành `'Build'` (đây là stage build):

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                echo 'Building a new laptop'
            }
        }
    }
}
```

**Save** → **Build Now** → kiểm tra log: thấy `Building a new laptop` là OK.

---

## Bước 2: Tạo thư mục bằng `mkdir`

Để giữ artifact gọn gàng, mình bỏ tất cả vào thư mục `build/`. Lệnh Linux để tạo thư mục là `mkdir`:

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                echo 'Building a new laptop'
                sh 'mkdir build'
            }
        }
    }
}
```

> `mkdir build` = make directory tên `build` trong thư mục hiện tại (workspace của job).

Save → Build Now → log:

```text
+ mkdir build
```

Không có lỗi = tạo thành công.

---

## Bước 3: Tạo file rỗng bằng `touch`

Cho mỗi laptop một file riêng:

```groovy
sh 'touch build/laptop.txt'
```

`touch <file>` có 2 chức năng:
- Nếu file **chưa tồn tại** → tạo file rỗng.
- Nếu file **đã tồn tại** → cập nhật thời gian modified (không sửa nội dung).

Pipeline đầy đủ:

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                echo 'Building a new laptop'
                sh 'mkdir build'
                sh 'touch build/laptop.txt'
            }
        }
    }
}
```

Save → Build Now → **lỗi!**

```text
+ mkdir build
mkdir: cannot create directory 'build': File exists
script returned exit code 1
```

### Phân tích lỗi

Build chạy lần đầu OK, nhưng lần 2 fail. Vì sao? Vì lần 1 đã tạo `build/`. Lần 2 `mkdir build` lại → Linux cảnh báo *"đã có rồi"* → exit code 1 → Jenkins coi là **FAILURE**.

> Đây là bài học vàng đầu tiên: **workspace giữa các build không tự reset**. Nó là cùng một thư mục. Bài 5 sẽ học cách dọn dẹp.

### Fix tạm thời: `mkdir -p`

Cờ `-p` (parents) nói với `mkdir`: *"nếu thư mục có rồi thì OK, đừng la"*:

```groovy
sh 'mkdir -p build'
```

Save → Build Now → SUCCESS.

---

## Bước 4: Đẩy nội dung vào file bằng `echo >>`

Giờ cho linh kiện đầu tiên vào laptop:

```groovy
sh 'echo "mainboard" >> build/laptop.txt'
```

Phân tích:

- `echo "mainboard"` — in chuỗi `mainboard`.
- `>>` — **toán tử append** (nối tiếp): đẩy output của lệnh bên trái vào **cuối** file bên phải. Nếu file chưa có, tạo mới.

So sánh:

| Cú pháp                 | Ý nghĩa                                          |
|-------------------------|--------------------------------------------------|
| `echo "x"`              | In `x` ra màn hình.                              |
| `echo "x" > file.txt`   | Ghi `x` vào `file.txt`, **ghi đè** nội dung cũ.  |
| `echo "x" >> file.txt`  | **Nối** `x` vào cuối `file.txt`, giữ nguyên phần trước. |

Pipeline:

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                echo 'Building a new laptop'
                sh 'mkdir -p build'
                sh 'touch build/laptop.txt'
                sh 'echo "mainboard" >> build/laptop.txt'
            }
        }
    }
}
```

Save → Build Now → SUCCESS. Nhưng làm sao biết file đã được ghi đúng?

---

## Bước 5: Kiểm tra nội dung bằng `cat`

`cat <file>` in ra toàn bộ nội dung file. (Tên `cat` đến từ *concatenate*, không liên quan mèo.)

```groovy
sh 'cat build/laptop.txt'
```

Pipeline đầy đủ:

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                echo 'Building a new laptop'
                sh 'mkdir -p build'
                sh 'touch build/laptop.txt'
                sh 'echo "mainboard" >> build/laptop.txt'
                sh 'cat build/laptop.txt'
            }
        }
    }
}
```

Save → Build Now → mở Console Output:

```text
+ cat build/laptop.txt
mainboard
mainboard
```

**Tại sao có 2 `mainboard`?** Vì lần build trước đã append `mainboard` vào file rồi, lần này append thêm 1 dòng nữa. File `laptop.txt` không tự xoá giữa các build.

→ Đây lại là vấn đề "workspace persistence". Sẽ giải quyết ở bài 5.

Tạm thời, ta tiếp tục thêm 2 linh kiện nữa:

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                echo 'Building a new laptop'
                sh 'mkdir -p build'
                sh 'touch build/laptop.txt'
                sh 'echo "mainboard" >> build/laptop.txt'
                sh 'cat build/laptop.txt'
                sh 'echo "display"   >> build/laptop.txt'
                sh 'cat build/laptop.txt'
                sh 'echo "keyboard"  >> build/laptop.txt'
                sh 'cat build/laptop.txt'
            }
        }
    }
}
```

Mỗi lần thêm linh kiện ta `cat` lại để xem tiến triển — đây là cách **debug pipeline** thuần tuý.

Chạy → log:

```text
+ cat build/laptop.txt
mainboard
mainboard
mainboard
+ echo display
+ cat build/laptop.txt
mainboard
mainboard
mainboard
display
+ echo keyboard
+ cat build/laptop.txt
mainboard
mainboard
mainboard
display
keyboard
```

Hết bài 4, bạn đã có pipeline chạy được **5 lệnh shell**, **tạo artifact** (`build/laptop.txt`), **kiểm tra kết quả**. Kết quả không hoàn hảo (mainboard bị duplicate) — bài 5 sẽ fix.

---

## Vài lệnh Linux bạn vừa làm quen

| Lệnh                                | Ý nghĩa                                          |
|-------------------------------------|--------------------------------------------------|
| `mkdir <dir>` / `mkdir -p <dir>`    | Tạo thư mục. `-p` = không lỗi nếu đã có.         |
| `touch <file>`                      | Tạo file rỗng (hoặc update timestamp).           |
| `echo "text"`                       | In `text` ra stdout.                             |
| `echo "x" > file`                   | Ghi `x` vào file, **overwrite**.                 |
| `echo "x" >> file`                  | **Append** `x` vào cuối file.                    |
| `cat <file>`                        | In nội dung file ra stdout.                      |

Bài tiếp theo sẽ thêm: `rm` (xoá), `test` (kiểm tra tồn tại), `grep` (tìm chuỗi).

---

## Tìm file vừa tạo ở đâu trên Jenkins?

Trong Console Output, bạn để ý dòng đầu:

```text
Running in /var/jenkins_home/workspace/laptop-assembly
```

Đây là **workspace path**. Tất cả file pipeline tạo ra đều nằm trong đó. Để xem qua UI:

1. Vào trang job `laptop-assembly`.
2. Bên trái có menu **Workspace** → click.
3. Bạn thấy cây thư mục:

```text
laptop-assembly/
└── build/
    └── laptop.txt    [view] [edit]
```

Click **view** để xem nội dung. Đây là cách **manual inspect** artifact rất hữu ích khi debug.

---

## Pipeline đầy đủ sau bài 4

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                echo 'Building a new laptop'
                sh 'mkdir -p build'
                sh 'touch build/laptop.txt'
                sh 'echo "mainboard" >> build/laptop.txt'
                sh 'cat build/laptop.txt'
                sh 'echo "display"   >> build/laptop.txt'
                sh 'cat build/laptop.txt'
                sh 'echo "keyboard"  >> build/laptop.txt'
                sh 'cat build/laptop.txt'
            }
        }
    }
}
```

Có 2 vấn đề **chưa giải quyết** (bài 5 sẽ xử lý):

1. Workspace không reset giữa các build → `laptop.txt` chứa data của nhiều build chồng chất.
2. Nếu tắt Jenkins / xoá workspace, **artifact mất luôn**. Cần "lưu trữ chính thức" qua **archive**.

---

## Tóm tắt

- Pipeline có thể chứa **nhiều `sh`** trong một `steps` — Jenkins chạy lần lượt.
- **Workspace** = thư mục riêng cho mỗi job, lưu trên Jenkins controller (`/var/jenkins_home/workspace/<job>`).
- Workspace **không tự reset** giữa các build → file cũ có thể gây lỗi.
- Các lệnh Linux đã học: `mkdir`, `touch`, `echo`, `cat`, toán tử `>` (overwrite) và `>>` (append).
- Mỗi lệnh trả về **exit code** — non-zero = Jenkins coi là FAILURE và dừng pipeline (chi tiết bài 7).
- Khi nghi ngờ, mở Console Output **đọc từ trên xuống** — dòng cuối có lỗi, dòng đầu cho context.

---

→ [Bài tiếp theo: Workspace, Artifacts và Post Actions](05-workspace-artifacts-post-actions.md)

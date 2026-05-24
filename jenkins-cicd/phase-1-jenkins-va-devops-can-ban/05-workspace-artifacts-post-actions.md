# Bài 5: Workspace, Artifacts và Post Actions

Bài 4 để lại 2 vấn đề:

1. Workspace **không reset** giữa các build → `laptop.txt` bị duplicate dữ liệu.
2. Artifact nằm trong workspace, nếu **xoá workspace** thì mất luôn.

Bài này giải quyết cả hai bằng cách giới thiệu **post actions** — block đặc biệt chạy **sau** khi stages kết thúc.

## Workspace là gì (chính xác)?

**Workspace** = thư mục dành riêng cho **mỗi job**, nằm trên agent (trong setup học của bạn = chính Jenkins controller). Mỗi lần job chạy, agent dùng workspace này làm "phòng làm việc".

```text
/var/jenkins_home/
└── workspace/
    ├── laptop-assembly/      ← workspace của job laptop-assembly
    │   └── build/
    │       └── laptop.txt
    ├── hello-pipeline/
    └── another-job/
```

**Đặc tính quan trọng**:

- Workspace **không tự xoá** sau khi build xong → giữa các build dùng chung thư mục.
- Khi job chạy lần 2, các file lần 1 vẫn còn → có thể gây side effect (như duplicate `mainboard`).
- Đây là **design choice của Jenkins** — đôi khi giữ workspace có ích (cache dependencies, incremental build), nhưng đôi khi gây vấn đề.

## 2 cách dọn workspace

### Cách 1: Tự xoá file thừa bằng `rm`

```groovy
sh 'rm -f build/laptop.txt'
```

- `rm` = remove file.
- `-f` = force, không hỏi confirmation, không lỗi nếu file không tồn tại.

→ Hoạt động được, nhưng phải **biết chính xác file/thư mục nào cần xoá**. Pipeline càng phức tạp, càng dễ sót.

### Cách 2: Xoá sạch workspace bằng `cleanWs()`

Jenkins có hàm built-in `cleanWs()` (clean workspace) — xoá **toàn bộ** workspace.

```groovy
cleanWs()
```

Đây là cách an toàn hơn: **trắng hoàn toàn**, không lo sót.

> Cần plugin **Workspace Cleanup** — đã có sẵn trong nhóm "suggested plugins" cài ở bài 2.

---

## Đặt `cleanWs()` ở đâu?

Hai chỗ có thể đặt:

### Option A: Đầu pipeline (clean **trước** khi build)

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
                sh 'mkdir -p build'
                sh 'echo "mainboard" > build/laptop.txt'
                ...
            }
        }
    }
}
```

**Ưu**: build trên workspace sạch ngay từ đầu — kết quả 100% reproducible.  
**Nhược**: xoá luôn cache, mỗi build phải tải lại dependency từ đầu.

### Option B: Cuối pipeline (clean **sau** khi build)

Đặt trong **post block** — cấu trúc đặc biệt chạy sau stages:

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                ...
            }
        }
    }
    post {
        always {
            cleanWs()
        }
    }
}
```

**Ưu**: artifact vẫn còn để inspect ngay sau build → debug dễ.  
**Nhược**: build lần sau (nếu archive failed) sẽ mất luôn.

> Trong khoá, ta sẽ dùng **Option A** (clean trước build) vì nó dễ reason hơn. Workspace luôn sạch → kết quả không phụ thuộc lịch sử.

---

## Tìm hiểu sâu: Post Actions

`post { ... }` là block chạy **sau** khi `stages` kết thúc. Đây là chỗ làm các việc "dọn dẹp / báo cáo / lưu trữ".

### Cú pháp đầy đủ

```groovy
pipeline {
    agent any
    stages {
        stage('Build') { steps { ... } }
        stage('Test')  { steps { ... } }
    }
    post {
        always   { /* chạy bất kể thành công hay fail */ }
        success  { /* chỉ chạy nếu mọi stage thành công */ }
        failure  { /* chỉ chạy nếu có stage fail */ }
        unstable { /* chạy nếu build "unstable" (có test fail nhưng không crash) */ }
        changed  { /* chạy nếu status đổi so với build trước (success → fail hoặc ngược lại) */ }
    }
}
```

Bạn có thể có **nhiều block** cùng lúc, ví dụ:

```groovy
post {
    always {
        cleanWs()
    }
    failure {
        echo 'Build failed! Gửi Slack báo dev nhé.'
    }
    success {
        echo 'Build OK! Triển khai tiếp.'
    }
}
```

### Thứ tự thực thi

Jenkins chạy post conditions theo **thứ tự cố định**:

```text
always → changed → fixed → regression → aborted → failure → success → unstable → cleanup
```

→ `always` **luôn chạy trước** `success`/`failure`. Nhớ điều này khi xếp action — sẽ ảnh hưởng quyết định ở phần dưới.

### Quan trọng: indentation

`post` phải nằm **cùng cấp** với `stages`, không phải bên trong:

```groovy
pipeline {                  // pipeline {
    agent any               //     agent
    stages { ... }          //     stages {       ←
    post { ... }            //     ...            │ cùng level
}                           //     }              │
                            //     post {         ←
                            //     ...
                            //     }
                            // }
```

Sai indentation → Jenkins báo lỗi *"unexpected token"*.

---

## Lưu trữ artifact bằng `archiveArtifacts`

Vấn đề thứ 2 từ bài 4: nếu workspace bị xoá, `laptop.txt` mất. Giải pháp: **archive** — Jenkins copy artifact sang một chỗ lưu trữ **riêng**, gắn vào build history.

```groovy
post {
    success {
        archiveArtifacts artifacts: 'build/**'
    }
}
```

Giải nghĩa:

- `archiveArtifacts` — step có sẵn trong Jenkins core.
- `artifacts: 'build/**'` — path đến artifact. Hai dấu `**` là wildcard *"mọi thứ bên trong, kể cả subdir"*.

Đặt trong `success` (không phải `always`) vì:
- Build fail → artifact có thể không hoàn chỉnh → archive làm gì cho tốn ổ đĩa.
- Nếu muốn debug build fail → vào workspace xem trực tiếp.

### Sau khi archive, artifact xuất hiện ở đâu?

Vào trang job → trang Build cụ thể → ở phải có panel **Build Artifacts**:

```text
Build Artifacts:
  📁 build/
     └── 📄 laptop.txt
```

Click vào → tải file về máy, hoặc xem nội dung qua browser. Đây là cách share artifact (binary, build output, test report HTML…) cho đồng nghiệp không có quyền vào workspace.

---

## Cẩn thận: thứ tự `cleanWs` và `archiveArtifacts`

Đây là **lỗi siêu phổ biến**. Xem pipeline sai sau:

```groovy
post {
    always {
        cleanWs()                                    // ← Xoá workspace
    }
    success {
        archiveArtifacts artifacts: 'build/**'       // ← Archive cái không còn nữa
    }
}
```

Log sẽ báo:

```text
ERROR: No artifacts found that match the file pattern "build/**"
```

→ Vì `always` chạy **trước** `success` (theo thứ tự trên), workspace bị xoá rồi mới archive → không có gì để archive.

### Cách sửa 1: chuyển `cleanWs` sang stage đầu

```groovy
pipeline {
    agent any
    stages {
        stage('Clean') {
            steps {
                cleanWs()                            // ← Clean ở stage đầu
            }
        }
        stage('Build') {
            steps {
                sh 'mkdir -p build'
                sh 'echo "mainboard" > build/laptop.txt'
                ...
            }
        }
    }
    post {
        success {
            archiveArtifacts artifacts: 'build/**'   // ← Archive an toàn, workspace còn nguyên
        }
    }
}
```

→ Đây là cách **khoá học chọn**, vì:
- Workspace **luôn sạch** trước build.
- Có thể archive an toàn sau build.
- Sau build, workspace còn nguyên → inspect được nếu cần debug.

### Cách sửa 2: dùng `success` cho cleanWs

```groovy
post {
    success {
        archiveArtifacts artifacts: 'build/**'      // 1. Archive trước
        cleanWs()                                    // 2. Clean sau
    }
}
```

→ Hoạt động nhưng có nhược điểm: chỉ clean khi success. Nếu fail → workspace bẩn vẫn còn.

---

## Pipeline đầy đủ sau bài 5

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
                sh 'mkdir -p build'
                sh 'touch build/laptop.txt'
                sh 'echo "mainboard" >> build/laptop.txt'
                sh 'echo "display"   >> build/laptop.txt'
                sh 'echo "keyboard"  >> build/laptop.txt'
                sh 'cat build/laptop.txt'
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

Save → Build Now (vài lần). Mỗi lần `cat` ra phải thấy đúng 3 dòng:

```text
mainboard
display
keyboard
```

Không còn duplicate. ✅ Mở trang build → thấy **Build Artifacts**: `build/laptop.txt`. ✅

---

## Khi nào artifact bị xoá?

Mỗi build giữ artifact riêng → đĩa Jenkins sẽ phình nhanh. Mặc định Jenkins **không tự xoá**.

Để giới hạn, vào **Configure** job → bật **Discard old builds**:

```text
[ ] Discard old builds
    Max # of builds to keep:        20
    Days to keep:                   30
    Max # of builds w/ artifacts:   5
```

Hoặc trong Jenkinsfile (Declarative):

```groovy
pipeline {
    options {
        buildDiscarder(logRotator(numToKeepStr: '20', artifactNumToKeepStr: '5'))
    }
    agent any
    stages { ... }
}
```

→ Giữ 20 build (log) nhưng chỉ 5 build có artifact đầy đủ.

---

## So sánh: workspace vs archived artifacts

| Đặc tính              | Workspace                             | Archived Artifacts                                |
|-----------------------|---------------------------------------|---------------------------------------------------|
| Vị trí                | `/var/jenkins_home/workspace/<job>/`  | `/var/jenkins_home/jobs/<job>/builds/<n>/archive/` |
| Liên kết với build    | **Job** (chung mọi build)             | **Một build cụ thể**                              |
| Reset khi clean       | Có (mất hết)                          | Không                                              |
| UI xem được           | Có (menu Workspace)                   | Có (panel Build Artifacts)                         |
| Tải về browser        | Có                                    | Có                                                 |
| Mục đích              | Working area                          | Lưu trữ deliverable, share, deploy                 |

→ Mỗi loại có mục đích riêng. **Đừng nhầm** workspace với artifact.

---

## Tóm tắt

- **Workspace** là thư mục làm việc của job — **không tự reset** giữa các build.
- `cleanWs()` xoá sạch workspace; đặt ở **stage đầu** là pattern tốt nhất.
- **Post actions** chạy sau stages, có các condition: `always`, `success`, `failure`, `unstable`, `changed`...
- `always` **luôn chạy trước** `success` → đừng đặt `cleanWs()` trong `always` rồi `archiveArtifacts` trong `success`.
- **`archiveArtifacts`** lưu artifact gắn với từng build, tách khỏi workspace, có thể tải qua UI.
- Pattern khuyến nghị: `cleanWs()` ở stage đầu + `archiveArtifacts` trong `post { success { ... } }`.

---

## Đọc thêm

- Jenkins doc: [Pipeline Syntax → post](https://www.jenkins.io/doc/book/pipeline/syntax/#post) — đầy đủ các condition.
- Plugin doc: [Workspace Cleanup](https://plugins.jenkins.io/ws-cleanup/) — các option nâng cao của `cleanWs`.

---

→ [Bài tiếp theo: Shell, debugging và tối ưu pipeline](06-shell-debugging-toi-uu-pipeline.md)

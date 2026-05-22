# Bài 3: Jobs, Pipeline và kiến trúc Controller / Agent

Bài trước bạn đã có Jenkins chạy ở `localhost:8080`. Giờ chúng ta tạo **job đầu tiên** và đồng thời hiểu kiến trúc Jenkins hoạt động bên dưới như thế nào.

## Job là gì?

Trong Jenkins, **job = một việc bạn muốn tự động hoá**. Có thể là:

- "Mỗi sáng 6h chạy backup database."
- "Mỗi lần ai đó push lên branch `main`, build + test."
- "Mỗi đêm pull dependency mới nhất, scan security."

Khi bạn click **+ New Item** trên dashboard, Jenkins hỏi chọn **loại job**:

```text
┌─────────────────────────────────────────┐
│  Enter an item name                     │
│  [ hello-world                        ] │
│                                         │
│  ○  Freestyle project   ← (legacy)     │
│  ○  Pipeline             ← (modern)    │
│  ○  Multibranch Pipeline                │
│  ○  Folder                              │
│  ○  ...                                 │
└─────────────────────────────────────────┘
```

2 loại bạn sẽ gặp nhiều nhất: **Freestyle** và **Pipeline**. Hiểu khác biệt là cực kỳ quan trọng.

---

## Freestyle: thuở sơ khai của Jenkins

**Freestyle job** là cách Jenkins làm việc từ lúc mới ra đời (năm 2011, lúc đó tên là Hudson). Bạn cấu hình **qua UI**: click chuột vào các form fields, dropdown, checkbox.

### Tạo Freestyle job mẫu

1. **+ New Item** → tên `hello-freestyle` → chọn **Freestyle project** → **OK**.
2. Cuộn xuống section **Build Steps** → **Add build step** → **Execute shell**.
3. Trong textarea, gõ:

```bash
echo "Hello from Jenkins"
```

4. **Save** → ở trang job, click **Build Now**.
5. Trong **Build History** (bên trái), click vào build mới (#1) → **Console Output**.

Bạn sẽ thấy:

```text
Started by user valentin
Running as SYSTEM
Building in workspace /var/jenkins_home/workspace/hello-freestyle
[hello-freestyle] $ /bin/sh -xe /tmp/jenkins1234.sh
+ echo Hello from Jenkins
Hello from Jenkins
Finished: SUCCESS
```

🎉 Job đầu tiên đã chạy!

### `echo` là gì?

`echo` là một lệnh Linux để in ra một chuỗi (text). Đây là cách kinh điển để **debug**: in giá trị biến, in trạng thái, in nhãn để biết đang ở bước nào trong script.

Trong khoá, bạn sẽ gặp rất nhiều lệnh Linux. Bài 6 và 7 sẽ giới thiệu tập trung. Tạm thời hiểu `echo "..."` = in ra dòng đó.

### Vấn đề của Freestyle

Bạn vừa làm được job đầu tiên trong **30 giây**. Nghe có vẻ tuyệt vời. Nhưng Freestyle có một vài nhược điểm chết người:

| Vấn đề                            | Hệ quả                                                                  |
|-----------------------------------|-------------------------------------------------------------------------|
| Cấu hình lưu **trong Jenkins**, không phải code | Không versioning. Ai sửa gì, lúc nào — không biết.            |
| Khó **review changes**            | Không tích hợp Git. Code review không thể "diff" được cấu hình job.    |
| Phải **click chuột** để config    | Chậm, dễ sai, không nhân bản được sang Jenkins khác.                   |
| Khó xử lý workflow phức tạp       | Parallel stages, conditional, retry... đều phải cài plugin từng loại. |
| Khó **share** giữa các project    | 50 project = 50 cấu hình giống nhau lặp lại, copy-paste error.         |

> Ví dụ kinh điển: một sáng đẹp trời, pipeline production bị fail. Bạn vào Jenkins xem thì... không hiểu sao job khác so với tuần trước. Ai đó vào sửa qua UI, không log, không commit. Bạn không thể rollback dễ dàng. Đây là **kẻ thù lớn nhất** của Freestyle.

→ Trong môi trường **DevOps hiện đại**, bạn **không nên** tạo Freestyle job mới. Đây là lý do toàn bộ khoá học sẽ dạy **Pipeline**.

> Lưu ý: ở công ty thực tế bạn vẫn có thể gặp Freestyle vì là **legacy** (code cũ). Hiểu nó là đủ. Đừng tạo mới.

---

## Pipeline: Pipeline-as-Code

**Pipeline job** lưu toàn bộ cấu hình trong một **đoạn code Groovy**, gọi là **Jenkinsfile**. Đoạn code này có thể đặt:

- Trong textarea UI (như bạn sẽ làm ngay sau đây).
- Hoặc — **cách đúng**: trong **file `Jenkinsfile`** ở root của repo, commit cùng source code → Jenkins đọc từ Git mỗi lần build.

### Tạo Pipeline job đầu tiên

1. Dashboard → **+ New Item** → tên `hello-pipeline` → chọn **Pipeline** → **OK**.
2. Cuộn xuống section **Pipeline**.
3. Trong dropdown **try sample Pipeline...**, chọn **Hello World**. Bạn sẽ thấy:

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

4. **Save** → **Build Now** → mở Console Output.

```text
Started by user valentin
[Pipeline] Start of Pipeline
[Pipeline] node
Running on Jenkins in /var/jenkins_home/workspace/hello-pipeline
[Pipeline] {
[Pipeline] stage
[Pipeline] { (Hello)
[Pipeline] echo
Hello World
[Pipeline] }
[Pipeline] // stage
[Pipeline] }
[Pipeline] // node
[Pipeline] End of Pipeline
Finished: SUCCESS
```

Khác Freestyle: log có nhiều dòng `[Pipeline] ...` — Jenkins đang **interpret từng bước** trong Jenkinsfile.

### Mổ xẻ syntax

```groovy
pipeline {                       // ← Block ngoài cùng, bắt buộc
    agent any                    // ← Chạy trên bất kỳ agent nào (xem phần kiến trúc dưới)
    stages {                     // ← Tập hợp các stage
        stage('Hello') {         // ← Một stage tên 'Hello'
            steps {              // ← Tập hợp các step
                echo 'Hello World'   // ← Một step: in ra "Hello World"
            }
        }
    }
}
```

Các khái niệm quan trọng:

- **`pipeline { ... }`**: block bao toàn bộ definition. Đây là **Declarative Pipeline syntax** (loại syntax được khuyên dùng).
- **`agent any`**: nói Jenkins chạy pipeline này trên agent **bất kỳ** rảnh. Phần "agent là gì" ở mục kiến trúc bên dưới.
- **`stages { stage('Name') { steps { ... } } }`**: cấu trúc 3 lớp. Một pipeline có nhiều **stage** (Build, Test, Deploy…), mỗi stage có nhiều **step** (echo, sh, archiveArtifacts…).

### `echo` vs `sh`

`echo` là **lệnh của Jenkins** (Groovy), in ra console của Jenkins. Còn nếu muốn chạy **lệnh shell thật** (Linux), dùng `sh`:

```groovy
stage('Hello') {
    steps {
        echo 'Đây là echo của Jenkins'    // In ra log Jenkins
        sh 'echo "Đây là echo của Linux"' // Mở shell, chạy lệnh echo Linux
        sh 'whoami'                       // Chạy lệnh whoami của Linux
    }
}
```

Vì sao cần `sh`? Vì 99% công việc bạn sẽ làm trong pipeline là **gọi command line tool**: `npm install`, `mvn package`, `pytest`, `docker build`, `aws s3 cp`… → đều phải qua `sh`.

Lưu ý: chạy `whoami` trong Jenkins (Docker) sẽ in `jenkins` — đây là user system bên trong container.

---

## Vì sao có cả Freestyle và Pipeline?

Câu hỏi tự nhiên: Pipeline tốt hơn vậy sao Jenkins còn giữ Freestyle?

**Lịch sử**:
- 2011: Hudson (tiền thân Jenkins) ra đời, chỉ có **Freestyle**.
- 2014: Hudson tách thành Jenkins (community) và Hudson (Oracle). Cộng đồng nhận ra Freestyle có giới hạn lớn.
- 2016: **Pipeline plugin** ra đời, đem theo concept "Pipeline-as-Code". Đây là bước ngoặt.
- Hiện tại: Freestyle vẫn được giữ vì backward-compatible — hàng triệu job legacy đang chạy bằng nó.

**Tóm tắt khuyến nghị**:

| Tình huống                              | Dùng              |
|-----------------------------------------|-------------------|
| Maintain job cũ ở công ty               | Freestyle (legacy)|
| Tạo job mới                             | **Pipeline**       |
| POC nhanh không cần lưu lâu             | Có thể Freestyle  |
| Bất kỳ thứ gì sẽ tồn tại > 1 tháng      | **Pipeline**       |

Toàn bộ khoá này dùng **Pipeline**.

---

## Kiến trúc Jenkins: Controller và Agent

Sau khi đã tạo được job, hãy hiểu **bên dưới chuyện gì đang xảy ra**.

Tối thiểu, Jenkins gồm 2 phần:

```text
┌─────────────────────────────┐
│      Jenkins Controller      │
│         (Master)             │
│                              │
│  • UI (port 8080)            │
│  • Lưu job config            │
│  • Lưu build history         │
│  • Quản lý plugins           │
│  • Lập lịch (scheduler)      │
│  • Điều phối agents          │
└───────────┬─────────────────┘
            │ giao tiếp qua port 50000
            │ (TCP socket / SSH / JNLP)
   ┌────────┼───────────┐
   ▼        ▼           ▼
┌──────┐ ┌──────┐    ┌──────┐
│Agent │ │Agent │    │Agent │
│  1   │ │  2   │    │  N   │
│      │ │      │    │      │
│Build │ │ Test │    │Deploy│
└──────┘ └──────┘    └──────┘
```

### Controller làm gì?

- **Brain** của Jenkins. Biết phải làm gì, khi nào, nhưng **không tự thực thi**.
- Quản lý queue: ai đến trước thì chạy trước.
- Lưu kết quả: log, test report, artifact.
- Cung cấp UI, REST API.

### Agent làm gì?

- **Worker** thực sự thực thi pipeline.
- Nhận instructions từ Controller → chạy lệnh shell → báo kết quả về.
- Có thể là Linux, Windows, macOS, ARM, container Docker…
- Một Controller có thể có **N agent** chạy song song.

### Ví von kinh điển: MI6 và James Bond

> **Controller** giống MI6 ở London — biết toàn bộ chiến dịch, có cái nhìn tổng thể, lưu hồ sơ, ra mệnh lệnh.  
> **Agent** giống James Bond — đi ngoài mặt trận, **thực sự làm việc**, đối mặt với bom đạn.

MI6 không tự ra trận; James Bond không tự quyết chiến dịch. Cả hai cần nhau.

### Vì sao tách Controller và Agent?

1. **Scale ngang**: 1 controller có thể điều phối hàng chục agent. Khi build nhiều, thêm agent là xong.
2. **Đa nền tảng**: agent có thể là Linux (build Node.js), Windows (build .NET), macOS (build iOS app). Một controller điều phối tất cả.
3. **Cách ly môi trường**: build của project A ở agent A, project B ở agent B → không xung đột dependency.
4. **Tránh quá tải controller**: nếu controller vừa quản lý UI vừa build heavy thì sẽ chậm cả 2 → trải nghiệm tệ.

### Setup học của bạn: tất cả trong một

Trong khoá này (Jenkins Docker), **controller cũng đóng vai agent** — đây là cấu hình mặc định, đơn giản nhất. Khi pipeline ghi `agent any`, agent chính là Jenkins container.

> **Cảnh báo production**: trong môi trường production, gộp controller + agent là **anti-pattern**. Một build nặng (compile C++, build Docker image) có thể làm UI Jenkins lag, ảnh hưởng cả team. Tách agent riêng từ ngày đầu là best practice.

Phần triển khai agent riêng nằm ngoài phạm vi khoá này, nhưng bạn nên biết:

- **SSH agent**: controller dùng SSH connect đến server agent.
- **JNLP agent**: agent tự connect ngược về controller (port 50000).
- **Docker agent**: mỗi build spawn 1 container mới làm agent (rất sạch sẽ — Phase 4 sẽ chạm tới).
- **Kubernetes agent**: agent là Pod ephemeral, scale tự động.

---

## Mapping với những gì bạn đã thấy

Quay lại pipeline `hello-pipeline`:

```groovy
pipeline {
    agent any              // ← Controller tìm agent rảnh (ở đây = chính nó)
    stages {
        stage('Hello') {
            steps {
                echo 'Hello World'   // ← Controller gửi step này cho agent
            }                         //    Agent in "Hello World"
        }                             //    Agent báo SUCCESS về Controller
    }
}
```

Mỗi step bạn viết → controller tạo "task" → gửi xuống agent thực thi. Agent thực thi xong → báo kết quả.

---

## Tóm tắt

- **Freestyle job** = cấu hình qua UI, lưu trong Jenkins. **Legacy**, không khuyến khích tạo mới.
- **Pipeline job** = cấu hình bằng code Groovy (Jenkinsfile), versioning được. **Cách hiện đại**.
- Pipeline có cấu trúc: `pipeline { agent ... stages { stage { steps { ... } } } }`.
- **`echo`** = in ra log Jenkins. **`sh`** = chạy lệnh shell Linux thực sự.
- Jenkins gồm **Controller** (não, điều phối) + **Agent** (tay chân, thực thi). Tách 2 lớp giúp scale, an toàn, đa nền tảng.
- Trong khoá học, controller + agent gộp trong 1 container Docker → đơn giản, không production-grade.

---

## Đọc thêm

- Jenkins doc: <https://www.jenkins.io/doc/book/pipeline/syntax/> — syntax đầy đủ của Declarative Pipeline.
- Jenkins doc: <https://www.jenkins.io/doc/book/managing/nodes/> — agent setup các loại.

---

→ [Bài tiếp theo: Pipeline đầu tiên — Laptop Assembly](04-pipeline-dau-tien.md)

# Bài 2: Cài Jenkins bằng Docker

## Vì sao dùng Docker để cài Jenkins (mà không cài trực tiếp)?

Jenkins có nhiều cách cài:

| Cách                         | Ưu                                              | Nhược                                                       |
|------------------------------|-------------------------------------------------|-------------------------------------------------------------|
| Cài trực tiếp (war file/JDK) | Native, không lớp ảo hoá                        | Phải tự cài Java đúng version, dependencies hệ thống        |
| Package manager (apt, brew)  | 1 lệnh `apt install jenkins`                    | Khó kiểm soát version, phụ thuộc OS                         |
| **Docker**                   | **Mỗi máy đều y nhau, dễ xoá đi cài lại**       | Cần Docker Desktop (~vài GB)                                 |
| Cloud (Jenkins on AWS, GCP)  | Không tốn máy local                             | Tốn tiền, lằng nhằng cho học                                 |

Trong khoá này dùng **Docker**, vì:

1. **Mọi học viên có môi trường giống nhau** → ví dụ trong khoá chạy được y nguyên.
2. **Xoá đi cài lại trong 30 giây** → khi nghịch hỏng, không phải uninstall thủ công.
3. **Không cần cài Java, plugin requirements riêng** → Docker image đã đóng gói sẵn.
4. **Sau này dùng cùng Docker để build app trong pipeline** → một công cụ, nhiều mục đích.

Nếu bạn cài Jenkins theo cách khác, **các ví dụ trong khoá có thể không chạy đúng** và sẽ rất khó debug.

---

## Bước 1: Cài Docker Desktop

Docker Desktop là chương trình giúp chạy Docker trên Windows, macOS, Linux.

1. Tải tại: <https://www.docker.com/products/docker-desktop/>
2. Cài như app bình thường.
3. (Khuyến nghị) Tạo tài khoản Docker Hub (free) để pull image nhanh hơn.

### Kiểm tra Docker chạy đúng chưa

Mở terminal và chạy:

```bash
docker run hello-world
```

Nếu thấy output bắt đầu bằng:

```text
Hello from Docker!
This message shows that your installation appears to be working correctly.
...
```

→ Docker đã chạy ngon.

### Vài lưu ý cho macOS / Windows

- **macOS Apple Silicon (M1/M2/M3/M4)**: Docker Desktop có bản ARM riêng. Một số image cũ chỉ build cho x86_64 — Docker Desktop sẽ giả lập (chậm hơn) hoặc báo lỗi `no matching manifest`. Khi gặp, thử thêm `--platform linux/amd64`.
- **Windows**: cần bật WSL 2 (Docker Desktop sẽ hướng dẫn). Nếu máy không có WSL 2 → có tuỳ chọn Hyper-V backend nhưng chậm hơn.
- **Linux**: có thể dùng Docker Engine không qua Desktop (nhẹ hơn), nhưng các lệnh `docker compose up/down` y nhau.

---

## Bước 2: Lấy cấu hình Jenkins-Docker

Tác giả khoá đã chuẩn bị sẵn một repository chứa `Dockerfile` + `docker-compose.yml` để bạn không phải tự viết từ đầu.

```bash
git clone https://github.com/<author>/install-jenkins-docker.git
cd install-jenkins-docker
```

> Nếu không có Git, bạn có thể tải zip từ GitHub → giải nén → `cd` vào thư mục.

Bên trong thư mục thường có 3 file chính:

```text
install-jenkins-docker/
├── Dockerfile               ← Mô tả image Jenkins tuỳ biến (có sẵn vài plugin)
├── docker-compose.yml       ← Mô tả cách khởi động container
└── README.md                ← Hướng dẫn chi tiết + troubleshooting
```

### Hiểu sơ về `Dockerfile`

`Dockerfile` là **công thức** để Docker dựng nên image. Image Jenkins chính thức (`jenkins/jenkins:lts`) là điểm bắt đầu, sau đó có thể `RUN` thêm vài lệnh để cài plugin sẵn. Cụ thể về Dockerfile sẽ học ở Phase 4 — giờ chỉ cần biết "đây là blueprint".

### Hiểu sơ về `docker-compose.yml`

`docker-compose` cho phép định nghĩa **nhiều container chạy cùng nhau** trong một file YAML. Với Jenkins, file này thường định nghĩa:

- Container Jenkins, mở port 8080 (UI) và 50000 (giao tiếp với agent).
- **Volume** để dữ liệu Jenkins (jobs, plugin, build history) được lưu **bên ngoài** container → cài lại container không mất data.
- Mount file Docker socket `/var/run/docker.sock` (cho phép Jenkins chạy Docker bên trong Jenkins — sẽ dùng nhiều ở Phase 2).

---

## Bước 3: Build image & khởi động Jenkins

Trong thư mục `install-jenkins-docker`:

```bash
# 1. Build Docker image (chỉ chạy 1 lần)
docker build -t my-jenkins .

# 2. Khởi động Jenkins
docker compose up -d
```

Giải thích:

- `docker build -t my-jenkins .` — đọc `Dockerfile` trong thư mục hiện tại (`.`) và build thành image tên `my-jenkins`. Lần đầu chạy sẽ mất vài phút vì phải tải base image.
- `docker compose up -d` — đọc `docker-compose.yml` và khởi động container. Cờ `-d` (detached) để chạy nền, không chiếm terminal.

> **Lệnh có thể là `docker-compose` (có gạch) hoặc `docker compose` (không gạch).** Bản Docker Desktop mới dùng dạng `docker compose`. Cả hai đều hoạt động.

Kiểm tra container chạy chưa:

```bash
docker compose ps
```

Output mong đợi:

```text
NAME                IMAGE         STATUS              PORTS
jenkins             my-jenkins    Up X seconds        0.0.0.0:8080->8080/tcp
```

→ Mở browser, truy cập <http://localhost:8080>.

---

## Bước 4: Unlock Jenkins (cấu hình lần đầu)

Lần đầu mở Jenkins, bạn sẽ thấy màn hình **Unlock Jenkins** yêu cầu nhập **initial admin password**.

```text
┌────────────────────────────────────────────────┐
│  Unlock Jenkins                                │
│                                                │
│  Please copy the password from:                │
│  /var/jenkins_home/secrets/initialAdminPassword│
│                                                │
│  Administrator password: [          ]          │
└────────────────────────────────────────────────┘
```

Password này nằm **bên trong container**. Có 2 cách lấy:

### Cách 1: Đọc qua Docker Desktop UI

1. Mở Docker Desktop → tab **Containers**.
2. Click vào container Jenkins → tab **Logs**.
3. Tìm dòng giống:

```text
Jenkins initial setup is required. An admin user has been created and a password generated.
Please use the following password to proceed to installation:

a1b2c3d4e5f6...
```

→ Copy chuỗi password.

### Cách 2: Dùng `docker exec`

```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

- `docker exec <container> <command>` — chạy lệnh **bên trong** container đang chạy.
- `cat` đọc nội dung file.
- Kết quả: chuỗi password hex, copy paste vào ô **Administrator password**.

> Password này **chỉ cần 1 lần** để unlock. Không cần nhớ.

---

## Bước 5: Chọn plugin

Sau khi unlock, Jenkins hỏi bạn muốn cài plugin nào:

```text
┌─────────────────────────────────────────┐
│  Customize Jenkins                      │
│                                         │
│  ○  Install suggested plugins  ← chọn  │
│  ○  Select plugins to install           │
└─────────────────────────────────────────┘
```

Chọn **Install suggested plugins** (vài chục plugin phổ biến: Git, Pipeline, JUnit, Workspace Cleanup…). Đợi 3–5 phút.

> Jenkins về bản chất chỉ là **bộ khung**. Plugin mới là thứ làm cho Jenkins thực sự dùng được. Sau này khi cần tính năng đặc biệt, bạn sẽ vào **Manage Jenkins → Plugins** cài thêm.

---

## Bước 6: Tạo admin user

Tránh dùng default admin với initial password. Tạo user riêng:

```text
Username:   valentin
Password:   ************
Full name:  (optional)
Email:      you@example.com
```

> Email không bị gửi đi đâu — đây là local install. Nhưng nên dùng email thật để sau này quen với Jenkins thật ở công ty.

Cuối cùng Jenkins hỏi **Jenkins URL** — mặc định `http://localhost:8080/`. Để nguyên, click **Save and Finish**.

→ Bạn vào trang dashboard Jenkins:

```text
┌────────────────────────────────────────────────────────┐
│  Jenkins                                  [+ New Item] │
├────────────────────────────────────────────────────────┤
│  Welcome to Jenkins!                                   │
│                                                        │
│  Please create new jobs to get started.                │
│                                                        │
│  → Create a job                                         │
└────────────────────────────────────────────────────────┘
```

---

## Cài plugin **Stage View** (cần cho khoá học)

Jenkins phiên bản mới có **Pipeline Graph View** (bài 8 sẽ nói) nhưng khoá này dùng nhiều **Stage View** — bảng cũ kiểu spreadsheet hiển thị từng stage. Cài thủ công:

1. **Manage Jenkins** → **Plugins** → tab **Available plugins**.
2. Search `Pipeline: Stage View`.
3. Tick → **Install without restart**.
4. Đợi 30 giây.

Sau khi cài, mở 1 pipeline đã chạy → bạn sẽ thấy bảng:

```text
┌───────────┬───────────┬───────────┐
│  Build    │  Test     │  Deploy   │
├───────────┼───────────┼───────────┤
│   2s      │   5s      │   12s     │  ← Build #5
│   1s      │   4s      │   FAILED  │  ← Build #4
│   2s      │   5s      │   11s     │  ← Build #3
└───────────┴───────────┴───────────┘
```

Trực quan hơn rất nhiều khi debug pipeline nhiều stage.

---

## Tắt & khởi động lại Jenkins

Khi không học, tắt Jenkins để máy nhẹ hơn:

```bash
# Trong thư mục install-jenkins-docker:
docker compose down       # Dừng và xoá container (nhưng data vẫn còn trong volume)
```

Mở lại sau:

```bash
docker compose up -d      # Khởi động lại, data nguyên vẹn
```

> `docker compose down` chỉ xoá **container** (process), không xoá **volume** (data). Nếu muốn xoá data → `docker compose down -v`.

Bạn cũng có thể **pause** Docker Desktop hoàn toàn khi không dùng (nút Pause ở góc dưới phải Docker Desktop).

---

## Khắc phục sự cố phổ biến

### Lỗi: port 8080 đã bị chiếm

```text
Error: bind: address already in use
```

→ Có chương trình khác đang chiếm port 8080 (rất hay là Tomcat, một Java app khác). Đổi port mapping trong `docker-compose.yml`:

```yaml
ports:
  - "9090:8080"   # Truy cập qua http://localhost:9090
```

### Lỗi: image không pull được

```text
Error: no matching manifest for linux/arm64/v8
```

→ Bạn đang dùng Mac M-series mà image chỉ có version x86. Thử thêm `platform`:

```yaml
services:
  jenkins:
    image: jenkins/jenkins:lts
    platform: linux/amd64
```

### Lỗi: quên password admin

Vào container đọc lại:

```bash
docker exec jenkins cat /var/jenkins_home/users/<username>/config.xml
```

Hoặc reset bằng cách xoá file `config.xml` của Jenkins (advanced, xem doc chính thức).

---

## Tóm tắt

- Khoá dùng **Docker** để cài Jenkins → ai cũng môi trường y nhau.
- 3 bước chính: cài Docker Desktop → clone repo cấu hình → `docker build` + `docker compose up`.
- Lần đầu mở Jenkins cần **unlock** bằng initial password (trong logs container).
- Chọn **Install suggested plugins** + tạo user riêng.
- Cài thêm plugin **Pipeline: Stage View** cho trải nghiệm trực quan.
- Tắt: `docker compose down`. Mở lại: `docker compose up -d`. Dữ liệu lưu trong volume, không mất khi tắt container.

---

→ [Bài tiếp theo: Jobs, Pipeline và kiến trúc Controller / Agent](03-jobs-va-jenkins-architecture.md)

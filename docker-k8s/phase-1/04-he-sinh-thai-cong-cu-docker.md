# Bài 4: Hệ sinh thái công cụ Docker

## Toàn cảnh

Docker không chỉ là một công cụ đơn lẻ. Đây là cả một hệ sinh thái gồm nhiều thành phần phối hợp với nhau:

```text
┌─────────────────────────────────────────────────┐
│              Docker Ecosystem                    │
│                                                  │
│  ┌─────────────┐    ┌──────────────────────────┐ │
│  │ Docker CLI  │───▶│     Docker Engine        │ │
│  └─────────────┘    │  (Daemon + REST API)     │ │
│                     └──────────────────────────┘ │
│  ┌─────────────┐           ↕                     │
│  │Docker Compose│         Containers              │
│  └─────────────┘                                 │
│  ┌─────────────┐    ┌──────────────────────────┐ │
│  │ Docker Hub  │◀──▶│        Images            │ │
│  └─────────────┘    └──────────────────────────┘ │
│  ┌─────────────┐                                 │
│  │ Kubernetes  │  (phối hợp nhiều máy chủ)       │
│  └─────────────┘                                 │
└─────────────────────────────────────────────────┘
```

---

## 1. Docker Engine

**Docker Engine** là trung tâm của mọi thứ. Đây là thứ bạn thực sự cài khi cài Docker.

Gồm hai phần:
- **Docker Daemon** (`dockerd`): Tiến trình chạy nền, quản lý containers, images, networks và volumes
- **Docker CLI** (`docker`): Giao diện dòng lệnh để bạn giao tiếp với Daemon

```bash
# Bạn gõ lệnh này
docker run nginx

# CLI gửi request đến Daemon
# Daemon thực hiện việc tạo container
```

> Trên Linux, Docker Engine cài trực tiếp. Trên macOS/Windows, Docker Desktop cài Engine bên trong một VM nhỏ.

### CLI và Daemon nói chuyện với nhau bằng cách nào

Chi tiết này nhỏ nhưng giải thích được nhiều thứ về sau:

```text
   docker run nginx
        │
        │  CLI biến lệnh của bạn thành một request HTTP
        ▼
   POST /v1.45/containers/create
        │
        │  gửi qua UNIX SOCKET (một "file" đặc biệt)
        ▼
   /var/run/docker.sock
        │
        ▼
   dockerd (daemon) nhận, tạo container, trả kết quả
```

Nghĩa là **Docker CLI thực chất là một client HTTP**, và daemon là một máy chủ HTTP. Kiểm chứng bằng cách gọi thẳng API, không qua CLI:

```bash
curl --unix-socket /var/run/docker.sock http://localhost/version
```

```text
{"Platform":{"Name":"Docker Engine - Community"},"Version":"27.3.1",...}
```

Ba điều rút ra:

| Điều | Ý nghĩa thực tế |
|---|---|
| CLI và daemon **tách rời** | CLI trên máy bạn điều khiển được daemon ở máy khác (`DOCKER_HOST`) |
| Mọi thứ đi qua **một file socket** | Ai đọc/ghi được file đó là **điều khiển được toàn bộ Docker** |
| Có API chuẩn | Đó là lý do có rất nhiều công cụ (Portainer, Lazydocker, IDE plugin) làm việc với Docker mà không cần CLI |

Dòng giữa là điểm bảo mật quan trọng nhất của Docker, và nó quay lại ở [Phase 19](../phase-19/01-bao-mat-image.md):

```bash
# Đây là lý do KHÔNG bao giờ gắn docker.sock vào container không tin cậy
docker run -v /var/run/docker.sock:/var/run/docker.sock some-image
#           ▲
#   Container này giờ ĐIỀU KHIỂN ĐƯỢC Docker của máy chủ
#   → nó tạo được container khác có quyền root và gắn cả ổ đĩa máy chủ
```

Cách gắn này đôi khi cần thật (công cụ CI, Portainer), nhưng phải coi image đó **đáng tin ngang với quyền quản trị máy**.

---

## 2. Docker Desktop

**Docker Desktop** là ứng dụng GUI cho macOS và Windows. Nó:
- Cài và quản lý Docker Engine
- Cung cấp giao diện đồ hoạ để xem containers, images
- Tích hợp với Docker Extensions
- Cấu hình tài nguyên (RAM, CPU, disk cho Docker)

Khi bạn "start Docker", thực ra bạn đang start Docker Desktop, và nó sẽ start Docker Daemon bên trong.

---

## 3. Docker CLI

Giao diện dòng lệnh là cách chính bạn tương tác với Docker trong khóa học này và trong thực tế.

Các lệnh cơ bản bạn sẽ dùng nhiều nhất:

```bash
docker build       # Build image từ Dockerfile
docker run         # Tạo và chạy container từ image
docker ps          # Liệt kê containers đang chạy
docker stop        # Dừng container
docker rm          # Xóa container
docker images      # Liệt kê images trên máy
docker pull        # Tải image từ registry
docker push        # Đẩy image lên registry
```

---

## 4. Docker Hub

**Docker Hub** (hub.docker.com) là registry công khai — nơi lưu trữ và chia sẻ Docker images.

Tương tự như GitHub cho code, Docker Hub là nơi lưu images.

**Hai loại image trên Docker Hub:**

- **Official images**: Được Docker duy trì chính thức — `node`, `nginx`, `postgres`, `python`, `ubuntu`...
- **Community images**: Do cộng đồng tạo — `username/image-name`

```bash
# Pull image Node.js official
docker pull node:18

# Pull image nginx
docker pull nginx:latest

# Push image của bạn lên Hub (cần đăng nhập)
docker push yourname/myapp:1.0
```

> **Quan trọng:** Trong khóa học, chúng ta sẽ pull nhiều official images từ Docker Hub. Đây là cách nhanh nhất để có môi trường chuẩn.

---

## 5. Docker Compose

**Docker Compose** là công cụ quản lý nhiều containers cùng lúc.

Thay vì chạy từng lệnh `docker run` dài dòng cho mỗi service, bạn định nghĩa tất cả trong file `docker-compose.yml`:

```yaml
# docker-compose.yml
version: '3'
services:
  web:
    image: nginx
    ports:
      - "80:80"
  
  database:
    image: postgres:14
    environment:
      POSTGRES_PASSWORD: secret
  
  api:
    build: ./api
    ports:
      - "3000:3000"
    depends_on:
      - database
```

Rồi chạy tất cả bằng một lệnh:
```bash
docker-compose up
```

> Docker Compose sẽ được học chi tiết trong Section 6 (phase-6). Đây là tool rất quan trọng cho real-world projects.

---

## 6. Kubernetes

**Kubernetes** (K8s) là nền tảng điều phối container (container orchestration) ở quy mô lớn.

Khi bạn có hàng chục, hàng trăm containers cần:
- Tự động restart khi crash
- Scale up/down theo traffic
- Load balancing
- Rolling deployment không downtime
- Chạy trên nhiều server khác nhau

→ Đó là lúc bạn cần Kubernetes.

```text
Docker Compose: quản lý containers trên 1 máy
Kubernetes:     quản lý containers trên nhiều máy (cluster)
```

> Phần Kubernetes sẽ được học từ Section 11 trở đi (phase-11). Trước đó, chúng ta tập trung hoàn toàn vào Docker.

---

## Quan hệ giữa các công cụ

```text
Bạn → Docker CLI ──────────────────▶ Docker Engine (Daemon)
                                           │
                                           ▼
                              ┌─────────────────────┐
                              │    Containers        │
                              │    Images            │
                              │    Networks          │
                              │    Volumes           │
                              └─────────────────────┘
                                           │
                                    ┌──────┴──────┐
                              Docker Hub     Local disk
                           (remote registry)
```

Docker Desktop và Docker Compose chỉ là lớp tiện ích phía trên, đều tương tác với Docker Engine.

---

## Tóm tắt

| Công cụ | Vai trò | Học khi nào |
|---|---|---|
| Docker Engine | Core của Docker | Luôn cần |
| Docker CLI | Giao tiếp với Engine | Từ đầu khóa |
| Docker Desktop | GUI, quản lý Engine | Cài lúc setup |
| Docker Hub | Lưu trữ, chia sẻ images | Section 2+ |
| Docker Compose | Multi-container | Section 6 (phase-6) |
| Kubernetes | Orchestration quy mô lớn | Section 11+ (phase-11) |

---

**Bài kế tiếp** → [Bài 5: Chạy Container Đầu Tiên](05-container-dau-tien.md)

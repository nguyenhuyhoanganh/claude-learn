# Bài 3: Quản lý Containers

## Container Lifecycle

Container có vòng đời rõ ràng:

```
docker run ──▶ RUNNING ──▶ docker stop ──▶ STOPPED ──▶ docker rm ──▶ (xóa)
                  │                              │
                  │          docker start ◀──────┘
                  │
              docker kill (force stop)
```

---

## Liệt kê Containers

```bash
# Chỉ hiện containers đang RUNNING
docker ps

# Hiện TẤT CẢ containers (kể cả đã stop)
docker ps -a

# Hiện tất cả, chỉ lấy ID (dùng để script)
docker ps -a -q
```

Output của `docker ps`:
```
CONTAINER ID   IMAGE        COMMAND              CREATED        STATUS         PORTS                  NAMES
a1b2c3d4e5f6   my-node-app  "node server.js"     2 hours ago    Up 2 hours     0.0.0.0:3000->80/tcp   goalsapp
```

---

## Stop và Start

```bash
# Dừng container (graceful — gửi SIGTERM, chờ process tự dừng)
docker stop <container_name_or_id>

# Force stop (SIGKILL — dừng ngay lập tức)
docker kill <container_name_or_id>

# Restart container đã stop (KHÔNG tạo mới, dùng lại container cũ)
docker start <container_name_or_id>
```

### docker run vs docker start

| Lệnh | Tác dụng | Mode mặc định |
|---|---|---|
| `docker run` | Tạo container **MỚI** từ image và chạy | Attached (blocking terminal) |
| `docker start` | **Khởi động lại** container đã stop | Detached (không block) |

**Khi nào dùng `docker start`?**

Khi code và image không thay đổi, không cần tạo container mới. Ví dụ: khởi động lại sau khi tắt máy.

---

## Attached vs Detached Mode

**Attached**: Terminal bị block, bạn thấy output từ container theo thời gian thực.

**Detached**: Container chạy nền, terminal tự do, không thấy output.

```bash
# docker run: mặc định attached
docker run -p 3000:80 my-node-app
# ⬆ Terminal bị block, Ctrl+C để stop container

# Chạy detached bằng -d flag
docker run -d -p 3000:80 my-node-app
# ⬆ Trả về container ID ngay, terminal tự do

# docker start: mặc định detached
docker start goalsapp

# Khởi động lại trong attached mode
docker start -a goalsapp
```

---

## Xem Logs

Khi container chạy detached và bạn muốn xem output:

```bash
# Xem logs đã qua (lịch sử)
docker logs <container_name>

# Xem logs và tiếp tục theo dõi realtime (-f = follow)
docker logs -f <container_name>

# Xem logs với timestamp
docker logs -t <container_name>

# Xem 50 dòng cuối
docker logs --tail 50 <container_name>
```

---

## Attach vào Container đang chạy

```bash
# Attach vào container đang chạy để xem output realtime
docker attach <container_name>

# Detach mà không stop: Ctrl+P rồi Ctrl+Q
```

---

## Interactive Mode (-it)

Dùng khi ứng dụng cần nhận input từ người dùng (không chỉ là web server).

```bash
# -i: giữ stdin mở (có thể nhập input)
# -t: tạo pseudo-TTY (terminal)
docker run -it <image>
```

### Ví dụ: Dockerfile cho Python app cần input

```dockerfile
FROM python:3
WORKDIR /app
COPY . .
CMD ["python", "rng.py"]
```

```bash
# Chạy WITHOUT -it → lỗi vì app cần input
docker run my-python-app

# Chạy WITH -it → hoạt động bình thường
docker run -it my-python-app
# Giờ bạn có thể nhập giá trị min và max

# Restart interactive container
docker start -a -i <container_name>
```

---

## Xóa Containers

```bash
# Xóa một container (phải stop trước)
docker rm <container_name>

# Xóa nhiều containers cùng lúc
docker rm container1 container2 container3

# Force remove (kể cả đang running)
docker rm -f <container_name>

# Xóa tất cả containers đã stop
docker container prune
```

> **Lưu ý:** Không thể xóa container đang running (trừ khi dùng `-f`)

### Tự động xóa khi stop: `--rm`

```bash
# Container tự động bị xóa khi stop
docker run --rm -p 3000:80 my-node-app
```

`--rm` rất hữu ích khi bạn biết sẽ không restart container (ví dụ: mỗi lần code thay đổi phải build lại image anyway).

---

## Chạy lệnh trong Container đang chạy

```bash
# Chạy lệnh một lần trong container
docker exec <container_name> <command>
docker exec goalsapp ls /app

# Mở shell interactive trong container đang chạy
docker exec -it <container_name> /bin/sh
docker exec -it <container_name> /bin/bash  # nếu container có bash

# Kiểm tra processes trong container
docker exec goalsapp ps aux

# Xem biến môi trường trong container
docker exec goalsapp env
```

> `docker exec` khác với `-it` khi run: đây là chạy thêm lệnh vào container **đang running**, không phải thay thế CMD.

---

## Copy Files giữa Host và Container

```bash
# Copy từ host vào container đang chạy
docker cp ./localfile.txt goalsapp:/app/localfile.txt
docker cp ./dummy/. goalsapp:/test    # copy folder

# Copy từ container ra host
docker cp goalsapp:/app/logs.txt ./logs.txt
docker cp goalsapp:/test/. ./dummy    # copy folder ra
```

**Use case thực tế:**
- Copy log files ra khỏi container để phân tích
- Copy config file vào container mà không rebuild

> **Lưu ý:** Copy code vào container đang chạy là bad practice. Dùng Bind Mounts (phase-3) thay thế.

---

## Tóm tắt lệnh Container Management

```bash
# Lifecycle
docker run [options] <image>     # tạo & chạy mới
docker start <name>              # restart container cũ
docker stop <name>               # dừng graceful
docker kill <name>               # dừng ngay lập tức
docker rm <name>                 # xóa
docker container prune           # xóa tất cả stopped

# Monitoring
docker ps                        # running containers
docker ps -a                     # tất cả containers
docker logs <name>               # xem logs
docker logs -f <name>            # follow logs
docker attach <name>             # attach vào running

# Interaction
docker exec -it <name> /bin/sh   # mở shell trong container
docker cp <src> <dest>           # copy files

# Flags quan trọng cho docker run
-d                               # detached mode
-it                              # interactive + tty
--rm                             # auto-remove khi stop
--name <name>                    # đặt tên container
-p <host>:<container>            # port mapping
```

---

**Tiếp theo:** Naming & Tagging Images, và chia sẻ Images qua Docker Hub →

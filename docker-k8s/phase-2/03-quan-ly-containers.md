# Bài 3: Quản lý Containers

## Container Lifecycle

Container có vòng đời rõ ràng:

```text
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
```text
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

## `docker stop` thật sự làm gì — và vì sao nó mất 10 giây

Đây là chi tiết giải thích được nhiều hành vi khó hiểu:

```text
   docker stop <container>
        │
        ▼
   BƯỚC 1  Gửi SIGTERM cho tiến trình PID 1 trong container
           → "làm ơn dừng lại, dọn dẹp đi"
        │
        │  chờ tối đa 10 giây (mặc định)
        ▼
   BƯỚC 2  Nếu vẫn chưa thoát → gửi SIGKILL
           → giết cứng, KHÔNG kịp dọn gì cả
```

So sánh với hai lệnh liên quan:

| Lệnh | Tín hiệu | Có ân hạn không |
|---|---|---|
| `docker stop` | `SIGTERM` rồi `SIGKILL` | **Có**, mặc định 10 giây |
| `docker kill` | `SIGKILL` ngay | **Không** — mất dữ liệu chưa ghi |
| `docker restart` | Như `stop` rồi `start` | Có |

```bash
# Cho ứng dụng nhiều thời gian hơn để đóng sạch
docker stop -t 60 my-app
```

> **Nếu `docker stop` của bạn LUÔN mất đúng 10 giây**, đó gần như chắc chắn là dấu hiệu ứng dụng **không nhận được `SIGTERM`** — thường vì `CMD` viết ở dạng chuỗi. Xem [bài 5](05-dockerfile-best-practices.md), phần dạng mảng và dạng chuỗi.

---

## `attach` khác `exec` chỗ nào

Hai lệnh này hay bị dùng nhầm cho nhau:

```text
   docker attach <container>
   → NỐI VÀO tiến trình chính đang chạy (PID 1)
   → Bạn thấy đúng thứ tiến trình đó đang in ra
   → Ctrl+C sẽ GIẾT tiến trình đó → container dừng      ⚠

   docker exec -it <container> sh
   → TẠO một tiến trình MỚI bên trong container
   → Thoát ra (exit) chỉ kết thúc tiến trình mới đó
   → Container VẪN CHẠY bình thường                      ✓
```

| Muốn làm gì | Dùng |
|---|---|
| Xem ứng dụng đang in gì | `docker logs -f` (an toàn nhất) |
| Vào bên trong xem file, chạy lệnh | **`docker exec -it`** |
| Tương tác với chính tiến trình chính (ứng dụng hỏi nhập liệu) | `docker attach` |

Nếu lỡ `attach` và muốn thoát mà **không giết container**: nhấn `Ctrl+P` rồi `Ctrl+Q`.

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| `Ctrl+C` khi đang `attach` | **Container dừng** ngoài ý muốn | Dùng `docker logs -f`, hoặc thoát bằng `Ctrl+P Ctrl+Q` |
| `docker stop` luôn mất 10 giây | Ứng dụng không nhận `SIGTERM` | Đổi `CMD` sang dạng mảng |
| `docker logs` rỗng dù ứng dụng có ghi log | Ứng dụng ghi vào **file** thay vì stdout | Cấu hình ứng dụng ghi ra stdout |
| `docker exec` báo `bash: not found` | Image tối giản không có bash | Dùng `/bin/sh` |
| Quên `-it` khi chạy lệnh tương tác | Lệnh treo hoặc thoát ngay | `-i` cho nhập liệu, `-t` cho giao diện dòng lệnh |
| `docker rm` container đang chạy | `You cannot remove a running container` | `docker stop` trước, hoặc `docker rm -f` |
| Sửa file bằng `docker exec` rồi coi là xong | Xoá container là mất hết | Sửa vào Dockerfile hoặc dùng volume |
| Dùng `docker kill` cho tiện | **Mất dữ liệu chưa ghi**, transaction dở dang | Dùng `docker stop` |
| Tưởng `docker cp` cần container đang chạy | — | `docker cp` **chạy được cả với container đã dừng** |
| Container dừng nhưng vẫn chiếm đĩa | Máy hết dung lượng dần | `docker ps -a` để thấy, `docker container prune` để dọn |

---

## Tóm tắt bài 3

- Vòng đời: `created` → `running` → `exited` → xoá. **`docker run` tạo container MỚI, `docker start` chạy lại container CŨ.**
- `docker ps` chỉ thấy container **đang chạy**; `docker ps -a` thấy tất cả kèm **mã thoát** — thứ cho biết ngay chuyện gì đã xảy ra.
- **`docker stop` gửi `SIGTERM`, chờ 10 giây, rồi `SIGKILL`.** Luôn mất đúng 10 giây nghĩa là ứng dụng không nhận được tín hiệu. `docker kill` bỏ qua ân hạn — **mất dữ liệu**.
- **`attach` nối vào tiến trình chính** (Ctrl+C sẽ giết container); **`exec` tạo tiến trình mới** (thoát ra container vẫn chạy). Muốn chỉ xem log thì dùng `docker logs -f` — an toàn nhất.
- `docker logs` **chỉ thấy stdout/stderr**. Ứng dụng ghi vào file thì không thấy gì.
- `--rm` tự xoá container khi dừng — rất hợp cho lệnh chạy một lần.
- Container đã dừng **vẫn chiếm đĩa**. Dọn định kỳ bằng `docker container prune`.

---

**Bài kế tiếp** → [Bài 4: Đặt tên, Tag và Chia sẻ Images](04-naming-tagging-va-chia-se-images.md)

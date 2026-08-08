# Bài 5: Chạy Container Đầu Tiên

## Chuẩn bị

Trước khi bắt đầu, hãy đảm bảo:
1. Docker đã được cài đặt (xem bài 3)
2. Docker đang chạy (thấy icon Docker hoặc kiểm tra bằng `docker info`)

---

## Image và Container — Hai khái niệm cốt lõi

Trước khi chạy container, cần hiểu mối quan hệ giữa **Image** và **Container**:

```text
Image                    Container
──────────               ──────────
"Bản thiết kế"           "Ngôi nhà thực tế"
File tĩnh, chỉ đọc       Đang chạy, có trạng thái
Lưu trên disk            Chạy trong memory
Dùng để tạo container    Tạo từ image
```

- **Image**: Là template chứa mọi thứ cần thiết (OS layer, runtime, code, config...)
- **Container**: Là instance đang chạy được tạo từ image

Một image có thể tạo ra **nhiều container** chạy đồng thời.

```text
Image: node:18
    │
    ├──▶ Container 1 (chạy app A)
    ├──▶ Container 2 (chạy app B)
    └──▶ Container 3 (testing)
```

---

## Ví dụ thực tế: Dockerize ứng dụng Node.js

Giả sử chúng ta có ứng dụng Node.js đơn giản:

### app.mjs
```javascript
import express from 'express';
import { createConnection } from './db.mjs';

const app = express();

// Simulate DB connection (requires Node.js 14.3+ for top-level await)
await createConnection();

app.get('/', (req, res) => {
  res.send('<h1>Hi there!</h1>');
});

app.listen(3000);
```

### package.json
```json
{
  "name": "my-app",
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

**Không có Docker:** Phải cài Node.js 14.3+, chạy `npm install`, rồi `node app.mjs`

**Với Docker:** Chỉ cần Dockerfile và hai lệnh

---

## Dockerfile — Bản thiết kế của Image

**Dockerfile** là file văn bản mô tả cách build image. Mỗi dòng là một instruction.

```dockerfile
# Bắt đầu từ image Node.js official, phiên bản 14
FROM node:14

# Đặt thư mục làm việc bên trong container
WORKDIR /app

# Copy package.json vào container trước (để cache layer)
COPY package.json .

# Cài dependencies
RUN npm install

# Copy toàn bộ source code
COPY . .

# Khai báo port mà app sẽ lắng nghe
EXPOSE 3000

# Lệnh chạy khi container khởi động
CMD ["node", "app.mjs"]
```

### Giải thích từng instruction

| Instruction | Ý nghĩa |
|---|---|
| `FROM` | Base image để bắt đầu. Mọi Dockerfile đều phải có |
| `WORKDIR` | Đặt thư mục làm việc trong container |
| `COPY` | Copy file từ host vào container |
| `RUN` | Chạy lệnh trong quá trình **build** image |
| `EXPOSE` | Khai báo port (chỉ là documentation, không tự mở port) |
| `CMD` | Lệnh chạy khi **container khởi động** |

---

## Build Image

```bash
# Build image từ Dockerfile trong thư mục hiện tại
# -t: đặt tên (tag) cho image
docker build -t my-node-app .

# Output:
# [1/5] FROM node:14
# [2/5] WORKDIR /app
# [3/5] COPY package.json .
# [4/5] RUN npm install
# [5/5] COPY . .
# Successfully built abc123def456
# Successfully tagged my-node-app:latest
```

**Dấu `.` ở cuối** là build context — thư mục Docker sẽ dùng để tìm Dockerfile và các file cần copy.

### Đi từng bước: build thật sự làm gì

Output rút gọn ở trên che mất phần thú vị nhất. Đây là chuyện xảy ra theo từng dòng Dockerfile:

```text
   BƯỚC 1  FROM node:14
   ───────────────────────────────────────────────────────────
   Docker tìm image node:14 trên máy.
   Không có → tải từ Docker Hub (~340 MB).
   Kết quả: một LỚP (layer) nền, chỉ đọc.

        ┌──────────────────────────┐
        │ node:14  (chỉ đọc)       │  ← lớp 1
        └──────────────────────────┘

   BƯỚC 2  WORKDIR /app
   ───────────────────────────────────────────────────────────
   Tạo thư mục /app và đặt làm thư mục làm việc.
   Kết quả: thêm một lớp mỏng (vài byte).

   BƯỚC 3  COPY package.json .
   ───────────────────────────────────────────────────────────
   Chép ĐÚNG MỘT FILE vào /app.
        ┌──────────────────────────┐
        │ package.json             │  ← lớp 3
        ├──────────────────────────┤
        │ /app                     │  ← lớp 2
        ├──────────────────────────┤
        │ node:14                  │  ← lớp 1
        └──────────────────────────┘

   BƯỚC 4  RUN npm install
   ───────────────────────────────────────────────────────────
   CHẠY lệnh ngay lúc build, trong một container tạm.
   Sinh ra thư mục node_modules (~50 MB).
   Kết quả: một lớp nặng chứa node_modules.

   BƯỚC 5  COPY . .
   ───────────────────────────────────────────────────────────
   Chép TOÀN BỘ source code vào /app.

   BƯỚC 6  EXPOSE 3000 + CMD [...]
   ───────────────────────────────────────────────────────────
   KHÔNG chạy gì cả. Chỉ GHI VÀO SIÊU DỮ LIỆU của image:
   "container tạo từ image này thì chạy lệnh node app.mjs".
```

Hai điều rút ra ngay, và cả hai đều quan trọng về sau:

**Một — mỗi dòng Dockerfile tạo ra một lớp, và các lớp xếp chồng lên nhau.** Xem tận mắt:

```bash
docker history my-node-app
```

```text
IMAGE          CREATED BY                                      SIZE
abc123def456   CMD ["node" "app.mjs"]                          0B
<missing>      EXPOSE map[3000/tcp:{}]                         0B
<missing>      COPY . . # buildkit                             12.4kB
<missing>      RUN npm install # buildkit                      51.2MB     ← nặng nhất
<missing>      COPY package.json . # buildkit                  184B
<missing>      WORKDIR /app                                    0B
<missing>      /bin/sh -c #(nop) CMD ["node"]                  0B
<missing>      ...                                             340MB      ← base image
```

**Hai — vì sao `COPY package.json` phải nằm TRƯỚC `COPY . .`?** Đây là câu hỏi mọi người mới đều thắc mắc. Thử build lại sau khi sửa một dòng code:

```bash
docker build -t my-node-app .
```

```text
 => CACHED [2/5] WORKDIR /app                        ← dùng lại
 => CACHED [3/5] COPY package.json .                 ← dùng lại, vì file KHÔNG đổi
 => CACHED [4/5] RUN npm install                     ← DÙNG LẠI → tiết kiệm 40 giây
 => [5/5] COPY . .                                   ← chạy lại, vì code ĐÃ đổi
```

Nếu viết `COPY . .` trước `RUN npm install`, thì **sửa một dấu chấm phẩy trong code cũng làm `npm install` chạy lại từ đầu**. Với project thật, đó là chênh lệch giữa build 3 giây và build 3 phút.

Cơ chế bộ nhớ đệm theo lớp này được đào sâu ở [Phase 2 bài 2](../phase-2/02-image-layers-va-caching.md).

---

## Chạy Container

```bash
# Chạy container từ image
# -p: map port host:container
# --name: đặt tên cho container
docker run -p 3000:3000 --name my-app my-node-app

# Truy cập: http://localhost:3000
```

### Giải thích `-p 3000:3000`

```text
-p <host_port>:<container_port>
-p 3000:3000

localhost:3000 ──────▶ container_port:3000
```

Container có network riêng, không tự expose port ra ngoài. Flag `-p` tạo "cổng nối" từ máy host vào container.

Bạn có thể dùng port khác nhau:
```bash
# Truy cập qua localhost:8080, container dùng port 3000
docker run -p 8080:3000 my-node-app
```

---

## Quản lý Containers

```bash
# Xem containers đang chạy
docker ps

# Xem tất cả containers (kể cả đã dừng)
docker ps -a

# Dừng container (graceful shutdown)
docker stop my-app

# Xóa container (phải dừng trước)
docker rm my-app

# Dừng và xóa cùng lúc
docker rm -f my-app

# Chạy container ở background (detached mode)
docker run -d -p 3000:3000 --name my-app my-node-app
```

### Chế độ chạy: Attached vs Detached

```bash
# Attached (mặc định): container chạy ở foreground, ctrl+C để dừng
docker run my-node-app

# Detached (-d): container chạy ở background
docker run -d my-node-app
```

---

## Xem logs và tương tác với Container

```bash
# Xem logs của container
docker logs my-app

# Xem logs realtime (follow)
docker logs -f my-app

# Chạy lệnh trong container đang chạy
docker exec -it my-app /bin/sh

# Hoặc bash nếu có
docker exec -it my-app /bin/bash
```

**`-it` flag:** `-i` (interactive) + `-t` (tty) — mở terminal tương tác trong container

---

## Quản lý Images

```bash
# Xem tất cả images trên máy
docker images

# Xóa image
docker rmi my-node-app

# Xóa tất cả images không dùng
docker image prune

# Pull image từ Docker Hub
docker pull node:18
```

---

## Workflow thực tế

```text
1. Viết code
        │
        ▼
2. Tạo/cập nhật Dockerfile
        │
        ▼
3. docker build -t myapp .
        │
        ▼
4. docker run -p 3000:3000 myapp
        │
        ▼
5. Test ứng dụng tại localhost:3000
        │
        ▼
6. Nếu cần sửa: quay lại bước 1
```

---

## Hello World với Docker

Test Docker cài thành công:

```bash
docker run hello-world
```

Output:
```text
Hello from Docker!
This message shows that your installation appears to be working correctly.
...
```

Docker đã:
1. Pull image `hello-world` từ Docker Hub (vì chưa có trên máy)
2. Tạo container từ image đó
3. Chạy container — in ra thông báo
4. Container tự dừng sau khi xong

---

## Vòng đời container — hiểu để hết bối rối

Phần lớn nhầm lẫn của người mới đến từ việc không phân biệt được **tạo**, **chạy**, **dừng**, **xoá**. Đây là toàn bộ vòng đời:

```text
                 docker run
                     │
       ┌─────────────┴──────────────┐
       │  = docker create + start   │
       ▼                            ▼
   ┌────────┐  start   ┌─────────┐  stop   ┌─────────┐   rm   ┌──────┐
   │Created │ ───────► │ Running │ ──────► │ Exited  │ ─────► │ Xoá  │
   └────────┘          └─────────┘         └─────────┘        └──────┘
                            │                   ▲
                            │      start        │
                            └───────────────────┘
                            (container CŨ chạy lại, GIỮ NGUYÊN dữ liệu)
```

Điểm mấu chốt mà rất nhiều người vấp:

> **`docker run` LUÔN tạo một container MỚI. `docker start` chạy lại container CŨ.**

Xem bằng thí nghiệm:

```bash
docker run --name thu-nghiem alpine sh -c "echo xin-chao > /tmp/note.txt; cat /tmp/note.txt"
```

```text
xin-chao
```

```bash
# Chạy lại container CŨ → file vẫn còn
docker start -a thu-nghiem
```

```text
xin-chao
```

```bash
# Nhưng docker run lần nữa → LỖI, vì tên đã bị dùng
docker run --name thu-nghiem alpine sh -c "cat /tmp/note.txt"
```

```text
docker: Error response from daemon: Conflict. The container name
"/thu-nghiem" is already in use by container "a3f2b8c1...".
```

Đây là lỗi số một của người mới. Ba cách xử lý:

```bash
docker rm thu-nghiem                 # xoá container cũ rồi run lại
docker start -a thu-nghiem           # hoặc chạy lại chính nó
docker run --rm alpine ...           # hoặc dùng --rm để tự xoá sau khi xong
```

### Vì sao `docker ps` không thấy container vừa chạy

```bash
docker run alpine echo hello
docker ps
```

```text
CONTAINER ID   IMAGE   COMMAND   STATUS   PORTS   NAMES
(rỗng)
```

`docker ps` chỉ liệt kê container **đang chạy**. Container trên đã thoát ngay sau khi in `hello`.

```bash
docker ps -a
```

```text
CONTAINER ID   IMAGE    COMMAND        STATUS                     NAMES
7f3a2b1c9d4e   alpine   "echo hello"   Exited (0) 5 seconds ago   nifty_bell
                                        ▲
                              Exited (0) = thoát BÌNH THƯỜNG
```

**Mã trong ngoặc là mã thoát**, và nó cho biết ngay chuyện gì đã xảy ra:

| Trạng thái | Nghĩa |
|---|---|
| `Exited (0)` | Chạy xong, thoát bình thường |
| `Exited (1)` | Ứng dụng lỗi — đọc `docker logs` |
| `Exited (127)` | **Không tìm thấy lệnh** — sai đường dẫn trong `CMD` |
| `Exited (137)` | Bị giết — thường là hết bộ nhớ, hoặc `docker kill` |
| `Exited (143)` | Nhận tín hiệu dừng bình thường (`docker stop`) |

> **Điểm cốt lõi**: container **sống đúng bằng vòng đời của tiến trình chính trong nó**. Tiến trình đó kết thúc là container dừng. Đây là lý do `docker run alpine` (không có lệnh gì để chạy mãi) thoát ngay lập tức — chứ không phải container hỏng.

---

## Tóm tắt lệnh cơ bản

```bash
# Build
docker build -t <name> .

# Run
docker run -p <host>:<container> --name <name> <image>
docker run -d -p <host>:<container> <image>   # background

# Manage
docker ps            # containers đang chạy
docker ps -a         # tất cả containers
docker stop <name>   # dừng
docker rm <name>     # xóa
docker logs <name>   # xem logs

# Images
docker images        # liệt kê images
docker pull <image>  # tải từ Hub
docker rmi <image>   # xóa image
```

---

## Bẫy thường gặp

| Bẫy | Triệu chứng | Cách xử lý |
|---|---|---|
| Chạy `docker run` nhiều lần với cùng `--name` | `Conflict. The container name is already in use` | `docker rm <tên>`, hoặc `docker start`, hoặc dùng `--rm` |
| **Sửa code xong không thấy đổi gì** | Trang web vẫn nội dung cũ | Code đã nằm **trong image** từ lúc build. Phải `docker build` lại rồi `docker run` container mới. (Muốn thấy ngay thì cần bind mount — [Phase 3 bài 3](../phase-3/03-bind-mounts-va-dev-workflow.md)) |
| Tưởng `EXPOSE 3000` là mở cổng | Không truy cập được `localhost:3000` | `EXPOSE` chỉ là **ghi chú**. Cổng thật mở bằng `-p 3000:3000` |
| Nhầm thứ tự `-p` | Truy cập sai cổng | Luôn là `-p <cổng máy thật>:<cổng container>` |
| `port is already allocated` | Container cũ vẫn giữ cổng | `docker ps` tìm container đang chiếm, `docker rm -f` nó |
| Quên `-d`, đóng terminal là container chết | Ứng dụng dừng khi tắt cửa sổ | Dùng `docker run -d` |
| `docker rm` container đang chạy | `You cannot remove a running container` | `docker stop` trước, hoặc `docker rm -f` |
| Container `Exited (0)` ngay lập tức | `docker ps` rỗng | Bình thường — tiến trình chính đã xong. Container **không phải máy ảo luôn bật** |
| `docker exec` báo `bash: not found` | Image tối giản (alpine) không có bash | Dùng `/bin/sh` thay vì `/bin/bash` |
| Container đầy đĩa sau vài tuần dùng | Máy hết dung lượng | `docker system df` để xem, `docker system prune` để dọn |
| Sửa file bên trong container bằng `exec` rồi tưởng đã xong | Xoá container là mất hết | Sửa vào Dockerfile hoặc dùng volume |

Hai dòng đáng nhấn thêm.

**"Sửa code không thấy đổi"** là hiểu nhầm phổ biến nhất khi mới học. Nó đến từ việc quên rằng `COPY . .` xảy ra lúc **build**, không phải lúc **chạy**:

```text
   docker build  →  chụp ảnh code TẠI THỜI ĐIỂM ĐÓ, đóng vào image
   docker run    →  chạy đúng ảnh chụp đó

   Sửa code sau khi build = sửa bản gốc, KHÔNG sửa ảnh chụp
   → phải build lại
```

**Dọn dẹp định kỳ** — Docker không tự xoá gì cả:

```bash
docker system df
```

```text
TYPE            TOTAL     ACTIVE    SIZE      RECLAIMABLE
Images          47        3         12.8GB    11.2GB (87%)
Containers      23        1         1.1GB     1.09GB (98%)
Local Volumes   19        2         3.4GB     3.2GB (94%)
Build Cache     312       0         8.7GB     8.7GB
```

```bash
docker system prune              # xoá container dừng, mạng thừa, cache build
docker system prune -a --volumes # xoá cả image không dùng VÀ volume — CẨN THẬN
```

> Cờ `--volumes` **xoá luôn dữ liệu** trong các volume không được container nào dùng. Nếu database local của bạn đang nằm trong một volume mà container đã bị xoá, lệnh này xoá sạch dữ liệu đó. Chạy `docker volume ls` xem trước.

---

## Tóm tắt bài 5

- **Image là bản thiết kế (tĩnh), container là thứ đang chạy (động).** Một image tạo được nhiều container.
- Dockerfile mô tả cách build image. `FROM` bắt buộc phải có; `RUN` chạy lúc **build**; `CMD` chạy lúc **container khởi động**.
- **Mỗi dòng Dockerfile tạo một lớp**, xem được bằng `docker history`. Đó là lý do phải đặt **`COPY package.json` trước `RUN npm install`, và `COPY . .` sau cùng** — để sửa code không làm mất bộ nhớ đệm của bước cài thư viện.
- **`EXPOSE` không mở cổng** — nó chỉ là ghi chú. Cổng thật mở bằng `-p <cổng máy thật>:<cổng container>`.
- **`docker run` luôn tạo container MỚI; `docker start` chạy lại container CŨ.** Trùng `--name` là lỗi số một của người mới.
- **Container sống đúng bằng vòng đời tiến trình chính trong nó.** Tiến trình xong là container `Exited` — đó là hành vi đúng, không phải hỏng. Đọc **mã thoát** trong `docker ps -a` để biết chuyện gì đã xảy ra (`0` xong bình thường, `127` không tìm thấy lệnh, `137` bị giết).
- **Sửa code sau khi build thì không có tác dụng** — code đã nằm trong image. Phải build lại, hoặc dùng bind mount ở [Phase 3](../phase-3/03-bind-mounts-va-dev-workflow.md).
- Docker **không tự dọn** gì cả. Kiểm tra bằng `docker system df`, dọn bằng `docker system prune` — nhưng cẩn thận với `--volumes` vì nó **xoá cả dữ liệu**.

---

**Bài kế tiếp** → [Bài 6: Lộ Trình Học Docker & Kubernetes](06-lo-trinh-hoc.md)

# Bài 2: Các Cách Chạy Lệnh trong Containers

## Cách 1: `docker exec` — Lệnh thêm trong container đang chạy

```bash
# Container đã đang chạy
docker run -d -it --name mynode node

# Chạy thêm lệnh trong container đó (không interrupt main process)
docker exec mynode npm --version

# Cần interactive mode cho lệnh cần input
docker exec -it mynode npm init
```

**`docker exec` dùng khi nào:**
- Debug: đọc logs, xem files trong container đang chạy
- Admin tasks: không muốn stop container chính

---

## Cách 2: Override Default Command — Thêm lệnh sau image name

Cú pháp:
```bash
docker run [OPTIONS] IMAGE [COMMAND]
#                           ↑
#                    Command này ghi đè CMD trong Dockerfile
```

### Ví dụ

```bash
# Image node — default command: chạy REPL (node interactive mode)
docker run -it node
# → Vào node REPL, gõ JavaScript

# Override: chạy npm init thay vì REPL
docker run -it node npm init
# → Chạy npm init, hỏi các câu hỏi, xong → dừng container

# Override với bind mount để kết quả xuất hiện trên host
docker run -it \
  -v $(pwd):/app \
  node npm init
# → package.json được tạo trong /app trong container
# → Bind mount → package.json xuất hiện trên host machine
```

### CMD bị ghi đè hoàn toàn

```text
Dockerfile:  CMD ["node"]           ← Default: chạy node REPL
docker run node npm init            ← Override: chạy npm init
Kết quả:     node REPL bị bỏ qua, npm init chạy
```

---

## So sánh: `exec` vs Override

| | `docker exec` | Override CMD |
|---|---|---|
| Container state | Phải đang chạy | Khởi động mới |
| Main process | Vẫn chạy | Không có |
| Khi nào dùng | Debug container đang chạy | Utility task |

---

## Xây dựng Utility Image cơ bản

Dockerfile đơn giản nhất cho utility container:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Không có CMD — người dùng truyền lệnh khi run
```

```bash
# Build
docker build -t node-util .

# Run với bất kỳ lệnh nào
docker run -it -v $(pwd):/app node-util npm init
docker run -it -v $(pwd):/app node-util npm install express
docker run -it -v $(pwd):/app node-util node --version
```

**Linh hoạt nhưng thiếu giới hạn** — ai cũng có thể chạy bất kỳ lệnh gì, kể cả `rm -rf /app`.

→ Giải pháp: dùng `ENTRYPOINT` để giới hạn.

---

## Ba cờ hay quên khi chạy lệnh trong container

```bash
docker run -it --rm -u $(id -u):$(id -g) -v $(pwd):/app -w /app node:18 npm init
#          ▲▲▲ ▲▲▲▲ ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲                        ▲▲▲▲▲▲▲
```

| Cờ | Nếu thiếu thì sao |
|---|---|
| `-it` | Lệnh hỏi tương tác (`npm init`) sẽ **treo hoặc bỏ qua mọi câu hỏi** |
| **`--rm`** | Container dừng **tích tụ lại mãi mãi** — chạy 50 lệnh là 50 container rác |
| `-w /app` | Lệnh chạy ở thư mục gốc `/`, không phải thư mục dự án → tạo file sai chỗ |
| `-u $(id -u):$(id -g)` | File tạo ra thuộc **root** trên Linux |

Kiểm tra xem mình đã tích tụ bao nhiêu rác:

```bash
docker ps -a --filter "status=exited" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | head
docker container prune
```

### Đặt bí danh cho gọn

Gõ dòng lệnh dài mỗi lần là lý do chính khiến người ta bỏ kỹ thuật này. Chữa bằng bí danh:

```bash
# Thêm vào ~/.zshrc hoặc ~/.bashrc
dnode() {
  docker run -it --rm \
    -u "$(id -u):$(id -g)" \
    -v "$(pwd)":/app -w /app \
    node:18 "$@"
}
```

```bash
dnode npm init -y
dnode npm install express
dnode node --version
```

Giờ nó gõ gần bằng lệnh gốc, mà vẫn không cài Node lên máy.

---

## Bẫy thường gặp

| Bẫy | Hậu quả | Cách xử lý |
|---|---|---|
| Quên `--rm` | Hàng chục container rác chiếm đĩa | Luôn có `--rm` cho lệnh chạy một lần |
| Quên `-w` | File tạo ra ở `/` thay vì thư mục dự án | Thêm `-w /app`, hoặc `WORKDIR` trong Dockerfile |
| Quên `-it` với lệnh hỏi tương tác | Lệnh treo, hoặc nhận toàn giá trị mặc định | `-it` |
| Dùng `docker exec` cho container **đã dừng** | `container is not running` | `exec` chỉ chạy với container **đang chạy**. Dùng `docker run` |
| Ghi đè `CMD` mà quên `ENTRYPOINT` vẫn còn | Lệnh bị nối vào sau ENTRYPOINT, ra kết quả lạ | Dùng `--entrypoint` để ghi đè hẳn |
| Chạy lệnh phá hoại vì không giới hạn | Xoá nhầm dữ liệu trên máy thật qua bind mount | Dùng `ENTRYPOINT` giới hạn phạm vi ([bài 3](03-entrypoint-va-bind-mounts.md)) |

---

## Tóm tắt bài 2

- Hai cách chạy lệnh: **`docker exec`** (vào container **đang chạy**) và **ghi đè `CMD`** khi `docker run` (tạo container mới).
- Ghi đè `CMD` **thay thế hoàn toàn** lệnh mặc định của image.
- Bốn cờ cần có cho lệnh tiện ích: **`-it`** (tương tác), **`--rm`** (không để rác), **`-w`** (đúng thư mục), **`-u`** (đúng chủ sở hữu file trên Linux).
- Dòng lệnh dài là lý do chính khiến người ta bỏ kỹ thuật này — **đặt bí danh** trong `~/.zshrc` để gõ gần bằng lệnh gốc.
- Cách này **linh hoạt nhưng không có giới hạn**: ai cũng chạy được lệnh bất kỳ, kể cả lệnh phá hoại qua bind mount. `ENTRYPOINT` ở bài sau giải quyết điều đó.

---

**Bài kế tiếp** → [Bài 3: ENTRYPOINT và Bind Mounts](03-entrypoint-va-bind-mounts.md)
